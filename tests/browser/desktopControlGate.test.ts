import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import { setCdpCommandAdmissionResolver } from '../../packages/browser-service/src/guardedCdp.js';
import CDP from '../../packages/browser-service/src/guardedCdp.js';

const transport = vi.hoisted(() => ({ send: vi.fn(async () => ({ delivered: true })) }));
vi.mock('chrome-remote-interface', () => ({ default: vi.fn(async () => ({ send: transport.send })) }));

test('an automation scope retains custody while nested real CDP commands revalidate its generation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-control-scope-'));
  const gate = new DesktopControlGate('fixture', directory);
  const nestedGate = new DesktopControlGate('fixture', directory);
  let resume: (() => void) | undefined;
  const resumed = new Promise<void>(resolve => { resume = resolve; });
  let detached: Promise<void> | undefined;
  const staleEffect = vi.fn(async () => undefined);
  setCdpCommandAdmissionResolver(async () => ({ run: (_command, effect) => nestedGate.withAutomation('generation-1', effect) }));
  try {
    const client = await CDP({ host: '127.0.0.1', port: 45123 });
    await gate.withAutomation('generation-1', async () => {
      await expect(client.send('Fetch.enable', { patterns: [] })).resolves.toEqual({ delivered: true });
      await expect(gate.takeControl('generation-1')).rejects.toThrow('busy');
      const effect = vi.fn(async () => undefined);
      await expect(nestedGate.withAutomation('generation-2', effect)).rejects.toThrow('ownership changed');
      expect(effect).not.toHaveBeenCalled();
      await client.send('Fetch.disable');
      detached = resumed.then(() => nestedGate.withAutomation('generation-1', staleEffect));
    });
    resume?.();
    await expect(detached).rejects.toThrow('ownership changed');
    expect(staleEffect).not.toHaveBeenCalled();
    const human = await gate.takeControl('generation-1');
    await gate.releaseControl(human.token, 'generation-1');
  } finally {
    setCdpCommandAdmissionResolver(undefined);
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 10000);

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


test('invalid or unpublished ownership blocks effects with an actionable error and preserves custody', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-control-invalid-'));
  const lock = path.join(directory, createHash('sha256').update('fixture').digest('hex'));
  const gate = new DesktopControlGate('fixture', directory);
  const effect = vi.fn(async () => 'effect');
  try {
    await fs.mkdir(lock);
    for (const raw of ['', '{', 'null', '{}', JSON.stringify({id:'x',role:'human',binding:'b',ownerPid:-1,acquiredAt:'invalid'})]) {
      await fs.writeFile(path.join(lock, 'owner.json'), raw);
      await expect(gate.withAutomation('b', effect)).rejects.toThrow('ownership record is invalid');
      expect(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')).toBe(raw);
    }
    await fs.rm(path.join(lock, 'owner.json'));
    await expect(gate.withAutomation('b', effect)).rejects.toThrow('ownership record is invalid');
    expect(effect).not.toHaveBeenCalled();
    expect((await fs.stat(lock)).isDirectory()).toBe(true);
  } finally { await fs.rm(directory, {recursive:true,force:true}); }
});

test('owner publication never exposes a partial owner.json', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-control-publication-'));
  const lock = path.join(directory, createHash('sha256').update('fixture').digest('hex'));
  const original = fs.writeFile.bind(fs);
  let destination = '';
  const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    destination = String(args[0]);
    await original(args[0], '', args[2]);
    await expect(fs.readFile(path.join(lock, 'owner.json'))).rejects.toMatchObject({code:'ENOENT'});
    await original(args[0], args[1], {mode:0o600,flag:'w'});
  });
  try {
    const gate = new DesktopControlGate('fixture', directory);
    const owner = await gate.takeControl('binding');
    expect(destination).not.toBe(path.join(lock, 'owner.json'));
    await gate.assertControl(owner.token, 'binding');
    expect(await fs.readdir(lock)).toEqual(['owner.json']);
    await gate.releaseControl(owner.token, 'binding');
  } finally { spy.mockRestore(); await fs.rm(directory, {recursive:true,force:true}); }
});
