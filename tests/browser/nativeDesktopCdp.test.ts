// biome-ignore-all lint/style/useNamingConvention: Native provider fixtures use fixed POSIX environment keys.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { NativeDesktopStore, nativeBrowserGeneration, observeNativeBrowser } from '../../src/browser/service/nativeDesktopStore.js';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import CDP from '../../src/browser/cdp.js';
import { holdCdpCommandAdmission, withCdpCommandTimeout } from '../../packages/browser-service/src/guardedCdp.js';

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
    await expect(client.send('Target.createTarget', { url: 'about:blank' })).resolves.toMatchObject({ sequence: 2 });
    await expect(client.Page.reload()).rejects.toThrow('paused');
    await gate.releaseControl(human.token, nativeBrowserGeneration(binding));
    expect(await client.Page.reload()).toMatchObject({ sequence: 3 });
    const existingOwner = await gate.holdAutomation(nativeBrowserGeneration(binding));
    const cancellation = new AbortController();
    let queuedResult: unknown;
    const queuedClient = client;
    const queued = withCdpCommandTimeout(client, { timeoutMs: 100, timeoutMessage: 'fixture wire timeout', abortSignal: cancellation.signal }, () => queuedClient.Page.reload()).then(value => { queuedResult = value; }, error => { queuedResult = error; });
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      expect(queuedResult).toBeUndefined();
      await existingOwner.close();
      await queued;
      expect(queuedResult).toMatchObject({ sequence: 4 });
    } finally { cancellation.abort(); await existingOwner.close(); await queued; }

    const gateOwnerPath = path.join(home, 'desktop-control', createHash('sha256').update(binding.assignment.desktopId).digest('hex'), 'owner.json');
    await fs.mkdir(path.dirname(gateOwnerPath), { recursive: true }); await fs.writeFile(gateOwnerPath, '');
    await expect(client.send('Target.createTarget', { url: 'about:blank' })).resolves.toMatchObject({ sequence: 5 });
    await expect(client.Page.reload()).rejects.toThrow();
    expect(await fs.readFile(gateOwnerPath, 'utf8')).toBe('');
    await fs.rm(path.dirname(gateOwnerPath), { recursive: true });
    const hold = await holdCdpCommandAdmission(client);
    const heldClient = client;
    await expect(gate.takeControl(nativeBrowserGeneration(binding))).rejects.toThrow('busy');
    expect(await client.Page.reload()).toMatchObject({ sequence: 6 });
    await new NativeDesktopStore().recordBrowser({ ...binding, processStart: 'replaced-process' });
    await expect(client.Page.reload()).rejects.toThrow('ownership changed');
    await expect(hold.run('Page.reload', () => heldClient.Page.reload())).rejects.toThrow('ownership changed');
    await hold.close();
  } finally {
    await client?.close();
    const exited = once(child, 'exit'); child.kill(); await exited;
    setAuracallHomeDirOverrideForTest(null); await fs.rm(home, { recursive: true, force: true });
  }
}, 10000);


test('a retained scrubbed process can create its next window while existing-page commands require current window proof', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-native-windowless-'));
  setAuracallHomeDirOverrideForTest(home);
  const profile = path.join(home, 'managed');
  const ws = createRequire(import.meta.url).resolve('ws');
  const child = spawn(process.execPath, ['-e', `const {WebSocketServer}=require(${JSON.stringify(ws)});process.title='chrome --user-data-dir=${profile} about:blank';let sequence=0;const server=new WebSocketServer({host:'127.0.0.1',port:0});server.on('listening',()=>process.send({port:server.address().port}));server.on('connection',socket=>socket.on('message',bytes=>{const request=JSON.parse(bytes);socket.send(JSON.stringify({id:request.id,result:{sequence:++sequence}}));}));`], {env:{},stdio:['ignore','ignore','inherit','ipc']});
  let visible = true;
  let wrongGeneration = false;
  const server = createServer(async (req,res) => {
    const chunks: Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const body=JSON.parse(Buffer.concat(chunks).toString());
    expect(body.request).toMatchObject({assignment_id:'a',expected_generation:1,expected_viewing_generation:2});
    if (body.request.operation === 'launch_environment') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({schemaVersion:1,readinessScope:'live_resource',target:{assignmentId:'a',registrationId:'r',desktopId:'d',lifecycleGeneration:1,viewingDesktopId:'v',viewingGeneration:wrongGeneration?3:2},environment:{DISPLAY:':77',XAUTHORITY:'/private/fixture',REMOTE_VIEW_SLOT_GENERATION:'2'}}));return;
    }
    expect(body.request.operation).toBe('windows');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schemaVersion:1,operation:'desktop.windows',desktopId:'d',generation:1,viewingGeneration:2,windows:visible?[{id:123,pid:child.pid}]:[]}));
  }).listen(0,'127.0.0.1');
  let client: Awaited<ReturnType<typeof CDP>> | undefined;
  try {
    const [wire] = await once(child,'message') as [{port:number}];
    const address=server.address();if(!child.pid||!address||typeof address==='string')throw Error('fixture unavailable');
    const context={origin:`http://127.0.0.1:${address.port}`,application:'auracall',assignment:{assignmentId:'a',desktopId:'d',generation:1,viewingGeneration:2}};
    const observed=await observeNativeBrowser(child.pid,profile,':77',context);
    const binding={...context,...observed,desktopName:'fixture',poolName:'main',browserId:'b',managedProfileDir:profile,pid:child.pid,display:':77',cdpHost:'127.0.0.1',cdpPort:wire.port};
    await new NativeDesktopStore().recordBrowser(binding);
    client=await CDP({target:`ws://127.0.0.1:${wire.port}`,protocol:{version:{major:'1',minor:'3'},domains:[]}});
    visible=false;
    await expect(client.send('Target.createTarget',{url:'about:blank'})).resolves.toMatchObject({sequence:1});
    await expect(client.send('Page.reload')).rejects.toThrow('ownership');
    visible=true;
    await expect(client.send('Page.reload')).resolves.toMatchObject({sequence:2});
    wrongGeneration=true;
    await expect(client.send('Target.createTarget',{url:'about:blank'})).rejects.toThrow('generation');
    wrongGeneration=false;
    await new NativeDesktopStore().recordBrowser({...binding,processStart:'reused'});
    await expect(client.send('Target.createTarget',{url:'about:blank'})).rejects.toThrow('ownership');
  } finally {
    await client?.close();const exited=once(child,'exit');child.kill();await exited;
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    setAuracallHomeDirOverrideForTest(null);await fs.rm(home,{recursive:true,force:true});
  }
});
