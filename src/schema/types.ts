import { z } from 'zod';
import { ChatgptFeatureSchema, GeminiFeatureSchema, GrokFeatureSchema } from '../browser/llmService/providers/schema.js';
import { parseDuration } from '../browser/utils.js';

// Helper for duration parsing (string "1h" or number ms)
// biome-ignore lint/style/useNamingConvention: schema helper naming is stable.
const DurationMs = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    return parseDuration(val, 0);
  });

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const NotifyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  sound: z.boolean().optional(),
  muteIn: z.array(z.enum(['CI', 'SSH'])).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const AzureConfigSchema = z.object({
  endpoint: z.string().optional(),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RemoteServiceConfigSchema = z.object({
  host: z.string().optional(),
  token: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ApiServerConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  dashboardUrl: z.string().optional(),
  publicDashboardUrl: z.string().optional(),
  accountMirrorScheduler: z.object({
    intervalMs: z.number().int().nonnegative().optional(),
    execute: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  auth: z.object({
    required: z.boolean().optional(),
    enabled: z.boolean().optional(),
    keys: z.array(z.object({
      id: z.string().optional(),
      secret: z.string().optional(),
      key: z.string().optional(),
      token: z.string().optional(),
      agents: z.array(z.string()).optional(),
      teams: z.array(z.string()).optional(),
      services: z.array(z.string()).optional(),
      runtimeProfiles: z.array(z.string()).optional(),
    })).optional(),
  }).optional(),
  routing: z.object({
    localHostname: z.string().optional(),
    externalHostname: z.string().optional(),
    localBaseUrl: z.string().optional(),
    externalBaseUrl: z.string().optional(),
    dashboardPath: z.string().optional(),
    accountMirrorPath: z.string().optional(),
    proxyTarget: z.string().optional(),
    auth: z.string().optional(),
    ingress: z.string().optional(),
  }).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserListConfigSchema = z.object({
  includeHistory: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  filter: z.string().optional(),
  refresh: z.boolean().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceIdentitySchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  handle: z.string().optional(),
  email: z.string().optional(),
  accountId: z.string().optional(),
  accountLevel: z.string().optional(),
  accountLabel: z.string().optional(),
  accountPlanType: z.string().optional(),
  accountStructure: z.string().optional(),
  organizationId: z.string().optional(),
  capabilityProfile: z.string().optional(),
  proAccess: z.string().optional(),
  deepResearchAccess: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceLiveFollowAccountLibrarySchema = z.object({
  mode: z.enum(['disabled', 'preview_only', 'eligible']).optional(),
  maxItems: z.number().int().positive().optional(),
  minIntervalMs: z.number().int().nonnegative().optional(),
  failureCooldownMs: z.number().int().nonnegative().optional(),
  maxActiveJobs: z.number().int().positive().optional(),
  providerWorkTimeoutMs: z.number().int().positive().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceLiveFollowSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.string().optional(),
  priority: z.string().optional(),
  sweepMode: z.enum(['steady_follow', 'full_sweep']).optional(),
  materializationPolicy: z.enum(['metadata_only', 'recent_missing_assets', 'full_missing_assets']).optional(),
  materializationAssetKinds: z.array(z.enum(['artifacts', 'files', 'media', 'all'])).optional(),
  materializationMaxItems: z.number().int().positive().optional(),
  materializationRefreshSnapshot: z.boolean().optional(),
  materializationForce: z.boolean().optional(),
  accountLibrary: ServiceLiveFollowAccountLibrarySchema.optional(),
  minIntervalMs: z.number().int().nonnegative().optional(),
  explicitRefreshMinIntervalMs: z.number().int().nonnegative().optional(),
  jitterMaxMs: z.number().int().nonnegative().optional(),
  failureBaseCooldownMs: z.number().int().nonnegative().optional(),
  failureMaxCooldownMs: z.number().int().nonnegative().optional(),
  hardStopCooldownMs: z.number().int().nonnegative().optional(),
  maxBrowserInteractionsPerMinute: z.number().int().positive().optional(),
  maxPageReadsPerCycle: z.number().int().nonnegative().optional(),
  maxConversationRowsPerCycle: z.number().int().nonnegative().optional(),
  maxArtifactRowsPerCycle: z.number().int().nonnegative().optional(),
  freshFrontierThreshold: z.number().int().positive().optional(),
  conversationReadCooldownMs: z.number().int().nonnegative().optional(),
  pageRefreshCooldownMs: z.number().int().nonnegative().optional(),
  renavigationCooldownMs: z.number().int().nonnegative().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceTenantLimitsSchema = z.object({
  maxConcurrentChats: z.number().int().positive().optional(),
  maxChatsPerHour: z.number().int().positive().optional(),
  maxChatsPerDay: z.number().int().positive().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const HandoffAttachmentPackagingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  zipWhenFileCountExceeds: z.number().int().positive().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const HandoffConfigSchema = z.object({
  attachmentPackaging: HandoffAttachmentPackagingConfigSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceConfigSchema = z.object({
  url: z.string().optional(),
  identity: ServiceIdentitySchema.optional(),
  liveFollow: ServiceLiveFollowSchema.optional(),
  tenantLimits: ServiceTenantLimitsSchema.optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  conversationId: z.string().optional(),
  conversationName: z.string().optional(),
  model: z.string().optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  deepResearchPlanAction: z.enum(['start', 'edit']).optional(),
  chatgptMode: z.enum(['chat', 'work']).optional(),
  chatgptToolApproval: z.enum(['manual', 'allow-once', 'always-allow']).optional(),
  workModel: z.string().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ChatgptServiceConfigSchema = ServiceConfigSchema.extend({
  features: ChatgptFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GrokServiceConfigSchema = ServiceConfigSchema.extend({
  features: GrokFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GeminiServiceConfigSchema = ServiceConfigSchema.extend({
  features: GeminiFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const LlmDefaultsSchema = z.object({
  model: z.string().optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  defaultProjectName: z.string().optional(),
  defaultProjectId: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserCacheConfigSchema = z.object({
  store: z.enum(['json', 'sqlite', 'dual']).optional(),
  refresh: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  includeProjectOnlyConversations: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  cleanupDays: z.number().optional(),
  identityKey: z.string().optional(),
  identity: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      handle: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  rootDir: z.string().optional(),
  useDetectedIdentity: z.boolean().optional(),
  refreshHours: z.number().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserSessionOpenConfigSchema = z.object({
  openConversation: z.boolean().optional(),
  printUrl: z.boolean().optional(),
  browserPath: z.string().optional(),
  browserProfile: z.string().optional(),
});

const AGENT_BROWSER_RDP_CONFIG_SCHEMA = z.object({
  enabled: z.boolean(),
  runtimeProfile: z.string().trim().min(1),
  routePoolEntryId: z.string().trim().min(1).optional(),
  desktopName: z.string().trim().min(1).optional(),
  command: z.string().trim().min(1).optional(),
  jobTimeoutMs: z.number().int().positive().optional(),
});

const nativeControlOrigin = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'http:' && (/^127\.(?:[0-9]+\.){2}[0-9]+$/.test(url.hostname) || url.hostname === '[::1]') &&
    !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.port !== '0';
}, 'Native control requires a credential-free loopback HTTP origin.');
const nativePresentationOrigin = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.port !== '0';
}, 'Native presentation requires a credential-free HTTPS origin.');

// biome-ignore lint/style/useNamingConvention: public config schema name.
export const RemoteViewConfigSchema = z.object({
  controlInactivitySeconds: z.number().int().min(5).max(3600).default(120),
  application: z.object({ origin: nativeControlOrigin, publicOrigin: nativePresentationOrigin, appOrigin: nativePresentationOrigin, name: z.string().trim().min(1).default('auracall') }).optional(),
  defaultDesktop: z.string().trim().min(1).optional(),
  desktops: z.record(z.string().trim().min(1), z.object({
    runtimeProfile: z.string().trim().min(1).optional(),
    routePoolEntryId: z.string().trim().min(1).optional(),
    poolName: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).optional(),
    command: z.string().trim().min(1).optional(),
    jobTimeoutMs: z.number().int().positive().optional(),
  }).refine((desktop) => desktop.poolName ? !desktop.routePoolEntryId : Boolean(desktop.runtimeProfile && desktop.routePoolEntryId), 'Configure a native poolName or a legacy runtimeProfile and routePoolEntryId')).default({}).refine((desktops) => !Object.hasOwn(desktops, 'root'), 'root is reserved for the root desktop'),
  rootDesktopUrl: z.url().refine((value) => /^https?:\/\//.test(value), 'Root desktop URL must use HTTP or HTTPS').optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserConfigSchema = z.object({
  tabConcurrencyMode: z.enum(['serialized', 'tab-affinity']).optional(),
  // Targeting
  target: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  
  // Scope
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  conversationId: z.string().optional(),
  conversationName: z.string().optional(),
  
  // URLs
  grokUrl: z.string().optional(),
  chatgptUrl: z.string().optional(),
  geminiUrl: z.string().optional(),
  url: z.string().optional(), // generic/fallback
  
  // Chrome / Lifecycle
  browserFamily: z.enum(['chrome', 'chromium']).optional(),
  browserBuild: z.enum(['stock_chrome', 'stealthcdp_chromium']).optional(),
  agentBrowserRdp: AGENT_BROWSER_RDP_CONFIG_SCHEMA.optional(),
  desktop: z.string().trim().min(1).optional(),
  chromeProfile: z.string().optional(),
  chromePath: z.string().optional(),
  chromeCookiePath: z.string().optional(),
  bootstrapCookiePath: z.string().optional(),
  display: z.string().optional(),
  managedProfileRoot: z.string().optional(),
  profileConflictAction: z.enum(['fail', 'terminate-existing', 'attach-existing']).optional(),
  blockingProfileAction: z.enum(['fail', 'restart', 'restart-managed', 'restart-auracall']).optional(),
  headless: z.boolean().optional(),
  hideWindow: z.boolean().optional(),
  keepBrowser: z.boolean().optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  wslChromePreference: z.enum(['auto', 'wsl', 'windows']).optional(),
  serviceTabLimit: z.number().int().positive().optional(),
  blankTabLimit: z.number().int().min(0).optional(),
  collapseDisposableWindows: z.boolean().optional(),
  
  // Connection
  debugPort: z.number().optional(),
  debugPortStrategy: z.enum(['fixed', 'auto']).optional(),
  debugPortRange: z.tuple([z.number(), z.number()]).optional(),
  remoteChrome: z.object({ host: z.string(), port: z.number() }).optional().or(z.string().optional()), // CLI passes string
  
  // Timing
  timeoutMs: DurationMs.optional(),
  inputTimeoutMs: DurationMs.optional(),
  cookieSyncWaitMs: DurationMs.optional(),
  
  // Cookies
  cookieNames: z.array(z.string()).optional().or(z.string().optional()), // CLI passes string
  cookieSync: z.boolean().optional(),
  inlineCookies: z.string().optional(), // JSON or Base64 string
  inlineCookiesFile: z.string().optional(),
  allowCookieErrors: z.boolean().optional(),
  noCookieSync: z.boolean().optional(),
  
  // Behavior
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  chatgptMode: z.enum(['chat', 'work']).optional(),
  chatgptToolApproval: z.enum(['manual', 'allow-once', 'always-allow']).optional(),
  workModel: z.string().optional(),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  deepResearchPlanAction: z.enum(['start', 'edit']).optional(),
  attachments: z.enum(['auto', 'never', 'always']).optional(),
  inlineFiles: z.boolean().optional(),
  bundleFiles: z.boolean().optional(),
  
  // Sub-configs
  list: BrowserListConfigSchema.optional(),
  cache: BrowserCacheConfigSchema.optional(),
  sessionOpen: BrowserSessionOpenConfigSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileBrowserSchema = z.object({
  tabConcurrencyMode: z.enum(['serialized', 'tab-affinity']).optional(),
  browserFamily: z.enum(['chrome', 'chromium']).optional(),
  browserBuild: z.enum(['stock_chrome', 'stealthcdp_chromium']).optional(),
  agentBrowserRdp: AGENT_BROWSER_RDP_CONFIG_SCHEMA.optional(),
  desktop: z.string().trim().min(1).optional(),
  chromePath: z.string().optional(),
  chromeProfile: z.string().optional(),
  profilePath: z.string().optional(),
  profileName: z.string().optional(),
  chromeCookiePath: z.string().optional(),
  cookiePath: z.string().optional(),
  bootstrapCookiePath: z.string().optional(),
  display: z.string().optional(),
  managedProfileRoot: z.string().optional(),
  profileConflictAction: z.enum(['fail', 'terminate-existing', 'attach-existing']).optional(),
  blockingProfileAction: z.enum(['fail', 'restart', 'restart-managed', 'restart-auracall']).optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  headless: z.boolean().optional(),
  hideWindow: z.boolean().optional(),
  keepBrowser: z.boolean().optional(),
  debugPort: z.number().optional(),
  debugPortStrategy: z.enum(['fixed', 'auto']).optional(),
  debugPortRange: z.tuple([z.number(), z.number()]).optional(),
  remoteChrome: z.object({ host: z.string(), port: z.number() }).optional().or(z.string().optional()),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  deepResearchPlanAction: z.enum(['start', 'edit']).optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  chatgptMode: z.enum(['chat', 'work']).optional(),
  chatgptToolApproval: z.enum(['manual', 'allow-once', 'always-allow']).optional(),
  workModel: z.string().optional(),
  attachments: z.enum(['auto', 'never', 'always']).optional(),
  inlineFiles: z.boolean().optional(),
  bundleFiles: z.boolean().optional(),
  cookieNames: z.array(z.string()).optional().or(z.string().optional()),
  cookieSync: z.boolean().optional(),
  inlineCookies: z.string().optional(),
  inlineCookiesFile: z.string().optional(),
  allowCookieErrors: z.boolean().optional(),
  noCookieSync: z.boolean().optional(),
  cookieSyncWaitMs: DurationMs.optional(),
  wslChromePreference: z.enum(['auto', 'wsl', 'windows']).optional(),
  serviceTabLimit: z.number().int().positive().optional(),
  blankTabLimit: z.number().int().min(0).optional(),
  collapseDisposableWindows: z.boolean().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileCacheSchema = z.object({
  store: z.enum(['json', 'sqlite', 'dual']).optional(),
  refresh: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  includeProjectOnlyConversations: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  cleanupDays: z.number().optional(),
  rootDir: z.string().optional(),
  useDetectedIdentity: z.boolean().optional(),
  refreshHours: z.number().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileLlmSchema = LlmDefaultsSchema;

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RuntimeProfileBrowserReferenceSchema = z.object({
  browserFamily: z.string().optional(),
  browserProfile: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileSchema = RuntimeProfileBrowserReferenceSchema.extend({
  engine: z.enum(['api', 'browser']).optional(),
  search: z.union([z.enum(['on', 'off']), z.boolean()])
    .transform((val) => {
      if (typeof val === 'boolean') return val ? 'on' : 'off';
      return val;
    })
    .optional(),
  defaultService: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  keepBrowser: z.boolean().optional(),
  browser: OracleProfileBrowserSchema.optional(),
  llm: OracleProfileLlmSchema.optional(),
  services: z
    .object({
      chatgpt: ChatgptServiceConfigSchema.optional(),
      gemini: GeminiServiceConfigSchema.optional(),
      grok: GrokServiceConfigSchema.optional(),
    })
    .optional(),
  cache: OracleProfileCacheSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleServicesSchema = z.object({
  chatgpt: ChatgptServiceConfigSchema.optional(),
  gemini: GeminiServiceConfigSchema.optional(),
  grok: GrokServiceConfigSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserProfilesConfigSchema = z.record(z.string(), OracleProfileBrowserSchema);

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RuntimeProfilesConfigSchema = z.record(z.string(), OracleProfileSchema);

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const AgentConfigSchema = z.object({
  runtimeProfile: z.string().optional(),
  tenantKey: z.string().optional(),
  bindingId: z.string().optional(),
  service: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  model: z.string().optional(),
  modelSelector: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  projectBinding: z
    .object({
      mode: z.enum(['none', 'fixed', 'alias']).optional(),
      id: z.string().optional(),
      providerProjectId: z.string().optional(),
      label: z.string().optional(),
    })
    .optional(),
  conversationId: z.string().optional(),
  conversationName: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  prePrompt: z.string().optional(),
  postPrompt: z.string().optional(),
  knowledge: z
    .object({
      artifactIds: z.array(z.string()).optional(),
      fileIds: z.array(z.string()).optional(),
      notes: z.array(z.string()).optional(),
    })
    .optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamRoleConfigSchema = z.object({
  agent: z.string(),
  order: z.number().int().positive().optional(),
  instructions: z.string().optional(),
  responseShape: z.record(z.string(), z.unknown()).optional(),
  stepKind: z.enum(['prompt', 'analysis', 'handoff', 'review', 'synthesis']).optional(),
  handoffToRole: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamDispatchConfigSchema = z.object({
  mode: z.enum(['next_available']).optional(),
  projectSync: z.literal('none').optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamProjectConfigSchema = z.object({
  name: z.string().trim().min(1),
  createIfMissing: z.boolean().optional(),
  sync: z.literal('none').optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamConfigSchema = z.object({
  type: z.enum(['workflow', 'dispatch-pool']).optional(),
  agents: z.array(z.string()).optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  dispatch: TeamDispatchConfigSchema.optional(),
  project: TeamProjectConfigSchema.optional(),
  roles: z.record(z.string(), TeamRoleConfigSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleDevConfigSchema = z.object({
  browserPortRange: z.tuple([z.number(), z.number()]).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeLocalShellPolicySchema = z.object({
  complexityStage: z.enum(['bounded-command', 'repo-automation', 'extended']).optional(),
  allowedCommands: z.array(z.string()).optional(),
  allowedCwdRoots: z.array(z.string()).optional(),
  defaultShellActionTimeoutMs: DurationMs.optional(),
  maxShellActionTimeoutMs: DurationMs.optional(),
  maxCaptureChars: z.number().int().positive().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeLocalActionsSchema = z.object({
  shell: OracleRuntimeLocalShellPolicySchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeConfigSchema = z.object({
  localActions: OracleRuntimeLocalActionsSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TerminalSessionReceiptsConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    root: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => value === 'auracall-home' || /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value),
        'terminalSessionReceipts.root must be "auracall-home" or an absolute path.',
      )
      .optional(),
    schemaVersion: z.literal(1).default(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && !value.root) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['root'],
        message: 'terminalSessionReceipts.root is required when receipt emission is enabled.',
      });
    }
  });

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ConfigSchema = z.object({
  version: z.number().optional(),
  globals: z
    .object({
      cacheRoot: z.string().optional(),
      logLevel: z.string().optional(),
    })
    .optional(),
  browserDefaults: OracleProfileBrowserSchema.optional(),
  browserFamilies: BrowserProfilesConfigSchema.optional(),
  browserProfiles: BrowserProfilesConfigSchema.optional(),
  llmDefaults: LlmDefaultsSchema.optional(),
  profiles: RuntimeProfilesConfigSchema.optional(),
  runtimeProfiles: RuntimeProfilesConfigSchema.optional(),
  // Core
  engine: z.enum(['api', 'browser']).optional(),
  model: z.string().default('openai:frontier'),
  prompt: z.string().optional(),
  promptSuffix: z.string().optional(),
  
  // Files
  file: z.array(z.string()).optional(),
  filesReport: z.boolean().optional(),
  
  // Search
  search: z.union([z.enum(['on', 'off']), z.boolean()])
    .transform((val) => {
      if (typeof val === 'boolean') return val ? 'on' : 'off';
      return val;
    })
    .optional(),
  
  // Output
  writeOutput: z.string().optional(), // overwrite
  writeOutputPath: z.string().optional(), // append model
  renderMarkdown: z.boolean().optional(),
  renderPlain: z.boolean().optional(),
  verboseRender: z.boolean().optional(),
  
  // Notification
  notify: NotifyConfigSchema.optional(),
  
  // Azure
  azure: AzureConfigSchema.optional(),
  
  // Remote
  remote: RemoteServiceConfigSchema.optional(),
  remoteHost: z.string().optional(),
  remoteToken: z.string().optional(),
  api: ApiServerConfigSchema.optional(),
  
  // Misc
  verbose: z.boolean().optional(),
  timeout: DurationMs.optional(), // CLI --timeout
  apiBaseUrl: z.string().optional(),
  sessionRetentionHours: z.number().optional(),
  background: z.boolean().optional(),
  heartbeatSeconds: z.number().optional(),
  
  // Profiles + services
  defaultRuntimeProfile: z.string().optional(),
  auracallProfile: z.string().optional(),
  auracallProfiles: RuntimeProfilesConfigSchema.optional(),
  services: OracleServicesSchema.optional(),
  handoff: HandoffConfigSchema.optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  teams: z.record(z.string(), TeamConfigSchema).optional(),
  dev: OracleDevConfigSchema.optional(),
  runtime: OracleRuntimeConfigSchema.optional(),
  terminalSessionReceipts: TerminalSessionReceiptsConfigSchema.optional(),

  remoteView: RemoteViewConfigSchema.optional(),

  // Nested
  browser: BrowserConfigSchema.default({}),
});

export type OracleConfig = z.infer<typeof ConfigSchema>;
