import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedUserConfig } from '../config.js';
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from './constants.js';
import { resolveBundledServiceCookieOrigins } from '../services/registry.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  bootstrapManagedProfile,
  resolveManagedProfileCookieExportPath,
  type ManagedProfileSeedPolicy,
} from './profileStore.js';
import { resolveBrowserLaunchPlan } from './service/browserLaunchPlan.js';
import { registerInstance } from './service/stateRegistry.js';
import { findChromePidUsingUserDataDir, findWindowsChromePidUsingTasklist } from './processCheck.js';
import { launchManualLoginSession } from './manualLogin.js';
import { resolveCompatibleHostsForTarget } from './urlFamilies.js';
import {
  runBrowserLogin as runBrowserLoginCore,
  type BrowserLoginOptions as BrowserLoginCoreOptions,
} from '../../packages/browser-service/src/login.js';
import { createFileBackedBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import type { ResolvedBrowserConfig } from './types.js';
import type { DebugPortStrategy } from '../../packages/browser-service/src/types.js';

export type LoginTarget = 'chatgpt' | 'gemini' | 'grok';

const GEMINI_SIGNED_OUT_PROBE_EXPRESSION = `(() => {
  const host = String(globalThis.location?.hostname ?? '').toLowerCase();
  if (host === 'accounts.google.com') return true;
  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = globalThis.getComputedStyle?.(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  return Array.from(document.querySelectorAll('a,button,[role="button"]')).some((el) => {
    if (!isVisible(el)) return false;
    const label = normalize(\`\${el.getAttribute?.('aria-label') ?? ''} \${el.textContent ?? ''}\`);
    if (!/(^|\\b)(sign in|log in|login)(\\b|$)/.test(label)) return false;
    const href = el instanceof HTMLAnchorElement ? normalize(el.getAttribute('href') ?? '') : '';
    return host === 'gemini.google.com' || href.includes('accounts.google.com');
  });
})()`;

const GEMINI_SIGNED_OUT_CLICK_EXPRESSION = `(() => {
  const host = String(globalThis.location?.hostname ?? '').toLowerCase();
  if (host !== 'gemini.google.com') return false;
  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = globalThis.getComputedStyle?.(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const candidate = Array.from(document.querySelectorAll('a,button,[role="button"]')).find((el) => {
    if (!isVisible(el)) return false;
    const label = normalize(\`\${el.getAttribute?.('aria-label') ?? ''} \${el.textContent ?? ''}\`);
    if (!/(^|\\b)(sign in|log in|login)(\\b|$)/.test(label)) return false;
    const href = el instanceof HTMLAnchorElement ? normalize(el.getAttribute('href') ?? '') : '';
    return href.includes('accounts.google.com') || label.includes('sign in');
  });
  if (!(candidate instanceof HTMLElement)) return false;
  candidate.click();
  return true;
})()`;

export interface BrowserLoginOptions {
  target: LoginTarget;
  browserConfig?: Pick<ResolvedBrowserConfig, "remoteViewDesktop">;
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  display?: string | null;
  cookiePath?: string;
  bootstrapCookiePath?: string;
  chatgptUrl?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  exportCookies?: boolean;
  managedProfileSeedPolicy?: ManagedProfileSeedPolicy;
  debugPortStrategy?: DebugPortStrategy | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export function resolveBrowserLoginOptionsFromUserConfig(
  userConfig: Pick<ResolvedUserConfig, 'auracallProfile' | 'browser'>,
  options: {
    target?: LoginTarget;
    exportCookies?: boolean;
    managedProfileSeedPolicy?: ManagedProfileSeedPolicy;
  } = {},
): BrowserLoginOptions {
  const target = options.target ?? (userConfig.browser?.target as LoginTarget | undefined) ?? 'chatgpt';
  const plan = resolveBrowserLaunchPlan({
    source: { kind: 'user-config', config: userConfig as ResolvedUserConfig },
    intent: { provider: target },
  });
  const resolved = plan.launchPolicy;

  if (!resolved.chromePath) {
    throw new Error(`No browser chromePath resolved for ${target} login.`);
  }

  return {
    target,
    browserConfig: resolved,
    chromePath: resolved.chromePath,
    chromeProfile: plan.managedBrowserProfile.configuredProfileName,
    manualLoginProfileDir: plan.managedBrowserProfile.directory,
    display: resolved.display,
    cookiePath: resolved.chromeCookiePath ?? undefined,
    bootstrapCookiePath: plan.sourceBrowserProfile.bootstrapCookiePath ?? undefined,
    chatgptUrl: resolved.chatgptUrl,
    geminiUrl: resolved.geminiUrl,
    grokUrl: resolved.grokUrl,
    exportCookies: options.exportCookies,
    managedProfileSeedPolicy: options.managedProfileSeedPolicy,
    debugPortStrategy: resolved.debugPortStrategy ?? null,
    serviceTabLimit: resolved.serviceTabLimit ?? null,
    blankTabLimit: resolved.blankTabLimit ?? null,
    collapseDisposableWindows: resolved.collapseDisposableWindows,
  };
}

export async function runBrowserLogin(options: BrowserLoginOptions): Promise<void> {
  const {
    target,
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    display,
    cookiePath,
    bootstrapCookiePath,
    chatgptUrl,
    geminiUrl,
    grokUrl,
    exportCookies,
    managedProfileSeedPolicy,
    debugPortStrategy,
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
  } = options;
  if (exportCookies && target !== 'gemini') {
    throw new Error('Cookie export currently supports Gemini login only.');
  }
  const resolvedUrl =
    target === 'gemini'
      ? geminiUrl ?? GEMINI_URL
      : target === 'grok'
        ? grokUrl ?? GROK_URL
        : chatgptUrl ?? CHATGPT_URL;
  const compatibleHosts = resolveCompatibleHostsForTarget(target);
  const bootstrapResult = await bootstrapManagedProfile({
    managedProfileDir: manualLoginProfileDir,
    managedProfileName: chromeProfile,
    sourceCookiePath: bootstrapCookiePath ?? cookiePath ?? null,
    seedPolicy: managedProfileSeedPolicy ?? 'bootstrap-only',
    logger: (message) => console.log(`[login] ${message}`),
  });
  if (bootstrapResult.cloned) {
    console.log(
      `[login] Seeded managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}).`,
    );
  } else if (bootstrapResult.reseeded) {
    console.log(
      `[login] Refreshed managed browser profile from source browser profile ${bootstrapResult.sourceUserDataDir} (${bootstrapResult.sourceProfileName}).`,
    );
  } else if (bootstrapResult.skippedReason === 'managed-profile-active') {
    console.log(
      `[login] Managed browser profile is already active; skipping source-browser-profile refresh and reusing ${manualLoginProfileDir}.`,
    );
  }
  const coreOptions: BrowserLoginCoreOptions = {
    chromePath,
    chromeProfile,
    manualLoginProfileDir,
    display,
    cookiePath,
    loginUrl: resolvedUrl,
    compatibleHosts,
    loginLabel: target,
    exportCookies,
    preferCookieProfile: false,
    cookieExport: exportCookies
      ? {
          urls: resolveBundledServiceCookieOrigins('gemini', [
            'https://gemini.google.com',
            'https://accounts.google.com',
            'https://www.google.com',
          ]),
          requiredCookies: ['__Secure-1PSID', '__Secure-1PSIDTS'],
          signedOutProbe: {
            expression: GEMINI_SIGNED_OUT_PROBE_EXPRESSION,
            errorMessage:
              'Gemini login required; the opened Gemini page still shows a visible Sign in state. Finish signing in to gemini.google.com in the opened browser, then retry.',
          },
          signedOutRecovery: {
            expression: GEMINI_SIGNED_OUT_CLICK_EXPRESSION,
            attemptLimit: 1,
            graceMs: 20_000,
          },
        }
      : undefined,
    onRegisterInstance: async ({ userDataDir, profileName, port, host }) => {
      await registerLoginInstance(userDataDir, profileName, port, undefined, host);
    },
    launchManualLoginSession: async ({
      chromePath,
      profileName,
      userDataDir,
      url,
      compatibleHosts,
      display,
      hideWindow,
      debugPort,
      debugPortStrategy,
      serviceTabLimit,
      blankTabLimit,
      collapseDisposableWindows,
    }) => {
      return launchManualLoginSession({
        browserConfig: options.browserConfig,
        chromePath,
        profileName,
        userDataDir,
        url,
        compatibleHosts,
        display,
        hideWindow,
        debugPort,
        debugPortStrategy,
        serviceTabLimit,
        blankTabLimit,
        collapseDisposableWindows,
        logger: () => undefined,
      });
    },
    debugPortStrategy: debugPortStrategy ?? 'auto',
    serviceTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
    operationDispatcher: createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
    }),
    operationOwnerCommand: `login:${target}`,
    onCookiesExported: async (cookies) => {
      const auracallHome = getAuracallHomeDir();
      const scopedCookieOutput = resolveManagedProfileCookieExportPath(manualLoginProfileDir);
      const legacyCookieOutput = path.join(auracallHome, 'cookies.json');
      await fs.mkdir(path.dirname(scopedCookieOutput), { recursive: true });
      await fs.mkdir(auracallHome, { recursive: true });
      const serialized = JSON.stringify(cookies, null, 2);
      await fs.writeFile(scopedCookieOutput, serialized, 'utf8');
      await fs.writeFile(legacyCookieOutput, serialized, 'utf8');
      console.log(`Saved Gemini cookies to ${scopedCookieOutput}`);
      console.log(`[login] Updated compatibility cookie export at ${legacyCookieOutput}.`);
    },
  };
  await runBrowserLoginCore(coreOptions);
  return;
}

async function registerLoginInstance(
  userDataDir: string,
  profileName: string,
  port: number | null | undefined,
  pid?: number | null,
  host = '127.0.0.1',
): Promise<void> {
  const resolvedPort = port ?? undefined;
  if (!resolvedPort) return;
  let resolvedPid = pid ?? undefined;
  if (!resolvedPid) {
    resolvedPid = await findChromePidUsingUserDataDir(userDataDir) ?? undefined;
  }
  if (!resolvedPid && host !== '127.0.0.1') {
    resolvedPid = await findWindowsChromePidUsingTasklist() ?? undefined;
  }
  if (!resolvedPid) return;
  await registerInstance({
    pid: resolvedPid,
    port: resolvedPort,
    host,
    profilePath: userDataDir,
    profileName,
    type: 'chrome',
    launchedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });
}

// launchLoginChrome helper removed; use launchManualLoginSession directly.
