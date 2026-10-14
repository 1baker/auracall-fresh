import type {
	ProviderInteractionAdmission,
	ProviderInteractionLedger,
	ProviderInteractionPolicy,
	ProviderWarningClassification,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	type BrowserMutationAuditSink,
	createInMemoryBrowserMutationLog,
} from "../../packages/browser-service/src/service/mutationDispatcher.js";
import { createProviderTrafficGovernor } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
	TabLeaseScope,
	TabLeaseWorkload,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { probeChatgptRateLimitWarning } from "./chatgptProviderTraffic.js";
import { recordChatgptRateLimitDetection } from "./chatgptRateLimitGuard.js";
import type { PromptInput, PromptResult } from "./llmService/types.js";
import {
	assertChatgptLeasedPromptResult,
	buildChatgptLeasedPromptOptions,
	type ChatgptLeasedPromptRunner,
} from "./providers/chatgptTabAffinity.js";
import type { BrowserProviderListOptions } from "./providers/types.js";

export type ChatgptConversationExecutionResult =
	| { status: "completed"; result: PromptResult }
	| {
			status: "denied";
			admission: Extract<ProviderInteractionAdmission, { allowed: false }>;
	  };

type ChatgptTabAffinityExecutionInput = {
	mode: "tab-affinity";
	registry: BrowserTabLeaseRegistry;
	ledger: ProviderInteractionLedger;
	lease: BrowserTabLease;
	claim: TabLeaseClaim;
	operationId: string;
	endpoint: {
		host: string;
		port: number;
		browserProcessId?: number | null;
		managedBrowserProfile?: string;
	};
	input: PromptInput;
	options?: BrowserProviderListOptions;
	runPrompt: ChatgptLeasedPromptRunner;
	policy: ProviderInteractionPolicy;
	reservationTtlMs: number;
	idleTtlMs: number;
	now?: () => Date;
	classifyProviderWarning?: ProviderWarningClassifier;
	mutationAudit?: BrowserMutationAuditSink;
};

export type ProviderWarningClassifier = (error: unknown) => {
	classification: ProviderWarningClassification;
	reason: string;
	cooldownUntil?: string | null;
} | null;

export type ExecuteChatgptConversationInput =
	| {
			mode: "serialized";
			input: PromptInput;
			runSerialized: (input: PromptInput) => Promise<PromptResult>;
	  }
	| ChatgptTabAffinityExecutionInput;

export type ProvisionedChatgptTab = Pick<
	ChatgptTabAffinityExecutionInput,
	"lease" | "claim" | "endpoint"
>;

export interface ExecuteProvisionedChatgptConversationInput {
	registry: BrowserTabLeaseRegistry;
	ledger: ProviderInteractionLedger;
	scope: TabLeaseScope;
	workload: Extract<TabLeaseWorkload, { kind: "conversation" | "new-conversation" }>;
	operationId: string;
	input: PromptInput;
	options?: BrowserProviderListOptions;
	runPrompt: ChatgptLeasedPromptRunner;
	acquireTab: (input: { interactionReservationId: string }) => Promise<ProvisionedChatgptTab>;
	policy: ProviderInteractionPolicy;
	reservationTtlMs: number;
	idleTtlMs: number;
	now?: () => Date;
	classifyProviderWarning: ProviderWarningClassifier;
	mutationAudit?: BrowserMutationAuditSink;
}

export async function executeChatgptConversation(
	request: ExecuteChatgptConversationInput,
): Promise<ChatgptConversationExecutionResult> {
	if (request.mode === "serialized") {
		return { status: "completed", result: await request.runSerialized(request.input) };
	}
	const now = request.now ?? (() => new Date());
	const admittedAt = now().toISOString();
	const startsNewConversation = request.lease.workload.kind === "new-conversation";
	const admission = await request.ledger.reserve({
		scope: {
			provider: "chatgpt",
			tenantKey: request.lease.scope.tenantKey,
			runtimeProfileId: request.lease.scope.runtimeProfileId,
			managedBrowserProfile: request.lease.scope.managedBrowserProfile,
		},
		workloadId: workloadId(request.lease),
		operationId: request.operationId,
		tabLeaseId: request.lease.leaseId,
		interactionClass: startsNewConversation ? "conversation-start" : "prompt-continuation",
		mutability: "provider-mutating",
		startsNewConversation,
		now: admittedAt,
		reservationTtlMs: request.reservationTtlMs,
		policy: request.policy,
	});
	if (!admission.allowed) {
		await idleLease(request.registry, request.claim, admittedAt, "none");
		return { status: "denied", admission };
	}

	const started = await request.ledger.start({
		reservationId: admission.reservation.reservationId,
		startedAt: now().toISOString(),
	});
	if (!started.ok) {
		await idleLease(request.registry, request.claim, now().toISOString(), "none");
		throw new Error(`Interaction reservation could not start: ${started.reason}.`);
	}
	return executeAdmittedChatgptConversation(request, admission.reservation.reservationId, now);
}

export async function executeProvisionedChatgptConversation(
	request: ExecuteProvisionedChatgptConversationInput,
): Promise<ChatgptConversationExecutionResult> {
	assertRequestedWorkload(request.scope, request.workload, request.input);
	const now = request.now ?? (() => new Date());
	const startsNewConversation = request.workload.kind === "new-conversation";
	const admission = await request.ledger.reserve({
		scope: {
			provider: "chatgpt",
			tenantKey: request.scope.tenantKey,
			runtimeProfileId: request.scope.runtimeProfileId,
			managedBrowserProfile: request.scope.managedBrowserProfile,
		},
		workloadId: workloadIdentity(request.workload),
		operationId: request.operationId,
		tabLeaseId: null,
		interactionClass: startsNewConversation ? "conversation-start" : "prompt-continuation",
		mutability: "provider-mutating",
		startsNewConversation,
		now: now().toISOString(),
		reservationTtlMs: request.reservationTtlMs,
		policy: request.policy,
	});
	if (!admission.allowed) return { status: "denied", admission };
	const reservationId = admission.reservation.reservationId;
	const started = await request.ledger.start({
		reservationId,
		startedAt: now().toISOString(),
	});
	if (!started.ok) throw new Error(`Interaction reservation could not start: ${started.reason}.`);

	let provisioned: ProvisionedChatgptTab | null = null;
	try {
		provisioned = await request.acquireTab({ interactionReservationId: reservationId });
		assertProvisionedTab(request, provisioned);
		const bound = await request.ledger.bindTabLease({
			reservationId,
			tabLeaseId: provisioned.lease.leaseId,
			boundAt: now().toISOString(),
		});
		if (!bound.ok) throw new Error(`Interaction tab binding failed: ${bound.reason}.`);
	} catch (error) {
		if (provisioned) {
			await idleLease(request.registry, provisioned.claim, now().toISOString(), "none");
		}
		const settled = await request.ledger.settle({
			reservationId,
			settledAt: now().toISOString(),
			effectState: "none",
			outcome: "failed",
			stopReason: error instanceof Error ? error.message : String(error),
		});
		if (!settled.ok) throw new Error(`Provisioning settlement failed: ${settled.reason}.`);
		throw error;
	}

	return executeAdmittedChatgptConversation(
		{
			mode: "tab-affinity",
			registry: request.registry,
			ledger: request.ledger,
			...provisioned,
			operationId: request.operationId,
			input: request.input,
			options: request.options,
			runPrompt: request.runPrompt,
			policy: request.policy,
			reservationTtlMs: request.reservationTtlMs,
			idleTtlMs: request.idleTtlMs,
			now,
			classifyProviderWarning: request.classifyProviderWarning,
			mutationAudit: request.mutationAudit,
		},
		reservationId,
		now,
	);
}

async function executeAdmittedChatgptConversation(
	request: ChatgptTabAffinityExecutionInput,
	reservationId: string,
	now: () => Date,
): Promise<ChatgptConversationExecutionResult> {
	assertLeaseClaim(request.lease, request.claim, request.operationId);
	let activeClaim = request.claim;
	let claimWork: Promise<void> = Promise.resolve();
	const withClaim = <T>(work: () => Promise<T>): Promise<T> => {
		const next = claimWork.then(work);
		claimWork = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	};
	const providerOptions = buildChatgptLeasedPromptOptions({
		lease: request.lease,
		operationId: request.operationId,
		endpoint: request.endpoint,
		options: request.options,
		input: request.input,
	});
	providerOptions.providerTrafficGovernor = createProviderTrafficGovernor({
		attribution: {
			provider: "chatgpt",
			runtimeProfileId: request.lease.scope.runtimeProfileId,
			managedBrowserProfile: request.lease.scope.managedBrowserProfile,
			workloadId: workloadId(request.lease),
			operationId: request.operationId,
			tabLeaseId: request.lease.leaseId,
			targetId: request.lease.targetId,
		},
		// The enclosing prompt reservation already owns admission and settlement.
		interactionGovernor: { beforeInteraction: async () => undefined },
		mutationAudit:
			request.mutationAudit ??
			request.options?.mutationAudit ??
			createInMemoryBrowserMutationLog().record,
		assertLease: (attribution) =>
			withClaim(async () => {
				if (renewalFailed) throw renewalError;
				const lease = (await request.registry.list({ states: ["active"] })).find(
					(candidate) => candidate.leaseId === attribution.tabLeaseId,
				);
				if (
					!lease ||
					lease.ownerOperationId !== attribution.operationId ||
					lease.targetId !== request.lease.targetId ||
					lease.revision !== activeClaim.revision
				) {
					throw new Error("Provider traffic tab lease ownership changed before prompt action.");
				}
			}),
		probeWarning: probeChatgptRateLimitWarning,
		persistWarning: async (warning) => {
			const observedAt = now();
			await request.ledger.recordProviderWarning({
				scope: {
					provider: "chatgpt",
					tenantKey: request.lease.scope.tenantKey,
					runtimeProfileId: request.lease.scope.runtimeProfileId,
					managedBrowserProfile: request.lease.scope.managedBrowserProfile,
				},
				classification: warning.classification,
				reason: warning.reason,
				observedAt: observedAt.toISOString(),
			});
			await recordChatgptRateLimitDetection({
				profileName: request.lease.scope.runtimeProfileId,
				managedProfileDir: request.lease.scope.managedBrowserProfile,
				action: "prompt:provider-traffic-governor",
				reason: warning.reason,
				now: observedAt.getTime(),
			});
		},
	});

	const controller = new AbortController();
	const originalSignal = providerOptions.abortSignal;
	providerOptions.abortSignal = originalSignal
		? AbortSignal.any([originalSignal, controller.signal])
		: controller.signal;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let renewalError: unknown;
	let renewalFailed = false;
	let rejectRenewal!: (error: unknown) => void;
	const renewalFailure = new Promise<never>((_, reject) => {
		rejectRenewal = reject;
	});
	// Cancellation can already be present before the provider promise is started.
	void renewalFailure.catch(() => undefined);
	const failRenewal = (error: unknown) => {
		if (renewalFailed) return;
		renewalFailed = true;
		renewalError = error;
		stopped = true;
		if (timer) clearTimeout(timer);
		controller.abort(error);
		rejectRenewal(error);
	};
	const intervalMs = Math.max(1, Math.min(30_000, Math.floor(request.idleTtlMs / 3)));
	const nextRenewalDelay = () =>
		Math.max(
			1,
			Math.min(intervalMs, Date.parse(request.lease.absoluteExpiresAt) - now().getTime()),
		);
	const renew = async () => {
		try {
			await withClaim(async () => {
				if (stopped) return;
				const at = now();
				if (at.getTime() >= Date.parse(request.lease.absoluteExpiresAt)) {
					throw new Error("ChatGPT in-flight tab lease reached its absolute deadline.");
				}
				const used = await request.registry.recordMeaningfulUse({
					claim: activeClaim,
					now: at.toISOString(),
					idleTtlMs: request.idleTtlMs,
				});
				if (!used.ok)
					throw new Error(`ChatGPT in-flight lease renewal failed: ${used.conflict.kind}.`);
				activeClaim = used.value.claim;
			});
			if (!stopped) timer = setTimeout(renew, nextRenewalDelay());
		} catch (error) {
			failRenewal(error);
		}
	};
	const cancelRenewal = () =>
		failRenewal(originalSignal?.reason ?? new Error("ChatGPT prompt cancelled."));
	originalSignal?.addEventListener("abort", cancelRenewal, { once: true });
	const stopRenewal = async () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		originalSignal?.removeEventListener("abort", cancelRenewal);
		await claimWork;
	};
	let result: PromptResult;
	try {
		if (originalSignal?.aborted) cancelRenewal();
		else timer = setTimeout(renew, nextRenewalDelay());
		try {
			if (renewalFailed) throw renewalError;
			result = await Promise.race([
				request.runPrompt(request.input, providerOptions),
				renewalFailure,
			]);
		} finally {
			await stopRenewal();
		}
		if (renewalFailed) throw renewalError;
		assertChatgptLeasedPromptResult(request.lease, result);
		activeClaim = await settleSuccessfulLease(
			{ ...request, claim: activeClaim },
			result,
			now().toISOString(),
		);
	} catch (error) {
		await stopRenewal();
		await settleFailedExecution(
			{ ...request, claim: activeClaim },
			activeClaim,
			reservationId,
			now,
			error,
		);
		throw error;
	}
	const settled = await request.ledger.settle({
		reservationId,
		settledAt: now().toISOString(),
		effectState: "settled",
		outcome: "succeeded",
	});
	if (!settled.ok) {
		const settlementError = new Error(`Interaction settlement failed: ${settled.reason}.`);
		try {
			await fenceLeaseAfterSettlementFailure(request, activeClaim, now().toISOString());
		} catch (fenceError) {
			throw new AggregateError(
				[settlementError, fenceError],
				"Interaction settlement failed and the exact tab lease could not be fenced.",
			);
		}
		throw settlementError;
	}
	await idleLease(request.registry, activeClaim, now().toISOString(), "settled");
	return { status: "completed", result };
}

async function fenceLeaseAfterSettlementFailure(
	request: ChatgptTabAffinityExecutionInput,
	claim: TabLeaseClaim,
	now: string,
): Promise<void> {
	const used = await request.registry.recordMeaningfulUse({
		claim,
		now,
		idleTtlMs: request.idleTtlMs,
		effectState: "outcome-unknown",
	});
	if (!used.ok) {
		throw new Error(`ChatGPT settlement-failure fence failed: ${used.conflict.kind}.`);
	}
	await idleLease(request.registry, used.value.claim, now, "outcome-unknown");
}

async function settleSuccessfulLease(
	request: ChatgptTabAffinityExecutionInput,
	result: PromptResult,
	now: string,
): Promise<TabLeaseClaim> {
	if (Date.parse(now) >= Date.parse(request.lease.absoluteExpiresAt)) {
		throw new Error("ChatGPT in-flight tab lease reached its absolute deadline.");
	}
	if (request.lease.workload.kind === "new-conversation") {
		if (!result.conversationId || !result.url) {
			throw new Error("ChatGPT new-conversation binding requires exact conversation ID and URL.");
		}
		const bound = await request.registry.bindConversation({
			claim: request.claim,
			conversationId: result.conversationId,
			targetFingerprint: result.url,
			now,
		});
		if (!bound.ok) throw new Error(`ChatGPT conversation binding failed: ${bound.conflict.kind}.`);
		return bound.value.claim;
	}

	const used = await request.registry.recordMeaningfulUse({
		claim: request.claim,
		now,
		idleTtlMs: request.idleTtlMs,
		targetFingerprint: result.url ?? request.lease.targetFingerprint,
		effectState: "settled",
	});
	if (!used.ok) throw new Error(`ChatGPT lease heartbeat failed: ${used.conflict.kind}.`);
	return used.value.claim;
}

async function settleFailedExecution(
	request: ChatgptTabAffinityExecutionInput,
	claim: TabLeaseClaim,
	reservationId: string,
	now: () => Date,
	error: unknown,
): Promise<void> {
	if (readFailureEffectState(error) === "pre_effect") {
		await idleLease(request.registry, claim, now().toISOString(), "none");
		const settled = await request.ledger.settle({
			reservationId,
			settledAt: now().toISOString(),
			effectState: "none",
			outcome: "cancelled",
			stopReason: error instanceof Error ? error.message : String(error),
		});
		if (!settled.ok)
			throw new Error(`Pre-effect interaction settlement failed: ${settled.reason}.`);
		return;
	}
	const used = await request.registry.recordMeaningfulUse({
		claim,
		now: now().toISOString(),
		idleTtlMs: request.idleTtlMs,
		effectState: "outcome-unknown",
	});
	if (used.ok) {
		await idleLease(request.registry, used.value.claim, now().toISOString(), "outcome-unknown");
	}
	const warning = request.classifyProviderWarning?.(error) ?? null;
	if (warning) {
		await request.ledger.recordProviderWarning({
			scope: {
				provider: "chatgpt",
				tenantKey: request.lease.scope.tenantKey,
				runtimeProfileId: request.lease.scope.runtimeProfileId,
				managedBrowserProfile: request.lease.scope.managedBrowserProfile,
			},
			...warning,
			observedAt: now().toISOString(),
		});
		return;
	}
	const settled = await request.ledger.settle({
		reservationId,
		settledAt: now().toISOString(),
		effectState: "outcome-unknown",
		outcome: "failed",
		stopReason: error instanceof Error ? error.message : String(error),
	});
	if (!settled.ok) throw new Error(`Failed interaction settlement failed: ${settled.reason}.`);
}

function readFailureEffectState(error: unknown): "pre_effect" | "effect_observed" | "unknown" {
	if (!error || typeof error !== "object") return "unknown";
	const details = (error as { details?: unknown }).details;
	if (!details || typeof details !== "object") return "unknown";
	const effectState = (details as { effectState?: unknown }).effectState;
	return effectState === "pre_effect" ||
		effectState === "effect_observed" ||
		effectState === "unknown"
		? effectState
		: "unknown";
}

async function idleLease(
	registry: BrowserTabLeaseRegistry,
	claim: TabLeaseClaim,
	now: string,
	effectState: "none" | "settled" | "outcome-unknown",
): Promise<void> {
	const idled = await registry.idle({ claim, now, effectState });
	if (!idled.ok) throw new Error(`ChatGPT lease idle transition failed: ${idled.conflict.kind}.`);
}

function assertLeaseClaim(lease: BrowserTabLease, claim: TabLeaseClaim, operationId: string): void {
	if (
		claim.leaseId !== lease.leaseId ||
		claim.revision !== lease.revision ||
		claim.operationId !== operationId
	) {
		throw new Error(`Tab lease claim does not match active lease ${lease.leaseId}.`);
	}
}

function workloadId(lease: BrowserTabLease): string {
	return workloadIdentity(lease.workload);
}

function workloadIdentity(workload: TabLeaseWorkload): string {
	switch (workload.kind) {
		case "conversation":
			return `conversation:${workload.conversationId}`;
		case "new-conversation":
			return `new-conversation:${workload.reservationId}`;
		case "live-follow":
		case "ephemeral":
			return `${workload.kind}:${workload.operationId}`;
	}
}

function assertRequestedWorkload(
	scope: TabLeaseScope,
	workload: ExecuteProvisionedChatgptConversationInput["workload"],
	input: PromptInput,
): void {
	if (scope.service !== "chatgpt")
		throw new Error(`Expected chatgpt scope, received ${scope.service}.`);
	if (workload.kind === "conversation" && input.conversationId !== workload.conversationId) {
		throw new Error("Prompt conversation does not match requested conversation workload.");
	}
	if (workload.kind === "new-conversation" && input.conversationId) {
		throw new Error("New-conversation workload cannot target an existing conversation.");
	}
}

function assertProvisionedTab(
	request: ExecuteProvisionedChatgptConversationInput,
	provisioned: ProvisionedChatgptTab,
): void {
	assertLeaseClaim(provisioned.lease, provisioned.claim, request.operationId);
	const actualScope = provisioned.lease.scope;
	const expectedScope = request.scope;
	if (
		actualScope.runtimeProfileId !== expectedScope.runtimeProfileId ||
		actualScope.managedBrowserProfile !== expectedScope.managedBrowserProfile ||
		actualScope.service !== expectedScope.service ||
		actualScope.tenantKey !== expectedScope.tenantKey ||
		workloadIdentity(provisioned.lease.workload) !== workloadIdentity(request.workload)
	) {
		throw new Error("Provisioned tab lease does not match the admitted scope and workload.");
	}
}
