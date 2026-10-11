import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { DesktopBindingStore } from '../../src/browser/service/desktopBindings.js';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import { desktopBindingGeneration } from '../../src/browser/service/desktopControlRuntime.js';
import CDP from '../../src/browser/cdp.js';

test('an existing generated CDP domain method cannot emit a wire command during human control, and resumes after release', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cdp-wire-'));
  setAuracallHomeDirOverrideForTest(directory);
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (typeof address === 'string' || !address) throw new Error('Missing fixture address');
  const messages: string[] = [];
  server.on('connection', (socket) => socket.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString()) as { id: number; method: string };
    messages.push(message.method);
    socket.send(JSON.stringify({ id: message.id, result: {} }));
  }));
  const binding = { desktopName: 'research', managedProfileDir: '/tmp/managed-research', browserId: 'browser-research', session: 'research-session', routePoolEntryId: 'pool-research', routeId: 'route-research', displayAllocationId: 'display-research', handoffUrl: 'https://browser.example.test/remote-view/research', cdpHost: '127.0.0.1', cdpPort: address.port };
  await new DesktopBindingStore().record(binding);
  const gate = new DesktopControlGate('display-research');
  const client = await CDP({ target: `ws://127.0.0.1:${address.port}`, protocol: { version: { major: '1', minor: '3' }, domains: [{ domain: 'Page', commands: [{ name: 'reload' }] }] } });
  try {
    await client.Page.reload();
    expect(messages).toEqual(['Page.reload']);
    const human = await gate.takeControl(desktopBindingGeneration(binding));
    await expect(client.Page.reload()).rejects.toThrow('paused');
    expect(messages).toEqual(['Page.reload']);
    await gate.releaseControl(human.token, desktopBindingGeneration(binding));
    await client.Page.reload();
    expect(messages).toEqual(['Page.reload', 'Page.reload']);
    await new DesktopBindingStore().record({ ...binding, browserId: 'replacement-browser' });
    await expect(client.Page.reload()).rejects.toThrow('ownership changed');
    expect(messages).toEqual(['Page.reload', 'Page.reload']);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setAuracallHomeDirOverrideForTest(null);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
