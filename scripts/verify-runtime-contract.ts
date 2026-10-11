#!/usr/bin/env tsx
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Probe compiled application routes without reading operator state or starting
// maintenance, recovery, browser launches, or provider work.
const runtimeRoot = path.resolve(process.argv[2] ?? process.cwd());
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-contract-'));
try {
  const homeModule = await import(pathToFileURL(path.join(runtimeRoot, 'dist/src/auracallHome.js')).href);
  homeModule.setAuracallHomeDirOverrideForTest(home);
  const { createResponsesHttpServer } = await import(
    pathToFileURL(path.join(runtimeRoot, 'dist/src/http/responsesServer.js')).href
  ) as typeof import('../src/http/responsesServer.js');
  const server = await createResponsesHttpServer({
    host: '127.0.0.1', port: 0, recoverRunsOnStart: false,
    tabAffinityMaintenanceIntervalMs: 0, backgroundDrainIntervalMs: 0,
    accountMirrorSchedulerIntervalMs: 0,
  }, { config: {} });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const response = await fetch(`${base}/desktops`);
    assert.equal(response.status, 200, 'Required /desktops route is missing; refuse runtime replacement.');
    assert.match(await response.text(), /AuraCall Desktops/);
    console.log(JSON.stringify({ status: 'PASS', requiredRoutes: ['/desktops'], runtimeRoot }));
  } finally {
    await server.close();
  }
} finally {
  await fs.rm(home, { recursive: true, force: true });
}
