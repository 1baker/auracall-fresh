import {
	closeRemoteChromeTarget,
	connectToChromeTarget,
	listChromeTargets,
	openChromeTarget,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import { verifyChromeProcessAbsent } from "../../packages/browser-service/src/processCheck.js";
import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import {
	createLedgerBackedBrowserInteractionGovernor,
	type LedgerBackedBrowserInteractionGovernor,
} from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserOperationAcquiredResult } from "../../packages/browser-service/src/service/operationDispatcher.js";
import {
	createProviderTrafficGovernor,
	type ProviderTrafficGovernor,
	withProviderTrafficContext,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { classifyStructuredProviderWarning } from "../browser/chatgptAffinityRuntime.js";
import { probeChatgptRateLimitWarning } from "../browser/chatgptProviderTraffic.js";
import { recordChatgptRateLimitDetection } from "../browser/chatgptRateLimitGuard.js";
import { retireExpiredChatgptTabLeases } from "../browser/chatgptTabRetirement.js";
import { BrowserService } from "../browser/service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "../browser/service/profileConfig.js";
import { createBrowserTabConcurrencyRuntime } from "../browser/tabConcurrencyRuntime.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import { resolveChatgptTenantLimits } from "../runtime/tenantExecutionLimits.js";
import type { AccountMirrorMetadataCollectorInput } from "./chatgptMetadataCollector.js";
import {
	acquireEphemeralBrowserTab,
	acquireLiveFollowCrawlerTab,
} from "./liveFollowTabCoordinator.js";
import { withAccountMirrorProviderTrafficPlan } from "./providerTrafficPlan.js";

export interface ConfiguredLiveFollowAffinityContext {
	tabAffinity: NonNullable<AccountMirrorMetadataCollectorInput["tabAffinity"]>;
	interactionGovernor: LedgerBackedBrowserInteractionGovernor;
	providerTrafficGovernor: ProviderTrafficGovernor;
	operation: BrowserOperationAcquiredResult;
	bindProviderTrafficAdmissionState?(
		snapshot: NonNullable<ProviderTrafficGovernor["snapshotAdmissionState"]>,
	): void;
	completeSuccess(): Promise<void>;
	completeFailure(error: unknown): Promise<void>;
}

export function classifyLiveFollowFailureEffectState(): "settled" {
	// Live follow only reads provider state. A failed or cancelled traversal may
	// have completed reads or navigation, but it cannot leave a prompt or other
	// provider mutation with an unknown outcome.
	return "settled";
}

export async function createConfiguredLiveFollowAffinity(input: {
	userConfig: ResolvedUserConfig;
	provider: "chatgpt" | "gemini" | "grok";
	runtimeProfileId: string;
	operationId: string;
	workloadKind?: "live-follow" | "ephemeral";
	maxBrowserInteractionsPerMinute: number;
	conversationReadCooldownMs?: number;
	pageRefreshCooldownMs?: number;
	renavigationCooldownMs?: number;
	abortSignal?: AbortSignal;
	now?: () => Date;
}): Promise<ConfiguredLiveFollowAffinityContext | null> {
	const clientConfig = resolveRuntimeProfileUserConfig(input.userConfig, {
		runtimeProfileId: input.runtimeProfileId,
		provider: input.provider,
	}) as ResolvedUserConfig;
	if (input.provider !== "chatgpt" || clientConfig.browser?.tabConcurrencyMode !== "tab-affinity") {
		return null;
	}
	const runtime = createBrowserTabConcurrencyRuntime(clientConfig);
	if (!runtime.registry || !runtime.ledger) {
		throw new Error("Live-follow tab affinity is missing its registry or interaction ledger.");
	}
	const tenantKey = resolveConfiguredServiceAccountId(clientConfig as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId: input.runtimeProfileId,
	});
	if (!tenantKey) {
		throw new Error("Live-follow tab affinity requires a configured ChatGPT tenant identity.");
	}
	const browserService = BrowserService.fromConfig(clientConfig, "chatgpt");
	const configuredUrl =
		clientConfig.browser?.chatgptUrl ?? clientConfig.browser?.url ?? "https://chatgpt.com/";
	const initialTarget = await browserService.resolveServiceTarget({
		serviceId: "chatgpt",
		configuredUrl,
		ensurePort: false,
		abortSignal: input.abortSignal,
	});
	const managedBrowserProfile = initialTarget.managedBrowserProfile?.trim();
	if (!managedBrowserProfile) {
		throw new Error("Live-follow tab affinity could not resolve the managed browser profile.");
	}
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
	const workloadKind = input.workloadKind ?? "live-follow";
	const scope = {
		runtimeProfileId: input.runtimeProfileId,
		managedBrowserProfile,
		service: "chatgpt",
		tenantKey,
	};
	const inspectTarget = async (endpoint: { host: string; port: number }, targetId: string) => {
		const targets = await listChromeTargets(endpoint.port, endpoint.host);
		const target = targets.find((candidate) => {
			const record = candidate as { id?: string; targetId?: string };
			return (record.targetId ?? record.id) === targetId;
		}) as { url?: string } | undefined;
		return typeof target?.url === "string" ? { url: target.url } : null;
	};
	const closeTarget = (endpoint: { host: string; port: number }, targetId: string) =>
		closeRemoteChromeTarget(endpoint.host, endpoint.port, targetId, () => undefined);
	await retireExpiredChatgptTabLeases({
		registry: runtime.registry,
		audit: runtime.retirementAudit,
		scope,
		endpoint: toEndpoint(initialTarget),
		now: input.now,
		inspectTarget,
		closeTarget,
	});
	const limits = resolveChatgptTenantLimits(
		clientConfig as Record<string, unknown>,
		input.runtimeProfileId,
	);
	const baseGovernor = createBrowserInteractionGovernor({
		maxInteractionsPerMinute: input.maxBrowserInteractionsPerMinute,
		cooldownsByClass: {
			"conversation-read": input.conversationReadCooldownMs,
			"page-refresh": input.pageRefreshCooldownMs,
			renavigation: input.renavigationCooldownMs,
		},
		abortSignal: input.abortSignal,
	});
	const preLeaseProviderTrafficGovernor = withProviderTrafficContext(
		withAccountMirrorProviderTrafficPlan(
			createProviderTrafficGovernor({
				attribution: {
					provider: "chatgpt",
					runtimeProfileId: input.runtimeProfileId,
					managedBrowserProfile,
					workloadId: `${workloadKind}:${input.operationId}`,
					operationId: input.operationId,
					tabLeaseId: `pre-lease:${input.operationId}`,
				},
				interactionGovernor: baseGovernor,
				mutationAudit: browserService.getMutationAuditSink(),
			}),
			{
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [
					{
						phase: "bootstrap",
						kind: "target_create",
						workKey: "scope:crawler-target",
						limit: 1,
					},
				],
			},
		),
		{ trafficPhase: "bootstrap", workKey: "scope:crawler-target" },
	);
	let coldStartTargets: Array<{ targetId: string; url: string }> = [];
	const acquireCrawler =
		workloadKind === "live-follow" ? acquireLiveFollowCrawlerTab : acquireEphemeralBrowserTab;
	const crawler = await acquireCrawler({
		registry: runtime.registry,
		scope,
		operationId: input.operationId,
		targetUrl: configuredUrl,
		idleTtlMs: 15 * 60_000,
		absoluteTtlMs: 8 * 60 * 60_000,
		now: input.now,
		coldStartTargetPolicy: "create",
		resolveExistingEndpoint: async () => toEndpoint(initialTarget),
		verifyBrowserAbsent: () => verifyChromeProcessAbsent(managedBrowserProfile),
		startBrowser: async () => {
			const started = await browserService.resolveServiceTarget({
				serviceId: "chatgpt",
				// Provider navigation belongs to the single admitted crawler target below.
				configuredUrl: "about:blank",
				ensurePort: true,
				abortSignal: input.abortSignal,
			});
			const endpoint = toEndpoint(started);
			if (!endpoint) throw new Error("Live-follow browser startup returned no exact endpoint.");
			if (!started.tabs) {
				throw new Error("Live-follow browser startup returned no target census.");
			}
			coldStartTargets = started.tabs.flatMap((target) => {
				if (target.type !== "page") return [];
				const targetId = target.targetId ?? target.id;
				return targetId && target.url ? [{ targetId, url: target.url }] : [];
			});
			return endpoint;
		},
		listTargets: async () => coldStartTargets,
		preLeaseProviderTrafficGovernor,
		inspectTarget,
		openTarget: async ({ host, port, url }) => {
			const target = await openChromeTarget(port, url, host, undefined, {
				kind: "pre-lease-target-acquisition",
				operationId: input.operationId,
				reason: "live-follow crawler lease acquisition",
			});
			const targetId = typeof target === "string" ? target : target.id;
			if (!targetId) throw new Error("Live-follow target creation returned no target ID.");
			return { targetId, url };
		},
		closeTarget: ({ host, port, targetId }) => closeTarget({ host, port }, targetId),
	});
	const interactionGovernor = createLedgerBackedBrowserInteractionGovernor({
		ledger: runtime.ledger,
		scope: {
			provider: "chatgpt",
			tenantKey,
			runtimeProfileId: input.runtimeProfileId,
			managedBrowserProfile,
		},
		workloadId: `${workloadKind}:${input.operationId}`,
		operationId: input.operationId,
		tabLeaseId: crawler.lease.leaseId,
		policy: {
			maxConcurrentChats: limits.maxConcurrentChats,
			maxConversationStartsPerHour: limits.maxChatsPerHour,
			maxConversationStartsPerDay: limits.maxChatsPerDay,
			maxInteractionsPerMinute: input.maxBrowserInteractionsPerMinute,
		},
		baseGovernor: {
			beforeInteraction: async (kind, signal) => {
				await checkOwnedProviderWarning(signal);
				await baseGovernor.beforeInteraction(kind, signal);
				await checkOwnedProviderWarning(signal);
			},
		},
		now: input.now,
	});
	let crawlerClaim = crawler.claim;
	let snapshotProviderTrafficAdmissionState:
		| NonNullable<ProviderTrafficGovernor["snapshotAdmissionState"]>
		| undefined;
	let providerTrafficGovernor: ProviderTrafficGovernor;
	providerTrafficGovernor = createProviderTrafficGovernor({
		attribution: {
			provider: "chatgpt",
			runtimeProfileId: input.runtimeProfileId,
			managedBrowserProfile,
			workloadId: `${workloadKind}:${input.operationId}`,
			operationId: input.operationId,
			tabLeaseId: crawler.lease.leaseId,
			targetId: crawler.lease.targetId,
		},
		interactionGovernor,
		mutationAudit: browserService.getMutationAuditSink(),
		settleInteraction: (settlement) => interactionGovernor.finish(settlement),
		probeWarning: probeChatgptRateLimitWarning,
		persistWarning: async (warning) => {
			const observedAt = (input.now ?? (() => new Date()))();
			const targets = await listChromeTargets(crawler.endpoint.port, crawler.endpoint.host).catch(
				() => null,
			);
			const openTargetCount = targets
				? targets.filter((target) => target.type === "page").length
				: null;
			await runtime.ledger?.recordProviderWarning({
				scope: {
					provider: "chatgpt",
					tenantKey,
					runtimeProfileId: input.runtimeProfileId,
					managedBrowserProfile,
				},
				classification: warning.classification,
				reason: warning.reason,
				observedAt: observedAt.toISOString(),
				evidence: buildLiveFollowWarningEvidence(
					warning,
					openTargetCount,
					snapshotProviderTrafficAdmissionState?.(),
				),
			});
			await recordChatgptRateLimitDetection({
				profileName: input.runtimeProfileId,
				managedProfileDir: managedBrowserProfile,
				action: "account-mirror:provider-traffic-governor",
				reason: warning.reason,
				now: observedAt.getTime(),
			});
			warningRecorded = true;
		},
		assertLease: async (attribution) => {
			const leases = await runtime.registry?.list({ scope, states: ["active"] });
			const lease = leases?.find((candidate) => candidate.leaseId === attribution.tabLeaseId);
			if (
				!lease ||
				lease.ownerOperationId !== attribution.operationId ||
				lease.targetId !== crawler.lease.targetId ||
				lease.revision !== crawlerClaim.revision
			) {
				throw new Error("Provider traffic tab lease ownership changed before action.");
			}
		},
	});
	const recordTargetNavigation = async () => {
		const recorded = await runtime.registry?.recordTargetAction({
			claim: crawlerClaim,
			action: "navigation",
			occurredAt: (input.now ?? (() => new Date()))().toISOString(),
			idleTtlMs: 15 * 60_000,
		});
		if (!recorded?.ok) {
			throw new Error(
				`Live-follow crawler navigation accounting failed: ${recorded?.conflict.kind ?? "missing"}.`,
			);
		}
		crawlerClaim = recorded.value.claim;
	};
	let finished = false;
	let warningRecorded = false;
	const finish = async (
		outcome: "succeeded" | "failed",
		effectState: "settled" | "outcome-unknown",
		reason?: string,
	) => {
		if (finished) return;
		await interactionGovernor.close({ outcome, effectState, reason });
		const used = await runtime.registry?.recordMeaningfulUse({
			claim: crawlerClaim,
			now: (input.now ?? (() => new Date()))().toISOString(),
			idleTtlMs: 15 * 60_000,
			effectState,
		});
		if (!used?.ok) {
			throw new Error(`Live-follow crawler heartbeat failed: ${used?.conflict.kind ?? "missing"}.`);
		}
		const idled = await runtime.registry?.idle({
			claim: used.value.claim,
			now: (input.now ?? (() => new Date()))().toISOString(),
			effectState,
		});
		if (!idled?.ok) {
			throw new Error(
				`Live-follow crawler idle transition failed: ${idled?.conflict.kind ?? "missing"}.`,
			);
		}
		finished = true;
	};
	const checkOwnedProviderWarning = async (signal?: AbortSignal | null) => {
		const activeSignal = signal ?? input.abortSignal;
		activeSignal?.throwIfAborted();
		const leases = await runtime.registry?.list({ scope, states: ["active"] });
		const lease = leases?.find((candidate) => candidate.leaseId === crawlerClaim.leaseId);
		if (
			!lease ||
			lease.ownerOperationId !== input.operationId ||
			lease.targetId !== crawler.lease.targetId ||
			lease.revision !== crawlerClaim.revision
		) {
			throw new Error("Live-follow crawler ownership changed before warning check.");
		}
		const client = await connectToChromeTarget({
			host: crawler.endpoint.host,
			port: crawler.endpoint.port,
			target: crawler.lease.targetId,
			abortSignal: activeSignal,
			timeoutMs: 10000,
		});
		let warningTimer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				providerTrafficGovernor.checkWarning?.(client.Runtime),
				new Promise<never>((_resolve, reject) => {
					warningTimer = setTimeout(
						() => reject(new Error("Owned ChatGPT warning check timed out after 10000ms.")),
						10000,
					);
				}),
			]);
		} finally {
			if (warningTimer) clearTimeout(warningTimer);
			await client.close();
		}
	};

	const operationRecord = {
		id: input.operationId,
		key: `tab-lease:${crawler.lease.leaseId}`,
		managedProfileDir: managedBrowserProfile,
		serviceTarget: "chatgpt",
		kind: "browser-execution" as const,
		operationClass: "shared-read" as const,
		ownerPid: process.pid,
		ownerCommand: `${workloadKind === "live-follow" ? "account-mirror-live-follow" : "account-mirror-refresh"}:${input.operationId}`,
		startedAt: (input.now ?? (() => new Date()))().toISOString(),
		updatedAt: (input.now ?? (() => new Date()))().toISOString(),
	};
	return {
		bindProviderTrafficAdmissionState(snapshot) {
			snapshotProviderTrafficAdmissionState = snapshot;
		},
		tabAffinity: {
			host: crawler.endpoint.host,
			onTargetNavigation: recordTargetNavigation,
			port: crawler.endpoint.port,
			targetId: crawler.lease.targetId,
		},
		interactionGovernor,
		providerTrafficGovernor,
		operation: {
			acquired: true,
			operation: operationRecord,
			release: () =>
				finish("failed", classifyLiveFollowFailureEffectState(), "affinity-context-released"),
		},
		completeSuccess: async () => {
			await checkOwnedProviderWarning();
			await finish("succeeded", "settled");
		},
		completeFailure: async (error) => {
			const warning = classifyLiveFollowWarning(error);
			let finishError: unknown = null;
			try {
				await finish(
					"failed",
					classifyLiveFollowFailureEffectState(),
					error instanceof Error ? error.message : String(error),
				);
			} catch (settlementError) {
				finishError = settlementError;
			}
			let warningError: unknown = null;
			if (warning && !warningRecorded) {
				try {
					const targets = await listChromeTargets(
						crawler.endpoint.port,
						crawler.endpoint.host,
					).catch(() => null);
					const openTargetCount = targets
						? targets.filter((target) => target.type === "page").length
						: null;
					await runtime.ledger?.recordProviderWarning({
						scope: {
							provider: "chatgpt",
							tenantKey,
							runtimeProfileId: input.runtimeProfileId,
							managedBrowserProfile,
						},
						...warning,
						observedAt: (input.now ?? (() => new Date()))().toISOString(),
						evidence: buildLiveFollowWarningEvidence(
							warning,
							openTargetCount,
							snapshotProviderTrafficAdmissionState?.(),
						),
					});
					warningRecorded = true;
				} catch (recordError) {
					warningError = recordError;
				}
			}
			if (finishError && warningError) {
				throw new AggregateError(
					[finishError, warningError],
					"Live-follow settlement and provider-warning projection both failed.",
				);
			}
			if (finishError) throw finishError;
			if (warningError) throw warningError;
		},
	};
}

export function buildLiveFollowWarningEvidence(
	warning: { reason: string },
	openTargetCount: number | null,
	trafficAdmission?: ReturnType<NonNullable<ProviderTrafficGovernor["snapshotAdmissionState"]>>,
) {
	return {
		classifierVersion: "chatgpt-visible-blocking-surface-v1",
		visibleSummary: warning.reason,
		sourceTargetClass: "leased-page",
		openTargetCount,
		resourcePathClasses: [],
		...(trafficAdmission ? { trafficAdmission } : {}),
	};
}

export function classifyLiveFollowWarning(error: unknown) {
	const structured = classifyStructuredProviderWarning(error);
	if (structured) return structured;
	if (!error || typeof error !== "object") return null;
	const record = error as Record<string, unknown>;
	const details =
		record.details && typeof record.details === "object"
			? (record.details as Record<string, unknown>)
			: null;
	const guardCandidate = record.providerGuard ?? details?.providerGuard ?? details?.blockingState;
	const guard =
		guardCandidate && typeof guardCandidate === "object"
			? (guardCandidate as Record<string, unknown>)
			: null;
	const kind = typeof guard?.kind === "string" ? guard.kind.toLowerCase() : "";
	const classification =
		kind.includes("rate") || kind.includes("quick")
			? ("rate-limit" as const)
			: kind.includes("captcha") || kind.includes("human") || kind.includes("verification")
				? ("human-verification" as const)
				: kind.includes("account") || kind.includes("identity")
					? ("identity-conflict" as const)
					: null;
	if (!classification) return null;
	return {
		classification,
		reason:
			typeof guard?.summary === "string" && guard.summary.trim()
				? guard.summary.trim()
				: error instanceof Error
					? error.message
					: "Account Mirror provider warning observed.",
	};
}
