import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { AdmittedPuppeteerTransport } from '../../packages/browser-service/src/guardedPuppeteer.js';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';

test('Puppeteer transport holds admission through reply and refuses established-session commands during takeover', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-puppeteer-gate-'));
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || !address) throw new Error('fixture port');
  const connected = once(server, 'connection');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`); await once(socket, 'open');
  const [peer] = await connected as [WebSocket];
  const gate = new DesktopControlGate('desktop', directory);
  const transport = new AdmittedPuppeteerTransport(socket, { run: (_command, effect) => gate.withAutomation('binding', effect) });
  const replies: Record<string, unknown>[] = [];
  transport.onmessage = message => replies.push(JSON.parse(message));
  try {
    const received = once(peer, 'message');
    transport.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', sessionId: 'session', params: { expression: 'effect()' } }));
    const [wire] = await received; expect(JSON.parse(String(wire)).id).toBe(1);
    await expect(gate.takeControl('binding', 'human')).rejects.toThrow('busy');
    peer.send(JSON.stringify({ id: 1, sessionId: 'session', result: {} }));
    await expect.poll(() => replies.length).toBe(1);
    await gate.takeControl('binding', 'human');
    let writes = 0; peer.on('message', () => { writes++; });
    transport.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', sessionId: 'session' }));
    await expect.poll(() => replies.length).toBe(2);
    expect(replies[1]).toMatchObject({ id: 2, sessionId: 'session', error: { message: expect.stringContaining('paused') } });
    expect(writes).toBe(0);
    await gate.releaseControl('human', 'binding');
    const resumed = once(peer, 'message');
    transport.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', sessionId: 'session' }));
    await resumed; peer.send(JSON.stringify({ id: 3, sessionId: 'session', result: {} }));
    await expect.poll(() => replies.length).toBe(3);
    expect(writes).toBe(1);
  } finally {
    const closed = once(socket, 'close'); transport.close(); await closed;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
