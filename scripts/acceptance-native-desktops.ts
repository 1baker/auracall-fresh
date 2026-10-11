#!/usr/bin/env tsx
// Opt-in installed native acceptance. Opens only local marker pages, never providers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getAuracallHomeDir, setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { DEFAULT_BROWSER_CONFIG } from '../src/browser/config.js';
import { launchChrome } from '../src/browser/chromeLifecycle.js';
import CDP from '../src/browser/cdp.js';
import { connectGuardedPuppeteer } from '../packages/browser-service/src/guardedPuppeteer.js';
import { NativeDesktopStore, verifyNativeBrowser } from '../src/browser/service/nativeDesktopStore.js';
import { listDesktopViews, openDesktopView, takeDesktopControl, releaseDesktopControl } from '../src/browser/service/desktopClient.js';

if (process.env.AURACALL_NATIVE_DESKTOP_ACCEPTANCE !== '1') throw new Error('Set AURACALL_NATIVE_DESKTOP_ACCEPTANCE=1 for bounded installed desktop/browser effects.');
const home = path.join(getAuracallHomeDir(), 'plan0391-native-acceptance');
await fs.mkdir(home, { recursive: true, mode: 0o700 });
setAuracallHomeDirOverrideForTest(home);
const remoteView = { application: { origin: 'http://127.0.0.1:19096', publicOrigin: 'https://remote-view.ecochran.dyndns.org', appOrigin: 'https://auracall.ecochran.dyndns.org', name: 'auracall' }, defaultDesktop: 'research', desktops: { research: { poolName: 'main' }, writing: { poolName: 'main' } }, rootDesktopUrl: 'https://remote-view.ecochran.dyndns.org' };
const clients: Awaited<ReturnType<typeof CDP>>[] = [];
const bindings: Awaited<ReturnType<NativeDesktopStore['browsers']>> = [];
let claim: { name: string; browserId: string; token: string } | undefined;
try {
  for (const desktopName of ['research', 'writing']) {
    const config = { ...DEFAULT_BROWSER_CONFIG, browserFamily: 'chrome' as const, browserBuild: 'stock_chrome' as const, chromePath: '/usr/bin/google-chrome', manualLogin: true, url: 'about:blank',
      remoteViewDesktop: { desktopName, poolName: 'main', application: 'auracall', origin: remoteView.application.origin, publicOrigin: remoteView.application.publicOrigin, appOrigin: remoteView.application.appOrigin } };
    const userDataDir = path.join(home, 'browser-profiles', desktopName);
    const handle = await launchChrome(config, userDataDir, message => console.error(message));
    const binding = (await new NativeDesktopStore().browsers()).find(item => item.managedProfileDir === userDataDir);
    assert(binding, 'Missing native browser receipt'); bindings.push(binding);
    const client = await CDP({ host: handle.host ?? '127.0.0.1', port: handle.port }); clients.push(client);
    await client.Runtime.evaluate({ expression: `document.body.innerHTML='<h1>AuraCall ${desktopName} acceptance</h1><input aria-label="Native control marker" id="marker">';document.body.style='background:#14223a;color:white;font:28px system-ui;padding:40px';document.title='AuraCall ${desktopName}';` });
    assert(await verifyNativeBrowser(binding));
    const reused = await launchChrome(config, userDataDir, () => {});
    assert.equal(reused.pid, handle.pid);
  }
  assert.equal(new Set(bindings.map(binding => binding.assignment.desktopId)).size, 2);
  const catalog = await listDesktopViews({ remoteView });
  assert(catalog.desktops.every(desktop => desktop.state === 'ready' && desktop.browsers.length === 1));
  const first = bindings[0]; const client = clients[0]; assert(first && client);
  assert.equal((await openDesktopView({ remoteView, name: 'research', browserId: first.browserId })).capability, 'observe');
  const puppeteerBrowser = await connectGuardedPuppeteer({ browserURL: `http://${first.cdpHost}:${first.cdpPort}`, defaultViewport: null });
  const puppeteerPage = (await puppeteerBrowser.pages())[0]; assert(puppeteerPage);
  assert.equal(await puppeteerPage.evaluate(() => document.title), 'AuraCall research');
  await assert.rejects(launchChrome({ ...DEFAULT_BROWSER_CONFIG, remoteViewDesktop: undefined }, first.managedProfileDir, () => {}), /still bound/);
  claim = { name: 'research', browserId: first.browserId, token: randomUUID() };
  const control = await takeDesktopControl({ remoteView, ...claim }); assert.equal(control.capability, 'control');
  await assert.rejects(puppeteerPage.evaluate(() => { const input = document.querySelector('input'); if (!input) throw new Error('Missing marker'); input.value = 'puppeteer-during-human'; }), /paused/);
  await assert.rejects(connectGuardedPuppeteer({ browserURL: `http://${first.cdpHost}:${first.cdpPort}` }), /paused/);
  await assert.rejects(client.Runtime.evaluate({ expression: "document.querySelector('#marker').value='automation-during-human'" }), /paused/);
  await releaseDesktopControl({ remoteView, ...claim }); claim = undefined;
  await client.Runtime.evaluate({ expression: "document.querySelector('#marker').value='automation-resumed'" });
  assert.equal(await puppeteerPage.evaluate(() => document.querySelector('input')?.value), 'automation-resumed');
  await puppeteerBrowser.disconnect();
  const observed = await client.Runtime.evaluate({ expression: "document.querySelector('#marker').value", returnByValue: true });
  assert.equal(observed.result.value, 'automation-resumed');
  const receipt = { schemaVersion: 1, twoNativeDesktops: true, selectedExecutable: '/usr/bin/google-chrome', exactProcessOwnership: true, reusePreservesPid: true, observeGrant: true, takeoverBlocksActualCdp: true, takeoverBlocksActualPuppeteer: true, rootRejectsLiveNativeReuse: true, revokeBeforeResume: true, authenticatedViewerPixelsAndHumanInput: false, providerPrompts: 0, infrastructureProvisioned: false,
    browsers: bindings.map(binding => ({ browserId: binding.browserId, desktopName: binding.desktopName, assignment: binding.assignment, pid: binding.pid, cdpPort: binding.cdpPort })) };
  await fs.writeFile(path.join(home, 'acceptance.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} finally {
  if (claim) { try { await releaseDesktopControl({ remoteView, ...claim }); claim = undefined; } catch { console.error('Control release remains unconfirmed; preserved pause and browsers for inspection.'); } }
  if (!claim) {
    for (const client of clients) { try { await client.Browser.close(); } catch {} }
    const originalProcessRunning = async (binding: (typeof bindings)[number]): Promise<boolean> => {
      try {
        const stat = await fs.readFile(`/proc/${binding.pid}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        return fields[19] === binding.processStart && !['Z', 'X'].includes(fields[0] ?? '');
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    };
    for (let attempt = 0; attempt < 50 && (await Promise.all(bindings.map(originalProcessRunning))).some(Boolean); attempt++) await delay(100);
    assert(!(await Promise.all(bindings.map(originalProcessRunning))).some(Boolean), 'Owned acceptance browser remains running');
    console.log(JSON.stringify({ freshOsReadback: true, remainingOwnedBrowserProcesses: 0 }));
  }
  for (const client of clients) { try { await client.close(); } catch {} }
  setAuracallHomeDirOverrideForTest(null);
}
