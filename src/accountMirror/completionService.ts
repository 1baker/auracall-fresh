import { randomUUID } from "node:crypto";
import {
	type AccountMirrorBackfillCursor,
	updateAccountMirrorBackfillLedgerCursors,
} from "./backfillLedger.js";
import {
	resolveAccountMirrorCollectorSweepMode,
	resolveAccountMirrorCollectorTimeoutMs,
} from "./collectorTimeoutPolicy.js";
import type { AccountMirrorCompletionStore } from "./completionStore.js";
import {
	type AccountMirrorLiveFollowCycleLedger,
	type AccountMirrorLiveFollowCyclePhase,
	chooseLiveFollowCyclePhase,
	collectorFailureIsUnresolved,
	deriveLiveFollowCycleLedger,
} from "./liveFollowCycleDecision.js";
import type { AccountMirrorProvider } from "./politePolicy.js";
import {
	type AccountMirrorProviderWorkCoordinator,
	type AccountMirrorProviderWorkLease,
	createAccountMirrorProviderWorkCoordinator,
} from "./providerWorkCoordinator.js";
import {
	AccountMirrorRefreshError,
	type AccountMirrorRefreshResult,
	type AccountMirrorRefreshService,
} from "./refreshService.js";
import type {
	AccountMirrorCollectorPhase,
	AccountMirrorCollectorPhaseProgressEvidence,
	AccountMirrorStatusEntry,
	AccountMirrorStatusRegistry,
} from "./statusRegistry.js";

export interface AccountMirrorCompletionStartRequest {
	conversationIds?: string[] | null;
	provider?: AccountMirrorProvider | null;
	runtimeProfileId?: string | null;
	maxPasses?: number | null;
	sweepMode?: AccountMirrorCompletionSweepMode | null;
	materializationPolicy?: AccountMirrorCompletionMaterializationPolicy | null;
	materializationAssetKinds?: AccountMirrorCompletionMaterializationAssetKind[] | null;
	materializationMaxItems?: number | null;
	materializationRefreshSnapshot?: boolean | null;
	materializationForce?: boolean | null;
}

export interface AccountMirrorCompletionListRequest {
	provider?: AccountMirrorProvider | null;
	runtimeProfileId?: string | null;
	status?: AccountMirrorCompletionOperation["status"] | "active" | null;
	activeOnly?: boolean | null;
	limit?: number | null;
}

export interface AccountMirrorCompletionControlRequest {
	id: string;
	action: "pause" | "resume" | "cancel" | "run_one_pass";
}

export interface AccountMirrorCompletionPolicyUpgradeRequest
	extends AccountMirrorCompletionStartRequest {
	id: string;
}

export interface AccountMirrorCompletionLifecycleEvent {
	at: string;
	type:
		| "started"
		| "parked_for_shutdown"
		| "resumed_after_restart"
		| "automatic_resume_blocked"
		| "operator_paused"
		| "operator_resumed"
		| "operator_forced_pass"
		| "operator_resume_blocked"
		| "operator_cancelled"
		| "campaign_policy_upgraded"
		| "live_follow_policy_upgraded"
		| "live_follow_phase_decision"
		| "foreground_work_deferred"
		| "provider_work_waiting"
		| "provider_work_acquired"
		| "provider_work_released"
		| "provider_guard_backoff"
		| "collector_progress"
		| "materialization_from_complete_ledger"
		| "materialization_failure_blocked"
		| "account_library_catchup_queued"
		| "account_library_catchup_skipped";
	status: AccountMirrorCompletionOperation["status"];
	previousStatus: AccountMirrorCompletionOperation["status"] | null;
	processPid: number;
	message: string;
}

export interface AccountMirrorCompletionBackpressure {
	reason: "foreground-work";
	message: string | null;
}

export type AccountMirrorCompletionSweepMode = "steady_follow" | "full_sweep";
export type AccountMirrorCompletionMaterializationPolicy =
	| "metadata_only"
	| "recent_missing_assets"
	| "full_missing_assets";
export type AccountMirrorCompletionMaterializationAssetKind =
	| "artifacts"
	| "files"
	| "media"
	| "all";

export interface AccountMirrorCompletionMaterializationCursor {
	jobId: string;
	jobStatus: string;
	reused: boolean;
	requestedAt: string;
	providerWorkSettledAt?: string | null;
	passCount: number;
	request: {
		provider: AccountMirrorProvider;
		runtimeProfile: string;
		conversationIds?: string[];
		reconcile: true;
		refreshSnapshot: boolean;
		reuseSnapshotAfter?: string | null;
		reuseSnapshotConversationIds?: string[];
		providerWorkNotBefore?: string | null;
		interactionPolicy?: AccountMirrorMaterializationInteractionPolicy | null;
		assetKinds: AccountMirrorCompletionMaterializationAssetKind[];
		maxItems: number | null;
		force: boolean;
	};
}

type AccountMirrorHistoryMaterializationCreateRequest = {
	conversationIds?: string[];
	provider: AccountMirrorProvider;
	runtimeProfile: string;
	browserProfile?: string | null;
	boundIdentityKey?: string | null;
	reconcile: true;
	assetSource?: "account-library" | null;
	refreshSnapshot: boolean;
	reuseSnapshotAfter?: string | null;
	reuseSnapshotConversationIds?: string[] | null;
	providerWorkNotBefore?: string | null;
	interactionPolicy?: AccountMirrorMaterializationInteractionPolicy | null;
	assetKinds: AccountMirrorCompletionMaterializationAssetKind[];
	maxItems: number | null;
	providerWorkTimeoutMs?: number | null;
	force: boolean;
};

type AccountMirrorMaterializationInteractionPolicy = {
	maxInteractionsPerMinute: number;
	conversationReadCooldownMs: number;
	pageRefreshCooldownMs: number;
	renavigationCooldownMs: number;
};

export interface AccountMirrorCompletionAccountLibraryCursor {
	jobId: string | null;
	jobStatus: string | null;
	reused: boolean;
	requestedAt: string;
	passCount: number;
	status: "queued" | "reused" | "skipped";
	reason: string;
	request: AccountMirrorHistoryMaterializationCreateRequest | null;
}

export interface AccountMirrorCompletionMaterializationOutcome {
	jobId: string;
	jobStatus: string;
	completedAt: string | null;
	conversationsAttempted: number;
	eligibleCandidates: number;
	selectedCandidates: number;
	materialized: number;
	skipped: number;
	failed: number;
	checksumCount: number;
	manifestPaths: string[];
	terminalRouteabilityCounts: Record<string, number>;
	dispositionCounts?: Record<string, number>;
	message: string | null;
}

export interface AccountMirrorCompletionOperation {
	conversationIds?: string[];
	object: "account_mirror_completion";
	id: string;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	mode: "live_follow" | "bounded";
	sweepMode?: AccountMirrorCompletionSweepMode;
	phase: "backfill_history" | "steady_follow";
	status:
		| "queued"
		| "running"
		| "idle_waiting"
		| "paused"
		| "completed"
		| "blocked"
		| "failed"
		| "cancelled";
	startedAt: string;
	completedAt: string | null;
	nextAttemptAt: string | null;
	maxPasses: number | null;
	passCount: number;
	lastRefresh: AccountMirrorRefreshResult | null;
	materializationPolicy?: AccountMirrorCompletionMaterializationPolicy;
	materializationAssetKinds?: AccountMirrorCompletionMaterializationAssetKind[];
	materializationMaxItems?: number | null;
	materializationRefreshSnapshot?: boolean;
	materializationForce?: boolean;
	materializationCursor?: AccountMirrorCompletionMaterializationCursor | null;
	materializationOutcome?: AccountMirrorCompletionMaterializationOutcome | null;
	accountLibraryCursor?: AccountMirrorCompletionAccountLibraryCursor | null;
	liveFollowCycle?: AccountMirrorLiveFollowCycleLedger | null;
	forceRunUntilPassCount?: number | null;
	mirrorCompleteness: AccountMirrorStatusEntry["mirrorCompleteness"] | null;
	error: {
		message: string;
		code: string | null;
	} | null;
	lifecycleEvents?: AccountMirrorCompletionLifecycleEvent[];
}

export interface AccountMirrorCompletionService {
	start(request?: AccountMirrorCompletionStartRequest): AccountMirrorCompletionOperation;
	read(id: string): AccountMirrorCompletionOperation | null;
	list(request?: AccountMirrorCompletionListRequest): AccountMirrorCompletionOperation[];
	refreshMaterializationStatus?(id: string): Promise<AccountMirrorCompletionOperation | null>;
	refreshMaterializationStatuses?(
		operations: AccountMirrorCompletionOperation[],
	): Promise<AccountMirrorCompletionOperation[]>;
	control(request: AccountMirrorCompletionControlRequest): AccountMirrorCompletionOperation | null;
	upgradePolicy?(
		request: AccountMirrorCompletionPolicyUpgradeRequest,
	): AccountMirrorCompletionOperation | null;
	resumeActiveOperations?(): void;
	prepareForShutdown?(): AccountMirrorCompletionOperation[];
}

type AccountMirrorMaterializationBacklogReader = (input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
}) => Promise<{
	retrievableMissing: number;
	unknownOrDeferred: number;
} | null>;

export function hasLocallyActionableMaterializationBacklog(
	backlog:
		| {
				retrievableMissing: number;
				unknownOrDeferred: number;
		  }
		| null
		| undefined,
): boolean {
	return Math.max(0, Math.floor(backlog?.retrievableMissing ?? 0)) > 0;
}

export function projectAccountMirrorCompletionForMonitoring(
	operation: AccountMirrorCompletionOperation,
): AccountMirrorCompletionOperation {
	const latestLifecycleEvent = operation.lifecycleEvents?.at(-1);
	const materializationCursor = operation.materializationCursor
		? {
				...operation.materializationCursor,
				request: {
					...operation.materializationCursor.request,
					reuseSnapshotConversationIds: undefined,
				},
			}
		: undefined;
	const materializationOutcome = operation.materializationOutcome
		? {
				...operation.materializationOutcome,
				manifestPaths: [],
				message: operation.materializationOutcome.message?.slice(0, 500) ?? null,
			}
		: undefined;
	return {
		object: operation.object,
		id: operation.id,
		provider: operation.provider,
		runtimeProfileId: operation.runtimeProfileId,
		mode: operation.mode,
		sweepMode: operation.sweepMode,
		phase: operation.phase,
		status: operation.status,
		startedAt: operation.startedAt,
		completedAt: operation.completedAt,
		nextAttemptAt: operation.nextAttemptAt,
		maxPasses: operation.maxPasses,
		passCount: operation.passCount,
		lastRefresh: null,
		materializationPolicy: operation.materializationPolicy,
		materializationAssetKinds: operation.materializationAssetKinds,
		materializationMaxItems: operation.materializationMaxItems,
		materializationRefreshSnapshot: operation.materializationRefreshSnapshot,
		materializationForce: operation.materializationForce,
		materializationCursor,
		materializationOutcome,
		liveFollowCycle: operation.liveFollowCycle,
		forceRunUntilPassCount: operation.forceRunUntilPassCount,
		mirrorCompleteness: null,
		error: operation.error
			? { ...operation.error, message: operation.error.message.slice(0, 500) }
			: null,
		lifecycleEvents: latestLifecycleEvent
			? [{ ...latestLifecycleEvent, message: latestLifecycleEvent.message.slice(0, 500) }]
			: [],
	};
}

interface AccountMirrorHistoryMaterializationJobCreateResult {
	generatedAt?: string;
	reused?: boolean;
	reuseReason?: string | null;
	job: {
		id: string;
		status: string;
		completedAt?: string | null;
		updatedAt?: string | null;
	};
}

interface AccountMirrorHistoryMaterializationService {
	createJob(
		request: AccountMirrorHistoryMaterializationCreateRequest,
	): Promise<AccountMirrorHistoryMaterializationJobCreateResult>;
	readJob?(id: string): Promise<AccountMirrorHistoryMaterializationJobReadResult | null>;
}

interface AccountMirrorHistoryMaterializationJobReadResult {
	id: string;
	status: string;
	completedAt?: string | null;
	result?: {
		metrics?: {
			conversations?: number | null;
			eligibleCandidates?: number | null;
			selectedCandidates?: number | null;
			materialized?: number | null;
			skipped?: number | null;
			failed?: number | null;
		} | null;
		manifestPaths?: unknown;
		entries?: unknown;
		snapshotRefreshes?: unknown;
		message?: string | null;
	} | null;
}

export function createAccountMirrorCompletionService(input: {
	registry: AccountMirrorStatusRegistry;
	refreshService: AccountMirrorRefreshService;
	store?: AccountMirrorCompletionStore | null;
	initialOperations?: AccountMirrorCompletionOperation[] | null;
	resumeActiveOperations?: boolean;
	now?: () => Date;
	generateId?: () => string;
	sleep?: (ms: number) => Promise<void>;
	historyMaterializationService?: AccountMirrorHistoryMaterializationService | null;
	readMaterializationBacklog?: AccountMirrorMaterializationBacklogReader;
	providerWorkCoordinator?: AccountMirrorProviderWorkCoordinator | null;
	shouldYieldToForegroundWork?: () => AccountMirrorCompletionBackpressure | null;
	foregroundRetryDelayMs?: number;
	onPersistError?: (error: unknown, operation: AccountMirrorCompletionOperation) => void;
}): AccountMirrorCompletionService {
	const now = input.now ?? (() => new Date());
	const generateId = input.generateId ?? (() => `acctmirror_completion_${randomUUID()}`);
	const sleepImpl = input.sleep ?? sleep;
	const operations = new Map<string, AccountMirrorCompletionOperation>();
	const persistQueues = new Map<string, Promise<void>>();
	const activeRuns = new Set<string>();
	const activeRunAbortControllers = new Map<string, AbortController>();
	const sleepWakeups = new Set<() => void>();
	const providerWorkCoordinator =
		input.providerWorkCoordinator ?? createAccountMirrorProviderWorkCoordinator();
	const providerWorkLeases = new Map<string, AccountMirrorProviderWorkLease>();
	const providerWorkLeaseWatchers = new Set<string>();
	const waitForShutdownWake = () =>
		new Promise<void>((resolve) => {
			const wake = () => {
				sleepWakeups.delete(wake);
				resolve();
			};
			sleepWakeups.add(wake);
		});
	const wakeSleepers = () => {
		for (const wake of Array.from(sleepWakeups)) {
			wake();
		}
	};
	const sleepUntilAttempt = async (id: string, attemptAt: string): Promise<boolean> => {
		let fallbackAttemptAt: string | null = attemptAt;
		while (shouldContinue(id)) {
			const current = operations.get(id);
			const currentAttemptAt: string | null = current ? current.nextAttemptAt : fallbackAttemptAt;
			if (!currentAttemptAt) return true;
			fallbackAttemptAt = currentAttemptAt;
			const delayMs = resolveDelayMs(currentAttemptAt, now());
			if (delayMs <= 0) return true;
			await Promise.race([sleepImpl(Math.min(delayMs, 60_000)), waitForShutdownWake()]);
		}
		return false;
	};
	const foregroundRetryDelayMs = normalizeForegroundRetryDelayMs(input.foregroundRetryDelayMs);

	for (const operation of input.initialOperations ?? []) {
		const normalized = normalizeLifecycleEvents(operation);
		operations.set(operation.id, reconcileLoadedLiveFollowCycle(normalized, now().toISOString()));
	}

	const update = (id: string, patch: Partial<AccountMirrorCompletionOperation>) => {
		const current = operations.get(id);
		if (!current) return null;
		const next = { ...current, ...patch };
		operations.set(id, next);
		persist(next);
		return next;
	};

	const shouldContinue = (id: string): boolean => {
		const status = operations.get(id)?.status;
		return status === "running" || status === "idle_waiting";
	};

	const launch = (id: string) => {
		if (activeRuns.has(id)) return;
		activeRuns.add(id);
		const abortController = new AbortController();
		activeRunAbortControllers.set(id, abortController);
		void run(id, abortController.signal).finally(() => {
			activeRuns.delete(id);
			if (activeRunAbortControllers.get(id) === abortController) {
				activeRunAbortControllers.delete(id);
			}
			if (operations.get(id)?.status === "queued") {
				launch(id);
			}
		});
	};

	const run = async (id: string, abortSignal: AbortSignal) => {
		update(id, { status: "running", completedAt: null });
		try {
			const initialOperation = operations.get(id);
			if (!initialOperation) return;
			if (initialOperation.nextAttemptAt) {
				if (initialOperation.mode === "bounded") {
					update(id, { nextAttemptAt: null });
				} else {
					update(id, { status: "idle_waiting" });
					if (!(await sleepUntilAttempt(id, initialOperation.nextAttemptAt))) return;
					update(id, { status: "running", nextAttemptAt: null });
				}
			}
			for (;;) {
				let operation = operations.get(id);
				if (!operation) return;
				let pass = operation.passCount;
				if (!shouldContinue(id)) return;
				if (
					operation.materializationCursor &&
					(!isTerminalMaterializationStatus(operation.materializationCursor.jobStatus) ||
						!operation.materializationCursor.providerWorkSettledAt)
				) {
					if (!(await acquireProviderWorkLease(id))) return;
					operation = await hydrateMaterializationStatus(operation);
					if (!isTerminalMaterializationStatus(operation.materializationCursor?.jobStatus ?? "")) {
						const nextAttemptAt = new Date(now().getTime() + 30_000).toISOString();
						update(id, { status: "idle_waiting", nextAttemptAt });
						if (!(await sleepUntilAttempt(id, nextAttemptAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
					if (
						operation.materializationCursor?.jobStatus === "failed" &&
						(operation.materializationOutcome?.materialized ?? 0) === 0
					) {
						const message =
							operation.materializationOutcome?.message ??
							`History materialization job ${operation.materializationCursor.jobId} failed.`;
						const blocked = update(id, {
							status: "blocked",
							completedAt: now().toISOString(),
							nextAttemptAt: null,
							forceRunUntilPassCount: null,
							error: {
								message,
								code: "account_mirror_materialization_failed",
							},
						});
						appendLifecycleEvent(id, {
							type: "materialization_failure_blocked",
							status: "blocked",
							previousStatus: operation.status,
							message: `${message} Live follow stopped before another provider pass.`,
						});
						return blocked;
					}
				}
				if (!(operation.maxPasses === null || pass < operation.maxPasses)) break;
				if (
					operation.mode === "live_follow" &&
					isTerminalMaterializationStatus(operation.materializationCursor?.jobStatus ?? "") &&
					operation.materializationCursor?.providerWorkSettledAt &&
					operation.forceRunUntilPassCount !== null &&
					operation.forceRunUntilPassCount !== undefined &&
					operation.passCount >= operation.forceRunUntilPassCount
				) {
					releaseProviderWorkLease(id, "forced-pass materialization settled");
					update(id, {
						status: "idle_waiting",
						nextAttemptAt: null,
						forceRunUntilPassCount: null,
						error: null,
					});
					return;
				}
				if (
					operation.mode === "live_follow" &&
					isTerminalMaterializationStatus(operation.materializationCursor?.jobStatus ?? "") &&
					operation.materializationCursor?.providerWorkSettledAt
				) {
					releaseProviderWorkLease(id, "completion-owned materialization settled");
					await input.registry.refreshPersistentState?.({
						provider: operation.provider,
						runtimeProfileId: operation.runtimeProfileId,
					});
					const cadenceEntry = findTargetEntry(
						input.registry,
						operation.provider,
						operation.runtimeProfileId,
					);
					const settledAtMs = Date.parse(operation.materializationCursor.providerWorkSettledAt);
					const quietWindowMs = Math.max(1_000, cadenceEntry?.limits.minIntervalMs ?? 60_000);
					const nextCollectorAtMs = settledAtMs + quietWindowMs;
					if (Number.isFinite(settledAtMs) && nextCollectorAtMs > now().getTime()) {
						const nextAttemptAt = new Date(nextCollectorAtMs).toISOString();
						update(id, { status: "idle_waiting", nextAttemptAt });
						if (!(await sleepUntilAttempt(id, nextAttemptAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
				}
				if (!(await acquireProviderWorkLease(id))) return;
				if (pass > 0) {
					await input.registry.refreshPersistentState?.();
					if (!shouldContinue(id)) return;
					const entry = findTargetEntry(
						input.registry,
						operation.provider,
						operation.runtimeProfileId,
					);
					if (entry?.mirrorCompleteness.state === "complete") {
						if (operation.maxPasses !== null && operation.sweepMode !== "full_sweep") {
							update(id, {
								status: "completed",
								completedAt: now().toISOString(),
								mirrorCompleteness: entry.mirrorCompleteness,
								phase: "steady_follow",
							});
							return;
						}
						update(id, {
							phase: "steady_follow",
							mirrorCompleteness: entry.mirrorCompleteness,
						});
					}
				}
				const refreshOperation = operations.get(id);
				if (!refreshOperation) return;
				if (refreshOperation.mode === "live_follow") {
					const foregroundBackpressure = input.shouldYieldToForegroundWork?.() ?? null;
					if (foregroundBackpressure) {
						releaseProviderWorkLease(id, "foreground work deferred completion");
						const nextAttemptAt = new Date(now().getTime() + foregroundRetryDelayMs).toISOString();
						update(id, {
							status: "idle_waiting",
							nextAttemptAt,
							error: null,
						});
						appendLifecycleEvent(id, {
							type: "foreground_work_deferred",
							status: "idle_waiting",
							previousStatus: refreshOperation.status,
							message: `${foregroundBackpressure.message ?? "Foreground AuraCall work is pending."} Retry at ${nextAttemptAt}.`,
						});
						if (!(await sleepUntilAttempt(id, nextAttemptAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
				}
				let refresh: AccountMirrorRefreshResult;
				try {
					if (!shouldContinue(id)) return;
					await input.registry.refreshPersistentState?.({
						provider: refreshOperation.provider,
						runtimeProfileId: refreshOperation.runtimeProfileId,
					});
					const phaseStatusEntry = findTargetEntry(
						input.registry,
						refreshOperation.provider,
						refreshOperation.runtimeProfileId,
					);
					const providerGuardBackoff = resolveProviderGuardBackoff(phaseStatusEntry, now());
					if (providerGuardBackoff) {
						releaseProviderWorkLease(id, "provider guard backoff");
						appendLifecycleEvent(id, {
							type: "provider_guard_backoff",
							status: operations.get(id)?.status ?? refreshOperation.status,
							previousStatus: refreshOperation.status,
							message: providerGuardBackoff.message,
						});
						if (refreshOperation.mode === "bounded") {
							update(id, {
								status: "blocked",
								completedAt: now().toISOString(),
								nextAttemptAt: null,
								mirrorCompleteness:
									phaseStatusEntry?.mirrorCompleteness ??
									operations.get(id)?.mirrorCompleteness ??
									null,
								error: {
									message: providerGuardBackoff.message,
									code: providerGuardBackoff.code,
								},
							});
							return;
						}
						update(id, {
							status: "idle_waiting",
							nextAttemptAt: providerGuardBackoff.eligibleAt,
							mirrorCompleteness:
								phaseStatusEntry?.mirrorCompleteness ??
								operations.get(id)?.mirrorCompleteness ??
								null,
							error: {
								message: providerGuardBackoff.message,
								code: providerGuardBackoff.code,
							},
						});
						if (!(await sleepUntilAttempt(id, providerGuardBackoff.eligibleAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
					if (
						await shouldQueueMaterializationFromCompleteLedger(
							refreshOperation,
							phaseStatusEntry,
							input.readMaterializationBacklog,
						)
					) {
						if (!(await acquireProviderWorkLease(id))) return;
						const nextPassCount = pass + 1;
						pass = nextPassCount;
						const shortcutBase =
							update(id, {
								passCount: nextPassCount,
								phase: "steady_follow",
								mirrorCompleteness: phaseStatusEntry?.mirrorCompleteness ?? null,
								error: null,
							}) ?? refreshOperation;
						await queueCompletionMaterialization(shortcutBase);
						await input.registry.refreshPersistentState?.({
							provider: refreshOperation.provider,
							runtimeProfileId: refreshOperation.runtimeProfileId,
						});
						const queued = operations.get(id);
						const queuedStatusEntry = findTargetEntry(
							input.registry,
							refreshOperation.provider,
							refreshOperation.runtimeProfileId,
						);
						if (queued) {
							update(id, {
								liveFollowCycle: deriveLiveFollowCycleLedger({
									operation: queued,
									statusEntry: queuedStatusEntry,
									now: now().toISOString(),
								}),
							});
						}
						appendLifecycleEvent(id, {
							type: "materialization_from_complete_ledger",
							status: "idle_waiting",
							previousStatus: refreshOperation.status,
							message:
								"Queued materialization from the durable complete metadata ledger without replaying provider discovery.",
						});
						if (
							refreshOperation.forceRunUntilPassCount !== null &&
							refreshOperation.forceRunUntilPassCount !== undefined &&
							nextPassCount >= refreshOperation.forceRunUntilPassCount
						) {
							continue;
						}
						const nextAttemptAt = new Date(
							now().getTime() + Math.max(1_000, phaseStatusEntry?.limits.minIntervalMs ?? 60_000),
						).toISOString();
						update(id, { status: "idle_waiting", nextAttemptAt });
						if (!(await sleepUntilAttempt(id, nextAttemptAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
					const requestedPhase = refreshOperation.conversationIds?.length
						? "detail-inventory"
						: resolveRequestedCollectorPhase(refreshOperation, phaseStatusEntry);
					const sweepMode = resolveAccountMirrorCollectorSweepMode(
						refreshOperation.sweepMode ?? "steady_follow",
						requestedPhase,
					);
					const collectorTimeoutMs = resolveAccountMirrorCollectorTimeoutMs(
						refreshOperation.provider,
						sweepMode,
					);
					if (!(await acquireProviderWorkLease(id))) return;
					refresh = await input.refreshService.requestRefresh({
						provider: refreshOperation.provider,
						runtimeProfileId: refreshOperation.runtimeProfileId,
						sweepMode,
						conversationIds: refreshOperation.conversationIds,
						materializationPolicy: refreshOperation.materializationPolicy ?? null,
						requestedPhase,
						explicitRefresh: true,
						ignoreMinimumInterval: refreshOperation.mode === "bounded",
						ignoreFailureBackoff: refreshOperation.mode === "bounded",
						queueTimeoutMs: 0,
						onCollectorProgress: (progress) => {
							appendLifecycleEvent(id, {
								type: "collector_progress",
								status: operations.get(id)?.status ?? refreshOperation.status,
								previousStatus: refreshOperation.status,
								message: formatCollectorProgressLifecycleMessage(progress),
							});
						},
						...(shouldCleanupManagedBrowserAfterRefresh(refreshOperation, pass)
							? { cleanupManagedBrowserAfterRefresh: true }
							: {}),
						...(collectorTimeoutMs ? { collectorTimeoutMs } : {}),
						abortSignal,
						liveFollowOperationId: refreshOperation.id,
					});
				} catch (error) {
					const eligibleAt = readEligibleAt(error);
					if (eligibleAt) {
						await input.registry.refreshPersistentState?.();
						const entry = findTargetEntry(
							input.registry,
							operation.provider,
							operation.runtimeProfileId,
						);
						update(id, {
							status: "idle_waiting",
							nextAttemptAt: eligibleAt,
							mirrorCompleteness:
								entry?.mirrorCompleteness ?? operations.get(id)?.mirrorCompleteness ?? null,
							error: {
								message: error instanceof Error ? error.message : String(error),
								code: readErrorCode(error),
							},
						});
						releaseProviderWorkLease(id, "provider refresh deferred by eligibility");
						if (!(await sleepUntilAttempt(id, eligibleAt))) return;
						update(id, { status: "running", nextAttemptAt: null });
						continue;
					}
					throw error;
				}
				if (abortSignal.aborted) return;
				const nextPassCount = pass + 1;
				pass = nextPassCount;
				const refreshedPatch: Partial<AccountMirrorCompletionOperation> = {
					passCount: nextPassCount,
					lastRefresh: refresh,
					mirrorCompleteness: refresh.mirrorCompleteness,
					phase:
						refresh.mirrorCompleteness.state === "complete" ? "steady_follow" : "backfill_history",
					nextAttemptAt: null,
					error: null,
				};
				const refreshedBase = { ...refreshOperation, ...refreshedPatch };
				const refreshedStatusEntry = findTargetEntry(
					input.registry,
					refreshedBase.provider,
					refreshedBase.runtimeProfileId,
				);
				refreshedPatch.liveFollowCycle = deriveLiveFollowCycleLedger({
					operation: refreshedBase,
					statusEntry: refreshedStatusEntry,
					now: now().toISOString(),
				});
				const refreshed = update(id, refreshedPatch);
				if (refreshed?.liveFollowCycle) {
					appendLifecycleEvent(id, {
						type: "live_follow_phase_decision",
						status: refreshed.status,
						previousStatus: refreshOperation.status,
						message: `Live-follow phase decision: ${refreshed.liveFollowCycle.currentPhase} (${refreshed.liveFollowCycle.decisionReason}).`,
					});
				}
				if (
					refresh.browserLifecycle?.cleanupRequested === true &&
					refresh.browserLifecycle.status === "failed"
				) {
					throw new AccountMirrorRefreshError(
						503,
						"account_mirror_browser_cleanup_failed",
						`Managed browser cleanup failed before history materialization handoff: ${refresh.browserLifecycle.message}`,
						{
							managedProfileDir: refresh.browserLifecycle.managedProfileDir,
							pid: refresh.browserLifecycle.pid,
						},
					);
				}
				const queuedCompletionMaterialization = Boolean(
					refreshed &&
						(await shouldQueueMaterialization(
							refreshed,
							refreshedStatusEntry,
							input.readMaterializationBacklog,
						)),
				);
				if (refreshed && queuedCompletionMaterialization) {
					await queueCompletionMaterialization(refreshed, {
						materializationConversationIds: [
							...new Set([
								...(refresh.metadataEvidence?.detailConversationIdsThisPass ?? []),
								...(refresh.metadataEvidence?.retainedMaterializationConversationIds ?? []),
							]),
						],
						reuseSnapshotAfter: refresh.startedAt,
						// Retained inventory selects work; only this pass's detail reads prove freshness.
						reuseSnapshotConversationIds: [
							...new Set([...(refresh.metadataEvidence?.detailConversationIdsThisPass ?? [])]),
						],
						interactionPolicy: materializationInteractionPolicy(refreshedStatusEntry),
						providerWorkNotBefore: materializationProviderWorkNotBefore(
							refresh,
							refreshedStatusEntry,
						),
					});
				}
				if (refreshed) {
					await decideAccountLibraryCatchup(refreshed);
				}
				if (!queuedCompletionMaterialization) {
					releaseProviderWorkLease(id, "collector completed without queued materialization");
				}
				if (!shouldContinue(id)) return;
				if (
					refreshOperation.mode === "live_follow" &&
					refreshOperation.forceRunUntilPassCount !== null &&
					refreshOperation.forceRunUntilPassCount !== undefined &&
					nextPassCount >= refreshOperation.forceRunUntilPassCount
				) {
					if (queuedCompletionMaterialization) continue;
					await input.registry.refreshPersistentState?.({
						provider: refreshOperation.provider,
						runtimeProfileId: refreshOperation.runtimeProfileId,
					});
					const cadenceEntry = findTargetEntry(
						input.registry,
						refreshOperation.provider,
						refreshOperation.runtimeProfileId,
					);
					update(id, {
						status: "idle_waiting",
						nextAttemptAt: cadenceEntry?.eligibleAt ?? null,
						forceRunUntilPassCount: null,
						mirrorCompleteness:
							refreshed?.mirrorCompleteness ?? cadenceEntry?.mirrorCompleteness ?? null,
						error: null,
					});
					return;
				}
				if (queuedCompletionMaterialization) continue;
				if (refresh.mirrorCompleteness.state === "complete") {
					const latest = operations.get(id);
					if (
						latest?.maxPasses !== null &&
						latest?.maxPasses !== undefined &&
						((latest.sweepMode ?? "steady_follow") !== "full_sweep" ||
							nextPassCount >= latest.maxPasses)
					) {
						update(id, {
							status: "completed",
							completedAt: now().toISOString(),
						});
						return;
					}
				}
			}
			const latest = operations.get(id);
			update(id, {
				status:
					latest?.lastRefresh?.status === "blocked" || latest?.lastRefresh?.status === "busy"
						? "blocked"
						: "completed",
				completedAt: now().toISOString(),
			});
		} catch (error) {
			if (!shouldContinue(id)) return;
			if (error instanceof AccountMirrorRefreshError) {
				update(id, {
					status: "blocked",
					completedAt: now().toISOString(),
					error: {
						message: error.message,
						code: error.code,
					},
				});
				return;
			}
			update(id, {
				status: "failed",
				completedAt: now().toISOString(),
				error: {
					message: error instanceof Error ? error.message : String(error),
					code: readErrorCode(error),
				},
			});
		} finally {
			releaseProviderWorkLeaseWhenSafe(id);
		}
	};

	const resumeActiveOperations = () => {
		for (const operation of operations.values()) {
			if (isRunnableOperation(operation) && !activeRuns.has(operation.id)) {
				if (shouldBlockGeminiResume(operation)) {
					blockGeminiResume(operation, "automatic");
					continue;
				}
				appendLifecycleEvent(operation.id, {
					type: "resumed_after_restart",
					status: "running",
					previousStatus: operation.status,
					message: "Resumed persisted account-mirror completion after API startup.",
				});
				launch(operation.id);
			}
		}
	};

	if (input.resumeActiveOperations) resumeActiveOperations();

	const service: AccountMirrorCompletionService = {
		resumeActiveOperations,
		start(request = {}) {
			const id = generateId();
			const sweepMode = normalizeSweepMode(request.sweepMode);
			if (
				request.conversationIds &&
				(!request.conversationIds.length ||
					request.conversationIds.some((id) => !id.trim()) ||
					sweepMode !== "steady_follow")
			) {
				throw new Error("conversationIds requires nonempty IDs and steady_follow.");
			}
			const operation: AccountMirrorCompletionOperation = {
				conversationIds: request.conversationIds?.length
					? [...new Set(request.conversationIds.map((id) => id.trim()).filter(Boolean))]
					: undefined,
				object: "account_mirror_completion",
				id,
				provider: request.provider ?? "chatgpt",
				runtimeProfileId: normalizeRuntimeProfile(request.runtimeProfileId),
				mode: request.maxPasses == null ? "live_follow" : "bounded",
				sweepMode,
				phase: "backfill_history",
				status: "queued",
				startedAt: now().toISOString(),
				completedAt: null,
				nextAttemptAt: null,
				maxPasses: normalizeMaxPasses(request.maxPasses),
				passCount: 0,
				lastRefresh: null,
				materializationPolicy: normalizeMaterializationPolicy(
					request.materializationPolicy,
					sweepMode,
				),
				materializationAssetKinds: normalizeMaterializationAssetKinds(
					request.materializationAssetKinds,
				),
				materializationMaxItems: normalizeMaterializationMaxItems(request.materializationMaxItems),
				materializationRefreshSnapshot: normalizeMaterializationRefreshSnapshot(
					request.materializationRefreshSnapshot,
					sweepMode,
				),
				materializationForce: normalizeMaterializationForce(request.materializationForce),
				materializationCursor: null,
				materializationOutcome: null,
				accountLibraryCursor: null,
				liveFollowCycle: null,
				forceRunUntilPassCount: null,
				mirrorCompleteness: null,
				error: null,
				lifecycleEvents: [],
			};
			operation.lifecycleEvents = appendLifecycleEventToList(operation.lifecycleEvents ?? [], {
				at: operation.startedAt,
				type: "started",
				status: operation.status,
				previousStatus: null,
				processPid: process.pid,
				message: "Started account-mirror completion.",
			});
			operations.set(id, operation);
			persist(operation);
			launch(id);
			return operation;
		},
		read(id: string) {
			return operations.get(id) ?? null;
		},
		list(request = {}) {
			const limit = normalizeListLimit(request.limit);
			const runtimeProfileId = request.runtimeProfileId
				? normalizeRuntimeProfile(request.runtimeProfileId)
				: null;
			const activeOnly = request.activeOnly === true || request.status === "active";
			const status = readCompletionStatus(request.status);
			const results = Array.from(operations.values())
				.filter((operation) => !request.provider || operation.provider === request.provider)
				.filter((operation) => !runtimeProfileId || operation.runtimeProfileId === runtimeProfileId)
				.filter((operation) => !activeOnly || isActiveOperation(operation))
				.filter((operation) => !status || operation.status === status)
				.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
			return limit === null ? results : results.slice(0, limit);
		},
		async refreshMaterializationStatus(id: string) {
			const operation = operations.get(id);
			if (!operation) return null;
			return await hydrateCompletionStatus(operation);
		},
		async refreshMaterializationStatuses(inputOperations: AccountMirrorCompletionOperation[]) {
			const results: AccountMirrorCompletionOperation[] = [];
			for (const operation of inputOperations) {
				results.push(await hydrateCompletionStatus(operation));
			}
			return results;
		},
		control(request) {
			const operation = operations.get(request.id);
			if (!operation) return null;
			if (request.action === "pause") {
				if (!isActiveOperation(operation)) return operation;
				cancelProviderWorkWait(operation.id);
				abortActiveRun(operation.id, "Account-mirror completion paused by operator request.");
				const updated = update(operation.id, {
					status: "paused",
					error: null,
				});
				return (
					appendLifecycleEvent(operation.id, {
						type: "operator_paused",
						status: "paused",
						previousStatus: operation.status,
						message: "Paused account-mirror completion by operator request.",
					}) ?? updated
				);
			}
			if (request.action === "resume") {
				if (operation.status !== "paused") return operation;
				if (shouldBlockGeminiResume(operation)) {
					return blockGeminiResume(operation, "operator");
				}
				const resumed = update(operation.id, {
					status: "queued",
					completedAt: null,
					error: null,
				});
				const evented = appendLifecycleEvent(operation.id, {
					type: "operator_resumed",
					status: "queued",
					previousStatus: operation.status,
					message: "Resumed account-mirror completion by operator request.",
				});
				launch(operation.id);
				return evented ?? resumed;
			}
			if (request.action === "run_one_pass") {
				if (isTerminalOperation(operation) && !isRetryableTerminalLiveFollow(operation)) {
					return operation;
				}
				if (shouldBlockGeminiResume(operation)) {
					return blockGeminiResume(operation, "operator");
				}
				const forced = update(operation.id, {
					status: "queued",
					completedAt: null,
					nextAttemptAt: null,
					forceRunUntilPassCount: operation.passCount + 1,
					error: null,
				});
				const evented = appendLifecycleEvent(operation.id, {
					type: "operator_forced_pass",
					status: "queued",
					previousStatus: operation.status,
					message: "Forced one bounded live-follow pass by operator request.",
				});
				wakeSleepers();
				launch(operation.id);
				return evented ?? forced;
			}
			if (request.action === "cancel") {
				if (isTerminalOperation(operation)) return operation;
				cancelProviderWorkWait(operation.id);
				abortActiveRun(operation.id, "Account-mirror completion cancelled by operator request.");
				const updated = update(operation.id, {
					status: "cancelled",
					completedAt: now().toISOString(),
					nextAttemptAt: null,
					error: null,
				});
				return (
					appendLifecycleEvent(operation.id, {
						type: "operator_cancelled",
						status: "cancelled",
						previousStatus: operation.status,
						message: "Cancelled account-mirror completion by operator request.",
					}) ?? updated
				);
			}
			return operation;
		},
		upgradePolicy(request) {
			const operation = operations.get(request.id);
			if (!operation) return null;
			if (isTerminalOperation(operation)) return operation;
			const sweepMode = normalizeSweepMode(request.sweepMode);
			const previousStatus = operation.status;
			const nextStatus =
				operation.status === "paused"
					? "paused"
					: operation.status === "queued"
						? "queued"
						: "running";
			const liveFollowUpgrade = request.maxPasses === null;
			const updated = update(operation.id, {
				mode: liveFollowUpgrade ? "live_follow" : "bounded",
				sweepMode,
				phase: "backfill_history",
				status: nextStatus,
				completedAt: null,
				nextAttemptAt: operation.status === "paused" ? operation.nextAttemptAt : null,
				maxPasses: liveFollowUpgrade ? null : resolveUpgradeMaxPasses(operation, request.maxPasses),
				materializationPolicy: normalizeMaterializationPolicy(
					request.materializationPolicy,
					sweepMode,
				),
				materializationAssetKinds: normalizeMaterializationAssetKinds(
					request.materializationAssetKinds,
				),
				materializationMaxItems: normalizeMaterializationMaxItems(request.materializationMaxItems),
				materializationRefreshSnapshot: normalizeMaterializationRefreshSnapshot(
					request.materializationRefreshSnapshot,
					sweepMode,
				),
				materializationForce: normalizeMaterializationForce(request.materializationForce),
				accountLibraryCursor: operation.accountLibraryCursor ?? null,
				error: null,
			});
			const evented =
				appendLifecycleEvent(operation.id, {
					type: liveFollowUpgrade ? "live_follow_policy_upgraded" : "campaign_policy_upgraded",
					status: updated?.status ?? nextStatus,
					previousStatus,
					message: liveFollowUpgrade
						? "Upgraded account-mirror completion policy from configured live-follow full artifact retrieval."
						: "Upgraded account-mirror completion policy for a reconciliation campaign.",
				}) ?? updated;
			wakeSleepers();
			if (evented && evented.status !== "paused") {
				launch(operation.id);
			}
			return evented;
		},
		prepareForShutdown() {
			const parked: AccountMirrorCompletionOperation[] = [];
			for (const id of Array.from(activeRuns)) {
				cancelProviderWorkWait(id);
				abortActiveRun(id, "Account-mirror completion parked for API shutdown.");
				const operation = operations.get(id);
				if (!operation) continue;
				if (!isRunnableOperation(operation)) continue;
				const next = update(operation.id, {
					status: "queued",
					completedAt: null,
					error: null,
				});
				const evented = appendLifecycleEvent(operation.id, {
					type: "parked_for_shutdown",
					status: "queued",
					previousStatus: operation.status,
					message: "Parked account-mirror completion for API shutdown and restart resume.",
				});
				const parkedOperation = evented ?? next;
				if (parkedOperation) parked.push(parkedOperation);
			}
			wakeSleepers();
			return parked;
		},
	};
	return service;

	function persist(operation: AccountMirrorCompletionOperation): void {
		if (!input.store) return;
		const previous = persistQueues.get(operation.id) ?? Promise.resolve();
		const next = previous
			.catch(() => undefined)
			.then(() => input.store?.writeOperation(operation).then(() => undefined))
			.catch((error) => input.onPersistError?.(error, operation));
		persistQueues.set(operation.id, next);
	}

	function appendLifecycleEvent(
		id: string,
		inputEvent: Omit<AccountMirrorCompletionLifecycleEvent, "at" | "processPid">,
	): AccountMirrorCompletionOperation | null {
		const current = operations.get(id);
		if (!current) return null;
		return update(id, {
			lifecycleEvents: appendLifecycleEventToList(current.lifecycleEvents ?? [], {
				...inputEvent,
				at: now().toISOString(),
				processPid: process.pid,
			}),
		});
	}

	async function acquireProviderWorkLease(id: string): Promise<boolean> {
		const operation = operations.get(id);
		if (!operation || !shouldContinue(id)) return false;
		if (providerWorkLeases.has(id)) return true;
		const lease = await providerWorkCoordinator.acquire({
			provider: operation.provider,
			ownerId: id,
			isEligible: () => shouldContinue(id),
			onWait: (activeOwnerId) => {
				appendProviderWorkLifecycleEvent(
					id,
					"provider_work_waiting",
					`Waiting behind ${activeOwnerId ?? "active work"} for the ${operation.provider} provider-work serialization lease.`,
				);
			},
		});
		if (!lease || !shouldContinue(id)) {
			lease?.release();
			return false;
		}
		providerWorkLeases.set(id, lease);
		appendProviderWorkLifecycleEvent(
			id,
			"provider_work_acquired",
			`Acquired ${operation.provider} provider-work serialization lease in FIFO order.`,
		);
		return true;
	}

	function releaseProviderWorkLease(id: string, reason: string): void {
		const operation = operations.get(id);
		const lease = providerWorkLeases.get(id);
		if (!operation || !lease) return;
		providerWorkLeases.delete(id);
		appendProviderWorkLifecycleEvent(
			id,
			"provider_work_released",
			`Released ${operation.provider} provider-work serialization lease: ${reason}.`,
		);
		lease.release();
	}

	function cancelProviderWorkWait(id: string): void {
		providerWorkCoordinator.cancel(id);
	}

	function abortActiveRun(id: string, message: string): void {
		const controller = activeRunAbortControllers.get(id);
		if (!controller || controller.signal.aborted) return;
		controller.abort(new Error(message));
	}

	function releaseProviderWorkLeaseWhenSafe(id: string): void {
		const operation = operations.get(id);
		if (!operation || !providerWorkLeases.has(id)) return;
		if (
			operation.materializationCursor &&
			!isTerminalMaterializationStatus(operation.materializationCursor.jobStatus)
		) {
			watchProviderWorkLeaseUntilMaterializationSettles(id);
			return;
		}
		releaseProviderWorkLease(id, "completion run ended");
	}

	function watchProviderWorkLeaseUntilMaterializationSettles(id: string): void {
		if (providerWorkLeaseWatchers.has(id)) return;
		providerWorkLeaseWatchers.add(id);
		void (async () => {
			try {
				for (;;) {
					const operation = operations.get(id);
					if (!operation?.materializationCursor) break;
					const hydrated = await hydrateMaterializationStatus(operation);
					if (isTerminalMaterializationStatus(hydrated.materializationCursor?.jobStatus ?? "")) {
						break;
					}
					await sleepImpl(30_000);
				}
			} finally {
				providerWorkLeaseWatchers.delete(id);
				releaseProviderWorkLease(id, "completion-owned materialization settled after run exit");
			}
		})();
	}

	function appendProviderWorkLifecycleEvent(
		id: string,
		type: "provider_work_waiting" | "provider_work_acquired" | "provider_work_released",
		message: string,
	): void {
		const operation = operations.get(id);
		if (!operation) return;
		appendLifecycleEvent(id, {
			type,
			status: operation.status,
			previousStatus: operation.status,
			message,
		});
	}

	async function queueCompletionMaterialization(
		operation: AccountMirrorCompletionOperation,
		options: {
			materializationConversationIds?: string[];
			reuseSnapshotAfter?: string | null;
			reuseSnapshotConversationIds?: string[];
			providerWorkNotBefore?: string | null;
			interactionPolicy?: AccountMirrorMaterializationInteractionPolicy | null;
		} = {},
	): Promise<void> {
		if (operations.get(operation.id)?.status === "cancelled") return;
		if (!input.historyMaterializationService) {
			throw new Error("Account mirror full-sweep materialization is not configured.");
		}
		// ChatGPT steady follow hands off the collector frontier.
		const conversationIds = operation.conversationIds?.length
			? operation.conversationIds
			: operation.provider === "chatgpt" &&
					operation.sweepMode === "steady_follow" &&
					options.materializationConversationIds?.length
				? options.materializationConversationIds
				: undefined;
		const request = {
			provider: operation.provider,
			runtimeProfile: operation.runtimeProfileId,
			...(conversationIds?.length ? { conversationIds } : {}),
			reconcile: true,
			refreshSnapshot: operation.materializationRefreshSnapshot === true,
			...(options.reuseSnapshotAfter ? { reuseSnapshotAfter: options.reuseSnapshotAfter } : {}),
			...(options.reuseSnapshotConversationIds?.length
				? { reuseSnapshotConversationIds: options.reuseSnapshotConversationIds }
				: {}),
			...(options.providerWorkNotBefore
				? { providerWorkNotBefore: options.providerWorkNotBefore }
				: {}),
			...(options.interactionPolicy ? { interactionPolicy: options.interactionPolicy } : {}),
			assetKinds: operation.materializationAssetKinds ?? ["all"],
			maxItems: operation.materializationMaxItems ?? null,
			force: operation.materializationForce === true,
		} satisfies AccountMirrorCompletionMaterializationCursor["request"];
		const result = await input.historyMaterializationService.createJob(request);
		const requestedAt = result.generatedAt ?? now().toISOString();
		const providerWorkSettledAt = isTerminalMaterializationStatus(result.job.status)
			? (result.job.completedAt ?? result.job.updatedAt ?? requestedAt)
			: null;
		const updated = update(operation.id, {
			materializationCursor: {
				jobId: result.job.id,
				jobStatus: result.job.status,
				reused: result.reused === true,
				requestedAt,
				providerWorkSettledAt,
				passCount: operation.passCount,
				request,
			},
			materializationOutcome: null,
		});
		await persistBackfillLedgerCursor(updated ?? operation, {
			materialization: createMaterializationBackfillCursor({
				jobId: result.job.id,
				jobStatus: result.job.status,
				updatedAt: requestedAt,
				passCount: operation.passCount,
				reused: result.reused === true,
			}),
		});
	}

	async function hydrateMaterializationStatus(
		operation: AccountMirrorCompletionOperation,
	): Promise<AccountMirrorCompletionOperation> {
		const cursor = operation.materializationCursor;
		if (!cursor || !input.historyMaterializationService?.readJob) return operation;
		const job = await input.historyMaterializationService.readJob(cursor.jobId).catch(() => null);
		if (!job) return operation;
		const outcome = isTerminalMaterializationStatus(job.status)
			? summarizeMaterializationOutcome(job)
			: null;
		const providerWorkSettledAt = isTerminalMaterializationStatus(job.status)
			? (cursor.providerWorkSettledAt ?? job.completedAt ?? now().toISOString())
			: null;
		const updated =
			update(operation.id, {
				materializationCursor: {
					...cursor,
					jobStatus: job.status || cursor.jobStatus,
					providerWorkSettledAt,
				},
				materializationOutcome: outcome,
			}) ?? operation;
		await persistBackfillLedgerCursor(updated, {
			materialization: createMaterializationBackfillCursor({
				jobId: cursor.jobId,
				jobStatus: job.status || cursor.jobStatus,
				updatedAt: outcome?.completedAt ?? now().toISOString(),
				passCount: cursor.passCount,
				outcome,
			}),
		});
		return updated;
	}

	async function hydrateCompletionStatus(
		operation: AccountMirrorCompletionOperation,
	): Promise<AccountMirrorCompletionOperation> {
		const materialized = await hydrateMaterializationStatus(operation);
		await input.registry.refreshPersistentState?.({
			provider: materialized.provider,
			runtimeProfileId: materialized.runtimeProfileId,
		});
		const entry = findTargetEntry(
			input.registry,
			materialized.provider,
			materialized.runtimeProfileId,
		);
		if (!entry) return materialized;
		const statusPatch: Partial<AccountMirrorCompletionOperation> = {
			mirrorCompleteness: entry.mirrorCompleteness,
		};
		const statusFailure = resolveStatusEntryFailure(entry);
		if (statusFailure) statusPatch.error = statusFailure;
		if (materialized.mode === "live_follow") {
			statusPatch.liveFollowCycle = deriveLiveFollowCycleLedger({
				operation: {
					...materialized,
					mirrorCompleteness: entry.mirrorCompleteness,
				},
				statusEntry: entry,
				now: now().toISOString(),
			});
		}
		return (
			update(materialized.id, statusPatch) ?? {
				...materialized,
				...statusPatch,
			}
		);
	}

	async function decideAccountLibraryCatchup(
		operation: AccountMirrorCompletionOperation,
	): Promise<AccountMirrorCompletionOperation | null> {
		if (operation.conversationIds?.length) return null;
		if (operation.lastRefresh?.status !== "completed") {
			return await recordAccountLibraryCatchupSkip(operation, "latest refresh did not complete");
		}
		if (operation.accountLibraryCursor?.passCount === operation.passCount) {
			return await recordAccountLibraryCatchupSkip(
				operation,
				"account-library catch-up already evaluated for this pass",
			);
		}
		if (!input.historyMaterializationService) {
			return await recordAccountLibraryCatchupSkip(
				operation,
				"history materialization service is not configured",
			);
		}
		await input.registry.refreshPersistentState?.({
			provider: operation.provider,
			runtimeProfileId: operation.runtimeProfileId,
		});
		const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
		if (!entry) {
			return await recordAccountLibraryCatchupSkip(
				operation,
				"account mirror status target was not found",
			);
		}
		const desired = entry.liveFollow.accountLibrary;
		if (!desired.configured || desired.mode === "disabled") {
			return null;
		}
		if (desired.mode !== "eligible") {
			return await recordAccountLibraryCatchupSkip(
				operation,
				`liveFollow.accountLibrary.mode is ${desired.mode}`,
			);
		}
		const cooldownUntil = deriveAccountLibraryCooldownUntil(entry);
		if (cooldownUntil && Date.parse(cooldownUntil) > now().getTime()) {
			return await recordAccountLibraryCatchupSkip(
				operation,
				`account-library failure cooldown is active until ${cooldownUntil}`,
			);
		}
		const request: AccountMirrorHistoryMaterializationCreateRequest = {
			provider: operation.provider,
			runtimeProfile: operation.runtimeProfileId,
			browserProfile: entry.browserProfileId,
			boundIdentityKey: entry.detectedIdentityKey,
			reconcile: true,
			assetSource: "account-library",
			refreshSnapshot: false,
			assetKinds: ["files"],
			maxItems: desired.maxItems,
			providerWorkTimeoutMs: desired.providerWorkTimeoutMs,
			force: false,
		};
		try {
			const result = await input.historyMaterializationService.createJob(request);
			return await recordAccountLibraryCatchupJob(operation, request, result);
		} catch (error) {
			return await recordAccountLibraryCatchupSkip(
				operation,
				`account-library materialization job create failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	async function recordAccountLibraryCatchupJob(
		operation: AccountMirrorCompletionOperation,
		request: AccountMirrorHistoryMaterializationCreateRequest,
		result: AccountMirrorHistoryMaterializationJobCreateResult,
	): Promise<AccountMirrorCompletionOperation | null> {
		const status = result.reused === true ? "reused" : "queued";
		const reason =
			result.reused === true
				? (result.reuseReason ?? `reused account-library materialization job ${result.job.id}`)
				: `queued account-library materialization job ${result.job.id}`;
		const requestedAt = result.generatedAt ?? now().toISOString();
		const updated = update(operation.id, {
			accountLibraryCursor: {
				jobId: result.job.id,
				jobStatus: result.job.status,
				reused: result.reused === true,
				requestedAt,
				passCount: operation.passCount,
				status,
				reason,
				request,
			},
		});
		await persistBackfillLedgerCursor(updated ?? operation, {
			accountLibrary: createAccountLibraryBackfillCursor({
				status,
				reason,
				updatedAt: requestedAt,
				readLimit: request.maxItems,
			}),
		});
		return appendLifecycleEvent(operation.id, {
			type: "account_library_catchup_queued",
			status: operations.get(operation.id)?.status ?? operation.status,
			previousStatus: operation.status,
			message: reason,
		});
	}

	async function recordAccountLibraryCatchupSkip(
		operation: AccountMirrorCompletionOperation,
		reason: string,
	): Promise<AccountMirrorCompletionOperation | null> {
		const requestedAt = now().toISOString();
		const updated = update(operation.id, {
			accountLibraryCursor: {
				jobId: null,
				jobStatus: null,
				reused: false,
				requestedAt,
				passCount: operation.passCount,
				status: "skipped",
				reason,
				request: null,
			},
		});
		await persistBackfillLedgerCursor(updated ?? operation, {
			accountLibrary: createAccountLibraryBackfillCursor({
				status: "skipped",
				reason,
				updatedAt: requestedAt,
				readLimit: null,
			}),
		});
		return appendLifecycleEvent(operation.id, {
			type: "account_library_catchup_skipped",
			status: operations.get(operation.id)?.status ?? operation.status,
			previousStatus: operation.status,
			message: reason,
		});
	}

	function blockGeminiResume(
		operation: AccountMirrorCompletionOperation,
		source: "automatic" | "operator",
	): AccountMirrorCompletionOperation {
		const updated =
			update(operation.id, {
				status: "paused",
				completedAt: null,
				nextAttemptAt: null,
				error: {
					message:
						"Gemini live-follow resume is blocked until the completion is upgraded or replaced with bounded left-rail retrieval policy.",
					code: "gemini_live_follow_resume_blocked",
				},
			}) ?? operation;
		return (
			appendLifecycleEvent(operation.id, {
				type: source === "automatic" ? "automatic_resume_blocked" : "operator_resume_blocked",
				status: "paused",
				previousStatus: operation.status,
				message:
					source === "automatic"
						? "Blocked automatic startup resume for legacy Gemini live-follow completion."
						: "Blocked operator resume for legacy Gemini live-follow completion.",
			}) ?? updated
		);
	}

	async function persistBackfillLedgerCursor(
		operation: AccountMirrorCompletionOperation,
		cursors: {
			accountLibrary?: AccountMirrorBackfillCursor | null;
			materialization?: AccountMirrorBackfillCursor | null;
		},
	): Promise<void> {
		const entry = findTargetEntry(input.registry, operation.provider, operation.runtimeProfileId);
		const updatedAt = now().toISOString();
		const backfillLedger = updateAccountMirrorBackfillLedgerCursors(entry?.backfillLedger ?? null, {
			provider: operation.provider,
			runtimeProfileId: operation.runtimeProfileId,
			browserProfileId: entry?.browserProfileId ?? null,
			boundIdentityKey:
				entry?.expectedIdentityKey ?? operation.lastRefresh?.detectedIdentityKey ?? null,
			updatedAt,
			...cursors,
		});
		const state = input.registry.mergeState(
			{ provider: operation.provider, runtimeProfileId: operation.runtimeProfileId },
			{ backfillLedger },
		);
		await input.registry.writePersistentState?.(
			{ provider: operation.provider, runtimeProfileId: operation.runtimeProfileId },
			state,
		);
	}
}

function isTerminalMaterializationStatus(status: string): boolean {
	return (
		status === "succeeded" || status === "skipped" || status === "failed" || status === "cancelled"
	);
}

function createAccountLibraryBackfillCursor(input: {
	status: "queued" | "reused" | "skipped";
	reason: string;
	updatedAt: string;
	readLimit: number | null;
}): AccountMirrorBackfillCursor {
	return {
		status: input.status === "skipped" ? "skipped" : "pending",
		reason: input.reason,
		updatedAt: input.updatedAt,
		nextIndex: null,
		readLimit: input.readLimit,
		scanned: null,
		yielded: false,
	};
}

function createMaterializationBackfillCursor(input: {
	jobId: string;
	jobStatus: string;
	updatedAt: string;
	passCount: number;
	reused?: boolean;
	outcome?: AccountMirrorCompletionMaterializationOutcome | null;
}): AccountMirrorBackfillCursor {
	const status = materializationBackfillCursorStatus(input.jobStatus);
	const materialized = input.outcome?.materialized ?? null;
	const failed = input.outcome?.failed ?? null;
	return {
		status,
		reason: input.outcome
			? `materialization job ${input.jobId} finished with status ${input.jobStatus}; materialized=${materialized ?? 0} failed=${failed ?? 0}`
			: `${input.reused === true ? "reused" : "queued"} materialization job ${input.jobId} with status ${input.jobStatus}`,
		updatedAt: input.updatedAt,
		nextIndex: null,
		readLimit: null,
		scanned: input.outcome?.conversationsAttempted ?? null,
		yielded: false,
	};
}

function materializationBackfillCursorStatus(
	status: string,
): AccountMirrorBackfillCursor["status"] {
	if (status === "succeeded") return "complete";
	if (status === "skipped" || status === "cancelled") return "skipped";
	if (status === "failed") return "pending";
	return "pending";
}

function summarizeMaterializationOutcome(
	job: AccountMirrorHistoryMaterializationJobReadResult,
): AccountMirrorCompletionMaterializationOutcome {
	const result = job.result ?? null;
	const metrics = result?.metrics ?? {};
	const entries = Array.isArray(result?.entries) ? result.entries : [];
	const snapshotRefreshes = Array.isArray(result?.snapshotRefreshes)
		? result.snapshotRefreshes
		: [];
	const eligibleCandidates = normalizeOutcomeCount(metrics.eligibleCandidates);
	const selectedCandidates = Math.min(
		eligibleCandidates,
		normalizeOutcomeCount(metrics.selectedCandidates),
	);
	return {
		jobId: job.id,
		jobStatus: job.status,
		completedAt:
			typeof job.completedAt === "string" && job.completedAt.trim() ? job.completedAt.trim() : null,
		conversationsAttempted: normalizeOutcomeCount(metrics.conversations),
		eligibleCandidates,
		selectedCandidates,
		materialized: normalizeOutcomeCount(metrics.materialized),
		skipped: normalizeOutcomeCount(metrics.skipped),
		failed: normalizeOutcomeCount(metrics.failed),
		checksumCount: entries.filter((entry) => readNestedString(entry, ["checksumSha256"])).length,
		manifestPaths: Array.isArray(result?.manifestPaths)
			? result.manifestPaths.filter(
					(entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
				)
			: [],
		terminalRouteabilityCounts: countRouteabilityStates(snapshotRefreshes),
		dispositionCounts: countMaterializationDispositions(entries),
		message:
			typeof result?.message === "string" && result.message.trim() ? result.message.trim() : null,
	};
}

function normalizeOutcomeCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function countRouteabilityStates(entries: unknown[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const entry of entries) {
		const state = readNestedString(entry, ["routeabilityState"]) ?? "unknown";
		counts[state] = (counts[state] ?? 0) + 1;
	}
	return counts;
}

function countMaterializationDispositions(entries: unknown[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const entry of entries) {
		const status = readNestedString(entry, ["status"]) ?? "unknown";
		const reason = (readNestedString(entry, ["reason"]) ?? "").toLowerCase();
		const failureKind = readNestedString(entry, ["failureKind"]);
		const disposition =
			failureKind === "provider_unavailable"
				? "provider_unavailable"
				: failureKind === "retrieval_failed"
					? "retrieval_failed"
					: status === "materialized"
						? "materialized"
						: status === "duplicate" || reason.includes("already_materialized")
							? "duplicate"
							: reason.includes("conversation-not-found-or-unavailable")
								? "terminal"
								: reason.includes("unsupported") && reason.includes("remote")
									? "unsupported_remote_media"
									: reason.includes("missing") &&
											(reason.includes("link") || reason.includes("url"))
										? "missing_provider_link"
										: /rate limit|cooldown|timed out|timeout|retry/.test(reason)
											? "retryable"
											: status;
		counts[disposition] = (counts[disposition] ?? 0) + 1;
	}
	return counts;
}

function readNestedString(value: unknown, path: string[]): string | null {
	let current: unknown = value;
	for (const key of path) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return null;
		current = (current as Record<string, unknown>)[key];
	}
	return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

async function shouldQueueMaterialization(
	operation: AccountMirrorCompletionOperation,
	statusEntry: AccountMirrorStatusEntry | null | undefined,
	readMaterializationBacklog: AccountMirrorMaterializationBacklogReader | undefined,
): Promise<boolean> {
	if (operation.lastRefresh?.status !== "completed") return false;
	if (
		operation.provider === "chatgpt" &&
		operation.sweepMode === "steady_follow" &&
		!operation.conversationIds?.length &&
		operation.lastRefresh.metadataEvidence?.changeFrontierPlan &&
		!operation.lastRefresh.metadataEvidence.detailConversationIdsThisPass?.length &&
		!operation.lastRefresh.metadataEvidence.retainedMaterializationConversationIds?.length
	)
		return false;
	if (operation.materializationPolicy === "metadata_only") return false;
	if (!operation.materializationPolicy && operation.sweepMode !== "full_sweep") return false;
	if (operation.materializationCursor?.passCount === operation.passCount) return false;
	if (operation.provider === "gemini" && isGeminiShellOnlyRouteChurn(operation)) return false;
	return hasActionableMaterializationBacklog(operation, statusEntry, readMaterializationBacklog);
}

async function shouldQueueMaterializationFromCompleteLedger(
	operation: AccountMirrorCompletionOperation,
	statusEntry: AccountMirrorStatusEntry | null | undefined,
	readMaterializationBacklog: AccountMirrorMaterializationBacklogReader | undefined,
): Promise<boolean> {
	if (operation.conversationIds?.length) return false;
	if (operation.mode !== "live_follow" || operation.lastRefresh !== null) return false;
	if (operation.materializationPolicy === "metadata_only") return false;
	if (!operation.materializationPolicy && operation.sweepMode !== "full_sweep") return false;
	if (operation.materializationCursor) return false;
	if (
		statusEntry?.mirrorCompleteness.state !== "complete" ||
		(statusEntry.backfillLedger?.state !== "complete" &&
			statusEntry.backfillLedger?.nextEligiblePhase !== "complete")
	) {
		return false;
	}
	const missing = statusEntry.mirrorCompleteness.assetInventory?.remoteKnownMissingLocal;
	if ((missing?.artifacts ?? 0) + (missing?.files ?? 0) + (missing?.media ?? 0) <= 0) {
		return false;
	}
	return hasActionableMaterializationBacklog(operation, statusEntry, readMaterializationBacklog);
}

async function hasActionableMaterializationBacklog(
	operation: AccountMirrorCompletionOperation,
	statusEntry: AccountMirrorStatusEntry | null | undefined,
	readMaterializationBacklog: AccountMirrorMaterializationBacklogReader | undefined,
): Promise<boolean> {
	if (!readMaterializationBacklog) return operation.sweepMode === "full_sweep";
	if (!statusEntry) return false;
	try {
		const backlog = await readMaterializationBacklog({
			provider: operation.provider,
			runtimeProfileId: operation.runtimeProfileId,
		});
		if (!backlog) return operation.sweepMode === "full_sweep";
		return hasLocallyActionableMaterializationBacklog(backlog);
	} catch {
		return false;
	}
}

function deriveAccountLibraryCooldownUntil(entry: AccountMirrorStatusEntry): string | null {
	const cooldownMs = entry.liveFollow.accountLibrary.failureCooldownMs;
	if (!cooldownMs || cooldownMs <= 0) return null;
	const lastFailureAtMs = Date.parse(entry.lastFailureAt ?? "");
	if (!Number.isFinite(lastFailureAtMs)) return null;
	return new Date(lastFailureAtMs + cooldownMs).toISOString();
}

function shouldBlockGeminiResume(operation: AccountMirrorCompletionOperation): boolean {
	if (operation.provider !== "gemini") return false;
	if (operation.mode !== "live_follow") return false;
	if (operation.maxPasses !== null) return false;
	if (hasProductiveGeminiRouteProgress(operation)) return false;
	const policy = operation.materializationPolicy ?? "metadata_only";
	if (policy === "metadata_only") return true;
	return operation.materializationMaxItems == null;
}

function hasProductiveGeminiRouteProgress(operation: AccountMirrorCompletionOperation): boolean {
	const routeProgress = operation.lastRefresh?.metadataEvidence?.routeProgress;
	return (
		routeProgress?.provider === "gemini" &&
		routeProgress.strategy === "gemini-left-rail" &&
		routeProgress.churnDetected !== true &&
		routeProgress.selectedConversationIds.length > 0
	);
}

function isGeminiShellOnlyRouteChurn(operation: AccountMirrorCompletionOperation): boolean {
	const routeProgress = operation.lastRefresh?.metadataEvidence?.routeProgress;
	return (
		routeProgress?.provider === "gemini" &&
		routeProgress.strategy === "gemini-left-rail" &&
		routeProgress.churnDetected === true &&
		routeProgress.selectedConversationIds.length === 0
	);
}

function normalizeLifecycleEvents(
	operation: AccountMirrorCompletionOperation,
): AccountMirrorCompletionOperation {
	return {
		...operation,
		lifecycleEvents: Array.isArray(operation.lifecycleEvents)
			? operation.lifecycleEvents.slice(-20)
			: [],
	};
}

function appendLifecycleEventToList(
	events: AccountMirrorCompletionLifecycleEvent[],
	event: AccountMirrorCompletionLifecycleEvent,
): AccountMirrorCompletionLifecycleEvent[] {
	return [...events, event].slice(-20);
}

function isActiveOperation(operation: AccountMirrorCompletionOperation): boolean {
	return (
		operation.status === "queued" ||
		operation.status === "running" ||
		operation.status === "idle_waiting" ||
		operation.status === "paused"
	);
}

function isRunnableOperation(operation: AccountMirrorCompletionOperation): boolean {
	return (
		operation.status === "queued" ||
		operation.status === "running" ||
		operation.status === "idle_waiting"
	);
}

function isTerminalOperation(operation: AccountMirrorCompletionOperation): boolean {
	return (
		operation.status === "completed" ||
		operation.status === "blocked" ||
		operation.status === "failed" ||
		operation.status === "cancelled"
	);
}

function findTargetEntry(
	registry: AccountMirrorStatusRegistry,
	provider: AccountMirrorProvider,
	runtimeProfileId: string,
): AccountMirrorStatusEntry | null {
	return (
		registry.readStatus({
			provider,
			runtimeProfileId,
			explicitRefresh: true,
		}).entries[0] ?? null
	);
}

function resolveProviderGuardBackoff(
	entry: AccountMirrorStatusEntry | null,
	nowDate: Date,
): { eligibleAt: string; message: string; code: string } | null {
	if (!entry) return null;
	const guard = entry.providerGuard;
	const cooldownUntil = guard.cooldownUntil;
	if (
		guard.state === "cooldown" &&
		cooldownUntil &&
		Date.parse(cooldownUntil) > nowDate.getTime()
	) {
		return {
			eligibleAt: cooldownUntil,
			message: formatProviderGuardBackoffMessage(entry, cooldownUntil),
			code: "account_mirror_provider_cooldown",
		};
	}
	if (
		(entry.reason === "provider-guard-cooldown" || entry.reason === "provider-cooldown") &&
		entry.eligibleAt &&
		Date.parse(entry.eligibleAt) > nowDate.getTime()
	) {
		return {
			eligibleAt: entry.eligibleAt,
			message: formatProviderGuardBackoffMessage(entry, entry.eligibleAt),
			code: "account_mirror_provider_cooldown",
		};
	}
	return null;
}

function formatProviderGuardBackoffMessage(
	entry: AccountMirrorStatusEntry,
	eligibleAt: string,
): string {
	const summary = entry.providerGuard.summary ?? "Provider guard cooldown is active.";
	return `${summary} Automation is delayed until ${eligibleAt} before ${entry.provider}/${entry.runtimeProfileId} live follow can continue.`;
}

function resolveStatusEntryFailure(
	entry: AccountMirrorStatusEntry,
): AccountMirrorCompletionOperation["error"] {
	const progress = entry.metadataEvidence?.collectorProgress;
	if (progress?.event !== "failed") return null;
	if (
		!collectorFailureIsUnresolved(progress.observedAt, entry.lastSuccessAt, entry.backfillLedger)
	) {
		return null;
	}
	const diagnostics = entry.metadataEvidence?.collectorDiagnostics ?? [];
	const latestFailure = [...diagnostics]
		.reverse()
		.find((diagnostic) => ["failed", "timed_out", "aborted"].includes(diagnostic.event));
	const detail = latestFailure?.detail?.trim();
	return {
		message:
			detail ||
			`Account mirror collector failed during ${progress.phase} at ${progress.observedAt}.`,
		code:
			latestFailure?.event === "timed_out"
				? "account_mirror_collector_timeout"
				: latestFailure?.event === "aborted"
					? "account_mirror_collector_aborted"
					: "account_mirror_collector_failed",
	};
}

function normalizeRuntimeProfile(value: string | null | undefined): string {
	const trimmed = String(value ?? "default").trim();
	return trimmed.length > 0 ? trimmed : "default";
}

function normalizeSweepMode(
	value: AccountMirrorCompletionSweepMode | null | undefined,
): AccountMirrorCompletionSweepMode {
	return value === "full_sweep" ? "full_sweep" : "steady_follow";
}

function normalizeMaterializationPolicy(
	value: AccountMirrorCompletionMaterializationPolicy | null | undefined,
	sweepMode: AccountMirrorCompletionSweepMode,
): AccountMirrorCompletionMaterializationPolicy {
	if (
		value === "metadata_only" ||
		value === "recent_missing_assets" ||
		value === "full_missing_assets"
	) {
		return value;
	}
	return sweepMode === "full_sweep" ? "full_missing_assets" : "metadata_only";
}

function normalizeMaterializationAssetKinds(
	value: AccountMirrorCompletionMaterializationAssetKind[] | null | undefined,
): AccountMirrorCompletionMaterializationAssetKind[] {
	if (!Array.isArray(value) || value.length === 0) return ["all"];
	const normalized = value.filter(
		(entry) => entry === "artifacts" || entry === "files" || entry === "media" || entry === "all",
	);
	if (normalized.includes("all")) return ["all"];
	return normalized.length > 0 ? Array.from(new Set(normalized)) : ["all"];
}

function normalizeMaterializationMaxItems(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(1, Math.min(500, Math.floor(value)));
}

function normalizeMaterializationRefreshSnapshot(
	value: boolean | null | undefined,
	sweepMode: AccountMirrorCompletionSweepMode,
): boolean {
	return value ?? sweepMode === "full_sweep";
}

function resolveRequestedCollectorPhase(
	operation: AccountMirrorCompletionOperation,
	statusEntry?: AccountMirrorStatusEntry | null,
): AccountMirrorCollectorPhase | null {
	const statusRequestedPhase = resolveStatusRequestedCollectorPhase(operation, statusEntry);
	if (statusRequestedPhase) return statusRequestedPhase;
	if (operation.mode !== "live_follow") return null;
	return liveFollowCyclePhaseToCollectorPhase(operation.liveFollowCycle?.nextPhase ?? null);
}

function resolveStatusRequestedCollectorPhase(
	operation: AccountMirrorCompletionOperation,
	statusEntry: AccountMirrorStatusEntry | null | undefined,
): AccountMirrorCollectorPhase | null {
	if (!statusEntry || !hasStatusPhaseEvidence(statusEntry)) return null;
	const decision = chooseLiveFollowCyclePhase({
		operation: {
			passCount:
				statusEntry.metadataEvidence || statusEntry.lastCompletedAt ? 1 : operation.passCount,
			lastRefresh:
				statusEntry.metadataEvidence || statusEntry.lastCompletedAt ? {} : operation.lastRefresh,
		},
		evidence: statusEntry.metadataEvidence ?? operation.lastRefresh?.metadataEvidence ?? null,
		remainingDetailSurfaces:
			statusEntry.mirrorCompleteness.remainingDetailSurfaces?.total ??
			operation.mirrorCompleteness?.remainingDetailSurfaces?.total ??
			null,
		backfillLedger: statusEntry.backfillLedger,
		latestSuccessfulRefreshAt:
			statusEntry.lastSuccessAt ?? operation.lastRefresh?.completedAt ?? null,
	});
	return liveFollowCyclePhaseToCollectorPhase(decision.phase);
}

function reconcileLoadedLiveFollowCycle(
	operation: AccountMirrorCompletionOperation,
	now: string,
): AccountMirrorCompletionOperation {
	if (operation.mode !== "live_follow" || !operation.lastRefresh) return operation;
	return {
		...operation,
		liveFollowCycle: deriveLiveFollowCycleLedger({
			operation,
			statusEntry: null,
			now: operation.lastRefresh.completedAt ?? operation.completedAt ?? now,
		}),
	};
}

function hasStatusPhaseEvidence(statusEntry: AccountMirrorStatusEntry): boolean {
	return Boolean(
		statusEntry.backfillLedger ||
			statusEntry.metadataEvidence ||
			statusEntry.lastCompletedAt ||
			(statusEntry.mirrorCompleteness.remainingDetailSurfaces?.total ?? 0) > 0,
	);
}

function liveFollowCyclePhaseToCollectorPhase(
	phase: AccountMirrorLiveFollowCyclePhase | null,
): AccountMirrorCollectorPhase | null {
	if (
		phase === "identity" ||
		phase === "projects" ||
		phase === "root-conversations" ||
		phase === "project-conversations" ||
		phase === "chatgpt-library" ||
		phase === "detail-inventory" ||
		phase === "merge-persisted-catalog"
	) {
		return phase;
	}
	return null;
}

function formatCollectorProgressLifecycleMessage(
	progress: AccountMirrorCollectorPhaseProgressEvidence,
): string {
	const counts = [
		progress.projectsObserved === undefined ? null : `projects=${progress.projectsObserved}`,
		progress.conversationsObserved === undefined
			? null
			: `conversations=${progress.conversationsObserved}`,
		progress.artifactsObserved === undefined ? null : `artifacts=${progress.artifactsObserved}`,
		progress.filesObserved === undefined ? null : `files=${progress.filesObserved}`,
	]
		.filter(Boolean)
		.join(" ");
	return counts
		? `Collector progress: ${progress.phase}:${progress.event} ${counts}.`
		: `Collector progress: ${progress.phase}:${progress.event}.`;
}

function normalizeMaterializationForce(value: boolean | null | undefined): boolean {
	return value === true;
}

function normalizeMaxPasses(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(1, Math.min(500, Math.floor(value)));
}

function normalizeForegroundRetryDelayMs(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 60_000;
	return Math.max(1_000, Math.min(300_000, Math.floor(value)));
}

function resolveUpgradeMaxPasses(
	operation: AccountMirrorCompletionOperation,
	value: number | null | undefined,
): number {
	const additionalPasses = normalizeMaxPasses(value) ?? 1;
	const inFlightBuffer = operation.status === "running" ? 1 : 0;
	const requested = operation.passCount + additionalPasses + inFlightBuffer;
	if (operation.mode === "bounded" && operation.maxPasses !== null) {
		return Math.max(operation.maxPasses, requested);
	}
	return requested;
}

function normalizeListLimit(value: number | null | undefined): number | null {
	if (value === null) return null;
	if (typeof value !== "number" || !Number.isFinite(value)) return 50;
	return Math.max(1, Math.min(500, Math.floor(value)));
}

function readCompletionStatus(
	value: AccountMirrorCompletionListRequest["status"],
): AccountMirrorCompletionOperation["status"] | null {
	if (
		value === "queued" ||
		value === "running" ||
		value === "idle_waiting" ||
		value === "paused" ||
		value === "completed" ||
		value === "blocked" ||
		value === "failed" ||
		value === "cancelled"
	) {
		return value;
	}
	return null;
}

function readErrorCode(error: unknown): string | null {
	if (!error || typeof error !== "object") return null;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" && code.length > 0 ? code : null;
}

function readEligibleAt(error: unknown): string | null {
	if (!(error instanceof AccountMirrorRefreshError)) return null;
	if (
		error.code !== "account_mirror_not_eligible" &&
		error.code !== "account_mirror_provider_guard" &&
		error.code !== "account_mirror_provider_cooldown"
	) {
		return null;
	}
	const eligibleAt = error.details.eligibleAt;
	if (typeof eligibleAt === "string" && !Number.isNaN(Date.parse(eligibleAt))) return eligibleAt;
	const providerCooldownUntilMs = error.details.providerCooldownUntilMs;
	return typeof providerCooldownUntilMs === "number" &&
		Number.isFinite(providerCooldownUntilMs) &&
		providerCooldownUntilMs > 0
		? new Date(providerCooldownUntilMs).toISOString()
		: null;
}

function resolveDelayMs(eligibleAt: string, now: Date): number {
	return Math.max(0, Date.parse(eligibleAt) - now.getTime());
}

function materializationInteractionPolicy(
	entry: AccountMirrorStatusEntry | null | undefined,
): AccountMirrorMaterializationInteractionPolicy | null {
	if (!entry) return null;
	return {
		maxInteractionsPerMinute: entry.limits.maxBrowserInteractionsPerMinute,
		conversationReadCooldownMs: entry.limits.conversationReadCooldownMs,
		pageRefreshCooldownMs: entry.limits.pageRefreshCooldownMs,
		renavigationCooldownMs: entry.limits.renavigationCooldownMs,
	};
}

function materializationProviderWorkNotBefore(
	refresh: AccountMirrorRefreshResult,
	entry: AccountMirrorStatusEntry | null | undefined,
): string | null {
	if (!refresh.completedAt || !entry) return null;
	const completedAtMs = Date.parse(refresh.completedAt);
	if (!Number.isFinite(completedAtMs)) return null;
	const quietMs = Math.max(
		entry.limits.conversationReadCooldownMs,
		entry.limits.pageRefreshCooldownMs,
		entry.limits.renavigationCooldownMs,
	);
	if (quietMs <= 0) return null;
	return new Date(completedAtMs + quietMs).toISOString();
}

function shouldCleanupManagedBrowserAfterRefresh(
	operation: AccountMirrorCompletionOperation,
	currentPassCount: number,
): boolean {
	const reachesForcedPassCeiling =
		typeof operation.forceRunUntilPassCount === "number" &&
		currentPassCount + 1 >= operation.forceRunUntilPassCount;
	return (
		reachesForcedPassCeiling ||
		(operation.provider === "gemini" &&
			operation.mode === "bounded" &&
			operation.maxPasses !== null &&
			currentPassCount + 1 >= operation.maxPasses)
	);
}

function isRetryableTerminalLiveFollow(operation: AccountMirrorCompletionOperation): boolean {
	return (
		operation.mode === "live_follow" &&
		(operation.status === "blocked" || operation.status === "failed")
	);
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
	});
}
