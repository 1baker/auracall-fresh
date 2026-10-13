import { randomUUID } from "node:crypto";
import path from "node:path";
import {
	connectToChromeTarget,
	listChromeTargets,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import { findChromePidUsingUserDataDir } from "../../packages/browser-service/src/processCheck.js";
import {
	type BrowserOperationAcquiredResult,
	type BrowserOperationAcquireResult,
	type BrowserOperationDispatcher,
	type BrowserOperationRecord,
	createFileBackedBrowserOperationDispatcher,
	formatBrowserOperationBusyResult,
} from "../../packages/browser-service/src/service/operationDispatcher.js";
import { listInstancesWithLiveness } from "../../packages/browser-service/src/service/stateRegistry.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import {
	appendChatgptRateLimitDetection,
	extractChatgptRateLimitSummary,
	isChatgptRateLimitMessage,
	readChatgptRateLimitGuardState,
	resolveChatgptRateLimitCooldownMs,
	writeChatgptRateLimitGuardState,
} from "../browser/chatgptRateLimitGuard.js";
import { retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown } from "../browser/configuredChatgptTabMaintenance.js";
import { recordDomDriftObservation } from "../browser/domDriftObservations.js";
import {
	type BrowserOperationQueueObservation,
	recordBrowserOperationQueueObservation,
	summarizeBrowserOperationQueueObservationsByKey,
} from "../browser/operationQueueObservations.js";
import type { Conversation, ConversationArtifact, FileRef } from "../browser/providers/domain.js";
import { resolveBrowserLaunchPlan } from "../browser/service/browserLaunchPlan.js";
import type { ResolvedUserConfig } from "../config.js";
import { deriveAccountMirrorBackfillLedger } from "./backfillLedger.js";
import {
	type AccountMirrorPersistence,
	createAccountMirrorPersistence,
} from "./cachePersistence.js";
import { deriveAccountMirrorChangeFrontierMetrics } from "./changeFrontierMetrics.js";
import { normalizeAccountMirrorConversationWorkState } from "./changeFrontierState.js";
import {
	AccountMirrorIdentityMismatchError,
	type AccountMirrorMetadataCollector,
	type AccountMirrorMetadataCollectorResult,
	type AccountMirrorVerifiedIdentityEvidence,
	createChatgptAccountMirrorMetadataCollector,
} from "./chatgptMetadataCollector.js";
import { createConfiguredLiveFollowAffinity } from "./configuredLiveFollowAffinity.js";
import {
	type AccountMirrorConversationMaterializationPolicy,
	deriveAccountMirrorConversationFreshness,
} from "./conversationFreshness.js";
import { buildConversationFreshnessSummaryMap } from "./conversationFreshnessFrontier.js";
import { isLiveFollowCollectorPhase } from "./liveFollowOperatingModel.js";
import type {
	AccountMirrorProvider,
	AccountMirrorProviderGuardKind,
	AccountMirrorProviderGuardState,
} from "./politePolicy.js";
import { createAccountMirrorMetadataTrafficPlanController } from "./providerTrafficPlan.js";
import type {
	AccountMirrorCollectorDiagnosticEvent,
	AccountMirrorCollectorPhase,
	AccountMirrorCollectorPhaseProgressEvidence,
	AccountMirrorMetadataCounts,
	AccountMirrorMetadataEvidence,
	AccountMirrorStatusEntry,
	AccountMirrorStatusRegistry,
	AccountMirrorStatusState,
	AccountMirrorStatusSummary,
} from "./statusRegistry.js";
import { createAccountMirrorStatusRegistry } from "./statusRegistry.js";

export interface AccountMirrorRefreshRequest {
	conversationIds?: string[] | null;
	provider?: AccountMirrorProvider | null;
	runtimeProfileId?: string | null;
	sweepMode?: "steady_follow" | "full_sweep" | null;
	materializationPolicy?: AccountMirrorConversationMaterializationPolicy | null;
	requestedPhase?: AccountMirrorCollectorPhase | null;
	explicitRefresh?: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
	queueTimeoutMs?: number;
	queuePollMs?: number;
	collectorTimeoutMs?: number;
	cleanupManagedBrowserAfterRefresh?: boolean;
	onCollectorProgress?: (
		progress: AccountMirrorCollectorPhaseProgressEvidence,
	) => Promise<void> | void;
	onCollectorDiagnosticEvent?: (
		event: AccountMirrorCollectorDiagnosticEvent,
	) => Promise<void> | void;
	development?: AccountMirrorDevelopmentPolicy | null;
	abortSignal?: AbortSignal;
	liveFollowOperationId?: string | null;
}

export interface AccountMirrorDevelopmentPolicy {
	enabled: true;
	maxWallTimeMs: number;
	maxConversations: number;
	maxMaterializationCandidates: number;
	maxPasses: number;
	providerCallTimeoutMs?: number;
	maxBrowserInteractionsPerMinute?: number;
	conversationReadCooldownMs?: number;
	pageRefreshCooldownMs?: number;
	renavigationCooldownMs?: number;
}

export interface AccountMirrorEffectiveDevelopmentPolicy extends AccountMirrorDevelopmentPolicy {
	mode: "development";
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	serverCapabilityArmed: true;
}

export interface AccountMirrorRefreshBrowserLifecycle {
	cleanupRequested: boolean;
	status: "not_requested" | "not_running" | "terminated" | "failed";
	managedProfileDir: string | null;
	pid: number | null;
	message: string | null;
}

export interface AccountMirrorRefreshResult {
	object: "account_mirror_refresh";
	requestId: string;
	status: "completed" | "blocked" | "busy";
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	requestedPhase: AccountMirrorCollectorPhase | null;
	startedAt: string;
	completedAt: string | null;
	dispatcher: {
		key: string | null;
		operationId: string | null;
		blockedBy: Record<string, unknown> | null;
	};
	metadataCounts: AccountMirrorMetadataCounts;
	metadataEvidence: AccountMirrorMetadataEvidence | null;
	mirrorCompleteness: AccountMirrorStatusEntry["mirrorCompleteness"];
	detectedIdentityKey: string | null;
	detectedAccountLevel: string | null;
	mirrorStatus: AccountMirrorStatusSummary;
	browserLifecycle?: AccountMirrorRefreshBrowserLifecycle | null;
	development?: AccountMirrorEffectiveDevelopmentPolicy | null;
}

export class AccountMirrorRefreshError extends Error {
	constructor(
		readonly statusCode: 400 | 404 | 409 | 503,
		readonly code: string,
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
		this.name = "AccountMirrorRefreshError";
	}
}

export interface AccountMirrorRefreshService {
	requestRefresh(request?: AccountMirrorRefreshRequest): Promise<AccountMirrorRefreshResult>;
}

function createEmptyMetadataEvidence(): AccountMirrorMetadataEvidence {
	return {
		identitySource: null,
		projectSampleIds: [],
		conversationSampleIds: [],
		truncated: {
			projects: false,
			conversations: false,
			artifacts: false,
		},
	};
}

export type AccountMirrorProviderGuardCensusInput = {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	detectedAtMs: number;
	ownedTarget?: { host: string; port: number; targetId: string };
	abortSignal?: AbortSignal;
};

export type AccountMirrorProviderGuardCensus = (
	input: AccountMirrorProviderGuardCensusInput,
) => Promise<AccountMirrorProviderGuardState | null>;

type AccountMirrorYieldCause = NonNullable<
	NonNullable<AccountMirrorMetadataEvidence["attachmentInventory"]>["yieldCause"]
>;

type AccountMirrorProviderCooldown = {
	providerCooldownUntilMs: number;
	providerGuard: AccountMirrorProviderGuardState;
};

export function createAccountMirrorRefreshService(input: {
	config: Record<string, unknown> | null | undefined;
	registry?: AccountMirrorStatusRegistry;
	dispatcher?: BrowserOperationDispatcher;
	metadataCollector?: AccountMirrorMetadataCollector;
	persistence?: AccountMirrorPersistence;
	providerGuardCensus?: AccountMirrorProviderGuardCensus;
	findManagedBrowserPid?: (managedProfileDir: string) => Promise<number | null>;
	terminateManagedBrowserProcess?: (input: {
		pid: number;
		managedProfileDir: string;
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	}) => Promise<void>;
	now?: () => Date;
	generateRequestId?: () => string;
	developmentControlsEnabled?: boolean;
	liveFollowAffinityFactory?: typeof createConfiguredLiveFollowAffinity;
	retireIdleChatgptLeasesAfterManagedBrowserShutdown?: typeof retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
}): AccountMirrorRefreshService {
	const now = input.now ?? (() => new Date());
	const registry =
		input.registry ??
		createAccountMirrorStatusRegistry({
			config: input.config,
			now,
		});
	const dispatcher =
		input.dispatcher ??
		createFileBackedBrowserOperationDispatcher({
			lockRoot: path.join(getAuracallHomeDir(), "browser-operations"),
		});
	const metadataCollector =
		input.metadataCollector ??
		(isResolvedUserConfig(input.config)
			? createChatgptAccountMirrorMetadataCollector(input.config)
			: createConfigBackedAccountMirrorMetadataCollector(input.config));
	const persistence =
		input.persistence ??
		createAccountMirrorPersistence({
			config: input.config,
		});
	const providerGuardCensus = input.providerGuardCensus ?? detectProviderGuardWithTargetCensus;
	const findManagedBrowserPid = input.findManagedBrowserPid ?? findChromePidUsingUserDataDir;
	const terminateManagedBrowserProcess =
		input.terminateManagedBrowserProcess ?? terminateManagedBrowserProcessByPid;
	const generateRequestId = input.generateRequestId ?? (() => `acctmirror_${randomUUID()}`);
	const liveFollowAffinityFactory =
		input.liveFollowAffinityFactory ?? createConfiguredLiveFollowAffinity;
	const retireIdleChatgptLeasesAfterManagedBrowserShutdown =
		input.retireIdleChatgptLeasesAfterManagedBrowserShutdown ??
		retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;

	return {
		async requestRefresh(request = {}) {
			const provider = request.provider ?? "chatgpt";
			const runtimeProfileId = request.runtimeProfileId ?? "default";
			const requestId = generateRequestId();
			const requestedPhase = normalizeRequestedCollectorPhase(request.requestedPhase);
			const development = resolveAccountMirrorDevelopmentPolicy({
				policy: request.development,
				provider,
				runtimeProfileId,
				serverCapabilityArmed: input.developmentControlsEnabled === true,
			});

			await registry.refreshPersistentState?.();
			const target = readSingleMirrorTarget({
				registry,
				provider,
				runtimeProfileId,
				explicitRefresh: request.explicitRefresh ?? true,
				ignoreMinimumInterval: development !== null || request.ignoreMinimumInterval === true,
				ignoreFailureBackoff:
					request.explicitRefresh === true &&
					(development !== null || request.ignoreFailureBackoff === true),
			});
			if (!target) {
				throw new AccountMirrorRefreshError(
					404,
					"account_mirror_target_not_found",
					`No configured account mirror target exists for ${provider}/${runtimeProfileId}.`,
					{ provider, runtimeProfileId },
				);
			}
			if (target.status !== "eligible") {
				throw new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					`Account mirror ${provider}/${runtimeProfileId} is ${target.status}: ${target.reason}.`,
					{
						provider,
						runtimeProfileId,
						reason: target.reason,
						eligibleAt: target.eligibleAt,
					},
				);
			}

			const queuedAt = now();
			const managedProfileDir = resolveMirrorManagedProfileDir({
				config: input.config,
				provider,
				runtimeProfileId,
				browserProfileId: target.browserProfileId,
			});
			registry.mergeState(
				{ provider, runtimeProfileId },
				{
					queued: true,
					running: false,
					lastRefreshRequestId: requestId,
					lastQueuedAtMs: queuedAt.getTime(),
					lastAttemptAtMs: queuedAt.getTime(),
					lastDispatcherBlockedBy: null,
				},
			);

			const operationInput = {
				managedProfileDir,
				serviceTarget: provider,
				kind: "browser-execution",
				operationClass: "exclusive-probe",
				ownerCommand: `account-mirror-refresh:${provider}:${runtimeProfileId}`,
			} as const;
			let affinity: Awaited<ReturnType<typeof liveFollowAffinityFactory>> | null = null;
			let acquired: BrowserOperationAcquireResult;
			try {
				affinity = isResolvedUserConfig(input.config)
					? await liveFollowAffinityFactory({
							userConfig: input.config,
							provider,
							runtimeProfileId,
							operationId: request.liveFollowOperationId ?? requestId,
							maxBrowserInteractionsPerMinute:
								development?.maxBrowserInteractionsPerMinute ??
								target.limits.maxBrowserInteractionsPerMinute,
							conversationReadCooldownMs:
								development?.conversationReadCooldownMs ?? target.limits.conversationReadCooldownMs,
							pageRefreshCooldownMs:
								development?.pageRefreshCooldownMs ?? target.limits.pageRefreshCooldownMs,
							renavigationCooldownMs:
								development?.renavigationCooldownMs ?? target.limits.renavigationCooldownMs,
							abortSignal: request.abortSignal,
							now,
						})
					: null;
				acquired =
					affinity?.operation ??
					(await dispatcher.acquireQueued(operationInput, {
						timeoutMs: normalizeNonNegativeInteger(request.queueTimeoutMs, 30_000),
						pollMs: normalizePositiveInteger(request.queuePollMs, 1_000),
						onBlocked: (result) => {
							recordBrowserOperationQueueObservation({
								event: "queued",
								key: result.key,
								requested: operationInput,
								blockedBy: result.blockedBy,
							});
							registry.mergeState(
								{ provider, runtimeProfileId },
								{
									queued: true,
									running: false,
									lastDispatcherKey: result.key,
									lastDispatcherBlockedBy: summarizeBrowserOperation(result.blockedBy),
								},
							);
						},
					}));
			} catch (error) {
				const completedAt = now();
				const failureCount = resolveNextConsecutiveFailureCount(target);
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
					},
				);
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: target.detectedIdentityKey,
						lastAttemptAtMs: queuedAt.getTime(),
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						lastRefreshRequestId: requestId,
						metadataCounts: target.metadataCounts,
						metadataEvidence: target.metadataEvidence,
						backfillLedger: target.backfillLedger,
					},
				});
				throw error;
			}
			if (!acquired.acquired) {
				const completedAt = now();
				const failureCount = resolveNextConsecutiveFailureCount(target);
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						lastFailureAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						lastDispatcherKey: acquired.key,
						lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
					},
				);
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: target.detectedIdentityKey,
						lastAttemptAtMs: queuedAt.getTime(),
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						lastRefreshRequestId: requestId,
						lastDispatcherKey: acquired.key,
						lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
						metadataCounts: target.metadataCounts,
						metadataEvidence: target.metadataEvidence,
						backfillLedger: target.backfillLedger,
					},
				});
				throw new AccountMirrorRefreshError(
					503,
					"account_mirror_browser_operation_busy",
					formatBrowserOperationBusyResult(acquired),
					{
						provider,
						runtimeProfileId,
						dispatcherKey: acquired.key,
						blockedBy: summarizeBrowserOperation(acquired.blockedBy),
					},
				);
			}

			const startedAt = now();
			registry.mergeState(
				{ provider, runtimeProfileId },
				{
					queued: false,
					running: true,
					lastStartedAtMs: startedAt.getTime(),
					lastDispatcherKey: acquired.operation.key,
					lastDispatcherOperationId: acquired.operation.id,
					lastDispatcherBlockedBy: null,
				},
			);

			let collection: AccountMirrorMetadataCollectorResult;
			const verifiedIdentityRef: { current: AccountMirrorVerifiedIdentityEvidence | null } = {
				current: null,
			};
			const latestCollectorProgressRef: {
				current: AccountMirrorMetadataEvidence["collectorProgress"] | null;
			} = {
				current: null,
			};
			const collectorDiagnostics: AccountMirrorCollectorDiagnosticEvent[] = [];
			const recordCollectorDiagnostic = (event: AccountMirrorCollectorDiagnosticEvent) => {
				collectorDiagnostics.push(event);
				if (collectorDiagnostics.length > 100) collectorDiagnostics.shift();
				void request.onCollectorDiagnosticEvent?.(event);
			};
			let latestYieldCause: AccountMirrorYieldCause | null = null;
			const collectorAbort = new AbortController();
			const collectorSignal = request.abortSignal
				? AbortSignal.any([collectorAbort.signal, request.abortSignal])
				: collectorAbort.signal;
			const providerTrafficPlanController = affinity?.providerTrafficGovernor
				? createAccountMirrorMetadataTrafficPlanController(affinity.providerTrafficGovernor, {
						maxPageReadsPerCycle:
							development?.maxConversations ?? target.limits.maxPageReadsPerCycle,
					})
				: null;
			if (providerTrafficPlanController?.governor.snapshotAdmissionState) {
				affinity?.bindProviderTrafficAdmissionState?.(
					providerTrafficPlanController.governor.snapshotAdmissionState.bind(
						providerTrafficPlanController.governor,
					),
				);
			}
			try {
				const providerGuard = await providerGuardCensus({
					config: input.config,
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					detectedAtMs: startedAt.getTime(),
					ownedTarget: affinity?.tabAffinity,
					abortSignal: collectorSignal,
				}).catch((error) => {
					if (provider === "chatgpt") throw error;
					return null;
				});
				if (providerGuard) {
					throw createProviderGuardError(providerGuard);
				}
				const previousConversationFreshness = await readCachedConversationFreshnessSummaries({
					persistence,
					provider,
					boundIdentityKey: target.expectedIdentityKey ?? null,
					limit: target.limits.maxConversationRowsPerCycle,
					materializationPolicy: request.materializationPolicy ?? null,
				});
				const previousCatalog = await persistence.readCatalog({
					provider,
					boundIdentityKey: target.expectedIdentityKey ?? null,
					limit: 10_000,
				});
				const previousConversationWorkStates = new Map(
					(previousCatalog?.conversations ?? []).flatMap((conversation) => {
						const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
						const state = normalizeAccountMirrorConversationWorkState(metadata.changeFrontierState);
						return state ? [[conversation.id, state] as const] : [];
					}),
				);
				const previousFiles = await readPreviousAccountMirrorFiles({
					persistence,
					provider,
					boundIdentityKey: target.expectedIdentityKey ?? null,
					catalogFiles: previousCatalog?.files ?? [],
					conversations: previousCatalog?.conversations ?? [],
					conversationLimit:
						development?.maxConversations ?? target.limits.maxConversationRowsPerCycle,
				});
				collection = await withTimeout(
					metadataCollector.collect({
						provider,
						runtimeProfileId,
						expectedIdentityKey: target.expectedIdentityKey ?? "",
						sweepMode: normalizeSweepMode(request.sweepMode),
						materializationPolicy: request.materializationPolicy ?? null,
						requestedPhase,
						conversationIds: request.conversationIds,
						limits: {
							maxPageReadsPerCycle:
								development?.maxConversations ?? target.limits.maxPageReadsPerCycle,
							maxConversationRowsPerCycle:
								development?.maxConversations ?? target.limits.maxConversationRowsPerCycle,
							maxArtifactRowsPerCycle: target.limits.maxArtifactRowsPerCycle,
							freshFrontierThreshold: target.limits.freshFrontierThreshold,
							maxBrowserInteractionsPerMinute:
								development?.maxBrowserInteractionsPerMinute ??
								target.limits.maxBrowserInteractionsPerMinute,
							conversationReadCooldownMs:
								development?.conversationReadCooldownMs ?? target.limits.conversationReadCooldownMs,
							pageRefreshCooldownMs:
								development?.pageRefreshCooldownMs ?? target.limits.pageRefreshCooldownMs,
							renavigationCooldownMs:
								development?.renavigationCooldownMs ?? target.limits.renavigationCooldownMs,
						},
						...(development?.providerCallTimeoutMs
							? { providerCallTimeoutMs: development.providerCallTimeoutMs }
							: {}),
						...(development ? { detailReadCap: development.maxConversations } : {}),
						previousEvidence: target.metadataEvidence,
						previousFiles,
						previousConversations: previousCatalog?.conversations ?? [],
						previousConversationFreshness,
						previousConversationWorkStates,
						onIdentityVerified: (evidence) => {
							verifiedIdentityRef.current = evidence;
						},
						onProgress: (progress) => {
							latestCollectorProgressRef.current = progress;
							void request.onCollectorProgress?.(progress);
						},
						onDiagnosticEvent: recordCollectorDiagnostic,
						abortSignal: collectorSignal,
						shouldYield: () => {
							const cause = getAccountMirrorYieldCause(acquired);
							if (cause) {
								latestYieldCause = cause;
								return true;
							}
							return false;
						},
						interactionGovernor: affinity?.interactionGovernor,
						providerTrafficGovernor:
							providerTrafficPlanController?.governor ?? affinity?.providerTrafficGovernor,
						providerTrafficPlanController: providerTrafficPlanController ?? undefined,
						tabAffinity: affinity?.tabAffinity,
					}),
					development?.maxWallTimeMs ??
						normalizePositiveInteger(request.collectorTimeoutMs, 120_000),
					`Account mirror metadata collector timed out for ${provider}/${runtimeProfileId}.`,
					collectorAbort,
					() =>
						recordCollectorDiagnostic({
							stage: "collector",
							event: "timed_out",
							observedAt: now().toISOString(),
							elapsedMs: now().getTime() - startedAt.getTime(),
							timeoutMs:
								development?.maxWallTimeMs ??
								normalizePositiveInteger(request.collectorTimeoutMs, 120_000),
							detail: `Outer collector deadline reached for ${provider}/${runtimeProfileId}.`,
							attachmentCursor: latestCollectorProgressRef.current?.attachmentCursor,
						}),
				);
				collection.evidence.collectorDiagnostics = [...collectorDiagnostics];
				collection = withYieldCause(collection, latestYieldCause);
				let collectionWithPriorManifests = await mergeCollectionWithPersistedCatalog({
					persistence,
					provider,
					boundIdentityKey: target.expectedIdentityKey ?? collection.detectedIdentityKey,
					collection,
					scoped: Boolean(request.conversationIds?.length),
				});
				if (request.conversationIds?.length) {
					const prior = target.metadataEvidence;
					collectionWithPriorManifests.evidence = {
						...collectionWithPriorManifests.evidence,
						projectSampleIds: prior?.projectSampleIds ?? [],
						conversationSampleIds: prior?.conversationSampleIds ?? [],
						truncated: prior?.truncated ?? { projects: true, conversations: true, artifacts: true },
						projectConversations: prior?.projectConversations,
						attachmentInventory: prior?.attachmentInventory,
						conversationFreshnessFrontier: prior?.conversationFreshnessFrontier,
						providerIndexEpoch: prior?.providerIndexEpoch,
						routeProgress: prior?.routeProgress,
						assetInventory: prior?.assetInventory,
						collectorProgress: prior?.collectorProgress,
					};
				}
				const completedAt = now();
				const providerCooldown = await readAccountMirrorProviderCooldown({
					provider,
					runtimeProfileId,
					action: "account-mirror-refresh",
					nowMs: completedAt.getTime(),
				});
				collectionWithPriorManifests = withProviderGuardScrapeBudgetCorrelation(
					collectionWithPriorManifests,
					providerCooldown?.providerGuard ?? null,
				);
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
						detectedIdentitySource: collection.detectedIdentitySource ?? "provider-app",
						detectedIdentityObservedAtMs:
							collection.detectedIdentityObservedAtMs ?? completedAt.getTime(),
						detectedIdentityConfidence: collection.detectedIdentityConfidence ?? "authoritative",
						identityMismatchLastCheckedAtMs: target.identityEvidence.recheckable
							? completedAt.getTime()
							: undefined,
						identityMismatchRepair: createIdentityMismatchRepairState({
							target,
							currentDetectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
							requestId,
							checkedAtMs: completedAt.getTime(),
							source: collection.detectedIdentitySource ?? "provider-app",
						}),
						lastSuccessAtMs: completedAt.getTime(),
						lastFailureAtMs: null,
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: 0,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs ?? null,
						providerHardStopAtMs: null,
						providerGuard: providerCooldown?.providerGuard ?? null,
						metadataCounts: collectionWithPriorManifests.metadataCounts,
						metadataEvidence: collectionWithPriorManifests.evidence,
					},
				);
				const preliminaryMirrorStatus = registry.readStatus({
					provider,
					runtimeProfileId,
					explicitRefresh: true,
				});
				const refreshedBackfillLedger = request.conversationIds?.length
					? target.backfillLedger
					: deriveAccountMirrorBackfillLedger({
							provider,
							runtimeProfileId,
							browserProfileId: target.browserProfileId,
							boundIdentityKey:
								target.expectedIdentityKey ??
								collectionWithPriorManifests.detectedIdentityKey ??
								"",
							updatedAt: completedAt.toISOString(),
							previous: target.backfillLedger,
							evidence: collectionWithPriorManifests.evidence,
							mirrorCompleteness: preliminaryMirrorStatus.entries[0]?.mirrorCompleteness ?? null,
						});
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						backfillLedger: refreshedBackfillLedger,
					},
				);
				await persistence.writeSnapshot({
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey:
						target.expectedIdentityKey ?? collectionWithPriorManifests.detectedIdentityKey ?? "",
					detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
					detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
					requestId,
					startedAt: startedAt.toISOString(),
					completedAt: completedAt.toISOString(),
					dispatcherKey: acquired.operation.key,
					dispatcherOperationId: acquired.operation.id,
					metadataCounts: collectionWithPriorManifests.metadataCounts,
					metadataEvidence: collectionWithPriorManifests.evidence,
					manifests: collectionWithPriorManifests.manifests,
					visitBundles: collectionWithPriorManifests.visitBundles,
				});
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey:
						target.expectedIdentityKey ?? collectionWithPriorManifests.detectedIdentityKey ?? "",
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
						detectedIdentitySource: collection.detectedIdentitySource ?? "provider-app",
						detectedIdentityObservedAtMs:
							collection.detectedIdentityObservedAtMs ?? completedAt.getTime(),
						detectedIdentityConfidence: collection.detectedIdentityConfidence ?? "authoritative",
						identityMismatchLastCheckedAtMs: target.identityEvidence.recheckable
							? completedAt.getTime()
							: undefined,
						identityMismatchRepair: createIdentityMismatchRepairState({
							target,
							currentDetectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
							requestId,
							checkedAtMs: completedAt.getTime(),
							source: collection.detectedIdentitySource ?? "provider-app",
						}),
						lastAttemptAtMs: queuedAt.getTime(),
						lastSuccessAtMs: completedAt.getTime(),
						lastFailureAtMs: null,
						lastCompletedAtMs: completedAt.getTime(),
						lastRefreshRequestId: requestId,
						lastStartedAtMs: startedAt.getTime(),
						lastDispatcherKey: acquired.operation.key,
						lastDispatcherOperationId: acquired.operation.id,
						consecutiveFailureCount: 0,
						providerCooldownUntilMs: providerCooldown?.providerCooldownUntilMs ?? null,
						providerGuard: providerCooldown?.providerGuard ?? null,
						providerHardStopAtMs: null,
						metadataCounts: collectionWithPriorManifests.metadataCounts,
						metadataEvidence: collectionWithPriorManifests.evidence,
						backfillLedger: refreshedBackfillLedger,
					},
				});
				const mirrorStatus = registry.readStatus({
					provider,
					runtimeProfileId,
					explicitRefresh: true,
				});
				await affinity?.completeSuccess();
				const browserLifecycle = await cleanupManagedBrowserAfterRefresh({
					request: affinity ? { ...request, cleanupManagedBrowserAfterRefresh: false } : request,
					config: input.config,
					provider,
					runtimeProfileId,
					managedProfileDir,
					findManagedBrowserPid,
					terminateManagedBrowserProcess,
					retireIdleChatgptLeasesAfterManagedBrowserShutdown,
				});
				return {
					object: "account_mirror_refresh",
					requestId,
					status: "completed",
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					requestedPhase,
					startedAt: startedAt.toISOString(),
					completedAt: completedAt.toISOString(),
					dispatcher: {
						key: acquired.operation.key,
						operationId: acquired.operation.id,
						blockedBy: null,
					},
					metadataCounts: collectionWithPriorManifests.metadataCounts,
					metadataEvidence: collectionWithPriorManifests.evidence,
					mirrorCompleteness: mirrorStatus.entries[0]?.mirrorCompleteness ?? {
						state: "unknown",
						summary: "Mirror completeness could not be derived from the refreshed status.",
						remainingDetailSurfaces: null,
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: false,
							attachmentCursorPresent: false,
						},
					},
					detectedIdentityKey: collectionWithPriorManifests.detectedIdentityKey,
					detectedAccountLevel: collectionWithPriorManifests.detectedAccountLevel,
					mirrorStatus,
					browserLifecycle,
					development,
				};
			} catch (error) {
				await affinity?.completeFailure(error);
				const completedAt = now();
				const isIdentityMismatch = error instanceof AccountMirrorIdentityMismatchError;
				const verifiedIdentity = verifiedIdentityRef.current;
				const verifiedIdentityRepair =
					!isIdentityMismatch && verifiedIdentity
						? createVerifiedIdentityRepairState({
								target,
								verifiedIdentity,
								requestId,
								checkedAtMs: completedAt.getTime(),
							})
						: null;
				const providerGuard = isIdentityMismatch
					? null
					: extractProviderGuard(error, completedAt.getTime());
				const providerCooldown = !providerGuard
					? await readAccountMirrorProviderCooldown({
							provider,
							runtimeProfileId,
							action: "account-mirror-refresh",
							error,
							nowMs: completedAt.getTime(),
						})
					: null;
				const failureMetadataEvidence =
					latestCollectorProgressRef.current || collectorDiagnostics.length > 0
						? {
								...(target.metadataEvidence ?? createEmptyMetadataEvidence()),
								collectorDiagnostics: [...collectorDiagnostics],
								...(latestCollectorProgressRef.current
									? {
											collectorProgress: {
												...latestCollectorProgressRef.current,
												event: "failed" as const,
												observedAt: completedAt.toISOString(),
											},
										}
									: {}),
							}
						: target.metadataEvidence;
				const failureCount = resolveNextConsecutiveFailureCount(target);
				if (!isIdentityMismatch && !providerGuard && !providerCooldown) {
					await recordAccountMirrorRefreshDomDriftObservation({
						provider,
						runtimeProfileId,
						requestId,
						error,
						dispatcherKey: acquired.operation.key,
						dispatcherOperationId: acquired.operation.id,
					});
				}
				registry.mergeState(
					{ provider, runtimeProfileId },
					{
						queued: false,
						running: false,
						detectedIdentityKey: isIdentityMismatch
							? error.detectedIdentityKey
							: verifiedIdentity?.detectedIdentityKey,
						detectedIdentitySource: isIdentityMismatch
							? "provider-app"
							: verifiedIdentity?.detectedIdentitySource,
						detectedIdentityObservedAtMs: isIdentityMismatch
							? completedAt.getTime()
							: verifiedIdentity?.detectedIdentityObservedAtMs,
						detectedIdentityConfidence: isIdentityMismatch
							? "authoritative"
							: verifiedIdentity?.detectedIdentityConfidence,
						identityMismatchLastCheckedAtMs:
							isIdentityMismatch || verifiedIdentityRepair ? completedAt.getTime() : undefined,
						identityMismatchRepair: isIdentityMismatch
							? {
									status: "current_mismatch_confirmed",
									previousDetectedIdentityKey: target.detectedIdentityKey,
									currentDetectedIdentityKey: error.detectedIdentityKey,
									repairedAtMs: null,
									checkedAtMs: completedAt.getTime(),
									source: "provider-app",
									requestId,
								}
							: verifiedIdentityRepair,
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						consecutiveFailureCount: failureCount,
						providerCooldownUntilMs:
							providerGuard?.state === "cooldown"
								? providerGuard.cooldownUntilMs
								: providerCooldown?.providerCooldownUntilMs,
						providerHardStopAtMs:
							providerGuard?.state === "manual_clear_required" ? completedAt.getTime() : undefined,
						providerGuard: providerGuard ?? providerCooldown?.providerGuard,
						metadataEvidence: failureMetadataEvidence,
					},
				);
				await persistRefreshState(persistence, {
					provider,
					runtimeProfileId,
					browserProfileId: target.browserProfileId,
					boundIdentityKey: target.expectedIdentityKey,
					updatedAt: completedAt,
					state: {
						detectedIdentityKey: isIdentityMismatch
							? error.detectedIdentityKey
							: (verifiedIdentity?.detectedIdentityKey ?? target.detectedIdentityKey),
						detectedIdentitySource: isIdentityMismatch
							? "provider-app"
							: (verifiedIdentity?.detectedIdentitySource ?? target.identityEvidence.source),
						detectedIdentityObservedAtMs: isIdentityMismatch
							? completedAt.getTime()
							: (verifiedIdentity?.detectedIdentityObservedAtMs ??
								parseIsoTimestampMs(target.identityEvidence.observedAt)),
						detectedIdentityConfidence: isIdentityMismatch
							? "authoritative"
							: (verifiedIdentity?.detectedIdentityConfidence ??
								target.identityEvidence.confidence),
						identityMismatchLastCheckedAtMs:
							isIdentityMismatch || verifiedIdentityRepair ? completedAt.getTime() : undefined,
						identityMismatchRepair: isIdentityMismatch
							? {
									status: "current_mismatch_confirmed",
									previousDetectedIdentityKey: target.detectedIdentityKey,
									currentDetectedIdentityKey: error.detectedIdentityKey,
									repairedAtMs: null,
									checkedAtMs: completedAt.getTime(),
									source: "provider-app",
									requestId,
								}
							: (verifiedIdentityRepair ??
								createIdentityMismatchRepairStateFromStatus(target.identityEvidence.repair)),
						lastAttemptAtMs: queuedAt.getTime(),
						lastFailureAtMs: completedAt.getTime(),
						lastCompletedAtMs: completedAt.getTime(),
						lastRefreshRequestId: requestId,
						lastStartedAtMs: startedAt.getTime(),
						lastDispatcherKey: acquired.operation.key,
						lastDispatcherOperationId: acquired.operation.id,
						consecutiveFailureCount: failureCount,
						providerCooldownUntilMs:
							providerGuard?.state === "cooldown"
								? providerGuard.cooldownUntilMs
								: providerCooldown?.providerCooldownUntilMs,
						providerHardStopAtMs:
							providerGuard?.state === "manual_clear_required" ? completedAt.getTime() : undefined,
						providerGuard: providerGuard ?? providerCooldown?.providerGuard,
						metadataCounts: target.metadataCounts,
						metadataEvidence: failureMetadataEvidence,
						backfillLedger: target.backfillLedger,
					},
				});
				await cleanupManagedBrowserAfterRefresh({
					request: affinity ? { ...request, cleanupManagedBrowserAfterRefresh: false } : request,
					config: input.config,
					provider,
					runtimeProfileId,
					managedProfileDir,
					findManagedBrowserPid,
					terminateManagedBrowserProcess,
					retireIdleChatgptLeasesAfterManagedBrowserShutdown,
				});
				if (isIdentityMismatch) {
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_identity_mismatch",
						error.message,
						{
							provider,
							runtimeProfileId,
							detectedProvider: error.provider,
							expectedIdentityKey: error.expectedIdentityKey,
							detectedIdentityKey: error.detectedIdentityKey,
						},
					);
				}
				if (providerGuard) {
					const cooldownUntilMs =
						providerGuard.state === "cooldown" ? providerGuard.cooldownUntilMs : null;
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_provider_guard",
						providerGuard.state === "cooldown" && cooldownUntilMs
							? `${providerGuard.summary} Automation is delayed until ${new Date(
									cooldownUntilMs,
								).toISOString()} before ${provider}/${runtimeProfileId} live follow can continue.`
							: `${providerGuard.summary} Manual clearance is required before ${provider}/${runtimeProfileId} live follow can continue.`,
						{
							provider,
							runtimeProfileId,
							providerCooldownUntilMs: cooldownUntilMs,
							providerGuard,
						},
					);
				}
				if (providerCooldown) {
					throw new AccountMirrorRefreshError(
						409,
						"account_mirror_provider_cooldown",
						`${providerCooldown.providerGuard.summary} Automation is delayed until ${new Date(
							providerCooldown.providerCooldownUntilMs,
						).toISOString()} before ${provider}/${runtimeProfileId} live follow can continue.`,
						{
							provider,
							runtimeProfileId,
							providerCooldownUntilMs: providerCooldown.providerCooldownUntilMs,
							providerGuard: providerCooldown.providerGuard,
						},
					);
				}
				throw error;
			} finally {
				await acquired.release();
			}
		},
	};
}

function createIdentityMismatchRepairState(input: {
	target: AccountMirrorStatusEntry;
	currentDetectedIdentityKey: string | null;
	requestId: string;
	checkedAtMs: number;
	source: string | null | undefined;
}): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!input.target.identityEvidence.recheckable) {
		return createIdentityMismatchRepairStateFromStatus(input.target.identityEvidence.repair);
	}
	return {
		status: "stale_mismatch_repaired",
		previousDetectedIdentityKey: input.target.detectedIdentityKey,
		currentDetectedIdentityKey: input.currentDetectedIdentityKey,
		repairedAtMs: input.checkedAtMs,
		checkedAtMs: input.checkedAtMs,
		source: input.source ?? "provider-app",
		requestId: input.requestId,
	};
}

function createVerifiedIdentityRepairState(input: {
	target: AccountMirrorStatusEntry;
	verifiedIdentity: AccountMirrorVerifiedIdentityEvidence;
	requestId: string;
	checkedAtMs: number;
}): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!input.target.identityEvidence.recheckable) {
		return createIdentityMismatchRepairStateFromStatus(input.target.identityEvidence.repair);
	}
	return {
		status: "stale_mismatch_repaired",
		previousDetectedIdentityKey: input.target.detectedIdentityKey,
		currentDetectedIdentityKey: input.verifiedIdentity.detectedIdentityKey,
		repairedAtMs: input.checkedAtMs,
		checkedAtMs: input.checkedAtMs,
		source: input.verifiedIdentity.detectedIdentitySource,
		requestId: input.requestId,
	};
}

async function readCachedConversationFreshnessSummaries(input: {
	persistence: AccountMirrorPersistence;
	provider: AccountMirrorProvider;
	boundIdentityKey: string | null;
	limit: number;
	materializationPolicy: AccountMirrorConversationMaterializationPolicy | null;
}) {
	const existing = await input.persistence
		.readCatalog({
			provider: input.provider,
			boundIdentityKey: input.boundIdentityKey,
			limit: Math.max(1, Math.floor(input.limit || 10_000)),
		})
		.catch(() => null);
	const conversations = existing?.conversations ?? [];
	if (!conversations.length) {
		return buildConversationFreshnessSummaryMap(conversations);
	}
	const hydrated = await Promise.all(
		conversations.map(async (conversation, index) => {
			const contextRequest = {
				provider: input.provider,
				boundIdentityKey: input.boundIdentityKey,
				conversationId: conversation.id,
			};
			const [contextEntry, conversationFiles, conversationAttachments] = await Promise.all([
				input.persistence.readConversationContextEntry?.(contextRequest).catch(() => null),
				input.persistence.readConversationFiles?.(contextRequest).catch(() => []),
				input.persistence.readConversationAttachments?.(contextRequest).catch(() => []),
			]);
			const context = contextEntry?.context ?? null;
			const freshnessItem = withProviderFreshnessObservedAt(
				stripCachedConversationFreshness(conversation),
			);
			const freshness = deriveAccountMirrorConversationFreshness({
				conversationId: conversation.id,
				item: freshnessItem,
				indexRank: index,
				target: {
					lastCompletedAt: null,
					lastSuccessAt: null,
					reason: null,
					providerGuard: null,
					mirrorCompleteness: null,
				},
				detail: context
					? {
							exists: true,
							observedAt: contextEntry?.fetchedAt ?? null,
							messageCount: context.messages.length,
							fileCount: context.files?.length ?? 0,
							artifactCount: context.artifacts?.length ?? 0,
							sourceCount: context.sources?.length ?? 0,
						}
					: {
							exists: false,
							observedAt: null,
							messageCount: null,
							fileCount: null,
							artifactCount: null,
							sourceCount: null,
						},
				assets: collectCachedConversationAssets(conversation.id, {
					artifacts: existing?.artifacts ?? [],
					files: existing?.files ?? [],
					media: existing?.media ?? [],
					conversationFiles: conversationFiles ?? [],
					conversationAttachments: conversationAttachments ?? [],
					context,
				}),
				materializationPolicy: input.materializationPolicy,
			});
			return {
				...conversation,
				conversationFreshness: freshness,
			};
		}),
	);
	return buildConversationFreshnessSummaryMap(hydrated);
}

function stripCachedConversationFreshness<
	T extends {
		metadata?: Record<string, unknown>;
		conversationFreshness?: unknown;
		freshness?: unknown;
	},
>(conversation: T): T {
	const {
		conversationFreshness: _conversationFreshness,
		freshness: _freshness,
		...rest
	} = conversation;
	const restRecord = rest as Omit<T, "conversationFreshness" | "freshness"> & {
		metadata?: unknown;
	};
	const metadata: Record<string, unknown> = isRecord(restRecord.metadata)
		? restRecord.metadata
		: {};
	const {
		conversationFreshness: _metadataConversationFreshness,
		freshness: _metadataFreshness,
		...cleanMetadata
	} = metadata;
	return {
		...rest,
		metadata: cleanMetadata,
	} as T;
}

function withProviderFreshnessObservedAt<
	T extends { updatedAt?: string; metadata?: Record<string, unknown> },
>(conversation: T): T {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	const remoteMtime =
		normalizeIsoTimestamp(conversation.updatedAt) ??
		normalizeIsoTimestamp(readStringField(metadata.updatedAt)) ??
		normalizeIsoTimestamp(readStringField(metadata.lastMessageAt)) ??
		normalizeIsoTimestamp(readStringField(metadata.lastActivityAt));
	if (!remoteMtime) {
		return conversation;
	}
	return {
		...conversation,
		indexObservedAt: remoteMtime,
		metadata: {
			...metadata,
			indexObservedAt: remoteMtime,
		},
	} as T;
}

function collectCachedConversationAssets(
	conversationId: string,
	input: {
		artifacts: readonly unknown[];
		files: readonly unknown[];
		media: readonly unknown[];
		conversationFiles?: readonly unknown[];
		conversationAttachments?: readonly unknown[];
		context: unknown;
	},
): unknown[] {
	const assets: unknown[] = [];
	for (const item of [
		...input.artifacts,
		...input.files,
		...input.media,
		...(input.conversationFiles ?? []),
		...(input.conversationAttachments ?? []),
	]) {
		if (readConversationId(item) === conversationId) {
			assets.push(item);
		}
	}
	if (isRecord(input.context)) {
		for (const field of ["files", "artifacts", "sources"] as const) {
			const items = input.context[field];
			if (Array.isArray(items)) {
				assets.push(...items);
			}
		}
	}
	return mergeCachedConversationAssetEvidence(assets);
}

function readConversationId(item: unknown): string | null {
	if (!isRecord(item)) return null;
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const value =
		readStringField(item.conversationId) ??
		readStringField(item.providerConversationId) ??
		readStringField(metadata.conversationId) ??
		readStringField(metadata.providerConversationId);
	return value?.trim() || null;
}

function mergeCachedConversationAssetEvidence(assets: readonly unknown[]): unknown[] {
	const byKey = new Map<string, unknown>();
	const unkeyed: unknown[] = [];
	for (const asset of assets) {
		const key = readAssetEvidenceKey(asset);
		if (!key) {
			unkeyed.push(asset);
			continue;
		}
		const existing = byKey.get(key);
		byKey.set(key, existing ? mergeAssetEvidence(existing, asset) : asset);
	}
	return [...byKey.values(), ...unkeyed];
}

function mergeAssetEvidence(existing: unknown, incoming: unknown): unknown {
	if (!isRecord(existing) || !isRecord(incoming)) {
		return hasLocalAssetEvidenceLike(incoming) ? incoming : existing;
	}
	const existingMetadata = isRecord(existing.metadata) ? existing.metadata : {};
	const incomingMetadata = isRecord(incoming.metadata) ? incoming.metadata : {};
	const preferIncoming =
		hasLocalAssetEvidenceLike(incoming) && !hasLocalAssetEvidenceLike(existing);
	const primary = preferIncoming ? incoming : existing;
	const secondary = preferIncoming ? existing : incoming;
	return {
		...secondary,
		...primary,
		metadata: {
			...existingMetadata,
			...incomingMetadata,
		},
	};
}

function readAssetEvidenceKey(asset: unknown): string | null {
	if (!isRecord(asset)) return null;
	const metadata = isRecord(asset.metadata) ? asset.metadata : {};
	const providerFileId =
		readStringField(asset.providerFileId) ??
		readStringField(metadata.providerFileId) ??
		readStringField(metadata.fileId);
	if (providerFileId) return `provider-file:${providerFileId}`;
	const remoteUrl = readStringField(asset.remoteUrl) ?? readStringField(metadata.remoteUrl);
	if (remoteUrl) return `remote-url:${remoteUrl}`;
	const id = readStringField(asset.id);
	if (id) return `id:${id}`;
	const name = readStringField(asset.name) ?? readStringField(asset.displayName);
	const turnId = readStringField(metadata.turnId) ?? readStringField(metadata.messageId);
	return name && turnId ? `turn-name:${turnId}:${name}` : null;
}

function hasLocalAssetEvidenceLike(asset: unknown): boolean {
	if (!isRecord(asset)) return false;
	const metadata = isRecord(asset.metadata) ? asset.metadata : {};
	return Boolean(
		readStringField(asset.localPath) ??
			readStringField(asset.storageRelpath) ??
			readStringField(asset.cacheKey) ??
			readStringField(asset.checksumSha256) ??
			readStringField(metadata.localPath) ??
			readStringField(metadata.storageRelpath) ??
			readStringField(metadata.cacheKey) ??
			readStringField(metadata.checksumSha256),
	);
}

function readStringField(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
	const raw = readStringField(value);
	if (!raw) return null;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function createIdentityMismatchRepairStateFromStatus(
	repair: AccountMirrorStatusEntry["identityEvidence"]["repair"],
): AccountMirrorStatusState["identityMismatchRepair"] {
	if (!repair) return null;
	return {
		status: repair.status,
		previousDetectedIdentityKey: repair.previousDetectedIdentityKey,
		currentDetectedIdentityKey: repair.currentDetectedIdentityKey,
		repairedAtMs: parseIsoTimestampMs(repair.repairedAt),
		checkedAtMs: parseIsoTimestampMs(repair.checkedAt),
		source: repair.source,
		requestId: repair.requestId,
	};
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

async function readAccountMirrorProviderCooldown(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	action: string;
	nowMs: number;
	error?: unknown;
}): Promise<AccountMirrorProviderCooldown | null> {
	if (input.provider !== "chatgpt") {
		return null;
	}
	try {
		const state = await readChatgptRateLimitGuardState({
			profileName: input.runtimeProfileId,
		});
		const cooldownUntilMs =
			typeof state?.cooldownUntil === "number" && Number.isFinite(state.cooldownUntil)
				? state.cooldownUntil
				: null;
		if (!cooldownUntilMs || cooldownUntilMs <= input.nowMs) {
			return null;
		}
		const detectedAtMs =
			typeof state?.cooldownDetectedAt === "number" && Number.isFinite(state.cooldownDetectedAt)
				? state.cooldownDetectedAt
				: input.nowMs;
		const cooldownReason = state?.cooldownReason?.trim();
		const summary = cooldownReason
			? `ChatGPT rate limit detected: ${cooldownReason}`
			: "ChatGPT rate limit cooldown is active.";
		return {
			providerCooldownUntilMs: cooldownUntilMs,
			providerGuard: {
				state: "cooldown",
				kind: "unknown",
				summary,
				detectedAtMs,
				cooldownUntilMs,
				action: state?.cooldownAction?.trim() || input.action,
			},
		};
	} catch {
		return null;
	}
}

async function cleanupManagedBrowserAfterRefresh(input: {
	request: AccountMirrorRefreshRequest;
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	managedProfileDir: string;
	findManagedBrowserPid: (managedProfileDir: string) => Promise<number | null>;
	terminateManagedBrowserProcess: (input: {
		pid: number;
		managedProfileDir: string;
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	}) => Promise<void>;
	retireIdleChatgptLeasesAfterManagedBrowserShutdown: typeof retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
}): Promise<AccountMirrorRefreshBrowserLifecycle | null> {
	if (input.request.cleanupManagedBrowserAfterRefresh !== true) {
		return null;
	}
	const pid = await input.findManagedBrowserPid(input.managedProfileDir);
	if (!pid) {
		try {
			await reconcileStoppedAccountMirrorChatgptLeases(input);
		} catch (error) {
			return {
				cleanupRequested: true,
				status: "failed",
				managedProfileDir: input.managedProfileDir,
				pid: null,
				message: error instanceof Error ? error.message : String(error),
			};
		}
		return {
			cleanupRequested: true,
			status: "not_running",
			managedProfileDir: input.managedProfileDir,
			pid: null,
			message: "No managed browser process was found after account-mirror refresh.",
		};
	}
	try {
		await input.terminateManagedBrowserProcess({
			pid,
			managedProfileDir: input.managedProfileDir,
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
		});
		const releaseDeadline = Date.now() + 5_000;
		let remainingOwnerPid = await input.findManagedBrowserPid(input.managedProfileDir);
		while (remainingOwnerPid && Date.now() < releaseDeadline) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			remainingOwnerPid = await input.findManagedBrowserPid(input.managedProfileDir);
		}
		if (remainingOwnerPid) {
			return {
				cleanupRequested: true,
				status: "failed",
				managedProfileDir: input.managedProfileDir,
				pid: remainingOwnerPid,
				message: `Managed browser profile remained owned by PID ${remainingOwnerPid} after bounded cleanup.`,
			};
		}
		await reconcileStoppedAccountMirrorChatgptLeases(input);
		return {
			cleanupRequested: true,
			status: "terminated",
			managedProfileDir: input.managedProfileDir,
			pid,
			message: "Terminated managed browser process after bounded account-mirror refresh.",
		};
	} catch (error) {
		return {
			cleanupRequested: true,
			status: "failed",
			managedProfileDir: input.managedProfileDir,
			pid,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

async function reconcileStoppedAccountMirrorChatgptLeases(input: {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	managedProfileDir: string;
	retireIdleChatgptLeasesAfterManagedBrowserShutdown: typeof retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
}): Promise<void> {
	if (input.provider !== "chatgpt" || !input.config || typeof input.config !== "object") return;
	await input.retireIdleChatgptLeasesAfterManagedBrowserShutdown({
		userConfig: input.config,
		runtimeProfileId: input.runtimeProfileId,
		managedBrowserProfile: input.managedProfileDir,
	});
}

async function terminateManagedBrowserProcessByPid(input: { pid: number }): Promise<void> {
	process.kill(input.pid, "SIGTERM");
	await new Promise((resolve) => setTimeout(resolve, 1500));
	try {
		process.kill(input.pid, 0);
		process.kill(input.pid, "SIGKILL");
	} catch {
		// already stopped
	}
}

async function recordAccountMirrorRefreshDomDriftObservation(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	requestId: string;
	error: unknown;
	dispatcherKey: string | null;
	dispatcherOperationId: string | null;
}): Promise<void> {
	try {
		await recordDomDriftObservation({
			service: input.provider,
			surface: "account-mirror-refresh",
			action: "collect-metadata",
			expectedLabels: [],
			observedLabel: null,
			fallbackKind: classifyRefreshFailureFallback(input.error),
			metadata: {
				source: "accountMirror.refreshService",
				runtimeProfileId: input.runtimeProfileId,
				requestId: input.requestId,
				dispatcherKey: input.dispatcherKey,
				dispatcherOperationId: input.dispatcherOperationId,
				errorMessage: errorMessage(input.error),
			},
		});
	} catch {
		// Drift observations are diagnostic only; refresh failure semantics should
		// remain governed by the original collector error.
	}
}

async function persistRefreshState(
	persistence: AccountMirrorPersistence,
	input: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		browserProfileId: string | null;
		boundIdentityKey: string | null;
		updatedAt: Date;
		state: AccountMirrorStatusState;
	},
): Promise<void> {
	await persistence.writeState?.({
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId,
		boundIdentityKey: input.boundIdentityKey,
		updatedAt: input.updatedAt.toISOString(),
		state: input.state,
	});
}

function resolveNextConsecutiveFailureCount(target: AccountMirrorStatusEntry): number {
	return Math.max(1, Math.floor(target.consecutiveFailureCount ?? 0) + 1);
}

function classifyRefreshFailureFallback(error: unknown): string {
	const message = errorMessage(error);
	if (/timed out/i.test(message)) return "collector-timeout";
	return "collector-failure";
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
	abortController?: AbortController,
	onTimeout?: () => void,
): Promise<T> {
	let timeout: NodeJS.Timeout | null = null;
	return new Promise<T>((resolve, reject) => {
		timeout = setTimeout(() => {
			const error = new Error(message);
			onTimeout?.();
			abortController?.abort(error);
			reject(error);
		}, timeoutMs);
		promise.then(
			(value) => {
				if (timeout) clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				if (timeout) clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function getAccountMirrorYieldCause(
	acquired: BrowserOperationAcquiredResult,
): AccountMirrorYieldCause | null {
	const observations = summarizeBrowserOperationQueueObservationsByKey(acquired.operation.key, 10);
	const observation = [...observations.items]
		.reverse()
		.find((item) => isYieldTriggerObservation(item, acquired));
	if (!observation) {
		return null;
	}
	return {
		observedAt: observation.at,
		ownerCommand: observation.requested?.ownerCommand ?? null,
		kind: observation.requested?.kind ?? null,
		operationClass: observation.requested?.operationClass ?? null,
	};
}

function isYieldTriggerObservation(
	observation: BrowserOperationQueueObservation,
	acquired: BrowserOperationAcquiredResult,
): boolean {
	return (
		observation.event === "queued" &&
		observation.blockedBy?.id === acquired.operation.id &&
		observation.blockedBy.ownerCommand === acquired.operation.ownerCommand &&
		isRealWorkQueuedBehindMirror(observation.requested?.ownerCommand ?? null) &&
		isHigherPriorityQueuedOperation(observation.at, acquired.operation.startedAt)
	);
}

function isRealWorkQueuedBehindMirror(ownerCommand: string | null): boolean {
	return ownerCommand === null || !ownerCommand.startsWith("account-mirror-refresh:");
}

function isHigherPriorityQueuedOperation(
	observationAt: string,
	operationStartedAt: string,
): boolean {
	const observationMs = Date.parse(observationAt);
	const operationStartedMs = Date.parse(operationStartedAt);
	return (
		Number.isFinite(observationMs) &&
		Number.isFinite(operationStartedMs) &&
		observationMs >= operationStartedMs
	);
}

function withYieldCause(
	collection: AccountMirrorMetadataCollectorResult,
	yieldCause: AccountMirrorYieldCause | null,
): AccountMirrorMetadataCollectorResult {
	const inventory = collection.evidence.attachmentInventory;
	if (!yieldCause || inventory?.yielded !== true) {
		return collection;
	}
	return {
		...collection,
		evidence: {
			...collection.evidence,
			attachmentInventory: {
				...inventory,
				yieldCause,
			},
		},
	};
}

function withProviderGuardScrapeBudgetCorrelation(
	collection: AccountMirrorMetadataCollectorResult,
	providerGuard: AccountMirrorProviderGuardState | null,
): AccountMirrorMetadataCollectorResult {
	const scrapeBudget = collection.evidence.scrapeBudget;
	if (!providerGuard || !scrapeBudget) {
		return collection;
	}
	const attachmentYieldCause = collection.evidence.attachmentInventory?.yieldCause?.kind ?? null;
	const yieldReason = attachmentYieldCause ?? scrapeBudget.providerInteractions.yieldReason ?? null;
	return {
		...collection,
		evidence: {
			...collection.evidence,
			scrapeBudget: {
				...scrapeBudget,
				providerGuardCorrelation: {
					state: providerGuard.state,
					kind: providerGuard.kind,
					summary: providerGuard.summary,
					detectedAt: formatEpochMs(providerGuard.detectedAtMs),
					cooldownUntil: formatEpochMs(providerGuard.cooldownUntilMs),
					action: providerGuard.action ?? null,
					correlatedWithYield:
						collection.evidence.attachmentInventory?.yielded === true ||
						scrapeBudget.providerInteractions.yielded === true,
					yieldReason,
				},
			},
		},
	};
}

function formatEpochMs(value: number | null | undefined): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return new Date(value).toISOString();
}

export async function detectProviderGuardWithTargetCensus(
	input: AccountMirrorProviderGuardCensusInput,
): Promise<AccountMirrorProviderGuardState | null> {
	if (input.provider === "chatgpt") {
		// The collector checks its loaded page when there is no pre-acquired crawler.
		// Restored tabs are not evidence about the page this operation uses.
		if (!input.ownedTarget) return null;
		const abort = new AbortController();
		const signal = input.abortSignal
			? AbortSignal.any([input.abortSignal, abort.signal])
			: abort.signal;
		const probe = await withTimeout(
			readVisibleChatgptRateLimitCensusProbe({
				...input.ownedTarget,
				abortSignal: signal,
			}),
			10_000,
			`ChatGPT warning check timed out for owned tab ${input.ownedTarget.targetId}.`,
			abort,
		);
		const rateLimit = classifyChatgptRateLimitCensusProbeForTest({
			text: probe?.text,
			ariaLabel: probe?.ariaLabel,
			buttonLabels: probe?.buttonLabels,
		});
		return rateLimit
			? writeChatgptRateLimitCensusGuard({
					runtimeProfileId: input.runtimeProfileId,
					detectedAtMs: input.detectedAtMs,
					reason: rateLimit.reason,
					url: null,
				})
			: null;
	}
	if (input.provider !== "gemini" || !isResolvedUserConfig(input.config)) {
		return null;
	}
	const plan = resolveBrowserLaunchPlan({
		source: { kind: "user-config", config: input.config },
		intent: {
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			browserProfileId: input.browserProfileId,
		},
	});
	const registryPath = path.join(getAuracallHomeDir(), "browser-state.json");
	const instances = await listInstancesWithLiveness({ registryPath });
	const matchingInstances = instances.filter(
		({ alive, instance }) =>
			alive &&
			matchesManagedProfileForGuardCensus(
				instance,
				plan.managedBrowserProfile.directory,
				plan.managedBrowserProfile.activeProfileName,
			),
	);
	for (const { instance } of matchingInstances) {
		const targets = await listChromeTargets(instance.port, instance.host || "127.0.0.1").catch(
			() => [],
		);
		for (const target of targets as Array<{
			id?: string;
			type?: string;
			url?: string;
			title?: string;
		}>) {
			if (target.type && target.type !== "page") continue;
			if (input.provider === "gemini") {
				const guard = classifyProviderGuardCensusTarget({
					url: target.url ?? "",
					title: target.title ?? "",
				});
				if (guard) {
					return {
						state: "manual_clear_required",
						kind: guard.kind,
						summary: guard.summary,
						detectedAtMs: input.detectedAtMs,
						url: target.url ?? null,
						action: "account-mirror-refresh:target-census",
					};
				}
			}
		}
	}
	return null;
}

type ChatgptRateLimitCensusProbe = {
	text?: string | null;
	ariaLabel?: string | null;
	buttonLabels?: readonly string[] | null;
};

export function classifyChatgptRateLimitCensusProbeForTest(
	input: ChatgptRateLimitCensusProbe,
): { reason: string } | null {
	const corpus = [
		input.text,
		input.ariaLabel,
		...(Array.isArray(input.buttonLabels) ? input.buttonLabels : []),
	]
		.map((value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""))
		.filter(Boolean)
		.join(" ");
	if (!corpus || !isChatgptRateLimitMessage(corpus)) {
		return null;
	}
	return {
		reason: extractChatgptRateLimitSummary(corpus) ?? "ChatGPT rate limit warning detected.",
	};
}

async function writeChatgptRateLimitCensusGuard(input: {
	runtimeProfileId: string;
	detectedAtMs: number;
	reason: string;
	url: string | null;
	closeTarget?: () => Promise<void>;
}): Promise<AccountMirrorProviderGuardState> {
	const cooldownAction = "account-mirror-refresh:target-census-visible-warning";
	const persistentWarningAction =
		"account-mirror-refresh:target-census-persistent-warning-tab-closed";
	const previousState = await readChatgptRateLimitGuardState({
		profileName: input.runtimeProfileId,
	}).catch(() => null);
	if (
		input.closeTarget &&
		(previousState?.cooldownAction === cooldownAction ||
			previousState?.cooldownAction === persistentWarningAction)
	) {
		const previousDetectedAtMs = previousState.cooldownDetectedAt ?? input.detectedAtMs;
		const previousCooldownUntilMs = previousState.cooldownUntil ?? input.detectedAtMs;
		if (previousCooldownUntilMs > input.detectedAtMs) {
			return {
				state: "cooldown",
				kind: "unknown",
				summary: `ChatGPT rate limit detected: ${input.reason}`,
				detectedAtMs: previousDetectedAtMs,
				cooldownUntilMs: previousCooldownUntilMs,
				url: input.url,
				action: previousState.cooldownAction,
			};
		}
		await input.closeTarget();
		const cooldownMs = resolveChatgptRateLimitCooldownMs(previousState, input.detectedAtMs);
		const cooldownUntilMs = input.detectedAtMs + cooldownMs;
		await writeChatgptRateLimitGuardState(
			{
				provider: "chatgpt",
				profile: input.runtimeProfileId,
				updatedAt: input.detectedAtMs,
				lastMutationAt: previousState.lastMutationAt,
				recentMutationAts: previousState.recentMutationAts,
				recentMutations: previousState.recentMutations,
				recentRateLimitDetectionAts: appendChatgptRateLimitDetection(
					previousState.recentRateLimitDetectionAts,
					input.detectedAtMs,
				),
				cooldownUntil: cooldownUntilMs,
				cooldownDetectedAt: input.detectedAtMs,
				cooldownReason: `${input.reason} Closed the persistent warning tab.`,
				cooldownAction: persistentWarningAction,
			},
			{ profileName: input.runtimeProfileId },
		);
		return {
			state: "cooldown",
			kind: "unknown",
			summary:
				"ChatGPT rate-limit warning remained visible after the automatic cooldown. The warning tab was closed before a bounded retry delay.",
			detectedAtMs: input.detectedAtMs,
			cooldownUntilMs,
			url: input.url,
			action: persistentWarningAction,
		};
	}
	const cooldownMs = resolveChatgptRateLimitCooldownMs(previousState, input.detectedAtMs);
	const cooldownUntilMs = input.detectedAtMs + cooldownMs;
	await writeChatgptRateLimitGuardState(
		{
			provider: "chatgpt",
			profile: input.runtimeProfileId,
			updatedAt: input.detectedAtMs,
			lastMutationAt: previousState?.lastMutationAt,
			recentMutationAts: previousState?.recentMutationAts,
			recentMutations: previousState?.recentMutations,
			recentRateLimitDetectionAts: appendChatgptRateLimitDetection(
				previousState?.recentRateLimitDetectionAts,
				input.detectedAtMs,
			),
			cooldownUntil: cooldownUntilMs,
			cooldownDetectedAt: input.detectedAtMs,
			cooldownReason: input.reason,
			cooldownAction,
		},
		{ profileName: input.runtimeProfileId },
	);
	return {
		state: "cooldown",
		kind: "unknown",
		summary: `ChatGPT rate limit detected: ${input.reason}`,
		detectedAtMs: input.detectedAtMs,
		cooldownUntilMs,
		url: input.url,
		action: cooldownAction,
	};
}

export const writeChatgptRateLimitCensusGuardForTest = writeChatgptRateLimitCensusGuard;

async function readVisibleChatgptRateLimitCensusProbe(input: {
	host: string;
	port: number;
	targetId: string | null;
	abortSignal?: AbortSignal;
}): Promise<ChatgptRateLimitCensusProbe | null> {
	if (!input.targetId) {
		return null;
	}
	const client = await connectToChromeTarget({
		host: input.host,
		port: input.port,
		target: input.targetId,
		abortSignal: input.abortSignal,
		timeoutMs: 10_000,
	});
	const closeOnAbort = () => {
		void client.close().catch(() => undefined);
	};
	input.abortSignal?.addEventListener("abort", closeOnAbort, { once: true });
	try {
		input.abortSignal?.throwIfAborted();
		const result = await client.Runtime.evaluate({
			expression: `(() => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const selectors = ['[role="dialog"]', '[aria-modal="true"]', '[role="alert"]', '[aria-live]'];
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (!(element instanceof HTMLElement) || !isVisible(element)) continue;
      const text = normalize(element.innerText || element.textContent);
      const ariaLabel = normalize(element.getAttribute('aria-label'));
      const buttonLabels = Array.from(element.querySelectorAll('button,[role="button"]')).map((button) => normalize(button.innerText || button.textContent || button.getAttribute('aria-label'))).filter(Boolean);
      const corpus = [text, ariaLabel, ...buttonLabels].join(' ');
      if (/too many requests|too quickly|rate limit/i.test(corpus)) {
        return { text, ariaLabel, buttonLabels };
      }
    }
  }
  return null;
})()`,
			returnByValue: true,
		});
		const value = result.result?.value;
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		return {
			text: typeof record.text === "string" ? record.text : null,
			ariaLabel: typeof record.ariaLabel === "string" ? record.ariaLabel : null,
			buttonLabels: Array.isArray(record.buttonLabels)
				? record.buttonLabels.filter((label): label is string => typeof label === "string")
				: [],
		};
	} finally {
		input.abortSignal?.removeEventListener("abort", closeOnAbort);
		await client.close().catch(() => undefined);
	}
}

function matchesManagedProfileForGuardCensus(
	instance: { profilePath?: string; profileName?: string },
	expectedProfilePath: string,
	expectedProfileName: string,
): boolean {
	if (!instance.profilePath) return false;
	const instanceProfileName = (instance.profileName ?? "Default").trim().toLowerCase();
	return (
		path.resolve(instance.profilePath) === path.resolve(expectedProfilePath) &&
		instanceProfileName === expectedProfileName.trim().toLowerCase()
	);
}

function classifyProviderGuardCensusTarget(input: {
	url: string;
	title: string;
}): { kind: AccountMirrorProviderGuardKind; summary: string } | null {
	const url = input.url.trim().toLowerCase();
	const title = input.title.replace(/\s+/g, " ").trim().toLowerCase();
	const corpus = `${url} ${title}`.trim();
	if (url.includes("google.com/sorry") || /unusual traffic|not a robot/.test(corpus)) {
		return {
			kind: "google-sorry",
			summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
		};
	}
	if (
		url.includes("accounts.google.com") ||
		url.includes("/signin/") ||
		/\bchoose an account\b|\buse your google account\b|\bsign in\b.*\bgoogle\b|\bgoogle accounts\b/.test(
			corpus,
		)
	) {
		return {
			kind: "account-auth",
			summary: "Google account chooser or sign-in gate detected.",
		};
	}
	if (/recaptcha|g-recaptcha|hcaptcha|captcha/.test(corpus)) {
		return {
			kind: "captcha",
			summary: "CAPTCHA or reCAPTCHA challenge detected.",
		};
	}
	if (
		/human verification|verify you are human|prove you are human|confirm you are human|anti-bot/.test(
			corpus,
		)
	) {
		return {
			kind: "human-verification",
			summary: "Provider human-verification gate detected.",
		};
	}
	return null;
}

function createProviderGuardError(providerGuard: AccountMirrorProviderGuardState): Error {
	return Object.assign(new Error(providerGuard.summary), {
		details: {
			providerGuard,
			url: providerGuard.url ?? null,
			action: providerGuard.action ?? null,
			blockingState: {
				kind: providerGuard.kind,
				summary: providerGuard.summary,
				requiresHuman: providerGuard.state === "manual_clear_required",
			},
		},
	});
}

function extractProviderGuard(
	error: unknown,
	detectedAtMs: number,
): AccountMirrorProviderGuardState | null {
	const detailsGuard = findProviderGuardInError(error, new Set());
	if (detailsGuard) {
		return {
			state: detailsGuard.state,
			kind: detailsGuard.kind,
			summary: detailsGuard.summary,
			detectedAtMs,
			cooldownUntilMs: detailsGuard.cooldownUntilMs,
			url: detailsGuard.url,
			action: detailsGuard.action ?? "account-mirror-refresh",
		};
	}
	const message = error instanceof Error ? error.message : String(error ?? "");
	if (/google\.com\/sorry|unusual traffic|not a robot/i.test(message)) {
		return {
			state: "manual_clear_required",
			kind: "google-sorry",
			summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	if (
		/account chooser|sign-in gate|accounts\.google\.com|choose an account|use your google account/i.test(
			message,
		)
	) {
		return {
			state: "manual_clear_required",
			kind: "account-auth",
			summary: "Google account chooser or sign-in gate detected.",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	if (/captcha|recaptcha|human verification|anti-bot/i.test(message)) {
		return {
			state: "manual_clear_required",
			kind: "human-verification",
			summary: "Provider human-verification gate detected.",
			detectedAtMs,
			action: "account-mirror-refresh",
		};
	}
	return null;
}

function findProviderGuardInError(
	value: unknown,
	seen: Set<unknown>,
): {
	state: "manual_clear_required" | "cooldown";
	kind: AccountMirrorProviderGuardKind;
	summary: string;
	cooldownUntilMs?: number | null;
	url: string | null;
	action?: string | null;
} | null {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	const record = value as Record<string, unknown>;
	const details = isRecord(record.details) ? record.details : null;
	const providerGuard = details && isRecord(details.providerGuard) ? details.providerGuard : null;
	if (providerGuard) {
		const state =
			providerGuard.state === "cooldown" || providerGuard.state === "manual_clear_required"
				? providerGuard.state
				: "manual_clear_required";
		const rawKind = String(providerGuard.kind ?? "").trim();
		const kind = normalizeProviderGuardKind(rawKind);
		const summary =
			String(providerGuard.summary ?? "").trim() || "Provider human-verification gate detected.";
		const cooldownUntilMs =
			typeof providerGuard.cooldownUntilMs === "number" &&
			Number.isFinite(providerGuard.cooldownUntilMs)
				? providerGuard.cooldownUntilMs
				: null;
		const url =
			typeof providerGuard.url === "string" && providerGuard.url.trim().length > 0
				? providerGuard.url.trim()
				: null;
		const action =
			typeof providerGuard.action === "string" && providerGuard.action.trim().length > 0
				? providerGuard.action.trim()
				: null;
		return { state, kind, summary, cooldownUntilMs, url, action };
	}
	const blockingState = details && isRecord(details.blockingState) ? details.blockingState : null;
	if (blockingState) {
		const rawKind = String(blockingState.kind ?? "").trim();
		const kind = normalizeProviderGuardKind(rawKind);
		const summary =
			String(blockingState.summary ?? "").trim() || "Provider human-verification gate detected.";
		const url =
			typeof details?.url === "string" && details.url.trim().length > 0 ? details.url.trim() : null;
		const action =
			typeof details?.action === "string" && details.action.trim().length > 0
				? details.action.trim()
				: null;
		return { state: "manual_clear_required", kind, summary, url, action };
	}
	const cause = record.cause;
	const causeGuard = findProviderGuardInError(cause, seen);
	if (causeGuard) return causeGuard;
	const originalError = record.originalError;
	return findProviderGuardInError(originalError, seen);
}

function normalizeProviderGuardKind(value: string): AccountMirrorProviderGuardKind {
	switch (value) {
		case "google-sorry":
		case "captcha":
		case "cloudflare":
		case "account-auth":
		case "human-verification":
			return value;
		default:
			return "unknown";
	}
}

async function mergeCollectionWithPersistedCatalog(input: {
	persistence: AccountMirrorPersistence;
	provider: AccountMirrorProvider;
	boundIdentityKey: string | null;
	collection: AccountMirrorMetadataCollectorResult;
	scoped?: boolean;
}): Promise<AccountMirrorMetadataCollectorResult> {
	const existing = await input.persistence.readCatalog({
		provider: input.provider,
		boundIdentityKey: input.boundIdentityKey,
		limit: 10_000,
	});
	if (!existing) {
		return withRefreshEvidenceModel({
			provider: input.provider,
			collection: input.collection,
			mergedManifests: input.collection.manifests,
			retainedCounts: zeroMetadataCounts(),
		});
	}
	const projects =
		input.scoped || input.collection.evidence.truncated.projects === true
			? mergeById(existing.projects, input.collection.manifests.projects)
			: [...input.collection.manifests.projects];
	const manifests = {
		projects,
		conversations: mergeConversationsByObservedOrder(
			existing.conversations,
			input.collection.manifests.conversations,
		),
		artifacts: mergeArtifacts(existing.artifacts, input.collection.manifests.artifacts),
		files: mergeFiles(existing.files, input.collection.manifests.files),
		media: mergeById(existing.media, input.collection.manifests.media),
	};
	const mergedCounts = countsFromManifests(manifests);
	const retainedCounts = subtractMetadataCounts(mergedCounts, input.collection.metadataCounts);
	return {
		...withRefreshEvidenceModel({
			provider: input.provider,
			collection: input.collection,
			mergedManifests: manifests,
			retainedCounts,
		}),
		manifests,
		metadataCounts: mergedCounts,
	};
}

function withRefreshEvidenceModel(input: {
	provider: AccountMirrorProvider;
	collection: AccountMirrorMetadataCollectorResult;
	mergedManifests: AccountMirrorMetadataCollectorResult["manifests"];
	retainedCounts: AccountMirrorMetadataCounts;
}): AccountMirrorMetadataCollectorResult {
	const mergedTotal = countsFromManifests(input.mergedManifests);
	const detailScannedThisPass = detailScannedFromEvidence(input.collection.evidence);
	const localMaterialized = countLocalMaterializedAssets(input.mergedManifests);
	const remoteKnownMissingLocal = subtractAssetCounts(mergedTotal, localMaterialized);
	const conversationDetailDeferred =
		input.provider === "gemini" &&
		mergedTotal.conversations > 0 &&
		detailScannedThisPass.conversations <= 0 &&
		input.collection.evidence.attachmentInventory !== null &&
		input.collection.evidence.attachmentInventory !== undefined;
	return {
		...input.collection,
		metadataCounts: mergedTotal,
		evidence: {
			...input.collection.evidence,
			changeFrontierMetrics: deriveAccountMirrorChangeFrontierMetrics(
				input.mergedManifests.conversations,
				input.collection.evidence.changeFrontierPlan ?? null,
			),
			retainedMaterializationConversationIds: deriveRetainedMaterializationConversationIds(
				input.mergedManifests.conversations,
			),
			countEvidence: {
				observedThisPass: input.collection.metadataCounts,
				retainedFromCache: input.retainedCounts,
				mergedTotal,
			},
			detailScannedThisPass,
			assetInventory: {
				state: conversationDetailDeferred
					? "deferred"
					: input.collection.evidence.truncated.artifacts === true
						? "in_progress"
						: remoteKnownMissingLocal.artifacts +
									remoteKnownMissingLocal.files +
									remoteKnownMissingLocal.media >
								0
							? "observed"
							: "complete",
				summary: conversationDetailDeferred
					? "Conversation asset inventory is deferred because no conversation detail surface was scanned in this pass."
					: input.collection.evidence.truncated.artifacts === true
						? "Asset inventory is still in progress because detail inventory was truncated."
						: "Asset inventory was observed for the scanned provider surfaces.",
				detailScannedThisPass,
				localMaterialized,
				remoteKnownMissingLocal: conversationDetailDeferred
					? zeroAssetCounts()
					: remoteKnownMissingLocal,
				unknownOrDeferred: conversationDetailDeferred
					? {
							artifacts: Math.max(mergedTotal.artifacts, 1),
							files: Math.max(mergedTotal.files, 1),
							media: Math.max(mergedTotal.media, 1),
						}
					: zeroAssetCounts(),
			},
		},
	};
}

function deriveRetainedMaterializationConversationIds(
	conversations: readonly Conversation[],
): string[] {
	const ids: string[] = [];
	for (const conversation of conversations) {
		const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
		const state = normalizeAccountMirrorConversationWorkState(metadata.changeFrontierState);
		if (!state?.detailFingerprint) continue;
		if (state.assetAvailability === "unavailable") continue;
		ids.push(conversation.id);
	}
	return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export const deriveRetainedMaterializationConversationIdsForTest =
	deriveRetainedMaterializationConversationIds;

function countsFromManifests(
	manifests: AccountMirrorMetadataCollectorResult["manifests"],
): AccountMirrorMetadataCounts {
	return {
		projects: manifests.projects.length,
		conversations: manifests.conversations.length,
		artifacts: manifests.artifacts.length,
		files: manifests.files.length,
		media: manifests.media.length,
	};
}

function detailScannedFromEvidence(evidence: AccountMirrorMetadataCollectorResult["evidence"]): {
	projects: number;
	conversations: number;
	total: number;
} {
	const projects = Math.max(0, Math.floor(evidence.attachmentInventory?.scannedProjects ?? 0));
	const conversations = Math.max(
		0,
		Math.floor(evidence.attachmentInventory?.scannedConversations ?? 0),
	);
	return {
		projects,
		conversations,
		total: projects + conversations,
	};
}

function countLocalMaterializedAssets(
	manifests: AccountMirrorMetadataCollectorResult["manifests"],
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: manifests.artifacts.filter((item) => hasLocalAssetEvidence(item)).length,
		files: manifests.files.filter((item) => hasLocalAssetEvidence(item)).length,
		media: manifests.media.filter((item) => hasLocalAssetEvidence(item)).length,
	};
}

function hasLocalAssetEvidence(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	const metadata =
		record.metadata && typeof record.metadata === "object"
			? (record.metadata as Record<string, unknown>)
			: {};
	return Boolean(
		readNonEmptyString(record.localPath) ||
			readNonEmptyString(record.path) ||
			readNonEmptyString(record.checksumSha256) ||
			readNonEmptyString(record.cacheKey) ||
			readNonEmptyString(record.assetRoute) ||
			readNonEmptyString(metadata.localPath) ||
			readNonEmptyString(metadata.path) ||
			readNonEmptyString(metadata.checksumSha256) ||
			readNonEmptyString(metadata.cacheKey) ||
			readNonEmptyString(metadata.assetRoute) ||
			readNonEmptyString(metadata.materializedAt),
	);
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function subtractMetadataCounts(
	left: AccountMirrorMetadataCounts,
	right: AccountMirrorMetadataCounts,
): AccountMirrorMetadataCounts {
	return {
		projects: Math.max(0, left.projects - right.projects),
		conversations: Math.max(0, left.conversations - right.conversations),
		artifacts: Math.max(0, left.artifacts - right.artifacts),
		files: Math.max(0, left.files - right.files),
		media: Math.max(0, left.media - right.media),
	};
}

function subtractAssetCounts(
	left: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
	right: Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media">,
): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return {
		artifacts: Math.max(0, left.artifacts - right.artifacts),
		files: Math.max(0, left.files - right.files),
		media: Math.max(0, left.media - right.media),
	};
}

function zeroMetadataCounts(): AccountMirrorMetadataCounts {
	return { projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 };
}

function zeroAssetCounts(): Pick<AccountMirrorMetadataCounts, "artifacts" | "files" | "media"> {
	return { artifacts: 0, files: 0, media: 0 };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
	const merged = new Map<string, T>();
	for (const item of existing) {
		if (item?.id) merged.set(item.id, item);
	}
	for (const item of incoming) {
		if (item?.id) merged.set(item.id, { ...(merged.get(item.id) ?? {}), ...item });
	}
	return [...merged.values()];
}

function mergeConversationRow<T extends { id: string; title: string; metadata?: unknown }>(
	existing: T | undefined,
	incoming: T,
): T {
	const existingMetadata = isRecord(existing?.metadata) ? existing.metadata : {};
	const incomingMetadata = isRecord(incoming.metadata) ? incoming.metadata : {};
	const merged = {
		...(existing ?? {}),
		...incoming,
		metadata: {
			...existingMetadata,
			...incomingMetadata,
		},
	};
	if (
		existing &&
		isConversationIdPlaceholderTitle(incoming) &&
		!isConversationIdPlaceholderTitle(existing)
	) {
		return { ...merged, title: existing.title };
	}
	return merged;
}

function isConversationIdPlaceholderTitle(value: { id?: unknown; title?: unknown }): boolean {
	const id = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
	const title = typeof value.title === "string" ? value.title.trim().toLowerCase() : "";
	return id.length > 0 && title === id;
}

function mergeConversationsByObservedOrder<
	T extends { id: string; title: string; metadata?: unknown },
>(existing: readonly T[], incoming: readonly T[]): T[] {
	const existingById = new Map(existing.filter((item) => item?.id).map((item) => [item.id, item]));
	const incomingIds = new Set<string>();
	const observed = incoming
		.filter((item) => item?.id)
		.map((item) => {
			incomingIds.add(item.id);
			return mergeConversationRow(existingById.get(item.id), item);
		});
	const retained = existing.filter((item) => item?.id && !incomingIds.has(item.id));
	return [...observed, ...retained];
}

export const mergeConversationsByObservedOrderForTest = mergeConversationsByObservedOrder;

function mergeArtifacts(
	existing: readonly ConversationArtifact[],
	incoming: readonly ConversationArtifact[],
): ConversationArtifact[] {
	return mergeByKey(existing, incoming, artifactKey);
}

function mergeFiles(existing: readonly FileRef[], incoming: readonly FileRef[]): FileRef[] {
	return mergeByKey(existing, incoming, fileKey);
}

function mergeByKey<T extends object>(
	existing: readonly T[],
	incoming: readonly T[],
	createKey: (item: T) => string | null,
): T[] {
	const merged = new Map<string, T>();
	for (const item of existing) {
		const key = createKey(item);
		if (key) merged.set(key, item);
	}
	for (const item of incoming) {
		const key = createKey(item);
		if (key) merged.set(key, { ...(merged.get(key) ?? {}), ...item });
	}
	return [...merged.values()];
}

function artifactKey(artifact: ConversationArtifact): string | null {
	if (!artifact?.id) return null;
	const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
	const conversationId = typeof metadata.conversationId === "string" ? metadata.conversationId : "";
	return `${conversationId}:${artifact.id}`;
}

function fileKey(file: FileRef): string | null {
	if (!file?.id) return null;
	return `${file.provider ?? "unknown"}:${file.source ?? "unknown"}:${file.id}`;
}

function createConfigBackedAccountMirrorMetadataCollector(
	config: Record<string, unknown> | null | undefined,
): AccountMirrorMetadataCollector {
	return {
		async collect(input) {
			const metadataCounts = estimateMetadataCountsFromConfig(config, {
				provider: input.provider,
				runtimeProfileId: input.runtimeProfileId,
			});
			return {
				detectedIdentityKey: input.expectedIdentityKey,
				detectedIdentitySource: "configured",
				detectedIdentityObservedAtMs: Date.now(),
				detectedIdentityConfidence: "authoritative",
				detectedAccountLevel: null,
				metadataCounts,
				manifests: {
					projects: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "projects",
					}),
					conversations: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "conversations",
					}),
					artifacts: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "artifacts",
					}),
					files: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "files",
					}),
					media: readConfiguredArray(config, {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						key: "media",
					}),
				},
				evidence: {
					identitySource: "configured",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			};
		},
	};
}

function readConfiguredArray<T = never>(
	config: Record<string, unknown> | null | undefined,
	input: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
		key: "projects" | "conversations" | "artifacts" | "files" | "media";
	},
): T[] {
	const service = readServiceConfig(config, input);
	const rawItems = service?.[input.key];
	return Array.isArray(rawItems) ? (rawItems as T[]) : [];
}

function readServiceConfig(
	config: Record<string, unknown> | null | undefined,
	target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	},
): Record<string, unknown> | null {
	const runtimeProfile = readRuntimeProfile(config, target.runtimeProfileId);
	return isRecord(runtimeProfile?.services) && isRecord(runtimeProfile.services[target.provider])
		? (runtimeProfile.services[target.provider] as Record<string, unknown>)
		: null;
}

function readSingleMirrorTarget(input: {
	registry: AccountMirrorStatusRegistry;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	explicitRefresh: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
}): AccountMirrorStatusEntry | null {
	return (
		input.registry.readStatus({
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			explicitRefresh: input.explicitRefresh,
			ignoreMinimumInterval: input.ignoreMinimumInterval === true,
			ignoreFailureBackoff: input.explicitRefresh === true && input.ignoreFailureBackoff === true,
		}).entries[0] ?? null
	);
}

function resolveMirrorManagedProfileDir(input: {
	config: Record<string, unknown> | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
}): string {
	const config = isRecord(input.config) ? input.config : {};
	const plan = resolveBrowserLaunchPlan({
		source: { kind: "user-config", config: config as ResolvedUserConfig },
		intent: {
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			browserProfileId: input.browserProfileId,
		},
	});
	return plan.managedBrowserProfile.directory;
}

async function readPreviousAccountMirrorFiles(input: {
	persistence: AccountMirrorPersistence;
	provider: AccountMirrorProvider;
	boundIdentityKey: string | null;
	catalogFiles: readonly FileRef[];
	conversations: readonly Conversation[];
	conversationLimit: number;
}): Promise<FileRef[]> {
	const filesById = new Map<string, FileRef>();
	for (const file of input.catalogFiles) {
		filesById.set(file.id, file);
	}
	if (
		!input.boundIdentityKey ||
		(!input.persistence.readConversationFiles && !input.persistence.readConversationAttachments)
	) {
		return Array.from(filesById.values());
	}
	const conversations = input.conversations.slice(
		0,
		Math.max(1, Math.floor(input.conversationLimit)),
	);
	const cacheHydrationConcurrency = 4;
	for (let offset = 0; offset < conversations.length; offset += cacheHydrationConcurrency) {
		await Promise.all(
			conversations.slice(offset, offset + cacheHydrationConcurrency).map(async (conversation) => {
				const request = {
					provider: input.provider,
					boundIdentityKey: input.boundIdentityKey,
					conversationId: conversation.id,
				};
				const [conversationFiles, conversationAttachments] = await Promise.all([
					input.persistence.readConversationFiles?.(request).catch(() => []),
					input.persistence.readConversationAttachments?.(request).catch(() => []),
				]);
				for (const file of [...(conversationFiles ?? []), ...(conversationAttachments ?? [])]) {
					filesById.set(file.id, file);
				}
			}),
		);
	}
	return Array.from(filesById.values());
}

export const readPreviousAccountMirrorFilesForTest = readPreviousAccountMirrorFiles;

function estimateMetadataCountsFromConfig(
	config: Record<string, unknown> | null | undefined,
	target: {
		provider: AccountMirrorProvider;
		runtimeProfileId: string;
	},
): AccountMirrorMetadataCounts {
	const service = readServiceConfig(config, target) ?? {};
	return {
		projects: countArrayLike(service.projects) + countOptionalString(service.projectId),
		conversations:
			countArrayLike(service.conversations) + countOptionalString(service.conversationId),
		artifacts: countArrayLike(service.artifacts),
		files: countArrayLike(service.files),
		media: countArrayLike(service.media) + countArrayLike(service.saved),
	};
}

function readRuntimeProfile(
	config: Record<string, unknown> | null | undefined,
	runtimeProfileId: string,
): Record<string, unknown> | null {
	if (!isRecord(config)) return null;
	const targetProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : {};
	const bridgeProfiles = isRecord(config.profiles) ? config.profiles : {};
	const runtimeProfile = isRecord(targetProfiles[runtimeProfileId])
		? targetProfiles[runtimeProfileId]
		: isRecord(bridgeProfiles[runtimeProfileId])
			? bridgeProfiles[runtimeProfileId]
			: null;
	return runtimeProfile;
}

function countArrayLike(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function countOptionalString(value: unknown): number {
	return typeof value === "string" && value.trim().length > 0 ? 1 : 0;
}

function summarizeBrowserOperation(operation: BrowserOperationRecord): Record<string, unknown> {
	return {
		id: operation.id,
		key: operation.key,
		kind: operation.kind,
		operationClass: operation.operationClass,
		ownerPid: operation.ownerPid,
		ownerCommand: operation.ownerCommand ?? null,
		startedAt: operation.startedAt,
		updatedAt: operation.updatedAt,
		managedProfileDir: operation.managedProfileDir ?? null,
		serviceTarget: operation.serviceTarget ?? null,
		rawDevTools: operation.rawDevTools ?? null,
		devTools: operation.devTools ?? null,
	};
}

function normalizeSweepMode(
	value: AccountMirrorRefreshRequest["sweepMode"],
): "steady_follow" | "full_sweep" {
	return value === "full_sweep" ? "full_sweep" : "steady_follow";
}

function normalizeRequestedCollectorPhase(
	value: AccountMirrorRefreshRequest["requestedPhase"],
): AccountMirrorCollectorPhase | null {
	return isCollectorPhase(value) ? value : null;
}

export function resolveAccountMirrorDevelopmentPolicy(input: {
	policy: AccountMirrorDevelopmentPolicy | null | undefined;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	serverCapabilityArmed: boolean;
}): AccountMirrorEffectiveDevelopmentPolicy | null {
	if (!input.policy) return null;
	if (!input.serverCapabilityArmed) {
		throw new AccountMirrorRefreshError(
			409,
			"account_mirror_development_controls_not_armed",
			"Account-mirror development controls are not armed in the installed runtime.",
			{ provider: input.provider, runtimeProfileId: input.runtimeProfileId },
		);
	}
	const bounded = (name: string, value: number, min: number, max: number): number => {
		if (!Number.isFinite(value) || value < min || value > max) {
			throw new AccountMirrorRefreshError(
				400,
				"account_mirror_invalid_development_policy",
				`${name} must be between ${min} and ${max}.`,
				{ name, value, min, max },
			);
		}
		return Math.floor(value);
	};
	return {
		...input.policy,
		mode: "development",
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		serverCapabilityArmed: true,
		maxWallTimeMs: bounded("maxWallTimeMs", input.policy.maxWallTimeMs, 1_000, 1_800_000),
		maxConversations: bounded("maxConversations", input.policy.maxConversations, 1, 100),
		maxMaterializationCandidates: bounded(
			"maxMaterializationCandidates",
			input.policy.maxMaterializationCandidates,
			1,
			100,
		),
		maxPasses: bounded("maxPasses", input.policy.maxPasses, 1, 20),
		...(input.policy.providerCallTimeoutMs === undefined
			? {}
			: {
					providerCallTimeoutMs: bounded(
						"providerCallTimeoutMs",
						input.policy.providerCallTimeoutMs,
						1_000,
						120_000,
					),
				}),
		...(input.policy.maxBrowserInteractionsPerMinute === undefined
			? {}
			: {
					maxBrowserInteractionsPerMinute: bounded(
						"maxBrowserInteractionsPerMinute",
						input.policy.maxBrowserInteractionsPerMinute,
						1,
						120,
					),
				}),
		...(input.policy.conversationReadCooldownMs === undefined
			? {}
			: {
					conversationReadCooldownMs: bounded(
						"conversationReadCooldownMs",
						input.policy.conversationReadCooldownMs,
						0,
						300_000,
					),
				}),
		...(input.policy.pageRefreshCooldownMs === undefined
			? {}
			: {
					pageRefreshCooldownMs: bounded(
						"pageRefreshCooldownMs",
						input.policy.pageRefreshCooldownMs,
						0,
						300_000,
					),
				}),
		...(input.policy.renavigationCooldownMs === undefined
			? {}
			: {
					renavigationCooldownMs: bounded(
						"renavigationCooldownMs",
						input.policy.renavigationCooldownMs,
						0,
						300_000,
					),
				}),
	};
}

function isCollectorPhase(value: unknown): value is AccountMirrorCollectorPhase {
	return isLiveFollowCollectorPhase(value);
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.trunc(value)
		: fallback;
}

function normalizeNonNegativeInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.trunc(value)
		: fallback;
}

function isResolvedUserConfig(
	value: Record<string, unknown> | null | undefined,
): value is ResolvedUserConfig {
	return Boolean(
		value &&
			typeof value.auracallProfile === "string" &&
			typeof value.model === "string" &&
			isRecord(value.browser),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
