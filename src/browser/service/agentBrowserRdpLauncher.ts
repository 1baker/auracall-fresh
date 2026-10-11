import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DesktopBindingStore } from './desktopBindings.js';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  detectChromiumBrowserFamily,
  normalizeComparablePath,
} from '../../../packages/browser-service/src/platformPaths.js';
import type {
  AgentBrowserBuild,
  BrowserLogger,
  BrowserProfileFamily,
  ResolvedBrowserConfig,
} from '../types.js';

const execFileAsync = promisify(execFile);
const DEFAULT_AGENT_BROWSER_JOB_TIMEOUT_MS = 120_000;
const AGENT_BROWSER_COMMAND_TIMEOUT_PADDING_MS = 15_000;
const MAX_AGENT_BROWSER_OUTPUT_BYTES = 4 * 1024 * 1024;

const BUILD_FOR_FAMILY: Record<BrowserProfileFamily, AgentBrowserBuild> = {
  chrome: 'stock_chrome',
  chromium: 'stealthcdp_chromium',
};

type JsonRecord = Record<string, unknown>;

export const runAgentBrowserCommand: AgentBrowserCommandRunner = (...args) => defaultRunner(...args);

export interface AgentBrowserCommandResult {
  stdout: string;
  stderr: string;
}

export type AgentBrowserCommandRunner = (
  executable: string,
  args: string[],
  options: {
    abortSignal?: AbortSignal;
    timeoutMs: number;
    maxOutputBytes: number;
  },
) => Promise<AgentBrowserCommandResult>;

export interface AgentBrowserRdpCompatibility {
  browserFamily: BrowserProfileFamily;
  browserBuild: AgentBrowserBuild;
  chromePath: string;
}

export interface AgentBrowserRdpOpenPlan {
  executable: string;
  session: string;
  runtimeProfile: string;
  browserBuild: AgentBrowserBuild;
  browserFamily: BrowserProfileFamily;
  userDataDir: string;
  url: string;
  jobTimeoutMs: number;
  openArgs: string[];
  browserInventoryArgs: string[];
  routePoolEntryId?: string;
  desktopName?: string;
}

export interface AgentBrowserRdpLaunchResult {
  chrome: {
    host: string;
    port: number;
    pid?: number;
  };
  port: number;
  browserId: string;
  session: string;
  handoffUrl: string;
  desktop?: {
    name: string;
    routePoolEntryId: string;
    routeId: string;
    displayAllocationId: string;
  };
}

export interface LaunchAgentBrowserRdpSessionOptions {
  config: ResolvedBrowserConfig;
  userDataDir: string;
  url: string;
  auracallRuntimeProfile?: string | null;
  browserProfileId?: string | null;
  serviceTarget: 'chatgpt' | 'gemini' | 'grok';
  logger: BrowserLogger;
  abortSignal?: AbortSignal;
  onStage?: (stage: string) => void;
  runner?: AgentBrowserCommandRunner;
  bindingStore?: DesktopBindingStore;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function resolveExecutableBrowserFamily(chromePath: string): BrowserProfileFamily | null {
  const detected = detectChromiumBrowserFamily(chromePath);
  if (detected === 'chrome' || detected === 'chromium') return detected;
  const basename = path.basename(normalizeComparablePath(chromePath));
  if (basename === 'google-chrome' || basename === 'google-chrome-stable') return 'chrome';
  if (basename === 'chromium' || basename === 'chromium-browser') return 'chromium';
  return null;
}

export function resolveAgentBrowserRdpCompatibility(
  config: Pick<ResolvedBrowserConfig, 'browserFamily' | 'browserBuild' | 'chromePath'>,
): AgentBrowserRdpCompatibility {
  const browserFamily = config.browserFamily;
  if (browserFamily !== 'chrome' && browserFamily !== 'chromium') {
    throw new Error(
      'agent-browser RDP launch requires browserFamily to be explicitly set to chrome or chromium.',
    );
  }
  const expectedBuild = BUILD_FOR_FAMILY[browserFamily];
  if (config.browserBuild !== expectedBuild) {
    throw new Error(
      `agent-browser RDP browser-family mismatch: ${browserFamily} requires browserBuild=${expectedBuild}.`,
    );
  }
  const chromePath = nonEmptyString(config.chromePath);
  if (!chromePath) {
    throw new Error('agent-browser RDP launch requires an explicit Chrome or Chromium executable path.');
  }
  const executableFamily = resolveExecutableBrowserFamily(chromePath);
  if (executableFamily !== browserFamily) {
    throw new Error(
      `agent-browser RDP executable-family mismatch: declared ${browserFamily}, resolved ${executableFamily ?? 'unknown'} from ${chromePath}.`,
    );
  }
  return {
    browserFamily,
    browserBuild: expectedBuild,
    chromePath,
  };
}

function sanitizeSessionSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

export function buildAgentBrowserRdpOpenPlan(options: {
  config: ResolvedBrowserConfig;
  userDataDir: string;
  url: string;
  auracallRuntimeProfile?: string | null;
  browserProfileId?: string | null;
  serviceTarget: 'chatgpt' | 'gemini' | 'grok';
}): AgentBrowserRdpOpenPlan {
  const compatibility = resolveAgentBrowserRdpCompatibility(options.config);
  const rdp = options.config.agentBrowserRdp;
  if (!rdp?.enabled) {
    throw new Error('agent-browser RDP launch was requested without agentBrowserRdp.enabled=true.');
  }
  const runtimeProfile = nonEmptyString(rdp.runtimeProfile);
  if (!runtimeProfile) {
    throw new Error('agent-browser RDP launch requires agentBrowserRdp.runtimeProfile.');
  }
  const userDataDir = path.resolve(options.userDataDir);
  const profileSegment = sanitizeSessionSegment(
    options.browserProfileId ?? options.auracallRuntimeProfile ?? runtimeProfile,
  );
  const targetSegment = sanitizeSessionSegment(options.serviceTarget);
  const session = rdp.desktopName
    ? `auracall-${createHash('sha256').update(userDataDir).digest('hex').slice(0, 24)}-${targetSegment}`
    : `auracall-${profileSegment}-${targetSegment}`;
  const jobTimeoutMs = rdp.jobTimeoutMs ?? DEFAULT_AGENT_BROWSER_JOB_TIMEOUT_MS;
  const executable = nonEmptyString(rdp.command) ?? 'agent-browser';
  const openArgs = [
    '--json',
    '--session',
    session,
    '--session-name',
    session,
    '--runtime-profile',
    runtimeProfile,
    '--profile',
    userDataDir,
    '--browser-host',
    'remote_headed',
    '--view-stream-provider',
    'rdp_gateway',
    '--control-input-provider',
    'manual_attached_desktop',
    '--display-isolation',
    'shared_display',
    'remote-view',
    'open',
    options.url,
    '--browser-build',
    compatibility.browserBuild,
    '--service-name',
    'AuraCall',
    '--agent-name',
    'auracall-api',
    '--task-name',
    `browser-${targetSegment}`,
    '--job-timeout-ms',
    String(jobTimeoutMs),
  ];
  if (rdp.routePoolEntryId) openArgs.push('--route-pool-entry-id', rdp.routePoolEntryId);
  return {
    executable,
    session,
    ...(rdp.routePoolEntryId ? { routePoolEntryId: rdp.routePoolEntryId } : {}),
    ...(rdp.desktopName ? { desktopName: rdp.desktopName } : {}),
    runtimeProfile,
    browserBuild: compatibility.browserBuild,
    browserFamily: compatibility.browserFamily,
    userDataDir,
    url: options.url,
    jobTimeoutMs,
    openArgs,
    browserInventoryArgs: ['--json', '--session', session, 'service', 'browsers'],
  };
}

const defaultRunner: AgentBrowserCommandRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, args, {
    encoding: 'utf8',
    signal: options.abortSignal,
    timeout: options.timeoutMs,
    maxBuffer: options.maxOutputBytes,
  });
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
};

function parseCommandEnvelope(output: AgentBrowserCommandResult, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout.trim());
  } catch {
    throw new Error(`${label} did not return a JSON response.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${label} returned an invalid response envelope.`);
  }
  if (parsed.success !== true) {
    throw new Error(`${label} failed: ${nonEmptyString(parsed.error) ?? 'unknown agent-browser error'}`);
  }
  return parsed;
}

function responseData(envelope: JsonRecord, label: string): JsonRecord {
  if (!isRecord(envelope.data)) {
    throw new Error(`${label} returned no data object.`);
  }
  return envelope.data;
}

function validateOpenedRemoteView(
  data: JsonRecord,
  plan: AgentBrowserRdpOpenPlan,
): { browserId: string; handoffUrl: string } {
  if (data.status !== 'opened') {
    throw new Error(`agent-browser remote-view did not open the route (status=${String(data.status ?? 'missing')}).`);
  }
  const operatorVisible = isRecord(data.operatorVisible) ? data.operatorVisible : null;
  if (operatorVisible?.state !== 'ready') {
    throw new Error(
      `agent-browser remote-view is not operator-visible (state=${String(operatorVisible?.state ?? 'missing')}).`,
    );
  }
  validateRemoteViewBuild(data, plan);
  const browserId = nonEmptyString(data.browserId) ?? nonEmptyString(operatorVisible.browserId);
  if (!browserId) {
    throw new Error('agent-browser remote-view returned no browser id.');
  }
  const handoffUrl = nonEmptyString(data.handoffUrl) ?? nonEmptyString(data.externalUrl);
  if (!handoffUrl) {
    throw new Error('agent-browser remote-view returned no durable handoff URL.');
  }
  return { browserId, handoffUrl };
}

function validateRemoteViewBuild(data: JsonRecord, plan: AgentBrowserRdpOpenPlan): void {
  const buildProof = isRecord(data.browserBuildProof) ? data.browserBuildProof : null;
  const requestedBuild = nonEmptyString(buildProof?.requestedBrowserBuild);
  const selectedBuild = nonEmptyString(buildProof?.selectedBrowserBuild);
  const actualExecutablePath = nonEmptyString(buildProof?.actualExecutablePath);
  if (
    buildProof?.state !== 'matched' ||
    requestedBuild !== plan.browserBuild ||
    selectedBuild !== plan.browserBuild ||
    !actualExecutablePath
  ) {
    throw new Error('agent-browser remote-view did not return exact matching browser-build proof.');
  }
  const actualFamily = resolveExecutableBrowserFamily(actualExecutablePath);
  if (actualFamily !== plan.browserFamily) {
    throw new Error(
      `agent-browser selected executable family ${actualFamily ?? 'unknown'} for ${plan.browserFamily} profile.`,
    );
  }
}

function browserRecords(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.browsers)) return data.browsers.filter(isRecord);
  if (isRecord(data.data) && Array.isArray(data.data.browsers)) {
    return data.data.browsers.filter(isRecord);
  }
  return [];
}

function selectBrowserRecord(
  envelope: JsonRecord,
  browserId: string,
  session: string,
): JsonRecord {
  const records = browserRecords(envelope.data);
  const exact = records.filter((record) => {
    const id = nonEmptyString(record.id) ?? nonEmptyString(record.browserId);
    return id === browserId;
  });
  if (exact.length === 1) return exact[0];
  const bySession = records.filter((record) => {
    const sessionName = nonEmptyString(record.sessionName) ?? nonEmptyString(record.sessionId);
    const activeSessions = Array.isArray(record.activeSessionIds)
      ? record.activeSessionIds.filter((value): value is string => typeof value === 'string')
      : [];
    return sessionName === session || activeSessions.includes(session);
  });
  if (bySession.length === 1) return bySession[0];
  throw new Error('agent-browser browser inventory did not identify one exact opened browser.');
}

/** Resolve canonical CDP inventory first, retaining legacy host/port compatibility. */
function resolveBrowserCdpConnection(browser: JsonRecord): { host: string; port: number } {
  if (browser.cdpEndpoint !== undefined && browser.cdpEndpoint !== null) {
    const endpoint = nonEmptyString(browser.cdpEndpoint);
    try {
      if (!endpoint) throw new Error('empty endpoint');
      const parsed = new URL(endpoint);
      // WHATWG URL removes default ports, so inspect the explicit authority too.
      const authority = endpoint.match(/^(?:https?|wss?):\/\/([^/?#]+)/i)?.[1];
      const explicitPort = authority?.match(/:(\d+)$/)?.[1];
      const port = explicitPort ? Number(explicitPort) : 0;
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
        || !parsed.hostname || !Number.isInteger(port) || port <= 0 || port > 65535
        || parsed.username || parsed.password || endpoint.includes('?') || endpoint.includes('#')) {
        throw new Error('invalid endpoint');
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, '');
      return { host, port };
    } catch {
      throw new Error('agent-browser opened browser has an invalid canonical CDP endpoint in service inventory.');
    }
  }
  const port = positiveInteger(browser.cdpPort);
  if (!port || port > 65535) {
    throw new Error('agent-browser opened browser has no responsive CDP port in service inventory.');
  }
  return { host: nonEmptyString(browser.cdpHost) ?? '127.0.0.1', port };
}

async function preflightDesktopRoute(
  plan: AgentBrowserRdpOpenPlan,
  runner: AgentBrowserCommandRunner,
  commandOptions: Parameters<AgentBrowserCommandRunner>[2],
): Promise<{ routeId: string; displayAllocationId: string } | undefined> {
  if (!plan.routePoolEntryId) return undefined;
  const envelope = parseCommandEnvelope(await runner(plan.executable,
    ['--json', '--session', plan.session, 'service', 'status'], commandOptions), 'agent-browser service status');
  const data = responseData(envelope, 'agent-browser service status');
  const projection = isRecord(data.serviceStateProjection) ? data.serviceStateProjection : {};
  if (projection.complete === false) throw new Error('Agent Browser service inventory is incomplete; refusing desktop placement.');
  const state = isRecord(data.service_state) ? data.service_state : {};
  const entries = isRecord(state.routePool) ? Object.values(state.routePool).filter(isRecord) : [];
  const matching = entries.filter((entry) => entry.id === plan.routePoolEntryId);
  const entry = matching.length === 1 ? matching[0] : undefined;
  if (!entry || entry.provider !== 'rdp_gateway' || !['available', 'checked_out'].includes(String(entry.state))) {
    throw new Error(`AuraCall desktop ${plan.desktopName ?? plan.routePoolEntryId}: route ${plan.routePoolEntryId} is unavailable. Restore that exact route or select root; no fallback was launched.`);
  }
  const routeId = nonEmptyString(entry.routeId);
  const target = isRecord(entry.target) ? entry.target : {};
  if (!routeId || !nonEmptyString(target.displayName)) {
    throw new Error(`AuraCall desktop ${plan.desktopName}: route ${plan.routePoolEntryId} has no exact display binding.`);
  }
  return { routeId, displayAllocationId: nonEmptyString(target.displayAllocationId) ?? `remote-view-display:${routeId}` };
}

function verifyDesktopBinding(data: JsonRecord, plan: AgentBrowserRdpOpenPlan,
  expected: { routeId: string; displayAllocationId: string } | undefined): void {
  if (!expected) return;
  const binding = isRecord(data.routeBinding) ? data.routeBinding : data;
  const visible = isRecord(data.operatorVisible) ? data.operatorVisible : {};
  if (binding.routePoolEntryId !== plan.routePoolEntryId ||
    (binding.routeId ?? visible.routeId) !== expected.routeId ||
    (binding.displayAllocationId ?? visible.displayAllocationId) !== expected.displayAllocationId) {
    throw new Error(`AuraCall desktop ${plan.desktopName} returned a mismatched route/display binding; refusing CDP attachment.`);
  }
  const url = nonEmptyString(data.handoffUrl);
  if (!url || !/^https?:$/.test(new URL(url).protocol) || !/^\/remote-view\/[^/]+$/.test(new URL(url).pathname)) {
    throw new Error(`AuraCall desktop ${plan.desktopName} requires a durable remote-view handoff URL.`);
  }
}

/** Discover only the exact session on its configured display. Never launches a browser. */
export async function findConfiguredDesktopBrowser(
  options: LaunchAgentBrowserRdpSessionOptions,
): Promise<{ host: string; port: number } | undefined> {
  const plan = buildAgentBrowserRdpOpenPlan(options);
  const runner = options.runner ?? defaultRunner;
  const commandOptions = {
    abortSignal: options.abortSignal,
    timeoutMs: plan.jobTimeoutMs + AGENT_BROWSER_COMMAND_TIMEOUT_PADDING_MS,
    maxOutputBytes: MAX_AGENT_BROWSER_OUTPUT_BYTES,
  };
  const expected = await preflightDesktopRoute(plan, runner, commandOptions);
  const envelope = parseCommandEnvelope(await runner(plan.executable, plan.browserInventoryArgs, commandOptions),
    'agent-browser service browsers');
  const records = browserRecords(envelope.data).filter((record) =>
    record.sessionName === plan.session || record.sessionId === plan.session ||
    (Array.isArray(record.activeSessionIds) && record.activeSessionIds.includes(plan.session)));
  if (records.length === 0) return undefined;
  if (records.length !== 1) throw new Error('Configured AuraCall desktop has ambiguous browser ownership.');
  const browser = records[0];
  const streams = Array.isArray(browser.viewStreams) ? browser.viewStreams.filter(isRecord) : [];
  if (expected && (browser.displayAllocationId !== expected.displayAllocationId ||
    !streams.some((stream) => stream.routeId === expected.routeId && stream.displayAllocationId === expected.displayAllocationId))) {
    throw new Error(`AuraCall desktop ${plan.desktopName} browser is on a different route/display; refusing CDP attachment.`);
  }
  if (browser.health !== 'ready') throw new Error(`AuraCall desktop ${plan.desktopName} browser is not ready.`);
  return resolveBrowserCdpConnection(browser);
}

export async function launchAgentBrowserRdpSession(
  options: LaunchAgentBrowserRdpSessionOptions,
): Promise<AgentBrowserRdpLaunchResult> {
  const plan = buildAgentBrowserRdpOpenPlan(options);
  const runner = options.runner ?? defaultRunner;
  options.abortSignal?.throwIfAborted();
  options.logger(
    `Launching ${plan.browserFamily}/${plan.browserBuild} through agent-browser RDP session ${plan.session}`,
  );
  const commandOptions = {
    abortSignal: options.abortSignal,
    timeoutMs: plan.jobTimeoutMs + AGENT_BROWSER_COMMAND_TIMEOUT_PADDING_MS,
    maxOutputBytes: MAX_AGENT_BROWSER_OUTPUT_BYTES,
  };
  options.onStage?.('agentBrowserDesktopPreflight');
  const desktopRoute = await preflightDesktopRoute(plan, runner, commandOptions);
  options.onStage?.('agentBrowserRemoteViewOpen');
  const openedEnvelope = parseCommandEnvelope(
    await runner(plan.executable, plan.openArgs, commandOptions),
    'agent-browser remote-view open',
  );
  const initial = responseData(openedEnvelope, 'agent-browser remote-view open');
  let ready = initial;
  if (initial.status === 'converging') {
    verifyDesktopBinding(initial, plan, desktopRoute);
    // Retain initial build custody and resolve only the already-created handoff.
    validateRemoteViewBuild(initial, plan);
    const browserId = nonEmptyString(initial.browserId);
    const handoffId = nonEmptyString(initial.handoffId);
    const handoffUrl = nonEmptyString(initial.handoffUrl) ?? nonEmptyString(initial.externalUrl);
    if (!browserId || !handoffId || !/^[A-Za-z0-9_-]{1,128}$/.test(handoffId) || !handoffUrl) {
      throw new Error('agent-browser converging response has no exact retained handoff identity.');
    }
    const deadline = Date.now() + Math.min(plan.jobTimeoutMs, 60_000);
    for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt += 1) {
      options.abortSignal?.throwIfAborted();
      const envelope = parseCommandEnvelope(await runner(plan.executable,
        ['--json', '--session', plan.session, 'remote-view', 'resolve', handoffId],
        { ...commandOptions, timeoutMs: Math.max(1, deadline - Date.now()) }),
      'agent-browser remote-view resolve');
      const resolved = responseData(envelope, 'agent-browser remote-view resolve');
      if (resolved.browserId !== browserId || resolved.handoffId !== handoffId) {
        throw new Error('agent-browser remote-view resolution changed retained handoff identity.');
      }
      const opened = resolved.status === 'ready' && isRecord(resolved.open) ? resolved.open : resolved;
      if (opened.browserId !== browserId) {
        throw new Error('agent-browser remote-view resolution changed retained browser identity.');
      }
      ready = { ...opened, browserBuildProof: initial.browserBuildProof, handoffUrl };
      if (resolved.status !== 'converging') break;
      if (attempt < 29) await sleep(Math.min(1000, Math.max(0, deadline - Date.now())), undefined,
        { signal: options.abortSignal });
    }
  }
  verifyDesktopBinding(ready, plan, desktopRoute);
  const opened = validateOpenedRemoteView(ready, plan);
  options.abortSignal?.throwIfAborted();
  options.onStage?.('agentBrowserBrowserInventory');
  const inventoryEnvelope = parseCommandEnvelope(
    await runner(plan.executable, plan.browserInventoryArgs, commandOptions),
    'agent-browser service browsers',
  );
  const browser = selectBrowserRecord(inventoryEnvelope, opened.browserId, plan.session);
  if (desktopRoute && (browser.id !== opened.browserId ||
    browser.displayAllocationId !== desktopRoute.displayAllocationId ||
    !Array.isArray(browser.activeSessionIds) || !browser.activeSessionIds.includes(plan.session))) {
    throw new Error('Opened AuraCall desktop browser inventory does not prove exact session/display ownership.');
  }
  const { host, port } = resolveBrowserCdpConnection(browser);
  const pid = positiveInteger(browser.pid) ?? undefined;
  if (desktopRoute && plan.desktopName && plan.routePoolEntryId) {
    await (options.bindingStore ?? new DesktopBindingStore()).record({
      desktopName: plan.desktopName,
      managedProfileDir: plan.userDataDir,
      browserId: opened.browserId,
      session: plan.session,
      routePoolEntryId: plan.routePoolEntryId,
      ...desktopRoute,
      cdpHost: host,
      cdpPort: port,
      handoffUrl: opened.handoffUrl,
    });
  }
  return {
    chrome: { host, port, ...(pid ? { pid } : {}) },
    port,
    browserId: opened.browserId,
    session: plan.session,
    handoffUrl: opened.handoffUrl,
    ...(desktopRoute && plan.desktopName && plan.routePoolEntryId ? {
      desktop: { name: plan.desktopName, routePoolEntryId: plan.routePoolEntryId, ...desktopRoute },
    } : {}),
  };
}
