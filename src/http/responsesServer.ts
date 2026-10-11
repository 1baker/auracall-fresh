import { applyDesktopProfileAssignments } from "../browser/service/desktopProfileAssignments.js";
import { listDesktopRuntimeProfiles, wakeDesktopRuntimeProfile } from '../browser/service/desktopRuntimeProfiles.js';
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import CDP from "../browser/cdp.js";
import { NativeDesktopControlError } from "../browser/service/nativeDesktopControl.js";
import { captureDesktopView, closeDesktopBrowser, listDesktopViews, openDesktopView, takeDesktopControl, releaseDesktopControl, expireInactiveDesktopControls, desktopControlStatus } from "../browser/service/desktopClient.js";
import { renderDesktopClientPage } from "./desktopClientPage.js";
import type { OptionValues } from "commander";
import { ZodError, z } from "zod";
import {
	findChromeProcessUsingUserDataDir,
	isDevToolsResponsive,
} from "../../packages/browser-service/src/processCheck.js";
import { readDevToolsPort } from "../../packages/browser-service/src/profileState.js";
import {
	type AccountMirrorArtifactRecoveryPlanner,
	type AccountMirrorArtifactRecoveryPlanRequest,
	type AccountMirrorArtifactRecoveryPlanResult,
	createAccountMirrorArtifactRecoveryPlanner,
} from "../accountMirror/artifactRecoveryPlanner.js";
import { createAccountMirrorPersistence } from "../accountMirror/cachePersistence.js";
import {
	type AccountMirrorCatalogItemResult,
	type AccountMirrorCatalogKind,
	type AccountMirrorCatalogResult,
	type AccountMirrorCatalogService,
	createAccountMirrorCatalogService,
} from "../accountMirror/catalogService.js";
import {
	type AccountMirrorCompletionOperation,
	type AccountMirrorCompletionService,
	createAccountMirrorCompletionService,
	projectAccountMirrorCompletionForMonitoring,
} from "../accountMirror/completionService.js";
import { createAccountMirrorCompletionStore } from "../accountMirror/completionStore.js";
import {
	type AccountMirrorLiveFollowCyclePhase,
	chooseLiveFollowCyclePhase,
} from "../accountMirror/liveFollowCycleDecision.js";
import {
	classifyLiveFollowTarget,
	reconcileConfiguredAccountMirrorLiveFollow,
} from "../accountMirror/liveFollowReconciler.js";
import type { AccountMirrorProvider } from "../accountMirror/politePolicy.js";
import { createAccountMirrorPreviewSessionStore } from "../accountMirror/previewSessionStore.js";
import {
	clearAccountMirrorProviderGuard,
	DEFAULT_ACCOUNT_MIRROR_PROVIDER_GUARD_CLEAR_COOLDOWN_MS,
} from "../accountMirror/providerGuardControl.js";
import { classifyAccountMirrorProviderTrafficOutcome } from "../accountMirror/providerTrafficOutcome.js";
import { createAccountMirrorProviderWorkCoordinator } from "../accountMirror/providerWorkCoordinator.js";
import {
	type AccountMirrorReconciliationCampaign,
	type AccountMirrorReconciliationCampaignService,
	AccountMirrorReconciliationError,
	createAccountMirrorReconciliationCampaignService,
} from "../accountMirror/reconciliationCampaignService.js";
import { createAccountMirrorReconciliationCampaignStore } from "../accountMirror/reconciliationCampaignStore.js";
import {
	type AccountMirrorDevelopmentPolicy,
	AccountMirrorRefreshError,
	type AccountMirrorRefreshResult,
	type AccountMirrorRefreshService,
	createAccountMirrorRefreshService,
	resolveAccountMirrorDevelopmentPolicy,
} from "../accountMirror/refreshService.js";
import {
	readAccountMirrorSchedulerControlState,
	writeAccountMirrorSchedulerControlState,
} from "../accountMirror/schedulerControlState.js";
import {
	type AccountMirrorSchedulerCompactHistory,
	summarizeAccountMirrorSchedulerHistory,
} from "../accountMirror/schedulerHistorySummary.js";
import {
	type AccountMirrorSchedulerPassHistory,
	type AccountMirrorSchedulerPassLedger,
	createAccountMirrorSchedulerPassLedger,
} from "../accountMirror/schedulerLedger.js";
import {
	type AccountMirrorSchedulerPassResult,
	type AccountMirrorSchedulerPassService,
	createAccountMirrorSchedulerPassService,
} from "../accountMirror/schedulerService.js";
import {
	type AccountMirrorCollectorDiagnosticEvent,
	type AccountMirrorStatusEntry,
	type AccountMirrorStatusRegistry,
	type AccountMirrorStatusSummary,
	createAccountMirrorStatusRegistry,
} from "../accountMirror/statusRegistry.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import { readChatgptRateLimitGuardState } from "../browser/chatgptRateLimitGuard.js";
import { runConfiguredChatgptTabMaintenance } from "../browser/configuredChatgptTabMaintenance.js";
import { clearConfiguredAggregateProviderWarning } from "../browser/configuredProviderWarningClear.js";
import {
	acceptDomDriftObservation,
	type DomDriftObservationStatus,
	listDomDriftObservations,
} from "../browser/domDriftObservations.js";
import {
	type BrowserDiagnosticsService,
	probeBrowserRunDiagnostics,
} from "../browser/liveDiagnostics.js";
import {
	probeChatgptBrowserServiceState,
	probeGeminiBrowserServiceState,
	probeGrokBrowserServiceState,
} from "../browser/liveServiceState.js";
import { clearPersistedBrowserProviderGuard } from "../browser/providerGuardControl.js";
import { BrowserService } from "../browser/service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "../browser/service/profileConfig.js";
import {
	type BrowserInstanceLease,
	type BrowserInstanceOperation,
	type BrowserInstanceOwner,
	getInstance as getBrowserRegistryInstance,
} from "../browser/service/stateRegistry.js";
import { createTabAffinityMaintenanceLoop } from "../browser/tabAffinityMaintenanceLoop.js";
import {
	type BrowserTabConcurrencyStatus,
	createBrowserTabConcurrencyRuntime,
} from "../browser/tabConcurrencyRuntime.js";
import {
	agentConfigUpsertInputSchema,
	agentRegistrySnapshotSchema,
	createAgentTeamConfigService,
	teamConfigUpsertInputSchema,
} from "../config/agentConfigService.js";
import type { EffectiveAgent, EffectiveAgentCatalog } from "../config/agentRegistryCatalog.js";
import { type AgentRegistryStore, createAgentRegistryStore } from "../config/agentRegistryStore.js";
import { readApiKeyDiagnosticsFromEnvFile } from "../config/apiKeyEnvDiagnostics.js";
import { deleteApiKey, issueApiKey } from "../config/apiKeyIssuer.js";
import {
	getCurrentRuntimeProfiles,
	type ProjectedAgent,
	resolveHostLocalActionExecutionPolicy,
} from "../config/model.js";
import { SEMANTIC_MODEL_SELECTORS } from "../config/modelSelector.js";
import type { ResolvedUserConfig } from "../config.js";
import { createChatgptBrowserHandoffTargetAdapter } from "../handoff/chatgptBrowserAdapter.js";
import {
	buildHandoffResumePlan,
	exportHandoffManualBundle,
	readHandoffStatus,
	recoverHandoffLive,
	repairHandoffPacket,
} from "../handoff/service.js";
import { probeMediaGenerationBrowserDiagnostics } from "../media/browserDiagnostics.js";
import {
	createBrowserMediaGenerationExecutor,
	createBrowserMediaGenerationMaterializer,
} from "../media/browserExecutor.js";
import {
	createMediaGenerationService,
	MediaGenerationExecutionError,
	type MediaGenerationServiceDeps,
} from "../media/service.js";
import { summarizeMediaGenerationStatus } from "../media/statusSummary.js";
import type { MediaGenerationRequest } from "../media/types.js";
import { MODEL_CONFIGS } from "../oracle/config.js";
import {
	createLazyLiveFollowPreflightRunner,
	type LazyLiveFollowPreflightRun,
	type LazyLiveFollowPreflightRunner,
	type PreflightStatusSummary,
	readLazyLiveFollowPreflightRun,
	readPreflightStatusSummary,
} from "../preflightStatus.js";
import {
	AgentSetupPackageInputSchema,
	type AgentSetupPackageService,
	createAgentSetupPackageService,
} from "../projects/agentSetupPackageService.js";
import {
	createProjectEnsureService,
	ProjectEnsureInputSchema,
	type ProjectEnsureService,
} from "../projects/projectEnsureService.js";
import {
	createTenantPoolTeamEnsureService,
	TenantPoolTeamEnsureInputSchema,
	type TenantPoolTeamEnsureService,
} from "../projects/tenantPoolTeamEnsureService.js";
import type { AuraCallRunStatus } from "../runStatus.js";
import { readAuraCallRunStatus } from "../runStatus.js";
import { createExecutionRequest } from "../runtime/apiModel.js";
import type {
	ExecutionRequest,
	ExecutionRequestExtensionHints,
	ExecutionResponse,
} from "../runtime/apiTypes.js";
import {
	ArchiveMaterializationJobControlError,
	type ArchiveMaterializationJobCreateResult,
	type ArchiveMaterializationJobListResult,
	type ArchiveMaterializationJobService,
	createArchiveMaterializationJobService,
} from "../runtime/archiveMaterializationJobService.js";
import {
	type ArchiveItemMaterializationResult,
	ArchiveMaterializationError,
	type ArchiveMaterializationService,
	createArchiveMaterializationService,
} from "../runtime/archiveMaterializationService.js";
import {
	createRunArchiveService,
	type RunArchiveAssetLookupResult,
	type RunArchiveAssetResult,
	type RunArchiveEvidenceResult,
	type RunArchiveItemResult,
	type RunArchiveListRequest,
	type RunArchiveListResult,
	type RunArchiveService,
} from "../runtime/archiveService.js";
import { createConfiguredExecutionRunAffinity } from "../runtime/configuredAffinity.js";
import { createConfiguredStoredStepExecutor } from "../runtime/configuredExecutor.js";
import type { ExecutionRuntimeControlContract } from "../runtime/contract.js";
import { createExecutionRuntimeControl } from "../runtime/control.js";
import {
	createHistoryMaterializationService,
	type HistoryAccountLibraryReconciliationPreviewResult,
	HistoryMaterializationError,
	type HistoryMaterializationJob,
	HistoryMaterializationJobControlError,
	type HistoryMaterializationJobCreateResult,
	type HistoryMaterializationJobListResult,
	type HistoryMaterializationService,
	projectHistoryMaterializationJobForMonitoring,
} from "../runtime/historyMaterializationService.js";
import {
	type InspectRuntimeRunInput,
	inspectRuntimeRun,
	type ProbeRuntimeRunBrowserDiagnosticsInput,
	type ProbeRuntimeRunServiceStateInput,
	type RuntimeRunInspectionBrowserDiagnosticsProbeResult,
	type RuntimeRunInspectionBrowserDiagnosticsSummary,
	RuntimeRunInspectionError,
	type RuntimeRunInspectionPayload,
	type RuntimeRunInspectionServiceStateProbeResult,
} from "../runtime/inspection.js";
import { readLiveRuntimeRunServiceState } from "../runtime/liveServiceStateRegistry.js";
import { createLocalRunnerCapabilitySummary } from "../runtime/localRunnerCapabilities.js";
import {
	normalizeResponseBatchDispatchRequest,
	resolveResponseBatchDispatchPool,
} from "../runtime/responseBatchDispatchPool.js";
import {
	createResponseBatchExecutionGate,
	createResponseBatchService,
	ResponseBatchCreateRequestSchema,
	type ResponseBatchService,
} from "../runtime/responseBatchService.js";
import {
	createExecutionRequestFromRecord,
	createExecutionResponsesService,
	type ExecutionResponsesServiceDeps,
} from "../runtime/responsesService.js";
import {
	type ExecutionRunListItem,
	summarizeExecutionRunListItem,
} from "../runtime/runListSummary.js";
import {
	createExecutionRunnerControl,
	type ExecutionRunnerControlContract,
} from "../runtime/runnersControl.js";
import {
	createSearchProjectionService,
	type SearchProjectionRequest,
	type SearchProjectionResult,
	type SearchProjectionService,
} from "../runtime/searchProjectionService.js";
import {
	createExecutionServiceHost,
	type DrainStoredExecutionRunsUntilIdleResult,
	type ExecutionServiceHost,
	type ExecutionServiceHostDeps,
	type ExecutionServiceHostExecutionGate,
	type ExecutionServiceHostLocalClaimSummary,
	type ExecutionServiceHostOperatorControlInput,
	type ExecutionServiceHostOperatorControlResult,
	type ExecutionServiceHostRecoveryDetail,
	type ExecutionServiceHostRecoverySummary,
	type ExecutionServiceHostRunnerTopologySummary,
} from "../runtime/serviceHost.js";
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from "../runtime/stepOutputContract.js";
import {
	createTenantExecutionLimitGate,
	summarizeTenantExecutionLimits,
	type TenantExecutionLimitStatusSummary,
} from "../runtime/tenantExecutionLimits.js";
import type {
	ExecutionRunnerStatus,
	ExecutionRunSourceKind,
	ExecutionRunStatus,
} from "../runtime/types.js";
import { resolveConfig } from "../schema/resolver.js";
import {
	isLiveFollowTargetAttentionNeeded as isLiveFollowTargetAttentionNeededSummary,
	type LiveFollowHealthSummary,
	type LiveFollowTargetAccountSummary,
	type LiveFollowTargetRollup,
	summarizeLiveFollowHealth,
	summarizeLiveFollowMaterializationBacklog,
} from "../status/liveFollowHealth.js";
import {
	buildTeamRunExecutionPayload,
	type TeamRunExecutionPayload,
} from "../teams/executionPayload.js";
import {
	inspectTeamRunLinkage,
	TeamRunInspectionError,
	type TeamRunInspectionPayload,
} from "../teams/inspection.js";
import { createTeamRuntimeBridge, type TeamRuntimeBridge } from "../teams/runtimeBridge.js";
import { TaskRunSpecSchema } from "../teams/schema.js";
import { buildBoundedTeamTaskRunSpec } from "../teams/taskRunSpecBuilder.js";
import type { TaskRunSpec } from "../teams/types.js";
import { readTerminalSessionReceiptObservation } from "../terminalSessionReceipts.js";
import { getCliVersion } from "../version.js";
import { createBrowserWorkbenchCapabilityDiagnostics } from "../workbench/browserDiagnostics.js";
import { createBrowserWorkbenchCapabilityDiscovery } from "../workbench/browserDiscovery.js";
import { WorkbenchCapabilityReportRequestSchema } from "../workbench/schema.js";
import {
	createWorkbenchCapabilityService,
	type WorkbenchCapabilityServiceDeps,
} from "../workbench/service.js";

export const DEFAULT_BACKGROUND_DRAIN_INTERVAL_MS = 60_000;
export const DEFAULT_TAB_AFFINITY_MAINTENANCE_INTERVAL_MS = 60_000;
const TENANT_EXECUTION_LIMIT_STATUS_CACHE_MS = 5_000;
const DEFAULT_STALE_RUNNER_RETENTION = 100;
const ACCOUNT_MIRROR_COMPLETION_RECENT_STATUS_LIMIT = 10;

function scheduleDefaultUserApiServiceRestart(input: ApiServiceRestartRequest): void {
	setTimeout(() => {
		const child = spawn("systemctl", ["--user", "restart", input.unitName], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	}, input.delayMs).unref();
}

export interface ResponsesHttpServerOptions {
	host?: string;
	port?: number;
	dashboardUrl?: string;
	publicDashboardUrl?: string;
	serviceRouting?: ApiServiceRoutingConfig;
	logger?: (message: string) => void;
	recoverRunsOnStart?: boolean;
	recoverRunsOnStartMaxRuns?: number;
	recoverRunsOnStartSourceKind?: ExecutionRunSourceKind | "all";
	backgroundDrainIntervalMs?: number;
	accountMirrorSchedulerIntervalMs?: number;
	accountMirrorSchedulerDryRun?: boolean;
	tabAffinityMaintenanceIntervalMs?: number;
	resumeAccountMirrorCompletionsOnStart?: boolean;
	reconcileAccountMirrorLiveFollowOnStart?: boolean;
	accountMirrorProofScope?: {
		provider?: AccountMirrorProvider | null;
		runtimeProfileId?: string | null;
	} | null;
}

export interface ResponsesHttpServerDeps {
  desktopClient?: {
    list: () => ReturnType<typeof listDesktopViews>;
    profiles?: () => ReturnType<typeof listDesktopRuntimeProfiles>;
    wakeProfile?: (id: string, desktopName?: string) => ReturnType<typeof wakeDesktopRuntimeProfile>;
    closeBrowser?: (name: string, browserId: string) => ReturnType<typeof closeDesktopBrowser>;
    capture: (name: string, browserId: string) => ReturnType<typeof captureDesktopView>;
    view?: (name: string, browserId: string) => ReturnType<typeof openDesktopView>;
    takeControl?: (name: string, browserId: string, token: string) => ReturnType<typeof takeDesktopControl>;
    controlStatus?: (name: string, browserId: string, token: string) => ReturnType<typeof desktopControlStatus>;
    releaseControl?: (name: string, browserId: string, token: string) => ReturnType<typeof releaseDesktopControl>;
  };
	control?: ExecutionRuntimeControlContract;
	runnersControl?: ExecutionRunnerControlContract;
	config?: Record<string, unknown>;
	now?: () => Date;
	generateResponseId?: () => string;
	executeStoredRunStep?: ExecutionResponsesServiceDeps["executeStoredRunStep"];
	mediaGenerationExecutor?: MediaGenerationServiceDeps["executor"];
	mediaGenerationMaterializer?: MediaGenerationServiceDeps["materializer"];
	workbenchCapabilityCatalog?: WorkbenchCapabilityServiceDeps["catalog"];
	discoverWorkbenchCapabilities?: WorkbenchCapabilityServiceDeps["discoverCapabilities"];
	diagnoseWorkbenchCapabilities?: WorkbenchCapabilityServiceDeps["diagnoseCapabilities"];
	createProjectEnsureService?: typeof createProjectEnsureService;
	projectEnsureService?: ProjectEnsureService;
	agentSetupPackageService?: AgentSetupPackageService;
	tenantPoolTeamEnsureService?: TenantPoolTeamEnsureService;
	createResponseBatchService?: typeof createResponseBatchService;
	responseBatchService?: ResponseBatchService;
	runArchiveService?: RunArchiveService;
	archiveMaterializationService?: ArchiveMaterializationService;
	archiveMaterializationJobService?: ArchiveMaterializationJobService;
	historyMaterializationService?: HistoryMaterializationService;
	searchProjectionService?: SearchProjectionService;
	accountMirrorArtifactRecoveryPlanner?: AccountMirrorArtifactRecoveryPlanner;
	executionHost?: ExecutionServiceHost;
	localActionExecutionPolicy?: ExecutionServiceHostDeps["localActionExecutionPolicy"];
	probeRuntimeRunServiceState?: (
		input: ProbeRuntimeRunServiceStateInput,
	) => Promise<RuntimeRunInspectionServiceStateProbeResult | null>;
	probeRuntimeRunBrowserDiagnostics?: (
		input: ProbeRuntimeRunBrowserDiagnosticsInput,
	) => Promise<RuntimeRunInspectionBrowserDiagnosticsProbeResult | null>;
	probeMediaGenerationBrowserDiagnostics?: typeof probeMediaGenerationBrowserDiagnostics;
	accountMirrorStatusRegistry?: AccountMirrorStatusRegistry;
	accountMirrorRefreshService?: AccountMirrorRefreshService;
	accountMirrorCatalogService?: AccountMirrorCatalogService;
	accountMirrorSchedulerService?: AccountMirrorSchedulerPassService;
	accountMirrorSchedulerLedger?: AccountMirrorSchedulerPassLedger;
	accountMirrorCompletionService?: AccountMirrorCompletionService;
	accountMirrorReconciliationCampaignService?: AccountMirrorReconciliationCampaignService;
	accountMirrorBrowserProcessStatus?: HttpBrowserProcessStatusResponse | null;
	agentRegistryStore?: AgentRegistryStore | null;
	preflightRunner?: LazyLiveFollowPreflightRunner;
	terminateProcess?: (pid: number, signal: NodeJS.Signals) => void;
	scheduleApiServiceRestart?: (input: ApiServiceRestartRequest) => void;
	runTabAffinityMaintenance?: () => Promise<void>;
	readTabConcurrencyStatus?: () => Promise<BrowserTabConcurrencyStatus>;
	env?: Record<string, string | undefined>;
}

export interface ResponsesHttpServerInstance {
	port: number;
	close(): Promise<void>;
}

export function resolveTabAffinityMaintenanceIntervalMs(input: {
	userConfig: ResolvedUserConfig | null;
	configuredIntervalMs?: number;
	disabled?: boolean;
}): number {
	if (input.disabled) return 0;
	if (input.configuredIntervalMs !== undefined) {
		return Math.max(0, input.configuredIntervalMs);
	}
	if (!input.userConfig) return 0;
	if (input.userConfig.browser?.tabConcurrencyMode === "tab-affinity") {
		return DEFAULT_TAB_AFFINITY_MAINTENANCE_INTERVAL_MS;
	}
	for (const runtimeProfileId of Object.keys(
		getCurrentRuntimeProfiles(input.userConfig as Record<string, unknown>),
	)) {
		const runtimeConfig = resolveRuntimeProfileUserConfig(input.userConfig, {
			runtimeProfileId,
			provider: "chatgpt",
		}) as ResolvedUserConfig;
		if (runtimeConfig.browser?.tabConcurrencyMode === "tab-affinity") {
			return DEFAULT_TAB_AFFINITY_MAINTENANCE_INTERVAL_MS;
		}
	}
	return 0;
}

function resolveTabConcurrencyStatusUserConfig(
	userConfig: ResolvedUserConfig | null,
): ResolvedUserConfig {
	if (!userConfig || userConfig.browser?.tabConcurrencyMode === "tab-affinity") {
		return userConfig ?? ({} as ResolvedUserConfig);
	}
	for (const runtimeProfileId of Object.keys(
		getCurrentRuntimeProfiles(userConfig as Record<string, unknown>),
	)) {
		const runtimeConfig = resolveRuntimeProfileUserConfig(userConfig, {
			runtimeProfileId,
			provider: "chatgpt",
		}) as ResolvedUserConfig;
		if (runtimeConfig.browser?.tabConcurrencyMode === "tab-affinity") {
			return runtimeConfig;
		}
	}
	return userConfig;
}

function composeExecutionGates(
	...gates: ExecutionServiceHostExecutionGate[]
): ExecutionServiceHostExecutionGate {
	return async (record) => {
		for (const gate of gates) {
			const result = await gate(record);
			if (!result.allowed) return result;
		}
		return { allowed: true };
	};
}

interface ServerOwnedDrainOptions {
	runId?: string;
	sourceKind?: ExecutionRunSourceKind;
	candidateStatuses?: ExecutionRunStatus[];
	maxRuns?: number;
}

export interface ServeResponsesHttpOptions extends ResponsesHttpServerOptions {
	listenPublic?: boolean;
	cliOptions?: OptionValues;
	executeStoredRunStep?: ResponsesHttpServerDeps["executeStoredRunStep"];
	mediaGenerationExecutor?: ResponsesHttpServerDeps["mediaGenerationExecutor"];
	probeRuntimeRunServiceState?: ResponsesHttpServerDeps["probeRuntimeRunServiceState"];
	probeRuntimeRunBrowserDiagnostics?: ResponsesHttpServerDeps["probeRuntimeRunBrowserDiagnostics"];
	terminateProcess?: ResponsesHttpServerDeps["terminateProcess"];
}

interface HttpErrorPayload {
	error: {
		message: string;
		type: string;
		response_id?: string;
		response_status?: string;
		response_poll_path?: string;
		retry_after_seconds?: number;
	};
}

class HttpInvalidRequestError extends Error {}

interface HttpModelDescriptor {
	id: string;
	object: "model";
	created: number;
	owned_by: string;
	metadata?: {
		kind: "provider_model" | "agent" | "semantic_model_selector";
		provider?: string;
		service?: string;
		executionReady?: boolean;
		agent?: ProjectedAgent;
		label?: string;
	};
}

interface HttpModelListResponse {
	object: "list";
	data: HttpModelDescriptor[];
}

interface HttpChatCompletionMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface HttpChatCompletionRequest {
	model: string;
	messages: HttpChatCompletionMessage[];
	stream?: boolean;
	response_format?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	auracall?: ExecutionRequestExtensionHints;
	syncTimeoutMs?: number;
}

interface HttpChatCompletionResponse {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: "assistant";
			content: string;
		};
		finish_reason: "stop" | null;
	}>;
	usage?: {
		prompt_tokens: number | null;
		completion_tokens: number | null;
		total_tokens: number | null;
	};
	metadata?: ExecutionResponse["metadata"];
}

const DEFAULT_CHAT_COMPLETION_SYNC_TIMEOUT_MS = 30_000;
const CHAT_COMPLETION_RETRY_AFTER_SECONDS = 30;

interface HttpRecoveryDetailResponse {
	object: "recovery_detail";
	detail: ExecutionServiceHostRecoveryDetail;
}

interface HttpTeamRunInspectionResponse {
	object: "team_run_inspection";
	inspection: TeamRunInspectionPayload;
}

interface HttpTeamRunCreateResponse {
	object: "team_run";
	taskRunSpec: TaskRunSpec;
	execution: TeamRunExecutionPayload;
	links: {
		teamInspection: string;
		runtimeInspection: string;
		responseReadback: string;
	};
}

interface HttpRuntimeRunInspectionResponse {
	object: "runtime_run_inspection";
	inspection: RuntimeRunInspectionPayload;
}

interface HttpRuntimeRunListResponse {
	object: "list";
	data: ExecutionRunListItem[];
	count: number;
}

interface HttpRunArchiveResponse extends RunArchiveListResult {}
interface HttpRunArchiveItemResponse extends RunArchiveItemResult {}
interface HttpRunArchiveAssetLookupResponse extends RunArchiveAssetLookupResult {}
interface HttpRunArchiveAssetResponse extends RunArchiveAssetResult {}
interface HttpRunArchiveEvidenceResponse extends RunArchiveEvidenceResult {}
interface HttpAccountMirrorRefreshResponse extends AccountMirrorRefreshResult {}
interface HttpAccountMirrorCatalogResponse extends AccountMirrorCatalogResult {}
interface HttpAccountMirrorCatalogItemResponse extends AccountMirrorCatalogItemResult {}
interface HttpAccountMirrorSchedulerHistoryResponse extends AccountMirrorSchedulerCompactHistory {}
interface HttpAccountMirrorCompletionResponse extends AccountMirrorCompletionOperation {}
interface HttpAccountMirrorCompletionListResponse {
	object: "list";
	data: AccountMirrorCompletionOperation[];
	count: number;
}
interface HttpAccountMirrorReconciliationResponse extends AccountMirrorReconciliationCampaign {}
interface HttpAccountMirrorReconciliationListResponse {
	object: "list";
	data: AccountMirrorReconciliationCampaign[];
	count: number;
}

interface HttpBrowserProcessTargetSummary {
	targetId: string | null;
	type: string | null;
	url: string | null;
	title: string | null;
	isBlankPage: boolean;
}

interface HttpBrowserProcessStatusEntry {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	managedProfileDir: string;
	owner: BrowserInstanceOwner | null;
	operation: BrowserInstanceOperation | null;
	lease: BrowserInstanceLease | null;
	pid: number | null;
	port: number | null;
	host: string;
	processAlive: boolean;
	devToolsResponsive: boolean;
	launchCommandHasBlankArg: boolean;
	openBlankPageCount: number;
	pageTargetCount: number;
	targets: HttpBrowserProcessTargetSummary[];
	error: string | null;
}

interface HttpBrowserProcessStatusResponse {
	object: "browser_process_status";
	generatedAt: string;
	metrics: {
		configuredTargets: number;
		processesAlive: number;
		responsiveDevTools: number;
		launchBlankArg: number;
		openBlankPages: number;
	};
	entries: HttpBrowserProcessStatusEntry[];
}

type AccountMirrorSchedulerWakeReason =
	| "startup-cadence"
	| "cadence"
	| "operator-run-once"
	| "operator-foreground-pressure-proof"
	| "operator-resume"
	| "media-generation-settled"
	| "response-drain-completed";

type AccountMirrorSchedulerOperatorPosture =
	| "disabled"
	| "paused"
	| "running"
	| "scheduled"
	| "waiting"
	| "ready"
	| "healthy"
	| "backpressured";

interface AccountMirrorSchedulerOperatorStatus {
	posture: AccountMirrorSchedulerOperatorPosture;
	reason: string;
	backpressureReason: string | null;
}

interface AccountMirrorSchedulerForegroundWorkStatus {
	active: boolean;
	activeRequestCount: number;
	drainReservations: number;
	backgroundDrainScheduled: boolean;
	backgroundDrainState: HttpStatusResponse["backgroundDrain"]["state"];
}

interface AccountMirrorCompletionStatusSummary {
	object: "account_mirror_completion_summary";
	generatedAt: string;
	limits: {
		recent: number;
	};
	omitted: {
		recent: number;
	};
	metrics: {
		total: number;
		active: number;
		queued: number;
		running: number;
		idle_waiting: number;
		paused: number;
		completed: number;
		blocked: number;
		failed: number;
		cancelled: number;
	};
	active: AccountMirrorCompletionOperation[];
	recent: AccountMirrorCompletionOperation[];
}

type HttpRunControlActionId =
	| "completion.pause"
	| "completion.resume"
	| "completion.cancel"
	| "background-drain.pause"
	| "background-drain.resume"
	| "runtime.drain";

interface HttpRunControlReadinessAction {
	action: HttpRunControlActionId;
	label: string;
	available: boolean;
	blockedReason: string | null;
	method: "POST";
	route: "/status";
	payload: Record<string, unknown>;
	expectedTransition: string;
	expectedEvidence: string;
	startsProviderBrowserWork: boolean;
	stopsProviderBrowserWork: boolean;
	writesPersistentState: boolean;
	confirmation: string;
}

interface HttpRunControlReadinessResponse {
	object: "run_control_readiness";
	backgroundDrain: {
		state: HttpStatusResponse["backgroundDrain"]["state"];
		enabled: boolean;
		paused: boolean;
		actions: HttpRunControlReadinessAction[];
	};
	accountMirrorCompletionActionsById: Record<string, HttpRunControlReadinessAction[]>;
	runtimeRunActionsById: Record<string, HttpRunControlReadinessAction[]>;
	generatedFrom: {
		localRunnerId: string | null;
		localClaimSourceKind: ExecutionRunSourceKind | "all" | null;
	};
}

interface ApiServiceRoutingConfig {
	localHostname?: string;
	externalHostname?: string;
	localBaseUrl?: string;
	externalBaseUrl?: string;
	consolePath?: string;
	dashboardPath?: string;
	debugDashboardPath?: string;
	accountMirrorPath?: string;
	proxyTarget?: string;
	auth?: string;
	ingress?: string;
}

interface ApiAuthKeyPolicy {
	id: string;
	secret: string;
	agents?: string[];
	teams?: string[];
	services?: string[];
	runtimeProfiles?: string[];
}

interface ApiAuthPolicy {
	required: boolean;
	keys: ApiAuthKeyPolicy[];
}

interface ApiAuthContext {
	policy: ApiAuthPolicy;
	key: ApiAuthKeyPolicy | null;
}

type ApiAuthEnv = Record<string, string | undefined>;

interface OperatorDashboardRoutes {
	consolePath: string;
	dashboardPath: string;
	debugDashboardPath: string;
	accountMirrorPath: string;
	previewSessionPath: string;
	configPath: string;
	agentsPath: string;
}

interface ApiServiceDiscovery {
	bind: {
		host: string;
		port: number;
		url: string;
		localOnly: boolean;
	};
	local: {
		hostname?: string;
		baseUrl: string;
		dashboardUrl: string;
		accountMirrorUrl: string;
	};
	external?: {
		hostname?: string;
		baseUrl: string;
		dashboardUrl: string;
		accountMirrorUrl: string;
	};
	routing: {
		consolePath: string;
		dashboardPath: string;
		debugDashboardPath: string;
		accountMirrorPath: string;
		previewSessionPath: string;
		configPath: string;
		agentsPath: string;
		proxyTarget?: string;
		auth?: string;
		ingress?: string;
	};
}

interface HttpStatusResponse {
	object: "status";
	ok: true;
	version: string;
	mode: "development";
	api: {
		process: {
			pid: number;
			ppid: number;
			uptimeSeconds: number;
			argv: string[];
			execPath: string;
			cwd: string;
			nodeVersion: string;
		};
		managedService: {
			manager: "systemd-user";
			unitName: string;
			logPath: string;
			installCommand: string;
			restartCommand: string;
			statusCommand: string;
		};
	};
	binding: {
		host: string;
		port: number;
		localOnly: boolean;
		unauthenticated: boolean;
	};
	auth: {
		required: boolean;
		scheme: "none" | "bearer";
		keyCount: number;
		scoped: boolean;
	};
	serviceDiscovery: ApiServiceDiscovery;
	routes: {
		status: string;
		recoveryDetailTemplate: string;
		teamRunsCreate: string;
		teamRunInspection: string;
		projectEnsure: string;
		tenantPoolTeamEnsure: string;
		agentSetupPackagesCreate: string;
		agentSetupHandoffsCreate: string;
		runtimeRunsRecent: string;
		runtimeRunInspection: string;
		models: string;
		chatCompletionsCreate: string;
		responsesCreate: string;
		responsesGetTemplate: string;
		responseBatchesCreate: string;
		responseBatchesGetTemplate: string;
		mediaGenerationsCreate: string;
		mediaGenerationsGetTemplate: string;
		mediaGenerationsMaterializeTemplate: string;
		mediaGenerationsStatusTemplate: string;
		runArchive: string;
		runArchiveAssetLookup: string;
		search: string;
		runArchiveBackfill: string;
		runArchiveEvidenceCreate: string;
		runArchiveItemTemplate: string;
		runArchiveItemAssetTemplate: string;
		runArchiveItemMaterializeTemplate: string;
		runArchiveMaterializationsCreate: string;
		runArchiveMaterializationsList: string;
		runArchiveMaterializationTemplate: string;
		historyMaterializationsCreate: string;
		historyMaterializationsList: string;
		historyMaterializationTemplate: string;
		accountMirrorRecoveryCandidates: string;
		runStatusTemplate: string;
		terminalSessionReceiptTemplate: string;
		apiLogTail: string;
		preflightRunTemplate: string;
		preflightRunLogTemplate: string;
		accountMirrorStatus: string;
		accountMirrorCatalog: string;
		accountMirrorCatalogItemTemplate: string;
		accountMirrorPreviewSessions: string;
		accountMirrorPreviewSessionTemplate: string;
		accountMirrorRefresh: string;
		accountMirrorReconciliationsCreate: string;
		accountMirrorReconciliationsList: string;
		accountMirrorReconciliationsGetTemplate: string;
		accountMirrorReconciliationsControlTemplate: string;
		accountMirrorCompletionsCreate: string;
		accountMirrorCompletionsList: string;
		accountMirrorCompletionsGetTemplate: string;
		accountMirrorCompletionsControlTemplate: string;
		accountMirrorSchedulerHistory: string;
		accountMirrorSchedulerDiagnostics: string;
		browserProcesses: string;
		browserDomDriftObservations: string;
		browserDomDriftObservationAcceptTemplate: string;
		workbenchCapabilitiesList: string;
		handoffStatusTemplate: string;
		handoffResumeTemplate: string;
		handoffRepairTemplate: string;
		handoffExportTemplate: string;
		handoffRecoverLiveTemplate: string;
		agentConfigChoices: string;
		agentRegistryDiagnostics: string;
		configApiKeys: string;
		configApiKeyIssue: string;
		configApiKeyDeleteTemplate: string;
		configSnapshotExport: string;
		configSnapshotImport: string;
		operatorBrowserDashboard: string;
		operatorDebugDashboard: string;
		accountMirrorDashboard: string;
		accountMirrorPreviewSessionDashboard: string;
		operatorConfigDashboard: string;
		operatorAgentsDashboard: string;
		operatorConsole: string;
		operatorBrowserDashboardUrl?: string;
		publicOperatorBrowserDashboardUrl?: string;
		localServiceBaseUrl: string;
		externalServiceBaseUrl?: string;
	};
	compatibility: {
		openai: true;
		chatCompletions: boolean;
		streaming: false;
		auth: boolean;
	};
	preflight: PreflightStatusSummary;
	recoverySummary?: ExecutionServiceHostRecoverySummary;
	localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
	runnerTopology: ExecutionServiceHostRunnerTopologySummary;
	runner: {
		id: string | null;
		hostId: string | null;
		status: ExecutionRunnerStatus | "inactive" | "registering";
		lastHeartbeatAt: string | null;
		expiresAt: string | null;
		lastActivityAt: string | null;
		lastClaimedRunId: string | null;
	};
	backgroundDrain: {
		enabled: boolean;
		intervalMs: number | null;
		state: "disabled" | "idle" | "scheduled" | "running" | "paused";
		paused: boolean;
		lastTrigger: "startup-recovery" | "request-create" | "background-timer" | null;
		lastStartedAt: string | null;
		lastCompletedAt: string | null;
	};
	tenantExecutionLimits: TenantExecutionLimitStatusSummary;
	accountMirrorScheduler: {
		enabled: boolean;
		dryRun: boolean;
		intervalMs: number | null;
		state: "disabled" | "idle" | "scheduled" | "running" | "paused";
		paused: boolean;
		lastWakeReason: AccountMirrorSchedulerWakeReason | null;
		lastWakeAt: string | null;
		lastStartedAt: string | null;
		lastCompletedAt: string | null;
		lastPass: AccountMirrorSchedulerPassResult | null;
		operatorStatus: AccountMirrorSchedulerOperatorStatus;
		foregroundWork: AccountMirrorSchedulerForegroundWorkStatus;
		history: AccountMirrorSchedulerPassHistory;
	};
	accountMirrorStatus: AccountMirrorStatusSummary;
	accountMirrorCompletions: AccountMirrorCompletionStatusSummary;
	accountMirrorProofScope: AccountMirrorProofScopeStatus;
	tabConcurrency: BrowserTabConcurrencyStatus;
	controlReadiness: HttpRunControlReadinessResponse;
	liveFollow: LiveFollowHealthSummary;
	executionHints: {
		headerNames: string[];
		bodyObject: "auracall";
	};
	controlResult?:
		| {
				kind: "background-drain";
				action: "pause" | "resume";
		  }
		| {
				kind: "account-mirror-scheduler";
				action: "pause" | "resume" | "run-once" | "run-once-with-foreground-pressure";
				dryRun: boolean;
		  }
		| {
				kind: "account-mirror-provider-guard";
				action: "clear";
				provider: AccountMirrorProvider;
				runtimeProfileId: string;
				cooldownUntil: string | null;
		  }
		| {
				kind: "account-mirror-completion";
				action: "pause" | "resume" | "cancel" | "run_one_pass";
				id: string;
				status: AccountMirrorCompletionOperation["status"];
		  }
		| {
				kind: "preflight";
				action: "run";
				accepted: boolean;
				reason: "started" | "already-running";
				id: string;
				status: string;
				logPath: string;
		  }
		| {
				kind: "service-control";
				action: "restart-api-service";
				unitName: string;
				restartCommand: string;
				scheduled: boolean;
				dryRun: boolean;
				delayMs: number;
		  }
		| ExecutionServiceHostOperatorControlResult;
}

interface AccountMirrorProofScopeStatus {
	object: "account_mirror_proof_scope";
	enabled: boolean;
	provider: AccountMirrorProvider | null;
	runtimeProfileId: string | null;
	tenantKey: string | null;
	bindingKey: string | null;
	browserOperationKey: string | null;
	globalLiveFollowSuppressed: boolean;
	suppressed: {
		resumeCompletionsOnStart: boolean;
		reconcileLiveFollowOnStart: boolean;
		schedulerExecution: boolean;
		backgroundDrain: boolean;
	};
}

interface HttpApiLogTailResponse {
	object: "api_log_tail";
	logPath: string;
	exists: boolean;
	sizeBytes: number;
	maxBytes: number;
	truncated: boolean;
	content: string;
}

interface HttpPreflightRunLogTailResponse {
	object: "preflight_run_log_tail";
	id: string;
	logPath: string;
	exists: boolean;
	sizeBytes: number;
	maxBytes: number;
	truncated: boolean;
	content: string;
}

export async function createResponsesHttpServer(
	options: ResponsesHttpServerOptions = {},
	deps: ResponsesHttpServerDeps = {},
): Promise<ResponsesHttpServerInstance> {
	const logger = options.logger ?? (() => {});
	const control = deps.control ?? createExecutionRuntimeControl();
	const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();
	const now = deps.now ?? (() => new Date());
	const boundHost = options.host ?? "127.0.0.1";
	const recoverRunsOnStart = options.recoverRunsOnStart ?? false;
	const recoverRunsOnStartMaxRuns = options.recoverRunsOnStartMaxRuns ?? 100;
	const recoverRunsOnStartSourceKind = options.recoverRunsOnStartSourceKind ?? "direct";
	const accountMirrorProofScope = normalizeAccountMirrorProofScope(options.accountMirrorProofScope);
	const backgroundDrainIntervalMs = accountMirrorProofScope
		? 0
		: Math.max(0, options.backgroundDrainIntervalMs ?? 0);
	const accountMirrorSchedulerIntervalMs = accountMirrorProofScope
		? 0
		: Math.max(0, options.accountMirrorSchedulerIntervalMs ?? 0);
	const accountMirrorSchedulerDryRun = options.accountMirrorSchedulerDryRun ?? true;
	const resumeAccountMirrorCompletionsOnStartRequested = accountMirrorProofScope
		? false
		: (options.resumeAccountMirrorCompletionsOnStart ?? true);
	const reconcileAccountMirrorLiveFollowOnStartRequested = accountMirrorProofScope
		? false
		: (options.reconcileAccountMirrorLiveFollowOnStart ?? true);
	const configuredRuntimeConfig = deps.config;
	const accountMirrorDevelopmentControlsArmed =
		(deps.env ?? process.env).AURACALL_ACCOUNT_MIRROR_DEVELOPMENT_CONTROLS === "1";
	const tenantExecutionLimitsStatusCache = new Map<
		string,
		{
			value: TenantExecutionLimitStatusSummary;
			expiresAtMs: number;
		}
	>();
	const tenantExecutionLimitsStatusRefresh = new Map<
		string,
		Promise<TenantExecutionLimitStatusSummary>
	>();
	const readTenantExecutionLimitsStatus = async (includeUsage: boolean) => {
		const cacheKey = includeUsage ? "usage" : "configured";
		const currentMs = Date.now();
		const cached = tenantExecutionLimitsStatusCache.get(cacheKey);
		if (cached && cached.expiresAtMs > currentMs) {
			return cached.value;
		}
		let refresh = tenantExecutionLimitsStatusRefresh.get(cacheKey);
		if (!refresh) {
			refresh = summarizeTenantExecutionLimits({
				control,
				config: configuredRuntimeConfig,
				now,
				includeUsage,
			}).finally(() => {
				tenantExecutionLimitsStatusRefresh.delete(cacheKey);
			});
			tenantExecutionLimitsStatusRefresh.set(cacheKey, refresh);
		}
		const value = await refresh;
		tenantExecutionLimitsStatusCache.set(cacheKey, {
			value,
			expiresAtMs: Date.now() + TENANT_EXECUTION_LIMIT_STATUS_CACHE_MS,
		});
		return value;
	};
	const apiAuthPolicy = readApiAuthPolicy(configuredRuntimeConfig);
	const agentTeamConfigService = createAgentTeamConfigService({
		activeConfig: configuredRuntimeConfig ?? null,
		registryStore: deps.agentRegistryStore,
	});
	const projectEnsureService =
		deps.projectEnsureService ??
		(deps.createProjectEnsureService ?? createProjectEnsureService)({
			config: configuredRuntimeConfig ?? {},
			configService: agentTeamConfigService,
		});
	const agentSetupPackageService =
		deps.agentSetupPackageService ??
		createAgentSetupPackageService({
			projectEnsureService,
			agentTeamConfigService,
		});
	const tenantPoolTeamEnsureService =
		deps.tenantPoolTeamEnsureService ??
		createTenantPoolTeamEnsureService({
			projectEnsureService,
			agentTeamConfigService,
		});
	const resolvedUserConfig = asResolvedUserConfig(configuredRuntimeConfig);
	const tabConcurrencyRuntime = createBrowserTabConcurrencyRuntime(
		resolveTabConcurrencyStatusUserConfig(resolvedUserConfig),
		{ now },
	);
	const readTabConcurrencyStatus =
		deps.readTabConcurrencyStatus ?? (() => tabConcurrencyRuntime.readStatus());
	const tabAffinityMaintenanceIntervalMs = resolveTabAffinityMaintenanceIntervalMs({
		userConfig: resolvedUserConfig,
		configuredIntervalMs: options.tabAffinityMaintenanceIntervalMs,
		disabled: Boolean(accountMirrorProofScope),
	});
	const tabAffinityMaintenanceLoop = createTabAffinityMaintenanceLoop({
		intervalMs: tabAffinityMaintenanceIntervalMs,
		logger,
		run:
			deps.runTabAffinityMaintenance ??
			(async () => {
				if (!resolvedUserConfig) return;
				const summary = await runConfiguredChatgptTabMaintenance({
					userConfig: resolvedUserConfig,
					now,
				});
				for (const error of summary.errors) {
					logger(
						`Tab-affinity maintenance deferred for ${error.runtimeProfileId}: ${error.message}`,
					);
				}
				if (summary.unleasedLiveTargetCount > 0) {
					logger(
						`Tab-affinity maintenance observed ${summary.unleasedLiveTargetCount} unleased live ChatGPT target(s); they were preserved without adoption or mutation.`,
					);
				}
				if (summary.restartLostCount > 0) {
					logger(
						`Tab-affinity maintenance reconciled ${summary.restartLostCount} stale active lease(s): ${summary.restartMissingReleasedCount} target(s) proven missing, ${summary.restartPreservedCount} live target(s) preserved, ${summary.restartIdentityMismatchCount} identity mismatch(es).`,
					);
				}
			}),
	});
	const accountMirrorPersistence = createAccountMirrorPersistence({
		config: configuredRuntimeConfig,
	});
	const accountMirrorStatusRegistry =
		deps.accountMirrorStatusRegistry ??
		createAccountMirrorStatusRegistry({
			config: configuredRuntimeConfig,
			now,
			readPersistentState: accountMirrorPersistence.readState,
			writePersistentState: accountMirrorPersistence.writeState?.bind(accountMirrorPersistence),
		});
	const accountMirrorRefreshService =
		deps.accountMirrorRefreshService ??
		createAccountMirrorRefreshService({
			config: configuredRuntimeConfig,
			registry: accountMirrorStatusRegistry,
			persistence: accountMirrorPersistence,
			now,
			developmentControlsEnabled: accountMirrorDevelopmentControlsArmed,
		});
	const accountMirrorDevelopmentRuns = new Map<
		string,
		{
			id: string;
			status: "running" | "completed" | "failed" | "cancelled";
			startedAt: string;
			completedAt: string | null;
			provider: AccountMirrorProvider;
			runtimeProfileId: string;
			policy: AccountMirrorDevelopmentPolicy;
			diagnostics: AccountMirrorCollectorDiagnosticEvent[];
			result: AccountMirrorRefreshResult | null;
			error: { message: string; code: string | null } | null;
			controller: AbortController;
		}
	>();
	let hasForegroundAuraCallExecutionPressure = () => false;
	const accountMirrorCatalogService =
		deps.accountMirrorCatalogService ??
		createAccountMirrorCatalogService({
			config: configuredRuntimeConfig,
			registry: accountMirrorStatusRegistry,
			persistence: accountMirrorPersistence,
			now,
		});
	const runArchiveService =
		deps.runArchiveService ??
		createRunArchiveService({
			now,
		});
	const archiveMaterializationService =
		deps.archiveMaterializationService ??
		createArchiveMaterializationService({
			config: resolvedUserConfig ?? {},
			runArchiveService,
			now,
		});
	let archiveMaterializationJobService = deps.archiveMaterializationJobService;
	let historyMaterializationService = deps.historyMaterializationService;
	let searchProjectionService: SearchProjectionService;
	let accountMirrorArtifactRecoveryPlanner: AccountMirrorArtifactRecoveryPlanner;
	let resolveAccountMirrorArtifactRecoveryPlannerReady: () => void = () => {};
	const accountMirrorArtifactRecoveryPlannerReady = new Promise<void>((resolve) => {
		resolveAccountMirrorArtifactRecoveryPlannerReady = resolve;
	});
	const accountMirrorSchedulerLedger =
		deps.accountMirrorSchedulerLedger ??
		createAccountMirrorSchedulerPassLedger({
			config: configuredRuntimeConfig,
		});
	const persistedAccountMirrorSchedulerControl =
		accountMirrorSchedulerIntervalMs > 0
			? await readAccountMirrorSchedulerControlState().catch((error) => {
					logger(
						`Account mirror scheduler control read failed: ${error instanceof Error ? error.message : String(error)}`,
					);
					return null;
				})
			: null;
	const initialAccountMirrorSchedulerPaused =
		accountMirrorSchedulerIntervalMs > 0 && persistedAccountMirrorSchedulerControl?.paused === true;
	const resumeAccountMirrorCompletionsOnStart =
		resumeAccountMirrorCompletionsOnStartRequested && !initialAccountMirrorSchedulerPaused;
	const reconcileAccountMirrorLiveFollowOnStart =
		reconcileAccountMirrorLiveFollowOnStartRequested && !initialAccountMirrorSchedulerPaused;
	const accountMirrorProviderWorkCoordinator = createAccountMirrorProviderWorkCoordinator();
	const accountMirrorCompletionStore = createAccountMirrorCompletionStore({
		config: configuredRuntimeConfig,
	});
	const accountMirrorReconciliationCampaignStore = createAccountMirrorReconciliationCampaignStore({
		config: configuredRuntimeConfig,
	});
	const accountMirrorPreviewSessionStore = createAccountMirrorPreviewSessionStore({
		config: configuredRuntimeConfig,
	});
	const initialAccountMirrorCompletions =
		deps.accountMirrorCompletionService || accountMirrorProofScope
			? []
			: await accountMirrorCompletionStore.listOperations({ activeOnly: false, limit: null });
	const accountMirrorCompletionService =
		deps.accountMirrorCompletionService ??
		createAccountMirrorCompletionService({
			registry: accountMirrorStatusRegistry,
			refreshService: accountMirrorRefreshService,
			store: accountMirrorCompletionStore,
			initialOperations: initialAccountMirrorCompletions,
			resumeActiveOperations: resumeAccountMirrorCompletionsOnStart,
			now,
			shouldYieldToForegroundWork: () =>
				hasForegroundAuraCallExecutionPressure()
					? {
							reason: "foreground-work",
							message:
								"Foreground AuraCall API or service work is pending; live follow will retry later.",
						}
					: null,
			historyMaterializationService: {
				async createJob(request) {
					if (!historyMaterializationService) {
						throw new Error("History materialization service is not initialized.");
					}
					return historyMaterializationService.createJob(request);
				},
				async readJob(id) {
					return historyMaterializationService ? historyMaterializationService.readJob(id) : null;
				},
			},
			readMaterializationBacklog: async ({ provider, runtimeProfileId }) => {
				await accountMirrorArtifactRecoveryPlannerReady;
				const planner = accountMirrorArtifactRecoveryPlanner;
				const plan = await planner.plan({
					provider,
					runtimeProfileId,
					includeSearchRows: false,
					limit: 100,
				});
				return {
					retrievableMissing: plan.metrics.retrievableMissingLocal.total,
					unknownOrDeferred: plan.metrics.unknownOrDeferred.total,
				};
			},
			providerWorkCoordinator: accountMirrorProviderWorkCoordinator,
			onPersistError: (error, operation) => {
				logger(
					`Account mirror completion ${operation.id} persist failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			},
		});
	const accountMirrorSchedulerService =
		deps.accountMirrorSchedulerService ??
		createAccountMirrorSchedulerPassService({
			registry: accountMirrorStatusRegistry,
			refreshService: accountMirrorRefreshService,
			now,
			readHistory: () => accountMirrorSchedulerLedger.readHistory(),
			providerWorkCoordinator: accountMirrorProviderWorkCoordinator,
			isTargetSelectable: (entry) => {
				const active =
					accountMirrorCompletionService.list({
						provider: entry.provider,
						runtimeProfileId: entry.runtimeProfileId,
						status: "active",
						limit: null,
					})[0] ?? null;
				return classifyLiveFollowTarget(entry, active).classification !== "operator_paused";
			},
			shouldYieldToForegroundWork: () =>
				hasForegroundAuraCallExecutionPressure()
					? {
							reason: "foreground-work",
							message:
								"Foreground AuraCall API or service work is pending; live follow will retry later.",
						}
					: null,
		});
	const accountMirrorReconciliationCampaignService =
		deps.accountMirrorReconciliationCampaignService ??
		createAccountMirrorReconciliationCampaignService({
			registry: accountMirrorStatusRegistry,
			completionService: accountMirrorCompletionService,
			materializationJobReader: {
				async readJob(id) {
					return historyMaterializationService ? historyMaterializationService.readJob(id) : null;
				},
			},
			store: accountMirrorReconciliationCampaignStore,
			now,
		});
	await accountMirrorReconciliationCampaignService.recoverActiveCampaigns?.();
	const preflightRunner = deps.preflightRunner ?? createLazyLiveFollowPreflightRunner();
	const scheduleApiServiceRestart =
		deps.scheduleApiServiceRestart ?? scheduleDefaultUserApiServiceRestart;
	const reconcileAccountMirrorLiveFollow = async (
		target?: Pick<AccountMirrorStatusEntry, "provider" | "runtimeProfileId">,
	) => {
		await reconcileConfiguredAccountMirrorLiveFollow({
			registry: accountMirrorStatusRegistry,
			completionService: accountMirrorCompletionService,
			target,
		}).catch((error) => {
			logger(
				`Account mirror live-follow reconcile failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		});
	};
	if (reconcileAccountMirrorLiveFollowOnStart) {
		await reconcileAccountMirrorLiveFollow();
	}
	const workbenchCapabilityService = createWorkbenchCapabilityService({
		now,
		catalog: deps.workbenchCapabilityCatalog,
		discoverCapabilities: deps.discoverWorkbenchCapabilities,
		diagnoseCapabilities: deps.diagnoseWorkbenchCapabilities,
	});
	const probeMediaGenerationBrowserDiagnosticsImpl =
		deps.probeMediaGenerationBrowserDiagnostics ?? probeMediaGenerationBrowserDiagnostics;
	const mediaGenerationService = createMediaGenerationService({
		now,
		executor:
			deps.mediaGenerationExecutor ??
			(resolvedUserConfig ? createBrowserMediaGenerationExecutor(resolvedUserConfig) : undefined),
		materializer:
			deps.mediaGenerationMaterializer ??
			(resolvedUserConfig
				? createBrowserMediaGenerationMaterializer(resolvedUserConfig)
				: undefined),
		capabilityReporter: workbenchCapabilityService,
		runtimeProfile:
			typeof resolvedUserConfig?.auracallProfile === "string"
				? resolvedUserConfig.auracallProfile
				: null,
		onGenerationSettled: () => {
			scheduleAccountMirrorSchedulerFollowUp(0, "media-generation-settled");
		},
	});
	const localRunnerCapabilitySummary = createLocalRunnerCapabilitySummary(configuredRuntimeConfig);
	const createRunAffinity = configuredRuntimeConfig
		? (inspection: Parameters<typeof createConfiguredExecutionRunAffinity>[1]) =>
				createConfiguredExecutionRunAffinity(configuredRuntimeConfig, inspection)
		: undefined;
	const runnerHeartbeatIntervalMs = 5_000;
	const runnerHeartbeatTtlMs = 15_000;
	let host: ExecutionServiceHost;
	let responsesService: ReturnType<typeof createExecutionResponsesService>;
	let responseBatchService: ResponseBatchService;
	const responseBatchExecutionGate = createResponseBatchExecutionGate({
		control,
		now,
	});
	const tenantExecutionLimitGate = createTenantExecutionLimitGate({
		control,
		config: configuredRuntimeConfig,
		now,
	});
	const executionGate = composeExecutionGates(responseBatchExecutionGate, tenantExecutionLimitGate);
	let teamRuntimeBridge: TeamRuntimeBridge;
	const runnerState: HttpStatusResponse["runner"] = {
		id: null,
		hostId: null,
		status: "inactive",
		lastHeartbeatAt: null,
		expiresAt: null,
		lastActivityAt: null,
		lastClaimedRunId: null,
	};
	const backgroundDrainState: HttpStatusResponse["backgroundDrain"] = {
		enabled: backgroundDrainIntervalMs > 0,
		intervalMs: backgroundDrainIntervalMs > 0 ? backgroundDrainIntervalMs : null,
		state: backgroundDrainIntervalMs > 0 ? "idle" : "disabled",
		paused: false,
		lastTrigger: null,
		lastStartedAt: null,
		lastCompletedAt: null,
	};
	const accountMirrorSchedulerState: HttpStatusResponse["accountMirrorScheduler"] = {
		enabled: accountMirrorSchedulerIntervalMs > 0,
		dryRun: accountMirrorSchedulerDryRun,
		intervalMs: accountMirrorSchedulerIntervalMs > 0 ? accountMirrorSchedulerIntervalMs : null,
		state: initialAccountMirrorSchedulerPaused
			? "paused"
			: accountMirrorSchedulerIntervalMs > 0
				? "idle"
				: "disabled",
		paused: initialAccountMirrorSchedulerPaused,
		lastWakeReason: null,
		lastWakeAt: null,
		lastStartedAt: null,
		lastCompletedAt: null,
		lastPass: null,
		foregroundWork: {
			active: false,
			activeRequestCount: 0,
			drainReservations: 0,
			backgroundDrainScheduled: false,
			backgroundDrainState: backgroundDrainState.state,
		},
		operatorStatus: {
			posture: initialAccountMirrorSchedulerPaused
				? "paused"
				: accountMirrorSchedulerIntervalMs > 0
					? "ready"
					: "disabled",
			reason: initialAccountMirrorSchedulerPaused
				? "account mirror scheduler is operator-paused"
				: accountMirrorSchedulerIntervalMs > 0
					? "account mirror scheduler is enabled and waiting for its first pass"
					: "account mirror scheduler is disabled; set --account-mirror-scheduler-interval-ms to enable cadence and live-follow wakes",
			backpressureReason: null,
		},
		history: await accountMirrorSchedulerLedger.readHistory().catch((error) => {
			logger(error instanceof Error ? error.message : String(error));
			return {
				object: "account_mirror_scheduler_pass_history",
				version: 1,
				updatedAt: null,
				limit: 50,
				entries: [],
			};
		}),
	};
	let backgroundDrainPaused = false;
	let accountMirrorSchedulerPaused = initialAccountMirrorSchedulerPaused;
	let accountMirrorFollowUpAfterNextDrain = false;
	let foregroundAuraCallWorkCount = 0;
	let foregroundAuraCallDrainReservations = 0;
	let runnerHeartbeatTimer: NodeJS.Timeout | null = null;
	let closed = false;
	const beginForegroundAuraCallWork = () => {
		foregroundAuraCallWorkCount += 1;
		return () => {
			foregroundAuraCallWorkCount = Math.max(0, foregroundAuraCallWorkCount - 1);
		};
	};
	archiveMaterializationJobService =
		archiveMaterializationJobService ??
		createArchiveMaterializationJobService({
			materializationService: archiveMaterializationService,
			now,
			withForegroundWork: async (work) => {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					return await work();
				} finally {
					endForegroundWork();
				}
			},
		});
	await archiveMaterializationJobService.recoverInterruptedJobs();
	historyMaterializationService =
		historyMaterializationService ??
		createHistoryMaterializationService({
			config: resolvedUserConfig ?? {},
			catalogService: accountMirrorCatalogService,
			runArchiveService,
			now,
			cleanupManagedBrowserAfterProviderWork: true,
			onProviderGuardObserved: async ({ request }) => {
				if (request.provider !== "chatgpt" || !request.runtimeProfile) return;
				const guard = await readChatgptRateLimitGuardState({
					profileName: request.runtimeProfile,
				});
				const cooldownUntilMs = guard?.cooldownUntil ?? null;
				if (!cooldownUntilMs || cooldownUntilMs <= now().getTime()) return;
				const state = accountMirrorStatusRegistry.mergeState(
					{ provider: "chatgpt", runtimeProfileId: request.runtimeProfile },
					{
						providerCooldownUntilMs: cooldownUntilMs,
						providerGuard: {
							state: "cooldown",
							kind: "unknown",
							summary: guard?.cooldownReason?.trim()
								? `ChatGPT rate limit detected: ${guard.cooldownReason.trim()}`
								: "ChatGPT rate limit cooldown is active.",
							detectedAtMs: guard?.cooldownDetectedAt ?? now().getTime(),
							cooldownUntilMs,
							action: guard?.cooldownAction?.trim() || "history-materialization",
						},
					},
				);
				await accountMirrorStatusRegistry
					.writePersistentState?.(
						{ provider: "chatgpt", runtimeProfileId: request.runtimeProfile },
						state,
					)
					.catch((error) => {
						logger(
							`Account mirror provider guard persist failed for chatgpt/${request.runtimeProfile}: ${error instanceof Error ? error.message : String(error)}`,
						);
					});
			},
			withForegroundWork: async (work) => {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					return await work();
				} finally {
					endForegroundWork();
				}
			},
		});
	await historyMaterializationService.recoverInterruptedJobs();
	searchProjectionService =
		deps.searchProjectionService ??
		createSearchProjectionService({
			accountMirrorCatalogService,
			runArchiveService,
			archiveMaterializationJobService,
			now,
		});
	accountMirrorArtifactRecoveryPlanner =
		deps.accountMirrorArtifactRecoveryPlanner ??
		createAccountMirrorArtifactRecoveryPlanner({
			registry: accountMirrorStatusRegistry,
			searchProjectionService,
			historyMaterializationService,
			now,
		});
	resolveAccountMirrorArtifactRecoveryPlannerReady();
	const reserveForegroundAuraCallDrain = () => {
		foregroundAuraCallDrainReservations += 1;
		accountMirrorFollowUpAfterNextDrain = true;
	};
	const completeForegroundAuraCallDrainReservation = () => {
		if (foregroundAuraCallDrainReservations > 0) {
			foregroundAuraCallDrainReservations -= 1;
		}
	};
	hasForegroundAuraCallExecutionPressure = () =>
		foregroundAuraCallWorkCount > 0 ||
		foregroundAuraCallDrainReservations > 0 ||
		backgroundDrainState.state === "scheduled" ||
		backgroundDrainState.state === "running";
	const readForegroundAuraCallWorkStatus = (): AccountMirrorSchedulerForegroundWorkStatus => ({
		active: hasForegroundAuraCallExecutionPressure(),
		activeRequestCount: foregroundAuraCallWorkCount,
		drainReservations: foregroundAuraCallDrainReservations,
		backgroundDrainScheduled,
		backgroundDrainState: backgroundDrainState.state,
	});
	const drainThroughServerHost = (
		drainOptions: ServerOwnedDrainOptions & {
			trigger?: HttpStatusResponse["backgroundDrain"]["lastTrigger"];
		} = {},
	) => {
		if (backgroundDrainState.state !== "disabled") {
			backgroundDrainState.state = "scheduled";
		}
		return host
			.drainRunsUntilIdleQueued({
				runId: drainOptions.runId,
				sourceKind: drainOptions.sourceKind,
				candidateStatuses: drainOptions.candidateStatuses,
				maxRuns: drainOptions.maxRuns,
				executionGate,
				onStart: () => {
					if (backgroundDrainState.state !== "disabled") {
						backgroundDrainState.state = "running";
						backgroundDrainState.lastTrigger = drainOptions.trigger ?? null;
						backgroundDrainState.lastStartedAt = now().toISOString();
					}
				},
			})
			.finally(() => {
				if (backgroundDrainState.state !== "disabled") {
					backgroundDrainState.state = closed
						? "disabled"
						: backgroundDrainPaused
							? "paused"
							: "idle";
					backgroundDrainState.lastCompletedAt = now().toISOString();
				}
				completeForegroundAuraCallDrainReservation();
				if (accountMirrorFollowUpAfterNextDrain && foregroundAuraCallDrainReservations === 0) {
					accountMirrorFollowUpAfterNextDrain = false;
					scheduleAccountMirrorSchedulerFollowUp(0, "response-drain-completed");
				}
			});
	};
	let backgroundDrainTimer: NodeJS.Timeout | null = null;
	let backgroundDrainScheduled = false;
	const scheduleBackgroundDrain = (delayMs = backgroundDrainIntervalMs) => {
		if (
			closed ||
			backgroundDrainIntervalMs <= 0 ||
			backgroundDrainPaused ||
			backgroundDrainScheduled
		) {
			if (closed || backgroundDrainIntervalMs <= 0 || backgroundDrainPaused) {
				return;
			}
			if (backgroundDrainScheduled && delayMs === 0 && backgroundDrainTimer) {
				clearTimeout(backgroundDrainTimer);
				backgroundDrainTimer = null;
				backgroundDrainScheduled = false;
			} else {
				return;
			}
		}
		backgroundDrainScheduled = true;
		backgroundDrainTimer = setTimeout(async () => {
			backgroundDrainScheduled = false;
			backgroundDrainTimer = null;
			if (closed) {
				return;
			}
			await drainThroughServerHost({
				candidateStatuses: ["planned", "running"],
				maxRuns: 1,
				trigger: "background-timer",
			}).catch((error) => {
				logger(error instanceof Error ? error.message : String(error));
				return null;
			});
			scheduleBackgroundDrain(backgroundDrainIntervalMs);
		}, delayMs);
	};
	let accountMirrorSchedulerTimer: NodeJS.Timeout | null = null;
	let accountMirrorSchedulerScheduled = false;
	const runAccountMirrorSchedulerPass = async (input: {
		dryRun: boolean;
		ignoreMinimumInterval?: boolean;
		wakeReason: AccountMirrorSchedulerWakeReason;
	}) => {
		if (accountMirrorSchedulerState.state === "running") {
			return false;
		}
		const wakeAt = now().toISOString();
		accountMirrorSchedulerState.state = "running";
		accountMirrorSchedulerState.lastWakeReason = input.wakeReason;
		accountMirrorSchedulerState.lastWakeAt = wakeAt;
		accountMirrorSchedulerState.lastStartedAt = wakeAt;
		try {
			accountMirrorSchedulerState.lastPass = await accountMirrorSchedulerService.runOnce({
				dryRun: input.dryRun,
				...(input.ignoreMinimumInterval ? { ignoreMinimumInterval: true } : {}),
			});
			accountMirrorSchedulerState.history = await accountMirrorSchedulerLedger
				.appendPass(accountMirrorSchedulerState.lastPass)
				.catch((error) => {
					logger(error instanceof Error ? error.message : String(error));
					return accountMirrorSchedulerState.history;
				});
			if (
				accountMirrorSchedulerState.lastPass.mode === "execute" &&
				accountMirrorSchedulerState.lastPass.action === "refresh-completed" &&
				accountMirrorSchedulerState.lastPass.selectedTarget
			) {
				await reconcileAccountMirrorLiveFollow(accountMirrorSchedulerState.lastPass.selectedTarget);
			}
		} catch (error) {
			logger(error instanceof Error ? error.message : String(error));
		} finally {
			accountMirrorSchedulerState.lastCompletedAt = now().toISOString();
			accountMirrorSchedulerState.state = closed
				? "disabled"
				: accountMirrorSchedulerPaused
					? "paused"
					: accountMirrorSchedulerIntervalMs > 0
						? accountMirrorSchedulerScheduled
							? "scheduled"
							: "idle"
						: "disabled";
		}
		return true;
	};
	const scheduleAccountMirrorScheduler = (
		delayMs = accountMirrorSchedulerIntervalMs,
		wakeReason: AccountMirrorSchedulerWakeReason = "cadence",
	) => {
		if (
			closed ||
			accountMirrorSchedulerIntervalMs <= 0 ||
			accountMirrorSchedulerPaused ||
			accountMirrorSchedulerScheduled ||
			accountMirrorSchedulerState.state === "running"
		) {
			return;
		}
		accountMirrorSchedulerScheduled = true;
		accountMirrorSchedulerState.state = "scheduled";
		accountMirrorSchedulerTimer = setTimeout(async () => {
			accountMirrorSchedulerScheduled = false;
			accountMirrorSchedulerTimer = null;
			if (closed) {
				return;
			}
			await runAccountMirrorSchedulerPass({
				dryRun: accountMirrorSchedulerDryRun,
				wakeReason,
			});
			scheduleAccountMirrorScheduler(accountMirrorSchedulerIntervalMs, "cadence");
		}, delayMs);
	};
	const scheduleAccountMirrorSchedulerFollowUp = (
		delayMs = 0,
		wakeReason: AccountMirrorSchedulerWakeReason,
	) => {
		if (
			closed ||
			accountMirrorSchedulerIntervalMs <= 0 ||
			accountMirrorSchedulerPaused ||
			accountMirrorSchedulerState.state === "running"
		) {
			return;
		}
		if (accountMirrorSchedulerScheduled && accountMirrorSchedulerTimer) {
			clearTimeout(accountMirrorSchedulerTimer);
			accountMirrorSchedulerTimer = null;
			accountMirrorSchedulerScheduled = false;
		}
		scheduleAccountMirrorScheduler(delayMs, wakeReason);
	};
	const operatorDashboardRoutes = resolveOperatorDashboardRoutes(options.serviceRouting);
	const server = http.createServer();
  let expiringDesktopControls = false;
  const desktopControlInactivityTimer = setInterval(() => {
    if (expiringDesktopControls || deps.desktopClient || !configuredRuntimeConfig?.remoteView) return;
    expiringDesktopControls = true;
    void expireInactiveDesktopControls(configuredRuntimeConfig.remoteView).catch(() => {
      // Revocation or ownership uncertainty retains automation exclusion.
    }).finally(() => { expiringDesktopControls = false; });
  }, 1000);
  desktopControlInactivityTimer.unref();
  server.once('close', () => clearInterval(desktopControlInactivityTimer));

	server.on("request", async (req, res) => {
		try {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const apiAuthContext = authorizeApiRequest(
				req,
				apiAuthPolicy,
				url.pathname,
				operatorDashboardRoutes,
			);
			if (!apiAuthContext) {
				sendJson(res, 401, {
					error: {
						message: "Missing or invalid AuraCall API key.",
						type: "authentication_error",
					},
				} satisfies HttpErrorPayload);
				return;
			}

      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/") {
        res.writeHead(302, {Location: operatorDashboardRoutes.consolePath, "Cache-Control":"no-store"});
        res.end();
        return;
      }
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/favicon.svg") {
        const icon = await fs.readFile(new URL("../assets/auracall.svg", import.meta.url));
        res.writeHead(200, {"Content-Type":"image/svg+xml", "Cache-Control":"public, max-age=3600"});
        res.end(req.method === "HEAD" ? undefined : icon);
        return;
      }
      if (url.pathname === '/v1/desktops' || url.pathname.startsWith('/v1/desktops/')) {
        const desktopAuthError = authorizeOperatorConfigAccess(apiAuthContext);
        if (desktopAuthError) { sendJson(res, 403, { error: { message: desktopAuthError } }); return; }
      }
      const desktopClose = url.pathname.match(/^\/v1\/desktops\/([^/]+)\/close$/);
      if (req.method === 'POST' && desktopClose) {
        let payload: {browserId:string};
        try { payload = z.object({browserId:z.string().min(1)}).strict().parse(JSON.parse(await readRequestBody(req))); }
        catch { sendJson(res,400,{error:{message:'Select an owned browser to close.'}});return; }
        try {
          const name=decodeURIComponent(desktopClose[1]);
          const result=await (deps.desktopClient?.closeBrowser?.(name,payload.browserId) ?? closeDesktopBrowser({remoteView:configuredRuntimeConfig?.remoteView,name,browserId:payload.browserId}));
          sendJson(res,200,result,{'Cache-Control':'no-store'});
        } catch(error) {sendJson(res,409,{error:{message:error instanceof Error?error.message:'Browser close was not confirmed.'}},{'Cache-Control':'no-store'});}
        return;
      }
      const runtimeProfileWake = url.pathname.match(/^\/v1\/desktops\/profiles\/([^/]+)\/wake$/);
      if (req.method === 'POST' && runtimeProfileWake) {
        try {
          const input = z.object({ desktopName: z.string().min(1).optional() }).strict().parse(JSON.parse(await readRequestBody(req)));
          const id = decodeURIComponent(runtimeProfileWake[1]);
          const result = deps.desktopClient?.wakeProfile ? await deps.desktopClient.wakeProfile(id, input.desktopName)
            : resolvedUserConfig ? await wakeDesktopRuntimeProfile(resolvedUserConfig, id, input.desktopName) : undefined;
          if (!result) throw new Error('Runtime profile configuration is unavailable.');
          if (!deps.desktopClient && resolvedUserConfig) await applyDesktopProfileAssignments(resolvedUserConfig);
          sendJson(res, 200, result, { 'Cache-Control': 'no-store' });
        } catch (error) { sendJson(res, 409, { error: { message: error instanceof Error ? error.message : 'Runtime profile wake unavailable.' } }); }
        return;
      }
      const desktopControl = url.pathname.match(/^\/v1\/desktops\/([^/]+)\/(control|release|control-status)$/);
      if (req.method === 'POST' && desktopControl) {
        const name = decodeURIComponent(desktopControl[1]);
        let payload: { browserId: string; token: string };
        try {
          payload = z.object({ browserId: z.string().min(1), token: z.string().uuid() }).parse(JSON.parse(await readRequestBody(req)));
        } catch { sendJson(res, 400, { error: { message: 'Provide a browser and control claim identity.' } }); return; }
        try {
          const input = { remoteView: configuredRuntimeConfig?.remoteView, name, ...payload };
          if (desktopControl[2] === 'control') {
            const result = await (deps.desktopClient?.takeControl?.(name, payload.browserId, payload.token) ?? takeDesktopControl(input));
            sendJson(res, 200, result, { 'Cache-Control': 'no-store' });
          } else if (desktopControl[2] === 'control-status') {
            sendJson(res, 200, await (deps.desktopClient?.controlStatus?.(name, payload.browserId, payload.token) ?? desktopControlStatus(input)), { 'Cache-Control': 'no-store' });
          } else {
            await (deps.desktopClient?.releaseControl?.(name, payload.browserId, payload.token) ?? releaseDesktopControl(input));
            sendJson(res, 200, { state: 'released' }, { 'Cache-Control': 'no-store' });
          }
        } catch (error) { sendJson(res, 409, { error: { message: error instanceof Error ? error.message : 'Desktop control unavailable.', ...(error instanceof NativeDesktopControlError ? { claimRetained: error.claimRetained } : {}) } }, { 'Cache-Control': 'no-store' }); }
        return;
      }
      const nativeDesktopView = url.pathname.match(/^\/v1\/desktops\/([^/]+)\/view$/);
      if (req.method === 'GET' && nativeDesktopView) {
        const name = decodeURIComponent(nativeDesktopView[1]);
        const browserId = url.searchParams.get('browser');
        if (!browserId) { sendJson(res, 400, { error: { message: 'Select an AuraCall browser to view.' } }); return; }
        try {
          const view = await (deps.desktopClient?.view?.(name, browserId) ?? openDesktopView({ remoteView: configuredRuntimeConfig?.remoteView, name, browserId }));
          sendJson(res, 200, view, { 'Cache-Control': 'no-store' });
        } catch (error) { sendJson(res, 503, { error: { message: error instanceof Error ? error.message : 'Desktop unavailable.' } }, { 'Cache-Control': 'no-store' }); }
        return;
      }
      if (req.method === "GET" && url.pathname === "/desktops") {
        sendHtml(res, 200, renderDesktopClientPage());
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/desktops") {
        const catalog = await (deps.desktopClient?.list() ?? listDesktopViews({ remoteView: configuredRuntimeConfig?.remoteView }));
        const runtimeProfiles = await (deps.desktopClient?.profiles?.() ?? (deps.desktopClient ? Promise.resolve([]) : resolvedUserConfig ? listDesktopRuntimeProfiles(resolvedUserConfig) : Promise.resolve([])));
        sendJson(res, 200, { ...catalog, runtimeProfiles }, { "Cache-Control": "no-store" });
        return;
      }
      const desktopFrame = url.pathname.match(/^\/v1\/desktops\/([^/]+)\/frame$/);
      if (req.method === "GET" && desktopFrame) {
        const name = decodeURIComponent(desktopFrame[1]);
        const browserId = url.searchParams.get("browser");
        if (!browserId) {
          sendJson(res, 400, { error: { message: "Select an AuraCall browser to view." } });
          return;
        }
        try {
          const frame = await (deps.desktopClient?.capture(name, browserId) ?? captureDesktopView({
            remoteView: configuredRuntimeConfig?.remoteView, name, browserId,
          }));
          sendJson(res, 200, frame, { "Cache-Control": "no-store" });
        } catch (error) {
          sendJson(res, 503, { error: { message: error instanceof Error ? error.message : "Desktop unavailable." } }, { "Cache-Control": "no-store" });
        }
        return;
      }

			if (
				(req.method === "GET" || req.method === "HEAD") &&
				(await maybeSendConsoleUxAsset(
					res,
					url.pathname,
					operatorDashboardRoutes,
					req.method === "HEAD",
				))
			) {
				return;
			}

			if (
				(req.method === "GET" || req.method === "HEAD") &&
				(await maybeSendOperatorUxAsset(
					res,
					url.pathname,
					operatorDashboardRoutes,
					req.method === "HEAD",
				))
			) {
				return;
			}

			if (
				(req.method === "GET" || req.method === "HEAD") &&
				matchesRoutePath(url.pathname, operatorDashboardRoutes.debugDashboardPath, "/ops/browser")
			) {
				sendHtml(
					res,
					200,
					createOperatorBrowserDashboardHtml({
						activePage: "browser",
						routes: operatorDashboardRoutes,
					}),
				);
				return;
			}

			if (
				req.method === "GET" &&
				matchesRoutePath(url.pathname, operatorDashboardRoutes.accountMirrorPath, "/account-mirror")
			) {
				sendHtml(
					res,
					200,
					createOperatorBrowserDashboardHtml({
						activePage: "account-mirror",
						routes: operatorDashboardRoutes,
					}),
				);
				return;
			}

			if (
				req.method === "GET" &&
				matchesRoutePath(
					url.pathname,
					operatorDashboardRoutes.previewSessionPath,
					"/account-mirror/preview-session",
				)
			) {
				sendHtml(
					res,
					200,
					createOperatorBrowserDashboardHtml({
						activePage: "preview-session",
						routes: operatorDashboardRoutes,
					}),
				);
				return;
			}

			if (
				req.method === "GET" &&
				matchesRoutePath(url.pathname, operatorDashboardRoutes.configPath, "/config")
			) {
				sendHtml(
					res,
					200,
					createOperatorBrowserDashboardHtml({
						activePage: "config",
						routes: operatorDashboardRoutes,
					}),
				);
				return;
			}

			if (
				req.method === "GET" &&
				matchesRoutePath(url.pathname, operatorDashboardRoutes.agentsPath, "/agents")
			) {
				sendHtml(
					res,
					200,
					createOperatorBrowserDashboardHtml({
						activePage: "agents",
						routes: operatorDashboardRoutes,
					}),
				);
				return;
			}

			if (req.method === "GET" && url.pathname === "/status") {
				const statusQuery = parseStatusQuery(url.searchParams);
				await accountMirrorStatusRegistry.refreshPersistentState?.({
					provider: statusQuery.accountMirrorProvider,
					runtimeProfileId: statusQuery.accountMirrorRuntimeProfileId,
				});
				await syncRunnerStateFromStore();
				const address = server.address();
				const boundPort =
					address && typeof address !== "string" ? address.port : (options.port ?? 0);
				const statusSourceKind =
					statusQuery.sourceKindSummary === "all"
						? undefined
						: (statusQuery.sourceKindSummary ?? "direct");
				const statusResponseRecoverySummary = statusQuery.recovery
					? await host.summarizeRecoveryState({
							sourceKind: statusSourceKind,
						})
					: undefined;
				const rawAccountMirrorStatus = structuredClone(
					accountMirrorStatusRegistry.readStatus({
						provider: statusQuery.accountMirrorProvider,
						runtimeProfileId: statusQuery.accountMirrorRuntimeProfileId,
					}),
				);
				const rawScopedAccountMirrorStatus = scopeAccountMirrorStatusForProofScope(
					rawAccountMirrorStatus,
					accountMirrorProofScope,
				);
				const localClaimPromise = host.summarizeLocalClaimState({
					sourceKind: "direct",
				});
				const runnerTopologyPromise = localClaimPromise.then(() => host.summarizeRunnerTopology());
				const [
					statusResponseLocalClaimSummary,
					rawRunnerTopology,
					accountMirrorStatus,
					accountLibraryActiveJobs,
					accountLibraryBrowserProcessStatus,
					tenantExecutionLimits,
					accountMirrorCompletions,
					preflight,
				] = await Promise.all([
					localClaimPromise,
					runnerTopologyPromise,
					hydrateAccountMirrorStatusMaterializationEvidence(
						rawAccountMirrorStatus,
						historyMaterializationService,
						runArchiveService,
					),
					readActiveAccountLibraryMaterializationJobs({ service: historyMaterializationService }),
					deps.accountMirrorBrowserProcessStatus === undefined
						? readAccountLibraryBrowserProcessStatus({
								status: rawScopedAccountMirrorStatus,
								now,
							})
						: Promise.resolve(deps.accountMirrorBrowserProcessStatus),
					readTenantExecutionLimitsStatus(statusQuery.tenantExecutionLimitsMode === "usage"),
					createAccountMirrorCompletionStatusSummary(accountMirrorCompletionService, now),
					readPreflightStatusSummary(preflightRunner),
				]);
				const runnerTopology = compactRunnerTopologyForStatus(
					rawRunnerTopology,
					statusQuery.runnerTopologyMode,
				);
				const statusResponseAccountMirrorStatus = scopeAccountMirrorStatusForProofScope(
					accountMirrorStatus,
					accountMirrorProofScope,
				);
				const accountLibraryPreviews = await previewAccountLibraryCatchupTargets({
					status: statusResponseAccountMirrorStatus,
					service: historyMaterializationService,
				});
				const statusResponse = await createHttpStatusResponse({
					now,
					host: boundHost,
					port: boundPort,
					dashboardUrl: options.dashboardUrl,
					publicDashboardUrl: options.publicDashboardUrl,
					serviceRouting: options.serviceRouting,
					recoverySummary: statusResponseRecoverySummary,
					localClaimSummary: statusResponseLocalClaimSummary,
					runnerTopology,
					runner: runnerState,
					backgroundDrain: backgroundDrainState,
					tenantExecutionLimits,
					accountMirrorScheduler: accountMirrorSchedulerState,
					accountMirrorSchedulerForegroundWork: readForegroundAuraCallWorkStatus(),
					accountMirrorStatus: statusResponseAccountMirrorStatus,
					accountMirrorAccountLibraryPreviews: accountLibraryPreviews,
					accountMirrorAccountLibraryActiveJobs: accountLibraryActiveJobs,
					accountMirrorBrowserProcessStatus: accountLibraryBrowserProcessStatus,
					accountMirrorCompletions,
					accountMirrorProofScope: createAccountMirrorProofScopeStatus(
						accountMirrorProofScope,
						accountMirrorStatus,
						{
							resumeAccountMirrorCompletionsOnStart,
							reconcileAccountMirrorLiveFollowOnStart,
							accountMirrorSchedulerIntervalMs,
							backgroundDrainIntervalMs,
						},
					),
					tabConcurrency: await readTabConcurrencyStatus(),
					preflight,
					auth: apiAuthPolicy,
				});
				sendJson(res, 200, statusResponse);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/api/logs/tail") {
				const address = server.address();
				const boundPort =
					address && typeof address !== "string" ? address.port : (options.port ?? 0);
				const query = parseApiLogTailQuery(url.searchParams);
				sendJson(res, 200, await readApiLogTail({ port: boundPort, maxBytes: query.maxBytes }));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/browser/processes") {
				const query = parseBrowserProcessStatusQuery(url.searchParams);
				await accountMirrorStatusRegistry.refreshPersistentState?.(query);
				sendJson(
					res,
					200,
					await readBrowserProcessStatus({
						status: await hydrateAccountMirrorStatusMaterializationEvidence(
							accountMirrorStatusRegistry.readStatus(query),
							historyMaterializationService,
							runArchiveService,
						),
						now,
					}),
				);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/browser/dom-drift-observations") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(
					res,
					200,
					await listDomDriftObservations(parseDomDriftObservationQuery(url.searchParams)),
				);
				return;
			}

			const domDriftAcceptId = matchDomDriftObservationAcceptRoute(url.pathname);
			if (req.method === "POST" && domDriftAcceptId) {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const result = await acceptDomDriftObservation(domDriftAcceptId);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `DOM drift observation ${domDriftAcceptId} was not found.`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, result);
				return;
			}

			const preflightRunLogId = matchPreflightRunLogRoute(url.pathname);
			if (req.method === "GET" && preflightRunLogId) {
				const query = parseApiLogTailQuery(url.searchParams);
				const payload = await readLazyLiveFollowPreflightRunLogTail({
					id: preflightRunLogId,
					maxBytes: query.maxBytes,
					runner: preflightRunner,
				});
				if (!payload) {
					sendJson(res, 404, {
						error: {
							message: `Lazy live-follow preflight run ${preflightRunLogId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, payload);
				return;
			}

			const preflightRunId = matchPreflightRunRoute(url.pathname);
			if (req.method === "GET" && preflightRunId) {
				const run = await readLazyLiveFollowPreflightRun(preflightRunId, preflightRunner);
				if (!run) {
					sendJson(res, 404, {
						error: {
							message: `Lazy live-follow preflight run ${preflightRunId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, run);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/status") {
				const query = parseAccountMirrorStatusQuery(url.searchParams);
				await accountMirrorStatusRegistry.refreshPersistentState?.({
					provider: query.provider,
					runtimeProfileId: query.runtimeProfileId,
				});
				sendJson(
					res,
					200,
					await hydrateAccountMirrorStatusMaterializationEvidence(
						accountMirrorStatusRegistry.readStatus(query),
						historyMaterializationService,
						runArchiveService,
					),
				);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/catalog") {
				const query = parseAccountMirrorCatalogQuery(url.searchParams);
				const result: HttpAccountMirrorCatalogResponse =
					await accountMirrorCatalogService.readCatalog(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/recovery-candidates") {
				const query = parseAccountMirrorArtifactRecoveryPlanQuery(url.searchParams);
				const result: AccountMirrorArtifactRecoveryPlanResult =
					await accountMirrorArtifactRecoveryPlanner.plan(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && isAccountMirrorCatalogItemAssetRoute(url.pathname)) {
				const query = parseAccountMirrorCatalogItemAssetQuery(url.pathname, url.searchParams);
				const result: HttpAccountMirrorCatalogItemResponse | null =
					await accountMirrorCatalogService.readItem(query);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror catalog item ${query.itemId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				const asset = await resolveCachedCatalogItemAsset(result, configuredRuntimeConfig);
				if (!asset) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror catalog item ${query.itemId} has no cache-owned local asset.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendCachedAsset(res, asset);
				return;
			}

			if (req.method === "GET" && url.pathname.startsWith("/v1/account-mirrors/catalog/items/")) {
				const query = parseAccountMirrorCatalogItemQuery(url.pathname, url.searchParams);
				const result: HttpAccountMirrorCatalogItemResponse | null =
					await accountMirrorCatalogService.readItem(query);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror catalog item ${query.itemId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/archive") {
				const query = parseRunArchiveQuery(url.searchParams);
				const result: HttpRunArchiveResponse = await runArchiveService.listItems(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/search") {
				const query = parseSearchProjectionQuery(url.searchParams);
				const result: SearchProjectionResult = await searchProjectionService.search(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/archive/assets/lookup") {
				const query = parseRunArchiveAssetLookupQuery(url.searchParams);
				const result: HttpRunArchiveAssetLookupResponse =
					await runArchiveService.lookupAsset(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/archive/backfill") {
				const result = await runArchiveService.backfillIndex();
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/archive/evidence") {
				const body = await readRequestBody(req);
				const payload = parseRunArchiveEvidenceCreateBody(JSON.parse(body || "{}"));
				const result: HttpRunArchiveEvidenceResponse =
					await runArchiveService.attachEvidence(payload);
				sendJson(res, 201, result);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/archive/materializations") {
				try {
					const body = await readRequestBody(req);
					const payload = parseRunArchiveMaterializationCreateBody(JSON.parse(body || "{}"));
					const result: ArchiveMaterializationJobCreateResult =
						await archiveMaterializationJobService.createJob(payload);
					sendJson(res, 202, result);
					return;
				} catch (error) {
					if (error instanceof ArchiveMaterializationError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "GET" && url.pathname === "/v1/archive/materializations") {
				const query = parseRunArchiveMaterializationJobListQuery(url.searchParams);
				const result: ArchiveMaterializationJobListResult =
					await archiveMaterializationJobService.listJobs(query);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/materializations") {
				try {
					const body = await readRequestBody(req);
					const payload = parseHistoryMaterializationCreateBody(JSON.parse(body || "{}"));
					const result: HistoryMaterializationJobCreateResult =
						await historyMaterializationService.createJob(payload);
					sendJson(res, 202, result);
					return;
				} catch (error) {
					if (error instanceof HistoryMaterializationError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/materializations") {
				const query = parseHistoryMaterializationJobListQuery(url.searchParams);
				const result: HistoryMaterializationJobListResult =
					await historyMaterializationService.listJobs(query);
				sendJson(
					res,
					200,
					url.searchParams.get("detail") === "full"
						? result
						: {
								...result,
								jobs: result.jobs.map(projectHistoryMaterializationJobForMonitoring),
							},
				);
				return;
			}

			if (req.method === "GET" && isHistoryMaterializationJobRoute(url.pathname)) {
				const jobId = parseHistoryMaterializationJobId(url.pathname);
				const result = await historyMaterializationService.readJob(jobId);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `History materialization job ${jobId} was not found.`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(
					res,
					200,
					url.searchParams.get("detail") === "full"
						? result
						: projectHistoryMaterializationJobForMonitoring(result),
				);
				return;
			}

			if (req.method === "POST" && isHistoryMaterializationJobRoute(url.pathname)) {
				try {
					const jobId = parseHistoryMaterializationJobId(url.pathname);
					const body = await readRequestBody(req);
					const payload = parseHistoryMaterializationJobControlBody(JSON.parse(body || "{}"));
					if (payload.action !== "cancel") {
						throw new HistoryMaterializationJobControlError(
							`Unsupported history materialization job action ${payload.action}.`,
						);
					}
					const result = await historyMaterializationService.cancelJob(jobId);
					sendJson(res, 200, result);
					return;
				} catch (error) {
					if (error instanceof HistoryMaterializationJobControlError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.type,
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "GET" && isRunArchiveMaterializationJobRoute(url.pathname)) {
				const jobId = parseRunArchiveMaterializationJobId(url.pathname);
				const result = await archiveMaterializationJobService.readJob(jobId);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Archive materialization job ${jobId} was not found.`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "POST" && isRunArchiveMaterializationJobRoute(url.pathname)) {
				try {
					const jobId = parseRunArchiveMaterializationJobId(url.pathname);
					const body = await readRequestBody(req);
					const payload = parseRunArchiveMaterializationJobControlBody(JSON.parse(body || "{}"));
					if (payload.action !== "cancel") {
						throw new ArchiveMaterializationJobControlError(
							`Unsupported archive materialization job action ${payload.action}.`,
						);
					}
					const result = await archiveMaterializationJobService.cancelJob(jobId);
					sendJson(res, 200, result);
					return;
				} catch (error) {
					if (error instanceof ArchiveMaterializationJobControlError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.type,
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "POST" && isRunArchiveItemMaterializeRoute(url.pathname)) {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const itemId = parseRunArchiveItemMaterializeId(url.pathname);
					const body = await readRequestBody(req);
					const payload = parseRunArchiveItemMaterializeBody(JSON.parse(body || "{}"));
					const result: ArchiveItemMaterializationResult =
						await archiveMaterializationService.materializeItem({
							archiveItemId: itemId,
							force: payload.force,
						});
					sendJson(
						res,
						result.status === "materialized" || result.status === "already_materialized"
							? 200
							: 202,
						result,
					);
					return;
				} catch (error) {
					if (error instanceof ArchiveMaterializationError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					if (isProviderAuthPreflightError(error)) {
						sendJson(res, 409, {
							error: {
								message:
									error instanceof Error
										? error.message
										: "Provider browser auth preflight failed.",
								type: "provider_auth_conflict",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "GET" && isRunArchiveItemAssetRoute(url.pathname)) {
				const itemId = parseRunArchiveItemAssetId(url.pathname);
				const result: HttpRunArchiveAssetResponse | null =
					await runArchiveService.readAsset(itemId);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Run archive item ${itemId} has no readable local asset.`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendCachedAsset(res, {
					path: result.path,
					mimeType: result.mimeType,
					size: result.size,
					fileName: result.fileName,
				});
				return;
			}

			if (req.method === "GET" && url.pathname.startsWith("/v1/archive/items/")) {
				const itemId = parseRunArchiveItemId(url.pathname);
				const result: HttpRunArchiveItemResponse | null = await runArchiveService.readItem(itemId);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Run archive item ${itemId} was not found.`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, result);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/scheduler/history") {
				const limit = parsePositiveIntegerQuery(url.searchParams.get("limit"));
				const history = await accountMirrorSchedulerLedger.readHistory();
				accountMirrorSchedulerState.history = history;
				sendJson(
					res,
					200,
					summarizeAccountMirrorSchedulerHistory(history, {
						limit,
					}) satisfies HttpAccountMirrorSchedulerHistoryResponse,
				);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/scheduler/diagnostics") {
				const query = parseAccountMirrorSchedulerDiagnosticsQuery(url.searchParams);
				const result = createAccountMirrorSchedulerDiagnosticsBundle({
					query,
					scheduler: accountMirrorSchedulerState,
					status: await hydrateAccountMirrorStatusMaterializationEvidence(
						accountMirrorStatusRegistry.readStatus({
							provider: normalizeBrowserProcessProvider(query.provider),
							runtimeProfileId: query.runtimeProfileId,
						}),
						historyMaterializationService,
						runArchiveService,
					),
					completions: await createAccountMirrorCompletionStatusSummary(
						accountMirrorCompletionService,
						now,
					),
					readCompletion: (id) => accountMirrorCompletionService.read(id),
					readBrowserMutations: (provider, runtimeProfileId) => {
						if (provider !== "chatgpt" && provider !== "gemini" && provider !== "grok") {
							return null;
						}
						const browserConfig = resolvedUserConfig;
						if (!browserConfig) {
							return null;
						}
						if (
							runtimeProfileId &&
							browserConfig.auracallProfile &&
							runtimeProfileId !== browserConfig.auracallProfile
						) {
							return null;
						}
						const items = BrowserService.fromConfig(
							browserConfig,
							provider,
						).listRecentBrowserMutations(50);
						return summarizeAccountMirrorDiagnosticsBrowserMutations(items);
					},
					now,
				});
				if (!result.ok) {
					sendJson(res, result.status, {
						error: {
							message: result.message,
							type: result.type,
						},
					});
					return;
				}
				sendJson(res, 200, result.bundle);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/preview-sessions") {
				const body = await readRequestBody(req);
				const payload = JSON.parse(body || "{}") as {
					id?: unknown;
					name?: unknown;
					manifest?: unknown;
				};
				try {
					const record = await accountMirrorPreviewSessionStore.writeSession({
						id: typeof payload.id === "string" ? payload.id : null,
						name: typeof payload.name === "string" ? payload.name : null,
						manifest: payload.manifest,
						now: now().toISOString(),
					});
					sendJson(res, 201, record);
					return;
				} catch (error) {
					sendJson(res, 400, {
						error: {
							message: error instanceof Error ? error.message : "Invalid preview session manifest.",
							type: "invalid_request_error",
						},
					});
					return;
				}
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/preview-sessions") {
				const limit = parsePositiveIntegerQuery(url.searchParams.get("limit"));
				const records = await accountMirrorPreviewSessionStore.listSessions({ limit });
				sendJson(res, 200, {
					object: "list",
					data: records,
					count: records.length,
				});
				return;
			}

			const accountMirrorPreviewSessionId = matchAccountMirrorPreviewSessionRoute(url.pathname);
			if (req.method === "GET" && accountMirrorPreviewSessionId) {
				const record = await accountMirrorPreviewSessionStore.readSession(
					accountMirrorPreviewSessionId,
				);
				if (!record) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror preview session ${accountMirrorPreviewSessionId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, record);
				return;
			}

			if (req.method === "PATCH" && accountMirrorPreviewSessionId) {
				const body = await readRequestBody(req);
				const payload = JSON.parse(body || "{}") as {
					name?: unknown;
				};
				try {
					const record = await accountMirrorPreviewSessionStore.renameSession({
						id: accountMirrorPreviewSessionId,
						name: typeof payload.name === "string" ? payload.name : null,
						now: now().toISOString(),
					});
					if (!record) {
						sendJson(res, 404, {
							error: {
								message: `Account mirror preview session ${accountMirrorPreviewSessionId} was not found.`,
								type: "not_found_error",
							},
						});
						return;
					}
					sendJson(res, 200, record);
					return;
				} catch (error) {
					sendJson(res, 400, {
						error: {
							message:
								error instanceof Error ? error.message : "Invalid preview session rename request.",
							type: "invalid_request_error",
						},
					});
					return;
				}
			}

			if (req.method === "DELETE" && accountMirrorPreviewSessionId) {
				const deleted = await accountMirrorPreviewSessionStore.deleteSession(
					accountMirrorPreviewSessionId,
				);
				if (!deleted) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror preview session ${accountMirrorPreviewSessionId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, {
					object: "account_mirror_preview_session.deleted",
					id: accountMirrorPreviewSessionId,
					deleted: true,
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/reconciliations") {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_RECONCILIATION_REQUEST_SCHEMA.parse(
					JSON.parse(body || "{}"),
				);
				try {
					const result = await accountMirrorReconciliationCampaignService.create({
						provider: payload.provider,
						runtimeProfileId: payload.runtimeProfile,
						identity: payload.identity,
						includeDisabled: payload.includeDisabled ?? payload.include_disabled,
						maxTargets: payload.maxTargets ?? payload.max_targets,
						maxActiveTargets: payload.maxActiveTargets ?? payload.max_active_targets,
						materializationPolicy: payload.materializationPolicy ?? payload.materialization_policy,
						materializationAssetKinds:
							payload.materializationAssetKinds ?? payload.materialization_asset_kinds,
						materializationMaxItems:
							payload.materializationMaxItems ?? payload.materialization_max_items,
						dryRun: payload.dryRun ?? payload.dry_run,
					});
					sendJson(res, 202, result satisfies HttpAccountMirrorReconciliationResponse);
					return;
				} catch (error) {
					if (error instanceof AccountMirrorReconciliationError) {
						sendJson(res, 409, {
							error: {
								message: error.message,
								type: "invalid_request_error",
								code: error.code,
							},
						});
						return;
					}
					throw error;
				}
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/reconciliations") {
				const query = parseAccountMirrorReconciliationListQuery(url.searchParams);
				const data = await accountMirrorReconciliationCampaignService.list(query);
				sendJson(res, 200, {
					object: "list",
					data,
					count: data.length,
				} satisfies HttpAccountMirrorReconciliationListResponse);
				return;
			}

			const accountMirrorReconciliationId = matchAccountMirrorReconciliationRoute(url.pathname);
			if (req.method === "GET" && accountMirrorReconciliationId) {
				const result = await accountMirrorReconciliationCampaignService.read(
					accountMirrorReconciliationId,
				);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror reconciliation campaign ${accountMirrorReconciliationId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, result satisfies HttpAccountMirrorReconciliationResponse);
				return;
			}

			if (req.method === "POST" && accountMirrorReconciliationId) {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_RECONCILIATION_CONTROL_REQUEST_SCHEMA.parse(
					JSON.parse(body || "{}"),
				);
				const result = await accountMirrorReconciliationCampaignService.control({
					id: accountMirrorReconciliationId,
					action: payload.action,
				});
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror reconciliation campaign ${accountMirrorReconciliationId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, result satisfies HttpAccountMirrorReconciliationResponse);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/completions") {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_COMPLETION_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
				const result = accountMirrorCompletionService.start({
					conversationIds: payload.conversationIds,
					provider: payload.provider,
					runtimeProfileId: payload.runtimeProfile,
					maxPasses: payload.maxPasses,
					sweepMode: payload.sweepMode ?? payload.sweep_mode,
					materializationPolicy: payload.materializationPolicy ?? payload.materialization_policy,
					materializationAssetKinds:
						payload.materializationAssetKinds ?? payload.materialization_asset_kinds,
					materializationMaxItems:
						payload.materializationMaxItems ?? payload.materialization_max_items,
					materializationRefreshSnapshot:
						payload.materializationRefreshSnapshot ?? payload.materialization_refresh_snapshot,
					materializationForce: payload.materializationForce ?? payload.materialization_force,
				});
				sendJson(res, 202, result satisfies HttpAccountMirrorCompletionResponse);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/account-mirrors/completions") {
				const query = parseAccountMirrorCompletionListQuery(url.searchParams);
				const listed = accountMirrorCompletionService.list(query);
				const fullDetail = url.searchParams.get("detail") === "full";
				const data = fullDetail
					? accountMirrorCompletionService.refreshMaterializationStatuses
						? await accountMirrorCompletionService.refreshMaterializationStatuses(listed)
						: listed
					: listed.map(projectAccountMirrorCompletionForMonitoring);
				sendJson(res, 200, {
					object: "list",
					data,
					count: data.length,
				} satisfies HttpAccountMirrorCompletionListResponse);
				return;
			}

			const accountMirrorCompletionId = matchAccountMirrorCompletionRoute(url.pathname);
			if (req.method === "GET" && accountMirrorCompletionId) {
				const fullDetail = url.searchParams.get("detail") === "full";
				const fullResult =
					fullDetail && accountMirrorCompletionService.refreshMaterializationStatus
						? await accountMirrorCompletionService.refreshMaterializationStatus(
								accountMirrorCompletionId,
							)
						: accountMirrorCompletionService.read(accountMirrorCompletionId);
				const result =
					fullDetail || !fullResult
						? fullResult
						: projectAccountMirrorCompletionForMonitoring(fullResult);
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror completion ${accountMirrorCompletionId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, result satisfies HttpAccountMirrorCompletionResponse);
				return;
			}

			if (req.method === "POST" && accountMirrorCompletionId) {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_COMPLETION_CONTROL_REQUEST_SCHEMA.parse(
					JSON.parse(body || "{}"),
				);
				const result = accountMirrorCompletionService.control({
					id: accountMirrorCompletionId,
					action: payload.action,
				});
				if (!result) {
					sendJson(res, 404, {
						error: {
							message: `Account mirror completion ${accountMirrorCompletionId} was not found.`,
							type: "not_found_error",
						},
					});
					return;
				}
				sendJson(res, 200, result satisfies HttpAccountMirrorCompletionResponse);
				return;
			}

			const developmentRunMatch = /^\/v1\/account-mirrors\/development-runs\/([^/]+)$/.exec(
				url.pathname,
			);
			if (developmentRunMatch) {
				const developmentRun = accountMirrorDevelopmentRuns.get(
					decodeURIComponent(developmentRunMatch[1] ?? ""),
				);
				if (!developmentRun) {
					sendJson(res, 404, {
						error: {
							message: "Account-mirror development run was not found.",
							type: "not_found_error",
						},
					});
					return;
				}
				if (req.method === "POST") {
					const body = await readRequestBody(req);
					const action = z.object({ action: z.literal("cancel") }).parse(JSON.parse(body || "{}"));
					if (action.action === "cancel" && developmentRun.status === "running") {
						developmentRun.status = "cancelled";
						developmentRun.completedAt = now().toISOString();
						developmentRun.controller.abort(
							new Error(`Account-mirror development run ${developmentRun.id} was cancelled.`),
						);
					}
				}
				const { controller: _controller, ...readback } = developmentRun;
				sendJson(res, 200, { object: "account_mirror_development_run", ...readback });
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/development-runs") {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
				if (!payload.development || !payload.provider || !payload.runtimeProfile) {
					sendJson(res, 400, {
						error: {
							message: "Development runs require provider, runtimeProfile, and development bounds.",
							type: "invalid_request_error",
						},
					});
					return;
				}
				resolveAccountMirrorDevelopmentPolicy({
					policy: payload.development,
					provider: payload.provider,
					runtimeProfileId: payload.runtimeProfile,
					serverCapabilityArmed: accountMirrorDevelopmentControlsArmed,
				});
				const id = `amdev_${randomUUID()}`;
				const run: typeof accountMirrorDevelopmentRuns extends Map<string, infer V> ? V : never = {
					id,
					status: "running",
					startedAt: now().toISOString(),
					completedAt: null,
					provider: payload.provider,
					runtimeProfileId: payload.runtimeProfile,
					policy: payload.development,
					diagnostics: [] as AccountMirrorCollectorDiagnosticEvent[],
					result: null,
					error: null,
					controller: new AbortController(),
				};
				accountMirrorDevelopmentRuns.set(id, run);
				void accountMirrorRefreshService
					.requestRefresh({
						provider: payload.provider,
						runtimeProfileId: payload.runtimeProfile,
						explicitRefresh: true,
						sweepMode: payload.sweepMode,
						requestedPhase: payload.requestedPhase,
						development: payload.development,
						abortSignal: run.controller.signal,
						onCollectorDiagnosticEvent: (event) => {
							run.diagnostics.push(event);
							if (run.diagnostics.length > 100) run.diagnostics.shift();
						},
					})
					.then((result) => {
						if (run.status === "cancelled") return;
						run.status = "completed";
						run.completedAt = now().toISOString();
						run.result = result;
					})
					.catch((error) => {
						if (run.status === "cancelled") return;
						run.status = "failed";
						run.completedAt = now().toISOString();
						run.error = {
							message: error instanceof Error ? error.message : String(error),
							code: error instanceof AccountMirrorRefreshError ? error.code : null,
						};
					});
				const { controller: _controller, ...readback } = run;
				sendJson(res, 202, { object: "account_mirror_development_run", ...readback });
				return;
			}

			if (url.pathname === "/v1/account-mirrors/development-policy") {
				if (req.method === "GET") {
					sendJson(res, 200, {
						object: "account_mirror_development_capability",
						armed: accountMirrorDevelopmentControlsArmed,
						environmentVariable: "AURACALL_ACCOUNT_MIRROR_DEVELOPMENT_CONTROLS",
					});
					return;
				}
				if (req.method === "POST") {
					const body = await readRequestBody(req);
					const payload = ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
					if (!payload.development || !payload.provider || !payload.runtimeProfile) {
						sendJson(res, 400, {
							error: {
								message:
									"Development policy preview requires provider, runtimeProfile, and development bounds.",
								type: "invalid_request_error",
							},
						});
						return;
					}
					try {
						const effective = resolveAccountMirrorDevelopmentPolicy({
							policy: payload.development as AccountMirrorDevelopmentPolicy,
							provider: payload.provider,
							runtimeProfileId: payload.runtimeProfile,
							serverCapabilityArmed: accountMirrorDevelopmentControlsArmed,
						});
						sendJson(res, 200, {
							object: "account_mirror_development_policy_preview",
							providerWorkStarted: false,
							normalPolicy: {
								collectorTimeoutMs: 120_000,
								detailReadCap: 6,
							},
							effective,
						});
						return;
					} catch (error) {
						if (error instanceof AccountMirrorRefreshError) {
							sendJson(res, error.statusCode, {
								error: {
									message: error.message,
									type: "invalid_request_error",
									code: error.code,
									details: error.details,
								},
							});
							return;
						}
						throw error;
					}
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/account-mirrors/refresh") {
				const body = await readRequestBody(req);
				const payload = ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
				try {
					const result = await accountMirrorRefreshService.requestRefresh({
						provider: payload.provider,
						runtimeProfileId: payload.runtimeProfile,
						explicitRefresh: payload.explicitRefresh,
						ignoreMinimumInterval: payload.ignoreMinimumInterval ?? payload.ignore_minimum_interval,
						ignoreFailureBackoff: payload.ignoreFailureBackoff ?? payload.ignore_failure_backoff,
						queueTimeoutMs: payload.queueTimeoutMs,
						queuePollMs: payload.queuePollMs,
						collectorTimeoutMs: payload.collectorTimeoutMs,
						sweepMode: payload.sweepMode,
						requestedPhase: payload.requestedPhase,
						development: payload.development,
					});
					sendJson(res, 202, result satisfies HttpAccountMirrorRefreshResponse);
					return;
				} catch (error) {
					if (error instanceof AccountMirrorRefreshError) {
						sendJson(res, error.statusCode, {
							error: {
								message: error.message,
								type: error.statusCode === 404 ? "not_found_error" : "invalid_request_error",
								code: error.code,
								details: error.details,
							},
						});
						return;
					}
					throw error;
				}
			}

			const recoveryDetailRunId = matchStatusRecoveryDetailRoute(url.pathname);
			if (req.method === "GET" && recoveryDetailRunId) {
				const detail = await host.readRecoveryDetail(recoveryDetailRunId);
				if (!detail) {
					sendJson(res, 404, {
						error: {
							message: `Recovery detail for run ${recoveryDetailRunId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, {
					object: "recovery_detail",
					detail,
				} satisfies HttpRecoveryDetailResponse);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/team-runs/inspect") {
				try {
					const inspection = await inspectTeamRunLinkage({
						taskRunSpecId: url.searchParams.get("taskRunSpecId"),
						teamRunId: url.searchParams.get("teamRunId"),
						runtimeRunId: url.searchParams.get("runtimeRunId"),
						control,
					});
					sendJson(res, 200, {
						object: "team_run_inspection",
						inspection,
					} satisfies HttpTeamRunInspectionResponse);
					return;
				} catch (error) {
					if (error instanceof TeamRunInspectionError) {
						sendJson(res, error.status === "not-found" ? 404 : 400, {
							error: {
								message: error.message,
								type: error.status === "not-found" ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "GET" && url.pathname === "/v1/runtime-runs/recent") {
				const query = parseRuntimeRunListQuery(url.searchParams);
				const records = await control.listRuns(query);
				const data = records.map(summarizeExecutionRunListItem);
				sendJson(res, 200, {
					object: "list",
					data,
					count: data.length,
				} satisfies HttpRuntimeRunListResponse);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/runtime-runs/inspect") {
				try {
					const runtimeInspectQuery = parseRuntimeInspectionQuery(url.searchParams);
					const inspection = await inspectRuntimeRun({
						runId: url.searchParams.get("runId"),
						runtimeRunId: url.searchParams.get("runtimeRunId"),
						teamRunId: url.searchParams.get("teamRunId"),
						taskRunSpecId: url.searchParams.get("taskRunSpecId"),
						runnerId: url.searchParams.get("runnerId"),
						includeServiceState: runtimeInspectQuery.probe === "service-state",
						includeBrowserDiagnostics: runtimeInspectQuery.diagnostics === "browser-state",
						includeSchedulerAuthority: runtimeInspectQuery.authority === "scheduler",
						schedulerAuthorityLocalRunnerId: url.searchParams.get("runnerId") ?? runnerState.id,
						probeServiceState: deps.probeRuntimeRunServiceState,
						probeBrowserDiagnostics: deps.probeRuntimeRunBrowserDiagnostics,
						control,
						runnersControl,
						createRunAffinity,
					});
					sendJson(res, 200, {
						object: "runtime_run_inspection",
						inspection,
					} satisfies HttpRuntimeRunInspectionResponse);
					return;
				} catch (error) {
					if (error instanceof RuntimeRunInspectionError) {
						sendJson(res, error.status === "not-found" ? 404 : 400, {
							error: {
								message: error.message,
								type: error.status === "not-found" ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				}
			}

			if (req.method === "POST" && url.pathname === "/status") {
				const body = await readRequestBody(req);
				const payload = STATUS_CONTROL_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
				let controlResult: HttpStatusResponse["controlResult"];
				if ("backgroundDrain" in payload) {
					const action = payload.backgroundDrain.action;
					if (backgroundDrainIntervalMs <= 0) {
						sendJson(res, 409, {
							error: {
								message: "background drain is not enabled for this server",
								type: "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					if (action === "pause") {
						backgroundDrainPaused = true;
						backgroundDrainState.paused = true;
						if (backgroundDrainTimer) {
							clearTimeout(backgroundDrainTimer);
							backgroundDrainTimer = null;
						}
						backgroundDrainScheduled = false;
						if (backgroundDrainState.state !== "running") {
							backgroundDrainState.state = "paused";
						}
					} else {
						backgroundDrainPaused = false;
						backgroundDrainState.paused = false;
						if (backgroundDrainState.state !== "running") {
							backgroundDrainState.state = "idle";
						}
						scheduleBackgroundDrain(0);
					}
					controlResult = {
						kind: "background-drain",
						action,
					};
				} else if ("accountMirrorScheduler" in payload) {
					const action = payload.accountMirrorScheduler.action;
					if (action === "pause" || action === "resume") {
						if (accountMirrorSchedulerIntervalMs <= 0) {
							sendJson(res, 409, {
								error: {
									message: "account mirror scheduler is not enabled for this server",
									type: "invalid_request_error",
								},
							} satisfies HttpErrorPayload);
							return;
						}
						if (action === "pause") {
							await writeAccountMirrorSchedulerControlState({
								paused: true,
								updatedAt: now().toISOString(),
							});
							accountMirrorSchedulerPaused = true;
							accountMirrorSchedulerState.paused = true;
							if (accountMirrorSchedulerTimer) {
								clearTimeout(accountMirrorSchedulerTimer);
								accountMirrorSchedulerTimer = null;
							}
							accountMirrorSchedulerScheduled = false;
							if (accountMirrorSchedulerState.state !== "running") {
								accountMirrorSchedulerState.state = "paused";
							}
						} else {
							await writeAccountMirrorSchedulerControlState({
								paused: false,
								updatedAt: now().toISOString(),
							});
							accountMirrorSchedulerPaused = false;
							accountMirrorSchedulerState.paused = false;
							if (accountMirrorSchedulerState.state !== "running") {
								accountMirrorSchedulerState.state = "idle";
							}
							if (resumeAccountMirrorCompletionsOnStartRequested) {
								accountMirrorCompletionService.resumeActiveOperations?.();
							}
							if (reconcileAccountMirrorLiveFollowOnStartRequested) {
								await reconcileAccountMirrorLiveFollow();
							}
							scheduleAccountMirrorScheduler(0, "operator-resume");
						}
						controlResult = {
							kind: "account-mirror-scheduler",
							action,
							dryRun: accountMirrorSchedulerDryRun,
						};
					} else {
						const requestedDryRun = payload.accountMirrorScheduler.dryRun ?? true;
						const dryRun = accountMirrorSchedulerDryRun ? true : requestedDryRun;
						const runWithForegroundPressure = action === "run-once-with-foreground-pressure";
						const runScheduler = () =>
							runAccountMirrorSchedulerPass({
								dryRun,
								...(runWithForegroundPressure ? { ignoreMinimumInterval: true } : {}),
								wakeReason: runWithForegroundPressure
									? "operator-foreground-pressure-proof"
									: "operator-run-once",
							});
						const endForegroundWork = runWithForegroundPressure
							? beginForegroundAuraCallWork()
							: null;
						let ran = false;
						try {
							ran = await runScheduler();
						} finally {
							endForegroundWork?.();
						}
						if (!ran) {
							sendJson(res, 409, {
								error: {
									message: "account mirror scheduler is already running",
									type: "invalid_request_error",
								},
							} satisfies HttpErrorPayload);
							return;
						}
						controlResult = {
							kind: "account-mirror-scheduler",
							action,
							dryRun,
						};
					}
				} else if ("accountMirrorProviderGuard" in payload) {
					const cooldownMs =
						payload.accountMirrorProviderGuard.cooldownMs ??
						DEFAULT_ACCOUNT_MIRROR_PROVIDER_GUARD_CLEAR_COOLDOWN_MS;
					await clearPersistedBrowserProviderGuard({
						provider: payload.accountMirrorProviderGuard.provider,
						runtimeProfileId: payload.accountMirrorProviderGuard.runtimeProfile,
						cooldownMs,
						now,
					});
					const guardClear = clearAccountMirrorProviderGuard({
						registry: accountMirrorStatusRegistry,
						provider: payload.accountMirrorProviderGuard.provider,
						runtimeProfileId: payload.accountMirrorProviderGuard.runtimeProfile,
						cooldownMs,
						now,
					});
					if (resolvedUserConfig) {
						await clearConfiguredAggregateProviderWarning({
							userConfig: resolvedUserConfig,
							provider: payload.accountMirrorProviderGuard.provider,
							runtimeProfileId: payload.accountMirrorProviderGuard.runtimeProfile,
							clearedAt: now().toISOString(),
							cooldownUntil: guardClear.cooldownUntil,
							reason: "Operator cleared provider guard; quiet cooldown before automation resumes.",
						});
					}
					controlResult = {
						kind: guardClear.kind,
						action: guardClear.action,
						provider: guardClear.provider,
						runtimeProfileId: guardClear.runtimeProfileId,
						cooldownUntil: guardClear.cooldownUntil,
					};
				} else if ("accountMirrorCompletion" in payload) {
					const { id, action } = payload.accountMirrorCompletion;
					const operation = accountMirrorCompletionService.control({ id, action });
					if (!operation) {
						sendJson(res, 404, {
							error: {
								message: `account mirror completion not found: ${id}`,
								type: "not_found_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					controlResult = {
						kind: "account-mirror-completion",
						action,
						id,
						status: operation.status,
					};
				} else if ("preflight" in payload) {
					const result = await preflightRunner.start();
					controlResult = {
						kind: "preflight",
						action: payload.preflight.action,
						accepted: result.accepted,
						reason: result.reason,
						id: result.run.id,
						status: result.run.status,
						logPath: result.run.logPath,
					};
				} else if ("serviceControl" in payload) {
					const delayMs = payload.serviceControl.delayMs ?? 750;
					const unitName = "auracall-api.service";
					const dryRun = payload.serviceControl.dryRun ?? false;
					if (!dryRun) {
						scheduleApiServiceRestart({ unitName, delayMs });
					}
					controlResult = {
						kind: "service-control",
						action: payload.serviceControl.action,
						unitName,
						restartCommand: `systemctl --user restart ${unitName}`,
						scheduled: !dryRun,
						dryRun,
						delayMs,
					};
				} else {
					const result = await host.controlOperatorAction(
						createServiceHostOperatorControlInput(payload),
					);
					if (!isSuccessfulServiceHostOperatorControlResult(result)) {
						sendJson(res, result.status === "not-found" ? 404 : 409, {
							error: {
								message: result.reason,
								type: result.status === "not-found" ? "not_found_error" : "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					controlResult = result;
				}
				const address = server.address();
				const boundPort =
					address && typeof address !== "string" ? address.port : (options.port ?? 0);
				await syncRunnerStateFromStore();
				const accountMirrorStatus = await hydrateAccountMirrorStatusMaterializationEvidence(
					accountMirrorStatusRegistry.readStatus(),
					historyMaterializationService,
					runArchiveService,
				);
				const statusResponseAccountMirrorStatus = scopeAccountMirrorStatusForProofScope(
					accountMirrorStatus,
					accountMirrorProofScope,
				);
				const accountLibraryPreviews = await previewAccountLibraryCatchupTargets({
					status: statusResponseAccountMirrorStatus,
					service: historyMaterializationService,
				});
				const accountLibraryActiveJobs = await readActiveAccountLibraryMaterializationJobs({
					service: historyMaterializationService,
				});
				const accountLibraryBrowserProcessStatus =
					deps.accountMirrorBrowserProcessStatus === undefined
						? await readAccountLibraryBrowserProcessStatus({
								status: statusResponseAccountMirrorStatus,
								now,
							})
						: deps.accountMirrorBrowserProcessStatus;
				const statusResponse = await createHttpStatusResponse({
					now,
					host: boundHost,
					port: boundPort,
					dashboardUrl: options.dashboardUrl,
					publicDashboardUrl: options.publicDashboardUrl,
					serviceRouting: options.serviceRouting,
					localClaimSummary: await host.summarizeLocalClaimState({ sourceKind: "direct" }),
					runnerTopology: await host.summarizeRunnerTopology(),
					runner: runnerState,
					backgroundDrain: backgroundDrainState,
					tenantExecutionLimits: await readTenantExecutionLimitsStatus(false),
					accountMirrorScheduler: accountMirrorSchedulerState,
					accountMirrorSchedulerForegroundWork: readForegroundAuraCallWorkStatus(),
					accountMirrorStatus: statusResponseAccountMirrorStatus,
					accountMirrorAccountLibraryPreviews: accountLibraryPreviews,
					accountMirrorAccountLibraryActiveJobs: accountLibraryActiveJobs,
					accountMirrorBrowserProcessStatus: accountLibraryBrowserProcessStatus,
					accountMirrorCompletions: await createAccountMirrorCompletionStatusSummary(
						accountMirrorCompletionService,
						now,
					),
					accountMirrorProofScope: createAccountMirrorProofScopeStatus(
						accountMirrorProofScope,
						accountMirrorStatus,
						{
							resumeAccountMirrorCompletionsOnStart,
							reconcileAccountMirrorLiveFollowOnStart,
							accountMirrorSchedulerIntervalMs,
							backgroundDrainIntervalMs,
						},
					),
					tabConcurrency: await readTabConcurrencyStatus(),
					preflight: await readPreflightStatusSummary(preflightRunner),
					controlResult,
					auth: apiAuthPolicy,
				});
				sendJson(res, 200, statusResponse);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/models") {
				sendJson(
					res,
					200,
					createHttpModelListResponse(await agentTeamConfigService.effectiveCatalog()),
				);
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/config/agents") {
				sendJson(res, 200, await agentTeamConfigService.list("agent"));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/config/agent-choices") {
				sendJson(res, 200, await agentTeamConfigService.choices());
				return;
			}

			const configAgentId = matchConfigEntityRoute(url.pathname, "agents");
			if (configAgentId && req.method === "PUT") {
				const body = await readRequestBody(req);
				const payload = agentConfigUpsertInputSchema.parse({
					id: configAgentId,
					config: JSON.parse(body || "{}"),
				});
				sendJson(res, 200, await agentTeamConfigService.upsertAgent(payload));
				return;
			}
			if (configAgentId && req.method === "DELETE") {
				sendJson(res, 200, await agentTeamConfigService.deleteAgent(configAgentId));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/config/teams") {
				sendJson(res, 200, await agentTeamConfigService.list("team"));
				return;
			}

			const configTeamId = matchConfigEntityRoute(url.pathname, "teams");
			if (configTeamId && req.method === "PUT") {
				const body = await readRequestBody(req);
				const payload = teamConfigUpsertInputSchema.parse({
					id: configTeamId,
					config: JSON.parse(body || "{}"),
				});
				sendJson(res, 200, await agentTeamConfigService.upsertTeam(payload));
				return;
			}
			if (configTeamId && req.method === "DELETE") {
				sendJson(res, 200, await agentTeamConfigService.deleteTeam(configTeamId));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/config/agent-diagnostics") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(
					res,
					200,
					await agentTeamConfigService.diagnostics({
						apiKeys: apiAuthPolicy.keys.map(toAgentConfigApiKeyDiagnosticInput),
					}),
				);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/config/api-keys/issue") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const body = await readRequestBody(req);
				const payload = parseConfigApiKeyIssueRequest(JSON.parse(body || "{}"));
				sendJson(res, 200, await issueApiKey(agentTeamConfigService, payload));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/config/api-keys") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const envPath = url.searchParams.get("envPath") ?? undefined;
				const diagnostics = await readApiKeyDiagnosticsFromEnvFile(envPath);
				sendJson(res, 200, {
					object: "auracall_api_key_list",
					envPath: diagnostics.envPath,
					exists: diagnostics.exists,
					apiKeys: diagnostics.apiKeys,
				});
				return;
			}

			const configApiKeyId = matchConfigApiKeyRoute(url.pathname);
			if (configApiKeyId && req.method === "DELETE") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(
					res,
					200,
					await deleteApiKey({
						keyId: configApiKeyId,
						envPath: url.searchParams.get("envPath") ?? undefined,
					}),
				);
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/config/snapshots/export") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const body = await readRequestBody(req);
				const payload = parseConfigSnapshotExportRequest(JSON.parse(body || "{}"));
				sendJson(res, 200, await agentTeamConfigService.exportSnapshot(payload));
				return;
			}

			if (req.method === "POST" && url.pathname === "/v1/config/snapshots/import") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const body = await readRequestBody(req);
				const payload = parseConfigSnapshotImportRequest(JSON.parse(body || "{}"));
				sendJson(res, 200, await agentTeamConfigService.importSnapshot(payload));
				return;
			}

			if (req.method === "GET" && url.pathname === "/v1/workbench-capabilities") {
				const request = parseWorkbenchCapabilityQuery(url.searchParams);
				const response = await workbenchCapabilityService.listCapabilities(request);
				sendJson(res, 200, response);
				return;
			}

			const handoffRoute = matchHandoffOperatorRoute(url.pathname);
			if (handoffRoute) {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const outputRootFromQuery = url.searchParams.get("outputDir");
				if (req.method === "GET" && handoffRoute.action === "status") {
					const status = await readHandoffStatus({
						handoffId: handoffRoute.id,
						outputRoot: outputRootFromQuery,
					});
					if (!status) {
						sendJson(res, 404, {
							error: {
								message: `Handoff packet ${handoffRoute.id} was not found`,
								type: "not_found_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					sendJson(res, 200, status);
					return;
				}
				if (req.method === "POST") {
					const body = await readRequestBody(req);
					const payload = parseHandoffOperatorRequestBody(JSON.parse(body || "{}"));
					const outputRoot = payload.outputDir ?? outputRootFromQuery;
					if (handoffRoute.action === "resume") {
						sendJson(
							res,
							200,
							await buildHandoffResumePlan({
								handoffId: handoffRoute.id,
								outputRoot,
							}),
						);
						return;
					}
					if (handoffRoute.action === "repair") {
						sendJson(
							res,
							200,
							await repairHandoffPacket({
								handoffId: handoffRoute.id,
								outputRoot,
							}),
						);
						return;
					}
					if (handoffRoute.action === "export") {
						sendJson(
							res,
							200,
							await exportHandoffManualBundle({
								handoffId: handoffRoute.id,
								outputRoot,
							}),
						);
						return;
					}
					if (handoffRoute.action === "recover-live") {
						const targetAdapter = resolveHandoffRecoverLiveTargetAdapter(
							payload.targetAdapter,
							resolvedUserConfig,
						);
						sendJson(
							res,
							200,
							await recoverHandoffLive({
								handoffId: handoffRoute.id,
								outputRoot,
								targetAdapter,
							}),
						);
						return;
					}
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/projects/ensure") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = ProjectEnsureInputSchema.parse(JSON.parse(body || "{}"));
					sendJson(res, 200, await projectEnsureService.ensureProject(payload));
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/tenant-pool-teams/ensure") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = TenantPoolTeamEnsureInputSchema.parse(JSON.parse(body || "{}"));
					sendJson(res, 200, await tenantPoolTeamEnsureService.ensureTeam(payload));
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/agent-setup-packages") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = AgentSetupPackageInputSchema.parse(JSON.parse(body || "{}"));
					sendJson(res, 200, await agentSetupPackageService.createPackage(payload));
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/agent-setup-handoffs") {
				const operatorAuthError = authorizeOperatorConfigAccess(apiAuthContext);
				if (operatorAuthError) {
					sendJson(res, 403, {
						error: {
							message: operatorAuthError,
							type: "permission_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = AgentSetupPackageInputSchema.parse(JSON.parse(body || "{}"));
					sendJson(res, 200, await agentSetupPackageService.createHandoff(payload));
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/team-runs") {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = TEAM_RUN_CREATE_REQUEST_SCHEMA.parse(JSON.parse(body || "{}"));
					const prebuiltTaskRunSpec = payload.taskRunSpec ?? null;
					const teamId = (prebuiltTaskRunSpec?.teamId ?? payload.teamId ?? "").trim();
					const authorizationError = authorizeExecutionSelection(
						apiAuthContext,
						{ agent: null, team: teamId || null, service: null, runtimeProfile: null },
						await agentTeamConfigService.effectiveCatalog(),
					);
					if (authorizationError) {
						sendJson(res, 403, {
							error: {
								message: authorizationError,
								type: "permission_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					const nowIso = now().toISOString();
					const suffix = createTeamRunIdSuffix();
					const teamRunId = `teamrun_${teamId}_${suffix}`;
					const taskRunSpec =
						prebuiltTaskRunSpec ??
						buildBoundedTeamTaskRunSpec({
							nowIso,
							taskRunSpecId: `taskrun_${teamId}_${suffix}`,
							teamId,
							objective: payload.objective ?? "",
							title: payload.title,
							promptAppend: payload.promptAppend,
							structuredContext: payload.structuredContext,
							responseFormat: payload.responseFormat,
							outputContract: payload.outputContract,
							maxTurns: payload.maxTurns,
							localActionPolicy: payload.localActionPolicy,
							context: {
								command: "auracall api serve",
							},
							requestedBy: {
								kind: "api",
								label: "auracall api serve",
							},
							trigger: "api",
						});
					const effectiveRuntimeConfig = await agentTeamConfigService.effectiveConfig();
					const bridgeResult = await teamRuntimeBridge.executeFromConfigTaskRunSpec({
						config: effectiveRuntimeConfig,
						teamId,
						runId: teamRunId,
						createdAt: nowIso,
						trigger: prebuiltTaskRunSpec ? undefined : "api",
						requestedBy: prebuiltTaskRunSpec ? undefined : "auracall api serve",
						taskRunSpec,
					});
					if (backgroundDrainIntervalMs > 0) {
						reserveForegroundAuraCallDrain();
						scheduleBackgroundDrain(0);
					}
					const execution = buildTeamRunExecutionPayload({
						teamId,
						bridgeResult,
						taskRunSpec,
					});
					const address = server.address();
					const boundPort =
						address && typeof address !== "string" ? address.port : (options.port ?? 0);
					sendJson(res, 200, {
						object: "team_run",
						taskRunSpec,
						execution,
						links: createTeamRunCreateLinks({
							host: boundHost,
							port: boundPort,
							teamRunId: execution.teamRunId,
							runtimeRunId: execution.runtimeRunId,
						}),
					} satisfies HttpTeamRunCreateResponse);
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const chatRequest = parseChatCompletionRequest(JSON.parse(body || "{}"));
					if (chatRequest.stream) {
						sendJson(res, 400, {
							error: {
								message:
									"Streaming chat completions are not supported by this AuraCall adapter yet.",
								type: "invalid_request_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					const catalog = await agentTeamConfigService.effectiveCatalog();
					const request = hydrateExecutionRequestFromCatalog(
						createExecutionRequest(
							mergeExecutionRequestHints(
								createExecutionRequestFromChatCompletion(chatRequest),
								req.headers,
							),
						),
						catalog,
					);
					const authorizationError = authorizeExecutionRequest(apiAuthContext, request, catalog);
					if (authorizationError) {
						sendJson(res, 403, {
							error: {
								message: authorizationError,
								type: "permission_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					const createdResponse = await responsesService.createResponse(request);
					const drain = drainThroughServerHost({
						runId: createdResponse.id,
						maxRuns: 1,
						trigger: "request-create",
					});
					const drainedInSyncWindow = await waitForChatCompletionDrain(
						drain,
						chatRequest.syncTimeoutMs,
					);
					if (!drainedInSyncWindow) {
						drain.catch((error) => {
							logger?.(
								`chat completion background drain failed after sync timeout: ${
									error instanceof Error ? error.message : String(error)
								}`,
							);
						});
						const pendingResponse =
							(await responsesService.readResponse(createdResponse.id)) ?? createdResponse;
						sendJson(res, 503, createChatCompletionPendingResponse(pendingResponse), {
							"Retry-After": String(CHAT_COMPLETION_RETRY_AFTER_SECONDS),
						});
						return;
					}
					scheduleAccountMirrorSchedulerFollowUp(0, "response-drain-completed");
					const response =
						(await responsesService.readResponse(createdResponse.id)) ?? createdResponse;
					if (response.status !== "completed") {
						sendJson(res, 502, createChatCompletionErrorResponse(response));
						return;
					}
					sendJson(res, 200, createChatCompletionResponse(response, now));
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/responses") {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const parsedBody = normalizeResponsesApiRequest(JSON.parse(body || "{}"));
					const catalog = await agentTeamConfigService.effectiveCatalog();
					const request = hydrateExecutionRequestFromCatalog(
						createExecutionRequest(mergeExecutionRequestHints(parsedBody, req.headers)),
						catalog,
					);
					const authorizationError = authorizeExecutionRequest(apiAuthContext, request, catalog);
					if (authorizationError) {
						sendJson(res, 403, {
							error: {
								message: authorizationError,
								type: "permission_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					const createdResponse = await responsesService.createResponse(request);
					if (backgroundDrainIntervalMs > 0) {
						reserveForegroundAuraCallDrain();
						scheduleBackgroundDrain(0);
						sendJson(res, 200, createdResponse);
					} else {
						await drainThroughServerHost({
							runId: createdResponse.id,
							maxRuns: 1,
							trigger: "request-create",
						});
						scheduleAccountMirrorSchedulerFollowUp(0, "response-drain-completed");
						const drainedResponse = await responsesService.readResponse(createdResponse.id);
						sendJson(res, 200, drainedResponse ?? createdResponse);
					}
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/response-batches") {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const parsedPayload = ResponseBatchCreateRequestSchema.parse(JSON.parse(body || "{}"));
					const catalog = await agentTeamConfigService.effectiveCatalog();
					const { dispatchResolution: _ignoredClientDispatchResolution, ...publicPayload } =
						parsedPayload;
					const hydratedRequests = parsedPayload.requests.map((request) =>
						hydrateExecutionRequestFromCatalog(
							createExecutionRequest(
								mergeExecutionRequestHints(normalizeResponsesApiRequest(request), req.headers),
							),
							catalog,
						),
					);
					const dispatchRequest = normalizeResponseBatchDispatchRequest({
						dispatch: publicPayload.dispatch,
						team: publicPayload.team,
					});
					let dispatchResolution = null;
					if (dispatchRequest) {
						try {
							dispatchResolution = await resolveResponseBatchDispatchPool({
								dispatch: dispatchRequest,
								requests: hydratedRequests,
								catalog,
								control,
							});
						} catch (error) {
							throw new HttpInvalidRequestError(
								error instanceof Error ? error.message : String(error),
							);
						}
					}
					const payload =
						dispatchRequest && dispatchResolution
							? {
									...publicPayload,
									dispatch: dispatchRequest,
									dispatchResolution,
									requests: dispatchResolution.requests,
								}
							: {
									...publicPayload,
									requests: hydratedRequests,
								};
					for (const request of payload.requests) {
						const authorizationError = authorizeExecutionRequest(apiAuthContext, request, catalog);
						if (authorizationError) {
							sendJson(res, 403, {
								error: {
									message: authorizationError,
									type: "permission_error",
								},
							} satisfies HttpErrorPayload);
							return;
						}
					}
					const status = await responseBatchService.createBatch(payload);
					if (backgroundDrainIntervalMs > 0) {
						reserveForegroundAuraCallDrain();
						const initialBatchMaxRuns = Math.max(
							1,
							Math.min(status.counts.total, status.limits.maxConcurrentRuns ?? 1),
						);
						void drainThroughServerHost({
							maxRuns: initialBatchMaxRuns,
							trigger: "request-create",
						}).catch((error) => {
							logger(error instanceof Error ? error.message : String(error));
							return null;
						});
					}
					sendJson(res, 202, status);
					return;
				} finally {
					endForegroundWork();
				}
			}

			if (req.method === "POST" && url.pathname === "/v1/media-generations") {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const parsedBody = JSON.parse(body || "{}") as MediaGenerationRequest & {
						wait?: unknown;
					};
					const mediaRequest = {
						...parsedBody,
						source: parsedBody.source ?? "api",
					};
					const createQuery = parseMediaGenerationCreateQuery(url.searchParams);
					const wait = resolveMediaGenerationWait(createQuery, parsedBody);
					const response =
						!wait && mediaGenerationService.createGenerationAsync
							? await mediaGenerationService.createGenerationAsync(mediaRequest)
							: await mediaGenerationService.createGeneration(mediaRequest);
					sendJson(res, wait && response.status === "failed" ? 502 : wait ? 200 : 202, response);
					return;
				} finally {
					endForegroundWork();
				}
			}

			const mediaGenerationMaterializeId = matchMediaGenerationMaterializeRoute(url.pathname);
			if (req.method === "POST" && mediaGenerationMaterializeId) {
				const endForegroundWork = beginForegroundAuraCallWork();
				try {
					const body = await readRequestBody(req);
					const payload = parseMediaGenerationMaterializeBody(JSON.parse(body || "{}"));
					if (!mediaGenerationService.materializeGeneration) {
						sendJson(res, 501, {
							error: {
								message: "Media generation materialization is not configured for this runtime.",
								type: "not_implemented_error",
							},
						} satisfies HttpErrorPayload);
						return;
					}
					const response = await mediaGenerationService.materializeGeneration(
						mediaGenerationMaterializeId,
						{
							count: payload.count ?? null,
							compareFullQuality: payload.compareFullQuality ?? true,
							source: "api",
							metadata: payload.metadata ?? null,
						},
					);
					sendJson(res, response.status === "failed" ? 502 : 200, response);
					return;
				} catch (error) {
					if (error instanceof MediaGenerationExecutionError) {
						sendJson(res, mediaGenerationExecutionErrorStatus(error), {
							error: {
								message: error.message,
								type: error.code,
							},
						} satisfies HttpErrorPayload);
						return;
					}
					throw error;
				} finally {
					endForegroundWork();
				}
			}

			const terminalReceiptSessionId = matchTerminalSessionReceiptRoute(url.pathname);
			if (req.method === "GET" && terminalReceiptSessionId) {
				const observation = await readTerminalSessionReceiptObservation(
					terminalReceiptSessionId,
					resolvedUserConfig ?? undefined,
				);
				if (observation.status === "disabled") {
					sendJson(res, 409, {
						error: {
							message: "Terminal session receipts are not enabled",
							type: "terminal_session_receipts_disabled",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				if (!observation.value) {
					const notFound = observation.failure?.code === "session_not_found";
					sendJson(res, notFound ? 404 : 500, {
						error: {
							message: notFound
								? `Session ${terminalReceiptSessionId} was not found`
								: "Terminal session receipt observation failed",
							type: observation.failure?.code ?? "terminal_session_receipt_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, observation.value);
				return;
			}

			const runStatusId = matchRunStatusRoute(url.pathname);
			if (req.method === "GET" && runStatusId) {
				const runStatusQuery = parseRunStatusQuery(url.searchParams);
				const response = await readAuraCallRunStatus(runStatusId, {
					responsesService,
					mediaGenerationService,
				});
				if (!response) {
					sendJson(res, 404, {
						error: {
							message: `Run ${runStatusId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				if (runStatusQuery.diagnostics === "browser-state") {
					response.browserDiagnostics = await readRunStatusBrowserDiagnostics({
						status: response,
						responsesService,
						mediaGenerationService,
						probeRuntimeRunBrowserDiagnostics: deps.probeRuntimeRunBrowserDiagnostics,
						probeMediaGenerationBrowserDiagnostics: probeMediaGenerationBrowserDiagnosticsImpl,
						control,
						runnersControl,
						createRunAffinity,
					});
				}
				sendJson(res, 200, response);
				return;
			}

			const mediaGenerationStatusId = matchMediaGenerationStatusRoute(url.pathname);
			if (req.method === "GET" && mediaGenerationStatusId) {
				const runStatusQuery = parseRunStatusQuery(url.searchParams);
				const response = await mediaGenerationService.readGeneration(mediaGenerationStatusId);
				if (!response) {
					sendJson(res, 404, {
						error: {
							message: `Media generation ${mediaGenerationStatusId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				const summary = summarizeMediaGenerationStatus(response);
				if (runStatusQuery.diagnostics === "browser-state") {
					sendJson(res, 200, {
						...summary,
						browserDiagnostics: await probeMediaGenerationBrowserDiagnosticsImpl(response),
					});
					return;
				}
				sendJson(res, 200, summary);
				return;
			}

			const mediaGenerationId = matchMediaGenerationRoute(url.pathname);
			if (req.method === "GET" && mediaGenerationId) {
				const response = await mediaGenerationService.readGeneration(mediaGenerationId);
				if (!response) {
					sendJson(res, 404, {
						error: {
							message: `Media generation ${mediaGenerationId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, response);
				return;
			}

			const responseId = matchResponseRoute(url.pathname);
			if (req.method === "GET" && responseId) {
				let response: Awaited<ReturnType<typeof responsesService.readResponse>>;
				try {
					response = await responsesService.readResponse(responseId);
				} catch (error) {
					logger(error instanceof Error ? error.message : String(error));
					sendJson(res, 500, createResponseReadbackErrorPayload(responseId, error));
					return;
				}
				if (!response) {
					sendJson(res, 404, {
						error: {
							message: `Response ${responseId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, response);
				return;
			}

			const responseBatchId = matchResponseBatchRoute(url.pathname);
			if (req.method === "GET" && responseBatchId) {
				const status = await responseBatchService.readBatchStatus(responseBatchId);
				if (!status) {
					sendJson(res, 404, {
						error: {
							message: `Response batch ${responseBatchId} was not found`,
							type: "not_found_error",
						},
					} satisfies HttpErrorPayload);
					return;
				}
				sendJson(res, 200, status);
				return;
			}

			sendJson(res, 404, {
				error: {
					message: "Not found",
					type: "invalid_request_error",
				},
			} satisfies HttpErrorPayload);
		} catch (error) {
			logger(error instanceof Error ? error.message : String(error));
			if (
				error instanceof SyntaxError ||
				error instanceof ZodError ||
				error instanceof HttpInvalidRequestError
			) {
				sendJson(res, 400, {
					error: {
						message: error instanceof Error ? error.message : "Invalid request body",
						type: "invalid_request_error",
					},
				} satisfies HttpErrorPayload);
				return;
			}

			sendJson(res, 500, {
				error: {
					message: error instanceof Error ? error.message : "Internal server error",
					type: "server_error",
				},
			} satisfies HttpErrorPayload);
		}
	});

	await new Promise<void>((resolve) => {
		server.listen(options.port ?? 0, boundHost, () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Unable to determine server address");
	}

	const localRunnerId = `runner:http-responses:${boundHost}:${address.port}`;
	const localRunnerHostId = `host:http-responses:${boundHost}:${address.port}`;
	const localRunnerLifecycleOptions = {
		hostId: localRunnerHostId,
		heartbeatTtlMs: runnerHeartbeatTtlMs,
		capabilitySummary: localRunnerCapabilitySummary,
		baseLabel: "api serve local runner",
		heartbeatLabel: "api serve runner heartbeat",
		shutdownLabel: "api serve shutdown",
	};
	const updateRunnerState = (runner: {
		id: string;
		hostId: string;
		status: HttpStatusResponse["runner"]["status"];
		lastHeartbeatAt: string;
		expiresAt: string;
		lastActivityAt: string | null;
		lastClaimedRunId: string | null;
	}) => {
		runnerState.id = runner.id;
		runnerState.hostId = runner.hostId;
		runnerState.status = runner.status;
		runnerState.lastHeartbeatAt = runner.lastHeartbeatAt;
		runnerState.expiresAt = runner.expiresAt;
		runnerState.lastActivityAt = runner.lastActivityAt;
		runnerState.lastClaimedRunId = runner.lastClaimedRunId;
	};
	const syncRunnerStateFromStore = async () => {
		if (!runnerState.id) return;
		const storedRunner = await runnersControl.readRunner(runnerState.id);
		if (!storedRunner) return;
		updateRunnerState({
			id: storedRunner.runner.id,
			hostId: storedRunner.runner.hostId,
			status: storedRunner.runner.status,
			lastHeartbeatAt: storedRunner.runner.lastHeartbeatAt,
			expiresAt: storedRunner.runner.expiresAt,
			lastActivityAt: storedRunner.runner.lastActivityAt,
			lastClaimedRunId: storedRunner.runner.lastClaimedRunId,
		});
	};
	const registerLocalRunner = async () => {
		const heartbeatAt = now().toISOString();
		const expiresAt = new Date(now().getTime() + runnerHeartbeatTtlMs).toISOString();
		runnerState.id = localRunnerId;
		runnerState.hostId = localRunnerHostId;
		runnerState.status = "registering";
		runnerState.lastHeartbeatAt = heartbeatAt;
		runnerState.expiresAt = expiresAt;
		const registeredRunner = await host.registerLocalRunner(localRunnerLifecycleOptions);
		if (registeredRunner) {
			updateRunnerState(registeredRunner);
		}
	};
	const heartbeatLocalRunner = async () => {
		if (closed || !runnerState.id) return;
		const heartbeatedRunner = await host.heartbeatLocalRunner(localRunnerLifecycleOptions);
		if (heartbeatedRunner) {
			updateRunnerState(heartbeatedRunner);
		}
	};
	const scheduleRunnerHeartbeat = () => {
		if (closed) return;
		runnerHeartbeatTimer = setTimeout(async () => {
			runnerHeartbeatTimer = null;
			try {
				await heartbeatLocalRunner();
			} catch (error) {
				logger(error instanceof Error ? error.message : String(error));
			} finally {
				scheduleRunnerHeartbeat();
			}
		}, runnerHeartbeatIntervalMs);
	};

	host =
		deps.executionHost ??
		createExecutionServiceHost({
			control,
			runnersControl,
			now: () => now().toISOString(),
			ownerId: localRunnerId,
			runnerId: localRunnerId,
			localActionExecutionPolicy: deps.localActionExecutionPolicy,
			createRunAffinity,
			executionGate,
			executeStoredRunStep: deps.executeStoredRunStep
				? async (context) => {
						const request = createExecutionRequestFromRecord(context.record);
						return deps.executeStoredRunStep?.(request, context);
					}
				: undefined,
		});
	teamRuntimeBridge = createTeamRuntimeBridge({
		control,
		host,
		now: () => now().toISOString(),
		drainAfterCreate: backgroundDrainIntervalMs <= 0,
	});
	responsesService = createExecutionResponsesService({
		control,
		now,
		generateResponseId: deps.generateResponseId,
		executionHost: host,
		drainAfterCreate: false,
		executeStoredRunStep: deps.executeStoredRunStep,
	});
	responseBatchService =
		deps.responseBatchService ??
		(deps.createResponseBatchService ?? createResponseBatchService)({
			responsesService,
			now,
			resolveDispatchPool: async (input) =>
				resolveResponseBatchDispatchPool({
					...input,
					catalog: await agentTeamConfigService.effectiveCatalog(),
					control,
				}),
		});

	if (!deps.executionHost) {
		await registerLocalRunner();
		try {
			const compaction = await runnersControl.compactStaleRunners({
				keepNewest: DEFAULT_STALE_RUNNER_RETENTION,
			});
			if (compaction.deletedRunnerIds.length > 0) {
				logger(
					`Compacted ${compaction.deletedRunnerIds.length} stale execution runner records; retained ${compaction.retainedRunnerIds.length} newest stale runner records.`,
				);
			}
		} catch (error) {
			logger(error instanceof Error ? error.message : String(error));
		}
		scheduleRunnerHeartbeat();
	}

	if (recoverRunsOnStart) {
		const sourceKind =
			recoverRunsOnStartSourceKind === "all" ? undefined : recoverRunsOnStartSourceKind;
		const recoveryResult = await drainThroughServerHost({
			sourceKind,
			candidateStatuses: ["planned", "running"],
			maxRuns: recoverRunsOnStartMaxRuns,
			trigger: "startup-recovery",
		});
		const recoverySummary = await host.summarizeRecoveryState({
			sourceKind,
			candidateStatuses: ["planned", "running"],
		});
		logger(
			createStartupRecoveryLog(recoveryResult, {
				sourceKind: recoverRunsOnStartSourceKind,
				maxRuns: recoverRunsOnStartMaxRuns,
				staleHeartbeatInspectOnlyCount:
					recoverySummary.attention.metrics.staleHeartbeatInspectOnlyCount,
				suspiciouslyIdleCount: recoverySummary.activeLeaseHealth.metrics.suspiciousIdleCount,
			}),
		);
	}
	scheduleBackgroundDrain();
	scheduleAccountMirrorScheduler(accountMirrorSchedulerIntervalMs, "startup-cadence");
	tabAffinityMaintenanceLoop.start();

	return {
		port: address.port,
		async close() {
			closed = true;
			await tabAffinityMaintenanceLoop.close();
			if (runnerHeartbeatTimer) {
				clearTimeout(runnerHeartbeatTimer);
				runnerHeartbeatTimer = null;
			}
			if (backgroundDrainTimer) {
				clearTimeout(backgroundDrainTimer);
				backgroundDrainTimer = null;
			}
			if (accountMirrorSchedulerTimer) {
				clearTimeout(accountMirrorSchedulerTimer);
				accountMirrorSchedulerTimer = null;
			}
			backgroundDrainPaused = false;
			accountMirrorSchedulerPaused = false;
			backgroundDrainState.paused = false;
			backgroundDrainState.state = "disabled";
			accountMirrorSchedulerState.paused = false;
			accountMirrorSchedulerState.state = "disabled";
			cancelActiveAccountMirrorCompletions(accountMirrorCompletionService);
			await host.waitForDrainQueue().catch(() => null);
			if (!deps.executionHost && runnerState.id) {
				const staleRunner = await host
					.markLocalRunnerStale(localRunnerLifecycleOptions)
					.catch((error) => {
						const message = error instanceof Error ? error.message : String(error);
						if (message.includes("revision mismatch")) return null;
						throw error;
					});
				if (staleRunner) {
					updateRunnerState(staleRunner);
				}
			}
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeIdleConnections();
			});
		},
	};
}

export async function serveResponsesHttp(options: ServeResponsesHttpOptions = {}): Promise<void> {
	const logger = options.logger ?? console.log;
	const {
		listenPublic: _unusedListenPublic,
		cliOptions: _unusedCliOptions,
		executeStoredRunStep: overrideExecuteStoredRunStep,
		mediaGenerationExecutor: overrideMediaGenerationExecutor,
		probeRuntimeRunServiceState: overrideProbeRuntimeRunServiceState,
		terminateProcess: terminateProcessOverride,
		...serverOptions
	} = options;
	const resolvedUserConfig = await resolveConfig(
		options.cliOptions ?? {},
		process.cwd(),
		process.env,
	);
	const apiConfig = readApiServerConfig(resolvedUserConfig as Record<string, unknown>);
	serverOptions.host = serverOptions.host ?? apiConfig.host;
	serverOptions.port = serverOptions.port ?? apiConfig.port;
	serverOptions.dashboardUrl = serverOptions.dashboardUrl ?? apiConfig.dashboardUrl;
	serverOptions.publicDashboardUrl =
		serverOptions.publicDashboardUrl ?? apiConfig.publicDashboardUrl;
	serverOptions.serviceRouting = serverOptions.serviceRouting ?? apiConfig.routing;
	serverOptions.accountMirrorSchedulerIntervalMs =
		serverOptions.accountMirrorSchedulerIntervalMs ?? apiConfig.accountMirrorSchedulerIntervalMs;
	serverOptions.accountMirrorSchedulerDryRun =
		serverOptions.accountMirrorSchedulerDryRun ?? apiConfig.accountMirrorSchedulerDryRun;
	assertResponsesHostAllowed(serverOptions.host, options.listenPublic ?? false);
	await terminateSamePortApiServeProcesses({
		port: serverOptions.port,
		logger,
		terminateProcess: terminateProcessOverride,
		includeConfigDerivedPort: options.port === undefined && apiConfig.port === serverOptions.port,
	});
	const agentRegistryStore = createAgentRegistryStore();
	const agentTeamConfigService = createAgentTeamConfigService({
		activeConfig: resolvedUserConfig as Record<string, unknown>,
		registryStore: agentRegistryStore,
	});
	const configuredStoredStepExecutor = createConfiguredStoredStepExecutor(
		resolvedUserConfig as Record<string, unknown>,
		{
			effectiveConfigProvider: () => agentTeamConfigService.effectiveConfig(),
			logger,
		},
	);
	if (!configuredStoredStepExecutor) {
		throw new Error("Configured stored-step executor was not created for api serve.");
	}
	const server = await createResponsesHttpServer(
		{
			...serverOptions,
			recoverRunsOnStart: serverOptions.recoverRunsOnStart ?? true,
			recoverRunsOnStartSourceKind: serverOptions.recoverRunsOnStartSourceKind,
			backgroundDrainIntervalMs:
				serverOptions.backgroundDrainIntervalMs ?? DEFAULT_BACKGROUND_DRAIN_INTERVAL_MS,
			accountMirrorSchedulerIntervalMs: serverOptions.accountMirrorSchedulerIntervalMs ?? 0,
			accountMirrorSchedulerDryRun: serverOptions.accountMirrorSchedulerDryRun ?? true,
		},
		{
			config: resolvedUserConfig as Record<string, unknown>,
			agentRegistryStore,
			now: () => new Date(),
			localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(
				resolvedUserConfig as Record<string, unknown>,
			),
			executeStoredRunStep:
				overrideExecuteStoredRunStep ??
				(async (_request, context) => configuredStoredStepExecutor(context)),
			mediaGenerationExecutor: overrideMediaGenerationExecutor,
			probeRuntimeRunServiceState:
				overrideProbeRuntimeRunServiceState ?? createDefaultRuntimeRunServiceStateProbe(),
			probeRuntimeRunBrowserDiagnostics:
				options.probeRuntimeRunBrowserDiagnostics ??
				createDefaultRuntimeRunBrowserDiagnosticsProbe(),
			discoverWorkbenchCapabilities: createBrowserWorkbenchCapabilityDiscovery(
				resolvedUserConfig as ResolvedUserConfig,
			),
			diagnoseWorkbenchCapabilities: createBrowserWorkbenchCapabilityDiagnostics(
				resolvedUserConfig as ResolvedUserConfig,
			),
		},
	);
	const host = serverOptions.host ?? "127.0.0.1";
	const bindAddress = `${host}:${server.port}`;
	const probeUrl = `http://${localProbeHost(host)}:${server.port}`;
	const localOnly = isLoopbackHost(host);
	logger(`AuraCall responses server bound on ${bindAddress}`);
	if (localOnly) {
		logger("Posture: local development only; bound to loopback and intentionally unauthenticated.");
	} else {
		logger(
			`Warning: ${host} is not loopback. This server is still unauthenticated and intended for local development only.`,
		);
	}
	logger(`Active AuraCall runtime profile: ${resolvedUserConfig.auracallProfile ?? "default"}`);
	logger(
		"Endpoints: GET /status, GET /v1/api/logs/tail, GET /status/recovery/{run_id}, GET /v1/terminal-receipts/{session_id}, POST /v1/team-runs, GET /v1/team-runs/inspect, POST /v1/projects/ensure, POST /v1/tenant-pool-teams/ensure, POST /v1/agent-setup-packages, POST /v1/agent-setup-handoffs, GET /v1/runtime-runs/recent, GET /v1/runtime-runs/inspect, GET /v1/models, GET /v1/workbench-capabilities, POST /v1/chat/completions, POST /v1/responses, GET /v1/responses/{response_id}, POST /v1/media-generations, GET /v1/media-generations/{media_generation_id}, POST /v1/media-generations/{media_generation_id}/materialize, GET /v1/search, GET /v1/archive, POST /v1/archive/backfill, POST /v1/archive/evidence, GET/POST /v1/archive/materializations, GET/POST /v1/archive/materializations/{job_id}, GET /v1/archive/items/{archive_item_id}, GET /v1/archive/items/{archive_item_id}/asset, POST /v1/archive/items/{archive_item_id}/materialize, GET /v1/account-mirrors/status, GET /v1/account-mirrors/catalog, GET /v1/account-mirrors/recovery-candidates, GET/POST /v1/account-mirrors/materializations, GET/POST /v1/account-mirrors/materializations/{job_id}, GET /v1/account-mirrors/scheduler/history, POST /v1/account-mirrors/preview-sessions, GET /v1/account-mirrors/preview-sessions, GET/PATCH/DELETE /v1/account-mirrors/preview-sessions/{preview_session_id}, POST /v1/account-mirrors/refresh, POST /v1/account-mirrors/reconciliations, GET /v1/account-mirrors/reconciliations, GET/POST /v1/account-mirrors/reconciliations/{campaign_id}, POST /v1/account-mirrors/completions, GET /v1/account-mirrors/completions, GET/POST /v1/account-mirrors/completions/{completion_id}",
	);
	logger(`Local probe: curl ${probeUrl}/status`);
	if (serverOptions.dashboardUrl) {
		logger(`Operator dashboard: ${serverOptions.dashboardUrl}`);
	}
	if (serverOptions.publicDashboardUrl) {
		logger(`Public operator dashboard: ${serverOptions.publicDashboardUrl}`);
	}
	logger("Leave this terminal running; press Ctrl+C to stop auracall api serve.");

	await new Promise<void>((resolve, reject) => {
		let closing = false;
		const cleanupSignalHandlers = () => {
			process.off("SIGINT", handleSignal);
			process.off("SIGTERM", handleSignal);
		};
		const handleSignal = () => {
			if (closing) return;
			closing = true;
			cleanupSignalHandlers();
			void server.close().then(resolve).catch(reject);
		};
		process.once("SIGINT", handleSignal);
		process.once("SIGTERM", handleSignal);
	});
}

function cancelActiveAccountMirrorCompletions(service: AccountMirrorCompletionService): void {
	if (service.prepareForShutdown) {
		service.prepareForShutdown();
		return;
	}
	for (const operation of service.list({ status: "active", limit: null })) {
		service.control({ id: operation.id, action: "cancel" });
	}
}

export async function terminateSamePortApiServeProcesses(input: {
	port?: number | null;
	logger?: (message: string) => void;
	terminateProcess?: (pid: number, signal: NodeJS.Signals) => void;
	isProcessAlive?: (pid: number) => boolean;
	sleep?: (ms: number) => Promise<void>;
	terminationGraceMs?: number;
	currentPid?: number;
	procRoot?: string;
	operationLockRoot?: string;
	includeConfigDerivedPort?: boolean;
}): Promise<number[]> {
	const port = normalizeApiServePort(input.port);
	if (port === null) return [];
	const currentPid = input.currentPid ?? process.pid;
	const procRoot = input.procRoot ?? "/proc";
	const terminateProcess = input.terminateProcess ?? ((pid, signal) => process.kill(pid, signal));
	const isProcessAlive = input.isProcessAlive ?? defaultIsProcessAlive;
	const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const matches = await findSamePortApiServeProcesses({
		port,
		currentPid,
		procRoot,
		includeConfigDerivedPort: input.includeConfigDerivedPort === true,
	});
	const terminatedPids: number[] = [];
	for (const match of matches) {
		try {
			terminateProcess(match.pid, "SIGTERM");
			input.logger?.(`Terminated orphan AuraCall api serve process ${match.pid} for port ${port}.`);
			const exited = await waitForProcessExit(match.pid, {
				isProcessAlive,
				sleep,
				timeoutMs: input.terminationGraceMs ?? 2_000,
				pollMs: 100,
			});
			if (!exited && isProcessAlive(match.pid)) {
				terminateProcess(match.pid, "SIGKILL");
				input.logger?.(
					`Force-killed orphan AuraCall api serve process ${match.pid} for port ${port}.`,
				);
			}
			terminatedPids.push(match.pid);
		} catch (error) {
			input.logger?.(
				`Failed to terminate orphan AuraCall api serve process ${match.pid} for port ${port}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	const operationLockRoot =
		input.operationLockRoot ?? path.join(getAuracallHomeDir(), "browser-operations");
	await removeBrowserOperationLocksForOwnerPids({
		ownerPids: terminatedPids,
		lockRoot: operationLockRoot,
		logger: input.logger,
	});
	await removeStaleBrowserOperationLocks({
		lockRoot: operationLockRoot,
		isProcessAlive,
		logger: input.logger,
	});
	return matches.map((match) => match.pid);
}

async function removeBrowserOperationLocksForOwnerPids(input: {
	ownerPids: number[];
	lockRoot: string;
	logger?: (message: string) => void;
}): Promise<number> {
	const ownerPids = new Set(input.ownerPids);
	if (ownerPids.size === 0) return 0;
	let entries: string[];
	try {
		entries = await fs.readdir(input.lockRoot);
	} catch {
		return 0;
	}
	let removed = 0;
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		const lockPath = path.join(input.lockRoot, entry);
		try {
			const raw = await fs.readFile(lockPath, "utf8");
			const parsed = JSON.parse(raw) as { ownerPid?: unknown };
			if (typeof parsed.ownerPid !== "number" || !ownerPids.has(parsed.ownerPid)) continue;
			await fs.rm(lockPath, { force: true });
			removed += 1;
		} catch {}
	}
	if (removed > 0) {
		input.logger?.(
			`Removed ${removed} browser operation lock${removed === 1 ? "" : "s"} owned by terminated api serve process.`,
		);
	}
	return removed;
}

async function removeStaleBrowserOperationLocks(input: {
	lockRoot: string;
	isProcessAlive: (pid: number) => boolean;
	logger?: (message: string) => void;
}): Promise<number> {
	let entries: string[];
	try {
		entries = await fs.readdir(input.lockRoot);
	} catch {
		return 0;
	}
	let removed = 0;
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		const lockPath = path.join(input.lockRoot, entry);
		try {
			const raw = await fs.readFile(lockPath, "utf8");
			const parsed = JSON.parse(raw) as { ownerPid?: unknown };
			if (typeof parsed.ownerPid !== "number" || input.isProcessAlive(parsed.ownerPid)) continue;
			await fs.rm(lockPath, { force: true });
			removed += 1;
		} catch {}
	}
	if (removed > 0) {
		input.logger?.(`Removed ${removed} stale browser operation lock${removed === 1 ? "" : "s"}.`);
	}
	return removed;
}

async function findSamePortApiServeProcesses(input: {
	port: number;
	currentPid: number;
	procRoot: string;
	includeConfigDerivedPort?: boolean;
}): Promise<Array<{ pid: number; commandLine: string }>> {
	let entries: string[];
	try {
		entries = await fs.readdir(input.procRoot);
	} catch {
		return [];
	}
	const matches: Array<{ pid: number; commandLine: string }> = [];
	for (const entry of entries) {
		if (!/^\d+$/.test(entry)) continue;
		const pid = Number(entry);
		if (!Number.isSafeInteger(pid) || pid <= 0 || pid === input.currentPid) continue;
		const commandLine = await readProcCommandLine(input.procRoot, pid);
		if (!commandLine) continue;
		if (
			isSamePortApiServeCommand(commandLine, input.port, input.includeConfigDerivedPort === true)
		) {
			matches.push({ pid, commandLine });
		}
	}
	return matches;
}

async function readProcCommandLine(procRoot: string, pid: number): Promise<string | null> {
	try {
		const raw = await fs.readFile(`${procRoot}/${pid}/cmdline`);
		return raw.toString("utf8").split("\0").filter(Boolean).join(" ");
	} catch {
		return null;
	}
}

function isSamePortApiServeCommand(
	commandLine: string,
	port: number,
	includeConfigDerivedPort = false,
): boolean {
	if (!/^node\s+/.test(commandLine)) return false;
	if (!commandLine.includes("/auracall.js") && !/\bauracall\.js\b/.test(commandLine)) return false;
	if (!/\bapi\s+serve\b/.test(commandLine)) return false;
	if (commandLine.includes(`--port ${port}`) || commandLine.includes(`--port=${port}`)) return true;
	return includeConfigDerivedPort && !/\s--port(?:\s|=)/.test(commandLine);
}

function normalizeApiServePort(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const port = Math.trunc(value);
	return port > 0 && port <= 65535 ? port : null;
}

async function waitForProcessExit(
	pid: number,
	input: {
		isProcessAlive: (pid: number) => boolean;
		sleep: (ms: number) => Promise<void>;
		timeoutMs: number;
		pollMs: number;
	},
): Promise<boolean> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < input.timeoutMs) {
		if (!input.isProcessAlive(pid)) return true;
		await input.sleep(input.pollMs);
	}
	return !input.isProcessAlive(pid);
}

function defaultIsProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

type DefaultRuntimeRunServiceStateProbeDeps = {
	resolveConfigImpl?: typeof resolveConfig;
	probeChatgptBrowserServiceStateImpl?: typeof probeChatgptBrowserServiceState;
	probeGeminiBrowserServiceStateImpl?: typeof probeGeminiBrowserServiceState;
	probeGrokBrowserServiceStateImpl?: typeof probeGrokBrowserServiceState;
	readLiveRuntimeRunServiceStateImpl?: typeof readLiveRuntimeRunServiceState;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

export function createDefaultRuntimeRunServiceStateProbe(
	deps: DefaultRuntimeRunServiceStateProbeDeps = {},
): ResponsesHttpServerDeps["probeRuntimeRunServiceState"] {
	const resolveConfigImpl = deps.resolveConfigImpl ?? resolveConfig;
	const probeChatgptBrowserServiceStateImpl =
		deps.probeChatgptBrowserServiceStateImpl ?? probeChatgptBrowserServiceState;
	const probeGeminiBrowserServiceStateImpl =
		deps.probeGeminiBrowserServiceStateImpl ?? probeGeminiBrowserServiceState;
	const probeGrokBrowserServiceStateImpl =
		deps.probeGrokBrowserServiceStateImpl ?? probeGrokBrowserServiceState;
	const readLiveRuntimeRunServiceStateImpl =
		deps.readLiveRuntimeRunServiceStateImpl ?? readLiveRuntimeRunServiceState;
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;

	return async ({ inspection, step }) => {
		if (step.service !== "chatgpt" && step.service !== "gemini" && step.service !== "grok") {
			return null;
		}

		let transientLiveState: RuntimeRunInspectionServiceStateProbeResult | null = null;
		if (step.service === "gemini" || step.service === "grok") {
			const inspectionRunId =
				typeof inspection?.record?.runId === "string" && inspection.record.runId.trim().length > 0
					? inspection.record.runId.trim()
					: null;
			if (inspectionRunId) {
				transientLiveState = readLiveRuntimeRunServiceStateImpl({
					runId: inspectionRunId,
					stepId: step.id,
					service: step.service,
				});
			}
		}

		const runtimeProfileId =
			typeof step.runtimeProfileId === "string" && step.runtimeProfileId.trim().length > 0
				? step.runtimeProfileId.trim()
				: null;
		const resolvedConfig = await resolveConfigImpl(
			runtimeProfileId ? { profile: runtimeProfileId } : {},
			cwd,
			env,
		);

		if (runtimeProfileId && resolvedConfig.auracallProfile !== runtimeProfileId) {
			return null;
		}

		if (step.service === "chatgpt") {
			return probeChatgptBrowserServiceStateImpl(resolvedConfig);
		}

		if (resolvedConfig.engine !== "browser") {
			return null;
		}

		if (step.service === "gemini") {
			const geminiState = await probeGeminiBrowserServiceStateImpl(resolvedConfig, {
				prompt: typeof step.input?.prompt === "string" ? step.input.prompt : null,
			});
			if (geminiState && geminiState.state !== "unknown") {
				return geminiState;
			}
			if (transientLiveState) {
				return transientLiveState;
			}
			return geminiState;
		}

		const grokState = await probeGrokBrowserServiceStateImpl(resolvedConfig);
		if (grokState && grokState.state !== "unknown" && grokState.state !== "thinking") {
			return grokState;
		}
		if (transientLiveState) {
			return transientLiveState;
		}
		return grokState;
	};
}

type DefaultRuntimeRunBrowserDiagnosticsProbeDeps = {
	resolveConfigImpl?: typeof resolveConfig;
	probeBrowserRunDiagnosticsImpl?: typeof probeBrowserRunDiagnostics;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

export function createDefaultRuntimeRunBrowserDiagnosticsProbe(
	deps: DefaultRuntimeRunBrowserDiagnosticsProbeDeps = {},
): ResponsesHttpServerDeps["probeRuntimeRunBrowserDiagnostics"] {
	const resolveConfigImpl = deps.resolveConfigImpl ?? resolveConfig;
	const probeBrowserRunDiagnosticsImpl =
		deps.probeBrowserRunDiagnosticsImpl ?? probeBrowserRunDiagnostics;
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;

	return async ({ inspection, step }) => {
		if (step.service !== "chatgpt" && step.service !== "gemini" && step.service !== "grok") {
			return null;
		}
		const runtimeProfileId =
			typeof step.runtimeProfileId === "string" && step.runtimeProfileId.trim().length > 0
				? step.runtimeProfileId.trim()
				: null;
		const resolvedConfig = await resolveConfigImpl(
			runtimeProfileId ? { profile: runtimeProfileId } : {},
			cwd,
			env,
		);

		if (runtimeProfileId && resolvedConfig.auracallProfile !== runtimeProfileId) {
			return null;
		}

		if (resolvedConfig.engine !== "browser") {
			return null;
		}

		return probeBrowserRunDiagnosticsImpl(resolvedConfig, {
			service: step.service as BrowserDiagnosticsService,
			runId: inspection.record.runId,
			stepId: step.id,
		});
	};
}

export function assertResponsesHostAllowed(host: string | undefined, listenPublic: boolean): void {
	if (listenPublic || isLoopbackHost(host ?? "127.0.0.1")) {
		return;
	}
	throw new Error(
		`Refusing to bind responses server to non-loopback host "${host}". Re-run with --listen-public if you really want an unauthenticated development server on a public interface.`,
	);
}

function createHttpModelListResponse(catalog: {
	agents: Array<ProjectedAgent | EffectiveAgent>;
}): HttpModelListResponse {
	const providerModels: HttpModelDescriptor[] = Object.entries(MODEL_CONFIGS).map(
		([id, config]) => ({
			id,
			object: "model",
			created: 0,
			owned_by: config.provider ?? "other",
			metadata: {
				kind: "provider_model",
				provider: config.provider ?? "other",
			},
		}),
	);
	const semanticSelectors: HttpModelDescriptor[] = SEMANTIC_MODEL_SELECTORS.map((selector) => ({
		id: selector.id,
		object: "model",
		created: 0,
		owned_by: `auracall:${selector.service}`,
		metadata: {
			kind: "semantic_model_selector",
			service: selector.service,
			label: selector.label,
			executionReady: selector.executionReady,
		},
	}));
	const configuredAgents: HttpModelDescriptor[] = catalog.agents.map((agent) => ({
		id: `agent:${agent.id}`,
		object: "model",
		created: 0,
		owned_by: "auracall:agent",
		metadata: {
			kind: "agent",
			source: "source" in agent ? agent.source : "config",
			enabled: "enabled" in agent ? agent.enabled : true,
			revision: "revision" in agent ? agent.revision : undefined,
			service: agent.service ?? agent.defaultService ?? undefined,
			agent,
		},
	}));
	return {
		object: "list",
		data: [...providerModels, ...semanticSelectors, ...configuredAgents],
	};
}

function createHttpStatusResponse(input: {
	now: () => Date;
	host: string;
	port: number;
	dashboardUrl?: string;
	publicDashboardUrl?: string;
	serviceRouting?: ApiServiceRoutingConfig;
	recoverySummary?: ExecutionServiceHostRecoverySummary;
	localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
	runnerTopology: ExecutionServiceHostRunnerTopologySummary;
	runner: HttpStatusResponse["runner"];
	backgroundDrain: HttpStatusResponse["backgroundDrain"];
	tenantExecutionLimits: TenantExecutionLimitStatusSummary;
	accountMirrorScheduler: HttpStatusResponse["accountMirrorScheduler"] & {
		history: AccountMirrorSchedulerPassHistory;
	};
	accountMirrorSchedulerForegroundWork: AccountMirrorSchedulerForegroundWorkStatus;
	accountMirrorStatus: AccountMirrorStatusSummary;
	accountMirrorAccountLibraryPreviews?: AccountMirrorAccountLibraryPreviewMap | null;
	accountMirrorAccountLibraryActiveJobs?: AccountMirrorAccountLibraryActiveJobMap | null;
	accountMirrorBrowserProcessStatus?: HttpBrowserProcessStatusResponse | null;
	accountMirrorCompletions: AccountMirrorCompletionStatusSummary;
	accountMirrorProofScope: AccountMirrorProofScopeStatus;
	tabConcurrency: BrowserTabConcurrencyStatus;
	preflight?: PreflightStatusSummary;
	controlResult?: HttpStatusResponse["controlResult"];
	auth: ApiAuthPolicy;
}): HttpStatusResponse {
	const accountMirrorScheduler = {
		...input.accountMirrorScheduler,
		foregroundWork: input.accountMirrorSchedulerForegroundWork,
	};
	accountMirrorScheduler.operatorStatus =
		createAccountMirrorSchedulerOperatorStatus(accountMirrorScheduler);
	const serviceDiscovery = buildApiServiceDiscovery({
		host: input.host,
		port: input.port,
		dashboardUrl: input.dashboardUrl,
		publicDashboardUrl: input.publicDashboardUrl,
		serviceRouting: input.serviceRouting,
	});
	const compactAccountMirrorScheduler: HttpStatusResponse["accountMirrorScheduler"] = {
		...accountMirrorScheduler,
		history: summarizeAccountMirrorSchedulerHistory(accountMirrorScheduler.history, {
			limit: 10,
		}) as unknown as AccountMirrorSchedulerPassHistory,
	};
	return {
		object: "status",
		ok: true,
		version: getCliVersion(),
		mode: "development",
		api: createApiRuntimeStatus(input.port),
		binding: {
			host: input.host,
			port: input.port,
			localOnly: isLoopbackHost(input.host),
			unauthenticated: !input.auth.required,
		},
		auth: {
			required: input.auth.required,
			scheme: input.auth.required ? "bearer" : "none",
			keyCount: input.auth.keys.length,
			scoped: input.auth.keys.some((key) =>
				Boolean(
					key.agents?.length ||
						key.teams?.length ||
						key.services?.length ||
						key.runtimeProfiles?.length,
				),
			),
		},
		serviceDiscovery,
		routes: {
			status: "/status",
			recoveryDetailTemplate: "/status/recovery/{run_id}",
			teamRunsCreate: "/v1/team-runs",
			teamRunInspection:
				"/v1/team-runs/inspect?taskRunSpecId={task_run_spec_id}|teamRunId={team_run_id}|runtimeRunId={runtime_run_id}",
			projectEnsure: "POST /v1/projects/ensure",
			tenantPoolTeamEnsure: "POST /v1/tenant-pool-teams/ensure",
			agentSetupPackagesCreate: "POST /v1/agent-setup-packages",
			agentSetupHandoffsCreate: "POST /v1/agent-setup-handoffs",
			runtimeRunsRecent:
				"/v1/runtime-runs/recent[?sourceKind=team-run|direct][&status=planned|running|succeeded|failed|cancelled][&limit=25]",
			runtimeRunInspection:
				"/v1/runtime-runs/inspect?runId={run_id}|teamRunId={team_run_id}|taskRunSpecId={task_run_spec_id}|runtimeRunId={runtime_run_id}[&runnerId={runner_id}][&probe=service-state][&diagnostics=browser-state][&authority=scheduler]",
			models: "/v1/models",
			chatCompletionsCreate: "/v1/chat/completions",
			responsesCreate: "/v1/responses",
			responsesGetTemplate: "/v1/responses/{response_id}",
			responseBatchesCreate: "/v1/response-batches",
			responseBatchesGetTemplate: "/v1/response-batches/{batch_id}",
			mediaGenerationsCreate: "/v1/media-generations",
			mediaGenerationsGetTemplate: "/v1/media-generations/{media_generation_id}",
			mediaGenerationsMaterializeTemplate:
				"POST /v1/media-generations/{media_generation_id}/materialize",
			mediaGenerationsStatusTemplate:
				"/v1/media-generations/{media_generation_id}/status[?diagnostics=browser-state]",
			runArchive:
				"/v1/archive[?kind=response|response_batch|team_run|media_generation|upload|generated_artifact|provider_conversation|evidence][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&projectId={provider_project_id}][&agent={agent_id}][&team={team_id}][&responseId={response_id}][&batchId={batch_id}][&status={status}][&fileAvailable=true|false][&assetAvailability=available|unavailable|pending][&q={query}][&limit=50]",
			runArchiveAssetLookup:
				"/v1/archive/assets/lookup?checksumSha256={sha256}|cacheKey={cache_key}|providerArtifactId={provider_artifact_id}|artifactId={artifact_id}[&limit=50]",
			search:
				"/v1/search[?q={query}][&kind=conversation|artifact|upload|run|evidence][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&tenant={bound_identity_key}][&status={status}][&fileAvailable=true|false][&assetAvailability=available|unavailable|pending][&materialization=queued|running|succeeded|skipped|failed|cancelled|active|terminal][&limit=80][&cursor={cursor}]",
			runArchiveBackfill: "/v1/archive/backfill",
			runArchiveEvidenceCreate: "/v1/archive/evidence",
			runArchiveItemTemplate: "/v1/archive/items/{archive_item_id}",
			runArchiveItemAssetTemplate: "/v1/archive/items/{archive_item_id}/asset",
			runArchiveItemMaterializeTemplate: "/v1/archive/items/{archive_item_id}/materialize",
			runArchiveMaterializationsCreate: "/v1/archive/materializations",
			runArchiveMaterializationsList:
				"/v1/archive/materializations[?status=queued|running|succeeded|skipped|failed|cancelled|active|terminal][&archiveItemId={archive_item_id}][&limit=50]",
			runArchiveMaterializationTemplate: "/v1/archive/materializations/{job_id}",
			historyMaterializationsCreate: "/v1/account-mirrors/materializations",
			historyMaterializationsList:
				"/v1/account-mirrors/materializations[?detail=summary|full][&status=queued|running|succeeded|skipped|failed|cancelled|active|terminal][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&sourceType=conversation|project_sources|catalog_item|archive_item|reconciliation|account_library_reconciliation][&limit=50]",
			historyMaterializationTemplate:
				"/v1/account-mirrors/materializations/{job_id}[?detail=summary|full]",
			accountMirrorRecoveryCandidates:
				"/v1/account-mirrors/recovery-candidates[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&tenant={bound_identity_key}][&status=eligible|needs_detail_refresh|deferred|blocked|unsupported|terminal][&action={action}][&includeSearchRows=true|false][&limit=50]",
			runStatusTemplate: "/v1/runs/{run_id}/status[?diagnostics=browser-state]",
			terminalSessionReceiptTemplate: "/v1/terminal-receipts/{session_id}",
			apiLogTail: "/v1/api/logs/tail[?maxBytes=32768]",
			preflightRunTemplate: "/v1/preflight/lazy-live-follow/runs/{run_id}",
			preflightRunLogTemplate: "/v1/preflight/lazy-live-follow/runs/{run_id}/log[?maxBytes=32768]",
			accountMirrorStatus:
				"/v1/account-mirrors/status[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&explicitRefresh=true]",
			accountMirrorCatalog:
				"/v1/account-mirrors/catalog[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&kind=projects|conversations|artifacts|files|media|all][&limit=50]",
			accountMirrorCatalogItemTemplate:
				"/v1/account-mirrors/catalog/items/{item_id}?provider={chatgpt|gemini|grok}&runtimeProfile={runtime_profile}&kind={kind}",
			accountMirrorPreviewSessions: "/v1/account-mirrors/preview-sessions",
			accountMirrorPreviewSessionTemplate:
				"/v1/account-mirrors/preview-sessions/{preview_session_id}",
			accountMirrorRefresh: "/v1/account-mirrors/refresh",
			accountMirrorReconciliationsCreate: "/v1/account-mirrors/reconciliations",
			accountMirrorReconciliationsList:
				"/v1/account-mirrors/reconciliations[?status=active|planned|queued|running|idle_waiting|paused|blocked|completed|completed_with_skips|cancelled|failed][&limit=50]",
			accountMirrorReconciliationsGetTemplate: "/v1/account-mirrors/reconciliations/{campaign_id}",
			accountMirrorReconciliationsControlTemplate:
				'POST /v1/account-mirrors/reconciliations/{campaign_id} {"action":"pause|resume|cancel|run_next_pass"}',
			accountMirrorCompletionsCreate: "/v1/account-mirrors/completions",
			accountMirrorCompletionsList:
				"/v1/account-mirrors/completions[?detail=summary|full][&status=active|queued|running|idle_waiting|paused|completed|blocked|failed|cancelled][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&limit=50]",
			accountMirrorCompletionsGetTemplate:
				"/v1/account-mirrors/completions/{completion_id}[?detail=summary|full]",
			accountMirrorCompletionsControlTemplate:
				'POST /v1/account-mirrors/completions/{completion_id} {"action":"pause|resume|cancel|run_one_pass"}',
			accountMirrorSchedulerHistory: "/v1/account-mirrors/scheduler/history[?limit=10]",
			accountMirrorSchedulerDiagnostics:
				"/v1/account-mirrors/scheduler/diagnostics[?provider={chatgpt|gemini|grok}&runtimeProfile={runtime_profile}|completionId={completion_id}]",
			browserProcesses: "/v1/browser/processes",
			browserDomDriftObservations:
				"/v1/browser/dom-drift-observations[?service={chatgpt|gemini|grok}&surface={surface}&status=observed|accepted|rejected&limit=50]",
			browserDomDriftObservationAcceptTemplate:
				"POST /v1/browser/dom-drift-observations/{observation_id}/accept",
			agentConfigChoices: "/v1/config/agent-choices",
			agentRegistryDiagnostics: "/v1/config/agent-diagnostics",
			configApiKeys: "/v1/config/api-keys",
			configApiKeyIssue: "POST /v1/config/api-keys/issue",
			configApiKeyDeleteTemplate: "DELETE /v1/config/api-keys/{key_id}",
			configSnapshotExport: "POST /v1/config/snapshots/export",
			configSnapshotImport: "POST /v1/config/snapshots/import",
			workbenchCapabilitiesList:
				"/v1/workbench-capabilities?provider={chatgpt|gemini|grok}&category={category}[&entrypoint=grok-imagine][&diagnostics=browser-state][&discoveryAction=grok-imagine-video-mode]",
			handoffStatusTemplate: "/v1/handoffs/{handoff_id}/status[?outputDir={path}]",
			handoffResumeTemplate: 'POST /v1/handoffs/{handoff_id}/resume {"outputDir":"optional"}',
			handoffRepairTemplate: 'POST /v1/handoffs/{handoff_id}/repair {"outputDir":"optional"}',
			handoffExportTemplate: 'POST /v1/handoffs/{handoff_id}/export {"outputDir":"optional"}',
			handoffRecoverLiveTemplate:
				'POST /v1/handoffs/{handoff_id}/recover-live {"outputDir":"optional"}',
			operatorBrowserDashboard: serviceDiscovery.routing.dashboardPath,
			operatorDebugDashboard: serviceDiscovery.routing.debugDashboardPath,
			accountMirrorDashboard: serviceDiscovery.routing.accountMirrorPath,
			accountMirrorPreviewSessionDashboard: serviceDiscovery.routing.previewSessionPath,
			operatorConfigDashboard: serviceDiscovery.routing.configPath,
			operatorAgentsDashboard: serviceDiscovery.routing.agentsPath,
			operatorConsole: serviceDiscovery.routing.consolePath,
			...(input.dashboardUrl ? { operatorBrowserDashboardUrl: input.dashboardUrl } : {}),
			...(input.publicDashboardUrl
				? { publicOperatorBrowserDashboardUrl: input.publicDashboardUrl }
				: {}),
			localServiceBaseUrl: serviceDiscovery.local.baseUrl,
			...(serviceDiscovery.external
				? { externalServiceBaseUrl: serviceDiscovery.external.baseUrl }
				: {}),
		},
		compatibility: {
			openai: true,
			chatCompletions: true,
			streaming: false,
			auth: input.auth.required,
		},
		preflight: input.preflight ?? {
			lazyLiveFollow: null,
			lazyLiveFollowRun: null,
			lazyLiveFollowRunHistory: [],
		},
		recoverySummary: input.recoverySummary,
		localClaimSummary: input.localClaimSummary,
		runnerTopology: input.runnerTopology,
		runner: input.runner,
		backgroundDrain: input.backgroundDrain,
		tenantExecutionLimits: input.tenantExecutionLimits,
		accountMirrorScheduler: compactAccountMirrorScheduler,
		accountMirrorStatus: input.accountMirrorStatus,
		accountMirrorCompletions: input.accountMirrorCompletions,
		accountMirrorProofScope: input.accountMirrorProofScope,
		tabConcurrency: input.tabConcurrency,
		controlReadiness: createRunControlReadiness({
			backgroundDrain: input.backgroundDrain,
			accountMirrorCompletions: input.accountMirrorCompletions,
			localClaimSummary: input.localClaimSummary,
		}),
		liveFollow: createLiveFollowHealthSummary(
			accountMirrorScheduler,
			input.accountMirrorCompletions,
			input.accountMirrorStatus,
			input.accountMirrorAccountLibraryPreviews ?? null,
			input.accountMirrorAccountLibraryActiveJobs ?? null,
			input.accountMirrorBrowserProcessStatus ?? null,
			input.now,
		),
		executionHints: {
			headerNames: [
				"X-AuraCall-Runtime-Profile",
				"X-AuraCall-Agent",
				"X-AuraCall-Team",
				"X-AuraCall-Service",
			],
			bodyObject: "auracall",
		},
		controlResult: input.controlResult,
	};
}

function createRunControlReadiness(input: {
	backgroundDrain: HttpStatusResponse["backgroundDrain"];
	accountMirrorCompletions: AccountMirrorCompletionStatusSummary;
	localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
}): HttpRunControlReadinessResponse {
	const accountMirrorCompletionActionsById: Record<string, HttpRunControlReadinessAction[]> = {};
	for (const operation of input.accountMirrorCompletions.recent) {
		accountMirrorCompletionActionsById[operation.id] =
			createAccountMirrorCompletionControlActions(operation);
	}
	for (const operation of input.accountMirrorCompletions.active) {
		if (!accountMirrorCompletionActionsById[operation.id]) {
			accountMirrorCompletionActionsById[operation.id] =
				createAccountMirrorCompletionControlActions(operation);
		}
	}

	const runtimeRunActionsById: Record<string, HttpRunControlReadinessAction[]> = {};
	const localClaim = input.localClaimSummary ?? null;
	if (localClaim) {
		for (const runId of Object.keys(localClaim.statusByRunId)) {
			runtimeRunActionsById[runId] = [
				createRuntimeDrainReadinessAction({
					runId,
					status: localClaim.statusByRunId[runId] ?? "unavailable",
					reason: localClaim.reasonsByRunId[runId] ?? null,
				}),
			];
		}
		for (const runId of localClaim.selectedRunIds) {
			if (!runtimeRunActionsById[runId]) {
				runtimeRunActionsById[runId] = [
					createRuntimeDrainReadinessAction({
						runId,
						status: "selected",
						reason: null,
					}),
				];
			}
		}
	}

	return {
		object: "run_control_readiness",
		backgroundDrain: {
			state: input.backgroundDrain.state,
			enabled: input.backgroundDrain.enabled,
			paused: input.backgroundDrain.paused,
			actions: createBackgroundDrainControlActions(input.backgroundDrain),
		},
		accountMirrorCompletionActionsById,
		runtimeRunActionsById,
		generatedFrom: {
			localRunnerId: localClaim?.runnerId ?? null,
			localClaimSourceKind: localClaim?.sourceKind ?? null,
		},
	};
}

function createBackgroundDrainControlActions(
	backgroundDrain: HttpStatusResponse["backgroundDrain"],
): HttpRunControlReadinessAction[] {
	const pauseBlockedReason = !backgroundDrain.enabled
		? "background drain is not enabled for this server"
		: backgroundDrain.paused
			? "background drain is already paused"
			: null;
	const resumeBlockedReason = !backgroundDrain.enabled
		? "background drain is not enabled for this server"
		: !backgroundDrain.paused && backgroundDrain.state === "running"
			? "background drain is already running"
			: !backgroundDrain.paused
				? "background drain is not paused"
				: null;
	return [
		createRunControlReadinessAction({
			action: "background-drain.pause",
			label: "Pause drain",
			available: pauseBlockedReason === null,
			blockedReason: pauseBlockedReason,
			payload: { backgroundDrain: { action: "pause" } },
			expectedTransition:
				"background drain state becomes paused after any in-flight drain finishes",
			expectedEvidence: "controlResult.kind=background-drain and backgroundDrain.paused=true",
			startsProviderBrowserWork: false,
			stopsProviderBrowserWork: false,
			writesPersistentState: false,
			targetId: "background drain",
			currentState: backgroundDrain.state,
			browserEffect:
				"browser work already in progress may continue; future background drain scheduling stops",
		}),
		createRunControlReadinessAction({
			action: "background-drain.resume",
			label: "Resume drain",
			available: resumeBlockedReason === null,
			blockedReason: resumeBlockedReason,
			payload: { backgroundDrain: { action: "resume" } },
			expectedTransition: "background drain leaves paused state and schedules the next local drain",
			expectedEvidence: "controlResult.kind=background-drain and backgroundDrain.paused=false",
			startsProviderBrowserWork: true,
			stopsProviderBrowserWork: false,
			writesPersistentState: false,
			targetId: "background drain",
			currentState: backgroundDrain.state,
			browserEffect: "eligible queued work may start provider browser work after resume",
		}),
	];
}

function createAccountMirrorCompletionControlActions(
	operation: AccountMirrorCompletionOperation,
): HttpRunControlReadinessAction[] {
	return [
		createCompletionReadinessAction(operation, "pause"),
		createCompletionReadinessAction(operation, "resume"),
		createCompletionReadinessAction(operation, "run_one_pass"),
		createCompletionReadinessAction(operation, "cancel"),
	];
}

function createCompletionReadinessAction(
	operation: AccountMirrorCompletionOperation,
	action: "pause" | "resume" | "cancel" | "run_one_pass",
): HttpRunControlReadinessAction {
	const blockedReason = accountMirrorCompletionControlBlockedReason(operation, action);
	const label =
		action === "pause"
			? "Pause"
			: action === "resume"
				? "Resume"
				: action === "run_one_pass"
					? "Run One Pass"
					: "Cancel";
	return createRunControlReadinessAction({
		action: `completion.${action}` as HttpRunControlActionId,
		label,
		available: blockedReason === null,
		blockedReason,
		payload: { accountMirrorCompletion: { id: operation.id, action } },
		expectedTransition:
			action === "pause"
				? "live-follow operation becomes paused"
				: action === "resume"
					? "live-follow operation returns to running"
					: action === "run_one_pass"
						? "live-follow operation runs one bounded pass and returns to cadence waiting"
						: "live-follow operation becomes cancelled",
		expectedEvidence:
			"controlResult.kind=account-mirror-completion and refreshed accountMirrorCompletions readback includes the updated status",
		startsProviderBrowserWork: action === "resume" || action === "run_one_pass",
		stopsProviderBrowserWork: action === "pause" || action === "cancel",
		writesPersistentState: true,
		targetId: operation.id,
		currentState: operation.status,
		browserEffect:
			action === "resume"
				? "provider browser work may start again on the next live-follow pass"
				: action === "run_one_pass"
					? "provider browser work may start for one live-follow pass if safety gates allow it"
					: action === "pause"
						? "provider browser work should stop after the current live-follow checkpoint"
						: "provider browser work should stop for this live-follow operation",
	});
}

function accountMirrorCompletionControlBlockedReason(
	operation: AccountMirrorCompletionOperation,
	action: "pause" | "resume" | "cancel" | "run_one_pass",
): string | null {
	const status = operation.status;
	if (action === "resume") {
		return status === "paused" ? null : `live-follow status ${status} cannot be resumed`;
	}
	if (action === "pause") {
		return status === "queued" || status === "running" || status === "idle_waiting"
			? null
			: `live-follow status ${status} cannot be paused`;
	}
	if (action === "run_one_pass") {
		return status === "queued" ||
			status === "running" ||
			status === "idle_waiting" ||
			status === "paused" ||
			(status === "blocked" && operation.mode === "live_follow")
			? null
			: `live-follow status ${status} cannot run one pass`;
	}
	if (
		status === "queued" ||
		status === "running" ||
		status === "idle_waiting" ||
		status === "paused"
	) {
		return null;
	}
	return `live-follow status ${status} cannot be cancelled`;
}

function createRuntimeDrainReadinessAction(input: {
	runId: string;
	status: string;
	reason: string | null;
}): HttpRunControlReadinessAction {
	const available = input.status === "selected" || input.status === "eligible";
	const blockedReason = available
		? null
		: (input.reason ??
			`run is ${input.status}; targeted drain requires server-local runner ownership`);
	return createRunControlReadinessAction({
		action: "runtime.drain",
		label: "Drain now",
		available,
		blockedReason,
		payload: { runControl: { action: "drain-run", runId: input.runId } },
		expectedTransition:
			"local service host executes exactly this eligible run or returns a blocked readback error",
		expectedEvidence:
			"controlResult.action=drain-run and status=executed with refreshed runtime run readback",
		startsProviderBrowserWork: true,
		stopsProviderBrowserWork: false,
		writesPersistentState: true,
		targetId: input.runId,
		currentState: input.status,
		browserEffect: "eligible run execution may start provider browser work under the local runner",
	});
}

function createRunControlReadinessAction(input: {
	action: HttpRunControlActionId;
	label: string;
	available: boolean;
	blockedReason: string | null;
	payload: Record<string, unknown>;
	expectedTransition: string;
	expectedEvidence: string;
	startsProviderBrowserWork: boolean;
	stopsProviderBrowserWork: boolean;
	writesPersistentState: boolean;
	targetId: string;
	currentState: string;
	browserEffect: string;
}): HttpRunControlReadinessAction {
	return {
		action: input.action,
		label: input.label,
		available: input.available,
		blockedReason: input.blockedReason,
		method: "POST",
		route: "/status",
		payload: input.payload,
		expectedTransition: input.expectedTransition,
		expectedEvidence: input.expectedEvidence,
		startsProviderBrowserWork: input.startsProviderBrowserWork,
		stopsProviderBrowserWork: input.stopsProviderBrowserWork,
		writesPersistentState: input.writesPersistentState,
		confirmation: [
			`Target: ${input.targetId}.`,
			`Current state: ${input.currentState}.`,
			`Expected transition: ${input.expectedTransition}.`,
			input.browserEffect,
		].join(" "),
	};
}

function createApiRuntimeStatus(port: number): HttpStatusResponse["api"] {
	return {
		process: {
			pid: process.pid,
			ppid: process.ppid,
			uptimeSeconds: Math.round(process.uptime()),
			argv: process.argv,
			execPath: process.execPath,
			cwd: process.cwd(),
			nodeVersion: process.version,
		},
		managedService: {
			manager: "systemd-user",
			unitName: "auracall-api.service",
			logPath: path.join(getAuracallHomeDir(), "logs", `api-${port}.log`),
			installCommand: "pnpm run install:user-runtime-service",
			restartCommand: "systemctl --user restart auracall-api.service",
			statusCommand: "systemctl --user status auracall-api.service",
		},
	};
}

function parseApiLogTailQuery(params: URLSearchParams): { maxBytes: number } {
	const raw = params.get("maxBytes");
	const parsed = raw ? Number.parseInt(raw, 10) : 32_768;
	const maxBytes = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 262_144) : 32_768;
	return { maxBytes };
}

async function readApiLogTail(input: {
	port: number;
	maxBytes: number;
}): Promise<HttpApiLogTailResponse> {
	const logPath = path.join(getAuracallHomeDir(), "logs", `api-${input.port}.log`);
	const tail = await readBoundedLogTail(logPath, input.maxBytes);
	return {
		object: "api_log_tail",
		logPath,
		...tail,
	};
}

async function readBrowserProcessStatus(input: {
	status: AccountMirrorStatusSummary;
	now: () => Date;
}): Promise<HttpBrowserProcessStatusResponse> {
	const entries = await Promise.all(
		Array.from(uniqueBrowserProcessTargets(input.status.entries)).map((target) =>
			readBrowserProcessStatusEntry(target),
		),
	);
	return {
		object: "browser_process_status",
		generatedAt: input.now().toISOString(),
		metrics: {
			configuredTargets: entries.length,
			processesAlive: entries.filter((entry) => entry.processAlive).length,
			responsiveDevTools: entries.filter((entry) => entry.devToolsResponsive).length,
			launchBlankArg: entries.filter((entry) => entry.launchCommandHasBlankArg).length,
			openBlankPages: entries.reduce((total, entry) => total + entry.openBlankPageCount, 0),
		},
		entries,
	};
}

function* uniqueBrowserProcessTargets(entries: AccountMirrorStatusEntry[]): Iterable<{
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
}> {
	const seen = new Set<string>();
	for (const entry of entries) {
		const provider = normalizeBrowserProcessProvider(entry.provider);
		const runtimeProfileId =
			typeof entry.runtimeProfileId === "string" && entry.runtimeProfileId.trim()
				? entry.runtimeProfileId.trim()
				: "default";
		if (!provider) continue;
		const key = `${provider}:${runtimeProfileId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		yield { provider, runtimeProfileId };
	}
}

function normalizeBrowserProcessProvider(value: unknown): AccountMirrorProvider | null {
	return value === "chatgpt" || value === "gemini" || value === "grok" ? value : null;
}

async function readBrowserProcessStatusEntry(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
}): Promise<HttpBrowserProcessStatusEntry> {
	const managedProfileDir = path.join(
		getAuracallHomeDir(),
		"browser-profiles",
		input.runtimeProfileId,
		input.provider,
	);
	const host = "127.0.0.1";
	try {
		const registryInstance = await getBrowserRegistryInstance(managedProfileDir, "Default");
		const processMatch = await findChromeProcessUsingUserDataDir(managedProfileDir);
		const port = processMatch?.port ?? (await readDevToolsPort(managedProfileDir));
		const devToolsResponsive = port
			? await isDevToolsResponsive({ host, port, attempts: 1, timeoutMs: 750 })
			: false;
		const targets =
			devToolsResponsive && port ? await readDevToolsTargetSummaries({ host, port }) : [];
		return {
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			managedProfileDir,
			owner: registryInstance?.owner ?? null,
			operation: registryInstance?.operation ?? null,
			lease: registryInstance?.lease ?? null,
			pid: processMatch?.pid ?? null,
			port: port ?? null,
			host,
			processAlive: Boolean(processMatch),
			devToolsResponsive,
			launchCommandHasBlankArg: commandLineHasAboutBlankLaunchArg(processMatch?.commandLine ?? ""),
			openBlankPageCount: targets.filter((target) => target.isBlankPage).length,
			pageTargetCount: targets.filter((target) => target.type === "page").length,
			targets,
			error: null,
		};
	} catch (error) {
		return {
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			managedProfileDir,
			owner: null,
			operation: null,
			lease: null,
			pid: null,
			port: null,
			host,
			processAlive: false,
			devToolsResponsive: false,
			launchCommandHasBlankArg: false,
			openBlankPageCount: 0,
			pageTargetCount: 0,
			targets: [],
			error: error instanceof Error ? error.message : "Unknown browser process probe error.",
		};
	}
}

async function readDevToolsTargetSummaries(input: {
	host: string;
	port: number;
}): Promise<HttpBrowserProcessTargetSummary[]> {
	const targets = await withPromiseTimeout(
		CDP.List({ host: input.host, port: input.port }),
		1000,
	).catch(() => []);
	return targets.map((target) => {
		const url = typeof target.url === "string" ? target.url : null;
		return {
			targetId: typeof target.id === "string" ? target.id : null,
			type: typeof target.type === "string" ? target.type : null,
			url,
			title: typeof target.title === "string" ? target.title : null,
			isBlankPage: target.type === "page" && isBlankPageUrl(url),
		};
	});
}

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`Operation timed out after ${timeoutMs}ms.`));
		}, timeoutMs);
		promise
			.then(resolve)
			.catch(reject)
			.finally(() => clearTimeout(timeout));
	});
}

function commandLineHasAboutBlankLaunchArg(commandLine: string): boolean {
	return /(^|\s)about:blank(\s|$)/.test(commandLine);
}

function isBlankPageUrl(url: string | null): boolean {
	return url === "about:blank" || url === "chrome://newtab/" || url === "chrome://new-tab-page/";
}

async function readLazyLiveFollowPreflightRunLogTail(input: {
	id: string;
	maxBytes: number;
	runner?: Pick<LazyLiveFollowPreflightRunner, "readRun">;
}): Promise<HttpPreflightRunLogTailResponse | null> {
	const run = await readLazyLiveFollowPreflightRun(input.id, input.runner);
	if (!run || !isSafePreflightLogPath(run)) return null;
	const tail = await readBoundedLogTail(run.logPath, input.maxBytes);
	return {
		object: "preflight_run_log_tail",
		id: run.id,
		logPath: run.logPath,
		...tail,
	};
}

async function readBoundedLogTail(
	logPath: string,
	maxBytesInput: number,
): Promise<{
	exists: boolean;
	sizeBytes: number;
	maxBytes: number;
	truncated: boolean;
	content: string;
}> {
	try {
		const stat = await fs.stat(logPath);
		const maxBytes = Math.min(maxBytesInput, stat.size);
		const start = Math.max(0, stat.size - maxBytes);
		const handle = await fs.open(logPath, "r");
		try {
			const buffer = Buffer.alloc(maxBytes);
			const result = await handle.read(buffer, 0, maxBytes, start);
			return {
				exists: true,
				sizeBytes: stat.size,
				maxBytes: maxBytesInput,
				truncated: start > 0,
				content: buffer.subarray(0, result.bytesRead).toString("utf8"),
			};
		} finally {
			await handle.close();
		}
	} catch (error) {
		const code =
			error instanceof Error && "code" in error
				? String((error as NodeJS.ErrnoException).code)
				: "";
		if (code !== "ENOENT") {
			throw error;
		}
		return {
			exists: false,
			sizeBytes: 0,
			maxBytes: maxBytesInput,
			truncated: false,
			content: "",
		};
	}
}

function isSafePreflightLogPath(run: LazyLiveFollowPreflightRun): boolean {
	const logsDir = path.resolve(getAuracallHomeDir(), "logs");
	const logPath = path.resolve(run.logPath);
	return (
		logPath.startsWith(`${logsDir}${path.sep}`) &&
		path.basename(logPath).startsWith("preflight-lazy-live-follow-") &&
		path.extname(logPath) === ".log"
	);
}

function createLiveFollowHealthSummary(
	scheduler: HttpStatusResponse["accountMirrorScheduler"],
	completions: AccountMirrorCompletionStatusSummary,
	status: AccountMirrorStatusSummary,
	accountLibraryPreviews: AccountMirrorAccountLibraryPreviewMap | null,
	accountLibraryActiveJobs: AccountMirrorAccountLibraryActiveJobMap | null,
	accountLibraryBrowserProcessStatus: HttpBrowserProcessStatusResponse | null,
	now: () => Date,
): LiveFollowHealthSummary {
	const backpressureReason =
		scheduler.lastPass?.backpressure.reason ?? scheduler.operatorStatus.backpressureReason;
	const latestYield = summarizeAccountMirrorSchedulerHistory(scheduler.history, {
		limit: 10,
	}).latestYield;
	return summarizeLiveFollowHealth({
		schedulerPosture: scheduler.operatorStatus.posture,
		schedulerState: scheduler.state,
		backpressureReason: backpressureReason ?? "unknown",
		activeCompletions: completions.metrics.active,
		pausedCompletions: completions.metrics.paused,
		failedCompletions: completions.metrics.failed,
		cancelledCompletions: completions.metrics.cancelled,
		latestYield: latestYield
			? {
					completedAt: latestYield.completedAt,
					provider: latestYield.provider,
					runtimeProfileId: latestYield.runtimeProfileId,
					queuedOwnerCommand: latestYield.queuedWork.ownerCommand,
					remainingDetailSurfaces: latestYield.remainingDetailSurfaces?.total ?? null,
				}
			: null,
		targets: createLiveFollowTargetRollup(
			scheduler,
			status,
			completions,
			accountLibraryPreviews,
			accountLibraryActiveJobs,
			accountLibraryBrowserProcessStatus,
			now,
		),
	});
}

interface AccountMirrorSchedulerDiagnosticsQuery {
	provider: string | null;
	runtimeProfileId: string | null;
	completionId: string | null;
}

type AccountMirrorSchedulerDiagnosticsResult =
	| { ok: true; bundle: AccountMirrorSchedulerDiagnosticsBundle }
	| {
			ok: false;
			status: 400 | 404;
			type: "invalid_request_error" | "not_found_error";
			message: string;
	  };

interface AccountMirrorSchedulerDiagnosticsBundle {
	object: "account_mirror_scheduler_diagnostics_bundle";
	capturedAt: string;
	scheduler: {
		state: string;
		posture: string;
		reason: string;
		lastWakeReason: string | null;
		lastWakeAt: string | null;
	};
	target: {
		provider: string | null;
		runtimeProfileId: string | null;
		cachePath: string;
	};
	wait: {
		kind: string | null;
		label: string | null;
		nextAttemptAt: string | null;
		routineEligibleAt: string | null;
		activeCompletionId: string | null;
	};
	completion: ReturnType<typeof compactAccountMirrorSchedulerCompletion> | null;
	browserMutations: {
		total: number;
		byKind: Record<string, number>;
		bySource: Record<string, number>;
		duplicateSameRouteAttempts: {
			total: number;
			items: unknown[];
		};
		items: unknown[];
	} | null;
	latestSchedulerEvent: ReturnType<typeof latestAccountMirrorSchedulerDiagnosticsEvent>;
}

function summarizeAccountMirrorDiagnosticsBrowserMutations(items: unknown[]): {
	total: number;
	byKind: Record<string, number>;
	bySource: Record<string, number>;
	duplicateSameRouteAttempts: {
		total: number;
		items: unknown[];
	};
	items: unknown[];
} {
	const records = Array.isArray(items) ? items : [];
	const completed = records.filter((item) => {
		const record = isRecord(item) ? item : {};
		return record.phase === "complete";
	});
	const byKind = countBrowserMutationField(completed, "kind");
	const bySource = countBrowserMutationField(completed, "source");
	const completedSameRouteItems = completed.filter(isDuplicateSameRouteNavigationRecord);
	const completedSameRouteIds = new Set(
		completedSameRouteItems
			.map((item) => (isRecord(item) && typeof item.id === "string" ? item.id : null))
			.filter((id): id is string => Boolean(id)),
	);
	const duplicateSameRouteItems = [
		...completedSameRouteItems,
		...findRepeatedSameRouteMutationAttempts(records).filter((item) => {
			return !(isRecord(item) && typeof item.id === "string" && completedSameRouteIds.has(item.id));
		}),
	];
	return {
		total: records.length,
		byKind,
		bySource,
		duplicateSameRouteAttempts: {
			total: duplicateSameRouteItems.length,
			items: duplicateSameRouteItems,
		},
		items: records,
	};
}

export const summarizeAccountMirrorDiagnosticsBrowserMutationsForTest =
	summarizeAccountMirrorDiagnosticsBrowserMutations;

function findRepeatedSameRouteMutationAttempts(items: unknown[]): unknown[] {
	const starts = items.filter((item) => {
		const record = isRecord(item) ? item : {};
		return record.phase === "start" && (record.kind === "navigate" || record.kind === "reload");
	});
	const duplicates: unknown[] = [];
	let previous: Record<string, unknown> | null = null;
	for (const item of starts) {
		const current = isRecord(item) ? item : {};
		if (previous && isRepeatedSameRouteMutationAttempt(previous, current)) {
			duplicates.push({
				...current,
				duplicateReason: "repeated-same-route-attempt",
				previousMutationId:
					typeof previous.id === "string" && previous.id.trim() ? previous.id.trim() : null,
			});
		}
		previous = current;
	}
	return duplicates;
}

function isRepeatedSameRouteMutationAttempt(
	previous: Record<string, unknown>,
	current: Record<string, unknown>,
): boolean {
	if (previous.kind !== current.kind || previous.source !== current.source) {
		return false;
	}
	const previousUrl = normalizeBrowserMutationComparableUrl(previous.requestedUrl);
	const currentUrl = normalizeBrowserMutationComparableUrl(current.requestedUrl);
	if (!previousUrl || previousUrl !== currentUrl) {
		return false;
	}
	const previousAt = typeof previous.at === "string" ? Date.parse(previous.at) : Number.NaN;
	const currentAt = typeof current.at === "string" ? Date.parse(current.at) : Number.NaN;
	return (
		Number.isFinite(previousAt) &&
		Number.isFinite(currentAt) &&
		currentAt >= previousAt &&
		currentAt - previousAt <= 5 * 60_000
	);
}

function countBrowserMutationField(
	items: unknown[],
	field: "kind" | "source",
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const record = isRecord(item) ? item : {};
		const value =
			typeof record[field] === "string" && record[field].trim().length > 0
				? record[field].trim()
				: "unknown";
		counts[value] = (counts[value] ?? 0) + 1;
	}
	return counts;
}

function isDuplicateSameRouteNavigationRecord(item: unknown): boolean {
	const record = isRecord(item) ? item : {};
	if (record.phase !== "complete" || record.kind !== "navigate") {
		return false;
	}
	const fromUrl = normalizeBrowserMutationComparableUrl(record.fromUrl);
	const requestedUrl = normalizeBrowserMutationComparableUrl(record.requestedUrl);
	const toUrl = normalizeBrowserMutationComparableUrl(record.toUrl);
	return Boolean(fromUrl && requestedUrl && toUrl && fromUrl === requestedUrl && fromUrl === toUrl);
}

function normalizeBrowserMutationComparableUrl(value: unknown): string | null {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		const path = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
	} catch {
		return raw.replace(/\/+$/, "");
	}
}

function parseAccountMirrorSchedulerDiagnosticsQuery(
	params: URLSearchParams,
): AccountMirrorSchedulerDiagnosticsQuery {
	return {
		provider: normalizeOptionalQueryString(params.get("provider")),
		runtimeProfileId: normalizeOptionalQueryString(params.get("runtimeProfile")),
		completionId: normalizeOptionalQueryString(params.get("completionId")),
	};
}

function createAccountMirrorSchedulerDiagnosticsBundle(input: {
	query: AccountMirrorSchedulerDiagnosticsQuery;
	scheduler: HttpStatusResponse["accountMirrorScheduler"];
	status: AccountMirrorStatusSummary;
	completions: AccountMirrorCompletionStatusSummary;
	readCompletion: (id: string) => AccountMirrorCompletionOperation | null;
	readBrowserMutations?: (
		provider: string | null,
		runtimeProfileId: string | null,
	) => {
		total: number;
		byKind: Record<string, number>;
		bySource: Record<string, number>;
		duplicateSameRouteAttempts: {
			total: number;
			items: unknown[];
		};
		items: unknown[];
	} | null;
	now: () => Date;
}): AccountMirrorSchedulerDiagnosticsResult {
	const scheduler = {
		...input.scheduler,
		operatorStatus: createAccountMirrorSchedulerOperatorStatus(input.scheduler),
	};
	const liveFollow = createLiveFollowHealthSummary(
		scheduler,
		input.completions,
		input.status,
		null,
		null,
		null,
		input.now,
	);
	let completion: AccountMirrorCompletionOperation | null = null;
	if (input.query.completionId) {
		completion = input.readCompletion(input.query.completionId);
		if (!completion) {
			return {
				ok: false,
				status: 404,
				type: "not_found_error",
				message: `Account mirror completion ${input.query.completionId} was not found.`,
			};
		}
	}
	const provider = input.query.provider ?? completion?.provider ?? null;
	const runtimeProfileId = input.query.runtimeProfileId ?? completion?.runtimeProfileId ?? null;
	const account = findLiveFollowDiagnosticsTarget(liveFollow, {
		provider,
		runtimeProfileId,
		completionId: input.query.completionId,
	});
	if (!account && !completion && (provider || runtimeProfileId || input.query.completionId)) {
		return {
			ok: false,
			status: 404,
			type: "not_found_error",
			message: `No live-follow scheduler target matched ${provider ?? "*"} / ${runtimeProfileId ?? "*"}${input.query.completionId ? ` / ${input.query.completionId}` : ""}.`,
		};
	}
	const selectedProvider = account?.provider ?? provider ?? null;
	const selectedRuntimeProfileId = account?.runtimeProfileId ?? runtimeProfileId ?? null;
	if (!completion && account?.activeCompletionId) {
		completion = input.readCompletion(account.activeCompletionId);
	}
	const wait = account ? classifyAccountMirrorSchedulerDiagnosticsWait(account) : null;
	return {
		ok: true,
		bundle: {
			object: "account_mirror_scheduler_diagnostics_bundle",
			capturedAt: input.now().toISOString(),
			scheduler: {
				state: scheduler.state,
				posture: scheduler.operatorStatus.posture,
				reason: scheduler.operatorStatus.reason,
				lastWakeReason: scheduler.lastWakeReason,
				lastWakeAt: scheduler.lastWakeAt,
			},
			target: {
				provider: selectedProvider,
				runtimeProfileId: selectedRuntimeProfileId,
				cachePath: buildAccountMirrorDashboardPath({
					provider: selectedProvider,
					runtimeProfileId: selectedRuntimeProfileId,
				}),
			},
			wait: {
				kind: wait?.kind ?? null,
				label: wait?.label ?? null,
				nextAttemptAt: account?.nextAttemptAt ?? null,
				routineEligibleAt: account?.routineEligibleAt ?? null,
				activeCompletionId:
					completion?.id ?? account?.activeCompletionId ?? input.query.completionId ?? null,
			},
			completion: completion ? compactAccountMirrorSchedulerCompletion(completion) : null,
			browserMutations:
				input.readBrowserMutations?.(selectedProvider, selectedRuntimeProfileId) ?? null,
			latestSchedulerEvent: latestAccountMirrorSchedulerDiagnosticsEvent(scheduler),
		},
	};
}

function findLiveFollowDiagnosticsTarget(
	liveFollow: LiveFollowHealthSummary,
	query: { provider: string | null; runtimeProfileId: string | null; completionId: string | null },
): LiveFollowTargetAccountSummary | null {
	const accounts = liveFollow.targets?.accounts ?? [];
	const matched = accounts.find(
		(account) =>
			(!query.provider || account.provider === query.provider) &&
			(!query.runtimeProfileId || account.runtimeProfileId === query.runtimeProfileId) &&
			(!query.completionId || account.activeCompletionId === query.completionId),
	);
	if (matched) {
		return matched;
	}
	if (query.provider || query.runtimeProfileId || query.completionId) {
		return null;
	}
	return accounts.find((account) => account.desiredState === "enabled") ?? null;
}

function classifyAccountMirrorSchedulerDiagnosticsWait(account: LiveFollowTargetAccountSummary): {
	kind: string;
	label: string;
} {
	if (account.latestCompletionError) {
		return { kind: "backoff", label: "backoff" };
	}
	if (account.activeCompletionId) {
		return { kind: "active", label: "active" };
	}
	const nextAttemptTime = Date.parse(account.nextAttemptAt || "");
	if (Number.isFinite(nextAttemptTime) && nextAttemptTime > Date.now()) {
		return { kind: "retry-delay", label: "retry delay" };
	}
	const routineEligibleTime = Date.parse(account.routineEligibleAt || "");
	if (Number.isFinite(routineEligibleTime) && routineEligibleTime > Date.now()) {
		return { kind: "routine-cadence", label: "routine cadence" };
	}
	return { kind: "eligible", label: "eligible" };
}

function compactAccountMirrorSchedulerCompletion(operation: AccountMirrorCompletionOperation): {
	id: string;
	provider: string;
	runtimeProfileId: string;
	status: string;
	phase: string;
	nextAttemptAt: string | null;
	passCount: number;
	latestLifecycleEvent: LiveFollowTargetAccountSummary["latestLifecycleEvent"];
	accountLibraryCursor: AccountMirrorCompletionOperation["accountLibraryCursor"] | null;
	error: AccountMirrorCompletionOperation["error"];
	providerTrafficOutcome: ReturnType<typeof classifyAccountMirrorProviderTrafficOutcome>;
} {
	return {
		id: operation.id,
		provider: operation.provider,
		runtimeProfileId: operation.runtimeProfileId,
		status: operation.status,
		phase: operation.phase,
		nextAttemptAt: operation.nextAttemptAt,
		passCount: operation.passCount,
		latestLifecycleEvent: summarizeCompletionLifecycleEvent(operation),
		accountLibraryCursor: operation.accountLibraryCursor ?? null,
		error: operation.error,
		providerTrafficOutcome: classifyAccountMirrorProviderTrafficOutcome(operation),
	};
}

function latestAccountMirrorSchedulerDiagnosticsEvent(
	scheduler: HttpStatusResponse["accountMirrorScheduler"],
): {
	at: string | null;
	event: string | null;
	detail: string | null;
	schedulerDetail: unknown;
} | null {
	const latest =
		summarizeAccountMirrorSchedulerHistory(scheduler.history, { limit: 1 }).entries[0] ?? null;
	if (!latest) return null;
	return {
		at: latest.completedAt,
		event: latest.action,
		detail: `${latest.provider ?? "unknown"}/${latest.runtimeProfileId ?? "unknown"} backpressure=${latest.backpressureReason}`,
		schedulerDetail: latest,
	};
}

function buildAccountMirrorDashboardPath(input: {
	provider: string | null;
	runtimeProfileId: string | null;
}): string {
	const params = new URLSearchParams();
	if (input.provider) params.set("provider", input.provider);
	if (input.runtimeProfileId) params.set("runtimeProfile", input.runtimeProfileId);
	params.set("kind", "all");
	return `/account-mirror?${params.toString()}`;
}

function normalizeOptionalQueryString(value: string | null): string | null {
	const trimmed = String(value ?? "").trim();
	return trimmed.length > 0 ? trimmed : null;
}

type AccountMirrorAccountLibraryPreviewMap = Map<
	string,
	HistoryAccountLibraryReconciliationPreviewResult
>;
type AccountMirrorAccountLibraryActiveJobMap = Map<
	string,
	{
		primary: HistoryMaterializationJob | null;
		jobs: HistoryMaterializationJob[];
		count: number;
	}
>;
type AccountMirrorAccountLibraryActiveJobs = NonNullable<
	AccountMirrorAccountLibraryActiveJobMap extends Map<string, infer Value> ? Value : never
>;
type LiveFollowAccountLibraryCatchupSummary = NonNullable<
	LiveFollowTargetAccountSummary["accountLibraryCatchup"]
>;
type LiveFollowAccountLibraryBrowserHealth =
	LiveFollowAccountLibraryCatchupSummary["browserHealth"];

async function previewAccountLibraryCatchupTargets(input: {
	status: AccountMirrorStatusSummary;
	service: HistoryMaterializationService | null | undefined;
}): Promise<AccountMirrorAccountLibraryPreviewMap> {
	const previews: AccountMirrorAccountLibraryPreviewMap = new Map();
	void input;
	return previews;
}

function accountMirrorPreviewKey(provider: string, runtimeProfileId: string): string {
	return `${provider}:${runtimeProfileId}`;
}

async function readActiveAccountLibraryMaterializationJobs(input: {
	service: HistoryMaterializationService | null | undefined;
}): Promise<AccountMirrorAccountLibraryActiveJobMap> {
	const activeJobs: AccountMirrorAccountLibraryActiveJobMap = new Map();
	if (!input.service) return activeJobs;
	const result = await input.service
		.listJobs({
			status: "active",
			sourceType: "account_library_reconciliation",
			limit: 500,
		})
		.catch(() => null);
	if (!result) return activeJobs;
	for (const job of result.jobs) {
		const provider = job.request.provider;
		const runtimeProfileId = job.request.runtimeProfile;
		if (!provider || !runtimeProfileId) continue;
		const key = accountMirrorPreviewKey(provider, runtimeProfileId);
		const existing = activeJobs.get(key);
		if (existing) {
			existing.jobs.push(job);
			existing.count = existing.jobs.length;
			if (!existing.primary || job.status === "running") {
				existing.primary = job;
			}
			continue;
		}
		activeJobs.set(key, {
			primary: job,
			jobs: [job],
			count: 1,
		});
	}
	return activeJobs;
}

async function hydrateAccountMirrorStatusMaterializationEvidence(
	status: AccountMirrorStatusSummary,
	service: HistoryMaterializationService | null | undefined,
	runArchiveService: RunArchiveService | null | undefined,
): Promise<AccountMirrorStatusSummary> {
	const localMaterialized = new Map<
		string,
		Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">
	>();
	const archiveRequests = status.entries.map((entry) => ({
		provider: entry.provider,
		runtimeProfile: entry.runtimeProfileId,
		assetAvailability: "available" as const,
		limit: 500,
	}));
	const jobRequests = status.entries.map((entry) => ({
		status: "terminal" as const,
		provider: entry.provider,
		runtimeProfile: entry.runtimeProfileId,
		limit: 500,
	}));
	const [archiveResults, jobResults] = await Promise.all([
		(async () => {
			if (!runArchiveService) return archiveRequests.map(() => null);
			if (runArchiveService.listItemsBatchAvailability) {
				return runArchiveService
					.listItemsBatchAvailability(archiveRequests)
					.catch(() => archiveRequests.map(() => null));
			}
			if (runArchiveService.listItemsBatch) {
				return runArchiveService
					.listItemsBatch(archiveRequests)
					.catch(() => archiveRequests.map(() => null));
			}
			const results = [];
			for (const request of archiveRequests) {
				results.push(await runArchiveService.listItems(request).catch(() => null));
			}
			return results;
		})(),
		(async () => {
			if (!service) return jobRequests.map(() => null);
			if (service.listJobsBatch) {
				return service.listJobsBatch(jobRequests).catch(() => jobRequests.map(() => null));
			}
			const results = [];
			for (const request of jobRequests) {
				results.push(await service.listJobs(request).catch(() => null));
			}
			return results;
		})(),
	]);
	for (const [index] of status.entries.entries()) {
		const archiveItems = archiveResults[index] ?? null;
		const jobs = jobResults[index] ?? null;
		mergeAccountMirrorLocalCountMap(
			localMaterialized,
			summarizeRunArchiveLocalCounts(archiveItems?.items ?? []),
		);
		mergeAccountMirrorLocalCountMap(
			localMaterialized,
			summarizeTerminalHistoryMaterializationLocalCounts(jobs?.jobs ?? []),
		);
	}
	if (localMaterialized.size === 0) return status;
	let changed = false;
	const entries = status.entries.map((entry) => {
		const counts = localMaterialized.get(accountMirrorStatusMaterializationKey(entry));
		if (!counts) return entry;
		const hydrated = hydrateAccountMirrorStatusEntryAssetInventory(entry, counts);
		if (hydrated !== entry) changed = true;
		return hydrated;
	});
	return changed ? { ...status, entries } : status;
}

function summarizeRunArchiveLocalCounts(
	items: RunArchiveListResult["items"],
): Map<string, Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">> {
	const counts = new Map<
		string,
		Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">
	>();
	for (const item of items) {
		const provider = item.provider ?? null;
		const runtimeProfileId = item.runtimeProfile ?? null;
		if (!provider || !runtimeProfileId) continue;
		const key = accountMirrorStatusMaterializationKey({
			provider,
			runtimeProfileId,
			expectedIdentityKey: item.boundIdentityKey ?? null,
		});
		const next = counts.get(key) ?? { artifacts: 0, files: 0, media: 0 };
		if (item.kind === "upload") next.files += 1;
		else if (item.kind === "media_generation") next.media += 1;
		else if (item.kind === "generated_artifact") next.artifacts += 1;
		counts.set(key, next);
	}
	for (const [key, value] of counts) {
		if (value.artifacts + value.files + value.media <= 0) counts.delete(key);
	}
	return counts;
}

function mergeAccountMirrorLocalCountMap(
	target: Map<
		string,
		Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">
	>,
	source: Map<
		string,
		Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">
	>,
): void {
	for (const [key, value] of source) {
		const existing = target.get(key) ?? { artifacts: 0, files: 0, media: 0 };
		target.set(key, {
			artifacts: Math.max(existing.artifacts, value.artifacts),
			files: Math.max(existing.files, value.files),
			media: Math.max(existing.media, value.media),
		});
	}
}

function summarizeTerminalHistoryMaterializationLocalCounts(
	jobs: HistoryMaterializationJob[],
): Map<string, Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">> {
	const counts = new Map<
		string,
		Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">
	>();
	for (const job of jobs) {
		if (!job.result) continue;
		const provider =
			job.request.provider ??
			job.result.target?.provider ??
			(job.source.type === "reconciliation" ? job.source.provider : null);
		const runtimeProfileId =
			job.request.runtimeProfile ?? job.result.target?.runtimeProfile ?? null;
		const tenantKey = job.request.boundIdentityKey ?? job.result.target?.boundIdentityKey ?? null;
		if (!provider || !runtimeProfileId) continue;
		const key = accountMirrorStatusMaterializationKey({
			provider,
			runtimeProfileId,
			expectedIdentityKey: tenantKey,
		});
		const next = counts.get(key) ?? { artifacts: 0, files: 0, media: 0 };
		for (const entry of job.result.entries) {
			if (entry.status !== "materialized" && entry.status !== "duplicate") continue;
			if (entry.kind === "file") next.files += 1;
			else if (entry.kind === "media") next.media += 1;
			else next.artifacts += 1;
		}
		counts.set(key, next);
	}
	for (const [key, value] of counts) {
		if (value.artifacts + value.files + value.media <= 0) counts.delete(key);
	}
	return counts;
}

function accountMirrorStatusMaterializationKey(input: {
	provider: string | null;
	runtimeProfileId: string | null;
	expectedIdentityKey?: string | null;
}): string {
	return `${input.provider ?? ""}:${input.runtimeProfileId ?? ""}:${input.expectedIdentityKey ?? ""}`;
}

function hydrateAccountMirrorStatusEntryAssetInventory(
	entry: AccountMirrorStatusEntry,
	localCounts: Pick<AccountMirrorStatusEntry["metadataCounts"], "artifacts" | "files" | "media">,
): AccountMirrorStatusEntry {
	const current =
		entry.mirrorCompleteness.assetInventory ?? entry.metadataEvidence?.assetInventory ?? null;
	if (!current) return entry;
	const nextLocal = {
		artifacts: Math.max(current.localMaterialized.artifacts, localCounts.artifacts),
		files: Math.max(current.localMaterialized.files, localCounts.files),
		media: Math.max(current.localMaterialized.media, localCounts.media),
	};
	if (
		nextLocal.artifacts === current.localMaterialized.artifacts &&
		nextLocal.files === current.localMaterialized.files &&
		nextLocal.media === current.localMaterialized.media
	) {
		return entry;
	}
	const delta = {
		artifacts: nextLocal.artifacts - current.localMaterialized.artifacts,
		files: nextLocal.files - current.localMaterialized.files,
		media: nextLocal.media - current.localMaterialized.media,
	};
	const hydrateInventory = (inventory: typeof current): typeof current => ({
		...inventory,
		localMaterialized: {
			artifacts: Math.max(inventory.localMaterialized.artifacts, nextLocal.artifacts),
			files: Math.max(inventory.localMaterialized.files, nextLocal.files),
			media: Math.max(inventory.localMaterialized.media, nextLocal.media),
		},
		remoteKnownMissingLocal: {
			artifacts: Math.max(0, inventory.remoteKnownMissingLocal.artifacts - delta.artifacts),
			files: Math.max(0, inventory.remoteKnownMissingLocal.files - delta.files),
			media: Math.max(0, inventory.remoteKnownMissingLocal.media - delta.media),
		},
	});
	return {
		...entry,
		metadataEvidence: entry.metadataEvidence
			? {
					...entry.metadataEvidence,
					assetInventory: entry.metadataEvidence.assetInventory
						? hydrateInventory(entry.metadataEvidence.assetInventory)
						: entry.metadataEvidence.assetInventory,
				}
			: entry.metadataEvidence,
		mirrorCompleteness: {
			...entry.mirrorCompleteness,
			assetInventory: entry.mirrorCompleteness.assetInventory
				? hydrateInventory(entry.mirrorCompleteness.assetInventory)
				: entry.mirrorCompleteness.assetInventory,
		},
	};
}

async function readAccountLibraryBrowserProcessStatus(input: {
	status: AccountMirrorStatusSummary;
	now: () => Date;
}): Promise<HttpBrowserProcessStatusResponse | null> {
	const hasConfiguredAccountLibraryTarget = input.status.entries.some(
		(entry) => entry.liveFollow.accountLibrary.mode !== "disabled",
	);
	if (!hasConfiguredAccountLibraryTarget) return null;
	return readBrowserProcessStatus(input);
}

function createLiveFollowTargetRollup(
	scheduler: HttpStatusResponse["accountMirrorScheduler"],
	status: AccountMirrorStatusSummary,
	completions: AccountMirrorCompletionStatusSummary,
	accountLibraryPreviews: AccountMirrorAccountLibraryPreviewMap | null,
	accountLibraryActiveJobs: AccountMirrorAccountLibraryActiveJobMap | null,
	accountLibraryBrowserProcessStatus: HttpBrowserProcessStatusResponse | null,
	now: () => Date,
): LiveFollowTargetRollup {
	const activeOperations = completions.active;
	const recentOperations = completions.recent;
	const accounts = status.entries.map((entry): LiveFollowTargetAccountSummary => {
		const activeOperation =
			activeOperations.find(
				(candidate) =>
					candidate.provider === entry.provider &&
					candidate.runtimeProfileId === entry.runtimeProfileId,
			) ?? null;
		const recentOperation =
			activeOperation ??
			recentOperations.find(
				(candidate) =>
					candidate.provider === entry.provider &&
					candidate.runtimeProfileId === entry.runtimeProfileId,
			) ??
			null;
		const operation = activeOperation ?? recentOperation;
		const assetInventory = summarizeLiveFollowAssetInventory(entry);
		const materializationBacklog = summarizeLiveFollowMaterializationBacklog({
			materializationPolicy: entry.liveFollow.materializationPolicy,
			mirrorCompleteness: entry.mirrorCompleteness.state,
			assetInventory:
				entry.mirrorCompleteness.assetInventory ?? entry.metadataEvidence?.assetInventory ?? null,
		});
		const accountLibraryCatchup = summarizeLiveFollowAccountLibraryCatchup(
			entry,
			accountLibraryPreviews?.get(
				accountMirrorPreviewKey(entry.provider, entry.runtimeProfileId),
			) ?? null,
			accountLibraryActiveJobs?.get(
				accountMirrorPreviewKey(entry.provider, entry.runtimeProfileId),
			) ?? null,
			accountLibraryBrowserProcessStatus,
			now,
		);
		const resumePolicy = classifyLiveFollowTarget(entry, activeOperation);
		const routineDecision = summarizeLiveFollowRoutineDecision({
			entry,
			operation,
			materializationBacklog,
			accountLibraryCatchup,
			scheduler,
		});
		return {
			provider: entry.provider,
			tenantKey: entry.tenantKey,
			bindingKey: entry.bindingKey,
			runtimeProfileId: entry.runtimeProfileId,
			browserProfileId: entry.browserProfileId,
			desiredState: entry.liveFollow.state,
			desiredEnabled: entry.liveFollow.enabled,
			actualStatus:
				activeOperation?.status ?? (entry.mirrorState.running ? "refreshing" : entry.status),
			statusReason: entry.reason,
			identityEvidence: entry.identityEvidence,
			attentionNeeded: isLiveFollowTargetAttentionNeeded(entry, activeOperation, recentOperation),
			activeCompletionId: activeOperation?.id ?? null,
			latestCompletionStatus: recentOperation?.status ?? null,
			latestCompletionError: recentOperation?.error?.message ?? null,
			phase: summarizeLiveFollowTargetPhase(entry, activeOperation, recentOperation),
			passCount: activeOperation?.passCount ?? recentOperation?.passCount ?? null,
			routineEligibleAt: entry.eligibleAt,
			lastFailureAt: entry.lastFailureAt,
			consecutiveFailureCount: entry.consecutiveFailureCount,
			activeCompletionNextAttemptAt: activeOperation?.nextAttemptAt ?? null,
			nextAttemptAt: activeOperation?.nextAttemptAt ?? entry.eligibleAt,
			providerGuard: entry.providerGuard.state === "clear" ? null : entry.providerGuard,
			mirrorCompleteness: entry.mirrorCompleteness.state,
			resumePolicy,
			routineDecision,
			targetDecision: summarizeLiveFollowTargetDecision({
				entry,
				resumePolicy,
				routineDecision,
				materializationBacklog,
			}),
			assetInventory,
			materializationBacklog,
			latestLifecycleEvent: summarizeCompletionLifecycleEvent(operation),
			materializationOutcome: summarizeLiveFollowMaterializationOutcome(operation),
			scrapeBudget: entry.metadataEvidence?.scrapeBudget ?? null,
			accountLibraryCatchup,
			metadataCounts: entry.metadataCounts,
			metadataCountEvidence: entry.metadataEvidence?.countEvidence ?? null,
		};
	});
	return accounts.reduce<LiveFollowTargetRollup>(
		(acc, account) => {
			acc.total += 1;
			acc.desired.total += 1;
			if (account.desiredState === "enabled") {
				acc.enabled += 1;
				acc.desired.enabled += 1;
			} else if (account.desiredState === "disabled") {
				acc.disabled += 1;
				acc.desired.disabled += 1;
			} else if (account.desiredState === "unconfigured") {
				acc.unconfigured += 1;
				acc.desired.unconfigured += 1;
			} else if (account.desiredState === "missing_identity") {
				acc.missingIdentity += 1;
				acc.desired.missingIdentity += 1;
			} else if (account.desiredState === "unsupported") {
				acc.unsupported += 1;
				acc.desired.unsupported += 1;
			}

			if (!account.desiredEnabled) {
				acc.accounts.push(account);
				return acc;
			}

			if (account.actualStatus === "queued") {
				acc.queued += 1;
				acc.actual.queued += 1;
			}
			if (account.actualStatus === "running" || account.actualStatus === "refreshing") {
				acc.running += 1;
				acc.actual.running += 1;
			}
			if (account.actualStatus === "paused") {
				acc.paused += 1;
				acc.actual.paused += 1;
			}
			if (
				account.actualStatus === "queued" ||
				account.actualStatus === "running" ||
				account.actualStatus === "idle_waiting" ||
				account.actualStatus === "refreshing" ||
				account.actualStatus === "paused"
			) {
				acc.active += 1;
				acc.actual.active += 1;
			}
			if (account.attentionNeeded) {
				acc.attentionNeeded += 1;
				acc.actual.attentionNeeded += 1;
			}

			if (account.mirrorCompleteness === "complete") {
				acc.complete += 1;
				acc.actual.complete += 1;
			} else if (account.mirrorCompleteness === "in_progress") {
				acc.inProgress += 1;
				acc.actual.inProgress += 1;
			} else if (account.mirrorCompleteness === "none") {
				acc.none += 1;
				acc.actual.none += 1;
			} else {
				acc.unknown += 1;
				acc.actual.unknown += 1;
			}
			acc.accounts.push(account);
			return acc;
		},
		{
			total: 0,
			enabled: 0,
			disabled: 0,
			unconfigured: 0,
			missingIdentity: 0,
			unsupported: 0,
			active: 0,
			queued: 0,
			running: 0,
			paused: 0,
			attentionNeeded: 0,
			complete: 0,
			inProgress: 0,
			none: 0,
			unknown: 0,
			desired: {
				total: 0,
				enabled: 0,
				disabled: 0,
				unconfigured: 0,
				missingIdentity: 0,
				unsupported: 0,
			},
			actual: {
				active: 0,
				queued: 0,
				running: 0,
				paused: 0,
				attentionNeeded: 0,
				complete: 0,
				inProgress: 0,
				none: 0,
				unknown: 0,
			},
			accounts: [],
		},
	);
}

function summarizeLiveFollowTargetPhase(
	entry: AccountMirrorStatusEntry,
	activeOperation: AccountMirrorCompletionOperation | null,
	recentOperation: AccountMirrorCompletionOperation | null,
): string | null {
	const operation = activeOperation ?? recentOperation;
	if (operation?.status === "idle_waiting" && entry.mirrorCompleteness.state === "complete") {
		const decision = summarizeLiveFollowStatusPhaseDecision(entry);
		if (decision.phase === null) return "steady_follow";
	}
	return operation?.phase ?? null;
}

function summarizeLiveFollowAssetInventory(
	entry: AccountMirrorStatusEntry,
): LiveFollowTargetAccountSummary["assetInventory"] {
	const inventory =
		entry.mirrorCompleteness.assetInventory ?? entry.metadataEvidence?.assetInventory ?? null;
	if (!inventory) return null;
	return {
		state: inventory.state,
		summary: inventory.summary,
		detailScannedThisPass: inventory.detailScannedThisPass,
	};
}

function summarizeLiveFollowTargetDecision(input: {
	entry: AccountMirrorStatusEntry;
	resumePolicy: LiveFollowTargetAccountSummary["resumePolicy"];
	routineDecision: LiveFollowTargetAccountSummary["routineDecision"];
	materializationBacklog: LiveFollowTargetAccountSummary["materializationBacklog"];
}): LiveFollowTargetAccountSummary["targetDecision"] {
	const { entry, resumePolicy, routineDecision, materializationBacklog } = input;
	const materialization = materializationBacklog
		? {
				state: materializationBacklog.state,
				policy: materializationBacklog.policy,
				metadataCurrent: materializationBacklog.metadataCurrent,
				localRequired: materializationBacklog.localRequired,
				remoteKnownMissingLocal: materializationBacklog.remoteKnownMissingLocal,
				localMaterialized: materializationBacklog.localMaterialized,
			}
		: null;
	const base = {
		nextPhase: routineDecision.nextPhase,
		materialization,
	};
	if (!entry.liveFollow.enabled) {
		return {
			...base,
			state: "disabled",
			action: "skip",
			reason: `desired live-follow state is ${entry.liveFollow.state}`,
			canAutoResume: false,
			requiresOperator: false,
			blocker: entry.liveFollow.state,
		};
	}
	if (entry.providerGuard.state !== "clear") {
		return {
			...base,
			state: "provider_guard",
			action: "wait_for_guard_clearance",
			reason: entry.providerGuard.summary ?? "provider guard is active",
			canAutoResume: false,
			requiresOperator: false,
			blocker: entry.providerGuard.kind ?? entry.providerGuard.state,
		};
	}
	if (resumePolicy.classification === "operator_paused") {
		return {
			...base,
			state: "operator_paused",
			action: "resume_one_bounded_pass_or_keep_paused",
			reason: resumePolicy.reason,
			canAutoResume: false,
			requiresOperator: true,
			blocker: "operator_paused",
		};
	}
	if (resumePolicy.classification === "provider_blocked") {
		return {
			...base,
			state: "provider_repair_required",
			action: "repair_provider_policy",
			reason: resumePolicy.reason,
			canAutoResume: false,
			requiresOperator: false,
			blocker: "provider_blocked",
		};
	}
	if (resumePolicy.classification === "identity_blocked") {
		return {
			...base,
			state: "identity_repair_required",
			action: "repair_identity_binding",
			reason: resumePolicy.reason,
			canAutoResume: false,
			requiresOperator: false,
			blocker: "identity_blocked",
		};
	}
	if (resumePolicy.classification === "safe_bounded_resume") {
		return {
			...base,
			state: "resume_ready",
			action: "resume_one_bounded_pass",
			reason: resumePolicy.reason,
			canAutoResume: true,
			requiresOperator: false,
			blocker: null,
		};
	}
	if (resumePolicy.classification === "existing_active") {
		return {
			...base,
			state: "active",
			action: "keep_existing",
			reason: resumePolicy.reason,
			canAutoResume: false,
			requiresOperator: false,
			blocker: null,
		};
	}
	if (materializationBacklog?.state === "materialization_required") {
		return {
			...base,
			state: "materialization_required",
			action: "start_materialization",
			reason: materializationBacklog.summary,
			canAutoResume: false,
			requiresOperator: false,
			blocker: "materialization_backlog",
		};
	}
	if (materializationBacklog?.state === "metadata_current_backlog") {
		return {
			...base,
			state: "materialization_policy_required",
			action: "enable_materialization_or_keep_metadata_only",
			reason: materializationBacklog.summary,
			canAutoResume: false,
			requiresOperator: false,
			blocker: "metadata_only_materialization_backlog",
		};
	}
	if (resumePolicy.classification === "safe_steady_follow") {
		return {
			...base,
			state: routineDecision.state === "caught_up" ? "steady_follow" : routineDecision.state,
			action: "keep_cadence",
			reason: routineDecision.why,
			canAutoResume: true,
			requiresOperator: false,
			blocker: null,
		};
	}
	return {
		...base,
		state: routineDecision.state,
		action: resumePolicy.action,
		reason: resumePolicy.reason || routineDecision.why,
		canAutoResume: false,
		requiresOperator: false,
		blocker: resumePolicy.classification,
	};
}

function summarizeLiveFollowRoutineDecision(input: {
	entry: AccountMirrorStatusEntry;
	operation: AccountMirrorCompletionOperation | null;
	materializationBacklog: LiveFollowTargetAccountSummary["materializationBacklog"];
	accountLibraryCatchup: LiveFollowTargetAccountSummary["accountLibraryCatchup"];
	scheduler: HttpStatusResponse["accountMirrorScheduler"];
}): LiveFollowTargetAccountSummary["routineDecision"] {
	const { entry, operation, materializationBacklog, accountLibraryCatchup, scheduler } = input;
	const guard = entry.providerGuard.state === "clear" ? null : entry.providerGuard;
	const rawCycle = operation?.liveFollowCycle ?? null;
	const cycleStaleForStatus = isLiveFollowCycleStaleForStatus(rawCycle, entry);
	const cycle = cycleStaleForStatus ? null : rawCycle;
	const currentPhase = cycle?.phases.find((phase) => phase.phase === cycle.currentPhase) ?? null;
	const statusPhaseDecision = summarizeLiveFollowStatusPhaseDecision(entry);
	const nextEvidencePhase = cycle?.nextPhase ?? statusPhaseDecision.phase;
	const preemption = summarizeLiveFollowPreemption(entry, scheduler);
	const accountObservedAt = latestAccountStatusObservedAt(entry);
	const operationObservedAt =
		cycle?.updatedAt ??
		operation?.lastRefresh?.completedAt ??
		operation?.lifecycleEvents?.at(-1)?.at ??
		operation?.completedAt ??
		null;
	const remainingDetailSurfaces = entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? null;
	const materializationAssets =
		materializationBacklog?.remoteKnownMissingLocal.total ??
		(entry.mirrorCompleteness.assetInventory?.remoteKnownMissingLocal.artifacts ?? 0) +
			(entry.mirrorCompleteness.assetInventory?.remoteKnownMissingLocal.files ?? 0) +
			(entry.mirrorCompleteness.assetInventory?.remoteKnownMissingLocal.media ?? 0);
	const base = {
		eligibleAt: operation?.nextAttemptAt ?? entry.eligibleAt,
		lastProgressAt: latestIsoTimestamp(operationObservedAt, accountObservedAt),
		remainingWork: {
			detailSurfaces: remainingDetailSurfaces,
			materializationAssets,
			accountLibraryStatus: accountLibraryCatchup?.status ?? null,
		},
		guard,
		preemption,
		cycle: cycle
			? {
					id: cycle.cycleId,
					currentPhase: cycle.currentPhase,
					nextPhase: cycle.nextPhase,
					status: currentPhase?.status ?? null,
					updatedAt: cycle.updatedAt,
					passCount: cycle.passCount,
					reason: cycle.decisionReason,
				}
			: null,
	};
	if (!entry.liveFollow.enabled) {
		return {
			...base,
			state:
				entry.liveFollow.state === "unsupported" ||
				entry.liveFollow.state === "missing_identity" ||
				entry.liveFollow.state === "disabled"
					? entry.liveFollow.state
					: "disabled",
			nextPhase: null,
			why: entry.liveFollow.reason,
		};
	}
	if (guard) {
		return {
			...base,
			state: "provider_guarded",
			nextPhase: nextEvidencePhase,
			eligibleAt: guard.cooldownUntil ?? base.eligibleAt,
			why: guard.summary ?? "provider guard requires clearance before live follow can continue",
		};
	}
	if (operation?.status === "paused") {
		return {
			...base,
			state: "paused",
			nextPhase: nextEvidencePhase ?? operation.phase,
			why:
				cycleStaleForStatus && statusPhaseDecision.phase
					? `active live-follow completion is paused; newer account evidence selected ${statusPhaseDecision.phase}`
					: "active live-follow completion is paused",
		};
	}
	if (
		operation?.status === "blocked" ||
		operation?.status === "failed" ||
		operation?.status === "cancelled"
	) {
		return {
			...base,
			state: "attention_needed",
			nextPhase: nextEvidencePhase ?? operation.phase,
			why: operation.error?.message ?? `latest live-follow completion is ${operation.status}`,
		};
	}
	if (operation?.status === "running") {
		return {
			...base,
			state: "running",
			nextPhase: nextEvidencePhase ?? operation.phase,
			why: cycle?.decisionReason ?? statusPhaseDecision.reason,
		};
	}
	if (operation?.status === "idle_waiting") {
		const idleComplete =
			(cycle?.currentPhase === "complete" || statusPhaseDecision.phase === null) &&
			entry.mirrorCompleteness.state === "complete";
		if (idleComplete) {
			return {
				...base,
				state: "steady_follow",
				nextPhase: "steady_follow",
				why:
					cycle?.decisionReason ??
					"live-follow metadata is current and waiting for the next cadence window",
			};
		}
		return {
			...base,
			state: "delayed",
			nextPhase: nextEvidencePhase ?? operation.phase,
			why: cycle?.decisionReason ?? statusPhaseDecision.reason,
		};
	}
	if (operation?.status === "queued") {
		return {
			...base,
			state: "queued",
			nextPhase: nextEvidencePhase ?? operation.phase,
			why: "live-follow completion is queued",
		};
	}
	if (preemption) {
		return {
			...base,
			state: "operator_preempted",
			nextPhase: nextEvidencePhase,
			why: preemption.reason ?? "foreground operator work has priority over live follow",
			eligibleAt: preemption.retryAt ?? base.eligibleAt,
		};
	}
	if (cycle && cycle.currentPhase !== "complete") {
		return {
			...base,
			state: cycle.currentPhase === "materialization" ? "materialization_pending" : "backfilling",
			nextPhase: cycle.nextPhase,
			why: cycle.decisionReason,
		};
	}
	if (statusPhaseDecision.source === "backfill_ledger" && statusPhaseDecision.phase) {
		return {
			...base,
			state:
				statusPhaseDecision.phase === "materialization"
					? "materialization_pending"
					: statusPhaseDecision.phase === "account-library"
						? "account_library_catchup"
						: "backfilling",
			nextPhase: statusPhaseDecision.phase,
			why: statusPhaseDecision.reason,
		};
	}
	if (materializationBacklog?.state === "materialization_required") {
		return {
			...base,
			state: "materialization_pending",
			nextPhase: "materialization",
			why: materializationBacklog.summary,
		};
	}
	if (
		accountLibraryCatchup?.enabled &&
		accountLibraryCatchup.status !== "disabled" &&
		accountLibraryCatchup.status !== "preview_only"
	) {
		return {
			...base,
			state: "account_library_catchup",
			nextPhase: "account-library",
			why:
				accountLibraryCatchup.reason ??
				`account-library catch-up is ${accountLibraryCatchup.status}`,
		};
	}
	if (entry.mirrorCompleteness.state === "complete") {
		return {
			...base,
			state:
				materializationBacklog?.state === "metadata_current_backlog"
					? "materialization_pending"
					: "caught_up",
			nextPhase:
				materializationBacklog?.state === "metadata_current_backlog" ? "materialization" : null,
			why:
				materializationBacklog?.state === "metadata_current_backlog"
					? materializationBacklog.summary
					: "live-follow metadata is current for the configured provider surfaces",
		};
	}
	if (entry.status === "eligible") {
		return {
			...base,
			state: "eligible",
			nextPhase: nextEvidencePhase,
			why:
				statusPhaseDecision.phase && statusPhaseDecision.phase !== "identity"
					? statusPhaseDecision.reason
					: (entry.reason ?? "live-follow target is eligible for the next routine pass"),
		};
	}
	return {
		...base,
		state: "delayed",
		nextPhase: nextEvidencePhase,
		why: entry.reason ?? "live-follow target is waiting for cadence or provider politeness",
	};
}

function isLiveFollowCycleStaleForStatus(
	cycle: AccountMirrorCompletionOperation["liveFollowCycle"] | null | undefined,
	entry: AccountMirrorStatusEntry,
): boolean {
	if (!cycle) return false;
	const cycleAt = Date.parse(cycle.updatedAt);
	const statusObservedAt = latestAccountStatusObservedAt(entry);
	const statusAt = statusObservedAt ? Date.parse(statusObservedAt) : Number.NaN;
	return Number.isFinite(cycleAt) && Number.isFinite(statusAt) && statusAt > cycleAt;
}

function latestAccountStatusObservedAt(entry: AccountMirrorStatusEntry): string | null {
	return latestIsoTimestamp(
		entry.lastSuccessAt,
		entry.metadataEvidence?.scrapeBudget?.observedAt ?? null,
	);
}

function latestIsoTimestamp(...timestamps: Array<string | null | undefined>): string | null {
	let latest: { timestamp: string; time: number } | null = null;
	for (const timestamp of timestamps) {
		if (!timestamp) continue;
		const time = Date.parse(timestamp);
		if (!Number.isFinite(time)) continue;
		if (!latest || time > latest.time) {
			latest = { timestamp, time };
		}
	}
	return latest?.timestamp ?? null;
}

function summarizeLiveFollowStatusPhaseDecision(entry: AccountMirrorStatusEntry): {
	phase: AccountMirrorLiveFollowCyclePhase | null;
	reason: string;
	source: "backfill_ledger" | "evidence";
} {
	const decision = chooseLiveFollowCyclePhase({
		operation: {
			passCount: entry.metadataEvidence || entry.lastCompletedAt ? 1 : 0,
			lastRefresh: entry.metadataEvidence || entry.lastCompletedAt ? {} : null,
		},
		evidence: entry.metadataEvidence,
		remainingDetailSurfaces: entry.mirrorCompleteness.remainingDetailSurfaces?.total ?? null,
		backfillLedger: entry.backfillLedger,
	});
	return {
		phase: decision.phase === "complete" ? null : decision.phase,
		reason: decision.reason,
		source:
			entry.backfillLedger &&
			entry.backfillLedger.state !== "complete" &&
			entry.backfillLedger.nextEligiblePhase !== "complete"
				? "backfill_ledger"
				: "evidence",
	};
}

function summarizeLiveFollowPreemption(
	entry: AccountMirrorStatusEntry,
	scheduler: HttpStatusResponse["accountMirrorScheduler"],
): LiveFollowTargetAccountSummary["routineDecision"]["preemption"] {
	if (entry.liveFollow.state !== "enabled") return null;
	if (scheduler.foregroundWork.active) {
		return {
			state: "foreground-work",
			reason: scheduler.operatorStatus.reason,
			retryAt: null,
		};
	}
	if (scheduler.lastPass?.backpressure.reason !== "foreground-work") return null;
	const selected = scheduler.lastPass.selectedTarget;
	if (
		selected &&
		(selected.provider !== entry.provider || selected.runtimeProfileId !== entry.runtimeProfileId)
	) {
		return null;
	}
	return {
		state: "foreground-work",
		reason:
			scheduler.lastPass.backpressure.message ??
			"latest scheduler pass yielded to foreground AuraCall work",
		retryAt: null,
	};
}

function summarizeLiveFollowMaterializationOutcome(
	operation: AccountMirrorCompletionOperation | null,
): LiveFollowTargetAccountSummary["materializationOutcome"] {
	const outcome = operation?.materializationOutcome ?? null;
	if (!outcome) return null;
	return {
		jobStatus: outcome.jobStatus,
		conversationsAttempted: outcome.conversationsAttempted,
		eligibleCandidates: outcome.eligibleCandidates,
		selectedCandidates: outcome.selectedCandidates,
		materialized: outcome.materialized,
		checksumCount: outcome.checksumCount,
		dispositionCounts: outcome.dispositionCounts ?? {},
	};
}

function summarizeLiveFollowAccountLibraryCatchup(
	entry: AccountMirrorStatusEntry,
	preview: HistoryAccountLibraryReconciliationPreviewResult | null,
	activeJobs: AccountMirrorAccountLibraryActiveJobs | null,
	browserProcessStatus: HttpBrowserProcessStatusResponse | null,
	now: () => Date,
): LiveFollowTargetAccountSummary["accountLibraryCatchup"] {
	const desired = entry.liveFollow.accountLibrary;
	if (!desired) return null;
	const activeJob = activeJobs?.primary ?? null;
	const activeJobCount = activeJobs?.count ?? 0;
	const cooldownUntil = deriveLiveFollowAccountLibraryCooldownUntil(entry);
	const cooldownActive = Boolean(cooldownUntil && Date.parse(cooldownUntil) > now().getTime());
	const browserHealth = summarizeLiveFollowAccountLibraryBrowserHealth(entry, browserProcessStatus);
	const blockedReason = deriveLiveFollowAccountLibraryBlockedReason({
		entry,
		activeJobCount,
		browserHealth,
	});
	const status = activeJob
		? activeJob.status
		: desired.mode === "disabled"
			? "disabled"
			: desired.mode === "preview_only"
				? "preview_only"
				: cooldownActive
					? "cooling_down"
					: blockedReason
						? "blocked"
						: "eligible";
	const reason = activeJob
		? `active account-library materialization job ${activeJob.id} is ${activeJob.status}`
		: cooldownActive
			? `account-library failure cooldown is active until ${cooldownUntil}`
			: (blockedReason ?? desired.reason);
	return {
		mode: desired.mode,
		enabled: desired.enabled,
		status,
		reason,
		activeJobId: activeJob?.id ?? null,
		activeJobStatus: activeJob?.status ?? null,
		activeJobScheduler: activeJob?.scheduler
			? {
					object: activeJob.scheduler.object,
					generatedAt: activeJob.scheduler.generatedAt,
					state: activeJob.scheduler.state,
					dispatchState: activeJob.scheduler.dispatchState,
					queuedAgeMs: activeJob.scheduler.queuedAgeMs,
					runAgeMs: activeJob.scheduler.runAgeMs,
					queuedToStartLatencyMs: activeJob.scheduler.queuedToStartLatencyMs,
					stale: activeJob.scheduler.stale,
					staleReason: activeJob.scheduler.staleReason,
				}
			: null,
		activeJobCount,
		maxItems: desired.maxItems,
		minIntervalMs: desired.minIntervalMs,
		failureCooldownMs: desired.failureCooldownMs,
		cooldownUntil,
		maxActiveJobs: desired.maxActiveJobs,
		providerWorkTimeoutMs: desired.providerWorkTimeoutMs,
		nextAttemptAt: cooldownActive
			? cooldownUntil
			: desired.mode === "eligible"
				? entry.eligibleAt
				: null,
		browserHealth,
		preview: preview
			? {
					generatedAt: preview.generatedAt,
					catalogFiles: preview.metrics.catalogFiles,
					eligibleCandidates: preview.metrics.eligibleCandidates,
					selectedCandidates: preview.metrics.selectedCandidates,
					archivedFamilies: preview.metrics.archivedFamilies,
					unresolvedStale: preview.metrics.unresolvedStale,
					unsupportedOrTerminal: preview.metrics.unsupportedOrTerminal,
					duplicateFamilies: preview.metrics.duplicateFamilies,
				}
			: null,
	};
}

function deriveLiveFollowAccountLibraryCooldownUntil(
	entry: AccountMirrorStatusEntry,
): string | null {
	const cooldownMs = entry.liveFollow.accountLibrary.failureCooldownMs;
	if (!cooldownMs || cooldownMs <= 0) return null;
	const lastFailureAtMs = Date.parse(entry.lastFailureAt ?? "");
	if (!Number.isFinite(lastFailureAtMs)) return null;
	return new Date(lastFailureAtMs + cooldownMs).toISOString();
}

function summarizeLiveFollowAccountLibraryBrowserHealth(
	entry: AccountMirrorStatusEntry,
	status: HttpBrowserProcessStatusResponse | null,
): LiveFollowAccountLibraryBrowserHealth {
	const browserEntry = status?.entries.find(
		(candidate) =>
			candidate.provider === entry.provider &&
			candidate.runtimeProfileId === entry.runtimeProfileId,
	);
	if (!browserEntry) return null;
	const reason = deriveLiveFollowAccountLibraryBrowserHealthBlockedReason(browserEntry);
	return {
		status: reason ? "blocked" : browserEntry.processAlive ? "observed" : "idle",
		reason,
		processAlive: browserEntry.processAlive,
		devToolsResponsive: browserEntry.devToolsResponsive,
		launchCommandHasBlankArg: browserEntry.launchCommandHasBlankArg,
		openBlankPageCount: browserEntry.openBlankPageCount,
		pageTargetCount: browserEntry.pageTargetCount,
		pid: browserEntry.pid,
		port: browserEntry.port,
		error: browserEntry.error,
	};
}

function deriveLiveFollowAccountLibraryBrowserHealthBlockedReason(
	entry: HttpBrowserProcessStatusEntry,
): string | null {
	if (entry.error) return `browser process health probe failed: ${entry.error}`;
	if (entry.processAlive && !entry.devToolsResponsive) {
		return "managed browser process is running but DevTools is not responsive";
	}
	if (entry.openBlankPageCount > 0) {
		return `managed browser has ${entry.openBlankPageCount} open blank page target(s)`;
	}
	return null;
}

function deriveLiveFollowAccountLibraryBlockedReason(input: {
	entry: AccountMirrorStatusEntry;
	activeJobCount: number;
	browserHealth: LiveFollowAccountLibraryBrowserHealth;
}): string | null {
	const { entry, activeJobCount, browserHealth } = input;
	if (entry.liveFollow.accountLibrary.mode !== "eligible") return null;
	if (entry.provider !== "chatgpt")
		return "account-library live-follow catch-up currently supports ChatGPT only";
	if (entry.liveFollow.state !== "enabled") return entry.liveFollow.reason;
	if (entry.status !== "eligible") return entry.reason;
	if (entry.providerGuard.state !== "clear")
		return entry.providerGuard.summary ?? entry.providerGuard.state;
	if (entry.mirrorState.running || entry.mirrorState.queued) {
		return "account mirror provider work is already active for this target";
	}
	const maxActiveJobs = entry.liveFollow.accountLibrary.maxActiveJobs;
	if (maxActiveJobs !== null && activeJobCount >= maxActiveJobs) {
		return `active account-library materialization jobs reached maxActiveJobs=${maxActiveJobs}`;
	}
	if (browserHealth?.reason) return browserHealth.reason;
	return null;
}

function isLiveFollowTargetAttentionNeeded(
	entry: AccountMirrorStatusEntry,
	activeOperation: AccountMirrorCompletionOperation | null,
	recentOperation: AccountMirrorCompletionOperation | null,
): boolean {
	const status =
		activeOperation?.status ?? (entry.mirrorState.running ? "refreshing" : entry.status);
	return isLiveFollowTargetAttentionNeededSummary({
		desiredState: entry.liveFollow.state,
		actualStatus: status,
		entryStatus: entry.status,
		statusReason: entry.reason,
		consecutiveFailureCount: entry.consecutiveFailureCount,
		recentCompletionStatus: recentOperation?.status,
	});
}

function summarizeCompletionLifecycleEvent(
	operation: AccountMirrorCompletionOperation | null,
): LiveFollowTargetAccountSummary["latestLifecycleEvent"] {
	const event = operation?.lifecycleEvents?.at(-1);
	if (!event) return null;
	return {
		at: event.at,
		type: event.type,
		message: event.message,
	};
}

async function createAccountMirrorCompletionStatusSummary(
	service: AccountMirrorCompletionService,
	now: () => Date,
): Promise<AccountMirrorCompletionStatusSummary> {
	const all = service.list({ limit: null });
	const active = service.list({ status: "active", limit: null });
	const recent = all.slice(0, ACCOUNT_MIRROR_COMPLETION_RECENT_STATUS_LIMIT);
	const projectedRecent = recent.map(projectAccountMirrorCompletionForMonitoring);
	const projectedActive = active.map(projectAccountMirrorCompletionForMonitoring);
	const metrics = all.reduce<AccountMirrorCompletionStatusSummary["metrics"]>(
		(acc, operation) => {
			acc.total += 1;
			acc[operation.status] += 1;
			if (
				operation.status === "queued" ||
				operation.status === "running" ||
				operation.status === "idle_waiting" ||
				operation.status === "paused"
			) {
				acc.active += 1;
			}
			return acc;
		},
		{
			total: 0,
			active: 0,
			queued: 0,
			running: 0,
			idle_waiting: 0,
			paused: 0,
			completed: 0,
			blocked: 0,
			failed: 0,
			cancelled: 0,
		},
	);
	return {
		object: "account_mirror_completion_summary",
		generatedAt: now().toISOString(),
		limits: {
			recent: ACCOUNT_MIRROR_COMPLETION_RECENT_STATUS_LIMIT,
		},
		omitted: {
			recent: Math.max(0, metrics.total - projectedRecent.length),
		},
		metrics,
		active: projectedActive,
		recent: projectedRecent,
	};
}

function normalizeAccountMirrorProofScope(
	value: ResponsesHttpServerOptions["accountMirrorProofScope"],
): { provider: AccountMirrorProvider | null; runtimeProfileId: string | null } | null {
	if (!value) return null;
	const provider =
		value.provider === "chatgpt" || value.provider === "gemini" || value.provider === "grok"
			? value.provider
			: null;
	const runtimeProfileId =
		typeof value.runtimeProfileId === "string" && value.runtimeProfileId.trim()
			? value.runtimeProfileId.trim()
			: null;
	if (!provider && !runtimeProfileId) return null;
	return { provider, runtimeProfileId };
}

function createAccountMirrorProofScopeStatus(
	scope: ReturnType<typeof normalizeAccountMirrorProofScope>,
	status: AccountMirrorStatusSummary,
	suppression: {
		resumeAccountMirrorCompletionsOnStart: boolean;
		reconcileAccountMirrorLiveFollowOnStart: boolean;
		accountMirrorSchedulerIntervalMs: number;
		backgroundDrainIntervalMs: number;
	},
): AccountMirrorProofScopeStatus {
	const entry = scope
		? (status.entries.find(
				(candidate) =>
					(!scope.provider || candidate.provider === scope.provider) &&
					(!scope.runtimeProfileId || candidate.runtimeProfileId === scope.runtimeProfileId),
			) ?? null)
		: null;
	return {
		object: "account_mirror_proof_scope",
		enabled: scope !== null,
		provider: scope?.provider ?? null,
		runtimeProfileId: scope?.runtimeProfileId ?? null,
		tenantKey: entry?.tenantKey ?? null,
		bindingKey: entry?.bindingKey ?? null,
		browserOperationKey: entry?.mirrorState.lastDispatcherKey ?? null,
		globalLiveFollowSuppressed:
			scope !== null &&
			!suppression.resumeAccountMirrorCompletionsOnStart &&
			!suppression.reconcileAccountMirrorLiveFollowOnStart &&
			suppression.accountMirrorSchedulerIntervalMs <= 0,
		suppressed: {
			resumeCompletionsOnStart: !suppression.resumeAccountMirrorCompletionsOnStart,
			reconcileLiveFollowOnStart: !suppression.reconcileAccountMirrorLiveFollowOnStart,
			schedulerExecution: suppression.accountMirrorSchedulerIntervalMs <= 0,
			backgroundDrain: suppression.backgroundDrainIntervalMs <= 0,
		},
	};
}

function scopeAccountMirrorStatusForProofScope(
	status: AccountMirrorStatusSummary,
	scope: ReturnType<typeof normalizeAccountMirrorProofScope>,
): AccountMirrorStatusSummary {
	if (!scope) return status;
	const entries = status.entries.filter(
		(entry) =>
			(!scope.provider || entry.provider === scope.provider) &&
			(!scope.runtimeProfileId || entry.runtimeProfileId === scope.runtimeProfileId),
	);
	return {
		...status,
		entries,
		metrics: entries.reduce<AccountMirrorStatusSummary["metrics"]>(
			(acc, entry) => {
				acc.total += 1;
				acc[entry.status] += 1;
				return acc;
			},
			{
				total: 0,
				eligible: 0,
				delayed: 0,
				blocked: 0,
			},
		),
	};
}

function readApiServerConfig(config: Record<string, unknown>): {
	host?: string;
	port?: number;
	dashboardUrl?: string;
	publicDashboardUrl?: string;
	accountMirrorSchedulerIntervalMs?: number;
	accountMirrorSchedulerDryRun?: boolean;
	routing?: ApiServiceRoutingConfig;
} {
	const api = config.api;
	if (!isRecord(api)) return {};
	const accountMirrorScheduler = isRecord(api.accountMirrorScheduler)
		? api.accountMirrorScheduler
		: null;
	return {
		host: readNonEmptyString(api.host),
		port: readPositiveInteger(api.port),
		dashboardUrl: readNonEmptyString(api.dashboardUrl),
		publicDashboardUrl: readNonEmptyString(api.publicDashboardUrl),
		accountMirrorSchedulerIntervalMs: accountMirrorScheduler
			? readNonNegativeInteger(accountMirrorScheduler.intervalMs)
			: undefined,
		accountMirrorSchedulerDryRun: accountMirrorScheduler
			? readApiAccountMirrorSchedulerDryRun(accountMirrorScheduler)
			: undefined,
		routing: readApiServiceRoutingConfig(api.routing),
	};
}

function readApiAuthPolicy(
	config: Record<string, unknown> | null | undefined,
	env: ApiAuthEnv = process.env,
): ApiAuthPolicy {
	const api = isRecord(config?.api) ? config.api : null;
	const auth = isRecord(api?.auth) ? api.auth : null;
	const rawKeys = auth && Array.isArray(auth.keys) ? auth.keys : [];
	const configKeys = rawKeys.flatMap((entry, index): ApiAuthKeyPolicy[] => {
		if (!isRecord(entry)) return [];
		const secret =
			readNonEmptyString(entry.secret) ??
			readNonEmptyString(entry.key) ??
			readNonEmptyString(entry.token);
		if (!secret) return [];
		return [
			{
				id: readNonEmptyString(entry.id) ?? `key-${String(index + 1)}`,
				secret,
				agents: readStringList(entry.agents),
				teams: readStringList(entry.teams),
				services: readStringList(entry.services),
				runtimeProfiles: readStringList(entry.runtimeProfiles),
			},
		];
	});
	const envKeys = readApiAuthEnvKeys(env);
	const keys = [...configKeys, ...envKeys];
	return {
		required:
			readBoolean(auth?.required) ??
			readBoolean(auth?.enabled) ??
			readBoolean(env.AURACALL_API_AUTH_REQUIRED) ??
			readBoolean(env.AURACALL_API_AUTH_ENABLED) ??
			keys.length > 0,
		keys,
	};
}

function readApiAuthEnvKeys(env: ApiAuthEnv): ApiAuthKeyPolicy[] {
	const keys: ApiAuthKeyPolicy[] = [];
	const primarySecret = readNonEmptyString(env.AURACALL_API_KEY);
	if (primarySecret) {
		keys.push({
			id: readNonEmptyString(env.AURACALL_API_KEY_ID) ?? "env",
			secret: primarySecret,
			agents: readDelimitedEnvList(env.AURACALL_API_KEY_AGENTS),
			teams: readDelimitedEnvList(env.AURACALL_API_KEY_TEAMS),
			services: readDelimitedEnvList(env.AURACALL_API_KEY_SERVICES),
			runtimeProfiles: readDelimitedEnvList(env.AURACALL_API_KEY_RUNTIME_PROFILES),
		});
	}

	for (const rawId of readDelimitedEnvList(env.AURACALL_API_KEY_IDS) ?? []) {
		const suffix = toApiAuthEnvSuffix(rawId);
		if (!suffix) continue;
		const secret = readNonEmptyString(env[`AURACALL_API_KEY_${suffix}`]);
		if (!secret) continue;
		keys.push({
			id: readNonEmptyString(env[`AURACALL_API_KEY_${suffix}_ID`]) ?? rawId,
			secret,
			agents: readDelimitedEnvList(env[`AURACALL_API_KEY_${suffix}_AGENTS`]),
			teams: readDelimitedEnvList(env[`AURACALL_API_KEY_${suffix}_TEAMS`]),
			services: readDelimitedEnvList(env[`AURACALL_API_KEY_${suffix}_SERVICES`]),
			runtimeProfiles: readDelimitedEnvList(env[`AURACALL_API_KEY_${suffix}_RUNTIME_PROFILES`]),
		});
	}

	return keys;
}

function toAgentConfigApiKeyDiagnosticInput(key: ApiAuthKeyPolicy) {
	return {
		id: key.id,
		agents: key.agents,
		teams: key.teams,
		services: key.services,
		runtimeProfiles: key.runtimeProfiles,
	};
}

function authorizeOperatorConfigAccess(context: ApiAuthContext): string | null {
	const key = context.key;
	if (!context.policy.required || !key) return null;
	if (
		key.agents?.length ||
		key.teams?.length ||
		key.services?.length ||
		key.runtimeProfiles?.length
	) {
		return "API key is not authorized for operator config access.";
	}
	return null;
}

function readDelimitedEnvList(value: string | undefined): string[] | undefined {
	const items = (value ?? "")
		.split(/[,\s]+/)
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

function toApiAuthEnvSuffix(value: string): string | null {
	const suffix = value
		.trim()
		.replace(/[^A-Za-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toUpperCase();
	return suffix || null;
}

function authorizeApiRequest(
	req: http.IncomingMessage,
	policy: ApiAuthPolicy,
	pathname: string,
	operatorDashboardRoutes?: OperatorDashboardRoutes,
): ApiAuthContext | null {
	if (!policy.required || !pathname.startsWith("/v1/")) {
		return { policy, key: null };
	}
	if (operatorDashboardRoutes && isOperatorDashboardApiRequest(req, operatorDashboardRoutes)) {
		return { policy, key: null };
	}
	const token =
		readBearerToken(req.headers.authorization) ??
		readSingleHeader(req.headers["x-auracall-api-key"]);
	if (!token) return null;
	const key = policy.keys.find((candidate) => candidate.secret === token) ?? null;
	return key ? { policy, key } : null;
}

function isOperatorDashboardApiRequest(
	req: http.IncomingMessage,
	routes: OperatorDashboardRoutes,
): boolean {
	const host = readSingleHeader(req.headers.host);
	if (!host) return false;

	const origin = parseRequestHeaderUrl(req.headers.origin);
	if (origin && sameHost(origin.host, host)) {
		return true;
	}

	const referer = parseRequestHeaderUrl(req.headers.referer ?? req.headers.referrer);
	if (!referer || !sameHost(referer.host, host)) {
		return false;
	}
	return isOperatorDashboardPath(referer.pathname, routes);
}

function parseRequestHeaderUrl(value: string | string[] | undefined): URL | null {
	const header = readSingleHeader(value);
	if (!header) return null;
	try {
		return new URL(header);
	} catch {
		return null;
	}
}

function sameHost(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

function isOperatorDashboardPath(pathname: string, routes: OperatorDashboardRoutes): boolean {
	const dashboardRoutes = [

    "/desktops",
		routes.consolePath,
		routes.dashboardPath,
		routes.debugDashboardPath,
		routes.accountMirrorPath,
		routes.previewSessionPath,
		routes.configPath,
		routes.agentsPath,
	];
	return dashboardRoutes.some(
		(route) => pathname === route || pathname.startsWith(`${route.replace(/\/+$/, "")}/`),
	);
}

function authorizeExecutionRequest(
	context: ApiAuthContext,
	request: ExecutionRequest,
	catalog: EffectiveAgentCatalog,
): string | null {
	return authorizeExecutionSelection(
		context,
		readExecutionAuthorizationSelection(request, catalog),
		catalog,
	);
}

function authorizeExecutionSelection(
	context: ApiAuthContext,
	selection: ExecutionAuthorizationSelection,
	catalog: EffectiveAgentCatalog,
): string | null {
	const key = context.key;
	if (!context.policy.required || !key) return null;
	const teamAgentIds = (key.teams ?? []).flatMap(
		(teamId) => catalog.teams.find((team) => team.id === teamId)?.agentIds ?? [],
	);
	const agentAllowedByTeam = Boolean(
		selection.agent && teamAgentIds.length > 0 && teamAgentIds.includes(selection.agent),
	);
	return (
		authorizeScopedValue("agent", selection.agent, key.agents, agentAllowedByTeam) ??
		authorizeScopedValue("team", selection.team, key.teams, agentAllowedByTeam) ??
		authorizeScopedValue("service", selection.service, key.services) ??
		authorizeScopedValue("runtime profile", selection.runtimeProfile, key.runtimeProfiles)
	);
}

interface ExecutionAuthorizationSelection {
	agent: string | null;
	team: string | null;
	service: string | null;
	runtimeProfile: string | null;
}

function readExecutionAuthorizationSelection(
	request: ExecutionRequest,
	catalog: EffectiveAgentCatalog,
): ExecutionAuthorizationSelection {
	const auracall = request.auracall ?? {};
	const agent = typeof auracall.agent === "string" ? auracall.agent : null;
	const team = typeof auracall.team === "string" ? auracall.team : null;
	const catalogAgent = agent ? catalog.agents.find((entry) => entry.id === agent) : null;
	return {
		agent,
		team,
		service:
			typeof auracall.service === "string"
				? auracall.service
				: (catalogAgent?.service ?? catalogAgent?.defaultService ?? null),
		runtimeProfile:
			typeof auracall.runtimeProfile === "string"
				? auracall.runtimeProfile
				: (catalogAgent?.runtimeProfileId ?? null),
	};
}

function hydrateExecutionRequestFromCatalog(
	request: ExecutionRequest,
	catalog: EffectiveAgentCatalog,
): ExecutionRequest {
	const auracall = request.auracall ?? {};
	const agent =
		typeof auracall.agent === "string" && auracall.agent.trim().length > 0
			? auracall.agent.trim()
			: null;
	if (!agent) {
		return request;
	}

	const catalogAgent = catalog.agents.find((entry) => entry.id === agent) ?? null;
	if (!catalogAgent) {
		return request;
	}

	const service =
		typeof auracall.service === "string" && auracall.service.trim().length > 0
			? auracall.service.trim()
			: (catalogAgent.service ?? catalogAgent.defaultService ?? null);
	const runtimeProfile =
		typeof auracall.runtimeProfile === "string" && auracall.runtimeProfile.trim().length > 0
			? auracall.runtimeProfile.trim()
			: (catalogAgent.runtimeProfileId ?? null);

	if (
		(service === null || service === auracall.service) &&
		(runtimeProfile === null || runtimeProfile === auracall.runtimeProfile)
	) {
		return request;
	}

	return createExecutionRequest({
		...request,
		auracall: {
			...auracall,
			agent,
			...(service ? { service } : {}),
			...(runtimeProfile ? { runtimeProfile } : {}),
		},
	});
}

function parseChatCompletionRequest(value: unknown): HttpChatCompletionRequest {
	if (!isRecord(value)) {
		throw new HttpInvalidRequestError("Chat completion request body must be an object.");
	}
	const model = readNonEmptyString(value.model);
	const messages = Array.isArray(value.messages)
		? value.messages.flatMap((message): HttpChatCompletionMessage[] => {
				if (!isRecord(message)) return [];
				const role = readNonEmptyString(message.role);
				if (role !== "system" && role !== "user" && role !== "assistant") return [];
				const content = normalizeChatMessageContent(message.content);
				return content === null ? [] : [{ role, content }];
			})
		: [];
	if (!model) {
		throw new HttpInvalidRequestError("Chat completion request requires a model.");
	}
	if (messages.length === 0) {
		throw new HttpInvalidRequestError(
			"Chat completion request requires at least one string-content message.",
		);
	}
	const metadata = isRecord(value.metadata) ? value.metadata : undefined;
	const responseFormat = isRecord(value.response_format) ? value.response_format : undefined;
	const tools = Array.isArray(value.tools)
		? value.tools.filter((tool): tool is Record<string, unknown> => isRecord(tool))
		: undefined;
	const auracall = isRecord(value.auracall)
		? (value.auracall as Record<string, unknown>)
		: undefined;
	const syncTimeoutMs = readNonNegativeInteger(
		auracall?.chatCompletionSyncTimeoutMs ?? auracall?.syncTimeoutMs,
	);
	return {
		model,
		messages,
		stream: readBoolean(value.stream) ?? false,
		...(responseFormat ? { response_format: responseFormat } : {}),
		...(metadata ? { metadata } : {}),
		...(tools ? { tools } : {}),
		...(auracall ? { auracall: auracall as ExecutionRequestExtensionHints } : {}),
		...(syncTimeoutMs !== undefined ? { syncTimeoutMs } : {}),
	};
}

function createExecutionRequestFromChatCompletion(
	request: HttpChatCompletionRequest,
): ExecutionRequest {
	const instructions =
		request.messages
			.filter((message) => message.role === "system")
			.map((message) => message.content)
			.join("\n\n") || null;
	const inputMessages = request.messages
		.filter((message) => message.role !== "system")
		.map((message) => ({
			role: message.role,
			content: message.content,
		}));
	const metadata = {
		...(request.metadata ?? {}),
		...(request.response_format ? { response_format: request.response_format } : {}),
	};
	return {
		model: request.model,
		input: inputMessages.length > 0 ? inputMessages : request.messages,
		...(instructions ? { instructions } : {}),
		...(Object.keys(metadata).length > 0 ? { metadata } : {}),
		...(request.tools ? { tools: request.tools } : {}),
		...(request.auracall ? { auracall: request.auracall } : {}),
	};
}

function normalizeResponsesApiRequest(value: unknown): ExecutionRequest {
	if (!isRecord(value)) {
		throw new HttpInvalidRequestError("Responses request body must be a JSON object.");
	}
	const metadata = isRecord(value.metadata) ? value.metadata : undefined;
	const responseFormat = isRecord(value.response_format) ? value.response_format : undefined;
	const normalized = {
		...value,
		...(metadata || responseFormat
			? {
					metadata: {
						...(metadata ?? {}),
						...(responseFormat && !isRecord(metadata?.response_format)
							? { response_format: responseFormat }
							: {}),
					},
				}
			: {}),
	};
	return normalized as ExecutionRequest;
}

function createChatCompletionErrorResponse(response: ExecutionResponse): HttpErrorPayload {
	return {
		error: {
			type: "auracall_execution_error",
			message: `AuraCall execution ${response.id} ended with status ${response.status}.`,
		},
	};
}

function createChatCompletionPendingResponse(response: ExecutionResponse): HttpErrorPayload {
	return {
		error: {
			type: "auracall_execution_pending",
			message:
				`AuraCall execution ${response.id} did not complete within the synchronous ` +
				"chat/completions wait window. Poll /v1/responses/{response_id} or retry later.",
			response_id: response.id,
			response_status: response.status,
			response_poll_path: `/v1/responses/${encodeURIComponent(response.id)}`,
			retry_after_seconds: CHAT_COMPLETION_RETRY_AFTER_SECONDS,
		},
	};
}

function createResponseReadbackErrorPayload(responseId: string, error: unknown): HttpErrorPayload {
	return {
		error: {
			type: "auracall_response_readback_error",
			message: error instanceof Error ? error.message : "Response readback failed.",
			response_id: responseId,
			response_poll_path: `/v1/responses/${encodeURIComponent(responseId)}`,
		},
	};
}

async function waitForChatCompletionDrain(
	drain: Promise<unknown>,
	timeoutMs: number | undefined,
): Promise<boolean> {
	const normalizedTimeoutMs = timeoutMs ?? DEFAULT_CHAT_COMPLETION_SYNC_TIMEOUT_MS;
	if (normalizedTimeoutMs <= 0) {
		return false;
	}
	let timeout: NodeJS.Timeout | null = null;
	try {
		return await Promise.race([
			drain.then(() => true),
			new Promise<boolean>((resolve) => {
				timeout = setTimeout(() => resolve(false), normalizedTimeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function createChatCompletionResponse(
	response: ExecutionResponse,
	now: () => Date,
): HttpChatCompletionResponse {
	const usage = response.metadata?.executionSummary?.providerUsageSummary;
	return {
		id: response.id,
		object: "chat.completion",
		created: Math.floor(now().getTime() / 1000),
		model: response.model ?? "",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: extractChatCompletionText(response),
				},
				finish_reason: response.status === "completed" ? "stop" : null,
			},
		],
		...(usage
			? {
					usage: {
						prompt_tokens: usage.inputTokens ?? null,
						completion_tokens: usage.outputTokens ?? null,
						total_tokens: usage.totalTokens ?? null,
					},
				}
			: {}),
		...(response.metadata ? { metadata: response.metadata } : {}),
	};
}

function extractChatCompletionText(response: ExecutionResponse): string {
	return response.output
		.flatMap((item) => (item.type === "message" ? item.content.map((part) => part.text) : []))
		.join("\n\n");
}

function normalizeChatMessageContent(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return null;
	const text = value
		.flatMap((part): string[] => {
			if (!isRecord(part)) return [];
			if (part.type !== "text") return [];
			const textValue = readNonEmptyString(part.text);
			return textValue ? [textValue] : [];
		})
		.join("\n");
	return text.length > 0 ? text : null;
}

function authorizeScopedValue(
	label: string,
	value: string | null,
	allowed: string[] | undefined,
	allowedByRelatedScope = false,
): string | null {
	if (!allowed?.length) return null;
	if (allowedByRelatedScope) return null;
	if (value && allowed.includes(value)) return null;
	return `API key is not authorized for ${label}${value ? ` "${value}"` : " selection"}.`;
}

function readBearerToken(value: string | string[] | undefined): string | null {
	const header = readSingleHeader(value);
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match?.[1]?.trim() || null;
}

function readApiAccountMirrorSchedulerDryRun(value: Record<string, unknown>): boolean | undefined {
	const dryRun = readBoolean(value.dryRun);
	if (dryRun !== undefined) return dryRun;
	const execute = readBoolean(value.execute);
	return execute === undefined ? undefined : !execute;
}

function readApiServiceRoutingConfig(value: unknown): ApiServiceRoutingConfig | undefined {
	if (!isRecord(value)) return undefined;
	const routing: ApiServiceRoutingConfig = {
		localHostname: readNonEmptyString(value.localHostname),
		externalHostname: readNonEmptyString(value.externalHostname),
		localBaseUrl: readNonEmptyString(value.localBaseUrl),
		externalBaseUrl: readNonEmptyString(value.externalBaseUrl),
		consolePath: readNonEmptyString(value.consolePath),
		dashboardPath: readNonEmptyString(value.dashboardPath),
		debugDashboardPath: readNonEmptyString(value.debugDashboardPath),
		accountMirrorPath: readNonEmptyString(value.accountMirrorPath),
		proxyTarget: readNonEmptyString(value.proxyTarget),
		auth: readNonEmptyString(value.auth),
		ingress: readNonEmptyString(value.ingress),
	};
	return Object.values(routing).some(Boolean) ? routing : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function resolveCachedCatalogItemAsset(
	detail: AccountMirrorCatalogItemResult,
	config: Record<string, unknown> | null | undefined,
): Promise<CachedCatalogItemAsset | null> {
	const item = isRecord(detail.item) ? detail.item : {};
	const localPath = readCatalogAssetStringField(item, [
		"localPath",
		"path",
		"filePath",
		"absolutePath",
	]);
	const storageRelpath = readCatalogAssetStringField(item, [
		"assetStorageRelpath",
		"storageRelpath",
	]);
	const rawPath = localPath ?? storageRelpath;
	if (!rawPath) return null;
	const resolvedPath = await resolveCacheOwnedAssetPath(rawPath, config);
	if (!resolvedPath) return null;
	const stat = await fs.stat(resolvedPath).catch(() => null);
	if (!stat?.isFile()) return null;
	return {
		path: resolvedPath,
		mimeType: inferCachedAssetMimeType(
			readCatalogAssetStringField(item, ["mimeType", "mime", "contentType"]),
			readCatalogAssetStringField(item, ["name", "filename", "fileName", "title"]) ?? resolvedPath,
		),
		size: stat.size,
	};
}

async function resolveCacheOwnedAssetPath(
	rawPath: string,
	config: Record<string, unknown> | null | undefined,
): Promise<string | null> {
	const roots = resolveCacheAssetRoots(config);
	const candidates = path.isAbsolute(rawPath)
		? [path.normalize(rawPath)]
		: roots.map((root) => path.resolve(root, rawPath));
	for (const candidate of candidates) {
		const normalized = path.normalize(candidate);
		if (!isPathInsideAnyRoot(normalized, roots)) continue;
		if (await pathExists(normalized)) return normalized;
	}
	return null;
}

function resolveCacheAssetRoots(config: Record<string, unknown> | null | undefined): string[] {
	const configuredRoot = readNestedNonEmptyString(config, ["browser", "cache", "rootDir"]);
	const roots = [
		configuredRoot ? path.resolve(configuredRoot) : null,
		path.join(getAuracallHomeDir(), "cache"),
		path.join(getAuracallHomeDir(), "cache", "providers"),
	].filter((value): value is string => Boolean(value));
	return Array.from(new Set(roots.map((root) => path.normalize(root))));
}

function isPathInsideAnyRoot(candidate: string, roots: string[]): boolean {
	return roots.some((root) => {
		const relative = path.relative(root, candidate);
		return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
	});
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function inferCachedAssetMimeType(configured: string | null, fileName: string): string {
	if (configured?.includes("/")) return configured;
	const ext = path.extname(fileName).toLowerCase();
	const types: Record<string, string> = {
		".avif": "image/avif",
		".gif": "image/gif",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".svg": "image/svg+xml",
		".webp": "image/webp",
		".mp4": "video/mp4",
		".m4v": "video/mp4",
		".mov": "video/quicktime",
		".webm": "video/webm",
		".mp3": "audio/mpeg",
		".m4a": "audio/mp4",
		".ogg": "audio/ogg",
		".wav": "audio/wav",
		".pdf": "application/pdf",
		".md": "text/markdown; charset=utf-8",
		".markdown": "text/markdown; charset=utf-8",
		".txt": "text/plain; charset=utf-8",
		".json": "application/json; charset=utf-8",
	};
	return types[ext] ?? "application/octet-stream";
}

function readCatalogAssetStringField(
	item: Record<string, unknown>,
	fields: string[],
): string | null {
	const direct = readRecordStringField(item, fields);
	if (direct) return direct;
	const metadata = item.metadata;
	return isRecord(metadata) ? readRecordStringField(metadata, fields) : null;
}

function readRecordStringField(item: Record<string, unknown>, fields: string[]): string | null {
	for (const field of fields) {
		const value = item[field];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return null;
}

function readNestedNonEmptyString(
	value: Record<string, unknown> | null | undefined,
	segments: string[],
): string | null {
	let current: unknown = value;
	for (const segment of segments) {
		if (!isRecord(current)) return null;
		current = current[segment];
	}
	return typeof current === "string" && current.trim() ? current.trim() : null;
}

function readNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readStringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const entries = value.flatMap((entry): string[] => {
		const normalized = readNonEmptyString(entry);
		return normalized ? [normalized] : [];
	});
	return entries.length > 0 ? [...new Set(entries)] : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
	return value;
}

function readNonNegativeInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
	return value;
}

function readBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function createAccountMirrorSchedulerOperatorStatus(
	scheduler: HttpStatusResponse["accountMirrorScheduler"],
): AccountMirrorSchedulerOperatorStatus {
	if (!scheduler.enabled) {
		return {
			posture: "disabled",
			reason:
				"account mirror scheduler is disabled; set --account-mirror-scheduler-interval-ms to enable cadence and live-follow wakes",
			backpressureReason: null,
		};
	}
	if (scheduler.paused || scheduler.state === "paused") {
		return {
			posture: "paused",
			reason: "account mirror scheduler is paused by operator control",
			backpressureReason: null,
		};
	}
	if (scheduler.state === "running") {
		return {
			posture: "running",
			reason: "account mirror scheduler pass is currently running",
			backpressureReason: null,
		};
	}
	if (scheduler.foregroundWork.active) {
		return {
			posture: "waiting",
			reason: formatForegroundWorkWaitReason(scheduler.foregroundWork),
			backpressureReason: "foreground-work",
		};
	}
	const backpressureReason = scheduler.lastPass?.backpressure?.reason ?? null;
	if (backpressureReason === "foreground-work") {
		return {
			posture: "waiting",
			reason:
				scheduler.lastPass?.backpressure?.message ??
				"latest scheduler pass yielded to foreground AuraCall work",
			backpressureReason,
		};
	}
	if (backpressureReason === "routine-delayed") {
		return {
			posture: scheduler.state === "scheduled" ? "scheduled" : "healthy",
			reason: scheduler.lastPass?.backpressure?.message
				? `latest scheduler pass is waiting on routine cadence: ${scheduler.lastPass.backpressure.message}`
				: "latest scheduler pass found only routine-delayed targets and is waiting for the next cadence",
			backpressureReason,
		};
	}
	if (backpressureReason && backpressureReason !== "none") {
		return {
			posture: "backpressured",
			reason:
				scheduler.lastPass?.backpressure?.message ?? `latest pass reported ${backpressureReason}`,
			backpressureReason,
		};
	}
	if (scheduler.lastPass) {
		return {
			posture: "healthy",
			reason: "latest account mirror scheduler pass completed without backpressure",
			backpressureReason: backpressureReason ?? null,
		};
	}
	if (scheduler.state === "scheduled") {
		return {
			posture: "scheduled",
			reason: "account mirror scheduler has a pass queued on its cadence timer",
			backpressureReason: null,
		};
	}
	return {
		posture: "ready",
		reason: "account mirror scheduler is enabled and waiting for its first pass",
		backpressureReason: null,
	};
}

function formatForegroundWorkWaitReason(
	status: AccountMirrorSchedulerForegroundWorkStatus,
): string {
	const reasons = [
		status.activeRequestCount > 0 ? `activeRequests=${status.activeRequestCount}` : null,
		status.drainReservations > 0 ? `pendingDrains=${status.drainReservations}` : null,
		status.backgroundDrainScheduled ? "backgroundDrainScheduled=true" : null,
		status.backgroundDrainState === "scheduled" || status.backgroundDrainState === "running"
			? `backgroundDrainState=${status.backgroundDrainState}`
			: null,
	].filter(Boolean);
	return reasons.length > 0
		? `foreground AuraCall work is active; live follow is waiting (${reasons.join(" ")})`
		: "foreground AuraCall work is active; live follow is waiting";
}

function createStartupRecoveryLog(
	result: DrainStoredExecutionRunsUntilIdleResult,
	options: {
		sourceKind: string;
		maxRuns: number;
		staleHeartbeatInspectOnlyCount?: number;
		suspiciouslyIdleCount?: number;
	},
): string {
	const skipCounts: Record<string, number> = {};
	for (const entry of result.drained) {
		if (entry.result === "skipped" && entry.reason) {
			skipCounts[entry.reason] = (skipCounts[entry.reason] ?? 0) + 1;
		}
	}

	const skipSummary = Object.entries(skipCounts)
		.map(([reason, count]) => `${reason}:${count}`)
		.join(", ");

	const parts: string[] = [
		`Startup recovery (${options.sourceKind}) completed in ${result.iterations} iteration(s).`,
		`scanned ${result.drained.length} candidate run(s),`,
		`${result.executedRunIds.length} executed,`,
		`${result.expiredLeaseRunIds.length} expired lease(s) reclaimed.`,
	];

	if (skipSummary.length > 0) {
		parts.push(`skips=${skipSummary}`);
	}

	const deferredByBudget = skipCounts["limit-reached"] ?? 0;
	const activeLeaseCount = skipCounts["active-lease"] ?? 0;
	const staleHeartbeatCount = skipCounts["stale-heartbeat"] ?? 0;
	const strandedCount = skipCounts["stranded-running-no-lease"] ?? 0;
	const idleCount = skipCounts["no-runnable-step"] ?? 0;
	parts.push(
		`metrics=deferred-by-budget:${deferredByBudget}, active-lease:${activeLeaseCount}, stale-heartbeat:${staleHeartbeatCount}, stranded:${strandedCount}, idle:${idleCount}`,
	);

	if (result.executedRunIds.length > 0) {
		parts.push(`executed=${result.executedRunIds.slice(0, 5).join(",")}`);
	}

	const attentionEntries: string[] = [];
	if ((options.staleHeartbeatInspectOnlyCount ?? 0) > 0) {
		attentionEntries.push(`stale-heartbeat-inspect-only:${options.staleHeartbeatInspectOnlyCount}`);
	}
	if ((options.suspiciouslyIdleCount ?? 0) > 0) {
		attentionEntries.push(`suspiciously-idle:${options.suspiciouslyIdleCount}`);
	}
	if (attentionEntries.length > 0) {
		parts.push(`attention=${attentionEntries.join(",")}`);
	}

	if (result.drained.length > options.maxRuns) {
		parts.push(`cap=${options.maxRuns} hits reached`);
	}

	return parts.join(" ");
}

const COMPACT_TEAM_RUN_CREATE_REQUEST_SCHEMA = z.object({
	teamId: z.string().min(1).optional(),
	objective: z.string().min(1).optional(),
	title: z.string().min(1).nullable().optional(),
	promptAppend: z.string().min(1).nullable().optional(),
	structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
	responseFormat: z.enum(["text", "markdown", "json"]).optional(),
	outputContract: z.literal(AURACALL_STEP_OUTPUT_CONTRACT_VERSION).nullable().optional(),
	maxTurns: z.number().int().positive().nullable().optional(),
	localActionPolicy: z
		.object({
			allowedShellCommands: z.array(z.string().min(1)).optional(),
			allowedCwdRoots: z.array(z.string().min(1)).optional(),
			mode: z.enum(["allowed", "approval-required"]).optional(),
		})
		.nullable()
		.optional(),
});

const TEAM_RUN_CREATE_REQUEST_SCHEMA = COMPACT_TEAM_RUN_CREATE_REQUEST_SCHEMA.extend({
	taskRunSpec: TaskRunSpecSchema.optional(),
}).superRefine((value, ctx) => {
	if (!value.taskRunSpec) {
		if (!value.teamId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "teamId is required when taskRunSpec is not provided",
				path: ["teamId"],
			});
		}
		if (!value.objective) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "objective is required when taskRunSpec is not provided",
				path: ["objective"],
			});
		}
		return;
	}

	if (value.teamId && value.teamId.trim() !== value.taskRunSpec.teamId) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "teamId must match taskRunSpec.teamId when both are provided",
			path: ["teamId"],
		});
	}

	const compactAssignmentFieldNames = [
		"objective",
		"title",
		"promptAppend",
		"structuredContext",
		"responseFormat",
		"outputContract",
		"maxTurns",
		"localActionPolicy",
	] as const;
	const conflictingFields = compactAssignmentFieldNames.filter(
		(field) => value[field] !== undefined,
	);
	if (conflictingFields.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `taskRunSpec cannot be combined with compact assignment fields: ${conflictingFields.join(", ")}`,
			path: ["taskRunSpec"],
		});
	}
});

const ACCOUNT_MIRROR_DEVELOPMENT_POLICY_SCHEMA = z.object({
	enabled: z.literal(true),
	maxWallTimeMs: z.number().int().min(1_000).max(1_800_000),
	maxConversations: z.number().int().min(1).max(100),
	maxMaterializationCandidates: z.number().int().min(1).max(100),
	maxPasses: z.number().int().min(1).max(20),
	providerCallTimeoutMs: z.number().int().min(1_000).max(120_000).optional(),
	maxBrowserInteractionsPerMinute: z.number().int().min(1).max(120).optional(),
	conversationReadCooldownMs: z.number().int().min(0).max(300_000).optional(),
	pageRefreshCooldownMs: z.number().int().min(0).max(300_000).optional(),
	renavigationCooldownMs: z.number().int().min(0).max(300_000).optional(),
});

const ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA = z
	.object({
		provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
		runtimeProfile: z.string().trim().min(1).optional(),
		explicitRefresh: z.boolean().optional(),
		ignoreMinimumInterval: z.boolean().optional(),
		ignore_minimum_interval: z.boolean().optional(),
		ignoreFailureBackoff: z.boolean().optional(),
		ignore_failure_backoff: z.boolean().optional(),
		queueTimeoutMs: z.number().int().nonnegative().optional(),
		queuePollMs: z.number().int().positive().optional(),
		collectorTimeoutMs: z.number().int().positive().optional(),
		sweepMode: z.enum(["steady_follow", "full_sweep"]).optional(),
		requestedPhase: z
			.enum([
				"identity",
				"projects",
				"root-conversations",
				"project-conversations",
				"chatgpt-library",
				"detail-inventory",
				"merge-persisted-catalog",
				"complete",
			])
			.optional(),
		development: ACCOUNT_MIRROR_DEVELOPMENT_POLICY_SCHEMA.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.development && (!value.provider || !value.runtimeProfile)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Development requests require explicit provider and runtimeProfile.",
				path: ["development"],
			});
		}
	});

const ACCOUNT_MIRROR_COMPLETION_REQUEST_SCHEMA = z
	.object({
		conversationIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
		provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
		runtimeProfile: z.string().trim().min(1).optional(),
		maxPasses: z.number().int().positive().max(500).optional(),
		sweepMode: z.enum(["steady_follow", "full_sweep"]).optional(),
		sweep_mode: z.enum(["steady_follow", "full_sweep"]).optional(),
		materializationPolicy: z
			.enum(["metadata_only", "recent_missing_assets", "full_missing_assets"])
			.optional(),
		materialization_policy: z
			.enum(["metadata_only", "recent_missing_assets", "full_missing_assets"])
			.optional(),
		materializationAssetKinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
		materialization_asset_kinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
		materializationMaxItems: z.number().int().positive().max(500).optional(),
		materialization_max_items: z.number().int().positive().max(500).optional(),
		materializationRefreshSnapshot: z.boolean().optional(),
		materialization_refresh_snapshot: z.boolean().optional(),
		materializationForce: z.boolean().optional(),
		materialization_force: z.boolean().optional(),
	})
	.refine(
		(value) =>
			!value.conversationIds ||
			(value.sweepMode ?? value.sweep_mode ?? "steady_follow") === "steady_follow",
		{ message: "conversationIds requires steady_follow.", path: ["conversationIds"] },
	);

const ACCOUNT_MIRROR_RECONCILIATION_REQUEST_SCHEMA = z.object({
	provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
	runtimeProfile: z.string().trim().min(1).optional(),
	identity: z.string().trim().min(1).optional(),
	includeDisabled: z.boolean().optional(),
	include_disabled: z.boolean().optional(),
	maxTargets: z.number().int().positive().max(500).optional(),
	max_targets: z.number().int().positive().max(500).optional(),
	maxActiveTargets: z.number().int().positive().max(100).optional(),
	max_active_targets: z.number().int().positive().max(100).optional(),
	materializationPolicy: z
		.enum(["metadata_only", "recent_missing_assets", "full_missing_assets"])
		.optional(),
	materialization_policy: z
		.enum(["metadata_only", "recent_missing_assets", "full_missing_assets"])
		.optional(),
	materializationAssetKinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
	materialization_asset_kinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
	materializationMaxItems: z.number().int().positive().max(500).optional(),
	materialization_max_items: z.number().int().positive().max(500).optional(),
	dryRun: z.boolean().optional(),
	dry_run: z.boolean().optional(),
});

const ACCOUNT_MIRROR_COMPLETION_CONTROL_REQUEST_SCHEMA = z.object({
	action: z
		.enum(["pause", "resume", "cancel", "run_one_pass", "run-one-pass"])
		.transform((value) => (value === "run-one-pass" ? "run_one_pass" : value)),
});

const ACCOUNT_MIRROR_RECONCILIATION_CONTROL_REQUEST_SCHEMA = z.object({
	action: z
		.enum(["pause", "resume", "cancel", "run_next_pass", "run-next-pass"])
		.transform((value) => (value === "run-next-pass" ? "run_next_pass" : value)),
});

const STATUS_CONTROL_REQUEST_SCHEMA = z.union([
	z.object({
		backgroundDrain: z.object({
			action: z.enum(["pause", "resume"]),
		}),
	}),
	z.object({
		accountMirrorScheduler: z.object({
			action: z.enum(["pause", "resume", "run-once", "run-once-with-foreground-pressure"]),
			dryRun: z.boolean().optional(),
		}),
	}),
	z.object({
		accountMirrorProviderGuard: z.object({
			action: z.literal("clear"),
			provider: z.enum(["chatgpt", "gemini", "grok"]),
			runtimeProfile: z.string().trim().min(1).default("default"),
			cooldownMs: z.number().int().nonnegative().optional(),
		}),
	}),
	z.object({
		accountMirrorCompletion: z.object({
			action: z
				.enum(["pause", "resume", "cancel", "run_one_pass", "run-one-pass"])
				.transform((value) => (value === "run-one-pass" ? "run_one_pass" : value)),
			id: z.string().min(1),
		}),
	}),
	z.object({
		preflight: z.object({
			action: z.literal("run"),
			name: z.literal("lazy-live-follow").default("lazy-live-follow"),
		}),
	}),
	z.object({
		serviceControl: z.object({
			action: z.literal("restart-api-service"),
			dryRun: z.boolean().optional(),
			delayMs: z.number().int().min(0).max(10_000).optional(),
		}),
	}),
	z.object({
		localActionControl: z.object({
			action: z.literal("resolve-request"),
			runId: z.string().min(1),
			requestId: z.string().min(1),
			resolution: z.enum(["approved", "rejected", "cancelled"]),
			note: z.string().min(1).nullable().optional(),
		}),
	}),
	z.object({
		runControl: z.union([
			z.object({
				action: z.literal("cancel-run"),
				runId: z.string().min(1),
				note: z.string().min(1).nullable().optional(),
			}),
			z.object({
				action: z.literal("drain-run"),
				runId: z.string().min(1),
			}),
			z.object({
				action: z.literal("resume-human-escalation"),
				runId: z.string().min(1),
				note: z.string().min(1).nullable().optional(),
				guidance: z.record(z.string(), z.unknown()).nullable().optional(),
				override: z
					.object({
						promptAppend: z.string().min(1).nullable().optional(),
						structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
					})
					.nullable()
					.optional(),
			}),
		]),
	}),
	z.object({
		leaseRepair: z.object({
			action: z.literal("repair-stale-heartbeat"),
			runId: z.string().min(1),
			force: z.boolean().optional(),
		}),
	}),
	z.object({
		schedulerControl: z.object({
			action: z.literal("claim-local-run"),
			runId: z.string().min(1),
			schedulerId: z.string().min(1).default("operator"),
		}),
	}),
]);

type StatusControlRequest = z.infer<typeof STATUS_CONTROL_REQUEST_SCHEMA>;

type ServiceHostStatusControlRequest = Exclude<
	StatusControlRequest,
	| { backgroundDrain: unknown }
	| { accountMirrorScheduler: unknown }
	| { accountMirrorProviderGuard: unknown }
	| { accountMirrorCompletion: unknown }
	| { preflight: unknown }
	| { serviceControl: unknown }
>;

function createServiceHostOperatorControlInput(
	payload: ServiceHostStatusControlRequest,
): ExecutionServiceHostOperatorControlInput {
	if ("leaseRepair" in payload) {
		return {
			kind: "lease-repair",
			action: payload.leaseRepair.action,
			runId: payload.leaseRepair.runId,
			force: payload.leaseRepair.force ?? false,
		};
	}
	if ("localActionControl" in payload) {
		return {
			kind: "local-action-control",
			action: payload.localActionControl.action,
			runId: payload.localActionControl.runId,
			requestId: payload.localActionControl.requestId,
			resolution: payload.localActionControl.resolution,
			note: payload.localActionControl.note ?? null,
		};
	}
	if ("schedulerControl" in payload) {
		return {
			kind: "scheduler-control",
			control: payload.schedulerControl,
		};
	}
	if (!("runControl" in payload)) {
		throw new HttpInvalidRequestError("unsupported service-host status control payload");
	}
	return {
		kind: "run-control",
		control: payload.runControl,
	};
}

function isSuccessfulServiceHostOperatorControlResult(
	result: ExecutionServiceHostOperatorControlResult,
): boolean {
	if (result.kind === "lease-repair") {
		return result.status === "repaired";
	}
	if (result.kind === "local-action-control") {
		return result.status === "resolved";
	}
	if (result.kind === "scheduler-control") {
		return result.status === "claimed" || result.status === "reassigned";
	}
	return (
		(result.action === "cancel-run" && result.status === "cancelled") ||
		(result.action === "resume-human-escalation" && result.status === "resumed") ||
		(result.action === "drain-run" && result.status === "executed")
	);
}

interface ParsedStatusQuery {
	recovery: boolean;
	sourceKindSummary?: ExecutionRunSourceKind | "all";
	runnerTopologyMode: "compact" | "full";
	tenantExecutionLimitsMode: "configured" | "usage";
	accountMirrorProvider?: AccountMirrorProvider;
	accountMirrorRuntimeProfileId?: string;
}

interface ParsedBrowserProcessStatusQuery {
	provider?: AccountMirrorProvider;
	runtimeProfileId?: string;
}

interface ParsedRuntimeInspectionQuery {
	probe?: "service-state";
	authority?: "scheduler";
	diagnostics?: "browser-state";
}

interface ParsedRuntimeRunListQuery {
	limit?: number;
	status?: ExecutionRunStatus;
	sourceKind?: ExecutionRunSourceKind;
}

interface ParsedRunArchiveQuery extends RunArchiveListRequest {}

interface ParsedRunStatusQuery {
	diagnostics?: "browser-state";
}

interface ParsedAccountMirrorStatusQuery {
	provider?: AccountMirrorProvider;
	runtimeProfileId?: string;
	explicitRefresh?: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
}

interface ParsedAccountMirrorCatalogQuery {
	provider?: AccountMirrorProvider;
	runtimeProfileId?: string;
	kind?: AccountMirrorCatalogKind;
	limit?: number;
}

interface ParsedAccountMirrorCatalogItemQuery extends ParsedAccountMirrorCatalogQuery {
	itemId: string;
}

interface ParsedDomDriftObservationQuery {
	service?: string;
	surface?: string;
	status?: DomDriftObservationStatus;
	limit?: number;
}

interface CachedCatalogItemAsset {
	path: string;
	mimeType: string;
	size: number;
	fileName?: string | null;
}

interface ApiServiceRestartRequest {
	unitName: string;
	delayMs: number;
}

interface ParsedAccountMirrorCompletionListQuery {
	provider?: AccountMirrorProvider;
	runtimeProfileId?: string;
	status?: AccountMirrorCompletionOperation["status"] | "active";
	activeOnly?: boolean;
	limit?: number;
}

interface ParsedAccountMirrorReconciliationListQuery {
	status?: AccountMirrorReconciliationCampaign["status"] | "active";
	limit?: number;
}

interface ParsedMediaGenerationCreateQuery {
	wait?: boolean;
}

function parseStatusQuery(searchParams: URLSearchParams): ParsedStatusQuery {
	const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
	const parsed = z
		.object({
			recovery: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
			sourceKind: z.enum(["direct", "team-run", "all"]).optional(),
			runnerTopology: z.enum(["compact", "full"]).optional(),
			tenantExecutionLimits: z.enum(["configured", "usage"]).optional(),
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
		})
		.superRefine((value, ctx) => {
			if (!value.recovery && value.sourceKind !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "sourceKind can only be used with recovery=true",
					path: ["sourceKind"],
				});
			}
		})
		.parse(raw);

	return {
		recovery: parsed.recovery ?? false,
		sourceKindSummary: parsed.sourceKind,
		runnerTopologyMode: parsed.runnerTopology ?? "compact",
		tenantExecutionLimitsMode: parsed.tenantExecutionLimits ?? "configured",
		accountMirrorProvider: parsed.provider,
		accountMirrorRuntimeProfileId: parsed.runtimeProfile,
	};
}

function parseBrowserProcessStatusQuery(
	searchParams: URLSearchParams,
): ParsedBrowserProcessStatusQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("provider")) {
		raw.provider = searchParams.get("provider");
	}
	if (searchParams.has("runtimeProfile")) {
		raw.runtimeProfile = searchParams.get("runtimeProfile");
	}
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
		})
		.parse(raw);
	return {
		provider: parsed.provider,
		runtimeProfileId: parsed.runtimeProfile,
	};
}

function compactRunnerTopologyForStatus(
	topology: ExecutionServiceHostRunnerTopologySummary,
	mode: ParsedStatusQuery["runnerTopologyMode"],
): ExecutionServiceHostRunnerTopologySummary {
	if (mode === "full") {
		return {
			...topology,
			metrics: {
				...topology.metrics,
				displayedRunnerCount: topology.runners.length,
				omittedRunnerCount: 0,
				omittedStaleRunnerCount: 0,
				omittedExpiredRunnerCount: 0,
			},
		};
	}

	const runners: ExecutionServiceHostRunnerTopologySummary["runners"] = [];
	const omitted: ExecutionServiceHostRunnerTopologySummary["runners"] = [];
	for (const runner of topology.runners) {
		if (
			runner.selectedAsLocalExecutionOwner ||
			runner.freshness === "fresh" ||
			runner.status === "active"
		) {
			runners.push(runner);
		} else {
			omitted.push(runner);
		}
	}

	return {
		...topology,
		runners,
		metrics: {
			...topology.metrics,
			displayedRunnerCount: runners.length,
			omittedRunnerCount: omitted.length,
			omittedStaleRunnerCount: omitted.filter((runner) => runner.freshness === "stale").length,
			omittedExpiredRunnerCount: omitted.filter((runner) => runner.freshness === "expired").length,
		},
	};
}

function parseRuntimeInspectionQuery(searchParams: URLSearchParams): ParsedRuntimeInspectionQuery {
	const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
	const parsed = z
		.object({
			probe: z.enum(["service-state"]).optional(),
			authority: z.enum(["scheduler"]).optional(),
			diagnostics: z.enum(["browser-state"]).optional(),
		})
		.parse(raw);

	return {
		probe: parsed.probe,
		authority: parsed.authority,
		diagnostics: parsed.diagnostics,
	};
}

function parseRuntimeRunListQuery(searchParams: URLSearchParams): ParsedRuntimeRunListQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("limit")) raw.limit = searchParams.get("limit");
	if (searchParams.has("status")) raw.status = searchParams.get("status");
	if (searchParams.has("sourceKind")) raw.sourceKind = searchParams.get("sourceKind");
	const parsed = z
		.object({
			limit: z.coerce.number().int().min(0).max(100).optional(),
			status: z.enum(["planned", "running", "succeeded", "failed", "cancelled"]).optional(),
			sourceKind: z.enum(["team-run", "direct"]).optional(),
		})
		.parse(raw);
	return {
		limit: parsed.limit ?? 25,
		status: parsed.status,
		sourceKind: parsed.sourceKind,
	};
}

function parseWorkbenchCapabilityQuery(searchParams: URLSearchParams) {
	const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			category: z
				.enum([
					"research",
					"media",
					"canvas",
					"connector",
					"skill",
					"app",
					"search",
					"file",
					"other",
				])
				.optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			includeUnavailable: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
			diagnostics: z.enum(["browser-state"]).optional(),
			entrypoint: z.enum(["grok-imagine", "imagine"]).optional(),
			discoveryAction: z.enum(["grok-imagine-video-mode"]).optional(),
		})
		.parse(raw);
	return WorkbenchCapabilityReportRequestSchema.parse({
		provider: parsed.provider ?? null,
		category: parsed.category ?? null,
		runtimeProfile: parsed.runtimeProfile ?? null,
		includeUnavailable: parsed.includeUnavailable ?? null,
		diagnostics: parsed.diagnostics ?? null,
		entrypoint: parsed.entrypoint === "imagine" ? "grok-imagine" : (parsed.entrypoint ?? null),
		discoveryAction: parsed.discoveryAction ?? null,
	});
}

const CONFIG_SNAPSHOT_EXPORT_REQUEST_SCHEMA = z
	.object({
		all: z.boolean().optional(),
		agents: z.array(z.string().trim().min(1)).optional(),
		teams: z.array(z.string().trim().min(1)).optional(),
	})
	.refine(
		(value) => value.all || (value.agents?.length ?? 0) > 0 || (value.teams?.length ?? 0) > 0,
		"Select at least one agent/team or set all=true.",
	);

function parseConfigSnapshotExportRequest(value: unknown) {
	const parsed = CONFIG_SNAPSHOT_EXPORT_REQUEST_SCHEMA.parse(value);
	return {
		agents: parsed.all ? undefined : parsed.agents,
		teams: parsed.all ? undefined : parsed.teams,
	};
}

const CONFIG_SNAPSHOT_IMPORT_REQUEST_SCHEMA = z.object({
	snapshot: agentRegistrySnapshotSchema,
	dryRun: z.boolean().optional(),
});

function parseConfigSnapshotImportRequest(value: unknown) {
	return CONFIG_SNAPSHOT_IMPORT_REQUEST_SCHEMA.parse(value);
}

const CONFIG_API_KEY_ISSUE_REQUEST_SCHEMA = z
	.object({
		agentId: z.string().trim().min(1).optional(),
		teamId: z.string().trim().min(1).optional(),
		keyId: z.string().trim().min(1).optional(),
		services: z.array(z.string().trim().min(1)).optional(),
		runtimeProfiles: z.array(z.string().trim().min(1)).optional(),
		apiBaseUrl: z.string().trim().min(1).optional(),
		envPath: z.string().trim().min(1).optional(),
		clientEnvPath: z.string().trim().min(1).optional(),
		overwrite: z.boolean().optional(),
	})
	.refine((value) => Boolean(value.agentId || value.teamId), "agentId or teamId is required.");

function parseConfigApiKeyIssueRequest(value: unknown) {
	return CONFIG_API_KEY_ISSUE_REQUEST_SCHEMA.parse(value);
}

const HANDOFF_OPERATOR_REQUEST_SCHEMA = z.object({
	outputDir: z.string().trim().min(1).optional(),
	targetAdapter: z.enum(["packet", "chatgpt-browser"]).optional(),
});

function parseHandoffOperatorRequestBody(value: unknown): {
	outputDir?: string;
	targetAdapter?: "packet" | "chatgpt-browser";
} {
	return HANDOFF_OPERATOR_REQUEST_SCHEMA.parse(value);
}

function resolveHandoffRecoverLiveTargetAdapter(
	targetAdapter: "packet" | "chatgpt-browser" | undefined,
	resolvedUserConfig: ResolvedUserConfig | null,
) {
	const adapterName = targetAdapter ?? "packet";
	if (adapterName === "packet") return null;
	if (!resolvedUserConfig) {
		throw new HttpInvalidRequestError(
			"ChatGPT browser handoff recovery requires a browser-capable AuraCall config.",
		);
	}
	return createChatgptBrowserHandoffTargetAdapter(resolvedUserConfig);
}

function createTeamRunIdSuffix(): string {
	return (
		randomUUID()
			.replace(/[^a-zA-Z0-9_-]/g, "")
			.slice(0, 12) || "run"
	);
}

function parseRunStatusQuery(searchParams: URLSearchParams): ParsedRunStatusQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("diagnostics")) {
		raw.diagnostics = searchParams.get("diagnostics");
	}
	return z
		.object({
			diagnostics: z.enum(["browser-state"]).optional(),
		})
		.parse(raw);
}

function parseAccountMirrorStatusQuery(
	searchParams: URLSearchParams,
): ParsedAccountMirrorStatusQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("provider")) {
		raw.provider = searchParams.get("provider");
	}
	if (searchParams.has("runtimeProfile")) {
		raw.runtimeProfile = searchParams.get("runtimeProfile");
	}
	if (searchParams.has("explicitRefresh")) {
		raw.explicitRefresh = searchParams.get("explicitRefresh");
	}
	if (searchParams.has("ignoreMinimumInterval")) {
		raw.ignoreMinimumInterval = searchParams.get("ignoreMinimumInterval");
	}
	if (searchParams.has("ignore_minimum_interval")) {
		raw.ignoreMinimumInterval = searchParams.get("ignore_minimum_interval");
	}
	if (searchParams.has("ignoreFailureBackoff")) {
		raw.ignoreFailureBackoff = searchParams.get("ignoreFailureBackoff");
	}
	if (searchParams.has("ignore_failure_backoff")) {
		raw.ignoreFailureBackoff = searchParams.get("ignore_failure_backoff");
	}
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			explicitRefresh: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
			ignoreMinimumInterval: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
			ignoreFailureBackoff: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
		})
		.parse(raw);
	return {
		provider: parsed.provider,
		runtimeProfileId: parsed.runtimeProfile,
		explicitRefresh: parsed.explicitRefresh,
		ignoreMinimumInterval: parsed.ignoreMinimumInterval,
		ignoreFailureBackoff: parsed.ignoreFailureBackoff,
	};
}

function parseAccountMirrorCatalogQuery(
	searchParams: URLSearchParams,
): ParsedAccountMirrorCatalogQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("provider")) {
		raw.provider = searchParams.get("provider");
	}
	if (searchParams.has("runtimeProfile")) {
		raw.runtimeProfile = searchParams.get("runtimeProfile");
	}
	if (searchParams.has("kind")) {
		raw.kind = searchParams.get("kind");
	}
	if (searchParams.has("limit")) {
		raw.limit = searchParams.get("limit");
	}
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			kind: z.enum(["all", "projects", "conversations", "artifacts", "files", "media"]).optional(),
			limit: z.coerce.number().int().nonnegative().optional(),
		})
		.parse(raw);
	return {
		provider: parsed.provider,
		runtimeProfileId: parsed.runtimeProfile,
		kind: parsed.kind,
		limit: parsed.limit,
	};
}

function parseRunArchiveQuery(searchParams: URLSearchParams): ParsedRunArchiveQuery {
	const raw: Record<string, unknown> = {};
	for (const key of [
		"kind",
		"provider",
		"runtimeProfile",
		"projectId",
		"agent",
		"team",
		"responseId",
		"batchId",
		"status",
		"fileAvailable",
		"assetAvailability",
		"q",
		"limit",
	]) {
		if (searchParams.has(key)) {
			raw[key] = searchParams.get(key);
		}
	}
	const parsed = z
		.object({
			kind: z
				.enum([
					"all",
					"response",
					"response_batch",
					"team_run",
					"media_generation",
					"upload",
					"generated_artifact",
					"provider_conversation",
					"evidence",
				])
				.optional(),
			provider: z.string().trim().min(1).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			projectId: z.string().trim().min(1).optional(),
			agent: z.string().trim().min(1).optional(),
			team: z.string().trim().min(1).optional(),
			responseId: z.string().trim().min(1).optional(),
			batchId: z.string().trim().min(1).optional(),
			status: z.string().trim().min(1).optional(),
			fileAvailable: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
			assetAvailability: z.enum(["available", "unavailable", "pending"]).optional(),
			q: z.string().trim().min(1).optional(),
			limit: z.coerce.number().int().nonnegative().optional(),
		})
		.parse(raw);
	return {
		kind: parsed.kind,
		provider: parsed.provider,
		runtimeProfile: parsed.runtimeProfile,
		projectId: parsed.projectId,
		agent: parsed.agent,
		team: parsed.team,
		responseId: parsed.responseId,
		batchId: parsed.batchId,
		status: parsed.status,
		fileAvailable: parsed.fileAvailable,
		assetAvailability: parsed.assetAvailability,
		query: parsed.q,
		limit: parsed.limit,
	};
}

function parseSearchProjectionQuery(searchParams: URLSearchParams): SearchProjectionRequest {
	const raw: Record<string, unknown> = {};
	for (const key of [
		"q",
		"provider",
		"runtimeProfile",
		"tenant",
		"kind",
		"status",
		"fileAvailable",
		"assetAvailability",
		"materialization",
		"limit",
		"cursor",
	]) {
		if (searchParams.has(key)) {
			raw[key] = searchParams.get(key);
		}
	}
	const parsed = z
		.object({
			q: z.string().trim().min(1).optional(),
			provider: z.string().trim().min(1).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			tenant: z.string().trim().min(1).optional(),
			kind: z.string().trim().min(1).optional(),
			status: z.string().trim().min(1).optional(),
			fileAvailable: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
			assetAvailability: z.enum(["available", "unavailable", "pending"]).optional(),
			materialization: z
				.enum([
					"active",
					"terminal",
					"queued",
					"running",
					"succeeded",
					"skipped",
					"failed",
					"cancelled",
				])
				.optional(),
			limit: z.coerce.number().int().positive().max(500).optional(),
			cursor: z.string().trim().min(1).optional(),
		})
		.parse(raw);
	return {
		query: parsed.q,
		provider: parsed.provider,
		runtimeProfile: parsed.runtimeProfile,
		tenant: parsed.tenant,
		kind: parsed.kind,
		status: parsed.status,
		fileAvailable: parsed.fileAvailable,
		assetAvailability: parsed.assetAvailability,
		materialization: parsed.materialization,
		limit: parsed.limit,
		cursor: parsed.cursor,
	};
}

function parseAccountMirrorArtifactRecoveryPlanQuery(
	searchParams: URLSearchParams,
): AccountMirrorArtifactRecoveryPlanRequest {
	const raw: Record<string, unknown> = {};
	for (const key of [
		"provider",
		"runtimeProfile",
		"runtimeProfileId",
		"tenant",
		"tenantKey",
		"status",
		"action",
		"includeSearchRows",
		"limit",
	]) {
		if (searchParams.has(key)) {
			raw[key] = searchParams.get(key);
		}
	}
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			runtimeProfileId: z.string().trim().min(1).optional(),
			tenant: z.string().trim().min(1).optional(),
			tenantKey: z.string().trim().min(1).optional(),
			status: z
				.enum([
					"eligible",
					"needs_detail_refresh",
					"deferred",
					"blocked",
					"unsupported",
					"terminal",
				])
				.optional(),
			action: z
				.enum([
					"queue_history_materialization",
					"refresh_detail_inventory",
					"start_materialization_policy_completion",
					"inspect_archive_materialization",
					"none",
				])
				.optional(),
			includeSearchRows: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
			limit: z.coerce.number().int().min(0).max(500).optional(),
		})
		.parse(raw);
	return {
		provider: parsed.provider,
		runtimeProfileId: parsed.runtimeProfileId ?? parsed.runtimeProfile,
		tenantKey: parsed.tenantKey ?? parsed.tenant,
		status: parsed.status,
		action: parsed.action,
		includeSearchRows: parsed.includeSearchRows,
		limit: parsed.limit,
	};
}

function parseOptionalBoolean(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const normalized = value.trim().toLowerCase();
	if (["true", "1", "yes"].includes(normalized)) return true;
	if (["false", "0", "no"].includes(normalized)) return false;
	return value;
}

function parseRunArchiveAssetLookupQuery(searchParams: URLSearchParams) {
	const raw: Record<string, unknown> = {};
	for (const key of ["checksumSha256", "cacheKey", "providerArtifactId", "artifactId", "limit"]) {
		if (searchParams.has(key)) {
			raw[key] = searchParams.get(key);
		}
	}
	const parsed = z
		.object({
			checksumSha256: z.string().trim().min(1).optional(),
			cacheKey: z.string().trim().min(1).optional(),
			providerArtifactId: z.string().trim().min(1).optional(),
			artifactId: z.string().trim().min(1).optional(),
			limit: z.coerce.number().int().min(0).max(500).optional(),
		})
		.parse(raw);
	if (
		!parsed.checksumSha256 &&
		!parsed.cacheKey &&
		!parsed.providerArtifactId &&
		!parsed.artifactId
	) {
		throw new Error("At least one archive asset lookup key is required.");
	}
	return parsed;
}

function parseRunArchiveEvidenceCreateBody(value: unknown) {
	return z
		.object({
			id: z.string().trim().min(1).optional(),
			producer: z.string().trim().min(1),
			schema: z.string().trim().min(1),
			status: z.enum(["pass", "fail", "warning", "info", "unknown"]).optional(),
			title: z.string().trim().min(1).optional(),
			summary: z.string().trim().min(1).optional(),
			responseId: z.string().trim().min(1).optional(),
			batchId: z.string().trim().min(1).optional(),
			archiveItemId: z.string().trim().min(1).optional(),
			providerConversationId: z.string().trim().min(1).optional(),
			data: z.unknown().optional(),
			metadata: z.record(z.string(), z.unknown()).optional(),
		})
		.parse(value);
}

function parseRunArchiveMaterializationCreateBody(value: unknown) {
	const parsed = z
		.object({
			archiveItemId: z.string().trim().min(1).optional(),
			archive_item_id: z.string().trim().min(1).optional(),
			force: z.boolean().optional(),
		})
		.parse(value);
	const archiveItemId = parsed.archiveItemId ?? parsed.archive_item_id;
	if (!archiveItemId) {
		throw new ArchiveMaterializationError("Archive item id is required.");
	}
	return { archiveItemId, force: parsed.force ?? false };
}

function parseRunArchiveItemMaterializeBody(value: unknown) {
	const parsed = z
		.object({
			force: z.boolean().optional(),
		})
		.parse(value);
	return { force: parsed.force ?? false };
}

function parseRunArchiveMaterializationJobListQuery(searchParams: URLSearchParams) {
	const raw: Record<string, unknown> = {};
	for (const key of ["status", "archiveItemId", "limit"]) {
		if (searchParams.has(key)) {
			raw[key] = searchParams.get(key);
		}
	}
	return z
		.object({
			status: z
				.enum([
					"queued",
					"running",
					"succeeded",
					"skipped",
					"failed",
					"cancelled",
					"active",
					"terminal",
				])
				.optional(),
			archiveItemId: z.string().trim().min(1).optional(),
			limit: z.coerce.number().int().min(0).max(500).optional(),
		})
		.parse(raw);
}

function parseRunArchiveMaterializationJobControlBody(value: unknown) {
	return z
		.object({
			action: z.enum(["cancel"]),
		})
		.parse(value);
}

function parseHistoryMaterializationCreateBody(value: unknown) {
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			runtime_profile: z.string().trim().min(1).optional(),
			browserProfile: z.string().trim().min(1).optional(),
			browser_profile: z.string().trim().min(1).optional(),
			boundIdentityKey: z.string().trim().min(1).optional(),
			bound_identity_key: z.string().trim().min(1).optional(),
			conversationId: z.string().trim().min(1).optional(),
			conversation_id: z.string().trim().min(1).optional(),
			conversationIds: z.array(z.string().trim().min(1)).optional(),
			conversation_ids: z.array(z.string().trim().min(1)).optional(),
			providerConversationUrl: z.string().trim().min(1).optional(),
			provider_conversation_url: z.string().trim().min(1).optional(),
			projectId: z.string().trim().min(1).optional(),
			project_id: z.string().trim().min(1).optional(),
			catalogItemId: z.string().trim().min(1).optional(),
			catalog_item_id: z.string().trim().min(1).optional(),
			catalogKind: z
				.enum(["all", "projects", "conversations", "artifacts", "files", "media"])
				.optional(),
			catalog_kind: z
				.enum(["all", "projects", "conversations", "artifacts", "files", "media"])
				.optional(),
			archiveItemId: z.string().trim().min(1).optional(),
			archive_item_id: z.string().trim().min(1).optional(),
			reconcile: z.boolean().optional(),
			assetSource: z.enum(["account-library"]).optional(),
			asset_source: z.enum(["account-library"]).optional(),
			refreshSnapshot: z.boolean().optional(),
			refresh_snapshot: z.boolean().optional(),
			reconcileSnapshot: z.boolean().optional(),
			reconcile_snapshot: z.boolean().optional(),
			assetKinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
			asset_kinds: z.array(z.enum(["artifacts", "files", "media", "all"])).optional(),
			maxItems: z.number().int().nonnegative().max(500).optional(),
			max_items: z.number().int().nonnegative().max(500).optional(),
			providerWorkTimeoutMs: z.number().int().positive().optional(),
			provider_work_timeout_ms: z.number().int().positive().optional(),
			force: z.boolean().optional(),
		})
		.parse(value);
	return {
		provider: parsed.provider,
		runtimeProfile: parsed.runtimeProfile ?? parsed.runtime_profile,
		browserProfile: parsed.browserProfile ?? parsed.browser_profile,
		boundIdentityKey: parsed.boundIdentityKey ?? parsed.bound_identity_key,
		conversationId: parsed.conversationId ?? parsed.conversation_id,
		conversationIds: parsed.conversationIds ?? parsed.conversation_ids,
		providerConversationUrl: parsed.providerConversationUrl ?? parsed.provider_conversation_url,
		projectId: parsed.projectId ?? parsed.project_id,
		catalogItemId: parsed.catalogItemId ?? parsed.catalog_item_id,
		catalogKind: parsed.catalogKind ?? parsed.catalog_kind,
		archiveItemId: parsed.archiveItemId ?? parsed.archive_item_id,
		reconcile: parsed.reconcile ?? false,
		assetSource: parsed.assetSource ?? parsed.asset_source,
		refreshSnapshot:
			parsed.refreshSnapshot ??
			parsed.refresh_snapshot ??
			parsed.reconcileSnapshot ??
			parsed.reconcile_snapshot ??
			false,
		assetKinds: parsed.assetKinds ?? parsed.asset_kinds,
		maxItems: parsed.maxItems ?? parsed.max_items,
		providerWorkTimeoutMs: parsed.providerWorkTimeoutMs ?? parsed.provider_work_timeout_ms,
		force: parsed.force ?? false,
	};
}

function parseHistoryMaterializationJobListQuery(searchParams: URLSearchParams) {
	const raw: Record<string, unknown> = {};
	for (const key of ["status", "provider", "runtimeProfile", "sourceType", "limit"]) {
		if (searchParams.has(key)) raw[key] = searchParams.get(key);
	}
	return z
		.object({
			status: z
				.enum([
					"queued",
					"running",
					"succeeded",
					"skipped",
					"failed",
					"cancelled",
					"active",
					"terminal",
				])
				.optional(),
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			sourceType: z
				.enum([
					"conversation",
					"project_sources",
					"catalog_item",
					"archive_item",
					"reconciliation",
					"account_library_reconciliation",
				])
				.optional(),
			limit: z.coerce.number().int().min(0).max(500).optional(),
		})
		.parse(raw);
}

function parseHistoryMaterializationJobControlBody(value: unknown) {
	return z
		.object({
			action: z.enum(["cancel"]),
		})
		.parse(value);
}

function parseDomDriftObservationQuery(
	searchParams: URLSearchParams,
): ParsedDomDriftObservationQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("service")) {
		raw.service = searchParams.get("service");
	}
	if (searchParams.has("surface")) {
		raw.surface = searchParams.get("surface");
	}
	if (searchParams.has("status")) {
		raw.status = searchParams.get("status");
	}
	if (searchParams.has("limit")) {
		raw.limit = searchParams.get("limit");
	}
	return z
		.object({
			service: z.string().trim().min(1).optional(),
			surface: z.string().trim().min(1).optional(),
			status: z.enum(["observed", "accepted", "rejected"]).optional(),
			limit: z.coerce.number().int().nonnegative().max(500).optional(),
		})
		.parse(raw);
}

function parseAccountMirrorCatalogItemQuery(
	pathname: string,
	searchParams: URLSearchParams,
): ParsedAccountMirrorCatalogItemQuery {
	const prefix = "/v1/account-mirrors/catalog/items/";
	const encodedItemId = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
	const itemId = decodeURIComponent(encodedItemId).trim();
	if (!itemId) {
		throw new Error("Account mirror catalog item id is required.");
	}
	return {
		...parseAccountMirrorCatalogQuery(searchParams),
		itemId,
	};
}

function isAccountMirrorCatalogItemAssetRoute(pathname: string): boolean {
	return pathname.startsWith("/v1/account-mirrors/catalog/items/") && pathname.endsWith("/asset");
}

function isRunArchiveItemAssetRoute(pathname: string): boolean {
	return pathname.startsWith("/v1/archive/items/") && pathname.endsWith("/asset");
}

function isRunArchiveMaterializationJobRoute(pathname: string): boolean {
	return pathname.startsWith("/v1/archive/materializations/");
}

function isHistoryMaterializationJobRoute(pathname: string): boolean {
	return pathname.startsWith("/v1/account-mirrors/materializations/");
}

function parseRunArchiveMaterializationJobId(pathname: string): string {
	const prefix = "/v1/archive/materializations/";
	const jobId = decodeURIComponent(
		pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "",
	).trim();
	if (!jobId) {
		throw new Error("Archive materialization job id is required.");
	}
	return jobId;
}

function parseHistoryMaterializationJobId(pathname: string): string {
	const prefix = "/v1/account-mirrors/materializations/";
	const jobId = decodeURIComponent(
		pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "",
	).trim();
	if (!jobId) {
		throw new Error("History materialization job id is required.");
	}
	return jobId;
}

function isRunArchiveItemMaterializeRoute(pathname: string): boolean {
	return pathname.startsWith("/v1/archive/items/") && pathname.endsWith("/materialize");
}

function parseRunArchiveItemAssetId(pathname: string): string {
	const prefix = "/v1/archive/items/";
	const suffix = "/asset";
	const encodedItemId =
		pathname.startsWith(prefix) && pathname.endsWith(suffix)
			? pathname.slice(prefix.length, -suffix.length)
			: "";
	const itemId = decodeRunArchiveItemPathSegment(encodedItemId).trim();
	if (!itemId) {
		throw new Error("Run archive item id is required.");
	}
	return itemId;
}

function parseRunArchiveItemMaterializeId(pathname: string): string {
	const prefix = "/v1/archive/items/";
	const suffix = "/materialize";
	const encodedItemId =
		pathname.startsWith(prefix) && pathname.endsWith(suffix)
			? pathname.slice(prefix.length, -suffix.length)
			: "";
	const itemId = decodeRunArchiveItemPathSegment(encodedItemId).trim();
	if (!itemId) {
		throw new Error("Run archive item id is required.");
	}
	return itemId;
}

function isProviderAuthPreflightError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("browser auth preflight failed") ||
		message.includes("account_session_drift") ||
		message.includes("expected_identity_missing")
	);
}

function parseRunArchiveItemId(pathname: string): string {
	const prefix = "/v1/archive/items/";
	const encodedItemId = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
	const itemId = decodeRunArchiveItemPathSegment(encodedItemId).trim();
	if (!itemId) {
		throw new Error("Run archive item id is required.");
	}
	return itemId;
}

function decodeRunArchiveItemPathSegment(encodedItemId: string): string {
	if (encodedItemId.startsWith("b64/")) {
		return Buffer.from(encodedItemId.slice("b64/".length), "base64url").toString("utf8");
	}
	return decodeURIComponent(encodedItemId);
}

function parseAccountMirrorCatalogItemAssetQuery(
	pathname: string,
	searchParams: URLSearchParams,
): ParsedAccountMirrorCatalogItemQuery {
	const prefix = "/v1/account-mirrors/catalog/items/";
	const suffix = "/asset";
	const encodedItemId =
		pathname.startsWith(prefix) && pathname.endsWith(suffix)
			? pathname.slice(prefix.length, -suffix.length)
			: "";
	const itemId = decodeURIComponent(encodedItemId).trim();
	if (!itemId) {
		throw new Error("Account mirror catalog item id is required.");
	}
	return {
		...parseAccountMirrorCatalogQuery(searchParams),
		itemId,
	};
}

function parseAccountMirrorCompletionListQuery(
	searchParams: URLSearchParams,
): ParsedAccountMirrorCompletionListQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("provider")) {
		raw.provider = searchParams.get("provider");
	}
	if (searchParams.has("runtimeProfile")) {
		raw.runtimeProfile = searchParams.get("runtimeProfile");
	}
	if (searchParams.has("status")) {
		raw.status = searchParams.get("status");
	}
	if (searchParams.has("activeOnly")) {
		raw.activeOnly = searchParams.get("activeOnly");
	}
	if (searchParams.has("limit")) {
		raw.limit = searchParams.get("limit");
	}
	const parsed = z
		.object({
			provider: z.enum(["chatgpt", "gemini", "grok"]).optional(),
			runtimeProfile: z.string().trim().min(1).optional(),
			status: z
				.enum([
					"active",
					"queued",
					"running",
					"idle_waiting",
					"paused",
					"completed",
					"blocked",
					"failed",
					"cancelled",
				])
				.optional(),
			activeOnly: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
			limit: z.coerce.number().int().positive().optional(),
		})
		.parse(raw);
	return {
		provider: parsed.provider,
		runtimeProfileId: parsed.runtimeProfile,
		status: parsed.status,
		activeOnly: parsed.activeOnly,
		limit: parsed.limit,
	};
}

function parseAccountMirrorReconciliationListQuery(
	searchParams: URLSearchParams,
): ParsedAccountMirrorReconciliationListQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("status")) {
		raw.status = searchParams.get("status");
	}
	if (searchParams.has("limit")) {
		raw.limit = searchParams.get("limit");
	}
	const parsed = z
		.object({
			status: z
				.enum([
					"active",
					"planned",
					"queued",
					"running",
					"idle_waiting",
					"paused",
					"blocked",
					"completed",
					"completed_with_skips",
					"cancelled",
					"failed",
				])
				.optional(),
			limit: z.coerce.number().int().positive().optional(),
		})
		.parse(raw);
	return {
		status: parsed.status,
		limit: parsed.limit,
	};
}

function parsePositiveIntegerQuery(value: string | null): number | null {
	if (value === null) {
		return null;
	}
	return z.coerce.number().int().positive().parse(value);
}

function parseMediaGenerationCreateQuery(
	searchParams: URLSearchParams,
): ParsedMediaGenerationCreateQuery {
	const raw: Record<string, unknown> = {};
	if (searchParams.has("wait")) {
		raw.wait = searchParams.get("wait");
	}
	return z
		.object({
			wait: z
				.enum(["0", "1", "true", "false"])
				.transform((value) => value === "1" || value.toLowerCase() === "true")
				.optional(),
		})
		.parse(raw);
}

function resolveMediaGenerationWait(
	query: ParsedMediaGenerationCreateQuery,
	body: { wait?: unknown },
): boolean {
	if (typeof query.wait === "boolean") return query.wait;
	if (typeof body.wait === "boolean") return body.wait;
	if (typeof body.wait === "string") {
		const normalized = body.wait.trim().toLowerCase();
		if (normalized === "false" || normalized === "0") return false;
		if (normalized === "true" || normalized === "1") return true;
	}
	return true;
}

function parseMediaGenerationMaterializeBody(value: unknown) {
	const parsed = z
		.object({
			count: z.number().int().min(1).max(8).optional(),
			compareFullQuality: z.boolean().optional(),
			compare_full_quality: z.boolean().optional(),
			metadata: z.record(z.string(), z.unknown()).nullable().optional(),
		})
		.parse(value);
	return {
		count: parsed.count,
		compareFullQuality: parsed.compareFullQuality ?? parsed.compare_full_quality,
		metadata: parsed.metadata,
	};
}

function mediaGenerationExecutionErrorStatus(error: MediaGenerationExecutionError): number {
	if (error.code === "media_generation_not_found") return 404;
	if (error.code === "media_materializer_not_implemented") return 501;
	if (error.code === "browser_operation_busy") return 409;
	return 502;
}

async function readRunStatusBrowserDiagnostics(input: {
	status: AuraCallRunStatus;
	responsesService: ReturnType<typeof createExecutionResponsesService>;
	mediaGenerationService: ReturnType<typeof createMediaGenerationService>;
	probeRuntimeRunBrowserDiagnostics: ResponsesHttpServerDeps["probeRuntimeRunBrowserDiagnostics"];
	probeMediaGenerationBrowserDiagnostics: typeof probeMediaGenerationBrowserDiagnostics;
	control: ExecutionRuntimeControlContract;
	runnersControl: ExecutionRunnerControlContract;
	createRunAffinity: InspectRuntimeRunInput["createRunAffinity"];
}): Promise<RuntimeRunInspectionBrowserDiagnosticsSummary> {
	if (input.status.kind === "response") {
		const inspection = await inspectRuntimeRun({
			runId: input.status.id,
			includeBrowserDiagnostics: true,
			probeBrowserDiagnostics: input.probeRuntimeRunBrowserDiagnostics,
			control: input.control,
			runnersControl: input.runnersControl,
			createRunAffinity: input.createRunAffinity,
		});
		return (
			inspection.browserDiagnostics ??
			createUnavailableRunStatusBrowserDiagnostics(
				`runtime run ${input.status.id} did not return browser diagnostics`,
			)
		);
	}

	const mediaGeneration = await input.mediaGenerationService.readGeneration(input.status.id);
	if (!mediaGeneration) {
		return createUnavailableRunStatusBrowserDiagnostics(
			`media generation ${input.status.id} was not found`,
		);
	}
	return input.probeMediaGenerationBrowserDiagnostics(mediaGeneration);
}

function createUnavailableRunStatusBrowserDiagnostics(
	reason: string,
): NonNullable<RuntimeRunInspectionPayload["browserDiagnostics"]> {
	return {
		probeStatus: "unavailable",
		service: null,
		ownerStepId: null,
		observedAt: null,
		source: null,
		reason,
		target: null,
		document: null,
		visibleCounts: null,
		providerEvidence: null,
		screenshot: null,
	};
}

function createTeamRunCreateLinks(input: {
	host: string;
	port: number;
	teamRunId: string;
	runtimeRunId: string;
}): HttpTeamRunCreateResponse["links"] {
	const baseUrl = `http://${localProbeHost(input.host)}:${input.port}`;
	return {
		teamInspection: `${baseUrl}/v1/team-runs/inspect?teamRunId=${encodeURIComponent(input.teamRunId)}`,
		runtimeInspection: `${baseUrl}/v1/runtime-runs/inspect?runtimeRunId=${encodeURIComponent(input.runtimeRunId)}`,
		responseReadback: `${baseUrl}/v1/responses/${encodeURIComponent(input.runtimeRunId)}`,
	};
}

function localProbeHost(host: string): string {
	return isLoopbackHost(host) ? host : "127.0.0.1";
}

function buildApiServiceDiscovery(input: {
	host: string;
	port: number;
	dashboardUrl?: string;
	publicDashboardUrl?: string;
	serviceRouting?: ApiServiceRoutingConfig;
}): ApiServiceDiscovery {
	const routing = input.serviceRouting ?? {};
	const {
		consolePath,
		dashboardPath,
		debugDashboardPath,
		accountMirrorPath,
		previewSessionPath,
		configPath,
		agentsPath,
	} = resolveOperatorDashboardRoutes(routing);
	const bindBaseUrl = formatApiBaseUrl(input.host, input.port);
	const localBaseUrl =
		normalizeBaseUrl(routing.localBaseUrl) ??
		normalizeBaseUrl(baseUrlFromUrl(input.dashboardUrl)) ??
		bindBaseUrl;
	const externalBaseUrl =
		normalizeBaseUrl(routing.externalBaseUrl) ??
		normalizeBaseUrl(baseUrlFromUrl(input.publicDashboardUrl));
	const localDashboardUrl =
		normalizeUrl(input.dashboardUrl) ?? joinBaseUrlPath(localBaseUrl, dashboardPath);
	const externalDashboardUrl =
		normalizeUrl(input.publicDashboardUrl) ??
		(externalBaseUrl ? joinBaseUrlPath(externalBaseUrl, dashboardPath) : undefined);
	return {
		bind: {
			host: input.host,
			port: input.port,
			url: bindBaseUrl,
			localOnly: isLoopbackHost(input.host),
		},
		local: {
			...(routing.localHostname ? { hostname: routing.localHostname } : {}),
			baseUrl: localBaseUrl,
			dashboardUrl: localDashboardUrl,
			accountMirrorUrl: joinBaseUrlPath(localBaseUrl, accountMirrorPath),
		},
		...(externalBaseUrl
			? {
					external: {
						...(routing.externalHostname ? { hostname: routing.externalHostname } : {}),
						baseUrl: externalBaseUrl,
						dashboardUrl: externalDashboardUrl ?? joinBaseUrlPath(externalBaseUrl, dashboardPath),
						accountMirrorUrl: joinBaseUrlPath(externalBaseUrl, accountMirrorPath),
					},
				}
			: {}),
		routing: {
			consolePath,
			dashboardPath,
			debugDashboardPath,
			accountMirrorPath,
			previewSessionPath,
			configPath,
			agentsPath,
			...(routing.proxyTarget ? { proxyTarget: routing.proxyTarget } : {}),
			...(routing.auth ? { auth: routing.auth } : {}),
			...(routing.ingress ? { ingress: routing.ingress } : {}),
		},
	};
}

function resolveOperatorDashboardRoutes(
	serviceRouting: ApiServiceRoutingConfig | undefined,
): OperatorDashboardRoutes {
	const consolePath = normalizeRoutePath(serviceRouting?.consolePath) ?? "/console";
	const dashboardPath = normalizeRoutePath(serviceRouting?.dashboardPath) ?? "/dashboard";
	const debugDashboardPath =
		normalizeRoutePath(serviceRouting?.debugDashboardPath) ?? "/ops/browser";
	const accountMirrorPath =
		normalizeRoutePath(serviceRouting?.accountMirrorPath) ?? "/account-mirror";
	return {
		consolePath,
		dashboardPath,
		debugDashboardPath,
		accountMirrorPath,
		previewSessionPath: joinRoutePath(accountMirrorPath, "preview-session"),
		configPath: "/config",
		agentsPath: "/agents",
	};
}

function joinRoutePath(basePath: string, childPath: string): string {
	const normalizedBase = normalizeRoutePath(basePath) ?? "/";
	const normalizedChild = childPath.replace(/^\/+/, "").replace(/\/+$/, "");
	return `${normalizedBase.replace(/\/+$/, "")}/${normalizedChild}`;
}

function matchesRoutePath(pathname: string, ...paths: string[]): boolean {
	return paths.some((path) => pathname === path);
}

function formatApiBaseUrl(host: string, port: number): string {
	const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
	return `http://${normalizedHost}:${String(port)}`;
}

function normalizeRoutePath(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
	const normalized = normalizeUrl(value);
	if (!normalized) return null;
	return normalized.replace(/\/+$/, "");
}

function normalizeUrl(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		return new URL(trimmed).href.replace(/\/+$/, "");
	} catch {
		return null;
	}
}

function baseUrlFromUrl(value: string | undefined): string | null {
	const normalized = normalizeUrl(value);
	if (!normalized) return null;
	const parsed = new URL(normalized);
	return parsed.origin;
}

function joinBaseUrlPath(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, "")}${normalizeRoutePath(path) ?? "/"}`;
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function mergeExecutionRequestHints(
	request: ExecutionRequest,
	headers: http.IncomingHttpHeaders,
): ExecutionRequest {
	const headerHints = extractExecutionRequestHintsFromHeaders(headers);
	if (
		!headerHints.runtimeProfile &&
		!headerHints.agent &&
		!headerHints.team &&
		!headerHints.service
	) {
		return request;
	}

	return {
		...request,
		auracall: {
			...(request.auracall ?? {}),
			...headerHints,
		},
	};
}

function extractExecutionRequestHintsFromHeaders(
	headers: http.IncomingHttpHeaders,
): ExecutionRequestExtensionHints {
	return {
		runtimeProfile: readSingleHeader(headers["x-auracall-runtime-profile"]),
		agent: readSingleHeader(headers["x-auracall-agent"]),
		team: readSingleHeader(headers["x-auracall-team"]),
		service: readSingleHeader(headers["x-auracall-service"]),
	};
}

function readSingleHeader(value: string | string[] | undefined): string | null {
	if (Array.isArray(value)) return value[0] ?? null;
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asResolvedUserConfig(
	value: Record<string, unknown> | undefined,
): ResolvedUserConfig | null {
	if (!value || typeof value.model !== "string") {
		return null;
	}
	const browser = value.browser;
	if (!browser || typeof browser !== "object" || Array.isArray(browser)) {
		return null;
	}
	return value as ResolvedUserConfig;
}

function isLoopbackHost(host: string): boolean {
	const normalized = host.trim().toLowerCase();
	return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function matchResponseRoute(pathname: string): string | null {
	const match = /^\/v1\/responses\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchResponseBatchRoute(pathname: string): string | null {
	const match = /^\/v1\/response-batches\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchHandoffOperatorRoute(
	pathname: string,
): { id: string; action: "status" | "resume" | "repair" | "export" | "recover-live" } | null {
	const match = /^\/v1\/handoffs\/([^/]+)\/(status|resume|repair|export|recover-live)$/.exec(
		pathname,
	);
	if (!match?.[1] || !match[2]) return null;
	return {
		id: decodeURIComponent(match[1]),
		action: match[2] as "status" | "resume" | "repair" | "export" | "recover-live",
	};
}

function matchConfigEntityRoute(pathname: string, kind: "agents" | "teams"): string | null {
	const match = new RegExp(`^/v1/config/${kind}/([^/]+)$`).exec(pathname);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function matchConfigApiKeyRoute(pathname: string): string | null {
	const match = /^\/v1\/config\/api-keys\/([^/]+)$/.exec(pathname);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function matchMediaGenerationRoute(pathname: string): string | null {
	const match = /^\/v1\/media-generations\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchMediaGenerationMaterializeRoute(pathname: string): string | null {
	const match = /^\/v1\/media-generations\/([^/]+)\/materialize$/.exec(pathname);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function matchMediaGenerationStatusRoute(pathname: string): string | null {
	const match = /^\/v1\/media-generations\/([^/]+)\/status$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchRunStatusRoute(pathname: string): string | null {
	const match = /^\/v1\/runs\/([^/]+)\/status$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchTerminalSessionReceiptRoute(pathname: string): string | null {
	const match = /^\/v1\/terminal-receipts\/([^/]+)$/.exec(pathname);
	if (!match?.[1]) return null;
	try {
		const sessionId = decodeURIComponent(match[1]);
		return /^[a-z0-9][a-z0-9-]{0,127}$/.test(sessionId) ? sessionId : null;
	} catch {
		return null;
	}
}

function matchDomDriftObservationAcceptRoute(pathname: string): string | null {
	const match = /^\/v1\/browser\/dom-drift-observations\/([^/]+)\/accept$/.exec(pathname);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function matchAccountMirrorCompletionRoute(pathname: string): string | null {
	const match = /^\/v1\/account-mirrors\/completions\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchAccountMirrorReconciliationRoute(pathname: string): string | null {
	const match = /^\/v1\/account-mirrors\/reconciliations\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchAccountMirrorPreviewSessionRoute(pathname: string): string | null {
	const match = /^\/v1\/account-mirrors\/preview-sessions\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchPreflightRunLogRoute(pathname: string): string | null {
	const match = /^\/v1\/preflight\/lazy-live-follow\/runs\/([^/]+)\/log$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchPreflightRunRoute(pathname: string): string | null {
	const match = /^\/v1\/preflight\/lazy-live-follow\/runs\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

function matchStatusRecoveryDetailRoute(pathname: string): string | null {
	const match = /^\/status\/recovery\/([^/]+)$/.exec(pathname);
	return match?.[1] ?? null;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
	res: http.ServerResponse,
	statusCode: number,
	payload: unknown,
	headers: http.OutgoingHttpHeaders = {},
): void {
	res.writeHead(statusCode, { "Content-Type": "application/json", ...headers });
	res.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
	res.writeHead(statusCode, {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(html);
}

async function maybeSendOperatorUxAsset(
	res: http.ServerResponse,
	pathname: string,
	routes: OperatorDashboardRoutes,
	headOnly = false,
): Promise<boolean> {
	const dashboardPath = routes.dashboardPath;
	if (!matchesDashboardAssetPath(pathname, dashboardPath)) {
		return false;
	}

	const assetPath = resolveDashboardAssetPath(pathname, dashboardPath);
	const distDir = await findOperatorUxDistDir();
	if (!distDir) {
		if (assetPath === "index.html") {
			sendHtml(res, 200, createMissingOperatorUxHtml());
			return true;
		}
		sendJson(res, 404, {
			error: {
				message: "AuraCall operator UX build assets are not available. Run pnpm run ux:build.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	const assetFile = path.resolve(distDir, assetPath);
	const relative = path.relative(distDir, assetFile);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		sendJson(res, 404, {
			error: {
				message: "Operator UX asset path is invalid.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(assetFile);
	} catch {
		sendJson(res, 404, {
			error: {
				message: "Operator UX asset was not found.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}
	if (!stat.isFile()) {
		sendJson(res, 404, {
			error: {
				message: "Operator UX asset was not found.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	res.writeHead(200, {
		"Content-Type": getStaticContentType(assetFile),
		"Content-Length": String(stat.size),
		"Cache-Control":
			assetPath === "index.html" ? "no-store" : "public, max-age=31536000, immutable",
		"X-Content-Type-Options": "nosniff",
	});
	if (headOnly) {
		res.end();
		return true;
	}
	createReadStream(assetFile)
		.on("error", () => {
			if (!res.headersSent) {
				sendJson(res, 404, {
					error: {
						message: "Operator UX asset could not be read.",
						type: "not_found_error",
					},
				} satisfies HttpErrorPayload);
				return;
			}
			res.destroy();
		})
		.pipe(res);
	return true;
}

async function maybeSendConsoleUxAsset(
	res: http.ServerResponse,
	pathname: string,
	routes: OperatorDashboardRoutes,
	headOnly = false,
): Promise<boolean> {
	const consolePath = routes.consolePath;
	if (!matchesConsoleAssetPath(pathname, consolePath)) {
		return false;
	}

	const assetPath = resolveConsoleAssetPath(pathname, consolePath);
	const distDir = await findConsoleUxDistDir();
	if (!distDir) {
		if (assetPath === "index.html") {
			sendHtml(res, 200, createMissingConsoleUxHtml());
			return true;
		}
		sendJson(res, 404, {
			error: {
				message: "AuraCall console build assets are not available. Run pnpm run console:build.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	const assetFile = path.resolve(distDir, assetPath);
	const relative = path.relative(distDir, assetFile);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		sendJson(res, 404, {
			error: {
				message: "AuraCall console asset path is invalid.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(assetFile);
	} catch {
		sendJson(res, 404, {
			error: {
				message: "AuraCall console asset was not found.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}
	if (!stat.isFile()) {
		sendJson(res, 404, {
			error: {
				message: "AuraCall console asset was not found.",
				type: "not_found_error",
			},
		} satisfies HttpErrorPayload);
		return true;
	}

	res.writeHead(200, {
		"Content-Type": getStaticContentType(assetFile),
		"Content-Length": String(stat.size),
		"Cache-Control":
			assetPath === "index.html" ? "no-store" : "public, max-age=31536000, immutable",
		"X-Content-Type-Options": "nosniff",
	});
	if (headOnly) {
		res.end();
		return true;
	}
	createReadStream(assetFile)
		.on("error", () => {
			if (!res.headersSent) {
				sendJson(res, 404, {
					error: {
						message: "AuraCall console asset could not be read.",
						type: "not_found_error",
					},
				} satisfies HttpErrorPayload);
				return;
			}
			res.destroy();
		})
		.pipe(res);
	return true;
}

function matchesDashboardAssetPath(pathname: string, dashboardPath: string): boolean {
	return (
		pathname === dashboardPath ||
		pathname === `${dashboardPath}/` ||
		pathname.startsWith(`${dashboardPath}/assets/`)
	);
}

function resolveDashboardAssetPath(pathname: string, dashboardPath: string): string {
	if (pathname === dashboardPath || pathname === `${dashboardPath}/`) {
		return "index.html";
	}
	return decodeURIComponent(pathname.slice(`${dashboardPath}/`.length));
}

function matchesConsoleAssetPath(pathname: string, consolePath: string): boolean {
	return (
		pathname === consolePath ||
		pathname === `${consolePath}/` ||
		pathname.startsWith(`${consolePath}/assets/`)
	);
}

function resolveConsoleAssetPath(pathname: string, consolePath: string): string {
	if (pathname === consolePath || pathname === `${consolePath}/`) {
		return "index.html";
	}
	return decodeURIComponent(pathname.slice(`${consolePath}/`.length));
}

async function findOperatorUxDistDir(): Promise<string | null> {
	const moduleDir = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.resolve(moduleDir, "../../operator-ux"),
		path.resolve(process.cwd(), "dist/operator-ux"),
	];
	for (const candidate of candidates) {
		try {
			const stat = await fs.stat(path.join(candidate, "index.html"));
			if (stat.isFile()) return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

async function findConsoleUxDistDir(): Promise<string | null> {
	const moduleDir = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.resolve(moduleDir, "../../console-ux"),
		path.resolve(process.cwd(), "dist/console-ux"),
	];
	for (const candidate of candidates) {
		try {
			const stat = await fs.stat(path.join(candidate, "index.html"));
			if (stat.isFile()) return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

function getStaticContentType(filePath: string): string {
	switch (path.extname(filePath).toLowerCase()) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".webp":
			return "image/webp";
		case ".ico":
			return "image/x-icon";
		default:
			return "application/octet-stream";
	}
}

function createMissingOperatorUxHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AuraCall Operator</title>
</head>
<body>
  <div id="root">
    <h1>AuraCall Operator</h1>
    <p>The React operator UX build assets are not available in this runtime. Run <code>pnpm run ux:build</code> and restart the API service.</p>
    <p><a href="/ops/browser">Open Browser Ops debug dashboard</a></p>
  </div>
</body>
</html>`;
}

function createMissingConsoleUxHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AuraCall Console</title>
</head>
<body>
  <div id="root">
    <h1>AuraCall Console</h1>
    <p>The greenfield console build assets are not available in this runtime. Run <code>pnpm run console:build</code> and restart the API service.</p>
    <p><a href="/ops/browser">Open legacy diagnostics</a></p>
  </div>
</body>
</html>`;
}

function sendCachedAsset(res: http.ServerResponse, asset: CachedCatalogItemAsset): void {
	const headers: Record<string, string> = {
		"Content-Type": asset.mimeType,
		"Content-Length": String(asset.size),
		"Cache-Control": "private, max-age=300",
		"X-Content-Type-Options": "nosniff",
	};
	const fileName = sanitizeContentDispositionFilename(asset.fileName);
	if (fileName) {
		headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
	}
	res.writeHead(200, {
		...headers,
	});
	createReadStream(asset.path)
		.on("error", () => {
			if (!res.headersSent) {
				sendJson(res, 404, {
					error: {
						message: "Cached asset could not be read.",
						type: "not_found_error",
					},
				});
				return;
			}
			res.destroy();
		})
		.pipe(res);
}

function sanitizeContentDispositionFilename(fileName: string | null | undefined): string | null {
	const trimmed = typeof fileName === "string" ? fileName.trim() : "";
	if (!trimmed) return null;
	return (
		path
			.basename(trimmed)
			.replace(/["\r\n\\]/g, "_")
			.slice(0, 180) || null
	);
}

function createOperatorBrowserDashboardHtml(
	input: {
		activePage?: "browser" | "account-mirror" | "preview-session" | "config" | "agents";
		routes?: OperatorDashboardRoutes;
	} = {},
): string {
	const activePage = input.activePage ?? "browser";
	const routes = input.routes ?? resolveOperatorDashboardRoutes(undefined);
	const dashboardPath = escapeHtmlAttribute(routes.dashboardPath);
	const debugDashboardPath = escapeHtmlAttribute(routes.debugDashboardPath);
	const accountMirrorPath = escapeHtmlAttribute(routes.accountMirrorPath);
	const previewSessionPath = escapeHtmlAttribute(routes.previewSessionPath);
	const configPath = escapeHtmlAttribute(routes.configPath);
	const agentsPath = escapeHtmlAttribute(routes.agentsPath);
	const browserCurrent = activePage === "browser" ? ' aria-current="page"' : "";
	const accountMirrorCurrent = activePage === "account-mirror" ? ' aria-current="page"' : "";
	const previewSessionCurrent = activePage === "preview-session" ? ' aria-current="page"' : "";
	const configCurrent = activePage === "config" ? ' aria-current="page"' : "";
	const agentsCurrent = activePage === "agents" ? ' aria-current="page"' : "";
	const pageTitle =
		activePage === "account-mirror"
			? "AuraCall Account Mirror"
			: activePage === "preview-session"
				? "AuraCall Preview Session"
				: activePage === "config"
					? "AuraCall Config"
					: activePage === "agents"
						? "AuraCall Agents / Teams"
						: "AuraCall Browser Ops";
	const pageDescription =
		activePage === "account-mirror"
			? "Read-only account mirror navigation backed by cached provider indexes."
			: activePage === "preview-session"
				? "Cache-only review of selected account mirror preview assets."
				: activePage === "config"
					? "Read-only effective service routing and operator URL discovery."
					: activePage === "agents"
						? "Read-only team and runtime inspection backed by existing API endpoints."
						: "Local operator view. Browser diagnostics run only when requested.";
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <style>
    :root {
      color-scheme: dark light;
      --bg: #101114;
      --panel: #181b20;
      --panel-2: #20242b;
      --text: #f2f4f8;
      --muted: #a9b1bd;
      --line: #343a44;
      --accent: #71d3c6;
      --warn: #ffd166;
      --bad: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 0 0 12px; }
    p { margin: 0; color: var(--muted); }
    a { color: var(--accent); }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -8px 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .nav a,
    .nav span {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      text-decoration: none;
      background: #11151a;
    }
    .nav a[aria-current="page"] {
      border-color: var(--accent);
      color: var(--accent);
    }
    .health-strip {
      display: grid;
      gap: 8px;
      margin: -4px 0 16px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #11151a;
    }
    .health-strip-title {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .health-strip-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .health-strip-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .catalog-detail {
      margin-top: 10px;
      display: grid;
      gap: 8px;
    }
    .chat-transcript {
      display: grid;
      gap: 10px;
      margin-bottom: 10px;
    }
    .chat-transcript-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .chat-transcript-actions input {
      min-width: 220px;
      flex: 1 1 260px;
    }
    .chat-turn {
      display: grid;
      gap: 4px;
      max-width: 82%;
    }
    .chat-turn-user { justify-self: end; }
    .chat-turn-assistant, .chat-turn-system, .chat-turn-tool { justify-self: start; }
    .chat-role {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .chat-bubble {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #11151a;
    }
    .chat-turn-user .chat-bubble {
      border-color: var(--accent);
      background: #10211f;
    }
    .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
    .panel {
      grid-column: span 12;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    @media (min-width: 900px) {
      .half { grid-column: span 6; }
      .third { grid-column: span 4; }
      .wide { grid-column: span 8; }
    }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .control-grid { display: grid; gap: 10px; }
    @media (min-width: 720px) {
      .control-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .control-card {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
      padding: 10px;
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .control-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .control-title strong { overflow-wrap: anywhere; }
    label { color: var(--muted); font-size: 12px; display: grid; gap: 4px; }
    select, input, button {
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      min-height: 34px;
      padding: 6px 9px;
      font: inherit;
    }
    button { cursor: pointer; }
    button.primary { border-color: var(--accent); }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    button.link-button {
      min-height: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: inherit;
      text-decoration: underline;
    }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
      margin-bottom: 10px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 780px; }
    th, td {
      padding: 7px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #11151a; }
    tr:last-child td { border-bottom: 0; }
    tr.catalog-row-selected td { background: #10211f; }
    tr.service-event-row-selected td { background: #111f2c; }
    td.wrap { white-space: normal; min-width: 180px; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #0b0c0f;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      max-height: 440px;
      overflow: auto;
    }
    .ok { color: var(--accent); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .muted { color: var(--muted); }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 22px;
      padding: 2px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #11151a;
      color: var(--text);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }
    .badge-ok { border-color: var(--accent); color: var(--accent); }
    .badge-warn { border-color: var(--warn); color: var(--warn); }
    .badge-bad { border-color: var(--bad); color: var(--bad); }
    .badge-muted { color: var(--muted); }
    .catalog-row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .catalog-browser-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .catalog-kind-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .catalog-kind-tabs button {
      min-height: 28px;
      padding: 4px 8px;
    }
    .catalog-kind-tabs button[aria-pressed="true"] {
      border-color: var(--accent);
      color: var(--accent);
    }
    .catalog-title-cell {
      display: grid;
      gap: 4px;
      min-width: 260px;
    }
    .catalog-detail-layout {
      display: grid;
      grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
      gap: 12px;
      align-items: start;
    }
    .catalog-result-sidebar {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
      max-height: 620px;
      overflow: auto;
    }
    .catalog-result-sidebar-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      background: #11151a;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    .catalog-result-list {
      display: grid;
      gap: 0;
    }
    .catalog-result-button {
      display: grid;
      gap: 4px;
      width: 100%;
      padding: 8px 10px;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }
    .catalog-result-button:hover,
    .catalog-result-button:focus-visible,
    .catalog-result-button.catalog-nav-selected {
      background: #10211f;
    }
    .catalog-result-button:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: -1px;
    }
    .catalog-result-button strong,
    .catalog-result-button span {
      overflow-wrap: anywhere;
    }
    .catalog-result-meta {
      color: var(--muted);
      font-size: 12px;
    }
    .catalog-detail-main {
      min-width: 0;
    }
    @media (max-width: 900px) {
      .catalog-detail-layout {
        grid-template-columns: 1fr;
      }
      .catalog-result-sidebar {
        max-height: 280px;
      }
    }
    .notice {
      margin: 0 0 10px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
      color: var(--muted);
      min-height: 18px;
    }
    .notice-ok { border-color: var(--accent); color: var(--accent); }
    .notice-warn { border-color: var(--warn); color: var(--warn); }
    .notice-bad { border-color: var(--bad); color: var(--bad); }
    .control-result-toast {
      display: grid;
      gap: 6px;
      margin-bottom: 10px;
    }
    .control-result-toast strong {
      color: var(--text);
    }
    .control-result-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .asset-preview {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .asset-preview img,
    .asset-preview video,
    .asset-preview audio,
    .asset-preview iframe {
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
    }
    .asset-preview img {
      max-height: 520px;
      object-fit: contain;
    }
    .asset-preview iframe {
      width: 100%;
      min-height: 520px;
    }
    .preview-session-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .preview-session-item {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
      padding: 10px;
      min-width: 0;
    }
    .preview-session-frame {
      width: 100%;
      min-height: 280px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
    }
    .preview-session-item img,
    .preview-session-item video,
    .preview-session-item audio {
      width: 100%;
      max-height: 420px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
      object-fit: contain;
    }
    .severity-healthy { color: var(--accent); }
    .severity-backpressured, .severity-paused { color: var(--warn); }
    .severity-attention-needed { color: var(--bad); }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>${pageTitle}</h1>
        <p>${pageDescription}</p>
      </div>
      <button id="refreshStatus">Refresh Status</button>
    </div>
    <nav class="nav" aria-label="AuraCall sections">
      <a id="navBrowserOps" href="${debugDashboardPath}" data-route-key="debugDashboardPath"${browserCurrent}>Browser Ops</a>
      <a id="navAccountMirror" href="${accountMirrorPath}" data-route-key="accountMirrorPath"${accountMirrorCurrent}>Account Mirror</a>
      <a id="navPreviewSession" href="${previewSessionPath}" data-route-key="previewSessionPath"${previewSessionCurrent}>Preview Session</a>
      <a id="navConfig" href="${configPath}" data-route-key="configPath"${configCurrent}>Config</a>
      <a id="navAgentsTeams" href="${agentsPath}" data-route-key="agentsPath"${agentsCurrent}>Agents / Teams</a>
    </nav>
    <div id="preflightHeaderSummary" class="health-strip" role="status" aria-live="polite">
      <div class="health-strip-title"><strong>Preflight</strong><span class="muted">Loading...</span></div>
    </div>

    <div class="grid">
      <section class="panel half">
        <h2>Operations</h2>
        <div id="opsControlNotice" class="notice" role="status" aria-live="polite">No service control action yet.</div>
        <div id="opsControls" class="control-grid">Loading controls...</div>
      </section>

      <section class="panel half">
        <h2>Server</h2>
        <dl id="serverSummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
        <div class="row" style="margin-top: 10px;">
          <button id="loadApiLogTail" type="button">Refresh API Log Tail</button>
        </div>
        <pre id="apiLogTail">API log tail not loaded.</pre>
      </section>

      <section class="panel" id="recentServiceEventsPanel">
        <h2>Recent Service Events</h2>
        <div class="row">
          <label for="recentServiceEventFilter">Source</label>
          <select id="recentServiceEventFilter" onchange="filterRecentServiceEvents()">
            <option value="all">All</option>
            <option value="api">API</option>
            <option value="preflight">Preflight</option>
            <option value="scheduler">Scheduler</option>
          </select>
          <span id="recentServiceEventVisibleCount" class="muted">0 shown</span>
        </div>
        <div id="recentServiceEvents">Loading service events...</div>
        <pre id="recentServiceEventDetail">Select a scheduler event to inspect details.</pre>
      </section>

      <section class="panel">
        <h2>Service Discovery</h2>
        <dl id="serviceDiscoverySummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
      </section>

      <section class="panel" id="configRoutingPanel">
        <h2>Config</h2>
        <dl id="configRoutingSummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
        <pre id="configRoutingRaw">No status loaded.</pre>
      </section>

      <section class="panel half" id="configIdentityPanel">
        <h2>Bound Identities</h2>
        <div id="configIdentitySummary" class="muted">Loading...</div>
      </section>

      <section class="panel half" id="configLiveFollowPanel">
        <h2>Live Follow Eligibility</h2>
        <div id="configLiveFollowSummary" class="muted">Loading...</div>
      </section>

      <section class="panel" id="tabConcurrencyPanel" data-tab-concurrency-status="sanitized">
        <h2>Browser Tab Concurrency</h2>
        <div class="notice">Read-only affinity posture. Immediate rollback: set <code>browser.tabConcurrencyMode</code> to <code>serialized</code> and restart the AuraCall service.</div>
        <dl id="tabConcurrencySummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
        <pre id="tabConcurrencyRaw">Loading...</pre>
      </section>

      <section class="panel">
        <h2>Account Mirrors</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Provider
            <select id="mirrorCatalogProvider">
              <option value="">all</option>
              <option value="chatgpt">chatgpt</option>
              <option value="gemini">gemini</option>
              <option value="grok">grok</option>
            </select>
          </label>
          <label>Runtime Profile
            <input id="mirrorCatalogRuntimeProfile" placeholder="default">
          </label>
          <label>Kind
            <select id="mirrorCatalogKind">
              <option value="all">all</option>
              <option value="projects">projects</option>
              <option value="conversations">conversations</option>
              <option value="artifacts">artifacts</option>
              <option value="files">files</option>
              <option value="media">media</option>
            </select>
          </label>
          <label>Search
            <input id="mirrorCatalogSearch" placeholder="cached title, id, URL, or metadata">
          </label>
          <label>Asset Preview
            <select id="mirrorCatalogPreviewFilter">
              <option value="all">all</option>
              <option value="previewable">previewable</option>
              <option value="local">local</option>
              <option value="remote">remote</option>
              <option value="inline">inline</option>
              <option value="metadata">metadata only</option>
            </select>
          </label>
          <label>Sort
            <select id="mirrorCatalogSort">
              <option value="updated-desc">updated desc</option>
              <option value="preview-first">previewable first</option>
              <option value="local-first">local first</option>
              <option value="kind">kind/title</option>
            </select>
          </label>
          <label>
            <input id="mirrorCatalogWithTranscriptOnly" type="checkbox">
            With transcript only
          </label>
          <label>Limit
            <input id="mirrorCatalogLimit" type="number" min="0" max="500" step="1" value="50">
          </label>
          <button id="loadMirrorCatalog" class="primary">Search Cache</button>
          <button id="showVisibleMirrorCatalogPreviewUrls" type="button">Preview visible URL list</button>
          <button id="reviewVisibleMirrorCatalogPreviews" type="button">Review visible previews</button>
          <button id="openVisibleMirrorCatalogPreviewUrls" type="button">Open visible previews</button>
          <button id="copyVisibleMirrorCatalogDetailLinks" type="button">Copy visible detail links</button>
          <button id="copyVisibleMirrorCatalogPreviewUrls" type="button">Copy visible preview URLs</button>
          <button id="downloadVisibleMirrorCatalogPreviewUrls" type="button">Download visible preview URL list</button>
        </div>
        <div id="mirrorCatalogBatchNotice" class="notice" role="status" aria-live="polite">No catalog batch action yet.</div>
        <div id="mirrorCatalogPreviewUrlDrawer" class="notice" hidden>
          <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
            <strong>Visible preview URLs</strong>
            <button id="hideVisibleMirrorCatalogPreviewUrls" type="button">Close</button>
          </div>
          <pre id="mirrorCatalogPreviewUrlList">No visible preview URLs.</pre>
        </div>
        <div id="mirrorCatalogSummary" class="notice">Catalog reads are cache-only and do not enqueue browser work.</div>
        <div class="catalog-browser-toolbar">
          <strong>Cached item browser</strong>
          <div id="mirrorCatalogKindTabs" class="catalog-kind-tabs" aria-label="Cached item kind filters">Load catalog to browse cached items.</div>
        </div>
        <div id="mirrorCatalogResults" class="muted" style="margin-bottom: 10px;">No catalog loaded.</div>
        <div id="mirrorCatalogDetail" class="catalog-detail">
          <div class="notice">Select a cached row to inspect it. Cached conversations open as a chat dialog when transcript data is available.</div>
          <div class="catalog-detail-layout">
            <aside class="catalog-result-sidebar" aria-label="Cached result navigation">
              <div class="catalog-result-sidebar-header">
                <span>Results</span>
                <span id="mirrorCatalogNavigatorSummary">0 shown</span>
              </div>
              <div id="mirrorCatalogNavigator" class="catalog-result-list">Load catalog results to navigate cached items.</div>
            </aside>
            <div class="catalog-detail-main">
              <div id="mirrorCatalogDetailView" class="notice">No row selected.</div>
              <pre id="mirrorCatalogDetailRaw">No row selected.</pre>
            </div>
          </div>
        </div>
        <pre id="mirrorCatalogRaw">No catalog loaded.</pre>
        <h2 style="margin-top: 14px;">Mirror Status</h2>
        <pre id="mirrorStatus">Loading...</pre>
      </section>

      <section class="panel half">
        <h2>Mirror Live Follow</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Completion ID
            <input id="mirrorCompletionId" placeholder="acctmirror_completion_id">
          </label>
          <button id="inspectMirrorCompletionById">Inspect</button>
          <button id="pauseMirrorCompletion">Pause</button>
          <button id="resumeMirrorCompletion">Resume</button>
          <button id="cancelMirrorCompletion">Cancel</button>
          <label>Target completeness
            <select id="mirrorTargetCompletenessFilter">
              <option value="">all</option>
              <option value="attention">attention</option>
              <option value="in_progress">in progress</option>
              <option value="complete">complete</option>
              <option value="none">none</option>
            </select>
          </label>
          <span id="mirrorTargetCompletenessVisibleCount" class="muted" data-mirror-target-completeness-visible-count="true">showing 0 of 0</span>
        </div>
        <div id="mirrorAttentionQueue" class="muted" style="margin-bottom: 10px;">Loading attention queue...</div>
        <div id="mirrorTargetTable" class="muted" style="margin-bottom: 10px;">Loading target accounts...</div>
        <div id="mirrorActiveCompletionTable" class="muted" style="margin-bottom: 10px;">Loading active operations...</div>
        <div id="mirrorControlNotice" class="notice" role="status" aria-live="polite">No live-follow control action yet.</div>
        <div id="mirrorControlResultToast" class="notice control-result-toast" role="status" aria-live="polite" hidden>No live-follow control result yet.</div>
        <pre id="mirrorTargets">Loading...</pre>
        <pre id="mirrorCompletions">Loading...</pre>
      </section>

      <section id="mirrorPreviewSessionPanel" class="panel" hidden>
        <h2>Cached Preview Session</h2>
        <div id="mirrorPreviewSessionNotice" class="notice" role="status" aria-live="polite">No preview session loaded.</div>
        <div class="row" style="margin-bottom: 10px;">
          <label>Saved session search
            <input id="savedMirrorPreviewSessionSearch" placeholder="name, id, provider, kind, or URL">
          </label>
          <button id="refreshSavedMirrorPreviewSessionTable" type="button">Refresh saved session list</button>
        </div>
        <div id="savedMirrorPreviewSessionTable" class="muted" style="margin-bottom: 10px;">No saved preview sessions loaded.</div>
        <div class="row" style="margin-bottom: 10px;">
          <button id="selectAllMirrorPreviewSessionItems" type="button">Select all</button>
          <button id="clearMirrorPreviewSessionSelection" type="button">Select none</button>
          <button id="copyMirrorPreviewSessionUrls" type="button">Copy selected URLs</button>
          <button id="downloadMirrorPreviewSessionUrls" type="button">Download selected URL list</button>
          <button id="downloadMirrorPreviewSessionManifest" type="button">Download selected manifest</button>
          <input id="mirrorPreviewSessionName" placeholder="session name">
          <button id="saveMirrorPreviewSession" type="button">Save named session</button>
          <button id="refreshMirrorPreviewSessionList" type="button">Refresh saved sessions</button>
          <select id="savedMirrorPreviewSessions" aria-label="Saved preview sessions"><option value="">saved sessions</option></select>
          <button id="loadSavedMirrorPreviewSession" type="button">Load saved session</button>
          <button id="renameSavedMirrorPreviewSession" type="button">Rename saved session</button>
          <button id="deleteSavedMirrorPreviewSession" type="button">Delete saved session</button>
          <label>Load manifest <input id="loadMirrorPreviewSessionManifest" type="file" accept="application/json,.json"></label>
        </div>
        <div id="mirrorPreviewSessionGrid" class="preview-session-grid">No previews loaded.</div>
      </section>

      <section id="agentsTeamsPanel" class="panel">
        <h2>Agents / Teams</h2>
        <div id="agentsTeamsNotice" class="notice" role="status" aria-live="polite">Enter an id to inspect persisted team/runtime state.</div>
        <div class="row" style="margin-bottom: 10px;">
          <button id="loadAgentsDiagnostics" type="button">Refresh Agent Diagnostics</button>
          <button id="loadAgentChoices" type="button">Refresh Agent Choices</button>
          <span id="agentsDiagnosticsHeadline" class="muted">No agent diagnostics loaded.</span>
        </div>
        <div id="agentsDiagnosticsSummary" class="muted" style="margin-bottom: 10px;">No agent diagnostics loaded.</div>
        <div id="agentChoicesSummary" class="muted" style="margin-bottom: 10px;">No agent choices loaded.</div>
        <div class="control-card" style="margin-bottom: 10px;">
          <div class="control-title"><strong>Agent Configuration</strong></div>
          <div class="row" style="margin-bottom: 10px;">
            <label>Agent ID
              <input id="agentConfigId" placeholder="agent id">
            </label>
            <label>Duplicate To
              <input id="agentConfigDuplicateId" placeholder="new agent id">
            </label>
            <button id="loadAgentConfigs" type="button">Load Agents</button>
            <button id="saveAgentConfig" type="button">Save Agent</button>
            <button id="duplicateAgentConfig" type="button">Duplicate Agent</button>
            <button id="archiveAgentConfig" type="button">Archive Agent</button>
          </div>
          <textarea id="agentConfigJson" rows="10" style="width: 100%;" spellcheck="false" placeholder='{"runtimeProfile":"default","service":"chatgpt","modelSelector":"chatgpt:reasoning-high"}'></textarea>
          <div id="agentConfigTable" class="muted" style="margin-top: 10px;">No agent configs loaded.</div>
          <pre id="agentConfigResult">No agent config mutation yet.</pre>
        </div>
        <div class="row" style="margin-bottom: 10px;">
          <label>Key agent
            <input id="agentApiKeyAgentId" placeholder="agent id">
          </label>
          <label>Key team
            <input id="agentApiKeyTeamId" placeholder="team id">
          </label>
          <label>Key ID
            <input id="agentApiKeyId" placeholder="agent-or-team-client">
          </label>
          <label>Services
            <input id="agentApiKeyServices" placeholder="chatgpt, gemini">
          </label>
          <label>Runtime profiles
            <input id="agentApiKeyRuntimeProfiles" placeholder="default">
          </label>
          <label>Env path
            <input id="agentApiKeyEnvPath" placeholder="default api.env">
          </label>
          <label><input id="agentApiKeyOverwrite" type="checkbox"> overwrite</label>
          <button id="issueAgentApiKey" type="button">Issue API Key</button>
        </div>
        <pre id="agentApiKeyResult">No API key issued yet.</pre>
        <div class="row" style="margin-bottom: 10px;">
          <label>Snapshot scope
            <select id="agentSnapshotScope">
              <option value="selected">selected ids</option>
              <option value="all">all effective agents and teams</option>
            </select>
          </label>
          <label>Agent IDs
            <input id="agentSnapshotAgentIds" placeholder="agent-a, agent-b">
          </label>
          <label>Team IDs
            <input id="agentSnapshotTeamIds" placeholder="team-a, team-b">
          </label>
          <button id="downloadAgentSnapshot" type="button">Download Snapshot</button>
          <label>Import Snapshot
            <input id="agentSnapshotImportFile" type="file" accept="application/json,.json">
          </label>
          <button id="dryRunAgentSnapshotImport" type="button">Dry-run Import</button>
          <button id="applyAgentSnapshotImport" type="button">Apply Import</button>
        </div>
        <pre id="agentSnapshotResult">No snapshot export/import yet.</pre>
        <div class="row" style="margin-bottom: 10px;">
          <label>Recent source
            <select id="agentsRecentRunSourceKind">
              <option value="">all</option>
              <option value="team-run">team-run</option>
              <option value="direct">direct</option>
            </select>
          </label>
          <label>Recent status
            <select id="agentsRecentRunStatus">
              <option value="">all</option>
              <option value="planned">planned</option>
              <option value="running">running</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label>Recent limit
            <input id="agentsRecentRunLimit" type="number" min="0" max="100" step="1" value="25">
          </label>
          <label>Mirror cache
            <select id="agentsRecentMirrorCacheFilter">
              <option value="">all</option>
              <option value="pending">pending</option>
              <option value="unavailable">unavailable</option>
              <option value="metadata">metadata only</option>
              <option value="assets">assets</option>
              <option value="transcript">transcript</option>
              <option value="none">none</option>
            </select>
          </label>
          <label>Mirror sort
            <select id="agentsRecentMirrorCacheSort">
              <option value="">updated</option>
              <option value="cache-state">cache state</option>
            </select>
          </label>
          <button id="loadAgentsRecentRuns" type="button">Load Recent Runs</button>
          <button id="copyVisibleAgentsRecentMirrorLinks" type="button">Copy visible mirror links</button>
          <span id="agentsRecentMirrorCacheVisibleCount" class="muted" data-agents-recent-mirror-cache-visible-count="true">showing 0 of 0</span>
        </div>
        <div id="agentsRecentRuns" class="muted" style="margin-bottom: 10px;">No recent runs loaded.</div>
        <div class="row" style="margin-bottom: 10px;">
          <label>Task Run Spec ID
            <input id="agentTaskRunSpecId" placeholder="task_spec_id">
          </label>
          <label>Team Run ID
            <input id="agentTeamRunId" placeholder="team_run_id">
          </label>
          <label>Runtime Run ID
            <input id="agentRuntimeRunId" placeholder="runtime_run_id">
          </label>
          <label>Runner ID
            <input id="agentRunnerId" placeholder="runner_id">
          </label>
          <button id="inspectTeamRun" type="button">Inspect Team</button>
          <button id="inspectRuntimeRun" type="button">Inspect Runtime</button>
        </div>
        <dl id="agentsTeamsSummary">
          <dt>Status</dt><dd class="muted">No inspection loaded.</dd>
        </dl>
        <div id="agentsTeamsConversation" class="catalog-detail">
          <span class="muted">No runtime conversation loaded.</span>
        </div>
        <pre id="agentsTeamsRaw">No inspection loaded.</pre>
      </section>

      <section id="browserProcessPanel" class="panel">
        <h2>Browser Processes</h2>
        <p style="margin-bottom: 10px;">Separates Chrome launch arguments from the actual DevTools page targets currently open.</p>
        <div class="row" style="margin-bottom: 10px;">
          <button id="loadBrowserProcesses" type="button">Refresh Browser Processes</button>
          <span id="browserProcessSummary" class="muted">No browser process probe loaded.</span>
        </div>
        <div class="table-wrap">
          <table id="browserProcessTable">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Runtime Profile</th>
	                <th>PID</th>
	                <th>Owner</th>
	                <th>DevTools</th>
                <th>Launch about:blank</th>
                <th>Open blank pages</th>
                <th>Pages</th>
                <th class="wrap">Visible targets</th>
              </tr>
            </thead>
            <tbody id="browserProcessRows">
	              <tr><td colspan="9" class="muted">No browser process probe loaded.</td></tr>
            </tbody>
          </table>
        </div>
        <pre id="browserProcessRaw">No browser process probe loaded.</pre>
      </section>

      <section class="panel wide">
        <h2>Browser Workbench Probe</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Provider
            <select id="provider">
              <option value="chatgpt">chatgpt</option>
              <option value="gemini">gemini</option>
              <option value="grok">grok</option>
            </select>
          </label>
          <label>Category
            <select id="category">
              <option value="">all</option>
              <option value="media">media</option>
              <option value="research">research</option>
              <option value="canvas">canvas</option>
              <option value="app">app</option>
              <option value="skill">skill</option>
              <option value="connector">connector</option>
              <option value="file">file</option>
              <option value="search">search</option>
            </select>
          </label>
          <label>Runtime Profile
            <input id="runtimeProfile" placeholder="default">
          </label>
          <button id="probeWorkbench" class="primary">Probe Browser State</button>
        </div>
        <pre id="workbenchOutput">No probe yet.</pre>
      </section>

      <section class="panel third">
        <h2>Run Status</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Run ID
            <input id="runId" placeholder="run or media generation id">
          </label>
          <button id="probeRun">Inspect</button>
        </div>
        <pre id="runOutput">No run selected.</pre>
      </section>

      <section class="panel">
        <h2>Useful Endpoints</h2>
        <dl>
          <dt>Dashboard</dt><dd><a id="usefulDashboardLink" href="${dashboardPath}">${dashboardPath}</a></dd>
          <dt>Account Mirror</dt><dd><a id="usefulAccountMirrorLink" href="${accountMirrorPath}">${accountMirrorPath}</a></dd>
          <dt>Preview Session</dt><dd><a id="usefulPreviewSessionLink" href="${previewSessionPath}">${previewSessionPath}</a></dd>
          <dt>Config</dt><dd><a id="usefulConfigLink" href="${configPath}">${configPath}</a></dd>
          <dt>Status</dt><dd><a href="/status">/status</a></dd>
          <dt>Mirror Catalog</dt><dd>/v1/account-mirrors/catalog?kind=all&amp;limit=50</dd>
          <dt>Preview Sessions</dt><dd>/v1/account-mirrors/preview-sessions</dd>
          <dt>Workbench</dt><dd>/v1/workbench-capabilities?provider=gemini&amp;diagnostics=browser-state</dd>
          <dt>Run Status</dt><dd>/v1/runs/{run_id}/status?diagnostics=browser-state</dd>
          <dt>Runtime Inspect</dt><dd>/v1/runtime-runs/inspect?runId={run_id}&amp;probe=service-state&amp;diagnostics=browser-state</dd>
        </dl>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const asJson = (value) => JSON.stringify(value, null, 2);
    const OPERATOR_DASHBOARD_ROUTES = ${JSON.stringify(routes)};
    let OPERATOR_DASHBOARD_SERVICE_DISCOVERY = {};
    const RECENT_SERVICE_EVENT_FILTER_STORAGE_KEY = 'auracall.opsBrowser.recentServiceEvents.filter';
    const RECENT_SERVICE_EVENT_SELECTED_STORAGE_KEY = 'auracall.opsBrowser.recentServiceEvents.selected';
    let recentServiceEventDetails = [];
    let mirrorCatalogRows = [];
    let mirrorCatalogFilteredRows = [];
    let mirrorCatalogCurrentDetail = null;
    let mirrorPreviewSessionUrls = [];
    let mirrorPreviewSessionItems = [];
    let mirrorPreviewSessionSelectedUrls = new Set();
    let savedMirrorPreviewSessionsCache = [];

    async function fetchJson(path) {
      const response = await fetch(path, { cache: 'no-store' });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload }));
      }
      return payload;
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload }));
      }
      return payload;
    }

    async function patchJson(path, body) {
      const response = await fetch(path, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload }));
      }
      return payload;
    }

    async function deleteJson(path) {
      const response = await fetch(path, { method: 'DELETE' });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload }));
      }
      return payload;
    }

    function renderServerSummary(status) {
      const binding = status.binding || {};
      const runner = status.runner || {};
      const scheduler = status.accountMirrorScheduler || {};
      const backgroundDrain = status.backgroundDrain || {};
      const completions = status.accountMirrorCompletions || {};
      const completionMetrics = completions.metrics || {};
      const liveFollow = status.liveFollow || {};
      const targets = liveFollow.targets || {};
      const api = status.api || {};
      const apiProcess = api.process || {};
      const apiService = api.managedService || {};
      const preflight = status.preflight || {};
      const lazyLiveFollowPreflight = preflight.lazyLiveFollow || null;
      const lazyLiveFollowRun = preflight.lazyLiveFollowRun || null;
      const dashboard = status.routes && status.routes.operatorBrowserDashboard;
      $('serverSummary').innerHTML = [
        ['Status', status.ok ? '<span class="ok">ok</span>' : '<span class="bad">not ok</span>'],
        ['Version', status.version || 'unknown'],
        ['API PID', apiProcess.pid ? escapeHtml(String(apiProcess.pid)) : 'unknown'],
        ['API Log', escapeHtml(apiService.logPath || 'unknown')],
        ['Preflight', renderPreflightStatus(lazyLiveFollowPreflight)],
        ['Preflight Completed', lazyLiveFollowPreflight ? escapeHtml(lazyLiveFollowPreflight.completedAt || 'unknown') : 'never'],
        ['Preflight Step', renderPreflightCurrentStep(lazyLiveFollowRun)],
        ['Binding', [binding.host, binding.port].filter(Boolean).join(':') || 'unknown'],
        ['Local Only', binding.localOnly ? '<span class="ok">true</span>' : '<span class="warn">false</span>'],
        ['Runner', runner.status || 'unknown'],
        ['Runner ID', runner.id || 'none'],
        ['Background Drain', backgroundDrain.state || 'unknown'],
        ['Mirror Scheduler', scheduler.state || 'unknown'],
        ['Mirror Posture', scheduler.operatorStatus ? scheduler.operatorStatus.posture : 'unknown'],
        ['Live Follow Severity', renderSeverity(liveFollow.severity)],
        ['Live Follow Targets', formatTargetHealth(targets)],
        ['Desired vs Actual', formatDesiredActualHealth(targets)],
        ['Mirror Wake', scheduler.lastWakeReason || 'none'],
        ['Mirror Wake At', scheduler.lastWakeAt || 'never'],
        ['Completion Records', formatCompletionHistory(completionMetrics, targets)],
        ['Dashboard Route', dashboard || '/ops/browser'],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
    }

    function renderPreflightStatus(preflight) {
      if (!preflight) return renderStatusText('unknown', 'warn');
      const status = preflight.status || 'unknown';
      const tone = status === 'passed' ? 'ok' : status === 'failed' ? 'bad' : 'warn';
      const duration = typeof preflight.durationMs === 'number' ? ' in ' + preflight.durationMs + 'ms' : '';
      const failedStep = preflight.failedStep ? ' step=' + preflight.failedStep : '';
      return renderStatusText(status, tone) + escapeHtml(duration + failedStep);
    }

    function renderPreflightCurrentStep(run) {
      const steps = run && Array.isArray(run.steps) ? run.steps : [];
      const current = steps.find((step) => step.status === 'running') || steps[steps.length - 1] || null;
      if (!current) return '<span class="muted">none</span>';
      return renderStatusText(current.status || 'unknown', toneForActualStatus(current.status || 'unknown'))
        + ' ' + escapeHtml(current.label || 'unknown');
    }

    function renderServiceDiscovery(status) {
      const discovery = status.serviceDiscovery || {};
      OPERATOR_DASHBOARD_SERVICE_DISCOVERY = discovery;
      const bind = discovery.bind || {};
      const local = discovery.local || {};
      const external = discovery.external || {};
      const routing = discovery.routing || {};
      applyServiceDiscoveryRoutes(routing);
      $('serviceDiscoverySummary').innerHTML = [
        ['Bind URL', renderMaybeLink(bind.url)],
        ['Local Dashboard', renderMaybeLink(local.dashboardUrl)],
        ['Local Account Mirror', renderMaybeLink(local.accountMirrorUrl)],
        ['External Dashboard', renderMaybeLink(external.dashboardUrl)],
        ['External Account Mirror', renderMaybeLink(external.accountMirrorUrl)],
        ['Preview Session Path', escapeHtml(routing.previewSessionPath || 'none')],
        ['Config Path', escapeHtml(routing.configPath || 'none')],
        ['Agents Path', escapeHtml(routing.agentsPath || 'none')],
        ['Proxy Target', renderMaybeLink(routing.proxyTarget)],
        ['Ingress', escapeHtml(routing.ingress || 'none')],
        ['Auth Guard', escapeHtml(routing.auth || 'none')],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
    }

    function renderConfigRouting(status) {
      const discovery = status.serviceDiscovery || {};
      const routes = status.routes || {};
      const routing = discovery.routing || {};
      $('configRoutingSummary').innerHTML = [
        ['Dashboard Path', escapeHtml(routing.dashboardPath || routes.operatorBrowserDashboard || 'none')],
        ['Account Mirror Path', escapeHtml(routing.accountMirrorPath || routes.accountMirrorDashboard || 'none')],
        ['Preview Session Path', escapeHtml(routing.previewSessionPath || routes.accountMirrorPreviewSessionDashboard || 'none')],
        ['Config Path', escapeHtml(routing.configPath || routes.operatorConfigDashboard || 'none')],
        ['Agents Path', escapeHtml(routing.agentsPath || routes.operatorAgentsDashboard || 'none')],
        ['Local Base URL', renderMaybeLink(discovery.local && discovery.local.baseUrl)],
        ['External Base URL', renderMaybeLink(discovery.external && discovery.external.baseUrl)],
        ['Proxy Target', renderMaybeLink(routing.proxyTarget)],
        ['Ingress', escapeHtml(routing.ingress || 'none')],
        ['Auth Guard', escapeHtml(routing.auth || 'none')],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
      $('configRoutingRaw').textContent = asJson({
        serviceDiscovery: discovery,
        routes: {
          operatorBrowserDashboard: routes.operatorBrowserDashboard,
          accountMirrorDashboard: routes.accountMirrorDashboard,
          accountMirrorPreviewSessionDashboard: routes.accountMirrorPreviewSessionDashboard,
          operatorConfigDashboard: routes.operatorConfigDashboard,
          operatorAgentsDashboard: routes.operatorAgentsDashboard,
          operatorBrowserDashboardUrl: routes.operatorBrowserDashboardUrl,
          publicOperatorBrowserDashboardUrl: routes.publicOperatorBrowserDashboardUrl,
          localServiceBaseUrl: routes.localServiceBaseUrl,
          externalServiceBaseUrl: routes.externalServiceBaseUrl,
        },
      });
    }

    function renderTabConcurrency(status) {
      const concurrency = status.tabConcurrency || {};
      const leaseStates = concurrency.leaseStates || {};
      const workloads = concurrency.workloads || {};
      const warnings = concurrency.providerWarnings || {};
      const rejections = concurrency.admissionRejections || {};
      const usage = concurrency.aggregateUsage || {};
      const attention = concurrency.attention || {};
      const actions = concurrency.targetActions || {};
      const retirements = concurrency.retirements || {};
      const mode = concurrency.mode || 'serialized';
      const attentionCount = Number(attention.expiredIdle || 0)
        + Number(attention.outcomeUnknown || 0)
        + Number(attention.restartUnverified || 0)
        + Number(leaseStates.lost || 0);
      const guardCount = Number(warnings.active || 0);
      const tone = guardCount > 0 || attentionCount > 0 ? 'bad' : mode === 'tab-affinity' ? 'ok' : 'warn';
      $('tabConcurrencySummary').innerHTML = [
        ['Mode', renderStatusText(mode, tone)],
        ['Rollback', '<code>browser.tabConcurrencyMode = serialized</code>'],
        ['Leases', escapeHtml('active=' + Number(leaseStates.active || 0) + ' idle=' + Number(leaseStates.idle || 0) + ' retiring=' + Number(leaseStates.retiring || 0) + ' lost=' + Number(leaseStates.lost || 0))],
        ['Workloads', escapeHtml('conversation=' + Number(workloads.conversations || 0) + ' new=' + Number(workloads.newConversations || 0) + ' live-follow=' + Number(workloads.liveFollow || 0) + ' utility=' + Number(workloads.ephemeral || 0))],
        ['Aggregate Usage', escapeHtml('active chats=' + Number(usage.activeChats || 0) + ' chats/hour=' + Number(usage.chatsLastHour || 0) + ' chats/day=' + Number(usage.chatsLastDay || 0) + ' interactions/min=' + Number(usage.interactionsLastMinute || 0))],
        ['Provider Guards', renderStatusText(guardCount > 0 ? String(guardCount) + ' active' : 'clear', guardCount > 0 ? 'bad' : 'ok')],
        ['Admission Rejections', escapeHtml(String(Number(rejections.total || 0)) + (rejections.latestReason ? ' latest=' + rejections.latestReason : ''))],
        ['Attention', renderStatusText(attentionCount > 0 ? String(attentionCount) + ' item(s)' : 'clear', attentionCount > 0 ? 'bad' : 'ok')],
        ['Target Churn', escapeHtml('create=' + Number(actions.targetCreations || 0) + ' navigate=' + Number(actions.navigations || 0) + ' reload=' + Number(actions.reloads || 0) + ' focus=' + Number(actions.focuses || 0) + ' close=' + Number(actions.closes || 0))],
        ['Retirements', escapeHtml('closed=' + Number(retirements.closed || 0) + ' missing=' + Number(retirements.alreadyMissing || 0) + ' preserved=' + Number(retirements.preserved || 0))],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
      $('tabConcurrencyRaw').textContent = asJson(concurrency);
    }

    function renderConfigIdentityProjection(status) {
      const entries = ((status.accountMirrorStatus || {}).entries || []).slice();
      if (!entries.length) {
        $('configIdentitySummary').innerHTML = '<span class="muted">No configured service/profile identity projections.</span>';
        return;
      }
      $('configIdentitySummary').innerHTML = '<table><thead><tr>'
        + '<th>Provider</th><th>Tenant Key</th><th>Binding Key</th><th>Runtime Profile</th><th>Browser Profile</th><th>Expected</th><th>Detected</th><th>Account Level</th><th>Status</th>'
        + '</tr></thead><tbody>'
        + entries.map((entry) => {
          const expected = entry.expectedIdentityKey || 'missing';
          const detected = entry.detectedIdentityKey || 'unknown';
          const identityClass = !entry.expectedIdentityKey ? 'bad' : (entry.expectedIdentityKey === entry.detectedIdentityKey ? 'ok' : 'warn');
          return '<tr>'
            + '<td>' + escapeHtml(entry.provider || 'unknown') + '</td>'
            + '<td>' + escapeHtml(entry.tenantKey || 'unbound') + '</td>'
            + '<td>' + escapeHtml(entry.bindingKey || 'not reported') + '</td>'
            + '<td>' + escapeHtml(entry.runtimeProfileId || 'default') + '</td>'
            + '<td>' + escapeHtml(entry.browserProfileId || 'default') + '</td>'
            + '<td class="' + identityClass + '">' + escapeHtml(expected) + '</td>'
            + '<td>' + escapeHtml(detected) + '</td>'
            + '<td>' + escapeHtml(entry.accountLevel || 'unknown') + '</td>'
            + '<td>' + escapeHtml(entry.status || 'unknown') + '</td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
    }

    function renderConfigLiveFollowProjection(status) {
      const liveFollow = status.liveFollow || {};
      const targets = liveFollow.targets || {};
      const accounts = (targets.accounts || []).slice();
      if (!accounts.length) {
        $('configLiveFollowSummary').innerHTML = '<span class="muted">No live-follow target projections.</span>';
        return;
      }
      $('configLiveFollowSummary').innerHTML = '<div class="notice">'
        + 'severity=' + escapeHtml(liveFollow.severity || 'unknown')
        + ' scheduler=' + escapeHtml(liveFollow.schedulerState || 'unknown')
        + ' enabled=' + escapeHtml(String(targets.enabled ?? 0))
        + ' active=' + escapeHtml(String(targets.active ?? 0))
        + '</div>'
        + '<table><thead><tr>'
        + '<th>Provider</th><th>Tenant Key</th><th>Binding Key</th><th>Runtime Profile</th><th>Desired</th><th>Actual</th><th>Phase</th><th>Next Attempt</th><th>Completeness</th><th>Controls</th>'
        + '</tr></thead><tbody>'
        + accounts.map((account) => '<tr>'
          + '<td>' + escapeHtml(account.provider || 'unknown') + '</td>'
          + '<td>' + escapeHtml(account.tenantKey || 'unbound') + '</td>'
          + '<td>' + escapeHtml(account.bindingKey || 'not reported') + '</td>'
          + '<td>' + escapeHtml(account.runtimeProfileId || 'default') + '</td>'
          + '<td>' + escapeHtml(account.desiredState || 'unknown') + '</td>'
          + '<td>' + escapeHtml(account.actualStatus || 'unknown') + '</td>'
          + '<td>' + escapeHtml(account.phase || 'none') + '</td>'
          + '<td>' + escapeHtml(account.nextAttemptAt || 'none') + '</td>'
          + '<td>' + escapeHtml(account.mirrorCompleteness || 'unknown') + '</td>'
          + '<td>' + renderLiveFollowAccountControls(account) + '</td>'
          + '</tr>').join('')
        + '</tbody></table>';
    }

    function buildAgentsTeamInspectionQuery(kind) {
      const params = new URLSearchParams();
      const taskRunSpecId = $('agentTaskRunSpecId').value.trim();
      const teamRunId = $('agentTeamRunId').value.trim();
      const runtimeRunId = $('agentRuntimeRunId').value.trim();
      const runnerId = $('agentRunnerId').value.trim();
      if (taskRunSpecId) params.set('taskRunSpecId', taskRunSpecId);
      if (teamRunId) params.set('teamRunId', teamRunId);
      if (runtimeRunId) params.set('runtimeRunId', runtimeRunId);
      if (kind === 'runtime' && runnerId) params.set('runnerId', runnerId);
      return params;
    }

    function setAgentsTeamsNotice(message, tone) {
      const node = $('agentsTeamsNotice');
      node.className = 'notice notice-' + (tone || 'warn');
      node.textContent = message;
    }

    async function loadAgentsDiagnostics() {
      $('agentsDiagnosticsHeadline').textContent = 'Loading agent diagnostics...';
      $('agentsDiagnosticsSummary').innerHTML = '<span class="muted">Loading agent diagnostics...</span>';
      try {
        const payload = await fetchJson('/v1/config/agent-diagnostics');
        renderAgentsDiagnostics(payload);
        setAgentsTeamsNotice('Agent diagnostics loaded.', payload.ok ? 'ok' : 'warn');
      } catch (error) {
        const message = String(error.message || error);
        $('agentsDiagnosticsHeadline').textContent = 'Agent diagnostics unavailable.';
        $('agentsDiagnosticsSummary').innerHTML = '<div class="notice notice-bad">Agent diagnostics failed: ' + escapeHtml(message) + '</div>';
        setAgentsTeamsNotice('Agent diagnostics failed: ' + message, 'bad');
      }
    }

    function renderAgentsDiagnostics(payload) {
      const metrics = payload.metrics || {};
      const apiKeys = Array.isArray(payload.apiKeys) ? payload.apiKeys : [];
      const conflicts = Array.isArray(payload.conflicts) ? payload.conflicts : [];
      const disabledAgents = Array.isArray(payload.disabledRegistryAgents) ? payload.disabledRegistryAgents : [];
      const disabledTeams = Array.isArray(payload.disabledRegistryTeams) ? payload.disabledRegistryTeams : [];
      const issues = Array.isArray(payload.issues) ? payload.issues : [];
      const warningCount = readNumberField(metrics, ['warnings']);
      $('agentsDiagnosticsHeadline').innerHTML = '<span class="' + (warningCount ? 'warn' : 'ok') + '">'
        + escapeHtml(payload.ok ? 'healthy' : 'attention needed')
        + '</span> '
        + escapeHtml(String(metrics.effectiveAgents ?? 0)) + ' agents / '
        + escapeHtml(String(metrics.effectiveTeams ?? 0)) + ' teams / '
        + escapeHtml(String(metrics.apiKeys ?? 0)) + ' API keys / '
        + escapeHtml(String(warningCount)) + ' warnings';
      $('agentsDiagnosticsSummary').innerHTML = ''
        + '<div class="badges" style="margin-bottom: 8px;">'
        + renderBadge('agents', metrics.effectiveAgents || 0, 'ok')
        + renderBadge('teams', metrics.effectiveTeams || 0, 'ok')
        + renderBadge('api keys', metrics.apiKeys || 0, apiKeys.length ? 'ok' : 'muted')
        + renderBadge('warnings', warningCount, warningCount ? 'warn' : 'ok')
        + renderBadge('conflicts', metrics.conflicts || 0, metrics.conflicts ? 'warn' : 'ok')
        + renderBadge('disabled agents', metrics.disabledRegistryAgents || 0, metrics.disabledRegistryAgents ? 'warn' : 'ok')
        + renderBadge('disabled teams', metrics.disabledRegistryTeams || 0, metrics.disabledRegistryTeams ? 'warn' : 'ok')
        + '</div>'
        + renderAgentsDiagnosticsApiKeys(apiKeys)
        + renderAgentsDiagnosticsList('Config / Registry Conflicts', conflicts, renderAgentsDiagnosticsConflict)
        + renderAgentsDiagnosticsSimpleList('Disabled Registry Agents', disabledAgents)
        + renderAgentsDiagnosticsSimpleList('Disabled Registry Teams', disabledTeams)
        + renderAgentsDiagnosticsList('Issues', issues, renderAgentsDiagnosticsIssue);
    }

    async function loadAgentChoices() {
      $('agentChoicesSummary').innerHTML = '<span class="muted">Loading agent choices...</span>';
      try {
        const payload = await fetchJson('/v1/config/agent-choices');
        renderAgentChoices(payload);
        setAgentsTeamsNotice('Agent choices loaded.', payload.validation && payload.validation.ok ? 'ok' : 'warn');
      } catch (error) {
        const message = String(error.message || error);
        $('agentChoicesSummary').innerHTML = '<div class="notice notice-bad">Agent choices failed: ' + escapeHtml(message) + '</div>';
        setAgentsTeamsNotice('Agent choices failed: ' + message, 'bad');
      }
    }

    function renderAgentChoices(payload) {
      const services = Array.isArray(payload.services) ? payload.services : [];
      const tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
      const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
      const selectors = Array.isArray(payload.modelSelectors) ? payload.modelSelectors : [];
      const projects = Array.isArray(payload.projectBindings) ? payload.projectBindings : [];
      const agentValidation = payload.validation && Array.isArray(payload.validation.agents)
        ? payload.validation.agents
        : [];
      $('agentChoicesSummary').innerHTML = ''
        + '<h3>Agent Choices</h3>'
        + '<div class="badges" style="margin-bottom: 8px;">'
        + renderBadge('services', services.length, services.length ? 'ok' : 'warn')
        + renderBadge('tenants', tenants.length, tenants.length ? 'ok' : 'warn')
        + renderBadge('bindings', bindings.length, bindings.length ? 'ok' : 'warn')
        + renderBadge('selectors', selectors.length, selectors.length ? 'ok' : 'muted')
        + renderBadge('projects', projects.length, projects.length ? 'ok' : 'muted')
        + renderBadge('valid agents', agentValidation.filter((agent) => agent.valid).length, payload.validation && payload.validation.ok ? 'ok' : 'warn')
        + '</div>'
        + renderAgentChoiceBindings(bindings)
        + renderAgentChoiceProjects(projects)
        + renderAgentChoiceValidation(agentValidation)
        + '<pre>' + escapeHtml(asJson({
          services,
          tenants,
          modelSelectors: selectors,
          extras: payload.extras || {},
        })) + '</pre>';
    }

    function renderAgentChoiceBindings(bindings) {
      if (!bindings.length) return '<h3>Tenant / Execution Bindings</h3><div class="muted">None.</div>';
      return '<h3>Tenant / Execution Bindings</h3>'
        + '<div class="table-wrap"><table><thead><tr>'
        + '<th>Service</th><th>Tenant</th><th>Runtime Binding</th><th>Browser Profile</th><th>Ready</th>'
        + '</tr></thead><tbody>'
        + bindings.map((binding) => '<tr>'
          + '<td>' + escapeHtml(binding.service || 'unknown') + '</td>'
          + '<td>' + escapeHtml(binding.tenantKey || 'unresolved') + '</td>'
          + '<td><code>' + escapeHtml(binding.runtimeProfileId || 'none') + '</code><div class="muted">' + escapeHtml(binding.bindingKey || 'none') + '</div></td>'
          + '<td>' + escapeHtml(binding.browserProfileId || 'none') + '</td>'
          + '<td>' + renderStatusText(binding.ready ? 'ready' : 'missing tenant', binding.ready ? 'ok' : 'warn') + '</td>'
          + '</tr>').join('')
        + '</tbody></table></div>';
    }

    function renderAgentChoiceProjects(projects) {
      if (!projects.length) return '<h3>Project Bindings</h3><div class="muted">None.</div>';
      return '<h3>Project Bindings</h3>'
        + '<div class="table-wrap"><table><thead><tr>'
        + '<th>Service</th><th>Tenant</th><th>Source</th><th>Mode</th><th>Project</th>'
        + '</tr></thead><tbody>'
        + projects.map((project) => '<tr>'
          + '<td>' + escapeHtml(project.service || 'none') + '</td>'
          + '<td>' + escapeHtml(project.tenantKey || 'unresolved') + '</td>'
          + '<td>' + escapeHtml(project.source || 'none') + '</td>'
          + '<td>' + escapeHtml(project.mode || 'none') + '</td>'
          + '<td>' + escapeHtml(project.providerProjectId || project.id || project.label || 'none') + '</td>'
          + '</tr>').join('')
        + '</tbody></table></div>';
    }

    function renderAgentChoiceValidation(agentValidation) {
      if (!agentValidation.length) return '<h3>Agent Validation</h3><div class="muted">No agents configured.</div>';
      return '<h3>Agent Validation</h3>'
        + '<ul>'
        + agentValidation.map((agent) => '<li>'
          + '<strong>' + escapeHtml(agent.agentId || 'unknown') + '</strong> '
          + renderStatusText(agent.valid ? 'valid' : 'attention', agent.valid ? 'ok' : 'warn')
          + renderAgentChoiceValidationIssues(agent.issues || [])
          + '</li>').join('')
        + '</ul>';
    }

    function renderAgentChoiceValidationIssues(issues) {
      if (!Array.isArray(issues) || !issues.length) return '';
      return '<ul>' + issues.map((issue) => '<li><span class="' + (issue.severity === 'warning' ? 'warn' : 'muted') + '">'
        + escapeHtml(issue.code || 'issue') + '</span>: ' + escapeHtml(issue.message || '') + '</li>').join('') + '</ul>';
    }

    async function loadAgentConfigs() {
      $('agentConfigTable').innerHTML = '<span class="muted">Loading agent configs...</span>';
      try {
        const payload = await fetchJson('/v1/config/agents');
        renderAgentConfigTable(payload.agents || []);
        $('agentConfigResult').textContent = asJson(payload);
        setAgentsTeamsNotice('Agent configs loaded.', 'ok');
      } catch (error) {
        const message = String(error.message || error);
        $('agentConfigTable').innerHTML = '<div class="notice notice-bad">Agent config load failed: ' + escapeHtml(message) + '</div>';
        setAgentsTeamsNotice('Agent config load failed: ' + message, 'bad');
      }
    }

    function renderAgentConfigTable(agents) {
      if (!Array.isArray(agents) || !agents.length) {
        $('agentConfigTable').innerHTML = '<span class="muted">No agents configured.</span>';
        return;
      }
      $('agentConfigTable').innerHTML = '<div class="table-wrap"><table><thead><tr>'
        + '<th>Agent</th><th>Service</th><th>Tenant</th><th>Binding</th><th>Project</th><th>Actions</th>'
        + '</tr></thead><tbody>'
        + agents.map((agent) => '<tr>'
          + '<td><code>' + escapeHtml(agent.id || 'unknown') + '</code><div class="muted">' + escapeHtml(agent.source || 'config') + '</div></td>'
          + '<td>' + escapeHtml(agent.service || agent.defaultService || 'none') + '</td>'
          + '<td>' + escapeHtml(agent.tenantKey || 'unresolved') + '</td>'
          + '<td>' + escapeHtml(agent.bindingId || agent.bindingKey || 'none') + '</td>'
          + '<td>' + escapeHtml(readAgentProjectBindingLabel(agent)) + '</td>'
          + '<td><button type="button" data-agent-config="' + escapeHtml(JSON.stringify(agent)) + '" onclick="editAgentConfigFromTable(this)">Edit</button></td>'
          + '</tr>').join('')
        + '</tbody></table></div>';
    }

    function readAgentProjectBindingLabel(agent) {
      const binding = agent && agent.projectBinding ? agent.projectBinding : {};
      const value = binding.providerProjectId || binding.id || binding.label || agent.projectId || agent.projectName || 'none';
      return String(value) + ' (' + String(binding.source || 'none') + ')';
    }

    function editAgentConfigFromTable(button) {
      try {
        const agent = JSON.parse(button.dataset.agentConfig || '{}');
        const config = compactEditableAgentConfig(agent);
        $('agentConfigId').value = agent.id || '';
        $('agentConfigJson').value = asJson(config);
        setAgentsTeamsNotice('Loaded agent ' + (agent.id || 'unknown') + ' for editing.', 'ok');
      } catch (error) {
        setAgentsTeamsNotice('Could not load agent config into editor: ' + String(error.message || error), 'bad');
      }
    }

    function compactEditableAgentConfig(agent) {
      const keys = [
        'runtimeProfile',
        'runtimeProfileId',
        'service',
        'model',
        'modelSelector',
        'projectId',
        'projectName',
        'projectBinding',
        'conversationId',
        'conversationName',
        'description',
        'instructions',
        'prePrompt',
        'postPrompt',
        'knowledge',
        'defaults',
        'metadata',
      ];
      return keys.reduce((acc, key) => {
        const outputKey = key === 'runtimeProfileId' ? 'runtimeProfile' : key;
        if (agent[key] !== undefined && acc[outputKey] === undefined) acc[outputKey] = agent[key];
        return acc;
      }, compactAgentIdentityOverrides(agent));
    }

    function compactAgentIdentityOverrides(agent) {
      const acc = {};
      if (agent.tenantKey && agent.projectBinding && agent.projectBinding.source === 'agent') {
        acc.tenantKey = agent.tenantKey;
      }
      if (agent.bindingId && agent.bindingId !== agent.bindingKey) {
        acc.bindingId = agent.bindingId;
      }
      return acc;
    }

    async function saveAgentConfig() {
      const id = $('agentConfigId').value.trim();
      if (!id) {
        setAgentsTeamsNotice('Enter an agent id before saving.', 'warn');
        return;
      }
      let config;
      try {
        config = JSON.parse($('agentConfigJson').value || '{}');
      } catch (error) {
        setAgentsTeamsNotice('Agent config JSON is invalid: ' + String(error.message || error), 'bad');
        return;
      }
      await mutateAgentConfig(id, config, 'PUT', 'Agent saved.');
    }

    async function duplicateAgentConfig() {
      const sourceId = $('agentConfigId').value.trim();
      const targetId = $('agentConfigDuplicateId').value.trim();
      if (!sourceId || !targetId) {
        setAgentsTeamsNotice('Enter source and duplicate target agent ids.', 'warn');
        return;
      }
      let config;
      try {
        config = JSON.parse($('agentConfigJson').value || '{}');
      } catch (error) {
        setAgentsTeamsNotice('Agent config JSON is invalid: ' + String(error.message || error), 'bad');
        return;
      }
      await mutateAgentConfig(targetId, config, 'PUT', 'Agent duplicated.');
    }

    async function archiveAgentConfig() {
      const id = $('agentConfigId').value.trim();
      if (!id) {
        setAgentsTeamsNotice('Enter an agent id before archiving.', 'warn');
        return;
      }
      await mutateAgentConfig(id, null, 'DELETE', 'Agent archived.');
    }

    async function mutateAgentConfig(id, config, method, successMessage) {
      try {
        const response = await fetch('/v1/config/agents/' + encodeURIComponent(id), {
          method,
          headers: config ? { 'content-type': 'application/json' } : {},
          body: config ? JSON.stringify(config) : undefined,
        });
        const payload = await response.json();
        $('agentConfigResult').textContent = asJson(payload);
        if (!response.ok) throw new Error(payload && payload.error ? payload.error.message : 'Request failed.');
        setAgentsTeamsNotice(successMessage, payload.mutationTarget === 'blocked' ? 'warn' : 'ok');
        await loadAgentConfigs();
        await loadAgentChoices();
        await loadAgentsDiagnostics();
      } catch (error) {
        setAgentsTeamsNotice('Agent config mutation failed: ' + String(error.message || error), 'bad');
      }
    }

    function renderAgentsDiagnosticsApiKeys(apiKeys) {
      if (!apiKeys.length) {
        return '<h3>API Key Reachability</h3><div class="muted">No API keys loaded.</div>';
      }
      return '<h3>API Key Reachability</h3>'
        + '<div class="table-wrap"><table id="agentsDiagnosticsApiKeysTable"><thead><tr>'
        + '<th>Key ID</th><th>Scope</th><th>Secret</th><th>Effective Agents</th><th>Missing Targets</th>'
        + '</tr></thead><tbody>'
        + apiKeys.map((key) => '<tr>'
          + '<td>' + escapeHtml(key.id || 'unknown') + '</td>'
          + '<td>' + escapeHtml(key.scoped ? 'scoped' : 'unscoped') + renderAgentsDiagnosticsScopeDetail(key) + '</td>'
          + '<td>' + escapeHtml(key.hasSecret ? 'present' : 'missing') + '</td>'
          + '<td>' + escapeHtml(formatDashboardList(key.effectiveAgents || [])) + '</td>'
          + '<td>' + escapeHtml(formatDashboardList([]
            .concat((key.missingAgents || []).map((id) => 'agent:' + id))
            .concat((key.missingTeams || []).map((id) => 'team:' + id))
            .concat((key.missingRuntimeProfiles || []).map((id) => 'runtime:' + id)))) + '</td>'
          + '</tr>').join('')
        + '</tbody></table></div>';
    }

    function renderAgentsDiagnosticsScopeDetail(key) {
      const parts = [];
      if (Array.isArray(key.agents) && key.agents.length) parts.push('agents=' + key.agents.join(', '));
      if (Array.isArray(key.teams) && key.teams.length) parts.push('teams=' + key.teams.join(', '));
      if (Array.isArray(key.services) && key.services.length) parts.push('services=' + key.services.join(', '));
      if (Array.isArray(key.runtimeProfiles) && key.runtimeProfiles.length) parts.push('runtime=' + key.runtimeProfiles.join(', '));
      return parts.length ? '<div class="muted">' + escapeHtml(parts.join(' / ')) + '</div>' : '';
    }

    function renderAgentsDiagnosticsList(title, rows, renderRow) {
      if (!rows.length) return '<h3>' + escapeHtml(title) + '</h3><div class="muted">None.</div>';
      return '<h3>' + escapeHtml(title) + '</h3><ul>'
        + rows.map((row) => '<li>' + renderRow(row) + '</li>').join('')
        + '</ul>';
    }

    function renderAgentsDiagnosticsSimpleList(title, rows) {
      return renderAgentsDiagnosticsList(title, rows, (row) => escapeHtml(row));
    }

    function renderAgentsDiagnosticsConflict(conflict) {
      return escapeHtml((conflict.kind || 'record') + ' ' + (conflict.id || 'unknown') + ': ' + (conflict.resolution || 'unknown'));
    }

    function renderAgentsDiagnosticsIssue(issue) {
      return '<span class="' + (issue.severity === 'warning' ? 'warn' : 'muted') + '">'
        + escapeHtml(issue.severity || 'info')
        + '</span> '
        + escapeHtml(issue.code || 'issue')
        + ': '
        + escapeHtml(issue.message || '');
    }

    function formatDashboardList(values) {
      return Array.isArray(values) && values.length ? values.join(', ') : 'none';
    }

    function readAgentApiKeyIssueRequest() {
      const request = {};
      const agentId = $('agentApiKeyAgentId').value.trim();
      const teamId = $('agentApiKeyTeamId').value.trim();
      const keyId = $('agentApiKeyId').value.trim();
      const envPath = $('agentApiKeyEnvPath').value.trim();
      if (agentId) request.agentId = agentId;
      if (teamId) request.teamId = teamId;
      if (keyId) request.keyId = keyId;
      if (envPath) request.envPath = envPath;
      request.services = parseDashboardIdList($('agentApiKeyServices').value);
      request.runtimeProfiles = parseDashboardIdList($('agentApiKeyRuntimeProfiles').value);
      request.overwrite = $('agentApiKeyOverwrite').checked;
      return request;
    }

    function setAgentApiKeyResult(message, tone, payload) {
      $('agentApiKeyResult').textContent = payload ? asJson(payload) : message;
      setAgentsTeamsNotice(message, tone);
    }

    async function issueAgentApiKey() {
      const button = $('issueAgentApiKey');
      button.disabled = true;
      try {
        const payload = await postJson('/v1/config/api-keys/issue', readAgentApiKeyIssueRequest());
        setAgentApiKeyResult('API key issued. Store the returned secret and restart auracall-api.service before using it.', 'ok', payload);
        void loadAgentsDiagnostics();
      } catch (error) {
        setAgentApiKeyResult('API key issue failed: ' + String(error.message || error), 'bad');
      } finally {
        button.disabled = false;
      }
    }

    function readAgentSnapshotExportRequest() {
      const scope = $('agentSnapshotScope').value;
      if (scope === 'all') return { all: true };
      return {
        agents: parseDashboardIdList($('agentSnapshotAgentIds').value),
        teams: parseDashboardIdList($('agentSnapshotTeamIds').value),
      };
    }

    function parseDashboardIdList(value) {
      return String(value || '')
        .split(/[,\\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    function setAgentSnapshotResult(message, tone, payload) {
      $('agentSnapshotResult').textContent = payload ? asJson(payload) : message;
      setAgentsTeamsNotice(message, tone);
    }

    async function downloadAgentSnapshot() {
      const button = $('downloadAgentSnapshot');
      button.disabled = true;
      try {
        const request = readAgentSnapshotExportRequest();
        const payload = await postJson('/v1/config/snapshots/export', request);
        downloadJsonPayload(payload, formatAgentSnapshotFilename(payload));
        setAgentSnapshotResult('Snapshot downloaded.', 'ok', payload);
      } catch (error) {
        setAgentSnapshotResult('Snapshot export failed: ' + String(error.message || error), 'bad');
      } finally {
        button.disabled = false;
      }
    }

    async function dryRunAgentSnapshotImport() {
      await runAgentSnapshotImport(true);
    }

    async function applyAgentSnapshotImport() {
      await runAgentSnapshotImport(false);
    }

    async function runAgentSnapshotImport(dryRun) {
      const button = dryRun ? $('dryRunAgentSnapshotImport') : $('applyAgentSnapshotImport');
      button.disabled = true;
      try {
        const snapshot = await readAgentSnapshotImportFile();
        const payload = await postJson('/v1/config/snapshots/import', { snapshot, dryRun });
        setAgentSnapshotResult((dryRun ? 'Snapshot dry-run completed.' : 'Snapshot import applied.'), payload.blockedAgents?.length || payload.blockedTeams?.length ? 'warn' : 'ok', payload);
        if (!dryRun) void loadAgentsDiagnostics();
      } catch (error) {
        setAgentSnapshotResult('Snapshot import failed: ' + String(error.message || error), 'bad');
      } finally {
        button.disabled = false;
      }
    }

    async function readAgentSnapshotImportFile() {
      const input = $('agentSnapshotImportFile');
      const file = input.files && input.files[0];
      if (!file) throw new Error('Choose a snapshot JSON file first.');
      return JSON.parse(await file.text());
    }

    function downloadJsonPayload(payload, filename) {
      const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }

    function formatAgentSnapshotFilename(payload) {
      const exportedAt = String(payload.exportedAt || new Date().toISOString()).replace(/[:.]/g, '-');
      return 'auracall-agent-snapshot-' + exportedAt + '.json';
    }

    function renderAgentsTeamsInspection(kind, payload) {
      const record = payload && typeof payload === 'object' ? payload : {};
      const fields = kind === 'team'
        ? [
            ['Kind', 'team'],
            ['Team Run', readStringField(record, ['teamRunId', 'id']) || 'unknown'],
            ['Runtime Run', readStringField(record, ['runtimeRunId']) || 'unknown'],
            ['Task Spec', readStringField(record, ['taskRunSpecId']) || 'unknown'],
          ]
        : [
            ['Kind', 'runtime'],
            ['Run', readStringField(record, ['runId', 'runtimeRunId', 'id']) || 'unknown'],
            ['Status', readStringField(record, ['status']) || readStringField(record.run || {}, ['status']) || 'unknown'],
            ['Runner', readStringField(record, ['runnerId']) || readStringField(record.runner || {}, ['id']) || 'unknown'],
          ];
      $('agentsTeamsSummary').innerHTML = fields.map(([key, value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(String(value)) + '</dd>'
      ).join('');
      $('agentsTeamsConversation').innerHTML = kind === 'runtime'
        ? renderAgentsRuntimeConversation(record)
        : '<span class="muted">Conversation view is available for runtime inspections.</span>';
      $('agentsTeamsRaw').textContent = asJson(payload);
      if (kind === 'runtime') hydrateAgentsRuntimeProviderCacheBadges();
    }

    function renderAgentsRuntimeConversation(payload) {
      const inspection = payload.inspection || payload;
      const conversation = inspection.conversation || {};
      const turns = Array.isArray(conversation.turns) ? conversation.turns : [];
      const providerRefs = Array.isArray(conversation.providerConversationRefs) ? conversation.providerConversationRefs : [];
      if (!turns.length) {
        return '<div class="notice notice-warn">No runtime conversation turns are available for this run yet.</div>';
      }
      return '<h3>Runtime Conversation</h3>'
        + renderAgentsRuntimeProviderConversationRefs(providerRefs)
        + '<div class="chat-transcript agents-runtime-conversation">'
        + turns.map(renderAgentsRuntimeConversationTurn).join('')
        + '</div>';
    }

    function renderAgentsRuntimeProviderConversationRefs(refs) {
      if (!refs.length) return '';
      return '<div class="notice">'
        + '<strong>Cached provider conversations</strong>'
        + '<div class="catalog-detail agents-runtime-provider-conversations">'
        + renderAgentsRuntimeProviderCacheSummary()
        + refs.map(renderAgentsRuntimeProviderConversationRef).join('')
        + '</div>'
        + '</div>';
    }

    function renderAgentsRuntimeProviderCacheSummary() {
      return '<div class="muted" data-runtime-provider-cache-summary="pending">cache summary pending</div>';
    }

    function renderAgentsRuntimeProviderConversationRef(ref) {
      const title = [
        ref.provider || ref.service || 'provider',
        ref.conversationId || 'conversation',
      ].filter(Boolean).join(' / ');
      const subtitle = [
        ref.runtimeProfileId ? 'runtime ' + ref.runtimeProfileId : null,
        ref.projectId ? 'project ' + ref.projectId : null,
      ].filter(Boolean).join(' / ');
      const accountMirrorPath = ref.accountMirrorPath || '';
      const catalogItemPath = ref.catalogItemPath || '';
      const providerUrl = ref.tabUrl || ref.configuredUrl || '';
      return '<span class="pill agents-runtime-provider-conversation">'
        + (accountMirrorPath
          ? '<a class="link-button" href="' + escapeHtml(accountMirrorPath) + '" data-runtime-provider-conversation-path="' + escapeHtml(accountMirrorPath) + '" data-runtime-provider-conversation-direct-link="true">'
            + escapeHtml(title)
            + '</a>'
          : escapeHtml(title))
        + (subtitle ? ' <span class="muted">' + escapeHtml(subtitle) + '</span>' : '')
        + (catalogItemPath
          ? ' <span class="pill muted" data-runtime-provider-cache-badge="pending" data-runtime-provider-cache-badge-state="pending" data-runtime-provider-catalog-item-path="' + escapeHtml(catalogItemPath) + '">checking cache</span>'
          : ' <span class="pill muted" data-runtime-provider-cache-badge="metadata-only" data-runtime-provider-cache-badge-state="unknown">cache status unknown</span>')
        + (catalogItemPath
          ? ' <a href="' + escapeHtml(catalogItemPath) + '" data-runtime-provider-catalog-item-path="' + escapeHtml(catalogItemPath) + '">cache item</a>'
          : '')
        + (providerUrl
          ? ' <a href="' + escapeHtml(providerUrl) + '" target="_blank" rel="noreferrer">provider</a>'
          : '')
        + '</span>';
    }

    async function hydrateAgentsRuntimeProviderCacheBadges() {
      const badges = Array.from(document.querySelectorAll('[data-runtime-provider-cache-badge="pending"]'));
      await Promise.all(badges.map(async (badge) => {
        const path = badge.dataset.runtimeProviderCatalogItemPath || '';
        if (!path) {
          badge.textContent = 'cache status unknown';
          badge.dataset.runtimeProviderCacheBadgeState = 'unknown';
          return;
        }
        try {
          const detail = await fetchJson(path);
          const status = summarizeAgentsRuntimeProviderCacheDetail(detail);
          badge.textContent = status.label;
          badge.dataset.runtimeProviderCacheBadgeState = status.state;
        } catch {
          badge.textContent = 'cache status unavailable';
          badge.dataset.runtimeProviderCacheBadgeState = 'unavailable';
        }
      }));
      summarizeAgentsRuntimeProviderCacheRows();
      summarizeAgentsRecentMirrorCacheRows();
    }

    function summarizeAgentsRuntimeProviderCacheDetail(detail) {
      const item = detail && detail.item && typeof detail.item === 'object' ? detail.item : {};
      const messageCount = readNumberField(item, ['messageCount']);
      const hydratedMessageCount = Array.isArray(item.messages) ? item.messages.length : 0;
      const transcriptCount = Math.max(messageCount, hydratedMessageCount);
      if (readBooleanField(item, ['hasCachedTranscript']) || transcriptCount > 0) {
        return { state: 'transcript', label: 'cached transcript ' + String(transcriptCount || '') };
      }
      const assetCount = readNumberField(item, ['cachedFileCount'])
        + readNumberField(item, ['cachedSourceCount'])
        + readNumberField(item, ['cachedArtifactCount'])
        + (Array.isArray(item.files) ? item.files.length : 0)
        + (Array.isArray(item.sources) ? item.sources.length : 0)
        + (Array.isArray(item.artifacts) ? item.artifacts.length : 0);
      if (assetCount > 0) return { state: 'metadata-assets', label: 'metadata + assets ' + String(assetCount) };
      return { state: 'metadata-only', label: 'metadata only' };
    }

    function renderAgentsRuntimeConversationTurn(turn) {
      const role = normalizeAgentsRuntimeConversationRole(turn.role);
      const meta = [
        turn.agentId || null,
        turn.service || null,
        turn.status || null,
        turn.runtimeProfileId || null,
      ].filter(Boolean).join(' / ');
      return '<div class="chat-turn chat-turn-' + escapeHtml(role) + '" data-runtime-step-id="' + escapeHtml(turn.stepId || '') + '">'
        + '<div class="chat-role">' + escapeHtml(role) + (meta ? ' <span class="muted">' + escapeHtml(meta) + '</span>' : '') + '</div>'
        + '<div class="chat-bubble">' + escapeHtml(turn.content || '') + '</div>'
        + '</div>';
    }

    function normalizeAgentsRuntimeConversationRole(role) {
      const normalized = String(role || 'assistant').toLowerCase();
      if (normalized === 'user' || normalized === 'assistant' || normalized === 'system' || normalized === 'tool') {
        return normalized;
      }
      return 'assistant';
    }

    async function inspectAgentsTeamRun() {
      const params = buildAgentsTeamInspectionQuery('team');
      if (!params.toString()) {
        setAgentsTeamsNotice('Enter a task, team, or runtime id before inspecting.', 'warn');
        return;
      }
      setAgentsTeamsNotice('Inspecting team run...', 'warn');
      try {
        const payload = await fetchJson('/v1/team-runs/inspect?' + params.toString());
        renderAgentsTeamsInspection('team', payload);
        setAgentsTeamsNotice('Team inspection loaded.', 'ok');
      } catch (error) {
        $('agentsTeamsRaw').textContent = String(error.message || error);
        setAgentsTeamsNotice('Team inspection failed: ' + String(error.message || error), 'bad');
      }
    }

    async function inspectAgentsRuntimeRun() {
      const params = buildAgentsTeamInspectionQuery('runtime');
      if (!params.toString()) {
        setAgentsTeamsNotice('Enter a task, team, or runtime id before inspecting.', 'warn');
        return;
      }
      setAgentsTeamsNotice('Inspecting runtime run...', 'warn');
      try {
        const payload = await fetchJson('/v1/runtime-runs/inspect?' + params.toString());
        renderAgentsTeamsInspection('runtime', payload);
        setAgentsTeamsNotice('Runtime inspection loaded.', 'ok');
      } catch (error) {
        $('agentsTeamsRaw').textContent = String(error.message || error);
        setAgentsTeamsNotice('Runtime inspection failed: ' + String(error.message || error), 'bad');
      }
    }

    function buildAgentsRecentRunsPath() {
      const params = new URLSearchParams();
      const sourceKind = $('agentsRecentRunSourceKind').value;
      const status = $('agentsRecentRunStatus').value;
      const limit = $('agentsRecentRunLimit').value;
      if (sourceKind) params.set('sourceKind', sourceKind);
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit);
      return '/v1/runtime-runs/recent?' + params.toString();
    }

    async function loadAgentsRecentRuns() {
      $('agentsRecentRuns').textContent = 'Loading recent runs...';
      try {
        const payload = await fetchJson(buildAgentsRecentRunsPath());
        renderAgentsRecentRuns(payload.data || []);
        await hydrateAgentsRuntimeProviderCacheBadges();
        setAgentsTeamsNotice('Loaded ' + String(payload.count || 0) + ' recent runs.', 'ok');
      } catch (error) {
        $('agentsRecentRuns').textContent = String(error.message || error);
        setAgentsTeamsNotice('Failed to load recent runs: ' + String(error.message || error), 'bad');
      }
    }

    function renderAgentsRecentRuns(runs) {
      if (!runs.length) {
        $('agentsRecentRuns').innerHTML = '<span class="muted">No recent runtime runs matched the filters.</span>';
        return;
      }
      $('agentsRecentRuns').innerHTML = '<div class="table-wrap"><table id="agentsRecentRunsTable"><thead><tr>'
        + '<th>Run</th><th>Source</th><th>Status</th><th>Updated</th><th>Services</th><th>Steps</th><th>Mirror</th><th>Actions</th>'
        + '</tr></thead><tbody>'
        + runs.map((run, index) => '<tr data-agents-recent-run-row="true" data-agents-recent-run-index="' + escapeHtml(String(index)) + '" data-agents-recent-mirror-cache-state="pending" data-agents-recent-mirror-cache-rank="0">'
          + '<td class="wrap">' + escapeHtml(run.runId || 'unknown') + '</td>'
          + '<td>' + escapeHtml(run.sourceKind || 'unknown') + '</td>'
          + '<td>' + escapeHtml(run.status || 'unknown') + '</td>'
          + '<td>' + escapeHtml(run.updatedAt || 'unknown') + '</td>'
          + '<td>' + escapeHtml((run.serviceIds || []).join(', ') || 'none') + '</td>'
          + '<td>' + escapeHtml(String(run.stepCount || 0)) + ' total / ' + escapeHtml(String(run.runningStepCount || 0)) + ' running</td>'
          + '<td>' + renderAgentsRecentMirrorSummary(run) + '</td>'
          + '<td><span class="catalog-row-actions">'
          + '<button type="button" data-runtime-run-id="' + escapeHtml(run.runId || '') + '" data-team-run-id="' + escapeHtml(run.teamRunId || '') + '" data-task-run-spec-id="' + escapeHtml(run.taskRunSpecId || '') + '" onclick="useAgentsRecentRun(this)">Use</button>'
          + '<button type="button" data-runtime-run-id="' + escapeHtml(run.runId || '') + '" data-team-run-id="' + escapeHtml(run.teamRunId || '') + '" data-task-run-spec-id="' + escapeHtml(run.taskRunSpecId || '') + '" onclick="inspectAgentsRecentRuntimeRun(this)">Inspect Runtime</button>'
          + '<button type="button" data-runtime-run-id="' + escapeHtml(run.runId || '') + '" data-team-run-id="' + escapeHtml(run.teamRunId || '') + '" data-task-run-spec-id="' + escapeHtml(run.taskRunSpecId || '') + '" data-mirror-detail-available="' + escapeHtml(String(hasAgentsRecentMirrorDetail(run))) + '" onclick="openAgentsRecentMirrorDetail(this)"' + (hasAgentsRecentMirrorDetail(run) ? '' : ' disabled title="No stored provider conversation link for this run"') + '>Open Mirror Detail</button>'
          + (run.teamRunId ? '<button type="button" data-runtime-run-id="' + escapeHtml(run.runId || '') + '" data-team-run-id="' + escapeHtml(run.teamRunId || '') + '" data-task-run-spec-id="' + escapeHtml(run.taskRunSpecId || '') + '" onclick="inspectAgentsRecentTeamRun(this)">Inspect Team</button>' : '')
          + '</span></td>'
          + '</tr>').join('')
        + '</tbody></table></div>';
      summarizeAgentsRecentMirrorCacheRows();
    }

    function renderAgentsRecentMirrorSummary(run) {
      const summary = run.providerConversationSummary || {};
      const count = Number(summary.count || 0);
      if (!count) return '<span class="muted" data-agents-recent-mirror-cache-summary="none">none</span>';
      const providers = Array.isArray(summary.providers) ? summary.providers.join(', ') : (summary.firstProvider || 'provider');
      const label = escapeHtml(String(count)) + ' cached ' + escapeHtml(count === 1 ? 'conversation' : 'conversations');
      const summaryLabel = count === 1 && summary.firstAccountMirrorPath
        ? '<button type="button" class="link-button" data-agents-recent-mirror-summary="available" data-account-mirror-path="' + escapeHtml(summary.firstAccountMirrorPath) + '" onclick="openAgentsRecentMirrorSummary(this)">' + label + '</button>'
        : '<span class="ok" data-agents-recent-mirror-summary="available">'
          + label
          + '</span>';
      return summaryLabel
        + renderAgentsRecentMirrorCacheBadge(summary)
        + renderAgentsRecentMirrorCacheSummary()
        + '<div class="muted">' + escapeHtml(providers || 'provider') + '</div>';
    }

    function renderAgentsRecentMirrorCacheBadge(summary) {
      const refs = Array.isArray(summary.conversations) && summary.conversations.length
        ? summary.conversations
        : [{
            provider: summary.firstProvider || '',
            conversationId: summary.firstConversationId || '',
            runtimeProfileId: '',
            catalogItemPath: summary.firstCatalogItemPath || '',
            accountMirrorPath: summary.firstAccountMirrorPath || '',
          }];
      const visibleRefs = refs.slice(0, 4);
      const badges = visibleRefs.map((ref) => renderAgentsRecentMirrorCacheBadgeButton(ref)).join('');
      return badges + renderAgentsRecentMirrorRefExpansion(refs.slice(4));
    }

    function renderAgentsRecentMirrorCacheSummary() {
      return '<div class="muted" data-agents-recent-mirror-cache-summary="pending">cache summary pending</div>';
    }

    function renderAgentsRecentMirrorRefExpansion(refs) {
      if (!refs.length) return '';
      return ' <details class="inline-details" data-agents-recent-mirror-ref-expansion="true">'
        + '<summary class="link-button">+' + escapeHtml(String(refs.length)) + ' more</summary>'
        + '<span class="catalog-row-actions">'
        + refs.map((ref) => renderAgentsRecentMirrorCacheBadgeButton(ref)).join('')
        + '</span>'
        + '</details>';
    }

    function renderAgentsRecentMirrorCacheBadgeButton(ref) {
      const catalogItemPath = ref.catalogItemPath || '';
      const accountMirrorPath = ref.accountMirrorPath || '';
      if (!catalogItemPath || !accountMirrorPath) {
        return ' <span class="pill muted" data-agents-recent-mirror-cache-badge="unavailable" data-runtime-provider-cache-badge-state="unknown">cache status unknown</span>';
      }
      const title = [
        ref.provider || 'provider',
        ref.conversationId || 'conversation',
        ref.runtimeProfileId ? 'runtime ' + ref.runtimeProfileId : '',
      ].filter(Boolean).join(' / ');
      return ' <button type="button" class="link-button pill muted" data-agents-recent-mirror-cache-badge="pending" data-runtime-provider-cache-badge="pending" data-runtime-provider-cache-badge-state="pending" data-runtime-provider-catalog-item-path="' + escapeHtml(catalogItemPath) + '" data-account-mirror-path="' + escapeHtml(accountMirrorPath) + '" title="' + escapeHtml(title) + '" onclick="openAgentsRecentMirrorCacheBadge(this)">checking cache</button>';
    }

    function summarizeAgentsRecentMirrorCacheRows() {
      for (const summary of document.querySelectorAll('[data-agents-recent-mirror-cache-summary]')) {
        const cell = summary.closest('td');
        const badges = cell ? Array.from(cell.querySelectorAll('[data-agents-recent-mirror-cache-badge]')) : [];
        if (!badges.length) {
          const state = summary.dataset.agentsRecentMirrorCacheSummary === 'none' ? 'none' : 'unavailable';
          summary.textContent = state === 'none' ? 'none' : 'cache summary unavailable';
          stampAgentsRecentMirrorCacheRowState(summary, state);
          continue;
        }
        const counts = countAgentsRuntimeProviderCacheBadges(badges);
        summary.textContent = formatAgentsRecentMirrorCacheSummary(counts);
        stampAgentsRecentMirrorCacheRowState(summary, classifyAgentsRecentMirrorCacheCounts(counts));
      }
      applyAgentsRecentMirrorCacheControls();
    }

    function summarizeAgentsRuntimeProviderCacheRows() {
      for (const summary of document.querySelectorAll('[data-runtime-provider-cache-summary]')) {
        const container = summary.closest('.agents-runtime-provider-conversations');
        const badges = container ? Array.from(container.querySelectorAll('[data-runtime-provider-cache-badge]')) : [];
        if (!badges.length) {
          summary.textContent = 'cache summary unavailable';
          summary.dataset.runtimeProviderCacheSummary = 'unavailable';
          continue;
        }
        const counts = countAgentsRuntimeProviderCacheBadges(badges);
        summary.textContent = formatAgentsRecentMirrorCacheSummary(counts);
        summary.dataset.runtimeProviderCacheSummary = counts.pending ? 'pending' : 'ready';
      }
    }

    function countAgentsRuntimeProviderCacheBadges(badges) {
      return badges.reduce((acc, badge) => {
        const state = badge.dataset.runtimeProviderCacheBadgeState || 'unknown';
        if (state === 'transcript') acc.transcript += 1;
        else if (state === 'metadata-assets') acc.assets += 1;
        else if (state === 'metadata-only') acc.metadata += 1;
        else if (state === 'unavailable') acc.unavailable += 1;
        else acc.pending += 1;
        return acc;
      }, { transcript: 0, assets: 0, metadata: 0, unavailable: 0, pending: 0 });
    }

    function classifyAgentsRecentMirrorCacheCounts(counts) {
      if (counts.pending) return 'pending';
      if (counts.unavailable) return 'unavailable';
      if (counts.metadata) return 'metadata';
      if (counts.assets) return 'assets';
      if (counts.transcript) return 'transcript';
      return 'none';
    }

    function stampAgentsRecentMirrorCacheRowState(summary, state) {
      summary.dataset.agentsRecentMirrorCacheSummary = state;
      const row = summary.closest('[data-agents-recent-run-row]');
      if (!row) return;
      row.dataset.agentsRecentMirrorCacheState = state;
      row.dataset.agentsRecentMirrorCacheRank = String(rankAgentsRecentMirrorCacheState(state));
    }

    function rankAgentsRecentMirrorCacheState(state) {
      if (state === 'pending') return 0;
      if (state === 'unavailable') return 1;
      if (state === 'metadata') return 2;
      if (state === 'assets') return 3;
      if (state === 'transcript') return 4;
      return 5;
    }

    function applyAgentsRecentMirrorCacheControls() {
      const table = $('agentsRecentRunsTable');
      if (!table) return;
      const tbody = table.tBodies && table.tBodies[0] ? table.tBodies[0] : null;
      if (!tbody) return;
      const filter = $('agentsRecentMirrorCacheFilter').value || '';
      const sort = $('agentsRecentMirrorCacheSort').value || '';
      const rows = Array.from(tbody.querySelectorAll('[data-agents-recent-run-row]'));
      for (const row of rows) {
        const state = row.dataset.agentsRecentMirrorCacheState || 'pending';
        row.hidden = Boolean(filter && state !== filter);
      }
      const visibleCount = rows.filter((row) => !row.hidden).length;
      const count = $('agentsRecentMirrorCacheVisibleCount');
      if (count) count.textContent = 'showing ' + String(visibleCount) + ' of ' + String(rows.length);
      if (sort === 'cache-state') {
        rows.sort((left, right) =>
          Number(left.dataset.agentsRecentMirrorCacheRank || '5') - Number(right.dataset.agentsRecentMirrorCacheRank || '5')
          || Number(left.dataset.agentsRecentRunIndex || '0') - Number(right.dataset.agentsRecentRunIndex || '0')
        );
      } else {
        rows.sort((left, right) =>
          Number(left.dataset.agentsRecentRunIndex || '0') - Number(right.dataset.agentsRecentRunIndex || '0')
        );
      }
      for (const row of rows) tbody.appendChild(row);
    }

    function collectVisibleAgentsRecentMirrorLinks() {
      const table = $('agentsRecentRunsTable');
      if (!table) return [];
      const rows = Array.from(table.querySelectorAll('[data-agents-recent-run-row]')).filter((row) => !row.hidden);
      const links = [];
      for (const row of rows) {
        for (const node of row.querySelectorAll('[data-account-mirror-path]')) {
          const path = node.dataset.accountMirrorPath || '';
          if (path) links.push(new URL(path, window.location.origin).href);
        }
      }
      return Array.from(new Set(links));
    }

    async function copyVisibleAgentsRecentMirrorLinks() {
      const links = collectVisibleAgentsRecentMirrorLinks();
      if (!links.length) {
        setAgentsTeamsNotice('No visible mirror links to copy.', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(links.join('\\n'));
        setAgentsTeamsNotice('Copied ' + String(links.length) + ' visible mirror link(s).', 'ok');
      } catch {
        setAgentsTeamsNotice('Could not copy visible mirror links.', 'bad');
      }
    }

    function formatAgentsRecentMirrorCacheSummary(counts) {
      const parts = [];
      if (counts.transcript) parts.push(String(counts.transcript) + ' transcript');
      if (counts.assets) parts.push(String(counts.assets) + ' assets');
      if (counts.metadata) parts.push(String(counts.metadata) + ' metadata only');
      if (counts.unavailable) parts.push(String(counts.unavailable) + ' unavailable');
      if (counts.pending) parts.push(String(counts.pending) + ' pending');
      return parts.length ? parts.join(' / ') : 'cache summary unavailable';
    }

    function openAgentsRecentMirrorCacheBadge(button) {
      const path = button.dataset.accountMirrorPath || '';
      if (!path) {
        setAgentsTeamsNotice('No cached provider conversation link is available for this badge.', 'warn');
        return;
      }
      setAgentsTeamsNotice('Opening cached provider conversation detail...', 'ok');
      window.location.href = path;
    }

    function openAgentsRecentMirrorSummary(button) {
      const path = button.dataset.accountMirrorPath || '';
      if (!path) {
        setAgentsTeamsNotice('No cached provider conversation link is available for this summary.', 'warn');
        return;
      }
      setAgentsTeamsNotice('Opening cached provider conversation detail...', 'ok');
      window.location.href = path;
    }

    function hasAgentsRecentMirrorDetail(run) {
      const summary = run.providerConversationSummary || {};
      return Boolean(summary.firstAccountMirrorPath || Number(summary.count || 0) > 0);
    }

    function useAgentsRecentRun(button) {
      $('agentRuntimeRunId').value = button.dataset.runtimeRunId || '';
      $('agentTeamRunId').value = button.dataset.teamRunId || '';
      $('agentTaskRunSpecId').value = button.dataset.taskRunSpecId || '';
      setAgentsTeamsNotice('Selected recent run ' + (button.dataset.runtimeRunId || 'unknown') + '.', 'ok');
    }

    async function inspectAgentsRecentRuntimeRun(button) {
      useAgentsRecentRun(button);
      await inspectAgentsRuntimeRun();
    }

    async function openAgentsRecentMirrorDetail(button) {
      useAgentsRecentRun(button);
      const runtimeRunId = button.dataset.runtimeRunId || '';
      if (!runtimeRunId) {
        setAgentsTeamsNotice('Recent run has no runtime run id for mirror detail lookup.', 'warn');
        return;
      }
      setAgentsTeamsNotice('Looking up cached provider conversation for ' + runtimeRunId + '...', 'warn');
      try {
        const payload = await fetchJson('/v1/runtime-runs/inspect?runtimeRunId=' + encodeURIComponent(runtimeRunId));
        const path = readAgentsRuntimeMirrorDetailPath(payload);
        if (!path) {
          renderAgentsTeamsInspection('runtime', payload);
          setAgentsTeamsNotice('Runtime inspection loaded, but no cached provider conversation link was stored for this run.', 'warn');
          return;
        }
        setAgentsTeamsNotice('Opening cached provider conversation detail...', 'ok');
        window.location.href = path;
      } catch (error) {
        setAgentsTeamsNotice('Failed to open mirror detail: ' + String(error.message || error), 'bad');
      }
    }

    function readAgentsRuntimeMirrorDetailPath(payload) {
      const refs = payload?.inspection?.conversation?.providerConversationRefs || [];
      const first = Array.isArray(refs) ? refs.find((ref) => ref && ref.accountMirrorPath) : null;
      return first?.accountMirrorPath || null;
    }

    async function inspectAgentsRecentTeamRun(button) {
      useAgentsRecentRun(button);
      await inspectAgentsTeamRun();
    }

    function renderMaybeLink(value) {
      if (!value) return '<span class="muted">none</span>';
      const text = escapeHtml(value);
      if (!/^https?:\\/\\//.test(String(value))) return text;
      return '<a href="' + text + '" target="_blank" rel="noreferrer">' + text + '</a>';
    }

    function applyServiceDiscoveryRoutes(routing) {
      const dashboardPath = normalizeDashboardRoutePath(routing && routing.dashboardPath, OPERATOR_DASHBOARD_ROUTES.dashboardPath || '/dashboard');
      const debugDashboardPath = normalizeDashboardRoutePath(routing && routing.debugDashboardPath, OPERATOR_DASHBOARD_ROUTES.debugDashboardPath || '/ops/browser');
      const accountMirrorPath = normalizeDashboardRoutePath(routing && routing.accountMirrorPath, OPERATOR_DASHBOARD_ROUTES.accountMirrorPath || '/account-mirror');
      const previewSessionPath = normalizeDashboardRoutePath(routing && routing.previewSessionPath, OPERATOR_DASHBOARD_ROUTES.previewSessionPath || (accountMirrorPath + '/preview-session'));
      const configPath = normalizeDashboardRoutePath(routing && routing.configPath, OPERATOR_DASHBOARD_ROUTES.configPath || '/config');
      const agentsPath = normalizeDashboardRoutePath(routing && routing.agentsPath, OPERATOR_DASHBOARD_ROUTES.agentsPath || '/agents');
      OPERATOR_DASHBOARD_ROUTES.dashboardPath = dashboardPath;
      OPERATOR_DASHBOARD_ROUTES.debugDashboardPath = debugDashboardPath;
      OPERATOR_DASHBOARD_ROUTES.accountMirrorPath = accountMirrorPath;
      OPERATOR_DASHBOARD_ROUTES.previewSessionPath = previewSessionPath;
      OPERATOR_DASHBOARD_ROUTES.configPath = configPath;
      OPERATOR_DASHBOARD_ROUTES.agentsPath = agentsPath;
      setRouteLink('navBrowserOps', debugDashboardPath);
      setRouteLink('navAccountMirror', accountMirrorPath);
      setRouteLink('navPreviewSession', previewSessionPath);
      setRouteLink('navConfig', configPath);
      setRouteLink('navAgentsTeams', agentsPath);
      setRouteLink('usefulDashboardLink', dashboardPath, dashboardPath);
      setRouteLink('usefulAccountMirrorLink', accountMirrorPath, accountMirrorPath);
      setRouteLink('usefulPreviewSessionLink', previewSessionPath, previewSessionPath);
      setRouteLink('usefulConfigLink', configPath, configPath);
    }

    function setRouteLink(id, href, label) {
      const link = $(id);
      if (!link) return;
      link.href = href;
      if (label) link.textContent = label;
    }

    function normalizeDashboardRoutePath(value, fallback) {
      const text = String(value || fallback || '').trim();
      if (!text) return '/';
      return text.startsWith('/') ? text : '/' + text;
    }

    function isAccountMirrorRoute() {
      return window.location.pathname === (OPERATOR_DASHBOARD_ROUTES.accountMirrorPath || '/account-mirror')
        || window.location.pathname === '/account-mirror';
    }

    function isPreviewSessionRoute() {
      return window.location.pathname === (OPERATOR_DASHBOARD_ROUTES.previewSessionPath || '/account-mirror/preview-session')
        || window.location.pathname === '/account-mirror/preview-session';
    }

    function isAgentsTeamsRoute() {
      return window.location.pathname === (OPERATOR_DASHBOARD_ROUTES.agentsPath || '/agents')
        || window.location.pathname === '/agents';
    }

    function routeWithQuery(path, query) {
      return path + (query ? '?' + query : '');
    }

    function renderMirrorCompletions(status) {
      const summary = status.accountMirrorCompletions || {};
      const metrics = summary.metrics || {};
      const active = Array.isArray(summary.active) ? summary.active : [];
      const recent = Array.isArray(summary.recent) ? summary.recent : [];
      const targets = status.liveFollow && status.liveFollow.targets ? status.liveFollow.targets : null;
      $('mirrorAttentionQueue').innerHTML = renderAttentionQueue(targets, active, recent);
      $('mirrorTargetTable').innerHTML = renderLiveFollowTargetTable(targets);
      applyMirrorTargetCompletenessFilter();
      $('mirrorActiveCompletionTable').innerHTML = renderActiveCompletionTable(active);
      $('mirrorTargets').textContent = asJson({
        source: 'status.liveFollow.targets',
        targets: targets ? compactLiveFollowTargets(targets) : null,
      });
      $('mirrorCompletions').textContent = asJson({
        health: status.liveFollow || null,
        metrics,
        active: active.map(compactCompletion),
        recent: recent.map(compactCompletion),
      });
    }

    function renderOpsControls(status) {
      const backgroundDrain = status.backgroundDrain || {};
      const scheduler = status.accountMirrorScheduler || {};
      const liveFollow = status.liveFollow || {};
      const api = status.api || {};
      const preflight = status.preflight || {};
      $('opsControls').innerHTML = [
        renderApiServiceControl(api),
        renderPreflightControl(preflight),
        renderBackgroundDrainControl(backgroundDrain),
        renderMirrorSchedulerControl(scheduler, liveFollow),
        renderLiveFollowControlSummary(liveFollow),
      ].join('');
    }

    function renderApiServiceControl(api) {
      const process = api.process || {};
      const service = api.managedService || {};
      return '<div class="control-card" id="apiServiceControls"><div class="control-title"><strong>API Service</strong>'
        + renderStatusText(process.pid ? 'running' : 'unknown', process.pid ? 'ok' : 'warn')
        + '</div><dl>'
        + '<dt>PID</dt><dd>' + escapeHtml(process.pid ? String(process.pid) : 'unknown') + '</dd>'
        + '<dt>Unit</dt><dd>' + escapeHtml(service.unitName || 'unknown') + '</dd>'
        + '<dt>Log</dt><dd>' + escapeHtml(service.logPath || 'unknown') + '</dd>'
        + '<dt>Status</dt><dd><code>' + escapeHtml(service.statusCommand || 'unknown') + '</code></dd>'
        + '<dt>Restart</dt><dd><code>' + escapeHtml(service.restartCommand || 'unknown') + '</code></dd>'
        + '</dl><div class="row">'
        + '<button id="loadApiLogTailInline" type="button" onclick="loadApiLogTail()">Refresh Log Tail</button>'
        + '</div></div>';
    }

    function renderPreflightControl(preflight) {
      const latest = preflight.lazyLiveFollow || null;
      const run = preflight.lazyLiveFollowRun || null;
      const history = Array.isArray(preflight.lazyLiveFollowRunHistory) ? preflight.lazyLiveFollowRunHistory.slice(0, 5) : [];
      const running = run && (run.status === 'queued' || run.status === 'running');
      const status = running ? run.status : latest ? latest.status : 'unknown';
      const tone = status === 'passed' ? 'ok' : status === 'failed' ? 'bad' : status === 'running' || status === 'queued' ? 'warn' : 'muted';
      const completedAt = latest ? latest.completedAt || 'unknown' : 'never';
      const runDetail = run ? run.id + ' ' + run.status : 'none';
      return '<div class="control-card" id="preflightControls"><div class="control-title"><strong>Preflight</strong>'
        + renderStatusText(status, tone)
        + '</div><dl>'
        + '<dt>Latest</dt><dd>' + escapeHtml(completedAt) + '</dd>'
        + '<dt>Active Run</dt><dd>' + escapeHtml(runDetail) + '</dd>'
        + '<dt>Log</dt><dd>' + escapeHtml(run && run.logPath ? run.logPath : 'none') + '</dd>'
        + '</dl><div id="preflightStepProgress" class="mini-table">' + renderPreflightStepProgress(run) + '</div><div class="row">'
        + '<button id="runLazyLiveFollowPreflight" class="primary" type="button" onclick="runLazyLiveFollowPreflight()" ' + disabledAttr(running) + '>Run Preflight</button>'
        + '</div><div id="preflightRunHistory" class="mini-table">' + renderPreflightRunHistory(history) + '</div>'
        + '<pre id="preflightRunDetail">Preflight run detail not loaded.</pre>'
        + '<pre id="preflightRunLog">Preflight log not loaded.</pre></div>';
    }

    function renderPreflightHeaderSummary(preflight) {
      const latest = preflight && preflight.lazyLiveFollow ? preflight.lazyLiveFollow : null;
      const run = selectPreflightDisplayRun(preflight);
      const status = run && run.status ? run.status : latest && latest.status ? latest.status : 'unknown';
      const tone = status === 'passed' ? 'ok' : status === 'failed' ? 'bad' : status === 'running' || status === 'queued' ? 'warn' : 'muted';
      const startedAt = run && run.startedAt ? run.startedAt : 'unknown';
      const completedAt = run && run.completedAt ? run.completedAt : latest && latest.completedAt ? latest.completedAt : 'pending';
      const duration = run && typeof run.durationMs === 'number'
        ? String(run.durationMs) + ' ms'
        : latest && typeof latest.durationMs === 'number'
          ? String(latest.durationMs) + ' ms'
          : 'pending';
      const steps = run && Array.isArray(run.steps) ? run.steps : [];
      return '<div class="health-strip-title"><strong>Preflight</strong>' + renderStatusText(status, tone) + '</div>'
        + '<div class="health-strip-meta">'
        + '<span>Run: <code>' + escapeHtml(run && run.id ? run.id : 'none') + '</code></span>'
        + '<span>Started: ' + escapeHtml(startedAt) + '</span>'
        + '<span>Completed: ' + escapeHtml(completedAt) + '</span>'
        + '<span>Duration: ' + escapeHtml(duration) + '</span>'
        + '</div>'
        + '<div class="health-strip-steps">'
        + renderPreflightHeaderSteps(steps)
        + '</div>';
    }

    function selectPreflightDisplayRun(preflight) {
      if (!preflight) return null;
      if (preflight.lazyLiveFollowRun) return preflight.lazyLiveFollowRun;
      const history = Array.isArray(preflight.lazyLiveFollowRunHistory) ? preflight.lazyLiveFollowRunHistory : [];
      return history[0] || null;
    }

    function renderPreflightHeaderSteps(steps) {
      if (!steps.length) return '<span class="muted">No preflight step progress recorded.</span>';
      return steps.map((step) => {
        const status = step.status || 'unknown';
        return '<span class="badge badge-' + badgeToneForStatus(status) + '" data-preflight-header-step-status="' + escapeHtml(status) + '">'
          + escapeHtml(step.label || 'unknown') + ': ' + escapeHtml(status)
          + '</span>';
      }).join('');
    }

    function badgeToneForStatus(status) {
      if (status === 'passed' || status === 'succeeded') return 'ok';
      if (status === 'failed' || status === 'cancelled') return 'bad';
      if (status === 'running' || status === 'queued' || status === 'paused') return 'warn';
      return 'muted';
    }

    function renderPreflightStepProgress(run) {
      const steps = run && Array.isArray(run.steps) ? run.steps : [];
      if (!steps.length) return '<p class="muted">No preflight step progress recorded.</p>';
      return '<table><thead><tr><th>Step</th><th>Status</th><th>Duration</th><th>Command</th></tr></thead><tbody>'
        + steps.map((step) => {
          const duration = step.durationMs === null || step.durationMs === undefined ? 'running' : String(step.durationMs) + ' ms';
          return '<tr data-preflight-step-status="' + escapeHtml(step.status || 'unknown') + '">'
            + '<td>' + escapeHtml(step.label || 'unknown') + '</td>'
            + '<td>' + renderStatusText(step.status || 'unknown', toneForActualStatus(step.status || 'unknown')) + '</td>'
            + '<td>' + escapeHtml(duration) + '</td>'
            + '<td><code>' + escapeHtml(step.command || 'pending') + '</code></td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
    }

    function renderPreflightRunHistory(history) {
      if (!history.length) return '<p class="muted">No preflight runs recorded.</p>';
      return '<table><thead><tr><th>Status</th><th>Started</th><th>Step</th><th>Duration</th><th>Actions</th></tr></thead><tbody>'
        + history.map((entry) => {
          const duration = entry.durationMs === null || entry.durationMs === undefined ? 'running' : String(entry.durationMs) + ' ms';
          const steps = Array.isArray(entry.steps) ? entry.steps : [];
          const step = steps.find((candidate) => candidate.status === 'running') || steps[steps.length - 1] || null;
          const id = escapeHtml(entry.id || '');
          return '<tr>'
            + '<td>' + renderStatusText(entry.status || 'unknown', toneForActualStatus(entry.status || 'unknown')) + '</td>'
            + '<td><code>' + escapeHtml(entry.startedAt || 'unknown') + '</code></td>'
            + '<td>' + escapeHtml(step ? (step.label || 'unknown') + ' (' + (step.status || 'unknown') + ')' : 'none') + '</td>'
            + '<td>' + escapeHtml(duration) + '</td>'
            + '<td><button type="button" class="link-button" data-preflight-run-id="' + id + '" onclick="loadPreflightRunDetail(this.dataset.preflightRunId)">Open Run</button>'
            + ' <button type="button" class="link-button" data-preflight-run-id="' + id + '" onclick="loadPreflightRunLog(this.dataset.preflightRunId)">Open Log</button></td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';
    }

    function renderBackgroundDrainControl(backgroundDrain) {
      const enabled = backgroundDrain.enabled === true;
      const paused = backgroundDrain.paused === true || backgroundDrain.state === 'paused';
      const running = backgroundDrain.state === 'running';
      return '<div class="control-card" id="backgroundDrainControls"><div class="control-title"><strong>Background Drain</strong>'
        + renderStatusText(backgroundDrain.state || 'unknown', toneForActualStatus(backgroundDrain.state || 'unknown'))
        + '</div><dl>'
        + '<dt>Interval</dt><dd>' + escapeHtml(formatNullable(backgroundDrain.intervalMs, 'disabled')) + '</dd>'
        + '<dt>Last Run</dt><dd>' + escapeHtml(backgroundDrain.lastCompletedAt || backgroundDrain.lastStartedAt || 'never') + '</dd>'
        + '</dl><div class="row">'
        + '<button id="pauseBackgroundDrain" type="button" onclick="controlBackgroundDrain(' + "'pause'" + ')" ' + disabledAttr(!enabled || paused) + '>Pause</button>'
        + '<button id="resumeBackgroundDrain" type="button" onclick="controlBackgroundDrain(' + "'resume'" + ')" ' + disabledAttr(!enabled || running && !paused) + '>Resume</button>'
        + '</div></div>';
    }

    function renderMirrorSchedulerControl(scheduler, liveFollow) {
      const enabled = scheduler.enabled === true;
      const paused = scheduler.paused === true || scheduler.state === 'paused';
      const running = scheduler.state === 'running';
      const explanation = buildMirrorSchedulerExplanation(scheduler, liveFollow);
      const diagnosticsHint = buildMirrorSchedulerDiagnosticsHint(liveFollow);
      const waitRows = renderMirrorSchedulerWaitTable(liveFollow);
      const foregroundWork = renderMirrorSchedulerForegroundWork(scheduler.foregroundWork || {});
      return '<div class="control-card" id="mirrorSchedulerControls"><div class="control-title"><strong>Mirror Scheduler</strong>'
        + renderStatusText(scheduler.state || 'unknown', toneForActualStatus(scheduler.state || 'unknown'))
        + '</div><dl>'
        + '<dt>Mode</dt><dd>' + escapeHtml(scheduler.dryRun ? 'dry run' : 'execute') + '</dd>'
        + '<dt>Wake</dt><dd>' + escapeHtml(scheduler.lastWakeReason || 'none') + '</dd>'
        + '<dt>Wake At</dt><dd>' + escapeHtml(scheduler.lastWakeAt || 'never') + '</dd>'
        + '<dt>Why</dt><dd id="mirrorSchedulerExplanation">' + escapeHtml(explanation.summary) + '</dd>'
        + '<dt>Next Retry</dt><dd id="mirrorSchedulerNextRetry">' + escapeHtml(explanation.nextRetry) + '</dd>'
        + '<dt>Routine Eligible</dt><dd id="mirrorSchedulerRoutineEligible">' + escapeHtml(explanation.routineEligible) + '</dd>'
        + '<dt>Foreground Work</dt><dd id="mirrorSchedulerForegroundWork">' + foregroundWork + '</dd>'
        + '<dt>Diagnostics</dt><dd id="mirrorSchedulerDiagnosticsHint">' + diagnosticsHint + '</dd>'
        + '</dl><div class="row">'
        + '<button id="runMirrorScheduler" class="primary" type="button" onclick="controlMirrorScheduler(' + "'run-once'" + ', false)" ' + disabledAttr(running) + '>Run Now</button>'
        + '<button id="foregroundProofMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'run-once-with-foreground-pressure'" + ', false)" ' + disabledAttr(running) + '>Foreground Proof</button>'
        + '<button id="dryRunMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'run-once'" + ', true)" ' + disabledAttr(running) + '>Dry Run</button>'
        + '<button id="pauseMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'pause'" + ')" ' + disabledAttr(!enabled || paused) + '>Pause</button>'
        + '<button id="resumeMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'resume'" + ')" ' + disabledAttr(!enabled || running && !paused) + '>Resume</button>'
        + '</div><div id="mirrorSchedulerWaitTable" class="mini-table">' + waitRows + '</div>'
        + '<pre id="mirrorSchedulerCompletionDetail">Select a scheduler wait row completion to inspect details.</pre></div>';
    }

    function renderMirrorSchedulerForegroundWork(foregroundWork) {
      const active = foregroundWork.active === true;
      const fields = [
        'active=' + String(active),
        'activeRequests=' + String(foregroundWork.activeRequestCount ?? 'unknown'),
        'pendingDrains=' + String(foregroundWork.drainReservations ?? 'unknown'),
        'backgroundDrainScheduled=' + String(foregroundWork.backgroundDrainScheduled === true),
        'backgroundDrainState=' + String(foregroundWork.backgroundDrainState || 'unknown'),
      ];
      return renderStatusText(active ? 'waiting' : 'clear', 'ok') + ' <span data-mirror-scheduler-foreground-work="true">'
        + escapeHtml(fields.join(' ')) + '</span>';
    }

    function buildMirrorSchedulerDiagnosticsHint(liveFollow) {
      const hints = collectMirrorSchedulerDiagnosticsHints(liveFollow);
      if (!hints.length) return '<span class="muted">none</span>';
      return '<div data-mirror-scheduler-diagnostics-command-list="true">'
        + hints.map(renderMirrorSchedulerDiagnosticsCommandHint).join('')
        + '</div>';
    }

    function renderMirrorSchedulerDiagnosticsCommandHint(hint) {
      const command = formatMirrorSchedulerDiagnosticsCommand(hint);
      const label = [hint.provider, hint.runtimeProfileId].filter(Boolean).join('/');
      return '<div class="inline-actions" data-mirror-scheduler-diagnostics-command-row="true">'
        + (label ? '<span class="muted">' + escapeHtml(label) + '</span> ' : '')
        + '<code data-mirror-scheduler-diagnostics-command="true">' + escapeHtml(command) + '</code>'
        + ' <button type="button" class="link-button" data-mirror-scheduler-diagnostics-command-copy-button="true"'
        + ' data-command="' + escapeHtml(command) + '" onclick="copyMirrorSchedulerDiagnosticsCommand(this)">Copy command</button>'
        + '</div>';
    }

    function collectMirrorSchedulerDiagnosticsHints(liveFollow) {
      const accounts = liveFollow && liveFollow.targets && Array.isArray(liveFollow.targets.accounts)
        ? liveFollow.targets.accounts
        : [];
      const seen = new Set();
      const hints = [];
      for (const account of accounts) {
        if (!account.activeCompletionId) continue;
        const provider = normalizeDashboardCommandPart(account.provider);
        const runtimeProfileId = normalizeDashboardCommandPart(account.runtimeProfileId);
        const completionId = normalizeDashboardCommandPart(account.activeCompletionId);
        const key = [provider, runtimeProfileId, completionId].join('\\0');
        if (seen.has(key)) continue;
        seen.add(key);
        hints.push({ provider, runtimeProfileId, completionId });
      }
      return hints;
    }

    function formatMirrorSchedulerDiagnosticsCommand(hint) {
      const apiTarget = resolveDashboardApiCommandTarget();
      const args = ['auracall', 'api', 'scheduler-diagnostics'];
      if (apiTarget.host && apiTarget.host !== '127.0.0.1') {
        args.push('--host', apiTarget.host);
      }
      if (apiTarget.port) {
        args.push('--port', apiTarget.port);
      }
      if (hint.provider) args.push('--provider', hint.provider);
      if (hint.runtimeProfileId) args.push('--runtime-profile', hint.runtimeProfileId);
      if (hint.completionId) args.push('--completion-id', hint.completionId);
      return args.map(quoteDashboardCommandArg).join(' ');
    }

    function resolveDashboardApiCommandTarget() {
      const target = OPERATOR_DASHBOARD_SERVICE_DISCOVERY
        && OPERATOR_DASHBOARD_SERVICE_DISCOVERY.routing
        ? OPERATOR_DASHBOARD_SERVICE_DISCOVERY.routing.proxyTarget
        : '';
      try {
        const parsed = new URL(target || window.location.href);
        return {
          host: parsed.hostname || window.location.hostname || '127.0.0.1',
          port: parsed.port || window.location.port || '',
        };
      } catch {
        return {
          host: window.location.hostname || '127.0.0.1',
          port: window.location.port || '',
        };
      }
    }

    function normalizeDashboardCommandPart(value) {
      const text = String(value || '').trim();
      return text || null;
    }

    function quoteDashboardCommandArg(value) {
      const text = String(value || '');
      return /^[A-Za-z0-9_./:@=-]+$/.test(text)
        ? text
        : "'" + text.replaceAll("'", "'\\\\''") + "'";
    }

    function renderMirrorSchedulerWaitTable(liveFollow) {
      const accounts = liveFollow && liveFollow.targets && Array.isArray(liveFollow.targets.accounts)
        ? liveFollow.targets.accounts
        : [];
      const eligibleAccounts = accounts
        .filter((account) => account.desiredState === 'enabled')
        .slice()
        .sort(compareMirrorSchedulerWaitRows)
        .slice(0, 8);
      if (!eligibleAccounts.length) {
        return '<p class="muted" id="mirrorSchedulerWaitTableEmpty">No live-follow-enabled targets are configured.</p>';
      }
      return '<table><thead><tr><th>Target</th><th>Wait</th><th>Next Retry</th><th>Routine Eligible</th><th>Completion</th><th>Actions</th></tr></thead><tbody>'
        + eligibleAccounts.map(renderMirrorSchedulerWaitRow).join('')
        + '</tbody></table>';
    }

    function renderMirrorSchedulerWaitRow(account) {
      const wait = classifyMirrorSchedulerTargetWait(account);
      const target = [account.provider, account.runtimeProfileId].filter(Boolean).join('/') || 'unknown';
      return '<tr data-mirror-scheduler-wait-row="true" data-mirror-scheduler-wait="' + escapeHtml(wait.kind) + '">'
        + '<td>' + escapeHtml(target) + '</td>'
        + '<td>' + renderStatusText(wait.label, wait.tone) + '</td>'
        + '<td>' + escapeHtml(account.nextAttemptAt || 'none') + '</td>'
        + '<td>' + escapeHtml(account.routineEligibleAt || 'none') + '</td>'
        + '<td>' + escapeHtml(account.activeCompletionId || 'none') + '</td>'
        + '<td>' + renderMirrorSchedulerWaitRowActions(account) + '</td>'
        + '</tr>';
    }

    function renderMirrorSchedulerWaitRowActions(account) {
      const actions = [];
      if (account.activeCompletionId) {
        actions.push('<button type="button" class="link-button" data-completion-id="' + escapeHtml(account.activeCompletionId) + '" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect completion</button>');
      }
      const wait = classifyMirrorSchedulerTargetWait(account);
      const cachePath = buildMirrorSchedulerAccountMirrorPath(account);
      if (account.providerGuard && account.providerGuard.state === 'manual_clear_required') {
        actions.push('<button type="button" class="link-button"'
          + ' data-provider="' + escapeHtml(account.provider || '') + '"'
          + ' data-runtime-profile-id="' + escapeHtml(account.runtimeProfileId || '') + '"'
          + ' onclick="clearMirrorProviderGuard(this)">Clear guard</button>');
      }
      actions.push('<button type="button" class="link-button" data-mirror-scheduler-diagnostics-open-button="true"'
        + ' data-provider="' + escapeHtml(account.provider || '') + '"'
        + ' data-runtime-profile-id="' + escapeHtml(account.runtimeProfileId || '') + '"'
        + ' data-completion-id="' + escapeHtml(account.activeCompletionId || '') + '"'
        + ' onclick="openMirrorSchedulerDiagnostics(this)">Open diagnostics</button>');
      actions.push('<button type="button" class="link-button" data-mirror-scheduler-diagnostics-button="true"'
        + ' data-provider="' + escapeHtml(account.provider || '') + '"'
        + ' data-runtime-profile-id="' + escapeHtml(account.runtimeProfileId || '') + '"'
        + ' data-wait-kind="' + escapeHtml(wait.kind) + '"'
        + ' data-wait-label="' + escapeHtml(wait.label) + '"'
        + ' data-next-attempt-at="' + escapeHtml(account.nextAttemptAt || '') + '"'
        + ' data-routine-eligible-at="' + escapeHtml(account.routineEligibleAt || '') + '"'
        + ' data-completion-id="' + escapeHtml(account.activeCompletionId || '') + '"'
        + ' data-cache-path="' + escapeHtml(cachePath) + '"'
        + ' onclick="copyMirrorSchedulerDiagnostics(this)">Copy diagnostics</button>');
      actions.push('<a class="link-button" data-mirror-scheduler-cache-link="true" href="' + escapeHtml(cachePath) + '">Open cache</a>');
      return actions.join(' ');
    }

    function buildMirrorSchedulerAccountMirrorPath(account) {
      const params = new URLSearchParams();
      if (account.provider) params.set('provider', account.provider);
      if (account.runtimeProfileId) params.set('runtimeProfile', account.runtimeProfileId);
      params.set('kind', 'all');
      return '/account-mirror?' + params.toString();
    }

    function classifyMirrorSchedulerTargetWait(account) {
      if (account.latestCompletionError) {
        return { kind: 'backoff', label: 'backoff', tone: 'warn' };
      }
      if (account.providerGuard && account.providerGuard.state === 'manual_clear_required') {
        return { kind: 'provider-guard', label: 'manual clear', tone: 'bad' };
      }
      if (account.providerGuard && account.providerGuard.state === 'cooldown') {
        return { kind: 'provider-cooldown', label: 'guard cooldown', tone: 'warn' };
      }
      const now = Date.now();
      const nextAttempt = Date.parse(account.nextAttemptAt || '');
      const routineEligible = Date.parse(account.routineEligibleAt || '');
      if (Number.isFinite(nextAttempt) && nextAttempt > now) {
        return { kind: 'retry-delay', label: 'retry delay', tone: 'warn' };
      }
      if (Number.isFinite(routineEligible) && routineEligible > now) {
        return { kind: 'routine-cadence', label: 'routine cadence', tone: 'warn' };
      }
      if (account.activeCompletionId) {
        return { kind: 'active', label: 'active', tone: 'ok' };
      }
      return { kind: 'eligible', label: 'eligible', tone: 'ok' };
    }

    function compareMirrorSchedulerWaitRows(left, right) {
      const leftRank = mirrorSchedulerWaitRank(classifyMirrorSchedulerTargetWait(left).kind);
      const rightRank = mirrorSchedulerWaitRank(classifyMirrorSchedulerTargetWait(right).kind);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return firstTargetTime(left) - firstTargetTime(right);
    }

    function mirrorSchedulerWaitRank(kind) {
      if (kind === 'eligible') return 0;
      if (kind === 'active') return 1;
      if (kind === 'provider-guard') return 2;
      if (kind === 'provider-cooldown') return 3;
      if (kind === 'retry-delay') return 4;
      if (kind === 'routine-cadence') return 5;
      if (kind === 'backoff') return 6;
      return 7;
    }

    function firstTargetTime(account) {
      const candidates = [Date.parse(account.nextAttemptAt || ''), Date.parse(account.routineEligibleAt || '')]
        .filter(Number.isFinite);
      return candidates.length ? Math.min(...candidates) : Number.MAX_SAFE_INTEGER;
    }

    function buildMirrorSchedulerExplanation(scheduler, liveFollow) {
      if (scheduler.enabled !== true) {
        return {
          summary: 'Disabled: scheduler cadence is not configured.',
          nextRetry: 'none',
          routineEligible: 'none',
        };
      }
      if (scheduler.paused === true || scheduler.state === 'paused') {
        return {
          summary: 'Paused by operator control.',
          nextRetry: 'paused',
          routineEligible: 'paused',
        };
      }
      if (scheduler.state === 'running') {
        return {
          summary: 'Running now: a scheduler pass is currently executing.',
          nextRetry: 'running',
          routineEligible: 'running',
        };
      }
      if (scheduler.foregroundWork && scheduler.foregroundWork.active === true) {
        return {
          summary: 'Waiting: foreground AuraCall work is active. ' + formatMirrorSchedulerForegroundWorkText(scheduler.foregroundWork),
          nextRetry: 'after foreground work settles',
          routineEligible: 'after foreground work settles',
        };
      }
      const latestPass = latestMirrorSchedulerPass(scheduler);
      const accounts = liveFollow && liveFollow.targets && Array.isArray(liveFollow.targets.accounts)
        ? liveFollow.targets.accounts
        : [];
      const enabledAccounts = accounts.filter((account) => account.desiredState === 'enabled');
      const retryTarget = earliestTargetDate(enabledAccounts, 'nextAttemptAt');
      const routineTarget = earliestTargetDate(enabledAccounts, 'routineEligibleAt');
      const metrics = latestPass && latestPass.metrics ? latestPass.metrics : {};
      const active = Number(liveFollow && liveFollow.targets ? liveFollow.targets.active || 0 : 0);
      const delayed = Number(metrics.liveFollowDelayedTargets || 0);
      const eligible = Number(metrics.liveFollowEligibleTargets || 0);
      const backpressure = latestPass && latestPass.backpressure ? latestPass.backpressure : null;
      if (backpressure && backpressure.reason && backpressure.reason !== 'none') {
        const reason = backpressure.message
          ? backpressure.reason + ': ' + backpressure.message
          : backpressure.reason;
        return {
          summary: 'Waiting: last pass was skipped for ' + reason + '. Live-follow targets: ' + String(active) + ' active, ' + String(eligible) + ' eligible, ' + String(delayed) + ' delayed.',
          nextRetry: formatTargetDate(retryTarget),
          routineEligible: formatTargetDate(routineTarget),
        };
      }
      const operatorReason = scheduler.operatorStatus && scheduler.operatorStatus.reason
        ? scheduler.operatorStatus.reason
        : 'Scheduler is waiting on its cadence timer.';
      return {
        summary: operatorReason + ' Live-follow targets: ' + String(active) + ' active.',
        nextRetry: formatTargetDate(retryTarget),
        routineEligible: formatTargetDate(routineTarget),
      };
    }

    function formatMirrorSchedulerForegroundWorkText(foregroundWork) {
      return [
        'activeRequests=' + String(foregroundWork.activeRequestCount ?? 'unknown'),
        'pendingDrains=' + String(foregroundWork.drainReservations ?? 'unknown'),
        'backgroundDrainScheduled=' + String(foregroundWork.backgroundDrainScheduled === true),
        'backgroundDrainState=' + String(foregroundWork.backgroundDrainState || 'unknown'),
      ].join(' ');
    }

    function latestMirrorSchedulerPass(scheduler) {
      if (scheduler.lastPass) return scheduler.lastPass;
      if (scheduler.history && Array.isArray(scheduler.history.entries) && scheduler.history.entries.length) {
        return scheduler.history.entries[0];
      }
      return null;
    }

    function earliestTargetDate(accounts, field) {
      let selected = null;
      for (const account of accounts) {
        const value = account[field];
        const time = Date.parse(value || '');
        if (!Number.isFinite(time)) continue;
        if (!selected || time < selected.time) {
          selected = { time, value, account };
        }
      }
      return selected;
    }

    function formatTargetDate(selection) {
      if (!selection) return 'none';
      const account = selection.account || {};
      const label = [account.provider, account.runtimeProfileId].filter(Boolean).join('/') || 'target';
      return label + ' at ' + selection.value;
    }

    function renderLiveFollowControlSummary(liveFollow) {
      const targets = liveFollow.targets || {};
      return '<div class="control-card" id="liveFollowControls"><div class="control-title"><strong>Live Follow</strong>'
        + renderSeverity(liveFollow.severity || 'unknown')
        + '</div><dl>'
        + '<dt>Targets</dt><dd>' + formatTargetHealth(targets) + '</dd>'
        + '<dt>Next Action</dt><dd>Use the live-follow table to pause, resume, run one bounded pass, or cancel a completion by id.</dd>'
        + '</dl></div>';
    }

    function renderSeverity(severity) {
      return '<span class="severity-' + severity + '">' + severity + '</span>';
    }

    function formatTargetHealth(targets) {
      if (!targets || !targets.total) return 'unknown';
      return '<span class="badges">' + [
        renderBadge('enabled', targets.enabled || 0, targets.enabled ? 'ok' : 'muted'),
        renderBadge('active', targets.active || 0, targets.active ? 'ok' : 'muted'),
        renderBadge('paused', targets.paused || 0, targets.paused ? 'warn' : 'muted'),
        renderBadge('attention', targets.attentionNeeded || 0, targets.attentionNeeded ? 'bad' : 'ok'),
      ].join('') + '</span>';
    }

    function formatCompletionHistory(metrics, targets) {
      const staleOnly = targets && (targets.attentionNeeded || 0) === 0;
      const failedTone = metrics.failed && !staleOnly ? 'bad' : 'muted';
      const cancelledTone = metrics.cancelled && !staleOnly ? 'warn' : 'muted';
      return '<span class="badges">' + [
        renderBadge('active', metrics.active || 0, metrics.active ? 'ok' : 'muted'),
        renderBadge('failed', metrics.failed || 0, failedTone),
        renderBadge('cancelled', metrics.cancelled || 0, cancelledTone),
        renderBadge('total', metrics.total || 0, 'muted'),
      ].join('') + '</span>';
    }

    function renderBadge(label, value, tone) {
      return '<span class="badge badge-' + escapeHtml(tone) + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></span>';
    }

    function renderAttentionQueue(targets, active, recent) {
      const rows = collectAttentionRows(targets, active, recent);
      if (!rows.length) return '<span class="muted">No live-follow operator attention needed.</span>';
      return '<div class="table-wrap"><table id="mirrorAttentionItems"><thead><tr>' + [
        'Kind',
        'Target',
        'State',
        'Detail',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + rows.map(renderAttentionRow).join('') + '</tbody></table></div>';
    }

    function collectAttentionRows(targets, active, recent) {
      const rows = [];
      const accounts = targets && Array.isArray(targets.accounts) ? targets.accounts : [];
      for (const target of accounts) {
        const desiredState = target.desiredState || 'unknown';
        const status = target.actualStatus || 'unknown';
        if (isAttentionTarget(target)) {
          rows.push({
            kind: 'target',
            target: formatTargetName(target),
            state: desiredState + '/' + status,
            detail: formatMirrorTargetAttentionReason(target),
            completionId: target.activeCompletionId || null,
            status,
          });
        }
      }
      const operations = [...(Array.isArray(active) ? active : []), ...(Array.isArray(recent) ? recent : [])];
      const seen = new Set();
      for (const operation of operations) {
        const id = operation.id || '';
        const status = operation.status || 'unknown';
        if (!isAttentionCompletion(status) || seen.has(id)) continue;
        seen.add(id);
        rows.push({
          kind: 'completion',
          target: formatCompletionTarget(operation),
          state: status,
          detail: id || operation.error || 'attention needed',
          completionId: id || null,
          status,
        });
      }
      return rows;
    }

    function isAttentionTarget(targetOrDesiredState, maybeStatus) {
      const target = typeof targetOrDesiredState === 'object' && targetOrDesiredState ? targetOrDesiredState : null;
      const desiredState = target ? target.desiredState || 'unknown' : targetOrDesiredState;
      const status = target ? target.actualStatus || 'unknown' : maybeStatus;
      return target?.attentionNeeded === true
        || desiredState === 'missing_identity'
        || desiredState === 'unsupported'
        || status === 'paused'
        || status === 'blocked'
        || status === 'failed'
        || status === 'cancelled'
        || status === 'attention-needed';
    }

    function isAttentionCompletion(status) {
      return status === 'paused'
        || status === 'blocked'
        || status === 'failed'
        || status === 'cancelled';
    }

    function renderAttentionRow(row) {
      return '<tr>' + [
        '<td>' + escapeHtml(row.kind) + '</td>',
        '<td><strong>' + escapeHtml(row.target) + '</strong></td>',
        '<td>' + renderStatusText(row.state, toneForActualStatus(row.status)) + '</td>',
        '<td class="wrap">' + escapeHtml(row.detail) + '</td>',
        '<td>' + renderAttentionControls(row.completionId, row.status) + '</td>',
      ].join('') + '</tr>';
    }

    function renderAttentionControls(completionId, status) {
      if (!completionId) return '<span class="muted">none</span>';
      return '<span class="badges">' + [
        renderCompletionInspectButton(completionId),
        renderCompletionControlButtons(completionId, status),
      ].join('') + '</span>';
    }

    function renderLiveFollowTargetTable(targets) {
      const accounts = targets && Array.isArray(targets.accounts) ? targets.accounts : [];
      if (!accounts.length) return '<span class="muted">No configured live-follow accounts.</span>';
      return '<div class="table-wrap"><table id="mirrorTargetAccounts"><thead><tr>' + [
        'Target',
        'Desired',
        'Status',
        'Completeness',
        'Attention',
        'Phase',
        'Passes',
        'Next Live-Follow Attempt',
        'Routine Crawl Eligible',
        'Counts',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + accounts.map(renderLiveFollowTargetRow).join('') + '</tbody></table></div>';
    }

    function renderLiveFollowTargetRow(target) {
      const status = target.actualStatus || 'unknown';
      const desiredState = target.desiredState || 'unknown';
      const completeness = target.mirrorCompleteness || 'unknown';
      const counts = target.metadataCounts || {};
      const attention = isAttentionTarget(target) || isAttentionCompleteness(completeness);
      return '<tr data-mirror-target-row="true" data-mirror-target-completeness="' + escapeHtml(completeness) + '" data-mirror-target-attention="' + escapeHtml(String(attention)) + '">' + [
        '<td><strong>' + escapeHtml(formatTargetName(target)) + '</strong></td>',
        '<td>' + renderStatusText(desiredState, toneForDesiredState(desiredState)) + '</td>',
        '<td>' + renderStatusText(status, toneForActualStatus(status)) + '</td>',
        '<td>' + renderStatusText(completeness, toneForMirrorCompleteness(completeness)) + '</td>',
        '<td class="wrap" data-mirror-target-attention-reason="true">' + escapeHtml(formatMirrorTargetAttentionReason(target)) + '</td>',
        '<td>' + escapeHtml(target.phase || 'none') + '</td>',
        '<td>' + escapeHtml(target.passCount == null ? 'none' : String(target.passCount)) + '</td>',
        '<td class="wrap">' + escapeHtml(target.activeCompletionNextAttemptAt || 'none') + '</td>',
        '<td class="wrap">' + escapeHtml(target.routineEligibleAt || 'none') + '</td>',
        '<td class="wrap">' + escapeHtml(formatMetadataCounts(counts)) + '</td>',
        '<td>' + renderLiveFollowAccountControls(target) + '</td>',
      ].join('') + '</tr>';
    }

    function applyMirrorTargetCompletenessFilter() {
      const table = $('mirrorTargetAccounts');
      const count = $('mirrorTargetCompletenessVisibleCount');
      if (!table) {
        if (count) count.textContent = 'showing 0 of 0';
        return;
      }
      const filter = $('mirrorTargetCompletenessFilter').value || '';
      const rows = Array.from(table.querySelectorAll('[data-mirror-target-row]'));
      for (const row of rows) {
        const completeness = row.dataset.mirrorTargetCompleteness || '';
        const attention = row.dataset.mirrorTargetAttention === 'true';
        row.hidden = filter === 'attention'
          ? !attention
          : Boolean(filter && completeness !== filter);
      }
      const visible = rows.filter((row) => !row.hidden).length;
      if (count) count.textContent = 'showing ' + String(visible) + ' of ' + String(rows.length);
    }

    function toneForMirrorCompleteness(completeness) {
      if (completeness === 'complete') return 'ok';
      if (completeness === 'in_progress') return 'warn';
      if (completeness === 'none') return 'bad';
      return 'muted';
    }

    function isAttentionCompleteness(completeness) {
      return completeness === 'none' || completeness === 'unknown';
    }

    function formatMirrorTargetAttentionReason(target) {
      const desiredState = target.desiredState || 'unknown';
      const status = target.actualStatus || 'unknown';
      const completeness = target.mirrorCompleteness || 'unknown';
      if (desiredState === 'missing_identity') return 'expected identity is missing';
      if (desiredState === 'unsupported') return 'provider/profile is not supported for live follow';
      if (target.providerGuard && target.providerGuard.state === 'manual_clear_required') {
        return target.providerGuard.summary || 'provider requires manual clearance';
      }
      if (target.providerGuard && target.providerGuard.state === 'cooldown') {
        return 'provider guard cleared; cooldown until ' + (target.providerGuard.cooldownUntil || 'unknown time');
      }
      if (status === 'blocked') return 'blocked; inspect the active completion or browser state';
      if (status === 'failed') return 'latest live-follow operation failed';
      if (status === 'cancelled') return 'latest live-follow operation was cancelled';
      if (status === 'paused') return 'live-follow operation is paused';
      if (target.statusReason === 'failure-backoff') {
        const detail = target.latestCompletionError || 'latest live-follow operation failed';
        return 'failure backoff after ' + detail;
      }
      if (target.latestCompletionStatus === 'failed') {
        return target.latestCompletionError || 'latest live-follow operation failed';
      }
      if (target.consecutiveFailureCount > 0) {
        return 'latest live-follow operation failed at ' + (target.lastFailureAt || 'unknown time');
      }
      if (completeness === 'none') return 'no mirrored metadata has been cached yet';
      if (completeness === 'unknown') return 'mirror completeness has not been reported';
      if (completeness === 'in_progress') {
        if (target.activeCompletionId) return 'backfill is still running or waiting for its next attempt';
        if (target.routineEligibleAt) return 'backfill remains incomplete; routine crawl is eligible at ' + target.routineEligibleAt;
        return 'backfill remains incomplete';
      }
      const event = target.latestLifecycleEvent || {};
      if (event.message) return event.message;
      if (event.type) return 'latest event: ' + event.type;
      return 'no attention needed';
    }

    function renderLiveFollowAccountControls(target) {
      const completionId = target && target.activeCompletionId ? target.activeCompletionId : null;
      if (completionId) return renderCompletionControlButtons(completionId, target.actualStatus || 'unknown');
      if (target && target.desiredState === 'enabled') {
        return '<button type="button" data-provider="' + escapeHtml(target.provider || '') + '" data-runtime-profile="' + escapeHtml(target.runtimeProfileId || '') + '" onclick="startMirrorCompletionForTarget(this.dataset.provider, this.dataset.runtimeProfile)">Start</button>';
      }
      return '<span class="muted">not live-follow enabled</span>';
    }

    function renderActiveCompletionTable(active) {
      if (!active.length) return '<span class="muted">No active live-follow operations.</span>';
      return '<div class="table-wrap"><table id="mirrorActiveCompletions"><thead><tr>' + [
        'Completion',
        'Target',
        'Status',
        'Phase',
        'Passes',
        'Next Completion Attempt',
        'Inspect',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + active.map(renderActiveCompletionRow).join('') + '</tbody></table></div>';
    }

    function renderActiveCompletionRow(operation) {
      const status = operation.status || 'unknown';
      return '<tr>' + [
        '<td class="wrap"><strong>' + escapeHtml(operation.id || 'unknown') + '</strong></td>',
        '<td>' + escapeHtml(formatCompletionTarget(operation)) + '</td>',
        '<td>' + renderStatusText(status, toneForActualStatus(status)) + '</td>',
        '<td>' + escapeHtml(operation.phase || 'none') + '</td>',
        '<td>' + escapeHtml(formatCompletionPasses(operation)) + '</td>',
        '<td class="wrap">' + escapeHtml(operation.nextAttemptAt || 'none') + '</td>',
        '<td>' + renderCompletionInspectButton(operation.id) + '</td>',
        '<td>' + renderCompletionControlButtons(operation) + '</td>',
      ].join('') + '</tr>';
    }

    function renderCompletionInspectButton(id) {
      if (!id) return '<span class="muted">none</span>';
      return '<button type="button" data-completion-id="' + escapeHtml(id) + '" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button>';
    }

    function renderCompletionControlButtons(operation) {
      const id = operation && operation.id;
      if (!id) return '<span class="muted">none</span>';
      const escapedId = escapeHtml(id);
      const actions = completionActionsForOperation(operation);
      return '<span class="badges">' + [
        '<button type="button" data-completion-id="' + escapedId + '" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button>',
        ...actions.map((action) => renderCompletionActionButton(id, action, labelForCompletionAction(action))),
      ].join('') + '</span>';
    }

    function completionActionsForOperation(operation) {
      const status = operation && operation.status;
      if (status === 'blocked' && operation.mode === 'live_follow') return ['run_one_pass'];
      if (status === 'paused') return ['resume', 'run_one_pass', 'cancel'];
      if (status === 'idle_waiting') return ['run_one_pass', 'pause', 'cancel'];
      if (status === 'queued' || status === 'running' || status === 'refreshing') return ['pause', 'run_one_pass', 'cancel'];
      return [];
    }

    function labelForCompletionAction(action) {
      if (action === 'pause') return 'Pause';
      if (action === 'resume') return 'Resume';
      if (action === 'run_one_pass') return 'Run 1';
      if (action === 'cancel') return 'Cancel';
      return action;
    }

    function renderCompletionActionButton(id, action, label) {
      return '<button type="button" data-completion-id="' + escapeHtml(id) + '" data-completion-action="' + escapeHtml(action) + '" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">' + escapeHtml(label) + '</button>';
    }

    function fillMirrorCompletionId(id) {
      if (!id) return;
      $('mirrorCompletionId').value = id;
      $('mirrorCompletions').textContent = 'Selected completion id: ' + id;
      setMirrorControlNotice('Selected ' + id + '.', 'ok');
    }

    function setMirrorControlNotice(message, tone) {
      const node = $('mirrorControlNotice');
      node.className = 'notice notice-' + (tone || 'warn');
      node.textContent = message;
    }

    function setMirrorControlResultToast(input) {
      const node = $('mirrorControlResultToast');
      if (!input) {
        node.hidden = true;
        node.textContent = 'No live-follow control result yet.';
        return;
      }
      const tone = input.tone || 'ok';
      const operation = input.operation || {};
      const id = input.id || operation.id || 'unknown';
      const status = input.status || operation.status || 'unknown';
      const target = input.target || formatCompletionTarget(operation);
      const nextAttempt = input.nextAttemptAt || operation.nextAttemptAt || 'none';
      node.hidden = false;
      node.className = 'notice notice-' + tone + ' control-result-toast';
      node.innerHTML = '<strong>' + escapeHtml(input.title || 'Live-follow result') + '</strong>'
        + '<div class="control-result-meta">'
        + renderBadge('action', input.action || 'none', tone)
        + renderBadge('status', status, toneForActualStatus(status))
        + renderBadge('target', target, 'muted')
        + '</div>'
        + '<div class="wrap">completion=' + escapeHtml(id) + ' next=' + escapeHtml(nextAttempt) + '</div>';
    }

    function setOpsControlNotice(message, tone) {
      const node = $('opsControlNotice');
      node.className = 'notice notice-' + (tone || 'warn');
      node.textContent = message;
    }

    function renderStatusText(value, tone) {
      return '<span class="' + tone + '">' + escapeHtml(value || 'unknown') + '</span>';
    }

    function toneForDesiredState(state) {
      if (state === 'enabled') return 'ok';
      if (state === 'missing_identity' || state === 'unsupported') return 'bad';
      if (state === 'disabled') return 'warn';
      return 'muted';
    }

    function toneForActualStatus(status) {
      if (status === 'running' || status === 'refreshing' || status === 'queued') return 'ok';
      if (status === 'paused') return 'warn';
      if (status === 'blocked' || status === 'failed' || status === 'cancelled') return 'bad';
      return 'muted';
    }

    function disabledAttr(disabled) {
      return disabled ? 'disabled' : '';
    }

    function formatNullable(value, fallback) {
      return value == null ? fallback : String(value);
    }

    function formatTargetName(target) {
      return [target.provider, target.runtimeProfileId].filter(Boolean).join('/') || 'unknown';
    }

    function formatMetadataCounts(counts) {
      return [
        'p=' + (counts.projects || 0),
        'c=' + (counts.conversations || 0),
        'a=' + (counts.artifacts || 0),
        'f=' + (counts.files || 0),
        'm=' + (counts.media || 0),
      ].join(' ');
    }

    function formatCompletionTarget(operation) {
      return [operation.provider, operation.runtimeProfileId].filter(Boolean).join('/') || 'unknown';
    }

    function formatCompletionPasses(operation) {
      return String(operation.passCount || 0) + '/' + (operation.maxPasses || 'unbounded');
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function normalizeSearchTerm(value) {
      return String(value || '').trim().toLowerCase();
    }

    function formatDesiredActualHealth(targets) {
      if (!targets || !targets.total) return 'unknown';
      const desired = targets.desired || targets;
      const actual = targets.actual || targets;
      return '<span class="badges">' + [
        renderBadge('desired enabled', desired.enabled || 0, desired.enabled ? 'ok' : 'muted'),
        renderBadge('desired missing', desired.missingIdentity || 0, desired.missingIdentity ? 'bad' : 'muted'),
        renderBadge('actual active', actual.active || 0, actual.active ? 'ok' : 'muted'),
        renderBadge('actual complete', actual.complete || 0, actual.complete ? 'ok' : 'muted'),
        renderBadge('actual attention', actual.attentionNeeded || 0, actual.attentionNeeded ? 'bad' : 'ok'),
      ].join('') + '</span>';
    }

    function compactLiveFollowTargets(targets) {
      return {
        total: targets.total || 0,
        enabled: targets.enabled || 0,
        active: targets.active || 0,
        running: targets.running || 0,
        paused: targets.paused || 0,
        attentionNeeded: targets.attentionNeeded || 0,
        complete: targets.complete || 0,
        inProgress: targets.inProgress || 0,
        desired: targets.desired || null,
        actual: targets.actual || null,
        accounts: Array.isArray(targets.accounts) ? targets.accounts.map(compactLiveFollowTarget) : [],
      };
    }

    function compactLiveFollowTarget(target) {
      return {
        target: [target.provider, target.runtimeProfileId].filter(Boolean).join('/'),
        desiredState: target.desiredState || null,
        status: target.actualStatus || null,
        statusReason: target.statusReason || null,
        attentionNeeded: target.attentionNeeded === true,
        activeCompletionId: target.activeCompletionId || null,
        latestCompletionStatus: target.latestCompletionStatus || null,
        latestCompletionError: target.latestCompletionError || null,
        phase: target.phase || null,
        passCount: target.passCount || null,
        routineEligibleAt: target.routineEligibleAt || null,
        lastFailureAt: target.lastFailureAt || null,
        consecutiveFailureCount: target.consecutiveFailureCount || 0,
        activeCompletionNextAttemptAt: target.activeCompletionNextAttemptAt || null,
        nextAttemptAt: target.nextAttemptAt || null,
        completeness: target.mirrorCompleteness || null,
        counts: target.metadataCounts || null,
      };
    }

    function compactCompletion(operation) {
      return {
        id: operation.id,
        target: formatCompletionTarget(operation),
        status: operation.status,
        mode: operation.mode,
        phase: operation.phase,
        passes: formatCompletionPasses(operation),
        nextAttemptAt: operation.nextAttemptAt || null,
        completedAt: operation.completedAt || null,
      };
    }

    function buildMirrorCatalogPath() {
      const params = new URLSearchParams();
      const provider = $('mirrorCatalogProvider').value;
      const runtimeProfile = $('mirrorCatalogRuntimeProfile').value.trim();
      const kind = $('mirrorCatalogKind').value || 'all';
      const limit = normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value);
      if (provider) params.set('provider', provider);
      if (runtimeProfile) params.set('runtimeProfile', runtimeProfile);
      params.set('kind', kind);
      params.set('limit', String(limit));
      return '/v1/account-mirrors/catalog?' + params.toString();
    }

    function buildMirrorCatalogItemPath(row) {
      const params = new URLSearchParams();
      if (row.provider) params.set('provider', row.provider);
      if (row.runtimeProfileId) params.set('runtimeProfile', row.runtimeProfileId);
      if (row.kind) params.set('kind', row.kind);
      params.set('limit', String(normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value)));
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(row.itemId) + '?' + params.toString();
    }

    function initializeMirrorCatalogFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      setSelectValue('mirrorCatalogProvider', params.get('provider') || '');
      if (params.has('runtimeProfile')) $('mirrorCatalogRuntimeProfile').value = params.get('runtimeProfile') || '';
      setSelectValue('mirrorCatalogKind', params.get('kind') || 'all');
      if (params.has('search')) $('mirrorCatalogSearch').value = params.get('search') || '';
      setSelectValue('mirrorCatalogPreviewFilter', params.get('preview') || 'all');
      setSelectValue('mirrorCatalogSort', params.get('sort') || 'updated-desc');
      $('mirrorCatalogWithTranscriptOnly').checked = params.get('withTranscript') === '1';
      if (params.has('limit')) $('mirrorCatalogLimit').value = String(normalizeMirrorCatalogLimit(params.get('limit')));
    }

    function setSelectValue(id, value) {
      const node = $(id);
      const allowed = Array.from(node.options).some((option) => option.value === value);
      node.value = allowed ? value : node.options[0].value;
    }

    function updateMirrorCatalogUrl() {
      const params = new URLSearchParams(window.location.search);
      setOptionalUrlParam(params, 'provider', $('mirrorCatalogProvider').value);
      setOptionalUrlParam(params, 'runtimeProfile', $('mirrorCatalogRuntimeProfile').value.trim());
      setOptionalUrlParam(params, 'kind', $('mirrorCatalogKind').value === 'all' ? '' : $('mirrorCatalogKind').value);
      setOptionalUrlParam(params, 'search', $('mirrorCatalogSearch').value.trim());
      setOptionalUrlParam(params, 'preview', $('mirrorCatalogPreviewFilter').value === 'all' ? '' : $('mirrorCatalogPreviewFilter').value);
      setOptionalUrlParam(params, 'sort', $('mirrorCatalogSort').value === 'updated-desc' ? '' : $('mirrorCatalogSort').value);
      setOptionalUrlParam(params, 'withTranscript', $('mirrorCatalogWithTranscriptOnly').checked ? '1' : '');
      const limit = normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value);
      setOptionalUrlParam(params, 'limit', limit === 50 ? '' : String(limit));
      const query = params.toString();
      const nextUrl = window.location.pathname + (query ? '?' + query : '');
      window.history.replaceState(null, '', nextUrl);
    }

    function updateMirrorCatalogDetailUrl(row) {
      if (!isAccountMirrorRoute()) return;
      const params = new URLSearchParams(window.location.search);
      setOptionalUrlParam(params, 'item', row && row.itemId ? row.itemId : '');
      setOptionalUrlParam(params, 'itemKind', row && row.kind ? row.kind : '');
      setOptionalUrlParam(params, 'itemProvider', row && row.provider ? row.provider : '');
      setOptionalUrlParam(params, 'itemRuntimeProfile', row && row.runtimeProfileId ? row.runtimeProfileId : '');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
    }

    function readMirrorCatalogDetailSelectionFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const itemId = params.get('item') || '';
      if (!itemId) return null;
      return {
        itemId,
        kind: params.get('itemKind') || params.get('kind') || '',
        provider: params.get('itemProvider') || params.get('provider') || '',
        runtimeProfileId: params.get('itemRuntimeProfile') || params.get('runtimeProfile') || '',
      };
    }

    function buildMirrorCatalogItemPathFromSelection(selection) {
      const params = new URLSearchParams();
      if (selection.provider) params.set('provider', selection.provider);
      if (selection.runtimeProfileId) params.set('runtimeProfile', selection.runtimeProfileId);
      if (selection.kind && selection.kind !== 'all') params.set('kind', selection.kind);
      params.set('limit', String(normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value)));
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(selection.itemId) + '?' + params.toString();
    }

    function updateMirrorCatalogDetailUrlFromPath(path) {
      if (!isAccountMirrorRoute()) return;
      try {
        const url = new URL(path, window.location.origin);
        const prefix = '/v1/account-mirrors/catalog/items/';
        if (!url.pathname.startsWith(prefix) || url.pathname.endsWith('/asset')) return;
        const itemId = decodeURIComponent(url.pathname.slice(prefix.length));
        updateMirrorCatalogDetailUrl({
          itemId,
          kind: url.searchParams.get('kind') || '',
          provider: url.searchParams.get('provider') || '',
          runtimeProfileId: url.searchParams.get('runtimeProfile') || '',
        });
      } catch {
        return;
      }
    }

    function setOptionalUrlParam(params, key, value) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    function normalizeMirrorCatalogLimit(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 50;
      return Math.max(0, Math.min(500, Math.floor(parsed)));
    }

    async function loadMirrorCatalog() {
      const button = $('loadMirrorCatalog');
      button.disabled = true;
      $('mirrorCatalogSummary').className = 'notice notice-warn';
      $('mirrorCatalogSummary').textContent = 'Reading cached account mirror catalog...';
      $('mirrorCatalogResults').textContent = 'Loading cached indexes...';
      try {
        updateMirrorCatalogUrl();
        const catalog = await fetchJson(buildMirrorCatalogPath());
        mirrorCatalogRows = flattenMirrorCatalogEntries(catalog);
        mirrorCatalogFilteredRows = sortMirrorCatalogRows(filterMirrorCatalogRows(mirrorCatalogRows, {
          query: $('mirrorCatalogSearch').value,
          previewFilter: $('mirrorCatalogPreviewFilter').value,
          withTranscriptOnly: $('mirrorCatalogWithTranscriptOnly').checked,
        }), $('mirrorCatalogSort').value);
        $('mirrorCatalogSummary').className = 'notice notice-ok';
        $('mirrorCatalogSummary').innerHTML = renderMirrorCatalogSummary(catalog, mirrorCatalogRows, mirrorCatalogFilteredRows);
        $('mirrorCatalogKindTabs').innerHTML = renderMirrorCatalogKindTabs(mirrorCatalogRows);
        $('mirrorCatalogResults').innerHTML = renderMirrorCatalogTable(mirrorCatalogFilteredRows);
        $('mirrorCatalogNavigator').innerHTML = renderMirrorCatalogNavigator(mirrorCatalogFilteredRows);
        $('mirrorCatalogNavigatorSummary').textContent = String(mirrorCatalogFilteredRows.length) + ' shown';
        $('mirrorCatalogDetailView').className = 'notice';
        $('mirrorCatalogDetailView').textContent = 'Select a cached row to inspect it.';
        $('mirrorCatalogDetailRaw').textContent = 'No row selected.';
        $('mirrorCatalogRaw').textContent = asJson(catalog);
        if (isAccountMirrorRoute()) {
          openInitialMirrorCatalogDetail();
        }
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCatalogSummary').className = 'notice notice-bad';
        $('mirrorCatalogSummary').textContent = message;
        $('mirrorCatalogKindTabs').textContent = 'Catalog unavailable.';
        $('mirrorCatalogResults').textContent = message;
        $('mirrorCatalogNavigator').textContent = 'Catalog unavailable.';
        $('mirrorCatalogNavigatorSummary').textContent = '0 shown';
        $('mirrorCatalogRaw').textContent = message;
      } finally {
        button.disabled = false;
      }
    }

    function flattenMirrorCatalogEntries(catalog) {
      const rows = [];
      const entries = Array.isArray(catalog && catalog.entries) ? catalog.entries : [];
      for (const entry of entries) {
        const manifests = entry && entry.manifests ? entry.manifests : {};
        for (const kind of ['projects', 'conversations', 'artifacts', 'files', 'media']) {
          const items = Array.isArray(manifests[kind]) ? manifests[kind] : [];
          for (const item of items) {
            const rowIndex = rows.length;
            rows.push({
              rowIndex,
              provider: entry.provider || 'unknown',
              tenantKey: entry.tenantKey || 'unbound',
              bindingKey: entry.bindingKey || 'not reported',
              runtimeProfileId: entry.runtimeProfileId || 'unknown',
              boundIdentityKey: entry.boundIdentityKey || 'unbound',
              status: entry.status || 'unknown',
              kind,
              label: formatCatalogItemLabel(item),
              itemId: formatCatalogItemId(item),
              timestamp: formatCatalogItemTimestamp(item),
              transcriptStatus: formatCatalogTranscriptStatus(kind, item),
              materializationStatus: formatCatalogMaterializationStatus(kind, item),
              item,
              searchable: stringifyCatalogItem(item),
            });
          }
        }
      }
      return rows;
    }

    function filterMirrorCatalogRows(rows, filters) {
      const needle = String(filters && filters.query || '').trim().toLowerCase();
      const previewFilter = String(filters && filters.previewFilter || 'all');
      const withTranscriptOnly = Boolean(filters && filters.withTranscriptOnly);
      return rows.filter((row) => {
        if (withTranscriptOnly && !hasCachedCatalogTranscript(row)) return false;
        if (!matchesCatalogPreviewFilter(row, previewFilter)) return false;
        if (!needle) return true;
        return [
          row.provider,
          row.runtimeProfileId,
          row.boundIdentityKey,
          row.status,
          row.kind,
          row.label,
          row.itemId,
          row.timestamp,
          row.transcriptStatus,
          row.materializationStatus,
          row.searchable,
        ].join(' ').toLowerCase().includes(needle);
      });
    }

    function matchesCatalogPreviewFilter(row, previewFilter) {
      if (!previewFilter || previewFilter === 'all') return true;
      const status = classifyCatalogItemPreview(row.item);
      if (previewFilter === 'previewable') return hasCatalogItemPreviewSignal(row.item);
      if (previewFilter === 'metadata') return row.kind !== 'conversations' && row.kind !== 'projects' && status === 'metadata';
      return status === previewFilter;
    }

    function sortMirrorCatalogRows(rows, sortMode) {
      const copy = rows.slice();
      const mode = sortMode || 'updated-desc';
      copy.sort((left, right) => compareMirrorCatalogRows(left, right, mode));
      return copy;
    }

    function compareMirrorCatalogRows(left, right, sortMode) {
      if (sortMode === 'preview-first') {
        return compareCatalogPreviewRank(left, right, ['local', 'remote', 'inline', 'metadata']) || compareCatalogUpdatedDesc(left, right);
      }
      if (sortMode === 'local-first') {
        return compareCatalogPreviewRank(left, right, ['local', 'remote', 'inline', 'metadata']) || compareCatalogUpdatedDesc(left, right);
      }
      if (sortMode === 'kind') {
        return left.kind.localeCompare(right.kind)
          || left.label.localeCompare(right.label)
          || compareCatalogUpdatedDesc(left, right);
      }
      return compareCatalogUpdatedDesc(left, right);
    }

    function compareCatalogPreviewRank(left, right, order) {
      const leftRank = order.indexOf(classifyCatalogItemPreview(left.item));
      const rightRank = order.indexOf(classifyCatalogItemPreview(right.item));
      return (leftRank === -1 ? order.length : leftRank) - (rightRank === -1 ? order.length : rightRank);
    }

    function compareCatalogUpdatedDesc(left, right) {
      const leftTime = Date.parse(left.timestamp || '');
      const rightTime = Date.parse(right.timestamp || '');
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
        || left.label.localeCompare(right.label);
    }

    function hasCachedCatalogTranscript(row) {
      if (!row || row.kind !== 'conversations') return false;
      return readBooleanField(row.item, ['hasCachedTranscript'])
        || readNumberField(row.item, ['messageCount']) > 0;
    }

    function renderMirrorCatalogSummary(catalog, rows, filteredRows) {
      const metrics = catalog && catalog.metrics ? catalog.metrics : {};
      return '<span class="badges">' + [
        renderBadge('targets', metrics.targets || 0, 'muted'),
        renderBadge('projects', metrics.projects || 0, metrics.projects ? 'ok' : 'muted'),
        renderBadge('conversations', metrics.conversations || 0, metrics.conversations ? 'ok' : 'muted'),
        renderBadge('artifacts', metrics.artifacts || 0, metrics.artifacts ? 'ok' : 'muted'),
        renderBadge('files', metrics.files || 0, metrics.files ? 'ok' : 'muted'),
        renderBadge('media', metrics.media || 0, metrics.media ? 'ok' : 'muted'),
        renderBadge('previewable', countPreviewableCatalogRows(filteredRows), countPreviewableCatalogRows(filteredRows) ? 'ok' : 'muted'),
        renderBadge('shown', filteredRows.length + '/' + rows.length, filteredRows.length ? 'ok' : 'warn'),
      ].join('') + '</span>';
    }

    function renderMirrorCatalogKindTabs(rows) {
      const kinds = ['all', 'projects', 'conversations', 'artifacts', 'files', 'media'];
      const selected = $('mirrorCatalogKind').value || 'all';
      const counts = kinds.reduce((acc, kind) => {
        acc[kind] = kind === 'all' ? rows.length : rows.filter((row) => row.kind === kind).length;
        return acc;
      }, {});
      return kinds.map((kind) => {
        const label = kind + ' ' + String(counts[kind] || 0);
        return '<button type="button" data-catalog-kind-filter="' + escapeHtml(kind) + '" aria-pressed="' + String(selected === kind) + '" onclick="setMirrorCatalogKindFilter(this.dataset.catalogKindFilter)">'
          + escapeHtml(label)
          + '</button>';
      }).join('');
    }

    function renderMirrorCatalogNavigator(rows) {
      if (!rows.length) return '<span class="muted" style="padding: 10px;">No cached rows match the current filters.</span>';
      const maxRows = 80;
      const visibleRows = rows.slice(0, maxRows);
      const buttons = visibleRows.map(renderMirrorCatalogNavigatorItem).join('');
      const overflow = rows.length > maxRows
        ? '<div class="catalog-result-meta" style="padding: 8px 10px;">Showing first ' + String(maxRows) + ' of ' + String(rows.length) + ' filtered rows.</div>'
        : '';
      return buttons + overflow;
    }

    function renderMirrorCatalogNavigatorItem(row) {
      const rowIndex = String(row.rowIndex);
      const title = row.label || row.itemId || 'cached item';
      const meta = [row.kind, row.provider, row.timestamp].filter(Boolean).join(' / ');
      return '<button type="button" class="catalog-result-button" data-catalog-row-index="' + escapeHtml(rowIndex) + '" onclick="showMirrorCatalogDetailByIndex(this.dataset.catalogRowIndex)">'
        + '<strong>' + escapeHtml(title) + '</strong>'
        + '<span class="catalog-result-meta">' + escapeHtml(meta) + '</span>'
        + '<span class="catalog-result-meta">' + escapeHtml(row.itemId) + '</span>'
        + '</button>';
    }

    function setMirrorCatalogKindFilter(kind) {
      setSelectValue('mirrorCatalogKind', kind || 'all');
      void loadMirrorCatalog();
    }

    function openInitialMirrorCatalogDetail() {
      if (openSelectedMirrorCatalogDetailFromUrl()) return;
      openDefaultMirrorCatalogDetail();
    }

    function openSelectedMirrorCatalogDetailFromUrl() {
      const selection = readMirrorCatalogDetailSelectionFromUrl();
      if (!selection) return false;
      const row = findMirrorCatalogRowBySelection(selection);
      if (row) {
        markSelectedMirrorCatalogRow(row.rowIndex);
        showMirrorCatalogDetailByPath(buildMirrorCatalogItemPath(row));
        return true;
      }
      showMirrorCatalogDetailByPath(buildMirrorCatalogItemPathFromSelection(selection));
      return true;
    }

    function findMirrorCatalogRowBySelection(selection) {
      return mirrorCatalogRows.find((row) =>
        row.itemId === selection.itemId
          && (!selection.kind || selection.kind === 'all' || row.kind === selection.kind)
          && (!selection.provider || row.provider === selection.provider)
          && (!selection.runtimeProfileId || row.runtimeProfileId === selection.runtimeProfileId)
      );
    }

    function openDefaultMirrorCatalogDetail() {
      const row = mirrorCatalogFilteredRows.find((candidate) => candidate.kind === 'conversations')
        || mirrorCatalogFilteredRows[0];
      if (!row) return;
      showMirrorCatalogDetailByIndex(row.rowIndex);
    }

    function countPreviewableCatalogRows(rows) {
      return rows.filter((row) => hasCatalogItemPreviewSignal(row.item)).length;
    }

    function collectVisibleCatalogPreviewUrls() {
      return collectVisibleCatalogPreviewEntries().map((entry) => entry.url);
    }

    function collectVisibleCatalogPreviewEntries() {
      const entries = [];
      for (const row of mirrorCatalogFilteredRows) {
        const previewUrl = resolveCatalogRowPreviewUrl(row);
        if (!previewUrl) continue;
        const url = new URL(previewUrl, window.location.origin).href;
        if (entries.some((entry) => entry.url === url)) continue;
        entries.push({
          url,
          provider: row.provider || '',
          runtimeProfile: row.runtimeProfileId || '',
          kind: row.kind || '',
          title: row.label || '',
          itemId: row.itemId || '',
          boundIdentity: row.boundIdentityKey || '',
          updatedAt: row.timestamp || '',
        });
      }
      return entries;
    }

    function buildMirrorCatalogAccountMirrorPath(row) {
      const params = new URLSearchParams(window.location.search);
      setOptionalUrlParam(params, 'provider', row.provider || '');
      setOptionalUrlParam(params, 'runtimeProfile', row.runtimeProfileId || '');
      setOptionalUrlParam(params, 'kind', row.kind && row.kind !== 'all' ? row.kind : '');
      setOptionalUrlParam(params, 'item', row.itemId || '');
      setOptionalUrlParam(params, 'itemKind', row.kind || '');
      setOptionalUrlParam(params, 'itemProvider', row.provider || '');
      setOptionalUrlParam(params, 'itemRuntimeProfile', row.runtimeProfileId || '');
      return routeWithQuery(OPERATOR_DASHBOARD_ROUTES.accountMirrorPath || '/account-mirror', params.toString());
    }

    function collectVisibleCatalogDetailLinks() {
      const links = [];
      for (const row of mirrorCatalogFilteredRows) {
        const path = buildMirrorCatalogAccountMirrorPath(row);
        if (!path) continue;
        const url = new URL(path, window.location.origin).href;
        if (!links.includes(url)) links.push(url);
      }
      return links;
    }

    async function copyVisibleMirrorCatalogDetailLinks() {
      const links = collectVisibleCatalogDetailLinks();
      if (!links.length) {
        setMirrorCatalogBatchNotice('No visible detail links to copy.', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(links.join('\\n'));
        setMirrorCatalogBatchNotice('Copied ' + String(links.length) + ' visible detail link(s).', 'ok');
      } catch {
        setMirrorCatalogBatchNotice('Could not copy visible detail links.', 'bad');
      }
    }

    function showVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      $('mirrorCatalogPreviewUrlDrawer').hidden = false;
      $('mirrorCatalogPreviewUrlList').textContent = urls.length ? urls.join('\\n') : 'No visible preview URLs.';
      setMirrorCatalogBatchNotice(
        urls.length
          ? 'Previewing ' + String(urls.length) + ' visible preview URL(s).'
          : 'No visible preview URLs to preview.',
        urls.length ? 'ok' : 'warn',
      );
    }

    function hideVisibleMirrorCatalogPreviewUrls() {
      $('mirrorCatalogPreviewUrlDrawer').hidden = true;
    }

    function openVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to open.', 'warn');
        return;
      }
      const openLimit = 8;
      urls.slice(0, openLimit).forEach((url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      const suffix = urls.length > openLimit ? ' Limited to first ' + String(openLimit) + ' of ' + String(urls.length) + '.' : '';
      setMirrorCatalogBatchNotice('Opened ' + String(Math.min(urls.length, openLimit)) + ' visible preview URL(s).' + suffix, 'ok');
    }

    function reviewVisibleMirrorCatalogPreviews() {
      const entries = collectVisibleCatalogPreviewEntries();
      if (!entries.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to review.', 'warn');
        return;
      }
      const reviewLimit = 24;
      const selectedEntries = entries.slice(0, reviewLimit);
      const sessionId = 'preview-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
      localStorage.setItem('auracall.previewSession.' + sessionId, JSON.stringify({
        createdAt: new Date().toISOString(),
        items: selectedEntries,
        urls: selectedEntries.map((entry) => entry.url),
      }));
      const suffix = entries.length > reviewLimit ? ' Limited to first ' + String(reviewLimit) + ' of ' + String(entries.length) + '.' : '';
      window.open(routeWithQuery(OPERATOR_DASHBOARD_ROUTES.previewSessionPath || '/account-mirror/preview-session', 'session=' + encodeURIComponent(sessionId)), '_blank', 'noopener,noreferrer');
      setMirrorCatalogBatchNotice('Opened preview session for ' + String(selectedEntries.length) + ' visible preview URL(s).' + suffix, 'ok');
    }

    async function copyVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to copy.', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(urls.join('\\n'));
        setMirrorCatalogBatchNotice('Copied ' + String(urls.length) + ' visible preview URL(s).', 'ok');
      } catch {
        setMirrorCatalogBatchNotice('Could not copy visible preview URLs.', 'bad');
      }
    }

    function downloadVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to download.', 'warn');
        return;
      }
      const blob = new Blob([urls.join('\\n') + '\\n'], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = formatVisibleCatalogPreviewUrlsFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setMirrorCatalogBatchNotice('Downloaded ' + String(urls.length) + ' visible preview URL(s).', 'ok');
    }

    function formatVisibleCatalogPreviewUrlsFilename() {
      const provider = $('mirrorCatalogProvider').value || 'all-providers';
      const kind = $('mirrorCatalogKind').value || 'all';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return 'auracall-preview-urls-' + provider + '-' + kind + '-' + timestamp + '.txt';
    }

    async function initializeMirrorPreviewSession() {
      if (!isPreviewSessionRoute()) return;
      $('mirrorPreviewSessionPanel').hidden = false;
      await refreshSavedMirrorPreviewSessions();
      const params = new URLSearchParams(window.location.search);
      const savedSessionId = params.get('saved');
      if (savedSessionId) {
        await loadSavedMirrorPreviewSessionById(savedSessionId);
        return;
      }
      const urls = readMirrorPreviewSessionUrls();
      renderMirrorPreviewSession(urls);
    }

    function readMirrorPreviewSessionUrls() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session');
      if (sessionId) {
        try {
          const record = JSON.parse(localStorage.getItem('auracall.previewSession.' + sessionId) || '{}');
          const manifestItems = normalizeMirrorPreviewSessionManifest(record);
          if (manifestItems.length) return manifestItems;
          if (Array.isArray(record.items)) return normalizeMirrorPreviewSessionItems(record.items);
          if (Array.isArray(record.urls)) return normalizeMirrorPreviewSessionItems(record.urls);
        } catch {
          return [];
        }
      }
      const repeatedUrls = params.getAll('url');
      if (repeatedUrls.length) return normalizeMirrorPreviewSessionItems(repeatedUrls);
      const encodedUrls = params.get('urls');
      if (!encodedUrls) return [];
      try {
        return normalizeMirrorPreviewSessionItems(JSON.parse(encodedUrls));
      } catch {
        return [];
      }
    }

    function normalizeMirrorPreviewSessionManifest(value) {
      if (!value || typeof value !== 'object') return [];
      if (value.schema !== 'auracall.preview-session-manifest.v1') return [];
      return normalizeMirrorPreviewSessionItems(value.items);
    }

    function normalizeMirrorPreviewSessionItems(values) {
      if (!Array.isArray(values)) return [];
      const items = [];
      for (const value of values) {
        const source = value && typeof value === 'object' ? value : { url: value };
        const rawUrl = String(source.url || '').trim();
        if (!isSafePreviewUrl(rawUrl)) continue;
        const url = new URL(rawUrl, window.location.origin).href;
        if (items.some((item) => item.url === url)) continue;
        items.push({
          url,
          provider: String(source.provider || ''),
          runtimeProfile: String(source.runtimeProfile || ''),
          kind: String(source.kind || ''),
          title: String(source.title || ''),
          itemId: String(source.itemId || ''),
          boundIdentity: String(source.boundIdentity || ''),
          updatedAt: String(source.updatedAt || ''),
        });
        if (items.length >= 24) break;
      }
      return items;
    }

    function renderMirrorPreviewSession(items) {
      const notice = $('mirrorPreviewSessionNotice');
      const grid = $('mirrorPreviewSessionGrid');
      mirrorPreviewSessionItems = items;
      mirrorPreviewSessionUrls = items.map((item) => item.url);
      mirrorPreviewSessionSelectedUrls = new Set(mirrorPreviewSessionUrls);
      if (!items.length) {
        notice.textContent = 'No preview session URLs were found. Start from Account Mirror and choose Review visible previews.';
        notice.className = 'notice notice-warn';
        grid.innerHTML = 'No previews loaded.';
        return;
      }
      notice.textContent = 'Rendering ' + String(items.length) + ' cached preview URL(s); ' + String(mirrorPreviewSessionSelectedUrls.size) + ' selected.';
      notice.className = 'notice notice-ok';
      grid.innerHTML = items.map(renderMirrorPreviewSessionItem).join('');
    }

    function renderMirrorPreviewSessionItem(item, index) {
      const url = item.url;
      const title = item.title || item.itemId || 'Cached preview';
      const labels = [
        item.provider ? renderBadge('provider', item.provider, 'muted') : '',
        item.kind ? renderBadge('kind', item.kind, 'muted') : '',
        item.runtimeProfile ? renderBadge('profile', item.runtimeProfile, 'muted') : '',
        item.boundIdentity ? renderBadge('identity', item.boundIdentity, 'muted') : '',
      ].filter(Boolean).join('');
      return '<article class="preview-session-item">'
        + '<div class="control-title"><label><input class="mirror-preview-session-select" type="checkbox" data-preview-url="' + escapeHtml(url) + '" checked> <strong>' + escapeHtml(title) + '</strong></label><a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">Open</a></div>'
        + '<div class="badges">' + labels + '</div>'
        + '<dl><dt>Preview</dt><dd>' + String(index + 1) + '</dd><dt>Item ID</dt><dd>' + escapeHtml(item.itemId || 'unknown') + '</dd><dt>Updated</dt><dd>' + escapeHtml(item.updatedAt || 'unknown') + '</dd></dl>'
        + renderMirrorPreviewSessionEmbed(url)
        + '<code>' + escapeHtml(url) + '</code>'
        + '</article>';
    }

    function renderMirrorPreviewSessionEmbed(url) {
      const lower = url.toLowerCase();
      if (lower.startsWith('data:image/') || /\\.(apng|avif|gif|jpe?g|png|webp)(\\?|#|$)/.test(lower)) {
        return '<img src="' + escapeHtml(url) + '" alt="Cached preview">';
      }
      if (lower.startsWith('data:video/') || /\\.(mp4|mov|m4v|webm)(\\?|#|$)/.test(lower)) {
        return '<video src="' + escapeHtml(url) + '" controls></video>';
      }
      if (lower.startsWith('data:audio/') || /\\.(mp3|m4a|ogg|wav|webm)(\\?|#|$)/.test(lower)) {
        return '<audio src="' + escapeHtml(url) + '" controls></audio>';
      }
      if (lower.startsWith('data:application/pdf') || /\\.pdf(\\?|#|$)/.test(lower)) {
        return '<iframe class="preview-session-frame" src="' + escapeHtml(url) + '" title="Cached PDF preview"></iframe>';
      }
      return '<iframe class="preview-session-frame" src="' + escapeHtml(url) + '" title="Cached preview"></iframe>';
    }

    async function copyMirrorPreviewSessionUrls() {
      const urls = selectedMirrorPreviewSessionUrls();
      if (!urls.length) {
        $('mirrorPreviewSessionNotice').textContent = 'No selected session URLs to copy.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      await navigator.clipboard.writeText(urls.join('\\n'));
      $('mirrorPreviewSessionNotice').textContent = 'Copied ' + String(urls.length) + ' selected session URL(s).';
      $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
    }

    function downloadMirrorPreviewSessionUrls() {
      const urls = selectedMirrorPreviewSessionUrls();
      if (!urls.length) {
        $('mirrorPreviewSessionNotice').textContent = 'No selected session URLs to download.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      const blob = new Blob([urls.join('\\n') + '\\n'], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'auracall-preview-session-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      $('mirrorPreviewSessionNotice').textContent = 'Downloaded ' + String(urls.length) + ' selected session URL(s).';
      $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
    }

    function downloadMirrorPreviewSessionManifest() {
      const manifest = buildSelectedMirrorPreviewSessionManifest();
      if (!manifest) return;
      const blob = new Blob([JSON.stringify(manifest, null, 2) + '\\n'], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'auracall-preview-session-manifest-' + manifest.generatedAt.replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      $('mirrorPreviewSessionNotice').textContent = 'Downloaded selected manifest for ' + String(manifest.items.length) + ' session item(s).';
      $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
    }

    function buildSelectedMirrorPreviewSessionManifest() {
      const items = selectedMirrorPreviewSessionItems();
      if (!items.length) {
        $('mirrorPreviewSessionNotice').textContent = 'No selected session items to export.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return null;
      }
      const generatedAt = new Date().toISOString();
      return {
        schema: 'auracall.preview-session-manifest.v1',
        generatedAt,
        count: items.length,
        items: items.map((item, index) => ({
          index: index + 1,
          provider: item.provider || '',
          runtimeProfile: item.runtimeProfile || '',
          kind: item.kind || '',
          title: item.title || '',
          itemId: item.itemId || '',
          boundIdentity: item.boundIdentity || '',
          updatedAt: item.updatedAt || '',
          url: item.url,
        })),
      };
    }

    async function loadMirrorPreviewSessionManifestFile(event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;
      try {
        const manifest = JSON.parse(await file.text());
        const items = normalizeMirrorPreviewSessionManifest(manifest);
        if (!items.length) {
          $('mirrorPreviewSessionNotice').textContent = 'No valid preview session manifest items were found.';
          $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
          return;
        }
        renderMirrorPreviewSession(items);
        $('mirrorPreviewSessionNotice').textContent = 'Loaded manifest with ' + String(items.length) + ' preview item(s); ' + String(mirrorPreviewSessionSelectedUrls.size) + ' selected.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
      } catch (error) {
        $('mirrorPreviewSessionNotice').textContent = 'Could not load preview session manifest: ' + String(error && error.message ? error.message : error);
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
      } finally {
        input.value = '';
      }
    }

    async function saveMirrorPreviewSession() {
      const manifest = buildSelectedMirrorPreviewSessionManifest();
      if (!manifest) return;
      const name = $('mirrorPreviewSessionName').value.trim();
      try {
        const record = await postJson('/v1/account-mirrors/preview-sessions', {
          name: name || null,
          manifest,
        });
        $('mirrorPreviewSessionNotice').textContent = 'Saved named preview session ' + record.id + ' with ' + String(record.itemCount || manifest.items.length) + ' item(s).';
        $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
        await refreshSavedMirrorPreviewSessions(record.id);
      } catch (error) {
        $('mirrorPreviewSessionNotice').textContent = 'Could not save preview session: ' + String(error && error.message ? error.message : error);
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
      }
    }

    async function refreshSavedMirrorPreviewSessions(selectedId) {
      if (!isPreviewSessionRoute()) return;
      const select = $('savedMirrorPreviewSessions');
      try {
        const payload = await fetchJson('/v1/account-mirrors/preview-sessions?limit=50');
        const sessions = Array.isArray(payload.data) ? payload.data : [];
        savedMirrorPreviewSessionsCache = sessions;
        select.innerHTML = '<option value="">saved sessions</option>' + sessions.map((session) => {
          const label = (session.name || session.id || 'preview session') + ' (' + String(session.itemCount || 0) + ')';
          return '<option value="' + escapeHtml(session.id || '') + '">' + escapeHtml(label) + '</option>';
        }).join('');
        if (selectedId) select.value = selectedId;
        renderSavedMirrorPreviewSessionTable();
      } catch {
        savedMirrorPreviewSessionsCache = [];
        select.innerHTML = '<option value="">saved sessions unavailable</option>';
        $('savedMirrorPreviewSessionTable').innerHTML = '<div class="notice notice-warn">Saved sessions unavailable.</div>';
      }
    }

    function renderSavedMirrorPreviewSessionTable() {
      const search = normalizeSearchTerm($('savedMirrorPreviewSessionSearch').value);
      const sessions = savedMirrorPreviewSessionsCache.filter((session) => {
        if (!search) return true;
        return buildSavedPreviewSessionSearchText(session).includes(search);
      });
      if (!sessions.length) {
        $('savedMirrorPreviewSessionTable').innerHTML = '<div class="notice">No saved preview sessions match the current search.</div>';
        return;
      }
      const rows = sessions.map((session) => {
        const id = session.id || '';
        const openPath = routeWithQuery(OPERATOR_DASHBOARD_ROUTES.previewSessionPath || '/account-mirror/preview-session', 'saved=' + encodeURIComponent(id));
        return '<tr data-preview-session-id="' + escapeHtml(id) + '">'
          + '<td class="wrap"><strong>' + escapeHtml(session.name || id || 'preview session') + '</strong><br><span class="muted">' + escapeHtml(id) + '</span></td>'
          + '<td>' + escapeHtml(String(session.itemCount || 0)) + '</td>'
          + '<td>' + escapeHtml(formatPreviewSessionTimestamp(session.createdAt)) + '</td>'
          + '<td>' + escapeHtml(formatPreviewSessionTimestamp(session.updatedAt)) + '</td>'
          + '<td class="wrap">' + renderSavedPreviewSessionKindBadges(session) + '</td>'
          + '<td><div class="catalog-row-actions">'
          + '<button class="link-button" type="button" data-saved-preview-action="load" data-preview-session-id="' + escapeHtml(id) + '">Load</button>'
          + '<a href="' + escapeHtml(openPath) + '" target="_blank" rel="noreferrer">Open</a>'
          + '</div></td>'
          + '</tr>';
      }).join('');
      $('savedMirrorPreviewSessionTable').innerHTML = '<div class="table-wrap"><table id="savedMirrorPreviewSessionsTable">'
        + '<thead><tr><th>Name</th><th>Items</th><th>Created</th><th>Updated</th><th>Content</th><th>Actions</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    function buildSavedPreviewSessionSearchText(session) {
      const values = [
        session.id,
        session.name,
        session.createdAt,
        session.updatedAt,
      ];
      const items = session.manifest && Array.isArray(session.manifest.items) ? session.manifest.items : [];
      for (const item of items) {
        values.push(item.provider, item.runtimeProfile, item.kind, item.title, item.itemId, item.boundIdentity, item.url);
      }
      return normalizeSearchTerm(values.filter(Boolean).join(' '));
    }

    function renderSavedPreviewSessionKindBadges(session) {
      const items = session.manifest && Array.isArray(session.manifest.items) ? session.manifest.items : [];
      const counts = new Map();
      for (const item of items) {
        const key = [item.provider || 'provider?', item.kind || 'kind?'].join('/');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      if (!counts.size) return '<span class="muted">metadata unavailable</span>';
      return '<div class="badges">' + Array.from(counts.entries()).map(([key, count]) =>
        '<span class="badge">' + escapeHtml(key) + ' ' + escapeHtml(String(count)) + '</span>'
      ).join('') + '</div>';
    }

    function formatPreviewSessionTimestamp(value) {
      const timestamp = Date.parse(String(value || ''));
      if (!Number.isFinite(timestamp)) return 'unknown';
      return new Date(timestamp).toLocaleString();
    }

    function handleSavedMirrorPreviewSessionTableClick(event) {
      const action = event.target && event.target.getAttribute && event.target.getAttribute('data-saved-preview-action');
      if (action !== 'load') return;
      const id = event.target.getAttribute('data-preview-session-id');
      if (id) {
        $('savedMirrorPreviewSessions').value = id;
        void loadSavedMirrorPreviewSessionById(id);
      }
    }

    async function loadSelectedSavedMirrorPreviewSession() {
      const id = $('savedMirrorPreviewSessions').value;
      if (!id) {
        $('mirrorPreviewSessionNotice').textContent = 'Choose a saved preview session to load.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      await loadSavedMirrorPreviewSessionById(id);
    }

    async function loadSavedMirrorPreviewSessionById(id) {
      try {
        const record = await fetchJson('/v1/account-mirrors/preview-sessions/' + encodeURIComponent(id));
        const items = normalizeMirrorPreviewSessionManifest(record.manifest);
        if (!items.length) {
          $('mirrorPreviewSessionNotice').textContent = 'Saved preview session has no valid manifest items.';
          $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
          return;
        }
        renderMirrorPreviewSession(items);
        $('mirrorPreviewSessionName').value = record.name || '';
        $('savedMirrorPreviewSessions').value = record.id || '';
        $('mirrorPreviewSessionNotice').textContent = 'Loaded saved preview session ' + (record.name || record.id) + ' with ' + String(items.length) + ' preview item(s).';
        $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
      } catch (error) {
        $('mirrorPreviewSessionNotice').textContent = 'Could not load saved preview session: ' + String(error && error.message ? error.message : error);
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
      }
    }

    async function renameSelectedSavedMirrorPreviewSession() {
      const id = $('savedMirrorPreviewSessions').value;
      const name = $('mirrorPreviewSessionName').value.trim();
      if (!id) {
        $('mirrorPreviewSessionNotice').textContent = 'Choose a saved preview session to rename.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      if (!name) {
        $('mirrorPreviewSessionNotice').textContent = 'Enter a session name before renaming.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      try {
        const record = await patchJson('/v1/account-mirrors/preview-sessions/' + encodeURIComponent(id), { name });
        $('mirrorPreviewSessionName').value = record.name || name;
        $('mirrorPreviewSessionNotice').textContent = 'Renamed saved preview session ' + (record.name || record.id) + '.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
        await refreshSavedMirrorPreviewSessions(record.id || id);
      } catch (error) {
        $('mirrorPreviewSessionNotice').textContent = 'Could not rename saved preview session: ' + String(error && error.message ? error.message : error);
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
      }
    }

    async function deleteSelectedSavedMirrorPreviewSession() {
      const id = $('savedMirrorPreviewSessions').value;
      if (!id) {
        $('mirrorPreviewSessionNotice').textContent = 'Choose a saved preview session to delete.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      try {
        await deleteJson('/v1/account-mirrors/preview-sessions/' + encodeURIComponent(id));
        $('savedMirrorPreviewSessions').value = '';
        $('mirrorPreviewSessionNotice').textContent = 'Deleted saved preview session ' + id + '.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
        await refreshSavedMirrorPreviewSessions();
      } catch (error) {
        $('mirrorPreviewSessionNotice').textContent = 'Could not delete saved preview session: ' + String(error && error.message ? error.message : error);
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
      }
    }

    function selectedMirrorPreviewSessionUrls() {
      return mirrorPreviewSessionUrls.filter((url) => mirrorPreviewSessionSelectedUrls.has(url));
    }

    function selectedMirrorPreviewSessionItems() {
      return mirrorPreviewSessionItems.filter((item) => mirrorPreviewSessionSelectedUrls.has(item.url));
    }

    function setMirrorPreviewSessionSelection(selectAll) {
      mirrorPreviewSessionSelectedUrls = new Set(selectAll ? mirrorPreviewSessionUrls : []);
      document.querySelectorAll('.mirror-preview-session-select').forEach((input) => {
        input.checked = selectAll;
      });
      updateMirrorPreviewSessionSelectionNotice();
    }

    function updateMirrorPreviewSessionSelection(event) {
      const input = event && event.target;
      if (!input || !input.dataset || !input.dataset.previewUrl) return;
      if (input.checked) {
        mirrorPreviewSessionSelectedUrls.add(input.dataset.previewUrl);
      } else {
        mirrorPreviewSessionSelectedUrls.delete(input.dataset.previewUrl);
      }
      updateMirrorPreviewSessionSelectionNotice();
    }

    function updateMirrorPreviewSessionSelectionNotice() {
      $('mirrorPreviewSessionNotice').textContent = 'Rendering ' + String(mirrorPreviewSessionUrls.length) + ' cached preview URL(s); ' + String(mirrorPreviewSessionSelectedUrls.size) + ' selected.';
      $('mirrorPreviewSessionNotice').className = mirrorPreviewSessionSelectedUrls.size ? 'notice notice-ok' : 'notice notice-warn';
    }

    function setMirrorCatalogBatchNotice(message, tone) {
      const node = $('mirrorCatalogBatchNotice');
      node.className = 'notice' + (tone ? ' notice-' + tone : '');
      node.textContent = message;
    }

    function renderMirrorCatalogTable(rows) {
      if (!rows.length) return '<span class="muted">No cached mirror catalog rows matched the current filters.</span>';
      return '<div class="table-wrap"><table id="mirrorCatalogItems"><thead><tr>' + [
        'Type',
        'Name',
        'Updated',
        'State',
        'Identity',
        'Tenant Key',
        'Binding Key',
        'Actions',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + rows.map(renderMirrorCatalogRow).join('') + '</tbody></table></div>';
    }

    function renderMirrorCatalogRow(row) {
      const rowIndex = String(row.rowIndex);
      const itemPath = buildMirrorCatalogItemPath(row);
      return '<tr data-catalog-row-index="' + escapeHtml(rowIndex) + '" onclick="showMirrorCatalogDetailByIndex(this.dataset.catalogRowIndex)">' + [
        '<td>' + renderBadge(row.provider, row.kind, row.kind === 'conversations' ? 'ok' : 'muted') + '<br><span class="muted">' + escapeHtml(row.runtimeProfileId) + '</span></td>',
        '<td class="wrap"><div class="catalog-title-cell"><strong>' + escapeHtml(row.label) + '</strong><span class="muted">' + escapeHtml(row.itemId) + '</span><span>' + escapeHtml(trimCatalogSnippet(row.searchable)) + '</span></div></td>',
        '<td class="wrap">' + escapeHtml(row.timestamp) + '</td>',
        '<td><div class="badges">' + renderCatalogTranscriptBadge(row) + renderCatalogMaterializationBadge(row) + '</div></td>',
        '<td class="wrap">' + escapeHtml(row.boundIdentityKey) + '</td>',
        '<td class="wrap">' + escapeHtml(row.tenantKey) + '</td>',
        '<td class="wrap">' + escapeHtml(row.bindingKey) + '</td>',
        '<td>' + renderCatalogRowActions(row, itemPath) + '</td>',
      ].join('') + '</tr>';
    }

    function renderCatalogRowActions(row, itemPath) {
      const previewUrl = resolveCatalogRowPreviewUrl(row);
      const actions = [
        '<a href="' + escapeHtml(itemPath) + '" data-catalog-row-index="' + escapeHtml(String(row.rowIndex)) + '" data-catalog-item-path="' + escapeHtml(itemPath) + '" onclick="event.preventDefault(); event.stopPropagation(); showMirrorCatalogDetailByIndex(this.dataset.catalogRowIndex)">Details</a>',
      ];
      if (canReconcileMirrorCatalogRow(row)) {
        actions.push('<button type="button" class="link-button" data-catalog-row-index="' + escapeHtml(String(row.rowIndex)) + '" onclick="event.stopPropagation(); reconcileMirrorCatalogRow(this.dataset.catalogRowIndex)">Reconcile</button>');
      }
      if (previewUrl) {
        actions.push('<a href="' + escapeHtml(previewUrl) + '" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">Open Preview</a>');
        actions.push('<button type="button" class="link-button" data-catalog-preview-url="' + escapeHtml(previewUrl) + '" onclick="copyCatalogPreviewUrl(this); event.stopPropagation();">Copy URL</button>');
      }
      return '<span class="catalog-row-actions">' + actions.join(' ') + '</span>';
    }

    function canReconcileMirrorCatalogRow(row) {
      return row
        && row.kind === 'conversations'
        && row.provider
        && row.runtimeProfileId
        && row.itemId;
    }

    function resolveCatalogRowPreviewUrl(row) {
      const status = classifyCatalogItemPreview(row.item);
      if (status === 'local') return buildMirrorCatalogItemAssetPath(row);
      if (status === 'remote') return readCatalogPreviewUrl(row.item);
      return '';
    }

    function buildMirrorCatalogItemAssetPath(row) {
      const params = new URLSearchParams();
      if (row.provider) params.set('provider', row.provider);
      if (row.runtimeProfileId) params.set('runtimeProfile', row.runtimeProfileId);
      if (row.kind) params.set('kind', row.kind);
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(row.itemId) + '/asset?' + params.toString();
    }

    async function copyCatalogPreviewUrl(button) {
      const url = button && button.dataset ? button.dataset.catalogPreviewUrl : '';
      if (!url) return;
      try {
        await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      window.setTimeout(() => {
        button.textContent = 'Copy URL';
      }, 1800);
    }

    async function reconcileMirrorCatalogRow(index) {
      const parsed = Number(index);
      const row = mirrorCatalogRows.find((candidate) => candidate.rowIndex === parsed);
      if (!canReconcileMirrorCatalogRow(row)) {
        setMirrorCatalogBatchNotice('Select a cached conversation row to reconcile.', 'warn');
        return;
      }
      setMirrorCatalogBatchNotice('Queuing conversation reconciliation for ' + row.itemId + '...', 'warn');
      try {
        const result = await postJson('/v1/account-mirrors/materializations', {
          provider: row.provider,
          runtimeProfile: row.runtimeProfileId,
          catalogItemId: row.itemId,
          catalogKind: 'conversations',
          assetKinds: ['all'],
          refreshSnapshot: true,
          force: false,
        });
        const job = result && result.job ? result.job : result;
        const suffix = job && job.id ? ' (' + job.id + ')' : '';
        setMirrorCatalogBatchNotice('Queued conversation reconciliation' + suffix + '.', 'ok');
      } catch (error) {
        setMirrorCatalogBatchNotice('Conversation reconciliation failed: ' + String(error.message || error), 'bad');
      }
    }

    function renderCatalogTranscriptBadge(row) {
      if (row.kind !== 'conversations') return renderBadge('n/a', 'metadata', 'muted');
      const count = readNumberField(row.item, ['messageCount']);
      if (readBooleanField(row.item, ['hasCachedTranscript']) || count > 0) {
        return renderBadge('chat', String(count || '?'), 'ok');
      }
      return renderBadge('chat', 'none', 'warn');
    }

    function renderCatalogMaterializationBadge(row) {
      if (row.kind === 'conversations' || row.kind === 'projects') return renderBadge('asset', 'n/a', 'muted');
      const status = classifyCatalogItemPreview(row.item);
      if (status === 'local') return renderBadge('asset', 'local', 'ok');
      if (status === 'remote') return renderBadge('asset', 'remote', 'ok');
      if (status === 'inline') return renderBadge('asset', 'inline', 'ok');
      return renderBadge('asset', 'metadata', 'muted');
    }

    function formatCatalogMaterializationStatus(kind, item) {
      if (kind === 'conversations' || kind === 'projects') return 'asset n/a';
      const status = classifyCatalogItemPreview(item);
      if (status === 'local') return 'local cached asset';
      if (status === 'remote') return 'remote preview asset';
      if (status === 'inline') return 'inline preview asset';
      return 'metadata only asset';
    }

    function classifyCatalogItemPreview(item) {
      if (readCatalogItemStringField(item, ['markdown', 'text', 'content', 'body'])) return 'inline';
      if (readCatalogItemStringField(item, ['localPath', 'path', 'filePath', 'absolutePath', 'assetStorageRelpath', 'storageRelpath'])) return 'local';
      if (readCatalogPreviewUrl(item)) return 'remote';
      return 'metadata';
    }

    function hasCatalogItemPreviewSignal(item) {
      const status = classifyCatalogItemPreview(item);
      return status === 'local' || status === 'remote' || status === 'inline';
    }

    function formatCatalogTranscriptStatus(kind, item) {
      if (kind !== 'conversations') return 'metadata only';
      const count = readNumberField(item, ['messageCount']);
      if (readBooleanField(item, ['hasCachedTranscript']) || count > 0) return 'cached transcript ' + String(count || '');
      return 'no cached transcript';
    }

    function showMirrorCatalogDetailByIndex(index) {
      const parsed = Number(index);
      const row = mirrorCatalogRows.find((candidate) => candidate.rowIndex === parsed);
      if (!row) {
        $('mirrorCatalogDetailView').className = 'notice notice-bad';
        $('mirrorCatalogDetailView').textContent = 'Cached row not found.';
        $('mirrorCatalogDetailRaw').textContent = 'Cached row not found.';
        return;
      }
      markSelectedMirrorCatalogRow(row.rowIndex);
      updateMirrorCatalogDetailUrl(row);
      showMirrorCatalogDetailByPath(buildMirrorCatalogItemPath(row));
    }

    function markSelectedMirrorCatalogRow(rowIndex) {
      document.querySelectorAll('#mirrorCatalogItems tr[data-catalog-row-index]').forEach((node) => {
        node.classList.toggle('catalog-row-selected', node.getAttribute('data-catalog-row-index') === String(rowIndex));
      });
      document.querySelectorAll('#mirrorCatalogNavigator .catalog-result-button[data-catalog-row-index]').forEach((node) => {
        node.classList.toggle('catalog-nav-selected', node.getAttribute('data-catalog-row-index') === String(rowIndex));
      });
    }

    function focusMirrorCatalogSearch() {
      const input = $('mirrorCatalogSearch');
      input.focus();
      input.select();
    }

    function handleMirrorCatalogKeyboard(event) {
      if (event.defaultPrevented) return;
      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input'
        || tag === 'textarea'
        || tag === 'select'
        || Boolean(target && target.isContentEditable);
      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        focusMirrorCatalogSearch();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const inNavigator = Boolean(target && target.closest && target.closest('#mirrorCatalogNavigator'));
      if (isEditable && !inNavigator) return;
      const buttons = Array.from(document.querySelectorAll('#mirrorCatalogNavigator .catalog-result-button[data-catalog-row-index]'));
      if (!buttons.length) return;
      event.preventDefault();
      const selectedIndex = buttons.findIndex((button) => button.classList.contains('catalog-nav-selected'));
      let nextIndex = selectedIndex;
      if (nextIndex < 0) {
        nextIndex = event.key === 'ArrowDown' ? 0 : buttons.length - 1;
      } else {
        nextIndex += event.key === 'ArrowDown' ? 1 : -1;
      }
      nextIndex = Math.max(0, Math.min(buttons.length - 1, nextIndex));
      const button = buttons[nextIndex];
      button.focus();
      showMirrorCatalogDetailByIndex(button.dataset.catalogRowIndex);
    }

    async function showMirrorCatalogDetailByPath(path, updateUrlFromPath) {
      if (updateUrlFromPath) updateMirrorCatalogDetailUrlFromPath(path);
      $('mirrorCatalogDetailView').className = 'notice notice-warn';
      $('mirrorCatalogDetailView').textContent = 'Loading cached item detail...';
      $('mirrorCatalogDetailRaw').textContent = 'Loading cached item detail...';
      try {
        const detail = await fetchJson(path);
        mirrorCatalogCurrentDetail = detail;
        $('mirrorCatalogDetailView').className = 'notice';
        $('mirrorCatalogDetailView').innerHTML = renderMirrorCatalogDetailView(detail);
        $('mirrorCatalogDetailRaw').textContent = asJson(detail);
      } catch (error) {
        mirrorCatalogCurrentDetail = null;
        const message = String(error.message || error);
        $('mirrorCatalogDetailView').className = 'notice notice-bad';
        $('mirrorCatalogDetailView').textContent = message;
        $('mirrorCatalogDetailRaw').textContent = message;
      }
    }

    function renderMirrorCatalogDetailView(detail) {
      if (!detail || typeof detail !== 'object') return '<span class="muted">No cached detail available.</span>';
      if (detail.kind === 'conversations') return renderConversationDetailView(detail);
      if (detail.kind === 'files' || detail.kind === 'artifacts' || detail.kind === 'media') {
        return renderCachedAssetDetailView(detail);
      }
      return renderGenericCatalogDetailView(detail);
    }

    function renderConversationDetailView(detail) {
      const item = detail.item || {};
      const turns = extractConversationTurns(item);
      const header = renderCatalogDetailHeader(detail, item);
      const relatedItems = renderConversationRelatedItems(detail, item);
      if (!turns.length) {
        return header
          + relatedItems
          + '<div class="notice notice-warn">No cached transcript turns are available for this conversation yet.</div>';
      }
      return header
        + relatedItems
        + renderConversationTranscriptActions(turns)
        + '<div class="chat-transcript">' + turns.map(renderChatTurn).join('') + '</div>';
    }

    function renderConversationRelatedItems(detail, item) {
      const files = readObjectArray(item, ['files']);
      const artifacts = readObjectArray(item, ['artifacts']);
      const sources = readObjectArray(item, ['sources']);
      if (!files.length && !artifacts.length && !sources.length) return '';
      return '<div class="notice">'
        + '<strong>Cached related items</strong>'
        + renderConversationRelatedSection('Files', 'files', files, detail)
        + renderConversationRelatedSection('Artifacts', 'artifacts', artifacts, detail)
        + renderConversationSourceSection(sources)
        + '</div>';
    }

    function renderConversationRelatedSection(label, kind, items, detail) {
      if (!items.length) return '';
      return '<div class="catalog-detail">'
        + '<div class="muted">' + escapeHtml(label) + '</div>'
        + items.map((item) => renderConversationRelatedLink(kind, item, detail)).join('')
        + '</div>';
    }

    function renderConversationRelatedLink(kind, item, detail) {
      const path = buildRelatedCatalogItemPath(detail, kind, item);
      const title = formatCatalogItemLabel(item);
      const subtitle = formatRelatedItemSubtitle(item);
      if (!path) {
        return '<span class="pill">' + escapeHtml(title) + subtitle + '</span>';
      }
      return '<a class="pill" href="' + escapeHtml(path) + '" data-related-item-path="' + escapeHtml(path) + '" onclick="showMirrorCatalogDetailByPath(this.dataset.relatedItemPath, true); return false;">'
        + escapeHtml(title)
        + subtitle
        + '</a>';
    }

    function renderConversationSourceSection(items) {
      if (!items.length) return '';
      return '<div class="catalog-detail">'
        + '<div class="muted">Sources</div>'
        + items.map(renderConversationSourceLink).join('')
        + '</div>';
    }

    function renderConversationSourceLink(item) {
      const title = formatCatalogItemLabel(item);
      const url = readStringField(item, ['url', 'href', 'sourceUrl']);
      const subtitle = formatRelatedItemSubtitle(item);
      if (!url) return '<span class="pill">' + escapeHtml(title) + subtitle + '</span>';
      return '<a class="pill" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
        + escapeHtml(title)
        + subtitle
        + '</a>';
    }

    function buildRelatedCatalogItemPath(detail, kind, item) {
      const itemId = formatCatalogItemId(item);
      if (!itemId || itemId === 'unknown') return '';
      const params = new URLSearchParams({
        provider: detail.provider || currentMirrorCatalogProvider(),
        runtimeProfile: detail.runtimeProfileId || currentMirrorCatalogRuntimeProfile(),
        kind,
      });
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '?' + params.toString();
    }

    function currentMirrorCatalogProvider() {
      const select = $('mirrorCatalogProvider');
      return select && select.value ? select.value : 'chatgpt';
    }

    function currentMirrorCatalogRuntimeProfile() {
      const input = $('mirrorCatalogRuntimeProfile');
      return input && input.value ? input.value : 'default';
    }

    function formatRelatedItemSubtitle(item) {
      const type = readStringField(item, ['mimeType', 'type', 'source']);
      return type ? ' <span class="muted">(' + escapeHtml(type) + ')</span>' : '';
    }

    function renderConversationTranscriptActions(turns) {
      return '<div class="chat-transcript-actions">'
        + '<input id="mirrorConversationTranscriptSearch" type="search" placeholder="Search cached transcript" oninput="filterCurrentMirrorConversationTranscript()" />'
        + '<button type="button" onclick="downloadCurrentMirrorConversationTranscript()">Download Transcript.md</button>'
        + '<button type="button" onclick="clearCurrentMirrorConversationTranscriptSearch()">Clear</button>'
        + '<span id="mirrorConversationTranscriptSearchStatus" class="muted">' + escapeHtml(String(turns.length)) + ' cached turns</span>'
        + '</div>';
    }

    function renderGenericCatalogDetailView(detail) {
      return renderCatalogDetailHeader(detail, detail.item || {});
    }

    function renderCachedAssetDetailView(detail) {
      const item = detail.item || {};
      return renderCatalogDetailHeader(detail, item)
        + '<div class="notice">'
        + '<strong>Cached item inspector</strong>'
        + renderCatalogItemInspectorFields(detail, item)
        + renderCatalogItemExternalLinks(item)
        + renderCatalogItemPreview(detail, item)
        + '</div>';
    }

    function renderCatalogItemInspectorFields(detail, item) {
      const fields = [
        ['Kind', detail.kind || 'unknown'],
        ['Provider', readCatalogItemStringField(item, ['provider']) || detail.provider || 'unknown'],
        ['Source', readCatalogItemStringField(item, ['source', 'type']) || 'unknown'],
        ['MIME', readCatalogItemStringField(item, ['mimeType', 'mime', 'contentType']) || 'unknown'],
        ['Size', formatCatalogItemSize(readCatalogItemNumberField(item, ['size', 'sizeBytes', 'bytes', 'fileSize']))],
        ['Conversation', readCatalogItemStringField(item, ['conversationId']) || 'none'],
        ['Project', readCatalogItemStringField(item, ['projectId']) || 'none'],
        ['Created', readCatalogItemStringField(item, ['createdAt', 'created']) || 'unknown'],
        ['Updated', formatCatalogItemTimestamp(item)],
      ];
      return '<dl>' + fields.map(([key, value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd>'
      ).join('') + '</dl>';
    }

    function renderCatalogItemExternalLinks(item) {
      const links = [
        ['URL', readCatalogItemStringField(item, ['url', 'href', 'remoteUrl', 'uri'])],
        ['Download', readCatalogItemStringField(item, ['downloadUrl', 'downloadHref'])],
        ['Thumbnail', readCatalogItemStringField(item, ['thumbnailUrl', 'previewUrl'])],
      ].filter((entry, index, list) => entry[1] && list.findIndex((candidate) => candidate[1] === entry[1]) === index);
      if (!links.length) return '<div class="muted">No cached external URLs.</div>';
      return '<div class="catalog-detail">'
        + '<div class="muted">Cached URLs</div>'
        + links.map(([label, url]) => renderCatalogExternalLink(label, url)).join('')
        + '</div>';
    }

    function renderCatalogExternalLink(label, url) {
      return '<a class="pill" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
        + escapeHtml(label)
        + '</a>';
    }

    function renderCatalogItemPreview(detail, item) {
      const preview = resolveCatalogItemPreview(detail, item);
      if (!preview) {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<div class="muted">No browser-safe cached preview is available for this item.</div>'
          + '</div>';
      }
      if (preview.type === 'text') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<pre>' + escapeHtml(preview.text) + '</pre>'
          + '</div>';
      }
      if (preview.type === 'image') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<img src="' + escapeHtml(preview.url) + '" alt="' + escapeHtml(formatCatalogItemLabel(item)) + '" loading="lazy">'
          + '</div>';
      }
      if (preview.type === 'video') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<video src="' + escapeHtml(preview.url) + '" controls preload="metadata"></video>'
          + '</div>';
      }
      if (preview.type === 'audio') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<audio src="' + escapeHtml(preview.url) + '" controls preload="metadata"></audio>'
          + '</div>';
      }
      return '<div class="asset-preview">'
        + '<strong>Cached preview</strong>'
        + '<iframe src="' + escapeHtml(preview.url) + '" title="' + escapeHtml(formatCatalogItemLabel(item)) + '"></iframe>'
        + '</div>';
    }

    function resolveCatalogItemPreview(detail, item) {
      const text = readCatalogItemStringField(item, ['markdown', 'text', 'content', 'body']);
      if (text) return { type: 'text', text };
      const localAssetUrl = readCatalogItemStringField(item, ['localPath', 'path', 'filePath', 'absolutePath', 'assetStorageRelpath', 'storageRelpath'])
        ? buildCatalogItemAssetPath(detail)
        : null;
      const url = localAssetUrl || readCatalogPreviewUrl(item);
      if (!url) return null;
      const mime = (readCatalogItemStringField(item, ['mimeType', 'mime', 'contentType']) || '').toLowerCase();
      const kind = [
        detail.kind,
        readCatalogItemStringField(item, ['kind', 'mediaType', 'type']),
        readCatalogItemStringField(readObjectField(item, 'metadata') || {}, ['fileName', 'name', 'title']),
        url,
      ].join(' ').toLowerCase();
      if (mime.startsWith('image/') || /\bimage\b/.test(kind) || /[.](png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(url)) {
        return { type: 'image', url };
      }
      if (mime.startsWith('video/') || /\bvideo\b/.test(kind) || /[.](mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url)) {
        return { type: 'video', url };
      }
      if (mime.startsWith('audio/') || /\baudio\b|\bmusic\b/.test(kind) || /[.](mp3|m4a|wav|ogg)(?:[?#].*)?$/i.test(url)) {
        return { type: 'audio', url };
      }
      if (mime === 'application/pdf' || /[.]pdf(?:[?#].*)?$/i.test(url)) {
        return { type: 'pdf', url };
      }
      return null;
    }

    function buildCatalogItemAssetPath(detail) {
      const params = new URLSearchParams();
      if (detail.provider) params.set('provider', detail.provider);
      if (detail.runtimeProfileId) params.set('runtimeProfile', detail.runtimeProfileId);
      if (detail.kind) params.set('kind', detail.kind);
      const itemId = detail.itemId || formatCatalogItemId(detail.item || {});
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '/asset?' + params.toString();
    }

    function readCatalogPreviewUrl(item) {
      const candidates = [
        readCatalogItemStringField(item, ['previewUrl', 'thumbnailUrl']),
        readCatalogItemStringField(item, ['downloadUrl', 'downloadHref']),
        readCatalogItemStringField(item, ['remoteUrl', 'url', 'href', 'uri']),
      ].filter(Boolean);
      return candidates.find(isSafePreviewUrl) || null;
    }

    function isSafePreviewUrl(value) {
      if (!value) return false;
      const normalized = String(value).trim().toLowerCase();
      return normalized.startsWith('http://')
        || normalized.startsWith('https://')
        || normalized.startsWith('data:image/')
        || normalized.startsWith('data:video/')
        || normalized.startsWith('data:audio/')
        || normalized.startsWith('data:application/pdf;')
        || normalized.startsWith('data:application/pdf,');
    }

    function formatCatalogItemSize(value) {
      if (!value) return 'unknown';
      if (value < 1024) return String(value) + ' B';
      if (value < 1048576) return String(Math.round(value / 102.4) / 10) + ' KB';
      return String(Math.round(value / 104857.6) / 10) + ' MB';
    }

    function renderCatalogDetailHeader(detail, item) {
      const title = formatCatalogItemLabel(item);
      const fields = [
        ['Kind', detail.kind || 'unknown'],
        ['Provider', detail.provider || 'unknown'],
        ['Tenant Key', detail.tenantKey || 'unbound'],
        ['Binding Key', detail.bindingKey || 'not reported'],
        ['Profile', detail.runtimeProfileId || 'unknown'],
        ['Identity', detail.boundIdentityKey || 'unbound'],
        ['ID', detail.itemId || formatCatalogItemId(item)],
        ['Updated', formatCatalogItemTimestamp(item)],
        ['URL', readStringField(item, ['url', 'href']) || 'none'],
      ];
      return '<h2>' + escapeHtml(title) + '</h2><dl>' + fields.map(([key, value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd>'
      ).join('') + '</dl>';
    }

    function extractConversationTurns(item) {
      const direct = readTurnArray(item, ['messages', 'turns', 'conversation', 'transcript']);
      if (direct.length) return direct;
      if (item && typeof item === 'object' && item.mapping && typeof item.mapping === 'object') {
        return Object.values(item.mapping)
          .map((entry) => entry && typeof entry === 'object' ? entry.message : null)
          .filter(Boolean)
          .map(normalizeConversationTurn)
          .filter(Boolean);
      }
      return [];
    }

    function readTurnArray(item, fields) {
      if (!item || typeof item !== 'object') return [];
      for (const field of fields) {
        const value = item[field];
        if (Array.isArray(value)) {
          return value.map(normalizeConversationTurn).filter(Boolean);
        }
      }
      return [];
    }

    function readObjectArray(item, fields) {
      if (!item || typeof item !== 'object') return [];
      for (const field of fields) {
        const value = item[field];
        if (Array.isArray(value)) {
          return value.filter((entry) => entry && typeof entry === 'object');
        }
      }
      return [];
    }

    function readObjectField(item, field) {
      if (!item || typeof item !== 'object') return null;
      const value = item[field];
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function readCatalogItemStringField(item, fields) {
      return readStringField(item, fields)
        || readStringField(readObjectField(item, 'metadata') || {}, fields);
    }

    function readCatalogItemNumberField(item, fields) {
      return readNumberField(item, fields)
        || readNumberField(readObjectField(item, 'metadata') || {}, fields);
    }

    function normalizeConversationTurn(value) {
      if (!value || typeof value !== 'object') return null;
      const role = normalizeChatRole(readStringField(value, ['role', 'authorRole', 'speaker', 'from']) || readAuthorRole(value));
      const content = readConversationTurnContent(value);
      if (!content) return null;
      return { role, content };
    }

    function readAuthorRole(value) {
      const author = value && typeof value === 'object' ? value.author : null;
      return author && typeof author === 'object' ? readStringField(author, ['role', 'name']) : null;
    }

    function readConversationTurnContent(value) {
      const direct = readStringField(value, ['content', 'text', 'message', 'body', 'markdown']);
      if (direct) return direct;
      const content = value && typeof value === 'object' ? value.content : null;
      if (content && typeof content === 'object') {
        const parts = content.parts;
        if (Array.isArray(parts)) {
          return parts.map((part) => typeof part === 'string' ? part : stringifyCatalogItem(part)).join('\\n').trim();
        }
        return readStringField(content, ['text', 'content', 'markdown']);
      }
      const parts = value && typeof value === 'object' ? value.parts : null;
      if (Array.isArray(parts)) {
        return parts.map((part) => typeof part === 'string' ? part : stringifyCatalogItem(part)).join('\\n').trim();
      }
      return null;
    }

    function normalizeChatRole(role) {
      const normalized = String(role || 'assistant').toLowerCase();
      if (normalized.includes('user') || normalized.includes('human')) return 'user';
      if (normalized.includes('system')) return 'system';
      if (normalized.includes('tool')) return 'tool';
      return 'assistant';
    }

    function renderChatTurn(turn) {
      return '<div class="chat-turn chat-turn-' + escapeHtml(turn.role) + '">'
        + '<div class="chat-role">' + escapeHtml(turn.role) + '</div>'
        + '<div class="chat-bubble">' + escapeHtml(turn.content) + '</div>'
        + '</div>';
    }

    function filterCurrentMirrorConversationTranscript() {
      const input = $('mirrorConversationTranscriptSearch');
      const status = $('mirrorConversationTranscriptSearchStatus');
      if (!input || !status) return;
      const query = normalizeTranscriptSearchTerm(input.value);
      const turns = Array.from(document.querySelectorAll('#mirrorCatalogDetailView .chat-turn'));
      let visible = 0;
      for (const turn of turns) {
        const text = normalizeTranscriptSearchTerm(turn.textContent);
        const match = !query || text.includes(query);
        turn.style.display = match ? '' : 'none';
        if (match) visible += 1;
      }
      status.textContent = query
        ? String(visible) + ' of ' + String(turns.length) + ' cached turns'
        : String(turns.length) + ' cached turns';
    }

    function clearCurrentMirrorConversationTranscriptSearch() {
      const input = $('mirrorConversationTranscriptSearch');
      if (input) input.value = '';
      filterCurrentMirrorConversationTranscript();
    }

    function normalizeTranscriptSearchTerm(value) {
      return String(value || '').trim().toLowerCase();
    }

    function downloadCurrentMirrorConversationTranscript() {
      const detail = mirrorCatalogCurrentDetail;
      const item = detail && typeof detail === 'object' ? detail.item || {} : {};
      const turns = extractConversationTurns(item);
      if (!turns.length) return;
      const markdown = renderConversationTranscriptMarkdown(detail, item, turns);
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = formatTranscriptFilename(detail, item);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function renderConversationTranscriptMarkdown(detail, item, turns) {
      const title = formatCatalogItemLabel(item);
      const lines = [
        '# ' + title,
        '',
        '- Provider: ' + (detail.provider || 'unknown'),
        '- Profile: ' + (detail.runtimeProfileId || 'unknown'),
        '- Identity: ' + (detail.boundIdentityKey || 'unbound'),
        '- ID: ' + (detail.itemId || formatCatalogItemId(item)),
        '- URL: ' + (readStringField(item, ['url', 'href']) || 'none'),
        '',
      ];
      for (const turn of turns) {
        lines.push('## ' + turn.role);
        lines.push('');
        lines.push(turn.content);
        lines.push('');
      }
      return lines.join('\\n').trim() + '\\n';
    }

    function formatTranscriptFilename(detail, item) {
      const id = detail && detail.itemId ? detail.itemId : formatCatalogItemId(item);
      const title = formatCatalogItemLabel(item);
      const base = (title + '-' + id).toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96) || 'conversation-transcript';
      return base + '.md';
    }

    function formatCatalogItemLabel(item) {
      return readStringField(item, ['title', 'name', 'filename', 'fileName', 'conversationTitle', 'projectName'])
        || formatCatalogItemId(item)
        || 'untitled';
    }

    function formatCatalogItemId(item) {
      return readStringField(item, ['id', 'conversationId', 'projectId', 'artifactId', 'fileId', 'mediaId', 'url', 'href'])
        || 'unknown';
    }

    function formatCatalogItemTimestamp(item) {
      return readStringField(item, [
        'updatedAt',
        'createdAt',
        'lastUpdatedAt',
        'lastActivityAt',
        'collectedAt',
        'generatedAt',
        'timestamp',
      ]) || 'unknown';
    }

    function readStringField(value, fields) {
      if (!value || typeof value !== 'object') return null;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
      }
      return null;
    }

    function readNumberField(value, fields) {
      if (!value || typeof value !== 'object') return 0;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
        if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
      }
      return 0;
    }

    function readBooleanField(value, fields) {
      if (!value || typeof value !== 'object') return false;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'boolean') return candidate;
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toLowerCase() === 'true';
      }
      return false;
    }

    function stringifyCatalogItem(item) {
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    }

    function trimCatalogSnippet(value) {
      const text = String(value || '');
      return text.length > 220 ? text.slice(0, 217) + '...' : text;
    }

    async function controlMirrorCompletion(action) {
      const id = $('mirrorCompletionId').value.trim();
      if (!id) {
        $('mirrorCompletions').textContent = 'Enter a completion id.';
        setMirrorControlNotice('Enter a completion id before running a control action.', 'warn');
        return;
      }
      await controlMirrorCompletionById(id, action);
    }

    async function inspectSelectedMirrorCompletion() {
      const id = $('mirrorCompletionId').value.trim();
      if (!id) {
        $('mirrorCompletions').textContent = 'Enter a completion id.';
        setMirrorControlNotice('Enter a completion id before inspecting details.', 'warn');
        return;
      }
      await inspectMirrorCompletion(id);
    }

    async function controlMirrorCompletionById(id, action) {
      if (action === 'cancel' && !confirmMirrorCompletionCancel(id)) {
        setMirrorControlNotice('Cancel was not sent for ' + id + '.', 'warn');
        setMirrorControlResultToast({
          title: 'Cancel not sent',
          action,
          id,
          status: 'paused',
          target: id,
          tone: 'warn',
        });
        return;
      }
      setMirrorControlNotice('Sending ' + action + ' for ' + id + '...', 'warn');
      for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
        $(buttonId).disabled = true;
      }
      for (const button of document.querySelectorAll('[data-completion-action]')) {
        button.disabled = true;
      }
      try {
        const result = await fetch('/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountMirrorCompletion: { id, action } }),
        });
        const payload = await result.json();
        if (!result.ok) {
          throw new Error(asJson({ status: result.status, payload }));
        }
        const controlled = payload.controlResult || payload;
        $('mirrorCompletions').textContent = asJson({ controlled });
        setMirrorControlResultToast({
          title: 'Completion control succeeded',
          action,
          id,
          status: controlled.status || 'ok',
          operation: controlled,
          tone: 'ok',
        });
        setMirrorControlNotice('Completed ' + action + ' for ' + id + ': ' + (controlled.status || 'ok') + '.', 'ok');
        await refreshStatus();
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCompletions').textContent = message;
        setMirrorControlResultToast({
          title: 'Completion control failed',
          action,
          id,
          status: 'failed',
          target: id,
          tone: 'bad',
        });
        setMirrorControlNotice('Failed ' + action + ' for ' + id + ': ' + message, 'bad');
      } finally {
        for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
          $(buttonId).disabled = false;
        }
        for (const button of document.querySelectorAll('[data-completion-action]')) {
          button.disabled = false;
        }
      }
    }

    function confirmMirrorCompletionCancel(id) {
      return window.confirm('Cancel live-follow completion ' + id + '? This stops the current completion record; start a new live-follow operation if you need it again.');
    }

    async function startMirrorCompletionForTarget(provider, runtimeProfile) {
      if (!provider || !runtimeProfile) return;
      setMirrorControlNotice('Starting live follow for ' + provider + '/' + runtimeProfile + '...', 'warn');
      try {
        const result = await postJson('/v1/account-mirrors/completions', {
          provider,
          runtimeProfile,
        });
        $('mirrorCompletionId').value = result.id || '';
        $('mirrorCompletions').textContent = asJson({ startedCompletion: result });
        setMirrorControlResultToast({
          title: 'Live follow started',
          action: 'start',
          id: result.id || 'unknown',
          status: result.status || 'queued',
          target: provider + '/' + runtimeProfile,
          nextAttemptAt: result.nextAttemptAt || 'none',
          operation: result,
          tone: 'ok',
        });
        setMirrorControlNotice('Started live follow for ' + provider + '/' + runtimeProfile + '.', 'ok');
        await refreshStatus();
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCompletions').textContent = message;
        setMirrorControlResultToast({
          title: 'Live follow start failed',
          action: 'start',
          id: 'none',
          status: 'failed',
          target: provider + '/' + runtimeProfile,
          tone: 'bad',
        });
        setMirrorControlNotice('Failed to start live follow for ' + provider + '/' + runtimeProfile + ': ' + message, 'bad');
      }
    }

    async function inspectMirrorCompletion(id) {
      if (!id) return;
      setMirrorControlNotice('Inspecting ' + id + '...', 'warn');
      $('mirrorCompletions').textContent = 'Inspecting ' + id + '...';
      setMirrorSchedulerCompletionDetail('Inspecting ' + id + '...');
      try {
        const detail = await fetchJson('/v1/account-mirrors/completions/' + encodeURIComponent(id));
        $('mirrorCompletions').textContent = asJson({ selectedCompletion: detail });
        setMirrorSchedulerCompletionDetail(asJson({
          id: detail.id || id,
          provider: detail.provider || null,
          runtimeProfileId: detail.runtimeProfileId || null,
          status: detail.status || null,
          phase: detail.phase || null,
          nextAttemptAt: detail.nextAttemptAt || null,
          passCount: detail.passCount ?? null,
          error: detail.error || null,
        }));
        setMirrorControlResultToast({
          title: 'Completion detail loaded',
          action: 'inspect',
          id,
          status: detail.status || 'unknown',
          operation: detail,
          tone: 'ok',
        });
        setMirrorControlNotice('Loaded details for ' + id + '.', 'ok');
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCompletions').textContent = message;
        setMirrorSchedulerCompletionDetail(message);
        setMirrorControlResultToast({
          title: 'Completion inspect failed',
          action: 'inspect',
          id,
          status: 'failed',
          target: id,
          tone: 'bad',
        });
        setMirrorControlNotice('Failed to inspect ' + id + ': ' + message, 'bad');
      }
    }

    async function openMirrorSchedulerDiagnostics(button) {
      const data = button && button.dataset ? button.dataset : {};
      const provider = data.provider || null;
      const runtimeProfileId = data.runtimeProfileId || null;
      try {
        const text = await loadMirrorSchedulerDiagnosticsText(data);
        setMirrorSchedulerCompletionDetail(text);
        setMirrorControlNotice('Loaded scheduler diagnostics for ' + [provider, runtimeProfileId].filter(Boolean).join('/') + '.', 'ok');
      } catch (error) {
        setMirrorControlNotice('Could not load scheduler diagnostics: ' + String(error.message || error), 'bad');
      }
    }

    function setMirrorSchedulerCompletionDetail(value) {
      const panel = document.getElementById('mirrorSchedulerCompletionDetail');
      if (panel) panel.textContent = value;
    }

    async function copyMirrorSchedulerDiagnostics(button) {
      const data = button && button.dataset ? button.dataset : {};
      const completionId = data.completionId || '';
      const provider = data.provider || null;
      const runtimeProfileId = data.runtimeProfileId || null;
      setMirrorControlNotice('Preparing scheduler diagnostics...', 'warn');
      try {
        const text = await loadMirrorSchedulerDiagnosticsText(data);
        setMirrorSchedulerCompletionDetail(text);
        await navigator.clipboard.writeText(text);
        setMirrorControlNotice('Copied scheduler diagnostics for ' + [provider, runtimeProfileId].filter(Boolean).join('/') + '.', 'ok');
      } catch (error) {
        setMirrorControlNotice('Could not copy scheduler diagnostics: ' + String(error.message || error), 'bad');
      }
    }

    async function copyMirrorSchedulerDiagnosticsCommand(button) {
      const data = button && button.dataset ? button.dataset : {};
      const command = data.command || '';
      if (!command) {
        setMirrorControlNotice('No scheduler diagnostics command is available to copy.', 'warn');
        return;
      }
      setMirrorSchedulerCompletionDetail(command);
      try {
        await navigator.clipboard.writeText(command);
        setMirrorControlNotice('Copied scheduler diagnostics command.', 'ok');
      } catch (error) {
        setMirrorControlNotice('Could not copy scheduler diagnostics command: ' + String(error.message || error), 'bad');
      }
    }

    async function loadMirrorSchedulerDiagnosticsText(data) {
      const completionId = data.completionId || '';
      const provider = data.provider || null;
      const runtimeProfileId = data.runtimeProfileId || null;
      const params = new URLSearchParams();
      if (provider) params.set('provider', provider);
      if (runtimeProfileId) params.set('runtimeProfile', runtimeProfileId);
      if (completionId) params.set('completionId', completionId);
      const bundle = await fetchJson('/v1/account-mirrors/scheduler/diagnostics?' + params.toString());
      return asJson({ mirrorSchedulerDiagnosticsBundle: bundle });
    }

    async function refreshStatus() {
      $('preflightHeaderSummary').innerHTML = '<div class="health-strip-title"><strong>Preflight</strong><span class="muted">Loading...</span></div>';
      $('serverSummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
      $('serviceDiscoverySummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
      $('configRoutingSummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
      $('configRoutingRaw').textContent = 'Loading...';
      $('configIdentitySummary').textContent = 'Loading...';
      $('configLiveFollowSummary').textContent = 'Loading...';
	  $('tabConcurrencySummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
	  $('tabConcurrencyRaw').textContent = 'Loading...';
      $('opsControls').textContent = 'Loading controls...';
      $('mirrorStatus').textContent = 'Loading...';
      $('mirrorAttentionQueue').textContent = 'Loading attention queue...';
      $('mirrorTargetTable').textContent = 'Loading target accounts...';
      $('mirrorActiveCompletionTable').textContent = 'Loading active operations...';
      $('mirrorTargets').textContent = 'Loading...';
      $('mirrorCompletions').textContent = 'Loading...';
      try {
        const status = await fetchJson('/status');
        $('preflightHeaderSummary').innerHTML = renderPreflightHeaderSummary(status.preflight || null);
        renderOpsControls(status);
        renderServerSummary(status);
        renderServiceDiscovery(status);
        renderConfigRouting(status);
        renderConfigIdentityProjection(status);
        renderConfigLiveFollowProjection(status);
		renderTabConcurrency(status);
        renderMirrorCompletions(status);
        renderRecentServiceEvents(status);
      } catch (error) {
        $('preflightHeaderSummary').innerHTML = '<div class="health-strip-title"><strong>Preflight</strong><span class="bad">' + escapeHtml(String(error.message || error)) + '</span></div>';
        $('serverSummary').innerHTML = '<dt>Status</dt><dd class="bad">' + String(error.message || error) + '</dd>';
        $('serviceDiscoverySummary').innerHTML = '<dt>Status</dt><dd class="bad">' + String(error.message || error) + '</dd>';
        $('configRoutingSummary').innerHTML = '<dt>Status</dt><dd class="bad">' + String(error.message || error) + '</dd>';
        $('configRoutingRaw').textContent = String(error.message || error);
        $('configIdentitySummary').textContent = String(error.message || error);
        $('configLiveFollowSummary').textContent = String(error.message || error);
		$('tabConcurrencySummary').innerHTML = '<dt>Status</dt><dd class="bad">' + escapeHtml(String(error.message || error)) + '</dd>';
		$('tabConcurrencyRaw').textContent = String(error.message || error);
        $('opsControls').textContent = String(error.message || error);
        $('mirrorTargetTable').textContent = String(error.message || error);
        $('mirrorActiveCompletionTable').textContent = String(error.message || error);
        $('mirrorTargets').textContent = String(error.message || error);
        $('mirrorCompletions').textContent = String(error.message || error);
        $('recentServiceEvents').textContent = String(error.message || error);
      }
      try {
        $('mirrorStatus').textContent = asJson(await fetchJson('/v1/account-mirrors/status'));
      } catch (error) {
        $('mirrorStatus').textContent = String(error.message || error);
      }
      await loadMirrorCatalog();
    }

    async function loadApiLogTail() {
      const button = $('loadApiLogTail');
      const inlineButton = document.getElementById('loadApiLogTailInline');
      button.disabled = true;
      if (inlineButton) inlineButton.disabled = true;
      $('apiLogTail').textContent = 'Loading API log tail...';
      try {
        const payload = await fetchJson('/v1/api/logs/tail?maxBytes=32768');
        $('apiLogTail').textContent = asJson({
          logPath: payload.logPath,
          exists: payload.exists,
          sizeBytes: payload.sizeBytes,
          truncated: payload.truncated,
          content: payload.content || '',
        });
      } catch (error) {
        $('apiLogTail').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
        if (inlineButton) inlineButton.disabled = false;
      }
    }

    async function loadPreflightRunLog(id) {
      if (!id) return;
      const target = document.getElementById('preflightRunLog') || $('apiLogTail');
      target.textContent = 'Loading preflight run log...';
      try {
        const payload = await fetchJson('/v1/preflight/lazy-live-follow/runs/' + encodeURIComponent(id) + '/log?maxBytes=32768');
        target.textContent = asJson({
          id: payload.id,
          logPath: payload.logPath,
          exists: payload.exists,
          sizeBytes: payload.sizeBytes,
          truncated: payload.truncated,
          content: payload.content || '',
        });
      } catch (error) {
        target.textContent = String(error.message || error);
      }
    }

    async function loadPreflightRunDetail(id) {
      if (!id) return;
      const target = document.getElementById('preflightRunDetail') || document.getElementById('preflightRunLog') || $('apiLogTail');
      target.textContent = 'Loading preflight run detail...';
      try {
        const payload = await fetchJson('/v1/preflight/lazy-live-follow/runs/' + encodeURIComponent(id));
        target.textContent = asJson({
          id: payload.id,
          status: payload.status,
          startedAt: payload.startedAt,
          completedAt: payload.completedAt,
          durationMs: payload.durationMs,
          exitCode: payload.exitCode,
          signal: payload.signal,
          errorMessage: payload.errorMessage,
          logPath: payload.logPath,
          steps: Array.isArray(payload.steps) ? payload.steps : [],
        });
      } catch (error) {
        target.textContent = String(error.message || error);
      }
    }

    function renderRecentServiceEvents(status) {
      const events = collectRecentServiceEvents(status);
      recentServiceEventDetails = events;
      restoreRecentServiceEventFilter();
      if (!events.length) {
        $('recentServiceEvents').innerHTML = '<p class="muted">No recent service events recorded.</p>';
        $('recentServiceEventVisibleCount').textContent = '0 shown';
        return;
      }
      $('recentServiceEvents').innerHTML = '<table id="recentServiceEventsTable"><thead><tr><th>When</th><th>Source</th><th>Event</th><th>Detail</th><th>Action</th></tr></thead><tbody>'
        + events.slice(0, 10).map((event, index) => renderRecentServiceEventRow(event, index)).join('')
        + '</tbody></table>';
      filterRecentServiceEvents();
      restoreRecentServiceEventSelection();
    }

    function collectRecentServiceEvents(status) {
      const events = [];
      const api = status.api || {};
      const process = api.process || {};
      const managedService = api.managedService || {};
      if (process.pid || managedService.logPath) {
        events.push({
          at: process.startedAt || status.generatedAt || '',
          source: 'api',
          event: process.pid ? 'service running' : 'service status unknown',
          detail: managedService.logPath || 'API log path unavailable',
          action: 'api-log',
        });
      }
      const preflightHistory = status.preflight && Array.isArray(status.preflight.lazyLiveFollowRunHistory)
        ? status.preflight.lazyLiveFollowRunHistory
        : [];
      for (const run of preflightHistory.slice(0, 5)) {
        events.push({
          at: run.completedAt || run.startedAt || '',
          source: 'preflight',
          event: run.status || 'unknown',
          detail: run.id || run.logPath || 'preflight run',
          action: 'preflight-log',
          runId: run.id || '',
        });
      }
      const schedulerEntries = status.accountMirrorScheduler
        && status.accountMirrorScheduler.history
        && Array.isArray(status.accountMirrorScheduler.history.entries)
        ? status.accountMirrorScheduler.history.entries
        : [];
      for (const entry of schedulerEntries.slice(0, 5)) {
        events.push({
          at: entry.completedAt || entry.startedAt || '',
          source: 'scheduler',
          event: entry.action || entry.mode || 'pass',
          detail: formatSchedulerEventDetail(entry),
          action: 'scheduler-detail',
          schedulerDetail: compactSchedulerEventDetail(entry),
        });
      }
      return events
        .sort((left, right) => Date.parse(right.at || '') - Date.parse(left.at || ''))
        .map((event) => ({
          ...event,
          key: makeRecentServiceEventKey(event),
        }));
    }

    function renderRecentServiceEventRow(event, index) {
      const action = event.action === 'api-log'
        ? '<button type="button" class="link-button" onclick="loadApiLogTail()">Open API Log</button>'
        : event.action === 'preflight-log'
          ? '<button type="button" class="link-button" data-preflight-run-id="' + escapeHtml(event.runId || '') + '" onclick="loadPreflightRunLog(this.dataset.preflightRunId)">Open Preflight Log</button>'
          : event.action === 'scheduler-detail'
            ? '<button type="button" class="link-button" data-service-event-index="' + escapeHtml(String(index)) + '" onclick="showRecentServiceEventDetail(this.dataset.serviceEventIndex)">Inspect Scheduler</button>'
            : '<span class="muted">status only</span>';
      return '<tr data-recent-service-event-source="' + escapeHtml(event.source || 'unknown') + '" data-service-event-index="' + escapeHtml(String(index)) + '" data-service-event-key="' + escapeHtml(event.key || '') + '">'
        + '<td><code>' + escapeHtml(event.at || 'unknown') + '</code></td>'
        + '<td>' + escapeHtml(event.source || 'unknown') + '</td>'
        + '<td>' + escapeHtml(event.event || 'unknown') + '</td>'
        + '<td>' + escapeHtml(event.detail || '') + '</td>'
        + '<td>' + action + '</td>'
        + '</tr>';
    }

    function formatSchedulerEventDetail(entry) {
      const target = entry.selectedTarget || {};
      const provider = target.provider || 'no-provider';
      const runtime = target.runtimeProfileId || 'no-runtime';
      const backpressure = entry.backpressure && entry.backpressure.reason ? entry.backpressure.reason : 'none';
      const error = entry.error && entry.error.message ? ' error=' + entry.error.message : '';
      return provider + '/' + runtime + ' backpressure=' + backpressure + error;
    }

    function makeRecentServiceEventKey(event) {
      return [
        event.source || 'unknown',
        event.at || 'unknown',
        event.event || 'unknown',
        event.detail || '',
      ].join('|');
    }

    function compactSchedulerEventDetail(entry) {
      const target = entry.selectedTarget || {};
      return {
        action: entry.action || null,
        mode: entry.mode || null,
        startedAt: entry.startedAt || null,
        completedAt: entry.completedAt || null,
        target: {
          provider: target.provider || null,
          runtimeProfileId: target.runtimeProfileId || null,
          browserProfileId: target.browserProfileId || null,
          status: target.status || null,
          reason: target.reason || null,
          eligibleAt: target.eligibleAt || null,
        },
        backpressure: entry.backpressure || null,
        metrics: entry.metrics || null,
        refresh: entry.refresh ? {
          status: entry.refresh.status || null,
          provider: entry.refresh.provider || null,
          runtimeProfileId: entry.refresh.runtimeProfileId || null,
          error: entry.refresh.error || null,
        } : null,
        error: entry.error || null,
      };
    }

    function filterRecentServiceEvents() {
      const filter = $('recentServiceEventFilter') ? $('recentServiceEventFilter').value : 'all';
      persistRecentServiceEventFilter(filter);
      const rows = Array.from(document.querySelectorAll('#recentServiceEventsTable tbody tr'));
      let visible = 0;
      for (const row of rows) {
        const source = row.dataset.recentServiceEventSource || '';
        const shouldShow = filter === 'all' || source === filter;
        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visible += 1;
      }
      if ($('recentServiceEventVisibleCount')) {
        $('recentServiceEventVisibleCount').textContent = String(visible) + ' shown';
      }
    }

    function showRecentServiceEventDetail(index, options) {
      const parsed = Number(index);
      const event = Number.isFinite(parsed) ? recentServiceEventDetails[parsed] : null;
      if (!event || !event.schedulerDetail) {
        $('recentServiceEventDetail').textContent = 'No scheduler detail is available for this event.';
        return;
      }
      $('recentServiceEventDetail').textContent = asJson(event.schedulerDetail);
      markRecentServiceEventSelection(event.key || '');
      if (!options || options.persist !== false) {
        persistRecentServiceEventSelection(event.key || '');
      }
    }

    function restoreRecentServiceEventFilter() {
      const select = $('recentServiceEventFilter');
      if (!select) return;
      try {
        const saved = localStorage.getItem(RECENT_SERVICE_EVENT_FILTER_STORAGE_KEY);
        if (saved && Array.from(select.options).some((option) => option.value === saved)) {
          select.value = saved;
        }
      } catch (_error) {
        // localStorage can be unavailable in hardened browser contexts.
      }
    }

    function persistRecentServiceEventFilter(filter) {
      try {
        localStorage.setItem(RECENT_SERVICE_EVENT_FILTER_STORAGE_KEY, filter || 'all');
      } catch (_error) {
        // localStorage can be unavailable in hardened browser contexts.
      }
    }

    function restoreRecentServiceEventSelection() {
      try {
        const selectedKey = localStorage.getItem(RECENT_SERVICE_EVENT_SELECTED_STORAGE_KEY);
        if (!selectedKey) return;
        const index = recentServiceEventDetails.findIndex((event) => event.key === selectedKey && event.schedulerDetail);
        if (index >= 0) {
          showRecentServiceEventDetail(String(index), { persist: false });
        }
      } catch (_error) {
        // localStorage can be unavailable in hardened browser contexts.
      }
    }

    function persistRecentServiceEventSelection(key) {
      try {
        if (key) localStorage.setItem(RECENT_SERVICE_EVENT_SELECTED_STORAGE_KEY, key);
      } catch (_error) {
        // localStorage can be unavailable in hardened browser contexts.
      }
    }

    function markRecentServiceEventSelection(key) {
      for (const row of Array.from(document.querySelectorAll('#recentServiceEventsTable tbody tr'))) {
        row.classList.toggle('service-event-row-selected', Boolean(key) && row.dataset.serviceEventKey === key);
      }
    }

    async function postStatusControl(payload) {
      const response = await fetch('/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload: result }));
      }
      return result.controlResult || result;
    }

    async function controlBackgroundDrain(action) {
      await controlService('background drain', () => postStatusControl({ backgroundDrain: { action } }));
    }

    async function controlMirrorScheduler(action, dryRun) {
      const body = { accountMirrorScheduler: { action } };
      if ((action === 'run-once' || action === 'run-once-with-foreground-pressure') && typeof dryRun === 'boolean') {
        body.accountMirrorScheduler.dryRun = dryRun;
      }
      await controlService('mirror scheduler', () => postStatusControl(body));
    }

    async function clearMirrorProviderGuard(button) {
      const provider = button && button.dataset ? button.dataset.provider : '';
      const runtimeProfile = button && button.dataset ? button.dataset.runtimeProfileId : '';
      await controlService('mirror provider guard', () => postStatusControl({
        accountMirrorProviderGuard: {
          action: 'clear',
          provider,
          runtimeProfile,
        },
      }));
    }

    async function runLazyLiveFollowPreflight() {
      await controlService('lazy-live-follow preflight', () => postStatusControl({ preflight: { action: 'run', name: 'lazy-live-follow' } }));
    }

    async function controlService(label, task) {
      setOpsControlNotice('Sending control action for ' + label + '...', 'warn');
      setOpsButtonsDisabled(true);
      let refreshed = false;
      try {
        const result = await task();
        setOpsControlNotice('Completed ' + label + ' control: ' + (result.action || result.status || 'ok') + '.', 'ok');
        await refreshStatus();
        refreshed = true;
      } catch (error) {
        setOpsControlNotice('Failed ' + label + ' control: ' + String(error.message || error), 'bad');
      } finally {
        if (!refreshed) {
          setOpsButtonsDisabled(false);
        }
      }
    }

    function setOpsButtonsDisabled(disabled) {
      for (const button of document.querySelectorAll('#opsControls button')) {
        button.disabled = disabled;
      }
    }

    async function probeWorkbench() {
      const button = $('probeWorkbench');
      button.disabled = true;
      $('workbenchOutput').textContent = 'Probing...';
      try {
        const params = new URLSearchParams({
          provider: $('provider').value,
          diagnostics: 'browser-state',
          includeUnavailable: 'true',
        });
        if ($('category').value) params.set('category', $('category').value);
        if ($('runtimeProfile').value.trim()) params.set('runtimeProfile', $('runtimeProfile').value.trim());
        $('workbenchOutput').textContent = asJson(await fetchJson('/v1/workbench-capabilities?' + params.toString()));
      } catch (error) {
        $('workbenchOutput').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
      }
    }

    async function probeRun() {
      const id = $('runId').value.trim();
      if (!id) {
        $('runOutput').textContent = 'Enter a run id.';
        return;
      }
      const button = $('probeRun');
      button.disabled = true;
      $('runOutput').textContent = 'Inspecting...';
      try {
        $('runOutput').textContent = asJson(await fetchJson('/v1/runs/' + encodeURIComponent(id) + '/status?diagnostics=browser-state'));
      } catch (error) {
        $('runOutput').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
      }
    }

    async function loadBrowserProcesses() {
      const button = $('loadBrowserProcesses');
      button.disabled = true;
      $('browserProcessSummary').textContent = 'Reading browser process and DevTools target state...';
      try {
        const payload = await fetchJson('/v1/browser/processes');
        renderBrowserProcesses(payload);
      } catch (error) {
        $('browserProcessSummary').textContent = 'Browser process probe failed.';
        $('browserProcessRaw').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
      }
    }

    function renderBrowserProcesses(payload) {
      const metrics = payload.metrics || {};
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      $('browserProcessSummary').innerHTML = [
        'configured=' + escapeHtml(String(metrics.configuredTargets ?? entries.length)),
        'alive=' + escapeHtml(String(metrics.processesAlive ?? 0)),
        'responsive=' + escapeHtml(String(metrics.responsiveDevTools ?? 0)),
        'launchArgAboutBlank=' + escapeHtml(String(metrics.launchBlankArg ?? 0)),
        'openBlankPages=' + escapeHtml(String(metrics.openBlankPages ?? 0)),
      ].join(' ');
      if (!entries.length) {
	        $('browserProcessRows').innerHTML = '<tr><td colspan="9" class="muted">No configured browser process targets.</td></tr>';
        $('browserProcessRaw').textContent = asJson(payload);
        return;
      }
      $('browserProcessRows').innerHTML = entries.map(renderBrowserProcessRow).join('');
      $('browserProcessRaw').textContent = asJson(payload);
    }

    function renderBrowserProcessRow(entry) {
      const devTools = entry.devToolsResponsive
        ? '<span class="ok">' + escapeHtml((entry.host || '127.0.0.1') + ':' + String(entry.port || 'unknown')) + '</span>'
        : '<span class="warn">' + escapeHtml(entry.processAlive ? 'not responsive' : 'not running') + '</span>';
      const blankArgClass = entry.launchCommandHasBlankArg ? 'warn' : 'ok';
      const openBlankClass = entry.openBlankPageCount > 0 ? 'bad' : 'ok';
      return '<tr>'
	        + '<td>' + escapeHtml(entry.provider || 'unknown') + '</td>'
	        + '<td>' + escapeHtml(entry.runtimeProfileId || 'default') + '</td>'
	        + '<td>' + escapeHtml(entry.pid == null ? 'none' : String(entry.pid)) + '</td>'
	        + '<td class="wrap">' + renderBrowserProcessOwner(entry) + '</td>'
	        + '<td>' + devTools + '</td>'
        + '<td class="' + blankArgClass + '">' + escapeHtml(entry.launchCommandHasBlankArg ? 'yes' : 'no') + '</td>'
        + '<td class="' + openBlankClass + '">' + escapeHtml(String(entry.openBlankPageCount || 0)) + '</td>'
        + '<td>' + escapeHtml(String(entry.pageTargetCount || 0)) + '</td>'
        + '<td class="wrap">' + renderBrowserProcessTargets(entry.targets || [], entry.error) + '</td>'
        + '</tr>';
	    }

	    function renderBrowserProcessOwner(entry) {
	      const owner = entry.operation || entry.owner;
	      if (!owner) return '<span class="muted">unknown</span>';
	      const id = owner.id ? String(owner.id) : 'unknown';
	      const source = owner.sourceType ? ' ' + String(owner.sourceType) : '';
	      const reason = owner.reason ? ' ' + String(owner.reason) : '';
	      return escapeHtml(String(owner.kind || 'operation') + ':' + id + source + reason);
	    }

	    function renderBrowserProcessTargets(targets, error) {
      if (error) return '<span class="bad">' + escapeHtml(error) + '</span>';
      const pageTargets = targets.filter((target) => target.type === 'page');
      if (!pageTargets.length) return '<span class="muted">No page targets.</span>';
      return pageTargets.slice(0, 5).map((target) => {
        const tone = target.isBlankPage ? 'bad' : 'ok';
        const label = target.title || target.url || target.targetId || 'untitled';
        const suffix = target.isBlankPage ? ' blank page' : '';
        return '<span class="' + tone + '">' + escapeHtml(label + suffix) + '</span>';
      }).join('<br>');
    }

    $('refreshStatus').addEventListener('click', refreshStatus);
    $('loadApiLogTail').addEventListener('click', loadApiLogTail);
    $('inspectMirrorCompletionById').addEventListener('click', inspectSelectedMirrorCompletion);
    $('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'));
    $('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'));
    $('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'));
    $('mirrorTargetCompletenessFilter').addEventListener('change', applyMirrorTargetCompletenessFilter);
    $('loadMirrorCatalog').addEventListener('click', loadMirrorCatalog);
    $('showVisibleMirrorCatalogPreviewUrls').addEventListener('click', showVisibleMirrorCatalogPreviewUrls);
    $('hideVisibleMirrorCatalogPreviewUrls').addEventListener('click', hideVisibleMirrorCatalogPreviewUrls);
    $('reviewVisibleMirrorCatalogPreviews').addEventListener('click', reviewVisibleMirrorCatalogPreviews);
    $('openVisibleMirrorCatalogPreviewUrls').addEventListener('click', openVisibleMirrorCatalogPreviewUrls);
    $('copyVisibleMirrorCatalogDetailLinks').addEventListener('click', copyVisibleMirrorCatalogDetailLinks);
    $('copyVisibleMirrorCatalogPreviewUrls').addEventListener('click', copyVisibleMirrorCatalogPreviewUrls);
    $('downloadVisibleMirrorCatalogPreviewUrls').addEventListener('click', downloadVisibleMirrorCatalogPreviewUrls);
    $('selectAllMirrorPreviewSessionItems').addEventListener('click', () => setMirrorPreviewSessionSelection(true));
    $('clearMirrorPreviewSessionSelection').addEventListener('click', () => setMirrorPreviewSessionSelection(false));
    $('copyMirrorPreviewSessionUrls').addEventListener('click', copyMirrorPreviewSessionUrls);
    $('downloadMirrorPreviewSessionUrls').addEventListener('click', downloadMirrorPreviewSessionUrls);
    $('downloadMirrorPreviewSessionManifest').addEventListener('click', downloadMirrorPreviewSessionManifest);
    $('saveMirrorPreviewSession').addEventListener('click', saveMirrorPreviewSession);
    $('refreshMirrorPreviewSessionList').addEventListener('click', () => refreshSavedMirrorPreviewSessions());
    $('loadSavedMirrorPreviewSession').addEventListener('click', loadSelectedSavedMirrorPreviewSession);
    $('renameSavedMirrorPreviewSession').addEventListener('click', renameSelectedSavedMirrorPreviewSession);
    $('deleteSavedMirrorPreviewSession').addEventListener('click', deleteSelectedSavedMirrorPreviewSession);
    $('refreshSavedMirrorPreviewSessionTable').addEventListener('click', () => refreshSavedMirrorPreviewSessions($('savedMirrorPreviewSessions').value));
    $('savedMirrorPreviewSessionSearch').addEventListener('input', renderSavedMirrorPreviewSessionTable);
    $('savedMirrorPreviewSessionTable').addEventListener('click', handleSavedMirrorPreviewSessionTableClick);
    $('inspectTeamRun').addEventListener('click', inspectAgentsTeamRun);
    $('inspectRuntimeRun').addEventListener('click', inspectAgentsRuntimeRun);
    $('loadAgentsDiagnostics').addEventListener('click', loadAgentsDiagnostics);
    $('loadAgentChoices').addEventListener('click', loadAgentChoices);
    $('loadAgentConfigs').addEventListener('click', loadAgentConfigs);
    $('saveAgentConfig').addEventListener('click', saveAgentConfig);
    $('duplicateAgentConfig').addEventListener('click', duplicateAgentConfig);
    $('archiveAgentConfig').addEventListener('click', archiveAgentConfig);
    $('issueAgentApiKey').addEventListener('click', issueAgentApiKey);
    $('downloadAgentSnapshot').addEventListener('click', downloadAgentSnapshot);
    $('dryRunAgentSnapshotImport').addEventListener('click', dryRunAgentSnapshotImport);
    $('applyAgentSnapshotImport').addEventListener('click', applyAgentSnapshotImport);
    $('loadAgentsRecentRuns').addEventListener('click', loadAgentsRecentRuns);
    $('copyVisibleAgentsRecentMirrorLinks').addEventListener('click', copyVisibleAgentsRecentMirrorLinks);
    $('agentsRecentMirrorCacheFilter').addEventListener('change', applyAgentsRecentMirrorCacheControls);
    $('agentsRecentMirrorCacheSort').addEventListener('change', applyAgentsRecentMirrorCacheControls);
    $('loadMirrorPreviewSessionManifest').addEventListener('change', loadMirrorPreviewSessionManifestFile);
    $('mirrorPreviewSessionGrid').addEventListener('change', updateMirrorPreviewSessionSelection);
    $('mirrorCatalogSearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadMirrorCatalog();
    });
    document.addEventListener('keydown', handleMirrorCatalogKeyboard);
    $('loadBrowserProcesses').addEventListener('click', loadBrowserProcesses);
    $('probeWorkbench').addEventListener('click', probeWorkbench);
    $('probeRun').addEventListener('click', probeRun);
    initializeMirrorCatalogFiltersFromUrl();
    void initializeMirrorPreviewSession();
    if (isAgentsTeamsRoute()) {
      void loadAgentsDiagnostics();
      void loadAgentChoices();
      void loadAgentConfigs();
    }
    refreshStatus();
  </script>
</body>
</html>`;
}
