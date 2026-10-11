import { CHATGPT_URL, DEFAULT_MODEL_STRATEGY, DEFAULT_MODEL_TARGET, GEMINI_URL, GROK_URL } from './constants.js';
import { normalizeBrowserModelStrategy } from './modelStrategy.js';
import type { BrowserAutomationConfig, ResolvedBrowserConfig } from './types.js';
import { resolveManagedProfileDir, resolveManagedProfileRoot } from './profileStore.js';
import { isTemporaryChatUrl, normalizeChatgptUrl } from './utils.js';
import { discoverDefaultBrowserProfile, resolveProfileDirectoryName, type WslChromePreference } from './service/profile.js';
import path from 'node:path';
import {
  inferWindowsLocalAppDataRoot,
  isWindowsPath,
  isWslEnvironment,
  toWslPath,
} from '../../packages/browser-service/src/platformPaths.js';
import { normalizeChatgptComposerMode } from './actions/chatgptComposerMode.js';

export const DEFAULT_BROWSER_CONFIG: ResolvedBrowserConfig = {
  tabConcurrencyMode: 'serialized',
  browserFamily: null,
  browserBuild: null,
  agentBrowserRdp: null,
  chromeProfile: null,
  chromePath: null,
  chromeCookiePath: null,
  bootstrapCookiePath: null,
  display: null,
  blockingProfileAction: 'restart-managed',
  managedProfileRoot: resolveManagedProfileRoot(),
  target: 'chatgpt',
  projectId: null,
  conversationId: null,
  geminiUrl: GEMINI_URL,
  grokUrl: null,
  url: CHATGPT_URL,
  chatgptUrl: CHATGPT_URL,
  timeoutMs: 7_200_000,
  debugPort: null,
  debugPortStrategy: 'fixed',
  debugPortRange: [45000, 45100],
  inputTimeoutMs: 60_000,
  cookieSync: false,
  cookieNames: null,
  cookieSyncWaitMs: 0,
  inlineCookies: null,
  inlineCookiesSource: null,
  headless: false,
  keepBrowser: false,
  hideWindow: false,
  desiredModel: DEFAULT_MODEL_TARGET,
  chatgptMode: 'chat',
  chatgptToolApproval: 'manual',
  workModel: null,
  modelStrategy: DEFAULT_MODEL_STRATEGY,
  composerTool: null,
  deepResearchPlanAction: 'start',
  debug: false,
  allowCookieErrors: false,
  remoteChrome: null,
  manualLogin: true,
  manualLoginProfileDir: null,
  manualLoginCookieSync: false,
  manualLoginWaitForSession: true,
  wslChromePreference: 'auto',
  serviceTabLimit: 3,
  blankTabLimit: 1,
  collapseDisposableWindows: true,
};

export function resolveBrowserConfig(
  config: BrowserAutomationConfig | undefined,
  options: { auracallProfileName?: string | null; browserProfileName?: string | null } = {},
): ResolvedBrowserConfig {
  const debugPortEnv = parseDebugPort(
    process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT,
  );
  const envAllowCookieErrors =
    (process.env.AURACALL_BROWSER_ALLOW_COOKIE_ERRORS ?? '').trim().toLowerCase() === 'true' ||
    (process.env.AURACALL_BROWSER_ALLOW_COOKIE_ERRORS ?? '').trim() === '1';
  const target = config?.target ?? DEFAULT_BROWSER_CONFIG.target;
  const rawUrl =
    target === 'grok'
      ? config?.grokUrl ?? config?.url ?? GROK_URL
      : target === 'gemini'
        ? config?.geminiUrl ?? config?.url ?? GEMINI_URL
        : config?.chatgptUrl ?? config?.url ?? DEFAULT_BROWSER_CONFIG.url;
  const normalizedUrl =
    target === 'grok'
      ? (rawUrl ?? GROK_URL)
      : target === 'gemini'
        ? normalizeGenericBrowserUrl(rawUrl ?? GEMINI_URL, GEMINI_URL)
        : normalizeChatgptUrl(rawUrl ?? DEFAULT_BROWSER_CONFIG.url, DEFAULT_BROWSER_CONFIG.url);
  const desiredModel = config?.desiredModel ?? DEFAULT_BROWSER_CONFIG.desiredModel ?? DEFAULT_MODEL_TARGET;
  const composerTool = normalizeComposerTool(config?.composerTool ?? DEFAULT_BROWSER_CONFIG.composerTool);
  const deepResearchPlanAction = normalizeDeepResearchPlanAction(
    config?.deepResearchPlanAction ?? DEFAULT_BROWSER_CONFIG.deepResearchPlanAction,
  );
  const modelStrategy =
    normalizeBrowserModelStrategy(config?.modelStrategy) ??
    DEFAULT_BROWSER_CONFIG.modelStrategy ??
    DEFAULT_MODEL_STRATEGY;
  const chatgptMode = normalizeChatgptComposerMode(config?.chatgptMode);
  const chatgptToolApproval = normalizeChatgptToolApprovalPolicy(config?.chatgptToolApproval);
  if (modelStrategy === 'select' && isTemporaryChatUrl(normalizedUrl) && /\bpro\b/i.test(desiredModel)) {
    throw new Error(
      'Temporary Chat mode does not expose Pro models in the ChatGPT model picker. ' +
        'Remove "temporary-chat=true" from your browser URL, or use a non-Pro model label (e.g. "Instant").',
    );
  }
  const manualLogin = config?.manualLogin ?? DEFAULT_BROWSER_CONFIG.manualLogin;
  const cookieSyncDefault = DEFAULT_BROWSER_CONFIG.cookieSync;
  const cookieSync = config?.cookieSync ?? cookieSyncDefault;
  const normalizedCookieNames = normalizeCookieNames(config?.cookieNames ?? DEFAULT_BROWSER_CONFIG.cookieNames);
  const normalizedInlineCookies = normalizeInlineCookies(config?.inlineCookies ?? DEFAULT_BROWSER_CONFIG.inlineCookies);
  const wslChromePreference = normalizeWslChromePreference(
    process.env.AURACALL_WSL_CHROME ?? config?.wslChromePreference,
  );
  const explicitProfileDir = process.env.AURACALL_BROWSER_PROFILE_DIR ?? config?.manualLoginProfileDir ?? null;
  const discoveredProfile = discoverDefaultBrowserProfile({
    preference: wslChromePreference,
    chromePathHint: config?.chromePath ?? null,
    cookiePathHint:
      process.env.AURACALL_BROWSER_BOOTSTRAP_COOKIE_PATH ??
      config?.bootstrapCookiePath ??
      config?.chromeCookiePath ??
      null,
    userDataDirHint: explicitProfileDir,
  });
  const preferredSource = resolvePreferredBrowserSource(wslChromePreference);
  const resolvedChromePath = resolvePreferredBrowserValue(
    config?.chromePath ?? null,
    discoveredProfile?.chromePath ?? null,
    preferredSource,
  );
  const resolvedCookiePath = resolvePreferredBrowserValue(
    config?.chromeCookiePath ?? null,
    discoveredProfile?.cookiePath ?? null,
    preferredSource,
  );
  const resolvedBootstrapCookiePath = resolveConfiguredBrowserValue(
    process.env.AURACALL_BROWSER_BOOTSTRAP_COOKIE_PATH ??
      config?.bootstrapCookiePath ??
      (cookieSync ? config?.chromeCookiePath ?? resolvedCookiePath : null) ??
      null,
  );
  const managedProfileRoot = resolveEffectiveManagedProfileRoot({
    configuredManagedProfileRoot: config?.managedProfileRoot ?? null,
    explicitProfileDir,
    resolvedChromePath,
    sourceCookiePath: resolvedBootstrapCookiePath ?? resolvedCookiePath,
  });
  const managedProfileName = options.browserProfileName ?? options.auracallProfileName ?? null;
  const resolvedProfileDir = normalizeManualLoginProfileDir(resolveManagedProfileDir({
    configuredDir: explicitProfileDir,
    managedProfileRoot,
    auracallProfileName: managedProfileName,
    target,
  }));
  const resolvedChromeProfile = resolveProfileDirectoryName(
    resolvedProfileDir,
    config?.chromeProfile ?? discoveredProfile?.profileName ?? DEFAULT_BROWSER_CONFIG.chromeProfile ?? 'Default',
  );
  const resolvedDisplay =
    resolveEffectiveDisplay({
      configuredDisplay: config?.display ?? null,
      envDisplay: process.env.AURACALL_BROWSER_DISPLAY ?? null,
      resolvedChromePath,
    });
  const debugPortRange = normalizeDebugPortRange(config?.debugPortRange);
  const serviceTabLimit = normalizeServiceTabLimit(config?.serviceTabLimit);
  const blankTabLimit = normalizeBlankTabLimit(config?.blankTabLimit);
  const debugPortStrategy = resolveDebugPortStrategy({
    explicitStrategy:
      (process.env.AURACALL_BROWSER_PORT_STRATEGY as 'fixed' | 'auto' | undefined) ??
      config?.debugPortStrategy ??
      undefined,
    explicitPort: debugPortEnv ?? config?.debugPort ?? null,
    resolvedChromePath,
  });
  const normalizedRemoteChrome = normalizeRemoteChrome(config?.remoteChrome ?? DEFAULT_BROWSER_CONFIG.remoteChrome);
  const mapProfileConflictAction = (
    value: BrowserAutomationConfig['profileConflictAction'] | undefined,
  ): BrowserAutomationConfig['blockingProfileAction'] | undefined => {
    if (!value) return undefined;
    if (value === 'terminate-existing') return 'restart';
    if (value === 'attach-existing') return 'fail';
    return value;
  };
  const normalizeBlockingProfileAction = (
    value: BrowserAutomationConfig['blockingProfileAction'] | undefined,
  ): ResolvedBrowserConfig['blockingProfileAction'] | undefined => {
    if (!value) return undefined;
    if (value === 'restart-auracall') return 'restart-managed';
    return value as ResolvedBrowserConfig['blockingProfileAction'];
  };
  const blockingProfileAction =
    normalizeBlockingProfileAction(config?.blockingProfileAction) ??
    normalizeBlockingProfileAction(mapProfileConflictAction(config?.profileConflictAction)) ??
    DEFAULT_BROWSER_CONFIG.blockingProfileAction;
  const agentBrowserRdpEnabled = config?.agentBrowserRdp?.enabled === true || Boolean(config?.remoteViewDesktop);
  return {
    ...DEFAULT_BROWSER_CONFIG,
    ...(config ?? {}),
    blockingProfileAction,
    managedProfileRoot,
    target,
    url: normalizedUrl,
    chatgptUrl:
      target === 'chatgpt'
        ? normalizedUrl
        : config?.chatgptUrl ?? DEFAULT_BROWSER_CONFIG.chatgptUrl,
    timeoutMs: config?.timeoutMs ?? DEFAULT_BROWSER_CONFIG.timeoutMs,
    debugPort: debugPortEnv ?? config?.debugPort ?? DEFAULT_BROWSER_CONFIG.debugPort,
    debugPortStrategy,
    debugPortRange,
    inputTimeoutMs: config?.inputTimeoutMs ?? DEFAULT_BROWSER_CONFIG.inputTimeoutMs,
    cookieSync,
    cookieNames: normalizedCookieNames,
    cookieSyncWaitMs: config?.cookieSyncWaitMs ?? DEFAULT_BROWSER_CONFIG.cookieSyncWaitMs,
    inlineCookies: normalizedInlineCookies,
    inlineCookiesSource: config?.inlineCookiesSource ?? DEFAULT_BROWSER_CONFIG.inlineCookiesSource,
    headless: agentBrowserRdpEnabled
      ? false
      : config?.headless ?? DEFAULT_BROWSER_CONFIG.headless,
    keepBrowser: agentBrowserRdpEnabled
      ? true
      : config?.keepBrowser ?? DEFAULT_BROWSER_CONFIG.keepBrowser,
    hideWindow: agentBrowserRdpEnabled
      ? false
      : config?.hideWindow ?? DEFAULT_BROWSER_CONFIG.hideWindow,
    desiredModel,
    chatgptMode,
    chatgptToolApproval,
    workModel: config?.workModel?.trim() || null,
    modelStrategy,
    composerTool,
    deepResearchPlanAction,
    browserFamily: config?.browserFamily ?? null,
    browserBuild: config?.browserBuild ?? null,
    agentBrowserRdp: config?.agentBrowserRdp ?? null,
    chromeProfile: resolvedChromeProfile,
    chromePath: resolvedChromePath,
    chromeCookiePath: resolvedCookiePath,
    bootstrapCookiePath: resolvedBootstrapCookiePath,
    display: resolvedDisplay,
    geminiUrl: target === 'gemini' ? normalizedUrl : config?.geminiUrl ?? DEFAULT_BROWSER_CONFIG.geminiUrl,
    grokUrl: config?.grokUrl ?? DEFAULT_BROWSER_CONFIG.grokUrl,
    debug: config?.debug ?? DEFAULT_BROWSER_CONFIG.debug,
    allowCookieErrors: config?.allowCookieErrors ?? envAllowCookieErrors ?? DEFAULT_BROWSER_CONFIG.allowCookieErrors,
    remoteChrome: normalizedRemoteChrome,
    thinkingTime: config?.thinkingTime,
    manualLogin,
    manualLoginProfileDir: manualLogin ? resolvedProfileDir : null,
    manualLoginCookieSync: config?.manualLoginCookieSync ?? DEFAULT_BROWSER_CONFIG.manualLoginCookieSync,
    manualLoginWaitForSession:
      config?.manualLoginWaitForSession ?? DEFAULT_BROWSER_CONFIG.manualLoginWaitForSession,
    wslChromePreference,
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows:
      config?.collapseDisposableWindows ??
      DEFAULT_BROWSER_CONFIG.collapseDisposableWindows,
  };
}

function normalizeChatgptToolApprovalPolicy(
  value: BrowserAutomationConfig['chatgptToolApproval'],
): ResolvedBrowserConfig['chatgptToolApproval'] {
  if (value === 'allow-once' || value === 'always-allow') return value;
  return 'manual';
}

function normalizeGenericBrowserUrl(value: string, fallback: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return fallback;
  }
}

function resolveDebugPortStrategy(options: {
  explicitStrategy?: 'fixed' | 'auto';
  explicitPort?: number | null;
  resolvedChromePath?: string | null;
}): 'fixed' | 'auto' {
  if (options.explicitStrategy) {
    return options.explicitStrategy;
  }
  if (options.explicitPort && Number.isFinite(options.explicitPort) && options.explicitPort > 0) {
    return 'fixed';
  }
  if (isWslEnvironment() && isWindowsHostedChromePath(options.resolvedChromePath)) {
    return 'auto';
  }
  return DEFAULT_BROWSER_CONFIG.debugPortStrategy ?? 'fixed';
}

export function resolveEffectiveManagedProfileRoot(options: {
  configuredManagedProfileRoot?: string | null;
  explicitProfileDir?: string | null;
  resolvedChromePath?: string | null;
  sourceCookiePath?: string | null;
}): string {
  const defaultRoot = resolveManagedProfileRoot(DEFAULT_BROWSER_CONFIG.managedProfileRoot);
  const configuredRoot = resolveManagedProfileRoot(
    options.configuredManagedProfileRoot ?? DEFAULT_BROWSER_CONFIG.managedProfileRoot,
  );
  if (options.explicitProfileDir?.trim()) {
    return configuredRoot;
  }
  if (!isWslEnvironment() || !isWindowsHostedChromePath(options.resolvedChromePath)) {
    return configuredRoot;
  }
  if (
    options.configuredManagedProfileRoot?.trim() &&
    path.resolve(configuredRoot) !== path.resolve(defaultRoot)
  ) {
    return configuredRoot;
  }
  const windowsRoot = inferWindowsManagedProfileRoot(options.sourceCookiePath ?? null);
  return windowsRoot ? resolveManagedProfileRoot(windowsRoot) : configuredRoot;
}

function inferWindowsManagedProfileRoot(cookiePath: string | null): string | null {
  const localAppDataRoot = inferWindowsLocalAppDataRoot(cookiePath);
  if (!localAppDataRoot) {
    return null;
  }
  return path.join(localAppDataRoot, 'AuraCall', 'browser-profiles');
}

function isWindowsHostedChromePath(chromePath?: string | null): boolean {
  return isWindowsPath(chromePath ?? null);
}

function _isLinuxHostedChromePath(chromePath?: string | null): boolean {
  const trimmed = chromePath?.trim();
  return Boolean(trimmed) && !isWindowsHostedChromePath(trimmed);
}

function resolveEffectiveDisplay(options: {
  configuredDisplay?: string | null;
  envDisplay?: string | null;
  resolvedChromePath?: string | null;
}): string | null {
  const configured = resolveConfiguredBrowserValue(options.configuredDisplay);
  if (configured) {
    return configured;
  }
  const envDisplay = resolveConfiguredBrowserValue(options.envDisplay);
  if (envDisplay) {
    return envDisplay;
  }
  if (isWslEnvironment() && !isWindowsHostedChromePath(options.resolvedChromePath)) {
    return ':0.0';
  }
  return DEFAULT_BROWSER_CONFIG.display;
}

function normalizeManualLoginProfileDir(value: string): string {
  if (!isWslEnvironment()) {
    return value;
  }
  return toWslPath(value);
}

function resolveConfiguredBrowserValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeDebugPortRange(
  value: [number, number] | null | undefined,
): [number, number] | null {
  if (!value) return null;
  const [start, end] = value;
  const startNum = Number(start);
  const endNum = Number(end);
  if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
    throw new Error('browser.debugPortRange must contain two numbers.');
  }
  const min = Math.min(startNum, endNum);
  const max = Math.max(startNum, endNum);
  if (min <= 0 || max > 65535) {
    throw new Error('browser.debugPortRange must be within 1-65535.');
  }
  if (min === max) {
    return [min, max];
  }
  return [min, max];
}

function normalizeServiceTabLimit(value: number | null | undefined): number {
  if (value === undefined || value === null) {
    return DEFAULT_BROWSER_CONFIG.serviceTabLimit ?? 3;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new Error('browser.serviceTabLimit must be a positive integer.');
  }
  return numeric;
}

function normalizeBlankTabLimit(value: number | null | undefined): number {
  if (value === undefined || value === null) {
    return DEFAULT_BROWSER_CONFIG.blankTabLimit ?? 1;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error('browser.blankTabLimit must be an integer greater than or equal to 0.');
  }
  return numeric;
}

function normalizeCookieNames(value: string[] | string | null | undefined): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => entry.trim()).filter(Boolean);
    return normalized.length ? normalized : null;
  }
  const names = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return names.length ? names : null;
}

function normalizeComposerTool(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeDeepResearchPlanAction(value: string | null | undefined): 'start' | 'edit' {
  return value === 'edit' ? 'edit' : 'start';
}

function normalizeInlineCookies(
  value: import('./types.js').CookieParam[] | string | null | undefined,
): import('./types.js').CookieParam[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseCookiePayload(trimmed) ?? parseCookiePayload(Buffer.from(trimmed, 'base64').toString('utf8'));
  return parsed ?? null;
}

function parseCookiePayload(raw: string): import('./types.js').CookieParam[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeRemoteChrome(
  value: import('./types.js').BrowserAutomationConfig['remoteChrome'],
): { host: string; port: number } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return parseRemoteChromeTarget(value);
  }
  return value;
}

function parseRemoteChromeTarget(raw: string): { host: string; port: number } | null {
  const target = raw.trim();
  if (!target) {
    return null;
  }
  const ipv6Match = target.match(/^\[(.+)]:(\d+)$/);
  let host: string | undefined;
  let portSegment: string | undefined;

  if (ipv6Match) {
    host = ipv6Match[1]?.trim();
    portSegment = ipv6Match[2]?.trim();
  } else {
    const lastColon = target.lastIndexOf(':');
    if (lastColon === -1) {
      return null;
    }
    host = target.slice(0, lastColon).trim();
    portSegment = target.slice(lastColon + 1).trim();
  }
  if (!host) return null;
  const port = Number.parseInt(portSegment ?? '', 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    return null;
  }
  return { host, port };
}

function normalizeWslChromePreference(input: string | null | undefined): WslChromePreference {
  const normalized = (input ?? '').trim().toLowerCase();
  if (normalized === 'windows' || normalized === 'wsl' || normalized === 'auto') {
    return normalized as WslChromePreference;
  }
  return 'auto';
}

function resolvePreferredBrowserSource(
  preference: WslChromePreference,
): 'wsl' | 'windows' | null {
  if (!isWslEnvironment()) {
    return null;
  }
  if (preference === 'wsl' || preference === 'windows') {
    return preference;
  }
  return null;
}

function resolvePreferredBrowserValue(
  configuredValue: string | null | undefined,
  discoveredValue: string | null | undefined,
  preferredSource: 'wsl' | 'windows' | null,
): string | null {
  if (!configuredValue) {
    return discoveredValue ?? null;
  }
  if (!discoveredValue || !preferredSource) {
    return configuredValue;
  }
  const configuredSource = detectBrowserPathSource(configuredValue);
  if (configuredSource === preferredSource || configuredSource === 'unknown') {
    return configuredValue;
  }
  return discoveredValue;
}

function detectBrowserPathSource(value: string): 'wsl' | 'windows' | 'unknown' {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'unknown';
  }
  if (isWindowsPath(trimmed)) {
    return 'windows';
  }
  if (trimmed.startsWith('/')) {
    return 'wsl';
  }
  if (trimmed.includes('/')) {
    return 'wsl';
  }
  return 'unknown';
}

function parseDebugPort(raw?: string | null): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return null;
  }
  return value;
}
