import { RemoteViewApplication, type RemoteViewAssignment, type RemoteViewRetirement } from './remoteViewApplication.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAuracallHomeDir } from '../../auracallHome.js';
import type { RemoteViewDesktopConfig } from '../types.js';

const assignmentSchema = z.object({ assignmentId: z.string().min(1), desktopId: z.string().min(1), generation: z.number().int().positive(), viewingGeneration: z.number().int().positive() });
const desktopSchema = z.object({ desktopName: z.string(), application: z.string(), origin: z.string(), poolName: z.string(), assignment: assignmentSchema });
const browserSchema = desktopSchema.extend({ browserId: z.string(), managedProfileDir: z.string(), pid: z.number().int().positive(),
  processStart: z.string(), bootId: z.string(), executable: z.string(), display: z.string(), cdpHost: z.string(), cdpPort: z.number().int().min(1).max(65535) });
export type NativeDesktop = z.infer<typeof desktopSchema>;
export type NativeDesktopBrowser = z.infer<typeof browserSchema>;
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function nativeDesktopKey(config: Pick<RemoteViewDesktopConfig, 'origin' | 'application' | 'poolName' | 'desktopName'>): string {
  return digest(JSON.stringify([config.origin, config.application, config.poolName, config.desktopName]));
}
export function nativeBrowserGeneration(binding: NativeDesktopBrowser): string { return digest(JSON.stringify(binding)); }

export class NativeDesktopStore {
  constructor(private readonly directory = path.join(getAuracallHomeDir(), 'native-desktops')) {}
  private async write(name: string, value: unknown): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
    try { await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, path.join(this.directory, name)); }
    finally { await fs.rm(temp, { force: true }); }
  }
  async desktop(config: RemoteViewDesktopConfig): Promise<NativeDesktop | undefined> {
    try { return desktopSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory, `desktop-${nativeDesktopKey(config)}.json`), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async recordDesktop(desktop: NativeDesktop): Promise<void> { await this.write(`desktop-${nativeDesktopKey(desktop)}.json`, desktopSchema.parse(desktop)); }
  async recordBrowser(browser: NativeDesktopBrowser): Promise<void> { await this.write(`browser-${digest(path.resolve(browser.managedProfileDir))}.json`, browserSchema.parse(browser)); }
  async browsers(): Promise<NativeDesktopBrowser[]> {
    const names = await fs.readdir(this.directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    return Promise.all(names.filter(name => /^browser-[a-f0-9]{64}\.json$/.test(name)).map(async name => browserSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8')))));
  }
  async desktops(): Promise<NativeDesktop[]> {
    const names = await fs.readdir(this.directory).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
    return Promise.all(names.filter(n => /^desktop-[a-f0-9]{64}\.json$/.test(n)).map(async n => desktopSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory, n), 'utf8')))));
  }
  async pendingPoolAcquisition(config: RemoteViewDesktopConfig): Promise<{ key: string; label: string } | undefined> {
    const name = `pool-acquire-${digest(JSON.stringify([config.origin, config.application, config.poolName]))}.json`;
    try { return z.object({ key: z.string().min(1), label: z.string().min(1) }).parse(JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'))); }
    catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
  }
  async poolAcquisition(config: RemoteViewDesktopConfig): Promise<{ key: string; label: string }> {
    const name = `pool-acquire-${digest(JSON.stringify([config.origin, config.application, config.poolName]))}.json`;
    try { return z.object({ key: z.string().min(1), label: z.string().min(1) }).parse(JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'))); }
    catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const pending = { key: `auracall-pool-${randomUUID()}`, label: 'AuraCall desktop' };
    await this.write(name, pending); return pending;
  }
  async completePoolAcquisition(config: RemoteViewDesktopConfig): Promise<void> {
    await fs.rm(path.join(this.directory, `pool-acquire-${digest(JSON.stringify([config.origin, config.application, config.poolName]))}.json`), { force: true });
  }
  async forgetDesktop(desktop: NativeDesktop): Promise<void> {
    const current = await this.desktop({ ...desktop, publicOrigin: 'https://unused.test', appOrigin: 'https://unused.test' });
    if (current && JSON.stringify(current.assignment) === JSON.stringify(desktop.assignment)) await fs.rm(path.join(this.directory, `desktop-${nativeDesktopKey(desktop)}.json`));
  }
  async recordPoolRelease(record: { key: string; desktop: NativeDesktop; retirement: RemoteViewRetirement }): Promise<void> {
    await this.write(`pool-release-${digest(record.key)}.json`, record);
  }
  async poolReleases(): Promise<Array<{ key: string; desktop: NativeDesktop; retirement: RemoteViewRetirement }>> {
    const names = await fs.readdir(this.directory).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
    const schema = z.object({ key: z.string().min(1), desktop: desktopSchema, retirement: z.object({ schemaVersion: z.literal(1), desktopId: z.string().min(1), generation: z.number().int().positive(), routes: z.array(z.string()), sessions: z.array(z.string()) }) });
    return Promise.all(names.filter(n => /^pool-release-[a-f0-9]{64}\.json$/.test(n)).map(async n => schema.parse(JSON.parse(await fs.readFile(path.join(this.directory,n),'utf8')))));
  }
  async completePoolRelease(key: string): Promise<void> { await fs.rm(path.join(this.directory, `pool-release-${digest(key)}.json`), { force: true }); }
  async hasOtherOperations(poolLock: string): Promise<boolean> {
    const names = await fs.readdir(this.directory);
    return names.some(n => n.startsWith('lock-') && n !== `lock-${digest(poolLock)}`);
  }
  async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, `lock-${digest(key)}`);
    const owner = { id: randomUUID(), pid: process.pid };
    const acquire = async () => {
      await fs.mkdir(lock, { mode: 0o700 });
      try { await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify(owner), { mode: 0o600, flag: 'wx' }); }
      catch(e) { await fs.rm(lock, { recursive: true }); throw e; }
    };
    try { await acquire(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (process.platform !== 'linux') throw new Error('Native desktop operation is busy; owner absence is not qualified on this platform.');
      const reconcile = `${lock}.reconcile`;
      try { await fs.mkdir(reconcile, { mode: 0o700 }); }
      catch { throw new Error('Native desktop operation is busy; inspect retained ownership before retrying.'); }
      try {
        const previous = z.object({ id: z.string().uuid(), pid: z.number().int().positive() }).parse(JSON.parse(await fs.readFile(path.join(lock,'owner.json'),'utf8')));
        try { await fs.access(`/proc/${previous.pid}`); throw new Error('Native desktop operation is busy; original owner is still present.'); }
        catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        // The reconciliation lock prevents two stale readers from removing a newly acquired generation.
        await fs.rename(lock, path.join(this.directory, `retired-lock-${previous.id}`));
        try { await acquire(); } catch { throw new Error('Native desktop operation is busy; another process acquired it during reconciliation.'); }
      } finally { await fs.rm(reconcile, { recursive: true }); }
    }
    try { return await operation(); }
    finally {
      const current = JSON.parse(await fs.readFile(path.join(lock,'owner.json'),'utf8'));
      if (current.id === owner.id) await fs.rm(lock, { recursive: true });
    }
  }
}

async function readNativeBrowserProcess(pid: number, managedProfileDir: string, display: string) {
  const [stat, command, environment, bootId, executable] = await Promise.all([
    fs.readFile(`/proc/${pid}/stat`, 'utf8'), fs.readFile(`/proc/${pid}/cmdline`, 'utf8'), fs.readFile(`/proc/${pid}/environ`, 'utf8'),
    fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'), fs.realpath(`/proc/${pid}/exe`),
  ]);
  const processStart = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const argv = command.split('\0').filter(Boolean);
  const escapedDirectory = managedProfileDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Chromium can replace argv with a flattened process title and erase environ.
  // Interaction requires a current window join; opening uses retained process and assignment custody.
  const flattened = argv.length === 1 && new RegExp(`(?:^| )--user-data-dir=${escapedDirectory}(?= (?:--[A-Za-z0-9-]+(?:[= ]|$)|about:blank(?: |$))|$)`).test(argv[0] ?? '');
  const exactArgument = argv.some(arg => arg === `--user-data-dir=${managedProfileDir}`);
  if (!processStart || (!exactArgument && !flattened)) throw new Error('Native browser process/profile/desktop ownership mismatch.');
  const displayRetained = environment.split('\0').includes(`DISPLAY=${display}`);
  return { identity: { processStart, bootId: bootId.trim(), executable },
    requiresWindow: flattened || !displayRetained,
    observedDisplay: environment.split('\0').find(item => item.startsWith('DISPLAY=')) };
}

export async function observeNativeBrowser(pid: number, managedProfileDir: string, display: string, context?: { origin: string; application: string; assignment: RemoteViewAssignment }): Promise<Pick<NativeDesktopBrowser, 'processStart' | 'bootId' | 'executable'>> {
  const observed = await readNativeBrowserProcess(pid, managedProfileDir, display);
  if (observed.requiresWindow) {
    if (!context || !await new RemoteViewApplication(context).hasBrowserWindow(context.assignment, pid)) {
      throw new Error('Native browser process/profile/desktop ownership mismatch.');
    }
  }
  return observed.identity;
}

/** Retained launch custody permits opening a window; current windows qualify later interaction. */
export async function verifyNativeBrowserForOpening(binding: NativeDesktopBrowser): Promise<boolean> {
  try {
    const observed = await readNativeBrowserProcess(binding.pid, binding.managedProfileDir, binding.display);
    const current = observed.identity;
    if (current.processStart !== binding.processStart || current.bootId !== binding.bootId ||
      current.executable !== binding.executable ||
      (observed.observedDisplay && observed.observedDisplay !== `DISPLAY=${binding.display}`)) return false;
    if (observed.requiresWindow) {
      const environment = await new RemoteViewApplication(binding).launchEnvironment(binding.assignment);
      if (environment.DISPLAY !== binding.display) throw new Error('Native browser desktop display ownership changed.');
    }
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function verifyNativeBrowser(binding: NativeDesktopBrowser): Promise<boolean> {
  try {
    const [stat, boot] = await Promise.all([fs.readFile(`/proc/${binding.pid}/stat`, 'utf8'), fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')]);
    if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] !== binding.processStart || boot.trim() !== binding.bootId) return false;
    const current = await observeNativeBrowser(binding.pid, binding.managedProfileDir, binding.display, binding);
    return current.processStart === binding.processStart && current.bootId === binding.bootId && current.executable === binding.executable;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** A config change cannot move an existing process to root by reusing its CDP port. */
export async function assertNoLiveNativeDesktopBrowser(managedProfileDir: string, endpoint?: { host?: string; port?: number }): Promise<void> {
  const canonical = (host: string | undefined) => host === 'localhost' ? '127.0.0.1' : host;
  const candidates = (await new NativeDesktopStore().browsers()).filter(binding =>
    path.resolve(binding.managedProfileDir) === path.resolve(managedProfileDir) ||
    (endpoint?.port === binding.cdpPort && canonical(endpoint.host ?? '127.0.0.1') === canonical(binding.cdpHost)));
  for (const binding of candidates) {
    if (await verifyNativeBrowserForOpening(binding)) throw new Error('This browser is still bound to a native desktop. Close it explicitly before selecting root or changing desktop placement.');
  }
}
