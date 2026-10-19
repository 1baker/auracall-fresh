import type { ResolvedUserConfig } from '../config.js';
import { resolveBrowserLoginOptionsFromUserConfig, type LoginTarget } from '../browser/login.js';
import type { ResolvedBrowserConfig } from '../browser/types.js';
import { getPreferredRuntimeProfile, getRuntimeProfileBrowserProfileId } from '../config/model.js';
import { resolveBrowserConfig } from '../browser/config.js';
import { resolveManagedProfileDirForUserConfig } from '../browser/profileStore.js';
import { CHATGPT_URL, GROK_URL } from '../browser/constants.js';

export interface BrowserLoginCommandOptions {
  browserChromePath?: string;
  browserChromeProfile?: string;
  browserCookiePath?: string;
  browserBootstrapCookiePath?: string;
  browserDisplay?: string;
  browserManualLoginProfileDir?: string;
  browserWslChrome?: 'auto' | 'wsl' | 'windows';
  chatgptUrl?: string;
  geminiUrl?: string;
  grokUrl?: string;
}

export interface BrowserLoginLaunchOptions {
  browserConfig: Pick<ResolvedBrowserConfig, "remoteViewDesktop">;
  display?: string | null;
  chromePath: string;
  chromeProfile: string;
  manualLoginProfileDir: string;
  cookiePath?: string;
  bootstrapCookiePath?: string;
  chatgptUrl: string;
  geminiUrl: string;
  grokUrl: string;
}

export function resolveBrowserLoginLaunchOptions(
  commandOptions: BrowserLoginCommandOptions,
  userConfig: ResolvedUserConfig,
  target: LoginTarget,
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
  const planned = resolveBrowserLoginOptionsFromUserConfig({ ...userConfig, browser: {
    ...userConfig.browser,
    chromePath, chromeProfile: resolvedBrowser.chromeProfile ?? undefined,
    display: resolvedBrowser.display ?? undefined, manualLoginProfileDir,
    chromeCookiePath: resolvedBrowser.chromeCookiePath ?? undefined,
    bootstrapCookiePath: resolvedBrowser.bootstrapCookiePath ?? undefined,
  } }, { target });
  return {
    ...planned,
    browserConfig: planned.browserConfig ?? {},
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
