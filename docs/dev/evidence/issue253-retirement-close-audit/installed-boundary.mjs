import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = process.env.AURACALL_INSTALLED_DIST;
if (!root) throw new Error('Set AURACALL_INSTALLED_DIST to the installed dist directory.');
const { createBrowserTabConcurrencyRuntime } = await import(root + '/src/browser/tabConcurrencyRuntime.js');
const { runConfiguredChatgptTabMaintenance } = await import(root + '/src/browser/configuredChatgptTabMaintenance.js');
const rows = [];
for (const scenario of [
  { state: 'idle', activity: 'inactive', live: true, expectedClose: true },
  { state: 'idle', activity: 'active', live: true, expectedClose: false },
  { state: 'idle', activity: 'inactive', live: false, expectedClose: false },
  { state: 'lost', activity: 'inactive', live: true, expectedClose: true },
  { state: 'lost', activity: 'active', live: true, expectedClose: false },
]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'auracall-installed-retirement-audit-'));
  try {
    const config = { browser: { tabConcurrencyMode: 'tab-affinity' }, profiles: { fixture: { browser: { tabConcurrencyMode: 'tab-affinity' }, services: { chatgpt: { identity: { accountId: 'fixture' } } } } } };
    const runtime = createBrowserTabConcurrencyRuntime(config, { storageRoot: directory });
    const registry = runtime.registry;
    const scope = { runtimeProfileId: 'fixture', managedBrowserProfile: '/fixture/chatgpt', service: 'chatgpt', tenantKey: 'service-account:chatgpt:account-id=fixture' };
    const reserved = await registry.reserve({ scope, targetId: 'fixture-target', workload: { kind: 'conversation', conversationId: 'fixture' }, operationId: 'fixture-operation', now: '2026-10-12T12:00:00.000Z', idleTtlMs: 1000, absoluteTtlMs: 60000, targetFingerprint: 'https://chatgpt.com/c/fixture' });
    assert(reserved.ok);
    await registry.idle({ claim: reserved.value.claim, now: '2026-10-12T12:00:00.500Z', effectState: 'settled' });
    if (scenario.state === 'lost') {
      const lease = (await registry.list())[0];
      await registry.markLost({ leaseId: lease.leaseId, expectedRevision: lease.revision, now: '2026-10-12T12:00:00.600Z', reason: 'restart-unverified' });
    }
    const journal = path.join(directory, 'tab-leases', 'retirement-events.v1.jsonl');
    let live = scenario.live;
    let closes = 0;
    const summary = await runConfiguredChatgptTabMaintenance({ userConfig: config, now: () => new Date('2026-10-12T12:00:02.000Z'), deps: {
      createRuntime: () => runtime,
      createBrowserService: () => ({ resolveServiceTarget: async () => ({ host: '127.0.0.1', port: 45123, browserProcessId: 12345, managedBrowserProfile: scope.managedBrowserProfile }) }),
      listTargets: async () => live ? [{ id: 'fixture-target', type: 'page', url: 'https://chatgpt.com/c/fixture' }] : [],
      probeActivity: async () => scenario.activity,
      closeTarget: async (_host, _port, targetId) => {
        assert.equal(targetId, 'fixture-target');
        const events = (await readFile(journal, 'utf8')).trim().split('\n').map(JSON.parse);
        assert(events.some(e => e.phase === 'close-requested' && e.targetId === targetId && e.reason === 'idle-expired' && e.actorPid === process.pid));
        closes++;
        live = false;
      },
    } });
    if (scenario.state === "lost" && scenario.activity === "active") {
      assert.deepEqual(summary.errors, [{ runtimeProfileId: "fixture", message: "tab-retirement-deferred: provider-activity-active" }]);
    } else assert.deepEqual(summary.errors, []);
    assert.equal(closes, scenario.expectedClose ? 1 : 0);
    let text = '';
    try { text = await readFile(journal, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const events = text.trim() ? text.trim().split('\n').map(JSON.parse) : [];
    if (scenario.expectedClose) {
      assert(events.some(e => e.phase === 'retirement-finished' && e.disposition === 'closed' && e.targetDisposition === 'closed'));
      assert(events.every(e => e.endpoint?.browserProcessId === 12345));
      if (process.platform !== 'win32') assert.equal((await stat(journal)).mode & 0o777, 0o600);
    }
    if (!scenario.live) assert(!events.some(e => e.phase === 'close-requested'));
    assert(!text.includes(scope.managedBrowserProfile));
    assert(!text.includes(scope.tenantKey));
    rows.push({ state: scenario.state, activity: scenario.activity, initiallyLive: scenario.live, fixtureCloses: closes, journalEvents: events.length, passed: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ installedCompiledMaintenanceAuditPassed: true, cases: rows, providerEffects: 0, liveCloses: 0 }));
