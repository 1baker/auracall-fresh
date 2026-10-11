import type CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol';

export type ChromeClient = Awaited<ReturnType<typeof CDP>>;
export type DevToolsAttachmentStage =
  | 'browserDevToolsTargetResolution'
  | 'browserDevToolsCdpConnection'
  | 'browserDevToolsConnected';
export interface DevToolsConnectionOptions {
  abortSignal?: AbortSignal;
  stageTimeoutMs?: number;
  onStage?: (stage: DevToolsAttachmentStage) => void;
  host?: string;
  port?: number;
  tabTargetId?: string;
}
export type CookieParam = Protocol.Network.CookieParam;
export type DebugPortStrategy = 'fixed' | 'auto';
export type BrowserProfileFamily = 'chrome' | 'chromium';
export type AgentBrowserBuild = 'stock_chrome' | 'stealthcdp_chromium';

export interface RemoteViewDesktopConfig {
  desktopName: string;
  origin: string;
  publicOrigin: string;
  appOrigin: string;
  application: string;
  poolName: string;
}

export interface AgentBrowserRdpConfig {
  enabled: boolean;
  runtimeProfile: string;
  /** Exact service-owned route pool entry for a configured AuraCall desktop. */
  routePoolEntryId?: string;
  desktopName?: string;
  command?: string;
  jobTimeoutMs?: number;
}

export type BrowserLogger = ((message: string) => void) & {
  verbose?: boolean;
  sessionLog?: (message: string) => void;
};

export interface BrowserAttachment {
  path: string;
  displayPath: string;
  sizeBytes?: number;
}

export interface BrowserRuntimeMetadata {
  chromePid?: number;
  chromePort?: number;
  chromeHost?: string;
  userDataDir?: string;
  chromeTargetId?: string;
  tabUrl?: string;
  observedModel?: string | null;
  composerTool?: string | null;
  thinkingTime?: string;
  chatgptProMode?: string;
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
  chatgptDeepResearchStage?: string;
  chatgptDeepResearchPlanAction?: string;
  chatgptDeepResearchStartMethod?: string | null;
  chatgptDeepResearchStartLabel?: string | null;
  chatgptDeepResearchModifyPlanLabel?: string | null;
  chatgptDeepResearchModifyPlanVisible?: boolean;
  chatgptDeepResearchReviewEvidence?: Record<string, unknown> | null;
  /** PID of the controller process that launched this browser run. Helps detect orphaned sessions. */
  controllerPid?: number;
}

export interface BrowserSessionConfig {
  browserFamily?: BrowserProfileFamily | null;
  browserBuild?: AgentBrowserBuild | null;
  agentBrowserRdp?: AgentBrowserRdpConfig | null;
  remoteViewDesktop?: RemoteViewDesktopConfig | null;
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  url?: string;
  timeoutMs?: number;
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  cookieNames?: string[] | string | null;
  cookieSyncWaitMs?: number;
  inlineCookies?: CookieParam[] | string | null;
  inlineCookiesSource?: string | null;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  debug?: boolean;
  allowCookieErrors?: boolean;
  remoteChrome?: { host: string; port: number } | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export interface BrowserAutomationConfig {
  tabConcurrencyMode?: 'serialized' | 'tab-affinity';
  browserFamily?: BrowserProfileFamily | null;
  browserBuild?: AgentBrowserBuild | null;
  agentBrowserRdp?: AgentBrowserRdpConfig | null;
  remoteViewDesktop?: RemoteViewDesktopConfig | null;
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  display?: string | null;
  profileConflictAction?: 'fail' | 'terminate-existing' | 'attach-existing';
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  url?: string;
  timeoutMs?: number;
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  cookieNames?: string[] | string | null;
  cookieSyncWaitMs?: number;
  inlineCookies?: CookieParam[] | string | null;
  inlineCookiesSource?: string | null;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  debug?: boolean;
  allowCookieErrors?: boolean;
  remoteChrome?: { host: string; port: number } | string | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  manualLoginWaitForSession?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export interface BrowserRunOptions {
  prompt: string;
  attachments?: BrowserAttachment[];
  attachmentMode?: 'inline' | 'upload' | 'bundle';
  completionMode?: 'assistant_response' | 'prompt_submitted';
  /** 
   * Optional secondary submission to try if the initial prompt is rejected.
   * Intended for inline->upload fallback.
   */
  fallbackSubmission?: { prompt: string; attachments: BrowserAttachment[] };
  config?: BrowserAutomationConfig;
  log?: BrowserLogger;
  heartbeatIntervalMs?: number;
  verbose?: boolean;
  skipBrowserExecutionOperation?: boolean;
  /** Stable owner label for the browser operation dispatcher lock/queue. */
  browserOperationOwnerCommand?: string | null;
  /** Optional hook to persist runtime info (port/url/target) as soon as Chrome is ready. */
  runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
  /** Cancels the complete browser run, including cleanup and operation-lock release. */
  abortSignal?: AbortSignal;
}

export interface BrowserRunResult {
  answerText: string;
  answerMarkdown: string;
  answerHtml?: string;
  tookMs: number;
  answerTokens: number;
  answerChars: number;
  chromePid?: number;
  chromePort?: number;
  chromeHost?: string;
  userDataDir?: string;
  chromeTargetId?: string;
  tabUrl?: string;
  observedModel?: string | null;
  composerTool?: string | null;
  thinkingTime?: string;
  chatgptProMode?: string;
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
  chatgptDeepResearchStage?: string;
  chatgptDeepResearchPlanAction?: string;
  chatgptDeepResearchStartMethod?: string | null;
  chatgptDeepResearchStartLabel?: string | null;
  chatgptDeepResearchModifyPlanLabel?: string | null;
  chatgptDeepResearchModifyPlanVisible?: boolean;
  chatgptDeepResearchReviewEvidence?: Record<string, unknown> | null;
  controllerPid?: number;
}

export type ResolvedBrowserConfig = Required<
  Omit<
    BrowserAutomationConfig,
      'chromeProfile' |
      'chromePath' |
      'chromeCookiePath' |
      'bootstrapCookiePath' |
      'remoteChrome' |
      'profileConflictAction' |
      'browserFamily' |
      'browserBuild' |
      'agentBrowserRdp' |
      'remoteViewDesktop'
  >
> & {
  browserFamily?: BrowserProfileFamily | null;
  browserBuild?: AgentBrowserBuild | null;
  agentBrowserRdp?: AgentBrowserRdpConfig | null;
  remoteViewDesktop?: RemoteViewDesktopConfig | null;
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  display?: string | null;
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  profileConflictAction?: 'fail' | 'terminate-existing' | 'attach-existing';
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  inlineCookies?: CookieParam[] | null;
  inlineCookiesSource?: string | null;
  cookieNames?: string[] | null;
  remoteChrome?: { host: string; port: number } | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  manualLoginWaitForSession?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
};
