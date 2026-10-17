import type { BrowserLogger, DebugPortStrategy, ResolvedBrowserConfig } from './types.js';
import { DEFAULT_DEBUG_PORT, DEFAULT_DEBUG_PORT_RANGE, pickAvailableDebugPort } from './portSelection.js';
import { hideChromeWindow, launchChrome, openOrReuseChromeTarget, wasChromeLaunchedByAuracall } from './chromeLifecycle.js';
import { writeChromePid, writeDevToolsActivePort } from './profileState.js';
import { isDevToolsResponsive } from './processCheck.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  profileName: string;
  userDataDir: string;
  url: string;
  compatibleHosts?: string[];
  logger: BrowserLogger;
  baseConfig: ResolvedBrowserConfig;
  launch?: typeof launchChrome;
  hideWindow?: boolean;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
  detach?: boolean;
  registryPath?: string;
  abortSignal?: AbortSignal;
  onStage?: (stage: string) => void;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchChrome>>; port: number }> {
  options.onStage?.('browserDebugPortResolution');
  const effectiveDebugPortStrategy = options.debugPortStrategy ?? options.baseConfig.debugPortStrategy ?? 'fixed';
  const effectiveDebugPortRange = options.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE;
  const port = effectiveDebugPortStrategy === 'fixed'
    ? options.debugPort ?? await pickAvailableDebugPort(
        deriveStablePreferredDebugPort({
          userDataDir: options.userDataDir,
          profileName: options.profileName,
          range: effectiveDebugPortRange,
        }),
        options.logger,
        effectiveDebugPortRange,
      )
    : null;
  const config: ResolvedBrowserConfig = {
    ...options.baseConfig,
    chromePath: options.chromePath,
    chromeProfile: options.profileName,
    manualLogin: true,
    manualLoginProfileDir: options.userDataDir,
    debugPort: port,
    debugPortStrategy: effectiveDebugPortStrategy,
    headless: false,
    hideWindow: options.hideWindow ?? options.baseConfig.hideWindow ?? false,
    keepBrowser: true,
    serviceTabLimit: options.serviceTabLimit ?? options.baseConfig.serviceTabLimit,
    blankTabLimit: options.blankTabLimit ?? options.baseConfig.blankTabLimit,
    collapseDisposableWindows: options.collapseDisposableWindows ?? options.baseConfig.collapseDisposableWindows,
  };
  options.onStage?.('browserChromeLaunch');
  const chrome = await (options.launch ?? launchChrome)(config, options.userDataDir, options.logger, {
    registryPath: options.registryPath,
    abortSignal: options.abortSignal,
    onStage: options.onStage,
    suppressStartupWindow: options.url === 'about:blank',
  });
  if (options.detach) {
    chrome.process?.unref();
  }

  await writeDevToolsActivePort(options.userDataDir, chrome.port);
  if (chrome.pid) {
    await writeChromePid(options.userDataDir, chrome.pid);
  }

  const host = chrome.host ?? '127.0.0.1';
  options.onStage?.('browserDevToolsReadiness');
  const ready = await isDevToolsResponsive({ host, port: chrome.port, attempts: 5, timeoutMs: 1000 });
  if (!ready) {
    throw new Error(`Chrome DevTools did not respond on ${host}:${chrome.port}.`);
  }
  if (config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
    await hideChromeWindow(chrome, options.logger);
  }

  // Blank startup is endpoint-only. Suppress Chromium's startup window so
  // persisted session tabs cannot restore before the caller establishes
  // custody of its own target.
  if (options.url !== 'about:blank') {
    options.onStage?.('browserLoginTabOpening');
    await openLoginUrl(host, chrome.port, options.url, {
      compatibleHosts: options.compatibleHosts,
      serviceTabLimit: config.serviceTabLimit,
      blankTabLimit: config.blankTabLimit,
      collapseDisposableWindows: config.collapseDisposableWindows,
      suppressFocus: config.hideWindow,
    });
  }
  if (config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
    await hideChromeWindow(chrome, options.logger);
  }
  return { chrome, port: chrome.port };
}

function deriveStablePreferredDebugPort(input: {
  userDataDir: string;
  profileName: string;
  range: [number, number] | null;
}): number {
  const range = input.range ?? DEFAULT_DEBUG_PORT_RANGE;
  const [start, end] = range;
  const span = Math.max(1, end - start + 1);
  const seed = `${input.userDataDir}::${input.profileName.trim().toLowerCase()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return start + (hash % span);
}

export const __test__ = {
  deriveStablePreferredDebugPort,
};

export async function openLoginUrl(
  host: string,
  port: number,
  url: string,
  options: {
    compatibleHosts?: string[];
    serviceTabLimit?: number | null;
    blankTabLimit?: number | null;
    collapseDisposableWindows?: boolean;
    suppressFocus?: boolean;
  } = {},
): Promise<void> {
  try {
    await openOrReuseChromeTarget(port, url, {
      host,
      reusePolicy: 'same-origin',
      compatibleHosts: options.compatibleHosts,
      matchingTabLimit: options.serviceTabLimit ?? undefined,
      blankTabLimit: options.blankTabLimit ?? undefined,
      collapseDisposableWindows: options.collapseDisposableWindows,
      suppressFocus: options.suppressFocus,
    });
  } catch {
    // Best effort: login can proceed even if we can't open a new tab.
  }
}
