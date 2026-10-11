import { RemoteViewApplication, type RemoteViewAssignment } from './remoteViewApplication.js';
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
  async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, `lock-${digest(key)}`);
    try { await fs.mkdir(lock, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Native desktop operation is busy; inspect retained ownership before retrying.'); throw error; }
    try { return await operation(); } finally { await fs.rm(lock, { recursive: true }); }
  }
}

export async function observeNativeBrowser(pid: number, managedProfileDir: string, display: string, context?: { origin: string; application: string; assignment: RemoteViewAssignment }): Promise<Pick<NativeDesktopBrowser, 'processStart' | 'bootId' | 'executable'>> {
  const [stat, command, environment, bootId, executable] = await Promise.all([
    fs.readFile(`/proc/${pid}/stat`, 'utf8'), fs.readFile(`/proc/${pid}/cmdline`, 'utf8'), fs.readFile(`/proc/${pid}/environ`, 'utf8'),
    fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'), fs.realpath(`/proc/${pid}/exe`),
  ]);
  const processStart = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const argv = command.split('\0').filter(Boolean);
  const escapedDirectory = managedProfileDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Chromium can replace argv with a flattened process title and erase environ.
  // That representation requires a separate current native window/PID join.
  const flattened = argv.length === 1 && new RegExp(`(?:^| )--user-data-dir=${escapedDirectory}(?= (?:--[A-Za-z0-9-]+(?:[= ]|$)|about:blank(?: |$))|$)`).test(argv[0] ?? '');
  const exactArgument = argv.some(arg => arg === `--user-data-dir=${managedProfileDir}`);
  if (!processStart || (!exactArgument && !flattened)) throw new Error('Native browser process/profile/desktop ownership mismatch.');
  const displayRetained = environment.split('\0').includes(`DISPLAY=${display}`);
  if (flattened || !displayRetained) {
    if (!context || !await new RemoteViewApplication(context).hasBrowserWindow(context.assignment, pid)) {
      throw new Error('Native browser process/profile/desktop ownership mismatch.');
    }
  }
  return { processStart, bootId: bootId.trim(), executable };
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
    if (await verifyNativeBrowser(binding)) throw new Error('This browser is still bound to a native desktop. Close it explicitly before selecting root or changing desktop placement.');
  }
}
