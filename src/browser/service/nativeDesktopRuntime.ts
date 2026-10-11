import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { launchChrome as launchChromeCore } from '../../../packages/browser-service/src/chromeLifecycle.js';
import { findChromeProcessUsingUserDataDir } from '../../../packages/browser-service/src/processCheck.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import type { BrowserLogger, ResolvedBrowserConfig } from '../types.js';
import { RemoteViewApplication } from './remoteViewApplication.js';
import { NativeDesktopStore, nativeDesktopKey, observeNativeBrowser, verifyNativeBrowser, type NativeDesktopBrowser } from './nativeDesktopStore.js';
import { DesktopControlGate } from './desktopControlGate.js';

interface NativeChromeHandle { pid?: number; port: number; host?: string; kill: () => Promise<unknown> }
type NativeLaunch = (config: ResolvedBrowserConfig, directory: string, logger: BrowserLogger, options: Parameters<typeof launchChromeCore>[3]) => Promise<NativeChromeHandle>;

async function expectedNativeExecutable(config: ResolvedBrowserConfig): Promise<string> {
  const chromePath = config.chromePath?.trim();
  if (!chromePath) throw new Error('Native Remote View requires a resolved local Chrome or Chromium executable path.');
  const expectedPath = await fs.realpath(chromePath);
  const sibling = path.join(path.dirname(expectedPath), 'chrome');
  return path.basename(expectedPath).startsWith('google-chrome') && await fs.stat(sibling).then(stat => stat.isFile(), () => false)
    ? fs.realpath(sibling) : expectedPath;
}

export async function findNativeDesktopBrowser(config: ResolvedBrowserConfig, userDataDir: string, store = new NativeDesktopStore()): Promise<NativeDesktopBrowser | undefined> {
  const selected = config.remoteViewDesktop;
  if (!selected) throw new Error('Native desktop is not configured.');
  const bindings = (await store.browsers()).filter(binding => path.resolve(binding.managedProfileDir) === path.resolve(userDataDir));
  if (bindings.length > 1) throw new Error('Native browser ownership is ambiguous.');
  const binding = bindings[0];
  if (!binding) return undefined;
  if (!await verifyNativeBrowser(binding)) return undefined;
  if (binding.executable !== await expectedNativeExecutable(config)) throw new Error('Native browser build reuse conflicts with the selected executable.');
  if (nativeDesktopKey(binding) !== nativeDesktopKey(selected)) throw new Error('Managed browser is bound to a different native desktop; close it explicitly before reassignment.');
  const app = new RemoteViewApplication(selected);
  const ready = (await app.listReadyAssignments(selected.poolName)).filter(item => item.assignmentId === binding.assignment.assignmentId &&
    item.desktopId === binding.assignment.desktopId && item.generation === binding.assignment.generation);
  if (ready.length !== 1) throw new Error('Retained native desktop assignment is unavailable.');
  return { ...binding, assignment: ready[0] ?? binding.assignment };
}

export async function launchNativeDesktopBrowser(input: {
  config: ResolvedBrowserConfig; userDataDir: string; logger: BrowserLogger; abortSignal?: AbortSignal;
  launch?: NativeLaunch; observe?: typeof observeNativeBrowser;
}): Promise<NativeChromeHandle> {
  const { config, userDataDir, logger } = input;
  const selected = config.remoteViewDesktop;
  if (!selected) throw new Error('Native desktop is not configured.');
  if (process.platform !== 'linux' || /\\\\|^[A-Za-z]:/.test(config.chromePath ?? '')) throw new Error('Native Remote View requires a local Linux browser.');
  const expectedExecutable = await expectedNativeExecutable(config);
  const store = new NativeDesktopStore();
  const app = new RemoteViewApplication(selected);
  input.abortSignal?.throwIfAborted();
  return store.exclusive(`profile:${path.resolve(userDataDir)}`, async () => {
    const previous = await findNativeDesktopBrowser(config, userDataDir, store);
    if (previous) return { pid: previous.pid, port: previous.cdpPort, host: previous.cdpHost, kill: async () => { logger('Keeping AuraCall native desktop browser running.'); } };
    const unretained = await findChromeProcessUsingUserDataDir(userDataDir);
    if (unretained) throw new Error('A running browser has no matching native desktop receipt; refusing unverified reuse.');
    const desktop = await store.exclusive(`desktop:${nativeDesktopKey(selected)}`, async () => {
      const retained = await store.desktop(selected);
      if (retained) {
        const ready = (await app.listReadyAssignments(selected.poolName)).find(item => item.assignmentId === retained.assignment.assignmentId && item.desktopId === retained.assignment.desktopId && item.generation === retained.assignment.generation);
        if (!ready) throw new Error('Retained native desktop is unavailable; root fallback is prohibited.');
        return { ...retained, assignment: ready };
      }
      const assignment = await app.acquire(selected.poolName, `auracall-desktop-${nativeDesktopKey(selected)}`, selected.desktopName);
      const created = { desktopName: selected.desktopName, origin: selected.origin, application: selected.application, poolName: selected.poolName, assignment };
      await store.recordDesktop(created);
      return created;
    });
    const gate = new DesktopControlGate(desktop.assignment.desktopId);
    return gate.withAutomation(`launch:${nativeDesktopKey(selected)}`, async () => {
      input.abortSignal?.throwIfAborted();
      const environment = await app.launchEnvironment(desktop.assignment);
      const chrome = await (input.launch ?? launchChromeCore)({ ...config, display: environment.DISPLAY, headless: false, hideWindow: false, keepBrowser: true,
        blockingProfileAction: 'fail', remoteChrome: null }, userDataDir, logger, { registryPath: path.join(getAuracallHomeDir(), 'browser-state.json'), launchEnvironment: environment, abortSignal: input.abortSignal });
      try {
        if (!chrome.pid) throw new Error('Native browser launch returned no attributable process.');
        const observed = await (input.observe ?? observeNativeBrowser)(chrome.pid, userDataDir, environment.DISPLAY ?? '', { ...selected, assignment: desktop.assignment });
        if (observed.executable !== expectedExecutable) throw new Error('Native browser executable does not match the selected browser build.');
        await store.recordBrowser({ ...desktop, browserId: randomUUID(), managedProfileDir: userDataDir,
          pid: chrome.pid, ...observed, display: environment.DISPLAY ?? '', cdpHost: chrome.host ?? '127.0.0.1', cdpPort: chrome.port });
      } catch (error) { await chrome.kill(); throw error; }
      return { ...chrome, kill: async () => { logger('Keeping AuraCall native desktop browser running.'); } };
    });
  });
}
