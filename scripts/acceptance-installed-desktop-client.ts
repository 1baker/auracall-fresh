#!/usr/bin/env tsx
// Installed acceptance: blank local marker pages only. Human ingress authentication stays interactive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.AURACALL_INSTALLED_DESKTOP_ACCEPTANCE !== '1') throw new Error('Set AURACALL_INSTALLED_DESKTOP_ACCEPTANCE=1 for installed blank-browser effects.');
const phase = process.argv[2] ?? 'verify';
assert(['prepare', 'verify', 'cleanup'].includes(phase), 'Choose prepare, verify or cleanup.');
const home = path.join(os.homedir(), '.auracall');
const runtime = path.join(home, 'user-runtime', 'node_modules', 'auracall', 'dist');
const load = (relative: string) => import(pathToFileURL(path.join(runtime, relative)).href);
const { resolveConfig } = await load('src/schema/resolver.js') as typeof import('../src/schema/resolver.js');
const { resolveBrowserLaunchPlan } = await load('src/browser/service/browserLaunchPlan.js') as typeof import('../src/browser/service/browserLaunchPlan.js');
const { launchChrome } = await load('src/browser/chromeLifecycle.js') as typeof import('../src/browser/chromeLifecycle.js');
const { NativeDesktopStore, verifyNativeBrowser } = await load('src/browser/service/nativeDesktopStore.js') as typeof import('../src/browser/service/nativeDesktopStore.js');
const { default: CDP } = await load('src/browser/cdp.js') as typeof import('../src/browser/cdp.js');
const metadata = JSON.parse(await fs.readFile(path.join(home, 'user-runtime', 'auracall-user-runtime.json'), 'utf8'));
const receiptPath = path.join(home, 'plan0391-installed-client-acceptance.json');
const config = await resolveConfig({}, os.homedir());
const store = new NativeDesktopStore();
type Binding = Awaited<ReturnType<typeof store.browsers>>[number];
let browsers: Binding[] = [];
if (phase === 'prepare') {
  for (const name of ['research', 'writing']) {
    const plan = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: { browserProfileId: `remote-view-${name}`, provider: 'chatgpt' } });
    assert.equal(plan.launchPolicy.remoteViewDesktop?.desktopName, name);
    const launchPolicy = structuredClone(plan.launchPolicy) as import('../src/browser/types.js').ResolvedBrowserConfig;
    const handle = await launchChrome({ ...launchPolicy, manualLogin: true, url: 'about:blank' }, plan.managedBrowserProfile.directory, () => {});
    handle.process?.unref();
    const matches = (await store.browsers()).filter(item => item.managedProfileDir === plan.managedBrowserProfile.directory);
    assert.equal(matches.length, 1); const binding = matches[0]; assert(binding); browsers.push(binding);
    const client = await CDP({ host: handle.host ?? '127.0.0.1', port: handle.port });
    try { await client.Runtime.evaluate({ expression: `document.title='AuraCall ${name} — Plan0391';document.body.innerHTML='<h1>AuraCall ${name}</h1><p>Native Remote View acceptance. Take control, type ${name}-391, then release control.</p><label>Human input marker <input id="marker" aria-label="Human input marker"></label>';document.body.style='background:#14223a;color:white;font:28px system-ui;padding:40px';document.querySelector('input').style='font:28px system-ui;width:500px';` }); }
    finally { await client.close(); }
    assert(await verifyNativeBrowser(binding));
  }
  assert.equal(new Set(browsers.map(item => item.assignment.desktopId)).size, 2);
  const receipt = { sourceCommit: metadata.sourceCommit, preparedAt: new Date().toISOString(), phase: 'prepared', browsers, expectedMarkers: { research: 'research-391', writing: 'writing-391' }, authenticatedViewerPixelsAndHumanInput: false, rootViewer: false, providerPrompts: 0 };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, sourceCommit: metadata.sourceCommit, desktops: browsers.map(item => ({ name: item.desktopName, browserId: item.browserId, pid: item.pid, url: `https://auracall.ecochran.dyndns.org/desktops?desktop=${item.desktopName}&browser=${item.browserId}` })) }));
} else {
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8')) as { sourceCommit: string; browsers: Binding[]; expectedMarkers: Record<string, string>; [key: string]: unknown };
  assert.equal(receipt.sourceCommit, metadata.sourceCommit, 'Installed identity changed.'); browsers = receipt.browsers;
  const values: Record<string, string> = {};
  const cleanupIdentities: Array<{ pid: number; processStart: string }> = [];
  if (phase === 'cleanup') {
    // Capture the whole attributable process groups before closing their leaders.
    const groups = new Set(browsers.map(item => String(item.pid)));
    for (const name of await fs.readdir('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const stat = await fs.readFile(`/proc/${name}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        if (groups.has(fields[2] ?? '') && fields[19]) cleanupIdentities.push({ pid: Number(name), processStart: fields[19] });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    assert(browsers.every(browser => cleanupIdentities.some(item => item.pid === browser.pid && item.processStart === browser.processStart)), 'Cannot attribute owned cleanup process groups.');
  }
  for (const binding of browsers) {
    assert(await verifyNativeBrowser(binding), 'Owned browser is absent or changed.');
    const retained = (await store.browsers()).find(item => item.browserId === binding.browserId);
    assert.deepEqual(retained, binding, 'Retained browser ownership changed.');
    const client = await CDP({ host: binding.cdpHost, port: binding.cdpPort });
    try {
      if (phase === 'cleanup') { try { await client.Browser.close(); } catch { /* Physical absence below must qualify a lost close reply. */ } }
      else {
        const result = await client.Runtime.evaluate({ expression: "document.querySelector('#marker').value", returnByValue: true });
        values[binding.desktopName] = String(result.result.value);
      }
    } finally { await client.close(); }
  }
  if (phase === 'verify') {
    assert.deepEqual(values, receipt.expectedMarkers, 'Human viewer input has not been verified on both desktops.');
    receipt.humanInputVerifiedAt = new Date().toISOString(); receipt.verifiedMarkerValues = values; receipt.phase = 'human-input-verified';
    // Root/pixel acceptance requires the operator's separate visual attestation.
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ sourceCommit: metadata.sourceCommit, actualHumanMarkerValues: values, rootViewerAttestation: 'pending', authenticatedPixelAttestation: 'pending' }));
  } else {
    const running = async (binding: { pid: number; processStart: string }) => {
      try { const stat = await fs.readFile(`/proc/${binding.pid}/stat`, 'utf8'); const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); return fields[19] === binding.processStart && !['Z', 'X'].includes(fields[0] ?? ''); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    };
    for (let attempt = 0; attempt < 50 && (await Promise.all(cleanupIdentities.map(running))).some(Boolean); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    assert(!(await Promise.all(cleanupIdentities.map(running))).some(Boolean), 'Owned acceptance browser remains running.');
    receipt.cleanedAt = new Date().toISOString(); receipt.remainingOwnedBrowserProcesses = 0; receipt.attributedCleanupProcesses = cleanupIdentities.length;
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ freshOsReadback: true, remainingOwnedBrowserProcesses: 0, attributedCleanupProcesses: cleanupIdentities.length, assignmentsRetained: true }));
  }
}
