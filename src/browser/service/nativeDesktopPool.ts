import type { RemoteViewDesktopConfig } from '../types.js';
import { RemoteViewApplication } from './remoteViewApplication.js';
import { NativeDesktopStore, type NativeDesktop } from './nativeDesktopStore.js';

/** Caller holds the pool lock through browser launch so concurrent demand cannot share a free slot. */
export async function selectPoolDesktop(config: RemoteViewDesktopConfig, store: NativeDesktopStore): Promise<NativeDesktop> {
  const app = new RemoteViewApplication(config);
  const pending = await store.pendingPoolAcquisition(config);
  if (pending) {
    const assignment = await app.acquire(config.poolName, pending.key, pending.label);
    const desktop = { ...config, desktopName: `desktop-${assignment.desktopId}`, assignment };
    await store.recordDesktop(desktop);
    await store.completePoolAcquisition(config);
  }
  const state = await app.poolState(config.poolName);
  const observed = [];
  for (const assignment of state.assignments) {
    // Observation failure is never proof that a slot is empty or justification for new capacity.
    observed.push({ assignment, count: await app.windowCount(assignment) });
  }
  const free = observed.find(item => item.count === 0);
  let assignment = free?.assignment;
  if (!assignment && state.reserved < state.maximum) {
    const request = await store.poolAcquisition(config);
    assignment = await app.acquire(config.poolName, request.key, request.label);
    const desktop = { ...config, desktopName: `desktop-${assignment.desktopId}`, assignment };
    await store.recordDesktop(desktop);
    await store.completePoolAcquisition(config);
  }
  assignment ??= observed.sort((a,b) => a.count-b.count || a.assignment.desktopId.localeCompare(b.assignment.desktopId))[0]?.assignment;
  if (!assignment) throw new Error('No healthy desktop is available in the configured pool.');
  const retained = (await store.desktops()).find(d => d.origin === config.origin && d.application === config.application && d.poolName === config.poolName && d.assignment.assignmentId === assignment.assignmentId && d.assignment.generation === assignment.generation);
  const desktop = { ...config, desktopName: retained?.desktopName ?? `desktop-${assignment.desktopId}`, assignment };
  await store.recordDesktop(desktop);
  return desktop;
}
