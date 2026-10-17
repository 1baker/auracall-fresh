import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { DEFAULT_BROWSER_CONFIG } from './config.js';
import { launchManualLoginSession as launchManualLoginSessionCore } from '../../packages/browser-service/src/manualLogin.js';
import type { BrowserLogger, DebugPortStrategy, ResolvedBrowserConfig } from './types.js';
import { launchNativeDesktopBrowser } from './service/nativeDesktopRuntime.js';

export async function launchManualLoginSession(options: {
  chromePath: string;
  browserConfig?: Pick<ResolvedBrowserConfig, "remoteViewDesktop">;
  profileName: string;
  userDataDir: string;
  url: string;
  compatibleHosts?: string[];
  display?: string | null;
  logger: BrowserLogger;
  hideWindow?: boolean;
  debugPort?: number;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
  detach?: boolean;
  abortSignal?: AbortSignal;
  onStage?: (stage: string) => void;
}): Promise<{ chrome: Awaited<ReturnType<typeof launchManualLoginSessionCore>>['chrome']; port: number }> {
  const browserConfig = options.browserConfig;
  return launchManualLoginSessionCore({
    ...options,
    hideWindow: browserConfig?.remoteViewDesktop ? false : options.hideWindow,
    launch: browserConfig?.remoteViewDesktop
      ? async (config, userDataDir, logger, launchOptions) => {
          const chrome = await launchNativeDesktopBrowser({
            config: { ...browserConfig, ...config }, userDataDir, logger,
            abortSignal: launchOptions?.abortSignal,
          });
          // Native handles preserve the same PID/endpoint/kill contract; no child process is exposed.
          return { ...chrome, process: undefined, remoteDebuggingPipes: null } as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof launchManualLoginSessionCore>[0]['launch']>>>;
        }
      : undefined,
    baseConfig: {
      ...DEFAULT_BROWSER_CONFIG,
      ...options.browserConfig,
      hideWindow: options.hideWindow ?? DEFAULT_BROWSER_CONFIG.hideWindow,
      display: options.display ?? DEFAULT_BROWSER_CONFIG.display,
      serviceTabLimit: options.serviceTabLimit ?? DEFAULT_BROWSER_CONFIG.serviceTabLimit,
      blankTabLimit: options.blankTabLimit ?? DEFAULT_BROWSER_CONFIG.blankTabLimit,
      collapseDisposableWindows:
        options.collapseDisposableWindows ?? DEFAULT_BROWSER_CONFIG.collapseDisposableWindows,
    },
    registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'),
  });
}
