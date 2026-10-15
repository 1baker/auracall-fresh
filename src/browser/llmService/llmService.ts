import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout as cancelTimer, setTimeout as scheduleTimer } from "node:timers";
import {
	type BrowserInteractionGovernor,
	createBrowserInteractionGovernor,
} from "../../../packages/browser-service/src/service/interactionGovernor.js";
import { createInMemoryBrowserMutationLog } from "../../../packages/browser-service/src/service/mutationDispatcher.js";
import { hasProviderBackendRequestAdmission } from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { getPreferredRuntimeProfile, getPreferredRuntimeProfileName } from "../../config/model.js";
import { resolveConfiguredServiceAccountId } from "../../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../../config.js";
import {
	appendChatgptMutationRecord,
	appendChatgptRateLimitDetection,
	CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS,
	CHATGPT_MUTATION_MAX_WEIGHT,
	CHATGPT_MUTATION_WINDOW_MS,
	CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS,
	CHATGPT_POST_COMMIT_JITTER_MAX_MS,
	CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS,
	CHATGPT_RATE_LIMIT_COOLDOWN_MS,
	type ChatgptRateLimitGuardState,
	extractChatgptRateLimitSummary,
	getChatgptMutationBudgetWaitMs,
	getChatgptPostCommitQuietWaitMs,
	isChatgptRateLimitMessage,
	pruneChatgptRateLimitDetectionHistory,
	readChatgptRateLimitGuardState,
	resolveChatgptRateLimitCooldownMs,
	writeChatgptRateLimitGuardState,
} from "../chatgptRateLimitGuard.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../configuredProviderTrafficAuthority.js";
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from "../constants.js";
import { recordLibraryInventoryStage } from "../libraryInventoryDiagnostics.js";
import {
	hasUnknownOwnedRequestCleanup,
	OwnedBackendRequestCleanupError,
} from "../ownedBackendRequestAuthority.js";
import {
	type ConversationContextReadOutcome,
	type ConversationContextReadReceipt,
	matchConversationByTitle,
	matchProjectByName,
	PROVIDER_CACHE_TTL_MS,
	readConversationContextReadReceipt,
	resolveProviderCacheKey,
	resolveProviderCachePath,
	writeConversationContextReadReceipt,
} from "../providers/cache.js";
import {
	CHATGPT_MISSING_LIVE_CONTROL_REASON,
	isChatgptArtifactMissingLiveControl,
	reconcileChatgptPayloadDownloadControls,
} from "../providers/chatgptArtifactControls.js";
import type {
	Conversation,
	ConversationArtifact,
	ConversationContext,
	ConversationMessage,
	ConversationSource,
	FileRef,
	Project,
	ProjectMemoryMode,
	ProviderId,
} from "../providers/domain.js";
import {
	assertProviderSessionAuthorization,
	createProviderSessionAuthority,
	type ProviderSessionAuthority,
	ProviderSessionAuthorityError,
	type ProviderSessionContext,
	type ProviderSessionProof,
} from "../providers/providerSessionAuthority.js";
import {
	createBrowserScrapeTelemetryRecorder,
	recordBrowserScrapeCandidateCount,
	recordBrowserScrapeProviderAction,
	snapshotBrowserScrapeTelemetry,
} from "../providers/scrapeTelemetry.js";
import type {
	BrowserProviderActiveMediaMaterializationInput,
	BrowserProviderConversationFileDownloadInput,
	BrowserProviderConversationFileDownloadResult,
	BrowserProviderListOptions,
	ProviderUserIdentity,
} from "../providers/types.js";
import type { BrowserService } from "../service/browserService.js";
import {
	readSimpleProviderGuardState,
	type SimpleProviderGuardState,
	writeSimpleProviderGuardState,
} from "../simpleProviderGuard.js";
import type { CachedConversationContextEntry, CacheStore } from "./cache/store.js";
import { type CacheStoreKind, createCacheStore } from "./cache/store.js";
import type {
	CacheContext,
	CacheIdentity,
	CacheSettings,
	ConversationListResult,
	IdentityPrompt,
	LlmCapabilities,
	LlmServiceAdapter,
	ProjectListResult,
	PromptInput,
	PromptPlan,
	PromptResult,
	PromptWorkbenchInput,
	PromptWorkbenchResult,
} from "./types.js";

const DEFAULT_HISTORY_LIMIT = 2000;
export const DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS = 120_000;
const CHATGPT_RATE_LIMIT_RETRY_BASE_MS = 2_000;
const CHATGPT_RATE_LIMIT_RETRY_STEP_MS = 3_000;
const CHATGPT_RATE_LIMIT_RETRY_JITTER_MS = 1_500;
const CHATGPT_RATE_LIMIT_RETRY_MAX_MS = 15_000;
const CHATGPT_RETRY_BASE_MS = 500;
const CHATGPT_RETRY_STEP_MS = 500;
const CHATGPT_RETRY_MAX_MS = 2_500;
const CHATGPT_RETRY_JITTER_MS = 250;
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;
const GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS = 45_000;
const GEMINI_POST_COMMIT_QUIET_MS = 12_000;
const GEMINI_MUTATION_MIN_INTERVAL_MS = 25_000;
const GROK_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS = 30_000;

export class ConversationContextReadError extends Error {
	readonly code: "conversation_context_timeout" | "conversation_context_aborted";
	readonly outcome: "timed_out" | "aborted";

	constructor(input: {
		provider: ProviderId;
		conversationId: string;
		timeoutMs: number;
		outcome: "timed_out" | "aborted";
		cause?: unknown;
	}) {
		const code =
			input.outcome === "timed_out"
				? "conversation_context_timeout"
				: "conversation_context_aborted";
		super(
			input.outcome === "timed_out"
				? `${input.provider} conversation context read timed out after ${input.timeoutMs}ms for "${input.conversationId}".`
				: `${input.provider} conversation context read was aborted for "${input.conversationId}".`,
			{ cause: input.cause },
		);
		this.name = "ConversationContextReadError";
		this.code = code;
		this.outcome = input.outcome;
	}
}

function resolveConversationContextTimeoutMs(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS;
	}
	return Math.max(1, Math.floor(value));
}

function readTerminalErrorCode(error: unknown): string | null {
	if (error && typeof error === "object" && "code" in error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code === "string" && code.trim()) return code.trim();
	}
	return error instanceof Error && error.name ? error.name : null;
}

function waitForPromiseWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(signal.reason ?? new Error("Operation aborted."));
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(signal.reason ?? new Error("Operation aborted."));
		};
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}
const GROK_POST_COMMIT_QUIET_MS = 8_000;
const GROK_MUTATION_MIN_INTERVAL_MS = 12_000;
const SCOPED_CONVERSATION_FILE_LIST_TIMEOUT_MS = 15_000;

type ProviderGuardSettings = {
	cooldownMs: number;
	autoWaitMaxMs: number;
	mutationWindowMs: number;
	mutationMaxWeight: number;
	mutationBudgetAutoWaitMaxMs: number;
	postCommitAutoWaitMaxMs: number;
	postCommitQuietScale: number;
	postCommitJitterMaxMs: number;
	simplePostCommitQuietMs?: number;
	simpleMutationMinIntervalMs?: number;
};

type ConversationArtifactFetchStatus = "materialized" | "skipped" | "error";

type ConversationArtifactFetchManifestEntry = {
	artifactId: string;
	title: string;
	kind: ConversationArtifact["kind"];
	uri: string | null;
	status: ConversationArtifactFetchStatus;
	fileId?: string;
	fileName?: string;
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
};

type ConversationArtifactFetchManifest = {
	provider: ProviderId;
	conversationId: string;
	projectId: string | null;
	generatedAt: string;
	artifactCount: number;
	materializedCount: number;
	scrapeTelemetry?: ReturnType<typeof snapshotBrowserScrapeTelemetry>;
	entries: ConversationArtifactFetchManifestEntry[];
};

type ConversationFileFetchStatus = "materialized" | "error";

type ConversationFileFetchManifestEntry = {
	fileId: string;
	fileName: string;
	status: ConversationFileFetchStatus;
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
	failureKind?: "provider_unavailable" | "retrieval_failed";
	retryable?: boolean;
};

type ConversationFileFetchManifest = {
	provider: ProviderId;
	conversationId: string;
	projectId: string | null;
	generatedAt: string;
	fileCount: number;
	materializedCount: number;
	scrapeTelemetry?: ReturnType<typeof snapshotBrowserScrapeTelemetry>;
	entries: ConversationFileFetchManifestEntry[];
};

type AccountFileFetchStatus = "materialized" | "error";

type AccountFileFetchManifestEntry = {
	fileId: string;
	fileName: string;
	status: AccountFileFetchStatus;
	localPath?: string;
	remoteUrl?: string | null;
	mimeType?: string;
	size?: number;
	materializationMethod?: string;
	error?: string;
};

type AccountFileFetchManifest = {
	provider: ProviderId;
	generatedAt: string;
	fileCount: number;
	materializedCount: number;
	entries: AccountFileFetchManifestEntry[];
};

type ProjectFileFetchManifest = {
	provider: ProviderId;
	projectId: string;
	generatedAt: string;
	fileCount: number;
	materializedCount: number;
	entries: AccountFileFetchManifestEntry[];
};

type CachedConversationFileSalvageCandidate = {
	file: FileRef;
	size: number;
};

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

function limitItems<T>(items: T[], maxItems: number | null | undefined): T[] {
	if (typeof maxItems !== "number" || !Number.isFinite(maxItems)) return items;
	return items.slice(0, Math.max(0, Math.trunc(maxItems)));
}

function timeoutAfter<T>(timeoutMs: number, message: string): Promise<T> {
	return new Promise<T>((_, reject) => {
		setTimeout(() => reject(new Error(message)), timeoutMs);
	});
}

async function closeScopedProviderSession(listOptions: BrowserProviderListOptions): Promise<void> {
	const session = listOptions.providerSession;
	if (!session) return;
	listOptions.providerSession = undefined;
	await session.close();
}

function normalizeProjectInstructionsForPrefix(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function stripAsciiControlCharacters(value: string): string {
	return Array.from(value)
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code >= 0x20 && code !== 0x7f;
		})
		.join("");
}

function sanitizeArtifactPathSegment(value: string): string {
	const normalized = stripAsciiControlCharacters(String(value ?? ""))
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 ? normalized.slice(0, 120) : "artifact";
}

function isStaticChatgptImageArtifactFalsePositive(
	providerId: ProviderId,
	artifact: ConversationArtifact,
): boolean {
	if (providerId !== "chatgpt") return false;
	if (
		!artifact.id.startsWith("image-dom:") &&
		artifact.metadata?.extraction !== "dom-imagegen-image"
	)
		return false;
	const uri = artifact.uri?.trim().toLowerCase();
	if (!uri) return true;
	if (uri.startsWith("blob:")) return false;
	if (uri.startsWith("chatgpt://")) return false;
	if (uri.startsWith("sandbox:")) return false;
	if (uri.startsWith("sediment://")) return false;
	try {
		const parsed = new URL(uri);
		if (parsed.hostname === "www.google.com" && parsed.pathname === "/s2/favicons") return true;
		if (parsed.pathname.includes("/favicon")) return true;
		return parsed.pathname.endsWith("/favicon.ico");
	} catch {
		return false;
	}
}

function selectMaterializableConversationArtifacts(
	providerId: ProviderId,
	artifacts: ConversationArtifact[],
): ConversationArtifact[] {
	const eligible = selectEligibleConversationArtifacts(providerId, artifacts);
	if (providerId !== "chatgpt") return eligible;
	const downloadButtonTitles = new Set(
		eligible
			.filter(
				(artifact) =>
					artifact.kind === "download" &&
					artifact.uri?.trim().toLowerCase().startsWith("chatgpt://download-button/"),
			)
			.map((artifact) => normalizeArtifactTitleForDeduplication(artifact.title))
			.filter((title) => title.length > 0),
	);
	const representatives = new Map<string, ConversationArtifact>();
	for (const artifact of eligible) {
		const key = chatgptMaterializationFamilyKey(artifact, downloadButtonTitles);
		if (!key) {
			representatives.set(`artifact:${representatives.size}:${artifact.id}`, artifact);
			continue;
		}
		const existing = representatives.get(key);
		if (!existing || compareChatgptArtifactRepresentative(artifact, existing) < 0) {
			representatives.set(key, artifact);
		}
	}
	return Array.from(representatives.values());
}

function selectEligibleConversationArtifacts(
	providerId: ProviderId,
	artifacts: ConversationArtifact[],
): ConversationArtifact[] {
	return artifacts.filter(
		(artifact) => !isStaticChatgptImageArtifactFalsePositive(providerId, artifact),
	);
}

function normalizeArtifactTitleForDeduplication(value: string): string {
	return stripAsciiControlCharacters(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function chatgptMaterializationFamilyKey(
	artifact: ConversationArtifact,
	downloadButtonTitles: Set<string>,
): string | null {
	const uri = artifact.uri?.trim() ?? "";
	if (artifact.kind === "download") {
		const title = normalizeArtifactTitleForDeduplication(artifact.title);
		const downloadButton = uri.match(/^chatgpt:\/\/download-button\/([^/]+)\/\d+/i);
		if (downloadButton?.[1]) {
			return `download-title:${title}`;
		}
		if (uri.toLowerCase().startsWith("sandbox:") && title && downloadButtonTitles.has(title)) {
			return `download-title:${title}`;
		}
		const idSource = artifact.id || uri;
		const sandbox = idSource.match(/^([^:]+):download:sandbox:/i);
		if (sandbox?.[1]) {
			return `sandbox-download:${sandbox[1]}`;
		}
	}
	if (uri) {
		const normalizedUri = normalizeChatgptArtifactMaterializationUri(uri);
		if (normalizedUri) return `${artifact.kind ?? "artifact"}:${normalizedUri}`;
	}
	return null;
}

function normalizeChatgptArtifactMaterializationUri(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("sandbox:")) {
		const withoutExtension = trimmed.replace(/\.[a-z0-9]+$/i, "");
		return withoutExtension.replace(/(?:_clean_\d+page|_revised_[a-z0-9_-]+)$/i, "");
	}
	try {
		const parsed = new URL(trimmed);
		if (parsed.pathname.includes("/backend-api/estuary/content")) {
			const id = parsed.searchParams.get("id");
			if (id) return `estuary:${id}`;
		}
		parsed.search = "";
		parsed.hash = "";
		return parsed.href;
	} catch {
		return trimmed.toLowerCase();
	}
}

function compareChatgptArtifactRepresentative(
	left: ConversationArtifact,
	right: ConversationArtifact,
): number {
	const leftDownloadButton =
		left.uri?.trim().toLowerCase().startsWith("chatgpt://download-button/") === true;
	const rightDownloadButton =
		right.uri?.trim().toLowerCase().startsWith("chatgpt://download-button/") === true;
	if (leftDownloadButton !== rightDownloadButton) return leftDownloadButton ? -1 : 1;
	const leftSpecificity = artifactTitleSpecificityScore(left.title);
	const rightSpecificity = artifactTitleSpecificityScore(right.title);
	if (leftSpecificity !== rightSpecificity) return rightSpecificity - leftSpecificity;
	return left.title.localeCompare(right.title);
}

function artifactTitleSpecificityScore(value: string): number {
	const normalized = normalizeArtifactTitleForDeduplication(value);
	let score = normalized.length;
	if (/_clean_\d+page/i.test(value)) score += 100;
	if (/_revised_[a-z0-9_-]+/i.test(value)) score += 80;
	return score;
}

async function findReusableConversationArtifact(
	artifact: ConversationArtifact,
	files: FileRef[],
): Promise<FileRef | null> {
	const candidate = files.find(
		(file) =>
			file.id === artifact.id &&
			file.name === artifact.title &&
			file.remoteUrl === artifact.uri &&
			file.source === "conversation",
	);
	if (!candidate?.localPath) return null;
	try {
		const stat = await fs.stat(candidate.localPath);
		if (
			!stat.isFile() ||
			stat.size === 0 ||
			(candidate.size !== undefined && stat.size !== candidate.size)
		)
			return null;
		const checksumSha256 = await calculateSha256(candidate.localPath);
		if (candidate.checksumSha256 && checksumSha256 !== candidate.checksumSha256) return null;
		return { ...candidate, size: stat.size, checksumSha256 };
	} catch {
		return null;
	}
}

function normalizeArtifactFetchError(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}
	return String(error ?? "Unknown artifact materialization error");
}

function sanitizeConversationFileName(
	value: string,
	fallback: string = "conversation-file",
): string {
	const normalized = stripAsciiControlCharacters(String(value ?? ""))
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 ? normalized.slice(0, 180) : fallback;
}

async function calculateSha256(filePath: string): Promise<string> {
	const content = await fs.readFile(filePath);
	return createHash("sha256").update(content).digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function metadataString(value: Record<string, unknown> | undefined, key: string): string | null {
	const entry = value?.[key];
	return typeof entry === "string" && entry.trim().length > 0 ? entry.trim() : null;
}

function fileDeclaredSize(file: FileRef): number | null {
	return typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0
		? file.size
		: null;
}

async function findCachedConversationFileSalvageCandidate(input: {
	currentFile: FileRef;
	cachedFiles: ReadonlyMap<string, FileRef>;
	conversationId: string;
	attachmentsDir: string;
}): Promise<CachedConversationFileSalvageCandidate | null> {
	const cachedFile = input.cachedFiles.get(input.currentFile.id);
	if (!cachedFile) return null;
	if (input.currentFile.source !== "conversation" || cachedFile.source !== "conversation")
		return null;
	if (input.currentFile.provider !== cachedFile.provider) return null;
	if (input.currentFile.name !== cachedFile.name) return null;

	const currentKind = metadataString(input.currentFile.metadata, "kind");
	const cachedKind = metadataString(cachedFile.metadata, "kind");
	if (currentKind !== "uploaded-file" && cachedKind !== "uploaded-file") return null;
	if (currentKind && currentKind !== "uploaded-file") return null;
	if (cachedKind && cachedKind !== "uploaded-file") return null;

	const currentConversationId = metadataString(input.currentFile.metadata, "conversationId");
	const cachedConversationId = metadataString(cachedFile.metadata, "conversationId");
	if (currentConversationId && currentConversationId !== input.conversationId) return null;
	if (cachedConversationId && cachedConversationId !== input.conversationId) return null;

	if (!cachedFile.localPath) return null;
	const resolvedAttachmentsDir = path.resolve(input.attachmentsDir);
	const resolvedLocalPath = path.resolve(cachedFile.localPath);
	if (
		resolvedLocalPath !== resolvedAttachmentsDir &&
		!resolvedLocalPath.startsWith(`${resolvedAttachmentsDir}${path.sep}`)
	) {
		return null;
	}

	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(resolvedLocalPath);
	} catch {
		return null;
	}
	if (!stat.isFile()) return null;

	const currentSize = fileDeclaredSize(input.currentFile);
	const cachedSize = fileDeclaredSize(cachedFile);
	if (currentSize !== null && stat.size !== currentSize) return null;
	if (cachedSize !== null && stat.size !== cachedSize) return null;

	const checksumSha256 = await calculateSha256(resolvedLocalPath);
	const file: FileRef = {
		...cachedFile,
		...input.currentFile,
		mimeType: input.currentFile.mimeType ?? cachedFile.mimeType,
		remoteUrl: input.currentFile.remoteUrl ?? cachedFile.remoteUrl,
		localPath: resolvedLocalPath,
		size: stat.size,
		checksumSha256,
		metadata: {
			...cachedFile.metadata,
			...input.currentFile.metadata,
			conversationId: input.conversationId,
			materialization: "cached-provider-file",
			materializationSource: "cached-provider-file",
			cachedProviderFile: true,
		},
	};
	return { file, size: stat.size };
}

export function stripProjectInstructionsPrefixFromConversationContext(
	context: ConversationContext,
	projectInstructions: string,
): ConversationContext {
	const normalizedInstructions = normalizeProjectInstructionsForPrefix(projectInstructions);
	if (!normalizedInstructions) {
		return context;
	}
	let stripped = false;
	const messages = context.messages.map((message) => {
		if (stripped || message.role !== "assistant") {
			return message;
		}
		const normalizedText = message.text.replace(/\r\n/g, "\n");
		if (!normalizedText.startsWith(normalizedInstructions)) {
			return message;
		}
		const remainder = normalizedText.slice(normalizedInstructions.length).replace(/^\s+/, "");
		if (!remainder) {
			return message;
		}
		stripped = true;
		return {
			...message,
			text: remainder,
		};
	});
	return stripped ? { ...context, messages } : context;
}

export abstract class LlmService {
	readonly provider: LlmServiceAdapter;
	readonly providerId: ProviderId;
	private readonly browserService: BrowserService;
	protected readonly cacheStore: CacheStore;
	private readonly identityPrompt?: IdentityPrompt;
	private readonly browserInteractionGovernors = new Map<string, BrowserInteractionGovernor>();
	private readonly providerSessionAuthority: ProviderSessionAuthority;
	private latestProviderSessionProof: ProviderSessionProof | null = null;

	protected constructor(
		private readonly userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		browserService: BrowserService,
		options?: { identityPrompt?: IdentityPrompt; cacheStore?: CacheStore },
	) {
		this.provider = provider;
		this.providerId = provider.id;
		this.browserService = browserService;
		this.identityPrompt = options?.identityPrompt;
		this.providerSessionAuthority = createProviderSessionAuthority(
			this.userConfig as unknown as Record<string, unknown>,
		);
		const configuredStore = this.userConfig.browser?.cache?.store;
		this.cacheStore =
			options?.cacheStore ?? createCacheStore(resolveCacheStoreKind(configuredStore));
	}

	async runUtilityBrowserOperation<TResult>(input: {
		options?: BrowserProviderListOptions;
		mutability: "read-only" | "provider-mutating";
		run: (options: BrowserProviderListOptions) => Promise<TResult>;
	}): Promise<TResult> {
		const options = await this.buildListOptions(input.options, { ensurePort: true });
		return input.run(options);
	}

	getCapabilities(): LlmCapabilities {
		return {
			projects: this.provider.capabilities?.projects ?? false,
			conversations: this.provider.capabilities?.conversations ?? false,
			rename: Boolean(this.provider.renameConversation),
			contexts: Boolean(this.provider.readConversationContext),
			files: Boolean(
				this.provider.listConversationFiles ||
					this.provider.listProjectFiles ||
					this.provider.listAccountFiles,
			),
			models: true,
		};
	}

	getLatestProviderSessionProof(): ProviderSessionProof | null {
		return this.latestProviderSessionProof;
	}

	getConfiguredUrl(): string | null {
		const browser = this.userConfig.browser;
		if (this.providerId === "grok") {
			return browser?.grokUrl ?? browser?.url ?? null;
		}
		if (this.providerId === "gemini") {
			return browser?.geminiUrl ?? browser?.url ?? null;
		}
		return browser?.chatgptUrl ?? browser?.url ?? null;
	}

	protected getDefaultLaunchUrl(): string {
		if (this.providerId === "grok") {
			return GROK_URL;
		}
		if (this.providerId === "gemini") {
			return GEMINI_URL;
		}
		return CHATGPT_URL;
	}

	resolveLaunchUrl(
		options: {
			configuredUrl?: string | null;
			projectId?: string | null;
			conversationId?: string | null;
		} = {},
	): string | null {
		const configuredUrl = options.configuredUrl ?? this.getConfiguredUrl();
		const conversationId = options.conversationId ?? null;
		const projectId = options.projectId ?? null;
		if (conversationId && this.provider.resolveConversationUrl) {
			return (
				this.provider.resolveConversationUrl(conversationId, projectId ?? undefined) ??
				configuredUrl ??
				null
			);
		}
		if (projectId && this.provider.resolveProjectUrl) {
			return this.provider.resolveProjectUrl(projectId) ?? configuredUrl ?? null;
		}
		return configuredUrl ?? null;
	}

	async planPrompt(options: {
		configuredUrl?: string | null;
		projectId?: string | null;
		projectName?: string | null;
		conversationId?: string | null;
		conversationName?: string | null;
		noProject?: boolean;
		allowAutoRefresh?: boolean;
		forceProjectRefresh?: boolean;
		forceConversationRefresh?: boolean;
		listOptions?: BrowserProviderListOptions;
	}): Promise<PromptPlan> {
		const configuredUrl = options.configuredUrl ?? this.getConfiguredUrl();
		const noProject = options.noProject === true;
		const projectName = noProject ? null : options.projectName?.trim() || null;
		const conversationName = options.conversationName?.trim() || null;
		let projectId = noProject ? null : (options.projectId ?? null);
		let conversationId = options.conversationId ?? null;
		const allowAutoRefresh = options.allowAutoRefresh ?? true;

		if (!projectId && projectName) {
			projectId = await this.resolveProjectIdByName(projectName, {
				forceRefresh: options.forceProjectRefresh,
				allowAutoRefresh,
				allowFallback: this.providerId === "grok",
				listOptions: options.listOptions,
			});
		}

		if (!conversationId && conversationName) {
			const match = await this.resolveConversationSelector(conversationName, {
				projectId: projectId ?? undefined,
				forceRefresh: options.forceConversationRefresh,
				allowAutoRefresh,
				listOptions: options.listOptions,
				noProject,
			});
			conversationId = match.id;
		}

		const targetUrl = this.resolveLaunchUrl({
			configuredUrl,
			projectId,
			conversationId,
		});
		const reusePolicy = conversationId ? "reuse" : "new";
		return {
			targetUrl,
			projectId,
			conversationId,
			reusePolicy,
			promptMode: reusePolicy === "reuse" ? "reuse" : "new",
		};
	}

	deriveProjectsFromConfig(
		options: { configuredUrl?: string | null; projectId?: string | null } = {},
	): Project[] {
		const configuredUrl = options.configuredUrl ?? null;
		const resolvedId = options.projectId ?? this.extractProjectId(configuredUrl);
		if (!resolvedId) return [];
		return [
			{
				id: resolvedId,
				name: resolvedId,
				provider: this.providerId,
				url: configuredUrl ?? this.provider.resolveProjectUrl?.(resolvedId) ?? undefined,
			},
		];
	}

	deriveConversationsFromConfig(
		options: {
			configuredUrl?: string | null;
			projectId?: string | null;
			conversationId?: string | null;
		} = {},
	): Conversation[] {
		const configuredUrl = options.configuredUrl ?? null;
		const resolvedId = options.conversationId ?? this.extractConversationId(configuredUrl);
		if (!resolvedId) return [];
		return [
			{
				id: resolvedId,
				title: resolvedId,
				provider: this.providerId,
				projectId: options.projectId ?? undefined,
				url:
					this.provider.resolveConversationUrl?.(resolvedId, options.projectId ?? undefined) ??
					undefined,
			},
		];
	}

	async buildListOptions(
		overrides: BrowserProviderListOptions = {},
		options: {
			ensurePort?: boolean;
			onPreflightStage?: (stage: string) => void;
		} = {},
	): Promise<BrowserProviderListOptions> {
		const configuredUrl = Object.hasOwn(overrides, "configuredUrl")
			? (overrides.configuredUrl ?? null)
			: this.getConfiguredUrl();
		const hasExplicitEndpoint = overrides.port !== undefined || overrides.host !== undefined;
		const resolvedTarget = await this.browserService.resolveServiceTarget({
			serviceId: this.providerId,
			configuredUrl,
			ensurePort: overrides.tabTargetId || hasExplicitEndpoint ? false : options.ensurePort,
			abortSignal: overrides.abortSignal,
			onStage: options.onPreflightStage,
		});
		const explicitEndpointMatches =
			Boolean(resolvedTarget) &&
			(!overrides.host || !resolvedTarget?.host || overrides.host === resolvedTarget.host) &&
			(!overrides.port || !resolvedTarget?.port || overrides.port === resolvedTarget.port);
		const target =
			overrides.tabTargetId || hasExplicitEndpoint
				? explicitEndpointMatches
					? resolvedTarget
					: null
				: resolvedTarget;
		const host = target?.host ?? overrides.host;
		const port = target?.port ?? overrides.port;
		const attachResolvedServiceTab = shouldAttachResolvedServiceTab(overrides);
		const inheritedAuthorization = overrides.providerSessionAuthorization;
		const inheritedContextCandidate =
			inheritedAuthorization?.authority === this.providerSessionAuthority &&
			inheritedAuthorization.context.providerId === this.providerId
				? inheritedAuthorization.context
				: null;
		const inheritedEndpointMatches =
			inheritedContextCandidate !== null &&
			(inheritedContextCandidate.devtoolsHost === null ||
				host === undefined ||
				inheritedContextCandidate.devtoolsHost === host) &&
			(inheritedContextCandidate.devtoolsPort === null ||
				port === undefined ||
				inheritedContextCandidate.devtoolsPort === port);
		const inheritedContext = inheritedEndpointMatches ? inheritedContextCandidate : null;
		const providerSessionContext: ProviderSessionContext = {
			providerId: this.providerId,
			auracallRuntimeProfile: this.resolveActiveProfileName(),
			browserProfile: target?.browserProfile ?? inheritedContext?.browserProfile ?? null,
			sourceBrowserProfile:
				target?.sourceBrowserProfile ?? inheritedContext?.sourceBrowserProfile ?? null,
			managedBrowserProfile:
				target?.managedBrowserProfile ?? inheritedContext?.managedBrowserProfile ?? null,
			browserProcessId: target?.browserProcessId ?? inheritedContext?.browserProcessId ?? null,
			browserTargetId:
				overrides.tabTargetId ??
				(attachResolvedServiceTab ? target?.tab?.targetId : null) ??
				inheritedContext?.browserTargetId ??
				null,
			devtoolsHost: target?.host ?? overrides.host ?? inheritedContext?.devtoolsHost ?? null,
			devtoolsPort: target?.port ?? overrides.port ?? inheritedContext?.devtoolsPort ?? null,
		};
		const providerSessionExpectation =
			this.providerSessionAuthority.resolveExpectation(providerSessionContext);
		const mutationAudit =
			overrides.mutationAudit ??
			this.browserService.getMutationAuditSink?.() ??
			createInMemoryBrowserMutationLog().record;
		const resolvedOptions: BrowserProviderListOptions = {
			...overrides,
			port,
			host,
			configuredUrl,
			tabTargetId:
				overrides.tabTargetId ?? (attachResolvedServiceTab ? target?.tab?.targetId : undefined),
			tabUrl: overrides.tabUrl ?? (attachResolvedServiceTab ? target?.tab?.url : undefined),
			browserService: this.browserService,
			mutationAudit,
			mutationSourcePrefix: overrides.mutationSourcePrefix ?? `provider:${this.providerId}`,
			interactionGovernor:
				overrides.interactionGovernor ?? this.resolveBrowserInteractionGovernor(overrides),
			providerTrafficRequired: true,
			providerSessionAuthorization: {
				authority: this.providerSessionAuthority,
				context: providerSessionContext,
				expectation: providerSessionExpectation,
				onProof: (proof) => {
					this.latestProviderSessionProof = proof;
					overrides.onProviderSessionProof?.(proof);
					overrides.providerSessionAuthorization?.onProof?.(proof);
				},
			},
		};
		if (!resolvedOptions.providerTrafficGovernor) {
			const managedBrowserProfile = providerSessionContext.managedBrowserProfile?.trim();
			if (managedBrowserProfile) {
				resolvedOptions.providerTrafficAuthorityFactory =
					overrides.providerTrafficAuthorityFactory ??
					createConfiguredProviderTrafficAuthorityFactory({
						userConfig: this.userConfig,
						mutationAudit,
						provider: this.providerId,
						managedBrowserProfile,
						baseOptions: resolvedOptions,
					});
			}
		}
		return resolvedOptions;
	}

	async getProviderSessionProof(
		overrides: BrowserProviderListOptions = {},
	): Promise<ProviderSessionProof> {
		if (!this.provider.getUserIdentity) {
			throw new Error(`Provider-session observation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(overrides, { ensurePort: true });
		try {
			const observation = await this.provider.getUserIdentity(listOptions);
			return assertProviderSessionAuthorization(
				listOptions.providerSessionAuthorization,
				observation,
			);
		} finally {
			// This method returns a proof, so a newly retained session has no caller owner.
			if (listOptions.providerSession !== overrides.providerSession) {
				await closeScopedProviderSession(listOptions);
			}
		}
	}

	private resolveBrowserInteractionGovernor(
		overrides: BrowserProviderListOptions,
	): BrowserInteractionGovernor | undefined {
		if (this.providerId !== "chatgpt") return undefined;
		const liveFollow = this.resolveConfiguredLiveFollow();
		const policy = {
			maxInteractionsPerMinute: readPositiveNumber(liveFollow?.maxBrowserInteractionsPerMinute),
			cooldownsByClass: {
				"conversation-read": readNonNegativeNumber(liveFollow?.conversationReadCooldownMs),
				"page-refresh": readNonNegativeNumber(liveFollow?.pageRefreshCooldownMs),
				renavigation: readNonNegativeNumber(liveFollow?.renavigationCooldownMs),
			},
			abortSignal: overrides.abortSignal,
		};
		if (overrides.abortSignal) {
			return createBrowserInteractionGovernor(policy);
		}
		const profileName = this.resolveActiveProfileName() ?? "default";
		const accountId =
			resolveConfiguredServiceAccountId(this.userConfig as unknown as Record<string, unknown>, {
				serviceId: this.providerId,
				runtimeProfileId: this.resolveActiveProfileName(),
			}) ?? "default";
		const key = `${profileName}:${this.providerId}:${accountId}`;
		let governor = this.browserInteractionGovernors.get(key);
		if (!governor) {
			governor = createBrowserInteractionGovernor(policy);
			this.browserInteractionGovernors.set(key, governor);
		}
		return governor;
	}

	private resolveConfiguredLiveFollow(): Record<string, unknown> | null {
		const globalService = this.userConfig.services?.[this.providerId];
		const globalLiveFollow = isRecord(globalService?.liveFollow) ? globalService.liveFollow : null;
		const profileName = this.resolveActiveProfileName();
		if (!profileName) return globalLiveFollow;
		const profile = getPreferredRuntimeProfile(this.userConfig, {
			explicitProfileName: profileName,
		});
		const profileServices =
			profile?.services && typeof profile.services === "object"
				? (profile.services as Record<string, unknown>)
				: null;
		const profileService =
			profileServices && this.providerId in profileServices
				? (profileServices[this.providerId] as Record<string, unknown> | undefined)
				: undefined;
		return isRecord(profileService?.liveFollow) ? profileService.liveFollow : globalLiveFollow;
	}

	protected scopeConversationListOptions(
		listOptions: BrowserProviderListOptions,
		projectId?: string,
	): BrowserProviderListOptions {
		const normalizedProjectId = typeof projectId === "string" ? projectId.trim() : "";
		if (!normalizedProjectId) {
			if (!Object.hasOwn(listOptions, "projectId")) return listOptions;
			const { projectId: _projectId, ...rest } = listOptions;
			return rest;
		}
		if (listOptions.projectId === normalizedProjectId) return listOptions;
		return {
			...listOptions,
			projectId: normalizedProjectId,
		};
	}

	protected getResolvedUserConfig(): ResolvedUserConfig {
		return this.userConfig;
	}

	protected getBrowserService(): BrowserService {
		return this.browserService;
	}

	protected async overlayConversationListFromCache(
		items: Conversation[],
		listOptions: BrowserProviderListOptions,
		projectId?: string,
	): Promise<Conversation[]> {
		if (projectId || items.length === 0) {
			return items;
		}
		const cacheContext = await this.resolveCacheContext(listOptions);
		await this.cacheStore.writeConversations(cacheContext, items);
		const cached = await this.cacheStore.readConversations(cacheContext);
		return cached.items;
	}

	private async resolveProjectCacheContext(
		listOptions: BrowserProviderListOptions,
	): Promise<CacheContext> {
		const globalListOptions = Object.hasOwn(listOptions, "projectId")
			? { ...listOptions, projectId: undefined }
			: listOptions;
		return this.resolveCacheContext(globalListOptions);
	}

	private async upsertProjectCacheEntry(
		listOptions: BrowserProviderListOptions,
		project: Project,
	): Promise<void> {
		const cacheContext = await this.resolveProjectCacheContext(listOptions);
		const cached = await this.cacheStore.readProjects(cacheContext);
		const merged = new Map(cached.items.map((entry) => [entry.id, entry] as const));
		const existing = merged.get(project.id);
		merged.set(project.id, {
			...existing,
			...project,
			name: project.name || existing?.name || project.id,
			provider: project.provider || existing?.provider || this.providerId,
			url: project.url ?? existing?.url,
			memoryMode: project.memoryMode ?? existing?.memoryMode,
		});
		await this.cacheStore.writeProjects(cacheContext, Array.from(merged.values()));
	}

	private async renameProjectCacheEntry(
		listOptions: BrowserProviderListOptions,
		projectId: string,
		newTitle: string,
	): Promise<void> {
		const cacheContext = await this.resolveProjectCacheContext(listOptions);
		const cached = await this.cacheStore.readProjects(cacheContext);
		const items = cached.items.map((entry) =>
			entry.id === projectId
				? {
						...entry,
						name: newTitle,
					}
				: entry,
		);
		if (!items.some((entry) => entry.id === projectId)) {
			items.push({
				id: projectId,
				name: newTitle,
				provider: this.providerId,
				url: this.provider.resolveProjectUrl?.(projectId) ?? undefined,
			});
		}
		await this.cacheStore.writeProjects(cacheContext, items);
	}

	private async removeProjectCacheEntry(
		listOptions: BrowserProviderListOptions,
		projectId: string,
	): Promise<void> {
		const cacheContext = await this.resolveProjectCacheContext(listOptions);
		const cached = await this.cacheStore.readProjects(cacheContext);
		await this.cacheStore.writeProjects(
			cacheContext,
			cached.items.filter((entry) => entry.id !== projectId),
		);
	}

	abstract listProjects(options?: BrowserProviderListOptions): Promise<ProjectListResult>;

	abstract listConversations(
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<ConversationListResult>;

	async preparePromptWorkbench(
		input: PromptWorkbenchInput,
		options?: BrowserProviderListOptions,
	): Promise<PromptWorkbenchResult> {
		if (!this.provider.preparePromptWorkbench) {
			throw new Error(`Prompt workbench preparation is not supported for ${this.providerId}.`);
		}
		const configuredUrl =
			input.targetUrl ??
			input.configuredUrl ??
			options?.configuredUrl ??
			input.listOptions?.configuredUrl ??
			this.getConfiguredUrl() ??
			this.getDefaultLaunchUrl();
		const listOptions = await this.buildListOptions(
			{ ...(options ?? input.listOptions), configuredUrl },
			{ ensurePort: true },
		);
		return this.provider.preparePromptWorkbench(
			{
				targetUrl: configuredUrl,
				desiredModel: input.desiredModel,
				modelStrategy: input.modelStrategy,
				chatgptMode: input.chatgptMode,
				workModel: input.workModel,
				inputTimeoutMs: input.inputTimeoutMs,
				onProgress: input.onProgress,
			},
			listOptions,
		);
	}
	async runPrompt(input: PromptInput, options?: BrowserProviderListOptions): Promise<PromptResult> {
		if (!this.provider.runPrompt) {
			throw new Error(`Prompt execution is not supported for ${this.providerId}.`);
		}
		const configuredUrl =
			input.configuredUrl ??
			options?.configuredUrl ??
			input.listOptions?.configuredUrl ??
			this.getConfiguredUrl() ??
			this.getDefaultLaunchUrl();
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(
				{ ...(options ?? input.listOptions), configuredUrl },
				{ ensurePort: true },
			),
			input.projectId ?? undefined,
		);
		const plan = await this.planPrompt({
			configuredUrl,
			projectId: input.projectId,
			projectName: input.projectName,
			conversationId: input.conversationId,
			conversationName: input.conversationName,
			noProject: input.noProject,
			allowAutoRefresh: input.allowAutoRefresh,
			forceProjectRefresh: input.forceProjectRefresh,
			forceConversationRefresh: input.forceConversationRefresh,
			listOptions,
		});
		return this.withRetry(
			() =>
				this.provider.runPrompt?.(
					{
						prompt: input.prompt,
						attachments: input.attachments,
						libraryFiles: input.libraryFiles,
						capabilityId: input.capabilityId,
						completionMode: input.completionMode,
						targetUrl: plan.targetUrl,
						projectId: plan.projectId,
						conversationId: plan.conversationId,
						desiredModel: input.desiredModel,
						modelStrategy: input.modelStrategy,
						thinkingTime: input.thinkingTime,
						chatgptMode: input.chatgptMode,
						workModel: input.workModel,
						modelSelector: input.modelSelector,
						timeoutMs: input.timeoutMs,
						onProgress: input.onProgress,
					},
					this.scopeConversationListOptions(listOptions, plan.projectId ?? undefined),
				) as Promise<PromptResult>,
			{ action: "runPrompt", abortSignal: listOptions.abortSignal },
		);
	}

	abstract renameConversation(
		conversationId: string,
		newTitle: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void>;

	abstract deleteConversation(
		conversationId: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void>;

	abstract getUserIdentity(
		options?: BrowserProviderListOptions,
	): Promise<ProviderUserIdentity | null>;

	async renameProject(
		projectId: string,
		newTitle: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.renameProject) {
			throw new Error(`Project rename is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.ensureValidProjectUrl(projectId, { listOptions });
		await this.withRetry(
			() => this.provider.renameProject?.(projectId, newTitle, listOptions) as Promise<void>,
			{
				action: "renameProject",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
		await this.renameProjectCacheEntry(listOptions, projectId, newTitle);
	}

	async cloneProject(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<Project | null> {
		if (!this.provider.cloneProject) {
			throw new Error(`Project clone is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.ensureValidProjectUrl(projectId, { listOptions });
		const created = await this.withRetry(
			() => this.provider.cloneProject?.(projectId, listOptions) as Promise<Project | null>,
			{
				action: "cloneProject",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
		if (created?.id) {
			await this.upsertProjectCacheEntry(listOptions, created);
		}
		return created ?? null;
	}

	async openProjectMenu(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.openProjectMenu) {
			throw new Error(`Project menu is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.openProjectMenu?.(projectId, listOptions) as Promise<void>,
			{
				action: "openProjectMenu",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async selectRenameProjectItem(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.selectRenameProjectItem) {
			throw new Error(`Project rename menu item is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.selectRenameProjectItem?.(projectId, listOptions) as Promise<void>,
			{
				action: "selectRenameProjectItem",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async selectCloneProjectItem(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.selectCloneProjectItem) {
			throw new Error(`Project clone menu item is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.selectCloneProjectItem?.(projectId, listOptions) as Promise<void>,
			{
				action: "selectCloneProjectItem",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async selectRemoveProjectItem(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.selectRemoveProjectItem) {
			throw new Error(`Project remove menu item is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.ensureValidProjectUrl(projectId, { listOptions });
		await this.withRetry(
			() => this.provider.selectRemoveProjectItem?.(projectId, listOptions) as Promise<void>,
			{
				action: "selectRemoveProjectItem",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async pushProjectRemoveConfirmation(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.pushProjectRemoveConfirmation) {
			throw new Error(`Project remove confirmation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.pushProjectRemoveConfirmation?.(projectId, listOptions) as Promise<void>,
			{
				action: "pushProjectRemoveConfirmation",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
		await this.removeProjectCacheEntry(listOptions, projectId);
	}

	async ensureValidProjectUrl(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.validateProjectUrl) return;
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.validateProjectUrl?.(projectId, listOptions) as Promise<void>,
			{ action: "validateProjectUrl" },
		);
	}

	async ensureValidConversationUrl(
		conversationId: string,
		options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.validateConversationUrl) return;
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.validateConversationUrl?.(
					conversationId,
					options?.projectId,
					listOptions,
				) as Promise<void>,
			{ action: "validateConversationUrl" },
		);
	}

	async openCreateProjectModal(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.openCreateProjectModal) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.openCreateProjectModal?.(listOptions) as Promise<void>,
			{
				action: "openCreateProjectModal",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async setCreateProjectFields(
		fields: {
			name?: string;
			instructions?: string;
			modelLabel?: string;
			memoryMode?: ProjectMemoryMode;
		},
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.setCreateProjectFields) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.setCreateProjectFields?.(fields, listOptions) as Promise<void>,
			{
				action: "setCreateProjectFields",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async clickCreateProjectNext(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.clickCreateProjectNext) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.clickCreateProjectNext?.(listOptions) as Promise<void>,
			{
				action: "clickCreateProjectNext",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async clickCreateProjectAttach(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.clickCreateProjectAttach) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.clickCreateProjectAttach?.(listOptions) as Promise<void>,
			{
				action: "clickCreateProjectAttach",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async clickCreateProjectUploadFile(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.clickCreateProjectUploadFile) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.clickCreateProjectUploadFile?.(listOptions) as Promise<void>,
			{
				action: "clickCreateProjectUploadFile",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async uploadCreateProjectFiles(
		paths: string[],
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.uploadCreateProjectFiles) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.uploadCreateProjectFiles?.(paths, listOptions) as Promise<void>,
			{
				action: "uploadCreateProjectFiles",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async uploadProjectFiles(
		projectId: string,
		paths: string[],
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.uploadProjectFiles) {
			throw new Error(`Project file upload is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.uploadProjectFiles?.(projectId, paths, listOptions) as Promise<void>,
			{ action: "uploadProjectFiles" },
		);
		await this.refreshProjectKnowledgeCache(projectId, listOptions);
	}

	async uploadAccountFiles(
		paths: string[],
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.uploadAccountFiles) {
			throw new Error(`Account file upload is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.uploadAccountFiles?.(paths, listOptions) as Promise<void>,
			{ action: "uploadAccountFiles" },
		);
		await this.refreshAccountFilesCache(listOptions);
	}

	async deleteProjectFile(
		projectId: string,
		fileName: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.deleteProjectFile) {
			throw new Error(`Project file deletion is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.deleteProjectFile?.(projectId, fileName, listOptions) as Promise<void>,
			{ action: "deleteProjectFile" },
		);
		await this.refreshProjectKnowledgeCache(projectId, listOptions);
	}

	async deleteAccountFile(
		fileId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<void> {
		if (!this.provider.deleteAccountFile) {
			throw new Error(`Account file deletion is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.deleteAccountFile?.(fileId, listOptions) as Promise<void>,
			{ action: "deleteAccountFile" },
		);
		await this.refreshAccountFilesCache(listOptions);
	}

	async listProjectFiles(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<FileRef[]> {
		if (!this.provider.listProjectFiles) {
			throw new Error(`Project file listing is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		recordBrowserScrapeProviderAction(listOptions, "llmService.listProjectFiles");
		return this.refreshProjectKnowledgeCache(projectId, listOptions);
	}

	async materializeProjectFiles(
		projectId: string,
		options?: {
			listOptions?: BrowserProviderListOptions;
			maxItems?: number | null;
			files?: FileRef[] | null;
		},
	): Promise<{ projectFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		const projectFiles = limitItems(
			Array.isArray(options?.files)
				? options.files
				: await this.listProjectFiles(projectId, { listOptions }),
			options?.maxItems,
		);
		if (projectFiles.length === 0) {
			return { projectFiles: [], files: [], manifestPath: null };
		}
		const cacheContext = await this.resolveCacheContext(listOptions);
		const { cacheDir } = resolveProviderCachePath(
			cacheContext,
			`project-knowledge/${projectId}/manifest.json`,
		);
		const filesDir = path.join(cacheDir, "project-knowledge", projectId, "files");
		const manifestPath = path.join(
			cacheDir,
			"project-knowledge",
			projectId,
			"file-fetch-manifest.json",
		);
		await fs.mkdir(filesDir, { recursive: true });
		const existing = await this.cacheStore.readProjectKnowledge(cacheContext, projectId);
		const merged = new Map(existing.items.map((item) => [item.id, item]));
		const materialized: FileRef[] = [];
		const manifestEntries: AccountFileFetchManifestEntry[] = [];
		for (const file of projectFiles) {
			const existingLocal =
				file.localPath && (await pathExists(file.localPath)) ? file.localPath : null;
			const fileDir = path.join(
				filesDir,
				sanitizeArtifactPathSegment(
					file.id || file.name || `project-file-${materialized.length + 1}`,
				),
			);
			await fs.mkdir(fileDir, { recursive: true });
			const destPath = path.join(
				fileDir,
				sanitizeConversationFileName(
					file.name || file.id || `project-file-${materialized.length + 1}`,
					"project-file",
				),
			);
			try {
				if (existingLocal) {
					const stat = await fs.stat(existingLocal);
					const checksumSha256 = file.checksumSha256 ?? (await calculateSha256(existingLocal));
					const materializedFile: FileRef = {
						...file,
						size: file.size ?? stat.size,
						localPath: existingLocal,
						checksumSha256,
						metadata: {
							...file.metadata,
							projectSourceMaterialization: "existing-local-file",
						},
					};
					materialized.push(materializedFile);
					merged.set(materializedFile.id, materializedFile);
					manifestEntries.push({
						fileId: file.id,
						fileName: file.name,
						status: "materialized",
						localPath: existingLocal,
						remoteUrl: file.remoteUrl ?? null,
						mimeType: materializedFile.mimeType,
						size: materializedFile.size,
						materializationMethod: "existing-local-file",
					});
					continue;
				}
				if (!this.provider.downloadProjectFile) {
					throw new Error("project_source_download_unsupported");
				}
				await this.withRetry(
					() =>
						this.provider.downloadProjectFile?.(
							projectId,
							file.id,
							destPath,
							listOptions,
						) as Promise<void>,
					{ action: "downloadProjectFile" },
				);
				const stat = await fs.stat(destPath);
				const checksumSha256 = await calculateSha256(destPath);
				const materializedFile: FileRef = {
					...file,
					size: stat.size,
					localPath: destPath,
					checksumSha256,
				};
				materialized.push(materializedFile);
				merged.set(materializedFile.id, materializedFile);
				manifestEntries.push({
					fileId: file.id,
					fileName: file.name,
					status: "materialized",
					localPath: destPath,
					remoteUrl: file.remoteUrl ?? null,
					mimeType: materializedFile.mimeType,
					size: stat.size,
					materializationMethod:
						typeof file.metadata?.materializationSurface === "string"
							? file.metadata.materializationSurface
							: "project-source-download",
				});
			} catch (error) {
				manifestEntries.push({
					fileId: file.id,
					fileName: file.name,
					status: "error",
					remoteUrl: file.remoteUrl ?? null,
					mimeType: file.mimeType,
					error: normalizeArtifactFetchError(error),
				});
			}
		}
		if (materialized.length > 0) {
			await this.cacheStore.writeProjectKnowledge(
				cacheContext,
				projectId,
				Array.from(merged.values()),
			);
		}
		const manifest: ProjectFileFetchManifest = {
			provider: this.providerId,
			projectId,
			generatedAt: new Date().toISOString(),
			fileCount: projectFiles.length,
			materializedCount: materialized.length,
			entries: manifestEntries,
		};
		await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
		return { projectFiles, files: materialized, manifestPath };
	}

	async listAccountFiles(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<FileRef[]> {
		if (!this.provider.listAccountFiles) {
			throw new Error(`Account file listing is not supported for ${this.providerId}.`);
		}
		recordLibraryInventoryStage(options?.listOptions, "service-build-list-options");
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		recordBrowserScrapeProviderAction(listOptions, "llmService.listAccountFiles");
		recordLibraryInventoryStage(listOptions, "service-provider-read");
		return this.refreshAccountFilesCache(listOptions);
	}

	async downloadAccountFile(
		fileId: string,
		destPath: string,
		options?: { listOptions?: BrowserProviderListOptions; file?: FileRef },
	): Promise<void> {
		if (!this.provider.downloadAccountFile) {
			throw new Error(`Account file fetch is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.downloadAccountFile?.(
					fileId,
					destPath,
					listOptions,
					options?.file,
				) as Promise<void>,
			{ action: "downloadAccountFile" },
		);
	}

	async materializeAccountFiles(options?: {
		listOptions?: BrowserProviderListOptions;
		maxItems?: number | null;
		files?: FileRef[] | null;
	}): Promise<{ accountFiles: FileRef[]; files: FileRef[]; manifestPath: string | null }> {
		if (!this.provider.downloadAccountFile) {
			throw new Error(`Account file fetch is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		const accountFiles = limitItems(
			Array.isArray(options?.files) ? options.files : await this.listAccountFiles({ listOptions }),
			options?.maxItems,
		);
		if (accountFiles.length === 0) {
			return { accountFiles: [], files: [], manifestPath: null };
		}
		const cacheContext = await this.resolveCacheContext(listOptions);
		const { cacheDir } = resolveProviderCachePath(cacheContext, "account-files/manifest.json");
		const filesDir = path.join(cacheDir, "account-files", "files");
		const manifestPath = path.join(cacheDir, "account-files", "file-fetch-manifest.json");
		await fs.mkdir(filesDir, { recursive: true });
		const existing = await this.cacheStore.readAccountFiles(cacheContext);
		const merged = new Map(existing.items.map((item) => [item.id, item]));
		const materialized: FileRef[] = [];
		const manifestEntries: AccountFileFetchManifestEntry[] = [];
		for (const file of accountFiles) {
			const fileDir = path.join(
				filesDir,
				sanitizeArtifactPathSegment(
					file.id || file.name || `account-file-${materialized.length + 1}`,
				),
			);
			await fs.mkdir(fileDir, { recursive: true });
			const destPath = path.join(
				fileDir,
				sanitizeConversationFileName(
					file.name || file.id || `account-file-${materialized.length + 1}`,
					"account-file",
				),
			);
			try {
				await this.withRetry(
					() =>
						this.provider.downloadAccountFile?.(
							file.id,
							destPath,
							listOptions,
							file,
						) as Promise<void>,
					{ action: "downloadAccountFile" },
				);
				const stat = await fs.stat(destPath);
				const checksumSha256 = await calculateSha256(destPath);
				const materializedFile: FileRef = {
					...file,
					size: stat.size,
					localPath: destPath,
					checksumSha256,
					metadata: {
						...file.metadata,
						accountFileMaterialization: "account-file-download",
					},
				};
				materialized.push(materializedFile);
				merged.set(materializedFile.id, materializedFile);
				manifestEntries.push({
					fileId: file.id,
					fileName: file.name,
					status: "materialized",
					localPath: destPath,
					remoteUrl: file.remoteUrl ?? null,
					mimeType: materializedFile.mimeType,
					size: stat.size,
					materializationMethod:
						typeof file.metadata?.materializationSurface === "string"
							? file.metadata.materializationSurface
							: "account-file-download",
				});
			} catch (error) {
				manifestEntries.push({
					fileId: file.id,
					fileName: file.name,
					status: "error",
					remoteUrl: file.remoteUrl ?? null,
					mimeType: file.mimeType,
					error: normalizeArtifactFetchError(error),
				});
			}
		}
		if (materialized.length > 0) {
			await this.cacheStore.writeAccountFiles(cacheContext, Array.from(merged.values()));
		}
		const manifest: AccountFileFetchManifest = {
			provider: this.providerId,
			generatedAt: new Date().toISOString(),
			fileCount: accountFiles.length,
			materializedCount: materialized.length,
			entries: manifestEntries,
		};
		await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
		return { accountFiles, files: materialized, manifestPath };
	}

	async listConversationFiles(
		conversationId: string,
		options?: {
			projectId?: string;
			listOptions?: BrowserProviderListOptions;
			contextTimeoutMs?: number;
		},
	): Promise<FileRef[]> {
		const listOptions = this.scopeConversationListOptions(
			options?.listOptions?.useProviderSession
				? options.listOptions
				: await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		recordBrowserScrapeProviderAction(listOptions, "llmService.listConversationFiles");
		if (this.provider.listConversationFiles) {
			return this.refreshConversationFilesCache(conversationId, listOptions);
		}
		if (!this.provider.readConversationContext) {
			throw new Error(`Conversation file listing is not supported for ${this.providerId}.`);
		}
		const context = await this.getConversationContext(conversationId, {
			projectId: options?.projectId,
			timeoutMs: options?.contextTimeoutMs,
			listOptions,
		});
		const normalizedFiles = Array.isArray(context.files) ? context.files : [];
		const cacheContext = await this.resolveCacheContext(listOptions);
		await this.cacheStore.writeConversationFiles(cacheContext, conversationId, normalizedFiles);
		return normalizedFiles;
	}

	async materializeConversationArtifacts(
		conversationId: string,
		options?: {
			projectId?: string;
			listOptions?: BrowserProviderListOptions;
			contextTimeoutMs?: number;
			refresh?: boolean;
			force?: boolean;
			maxItems?: number | null;
			excludeArtifact?: (
				artifact: ConversationArtifact,
				candidates: ConversationArtifact[],
			) => boolean;
		},
	): Promise<{
		artifacts: ConversationArtifact[];
		files: FileRef[];
		manifestPath: string | null;
		pendingArtifactCount?: number;
		unavailableArtifacts: Array<{
			artifact: ConversationArtifact;
			reason: typeof CHATGPT_MISSING_LIVE_CONTROL_REASON;
		}>;
	}> {
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		listOptions.useProviderSession = true;
		const shouldCloseProviderSession = listOptions.keepProviderSessionOpen !== true;
		try {
			recordBrowserScrapeProviderAction(listOptions, "llmService.materializeConversationArtifacts");
			const context = await this.getConversationContext(conversationId, {
				projectId: options?.projectId,
				refresh: options?.refresh ?? true,
				allowCacheFallback: false,
				timeoutMs: options?.contextTimeoutMs,
				listOptions,
			});
			const contextArtifacts = Array.isArray(context.artifacts) ? context.artifacts : [];
			const reconciledArtifactCandidates =
				this.providerId === "chatgpt"
					? reconcileChatgptPayloadDownloadControls(contextArtifacts)
					: contextArtifacts;
			const eligibleArtifactCandidates = selectEligibleConversationArtifacts(
				this.providerId,
				reconciledArtifactCandidates,
			);
			const selectedArtifactCandidates = eligibleArtifactCandidates.filter(
				(artifact) => options?.excludeArtifact?.(artifact, eligibleArtifactCandidates) !== true,
			);
			const unavailableArtifacts = selectedArtifactCandidates
				.filter(isChatgptArtifactMissingLiveControl)
				.map((artifact) => ({
					artifact,
					reason: CHATGPT_MISSING_LIVE_CONTROL_REASON,
				}));
			const artifactCandidates = selectMaterializableConversationArtifacts(
				this.providerId,
				selectedArtifactCandidates.filter(
					(artifact) => !isChatgptArtifactMissingLiveControl(artifact),
				),
			);
			let artifacts = artifactCandidates;
			if (listOptions.useProviderSession === true) {
				listOptions.skipFeatureSignature = true;
				if (listOptions.preserveInteractionGovernorForProviderSession !== true) {
					listOptions.interactionGovernor = undefined;
					recordBrowserScrapeProviderAction(
						listOptions,
						"llmService.scopedArtifactTransfersBypassInteractionGovernor",
					);
				}
			}
			recordBrowserScrapeCandidateCount(
				listOptions,
				"llmService.materializeConversationArtifacts.artifacts",
				artifacts.length,
			);
			if (artifacts.length === 0) {
				return {
					artifacts: [],
					files: [],
					manifestPath: null,
					pendingArtifactCount: 0,
					unavailableArtifacts,
				};
			}
			if (!this.provider.materializeConversationArtifact) {
				throw new Error(`Conversation artifact fetch is not supported for ${this.providerId}.`);
			}
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationArtifacts.prepareCache",
			);
			const cacheContext = await this.resolveCacheContext(listOptions, {
				detect: false,
				prompt: false,
			});
			const { cacheDir } = resolveProviderCachePath(
				cacheContext,
				`conversation-attachments/${conversationId}/manifest.json`,
			);
			const attachmentsDir = path.join(
				cacheDir,
				"conversation-attachments",
				conversationId,
				"files",
			);
			const manifestPath = path.join(
				cacheDir,
				"conversation-attachments",
				conversationId,
				"artifact-fetch-manifest.json",
			);
			await fs.mkdir(attachmentsDir, { recursive: true });
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationArtifacts.readExisting",
			);
			const existing = await this.cacheStore.readConversationAttachments(
				cacheContext,
				conversationId,
			);
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationArtifacts.beginTransfers",
			);

			const reusable = new Map<string, FileRef>();
			if (options?.force !== true) {
				for (const artifact of artifacts) {
					const file = await findReusableConversationArtifact(artifact, existing.items);
					if (file) reusable.set(artifact.id, file);
				}
			}
			const transfers = new Set(
				limitItems(
					artifacts.filter((artifact) => !reusable.has(artifact.id)),
					options?.maxItems,
				).map((artifact) => artifact.id),
			);
			const pendingArtifactCount = artifacts.filter(
				(artifact) => !reusable.has(artifact.id) && !transfers.has(artifact.id),
			).length;
			artifacts = artifacts.filter(
				(artifact) => reusable.has(artifact.id) || transfers.has(artifact.id),
			);
			const merged = new Map(existing.items.map((item) => [item.id, item]));
			const materialized: FileRef[] = [];
			const manifestEntries: ConversationArtifactFetchManifestEntry[] = [];
			for (const artifact of artifacts) {
				recordBrowserScrapeProviderAction(
					listOptions,
					"llmService.materializeConversationArtifacts.transferCandidate",
				);
				const cachedFile = reusable.get(artifact.id);
				if (cachedFile) {
					recordBrowserScrapeProviderAction(
						listOptions,
						"llmService.materializeConversationArtifacts.reuseVerifiedCache",
					);
					materialized.push(cachedFile);
					merged.set(cachedFile.id, cachedFile);
					manifestEntries.push({
						artifactId: artifact.id,
						title: artifact.title,
						kind: artifact.kind,
						uri: artifact.uri ?? null,
						status: "materialized",
						fileId: cachedFile.id,
						fileName: cachedFile.name,
						localPath: cachedFile.localPath,
						remoteUrl: cachedFile.remoteUrl ?? artifact.uri ?? null,
						mimeType: cachedFile.mimeType,
						size: cachedFile.size,
						materializationMethod: "cached-provider-file",
					});
					continue;
				}
				const artifactDir = path.join(
					attachmentsDir,
					sanitizeArtifactPathSegment(
						artifact.id || artifact.title || `artifact-${materialized.length + 1}`,
					),
				);
				await fs.mkdir(artifactDir, { recursive: true });
				try {
					const file = await this.withRetry(
						() => {
							recordBrowserScrapeProviderAction(
								listOptions,
								"llmService.materializeConversationArtifacts.invokeProvider",
							);
							return this.provider.materializeConversationArtifact?.(
								conversationId,
								artifact,
								artifactDir,
								options?.projectId,
								listOptions,
							) as Promise<FileRef | null>;
						},
						{
							action: "materializeConversationArtifact",
							skipPostCommitQuiet: listOptions.useProviderSession === true,
							beforeRetry:
								listOptions.useProviderSession === true
									? async () => {
											recordBrowserScrapeProviderAction(
												listOptions,
												"llmService.materializeConversationArtifacts.rebindScopedSession",
											);
											await closeScopedProviderSession(listOptions);
										}
									: undefined,
						},
					);
					if (!file) {
						manifestEntries.push({
							artifactId: artifact.id,
							title: artifact.title,
							kind: artifact.kind,
							uri: artifact.uri ?? null,
							status: "skipped",
						});
						continue;
					}
					if (file.localPath && (await fs.stat(file.localPath).catch(() => null))?.isFile()) {
						file.checksumSha256 = await calculateSha256(file.localPath);
					}
					materialized.push(file);
					merged.set(file.id, file);
					manifestEntries.push({
						artifactId: artifact.id,
						title: artifact.title,
						kind: artifact.kind,
						uri: artifact.uri ?? null,
						status: "materialized",
						fileId: file.id,
						fileName: file.name,
						localPath: file.localPath,
						remoteUrl: file.remoteUrl ?? artifact.uri ?? null,
						mimeType: file.mimeType,
						size: file.size,
						materializationMethod:
							typeof file.metadata?.materializationSurface === "string"
								? file.metadata.materializationSurface
								: typeof file.metadata?.materialization === "string"
									? file.metadata.materialization
									: "provider-download",
					});
				} catch (error) {
					manifestEntries.push({
						artifactId: artifact.id,
						title: artifact.title,
						kind: artifact.kind,
						uri: artifact.uri ?? null,
						status: "error",
						error: normalizeArtifactFetchError(error),
					});
				} finally {
					if (listOptions.useProviderSession === true) {
						recordBrowserScrapeProviderAction(
							listOptions,
							"llmService.materializeConversationArtifacts.settleCandidateSession",
						);
						await closeScopedProviderSession(listOptions);
					}
				}
			}
			if (materialized.length > 0) {
				await this.cacheStore.writeConversationAttachments(
					cacheContext,
					conversationId,
					Array.from(merged.values()),
				);
			}
			const manifest: ConversationArtifactFetchManifest = {
				provider: this.providerId,
				conversationId,
				projectId: options?.projectId ?? null,
				generatedAt: new Date().toISOString(),
				artifactCount: artifacts.length,
				materializedCount: materialized.length,
				scrapeTelemetry: snapshotBrowserScrapeTelemetry(listOptions.scrapeTelemetry),
				entries: manifestEntries,
			};
			await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
			return {
				artifacts,
				files: materialized,
				manifestPath,
				pendingArtifactCount,
				unavailableArtifacts,
			};
		} finally {
			if (shouldCloseProviderSession) {
				await closeScopedProviderSession(listOptions);
			}
		}
	}

	async materializeConversationArtifact(
		conversationId: string,
		artifact: ConversationArtifact,
		destDir: string,
		options?: { projectId?: string; listOptions?: BrowserProviderListOptions },
	): Promise<FileRef | null> {
		if (!this.provider.materializeConversationArtifact) {
			throw new Error(`Conversation artifact fetch is not supported for ${this.providerId}.`);
		}
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		return this.withRetry(
			() =>
				this.provider.materializeConversationArtifact?.(
					conversationId,
					artifact,
					destDir,
					options?.projectId,
					listOptions,
				) as Promise<FileRef | null>,
			{
				action: "materializeConversationArtifact",
				beforeRetry:
					listOptions.useProviderSession === true
						? async () => {
								recordBrowserScrapeProviderAction(
									listOptions,
									"llmService.materializeConversationArtifact.rebindScopedSession",
								);
								await closeScopedProviderSession(listOptions);
							}
						: undefined,
			},
		);
	}

	async materializeActiveMediaArtifacts(
		input: BrowserProviderActiveMediaMaterializationInput,
		destDir: string,
		options?: BrowserProviderListOptions,
	): Promise<FileRef[]> {
		if (!this.provider.materializeActiveMediaArtifacts) {
			throw new Error(`Active media artifact fetch is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		return this.withRetry(
			() =>
				this.provider.materializeActiveMediaArtifacts?.(input, destDir, listOptions) as Promise<
					FileRef[]
				>,
			{ action: "materializeActiveMediaArtifacts" },
		);
	}

	async materializeConversationFiles(
		conversationId: string,
		options?: {
			projectId?: string;
			listOptions?: BrowserProviderListOptions;
			contextTimeoutMs?: number;
			refresh?: boolean;
			maxItems?: number | null;
			excludeFile?: (file: FileRef) => boolean;
		},
	): Promise<{
		conversationFiles: FileRef[];
		knownConversationFileCount: number;
		files: FileRef[];
		manifestPath: string | null;
	}> {
		if (!this.provider.downloadConversationFile && !this.provider.downloadConversationFiles) {
			throw new Error(`Conversation file fetch is not supported for ${this.providerId}.`);
		}
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		listOptions.useProviderSession = true;
		const shouldCloseProviderSession = listOptions.keepProviderSessionOpen !== true;
		try {
			recordBrowserScrapeProviderAction(listOptions, "llmService.materializeConversationFiles");
			if (listOptions.useProviderSession === true) {
				listOptions.skipFeatureSignature = true;
				recordBrowserScrapeProviderAction(
					listOptions,
					"llmService.scopedFileListingUsesInitialInteractionGovernor",
				);
			}
			let listedConversationFiles: FileRef[] = [];
			if (options?.refresh === false) {
				recordBrowserScrapeProviderAction(
					listOptions,
					"llmService.materializeConversationFiles.reuseRefreshedCache",
				);
				const cacheContext = await this.resolveCacheContext(listOptions, {
					detect: false,
					prompt: false,
				});
				const cachedConversationFiles = await this.cacheStore.readConversationFiles(
					cacheContext,
					conversationId,
				);
				listedConversationFiles = Array.isArray(cachedConversationFiles.items)
					? cachedConversationFiles.items
					: [];
				if (listedConversationFiles.length === 0) {
					const cachedConversationContext = await this.cacheStore.readConversationContext(
						cacheContext,
						conversationId,
					);
					listedConversationFiles = Array.isArray(cachedConversationContext.items.files)
						? cachedConversationContext.items.files
						: [];
					if (listedConversationFiles.length > 0) {
						recordBrowserScrapeProviderAction(
							listOptions,
							"llmService.materializeConversationFiles.reuseRefreshedContext",
						);
					}
				}
			} else {
				try {
					listedConversationFiles = await Promise.race([
						this.listConversationFiles(conversationId, {
							projectId: options?.projectId,
							contextTimeoutMs: options?.contextTimeoutMs,
							listOptions,
						}),
						timeoutAfter<FileRef[]>(
							SCOPED_CONVERSATION_FILE_LIST_TIMEOUT_MS,
							`Timed out listing scoped conversation files after ${SCOPED_CONVERSATION_FILE_LIST_TIMEOUT_MS}ms.`,
						),
					]);
				} catch {
					recordBrowserScrapeProviderAction(
						listOptions,
						"llmService.materializeConversationFiles.listTimedOut",
					);
					listedConversationFiles = [];
				}
			}
			const conversationFiles = limitItems(
				listedConversationFiles.filter((file) => options?.excludeFile?.(file) !== true),
				options?.maxItems,
			);
			const knownConversationFileCount = listedConversationFiles.length;
			if (listOptions.useProviderSession === true) {
				listOptions.skipFeatureSignature = true;
				if (listOptions.preserveInteractionGovernorForProviderSession !== true) {
					listOptions.interactionGovernor = undefined;
					recordBrowserScrapeProviderAction(
						listOptions,
						"llmService.scopedFileTransfersBypassInteractionGovernor",
					);
				}
			}
			recordBrowserScrapeCandidateCount(
				listOptions,
				"llmService.materializeConversationFiles.files",
				conversationFiles.length,
			);
			if (conversationFiles.length === 0) {
				return {
					conversationFiles: [],
					knownConversationFileCount,
					files: [],
					manifestPath: null,
				};
			}
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationFiles.prepareCache",
			);
			const cacheContext = await this.resolveCacheContext(listOptions, {
				detect: false,
				prompt: false,
			});
			const { cacheDir } = resolveProviderCachePath(
				cacheContext,
				`conversation-attachments/${conversationId}/manifest.json`,
			);
			const attachmentsDir = path.join(
				cacheDir,
				"conversation-attachments",
				conversationId,
				"files",
			);
			const manifestPath = path.join(
				cacheDir,
				"conversation-attachments",
				conversationId,
				"file-fetch-manifest.json",
			);
			await fs.mkdir(attachmentsDir, { recursive: true });
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationFiles.readExisting",
			);
			const existing = await this.cacheStore.readConversationAttachments(
				cacheContext,
				conversationId,
			);
			recordBrowserScrapeProviderAction(
				listOptions,
				"llmService.materializeConversationFiles.beginTransfers",
			);
			const merged = new Map(existing.items.map((item) => [item.id, item]));
			const materialized: FileRef[] = [];
			const manifestEntries: ConversationFileFetchManifestEntry[] = [];
			const pendingTransfers: BrowserProviderConversationFileDownloadInput[] = [];
			for (const file of conversationFiles) {
				recordBrowserScrapeProviderAction(
					listOptions,
					"llmService.materializeConversationFiles.transferCandidate",
				);
				const cachedSalvageCandidate = await findCachedConversationFileSalvageCandidate({
					currentFile: file,
					cachedFiles: merged,
					conversationId,
					attachmentsDir,
				});
				if (cachedSalvageCandidate) {
					const materializedFile: FileRef = {
						...cachedSalvageCandidate.file,
						metadata: {
							...cachedSalvageCandidate.file.metadata,
							cachedProviderFileReason: "matched-current-provider-detail",
						},
					};
					materialized.push(materializedFile);
					merged.set(materializedFile.id, materializedFile);
					manifestEntries.push({
						fileId: file.id,
						fileName: file.name,
						status: "materialized",
						localPath: materializedFile.localPath,
						remoteUrl: materializedFile.remoteUrl ?? null,
						mimeType: materializedFile.mimeType,
						size: cachedSalvageCandidate.size,
						materializationMethod: "cached-provider-file",
					});
					continue;
				}
				const fileDir = path.join(
					attachmentsDir,
					sanitizeArtifactPathSegment(file.id || file.name || `file-${materialized.length + 1}`),
				);
				await fs.mkdir(fileDir, { recursive: true });
				const destPath = path.join(
					fileDir,
					sanitizeConversationFileName(
						file.name || file.id || `conversation-file-${materialized.length + 1}`,
					),
				);
				pendingTransfers.push({ file, destPath });
			}
			const recordMaterializedTransfer = async (
				transfer: BrowserProviderConversationFileDownloadInput,
			): Promise<void> => {
				const { file, destPath } = transfer;
				try {
					const stat = await fs.stat(destPath);
					const checksumSha256 = await calculateSha256(destPath);
					const materializedFile: FileRef = {
						...file,
						size: stat.size,
						localPath: destPath,
						checksumSha256,
					};
					materialized.push(materializedFile);
					merged.set(materializedFile.id, materializedFile);
					manifestEntries.push({
						fileId: file.id,
						fileName: file.name,
						status: "materialized",
						localPath: destPath,
						remoteUrl: file.remoteUrl ?? null,
						mimeType: materializedFile.mimeType,
						size: stat.size,
						materializationMethod:
							typeof file.metadata?.materializationSurface === "string"
								? file.metadata.materializationSurface
								: "provider-download",
					});
				} catch (error) {
					manifestEntries.push({
						fileId: file.id,
						fileName: file.name,
						status: "error",
						remoteUrl: file.remoteUrl ?? null,
						mimeType: file.mimeType,
						error: normalizeArtifactFetchError(error),
					});
				}
			};
			const recordFailedTransfer = (
				transfer: BrowserProviderConversationFileDownloadInput,
				error: unknown,
				failure?: Pick<
					Extract<BrowserProviderConversationFileDownloadResult, { status: "error" }>,
					"failureKind" | "retryable"
				>,
			): void => {
				manifestEntries.push({
					fileId: transfer.file.id,
					fileName: transfer.file.name,
					status: "error",
					remoteUrl: transfer.file.remoteUrl ?? null,
					mimeType: transfer.file.mimeType,
					error: normalizeArtifactFetchError(error),
					failureKind: failure?.failureKind ?? "retrieval_failed",
					retryable:
						typeof failure?.retryable === "boolean"
							? failure.retryable
							: /rate limit|cooldown|timed out|timeout|temporar(?:y|ily)|try again/i.test(
									normalizeArtifactFetchError(error),
								),
				});
			};
			if (pendingTransfers.length > 0 && this.provider.downloadConversationFiles) {
				recordBrowserScrapeProviderAction(
					listOptions,
					"llmService.materializeConversationFiles.invokeProviderBatch",
				);
				let batchResults: BrowserProviderConversationFileDownloadResult[];
				try {
					batchResults = await this.withRetry(
						() =>
							this.provider.downloadConversationFiles?.(
								conversationId,
								pendingTransfers,
								listOptions,
							) as Promise<BrowserProviderConversationFileDownloadResult[]>,
						{
							action: "downloadConversationFiles",
							retries: 0,
							skipPostCommitQuiet: listOptions.useProviderSession === true,
						},
					);
				} catch (error) {
					batchResults = pendingTransfers.map((transfer) => ({
						fileId: transfer.file.id,
						status: "error",
						error: normalizeArtifactFetchError(error),
					}));
				}
				const outcomes = new Map(batchResults.map((result) => [result.fileId, result]));
				for (const transfer of pendingTransfers) {
					const outcome = outcomes.get(transfer.file.id);
					if (outcome?.status === "materialized") {
						await recordMaterializedTransfer(transfer);
						continue;
					}
					recordFailedTransfer(
						transfer,
						outcome?.status === "error"
							? outcome.error
							: `Provider batch returned no result for ${transfer.file.id}.`,
						outcome?.status === "error" ? outcome : undefined,
					);
				}
			} else {
				for (const transfer of pendingTransfers) {
					try {
						await this.withRetry(
							() => {
								recordBrowserScrapeProviderAction(
									listOptions,
									"llmService.materializeConversationFiles.invokeProvider",
								);
								return this.provider.downloadConversationFile?.(
									conversationId,
									transfer.file.id,
									transfer.destPath,
									listOptions,
									transfer.file,
								) as Promise<void>;
							},
							{
								action: "downloadConversationFile",
								skipPostCommitQuiet: listOptions.useProviderSession === true,
							},
						);
						await recordMaterializedTransfer(transfer);
					} catch (error) {
						recordFailedTransfer(transfer, error);
					}
				}
			}
			if (materialized.length > 0) {
				await this.cacheStore.writeConversationAttachments(
					cacheContext,
					conversationId,
					Array.from(merged.values()),
				);
			}
			const manifest: ConversationFileFetchManifest = {
				provider: this.providerId,
				conversationId,
				projectId: options?.projectId ?? null,
				generatedAt: new Date().toISOString(),
				fileCount: conversationFiles.length,
				materializedCount: materialized.length,
				scrapeTelemetry: snapshotBrowserScrapeTelemetry(listOptions.scrapeTelemetry),
				entries: manifestEntries,
			};
			await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
			return {
				conversationFiles,
				knownConversationFileCount,
				files: materialized,
				manifestPath,
			};
		} finally {
			if (shouldCloseProviderSession) {
				await closeScopedProviderSession(listOptions);
			}
		}
	}

	async clickCreateProjectConfirm(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.clickCreateProjectConfirm) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() => this.provider.clickCreateProjectConfirm?.(listOptions) as Promise<void>,
			{
				action: "clickCreateProjectConfirm",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
	}

	async createProject(
		input: {
			name: string;
			instructions?: string;
			modelLabel?: string;
			files?: string[];
			memoryMode?: ProjectMemoryMode;
		},
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<Project | null> {
		if (!this.provider.createProject) {
			throw new Error(`Project creation is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		if (this.provider.listProjects) {
			const existing = await this.listProjects(listOptions);
			const matched = matchProjectByName(existing, input.name);
			if (matched.match) {
				throw new Error(
					`Project "${input.name}" already exists for ${this.providerId} (${matched.match.id}). ` +
						`Reuse that project instead of creating a duplicate.`,
				);
			}
			if (matched.candidates.length > 1) {
				const names = matched.candidates.map((item) => item.name || item.id).join(", ");
				throw new Error(`Project name "${input.name}" is ambiguous. Matches: ${names}`);
			}
		}
		const created = await this.withRetry(
			() => this.provider.createProject?.(input, listOptions) as Promise<Project | null>,
			{
				action: "createProject",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
		if (created?.id) {
			await this.upsertProjectCacheEntry(listOptions, created);
		}
		if (
			created?.id &&
			typeof input.instructions === "string" &&
			input.instructions.trim().length > 0
		) {
			const cacheContext = await this.resolveCacheContext(listOptions);
			await this.cacheStore.writeProjectInstructions(cacheContext, created.id, input.instructions);
		}
		if (
			created?.id &&
			Array.isArray(input.files) &&
			input.files.length > 0 &&
			this.provider.listProjectFiles
		) {
			await this.refreshProjectKnowledgeCache(created.id, listOptions);
		}
		return created ?? null;
	}

	async toggleProjectSidebar(options?: {
		listOptions?: BrowserProviderListOptions;
	}): Promise<void> {
		if (!this.provider.toggleProjectSidebar) {
			throw new Error(`Project sidebar toggle is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(() => this.provider.toggleProjectSidebar?.(listOptions) as Promise<void>, {
			action: "toggleProjectSidebar",
			retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
		});
	}

	async toggleMainSidebar(options?: { listOptions?: BrowserProviderListOptions }): Promise<void> {
		if (!this.provider.toggleMainSidebar) {
			throw new Error(`Main sidebar toggle is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(() => this.provider.toggleMainSidebar?.(listOptions) as Promise<void>, {
			action: "toggleMainSidebar",
			retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
		});
	}

	async clickHistoryItem(options?: { listOptions?: BrowserProviderListOptions }): Promise<void> {
		if (!this.provider.clickHistoryItem) {
			throw new Error(`History item is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(() => this.provider.clickHistoryItem?.(listOptions) as Promise<void>, {
			action: "clickHistoryItem",
			retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
		});
	}

	async clickHistorySeeAll(options?: { listOptions?: BrowserProviderListOptions }): Promise<void> {
		if (!this.provider.clickHistorySeeAll) {
			throw new Error(`History see-all is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(() => this.provider.clickHistorySeeAll?.(listOptions) as Promise<void>, {
			action: "clickHistorySeeAll",
			retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
		});
	}

	async clickChatArea(options?: { listOptions?: BrowserProviderListOptions }): Promise<void> {
		if (!this.provider.clickChatArea) {
			throw new Error(`Chat area click is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(() => this.provider.clickChatArea?.(listOptions) as Promise<void>, {
			action: "clickChatArea",
			retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
		});
	}

	async updateProjectInstructions(
		projectId: string,
		instructions: string,
		options?: { listOptions?: BrowserProviderListOptions; modelLabel?: string },
	): Promise<void> {
		if (!this.provider.updateProjectInstructions) {
			throw new Error(`Project instructions update is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.updateProjectInstructions?.(
					projectId,
					instructions,
					listOptions,
					options?.modelLabel,
				) as Promise<void>,
			{
				action: "updateProjectInstructions",
				retries: listOptions.disableProviderMutationRetry === true ? 0 : undefined,
			},
		);
		const cacheContext = await this.resolveCacheContext(listOptions);
		await this.cacheStore.writeProjectInstructions(cacheContext, projectId, instructions);
	}

	async getProjectInstructions(
		projectId: string,
		options?: { listOptions?: BrowserProviderListOptions },
	): Promise<{ text: string; model?: string | null }> {
		if (!this.provider.getProjectInstructions) {
			throw new Error(`Project instructions read is not supported for ${this.providerId}.`);
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		const result = await this.withRetry(
			() =>
				this.provider.getProjectInstructions?.(projectId, listOptions) as Promise<{
					text: string;
					model?: string | null;
				}>,
			{ action: "getProjectInstructions" },
		);
		const cacheContext = await this.resolveCacheContext(listOptions);
		await this.cacheStore.writeProjectInstructions(cacheContext, projectId, result.text);
		return result;
	}

	async getConversationContext(
		conversationId: string,
		options?: {
			projectId?: string;
			refresh?: boolean;
			cacheOnly?: boolean;
			allowCacheFallback?: boolean;
			timeoutMs?: number;
			retryAttempts?: number;
			listOptions?: BrowserProviderListOptions;
			onReceipt?: (receipt: ConversationContextReadReceipt) => void | Promise<void>;
		},
	): Promise<ConversationContext> {
		if (!this.provider.readConversationContext) {
			throw new Error(`Conversation context retrieval is not supported for ${this.providerId}.`);
		}
		const providedListOptions = options?.listOptions;
		const retryAttempts = options?.retryAttempts;
		if (
			typeof retryAttempts === "number" &&
			(!Number.isInteger(retryAttempts) || retryAttempts < 0)
		) {
			throw new Error("Conversation context retry attempts must be a non-negative integer.");
		}
		const timeoutMs = resolveConversationContextTimeoutMs(options?.timeoutMs);
		const startedAt = Date.now();
		let attemptCount = 0;
		let lastStage = "preflight:buildListOptions";
		let abortError: ConversationContextReadError | null = null;
		let listOptions: BrowserProviderListOptions = providedListOptions ?? {};
		let scopedListOptions: BrowserProviderListOptions | undefined;
		let pendingProviderRead: Promise<unknown> | undefined;
		let cacheContext = await this.resolveCacheContext(
			{ ...listOptions, skipFeatureSignature: true },
			{ detect: false, prompt: false },
		);
		const controller = new AbortController();
		const callerSignal = providedListOptions?.abortSignal;
		const telemetry =
			providedListOptions?.scrapeTelemetry ?? createBrowserScrapeTelemetryRecorder();
		const originalTelemetryUpdate = telemetry.onUpdate;
		let previousProviderActions = { ...telemetry.providerActions };
		let previousCdpCalls = { ...telemetry.cdpCalls };
		telemetry.onUpdate = () => {
			for (const [action, count] of Object.entries(telemetry.providerActions)) {
				if (count > (previousProviderActions[action] ?? 0)) {
					lastStage = `provider:${action}`;
				}
			}
			for (const [method, count] of Object.entries(telemetry.cdpCalls)) {
				if (count > (previousCdpCalls[method] ?? 0)) {
					lastStage = `cdp:${method}`;
				}
			}
			previousProviderActions = { ...telemetry.providerActions };
			previousCdpCalls = { ...telemetry.cdpCalls };
			originalTelemetryUpdate?.();
		};
		const onCallerAbort = () => {
			abortError = new ConversationContextReadError({
				provider: this.providerId,
				conversationId,
				timeoutMs,
				outcome: "aborted",
			});
			controller.abort(abortError);
		};
		if (callerSignal?.aborted) {
			onCallerAbort();
		} else {
			callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
		}
		const deadlineTimer = scheduleTimer(() => {
			if (controller.signal.aborted) return;
			abortError = new ConversationContextReadError({
				provider: this.providerId,
				conversationId,
				timeoutMs,
				outcome: "timed_out",
			});
			controller.abort(abortError);
		}, timeoutMs);
		const writeReceipt = async (
			outcome: ConversationContextReadOutcome,
			error: unknown,
		): Promise<ConversationContextReadReceipt> => {
			const receipt: ConversationContextReadReceipt = {
				object: "conversation_context_read_receipt",
				version: 1,
				provider: this.providerId,
				accountScopeHash: createHash("sha256")
					.update(resolveProviderCacheKey(cacheContext))
					.digest("hex")
					.slice(0, 16),
				conversationId,
				outcome,
				timeoutMs,
				elapsedMs: Math.max(0, Date.now() - startedAt),
				attemptCount,
				lastStage,
				pendingOperation: telemetry.pendingOperation ?? null,
				completedAt: new Date().toISOString(),
				errorCode: readTerminalErrorCode(error),
			};
			await writeConversationContextReadReceipt(cacheContext, conversationId, receipt);
			try {
				await options?.onReceipt?.(receipt);
			} catch {
				// Receipt observers are diagnostic sinks and must not change the read outcome.
			}
			return receipt;
		};
		try {
			const hasSameServiceSessionAuthorization =
				providedListOptions?.browserService === this.browserService &&
				providedListOptions.providerSessionAuthorization?.authority ===
					this.providerSessionAuthority;
			listOptions =
				providedListOptions?.useProviderSession || hasSameServiceSessionAuthorization
					? providedListOptions
					: await waitForPromiseWithAbort(
							this.buildListOptions(
								{ ...providedListOptions, abortSignal: controller.signal },
								{
									ensurePort: !options?.cacheOnly,
									onPreflightStage: (stage) => {
										lastStage = `preflight:${stage}`;
									},
								},
							),
							controller.signal,
						);
			scopedListOptions = {
				...listOptions,
				abortSignal: controller.signal,
				scrapeTelemetry: telemetry,
			};
			const hasProviderSessionAuthorization = Boolean(
				scopedListOptions.providerSessionAuthorization,
			);
			lastStage = "preflight:resolveCacheContext";
			cacheContext = await waitForPromiseWithAbort(
				this.resolveCacheContext(
					hasProviderSessionAuthorization
						? { ...scopedListOptions, skipFeatureSignature: true }
						: scopedListOptions,
					listOptions.accountMirrorInventory === true || hasProviderSessionAuthorization
						? { detect: false, prompt: false }
						: {},
				),
				controller.signal,
			);
			const refresh = options?.refresh !== false;
			if (!refresh) {
				const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
				if (cached.items.messages.length > 0) {
					return cached.items;
				}
				if (options?.cacheOnly) {
					throw new Error(
						`No cached conversation context for "${conversationId}". Run without --cache-only to fetch live context.`,
					);
				}
			}
			lastStage = "provider:readConversationContext.start";
			recordBrowserScrapeProviderAction(scopedListOptions, "llmService.getConversationContext");
			const context = await this.withRetry(
				() => {
					attemptCount += 1;
					pendingProviderRead = this.provider.readConversationContext?.(
						conversationId,
						options?.projectId,
						scopedListOptions,
					) as Promise<unknown>;
					return waitForPromiseWithAbort(pendingProviderRead, controller.signal);
				},
				{
					action: "readConversationContext",
					retries: retryAttempts,
					abortSignal: controller.signal,
					bypassProviderGuardFailure: (error) => error instanceof ConversationContextReadError,
					shouldRetry: (error) => {
						if (error instanceof ConversationContextReadError) return false;
						return listOptions.accountMirrorInventory === true
							? !isRateLimitBlockingSurfaceError(error)
							: true;
					},
				},
			);
			lastStage = "provider:readConversationContext.complete";
			let normalized = this.normalizeConversationContext(context, conversationId);
			if (typeof options?.projectId === "string" && options.projectId.trim().length > 0) {
				const cachedInstructions = await this.cacheStore.readProjectInstructions(
					cacheContext,
					options.projectId.trim(),
				);
				const projectInstructions = cachedInstructions.items.content?.trim();
				if (projectInstructions) {
					normalized = stripProjectInstructionsPrefixFromConversationContext(
						normalized,
						projectInstructions,
					);
				}
			}
			lastStage = "cache:writeConversationContext";
			await this.cacheStore.writeConversationContext(cacheContext, conversationId, normalized);
			lastStage = "complete";
			await writeReceipt("succeeded", null);
			return normalized;
		} catch (error) {
			let terminalError = abortError ?? error;
			const contextAbort =
				controller.signal.aborted && terminalError instanceof ConversationContextReadError
					? terminalError
					: undefined;
			if (
				contextAbort &&
				pendingProviderRead &&
				hasProviderBackendRequestAdmission(scopedListOptions)
			) {
				// Admission owns custody until adapter cleanup confirms or this bounded drain expires.
				let drainTimer: ReturnType<typeof scheduleTimer> | undefined;
				const cleanupFailure = await Promise.race([
					pendingProviderRead.then(
						() => undefined,
						(failure: unknown) => failure,
					),
					new Promise<unknown>((resolve) => {
						drainTimer = scheduleTimer(
							() =>
								resolve(
									new OwnedBackendRequestCleanupError(
										new Error("Owned backend request abort cleanup did not finish within 5000ms."),
									),
								),
							5000,
						);
					}),
				]);
				if (drainTimer) cancelTimer(drainTimer);
				terminalError = new ConversationContextReadError({
					provider: this.providerId,
					conversationId,
					timeoutMs,
					outcome: contextAbort.outcome,
					cause: cleanupFailure,
				});
			}
			const outcome: ConversationContextReadOutcome =
				terminalError instanceof ConversationContextReadError ? terminalError.outcome : "failed";
			await writeReceipt(outcome, terminalError);
			if (options?.allowCacheFallback === false || hasUnknownOwnedRequestCleanup(terminalError)) {
				throw terminalError;
			}
			const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
			if (cached.items.messages.length > 0) {
				return cached.items;
			}
			throw terminalError;
		} finally {
			// The provider retains on the deadline-scoped copy; return custody to its caller.
			if (listOptions.useProviderSession === true && scopedListOptions) {
				listOptions.providerSession = scopedListOptions.providerSession;
			}
			cancelTimer(deadlineTimer);
			callerSignal?.removeEventListener("abort", onCallerAbort);
			telemetry.onUpdate = originalTelemetryUpdate;
		}
	}

	async listCachedConversationContexts(options?: {
		listOptions?: BrowserProviderListOptions;
		cacheResolve?: { prompt?: boolean; detect?: boolean };
	}): Promise<CachedConversationContextEntry[]> {
		const listOptions =
			options?.listOptions ?? (await this.buildListOptions(undefined, { ensurePort: false }));
		const cacheContext = await this.resolveCacheContext(listOptions, options?.cacheResolve);
		return this.cacheStore.listConversationContexts(cacheContext);
	}

	async getCachedConversationContext(
		selector: string,
		options?: {
			listOptions?: BrowserProviderListOptions;
			cacheResolve?: { prompt?: boolean; detect?: boolean };
		},
	): Promise<{
		conversationId: string;
		fetchedAt: string | null;
		stale: boolean;
		context: ConversationContext;
		terminalReceipt: ConversationContextReadReceipt | null;
	}> {
		const listOptions =
			options?.listOptions ?? (await this.buildListOptions(undefined, { ensurePort: false }));
		const cacheContext = await this.resolveCacheContext(listOptions, options?.cacheResolve);
		const raw = selector.trim();
		if (!raw) {
			throw new Error("Conversation selector is required.");
		}
		const normalizedDirectId = this.provider.normalizeConversationId?.(raw) ?? null;
		const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
		let conversationId = normalizedDirectId ?? raw;
		const cachedConversations = await this.cacheStore.readConversations(cacheContext);
		const directMatch =
			cachedConversations.items.find((entry) => entry.id === conversationId) ?? null;
		if (!isUuid && !directMatch) {
			const match = matchConversationByTitle(cachedConversations.items ?? [], raw);
			if (!match.match) {
				throw new Error(
					`No cached conversation matched "${raw}". Run "oracle conversations --refresh" first.`,
				);
			}
			conversationId = match.match.id;
		}
		const cached = await this.cacheStore.readConversationContext(cacheContext, conversationId);
		const terminalReceipt = await readConversationContextReadReceipt(cacheContext, conversationId);
		if (!cached.items.messages.length) {
			throw new Error(
				`No cached context found for "${conversationId}". Run "oracle conversations context get ${conversationId} --target ${this.providerId}" first.${terminalReceipt.items ? ` Last read outcome: ${terminalReceipt.items.outcome}.` : ""}`,
			);
		}
		return {
			conversationId,
			fetchedAt: cached.fetchedAt ? new Date(cached.fetchedAt).toISOString() : null,
			stale: cached.stale,
			context: cached.items,
			terminalReceipt: terminalReceipt.items,
		};
	}

	async resolveProjectIdByName(
		projectName: string,
		options?: {
			forceRefresh?: boolean;
			allowAutoRefresh?: boolean;
			allowFallback?: boolean;
			listOptions?: BrowserProviderListOptions;
		},
	): Promise<string> {
		const directId = this.provider.normalizeProjectId?.(projectName);
		if (directId) {
			return directId;
		}
		const listOptions = await this.buildListOptions(options?.listOptions, { ensurePort: true });
		const cacheContext = await this.resolveCacheContext(listOptions);
		let cached = await this.cacheStore.readProjects(cacheContext);
		const initialCacheState = resolveProjectResolutionCacheState(cached);
		const allowAutoRefresh = options?.allowAutoRefresh ?? true;
		let didRefresh = false;
		let liveRefreshState: ProjectResolutionLiveRefreshState = "not_attempted";
		let liveRefreshError: string | null = null;
		const canList = Boolean(this.provider.listProjects);
		const readLiveProjects = async (): Promise<Project[]> => {
			try {
				const items = await this.listProjects(listOptions);
				await this.cacheStore.writeProjects(cacheContext, items);
				cached = { items, fetchedAt: Date.now(), stale: false };
				didRefresh = true;
				liveRefreshState = "completed";
				liveRefreshError = null;
				return items;
			} catch (error) {
				liveRefreshState = "failed";
				liveRefreshError = formatUnknownError(error);
				throw createProjectResolutionError({
					code: "project_discovery_failed",
					provider: this.providerId,
					projectName,
					cacheState: initialCacheState,
					cacheItemCount: cached.items.length,
					liveRefreshState,
					liveRefreshError,
					candidates: cached.items,
					runtimeProfile: getPreferredRuntimeProfileName(this.userConfig),
					identityKey: cacheContext.identityKey ?? null,
					configuredUrl: listOptions.configuredUrl ?? null,
				});
			}
		};
		const shouldRefreshBeforeCacheMatch =
			this.providerId === "chatgpt" && allowAutoRefresh && canList && !options?.forceRefresh;
		if (
			(options?.forceRefresh ||
				(allowAutoRefresh && cached.stale) ||
				shouldRefreshBeforeCacheMatch) &&
			canList
		) {
			await readLiveProjects();
		}
		const { match, candidates } = resolveProjectNameMatch(cached.items, projectName, {
			preferFirstCandidate: this.providerId === "chatgpt" && didRefresh,
		});
		if (match) {
			return match.id;
		}
		if (!didRefresh && allowAutoRefresh && canList) {
			const items = await readLiveProjects();
			const retry = resolveProjectNameMatch(items, projectName, {
				preferFirstCandidate: this.providerId === "chatgpt",
			});
			if (retry.match) {
				return retry.match.id;
			}
		}
		if (candidates.length > 1) {
			const names = candidates.map((item) => item.name || item.id).join(", ");
			throw new Error(`Project name "${projectName}" is ambiguous. Matches: ${names}`);
		}
		if (options?.allowFallback && this.providerId === "grok") {
			return projectName.trim();
		}
		const resolutionCode =
			allowAutoRefresh && canList && didRefresh ? "project_not_found" : "project_cache_miss";
		throw createProjectResolutionError({
			code: resolutionCode,
			provider: this.providerId,
			projectName,
			cacheState: initialCacheState,
			cacheItemCount: cached.items.length,
			liveRefreshState,
			liveRefreshError,
			candidates: cached.items,
			runtimeProfile: getPreferredRuntimeProfileName(this.userConfig),
			identityKey: cacheContext.identityKey ?? null,
			configuredUrl: listOptions.configuredUrl ?? null,
		});
	}

	async resolveConversationIdByName(
		conversationName: string,
		options?: {
			projectId?: string;
			forceRefresh?: boolean;
			listOptions?: BrowserProviderListOptions;
		},
	): Promise<string> {
		const match = await this.resolveConversationByName(conversationName, options);
		return match.id;
	}

	async resolveConversationByName(
		conversationName: string,
		options?: {
			projectId?: string;
			forceRefresh?: boolean;
			allowAutoRefresh?: boolean;
			listOptions?: BrowserProviderListOptions;
		},
	): Promise<Conversation> {
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		const cacheContext = await this.resolveCacheContext(listOptions);
		let cached = await this.cacheStore.readConversations(cacheContext);
		const allowAutoRefresh = options?.allowAutoRefresh ?? true;
		let didRefresh = false;
		const canList = Boolean(this.provider.listConversations);
		if ((options?.forceRefresh || (allowAutoRefresh && cached.stale)) && canList) {
			const items = await this.listConversations(options?.projectId, {
				...listOptions,
				includeHistory: true,
				historyLimit: DEFAULT_HISTORY_LIMIT,
			});
			await this.cacheStore.writeConversations(cacheContext, items);
			cached = { items, fetchedAt: Date.now(), stale: false };
			didRefresh = true;
		}
		const { match, candidates } = matchConversationByTitle(cached.items, conversationName);
		if (match) {
			return match;
		}
		if (!didRefresh && allowAutoRefresh && canList) {
			const items = await this.listConversations(options?.projectId, {
				...listOptions,
				includeHistory: true,
				historyLimit: DEFAULT_HISTORY_LIMIT,
			});
			await this.cacheStore.writeConversations(cacheContext, items);
			const retry = matchConversationByTitle(items, conversationName);
			if (retry.match) {
				return retry.match;
			}
		}
		if (candidates.length > 1) {
			const names = candidates.map((item) => item.title || item.id).join(", ");
			throw new Error(`Conversation name "${conversationName}" is ambiguous. Matches: ${names}`);
		}
		throw new Error(
			`No cached conversation named "${conversationName}". Run "auracall conversations" to refresh.`,
		);
	}

	async resolveConversationSelector(
		selector: string,
		options?: {
			projectId?: string;
			forceRefresh?: boolean;
			allowAutoRefresh?: boolean;
			listOptions?: BrowserProviderListOptions;
			noProject?: boolean;
		},
	): Promise<Conversation> {
		const normalized = selector.trim();
		const directId = this.provider.normalizeConversationId?.(normalized);
		if (directId) {
			return {
				id: directId,
				title: directId,
				provider: this.providerId,
				projectId: options?.projectId,
				url: this.provider.resolveConversationUrl?.(directId, options?.projectId),
			};
		}
		const latestOffset = parseLatestSelector(normalized);
		if (latestOffset !== null) {
			return this.resolveLatestConversation(latestOffset, {
				projectId: options?.noProject ? undefined : options?.projectId,
				listOptions: options?.listOptions,
				noProject: options?.noProject,
			});
		}
		return this.resolveConversationByName(normalized, {
			projectId: options?.projectId,
			forceRefresh: options?.forceRefresh,
			allowAutoRefresh: options?.allowAutoRefresh,
			listOptions: options?.listOptions,
		});
	}

	async resolveCacheContext(
		listOptions: BrowserProviderListOptions,
		options: { prompt?: boolean; detect?: boolean } = {},
	): Promise<CacheContext> {
		const settings = this.getCacheSettings();
		const identity = await this.resolveCacheIdentity(listOptions, options);
		return {
			provider: this.providerId,
			userConfig: this.userConfig,
			listOptions,
			...settings,
			...identity,
		};
	}

	getCacheSettings(): CacheSettings {
		const cacheConfig = this.userConfig.browser?.cache;
		const refreshHours = cacheConfig?.refreshHours;
		const ttlMs =
			typeof refreshHours === "number" && Number.isFinite(refreshHours) && refreshHours > 0
				? refreshHours * 60 * 60 * 1000
				: null;
		return {
			cacheRoot: cacheConfig?.rootDir ?? null,
			ttlMs: ttlMs ?? PROVIDER_CACHE_TTL_MS,
		};
	}

	async resolveCacheIdentity(
		listOptions: BrowserProviderListOptions,
		options: { prompt?: boolean; detect?: boolean } = {},
	): Promise<CacheIdentity> {
		const normalizeIdentityKey = (value: string | null | undefined): string | null => {
			if (!value) return null;
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed.toLowerCase() : null;
		};
		const deriveIdentityKey = (
			identity: ProviderUserIdentity | null | undefined,
		): string | null => {
			if (!identity) return null;
			return (
				normalizeIdentityKey(identity.email) ||
				normalizeIdentityKey(identity.handle) ||
				normalizeIdentityKey(identity.name) ||
				null
			);
		};
		const profileIdentity = this.resolveProfileServiceIdentity(this.providerId);
		let userIdentity: ProviderUserIdentity | null = profileIdentity;
		const cacheConfig = this.userConfig.browser?.cache;

		const identityKeyHint =
			typeof cacheConfig?.identityKey === "string" && cacheConfig.identityKey.trim().length > 0
				? normalizeIdentityKey(cacheConfig.identityKey)
				: null;
		const identityHint = cacheConfig?.identity ?? null;

		const useDetectedIdentity =
			options.detect !== false && cacheConfig?.useDetectedIdentity !== false;
		let detectedIdentity: ProviderUserIdentity | null = null;
		if (useDetectedIdentity) {
			try {
				detectedIdentity = await this.getUserIdentity(listOptions);
			} catch {
				detectedIdentity = null;
			}
		}
		const detectedIdentityKey = deriveIdentityKey(detectedIdentity);

		let identityKey: string | null = detectedIdentityKey ?? identityKeyHint;
		if (detectedIdentity) {
			userIdentity = detectedIdentity;
		}
		if (!identityKey && profileIdentity) {
			identityKey = deriveIdentityKey(profileIdentity);
			userIdentity = userIdentity ?? profileIdentity;
		}
		if (!identityKey && identityHint) {
			identityKey =
				normalizeIdentityKey(identityHint.email) ||
				normalizeIdentityKey(identityHint.handle) ||
				normalizeIdentityKey(identityHint.name) ||
				null;
			if (identityKey) {
				userIdentity = userIdentity ?? {
					name: identityHint.name,
					handle: identityHint.handle,
					email: identityHint.email,
					source: "config",
				};
			}
		}

		if (!identityKey && !userIdentity && this.identityPrompt && options.prompt !== false) {
			const prompted = await this.identityPrompt(this.providerId);
			if (prompted) {
				userIdentity = prompted;
				identityKey = deriveIdentityKey(prompted);
			}
		}

		if (!identityKey && userIdentity) {
			identityKey = deriveIdentityKey(userIdentity);
		}

		const configuredFeatures = this.resolveConfiguredServiceFeatures();
		let detectedFeatureSignature: string | null = null;
		if (!listOptions.skipFeatureSignature && this.provider.getFeatureSignature) {
			try {
				detectedFeatureSignature = await this.provider.getFeatureSignature(listOptions);
			} catch {
				detectedFeatureSignature = null;
			}
		}
		const configuredFeatureSignature =
			configuredFeatures && Object.keys(configuredFeatures).length > 0
				? stableStringify(configuredFeatures)
				: null;
		const featureSignature =
			configuredFeatureSignature && detectedFeatureSignature
				? stableStringify({
						configured: JSON.parse(configuredFeatureSignature),
						detected: JSON.parse(detectedFeatureSignature),
					})
				: (detectedFeatureSignature ?? configuredFeatureSignature);

		return { userIdentity, identityKey, featureSignature };
	}

	private resolveProfileServiceIdentity(provider: ProviderId): ProviderUserIdentity | null {
		const profileName = this.resolveActiveProfileName();
		const globalIdentity = this.userConfig.services?.[provider]?.identity;
		if (!profileName) {
			if (!globalIdentity) return null;
			return {
				name: globalIdentity.name,
				handle: globalIdentity.handle,
				email: globalIdentity.email,
				accountLevel: globalIdentity.accountLevel,
				accountPlanType: globalIdentity.accountPlanType,
				accountStructure: globalIdentity.accountStructure,
				capabilityProfile: globalIdentity.capabilityProfile,
				proAccess: globalIdentity.proAccess,
				deepResearchAccess: globalIdentity.deepResearchAccess,
				source: "config",
			};
		}
		const profile = getPreferredRuntimeProfile(this.userConfig, {
			explicitProfileName: profileName,
		});
		const profileServices =
			profile?.services && typeof profile.services === "object"
				? (profile.services as Record<string, unknown>)
				: null;
		const profileService =
			profileServices && provider in profileServices
				? (profileServices[provider] as Record<string, unknown> | undefined)
				: undefined;
		const profileIdentity =
			profileService && "identity" in profileService
				? (profileService.identity as typeof globalIdentity | undefined)
				: undefined;
		const identity = profileIdentity ?? globalIdentity;
		if (!identity) return null;
		return {
			name: identity.name,
			handle: identity.handle,
			email: identity.email,
			accountLevel: identity.accountLevel,
			accountPlanType: identity.accountPlanType,
			accountStructure: identity.accountStructure,
			capabilityProfile: identity.capabilityProfile,
			proAccess: identity.proAccess,
			deepResearchAccess: identity.deepResearchAccess,
			source: profileIdentity ? "profile" : "config",
		};
	}

	private resolveActiveProfileName(): string | null {
		return getPreferredRuntimeProfileName(this.userConfig);
	}

	private resolveConfiguredServiceFeatures(): Record<string, unknown> | null {
		const profileName = this.resolveActiveProfileName();
		const globalFeatures = this.userConfig.services?.[this.providerId]?.features;
		if (!profileName) {
			return isRecord(globalFeatures) ? globalFeatures : null;
		}
		const profile = getPreferredRuntimeProfile(this.userConfig, {
			explicitProfileName: profileName,
		});
		const profileServices =
			profile?.services && typeof profile.services === "object"
				? (profile.services as Record<string, unknown>)
				: null;
		const profileService =
			profileServices && this.providerId in profileServices
				? (profileServices[this.providerId] as Record<string, unknown> | undefined)
				: undefined;
		const profileFeatures =
			profileService && "features" in profileService ? profileService.features : undefined;
		const merged: Record<string, unknown> = {};
		if (isRecord(globalFeatures)) {
			Object.assign(merged, globalFeatures);
		}
		if (isRecord(profileFeatures)) {
			Object.assign(merged, profileFeatures);
		}
		return Object.keys(merged).length > 0 ? merged : null;
	}

	private async refreshProjectKnowledgeCache(
		projectId: string,
		listOptions: BrowserProviderListOptions,
	): Promise<FileRef[]> {
		if (!this.provider.listProjectFiles) {
			return [];
		}
		recordBrowserScrapeProviderAction(listOptions, "provider.listProjectFiles");
		const files = await this.withRetry(
			() => this.provider.listProjectFiles?.(projectId, listOptions) as Promise<FileRef[]>,
			{ action: "listProjectFiles" },
		);
		const normalizedFiles = Array.isArray(files) ? files : [];
		const cacheContext = await this.resolveCacheContext(listOptions);
		await this.cacheStore.writeProjectKnowledge(cacheContext, projectId, normalizedFiles);
		return normalizedFiles;
	}

	private async refreshAccountFilesCache(
		listOptions: BrowserProviderListOptions,
	): Promise<FileRef[]> {
		if (!this.provider.listAccountFiles) {
			return [];
		}
		recordBrowserScrapeProviderAction(listOptions, "provider.listAccountFiles");
		const files = await this.withRetry(
			() => this.provider.listAccountFiles?.(listOptions) as Promise<FileRef[]>,
			{
				action: "listAccountFiles",
				retries: listOptions.disableAccountFileListRetry === true ? 0 : undefined,
				abortSignal: listOptions.abortSignal,
			},
		);
		const normalizedFiles = Array.isArray(files) ? files : [];
		if (listOptions.skipAccountFileCachePersistence === true) return normalizedFiles;
		recordLibraryInventoryStage(listOptions, "service-cache-context");
		const cacheContext = await this.resolveCacheContext(listOptions);
		recordLibraryInventoryStage(listOptions, "service-cache-write");
		await this.cacheStore.writeAccountFiles(cacheContext, normalizedFiles);
		return normalizedFiles;
	}

	private async refreshConversationFilesCache(
		conversationId: string,
		listOptions: BrowserProviderListOptions,
	): Promise<FileRef[]> {
		if (!this.provider.listConversationFiles) {
			return [];
		}
		recordBrowserScrapeProviderAction(listOptions, "provider.listConversationFiles");
		const files = await this.withRetry(
			() =>
				this.provider.listConversationFiles?.(conversationId, listOptions) as Promise<FileRef[]>,
			{ action: "listConversationFiles" },
		);
		const normalizedFiles = Array.isArray(files) ? files : [];
		const cacheContext = await this.resolveCacheContext(listOptions);
		if (normalizedFiles.length === 0 && listOptions.accountMirrorInventory === true) {
			const existing = await this.cacheStore.readConversationFiles(cacheContext, conversationId);
			if (existing.items.length > 0) {
				return existing.items;
			}
		}
		await this.cacheStore.writeConversationFiles(cacheContext, conversationId, normalizedFiles);
		return normalizedFiles;
	}

	resolveProviderCacheKey(cacheContext: CacheContext): string {
		return resolveProviderCacheKey(cacheContext);
	}

	private extractProjectId(configuredUrl: string | null): string | null {
		if (!configuredUrl) return null;
		const providerExtracted = this.provider.extractProjectIdFromUrl?.(configuredUrl);
		if (providerExtracted) {
			return this.provider.normalizeProjectId?.(providerExtracted) ?? providerExtracted;
		}
		try {
			const parsed = new URL(configuredUrl);
			if (this.providerId === "grok") {
				const match = parsed.pathname.match(/\/project\/([^/]+)/);
				return match?.[1] ?? null;
			}
			if (this.providerId === "chatgpt") {
				const match = parsed.pathname.match(/\/g\/([^/]+)\/project/);
				return match?.[1] ?? null;
			}
		} catch {
			return null;
		}
		return null;
	}

	private extractConversationId(configuredUrl: string | null): string | null {
		if (!configuredUrl) return null;
		try {
			const parsed = new URL(configuredUrl);
			if (this.providerId === "grok") {
				return parsed.searchParams.get("chat");
			}
			if (this.providerId === "chatgpt") {
				const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
				return match?.[1] ?? null;
			}
		} catch {
			return null;
		}
		return null;
	}

	private normalizeConversationContext(
		payload: unknown,
		conversationId: string,
	): ConversationContext {
		const fallback: ConversationContext = {
			provider: this.providerId,
			conversationId,
			messages: [],
		};
		if (!payload || typeof payload !== "object") {
			return fallback;
		}
		const raw = payload as Partial<ConversationContext> & { messages?: unknown[] };
		const normalizedMessages: ConversationMessage[] = [];
		if (Array.isArray(raw.messages)) {
			for (const entry of raw.messages) {
				if (!entry || typeof entry !== "object") continue;
				const candidate = entry as Partial<ConversationMessage>;
				const role =
					candidate.role === "assistant" || candidate.role === "system" || candidate.role === "user"
						? candidate.role
						: null;
				const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
				if (!role || !text) continue;
				normalizedMessages.push({
					role,
					text,
					time: typeof candidate.time === "string" ? candidate.time : undefined,
				});
			}
		}
		const normalizedSources: ConversationSource[] = [];
		const seenSources = new Set<string>();
		const rawSourcesCandidate = (raw as { sources?: unknown[] }).sources;
		const rawSources = Array.isArray(rawSourcesCandidate) ? rawSourcesCandidate : [];
		for (const entry of rawSources) {
			if (!entry || typeof entry !== "object") continue;
			const candidate = entry as Partial<ConversationSource>;
			const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
			const messageIndex =
				typeof candidate.messageIndex === "number" && Number.isFinite(candidate.messageIndex)
					? candidate.messageIndex
					: undefined;
			const sourceKey = `${messageIndex ?? "n/a"}::${url}`;
			if (!url || seenSources.has(sourceKey)) continue;
			seenSources.add(sourceKey);
			normalizedSources.push({
				url,
				title: typeof candidate.title === "string" ? candidate.title.trim() : undefined,
				domain: typeof candidate.domain === "string" ? candidate.domain.trim() : undefined,
				messageIndex,
				sourceGroup:
					typeof candidate.sourceGroup === "string" ? candidate.sourceGroup.trim() : undefined,
			});
		}

		const normalizedArtifacts: ConversationArtifact[] = [];
		const seenArtifacts = new Set<string>();
		const rawArtifactsCandidate = (raw as { artifacts?: unknown[] }).artifacts;
		const rawArtifacts = Array.isArray(rawArtifactsCandidate) ? rawArtifactsCandidate : [];
		for (const entry of rawArtifacts) {
			if (!entry || typeof entry !== "object") continue;
			const candidate = entry as Partial<ConversationArtifact>;
			const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
			const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
			if (!id || !title || seenArtifacts.has(id)) continue;
			seenArtifacts.add(id);
			normalizedArtifacts.push({
				id,
				title,
				kind:
					candidate.kind === "document" ||
					candidate.kind === "download" ||
					candidate.kind === "canvas" ||
					candidate.kind === "generated" ||
					candidate.kind === "image" ||
					candidate.kind === "spreadsheet"
						? candidate.kind
						: undefined,
				uri: typeof candidate.uri === "string" ? candidate.uri.trim() : undefined,
				messageIndex:
					typeof candidate.messageIndex === "number" && Number.isFinite(candidate.messageIndex)
						? candidate.messageIndex
						: undefined,
				messageId: typeof candidate.messageId === "string" ? candidate.messageId.trim() : undefined,
				metadata:
					candidate.metadata && typeof candidate.metadata === "object"
						? (candidate.metadata as Record<string, unknown>)
						: undefined,
			});
		}

		return {
			provider: this.providerId,
			conversationId:
				typeof raw.conversationId === "string" && raw.conversationId.trim().length > 0
					? raw.conversationId.trim()
					: conversationId,
			messages: normalizedMessages,
			files: Array.isArray(raw.files) ? raw.files : undefined,
			sources: normalizedSources.length > 0 ? normalizedSources : undefined,
			artifacts: normalizedArtifacts.length > 0 ? normalizedArtifacts : undefined,
			metadata:
				raw.metadata && typeof raw.metadata === "object"
					? (raw.metadata as Record<string, unknown>)
					: undefined,
		};
	}

	private async resolveLatestConversation(
		offset: number,
		options?: { projectId?: string; listOptions?: BrowserProviderListOptions; noProject?: boolean },
	): Promise<Conversation> {
		if (!this.provider.listConversations) {
			throw new Error(`${this.providerId} does not support conversation listing yet.`);
		}
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options?.listOptions, { ensurePort: true }),
			options?.projectId,
		);
		const items = await this.listConversations(options?.projectId, {
			...listOptions,
			includeHistory: true,
			historyLimit: DEFAULT_HISTORY_LIMIT,
		});
		const filtered = filterConversationsForScope(items, {
			providerId: this.providerId,
			noProject: options?.noProject ?? false,
		});
		if (!filtered.length) {
			throw new Error(`No conversations available to resolve latest for ${this.providerId}.`);
		}
		const sorted = sortConversationsByRecency(filtered);
		const clamped = Math.max(0, Math.min(offset, sorted.length - 1));
		return sorted[clamped];
	}

	protected async withRetry<T>(
		fn: () => Promise<T>,
		options: {
			action: string;
			retries?: number;
			skipPostCommitQuiet?: boolean;
			beforeRetry?: (error: unknown, attempt: number) => Promise<void> | void;
			shouldRetry?: (error: unknown) => boolean;
			abortSignal?: AbortSignal;
			bypassProviderGuardFailure?: (error: unknown) => boolean;
		} = {
			action: "operation",
		},
	): Promise<T> {
		if (options.abortSignal?.aborted) {
			throw options.abortSignal.reason ?? new Error("Operation aborted.");
		}
		const guardPromise = this.enforceProviderGuard(options.action, {
			skipPostCommitQuiet: options.skipPostCommitQuiet === true,
		});
		if (options.abortSignal) {
			await waitForPromiseWithAbort(guardPromise, options.abortSignal);
		} else {
			await guardPromise;
		}
		const retries = typeof options.retries === "number" ? options.retries : 1;
		for (let attempt = 0; ; attempt += 1) {
			try {
				if (options.abortSignal?.aborted) {
					throw options.abortSignal.reason ?? new Error("Operation aborted.");
				}
				const result = await fn();
				await this.noteProviderGuardSuccess(options.action);
				return result;
			} catch (error) {
				const shouldRetry = options.shouldRetry?.(error) ?? true;
				if (options.bypassProviderGuardFailure?.(error)) {
					throw error;
				}
				const nextError = await this.handleProviderGuardFailure(options.action, error);
				if (!shouldRetry || attempt >= retries || !this.isRetryableError(nextError)) {
					throw nextError;
				}
				await options.beforeRetry?.(nextError, attempt);
				const delayMs = this.getRetryDelayMs(attempt, nextError);
				const delayPromise = this.delay(delayMs);
				if (options.abortSignal) {
					await waitForPromiseWithAbort(delayPromise, options.abortSignal);
				} else {
					await delayPromise;
				}
			}
		}
	}

	protected getProviderGuardSettings(): ProviderGuardSettings | null {
		if (this.providerId === "chatgpt") {
			return {
				cooldownMs: CHATGPT_RATE_LIMIT_COOLDOWN_MS,
				autoWaitMaxMs: CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS,
				mutationWindowMs: CHATGPT_MUTATION_WINDOW_MS,
				mutationMaxWeight: CHATGPT_MUTATION_MAX_WEIGHT,
				mutationBudgetAutoWaitMaxMs: CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS,
				postCommitAutoWaitMaxMs: CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS,
				postCommitQuietScale: 1,
				postCommitJitterMaxMs: CHATGPT_POST_COMMIT_JITTER_MAX_MS,
			};
		}
		if (this.providerId === "gemini") {
			return {
				cooldownMs: GEMINI_RATE_LIMIT_COOLDOWN_MS,
				autoWaitMaxMs: GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS,
				mutationWindowMs: 0,
				mutationMaxWeight: 0,
				mutationBudgetAutoWaitMaxMs: 0,
				postCommitAutoWaitMaxMs: GEMINI_RATE_LIMIT_AUTO_WAIT_MAX_MS,
				postCommitQuietScale: 0,
				postCommitJitterMaxMs: 0,
				simplePostCommitQuietMs: GEMINI_POST_COMMIT_QUIET_MS,
				simpleMutationMinIntervalMs: GEMINI_MUTATION_MIN_INTERVAL_MS,
			};
		}
		if (this.providerId === "grok") {
			return {
				cooldownMs: GROK_RATE_LIMIT_COOLDOWN_MS,
				autoWaitMaxMs: GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS,
				mutationWindowMs: 0,
				mutationMaxWeight: 0,
				mutationBudgetAutoWaitMaxMs: 0,
				postCommitAutoWaitMaxMs: GROK_RATE_LIMIT_AUTO_WAIT_MAX_MS,
				postCommitQuietScale: 0,
				postCommitJitterMaxMs: 0,
				simplePostCommitQuietMs: GROK_POST_COMMIT_QUIET_MS,
				simpleMutationMinIntervalMs: GROK_MUTATION_MIN_INTERVAL_MS,
			};
		}
		return null;
	}

	private async enforceProviderGuard(
		action: string,
		options: { skipPostCommitQuiet?: boolean } = {},
	): Promise<void> {
		const settings = this.getProviderGuardSettings();
		if (!settings) {
			return;
		}
		if (this.providerId === "gemini" || this.providerId === "grok") {
			const state = await this.readProviderGuardState();
			if (!state) {
				return;
			}
			const now = Date.now();
			const cooldownUntil = typeof state.cooldownUntil === "number" ? state.cooldownUntil : null;
			if (cooldownUntil && cooldownUntil > now) {
				const remainingMs = cooldownUntil - now;
				if (remainingMs <= settings.autoWaitMaxMs) {
					await this.delay(remainingMs);
				} else {
					const summary = state.cooldownReason ? ` ${state.cooldownReason}` : "";
					throw new Error(
						`${this.providerId === "gemini" ? "Gemini anti-bot" : "Grok rate limit"} cooldown active until ${new Date(cooldownUntil).toISOString()} (${Math.ceil(
							remainingMs / 1000,
						)}s remaining).${summary}`.trim(),
					);
				}
			}
			const lastMutationAt = typeof state.lastMutationAt === "number" ? state.lastMutationAt : null;
			if (!lastMutationAt) {
				return;
			}
			const quietMs = this.isMutatingProviderAction(action)
				? (settings.simpleMutationMinIntervalMs ?? 0)
				: (settings.simplePostCommitQuietMs ?? 0);
			if (quietMs <= 0) {
				return;
			}
			const remainingMs = lastMutationAt + quietMs - now;
			if (remainingMs <= 0) {
				return;
			}
			const label = this.isMutatingProviderAction(action)
				? this.providerId === "gemini"
					? "Gemini write spacing"
					: "Grok write spacing"
				: this.providerId === "gemini"
					? "Gemini post-write quiet period"
					: "Grok post-write quiet period";
			const autoWaitMaxMs = this.isMutatingProviderAction(action)
				? Math.max(settings.autoWaitMaxMs, settings.postCommitAutoWaitMaxMs)
				: settings.postCommitAutoWaitMaxMs;
			if (remainingMs <= autoWaitMaxMs) {
				await this.delay(remainingMs);
				return;
			}
			throw new Error(
				`${label} active until ${new Date(now + remainingMs).toISOString()} (${Math.ceil(
					remainingMs / 1000,
				)}s remaining).`,
			);
		}
		const state = await this.readProviderGuardState();
		if (!state) {
			return;
		}
		const chatgptState = state as ChatgptRateLimitGuardState;
		const now = Date.now();
		const cooldownUntil =
			typeof chatgptState.cooldownUntil === "number" ? chatgptState.cooldownUntil : null;
		if (cooldownUntil && cooldownUntil > now) {
			const remainingMs = cooldownUntil - now;
			if (remainingMs <= settings.autoWaitMaxMs) {
				await this.delay(remainingMs);
			} else {
				const summary = chatgptState.cooldownReason ? ` ${chatgptState.cooldownReason}` : "";
				throw new Error(
					`ChatGPT rate limit cooldown active until ${new Date(cooldownUntil).toISOString()} (${Math.ceil(
						remainingMs / 1000,
					)}s remaining).${summary}`.trim(),
				);
			}
		}
		const postCommitWaitMs = getChatgptPostCommitQuietWaitMs(chatgptState, now, {
			windowMs: settings.mutationWindowMs,
			quietScale: settings.postCommitQuietScale,
			jitterMaxMs: settings.postCommitJitterMaxMs,
		});
		if (
			postCommitWaitMs > 0 &&
			!(options.skipPostCommitQuiet === true && !this.isMutatingProviderAction(action))
		) {
			if (postCommitWaitMs <= settings.postCommitAutoWaitMaxMs) {
				await this.delay(postCommitWaitMs);
			} else {
				throw new Error(
					`ChatGPT post-write quiet period active until ${new Date(now + postCommitWaitMs).toISOString()} (${Math.ceil(
						postCommitWaitMs / 1000,
					)}s remaining).`,
				);
			}
		}
		if (!this.isMutatingProviderAction(action)) {
			return;
		}
		const budgetWaitMs = getChatgptMutationBudgetWaitMs(chatgptState, Date.now(), {
			windowMs: settings.mutationWindowMs,
			maxWeight: settings.mutationMaxWeight,
		});
		if (budgetWaitMs <= 0) {
			return;
		}
		if (budgetWaitMs <= settings.mutationBudgetAutoWaitMaxMs) {
			await this.delay(budgetWaitMs);
			return;
		}
		throw new Error(
			`ChatGPT write budget active until ${new Date(Date.now() + budgetWaitMs).toISOString()} (${Math.ceil(
				budgetWaitMs / 1000,
			)}s remaining).`,
		);
	}

	private async noteProviderGuardSuccess(action: string): Promise<void> {
		const settings = this.getProviderGuardSettings();
		if (!settings) {
			return;
		}
		const now = Date.now();
		const current = await this.readProviderGuardState();
		if (this.providerId === "gemini" || this.providerId === "grok") {
			const next: SimpleProviderGuardState = {
				provider: this.providerId,
				profile: this.resolveActiveProfileName() ?? "default",
				updatedAt: now,
				lastMutationAt: this.isMutatingProviderAction(action)
					? now
					: (current as SimpleProviderGuardState | null | undefined)?.lastMutationAt,
			};
			const cooldownUntil = (current as SimpleProviderGuardState | null | undefined)?.cooldownUntil;
			if (typeof cooldownUntil === "number" && cooldownUntil > now) {
				next.cooldownUntil = cooldownUntil;
				next.cooldownDetectedAt = (
					current as SimpleProviderGuardState | null | undefined
				)?.cooldownDetectedAt;
				next.cooldownReason = (
					current as SimpleProviderGuardState | null | undefined
				)?.cooldownReason;
				next.cooldownAction = (
					current as SimpleProviderGuardState | null | undefined
				)?.cooldownAction;
			}
			await this.writeProviderGuardState(next);
			return;
		}
		const currentChatgpt = current as ChatgptRateLimitGuardState | null;
		const next: ChatgptRateLimitGuardState = {
			provider: "chatgpt",
			profile: this.resolveActiveProfileName() ?? "default",
			updatedAt: now,
			recentRateLimitDetectionAts: pruneChatgptRateLimitDetectionHistory(
				currentChatgpt?.recentRateLimitDetectionAts,
				now,
			),
			lastMutationAt: this.isMutatingProviderAction(action) ? now : currentChatgpt?.lastMutationAt,
			recentMutations: this.isMutatingProviderAction(action)
				? appendChatgptMutationRecord(
						currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
						action,
						now,
						settings.mutationWindowMs,
					)
				: currentChatgpt?.recentMutations,
			recentMutationAts: this.isMutatingProviderAction(action)
				? appendChatgptMutationRecord(
						currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
						action,
						now,
						settings.mutationWindowMs,
					).map((entry) => entry.at)
				: currentChatgpt?.recentMutationAts,
		};
		const cooldownUntil = currentChatgpt?.cooldownUntil;
		if (typeof cooldownUntil === "number" && cooldownUntil > now) {
			next.cooldownUntil = cooldownUntil;
			next.cooldownDetectedAt = currentChatgpt?.cooldownDetectedAt;
			next.cooldownReason = currentChatgpt?.cooldownReason;
			next.cooldownAction = currentChatgpt?.cooldownAction;
		}
		await this.writeProviderGuardState(next);
	}

	private async handleProviderGuardFailure(action: string, error: unknown): Promise<unknown> {
		const settings = this.getProviderGuardSettings();
		if (!settings || !this.isProviderRateLimitedError(error)) {
			return error;
		}
		if (this.providerId === "chatgpt" && this.isProviderEffectObserved(error)) {
			return error;
		}
		const now = Date.now();
		const current = await this.readProviderGuardState();
		const cooldownUntil = now + (this.extractProviderRetryAfterMs(error) ?? settings.cooldownMs);
		const reason = this.extractProviderRateLimitSummary(error);
		if (this.providerId === "gemini" || this.providerId === "grok") {
			await this.writeProviderGuardState({
				provider: this.providerId,
				profile: this.resolveActiveProfileName() ?? "default",
				updatedAt: now,
				cooldownDetectedAt: now,
				cooldownUntil,
				cooldownReason: reason ?? undefined,
				cooldownAction: action,
				lastMutationAt: this.isMutatingProviderAction(action) ? now : undefined,
			} satisfies SimpleProviderGuardState);
			const detail = reason ? ` ${reason}` : "";
			const message = `${
				this.providerId === "gemini" ? "Gemini anti-bot block" : "Grok rate limit"
			} detected while ${action}; cooling down until ${new Date(cooldownUntil).toISOString()}.${detail}`.trim();
			if (error instanceof Error) {
				const wrapped = new Error(message, { cause: error }) as Error & {
					uiDiagnostics?: unknown;
					originalError?: unknown;
				};
				if ("uiDiagnostics" in error) {
					wrapped.uiDiagnostics = (error as Error & { uiDiagnostics?: unknown }).uiDiagnostics;
				}
				wrapped.originalError = error;
				return wrapped;
			}
			return new Error(message, { cause: error as never });
		}
		const currentChatgpt = current as ChatgptRateLimitGuardState | null;
		const chatgptCooldownUntil =
			now +
			resolveChatgptRateLimitCooldownMs(currentChatgpt, now, {
				retryAfterMs: this.extractProviderRetryAfterMs(error),
				baseCooldownMs: settings.cooldownMs,
			});
		await this.writeProviderGuardState({
			provider: "chatgpt",
			profile: this.resolveActiveProfileName() ?? "default",
			updatedAt: now,
			recentRateLimitDetectionAts: appendChatgptRateLimitDetection(
				currentChatgpt?.recentRateLimitDetectionAts,
				now,
			),
			cooldownDetectedAt: now,
			cooldownUntil: chatgptCooldownUntil,
			cooldownReason: reason ?? undefined,
			cooldownAction: action,
			lastMutationAt: this.isMutatingProviderAction(action) ? now : undefined,
			recentMutations: this.isMutatingProviderAction(action)
				? appendChatgptMutationRecord(
						currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
						action,
						now,
						settings.mutationWindowMs,
					)
				: currentChatgpt?.recentMutations,
			recentMutationAts: this.isMutatingProviderAction(action)
				? appendChatgptMutationRecord(
						currentChatgpt?.recentMutations ?? currentChatgpt?.recentMutationAts,
						action,
						now,
						settings.mutationWindowMs,
					).map((entry) => entry.at)
				: currentChatgpt?.recentMutationAts,
		});
		const detail = reason ? ` ${reason}` : "";
		const message = `ChatGPT rate limit detected while ${action}; cooling down until ${new Date(
			chatgptCooldownUntil,
		).toISOString()}.${detail}`.trim();
		if (error instanceof Error) {
			const wrapped = new Error(message, { cause: error }) as Error & {
				uiDiagnostics?: unknown;
				originalError?: unknown;
			};
			if ("uiDiagnostics" in error) {
				wrapped.uiDiagnostics = (error as Error & { uiDiagnostics?: unknown }).uiDiagnostics;
			}
			wrapped.originalError = error;
			return wrapped;
		}
		return new Error(message, { cause: error as never });
	}

	private isMutatingProviderAction(action: string): boolean {
		if (
			this.providerId !== "chatgpt" &&
			this.providerId !== "gemini" &&
			this.providerId !== "grok"
		) {
			return false;
		}
		switch (action) {
			case "renameProject":
			case "cloneProject":
			case "pushProjectRemoveConfirmation":
			case "clickCreateProjectConfirm":
			case "uploadProjectFiles":
			case "uploadAccountFiles":
			case "deleteProjectFile":
			case "deleteAccountFile":
			case "createProject":
			case "updateProjectInstructions":
			case "renameConversation":
			case "deleteConversation":
			case "runPrompt":
				return true;
			default:
				return false;
		}
	}

	private isProviderRateLimitedError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		if (this.providerId === "chatgpt") {
			return isChatgptRateLimitMessage(message);
		}
		if (this.providerId === "gemini") {
			return /google\.com\/sorry|unusual traffic|captcha|recaptcha|human verification|anti-bot/i.test(
				message,
			);
		}
		if (this.providerId === "grok") {
			return /too many requests|query limit|rate limit|try again later|try again in\s+\d+|slow down|request limit/i.test(
				message,
			);
		}
		return false;
	}

	private extractProviderRateLimitSummary(error: unknown): string | null {
		const message = error instanceof Error ? error.message : String(error);
		if (this.providerId === "chatgpt") {
			return extractChatgptRateLimitSummary(message);
		}
		if (this.providerId === "gemini") {
			const normalized = message.replace(/\s+/g, " ").trim();
			const direct = normalized.match(
				/(google blocked gemini[^.]*\.?|unusual traffic[^.]*\.?|captcha[^.]*\.?)/i,
			);
			return direct?.[1]?.trim() ?? null;
		}
		if (this.providerId === "grok") {
			const normalized = message.replace(/\s+/g, " ").trim();
			const direct = normalized.match(
				/(query limit[^.]*\.?(?:\s*try again in [^.]*\.?)?|too many requests[^.]*\.?|rate limit[^.]*\.?|slow down[^.]*\.?|try again later[^.]*\.?|try again in [^.]*\.?)/i,
			);
			return direct?.[1]?.trim() ?? null;
		}
		return null;
	}

	private extractProviderRetryAfterMs(error: unknown): number | null {
		const message = error instanceof Error ? error.message : String(error);
		if (this.providerId !== "grok") {
			return null;
		}
		const match = message.match(
			/try again in\s+(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours)/i,
		);
		if (!match) {
			return null;
		}
		const amount = Number(match[1]);
		if (!Number.isFinite(amount) || amount <= 0) {
			return null;
		}
		const unit = match[2].toLowerCase();
		if (unit.startsWith("sec")) {
			return amount * 1000;
		}
		if (unit.startsWith("hour")) {
			return amount * 60 * 60_000;
		}
		return amount * 60_000;
	}

	private async readProviderGuardState(): Promise<
		ChatgptRateLimitGuardState | SimpleProviderGuardState | null
	> {
		if (this.providerId === "chatgpt") {
			return readChatgptRateLimitGuardState({
				profileName: this.resolveActiveProfileName() ?? "default",
				cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
			});
		}
		if (this.providerId === "gemini" || this.providerId === "grok") {
			return readSimpleProviderGuardState({
				provider: this.providerId,
				profileName: this.resolveActiveProfileName() ?? "default",
				cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
			});
		}
		return null;
	}

	private async writeProviderGuardState(
		state: ChatgptRateLimitGuardState | SimpleProviderGuardState,
	): Promise<void> {
		if (this.providerId === "chatgpt") {
			await writeChatgptRateLimitGuardState(state as ChatgptRateLimitGuardState, {
				profileName: this.resolveActiveProfileName() ?? "default",
				cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
			});
			return;
		}
		if (this.providerId !== "gemini" && this.providerId !== "grok") {
			return;
		}
		await writeSimpleProviderGuardState(state as SimpleProviderGuardState, {
			provider: this.providerId,
			profileName: this.resolveActiveProfileName() ?? "default",
			cacheRoot: this.userConfig.browser?.cache?.rootDir ?? null,
		});
	}

	private isRetryableError(error: unknown): boolean {
		if (error instanceof ProviderSessionAuthorityError) {
			return false;
		}
		if (this.isProviderEffectObserved(error)) {
			return false;
		}
		const message = error instanceof Error ? error.message : String(error);
		if (this.providerId === "chatgpt" && isChatgptRateLimitMessage(message)) {
			return true;
		}
		if (
			this.providerId === "chatgpt" &&
			/server connection failed|connection failed|connection lost|network error|failed to connect|unable to connect|something went wrong|an error occurred|message could not be generated|please try again|content not found|messages not found/i.test(
				message,
			)
		) {
			return true;
		}
		return (
			message.includes("WebSocket connection closed") ||
			message.includes("WebSocket is not open") ||
			message.includes("ECONNRESET")
		);
	}

	private isProviderEffectObserved(error: unknown): boolean {
		return Boolean(
			typeof error === "object" &&
				error !== null &&
				"details" in error &&
				(error as { details?: { effectState?: string } }).details?.effectState ===
					"effect_observed",
		);
	}

	private getRetryDelayMs(attempt: number, error: unknown): number {
		if (this.providerId !== "chatgpt") {
			return 500;
		}
		const isRateLimited = this.isProviderRateLimitedError(error);
		const base = isRateLimited
			? CHATGPT_RATE_LIMIT_RETRY_BASE_MS + attempt * CHATGPT_RATE_LIMIT_RETRY_STEP_MS
			: CHATGPT_RETRY_BASE_MS + attempt * CHATGPT_RETRY_STEP_MS;
		const maxMs = isRateLimited ? CHATGPT_RATE_LIMIT_RETRY_MAX_MS : CHATGPT_RETRY_MAX_MS;
		const jitter = this.getDeterministicJitterMs(
			`${String(error)}|${String(attempt)}`,
			isRateLimited ? CHATGPT_RATE_LIMIT_RETRY_JITTER_MS : CHATGPT_RETRY_JITTER_MS,
		);
		return Math.min(base + jitter, maxMs);
	}

	private getDeterministicJitterMs(seed: string, maxMs: number): number {
		if (!Number.isFinite(maxMs) || maxMs <= 0) {
			return 0;
		}
		let hash = 0;
		for (let index = 0; index < seed.length; index += 1) {
			hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
		}
		return hash % (Math.floor(maxMs) + 1);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

function shouldAttachResolvedServiceTab(overrides: BrowserProviderListOptions): boolean {
	if (overrides.tabTargetId) return true;
	return overrides.tabLifecycle !== "dispose-new" && overrides.tabLifecycle !== "retain-new";
}

function isRateLimitBlockingSurfaceError(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("blockingSurface" in error)) {
		return false;
	}
	const blockingSurface = (error as { blockingSurface?: { kind?: unknown } | null })
		.blockingSurface;
	return blockingSurface?.kind === "rate-limit";
}

export const shouldAttachResolvedServiceTabForTest = shouldAttachResolvedServiceTab;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPositiveNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: null;
}

function readNonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: null;
}

function parseLatestSelector(value: string): number | null {
	const match = value.trim().match(/^latest(?:-(\d+))?$/i);
	if (!match) return null;
	const offset = match[1] ? Number.parseInt(match[1], 10) : 0;
	if (!Number.isFinite(offset) || offset < 0) return null;
	return offset;
}

function resolveProjectNameMatch(
	projects: Project[],
	projectName: string,
	options: { preferFirstCandidate?: boolean } = {},
): ReturnType<typeof matchProjectByName> {
	const result = matchProjectByName(projects, projectName);
	if (!result.match && options.preferFirstCandidate && result.candidates.length > 1) {
		return {
			match: result.candidates[0] ?? null,
			candidates: result.candidates,
		};
	}
	return result;
}

type ProjectResolutionErrorCode =
	| "project_discovery_failed"
	| "project_not_found"
	| "project_cache_miss";
type ProjectResolutionCacheState = "cache_empty" | "cache_stale" | "cache_available";
type ProjectResolutionLiveRefreshState = "not_attempted" | "completed" | "failed";

interface ProjectResolutionDiagnostics {
	code: ProjectResolutionErrorCode;
	provider: ProviderId;
	projectName: string;
	cacheState: ProjectResolutionCacheState;
	cacheItemCount: number;
	liveRefreshState: ProjectResolutionLiveRefreshState;
	liveRefreshError: string | null;
	candidates: string[];
	runtimeProfile: string | null;
	identityKey: string | null;
	configuredUrl: string | null;
}

function resolveProjectResolutionCacheState(cached: {
	items: Project[];
	stale: boolean;
}): ProjectResolutionCacheState {
	if (cached.items.length === 0) return "cache_empty";
	if (cached.stale) return "cache_stale";
	return "cache_available";
}

function createProjectResolutionError(
	input: Omit<ProjectResolutionDiagnostics, "candidates"> & {
		candidates: Project[];
	},
): Error & {
	code: ProjectResolutionErrorCode;
	type: ProjectResolutionErrorCode;
	diagnostics: ProjectResolutionDiagnostics;
} {
	const diagnostics: ProjectResolutionDiagnostics = {
		...input,
		candidates: input.candidates
			.map((item) => item.name || item.id)
			.filter(Boolean)
			.slice(0, 25),
	};
	const message = formatProjectResolutionMessage(diagnostics);
	return Object.assign(new Error(message), {
		code: diagnostics.code,
		type: diagnostics.code,
		diagnostics,
	});
}

function formatProjectResolutionMessage(diagnostics: ProjectResolutionDiagnostics): string {
	const context = [
		`provider=${diagnostics.provider}`,
		`runtimeProfile=${diagnostics.runtimeProfile ?? "default"}`,
		`identityKey=${diagnostics.identityKey ?? "unknown"}`,
		`cacheState=${diagnostics.cacheState}`,
		`cacheItems=${diagnostics.cacheItemCount}`,
		`liveRefresh=${diagnostics.liveRefreshState}`,
	];
	const candidates = diagnostics.candidates.length
		? ` candidates=${diagnostics.candidates.join(", ")}`
		: " candidates=(none)";
	if (diagnostics.code === "project_discovery_failed") {
		return `Project discovery failed for "${diagnostics.projectName}" (${context.join(" ")}): ${diagnostics.liveRefreshError ?? "unknown error"}`;
	}
	if (diagnostics.code === "project_not_found") {
		return `Project "${diagnostics.projectName}" was not found after live discovery (${context.join(" ")}).${candidates}`;
	}
	return `No cached project named "${diagnostics.projectName}" and live project discovery was not run (${context.join(" ")}). Run "auracall projects --target ${diagnostics.provider}" to refresh.${candidates}`;
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resolveCacheStoreKind(value: unknown): CacheStoreKind {
	if (value === "json" || value === "sqlite" || value === "dual") {
		return value;
	}
	return "dual";
}

function sortConversationsByRecency(items: Conversation[]): Conversation[] {
	return items
		.map((item, index) => {
			const timestamp = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
			return { item, index, timestamp };
		})
		.sort((a, b) => {
			const aValid = Number.isFinite(a.timestamp);
			const bValid = Number.isFinite(b.timestamp);
			if (aValid && bValid) return b.timestamp - a.timestamp;
			if (aValid && !bValid) return -1;
			if (!aValid && bValid) return 1;
			return a.index - b.index;
		})
		.map((entry) => entry.item);
}

function filterConversationsForScope(
	items: Conversation[],
	options: { providerId: ProviderId; noProject: boolean },
): Conversation[] {
	if (!options.noProject) return items;
	if (options.providerId === "chatgpt") {
		return items.filter((item) => !item.projectId);
	}
	return items;
}
