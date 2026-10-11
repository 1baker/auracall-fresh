#!/usr/bin/env ts-node

import '../src/browser/service/desktopControlRuntime.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runBrowserToolsCli, type BrowserToolsPortResolverOptions } from '../packages/browser-service/src/browserTools.js';
import { resolveConfig } from '../src/schema/resolver.js';
import { launchManualLoginSession } from '../src/browser/manualLogin.js';
import { resolveBrowserLaunchPlan } from '../src/browser/service/browserLaunchPlan.js';
import { resolveBrowserListTarget as resolveBrowserListTargetCore } from '../packages/browser-service/src/service/portResolution.js';
import { getAuracallHomeDir } from '../src/auracallHome.js';
import { isDevToolsResponsive } from '../packages/browser-service/src/processCheck.js';
import { DEFAULT_DEBUG_PORT_RANGE } from '../src/browser/portSelection.js';

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.cache', 'scraping');
const DEFAULT_CHROME_BIN = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome';

async function copyProfileIfRequested(baseDir: string, copyProfile: boolean): Promise<string | null> {
  if (!copyProfile) return null;
  await fs.mkdir(baseDir, { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(baseDir, 'browser-tools-'));
  const source = `${path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')}/`;
  execSync(`rsync -a --delete "${source}" "${userDataDir}/"`, { stdio: 'ignore' });
  return userDataDir;
}

async function resolvePortOrLaunch(options: BrowserToolsPortResolverOptions): Promise<number> {
  if (options.port) {
    return options.port;
  }
  const { resolved, browserTarget, launchProfile, managedProfileDir } = await resolveManagedBrowserToolsContext(options);
  const listTarget = await resolveBrowserListTargetCore({
    envPort: null,
    configuredPort: null,
    configuredPortStrategy: resolved.debugPortStrategy ?? null,
    profilePath: managedProfileDir,
    profileName: launchProfile.chromeProfile ?? resolved.chromeProfile ?? 'Default',
    registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'),
    resolveHost: () => '127.0.0.1',
  });
  if (listTarget?.port) {
    const host = listTarget.host ?? '127.0.0.1';
    const reachable = await isDevToolsResponsive({ host, port: listTarget.port, attempts: 2, timeoutMs: 1000 });
    if (reachable) {
      return listTarget.port;
    }
  }
  const baseDir =
    options.profileDir ??
    managedProfileDir;
  const copiedDir = await copyProfileIfRequested(baseDir, Boolean(options.copyProfile));
  const userDataDir = copiedDir ?? baseDir;
  const debugPortRange = resolved.debugPortRange
    ? [...resolved.debugPortRange] as [number, number]
    : DEFAULT_DEBUG_PORT_RANGE;
  const logger = (message: string) => console.log(message);
  const { chrome } = await launchManualLoginSession({
    chromePath: options.chromePath ?? launchProfile.chromePath ?? resolved.chromePath ?? DEFAULT_CHROME_BIN,
    profileName: launchProfile.chromeProfile ?? resolved.chromeProfile ?? 'Default',
    userDataDir,
    url: resolved.target === 'grok'
      ? resolved.grokUrl ?? 'https://grok.com'
      : resolved.target === 'gemini'
        ? resolved.geminiUrl ?? 'https://gemini.google.com/app'
        : resolved.chatgptUrl ?? 'https://chatgpt.com/',
    logger,
    debugPort: options.port,
    debugPortRange,
    detach: true,
  });
  if (!chrome.port) {
    throw new Error('Chrome launch did not return a DevTools port.');
  }
  return chrome.port;
}

async function resolveOperationProfile(options: BrowserToolsPortResolverOptions): Promise<{
  managedProfileDir: string;
  browserTarget: 'chatgpt' | 'gemini' | 'grok';
} | null> {
  if (options.port && !options.auracallProfile && !options.browserTarget) {
    return null;
  }
  const { managedProfileDir, browserTarget } = await resolveManagedBrowserToolsContext(options);
  return { managedProfileDir, browserTarget };
}

async function resolveManagedBrowserToolsContext(options: BrowserToolsPortResolverOptions): Promise<{
  resolved: ReturnType<typeof resolveBrowserLaunchPlan>['launchPolicy'];
  browserTarget: 'chatgpt' | 'gemini' | 'grok';
  launchProfile: ReturnType<typeof resolveBrowserLaunchPlan>['launchPolicy'];
  managedProfileDir: string;
}> {
  const resolvedConfig = await resolveConfig({
    profile: options.auracallProfile,
    browserTarget: options.browserTarget,
  });
  const browserTarget = (resolvedConfig.browser.target ?? options.browserTarget ?? 'chatgpt') as 'chatgpt' | 'gemini' | 'grok';
  const plan = resolveBrowserLaunchPlan({
    source: {
      kind: 'user-config',
      config: {
        ...resolvedConfig,
        browser: {
          ...(resolvedConfig.browser ?? {}),
          target: browserTarget,
        },
      },
    },
    intent: { provider: browserTarget },
  });
  return {
    resolved: plan.launchPolicy,
    browserTarget,
    launchProfile: plan.launchPolicy,
    managedProfileDir: plan.managedBrowserProfile.directory,
  };
}

await runBrowserToolsCli({
  resolvePortOrLaunch,
  operationLockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  resolveOperationProfile,
  defaultChromeBin: DEFAULT_CHROME_BIN,
  defaultProfileDir: DEFAULT_PROFILE_DIR,
});
