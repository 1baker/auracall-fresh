import { beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';
import { launchChrome } from '../../src/browser/chromeLifecycle.js';
import { BrowserService } from '../../src/browser/service/browserService.js';
import { ConfigSchema } from '../../src/schema/types.js';
const launches = vi.hoisted(() => ({
  remote: vi.fn(async () => ({ chrome: { host: '127.0.0.1', port: 45123, pid: 12345 }, port: 45123 })),
  local: vi.fn(async () => ({ port: 45124, pid: 12346 })),
  discover: vi.fn(async () => ({ host: '127.0.0.1', port: 45123 })),
}));
vi.mock('../../src/browser/service/agentBrowserRdpLauncher.js', () => ({ launchAgentBrowserRdpSession: launches.remote, findConfiguredDesktopBrowser: launches.discover }));
vi.mock('../../packages/browser-service/src/chromeLifecycle.js', async (original) => ({ ...await original<object>(), launchChrome: launches.local }));
beforeEach(() => vi.clearAllMocks());

test('the normal prompt Chrome launcher dispatches configured desktop launches through remote-view', async () => {
  const config = { ...DEFAULT_BROWSER_CONFIG, target: 'grok' as const, agentBrowserRdp: { enabled: true, runtimeProfile: 'writing', routePoolEntryId: 'pool-writing', desktopName: 'writing' } };
  const chrome = await launchChrome(config, '/tmp/managed-grok', () => {});
  expect(chrome.port).toBe(45123);
  expect(launches.local).not.toHaveBeenCalled();
  expect(launches.remote).toHaveBeenCalledWith(expect.objectContaining({ userDataDir: '/tmp/managed-grok', serviceTarget: 'grok', config }));
});

test('explicit root display dispatch preserves the ordinary launcher', async () => {
  await launchChrome({ ...DEFAULT_BROWSER_CONFIG, agentBrowserRdp: { enabled: false, runtimeProfile: 'root' } }, '/tmp/root-browser', () => {});
  expect(launches.remote).not.toHaveBeenCalled();
  expect(launches.local).toHaveBeenCalledTimes(1);
});

test('service attachment verifies desktop ownership before accepting an existing endpoint', async () => {
  const service = BrowserService.fromConfig(ConfigSchema.parse({
    remoteView: { defaultDesktop: 'research', desktops: { research: { runtimeProfile: 'research', routePoolEntryId: 'research-route' } } },
    browser: { browserFamily: 'chrome', browserBuild: 'stock_chrome', chromePath: '/usr/bin/google-chrome' },
  }));
  const result = await service.resolveDevToolsTarget({ host: '127.0.0.1', port: 45123 });
  expect(result.port).toBe(45123);
  expect(launches.discover).toHaveBeenCalledTimes(1);
  expect(launches.remote).not.toHaveBeenCalled();
});

test('native desktop launch dispatch uses the native placement path rather than root or legacy RDP', async () => {
  const native = await import('../../src/browser/service/nativeDesktopRuntime.js');
  const stub = vi.spyOn(native, 'launchNativeDesktopBrowser').mockResolvedValue({ port: 45125, pid: 12347, kill: async () => {} });
  try {
    const remoteViewDesktop = { desktopName: 'research', poolName: 'main', application: 'auracall', origin: 'http://127.0.0.1:19096', publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' };
    const chrome = await launchChrome({ ...DEFAULT_BROWSER_CONFIG, remoteViewDesktop }, '/tmp/native-dispatch-browser', () => {});
    expect(chrome.port).toBe(45125); expect(stub).toHaveBeenCalledTimes(1);
    expect(launches.local).not.toHaveBeenCalled(); expect(launches.remote).not.toHaveBeenCalled();
  } finally { stub.mockRestore(); }
});
