import { createHash } from 'node:crypto';
import { setCdpCommandAdmissionResolver } from '../../../packages/browser-service/src/guardedCdp.js';
import { DesktopBindingStore, type DesktopBinding } from './desktopBindings.js';
import { NativeDesktopStore, nativeBrowserGeneration, verifyNativeBrowser } from './nativeDesktopStore.js';
import { DesktopControlGate } from './desktopControlGate.js';

export function desktopBindingGeneration(binding: DesktopBinding): string {
  return createHash('sha256').update(JSON.stringify([
    binding.browserId, binding.session, binding.managedProfileDir,
    binding.routePoolEntryId, binding.routeId, binding.displayAllocationId,
    binding.cdpHost, binding.cdpPort,
  ])).digest('hex');
}

setCdpCommandAdmissionResolver(async ({ host, port }) => {
  const store = new DesktopBindingStore();
  const canonicalHost = (value: string | undefined) => value === 'localhost' ? '127.0.0.1' : value;
  const bindings = (await store.list()).filter((binding) => canonicalHost(binding.cdpHost) === canonicalHost(host) && binding.cdpPort === port);
  const nativeStore = new NativeDesktopStore();
  const nativeCandidates = (await nativeStore.browsers()).filter(binding => canonicalHost(binding.cdpHost) === canonicalHost(host) && binding.cdpPort === port);
  const native = [];
  for (const candidate of nativeCandidates) if (await verifyNativeBrowser(candidate)) native.push(candidate);
  if (native.length && bindings.length) throw new Error('Conflicting legacy and native desktop endpoint ownership.');
  if (native.length) {
    if (native.length !== 1 || !native[0]) throw new Error('Ambiguous native desktop endpoint ownership.');
    const binding = native[0];
    const generation = nativeBrowserGeneration(binding);
    const gate = new DesktopControlGate(binding.assignment.desktopId);
    return { run: async (_command, effect) => gate.withAutomation(generation, async () => {
      const current = (await nativeStore.browsers()).filter(item => item.managedProfileDir === binding.managedProfileDir);
      if (current.length !== 1 || !current[0] || nativeBrowserGeneration(current[0]) !== generation || !await verifyNativeBrowser(binding)) {
        throw new Error('Native desktop browser ownership changed; reconnect before automation.');
      }
      return effect();
    }) };
  }
  if (!bindings.length) return undefined;
  if (bindings.length !== 1) throw new Error('Ambiguous AuraCall desktop endpoint ownership.');
  const binding = bindings[0];
  const generation = desktopBindingGeneration(binding);
  const gate = new DesktopControlGate(binding.displayAllocationId);
  return { run: async (_command, effect) => gate.withAutomation(generation, async () => {
    const current = (await store.list()).filter((item) => item.managedProfileDir === binding.managedProfileDir);
    if (current.length !== 1 || desktopBindingGeneration(current[0]) !== generation) {
      throw new Error('AuraCall desktop browser ownership changed; reconnect before resuming automation.');
    }
    return effect();
  }) };
});
