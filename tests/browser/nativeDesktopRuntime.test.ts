// biome-ignore-all lint/style/useNamingConvention: Native provider fixtures use fixed POSIX environment keys.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';
import { launchNativeDesktopBrowser } from '../../src/browser/service/nativeDesktopRuntime.js';
import { listDesktopViews } from '../../src/browser/service/desktopClient.js';
import { assertNoLiveNativeDesktopBrowser, NativeDesktopStore } from '../../src/browser/service/nativeDesktopStore.js';

test('native browser launch needs no RDP-only family/build declarations and preserves retained ownership and child environment', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-native-launch-'));
  setAuracallHomeDirOverrideForTest(home);
  const target = { assignmentId: 'a', registrationId: 'r', desktopId: 'd', lifecycleGeneration: 2, viewingDesktopId: 'v', viewingGeneration: 7 };
  const requests: string[] = [];
  const children: ChildProcess[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const { request } = JSON.parse(Buffer.concat(chunks).toString()); requests.push(request.operation);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(request.operation === 'acquire' ? { assignmentId: 'a', desktopId: 'd', generation: 2, state: 'active' }
      : request.operation === 'inventory' ? { schemaVersion: 1, registration: { consumerKey: 'auracall', registrationId: 'r' },
        pools: [{ poolId: 'p', registrationId: 'r', name: 'main', desktopMembers: ['d'] }],
        assignments: [{ assignmentId: 'a', registrationId: 'r', poolId: 'p', desktopId: 'd', generation: 2, state: 'active' }],
        desktops: [{ desktopId: 'd', lifecycle: { generation: 2, state: 'ready', readinessScope: 'live_resource', allocated: true }, viewing: { lifecycleGeneration: 2, generation: 7, desktopId: 'v', publicRoute: '/1' } }] }
      : { schemaVersion: 1, target, readinessScope: 'live_resource', environment: { DISPLAY: ':77', XAUTHORITY: '/private/Xauthority', REMOTE_VIEW_SLOT_GENERATION: '7', WAYLAND_DISPLAY: '' } }));
  }).listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
    const config = { ...DEFAULT_BROWSER_CONFIG, chromePath: '/bin/true',
      remoteViewDesktop: { desktopName: 'research', poolName: 'main', application: 'auracall', origin: `http://127.0.0.1:${address.port}`, publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' } };
    // The binary contract is exercised with a named fixture executable; no provider browser is launched.
    const executable = path.join(home, 'google-chrome'); await fs.symlink(process.execPath, executable); config.chromePath = executable;
    const launch = vi.fn(async (_config, directory: string, _logger, launchOptions) => {
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', '--', `--user-data-dir=${directory}`], { env: { ...process.env, ...launchOptions.launchEnvironment }, stdio: 'ignore' });
      children.push(child); await once(child, 'spawn');
      return { pid: child.pid, port: 45122 + children.length, kill: async () => { child.kill(); } };
    });
    const display = process.env.DISPLAY;
    const options = { config, userDataDir: path.join(home, 'managed-research'), logger: () => {}, launch };
    const first = await launchNativeDesktopBrowser(options);
    expect(first.port).toBe(45123);
    await expect(assertNoLiveNativeDesktopBrowser(options.userDataDir)).rejects.toThrow('still bound');
    await expect(assertNoLiveNativeDesktopBrowser(path.join(home, 'other'), { host: 'localhost', port: first.port })).rejects.toThrow('still bound');
    await expect(assertNoLiveNativeDesktopBrowser(path.join(home, 'other'))).resolves.toBeUndefined();
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ display: ':77', headless: false, keepBrowser: true }), options.userDataDir, expect.any(Function), expect.objectContaining({ launchEnvironment: expect.objectContaining({ DISPLAY: ':77', XAUTHORITY: '/private/Xauthority' }) }));
    expect(process.env.DISPLAY).toBe(display);
    await launchNativeDesktopBrowser({ ...options, userDataDir: path.join(home, 'managed-second') });
    expect(requests.filter(operation => operation === 'acquire')).toHaveLength(1);
    const store = new NativeDesktopStore();
    const bindings = await store.browsers();
    expect(bindings.map(browser => browser.assignment.assignmentId)).toEqual(['a', 'a']);
    const firstBinding = bindings[0]; if (!firstBinding) throw new Error('missing retained fixture binding');
    await store.recordBrowser({ ...firstBinding, application: 'foreign', browserId: 'foreign-browser', managedProfileDir: path.join(home, 'foreign-browser') });
    const catalog = await listDesktopViews({ remoteView: { application: { origin: config.remoteViewDesktop.origin, publicOrigin: config.remoteViewDesktop.publicOrigin, appOrigin: config.remoteViewDesktop.appOrigin, name: 'auracall' }, desktops: { research: { poolName: 'main' } }, rootDesktopUrl: 'https://root.example.test' } });
    expect(catalog.desktops[0]).toMatchObject({ state: 'ready', presentation: 'native' });
    expect(catalog.desktops[0]?.browsers).toHaveLength(2);
    expect(catalog.desktops[0]?.browsers.some(browser => browser.browserId === 'foreign-browser')).toBe(false);
    expect(catalog.rootDesktopUrl).toBe('https://root.example.test');
  } finally {
    await Promise.all(children.map(async child => { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill(); await exited; }));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    setAuracallHomeDirOverrideForTest(null); await fs.rm(home, { recursive: true, force: true });
  }
});
