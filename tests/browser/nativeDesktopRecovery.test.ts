// biome-ignore-all lint/style/useNamingConvention: Native fixture uses POSIX environment keys.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';
import { NativeDesktopStore, observeNativeBrowser } from '../../src/browser/service/nativeDesktopStore.js';
import { launchNativeDesktopBrowser } from '../../src/browser/service/nativeDesktopRuntime.js';
import { reconcileNativeDesktopBrowser } from '../../src/browser/service/nativeDesktopRecovery.js';

for (const scenario of ['qualified', 'old-live', 'wrong-window', 'wrong-generation', 'wrong-executable', 'wrong-profile', 'foreign-endpoint', 'wrong-placement', 'wrong-display'] as const) {
  test.skipIf(process.platform !== 'linux')(`explicit native reconciliation: ${scenario}`, async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-native-reconcile-'));
    setAuracallHomeDirOverrideForTest(home);
    const directory = path.join(home, 'managed');
    await fs.mkdir(directory);
    const children: ChildProcess[] = [];
    let currentPid = 0;
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const { request } = JSON.parse(Buffer.concat(chunks).toString());
      res.setHeader('Content-Type', 'application/json');
      const target = { assignmentId: 'a', registrationId: 'r', desktopId: 'd', lifecycleGeneration: 2, viewingDesktopId: 'v', viewingGeneration: 7 };
      res.end(JSON.stringify(request.operation === 'inventory' ? {
        schemaVersion: 1, registration: { consumerKey: 'auracall', registrationId: 'r' },
        pools: [{ poolId: 'p', registrationId: 'r', name: 'main', desktopMembers: ['d'] }],
        assignments: [{ assignmentId: 'a', registrationId: 'r', poolId: 'p', desktopId: 'd', generation: scenario === 'wrong-generation' ? 3 : 2, state: 'active' }],
        desktops: [{ desktopId: 'd', lifecycle: { generation: 2, state: 'ready', readinessScope: 'live_resource', allocated: true }, viewing: { lifecycleGeneration: 2, generation: 7, desktopId: 'v', publicRoute: '/1' } }],
      } : request.operation === 'windows' ? {
        schemaVersion: 1, operation: 'desktop.windows', desktopId: 'd', generation: 2, viewingGeneration: 7,
        windows: scenario === 'wrong-window' ? [] : [{ id: 1, pid: currentPid }],
      } : { schemaVersion: 1, target, readinessScope: 'live_resource', environment: { DISPLAY: ':77', XAUTHORITY: '/private/fixture', REMOTE_VIEW_SLOT_GENERATION: '7' } }));
    }).listen(0, '127.0.0.1'); await once(server, 'listening');
    const start = async (profile: string) => {
      const child = spawn(process.execPath, ['-e', `const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Browser:'fixture'}))});server.listen(0,'127.0.0.1',()=>{${children.length > 0 && scenario === 'qualified' ? `process.title='chrome --user-data-dir='+${JSON.stringify(profile)}+' about:blank';` : ''}process.send({port:server.address().port})});`, '--', `--user-data-dir=${profile}`], { env: { ...process.env, DISPLAY: scenario === 'wrong-display' && children.length > 0 ? ':88' : ':77' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      children.push(child);
      const [address] = await once(child, 'message') as [{ port: number }];
      if (!child.pid) throw new Error('missing fixture PID');
      return { child, pid: child.pid, port: address.port };
    };
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
      const selected = { desktopName: 'research', poolName: 'main', application: 'auracall', origin: `http://127.0.0.1:${address.port}`, publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' };
      const old = await start(directory);
      const store = new NativeDesktopStore();
      const previous = { ...selected, assignment: { assignmentId: 'a', desktopId: 'd', generation: 2, viewingGeneration: 7 },
        browserId: 'old-browser', managedProfileDir: directory, pid: old.pid, ...await observeNativeBrowser(old.pid, directory, ':77'), display: ':77', cdpHost: '127.0.0.1', cdpPort: old.port };
      await store.recordBrowser(previous);
      const retained = await store.browsers();
      if (scenario !== 'old-live') { const exited = once(old.child, 'exit'); old.child.kill(); await exited; }
      const replacement = await start(scenario === 'wrong-profile' ? path.join(home, 'foreign') : directory);
      currentPid = replacement.pid;
      await fs.writeFile(path.join(directory, 'DevToolsActivePort'), `${scenario === 'foreign-endpoint' ? address.port : replacement.port}\n/browser/fixture`);
      const config = { ...DEFAULT_BROWSER_CONFIG, chromePath: scenario === 'wrong-executable' ? '/bin/true' : process.execPath, remoteViewDesktop: { ...selected, desktopName: scenario === 'wrong-placement' ? 'other' : 'research' } };
      const input = { config, userDataDir: directory, pid: replacement.pid };
      if (scenario === 'qualified') {
        await expect(launchNativeDesktopBrowser({ config, userDataDir: directory, logger: () => {}, launch: async () => { throw new Error('must not launch before qualification'); } })).rejects.toThrow('no matching native desktop receipt');
        await expect(reconcileNativeDesktopBrowser(input)).resolves.toMatchObject({ state: 'reconciled' });
        const [receipt] = await store.browsers();
        expect(receipt).toMatchObject({ pid: replacement.pid, cdpPort: replacement.port, assignment: previous.assignment });
        expect(receipt?.browserId).not.toBe(previous.browserId);
        expect((await fs.readdir(path.join(home, 'native-desktops'))).filter(name => name.startsWith('reconciliation-'))).toHaveLength(1);
        const reused = await launchNativeDesktopBrowser({ config, userDataDir: directory, logger: () => {}, launch: async () => { throw new Error('must reuse, never launch'); } });
        expect(reused).toMatchObject({ pid: replacement.pid, port: replacement.port });
      } else {
        const reasons = { 'old-live': 'still exists', 'wrong-window': 'no current window', 'wrong-generation': 'generation is unavailable', 'wrong-executable': 'executable', 'wrong-profile': 'ownership mismatch', 'foreign-endpoint': 'not uniquely owned', 'wrong-placement': 'cannot change desktop placement', 'wrong-display': 'ownership' };
        await expect(reconcileNativeDesktopBrowser(input)).rejects.toThrow(reasons[scenario]);
        expect(await store.browsers()).toEqual(retained);
      }
      // Neither successful reconciliation nor refusal may signal the replacement.
      expect(replacement.child.exitCode).toBeNull();
      expect(replacement.child.signalCode).toBeNull();
    } finally {
      await Promise.all(children.map(async child => { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill(); await exited; }));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      setAuracallHomeDirOverrideForTest(null); await fs.rm(home, { recursive: true, force: true });
    }
  });
}
