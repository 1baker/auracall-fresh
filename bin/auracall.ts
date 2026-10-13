#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import JSON5 from 'json5';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { Command, Option } from 'commander';
import type { OptionValues } from 'commander';
// Allow `npx auracall auracall-mcp` to resolve the MCP server even though npx runs the default binary.
if (process.argv[2] === 'auracall-mcp') {
  const { startMcpServer } = await import('../src/mcp/server.js');
  await startMcpServer();
  process.exit(0);
}
import { resolveEngine, type EngineMode, defaultWaitPreference } from '../src/cli/engine.js';
import { shouldRequirePrompt } from '../src/cli/promptRequirement.js';
import chalk from 'chalk';
import type {
  SessionMetadata,
  SessionMode,
  BrowserSessionConfig,
  BrowserContextMetadata,
} from '../src/sessionStore.js';
import { sessionStore, pruneOldSessions } from '../src/sessionStore.js';
import { DEFAULT_MODEL, MODEL_CONFIGS, runOracle, readFiles, estimateRequestTokens, buildRequestBody } from '../src/oracle.js';
import { isKnownModel } from '../src/oracle/modelResolver.js';
import type { ModelName, PreviewMode, RunOracleOptions } from '../src/oracle.js';
import { CHATGPT_URL, DEFAULT_MODEL_STRATEGY, normalizeChatgptUrl } from '../src/browserMode.js';
import { GROK_URL } from '../src/browser/constants.js';
import { runBrowserMode } from '../src/browser/index.js';
import { connectToChrome } from '../packages/browser-service/src/chromeLifecycle.js';
import { createRemoteBrowserExecutor } from '../src/remote/client.js';
import { createGeminiWebExecutor } from '../src/gemini-web/index.js';
import { applyHelpStyling } from '../src/cli/help.js';
import {
  collectPaths,
  collectModelList,
  parseFloatOption,
  parseBooleanOption,
  parseAssetAvailabilityOption,
  parseIntOption,
  parseSearchOption,
  usesDefaultStatusFilters,
  resolvePreviewMode,
  normalizeModelOption,
  normalizeBaseUrl,
  resolveApiModel,
  inferModelFromLabel,
  parseHeartbeatOption,
  parseTimeoutOption,
  mergePathLikeOptions,
  dedupePathInputs,
} from '../src/cli/options.js';
import { copyToClipboard } from '../src/cli/clipboard.js';
import { buildMarkdownBundle } from '../src/cli/markdownBundle.js';
import { shouldDetachSession } from '../src/cli/detach.js';
import { applyHiddenAliases } from '../src/cli/hiddenAliases.js';
import {
  ChatgptLibraryFilesCancelledError,
  runChatgptLibraryFilesCommandForCli,
} from '../src/cli/libraryFilesCommand.js';
import { buildBrowserConfig, resolveBrowserModelLabel } from '../src/cli/browserConfig.js';
import {
  defaultSetupVerificationPrompt,
  resolveBrowserSetupTarget,
  resolveSetupVerificationModel,
  createAuracallBrowserSetupContract,
} from '../src/cli/browserSetup.js';
import {
  buildBrowserWizardConfigPatch,
  discoverBrowserWizardChoices,
  formatBrowserWizardChoiceLabel,
  mergeWizardConfig,
  pickPreferredBrowserWizardChoiceIndex,
  suggestBrowserWizardProfileName,
  validateBrowserWizardProfileName,
  type BrowserWizardChoice,
} from '../src/cli/browserWizard.js';
import {
  buildConfigShowReport,
  buildConfigDoctorReport,
  buildProfileListReport,
  buildRuntimeProfileBridgeSummary,
  formatConfigDoctorReport,
  formatConfigShowReport,
  formatProfileListReport,
  formatRuntimeProfileBridgeSummary,
  resolveConfigDoctorExitCode,
} from '../src/cli/configCommand.js';
import {
  buildAgentDiagnosticsCliReport,
  formatAgentDiagnosticsCliReport,
  resolveAgentDiagnosticsExitCode,
} from '../src/cli/agentDiagnosticsCommand.js';
import {
  exportAgentSnapshotForCli,
  formatAgentSnapshotExportCliResult,
  formatAgentSnapshotImportCliResult,
  importAgentSnapshotForCli,
} from '../src/cli/agentSnapshotCommand.js';
import {
  executeConfiguredTeamRun,
  formatTeamRunCliExecutionPayload,
  formatTeamRunCliInspectionPayload,
  formatTeamRunCliReviewLedgerPayload,
  inspectConfiguredTeamRun,
  reviewConfiguredTeamRun,
  type TeamRunCliResponseFormat,
} from '../src/cli/teamRunCommand.js';
import {
  formatRuntimeRunInspectionPayload,
  inspectConfiguredRuntimeRun,
} from '../src/cli/runtimeInspectionCommand.js';
import {
  assertApiStatusBackpressure,
  assertApiStatusCompletionMetrics,
  assertApiStatusLiveFollowSeverity,
  assertApiStatusSchedulerPosture,
  formatApiStatusCliSummary,
  parseApiStatusAccountMirrorPosture,
  parseApiStatusBackpressureReason,
  parseApiStatusLiveFollowSeverity,
  readApiStatusForCli,
} from '../src/cli/apiStatusCommand.js';
import {
  assertApiOpsBrowserStatus,
  formatApiOpsBrowserStatusCliSummary,
  readApiOpsBrowserStatusForCli,
} from '../src/cli/apiOpsBrowserCommand.js';
import {
  formatApiLogTailCliSummary,
  readApiLogTailForCli,
} from '../src/cli/apiLogTailCommand.js';
import {
  formatApiSearchProjectionCliSummary,
  readApiSearchProjectionForCli,
} from '../src/cli/apiSearchCommand.js';
import {
  formatApiMirrorRecoveryCandidatesCliSummary,
  readApiMirrorRecoveryCandidatesForCli,
} from '../src/cli/apiMirrorRecoveryCommand.js';
import {
  attachApiRunArchiveEvidenceForCli,
  backfillApiRunArchiveForCli,
  cancelApiRunArchiveMaterializationJobForCli,
  createApiRunArchiveMaterializationJobForCli,
  formatApiRunArchiveAssetLookupCliSummary,
  formatApiRunArchiveBackfillCliSummary,
  formatApiRunArchiveCliSummary,
  formatApiRunArchiveEvidenceCliSummary,
  formatApiRunArchiveItemCliSummary,
  formatApiRunArchiveItemMaterializeCliSummary,
  formatApiRunArchiveMaterializationJobCliSummary,
  formatApiRunArchiveMaterializationJobsCliSummary,
  listApiRunArchiveMaterializationJobsForCli,
  lookupApiRunArchiveAssetForCli,
  materializeApiRunArchiveItemForCli,
  readApiRunArchiveMaterializationJobForCli,
  readApiRunArchiveForCli,
  readApiRunArchiveItemForCli,
} from '../src/cli/apiRunArchiveCommand.js';
import {
  formatApiSchedulerHistoryCliSummary,
  readApiSchedulerHistoryForCli,
} from '../src/cli/apiSchedulerHistoryCommand.js';
import {
  formatApiSchedulerDiagnosticsCliSummary,
  readApiSchedulerDiagnosticsForCli,
} from '../src/cli/apiSchedulerDiagnosticsCommand.js';
import {
  controlApiMirrorReconciliationForCli,
  controlApiMirrorCompletionForCli,
  formatApiMirrorCompletionListCliSummary,
  formatApiMirrorCompletionCliSummary,
  formatApiMirrorReconciliationListCliSummary,
  formatApiMirrorReconciliationCliSummary,
  listApiMirrorCompletionsForCli,
  listApiMirrorReconciliationsForCli,
  readApiMirrorCompletionForCli,
  readApiMirrorReconciliationForCli,
  startApiMirrorCompletionForCli,
  startApiMirrorReconciliationForCli,
} from '../src/cli/apiMirrorCompletionCommand.js';
import {
  cancelApiHistoryMaterializationJobForCli,
  createApiHistoryMaterializationJobForCli,
  formatApiHistoryMaterializationJobCliSummary,
  formatApiHistoryMaterializationJobsCliSummary,
  listApiHistoryMaterializationJobsForCli,
  readApiHistoryMaterializationJobForCli,
} from '../src/cli/apiHistoryMaterializationCommand.js';
import {
  approveHandoffSubmitForCli,
  approveHandoffUploadForCli,
  exportHandoffForCli,
  formatHandoffExportCliSummary,
  formatHandoffApproveSubmitCliSummary,
  formatHandoffApproveUploadCliSummary,
  formatHandoffPrepareCliSummary,
  formatHandoffRecoverLiveCliSummary,
  formatHandoffRepairCliSummary,
  formatHandoffResumeCliSummary,
  formatHandoffStatusCliSummary,
  formatHandoffSubmitCliSummary,
  formatHandoffUploadCliSummary,
  prepareHandoffForCli,
  readHandoffStatusForCli,
  recoverLiveHandoffForCli,
  repairHandoffForCli,
  resumeHandoffForCli,
  submitHandoffForCli,
  uploadHandoffForCli,
} from '../src/cli/handoffCommand.js';
import {
  clearApiMirrorProviderGuardForCli,
  formatApiMirrorProviderGuardClearCliSummary,
} from '../src/cli/apiMirrorProviderGuardCommand.js';
import {
  assertRunStatusForCli,
  formatRunStatusCli,
  readRunStatusForCli,
} from '../src/cli/runStatusCommand.js';
import {
  buildWorkbenchCapabilityReportForCli,
  formatWorkbenchCapabilityReport,
  normalizeWorkbenchCapabilityProvider,
} from '../src/cli/workbenchCapabilitiesCommand.js';
import {
  formatChatgptDeveloperAppOperationResult,
  runChatgptDeveloperAppOperationForCli,
  type ChatgptDeveloperAppAuth,
  type ChatgptDeveloperAppOperationInput,
} from '../src/cli/chatgptDeveloperAppsCommand.js';
import {
  formatChatgptSkillOperationResult,
  loadChatgptSkillSource,
  runChatgptSkillOperationForCli,
  type ChatgptSkillOperationInput,
} from '../src/cli/chatgptSkillsCommand.js';
import {
  buildProfileIdentitySmokeBatchReport,
  buildProfileIdentitySmokeReport,
  formatProfileIdentitySmokeBatchReport,
  formatProfileIdentitySmokeReport,
  resolveProfileIdentitySmokeBatchExitCode,
  resolveProfileIdentitySmokeExitCode,
  resolveProfileIdentitySmokeTargets,
} from '../src/cli/profileIdentitySmokeCommand.js';
import { exitAfterCompletedBrowserProbeCommand } from '../src/cli/completedBrowserCommandExit.js';
import {
  registerMediaGenerationCliCommand,
} from '../src/cli/mediaGenerationCommand.js';
import { createWorkbenchCapabilityService } from '../src/workbench/service.js';
import { createBrowserWorkbenchCapabilityDiscovery } from '../src/workbench/browserDiscovery.js';
import { createBrowserWorkbenchCapabilityDiagnostics } from '../src/workbench/browserDiagnostics.js';
import { performSessionRun, SessionRunCancelledError } from '../src/cli/sessionRunner.js';
import {
  buildTerminalSessionReceiptStatusPayload,
  formatTerminalSessionReceiptStatusPayload,
} from '../src/cli/terminalSessionReceiptCommand.js';
import { buildRootBrowserProviderSessionAuthorization } from '../src/cli/browserProviderSession.js';
import type { BrowserSessionRunnerDeps } from '../src/browser/sessionRunner.js';
import { isMediaFile } from '../src/browser/prompt.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../src/browser/providers/types.js';
import {
  normalizeProjectMemoryMode,
  type Conversation,
  type Project,
} from '../src/browser/providers/domain.js';
import { attachSession, showStatus, formatCompletionSummary } from '../src/cli/sessionDisplay.js';
import type { ShowStatusOptions } from '../src/cli/sessionDisplay.js';
import { formatCompactNumber } from '../src/cli/format.js';
import { formatIntroLine } from '../src/cli/tagline.js';
import { warnIfOversizeBundle } from '../src/cli/bundleWarnings.js';
import { formatRenderedMarkdown } from '../src/cli/renderOutput.js';
import { resolveRenderFlag, resolveRenderPlain } from '../src/cli/renderFlags.js';
import { resolveGeminiModelId } from '../src/oracle/gemini.js';
import {
  handleSessionCommand,
  buildSessionJsonEntry,
  buildSessionListJsonPayload,
  type StatusOptions,
  formatSessionCleanupMessage,
} from '../src/cli/sessionCommand.js';
import { isErrorLogged } from '../src/cli/errorUtils.js';
import { handleSessionAlias, handleStatusFlag } from '../src/cli/rootAlias.js';
import { resolveOutputPath } from '../src/cli/writeOutputPath.js';
import { getCliVersion } from '../src/version.js';
import { runDryRunSummary, runBrowserPreview } from '../src/cli/dryRun.js';
import { launchTui } from '../src/cli/tui/index.js';
import {
  resolveNotificationSettings,
  deriveNotificationSettingsFromMetadata,
  type NotificationSettings,
} from '../src/cli/notifier.js';
import { configPath, loadUserConfig, scaffoldDefaultConfigFile, type ResolvedUserConfig, type UserConfig } from '../src/config.js';
import { getPreferredRuntimeProfile, getRuntimeProfileBrowserProfileId } from '../src/config/model.js';
import { shouldBlockDuplicatePrompt } from '../src/cli/duplicatePromptGuard.js';
import os from 'node:os';
import path from 'node:path';
import { getAuracallHomeDir } from '../src/auracallHome.js';
import { BrowserAutomationClient } from '../src/browser/client.js';
import {
  diffBrowserFeaturesContracts,
  resolveBrowserFeaturesBaseline,
  writeBrowserFeaturesSnapshot,
} from '../src/browser/featureDiscovery.js';
import {
  DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS,
  LlmService,
  createLlmService,
} from '../src/browser/llmService/index.js';
import { resolveNonInteractiveBrowserContextIdentity } from '../src/browser/llmService/cache/browserContextIdentity.js';
import { resolveBrowserConfig } from '../src/browser/config.js';
import { resolveManagedProfileDirForUserConfig } from '../src/browser/profileStore.js';
import type { BrowserAttachment, BrowserLogger, BrowserRunOptions } from '../src/browser/types.js';
import {
  createFileBackedBrowserOperationDispatcher,
  formatBrowserOperationBusyResult,
  type BrowserOperationAcquiredResult,
} from '../packages/browser-service/src/service/operationDispatcher.js';

function collectTrimmedString(value: string, previous: string[] = []): string[] {
  const trimmed = value.trim();
  return trimmed.length > 0 ? [...previous, trimmed] : previous;
}
import type { ProviderCacheContext } from '../src/browser/providers/cache.js';
import { createCacheStore, type CacheStoreKind } from '../src/browser/llmService/cache/store.js';
import {
  searchCachedContextsByKeyword,
  searchCachedContextsSemantically,
} from '../src/browser/llmService/cache/search.js';
import {
  listCachedArtifacts,
  listCachedConversationInventory,
  listCachedFiles,
  listCachedSources,
  resolveCachedFiles,
} from '../src/browser/llmService/cache/catalog.js';
import {
  assertCacheIdentity,
  discoverCacheMaintenanceContexts,
  isCacheCliProvider,
  resolveCacheOperatorContext,
  resolveProviderConfiguredUrl,
  type CacheCliProvider,
} from '../src/browser/llmService/cache/operatorContext.js';
import {
  PROVIDER_CACHE_TTL_MS,
  resolveProviderCacheKey,
  readProjectCache,
  writeConversationCache,
  writeProjectCache,
} from '../src/browser/providers/cache.js';
import { resolveConfig } from '../src/schema/resolver.js';
import { materializeConfigV2, normalizeConfigV1toV2 } from '../src/config/migrate.js';
import { isPortOpen } from '../src/browser/processCheck.js';
import { resolveChatgptSemanticModelSelector } from '../src/config/modelSelector.js';

interface CliOptions extends OptionValues {
  prompt?: string;
  message?: string;
  profile?: string;
  agent?: string;
  team?: string;
  auracallProfile?: string;
  oracleProfile?: string;
  file?: string[];
  include?: string[];
  files?: string[];
  path?: string[];
  paths?: string[];
  render?: boolean;
  model: string;
  models?: string[];
  chatgpt?: boolean;
  gemini?: boolean;
  force?: boolean;
  slug?: string;
  filesReport?: boolean;
  maxInput?: number;
  maxOutput?: number;
  system?: string;
  silent?: boolean;
  search?: boolean;
  preview?: boolean | string;
  previewMode?: PreviewMode;
  apiKey?: string;
  session?: string;
  execSession?: string;
  notify?: boolean;
  notifySound?: boolean;
  json?: boolean;
  renderMarkdown?: boolean;
  sessionId?: string;
  engine?: EngineMode;
  browser?: boolean;
  timeout?: number | 'auto';
  browserChromeProfile?: string;
  browserChromePath?: string;
  browserCookiePath?: string;
  browserBootstrapCookiePath?: string;
  browserDisplay?: string;
  geminiUrl?: string;
  grokUrl?: string;
  chatgptUrl?: string;
  browserUrl?: string;
  browserBlockingProfile?: 'fail' | 'restart' | 'restart-managed' | 'restart-auracall';
  projectId?: string;
  projectName?: string;
  noProject?: boolean;
  project?: boolean;
  memoryMode?: string;
  conversationId?: string;
  conversationName?: string;
  browserTimeout?: string;
  browserInputTimeout?: string;
  browserCookieWait?: string;
  browserCookieSync?: boolean;
  browserNoCookieSync?: boolean;
  browserInlineCookiesFile?: string;
  browserCookieNames?: string;
  browserInlineCookies?: string;
  browserHeadless?: boolean;
  browserHideWindow?: boolean;
  browserKeepBrowser?: boolean;
  browserModelStrategy?: 'select' | 'current' | 'ignore';
  browserManualLogin?: boolean;
  browserManualLoginProfileDir?: string;
  browserWslChrome?: 'auto' | 'wsl' | 'windows';
  forceReseedManagedProfile?: boolean;
  browserTarget?: 'chatgpt' | 'gemini' | 'grok';
  browserThinkingTime?: 'light' | 'standard' | 'extended' | 'heavy';
  browserNoThinkingTime?: boolean;
  browserChatgptMode?: 'chat' | 'work';
  browserChatgptToolApproval?: 'manual' | 'allow-once' | 'always-allow';
  browserWorkModel?: string;
  browserComposerTool?: string;
  browserDeepResearchPlanAction?: 'start' | 'edit';
  browserAllowCookieErrors?: boolean;
  browserAttachments?: string;
  browserInlineFiles?: boolean;
  browserBundleFiles?: boolean;
  remoteChrome?: string;
  browserPort?: number;
  browserDebugPort?: number;
  remoteHost?: string;
  remoteToken?: string;
  copyMarkdown?: boolean;
  copy?: boolean;
  verbose?: boolean;
  debugHelp?: boolean;
  heartbeat?: number;
  status?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  noWait?: boolean;
  baseUrl?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  showModelId?: boolean;
  retainHours?: number;
  writeOutput?: string;
  writeOutputPath?: string;
  title?: string;
  objective?: string;
  promptAppend?: string;
  structuredContextJson?: string;
  responseFormat?: TeamRunCliResponseFormat;
  maxTurns?: number;
}

interface BrowserDoctorReportLike {
  target: 'chatgpt' | 'gemini' | 'grok';
  managedProfileDir: string;
  chromeProfile: string;
  managedProfileExists: boolean;
  managedCookiePath: string | null;
  chromeGoogleAccount: {
    source: 'local-state' | 'preferences' | 'merged';
    status: 'signed-in' | 'signed-out' | 'inconclusive';
    profileName: string | null;
    displayName: string | null;
    givenName: string | null;
    email: string | null;
    gaiaId: string | null;
    consentedPrimaryAccount: boolean;
    explicitBrowserSignin: boolean;
    activeAccounts: number;
  } | null;
  sourceCookiePath: string | null;
  sourceProfile: { userDataDir: string; profileName: string } | null;
  registryPath: string;
  registryEntries: Array<{
    profilePath: string;
    profileName: string;
    alive: boolean;
    managed: boolean;
    legacy: boolean;
    pid: number;
    port: number;
    host: string;
    services: string[];
  }>;
  staleRegistryEntries: Array<unknown>;
  legacyRegistryEntries: Array<unknown>;
  prunedRegistryEntries: number;
  managedRegistryEntry: {
    pid: number;
    port: number;
    host: string;
    alive: boolean;
  } | null;
  warnings: string[];
}

interface BrowserDoctorIdentityReportLike {
  target: 'chatgpt' | 'gemini' | 'grok';
  supported: boolean;
  attempted: boolean;
  identity: ProviderUserIdentity | null;
  error: string | null;
  reason: string | null;
}

interface BrowserDoctorIdentityReconciliationLike {
  ok: boolean;
  status: string;
  summary: string;
  chromeGoogleAccountIsInformational: boolean;
}

interface BrowserDoctorFeatureReportLike {
  target: 'chatgpt' | 'gemini' | 'grok';
  supported: boolean;
  attempted: boolean;
  featureSignature: string | null;
  detected: Record<string, unknown> | null;
  error: string | null;
  reason: string | null;
}

interface BrowserLoginLaunchOptions {
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  bootstrapCookiePath?: string;
  chatgptUrl: string;
  geminiUrl: string;
  grokUrl: string;
}

type SetupCommandOptions = Partial<Pick<
  CliOptions,
  | 'profile'
  | 'auracallProfile'
  | 'model'
  | 'verbose'
  | 'browserKeepBrowser'
  | 'browserChromePath'
  | 'browserChromeProfile'
  | 'browserCookiePath'
  | 'browserBootstrapCookiePath'
  | 'browserDisplay'
  | 'browserManualLoginProfileDir'
  | 'browserWslChrome'
  | 'chatgptUrl'
  | 'geminiUrl'
  | 'grokUrl'
  | 'forceReseedManagedProfile'
>> & {
  json?: boolean;
  target?: string;
  chatgpt?: boolean;
  gemini?: boolean;
  grok?: boolean;
  pruneBrowserState?: boolean;
  skipLogin?: boolean;
  skipVerify?: boolean;
  verifyPrompt?: string;
  exportCookies?: boolean;
};

type ResolvedCliOptions = Omit<CliOptions, 'model'> & {
  model: ModelName;
  models?: ModelName[];
  effectiveModelId?: string;
  writeOutputPath?: string;
};

const VERSION = getCliVersion();
const CLI_ENTRYPOINT = fileURLToPath(import.meta.url);
const rawCliArgs = process.argv.slice(2);
const userCliArgs = rawCliArgs[0] === CLI_ENTRYPOINT ? rawCliArgs.slice(1) : rawCliArgs;
const isTty = process.stdout.isTTY;
const suppressIntroBanner =
  userCliArgs.includes('--json-only') ||
  userCliArgs.includes('--silent') ||
  process.env.ORACLE_NO_BANNER === '1';
const DEFAULT_CACHE_HISTORY_LIMIT = 2000;
const DEFAULT_CACHE_CLEANUP_DAYS = 365;

const program = new Command();
program.enablePositionalOptions();
let introPrinted = false;
program.hook('preAction', () => {
  if (suppressIntroBanner) return;
  if (introPrinted) return;
  if (userCliArgs.includes('--json')) return;
  console.log(formatIntroLine(VERSION, { env: process.env, richTty: isTty }));
  introPrinted = true;
});
applyHelpStyling(program, VERSION, isTty);
program.hook('preAction', (thisCommand) => {
  if (thisCommand !== program) {
    return;
  }
  if (userCliArgs.some((arg) => arg === '--help' || arg === '-h')) {
    return;
  }
  if (userCliArgs.length === 0) {
    // Let the root action handle zero-arg entry (help + hint to `auracall tui`).
    return;
  }
  const opts = thisCommand.optsWithGlobals() as CliOptions;
  applyHiddenAliases(opts, (key, value) => thisCommand.setOptionValue(key, value));
  const positional = thisCommand.args?.[0] as string | undefined;
  if (!opts.prompt && positional) {
    opts.prompt = positional;
    thisCommand.setOptionValue('prompt', positional);
  }
  if (shouldRequirePrompt(userCliArgs, opts)) {
    console.log(chalk.yellow('Prompt is required. Provide it via --prompt "<text>" or positional [prompt].'));
    thisCommand.help({ error: false });
    process.exitCode = 1;
    return;
  }
});
program
  .name('auracall')
  .description('One-shot model orchestration tool for hard questions that benefit from large file context and server-side search.')
  .version(VERSION)
  .argument('[prompt]', 'Prompt text (shorthand for --prompt).')
  .option('-p, --prompt <text>', 'User prompt to send to the model.')
  .addOption(new Option('--message <text>', 'Alias for --prompt.').hideHelp())
  .option(
    '-f, --file <paths...>',
    'Files/directories or glob patterns to attach (prefix with !pattern to exclude). Files larger than 1 MB are rejected automatically.',
    collectPaths,
    [],
  )
  .addOption(
    new Option('--include <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--files <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--path <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option('--paths <paths...>', 'Alias for --file.')
      .argParser(collectPaths)
      .default([])
      .hideHelp(),
  )
  .addOption(
    new Option(
      '--copy-markdown',
      'Copy the assembled markdown bundle to the clipboard; pair with --render to print it too.',
    ).default(false),
  )
  .addOption(new Option('--copy').hideHelp().default(false))
  .option('-s, --slug <words>', 'Custom session slug (3-5 words).')
  .option(
    '-m, --model <model>',
    'Model to target (API default: openai:frontier, currently GPT-6 Astra). Browser ChatGPT runs support durable selectors such as chatgpt:fast, chatgpt:reasoning-high, and chatgpt:premium.',
    normalizeModelOption,
  )
  .addOption(
    new Option(
      '--models <models>',
      'Comma-separated API model list to query in parallel (e.g., "gpt-5.1-pro,gemini-3-pro").',
    )
      .argParser(collectModelList)
      .default([]),
  )
  .addOption(
    new Option(
      '--chatgpt',
      'Use ChatGPT browser automation (shorthand for --engine browser --model chatgpt:fast).',
    ),
  )
  .addOption(
    new Option(
      '--gemini',
      'Use Gemini web automation (shorthand for --engine browser --model gemini-3-pro).',
    ),
  )
  .addOption(
    new Option(
      '-e, --engine <mode>',
      'Execution engine (api | browser). Browser engine: GPT models automate ChatGPT; Gemini models use a cookie-based client for gemini.google.com. If omitted, Aura-Call picks api when OPENAI_API_KEY is set, otherwise browser.',
    ).choices(['api', 'browser'])
  )
  .addOption(
    new Option('--mode <mode>', 'Alias for --engine (api | browser).').choices(['api', 'browser']).hideHelp(),
  )
  .option('--profile <name>', 'Select which AuraCall runtime profile to use for this run.')
  .option(
    '--agent <name>',
    'Resolve this run through a reserved agent reference, inheriting its AuraCall runtime profile without enabling agent execution.',
  )
  .option(
    '--team <name>',
    'Resolve this command through a reserved team reference for inspection and planning only; this does not enable team execution.',
  )
  .addOption(new Option('--auracall-profile <name>', 'Alias for --profile.').hideHelp())
  .addOption(new Option('--oracle-profile <name>', 'Legacy alias for --profile.').hideHelp())
  .option('--files-report', 'Show token usage per attached file (also prints automatically when files exceed the token budget).', false)
  .option('-v, --verbose', 'Enable verbose logging for all operations.', false)
  .addOption(
    new Option('--[no-]notify', 'Desktop notification when a session finishes (default on unless CI/SSH).')
      .default(undefined),
  )
  .addOption(
    new Option('--[no-]notify-sound', 'Play a notification sound on completion (default off).').default(undefined),
  )
  .addOption(
    new Option(
      '--timeout <seconds|duration|auto>',
      'Overall run timeout; accepts seconds or units such as 90s, 60m, and 1h30m (auto = 60m for Pro API and browser runs, 120s for other API runs).',
    )
      .argParser(parseTimeoutOption)
      .default('auto'),
  )
  .addOption(
    new Option(
      '--preview [mode]',
      '(alias) Preview the request without calling the model (summary | json | full). Deprecated: use --dry-run instead.',
    )
      .hideHelp()
      .choices(['summary', 'json', 'full'])
      .preset('summary'),
  )
  .addOption(
    new Option('--dry-run [mode]', 'Preview without calling the model (summary | json | full).')
      .choices(['summary', 'json', 'full'])
      .preset('summary')
      .default(false),
  )
  .addOption(new Option('--exec-session <id>').hideHelp())
  .addOption(new Option('--session <id>').hideHelp())
  .addOption(new Option('--status', 'Show stored sessions (alias for `auracall status`).').default(false).hideHelp())
  .option(
    '--render-markdown',
    'Print the assembled markdown bundle for prompt + files and exit; pair with --copy to put it on the clipboard.',
    false,
  )
  .option('--render', 'Alias for --render-markdown.', false)
  .option('--render-plain', 'Render markdown without ANSI/highlighting (use plain text even in a TTY).', false)
  .option(
    '--write-output <path>',
    'Write only the final assistant message to this file (overwrites; multi-model appends .<model> before the extension).',
  )
  .option('--verbose-render', 'Show render/TTY diagnostics when replaying sessions.', false)
  .addOption(
    new Option('--search <mode>', 'Set server-side search behavior (on/off).')
      .argParser(parseSearchOption)
      .hideHelp(),
  )
  .addOption(
    new Option('--max-input <tokens>', 'Override the input token budget for the selected model.')
      .argParser(parseIntOption)
      .hideHelp(),
  )
  .addOption(
    new Option('--max-output <tokens>', 'Override the max output tokens for the selected model.')
      .argParser(parseIntOption)
      .hideHelp(),
  )
  .option(
    '--base-url <url>',
    'Override the OpenAI-compatible base URL for API runs (e.g. LiteLLM proxy endpoint).',
  )
  .option('--azure-endpoint <url>', 'Azure OpenAI Endpoint (e.g. https://resource.openai.azure.com/).')
  .option('--azure-deployment <name>', 'Azure OpenAI Deployment Name.')
  .option('--azure-api-version <version>', 'Azure OpenAI API Version.')
  .addOption(new Option('--browser', '(deprecated) Use --engine browser instead.').default(false).hideHelp())
  .addOption(new Option('--browser-chrome-profile <name>', 'Chrome profile name/path for cookie reuse.').hideHelp())
  .addOption(new Option('--browser-chrome-path <path>', 'Explicit Chrome or Chromium executable path.').hideHelp())
  .addOption(
    new Option('--browser-cookie-path <path>', 'Explicit Chrome/Chromium cookie DB path for session reuse.'),
  )
  .addOption(
    new Option(
      '--browser-bootstrap-cookie-path <path>',
      'Explicit source cookie DB path to seed Aura-Call managed browser profiles without changing the runtime browser.',
    ),
  )
  .addOption(
    new Option(
      '--browser-blocking-profile <mode>',
      'Handle a blocking Chrome profile (fail, restart, restart-managed).',
    ).choices(['fail', 'restart', 'restart-managed', 'restart-auracall']),
  )
  .addOption(
    new Option(
      '--gemini-url <url>',
      'Override the Gemini web URL for this run (e.g., https://gemini.google.com/gem/<id>).',
    ),
  )
  .addOption(new Option('--grok-url <url>', `Override the Grok web URL (e.g., ${GROK_URL}project/<id>).`))
  .addOption(new Option('--project-id <id>', 'Override the provider project scope for browser runs.').hideHelp())
  .addOption(new Option('--conversation-id <id>', 'Attach browser runs to a specific conversation.').hideHelp())
  .addOption(new Option('--project-name <name>', 'Resolve browser project by cached name.'))
  .addOption(new Option('--no-project', 'Ignore configured project defaults for this run.'))
  .addOption(
    new Option(
      '--conversation-name <name>',
      'Resolve browser conversation by cached title or selector (e.g., latest, latest-1).',
    ),
  )
  .addOption(
    new Option(
      '--chatgpt-url <url>',
      `Override the ChatGPT web URL (e.g., workspace/folder like https://chatgpt.com/g/.../project; default ${CHATGPT_URL}).`,
    ),
  )
  .addOption(new Option('--browser-url <url>', `Alias for --chatgpt-url (default ${CHATGPT_URL}).`).hideHelp())
  .addOption(new Option('--browser-timeout <ms|s|m>', 'Maximum time to wait for an answer (default 1200s / 20m).').hideHelp())
  .addOption(
    new Option('--browser-input-timeout <ms|s|m>', 'Maximum time to wait for the prompt textarea (default 30s).').hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-cookie-wait <ms|s|m>',
      'Wait before retrying cookie sync when Chrome cookies are empty or locked.',
    ).hideHelp(),
  )
  .addOption(
    new Option('--browser-target <chatgpt|gemini|grok>', 'Override the browser automation target.').choices([
      'chatgpt',
      'gemini',
      'grok',
    ]),
  )
  .addOption(
    new Option('--browser-port <port>', 'Use a fixed Chrome DevTools port (helpful on WSL firewalls).')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option('--browser-debug-port <port>', '(alias) Use a fixed Chrome DevTools port.').argParser(parseIntOption).hideHelp(),
  )
  .addOption(new Option('--browser-cookie-names <names>', 'Comma-separated cookie allowlist for sync.').hideHelp())
  .addOption(
    new Option('--browser-inline-cookies <jsonOrBase64>', 'Inline cookies payload (JSON array or base64-encoded JSON).').hideHelp(),
  )
  .addOption(
    new Option('--browser-inline-cookies-file <path>', 'Load inline cookies from file (JSON or base64 JSON).').hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-cookie-sync',
      'Copy cookies from a source browser profile (opt-in; token rotation may invalidate that source session).',
    ),
  )
  .addOption(new Option('--browser-no-cookie-sync', 'Skip copying cookies from Chrome.').hideHelp())
  .addOption(
    new Option(
      '--browser-manual-login',
      'Skip cookie copy; reuse a persistent automation profile and wait for manual ChatGPT login.',
    ).hideHelp(),
  )
  .addOption(new Option('--browser-headless', 'Launch Chrome in headless mode.').hideHelp())
  .addOption(new Option('--browser-hide-window', 'Hide the Chrome window after launch (macOS headful only).').hideHelp())
  .addOption(new Option('--browser-keep-browser', 'Keep Chrome running after completion.').hideHelp())
  .option(
    '--browser-model-strategy <strategy>',
    'Strategy for selecting the model in the browser (select | current | ignore).',
    DEFAULT_MODEL_STRATEGY,
  )
  .addOption(
    new Option(
      '--browser-model-label <label>',
      'Fuzzy label for selecting a model from the browser UI picker (ChatGPT/Grok). Defaults to the --model label.',
    ).hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-chatgpt-mode <mode>',
      'Select ChatGPT composer mode. Defaults to Chat; Work must be requested explicitly.',
    ).choices(['chat', 'work']),
  )
  .addOption(
    new Option(
      '--browser-chatgpt-tool-approval <policy>',
      'Handle ChatGPT third-party tool approvals (manual | allow-once | always-allow).',
    ).choices(['manual', 'allow-once', 'always-allow']),
  )
  .addOption(
    new Option(
      '--browser-work-model <label>',
      'Select a model through the dedicated ChatGPT Work picker (only with --browser-chatgpt-mode work).',
    ),
  )
  .addOption(
    new Option(
      '--browser-thinking-time <level>',
      "ChatGPT 'thinking' time level (standard | extended; light/heavy kept as legacy aliases).",
    ).hideHelp(),
  )
  .option(
    '--browser-no-thinking-time',
    'Omit inherited ChatGPT thinking-time selection for this browser run.',
  )
  .addOption(
    new Option(
      '--browser-composer-tool <tool>',
      'Select a ChatGPT composer add-on/tool by durable ID (for example chatgpt.commerce.shopping or chatgpt.search.web_search; legacy labels remain aliases).',
    ).hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-deep-research-plan-action <action>',
      'ChatGPT Deep Research plan action: start accepts the provider plan; edit opens the plan editor before timed auto-start.',
    )
      .choices(['start', 'edit'])
      .hideHelp(),
  )
  .addOption(
    new Option('--browser-allow-cookie-errors', 'Continue even if Chrome cookies cannot be copied.').hideHelp(),
  )
  .addOption(
    new Option(
      '--browser-attachments <mode>',
      'How to deliver --file inputs in browser mode: auto (default) pastes inline up to ~60k chars then uploads; never always paste inline; always always upload.',
    )
      .choices(['auto', 'never', 'always'])
      .default('auto'),
  )
  .addOption(
    new Option(
      '--remote-chrome <host:port>',
      'Connect to remote Chrome DevTools Protocol (e.g., 192.168.1.10:9222 or [2001:db8::1]:9222 for IPv6).',
    ),
  )
  .addOption(new Option('--remote-host <host:port>', 'Delegate browser runs to a remote `auracall serve` instance.'))
  .addOption(new Option('--remote-token <token>', 'Access token for the remote `auracall serve` instance.'))
  .addOption(
    new Option('--browser-inline-files', 'Alias for --browser-attachments never (force pasting file contents inline).').default(false),
  )
  .addOption(new Option('--browser-bundle-files', 'Bundle all attachments into a single archive before uploading.').default(false))
  .addOption(
    new Option(
      '--youtube <url>',
      'YouTube video URL to analyze (Gemini web/cookie mode only; uses your signed-in Chrome cookies for gemini.google.com).',
    ),
  )
  .addOption(
    new Option(
      '--generate-image <file>',
      'Generate image and save to file (Gemini web/cookie mode only; requires gemini.google.com Chrome cookies).',
    ),
  )
  .addOption(new Option('--edit-image <file>', 'Edit existing image (use with --output, Gemini web/cookie mode only).'))
  .addOption(new Option('--output <file>', 'Output file path for image operations (Gemini web/cookie mode only).'))
  .addOption(
    new Option(
      '--aspect <ratio>',
      'Aspect ratio for image generation: 16:9, 1:1, 4:3, 3:4 (Gemini web/cookie mode only).',
    ),
  )
  .addOption(new Option('--gemini-show-thoughts', 'Display Gemini thinking process (Gemini web/cookie mode only).').default(false))
  .option(
    '--retain-hours <hours>',
    'Prune stored sessions older than this many hours before running (set 0 to disable).',
    parseFloatOption,
  )
  .option('--force', 'Force start a new session even if an identical prompt is already running.', false)
  .option('--debug-help', 'Show the advanced/debug option set and exit.', false)
  .option('--heartbeat <seconds>', 'Emit periodic in-progress updates (0 to disable).', parseHeartbeatOption, 30)
  .addOption(new Option('--wait').default(undefined))
  .addOption(new Option('--no-wait').default(undefined).hideHelp())
  .showHelpAfterError('(use --help for usage)');

async function resolveProjectIdArg(
  llmService: LlmService,
  projectArg: string,
  listOptions?: BrowserProviderListOptions,
): Promise<string> {
  const trimmed = projectArg.trim();
  if (trimmed.length === 0) {
    throw new Error('Project identifier is required.');
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  return await llmService.resolveProjectIdByName(trimmed, { listOptions, allowAutoRefresh: true });
}

async function resolveBrowserAttachmentsFromPaths(filePaths: string[], cwd: string): Promise<BrowserAttachment[]> {
  return Promise.all(
    filePaths.map(async (rawPath) => {
      const resolvedPath = path.resolve(cwd, rawPath);
      const stats = await fs.stat(resolvedPath);
      return {
        path: resolvedPath,
        displayPath: path.relative(cwd, resolvedPath) || path.basename(resolvedPath),
        sizeBytes: stats.size,
      };
    }),
  );
}

function createCliBrowserLogger(verbose: boolean): BrowserLogger {
  const logger = ((message: string) => {
    if (verbose) {
      console.log(chalk.dim(`[browser] ${message}`));
    }
  }) as BrowserLogger;
  logger.verbose = verbose;
  return logger;
}

async function closeBrowserEndpoint(
  port: number | null | undefined,
  host: string | null | undefined,
  logger: BrowserLogger,
): Promise<void> {
  if (!port) {
    return;
  }
  let client: Awaited<ReturnType<typeof connectToChrome>> | null = null;
  try {
    client = await connectToChrome(port, logger, host ?? undefined);
    await client.Browser.close().catch(() => undefined);
  } catch {
    // Best effort only. The browser may already be gone.
  } finally {
    await client?.close().catch(() => undefined);
  }
}

type CliBrowserRunSummary = {
  conversationId?: string;
  answerMarkdown: string;
  chromePort?: number;
  chromeHost?: string;
  chromeTargetId?: string;
  tabUrl?: string;
};

async function runCliBrowserMode(options: BrowserRunOptions): Promise<CliBrowserRunSummary> {
  return await new Promise<CliBrowserRunSummary>((resolve, reject) => {
    const run = runBrowserMode as unknown as (options: BrowserRunOptions) => Promise<CliBrowserRunSummary>;
    void run(options)
      .then((result) =>
        resolve({
          conversationId: result.conversationId,
          answerMarkdown: result.answerMarkdown,
          chromePort: result.chromePort,
          chromeHost: result.chromeHost,
          chromeTargetId: result.chromeTargetId,
          tabUrl: result.tabUrl,
        }),
      )
      .catch(reject);
  });
}

program.addHelpText(
  'after',
  `
Examples:
  # Quick API run with two files
  auracall --prompt "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

  # Browser run (no API key) + globbed TypeScript sources, excluding tests
  auracall --engine browser --prompt "Review the TS data layer" \\
    --file "src/**/*.ts" --file "!src/**/*.test.ts"

  # Build, print, and copy a markdown bundle (semi-manual)
  auracall --render --copy -p "Review the TS data layer" --file "src/**/*.ts" --file "!src/**/*.test.ts"
`,
);

program
  .command('serve')
  .description('Run Aura-Call browser automation as a remote service for other machines.')
  .option('--host <address>', 'Interface to bind (default 0.0.0.0).')
  .option('--port <number>', 'Port to listen on (default random).', parseIntOption)
  .option('--token <value>', 'Access token clients must provide (random if omitted).')
  .action(async (commandOptions) => {
    const { serveRemote } = await import('../src/remote/server.js');
    await serveRemote({
      host: commandOptions.host,
      port: commandOptions.port,
      token: commandOptions.token,
    });
  });

const apiCommand = program
  .command('api')
  .description('Run bounded local AuraCall API surfaces for development.');

apiCommand
  .command('serve')
  .description('Run the bounded local OpenAI-compatible responses adapter.')
  .option('--host <address>', 'Interface to bind (default 127.0.0.1; non-loopback remains unauthenticated).')
  .option('--port <number>', 'Port to listen on (default random).', parseIntOption)
  .option('--listen-public', 'Allow binding the unauthenticated development server to a non-loopback interface.')
  .option(
    '--no-recover-runs-on-start',
    'Disable startup recovery of persisted runs before serving readback (defaults to enabled).',
  )
  .option(
    '--recover-runs-on-start-max <count>',
    'Max persisted runs to recover on startup (for the selected recovery source).',
    parseIntOption,
    100,
  )
  .option(
    '--recover-runs-on-start-source <direct|team-run|all>',
    'Startup recovery source kind (direct, team-run, all).',
    (value) => {
      if (value === 'direct' || value === 'team-run' || value === 'all') {
        return value;
      }
      throw new Error('Invalid --recover-runs-on-start-source value. Use direct, team-run, or all.');
    },
    'direct',
  )
  .option(
    '--background-drain-interval-ms <ms>',
    'Background runtime drain cadence in milliseconds; 0 disables timer-driven drain. Default is 60000.',
    parseIntOption,
  )
  .option(
    '--account-mirror-scheduler-interval-ms <ms>',
    'Enable lazy account mirror scheduler passes at this interval. Defaults disabled.',
    parseIntOption,
  )
  .option(
    '--account-mirror-scheduler-execute',
    'Let lazy account mirror scheduler passes execute eligible refreshes. Default is dry-run.',
  )
  .option(
    '--no-account-mirror-completions-on-start',
    'Do not resume persisted account-mirror completions or reconcile configured live-follow targets at API startup; set scheduler/drain intervals to 0 separately for isolated proof servers.',
  )
  .option(
    '--account-mirror-proof-provider <provider>',
    'Start API serve in scoped account-mirror proof mode for one provider; startup completion resume, live-follow reconciliation, scheduler, and background drain are suppressed.',
  )
  .option(
    '--account-mirror-proof-runtime-profile <profile>',
    'Runtime profile for --account-mirror-proof-provider scoped proof mode.',
  )
  .action(async (commandOptions) => {
    const { serveResponsesHttp } = await import('../src/http/responsesServer.js');
    const parentOptions = program.opts?.() ?? {};
    const accountMirrorProofProvider = normalizeApiServeProofProvider(commandOptions.accountMirrorProofProvider);
    const accountMirrorProofRuntimeProfile = typeof commandOptions.accountMirrorProofRuntimeProfile === 'string'
      ? commandOptions.accountMirrorProofRuntimeProfile.trim()
      : '';
    const accountMirrorProofScope = accountMirrorProofProvider || accountMirrorProofRuntimeProfile
      ? {
          provider: accountMirrorProofProvider,
          runtimeProfileId: accountMirrorProofRuntimeProfile || null,
        }
      : null;
    const accountMirrorCompletionsOnStart = accountMirrorProofScope
      ? false
      : commandOptions.accountMirrorCompletionsOnStart !== false;
    await serveResponsesHttp({
      host: commandOptions.host,
      port: commandOptions.port,
      cliOptions: { ...parentOptions, ...commandOptions },
      listenPublic: Boolean(commandOptions.listenPublic),
      recoverRunsOnStart: Boolean(commandOptions.recoverRunsOnStart),
      recoverRunsOnStartMaxRuns: commandOptions.recoverRunsOnStartMax,
      recoverRunsOnStartSourceKind: commandOptions.recoverRunsOnStartSource,
      backgroundDrainIntervalMs: accountMirrorProofScope ? 0 : commandOptions.backgroundDrainIntervalMs,
      accountMirrorSchedulerIntervalMs: accountMirrorProofScope ? 0 : commandOptions.accountMirrorSchedulerIntervalMs,
      accountMirrorSchedulerDryRun: commandOptions.accountMirrorSchedulerExecute === undefined
        ? undefined
        : !commandOptions.accountMirrorSchedulerExecute,
      resumeAccountMirrorCompletionsOnStart: accountMirrorCompletionsOnStart,
      reconcileAccountMirrorLiveFollowOnStart: accountMirrorCompletionsOnStart,
      accountMirrorProofScope,
    });
  });

apiCommand
  .command('status')
  .description('Read the local AuraCall API /status summary.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option(
    '--expect-account-mirror-backpressure <reason>',
    'Fail unless accountMirrorScheduler.lastPass.backpressure.reason matches.',
    parseApiStatusBackpressureReason,
  )
  .option(
    '--expect-account-mirror-posture <posture>',
    'Fail unless accountMirrorScheduler.operatorStatus.posture matches.',
    parseApiStatusAccountMirrorPosture,
  )
  .option(
    '--expect-live-follow-severity <severity>',
    'Fail unless liveFollow.severity matches.',
    parseApiStatusLiveFollowSeverity,
  )
  .option(
    '--expect-completion-paused <count>',
    'Fail unless accountMirrorCompletions.metrics.paused matches.',
    parseIntOption,
  )
  .option(
    '--expect-completion-cancelled <count>',
    'Fail unless accountMirrorCompletions.metrics.cancelled matches.',
    parseIntOption,
  )
  .option(
    '--expect-completion-failed <count>',
    'Fail unless accountMirrorCompletions.metrics.failed matches.',
    parseIntOption,
  )
  .option(
    '--expect-completion-active <count>',
    'Fail unless accountMirrorCompletions.metrics.active matches.',
    parseIntOption,
  )
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await readApiStatusForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    assertApiStatusBackpressure(summary, {
      expectedReason: commandOptions.expectAccountMirrorBackpressure,
    });
    assertApiStatusSchedulerPosture(summary, {
      expectedPosture: commandOptions.expectAccountMirrorPosture,
    });
    assertApiStatusLiveFollowSeverity(summary, {
      expectedSeverity: commandOptions.expectLiveFollowSeverity,
    });
    assertApiStatusCompletionMetrics(summary, {
      expectedPaused: commandOptions.expectCompletionPaused,
      expectedCancelled: commandOptions.expectCompletionCancelled,
      expectedFailed: commandOptions.expectCompletionFailed,
      expectedActive: commandOptions.expectCompletionActive,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(formatApiStatusCliSummary(summary));
  });

apiCommand
  .command('ops-browser-status')
  .description('Read /ops/browser and assert its dashboard/status control contract.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--dashboard-url <url>', 'Canonical operator dashboard URL to report (defaults to api.dashboardUrl).')
  .option(
    '--expect-live-follow-severity <severity>',
    'Fail unless linked /status liveFollow.severity matches.',
    parseApiStatusLiveFollowSeverity,
  )
  .option(
    '--expect-completion-paused <count>',
    'Fail unless linked /status accountMirrorCompletions.metrics.paused matches.',
    parseIntOption,
  )
  .option(
    '--expect-completion-active <count>',
    'Fail unless linked /status accountMirrorCompletions.metrics.active matches.',
    parseIntOption,
  )
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await readApiOpsBrowserStatusForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      dashboardUrl: commandOptions.dashboardUrl ?? apiConfig.dashboardUrl,
    });
    assertApiOpsBrowserStatus(summary, {
      expectedSeverity: commandOptions.expectLiveFollowSeverity,
      expectedPaused: commandOptions.expectCompletionPaused,
      expectedActive: commandOptions.expectCompletionActive,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(formatApiOpsBrowserStatusCliSummary(summary));
  });

apiCommand
  .command('logs-tail')
  .description('Read the bounded local AuraCall API service log tail.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--max-bytes <bytes>', 'Maximum log bytes to return, clamped to 262144.', parseIntOption, 32768)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await readApiLogTailForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      maxBytes: commandOptions.maxBytes,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(formatApiLogTailCliSummary(summary));
  });

apiCommand
  .command('search')
  .description('Read the unified operator search projection from the local API.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--query <text>', 'Text search across normalized search rows.')
  .option('--provider <provider>', 'Filter by provider.')
  .option('--runtime-profile <profile>', 'Filter by runtime profile.')
  .option('--tenant <tenant>', 'Filter by bound tenant identity.')
  .option('--kind <kind>', 'Filter kind: conversation, artifact, upload, run, evidence.')
  .option('--status <status>', 'Filter by status.')
  .option('--file-available <true|false>', 'Filter by local file availability.', parseBooleanOption)
  .option('--asset-availability <state>', 'Filter cache state: available, unavailable, pending.', parseAssetAvailabilityOption)
  .option('--materialization <status>', 'Filter materialization: queued, running, succeeded, skipped, failed, cancelled, active, terminal.')
  .option('--limit <count>', 'Maximum rows to read.', parseIntOption, 80)
  .option('--cursor <cursor>', 'Opaque cursor from a previous /v1/search page.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiSearchProjectionForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      query: commandOptions.query,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      tenant: commandOptions.tenant,
      kind: commandOptions.kind,
      status: commandOptions.status,
      fileAvailable: commandOptions.fileAvailable,
      assetAvailability: commandOptions.assetAvailability,
      materialization: commandOptions.materialization,
      limit: commandOptions.limit,
      cursor: commandOptions.cursor,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiSearchProjectionCliSummary(result));
  });

apiCommand
  .command('mirror-recovery-candidates')
  .description('Read bounded account mirror artifact recovery candidates from the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--provider <provider>', 'Filter by provider.')
  .option('--runtime-profile <profile>', 'Filter by runtime profile.')
  .option('--tenant <tenant>', 'Filter by bound tenant identity.')
  .option('--status <status>', 'Filter by eligible, needs_detail_refresh, deferred, blocked, unsupported, or terminal.')
  .option('--action <action>', 'Filter by queue_history_materialization, refresh_detail_inventory, start_materialization_policy_completion, inspect_archive_materialization, or none.')
  .option('--include-search-rows <true|false>', 'Include unavailable artifact rows from the search projection.', parseBooleanOption)
  .option('--limit <count>', 'Maximum candidate rows to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiMirrorRecoveryCandidatesForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      tenant: commandOptions.tenant,
      status: commandOptions.status,
      action: commandOptions.action,
      includeSearchRows: commandOptions.includeSearchRows,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiMirrorRecoveryCandidatesCliSummary(result));
  });

apiCommand
  .command('archive')
  .description('Search cached AuraCall-created runs, uploads, artifacts, and provider conversation refs.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--kind <kind>', 'Filter kind: response, response_batch, team_run, media_generation, upload, generated_artifact, provider_conversation, evidence.')
  .option('--provider <provider>', 'Filter by provider.')
  .option('--runtime-profile <profile>', 'Filter by runtime profile.')
  .option('--project-id <id>', 'Filter by provider project id.')
  .option('--agent <agent>', 'Filter by agent id.')
  .option('--team <team>', 'Filter by team id.')
  .option('--response-id <id>', 'Filter by response id.')
  .option('--batch-id <id>', 'Filter by response batch id.')
  .option('--status <status>', 'Filter by status.')
  .option('--file-available <true|false>', 'Filter by local file availability.', parseBooleanOption)
  .option('--asset-availability <state>', 'Filter cache state: available, unavailable, pending.', parseAssetAvailabilityOption)
  .option('--query <text>', 'Text search across archive metadata.')
  .option('--limit <count>', 'Maximum items to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiRunArchiveForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      kind: commandOptions.kind,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      projectId: commandOptions.projectId,
      agent: commandOptions.agent,
      team: commandOptions.team,
      responseId: commandOptions.responseId,
      batchId: commandOptions.batchId,
      status: commandOptions.status,
      fileAvailable: commandOptions.fileAvailable,
      assetAvailability: commandOptions.assetAvailability,
      query: commandOptions.query,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveCliSummary(result));
  });

apiCommand
  .command('archive-item')
  .description('Read one cached AuraCall run archive item by stable archive id.')
  .argument('<id>', 'Run archive item id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiRunArchiveItemForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveItemCliSummary(result));
  });

apiCommand
  .command('archive-materialize')
  .description('Ask the provider runtime to materialize one missing generated artifact archive item.')
  .argument('<id>', 'Run archive item id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 60000)
  .option('--force', 'Refresh from the provider even when the archive item already has a readable local asset.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await materializeApiRunArchiveItemForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      force: commandOptions.force,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveItemMaterializeCliSummary(result));
  });

apiCommand
  .command('archive-materialization-create')
  .description('Queue a durable provider-backed archive materialization job for one generated artifact archive item.')
  .argument('<id>', 'Run archive item id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 10000)
  .option('--force', 'Refresh from the provider even when the archive item already has a readable local asset.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await createApiRunArchiveMaterializationJobForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      force: commandOptions.force,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveMaterializationJobCliSummary(result));
  });

apiCommand
  .command('archive-materialization-status')
  .description('Read a durable archive materialization job.')
  .argument('<id>', 'Archive materialization job id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiRunArchiveMaterializationJobForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveMaterializationJobCliSummary(result));
  });

apiCommand
  .command('archive-materialization-cancel')
  .description('Cancel a queued archive materialization job before provider work starts.')
  .argument('<id>', 'Archive materialization job id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await cancelApiRunArchiveMaterializationJobForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveMaterializationJobCliSummary(result));
  });

apiCommand
  .command('archive-materialization-jobs')
  .description('List durable archive materialization jobs.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--status <status>', 'Filter by queued, running, succeeded, skipped, failed, active, or terminal.')
  .option('--archive-item-id <id>', 'Filter by run archive item id.')
  .option('--limit <count>', 'Maximum jobs to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await listApiRunArchiveMaterializationJobsForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      status: commandOptions.status,
      archiveItemId: commandOptions.archiveItemId,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveMaterializationJobsCliSummary(result));
  });

apiCommand
  .command('archive-asset-lookup')
  .description('Resolve cached archive files by checksum, cache key, provider artifact id, or artifact id.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--checksum-sha256 <sha256>', 'Find archive assets by SHA-256 checksum.')
  .option('--cache-key <key>', 'Find archive assets by cache key, such as sha256:<hash>.')
  .option('--provider-artifact-id <id>', 'Find archive assets by provider artifact/file id.')
  .option('--artifact-id <id>', 'Find archive assets by AuraCall artifact id.')
  .option('--limit <count>', 'Maximum items to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await lookupApiRunArchiveAssetForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      checksumSha256: commandOptions.checksumSha256,
      cacheKey: commandOptions.cacheKey,
      providerArtifactId: commandOptions.providerArtifactId,
      artifactId: commandOptions.artifactId,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveAssetLookupCliSummary(result));
  });

apiCommand
  .command('archive-backfill')
  .description('Rebuild the cached AuraCall run archive index from runtime records.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 15000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await backfillApiRunArchiveForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveBackfillCliSummary(result));
  });

apiCommand
  .command('archive-evidence')
  .description('Attach caller-owned validation/review evidence to the run archive.')
  .option('--host <address>', 'Local API host to query (default 127.0.0.1).', '127.0.0.1')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 5000)
  .option('--payload-json <json>', 'Evidence payload JSON.')
  .option('--payload-file <path>', 'Evidence payload JSON file.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const payload = await readArchiveEvidencePayloadForCli(commandOptions);
    const result = await attachApiRunArchiveEvidenceForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      payload,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiRunArchiveEvidenceCliSummary(result));
  });

apiCommand
  .command('history-materialization-create')
  .description('Queue a durable account-history-backed materialization job.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 10000)
  .option('--provider <provider>', 'Provider for direct conversation or filtered reconciliation.')
  .option('--runtime-profile <profile>', 'AuraCall runtime profile for provider work.')
  .option('--browser-profile <profile>', 'Browser profile metadata to preserve on archive rows.')
  .option('--bound-identity-key <key>', 'Bound provider identity key to preserve/filter.')
  .option('--conversation-id <id>', 'Materialize one provider conversation id.')
  .option('--conversation-ids <ids>', 'Selected provider conversation ids for a small reconciliation batch. Repeatable or comma-separated.', collectTrimmedString, [])
  .option('--provider-conversation-url <url>', 'Provider conversation URL for reopening historical context.')
  .option('--project-id <id>', 'Provider project id for scoped conversations.')
  .option('--catalog-item-id <id>', 'Materialize from an account-mirror catalog item id.')
  .option('--catalog-kind <kind>', 'Catalog kind for item lookup: conversations, artifacts, files, media, projects, or all.')
  .option('--archive-item-id <id>', 'Resolve provider conversation evidence from a run archive item.')
  .option('--reconcile', 'Run a bounded reconciliation pass over cached account-mirror conversation rows.', false)
  .option('--asset-source <source>', 'Restrict reconciliation to a non-history source such as account-library.')
  .option('--refresh-snapshot', 'Refresh the provider conversation snapshot before materializing artifacts.', false)
  .option('--asset-kind <kind>', 'Asset kind to fetch: artifacts, files, media, or all. Repeatable or comma-separated.', collectTrimmedString, [])
  .option('--max-items <count>', 'Maximum assets or reconciliation conversations to process.', parseIntOption)
  .option('--provider-work-timeout-ms <ms>', 'Provider browser work timeout in milliseconds.', parseIntOption)
  .option('--force', 'Refresh through the provider even when related local evidence already exists.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await createApiHistoryMaterializationJobForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      browserProfile: commandOptions.browserProfile,
      boundIdentityKey: commandOptions.boundIdentityKey,
      conversationId: commandOptions.conversationId,
      conversationIds: commandOptions.conversationIds,
      providerConversationUrl: commandOptions.providerConversationUrl,
      projectId: commandOptions.projectId,
      catalogItemId: commandOptions.catalogItemId,
      catalogKind: commandOptions.catalogKind,
      archiveItemId: commandOptions.archiveItemId,
      reconcile: commandOptions.reconcile,
      assetSource: commandOptions.assetSource,
      refreshSnapshot: commandOptions.refreshSnapshot,
      assetKinds: commandOptions.assetKind,
      maxItems: commandOptions.maxItems,
      providerWorkTimeoutMs: commandOptions.providerWorkTimeoutMs,
      force: commandOptions.force,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiHistoryMaterializationJobCliSummary(result));
  });

const handoffCommand = program
  .command('handoff')
  .description('Prepare cross-service context handoff packets.');

handoffCommand
  .command('prepare')
  .description('Prepare a dry-run cross-tenant/cross-service handoff packet.')
  .requiredOption('--source-provider <provider>', 'Source provider: chatgpt, gemini, or grok.')
  .option('--source-profile <profile>', 'Source AuraCall runtime profile.')
  .requiredOption('--source-ref <ref>', 'Source conversation, project, or provider-native reference.')
  .option('--source-project-ref <ref>', 'Optional source project reference.')
  .requiredOption('--target-provider <provider>', 'Target provider: chatgpt, gemini, or grok.')
  .option('--target-profile <profile>', 'Target AuraCall runtime profile.')
  .option('--target-ref <ref>', 'Optional target conversation reference.')
  .option('--target-project-ref <ref>', 'Optional target project reference.')
  .option('--target-model-selector <selector>', 'Optional semantic target model selector such as chatgpt:reasoning-high.')
  .option('--source-context-json <path>', 'Existing cached source context JSON to include in the packet.')
  .option('--source-manifest-json <path>', 'Existing source file/artifact manifest JSON to include in the packet.')
  .option('--source-omissions-json <path>', 'Existing source omissions JSON to include in the packet.')
  .option('--source-materialization-job-json <path>', 'Existing source history materialization job readback JSON to import. Repeatable.', collectTrimmedString, [])
  .option('--source-materialization-job-id <id>', 'Existing source history materialization job id to read from the local API. Repeatable.', collectTrimmedString, [])
  .option('--source-materialization-create', 'Explicitly create one bounded source materialization job when no source job evidence was supplied.', false)
  .option('--source-materialization-asset-kind <kind>', 'Source materialization asset kind: artifacts, files, media, or all. Repeatable or comma-separated.', collectTrimmedString, [])
  .option('--source-materialization-max-items <count>', 'Maximum source materialization items to process.', parseIntOption)
  .option('--source-materialization-provider-work-timeout-ms <ms>', 'Provider browser work timeout for explicit source materialization.', parseIntOption)
  .option('--source-materialization-force', 'Force explicit source materialization through the provider.', false)
  .option('--host <address>', 'Local API host for source materialization orchestration (defaults to api.host from config).')
  .option('--port <number>', 'Local API port for source materialization orchestration (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'Local API timeout for source materialization orchestration.', parseIntOption, 10000)
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--handoff-id <id>', 'Deterministic handoff id for repeatable dry-run tests.')
  .option('--max-selected-artifacts <count>', 'Maximum manifest items to select for the target seed.', parseIntOption)
  .option('--dry-run', 'Required in Plan 0111: write preview artifacts without target mutation.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const resolvedConfig = await resolveConfig(
      { ...parentOptions, ...commandOptions, profile: commandOptions.sourceProfile ?? parentOptions.profile },
      process.cwd(),
      process.env,
    );
    const apiConfig = readCliApiConfig(resolvedConfig);
    const result = await prepareHandoffForCli({
      config: resolvedConfig as unknown as Record<string, unknown>,
      sourceProvider: commandOptions.sourceProvider,
      sourceProfile: commandOptions.sourceProfile ?? resolvedConfig.auracallProfile ?? null,
      sourceRef: commandOptions.sourceRef,
      sourceProjectRef: commandOptions.sourceProjectRef,
      targetProvider: commandOptions.targetProvider,
      targetProfile: commandOptions.targetProfile,
      targetRef: commandOptions.targetRef,
      targetProjectRef: commandOptions.targetProjectRef,
      targetModelSelector: commandOptions.targetModelSelector,
      sourceContextJson: commandOptions.sourceContextJson,
      sourceManifestJson: commandOptions.sourceManifestJson,
      sourceOmissionsJson: commandOptions.sourceOmissionsJson,
      sourceMaterializationJobJson: commandOptions.sourceMaterializationJobJson,
      sourceMaterializationJobId: commandOptions.sourceMaterializationJobId,
      sourceMaterializationCreate: commandOptions.sourceMaterializationCreate,
      sourceMaterializationAssetKind: commandOptions.sourceMaterializationAssetKind,
      sourceMaterializationMaxItems: commandOptions.sourceMaterializationMaxItems,
      sourceMaterializationProviderWorkTimeoutMs: commandOptions.sourceMaterializationProviderWorkTimeoutMs,
      sourceMaterializationForce: commandOptions.sourceMaterializationForce,
      apiHost: commandOptions.host ?? apiConfig.host,
      apiPort: commandOptions.port ?? apiConfig.port,
      apiTimeoutMs: commandOptions.timeoutMs,
      outputDir: commandOptions.outputDir,
      handoffId: commandOptions.handoffId,
      dryRun: commandOptions.dryRun,
      maxSelectedArtifacts: commandOptions.maxSelectedArtifacts,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffPrepareCliSummary(result));
  });

handoffCommand
  .command('status')
  .description('Read a prepared handoff packet status from the handoff ledger.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await readHandoffStatusForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (!result) {
      console.error(`Handoff packet not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffStatusCliSummary(result));
  });

handoffCommand
  .command('approve-upload')
  .description('Record explicit approval for target upload without submitting the handoff.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--actor <actor>', 'Approval actor recorded in the handoff ledger.', 'operator')
  .option('--package-digest <digest>', 'Expected target package digest; mismatches fail closed.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await approveHandoffUploadForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
      actor: commandOptions.actor,
      packageDigest: commandOptions.packageDigest,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffApproveUploadCliSummary(result));
  });

handoffCommand
  .command('upload')
  .description('Run approval-gated target upload from a prepared handoff package without submit.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await uploadHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffUploadCliSummary(result));
  });

handoffCommand
  .command('approve-submit')
  .description('Record explicit approval for deterministic target submit and readback.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--actor <actor>', 'Approval actor recorded in the handoff ledger.', 'operator')
  .option('--package-digest <digest>', 'Expected target package digest; mismatches fail closed.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await approveHandoffSubmitForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
      actor: commandOptions.actor,
      packageDigest: commandOptions.packageDigest,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffApproveSubmitCliSummary(result));
  });

handoffCommand
  .command('submit')
  .description('Run approval-gated deterministic target submit and cached readback.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await submitHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffSubmitCliSummary(result));
  });

handoffCommand
  .command('resume')
  .description('Write a deterministic handoff resume plan from current packet state.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await resumeHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffResumeCliSummary(result));
  });

handoffCommand
  .command('repair')
  .description('Repair missing derived handoff state and write a resume plan.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await repairHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffRepairCliSummary(result));
  });

handoffCommand
  .command('export')
  .description('Write a manual handoff export bundle for operator completion.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const result = await exportHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffExportCliSummary(result));
  });

handoffCommand
  .command('recover-live')
  .description('Execute the current approved handoff resume action and write live recovery evidence.')
  .argument('<id>', 'Handoff packet id.')
  .option('--output-dir <path>', 'Directory where handoff packet directories are written.')
  .option('--target-adapter <adapter>', 'Target adapter to execute: packet or chatgpt-browser.', 'packet')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const result = await recoverLiveHandoffForCli({
      handoffId: id,
      outputDir: commandOptions.outputDir,
      targetAdapter: commandOptions.targetAdapter,
      config: userConfig,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatHandoffRecoverLiveCliSummary(result));
  });

apiCommand
  .command('history-materialization-status')
  .description('Read a durable account-history-backed materialization job.')
  .argument('<id>', 'History materialization job id.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await readApiHistoryMaterializationJobForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiHistoryMaterializationJobCliSummary(result));
  });

apiCommand
  .command('history-materialization-cancel')
  .description('Cancel a queued account-history-backed materialization job before provider work starts.')
  .argument('<id>', 'History materialization job id.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP write timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await cancelApiHistoryMaterializationJobForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiHistoryMaterializationJobCliSummary(result));
  });

apiCommand
  .command('history-materialization-jobs')
  .description('List durable account-history-backed materialization jobs.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--status <status>', 'Filter by queued, running, succeeded, skipped, failed, active, or terminal.')
  .option('--provider <provider>', 'Filter by provider.')
  .option('--runtime-profile <profile>', 'Filter by runtime profile.')
  .option('--source-type <type>', 'Filter by conversation, catalog_item, archive_item, or reconciliation.')
  .option('--limit <count>', 'Maximum jobs to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await listApiHistoryMaterializationJobsForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      status: commandOptions.status,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      sourceType: commandOptions.sourceType,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiHistoryMaterializationJobsCliSummary(result));
  });

apiCommand
  .command('mirror-reconcile-all')
  .description('Plan or start a multi-tenant account mirror reconciliation campaign on the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--provider <provider>', 'Restrict planning to one provider.')
  .option('--runtime-profile <profile>', 'Restrict planning to one runtime profile.')
  .option('--identity <identity>', 'Restrict planning to one bound or detected identity key.')
  .option('--include-disabled', 'Include disabled/unconfigured targets in future execution planning.', false)
  .option('--max-targets <count>', 'Maximum eligible targets selected by the campaign planner.', parseIntOption)
  .option('--max-active-targets <count>', 'Maximum active targets the campaign may select.', parseIntOption)
  .option('--materialization-policy <policy>', 'Sweep artifact policy: metadata_only, recent_missing_assets, or full_missing_assets.')
  .option('--materialization-asset-kind <kind>', 'Sweep materialization asset kind: artifacts, files, media, or all. Repeatable or comma-separated.', collectTrimmedString, [])
  .option('--materialization-max-items <count>', 'Maximum conversations/assets to pass to each sweep materialization job.', parseIntOption)
  .option('--dry-run', 'Plan without starting browser work.', true)
  .option('--no-dry-run', 'Start selected eligible targets instead of only planning.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const campaign = await startApiMirrorReconciliationForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      identity: commandOptions.identity,
      includeDisabled: commandOptions.includeDisabled,
      maxTargets: commandOptions.maxTargets,
      maxActiveTargets: commandOptions.maxActiveTargets,
      materializationPolicy: commandOptions.materializationPolicy,
      materializationAssetKinds: commandOptions.materializationAssetKind,
      materializationMaxItems: commandOptions.materializationMaxItems,
      dryRun: commandOptions.dryRun,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(campaign, null, 2));
      return;
    }
    console.log(formatApiMirrorReconciliationCliSummary(campaign));
  });

apiCommand
  .command('mirror-reconciliations')
  .description('List persisted account mirror reconciliation campaigns from the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--status <status>', 'Filter by status: active, planned, queued, running, paused, completed, completed_with_skips, cancelled, failed.')
  .option('--limit <count>', 'Maximum campaign records to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await listApiMirrorReconciliationsForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      status: commandOptions.status,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiMirrorReconciliationListCliSummary(result));
  });

apiCommand
  .command('mirror-reconciliation-control')
  .description('Pause, resume, cancel, or advance an account mirror reconciliation campaign.')
  .argument('<id>', 'Account mirror reconciliation campaign id.')
  .argument('<action>', 'Control action: pause, resume, cancel, or run-next-pass.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, action: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const campaign = await controlApiMirrorReconciliationForCli({
      id,
      action,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(campaign, null, 2));
      return;
    }
    console.log(formatApiMirrorReconciliationCliSummary(campaign));
  });

apiCommand
  .command('mirror-reconciliation-status')
  .description('Read an account mirror reconciliation campaign from the local API.')
  .argument('<id>', 'Account mirror reconciliation campaign id.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const campaign = await readApiMirrorReconciliationForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(campaign, null, 2));
      return;
    }
    console.log(formatApiMirrorReconciliationCliSummary(campaign));
  });

apiCommand
  .command('mirror-complete')
  .description('Start a nonblocking account mirror completion operation on the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--provider <provider>', 'Provider to complete (default chatgpt).')
  .option('--runtime-profile <profile>', 'Runtime profile to complete (default default).')
  .option('--max-passes <count>', 'Debug cap for refresh passes; omitted means unbounded live follow.', parseIntOption)
  .option('--sweep-mode <mode>', 'Live-follow sweep mode: steady_follow or full_sweep.')
  .option('--materialization-policy <policy>', 'Sweep artifact policy: metadata_only, recent_missing_assets, or full_missing_assets.')
  .option('--materialization-asset-kind <kind>', 'Sweep materialization asset kind: artifacts, files, media, or all. Repeatable or comma-separated.', collectTrimmedString, [])
  .option('--materialization-max-items <count>', 'Maximum conversations/assets to pass to each sweep materialization job.', parseIntOption)
  .option('--materialization-refresh-snapshot', 'Refresh provider conversation snapshots before sweep materialization.')
  .option('--materialization-force', 'Force sweep materialization even when related local evidence exists.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const operation = await startApiMirrorCompletionForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      maxPasses: commandOptions.maxPasses,
      sweepMode: commandOptions.sweepMode,
      materializationPolicy: commandOptions.materializationPolicy,
      materializationAssetKinds: commandOptions.materializationAssetKind,
      materializationMaxItems: commandOptions.materializationMaxItems,
      materializationRefreshSnapshot: commandOptions.materializationRefreshSnapshot,
      materializationForce: commandOptions.materializationForce,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(operation, null, 2));
      return;
    }
    console.log(formatApiMirrorCompletionCliSummary(operation));
  });

apiCommand
  .command('mirror-completions')
  .description('List persisted account mirror completion operations from the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--provider <provider>', 'Filter by provider.')
  .option('--runtime-profile <profile>', 'Filter by runtime profile.')
  .option('--status <status>', 'Filter by status: active, queued, running, paused, completed, blocked, failed, cancelled.')
  .option('--active-only', 'Show only queued/running completions.', false)
  .option('--limit <count>', 'Maximum completion records to read.', parseIntOption, 50)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const result = await listApiMirrorCompletionsForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      status: commandOptions.status,
      activeOnly: commandOptions.activeOnly,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatApiMirrorCompletionListCliSummary(result));
  });

apiCommand
  .command('mirror-completion-control')
  .description('Pause, resume, run one bounded pass, or cancel a nonblocking account mirror completion operation.')
  .argument('<id>', 'Account mirror completion id.')
  .argument('<action>', 'Control action: pause, resume, run-one-pass, or cancel.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, action: 'pause' | 'resume' | 'cancel' | 'run_one_pass' | 'run-one-pass', commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const operation = await controlApiMirrorCompletionForCli({
      id,
      action,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(operation, null, 2));
      return;
    }
    console.log(formatApiMirrorCompletionCliSummary(operation));
  });

apiCommand
  .command('mirror-completion-status')
  .description('Read a nonblocking account mirror completion operation from the local API.')
  .argument('<id>', 'Account mirror completion id.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (id: string, commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const operation = await readApiMirrorCompletionForCli({
      id,
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(operation, null, 2));
      return;
    }
    console.log(formatApiMirrorCompletionCliSummary(operation));
  });

apiCommand
  .command('mirror-provider-guard-clear')
  .description('Clear an account mirror provider guard into a quiet cooldown.')
  .requiredOption('--provider <provider>', 'Provider to clear: chatgpt, gemini, or grok.')
  .option('--runtime-profile <profile>', 'Runtime profile to clear.', 'default')
  .option('--cooldown-ms <ms>', 'Quiet cooldown after clearance.', parseIntOption)
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await clearApiMirrorProviderGuardForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      cooldownMs: commandOptions.cooldownMs,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary.raw, null, 2));
      return;
    }
    console.log(formatApiMirrorProviderGuardClearCliSummary(summary));
  });

apiCommand
  .command('scheduler-history')
  .description('Read compact lazy account mirror scheduler history from the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--limit <count>', 'Maximum compact history entries to read.', parseIntOption, 10)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await readApiSchedulerHistoryForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      limit: commandOptions.limit,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary.history, null, 2));
      return;
    }
    console.log(formatApiSchedulerHistoryCliSummary(summary));
  });

apiCommand
  .command('scheduler-diagnostics')
  .description('Read lazy account mirror scheduler diagnostics from the local API.')
  .option('--host <address>', 'Local API host to query (defaults to api.host from config).')
  .option('--port <number>', 'Local API port to query (defaults to api.port from config).', parseIntOption)
  .option('--timeout-ms <ms>', 'HTTP read timeout in milliseconds.', parseIntOption, 5000)
  .option('--provider <provider>', 'Filter diagnostics by provider.')
  .option('--runtime-profile <profile>', 'Filter diagnostics by runtime profile.')
  .option('--completion-id <id>', 'Filter diagnostics by active account mirror completion id.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const apiConfig = readCliApiConfig(await resolveConfig(
      { ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    ));
    const summary = await readApiSchedulerDiagnosticsForCli({
      host: commandOptions.host ?? apiConfig.host,
      port: commandOptions.port ?? apiConfig.port,
      timeoutMs: commandOptions.timeoutMs,
      provider: commandOptions.provider,
      runtimeProfile: commandOptions.runtimeProfile,
      completionId: commandOptions.completionId,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(summary.diagnostics, null, 2));
      return;
    }
    console.log(formatApiSchedulerDiagnosticsCliSummary(summary));
  });

apiCommand
  .command('inspect-run')
  .description('Inspect one persisted runtime run and its bounded queue/runner posture.')
  .option('--run-id <id>', 'Inspect one persisted runtime run by runtime run id.')
  .option('--runtime-run-id <id>', 'Inspect one persisted runtime run by runtime run id (canonical runtime alias).')
  .option('--team-run-id <id>', 'Inspect the latest persisted runtime run linked to a team run id.')
  .option('--task-run-spec-id <id>', 'Inspect the latest persisted runtime run linked to a task run spec id.')
  .option('--runner-id <id>', 'Optionally evaluate claim affinity against one persisted runner id.')
  .option(
    '--probe <service-state>',
    'Optionally request one bounded live probe. Current value: service-state.',
    (value) => {
      if (value === 'service-state') {
        return value;
      }
      throw new Error('Invalid --probe value. Use service-state.');
    },
  )
  .option(
    '--authority <scheduler>',
    'Optionally request one bounded authority evaluation. Current value: scheduler.',
    (value) => {
      if (value === 'scheduler') {
        return value;
      }
      throw new Error('Invalid --authority value. Use scheduler.');
    },
  )
  .option(
    '--diagnostics <browser-state>',
    'Optionally request one bounded browser diagnostic snapshot. Current value: browser-state.',
    (value) => {
      if (value === 'browser-state') {
        return value;
      }
      throw new Error('Invalid --diagnostics value. Use browser-state.');
    },
  )
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const includeServiceState = commandOptions.probe === 'service-state';
    const includeBrowserDiagnostics = commandOptions.diagnostics === 'browser-state';
    const defaultProbeFactories = includeServiceState || includeBrowserDiagnostics
      ? await import('../src/http/responsesServer.js')
      : null;
    const payload = await inspectConfiguredRuntimeRun({
      runId: commandOptions.runId,
      runtimeRunId:
        typeof commandOptions.runtimeRunId === 'string' && commandOptions.runtimeRunId.trim().length > 0
          ? commandOptions.runtimeRunId.trim()
          : null,
      teamRunId:
        typeof commandOptions.teamRunId === 'string' && commandOptions.teamRunId.trim().length > 0
          ? commandOptions.teamRunId.trim()
          : null,
      taskRunSpecId:
        typeof commandOptions.taskRunSpecId === 'string' && commandOptions.taskRunSpecId.trim().length > 0
          ? commandOptions.taskRunSpecId.trim()
          : null,
      runnerId:
        typeof commandOptions.runnerId === 'string' && commandOptions.runnerId.trim().length > 0
          ? commandOptions.runnerId.trim()
          : null,
      includeServiceState,
      includeBrowserDiagnostics,
      includeSchedulerAuthority: commandOptions.authority === 'scheduler',
      schedulerAuthorityLocalRunnerId:
        typeof commandOptions.runnerId === 'string' && commandOptions.runnerId.trim().length > 0
          ? commandOptions.runnerId.trim()
          : null,
      probeServiceState: includeServiceState && defaultProbeFactories
        ? defaultProbeFactories.createDefaultRuntimeRunServiceStateProbe()
        : undefined,
      probeBrowserDiagnostics: includeBrowserDiagnostics && defaultProbeFactories
        ? defaultProbeFactories.createDefaultRuntimeRunBrowserDiagnosticsProbe()
        : undefined,
    });

    if (commandOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(formatRuntimeRunInspectionPayload(payload));
  });

function resolveBrowserCliOperationTimeoutMs(value: number | 'auto' | string | undefined): number {
  if (value === 'auto' || value == null) {
    return 90_000;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value * 1000);
  }
  const parsed = Number.parseFloat(String(value));
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed * 1000);
  }
  return 90_000;
}

function withBrowserCliOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      timeout = null;
      reject(
        new Error(
          `${label} timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            'The browser operation may still be blocked on provider readiness; run doctor and inspect browser-state before retrying.',
        ),
      );
    }, timeoutMs);
    operation.then(
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

const projectsCommand = program
  .command('projects')
  .description('List available projects/workspaces for the active browser provider.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--refresh', 'Force refresh of cached project data.')
  .addOption(
    new Option(
      '--operation-timeout <seconds|auto>',
      'Bound browser project list/create operations so provider stalls return a diagnostic.',
    )
      .argParser(parseTimeoutOption)
      .default('90'),
  )
  .action(async (commandOptions) => {
    const parentOptions = program.opts?.() ?? {};
    const userConfig = await resolveConfig({ ...parentOptions, ...commandOptions }, process.cwd(), process.env);
    const target = (commandOptions.target ?? (parentOptions as CliOptions).target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const provider = llmService.provider;
    const listOptions = await llmService.buildListOptions();
    let normalizedListOptions = { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null };
    let cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>> | undefined;
    const resolveCacheContext = async () => {
      if (!cacheContext) {
        cacheContext = await llmService.resolveCacheContext(normalizedListOptions);
        assertCacheIdentity(cacheContext, target);
      }
      return cacheContext;
    };
    if (!provider.listProjects) {
      const fallback = llmService.deriveProjectsFromConfig({
        configuredUrl: listOptions.configuredUrl,
        projectId: userConfig.browser?.projectId ?? null,
      });
      if (fallback.length === 0) {
        console.log(chalk.yellow(`Project listing is not implemented yet for ${target}.`));
        return;
      }
      try {
        await writeProjectCache(await resolveCacheContext(), fallback);
      } catch (error) {
        console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.log(JSON.stringify(fallback, null, 2));
      return;
    }
    const projects = await withBrowserCliOperationTimeout(
      llmService.listProjects(normalizedListOptions),
      resolveBrowserCliOperationTimeoutMs(commandOptions.operationTimeout),
      `${target} project listing`,
    );
    if (Array.isArray(projects) && projects.length === 0) {
      const fallback = llmService.deriveProjectsFromConfig({
        configuredUrl: listOptions.configuredUrl,
        projectId: userConfig.browser?.projectId ?? null,
      });
      if (fallback.length > 0) {
        try {
          await writeProjectCache(await resolveCacheContext(), fallback);
        } catch (error) {
          console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
        }
        console.log(JSON.stringify(fallback, null, 2));
        return;
      }
    }
    if (Array.isArray(projects)) {
      try {
        await writeProjectCache(await resolveCacheContext(), projects);
      } catch (error) {
        console.warn(`Failed to write project cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (process.stdout.isTTY) {
      console.table(projects);
    } else {
      console.log(JSON.stringify(projects, null, 2));
    }
  });

projectsCommand
  .command('create')
  .description('Create a project/workspace for the active browser provider.')
  .argument('<name>', 'Project name')
  .option('--instructions-file <path>', 'Read instructions from a file.')
  .option('--instructions-text <value>', 'Use raw instructions text.')
  .option('--model <label>', 'Preferred model label for the project.')
  .option('--memory-mode <global|project>', 'ChatGPT only: choose global/default memory or project-only memory.')
  .option('-f, --file <paths...>', 'Files to attach to the project.', collectPaths, [])
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .addOption(
    new Option(
      '--operation-timeout <seconds|auto>',
      'Bound browser project creation so provider stalls return a diagnostic.',
    )
      .argParser(parseTimeoutOption)
      .default('120'),
  )
  .action(async (projectName, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? (parentOptions as CliOptions).target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const textValue = typeof commandOptions.instructionsText === 'string' && commandOptions.instructionsText.trim().length > 0
      ? commandOptions.instructionsText
      : null;
    const filePath = typeof commandOptions.instructionsFile === 'string' && commandOptions.instructionsFile.trim().length > 0
      ? commandOptions.instructionsFile
      : null;
    const instructions = textValue ?? (filePath ? await fs.readFile(filePath, 'utf8') : undefined);
    const modelLabel = typeof commandOptions.model === 'string' && commandOptions.model.trim().length > 0
      ? commandOptions.model.trim()
      : undefined;
    const memoryModeRaw = typeof commandOptions.memoryMode === 'string' && commandOptions.memoryMode.trim().length > 0
      ? commandOptions.memoryMode.trim()
      : null;
    const memoryMode = memoryModeRaw ? normalizeProjectMemoryMode(memoryModeRaw) : null;
    if (memoryModeRaw && !memoryMode) {
      throw new Error(`Invalid --memory-mode "${memoryModeRaw}". Use "global" or "project".`);
    }
    if (memoryMode && target !== 'chatgpt') {
      throw new Error('--memory-mode is currently only supported for ChatGPT project creation.');
    }
    const rootOptions = program.opts?.() ?? {};
    const mergedFileInputs = mergePathLikeOptions(
      collectPaths(commandOptions.file, collectPaths((parentOptions as CliOptions).file, collectPaths((rootOptions as CliOptions).file, []))),
      collectPaths(
        (commandOptions as CliOptions).include,
        collectPaths((parentOptions as CliOptions).include, collectPaths((rootOptions as CliOptions).include, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).files,
        collectPaths((parentOptions as CliOptions).files, collectPaths((rootOptions as CliOptions).files, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).path,
        collectPaths((parentOptions as CliOptions).path, collectPaths((rootOptions as CliOptions).path, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).paths,
        collectPaths((parentOptions as CliOptions).paths, collectPaths((rootOptions as CliOptions).paths, [])),
      ),
    );
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    let createdProject: import('../src/browser/providers/domain.js').Project | null = null;
    if (llmService.createProject) {
      createdProject = await withBrowserCliOperationTimeout(
        llmService.createProject(
          {
            name: projectName,
            instructions: instructions ?? undefined,
            modelLabel,
            files: deduped,
            memoryMode: memoryMode ?? undefined,
          },
          { listOptions },
        ),
        resolveBrowserCliOperationTimeoutMs(commandOptions.operationTimeout),
        `${target} project creation for "${projectName}"`,
      );
      if (!createdProject) {
        throw new Error(
          `Project creation could not be verified. ${target} did not resolve a new project page for "${projectName}".`,
        );
      }
    } else {
      await llmService.openCreateProjectModal({ listOptions });
      await llmService.setCreateProjectFields(
        {
          name: projectName,
          instructions,
          modelLabel,
          memoryMode: memoryMode ?? undefined,
        },
        { listOptions },
      );
      await llmService.clickCreateProjectNext({ listOptions });
      if (deduped.length > 0) {
        await llmService.clickCreateProjectAttach({ listOptions });
        await llmService.clickCreateProjectUploadFile({ listOptions });
        await llmService.uploadCreateProjectFiles(deduped, { listOptions });
      }
      await llmService.clickCreateProjectConfirm({ listOptions });
    }
    console.log(`Created project "${projectName}".`);
    try {
      const cacheContext = await llmService.resolveCacheContext(listOptions);
      assertCacheIdentity(cacheContext, target);
      if (createdProject) {
        await upsertProjectCacheEntry(cacheContext, createdProject);
      } else {
        console.warn('Created project but could not resolve its URL for cache update.');
      }
    } catch (error) {
      console.warn(`Failed to update project cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

projectsCommand
  .command('rename')
  .description('Rename a project/workspace for the active browser provider.')
  .argument('<id>', 'Project identifier or name')
  .argument('<name>', 'New project name')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .action(async (projectId, newName, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? (parentOptions as CliOptions).target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    await llmService.renameProject(resolvedId, newName);
    console.log(`Renamed project ${resolvedId} to "${newName}".`);
  });

projectsCommand
  .command('clone')
  .description('Clone a project/workspace for the active browser provider.')
  .argument('<id>', 'Project identifier or name')
  .argument('[name]', 'Optional new name for the clone.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (projectId, newName, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? (parentOptions as CliOptions).target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const cacheContext = await llmService.resolveCacheContext(listOptions, { prompt: false, detect: false });
    assertCacheIdentity(cacheContext, target);
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    const created = await llmService.cloneProject(resolvedId, { listOptions });
    console.log(`Cloned project ${resolvedId}.`);
    if (created) {
      await upsertProjectCacheEntry(cacheContext, created);
    } else {
      console.warn('Clone created but could not resolve its URL for cache update.');
    }

    if (newName && created?.id) {
      await llmService.renameProject(created.id, newName, { listOptions });
      const waitDeadline = Date.now() + 8_000;
      let resolvedName: string | null = null;
      while (Date.now() < waitDeadline) {
        const refreshed = await llmService.listProjects(listOptions);
        if (Array.isArray(refreshed)) {
          await writeProjectCache(cacheContext, refreshed);
          const match = refreshed.find((project) => project.id === created.id);
          resolvedName = match?.name ?? null;
          if (resolvedName === newName) {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (resolvedName !== newName) {
        throw new Error(
          `Clone rename did not persist. Expected "${newName}", got "${resolvedName ?? 'missing'}".`,
        );
      }
      console.log(`Renamed cloned project to "${newName}".`);
      await upsertProjectCacheEntry(cacheContext, {
        id: created.id,
        name: newName,
        provider: created.provider,
        url: created.url,
      });
    } else if (newName) {
      throw new Error('Clone created but could not resolve its ID to rename.');
    }
  });

projectsCommand
  .command('remove')
  .alias('delete')
  .description('Remove a project/workspace for the active browser provider.')
  .argument('<id>', 'Project identifier or name')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .action(async (projectId, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? (parentOptions as CliOptions).target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId.trim(),
    );
    const resolvedId = isUuid
      ? projectId.trim()
      : await llmService.resolveProjectIdByName(projectId, {
          listOptions,
          forceRefresh: true,
          allowAutoRefresh: true,
        });
    await llmService.selectRemoveProjectItem(resolvedId);
    await llmService.pushProjectRemoveConfirmation(resolvedId);
    console.log(`Removed project ${resolvedId}.`);
    try {
      console.log('Refreshing project list...');
      const cacheContext = await llmService.resolveCacheContext(listOptions);
      assertCacheIdentity(cacheContext, target);
      const refreshed = await llmService.listProjects(listOptions);
      if (Array.isArray(refreshed)) {
        await writeProjectCache(cacheContext, refreshed);
        console.log('Project cache refreshed.');
      }
    } catch (error) {
      console.warn(`Failed to refresh project cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

const projectInstructionsCommand = projectsCommand
  .command('instructions')
  .description('Manage project instructions.');

const projectFilesCommand = projectsCommand
  .command('files')
  .description('Manage project files.');

projectFilesCommand
  .command('add <id>')
  .description('Upload files to a project.')
  .option('-f, --file <paths...>', 'Files to attach to the project.', collectPaths, [])
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .action(async (projectId, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (
      commandOptions.target ??
      (parentOptions as CliOptions).target ??
      (program.opts?.() as CliOptions | undefined)?.target ??
      userConfig.browser?.target ??
      'chatgpt'
    ) as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const rootOptions: CliOptions = (program.opts?.() as CliOptions | undefined) ?? ({} as CliOptions);
    const mergedFileInputs = mergePathLikeOptions(
      collectPaths(commandOptions.file, collectPaths((parentOptions as CliOptions).file, collectPaths(rootOptions.file, []))),
      collectPaths(
        (commandOptions as CliOptions).include,
        collectPaths((parentOptions as CliOptions).include, collectPaths(rootOptions.include, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).files,
        collectPaths((parentOptions as CliOptions).files, collectPaths(rootOptions.files, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).path,
        collectPaths((parentOptions as CliOptions).path, collectPaths(rootOptions.path, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).paths,
        collectPaths((parentOptions as CliOptions).paths, collectPaths(rootOptions.paths, [])),
      ),
    );
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    if (deduped.length === 0) {
      throw new Error('Provide one or more --file paths to upload.');
    }
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    await llmService.uploadProjectFiles(resolvedId, deduped, { listOptions });
    console.log(`Uploaded ${deduped.length} file(s) to project ${resolvedId}.`);
  });

projectFilesCommand
  .command('list <id>')
  .description('List files for a project.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .action(async (projectId, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (
      commandOptions.target ??
      (parentOptions as CliOptions).target ??
      (program.opts?.() as CliOptions | undefined)?.target ??
      userConfig.browser?.target ??
      'chatgpt'
    ) as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    const files = await llmService.listProjectFiles(resolvedId, { listOptions });
    if (files.length === 0) {
      console.log(`No files found for project ${resolvedId}.`);
      return;
    }
    for (const file of files) {
      const suffix = typeof file.size === 'number' ? ` (${file.size} B)` : '';
      console.log(`${file.name}${suffix}`);
    }
  });

projectFilesCommand
  .command('remove <id> <file...>')
  .alias('delete')
  .description('Remove files from a project.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .action(async (projectId, fileNames, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (
      commandOptions.target ??
      (parentOptions as CliOptions).target ??
      (program.opts?.() as CliOptions | undefined)?.target ??
      userConfig.browser?.target ??
      'chatgpt'
    ) as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      throw new Error('Provide one or more file names to remove.');
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    for (const fileName of fileNames) {
      await llmService.deleteProjectFile(resolvedId, fileName, { listOptions });
      console.log(`Removed "${fileName}" from project ${resolvedId}.`);
    }
  });

projectInstructionsCommand
  .command('set <id>')
  .description('Replace project instructions.')
  .option('--file <path>', 'Read instructions from a file.')
  .option('--text <value>', 'Use raw instructions text.')
  .option('--model <label>', 'Set the preferred model for the project instructions.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (projectId, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const mergedOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(
      mergedOptions,
      process.cwd(),
      process.env,
    );
    const target = (
      commandOptions.target ??
      (parentOptions as CliOptions).target ??
      (program.opts?.() as CliOptions | undefined)?.target ??
      userConfig.browser?.target ??
      'chatgpt'
    ) as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const textValue = readStringOption(mergedOptions, ['text']) ?? null;
    const filePath = readStringOption(mergedOptions, ['file']) ?? null;
    if (!textValue && !filePath) {
      throw new Error('Provide --text or --file for instructions.');
    }
    const instructions = textValue ?? await fs.readFile(filePath as string, 'utf8');
    const modelLabel =
      readStringOption(mergedOptions, ['model']);
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    await llmService.updateProjectInstructions(resolvedId, instructions, { modelLabel });
    console.log(`Updated instructions for project ${resolvedId}.`);
  });

projectInstructionsCommand
  .command('get <id>')
  .description('Read project instructions.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (projectId, commandOptions) => {
    const parentOptions = projectsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (
      commandOptions.target ??
      (parentOptions as CliOptions).target ??
      (program.opts?.() as CliOptions | undefined)?.target ??
      userConfig.browser?.target ??
      'chatgpt'
    ) as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const resolvedId = await resolveProjectIdArg(llmService, projectId, listOptions);
    const instructions = await llmService.getProjectInstructions(resolvedId);
    if (process.stdout.isTTY) {
      if (instructions.model) {
        console.log(`# Model: ${instructions.model}`);
      }
      console.log(instructions.text);
    } else {
      console.log(JSON.stringify(instructions, null, 2));
    }
  });

const filesCommand = program
  .command('files')
  .description('Manage account-level files for the active browser provider.');

filesCommand
  .command('add')
  .description('Upload files to the provider account-level file library.')
  .option('-f, --file <paths...>', 'Files to upload.', collectPaths, [])
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (commandOptions) => {
    const parentOptions = filesCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const rootOptions: CliOptions = (program.opts?.() as CliOptions | undefined) ?? ({} as CliOptions);
    const mergedFileInputs = mergePathLikeOptions(
      collectPaths(commandOptions.file, collectPaths((parentOptions as CliOptions).file, collectPaths(rootOptions.file, []))),
      collectPaths(
        (commandOptions as CliOptions).include,
        collectPaths((parentOptions as CliOptions).include, collectPaths(rootOptions.include, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).files,
        collectPaths((parentOptions as CliOptions).files, collectPaths(rootOptions.files, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).path,
        collectPaths((parentOptions as CliOptions).path, collectPaths(rootOptions.path, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).paths,
        collectPaths((parentOptions as CliOptions).paths, collectPaths(rootOptions.paths, [])),
      ),
    );
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    if (deduped.length === 0) {
      throw new Error('Provide one or more --file paths to upload.');
    }
    await llmService.uploadAccountFiles(deduped, { listOptions });
    console.log(`Uploaded ${deduped.length} account file(s).`);
  });

filesCommand
  .command('list')
  .description('List account-level files for the active browser provider.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (commandOptions) => {
    const parentOptions = filesCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
		const files = await llmService.listAccountFiles({ listOptions });
		if (files.length === 0) {
			console.log('No account files found.');
			exitAfterCompletedBrowserFileCommand();
			return;
		}
		if (!process.stdout.isTTY) {
			console.log(JSON.stringify(files, null, 2));
			exitAfterCompletedBrowserFileCommand();
			return;
		}
		for (const file of files) {
			const suffix = typeof file.size === 'number' ? ` (${file.size} B)` : '';
			console.log(`${file.id}\t${file.name}${suffix}`);
		}
		console.log(chalk.dim(`Listed ${files.length} account file(s).`));
		exitAfterCompletedBrowserFileCommand();
	});

filesCommand
  .command('download <fileId>')
  .alias('get')
  .description('Download an account-level file by file id.')
  .requiredOption('-o, --out <path>', 'Destination file path or directory.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (fileId, commandOptions) => {
    const parentOptions = filesCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const requestedFileId = String(fileId || '').trim();
    if (!requestedFileId) {
      throw new Error('Provide an account file id to download.');
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const files = await llmService.listAccountFiles({ listOptions });
    const file = files.find((candidate) => {
      const metadata = candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {};
      const providerFileId =
        typeof metadata.providerFileId === 'string' ? metadata.providerFileId.trim() : '';
      return candidate.id === requestedFileId ||
        candidate.remoteUrl === requestedFileId ||
        providerFileId === requestedFileId;
    });
    if (!file) {
      throw new Error(`Account file ${requestedFileId} was not found in the current ${target} account file list.`);
    }
    const output = path.resolve(String(commandOptions.out));
    let destPath = output;
    try {
      const stat = await fs.stat(output);
      if (stat.isDirectory()) {
        const safeName = (file.name || requestedFileId).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || requestedFileId;
        destPath = path.join(output, safeName);
      }
    } catch {
      // Treat a missing output path as a file path.
    }
		await fs.mkdir(path.dirname(destPath), { recursive: true });
		await llmService.downloadAccountFile(file.id, destPath, { listOptions, file });
		console.log(`Downloaded account file ${file.id} to ${destPath}.`);
		exitAfterCompletedBrowserFileCommand();
	});

filesCommand
  .command('remove <fileId...>')
  .alias('delete')
  .description('Remove account-level files by file id.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (chatgpt or grok).')
  .action(async (fileIds, commandOptions) => {
    const parentOptions = filesCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('Provide one or more file ids to remove.');
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    for (const fileId of fileIds) {
      await llmService.deleteAccountFile(String(fileId).trim(), { listOptions });
      console.log(`Removed account file ${fileId}.`);
    }
  });

const conversationsCommand = program
  .command('conversations')
  .description('List conversations for the active browser provider.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--project-id <id>', 'Limit conversations to a specific project/workspace (ID or name).')
  .option('--project-name <name>', 'Resolve project ID by name using the cached project list.')
  .option(
    '--conversation-name <name>',
    'Resolve a conversation by cached title or selector (e.g., latest, latest-1).',
  )
  .option('--include-history', 'Include the History dialog results when listing conversations.')
  .option('--history-limit <count>', `Maximum History conversations to fetch (default ${DEFAULT_CACHE_HISTORY_LIMIT}).`)
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .option('--filter <text>', 'Filter conversations by title/id substring (case-insensitive).')
  .option('--refresh', 'Force refresh of cached project/conversation data.')
  .action(async (commandOptions, command) => {
    const parentOptions = command.parent?.opts?.() ?? {};
    const cliOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const provider = llmService.provider;
    let projectId =
      (commandOptions.projectId?.trim() ||
       parentOptions.projectId?.trim() ||
       userConfig.browser?.projectId ||
       undefined);
    const listDefaults = userConfig.browser?.list;
    const includeHistory =
      (command.getOptionValueSource?.('includeHistory') === 'cli')
        ? Boolean(commandOptions.includeHistory)
        : Boolean(listDefaults?.includeHistory ?? commandOptions.includeHistory);
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : listDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : listDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);
    const filterText =
      (command.getOptionValueSource?.('filter') === 'cli')
        ? commandOptions.filter
        : listDefaults?.filter ?? commandOptions.filter;
    const refreshFlag =
      (command.getOptionValueSource?.('refresh') === 'cli')
        ? Boolean(commandOptions.refresh)
        : Boolean(listDefaults?.refresh ?? commandOptions.refresh);
    let listOptions: BrowserProviderListOptions = await llmService.buildListOptions({
      includeHistory,
      historyLimit,
      historySince,
    });
    if (!projectId && listOptions.includeHistory && listOptions.configuredUrl?.includes('/project/')) {
      listOptions = { ...listOptions, configuredUrl: null };
    }
    if (typeof listOptions.historyLimit === 'number' && (!Number.isFinite(listOptions.historyLimit) || listOptions.historyLimit <= 0)) {
      throw new Error('history-limit must be a positive number.');
    }
    if (listOptions.historySince && !Number.isFinite(Date.parse(listOptions.historySince))) {
      throw new Error('history-since must be a valid date (YYYY-MM-DD or ISO timestamp).');
    }
    let normalizedListOptions = { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null };
    let cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>> | undefined;
    const resolveCacheContext = async () => {
      if (!cacheContext) {
        cacheContext = await llmService.resolveCacheContext(normalizedListOptions);
        assertCacheIdentity(cacheContext, target);
      }
      return cacheContext;
    };
    const projectName =
      typeof commandOptions.projectName === 'string'
        ? commandOptions.projectName.trim()
        : typeof parentOptions.projectName === 'string'
          ? parentOptions.projectName.trim()
          : '';
    const forceRefresh = refreshFlag;
    if (projectId) {
      projectId = await resolveProjectIdArg(llmService, projectId, normalizedListOptions);
    } else if (projectName) {
      projectId = await llmService.resolveProjectIdByName(projectName, {
        forceRefresh,
        listOptions: normalizedListOptions,
      });
    }
    if (projectId) {
      normalizedListOptions = { ...normalizedListOptions, projectId };
    }
    const conversationName =
      typeof commandOptions.conversationName === 'string'
        ? commandOptions.conversationName.trim()
        : typeof parentOptions.conversationName === 'string'
          ? parentOptions.conversationName.trim()
          : '';
    if (conversationName) {
      const conversationMatch = await llmService.resolveConversationSelector(conversationName, {
        projectId,
        forceRefresh,
        listOptions: normalizedListOptions,
      });
      console.log(JSON.stringify([conversationMatch], null, 2));
      return;
    }
    if (!provider.listConversations) {
      let fallback = llmService.deriveConversationsFromConfig({
        configuredUrl: listOptions.configuredUrl,
        projectId: projectId ?? null,
        conversationId: userConfig.browser?.conversationId ?? null,
      });
      if (fallback.length === 0) {
        console.log(chalk.yellow(`Conversation listing is not implemented yet for ${target}.`));
        return;
      }
      try {
        await writeConversationCache(await resolveCacheContext(), fallback);
      } catch (error) {
        console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
      }
      fallback = filterConversationsByQuery(fallback, filterText);
      console.log(JSON.stringify(fallback, null, 2));
      return;
    }
    const conversations = await llmService.listConversations(projectId, normalizedListOptions);
    let resolved = conversations;
    if (Array.isArray(resolved) && resolved.length === 0) {
      const fallback = llmService.deriveConversationsFromConfig({
        configuredUrl: listOptions.configuredUrl,
        projectId: projectId ?? null,
        conversationId: userConfig.browser?.conversationId ?? null,
      });
      if (fallback.length > 0) {
        try {
          await writeConversationCache(await resolveCacheContext(), fallback);
        } catch (error) {
          console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
        }
        const filtered = filterConversationsByQuery(fallback, filterText);
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }
    }
    if (Array.isArray(resolved)) {
      try {
        await writeConversationCache(await resolveCacheContext(), resolved);
      } catch (error) {
        console.warn(`Failed to write conversation cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const filtered = filterConversationsByQuery(resolved, filterText);
    if (process.stdout.isTTY) {
      console.table(filtered);
    } else {
      console.log(JSON.stringify(filtered, null, 2));
    }
  });

const conversationFilesCommand = conversationsCommand
  .command('files')
  .description('List files for a conversation.');

conversationFilesCommand
  .command('add <id>')
  .description('Append files to an existing conversation by sending a new turn with attachments.')
  .option('-f, --file <paths...>', 'Files to attach to the conversation.', collectPaths, [])
  .option('--prompt <text>', 'Prompt to send with the attached files.')
  .option('--target <chatgpt|grok>', 'Choose which provider to query (currently grok only).')
  .option('--project-id <id>', 'Project ID or name (if the conversation is in a project).')
  .action(async (conversationId, commandOptions, command) => {
    const parentOptions = command.parent?.parent?.opts?.() ?? {};
    const rootOptions: CliOptions = (program.opts?.() as CliOptions | undefined) ?? ({} as CliOptions);
    const cliOptions = { ...rootOptions, ...parentOptions, ...commandOptions } as CliOptions;
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? parentOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as
      | 'chatgpt'
      | 'grok';
    if (target !== 'grok') {
      throw new Error('Conversation file add is currently implemented only for Grok browser runs.');
    }

    const promptText = String(
      commandOptions.prompt ??
        parentOptions.prompt ??
        rootOptions.prompt ??
        commandOptions.message ??
        parentOptions.message ??
        rootOptions.message ??
        '',
    ).trim();
    if (!promptText) {
      throw new Error('Provide --prompt text for the follow-up turn that carries the attached file(s).');
    }

    const mergedFileInputs = mergePathLikeOptions(
      collectPaths(commandOptions.file, collectPaths((parentOptions as CliOptions).file, collectPaths(rootOptions.file, []))),
      collectPaths(
        (commandOptions as CliOptions).include,
        collectPaths((parentOptions as CliOptions).include, collectPaths(rootOptions.include, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).files,
        collectPaths((parentOptions as CliOptions).files, collectPaths(rootOptions.files, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).path,
        collectPaths((parentOptions as CliOptions).path, collectPaths(rootOptions.path, [])),
      ),
      collectPaths(
        (commandOptions as CliOptions).paths,
        collectPaths((parentOptions as CliOptions).paths, collectPaths(rootOptions.paths, [])),
      ),
    );
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    if (deduped.length === 0) {
      throw new Error('Provide one or more --file paths to attach.');
    }
    const filesToValidate = deduped.filter((filePath) => !isMediaFile(filePath));
    if (filesToValidate.length > 0) {
      await readFiles(filesToValidate, { cwd: process.cwd() });
    }

    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const configuredUrl = userConfig.browser?.grokUrl ?? null;
    const listOptions = await llmService.buildListOptions({ configuredUrl });
    const projectArg = commandOptions.projectId ?? parentOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const trimmedConversationId = String(conversationId).trim();
    if (!trimmedConversationId) {
      throw new Error('Conversation identifier is required.');
    }

    const requestedModel = String(commandOptions.model ?? rootOptions.model ?? '').trim();
    const browserModel = requestedModel.toLowerCase().startsWith('grok-')
      ? normalizeModelOption(requestedModel)
      : ('grok-4.20' as ModelName);
    const resolvedBrowserConfig = resolveBrowserConfig(userConfig.browser, {
      auracallProfileName: userConfig.auracallProfile ?? null,
    });
    const browserConfig = await buildBrowserConfig({
      ...cliOptions,
      auracallProfileName: userConfig.auracallProfile ?? 'default',
      selectedAgentId: typeof cliOptions.agent === 'string' ? cliOptions.agent.trim() || null : null,
      managedProfileRoot: resolvedBrowserConfig.managedProfileRoot ?? null,
      model: browserModel,
      browserTarget: 'grok',
      projectId: projectId ?? undefined,
      conversationId: trimmedConversationId,
      browserManualLogin: resolvedBrowserConfig.manualLogin ?? true,
      browserManualLoginProfileDir: resolvedBrowserConfig.manualLoginProfileDir ?? undefined,
      browserChromeProfile: resolvedBrowserConfig.chromeProfile ?? undefined,
      browserChromePath: resolvedBrowserConfig.chromePath ?? undefined,
      browserCookiePath: resolvedBrowserConfig.chromeCookiePath ?? undefined,
      browserBootstrapCookiePath: resolvedBrowserConfig.bootstrapCookiePath ?? undefined,
      browserDisplay: resolvedBrowserConfig.display ?? undefined,
      browserHeadless: resolvedBrowserConfig.headless,
      browserHideWindow: resolvedBrowserConfig.hideWindow,
      browserKeepBrowser: resolvedBrowserConfig.keepBrowser,
      browserTimeout: resolvedBrowserConfig.timeoutMs ? String(resolvedBrowserConfig.timeoutMs) : undefined,
      browserInputTimeout: resolvedBrowserConfig.inputTimeoutMs ? String(resolvedBrowserConfig.inputTimeoutMs) : undefined,
      browserCookieWait: resolvedBrowserConfig.cookieSyncWaitMs ? String(resolvedBrowserConfig.cookieSyncWaitMs) : undefined,
      browserWslChrome: cliOptions.browserWslChrome ?? resolvedBrowserConfig.wslChromePreference,
    });
    applyBrowserLaunchUrl({ browserConfig, userConfig, model: browserModel });

    const attachments = await resolveBrowserAttachmentsFromPaths(deduped, process.cwd());
    const browserLogger = createCliBrowserLogger(Boolean(cliOptions.verbose));
    const keepBrowserRequested = Boolean(browserConfig.keepBrowser);
    const browserRunConfig = {
      ...(keepBrowserRequested ? browserConfig : { ...browserConfig, keepBrowser: true }),
      providerSessionAuthorization: listOptions.providerSessionAuthorization,
    };
    let runtimeHint:
      | {
          chromePort?: number;
          chromeHost?: string;
          chromeTargetId?: string;
          tabUrl?: string;
        }
      | null = null;
    let closeChromePort: number | undefined;
    let closeChromeHost: string | undefined;
    try {
      let finalConversationId = trimmedConversationId;
      let answerMarkdown = '';
      let refreshedFileCount = 0;
      await runCliBrowserMode({
        prompt: promptText,
        attachments,
        config: browserRunConfig,
        log: browserLogger,
        runtimeHintCb: async (hint) => {
          runtimeHint = {
            chromePort: hint.chromePort,
            chromeHost: hint.chromeHost,
            chromeTargetId: hint.chromeTargetId,
            tabUrl: hint.tabUrl,
          };
        },
      }).then(async (runResult) => {
        closeChromePort = runResult.chromePort ?? runtimeHint?.chromePort;
        closeChromeHost = runResult.chromeHost ?? runtimeHint?.chromeHost;
        finalConversationId = runResult.conversationId ?? trimmedConversationId;
        answerMarkdown = runResult.answerMarkdown;
        const refreshListOptions: BrowserProviderListOptions = {
          configuredUrl: browserRunConfig.grokUrl ?? browserRunConfig.url ?? null,
          host: runResult.chromeHost ?? runtimeHint?.chromeHost,
          port: runResult.chromePort ?? runtimeHint?.chromePort,
          tabTargetId: runResult.chromeTargetId ?? runtimeHint?.chromeTargetId,
          tabUrl: runResult.tabUrl ?? runtimeHint?.tabUrl,
        };
        const files = await llmService.listConversationFiles(finalConversationId, {
          projectId,
          listOptions: refreshListOptions,
        });
        refreshedFileCount = files.length;
      });

      console.log(`Appended ${attachments.length} file(s) to conversation ${finalConversationId}.`);
      if (answerMarkdown.trim()) {
        console.log('');
        console.log(answerMarkdown.trim());
      }
      console.log(chalk.dim(`Conversation files refreshed (${refreshedFileCount} total).`));
    } finally {
      if (!keepBrowserRequested && closeChromePort) {
        await closeBrowserEndpoint(closeChromePort, closeChromeHost, browserLogger);
      }
    }
  });

conversationFilesCommand
  .command('list <id>')
  .description('List files for a conversation.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--project-id <id>', 'Project ID or name (if the conversation is in a project).')
  .action(async (conversationId, commandOptions, command) => {
    const parentOptions = command.parent?.parent?.opts?.() ?? {};
    const cliOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? parentOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as
      | 'chatgpt'
      | 'gemini'
      | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({ configuredUrl: userConfig.browser?.url ?? null });
    const projectArg = commandOptions.projectId ?? parentOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const files = await llmService.listConversationFiles(String(conversationId).trim(), {
      projectId,
      listOptions,
    });
    if (files.length === 0) {
      console.log(`No files found for conversation ${conversationId}.`);
      return;
    }
    if (!process.stdout.isTTY) {
      console.log(JSON.stringify(files, null, 2));
      return;
    }
    for (const file of files) {
      const suffix = typeof file.size === 'number' ? ` (${file.size} B)` : '';
      console.log(`${file.id}\t${file.name}${suffix}`);
    }
    console.log(chalk.dim(`Listed ${files.length} conversation file(s).`));
  });

conversationFilesCommand
  .command('fetch <id>')
  .description('Fetch conversation-uploaded files and store them under conversation-attachments.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--project-id <id>', 'Project ID or name (if the conversation is in a project).')
  .action(async (id, commandOptions, command) => {
    const parentOptions = command.parent?.parent?.opts?.() ?? {};
    const cliOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? parentOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as
      | 'chatgpt'
      | 'gemini'
      | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({
      configuredUrl: userConfig.browser?.url ?? null,
      includeHistory: true,
      historyLimit: DEFAULT_CACHE_HISTORY_LIMIT,
    });
    const projectArg =
      commandOptions.projectId ?? parentOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const selector = String(id || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector);
    const conversationId = isUuid
      ? selector
      : (
          await llmService.resolveConversationSelector(selector, {
            projectId,
            forceRefresh: true,
            listOptions: projectId ? { ...listOptions, projectId } : listOptions,
          })
        ).id;
    const result = await llmService.materializeConversationFiles(conversationId, {
      projectId,
      listOptions,
      refresh: true,
    });
    if (!process.stdout.isTTY) {
      console.log(
        JSON.stringify(
          {
            provider: target,
            conversationId,
            fileCount: result.conversationFiles.length,
            materializedCount: result.files.length,
            manifestPath: result.manifestPath,
            files: result.files,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (result.conversationFiles.length === 0) {
      console.log(`No files found for conversation ${conversationId}.`);
      return;
    }
    if (result.files.length === 0) {
      console.log(`No conversation files were materialized for ${conversationId}.`);
      if (result.manifestPath) {
        console.log(chalk.dim(`Manifest: ${result.manifestPath}`));
      }
      return;
    }
    console.log(
      `Materialized ${result.files.length}/${result.conversationFiles.length} conversation file(s) for ${conversationId}.`,
    );
    for (const file of result.files) {
      console.log(`${file.name}\t${file.localPath ?? ''}`);
    }
    if (result.manifestPath) {
      console.log(chalk.dim(`Manifest: ${result.manifestPath}`));
    }
  });

const conversationContextCommand = conversationsCommand
  .command('context')
  .description('Read cached/live conversation context payloads.');

const conversationArtifactsCommand = conversationsCommand
  .command('artifacts')
  .description('Materialize conversation artifacts into the local cache.');

conversationArtifactsCommand
  .command('fetch <id>')
  .description('Fetch supported artifacts for a conversation and store them under conversation-attachments.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--project-id <id>', 'Project ID or name (if conversation is in a project).')
  .action(async (id, commandOptions, command) => {
    const parentOptions = command.parent?.parent?.opts?.() ?? {};
    const cliOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? parentOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as
      | 'chatgpt'
      | 'gemini'
      | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const listOptions = await llmService.buildListOptions({
      configuredUrl: userConfig.browser?.url ?? null,
      includeHistory: true,
      historyLimit: DEFAULT_CACHE_HISTORY_LIMIT,
    });
    const projectArg =
      commandOptions.projectId ?? parentOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const selector = String(id || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector);
    const conversationId = isUuid
      ? selector
      : (
          await llmService.resolveConversationSelector(selector, {
            projectId,
            forceRefresh: true,
            listOptions: projectId ? { ...listOptions, projectId } : listOptions,
          })
        ).id;
    const result = await llmService.materializeConversationArtifacts(conversationId, {
      projectId,
      listOptions,
      refresh: true,
    });
    if (!process.stdout.isTTY) {
      console.log(
        JSON.stringify(
          {
            provider: target,
            conversationId,
            artifactCount: result.artifacts.length,
            materializedCount: result.files.length,
            manifestPath: result.manifestPath,
            files: result.files,
          },
          null,
          2,
        ),
      );
    } else if (result.artifacts.length === 0) {
      console.log(`No artifacts found for conversation ${conversationId}.`);
    } else if (result.files.length === 0) {
      console.log(`No supported artifacts were materialized for conversation ${conversationId}.`);
      if (result.manifestPath) {
        console.log(chalk.dim(`Artifact fetch manifest: ${result.manifestPath}`));
      }
    } else {
      for (const file of result.files) {
        console.log(`${file.name}\t${file.localPath ?? ''}`);
      }
      const skipped = result.artifacts.length - result.files.length;
      const suffix = skipped > 0 ? ` (${skipped} unsupported or unavailable)` : '';
      console.log(chalk.dim(`Materialized ${result.files.length} artifact(s)${suffix}.`));
      if (result.manifestPath) {
        console.log(chalk.dim(`Artifact fetch manifest: ${result.manifestPath}`));
      }
    }
    exitAfterCompletedBrowserFileCommand();
  });

conversationContextCommand
  .command('get <id>')
  .description('Retrieve conversation context by ID or cached title/selector.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to query (chatgpt, gemini, or grok).')
  .option('--project-id <id>', 'Project ID or name (if conversation is in a project).')
  .option('--history-limit <count>', `Maximum History conversations to fetch (default ${DEFAULT_CACHE_HISTORY_LIMIT}).`)
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .option('--refresh', 'Force live refresh (default).')
  .option('--cache-only', 'Read from cache only (skip live browser retrieval).')
  .option('--retry-attempts <count>', 'Maximum provider retries after the first context attempt.', parseIntOption)
  .option(
    '--timeout-ms <ms>',
    'Maximum live context-read time in milliseconds.',
    parseIntOption,
    DEFAULT_CONVERSATION_CONTEXT_TIMEOUT_MS,
  )
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.')
  .action(async (id, commandOptions, command) => {
    const parentOptions = command.parent?.parent?.opts?.() ?? {};
    const cliOptions = { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? parentOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as
      | 'chatgpt'
      | 'gemini'
      | 'grok';
    if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
    }
    const llmService = createLlmService(target, userConfig, {
      identityPrompt: promptForCacheIdentity,
    });
    const cacheDefaults = userConfig.browser?.cache;
    const historyLimit =
      commandOptions.historyLimit
        ? Number.parseInt(commandOptions.historyLimit, 10)
        : cacheDefaults?.historyLimit ?? DEFAULT_CACHE_HISTORY_LIMIT;
    const historySince =
      typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
        ? commandOptions.historySince.trim()
        : cacheDefaults?.historySince;
    const listOptionOverrides = {
      configuredUrl: userConfig.browser?.url ?? null,
      includeHistory: true,
      historyLimit,
      historySince,
    };
    if (
      typeof listOptionOverrides.historyLimit === 'number' &&
      (!Number.isFinite(listOptionOverrides.historyLimit) || listOptionOverrides.historyLimit <= 0)
    ) {
      throw new Error('history-limit must be a positive number.');
    }
    if (listOptionOverrides.historySince && !Number.isFinite(Date.parse(listOptionOverrides.historySince))) {
      throw new Error('history-since must be a valid date (YYYY-MM-DD or ISO timestamp).');
    }
    if (
      typeof commandOptions.retryAttempts === 'number' &&
      (!Number.isInteger(commandOptions.retryAttempts) || commandOptions.retryAttempts < 0)
    ) {
      throw new Error('retry-attempts must be a non-negative integer.');
    }
    const projectArg =
      commandOptions.projectId ?? parentOptions.projectId ?? userConfig.browser?.projectId;
    const selector = String(id || '').trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector);
    const listOptions =
      isUuid && !projectArg
        ? listOptionOverrides
        : await llmService.buildListOptions(listOptionOverrides);
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const scopedListOptions = projectId ? { ...listOptions, projectId } : listOptions;
    const conversationId = isUuid
      ? selector
      : (
          await llmService.resolveConversationSelector(selector, {
            projectId,
            forceRefresh: true,
            listOptions: scopedListOptions,
          })
        ).id;
    const refresh = commandOptions.cacheOnly ? false : true;
    const context = await llmService.getConversationContext(conversationId, {
      projectId,
      refresh,
      cacheOnly: Boolean(commandOptions.cacheOnly),
      allowCacheFallback: command.getOptionValueSource?.('refresh') === 'cli' ? false : undefined,
      timeoutMs: commandOptions.timeoutMs,
      retryAttempts: commandOptions.retryAttempts,
      listOptions,
    });
    console.log(JSON.stringify(context, null, 2));
  });

program
  .command('rename <id> <name>')
  .description('Rename a conversation.')
  .option('--target <chatgpt|grok>', 'Choose which provider to use.')
  .option('--project-id <id>', 'Project ID or name (if conversation is in a project).')
  .option('--history-limit <count>', `Maximum History conversations to fetch (default ${DEFAULT_CACHE_HISTORY_LIMIT}).`)
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .action(async (id, name, commandOptions, command) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok';
    const llmService = createLlmService(target, userConfig);
    const provider = llmService.provider;
    
    if (!provider.renameConversation) {
      console.error(`Rename is not supported for ${target}.`);
      process.exit(1);
    }
    
    // Resolve project ID if needed (e.g. from name via existing logic? for now direct ID)
    const cacheDefaults = userConfig.browser?.cache;
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : cacheDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : cacheDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);

    const listOptions = await llmService.buildListOptions({
      configuredUrl: userConfig.browser?.url ?? null,
      includeHistory: true,
      historyLimit,
      historySince,
    });
    const projectArg = commandOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    console.log(`Renaming conversation ${id} to "${name}"...`);
    try {
      await llmService.renameConversation(id, name, projectId);
      console.log(chalk.green('Renamed successfully.'));
    } catch (error) {
      console.error(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

const cacheCommand = program
  .command('cache')
  .description('Show cached browser project/conversation lists.')
  .option('--provider <chatgpt|gemini|grok>', 'Limit cache listing to a provider (chatgpt, gemini, or grok).')
  .option('--refresh', 'Refresh cache entries for the active provider.')
  .option('--include-history', 'Include the History dialog results when refreshing conversations.')
  .option(
    '--include-project-only-conversations',
    'When refreshing, include conversation IDs discovered only via project-scoped conversation lists.',
  )
  .option('--history-limit <count>', `Maximum History conversations to fetch (default ${DEFAULT_CACHE_HISTORY_LIMIT}).`)
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .action(async (commandOptions, command) => {
    const filter =
      typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
        ? commandOptions.provider.trim()
        : null;
    if (filter && !isCacheCliProvider(filter)) {
      throw new Error(`Invalid provider "${filter}". Use "chatgpt", "gemini", or "grok".`);
    }
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const cacheDefaults = userConfig.browser?.cache;
    const includeHistory =
      (command.getOptionValueSource?.('includeHistory') === 'cli')
        ? Boolean(commandOptions.includeHistory)
        : Boolean(cacheDefaults?.includeHistory ?? commandOptions.includeHistory);
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : cacheDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : cacheDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);
    const refreshFlag =
      (command.getOptionValueSource?.('refresh') === 'cli')
        ? Boolean(commandOptions.refresh)
        : Boolean(cacheDefaults?.refresh ?? commandOptions.refresh);
    const includeProjectOnlyConversations =
      (command.getOptionValueSource?.('includeProjectOnlyConversations') === 'cli')
        ? Boolean(commandOptions.includeProjectOnlyConversations)
        : Boolean(cacheDefaults?.includeProjectOnlyConversations ?? commandOptions.includeProjectOnlyConversations);
    if (refreshFlag) {
      const target = (filter ?? userConfig.browser?.target ?? 'chatgpt') as CacheCliProvider;
      if (!isCacheCliProvider(target)) {
        throw new Error(`Invalid provider "${target}". Use "chatgpt", "gemini", or "grok".`);
      }
      const llmService = createLlmService(target, userConfig, {
        identityPrompt: promptForCacheIdentity,
      });
      const listOptions = await llmService.buildListOptions({
        configuredUrl: resolveProviderConfiguredUrl(userConfig, target),
        includeHistory,
        historyLimit,
        historySince,
      });
      if (typeof listOptions.historyLimit === 'number' && (!Number.isFinite(listOptions.historyLimit) || listOptions.historyLimit <= 0)) {
        throw new Error('history-limit must be a positive number.');
      }
      if (listOptions.historySince && !Number.isFinite(Date.parse(listOptions.historySince))) {
        throw new Error('history-since must be a valid date (YYYY-MM-DD or ISO timestamp).');
      }
      await refreshProviderCache(llmService, listOptions, { includeProjectOnlyConversations });
    }
    const cacheSettings = createLlmService(
      (filter ?? userConfig.browser?.target ?? 'chatgpt') as CacheCliProvider,
      userConfig,
    ).getCacheSettings();
    const cacheRoot = cacheSettings.cacheRoot ?? path.join(getAuracallHomeDir(), 'cache', 'providers');
    const cacheTtlMs = cacheSettings.ttlMs ?? PROVIDER_CACHE_TTL_MS;
    const output: Array<{
      provider: string;
      identityKey: string;
      identityHint?: string | null;
      kind: 'projects' | 'conversations';
      fetchedAt: string | null;
      ageHours: number | null;
      stale: boolean;
      sourceUrl?: string | null;
      inventorySummary?: {
        conversationCount: number;
        messageCount: number;
        sourceCount: number;
        fileCount: number;
        artifactCount: number;
      };
    }> = [];
    let providerEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      providerEntries = await fs.readdir(cacheRoot, { withFileTypes: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      throw error;
    }
    for (const providerEntry of providerEntries) {
      if (!providerEntry.isDirectory()) continue;
      if (filter && providerEntry.name !== filter) continue;
      const providerDir = path.join(cacheRoot, providerEntry.name);
      let identityEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
      try {
        identityEntries = await fs.readdir(providerDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const identityEntry of identityEntries) {
        if (!identityEntry.isDirectory()) continue;
        const identityDir = path.join(providerDir, identityEntry.name);
        const files = await fs.readdir(identityDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          if (file.name !== 'projects.json' && file.name !== 'conversations.json') continue;
          const kind = file.name === 'projects.json' ? 'projects' : 'conversations';
          const fullPath = path.join(identityDir, file.name);
          try {
            const raw = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(raw) as {
              fetchedAt?: string;
              sourceUrl?: string | null;
              identityKey?: string | null;
              userIdentity?: { id?: string; handle?: string; email?: string; name?: string };
            };
            const fetchedAt = parsed?.fetchedAt ?? null;
            const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
            const ageMs = Number.isFinite(fetchedMs) ? Date.now() - fetchedMs : NaN;
            const ageHours = Number.isFinite(ageMs) ? Math.round((ageMs / 3600000) * 10) / 10 : null;
            const stale = !Number.isFinite(fetchedMs) || ageMs > cacheTtlMs;
            const identityHint =
              parsed?.userIdentity?.email ||
              parsed?.userIdentity?.handle ||
              parsed?.userIdentity?.name ||
              null;
            let inventorySummary:
              | {
                  conversationCount: number;
                  messageCount: number;
                  sourceCount: number;
                  fileCount: number;
                  artifactCount: number;
                }
              | undefined;
            if (kind === 'conversations') {
              const inventory = await listCachedConversationInventory({
                provider: providerEntry.name as CacheCliProvider,
                userConfig: {} as ProviderCacheContext['userConfig'],
                listOptions: {},
                identityKey: parsed?.identityKey ?? identityEntry.name,
              });
              inventorySummary = inventory.reduce(
                (summary, item) => ({
                  conversationCount: summary.conversationCount + 1,
                  messageCount: summary.messageCount + item.messageCount,
                  sourceCount: summary.sourceCount + item.sourceCount,
                  fileCount: summary.fileCount + item.fileCount,
                  artifactCount: summary.artifactCount + item.artifactCount,
                }),
                {
                  conversationCount: 0,
                  messageCount: 0,
                  sourceCount: 0,
                  fileCount: 0,
                  artifactCount: 0,
                },
              );
            }
            output.push({
              provider: providerEntry.name,
              identityKey: parsed?.identityKey ?? identityEntry.name,
              identityHint,
              kind,
              fetchedAt,
              ageHours,
              stale,
              sourceUrl: parsed?.sourceUrl ?? null,
              inventorySummary,
            });
          } catch (error) {
            console.warn(`Failed to read cache file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    console.log(JSON.stringify(output, null, 2));
  });

cacheCommand
  .command('search <query>')
  .description('Keyword search cached conversation contexts (alias of `cache context search`).')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter search to one conversation ID.')
  .option('--role <user|assistant|system|source>', 'Filter to a specific message role.')
  .option('--limit <count>', 'Maximum hits to return (default 20, max 200).', parseIntOption)
  .action(async (query, commandOptions) => {
    await runCacheContextKeywordSearch(String(query ?? ''), commandOptions as OptionValues);
  });

cacheCommand
  .command('semantic-search <query>')
  .description('Semantic search cached contexts (alias of `cache context semantic-search`).')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter search to one conversation ID.')
  .option('--role <user|assistant|system|source>', 'Filter to a specific message role.')
  .option('--limit <count>', 'Maximum hits to return (default 20, max 200).', parseIntOption)
  .option('--model <id>', 'Embedding model (default text-embedding-3-small).')
  .option('--max-chunks <count>', 'Maximum chunks to embed/score (default 400).', parseIntOption)
  .option('--min-score <value>', 'Minimum cosine score threshold (-1..1).', parseFloatOption)
  .option('--openai-api-key <key>', 'Override OPENAI_API_KEY for this command.')
  .option('--openai-base-url <url>', 'Override embeddings API base URL (default https://api.openai.com/v1).')
  .action(async (query, commandOptions) => {
    await runCacheContextSemanticSearch(String(query ?? ''), commandOptions as OptionValues);
  });

const cacheSourcesCommand = cacheCommand
  .command('sources')
  .description('Inspect cached normalized source-link catalog.');

cacheSourcesCommand
  .command('list')
  .description('List cached source links (SQL-first, JSON fallback).')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter to a single conversation ID.')
  .option('--domain <domain>', 'Filter by exact source domain.')
  .option('--source-group <group>', 'Filter by source group (for example "Searched web").')
  .option('--query <text>', 'Match against url/title/domain text.')
  .option('--limit <count>', 'Maximum rows to return (default 50, max 500).', parseIntOption)
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const resolved = await resolveCacheSearchContext(commandOptions);
    const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
    const domain = readStringOption(commandOptions, ['domain']);
    const sourceGroup = readStringOption(commandOptions, ['sourceGroup', 'source-group']);
    const query = readStringOption(commandOptions, ['query']);
    const limit = readNumberOption(commandOptions, ['limit']);
    const rows = await listCachedSources(resolved.cacheContext, {
      conversationId,
      domain,
      sourceGroup,
      query,
      limit,
    });
    console.log(
      JSON.stringify(
        {
          provider: resolved.provider,
          identityKey: resolved.cacheContext.identityKey,
          filters: {
            conversationId: conversationId ?? null,
            domain: domain ?? null,
            sourceGroup: sourceGroup ?? null,
            query: query ?? null,
            limit: limit ?? null,
          },
          count: rows.length,
          rows,
        },
        null,
        2,
      ),
    );
  });

const cacheArtifactsCommand = cacheCommand
  .command('artifacts')
  .description('Inspect cached normalized artifact catalog.');

cacheArtifactsCommand
  .command('list')
  .description('List cached artifacts (SQL-first, JSON fallback).')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter to a single conversation ID.')
  .option('--kind <download|canvas|generated|image|spreadsheet>', 'Filter by artifact kind.')
  .option('--query <text>', 'Match against title/uri/message/metadata text.')
  .option('--limit <count>', 'Maximum rows to return (default 50, max 500).', parseIntOption)
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const resolved = await resolveCacheSearchContext(commandOptions);
    const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
    const kind = readStringOption(commandOptions, ['kind']);
    const query = readStringOption(commandOptions, ['query']);
    const limit = readNumberOption(commandOptions, ['limit']);
    const rows = await listCachedArtifacts(resolved.cacheContext, {
      conversationId,
      kind,
      query,
      limit,
    });
    console.log(
      JSON.stringify(
        {
          provider: resolved.provider,
          identityKey: resolved.cacheContext.identityKey,
          filters: {
            conversationId: conversationId ?? null,
            kind: kind ?? null,
            query: query ?? null,
            limit: limit ?? null,
          },
          count: rows.length,
          rows,
        },
        null,
        2,
      ),
    );
  });

const cacheFilesCommand = cacheCommand
  .command('files')
  .description('Inspect cached normalized file-binding catalog.');

cacheFilesCommand
  .command('list')
  .description('List cached file bindings (SQL-first, JSON fallback).')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter to a single conversation ID.')
  .option('--project-id <id>', 'Filter to a single project ID.')
  .option(
    '--dataset <conversation-context|conversation-files|conversation-attachments|project-knowledge|account-files>',
    'Filter by cached dataset type.',
  )
  .option('--query <text>', 'Match against display name/id/url/path text.')
  .option('--limit <count>', 'Maximum rows to return (default 50, max 500).', parseIntOption)
  .option('--resolve-paths', 'Resolve cache-relative local paths to absolute filesystem paths.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const resolved = await resolveCacheSearchContext(commandOptions);
    const dataset = parseCacheFileDataset(readOptionRaw(commandOptions, ['dataset']));
    const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
    const projectId = readStringOption(commandOptions, ['projectId', 'project-id']);
    const query = readStringOption(commandOptions, ['query']);
    const limit = readNumberOption(commandOptions, ['limit']);
    const resolvePaths = Boolean(readOptionRaw(commandOptions, ['resolvePaths', 'resolve-paths']));
    const rows = await listCachedFiles(resolved.cacheContext, {
      conversationId,
      projectId,
      dataset,
      query,
      limit,
      resolvePaths,
    });
    console.log(
      JSON.stringify(
        {
          provider: resolved.provider,
          identityKey: resolved.cacheContext.identityKey,
          filters: {
            conversationId: conversationId ?? null,
            projectId: projectId ?? null,
            dataset: dataset ?? null,
            query: query ?? null,
            limit: limit ?? null,
            resolvePaths,
          },
          count: rows.length,
          rows,
        },
        null,
        2,
      ),
    );
  });

cacheFilesCommand
  .command('resolve')
  .description('Resolve cached file pointers and report missing/orphaned local paths.')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter to a single conversation ID.')
  .option('--project-id <id>', 'Filter to a single project ID.')
  .option(
    '--dataset <conversation-context|conversation-files|conversation-attachments|project-knowledge|account-files>',
    'Filter by cached dataset type.',
  )
  .option('--query <text>', 'Match against display name/id/url/path text.')
  .option('--limit <count>', 'Maximum rows to return (default 50, max 500).', parseIntOption)
  .option('--missing-only', 'Only return rows with missing local files.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const resolved = await resolveCacheSearchContext(commandOptions);
    const dataset = parseCacheFileDataset(readOptionRaw(commandOptions, ['dataset']));
    const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
    const projectId = readStringOption(commandOptions, ['projectId', 'project-id']);
    const query = readStringOption(commandOptions, ['query']);
    const limit = readNumberOption(commandOptions, ['limit']);
    const missingOnly = Boolean(readOptionRaw(commandOptions, ['missingOnly', 'missing-only']));
    const rows = await resolveCachedFiles(resolved.cacheContext, {
      conversationId,
      projectId,
      dataset,
      query,
      limit,
      missingOnly,
    });
    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.pathState === 'local_exists') acc.localExists += 1;
        if (row.pathState === 'missing_local') acc.missingLocal += 1;
        if (row.pathState === 'external_path') acc.externalPath += 1;
        if (row.pathState === 'remote_only') acc.remoteOnly += 1;
        if (row.pathState === 'unknown') acc.unknown += 1;
        return acc;
      },
      {
        total: 0,
        localExists: 0,
        missingLocal: 0,
        externalPath: 0,
        remoteOnly: 0,
        unknown: 0,
      },
    );
    console.log(
      JSON.stringify(
        {
          provider: resolved.provider,
          identityKey: resolved.cacheContext.identityKey,
          filters: {
            conversationId: conversationId ?? null,
            projectId: projectId ?? null,
            dataset: dataset ?? null,
            query: query ?? null,
            limit: limit ?? null,
            missingOnly,
          },
          summary,
          rows,
        },
        null,
        2,
      ),
    );
  });

cacheCommand
  .command('doctor')
  .description('Run cache integrity checks (SQLite + file-pointer health).')
  .option('--provider <chatgpt|gemini|grok>', 'Limit checks to one provider.')
  .option('--identity-key <key>', 'Limit checks to one identity key.')
  .option('--missing-limit <count>', 'Max missing-file rows to include per identity.', parseIntOption, 25)
  .option('--strict', 'Exit non-zero on warnings (not just errors).')
  .option('--json', 'Emit machine-readable JSON report.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const report = await runCacheDoctor(commandOptions);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const entry of report.entries) {
        const sqliteStatus = entry.sqlite?.ok ? 'ok' : 'failed';
        console.log(
          `${entry.provider}/${entry.identityKey}: sqlite=${sqliteStatus}, conversations=${entry.inventorySummary.conversationCount}, messages=${entry.inventorySummary.messageCount}, missingLocal=${entry.filePointerHealth.missingLocalCount}, parity(index->sql=${entry.parity.missingInSqlCount}, sql->index=${entry.parity.missingInIndexCount})`,
        );
        for (const finding of entry.findings) {
          const prefix = finding.severity.toUpperCase();
          console.log(`  [${prefix}] ${finding.check}: ${finding.message}`);
        }
      }
      console.log(
        `Doctor summary: checked=${report.summary.checked}, warnings=${report.summary.warnings}, errors=${report.summary.errors}`,
      );
    }
    const shouldFail = report.summary.errors > 0 || (Boolean(commandOptions.strict) && report.summary.warnings > 0);
    if (shouldFail) {
      process.exit(1);
    }
  });

cacheCommand
  .command('repair')
  .description('Run cache repair actions (dry-run by default).')
  .option('--provider <chatgpt|gemini|grok>', 'Limit repair to one provider.')
  .option('--identity-key <key>', 'Limit repair to one identity key.')
  .option(
    '--actions <list>',
    'Comma-separated actions: sync-sql,rebuild-index,prune-orphan-assets,prune-orphan-source-links,prune-orphan-file-bindings,prune-orphan-artifact-bindings,mark-missing-local,all',
    'all',
  )
  .option('--apply', 'Apply mutations (default: dry-run preview).')
  .option('--yes', 'Confirm mutating repair actions when --apply is set.')
  .option('--json', 'Emit machine-readable JSON report.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;

    if (Boolean(commandOptions.apply) && !Boolean(commandOptions.yes)) {
      throw new Error('Refusing to mutate cache without confirmation. Re-run with --apply --yes.');
    }

    const report = await runCacheRepair(commandOptions);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `Repair mode: ${report.mode}; actions=${report.actions.join(', ')}; targets=${report.summary.checked}`,
      );
      for (const entry of report.entries) {
        console.log(`${entry.provider}/${entry.identityKey}:`);
        for (const action of entry.actions) {
          const status = action.applied ? 'applied' : action.skipped;
          console.log(`  - ${action.name}: ${status} (${action.message})`);
        }
      }
      console.log(
        `Repair summary: touched=${report.summary.touched}, backups=${report.summary.backups}, warnings=${report.summary.warnings}, errors=${report.summary.errors}`,
      );
    }

    if (report.summary.errors > 0) {
      process.exit(1);
    }
  });

cacheCommand
  .command('clear')
  .description('Clear cached datasets (dry-run by default; requires --yes to mutate).')
  .option('--provider <chatgpt|gemini|grok>', 'Limit clear to one provider.')
  .option('--identity-key <key>', 'Limit clear to one identity key.')
  .option(
    '--dataset <all|projects|conversations|context|account-files|conversation-files|conversation-attachments|project-knowledge|project-instructions>',
    'Dataset to clear.',
    'all',
  )
  .option('--older-than <date>', 'Only clear records/files older than this date (YYYY-MM-DD or ISO).')
  .option('--include-blobs', 'Also clear attachment/knowledge file blobs (not only manifests).')
  .option('--yes', 'Apply clear mutations (default is dry-run).')
  .option('--json', 'Emit machine-readable JSON report.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const report = await runCacheClear(commandOptions);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Clear mode: ${report.mode}; dataset=${report.dataset}; targets=${report.summary.checked}`);
      for (const entry of report.entries) {
        console.log(
          `${entry.provider}/${entry.identityKey}: files=${entry.fileTargetsMatched} sqlRows=${entry.sql.cacheEntriesMatched} conversations=${entry.inventoryBefore.conversationCount}->${entry.inventoryAfter.conversationCount} messages=${entry.inventoryBefore.messageCount}->${entry.inventoryAfter.messageCount}`,
        );
      }
      console.log(
        `Clear summary: touched=${report.summary.touched}, warnings=${report.summary.warnings}, errors=${report.summary.errors}`,
      );
    }
    if (report.summary.errors > 0) process.exit(1);
  });

cacheCommand
  .command('compact')
  .description('Compact cache SQLite databases (VACUUM + ANALYZE).')
  .option('--provider <chatgpt|gemini|grok>', 'Limit compact to one provider.')
  .option('--identity-key <key>', 'Limit compact to one identity key.')
  .option('--json', 'Emit machine-readable JSON report.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const report = await runCacheCompact(commandOptions);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const entry of report.entries) {
        console.log(
          `${entry.provider}/${entry.identityKey}: sqlite=${entry.sqliteExists ? 'yes' : 'no'} before=${entry.beforeBytes} after=${entry.afterBytes}`,
        );
      }
      console.log(
        `Compact summary: checked=${report.summary.checked}, compacted=${report.summary.compacted}, warnings=${report.summary.warnings}, errors=${report.summary.errors}`,
      );
    }
    if (report.summary.errors > 0) process.exit(1);
  });

cacheCommand
  .command('cleanup')
  .description('Cleanup stale cache artifacts (dry-run by default; requires --yes to mutate).')
  .option('--provider <chatgpt|gemini|grok>', 'Limit cleanup to one provider.')
  .option('--identity-key <key>', 'Limit cleanup to one identity key.')
  .option('--older-than <date>', 'Cleanup entries/files older than this date (YYYY-MM-DD or ISO).')
  .option(
    '--days <n>',
    `Cleanup entries/files older than N days (default ${DEFAULT_CACHE_CLEANUP_DAYS}, override with profiles.<name>.cache.cleanupDays).`,
    parseIntOption,
  )
  .option('--include-blobs', 'Also cleanup attachment/knowledge file blobs.')
  .option('--yes', 'Apply cleanup mutations (default is dry-run).')
  .option('--json', 'Emit machine-readable JSON report.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const report = await runCacheCleanup(commandOptions);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Cleanup mode: ${report.mode}; cutoff=${report.cutoffIso}; targets=${report.summary.checked}`);
      for (const entry of report.entries) {
        console.log(
          `${entry.provider}/${entry.identityKey}: staleFiles=${entry.clear.fileTargetsMatched} staleSql=${entry.clear.sql.cacheEntriesMatched} conversations=${entry.inventoryBefore.conversationCount}->${entry.inventoryAfter.conversationCount} messages=${entry.inventoryBefore.messageCount}->${entry.inventoryAfter.messageCount} prunedIndex=${entry.indexPruned} prunedBackups=${entry.backupsPruned} prunedBlobs=${entry.blobFilesPruned}`,
        );
      }
      console.log(
        `Cleanup summary: touched=${report.summary.touched}, warnings=${report.summary.warnings}, errors=${report.summary.errors}`,
      );
    }
    if (report.summary.errors > 0) process.exit(1);
  });

program
  .command('delete <id>')
  .alias('remove')
  .description('Delete a conversation (ID or name when supported by the provider).')
  .option('--target <chatgpt|gemini|grok>', 'Choose which provider to use.')
  .option('--project-id <id>', 'Project ID or name (if conversation is in a project).')
  .option('--match <exact|glob|regex>', 'Match mode for conversation names (default exact).')
  .option('--all', 'Delete all matching conversations (otherwise only one match is allowed).')
  .option('--yes', 'Skip confirmation prompt.')
  .option('--history-limit <count>', `Maximum History conversations to fetch (default ${DEFAULT_CACHE_HISTORY_LIMIT}).`)
  .option('--history-since <date>', 'Stop once History entries are older than this date (YYYY-MM-DD or ISO).')
  .action(async (id, commandOptions, command) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
    const llmService = createLlmService(target, userConfig);
    const provider = llmService.provider;

    if (!provider.deleteConversation) {
      console.error(`Delete is not supported for ${target}.`);
      process.exit(1);
    }

    const cacheDefaults = userConfig.browser?.cache;
    const historyLimit =
      (command.getOptionValueSource?.('historyLimit') === 'cli')
        ? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined)
        : cacheDefaults?.historyLimit ?? (commandOptions.historyLimit ? Number.parseInt(commandOptions.historyLimit, 10) : undefined);
    const historySince =
      (command.getOptionValueSource?.('historySince') === 'cli')
        ? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined)
        : cacheDefaults?.historySince ?? (typeof commandOptions.historySince === 'string' && commandOptions.historySince.trim().length > 0
            ? commandOptions.historySince.trim()
            : undefined);

    const listOptions = await llmService.buildListOptions({
      configuredUrl: userConfig.browser?.url ?? null,
      includeHistory: true,
      historyLimit,
      historySince,
    });
    const projectArg = commandOptions.projectId ?? userConfig.browser?.projectId;
    const projectId = projectArg ? await resolveProjectIdArg(llmService, projectArg, listOptions) : undefined;
    const scopedListOptions = projectId ? { ...listOptions, projectId } : listOptions;
    const matchMode = (commandOptions.match ?? 'exact') as string;
    const deleteAll = Boolean(commandOptions.all);
    const skipConfirm = Boolean(commandOptions.yes);

    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const compileRegex = (pattern: string): RegExp => {
      if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        const lastSlash = pattern.lastIndexOf('/');
        const body = pattern.slice(1, lastSlash);
        const flags = pattern.slice(lastSlash + 1) || 'i';
        return new RegExp(body, flags);
      }
      return new RegExp(pattern, 'i');
    };
    const globToRegex = (pattern: string): RegExp => {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const regex = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
      return new RegExp(regex, 'i');
    };

    const pattern = String(id || '');
    const matchId = normalize(pattern);
    const matcher =
      matchMode === 'regex'
        ? compileRegex(pattern)
        : matchMode === 'glob'
          ? globToRegex(pattern)
          : null;
    const directConversationId = matchMode === 'exact' ? llmService.provider.normalizeConversationId?.(pattern) : null;
    const matches = directConversationId
      ? [
          {
            id: directConversationId,
            title: directConversationId,
            provider: target,
            projectId,
            url: llmService.provider.resolveConversationUrl?.(directConversationId, projectId),
          },
        ]
      : (await llmService.listConversations(projectId, scopedListOptions)).filter((item) => {
          const title = normalize(item.title ?? '');
          const idMatch = normalize(item.id) === matchId;
          if (matchMode === 'exact') {
            return idMatch || title === matchId;
          }
          if (!matcher) {
            return idMatch || title === matchId;
          }
          return matcher.test(item.title ?? '') || matcher.test(item.id);
        });

    if (matches.length === 0) {
      console.error(`No conversations matched "${id}".`);
      process.exit(1);
    }

    if (!deleteAll && matches.length > 1) {
      console.error(
        `Multiple conversations matched "${id}". Use --all to delete all matches or refine the pattern.`,
      );
      matches.slice(0, 10).forEach((item) => {
        console.error(`- ${item.title ?? item.id} (${item.id})`);
      });
      process.exit(1);
    }

    const preview = matches.map((item) => `- ${item.title ?? item.id} (${item.id})`).join('\n');
    console.log(`Deleting ${matches.length} conversation(s):\n${preview}`);

    if (!skipConfirm) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    for (const item of matches) {
      console.log(`Deleting conversation ${item.id}...`);
      try {
        await llmService.deleteConversation(item.id, projectId);
      } catch (error) {
        console.error(`Delete failed for ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
    console.log(chalk.green('Deleted successfully.'));

    try {
      const cacheContext = await llmService.resolveCacheContext(scopedListOptions);
      assertCacheIdentity(cacheContext, target);
      const configuredStore = cacheContext.userConfig.browser?.cache?.store;
      const cacheStoreKind: CacheStoreKind =
        configuredStore === 'json' || configuredStore === 'sqlite' || configuredStore === 'dual'
          ? configuredStore
          : 'dual';
      const cacheStore = createCacheStore(cacheStoreKind);
      const existingConversations = await cacheStore.readConversations(cacheContext).catch(() => null);
      for (const item of matches) {
        await cacheStore.writeConversationFiles(cacheContext, item.id, []);
        await cacheStore.writeConversationAttachments(cacheContext, item.id, []);
      }

      console.log('Refreshing conversation cache...');
      let refreshed = await llmService.listConversations(projectId, scopedListOptions);
      const deletedIds = new Set(matches.map((item) => item.id));
      const hadPriorConversationCache = Array.isArray(existingConversations?.items) && existingConversations.items.length > 0;
      if (target === 'gemini' && Array.isArray(refreshed) && refreshed.length === 0 && hadPriorConversationCache) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          const retry = await llmService.listConversations(projectId, {
            ...scopedListOptions,
            includeHistory: true,
          });
          if (!Array.isArray(retry)) {
            continue;
          }
          const deletedStillPresent = retry.some((item) => deletedIds.has(item.id));
          if (retry.length > 0 || !deletedStillPresent) {
            refreshed = retry;
            break;
          }
        }
      }
      if (Array.isArray(refreshed)) {
        await writeConversationCache(cacheContext, refreshed);
        console.log('Conversation cache refreshed.');
      }
    } catch (error) {
      console.warn(`Failed to refresh conversation cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

cacheCommand
  .command('export')
  .description('Export cached project/conversation data.')
  .option('--provider <chatgpt|gemini|grok>', 'Limit export to a provider (chatgpt, gemini, or grok).')
  .option('--scope <projects|conversations|conversation|contexts>', 'Export scope (default conversations).')
  .option('--format <json|md|html|csv|zip>', 'Export format (default json).')
  .option('--project-id <id>', 'Project ID or name for project-scoped exports.')
  .option('--conversation-id <id>', 'Conversation ID for conversation-scoped exports.')
  .option('--out, --output <path>', 'Output directory or zip path (default is timestamped under ~/.auracall/cache/exports).')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const provider =
      (commandOptions.provider ?? userConfig.browser?.target ?? 'chatgpt').toString().trim();
    if (!isCacheCliProvider(provider)) {
      throw new Error(`Invalid provider "${provider}". Use "chatgpt", "gemini", or "grok".`);
    }

    const scope =
      typeof commandOptions.scope === 'string' && commandOptions.scope.trim().length > 0
        ? commandOptions.scope.trim()
        : 'conversations';
    const format =
      typeof commandOptions.format === 'string' && commandOptions.format.trim().length > 0
        ? commandOptions.format.trim()
        : 'json';
    if (!['projects', 'conversations', 'conversation', 'contexts'].includes(scope)) {
      throw new Error('scope must be projects, conversations, conversation, or contexts.');
    }
    if (!['json', 'md', 'html', 'csv', 'zip'].includes(format)) {
      throw new Error('format must be json, md, html, csv, or zip.');
    }

    const { llmService, listOptions, cacheContext } = await resolveCacheOperatorContext({
      provider,
      userConfig,
      identityPrompt: promptForCacheIdentity,
    });
    const projectSelector = readStringOption(commandOptions, ['projectId', 'project-id']);
    const conversationSelector = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
    let resolvedProjectId: string | undefined;
    if (projectSelector) {
      resolvedProjectId = await resolveProjectIdArg(llmService, projectSelector, listOptions);
    }
    const exportRoot = path.join(getAuracallHomeDir(), 'cache', 'exports');
    const defaultDir = path.join(
      exportRoot,
      provider,
      cacheContext.identityKey,
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
    const requestedOutput = (commandOptions.out ?? commandOptions.output) as string | undefined;
    const outputDir = requestedOutput ? String(requestedOutput) : defaultDir;

    const { runCacheExport } = await import('../src/browser/llmService/cache/export.js');
    const result = await runCacheExport(cacheContext, {
      format: format as 'json' | 'md' | 'html' | 'csv' | 'zip',
      scope: scope as 'projects' | 'conversations' | 'conversation' | 'contexts',
      projectId: resolvedProjectId ?? undefined,
      conversationId: conversationSelector,
      outputDir,
    });

    if (format === 'zip') {
      console.log(`Exported ${result.entries} entries to ${result.outputPath}`);
    } else {
      console.log(`Exported ${result.entries} entries into ${result.outputPath}`);
    }
  });

const cacheContextCommand = cacheCommand
  .command('context')
  .description('Read cached conversation contexts for agents and local workflows.');

cacheContextCommand
  .command('list')
  .description('List cached conversation context IDs.')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--limit <count>', 'Maximum rows to return (default: all).', parseIntOption)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.')
  .action(async (...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    };
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const provider = (commandOptions.provider ?? userConfig.browser?.target ?? 'chatgpt').toString().trim();
    if (!isCacheCliProvider(provider)) {
      throw new Error(`Invalid provider "${provider}". Use "chatgpt", "gemini", or "grok".`);
    }
    const { llmService, listOptions } = await resolveCacheOperatorContext({
      provider,
      userConfig,
      identityPrompt: promptForCacheIdentity,
    });
    const entries = await llmService.listCachedConversationContexts({
      listOptions,
      cacheResolve: { prompt: false, detect: false },
    });
    const limit =
      typeof commandOptions.limit === 'number' && Number.isFinite(commandOptions.limit)
        ? Math.max(0, Math.trunc(commandOptions.limit))
        : null;
    const visibleEntries = limit === null ? entries : limit > 0 ? entries.slice(0, limit) : [];
    const payload = visibleEntries.map((entry) => ({
      conversationId: entry.conversationId,
      updatedAt: entry.updatedAt,
      path: entry.path,
    }));
    console.log(JSON.stringify(payload, null, 2));
  });

cacheContextCommand
  .command('get <id>')
  .description('Read a cached conversation context by ID or cached title.')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--out, --output <path>', 'Optional output path for JSON payload.')
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.')
  .action(async (id, ...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const provider = (commandOptions.provider ?? userConfig.browser?.target ?? 'chatgpt').toString().trim();
    if (!isCacheCliProvider(provider)) {
      throw new Error(`Invalid provider "${provider}". Use "chatgpt", "gemini", or "grok".`);
    }
    const { llmService, listOptions } = await resolveCacheOperatorContext({
      provider,
      userConfig,
      identityPrompt: promptForCacheIdentity,
    });
    const result = await llmService.getCachedConversationContext(String(id || '').trim(), {
      listOptions,
      cacheResolve: { prompt: false, detect: false },
    });
    const payload = {
      conversationId: result.conversationId,
      provider,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      context: result.context,
      terminalReceipt: result.terminalReceipt,
    };
    const requestedOutput = (commandOptions.out ?? commandOptions.output) as string | undefined;
    if (typeof requestedOutput === 'string' && requestedOutput.trim().length > 0) {
      const outputPath = path.resolve(requestedOutput.trim());
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`Wrote cached context to ${outputPath}`);
      return;
    }
    console.log(JSON.stringify(payload, null, 2));
  });

cacheContextCommand
  .command('search <query>')
  .description('Keyword search cached conversation contexts.')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter search to one conversation ID.')
  .option('--role <user|assistant|system|source>', 'Filter to a specific message role.')
  .option('--limit <count>', 'Maximum hits to return (default 20, max 200).', parseIntOption)
  .action(async (query, ...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    await runCacheContextKeywordSearch(String(query ?? ''), commandOptions);
  });

cacheContextCommand
  .command('semantic-search <query>')
  .description('Embedding-based semantic search over cached conversation contexts.')
  .option('--provider <chatgpt|gemini|grok>', 'Choose provider cache to inspect (chatgpt, gemini, or grok).')
  .option('--conversation-id <id>', 'Filter search to one conversation ID.')
  .option('--role <user|assistant|system|source>', 'Filter to a specific message role.')
  .option('--limit <count>', 'Maximum hits to return (default 20, max 200).', parseIntOption)
  .option('--model <id>', 'Embedding model (default text-embedding-3-small).')
  .option('--max-chunks <count>', 'Maximum chunks to embed/score (default 400).', parseIntOption)
  .option('--min-score <value>', 'Minimum cosine score threshold (-1..1).', parseFloatOption)
  .option('--openai-api-key <key>', 'Override OPENAI_API_KEY for this command.')
  .option('--openai-base-url <url>', 'Override embeddings API base URL (default https://api.openai.com/v1).')
  .action(async (query, ...args) => {
    const command = args[args.length - 1] as { opts?: () => OptionValues; parent?: { opts?: () => OptionValues } };
    const localOptions =
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      typeof (args[0] as { opts?: unknown }).opts !== 'function'
        ? (args[0] as OptionValues)
        : {};
    const commandOptions = {
      ...(typeof command?.parent?.opts === 'function' ? command.parent.opts() : {}),
      ...(typeof command?.opts === 'function' ? command.opts() : {}),
      ...localOptions,
    } as OptionValues;
    await runCacheContextSemanticSearch(String(query ?? ''), commandOptions);
  });

program
  .command('doctor')
  .description('Inspect local browser-profile state and verify that the browser UI matches the expected selectors.')
  .option('--target <chatgpt|grok|gemini>', 'Choose which provider to inspect (chatgpt, grok, or gemini).')
  .option('--local-only', 'Inspect managed browser profile/bootstrap/browser-state only; do not attach to Chrome.')
  .option('--prune-browser-state', 'Remove dead entries from ~/.auracall/browser-state.json before reporting.')
  .option('--save-snapshot', 'Save a semantic snapshot of the page even if checks pass.')
  .option('--prepare-composer', 'Prepare and verify the ChatGPT composer without inserting or sending a prompt.')
  .option('--target-url <url>', 'Open or attach to this exact ChatGPT URL before preparing the composer.')
  .option('--chatgpt-mode <chat|work>', 'Composer mode to select for --prepare-composer.', 'chat')
  .option('--desired-model <label>', 'Chat model label to select for --prepare-composer.')
  .option('--work-model <label>', 'Work model label to select for --prepare-composer.')
  .addOption(
    new Option(
      '--operation-timeout <seconds|auto>',
      'Bound browser doctor probes so attach/readiness stalls return a diagnostic.',
    )
      .argParser(parseTimeoutOption)
      .default('60'),
  )
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok' | 'gemini';
    if (target !== 'chatgpt' && target !== 'grok' && target !== 'gemini') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "grok", or "gemini".`);
    }
    const {
      collectBrowserFeatureRuntime,
      inspectBrowserDoctorState,
      inspectBrowserDoctorIdentity,
      inspectBrowserDoctorFeatures,
      createAuracallBrowserDoctorContract,
      reconcileBrowserDoctorIdentities,
      withBrowserProbeOperation,
    } = await import('../src/browser/profileDoctor.js');
    const localReport = await inspectBrowserDoctorState(userConfig, {
      target,
      pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
    });
    let operation: import('../packages/browser-service/src/service/operationDispatcher.js').BrowserOperationRecord | null = null;
    let identityStatus: Awaited<ReturnType<typeof inspectBrowserDoctorIdentity>> | null = null;
    let browserTools: Awaited<ReturnType<typeof collectBrowserFeatureRuntime>>['browserTools'] = null;
    let browserToolsError: string | null = null;
    let runtimeBlockingState: any = null;
    let featureStatus: Awaited<ReturnType<typeof inspectBrowserDoctorFeatures>> | null = null;
    let promptWorkbench: Awaited<ReturnType<BrowserAutomationClient['preparePromptWorkbench']>> | null = null;
    let promptWorkbenchError: string | null = null;
    let selectorDiagnosis: any = null;
    let selectorDiagnosisError: string | null = null;

    if (!commandOptions.localOnly) {
      try {
        await withBrowserCliOperationTimeout(
          withBrowserProbeOperation(target, localReport, 'doctor', async (activeOperation) => {
            operation = activeOperation;
            identityStatus = await inspectBrowserDoctorIdentity(userConfig, {
              target,
              localReport,
            });
            if (identityStatus.error) {
              selectorDiagnosisError = identityStatus.error;
              browserToolsError = identityStatus.error;
              return;
            }
            if (commandOptions.json) {
              const runtime = await collectBrowserFeatureRuntime(target, localReport);
              browserTools = runtime.browserTools;
              browserToolsError = runtime.browserToolsError;
            }
            runtimeBlockingState = browserTools?.report?.pageProbe?.blockingState ?? null;
            featureStatus = await inspectBrowserDoctorFeatures(userConfig, {
              target,
              localReport,
              browserTools,
            });

            if (commandOptions.prepareComposer) {
              if (target !== 'chatgpt') {
                promptWorkbenchError = '--prepare-composer is currently supported only for ChatGPT.';
              } else {
                try {
                  const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
                  promptWorkbench = await client.preparePromptWorkbench({
                    targetUrl: commandOptions.targetUrl ?? null,
                    chatgptMode: commandOptions.chatgptMode,
                    desiredModel: commandOptions.desiredModel ?? null,
                    workModel: commandOptions.workModel ?? null,
                    modelStrategy: 'select',
                  });
                } catch (error) {
                  promptWorkbenchError = error instanceof Error ? error.message : String(error);
                }
              }
            }

            if (target !== 'gemini' && !runtimeBlockingState?.requiresHuman) {
              try {
                const client = await BrowserAutomationClient.fromConfig(userConfig, { target });
                selectorDiagnosis = await client.diagnose({
                  basePath: process.cwd(),
                  saveSnapshot: Boolean(commandOptions.saveSnapshot),
                  quiet: Boolean(commandOptions.json),
                });
              } catch (error) {
                selectorDiagnosisError = error instanceof Error ? error.message : String(error);
              }
            }
          }),
          resolveBrowserCliOperationTimeoutMs(commandOptions.operationTimeout),
          `${target} doctor browser probe`,
        );
      } catch (error) {
        selectorDiagnosisError = error instanceof Error ? error.message : String(error);
        browserToolsError ??= selectorDiagnosisError;
      }
    }

    if (commandOptions.json) {
      const contract = createAuracallBrowserDoctorContract({
        target,
        localReport,
        identityStatus,
        identityReconciliation: reconcileBrowserDoctorIdentities(userConfig, target, localReport, identityStatus),
        featureStatus,
        promptWorkbench,
        promptWorkbenchError,
        operation,
        browserTools,
        browserToolsError,
        selectorDiagnosis,
        selectorDiagnosisError,
      });
      console.log(JSON.stringify(contract, null, 2));
      if (
        selectorDiagnosisError ||
        promptWorkbenchError ||
        (selectorDiagnosis && !selectorDiagnosis.report.allPassed) ||
        runtimeBlockingState?.requiresHuman
      ) {
        process.exit(1);
      }
      return;
    }

    printLocalBrowserDoctorReport(localReport, {
      identityStatus,
      identityReconciliation: reconcileBrowserDoctorIdentities(userConfig, target, localReport, identityStatus),
      featureStatus,
      browserTools,
      browserToolsError,
    });

    if (commandOptions.prepareComposer) {
      if (promptWorkbenchError) {
        console.error(`Composer preparation failed: ${promptWorkbenchError}`);
        process.exit(1);
      }
      const preparedWorkbench = promptWorkbench as
        | Awaited<ReturnType<BrowserAutomationClient['preparePromptWorkbench']>>
        | null;
      if (preparedWorkbench) {
        console.log(
          `- promptWorkbench: ${preparedWorkbench.chatgptMode} / ${preparedWorkbench.model ?? preparedWorkbench.modelSelectionKind}`,
        );
      }
    }

    if (commandOptions.localOnly) {
      return;
    }
    if (runtimeBlockingState?.requiresHuman) {
      process.exitCode = 1;
      if (target !== 'gemini') {
        console.log('- selectorDiagnosis: (skipped because the selected page is blocked and requires manual clearance)');
      }
      return;
    }
    if (target === 'gemini') {
      console.log('- selectorDiagnosis: (not implemented for gemini yet)');
      return;
    }

    if (selectorDiagnosisError) {
      console.error(`Failed to connect or diagnose: ${selectorDiagnosisError}`);
      process.exit(1);
    }

    if (!selectorDiagnosis) {
      return;
    }
    const { report, port } = selectorDiagnosis;

    console.log(`Diagnosed ${target} via port ${port}.`);
    console.log(`\nDiagnosis for ${report.url}:`);
    const tableData = report.checks.map((c: any) => ({
      Component: c.name,
      Status: c.matched ? '✅ PASS' : '❌ FAIL',
      Matches: c.matchCount,
      Selector: c.matchedSelector || c.selectors[0],
    }));

    if (process.stdout.isTTY) {
      console.table(tableData);
    } else {
      console.log(JSON.stringify(tableData, null, 2));
    }

    if (report.snapshotPath) {
      console.log(`\nSnapshot saved to: ${report.snapshotPath}`);
    }

    if (!report.allPassed) {
      console.error('\nSome selectors failed to match. The UI structure may have changed.');
      process.exit(1);
    }
  });

async function runChatgptDeveloperAppsCliAction(
  command: Command,
  buildInput: (options: OptionValues) => ChatgptDeveloperAppOperationInput,
): Promise<void> {
  const parentOptions =
    typeof command.parent?.opts === 'function' ? (command.parent.opts() as OptionValues) : ({} as OptionValues);
  const ownOptions = typeof command.opts === 'function' ? (command.opts() as OptionValues) : ({} as OptionValues);
  const commandOptions = {
    ...(program.opts?.() ?? {}),
    ...parentOptions,
    ...ownOptions,
  } as OptionValues;
  if (commandOptions.target && commandOptions.target !== 'chatgpt') {
    throw new Error('Developer app lifecycle currently supports --target chatgpt only.');
  }
  const userConfig = await resolveConfig(commandOptions, process.cwd(), process.env);
  const dispatcher = createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const input = buildInput(commandOptions);
  const acquired = await dispatcher.acquire({
    managedProfileDir: resolveManagedProfileDirForUserConfig(userConfig, 'chatgpt'),
    serviceTarget: 'chatgpt',
    kind: 'browser-tools',
    operationClass: input.action === 'list' || (input.action === 'test' && !input.submit)
      ? 'exclusive-probe'
      : 'exclusive-mutating',
    ownerCommand: `apps:${input.action}`,
  });
  if (!acquired.acquired) {
    throw new Error(formatBrowserOperationBusyResult(acquired));
  }
  let receiptEmitted = false;
  try {
    const result = await runChatgptDeveloperAppOperationForCli(userConfig, input, { browserOperationOwned: true });
    if (result.action !== 'list' && result.status === 'failed') process.exitCode = 1;
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      receiptEmitted = true;
      return;
    }
    console.log(formatChatgptDeveloperAppOperationResult(result));
    receiptEmitted = true;
  } finally {
    await acquired.release();
    if (receiptEmitted) await exitAfterCompletedDeveloperAppCommand();
  }
}

async function exitAfterCompletedDeveloperAppCommand(): Promise<void> {
  // Completed one-shot app commands must not wait for retained browser/CDP
  // handles. Custody is released before this boundary; flush the full receipt
  // and diagnostics before exiting with the operation's actual status.
  await Promise.all([
    new Promise<void>((resolve, reject) => process.stdout.write('', (error) => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => process.stderr.write('', (error) => error ? reject(error) : resolve())),
  ]);
  process.exit(process.exitCode ?? 0);
}

async function runChatgptSkillsCliAction(
  command: Command,
  buildInput: (options: OptionValues) => Promise<ChatgptSkillOperationInput> | ChatgptSkillOperationInput,
): Promise<void> {
  const parentOptions =
    typeof command.parent?.opts === 'function' ? (command.parent.opts() as OptionValues) : ({} as OptionValues);
  const ownOptions = typeof command.opts === 'function' ? (command.opts() as OptionValues) : ({} as OptionValues);
  const commandOptions = {
    ...(program.opts?.() ?? {}),
    ...parentOptions,
    ...ownOptions,
  } as OptionValues;
  if (commandOptions.target && commandOptions.target !== 'chatgpt') {
    throw new Error('Skill lifecycle currently supports --target chatgpt only.');
  }
  const input = await buildInput(commandOptions);
  const userConfig = await resolveConfig(commandOptions, process.cwd(), process.env);
  const dispatcher = createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const acquired = await dispatcher.acquire({
    managedProfileDir: resolveManagedProfileDirForUserConfig(userConfig, 'chatgpt'),
    serviceTarget: 'chatgpt',
    kind: 'browser-tools',
    operationClass: input.action === 'list' || input.action === 'show'
      ? 'exclusive-probe'
      : 'exclusive-mutating',
    ownerCommand: `skills:${input.action}`,
  });
  if (!acquired.acquired) throw new Error(formatBrowserOperationBusyResult(acquired));
  try {
    const result = await runChatgptSkillOperationForCli(userConfig, input);
    console.log(commandOptions.json ? JSON.stringify(result, null, 2) : formatChatgptSkillOperationResult(result));
  } finally {
    await acquired.release();
  }
}

const skillsCommand = program
  .command('skills')
  .description('Inventory and operate guarded ChatGPT Skills.')
  .option('--target <chatgpt>', 'Provider target (currently chatgpt only).', 'chatgpt');

skillsCommand
  .command('list')
  .description('List ChatGPT Skills by exact account without mutation.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    await runChatgptSkillsCliAction(this, (options) => ({
      action: 'list',
      expectedAccount: String(options.expectedAccount ?? ''),
    }));
  });

skillsCommand
  .command('show <skill-id>')
  .description('Read one ChatGPT Skill by its exact 32-hex ID.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, skillId: string) {
    await runChatgptSkillsCliAction(this, (options) => ({
      action: 'show',
      skillId,
      expectedAccount: String(options.expectedAccount ?? ''),
    }));
  });

skillsCommand
  .command('select <skill-id>')
  .description('Select one exact ChatGPT Skill through Try in chat without submitting a prompt.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--yes', 'Confirm the bounded non-submitting selection.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, skillId: string) {
    await runChatgptSkillsCliAction(this, (options) => ({
      action: 'select',
      skillId,
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

skillsCommand
  .command('run <skill-id>')
  .description('Reject Chat-mode execution of user-added Skills before browser launch or Send; Work-mode testing is deferred.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .requiredOption('-p, --prompt <text>', 'Prompt to submit once with the selected Skill (maximum 32000 characters).')
  .option('--response-timeout <seconds>', 'Response capture timeout, 1 to 600 seconds.', '300')
  .option('--yes', 'Confirm one prompt submission; uncertain sends are never retried.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, skillId: string) {
    await runChatgptSkillsCliAction(this, (options) => ({
      action: 'run', skillId,
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
      prompt: String(options.prompt ?? ''),
      timeoutMs: Number(options.responseTimeout) * 1000,
    }));
  });

skillsCommand
  .command('create')
  .description('Create one ChatGPT Skill from a deterministic SKILL.md source.')
  .requiredOption('--source <path>', 'SKILL.md file or directory containing SKILL.md.')
  .requiredOption('--name <name>', 'Skill display name.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--description <text>', 'Skill description.')
  .option('--yes', 'Confirm creation.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    await runChatgptSkillsCliAction(this, async (options) => ({
      action: 'create',
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
      source: await loadChatgptSkillSource({
        sourcePath: String(options.source ?? ''),
        name: String(options.name ?? ''),
        description: typeof options.description === 'string' ? options.description : null,
      }),
    }));
  });

skillsCommand
  .command('update <skill-id>')
  .description('Update one exact ChatGPT Skill with an optimistic prior-hash guard.')
  .requiredOption('--source <path>', 'Replacement SKILL.md file or directory containing SKILL.md.')
  .requiredOption('--name <name>', 'Replacement skill display name.')
  .requiredOption('--expected-hash <sha256>', 'Exact previously observed SKILL.md SHA-256.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--description <text>', 'Replacement skill description.')
  .option('--yes', 'Confirm update.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, skillId: string) {
    await runChatgptSkillsCliAction(this, async (options) => ({
      action: 'update',
      skillId,
      expectedHash: String(options.expectedHash ?? ''),
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
      source: await loadChatgptSkillSource({
        sourcePath: String(options.source ?? ''),
        name: String(options.name ?? ''),
        description: typeof options.description === 'string' ? options.description : null,
      }),
    }));
  });

skillsCommand
  .command('delete <skill-id>')
  .description('Permanently delete one exact ChatGPT Skill and prove absence.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--yes', 'Confirm exact permanent deletion.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, skillId: string) {
    await runChatgptSkillsCliAction(this, (options) => ({
      action: 'delete',
      skillId,
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

const appsCommand = program
  .command('apps')
  .description('Inventory and operate guarded ChatGPT developer apps.')
  .option('--target <chatgpt>', 'Provider target (currently chatgpt only).', 'chatgpt');

appsCommand
  .command('list')
  .description('List installed apps, connection state, and Developer mode without mutation.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    await runChatgptDeveloperAppsCliAction(this, () => ({ action: 'list' }));
  });

appsCommand
  .command('create')
  .description('Create a ChatGPT developer app from an MCP endpoint.')
  .requiredOption('--name <name>', 'Developer app display name.')
  .requiredOption('--server-url <url>', 'MCP server URL.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--description <text>', 'Developer app description.')
  .option('--auth <oauth|none|mixed>', 'Authentication mechanism.', 'oauth')
  .option('--connection <server-url|tunnel>', 'Connection mode.', 'server-url')
  .option('--yes', 'Confirm creation and any resulting OAuth handoff.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    await runChatgptDeveloperAppsCliAction(this, (options) => ({
      action: 'create',
      name: String(options.name ?? ''),
      serverUrl: String(options.serverUrl ?? ''),
      description: typeof options.description === 'string' ? options.description : null,
      auth: String(options.auth ?? 'oauth') as ChatgptDeveloperAppAuth,
      connection: String(options.connection ?? 'server-url') as 'server-url' | 'tunnel',
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

appsCommand
  .command('refresh <app>')
  .description('Delete and recreate one exact ChatGPT developer app from an MCP endpoint.')
  .requiredOption('--server-url <url>', 'Replacement MCP server URL.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--description <text>', 'Replacement developer app description.')
  .option('--auth <oauth|none|mixed>', 'Replacement authentication mechanism.', 'oauth')
  .option('--connection <server-url|tunnel>', 'Replacement connection mode.', 'server-url')
  .option('--yes', 'Confirm exact deletion and recreation.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, app: string) {
    await runChatgptDeveloperAppsCliAction(this, (options) => ({
      action: 'refresh',
      app,
      serverUrl: String(options.serverUrl ?? ''),
      description: typeof options.description === 'string' ? options.description : null,
      auth: String(options.auth ?? 'oauth') as ChatgptDeveloperAppAuth,
      connection: String(options.connection ?? 'server-url') as 'server-url' | 'tunnel',
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

appsCommand
  .command('test <app>')
  .description('Select-test an app, or submit one explicitly confirmed test prompt.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--submit', 'Submit the test prompt after selecting the app.', false)
  .option('--prompt <text>', 'Prompt to submit when --submit is used.')
  .option('--yes', 'Confirm prompt submission.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, app: string) {
    await runChatgptDeveloperAppsCliAction(this, (options) => ({
      action: 'test',
      app,
      submit: Boolean(options.submit),
      modelStrategy: program.getOptionValueSource?.('browserModelStrategy') === 'cli'
        ? options.browserModelStrategy as 'select' | 'current' | 'ignore' : undefined,
      prompt: typeof options.prompt === 'string' ? options.prompt : null,
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

appsCommand
  .command('uninstall <app>')
  .description('Uninstall one exact ChatGPT developer app.')
  .requiredOption('--expected-account <email>', 'Exact ChatGPT account expected in the managed browser.')
  .option('--yes', 'Confirm uninstall.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command, app: string) {
    await runChatgptDeveloperAppsCliAction(this, (options) => ({
      action: 'uninstall',
      app,
      expectedAccount: String(options.expectedAccount ?? ''),
      confirmed: Boolean(options.yes),
    }));
  });

program
  .command('capabilities')
  .description('Report current provider workbench capabilities for CLI/API/MCP planning.')
  .option('--target <chatgpt|grok|gemini>', 'Choose which provider to inspect (chatgpt, grok, or gemini).')
  .option('--provider <chatgpt|grok|gemini>', 'Alias for --target.')
  .option(
    '--category <category>',
    'Filter by category: research, media, canvas, connector, skill, app, search, file, or other.',
  )
  .option('--available-only', 'Hide blocked and not-visible capabilities.', false)
  .option('--static', 'Use the static catalog only; do not attach to a managed browser.', false)
  .option('--diagnostics <browser-state>', 'Include bounded browser-state diagnostics for the selected provider.')
  .option('--entrypoint <grok-imagine>', 'Open or reuse a known provider workbench entrypoint before read-only discovery.')
  .option('--discovery-action <action>', 'Run an explicit read-only provider discovery action such as grok-imagine-video-mode.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof this.opts === 'function' ? this.opts() : {}),
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const selectedProvider = normalizeWorkbenchCapabilityProvider(commandOptions.provider ?? commandOptions.target);
    const shouldUseBrowserDiscovery =
      !commandOptions.static &&
      (selectedProvider === 'gemini' || selectedProvider === 'chatgpt' || selectedProvider === 'grok');
    let reporter = createWorkbenchCapabilityService();

    if (shouldUseBrowserDiscovery) {
      const {
        inspectBrowserDoctorState,
        withBrowserProbeOperation,
      } = await import('../src/browser/profileDoctor.js');
      const browserTarget = selectedProvider === 'chatgpt' ? 'chatgpt' : selectedProvider === 'grok' ? 'grok' : 'gemini';
      const localReport = await inspectBrowserDoctorState(userConfig, { target: browserTarget });
      reporter = createWorkbenchCapabilityService({
        discoverCapabilities: async (request) => {
          let capabilities: Awaited<ReturnType<ReturnType<typeof createBrowserWorkbenchCapabilityDiscovery>>> = [];
          await withBrowserProbeOperation(browserTarget, localReport, 'features', async () => {
            capabilities = await createBrowserWorkbenchCapabilityDiscovery(userConfig)(request);
          });
          return capabilities;
        },
        diagnoseCapabilities: createBrowserWorkbenchCapabilityDiagnostics(userConfig),
      });
    }

    const report = await buildWorkbenchCapabilityReportForCli(reporter, {
      provider: selectedProvider,
      category: commandOptions.category,
      availableOnly: commandOptions.availableOnly,
      runtimeProfile: userConfig.auracallProfile ?? 'default',
      diagnostics: commandOptions.diagnostics,
      entrypoint: commandOptions.entrypoint,
      discoveryAction: commandOptions.discoveryAction,
    });

    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatWorkbenchCapabilityReport(report));
  });

program
  .command('library-files')
  .description('List usable ChatGPT Library files with stable provider IDs.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...(typeof this.opts === 'function' ? this.opts() : {}),
    } as OptionValues;
    const userConfig = await resolveConfig(commandOptions, process.cwd(), process.env);
    const controller = new AbortController();
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const signal of signals) {
      const handler = () => controller.abort(new ChatgptLibraryFilesCancelledError(signal));
      handlers.set(signal, handler);
      process.once(signal, handler);
    }
    try {
      const result = await runChatgptLibraryFilesCommandForCli(userConfig, {
        abortSignal: controller.signal,
        json: Boolean(commandOptions.json),
      });
      const output = result.stream === 'stdout' ? process.stdout : process.stderr;
      await new Promise<void>((resolve, reject) => {
        output.write(`${result.output}\n`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    } finally {
      for (const signal of signals) {
        const handler = handlers.get(signal);
        if (handler) process.removeListener(signal, handler);
      }
    }
    exitAfterCompletedBrowserProbeCommand();
  });

const featuresCommand = program
  .command('features')
  .description('Discover live browser-provider tools, modes, toggles, and related feature evidence.')
  .option('--target <chatgpt|grok|gemini>', 'Choose which provider to inspect (chatgpt, grok, or gemini).')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    const parentOptions =
      typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
    const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...parentOptions,
      ...ownOptions,
      target: (ownOptions.target ?? parentOptions.target) as OptionValues['target'],
      json: Boolean(parentOptions.json || ownOptions.json),
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok' | 'gemini';
    if (target !== 'chatgpt' && target !== 'grok' && target !== 'gemini') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "grok", or "gemini".`);
    }
    const {
      collectBrowserFeatureRuntime,
      createAuracallBrowserFeaturesContract,
      inspectBrowserDoctorState,
      inspectBrowserFeatures,
      withBrowserProbeOperation,
    } = await import('../src/browser/profileDoctor.js');
    const localReport = await inspectBrowserDoctorState(userConfig, { target });
    let operation: import('../packages/browser-service/src/service/operationDispatcher.js').BrowserOperationRecord | null = null;
    let runtime: Awaited<ReturnType<typeof collectBrowserFeatureRuntime>> = {
      browserTools: null,
      browserToolsError: null,
    };
    let featureStatus = null;
    await withBrowserProbeOperation(target, localReport, 'features', async (activeOperation) => {
      operation = activeOperation;
      runtime = await collectBrowserFeatureRuntime(target, localReport);
      featureStatus = await inspectBrowserFeatures(userConfig, {
        target,
        localReport,
        browserTools: runtime.browserTools,
      });
    });

    if (commandOptions.json) {
      const contract = createAuracallBrowserFeaturesContract({
        target,
        featureStatus,
        operation,
        browserTools: runtime.browserTools,
        browserToolsError: runtime.browserToolsError,
      });
      console.log(JSON.stringify(contract, null, 2));
      if (runtime.browserTools?.report?.pageProbe?.blockingState?.requiresHuman) {
        process.exitCode = 1;
      }
      return;
    }

    printBrowserFeatureDiscoveryReport(target, featureStatus, {
      browserTools: runtime.browserTools,
      browserToolsError: runtime.browserToolsError,
    });
    if (runtime.browserTools?.report?.pageProbe?.blockingState?.requiresHuman) {
      process.exitCode = 1;
    }
  });

featuresCommand
  .command('snapshot')
  .description('Capture a live provider feature snapshot and save it under ~/.auracall/feature-snapshots.')
  .option('--target <chatgpt|grok|gemini>', 'Choose which provider to inspect (chatgpt, grok, or gemini).')
  .option('--label <label>', 'Optional snapshot label to append to the saved file name.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    const parentOptions =
      typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
    const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...parentOptions,
      ...ownOptions,
      target: (ownOptions.target ?? parentOptions.target) as OptionValues['target'],
      label: (ownOptions.label ?? parentOptions.label) as OptionValues['label'],
      json: Boolean(parentOptions.json || ownOptions.json),
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok' | 'gemini';
    if (target !== 'chatgpt' && target !== 'grok' && target !== 'gemini') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "grok", or "gemini".`);
    }
    const {
      collectBrowserFeatureRuntime,
      createAuracallBrowserFeaturesContract,
      inspectBrowserDoctorState,
      inspectBrowserFeatures,
      withBrowserProbeOperation,
    } = await import('../src/browser/profileDoctor.js');
    const localReport = await inspectBrowserDoctorState(userConfig, { target });
    let operation: import('../packages/browser-service/src/service/operationDispatcher.js').BrowserOperationRecord | null = null;
    let runtime: Awaited<ReturnType<typeof collectBrowserFeatureRuntime>> = {
      browserTools: null,
      browserToolsError: null,
    };
    let featureStatus = null;
    await withBrowserProbeOperation(target, localReport, 'features', async (activeOperation) => {
      operation = activeOperation;
      runtime = await collectBrowserFeatureRuntime(target, localReport);
      featureStatus = await inspectBrowserFeatures(userConfig, {
        target,
        localReport,
        browserTools: runtime.browserTools,
      });
    });
    const runtimeBlockingState = getRuntimeBlockingState(runtime.browserTools);
    if (runtimeBlockingState?.requiresHuman) {
      if (commandOptions.json) {
        console.log(
          JSON.stringify(
            {
              target,
              error: runtimeBlockingState.summary ?? 'Blocking page requires manual clearance.',
              blockingState: runtimeBlockingState,
              browserToolsError: runtime.browserToolsError,
            },
            null,
            2,
          ),
        );
      } else {
        printBlockingStateGuidance(runtimeBlockingState, {
          prefix: `Cannot snapshot ${target} features while the selected page is blocked`,
        });
      }
      process.exitCode = 1;
      return;
    }
    const contract = createAuracallBrowserFeaturesContract({
      target,
      featureStatus,
      operation,
      browserTools: runtime.browserTools,
      browserToolsError: runtime.browserToolsError,
    });
    const snapshot = await writeBrowserFeaturesSnapshot(contract, {
      auracallProfile: userConfig.auracallProfile ?? 'default',
      label: typeof commandOptions.label === 'string' ? commandOptions.label : null,
    });
    if (commandOptions.json) {
      console.log(
        JSON.stringify(
          {
            target,
            snapshot,
            contract,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(`Saved feature snapshot for ${target} to ${snapshot.snapshotPath}`);
    console.log(`Updated latest snapshot at ${snapshot.latestPath}`);
  });

featuresCommand
  .command('diff')
  .description('Compare live provider features against the latest saved feature snapshot.')
  .option('--target <chatgpt|grok|gemini>', 'Choose which provider to inspect (chatgpt, grok, or gemini).')
  .option('--snapshot <path>', 'Optional explicit baseline snapshot path (defaults to latest.json for the active AuraCall runtime profile).')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async function (this: Command) {
    const parentOptions =
      typeof this.parent?.opts === 'function' ? (this.parent.opts() as OptionValues) : ({} as OptionValues);
    const ownOptions = typeof this.opts === 'function' ? (this.opts() as OptionValues) : ({} as OptionValues);
    const commandOptions = {
      ...(program.opts?.() ?? {}),
      ...parentOptions,
      ...ownOptions,
      target: (ownOptions.target ?? parentOptions.target) as OptionValues['target'],
      snapshot: (ownOptions.snapshot ?? parentOptions.snapshot) as OptionValues['snapshot'],
      json: Boolean(parentOptions.json || ownOptions.json),
    } as OptionValues;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = (commandOptions.target ?? userConfig.browser?.target ?? 'chatgpt') as 'chatgpt' | 'grok' | 'gemini';
    if (target !== 'chatgpt' && target !== 'grok' && target !== 'gemini') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt", "grok", or "gemini".`);
    }
    const {
      collectBrowserFeatureRuntime,
      createAuracallBrowserFeaturesContract,
      inspectBrowserDoctorState,
      inspectBrowserFeatures,
      withBrowserProbeOperation,
    } = await import('../src/browser/profileDoctor.js');
    const localReport = await inspectBrowserDoctorState(userConfig, { target });
    let operation: import('../packages/browser-service/src/service/operationDispatcher.js').BrowserOperationRecord | null = null;
    let runtime: Awaited<ReturnType<typeof collectBrowserFeatureRuntime>> = {
      browserTools: null,
      browserToolsError: null,
    };
    let featureStatus = null;
    await withBrowserProbeOperation(target, localReport, 'features', async (activeOperation) => {
      operation = activeOperation;
      runtime = await collectBrowserFeatureRuntime(target, localReport);
      featureStatus = await inspectBrowserFeatures(userConfig, {
        target,
        localReport,
        browserTools: runtime.browserTools,
      });
    });
    const runtimeBlockingState = getRuntimeBlockingState(runtime.browserTools);
    if (runtimeBlockingState?.requiresHuman) {
      if (commandOptions.json) {
        console.log(
          JSON.stringify(
            {
              target,
              error: runtimeBlockingState.summary ?? 'Blocking page requires manual clearance.',
              blockingState: runtimeBlockingState,
              browserToolsError: runtime.browserToolsError,
            },
            null,
            2,
          ),
        );
      } else {
        printBlockingStateGuidance(runtimeBlockingState, {
          prefix: `Cannot diff ${target} features while the selected page is blocked`,
        });
      }
      process.exitCode = 1;
      return;
    }
    const current = createAuracallBrowserFeaturesContract({
      target,
      featureStatus,
      operation,
      browserTools: runtime.browserTools,
      browserToolsError: runtime.browserToolsError,
    });
    const baseline = await resolveBrowserFeaturesBaseline(target, {
      auracallProfile: userConfig.auracallProfile ?? 'default',
      snapshotPath: typeof commandOptions.snapshot === 'string' ? commandOptions.snapshot : null,
    });
    const diff = diffBrowserFeaturesContracts(baseline.contract, current, {
      baselinePath: baseline.path,
    });
    if (commandOptions.json) {
      console.log(
        JSON.stringify(
          {
            target,
            diff,
            current,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(`Feature diff for ${target}: ${diff.changed ? 'changed' : 'no changes'}`);
    console.log(`- baseline: ${diff.baselinePath}`);
    console.log(
      `- summary: +modes=${diff.summary.addedModes}, -modes=${diff.summary.removedModes}, toggles=${diff.summary.changedToggles}, +menuItems=${diff.summary.addedMenuItems}, -menuItems=${diff.summary.removedMenuItems}, +uploads=${diff.summary.addedUploadCandidates}, -uploads=${diff.summary.removedUploadCandidates}`,
    );
  });

async function refreshProviderCache(
  llmService: LlmService,
  listOptions: BrowserProviderListOptions,
  options: {
    includeProjectOnlyConversations?: boolean;
  } = {},
): Promise<void> {
  const provider = llmService.provider;
  const includeProjectOnlyConversations = Boolean(options.includeProjectOnlyConversations);
  const normalizedListOptions = { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null };
  const cacheContext = await llmService.resolveCacheContext(normalizedListOptions);
  assertCacheIdentity(cacheContext, llmService.providerId);
  const configuredStore = cacheContext.userConfig.browser?.cache?.store;
  const cacheStoreKind: CacheStoreKind =
    configuredStore === 'json' || configuredStore === 'sqlite' || configuredStore === 'dual'
      ? configuredStore
      : 'dual';
  const cacheStore = createCacheStore(cacheStoreKind);
  let refreshedProjects: Project[] = [];
  if (provider.listProjects) {
    const projects = await provider.listProjects(normalizedListOptions);
    if (Array.isArray(projects)) {
      refreshedProjects = projects;
      await cacheStore.writeProjects(cacheContext, projects);
    }
  }
  if (provider.listConversations) {
    const conversations = await provider.listConversations(undefined, normalizedListOptions);
    if (Array.isArray(conversations)) {
      const conversationById = new Map<string, Conversation>();
      for (const conversation of conversations) {
        if (!conversation?.id) continue;
        conversationById.set(conversation.id, { ...conversation });
      }

      // Enrich existing global conversations with project associations discovered
      // via project-scoped conversation lists. By default we only update known IDs.
      // Optional mode can include project-only IDs discovered from scoped lists.
      if (provider.listProjects && refreshedProjects.length > 0) {
        for (const project of refreshedProjects) {
          if (!project?.id) continue;
          let scoped: Conversation[] = [];
          try {
            const result = await provider.listConversations(project.id, {
              ...normalizedListOptions,
              includeHistory: false,
            });
            if (Array.isArray(result)) {
              scoped = result;
            }
          } catch {
            continue;
          }
          for (const scopedConversation of scoped) {
            if (!scopedConversation?.id) continue;
            const existing = conversationById.get(scopedConversation.id);
            if (!existing) {
              if (!includeProjectOnlyConversations) continue;
              conversationById.set(scopedConversation.id, {
                ...scopedConversation,
                projectId: scopedConversation.projectId ?? project.id,
              });
              continue;
            }
            if (!existing.projectId) {
              existing.projectId = scopedConversation.projectId ?? project.id;
            }
            if (
              (!existing.url || !existing.url.includes('/project/')) &&
              typeof scopedConversation.url === 'string' &&
              scopedConversation.url.includes('/project/')
            ) {
              existing.url = scopedConversation.url;
            }
          }
        }
      }

      await cacheStore.writeConversations(cacheContext, Array.from(conversationById.values()));
    }
  }
}

async function promptForCacheIdentity(provider: string): Promise<ProviderUserIdentity | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Cache identity for ${provider} (username/email, leave blank to skip): `,
    );
    const trimmed = answer.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('@')) {
      return { handle: trimmed, source: 'prompt' };
    }
    if (!trimmed.includes(' ') && trimmed.includes('@')) {
      return { email: trimmed, source: 'prompt' };
    }
    return { name: trimmed, source: 'prompt' };
  } finally {
    rl.close();
  }
}

async function runCacheContextKeywordSearch(query: string, commandOptions: OptionValues): Promise<void> {
  const resolved = await resolveCacheSearchContext(commandOptions);
  const normalizedQuery = String(query ?? '').trim();
  if (!normalizedQuery) {
    throw new Error('query is required.');
  }
  const role = parseCacheSearchRole(commandOptions.role);
  const limit =
    typeof commandOptions.limit === 'number' && Number.isFinite(commandOptions.limit)
      ? commandOptions.limit
      : undefined;
  const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
  const hits = await searchCachedContextsByKeyword(resolved.cacheContext, normalizedQuery, {
    limit,
    conversationId,
    role,
  });
  console.log(
    JSON.stringify(
      {
        provider: resolved.provider,
        identityKey: resolved.cacheContext.identityKey,
        mode: 'keyword',
        query: normalizedQuery,
        filters: {
          conversationId: conversationId ?? null,
          role: role ?? null,
          limit: limit ?? null,
        },
        hits,
      },
      null,
      2,
    ),
  );
}

async function runCacheContextSemanticSearch(query: string, commandOptions: OptionValues): Promise<void> {
  const resolved = await resolveCacheSearchContext(commandOptions);
  const normalizedQuery = String(query ?? '').trim();
  if (!normalizedQuery) {
    throw new Error('query is required.');
  }
  const role = parseCacheSearchRole(commandOptions.role);
  const limit =
    typeof commandOptions.limit === 'number' && Number.isFinite(commandOptions.limit)
      ? commandOptions.limit
      : undefined;
  const conversationId = readStringOption(commandOptions, ['conversationId', 'conversation-id']);
  const model = readStringOption(commandOptions, ['model']);
  const maxChunks = readNumberOption(commandOptions, ['maxChunks', 'max-chunks']);
  const minScore = readNumberOption(commandOptions, ['minScore', 'min-score']);
  const openaiApiKey = readStringOption(commandOptions, ['openaiApiKey', 'openai-api-key']);
  const openaiBaseUrl = readStringOption(commandOptions, ['openaiBaseUrl', 'openai-base-url']);
  const result = await searchCachedContextsSemantically(resolved.cacheContext, normalizedQuery, {
    limit,
    conversationId,
    role,
    model,
    maxChunks,
    minScore,
    openaiApiKey,
    openaiBaseUrl,
  });
  console.log(
    JSON.stringify(
      {
        provider: resolved.provider,
        identityKey: resolved.cacheContext.identityKey,
        mode: 'semantic',
        query: normalizedQuery,
        model: result.model,
        totalChunks: result.totalChunks,
        embeddedChunks: result.embeddedChunks,
        filters: {
          conversationId: conversationId ?? null,
          role: role ?? null,
          limit: limit ?? null,
          maxChunks: maxChunks ?? null,
          minScore: minScore ?? null,
        },
        hits: result.hits,
      },
      null,
      2,
    ),
  );
}

function parseCacheSearchRole(raw: unknown): 'user' | 'assistant' | 'system' | 'source' | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'user' || normalized === 'assistant' || normalized === 'system' || normalized === 'source') {
    return normalized;
  }
  throw new Error('role must be one of: user, assistant, system, source.');
}

function readOptionRaw(options: OptionValues, keys: string[]): unknown {
  for (const key of keys) {
    const value = (options as Record<string, unknown>)[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function readStringOption(options: OptionValues, keys: string[]): string | undefined {
  const raw = readOptionRaw(options, keys);
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw)
        ? raw.find((entry) => typeof entry === 'string' && entry.trim().length > 0)?.trim()
        : undefined;
  if (typeof value !== 'string') return undefined;
  return value.length > 0 ? value : undefined;
}

function readNumberOption(options: OptionValues, keys: string[]): number | undefined {
  const raw = readOptionRaw(options, keys);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return raw;
}

function parseCacheFileDataset(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined;
  }
  const normalized = raw.trim();
  const valid = new Set([
    'conversation-context',
    'conversation-files',
    'conversation-attachments',
    'project-knowledge',
    'account-files',
  ]);
  if (!valid.has(normalized)) {
    throw new Error(
      'dataset must be one of: conversation-context, conversation-files, conversation-attachments, project-knowledge, account-files.',
    );
  }
  return normalized;
}

type CacheDoctorSeverity = 'warning' | 'error';

type CacheDoctorFinding = {
  severity: CacheDoctorSeverity;
  check: string;
  message: string;
};

type CacheDoctorEntry = {
  provider: CacheCliProvider;
  identityKey: string;
  cacheDir: string;
  sqlite: {
    path: string;
    exists: boolean;
    ok: boolean;
    quickCheck: string | null;
    missingTables: string[];
  } | null;
  filePointerHealth: {
    missingLocalCount: number;
    sample: Array<{
      dataset: string;
      entityId: string;
      displayName: string;
      localPath: string | null;
      pathState: string;
    }>;
  };
  inventorySummary: {
    conversationCount: number;
    messageCount: number;
    sourceCount: number;
    fileCount: number;
    artifactCount: number;
  };
  parity: {
    sqlEntryCount: number | null;
    indexEntryCount: number | null;
    missingInSqlCount: number;
    missingInIndexCount: number;
    orphanSourceLinksCount: number;
    orphanFileBindingsCount: number;
    orphanArtifactBindingsCount: number;
  };
  findings: CacheDoctorFinding[];
};

type CacheDoctorReport = {
  generatedAt: string;
  filters: {
    provider: string | null;
    identityKey: string | null;
    missingLimit: number;
  };
  summary: {
    checked: number;
    warnings: number;
    errors: number;
  };
  entries: CacheDoctorEntry[];
};

async function runCacheDoctor(commandOptions: OptionValues): Promise<CacheDoctorReport> {
  const providerFilter =
    typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
      ? commandOptions.provider.trim()
      : null;
  if (providerFilter && !isCacheCliProvider(providerFilter)) {
    throw new Error(`Invalid provider "${providerFilter}". Use "chatgpt", "gemini", or "grok".`);
  }
  const identityFilter =
    typeof commandOptions.identityKey === 'string' && commandOptions.identityKey.trim().length > 0
      ? commandOptions.identityKey.trim()
      : null;
  const missingLimit =
    typeof commandOptions.missingLimit === 'number' && Number.isFinite(commandOptions.missingLimit)
      ? Math.max(1, Math.min(100, Math.floor(commandOptions.missingLimit)))
      : 25;

  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const contexts = await discoverCacheDoctorContexts(userConfig, providerFilter, identityFilter);
  const entries: CacheDoctorEntry[] = [];
  let warnings = 0;
  let errors = 0;

  for (const item of contexts) {
    const result = await withCacheMaintenanceLock(
      item.cacheDir,
      `cache-doctor ${item.provider}/${item.identityKey}`,
      async () => {
        const findings: CacheDoctorFinding[] = [];
        const sqlite = await inspectCacheSqlite(item.cacheDir);
        if (!sqlite.exists) {
          findings.push({
            severity: 'warning',
            check: 'sqlite.exists',
            message: 'cache.sqlite not found (JSON-only cache or uninitialized SQL cache).',
          });
        } else if (!sqlite.ok) {
          findings.push({
            severity: 'error',
            check: 'sqlite.quick_check',
            message: sqlite.quickCheck ? `SQLite quick_check failed: ${sqlite.quickCheck}` : 'SQLite quick_check failed.',
          });
        }
        if (sqlite.exists && sqlite.missingTables.length > 0) {
          findings.push({
            severity: 'warning',
            check: 'sqlite.tables',
            message: `Missing expected tables: ${sqlite.missingTables.join(', ')}`,
          });
        }

        const missingRows = await resolveCachedFiles(item.cacheContext, {
          missingOnly: true,
          limit: missingLimit,
        });
        if (missingRows.length > 0) {
          findings.push({
            severity: 'warning',
            check: 'files.missing_local',
            message: `Found ${missingRows.length} missing local file pointer(s).`,
          });
        }

        const parity = await inspectCacheParity(item.cacheDir);
        const inventory = await listCachedConversationInventory(item.cacheContext, {
          limit: 10_000,
        });
        const inventorySummary = inventory.reduce(
          (summary, row) => ({
            conversationCount: summary.conversationCount + 1,
            messageCount: summary.messageCount + row.messageCount,
            sourceCount: summary.sourceCount + row.sourceCount,
            fileCount: summary.fileCount + row.fileCount,
            artifactCount: summary.artifactCount + row.artifactCount,
          }),
          {
            conversationCount: 0,
            messageCount: 0,
            sourceCount: 0,
            fileCount: 0,
            artifactCount: 0,
          },
        );
        if (parity.missingInSqlCount > 0) {
          findings.push({
            severity: 'warning',
            check: 'parity.index_missing_in_sql',
            message: `${parity.missingInSqlCount} cache-index entry key(s) are missing from cache_entries.`,
          });
        }
        if (parity.missingInIndexCount > 0) {
          findings.push({
            severity: 'warning',
            check: 'parity.sql_missing_in_index',
            message: `${parity.missingInIndexCount} cache_entries key(s) are missing from cache-index.json.`,
          });
        }
        if (parity.orphanSourceLinksCount > 0) {
          findings.push({
            severity: 'warning',
            check: 'parity.orphan_source_links',
            message: `${parity.orphanSourceLinksCount} source_links row(s) have no matching conversation-context cache entry.`,
          });
        }
        if (parity.orphanFileBindingsCount > 0) {
          findings.push({
            severity: 'warning',
            check: 'parity.orphan_file_bindings',
            message: `${parity.orphanFileBindingsCount} file_bindings row(s) have no matching cache entry dataset/entity.`,
          });
        }
        if (parity.orphanArtifactBindingsCount > 0) {
          findings.push({
            severity: 'warning',
            check: 'parity.orphan_artifact_bindings',
            message: `${parity.orphanArtifactBindingsCount} artifact_bindings row(s) have no matching conversation-context cache entry.`,
          });
        }

        const warningInc = findings.filter((finding) => finding.severity === 'warning').length;
        const errorInc = findings.filter((finding) => finding.severity === 'error').length;
        const entry: CacheDoctorEntry = {
          provider: item.provider,
          identityKey: item.identityKey,
          cacheDir: item.cacheDir,
          sqlite,
          filePointerHealth: {
            missingLocalCount: missingRows.length,
            sample: missingRows.map((row) => ({
              dataset: row.dataset,
              entityId: row.entityId,
              displayName: row.displayName,
              localPath: row.localPath,
              pathState: row.pathState,
            })),
          },
          inventorySummary,
          parity,
          findings,
        };
        return { entry, warningInc, errorInc };
      },
    );
    warnings += result.warningInc;
    errors += result.errorInc;
    entries.push(result.entry);
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      provider: providerFilter,
      identityKey: identityFilter,
      missingLimit,
    },
    summary: {
      checked: entries.length,
      warnings,
      errors,
    },
    entries,
  };
}

async function discoverCacheDoctorContexts(
  userConfig: ResolvedUserConfig,
  providerFilter: string | null,
  identityFilter: string | null,
): Promise<
  Array<{
    provider: CacheCliProvider;
    identityKey: string;
    cacheDir: string;
    cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>;
  }>
> {
  const contexts = await discoverCacheMaintenanceContexts({
    userConfig,
    providerFilter,
    identityFilter,
    identityPrompt: promptForCacheIdentity,
  });
  return contexts.map((item) => ({
    provider: item.provider,
    identityKey: item.identityKey,
    cacheDir: item.cacheDir,
    cacheContext: item.cacheContext,
  }));
}

async function inspectCacheSqlite(cacheDir: string): Promise<{
  path: string;
  exists: boolean;
  ok: boolean;
  quickCheck: string | null;
  missingTables: string[];
}> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return {
      path: dbPath,
      exists: false,
      ok: true,
      quickCheck: null,
      missingTables: [],
    };
  }
  try {
    const sqliteModule = await import('node:sqlite');
    return await withSqliteBusyRetry(`inspect sqlite (${cacheDir})`, async () => {
      const db = new sqliteModule.DatabaseSync(dbPath);
      try {
        const quick = db.prepare('PRAGMA quick_check').all();
        const quickValue =
          quick.length > 0 && typeof quick[0].quick_check === 'string' ? quick[0].quick_check : null;
        const requiredTables = [
          'cache_entries',
          'meta',
          'schema_migrations',
          'source_links',
          'file_bindings',
          'file_assets',
          'artifact_bindings',
        ];
        const tableRows = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => String(row.name));
        const missingTables = requiredTables.filter((table) => !tableRows.includes(table));
        return {
          path: dbPath,
          exists: true,
          ok: quickValue === null || quickValue.toLowerCase() === 'ok',
          quickCheck: quickValue,
          missingTables,
        };
      } finally {
        db.close();
      }
    });
  } catch (error) {
    return {
      path: dbPath,
      exists: true,
      ok: false,
      quickCheck: `failed to inspect sqlite: ${error instanceof Error ? error.message : String(error)}`,
      missingTables: [],
    };
  }
}

async function inspectCacheParity(cacheDir: string): Promise<{
  sqlEntryCount: number | null;
  indexEntryCount: number | null;
  missingInSqlCount: number;
  missingInIndexCount: number;
  orphanSourceLinksCount: number;
  orphanFileBindingsCount: number;
  orphanArtifactBindingsCount: number;
}> {
  const sqlKeys = await readSqlCacheEntryKeys(cacheDir);
  const indexKeys = await readIndexEntryKeys(cacheDir);
  const missingInSqlCount = countMissing(indexKeys, sqlKeys);
  const missingInIndexCount = countMissing(sqlKeys, indexKeys);
  const sqliteOrphans = await readSqlOrphanCounts(cacheDir);
  return {
    sqlEntryCount: sqlKeys ? sqlKeys.size : null,
    indexEntryCount: indexKeys ? indexKeys.size : null,
    missingInSqlCount,
    missingInIndexCount,
    orphanSourceLinksCount: sqliteOrphans.orphanSourceLinksCount,
    orphanFileBindingsCount: sqliteOrphans.orphanFileBindingsCount,
    orphanArtifactBindingsCount: sqliteOrphans.orphanArtifactBindingsCount,
  };
}

async function readSqlCacheEntryKeys(cacheDir: string): Promise<Set<string> | null> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  try {
    const sqliteModule = await import('node:sqlite');
    return await withSqliteBusyRetry(`doctor parity sql keys (${cacheDir})`, async () => {
      const db = new sqliteModule.DatabaseSync(dbPath);
      try {
        const rows = db
          .prepare('SELECT dataset, entity_id FROM cache_entries')
          .all() as Array<{ dataset?: string; entity_id?: string }>;
        const keys = new Set<string>();
        for (const row of rows) {
          const dataset = typeof row.dataset === 'string' ? row.dataset : '';
          const entityId = typeof row.entity_id === 'string' ? row.entity_id : '';
          const key = toSqlParityKey(dataset, entityId);
          if (key) keys.add(key);
        }
        return keys;
      } finally {
        db.close();
      }
    });
  } catch {
    return null;
  }
}

async function readIndexEntryKeys(cacheDir: string): Promise<Set<string> | null> {
  const indexPath = path.join(cacheDir, 'cache-index.json');
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const entries = Array.isArray((parsed as { entries?: unknown[] })?.entries)
    ? ((parsed as { entries?: unknown[] }).entries as unknown[])
    : [];
  const keys = new Set<string>();
  for (const entryRaw of entries) {
    if (!entryRaw || typeof entryRaw !== 'object') continue;
    const entry = entryRaw as {
      kind?: string;
      path?: string;
      projectId?: string;
      conversationId?: string;
    };
    const key = toIndexParityKey(entry);
    if (key) keys.add(key);
  }
  return keys;
}

function toSqlParityKey(datasetRaw: string, entityIdRaw: string): string | null {
  const dataset = datasetRaw.trim();
  const entityId = entityIdRaw.trim();
  if (dataset === 'projects' || dataset === 'conversations') {
    return `${dataset}::`;
  }
  if (!entityId) return null;
  const map: Record<string, string> = {
    'conversation-context': 'context',
    'conversation-files': 'conversation-files',
    'conversation-attachments': 'conversation-attachments',
    'project-knowledge': 'project-knowledge',
    'project-instructions': 'project-instructions',
  };
  const kind = map[dataset];
  if (!kind) return null;
  return `${kind}::${entityId}`;
}

function toIndexParityKey(entry: {
  kind?: string;
  path?: string;
  projectId?: string;
  conversationId?: string;
}): string | null {
  const kind = typeof entry.kind === 'string' ? entry.kind.trim() : '';
  if (!kind) return null;
  if (kind === 'projects' || kind === 'conversations') {
    return `${kind}::`;
  }
  const pathValue = typeof entry.path === 'string' ? entry.path : '';
  if (kind === 'context' || kind === 'conversation-files' || kind === 'conversation-attachments') {
    const explicitId =
      kind === 'context' || kind === 'conversation-files'
        ? (entry.conversationId ?? '').trim()
        : (entry.conversationId ?? '').trim();
    const parsedId = parseConversationIdFromPath(pathValue, kind);
    const conversationId = explicitId || parsedId;
    return conversationId ? `${kind}::${conversationId}` : null;
  }
  if (kind === 'project-knowledge' || kind === 'project-instructions') {
    const explicitId = (entry.projectId ?? '').trim();
    const parsedId = parseProjectIdFromPath(pathValue, kind);
    const projectId = explicitId || parsedId;
    return projectId ? `${kind}::${projectId}` : null;
  }
  return null;
}

function parseConversationIdFromPath(pathValue: string, kind: string): string {
  if (!pathValue) return '';
  if (kind === 'context') {
    const match = pathValue.match(/^contexts\/([^/]+)\.json$/i);
    return match?.[1] ?? '';
  }
  if (kind === 'conversation-files') {
    const match = pathValue.match(/^conversation-files\/([^/]+)\.json$/i);
    return match?.[1] ?? '';
  }
  const match = pathValue.match(/^conversation-attachments\/([^/]+)\/manifest\.json$/i);
  return match?.[1] ?? '';
}

function parseProjectIdFromPath(pathValue: string, kind: string): string {
  if (!pathValue) return '';
  if (kind === 'project-knowledge') {
    const match = pathValue.match(/^project-knowledge\/([^/]+)\/manifest\.json$/i);
    return match?.[1] ?? '';
  }
  const match = pathValue.match(/^project-instructions\/([^/.]+)\.(?:md|json)$/i);
  return match?.[1] ?? '';
}

function countMissing(source: Set<string> | null, target: Set<string> | null): number {
  if (!source || !target) return 0;
  let count = 0;
  for (const key of source) {
    if (!target.has(key)) count += 1;
  }
  return count;
}

async function readSqlOrphanCounts(cacheDir: string): Promise<{
  orphanSourceLinksCount: number;
  orphanFileBindingsCount: number;
  orphanArtifactBindingsCount: number;
}> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return { orphanSourceLinksCount: 0, orphanFileBindingsCount: 0, orphanArtifactBindingsCount: 0 };
  }
  try {
    const sqliteModule = await import('node:sqlite');
    return await withSqliteBusyRetry(`doctor parity orphan counts (${cacheDir})`, async () => {
      const db = new sqliteModule.DatabaseSync(dbPath);
      try {
        const orphanSource = db
          .prepare(
            `SELECT COUNT(*) AS c
               FROM source_links s
              WHERE NOT EXISTS (
                SELECT 1
                  FROM cache_entries c
                 WHERE c.dataset = 'conversation-context'
                   AND c.entity_id = s.conversation_id
              )`,
          )
          .get() as { c?: number | bigint };
        const orphanBindings = db
          .prepare(
            `SELECT COUNT(*) AS c
               FROM file_bindings b
              WHERE NOT EXISTS (
                SELECT 1
                  FROM cache_entries c
                 WHERE c.dataset = b.dataset
                   AND c.entity_id = b.entity_id
              )`,
          )
          .get() as { c?: number | bigint };
        const orphanArtifacts = db
          .prepare(
            `SELECT COUNT(*) AS c
               FROM artifact_bindings a
              WHERE NOT EXISTS (
                SELECT 1
                  FROM cache_entries c
                 WHERE c.dataset = 'conversation-context'
                   AND c.entity_id = a.conversation_id
              )`,
          )
          .get() as { c?: number | bigint };
        return {
          orphanSourceLinksCount: numberFromSqlValue(orphanSource.c),
          orphanFileBindingsCount: numberFromSqlValue(orphanBindings.c),
          orphanArtifactBindingsCount: numberFromSqlValue(orphanArtifacts.c),
        };
      } finally {
        db.close();
      }
    });
  } catch {
    return { orphanSourceLinksCount: 0, orphanFileBindingsCount: 0, orphanArtifactBindingsCount: 0 };
  }
}

const CACHE_MAINTENANCE_LOCK_FILE = '.oracle-cache-maintenance.lock';
const CACHE_MAINTENANCE_LOCK_WAIT_MS = 60_000;
const CACHE_MAINTENANCE_LOCK_STALE_MS = 15 * 60_000;
const CACHE_MAINTENANCE_LOCK_POLL_MS = 250;

async function withCacheMaintenanceLock<T>(
  cacheDir: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  await fs.mkdir(cacheDir, { recursive: true });
  const lockPath = path.join(cacheDir, CACHE_MAINTENANCE_LOCK_FILE);
  const start = Date.now();
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx');
      const payload = {
        pid: process.pid,
        label,
        acquiredAt: new Date().toISOString(),
        host: os.hostname(),
      };
      await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      break;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'EEXIST') {
        throw error;
      }
      const staleCleared = await clearStaleCacheMaintenanceLock(lockPath);
      if (staleCleared) {
        continue;
      }
      if (Date.now() - start > CACHE_MAINTENANCE_LOCK_WAIT_MS) {
        throw new Error(
          `Timed out waiting for cache maintenance lock at ${lockPath}. Try again after current operation completes.`,
        );
      }
      await sleep(CACHE_MAINTENANCE_LOCK_POLL_MS);
    }
  }

  try {
    return await fn();
  } finally {
    try {
      await handle?.close();
    } catch {
      // ignore
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // ignore
    }
  }
}

async function clearStaleCacheMaintenanceLock(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= CACHE_MAINTENANCE_LOCK_STALE_MS) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    await fs.unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const SQLITE_BUSY_MAX_ATTEMPTS = 8;
const SQLITE_BUSY_BASE_DELAY_MS = 120;

async function withSqliteBusyRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= SQLITE_BUSY_MAX_ATTEMPTS - 1) {
        throw error;
      }
      const delay = Math.min(
        SQLITE_BUSY_BASE_DELAY_MS * Math.pow(2, attempt),
        1_500,
      );
      if (process.env.AURACALL_DEBUG_CACHE === '1' || process.env.ORACLE_DEBUG_CACHE === '1') {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[cache] sqlite busy retry (${attempt + 1}/${SQLITE_BUSY_MAX_ATTEMPTS}) for ${label}: ${message}`,
        );
      }
      attempt += 1;
      await sleep(delay);
    }
  }
}

function isSqliteBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('database is locked') || normalized.includes('sqlite_busy');
}

type CacheRepairActionName =
  | 'sync-sql'
  | 'rebuild-index'
  | 'prune-orphan-assets'
  | 'prune-orphan-source-links'
  | 'prune-orphan-file-bindings'
  | 'prune-orphan-artifact-bindings'
  | 'mark-missing-local';

type CacheRepairActionResult = {
  name: CacheRepairActionName;
  applied: boolean;
  skipped: 'dry-run' | 'no-op' | 'failed';
  message: string;
};

type CacheRepairEntry = {
  provider: CacheCliProvider;
  identityKey: string;
  cacheDir: string;
  backupDir: string | null;
  actions: CacheRepairActionResult[];
};

type CacheRepairReport = {
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  actions: CacheRepairActionName[];
  filters: {
    provider: string | null;
    identityKey: string | null;
  };
  summary: {
    checked: number;
    touched: number;
    backups: number;
    warnings: number;
    errors: number;
  };
  entries: CacheRepairEntry[];
};

async function runCacheRepair(commandOptions: OptionValues): Promise<CacheRepairReport> {
  const providerFilter =
    typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
      ? commandOptions.provider.trim()
      : null;
  if (providerFilter && !isCacheCliProvider(providerFilter)) {
    throw new Error(`Invalid provider "${providerFilter}". Use "chatgpt", "gemini", or "grok".`);
  }
  const identityFilter =
    typeof commandOptions.identityKey === 'string' && commandOptions.identityKey.trim().length > 0
      ? commandOptions.identityKey.trim()
      : null;
  const actions = parseCacheRepairActions(commandOptions.actions);
  const apply = Boolean(commandOptions.apply);
  const mode: 'dry-run' | 'apply' = apply ? 'apply' : 'dry-run';

  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const contexts = await discoverCacheDoctorContexts(userConfig, providerFilter, identityFilter);
  const entries: CacheRepairEntry[] = [];
  let touched = 0;
  let backups = 0;
  let warnings = 0;
  let errors = 0;

  for (const context of contexts) {
    const result = await withCacheMaintenanceLock(
      context.cacheDir,
      `cache-repair ${context.provider}/${context.identityKey}`,
      async () => {
        const results: CacheRepairActionResult[] = [];
        let backupDir: string | null = null;
        const ensureBackup = async () => {
          if (!apply) return null;
          if (backupDir) return backupDir;
          backupDir = await createCacheRepairBackup(context.cacheDir);
          backups += 1;
          return backupDir;
        };

        for (const action of actions) {
          try {
            if (action === 'sync-sql') {
              if (apply) await ensureBackup();
              const repairResult = await repairSyncSql(context.cacheContext, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'rebuild-index') {
              if (apply) await ensureBackup();
              const repairResult = await repairRebuildIndex(context.cacheContext, context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'prune-orphan-assets') {
              if (apply) await ensureBackup();
              const repairResult = await repairPruneOrphanAssets(context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'prune-orphan-source-links') {
              if (apply) await ensureBackup();
              const repairResult = await repairPruneOrphanSourceLinks(context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'prune-orphan-file-bindings') {
              if (apply) await ensureBackup();
              const repairResult = await repairPruneOrphanFileBindings(context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'prune-orphan-artifact-bindings') {
              if (apply) await ensureBackup();
              const repairResult = await repairPruneOrphanArtifactBindings(context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
            if (action === 'mark-missing-local') {
              if (apply) await ensureBackup();
              const repairResult = await repairMarkMissingLocal(context.cacheDir, apply);
              if (repairResult.applied) touched += 1;
              if (repairResult.skipped === 'failed') errors += 1;
              results.push(repairResult);
              continue;
            }
          } catch (error) {
            errors += 1;
            results.push({
              name: action,
              applied: false,
              skipped: 'failed',
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return {
          provider: context.provider,
          identityKey: context.identityKey,
          cacheDir: context.cacheDir,
          backupDir,
          actions: results,
        } as CacheRepairEntry;
      },
    );

    entries.push(result);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    actions,
    filters: {
      provider: providerFilter,
      identityKey: identityFilter,
    },
    summary: {
      checked: entries.length,
      touched,
      backups,
      warnings,
      errors,
    },
    entries,
  };
}

function parseCacheRepairActions(raw: unknown): CacheRepairActionName[] {
  const valid = new Set<CacheRepairActionName>([
    'sync-sql',
    'rebuild-index',
    'prune-orphan-assets',
    'prune-orphan-source-links',
    'prune-orphan-file-bindings',
    'prune-orphan-artifact-bindings',
    'mark-missing-local',
  ]);
  const source = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'all';
  const tokens = source
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.includes('all')) {
    return [
      'sync-sql',
      'rebuild-index',
      'prune-orphan-assets',
      'prune-orphan-source-links',
      'prune-orphan-file-bindings',
      'prune-orphan-artifact-bindings',
      'mark-missing-local',
    ];
  }
  const actions: CacheRepairActionName[] = [];
  for (const token of tokens) {
    if (!valid.has(token as CacheRepairActionName)) {
      throw new Error(
        `Invalid repair action "${token}". Use sync-sql,rebuild-index,prune-orphan-assets,prune-orphan-source-links,prune-orphan-file-bindings,prune-orphan-artifact-bindings,mark-missing-local,all.`,
      );
    }
    const casted = token as CacheRepairActionName;
    if (!actions.includes(casted)) actions.push(casted);
  }
  if (actions.length === 0) {
    return [
      'sync-sql',
      'rebuild-index',
      'prune-orphan-assets',
      'prune-orphan-source-links',
      'prune-orphan-file-bindings',
      'prune-orphan-artifact-bindings',
      'mark-missing-local',
    ];
  }
  return actions;
}

async function createCacheRepairBackup(cacheDir: string): Promise<string> {
  const backupDir = path.join(cacheDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(backupDir, { recursive: true });
  for (const fileName of ['cache.sqlite', 'cache-index.json']) {
    const source = path.join(cacheDir, fileName);
    try {
      await fs.access(source);
    } catch {
      continue;
    }
    await fs.copyFile(source, path.join(backupDir, fileName));
  }
  return backupDir;
}

async function repairSyncSql(
  cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>,
  apply: boolean,
): Promise<CacheRepairActionResult> {
  if (!apply) {
    return {
      name: 'sync-sql',
      applied: false,
      skipped: 'dry-run',
      message: 'Would initialize/sync cache.sqlite from current JSON/SQL cache state.',
    };
  }
  const sqliteStore = createCacheStore('sqlite');
  await sqliteStore.readProjects(cacheContext);
  await sqliteStore.readConversations(cacheContext);
  await sqliteStore.listConversationContexts(cacheContext);
  return {
    name: 'sync-sql',
    applied: true,
    skipped: 'no-op',
    message: 'SQLite cache initialized/synchronized.',
  };
}

async function repairRebuildIndex(
  cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>,
  cacheDir: string,
  apply: boolean,
): Promise<CacheRepairActionResult> {
  const index = await buildCacheIndexFromFilesystem(cacheContext, cacheDir);
  if (!apply) {
    return {
      name: 'rebuild-index',
      applied: false,
      skipped: 'dry-run',
      message: `Would rebuild cache-index.json with ${index.entries.length} entries.`,
    };
  }
  await fs.writeFile(path.join(cacheDir, 'cache-index.json'), JSON.stringify(index, null, 2), 'utf8');
  return {
    name: 'rebuild-index',
    applied: true,
    skipped: 'no-op',
    message: `Rebuilt cache-index.json with ${index.entries.length} entries.`,
  };
}

async function buildCacheIndexFromFilesystem(
  cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>,
  cacheDir: string,
): Promise<{
  version: 1;
  updatedAt: string;
  entries: Array<{
    kind:
      | 'projects'
      | 'conversations'
      | 'context'
      | 'conversation-files'
      | 'project-instructions'
      | 'project-knowledge'
      | 'conversation-attachments'
      | 'exports';
    path: string;
    updatedAt: string;
    projectId?: string;
    conversationId?: string;
    sourceUrl?: string | null;
  }>;
}> {
  const nowIso = new Date().toISOString();
  const entries: Array<{
    kind:
      | 'projects'
      | 'conversations'
      | 'context'
      | 'conversation-files'
      | 'project-instructions'
      | 'project-knowledge'
      | 'conversation-attachments'
      | 'exports';
    path: string;
    updatedAt: string;
    projectId?: string;
    conversationId?: string;
    sourceUrl?: string | null;
  }> = [];
  const addIfExists = async (
    kind:
      | 'projects'
      | 'conversations'
      | 'context'
      | 'conversation-files'
      | 'project-instructions'
      | 'project-knowledge'
      | 'conversation-attachments'
      | 'exports',
    relPath: string,
    extra?: { projectId?: string; conversationId?: string },
  ) => {
    const absolute = path.join(cacheDir, relPath);
    try {
      const stat = await fs.stat(absolute);
      entries.push({
        kind,
        path: relPath,
        updatedAt: stat.mtime.toISOString(),
        projectId: extra?.projectId,
        conversationId: extra?.conversationId,
        sourceUrl: cacheContext.listOptions.configuredUrl ?? null,
      });
    } catch {
      // ignore
    }
  };

  await addIfExists('projects', 'projects.json');
  await addIfExists('conversations', 'conversations.json');

  const walkJsonDir = async (
    subDir: string,
    kind: 'context' | 'conversation-files',
    idKey: 'conversationId',
  ) => {
    const absoluteDir = path.join(cacheDir, subDir);
    let files: Array<{ name: string; isFile: () => boolean }> = [];
    try {
      files = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      const id = file.name.replace(/\.json$/i, '');
      await addIfExists(kind, `${subDir}/${file.name}`, { [idKey]: id });
    }
  };

  await walkJsonDir('contexts', 'context', 'conversationId');
  await walkJsonDir('conversation-files', 'conversation-files', 'conversationId');

  const walkManifestDir = async (
    subDir: string,
    kind: 'conversation-attachments' | 'project-knowledge',
    idKey: 'conversationId' | 'projectId',
  ) => {
    const absoluteDir = path.join(cacheDir, subDir);
    let entriesDir: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entriesDir = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entriesDir) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      await addIfExists(kind, `${subDir}/${id}/manifest.json`, { [idKey]: id });
    }
  };

  await walkManifestDir('conversation-attachments', 'conversation-attachments', 'conversationId');
  await walkManifestDir('project-knowledge', 'project-knowledge', 'projectId');

  const projectInstructionsDir = path.join(cacheDir, 'project-instructions');
  let instructionFiles: Array<{ name: string; isFile: () => boolean }> = [];
  try {
    instructionFiles = await fs.readdir(projectInstructionsDir, { withFileTypes: true });
  } catch {
    instructionFiles = [];
  }
  for (const file of instructionFiles) {
    if (!file.isFile()) continue;
    if (!file.name.endsWith('.md') && !file.name.endsWith('.json')) continue;
    const projectId = file.name.replace(/\.(md|json)$/i, '');
    await addIfExists('project-instructions', `project-instructions/${file.name}`, { projectId });
  }

  return {
    version: 1,
    updatedAt: nowIso,
    entries: entries.sort((a, b) => {
      const ta = Date.parse(a.updatedAt);
      const tb = Date.parse(b.updatedAt);
      return tb - ta;
    }),
  };
}

async function repairPruneOrphanAssets(cacheDir: string, apply: boolean): Promise<CacheRepairActionResult> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  const sqliteInfo = await inspectCacheSqlite(cacheDir);
  if (!sqliteInfo.exists) {
    return {
      name: 'prune-orphan-assets',
      applied: false,
      skipped: 'no-op',
      message: 'No cache.sqlite present.',
    };
  }
  const sqliteModule = await import('node:sqlite');
  return withSqliteBusyRetry(`repair prune orphan assets (${cacheDir})`, async () => {
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM file_assets
            WHERE asset_id NOT IN (
              SELECT DISTINCT asset_id FROM file_bindings WHERE asset_id IS NOT NULL
            )`,
        )
        .get() as { c?: number };
      const count = Number(row?.c ?? 0);
      if (!apply) {
        return {
          name: 'prune-orphan-assets',
          applied: false,
          skipped: 'dry-run',
          message: `Would prune ${count} orphan asset row(s).`,
        };
      }
      if (count <= 0) {
        return {
          name: 'prune-orphan-assets',
          applied: false,
          skipped: 'no-op',
          message: 'No orphan asset rows found.',
        };
      }
      db.prepare(
        `DELETE FROM file_assets
          WHERE asset_id NOT IN (
            SELECT DISTINCT asset_id FROM file_bindings WHERE asset_id IS NOT NULL
          )`,
      ).run();
      return {
        name: 'prune-orphan-assets',
        applied: true,
        skipped: 'no-op',
        message: `Pruned ${count} orphan asset row(s).`,
      };
    } finally {
      db.close();
    }
  });
}

async function repairPruneOrphanSourceLinks(
  cacheDir: string,
  apply: boolean,
): Promise<CacheRepairActionResult> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  const sqliteInfo = await inspectCacheSqlite(cacheDir);
  if (!sqliteInfo.exists) {
    return {
      name: 'prune-orphan-source-links',
      applied: false,
      skipped: 'no-op',
      message: 'No cache.sqlite present.',
    };
  }
  const sqliteModule = await import('node:sqlite');
  return withSqliteBusyRetry(`repair prune orphan source links (${cacheDir})`, async () => {
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM source_links s
            WHERE NOT EXISTS (
              SELECT 1
                FROM cache_entries c
               WHERE c.dataset = 'conversation-context'
                 AND c.entity_id = s.conversation_id
            )`,
        )
        .get() as { c?: number };
      const count = Number(row?.c ?? 0);
      if (!apply) {
        return {
          name: 'prune-orphan-source-links',
          applied: false,
          skipped: 'dry-run',
          message: `Would prune ${count} orphan source_links row(s).`,
        };
      }
      if (count <= 0) {
        return {
          name: 'prune-orphan-source-links',
          applied: false,
          skipped: 'no-op',
          message: 'No orphan source_links rows found.',
        };
      }
      db.prepare(
        `DELETE FROM source_links
          WHERE NOT EXISTS (
            SELECT 1
              FROM cache_entries c
             WHERE c.dataset = 'conversation-context'
               AND c.entity_id = source_links.conversation_id
          )`,
      ).run();
      return {
        name: 'prune-orphan-source-links',
        applied: true,
        skipped: 'no-op',
        message: `Pruned ${count} orphan source_links row(s).`,
      };
    } finally {
      db.close();
    }
  });
}

async function repairPruneOrphanFileBindings(
  cacheDir: string,
  apply: boolean,
): Promise<CacheRepairActionResult> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  const sqliteInfo = await inspectCacheSqlite(cacheDir);
  if (!sqliteInfo.exists) {
    return {
      name: 'prune-orphan-file-bindings',
      applied: false,
      skipped: 'no-op',
      message: 'No cache.sqlite present.',
    };
  }
  const sqliteModule = await import('node:sqlite');
  return withSqliteBusyRetry(`repair prune orphan file bindings (${cacheDir})`, async () => {
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM file_bindings b
            WHERE NOT EXISTS (
              SELECT 1
                FROM cache_entries c
               WHERE c.dataset = b.dataset
                 AND c.entity_id = b.entity_id
            )`,
        )
        .get() as { c?: number };
      const count = Number(row?.c ?? 0);
      if (!apply) {
        return {
          name: 'prune-orphan-file-bindings',
          applied: false,
          skipped: 'dry-run',
          message: `Would prune ${count} orphan file_bindings row(s).`,
        };
      }
      if (count <= 0) {
        return {
          name: 'prune-orphan-file-bindings',
          applied: false,
          skipped: 'no-op',
          message: 'No orphan file_bindings rows found.',
        };
      }
      db.prepare(
        `DELETE FROM file_bindings
          WHERE NOT EXISTS (
            SELECT 1
              FROM cache_entries c
             WHERE c.dataset = file_bindings.dataset
               AND c.entity_id = file_bindings.entity_id
          )`,
      ).run();
      return {
        name: 'prune-orphan-file-bindings',
        applied: true,
        skipped: 'no-op',
        message: `Pruned ${count} orphan file_bindings row(s).`,
      };
    } finally {
      db.close();
    }
  });
}

async function repairPruneOrphanArtifactBindings(
  cacheDir: string,
  apply: boolean,
): Promise<CacheRepairActionResult> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  const sqliteInfo = await inspectCacheSqlite(cacheDir);
  if (!sqliteInfo.exists) {
    return {
      name: 'prune-orphan-artifact-bindings',
      applied: false,
      skipped: 'no-op',
      message: 'No cache.sqlite present.',
    };
  }
  const sqliteModule = await import('node:sqlite');
  return withSqliteBusyRetry(`repair prune orphan artifact bindings (${cacheDir})`, async () => {
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM artifact_bindings a
            WHERE NOT EXISTS (
              SELECT 1
                FROM cache_entries c
               WHERE c.dataset = 'conversation-context'
                 AND c.entity_id = a.conversation_id
            )`,
        )
        .get() as { c?: number };
      const count = Number(row?.c ?? 0);
      if (!apply) {
        return {
          name: 'prune-orphan-artifact-bindings',
          applied: false,
          skipped: 'dry-run',
          message: `Would prune ${count} orphan artifact_bindings row(s).`,
        };
      }
      if (count <= 0) {
        return {
          name: 'prune-orphan-artifact-bindings',
          applied: false,
          skipped: 'no-op',
          message: 'No orphan artifact_bindings rows found.',
        };
      }
      db.prepare(
        `DELETE FROM artifact_bindings
          WHERE NOT EXISTS (
            SELECT 1
              FROM cache_entries c
             WHERE c.dataset = 'conversation-context'
               AND c.entity_id = artifact_bindings.conversation_id
          )`,
      ).run();
      return {
        name: 'prune-orphan-artifact-bindings',
        applied: true,
        skipped: 'no-op',
        message: `Pruned ${count} orphan artifact_bindings row(s).`,
      };
    } finally {
      db.close();
    }
  });
}

async function repairMarkMissingLocal(cacheDir: string, apply: boolean): Promise<CacheRepairActionResult> {
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  const sqliteInfo = await inspectCacheSqlite(cacheDir);
  if (!sqliteInfo.exists) {
    return {
      name: 'mark-missing-local',
      applied: false,
      skipped: 'no-op',
      message: 'No cache.sqlite present.',
    };
  }
  const sqliteModule = await import('node:sqlite');
  return withSqliteBusyRetry(`repair mark missing local (${cacheDir})`, async () => {
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const rows = db
        .prepare(
          `SELECT asset_id, storage_relpath
             FROM file_assets
            WHERE status = 'local_cached' AND storage_relpath IS NOT NULL`,
        )
        .all() as Array<{ asset_id?: string; storage_relpath?: string }>;
      const missingAssetIds: string[] = [];
      for (const row of rows) {
        const assetId = typeof row.asset_id === 'string' ? row.asset_id : '';
        const relPath = typeof row.storage_relpath === 'string' ? row.storage_relpath : '';
        if (!assetId || !relPath) continue;
        const absolute = path.resolve(cacheDir, relPath);
        try {
          await fs.access(absolute);
        } catch {
          missingAssetIds.push(assetId);
        }
      }
      if (!apply) {
        return {
          name: 'mark-missing-local',
          applied: false,
          skipped: 'dry-run',
          message: `Would mark ${missingAssetIds.length} missing local asset(s).`,
        };
      }
      if (missingAssetIds.length === 0) {
        return {
          name: 'mark-missing-local',
          applied: false,
          skipped: 'no-op',
          message: 'No missing local assets found.',
        };
      }
      const stmt = db.prepare(
        `UPDATE file_assets
            SET status = 'missing_local', updated_at = ?
          WHERE asset_id = ?`,
      );
      const nowIso = new Date().toISOString();
      for (const assetId of missingAssetIds) {
        stmt.run(nowIso, assetId);
      }
      return {
        name: 'mark-missing-local',
        applied: true,
        skipped: 'no-op',
        message: `Marked ${missingAssetIds.length} missing local asset(s).`,
      };
    } finally {
      db.close();
    }
  });
}

type CacheDatasetName =
  | 'all'
  | 'projects'
  | 'conversations'
  | 'context'
  | 'account-files'
  | 'conversation-files'
  | 'conversation-attachments'
  | 'project-knowledge'
  | 'project-instructions';

type CacheClearSqlSummary = {
  cacheEntriesMatched: number;
  cacheEntriesDeleted: number;
  sourceLinksMatched: number;
  sourceLinksDeleted: number;
  fileBindingsMatched: number;
  fileBindingsDeleted: number;
  orphanAssetsMatched: number;
  orphanAssetsDeleted: number;
};

type CacheConversationInventorySummary = {
  conversationCount: number;
  messageCount: number;
  sourceCount: number;
  fileCount: number;
  artifactCount: number;
};

type CacheClearEntry = {
  provider: CacheCliProvider;
  identityKey: string;
  cacheDir: string;
  fileTargetsMatched: number;
  fileTargetsDeleted: number;
  sql: CacheClearSqlSummary;
  inventoryBefore: CacheConversationInventorySummary;
  inventoryAfter: CacheConversationInventorySummary;
  warnings: string[];
  errors: string[];
};

type CacheClearReport = {
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  dataset: CacheDatasetName;
  cutoffIso: string | null;
  includeBlobs: boolean;
  filters: {
    provider: string | null;
    identityKey: string | null;
  };
  summary: {
    checked: number;
    touched: number;
    warnings: number;
    errors: number;
  };
  entries: CacheClearEntry[];
};

async function runCacheClear(commandOptions: OptionValues): Promise<CacheClearReport> {
  const providerFilter =
    typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
      ? commandOptions.provider.trim()
      : null;
  if (providerFilter && !isCacheCliProvider(providerFilter)) {
    throw new Error(`Invalid provider "${providerFilter}". Use "chatgpt", "gemini", or "grok".`);
  }
  const identityFilter =
    typeof commandOptions.identityKey === 'string' && commandOptions.identityKey.trim().length > 0
      ? commandOptions.identityKey.trim()
      : null;
  const dataset = parseCacheDataset(commandOptions.dataset);
  const cutoff = parseCutoffFromOlderThan(commandOptions.olderThan);
  const includeBlobs = Boolean(commandOptions.includeBlobs);
  const apply = Boolean(commandOptions.yes);
  const mode: 'dry-run' | 'apply' = apply ? 'apply' : 'dry-run';

  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const contexts = await discoverCacheDoctorContexts(userConfig, providerFilter, identityFilter);

  const entries: CacheClearEntry[] = [];
  let touched = 0;
  let warnings = 0;
  let errors = 0;
  for (const context of contexts) {
    const result = await withCacheMaintenanceLock(
      context.cacheDir,
      `cache-clear ${context.provider}/${context.identityKey}`,
      async () => {
        const inventoryBefore = await summarizeConversationInventory(context.cacheContext);
        const cleared = await clearCacheForContext({
          cacheDir: context.cacheDir,
          provider: context.provider,
          identityKey: context.identityKey,
          dataset,
          cutoffMs: cutoff?.cutoffMs ?? null,
          includeBlobs,
          apply,
        });
        const inventoryAfter = await summarizeConversationInventory(context.cacheContext);
        return {
          ...cleared,
          inventoryBefore,
          inventoryAfter,
        };
      },
    );
    if (result.fileTargetsDeleted > 0 || result.sql.cacheEntriesDeleted > 0) touched += 1;
    warnings += result.warnings.length;
    errors += result.errors.length;
    entries.push(result);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    dataset,
    cutoffIso: cutoff?.cutoffIso ?? null,
    includeBlobs,
    filters: {
      provider: providerFilter,
      identityKey: identityFilter,
    },
    summary: {
      checked: entries.length,
      touched,
      warnings,
      errors,
    },
    entries,
  };
}

type CacheCompactEntry = {
  provider: CacheCliProvider;
  identityKey: string;
  cacheDir: string;
  sqliteExists: boolean;
  beforeBytes: number | null;
  afterBytes: number | null;
  warnings: string[];
  errors: string[];
};

type CacheCompactReport = {
  generatedAt: string;
  filters: {
    provider: string | null;
    identityKey: string | null;
  };
  summary: {
    checked: number;
    compacted: number;
    warnings: number;
    errors: number;
  };
  entries: CacheCompactEntry[];
};

async function runCacheCompact(commandOptions: OptionValues): Promise<CacheCompactReport> {
  const providerFilter =
    typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
      ? commandOptions.provider.trim()
      : null;
  if (providerFilter && !isCacheCliProvider(providerFilter)) {
    throw new Error(`Invalid provider "${providerFilter}". Use "chatgpt", "gemini", or "grok".`);
  }
  const identityFilter =
    typeof commandOptions.identityKey === 'string' && commandOptions.identityKey.trim().length > 0
      ? commandOptions.identityKey.trim()
      : null;
  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const contexts = await discoverCacheDoctorContexts(userConfig, providerFilter, identityFilter);
  const entries: CacheCompactEntry[] = [];
  let compacted = 0;
  let warnings = 0;
  let errors = 0;

  for (const context of contexts) {
    const entry = await withCacheMaintenanceLock(
      context.cacheDir,
      `cache-compact ${context.provider}/${context.identityKey}`,
      async () => {
        const dbPath = path.join(context.cacheDir, 'cache.sqlite');
        const result: CacheCompactEntry = {
          provider: context.provider,
          identityKey: context.identityKey,
          cacheDir: context.cacheDir,
          sqliteExists: false,
          beforeBytes: null,
          afterBytes: null,
          warnings: [],
          errors: [],
        };
        try {
          const before = await fs.stat(dbPath);
          result.sqliteExists = true;
          result.beforeBytes = before.size;
        } catch {
          result.warnings.push('cache.sqlite not found.');
          return result;
        }
        try {
          const sqliteModule = await import('node:sqlite');
          await withSqliteBusyRetry(`cache compact (${context.cacheDir})`, async () => {
            const db = new sqliteModule.DatabaseSync(dbPath);
            try {
              db.exec('VACUUM;');
              db.exec('ANALYZE;');
              db.exec('PRAGMA optimize;');
            } finally {
              db.close();
            }
          });
          const after = await fs.stat(dbPath);
          result.afterBytes = after.size;
          return result;
        } catch (error) {
          result.errors.push(error instanceof Error ? error.message : String(error));
          return result;
        }
      },
    );
    if (entry.errors.length > 0) errors += entry.errors.length;
    if (entry.warnings.length > 0) warnings += entry.warnings.length;
    if (entry.sqliteExists && entry.errors.length === 0) compacted += 1;
    entries.push(entry);
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      provider: providerFilter,
      identityKey: identityFilter,
    },
    summary: {
      checked: entries.length,
      compacted,
      warnings,
      errors,
    },
    entries,
  };
}

type CacheCleanupEntry = {
  provider: CacheCliProvider;
  identityKey: string;
  cacheDir: string;
  clear: CacheClearEntry;
  inventoryBefore: CacheConversationInventorySummary;
  inventoryAfter: CacheConversationInventorySummary;
  indexPruned: number;
  backupsPruned: number;
  blobFilesPruned: number;
  warnings: string[];
  errors: string[];
};

type CacheCleanupReport = {
  generatedAt: string;
  mode: 'dry-run' | 'apply';
  cutoffIso: string;
  includeBlobs: boolean;
  filters: {
    provider: string | null;
    identityKey: string | null;
  };
  summary: {
    checked: number;
    touched: number;
    warnings: number;
    errors: number;
  };
  entries: CacheCleanupEntry[];
};

async function runCacheCleanup(commandOptions: OptionValues): Promise<CacheCleanupReport> {
  const providerFilter =
    typeof commandOptions.provider === 'string' && commandOptions.provider.trim().length > 0
      ? commandOptions.provider.trim()
      : null;
  if (providerFilter && !isCacheCliProvider(providerFilter)) {
    throw new Error(`Invalid provider "${providerFilter}". Use "chatgpt", "gemini", or "grok".`);
  }
  const identityFilter =
    typeof commandOptions.identityKey === 'string' && commandOptions.identityKey.trim().length > 0
      ? commandOptions.identityKey.trim()
      : null;
  const includeBlobs = Boolean(commandOptions.includeBlobs);
  const apply = Boolean(commandOptions.yes);
  const mode: 'dry-run' | 'apply' = apply ? 'apply' : 'dry-run';
  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const cutoff = parseCutoffForCleanup(commandOptions, userConfig.browser?.cache?.cleanupDays);
  const contexts = await discoverCacheDoctorContexts(userConfig, providerFilter, identityFilter);

  const entries: CacheCleanupEntry[] = [];
  let touched = 0;
  let warnings = 0;
  let errors = 0;
  for (const context of contexts) {
    const result = await withCacheMaintenanceLock(
      context.cacheDir,
      `cache-cleanup ${context.provider}/${context.identityKey}`,
      async () => {
        const inventoryBefore = await summarizeConversationInventory(context.cacheContext);
        const clear = await clearCacheForContext({
          cacheDir: context.cacheDir,
          provider: context.provider,
          identityKey: context.identityKey,
          dataset: 'all',
          cutoffMs: cutoff.cutoffMs,
          includeBlobs,
          apply,
        });
        const indexPruned = await pruneCacheIndexEntries(context.cacheDir, cutoff.cutoffMs, apply);
        const backupsPruned = await pruneOldBackups(context.cacheDir, cutoff.cutoffMs, apply);
        const blobFilesPruned = await pruneDetachedBlobFiles(context.cacheDir, cutoff.cutoffMs, apply);
        const inventoryAfter = await summarizeConversationInventory(context.cacheContext);
        return { clear, inventoryBefore, inventoryAfter, indexPruned, backupsPruned, blobFilesPruned };
      },
    );
    const entryWarnings = [...result.clear.warnings];
    const entryErrors = [...result.clear.errors];
    warnings += entryWarnings.length;
    errors += entryErrors.length;
    if (
      result.clear.fileTargetsDeleted > 0 ||
      result.clear.sql.cacheEntriesDeleted > 0 ||
      result.indexPruned > 0 ||
      result.backupsPruned > 0 ||
      result.blobFilesPruned > 0
    ) {
      touched += 1;
    }
    entries.push({
      provider: context.provider,
      identityKey: context.identityKey,
      cacheDir: context.cacheDir,
      clear: result.clear,
      inventoryBefore: result.inventoryBefore,
      inventoryAfter: result.inventoryAfter,
      indexPruned: result.indexPruned,
      backupsPruned: result.backupsPruned,
      blobFilesPruned: result.blobFilesPruned,
      warnings: entryWarnings,
      errors: entryErrors,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    cutoffIso: cutoff.cutoffIso,
    includeBlobs,
    filters: {
      provider: providerFilter,
      identityKey: identityFilter,
    },
    summary: {
      checked: entries.length,
      touched,
      warnings,
      errors,
    },
    entries,
  };
}

function parseCacheDataset(raw: unknown): CacheDatasetName {
  if (typeof raw !== 'string' || raw.trim().length === 0) return 'all';
  const normalized = raw.trim() as CacheDatasetName;
  const valid = new Set<CacheDatasetName>([
    'all',
    'projects',
    'conversations',
    'context',
    'account-files',
    'conversation-files',
    'conversation-attachments',
    'project-knowledge',
    'project-instructions',
  ]);
  if (!valid.has(normalized)) {
    throw new Error(
      'dataset must be one of: all, projects, conversations, context, account-files, conversation-files, conversation-attachments, project-knowledge, project-instructions.',
    );
  }
  return normalized;
}

function parseCutoffFromOlderThan(raw: unknown): { cutoffMs: number; cutoffIso: string } | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Date.parse(raw.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error('older-than must be a valid date (YYYY-MM-DD or ISO timestamp).');
  }
  return { cutoffMs: parsed, cutoffIso: new Date(parsed).toISOString() };
}

function parseCutoffForCleanup(
  commandOptions: OptionValues,
  defaultDaysFromConfig?: unknown,
): { cutoffMs: number; cutoffIso: string } {
  const explicit = parseCutoffFromOlderThan(commandOptions.olderThan);
  if (explicit) return explicit;
  const configuredDays =
    typeof defaultDaysFromConfig === 'number' && Number.isFinite(defaultDaysFromConfig)
      ? Math.max(1, Math.floor(defaultDaysFromConfig))
      : null;
  const days =
    typeof commandOptions.days === 'number' && Number.isFinite(commandOptions.days)
      ? Math.max(1, Math.floor(commandOptions.days))
      : (configuredDays ?? DEFAULT_CACHE_CLEANUP_DAYS);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return { cutoffMs, cutoffIso: new Date(cutoffMs).toISOString() };
}

async function clearCacheForContext(input: {
  cacheDir: string;
  provider: CacheCliProvider;
  identityKey: string;
  dataset: CacheDatasetName;
  cutoffMs: number | null;
  includeBlobs: boolean;
  apply: boolean;
}): Promise<CacheClearEntry> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const targets = await collectCacheClearTargets(
    input.cacheDir,
    input.dataset,
    input.cutoffMs,
    input.includeBlobs,
  );
  let deletedFiles = 0;
  if (input.apply) {
    for (const target of targets) {
      try {
        if (target.kind === 'dir') {
          await fs.rm(target.path, { recursive: true, force: true });
        } else {
          await fs.rm(target.path, { force: true });
        }
        deletedFiles += 1;
      } catch (error) {
        errors.push(`Failed to remove ${target.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const sql = await clearSqlRows(
    input.cacheDir,
    input.dataset,
    input.cutoffMs,
    input.apply,
  );
  if (!sql.available) {
    warnings.push('cache.sqlite not found.');
  }
  if (sql.error) {
    errors.push(sql.error);
  }

  return {
    provider: input.provider,
    identityKey: input.identityKey,
    cacheDir: input.cacheDir,
    fileTargetsMatched: targets.length,
    fileTargetsDeleted: deletedFiles,
    sql: sql.summary,
    inventoryBefore: emptyConversationInventorySummary(),
    inventoryAfter: emptyConversationInventorySummary(),
    warnings,
    errors,
  };
}

type ClearTarget = { path: string; kind: 'file' | 'dir' };

async function collectCacheClearTargets(
  cacheDir: string,
  dataset: CacheDatasetName,
  cutoffMs: number | null,
  includeBlobs: boolean,
): Promise<ClearTarget[]> {
  const targets: ClearTarget[] = [];
  const maybeAddFile = async (filePath: string) => {
    try {
      const stat = await fs.stat(filePath);
      if (cutoffMs !== null && stat.mtimeMs >= cutoffMs) return;
      targets.push({ path: filePath, kind: 'file' });
    } catch {
      // ignore missing
    }
  };
  const maybeAddDir = async (dirPath: string, mtimePath?: string) => {
    try {
      const stat = await fs.stat(mtimePath ?? dirPath);
      if (cutoffMs !== null && stat.mtimeMs >= cutoffMs) return;
      targets.push({ path: dirPath, kind: 'dir' });
    } catch {
      // ignore
    }
  };
  const includes = (name: CacheDatasetName) => dataset === 'all' || dataset === name;

  if (includes('projects')) await maybeAddFile(path.join(cacheDir, 'projects.json'));
  if (includes('conversations')) await maybeAddFile(path.join(cacheDir, 'conversations.json'));
  if (includes('all')) await maybeAddFile(path.join(cacheDir, 'cache-index.json'));

  const collectJsonDir = async (dirName: string) => {
    const absDir = path.join(cacheDir, dirName);
    let files: Array<{ name: string; isFile: () => boolean }> = [];
    try {
      files = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      await maybeAddFile(path.join(absDir, file.name));
    }
  };

  if (includes('context')) await collectJsonDir('contexts');
  if (includes('conversation-files')) await collectJsonDir('conversation-files');

  if (includes('project-instructions')) {
    const dir = path.join(cacheDir, 'project-instructions');
    let files: Array<{ name: string; isFile: () => boolean }> = [];
    try {
      files = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      files = [];
    }
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.endsWith('.md') && !file.name.endsWith('.json')) continue;
      await maybeAddFile(path.join(dir, file.name));
    }
  }

  const collectManifestFolders = async (
    dirName: 'conversation-attachments' | 'project-knowledge',
  ) => {
    const root = path.join(cacheDir, dirName);
    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(root, entry.name);
      const manifest = path.join(folder, 'manifest.json');
      if (includeBlobs) {
        await maybeAddDir(folder, manifest);
      } else {
        await maybeAddFile(manifest);
      }
    }
  };

  if (includes('conversation-attachments')) await collectManifestFolders('conversation-attachments');
  if (includes('project-knowledge')) await collectManifestFolders('project-knowledge');

  return targets;
}

async function clearSqlRows(
  cacheDir: string,
  dataset: CacheDatasetName,
  cutoffMs: number | null,
  apply: boolean,
): Promise<{ available: boolean; error: string | null; summary: CacheClearSqlSummary }> {
  const summary: CacheClearSqlSummary = {
    cacheEntriesMatched: 0,
    cacheEntriesDeleted: 0,
    sourceLinksMatched: 0,
    sourceLinksDeleted: 0,
    fileBindingsMatched: 0,
    fileBindingsDeleted: 0,
    orphanAssetsMatched: 0,
    orphanAssetsDeleted: 0,
  };
  const dbPath = path.join(cacheDir, 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return { available: false, error: null, summary };
  }
  try {
    const sqliteModule = await import('node:sqlite');
    await withSqliteBusyRetry(`cache clear sql (${cacheDir})`, async () => {
      const db = new sqliteModule.DatabaseSync(dbPath);
      try {
        const datasetFilter = resolveSqlDatasetFilter(dataset);
        const cutoffIso = cutoffMs !== null ? new Date(cutoffMs).toISOString() : null;
        const where = buildSqlWhereClause(datasetFilter, cutoffIso);
        const candidateRows = db
          .prepare(`SELECT dataset, entity_id FROM cache_entries ${where.sql}`)
          .all(...(where.params as any[])) as Array<{ dataset?: string; entity_id?: string }>;
        summary.cacheEntriesMatched = candidateRows.length;
        const contextIds = Array.from(
          new Set(
            candidateRows
              .filter((row) => row.dataset === 'conversation-context' && typeof row.entity_id === 'string')
              .map((row) => row.entity_id as string),
          ),
        );
        const bindingPairs = candidateRows
          .filter((row) => row.dataset !== 'conversation-context')
          .map((row) => ({
            dataset: typeof row.dataset === 'string' ? row.dataset : '',
            entityId: typeof row.entity_id === 'string' ? row.entity_id : '',
          }))
          .filter((row) => row.dataset.length > 0 && row.entityId.length > 0);

        summary.sourceLinksMatched = await countWhereIn(db, 'source_links', 'conversation_id', contextIds);
        summary.fileBindingsMatched =
          (await countBindingPairs(db, bindingPairs)) +
          (await countContextBindingRows(db, contextIds));

        const orphanBefore = db
          .prepare(
            `SELECT COUNT(*) AS c
               FROM file_assets
              WHERE asset_id NOT IN (
                SELECT DISTINCT asset_id FROM file_bindings WHERE asset_id IS NOT NULL
              )`,
          )
          .get() as { c?: number };
        summary.orphanAssetsMatched = Number(orphanBefore.c ?? 0);

        if (apply) {
          if (summary.cacheEntriesMatched > 0) {
            db.prepare(`DELETE FROM cache_entries ${where.sql}`).run(...(where.params as any[]));
            summary.cacheEntriesDeleted = summary.cacheEntriesMatched;
          }
          if (contextIds.length > 0) {
            summary.sourceLinksDeleted = await deleteWhereIn(db, 'source_links', 'conversation_id', contextIds);
            summary.fileBindingsDeleted += await deleteContextBindingRows(db, contextIds);
          }
          if (bindingPairs.length > 0) {
            summary.fileBindingsDeleted += await deleteBindingPairs(db, bindingPairs);
          }
          const orphanDeleted = db.prepare(
            `DELETE FROM file_assets
              WHERE asset_id NOT IN (
                SELECT DISTINCT asset_id FROM file_bindings WHERE asset_id IS NOT NULL
              )`,
          ).run() as { changes?: number };
          summary.orphanAssetsDeleted = Number(orphanDeleted?.changes ?? 0);
        }
      } finally {
        db.close();
      }
    });
    return { available: true, error: null, summary };
  } catch (error) {
    return {
      available: true,
      error: error instanceof Error ? error.message : String(error),
      summary,
    };
  }
}

function resolveSqlDatasetFilter(dataset: CacheDatasetName): string[] | null {
  if (dataset === 'all') return null;
  const map: Record<Exclude<CacheDatasetName, 'all'>, string> = {
    projects: 'projects',
    conversations: 'conversations',
    context: 'conversation-context',
    'account-files': 'account-files',
    'conversation-files': 'conversation-files',
    'conversation-attachments': 'conversation-attachments',
    'project-knowledge': 'project-knowledge',
    'project-instructions': 'project-instructions',
  };
  return [map[dataset]];
}

function buildSqlWhereClause(
  datasets: string[] | null,
  cutoffIso: string | null,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (datasets && datasets.length > 0) {
    clauses.push(`dataset IN (${datasets.map(() => '?').join(', ')})`);
    params.push(...datasets);
  }
  if (cutoffIso) {
    clauses.push('updated_at < ?');
    params.push(cutoffIso);
  }
  if (clauses.length === 0) {
    return { sql: '', params };
  }
  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

async function countWhereIn(
  db: any,
  table: string,
  column: string,
  values: string[],
): Promise<number> {
  if (values.length === 0) return 0;
  const placeholders = values.map(() => '?').join(', ');
  const row = (db
    .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} IN (${placeholders})`)
    .get(...values) ?? {}) as { c?: number | bigint };
  return numberFromSqlValue(row.c);
}

async function deleteWhereIn(
  db: any,
  table: string,
  column: string,
  values: string[],
): Promise<number> {
  if (values.length === 0) return 0;
  const placeholders = values.map(() => '?').join(', ');
  const result = db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...values) as {
    changes?: number | bigint;
  };
  return numberFromSqlValue(result.changes);
}

async function countContextBindingRows(
  db: any,
  conversationIds: string[],
): Promise<number> {
  if (conversationIds.length === 0) return 0;
  const placeholders = conversationIds.map(() => '?').join(', ');
  const row = (db
    .prepare(
      `SELECT COUNT(*) AS c FROM file_bindings WHERE dataset = 'conversation-context' AND entity_id IN (${placeholders})`,
    )
    .get(...conversationIds) ?? {}) as { c?: number | bigint };
  return numberFromSqlValue(row.c);
}

async function deleteContextBindingRows(
  db: any,
  conversationIds: string[],
): Promise<number> {
  if (conversationIds.length === 0) return 0;
  const placeholders = conversationIds.map(() => '?').join(', ');
  const result = db
    .prepare(
      `DELETE FROM file_bindings WHERE dataset = 'conversation-context' AND entity_id IN (${placeholders})`,
    )
    .run(...conversationIds) as { changes?: number | bigint };
  return numberFromSqlValue(result.changes);
}

async function countBindingPairs(
  db: any,
  pairs: Array<{ dataset: string; entityId: string }>,
): Promise<number> {
  let count = 0;
  for (const pair of pairs) {
    const row = (db
      .prepare('SELECT COUNT(*) AS c FROM file_bindings WHERE dataset = ? AND entity_id = ?')
      .get(pair.dataset, pair.entityId) ?? {}) as { c?: number | bigint };
    count += numberFromSqlValue(row.c);
  }
  return count;
}

async function deleteBindingPairs(
  db: any,
  pairs: Array<{ dataset: string; entityId: string }>,
): Promise<number> {
  let deleted = 0;
  for (const pair of pairs) {
    const result = db
      .prepare('DELETE FROM file_bindings WHERE dataset = ? AND entity_id = ?')
      .run(pair.dataset, pair.entityId) as { changes?: number | bigint };
    deleted += numberFromSqlValue(result.changes);
  }
  return deleted;
}

async function summarizeConversationInventory(
  cacheContext: ProviderCacheContext,
): Promise<CacheConversationInventorySummary> {
  const rows = await listCachedConversationInventory(cacheContext, { limit: 10_000 });
  return rows.reduce(
    (summary, row) => ({
      conversationCount: summary.conversationCount + 1,
      messageCount: summary.messageCount + row.messageCount,
      sourceCount: summary.sourceCount + row.sourceCount,
      fileCount: summary.fileCount + row.fileCount,
      artifactCount: summary.artifactCount + row.artifactCount,
    }),
    emptyConversationInventorySummary(),
  );
}

function emptyConversationInventorySummary(): CacheConversationInventorySummary {
  return {
    conversationCount: 0,
    messageCount: 0,
    sourceCount: 0,
    fileCount: 0,
    artifactCount: 0,
  };
}

function numberFromSqlValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

async function pruneCacheIndexEntries(cacheDir: string, cutoffMs: number, apply: boolean): Promise<number> {
  const indexPath = path.join(cacheDir, 'cache-index.json');
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, 'utf8');
  } catch {
    return 0;
  }
  let parsed: { version?: number; updatedAt?: string; entries?: Array<{ path?: string; updatedAt?: string }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const keep: typeof entries = [];
  let pruned = 0;
  for (const entry of entries) {
    const relPath = typeof entry.path === 'string' ? entry.path : '';
    if (!relPath) {
      pruned += 1;
      continue;
    }
    const fullPath = path.join(cacheDir, relPath);
    let exists = true;
    try {
      await fs.access(fullPath);
    } catch {
      exists = false;
    }
    const updatedMs =
      typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt))
        ? Date.parse(entry.updatedAt)
        : 0;
    const tooOld = updatedMs > 0 && updatedMs < cutoffMs;
    if (!exists || tooOld) {
      pruned += 1;
      continue;
    }
    keep.push(entry);
  }
  if (apply && pruned > 0) {
    const next = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: keep,
    };
    await fs.writeFile(indexPath, JSON.stringify(next, null, 2), 'utf8');
  }
  return pruned;
}

async function pruneOldBackups(cacheDir: string, cutoffMs: number, apply: boolean): Promise<number> {
  const backupsDir = path.join(cacheDir, 'backups');
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(backupsDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(backupsDir, entry.name);
    let mtimeMs = 0;
    try {
      const stat = await fs.stat(folder);
      mtimeMs = stat.mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs >= cutoffMs) continue;
    count += 1;
    if (apply) {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
  return count;
}

async function pruneDetachedBlobFiles(cacheDir: string, cutoffMs: number, apply: boolean): Promise<number> {
  const blobsDir = path.join(cacheDir, 'blobs');
  let rootStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    rootStat = await fs.stat(blobsDir);
  } catch {
    return 0;
  }
  if (!rootStat.isDirectory()) return 0;

  const dbPath = path.join(cacheDir, 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return 0;
  }

  const referencedRelpaths = new Set<string>();
  try {
    const sqliteModule = await import('node:sqlite');
    await withSqliteBusyRetry(`cleanup blob references (${cacheDir})`, async () => {
      const db = new sqliteModule.DatabaseSync(dbPath);
      try {
        const rows = db
          .prepare(
            `SELECT storage_relpath
               FROM file_assets
              WHERE storage_relpath IS NOT NULL
                AND storage_relpath LIKE 'blobs/%'`,
          )
          .all() as Array<{ storage_relpath?: string }>;
        for (const row of rows) {
          const rel = typeof row.storage_relpath === 'string' ? row.storage_relpath.trim() : '';
          if (rel) referencedRelpaths.add(rel.replace(/\\/g, '/'));
        }
      } finally {
        db.close();
      }
    });
  } catch {
    return 0;
  }

  const staleCandidates = await collectBlobFileCandidates(blobsDir, cutoffMs);
  let pruned = 0;
  for (const filePath of staleCandidates) {
    const rel = path.relative(cacheDir, filePath).replace(/\\/g, '/');
    if (referencedRelpaths.has(rel)) continue;
    pruned += 1;
    if (apply) {
      await fs.rm(filePath, { force: true });
    }
  }
  if (apply && pruned > 0) {
    await pruneEmptyDirs(blobsDir);
  }
  return pruned;
}

async function collectBlobFileCandidates(root: string, cutoffMs: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < cutoffMs) {
        out.push(full);
      }
    }
  };
  await walk(root);
  return out;
}

async function pruneEmptyDirs(root: string): Promise<void> {
  const walk = async (dir: string): Promise<boolean> => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    let hasFiles = false;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const childHasFiles = await walk(full);
        hasFiles = hasFiles || childHasFiles;
      } else if (entry.isFile()) {
        hasFiles = true;
      }
    }
    if (!hasFiles && dir !== root) {
      try {
        await fs.rmdir(dir);
      } catch {
        // ignore
      }
      return false;
    }
    return hasFiles;
  };
  await walk(root);
}

async function resolveCacheSearchContext(
  commandOptions: OptionValues,
): Promise<{
  provider: import('../src/browser/providers/domain.js').ProviderId;
  cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>;
  llmService: LlmService;
  listOptions: BrowserProviderListOptions;
}> {
  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const provider = (commandOptions.provider ?? userConfig.browser?.target ?? 'chatgpt').toString().trim();
  if (!isCacheCliProvider(provider)) {
    throw new Error(`Invalid provider "${provider}". Use "chatgpt", "gemini", or "grok".`);
  }
  const resolved = await resolveCacheOperatorContext({
    provider,
    userConfig,
    identityPrompt: promptForCacheIdentity,
  });
  return {
    provider,
    llmService: resolved.llmService,
    listOptions: resolved.listOptions,
    cacheContext: resolved.cacheContext,
  };
}

async function upsertProjectCacheEntry(
  cacheContext: Awaited<ReturnType<LlmService['resolveCacheContext']>>,
  project: { id: string; name: string; provider: import('../src/browser/providers/domain.js').ProviderId; url?: string },
): Promise<void> {
  const current = await readProjectCache(cacheContext);
  const items = Array.isArray(current.items) ? [...current.items] : [];
  const idx = items.findIndex((entry) => entry.id === project.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...project };
  } else {
    items.push(project);
  }
  await writeProjectCache(cacheContext, items);
}

function filterConversationsByQuery<T extends Array<{ id?: string; title?: string }>>(
  conversations: T,
  rawFilter: unknown,
): T;
function filterConversationsByQuery(conversations: unknown, rawFilter: unknown): unknown;
function filterConversationsByQuery(conversations: unknown, rawFilter: unknown): unknown {
  if (!Array.isArray(conversations)) return conversations;
  const filter = typeof rawFilter === 'string' ? rawFilter.trim().toLowerCase() : '';
  if (!filter) return conversations;
  return conversations.filter((entry) => {
    const value = entry as { id?: string; title?: string } | null;
    const title = String(value?.title ?? '').toLowerCase();
    const id = String(value?.id ?? '').toLowerCase();
    return title.includes(filter) || id.includes(filter);
  });
}

async function resolveBrowserNameHints(options: CliOptions, userConfig: ResolvedUserConfig): Promise<void> {
  const disableProject = options.noProject === true || options.project === false;
  const projectName = disableProject
    ? ''
    : (typeof options.projectName === 'string' ? options.projectName.trim() : '');
  const conversationName = typeof options.conversationName === 'string' ? options.conversationName.trim() : '';
  const projectNameFromConfig =
    (options as { _projectNameSource?: string })._projectNameSource === 'config';
  const conversationNameFromConfig =
    (options as { _conversationNameSource?: string })._conversationNameSource === 'config';
  
  if (options.verbose) {
    console.log(chalk.dim(`[hints] projectName=${projectName} conversationName=${conversationName}`));
  }

  if (!projectName && !conversationName) {
    return;
  }
  const modelName = (options.model ?? '').toLowerCase();
  const target = modelName.startsWith('grok')
    ? 'grok'
    : modelName.startsWith('gemini')
      ? 'gemini'
      : options.browserTarget ?? userConfig.browser?.target ?? 'chatgpt';
  if (target === 'gemini') {
    return;
  }
  const configuredUrl =
    target === 'grok'
      ? options.grokUrl ?? userConfig.browser?.grokUrl ?? null
      : options.chatgptUrl ?? options.browserUrl ?? userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null;
  const llmService = createLlmService(target, userConfig, {
    identityPrompt: promptForCacheIdentity,
  });
  const listOptions = await llmService.buildListOptions(
    {
      configuredUrl,
      includeHistory: true,
      historyLimit: DEFAULT_CACHE_HISTORY_LIMIT,
    },
    {
      ensurePort: Boolean(projectName || conversationName),
    },
  );
  const cacheContext = await llmService.resolveCacheContext(listOptions);
  if (!cacheContext.identityKey) {
    console.warn(
      chalk.yellow(`Skipping cache-based name resolution: missing cache identity for ${target}.`),
    );
    return;
  }
  const normalizedListOptions = { ...listOptions, configuredUrl: listOptions.configuredUrl ?? null };
  const provider = llmService.provider;

  if (!options.projectId && projectNameFromConfig && projectName) {
    try {
      const projects = await provider.listProjects?.(normalizedListOptions);
      if (Array.isArray(projects)) {
        await writeProjectCache({ ...cacheContext, listOptions: normalizedListOptions }, projects);
      }
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Failed to refresh projects before resolving "${projectName}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  if (options.projectId) {
    const projectInput = options.projectId;
    try {
      options.projectId = await resolveProjectIdArg(llmService, projectInput, normalizedListOptions);
      console.log(chalk.dim(`Resolved project "${projectInput}" to ${options.projectId}`));
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Skipping project "${projectInput}" (not in cache). Run "auracall projects" to refresh.`,
        ),
      );
      options.projectId = undefined;
    }
  }

  if (!options.projectId && projectName) {
    try {
      options.projectId = await llmService.resolveProjectIdByName(projectName, {
        forceRefresh: projectNameFromConfig,
        allowAutoRefresh: !options.dryRun,
        allowFallback: projectNameFromConfig,
        listOptions: normalizedListOptions,
      });
      if (options.projectId) {
        console.log(chalk.dim(`Resolved project "${projectName}" to ${options.projectId}`));
      }
    } catch (error) {
      if (!projectNameFromConfig) {
        throw error;
      }
      console.warn(
        chalk.yellow(
          `Skipping default project "${projectName}" (not in cache). Run "auracall projects" to refresh.`,
        ),
      );
    }
  }
  if (!options.conversationId && conversationName) {
    try {
      const match = await llmService.resolveConversationSelector(conversationName, {
        projectId: options.projectId ?? undefined,
        forceRefresh: conversationNameFromConfig,
        allowAutoRefresh: !options.dryRun,
        listOptions: normalizedListOptions,
        noProject: disableProject,
      });
      console.log(chalk.dim(`Resolved conversation "${conversationName}" to ${match.id}`));
      options.conversationId = match.id;
    } catch (error) {
      if (!conversationNameFromConfig) {
        throw error;
      }
      console.warn(
        chalk.yellow(
          `Skipping default conversation "${conversationName}" (not in cache). Run "auracall conversations" to refresh.`,
        ),
      );
    }
  }
}

function printLocalBrowserDoctorReport(
  localReport: BrowserDoctorReportLike,
  options: {
    title?: string;
    identityStatus?: BrowserDoctorIdentityReportLike | null;
    identityReconciliation?: BrowserDoctorIdentityReconciliationLike | null;
    featureStatus?: BrowserDoctorFeatureReportLike | null;
    browserTools?: {
      report?: {
        pageProbe?: {
          blockingState?: {
            kind?: string | null;
            summary?: string | null;
            requiresHuman?: boolean | null;
          } | null;
        } | null;
      } | null;
    } | null;
    browserToolsError?: string | null;
  } = {},
): void {
  console.log(options.title ?? `Local browser state for ${localReport.target}:`);
  console.log(`- managedProfileDir: ${localReport.managedProfileDir}`);
  console.log(`- chromeProfile: ${localReport.chromeProfile}`);
  console.log(`- managedProfileExists: ${localReport.managedProfileExists ? 'yes' : 'no'}`);
  console.log(`- managedCookiePath: ${localReport.managedCookiePath ?? '(missing)'}`);
  console.log(`- chromeGoogleAccount: ${formatChromeGoogleAccount(localReport.chromeGoogleAccount)}`);
  console.log(`- sourceCookiePath: ${localReport.sourceCookiePath ?? '(none)'}`);
  console.log(
    `- sourceProfile: ${
      localReport.sourceProfile
        ? `${localReport.sourceProfile.userDataDir} (${localReport.sourceProfile.profileName})`
        : '(unknown)'
    }`,
  );
  console.log(`- browserStatePath: ${localReport.registryPath}`);
  console.log(`- browserStateEntries: ${localReport.registryEntries.length}`);
  console.log(`- staleBrowserStateEntries: ${localReport.staleRegistryEntries.length}`);
  console.log(`- legacyBrowserStateEntries: ${localReport.legacyRegistryEntries.length}`);
  if (localReport.prunedRegistryEntries > 0) {
    console.log(`- prunedBrowserStateEntries: ${localReport.prunedRegistryEntries}`);
  }
  if (localReport.managedRegistryEntry) {
    console.log(
      `- activeManagedInstance: pid ${localReport.managedRegistryEntry.pid} on ${localReport.managedRegistryEntry.host}:${localReport.managedRegistryEntry.port} (${localReport.managedRegistryEntry.alive ? 'alive' : 'stale'})`,
    );
  } else {
    console.log('- activeManagedInstance: (none)');
  }
  if (options.identityStatus) {
    const { identityStatus } = options;
    if (!identityStatus.supported) {
      console.log(
        `- accountIdentity: (${
          identityStatus.reason?.trim() || `not supported for ${identityStatus.target}`
        })`,
      );
    } else if (!identityStatus.attempted) {
      console.log('- accountIdentity: (not checked; no active managed browser instance)');
    } else if (identityStatus.identity) {
      console.log(`- accountIdentity: ${formatProviderIdentity(identityStatus.identity)}`);
    } else if (identityStatus.error) {
      console.log(`- accountIdentity: (check failed: ${identityStatus.error})`);
    } else {
      console.log('- accountIdentity: (signed-in account not detected)');
    }
  }
  if (options.identityReconciliation) {
    const reconciliation = options.identityReconciliation;
    console.log(
      `- identityReconciliation: ${reconciliation.ok ? 'ok' : 'not-ok'} (${reconciliation.status}) ${reconciliation.summary}`,
    );
    if (reconciliation.chromeGoogleAccountIsInformational) {
      console.log('- identityAuthority: provider-session proof is authoritative; Chrome browser sign-in is separate informational provenance');
    }
  }
  if (options.featureStatus) {
    const { featureStatus } = options;
    if (!featureStatus.supported) {
      console.log(
        `- detectedFeatures: (${
          featureStatus.reason?.trim() || `not supported for ${featureStatus.target}`
        })`,
      );
    } else if (!featureStatus.attempted) {
      console.log('- detectedFeatures: (not checked; no active managed browser instance)');
    } else if (featureStatus.detected) {
      console.log(`- detectedFeatures: ${JSON.stringify(featureStatus.detected)}`);
    } else if (featureStatus.error) {
      console.log(`- detectedFeatures: (check failed: ${featureStatus.error})`);
    } else {
      console.log('- detectedFeatures: (none detected)');
    }
  }
  const blockingState = options.browserTools?.report?.pageProbe?.blockingState ?? null;
  if (blockingState) {
    console.log(
      `- blockingState: ${blockingState.kind ?? 'blocked'} (${blockingState.requiresHuman ? 'manual-clear required' : 'detected'})`,
    );
    if (blockingState.summary?.trim()) {
      console.log(`- blockingSummary: ${blockingState.summary.trim()}`);
    }
    if (blockingState.requiresHuman) {
      console.log('- blockingAction: clear the page manually in the managed browser, then rerun the lowest-churn AuraCall command');
    }
  } else if (options.browserToolsError) {
    console.log(`- browserTools: (collection failed: ${options.browserToolsError})`);
  }
  if (localReport.registryEntries.length > 0) {
    const registryTable = localReport.registryEntries.map((entry) => ({
      Profile: entry.profilePath,
      Name: entry.profileName,
      Status: [
        entry.alive ? 'alive' : 'stale',
        entry.managed ? 'managed' : 'external',
        entry.legacy ? 'legacy' : null,
      ]
        .filter(Boolean)
        .join(', '),
      PID: entry.pid,
      Port: entry.port,
      Host: entry.host,
      Services: entry.services.join(', '),
    }));
    if (process.stdout.isTTY) {
      console.table(registryTable);
    } else {
      console.log(JSON.stringify(registryTable, null, 2));
    }
  }
  if (localReport.warnings.length > 0) {
    console.log('\nLocal warnings:');
    for (const warning of localReport.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printBrowserFeatureDiscoveryReport(
  target: 'chatgpt' | 'grok' | 'gemini',
  featureStatus: BrowserDoctorFeatureReportLike | null,
  options: {
    browserTools?: {
      report?: {
        pageProbe?: {
          blockingState?: {
            kind?: string | null;
            summary?: string | null;
            requiresHuman?: boolean | null;
          } | null;
        } | null;
        uiList?: {
          summary: {
            menus: number;
            menuItems: number;
            switches: number;
            uploadCandidates: number;
          };
        } | null;
      };
    } | null;
    browserToolsError?: string | null;
  } = {},
): void {
  console.log(`Live feature discovery for ${target}:`);
  if (!featureStatus) {
    console.log('- detectedFeatures: (not checked)');
  } else if (!featureStatus.supported) {
    console.log(`- detectedFeatures: (${featureStatus.reason?.trim() || `not supported for ${target}`})`);
  } else if (!featureStatus.attempted) {
    console.log('- detectedFeatures: (not checked; no active managed browser instance)');
  } else if (featureStatus.detected) {
    console.log(`- detectedFeatures: ${JSON.stringify(featureStatus.detected)}`);
  } else if (featureStatus.error) {
    console.log(`- detectedFeatures: (check failed: ${featureStatus.error})`);
  } else {
    console.log('- detectedFeatures: (none detected)');
  }

  const uiListSummary = options.browserTools?.report?.uiList?.summary ?? null;
  if (uiListSummary) {
    console.log(
      `- browserToolsUiList: menus=${uiListSummary.menus}, menuItems=${uiListSummary.menuItems}, switches=${uiListSummary.switches}, uploadCandidates=${uiListSummary.uploadCandidates}`,
    );
  }
  const blockingState = options.browserTools?.report?.pageProbe?.blockingState ?? null;
  if (blockingState) {
    console.log(
      `- blockingState: ${blockingState.kind ?? 'blocked'} (${blockingState.requiresHuman ? 'manual-clear required' : 'detected'})`,
    );
    if (blockingState.summary?.trim()) {
      console.log(`- blockingSummary: ${blockingState.summary.trim()}`);
    }
    if (blockingState.requiresHuman) {
      console.log('- blockingAction: clear the page manually in the managed browser, then rerun the lowest-churn AuraCall command');
    }
  }
  if (options.browserToolsError) {
    console.log(`- browserTools: (collection failed: ${options.browserToolsError})`);
  }
}

type RuntimeBlockingStateLike = {
  kind?: string | null;
  summary?: string | null;
  requiresHuman?: boolean | null;
};

function getRuntimeBlockingState(
  browserTools:
    | {
        report?: {
          pageProbe?: {
            blockingState?: RuntimeBlockingStateLike | null;
          } | null;
        } | null;
      }
    | null
    | undefined,
): RuntimeBlockingStateLike | null {
  return browserTools?.report?.pageProbe?.blockingState ?? null;
}

function printBlockingStateGuidance(blockingState: RuntimeBlockingStateLike, options: { prefix?: string } = {}): void {
  const prefix = options.prefix?.trim();
  const summary = blockingState.summary?.trim() || 'Blocking page detected.';
  console.log('');
  console.log(chalk.yellow(prefix ? `${prefix}: ${summary}` : summary));
  console.log(
    chalk.dim(
      'Clear the page manually in the managed browser, then rerun the lowest-churn AuraCall command.',
    ),
  );
}

function formatChromeGoogleAccount(
  account: BrowserDoctorReportLike['chromeGoogleAccount'],
): string {
  if (!account) {
    return '(not detected from Local State)';
  }
  if (account.status === 'signed-in') {
    const name = account.displayName ?? account.givenName ?? account.profileName ?? 'Google account';
    const email = account.email ? ` <${account.email}>` : '';
    const consent = account.consentedPrimaryAccount ? 'consented' : 'unconsented';
    const browserSignin = account.explicitBrowserSignin ? 'browser-signin' : 'no-browser-signin-flag';
    return `${name}${email} [${account.source}; ${consent}; ${browserSignin}; activeAccounts=${account.activeAccounts}]`;
  }
  if (account.status === 'inconclusive') {
    return `(active Google-account markers present, but no primary account identity; ${account.source}; activeAccounts=${account.activeAccounts})`;
  }
  return '(signed-in Google account not detected)';
}

function formatProviderIdentity(identity: ProviderUserIdentity): string {
  const parts: string[] = [];
  if (identity.name?.trim()) {
    parts.push(identity.name.trim());
  }
  if (identity.handle?.trim()) {
    parts.push(identity.handle.trim());
  }
  if (identity.email?.trim()) {
    parts.push(`<${identity.email.trim()}>`);
  }
  const core = parts.length > 0 ? parts.join(' ') : identity.id?.trim() || '(unknown)';
  return identity.source?.trim() ? `${core} [${identity.source.trim()}]` : core;
}

function resolveBrowserLoginLaunchOptions(
  commandOptions: Pick<
    CliOptions,
    | 'browserChromePath'
    | 'browserChromeProfile'
    | 'browserCookiePath'
    | 'browserBootstrapCookiePath'
    | 'browserDisplay'
    | 'browserManualLoginProfileDir'
    | 'browserWslChrome'
    | 'chatgptUrl'
    | 'geminiUrl'
    | 'grokUrl'
  >,
  userConfig: ResolvedUserConfig,
  target: 'chatgpt' | 'gemini' | 'grok',
): BrowserLoginLaunchOptions {
  const activeRuntimeProfile = getPreferredRuntimeProfile(userConfig, {
    explicitProfileName: userConfig.auracallProfile ?? null,
  });
  const browserProfileName = getRuntimeProfileBrowserProfileId(activeRuntimeProfile) ?? userConfig.auracallProfile ?? null;
  const resolvedBrowser = resolveBrowserConfig({
    ...userConfig.browser,
    chromePath: commandOptions.browserChromePath ?? userConfig.browser?.chromePath ?? undefined,
    chromeProfile: commandOptions.browserChromeProfile ?? userConfig.browser?.chromeProfile ?? undefined,
    chromeCookiePath: commandOptions.browserCookiePath ?? userConfig.browser?.chromeCookiePath ?? undefined,
    bootstrapCookiePath:
      commandOptions.browserBootstrapCookiePath ?? userConfig.browser?.bootstrapCookiePath ?? undefined,
    wslChromePreference: commandOptions.browserWslChrome ?? userConfig.browser?.wslChromePreference ?? undefined,
    display: commandOptions.browserDisplay ?? userConfig.browser?.display ?? undefined,
    manualLogin: true,
    manualLoginProfileDir:
      commandOptions.browserManualLoginProfileDir ??
      userConfig.browser?.manualLoginProfileDir ??
      resolveManagedProfileDirForUserConfig(userConfig, target),
    target,
  }, {
    auracallProfileName: userConfig.auracallProfile ?? null,
    browserProfileName,
  });
  const chromePath = resolvedBrowser.chromePath ?? undefined;
  if (!chromePath) {
    throw new Error('Missing browser chromePath. Set browser.chromePath in config or pass --browser-chrome-path.');
  }
  const manualLoginProfileDir = resolvedBrowser.manualLoginProfileDir;
  if (!manualLoginProfileDir) {
    throw new Error('Unable to resolve a manual-login Chrome profile directory.');
  }
  return {
    chromePath,
    chromeProfile: resolvedBrowser.chromeProfile ?? 'Default',
    manualLoginProfileDir,
    cookiePath: resolvedBrowser.chromeCookiePath ?? undefined,
    bootstrapCookiePath: resolvedBrowser.bootstrapCookiePath ?? resolvedBrowser.chromeCookiePath ?? undefined,
    chatgptUrl:
      commandOptions.chatgptUrl ??
      userConfig.browser?.chatgptUrl ??
      userConfig.browser?.url ??
      CHATGPT_URL,
    geminiUrl: commandOptions.geminiUrl ?? userConfig.browser?.geminiUrl ?? 'https://gemini.google.com/app',
    grokUrl: commandOptions.grokUrl ?? userConfig.browser?.grokUrl ?? GROK_URL,
  };
}

function resolveSetupLaunchUrl(
  target: 'chatgpt' | 'gemini' | 'grok',
  launchOptions: BrowserLoginLaunchOptions,
): string {
  switch (target) {
    case 'gemini':
      return launchOptions.geminiUrl;
    case 'grok':
      return launchOptions.grokUrl;
    case 'chatgpt':
    default:
      return launchOptions.chatgptUrl;
  }
}

async function waitForSetupLoginConfirmation(target: 'chatgpt' | 'gemini' | 'grok'): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(chalk.dim(`Non-interactive terminal detected; continuing ${target} setup without waiting for login confirmation.`));
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`Finish signing into ${target} in the opened browser, then press Enter to continue setup. `);
  } finally {
    rl.close();
  }
}

async function acquireBrowserSetupOperation(options: {
  target: 'chatgpt' | 'gemini' | 'grok';
  manualLoginProfileDir: string;
}): Promise<BrowserOperationAcquiredResult> {
  const dispatcher = createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const acquired = await dispatcher.acquire({
    managedProfileDir: options.manualLoginProfileDir,
    serviceTarget: options.target,
    kind: 'setup',
    operationClass: 'exclusive-human',
    ownerCommand: 'setup',
  });
  if (!acquired.acquired) {
    throw new Error(formatBrowserOperationBusyResult(acquired));
  }
  return acquired;
}

async function withStdoutRedirectedToStderr<T>(callback: () => Promise<T>): Promise<T> {
  const stdout = process.stdout as NodeJS.WriteStream & { write: typeof process.stdout.write };
  const originalWrite = stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  stdout.write = ((chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void), cb?: (error?: Error | null) => void) => {
    if (typeof encoding === 'function') {
      return stderrWrite(chunk as never, encoding);
    }
    return stderrWrite(chunk as never, encoding, cb);
  }) as typeof process.stdout.write;
  try {
    return await callback();
  } finally {
    stdout.write = originalWrite as typeof process.stdout.write;
  }
}

async function loadWritableUserConfigForWizard(): Promise<UserConfig> {
  const userPath = configPath();
  try {
    const raw = await fs.readFile(userPath, 'utf8');
    return materializeConfigV2(normalizeConfigV1toV2(JSON5.parse(raw) as UserConfig));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      const scaffolded = await scaffoldDefaultConfigFile({ path: userPath, force: false, targetShape: true });
      if (scaffolded) {
        return materializeConfigV2(normalizeConfigV1toV2(scaffolded.config));
      }
      return { version: 2, model: DEFAULT_MODEL, browser: {}, profiles: {} };
    }
    throw error;
  }
}

async function writeWizardUserConfig(config: UserConfig, options: { targetShape?: boolean } = {}): Promise<string> {
  const userPath = configPath();
  const materialized = materializeConfigV2(config, { targetShape: options.targetShape ?? true });
  await fs.mkdir(path.dirname(userPath), { recursive: true });
  await fs.writeFile(userPath, `${JSON.stringify(materialized, null, 2)}\n`, 'utf8');
  return userPath;
}

function resolveDefaultBrowserWizardChoiceIndex(
  choices: BrowserWizardChoice[],
  userConfig: ResolvedUserConfig,
): number {
  return pickPreferredBrowserWizardChoiceIndex(choices, {
    configuredChromePath: userConfig.browser?.chromePath ?? null,
    wslChromePreference: userConfig.browser?.wslChromePreference ?? null,
  });
}

async function runBrowserSetupCommand(commandOptions: SetupCommandOptions): Promise<void> {
  const jsonMode = Boolean(commandOptions.json);
  const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
  const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
  const target = resolveBrowserSetupTarget({
    explicitTarget: commandOptions.target,
    aliasChatgpt: Boolean(commandOptions.chatgpt),
    aliasGemini: Boolean(commandOptions.gemini),
    aliasGrok: Boolean(commandOptions.grok),
    fallbackTarget: userConfig.browser?.target ?? 'chatgpt',
  });
  const launchOptions = resolveBrowserLoginLaunchOptions(commandOptions, userConfig, target);
  const setupOperation = await acquireBrowserSetupOperation({
    target,
    manualLoginProfileDir: launchOptions.manualLoginProfileDir,
  });
  try {
  const {
    inspectBrowserDoctorState,
    inspectBrowserDoctorIdentity,
    collectBrowserFeatureRuntime,
    createAuracallBrowserDoctorContract,
  } = await import('../src/browser/profileDoctor.js');
  const managedProfileSeedPolicy = commandOptions.forceReseedManagedProfile ? 'force-reseed' : 'bootstrap-only';
  const initialLaunchUrl = resolveSetupLaunchUrl(target, launchOptions);

  const localReport = await inspectBrowserDoctorState(userConfig, {
    target,
    pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
  });
  const initialIdentityStatus = await inspectBrowserDoctorIdentity(userConfig, {
    target,
    localReport,
  });
  const initialDoctorContract = createAuracallBrowserDoctorContract({
    target,
    localReport,
    identityStatus: initialIdentityStatus,
  });
  const loginReport: import('../src/cli/browserSetup.js').BrowserSetupLoginStep = {
    status: commandOptions.skipLogin ? 'skipped' : 'completed',
    exportCookies: Boolean(commandOptions.exportCookies),
    managedProfileSeedPolicy,
    manualLoginProfileDir: launchOptions.manualLoginProfileDir,
    chromeProfile: launchOptions.chromeProfile,
    launchTargetUrl: initialLaunchUrl,
    error: null,
  };
  const verificationReport: import('../src/cli/browserSetup.js').BrowserSetupVerificationStep = {
    status: commandOptions.skipVerify ? 'skipped' : 'completed',
    model: null,
    prompt: null,
    sessionId: null,
    error: null,
  };
  let finalDoctorContract: import('../src/browser/profileDoctor.js').AuracallBrowserDoctorContract | null = null;
  let finalDoctorError: string | null = null;
  let setupFailed = false;

  if (!jsonMode) {
    printLocalBrowserDoctorReport(localReport, {
      title: `Managed profile setup for ${target}:`,
      identityStatus: initialIdentityStatus,
    });
  }

  const runSetupFlow = async () => {
    if (!commandOptions.skipLogin) {
      console.log('');
      console.log(
        chalk.dim(
          `Opening ${target} with managed profile ${launchOptions.manualLoginProfileDir} (${launchOptions.chromeProfile}).`,
        ),
      );
      try {
        const client = await BrowserAutomationClient.fromConfig(userConfig, {
          target: target === 'grok' ? 'grok' : 'chatgpt',
        });
        await client.login({
          target,
          ...launchOptions,
          exportCookies: Boolean(commandOptions.exportCookies),
          managedProfileSeedPolicy,
        });
        if (!commandOptions.skipVerify) {
          await waitForSetupLoginConfirmation(target);
        }
      } catch (error) {
        loginReport.status = 'failed';
        loginReport.error = error instanceof Error ? error.message : String(error);
        setupFailed = true;
      }
    } else {
      console.log(chalk.dim(`Skipping login launch; reusing managed profile ${launchOptions.manualLoginProfileDir}.`));
    }

    if (commandOptions.skipVerify || setupFailed) {
      if (!commandOptions.skipVerify && setupFailed) {
        verificationReport.status = 'skipped';
      }
      return;
    }

    const preVerifyLocalReport = await inspectBrowserDoctorState(userConfig, {
      target,
      pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
    });
    const preVerifyRuntime = await collectBrowserFeatureRuntime(target, preVerifyLocalReport);
    const preVerifyBlockingState = preVerifyRuntime.browserTools?.report?.pageProbe?.blockingState ?? null;
    if (preVerifyBlockingState?.requiresHuman) {
      verificationReport.status = 'failed';
      verificationReport.error = preVerifyBlockingState.summary;
      setupFailed = true;
      if (!jsonMode) {
        console.log('');
        console.log(
          chalk.yellow(
            `Blocking page detected before verification: ${preVerifyBlockingState.summary}`,
          ),
        );
        console.log(
          chalk.dim(
            'Clear the page manually in the managed browser, then rerun the lowest-churn AuraCall command.',
          ),
        );
      }
      return;
    }

    const verifyModel = resolveSetupVerificationModel({
      target,
      resolvedModel: userConfig.model,
      modelSource: program.getOptionValueSource?.('model') ?? null,
    });
    const verifyPrompt =
      typeof commandOptions.verifyPrompt === 'string' && commandOptions.verifyPrompt.trim().length > 0
        ? commandOptions.verifyPrompt.trim()
        : defaultSetupVerificationPrompt(target);
    verificationReport.model = verifyModel;
    verificationReport.prompt = verifyPrompt;
    const browserConfig = await buildBrowserConfig({
      ...cliOptions,
      auracallProfileName: userConfig.auracallProfile ?? 'default',
      selectedAgentId:
        typeof (cliOptions as CliOptions).agent === 'string'
          ? (cliOptions as CliOptions).agent?.trim() || null
          : null,
      managedProfileRoot: userConfig.browser.managedProfileRoot ?? null,
      model: verifyModel,
      browserTarget: target,
      browserChatgptMode:
        (cliOptions as CliOptions).browserChatgptMode ?? userConfig.browser.chatgptMode,
      browserChatgptToolApproval:
        (cliOptions as CliOptions).browserChatgptToolApproval ??
        userConfig.browser.chatgptToolApproval,
      browserWorkModel: (cliOptions as CliOptions).browserWorkModel ?? userConfig.browser.workModel,
      browserManualLogin: true,
      browserManualLoginProfileDir: launchOptions.manualLoginProfileDir,
      browserChromeProfile: launchOptions.chromeProfile,
      browserChromePath: launchOptions.chromePath,
      browserCookiePath: launchOptions.cookiePath,
      browserBootstrapCookiePath: launchOptions.bootstrapCookiePath,
      browserDisplay: commandOptions.browserDisplay ?? userConfig.browser?.display,
      browserWslChrome: commandOptions.browserWslChrome ?? userConfig.browser?.wslChromePreference,
      chatgptUrl: launchOptions.chatgptUrl,
      geminiUrl: launchOptions.geminiUrl,
      grokUrl: launchOptions.grokUrl,
      browserKeepBrowser: cliOptions.browserKeepBrowser ?? userConfig.browser.keepBrowser,
      verbose: Boolean(cliOptions.verbose),
    });

    await sessionStore.ensureStorage();
    const verificationNotifications: NotificationSettings = { enabled: false, sound: false };
    const sessionMeta = await sessionStore.createSession(
      {
        prompt: verifyPrompt,
        model: verifyModel,
        selectedAgentId:
          typeof (cliOptions as CliOptions).agent === 'string' ? (cliOptions as CliOptions).agent?.trim() || null : null,
        mode: 'browser',
        browserConfig,
        file: [],
        verbose: Boolean(cliOptions.verbose),
        browserAttachments: 'auto',
        browserInlineFiles: false,
        browserBundleFiles: false,
      },
      process.cwd(),
      verificationNotifications,
    );
    verificationReport.sessionId = sessionMeta.id;

    console.log('');
    console.log(
      chalk.dim(
        `Running verification with ${verifyModel} against the managed ${target} profile. Session: ${sessionMeta.id}`,
      ),
    );
    try {
      await runInteractiveSession(
        sessionMeta,
        {
          prompt: verifyPrompt,
          model: verifyModel,
          effectiveModelId: verifyModel,
          file: [],
          verbose: Boolean(cliOptions.verbose),
          browserAttachments: 'auto',
          browserInlineFiles: false,
          browserBundleFiles: false,
        },
        'browser',
        browserConfig,
        false,
        verificationNotifications,
        userConfig,
        false,
        {
          providerSessionAuthorization:
            buildRootBrowserProviderSessionAuthorization(userConfig, browserConfig) ?? undefined,
        },
      );
    } catch (error) {
      verificationReport.status = 'failed';
      verificationReport.error = error instanceof Error ? error.message : String(error);
      setupFailed = true;
    }
  };

  if (jsonMode) {
    await withStdoutRedirectedToStderr(runSetupFlow);
  } else {
    await runSetupFlow();
  }

  try {
    const finalLocalReport = await inspectBrowserDoctorState(userConfig, {
      target,
      pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
    });
    const finalRuntime = await collectBrowserFeatureRuntime(target, finalLocalReport);
    const finalIdentityStatus = await inspectBrowserDoctorIdentity(userConfig, {
      target,
      localReport: finalLocalReport,
    });
    finalDoctorContract = createAuracallBrowserDoctorContract({
      target,
      localReport: finalLocalReport,
      identityStatus: finalIdentityStatus,
      browserTools: finalRuntime.browserTools,
      browserToolsError: finalRuntime.browserToolsError,
    });
    const finalBlockingState = finalRuntime.browserTools?.report?.pageProbe?.blockingState ?? null;
    if (finalBlockingState?.requiresHuman) {
      setupFailed = true;
    }

    if (!jsonMode) {
      console.log('');
      printLocalBrowserDoctorReport(finalLocalReport, {
        title: commandOptions.skipVerify
          ? `Managed profile state after setup for ${target}:`
          : `Managed profile state after verification for ${target}:`,
        identityStatus: finalIdentityStatus,
        browserTools: finalRuntime.browserTools,
        browserToolsError: finalRuntime.browserToolsError,
      });
      if (commandOptions.skipVerify) {
        console.log(chalk.dim('Skipping live verification (--skip-verify).'));
      }
    }
  } catch (error) {
    finalDoctorError = error instanceof Error ? error.message : String(error);
    setupFailed = true;
  }

  if (jsonMode) {
    const contract = createAuracallBrowserSetupContract({
      target,
      initialDoctor: initialDoctorContract,
      finalDoctor: finalDoctorContract,
      finalDoctorError,
      login: loginReport,
      verification: verificationReport,
    });
    console.log(JSON.stringify(contract, null, 2));
  }

  if (setupFailed) {
    process.exitCode = 1;
  }
  } finally {
    await setupOperation.release();
  }
}

async function buildBrowserContext({
  options,
  userConfig,
  browserConfig,
  model,
}: {
  options: CliOptions;
  userConfig: ResolvedUserConfig;
  browserConfig?: BrowserSessionConfig;
  model: string;
}): Promise<BrowserContextMetadata | null> {
  if (!browserConfig) {
    return null;
  }
  const target = browserConfig.target ?? (model.toLowerCase().startsWith('grok') ? 'grok' : 'chatgpt');
  if (target === 'gemini') {
    return null;
  }
  const configuredUrl =
    target === 'grok'
      ? browserConfig.grokUrl ?? userConfig.browser?.grokUrl ?? null
      : browserConfig.chatgptUrl ?? browserConfig.url ?? userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null;
  const projectName = options.projectName ? options.projectName.trim() : null;
  const conversationName = options.conversationName ? options.conversationName.trim() : null;
  const llmService = createLlmService(target, userConfig);
  const listOptions = await llmService.buildListOptions({ configuredUrl, skipFeatureSignature: true });
  let cacheKey: string | null = null;
  try {
    const identity = await resolveNonInteractiveBrowserContextIdentity(llmService, listOptions);
    if (identity.identityKey) {
      cacheKey = resolveProviderCacheKey({ provider: target, userConfig, listOptions, ...identity });
    }
  } catch {
    cacheKey = null;
  }
  return {
    provider: target,
    projectId: browserConfig.projectId ?? null,
    projectName: projectName?.length ? projectName : null,
    conversationId: browserConfig.conversationId ?? null,
    conversationName: conversationName?.length ? conversationName : null,
    configuredUrl,
    cacheKey,
  };
}

function applyBrowserLaunchUrl({
  browserConfig,
  userConfig,
  model,
}: {
  browserConfig?: BrowserSessionConfig;
  userConfig: ResolvedUserConfig;
  model: string;
}): void {
  if (!browserConfig) return;
  const target = browserConfig.target ?? (model.toLowerCase().startsWith('grok') ? 'grok' : 'chatgpt');
  if (target === 'gemini') {
    return;
  }
  const configuredUrl =
    target === 'grok'
      ? browserConfig.grokUrl ?? userConfig.browser?.grokUrl ?? null
      : browserConfig.chatgptUrl ??
        browserConfig.url ??
        userConfig.browser?.chatgptUrl ??
        userConfig.browser?.url ??
        null;
  const llmService = createLlmService(target, userConfig);
  const resolvedUrl = llmService.resolveLaunchUrl({
    configuredUrl,
    projectId: browserConfig.projectId ?? null,
    conversationId: browserConfig.conversationId ?? null,
  });
  if (!resolvedUrl) return;
  if (target === 'grok') {
    browserConfig.grokUrl = resolvedUrl;
  } else {
    browserConfig.url = resolvedUrl;
    browserConfig.chatgptUrl = resolvedUrl;
  }
}

program
  .command('wizard')
  .description('Guided first-run browser onboarding for ChatGPT, Gemini, or Grok.')
  .option('--chatgpt', 'Preselect ChatGPT in the wizard.')
  .option('--gemini', 'Preselect Gemini in the wizard.')
  .option('--grok', 'Preselect Grok in the wizard.')
  .option('--target <chatgpt|gemini|grok>', 'Preselect which site to bootstrap.')
  .option('--profile-name <name>', 'Preselect the AuraCall runtime profile name to create or update.')
  .option('--target-shape', 'Write explicit target-shape keys (`browserProfiles` / `runtimeProfiles`). This is the default.', false)
  .option('--bridge-shape', 'Write compatibility bridge keys (`browserFamilies` / `profiles`) instead of the primary target shape.', false)
  .action(async (commandOptions) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('The onboarding wizard requires an interactive terminal. Use "auracall setup" with flags instead.');
    }

    if (commandOptions.targetShape && commandOptions.bridgeShape) {
      throw new Error('Do not combine --target-shape with --bridge-shape.');
    }

    const targetShape = commandOptions.bridgeShape ? false : true;
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const discoveredChoices = discoverBrowserWizardChoices();
    if (discoveredChoices.length === 0) {
      throw new Error(
        'No supported Chrome/Chromium profile was detected. Configure browser.chromePath/browser.chromeCookiePath and rerun "auracall setup".',
      );
    }

    const defaultTarget = resolveBrowserSetupTarget({
      explicitTarget: commandOptions.target,
      aliasChatgpt: Boolean(commandOptions.chatgpt),
      aliasGemini: Boolean(commandOptions.gemini),
      aliasGrok: Boolean(commandOptions.grok),
      fallbackTarget: userConfig.browser?.target ?? 'chatgpt',
    });
    const defaultChoiceIndex = resolveDefaultBrowserWizardChoiceIndex(discoveredChoices, userConfig);
    const wizardChoiceOptions = discoveredChoices.map((choice) => ({
      label: formatBrowserWizardChoiceLabel(choice),
      choice,
    }));
    const initialProfileName =
      typeof commandOptions.profileName === 'string' && commandOptions.profileName.trim().length > 0
        ? commandOptions.profileName.trim()
        : typeof cliOptions.profile === 'string' && cliOptions.profile.trim().length > 0
          ? cliOptions.profile.trim()
          : suggestBrowserWizardProfileName(discoveredChoices[defaultChoiceIndex] ?? discoveredChoices[0]);

    const { default: inquirer } = await import('inquirer');
    const answers = await inquirer.prompt<{
      target: 'chatgpt' | 'gemini' | 'grok';
      choiceKey: string;
      profileName: string;
      setAsDefault: boolean;
      verifyNow: boolean;
      keepBrowser: boolean;
      confirmWrite: boolean;
    }>([
      {
        type: 'list',
        name: 'target',
        message: 'Which browser service do you want to set up?',
        default: defaultTarget,
        choices: [
          { name: 'ChatGPT', value: 'chatgpt' },
          { name: 'Gemini', value: 'gemini' },
          { name: 'Grok', value: 'grok' },
        ],
      },
      {
        type: 'list',
        name: 'choiceKey',
        message: 'Which browser/profile source should Aura-Call use?',
        default: wizardChoiceOptions[defaultChoiceIndex]?.label ?? wizardChoiceOptions[0]?.label,
        choices: wizardChoiceOptions.map(({ label }) => ({
          name: label,
          value: label,
        })),
      },
      {
        type: 'input',
        name: 'profileName',
        message: 'What AuraCall runtime profile name should this setup use?',
        default: (promptAnswers) => {
          if (initialProfileName) {
            return initialProfileName;
          }
          const selectedChoice =
            wizardChoiceOptions.find((option) => option.label === promptAnswers.choiceKey)?.choice ??
            wizardChoiceOptions[defaultChoiceIndex]?.choice ??
            discoveredChoices[0];
          return suggestBrowserWizardProfileName(selectedChoice);
        },
        validate: (value) => validateBrowserWizardProfileName(value) ?? true,
      },
      {
        type: 'confirm',
        name: 'setAsDefault',
        message: 'Make this the default AuraCall runtime profile?',
        default: (() => {
          const currentProfile = userConfig.auracallProfile?.trim();
          if (!currentProfile) {
            return true;
          }
          return currentProfile === initialProfileName;
        })(),
      },
      {
        type: 'confirm',
        name: 'verifyNow',
        message: 'Run a live verification prompt after login?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'keepBrowser',
        message: 'Keep the browser open after setup?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'confirmWrite',
        message: (promptAnswers) => {
          const selectedChoice =
            wizardChoiceOptions.find((option) => option.label === promptAnswers.choiceKey)?.choice ??
            wizardChoiceOptions[defaultChoiceIndex]?.choice ??
            discoveredChoices[0];
          const confirmedProfileName = promptAnswers.profileName?.trim() || initialProfileName || 'default';
          const action = promptAnswers.setAsDefault ? 'create/update and activate' : 'create/update';
          return [
            `${action} AuraCall runtime profile "${confirmedProfileName}" in ${configPath()}?`,
            `target=${promptAnswers.target}`,
            `browser=${selectedChoice.runtime}/${selectedChoice.family ?? 'browser'}`,
            `browserProfile=${confirmedProfileName}`,
            `verify=${promptAnswers.verifyNow ? 'yes' : 'no'}`,
            `keepBrowser=${promptAnswers.keepBrowser ? 'yes' : 'no'}`,
          ].join('\n');
        },
        default: true,
      },
    ]);

    if (!answers.confirmWrite) {
      console.log(chalk.yellow('Cancelled without changing your Aura-Call config.'));
      return;
    }

    const selectedChoice =
      wizardChoiceOptions.find((option) => option.label === answers.choiceKey)?.choice ?? discoveredChoices[0];
    const profileName = answers.profileName.trim();
    const baseConfig = await loadWritableUserConfigForWizard();
    const existingProfile = baseConfig.profiles?.[profileName];
    const mergedConfig = materializeConfigV2(
      mergeWizardConfig(
        normalizeConfigV1toV2(baseConfig),
        buildBrowserWizardConfigPatch({
          target: answers.target,
          profileName,
          setAsDefault: answers.setAsDefault,
          keepBrowser: answers.keepBrowser,
          choice: selectedChoice,
        }),
      ),
      { targetShape },
    );
    const writtenPath = await writeWizardUserConfig(mergedConfig, { targetShape });

    console.log('');
    if (targetShape) {
      console.log(chalk.dim('Write mode: target-shape (`browserProfiles` / `runtimeProfiles`).'));
    } else {
      console.log(chalk.dim('Write mode: compatibility bridge (`browserFamilies` / `profiles`).'));
    }
    const wizardBridgeSummary = buildRuntimeProfileBridgeSummary(mergedConfig as Record<string, unknown>, {
      explicitProfileName: profileName,
    });
    console.log(
      chalk.dim(
        `${existingProfile ? 'Updated' : 'Created'} ${formatRuntimeProfileBridgeSummary(wizardBridgeSummary)} in ${writtenPath}.`,
      ),
    );

    await runBrowserSetupCommand({
      ...commandOptions,
      target: answers.target,
      profile: profileName,
      auracallProfile: profileName,
      browserKeepBrowser: answers.keepBrowser,
      skipVerify: !answers.verifyNow,
      pruneBrowserState: true,
    });
  });

program
  .command('setup')
  .description('Bootstrap a managed browser profile for ChatGPT, Gemini, or Grok, then verify it with a real browser run.')
  .option('--chatgpt', 'Alias for --target chatgpt.')
  .option('--gemini', 'Alias for --target gemini.')
  .option('--grok', 'Alias for --target grok.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which site to bootstrap and verify.')
  .option('--chatgpt-url <url>', 'Override the ChatGPT URL for setup/login.')
  .option('--gemini-url <url>', 'Override the Gemini web URL for setup/login.')
  .option('--grok-url <url>', 'Override the Grok URL for setup/login.')
  .option('--prune-browser-state', 'Remove dead entries from ~/.auracall/browser-state.json before reporting.')
  .option('--skip-login', 'Skip opening the login browser and only run the verification step.')
  .option('--skip-verify', 'Stop after local inspection/login; do not send a live verification prompt.')
  .option('--verify-prompt <text>', 'Prompt to use for the verification browser run.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--export-cookies', 'Export Gemini cookies to ~/.auracall/cookies.json while you sign in.')
  .option('--force-reseed-managed-profile', 'Rebuild the managed Aura-Call browser profile from the source Chrome profile before login.')
  .addOption(new Option('--browser-chrome-path <path>', 'Chrome/Chromium executable path.'))
  .addOption(new Option('--browser-chrome-profile <name>', 'Chrome profile name to launch.'))
  .addOption(new Option('--browser-cookie-path <path>', 'Cookie DB path to infer the source browser profile.'))
  .addOption(
    new Option(
      '--browser-bootstrap-cookie-path <path>',
      'Source cookie DB path to seed the managed Aura-Call browser profile before login/setup.',
    ),
  )
  .addOption(new Option('--browser-display <value>', 'Override DISPLAY when launching Chrome on Linux.'))
  .addOption(new Option('--browser-manual-login-profile-dir <path>', 'Managed profile directory override.'))
  .addOption(
    new Option(
      '--browser-wsl-chrome <auto|wsl|windows>',
      'On WSL, prefer WSL-native Chrome or Windows-hosted Chrome (default: auto).',
    )
      .choices(['auto', 'wsl', 'windows']),
  )
  .action(async (commandOptions) => {
    await runBrowserSetupCommand(commandOptions);
  });

program
  .command('login')
  .description('Launch the configured managed browser profile for ChatGPT, Gemini, or Grok sign-in.')
  .option('--chatgpt', 'Alias for --target chatgpt.')
  .option('--gemini', 'Alias for --target gemini.')
  .option('--grok', 'Alias for --target grok.')
  .option('--target <chatgpt|gemini|grok>', 'Choose which site to open (chatgpt, gemini, or grok).')
  .option('--chatgpt-url <url>', 'Override the ChatGPT URL for login.')
  .option('--gemini-url <url>', 'Override the Gemini web URL for login.')
  .option('--grok-url <url>', 'Override the Grok URL for login.')
  .option('--export-cookies', 'Export Gemini cookies to ~/.auracall/cookies.json while you sign in.')
  .option('--force-reseed-managed-profile', 'Rebuild the managed Aura-Call browser profile from the source Chrome profile before opening login.')
  .addOption(new Option('--browser-chrome-path <path>', 'Chrome/Chromium executable path.'))
  .addOption(new Option('--browser-chrome-profile <name>', 'Chrome profile name to launch.'))
  .addOption(new Option('--browser-cookie-path <path>', 'Cookie DB path to infer the source browser profile.'))
  .addOption(
    new Option(
      '--browser-bootstrap-cookie-path <path>',
      'Source cookie DB path to seed the managed Aura-Call browser profile before opening login.',
    ),
  )
  .addOption(new Option('--browser-display <value>', 'Override DISPLAY when launching Chrome on Linux.'))
  .addOption(new Option('--browser-manual-login-profile-dir <path>', 'Manual-login profile directory override.'))
  .addOption(
    new Option(
      '--browser-wsl-chrome <auto|wsl|windows>',
      'On WSL, prefer WSL-native Chrome or Windows-hosted Chrome (default: auto).',
    )
      .choices(['auto', 'wsl', 'windows']),
  )
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const target = resolveBrowserSetupTarget({
      explicitTarget: commandOptions.target,
      aliasChatgpt: Boolean(commandOptions.chatgpt),
      aliasGemini: Boolean(commandOptions.gemini),
      aliasGrok: Boolean(commandOptions.grok),
      fallbackTarget: userConfig.browser?.target ?? 'chatgpt',
    });
    const launchOptions = resolveBrowserLoginLaunchOptions(commandOptions, userConfig, target);

    const client = await BrowserAutomationClient.fromConfig(userConfig, {
      target: target === 'grok' ? 'grok' : 'chatgpt',
    });
    await client.login({
      target,
      ...launchOptions,
      exportCookies: Boolean(commandOptions.exportCookies),
      managedProfileSeedPolicy: commandOptions.forceReseedManagedProfile ? 'force-reseed' : 'bootstrap-only',
    });
    const { inspectBrowserDoctorState, collectBrowserFeatureRuntime } = await import('../src/browser/profileDoctor.js');
    const localReport = await inspectBrowserDoctorState(userConfig, { target });
    const runtime = await collectBrowserFeatureRuntime(target, localReport);
    const runtimeBlockingState = getRuntimeBlockingState(runtime.browserTools);
    if (runtimeBlockingState?.requiresHuman) {
      printBlockingStateGuidance(runtimeBlockingState, {
        prefix: `Managed ${target} browser profile landed on a blocking page after login`,
      });
      process.exitCode = 1;
    }
  });

const profileCommand = program
  .command('profile')
  .description('Manage AuraCall runtime profiles.');

profileCommand
  .command('list')
  .description('List AuraCall runtime profiles and their browser-profile bridges.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.', false)
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const loaded = await loadUserConfig(process.cwd());
    const resolvedConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const report = buildProfileListReport(loaded.config as Record<string, unknown>, {
      explicitProfileName: resolvedConfig.auracallProfile ?? null,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatProfileListReport(report));
  });

profileCommand
  .command('identity-smoke')
  .description('Run a no-prompt browser identity smoke for one runtime-profile service.')
  .option('--target <chatgpt|gemini|grok>', 'Choose provider to inspect (chatgpt, gemini, or grok).')
  .option('--all-bound', 'Smoke every provider with a configured expected identity on the selected runtime profile.', false)
  .option('--all', 'Smoke every supported provider, including unbound services.', false)
  .option('--no-launch-if-needed', 'Do not launch the managed browser when no live DevTools session is registered.')
  .option('--include-negative', 'Also run an in-memory missing-identity negative check.', false)
  .option('--prune-browser-state', 'Remove dead entries from ~/.auracall/browser-state.json before reporting.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const {
      inspectBrowserDoctorState,
      inspectBrowserDoctorIdentity,
      withBrowserProbeOperation,
    } = await import('../src/browser/profileDoctor.js');
    const shouldLaunchIfNeeded = commandOptions.launchIfNeeded !== false;
    const explicitAgentId =
      typeof (cliOptions as CliOptions).agent === 'string' ? (cliOptions as CliOptions).agent?.trim() || null : null;
    const targets = resolveProfileIdentitySmokeTargets(userConfig as unknown as Record<string, unknown>, {
      explicitTarget: commandOptions.target,
      all: Boolean(commandOptions.all),
      allBound: Boolean(commandOptions.allBound),
      runtimeProfileId: userConfig.auracallProfile ?? null,
      explicitAgentId,
      fallbackTarget: userConfig.browser?.target ?? 'chatgpt',
    });
    if (targets.length === 0) {
      throw new Error('No bound provider identities found for the selected AuraCall runtime profile.');
    }

    const runSmokeTarget = async (target: (typeof targets)[number]) => {
      let launchedBrowser = false;
      let localReport = await inspectBrowserDoctorState(userConfig, {
        target,
        pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
      });

      if (!localReport.managedRegistryEntry?.alive && shouldLaunchIfNeeded) {
        const launchOptions = resolveBrowserLoginLaunchOptions(commandOptions, userConfig, target);
        const launch = async () => {
          const client = await BrowserAutomationClient.fromConfig(userConfig, {
            target: target === 'grok' ? 'grok' : 'chatgpt',
          });
          await client.login({
            target,
            ...launchOptions,
            exportCookies: false,
            managedProfileSeedPolicy: 'bootstrap-only',
          });
        };
        if (commandOptions.json) {
          await withStdoutRedirectedToStderr(launch);
        } else {
          await launch();
        }
        launchedBrowser = true;
        localReport = await inspectBrowserDoctorState(userConfig, {
          target,
          pruneDeadRegistryEntries: Boolean(commandOptions.pruneBrowserState),
        });
      }

      let identityStatus: Awaited<ReturnType<typeof inspectBrowserDoctorIdentity>> = {
        target,
        supported: true,
        attempted: false,
        identity: null,
        error: null,
        reason: 'no-live-managed-browser',
      };
      if (localReport.managedRegistryEntry?.alive) {
        await withBrowserProbeOperation(target, localReport, 'doctor', async () => {
          identityStatus = await inspectBrowserDoctorIdentity(userConfig, {
            target,
            localReport,
          });
        });
      }

      return buildProfileIdentitySmokeReport({
        config: userConfig as unknown as Record<string, unknown>,
        target,
        runtimeProfileId: userConfig.auracallProfile ?? null,
        explicitAgentId,
        actualIdentity: identityStatus.identity,
        providerSessionProof: identityStatus.providerSessionProof,
        identityStatus,
        localReport,
        launchedBrowser,
        includeNegative: Boolean(commandOptions.includeNegative),
      });
    };

    const reports = [];
    for (const target of targets) {
      reports.push(await runSmokeTarget(target));
    }
    const batchMode = commandOptions.all ? 'all' : commandOptions.allBound ? 'all-bound' : null;
    if (batchMode) {
      const batchReport = buildProfileIdentitySmokeBatchReport({
        reports,
        mode: batchMode,
        runtimeProfile: userConfig.auracallProfile ?? null,
      });
      process.exitCode = resolveProfileIdentitySmokeBatchExitCode(batchReport);
      if (commandOptions.json) {
        console.log(JSON.stringify(batchReport, null, 2));
      } else {
        console.log(formatProfileIdentitySmokeBatchReport(batchReport));
      }
      exitAfterCompletedBrowserProbeCommand();
    }
    const report = reports[0];
    if (!report) {
      throw new Error('No profile identity smoke report was produced.');
    }
    process.exitCode = resolveProfileIdentitySmokeExitCode(report);
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatProfileIdentitySmokeReport(report));
    }
    exitAfterCompletedBrowserProbeCommand();
  });

const configCommand = program
  .command('config')
  .description('Manage Aura-Call config files.');

const terminalSessionReceiptsCommand = program
  .command('terminal-receipts')
  .description('Inspect provider-neutral terminal-session receipt delivery.');

terminalSessionReceiptsCommand
  .command('status')
  .description('Show terminal-session receipt configuration, delivery, and reconciliation status.')
  .option('--reconcile', 'Idempotently publish any missing receipts for durably terminal sessions.', false)
  .option('--session <id>', 'Verify one exact stored session, receipt, and result digest.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...commandOptions },
      process.cwd(),
      process.env,
    );
    const payload = await buildTerminalSessionReceiptStatusPayload({
      config: userConfig,
      reconcile: Boolean(commandOptions.reconcile),
      sessionId:
        typeof commandOptions.session === 'string' && commandOptions.session.trim().length > 0
          ? commandOptions.session.trim()
          : null,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log(formatTerminalSessionReceiptStatusPayload(payload));
  });

configCommand
  .command('doctor')
  .description('Check bridge-health for AuraCall runtime profiles and browser profiles.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.', false)
  .option('--strict', 'Exit non-zero when bridge-health warnings are present.', false)
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const loaded = await loadUserConfig(process.cwd());
    const resolvedConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const report = buildConfigDoctorReport(loaded.config as Record<string, unknown>, {
      explicitProfileName: resolvedConfig.auracallProfile ?? null,
      explicitAgentId: typeof cliOptions.agent === 'string' ? cliOptions.agent : null,
      explicitTeamId: typeof cliOptions.team === 'string' ? cliOptions.team : null,
    });
    process.exitCode = resolveConfigDoctorExitCode(report, { strict: Boolean(commandOptions.strict) });
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatConfigDoctorReport(report));
  });

configCommand
  .command('agent-diagnostics')
  .description('Inspect registry-backed agents and scoped API-key reachability without exposing secrets.')
  .option('--path <path>', 'Config path to inspect (defaults to ~/.auracall/config.json).')
  .option('--env-path <path>', 'API env file to inspect (defaults to ~/.auracall/api.env).')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--strict', 'Exit non-zero when warnings are present.', false)
  .action(async (commandOptions) => {
    const report = await buildAgentDiagnosticsCliReport({
      configPath: commandOptions.path,
      envPath: commandOptions.envPath,
    });
    process.exitCode = resolveAgentDiagnosticsExitCode(report, { strict: Boolean(commandOptions.strict) });
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatAgentDiagnosticsCliReport(report));
  });

configCommand
  .command('agent-export')
  .description('Export selected agents and teams to a reviewable snapshot file.')
  .option('--path <path>', 'Config path to inspect (defaults to ~/.auracall/config.json).')
  .option('--agent <id>', 'Agent id to export. Repeat for multiple agents.', collectTrimmedString, [])
  .option('--team <id>', 'Team id to export. Repeat for multiple teams.', collectTrimmedString, [])
  .option('--all', 'Export all effective agents and teams.', false)
  .option('--output <path>', 'Write snapshot JSON to a file instead of stdout.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const result = await exportAgentSnapshotForCli({
      configPath: commandOptions.path,
      outputPath: commandOptions.output,
      agents: commandOptions.agent,
      teams: commandOptions.team,
      all: Boolean(commandOptions.all),
    });
    if (commandOptions.json || !commandOptions.output) {
      console.log(JSON.stringify(result.snapshot, null, 2));
      return;
    }
    console.log(formatAgentSnapshotExportCliResult(result));
  });

configCommand
  .command('agent-import')
  .description('Import a reviewable agent/team snapshot into the user-scoped registry.')
  .argument('<path>', 'Snapshot JSON file to import.')
  .option('--config-path <path>', 'Config path to inspect (defaults to ~/.auracall/config.json).')
  .option('--dry-run', 'Validate and report import actions without writing registry records.', false)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (inputPath: string, commandOptions) => {
    const result = await importAgentSnapshotForCli({
      configPath: commandOptions.configPath,
      inputPath,
      dryRun: Boolean(commandOptions.dryRun),
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(formatAgentSnapshotImportCliResult(result));
  });

const teamsCommand = program
  .command('teams')
  .description('Inspect and execute bounded team workflows.');

teamsCommand
  .command('inspect')
  .description('Inspect persisted task assignment and linked runtime state.')
  .option('--task-run-spec-id <id>', 'Inspect one persisted task run spec and its latest linked runtime run.')
  .option('--team-run-id <id>', 'Inspect one team run id and its linked persisted task run spec/runtime run.')
  .option('--runtime-run-id <id>', 'Inspect one runtime run and its linked persisted task run spec.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const payload = await inspectConfiguredTeamRun({
      taskRunSpecId:
        typeof commandOptions.taskRunSpecId === 'string' && commandOptions.taskRunSpecId.trim().length > 0
          ? commandOptions.taskRunSpecId.trim()
          : null,
      teamRunId:
        typeof commandOptions.teamRunId === 'string' && commandOptions.teamRunId.trim().length > 0
          ? commandOptions.teamRunId.trim()
          : null,
      runtimeRunId:
        typeof commandOptions.runtimeRunId === 'string' && commandOptions.runtimeRunId.trim().length > 0
          ? commandOptions.runtimeRunId.trim()
          : null,
    });

    if (commandOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(formatTeamRunCliInspectionPayload(payload));
  });

teamsCommand
  .command('review')
  .description('Review one persisted team-run sequence as a read-only ledger.')
  .option('--task-run-spec-id <id>', 'Review the latest persisted runtime run linked to one task run spec.')
  .option('--team-run-id <id>', 'Review the latest persisted runtime run linked to one team run id.')
  .option('--runtime-run-id <id>', 'Review one persisted runtime run.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (commandOptions) => {
    const payload = await reviewConfiguredTeamRun({
      taskRunSpecId:
        typeof commandOptions.taskRunSpecId === 'string' && commandOptions.taskRunSpecId.trim().length > 0
          ? commandOptions.taskRunSpecId.trim()
          : null,
      teamRunId:
        typeof commandOptions.teamRunId === 'string' && commandOptions.teamRunId.trim().length > 0
          ? commandOptions.teamRunId.trim()
          : null,
      runtimeRunId:
        typeof commandOptions.runtimeRunId === 'string' && commandOptions.runtimeRunId.trim().length > 0
          ? commandOptions.runtimeRunId.trim()
          : null,
    });

    if (commandOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(formatTeamRunCliReviewLedgerPayload(payload));
  });

teamsCommand
  .command('run <teamId>')
  .description('Execute one bounded team run through the internal runtime bridge.')
  .argument('<objective>', 'Assignment objective for this team run.')
  .option('--title <text>', 'Optional assignment title.')
  .option('--prompt-append <text>', 'Optional task-level prompt appendix for the planned team step prompt.')
  .option('--structured-context-json <json>', 'Optional JSON object to pass as task structured context.')
  .option('--response-format <text|markdown|json>', 'Requested final-response format.', 'markdown')
  .option('--max-turns <count>', 'Optional task turn limit.', parseIntOption)
  .option(
    '--allow-local-shell-command <command>',
    'Allow one or more bounded local shell commands for this run.',
    collectTrimmedString,
    [],
  )
  .option(
    '--allow-local-cwd-root <path>',
    'Allow one or more absolute cwd roots for bounded local shell actions.',
    collectTrimmedString,
    [],
  )
  .option(
    '--require-local-action-approval',
    'Require operator approval/cancellation for bounded local shell actions instead of auto-executing them.',
    false,
  )
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (teamId, objective, commandOptions) => {
    const parentOptions = teamsCommand.opts?.() ?? {};
    const userConfig = await resolveConfig(
      { ...(program.opts?.() ?? {}), ...parentOptions, ...commandOptions },
      process.cwd(),
      process.env,
    );

    const structuredContextRaw =
      typeof commandOptions.structuredContextJson === 'string' && commandOptions.structuredContextJson.trim().length > 0
        ? commandOptions.structuredContextJson.trim()
        : null;
    let structuredContext: Record<string, unknown> | null = null;
    if (structuredContextRaw) {
      const parsed = JSON5.parse(structuredContextRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('--structured-context-json must decode to a JSON object.');
      }
      structuredContext = parsed as Record<string, unknown>;
    }

    const responseFormatRaw =
      typeof commandOptions.responseFormat === 'string' ? commandOptions.responseFormat.trim() : 'markdown';
    if (responseFormatRaw !== 'text' && responseFormatRaw !== 'markdown' && responseFormatRaw !== 'json') {
      throw new Error('--response-format must be text, markdown, or json.');
    }

    const allowedLocalShellCommands = Array.isArray(commandOptions.allowLocalShellCommand)
      ? commandOptions.allowLocalShellCommand.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const allowedLocalCwdRoots = Array.isArray(commandOptions.allowLocalCwdRoot)
      ? commandOptions.allowLocalCwdRoot.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : [];
    if (allowedLocalCwdRoots.length > 0 && allowedLocalShellCommands.length === 0) {
      throw new Error('--allow-local-cwd-root requires at least one --allow-local-shell-command.');
    }
    if (commandOptions.requireLocalActionApproval && allowedLocalShellCommands.length === 0) {
      throw new Error('--require-local-action-approval requires at least one --allow-local-shell-command.');
    }

    const result = await executeConfiguredTeamRun({
      config: userConfig as unknown as Record<string, unknown>,
      teamId: String(teamId),
      objective: String(objective),
      title:
        typeof commandOptions.title === 'string' && commandOptions.title.trim().length > 0
          ? commandOptions.title.trim()
          : null,
      promptAppend:
        typeof commandOptions.promptAppend === 'string' && commandOptions.promptAppend.trim().length > 0
          ? commandOptions.promptAppend.trim()
          : null,
      structuredContext,
      responseFormat: responseFormatRaw,
      maxTurns:
        typeof commandOptions.maxTurns === 'number' && Number.isFinite(commandOptions.maxTurns)
          ? commandOptions.maxTurns
          : null,
      localActionPolicy:
        allowedLocalShellCommands.length > 0
          ? {
              mode: commandOptions.requireLocalActionApproval ? 'approval-required' : 'allowed',
              allowedShellCommands: allowedLocalShellCommands,
              allowedCwdRoots: allowedLocalCwdRoots.length > 0 ? allowedLocalCwdRoots : [process.cwd()],
            }
          : null,
    });

    if (commandOptions.json) {
      console.log(
        JSON.stringify(
          {
            taskRunSpec: result.taskRunSpec,
            execution: result.payload,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(formatTeamRunCliExecutionPayload(result.payload));
  });

configCommand
  .command('show')
  .description('Show the active AuraCall runtime profile and browser-profile bridge state.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.', false)
  .action(async (commandOptions) => {
    const cliOptions = { ...(program.opts?.() ?? {}), ...commandOptions };
    const loaded = await loadUserConfig(process.cwd());
    const resolvedConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    const report = buildConfigShowReport({
      rawConfig: loaded.config as Record<string, unknown>,
      resolvedConfig,
      configPath: loaded.path,
      loaded: loaded.loaded,
      explicitProfileName:
        typeof cliOptions.profile === 'string'
          ? cliOptions.profile
          : typeof cliOptions.auracallProfile === 'string'
            ? cliOptions.auracallProfile
            : typeof cliOptions.oracleProfile === 'string'
              ? cliOptions.oracleProfile
              : null,
      explicitAgentId: typeof cliOptions.agent === 'string' ? cliOptions.agent : null,
      explicitTeamId: typeof cliOptions.team === 'string' ? cliOptions.team : null,
    });
    if (commandOptions.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatConfigShowReport(report));
  });

configCommand
  .command('migrate')
  .description('Write the current config layout (version 3 target-shape by default; legacy keys remain unless --strip-legacy).')
  .option('--path <path>', 'Input config path (defaults to ~/.auracall/config.json).')
  .option('--output <path>', 'Write migrated config to a custom path.')
  .option('--in-place', 'Overwrite the input config file in place.', false)
  .option('--dry-run', 'Print the migrated config instead of writing it.', false)
  .option('--strip-legacy', 'Drop legacy browser/auracallProfiles keys from output.', false)
  .option('--target-shape', 'Write explicit target-shape keys (`browserProfiles` / `runtimeProfiles`). This is the default.', false)
  .option('--bridge-shape', 'Write compatibility bridge keys (`browserFamilies` / `profiles`) instead of the primary target shape.', false)
  .option('--force', 'Overwrite an existing output file.', false)
  .action(async (commandOptions, command) => {
    const cmd = command?.opts ? command : (commandOptions as unknown as Command);
    const opts = cmd?.opts?.() ?? commandOptions;
    if (opts.targetShape && opts.bridgeShape) {
      throw new Error('Do not combine --target-shape with --bridge-shape.');
    }
    if (opts.output && opts.inPlace) {
      throw new Error('Do not combine --output with --in-place.');
    }
    const inputPath = opts.path ?? configPath();
    const raw = await fs.readFile(inputPath, 'utf8');
    const parsed = JSON5.parse(raw) as UserConfig;
    const targetShape = opts.bridgeShape ? false : true;
    const migrated = materializeConfigV2(parsed, {
      stripLegacy: Boolean(opts.stripLegacy),
      targetShape,
    });
    const envDryRun =
      process.env.npm_config_dry_run === 'true' || process.env.npm_config_dry_run === '1';
    const flagValue =
      opts.dryRun === true
        ? true
        : cmd?.optsWithGlobals?.().dryRun === true
          ? true
          : cmd?.parent?.opts?.().dryRun === true
            ? true
            : process.argv.includes('--dry-run') || envDryRun;
    const dryRun = Boolean(flagValue);
    if (dryRun) {
      console.log('Dry run: printing migrated config (no file written).');
      console.log(JSON.stringify(migrated, null, 2));
      return;
    }
    const outputPath = opts.inPlace
      ? inputPath
      : opts.output ?? `${inputPath}.v3`;
    if (!opts.force && outputPath !== inputPath) {
      try {
        await fs.access(outputPath);
        throw new Error(`Refusing to overwrite ${outputPath}. Use --force to overwrite.`);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code && code !== 'ENOENT') {
          throw error;
        }
      }
    }
    await fs.writeFile(outputPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');
    console.log(`Wrote migrated config to ${outputPath}`);
    if (targetShape) {
      console.log(chalk.dim('Write mode: target-shape (`browserProfiles` / `runtimeProfiles`).'));
    } else {
      console.log(chalk.dim('Write mode: compatibility bridge (`browserFamilies` / `profiles`).'));
    }
    console.log(
      chalk.dim(
        `Active bridge: ${formatRuntimeProfileBridgeSummary(
          buildRuntimeProfileBridgeSummary(migrated as Record<string, unknown>),
        )}.`,
      ),
    );
  });

profileCommand
  .command('scaffold')
  .description('Create a default AuraCall runtime-profile config file from the current browser profile.')
  .option('--force', 'Overwrite an existing config file.', false)
  .option('--target-shape', 'Write explicit target-shape keys (`browserProfiles` / `runtimeProfiles`). This is the default.', false)
  .option('--bridge-shape', 'Write compatibility bridge keys (`browserFamilies` / `profiles`) instead of the primary target shape.', false)
  .action(async (commandOptions) => {
    if (commandOptions.targetShape && commandOptions.bridgeShape) {
      throw new Error('Do not combine --target-shape with --bridge-shape.');
    }
    const targetShape = commandOptions.bridgeShape ? false : true;
    const result = await scaffoldDefaultConfigFile({
      force: Boolean(commandOptions.force),
      targetShape,
    });
    if (!result) {
      console.log('Config file already exists; use --force to overwrite.');
      return;
    }
    console.log(`Wrote config to ${result.path}`);
    if (targetShape) {
      console.log(chalk.dim('Write mode: target-shape (`browserProfiles` / `runtimeProfiles`).'));
    } else {
      console.log(chalk.dim('Write mode: compatibility bridge (`browserFamilies` / `profiles`).'));
    }
    console.log(
      chalk.dim(
        `Scaffolded ${formatRuntimeProfileBridgeSummary(
          buildRuntimeProfileBridgeSummary(result.config as Record<string, unknown>),
        )}.`,
      ),
    );
  });

program
  .command('tui')
  .description('Launch the interactive terminal UI for humans (no automation).')
  .action(async () => {
    await sessionStore.ensureStorage();
    await launchTui({ version: VERSION, printIntro: false });
  });

const sessionCommand = program
  .command('session [id]')
  .description('Attach to a stored session or list recent sessions when no ID is provided.')
  .option('--hours <hours>', 'Look back this many hours when listing sessions (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show when listing (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .option('--clear', 'Delete stored sessions older than the provided window (24h default).', false)
  .option('--hide-prompt', 'Hide stored prompt when displaying a session.', false)
  .option('--render', 'Render completed session output as markdown (rich TTY only).', false)
  .option('--render-markdown', 'Alias for --render.', false)
  .option('--open-conversation', 'Open the provider conversation linked to this session.', false)
  .option('--print-url', 'Print the linked conversation URL instead of opening it.', false)
  .option('--browser-path <path>', 'Override the browser binary to open the conversation URL.')
  .option('--browser-profile <name>', 'Override the browser profile directory for open-conversation.')
  .option('--model <name>', 'Filter sessions/output for a specific model.', '')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.', false)
  .option('--path', 'Print the stored session paths instead of attaching.', false)
  .addOption(new Option('--clean', 'Deprecated alias for --clear.').default(false).hideHelp())
  .action(async (sessionId, _options: StatusOptions, cmd: Command) => {
    const cliOptions = program.opts?.() ?? {};
    const userConfig = await resolveConfig(cliOptions, process.cwd(), process.env);
    await handleSessionCommand(sessionId, cmd, undefined, userConfig);
  });

const runCommand = program
  .command('run')
  .description('Inspect persisted Aura-Call runs.');

runCommand
  .command('status <id>')
  .description('Read compact status for a response or media-generation run.')
  .option('--expect-status <status>', 'Fail unless the persisted run status matches.')
  .option('--expect-min-artifacts <count>', 'Fail unless the run has at least this many artifacts.', parseIntOption)
  .option('--expect-media-run-state <state>', 'Fail unless media diagnostics report this run state.')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (
    id: string,
    commandOptions: {
      expectStatus?: string;
      expectMinArtifacts?: number;
      expectMediaRunState?: string;
      json?: boolean;
    },
  ) => {
    const normalizedId = id.trim();
    const status = await readRunStatusForCli(normalizedId);
    if (!status) {
      console.error(`Run ${normalizedId} was not found.`);
      process.exitCode = 1;
      return;
    }

    assertRunStatusForCli(status, {
      expectedStatus: commandOptions.expectStatus,
      expectedMinArtifacts: commandOptions.expectMinArtifacts,
      expectedMediaRunState: commandOptions.expectMediaRunState,
    });

    if (commandOptions.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    console.log(formatRunStatusCli(status));
  });

registerMediaGenerationCliCommand(program, {
  resolveUserConfig: (options) => resolveConfig(options, process.cwd(), process.env),
  parseIntOption,
});

const statusCommand = program
  .command('status [id]')
  .description('List recent sessions (24h window by default) or attach to a session when an ID is provided.')
  .option('--hours <hours>', 'Look back this many hours (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .option('--clear', 'Delete stored sessions older than the provided window (24h default).', false)
  .option('--render', 'Render completed session output as markdown (rich TTY only).', false)
  .option('--render-markdown', 'Alias for --render.', false)
  .option('--model <name>', 'Filter sessions/output for a specific model.', '')
  .option('--json', 'Emit machine-readable JSON output.', false)
  .option('--json-only', 'Suppress CLI intro banner and print JSON payload only.', false)
  .option('--hide-prompt', 'Hide stored prompt when displaying a session.', false)
  .addOption(new Option('--clean', 'Deprecated alias for --clear.').default(false).hideHelp())
  .action(async (sessionId: string | undefined, _options: StatusOptions, command: Command) => {
    const statusOptions = command.opts<StatusOptions>();
    const clearRequested = Boolean(statusOptions.clear || statusOptions.clean);
    if (clearRequested) {
      if (sessionId) {
        console.error('Cannot combine a session ID with --clear. Remove the ID to delete cached sessions.');
        process.exitCode = 1;
        return;
      }
      const hours = statusOptions.hours;
      const includeAll = statusOptions.all;
      const result = await sessionStore.deleteOlderThan({ hours, includeAll });
      const scope = includeAll ? 'all stored sessions' : `sessions older than ${hours}h`;
      console.log(formatSessionCleanupMessage(result, scope));
      return;
    }
    if (sessionId === 'clear' || sessionId === 'clean') {
      console.error('Session cleanup now uses --clear. Run "auracall status --clear --hours <n>" instead.');
      process.exitCode = 1;
      return;
    }
    if (statusOptions.json) {
      if (sessionId) {
        const metadata = await sessionStore.readSession(sessionId);
        if (!metadata) {
          console.error(`Session ${sessionId} was not found.`);
          process.exitCode = 1;
          return;
        }
        console.log(JSON.stringify(buildSessionJsonEntry(metadata), null, 2));
        return;
      }
      const metas = await sessionStore.listSessions();
      const { entries, truncated, total } = sessionStore.filterSessions(metas, {
        hours: statusOptions.all ? Infinity : statusOptions.hours,
        includeAll: statusOptions.all,
        limit: statusOptions.limit,
      });
      const modelFilter = statusOptions.model?.trim().toLowerCase();
      const filteredEntries = modelFilter
        ? entries.filter((entry) => {
            const availableModels =
              entry.models?.map((model) => model.model.toLowerCase()) ??
              (entry.model ? [entry.model.toLowerCase()] : []);
            return availableModels.includes(modelFilter);
          })
        : entries;
      console.log(
        JSON.stringify(buildSessionListJsonPayload({ entries: filteredEntries, truncated, total }), null, 2),
      );
      return;
    }
    if (sessionId) {
      const autoRender = !command.getOptionValueSource?.('render') && !command.getOptionValueSource?.('renderMarkdown')
        ? process.stdout.isTTY
        : false;
      const renderMarkdown = Boolean(statusOptions.render || statusOptions.renderMarkdown || autoRender);
      await attachSession(sessionId, { renderMarkdown, renderPrompt: !statusOptions.hidePrompt });
      return;
    }
    const showExamples = usesDefaultStatusFilters(command);
    await showStatus({
      hours: statusOptions.all ? Infinity : statusOptions.hours,
      includeAll: statusOptions.all,
      limit: statusOptions.limit,
      showExamples,
    });
  });

function buildRunOptions(options: ResolvedCliOptions, overrides: Partial<RunOracleOptions> = {}): RunOracleOptions {
  if (!options.prompt) {
    throw new Error('Prompt is required.');
  }
  const normalizedBaseUrl = normalizeBaseUrl(overrides.baseUrl ?? options.baseUrl);
  const azure =
    options.azureEndpoint || overrides.azure?.endpoint
      ? {
          endpoint: overrides.azure?.endpoint ?? options.azureEndpoint,
          deployment: overrides.azure?.deployment ?? options.azureDeployment,
          apiVersion: overrides.azure?.apiVersion ?? options.azureApiVersion,
        }
      : undefined;

  return {
    prompt: options.prompt,
    model: options.model,
    models: overrides.models ?? options.models,
    effectiveModelId: overrides.effectiveModelId ?? options.effectiveModelId ?? options.model,
    file: overrides.file ?? options.file ?? [],
    slug: overrides.slug ?? options.slug,
    filesReport: overrides.filesReport ?? options.filesReport,
    maxInput: overrides.maxInput ?? options.maxInput,
    maxOutput: overrides.maxOutput ?? options.maxOutput,
    system: overrides.system ?? options.system,
    timeoutSeconds: overrides.timeoutSeconds ?? (options.timeout as number | 'auto' | undefined),
    silent: overrides.silent ?? options.silent,
    search: overrides.search ?? options.search,
    preview: overrides.preview ?? undefined,
    previewMode: overrides.previewMode ?? options.previewMode,
    apiKey: overrides.apiKey ?? options.apiKey,
    baseUrl: normalizedBaseUrl,
    azure,
    sessionId: overrides.sessionId ?? options.sessionId,
    verbose: overrides.verbose ?? options.verbose,
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? resolveHeartbeatIntervalMs(options.heartbeat),
    browserAttachments: overrides.browserAttachments ?? (options.browserAttachments as 'auto' | 'never' | 'always' | undefined) ?? 'auto',
    browserInlineFiles: overrides.browserInlineFiles ?? options.browserInlineFiles ?? false,
    browserBundleFiles: overrides.browserBundleFiles ?? options.browserBundleFiles ?? false,
    background: overrides.background ?? undefined,
    renderPlain: overrides.renderPlain ?? options.renderPlain ?? false,
    writeOutputPath: overrides.writeOutputPath ?? options.writeOutputPath,
  };
}

export function enforceBrowserSearchFlag(
  runOptions: RunOracleOptions,
  sessionMode: SessionMode,
  logFn: (message: string) => void = console.log,
): void {
  if (sessionMode === 'browser' && runOptions.search === false) {
    logFn(chalk.dim('Note: search is not available in browser engine; ignoring search=false.'));
    runOptions.search = undefined;
  }
}

function resolveHeartbeatIntervalMs(seconds: number | undefined): number | undefined {
  if (typeof seconds !== 'number' || seconds <= 0) {
    return undefined;
  }
  return Math.round(seconds * 1000);
}

function buildRunOptionsFromMetadata(metadata: SessionMetadata): RunOracleOptions {
  const stored = metadata.options ?? {};
  return {
    prompt: stored.prompt ?? '',
    model: (stored.model as ModelName) ?? DEFAULT_MODEL,
    models: stored.models as ModelName[] | undefined,
    effectiveModelId: stored.effectiveModelId ?? stored.model,
    file: stored.file ?? [],
    slug: stored.slug,
    filesReport: stored.filesReport,
    maxInput: stored.maxInput,
    maxOutput: stored.maxOutput,
    system: stored.system,
    silent: stored.silent,
    search: stored.search,
    preview: false,
    previewMode: undefined,
    apiKey: undefined,
    baseUrl: normalizeBaseUrl(stored.baseUrl),
    azure: stored.azure,
    sessionId: metadata.id,
    verbose: stored.verbose,
    heartbeatIntervalMs: stored.heartbeatIntervalMs,
    browserAttachments: stored.browserAttachments,
    browserInlineFiles: stored.browserInlineFiles,
    browserBundleFiles: stored.browserBundleFiles,
    background: stored.background,
    renderPlain: stored.renderPlain,
    writeOutputPath: stored.writeOutputPath,
  };
}

function getSessionMode(metadata: SessionMetadata): SessionMode {
  return metadata.mode ?? metadata.options?.mode ?? 'api';
}

function getBrowserConfigFromMetadata(metadata: SessionMetadata): BrowserSessionConfig | undefined {
  return metadata.options?.browserConfig ?? metadata.browser?.config;
}

async function runRootCommand(options: CliOptions): Promise<void> {
  if (process.env.AURACALL_FORCE_TUI === '1') {
    await sessionStore.ensureStorage();
    await launchTui({ version: VERSION, printIntro: false });
    return;
  }
  const config = await resolveConfig(options, process.cwd(), process.env);
  const userConfig = config; // Keep reference for existing code usage

  const helpRequested = rawCliArgs.some((arg: string) => arg === '--help' || arg === '-h');
  const multiModelProvided = Array.isArray(options.models) && options.models.length > 0;
  
  const optionUsesDefault = (name: string): boolean => {
    const source = program.getOptionValueSource?.(name);
    return source == null || source === 'default';
  };

  if (!optionUsesDefault('model') && multiModelProvided) {
    throw new Error('--models cannot be combined with --model.');
  }

  const userForcedBrowser = options.browser || options.engine === 'browser';
  const cliModelArg = normalizeModelOption(options.model);

  if (helpRequested) {
    if (options.verbose) {
      console.log('');
      printDebugHelp(program.name());
      console.log('');
    }
    program.help({ error: false });
    return;
  }
  const previewMode = resolvePreviewMode(options.dryRun || options.preview);
  const mergedFileInputs = mergePathLikeOptions(
    options.file,
    options.include,
    options.files,
    options.path,
    options.paths,
  );
  if (mergedFileInputs.length > 0) {
    const { deduped, duplicates } = dedupePathInputs(mergedFileInputs, { cwd: process.cwd() });
    if (duplicates.length > 0) {
      const preview = duplicates.slice(0, 8).join(', ');
      const suffix = duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
      console.log(chalk.dim(`Ignoring duplicate --file inputs: ${preview}${suffix}`));
    }
    options.file = deduped;
  }
  const copyMarkdown = options.copyMarkdown || options.copy;
  const renderMarkdown = resolveRenderFlag(options.render, options.renderMarkdown);
  const renderPlain = resolveRenderPlain(options.renderPlain, options.render, options.renderMarkdown);

  const applyRetentionOption = (): void => {
    if (optionUsesDefault('retainHours') && typeof userConfig.sessionRetentionHours === 'number') {
      options.retainHours = userConfig.sessionRetentionHours;
    }
    const envRetention = process.env.AURACALL_RETAIN_HOURS;
    if (optionUsesDefault('retainHours') && envRetention) {
      const parsed = Number.parseFloat(envRetention);
      if (!Number.isNaN(parsed)) {
        options.retainHours = parsed;
      }
    }
  };
  applyRetentionOption();

  const applyBrowserScopeDefaults = (): void => {
    if (optionUsesDefault('projectId') && userConfig.browser?.projectId) {
      options.projectId = userConfig.browser.projectId;
    }
    if (optionUsesDefault('projectName') && userConfig.browser?.projectName) {
      options.projectName = userConfig.browser.projectName;
      (options as { _projectNameSource?: string })._projectNameSource = 'config';
    }
    if (optionUsesDefault('conversationId') && userConfig.browser?.conversationId) {
      options.conversationId = userConfig.browser.conversationId;
    }
    if (optionUsesDefault('conversationName') && userConfig.browser?.conversationName) {
      options.conversationName = userConfig.browser.conversationName;
      (options as { _conversationNameSource?: string })._conversationNameSource = 'config';
    }
  };
  applyBrowserScopeDefaults();

  const disableProject =
    options.noProject === true || options.project === false;
  if (disableProject) {
    options.projectId = undefined;
    options.projectName = undefined;
    delete (options as { _projectNameSource?: string })._projectNameSource;
  }

  const remoteHost =
    options.remoteHost ?? userConfig.remoteHost ?? userConfig.remote?.host ?? process.env.AURACALL_REMOTE_HOST;
  const remoteToken =
    options.remoteToken ?? userConfig.remoteToken ?? userConfig.remote?.token ?? process.env.AURACALL_REMOTE_TOKEN;
  if (remoteHost) {
    console.log(chalk.dim(`Remote browser host detected: ${remoteHost}`));
  }

  if (userCliArgs.length === 0) {
    console.log(chalk.yellow('No prompt or subcommand supplied. Run `auracall --help` or `auracall tui` for the TUI.'));
    program.outputHelp();
    return;
  }
  const retentionHours = typeof options.retainHours === 'number' ? options.retainHours : undefined;
  await sessionStore.ensureStorage();
  await pruneOldSessions(retentionHours, (message) => console.log(chalk.dim(message)));

  if (options.debugHelp) {
    printDebugHelp(program.name());
    return;
  }
  if (options.dryRun && options.renderMarkdown) {
    throw new Error('--dry-run cannot be combined with --render-markdown.');
  }

  let engine = config.engine || 'api';
  const resolvedModel = config.model;
  const resolvedBaseUrl = config.apiBaseUrl;
  
  if (options.browser) {
    console.log(chalk.yellow('`--browser` is deprecated; use `--engine browser` instead.'));
  }

  if (remoteHost && engine !== 'browser') {
    throw new Error('--remote-host requires --engine browser.');
  }
  if (remoteHost && options.remoteChrome) {
    throw new Error('--remote-host cannot be combined with --remote-chrome.');
  }

  const normalizedMultiModels: ModelName[] = multiModelProvided
    ? Array.from(new Set(options.models!.map((entry) => resolveApiModel(entry))))
    : [];

  const effectiveModelId = resolvedModel.startsWith('gemini')
    ? resolveGeminiModelId(resolvedModel)
    : isKnownModel(resolvedModel)
      ? MODEL_CONFIGS[resolvedModel].apiModel ?? resolvedModel
      : resolvedModel;
  
  const { models: _rawModels, ...optionsWithoutModels } = options;
  const resolvedOptions: ResolvedCliOptions = { ...optionsWithoutModels, model: resolvedModel };
  if (normalizedMultiModels.length > 0) {
    resolvedOptions.models = normalizedMultiModels;
  }
  resolvedOptions.baseUrl = resolvedBaseUrl;
  resolvedOptions.effectiveModelId = effectiveModelId;
  resolvedOptions.writeOutputPath = resolveOutputPath(options.writeOutput, process.cwd());

  // Decide whether to block until completion:
  let waitPreference = resolveWaitFlag({
    waitFlag: options.wait,
    noWaitFlag: options.noWait,
    model: resolvedModel,
    engine,
  });
  if (remoteHost && !waitPreference) {
    console.log(chalk.dim('Remote browser runs require --wait; ignoring --no-wait.'));
    waitPreference = true;
  }

  if (engine === 'browser' || userForcedBrowser) {
    await resolveBrowserNameHints(options, userConfig as any);
  }

  if (await handleStatusFlag(options, { attachSession, showStatus })) {
    return;
  }

  if (await handleSessionAlias(options, { attachSession })) {
    return;
  }

  if (options.execSession) {
    await executeSession(options.execSession);
    return;
  }

  if (renderMarkdown || copyMarkdown) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --render-markdown or --copy-markdown.');
    }
    const bundle = await buildMarkdownBundle(
      { prompt: options.prompt, file: options.file, system: options.system },
      { cwd: process.cwd() },
    );
    const modelConfig = isKnownModel(resolvedModel) ? MODEL_CONFIGS[resolvedModel] : MODEL_CONFIGS['gpt-5.1'];
    const requestBody = buildRequestBody({
      modelConfig,
      systemPrompt: bundle.systemPrompt,
      userPrompt: bundle.promptWithFiles,
      searchEnabled: options.search !== false,
      background: false,
      storeResponse: false,
    });
    const estimatedTokens = estimateRequestTokens(requestBody, modelConfig);
    const warnThreshold = Math.min(196_000, modelConfig.inputLimit ?? 196_000);
    warnIfOversizeBundle(estimatedTokens, warnThreshold, console.log);
    if (renderMarkdown) {
      const output = renderPlain
        ? bundle.markdown
        : await formatRenderedMarkdown(bundle.markdown, { richTty: isTty });
      // Trim trailing newlines from the rendered bundle so we print exactly one blank before the summary line.
      console.log(output.replace(/\n+$/u, ''));
    }
    if (copyMarkdown) {
      const result = await copyToClipboard(bundle.markdown);
      if (result.success) {
        const filesPart = bundle.files.length > 0 ? `; ${bundle.files.length} files` : '';
        const summary = `Copied markdown to clipboard (~${formatCompactNumber(estimatedTokens)} tokens${filesPart}).`;
        console.log(chalk.green(summary));
      } else {
        const reason = result.error instanceof Error ? result.error.message : String(result.error ?? 'unknown error');
        console.log(
          chalk.dim(
            `Copy failed (${reason}); markdown not printed. Re-run with --render-markdown if you need the content.`,
          ),
        );
      }
    }
    return;
  }

  if (previewMode) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --dry-run/preview.');
    }
    if (userConfig.promptSuffix) {
      options.prompt = `${options.prompt.trim()}\n${userConfig.promptSuffix}`;
    }
    resolvedOptions.prompt = options.prompt;
    const runOptions = buildRunOptions(resolvedOptions, { preview: true, previewMode, baseUrl: resolvedBaseUrl });
    if (engine === 'browser') {
      await runBrowserPreview(
        {
          runOptions,
          cwd: process.cwd(),
          version: VERSION,
          previewMode,
          log: console.log,
        },
        {},
      );
      return;
    }
    // API dry-run/preview path
    if (previewMode === 'summary') {
      await runDryRunSummary(
        {
          engine,
          runOptions,
          cwd: process.cwd(),
          version: VERSION,
          log: console.log,
        },
        {},
      );
      return;
    }
    await runDryRunSummary(
      {
        engine,
        runOptions,
        cwd: process.cwd(),
        version: VERSION,
        log: console.log,
      },
      {},
    );
    return;
  }

  if (!options.prompt) {
    throw new Error('Prompt is required when starting a new session.');
  }

  if (userConfig.promptSuffix) {
    options.prompt = `${options.prompt.trim()}\n${userConfig.promptSuffix}`;
  }
  resolvedOptions.prompt = options.prompt;

  const duplicateBlocked = await shouldBlockDuplicatePrompt({
    prompt: resolvedOptions.prompt,
    force: options.force,
    sessionStore,
    log: console.log,
  });
  if (duplicateBlocked) {
    process.exitCode = 1;
    return;
  }

  if (options.file && options.file.length > 0) {
    const isBrowserMode = engine === 'browser' || userForcedBrowser;
    const filesToValidate = isBrowserMode ? options.file.filter((f: string) => !isMediaFile(f)) : options.file;
    if (filesToValidate.length > 0) {
      await readFiles(filesToValidate, { cwd: process.cwd() });
    }
  }

  if (engine === 'browser' || userForcedBrowser) {
    const modelName = resolvedModel.toLowerCase();
    const target = modelName.startsWith('grok')
      ? 'grok'
      : modelName.startsWith('gemini')
        ? 'gemini'
        : options.browserTarget ?? userConfig.browser?.target ?? 'chatgpt';
    if (target !== 'gemini') {
      const configuredUrl =
        target === 'grok'
          ? options.grokUrl ?? userConfig.browser?.grokUrl ?? null
          : options.chatgptUrl ??
            options.browserUrl ??
            userConfig.browser?.chatgptUrl ??
            userConfig.browser?.url ??
            null;
      const llmService = createLlmService(target, userConfig, {
        identityPrompt: promptForCacheIdentity,
      });
      const plan = await llmService.planPrompt({
        configuredUrl,
        projectId: options.projectId ?? null,
        projectName: options.projectName ?? null,
        conversationId: options.conversationId ?? null,
        conversationName: options.conversationName ?? null,
        noProject: disableProject,
        allowAutoRefresh: !options.dryRun,
        listOptions: { configuredUrl },
      });
      options.projectId = plan.projectId ?? undefined;
      options.conversationId = plan.conversationId ?? undefined;
      if (options.verbose) {
        const projectLabel = plan.projectId ?? (disableProject ? 'none' : 'none');
        const conversationLabel = plan.conversationId ?? 'new';
        console.log(
          chalk.dim(
            `[browser] target project=${projectLabel} conversation=${conversationLabel} url=${plan.targetUrl ?? 'default'}`,
          ),
        );
      }
    }
  }

  const getSource = (key: keyof CliOptions) => program.getOptionValueSource?.(key as string) ?? undefined;

  const notifications = resolveNotificationSettings({
    cliNotify: options.notify,
    cliNotifySound: options.notifySound,
    env: process.env,
    config: userConfig.notify,
  });

  const sessionMode: SessionMode = engine === 'browser' ? 'browser' : 'api';
  const chatgptSemanticModelSelection =
    sessionMode === 'browser'
      ? resolveChatgptSemanticModelSelector(options.model ?? cliModelArg)
      : null;
  const browserModelLabelOverride =
    sessionMode === 'browser'
      ? (options.browserModelLabel || !resolvedModel.startsWith('grok')
          ? resolveBrowserModelLabel(options.browserModelLabel ?? cliModelArg, resolvedModel)
          : undefined)
      : undefined;
  const browserConfig =
    sessionMode === 'browser'
      ? await buildBrowserConfig({
          ...options,
          auracallProfileName: userConfig.auracallProfile ?? 'default',
          selectedAgentId: typeof options.agent === 'string' ? options.agent.trim() || null : null,
          managedProfileRoot: config.browser.managedProfileRoot ?? null,
          browserTabConcurrencyMode: config.browser.tabConcurrencyMode,
          model: resolvedModel,
          browserModelLabel: browserModelLabelOverride,
          chatgptSemanticModelSelection,
          browserChatgptMode: options.browserChatgptMode ?? config.browser.chatgptMode,
          browserChatgptToolApproval:
            options.browserChatgptToolApproval ?? config.browser.chatgptToolApproval,
          browserWorkModel: options.browserWorkModel ?? config.browser.workModel,
          browserManualLogin: config.browser.manualLogin ?? true,
          browserManualLoginProfileDir: config.browser.manualLoginProfileDir,
          browserChromeProfile: config.browser.chromeProfile,
          browserChromePath: config.browser.chromePath,
          browserCookiePath: config.browser.chromeCookiePath,
          browserBootstrapCookiePath: config.browser.bootstrapCookiePath,
          browserDisplay: config.browser.display,
          browserHeadless: config.browser.headless,
          browserHideWindow: config.browser.hideWindow,
          browserKeepBrowser: config.browser.keepBrowser,
          browserTimeout: config.browser.timeoutMs ? String(config.browser.timeoutMs) : undefined,
          browserInputTimeout: config.browser.inputTimeoutMs ? String(config.browser.inputTimeoutMs) : undefined,
          browserCookieWait: config.browser.cookieSyncWaitMs ? String(config.browser.cookieSyncWaitMs) : undefined,
          browserWslChrome: options.browserWslChrome ?? config.browser.wslChromePreference,
        })
      : undefined;
  applyBrowserLaunchUrl({ browserConfig, userConfig, model: resolvedModel });
  const browserContext = await buildBrowserContext({
    options,
    userConfig,
    browserConfig,
    model: resolvedModel,
  });

  let browserDeps: BrowserSessionRunnerDeps | undefined;
  if (browserConfig && remoteHost) {
    browserDeps = {
      executeBrowser: createRemoteBrowserExecutor({ host: remoteHost, token: remoteToken }),
    };
    console.log(chalk.dim(`Routing browser automation to remote host ${remoteHost}`));
  } else if (browserConfig && resolvedModel.startsWith('gemini')) {
    browserDeps = {
      executeBrowser: createGeminiWebExecutor({
        youtube: options.youtube,
        generateImage: options.generateImage,
        editImage: options.editImage,
        outputPath: options.output,
        aspectRatio: options.aspect,
        showThoughts: options.geminiShowThoughts,
        geminiUrl: options.geminiUrl ?? userConfig.browser?.geminiUrl ?? undefined,
      }),
    };
    console.log(chalk.dim('Using Gemini web client for browser automation'));
    if (browserConfig.modelStrategy && browserConfig.modelStrategy !== 'select') {
      console.log(chalk.dim('Browser model strategy is ignored for Gemini web runs.'));
    }
  }
  const remoteExecutionActive = Boolean(browserDeps);

  if (options.dryRun) {
    const baseRunOptions = buildRunOptions(resolvedOptions, {
      preview: false,
      previewMode: undefined,
      baseUrl: resolvedBaseUrl,
    });
    await runDryRunSummary(
      {
        engine,
        runOptions: baseRunOptions,
        cwd: process.cwd(),
        version: VERSION,
        log: console.log,
        browserConfig,
      },
      {},
    );
    return;
  }

  if (browserConfig && !remoteExecutionActive && browserConfig.target === 'chatgpt') {
    browserDeps = {
      ...browserDeps,
      providerSessionAuthorization:
        buildRootBrowserProviderSessionAuthorization(userConfig, browserConfig) ?? undefined,
    };
  }

  await sessionStore.ensureStorage();
  const baseRunOptions = buildRunOptions(resolvedOptions, {
    preview: false,
    previewMode: undefined,
    background: userConfig.background ?? resolvedOptions.background,
    baseUrl: resolvedBaseUrl,
  });
  enforceBrowserSearchFlag(baseRunOptions, sessionMode, console.log);
  if (sessionMode === 'browser' && baseRunOptions.search === false) {
    console.log(chalk.dim('Note: search is not available in browser engine; ignoring search=false.'));
    baseRunOptions.search = undefined;
  }
  let sessionMeta = await sessionStore.createSession(
    {
      ...resolvedOptions,
      selectedAgentId: typeof options.agent === 'string' ? options.agent.trim() || null : null,
      mode: engine as SessionMode,
      browserConfig,
    },
    process.cwd(),
    notifications,
  );
  if (browserContext && sessionMode === 'browser') {
    sessionMeta = await sessionStore.updateSession(sessionMeta.id, {
      browser: { config: browserConfig, context: browserContext },
    });
  }
  const liveRunOptions: RunOracleOptions = {
    ...baseRunOptions,
    sessionId: sessionMeta.id,
    effectiveModelId,
  };
  const disableDetachEnv = process.env.AURACALL_NO_DETACH === '1';
  const detachAllowed = remoteExecutionActive
    ? false
    : shouldDetachSession({
        engine,
        model: resolvedModel,
        waitPreference,
        disableDetachEnv,
      });
  const detached = !detachAllowed
    ? false
    : await launchDetachedSession(sessionMeta.id).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`Unable to detach session runner (${message}). Running inline...`));
      return false;
    });

  if (!waitPreference) {
    if (!detached) {
      console.log(chalk.red('Unable to start in background; use --wait to run inline.'));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.blue(`Session running in background. Reattach via: auracall session ${sessionMeta.id}`));
    console.log(
      chalk.dim('Pro runs can take up to 60 minutes (usually 10-15). Add --wait to stay attached.'),
    );
    return;
  }

  if (detached === false) {
    await runInteractiveSession(
      sessionMeta,
      liveRunOptions,
      sessionMode,
      browserConfig,
      false,
      notifications,
      userConfig,
      true,
      browserDeps,
    );
    exitAfterCompletedInlineBrowserWait(sessionMode);
    return;
  }
  if (detached) {
    console.log(chalk.blue(`Reattach via: auracall session ${sessionMeta.id}`));
    await attachSession(sessionMeta.id, { suppressMetadata: true });
  }
}

async function runInteractiveSession(
  sessionMeta: SessionMetadata,
  runOptions: RunOracleOptions,
  mode: SessionMode,
  browserConfig?: BrowserSessionConfig,
  showReattachHint = true,
  notifications?: NotificationSettings,
  userConfig?: ResolvedUserConfig,
  suppressSummary = false,
  browserDeps?: BrowserSessionRunnerDeps,
): Promise<void> {
  const { logLine, writeChunk, stream } = sessionStore.createLogWriter(sessionMeta.id);
  let headerAugmented = false;
  const combinedLog = (message = ''): void => {
    if (!headerAugmented && message.startsWith('auracall (')) {
      headerAugmented = true;
      if (showReattachHint) {
        console.log(`${message}\n${chalk.blue(`Reattach via: auracall session ${sessionMeta.id}`)}`);
      } else {
        console.log(message);
      }
      logLine(message);
      return;
    }
    console.log(message);
    logLine(message);
  };
  const combinedWrite = (chunk: string): boolean => {
    // runOracle handles stdout; keep this write hook for session logs only to avoid double-printing
    writeChunk(chunk);
    return true;
  };
  try {
    await performSessionRun({
      sessionMeta,
      runOptions,
      mode,
      browserConfig,
      cwd: process.cwd(),
      log: combinedLog,
      write: combinedWrite,
      version: VERSION,
      notifications:
        notifications ?? deriveNotificationSettingsFromMetadata(sessionMeta, process.env, userConfig?.notify),
      browserDeps,
      userConfig,
    });
    const latest = await sessionStore.readSession(sessionMeta.id);
    if (!suppressSummary) {
      const summary = latest ? formatCompletionSummary(latest, { includeSlug: true }) : null;
      if (summary) {
        console.log('\n' + chalk.green.bold(summary));
        logLine(summary); // plain text in log, colored on stdout
      }
    }
  } catch (error) {
    throw error;
  } finally {
    await closeSessionLogStream(stream);
  }
}

async function closeSessionLogStream(stream: NodeJS.WritableStream): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.end(() => resolve());
  });
}

function exitAfterCompletedInlineBrowserWait(sessionMode: SessionMode): void {
	if (sessionMode !== 'browser') {
		return;
	}
	if (process.env.AURACALL_DISABLE_BROWSER_WAIT_FORCE_EXIT === '1') {
    return;
  }
  // Browser/CDP/notifier libraries can leave non-critical handles alive after
  // the session is durably completed and the log stream is flushed. Inline
  // browser --wait is a one-shot CLI contract, so exit explicitly instead of
	// letting those handles turn a successful run into a caller-side timeout.
	process.exit(process.exitCode ?? 0);
}

function exitAfterCompletedBrowserFileCommand(): void {
	if (process.env.AURACALL_DISABLE_BROWSER_FILE_FORCE_EXIT === '1') {
		return;
	}
	// Account-file list/download and conversation-artifact fetch commands are
	// one-shot browser utility commands.
	// CDP handles may remain open after the operation has completed and stdout
	// has been flushed, so exit explicitly to preserve CLI completion semantics.
	process.exit(process.exitCode ?? 0);
}

async function launchDetachedSession(sessionId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const args = ['--', CLI_ENTRYPOINT, '--exec-session', sessionId];
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function executeSession(sessionId: string) {
  const metadata = await sessionStore.readSession(sessionId);
  if (!metadata) {
    console.error(chalk.red(`No session found with ID ${sessionId}`));
    process.exitCode = 1;
    return;
  }
  const runOptions = buildRunOptionsFromMetadata(metadata);
  const sessionMode = getSessionMode(metadata);
  const browserConfig = getBrowserConfigFromMetadata(metadata);
  const { logLine, writeChunk, stream } = sessionStore.createLogWriter(sessionId);
  const userConfig = await resolveConfig({}, metadata.cwd ?? process.cwd(), process.env);
  const notifications = deriveNotificationSettingsFromMetadata(metadata, process.env, userConfig.notify);
  const browserDeps =
    browserConfig?.target === 'chatgpt'
      ? {
          providerSessionAuthorization:
            buildRootBrowserProviderSessionAuthorization(userConfig, browserConfig) ?? undefined,
        }
      : undefined;
  try {
    await performSessionRun({
      sessionMeta: metadata,
      runOptions,
      mode: sessionMode,
      browserConfig,
      cwd: metadata.cwd ?? process.cwd(),
      log: logLine,
      write: writeChunk,
      version: VERSION,
      notifications,
      browserDeps,
      userConfig,
    });
  } catch {
    // Errors are already logged to the session log; keep quiet to mirror stored-session behavior.
  } finally {
    await closeSessionLogStream(stream);
  }
}

function printDebugHelp(cliName: string): void {
  console.log(chalk.bold('Advanced Options'));
  printDebugOptionGroup([
    ['--search <on|off>', 'Enable or disable the server-side search tool (default on).'],
    ['--max-input <tokens>', 'Override the input token budget.'],
    ['--max-output <tokens>', 'Override the max output tokens (model default otherwise).'],
  ]);
  console.log('');
  console.log(chalk.bold('Browser Options'));
  printDebugOptionGroup([
    ['--chatgpt-url <url>', 'Override the ChatGPT web URL (workspace/folder targets).'],
    ['--gemini-url <url>', 'Override the Gemini web URL (e.g., https://gemini.google.com/gem/<id>).'],
    ['--grok-url <url>', 'Override the Grok web URL (e.g., https://grok.com/project/<id>).'],
    ['--browser-target <chatgpt|gemini|grok>', 'Override the browser automation target.'],
    ['--browser-chrome-profile <name>', 'Reuse cookies from a specific Chrome profile.'],
    ['--browser-chrome-path <path>', 'Point to a custom Chrome/Chromium binary.'],
    ['--browser-cookie-path <path>', 'Use a specific Chrome/Chromium cookie store file.'],
    ['--browser-bootstrap-cookie-path <path>', 'Seed the managed Aura-Call profile from a different cookie store without changing the runtime browser.'],
    ['--browser-url <url>', 'Alias for --chatgpt-url.'],
    ['--browser-timeout <ms|s|m>', 'Cap total wait time for the assistant response.'],
    ['--browser-input-timeout <ms|s|m>', 'Cap how long we wait for the composer textarea.'],
    ['--browser-cookie-wait <ms|s|m>', 'Wait before retrying cookie sync when Chrome cookies are empty or locked.'],
    ['--browser-cookie-sync', 'Copy cookies from a source browser profile (explicit opt-in).'],
    ['--browser-no-cookie-sync', 'Skip copying cookies from your main profile.'],
    ['--browser-manual-login', 'Skip cookie copy; reuse a persistent automation profile and log in manually.'],
    ['--browser-headless', 'Launch Chrome in headless mode.'],
    ['--browser-hide-window', 'Hide the Chrome window (macOS headful only).'],
    ['--browser-keep-browser', 'Leave Chrome running after completion.'],
  ]);
  console.log('');
  console.log(chalk.dim(`Tip: run \`${cliName} --help\` to see the primary option set.`));
}

function printDebugOptionGroup(entries: Array<[string, string]>): void {
  const flagWidth = Math.max(...entries.map(([flag]) => flag.length));
  entries.forEach(([flag, description]) => {
    const label = chalk.cyan(flag.padEnd(flagWidth + 2));
    console.log(`  ${label}${description}`);
  });
}

function resolveWaitFlag({
  waitFlag,
  noWaitFlag,
  model,
  engine,
}: {
  waitFlag?: boolean;
  noWaitFlag?: boolean;
  model: ModelName;
  engine: EngineMode;
}): boolean {
  if (waitFlag === true) return true;
  if (noWaitFlag === true) return false;
  return defaultWaitPreference(model, engine);
}

async function readArchiveEvidencePayloadForCli(options: {
  payloadJson?: string;
  payloadFile?: string;
}): Promise<unknown> {
  const hasInline = typeof options.payloadJson === 'string' && options.payloadJson.trim().length > 0;
  const hasFile = typeof options.payloadFile === 'string' && options.payloadFile.trim().length > 0;
  if (hasInline && hasFile) {
    throw new Error('Use only one of --payload-json or --payload-file.');
  }
  if (!hasInline && !hasFile) {
    throw new Error('Use --payload-json <json> or --payload-file <path> to provide archive evidence.');
  }
  const raw = hasInline ? options.payloadJson as string : await fs.readFile(options.payloadFile as string, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid archive evidence JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readCliApiConfig(config: unknown): {
  host?: string;
  port?: number;
  dashboardUrl?: string;
} {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const api = (config as { api?: unknown }).api;
  if (!api || typeof api !== 'object' || Array.isArray(api)) return {};
  return {
    host: readCliNonEmptyString((api as { host?: unknown }).host),
    port: readCliPositiveInteger((api as { port?: unknown }).port),
    dashboardUrl: readCliNonEmptyString((api as { dashboardUrl?: unknown }).dashboardUrl),
  };
}

function readCliNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readCliPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function normalizeApiServeProofProvider(value: unknown): 'chatgpt' | 'gemini' | 'grok' | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  throw new Error('Use --account-mirror-proof-provider chatgpt, gemini, or grok.');
}


program.action(async function (this: Command) {
  const options = this.optsWithGlobals() as CliOptions;
  await runRootCommand(options);
});

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof SessionRunCancelledError) {
      console.log(chalk.yellow('\nInterrupted after browser cleanup completed.'));
      process.exitCode = 130;
      return;
    }
    console.error(chalk.red('FATAL ERROR:'), error);
    process.exit(1);
  }
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    if (!isErrorLogged(error)) {
      console.error(chalk.red('✖'), error.message);
    }
  } else {
    console.error(chalk.red('✖'), error);
  }
  process.exitCode = 1;
});
