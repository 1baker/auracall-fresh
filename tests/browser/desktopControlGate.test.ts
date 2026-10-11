import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import { setCdpCommandAdmissionResolver } from '../../packages/browser-service/src/guardedCdp.js';
import CDP from '../../packages/browser-service/src/guardedCdp.js';

const transport = vi.hoisted(() => ({ send: vi.fn(async () => ({ delivered: true })) }));
vi.mock('chrome-remote-interface', () => ({ default: vi.fn(async () => ({ send: transport.send })) }));

test('real CDP send admission excludes takeover during an in-flight command and excludes writes until explicit fresh release', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-desktop-control-'));
  const gate = new DesktopControlGate('display-research', directory);
  let settle: (() => void) | undefined;
  let admitted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { admitted = resolve; });
  const pending = new Promise<void>((resolve) => { settle = resolve; });
  transport.send.mockImplementationOnce(async () => { admitted?.(); await pending; return { delivered: true }; });
  setCdpCommandAdmissionResolver(async () => ({ run: (_command, effect) => gate.withAutomation('generation-1', effect) }));
  try {
    const client = await CDP({ host: '127.0.0.1', port: 45123 });
    const command = client.send('Page.navigate', { url: 'https://fixture.invalid' });
    await started;
    await expect(gate.takeControl('generation-1')).rejects.toThrow('busy');
    settle?.();
    await command;
    const control = await gate.takeControl('generation-1');
    const delivered = transport.send.mock.calls.length;
    await expect(client.send('Runtime.evaluate', { expression: 'document.body.click()' })).rejects.toThrow('paused');
    expect(transport.send.mock.calls.length).toBe(delivered);
    await expect(gate.takeControl('generation-1')).rejects.toThrow('busy');
    await expect(gate.releaseControl(control.token, 'generation-2')).rejects.toThrow('ownership changed');
    await gate.releaseControl(control.token, 'generation-1');
    await expect(client.send('Page.reload')).resolves.toEqual({ delivered: true });
  } finally { setCdpCommandAdmissionResolver(undefined); await fs.rm(directory, { recursive: true, force: true }); }
});
