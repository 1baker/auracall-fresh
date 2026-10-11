import { NativeDesktopStore } from './nativeDesktopStore.js';
import { RemoteViewConfigSchema } from '../../schema/types.js';
import type { AgentBrowserRdpConfig, RemoteViewDesktopConfig } from '../types.js';

/** Resolve a named desktop once, before any browser I/O. Undefined preserves legacy behavior. */
export function resolveDesktopLaunch(input: {
  remoteView: unknown;
  desktop: unknown;
}): AgentBrowserRdpConfig | undefined {
  const config = input.remoteView === undefined ? undefined : RemoteViewConfigSchema.parse(input.remoteView);
  const name = input.desktop ?? (config?.pool ? undefined : config?.defaultDesktop);
  if (name === undefined) return undefined;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Desktop assignment must be a nonempty name.');
  if (name === 'root') return { enabled: false, runtimeProfile: 'root', desktopName: 'root' };
  const desktop = config && Object.hasOwn(config.desktops, name) ? config.desktops[name] : undefined;
  if (!desktop) throw new Error(`Unknown AuraCall desktop "${name}". Configure remoteView.desktops or select "root".`);
  if (desktop.poolName) return undefined;
  if (!desktop.runtimeProfile || !desktop.routePoolEntryId) throw new Error('Incomplete legacy desktop configuration.');
  return {
    enabled: true,
    runtimeProfile: desktop.runtimeProfile,
    routePoolEntryId: desktop.routePoolEntryId,
    desktopName: name,
    ...(desktop.command ? { command: desktop.command } : {}),
    ...(desktop.jobTimeoutMs ? { jobTimeoutMs: desktop.jobTimeoutMs } : {}),
  };
}

export function resolveNativeDesktopLaunch(input: { remoteView: unknown; desktop: unknown }): RemoteViewDesktopConfig | undefined {
  const config = input.remoteView === undefined ? undefined : RemoteViewConfigSchema.parse(input.remoteView);
  const name = input.desktop ?? (config?.pool ? undefined : config?.defaultDesktop);
  if (name === undefined && config?.pool) {
    if (!config.application) throw new Error('Automatic native pool requires remoteView.application configuration.');
    return { automatic: true, desktopName: 'auto', poolName: config.pool.name,
      origin: config.application.origin, publicOrigin: config.application.publicOrigin,
      appOrigin: config.application.appOrigin, application: config.application.name };
  }
  if (name === undefined || name === 'root') return undefined;
  if (typeof name !== 'string') throw new Error('Desktop assignment must be a name.');
  const desktop = config && Object.hasOwn(config.desktops, name) ? config.desktops[name] : undefined;
  if (!desktop?.poolName) return undefined;
  if (!config?.application) throw new Error('Native desktop requires remoteView.application configuration.');
  return { desktopName: name, poolName: desktop.poolName, origin: config.application.origin,
    publicOrigin: config.application.publicOrigin, appOrigin: config.application.appOrigin, application: config.application.name };
}

/** Read-only catalog expansion from retained ownership; discovery never allocates. */
export async function effectiveDesktopConfig(remoteView: unknown) {
  const config = RemoteViewConfigSchema.parse(remoteView ?? {});
  if (!config.pool || !config.application) return config;
  for (const desktop of await new NativeDesktopStore().desktops()) {
    if (desktop.origin !== config.application.origin || desktop.application !== config.application.name || desktop.poolName !== config.pool.name) continue;
    if (Object.hasOwn(config.desktops, desktop.desktopName)) {
      if (config.desktops[desktop.desktopName]?.poolName !== desktop.poolName) throw new Error('Retained desktop conflicts with explicit configuration.');
      continue;
    }
    config.desktops[desktop.desktopName] = { poolName: desktop.poolName, label: `Desktop ${desktop.assignment.desktopId.slice(0,8)}` };
  }
  return config;
}
