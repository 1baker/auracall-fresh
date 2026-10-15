import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
	type BrowserInteractionClass,
	type BrowserInteractionGovernor,
	createBrowserInteractionGovernor,
} from "../../packages/browser-service/src/service/interactionGovernor.js";
import {
	isKnownBackendRequestBudgetDenial,
	type ProviderTrafficGovernor,
	withProviderTrafficContext,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import { readChatgptRateLimitGuardState } from "../browser/chatgptRateLimitGuard.js";
import { BrowserAutomationClient } from "../browser/client.js";
import { recordDomDriftObservation } from "../browser/domDriftObservations.js";
import type { AccountMirrorMediaManifestEntry } from "../browser/llmService/cache/store.js";
import type {
	Conversation,
	ConversationArtifact,
	ConversationContext,
	FileRef,
	Project,
} from "../browser/providers/domain.js";
import {
	type ProviderSessionProof,
	summarizeProviderSessionProof,
} from "../browser/providers/providerSessionAuthority.js";
import {
	type BrowserScrapeTelemetrySnapshot,
	createBrowserScrapeTelemetryRecorder,
	snapshotBrowserScrapeTelemetry,
} from "../browser/providers/scrapeTelemetry.js";
import type {
	BrowserProviderListOptions,
	ProviderUserIdentity,
} from "../browser/providers/types.js";
import { resolveRuntimeProfileUserConfig as resolveBrowserRuntimeProfileUserConfig } from "../browser/service/profileConfig.js";
import { getCurrentRuntimeProfiles, getRuntimeProfileBrowserProfileId } from "../config/model.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	type AccountMirrorChangeFrontierPlan,
	planAccountMirrorChangeFrontier,
} from "./changeFrontierPlanner.js";
import {
	type AccountMirrorConversationWorkState,
	createAccountMirrorProviderIndexEpoch,
	fingerprintAccountMirrorConversationIndexRow,
} from "./changeFrontierState.js";
import type {
	AccountMirrorConversationFreshness,
	AccountMirrorConversationMaterializationPolicy,
} from "./conversationFreshness.js";
import {
	applyConversationFreshnessFrontier,
	type ConversationFreshnessFrontierCachedSummary,
	type ConversationFreshnessFrontierEvidence,
} from "./conversationFreshnessFrontier.js";
import {
	type ConversationVisitBundle,
	createConversationVisitBundle,
	snapshotAccountMirrorVisitTelemetry,
} from "./conversationVisitBundle.js";
import type {
	AccountMirrorIdentityEvidenceConfidence,
	AccountMirrorIdentityEvidenceSource,
	AccountMirrorProvider,
} from "./politePolicy.js";
import {
	type AccountMirrorProviderTrafficPlanController,
	createAccountMirrorProviderTrafficWorkKey,
	freezeAccountMirrorDetailTrafficPlan,
} from "./providerTrafficPlan.js";
import type {
	AccountMirrorCollectorDiagnosticEvent,
	AccountMirrorCollectorPhase,
	AccountMirrorCollectorPhaseProgressEvidence,
	AccountMirrorMetadataCounts,
	AccountMirrorMetadataEvidence,
	AccountMirrorRouteProgressEvidence,
	AccountMirrorScrapeBudgetEvidence,
} from "./statusRegistry.js";

const MAX_DOM_DRIFT_SCREENSHOTS_PER_PROCESS = 3;
const CHATGPT_DETAIL_READ_TIMEOUT_MS = 240_000;
const GEMINI_DETAIL_READ_TIMEOUT_MS = 20_000;
const PROVIDER_DISCOVERY_READ_TIMEOUT_MS = 30_000;
const CHATGPT_CONTEXT_CHUNK_MESSAGE_LIMIT = 24;
let domDriftScreenshotsCaptured = 0;

function resolveCollectorDiscoveryCallTimeoutMs(
	input: AccountMirrorMetadataCollectorInput,
	kind: "page-refresh" | "conversation-read",
): number {
	const governorWaitMs =
		kind === "page-refresh"
			? (input.limits.pageRefreshCooldownMs ?? 0)
			: (input.limits.conversationReadCooldownMs ?? 0);
	const providerReadMs =
		input.providerCallTimeoutMs ??
		(input.provider === "chatgpt"
			? CHATGPT_DETAIL_READ_TIMEOUT_MS
			: PROVIDER_DISCOVERY_READ_TIMEOUT_MS);
	return providerReadMs + governorWaitMs;
}

export const resolveCollectorDiscoveryCallTimeoutMsForTest = resolveCollectorDiscoveryCallTimeoutMs;

function resolveCollectorDetailCallTimeoutMs(
	input: Pick<AccountMirrorMetadataCollectorInput, "provider" | "providerCallTimeoutMs"> & {
		limits: Pick<
			AccountMirrorMetadataCollectorInput["limits"],
			"conversationReadCooldownMs" | "pageRefreshCooldownMs" | "renavigationCooldownMs"
		>;
	},
): number {
	const providerReadMs =
		input.providerCallTimeoutMs ??
		(input.provider === "gemini" ? GEMINI_DETAIL_READ_TIMEOUT_MS : CHATGPT_DETAIL_READ_TIMEOUT_MS);
	const governorWaitMs = Math.max(
		input.limits.conversationReadCooldownMs ?? 0,
		input.limits.pageRefreshCooldownMs ?? 0,
		input.limits.renavigationCooldownMs ?? 0,
	);
	return providerReadMs + governorWaitMs;
}

export const resolveCollectorDetailCallTimeoutMsForTest = resolveCollectorDetailCallTimeoutMs;

export interface AccountMirrorMetadataCollectorInput {
	conversationIds?: string[] | null;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	expectedIdentityKey: string;
	sweepMode?: "steady_follow" | "full_sweep";
	materializationPolicy?: AccountMirrorConversationMaterializationPolicy | null;
	requestedPhase?: AccountMirrorCollectorPhase | null;
	previousEvidence?: AccountMirrorMetadataEvidence | null;
	previousFiles?: readonly FileRef[] | null;
	previousConversations?: readonly Conversation[] | null;
	previousConversationFreshness?: ReadonlyMap<
		string,
		ConversationFreshnessFrontierCachedSummary
	> | null;
	previousConversationWorkStates?: ReadonlyMap<string, AccountMirrorConversationWorkState> | null;
	shouldYield?: () => Promise<boolean> | boolean;
	onIdentityVerified?: (evidence: AccountMirrorVerifiedIdentityEvidence) => Promise<void> | void;
	onProgress?: (progress: AccountMirrorCollectorPhaseProgressEvidence) => Promise<void> | void;
	onDiagnosticEvent?: (event: AccountMirrorCollectorDiagnosticEvent) => Promise<void> | void;
	abortSignal?: AbortSignal;
	providerCallTimeoutMs?: number | null;
	detailReadCap?: number | null;
	interactionGovernor?: BrowserInteractionGovernor;
	providerTrafficGovernor?: ProviderTrafficGovernor;
	providerTrafficPlanController?: AccountMirrorProviderTrafficPlanController;
	tabAffinity?: {
		host: string;
		onTargetNavigation?: () => Promise<void> | void;
		port: number;
		targetId: string;
	};
	limits: {
		maxPageReadsPerCycle: number;
		maxConversationRowsPerCycle: number;
		maxArtifactRowsPerCycle: number;
		freshFrontierThreshold?: number;
		maxBrowserInteractionsPerMinute: number;
		conversationReadCooldownMs?: number;
		pageRefreshCooldownMs?: number;
		renavigationCooldownMs?: number;
	};
}

export interface AccountMirrorVerifiedIdentityEvidence {
	detectedIdentityKey: string;
	detectedIdentitySource: AccountMirrorIdentityEvidenceSource;
	detectedIdentityObservedAtMs: number;
	detectedIdentityConfidence: AccountMirrorIdentityEvidenceConfidence;
	detectedAccountLevel: string | null;
	providerSessionProof?: ProviderSessionProof;
}

export interface AttachmentInventoryCursor {
	nextProjectIndex: number;
	nextConversationIndex: number;
	detailReadLimit: number;
	scannedProjects: number;
	scannedConversations: number;
	conversationDetail?: {
		conversationId: string;
		nextMessageIndex: number;
		messageLimit: number;
		totalMessages?: number | null;
	} | null;
	yielded?: boolean;
	yieldCause?: {
		observedAt: string | null;
		ownerCommand: string | null;
		kind: string | null;
		operationClass: string | null;
	} | null;
}

export interface AttachmentInventoryProgress {
	scannedProjectIds: string[];
	scannedConversationIds: string[];
	detailObservedConversationIds: string[];
	contextObservedConversationIds: string[];
	artifactBearingConversationIds: string[];
	fileBearingConversationIds: string[];
}

export interface ProjectConversationHistoryCursor {
	nextProjectIndex: number;
	readLimit: number;
	scannedProjects: number;
	yielded?: boolean;
}

export interface AccountMirrorMetadataCollectorResult {
	detectedIdentityKey: string | null;
	detectedIdentitySource?: AccountMirrorIdentityEvidenceSource | string | null;
	detectedIdentityObservedAtMs?: number | null;
	detectedIdentityConfidence?: AccountMirrorIdentityEvidenceConfidence | string | null;
	detectedAccountLevel: string | null;
	providerSessionProof?: ProviderSessionProof;
	metadataCounts: AccountMirrorMetadataCounts;
	manifests: {
		projects: Project[];
		conversations: Conversation[];
		artifacts: ConversationArtifact[];
		files: FileRef[];
		media: AccountMirrorMediaManifestEntry[];
	};
	visitBundles?: ConversationVisitBundle[];
	evidence: AccountMirrorMetadataEvidence;
}

export interface AccountMirrorMetadataCollector {
	collect(
		input: AccountMirrorMetadataCollectorInput,
	): Promise<AccountMirrorMetadataCollectorResult>;
}

export interface ChatgptAccountMirrorMetadataCollectorOptions {
	createClient?: (
		config: ResolvedUserConfig,
		input: AccountMirrorMetadataCollectorInput,
	) => Promise<BrowserAutomationClient> | BrowserAutomationClient;
}

async function reportCollectorProgress(
	input: AccountMirrorMetadataCollectorInput,
	progress: Omit<
		AccountMirrorCollectorPhaseProgressEvidence,
		"provider" | "runtimeProfileId" | "sweepMode" | "observedAt"
	>,
): Promise<void> {
	await input.onProgress?.({
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		sweepMode: input.sweepMode ?? "steady_follow",
		observedAt: new Date().toISOString(),
		...progress,
	});
}

async function reportCollectorDiagnostic(
	input: AccountMirrorMetadataCollectorInput,
	event: Omit<AccountMirrorCollectorDiagnosticEvent, "observedAt">,
): Promise<void> {
	await input.onDiagnosticEvent?.({ ...event, observedAt: new Date().toISOString() });
}

async function runCollectorDiagnosticStage<T>(
	input: AccountMirrorMetadataCollectorInput,
	stage: AccountMirrorCollectorDiagnosticEvent["stage"],
	operation: () => Promise<T>,
	detail: Pick<
		AccountMirrorCollectorDiagnosticEvent,
		"projectId" | "conversationId" | "timeoutMs" | "providerCallTimeoutMs" | "detail"
	> = {},
): Promise<T> {
	const startedAt = performance.now();
	await reportCollectorDiagnostic(input, { stage, event: "started", ...detail });
	try {
		const result = await operation();
		await reportCollectorDiagnostic(input, {
			stage,
			event: "completed",
			elapsedMs: performance.now() - startedAt,
			...detail,
		});
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await reportCollectorDiagnostic(input, {
			stage,
			event: input.abortSignal?.aborted
				? "aborted"
				: /timed out/i.test(message)
					? "timed_out"
					: "failed",
			elapsedMs: performance.now() - startedAt,
			detail: message,
			...detail,
		});
		throw error;
	}
}

function createAccountMirrorListOptions(
	abortSignal?: AbortSignal,
	interactionGovernor?: BrowserInteractionGovernor,
	scrapeTelemetry = createBrowserScrapeTelemetryRecorder(),
	tabAffinity?: AccountMirrorMetadataCollectorInput["tabAffinity"],
	providerTrafficGovernor?: ProviderTrafficGovernor,
	trafficContext?: {
		trafficPhase: "bootstrap" | "index" | "detail";
		workKey: string;
	},
): BrowserProviderListOptions {
	const scopedProviderTrafficGovernor =
		providerTrafficGovernor && trafficContext
			? withProviderTrafficContext(providerTrafficGovernor, trafficContext)
			: providerTrafficGovernor;
	return {
		...(abortSignal ? { abortSignal } : {}),
		...(interactionGovernor ? { interactionGovernor } : {}),
		...(scopedProviderTrafficGovernor
			? { providerTrafficGovernor: scopedProviderTrafficGovernor }
			: {}),
		scrapeTelemetry,
		accountMirrorInventory: true,
		skipFeatureSignature: true,
		...(tabAffinity
			? {
					allowNavigation: true,
					host: tabAffinity.host,
					onTargetNavigation: tabAffinity.onTargetNavigation,
					port: tabAffinity.port,
					preserveActiveTab: true,
					tabLifecycle: "retain" as const,
					tabTargetId: tabAffinity.targetId,
				}
			: { tabLifecycle: "dispose-new" as const }),
		disableProjectClickFallback: true,
	};
}

export const createAccountMirrorListOptionsForTest = createAccountMirrorListOptions;

function withDetailProviderTrafficContext(
	listOptions: BrowserProviderListOptions | undefined,
	workKey: string,
): BrowserProviderListOptions | undefined {
	if (!listOptions?.providerTrafficGovernor) return listOptions;
	return {
		...listOptions,
		providerTrafficGovernor: withProviderTrafficContext(listOptions.providerTrafficGovernor, {
			trafficPhase: "detail",
			workKey,
		}),
	};
}

function withAccountMirrorTabLifecycle(
	listOptions?: BrowserProviderListOptions,
	enabled = true,
): BrowserProviderListOptions | undefined {
	if (!enabled) {
		return listOptions;
	}
	return {
		...(listOptions ?? {}),
		accountMirrorInventory: true,
		tabLifecycle:
			listOptions?.preserveActiveTab === true ? listOptions.tabLifecycle : "dispose-new",
	};
}

async function beforeAccountMirrorBrowserInteraction(
	listOptions: BrowserProviderListOptions | undefined,
	pacer: BrowserInteractionGovernor | undefined,
	kind: BrowserInteractionClass,
): Promise<void> {
	if (listOptions?.interactionGovernor) return;
	await pacer?.beforeInteraction(kind);
}

export interface AccountMirrorDomDriftObservationContext {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	client?: AccountMirrorDomDriftClient;
}

interface AccountMirrorDomDriftClient {
	connectDevTools(): Promise<{
		client: AccountMirrorDomDriftCdpLike;
	}>;
}

type AccountMirrorDomDriftCdpLike = {
	close(): Promise<unknown>;
} & Record<
	"Runtime",
	{
		enable(): Promise<unknown>;
		evaluate(input: {
			expression: string;
			returnByValue?: boolean;
		}): Promise<{ result?: { value?: unknown } }>;
	}
> &
	Record<
		"Page",
		{
			enable(): Promise<unknown>;
			captureScreenshot(input: { format: "png" }): Promise<{ data?: string } | null>;
		}
	>;

export class AccountMirrorIdentityMismatchError extends Error {
	constructor(
		readonly provider: AccountMirrorProvider,
		readonly expectedIdentityKey: string,
		readonly detectedIdentityKey: string | null,
	) {
		super(
			detectedIdentityKey
				? `Detected ${provider} identity ${detectedIdentityKey} does not match expected ${expectedIdentityKey}.`
				: `${provider} identity could not be detected for expected ${expectedIdentityKey}.`,
		);
		this.name = "AccountMirrorIdentityMismatchError";
	}
}

export function createChatgptAccountMirrorMetadataCollector(
	userConfig: ResolvedUserConfig,
	options: ChatgptAccountMirrorMetadataCollectorOptions = {},
): AccountMirrorMetadataCollector {
	return {
		async collect(input) {
			const clientConfig = resolveRuntimeProfileUserConfig(
				userConfig,
				input.runtimeProfileId,
				input.provider,
			);
			const client =
				(await options.createClient?.(clientConfig, input)) ??
				(await BrowserAutomationClient.fromConfig(clientConfig, {
					target: input.provider,
				}));
			const pacer =
				input.interactionGovernor ??
				createAccountMirrorBrowserInteractionGovernor(
					input.limits.maxBrowserInteractionsPerMinute,
					{
						conversationReadCooldownMs: input.limits.conversationReadCooldownMs,
						pageRefreshCooldownMs: input.limits.pageRefreshCooldownMs,
						renavigationCooldownMs: input.limits.renavigationCooldownMs,
					},
					input.abortSignal,
				);
			throwIfCollectionAborted(input.abortSignal);
			const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
			const identityListOptions = createAccountMirrorListOptions(
				input.abortSignal,
				pacer,
				scrapeTelemetry,
				input.tabAffinity,
				input.providerTrafficGovernor,
				{ trafficPhase: "bootstrap", workKey: "scope:identity" },
			);
			const indexListOptions = createAccountMirrorListOptions(
				input.abortSignal,
				pacer,
				scrapeTelemetry,
				input.tabAffinity,
				input.providerTrafficGovernor,
				{ trafficPhase: "index", workKey: "scope:provider-index" },
			);
			const detailListOptions = createAccountMirrorListOptions(
				input.abortSignal,
				pacer,
				scrapeTelemetry,
				input.tabAffinity,
				input.providerTrafficGovernor,
				input.providerTrafficPlanController
					? undefined
					: { trafficPhase: "detail", workKey: "scope:conversation-detail" },
			);
			await reportCollectorProgress(input, { phase: "identity", event: "started" });
			await beforeAccountMirrorBrowserInteraction(identityListOptions, pacer, "page-refresh");
			const identityProviderCallTimeoutMs = resolveCollectorDiscoveryCallTimeoutMs(
				input,
				"page-refresh",
			);
			const providerSessionProof = await runCollectorDiagnosticStage(
				input,
				"identity",
				() =>
					withProviderCallTimeout(
						(abortSignal) =>
							client.getProviderSessionProof({ ...identityListOptions, abortSignal }),
						identityProviderCallTimeoutMs,
						`Identity discovery timed out for ${input.provider}/${input.runtimeProfileId}.`,
						input.abortSignal,
					),
				{ providerCallTimeoutMs: identityProviderCallTimeoutMs },
			);
			throwIfCollectionAborted(input.abortSignal);
			const identity = providerSessionProof.observation;
			const detectedIdentityKey = readProviderIdentityKey(input.provider, identity);
			if (!detectedIdentityKey) {
				throw new AccountMirrorIdentityMismatchError(
					input.provider,
					providerSessionProof.expectation.configuredServiceAccountId ?? input.expectedIdentityKey,
					detectedIdentityKey,
				);
			}
			const verifiedIdentity: AccountMirrorVerifiedIdentityEvidence = {
				detectedIdentityKey,
				detectedIdentitySource: "provider-app",
				detectedIdentityObservedAtMs: Date.now(),
				detectedIdentityConfidence: "authoritative",
				detectedAccountLevel: readAccountLevel(identity),
				providerSessionProof,
			};
			await input.onIdentityVerified?.(verifiedIdentity);
			await reportCollectorProgress(input, { phase: "identity", event: "completed" });

			const requestedPhase = resolveRequestedCollectorPhase(input);
			const requestedDetailConversations = resolveRequestedDetailPhaseConversations(input);
			const honorRequestedDetailPhase =
				requestedPhase === "detail-inventory" &&
				(input.sweepMode ?? "steady_follow") !== "full_sweep" &&
				requestedDetailConversations.length > 0;
			const honorRequestedProjectConversationsPhase =
				requestedPhase === "project-conversations" &&
				(input.sweepMode ?? "steady_follow") !== "full_sweep";
			const skipSteadyFollowProjectDiscovery = shouldSkipSteadyFollowProjectDiscovery(input);

			const projects = honorRequestedDetailPhase
				? { items: [] as Project[], truncated: false }
				: skipSteadyFollowProjectDiscovery
					? await readSkippedCollectorProjects(input)
					: await runCollectorDiagnosticStage(input, "project-index", () =>
							readCollectorProjects(input, client, indexListOptions, pacer),
						);
			throwIfCollectionAborted(input.abortSignal);
			const conversationBudget = Math.max(0, Math.floor(input.limits.maxConversationRowsPerCycle));
			const conversationBudgets = allocateConversationReadBudgets(
				input.provider,
				conversationBudget,
				projects.items.length,
			);
			const rootConversations =
				honorRequestedDetailPhase || honorRequestedProjectConversationsPhase
					? { items: [] as Conversation[], truncated: false }
					: await runCollectorDiagnosticStage(input, "root-rail", () =>
							readCollectorRootConversations(
								input,
								client,
								conversationBudgets.rootRows,
								indexListOptions,
								pacer,
							),
						);
			const remainingConversationBudget = Math.max(
				0,
				honorRequestedProjectConversationsPhase
					? conversationBudget
					: conversationBudgets.projectRows +
							Math.max(0, conversationBudgets.rootRows - rootConversations.items.length),
			);
			const projectConversations: Conversation[] = [];
			let projectConversationsTruncated = false;
			let projectConversationCursor: ProjectConversationHistoryCursor | null = null;
			if (
				!honorRequestedDetailPhase &&
				shouldReadProjectConversationsForAccountMirror(input.provider)
			) {
				await reportCollectorProgress(input, {
					phase: "project-conversations",
					event: "started",
					projectsObserved: projects.items.length,
					conversationsObserved: rootConversations.items.length,
				});
				const previousProjectConversationCursor = selectProjectConversationCursorForRequestedPhase(
					input.sweepMode,
					requestedPhase,
					input.previousEvidence ?? null,
				);
				const result = await runCollectorDiagnosticStage(input, "project-conversations", () =>
					readBoundedProjectConversations(client, projects.items, remainingConversationBudget, {
						listOptions: indexListOptions,
						pacer,
						observation: createAccountMirrorObservationContext(input, client),
						tolerateReadFailure: input.provider === "gemini",
						abortSignal: input.abortSignal,
						cursor: previousProjectConversationCursor,
						maxProjectReads: input.limits.maxPageReadsPerCycle,
						providerCallTimeoutMs: resolveCollectorDiscoveryCallTimeoutMs(
							input,
							"conversation-read",
						),
						shouldYield: async () => {
							const callerYield = await input.shouldYield?.();
							const state = input.providerTrafficGovernor?.snapshotAdmissionState?.();
							if (state?.backendRequestOutcome === "guarded") {
								await input.providerTrafficGovernor?.checkWarning?.();
								throw new Error("Provider backend requests are guarded; collection stopped.");
							}
							if (state?.backendRequestOutcome === "uncertain")
								throw new Error(
									"Provider backend request outcome is uncertain; collection stopped.",
								);
							return (
								callerYield === true ||
								state?.backendRequestOutcome === "budget-exhausted" ||
								state?.budgets.some(
									(budget) =>
										budget.phase === "index" &&
										budget.kind === "page_navigate" &&
										budget.remaining === 0,
								) === true
							);
						},
					}),
				);
				projectConversations.push(...result.items);
				projectConversationsTruncated = result.truncated;
				projectConversationCursor = result.cursor;
				await reportCollectorProgress(input, {
					phase: "project-conversations",
					event: "completed",
					projectsObserved: projects.items.length,
					conversationsObserved: projectConversations.length,
				});
			}
			throwIfCollectionAborted(input.abortSignal);
			const conversations = honorRequestedDetailPhase
				? requestedDetailConversations
				: mergeConversationsById([...rootConversations.items, ...projectConversations]);
			const providerIndexEpoch = createAccountMirrorProviderIndexEpoch({
				provider: input.provider,
				runtimeProfileId: input.runtimeProfileId,
				browserProfileId: getRuntimeProfileBrowserProfileId(
					getCurrentRuntimeProfiles(userConfig)[input.runtimeProfileId],
				),
				boundIdentityKey: detectedIdentityKey,
				observedAt: new Date().toISOString(),
				projectCount: projects.items.length,
				conversations,
			});
			const attachmentCursor = input.conversationIds?.length
				? null
				: selectAttachmentInventoryCursorForRequestedPhase(
						input.provider,
						input.sweepMode,
						requestedPhase,
						input.previousEvidence ?? null,
					);
			const legacyFrontier = honorRequestedDetailPhase
				? {
						detailConversations: requestedDetailConversations,
						evidence: input.previousEvidence?.conversationFreshnessFrontier ?? null,
					}
				: selectConversationDetailCandidates({
						provider: input.provider,
						sweepMode: input.sweepMode ?? "steady_follow",
						conversations,
						previousConversationFreshness: input.previousConversationFreshness ?? null,
						materializationPolicy: input.materializationPolicy ?? null,
						attachmentCursor,
						freshFrontierThreshold: input.limits.freshFrontierThreshold,
					});
			const deterministicFrontier =
				(input.sweepMode ?? "steady_follow") === "full_sweep"
					? { detailConversations: legacyFrontier.detailConversations, plan: null }
					: applyDeterministicChangeFrontier({
							conversations,
							legacyDetailConversations: legacyFrontier.detailConversations,
							previousConversationFreshness: input.previousConversationFreshness ?? null,
							previousConversationWorkStates: input.previousConversationWorkStates ?? null,
							epochId: providerIndexEpoch.epochId,
							now: providerIndexEpoch.observedAt,
						});
			const frontier = {
				detailConversations: deterministicFrontier.detailConversations,
				evidence:
					deterministicFrontier.plan && legacyFrontier.evidence
						? {
								...legacyFrontier.evidence,
								rowsExamined: conversations.length,
								rowsSelectedForDetail: deterministicFrontier.detailConversations.length,
								selectedConversationIds: deterministicFrontier.detailConversations.map(
									(conversation) => conversation.id,
								),
							}
						: legacyFrontier.evidence,
			};
			await reportCollectorProgress(input, {
				phase: "detail-inventory",
				event: "started",
				projectsObserved: projects.items.length,
				conversationsObserved: conversations.length,
				attachmentCursor,
			});
			const detailAttachmentCursor = selectDetailAttachmentCursorForFreshnessFrontier({
				provider: input.provider,
				sweepMode: input.sweepMode ?? "steady_follow",
				attachmentCursor,
				frontierEvidence: frontier.evidence,
				detailConversations: frontier.detailConversations,
				projectsLength: projects.items.length,
				resetCursorForFreshnessFrontier:
					!honorRequestedDetailPhase || Boolean(deterministicFrontier.plan),
			});
			const projectIndexRead = !honorRequestedDetailPhase && !skipSteadyFollowProjectDiscovery;
			const chatgptAccountLibraryRead =
				input.provider === "chatgpt" &&
				!honorRequestedDetailPhase &&
				!(
					(input.sweepMode ?? "steady_follow") === "steady_follow" &&
					(frontier.evidence?.rowsSelectedForDetail ?? 0) === 0
				) &&
				!(
					(input.sweepMode ?? "steady_follow") === "steady_follow" &&
					frontier.detailConversations.length > 0
				);
			const prioritizeDetailConversations =
				honorRequestedDetailPhase ||
				((input.sweepMode ?? "steady_follow") === "steady_follow" &&
					frontier.detailConversations.length > 0);
			const interactionCappedDetailReads = capDetailReadsForActiveInteractionBudget({
				maxDetailReads: input.limits.maxPageReadsPerCycle,
				maxBrowserInteractionsPerMinute: input.limits.maxBrowserInteractionsPerMinute,
				projectIndexRead,
				rootRailRead: !(honorRequestedDetailPhase || honorRequestedProjectConversationsPhase),
				projectConversationReads: projectConversationCursor?.scannedProjects ?? 0,
				chatgptAccountLibraryRead,
			});
			const maxDetailReads = input.providerTrafficPlanController
				? chatgptAccountLibraryRead
					? 0
					: Math.min(1, interactionCappedDetailReads)
				: interactionCappedDetailReads;
			const remainingDetailSurfaces = frontier.detailConversations.length + projects.items.length;
			const budgetYieldCause = (
				input.providerTrafficPlanController
					? maxDetailReads < remainingDetailSurfaces
					: maxDetailReads <= 0 && remainingDetailSurfaces > 0
			)
				? createProviderInteractionBudgetYieldCause()
				: null;
			if (input.providerTrafficPlanController) {
				const selectedConversation =
					frontier.detailConversations[
						normalizeCursorIndex(
							detailAttachmentCursor?.nextConversationIndex,
							frontier.detailConversations.length,
						)
					];
				const selectedProject =
					projects.items[
						normalizeCursorIndex(detailAttachmentCursor?.nextProjectIndex, projects.items.length)
					];
				const selectedDetailWorkKey = chatgptAccountLibraryRead
					? "scope:account-library"
					: prioritizeDetailConversations && selectedConversation
						? createAccountMirrorProviderTrafficWorkKey("conversation", selectedConversation.id)
						: selectedProject
							? createAccountMirrorProviderTrafficWorkKey("project", selectedProject.id)
							: selectedConversation
								? createAccountMirrorProviderTrafficWorkKey("conversation", selectedConversation.id)
								: null;
				freezeAccountMirrorDetailTrafficPlan(input.providerTrafficPlanController, {
					workKeys: selectedDetailWorkKey ? [selectedDetailWorkKey] : [],
				});
			}
			const inventory =
				input.provider === "chatgpt"
					? await readBoundedChatgptDetailInventory(
							client,
							projects.items,
							frontier.detailConversations,
							input.limits.maxArtifactRowsPerCycle,
							{
								maxDetailReads,
								cursor: detailAttachmentCursor,
								budgetYieldCause,
								shouldYield: input.shouldYield,
								listOptions: detailListOptions,
								pacer,
								observation: createAccountMirrorObservationContext(input, client),
								previousFiles: input.previousFiles,
								providerCallTimeoutMs: resolveCollectorDetailCallTimeoutMs(input),
								readProviderGuard: () => readActiveChatgptRateLimitReason(input.runtimeProfileId),
								freshnessEpoch: providerIndexEpoch.epochId,
								detailReadCap: input.detailReadCap ?? undefined,
								onDiagnosticEvent: input.onDiagnosticEvent,
								onCheckpoint: (attachmentCursor) =>
									reportCollectorProgress(input, {
										phase: "detail-inventory",
										event: "started",
										projectsObserved: projects.items.length,
										conversationsObserved: conversations.length,
										attachmentCursor,
									}),
								prioritizeConversations: prioritizeDetailConversations,
								usePerSurfaceTrafficContext: Boolean(input.providerTrafficPlanController),
								skipAccountLibraryInventory:
									honorRequestedDetailPhase ||
									((input.sweepMode ?? "steady_follow") === "steady_follow" &&
										(frontier.detailConversations.length > 0 ||
											(frontier.evidence?.rowsSelectedForDetail ?? 0) === 0)),
							},
						)
					: input.provider === "gemini"
						? await readBoundedGeminiDetailInventory(
								client,
								projects.items,
								frontier.detailConversations,
								input.limits.maxArtifactRowsPerCycle,
								{
									maxDetailReads,
									cursor: detailAttachmentCursor,
									budgetYieldCause,
									shouldYield: input.shouldYield,
									listOptions: detailListOptions,
									pacer,
									observation: createAccountMirrorObservationContext(input, client),
								},
							)
						: input.provider === "grok"
							? await readBoundedGrokDetailInventory(
									client,
									frontier.detailConversations,
									input.limits.maxArtifactRowsPerCycle,
									{
										maxDetailReads,
										cursor: detailAttachmentCursor,
										budgetYieldCause,
										shouldYield: input.shouldYield,
										listOptions: detailListOptions,
										pacer,
										observation: createAccountMirrorObservationContext(input, client),
									},
								)
							: {
									artifacts: [],
									files: [],
									media: [],
									truncated: false,
									cursor: null,
								};
			await reportCollectorProgress(input, {
				phase: "detail-inventory",
				event: "completed",
				projectsObserved: projects.items.length,
				conversationsObserved: conversations.length,
				artifactsObserved: inventory.artifacts.length,
				filesObserved: inventory.files.length,
				attachmentCursor: inventory.cursor,
			});
			const inventoryProgress = hasAttachmentInventoryProgress(inventory)
				? inventory.progress
				: createAttachmentInventoryProgress();
			const scrapeBudget = buildAccountMirrorScrapeBudgetEvidence({
				provider: input.provider,
				runtimeProfileId: input.runtimeProfileId,
				sweepMode: input.sweepMode ?? "steady_follow",
				limits: input.limits,
				honorRequestedDetailPhase,
				honorRequestedProjectConversationsPhase,
				projectsRead: projects.items.length,
				rootConversationsRead: rootConversations.items.length,
				projectConversationCursor,
				inventoryProgress,
				attachmentCursor: inventory.cursor,
				scrapeTelemetry: snapshotBrowserScrapeTelemetry(scrapeTelemetry),
				projectIndexRead,
				chatgptAccountLibraryRead,
			});
			const detailObservedAt = new Date().toISOString();
			const detailObservedConversationIds = new Set(
				inventoryProgress.detailObservedConversationIds,
			);
			const conversationsWithDetailEvidence = conversations.map((conversation) =>
				detailObservedConversationIds.has(conversation.id)
					? annotateConversationDetailObservedAt(conversation, detailObservedAt)
					: conversation,
			);
			return {
				detectedIdentityKey,
				detectedIdentitySource: verifiedIdentity.detectedIdentitySource,
				detectedIdentityObservedAtMs: verifiedIdentity.detectedIdentityObservedAtMs,
				detectedIdentityConfidence: verifiedIdentity.detectedIdentityConfidence,
				detectedAccountLevel: verifiedIdentity.detectedAccountLevel,
				providerSessionProof,
				metadataCounts: {
					projects: projects.items.length,
					conversations: conversations.length,
					artifacts: inventory.artifacts.length,
					files: inventory.files.length,
					media: inventory.media.length,
				},
				manifests: {
					projects: projects.items,
					conversations: conversationsWithDetailEvidence,
					artifacts: inventory.artifacts,
					files: inventory.files,
					media: inventory.media,
				},
				visitBundles: readConversationVisitBundles(inventory),
				evidence: {
					identitySource: identity?.source ?? null,
					providerSessionProof: summarizeProviderSessionProof(providerSessionProof),
					projectSampleIds: projects.items.slice(0, 8).map((project) => project.id),
					conversationSampleIds: conversations.slice(0, 8).map((conversation) => conversation.id),
					detailConversationIdsThisPass: uniqueStrings(
						inventoryProgress.detailObservedConversationIds,
					),
					truncated: {
						projects: projects.truncated,
						conversations:
							rootConversations.truncated ||
							projectConversationsTruncated ||
							(projects.items.length > 0 &&
								shouldReadProjectConversationsForAccountMirror(input.provider) &&
								remainingConversationBudget <= 0),
						artifacts: inventory.truncated,
					},
					routeProgress:
						input.provider === "gemini"
							? buildGeminiRouteProgressEvidence({
									projects: projects.items,
									conversations,
									inventoryProgress,
								})
							: null,
					scrapeBudget,
					collectorProgress: {
						provider: input.provider,
						runtimeProfileId: input.runtimeProfileId,
						sweepMode: input.sweepMode ?? "steady_follow",
						phase: "complete",
						event: "completed",
						observedAt: new Date().toISOString(),
						projectsObserved: projects.items.length,
						conversationsObserved: conversations.length,
						artifactsObserved: inventory.artifacts.length,
						filesObserved: inventory.files.length,
						attachmentCursor: inventory.cursor,
					},
					conversationFreshnessFrontier: frontier.evidence,
					providerIndexEpoch,
					changeFrontierPlan: deterministicFrontier.plan,
					projectConversations: projectConversationCursor,
					attachmentInventory: inventory.cursor,
				},
			};
		},
	};
}

function normalizeAttachmentCursorForDetailCandidates(
	cursor: AttachmentInventoryCursor | null,
	conversations: readonly Conversation[],
): AttachmentInventoryCursor | null {
	if (!cursor?.conversationDetail) return cursor;
	const conversationIndex = conversations.findIndex(
		(conversation) => conversation.id === cursor.conversationDetail?.conversationId,
	);
	if (conversationIndex < 0) return cursor;
	return {
		...cursor,
		nextConversationIndex: conversationIndex,
	};
}

export function selectDetailAttachmentCursorForFreshnessFrontier(input: {
	provider: AccountMirrorProvider;
	sweepMode: "steady_follow" | "full_sweep";
	attachmentCursor: AttachmentInventoryCursor | null;
	frontierEvidence: ConversationFreshnessFrontierEvidence | null;
	detailConversations: readonly Conversation[];
	projectsLength: number;
	resetCursorForFreshnessFrontier?: boolean;
}): AttachmentInventoryCursor | null {
	const normalized = normalizeAttachmentCursorForDetailCandidates(
		input.attachmentCursor,
		input.detailConversations,
	);
	if (normalized && !normalized.conversationDetail) {
		const frontierFilteredRows =
			input.frontierEvidence &&
			input.frontierEvidence.rowsSelectedForDetail < input.frontierEvidence.rowsExamined;
		if (
			input.resetCursorForFreshnessFrontier !== false &&
			input.sweepMode === "steady_follow" &&
			frontierFilteredRows &&
			(input.provider === "chatgpt" || input.provider === "gemini" || input.provider === "grok")
		) {
			return {
				...normalized,
				nextProjectIndex: Math.max(0, Math.floor(input.projectsLength)),
				nextConversationIndex: 0,
			};
		}
	}
	return normalized;
}

export function selectConversationDetailCandidates(input: {
	provider: AccountMirrorProvider;
	sweepMode: "steady_follow" | "full_sweep";
	conversations: readonly Conversation[];
	previousConversationFreshness: ReadonlyMap<
		string,
		ConversationFreshnessFrontierCachedSummary
	> | null;
	materializationPolicy?: AccountMirrorConversationMaterializationPolicy | null;
	attachmentCursor: AttachmentInventoryCursor | null;
	freshFrontierThreshold?: number | null;
}): {
	detailConversations: Conversation[];
	evidence: ConversationFreshnessFrontierEvidence | null;
} {
	if (input.provider !== "chatgpt" && input.provider !== "gemini" && input.provider !== "grok") {
		return { detailConversations: [...input.conversations], evidence: null };
	}
	const result = applyConversationFreshnessFrontier({
		provider: input.provider,
		sweepMode: input.sweepMode,
		conversations: input.conversations,
		cachedSummaries: input.previousConversationFreshness,
		materializationPolicy: input.materializationPolicy ?? null,
		incompleteDetailConversationId:
			input.attachmentCursor?.conversationDetail?.conversationId ?? null,
		threshold: input.freshFrontierThreshold,
	});
	return {
		detailConversations: result.conversations,
		evidence: result.evidence,
	};
}

export function applyDeterministicChangeFrontier(input: {
	conversations: readonly Conversation[];
	legacyDetailConversations: readonly Conversation[];
	previousConversationFreshness: ReadonlyMap<
		string,
		ConversationFreshnessFrontierCachedSummary
	> | null;
	previousConversationWorkStates: ReadonlyMap<string, AccountMirrorConversationWorkState> | null;
	epochId: string;
	now: string;
}): { detailConversations: Conversation[]; plan: AccountMirrorChangeFrontierPlan | null } {
	if (!input.previousConversationFreshness || !input.previousConversationWorkStates) {
		return { detailConversations: [...input.legacyDetailConversations], plan: null };
	}
	const rows = input.conversations.flatMap((conversation) => {
		const workState = input.previousConversationWorkStates?.get(conversation.id);
		const summary = input.previousConversationFreshness?.get(conversation.id);
		if (!workState || !summary) return [];
		return [{ workState, freshness: freshnessFromSummary(summary, conversation) }];
	});
	if (rows.length === 0) {
		return { detailConversations: [...input.legacyDetailConversations], plan: null };
	}
	const plan = planAccountMirrorChangeFrontier({
		epochId: input.epochId,
		now: input.now,
		rows,
	});
	const decisionByKey = new Map(
		plan.decisions.map((decision) => [decision.conversationKey, decision]),
	);
	const legacyIds = new Set(input.legacyDetailConversations.map((conversation) => conversation.id));
	const detailConversations = input.conversations.filter((conversation) => {
		const workState = input.previousConversationWorkStates?.get(conversation.id);
		if (!workState) return legacyIds.has(conversation.id);
		const decision = decisionByKey.get(workState.conversationKey);
		return decision ? decision.action === "visit_once" : legacyIds.has(conversation.id);
	});
	return { detailConversations, plan };
}

function freshnessFromSummary(
	summary: ConversationFreshnessFrontierCachedSummary,
	conversation: Conversation,
): AccountMirrorConversationFreshness {
	return {
		object: "account_mirror_conversation_freshness",
		state: summary.freshnessState,
		reasons: [],
		indexObservedAt: null,
		indexSource: null,
		indexRank: null,
		detailObservedAt: summary.detailObservedAt,
		manifestObservedAt: summary.manifestObservedAt,
		materializedAt: null,
		routeabilityObservedAt: null,
		routeabilityState: summary.routeabilityState,
		conversationFingerprint: fingerprintAccountMirrorConversationIndexRow(conversation),
		detailCompleteness: summary.detailCompleteness ?? "unknown",
		assetCompleteness: summary.assetCompleteness,
		assetCounts: {
			known: summary.knownAssetCount ?? summary.missingLocalCount,
			local: summary.localAssetCount ?? 0,
			missingLocal: summary.missingLocalCount,
		},
	};
}

export function selectAttachmentInventoryCursorForSweep(
	sweepMode: AccountMirrorMetadataCollectorInput["sweepMode"],
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): AttachmentInventoryCursor | null {
	if (sweepMode !== "full_sweep") return null;
	return previousEvidence?.attachmentInventory ?? null;
}

export function selectAttachmentInventoryCursorForProviderSweep(
	provider: AccountMirrorProvider,
	sweepMode: AccountMirrorMetadataCollectorInput["sweepMode"],
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): AttachmentInventoryCursor | null {
	if (provider === "gemini") return previousEvidence?.attachmentInventory ?? null;
	if (provider === "chatgpt" && sweepMode !== "full_sweep") {
		return shouldResumeChatgptAttachmentInventoryCursor(previousEvidence)
			? (previousEvidence?.attachmentInventory ?? null)
			: null;
	}
	return selectAttachmentInventoryCursorForSweep(sweepMode, previousEvidence);
}

export function selectAttachmentInventoryCursorForRequestedPhase(
	provider: AccountMirrorProvider,
	sweepMode: AccountMirrorMetadataCollectorInput["sweepMode"],
	requestedPhase: AccountMirrorCollectorPhase | null | undefined,
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): AttachmentInventoryCursor | null {
	if (requestedPhase === "detail-inventory") {
		return previousEvidence?.attachmentInventory ?? null;
	}
	return selectAttachmentInventoryCursorForProviderSweep(provider, sweepMode, previousEvidence);
}

export function shouldResumeChatgptAttachmentInventoryCursor(
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): boolean {
	const cursor = previousEvidence?.attachmentInventory;
	if (!cursor) return false;
	if (previousEvidence?.truncated?.artifacts === true) return true;
	const assetInventoryState = previousEvidence?.assetInventory?.state ?? null;
	return assetInventoryState === "in_progress" || assetInventoryState === "deferred";
}

export function buildGeminiRouteProgressEvidence(input: {
	projects: readonly Project[];
	conversations: readonly Conversation[];
	inventoryProgress: AttachmentInventoryProgress;
}): AccountMirrorRouteProgressEvidence {
	const selectedConversationIds = uniqueStrings(input.inventoryProgress.scannedConversationIds);
	const artifactBearingConversationIds = uniqueStrings(
		input.inventoryProgress.artifactBearingConversationIds,
	);
	const fileBearingConversationIds = uniqueStrings(
		input.inventoryProgress.fileBearingConversationIds,
	);
	const routeSequence = [
		...(input.projects.length > 0 ? ["/gems/view"] : []),
		"/app",
		...selectedConversationIds.map((conversationId) => `/app/${conversationId}`),
	];
	const repeatedRouteVisits = countRepeatedStrings(routeSequence);
	const churnDetected = routeSequence.includes("/app") && selectedConversationIds.length === 0;
	return {
		provider: "gemini",
		strategy: "gemini-left-rail",
		routeSequence,
		appShellVisits: routeSequence.filter((route) => route === "/app").length,
		gemsViewVisits: routeSequence.filter((route) => route === "/gems/view").length,
		repeatedRouteVisits,
		conversationCandidates: input.conversations.length,
		selectedConversationIds,
		artifactBearingConversationIds,
		fileBearingConversationIds,
		materializationAttempts:
			artifactBearingConversationIds.length + fileBearingConversationIds.length,
		churnDetected,
		yieldCause: churnDetected ? "shell_without_conversation_selection" : null,
	};
}

function buildAccountMirrorScrapeBudgetEvidence(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	sweepMode: "steady_follow" | "full_sweep";
	limits: AccountMirrorMetadataCollectorInput["limits"];
	honorRequestedDetailPhase: boolean;
	honorRequestedProjectConversationsPhase: boolean;
	projectsRead: number;
	rootConversationsRead: number;
	projectConversationCursor: ProjectConversationHistoryCursor | null;
	inventoryProgress: AttachmentInventoryProgress;
	attachmentCursor: AttachmentInventoryCursor | null;
	scrapeTelemetry: BrowserScrapeTelemetrySnapshot | null;
	projectIndexRead: boolean;
	chatgptAccountLibraryRead: boolean;
}): AccountMirrorScrapeBudgetEvidence {
	const providerActions = normalizePositiveCountRecord(input.scrapeTelemetry?.providerActions);
	const cdpMethods = normalizePositiveCountRecord(input.scrapeTelemetry?.cdpCalls);
	const telemetryPassive = derivePassiveScrapeSignalsFromTelemetry(providerActions);
	const passive = {
		domParses: Math.max(
			input.inventoryProgress.detailObservedConversationIds.length +
				input.inventoryProgress.scannedProjectIds.length,
			telemetryPassive.domParses,
		),
		appStateReads: Math.max(
			input.inventoryProgress.contextObservedConversationIds.length,
			telemetryPassive.appStateReads,
		),
		downloadLinkEnumerations: Math.max(
			uniqueStrings([
				...input.inventoryProgress.artifactBearingConversationIds,
				...input.inventoryProgress.fileBearingConversationIds,
			]).length,
			telemetryPassive.downloadLinkEnumerations,
		),
		cachedFileCarries: 0,
		total: 0,
	};
	passive.total =
		passive.domParses +
		passive.appStateReads +
		passive.downloadLinkEnumerations +
		passive.cachedFileCarries;
	const active = {
		identityReads: 1,
		projectIndexReads: input.projectIndexRead ? 1 : 0,
		rootRailReads:
			input.honorRequestedDetailPhase || input.honorRequestedProjectConversationsPhase ? 0 : 1,
		projectConversationReads: input.projectConversationCursor?.scannedProjects ?? 0,
		chatLoads: input.inventoryProgress.scannedConversationIds.length,
		accountLibraryReads: input.chatgptAccountLibraryRead ? 1 : 0,
		downloads: 0,
		total: 0,
	};
	active.total =
		active.identityReads +
		active.projectIndexReads +
		active.rootRailReads +
		active.projectConversationReads +
		active.chatLoads +
		active.accountLibraryReads +
		active.downloads;
	const budget = Math.max(0, Math.floor(input.limits.maxBrowserInteractionsPerMinute));
	const remaining = budget > 0 ? Math.max(0, budget - active.total) : null;
	const providerInteractionBudgetExhausted = budget > 0 && active.total >= budget;
	const yielded = input.attachmentCursor?.yielded === true || providerInteractionBudgetExhausted;
	const yieldReason =
		input.attachmentCursor?.yieldCause?.kind ??
		(providerInteractionBudgetExhausted ? "provider-interaction-budget" : null);
	const cdpMethodCalls = sumCountRecord(cdpMethods);
	const classification =
		passive.total === 0 && active.total === 0
			? "unknown"
			: passive.total > active.total
				? "passive_dominant"
				: active.total > passive.total
					? "active_dominant"
					: "balanced";
	return {
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		sweepMode: input.sweepMode,
		observedAt: new Date().toISOString(),
		classification,
		summary: `Account mirror scrape used ${passive.total} passive parse/read signal(s) and ${active.total} active provider interaction(s).`,
		passive,
		active,
		providerInteractions: {
			budget: budget > 0 ? budget : null,
			used: active.total,
			remaining,
			yielded,
			yieldReason,
		},
		providerGuardCorrelation: {
			state: "none",
			kind: null,
			summary: null,
			detectedAt: null,
			cooldownUntil: null,
			action: null,
			correlatedWithYield: false,
			yieldReason: null,
		},
		llmServiceRequests: 0,
		cdpMethodCalls,
		cdpMethods,
		providerActions,
	};
}

function derivePassiveScrapeSignalsFromTelemetry(providerActions: Record<string, number>): {
	domParses: number;
	appStateReads: number;
	downloadLinkEnumerations: number;
} {
	return {
		domParses: sumSelectedCountRecord(providerActions, [
			"chatgpt.readVisibleConversationFiles",
			"chatgpt.readVisibleDownloadArtifactProbes",
			"chatgpt.readVisibleImageArtifactProbes",
			"chatgpt.readVisibleCanvasProbes",
		]),
		appStateReads: sumSelectedCountRecord(providerActions, [
			"chatgpt.readConversationMessages",
			"llmService.getConversationContext",
		]),
		downloadLinkEnumerations: sumSelectedCountRecord(providerActions, [
			"chatgpt.readVisibleConversationFiles",
			"chatgpt.readVisibleDownloadArtifactProbes",
		]),
	};
}

function normalizePositiveCountRecord(
	value: Record<string, number> | null | undefined,
): Record<string, number> {
	const normalized: Record<string, number> = {};
	for (const [key, count] of Object.entries(value ?? {})) {
		const normalizedKey = key.trim();
		if (!normalizedKey || !Number.isFinite(count) || count <= 0) continue;
		normalized[normalizedKey] = Math.floor(count);
	}
	return normalized;
}

function sumCountRecord(value: Record<string, number>): number {
	return Object.values(value).reduce((total, count) => total + count, 0);
}

function sumSelectedCountRecord(value: Record<string, number>, keys: readonly string[]): number {
	return keys.reduce((total, key) => total + (value[key] ?? 0), 0);
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function countRepeatedStrings(values: readonly string[]): number {
	const seen = new Set<string>();
	let repeated = 0;
	for (const value of values) {
		if (seen.has(value)) {
			repeated += 1;
			continue;
		}
		seen.add(value);
	}
	return repeated;
}

export function selectProjectConversationCursorForSweep(
	sweepMode: AccountMirrorMetadataCollectorInput["sweepMode"],
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): ProjectConversationHistoryCursor | null {
	if (sweepMode !== "full_sweep") return null;
	return previousEvidence?.projectConversations ?? null;
}

export function selectProjectConversationCursorForRequestedPhase(
	sweepMode: AccountMirrorMetadataCollectorInput["sweepMode"],
	requestedPhase: AccountMirrorCollectorPhase | null | undefined,
	previousEvidence: AccountMirrorMetadataEvidence | null | undefined,
): ProjectConversationHistoryCursor | null {
	if (requestedPhase === "project-conversations") {
		return previousEvidence?.projectConversations ?? null;
	}
	return selectProjectConversationCursorForSweep(sweepMode, previousEvidence);
}

export function resolveRequestedDetailPhaseConversations(
	input: Pick<
		AccountMirrorMetadataCollectorInput,
		"provider" | "previousEvidence" | "requestedPhase" | "previousConversations" | "conversationIds"
	>,
): Conversation[] {
	if (input.requestedPhase !== "detail-inventory") return [];
	const ids = input.conversationIds?.length
		? uniqueStrings(input.conversationIds)
		: uniqueStrings([
				input.previousEvidence?.attachmentInventory?.conversationDetail?.conversationId ?? "",
				...(input.previousEvidence?.conversationFreshnessFrontier?.selectedConversationIds ?? []),
				...(input.previousEvidence?.collectorProgress?.attachmentCursor?.conversationDetail
					?.conversationId
					? [
							input.previousEvidence.collectorProgress.attachmentCursor.conversationDetail
								.conversationId,
						]
					: []),
			]);
	const retained = new Map(
		input.previousConversations?.map((conversation) => [conversation.id, conversation]),
	);
	return ids.map(
		(id) =>
			retained.get(id) ?? {
				id,
				title: id,
				provider: input.provider,
			},
	);
}

function resolveRequestedCollectorPhase(
	input: Pick<AccountMirrorMetadataCollectorInput, "requestedPhase">,
): AccountMirrorCollectorPhase | null {
	return input.requestedPhase ?? null;
}

function shouldSkipSteadyFollowProjectDiscovery(
	input: AccountMirrorMetadataCollectorInput,
): boolean {
	if (input.provider !== "chatgpt") return false;
	if ((input.sweepMode ?? "steady_follow") !== "steady_follow") return false;
	if (input.requestedPhase === "projects" || input.requestedPhase === "project-conversations") {
		return false;
	}
	const previousEvidence = input.previousEvidence;
	if (!previousEvidence) return false;
	if (previousEvidence.truncated.projects === true) return false;
	return (previousEvidence.projectSampleIds?.length ?? 0) === 0;
}

function capDetailReadsForActiveInteractionBudget(input: {
	maxDetailReads: number;
	maxBrowserInteractionsPerMinute: number;
	projectIndexRead: boolean;
	rootRailRead: boolean;
	projectConversationReads: number;
	chatgptAccountLibraryRead: boolean;
}): number {
	const requested = Math.max(0, Math.floor(input.maxDetailReads));
	const budget = Math.max(0, Math.floor(input.maxBrowserInteractionsPerMinute));
	if (budget <= 0) return requested;
	const spentBeforeDetail =
		1 +
		(input.projectIndexRead ? 1 : 0) +
		(input.rootRailRead ? 1 : 0) +
		Math.max(0, Math.floor(input.projectConversationReads)) +
		(input.chatgptAccountLibraryRead ? 1 : 0);
	return Math.max(0, Math.min(requested, budget - spentBeforeDetail));
}

function createProviderInteractionBudgetYieldCause(): NonNullable<
	AttachmentInventoryCursor["yieldCause"]
> {
	return {
		observedAt: new Date().toISOString(),
		ownerCommand: "account-mirror-refresh",
		kind: "provider-interaction-budget",
		operationClass: "account-mirror",
	};
}

async function readSkippedCollectorProjects(
	input: AccountMirrorMetadataCollectorInput,
): Promise<{ items: Project[]; truncated: boolean }> {
	await reportCollectorProgress(input, { phase: "projects", event: "started" });
	await reportCollectorProgress(input, {
		phase: "projects",
		event: "completed",
		projectsObserved: 0,
	});
	return { items: [], truncated: false };
}

async function readCollectorProjects(
	input: AccountMirrorMetadataCollectorInput,
	client: Pick<BrowserAutomationClient, "listProjects">,
	listOptions: BrowserProviderListOptions | undefined,
	pacer: BrowserInteractionGovernor,
): Promise<{ items: Project[]; truncated: boolean }> {
	await reportCollectorProgress(input, { phase: "projects", event: "started" });
	const projects = await readBoundedProjects(client, input.limits.maxPageReadsPerCycle, {
		tolerateReadFailure: input.provider === "gemini",
		listOptions,
		pacer,
		observation: createAccountMirrorObservationContext(input),
		providerCallTimeoutMs: resolveCollectorDiscoveryCallTimeoutMs(input, "page-refresh"),
	});
	await reportCollectorProgress(input, {
		phase: "projects",
		event: "completed",
		projectsObserved: projects.items.length,
	});
	return projects;
}

async function readCollectorRootConversations(
	input: AccountMirrorMetadataCollectorInput,
	client: BrowserAutomationClient,
	rootRows: number,
	listOptions: BrowserProviderListOptions | undefined,
	pacer: BrowserInteractionGovernor,
): Promise<{ items: Conversation[]; truncated: boolean }> {
	await reportCollectorProgress(input, { phase: "root-conversations", event: "started" });
	const rootConversations = await readBoundedConversations(client, null, rootRows, {
		listOptions,
		pacer,
		observation: createAccountMirrorObservationContext(input, client),
		providerCallTimeoutMs: resolveCollectorDiscoveryCallTimeoutMs(input, "conversation-read"),
	});
	await reportCollectorProgress(input, {
		phase: "root-conversations",
		event: "completed",
		conversationsObserved: rootConversations.items.length,
	});
	return rootConversations;
}

export function shouldReadProjectConversationsForAccountMirror(
	provider: AccountMirrorProvider,
): boolean {
	return provider === "chatgpt" || provider === "gemini";
}

export function allocateConversationReadBudgets(
	provider: AccountMirrorProvider,
	maxRows: number,
	projectCount: number,
): { rootRows: number; projectRows: number } {
	const rowBudget = Math.max(0, Math.floor(maxRows));
	if (rowBudget <= 0) return { rootRows: 0, projectRows: 0 };
	if (
		!shouldReadProjectConversationsForAccountMirror(provider) ||
		projectCount <= 0 ||
		rowBudget <= 1
	) {
		return { rootRows: rowBudget, projectRows: 0 };
	}
	const projectReserve = Math.min(
		Math.max(0, Math.floor(projectCount)),
		Math.max(1, Math.floor(rowBudget / 4)),
	);
	const rootRows = Math.max(1, rowBudget - projectReserve);
	return {
		rootRows,
		projectRows: Math.max(0, rowBudget - rootRows),
	};
}

function createAccountMirrorObservationContext(
	input: Pick<AccountMirrorMetadataCollectorInput, "provider" | "runtimeProfileId">,
	client?: AccountMirrorDomDriftClient,
): AccountMirrorDomDriftObservationContext {
	return {
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		client,
	};
}

function throwIfCollectionAborted(signal: AbortSignal | null | undefined): void {
	if (signal?.aborted) {
		const reason = signal.reason;
		throw reason instanceof Error
			? reason
			: new Error("Account mirror metadata collection was aborted.");
	}
}

function createAccountMirrorBrowserInteractionGovernor(
	maxBrowserInteractionsPerMinute: number | null | undefined,
	cooldowns: {
		conversationReadCooldownMs?: number | null;
		pageRefreshCooldownMs?: number | null;
		renavigationCooldownMs?: number | null;
	} = {},
	abortSignal?: AbortSignal,
): BrowserInteractionGovernor {
	return createBrowserInteractionGovernor({
		maxInteractionsPerMinute: maxBrowserInteractionsPerMinute,
		cooldownsByClass: {
			"conversation-read": cooldowns.conversationReadCooldownMs,
			"page-refresh": cooldowns.pageRefreshCooldownMs,
			renavigation: cooldowns.renavigationCooldownMs,
		},
		abortSignal,
	});
}

function resolveRuntimeProfileUserConfig(
	userConfig: ResolvedUserConfig,
	runtimeProfileId: string,
	provider: AccountMirrorProvider,
): ResolvedUserConfig {
	return resolveBrowserRuntimeProfileUserConfig(userConfig, {
		runtimeProfileId,
		provider,
	}) as ResolvedUserConfig;
}

export async function readBoundedProjects(
	client: Pick<BrowserAutomationClient, "listProjects">,
	maxPageReads: number,
	options: {
		tolerateReadFailure?: boolean;
		listOptions?: Parameters<BrowserAutomationClient["listProjects"]>[0];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
		providerCallTimeoutMs?: number | null;
	} = {},
): Promise<{ items: Project[]; truncated: boolean }> {
	const pageBudget = Math.max(1, Math.floor(maxPageReads));
	let projects: Project[];
	try {
		await beforeAccountMirrorBrowserInteraction(options.listOptions, options.pacer, "page-refresh");
		const providerListOptions = withAccountMirrorTabLifecycle(
			options.listOptions,
			options.listOptions !== undefined,
		);
		projects = (await (options.providerCallTimeoutMs
			? withProviderCallTimeout(
					(abortSignal) =>
						client.listProjects({ ...(providerListOptions ?? {}), abortSignal }) as Promise<
							Project[]
						>,
					options.providerCallTimeoutMs,
					"Project index discovery timed out.",
					options.listOptions?.abortSignal,
				)
			: client.listProjects(providerListOptions))) as Project[];
	} catch (error) {
		await recordAccountMirrorDomDriftObservation(options.observation, {
			surface: "account-mirror-projects",
			action: "list-projects",
			fallbackKind: options.tolerateReadFailure ? "read-failure-tolerated" : "read-failure",
			error,
		});
		if (!options.tolerateReadFailure) {
			throw error;
		}
		projects = [];
	}
	const limit = pageBudget * 25;
	return {
		items: projects.slice(0, limit),
		truncated: projects.length > limit,
	};
}

export async function readBoundedConversations(
	client: BrowserAutomationClient,
	projectId: string | null,
	maxRows: number,
	options: {
		listOptions?: Parameters<BrowserAutomationClient["listConversations"]>[1];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
		tolerateReadFailure?: boolean;
		providerCallTimeoutMs?: number | null;
	} = {},
): Promise<{ items: Conversation[]; truncated: boolean }> {
	const limit = Math.max(0, Math.floor(maxRows));
	if (limit <= 0) {
		return { items: [], truncated: true };
	}
	await beforeAccountMirrorBrowserInteraction(
		options.listOptions,
		options.pacer,
		"conversation-read",
	);
	let conversations: Conversation[];
	try {
		const providerListOptions = withAccountMirrorTabLifecycle(
			options.listOptions,
			options.listOptions !== undefined,
		);
		const read = (abortSignal?: AbortSignal) =>
			client.listConversations(projectId ?? undefined, {
				...(providerListOptions ?? {}),
				...(abortSignal ? { abortSignal } : {}),
				historyLimit: limit,
				includeHistory: true,
			}) as Promise<Conversation[]>;
		conversations = (await (options.providerCallTimeoutMs
			? withProviderCallTimeout(
					read,
					options.providerCallTimeoutMs,
					`${projectId ? "Project" : "Root"} conversation discovery timed out.`,
					options.listOptions?.abortSignal,
				)
			: read())) as Conversation[];
	} catch (error) {
		await recordAccountMirrorDomDriftObservation(options.observation, {
			surface: projectId ? "account-mirror-project-conversations" : "account-mirror-conversations",
			action: "list-conversations",
			fallbackKind: options.tolerateReadFailure ? "read-failure-tolerated" : "read-failure",
			error,
			metadata: {
				projectId,
				historyLimit: limit,
			},
		});
		if (options.tolerateReadFailure) {
			return { items: [], truncated: false };
		}
		throw error;
	}
	return {
		items: conversations.slice(0, limit),
		truncated: conversations.length > limit,
	};
}

export async function readBoundedProjectConversations(
	client: BrowserAutomationClient,
	projects: readonly Project[],
	maxRows: number,
	options: {
		listOptions?: Parameters<BrowserAutomationClient["listConversations"]>[1];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
		tolerateReadFailure?: boolean;
		abortSignal?: AbortSignal;
		cursor?: ProjectConversationHistoryCursor | null;
		maxProjectReads?: number | null;
		providerCallTimeoutMs?: number | null;
		shouldYield?: () => Promise<boolean> | boolean;
	} = {},
): Promise<{
	items: Conversation[];
	truncated: boolean;
	cursor: ProjectConversationHistoryCursor;
}> {
	const rowBudget = Math.max(0, Math.floor(maxRows));
	const readLimit = normalizeProjectConversationReadLimit(options.maxProjectReads, projects.length);
	if (rowBudget <= 0) {
		return {
			items: [],
			truncated: projects.length > 0,
			cursor: createProjectConversationCursor(options.cursor, {
				projectsLength: projects.length,
				readLimit,
				scannedProjects: 0,
			}),
		};
	}
	const conversations: Conversation[] = [];
	let remainingRows = rowBudget;
	let truncated = false;
	let projectIndex = normalizeCursorIndex(options.cursor?.nextProjectIndex, projects.length);
	let scannedProjects = 0;
	let yielded = false;
	for (; projectIndex < projects.length; projectIndex += 1) {
		throwIfCollectionAborted(options.abortSignal);
		if (scannedProjects >= readLimit) {
			truncated = true;
			break;
		}
		if (remainingRows <= 0) {
			truncated = true;
			break;
		}
		if (await options.shouldYield?.()) {
			truncated = true;
			yielded = true;
			break;
		}
		const remainingProjects = projects.length - projectIndex;
		const perProjectRows = Math.max(1, Math.ceil(remainingRows / remainingProjects));
		let result: Awaited<ReturnType<typeof readBoundedConversations>>;
		try {
			result = await readBoundedConversations(client, projects[projectIndex].id, perProjectRows, {
				listOptions: options.listOptions,
				pacer: options.pacer,
				observation: options.observation,
				tolerateReadFailure: options.tolerateReadFailure,
				providerCallTimeoutMs: options.providerCallTimeoutMs,
			});
		} catch (error) {
			if (!isKnownBackendRequestBudgetDenial(error)) throw error;
			throwIfCollectionAborted(options.abortSignal);
			const governor = options.listOptions?.providerTrafficGovernor;
			const state = governor?.snapshotAdmissionState?.();
			if (state?.backendRequestOutcome !== "budget-exhausted") throw error;
			// The interrupted project produced no qualified row. Resume this index
			// in a fresh authorized pass and retain only earlier completed reads.
			truncated = true;
			yielded = true;
			break;
		}
		scannedProjects += 1;
		conversations.push(...result.items);
		remainingRows -= result.items.length;
		truncated = truncated || result.truncated;
	}
	if (projectIndex < projects.length) {
		truncated = true;
	}
	return {
		items: conversations,
		truncated,
		cursor: createProjectConversationCursor(options.cursor, {
			projectsLength: projects.length,
			readLimit,
			scannedProjects,
			nextProjectIndex: projectIndex >= projects.length ? 0 : projectIndex,
			yielded,
		}),
	};
}

function mergeConversationsById(conversations: readonly Conversation[]): Conversation[] {
	const merged = new Map<string, Conversation>();
	for (const conversation of conversations) {
		if (!conversation.id) continue;
		const existing = merged.get(conversation.id);
		const existingMetadata = isRecord(existing?.metadata) ? existing.metadata : {};
		const incomingMetadata = isRecord(conversation.metadata) ? conversation.metadata : {};
		merged.set(conversation.id, {
			...(existing ?? {}),
			...conversation,
			metadata: {
				...existingMetadata,
				...incomingMetadata,
			},
		});
	}
	return [...merged.values()];
}

export async function readBoundedAttachmentInventory(
	client: Pick<
		BrowserAutomationClient,
		"listProjectFiles" | "listConversationFiles" | "getConversationContext"
	>,
	projects: readonly Project[],
	conversations: readonly Conversation[],
	maxRows: number,
	options:
		| number
		| {
				maxDetailReads?: number;
				cursor?: AttachmentInventoryCursor | null;
				budgetYieldCause?: AttachmentInventoryCursor["yieldCause"] | null;
				shouldYield?: () => Promise<boolean> | boolean;
				listOptions?: Parameters<BrowserAutomationClient["listProjectFiles"]>[1];
				pacer?: BrowserInteractionGovernor;
				observation?: AccountMirrorDomDriftObservationContext;
				prioritizeConversations?: boolean;
				previousFiles?: readonly FileRef[] | null;
				providerCallTimeoutMs?: number | null;
				detailReadCap?: number;
				coalesceConversationReads?: boolean;
				freshnessEpoch?: string | null;
				usePerSurfaceTrafficContext?: boolean;
				readProviderGuard?: () => Promise<string | null>;
				onDiagnosticEvent?: (event: AccountMirrorCollectorDiagnosticEvent) => Promise<void> | void;
				onCheckpoint?: (cursor: AttachmentInventoryCursor) => Promise<void> | void;
		  } = 6,
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	media: AccountMirrorMediaManifestEntry[];
	visitBundles: ConversationVisitBundle[];
	truncated: boolean;
	cursor: AttachmentInventoryCursor;
	progress: AttachmentInventoryProgress;
}> {
	const limit = Math.max(0, Math.floor(maxRows));
	const maxDetailReads = typeof options === "number" ? options : (options.maxDetailReads ?? 6);
	const previousCursor = typeof options === "number" ? null : (options.cursor ?? null);
	const budgetYieldCause = typeof options === "number" ? null : (options.budgetYieldCause ?? null);
	const shouldYield = typeof options === "number" ? undefined : options.shouldYield;
	const listOptions = typeof options === "number" ? undefined : options.listOptions;
	const pacer = typeof options === "number" ? undefined : options.pacer;
	const observation = typeof options === "number" ? undefined : options.observation;
	const prioritizeConversations =
		typeof options === "number" ? false : options.prioritizeConversations === true;
	const previousFiles = typeof options === "number" ? [] : (options.previousFiles ?? []);
	const providerCallTimeoutMs =
		typeof options === "number" ? null : (options.providerCallTimeoutMs ?? null);
	const detailReadCap = typeof options === "number" ? 6 : Math.max(1, options.detailReadCap ?? 6);
	const coalesceConversationReads =
		typeof options === "number" ? false : options.coalesceConversationReads === true;
	const freshnessEpoch =
		typeof options === "number" ? null : options.freshnessEpoch?.trim() || null;
	const usePerSurfaceTrafficContext =
		typeof options === "number" ? false : options.usePerSurfaceTrafficContext === true;
	const readProviderGuard = typeof options === "number" ? undefined : options.readProviderGuard;
	const onDiagnosticEvent = typeof options === "number" ? undefined : options.onDiagnosticEvent;
	const onCheckpoint = typeof options === "number" ? undefined : options.onCheckpoint;
	const detailReadLimit = Math.max(0, Math.min(detailReadCap, Math.floor(maxDetailReads)));
	const reportDiagnostic = async (
		event: Omit<AccountMirrorCollectorDiagnosticEvent, "observedAt">,
	): Promise<void> => {
		await onDiagnosticEvent?.({ ...event, observedAt: new Date().toISOString() });
	};
	if (limit <= 0 || detailReadLimit <= 0) {
		const budgetYielded =
			limit > 0 &&
			detailReadLimit <= 0 &&
			budgetYieldCause !== null &&
			(projects.length > 0 || conversations.length > 0);
		return {
			artifacts: [],
			files: [],
			media: [],
			visitBundles: [],
			truncated: projects.length > 0 || conversations.length > 0,
			cursor: createAttachmentInventoryCursor(previousCursor, {
				projectsLength: projects.length,
				conversationsLength: conversations.length,
				detailReadLimit,
				scannedProjects: 0,
				scannedConversations: 0,
				yielded: budgetYielded,
				yieldCause: budgetYielded ? budgetYieldCause : null,
			}),
			progress: createAttachmentInventoryProgress(),
		};
	}
	const artifacts = new Map<string, ConversationArtifact>();
	const files = new Map<string, FileRef>();
	const progress = createAttachmentInventoryProgress();
	const visitBundles: ConversationVisitBundle[] = [];
	let remaining = limit;
	let remainingDetailReads = detailReadLimit;
	let truncated = false;
	let yielded = false;
	let projectIndex = normalizeCursorIndex(previousCursor?.nextProjectIndex, projects.length);
	let conversationIndex = normalizeCursorIndex(
		previousCursor?.nextConversationIndex,
		conversations.length,
	);
	let scannedProjects = 0;
	let scannedConversations = 0;
	let consecutiveConversationTimeouts = 0;
	let consecutiveUnresolvedConversations = 0;
	let conversationDetailCursor: AttachmentInventoryCursor["conversationDetail"] = null;

	const scanProjects = async () => {
		for (; projectIndex < projects.length; projectIndex += 1) {
			if (remaining <= 0 || remainingDetailReads <= 0) {
				truncated = true;
				if (remainingDetailReads <= 0 && budgetYieldCause !== null) {
					yielded = true;
				}
				break;
			}
			if (await shouldYield?.()) {
				truncated = true;
				yielded = true;
				break;
			}
			const project = projects[projectIndex];
			if (!project) break;
			const projectListOptions = usePerSurfaceTrafficContext
				? withDetailProviderTrafficContext(
						listOptions,
						createAccountMirrorProviderTrafficWorkKey("project", project.id),
					)
				: listOptions;
			remainingDetailReads -= 1;
			scannedProjects += 1;
			progress.scannedProjectIds.push(project.id);
			const stageStartedAt = performance.now();
			await reportDiagnostic({ stage: "project-files", event: "started", projectId: project.id });
			let projectFiles: FileRef[];
			try {
				projectFiles = await safeReadProjectFiles(
					client,
					project,
					projectListOptions,
					observation,
					providerCallTimeoutMs,
					pacer,
				);
			} catch (error) {
				if (!isKnownBackendRequestBudgetDenial(error)) throw error;
				await throwIfDetailProviderGuardObserved(readProviderGuard, project.id);
				throwIfCollectionAborted(projectListOptions?.abortSignal);
				if (
					projectListOptions?.providerTrafficGovernor?.snapshotAdmissionState?.()
						.backendRequestOutcome !== "budget-exhausted"
				)
					throw error;
				truncated = true;
				yielded = true;
				break;
			}
			await reportDiagnostic({
				stage: "project-files",
				event: "completed",
				projectId: project.id,
				elapsedMs: performance.now() - stageStartedAt,
				providerCallTimeoutMs,
			});
			await throwIfDetailProviderGuardObserved(readProviderGuard, project.id);
			for (const file of projectFiles) {
				if (remaining <= 0) {
					truncated = true;
					break;
				}
				addFile(files, file, { projectId: project.id, source: "project" });
				remaining -= 1;
			}
			await onCheckpoint?.(
				createAttachmentInventoryCursor(previousCursor, {
					projectsLength: projects.length,
					conversationsLength: conversations.length,
					detailReadLimit,
					scannedProjects,
					scannedConversations,
					nextProjectIndex: projectIndex + 1,
					nextConversationIndex: conversationIndex,
				}),
			);
		}
	};

	const scanConversations = async () => {
		for (; !yielded && conversationIndex < conversations.length; conversationIndex += 1) {
			if (remaining <= 0 || remainingDetailReads <= 0) {
				truncated = true;
				if (remainingDetailReads <= 0 && budgetYieldCause !== null) {
					yielded = true;
				}
				break;
			}
			if (await shouldYield?.()) {
				truncated = true;
				yielded = true;
				break;
			}
			const conversation = conversations[conversationIndex];
			if (!conversation) break;
			const conversationListOptions = usePerSurfaceTrafficContext
				? withDetailProviderTrafficContext(
						listOptions,
						createAccountMirrorProviderTrafficWorkKey("conversation", conversation.id),
					)
				: listOptions;
			const previousConversationDetail =
				previousCursor?.conversationDetail?.conversationId === conversation.id
					? previousCursor.conversationDetail
					: null;
			remainingDetailReads -= 1;
			scannedConversations += 1;
			progress.scannedConversationIds.push(conversation.id);
			let conversationFileResult: Awaited<ReturnType<typeof safeReadConversationFiles>> | null =
				null;
			if (!coalesceConversationReads) {
				const fileStageStartedAt = performance.now();
				await reportDiagnostic({
					stage: "conversation-files",
					event: "started",
					conversationId: conversation.id,
					projectId: conversation.projectId,
					providerCallTimeoutMs,
				});
				conversationFileResult = await safeReadConversationFiles(
					client,
					conversation,
					observation,
					providerCallTimeoutMs,
					conversationListOptions,
					pacer,
				);
				await reportDiagnostic({
					stage: "conversation-files",
					event: conversationFileResult.outcome,
					conversationId: conversation.id,
					projectId: conversation.projectId,
					elapsedMs: performance.now() - fileStageStartedAt,
					providerCallTimeoutMs,
					detail: conversationFileResult.detail,
				});
				if (isProviderGuardFailureDetail(conversationFileResult.detail)) {
					throw new Error(
						`Detail provider read stopped by provider guard for ${conversation.id}: ${conversationFileResult.detail}`,
					);
				}
				await throwIfDetailProviderGuardObserved(readProviderGuard, conversation.id);
			}
			const stageStartedAt = performance.now();
			await reportDiagnostic({
				stage: "conversation-context",
				event: "started",
				conversationId: conversation.id,
				projectId: conversation.projectId,
				providerCallTimeoutMs,
			});
			const telemetryBefore = snapshotAccountMirrorVisitTelemetry(
				conversationListOptions?.scrapeTelemetry,
			);
			let contextResult: Awaited<ReturnType<typeof safeReadConversationContext>>;
			try {
				contextResult = await safeReadConversationContext(
					client,
					conversation,
					observation,
					providerCallTimeoutMs,
					conversationListOptions,
					previousConversationDetail,
					pacer,
				);
			} catch (error) {
				if (!isKnownBackendRequestBudgetDenial(error)) throw error;
				await throwIfDetailProviderGuardObserved(readProviderGuard, conversation.id);
				throwIfCollectionAborted(conversationListOptions?.abortSignal);
				if (
					conversationListOptions?.providerTrafficGovernor?.snapshotAdmissionState?.()
						.backendRequestOutcome !== "budget-exhausted"
				)
					throw error;
				conversationDetailCursor = previousConversationDetail;
				truncated = true;
				yielded = true;
				break;
			}
			const telemetryAfter = snapshotAccountMirrorVisitTelemetry(
				conversationListOptions?.scrapeTelemetry,
			);
			await reportDiagnostic({
				stage: "conversation-context",
				event: contextResult.outcome,
				conversationId: conversation.id,
				projectId: conversation.projectId,
				elapsedMs: performance.now() - stageStartedAt,
				providerCallTimeoutMs,
				detail: contextResult.detail,
			});
			if (isProviderGuardFailureDetail(contextResult.detail)) {
				throw new Error(
					`Detail provider read stopped by provider guard for ${conversation.id}: ${contextResult.detail}`,
				);
			}
			await throwIfDetailProviderGuardObserved(readProviderGuard, conversation.id);
			const context = contextResult.context;
			const contextChunk = readAccountMirrorContextChunkMetadata(context);
			if (freshnessEpoch) {
				visitBundles.push(
					createConversationVisitBundle({
						conversationId: conversation.id,
						freshnessEpoch,
						context,
						detailComplete: contextChunk?.nextMessageIndex == null,
						before: telemetryBefore,
						after: telemetryAfter,
					}),
				);
			}
			const conversationFiles = coalesceConversationReads
				? (context?.files ?? [])
				: (conversationFileResult?.files ?? []);
			const knownConversationFiles =
				conversationFiles.length > 0
					? []
					: selectPreviousConversationFiles(previousFiles, conversation);
			if (context && contextChunk?.nextMessageIndex == null) {
				progress.contextObservedConversationIds.push(conversation.id);
				if (coalesceConversationReads || conversationFileResult?.observed) {
					progress.detailObservedConversationIds.push(conversation.id);
				}
			}
			if (contextChunk?.nextMessageIndex !== null && contextChunk?.nextMessageIndex !== undefined) {
				conversationDetailCursor = {
					conversationId: conversation.id,
					nextMessageIndex: contextChunk.nextMessageIndex,
					messageLimit: contextChunk.maxMessages,
					totalMessages: contextChunk.totalMessages,
				};
			}
			if (conversationFiles.length > 0 || knownConversationFiles.length > 0) {
				progress.fileBearingConversationIds.push(conversation.id);
			}
			if ((context?.artifacts ?? []).length > 0) {
				progress.artifactBearingConversationIds.push(conversation.id);
			}
			for (const file of [...conversationFiles, ...knownConversationFiles]) {
				if (remaining <= 0) {
					truncated = true;
					break;
				}
				addFile(files, file, {
					conversationId: conversation.id,
					projectId: conversation.projectId,
					source: "conversation",
				});
				remaining -= 1;
			}
			for (const artifact of context?.artifacts ?? []) {
				if (remaining <= 0) {
					truncated = true;
					break;
				}
				addArtifact(artifacts, artifact, conversation);
				remaining -= 1;
			}
			if (conversationDetailCursor) {
				truncated = true;
			}
			await onCheckpoint?.(
				createAttachmentInventoryCursor(previousCursor, {
					projectsLength: projects.length,
					conversationsLength: conversations.length,
					detailReadLimit,
					scannedProjects,
					scannedConversations,
					nextProjectIndex: projectIndex,
					nextConversationIndex: conversationDetailCursor
						? conversationIndex
						: conversationIndex + 1,
					conversationDetail: conversationDetailCursor,
				}),
			);
			if (
				contextResult.outcome === "timed_out" &&
				(coalesceConversationReads || conversationFileResult?.outcome === "timed_out")
			) {
				consecutiveConversationTimeouts += 1;
			} else {
				consecutiveConversationTimeouts = 0;
			}
			if (
				contextResult.outcome !== "completed" &&
				!coalesceConversationReads &&
				conversationFileResult?.outcome !== "completed"
			) {
				consecutiveUnresolvedConversations += 1;
			} else {
				consecutiveUnresolvedConversations = 0;
			}
			if (consecutiveConversationTimeouts >= 3) {
				// Detail reads are resumable and read-only. Preserve the checkpoint and
				// yield this pass instead of converting transient provider slowness into
				// a fatal live-follow operation failure.
				conversationIndex += 1;
				truncated = true;
				yielded = true;
				break;
			}
			if (consecutiveUnresolvedConversations >= 3) {
				throw new Error(
					`Detail provider reads failed for ${consecutiveUnresolvedConversations} consecutive conversations; last=${conversation.id}; files=${conversationFileResult?.outcome ?? "coalesced"}:${conversationFileResult?.detail ?? "unknown"}; context=${contextResult.outcome}:${contextResult.detail ?? "unknown"}.`,
				);
			}
			if (conversationDetailCursor) break;
		}
	};

	if (prioritizeConversations) {
		await scanConversations();
		if (!yielded) await scanProjects();
	} else {
		await scanProjects();
		if (!yielded) await scanConversations();
	}

	if (projectIndex < projects.length || conversationIndex < conversations.length) {
		truncated = true;
	}

	return {
		artifacts: [...artifacts.values()],
		files: [...files.values()],
		media: [],
		visitBundles,
		truncated,
		cursor: createAttachmentInventoryCursor(previousCursor, {
			projectsLength: projects.length,
			conversationsLength: conversations.length,
			detailReadLimit,
			scannedProjects,
			scannedConversations,
			nextProjectIndex:
				projectIndex >= projects.length && conversationIndex >= conversations.length
					? 0
					: projectIndex,
			nextConversationIndex:
				conversationDetailCursor !== null
					? conversationIndex
					: projectIndex >= projects.length && conversationIndex >= conversations.length
						? 0
						: conversationIndex,
			conversationDetail: conversationDetailCursor,
			yielded,
			yieldCause: yielded && budgetYieldCause !== null ? budgetYieldCause : null,
		}),
		progress,
	};
}

function createAttachmentInventoryProgress(): AttachmentInventoryProgress {
	return {
		scannedProjectIds: [],
		scannedConversationIds: [],
		detailObservedConversationIds: [],
		contextObservedConversationIds: [],
		artifactBearingConversationIds: [],
		fileBearingConversationIds: [],
	};
}

function annotateConversationDetailObservedAt(
	conversation: Conversation,
	observedAt: string,
): Conversation {
	const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
	return {
		...conversation,
		metadata: {
			...metadata,
			detailObservedAt: observedAt,
			manifestObservedAt: observedAt,
			detailCompleteness: "complete",
		},
	};
}

function hasAttachmentInventoryProgress(
	value: unknown,
): value is { progress: AttachmentInventoryProgress } {
	return (
		typeof value === "object" &&
		value !== null &&
		"progress" in value &&
		isAttachmentInventoryProgress((value as { progress?: unknown }).progress)
	);
}

function readConversationVisitBundles(value: unknown): ConversationVisitBundle[] {
	if (typeof value !== "object" || value === null || !("visitBundles" in value)) return [];
	const bundles = (value as { visitBundles?: unknown }).visitBundles;
	return Array.isArray(bundles) ? (bundles as ConversationVisitBundle[]) : [];
}

function isAttachmentInventoryProgress(value: unknown): value is AttachmentInventoryProgress {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Partial<Record<keyof AttachmentInventoryProgress, unknown>>;
	return (
		Array.isArray(record.scannedProjectIds) &&
		Array.isArray(record.scannedConversationIds) &&
		Array.isArray(record.detailObservedConversationIds) &&
		Array.isArray(record.contextObservedConversationIds) &&
		Array.isArray(record.artifactBearingConversationIds) &&
		Array.isArray(record.fileBearingConversationIds)
	);
}

export async function readBoundedChatgptDetailInventory(
	client: Pick<
		BrowserAutomationClient,
		"listAccountFiles" | "listProjectFiles" | "listConversationFiles" | "getConversationContext"
	>,
	projects: readonly Project[],
	conversations: readonly Conversation[],
	maxRows: number,
	options:
		| number
		| {
				maxDetailReads?: number;
				cursor?: AttachmentInventoryCursor | null;
				budgetYieldCause?: AttachmentInventoryCursor["yieldCause"] | null;
				shouldYield?: () => Promise<boolean> | boolean;
				listOptions?: Parameters<BrowserAutomationClient["listAccountFiles"]>[0];
				pacer?: BrowserInteractionGovernor;
				observation?: AccountMirrorDomDriftObservationContext;
				providerCallTimeoutMs?: number | null;
				detailReadCap?: number;
				onDiagnosticEvent?: (event: AccountMirrorCollectorDiagnosticEvent) => Promise<void> | void;
				onCheckpoint?: (cursor: AttachmentInventoryCursor) => Promise<void> | void;
				prioritizeConversations?: boolean;
				previousFiles?: readonly FileRef[] | null;
				skipAccountLibraryInventory?: boolean;
				freshnessEpoch?: string | null;
				usePerSurfaceTrafficContext?: boolean;
				readProviderGuard?: () => Promise<string | null>;
		  } = 6,
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	media: AccountMirrorMediaManifestEntry[];
	visitBundles: ConversationVisitBundle[];
	truncated: boolean;
	cursor: AttachmentInventoryCursor;
	progress: AttachmentInventoryProgress;
}> {
	const limit = Math.max(0, Math.floor(maxRows));
	const listOptions = typeof options === "number" ? undefined : options.listOptions;
	const pacer = typeof options === "number" ? undefined : options.pacer;
	const observation = typeof options === "number" ? undefined : options.observation;
	const prioritizeConversations =
		typeof options === "number" ? false : options.prioritizeConversations === true;
	const skipAccountLibraryInventory =
		typeof options === "number" ? false : options.skipAccountLibraryInventory === true;
	const providerCallTimeoutMs =
		typeof options === "number"
			? CHATGPT_DETAIL_READ_TIMEOUT_MS
			: (options.providerCallTimeoutMs ?? CHATGPT_DETAIL_READ_TIMEOUT_MS);
	const hasAttachmentSurfaces = projects.length > 0 || conversations.length > 0;
	const libraryListOptions =
		typeof options !== "number" && options.usePerSurfaceTrafficContext
			? withDetailProviderTrafficContext(listOptions, "scope:account-library")
			: listOptions;
	let library: Awaited<ReturnType<typeof readBoundedChatgptLibraryInventory>>;
	try {
		library = skipAccountLibraryInventory
			? { artifacts: [], files: [], truncated: false }
			: await readBoundedChatgptLibraryInventory(client, limit, {
					listOptions: libraryListOptions,
					pacer,
					observation,
					providerCallTimeoutMs,
				});
	} catch (error) {
		if (!isKnownBackendRequestBudgetDenial(error)) throw error;
		if (typeof options !== "number")
			await throwIfDetailProviderGuardObserved(options.readProviderGuard, "account-library");
		throwIfCollectionAborted(libraryListOptions?.abortSignal);
		if (
			libraryListOptions?.providerTrafficGovernor?.snapshotAdmissionState?.()
				.backendRequestOutcome !== "budget-exhausted"
		)
			throw error;
		return {
			artifacts: [],
			files: [],
			media: [],
			visitBundles: [],
			truncated: true,
			cursor: createAttachmentInventoryCursor(typeof options === "number" ? null : options.cursor, {
				projectsLength: projects.length,
				conversationsLength: conversations.length,
				detailReadLimit: 0,
				conversationDetail: typeof options === "number" ? null : options.cursor?.conversationDetail,
				scannedProjects: 0,
				scannedConversations: 0,
				yielded: true,
				yieldCause: {
					observedAt: null,
					ownerCommand: null,
					kind: "backend-request-budget",
					operationClass: "backend-request",
				},
			}),
			progress: createAttachmentInventoryProgress(),
		};
	}
	if (typeof options !== "number") {
		await throwIfDetailProviderGuardObserved(options.readProviderGuard, "account-library");
	}
	const remainingRows =
		hasAttachmentSurfaces && limit > 0
			? Math.max(1, limit - library.files.length)
			: Math.max(0, limit - library.files.length);
	const attachmentInventory = await readBoundedAttachmentInventory(
		client,
		projects,
		conversations,
		remainingRows,
		typeof options === "number"
			? {
					maxDetailReads: options,
					providerCallTimeoutMs,
				}
			: {
					...options,
					coalesceConversationReads: true,
					prioritizeConversations,
					previousFiles: options.previousFiles,
					budgetYieldCause: options.budgetYieldCause,
					providerCallTimeoutMs,
				},
	);
	return {
		artifacts: mergeConversationArtifacts(library.artifacts, attachmentInventory.artifacts),
		files: mergeFileRefs(library.files, attachmentInventory.files),
		media: [],
		visitBundles: attachmentInventory.visitBundles,
		truncated: library.truncated || attachmentInventory.truncated,
		cursor: attachmentInventory.cursor,
		progress: attachmentInventory.progress,
	};
}

async function throwIfDetailProviderGuardObserved(
	readProviderGuard: (() => Promise<string | null>) | undefined,
	targetId: string,
): Promise<void> {
	const detail = await readProviderGuard?.();
	if (!detail) return;
	throw new Error(`Detail provider read stopped by provider guard for ${targetId}: ${detail}`);
}

async function readActiveChatgptRateLimitReason(runtimeProfileId: string): Promise<string | null> {
	const state = await readChatgptRateLimitGuardState({ profileName: runtimeProfileId });
	if (!state?.cooldownUntil || state.cooldownUntil <= Date.now()) return null;
	return state.cooldownReason?.trim() || "ChatGPT rate limit cooldown is active.";
}

export async function readBoundedChatgptLibraryInventory(
	client: Pick<BrowserAutomationClient, "listAccountFiles">,
	maxRows: number,
	options: {
		listOptions?: Parameters<BrowserAutomationClient["listAccountFiles"]>[0];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
		providerCallTimeoutMs?: number | null;
	} = {},
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	truncated: boolean;
}> {
	const limit = Math.max(0, Math.floor(maxRows));
	if (limit <= 0) {
		return {
			artifacts: [],
			files: [],
			truncated: true,
		};
	}
	const files = await safeReadAccountFiles(
		client,
		options.listOptions,
		options.observation,
		{
			surface: "account-mirror-library",
			action: "list-account-files",
		},
		options.providerCallTimeoutMs,
		true,
		options.pacer,
	);
	const boundedFiles = files.slice(0, limit);
	return {
		artifacts: mapChatgptLibraryFilesToArtifacts(boundedFiles),
		files: boundedFiles,
		truncated: files.length > limit,
	};
}

export async function readBoundedGeminiDetailInventory(
	client: Pick<
		BrowserAutomationClient,
		"listProjectFiles" | "listConversationFiles" | "getConversationContext"
	>,
	projects: readonly Project[],
	conversations: readonly Conversation[],
	maxRows: number,
	options: {
		maxDetailReads?: number;
		cursor?: AttachmentInventoryCursor | null;
		budgetYieldCause?: AttachmentInventoryCursor["yieldCause"] | null;
		shouldYield?: () => Promise<boolean> | boolean;
		listOptions?: Parameters<BrowserAutomationClient["listProjectFiles"]>[1];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
	} = {},
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	media: AccountMirrorMediaManifestEntry[];
	truncated: boolean;
	cursor: AttachmentInventoryCursor;
	progress: AttachmentInventoryProgress;
}> {
	const inventory = await readBoundedAttachmentInventory(client, projects, conversations, maxRows, {
		...options,
		prioritizeConversations: true,
		budgetYieldCause: options.budgetYieldCause,
		providerCallTimeoutMs: GEMINI_DETAIL_READ_TIMEOUT_MS,
	});
	return {
		...inventory,
		media: mapGeminiConversationArtifactsToMediaManifest(inventory.artifacts),
	};
}

export async function readBoundedGrokAccountFileInventory(
	client: Pick<BrowserAutomationClient, "listAccountFiles">,
	maxRows: number,
	options: {
		listOptions?: Parameters<BrowserAutomationClient["listAccountFiles"]>[0];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
	} = {},
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	media: AccountMirrorMediaManifestEntry[];
	truncated: boolean;
	cursor: null;
}> {
	const limit = Math.max(0, Math.floor(maxRows));
	if (limit <= 0) {
		return {
			artifacts: [],
			files: [],
			media: [],
			truncated: true,
			cursor: null,
		};
	}
	const files = await safeReadAccountFiles(
		client,
		options.listOptions,
		options.observation,
		{
			surface: "account-mirror-account-files",
			action: "list-account-files",
		},
		null,
		false,
		options.pacer,
	);
	const boundedFiles = files.slice(0, limit);
	return {
		artifacts: [],
		files: boundedFiles,
		media: mapGrokAccountFilesToMediaManifest(boundedFiles),
		truncated: files.length > limit,
		cursor: null,
	};
}

export async function readBoundedGrokDetailInventory(
	client: Pick<
		BrowserAutomationClient,
		"listAccountFiles" | "listProjectFiles" | "listConversationFiles" | "getConversationContext"
	>,
	conversations: readonly Conversation[],
	maxRows: number,
	options: {
		maxDetailReads?: number;
		cursor?: AttachmentInventoryCursor | null;
		budgetYieldCause?: AttachmentInventoryCursor["yieldCause"] | null;
		shouldYield?: () => Promise<boolean> | boolean;
		listOptions?: Parameters<BrowserAutomationClient["listAccountFiles"]>[0];
		pacer?: BrowserInteractionGovernor;
		observation?: AccountMirrorDomDriftObservationContext;
	} = {},
): Promise<{
	artifacts: ConversationArtifact[];
	files: FileRef[];
	media: AccountMirrorMediaManifestEntry[];
	truncated: boolean;
	cursor: AttachmentInventoryCursor;
	progress: AttachmentInventoryProgress;
}> {
	const limit = Math.max(0, Math.floor(maxRows));
	const accountFiles = await readBoundedGrokAccountFileInventory(client, limit, {
		listOptions: options.listOptions,
		pacer: options.pacer,
		observation: options.observation,
	});
	const remainingRows =
		conversations.length > 0 && limit > 0
			? Math.max(1, limit - accountFiles.files.length)
			: Math.max(0, limit - accountFiles.files.length);
	const conversationInventory = await readBoundedAttachmentInventory(
		client,
		[],
		conversations,
		remainingRows,
		{
			maxDetailReads: options.maxDetailReads,
			cursor: options.cursor,
			budgetYieldCause: options.budgetYieldCause,
			shouldYield: options.shouldYield,
			listOptions: options.listOptions,
			pacer: options.pacer,
			observation: options.observation,
			prioritizeConversations: true,
		},
	);
	return {
		artifacts: conversationInventory.artifacts,
		files: mergeFileRefs(accountFiles.files, conversationInventory.files),
		media: accountFiles.media,
		truncated: accountFiles.truncated || conversationInventory.truncated,
		cursor: conversationInventory.cursor,
		progress: conversationInventory.progress,
	};
}

function selectPreviousConversationFiles(
	files: readonly FileRef[],
	conversation: Conversation,
): FileRef[] {
	return files.filter((file) => {
		if (file.source !== "conversation") return false;
		const metadata = isRecord(file.metadata) ? file.metadata : {};
		const metadataConversationId =
			typeof metadata.conversationId === "string" ? metadata.conversationId : null;
		return metadataConversationId === conversation.id || file.id.startsWith(`${conversation.id}:`);
	});
}

function createAttachmentInventoryCursor(
	previous: AttachmentInventoryCursor | null | undefined,
	input: {
		projectsLength: number;
		conversationsLength: number;
		detailReadLimit: number;
		scannedProjects: number;
		scannedConversations: number;
		nextProjectIndex?: number;
		nextConversationIndex?: number;
		conversationDetail?: AttachmentInventoryCursor["conversationDetail"];
		yielded?: boolean;
		yieldCause?: AttachmentInventoryCursor["yieldCause"] | null;
	},
): AttachmentInventoryCursor {
	return {
		nextProjectIndex: normalizeCursorIndex(
			input.nextProjectIndex ?? previous?.nextProjectIndex,
			input.projectsLength,
		),
		nextConversationIndex: normalizeCursorIndex(
			input.nextConversationIndex ?? previous?.nextConversationIndex,
			input.conversationsLength,
		),
		detailReadLimit: input.detailReadLimit,
		scannedProjects: input.scannedProjects,
		scannedConversations: input.scannedConversations,
		conversationDetail: input.conversationDetail ?? null,
		yielded: input.yielded === true,
		yieldCause: input.yieldCause ?? null,
	};
}

function normalizeCursorIndex(value: number | null | undefined, length: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
	const index = Math.floor(value);
	return length > 0 ? Math.min(index, length) : 0;
}

function normalizeProjectConversationReadLimit(
	value: number | null | undefined,
	projectsLength: number,
): number {
	if (projectsLength <= 0) return 0;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return projectsLength;
	return Math.max(1, Math.min(projectsLength, Math.floor(value)));
}

function createProjectConversationCursor(
	previous: ProjectConversationHistoryCursor | null | undefined,
	input: {
		projectsLength: number;
		readLimit: number;
		scannedProjects: number;
		nextProjectIndex?: number;
		yielded?: boolean;
	},
): ProjectConversationHistoryCursor {
	return {
		nextProjectIndex: normalizeCursorIndex(
			input.nextProjectIndex ?? previous?.nextProjectIndex,
			input.projectsLength,
		),
		readLimit: input.readLimit,
		scannedProjects: input.scannedProjects,
		yielded: input.yielded === true,
	};
}

function rethrowProviderRequestFailure(
	error: unknown,
	listOptions?: BrowserProviderListOptions,
): void {
	const requestState =
		listOptions?.providerTrafficGovernor?.snapshotAdmissionState?.().backendRequestOutcome;
	if (isKnownBackendRequestBudgetDenial(error) || (requestState && requestState !== "ready"))
		throw error;
}

async function safeReadProjectFiles(
	client: Pick<BrowserAutomationClient, "listProjectFiles">,
	project: Project,
	listOptions?: Parameters<BrowserAutomationClient["listProjectFiles"]>[1],
	observation?: AccountMirrorDomDriftObservationContext,
	timeoutMs?: number | null,
	pacer?: BrowserInteractionGovernor,
): Promise<FileRef[]> {
	try {
		await beforeAccountMirrorBrowserInteraction(listOptions, pacer, "renavigation");
		const providerListOptions = withAccountMirrorTabLifecycle(
			listOptions,
			project.provider === "chatgpt",
		);
		return await withProviderCallTimeout(
			(abortSignal) =>
				client.listProjectFiles(project.id, {
					...(providerListOptions ?? {}),
					abortSignal,
				}),
			timeoutMs,
			`Project file inventory timed out for ${project.id}.`,
			listOptions?.abortSignal,
		);
	} catch (error) {
		rethrowProviderRequestFailure(error, listOptions);
		await recordAccountMirrorDomDriftObservation(observation, {
			surface: "account-mirror-project-files",
			action: "list-project-files",
			fallbackKind: "read-failure-tolerated",
			error,
			metadata: { projectId: project.id },
		});
		return [];
	}
}

async function safeReadAccountFiles(
	client: Pick<BrowserAutomationClient, "listAccountFiles">,
	listOptions?: Parameters<BrowserAutomationClient["listAccountFiles"]>[0],
	observation?: AccountMirrorDomDriftObservationContext,
	input: {
		surface: string;
		action: string;
	} = {
		surface: "account-mirror-account-files",
		action: "list-account-files",
	},
	timeoutMs?: number | null,
	useAccountMirrorTabLifecycle = false,
	pacer?: BrowserInteractionGovernor,
): Promise<FileRef[]> {
	try {
		await beforeAccountMirrorBrowserInteraction(listOptions, pacer, "page-refresh");
		const providerListOptions = withAccountMirrorTabLifecycle(
			listOptions,
			useAccountMirrorTabLifecycle,
		);
		return await withProviderCallTimeout(
			(abortSignal) =>
				client.listAccountFiles({
					...(providerListOptions ?? {}),
					abortSignal,
				}),
			timeoutMs,
			`Account file inventory timed out for ${input.surface}.`,
			listOptions?.abortSignal,
		);
	} catch (error) {
		rethrowProviderRequestFailure(error, listOptions);
		await recordAccountMirrorDomDriftObservation(observation, {
			surface: input.surface,
			action: input.action,
			fallbackKind: "read-failure-tolerated",
			error,
		});
		return [];
	}
}

async function safeReadConversationFiles(
	client: Pick<BrowserAutomationClient, "listConversationFiles">,
	conversation: Conversation,
	observation?: AccountMirrorDomDriftObservationContext,
	timeoutMs?: number | null,
	listOptions?: BrowserProviderListOptions,
	pacer?: BrowserInteractionGovernor,
): Promise<{
	files: FileRef[];
	observed: boolean;
	outcome: "completed" | "failed" | "timed_out" | "aborted";
	detail: string | null;
}> {
	try {
		await beforeAccountMirrorBrowserInteraction(listOptions, pacer, "conversation-read");
		const providerListOptions = withAccountMirrorTabLifecycle(
			listOptions,
			conversation.provider === "chatgpt",
		);
		const files = await withProviderCallTimeout(
			(abortSignal) =>
				client.listConversationFiles(conversation.id, {
					projectId: conversation.projectId,
					listOptions: { ...(providerListOptions ?? {}), abortSignal },
				}),
			timeoutMs,
			`Conversation file inventory timed out for ${conversation.id}.`,
			listOptions?.abortSignal,
		);
		return { files, observed: true, outcome: "completed", detail: null };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		await recordAccountMirrorDomDriftObservation(observation, {
			surface: "account-mirror-conversation-files",
			action: "list-conversation-files",
			fallbackKind: "read-failure-tolerated",
			error,
			metadata: {
				conversationId: conversation.id,
				projectId: conversation.projectId ?? null,
			},
		});
		return {
			files: [],
			observed: false,
			outcome: listOptions?.abortSignal?.aborted
				? "aborted"
				: /timed out/i.test(detail)
					? "timed_out"
					: "failed",
			detail,
		};
	}
}

async function safeReadConversationContext(
	client: Pick<BrowserAutomationClient, "getConversationContext">,
	conversation: Conversation,
	observation?: AccountMirrorDomDriftObservationContext,
	timeoutMs?: number | null,
	listOptions?: BrowserProviderListOptions,
	cursor?: AttachmentInventoryCursor["conversationDetail"] | null,
	pacer?: BrowserInteractionGovernor,
): Promise<{
	context: ConversationContext | null;
	observed: boolean;
	outcome: "completed" | "failed" | "timed_out" | "aborted";
	detail: string | null;
}> {
	let providerListOptions: BrowserProviderListOptions | undefined;
	try {
		await beforeAccountMirrorBrowserInteraction(listOptions, pacer, "conversation-read");
		const isChatgpt = conversation.provider === "chatgpt";
		const isChatgptChunkContinuation =
			isChatgpt && cursor?.conversationId === conversation.id && cursor.nextMessageIndex > 0;
		const chunk = isChatgpt
			? {
					startMessageIndex:
						cursor?.conversationId === conversation.id ? cursor.nextMessageIndex : 0,
					maxMessages:
						cursor?.conversationId === conversation.id
							? cursor.messageLimit
							: CHATGPT_CONTEXT_CHUNK_MESSAGE_LIMIT,
				}
			: null;
		providerListOptions = withAccountMirrorTabLifecycle(listOptions, isChatgpt);
		if (isChatgpt) {
			providerListOptions = {
				...(providerListOptions ?? {}),
				useProviderSession: true,
				accountMirrorSingleConversationVisit: true,
				providerSession: listOptions?.providerSession,
				// The first chunk may perform one governed recovery mutation. A continuation
				// must reuse that retained target and stay direct-fetch-only so pagination
				// cannot physically reload the same conversation route again.
				preserveActiveTab:
					isChatgptChunkContinuation && listOptions?.providerSession
						? true
						: providerListOptions?.preserveActiveTab === true,
			};
		}
		const context = await withProviderCallTimeout(
			(abortSignal) => {
				providerListOptions = {
					...(providerListOptions ?? {}),
					abortSignal,
					...(chunk ? { accountMirrorContextChunk: chunk } : {}),
				};
				return client.getConversationContext(conversation.id, {
					projectId: conversation.projectId,
					refresh: true,
					...(isChatgpt
						? {
								allowCacheFallback: false,
								retryAttempts: 0,
								...(typeof timeoutMs === "number" && timeoutMs > 0 ? { timeoutMs } : {}),
							}
						: {}),
					listOptions: providerListOptions,
				});
			},
			timeoutMs,
			`Conversation context inventory timed out for ${conversation.id}.`,
			listOptions?.abortSignal,
		);
		if (isChatgpt) {
			const contextChunk = readAccountMirrorContextChunkMetadata(context);
			const hasMoreChunks = contextChunk?.nextMessageIndex != null;
			if (hasMoreChunks && listOptions) {
				listOptions.providerSession = providerListOptions?.providerSession;
			} else {
				await closeAccountMirrorProviderSession(providerListOptions);
				if (listOptions) listOptions.providerSession = undefined;
			}
		}
		return { context, observed: context !== null, outcome: "completed", detail: null };
	} catch (error) {
		await closeAccountMirrorProviderSession(providerListOptions);
		if (listOptions) listOptions.providerSession = undefined;
		rethrowProviderRequestFailure(error, listOptions);
		const detail = error instanceof Error ? error.message : String(error);
		await recordAccountMirrorDomDriftObservation(observation, {
			surface: "account-mirror-conversation-context",
			action: "get-conversation-context",
			fallbackKind: "read-failure-tolerated",
			error,
			metadata: {
				conversationId: conversation.id,
				projectId: conversation.projectId ?? null,
			},
		});
		return {
			context: null,
			observed: false,
			outcome: listOptions?.abortSignal?.aborted
				? "aborted"
				: /timed out/i.test(detail)
					? "timed_out"
					: "failed",
			detail,
		};
	}
}

async function closeAccountMirrorProviderSession(
	listOptions: BrowserProviderListOptions | undefined,
): Promise<void> {
	const session = listOptions?.providerSession;
	if (!session) return;
	listOptions.providerSession = undefined;
	await session.close().catch(() => undefined);
}

function isProviderGuardFailureDetail(detail: string | null): boolean {
	return Boolean(
		detail &&
			/rate limit|requests too quickly|cooldown active|provider guard|captcha|human verification|verify you are human|google\.com\/sorry|sign[ -]?in(?: required)?/i.test(
				detail,
			),
	);
}

function readAccountMirrorContextChunkMetadata(
	context: { metadata?: Record<string, unknown> } | null | undefined,
): {
	startMessageIndex: number;
	endMessageIndex: number;
	nextMessageIndex: number | null;
	maxMessages: number;
	totalMessages: number | null;
	complete: boolean;
} | null {
	const metadata = context?.metadata?.accountMirrorContextChunk;
	if (!metadata || typeof metadata !== "object") return null;
	const record = metadata as Record<string, unknown>;
	const startMessageIndex = readNonNegativeInteger(record.startMessageIndex);
	const endMessageIndex = readNonNegativeInteger(record.endMessageIndex);
	const maxMessages = readPositiveInteger(record.maxMessages);
	if (startMessageIndex === null || endMessageIndex === null || maxMessages === null) return null;
	const nextMessageIndex =
		record.nextMessageIndex === null ? null : readNonNegativeInteger(record.nextMessageIndex);
	return {
		startMessageIndex,
		endMessageIndex,
		nextMessageIndex,
		maxMessages,
		totalMessages:
			record.totalMessages === null || record.totalMessages === undefined
				? null
				: readNonNegativeInteger(record.totalMessages),
		complete: record.complete === true || nextMessageIndex === null,
	};
}

function readNonNegativeInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	return Math.floor(value);
}

function readPositiveInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
	return Math.floor(value);
}

function withProviderCallTimeout<T>(
	operation: (abortSignal: AbortSignal) => Promise<T>,
	timeoutMs: number | null | undefined,
	message: string,
	parentSignal?: AbortSignal,
): Promise<T> {
	const controller = new AbortController();
	const abortSignal = parentSignal
		? AbortSignal.any([parentSignal, controller.signal])
		: controller.signal;
	const promise = operation(abortSignal);
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return promise;
	}
	let timeout: NodeJS.Timeout | null = null;
	return new Promise<T>((resolve, reject) => {
		timeout = setTimeout(
			() => {
				controller.abort(new Error(message));
				reject(new Error(message));
			},
			Math.max(1, Math.floor(timeoutMs)),
		);
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

async function recordAccountMirrorDomDriftObservation(
	context: AccountMirrorDomDriftObservationContext | null | undefined,
	input: {
		surface: string;
		action: string;
		fallbackKind: string;
		error: unknown;
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	if (!context) return;
	try {
		const pageEvidence = await collectAccountMirrorDomDriftPageEvidence(context);
		await recordDomDriftObservation({
			service: context.provider,
			surface: input.surface,
			action: input.action,
			expectedLabels: [],
			observedLabel: null,
			fallbackKind: input.fallbackKind,
			metadata: {
				source: "accountMirror.metadataCollector",
				runtimeProfileId: context.runtimeProfileId,
				errorMessage: errorMessage(input.error),
				pageEvidence,
				...input.metadata,
			},
		});
	} catch {
		// Lazy follow observations are evidence only; they must not make mirroring fail.
	}
}

async function collectAccountMirrorDomDriftPageEvidence(
	context: AccountMirrorDomDriftObservationContext | null | undefined,
): Promise<Record<string, unknown> | null> {
	if (!context?.client) return null;
	const connection = await context.client.connectDevTools().catch(() => null);
	if (!connection) return null;
	const { client } = connection;
	try {
		await client.Runtime.enable().catch(() => undefined);
		await client.Page.enable().catch(() => undefined);
		const { result } = await client.Runtime.evaluate({
			expression: buildAccountMirrorDomDriftPageEvidenceExpression(),
			returnByValue: true,
		});
		const page = isRecord(result?.value) ? result.value : {};
		const screenshot = await captureAccountMirrorDomDriftScreenshot(client, context).catch(
			() => null,
		);
		return {
			...page,
			screenshot,
			capturedAt: new Date().toISOString(),
		};
	} finally {
		await client.close().catch(() => undefined);
	}
}

function buildAccountMirrorDomDriftPageEvidenceExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const visibleNodes = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => visible(node));
    const labels = (selector, limit) => visibleNodes(selector)
      .map((node) => normalize(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || node.getAttribute('href') || ''))
      .filter(Boolean)
      .slice(0, limit);
    return {
      url: location.href,
      title: document.title || null,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
      bodyTextLength: document.body?.innerText?.length ?? 0,
      visibleCounts: {
        buttons: visibleNodes('button,[role="button"]').length,
        links: visibleNodes('a[href]').length,
        inputs: visibleNodes('input').length,
        textareas: visibleNodes('textarea').length,
        contenteditables: visibleNodes('[contenteditable="true"]').length,
        dialogs: visibleNodes('[role="dialog"],dialog[open],[aria-modal="true"]').length,
      },
      visibleLabels: {
        buttons: labels('button,[role="button"]', 20),
        links: labels('a[href]', 20),
        headings: labels('h1,h2,h3,[role="heading"]', 12),
        dialogs: labels('[role="dialog"],dialog[open],[aria-modal="true"]', 8),
      },
    };
  })()`;
}

async function captureAccountMirrorDomDriftScreenshot(
	client: Awaited<ReturnType<AccountMirrorDomDriftClient["connectDevTools"]>>["client"],
	context: AccountMirrorDomDriftObservationContext,
): Promise<Record<string, unknown> | null> {
	if (domDriftScreenshotsCaptured >= MAX_DOM_DRIFT_SCREENSHOTS_PER_PROCESS) return null;
	const screenshot = await client.Page.captureScreenshot({ format: "png" }).catch(() => null);
	if (!screenshot || typeof screenshot.data !== "string" || screenshot.data.length === 0)
		return null;
	domDriftScreenshotsCaptured += 1;
	const bytes = Buffer.from(screenshot.data, "base64");
	const dir = path.join(getAuracallHomeDir(), "diagnostics", "dom-drift");
	await fs.mkdir(dir, { recursive: true });
	const filePath = path.join(
		dir,
		`${new Date().toISOString().replace(/[:.]/g, "-")}-${context.provider}-${sanitizePathToken(context.runtimeProfileId)}.png`,
	);
	await fs.writeFile(filePath, bytes);
	return {
		path: filePath,
		mimeType: "image/png",
		bytes: bytes.length,
	};
}

function sanitizePathToken(value: string): string {
	return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 80) || "unknown";
}

function addFile(
	files: Map<string, FileRef>,
	file: FileRef,
	defaults: { source: FileRef["source"]; projectId?: string; conversationId?: string },
): void {
	const id = `${file.provider}:${file.source ?? defaults.source}:${file.id}`;
	files.set(id, {
		...file,
		provider: file.provider ?? "chatgpt",
		source: file.source ?? defaults.source,
		metadata: {
			...(file.metadata ?? {}),
			projectId: file.metadata?.projectId ?? defaults.projectId,
			conversationId: file.metadata?.conversationId ?? defaults.conversationId,
		},
	});
}

function addArtifact(
	artifacts: Map<string, ConversationArtifact>,
	artifact: ConversationArtifact,
	conversation: Conversation,
): void {
	const id = `${conversation.id}:${artifact.id}`;
	artifacts.set(id, {
		...artifact,
		metadata: {
			...(artifact.metadata ?? {}),
			conversationId: artifact.metadata?.conversationId ?? conversation.id,
			projectId: artifact.metadata?.projectId ?? conversation.projectId,
		},
	});
}

function mergeFileRefs(left: readonly FileRef[], right: readonly FileRef[]): FileRef[] {
	const merged = new Map<string, FileRef>();
	for (const file of [...left, ...right]) {
		if (!file?.id) continue;
		const key = `${file.provider}:${file.source}:${file.id}`;
		merged.set(key, { ...(merged.get(key) ?? {}), ...file });
	}
	return [...merged.values()];
}

function mergeConversationArtifacts(
	left: readonly ConversationArtifact[],
	right: readonly ConversationArtifact[],
): ConversationArtifact[] {
	const merged = new Map<string, ConversationArtifact>();
	for (const artifact of [...left, ...right]) {
		if (!artifact?.id) continue;
		const conversationId =
			isRecord(artifact.metadata) && typeof artifact.metadata.conversationId === "string"
				? artifact.metadata.conversationId
				: "";
		const key = `${conversationId}:${artifact.id}`;
		merged.set(key, { ...(merged.get(key) ?? {}), ...artifact });
	}
	return [...merged.values()];
}

export function mapChatgptLibraryFilesToArtifacts(
	files: readonly FileRef[],
): ConversationArtifact[] {
	return files
		.filter((file) => isRecord(file.metadata) && file.metadata.source === "chatgpt-library")
		.map((file) => {
			const metadata = isRecord(file.metadata) ? file.metadata : {};
			const artifactKind =
				typeof metadata.artifactKind === "string" ? metadata.artifactKind : "download";
			const artifactId =
				typeof metadata.artifactId === "string"
					? metadata.artifactId
					: `chatgpt-library:${file.id}`;
			return {
				id: artifactId,
				title: file.name,
				kind: normalizeArtifactKind(artifactKind),
				uri: file.remoteUrl,
				metadata: {
					...metadata,
					fileId: file.id,
					fileSource: file.source,
				},
			};
		});
}

function normalizeArtifactKind(value: string): ConversationArtifact["kind"] {
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
	return "download";
}

export function mapGrokAccountFilesToMediaManifest(
	files: readonly FileRef[],
): AccountMirrorMediaManifestEntry[] {
	const media: AccountMirrorMediaManifestEntry[] = [];
	for (const file of files) {
		const mediaType = inferMediaTypeFromFile(file);
		if (!mediaType) continue;
		media.push({
			id: `grok-account-file:${file.id}`,
			title: file.name || file.id || null,
			mediaType,
			uri: file.remoteUrl ?? file.localPath,
			provider: "grok",
			metadata: {
				source: "grok-account-files",
				fileId: file.id,
				fileName: file.name,
				fileSource: file.source,
				remoteUrl: file.remoteUrl,
				localPath: file.localPath,
				mimeType: file.mimeType,
			},
		});
	}
	return media;
}

export function mapGeminiConversationArtifactsToMediaManifest(
	artifacts: readonly ConversationArtifact[],
): AccountMirrorMediaManifestEntry[] {
	const media: AccountMirrorMediaManifestEntry[] = [];
	for (const artifact of artifacts) {
		const mediaType = inferMediaTypeFromGeminiArtifact(artifact);
		if (!mediaType) continue;
		const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
		const conversationId = readMetadataString(metadata, "conversationId");
		const projectId = readMetadataString(metadata, "projectId");
		media.push({
			id: `gemini-conversation-artifact:${conversationId ?? "unknown"}:${artifact.id}`,
			title: artifact.title || readMetadataString(metadata, "fileName") || artifact.id || null,
			mediaType,
			uri: artifact.uri,
			conversationId: conversationId ?? undefined,
			projectId: projectId ?? undefined,
			provider: "gemini",
			metadata: {
				source: "gemini-conversation-artifacts",
				artifactId: artifact.id,
				artifactKind: artifact.kind ?? null,
				messageIndex: artifact.messageIndex ?? null,
				uri: artifact.uri ?? null,
				...metadata,
			},
		});
	}
	return media;
}

function inferMediaTypeFromGeminiArtifact(
	artifact: ConversationArtifact,
): AccountMirrorMediaManifestEntry["mediaType"] | null {
	const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
	const explicit = normalizeMediaManifestType(readMetadataString(metadata, "mediaType"));
	if (explicit) return explicit;
	if (artifact.kind === "image") return "image";
	const haystack = [
		artifact.kind,
		artifact.title,
		artifact.uri,
		readMetadataString(metadata, "fileName"),
		readMetadataString(metadata, "downloadLabel"),
		readMetadataString(metadata, "downloadVariant"),
		readMetadataString(metadata, "mimeType"),
	]
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.join(" ")
		.toLowerCase();
	if (!haystack) return null;
	if (/\bimage\//.test(haystack) || /\.(avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/.test(haystack)) {
		return "image";
	}
	if (/\bvideo\//.test(haystack) || /\.(m4v|mov|mp4|webm)(?:[?#\s]|$)/.test(haystack)) {
		return "video";
	}
	if (/\bmusic\b|\bmp3\b|\btrack\b|\bsong\b|with album art/.test(haystack)) {
		return "music";
	}
	if (/\baudio\//.test(haystack) || /\.(aac|flac|m4a|mp3|ogg|wav)(?:[?#\s]|$)/.test(haystack)) {
		return "audio";
	}
	return null;
}

function normalizeMediaManifestType(
	value: string | null,
): AccountMirrorMediaManifestEntry["mediaType"] | null {
	if (
		value === "image" ||
		value === "video" ||
		value === "music" ||
		value === "audio" ||
		value === "unknown"
	) {
		return value;
	}
	return null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function inferMediaTypeFromFile(
	file: FileRef,
): AccountMirrorMediaManifestEntry["mediaType"] | null {
	const haystack = [file.mimeType, file.name, file.remoteUrl, file.localPath]
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.join(" ")
		.toLowerCase();
	if (!haystack) return null;
	if (/\bimage\//.test(haystack) || /\.(avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/.test(haystack)) {
		return "image";
	}
	if (/\bvideo\//.test(haystack) || /\.(m4v|mov|mp4|webm)(?:[?#\s]|$)/.test(haystack)) {
		return "video";
	}
	if (/\baudio\//.test(haystack) || /\.(aac|flac|m4a|mp3|ogg|wav)(?:[?#\s]|$)/.test(haystack)) {
		return "audio";
	}
	return null;
}

function readIdentityKey(identity: ProviderUserIdentity | null): string | null {
	return (
		normalizeIdentityKey(identity?.email) ??
		normalizeIdentityKey(identity?.handle) ??
		normalizeIdentityKey(identity?.accountId) ??
		normalizeIdentityKey(identity?.name) ??
		null
	);
}

export function readAccountMirrorProviderIdentityKeyForTest(
	provider: AccountMirrorProvider,
	identity: ProviderUserIdentity | null,
): string | null {
	return readProviderIdentityKey(provider, identity);
}

function readProviderIdentityKey(
	provider: AccountMirrorProvider,
	identity: ProviderUserIdentity | null,
): string | null {
	if (provider === "chatgpt" || provider === "gemini") {
		return normalizeIdentityKey(identity?.email);
	}
	return readIdentityKey(identity);
}

function readAccountLevel(identity: ProviderUserIdentity | null): string | null {
	return (
		readString(identity?.accountLevel) ??
		readString(identity?.accountPlanType) ??
		readString(identity?.capabilityProfile) ??
		readString(identity?.proAccess)
	);
}

function normalizeIdentityKey(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	return normalized.length > 0 ? normalized : null;
}

function readString(value: string | null | undefined): string | null {
	const trimmed = String(value ?? "").trim();
	return trimmed.length > 0 ? trimmed : null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
