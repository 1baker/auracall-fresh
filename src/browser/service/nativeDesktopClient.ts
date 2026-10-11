import type { RemoteViewDesktopConfig } from '../types.js';
import { RemoteViewApplication } from './remoteViewApplication.js';
import { NativeDesktopStore, nativeDesktopKey, verifyNativeBrowser, type NativeDesktopBrowser } from './nativeDesktopStore.js';

export async function readyNativeDesktopBrowsers(selected: RemoteViewDesktopConfig, store = new NativeDesktopStore(), verify = verifyNativeBrowser): Promise<NativeDesktopBrowser[]> {
  const ready = await new RemoteViewApplication(selected).listReadyAssignments(selected.poolName);
  const bindings = (await store.browsers()).filter(binding => nativeDesktopKey(binding) === nativeDesktopKey(selected));
  const result: NativeDesktopBrowser[] = [];
  for (const binding of bindings) {
    const assignments = ready.filter(item => item.assignmentId === binding.assignment.assignmentId && item.desktopId === binding.assignment.desktopId && item.generation === binding.assignment.generation);
    if (assignments.length !== 1 || !assignments[0]) throw new Error('Retained AuraCall native desktop ownership is stale.');
    if (await verify(binding)) result.push({ ...binding, assignment: assignments[0] });
  }
  return result;
}

export async function nativeDesktopObserveView(selected: RemoteViewDesktopConfig, browserId: string): Promise<{ url: string; capability: 'observe' }> {
  const matches = (await readyNativeDesktopBrowsers(selected)).filter(binding => binding.browserId === browserId);
  if (matches.length !== 1 || !matches[0]) throw new Error('Select a ready AuraCall-owned native browser.');
  const url = await new RemoteViewApplication(selected).issueObserveEmbed(matches[0].assignment, selected);
  return { url, capability: 'observe' };
}
