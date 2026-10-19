import { expect, test } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';
import { resolveBrowserLoginLaunchOptions } from '../../src/cli/browserLoginLaunch.js';

test('CLI login retains native desktop custody for subsequent utility operations', () => {
  const config = {
    auracallProfile: 'test',
    browser: { chromePath: process.execPath, target: 'chatgpt', desktop: 'research' },
    remoteView: {
      application: { origin: 'http://127.0.0.1:9999', publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test', name: 'auracall' },
      desktops: { research: { poolName: 'main' } },
    },
  } as unknown as ResolvedUserConfig;
  const options = resolveBrowserLoginLaunchOptions({}, config, 'chatgpt');
  expect(options).toMatchObject({ browserConfig: { remoteViewDesktop: { desktopName: 'research', poolName: 'main', application: 'auracall' } } });
});

test('CLI login keeps explicit executable, source and managed-directory overrides', () => {
  const options = resolveBrowserLoginLaunchOptions({
    browserChromePath: process.execPath,
    browserChromeProfile: 'Profile 2',
    browserManualLoginProfileDir: '/tmp/aura-explicit-managed',
    browserDisplay: ':89',
    chatgptUrl: 'https://chatgpt.com/g/example',
  }, { auracallProfile: 'test', browser: { target: 'chatgpt' } } as ResolvedUserConfig, 'chatgpt');
  expect(options).toMatchObject({ chromePath: process.execPath, chromeProfile: 'Profile 2', manualLoginProfileDir: '/tmp/aura-explicit-managed', display: ':89', chatgptUrl: 'https://chatgpt.com/g/example' });
});
