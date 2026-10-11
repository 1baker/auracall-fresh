import fs from 'node:fs/promises';
import path from 'node:path';
import { createExecutionResponseMessage } from './apiModel.js';
import type { ExecuteStoredRunStepContext, ExecuteStoredRunStepResult } from './runner.js';
import type { ExecutionServiceHostDeps } from './serviceHost.js';
import type { TeamRunArtifactRef } from '../teams/types.js';
import { getAgent, resolveRuntimeSelection } from '../config/model.js';
import { resolveConfiguredServiceAccountId } from '../config/serviceAccountIdentity.js';
import {
  isChatgptSemanticModelSelector,
  resolveChatgptSemanticModelSelector,
} from '../config/modelSelector.js';
import { runBrowserMode } from '../browser/index.js';
import {
  normalizeLibraryFileSelectors,
  type LibraryFileSelector,
} from '../browser/libraryFiles.js';
import { resolveRuntimeProfileUserConfig } from '../browser/service/profileConfig.js';
import { resolveBrowserLaunchPlan } from '../browser/service/browserLaunchPlan.js';
import { resumeBrowserSession } from '../browser/reattach.js';
import { waitForAssistantResponse } from '../browser/actions/assistantResponse.js';
import type {
  BrowserAttachment,
  BrowserRunOptions,
  BrowserRunResult,
  BrowserRuntimeEvidence,
  BrowserRuntimeMetadata,
  CookieParam,
} from '../browser/types.js';
import { resolveChatgptProjectUrl } from '../browser/providers/chatgptAdapter.js';
import {
  createProviderSessionAuthority,
  type ProviderSessionAuthorization,
} from '../browser/providers/providerSessionAuthority.js';
import { createLlmService } from '../browser/llmService/providers/index.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { ResolvedUserConfig } from '../config.js';
import { createGeminiWebExecutor } from '../gemini-web/executor.js';
import { resolveManagedProfileCookieExportPath } from '../browser/profileStore.js';
import {
  clearLiveRuntimeRunServiceState,
  recordLiveRuntimeRunServiceState,
} from './liveServiceStateRegistry.js';
import {
  createStepOutputContractResult,
  parseAuraCallStepOutputEnvelope,
  prependAuraCallStepOutputContractPrompt,
  shouldUseAuraCallStepOutputContract,
} from './stepOutputContract.js';

type MutableRecord = Record<string, unknown>;

const BROWSER_INLINE_PROMPT_CHAR_BUDGET = 60_000;

export interface CreateConfiguredStoredStepExecutorDeps {
  runBrowserModeImpl?: (options: BrowserRunOptions) => Promise<Awaited<ReturnType<typeof runBrowserMode>>>;
  runGeminiBrowserModeImpl?: (options: BrowserRunOptions) => Promise<Awaited<ReturnType<typeof runBrowserMode>>>;
  resumeBrowserSessionImpl?: typeof resumeBrowserSession;
  effectiveConfigProvider?: () => Promise<Record<string, unknown>>;
  browserResponseArtifactMaterializer?: (input: BrowserResponseArtifactMaterializerInput) => Promise<BrowserResponseArtifactMaterializerResult>;
  logger?: (message: string) => void;
}

interface BrowserResponseArtifactMaterializerInput {
  service: 'chatgpt' | 'gemini' | 'grok';
  executionConfig: Record<string, unknown>;
  conversationId: string | null;
  projectId: string | null;
  configuredUrl: string | null;
  tabUrl: string | null;
  tabTargetId: string | null;
  chromeHost: string | null;
  chromePort: number | null;
}

interface BrowserResponseArtifactMaterializerResult {
  artifacts: TeamRunArtifactRef[];
  notes: string[];
}

type RecoveredBrowserRuntimeMetadata = BrowserRuntimeMetadata & {
  auracallProfileName?: string;
  runtimeProfileId?: string;
  browserProfileId?: string | null;
};

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeBrowserObservationStateForRuntime(
  state: BrowserRuntimeEvidence['observation']['state'],
): Parameters<typeof recordLiveRuntimeRunServiceState>[0]['state'] {
  if (state === 'plan-ready' || state === 'research-started') {
    return 'thinking';
  }
  return state;
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'request';
}

function hasRecoveredStrandedStepEvent(context: ExecuteStoredRunStepContext): boolean {
  const stepId = context.step.id;
  return context.record.bundle.events?.some((event) =>
    event.stepId === stepId &&
    event.type === 'note-added' &&
    event.note === 'recovered stranded running step for host replay'
  ) ?? false;
}

function readLatestRuntimeEvidenceForStep(
  context: ExecuteStoredRunStepContext,
  service: 'chatgpt' | 'gemini' | 'grok',
): MutableRecord | null {
  const stepId = context.step.id;
  const events = [...(context.record.bundle.events ?? [])].reverse();
  let bestEvidence: MutableRecord | null = null;
  let bestScore = -1;
  for (const event of events) {
    if (event.stepId && event.stepId !== stepId) {
      continue;
    }
    const payload = isRecord(event.payload) ? event.payload : null;
    const runtimeEvidence = isRecord(payload?.runtimeEvidence) ? payload.runtimeEvidence : null;
    const details = isRecord(runtimeEvidence?.details) ? runtimeEvidence.details : null;
    if (!runtimeEvidence || !details) {
      continue;
    }
    const evidenceService = asNonEmptyString(details.service);
    if (evidenceService && evidenceService !== service) {
      continue;
    }
    const chromeTargetId = asNonEmptyString(details.chromeTargetId);
    const tabUrl = asNonEmptyString(details.tabUrl);
    const conversationId = asNonEmptyString(details.conversationId);
    if (!chromeTargetId && !tabUrl && !conversationId) {
      continue;
    }
    if (service === 'chatgpt' && !isSubmittedChatgptRuntimeEvidence(runtimeEvidence, details)) {
      continue;
    }
    const score =
      (conversationId ? 8 : 0) +
      (tabUrl?.includes('/c/') ? 4 : tabUrl ? 2 : 0) +
      (chromeTargetId ? 2 : 0) +
      (asFiniteNumber(details.chromePort) ? 2 : 0) +
      (asNonEmptyString(details.chromeHost) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestEvidence = runtimeEvidence;
    }
  }
  return bestEvidence;
}

function isSubmittedChatgptRuntimeEvidence(evidence: MutableRecord, details: MutableRecord): boolean {
  const tabUrl = asNonEmptyString(details.tabUrl) ?? asNonEmptyString(evidence.evidenceRef);
  if (asNonEmptyString(details.conversationId) || extractChatgptConversationIdFromUrl(tabUrl ?? null)) {
    return true;
  }
  const state = asNonEmptyString(evidence.state);
  const evidenceRef = asNonEmptyString(evidence.evidenceRef);
  return (
    evidenceRef === 'chatgpt-prompt-dispatched' ||
    evidenceRef === 'chatgpt-prompt-submitted' ||
    evidenceRef === 'chatgpt-passive-dom-probe' ||
    evidenceRef === 'chatgpt-assistant-snapshot' ||
    evidenceRef === 'chatgpt-response-finished' ||
    state === 'response-incoming' ||
    state === 'response-complete'
  );
}

function extractChatgptConversationIdFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/c\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function buildBrowserRuntimeMetadataFromEvidence(input: {
  evidence: MutableRecord;
  runtimeProfileId: string;
  browserProfileId: string | null;
  manualLoginProfileDir: string | null;
  agentId: string;
}): RecoveredBrowserRuntimeMetadata {
  const details = isRecord(input.evidence.details) ? input.evidence.details : {};
  const tabUrl = asNonEmptyString(details.tabUrl) ?? asNonEmptyString(input.evidence.evidenceRef) ?? undefined;
  const conversationId =
    asNonEmptyString(details.conversationId) ??
    extractChatgptConversationIdFromUrl(tabUrl ?? null) ??
    undefined;
  return {
    auracallProfileName: input.runtimeProfileId,
    selectedAgentId: input.agentId,
    chromePort: asFiniteNumber(details.chromePort) ?? undefined,
    chromeHost: asNonEmptyString(details.chromeHost) ?? undefined,
    chromeTargetId: asNonEmptyString(details.chromeTargetId) ?? undefined,
    tabUrl,
    conversationId,
    userDataDir: input.manualLoginProfileDir ?? undefined,
    runtimeProfileId: input.runtimeProfileId,
    browserProfileId: input.browserProfileId,
  };
}

function createBrowserRunResultFromReattach(input: {
  result: Awaited<ReturnType<typeof resumeBrowserSession>>;
  runtime: ReturnType<typeof buildBrowserRuntimeMetadataFromEvidence>;
}): BrowserRunResult {
  const answerMarkdown = input.result.answerMarkdown || input.result.answerText || '';
  const answerText = input.result.answerText || answerMarkdown;
  return {
    answerText,
    answerMarkdown,
    tookMs: 0,
    answerTokens: Math.max(1, Math.ceil(answerMarkdown.length / 4)),
    answerChars: answerText.length,
    chromePid: undefined,
    chromePort: input.runtime.chromePort,
    chromeHost: input.runtime.chromeHost,
    userDataDir: input.runtime.userDataDir,
    chromeTargetId: input.runtime.chromeTargetId,
    tabUrl: input.runtime.tabUrl,
    conversationId: input.runtime.conversationId,
    passiveObservations: [],
    controllerPid: process.pid,
  };
}

function readJsonObjectResponseFormat(metadata: unknown): MutableRecord | null {
  if (!isRecord(metadata)) return null;
  const responseFormat = metadata.response_format;
  if (!isRecord(responseFormat)) return null;
  return responseFormat.type === 'json_object' ? responseFormat : null;
}

function buildResponseFormatInstruction(metadata: unknown): string | null {
  const responseFormat = readJsonObjectResponseFormat(metadata);
  if (!responseFormat) return null;
  return 'The caller requested OpenAI-compatible response_format {"type":"json_object"}. Return exactly one valid JSON object and no surrounding prose.';
}

function buildBrowserResponseArtifactInstruction(
  metadata: unknown,
  service: 'chatgpt' | 'gemini' | 'grok',
): string | null {
  if (!shouldMaterializeBrowserResponseArtifacts(metadata)) return null;
  const fileName = readRequiredBrowserResponseArtifactFileName(metadata);
  const target = fileName ? ` named exactly ${fileName}` : '';
  const fileBaseName = fileName ? path.basename(fileName) : null;
  const chatgptSandboxInstruction =
    service === 'chatgpt' && fileBaseName
      ? [
          `For ChatGPT, use the workbench/Python file sandbox and write the requested output to /mnt/data/${fileBaseName}.`,
          `Include a final markdown download link exactly [${fileBaseName}](sandbox:/mnt/data/${fileBaseName}) so AuraCall can materialize it.`,
        ]
      : [];
  return [
    `Create a downloadable/workspace file artifact${target}.`,
    ...chatgptSandboxInstruction,
    'Use the provider workbench file/artifact tooling when available; do not satisfy this request with inline prose only.',
    fileName
      ? `Do not reply that ${fileName} is ready until the file artifact exists in the conversation and can be downloaded.`
      : 'Do not reply that the work is ready until the file artifact exists in the conversation and can be downloaded.',
  ].join(' ');
}

function shouldMaterializeBrowserResponseArtifacts(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;
  const outputContract = isRecord(metadata.outputContract) ? metadata.outputContract : null;
  if (!outputContract) return false;
  const mode = asNonEmptyString(outputContract.mode)?.toLowerCase() ?? '';
  return mode.includes('artifact') || asNonEmptyString(outputContract.artifactFileName) !== null;
}

function readRequiredBrowserResponseArtifactFileName(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const outputContract = isRecord(metadata.outputContract) ? metadata.outputContract : null;
  if (!outputContract) return null;
  const mode = asNonEmptyString(outputContract.mode)?.toLowerCase() ?? '';
  const artifactFileName = asNonEmptyString(outputContract.artifactFileName);
  if (!mode.includes('artifact') && !artifactFileName) return null;
  return artifactFileName;
}

function normalizeArtifactName(value: string): string {
  return value.trim().toLowerCase();
}

function artifactMatchesRequiredFileName(artifact: TeamRunArtifactRef, requiredFileName: string): boolean {
  const expected = normalizeArtifactName(path.basename(requiredFileName));
  const candidates = [
    artifact.title,
    artifact.path ? path.basename(artifact.path) : null,
    artifact.uri ? path.basename(artifact.uri.split(/[?#]/, 1)[0] ?? artifact.uri) : null,
    artifact.id,
  ].map((value) => typeof value === 'string' ? normalizeArtifactName(path.basename(value)) : null);
  return candidates.includes(expected);
}

function artifactIsMaterializedFile(artifact: TeamRunArtifactRef): boolean {
  return Boolean(asNonEmptyString(artifact.path));
}

function assertRequiredBrowserResponseArtifactMaterialized(input: {
  metadata: unknown;
  artifacts: TeamRunArtifactRef[];
  notes: string[];
  answerText: string;
}): void {
  const requiredFileName = readRequiredBrowserResponseArtifactFileName(input.metadata);
  if (!requiredFileName && !shouldMaterializeBrowserResponseArtifacts(input.metadata)) {
    return;
  }
  const hasRequiredArtifact = requiredFileName
    ? input.artifacts.some((artifact) => artifactMatchesRequiredFileName(artifact, requiredFileName) && artifactIsMaterializedFile(artifact))
    : input.artifacts.some((artifact) => artifactIsMaterializedFile(artifact));
  if (hasRequiredArtifact) {
    return;
  }
  const expected = requiredFileName ?? 'a browser response artifact';
  const materializationNote = input.notes.find((note) => note.includes('browser response artifact materialization'));
  const answerPreview = input.answerText.replace(/\s+/g, ' ').trim().slice(0, 240);
  throw new Error(
    `Browser-backed step completed without required artifact ${expected}. ` +
      `${materializationNote ?? 'browser response artifact materialization produced no artifacts'}. ` +
      `Assistant text was status-only or incomplete: ${answerPreview}`,
  );
}

function hasRequiredBrowserResponseArtifactMaterialized(input: {
  metadata: unknown;
  artifacts: TeamRunArtifactRef[];
}): boolean {
  const requiredFileName = readRequiredBrowserResponseArtifactFileName(input.metadata);
  if (!requiredFileName && !shouldMaterializeBrowserResponseArtifacts(input.metadata)) {
    return true;
  }
  return requiredFileName
    ? input.artifacts.some((artifact) => artifactMatchesRequiredFileName(artifact, requiredFileName) && artifactIsMaterializedFile(artifact))
    : input.artifacts.some((artifact) => artifactIsMaterializedFile(artifact));
}

function buildRequiredArtifactCorrectionPrompt(input: {
  metadata: unknown;
  previousAnswerText: string;
}): string | null {
  const requiredFileName = readRequiredBrowserResponseArtifactFileName(input.metadata);
  if (!requiredFileName) {
    return null;
  }
  const fileBaseName = path.basename(requiredFileName);
  const previousAnswerPreview = input.previousAnswerText.replace(/\s+/g, ' ').trim().slice(0, 500);
  return [
    `Your previous reply did not provide a downloadable ${fileBaseName} artifact.`,
    previousAnswerPreview
      ? `Previous reply preview: ${previousAnswerPreview}`
      : null,
    `Do not restate intent. Create the file now in the ChatGPT workspace at /mnt/data/${fileBaseName}.`,
    `The file must contain the complete requested output and must be downloadable.`,
    `After the file exists, reply only with this markdown link: [${fileBaseName}](sandbox:/mnt/data/${fileBaseName})`,
  ].filter((line): line is string => line !== null).join('\n');
}

function artifactRefFromFile(value: Record<string, unknown>): TeamRunArtifactRef | null {
  const localPath = asNonEmptyString(value.localPath);
  const remoteUrl = asNonEmptyString(value.remoteUrl);
  const id = asNonEmptyString(value.id) ?? localPath ?? remoteUrl;
  if (!id) return null;
  const sourceMetadata = isRecord(value.metadata) ? value.metadata : {};
  return {
    id,
    kind: 'file',
    title: asNonEmptyString(value.name) ?? asNonEmptyString(value.title),
    path: localPath,
    uri: remoteUrl,
    metadata: {
      ...sourceMetadata,
      fileId: id,
      fileName: asNonEmptyString(value.name) ?? asNonEmptyString(value.title),
      mimeType: asNonEmptyString(value.mimeType),
      remoteUrl,
      localPath,
      size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : null,
      checksumSha256: asNonEmptyString(value.checksumSha256) ?? asNonEmptyString(sourceMetadata.checksumSha256),
    },
  };
}

function artifactRefFromProviderArtifact(value: Record<string, unknown>): TeamRunArtifactRef | null {
  const id = asNonEmptyString(value.id) ?? asNonEmptyString(value.uri);
  if (!id) return null;
  const sourceMetadata = isRecord(value.metadata) ? value.metadata : {};
  return {
    id,
    kind: asNonEmptyString(value.kind) ?? 'generated',
    title: asNonEmptyString(value.title),
    path: null,
    uri: asNonEmptyString(value.uri),
    metadata: {
      ...sourceMetadata,
      providerArtifactId: id,
      providerArtifactKind: asNonEmptyString(value.kind),
      remoteUrl: asNonEmptyString(value.uri) ?? asNonEmptyString(sourceMetadata.remoteUrl),
    },
  };
}

async function materializeBrowserResponseArtifacts(
  input: BrowserResponseArtifactMaterializerInput,
): Promise<BrowserResponseArtifactMaterializerResult> {
  if (!input.conversationId) {
    return { artifacts: [], notes: ['browser response artifact materialization skipped: missing conversation id'] };
  }
  const llmService = createLlmService(input.service, input.executionConfig as never);
  const result = await llmService.materializeConversationArtifacts(input.conversationId, {
    projectId: input.projectId ?? undefined,
    refresh: true,
    listOptions: {
      configuredUrl: input.configuredUrl,
      projectId: input.projectId,
      tabUrl: input.tabUrl,
      tabTargetId: input.tabTargetId ?? undefined,
      host: input.chromeHost ?? undefined,
      port: input.chromePort ?? undefined,
    },
  });
  const fileArtifacts = result.files.flatMap((file) => {
    const artifact = artifactRefFromFile(file as unknown as Record<string, unknown>);
    return artifact ? [artifact] : [];
  });
  const discoveredArtifacts = result.artifacts.flatMap((providerArtifact) => {
    const artifact = artifactRefFromProviderArtifact(providerArtifact as unknown as Record<string, unknown>);
    return artifact ? [artifact] : [];
  });
  const byId = new Map<string, TeamRunArtifactRef>();
  for (const artifact of [...discoveredArtifacts, ...fileArtifacts]) {
    const existing = byId.get(artifact.id);
    byId.set(artifact.id, {
      ...existing,
      ...artifact,
      title: artifact.title ?? existing?.title,
      path: artifact.path ?? existing?.path ?? null,
      uri: artifact.uri ?? existing?.uri ?? null,
      kind: artifact.kind ?? existing?.kind,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(artifact.metadata ?? {}),
      },
    });
  }
  return {
    artifacts: Array.from(byId.values()),
    notes: [
      `browser response artifact materialization: discovered=${result.artifacts.length} materialized=${result.files.length}`,
      ...(result.manifestPath ? [`browser response artifact manifest: ${result.manifestPath}`] : []),
    ],
  };
}

function buildBrowserPromptWithRequestInstructions(
  context: ExecuteStoredRunStepContext,
  prompt: string,
  service: 'chatgpt' | 'gemini' | 'grok',
): string {
  const instructionParts = [
    ...context.step.input.notes
      .map((note) => asNonEmptyString(note))
      .filter((note): note is string => note !== null),
    buildResponseFormatInstruction(context.step.input.structuredData?.metadata),
    buildBrowserResponseArtifactInstruction(context.step.input.structuredData?.metadata, service),
  ].filter((note): note is string => note !== null);
  if (instructionParts.length === 0) {
    return prompt;
  }
  return `Request instructions:\n${instructionParts.map((note) => `- ${note}`).join('\n')}\n\nUser request:\n${prompt}`;
}

function asDeepResearchPlanAction(value: unknown): 'start' | 'edit' | null {
  return value === 'start' || value === 'edit' ? value : null;
}

function asLibraryFileSelectors(value: unknown): LibraryFileSelector[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('auracall.libraryFiles must be an array.');
  return normalizeLibraryFileSelectors(
    value.map((selector): LibraryFileSelector => {
      if (!isRecord(selector)) throw new Error('Each Library file selector must be an object.');
      return {
        ...(typeof selector.id === 'string' ? { id: selector.id } : {}),
        ...(typeof selector.name === 'string' ? { name: selector.name } : {}),
      } as LibraryFileSelector;
    }),
  );
}

function asThinkingTimeLevel(value: unknown): 'light' | 'standard' | 'extended' | 'heavy' | null {
  return value === 'light' || value === 'standard' || value === 'extended' || value === 'heavy' ? value : null;
}

function asChatgptMode(value: unknown): 'chat' | 'work' | null {
  return value === 'chat' || value === 'work' ? value : null;
}

function asChatgptToolApproval(
  value: unknown,
): 'manual' | 'allow-once' | 'always-allow' | null {
  return value === 'manual' || value === 'allow-once' || value === 'always-allow' ? value : null;
}

function readRuntimeServiceConfig(
  runtimeProfile: MutableRecord | null,
  service: 'chatgpt' | 'gemini' | 'grok',
): MutableRecord | null {
  if (!runtimeProfile || !isRecord(runtimeProfile.services)) {
    return null;
  }
  const entry = runtimeProfile.services[service];
  return isRecord(entry) ? entry : null;
}

function readGlobalServiceConfig(
  config: MutableRecord,
  service: 'chatgpt' | 'gemini' | 'grok',
): MutableRecord | null {
  if (!isRecord(config.services)) {
    return null;
  }
  const entry = config.services[service];
  return isRecord(entry) ? entry : null;
}

function readBrowserProfileConfig(value: unknown): MutableRecord | null {
  return isRecord(value) ? value : null;
}

function buildBrowserAttachments(context: ExecuteStoredRunStepContext): BrowserAttachment[] {
  return context.step.input.artifacts
    .map((artifact) => {
      const artifactPath = asNonEmptyString(artifact.path);
      if (!artifactPath) {
        return null;
      }
      const resolvedPath = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(process.cwd(), artifactPath);
      return {
        path: resolvedPath,
        displayPath: artifactPath,
      } satisfies BrowserAttachment;
    })
    .filter((artifact): artifact is BrowserAttachment => artifact !== null);
}

interface BrowserPromptTransport {
  prompt: string;
  attachments: BrowserAttachment[];
  metadata: {
    mode: 'inline' | 'request_attachment';
    originalPromptChars: number;
    attachmentPath?: string;
    attachmentDisplayPath?: string;
  };
}

async function prepareBrowserPromptTransport(input: {
  context: ExecuteStoredRunStepContext;
  prompt: string;
  attachments: BrowserAttachment[];
}): Promise<BrowserPromptTransport> {
  if (input.prompt.length <= BROWSER_INLINE_PROMPT_CHAR_BUDGET) {
    return {
      prompt: input.prompt,
      attachments: input.attachments,
      metadata: {
        mode: 'inline',
        originalPromptChars: input.prompt.length,
      },
    };
  }

  const runId = sanitizePathComponent(input.context.record.runId);
  const stepId = sanitizePathComponent(input.context.step.id);
  const dir = path.join(getAuracallHomeDir(), 'runtime', 'request-attachments', runId);
  await fs.mkdir(dir, { recursive: true });
  const displayPath = 'auracall-request.txt';
  const attachmentPath = path.join(dir, `${stepId}-${displayPath}`);
  await fs.writeFile(attachmentPath, input.prompt, 'utf8');
  const stats = await fs.stat(attachmentPath);
  const responseFormatInstruction = buildResponseFormatInstruction(input.context.step.input.structuredData?.metadata);
  const shortPrompt = [
    `The full AuraCall request is attached as ${displayPath}.`,
    'Read the attachment completely and answer the request it contains.',
    'Do not summarize the attachment unless the request explicitly asks for a summary.',
    responseFormatInstruction,
  ].filter((line): line is string => line !== null).join('\n');

  return {
    prompt: shortPrompt,
    attachments: [
      ...input.attachments,
      {
        path: attachmentPath,
        displayPath,
        sizeBytes: stats.size,
      },
    ],
    metadata: {
      mode: 'request_attachment',
      originalPromptChars: input.prompt.length,
      attachmentPath,
      attachmentDisplayPath: displayPath,
    },
  };
}

function summarizeOutput(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237)}...`;
}

function extractToolEnvelopeJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/);
  return fenced?.[1]?.trim() ?? null;
}

function parseConfiguredExecutorLocalActionRequests(text: string): Array<Record<string, unknown>> {
  const jsonText = extractToolEnvelopeJson(text);
  if (!jsonText) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.localActionRequests)) {
    return [];
  }

  return parsed.localActionRequests.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return [];
    }
    const kind =
      candidate.kind === 'shell'
        ? 'shell'
        : candidate.actionType === 'shell'
          ? 'shell'
          : candidate.type === 'shell'
            ? 'shell'
          : null;
    if (kind !== 'shell' || typeof candidate.command !== 'string') {
      return [];
    }
    const args = Array.isArray(candidate.args)
      ? candidate.args.filter((value): value is string => typeof value === 'string')
      : [];
    const structuredPayload =
      isRecord(candidate.structuredPayload)
        ? candidate.structuredPayload
        : isRecord(candidate.payload)
          ? candidate.payload
          : {};
    const notes = Array.isArray(candidate.notes)
      ? candidate.notes.filter((value): value is string => typeof value === 'string')
      : [];
    return [{
      kind: 'shell',
      summary:
        typeof candidate.summary === 'string' && candidate.summary.trim().length > 0
          ? candidate.summary
          : `Run bounded shell action: ${candidate.command}`,
      command: candidate.command,
      args,
      structuredPayload,
      notes,
    }];
  });
}

function parseInlineCookiesPayload(raw?: string | null): CookieParam[] | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  let jsonPayload = text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    if (decoded.trim().startsWith('[')) {
      jsonPayload = decoded;
    }
  } catch {
    // not base64
  }
  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    return Array.isArray(parsed) ? (parsed as CookieParam[]) : undefined;
  } catch {
    return undefined;
  }
}

async function readInlineCookiesFromFile(filePath: string | null | undefined): Promise<CookieParam[] | undefined> {
  const candidate = asNonEmptyString(filePath);
  if (!candidate) return undefined;
  try {
    const content = await fs.readFile(candidate, 'utf8');
    return parseInlineCookiesPayload(content);
  } catch {
    return undefined;
  }
}

async function resolveConfiguredExecutorInlineCookies(
  manualLoginProfileDir: string | null,
): Promise<{ cookies: CookieParam[]; source: string } | null> {
  const envFile = asNonEmptyString(process.env.AURACALL_BROWSER_COOKIES_FILE);
  const envPayload = asNonEmptyString(process.env.AURACALL_BROWSER_COOKIES_JSON);

  const envFileCookies = await readInlineCookiesFromFile(envFile);
  if (envFileCookies) {
    return { cookies: envFileCookies, source: 'env-file' };
  }

  const envPayloadCookies = parseInlineCookiesPayload(envPayload);
  if (envPayloadCookies) {
    return { cookies: envPayloadCookies, source: 'env-payload' };
  }

  const scopedPath = manualLoginProfileDir
    ? resolveManagedProfileCookieExportPath(manualLoginProfileDir)
    : null;
  const scopedCookies = await readInlineCookiesFromFile(scopedPath);
  if (scopedCookies) {
    return { cookies: scopedCookies, source: 'scoped:cookies.json' };
  }

  const homePath = path.join(getAuracallHomeDir(), 'cookies.json');
  const homeCookies = await readInlineCookiesFromFile(homePath);
  if (homeCookies) {
    return { cookies: homeCookies, source: 'home:cookies.json' };
  }

  return null;
}

export function createConfiguredStoredStepExecutor(
  config: Record<string, unknown>,
  deps: CreateConfiguredStoredStepExecutorDeps = {},
): ExecutionServiceHostDeps['executeStoredRunStep'] {
  const runBrowserModeImpl = deps.runBrowserModeImpl ?? runBrowserMode;
  const runGeminiBrowserModeImpl = deps.runGeminiBrowserModeImpl ?? createGeminiWebExecutor({});
  const resumeBrowserSessionImpl = deps.resumeBrowserSessionImpl ?? resumeBrowserSession;
  const configRecord = config as MutableRecord;

  return async (context): Promise<ExecuteStoredRunStepResult> => {
    const executionConfig = (deps.effectiveConfigProvider ? await deps.effectiveConfigProvider() : configRecord) as MutableRecord;
    const runtimeSelection = resolveRuntimeSelection(executionConfig, {
      explicitProfileName: context.step.runtimeProfileId,
      explicitAgentId: context.step.agentId,
    });
    const runtimeProfile = runtimeSelection.runtimeProfile;
    const engine = asNonEmptyString(runtimeProfile?.engine) ?? 'browser';
    const service = context.step.service ?? runtimeSelection.defaultService;
    if (engine !== 'browser') {
      throw new Error(
        `Stored team execution currently supports browser-backed runtime profiles only; step ${context.step.id} resolved engine ${engine}.`,
      );
    }
    if (service !== 'chatgpt' && service !== 'gemini' && service !== 'grok') {
      throw new Error(`Stored team execution requires a browser-capable service; step ${context.step.id} resolved ${service ?? 'none'}.`);
    }
    const affinityBaseConfig = resolveRuntimeProfileUserConfig(executionConfig, {
      runtimeProfileId: runtimeSelection.runtimeProfileId,
      provider: service,
    }) as ResolvedUserConfig;
    const browserLaunchPlan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: executionConfig as ResolvedUserConfig },
      intent: {
        provider: service,
        runtimeProfileId: runtimeSelection.runtimeProfileId,
        browserProfileId: runtimeSelection.browserProfileId,
        agentId: context.step.agentId,
      },
    });

    const launchOptions = {
      chromePath: browserLaunchPlan.launchPolicy.chromePath ?? undefined,
      chromeProfile: browserLaunchPlan.sourceBrowserProfile.name ?? undefined,
      chromeCookiePath: browserLaunchPlan.launchPolicy.chromeCookiePath ?? undefined,
      bootstrapCookiePath: browserLaunchPlan.launchPolicy.bootstrapCookiePath ?? undefined,
      display: browserLaunchPlan.launchPolicy.display ?? undefined,
      managedProfileRoot: browserLaunchPlan.managedBrowserProfile.root,
      manualLoginProfileDir: browserLaunchPlan.managedBrowserProfile.directory,
      cookieSync: browserLaunchPlan.launchPolicy.cookieSync,
    };
    const affinityUserConfig: ResolvedUserConfig = {
      ...affinityBaseConfig,
      browser: { ...affinityBaseConfig.browser, ...launchOptions },
    };

    const runtimeServiceConfig = readRuntimeServiceConfig(runtimeProfile, service);
    const globalServiceConfig = readGlobalServiceConfig(executionConfig, service);
    const boundIdentityKey = resolveConfiguredServiceAccountId(executionConfig, {
      serviceId: service,
      runtimeProfileId: runtimeSelection.runtimeProfileId,
    });
    const browserConfigRecord = isRecord(executionConfig.browser) ? executionConfig.browser : null;
    const runtimeBrowserConfig = runtimeProfile && isRecord(runtimeProfile.browser) ? runtimeProfile.browser : null;
    const browserProfileConfig = readBrowserProfileConfig(runtimeSelection.browserProfile);
    const runInitialInputs = isRecord(context.record.bundle.run.initialInputs)
      ? context.record.bundle.run.initialInputs
      : null;
    const requestAuracall = isRecord(runInitialInputs?.auracall)
      ? runInitialInputs.auracall
      : null;
    const libraryFiles = asLibraryFileSelectors(requestAuracall?.libraryFiles);
    const agentConfig = getAgent(executionConfig, context.step.agentId);
    const agentModel = asNonEmptyString(agentConfig?.model);
    const agentModelSelector = asNonEmptyString(agentConfig?.modelSelector);
    const chatgptSemanticSelection =
      service === 'chatgpt' && !agentModel
        ? resolveChatgptSemanticModelSelector(agentModelSelector)
        : null;
    if (service === 'chatgpt' && !agentModel && agentModelSelector && !chatgptSemanticSelection && isChatgptSemanticModelSelector(agentModelSelector)) {
      throw new Error(
        `Stored team step ${context.step.id} has unsupported ChatGPT modelSelector "${agentModelSelector}".`,
      );
    }

    const desiredModel =
      agentModel ??
      chatgptSemanticSelection?.desiredModel ??
      asNonEmptyString(runtimeServiceConfig?.model) ??
      asNonEmptyString(globalServiceConfig?.model) ??
      null;
    const thinkingTime =
      chatgptSemanticSelection?.thinkingTime ??
      asThinkingTimeLevel(agentConfig?.thinkingTime) ??
      asThinkingTimeLevel(runtimeServiceConfig?.thinkingTime) ??
      asThinkingTimeLevel(globalServiceConfig?.thinkingTime) ??
      asThinkingTimeLevel(runtimeBrowserConfig?.thinkingTime) ??
      asThinkingTimeLevel(browserProfileConfig?.thinkingTime) ??
      asThinkingTimeLevel(browserConfigRecord?.thinkingTime) ??
      null;
    const chatgptMode =
      asChatgptMode(requestAuracall?.chatgptMode) ??
      asChatgptMode(runtimeServiceConfig?.chatgptMode) ??
      asChatgptMode(globalServiceConfig?.chatgptMode) ??
      asChatgptMode(runtimeBrowserConfig?.chatgptMode) ??
      asChatgptMode(browserProfileConfig?.chatgptMode) ??
      asChatgptMode(browserConfigRecord?.chatgptMode) ??
      'chat';
    const chatgptToolApproval =
      asChatgptToolApproval(requestAuracall?.chatgptToolApproval) ??
      asChatgptToolApproval(runtimeServiceConfig?.chatgptToolApproval) ??
      asChatgptToolApproval(globalServiceConfig?.chatgptToolApproval) ??
      asChatgptToolApproval(runtimeBrowserConfig?.chatgptToolApproval) ??
      asChatgptToolApproval(browserProfileConfig?.chatgptToolApproval) ??
      asChatgptToolApproval(browserConfigRecord?.chatgptToolApproval) ??
      'manual';
    const workModel =
      asNonEmptyString(requestAuracall?.workModel) ??
      asNonEmptyString(runtimeServiceConfig?.workModel) ??
      asNonEmptyString(globalServiceConfig?.workModel) ??
      asNonEmptyString(runtimeBrowserConfig?.workModel) ??
      asNonEmptyString(browserProfileConfig?.workModel) ??
      asNonEmptyString(browserConfigRecord?.workModel) ??
      null;
    const composerTool =
      asNonEmptyString(requestAuracall?.composerTool) ??
      asNonEmptyString(runtimeServiceConfig?.composerTool) ??
      asNonEmptyString(globalServiceConfig?.composerTool) ??
      asNonEmptyString(runtimeBrowserConfig?.composerTool) ??
      asNonEmptyString(browserProfileConfig?.composerTool) ??
      asNonEmptyString(browserConfigRecord?.composerTool) ??
      null;
    const deepResearchPlanAction =
      asDeepResearchPlanAction(requestAuracall?.deepResearchPlanAction) ??
      asDeepResearchPlanAction(runtimeServiceConfig?.deepResearchPlanAction) ??
      asDeepResearchPlanAction(globalServiceConfig?.deepResearchPlanAction) ??
      asDeepResearchPlanAction(runtimeBrowserConfig?.deepResearchPlanAction) ??
      asDeepResearchPlanAction(browserProfileConfig?.deepResearchPlanAction) ??
      asDeepResearchPlanAction(browserConfigRecord?.deepResearchPlanAction) ??
      null;
    const projectId =
      asNonEmptyString(agentConfig?.projectId) ??
      asNonEmptyString(runtimeServiceConfig?.projectId) ??
      asNonEmptyString(globalServiceConfig?.projectId) ??
      null;
    const configuredServiceUrl =
      asNonEmptyString(runtimeServiceConfig?.url) ??
      asNonEmptyString(globalServiceConfig?.url) ??
      null;
    const targetUrl =
      service === 'chatgpt' && projectId
        ? resolveChatgptProjectUrl(projectId)
        : configuredServiceUrl;
    const manualLoginProfileDir = browserLaunchPlan.managedBrowserProfile.directory;
    const browserFamilyProfileName = browserLaunchPlan.selection.browserProfileId;
    const inlineCookies =
      service === 'gemini'
        ? await resolveConfiguredExecutorInlineCookies(manualLoginProfileDir)
        : null;
    const prompt = asNonEmptyString(context.step.input.prompt);
    if (!prompt) {
      throw new Error(`Stored team step ${context.step.id} has no runnable prompt text.`);
    }
    const useStepOutputContract = shouldUseAuraCallStepOutputContract(context.step.input.structuredData);
    const promptWithInstructions = buildBrowserPromptWithRequestInstructions(context, prompt, service);
    const effectivePrompt = useStepOutputContract
      ? prependAuraCallStepOutputContractPrompt(promptWithInstructions)
      : promptWithInstructions;
    const promptTransport = await prepareBrowserPromptTransport({
      context,
      prompt: effectivePrompt,
      attachments: buildBrowserAttachments(context),
    });
    const providerSessionAuthority = createProviderSessionAuthority(executionConfig);
    const providerSessionContext = {
      providerId: service,
      auracallRuntimeProfile: runtimeSelection.runtimeProfileId,
      browserProfile: runtimeSelection.browserProfileId,
      sourceBrowserProfile: browserLaunchPlan.sourceBrowserProfile.name,
      managedBrowserProfile: manualLoginProfileDir,
      browserProcessId: null,
      browserTargetId: null,
    };
    const providerSessionAuthorization: ProviderSessionAuthorization = {
      authority: providerSessionAuthority,
      context: providerSessionContext,
      expectation: providerSessionAuthority.resolveExpectation(providerSessionContext),
    };
    const liveBrowserServiceStateKey = {
      runId: context.record.runId,
      stepId: context.step.id,
    };
    const heartbeatRuntimeEvidence = async (
      evidence: Parameters<NonNullable<ExecuteStoredRunStepContext['runtimeEvidence']>['heartbeat']>[0],
    ): Promise<void> => {
      await context.runtimeEvidence?.heartbeat(evidence);
    };
    const buildBrowserRuntimeEvidenceDetails = (
      runtime: Pick<
        BrowserRuntimeMetadata,
        | 'chromeHost'
        | 'chromePort'
        | 'chromeTargetId'
        | 'tabUrl'
        | 'conversationId'
        | 'composerTool'
        | 'composerCapability'
      > | null,
    ): Record<string, unknown> => ({
      service,
      runtimeProfileId: runtimeSelection.runtimeProfileId,
      browserProfileId: runtimeSelection.browserProfileId,
      agentId: context.step.agentId,
      projectId,
      chromePort: runtime?.chromePort ?? null,
      chromeHost: runtime?.chromeHost ?? null,
      chromeTargetId: runtime?.chromeTargetId ?? null,
      tabUrl: runtime?.tabUrl ?? null,
      conversationId: runtime?.conversationId ?? null,
      composerTool: runtime?.composerTool ?? null,
      composerCapability: runtime?.composerCapability ?? null,
    });
    const recordBrowserRuntimeEvidence = async (evidence: BrowserRuntimeEvidence): Promise<void> => {
      const observation = evidence.observation;
      const runtime = evidence.runtime ?? null;
      recordLiveRuntimeRunServiceState({
        ...liveBrowserServiceStateKey,
        service,
        state: normalizeBrowserObservationStateForRuntime(observation.state),
        source: observation.source,
        evidenceRef: observation.evidenceRef ?? runtime?.tabUrl ?? runtime?.chromeTargetId ?? null,
        confidence: observation.confidence,
        observedAt: observation.observedAt,
      });
      await heartbeatRuntimeEvidence({
        observedAt: observation.observedAt,
        state: observation.state,
        source: observation.source,
        evidenceRef: observation.evidenceRef ?? null,
        confidence: observation.confidence,
        details: buildBrowserRuntimeEvidenceDetails(runtime),
      });
    };
    const startBrowserResponseFinalizationHeartbeat = (
      result: Pick<BrowserRunResult, 'chromeHost' | 'chromePort' | 'chromeTargetId' | 'tabUrl' | 'conversationId'>,
      evidenceRef: string,
    ): (() => Promise<void>) => {
      let stopped = false;
      let inFlight: Promise<void> = Promise.resolve();
      const emit = async (): Promise<void> => {
        if (stopped) return;
        const observedAt = new Date().toISOString();
        recordLiveRuntimeRunServiceState({
          ...liveBrowserServiceStateKey,
          service,
          state: 'response-complete',
          source: 'browser-service',
          evidenceRef,
          confidence: 'medium',
          observedAt,
        });
        await heartbeatRuntimeEvidence({
          observedAt,
          state: 'response-complete',
          source: 'browser-service',
          evidenceRef,
          confidence: 'medium',
          details: buildBrowserRuntimeEvidenceDetails(result),
        });
      };
      const schedule = (): Promise<void> => {
        inFlight = inFlight
          .catch(() => undefined)
          .then(emit)
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            deps.logger?.(`failed to persist browser response finalization heartbeat: ${message}`);
          });
        return inFlight;
      };
      const timer = setInterval(() => {
        void schedule();
      }, 5_000);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      void schedule();
      return async () => {
        stopped = true;
        clearInterval(timer);
        await inFlight.catch(() => undefined);
      };
    };
    const withBrowserResponseFinalizationHeartbeat = async <T>(
      result: Pick<BrowserRunResult, 'chromeHost' | 'chromePort' | 'chromeTargetId' | 'tabUrl' | 'conversationId'>,
      evidenceRef: string,
      action: () => Promise<T>,
    ): Promise<T> => {
      const stop = startBrowserResponseFinalizationHeartbeat(result, evidenceRef);
      try {
        return await action();
      } finally {
        await stop();
      }
    };

    const browserRunOptions: BrowserRunOptions = {
      prompt: promptTransport.prompt,
      attachments: promptTransport.attachments,
      ...(libraryFiles.length > 0 ? { libraryFiles } : {}),
      browserOperationOwnerCommand: `response-run:${context.record.runId}:${context.step.agentId}`,
      tabAffinityUserConfig:
        service === 'chatgpt' && affinityUserConfig.browser?.tabConcurrencyMode === 'tab-affinity'
          ? affinityUserConfig
          : undefined,
      config: {
        auracallProfileName: browserFamilyProfileName ?? runtimeSelection.runtimeProfileId,
        selectedAgentId: context.step.agentId,
        target: service,
        tabConcurrencyMode:
          service === 'chatgpt' ? affinityUserConfig.browser?.tabConcurrencyMode : undefined,
        projectId,
        conversationId: null,
        url: service === 'chatgpt' ? (targetUrl ?? undefined) : undefined,
        chatgptUrl: service === 'chatgpt' ? (targetUrl ?? undefined) : undefined,
        geminiUrl: service === 'gemini' ? (targetUrl ?? undefined) : undefined,
        grokUrl: service === 'grok' ? (targetUrl ?? undefined) : undefined,
        desiredModel,
        modelStrategy: desiredModel ? 'select' : 'ignore',
        keepBrowser:
          asBoolean(runtimeBrowserConfig?.keepBrowser) ??
          asBoolean(browserConfigRecord?.keepBrowser) ??
          false,
        hideWindow:
          asBoolean(runtimeBrowserConfig?.hideWindow) ??
          asBoolean(browserConfigRecord?.hideWindow) ??
          false,
        manualLogin: true,
        chatgptMode: service === 'chatgpt' ? chatgptMode : undefined,
        chatgptToolApproval: service === 'chatgpt' ? chatgptToolApproval : undefined,
        workModel: service === 'chatgpt' ? workModel : null,
        ...launchOptions,
        inlineCookies: inlineCookies?.cookies,
        inlineCookiesSource: inlineCookies?.source ?? null,
        allowCookieErrors: true,
        manualLoginWaitForSession: false,
        thinkingTime: thinkingTime ?? undefined,
        composerTool,
        deepResearchPlanAction: deepResearchPlanAction ?? undefined,
        providerSessionAuthorization,
      },
      runtimeHintCb: async (hint) => {
        await heartbeatRuntimeEvidence({
          observedAt: new Date().toISOString(),
          state: 'browser-runtime-hint',
          source: 'browser-service',
          evidenceRef: hint.tabUrl ?? hint.chromeTargetId ?? 'browser-runtime-hint',
          confidence: 'medium',
          details: {
            service,
            runtimeProfileId: runtimeSelection.runtimeProfileId,
            browserProfileId: runtimeSelection.browserProfileId,
            agentId: context.step.agentId,
            projectId,
            chromeTargetId: hint.chromeTargetId ?? null,
            tabUrl: hint.tabUrl ?? null,
            conversationId: hint.conversationId ?? null,
            composerTool: hint.composerTool ?? null,
            composerCapability: hint.composerCapability ?? null,
          },
        });
      },
      runtimeEvidenceCb: recordBrowserRuntimeEvidence,
      log: ((message?: unknown, ...optionalParams: unknown[]) => {
        const logger = deps.logger;
        if (!logger) return;
        const parts = [message, ...optionalParams]
          .filter((part) => part !== undefined)
          .map((part) => typeof part === 'string' ? part : safeJsonStringify(part));
        logger(parts.join(' '));
      }) as typeof console.log,
      verbose: false,
    };

    if (service === 'gemini' || service === 'grok') {
      recordLiveRuntimeRunServiceState({
        ...liveBrowserServiceStateKey,
        service,
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: service === 'grok' ? 'grok-prompt-submitted' : 'gemini-web-request-started',
        confidence: 'medium',
      });
    }

    const runBrowserStep = async (options: BrowserRunOptions): Promise<Awaited<ReturnType<typeof runBrowserMode>>> => {
      try {
        return service === 'gemini'
          ? await runGeminiBrowserModeImpl(options)
          : await runBrowserModeImpl(options);
      } finally {
        clearLiveRuntimeRunServiceState(liveBrowserServiceStateKey);
      }
    };
    const recoveredRuntimeEvidence =
      service === 'chatgpt' && hasRecoveredStrandedStepEvent(context)
        ? readLatestRuntimeEvidenceForStep(context, service)
        : null;
    const runOrResumeBrowserStep = async (): Promise<Awaited<ReturnType<typeof runBrowserMode>>> => {
      if (!recoveredRuntimeEvidence) {
        return runBrowserStep(browserRunOptions);
      }
      const recoveredRuntime = buildBrowserRuntimeMetadataFromEvidence({
        evidence: recoveredRuntimeEvidence,
        runtimeProfileId: runtimeSelection.runtimeProfileId ?? context.step.runtimeProfileId ?? 'default',
        browserProfileId: runtimeSelection.browserProfileId,
        manualLoginProfileDir,
        agentId: context.step.agentId,
      });
      try {
        deps.logger?.(
          `reattaching recovered ChatGPT browser-backed run ${context.record.runId} to existing tab ${recoveredRuntime.chromeTargetId ?? recoveredRuntime.tabUrl ?? '(unknown)'}`,
        );
        const heartbeatRecoveredRuntimeEvidence = async (
          state: BrowserRuntimeEvidence['observation']['state'],
          evidenceRef: string,
          confidence: BrowserRuntimeEvidence['observation']['confidence'],
        ): Promise<void> => {
          const observedAt = new Date().toISOString();
          recordLiveRuntimeRunServiceState({
            ...liveBrowserServiceStateKey,
            service,
            state: normalizeBrowserObservationStateForRuntime(state),
            source: 'browser-service',
            evidenceRef,
            confidence,
            observedAt,
          });
          await heartbeatRuntimeEvidence({
            observedAt,
            state,
            source: 'browser-service',
            evidenceRef,
            confidence,
            details: buildBrowserRuntimeEvidenceDetails(recoveredRuntime),
          });
        };
        const recordRecoveredRuntimeEvidence = (
          state: BrowserRuntimeEvidence['observation']['state'],
          evidenceRef: string,
          confidence: BrowserRuntimeEvidence['observation']['confidence'],
        ): void => {
          void heartbeatRecoveredRuntimeEvidence(state, evidenceRef, confidence).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            deps.logger?.(`failed to persist recovered ChatGPT runtime evidence: ${message}`);
          });
        };
        await heartbeatRecoveredRuntimeEvidence('thinking', 'chatgpt-reattach-existing-tab', 'medium');
        const reattached = await resumeBrowserSessionImpl(
          recoveredRuntime as Parameters<typeof resumeBrowserSession>[0],
          browserRunOptions.config as Parameters<typeof resumeBrowserSession>[1],
          browserRunOptions.log as Parameters<typeof resumeBrowserSession>[2],
          {
            promptPreview: promptTransport.prompt.slice(0, 2_000),
            waitForAssistantResponse: (Runtime, timeoutMs, logger, minTurn) =>
              waitForAssistantResponse(Runtime, timeoutMs, logger, minTurn, {
                onPassiveDomProbe: () => {
                  recordRecoveredRuntimeEvidence('thinking', 'chatgpt-passive-dom-probe', 'low');
                },
                onResponseIncoming: () => {
                  recordRecoveredRuntimeEvidence('response-incoming', 'chatgpt-assistant-snapshot', 'high');
                },
              }),
          },
        );
        return createBrowserRunResultFromReattach({
          result: reattached,
          runtime: recoveredRuntime,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Recovered ChatGPT browser-backed run ${context.record.runId} could not reattach to the submitted tab; refusing to replay the prompt: ${message}`,
        );
      } finally {
        clearLiveRuntimeRunServiceState(liveBrowserServiceStateKey);
      }
    };
    let browserResult = await runOrResumeBrowserStep();
    let responseArtifacts: TeamRunArtifactRef[] = [];
    let responseArtifactNotes: string[] = [];
    const structuredMetadata = context.step.input.structuredData?.metadata;
    const materializeBrowserResult = async (
      result: Awaited<ReturnType<typeof runBrowserMode>>,
    ): Promise<BrowserResponseArtifactMaterializerResult> => {
      return deps.browserResponseArtifactMaterializer
        ? await deps.browserResponseArtifactMaterializer({
            service,
            executionConfig,
            conversationId: result.conversationId ?? null,
            projectId,
            configuredUrl: targetUrl,
            tabUrl: result.tabUrl ?? null,
            tabTargetId: result.chromeTargetId ?? null,
            chromeHost: result.chromeHost ?? null,
            chromePort: result.chromePort ?? null,
          })
        : await materializeBrowserResponseArtifacts({
            service,
            executionConfig,
            conversationId: result.conversationId ?? null,
            projectId,
            configuredUrl: targetUrl,
            tabUrl: result.tabUrl ?? null,
            tabTargetId: result.chromeTargetId ?? null,
            chromeHost: result.chromeHost ?? null,
            chromePort: result.chromePort ?? null,
          });
    };
    if (shouldMaterializeBrowserResponseArtifacts(structuredMetadata)) {
      try {
        const materialized = await withBrowserResponseFinalizationHeartbeat(
          browserResult,
          'browser-response-artifact-finalizing',
          () => materializeBrowserResult(browserResult),
        );
        responseArtifacts = materialized.artifacts;
        responseArtifactNotes = materialized.notes;
      } catch (error) {
        responseArtifactNotes = [
          `browser response artifact materialization failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
      }
    }

    const responseText = browserResult.answerMarkdown.trim().length > 0
      ? browserResult.answerMarkdown
      : browserResult.answerText;
    if (!asNonEmptyString(responseText)) {
      throw new Error(`Browser-backed step ${context.step.id} completed without assistant output.`);
    }
    if (
      service === 'chatgpt' &&
      shouldMaterializeBrowserResponseArtifacts(structuredMetadata) &&
      !hasRequiredBrowserResponseArtifactMaterialized({
        metadata: structuredMetadata,
        artifacts: responseArtifacts,
      })
    ) {
      const correctionPrompt = buildRequiredArtifactCorrectionPrompt({
        metadata: structuredMetadata,
        previousAnswerText: responseText,
      });
      if (correctionPrompt && (browserResult.tabUrl || browserResult.conversationId)) {
        responseArtifactNotes = [
          ...responseArtifactNotes,
          'browser response artifact correction: retrying once in the same ChatGPT conversation',
        ];
        browserResult = await runBrowserStep({
          ...browserRunOptions,
          prompt: correctionPrompt,
          attachments: [],
          config: {
            ...(browserRunOptions.config ?? {}),
            conversationId: browserResult.conversationId ?? null,
            url: browserResult.tabUrl ?? browserRunOptions.config?.url,
            chatgptUrl: browserResult.tabUrl ?? browserRunOptions.config?.chatgptUrl,
          },
        });
        try {
          const materialized = await withBrowserResponseFinalizationHeartbeat(
            browserResult,
            'browser-response-artifact-finalizing',
            () => materializeBrowserResult(browserResult),
          );
          responseArtifacts = materialized.artifacts;
          responseArtifactNotes = [
            ...responseArtifactNotes,
            ...materialized.notes.map((note) => `after correction: ${note}`),
          ];
        } catch (error) {
          responseArtifactNotes = [
            ...responseArtifactNotes,
            `after correction: browser response artifact materialization failed: ${error instanceof Error ? error.message : String(error)}`,
          ];
        }
      }
    }
    const finalResponseText = browserResult.answerMarkdown.trim().length > 0
      ? browserResult.answerMarkdown
      : browserResult.answerText;
    assertRequiredBrowserResponseArtifactMaterialized({
      metadata: structuredMetadata,
      artifacts: responseArtifacts,
      notes: responseArtifactNotes,
      answerText: finalResponseText,
    });
    const contractResult = useStepOutputContract
      ? createStepOutputContractResult(parseAuraCallStepOutputEnvelope(finalResponseText))
      : null;
    if (contractResult) {
      return {
        output: {
          ...contractResult.output,
          artifacts: [
            ...(contractResult.output.artifacts ?? []),
            ...responseArtifacts,
          ],
          structuredData: {
            ...contractResult.output.structuredData,
            browserRun: {
              provider: service,
              service,
              conversationId: browserResult.conversationId ?? null,
              tabUrl: browserResult.tabUrl ?? null,
              chromeTargetId: browserResult.chromeTargetId ?? null,
              runtimeProfileId: runtimeSelection.runtimeProfileId,
              browserProfileId: runtimeSelection.browserProfileId,
              agentId: context.step.agentId,
              projectId,
              boundIdentityKey,
              configuredUrl: targetUrl,
              desiredModel,
              observedModel: browserResult.observedModel ?? null,
              modelSelector: agentModelSelector,
              thinkingTime,
              composerCapability: browserResult.composerCapability ?? null,
              promptTransport,
              cachePath: null,
              cachePathStatus: 'unavailable',
              cachePathReason: 'provider cache identity is not resolved during stored-step execution',
              passiveObservations: browserResult.passiveObservations ?? [],
              libraryFiles: browserResult.libraryFiles ?? null,
              chatgptDeepResearchStage: browserResult.chatgptDeepResearchStage ?? null,
              chatgptDeepResearchPlanAction: browserResult.chatgptDeepResearchPlanAction ?? null,
              chatgptDeepResearchStartMethod: browserResult.chatgptDeepResearchStartMethod ?? null,
              chatgptDeepResearchModifyPlanLabel: browserResult.chatgptDeepResearchModifyPlanLabel ?? null,
              chatgptDeepResearchModifyPlanVisible: browserResult.chatgptDeepResearchModifyPlanVisible ?? null,
              chatgptDeepResearchReviewEvidence: browserResult.chatgptDeepResearchReviewEvidence ?? null,
              answerChars: browserResult.answerChars,
              answerTokens: browserResult.answerTokens,
            },
          },
          notes: [
            ...(contractResult.output.notes ?? []),
            ...responseArtifactNotes,
            ...(browserResult.tabUrl ? [`browser conversation: ${browserResult.tabUrl}`] : []),
          ],
        },
        sharedState: {
          ...contractResult.sharedState,
          artifacts: [
            ...(contractResult.sharedState.artifacts ?? []),
            ...responseArtifacts,
          ],
          notes: [
            ...(contractResult.sharedState.notes ?? []),
            ...responseArtifactNotes,
          ],
        },
      };
    }
    const localActionRequests = parseConfiguredExecutorLocalActionRequests(finalResponseText);
    return {
      output: {
        summary: summarizeOutput(finalResponseText),
        artifacts: responseArtifacts,
        structuredData: {
          browserRun: {
            provider: service,
            service,
            conversationId: browserResult.conversationId ?? null,
            tabUrl: browserResult.tabUrl ?? null,
            chromeTargetId: browserResult.chromeTargetId ?? null,
            runtimeProfileId: runtimeSelection.runtimeProfileId,
            browserProfileId: runtimeSelection.browserProfileId,
            agentId: context.step.agentId,
            projectId,
            boundIdentityKey,
            configuredUrl: targetUrl,
            desiredModel,
            observedModel: browserResult.observedModel ?? null,
            modelSelector: agentModelSelector,
            thinkingTime,
            composerCapability: browserResult.composerCapability ?? null,
            promptTransport,
            cachePath: null,
            cachePathStatus: 'unavailable',
            cachePathReason: 'provider cache identity is not resolved during stored-step execution',
            passiveObservations: browserResult.passiveObservations ?? [],
            libraryFiles: browserResult.libraryFiles ?? null,
            chatgptDeepResearchStage: browserResult.chatgptDeepResearchStage ?? null,
            chatgptDeepResearchPlanAction: browserResult.chatgptDeepResearchPlanAction ?? null,
            chatgptDeepResearchStartMethod: browserResult.chatgptDeepResearchStartMethod ?? null,
            chatgptDeepResearchModifyPlanLabel: browserResult.chatgptDeepResearchModifyPlanLabel ?? null,
            chatgptDeepResearchModifyPlanVisible: browserResult.chatgptDeepResearchModifyPlanVisible ?? null,
            chatgptDeepResearchReviewEvidence: browserResult.chatgptDeepResearchReviewEvidence ?? null,
            answerChars: browserResult.answerChars,
            answerTokens: browserResult.answerTokens,
          },
          ...(localActionRequests.length > 0 ? { localActionRequests } : {}),
        },
        notes: [
          ...responseArtifactNotes,
          ...(browserResult.tabUrl ? [`browser conversation: ${browserResult.tabUrl}`] : []),
        ],
      },
      sharedState: {
        artifacts: responseArtifacts,
        notes: responseArtifactNotes,
        structuredOutputs: [
          {
            key: 'response.output',
            value: [createExecutionResponseMessage(finalResponseText)],
          },
        ],
      },
    };
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
