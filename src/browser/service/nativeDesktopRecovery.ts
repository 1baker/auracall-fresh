import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ResolvedBrowserConfig } from '../types.js';
import { isDevToolsResponsive } from '../../../packages/browser-service/src/processCheck.js';
import { RemoteViewApplication } from './remoteViewApplication.js';
import { NativeDesktopStore, nativeDesktopKey, observeNativeBrowser, verifyNativeBrowserForOpening } from './nativeDesktopStore.js';
import { expectedNativeExecutable } from './nativeDesktopRuntime.js';

/** Read the listening socket from the selected process, never from a stale registry. */
async function ownedEndpoint(pid: number, directory: string): Promise<number> {
  const args = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
  const configured = args.find(arg => arg.startsWith('--remote-debugging-port='))?.split('=')[1];
  const port = Number(configured && configured !== '0' ? configured : (await fs.readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Replacement browser has no qualified DevTools port.');
  const links = await Promise.all((await fs.readdir(`/proc/${pid}/fd`)).map(name => fs.readlink(`/proc/${pid}/fd/${name}`).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error;
  })));
  const sockets = new Set(links.map(link => /^socket:\[(\d+)\]$/.exec(link)?.[1]).filter(Boolean));
  const tables = await Promise.all(['tcp', 'tcp6'].map(name => fs.readFile(`/proc/${pid}/net/${name}`, 'utf8')));
  const owners = tables.flatMap(table => table.split('\n').slice(1)).filter(line => {
    const fields = line.trim().split(/\s+/);
    const [host, hexadecimalPort] = (fields[1] ?? '').split(':');
    return fields[3] === '0A' && Number.parseInt(hexadecimalPort ?? '', 16) === port &&
      (host === '0100007F' || host === '00000000000000000000000001000000') && sockets.has(fields[9]);
  });
  if (owners.length !== 1) throw new Error('Replacement DevTools endpoint is not uniquely owned by the selected process on loopback.');
  return port;
}

/** Explicit recovery only: no launch, close, navigation, assignment or input-control effects. */
export async function reconcileNativeDesktopBrowser(input: {
  config: Pick<ResolvedBrowserConfig, 'chromePath' | 'remoteViewDesktop'>; userDataDir: string; pid: number;
}): Promise<{ state: 'reconciled'; browserId: string }> {
  if (process.platform !== 'linux' || !Number.isSafeInteger(input.pid) || input.pid <= 0) throw new Error('Native reconciliation requires an exact local Linux PID.');
  const selected = input.config.remoteViewDesktop;
  if (!selected) throw new Error('Native reconciliation requires a configured native desktop.');
  const store = new NativeDesktopStore();
  return store.exclusive(`profile:${path.resolve(input.userDataDir)}`, async () => {
    const bindings = (await store.browsers()).filter(binding => path.resolve(binding.managedProfileDir) === path.resolve(input.userDataDir));
    const previous = bindings.length === 1 ? bindings[0] : undefined;
    if (!previous) throw new Error('Native reconciliation requires one retained browser receipt.');
    if (selected.automatic ? previous.origin !== selected.origin || previous.application !== selected.application || previous.poolName !== selected.poolName : nativeDesktopKey(previous) !== nativeDesktopKey(selected)) throw new Error('Native reconciliation cannot change desktop placement.');
    // A failed verification is not proof of death; require actual absence of the old PID.
    try { await fs.access(`/proc/${previous.pid}`); throw new Error('Retained browser process still exists; reconciliation is refused.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const app = new RemoteViewApplication(selected);
    const assignments = (await app.listReadyAssignments(selected.poolName)).filter(item => item.assignmentId === previous.assignment.assignmentId && item.desktopId === previous.assignment.desktopId && item.generation === previous.assignment.generation);
    const assignment = assignments.length === 1 ? assignments[0] : undefined;
    if (!assignment || assignment.viewingGeneration !== previous.assignment.viewingGeneration) throw new Error('Retained native desktop assignment generation is unavailable.');
    const environment = await app.launchEnvironment(assignment);
    if (environment.DISPLAY !== previous.display) throw new Error('Native reconciliation cannot change desktop display.');
    const context = { ...previous, assignment };
    const observed = await observeNativeBrowser(input.pid, input.userDataDir, previous.display, context);
    if (observed.executable !== await expectedNativeExecutable(input.config)) throw new Error('Replacement browser executable does not match the selected browser build.');
    if (!await app.hasBrowserWindow(assignment, input.pid)) throw new Error('Replacement browser has no current window on the retained desktop.');
    const port = await ownedEndpoint(input.pid, input.userDataDir);
    if (!await isDevToolsResponsive({ host: '127.0.0.1', port, timeoutMs: 1000 })) throw new Error('Replacement DevTools endpoint is not ready.');
    const current = await observeNativeBrowser(input.pid, input.userDataDir, previous.display, context);
    if (JSON.stringify(current) !== JSON.stringify(observed) || port !== await ownedEndpoint(input.pid, input.userDataDir)) throw new Error('Replacement browser generation changed during reconciliation.');
    if (!await app.hasBrowserWindow(assignment, input.pid)) throw new Error('Replacement browser window disappeared during reconciliation.');
    const replacement = { ...previous, ...current, assignment, pid: input.pid, browserId: randomUUID(), cdpHost: '127.0.0.1', cdpPort: port };
    if (!await verifyNativeBrowserForOpening(replacement)) throw new Error('Replacement browser process/desktop ownership changed.');
    await store.recordBrowserReconciliation(previous, replacement);
    return { state: 'reconciled', browserId: replacement.browserId };
  });
}
