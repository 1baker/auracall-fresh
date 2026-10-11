import { expect, test } from 'vitest';
import { ConfigSchema } from '../../src/schema/types.js';
import { resolveBrowserLaunchPlan } from '../../src/browser/service/browserLaunchPlan.js';

test('native desktop selection uses an AuraCall application pool with global default, per-browser override and explicit root', () => {
  const config = ConfigSchema.parse({
    remoteView: { application: { origin: 'http://127.0.0.1:19096', publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test', name: 'auracall' },
      defaultDesktop: 'research', desktops: { research: { poolName: 'main' }, writing: { poolName: 'main' } } },
    browser: { managedProfileRoot: '/tmp/native-desktop', target: 'chatgpt' },
    browserProfiles: { primary: { browserFamily: 'chrome', browserBuild: 'stock_chrome', chromePath: '/usr/bin/google-chrome' },
      secondary: { browserFamily: 'chrome', browserBuild: 'stock_chrome', chromePath: '/usr/bin/google-chrome', desktop: 'writing' } },
    runtimeProfiles: { primary: { browserProfile: 'primary' }, secondary: { browserProfile: 'secondary' } }, auracallProfile: 'primary',
  });
  const primary = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: {} });
  const secondary = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: { runtimeProfileId: 'secondary' } });
  expect(primary.launchPolicy.remoteViewDesktop).toMatchObject({ desktopName: 'research', poolName: 'main', application: 'auracall' });
  expect(secondary.launchPolicy.remoteViewDesktop).toMatchObject({ desktopName: 'writing', poolName: 'main' });
  expect(primary.launchPolicy).toMatchObject({ headless: false, hideWindow: false, keepBrowser: true });
  const browser = config.browserProfiles?.primary;
  if (!browser) throw new Error('missing fixture browser profile');
  browser.desktop = 'root';
  const root = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: {} });
  expect(root.launchPolicy.remoteViewDesktop).toBeFalsy();
  expect(root.launchPolicy.agentBrowserRdp?.enabled).toBe(false);
});

test('native display configuration rejects nonlocal control and credential-bearing presentation before launch', () => {
  for (const application of [
    { origin: 'https://127.0.0.1', publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' },
    { origin: 'http://127.0.0.1:19096', publicOrigin: 'https://user:secret@desktop.example.test', appOrigin: 'https://aura.example.test' },
    { origin: 'http://127.0.0.1:19096', publicOrigin: 'https://desktop.example.test', appOrigin: 'http://aura.example.test' },
  ]) expect(() => ConfigSchema.parse({ remoteView: { application, desktops: { research: { poolName: 'main' } } } })).toThrow();
});
