import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveBrowserLoginOptionsFromUserConfig } from '../../src/browser/login.js';

describe('resolveBrowserLoginOptionsFromUserConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('derives login prep from the resolved launch profile', () => {
    const options = resolveBrowserLoginOptionsFromUserConfig(
      {
        auracallProfile: 'windows-chrome-test',
        browser: {
          target: 'grok',
          chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
          chromeProfile: 'Default',
          chromeCookiePath:
            '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
          bootstrapCookiePath:
            '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
          managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
          debugPortStrategy: 'auto',
          serviceTabLimit: 5,
          blankTabLimit: 0,
          collapseDisposableWindows: false,
        } as never,
      },
      { target: 'grok', managedProfileSeedPolicy: 'reseed-if-source-newer' },
    );

    expect(options.browserConfig).toMatchObject({ chromePath: options.chromePath });
    expect(options).toMatchObject({
      target: 'grok',
      chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      chromeProfile: 'Default',
      manualLoginProfileDir:
        '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
      cookiePath:
        '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
      bootstrapCookiePath:
        '/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies',
      debugPortStrategy: 'auto',
      serviceTabLimit: 5,
      blankTabLimit: 0,
      collapseDisposableWindows: false,
      managedProfileSeedPolicy: 'reseed-if-source-newer',
    });
  });

  test('carries the resolved WSL display into login options', () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu');

    const options = resolveBrowserLoginOptionsFromUserConfig(
      {
        auracallProfile: 'wsl-chrome-2',
        browser: {
          target: 'chatgpt',
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Profile 1',
          chromeCookiePath: '/home/test/.config/google-chrome/Profile 1/Network/Cookies',
          managedProfileRoot: '/home/test/.auracall/browser-profiles',
        } as never,
      },
      { target: 'chatgpt' },
    );

    expect(options).toMatchObject({
      target: 'chatgpt',
      chromePath: '/usr/bin/google-chrome',
      manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      display: ':0.0',
      managedProfileSeedPolicy: undefined,
    });
  });
});
