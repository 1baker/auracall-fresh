import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { observeNativeBrowser, verifyNativeBrowser } from '../../src/browser/service/nativeDesktopStore.js';

test('a scrubbed browser process requires exact native desktop window/PID and generation proof', async () => {
  const profile = '/tmp/auracall-native-scrub-fixture';
  const child = spawn(process.execPath, ['-e', `process.title='chrome --remote-debugging-port=45131 --user-data-dir=${profile} about:blank';setInterval(()=>{},1000)`], { stdio: 'ignore', env: {} });
  await once(child, 'spawn');
  let wrongGeneration = false;
  let windowReads = 0;
  const server = createServer(async (req, res) => {
    windowReads++;
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(body.application).toBe('auracall');
    expect(body.request).toMatchObject({ operation: 'windows', assignment_id: 'assignment', expected_generation: 1, expected_viewing_generation: 2 });
    res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify({ schemaVersion: 1, operation: 'desktop.windows', desktopId: 'desktop', generation: 1, viewingGeneration: wrongGeneration ? 3 : 2, windows: [{ id: 123, pid: child.pid }] }));
  }).listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address(); if (!address || typeof address === 'string' || !child.pid) throw new Error('fixture unavailable');
    const context = { origin: `http://127.0.0.1:${address.port}`, application: 'auracall', assignment: { assignmentId: 'assignment', desktopId: 'desktop', generation: 1, viewingGeneration: 2 } };
    // Wait for the child to replace its title, without assuming a fixed startup delay.
    let observed: Awaited<ReturnType<typeof observeNativeBrowser>> | undefined;
    for (let i = 0; i < 30; i++) {
      try { observed = await observeNativeBrowser(child.pid, profile, ':77', context); break; }
      catch (error) { if (i === 29) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    expect(observed?.executable).toBe(await import('node:fs/promises').then(fs => fs.realpath(process.execPath)));
    await expect(observeNativeBrowser(child.pid, profile, ':77')).rejects.toThrow('ownership');
    await expect(observeNativeBrowser(child.pid, '/tmp/auracall-native-scrub', ':77', context)).rejects.toThrow('ownership');
    if (!observed) throw new Error('Missing initial native identity');
    const binding = { ...context, ...observed, pid: child.pid, managedProfileDir: profile, display: ':77',
      desktopName: 'fixture', poolName: 'main', browserId: 'fixture', cdpHost: '127.0.0.1', cdpPort: 9222 };
    const beforeBurst = windowReads;
    expect(await Promise.all(Array.from({ length: 13 }, () => verifyNativeBrowser(binding)))).toEqual(Array(13).fill(true));
    expect(windowReads - beforeBurst).toBe(1);
    wrongGeneration = true;
    await expect(observeNativeBrowser(child.pid, profile, ':77', context)).rejects.toThrow('generation');
    await expect(verifyNativeBrowser(binding)).rejects.toThrow('generation');
  } finally { const exited = once(child, 'exit'); child.kill(); await exited; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
