import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { findChromePidUsingUserDataDir } from "../../packages/browser-service/src/processCheck.js";
import {
	type BrowserInteractionGovernor,
	createBrowserInteractionGovernor,
} from "../../packages/browser-service/src/service/interactionGovernor.js";
import {
	type BrowserOperationAcquiredResult,
	type BrowserOperationDispatcher,
	createFileBackedBrowserOperationDispatcher,
	formatBrowserOperationBusyResult,
} from "../../packages/browser-service/src/service/operationDispatcher.js";
import {
	type AccountMirrorConversationEvidence,
	createAccountMirrorPersistence,
} from "../accountMirror/cachePersistence.js";
import {
	type AccountMirrorCatalogEntry,
	type AccountMirrorCatalogItemResult,
	type AccountMirrorCatalogKind,
	type AccountMirrorCatalogService,
	createAccountMirrorCatalogService,
} from "../accountMirror/catalogService.js";
import { getDefaultAccountMirrorPolitenessPolicy } from "../accountMirror/politePolicy.js";
import { createAccountMirrorProviderTrafficWorkKey } from "../accountMirror/providerTrafficPlan.js";
import { accountMirrorIdentityKeysMatch } from "../accountMirror/tenantBinding.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import { retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown } from "../browser/configuredChatgptTabMaintenance.js";
import { DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS } from "../browser/llmService/llmService.js";
import { createLlmService } from "../browser/llmService/providers/index.js";
import type { ConversationContextReadReceipt } from "../browser/providers/cache.js";
import type { ConversationArtifact, FileRef, ProviderId } from "../browser/providers/domain.js";
import {
	type ProviderSessionProof,
	type ProviderSessionProofSummary,
	summarizeProviderSessionProof,
} from "../browser/providers/providerSessionAuthority.js";
import {
	type BrowserScrapeTelemetrySnapshot,
	createBrowserScrapeTelemetryRecorder,
	snapshotBrowserScrapeTelemetry,
} from "../browser/providers/scrapeTelemetry.js";
import type { BrowserProviderListOptions } from "../browser/providers/types.js";
import { resolveBrowserLaunchPlan } from "../browser/service/browserLaunchPlan.js";
import type { BrowserProcessOwnerAttribution } from "../browser/service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "../browser/service/profileConfig.js";
import type { ResolvedUserConfig } from "../config.js";
import { createBrowserMediaGenerationMaterializer } from "../media/browserExecutor.js";
import { createMediaGenerationService } from "../media/service.js";
import type {
	MediaGenerationArtifact,
	MediaGenerationResponse,
	MediaGenerationType,
} from "../media/types.js";
import { getRunArchiveDir } from "./archiveIndexStore.js";
import {
	createRunArchiveService,
	type RunArchiveHistoryMaterializationAsset,
	type RunArchiveItem,
	type RunArchiveService,
} from "./archiveService.js";

const execFileAsync = promisify(execFile);

export type HistoryMaterializationJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "skipped"
	| "failed"
	| "cancelled";

export type HistoryMaterializationAssetKind = "artifacts" | "files" | "media" | "all";
export type HistoryMaterializationAssetSource = "account-library";

export interface HistoryMaterializationCreateRequest {
	provider?: ProviderId | null;
	runtimeProfile?: string | null;
	browserProfile?: string | null;
	boundIdentityKey?: string | null;
	conversationId?: string | null;
	conversationIds?: string[] | null;
	providerConversationUrl?: string | null;
	projectId?: string | null;
	catalogItemId?: string | null;
	catalogKind?: AccountMirrorCatalogKind | null;
	archiveItemId?: string | null;
	reconcile?: boolean | null;
	assetSource?: HistoryMaterializationAssetSource | null;
	refreshSnapshot?: boolean | null;
	reuseSnapshotAfter?: string | null;
	reuseSnapshotConversationIds?: string[] | null;
	providerWorkNotBefore?: string | null;
	interactionPolicy?: HistoryMaterializationInteractionPolicy | null;
	assetKinds?: HistoryMaterializationAssetKind[] | null;
	maxItems?: number | null;
	providerWorkTimeoutMs?: number | null;
	force?: boolean | null;
}

export interface HistoryMaterializationInteractionPolicy {
	maxInteractionsPerMinute: number;
	conversationReadCooldownMs: number;
	pageRefreshCooldownMs: number;
	renavigationCooldownMs: number;
}

export interface HistoryMaterializationProviderWorkContext {
	interactionGovernor: BrowserInteractionGovernor | null;
	contextTimeoutMs: number;
	excludedAssetFamilySignatures?: string[];
	selectedCatalogAsset?: HistoryMaterializationSelectedCatalogAsset;
	providerSessionProofSummary?: ProviderSessionProofSummary | null;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}

export function historyMaterializationUtilityAffinityId(
	jobId: string | null | undefined,
): string | undefined {
	const normalized = jobId?.trim();
	return normalized ? `history-materialization:${normalized}` : undefined;
}

export type HistoryMaterializationSelectedCatalogAsset =
	| {
			kind: "file";
			id: string | null;
			name: string | null;
			providerFileId: string | null;
	  }
	| {
			kind: "artifact";
			id: string | null;
			title: string | null;
			uri: string | null;
			artifactKind: ConversationArtifact["kind"] | null;
			messageId: string | null;
			turnId: string | null;
	  };

export interface HistoryMaterializationManifestEntry {
	priorEvidenceJobId?: string | null;
	kind: "artifact" | "file" | "media";
	providerId: string | null;
	title: string | null;
	status: "materialized" | "duplicate" | "skipped" | "failed";
	localPath: string | null;
	remoteUrl: string | null;
	cacheKey: string | null;
	checksumSha256: string | null;
	mimeType: string | null;
	size: number | null;
	materializationMethod: string | null;
	reason: string | null;
	assetAvailability?: "available" | "unavailable" | "unknown";
	failureKind?: "provider_unavailable" | "retrieval_failed" | null;
	retryable?: boolean | null;
	recoverabilityState?: HistoryMaterializationRecoverabilityState;
	archiveItemId: string | null;
	assetRoute: string | null;
}

export type HistoryMaterializationRecoverabilityState =
	| "downloadable_now"
	| "repair_prompt_candidate"
	| "metadata_only"
	| "terminally_unavailable"
	| "materialized";

export interface HistoryMaterializationTarget {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	conversationId: string;
	providerConversationUrl: string | null;
	projectId: string | null;
}

export type HistoryMaterializationSnapshotRouteabilityState =
	| "routeable"
	| "not_found_or_unavailable"
	| "identity_mismatch"
	| "guarded"
	| "auth_conflict"
	| "unknown";

export interface HistoryMaterializationSnapshotRefresh {
	object: "history_materialization_snapshot_refresh";
	generatedAt: string;
	status: "refreshed" | "skipped" | "failed";
	target: HistoryMaterializationTarget | null;
	routeabilityState: HistoryMaterializationSnapshotRouteabilityState;
	messageCount: number | null;
	fileCount: number | null;
	sourceCount: number | null;
	artifactCount: number | null;
	contextReadReceipt?: ConversationContextReadReceipt | null;
	error: string | null;
	message: string;
}

export interface HistoryMaterializationPhases {
	snapshotRefresh: HistoryMaterializationSnapshotRefresh | null;
	materialization: {
		status: HistoryMaterializationResult["status"];
		generatedAt: string;
		manifestPaths: string[];
		entries: number;
		archiveItems: number;
		metrics: HistoryMaterializationResult["metrics"];
	} | null;
}

export interface HistoryMaterializationAttemptReceipt {
	object: "history_materialization_attempt_receipt";
	version: 1;
	generatedAt: string;
	origin:
		| "direct"
		| "catalog_item"
		| "archive_item"
		| "selected_conversation_id"
		| "reconciliation_candidate";
	index: number;
	target: HistoryMaterializationTarget;
	budgetBefore: {
		targetLimit: number | null;
		targetsConsumed: number;
		assetsRemaining: number | null;
	};
	accounting: {
		targetConsumed: boolean;
		assetsAttempted: number;
		providerGuardObserved: boolean;
		candidateMaterialized: boolean;
	};
	phases: HistoryMaterializationPhases;
	evidence: {
		status: "persisted" | "not_required";
		writes: Array<"snapshot_refresh" | "materialization">;
	};
	status: HistoryMaterializationResult["status"];
}

export interface HistoryMediaGenerationMaterializeInput {
	mediaGenerationId: string;
	provider: ProviderId;
	mediaType: MediaGenerationType;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	conversationId: string;
	providerConversationUrl: string | null;
	projectId: string | null;
	jobId: string;
	matchBasis: string;
	count: number | null;
	metadata?: Record<string, unknown> | null;
}

export interface HistoryAccountLibraryMaterializeInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	catalogItemId: string;
	file: FileRef;
	jobId: string;
}

export interface HistoryAccountLibraryListInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	jobId?: string | null;
}

export interface HistoryProjectSourcesMaterializeInput {
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	projectId: string;
	jobId: string;
	maxItems: number | null;
}

export interface HistoryMaterializationProviderListOptions extends BrowserProviderListOptions {
	configuredUrl?: string;
	tabUrl?: string;
	projectId?: string;
	allowNavigation: true;
	skipFeatureSignature?: boolean;
}

export interface HistoryMaterializationResult {
	object: "history_materialization_result";
	generatedAt: string;
	status: "materialized" | "skipped" | "failed";
	target: HistoryMaterializationTarget | null;
	source: HistoryMaterializationJob["source"];
	manifestPaths: string[];
	entries: HistoryMaterializationManifestEntry[];
	archiveItems: RunArchiveItem[];
	pendingAssetCount?: number;
	snapshotRefreshes?: HistoryMaterializationSnapshotRefresh[] | null;
	attempts?: HistoryMaterializationAttemptReceipt[] | null;
	scrapeTelemetry?: BrowserScrapeTelemetrySnapshot | null;
	providerSessionProof?: ProviderSessionProofSummary | null;
	metrics: {
		conversations: number;
		eligibleCandidates?: number;
		selectedCandidates?: number;
		materializedCandidates?: number;
		candidateFunnel?: HistoryMaterializationCandidateFunnel;
		materialized: number;
		duplicateAliases?: number;
		skipped: number;
		failed: number;
	};
	phases?: HistoryMaterializationPhases | null;
	message: string;
}

export interface HistoryMaterializationCandidateFunnel {
	unit: "conversation";
	discovered: number;
	preEligibilityExclusions: {
		identityMismatch: number;
		missingConversationId: number;
		ignoredProviderRoute: number;
		terminalConversationEvidence: number;
		ineligibleSelectedManifest: number;
		noSelectedAssetEvidence: number;
		assetsAlreadyComplete: number;
		missingTarget: number;
		terminalAssetFamilies: number;
	};
	eligible: number;
	postEligibilityExclusions: {
		duplicateAssetFamilies: number;
		targetBudget: number;
		assetBudget: number;
		providerGuard: number;
	};
	selected: number;
}

export interface HistoryMaterializationJob {
	object: "history_materialization_job";
	id: string;
	source:
		| { type: "conversation"; provider: ProviderId; conversationId: string }
		| { type: "catalog_item"; catalogItemId: string; catalogKind: AccountMirrorCatalogKind | null }
		| { type: "archive_item"; archiveItemId: string }
		| { type: "project_sources"; provider: ProviderId; projectId: string }
		| { type: "reconciliation"; provider: ProviderId | null }
		| { type: "account_library_reconciliation"; provider: ProviderId | null };
	request: HistoryMaterializationCreateRequest;
	sourceKey: string;
	status: HistoryMaterializationJobStatus;
	createdAt: string;
	updatedAt: string;
	startedAt: string | null;
	completedAt: string | null;
	attemptCount: number;
	result: HistoryMaterializationResult | null;
	providerSessionProof?: ProviderSessionProofSummary | null;
	scrapeTelemetry?: BrowserScrapeTelemetrySnapshot | null;
	error: {
		message: string;
		type:
			| "invalid_request_error"
			| "not_found_error"
			| "provider_auth_conflict"
			| "provider_guard_required"
			| "internal_error";
		statusCode: number;
	} | null;
	message: string;
	scheduler?: HistoryMaterializationJobSchedulerDiagnostics | null;
}

export function projectHistoryMaterializationJobForMonitoring(
	job: HistoryMaterializationJob,
): HistoryMaterializationJob {
	return {
		object: job.object,
		id: job.id,
		source: job.source,
		request: {
			...job.request,
			conversationIds: undefined,
			reuseSnapshotConversationIds: undefined,
		},
		sourceKey: job.sourceKey.slice(0, 500),
		status: job.status,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
		startedAt: job.startedAt,
		completedAt: job.completedAt,
		attemptCount: job.attemptCount,
		result: job.result
			? {
					object: job.result.object,
					generatedAt: job.result.generatedAt,
					status: job.result.status,
					target: job.result.target,
					source: job.result.source,
					manifestPaths: [],
					entries: [],
					archiveItems: [],
					snapshotRefreshes: null,
					scrapeTelemetry: null,
					providerSessionProof: job.result.providerSessionProof ?? null,
					metrics: job.result.metrics,
					phases: undefined,
					message: job.result.message.slice(0, 500),
				}
			: null,
		providerSessionProof: job.providerSessionProof ?? job.result?.providerSessionProof ?? null,
		scrapeTelemetry: null,
		error: job.error ? { ...job.error, message: job.error.message.slice(0, 500) } : null,
		message: job.message.slice(0, 500),
		scheduler: job.scheduler,
	};
}

export interface HistoryMaterializationJobSchedulerDiagnostics {
	object: "history_materialization_job_scheduler";
	generatedAt: string;
	state: "queued" | "stale_queued" | "running" | "succeeded" | "skipped" | "failed" | "cancelled";
	dispatchState: "scheduled" | "unscheduled" | "running" | "terminal";
	queuedAgeMs: number | null;
	runAgeMs: number | null;
	queuedToStartLatencyMs: number | null;
	stale: boolean;
	staleReason: string | null;
}

export interface HistoryMaterializationJobCreateResult {
	object: "history_materialization_job_create_result";
	generatedAt: string;
	reused: boolean;
	reuseReason: string | null;
	job: HistoryMaterializationJob;
}

export interface HistoryMaterializationJobListRequest {
	status?: HistoryMaterializationJobStatus | "active" | "terminal" | null;
	provider?: ProviderId | null;
	runtimeProfile?: string | null;
	sourceType?: HistoryMaterializationJob["source"]["type"] | null;
	limit?: number | null;
}

export interface HistoryMaterializationJobListResult {
	object: "history_materialization_jobs";
	generatedAt: string;
	status: HistoryMaterializationJobListRequest["status"] | null;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	sourceType: HistoryMaterializationJobListRequest["sourceType"] | null;
	limit: number;
	jobs: HistoryMaterializationJob[];
	metrics: {
		total: number;
		byStatus: Record<string, number>;
		active: number;
		terminal: number;
	};
}

const DEFAULT_RUNNING_STALE_THRESHOLD_MS = 30 * 60_000;

export interface HistoryAccountLibraryReconciliationPreviewResult {
	object: "history_account_library_reconciliation_preview";
	generatedAt: string;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	maxItems: number;
	metrics: {
		catalogFiles: number;
		eligibleCandidates: number;
		selectedCandidates: number;
		archivedFamilies: number;
		unresolvedStale: number;
		unsupportedOrTerminal: number;
		duplicateFamilies: number;
	};
}

export interface HistoryMaterializationService {
	createJob(
		request: HistoryMaterializationCreateRequest,
	): Promise<HistoryMaterializationJobCreateResult>;
	listJobs(
		request?: HistoryMaterializationJobListRequest,
	): Promise<HistoryMaterializationJobListResult>;
	listJobsBatch?(
		requests: HistoryMaterializationJobListRequest[],
	): Promise<HistoryMaterializationJobListResult[]>;
	readJob(id: string): Promise<HistoryMaterializationJob | null>;
	cancelJob(id: string): Promise<HistoryMaterializationJob>;
	runJob(id: string): Promise<HistoryMaterializationJob>;
	recoverInterruptedJobs(): Promise<number>;
	previewAccountLibraryReconciliation?(
		request: HistoryMaterializationCreateRequest,
	): Promise<HistoryAccountLibraryReconciliationPreviewResult>;
}

export class HistoryMaterializationError extends Error {
	constructor(
		message: string,
		readonly statusCode: 400 | 404 = 400,
	) {
		super(message);
		this.name = "HistoryMaterializationError";
	}
}

export class HistoryMaterializationJobControlError extends Error {
	constructor(
		message: string,
		readonly statusCode: 400 | 404 | 409 = 400,
		readonly type = statusCode === 404
			? "not_found_error"
			: statusCode === 409
				? "conflict_error"
				: "invalid_request_error",
	) {
		super(message);
		this.name = "HistoryMaterializationJobControlError";
	}
}

export function formatHistoryMaterializationFailureReason(input: {
	target?: HistoryMaterializationTarget | null;
	error: unknown;
}): string {
	const message = input.error instanceof Error ? input.error.message : String(input.error);
	const geminiRouteabilityReason = formatGeminiConversationRouteabilityReason(
		input.target ?? null,
		message,
	);
	return geminiRouteabilityReason ?? message;
}

export interface HistoryMaterializationServiceDeps {
	config: ResolvedUserConfig | Record<string, unknown>;
	catalogService?: AccountMirrorCatalogService;
	runArchiveService?: RunArchiveService;
	store?: HistoryMaterializationJobStore;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
	generateId?: () => string;
	schedule?: (work: () => Promise<void>) => void;
	withForegroundWork?: <T>(work: () => Promise<T>) => Promise<T>;
	cleanupManagedBrowserAfterProviderWork?: boolean;
	browserOperationDispatcher?: BrowserOperationDispatcher;
	browserOperationQueueTimeoutMs?: number;
	browserOperationQueuePollMs?: number;
	cleanupManagedBrowser?: (
		config: ResolvedUserConfig | Record<string, unknown>,
		request: HistoryMaterializationCreateRequest,
	) => Promise<void>;
	retireIdleChatgptLeasesAfterManagedBrowserShutdown?: typeof retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
	materializeConversation?: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		context?: HistoryMaterializationProviderWorkContext,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot?: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		context?: HistoryMaterializationProviderWorkContext,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence?: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializeMediaGeneration?: (
		input: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	materializeAccountLibraryFiles?: (input: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles?: (input: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	materializeProjectSources?: (input: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	onProviderGuardObserved?: (input: {
		request: HistoryMaterializationCreateRequest;
		result: HistoryMaterializationResult;
	}) => Promise<void> | void;
}

export interface HistoryMaterializationJobStore {
	listJobs(): Promise<HistoryMaterializationJob[]>;
	readJob(id: string): Promise<HistoryMaterializationJob | null>;
	upsertJob(job: HistoryMaterializationJob): Promise<void>;
}

interface HistoryMaterializationAttempt {
	jobId: string;
	request: HistoryMaterializationCreateRequest;
	candidate: {
		origin: HistoryMaterializationAttemptReceipt["origin"];
		index: number;
		target: HistoryMaterializationTarget;
		excludedAssetFamilySignatures?: string[];
		selectedCatalogAsset?: HistoryMaterializationSelectedCatalogAsset;
	};
	budgetBefore: HistoryMaterializationAttemptReceipt["budgetBefore"];
}

interface HistoryMaterializationAttemptOutcome {
	result: HistoryMaterializationResult;
	receipt: HistoryMaterializationAttemptReceipt;
	accounting: HistoryMaterializationAttemptReceipt["accounting"];
}

interface HistoryMaterializationAttemptExecutor {
	execute(attempt: HistoryMaterializationAttempt): Promise<HistoryMaterializationAttemptOutcome>;
}

function createHistoryMaterializationAttemptExecutor(input: {
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		context?: HistoryMaterializationProviderWorkContext,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	providerWorkContext: (
		jobId: string,
		request: HistoryMaterializationCreateRequest,
	) => HistoryMaterializationProviderWorkContext;
	now: () => Date;
}): HistoryMaterializationAttemptExecutor {
	return {
		async execute(attempt) {
			const jobContext = input.providerWorkContext(attempt.jobId, attempt.request);
			const context: HistoryMaterializationProviderWorkContext = {
				...jobContext,
				excludedAssetFamilySignatures: attempt.candidate.excludedAssetFamilySignatures,
				selectedCatalogAsset: attempt.candidate.selectedCatalogAsset,
			};
			const evidenceWrites: HistoryMaterializationAttemptReceipt["evidence"]["writes"] = [];
			const persistSnapshotEvidence = async (
				snapshotRefresh: HistoryMaterializationSnapshotRefresh,
			): Promise<void> => {
				await input.recordConversationEvidence(
					attempt.candidate.target,
					evidenceFromSnapshotRefresh(snapshotRefresh),
				);
				evidenceWrites.push("snapshot_refresh");
			};
			const persistMaterializationEvidence = async (
				result: HistoryMaterializationResult,
			): Promise<void> => {
				verifyHistoryMaterializationAttemptResult(attempt, result);
				await input.recordConversationEvidence(
					attempt.candidate.target,
					evidenceFromMaterializationResult(result),
				);
				evidenceWrites.push("materialization");
			};
			const materialize = () =>
				input.materializeConversation(
					attempt.candidate.target,
					attempt.request,
					attempt.jobId,
					context,
				);

			let result: HistoryMaterializationResult;
			if (!shouldRefreshSnapshot(attempt.request)) {
				result = await materialize();
				await persistMaterializationEvidence(result);
			} else if (
				shouldUseFileMaterializationAsSnapshotRefresh(attempt.candidate.target, attempt.request)
			) {
				const materialization = await materialize();
				verifyHistoryMaterializationAttemptResult(attempt, materialization);
				const snapshotRefresh = snapshotRefreshFromFileMaterialization({
					target: attempt.candidate.target,
					result: materialization,
					now: input.now,
				});
				await persistSnapshotEvidence(snapshotRefresh);
				await persistMaterializationEvidence(materialization);
				result = withSnapshotRefreshPhase(materialization, snapshotRefresh);
			} else {
				let initialMaterialization: HistoryMaterializationResult | null = null;
				if (shouldMaterializeBeforeSnapshotRefresh(attempt.candidate.target, attempt.request)) {
					initialMaterialization = await materialize();
					await persistMaterializationEvidence(initialMaterialization);
					if (
						initialMaterialization.metrics.materialized > 0 ||
						shouldReuseCollectorSnapshot(attempt.candidate.target, attempt.request)
					) {
						result = initialMaterialization;
						return projectHistoryMaterializationAttemptOutcome(
							attempt,
							result,
							evidenceWrites,
							input.now,
						);
					}
				}
				let snapshotRefresh: HistoryMaterializationSnapshotRefresh;
				try {
					snapshotRefresh = await input.refreshConversationSnapshot(
						attempt.candidate.target,
						attempt.request,
						attempt.jobId,
					);
				} catch (error) {
					if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
						throw error;
					}
					snapshotRefresh = failedSnapshotRefresh({
						target: attempt.candidate.target,
						error,
						now: input.now,
					});
				}
				await persistSnapshotEvidence(snapshotRefresh);
				if (snapshotRefresh.status === "failed") {
					result = snapshotRefreshFailureResult({
						request: attempt.request,
						target: attempt.candidate.target,
						snapshotRefresh,
						now: input.now,
					});
				} else {
					const materialization = await materialize();
					await persistMaterializationEvidence(materialization);
					result = withSnapshotRefreshPhase(materialization, snapshotRefresh);
				}
			}
			return projectHistoryMaterializationAttemptOutcome(
				attempt,
				result,
				evidenceWrites,
				input.now,
			);
		},
	};
}

function projectHistoryMaterializationAttemptOutcome(
	attempt: HistoryMaterializationAttempt,
	result: HistoryMaterializationResult,
	evidenceWrites: HistoryMaterializationAttemptReceipt["evidence"]["writes"],
	now: () => Date,
): HistoryMaterializationAttemptOutcome {
	const accounting: HistoryMaterializationAttemptReceipt["accounting"] = {
		targetConsumed: consumesReconciliationTargetBudget(result),
		assetsAttempted: countAttemptedReconciliationAssetBudget(result),
		providerGuardObserved: historyMaterializationResultHasProviderGuard(result),
		candidateMaterialized: result.metrics.materialized > 0,
	};
	const phases = structuredClone(
		result.phases ?? {
			snapshotRefresh: snapshotRefreshesFromResult(result)[0] ?? null,
			materialization: {
				status: result.status,
				generatedAt: result.generatedAt,
				manifestPaths: [...result.manifestPaths],
				entries: result.entries.length,
				archiveItems: result.archiveItems.length,
				metrics: { ...result.metrics },
			},
		},
	);
	const receipt = freezeHistoryMaterializationAttemptReceipt({
		object: "history_materialization_attempt_receipt",
		version: 1,
		generatedAt: now().toISOString(),
		origin: attempt.candidate.origin,
		index: attempt.candidate.index,
		target: { ...attempt.candidate.target },
		budgetBefore: { ...attempt.budgetBefore },
		accounting,
		phases,
		evidence: {
			status: evidenceWrites.length > 0 ? "persisted" : "not_required",
			writes: [...evidenceWrites],
		},
		status: result.status,
	});
	return {
		result: { ...result, attempts: [receipt] },
		receipt,
		accounting,
	};
}

function freezeHistoryMaterializationAttemptReceipt(
	receipt: HistoryMaterializationAttemptReceipt,
): HistoryMaterializationAttemptReceipt {
	return deepFreezeHistoryMaterializationAttemptReceiptValue(receipt);
}

function deepFreezeHistoryMaterializationAttemptReceiptValue<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const nested of Object.values(value)) {
		deepFreezeHistoryMaterializationAttemptReceiptValue(nested);
	}
	return Object.freeze(value);
}

function verifyHistoryMaterializationAttemptResult(
	attempt: HistoryMaterializationAttempt,
	result: HistoryMaterializationResult,
): void {
	if (result.object !== "history_materialization_result") {
		throw new Error("History materialization attempt returned an invalid result object.");
	}
	if (
		!result.target ||
		!historyMaterializationTargetsEqual(result.target, attempt.candidate.target)
	) {
		throw new Error("History materialization attempt result target did not match selected target.");
	}
	for (const metric of ["conversations", "materialized", "skipped", "failed"] as const) {
		const value = result.metrics[metric];
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(
				`History materialization attempt result metric ${metric} must be finite and nonnegative.`,
			);
		}
	}
	const maxItems = normalizeMaxItems(attempt.request.maxItems);
	const cachedAssets = result.entries.filter(isVerifiedCachedHistoryMaterializationEntry).length;
	const newMaterializations = result.metrics.materialized - cachedAssets;
	if (maxItems !== null && newMaterializations > maxItems) {
		throw new Error(
			`History materialization attempt result new materializations ${newMaterializations} exceeds maxItems ${maxItems}.`,
		);
	}
}

function historyMaterializationTargetsEqual(
	left: HistoryMaterializationTarget,
	right: HistoryMaterializationTarget,
): boolean {
	return (
		left.provider === right.provider &&
		left.runtimeProfile === right.runtimeProfile &&
		left.browserProfile === right.browserProfile &&
		left.boundIdentityKey === right.boundIdentityKey &&
		left.conversationId === right.conversationId &&
		left.providerConversationUrl === right.providerConversationUrl &&
		left.projectId === right.projectId
	);
}

export function createHistoryMaterializationService(
	deps: HistoryMaterializationServiceDeps,
): HistoryMaterializationService {
	const now = deps.now ?? (() => new Date());
	const sleep = deps.sleep ?? sleepMs;
	const store = deps.store ?? createHistoryMaterializationJobStore();
	const runArchiveService = deps.runArchiveService ?? createRunArchiveService();
	const catalogService =
		deps.catalogService ??
		createAccountMirrorCatalogService({
			config: deps.config as Record<string, unknown>,
			now,
		});
	const generateId = deps.generateId ?? (() => `hmj_${randomUUID().replace(/-/g, "")}`);
	const schedule =
		deps.schedule ??
		((work) => {
			setImmediate(() => {
				void work();
			});
		});
	const withForegroundWork = deps.withForegroundWork ?? (async (work) => work());
	const cleanupBrowserBackedProviderWork = deps.cleanupManagedBrowserAfterProviderWork === true;
	const browserOperationDispatcher = cleanupBrowserBackedProviderWork
		? (deps.browserOperationDispatcher ??
			createFileBackedBrowserOperationDispatcher({
				lockRoot: path.join(getAuracallHomeDir(), "browser-operations"),
			}))
		: null;
	const cleanupManagedBrowser =
		deps.cleanupManagedBrowser ?? cleanupHistoryMaterializationManagedBrowser;
	const retireIdleChatgptLeasesAfterManagedBrowserShutdown =
		deps.retireIdleChatgptLeasesAfterManagedBrowserShutdown ??
		retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
	let queue = Promise.resolve();
	const scheduledJobIds = new Set<string>();
	const providerWorkContexts = new Map<string, HistoryMaterializationProviderWorkContext>();
	const providerWorkContext = (
		jobId: string,
		request: HistoryMaterializationCreateRequest,
	): HistoryMaterializationProviderWorkContext => {
		const existing = providerWorkContexts.get(jobId);
		if (existing) return existing;
		const policy = request.interactionPolicy;
		const context: HistoryMaterializationProviderWorkContext = {
			interactionGovernor: policy
				? createBrowserInteractionGovernor({
						maxInteractionsPerMinute: policy.maxInteractionsPerMinute,
						cooldownsByClass: {
							"conversation-read": policy.conversationReadCooldownMs,
							"page-refresh": policy.pageRefreshCooldownMs,
							renavigation: policy.renavigationCooldownMs,
						},
						now: () => now().getTime(),
						...(deps.sleep
							? {
									sleep: async (ms: number) => {
										await deps.sleep?.(ms);
									},
								}
							: {}),
					})
				: null,
			contextTimeoutMs: resolveHistoryMaterializationContextTimeoutMs(request),
			providerSessionProofSummary: null,
		};
		context.onProviderSessionProof = (proof) => {
			context.providerSessionProofSummary = summarizeProviderSessionProof(proof);
		};
		providerWorkContexts.set(jobId, context);
		return context;
	};

	const materializeConversation = (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		workContext?: HistoryMaterializationProviderWorkContext,
	) => {
		const jobContext = providerWorkContext(jobId, request);
		const context = workContext ?? jobContext;
		context.interactionGovernor ??= jobContext.interactionGovernor;
		context.onProviderSessionProof = jobContext.onProviderSessionProof;
		return deps.materializeConversation
			? workContext || request.interactionPolicy
				? deps.materializeConversation(target, request, jobId, context)
				: deps.materializeConversation(target, request, jobId)
			: materializeConversationTarget({
					config: deps.config,
					runArchiveService,
					target,
					request,
					jobId,
					now,
					interactionGovernor: context.interactionGovernor,
					contextTimeoutMs: context.contextTimeoutMs,
					excludedAssetFamilySignatures: workContext?.excludedAssetFamilySignatures ?? [],
					selectedCatalogAsset: workContext?.selectedCatalogAsset,
					onProviderSessionProof: context.onProviderSessionProof,
				});
	};
	const refreshConversationSnapshot = (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => {
		const context = providerWorkContext(jobId, request);
		return deps.refreshConversationSnapshot
			? request.interactionPolicy
				? deps.refreshConversationSnapshot(target, request, jobId, context)
				: deps.refreshConversationSnapshot(target, request, jobId)
			: refreshConversationSnapshotTarget({
					config: deps.config,
					target,
					request,
					jobId,
					now,
					interactionGovernor: context.interactionGovernor,
					contextTimeoutMs: context.contextTimeoutMs,
					onProviderSessionProof: context.onProviderSessionProof,
				});
	};
	const accountMirrorPersistence = createAccountMirrorPersistence({
		config: deps.config as Record<string, unknown>,
	});
	const recordConversationEvidence =
		deps.recordConversationEvidence ??
		(async (target, evidence) => {
			await accountMirrorPersistence.updateConversationEvidence?.({
				provider: target.provider,
				boundIdentityKey: target.boundIdentityKey,
				conversationId: target.conversationId,
				evidence,
				upsert: {
					title: target.conversationId,
					projectId: target.projectId,
					url: target.providerConversationUrl,
				},
			});
		});
	const materializationAttemptExecutor = createHistoryMaterializationAttemptExecutor({
		materializeConversation,
		refreshConversationSnapshot,
		recordConversationEvidence,
		providerWorkContext,
		now,
	});
	const materializeMediaGeneration =
		deps.materializeMediaGeneration ??
		((request) =>
			materializeMediaGenerationTarget({
				config: deps.config,
				request,
				onProviderSessionProof: providerWorkContext(request.jobId, {}).onProviderSessionProof,
			}));
	const materializeAccountLibraryFiles =
		deps.materializeAccountLibraryFiles ??
		((request) =>
			materializeAccountLibraryFilesTarget({
				config: deps.config,
				request,
				onProviderSessionProof: providerWorkContext(request.jobId, {}).onProviderSessionProof,
			}));
	const listAccountLibraryFiles =
		deps.listAccountLibraryFiles ??
		((request) =>
			listAccountLibraryFilesTarget({
				config: deps.config,
				request,
				onProviderSessionProof: request.jobId
					? providerWorkContext(request.jobId, {}).onProviderSessionProof
					: undefined,
			}));
	const materializeProjectSources =
		deps.materializeProjectSources ??
		((request) =>
			materializeProjectSourcesTarget({
				config: deps.config,
				request,
				onProviderSessionProof: providerWorkContext(request.jobId, {}).onProviderSessionProof,
			}));

	const createJobListResult = (
		allJobs: HistoryMaterializationJob[],
		request: HistoryMaterializationJobListRequest = {},
	): HistoryMaterializationJobListResult => {
		const status = request.status ?? null;
		const provider = request.provider ?? null;
		const runtimeProfile = normalizeOptionalString(request.runtimeProfile);
		const sourceType = request.sourceType ?? null;
		const limit = normalizeListLimit(request.limit);
		const filtered = allJobs.filter(
			(job) =>
				matchesStatusFilter(job, status) &&
				(!provider || job.request.provider === provider) &&
				(!runtimeProfile || job.request.runtimeProfile === runtimeProfile) &&
				(!sourceType || job.source.type === sourceType),
		);
		return {
			object: "history_materialization_jobs",
			generatedAt: now().toISOString(),
			status,
			provider,
			runtimeProfile,
			sourceType,
			limit,
			jobs: filtered.slice(0, limit).map((job) => withSchedulerDiagnostics(job)),
			metrics: summarizeJobs(filtered),
		};
	};

	const service: HistoryMaterializationService = {
		async createJob(request) {
			const normalized = normalizeCreateRequest(request);
			const source = sourceFromCreateRequest(normalized);
			const sourceKey = sourceKeyFromCreateRequest(normalized);
			const generatedAt = now().toISOString();
			const active = await findActiveJobForSource(store, sourceKey, recoverStaleRunningJob);
			if (active) {
				if (active.status === "queued") {
					scheduleJob(active.id);
				}
				return {
					object: "history_materialization_job_create_result",
					generatedAt,
					reused: true,
					reuseReason: `active sourceKey is already ${active.status}`,
					job: withSchedulerDiagnostics(active),
				};
			}
			const job: HistoryMaterializationJob = {
				object: "history_materialization_job",
				id: generateId(),
				source,
				request: normalized,
				sourceKey,
				status: "queued",
				createdAt: generatedAt,
				updatedAt: generatedAt,
				startedAt: null,
				completedAt: null,
				attemptCount: 0,
				result: null,
				providerSessionProof: null,
				error: null,
				message: "History materialization job queued.",
			};
			await store.upsertJob(job);
			scheduleJob(job.id);
			return {
				object: "history_materialization_job_create_result",
				generatedAt,
				reused: false,
				reuseReason: null,
				job: withSchedulerDiagnostics(job),
			};
		},

		async listJobs(request = {}) {
			const allJobs = await recoverStaleRunningJobs(await store.listJobs());
			return createJobListResult(allJobs, request);
		},

		async listJobsBatch(requests) {
			const allJobs = await recoverStaleRunningJobs(await store.listJobs());
			return requests.map((request) => createJobListResult(allJobs, request));
		},

		async readJob(id) {
			const job = await store.readJob(id.trim());
			return withSchedulerDiagnostics(await recoverStaleRunningJob(job));
		},

		async cancelJob(id) {
			const jobId = id.trim();
			if (!jobId) {
				throw new HistoryMaterializationJobControlError(
					"History materialization job id is required.",
				);
			}
			const job = await store.readJob(jobId);
			if (!job) {
				throw new HistoryMaterializationJobControlError(
					`History materialization job ${jobId} was not found.`,
					404,
				);
			}
			if (job.status === "cancelled") return withSchedulerDiagnostics(job);
			if (job.status !== "queued") {
				throw new HistoryMaterializationJobControlError(
					`History materialization job ${jobId} is ${job.status}; only queued jobs can be cancelled before provider work starts.`,
					409,
				);
			}
			const cancelledAt = now().toISOString();
			const cancelled: HistoryMaterializationJob = {
				...job,
				status: "cancelled",
				updatedAt: cancelledAt,
				completedAt: cancelledAt,
				error: null,
				message: "History materialization job cancelled before provider work started.",
			};
			await store.upsertJob(cancelled);
			return withSchedulerDiagnostics(cancelled);
		},

		async runJob(id) {
			const job = await store.readJob(id.trim());
			if (!job) {
				throw new HistoryMaterializationError(
					`History materialization job ${id} was not found.`,
					404,
				);
			}
			if (!isActiveStatus(job.status)) return withSchedulerDiagnostics(job);
			const startedAt = now().toISOString();
			const running: HistoryMaterializationJob = {
				...job,
				status: "running",
				startedAt: job.startedAt ?? startedAt,
				updatedAt: startedAt,
				attemptCount: job.attemptCount + 1,
				error: null,
				message: "History materialization job is running.",
			};
			await store.upsertJob(running);
			try {
				if (running.request.providerWorkNotBefore) {
					await waitForProviderWorkBoundary(running.request, now, sleep);
				}
				const materializationResult = await withForegroundWork(async () => {
					const browserOperations = await acquireHistoryMaterializationBrowserOperations({
						config: deps.config,
						request: running.request,
						jobId: running.id,
						dispatcher: browserOperationDispatcher,
						queue: true,
						queueTimeoutMs: deps.browserOperationQueueTimeoutMs,
						queuePollMs: deps.browserOperationQueuePollMs,
					});
					try {
						return await materializeHistoryRequest({
							config: deps.config,
							request: running.request,
							jobId: running.id,
							catalogService,
							runArchiveService,
							materializeConversation,
							refreshConversationSnapshot,
							recordConversationEvidence,
							materializationAttemptExecutor,
							materializeMediaGeneration,
							materializeAccountLibraryFiles,
							listAccountLibraryFiles,
							materializeProjectSources,
							jobStore: store,
							now,
						});
					} finally {
						if (cleanupBrowserBackedProviderWork) {
							await cleanupManagedBrowser(deps.config, running.request);
							await reconcileStoppedHistoryMaterializationChatgptLeases({
								config: deps.config,
								request: running.request,
								retireIdleChatgptLeasesAfterManagedBrowserShutdown,
							});
						}
						await releaseHistoryMaterializationBrowserOperations(browserOperations);
					}
				});
				const availabilityResult = withExplicitAssetAvailability(materializationResult);
				const result: HistoryMaterializationResult = {
					...availabilityResult,
					status: resolveHistoryMaterializationJobResultStatus(availabilityResult),
					providerSessionProof:
						providerWorkContext(running.id, running.request).providerSessionProofSummary ??
						availabilityResult.providerSessionProof ??
						null,
				};
				if (historyMaterializationResultHasProviderGuard(result)) {
					await deps.onProviderGuardObserved?.({ request: running.request, result });
				}
				const current = await store.readJob(running.id);
				if (current && !isActiveStatus(current.status)) {
					return withSchedulerDiagnostics(current);
				}
				const completedAt = now().toISOString();
				const completed: HistoryMaterializationJob = {
					...running,
					status:
						result.status === "failed"
							? "failed"
							: result.status === "skipped"
								? "skipped"
								: "succeeded",
					updatedAt: completedAt,
					completedAt,
					result,
					providerSessionProof: result.providerSessionProof ?? null,
					error:
						result.status === "failed"
							? {
									message: result.message,
									type: "internal_error",
									statusCode: 500,
								}
							: null,
					message: result.message,
				};
				await store.upsertJob(completed);
				return withSchedulerDiagnostics(completed);
			} catch (error) {
				const current = await store.readJob(running.id);
				if (current && !isActiveStatus(current.status)) {
					return withSchedulerDiagnostics(current);
				}
				const completedAt = now().toISOString();
				const failed: HistoryMaterializationJob = {
					...running,
					status: "failed",
					updatedAt: completedAt,
					completedAt,
					result: null,
					providerSessionProof:
						providerWorkContexts.get(running.id)?.providerSessionProofSummary ?? null,
					error: historyMaterializationJobError(error),
					message: error instanceof Error ? error.message : "History materialization job failed.",
				};
				await store.upsertJob(failed);
				return withSchedulerDiagnostics(failed);
			} finally {
				providerWorkContexts.delete(running.id);
			}
		},

		async recoverInterruptedJobs() {
			const jobs = await store.listJobs();
			let recovered = 0;
			for (const job of jobs) {
				if (!isActiveStatus(job.status)) continue;
				if (job.status === "queued") {
					const timestamp = now().toISOString();
					await store.upsertJob({
						...job,
						updatedAt: timestamp,
						error: null,
						message:
							"History materialization job was recovered and re-queued after AuraCall API startup.",
					});
					scheduleJob(job.id);
					recovered += 1;
					continue;
				}
				const timestamp = now().toISOString();
				await store.upsertJob({
					...job,
					status: "failed",
					updatedAt: timestamp,
					completedAt: timestamp,
					error: {
						message:
							"History materialization job was interrupted before this AuraCall API process started.",
						type: "internal_error",
						statusCode: 500,
					},
					message:
						"History materialization job was interrupted before this AuraCall API process started.",
				});
				recovered += 1;
			}
			return recovered;
		},

		async previewAccountLibraryReconciliation(request) {
			return buildAccountLibraryReconciliationPreview({
				request: normalizeCreateRequest(request),
				catalogService,
				runArchiveService,
				listAccountLibraryFiles,
				now,
			});
		},
	};

	function scheduleJob(jobId: string): void {
		if (scheduledJobIds.has(jobId)) return;
		scheduledJobIds.add(jobId);
		schedule(async () => {
			queue = queue
				.then(() => service.runJob(jobId))
				.then(
					() => undefined,
					() => undefined,
				);
			try {
				await queue;
			} finally {
				scheduledJobIds.delete(jobId);
			}
		});
	}

	function withSchedulerDiagnostics<T extends HistoryMaterializationJob | null>(job: T): T {
		if (!job) return job;
		return {
			...job,
			scheduler: summarizeHistoryMaterializationJobScheduler(job, now(), {
				scheduled: scheduledJobIds.has(job.id),
			}),
		};
	}

	async function recoverStaleRunningJobs(
		jobs: HistoryMaterializationJob[],
	): Promise<HistoryMaterializationJob[]> {
		const results: HistoryMaterializationJob[] = [];
		for (const job of jobs) {
			results.push((await recoverStaleRunningJob(job)) ?? job);
		}
		return results;
	}

	async function recoverStaleRunningJob(
		job: HistoryMaterializationJob | null,
	): Promise<HistoryMaterializationJob | null> {
		if (!job || !canRunningJobTimeout(job)) return job;
		const timestampDate = now();
		if (!isTimedOutRunningJob(job, timestampDate)) return job;
		const timestamp = timestampDate.toISOString();
		const timeoutMs = resolveRunningStaleThresholdMs(job);
		const message = formatRunningTimeoutMessage(job, timeoutMs);
		const scrapeTelemetryProgress = await readHistoryMaterializationScrapeTelemetryProgress(job.id);
		const failed: HistoryMaterializationJob = {
			...job,
			status: "failed",
			updatedAt: timestamp,
			completedAt: timestamp,
			scrapeTelemetry: scrapeTelemetryProgress?.scrapeTelemetry ?? job.scrapeTelemetry ?? null,
			error: {
				message,
				type: "internal_error",
				statusCode: 500,
			},
			message,
		};
		await store.upsertJob(failed);
		if (scheduledJobIds.delete(job.id)) {
			queue = Promise.resolve();
		}
		if (cleanupBrowserBackedProviderWork) {
			const browserOperations = await acquireHistoryMaterializationBrowserOperations({
				config: deps.config,
				request: job.request,
				jobId: job.id,
				dispatcher: browserOperationDispatcher,
				queue: false,
			});
			if (browserOperations) {
				try {
					await cleanupManagedBrowser(deps.config, job.request);
					await reconcileStoppedHistoryMaterializationChatgptLeases({
						config: deps.config,
						request: job.request,
						retireIdleChatgptLeasesAfterManagedBrowserShutdown,
					});
				} finally {
					await releaseHistoryMaterializationBrowserOperations(browserOperations);
				}
			}
		}
		return failed;
	}

	return service;
}

export function createHistoryMaterializationJobStore(
	filePath = path.join(getRunArchiveDir(), "history-materialization-jobs", "index.json"),
): HistoryMaterializationJobStore {
	return {
		async listJobs() {
			return readJobStoreFile(filePath);
		},
		async readJob(id) {
			const jobs = await readJobStoreFile(filePath);
			return jobs.find((job) => job.id === id) ?? null;
		},
		async upsertJob(job) {
			const jobs = await readJobStoreFile(filePath);
			const nextJobs = [job, ...jobs.filter((candidate) => candidate.id !== job.id)].sort(
				(left, right) => right.updatedAt.localeCompare(left.updatedAt),
			);
			await writeJobStoreFile(filePath, nextJobs);
		},
	};
}

interface HistoryMaterializationScrapeTelemetryProgress {
	generatedAt: string;
	scrapeTelemetry: BrowserScrapeTelemetrySnapshot;
}

function resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId: string): string {
	return path.join(
		getRunArchiveDir(),
		"history-materialization-jobs",
		`${jobId}-scrape-telemetry.json`,
	);
}

async function writeHistoryMaterializationScrapeTelemetryProgress(
	jobId: string,
	progress: HistoryMaterializationScrapeTelemetryProgress,
): Promise<void> {
	const filePath = resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

async function readHistoryMaterializationScrapeTelemetryProgress(
	jobId: string,
): Promise<HistoryMaterializationScrapeTelemetryProgress | null> {
	try {
		const raw = await fs.readFile(
			resolveHistoryMaterializationScrapeTelemetryProgressPath(jobId),
			"utf8",
		);
		const parsed = JSON.parse(raw) as Partial<HistoryMaterializationScrapeTelemetryProgress>;
		if (!parsed.scrapeTelemetry) return null;
		return {
			generatedAt:
				typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date(0).toISOString(),
			scrapeTelemetry: parsed.scrapeTelemetry,
		};
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return null;
		return null;
	}
}

async function materializeHistoryRequest(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		context?: HistoryMaterializationProviderWorkContext,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializationAttemptExecutor: HistoryMaterializationAttemptExecutor;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	materializeProjectSources: (request: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	jobStore: HistoryMaterializationJobStore;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const request = input.request;
	if (request.reconcile === true || (request.conversationIds?.length ?? 0) > 0) {
		if (request.assetSource === "account-library") {
			return materializeAccountLibraryReconciliation(input);
		}
		return materializeReconciliation(input);
	}
	if (
		request.provider &&
		request.projectId &&
		!request.conversationId &&
		!request.catalogItemId &&
		!request.archiveItemId
	) {
		return materializeProjectSources({
			request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeProjectSources: input.materializeProjectSources,
			now: input.now,
		});
	}
	if (request.archiveItemId) {
		const detail = await input.runArchiveService.readItem(request.archiveItemId);
		if (!detail) {
			throw new HistoryMaterializationError(
				`Run archive item ${request.archiveItemId} was not found.`,
				404,
			);
		}
		if (detail.item.fileAvailable === true && detail.item.localPath && request.force !== true) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: targetFromArchiveItem(detail.item),
				message: "Run archive item already has a readable local asset.",
			});
		}
		const mediaArchiveResult = await materializeMediaArchiveItem({
			request,
			jobId: input.jobId,
			catalogService: input.catalogService,
			runArchiveService: input.runArchiveService,
			materializeMediaGeneration: input.materializeMediaGeneration,
			now: input.now,
			archiveItem: detail.item,
		});
		if (mediaArchiveResult) return mediaArchiveResult;
		const target = targetFromArchiveItem(detail.item);
		if (!target) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: null,
				message:
					"Run archive item does not have provider conversation evidence for history materialization.",
			});
		}
		return (
			await input.materializationAttemptExecutor.execute({
				jobId: input.jobId,
				request,
				candidate: { origin: "archive_item", index: 0, target },
				budgetBefore: {
					targetLimit: normalizeMaxItems(request.maxItems),
					targetsConsumed: 0,
					assetsRemaining: normalizeMaxItems(request.maxItems),
				},
			})
		).result;
	}
	if (request.catalogItemId) {
		const detail = await input.catalogService.readItem({
			itemId: request.catalogItemId,
			provider: request.provider ?? null,
			runtimeProfileId: request.runtimeProfile ?? null,
			kind: request.catalogKind ?? "all",
			limit: 500,
		});
		if (!detail) {
			throw new HistoryMaterializationError(
				`Account mirror catalog item ${request.catalogItemId} was not found.`,
				404,
			);
		}
		const accountLibraryResult = await materializeAccountLibraryCatalogItem({
			detail,
			request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeAccountLibraryFiles: input.materializeAccountLibraryFiles,
			now: input.now,
		});
		if (accountLibraryResult) return accountLibraryResult;
		const target = targetFromCatalogItem(detail, request);
		if (!target) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: null,
				message:
					"Account mirror catalog item does not have provider conversation evidence for history materialization.",
			});
		}
		const scopedRequest = {
			...request,
			assetKinds: request.assetKinds ?? defaultAssetKindsForCatalogKind(detail.kind),
		};
		const selectedCatalogAsset = selectedCatalogAssetFromCatalogItem(detail);
		if (
			request.force !== true &&
			selectedCatalogAsset &&
			(await selectedCatalogAssetFamilyIsTerminal({
				detail,
				request: scopedRequest,
				runArchiveService: input.runArchiveService,
				jobStore: input.jobStore,
			}))
		) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target,
				message:
					"Selected account mirror catalog asset family is already terminal in local evidence.",
			});
		}
		return (
			await input.materializationAttemptExecutor.execute({
				jobId: input.jobId,
				request: scopedRequest,
				candidate: {
					origin: "catalog_item",
					index: 0,
					target,
					selectedCatalogAsset: selectedCatalogAsset ?? undefined,
				},
				budgetBefore: {
					targetLimit: normalizeMaxItems(scopedRequest.maxItems),
					targetsConsumed: 0,
					assetsRemaining: normalizeMaxItems(scopedRequest.maxItems),
				},
			})
		).result;
	}
	if (request.conversationId && request.provider) {
		if (
			request.force !== true &&
			(await directConversationAssetFamiliesAreTerminal({
				request,
				catalogService: input.catalogService,
				runArchiveService: input.runArchiveService,
				jobStore: input.jobStore,
			}))
		) {
			return skippedResult({
				now: input.now,
				source: sourceFromCreateRequest(request),
				target: {
					provider: request.provider,
					runtimeProfile: request.runtimeProfile ?? null,
					browserProfile: request.browserProfile ?? null,
					boundIdentityKey: request.boundIdentityKey ?? null,
					conversationId: request.conversationId,
					providerConversationUrl:
						request.providerConversationUrl ??
						resolveProviderConversationUrl(request.provider, request.conversationId),
					projectId: request.projectId ?? null,
				},
				message: "Provider conversation asset families are already terminal in local evidence.",
			});
		}
		const target: HistoryMaterializationTarget = {
			provider: request.provider,
			runtimeProfile: request.runtimeProfile ?? null,
			browserProfile: request.browserProfile ?? null,
			boundIdentityKey: request.boundIdentityKey ?? null,
			conversationId: request.conversationId,
			providerConversationUrl:
				request.providerConversationUrl ??
				resolveProviderConversationUrl(request.provider, request.conversationId),
			projectId: request.projectId ?? null,
		};
		return (
			await input.materializationAttemptExecutor.execute({
				jobId: input.jobId,
				request,
				candidate: { origin: "direct", index: 0, target },
				budgetBefore: {
					targetLimit: normalizeMaxItems(request.maxItems),
					targetsConsumed: 0,
					assetsRemaining: normalizeMaxItems(request.maxItems),
				},
			})
		).result;
	}
	throw new HistoryMaterializationError(
		"Provide conversationId with provider, projectId with provider, conversationIds with provider, catalogItemId, archiveItemId, or reconcile=true.",
	);
}

async function selectedCatalogAssetFamilyIsTerminal(input: {
	detail: AccountMirrorCatalogItemResult;
	request: HistoryMaterializationCreateRequest;
	runArchiveService: RunArchiveService;
	jobStore: HistoryMaterializationJobStore;
}): Promise<boolean> {
	const manifestKind =
		input.detail.kind === "artifacts"
			? "artifact"
			: input.detail.kind === "files"
				? "file"
				: input.detail.kind === "media"
					? "media"
					: null;
	if (!manifestKind) return false;
	const selectedSignature = catalogManifestAssetFamilySignature(manifestKind, input.detail.item);
	if (!selectedSignature) return false;
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	const effectiveRequest: HistoryMaterializationCreateRequest = {
		...input.request,
		provider: input.request.provider ?? input.detail.provider,
		runtimeProfile: input.request.runtimeProfile ?? input.detail.runtimeProfileId,
		browserProfile: input.request.browserProfile ?? input.detail.browserProfileId,
		boundIdentityKey: input.request.boundIdentityKey ?? input.detail.boundIdentityKey,
	};
	const terminalSignatures = new Set(
		await materializedArchiveAssetFamilySignatures({
			runArchiveService: input.runArchiveService,
			request: effectiveRequest,
			selectedKinds,
		}),
	);
	for (const signature of await terminalVolatileAssetFamilySignatures({
		jobStore: input.jobStore,
		request: effectiveRequest,
		selectedKinds,
	})) {
		terminalSignatures.add(signature);
	}
	return terminalSignatures.has(selectedSignature);
}

async function directConversationAssetFamiliesAreTerminal(input: {
	request: HistoryMaterializationCreateRequest;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	jobStore: HistoryMaterializationJobStore;
}): Promise<boolean> {
	const provider = input.request.provider;
	const conversationId = input.request.conversationId;
	if (!provider || !conversationId) return false;
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	let catalog: Awaited<ReturnType<AccountMirrorCatalogService["readCatalog"]>>;
	try {
		catalog = await input.catalogService.readCatalog({
			provider,
			runtimeProfileId: input.request.runtimeProfile ?? null,
			kind: "all",
			limit: 500,
		});
	} catch {
		return false;
	}
	if (!catalog?.entries) return false;
	const selectedSignatures = catalogEntriesConversationAssetFamilySignatures(
		catalog.entries,
		conversationId,
		selectedKinds,
		provider,
		input.request.boundIdentityKey ?? null,
	);
	if (selectedSignatures.length === 0) return false;
	const terminalSignatures = new Set<string>();
	for (const signature of await materializedArchiveAssetFamilySignatures({
		runArchiveService: input.runArchiveService,
		request: input.request,
		selectedKinds,
	})) {
		terminalSignatures.add(signature);
	}
	for (const signature of await terminalVolatileAssetFamilySignatures({
		jobStore: input.jobStore,
		request: input.request,
		selectedKinds,
	})) {
		terminalSignatures.add(signature);
	}
	for (const entry of catalog.entries) {
		if (!catalogEntryMatchesBoundIdentity(entry, input.request.boundIdentityKey)) {
			continue;
		}
		for (const item of entry.manifests.conversations) {
			const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
			if (!conversationId || !catalogConversationHasCompleteSelectedAssets(item)) continue;
			for (const signature of catalogEntriesConversationAssetFamilySignatures(
				catalog.entries,
				conversationId,
				selectedKinds,
				entry.provider,
				input.request.boundIdentityKey ?? null,
			)) {
				terminalSignatures.add(signature);
			}
		}
	}
	return selectedSignatures.every((signature) => terminalSignatures.has(signature));
}

async function materializeProjectSources(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeProjectSources: (request: HistoryProjectSourcesMaterializeInput) => Promise<{
		projectFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const provider = input.request.provider;
	const projectId = input.request.projectId;
	if (!provider || !projectId) {
		throw new HistoryMaterializationError(
			"Project source materialization requires provider and projectId.",
		);
	}
	const maxItems = normalizeMaxItems(input.request.maxItems);
	const materialized = await input.materializeProjectSources({
		provider,
		runtimeProfile: input.request.runtimeProfile ?? null,
		browserProfile: input.request.browserProfile ?? null,
		boundIdentityKey: input.request.boundIdentityKey ?? null,
		projectId,
		jobId: input.jobId,
		maxItems,
	});
	const manifestEntries = await readFileManifestEntries(materialized.manifestPath);
	const entries = await Promise.all(
		manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
	);
	const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
	for (const file of materialized.files) {
		const manifestEntry = findFileManifestForFile(manifestEntries, file);
		archiveAssets.push({
			kind: "file",
			file,
			artifactId: manifestEntry?.fileId ?? file.id,
			title: manifestEntry?.fileName ?? file.name,
			manifestPath: materialized.manifestPath,
			materializationMethod:
				manifestEntry?.materializationMethod ??
				readRecordString(file.metadata, ["materialization", "materializationSource"]) ??
				"project-source",
		});
	}
	if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
		throw new Error("History materialization archive upsert is not configured.");
	}
	const archiveTarget = projectSourcesTargetFromRequest(input.request);
	const archiveItems =
		archiveAssets.length > 0
			? ((
					await input.runArchiveService.upsertHistoryMaterializationItems?.({
						provider,
						runtimeProfile: input.request.runtimeProfile ?? null,
						browserProfile: input.request.browserProfile ?? null,
						projectId,
						boundIdentityKey: input.request.boundIdentityKey ?? null,
						providerConversationId: archiveTarget.conversationId,
						providerConversationUrl: archiveTarget.providerConversationUrl,
						materializationJobId: input.jobId,
						assets: archiveAssets,
					})
				)?.items ?? [])
			: [];
	applyArchiveLinks(entries, archiveItems);
	applyRecoverabilityStates(entries);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 1);
	const status = resolveHistoryMaterializationResultStatus(metrics);
	return {
		object: "history_materialization_result",
		generatedAt,
		status,
		target: archiveTarget,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: materialized.manifestPath ? [materialized.manifestPath] : [],
		entries,
		archiveItems,
		metrics,
		phases: {
			snapshotRefresh: null,
			materialization: {
				status,
				generatedAt,
				manifestPaths: materialized.manifestPath ? [materialized.manifestPath] : [],
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `Project source materialization downloaded ${metrics.materialized} file${metrics.materialized === 1 ? "" : "s"} for project ${projectId}.`
				: metrics.failed > 0
					? `Project source materialization failed to download ${metrics.failed} file${metrics.failed === 1 ? "" : "s"} for project ${projectId}.`
					: `Project source materialization found no downloadable files for project ${projectId}.`,
	};
}

async function materializeAccountLibraryReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const preview = await buildAccountLibraryReconciliationPreview(input);
	const results: HistoryMaterializationResult[] = [];
	for (const candidate of preview.selectedCandidates) {
		const result = await materializeAccountLibraryCatalogItem({
			detail: {
				object: "account_mirror_catalog_item",
				generatedAt: input.now().toISOString(),
				provider: candidate.entry.provider,
				tenantKey: candidate.entry.tenantKey,
				bindingKey: candidate.entry.bindingKey,
				runtimeProfileId: candidate.entry.runtimeProfileId,
				browserProfileId: candidate.entry.browserProfileId,
				boundIdentityKey: candidate.entry.boundIdentityKey,
				status: candidate.entry.status,
				reason: candidate.entry.reason,
				kind: "files",
				itemId: readCatalogItemId(candidate.item) ?? candidate.file.id,
				item: candidate.item,
			},
			file: candidate.file,
			request: input.request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeAccountLibraryFiles: input.materializeAccountLibraryFiles,
			now: input.now,
		});
		if (result) results.push(result);
	}
	const generatedAt = input.now().toISOString();
	const entries = results.flatMap((result) => result.entries);
	const archiveItems = results.flatMap((result) => result.archiveItems);
	const manifestPaths = Array.from(new Set(results.flatMap((result) => result.manifestPaths)));
	const metrics = summarizeEntries(entries, 0);
	const status = resolveHistoryMaterializationResultStatus(metrics);
	return {
		object: "history_materialization_result",
		generatedAt,
		status,
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		metrics,
		phases: {
			snapshotRefresh: null,
			materialization: {
				status,
				generatedAt,
				manifestPaths,
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `Account-library reconciliation materialized ${metrics.materialized} file${metrics.materialized === 1 ? "" : "s"} from ${results.length} candidate${results.length === 1 ? "" : "s"}.`
				: metrics.failed > 0
					? `Account-library reconciliation failed to materialize ${metrics.failed} file${metrics.failed === 1 ? "" : "s"} from ${results.length} candidate${results.length === 1 ? "" : "s"}.`
					: "Account-library reconciliation did not find downloadable files to materialize.",
	};
}

async function buildAccountLibraryReconciliationPreview(input: {
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
	now: () => Date;
}): Promise<
	HistoryAccountLibraryReconciliationPreviewResult & {
		candidates: AccountLibraryReconciliationCandidate[];
		selectedCandidates: AccountLibraryReconciliationCandidate[];
	}
> {
	if (input.request.provider !== "chatgpt") {
		throw new HistoryMaterializationError(
			"Account-library reconciliation currently supports provider=chatgpt only.",
		);
	}
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	if (selectedKinds.some((kind) => kind !== "files") || !selectedKinds.includes("files")) {
		throw new HistoryMaterializationError(
			"Account-library reconciliation currently supports assetKinds=[files] only.",
		);
	}
	const maxItems = normalizeMaxItems(input.request.maxItems) ?? 1;
	if (maxItems <= 0) {
		throw new HistoryMaterializationError(
			"Account-library reconciliation requires maxItems greater than 0.",
		);
	}
	const catalog = await input.catalogService.readCatalog({
		provider: input.request.provider,
		runtimeProfileId: input.request.runtimeProfile ?? null,
		kind: "files",
		limit: Math.max(50, maxItems * 20),
	});
	const archivedSignatures =
		input.request.force === true
			? new Set<string>()
			: new Set(
					await materializedAccountLibraryFileFamilySignatures({
						runArchiveService: input.runArchiveService,
						request: input.request,
					}),
				);
	const selectedSignatures = new Set<string>();
	const candidates: AccountLibraryReconciliationCandidate[] = [];
	const currentAccountFilesByScope = new Map<string, FileRef[]>();
	const metrics = {
		catalogFiles: 0,
		eligibleCandidates: 0,
		selectedCandidates: 0,
		archivedFamilies: 0,
		unresolvedStale: 0,
		unsupportedOrTerminal: 0,
		duplicateFamilies: 0,
	};
	let sequence = 0;
	for (const entry of catalog.entries) {
		if (!catalogEntryMatchesBoundIdentity(entry, input.request.boundIdentityKey)) continue;
		for (const item of entry.manifests.files) {
			metrics.catalogFiles += 1;
			if (entry.status === "blocked") {
				metrics.unsupportedOrTerminal += 1;
				continue;
			}
			const catalogFile = accountLibraryFileRefFromCatalogEntry(entry, item);
			if (!catalogFile) {
				metrics.unsupportedOrTerminal += 1;
				continue;
			}
			const file = await resolveBroadAccountLibraryFile({
				catalogFile,
				entry,
				request: input.request,
				jobId: input.jobId ?? null,
				currentAccountFilesByScope,
				listAccountLibraryFiles: input.listAccountLibraryFiles,
			});
			if (!file) {
				metrics.unresolvedStale += 1;
				continue;
			}
			const signature = accountLibraryFileFamilySignature(file);
			if (signature && archivedSignatures.has(signature)) {
				metrics.archivedFamilies += 1;
				continue;
			}
			if (signature && selectedSignatures.has(signature)) {
				metrics.duplicateFamilies += 1;
				continue;
			}
			if (signature) selectedSignatures.add(signature);
			candidates.push({ entry, item, file, signature, sequence });
			metrics.eligibleCandidates += 1;
			sequence += 1;
		}
	}
	const selectedCandidates = candidates.slice(0, maxItems);
	metrics.selectedCandidates = selectedCandidates.length;
	return {
		object: "history_account_library_reconciliation_preview",
		generatedAt: input.now().toISOString(),
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		maxItems,
		metrics,
		candidates,
		selectedCandidates,
	};
}

type AccountLibraryReconciliationCandidate = {
	entry: AccountMirrorCatalogEntry;
	item: unknown;
	file: FileRef;
	signature: string | null;
	sequence: number;
};

async function materializeAccountLibraryCatalogItem(input: {
	detail: AccountMirrorCatalogItemResult;
	file?: FileRef | null;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeAccountLibraryFiles: (request: HistoryAccountLibraryMaterializeInput) => Promise<{
		accountFiles: FileRef[];
		files: FileRef[];
		manifestPath: string | null;
	}>;
	now: () => Date;
}): Promise<HistoryMaterializationResult | null> {
	const file = input.file ?? accountLibraryFileRefFromCatalogItem(input.detail);
	if (!file) return null;
	const provider = normalizeProviderId(input.detail.provider);
	if (!provider) return null;
	if (provider !== "chatgpt") return null;
	const fetch = await input.materializeAccountLibraryFiles({
		provider,
		runtimeProfile: input.detail.runtimeProfileId,
		browserProfile: input.detail.browserProfileId,
		boundIdentityKey: input.detail.boundIdentityKey,
		catalogItemId: input.detail.itemId,
		file,
		jobId: input.jobId,
	});
	const manifestPaths = fetch.manifestPath ? [fetch.manifestPath] : [];
	const manifestEntries = await readFileManifestEntries(fetch.manifestPath);
	const entries = await Promise.all(
		manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
	);
	const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
	for (const materializedFile of fetch.files) {
		const manifestEntry = findFileManifestForFile(manifestEntries, materializedFile);
		archiveAssets.push({
			kind: "file",
			file: materializedFile,
			artifactId: manifestEntry?.fileId ?? materializedFile.id,
			title: manifestEntry?.fileName ?? materializedFile.name,
			manifestPath: fetch.manifestPath,
			materializationMethod:
				manifestEntry?.materializationMethod ??
				readRecordString(materializedFile.metadata, ["materialization", "materializationSource"]),
		});
	}
	if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
		throw new Error("History materialization archive upsert is not configured.");
	}
	const archiveItems =
		archiveAssets.length > 0
			? ((
					await input.runArchiveService.upsertHistoryMaterializationItems?.({
						provider,
						runtimeProfile: input.detail.runtimeProfileId,
						browserProfile: input.detail.browserProfileId,
						projectId: null,
						boundIdentityKey: input.detail.boundIdentityKey,
						providerConversationId: "account-library",
						providerConversationUrl: "https://chatgpt.com/library",
						materializationJobId: input.jobId,
						assets: archiveAssets,
					})
				)?.items ?? [])
			: [];
	applyArchiveLinks(entries, archiveItems);
	applyRecoverabilityStates(entries);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 0);
	const status = resolveHistoryMaterializationResultStatus(metrics);
	return {
		object: "history_materialization_result",
		generatedAt,
		status,
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		metrics,
		message:
			metrics.materialized > 0
				? `Account-library materialization downloaded ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} for catalog item ${input.detail.itemId}.`
				: metrics.failed > 0
					? `Account-library materialization failed to download ${metrics.failed} asset${metrics.failed === 1 ? "" : "s"} for catalog item ${input.detail.itemId}.`
					: `Account-library materialization found no downloadable assets for catalog item ${input.detail.itemId}.`,
	};
}

async function materializeAccountLibraryFilesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryAccountLibraryMaterializeInput;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<{ accountFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			utilityAffinityId: historyMaterializationUtilityAffinityId(input.request.jobId),
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					catalogItemId: input.request.catalogItemId,
					assetSource: "account-library",
					assetKinds: ["files"],
				},
				jobId: input.request.jobId,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "account-library-file-materialization",
			}),
		},
	);
	const listOptions: HistoryMaterializationProviderListOptions = {
		configuredUrl: "https://chatgpt.com/library",
		tabUrl: "https://chatgpt.com/library",
		allowNavigation: true,
		skipFeatureSignature: true,
		onProviderSessionProof: input.onProviderSessionProof,
	};
	const file = await resolveAccountLibraryFileForMaterialization(
		llmService,
		input.request.file,
		listOptions,
	);
	return llmService.materializeAccountFiles({
		listOptions,
		files: [file],
		maxItems: 1,
	});
}

async function materializeProjectSourcesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryProjectSourcesMaterializeInput;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<{ projectFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			utilityAffinityId: historyMaterializationUtilityAffinityId(input.request.jobId),
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					projectId: input.request.projectId,
					assetKinds: ["files"],
				},
				jobId: input.request.jobId,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "project-source-materialization",
			}),
		},
	);
	const projectUrl = resolveProviderProjectUrl(input.request.provider, input.request.projectId);
	const listOptions: HistoryMaterializationProviderListOptions = {
		...(projectUrl ? { configuredUrl: projectUrl, tabUrl: projectUrl } : {}),
		projectId: input.request.projectId,
		allowNavigation: true,
		skipFeatureSignature: true,
		onProviderSessionProof: input.onProviderSessionProof,
	};
	return llmService.materializeProjectFiles(input.request.projectId, {
		listOptions,
		maxItems: input.request.maxItems,
	});
}

async function listAccountLibraryFilesTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryAccountLibraryListInput;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<FileRef[]> {
	const llmService = createLlmService(
		input.request.provider,
		withRuntimeProfileSelection(
			input.config,
			input.request.provider,
			input.request.runtimeProfile,
		) as ResolvedUserConfig,
		{
			utilityAffinityId: historyMaterializationUtilityAffinityId(input.request.jobId),
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: {
					provider: input.request.provider,
					runtimeProfile: input.request.runtimeProfile,
					browserProfile: input.request.browserProfile,
					boundIdentityKey: input.request.boundIdentityKey,
					reconcile: true,
					assetSource: "account-library",
					assetKinds: ["files"],
				},
				jobId: input.request.jobId ?? null,
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile,
				browserProfile: input.request.browserProfile,
				reason: "account-library-inventory-list",
			}),
		},
	);
	const listOptions: HistoryMaterializationProviderListOptions = {
		configuredUrl: "https://chatgpt.com/library",
		tabUrl: "https://chatgpt.com/library",
		allowNavigation: true,
		skipFeatureSignature: true,
		onProviderSessionProof: input.onProviderSessionProof,
	};
	return llmService.listAccountFiles({ listOptions });
}

async function resolveBroadAccountLibraryFile(input: {
	catalogFile: FileRef;
	entry: AccountMirrorCatalogEntry;
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	currentAccountFilesByScope: Map<string, FileRef[]>;
	listAccountLibraryFiles: (request: HistoryAccountLibraryListInput) => Promise<FileRef[]>;
}): Promise<FileRef | null> {
	if (isRouteableChatgptAccountLibraryFile(input.catalogFile)) return input.catalogFile;
	const provider = normalizeProviderId(input.entry.provider);
	if (provider !== "chatgpt") return null;
	const scope = accountLibraryInventoryScopeKey({
		provider,
		runtimeProfile: input.entry.runtimeProfileId,
		browserProfile: input.entry.browserProfileId,
		boundIdentityKey: input.entry.boundIdentityKey,
		jobId: input.jobId ?? null,
	});
	let currentAccountFiles = input.currentAccountFilesByScope.get(scope);
	if (!currentAccountFiles) {
		currentAccountFiles = await input.listAccountLibraryFiles({
			provider,
			runtimeProfile: input.entry.runtimeProfileId,
			browserProfile: input.entry.browserProfileId,
			boundIdentityKey: input.entry.boundIdentityKey,
		});
		input.currentAccountFilesByScope.set(scope, currentAccountFiles);
	}
	const match = findAccountLibraryFileInventoryMatch(input.catalogFile, currentAccountFiles);
	if (!match) return null;
	return {
		...match,
		metadata: {
			...(isRecord(match.metadata) ? match.metadata : {}),
			accountLibraryCatalogItemId: readRecordString(input.catalogFile.metadata, [
				"accountLibraryCatalogItemId",
			]),
			accountLibraryCatalogFileId: input.catalogFile.id,
		},
	};
}

function accountLibraryInventoryScopeKey(input: HistoryAccountLibraryListInput): string {
	return stableKey({
		provider: input.provider,
		runtimeProfile: input.runtimeProfile,
		browserProfile: input.browserProfile,
		boundIdentityKey: input.boundIdentityKey,
	});
}

async function resolveAccountLibraryFileForMaterialization(
	llmService: ReturnType<typeof createLlmService>,
	catalogFile: FileRef,
	listOptions: HistoryMaterializationProviderListOptions,
): Promise<FileRef> {
	if (isRouteableChatgptAccountLibraryFile(catalogFile)) return catalogFile;
	const accountFiles = await llmService.listAccountFiles({ listOptions });
	const match = findAccountLibraryFileInventoryMatch(catalogFile, accountFiles);
	if (!match) {
		throw new Error(
			`Account-library catalog item ${catalogFile.id} does not have a current ChatGPT provider file id in the account-file inventory.`,
		);
	}
	return {
		...match,
		metadata: {
			...(isRecord(match.metadata) ? match.metadata : {}),
			accountLibraryCatalogItemId: readRecordString(catalogFile.metadata, [
				"accountLibraryCatalogItemId",
			]),
			accountLibraryCatalogFileId: catalogFile.id,
		},
	};
}

function isRouteableChatgptAccountLibraryFile(file: FileRef): boolean {
	const metadata = isRecord(file.metadata) ? file.metadata : {};
	const providerFileId = readRecordString(metadata, ["providerFileId"]);
	return Boolean(
		providerFileId ||
			(typeof file.remoteUrl === "string" && file.remoteUrl.startsWith("chatgpt://file/")),
	);
}

function findAccountLibraryFileInventoryMatch(
	catalogFile: FileRef,
	accountFiles: readonly FileRef[],
): FileRef | null {
	const catalogMetadata = isRecord(catalogFile.metadata) ? catalogFile.metadata : {};
	const catalogId = normalizeAccountLibraryMatchText(catalogFile.id);
	const catalogName = normalizeAccountLibraryMatchText(catalogFile.name);
	const catalogIdentity = normalizeAccountLibraryMatchText(
		readRecordString(catalogMetadata, ["libraryIdentity"]) ?? "",
	);
	let best: { file: FileRef; score: number } | null = null;
	for (const accountFile of accountFiles) {
		const metadata = isRecord(accountFile.metadata) ? accountFile.metadata : {};
		if (readRecordString(metadata, ["source"]) !== "chatgpt-library") continue;
		if (!isRouteableChatgptAccountLibraryFile(accountFile)) continue;
		const candidateId = normalizeAccountLibraryMatchText(accountFile.id);
		const candidateName = normalizeAccountLibraryMatchText(accountFile.name);
		const candidateIdentity = normalizeAccountLibraryMatchText(
			readRecordString(metadata, ["libraryIdentity"]) ?? "",
		);
		const score = scoreAccountLibraryFileMatch({
			catalogId,
			catalogName,
			catalogIdentity,
			candidateId,
			candidateName,
			candidateIdentity,
		});
		if (score > (best?.score ?? 0)) {
			best = { file: accountFile, score };
		}
	}
	return best && best.score >= 80 ? best.file : null;
}

function scoreAccountLibraryFileMatch(input: {
	catalogId: string;
	catalogName: string;
	catalogIdentity: string;
	candidateId: string;
	candidateName: string;
	candidateIdentity: string;
}): number {
	if (input.catalogId && input.catalogId === input.candidateId) return 120;
	if (input.catalogIdentity && input.catalogIdentity === input.candidateIdentity) return 115;
	if (input.catalogName && input.catalogName === input.candidateName) return 110;
	if (
		input.catalogIdentity &&
		input.candidateName &&
		(input.candidateName.startsWith(input.catalogIdentity) ||
			input.catalogIdentity.startsWith(input.candidateName))
	) {
		return 100;
	}
	if (
		input.catalogName &&
		input.candidateName &&
		(input.candidateName.startsWith(input.catalogName) ||
			input.catalogName.startsWith(input.candidateName))
	) {
		return 95;
	}
	return 0;
}

function normalizeAccountLibraryMatchText(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/todaytoday[\d.,]+\s*(b|kb|mb|gb)$/i, "")
		.trim();
}

async function materializeMediaArchiveItem(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	now: () => Date;
	archiveItem: RunArchiveItem;
}): Promise<HistoryMaterializationResult | null> {
	if (!archiveItemLooksLikeMediaGeneration(input.archiveItem, input.request)) return null;
	const provider = input.request.provider ?? normalizeProviderId(input.archiveItem.provider);
	const catalog = await input.catalogService.readCatalog({
		provider,
		runtimeProfileId: input.request.runtimeProfile ?? input.archiveItem.runtimeProfile,
		kind: "all",
		limit: 50,
	});
	const [candidate] = await buildMediaGenerationReconciliationCandidates(
		input.runArchiveService,
		[input.archiveItem],
		input.request,
	);
	if (!candidate) {
		return skippedResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			target: null,
			message: `Run archive item ${input.archiveItem.id} does not have media-generation evidence for history materialization.`,
		});
	}
	const unsupportedReason = unsupportedMediaReconciliationReason(candidate);
	if (unsupportedReason) {
		return skippedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			candidate,
			reason: unsupportedReason,
		});
	}
	const matchResult = matchMediaCandidateToConversation(
		candidate,
		buildCatalogConversationCandidates(catalog, input.request),
	);
	if (!matchResult.matched) {
		return skippedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			candidate,
			reason: matchResult.reason,
		});
	}
	try {
		return await materializeMatchedMediaGeneration({
			request: input.request,
			jobId: input.jobId,
			runArchiveService: input.runArchiveService,
			materializeMediaGeneration: input.materializeMediaGeneration,
			candidate,
			match: matchResult.match,
			now: input.now,
		});
	} catch (error) {
		if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
			throw error;
		}
		return failedMediaGenerationResult({
			now: input.now,
			source: sourceFromCreateRequest(input.request),
			target: matchResult.match.target,
			candidate,
			error,
		});
	}
}

async function materializeReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalogService: AccountMirrorCatalogService;
	runArchiveService: RunArchiveService;
	materializeConversation: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
		context?: HistoryMaterializationProviderWorkContext,
	) => Promise<HistoryMaterializationResult>;
	refreshConversationSnapshot: (
		target: HistoryMaterializationTarget,
		request: HistoryMaterializationCreateRequest,
		jobId: string,
	) => Promise<HistoryMaterializationSnapshotRefresh>;
	recordConversationEvidence: (
		target: HistoryMaterializationTarget,
		evidence: AccountMirrorConversationEvidence,
	) => Promise<void>;
	materializationAttemptExecutor: HistoryMaterializationAttemptExecutor;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	jobStore: HistoryMaterializationJobStore;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const maxTargets = normalizeMaxItems(input.request.maxItems) ?? 10;
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	const selectedConversationIds = normalizeConversationIds(input.request.conversationIds);
	const catalogLimit =
		selectedKinds.includes("artifacts") || selectedKinds.includes("files")
			? Math.max(500, maxTargets * 20)
			: Math.max(50, maxTargets * 20);
	const catalog = await input.catalogService.readCatalog({
		provider: input.request.provider ?? null,
		runtimeProfileId: input.request.runtimeProfile ?? null,
		kind: "all",
		limit: catalogLimit,
	});
	const results: HistoryMaterializationResult[] = [];
	const attemptReceipts: HistoryMaterializationAttemptReceipt[] = [];
	let eligibleCandidates = 0;
	let selectedCandidates = 0;
	let materializedCandidates = 0;
	const candidateFunnel =
		selectedConversationIds.length === 0 ? createHistoryMaterializationCandidateFunnel() : null;
	let consumedTargetBudget = 0;
	let remainingAssetBudget = maxTargets;
	const selectedConversationIdSet = new Set(selectedConversationIds);
	const selectedCatalogTargets = new Map<string, HistoryMaterializationTarget>();
	const selectedCatalogAssetFamilySignatures = new Map<string, string[]>();
	if (selectedConversationIdSet.size > 0) {
		for (const entry of catalog.entries) {
			if (!catalogEntryMatchesBoundIdentity(entry, input.request.boundIdentityKey)) continue;
			for (const item of entry.manifests.conversations) {
				const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
				if (
					!conversationId ||
					!selectedConversationIdSet.has(conversationId) ||
					selectedCatalogTargets.has(conversationId)
				) {
					continue;
				}
				const target = targetFromCatalogConversation(entry, item, conversationId);
				if (target) {
					selectedCatalogTargets.set(conversationId, target);
					selectedCatalogAssetFamilySignatures.set(
						conversationId,
						catalogEntriesConversationAssetFamilySignatures(
							catalog.entries,
							conversationId,
							selectedKinds,
							entry.provider,
							input.request.boundIdentityKey ?? null,
						),
					);
				}
			}
		}
	}
	const attemptedAssetFamilySignatures = new Set<string>();
	const reusedArchiveAssets: ScopedArchiveReuse[] = [];
	const priorTerminalEvidence: ScopedTerminalEvidence[] = [];
	const priorJobs = input.request.force === true ? [] : await input.jobStore.listJobs();
	if (input.request.force !== true) {
		if (selectedConversationIds.length > 0) {
			reusedArchiveAssets.push(
				...(await readScopedArchiveReuse({
					runArchiveService: input.runArchiveService,
					request: input.request,
					selectedKinds,
					targets: selectedCatalogTargets,
					families: selectedCatalogAssetFamilySignatures,
				})),
			);
		}
		const archiveSignatures =
			selectedConversationIds.length > 0
				? reusedArchiveAssets.map((reuse) => reuse.signature)
				: await materializedArchiveAssetFamilySignatures({
						runArchiveService: input.runArchiveService,
						request: input.request,
						selectedKinds,
					});
		for (const signature of archiveSignatures) {
			attemptedAssetFamilySignatures.add(signature);
		}
		if (selectedConversationIds.length > 0) {
			priorTerminalEvidence.push(
				...readScopedTerminalEvidence({
					jobs: priorJobs,
					targets: selectedCatalogTargets,
					families: selectedCatalogAssetFamilySignatures,
					selectedKinds,
					reusedArchiveAssets,
				}),
			);
		}
		for (const evidence of priorTerminalEvidence) {
			for (const signature of evidence.signatures) attemptedAssetFamilySignatures.add(signature);
		}
		const terminalVolatileSignatures = await terminalVolatileAssetFamilySignatures({
			jobs: priorJobs,
			request: input.request,
			selectedKinds,
		});
		for (const signature of terminalVolatileSignatures) {
			attemptedAssetFamilySignatures.add(signature);
		}
		for (const entry of catalog.entries) {
			if (!catalogEntryMatchesBoundIdentity(entry, input.request.boundIdentityKey)) continue;
			for (const item of entry.manifests.conversations) {
				const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
				if (!conversationId || !catalogConversationHasCompleteSelectedAssets(item)) continue;
				if (selectedConversationIdSet.size > 0 && !selectedConversationIdSet.has(conversationId))
					continue;
				for (const signature of catalogEntriesConversationAssetFamilySignatures(
					catalog.entries,
					conversationId,
					selectedKinds,
					entry.provider,
					input.request.boundIdentityKey ?? null,
				)) {
					attemptedAssetFamilySignatures.add(signature);
				}
			}
		}
	}
	if (
		selectedConversationIds.length > 0 &&
		input.request.provider &&
		(selectedKinds.includes("artifacts") ||
			selectedKinds.includes("files") ||
			selectedKinds.includes("media"))
	) {
		const eligibleConversationIds = selectedConversationIds.filter((conversationId) => {
			const assetFamilySignatures = selectedCatalogAssetFamilySignatures.get(conversationId) ?? [];
			return !(
				assetFamilySignatures.length > 0 &&
				assetFamilySignatures.every((signature) => attemptedAssetFamilySignatures.has(signature))
			);
		});
		eligibleCandidates += eligibleConversationIds.length;
		const retryAttemptedAt =
			input.request.force === true
				? new Map<string, string>()
				: await reconciliationRetryAttemptedAtByConversationId({
						jobs: priorJobs,
						request: input.request,
						selectedKinds,
					});
		// Keep the supplied frontier closed while rotating zero-asset retries behind
		// unattempted work. Stable ties preserve collector ordering.
		const orderedConversationIds = [...eligibleConversationIds].sort((left, right) => {
			const leftAttemptedAt = retryAttemptedAt.get(left);
			const rightAttemptedAt = retryAttemptedAt.get(right);
			if (!leftAttemptedAt && rightAttemptedAt) return -1;
			if (leftAttemptedAt && !rightAttemptedAt) return 1;
			if (leftAttemptedAt && rightAttemptedAt)
				return leftAttemptedAt.localeCompare(rightAttemptedAt);
			return 0;
		});
		for (const conversationId of orderedConversationIds) {
			if (consumedTargetBudget >= maxTargets) break;
			const assetFamilySignatures = selectedCatalogAssetFamilySignatures.get(conversationId) ?? [];
			if (
				assetFamilySignatures.length > 0 &&
				assetFamilySignatures.every((signature) => attemptedAssetFamilySignatures.has(signature))
			) {
				continue;
			}
			// Exact-id collector rows can legitimately have no cached asset manifest yet.
			// Carry every already-terminal family into provider discovery so assets found
			// from the live DOM are filtered before they consume this pass's item budget.
			const excludedAssetFamilySignatures = Array.from(attemptedAssetFamilySignatures);
			for (const signature of assetFamilySignatures) {
				attemptedAssetFamilySignatures.add(signature);
			}
			const target = selectedCatalogTargets.get(conversationId) ?? {
				provider: input.request.provider,
				runtimeProfile: input.request.runtimeProfile ?? null,
				browserProfile: input.request.browserProfile ?? null,
				boundIdentityKey: input.request.boundIdentityKey ?? null,
				conversationId,
				providerConversationUrl: resolveProviderConversationUrl(
					input.request.provider,
					conversationId,
				),
				projectId: input.request.projectId ?? null,
			};
			const outcome = await input.materializationAttemptExecutor.execute({
				jobId: input.jobId,
				request: input.request,
				candidate: {
					origin: "selected_conversation_id",
					index: selectedCandidates,
					target,
					excludedAssetFamilySignatures,
				},
				budgetBefore: {
					targetLimit: maxTargets,
					targetsConsumed: consumedTargetBudget,
					assetsRemaining: remainingAssetBudget,
				},
			});
			results.push(outcome.result);
			attemptReceipts.push(outcome.receipt);
			selectedCandidates += 1;
			if (outcome.accounting.candidateMaterialized) materializedCandidates += 1;
			if (outcome.accounting.providerGuardObserved) break;
			if (outcome.accounting.targetConsumed) {
				consumedTargetBudget += 1;
			}
		}
	} else if (
		selectedKinds.includes("artifacts") ||
		selectedKinds.includes("files") ||
		selectedKinds.includes("media")
	) {
		const candidates: Array<{
			target: HistoryMaterializationTarget;
			assetFamilySignatures: string[];
			priority: number;
			sequence: number;
		}> = [];
		let sequence = 0;
		for (const entry of catalog.entries) {
			if (!catalogEntryMatchesBoundIdentity(entry, input.request.boundIdentityKey)) {
				if (candidateFunnel) {
					candidateFunnel.discovered += entry.manifests.conversations.length;
					candidateFunnel.preEligibilityExclusions.identityMismatch +=
						entry.manifests.conversations.length;
				}
				continue;
			}
			for (const item of entry.manifests.conversations) {
				if (candidateFunnel) candidateFunnel.discovered += 1;
				const conversationId = readCatalogStringField(item, ["id", "conversationId"]);
				if (!conversationId) {
					if (candidateFunnel) {
						candidateFunnel.preEligibilityExclusions.missingConversationId += 1;
					}
					continue;
				}
				const assetFamilySignatures = catalogEntriesConversationAssetFamilySignatures(
					catalog.entries,
					conversationId,
					selectedKinds,
					entry.provider,
					input.request.boundIdentityKey ?? null,
				);
				const classification = classifyCatalogConversationMaterialization(
					item,
					selectedKinds,
					{
						provider: entry.provider,
						conversationId,
						manifests: entry.manifests,
					},
					{
						force: input.request.force === true,
						refreshSnapshot: input.request.refreshSnapshot === true,
					},
				);
				if (classification.priority === null) {
					if (candidateFunnel && classification.exclusionReason) {
						candidateFunnel.preEligibilityExclusions[classification.exclusionReason] += 1;
					}
					continue;
				}
				const target = targetFromCatalogConversation(entry, item, conversationId);
				if (!target) {
					if (candidateFunnel) candidateFunnel.preEligibilityExclusions.missingTarget += 1;
					continue;
				}
				candidates.push({
					target,
					assetFamilySignatures,
					priority: classification.priority,
					sequence,
				});
				sequence += 1;
			}
		}
		candidates.sort(
			(left, right) => left.priority - right.priority || left.sequence - right.sequence,
		);
		const selectionCandidates = candidates.filter((candidate) => {
			const terminalAssetFamilies =
				candidate.assetFamilySignatures.length > 0 &&
				candidate.assetFamilySignatures.every((signature) =>
					attemptedAssetFamilySignatures.has(signature),
				);
			if (terminalAssetFamilies && candidateFunnel) {
				candidateFunnel.preEligibilityExclusions.terminalAssetFamilies += 1;
			}
			return !terminalAssetFamilies;
		});
		eligibleCandidates += selectionCandidates.length;
		if (candidateFunnel) candidateFunnel.eligible += selectionCandidates.length;
		const retryAttemptedAt =
			input.request.force === true
				? new Map<string, string>()
				: await reconciliationRetryAttemptedAtByConversationId({
						jobs: priorJobs,
						request: input.request,
						selectedKinds,
					});
		const orderedSelectionCandidates = [...selectionCandidates].sort((left, right) => {
			const leftAttemptedAt = retryAttemptedAt.get(left.target.conversationId);
			const rightAttemptedAt = retryAttemptedAt.get(right.target.conversationId);
			if (!leftAttemptedAt && rightAttemptedAt) return -1;
			if (leftAttemptedAt && !rightAttemptedAt) return 1;
			if (leftAttemptedAt && rightAttemptedAt && leftAttemptedAt !== rightAttemptedAt) {
				return leftAttemptedAt.localeCompare(rightAttemptedAt);
			}
			return left.priority - right.priority || left.sequence - right.sequence;
		});
		for (const [candidateIndex, candidate] of orderedSelectionCandidates.entries()) {
			if (consumedTargetBudget >= maxTargets) {
				if (candidateFunnel) {
					candidateFunnel.postEligibilityExclusions.targetBudget +=
						orderedSelectionCandidates.length - candidateIndex;
				}
				break;
			}
			if (remainingAssetBudget <= 0) {
				if (candidateFunnel) {
					candidateFunnel.postEligibilityExclusions.assetBudget +=
						orderedSelectionCandidates.length - candidateIndex;
				}
				break;
			}
			if (
				candidate.assetFamilySignatures.length > 0 &&
				candidate.assetFamilySignatures.every((signature) =>
					attemptedAssetFamilySignatures.has(signature),
				)
			) {
				if (candidateFunnel) {
					candidateFunnel.postEligibilityExclusions.duplicateAssetFamilies += 1;
				}
				continue;
			}
			// Collector-reused conversations may be broad reconciliation candidates even
			// before their cached asset manifests exist. Provider discovery still needs
			// the full terminal-family set so those live DOM rows cannot be replayed.
			const excludedAssetFamilySignatures = Array.from(attemptedAssetFamilySignatures);
			for (const signature of candidate.assetFamilySignatures) {
				attemptedAssetFamilySignatures.add(signature);
			}
			const outcome = await input.materializationAttemptExecutor.execute({
				jobId: input.jobId,
				request: {
					...input.request,
					maxItems: remainingAssetBudget,
				},
				candidate: {
					origin: "reconciliation_candidate",
					index: selectedCandidates,
					target: candidate.target,
					excludedAssetFamilySignatures,
				},
				budgetBefore: {
					targetLimit: maxTargets,
					targetsConsumed: consumedTargetBudget,
					assetsRemaining: remainingAssetBudget,
				},
			});
			results.push(outcome.result);
			attemptReceipts.push(outcome.receipt);
			selectedCandidates += 1;
			if (outcome.accounting.candidateMaterialized) materializedCandidates += 1;
			if (candidateFunnel) candidateFunnel.selected += 1;
			if (outcome.accounting.providerGuardObserved) {
				if (candidateFunnel) {
					candidateFunnel.postEligibilityExclusions.providerGuard +=
						orderedSelectionCandidates.length - candidateIndex - 1;
				}
				break;
			}
			remainingAssetBudget =
				decrementRemaining(remainingAssetBudget, outcome.accounting.assetsAttempted) ?? 0;
			if (outcome.accounting.targetConsumed) {
				consumedTargetBudget += 1;
			}
		}
	}
	if (
		selectedKinds.includes("media") &&
		consumedTargetBudget < maxTargets &&
		selectedConversationIds.length === 0
	) {
		const mediaReconciliation = await materializeMediaGenerationReconciliation({
			...input,
			catalog,
			maxTargets: maxTargets - consumedTargetBudget,
		});
		results.push(...mediaReconciliation.results);
		eligibleCandidates += mediaReconciliation.eligibleCandidates;
		selectedCandidates += mediaReconciliation.selectedCandidates;
	}
	const generatedAt = input.now().toISOString();
	const entries = [
		...reusedArchiveAssets.map((reuse) => reuse.entry),
		...priorTerminalEvidence.map((evidence) => evidence.entry),
		...results.flatMap((result) => result.entries),
	];
	const archiveItems = [
		...reusedArchiveAssets.map((reuse) => reuse.item),
		...results.flatMap((result) => result.archiveItems),
	];
	const manifestPaths = Array.from(new Set(results.flatMap((result) => result.manifestPaths)));
	const snapshotRefreshes = results.flatMap((result) => snapshotRefreshesFromResult(result));
	const metrics = {
		...summarizeEntries(
			entries,
			Math.max(
				results.length,
				new Set(
					[
						...reusedArchiveAssets.map((reuse) => reuse.item.providerConversationId),
						...priorTerminalEvidence.map((evidence) => evidence.conversationId),
						...results.map((result) => result.target?.conversationId),
					].filter(Boolean),
				).size,
			),
		),
		eligibleCandidates,
		selectedCandidates,
		materializedCandidates,
		...(candidateFunnel ? { candidateFunnel } : {}),
	};
	const status = resolveHistoryMaterializationResultStatus(metrics);
	const duplicateAliases = metrics.duplicateAliases ?? 0;
	return {
		object: "history_materialization_result",
		generatedAt,
		status,
		target: null,
		source: sourceFromCreateRequest(input.request),
		manifestPaths,
		entries,
		archiveItems,
		snapshotRefreshes,
		attempts: attemptReceipts,
		metrics,
		phases: {
			snapshotRefresh: snapshotRefreshes.length === 1 ? snapshotRefreshes[0] : null,
			materialization: {
				status,
				generatedAt,
				manifestPaths,
				entries: entries.length,
				archiveItems: archiveItems.length,
				metrics,
			},
		},
		message:
			metrics.materialized > 0
				? `History reconciliation materialized ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} from ${results.length} conversation${results.length === 1 ? "" : "s"}.`
				: duplicateAliases > 0
					? `History reconciliation reused ${duplicateAliases} verified archive asset${duplicateAliases === 1 ? "" : "s"}${metrics.failed > 0 ? `; ${metrics.failed} selected asset${metrics.failed === 1 ? "" : "s"} failed` : ""}.`
					: metrics.failed > 0
						? `History reconciliation failed to materialize ${metrics.failed} asset${metrics.failed === 1 ? "" : "s"} from ${results.length} conversation${results.length === 1 ? "" : "s"}.`
						: "History reconciliation did not find downloadable assets to materialize.",
	};
}

function targetFromCatalogConversation(
	entry: AccountMirrorCatalogEntry,
	item: unknown,
	conversationId: string,
): HistoryMaterializationTarget | null {
	const rawProviderConversationUrl = readCatalogStringField(item, [
		"url",
		"href",
		"providerConversationUrl",
	]);
	const targetFields = normalizeProviderConversationTargetFields(
		entry.provider,
		conversationId,
		rawProviderConversationUrl,
	);
	if (!targetFields) return null;
	const normalizedConversationId = targetFields.conversationId;
	return {
		provider: entry.provider,
		runtimeProfile: entry.runtimeProfileId,
		browserProfile: entry.browserProfileId,
		boundIdentityKey: entry.boundIdentityKey,
		conversationId: normalizedConversationId,
		providerConversationUrl:
			targetFields.providerConversationUrl ??
			resolveProviderConversationUrl(entry.provider, normalizedConversationId),
		projectId: readCatalogStringField(item, ["projectId"]),
	};
}

async function materializeMediaGenerationTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMediaGenerationMaterializeInput;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<MediaGenerationResponse> {
	const mediaService = createMediaGenerationService({
		materializer: createBrowserMediaGenerationMaterializer(
			withRuntimeProfileSelection(
				input.config,
				input.request.provider,
				input.request.runtimeProfile,
			) as ResolvedUserConfig,
			{ onProviderSessionProof: input.onProviderSessionProof },
		),
		runtimeProfile: input.request.runtimeProfile,
		refreshArchiveIndex: false,
	});
	if (!mediaService.materializeGeneration) {
		throw new Error("Media generation materialization is not configured.");
	}
	return mediaService.materializeGeneration(input.request.mediaGenerationId, {
		count: input.request.count,
		source: "api",
		metadata: {
			...(input.request.metadata ?? {}),
			conversationId: input.request.conversationId,
			providerConversationId: input.request.conversationId,
			providerConversationUrl: input.request.providerConversationUrl,
			conversationUrl: input.request.providerConversationUrl,
			projectId: input.request.projectId,
			boundIdentityKey: input.request.boundIdentityKey,
			historyMaterializationJobId: input.request.jobId,
			historyMatchBasis: input.request.matchBasis,
		},
	});
}

async function materializeMediaGenerationReconciliation(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	catalog: Awaited<ReturnType<AccountMirrorCatalogService["readCatalog"]>>;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	maxTargets: number;
	now: () => Date;
}): Promise<{
	results: HistoryMaterializationResult[];
	eligibleCandidates: number;
	selectedCandidates: number;
}> {
	const archive = await input.runArchiveService.listItems({
		kind: "generated_artifact",
		provider: input.request.provider ?? null,
		runtimeProfile: null,
		assetAvailability: "unavailable",
		limit: Math.max(1, input.maxTargets * 10),
	});
	const candidates = await buildMediaGenerationReconciliationCandidates(
		input.runArchiveService,
		archive.items,
		input.request,
	);
	const conversations = buildCatalogConversationCandidates(input.catalog, input.request);
	const results: HistoryMaterializationResult[] = [];
	let consumedTargetBudget = 0;
	for (const candidate of candidates) {
		if (consumedTargetBudget >= input.maxTargets) break;
		const unsupportedReason = unsupportedMediaReconciliationReason(candidate);
		if (unsupportedReason) {
			const result = skippedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				candidate,
				reason: unsupportedReason,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
			continue;
		}
		const matchResult = matchMediaCandidateToConversation(candidate, conversations);
		if (!matchResult.matched) {
			const result = skippedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				candidate,
				reason: matchResult.reason,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
			continue;
		}
		try {
			const result = await materializeMatchedMediaGeneration({
				...input,
				candidate,
				match: matchResult.match,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		} catch (error) {
			if (isProviderAuthPreflightError(error) || isProviderHumanVerificationError(error)) {
				throw error;
			}
			const result = failedMediaGenerationResult({
				now: input.now,
				source: sourceFromCreateRequest(input.request),
				target: matchResult.match.target,
				candidate,
				error,
			});
			results.push(result);
			if (consumesReconciliationTargetBudget(result)) {
				consumedTargetBudget += 1;
			}
		}
	}
	return {
		results,
		eligibleCandidates: candidates.length,
		selectedCandidates: results.length,
	};
}

type MediaGenerationReconciliationCandidate = {
	mediaGenerationId: string;
	provider: ProviderId;
	runtimeProfile: string | null;
	browserProfile: string | null;
	boundIdentityKey: string | null;
	projectId: string | null;
	mediaType: MediaGenerationType;
	prompt: string | null;
	providerConversationId: string | null;
	providerConversationUrl: string | null;
	artifactCount: number;
	createdAt: string | null;
	archiveItem: RunArchiveItem;
	baseItem: RunArchiveItem | null;
};

type CatalogConversationCandidate = {
	target: HistoryMaterializationTarget;
	title: string | null;
	normalizedTitle: string | null;
	cachedArtifactCount: number;
	cachedFileCount: number;
	cachedMediaCount: number;
	observedAt: string | null;
};

type MediaConversationMatch = {
	target: HistoryMaterializationTarget;
	matchBasis: string;
};

type MediaConversationMatchResult =
	| { matched: true; match: MediaConversationMatch }
	| { matched: false; reason: string };

const MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS = 24 * 60 * 60 * 1000;

async function buildMediaGenerationReconciliationCandidates(
	runArchiveService: RunArchiveService,
	items: RunArchiveItem[],
	request: HistoryMaterializationCreateRequest,
): Promise<MediaGenerationReconciliationCandidate[]> {
	const byMediaGeneration = new Map<string, RunArchiveItem[]>();
	for (const item of items) {
		if (!item.mediaGenerationId) continue;
		if (item.fileAvailable === true && item.localPath && request.force !== true) continue;
		if (
			request.boundIdentityKey &&
			item.boundIdentityKey &&
			item.boundIdentityKey !== request.boundIdentityKey
		)
			continue;
		if (
			request.runtimeProfile &&
			item.runtimeProfile &&
			item.runtimeProfile !== request.runtimeProfile
		)
			continue;
		const provider = normalizeProviderId(item.provider);
		if (!provider) continue;
		const mediaType = normalizeMediaGenerationType(
			readRecordString(item.metadata, ["mediaType"]) ??
				item.mimeType ??
				item.fileName ??
				item.title,
		);
		if (!mediaType) continue;
		const existing = byMediaGeneration.get(item.mediaGenerationId) ?? [];
		existing.push(item);
		byMediaGeneration.set(item.mediaGenerationId, existing);
	}
	const candidates: MediaGenerationReconciliationCandidate[] = [];
	for (const [mediaGenerationId, generationItems] of byMediaGeneration) {
		const first = generationItems[0];
		if (!first) continue;
		const base =
			(await runArchiveService.readItem(`media-generation:${mediaGenerationId}`))?.item ?? null;
		const provider = normalizeProviderId(first.provider ?? base?.provider);
		const mediaType = normalizeMediaGenerationType(
			readRecordString(base?.metadata, ["mediaType"]) ??
				readRecordString(first.metadata, ["mediaType"]) ??
				first.mimeType ??
				first.fileName ??
				first.title,
		);
		if (!provider || !mediaType) continue;
		candidates.push({
			mediaGenerationId,
			provider,
			runtimeProfile:
				first.runtimeProfile ?? base?.runtimeProfile ?? request.runtimeProfile ?? null,
			browserProfile:
				first.browserProfile ?? base?.browserProfile ?? request.browserProfile ?? null,
			boundIdentityKey:
				first.boundIdentityKey ?? base?.boundIdentityKey ?? request.boundIdentityKey ?? null,
			projectId: first.projectId ?? base?.projectId ?? request.projectId ?? null,
			mediaType,
			prompt:
				base?.title ??
				readRecordString(base?.metadata, ["prompt"]) ??
				readRecordString(first.metadata, ["prompt"]) ??
				null,
			providerConversationId: first.providerConversationId ?? base?.providerConversationId ?? null,
			providerConversationUrl:
				first.providerConversationUrl ?? base?.providerConversationUrl ?? null,
			artifactCount: generationItems.length,
			createdAt: base?.createdAt ?? first.createdAt ?? null,
			archiveItem: first,
			baseItem: base,
		});
	}
	return candidates;
}

function buildCatalogConversationCandidates(
	catalog: Awaited<ReturnType<AccountMirrorCatalogService["readCatalog"]>>,
	request: HistoryMaterializationCreateRequest,
): CatalogConversationCandidate[] {
	const candidates: CatalogConversationCandidate[] = [];
	for (const entry of catalog.entries) {
		if (!catalogEntryMatchesBoundIdentity(entry, request.boundIdentityKey)) continue;
		const mediaCounts = countCatalogMediaByConversation(entry.manifests.media);
		for (const item of entry.manifests.conversations) {
			const rawConversationId = readCatalogStringField(item, ["id", "conversationId"]);
			const rawProviderConversationUrl = readCatalogStringField(item, [
				"url",
				"href",
				"providerConversationUrl",
			]);
			const targetFields = normalizeProviderConversationTargetFields(
				entry.provider,
				rawConversationId,
				rawProviderConversationUrl,
			);
			if (!targetFields) continue;
			const { conversationId, providerConversationUrl } = targetFields;
			const target: HistoryMaterializationTarget = {
				provider: entry.provider,
				runtimeProfile: entry.runtimeProfileId,
				browserProfile: entry.browserProfileId,
				boundIdentityKey: entry.boundIdentityKey,
				conversationId,
				providerConversationUrl,
				projectId: readCatalogStringField(item, ["projectId"]),
			};
			const title = readCatalogStringField(item, ["title", "name", "prompt"]);
			candidates.push({
				target,
				title,
				normalizedTitle: normalizeMediaMatchTitle(title),
				cachedArtifactCount: readCatalogNumberField(item, ["cachedArtifactCount"]),
				cachedFileCount: readCatalogNumberField(item, ["cachedFileCount"]),
				cachedMediaCount:
					readCatalogNumberField(item, ["cachedMediaCount"]) +
					(mediaCounts.get(conversationId) ?? 0),
				observedAt: readCatalogStringField(item, [
					"updatedAt",
					"createdAt",
					"lastActivityAt",
					"timestamp",
				]),
			});
		}
	}
	return candidates;
}

function matchMediaCandidateToConversation(
	candidate: MediaGenerationReconciliationCandidate,
	conversations: CatalogConversationCandidate[],
): MediaConversationMatchResult {
	const scoped = conversations.filter(
		(conversation) =>
			conversation.target.provider === candidate.provider &&
			(!candidate.runtimeProfile ||
				conversation.target.runtimeProfile === candidate.runtimeProfile) &&
			(!candidate.boundIdentityKey ||
				conversation.target.boundIdentityKey === candidate.boundIdentityKey),
	);
	if (candidate.providerConversationId) {
		const direct = scoped.find(
			(conversation) => conversation.target.conversationId === candidate.providerConversationId,
		);
		const directTarget = direct?.target ?? targetFromMediaCandidateProviderConversation(candidate);
		if (directTarget) {
			return {
				matched: true,
				match: {
					target: withCandidateRuntimeEvidence(directTarget, candidate),
					matchBasis: "provider-conversation-id",
				},
			};
		}
	}
	const prompt = normalizeMediaMatchTitle(candidate.prompt);
	if (prompt) {
		const titleMatches = scoped.filter((conversation) => conversation.normalizedTitle === prompt);
		if (titleMatches.length > 0) {
			if (titleMatches.length === 1) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(titleMatches[0].target, candidate),
						matchBasis: "exact-title",
					},
				};
			}
			const mediaEvidenceMatches = titleMatches.filter(
				(conversation) => conversation.cachedMediaCount > 0,
			);
			if (mediaEvidenceMatches.length === 1) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(mediaEvidenceMatches[0].target, candidate),
						matchBasis: "exact-title-cached-media",
					},
				};
			}
			const timestampMatch = chooseNearestTimestampedTitleMatch(candidate, titleMatches);
			if (timestampMatch) {
				return {
					matched: true,
					match: {
						target: withCandidateRuntimeEvidence(timestampMatch.target, candidate),
						matchBasis: "exact-title-nearest-time",
					},
				};
			}
			return {
				matched: false,
				reason: formatAmbiguousMediaTitleMatchReason(candidate, titleMatches),
			};
		}
	}
	return {
		matched: false,
		reason: `No matching account-mirror conversation found for media generation ${candidate.mediaGenerationId}.`,
	};
}

function formatAmbiguousMediaTitleMatchReason(
	candidate: MediaGenerationReconciliationCandidate,
	titleMatches: CatalogConversationCandidate[],
): string {
	const ids = titleMatches
		.map((conversation) => conversation.target.conversationId)
		.filter(Boolean);
	const cachedMediaMatches = titleMatches.filter(
		(conversation) => conversation.cachedMediaCount > 0,
	).length;
	const cachedArtifactOrFileMatches = titleMatches.filter(
		(conversation) => conversation.cachedArtifactCount > 0 || conversation.cachedFileCount > 0,
	).length;
	const candidateTime = parseTimestampMs(candidate.createdAt);
	const usableTimestampMatches =
		candidateTime === null
			? 0
			: titleMatches.filter((conversation) => {
					const observedAt = parseTimestampMs(conversation.observedAt);
					return (
						observedAt !== null &&
						Math.abs(observedAt - candidateTime) <= MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS
					);
				}).length;
	const timestampEvidence =
		candidateTime === null
			? "candidate timestamp missing"
			: `${usableTimestampMatches} with usable timestamps`;
	return (
		`Ambiguous account-mirror conversations for media generation ${candidate.mediaGenerationId}: ` +
		`${titleMatches.length} cached ${candidate.provider} conversations share the exact title` +
		`${ids.length ? ` (${ids.join(", ")})` : ""}; ` +
		"no unique media recovery evidence is available " +
		`(${cachedMediaMatches} with cached media, ${timestampEvidence}, ` +
		`${cachedArtifactOrFileMatches} with cached artifacts/files).`
	);
}

function chooseNearestTimestampedTitleMatch(
	candidate: MediaGenerationReconciliationCandidate,
	titleMatches: CatalogConversationCandidate[],
): CatalogConversationCandidate | null {
	const candidateTime = parseTimestampMs(candidate.createdAt);
	if (candidateTime === null) return null;
	const ranked = titleMatches
		.map((conversation) => {
			const observedAt = parseTimestampMs(conversation.observedAt);
			return observedAt === null
				? null
				: {
						conversation,
						distanceMs: Math.abs(observedAt - candidateTime),
					};
		})
		.filter((entry): entry is { conversation: CatalogConversationCandidate; distanceMs: number } =>
			Boolean(entry),
		)
		.sort((left, right) => left.distanceMs - right.distanceMs);
	const best = ranked[0];
	if (!best || best.distanceMs > MAX_MEDIA_TITLE_TIMESTAMP_MATCH_MS) return null;
	const second = ranked[1];
	if (second && second.distanceMs === best.distanceMs) return null;
	return best.conversation;
}

function unsupportedMediaReconciliationReason(
	candidate: MediaGenerationReconciliationCandidate,
): string | null {
	if (candidate.provider !== "grok") return null;
	return (
		`Grok history media materialization is not supported for media generation ${candidate.mediaGenerationId}: ` +
		"the Grok resumed image materializer can only inspect the active Imagine/files surface, not a matched historical conversation."
	);
}

function targetFromMediaCandidateProviderConversation(
	candidate: MediaGenerationReconciliationCandidate,
): HistoryMaterializationTarget | null {
	const targetFields = normalizeProviderConversationTargetFields(
		candidate.provider,
		candidate.providerConversationId,
		candidate.providerConversationUrl,
	);
	if (!targetFields) return null;
	return {
		provider: candidate.provider,
		runtimeProfile: candidate.runtimeProfile,
		browserProfile: candidate.browserProfile,
		boundIdentityKey: candidate.boundIdentityKey,
		conversationId: targetFields.conversationId,
		providerConversationUrl: targetFields.providerConversationUrl,
		projectId: candidate.projectId,
	};
}

function withCandidateRuntimeEvidence(
	target: HistoryMaterializationTarget,
	candidate: MediaGenerationReconciliationCandidate,
): HistoryMaterializationTarget {
	return {
		...target,
		runtimeProfile: target.runtimeProfile ?? candidate.runtimeProfile,
		browserProfile: target.browserProfile ?? candidate.browserProfile,
		boundIdentityKey: target.boundIdentityKey ?? candidate.boundIdentityKey,
		projectId: target.projectId ?? candidate.projectId,
	};
}

async function materializeMatchedMediaGeneration(input: {
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	runArchiveService: RunArchiveService;
	materializeMediaGeneration: (
		request: HistoryMediaGenerationMaterializeInput,
	) => Promise<MediaGenerationResponse>;
	candidate: MediaGenerationReconciliationCandidate;
	match: MediaConversationMatch;
	now: () => Date;
}): Promise<HistoryMaterializationResult> {
	const response = await input.materializeMediaGeneration({
		mediaGenerationId: input.candidate.mediaGenerationId,
		provider: input.candidate.provider,
		mediaType: input.candidate.mediaType,
		runtimeProfile: input.match.target.runtimeProfile ?? input.candidate.runtimeProfile,
		browserProfile: input.match.target.browserProfile ?? input.candidate.browserProfile,
		boundIdentityKey: input.match.target.boundIdentityKey ?? input.candidate.boundIdentityKey,
		conversationId: input.match.target.conversationId,
		providerConversationUrl: input.match.target.providerConversationUrl,
		projectId: input.match.target.projectId ?? input.candidate.projectId,
		jobId: input.jobId,
		matchBasis: input.match.matchBasis,
		count: Math.max(1, input.candidate.artifactCount),
		metadata: {
			sourceArchiveItemId: input.candidate.archiveItem.id,
			sourceMediaGenerationArchiveItemId: input.candidate.baseItem?.id ?? null,
		},
	});
	await input.runArchiveService.upsertMediaGenerationItems(input.candidate.mediaGenerationId);
	const archiveItems = await readMediaGenerationArchiveItems(
		input.runArchiveService,
		input.candidate.mediaGenerationId,
		response.artifacts,
	);
	const entries = await Promise.all(
		response.artifacts.map((artifact) => historyEntryFromMediaArtifact(artifact)),
	);
	applyArchiveLinks(entries, archiveItems);
	applyRecoverabilityStates(entries);
	const generatedAt = input.now().toISOString();
	const metrics = summarizeEntries(entries, 1);
	return {
		object: "history_materialization_result",
		generatedAt,
		status: metrics.materialized > 0 ? "materialized" : "skipped",
		target: input.match.target,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: [],
		entries,
		archiveItems,
		metrics,
		message:
			metrics.materialized > 0
				? `History reconciliation materialized ${metrics.materialized} media asset${metrics.materialized === 1 ? "" : "s"} for media generation ${input.candidate.mediaGenerationId}.`
				: `History reconciliation found no materialized media assets for media generation ${input.candidate.mediaGenerationId}.`,
	};
}

async function readMediaGenerationArchiveItems(
	runArchiveService: RunArchiveService,
	mediaGenerationId: string,
	artifacts: MediaGenerationArtifact[],
): Promise<RunArchiveItem[]> {
	const itemIds = [
		`media-generation:${mediaGenerationId}`,
		...artifacts.map((artifact) => `generated-artifact:${mediaGenerationId}:${artifact.id}`),
	];
	const items: RunArchiveItem[] = [];
	for (const itemId of itemIds) {
		const detail = await runArchiveService.readItem(itemId);
		if (detail?.item) items.push(detail.item);
	}
	return items;
}

async function historyEntryFromMediaArtifact(
	artifact: MediaGenerationArtifact,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(artifact.path ?? null);
	return {
		kind: "media",
		providerId: artifact.id,
		title: artifact.fileName ?? artifact.id,
		status: artifact.path || artifact.uri ? "materialized" : "failed",
		localPath: artifact.path ?? null,
		remoteUrl: artifact.uri ?? readRecordString(artifact.metadata, ["remoteUrl", "providerUrl"]),
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: artifact.path
				? `path:${artifact.path}`
				: null,
		checksumSha256,
		mimeType: artifact.mimeType ?? null,
		size: readNumber(readRecordValue(artifact.metadata, ["size"])),
		materializationMethod: readRecordString(artifact.metadata, [
			"materialization",
			"materializationSource",
		]),
		reason:
			artifact.path || artifact.uri
				? null
				: "media artifact did not include a local path or remote URI",
		archiveItemId: null,
		assetRoute: null,
	};
}

function skippedMediaGenerationResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	candidate: MediaGenerationReconciliationCandidate;
	reason: string;
}): HistoryMaterializationResult {
	const generatedAt = input.now().toISOString();
	return {
		object: "history_materialization_result",
		generatedAt,
		status: "skipped",
		target: null,
		source: input.source,
		manifestPaths: [],
		entries: [
			{
				kind: "media",
				providerId: input.candidate.archiveItem.artifactId,
				title: input.candidate.prompt ?? input.candidate.archiveItem.title,
				status: "skipped",
				localPath: null,
				remoteUrl: input.candidate.archiveItem.uri,
				cacheKey: null,
				checksumSha256: null,
				mimeType: input.candidate.archiveItem.mimeType,
				size: null,
				materializationMethod: null,
				reason: input.reason,
				archiveItemId: input.candidate.archiveItem.id,
				assetRoute: input.candidate.archiveItem.links.asset ?? null,
			},
		],
		archiveItems: [input.candidate.archiveItem],
		metrics: { conversations: 0, materialized: 0, skipped: 1, failed: 0 },
		message: input.reason,
	};
}

function failedMediaGenerationResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	target: HistoryMaterializationTarget;
	candidate: MediaGenerationReconciliationCandidate;
	error: unknown;
}): HistoryMaterializationResult {
	const message = formatHistoryMaterializationFailureReason({
		target: input.target,
		error: input.error,
	});
	return {
		object: "history_materialization_result",
		generatedAt: input.now().toISOString(),
		status: "skipped",
		target: input.target,
		source: input.source,
		manifestPaths: [],
		entries: [
			{
				kind: "media",
				providerId: input.candidate.archiveItem.artifactId,
				title: input.candidate.prompt ?? input.candidate.archiveItem.title,
				status: "failed",
				localPath: null,
				remoteUrl: input.candidate.archiveItem.uri,
				cacheKey: null,
				checksumSha256: null,
				mimeType: input.candidate.archiveItem.mimeType,
				size: null,
				materializationMethod: null,
				reason: message,
				archiveItemId: input.candidate.archiveItem.id,
				assetRoute: input.candidate.archiveItem.links.asset ?? null,
			},
		],
		archiveItems: [input.candidate.archiveItem],
		metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 1 },
		message,
	};
}

function consumesReconciliationTargetBudget(result: HistoryMaterializationResult): boolean {
	return !isTerminalConversationUnavailableResult(result);
}

function historyMaterializationResultHasProviderGuard(
	result: HistoryMaterializationResult,
): boolean {
	return result.entries.some((entry) =>
		/rate limit|requests too quickly|cooldown active|provider guard/i.test(entry.reason ?? ""),
	);
}

function isTerminalConversationUnavailableResult(result: HistoryMaterializationResult): boolean {
	if (result.metrics.materialized > 0) return false;
	return result.entries.some((entry) => isConversationNotFoundOrUnavailableReason(entry.reason));
}

function isConversationNotFoundOrUnavailableReason(reason: string | null | undefined): boolean {
	return typeof reason === "string" && reason.startsWith("conversation-not-found-or-unavailable:");
}

function shouldReuseCollectorSnapshot(
	target: HistoryMaterializationTarget,
	request: HistoryMaterializationCreateRequest,
): boolean {
	return normalizeConversationIds(request.reuseSnapshotConversationIds).includes(
		target.conversationId,
	);
}

function shouldMaterializeBeforeSnapshotRefresh(
	target: HistoryMaterializationTarget,
	request: HistoryMaterializationCreateRequest,
): boolean {
	if (target.provider !== "chatgpt") return false;
	if (shouldReuseCollectorSnapshot(target, request)) return true;
	if (request.reconcile !== true) return false;
	const selectedKinds = normalizeAssetKinds(request.assetKinds);
	return (
		selectedKinds.includes("artifacts") ||
		selectedKinds.includes("files") ||
		selectedKinds.includes("media")
	);
}

function shouldUseFileMaterializationAsSnapshotRefresh(
	target: HistoryMaterializationTarget,
	request: HistoryMaterializationCreateRequest,
): boolean {
	if (target.provider !== "chatgpt") return false;
	const selectedKinds = normalizeAssetKinds(request.assetKinds);
	return selectedKinds.length === 1 && selectedKinds[0] === "files";
}

function snapshotRefreshFromFileMaterialization(input: {
	target: HistoryMaterializationTarget;
	result: HistoryMaterializationResult;
	now: () => Date;
}): HistoryMaterializationSnapshotRefresh {
	const fileEntries = input.result.entries.filter((entry) => entry.kind === "file");
	const providerGuarded = historyMaterializationResultHasProviderGuard(input.result);
	const unavailable = isTerminalConversationUnavailableResult(input.result);
	const inventoryFailed = fileEntries.some(
		(entry) => entry.status === "failed" && entry.providerId === null,
	);
	const status = providerGuarded || unavailable || inventoryFailed ? "failed" : "refreshed";
	const routeabilityState: HistoryMaterializationSnapshotRouteabilityState = providerGuarded
		? "guarded"
		: unavailable
			? "not_found_or_unavailable"
			: inventoryFailed
				? "unknown"
				: "routeable";
	const error =
		status === "failed"
			? (fileEntries.find((entry) => entry.reason)?.reason ?? input.result.message)
			: null;
	return {
		object: "history_materialization_snapshot_refresh",
		generatedAt: input.now().toISOString(),
		status,
		target: input.target,
		routeabilityState,
		messageCount: null,
		fileCount: status === "refreshed" ? fileEntries.length : null,
		sourceCount: null,
		artifactCount: null,
		error,
		message:
			status === "refreshed"
				? `Conversation file inventory refreshed through the retained materialization session for ${input.target.provider} conversation ${input.target.conversationId}.`
				: `Conversation file inventory refresh failed through the retained materialization session for ${input.target.provider} conversation ${input.target.conversationId}: ${error}`,
	};
}

async function refreshConversationSnapshotTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	target: HistoryMaterializationTarget;
	request?: HistoryMaterializationCreateRequest | null;
	jobId?: string | null;
	now: () => Date;
	interactionGovernor?: BrowserInteractionGovernor | null;
	contextTimeoutMs?: number;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<HistoryMaterializationSnapshotRefresh> {
	const llmService = createLlmService(
		input.target.provider,
		withRuntimeProfileSelection(
			input.config,
			input.target.provider,
			input.target.runtimeProfile,
		) as ResolvedUserConfig,
		{
			utilityAffinityId: historyMaterializationUtilityAffinityId(input.jobId),
			browserProcessOwner: input.request
				? createHistoryMaterializationBrowserProcessOwner({
						request: input.request,
						jobId: input.jobId ?? null,
						provider: input.target.provider,
						runtimeProfile: input.target.runtimeProfile,
						browserProfile: input.target.browserProfile,
						reason: "conversation-snapshot-refresh",
					})
				: undefined,
		},
	);
	const trafficOptions = createHistoryMaterializationTrafficOptions(input.target.conversationId, 1);
	const listOptions = {
		...resolveHistoryMaterializationProviderListOptions(input.target),
		...(input.interactionGovernor ? { interactionGovernor: input.interactionGovernor } : {}),
		...trafficOptions,
		onProviderSessionProof: input.onProviderSessionProof,
	};
	let contextReadReceipt: ConversationContextReadReceipt | null = null;
	try {
		const context = await llmService.getConversationContext(input.target.conversationId, {
			projectId: input.target.projectId ?? undefined,
			refresh: true,
			allowCacheFallback: false,
			timeoutMs: input.contextTimeoutMs,
			listOptions,
			onReceipt: (receipt) => {
				contextReadReceipt = receipt;
			},
		});
		return {
			object: "history_materialization_snapshot_refresh",
			generatedAt: input.now().toISOString(),
			status: "refreshed",
			target: input.target,
			routeabilityState: "routeable",
			messageCount: context.messages.length,
			fileCount: context.files?.length ?? 0,
			sourceCount: context.sources?.length ?? 0,
			artifactCount: context.artifacts?.length ?? 0,
			contextReadReceipt,
			error: null,
			message: `Conversation snapshot refreshed for ${input.target.provider} conversation ${input.target.conversationId}.`,
		};
	} catch (error) {
		if (contextReadReceipt && error && typeof error === "object") {
			Object.assign(error, { contextReadReceipt });
		}
		throw error;
	}
}

function shouldRefreshSnapshot(request: HistoryMaterializationCreateRequest): boolean {
	return request.refreshSnapshot === true;
}

function withSnapshotRefreshPhase(
	result: HistoryMaterializationResult,
	snapshotRefresh: HistoryMaterializationSnapshotRefresh,
): HistoryMaterializationResult {
	return {
		...result,
		snapshotRefreshes: [...snapshotRefreshesFromResult(result), snapshotRefresh],
		phases: {
			snapshotRefresh,
			materialization: materializationPhaseFromResult(result),
		},
	};
}

function snapshotRefreshFailureResult(input: {
	request: HistoryMaterializationCreateRequest;
	target: HistoryMaterializationTarget;
	snapshotRefresh: HistoryMaterializationSnapshotRefresh;
	now: () => Date;
}): HistoryMaterializationResult {
	const reason = input.snapshotRefresh.error ?? input.snapshotRefresh.message;
	const entry = unsupportedEntry(
		historyEntryKindForSnapshotRefresh(input.request),
		new Error(reason),
		input.target,
	);
	entry.status = "failed";
	const generatedAt = input.now().toISOString();
	return {
		object: "history_materialization_result",
		generatedAt,
		status: "skipped",
		target: input.target,
		source: sourceFromCreateRequest(input.request),
		manifestPaths: [],
		entries: [entry],
		archiveItems: [],
		snapshotRefreshes: [input.snapshotRefresh],
		metrics: summarizeEntries([entry], 1),
		phases: {
			snapshotRefresh: input.snapshotRefresh,
			materialization: null,
		},
		message: input.snapshotRefresh.message,
	};
}

function failedSnapshotRefresh(input: {
	target: HistoryMaterializationTarget;
	error: unknown;
	now: () => Date;
}): HistoryMaterializationSnapshotRefresh {
	const reason = formatHistoryMaterializationFailureReason({
		target: input.target,
		error: input.error,
	});
	return {
		object: "history_materialization_snapshot_refresh",
		generatedAt: input.now().toISOString(),
		status: "failed",
		target: input.target,
		routeabilityState: classifySnapshotRouteabilityState(reason, input.error),
		messageCount: null,
		fileCount: null,
		sourceCount: null,
		artifactCount: null,
		contextReadReceipt: conversationContextReadReceiptFromError(input.error),
		error: reason,
		message: `Conversation snapshot refresh failed for ${input.target.provider} conversation ${input.target.conversationId}: ${reason}`,
	};
}

function conversationContextReadReceiptFromError(
	error: unknown,
): ConversationContextReadReceipt | null {
	if (!error || typeof error !== "object" || !("contextReadReceipt" in error)) return null;
	const receipt = (error as { contextReadReceipt?: unknown }).contextReadReceipt;
	if (
		!receipt ||
		typeof receipt !== "object" ||
		(receipt as { object?: unknown }).object !== "conversation_context_read_receipt" ||
		(receipt as { version?: unknown }).version !== 1
	) {
		return null;
	}
	return receipt as ConversationContextReadReceipt;
}

function evidenceFromSnapshotRefresh(
	snapshotRefresh: HistoryMaterializationSnapshotRefresh,
): AccountMirrorConversationEvidence {
	const routeabilityState = conversationEvidenceRouteabilityState(
		snapshotRefresh.routeabilityState,
	);
	if (snapshotRefresh.status === "refreshed") {
		const assetCount = (snapshotRefresh.fileCount ?? 0) + (snapshotRefresh.artifactCount ?? 0);
		return {
			detailObservedAt: snapshotRefresh.generatedAt,
			manifestObservedAt: snapshotRefresh.generatedAt,
			routeabilityObservedAt: snapshotRefresh.generatedAt,
			routeabilityState,
			detailCompleteness: "complete",
			assetCompleteness: assetCount > 0 ? "unknown" : "none",
			messageCount: snapshotRefresh.messageCount,
			fileCount: snapshotRefresh.fileCount,
			sourceCount: snapshotRefresh.sourceCount,
			artifactCount: snapshotRefresh.artifactCount,
		};
	}
	return {
		routeabilityObservedAt: snapshotRefresh.generatedAt,
		routeabilityState,
		routeabilityReason: snapshotRefresh.error ?? snapshotRefresh.message,
	};
}

function evidenceFromMaterializationResult(
	result: HistoryMaterializationResult,
): AccountMirrorConversationEvidence {
	const entryCount = result.entries.length;
	const materializedCount = result.entries.filter(
		(entry) => entry.status === "materialized",
	).length;
	const duplicateAliasCount = result.entries.filter((entry) => entry.status === "duplicate").length;
	const unavailableCount = result.entries.filter(
		(entry) =>
			entry.assetAvailability === "unavailable" || entry.failureKind === "provider_unavailable",
	).length;
	const completedCount = materializedCount + duplicateAliasCount;
	const terminal = entryCount > 0 && unavailableCount === entryCount;
	const complete =
		entryCount > 0 &&
		completedCount === entryCount &&
		!(result.pendingAssetCount && result.pendingAssetCount > 0);
	const deferredRetryNotBefore =
		!terminal && !complete
			? new Date(
					Date.parse(result.generatedAt) +
						(result.target
							? getDefaultAccountMirrorPolitenessPolicy(result.target.provider)
									.failureBaseCooldownMs
							: 2 * 60_000),
				).toISOString()
			: null;
	return {
		manifestObservedAt: result.generatedAt,
		materializedAt: materializedCount > 0 ? result.generatedAt : undefined,
		assetCompleteness: complete
			? "complete"
			: result.pendingAssetCount && result.pendingAssetCount > 0
				? "partial"
				: undefined,
		frontierState: {
			action: "materialize_retained",
			outcome: terminal ? "terminal" : complete ? "complete" : "deferred",
			assetAvailability: terminal ? "unavailable" : complete ? "available" : "unknown",
			retryNotBefore: deferredRetryNotBefore,
			checkpointedAt: result.generatedAt,
			artifactResolutions: entryCount,
			downloads: result.entries.filter(
				(entry) =>
					entry.status === "materialized" && !isVerifiedCachedHistoryMaterializationEntry(entry),
			).length,
			duplicates: duplicateAliasCount,
		},
	};
}

function conversationEvidenceRouteabilityState(
	state: HistoryMaterializationSnapshotRouteabilityState,
): AccountMirrorConversationEvidence["routeabilityState"] {
	if (
		state === "routeable" ||
		state === "not_found_or_unavailable" ||
		state === "identity_mismatch" ||
		state === "guarded"
	) {
		return state;
	}
	return "unknown";
}

function classifySnapshotRouteabilityState(
	reason: string,
	error: unknown,
): HistoryMaterializationSnapshotRouteabilityState {
	if (isConversationNotFoundOrUnavailableReason(reason)) return "not_found_or_unavailable";
	if (isProviderHumanVerificationError(error) || isProviderHumanVerificationError(reason))
		return "guarded";
	if (reason.includes("account_session_drift") || reason.includes("expected_identity_missing"))
		return "identity_mismatch";
	if (isProviderAuthPreflightError(error) || isProviderAuthPreflightError(reason))
		return "auth_conflict";
	return "unknown";
}

function materializationPhaseFromResult(
	result: HistoryMaterializationResult,
): NonNullable<HistoryMaterializationPhases["materialization"]> {
	return {
		status: result.status,
		generatedAt: result.generatedAt,
		manifestPaths: result.manifestPaths,
		entries: result.entries.length,
		archiveItems: result.archiveItems.length,
		metrics: result.metrics,
	};
}

function snapshotRefreshesFromResult(
	result: HistoryMaterializationResult,
): HistoryMaterializationSnapshotRefresh[] {
	const values = [
		...(Array.isArray(result.snapshotRefreshes) ? result.snapshotRefreshes : []),
		result.phases?.snapshotRefresh ?? null,
	].filter((entry): entry is HistoryMaterializationSnapshotRefresh => Boolean(entry));
	return Array.from(
		new Map(
			values.map((entry) => [
				`${entry.generatedAt}:${entry.target?.provider ?? "unknown"}:${entry.target?.conversationId ?? "unknown"}:${entry.status}`,
				entry,
			]),
		).values(),
	);
}

function historyEntryKindForSnapshotRefresh(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationManifestEntry["kind"] {
	const selectedKinds = normalizeAssetKinds(request.assetKinds);
	if (selectedKinds.length === 1 && selectedKinds[0] === "files") return "file";
	if (selectedKinds.length === 1 && selectedKinds[0] === "media") return "media";
	return "artifact";
}

async function materializeConversationTarget(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	runArchiveService: RunArchiveService;
	target: HistoryMaterializationTarget;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	now: () => Date;
	interactionGovernor?: BrowserInteractionGovernor | null;
	contextTimeoutMs?: number;
	excludedAssetFamilySignatures?: string[];
	selectedCatalogAsset?: HistoryMaterializationSelectedCatalogAsset;
	onProviderSessionProof?: (proof: ProviderSessionProof) => void;
}): Promise<HistoryMaterializationResult> {
	const selectedKinds = normalizeAssetKinds(input.request.assetKinds);
	const maxItems = normalizeMaxItems(input.request.maxItems);
	const excludedAssetFamilySignatures = new Set(input.excludedAssetFamilySignatures ?? []);
	const excludeArtifact = (
		artifact: ConversationArtifact,
		candidates: ConversationArtifact[],
	): boolean => {
		if (
			input.selectedCatalogAsset?.kind === "artifact" &&
			!matchesHistoryMaterializationSelectedCatalogArtifact(
				artifact,
				input.selectedCatalogAsset,
				candidates,
			)
		) {
			return true;
		}
		return (["artifact", "media"] as const).some((kind) => {
			const signature = catalogManifestAssetFamilySignature(kind, artifact);
			return signature ? excludedAssetFamilySignatures.has(signature) : false;
		});
	};
	const excludeFile = (file: FileRef): boolean => {
		if (
			input.selectedCatalogAsset?.kind === "file" &&
			!matchesHistoryMaterializationSelectedCatalogFile(file, input.selectedCatalogAsset)
		) {
			return true;
		}
		const signature = catalogManifestAssetFamilySignature("file", file);
		return signature ? excludedAssetFamilySignatures.has(signature) : false;
	};
	let scrapeTelemetryProgressWrite = Promise.resolve();
	const persistScrapeTelemetryProgress = () => {
		const snapshot = snapshotBrowserScrapeTelemetry(scrapeTelemetry);
		if (!snapshot) return;
		scrapeTelemetryProgressWrite = scrapeTelemetryProgressWrite
			.then(() =>
				writeHistoryMaterializationScrapeTelemetryProgress(input.jobId, {
					generatedAt: input.now().toISOString(),
					scrapeTelemetry: snapshot,
				}),
			)
			.catch(() => undefined);
	};
	const scrapeTelemetry = createBrowserScrapeTelemetryRecorder({
		onUpdate: persistScrapeTelemetryProgress,
	});
	const llmService = createLlmService(
		input.target.provider,
		withRuntimeProfileSelection(
			input.config,
			input.target.provider,
			input.target.runtimeProfile,
		) as ResolvedUserConfig,
		{
			utilityAffinityId: historyMaterializationUtilityAffinityId(input.jobId),
			browserProcessOwner: createHistoryMaterializationBrowserProcessOwner({
				request: input.request,
				jobId: input.jobId,
				provider: input.target.provider,
				runtimeProfile: input.target.runtimeProfile,
				browserProfile: input.target.browserProfile,
				reason: "conversation-materialization",
			}),
		},
	);
	const listOptions = {
		...resolveHistoryMaterializationProviderListOptions(input.target),
		...(input.interactionGovernor ? { interactionGovernor: input.interactionGovernor } : {}),
		...createHistoryMaterializationTrafficOptions(
			input.target.conversationId,
			Math.max(1, selectedKinds.length),
		),
		scrapeTelemetry,
		useProviderSession: true,
		keepProviderSessionOpen: true,
		onProviderSessionProof: input.onProviderSessionProof,
	};
	try {
		const manifestPaths: string[] = [];
		let remaining = maxItems;
		let artifactFetch: {
			artifacts: ConversationArtifact[];
			files: FileRef[];
			manifestPath: string | null;
			pendingArtifactCount?: number;
			unavailableArtifacts: Array<{
				artifact: ConversationArtifact;
				reason: "missing_live_control";
			}>;
		} | null = null;
		let fileFetch: {
			conversationFiles: FileRef[];
			knownConversationFileCount: number;
			files: FileRef[];
			manifestPath: string | null;
		} | null = null;
		const entries: HistoryMaterializationManifestEntry[] = [];
		const archiveAssets: RunArchiveHistoryMaterializationAsset[] = [];
		const refreshMaterializationSource = input.request.refreshSnapshot !== true;

		if (selectedKinds.includes("artifacts") || selectedKinds.includes("media")) {
			if (remaining === null || remaining > 0) {
				try {
					artifactFetch = await llmService.materializeConversationArtifacts(
						input.target.conversationId,
						{
							projectId: input.target.projectId ?? undefined,
							listOptions,
							contextTimeoutMs: input.contextTimeoutMs,
							refresh: refreshMaterializationSource,
							force: input.request.force === true,
							maxItems: remaining,
							excludeArtifact,
						},
					);
					if (artifactFetch.manifestPath) manifestPaths.push(artifactFetch.manifestPath);
					const manifestEntries = await readArtifactManifestEntries(artifactFetch.manifestPath);
					entries.push(
						...(await Promise.all(
							manifestEntries.map((entry) => historyEntryFromArtifactManifest(entry)),
						)),
					);
					if (artifactFetch.artifacts.length === 0 && manifestEntries.length === 0) {
						const unavailableArtifact = artifactFetch.unavailableArtifacts[0];
						entries.push(
							unavailableArtifact
								? missingLiveControlEntry(unavailableArtifact.artifact)
								: noMaterializableEntry("artifact", input.target),
						);
					}
					for (const file of artifactFetch.files) {
						const manifestEntry = findArtifactManifestForFile(manifestEntries, file);
						archiveAssets.push({
							kind:
								selectedKinds.includes("media") && !selectedKinds.includes("artifacts")
									? "media"
									: "artifact",
							file,
							artifactId: manifestEntry?.artifactId ?? file.id,
							title: manifestEntry?.title ?? file.name,
							manifestPath: artifactFetch.manifestPath,
							materializationMethod:
								manifestEntry?.materializationMethod ??
								readRecordString(file.metadata, ["materialization", "materializationSource"]),
						});
					}
					remaining = decrementRemaining(remaining, artifactFetch.artifacts.length);
				} catch (error) {
					entries.push(unsupportedEntry("artifact", error, input.target));
				}
			}
		}

		if (selectedKinds.includes("files")) {
			if (remaining === null || remaining > 0) {
				try {
					fileFetch = await llmService.materializeConversationFiles(input.target.conversationId, {
						projectId: input.target.projectId ?? undefined,
						listOptions,
						contextTimeoutMs: input.contextTimeoutMs,
						refresh: refreshMaterializationSource,
						maxItems: remaining,
						excludeFile,
					});
					if (fileFetch.manifestPath) manifestPaths.push(fileFetch.manifestPath);
					const manifestEntries = await readFileManifestEntries(fileFetch.manifestPath);
					entries.push(
						...(await Promise.all(
							manifestEntries.map((entry) => historyEntryFromFileManifest(entry)),
						)),
					);
					if (fileFetch.conversationFiles.length === 0 && manifestEntries.length === 0) {
						entries.push(
							fileFetch.knownConversationFileCount > 0
								? excludedKnownFilesEntry(input.target, fileFetch.knownConversationFileCount)
								: noMaterializableEntry("file", input.target),
						);
					}
					for (const file of fileFetch.files) {
						const manifestEntry = findFileManifestForFile(manifestEntries, file);
						archiveAssets.push({
							kind: "file",
							file,
							artifactId: manifestEntry?.fileId ?? file.id,
							title: manifestEntry?.fileName ?? file.name,
							manifestPath: fileFetch.manifestPath,
							materializationMethod:
								manifestEntry?.materializationMethod ??
								readRecordString(file.metadata, ["materialization", "materializationSource"]),
						});
					}
				} catch (error) {
					entries.push(unsupportedEntry("file", error, input.target));
				}
			}
		}

		if (archiveAssets.length > 0 && !input.runArchiveService.upsertHistoryMaterializationItems) {
			throw new Error("History materialization archive upsert is not configured.");
		}
		const archiveItems =
			archiveAssets.length > 0
				? ((
						await input.runArchiveService.upsertHistoryMaterializationItems?.({
							provider: input.target.provider,
							runtimeProfile: input.target.runtimeProfile,
							browserProfile: input.target.browserProfile,
							projectId: input.target.projectId,
							boundIdentityKey: input.target.boundIdentityKey,
							providerConversationId: input.target.conversationId,
							providerConversationUrl: input.target.providerConversationUrl,
							materializationJobId: input.jobId,
							assets: archiveAssets,
						})
					)?.items ?? [])
				: [];
		applyArchiveLinks(entries, archiveItems);
		applyRecoverabilityStates(entries);
		const generatedAt = input.now().toISOString();
		const metrics = summarizeEntries(entries, 1);
		return {
			object: "history_materialization_result",
			generatedAt,
			status: resolveHistoryMaterializationResultStatus(metrics),
			target: input.target,
			source: sourceFromCreateRequest(input.request),
			manifestPaths,
			entries,
			archiveItems,
			scrapeTelemetry: snapshotBrowserScrapeTelemetry(scrapeTelemetry),
			pendingAssetCount: artifactFetch?.pendingArtifactCount ?? 0,
			metrics,
			message:
				metrics.materialized > 0
					? `History materialization downloaded ${metrics.materialized} asset${metrics.materialized === 1 ? "" : "s"} for conversation ${input.target.conversationId}.`
					: metrics.failed > 0
						? `History materialization failed to download ${metrics.failed} asset${metrics.failed === 1 ? "" : "s"} for conversation ${input.target.conversationId}.`
						: `History materialization found no downloadable assets for conversation ${input.target.conversationId}.`,
		};
	} finally {
		await listOptions.providerSession?.close();
		await scrapeTelemetryProgressWrite;
	}
}

export function classifyHistoryMaterializationEntryRecoverability(
	entry: HistoryMaterializationManifestEntry,
): HistoryMaterializationRecoverabilityState {
	if (
		(entry.status === "materialized" || entry.status === "duplicate") &&
		Boolean(entry.localPath || entry.checksumSha256 || entry.assetRoute)
	) {
		return "materialized";
	}
	if (entry.reason === "missing_live_control") {
		return "repair_prompt_candidate";
	}
	if (entry.assetAvailability === "unavailable" || entry.failureKind === "provider_unavailable") {
		return "terminally_unavailable";
	}
	if (
		(entry.failureKind === "retrieval_failed" && entry.retryable === true) ||
		entry.retryable === true ||
		(entry.status !== "failed" && Boolean(entry.remoteUrl && entry.providerId))
	) {
		return "downloadable_now";
	}
	return "metadata_only";
}

function applyRecoverabilityStates(entries: HistoryMaterializationManifestEntry[]): void {
	for (const entry of entries) {
		entry.recoverabilityState = classifyHistoryMaterializationEntryRecoverability(entry);
	}
}

function normalizeCreateRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationCreateRequest {
	const provider = normalizeProviderId(request.provider) ?? null;
	const normalized: HistoryMaterializationCreateRequest = {
		provider,
		runtimeProfile: normalizeOptionalString(request.runtimeProfile),
		browserProfile: normalizeOptionalString(request.browserProfile),
		boundIdentityKey: normalizeOptionalString(request.boundIdentityKey),
		conversationId: normalizeOptionalString(request.conversationId),
		conversationIds: normalizeConversationIds(request.conversationIds),
		providerConversationUrl: normalizeOptionalString(request.providerConversationUrl),
		projectId: normalizeOptionalString(request.projectId),
		catalogItemId: normalizeOptionalString(request.catalogItemId),
		catalogKind: normalizeCatalogKind(request.catalogKind),
		archiveItemId: normalizeOptionalString(request.archiveItemId),
		reconcile: request.reconcile === true,
		assetSource: normalizeAssetSource(request.assetSource),
		refreshSnapshot: request.refreshSnapshot === true,
		reuseSnapshotAfter: normalizeOptionalString(request.reuseSnapshotAfter),
		reuseSnapshotConversationIds: normalizeConversationIds(request.reuseSnapshotConversationIds),
		providerWorkNotBefore: normalizeOptionalString(request.providerWorkNotBefore),
		interactionPolicy: normalizeHistoryMaterializationInteractionPolicy(request.interactionPolicy),
		assetKinds: normalizeRequestedAssetKinds(request.assetKinds),
		maxItems: normalizeMaxItems(request.maxItems),
		providerWorkTimeoutMs: normalizeProviderWorkTimeoutMs(request.providerWorkTimeoutMs),
		force: request.force === true,
	};
	if (normalized.conversationId && !normalized.provider) {
		throw new HistoryMaterializationError("Provider is required when conversationId is provided.");
	}
	if (normalized.provider === "gemini" && normalized.conversationId) {
		const targetFields = normalizeProviderConversationTargetFields(
			normalized.provider,
			normalized.conversationId,
			normalized.providerConversationUrl,
		);
		if (!targetFields) {
			throw new HistoryMaterializationError(
				"Gemini conversation materialization requires a canonical gemini.google.com/app/<conversation-id> target.",
			);
		}
		normalized.conversationId = targetFields.conversationId;
		normalized.providerConversationUrl = targetFields.providerConversationUrl;
	}
	if (normalized.conversationIds && normalized.conversationIds.length > 0 && !normalized.provider) {
		throw new HistoryMaterializationError(
			"Provider is required when conversationIds are provided.",
		);
	}
	if (
		normalized.provider === "gemini" &&
		normalized.conversationIds &&
		normalized.conversationIds.length > 0
	) {
		const normalizedConversationIds = normalized.conversationIds
			.map((conversationId) => normalizeGeminiConversationId(conversationId))
			.filter((conversationId): conversationId is string => Boolean(conversationId));
		if (normalizedConversationIds.length !== normalized.conversationIds.length) {
			throw new HistoryMaterializationError(
				"Gemini selected conversation batches require canonical conversation ids.",
			);
		}
		normalized.conversationIds = Array.from(new Set(normalizedConversationIds));
	}
	if (
		normalized.conversationIds &&
		normalized.conversationIds.length > 0 &&
		(normalized.conversationId || normalized.catalogItemId || normalized.archiveItemId)
	) {
		throw new HistoryMaterializationError(
			"Use conversationIds for a selected batch without conversationId, catalogItemId, or archiveItemId.",
		);
	}
	if (normalized.assetSource === "account-library") {
		if (normalized.reconcile !== true) {
			throw new HistoryMaterializationError(
				"Account-library source is only supported with reconcile=true.",
			);
		}
		if (normalized.provider !== "chatgpt") {
			throw new HistoryMaterializationError(
				"Account-library reconciliation requires provider=chatgpt.",
			);
		}
		if ((normalized.conversationIds?.length ?? 0) > 0 || normalized.conversationId) {
			throw new HistoryMaterializationError(
				"Account-library reconciliation cannot be combined with conversation ids.",
			);
		}
		normalized.assetKinds = ["files"];
	}
	if (
		normalized.provider &&
		normalized.projectId &&
		!normalized.conversationId &&
		(!normalized.conversationIds || normalized.conversationIds.length === 0) &&
		!normalized.catalogItemId &&
		!normalized.archiveItemId &&
		normalized.reconcile !== true
	) {
		const selectedKinds = normalizeAssetKinds(normalized.assetKinds);
		if (selectedKinds.some((kind) => kind !== "files")) {
			throw new HistoryMaterializationError(
				"Project source materialization currently supports assetKinds=[files] only.",
			);
		}
		normalized.assetKinds = ["files"];
	}
	if (
		!normalized.conversationId &&
		!normalized.projectId &&
		(!normalized.conversationIds || normalized.conversationIds.length === 0) &&
		!normalized.catalogItemId &&
		!normalized.archiveItemId &&
		normalized.reconcile !== true
	) {
		throw new HistoryMaterializationError(
			"Provide conversationId, projectId, conversationIds, catalogItemId, archiveItemId, or reconcile=true.",
		);
	}
	return normalized;
}

function sourceFromCreateRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationJob["source"] {
	if (request.archiveItemId) return { type: "archive_item", archiveItemId: request.archiveItemId };
	if (request.catalogItemId) {
		return {
			type: "catalog_item",
			catalogItemId: request.catalogItemId,
			catalogKind: request.catalogKind ?? null,
		};
	}
	if (request.conversationIds && request.conversationIds.length > 0) {
		return { type: "reconciliation", provider: request.provider ?? null };
	}
	if (request.provider && request.projectId && !request.conversationId) {
		return { type: "project_sources", provider: request.provider, projectId: request.projectId };
	}
	if (request.reconcile === true && request.assetSource === "account-library")
		return { type: "account_library_reconciliation", provider: request.provider ?? null };
	if (request.reconcile === true)
		return { type: "reconciliation", provider: request.provider ?? null };
	if (request.provider && request.conversationId) {
		return {
			type: "conversation",
			provider: request.provider,
			conversationId: request.conversationId,
		};
	}
	throw new HistoryMaterializationError("History materialization source is incomplete.");
}

function projectSourcesTargetFromRequest(
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationTarget {
	const provider = request.provider;
	const projectId = request.projectId;
	if (!provider || !projectId) {
		throw new HistoryMaterializationError("Project source target requires provider and projectId.");
	}
	return {
		provider,
		runtimeProfile: request.runtimeProfile ?? null,
		browserProfile: request.browserProfile ?? null,
		boundIdentityKey: request.boundIdentityKey ?? null,
		conversationId: `project:${projectId}`,
		providerConversationUrl: resolveProviderProjectUrl(provider, projectId),
		projectId,
	};
}

function sourceKeyFromCreateRequest(request: HistoryMaterializationCreateRequest): string {
	return stableKey({
		source: sourceFromCreateRequest(request),
		provider: request.provider ?? null,
		runtimeProfile: request.runtimeProfile ?? null,
		browserProfile: request.browserProfile ?? null,
		conversationIds: request.conversationIds ?? null,
		providerConversationUrl: request.providerConversationUrl ?? null,
		projectId: request.projectId ?? null,
		boundIdentityKey: request.boundIdentityKey ?? null,
		assetSource: request.assetSource ?? null,
		refreshSnapshot: request.refreshSnapshot === true,
		assetKinds: request.assetKinds ?? null,
		maxItems: request.maxItems ?? null,
		providerWorkTimeoutMs: request.providerWorkTimeoutMs ?? null,
		force: request.force === true,
	});
}

function createHistoryMaterializationBrowserProcessOwner(input: {
	request: HistoryMaterializationCreateRequest;
	jobId?: string | null;
	provider: ProviderId | null;
	runtimeProfile: string | null;
	browserProfile: string | null;
	reason: string;
}): BrowserProcessOwnerAttribution | undefined {
	if (!input.jobId) return undefined;
	const acquiredAt = new Date().toISOString();
	const source = sourceFromCreateRequest(input.request);
	const operation = {
		kind: "history_materialization_job",
		id: input.jobId,
		provider: input.provider ?? null,
		runtimeProfileId: input.runtimeProfile ?? null,
		browserProfileId: input.browserProfile ?? null,
		sourceType: source.type,
		sourceKey: sourceKeyFromCreateRequest(input.request),
		reason: input.reason,
	};
	return {
		owner: {
			...operation,
			acquiredAt,
			heartbeatAt: acquiredAt,
		},
		operation,
		lease: {
			id: `${operation.kind}:${input.jobId}:${input.provider ?? "unknown"}:${input.runtimeProfile ?? "default"}`,
			ownerId: input.jobId,
			acquiredAt,
			heartbeatAt: acquiredAt,
			expiresAt: null,
			cleanupPolicy: "history-materialization-provider-work",
		},
	};
}

function targetFromArchiveItem(item: RunArchiveItem): HistoryMaterializationTarget | null {
	const provider = normalizeProviderId(item.provider);
	if (!provider || !item.providerConversationId) return null;
	return {
		provider,
		runtimeProfile: item.runtimeProfile,
		browserProfile: item.browserProfile,
		boundIdentityKey: item.boundIdentityKey,
		conversationId: item.providerConversationId,
		providerConversationUrl:
			item.providerConversationUrl ??
			resolveProviderConversationUrl(provider, item.providerConversationId),
		projectId: item.projectId,
	};
}

function archiveItemLooksLikeMediaGeneration(
	item: RunArchiveItem,
	request: HistoryMaterializationCreateRequest,
): boolean {
	if (item.kind !== "generated_artifact" || !item.mediaGenerationId) return false;
	if (!normalizeProviderId(item.provider)) return false;
	if (
		Array.isArray(request.assetKinds) &&
		request.assetKinds.length > 0 &&
		!normalizeAssetKinds(request.assetKinds).includes("media")
	) {
		return false;
	}
	return Boolean(
		normalizeMediaGenerationType(
			readRecordString(item.metadata, ["mediaType"]) ??
				item.mimeType ??
				item.fileName ??
				item.title,
		),
	);
}

function targetFromCatalogItem(
	detail: AccountMirrorCatalogItemResult,
	request: HistoryMaterializationCreateRequest,
): HistoryMaterializationTarget | null {
	const item = isRecord(detail.item) ? detail.item : {};
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const provider = normalizeProviderId(detail.provider);
	const conversationId =
		readCatalogStringField(item, ["conversationId"]) ??
		readRecordString(metadata, ["conversationId"]) ??
		(detail.kind === "conversations" ? detail.itemId : null);
	if (!provider || !conversationId) return null;
	const providerConversationUrl =
		request.providerConversationUrl ??
		readCatalogStringField(item, ["url", "href", "providerConversationUrl"]) ??
		readRecordString(metadata, ["url", "href", "providerConversationUrl"]) ??
		resolveProviderConversationUrl(provider, conversationId);
	const targetFields = normalizeProviderConversationTargetFields(
		provider,
		conversationId,
		providerConversationUrl,
	);
	if (!targetFields) return null;
	return {
		provider,
		runtimeProfile: detail.runtimeProfileId,
		browserProfile: detail.browserProfileId,
		boundIdentityKey: detail.boundIdentityKey,
		conversationId: targetFields.conversationId,
		providerConversationUrl: targetFields.providerConversationUrl,
		projectId:
			request.projectId ??
			readCatalogStringField(item, ["projectId"]) ??
			readRecordString(metadata, ["projectId"]),
	};
}

function selectedCatalogAssetFromCatalogItem(
	detail: AccountMirrorCatalogItemResult,
): HistoryMaterializationSelectedCatalogAsset | null {
	const item = isRecord(detail.item) ? detail.item : null;
	if (!item) return null;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	if (detail.kind === "files") {
		const id = readCatalogStringField(item, ["id", "fileId"]) ?? detail.itemId;
		const name =
			readCatalogStringField(item, ["name", "fileName", "title"]) ??
			readRecordString(metadata, ["name", "fileName", "title"]);
		const providerFileId =
			readCatalogStringField(item, ["providerFileId"]) ??
			readRecordString(metadata, ["providerFileId", "fileId"]);
		if (!id && !name && !providerFileId) return null;
		return { kind: "file", id, name, providerFileId };
	}
	if (detail.kind !== "artifacts" && detail.kind !== "media") return null;
	const catalogItemId = detail.itemId === "unknown" ? null : detail.itemId;
	const title =
		readCatalogStringField(item, ["title", "name", "fileName"]) ??
		readRecordString(metadata, ["title", "name", "fileName"]);
	const uri =
		readCatalogStringField(item, ["uri", "url", "href", "remoteUrl"]) ??
		readRecordString(metadata, ["uri", "url", "href", "remoteUrl"]);
	const directId = readCatalogStringField(item, ["artifactId", "id", "mediaId"]);
	const id = directId ?? (uri ? null : catalogItemId);
	const artifactKind = normalizeConversationArtifactKind(
		readCatalogStringField(item, ["kind", "artifactKind"]) ??
			readRecordString(metadata, ["kind", "artifactKind"]),
	);
	const messageId =
		readCatalogStringField(item, ["messageId"]) ?? readRecordString(metadata, ["messageId"]);
	const turnId = readCatalogStringField(item, ["turnId"]) ?? readRecordString(metadata, ["turnId"]);
	if (!id && !title && !uri && !messageId && !turnId) return null;
	return { kind: "artifact", id, title, uri, artifactKind, messageId, turnId };
}

export function matchesHistoryMaterializationSelectedCatalogFile(
	file: FileRef,
	selector: Extract<HistoryMaterializationSelectedCatalogAsset, { kind: "file" }>,
): boolean {
	const metadata = isRecord(file.metadata) ? file.metadata : null;
	const selectedIds = new Set(
		[selector.id, selector.providerFileId].filter((value): value is string => Boolean(value)),
	);
	const candidateIds = new Set(
		[
			file.id,
			readRecordString(metadata, ["providerFileId", "fileId"]),
			readChatgptProviderFileId(file.remoteUrl),
		].filter((value): value is string => Boolean(value)),
	);
	if (selectedIds.size > 0 && candidateIds.size > 0) {
		return Array.from(selectedIds).some((id) => candidateIds.has(id));
	}
	return Boolean(
		selector.name &&
			normalizeAssetFamilyTitle(selector.name) === normalizeAssetFamilyTitle(file.name),
	);
}

export function matchesHistoryMaterializationSelectedCatalogArtifact(
	artifact: ConversationArtifact,
	selector: Extract<HistoryMaterializationSelectedCatalogAsset, { kind: "artifact" }>,
	candidates: ConversationArtifact[],
): boolean {
	if (selector.id) return artifact.id === selector.id;
	if (selector.uri) return artifact.uri === selector.uri;
	if (selector.messageId || selector.turnId) {
		const sourceMatches = candidates.filter((candidate) => {
			const candidateMetadata = isRecord(candidate.metadata) ? candidate.metadata : null;
			const candidateMessageId =
				candidate.messageId ?? readRecordString(candidateMetadata, ["messageId"]);
			const candidateTurnId = readRecordString(candidateMetadata, ["turnId"]);
			return (
				(!selector.messageId || candidateMessageId === selector.messageId) &&
				(!selector.turnId || candidateTurnId === selector.turnId) &&
				(!selector.title ||
					normalizeAssetFamilyTitle(candidate.title) ===
						normalizeAssetFamilyTitle(selector.title)) &&
				(!selector.artifactKind || candidate.kind === selector.artifactKind)
			);
		});
		return sourceMatches.length === 1 && sourceMatches[0] === artifact;
	}
	if (!selector.title) return false;
	const normalizedTitle = normalizeAssetFamilyTitle(selector.title);
	const titleMatches = candidates.filter(
		(candidate) =>
			normalizeAssetFamilyTitle(candidate.title) === normalizedTitle &&
			(!selector.artifactKind || candidate.kind === selector.artifactKind),
	);
	return titleMatches.length === 1 && titleMatches[0] === artifact;
}

function normalizeConversationArtifactKind(
	value: string | null,
): ConversationArtifact["kind"] | null {
	if (
		value === "document" ||
		value === "download" ||
		value === "canvas" ||
		value === "generated" ||
		value === "image" ||
		value === "spreadsheet"
	) {
		return value;
	}
	return null;
}

function readChatgptProviderFileId(value: string | null | undefined): string | null {
	if (!value?.startsWith("chatgpt://file/")) return null;
	const encoded = value.slice("chatgpt://file/".length).trim();
	if (!encoded) return null;
	try {
		return decodeURIComponent(encoded);
	} catch {
		return encoded;
	}
}

function accountLibraryFileRefFromCatalogItem(
	detail: AccountMirrorCatalogItemResult,
): FileRef | null {
	if (detail.kind !== "files") return null;
	if (detail.provider !== "chatgpt") return null;
	const item = isRecord(detail.item) ? detail.item : null;
	if (!item) return null;
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const source = readRecordString(metadata, ["source"]) ?? readCatalogStringField(item, ["source"]);
	if (source !== "chatgpt-library") return null;
	const id =
		readCatalogStringField(item, ["id", "fileId", "providerFileId"]) ??
		readRecordString(metadata, ["fileId", "providerFileId", "libraryIdentity"]);
	const name =
		readCatalogStringField(item, ["name", "fileName", "title"]) ??
		readRecordString(metadata, ["name", "fileName", "title"]);
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		readCatalogStringField(item, ["providerFileId"]);
	const remoteUrl =
		readCatalogStringField(item, ["remoteUrl", "uri", "url", "href"]) ??
		readRecordString(metadata, ["remoteUrl", "uri", "url", "href"]) ??
		(providerFileId ? `chatgpt://file/${encodeURIComponent(providerFileId)}` : null);
	if (!id || !name) return null;
	if (remoteUrl && !remoteUrl.startsWith("chatgpt://file/")) return null;
	return {
		id,
		name,
		provider: "chatgpt",
		source: "account",
		...(remoteUrl ? { remoteUrl } : {}),
		mimeType:
			readCatalogStringField(item, ["mimeType"]) ??
			readRecordString(metadata, ["mimeType"]) ??
			undefined,
		size: readNumber(item.size) ?? readNumber(metadata.size) ?? undefined,
		metadata: {
			...metadata,
			source: "chatgpt-library",
			...(providerFileId ? { providerFileId } : {}),
			materializationSurface:
				readRecordString(metadata, ["materializationSurface"]) ?? "chatgpt-library-file-row-click",
			accountLibraryCatalogItemId: detail.itemId,
		},
	};
}

function accountLibraryFileRefFromCatalogEntry(
	entry: AccountMirrorCatalogEntry,
	item: unknown,
): FileRef | null {
	const itemId = readCatalogItemId(item);
	if (!itemId) return null;
	return accountLibraryFileRefFromCatalogItem({
		object: "account_mirror_catalog_item",
		generatedAt: new Date(0).toISOString(),
		provider: entry.provider,
		tenantKey: entry.tenantKey,
		bindingKey: entry.bindingKey,
		runtimeProfileId: entry.runtimeProfileId,
		browserProfileId: entry.browserProfileId,
		boundIdentityKey: entry.boundIdentityKey,
		status: entry.status,
		reason: entry.reason,
		kind: "files",
		itemId,
		item,
	});
}

function readCatalogItemId(item: unknown): string | null {
	return readCatalogStringField(item, ["id", "itemId", "fileId", "providerFileId", "artifactId"]);
}

function defaultAssetKindsForCatalogKind(
	kind: Exclude<AccountMirrorCatalogKind, "all">,
): HistoryMaterializationAssetKind[] {
	if (kind === "files") return ["files"];
	if (kind === "media") return ["media"];
	if (kind === "artifacts") return ["artifacts"];
	return ["artifacts", "files"];
}

type CatalogConversationPreEligibilityExclusion =
	| "ignoredProviderRoute"
	| "terminalConversationEvidence"
	| "ineligibleSelectedManifest"
	| "noSelectedAssetEvidence"
	| "assetsAlreadyComplete";

function createHistoryMaterializationCandidateFunnel(): HistoryMaterializationCandidateFunnel {
	return {
		unit: "conversation",
		discovered: 0,
		preEligibilityExclusions: {
			identityMismatch: 0,
			missingConversationId: 0,
			ignoredProviderRoute: 0,
			terminalConversationEvidence: 0,
			ineligibleSelectedManifest: 0,
			noSelectedAssetEvidence: 0,
			assetsAlreadyComplete: 0,
			missingTarget: 0,
			terminalAssetFamilies: 0,
		},
		eligible: 0,
		postEligibilityExclusions: {
			duplicateAssetFamilies: 0,
			targetBudget: 0,
			assetBudget: 0,
			providerGuard: 0,
		},
		selected: 0,
	};
}

function classifyCatalogConversationMaterialization(
	item: unknown,
	selectedKinds: HistoryMaterializationAssetKind[] = ["artifacts", "files"],
	manifestEvidence: {
		provider: ProviderId;
		conversationId: string;
		manifests: AccountMirrorCatalogEntry["manifests"];
	},
	options: {
		force?: boolean;
		refreshSnapshot?: boolean;
	} = {},
): {
	priority: number | null;
	exclusionReason: CatalogConversationPreEligibilityExclusion | null;
} {
	const record = isRecord(item) ? item : {};
	const metadata = isRecord(record.metadata) ? record.metadata : {};
	if (
		catalogConversationHasIgnoredProviderRoute(
			manifestEvidence.provider,
			manifestEvidence.conversationId,
			record,
			metadata,
		)
	) {
		return { priority: null, exclusionReason: "ignoredProviderRoute" };
	}
	if (!options.force && catalogConversationHasTerminalEvidence(record, metadata)) {
		return { priority: null, exclusionReason: "terminalConversationEvidence" };
	}
	if (options.force && options.refreshSnapshot) {
		return { priority: 0, exclusionReason: null };
	}
	const freshnessState =
		readConversationFreshnessString(record, metadata, "state") ??
		readCatalogStringField(record, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	const manifestCounts = countEligibleManifestAssetsForConversation(
		manifestEvidence.manifests,
		manifestEvidence.conversationId,
		manifestEvidence.provider,
	);
	const rawManifestCounts = countManifestAssetsForConversation(
		manifestEvidence.manifests,
		manifestEvidence.conversationId,
	);
	const rowArtifactCount = maxKnownCount([
		record.cachedArtifactCount,
		record.artifactCount,
		metadata.artifactCount,
	]);
	const artifactCount = Math.max(rowArtifactCount, manifestCounts.artifacts);
	const fileCount = maxKnownCount([
		record.cachedFileCount,
		record.fileCount,
		metadata.fileCount,
		manifestCounts.files,
	]);
	const rowMediaCount = maxKnownCount([
		record.cachedMediaCount,
		record.mediaCount,
		metadata.mediaCount,
	]);
	const mediaCount = Math.max(rowMediaCount, manifestCounts.media);
	const assetCounts = readConversationFreshnessRecord(record, metadata, "assetCounts");
	const freshnessKnownCount = readNumber(readRecordValue(assetCounts, ["known"])) ?? 0;
	const freshnessMissingLocalCount =
		readNumber(readRecordValue(assetCounts, ["missingLocal"])) ?? 0;
	const assetCompleteness =
		readConversationFreshnessString(record, metadata, "assetCompleteness") ??
		readCatalogStringField(record, ["assetCompleteness"]) ??
		readRecordString(metadata, ["assetCompleteness"]);
	const hasFreshnessAssetEvidence = freshnessKnownCount > 0 || freshnessMissingLocalCount > 0;
	const mediaOnly = selectedKinds.length === 1 && selectedKinds[0] === "media";
	const refreshOnlyCandidate =
		options.refreshSnapshot === true &&
		(freshnessState === "stale" ||
			freshnessState === "partial" ||
			freshnessState === "missing_assets");
	const selectedRawManifestCount =
		(selectedKinds.includes("artifacts") ? rawManifestCounts.artifacts : 0) +
		(selectedKinds.includes("files") ? rawManifestCounts.files : 0) +
		(selectedKinds.includes("media") ? rawManifestCounts.media : 0);
	const selectedEligibleManifestCount =
		(selectedKinds.includes("artifacts") ? manifestCounts.artifacts : 0) +
		(selectedKinds.includes("files") ? manifestCounts.files : 0) +
		(selectedKinds.includes("media") ? manifestCounts.media : 0);
	if (selectedRawManifestCount > 0 && selectedEligibleManifestCount === 0) {
		return { priority: null, exclusionReason: "ineligibleSelectedManifest" };
	}
	const hasSelectedAssets =
		(selectedKinds.includes("artifacts") && artifactCount > 0) ||
		(selectedKinds.includes("files") && fileCount > 0) ||
		(selectedKinds.includes("media") &&
			(mediaOnly
				? rowMediaCount > 0 || rowArtifactCount > 0
				: mediaCount > 0 || artifactCount > 0)) ||
		hasFreshnessAssetEvidence;
	if (!hasSelectedAssets) {
		return refreshOnlyCandidate
			? { priority: 2, exclusionReason: null }
			: { priority: null, exclusionReason: "noSelectedAssetEvidence" };
	}
	if (
		!options.force &&
		catalogConversationAssetsAlreadyComplete(record, metadata, freshnessState)
	) {
		return { priority: null, exclusionReason: "assetsAlreadyComplete" };
	}
	const hasMissingLocalAssetEvidence =
		freshnessMissingLocalCount > 0 ||
		(assetCompleteness === "partial" && hasFreshnessAssetEvidence) ||
		(freshnessState === "missing_assets" && hasFreshnessAssetEvidence);
	if (hasMissingLocalAssetEvidence) return { priority: 0, exclusionReason: null };
	return { priority: 1, exclusionReason: null };
}

function catalogConversationHasIgnoredProviderRoute(
	provider: ProviderId,
	conversationId: string,
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
): boolean {
	if (provider !== "gemini") return false;
	if (isIgnoredGeminiConversationId(conversationId)) return true;
	const url =
		readCatalogStringField(record, ["url", "href", "providerConversationUrl"]) ??
		readRecordString(metadata, ["url", "href", "providerConversationUrl"]);
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "gemini.google.com" && isIgnoredGeminiConversationPath(parsed.pathname)
		);
	} catch {
		return false;
	}
}

function isIgnoredGeminiConversationPath(pathname: string): boolean {
	const match = pathname.match(/^\/app\/([^/?#]+)$/i);
	return Boolean(match?.[1] && isIgnoredGeminiConversationId(match[1]));
}

function isIgnoredGeminiConversationId(conversationId: string): boolean {
	return conversationId.toLowerCase() === "download";
}

function catalogConversationHasTerminalEvidence(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
): boolean {
	const freshnessState =
		readConversationFreshnessString(record, metadata, "state") ??
		readCatalogStringField(record, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	const routeabilityState =
		readConversationFreshnessString(record, metadata, "routeabilityState") ??
		readCatalogStringField(record, ["routeabilityState"]) ??
		readRecordString(metadata, ["routeabilityState"]);
	return (
		freshnessState === "terminal_unavailable" ||
		freshnessState === "guarded" ||
		routeabilityState === "not_found_or_unavailable" ||
		routeabilityState === "identity_mismatch" ||
		routeabilityState === "guarded"
	);
}

function catalogConversationAssetsAlreadyComplete(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	freshnessState: string | null,
): boolean {
	if (freshnessState && freshnessState !== "fresh" && freshnessState !== "unknown") {
		return false;
	}
	const assetCompleteness =
		readConversationFreshnessString(record, metadata, "assetCompleteness") ??
		readCatalogStringField(record, ["assetCompleteness"]) ??
		readRecordString(metadata, ["assetCompleteness"]);
	if (assetCompleteness !== "complete") return false;
	const assetCounts = readConversationFreshnessRecord(record, metadata, "assetCounts");
	const missingLocal = readNumber(readRecordValue(assetCounts, ["missingLocal"]));
	return missingLocal === null || missingLocal <= 0;
}

function catalogConversationHasCompleteSelectedAssets(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : {};
	const freshnessState =
		readConversationFreshnessString(item, metadata, "state") ??
		readCatalogStringField(item, ["freshnessState"]) ??
		readRecordString(metadata, ["freshnessState"]);
	return catalogConversationAssetsAlreadyComplete(item, metadata, freshnessState);
}

function readConversationFreshnessString(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	field: string,
): string | null {
	const freshness = readConversationFreshnessRecord(record, metadata);
	return readRecordString(freshness, [field]) ?? readRecordString(metadata, [field]);
}

function readConversationFreshnessRecord(
	record: Record<string, unknown>,
	metadata: Record<string, unknown>,
	field?: string,
): Record<string, unknown> | null {
	const direct = readRecordValue(record, ["conversationFreshness", "freshness"]);
	const nested = isRecord(direct)
		? direct
		: readRecordValue(metadata, ["conversationFreshness", "freshness"]);
	if (!field) return isRecord(nested) ? nested : null;
	const value = readRecordValue(nested, [field]);
	return isRecord(value) ? value : null;
}

function countManifestAssetsForConversation(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
): { artifacts: number; files: number; media: number } {
	return {
		artifacts: manifests.artifacts.filter((item) =>
			manifestItemBelongsToConversation(item, conversationId),
		).length,
		files: manifests.files.filter((item) => manifestItemBelongsToConversation(item, conversationId))
			.length,
		media: manifests.media.filter((item) => manifestItemBelongsToConversation(item, conversationId))
			.length,
	};
}

function countEligibleManifestAssetsForConversation(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
	provider: ProviderId,
): { artifacts: number; files: number; media: number } {
	return {
		artifacts: manifests.artifacts.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("artifact", item, provider),
		).length,
		files: manifests.files.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("file", item, provider),
		).length,
		media: manifests.media.filter(
			(item) =>
				manifestItemBelongsToConversation(item, conversationId) &&
				catalogManifestAssetIsEligibleForMaterialization("media", item, provider),
		).length,
	};
}

function catalogConversationAssetFamilySignatures(
	manifests: AccountMirrorCatalogEntry["manifests"],
	conversationId: string,
	selectedKinds: HistoryMaterializationAssetKind[],
	provider: ProviderId,
): string[] {
	const signatures = new Set<string>();
	if (selectedKinds.includes("artifacts") || selectedKinds.includes("media")) {
		for (const item of manifests.artifacts) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("artifact", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("artifact", item);
			if (signature) signatures.add(signature);
		}
	}
	if (selectedKinds.includes("files")) {
		for (const item of manifests.files) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("file", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("file", item);
			if (signature) signatures.add(signature);
		}
	}
	if (selectedKinds.includes("media")) {
		for (const item of manifests.media) {
			if (!manifestItemBelongsToConversation(item, conversationId)) continue;
			if (!catalogManifestAssetIsEligibleForMaterialization("media", item, provider)) continue;
			const signature = catalogManifestAssetFamilySignature("media", item);
			if (signature) signatures.add(signature);
		}
	}
	return Array.from(signatures);
}

function catalogEntriesConversationAssetFamilySignatures(
	entries: AccountMirrorCatalogEntry[],
	conversationId: string,
	selectedKinds: HistoryMaterializationAssetKind[],
	provider: ProviderId,
	boundIdentityKey: string | null,
): string[] {
	const signatures = new Set<string>();
	for (const entry of entries) {
		if (entry.provider !== provider) continue;
		if (!catalogEntryMatchesBoundIdentity(entry, boundIdentityKey)) continue;
		for (const signature of catalogConversationAssetFamilySignatures(
			entry.manifests,
			conversationId,
			selectedKinds,
			provider,
		)) {
			signatures.add(signature);
		}
		for (const item of entry.manifests.conversations) {
			const itemConversationId = readCatalogStringField(item, ["id", "conversationId"]);
			if (itemConversationId !== conversationId) continue;
			for (const signature of catalogConversationItemAssetFamilySignatures(
				item,
				selectedKinds,
				provider,
			)) {
				signatures.add(signature);
			}
		}
	}
	return Array.from(signatures);
}

function catalogEntryMatchesBoundIdentity(
	entry: AccountMirrorCatalogEntry,
	boundIdentityKey: string | null | undefined,
): boolean {
	if (!boundIdentityKey) return true;
	return accountMirrorIdentityKeysMatch({
		provider: entry.provider,
		expectedIdentityKey: boundIdentityKey,
		detectedIdentityKey: entry.boundIdentityKey,
	});
}

function catalogConversationItemAssetFamilySignatures(
	item: unknown,
	selectedKinds: HistoryMaterializationAssetKind[],
	provider: ProviderId,
): string[] {
	if (!isRecord(item)) return [];
	const signatures = new Set<string>();
	const collect = (kind: "artifact" | "file" | "media", values: unknown): void => {
		if (!Array.isArray(values)) return;
		for (const value of values) {
			if (!catalogManifestAssetIsEligibleForMaterialization(kind, value, provider)) continue;
			const signature = catalogManifestAssetFamilySignature(kind, value);
			if (signature) signatures.add(signature);
		}
	};
	if (selectedKinds.includes("artifacts") || selectedKinds.includes("media")) {
		collect("artifact", item.artifacts);
	}
	if (selectedKinds.includes("files")) collect("file", item.files);
	if (selectedKinds.includes("media")) collect("media", item.media);
	return Array.from(signatures);
}

interface ScopedArchiveReuse {
	item: RunArchiveItem;
	signature: string;
	entry: HistoryMaterializationManifestEntry;
}

interface ScopedTerminalEvidence {
	conversationId: string;
	signatures: string[];
	entry: HistoryMaterializationManifestEntry;
}

function readScopedTerminalEvidence(input: {
	jobs: HistoryMaterializationJob[];
	targets: Map<string, HistoryMaterializationTarget>;
	families: Map<string, string[]>;
	selectedKinds: HistoryMaterializationAssetKind[];
	reusedArchiveAssets: ScopedArchiveReuse[];
}): ScopedTerminalEvidence[] {
	const evidence: ScopedTerminalEvidence[] = [];
	const seen = new Set(
		input.reusedArchiveAssets.map(
			(reuse) => `${reuse.item.providerConversationId}\0${reuse.signature}`,
		),
	);
	for (const job of input.jobs) {
		if (isActiveStatus(job.status)) continue;
		const ids = normalizeConversationIds(job.request.conversationIds);
		if (ids.length === 0 && (job.request.conversationId || job.result?.target?.conversationId))
			ids.push((job.request.conversationId || job.result?.target?.conversationId) as string);
		// A flattened multi-conversation result cannot attribute a title-only family.
		if (ids.length !== 1) continue;
		const conversationId = ids[0];
		if (!conversationId) continue;
		const target = input.targets.get(conversationId);
		const priorTargets = [
			job.result?.target,
			...(job.result?.attempts ?? []).map((attempt) => attempt.target),
		].filter((prior): prior is HistoryMaterializationTarget =>
			Boolean(prior && prior.conversationId === conversationId),
		);
		const identities = new Set(
			[job.request.boundIdentityKey, ...priorTargets.map((prior) => prior.boundIdentityKey)].filter(
				Boolean,
			),
		);
		if (
			!target ||
			!target.boundIdentityKey ||
			job.request.provider !== target.provider ||
			(target.runtimeProfile && job.request.runtimeProfile !== target.runtimeProfile) ||
			identities.size !== 1 ||
			!identities.has(target.boundIdentityKey) ||
			priorTargets.some(
				(prior) =>
					prior.provider !== target.provider || prior.runtimeProfile !== target.runtimeProfile,
			) ||
			(job.result?.target && job.result.target.conversationId !== conversationId)
		)
			continue;
		for (const entry of job.result?.entries ?? []) {
			if (
				(entry.status !== "failed" && entry.status !== "skipped") ||
				entry.assetAvailability !== "unavailable" ||
				entry.failureKind !== "provider_unavailable" ||
				entry.retryable !== false
			)
				continue;
			const signatures = historyEntryAssetFamilySignatures(entry, input.selectedKinds);
			const matched = signatures.filter((signature) =>
				input.families.get(conversationId)?.includes(signature),
			);
			if (
				matched.length === 0 ||
				matched.some((signature) => seen.has(`${conversationId}\0${signature}`))
			)
				continue;
			for (const signature of matched) seen.add(`${conversationId}\0${signature}`);
			evidence.push({
				conversationId,
				signatures: matched,
				entry: {
					...entry,
					status: "skipped",
					localPath: null,
					materializationMethod: "prior-terminal-evidence",
					priorEvidenceJobId: entry.priorEvidenceJobId ?? job.id,
					recoverabilityState: "terminally_unavailable",
				},
			});
		}
	}
	return evidence;
}

async function readScopedArchiveReuse(input: {
	runArchiveService: RunArchiveService;
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
	targets: Map<string, HistoryMaterializationTarget>;
	families: Map<string, string[]>;
}): Promise<ScopedArchiveReuse[]> {
	const archive = await input.runArchiveService.listItems({
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		assetAvailability: "available",
		limit: 500,
	});
	const reused: ScopedArchiveReuse[] = [];
	const seen = new Set<string>();
	for (const item of archive.items) {
		const conversationId = item.providerConversationId;
		const target = conversationId ? input.targets.get(conversationId) : null;
		if (
			!target ||
			!conversationId ||
			item.provider !== target.provider ||
			(target.runtimeProfile && item.runtimeProfile !== target.runtimeProfile) ||
			!item.localPath ||
			item.fileAvailable !== true
		)
			continue;
		const expectedIdentity = input.request.boundIdentityKey ?? target.boundIdentityKey;
		if (
			expectedIdentity &&
			!accountMirrorIdentityKeysMatch({
				provider: target.provider,
				expectedIdentityKey: expectedIdentity,
				detectedIdentityKey: item.boundIdentityKey,
			})
		)
			continue;
		const signature = archiveItemAssetFamilySignature(item, input.selectedKinds);
		if (!signature || !input.families.get(conversationId)?.includes(signature)) continue;
		const key = `${conversationId}\0${signature}`;
		if (seen.has(key)) continue;
		const before = await fs.stat(item.localPath).catch(() => null);
		if (!before?.isFile()) continue;
		const checksumSha256 = await calculateFileSha256(item.localPath);
		if (
			!checksumSha256 ||
			(item.checksumSha256 && item.checksumSha256.toLowerCase() !== checksumSha256)
		)
			continue;
		const after = await fs.stat(item.localPath).catch(() => null);
		if (!after?.isFile() || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
			continue;
		seen.add(key);
		const kind =
			item.kind === "generated_artifact" ? "artifact" : item.kind === "upload" ? "file" : "media";
		reused.push({
			item,
			signature,
			entry: {
				kind,
				providerId:
					item.artifactId ?? readRecordString(item.metadata, ["providerFileId"]) ?? item.id,
				title: item.title ?? item.fileName,
				status: "duplicate",
				localPath: item.localPath,
				remoteUrl: item.uri,
				cacheKey: item.cacheKey,
				checksumSha256,
				mimeType: item.mimeType,
				size: after.size,
				materializationMethod: "verified-archive-reuse",
				reason: "already_materialized_archive",
				assetAvailability: "available",
				recoverabilityState: "materialized",
				retryable: false,
				archiveItemId: item.id,
				assetRoute: item.links.asset ?? null,
			},
		});
	}
	return reused;
}

async function materializedArchiveAssetFamilySignatures(input: {
	runArchiveService: RunArchiveService;
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
}): Promise<string[]> {
	const archive = await input.runArchiveService.listItems({
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		assetAvailability: "available",
		limit: 500,
	});
	const signatures = new Set<string>();
	const scopedIds = new Set(normalizeConversationIds(input.request.conversationIds));
	for (const item of archive.items) {
		if (scopedIds.size > 0 && !scopedIds.has(item.providerConversationId ?? "")) continue;
		const provider = normalizeProviderId(item.provider);
		if (
			input.request.boundIdentityKey &&
			(!provider ||
				(input.request.provider && provider !== input.request.provider) ||
				!accountMirrorIdentityKeysMatch({
					provider,
					expectedIdentityKey: input.request.boundIdentityKey,
					detectedIdentityKey: item.boundIdentityKey,
				}))
		) {
			continue;
		}
		const signature = archiveItemAssetFamilySignature(item, input.selectedKinds);
		if (signature) signatures.add(signature);
	}
	return Array.from(signatures);
}

async function terminalVolatileAssetFamilySignatures(input: {
	jobs?: HistoryMaterializationJob[];
	jobStore?: HistoryMaterializationJobStore;
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
}): Promise<string[]> {
	const signatures = new Set<string>();
	const scopedIds = new Set(normalizeConversationIds(input.request.conversationIds));
	const jobs = input.jobs ?? (await input.jobStore?.listJobs()) ?? [];
	for (const job of jobs) {
		if (isActiveStatus(job.status)) continue;
		if (scopedIds.size > 0) {
			const priorIds = normalizeConversationIds(job.request.conversationIds);
			if (priorIds.length === 0 && job.result?.target?.conversationId)
				priorIds.push(job.result.target.conversationId);
			// Flattened account-wide results cannot attribute a title-only family to this scope.
			if (priorIds.length === 0 || priorIds.some((id) => !scopedIds.has(id))) continue;
		}
		if (input.request.provider && job.request.provider !== input.request.provider) continue;
		if (
			input.request.runtimeProfile &&
			job.request.runtimeProfile !== input.request.runtimeProfile
		) {
			continue;
		}
		if (
			input.request.boundIdentityKey &&
			job.request.boundIdentityKey !== input.request.boundIdentityKey
		) {
			continue;
		}
		for (const entry of job.result?.entries ?? []) {
			if (!(await isTerminalAssetFamilyEvidence(entry))) continue;
			for (const signature of historyEntryAssetFamilySignatures(entry, input.selectedKinds)) {
				signatures.add(signature);
			}
		}
	}
	return Array.from(signatures);
}

async function isTerminalAssetFamilyEvidence(
	entry: HistoryMaterializationManifestEntry,
): Promise<boolean> {
	if (isConfirmedVolatileMissingEntry(entry)) return true;
	if (entry.status !== "materialized" && entry.status !== "duplicate") return false;
	if (!entry.localPath) return false;
	const stat = await fs.stat(entry.localPath).catch(() => null);
	return stat?.isFile() === true;
}

async function materializedAccountLibraryFileFamilySignatures(input: {
	runArchiveService: RunArchiveService;
	request: HistoryMaterializationCreateRequest;
}): Promise<string[]> {
	const archive = await input.runArchiveService.listItems({
		provider: input.request.provider ?? null,
		runtimeProfile: input.request.runtimeProfile ?? null,
		assetAvailability: "available",
		limit: 500,
	});
	const signatures = new Set<string>();
	for (const item of archive.items) {
		if (input.request.boundIdentityKey && item.boundIdentityKey !== input.request.boundIdentityKey)
			continue;
		const signature = archiveItemAccountLibraryFileFamilySignature(item);
		if (signature) signatures.add(signature);
	}
	return Array.from(signatures);
}

function isConfirmedVolatileMissingEntry(entry: HistoryMaterializationManifestEntry): boolean {
	if (entry.assetAvailability === "unavailable") return true;
	if (entry.status !== "failed" && entry.status !== "skipped") return false;
	if (
		!isVolatileProviderAssetLocation(entry.remoteUrl) &&
		!isVolatileProviderAssetLocation(entry.providerId)
	) {
		return false;
	}
	const reason = entry.reason?.trim().toLowerCase() ?? "";
	// Account Library rows are persistent provider inventory. A missing DOM row
	// is a retrieval failure, not proof that the underlying file is gone.
	if (reason.includes("library_row_not_found")) return false;
	if (!reason) return true;
	return (
		reason.includes("expired") ||
		reason.includes("not found") ||
		reason.includes("not_found") ||
		reason.includes("missing") ||
		reason.includes("unavailable") ||
		reason.includes("tile_not_found") ||
		reason.includes("archive_linkage_missing")
	);
}

function withExplicitAssetAvailability(
	result: HistoryMaterializationResult,
): HistoryMaterializationResult {
	return {
		...result,
		entries: result.entries.map((entry) => {
			if (entry.status === "materialized" || entry.status === "duplicate") {
				return { ...entry, assetAvailability: "available" as const };
			}
			if (isConfirmedVolatileMissingEntry(entry)) {
				return {
					...entry,
					assetAvailability: "unavailable" as const,
					failureKind: entry.failureKind ?? "provider_unavailable",
					retryable: entry.retryable ?? false,
				};
			}
			return { ...entry, assetAvailability: "unknown" as const };
		}),
	};
}

function isVolatileProviderAssetLocation(value: string | null | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return Boolean(
		normalized?.startsWith("sandbox:") ||
			normalized?.includes(":sandbox:/") ||
			normalized?.startsWith("sediment://") ||
			normalized?.startsWith("chatgpt://file/"),
	);
}

function historyEntryAssetFamilySignatures(
	entry: HistoryMaterializationManifestEntry,
	selectedKinds: HistoryMaterializationAssetKind[],
): string[] {
	const field = entry.kind === "artifact" ? "artifacts" : entry.kind === "file" ? "files" : "media";
	if (!selectedKinds.includes(field)) return [];
	const kind = entry.kind;
	const sources = new Set<string>();
	const source =
		readAssetFamilySourceFromId(entry.providerId) ?? readAssetFamilySourceFromId(entry.remoteUrl);
	if (source) sources.add(source.trim().toLowerCase());
	const rawTitle =
		source === "download"
			? (readAssetFamilyFileNameFromUri(entry.providerId) ??
				readAssetFamilyFileNameFromUri(entry.remoteUrl) ??
				entry.title ??
				entry.providerId)
			: (entry.title ?? entry.providerId);
	const title = normalizeAssetFamilyTitle(rawTitle);
	if (!title) return [];
	sources.add("unknown");
	if (entry.kind === "file") {
		sources.add("conversation");
		sources.add("file");
	}
	return Array.from(sources).map((candidateSource) => `${kind}:${candidateSource}:${title}`);
}

function archiveItemAccountLibraryFileFamilySignature(item: RunArchiveItem): string | null {
	if (item.kind !== "upload") return null;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const source =
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readAssetFamilySourceFromId(item.id) ??
		readAssetFamilySourceFromId(item.artifactId);
	if (source !== "chatgpt-library") return null;
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		readRecordString(metadata, ["fileId"]) ??
		(item.artifactId?.startsWith("file_") ? item.artifactId : null);
	if (providerFileId) return `file-id:${providerFileId}`;
	const title = normalizeAssetFamilyTitle(item.title ?? item.fileName ?? item.artifactId);
	const size = readNumber(readRecordValue(metadata, ["size"]));
	const mimeType = item.mimeType?.trim().toLowerCase() ?? null;
	if (!title) return null;
	return `title:${title}:mime:${mimeType ?? "unknown"}:size:${size ?? "unknown"}`;
}

function accountLibraryFileFamilySignature(file: FileRef): string | null {
	const metadata = isRecord(file.metadata) ? file.metadata : null;
	const providerFileId =
		readRecordString(metadata, ["providerFileId"]) ??
		extractChatgptProviderFileId(file.remoteUrl) ??
		(file.id.startsWith("file_") ? file.id : null);
	if (providerFileId) return `file-id:${providerFileId}`;
	const title = normalizeAssetFamilyTitle(file.name ?? file.id);
	const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : null;
	const mimeType = file.mimeType?.trim().toLowerCase() ?? null;
	if (!title) return null;
	return `title:${title}:mime:${mimeType ?? "unknown"}:size:${size ?? "unknown"}`;
}

function extractChatgptProviderFileId(value: string | null | undefined): string | null {
	if (!value?.startsWith("chatgpt://file/")) return null;
	const raw = value.slice("chatgpt://file/".length);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

function archiveItemAssetFamilySignature(
	item: RunArchiveItem,
	selectedKinds: HistoryMaterializationAssetKind[],
): string | null {
	const field =
		item.kind === "generated_artifact"
			? "artifacts"
			: item.kind === "upload"
				? "files"
				: item.kind === "media_generation"
					? "media"
					: null;
	if (!field || !selectedKinds.includes(field)) return null;
	const kind = field === "artifacts" ? "artifact" : field === "files" ? "file" : "media";
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const rawSource =
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["artifactKind"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readRecordString(metadata, ["providerFileSource"]) ??
		readAssetFamilySourceFromId(item.artifactId) ??
		readAssetFamilySourceFromId(readRecordString(metadata, ["providerFileId"]));
	const source = normalizeAssetFamilySource(rawSource);
	const rawTitle =
		source === "download"
			? (item.fileName ?? readAssetFamilyFileNameFromUri(item.uri) ?? item.title ?? item.artifactId)
			: (item.title ?? item.fileName ?? item.artifactId);
	const title = normalizeAssetFamilyTitle(rawTitle);
	if (!title) return null;
	return `${kind}:${source}:${title}`;
}

function catalogManifestAssetIsEligibleForMaterialization(
	kind: "artifact" | "file" | "media",
	item: unknown,
	provider: ProviderId,
): boolean {
	if (provider !== "chatgpt") return true;
	if (kind === "file" && isUnsupportedChatgptConversationFileManifestItem(item)) return false;
	if (kind === "artifact" && isChatgptStaticImageFalsePositiveManifestItem(item)) return false;
	return true;
}

function isUnsupportedChatgptConversationFileManifestItem(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const source = readRecordString(metadata, ["source", "fileSource"]);
	if (source === "chatgpt-library") return false;
	if (readMaterializableAssetLocation(item, metadata)) return false;
	return Boolean(
		readCatalogStringField(item, ["conversationId"]) ??
			readRecordString(metadata, ["conversationId"]),
	);
}

function isChatgptStaticImageFalsePositiveManifestItem(item: unknown): boolean {
	if (!isRecord(item)) return false;
	const metadata = isRecord(item.metadata) ? item.metadata : null;
	const id = readCatalogStringField(item, ["id", "providerId", "artifactId"]) ?? "";
	const extraction = readRecordString(metadata, ["extraction"]);
	if (!id.startsWith("image-dom:") && extraction !== "dom-imagegen-image") return false;
	const location = readMaterializableAssetLocation(item, metadata);
	if (!location) return true;
	return isStaticChromeImageUrl(location);
}

function readMaterializableAssetLocation(
	item: unknown,
	metadata: Record<string, unknown> | null,
): string | null {
	return (
		readCatalogStringField(item, [
			"uri",
			"remoteUrl",
			"url",
			"href",
			"downloadUrl",
			"sourceUrl",
			"cacheKey",
			"fileId",
			"providerFileId",
		]) ??
		readRecordString(metadata, [
			"uri",
			"remoteUrl",
			"url",
			"href",
			"downloadUrl",
			"sourceUrl",
			"cacheKey",
			"fileId",
			"providerFileId",
		])
	);
}

function isStaticChromeImageUrl(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return true;
	if (normalized.startsWith("blob:")) return false;
	if (normalized.startsWith("chatgpt://")) return false;
	if (normalized.startsWith("sandbox:")) return false;
	if (normalized.startsWith("sediment://")) return false;
	try {
		const parsed = new URL(normalized);
		if (parsed.hostname === "www.google.com" && parsed.pathname === "/s2/favicons") return true;
		if (parsed.pathname.includes("/favicon")) return true;
		if (parsed.pathname.endsWith("/favicon.ico")) return true;
		return false;
	} catch {
		return false;
	}
}

function catalogManifestAssetFamilySignature(
	kind: "artifact" | "file" | "media",
	item: unknown,
): string | null {
	const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : null;
	const rawSource =
		readCatalogStringField(item, ["source"]) ??
		readRecordString(metadata, ["source"]) ??
		readRecordString(metadata, ["artifactKind"]) ??
		readRecordString(metadata, ["fileSource"]) ??
		readAssetFamilySourceFromId(readCatalogStringField(item, ["id", "providerId", "artifactId"])) ??
		readAssetFamilySourceFromId(
			readRecordString(metadata, ["providerFileId", "artifactId", "fileId"]),
		);
	const source = normalizeAssetFamilySource(rawSource);
	const uriTitle =
		source === "download"
			? readAssetFamilyFileNameFromUri(readCatalogStringField(item, ["uri", "remoteUrl"]))
			: null;
	const catalogTitle =
		readCatalogStringField(item, ["title", "name", "fileName", "prompt"]) ??
		readRecordString(metadata, ["title", "name", "fileName", "prompt"]);
	const rawTitle = source === "download" ? (uriTitle ?? catalogTitle) : (catalogTitle ?? uriTitle);
	const title = normalizeAssetFamilyTitle(rawTitle);
	if (!title) return null;
	return `${kind}:${source}:${title}`;
}

function readAssetFamilySourceFromId(value: string | null): string | null {
	if (!value) return null;
	const parts = value
		.split(":")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	if (parts.includes("download")) return "download";
	if (parts.includes("canvas")) return "canvas";
	if (parts.includes("deep-research")) return "deep-research";
	if (parts.includes("conversation")) return "conversation";
	if (parts.includes("chatgpt-library")) return "chatgpt-library";
	if (parts.includes("account")) return "account";
	if (parts.includes("download-dom")) return "download";
	if (parts.includes("image-dom")) return "image";
	return null;
}

function normalizeAssetFamilySource(value: string | null): string {
	const normalized = value?.trim().toLowerCase() ?? "unknown";
	if (normalized === "download-dom") return "download";
	if (normalized === "image-dom") return "image";
	return normalized;
}

function readAssetFamilyFileNameFromUri(value: string | null): string | null {
	if (!value) return null;
	const pathValue = value.split(/[?#]/, 1)[0] ?? value;
	const rawName = pathValue.split("/").filter(Boolean).at(-1) ?? null;
	if (!rawName || !/\.[a-z0-9]{1,10}$/i.test(rawName)) return null;
	return decodeAssetFamilyTitle(rawName);
}

function normalizeAssetFamilyTitle(value: string | null): string | null {
	if (!value) return null;
	const normalized = decodeAssetFamilyTitle(value)
		.replace(/\s+\((?:word|pdf|markdown|docx|md)\)$/i, "")
		.replace(/\.(?:pdf|docx|md|markdown)$/i, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
	return normalized || null;
}

function decodeAssetFamilyTitle(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function manifestItemBelongsToConversation(item: unknown, conversationId: string): boolean {
	const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : null;
	return (
		readCatalogStringField(item, ["conversationId"]) === conversationId ||
		readRecordString(metadata, ["conversationId"]) === conversationId
	);
}

function maxKnownCount(values: unknown[]): number {
	return values.reduce<number>((max, value) => {
		const number = readNumber(value);
		return number === null ? max : Math.max(max, number);
	}, 0);
}

function countAttemptedReconciliationAssetBudget(result: HistoryMaterializationResult): number {
	if (isTerminalConversationUnavailableResult(result)) return 0;
	return result.entries.filter(
		(entry) =>
			historyEntryIdentifiesConcreteAsset(entry) &&
			!isVerifiedCachedHistoryMaterializationEntry(entry),
	).length;
}

function isVerifiedCachedHistoryMaterializationEntry(
	entry: HistoryMaterializationManifestEntry,
): boolean {
	return entry.status === "materialized" && entry.materializationMethod === "cached-provider-file";
}

async function reconciliationRetryAttemptedAtByConversationId(input: {
	jobs: HistoryMaterializationJob[];
	request: HistoryMaterializationCreateRequest;
	selectedKinds: HistoryMaterializationAssetKind[];
}): Promise<Map<string, string>> {
	const attemptedAt = new Map<string, string>();
	for (const job of input.jobs) {
		if (!historyMaterializationJobSharesRetryLane(job, input.request, input.selectedKinds)) {
			continue;
		}
		for (const attempt of job.result?.attempts ?? []) {
			if (
				(attempt.origin !== "reconciliation_candidate" &&
					attempt.origin !== "selected_conversation_id") ||
				attempt.status !== "skipped" ||
				attempt.accounting.assetsAttempted !== 0 ||
				attempt.accounting.candidateMaterialized ||
				attempt.accounting.providerGuardObserved
			) {
				continue;
			}
			const previous = attemptedAt.get(attempt.target.conversationId);
			if (!previous || attempt.generatedAt > previous) {
				attemptedAt.set(attempt.target.conversationId, attempt.generatedAt);
			}
		}
	}
	return attemptedAt;
}

function historyMaterializationJobSharesRetryLane(
	job: HistoryMaterializationJob,
	request: HistoryMaterializationCreateRequest,
	selectedKinds: HistoryMaterializationAssetKind[],
): boolean {
	if (job.source.type !== "reconciliation" || isActiveStatus(job.status)) return false;
	if (job.request.provider !== request.provider) return false;
	if (job.request.runtimeProfile !== request.runtimeProfile) return false;
	if (job.request.browserProfile !== request.browserProfile) return false;
	if (job.request.boundIdentityKey !== request.boundIdentityKey) return false;
	const jobKinds = normalizeAssetKinds(job.request.assetKinds);
	return (
		jobKinds.length === selectedKinds.length &&
		jobKinds.every((kind) => selectedKinds.includes(kind))
	);
}

function historyEntryIdentifiesConcreteAsset(entry: HistoryMaterializationManifestEntry): boolean {
	return Boolean(
		entry.providerId ||
			entry.remoteUrl ||
			entry.localPath ||
			entry.materializationMethod ||
			entry.archiveItemId ||
			entry.assetRoute,
	);
}

function skippedResult(input: {
	now: () => Date;
	source: HistoryMaterializationJob["source"];
	target: HistoryMaterializationTarget | null;
	message: string;
}): HistoryMaterializationResult {
	return {
		object: "history_materialization_result",
		generatedAt: input.now().toISOString(),
		status: "skipped",
		target: input.target,
		source: input.source,
		manifestPaths: [],
		entries: [],
		archiveItems: [],
		metrics: {
			conversations: input.target ? 1 : 0,
			materialized: 0,
			skipped: 1,
			failed: 0,
		},
		message: input.message,
	};
}

type ArtifactManifestEntry = {
	artifactId: string;
	title?: string;
	kind?: ConversationArtifact["kind"];
	uri?: string | null;
	status: "materialized" | "skipped" | "error";
	fileId?: string;
	fileName?: string;
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
	failureKind?: "provider_unavailable" | "retrieval_failed";
	retryable?: boolean;
};

type FileManifestEntry = {
	fileId: string;
	fileName?: string;
	status: "materialized" | "error";
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
	failureKind?: "provider_unavailable" | "retrieval_failed";
	retryable?: boolean;
};

async function readArtifactManifestEntries(
	manifestPath: string | null,
): Promise<ArtifactManifestEntry[]> {
	const manifest = await readJsonManifest(manifestPath);
	const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
	return entries.filter(isRecord).map((entry) => ({
		artifactId: readRecordString(entry, ["artifactId"]) ?? "unknown",
		title: readRecordString(entry, ["title"]) ?? undefined,
		kind: normalizeArtifactKind(readRecordString(entry, ["kind"])),
		uri: readRecordString(entry, ["uri"]),
		status:
			entry.status === "materialized" || entry.status === "skipped" || entry.status === "error"
				? entry.status
				: "error",
		fileId: readRecordString(entry, ["fileId"]) ?? undefined,
		fileName: readRecordString(entry, ["fileName"]) ?? undefined,
		localPath: readRecordString(entry, ["localPath"]) ?? undefined,
		remoteUrl: readRecordString(entry, ["remoteUrl"]),
		mimeType: readRecordString(entry, ["mimeType"]) ?? undefined,
		size: readNumber(entry.size) ?? undefined,
		materializationMethod: readRecordString(entry, ["materializationMethod"]) ?? undefined,
		error: readRecordString(entry, ["error"]) ?? undefined,
		failureKind:
			entry.failureKind === "provider_unavailable" || entry.failureKind === "retrieval_failed"
				? entry.failureKind
				: undefined,
		retryable: typeof entry.retryable === "boolean" ? entry.retryable : undefined,
	}));
}

async function readFileManifestEntries(manifestPath: string | null): Promise<FileManifestEntry[]> {
	const manifest = await readJsonManifest(manifestPath);
	const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
	return entries.filter(isRecord).map((entry) => ({
		fileId: readRecordString(entry, ["fileId"]) ?? "unknown",
		fileName: readRecordString(entry, ["fileName"]) ?? undefined,
		status: entry.status === "materialized" || entry.status === "error" ? entry.status : "error",
		localPath: readRecordString(entry, ["localPath"]) ?? undefined,
		remoteUrl: readRecordString(entry, ["remoteUrl"]),
		mimeType: readRecordString(entry, ["mimeType"]) ?? undefined,
		size: readNumber(entry.size) ?? undefined,
		materializationMethod: readRecordString(entry, ["materializationMethod"]) ?? undefined,
		error: readRecordString(entry, ["error"]) ?? undefined,
		failureKind:
			entry.failureKind === "provider_unavailable" || entry.failureKind === "retrieval_failed"
				? entry.failureKind
				: undefined,
		retryable: typeof entry.retryable === "boolean" ? entry.retryable : undefined,
	}));
}

async function readJsonManifest(
	manifestPath: string | null,
): Promise<Record<string, unknown> | null> {
	if (!manifestPath) return null;
	try {
		const raw = await fs.readFile(manifestPath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function historyEntryFromArtifactManifest(
	entry: ArtifactManifestEntry,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(entry.localPath ?? null);
	return {
		kind: "artifact",
		providerId: entry.artifactId,
		title: entry.title ?? null,
		status:
			entry.status === "materialized"
				? "materialized"
				: entry.status === "skipped"
					? "skipped"
					: "failed",
		localPath: entry.localPath ?? null,
		remoteUrl: entry.remoteUrl ?? entry.uri ?? null,
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: entry.localPath
				? `path:${entry.localPath}`
				: null,
		checksumSha256,
		mimeType: entry.mimeType ?? null,
		size: readNumber(entry.size),
		materializationMethod: entry.materializationMethod ?? null,
		reason: entry.status === "materialized" ? null : (entry.error ?? entry.status),
		...(entry.failureKind
			? { failureKind: entry.failureKind, retryable: entry.retryable ?? null }
			: {}),
		...(entry.failureKind === "provider_unavailable"
			? { assetAvailability: "unavailable" as const }
			: {}),
		archiveItemId: null,
		assetRoute: null,
	};
}

async function historyEntryFromFileManifest(
	entry: FileManifestEntry,
): Promise<HistoryMaterializationManifestEntry> {
	const checksumSha256 = await calculateFileSha256(entry.localPath ?? null);
	return {
		kind: "file",
		providerId: entry.fileId,
		title: entry.fileName ?? null,
		status: entry.status === "materialized" ? "materialized" : "failed",
		localPath: entry.localPath ?? null,
		remoteUrl: entry.remoteUrl ?? null,
		cacheKey: checksumSha256
			? `sha256:${checksumSha256}`
			: entry.localPath
				? `path:${entry.localPath}`
				: null,
		checksumSha256,
		mimeType: entry.mimeType ?? null,
		size: readNumber(entry.size),
		materializationMethod: entry.materializationMethod ?? null,
		reason: entry.status === "materialized" ? null : (entry.error ?? entry.status),
		failureKind: entry.status === "materialized" ? null : (entry.failureKind ?? "retrieval_failed"),
		retryable: entry.status === "materialized" ? null : (entry.retryable ?? false),
		archiveItemId: null,
		assetRoute: null,
	};
}

function findArtifactManifestForFile(
	entries: ArtifactManifestEntry[],
	file: FileRef,
): ArtifactManifestEntry | null {
	return (
		entries.find(
			(entry) =>
				entry.fileId === file.id ||
				(entry.localPath && file.localPath && entry.localPath === file.localPath) ||
				(entry.fileName && entry.fileName === file.name),
		) ?? null
	);
}

function findFileManifestForFile(
	entries: FileManifestEntry[],
	file: FileRef,
): FileManifestEntry | null {
	return (
		entries.find(
			(entry) =>
				entry.fileId === file.id ||
				(entry.localPath && file.localPath && entry.localPath === file.localPath) ||
				(entry.fileName && entry.fileName === file.name),
		) ?? null
	);
}

function unsupportedEntry(
	kind: HistoryMaterializationManifestEntry["kind"],
	error: unknown,
	target: HistoryMaterializationTarget | null,
): HistoryMaterializationManifestEntry {
	const reason = formatHistoryMaterializationFailureReason({ target, error });
	const startupDenied =
		reason.startsWith("Live-follow browser startup control denied:") ||
		reason === "Live-follow crawler target cannot be verified without its browser endpoint.";
	return {
		kind,
		providerId: null,
		title: null,
		status: startupDenied ? "failed" : "skipped",
		...(startupDenied ? { failureKind: "retrieval_failed" as const, retryable: true } : {}),
		localPath: null,
		remoteUrl: null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason,
		archiveItemId: null,
		assetRoute: null,
	};
}

function noMaterializableEntry(
	kind: HistoryMaterializationManifestEntry["kind"],
	target: HistoryMaterializationTarget,
): HistoryMaterializationManifestEntry {
	return {
		kind,
		providerId: null,
		title: null,
		status: "skipped",
		localPath: null,
		remoteUrl: null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason: `no-materializable-${kind}: provider detail exposed no downloadable ${kind} assets for conversation ${target.conversationId}`,
		archiveItemId: null,
		assetRoute: null,
	};
}

function missingLiveControlEntry(
	artifact: ConversationArtifact,
): HistoryMaterializationManifestEntry {
	return {
		kind: "artifact",
		providerId: artifact.id,
		title: artifact.title,
		status: "skipped",
		localPath: null,
		remoteUrl: artifact.uri ?? null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason: "missing_live_control",
		archiveItemId: null,
		assetRoute: null,
	};
}

function excludedKnownFilesEntry(
	target: HistoryMaterializationTarget,
	knownFileCount: number,
): HistoryMaterializationManifestEntry {
	return {
		kind: "file",
		providerId: null,
		title: null,
		status: "skipped",
		localPath: null,
		remoteUrl: null,
		cacheKey: null,
		checksumSha256: null,
		mimeType: null,
		size: null,
		materializationMethod: null,
		reason: `known-files-excluded: ${knownFileCount} known file asset${knownFileCount === 1 ? "" : "s"} already had terminal materialization evidence or fell outside the bounded selection for conversation ${target.conversationId}`,
		archiveItemId: null,
		assetRoute: null,
	};
}

function formatGeminiConversationRouteabilityReason(
	target: HistoryMaterializationTarget | null,
	message: string,
): string | null {
	if (target?.provider !== "gemini") return null;
	if (!/Gemini conversation .*content not found/i.test(message)) return null;
	const activeState = readActiveStateFromErrorMessage(message);
	if (!activeState) return null;
	const pathname = readRecordString(activeState, ["pathname"]);
	const href = readRecordString(activeState, ["href"]);
	const activeConversationId = readRecordString(activeState, ["conversationId"]);
	const bareAppRoute =
		pathname === "/app" ||
		href === "https://gemini.google.com/app" ||
		href === "https://gemini.google.com/app/";
	if (!bareAppRoute || activeConversationId) return null;
	const selector = [
		`conversation=${target.conversationId}`,
		target.runtimeProfile ? `runtimeProfile=${target.runtimeProfile}` : null,
		target.browserProfile ? `browserProfile=${target.browserProfile}` : null,
		target.boundIdentityKey ? `identity=${target.boundIdentityKey}` : null,
	]
		.filter(Boolean)
		.join(" ");
	return (
		`conversation-not-found-or-unavailable: Gemini routeability check for ${selector} landed on bare /app; ` +
		"treat the cached conversation id as deleted/non-existent in the tenant, unavailable to the active identity, " +
		`or opened under the wrong managed browser profile. activeState=${JSON.stringify(activeState)}`
	);
}

function readActiveStateFromErrorMessage(message: string): Record<string, unknown> | null {
	const marker = "activeState=";
	const index = message.indexOf(marker);
	if (index < 0) return null;
	const raw = message.slice(index + marker.length).trim();
	try {
		const parsed = JSON.parse(raw) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function applyArchiveLinks(
	entries: HistoryMaterializationManifestEntry[],
	archiveItems: RunArchiveItem[],
): void {
	for (const entry of entries) {
		if (entry.status !== "materialized") continue;
		const match = archiveItems.find(
			(item) =>
				(entry.localPath && item.localPath === entry.localPath) ||
				(entry.providerId && item.artifactId === entry.providerId),
		);
		const duplicateTarget =
			match ??
			archiveItems.find(
				(item) => entry.checksumSha256 && item.checksumSha256 === entry.checksumSha256,
			);
		if (duplicateTarget) {
			entry.archiveItemId = duplicateTarget.id;
			entry.assetRoute = duplicateTarget.links.asset ?? null;
			entry.cacheKey = entry.cacheKey ?? duplicateTarget.cacheKey;
			entry.checksumSha256 = entry.checksumSha256 ?? duplicateTarget.checksumSha256;
			if (!match) {
				entry.status = "duplicate";
				entry.reason = `already_materialized_alias:${duplicateTarget.id}`;
			}
			continue;
		}
		entry.status = "failed";
		entry.reason = "archive_linkage_missing";
	}
}

export function resolveHistoryMaterializationResultStatus(metrics: {
	materialized: number;
	failed: number;
}): HistoryMaterializationResult["status"] {
	if (metrics.materialized > 0) return "materialized";
	if (metrics.failed > 0) return "failed";
	return "skipped";
}

function resolveHistoryMaterializationJobResultStatus(
	result: HistoryMaterializationResult,
): HistoryMaterializationResult["status"] {
	if (result.status === "failed" || result.metrics.failed <= 0) return result.status;
	if (historyMaterializationResultHasProviderGuard(result)) return result.status;
	const failedEntries = result.entries.filter((entry) => entry.status === "failed");
	if (failedEntries.length === 0) return "failed";
	return failedEntries.some((entry) => !isConversationNotFoundOrUnavailableReason(entry.reason))
		? "failed"
		: result.status;
}

function summarizeEntries(
	entries: HistoryMaterializationManifestEntry[],
	conversations: number,
): HistoryMaterializationResult["metrics"] {
	return {
		conversations,
		materialized: entries.filter((entry) => entry.status === "materialized").length,
		duplicateAliases: entries.filter((entry) => entry.status === "duplicate").length,
		skipped: entries.filter((entry) => entry.status === "skipped").length,
		failed: entries.filter((entry) => entry.status === "failed").length,
	};
}

function normalizeProviderId(value: unknown): ProviderId | null {
	return value === "chatgpt" || value === "gemini" || value === "grok" ? value : null;
}

function normalizeCatalogKind(value: unknown): AccountMirrorCatalogKind | null {
	if (
		value === "all" ||
		value === "projects" ||
		value === "conversations" ||
		value === "artifacts" ||
		value === "files" ||
		value === "media"
	) {
		return value;
	}
	return null;
}

function normalizeAssetSource(value: unknown): HistoryMaterializationAssetSource | null {
	return value === "account-library" ? value : null;
}

function normalizeArtifactKind(value: string | null): ConversationArtifact["kind"] | undefined {
	if (
		value === "document" ||
		value === "download" ||
		value === "canvas" ||
		value === "generated" ||
		value === "image" ||
		value === "spreadsheet"
	) {
		return value;
	}
	return undefined;
}

function normalizeAssetKinds(
	value: HistoryMaterializationAssetKind[] | null | undefined,
): HistoryMaterializationAssetKind[] {
	const values = Array.isArray(value) ? value : [];
	if (values.length === 0) return ["artifacts", "files"];
	if (values.includes("all")) return ["artifacts", "files", "media"];
	return Array.from(
		new Set(
			values.filter((entry) => entry === "artifacts" || entry === "files" || entry === "media"),
		),
	);
}

function normalizeRequestedAssetKinds(
	value: HistoryMaterializationAssetKind[] | null | undefined,
): HistoryMaterializationAssetKind[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	return normalizeAssetKinds(value);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || null;
}

function normalizeConversationIds(value: string[] | null | undefined): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((entry) => normalizeOptionalString(entry))
				.filter((entry): entry is string => Boolean(entry)),
		),
	);
}

export function resolveHistoryMaterializationProviderListOptions(
	target: HistoryMaterializationTarget,
): HistoryMaterializationProviderListOptions {
	const providerConversationUrl =
		target.providerConversationUrl ??
		resolveProviderConversationUrl(target.provider, target.conversationId) ??
		undefined;
	return {
		configuredUrl: resolveHistoryMaterializationConfiguredUrl(target, providerConversationUrl),
		tabUrl: providerConversationUrl,
		projectId: target.projectId ?? undefined,
		allowNavigation: true,
		accountMirrorInventory: true,
		skipFeatureSignature: true,
	};
}

export function createHistoryMaterializationTrafficOptions(
	conversationId: string,
	inPageActionLimit: number,
): Pick<
	BrowserProviderListOptions,
	| "providerTrafficContext"
	| "accountMirrorProviderTrafficPlan"
	| "accountMirrorSingleConversationVisit"
> {
	const workKey = createAccountMirrorProviderTrafficWorkKey("materialization", conversationId);
	return {
		accountMirrorSingleConversationVisit: true,
		providerTrafficContext: {
			trafficPhase: "materialization",
			workKey,
		},
		accountMirrorProviderTrafficPlan: {
			object: "account_mirror_provider_traffic_plan",
			version: 1,
			budgets: [
				{ phase: "materialization", kind: "page_navigate", workKey, limit: 1 },
				{
					phase: "materialization",
					kind: "in_page_action",
					workKey,
					limit: Math.max(1, Math.floor(inPageActionLimit)),
				},
			],
		},
	};
}

function resolveHistoryMaterializationConfiguredUrl(
	target: HistoryMaterializationTarget,
	providerConversationUrl: string | undefined,
): string | undefined {
	if (target.provider !== "gemini") return providerConversationUrl;
	const projectId = normalizeOptionalString(target.projectId);
	if (projectId) {
		return `https://gemini.google.com/gem/${encodeURIComponent(projectId)}`;
	}
	return "https://gemini.google.com/app";
}

function normalizeProviderConversationTargetFields(
	provider: ProviderId,
	conversationId: string | null | undefined,
	providerConversationUrl: string | null | undefined,
): { conversationId: string; providerConversationUrl: string | null } | null {
	const rawConversationId = normalizeOptionalString(conversationId);
	const rawProviderConversationUrl = normalizeOptionalString(providerConversationUrl);
	if (provider !== "gemini") {
		if (!rawConversationId) return null;
		return {
			conversationId: rawConversationId,
			providerConversationUrl:
				rawProviderConversationUrl ?? resolveProviderConversationUrl(provider, rawConversationId),
		};
	}
	const normalizedConversationId =
		normalizeGeminiConversationId(rawConversationId) ??
		extractGeminiConversationIdFromProviderConversationUrl(rawProviderConversationUrl);
	if (!normalizedConversationId) return null;
	return {
		conversationId: normalizedConversationId,
		providerConversationUrl: resolveProviderConversationUrl(provider, normalizedConversationId),
	};
}

function normalizeGeminiConversationId(value: string | null): string | null {
	const raw = normalizeOptionalString(value);
	if (!raw) return null;
	const fromUrl = extractGeminiConversationIdFromProviderConversationUrl(raw);
	if (fromUrl) return fromUrl;
	if (/[?#&]/.test(raw)) return null;
	const appPathMatch = raw.match(/^\/?app\/([^/?#&]+)/i);
	const stripped = normalizeOptionalString(appPathMatch?.[1] ?? raw);
	if (!stripped || isIgnoredGeminiConversationId(stripped)) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(stripped)) return null;
	return stripped;
}

function extractGeminiConversationIdFromProviderConversationUrl(
	value: string | null,
): string | null {
	const raw = normalizeOptionalString(value);
	if (!raw || !/^https?:\/\//i.test(raw)) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.hostname === "gemini.google.com") {
			if (parsed.search || parsed.hash) return null;
			return normalizeGeminiConversationIdFromPathname(parsed.pathname);
		}
		return null;
	} catch {
		return null;
	}
}

function normalizeGeminiConversationIdFromPathname(pathname: string): string | null {
	const match = pathname.match(/^\/app\/([^/?#&]+)$/i);
	const conversationId = normalizeOptionalString(match?.[1]);
	if (!conversationId || isIgnoredGeminiConversationId(conversationId)) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(conversationId)) return null;
	return conversationId;
}

function normalizeMaxItems(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(500, Math.trunc(value)));
}

function normalizeProviderWorkTimeoutMs(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
	return Math.max(1, Math.trunc(value));
}

function normalizeHistoryMaterializationInteractionPolicy(
	value: HistoryMaterializationInteractionPolicy | null | undefined,
): HistoryMaterializationInteractionPolicy | null {
	if (!value) return null;
	return {
		maxInteractionsPerMinute: normalizeInteractionPolicyCount(value.maxInteractionsPerMinute, 20),
		conversationReadCooldownMs: normalizeInteractionPolicyCooldown(
			value.conversationReadCooldownMs,
		),
		pageRefreshCooldownMs: normalizeInteractionPolicyCooldown(value.pageRefreshCooldownMs),
		renavigationCooldownMs: normalizeInteractionPolicyCooldown(value.renavigationCooldownMs),
	};
}

function resolveHistoryMaterializationContextTimeoutMs(
	request: HistoryMaterializationCreateRequest,
): number {
	const policy = request.interactionPolicy;
	if (!policy) return DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS;
	const maxInteractionsPerMinute = normalizeInteractionPolicyCount(
		policy.maxInteractionsPerMinute,
		20,
	);
	const pacingAllowanceMs = Math.max(
		Math.ceil(60_000 / maxInteractionsPerMinute),
		normalizeInteractionPolicyCooldown(policy.conversationReadCooldownMs),
		normalizeInteractionPolicyCooldown(policy.pageRefreshCooldownMs),
		normalizeInteractionPolicyCooldown(policy.renavigationCooldownMs),
	);
	return Math.min(
		Number.MAX_SAFE_INTEGER,
		DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS + pacingAllowanceMs,
	);
}

function normalizeInteractionPolicyCount(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.max(1, Math.floor(value))
		: fallback;
}

function normalizeInteractionPolicyCooldown(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function waitForProviderWorkBoundary(
	request: HistoryMaterializationCreateRequest,
	now: () => Date,
	sleep: (ms: number) => Promise<void>,
): Promise<void> {
	const notBeforeMs = request.providerWorkNotBefore
		? Date.parse(request.providerWorkNotBefore)
		: Number.NaN;
	if (!Number.isFinite(notBeforeMs)) return;
	const waitMs = Math.max(0, notBeforeMs - now().getTime());
	if (waitMs > 0) await sleep(waitMs);
}

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQueuedStaleThresholdMs(job: HistoryMaterializationJob): number {
	return normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) ?? 120_000;
}

function normalizeListLimit(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 50;
	return Math.max(0, Math.min(500, Math.trunc(value)));
}

function decrementRemaining(value: number | null, count: number): number | null {
	if (value === null) return null;
	return Math.max(0, value - count);
}

function isActiveStatus(status: HistoryMaterializationJobStatus): boolean {
	return status === "queued" || status === "running";
}

function canRunningJobTimeout(job: HistoryMaterializationJob): boolean {
	return job.status === "running";
}

function resolveRunningStaleThresholdMs(job: HistoryMaterializationJob): number {
	return (
		normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) ??
		DEFAULT_RUNNING_STALE_THRESHOLD_MS
	);
}

function isTimedOutRunningJob(job: HistoryMaterializationJob, now: Date): boolean {
	if (!canRunningJobTimeout(job)) return false;
	const timeoutMs = resolveRunningStaleThresholdMs(job);
	const startedAtMs = Date.parse(job.startedAt ?? job.updatedAt);
	if (!Number.isFinite(startedAtMs)) return false;
	return now.getTime() - startedAtMs >= timeoutMs;
}

function usesAccountLibraryProviderWorkTimeout(job: HistoryMaterializationJob): boolean {
	return (
		job.source.type === "account_library_reconciliation" &&
		normalizeProviderWorkTimeoutMs(job.request.providerWorkTimeoutMs) !== null
	);
}

function formatRunningTimeoutMessage(job: HistoryMaterializationJob, timeoutMs: number): string {
	if (usesAccountLibraryProviderWorkTimeout(job)) {
		return `Account-library materialization job exceeded provider-work timeout (${timeoutMs}ms).`;
	}
	return `History materialization job exceeded running stale threshold (${timeoutMs}ms).`;
}

function summarizeHistoryMaterializationJobScheduler(
	job: HistoryMaterializationJob,
	now: Date,
	options: { scheduled: boolean },
): HistoryMaterializationJobSchedulerDiagnostics {
	const generatedAt = now.toISOString();
	const createdAtMs = Date.parse(job.createdAt);
	const startedAtMs = Date.parse(job.startedAt ?? "");
	const nowMs = now.getTime();
	const queuedAgeMs =
		job.status === "queued" && Number.isFinite(createdAtMs)
			? Math.max(0, nowMs - createdAtMs)
			: null;
	const runAgeMs =
		job.status === "running" && Number.isFinite(startedAtMs)
			? Math.max(0, nowMs - startedAtMs)
			: null;
	const queuedToStartLatencyMs =
		Number.isFinite(createdAtMs) && Number.isFinite(startedAtMs)
			? Math.max(0, startedAtMs - createdAtMs)
			: null;
	const terminal = !isActiveStatus(job.status);
	const queuedStaleThresholdMs = normalizeQueuedStaleThresholdMs(job);
	const staleQueued =
		job.status === "queued" &&
		!options.scheduled &&
		queuedAgeMs !== null &&
		queuedAgeMs >= queuedStaleThresholdMs;
	const runningTimedOut = isTimedOutRunningJob(job, now);
	const stale = staleQueued || runningTimedOut;
	const staleReason = staleQueued
		? `queued account-library materialization job has not been scheduled by this API process for ${queuedAgeMs}ms (threshold ${queuedStaleThresholdMs}ms)`
		: runningTimedOut
			? usesAccountLibraryProviderWorkTimeout(job)
				? `running account-library materialization job exceeded provider-work timeout (${resolveRunningStaleThresholdMs(job)}ms)`
				: `running history materialization job exceeded stale threshold (${resolveRunningStaleThresholdMs(job)}ms)`
			: null;
	const dispatchState = terminal
		? "terminal"
		: job.status === "running"
			? "running"
			: options.scheduled
				? "scheduled"
				: "unscheduled";
	const state = job.status === "queued" && staleQueued ? "stale_queued" : job.status;
	return {
		object: "history_materialization_job_scheduler",
		generatedAt,
		state,
		dispatchState,
		queuedAgeMs,
		runAgeMs,
		queuedToStartLatencyMs,
		stale,
		staleReason,
	};
}

function matchesStatusFilter(
	job: HistoryMaterializationJob,
	status: HistoryMaterializationJobListRequest["status"] | null,
): boolean {
	if (!status) return true;
	if (status === "active") return isActiveStatus(job.status);
	if (status === "terminal") return !isActiveStatus(job.status);
	return job.status === status;
}

async function findActiveJobForSource(
	store: HistoryMaterializationJobStore,
	sourceKey: string,
	recoverTimedOutJob: (
		job: HistoryMaterializationJob | null,
	) => Promise<HistoryMaterializationJob | null>,
): Promise<HistoryMaterializationJob | null> {
	const jobs = await store.listJobs();
	for (const job of jobs) {
		if (job.sourceKey !== sourceKey || !isActiveStatus(job.status)) continue;
		const recovered = await recoverTimedOutJob(job);
		if (recovered && isActiveStatus(recovered.status)) return recovered;
	}
	return null;
}

function summarizeJobs(
	jobs: HistoryMaterializationJob[],
): HistoryMaterializationJobListResult["metrics"] {
	const byStatus: Record<string, number> = {};
	let active = 0;
	let terminal = 0;
	for (const job of jobs) {
		byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
		if (isActiveStatus(job.status)) active += 1;
		else terminal += 1;
	}
	return {
		total: jobs.length,
		byStatus,
		active,
		terminal,
	};
}

async function readJobStoreFile(filePath: string): Promise<HistoryMaterializationJob[]> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isHistoryMaterializationJob).map(normalizeHistoryMaterializationJob);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

async function writeJobStoreFile(
	filePath: string,
	jobs: HistoryMaterializationJob[],
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${randomUUID()}.tmp`;
	await fs.writeFile(tmpPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
	await fs.rename(tmpPath, filePath);
}

function isHistoryMaterializationJob(value: unknown): value is HistoryMaterializationJob {
	if (!isRecord(value)) return false;
	return (
		value.object === "history_materialization_job" &&
		typeof value.id === "string" &&
		isRecord(value.source) &&
		typeof value.sourceKey === "string" &&
		typeof value.status === "string"
	);
}

function normalizeHistoryMaterializationJob(
	job: HistoryMaterializationJob,
): HistoryMaterializationJob {
	return {
		...job,
		request: normalizeCreateRequest(job.request),
	};
}

function historyMaterializationJobError(error: unknown): HistoryMaterializationJob["error"] {
	if (error instanceof HistoryMaterializationError) {
		return {
			message: error.message,
			type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
			statusCode: error.statusCode,
		};
	}
	if (isProviderAuthPreflightError(error)) {
		return {
			message: error instanceof Error ? error.message : "Provider browser auth preflight failed.",
			type: "provider_auth_conflict",
			statusCode: 409,
		};
	}
	if (isProviderHumanVerificationError(error)) {
		return {
			message:
				error instanceof Error
					? error.message
					: "Provider human-verification guard requires manual clearance.",
			type: "provider_guard_required",
			statusCode: 409,
		};
	}
	return {
		message: error instanceof Error ? error.message : "History materialization job failed.",
		type: "internal_error",
		statusCode: 500,
	};
}

function isProviderAuthPreflightError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("browser auth preflight failed") ||
		message.includes("account_session_drift") ||
		message.includes("expected_identity_missing")
	);
}

function isProviderHumanVerificationError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /google\.com\/sorry|unusual traffic|recaptcha|captcha|human[-_ ]verification|anti[-_ ]?bot/i.test(
		message,
	);
}

function withRuntimeProfileSelection(
	config: ResolvedUserConfig | Record<string, unknown>,
	provider: ProviderId | null,
	runtimeProfile: string | null,
): Record<string, unknown> {
	return resolveRuntimeProfileUserConfig(config, {
		runtimeProfileId: runtimeProfile,
		provider,
	}) as Record<string, unknown>;
}

async function acquireHistoryMaterializationBrowserOperations(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMaterializationCreateRequest;
	jobId: string;
	dispatcher: BrowserOperationDispatcher | null;
	queue: boolean;
	queueTimeoutMs?: number;
	queuePollMs?: number;
}): Promise<BrowserOperationAcquiredResult[] | null> {
	if (!input.dispatcher) return [];
	const target = resolveHistoryMaterializationBrowserOperationTarget(input.config, input.request);
	if (!target) return [];
	const acquiredOperations: BrowserOperationAcquiredResult[] = [];
	try {
		for (const managedProfileDir of target.managedProfileDirs) {
			const operationInput = {
				managedProfileDir,
				serviceTarget: target.provider,
				kind: "browser-execution",
				operationClass: "exclusive-mutating",
				ownerCommand: input.queue
					? `history-materialization:${input.jobId}`
					: `history-materialization-recovery:${input.jobId}`,
			} as const;
			const acquired = input.queue
				? await input.dispatcher.acquireQueued(operationInput, {
						timeoutMs: normalizeHistoryMaterializationBrowserQueueNumber(
							input.queueTimeoutMs,
							10 * 60 * 1000,
						),
						pollMs: normalizeHistoryMaterializationBrowserQueueNumber(input.queuePollMs, 1000),
					})
				: await input.dispatcher.acquire(operationInput);
			if (!acquired.acquired) {
				if (input.queue) {
					throw new Error(formatBrowserOperationBusyResult(acquired));
				}
				await releaseHistoryMaterializationBrowserOperations(acquiredOperations);
				return null;
			}
			acquiredOperations.push(acquired);
		}
		return acquiredOperations;
	} catch (error) {
		await releaseHistoryMaterializationBrowserOperations(acquiredOperations);
		throw error;
	}
}

async function releaseHistoryMaterializationBrowserOperations(
	operations: BrowserOperationAcquiredResult[] | null,
): Promise<void> {
	if (!operations) return;
	for (const operation of [...operations].reverse()) {
		await operation.release();
	}
}

function resolveHistoryMaterializationBrowserOperationTarget(
	config: ResolvedUserConfig | Record<string, unknown>,
	request: HistoryMaterializationCreateRequest,
): { provider: ProviderId; managedProfileDirs: string[] } | null {
	const provider = normalizeProviderId(request.provider) ?? null;
	if (!provider) return null;
	const runtimeProfile = request.runtimeProfile ?? null;
	const browserProfileName = resolveHistoryMaterializationBrowserProfileName(
		config,
		runtimeProfile,
		request.browserProfile ?? null,
	);
	const launchPlan = resolveBrowserLaunchPlan({
		source: { kind: "user-config", config: config as ResolvedUserConfig },
		intent: {
			provider,
			runtimeProfileId: runtimeProfile,
			browserProfileId: browserProfileName,
		},
	});
	const managedProfileDirs = new Set<string>();
	if (launchPlan.launchPolicy.manualLoginProfileDir) {
		managedProfileDirs.add(path.resolve(launchPlan.launchPolicy.manualLoginProfileDir));
	}
	managedProfileDirs.add(path.resolve(launchPlan.managedBrowserProfile.directory));
	return { provider, managedProfileDirs: [...managedProfileDirs].sort() };
}

function normalizeHistoryMaterializationBrowserQueueNumber(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.trunc(value)
		: fallback;
}

async function cleanupHistoryMaterializationManagedBrowser(
	config: ResolvedUserConfig | Record<string, unknown>,
	request: HistoryMaterializationCreateRequest,
): Promise<void> {
	const target = resolveHistoryMaterializationBrowserOperationTarget(config, request);
	if (!target) return;
	for (const managedProfileDir of target.managedProfileDirs) {
		const primaryPid = await findChromePidUsingUserDataDir(managedProfileDir).catch(() => null);
		const pids = await findHistoryMaterializationManagedBrowserPids(managedProfileDir);
		if (primaryPid) pids.add(primaryPid);
		if (pids.size === 0) continue;
		await terminateHistoryMaterializationManagedBrowserPids([...pids]).catch(() => undefined);
		const remainingPrimaryPid = await findChromePidUsingUserDataDir(managedProfileDir).catch(
			() => null,
		);
		const remainingPids = await findHistoryMaterializationManagedBrowserPids(managedProfileDir);
		if (remainingPrimaryPid) remainingPids.add(remainingPrimaryPid);
		if (remainingPids.size > 0) {
			throw new Error(
				`Managed browser profile remained owned by PID ${[...remainingPids].sort((a, b) => a - b)[0]} after bounded cleanup.`,
			);
		}
	}
}

async function reconcileStoppedHistoryMaterializationChatgptLeases(input: {
	config: ResolvedUserConfig | Record<string, unknown>;
	request: HistoryMaterializationCreateRequest;
	retireIdleChatgptLeasesAfterManagedBrowserShutdown: typeof retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown;
}): Promise<void> {
	const target = resolveHistoryMaterializationBrowserOperationTarget(input.config, input.request);
	if (!target || target.provider !== "chatgpt" || !input.request.runtimeProfile) return;
	for (const managedBrowserProfile of target.managedProfileDirs) {
		await input.retireIdleChatgptLeasesAfterManagedBrowserShutdown({
			userConfig: input.config,
			runtimeProfileId: input.request.runtimeProfile,
			managedBrowserProfile,
		});
	}
}

function resolveHistoryMaterializationBrowserProfileName(
	config: ResolvedUserConfig | Record<string, unknown>,
	runtimeProfile: string | null,
	requestBrowserProfile: string | null,
): string | null {
	if (requestBrowserProfile) return requestBrowserProfile;
	if (!runtimeProfile || !isRecord(config)) return null;
	const runtimeProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : null;
	const runtimeProfileConfig = isRecord(runtimeProfiles?.[runtimeProfile])
		? runtimeProfiles[runtimeProfile]
		: null;
	return readRecordString(runtimeProfileConfig, ["browserProfile", "browserFamily"]);
}

async function findHistoryMaterializationManagedBrowserPids(
	managedProfileDir: string,
): Promise<Set<number>> {
	const pids = new Set<number>();
	try {
		const { stdout } = await execFileAsync("ps", ["-ax", "-o", "pid,args"], {
			maxBuffer: 10 * 1024 * 1024,
		});
		for (const line of String(stdout ?? "").split("\n")) {
			const match = line.match(/^\s*(\d+)\s+(.*)$/);
			if (!match) continue;
			const pid = Number.parseInt(match[1], 10);
			const commandLine = match[2] ?? "";
			const lowerCommandLine = commandLine.toLowerCase();
			if (!Number.isFinite(pid) || pid <= 0) continue;
			if (!lowerCommandLine.includes("chrome") && !lowerCommandLine.includes("chromium")) {
				continue;
			}
			if (!commandLine.includes("--user-data-dir") || !commandLine.includes(managedProfileDir)) {
				continue;
			}
			pids.add(pid);
		}
	} catch {
		// best effort
	}
	return pids;
}

async function terminateHistoryMaterializationManagedBrowserPids(pids: number[]): Promise<void> {
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// already stopped
		}
	}
	await new Promise((resolve) => setTimeout(resolve, 1500));
	for (const pid of pids) {
		try {
			process.kill(pid, 0);
			process.kill(pid, "SIGKILL");
		} catch {
			// already stopped
		}
	}
}

function resolveProviderConversationUrl(
	provider: ProviderId,
	conversationId: string | null,
): string | null {
	if (!conversationId) return null;
	if (provider === "gemini")
		return `https://gemini.google.com/app/${encodeURIComponent(conversationId)}`;
	if (provider === "chatgpt") return `https://chatgpt.com/c/${encodeURIComponent(conversationId)}`;
	if (provider === "grok") return `https://grok.com/chat/${encodeURIComponent(conversationId)}`;
	return null;
}

function resolveProviderProjectUrl(provider: ProviderId, projectId: string | null): string | null {
	if (!projectId) return null;
	if (provider === "chatgpt")
		return `https://chatgpt.com/g/${encodeURIComponent(projectId)}/project`;
	if (provider === "gemini")
		return `https://gemini.google.com/gem/${encodeURIComponent(projectId)}`;
	return null;
}

function readCatalogStringField(item: unknown, fields: string[]): string | null {
	if (!isRecord(item)) return null;
	return readRecordString(item, fields);
}

function readCatalogNumberField(item: unknown, fields: string[]): number {
	if (!isRecord(item)) return 0;
	for (const field of fields) {
		const value = item[field];
		const number = readNumber(value);
		if (number !== null) return number;
	}
	return 0;
}

function readRecordString(value: unknown, keys: string[]): string | null {
	if (!isRecord(value)) return null;
	for (const key of keys) {
		const entry = value[key];
		if (typeof entry === "string" && entry.trim().length > 0) return entry.trim();
		if (typeof entry === "number" && Number.isFinite(entry)) return String(entry);
	}
	return null;
}

function readRecordValue(value: unknown, keys: string[]): unknown {
	if (!isRecord(value)) return undefined;
	for (const key of keys) {
		if (Object.hasOwn(value, key)) return value[key];
	}
	return undefined;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMediaGenerationType(value: unknown): MediaGenerationType | null {
	const normalized = typeof value === "string" ? value.toLowerCase() : "";
	if (normalized.includes("image") || /\.(avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/i.test(normalized))
		return "image";
	if (normalized.includes("video") || /\.(m4v|mov|mp4|webm)(?:[?#\s]|$)/i.test(normalized))
		return "video";
	if (normalized.includes("music") || normalized.includes("song") || normalized.includes("track"))
		return "music";
	return null;
}

function normalizeMediaMatchTitle(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
	return normalized.length > 0 ? normalized : null;
}

function parseTimestampMs(value: string | null | undefined): number | null {
	const timestamp = Date.parse(String(value ?? ""));
	return Number.isFinite(timestamp) ? timestamp : null;
}

function countCatalogMediaByConversation(items: unknown[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) {
		const metadata = isRecord(item) && isRecord(item.metadata) ? item.metadata : {};
		const conversationId =
			readCatalogStringField(item, ["conversationId"]) ??
			readRecordString(metadata, ["conversationId"]);
		if (!conversationId) continue;
		counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1);
	}
	return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function calculateFileSha256(localPath: string | null): Promise<string | null> {
	if (!localPath) return null;
	try {
		const buffer = await fs.readFile(localPath);
		return createHash("sha256").update(buffer).digest("hex");
	} catch {
		return null;
	}
}

function stableKey(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((entry) => stableKey(entry)).join(",")}]`;
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
