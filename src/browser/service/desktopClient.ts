import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import CDP from "../cdp.js";
import { NativeDesktopControl } from './nativeDesktopControl.js';
import { resolveNativeDesktopLaunch } from './desktopConfig.js';
import { readyNativeDesktopBrowsers, nativeDesktopObserveView } from './nativeDesktopClient.js';
import { RemoteViewConfigSchema } from '../../schema/types.js';
import { DesktopBindingStore, type DesktopBinding } from './desktopBindings.js';
import { runAgentBrowserCommand, type AgentBrowserCommandRunner } from './agentBrowserRdpLauncher.js';

export { DesktopBindingStore } from './desktopBindings.js';
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function records(value: unknown): RecordValue[] { return Array.isArray(value) ? value.filter(record) : []; }
function collection(value: unknown): RecordValue[] { return record(value) ? Object.values(value).filter(record) : records(value); }

export interface DesktopView {
  name: string;
  presentation?: 'native';
  label: string;
  state: 'ready' | 'empty' | 'unavailable';
  message?: string;
  browsers: Array<{ browserId: string; handoffUrl: string }>;
}

async function query(command: string, args: string[], runner: AgentBrowserCommandRunner): Promise<RecordValue> {
  try {
    const result = await runner(command, ['--json', ...args], { timeoutMs: 15_000, maxOutputBytes: 16 * 1024 * 1024 });
    const envelope: unknown = JSON.parse(result.stdout);
    if (!record(envelope) || envelope.success !== true || !record(envelope.data)) throw new Error('Unavailable');
    return envelope.data;
  } catch {
    // Child-process errors may contain the full private service inventory.
    throw new Error('Agent Browser remote-view service is unavailable.');
  }
}

function matchesBrowser(binding: DesktopBinding, browser: RecordValue): boolean {
  return browser.id === binding.browserId && browser.health === 'ready' &&
    Array.isArray(browser.activeSessionIds) && browser.activeSessionIds.includes(binding.session) &&
    browser.displayAllocationId === binding.displayAllocationId && records(browser.viewStreams).some((stream) =>
      stream.provider === 'rdp_gateway' && stream.routeId === binding.routeId && stream.displayAllocationId === binding.displayAllocationId);
}

export async function listDesktopViews(input: {
  remoteView: unknown;
  store?: DesktopBindingStore;
  runner?: AgentBrowserCommandRunner;
}): Promise<{ defaultDesktop?: string; rootDesktopUrl?: string; desktops: DesktopView[] }> {
  const config = RemoteViewConfigSchema.parse(input.remoteView ?? {});
  const bindings = await (input.store ?? new DesktopBindingStore()).list();
  const runner = input.runner ?? runAgentBrowserCommand;
  const desktops: DesktopView[] = [];
  for (const [name, desktop] of Object.entries(config.desktops)) {
    const view: DesktopView = { name, label: desktop.label ?? name, state: 'empty', browsers: [] };
    try {
      if (desktop.poolName) {
        const selected = resolveNativeDesktopLaunch({ remoteView: config, desktop: name });
        if (!selected) throw new Error('Native desktop configuration is unavailable.');
        view.presentation = 'native';
        const nativeBrowsers = await readyNativeDesktopBrowsers(selected);
        view.browsers = nativeBrowsers.map(binding => ({ browserId: binding.browserId,
          handoffUrl: `/desktops?desktop=${encodeURIComponent(name)}&browser=${encodeURIComponent(binding.browserId)}` }));
        if (view.browsers.length) view.state = 'ready';
        desktops.push(view);
        continue;
      }
      const command = desktop.command ?? 'agent-browser';
      const status = await query(command, ['service', 'status'], runner);
      if (record(status.serviceStateProjection) && status.serviceStateProjection.complete === false) throw new Error('Desktop inventory is incomplete.');
      const state = record(status.service_state) ? status.service_state : {};
      const matches = collection(state.routePool).filter((route) => route.id === desktop.routePoolEntryId);
      const route = matches.length === 1 ? matches[0] : undefined;
      if (!route || route.provider !== 'rdp_gateway' || !['available', 'checked_out'].includes(String(route.state))) throw new Error('Configured desktop route is unavailable.');
      const candidates = bindings.filter((binding) => binding.desktopName === name && binding.routePoolEntryId === desktop.routePoolEntryId);
      for (const binding of candidates) {
        const target = record(route.target) ? route.target : {};
        const allocation = target.displayAllocationId ?? `remote-view-display:${String(route.routeId)}`;
        const browsers = collection(state.browsers).filter((browser) => matchesBrowser(binding, browser));
        if (route.routeId !== binding.routeId || allocation !== binding.displayAllocationId || browsers.length !== 1) throw new Error('Retained AuraCall browser ownership or display binding is stale.');
        view.browsers.push({ browserId: binding.browserId, handoffUrl: binding.handoffUrl });
      }
      if (view.browsers.length) view.state = 'ready';
    } catch (error) {
      view.state = 'unavailable';
      view.browsers = [];
      view.message = error instanceof Error ? error.message : 'Desktop unavailable.';
    }
    desktops.push(view);
  }
  return { defaultDesktop: config.defaultDesktop, rootDesktopUrl: config.rootDesktopUrl, desktops };
}

export async function captureDesktopView(input: {
  remoteView: unknown;
  name: string;
  browserId: string;
  store?: DesktopBindingStore;
  runner?: AgentBrowserCommandRunner;
}): Promise<{ imageBase64: string; width: number; height: number; capturedAt?: string }> {
  const config = RemoteViewConfigSchema.parse(input.remoteView ?? {});
  const desktop = Object.hasOwn(config.desktops, input.name) ? config.desktops[input.name] : undefined;
  if (!desktop) throw new Error('Unknown AuraCall desktop.');
  if (desktop.poolName) throw new Error('Use the native viewer for this desktop.');
  const store = input.store ?? new DesktopBindingStore();
  const views = await listDesktopViews({ ...input, store });
  const view = views.desktops.find((item) => item.name === input.name);
  if (view?.state !== 'ready' || !view.browsers.some((browser) => browser.browserId === input.browserId)) {
    throw new Error(view?.message ?? 'No ready AuraCall-owned browser exists on this desktop.');
  }
  const bindings = (await store.list()).filter((item) => item.desktopName === input.name && item.browserId === input.browserId);
  if (bindings.length !== 1) throw new Error('Ambiguous retained desktop ownership.');
  const binding = bindings[0];
  const data = await query(desktop.command ?? 'agent-browser',
    ['--session', binding.session, 'desktop', 'capture', '--browser-id', binding.browserId, '--max-bytes', '8388608'],
    input.runner ?? runAgentBrowserCommand);
  const context = record(data.context) ? data.context : {};
  const receipt = record(data.frameReceipt) ? data.frameReceipt : {};
  if (context.browserId !== binding.browserId || context.sessionName !== binding.session ||
    context.routeId !== binding.routeId || context.displayAllocationId !== binding.displayAllocationId) {
    throw new Error('Desktop frame binding changed during observation.');
  }
  if (receipt.mimeType !== 'image/png' || receipt.freshness !== 'fresh_capture' ||
    typeof data.imageBase64 !== 'string' || data.imageBase64.length > 11_184_812 ||
    typeof context.width !== 'number' || typeof context.height !== 'number' ||
    !Number.isInteger(context.width) || !Number.isInteger(context.height) || context.width <= 0 || context.height <= 0) {
    throw new Error('Invalid or stale remote desktop frame.');
  }
  return { imageBase64: data.imageBase64, width: context.width, height: context.height,
    ...(typeof receipt.capturedAt === 'string' ? { capturedAt: receipt.capturedAt } : {}) };
}

export async function openDesktopView(input: { remoteView: unknown; name: string; browserId: string }): Promise<{ url: string; capability: 'observe' }> {
  const selected = resolveNativeDesktopLaunch({ remoteView: input.remoteView, desktop: input.name });
  if (!selected) throw new Error('The selected desktop does not provide a native viewer.');
  return nativeDesktopObserveView(selected, input.browserId);
}

export async function takeDesktopControl(input: { remoteView: unknown; name: string; browserId: string; token: string }): Promise<{ url: string; capability: 'control'; token: string }> {
  const selected = resolveNativeDesktopLaunch({ remoteView: input.remoteView, desktop: input.name });
  if (!selected) throw new Error('The selected desktop does not provide native control.');
  return new NativeDesktopControl({ inactivityTimeoutMs: RemoteViewConfigSchema.parse(input.remoteView ?? {}).controlInactivitySeconds * 1000 }).take(selected, input.browserId, input.token);
}

export async function releaseDesktopControl(input: { remoteView: unknown; name: string; browserId: string; token: string }): Promise<void> {
  const selected = resolveNativeDesktopLaunch({ remoteView: input.remoteView, desktop: input.name });
  if (!selected) throw new Error('The selected desktop does not provide native control.');
  await new NativeDesktopControl().release(selected, input.browserId, input.token);
}

export async function expireInactiveDesktopControls(remoteView: unknown): Promise<void> {
  const config = RemoteViewConfigSchema.parse(remoteView ?? {});
  for (const [name, desktop] of Object.entries(config.desktops)) {
    if (!desktop.poolName) continue;
    const selected = resolveNativeDesktopLaunch({ remoteView: config, desktop: name });
    if (selected) await new NativeDesktopControl().expireInactive(selected);
  }
}

export async function desktopControlStatus(input: { remoteView: unknown; name: string; browserId: string; token: string }): Promise<{ state: 'held' | 'released' }> {
  const selected = resolveNativeDesktopLaunch({ remoteView: input.remoteView, desktop: input.name });
  if (!selected) throw new Error('The selected desktop does not provide native control.');
  return new NativeDesktopControl().status(selected, input.browserId, input.token);
}

/** Close only the currently verified AuraCall browser; retain desktop and managed data. */
export async function closeDesktopBrowser(input: { remoteView: unknown; name: string; browserId: string }): Promise<{ state: "closed" }> {
  const selected = resolveNativeDesktopLaunch({remoteView:input.remoteView,desktop:input.name});
  if (!selected) throw new Error("Browser close requires a configured native AuraCall desktop.");
  const matches = (await readyNativeDesktopBrowsers(selected)).filter(item => item.browserId === input.browserId);
  const binding = matches.length === 1 ? matches[0] : undefined;
  if (!binding) throw new Error("Select a ready AuraCall-owned browser to close.");
  const client = await CDP({host:binding.cdpHost,port:binding.cdpPort});
  let failure: unknown;
  try { await client.Browser.close(); } catch (error) { failure = error; }
  finally { await client.close().catch(() => undefined); }
  for (let attempt=0;attempt<40;attempt++) {
    try {
      const stat = await fs.readFile(`/proc/${binding.pid}/stat`, "utf8");
      const start = stat.slice(stat.lastIndexOf(")")+2).split(" ")[19];
      if (start !== binding.processStart) return {state:"closed"};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {state:"closed"};
      throw error;
    }
    if (failure) throw new Error("Browser close was not confirmed. Refresh the browser inventory before retrying.", {cause:failure});
    await delay(100);
  }
  throw new Error("Browser close was not confirmed; the owned process is still running.");
}
