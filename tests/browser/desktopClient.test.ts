import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { DesktopBindingStore, listDesktopViews } from '../../src/browser/service/desktopClient.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

test('the client shows two configured desktops and only browsers with retained AuraCall launch ownership', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-desktops-'));
  directories.push(directory);
  const store = new DesktopBindingStore(directory);
  await store.record({ desktopName: 'research', managedProfileDir: '/tmp/research', browserId: 'owned-browser', session: 'owned-session', routePoolEntryId: 'pool-research', routeId: 'route-research', displayAllocationId: 'display-research', handoffUrl: 'https://browser.example.test/remote-view/owned-handoff' });
  const runner = async () => ({ stderr: '', stdout: JSON.stringify({ success: true, data: { serviceStateProjection: { complete: true }, service_state: {
    routePool: {
      research: { id: 'pool-research', routeId: 'route-research', provider: 'rdp_gateway', state: 'checked_out', target: { displayAllocationId: 'display-research' } },
      writing: { id: 'pool-writing', routeId: 'route-writing', provider: 'rdp_gateway', state: 'available', target: { displayAllocationId: 'display-writing' } },
    }, browsers: {
      owned: { id: 'owned-browser', activeSessionIds: ['owned-session'], health: 'ready', displayAllocationId: 'display-research', viewStreams: [{ provider: 'rdp_gateway', routeId: 'route-research', displayAllocationId: 'display-research' }] },
      unrelated: { id: 'unrelated-browser', activeSessionIds: ['unrelated-session'], health: 'ready', displayAllocationId: 'display-research' },
    },
  } } }) });
  const views = await listDesktopViews({ remoteView: { defaultDesktop: 'research', rootDesktopUrl: 'https://browser.example.test/root', desktops: { research: { runtimeProfile: 'research', routePoolEntryId: 'pool-research' }, writing: { runtimeProfile: 'writing', routePoolEntryId: 'pool-writing' } } }, store, runner });
  expect(views.desktops).toEqual([
    expect.objectContaining({ name: 'research', state: 'ready', browsers: [expect.objectContaining({ browserId: 'owned-browser' })] }),
    expect.objectContaining({ name: 'writing', state: 'empty', browsers: [] }),
  ]);
  expect(JSON.stringify(views)).not.toContain('unrelated-browser');
  expect(views.rootDesktopUrl).toBe('https://browser.example.test/root');
});

test('passive frames use the retained browser identity and reject a returned frame on another display', async () => {
  const { captureDesktopView } = await import('../../src/browser/service/desktopClient.js');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-desktop-frame-'));
  directories.push(directory);
  const store = new DesktopBindingStore(directory);
  await store.record({ desktopName: 'research', managedProfileDir: '/tmp/research', browserId: 'owned-browser', session: 'owned-session', routePoolEntryId: 'pool-research', routeId: 'route-research', displayAllocationId: 'display-research', handoffUrl: 'https://browser.example.test/remote-view/owned-handoff' });
  const remoteView = { desktops: { research: { runtimeProfile: 'research', routePoolEntryId: 'pool-research' } } };
  const commands: string[][] = [];
  let displayAllocationId = 'display-research';
  const runner = async (_command: string, args: string[]) => {
    commands.push(args);
    const data = args.includes('status') ? { serviceStateProjection: { complete: true }, service_state: {
      routePool: { research: { id: 'pool-research', provider: 'rdp_gateway', state: 'checked_out', routeId: 'route-research', target: { displayAllocationId: 'display-research' } } },
      browsers: { owned: { id: 'owned-browser', health: 'ready', activeSessionIds: ['owned-session'], displayAllocationId: 'display-research', viewStreams: [{ provider: 'rdp_gateway', routeId: 'route-research', displayAllocationId: 'display-research' }] } },
    } } : { context: { browserId: 'owned-browser', sessionName: 'owned-session', routeId: 'route-research', displayAllocationId, width: 1920, height: 1080 }, frameReceipt: { mimeType: 'image/png', freshness: 'fresh_capture' }, imageBase64: 'iVBORw0KGgo=' };
    return { stdout: JSON.stringify({ success: true, data }), stderr: '' };
  };
  expect(await captureDesktopView({ remoteView, name: 'research', browserId: 'owned-browser', store, runner })).toMatchObject({ imageBase64: 'iVBORw0KGgo=', width: 1920, height: 1080 });
  expect(commands.at(-1)).toEqual(['--json', '--session', 'owned-session', 'desktop', 'capture', '--browser-id', 'owned-browser', '--max-bytes', '8388608']);
  displayAllocationId = 'other-display';
  await expect(captureDesktopView({ remoteView, name: 'research', browserId: 'owned-browser', store, runner })).rejects.toThrow('binding changed');
  expect(commands.some((args) => args.includes('open') || args.includes('takeover'))).toBe(false);
});

test('a configured launch retains a durable handoff that becomes visible in the dedicated client', async () => {
  const { DEFAULT_BROWSER_CONFIG } = await import('../../src/browser/config.js');
  const { buildAgentBrowserRdpOpenPlan, launchAgentBrowserRdpSession } = await import('../../src/browser/service/agentBrowserRdpLauncher.js');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-desktop-launch-client-'));
  directories.push(directory);
  const store = new DesktopBindingStore(directory);
  const config = { ...DEFAULT_BROWSER_CONFIG, browserFamily: 'chrome' as const, browserBuild: 'stock_chrome' as const, chromePath: '/usr/bin/google-chrome', agentBrowserRdp: { enabled: true, runtimeProfile: 'research', routePoolEntryId: 'pool-research', desktopName: 'research' } };
  const options = { config, userDataDir: '/tmp/research-managed', url: 'about:blank', serviceTarget: 'chatgpt' as const, logger: () => {} };
  const plan = buildAgentBrowserRdpOpenPlan(options);
  const browser = { id: 'launched-browser', activeSessionIds: [plan.session], health: 'ready', cdpEndpoint: 'http://127.0.0.1:45123', displayAllocationId: 'display-research', viewStreams: [{ provider: 'rdp_gateway', routeId: 'route-research', displayAllocationId: 'display-research' }] };
  const runner = async (_command: string, args: string[]) => {
    const data = args.includes('status') ? { serviceStateProjection: { complete: true }, service_state: { routePool: { research: { id: 'pool-research', routeId: 'route-research', provider: 'rdp_gateway', state: 'available', target: { displayName: ':20', displayAllocationId: 'display-research' } } }, browsers: { owned: browser } } } : args.includes('open') ? {
      status: 'opened', browserId: 'launched-browser', handoffUrl: 'https://browser.example.test/remote-view/launched-handoff', routeBinding: { routePoolEntryId: 'pool-research', routeId: 'route-research', displayAllocationId: 'display-research' }, operatorVisible: { state: 'ready' }, browserBuildProof: { state: 'matched', requestedBrowserBuild: 'stock_chrome', selectedBrowserBuild: 'stock_chrome', actualExecutablePath: '/usr/bin/google-chrome' },
    } : { browsers: [browser] };
    return { stdout: JSON.stringify({ success: true, data }), stderr: '' };
  };
  await launchAgentBrowserRdpSession({ ...options, runner, bindingStore: store });
  expect((await store.list())[0]).toMatchObject({ browserId: 'launched-browser', handoffUrl: 'https://browser.example.test/remote-view/launched-handoff', managedProfileDir: '/tmp/research-managed' });
  const catalog = await listDesktopViews({ remoteView: { desktops: { research: { runtimeProfile: 'research', routePoolEntryId: 'pool-research' } } }, runner, store });
  expect(catalog.desktops[0]).toMatchObject({ state: 'ready', browsers: [{ browserId: 'launched-browser', handoffUrl: 'https://browser.example.test/remote-view/launched-handoff' }] });
});
