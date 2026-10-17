import {
	closeRemoteChromeTarget,
	listChromeTargets,
	openChromeTarget,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import { createLedgerBackedBrowserInteractionGovernor } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import {
	type BrowserMutationAuditSink,
	createInMemoryBrowserMutationLog,
} from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	createProviderTrafficGovernor,
	isKnownBackendRequestBudgetDenial,
	withProviderTrafficContext,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import {
	type BrowserTabLeaseRegistry,
	getCurrentTabLeaseOwnerIdentity,
	type TabLeaseClaim,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";
import { acquireEphemeralBrowserTab } from "../accountMirror/liveFollowTabCoordinator.js";
import { withAccountMirrorProviderTrafficPlan } from "../accountMirror/providerTrafficPlan.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	resolveChatgptInteractionsPerMinute,
	resolveChatgptTenantLimits,
} from "../runtime/tenantExecutionLimits.js";
import { classifyStructuredProviderWarning } from "./chatgptAffinityRuntime.js";
import { probeChatgptRateLimitWarning } from "./chatgptProviderTraffic.js";
import { recordChatgptRateLimitDetection } from "./chatgptRateLimitGuard.js";
import { retireExpiredChatgptTabLeases } from "./chatgptTabRetirement.js";
import {
	recordLibraryInventoryCleanupPhase,
	recordLibraryInventoryStage,
} from "./libraryInventoryDiagnostics.js";
import {
	createOwnedBackendRequestAuthority,
	OwnedBackendRequestCleanupError,
	validateBackendRequestLimit,
} from "./ownedBackendRequestAuthority.js";
import { providerNavigationAllowed } from "./providers/navigationPolicy.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { BrowserService } from "./service/browserService.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

const CHATGPT_UTILITY_SETTLEMENT_TIMEOUT_MS = 5_000;

export interface ConfiguredChatgptUtilityAffinityDeps {
	createRuntime?: typeof createBrowserTabConcurrencyRuntime;
	listTargets?: typeof listChromeTargets;
	openTarget?: typeof openChromeTarget;
	closeTarget?: typeof closeRemoteChromeTarget;
	currentOwner?: { processId: number; instanceId: string };
	isOwnerAlive?: (processId: number) => boolean;
	mutationAudit?: BrowserMutationAuditSink;
}

export async function runConfiguredChatgptUtilityOperation<TResult>(input: {
	userConfig: ResolvedUserConfig;
	browserService: BrowserService;
	utilityId: string;
	buildListOptions: (overrides: BrowserProviderListOptions) => Promise<BrowserProviderListOptions>;
	options?: BrowserProviderListOptions;
	mutability: "read-only" | "provider-mutating";
	backendRequestLimit?: number;
	run: (options: BrowserProviderListOptions) => Promise<TResult>;
	now?: () => Date;
	deps?: ConfiguredChatgptUtilityAffinityDeps;
}): Promise<TResult | null> {
	validateBackendRequestLimit(input.backendRequestLimit);
	if (input.userConfig.browser?.tabConcurrencyMode !== "tab-affinity") return null;
	if (input.backendRequestLimit !== undefined && input.options?.providerSession)
		throw new Error("Request-aware ChatGPT utility cannot inherit a provider session.");
	const now = input.now ?? (() => new Date());
	const runtimeProfileId = input.userConfig.auracallProfile?.trim() || "default";
	const runtime = (input.deps?.createRuntime ?? createBrowserTabConcurrencyRuntime)(
		input.userConfig,
	);
	if (!runtime.registry || !runtime.ledger) {
		throw new Error("ChatGPT utility affinity is missing its registry or interaction ledger.");
	}
	const tenantKey = resolveConfiguredServiceAccountId(input.userConfig as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId,
	});
	if (!tenantKey)
		throw new Error("ChatGPT utility affinity requires a configured tenant identity.");
	const configuredUrl =
		input.options?.configuredUrl ??
		input.userConfig.browser?.chatgptUrl ??
		input.userConfig.browser?.url ??
		"https://chatgpt.com/";
	recordLibraryInventoryStage(input.options, "affinity-resolve-target");
	const initialTarget = await input.browserService.resolveServiceTarget({
		serviceId: "chatgpt",
		configuredUrl,
		ensurePort: false,
		abortSignal: input.options?.abortSignal,
	});
	const managedBrowserProfile = initialTarget.managedBrowserProfile?.trim();
	if (!managedBrowserProfile) {
		throw new Error("ChatGPT utility affinity could not resolve the managed browser profile.");
	}
	const scope = {
		runtimeProfileId,
		managedBrowserProfile,
		service: "chatgpt",
		tenantKey,
	};
	const toEndpoint = (target: typeof initialTarget) => {
		if (!target.host || !target.port || target.managedBrowserProfile !== managedBrowserProfile) {
			return null;
		}
		return {
			host: target.host,
			port: target.port,
			browserProcessId: target.browserProcessId ?? null,
			managedBrowserProfile,
		};
	};
	const inspectTarget = async (endpoint: { host: string; port: number }, targetId: string) => {
		const targets = await (input.deps?.listTargets ?? listChromeTargets)(
			endpoint.port,
			endpoint.host,
		);
		const target = targets.find((candidate) => {
			const record = candidate as { id?: string; targetId?: string };
			return (record.targetId ?? record.id) === targetId;
		}) as { url?: string } | undefined;
		return typeof target?.url === "string" ? { url: target.url } : null;
	};
	const closeTarget = (endpoint: { host: string; port: number }, targetId: string) =>
		(input.deps?.closeTarget ?? closeRemoteChromeTarget)(
			endpoint.host,
			endpoint.port,
			targetId,
			() => undefined,
		);
	recordLibraryInventoryStage(input.options, "affinity-reconcile-leases");
	await reconcileStaleTabLeases({
		registry: runtime.registry,
		scope,
		now,
		currentOwner: input.deps?.currentOwner ?? getCurrentTabLeaseOwnerIdentity(),
		isOwnerAlive: input.deps?.isOwnerAlive,
	});
	if (
		input.mutability === "read-only" &&
		input.options?.requireExistingTarget &&
		toEndpoint(initialTarget)
	) {
		const endpoint = toEndpoint(initialTarget);
		if (endpoint) {
			const processTab = await runtime.registry.findByProcess(scope);
			const recoverable = await runtime.registry.list({
				scope,
				states: ["idle", "lost"],
			});
			for (const lease of recoverable) {
				if (lease.leaseId === processTab?.leaseId || lease.retention === "live-follow") continue;
				if (
					lease.workload.kind !== "ephemeral" ||
					lease.effectState === "in-flight" ||
					lease.effectState === "outcome-unknown"
				) {
					continue;
				}
				const target = await inspectTarget(endpoint, lease.targetId);
				if (!target || !isExactRoute(target.url, configuredUrl)) continue;
				await runtime.registry.releasePreserved({
					leaseId: lease.leaseId,
					expectedRevision: lease.revision,
					now: now().toISOString(),
				});
			}
		}
	}
	recordLibraryInventoryStage(input.options, "affinity-retire-leases");
	await retireExpiredChatgptTabLeases({
		registry: runtime.registry,
		audit: runtime.retirementAudit,
		scope,
		endpoint: toEndpoint(initialTarget),
		now,
		inspectTarget,
		closeTarget,
	});
	recordLibraryInventoryStage(input.options, "affinity-acquire-target");
	const tab = await acquireEphemeralBrowserTab({
		registry: runtime.registry,
		scope,
		operationId: input.utilityId,
		targetUrl: configuredUrl,
		idleTtlMs: 5 * 60_000,
		absoluteTtlMs: 60 * 60_000,
		now,
		resolveExistingEndpoint: async () => toEndpoint(initialTarget),
		startBrowser: async () => {
			const target = await input.browserService.resolveServiceTarget({
				serviceId: "chatgpt",
				configuredUrl: "about:blank",
				ensurePort: true,
				abortSignal: input.options?.abortSignal,
			});
			const endpoint = toEndpoint(target);
			if (!endpoint) throw new Error("ChatGPT utility browser startup returned no exact endpoint.");
			return endpoint;
		},
		listTargets: async ({ host, port }) =>
			(await (input.deps?.listTargets ?? listChromeTargets)(port, host))
				.filter((target) => !target.type || target.type === "page")
				.map((target) => ({
					targetId:
						(target as { targetId?: string; id?: string }).targetId ??
						(target as { id?: string }).id ??
						"",
					url: typeof target.url === "string" ? target.url : "",
				})),
		requireExistingTarget: input.options?.requireExistingTarget,
		inspectTarget,
		openTarget: async ({ host, port }) => {
			const url = "about:blank";
			const target = input.deps?.openTarget
				? await input.deps.openTarget(port, url, host)
				: await openChromeTarget(port, url, host, undefined, {
						kind: "pre-lease-target-acquisition",
						operationId: input.utilityId,
						reason: "ChatGPT utility lease acquisition",
					});
			const targetId = typeof target === "string" ? target : target.id;
			if (!targetId) throw new Error("ChatGPT utility target creation returned no target ID.");
			return { targetId, url };
		},
		closeTarget: ({ host, port, targetId }) => closeTarget({ host, port }, targetId),
	});

	let effectState: "settled" | "outcome-unknown" = "settled";
	let outcome: "succeeded" | "failed" = "succeeded";
	let warningRecordError: unknown = null;
	let governor: ReturnType<typeof createLedgerBackedBrowserInteractionGovernor> | null = null;
	let backendRequests: ReturnType<typeof createOwnedBackendRequestAuthority> | undefined;
	let providerRunStarted = false;
	let execution: { ok: true; value: TResult } | { ok: false; error: unknown };
	try {
		const ownsUnloadedTarget =
			tab.lease.targetFingerprint === "about:blank" &&
			(await inspectTarget(tab.endpoint, tab.lease.targetId))?.url === "about:blank";
		recordLibraryInventoryStage(input.options, "affinity-build-options");
		const options = await input.buildListOptions({
			...(input.options ?? {}),
			host: tab.endpoint.host,
			port: tab.endpoint.port,
			tabTargetId: tab.lease.targetId,
			tabUrl: tab.lease.targetFingerprint ?? configuredUrl,
			tabLifecycle: "retain",
			preserveActiveTab:
				ownsUnloadedTarget && providerNavigationAllowed(input.options)
					? false
					: (input.options?.preserveActiveTab ?? input.options?.allowNavigation !== true),
		});
		if (input.backendRequestLimit !== undefined && options.providerSession)
			throw new Error("Request-aware ChatGPT utility cannot inherit a provider session.");
		const baseGovernor =
			options.interactionGovernor ??
			createBrowserInteractionGovernor({ abortSignal: input.options?.abortSignal });
		const limits = resolveChatgptTenantLimits(
			input.userConfig as Record<string, unknown>,
			runtimeProfileId,
		);
		governor = createLedgerBackedBrowserInteractionGovernor({
			ledger: runtime.ledger,
			scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
			workloadId: `utility:${input.utilityId}`,
			operationId: input.utilityId,
			tabLeaseId: tab.lease.leaseId,
			policy: {
				maxConcurrentChats: limits.maxConcurrentChats,
				maxConversationStartsPerHour: limits.maxChatsPerHour,
				maxConversationStartsPerDay: limits.maxChatsPerDay,
				maxInteractionsPerMinute: resolveChatgptInteractionsPerMinute(
					input.userConfig as Record<string, unknown>,
					runtimeProfileId,
				),
			},
			baseGovernor,
			now,
		});
		const assertOwnedLease = async () => {
			const lease = (await runtime.registry?.list({ scope, states: ["active"] }))?.find(
				(candidate) => candidate.leaseId === tab.lease.leaseId,
			);
			if (
				!lease ||
				lease.ownerOperationId !== input.utilityId ||
				lease.targetId !== tab.lease.targetId ||
				lease.revision !== tab.claim.revision
			) {
				throw new Error("Provider traffic tab lease ownership changed before utility action.");
			}
		};
		backendRequests =
			input.backendRequestLimit !== undefined
				? createOwnedBackendRequestAuthority({
						ledger: runtime.ledger,
						scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
						workloadId: `utility:${input.utilityId}`,
						operationId: input.utilityId,
						tabLeaseId: tab.lease.leaseId,
						backendRequestLimit: input.backendRequestLimit,
						assertOwnedLease,
						now,
					})
				: undefined;
		const baseProviderTrafficGovernor = createProviderTrafficGovernor({
			attribution: {
				provider: "chatgpt",
				runtimeProfileId,
				managedBrowserProfile,
				workloadId: `utility:${input.utilityId}`,
				operationId: input.utilityId,
				tabLeaseId: tab.lease.leaseId,
				targetId: tab.lease.targetId,
			},
			interactionGovernor: governor,
			mutationAudit:
				options.mutationAudit ??
				input.deps?.mutationAudit ??
				input.browserService.getMutationAuditSink?.() ??
				createInMemoryBrowserMutationLog().record,
			settleInteraction: (settlement) => governor?.finish(settlement) ?? Promise.resolve(),
			assertLease: assertOwnedLease,
			admitBackendRequest: backendRequests?.admit,
			probeWarning: probeChatgptRateLimitWarning,
			persistWarning: async (warning) => {
				const observedAt = now();
				await runtime.ledger?.recordProviderWarning({
					scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
					classification: warning.classification,
					reason: warning.reason,
					observedAt: observedAt.toISOString(),
				});
				await recordChatgptRateLimitDetection({
					profileName: runtimeProfileId,
					managedProfileDir: managedBrowserProfile,
					action: `utility:${input.utilityId}:provider-traffic-governor`,
					reason: warning.reason,
					now: observedAt.getTime(),
				});
			},
		});
		const plannedProviderTrafficGovernor = options.accountMirrorProviderTrafficPlan
			? withAccountMirrorProviderTrafficPlan(
					baseProviderTrafficGovernor,
					options.accountMirrorProviderTrafficPlan,
				)
			: baseProviderTrafficGovernor;
		const providerTrafficGovernor = options.providerTrafficContext
			? withProviderTrafficContext(plannedProviderTrafficGovernor, options.providerTrafficContext)
			: plannedProviderTrafficGovernor;
		providerRunStarted = true;
		recordLibraryInventoryStage(input.options, "affinity-provider-read");
		const runOptions: BrowserProviderListOptions = {
			...options,
			interactionGovernor: governor,
			providerTrafficGovernor,
			preserveInteractionGovernorForProviderSession: true,
			disableProviderMutationRetry: input.mutability === "provider-mutating",
		};
		const result = await Promise.resolve()
			.then(() => input.run(runOptions))
			.then(
				(value) => ({ ok: true as const, value }),
				(error: unknown) => ({ ok: false as const, error }),
			);
		// Request authority belongs to this utility lease, even if its adapter retains a session.
		if (backendRequests && runOptions.providerSession) {
			const session = runOptions.providerSession;
			runOptions.providerSession = undefined;
			const cleanup = await waitForConfiguredChatgptUtilitySettlement(
				Promise.resolve()
					.then(() => session.close())
					.then(
						() => undefined,
						(error: unknown) =>
							isKnownBackendRequestBudgetDenial(error)
								? error
								: new OwnedBackendRequestCleanupError(error),
					),
				CHATGPT_UTILITY_SETTLEMENT_TIMEOUT_MS,
			);
			const cleanupError =
				cleanup.status === "timed-out"
					? new OwnedBackendRequestCleanupError(
							new Error("Owned backend request utility-session cleanup timed out."),
						)
					: cleanup.error;
			if (cleanupError)
				throw result.ok
					? cleanupError
					: new AggregateError(
							[result.error, cleanupError],
							"Utility operation and retained-session cleanup failed.",
						);
		}
		if (!result.ok) throw result.error;
		execution = result;
	} catch (error) {
		recordLibraryInventoryCleanupPhase(input.options, "read-rejected");
		outcome = "failed";
		effectState =
			input.mutability === "provider-mutating" && providerRunStarted
				? "outcome-unknown"
				: "settled";
		const warning = classifyStructuredProviderWarning(error);
		if (warning) {
			try {
				await runtime.ledger.recordProviderWarning({
					scope: { provider: "chatgpt", tenantKey, runtimeProfileId, managedBrowserProfile },
					classification: warning.classification,
					reason: warning.reason,
					observedAt: now().toISOString(),
				});
			} catch (warningError) {
				warningRecordError = warningError;
			}
		}
		execution = { ok: false, error };
	}
	recordLibraryInventoryCleanupPhase(input.options, "affinity-settlement-started");
	const settlement = settleConfiguredChatgptUtilityOperation({
		governor,
		registry: runtime.registry,
		tab,
		utilityId: input.utilityId,
		outcome,
		effectState,
		now,
		initialError: warningRecordError,
		backendRequests,
		operationError: execution.ok ? undefined : execution.error,
	});
	const settlementResult = await waitForConfiguredChatgptUtilitySettlement(
		settlement,
		CHATGPT_UTILITY_SETTLEMENT_TIMEOUT_MS,
	);
	recordLibraryInventoryCleanupPhase(
		input.options,
		settlementResult.status === "timed-out"
			? "affinity-settlement-timed-out"
			: "affinity-settlement-settled",
	);
	if (!execution.ok) {
		if (settlementResult.status === "settled" && settlementResult.error) {
			throw new AggregateError(
				[execution.error, settlementResult.error],
				"Utility operation and settlement failed.",
			);
		}
		throw execution.error;
	}
	if (settlementResult.status === "timed-out") {
		throw new Error(
			`ChatGPT utility settlement timed out after ${CHATGPT_UTILITY_SETTLEMENT_TIMEOUT_MS}ms.`,
		);
	}
	if (settlementResult.error) throw settlementResult.error;
	return execution.value;
}

async function settleConfiguredChatgptUtilityOperation(input: {
	governor: ReturnType<typeof createLedgerBackedBrowserInteractionGovernor> | null;
	registry: BrowserTabLeaseRegistry;
	tab: Awaited<ReturnType<typeof acquireEphemeralBrowserTab>>;
	utilityId: string;
	outcome: "succeeded" | "failed";
	effectState: "settled" | "outcome-unknown";
	now: () => Date;
	initialError: unknown;
	backendRequests?: ReturnType<typeof createOwnedBackendRequestAuthority>;
	operationError?: unknown;
}): Promise<unknown> {
	const failures: unknown[] = input.initialError ? [input.initialError] : [];
	let effectState = input.effectState;
	try {
		effectState =
			(await input.backendRequests?.reconcileEffectState(effectState, input.operationError)) ??
			effectState;
	} catch (error) {
		effectState = "outcome-unknown";
		failures.push(error);
	}

	if (input.governor) {
		try {
			await input.governor.close({ outcome: input.outcome, effectState });
		} catch (error) {
			failures.push(error);
		}
	}
	let claim: TabLeaseClaim = input.tab.claim;
	try {
		const used = await input.registry.recordMeaningfulUse({
			claim,
			now: input.now().toISOString(),
			idleTtlMs: 5 * 60_000,
			effectState,
		});
		if (!used.ok) throw new Error(`ChatGPT utility heartbeat failed: ${used.conflict.kind}.`);
		claim = used.value.claim;
	} catch (error) {
		failures.push(error);
		try {
			const current = (await input.registry.list()).find(
				(lease) =>
					lease.leaseId === input.tab.lease.leaseId &&
					lease.state === "active" &&
					lease.ownerOperationId === input.utilityId,
			);
			if (current) {
				claim = {
					leaseId: current.leaseId,
					revision: current.revision,
					operationId: input.utilityId,
				};
			}
		} catch (recoveryError) {
			failures.push(recoveryError);
		}
	}
	try {
		const idled = await input.registry.idle({
			claim,
			now: input.now().toISOString(),
			effectState,
		});
		if (!idled.ok)
			throw new Error(`ChatGPT utility idle transition failed: ${idled.conflict.kind}.`);
	} catch (error) {
		failures.push(error);
	}
	return failures.length > 1
		? new AggregateError(failures, "Utility settlement failed.")
		: failures[0];
}

async function waitForConfiguredChatgptUtilitySettlement(
	settlement: Promise<unknown>,
	timeoutMs: number,
): Promise<{ status: "settled"; error: unknown } | { status: "timed-out" }> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			settlement.then(
				(error) => ({ status: "settled" as const, error }),
				(error: unknown) => ({ status: "settled" as const, error }),
			),
			new Promise<{ status: "timed-out" }>((resolve) => {
				timeout = setTimeout(() => resolve({ status: "timed-out" }), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function isExactRoute(actualUrl: string, expectedUrl: string): boolean {
	try {
		const actual = new URL(actualUrl);
		const expected = new URL(expectedUrl);
		const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";
		return (
			actual.origin === expected.origin &&
			normalizePath(actual.pathname) === normalizePath(expected.pathname)
		);
	} catch {
		return false;
	}
}
