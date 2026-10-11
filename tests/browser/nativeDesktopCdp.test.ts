// biome-ignore-all lint/style/useNamingConvention: Native provider fixtures use fixed POSIX environment keys.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { NativeDesktopStore, nativeBrowserGeneration, observeNativeBrowser } from '../../src/browser/service/nativeDesktopStore.js';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import CDP from '../../src/browser/cdp.js';

test('native desktop ownership excludes actual wire commands and rejects reused process receipts', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-native-cdp-'));
  setAuracallHomeDirOverrideForTest(home);
  const profile = path.join(home, 'managed');
  const ws = createRequire(import.meta.url).resolve('ws');
  const child = spawn(process.execPath, ['-e', `const {WebSocketServer}=require(${JSON.stringify(ws)});let sequence=0;const server=new WebSocketServer({host:'127.0.0.1',port:0});server.on('listening',()=>process.send({port:server.address().port}));server.on('connection',socket=>socket.on('message',bytes=>{const request=JSON.parse(bytes);socket.send(JSON.stringify({id:request.id,result:{sequence:++sequence}}));}));`, '--', `--user-data-dir=${profile}`], { env: { ...process.env, DISPLAY: ':77' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  let client: Awaited<ReturnType<typeof CDP>> | undefined;
  try {
    const [address] = await once(child, 'message') as [{ port: number }];
    if (!child.pid) throw new Error('missing fixture process');
    const observed = await observeNativeBrowser(child.pid, profile, ':77');
    const binding = { desktopName: 'research', origin: 'http://127.0.0.1:19096', application: 'auracall', poolName: 'main',
      assignment: { assignmentId: 'assignment-native', desktopId: 'desktop-native', generation: 2, viewingGeneration: 7 },
      browserId: 'browser-native', managedProfileDir: profile, pid: child.pid, ...observed, display: ':77', cdpHost: '127.0.0.1', cdpPort: address.port };
    await new NativeDesktopStore().recordBrowser(binding);
    client = await CDP({ target: `ws://127.0.0.1:${address.port}`, protocol: { version: { major: '1', minor: '3' }, domains: [{ domain: 'Page', commands: [{ name: 'reload', returns: [{ name: 'sequence', type: 'integer' }] }] }] } });
    expect(await client.Page.reload()).toMatchObject({ sequence: 1 });
    const gate = new DesktopControlGate(binding.assignment.desktopId);
    const human = await gate.takeControl(nativeBrowserGeneration(binding));
    await expect(client.Page.reload()).rejects.toThrow('paused');
    await gate.releaseControl(human.token, nativeBrowserGeneration(binding));
    expect(await client.Page.reload()).toMatchObject({ sequence: 2 });
    await new NativeDesktopStore().recordBrowser({ ...binding, processStart: 'replaced-process' });
    await expect(client.Page.reload()).rejects.toThrow('ownership changed');
  } finally {
    await client?.close();
    const exited = once(child, 'exit'); child.kill(); await exited;
    setAuracallHomeDirOverrideForTest(null); await fs.rm(home, { recursive: true, force: true });
  }
});
