// biome-ignore-all lint/style/useNamingConvention: CDP domain names are protocol-defined.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import CDP, { setCdpCommandAdmissionResolver } from '../../packages/browser-service/src/guardedCdp.js';
import { waitForAssistantResponse } from '../../src/browser/actions/assistantResponse.js';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';
import type { BrowserLogger, ChromeClient } from '../../src/browser/types.js';

const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('chrome-remote-interface', () => ({ default: vi.fn(async () => {
  const client = { send: transport.send, Runtime: {
    evaluate: (parameters: unknown) => client.send('Runtime.evaluate', parameters),
    terminateExecution: () => client.send('Runtime.terminateExecution'),
  } };
  return client;
}) }));

test.each([{ coordinated: true, human: false }, { coordinated: false, human: false }, { coordinated: true, human: true }])('collects through actual admission while retaining human exclusion: %j', async (scenario) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-control-observation-'));
  let release: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const admittedTasks = new Set<Promise<unknown>>();
  const pending = new Promise<void>(resolve => { release = resolve; });
  transport.send.mockReset();
  transport.send.mockImplementation(async (_command, parameters) => {
    if (parameters?.awaitPromise) await pending;
    if (parameters?.expression?.startsWith('Boolean(')) return { result: { type: 'boolean', value: false } };
    return { result: { type: 'object', value: { text: 'Fixture completed response', messageId: 'fixture-answer' } } };
  });
  const gate = new DesktopControlGate('fixture-display', directory);
  const human = scenario.human ? await gate.takeControl('fixture-generation') : undefined;
  setCdpCommandAdmissionResolver(async () => {
    if (!scenario.coordinated) return undefined;
    const gate = new DesktopControlGate('fixture-display', directory);
    return { run: (_command, effect) => {
      const task = gate.withAutomation('fixture-generation', effect);
      admittedTasks.add(task);
      void task.finally(() => admittedTasks.delete(task)).catch(() => {});
      return task;
    } };
  });
  try {
    const client = await CDP({ host: '127.0.0.1', port: 45123 });
    const runtime = client.Runtime as ChromeClient['Runtime'];
    timer = setTimeout(() => release?.(), 3500);
    const logger: BrowserLogger = () => undefined;
    const onPassiveDomProbe = vi.fn(async () => undefined);
    const onResponseIncoming = vi.fn(async () => undefined);
    const result = waitForAssistantResponse(runtime, 10000, logger, undefined, { onPassiveDomProbe, onResponseIncoming });
    if (scenario.human) {
      await expect(result).rejects.toThrow('paused while a human controls');
    } else {
      await expect(result).resolves.toMatchObject({ text: 'Fixture completed response', meta: { messageId: 'fixture-answer' } });
      expect(onPassiveDomProbe).toHaveBeenCalled();
      expect(onResponseIncoming).toHaveBeenCalledTimes(1);
    }
  } finally {
    if (timer) clearTimeout(timer);
    release?.();
    await Promise.allSettled([...admittedTasks]);
    setCdpCommandAdmissionResolver(undefined);
    if (human) await gate.releaseControl(human.token, 'fixture-generation');
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 15000);
