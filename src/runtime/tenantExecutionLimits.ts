import { getCurrentRuntimeProfiles } from '../config/model.js';
import { resolveConfiguredServiceAccountId } from '../config/serviceAccountIdentity.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import type { ExecutionServiceHostExecutionGate } from './serviceHost.js';
import type { ExecutionRunStoredRecord } from './store.js';
import type { ExecutionRunStep } from './types.js';
import type { ProviderInteractionLedger } from '../../packages/browser-service/src/service/interactionLedger.js';

type MutableRecord = Record<string, unknown>;

export interface TenantChatExecutionLimits {
  maxConcurrentChats: number | null;
  maxChatsPerHour: number | null;
  maxChatsPerDay: number | null;
}

export interface TenantExecutionLimitUsageSummary {
  basis: 'runtime-evidence' | 'aggregate-interaction-ledger' | 'not-requested';
  activeChats: number | null;
  chatsLastHour: number | null;
  chatsLastDay: number | null;
}

export interface TenantExecutionLimitStatusEntry {
  service: 'chatgpt';
  tenantKey: string;
  tenantLabel: string;
  runtimeProfileIds: string[];
  browserProfileIds: string[];
  limits: TenantChatExecutionLimits;
  usage: TenantExecutionLimitUsageSummary;
}

export interface TenantExecutionLimitStatusSummary {
  object: 'tenant_execution_limits_status';
  generatedAt: string;
  usageRequested: boolean;
  providers: {
    chatgpt: {
      defaultLimits: TenantChatExecutionLimits;
      entries: TenantExecutionLimitStatusEntry[];
      metrics: {
        tenantCount: number;
        entryCount: number;
        activeChats: number | null;
        chatsLastHour: number | null;
        chatsLastDay: number | null;
      };
    };
  };
}

interface TenantExecutionScope {
  service: 'chatgpt';
  tenantKey: string;
  tenantLabel: string;
  limits: TenantChatExecutionLimits;
}

interface TenantExecutionReservation {
  runId: string;
  reservedAtMs: number;
}

export const DEFAULT_CHATGPT_TENANT_LIMITS: TenantChatExecutionLimits = {
  maxConcurrentChats: 4,
  maxChatsPerHour: 120,
  maxChatsPerDay: 240,
};
export const DEFAULT_CHATGPT_INTERACTIONS_PER_MINUTE = 30;

const TENANT_RESERVATION_TTL_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export function createTenantExecutionLimitGate(deps: {
  control: ExecutionRuntimeControlContract;
  config?: Record<string, unknown> | null;
  now?: () => Date;
}): ExecutionServiceHostExecutionGate {
  const now = deps.now ?? (() => new Date());
  const reservationsByTenant = new Map<string, Map<string, TenantExecutionReservation>>();
  const config = deps.config ?? {};

  return async (record: ExecutionRunStoredRecord) => {
    const scope = resolveTenantExecutionScope(config, record);
    if (!scope) return { allowed: true };

    const nowDate = now();
    const nowMs = nowDate.getTime();
    const allRecords = await deps.control.listRuns({
      updatedSince: new Date(nowMs - DAY_MS).toISOString(),
    });
    const reservations = pruneTenantReservations({
      records: allRecords,
      reservations: reservationsByTenant.get(scope.tenantKey),
      config,
      scope,
      nowMs,
    });
    reservationsByTenant.set(scope.tenantKey, reservations);

    if (scope.limits.maxConcurrentChats !== null) {
      const activeCount = countActiveTenantChats({
        records: allRecords,
        reservations,
        config,
        scope,
        excludingRunId: record.runId,
        nowMs,
      });
      if (activeCount >= scope.limits.maxConcurrentChats) {
        return {
          allowed: false,
          reason: `chatgpt tenant ${scope.tenantLabel} concurrency limit reached: ${activeCount}/${scope.limits.maxConcurrentChats} active chats`,
        };
      }
    }

    if (scope.limits.maxChatsPerHour !== null) {
      const hourlyCount = countTenantStartedChats({
        records: allRecords,
        reservations,
        config,
        scope,
        cutoffMs: nowMs - HOUR_MS,
      });
      if (hourlyCount >= scope.limits.maxChatsPerHour) {
        return {
          allowed: false,
          reason: `chatgpt tenant ${scope.tenantLabel} hourly chat rate limit reached: ${hourlyCount}/${scope.limits.maxChatsPerHour} chats per hour`,
        };
      }
    }

    if (scope.limits.maxChatsPerDay !== null) {
      const dailyCount = countTenantStartedChats({
        records: allRecords,
        reservations,
        config,
        scope,
        cutoffMs: nowMs - DAY_MS,
      });
      if (dailyCount >= scope.limits.maxChatsPerDay) {
        return {
          allowed: false,
          reason: `chatgpt tenant ${scope.tenantLabel} daily chat rate limit reached: ${dailyCount}/${scope.limits.maxChatsPerDay} chats per day`,
        };
      }
    }

    reservations.set(record.runId, {
      runId: record.runId,
      reservedAtMs: nowMs,
    });
    return { allowed: true };
  };
}

export function resolveChatgptTenantLimits(
  config: Record<string, unknown>,
  runtimeProfileId: string | null,
): TenantChatExecutionLimits {
  const globalServices = readRecord(config.services);
  const globalChatgpt = readRecord(globalServices?.chatgpt);
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  const runtimeProfile =
    runtimeProfileId && readRecord(runtimeProfiles[runtimeProfileId])
      ? runtimeProfiles[runtimeProfileId]
      : null;
  const runtimeServices = readRecord(runtimeProfile?.services);
  const runtimeChatgpt = readRecord(runtimeServices?.chatgpt);

  return mergeTenantLimits(
    DEFAULT_CHATGPT_TENANT_LIMITS,
    readTenantLimits(globalChatgpt?.tenantLimits),
    readTenantLimits(runtimeChatgpt?.tenantLimits),
  );
}

export function resolveChatgptInteractionsPerMinute(
  config: Record<string, unknown>,
  runtimeProfileId: string | null,
): number {
  const globalChatgpt = readRecord(readRecord(config.services)?.chatgpt);
  const globalLiveFollow = readRecord(globalChatgpt?.liveFollow);
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  const runtimeProfile = runtimeProfileId ? readRecord(runtimeProfiles[runtimeProfileId]) : null;
  const runtimeChatgpt = readRecord(readRecord(runtimeProfile?.services)?.chatgpt);
  const runtimeLiveFollow = readRecord(runtimeChatgpt?.liveFollow);
  return (
    readNullablePositiveInteger(runtimeLiveFollow?.maxBrowserInteractionsPerMinute) ??
    readNullablePositiveInteger(globalLiveFollow?.maxBrowserInteractionsPerMinute) ??
    DEFAULT_CHATGPT_INTERACTIONS_PER_MINUTE
  );
}

/** Explicit opt-in: browser-operation limits are not backend-request ceilings. */
export function resolveChatgptBackendRequestsPerMinute(config: Record<string, unknown>, runtimeProfileId: string | null): number | undefined {
  return readChatgptBackendSetting(config, runtimeProfileId, 'maxBackendRequestsPerMinute', 1);
}

/** Optional capacity waiting; zero preserves immediate bounded-yield behavior. */
export function resolveChatgptBackendRequestBudgetWaitMs(config: Record<string, unknown>, runtimeProfileId: string | null): number {
  return readChatgptBackendSetting(config, runtimeProfileId, 'backendRequestBudgetWaitMs', 0) ?? 0;
}

function readChatgptBackendSetting(config: Record<string, unknown>, runtimeProfileId: string | null, key: string, minimum: number): number | undefined {
  const globalChatgpt = readRecord(readRecord(config.services)?.chatgpt);
  const runtimeProfile = runtimeProfileId ? readRecord(getCurrentRuntimeProfiles(config)[runtimeProfileId]) : null;
  const runtimeChatgpt = readRecord(readRecord(runtimeProfile?.services)?.chatgpt);
  const runtimeValue = runtimeChatgpt?.[key];
  const value = runtimeValue === undefined ? globalChatgpt?.[key] : runtimeValue;
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`ChatGPT ${key} must be a ${minimum ? 'positive' : 'nonnegative'} safe integer.`);
  return value;
}

export async function summarizeTenantExecutionLimits(deps: {
  control: ExecutionRuntimeControlContract;
  config?: Record<string, unknown> | null;
  now?: () => Date;
  includeUsage?: boolean;
  interactionLedger?: ProviderInteractionLedger;
}): Promise<TenantExecutionLimitStatusSummary> {
  const config = deps.config ?? {};
  const now = deps.now ?? (() => new Date());
  const includeUsage = deps.includeUsage ?? true;
  const nowDate = now();
  const nowMs = nowDate.getTime();
  const allRecords = includeUsage
    ? await deps.control.listRuns({
        updatedSince: new Date(nowMs - DAY_MS).toISOString(),
      })
    : [];
  const scopesByKey = new Map<string, {
    scope: TenantExecutionScope;
    runtimeProfileIds: Set<string>;
    browserProfileIds: Set<string>;
  }>();

  for (const entry of resolveConfiguredChatgptTenantStatusScopes(config)) {
    addTenantStatusScope(scopesByKey, entry);
  }

  if (includeUsage) {
    for (const record of allRecords) {
      const step = selectExecutionScopeStep(record);
      if (!step || step.service !== 'chatgpt') continue;
      const scope = resolveTenantExecutionScope(config, record);
      if (!scope) continue;
      addTenantStatusScope(scopesByKey, {
        scope,
        runtimeProfileId: normalizeNonEmptyString(step.runtimeProfileId),
        browserProfileId: normalizeNonEmptyString(step.browserProfileId),
      });
    }
  }

  if (scopesByKey.size === 0) {
    addTenantStatusScope(scopesByKey, {
      scope: resolveChatgptTenantExecutionScope(config, {
        runtimeProfileId: null,
        browserProfileId: null,
      }),
      runtimeProfileId: null,
      browserProfileId: null,
    });
  }

  const emptyReservations = new Map<string, TenantExecutionReservation>();
  const entries = await Promise.all([...scopesByKey.values()]
    .sort((left, right) => {
      const tenantCompare = left.scope.tenantKey.localeCompare(right.scope.tenantKey);
      if (tenantCompare !== 0) return tenantCompare;
      return formatTenantLimitsKey(left.scope.limits).localeCompare(formatTenantLimitsKey(right.scope.limits));
    })
    .map(async (entry): Promise<TenantExecutionLimitStatusEntry> => {
      const usage = includeUsage
        ? deps.interactionLedger
          ? {
              basis: 'aggregate-interaction-ledger' as const,
              ...await deps.interactionLedger.summarizeUsage({
                provider: entry.scope.service,
                tenantKey: entry.scope.tenantKey,
                now: nowDate.toISOString(),
              }),
            }
          : summarizeTenantUsage({
              records: allRecords,
              reservations: emptyReservations,
              config,
              scope: entry.scope,
              nowMs,
            })
        : createNotRequestedTenantUsage();
      return {
        service: 'chatgpt',
        tenantKey: entry.scope.tenantKey,
        tenantLabel: entry.scope.tenantLabel,
        runtimeProfileIds: [...entry.runtimeProfileIds].sort(),
        browserProfileIds: [...entry.browserProfileIds].sort(),
        limits: entry.scope.limits,
        usage,
      };
    }));

  const tenantUsage = new Map<string, TenantExecutionLimitUsageSummary>();
  for (const entry of entries) {
    if (tenantUsage.has(entry.tenantKey)) continue;
    tenantUsage.set(entry.tenantKey, entry.usage);
  }
  const metrics = {
    tenantCount: tenantUsage.size,
    entryCount: entries.length,
    activeChats: includeUsage ? 0 : null as number | null,
    chatsLastHour: includeUsage ? 0 : null as number | null,
    chatsLastDay: includeUsage ? 0 : null as number | null,
  };
  if (includeUsage) {
    for (const usage of tenantUsage.values()) {
      metrics.activeChats = (metrics.activeChats ?? 0) + (usage.activeChats ?? 0);
      metrics.chatsLastHour = (metrics.chatsLastHour ?? 0) + (usage.chatsLastHour ?? 0);
      metrics.chatsLastDay = (metrics.chatsLastDay ?? 0) + (usage.chatsLastDay ?? 0);
    }
  }

  return {
    object: 'tenant_execution_limits_status',
    generatedAt: nowDate.toISOString(),
    usageRequested: includeUsage,
    providers: {
      chatgpt: {
        defaultLimits: DEFAULT_CHATGPT_TENANT_LIMITS,
        entries,
        metrics,
      },
    },
  };
}

function resolveTenantExecutionScope(
  config: Record<string, unknown>,
  record: ExecutionRunStoredRecord,
): TenantExecutionScope | null {
  const step = selectExecutionScopeStep(record);
  if (!step || step.service !== 'chatgpt') return null;
  const runtimeProfileId = normalizeNonEmptyString(step.runtimeProfileId);
  const browserProfileId = normalizeNonEmptyString(step.browserProfileId);
  return resolveChatgptTenantExecutionScope(config, {
    runtimeProfileId,
    browserProfileId,
  });
}

function resolveChatgptTenantExecutionScope(
  config: Record<string, unknown>,
  input: {
    runtimeProfileId: string | null;
    browserProfileId: string | null;
  },
): TenantExecutionScope {
  const serviceAccountId = resolveConfiguredServiceAccountId(config, {
    serviceId: 'chatgpt',
    runtimeProfileId: input.runtimeProfileId,
  });
  const tenantKey =
    serviceAccountId ??
    (input.runtimeProfileId ? `runtime-profile:chatgpt:${input.runtimeProfileId}` : null) ??
    (input.browserProfileId ? `browser-profile:chatgpt:${input.browserProfileId}` : null) ??
    'service:chatgpt:unbound';
  return {
    service: 'chatgpt',
    tenantKey,
    tenantLabel: tenantKey,
    limits: resolveChatgptTenantLimits(config, input.runtimeProfileId),
  };
}

function resolveConfiguredChatgptTenantStatusScopes(config: Record<string, unknown>): Array<{
  scope: TenantExecutionScope;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
}> {
  const entries: Array<{
    scope: TenantExecutionScope;
    runtimeProfileId: string | null;
    browserProfileId: string | null;
  }> = [];
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  for (const [runtimeProfileId, profileValue] of Object.entries(runtimeProfiles)) {
    const profile = readRecord(profileValue);
    if (!profile) continue;
    const services = readRecord(profile.services);
    const hasChatgptService = Boolean(readRecord(services?.chatgpt));
    const defaultService = normalizeNonEmptyString(profile.defaultService);
    if (!hasChatgptService && defaultService !== 'chatgpt') continue;
    const browserProfileId = normalizeNonEmptyString(profile.browserProfile);
    entries.push({
      scope: resolveChatgptTenantExecutionScope(config, {
        runtimeProfileId,
        browserProfileId,
      }),
      runtimeProfileId,
      browserProfileId,
    });
  }
  return entries;
}

function addTenantStatusScope(
  scopesByKey: Map<string, {
    scope: TenantExecutionScope;
    runtimeProfileIds: Set<string>;
    browserProfileIds: Set<string>;
  }>,
  entry: {
    scope: TenantExecutionScope;
    runtimeProfileId: string | null;
    browserProfileId: string | null;
  },
): void {
  const key = `${entry.scope.tenantKey}\0${formatTenantLimitsKey(entry.scope.limits)}`;
  let existing = scopesByKey.get(key);
  if (!existing) {
    existing = {
      scope: entry.scope,
      runtimeProfileIds: new Set<string>(),
      browserProfileIds: new Set<string>(),
    };
    scopesByKey.set(key, existing);
  }
  if (entry.runtimeProfileId) existing.runtimeProfileIds.add(entry.runtimeProfileId);
  if (entry.browserProfileId) existing.browserProfileIds.add(entry.browserProfileId);
}

function summarizeTenantUsage(input: {
  records: ExecutionRunStoredRecord[];
  reservations: Map<string, TenantExecutionReservation>;
  config: Record<string, unknown>;
  scope: TenantExecutionScope;
  nowMs: number;
}): TenantExecutionLimitUsageSummary {
  return {
    basis: 'runtime-evidence',
    activeChats: countActiveTenantChats({
      records: input.records,
      reservations: input.reservations,
      config: input.config,
      scope: input.scope,
      excludingRunId: '',
      nowMs: input.nowMs,
    }),
    chatsLastHour: countTenantStartedChats({
      records: input.records,
      reservations: input.reservations,
      config: input.config,
      scope: input.scope,
      cutoffMs: input.nowMs - HOUR_MS,
    }),
    chatsLastDay: countTenantStartedChats({
      records: input.records,
      reservations: input.reservations,
      config: input.config,
      scope: input.scope,
      cutoffMs: input.nowMs - DAY_MS,
    }),
  };
}

function createNotRequestedTenantUsage(): TenantExecutionLimitUsageSummary {
  return {
    basis: 'not-requested',
    activeChats: null,
    chatsLastHour: null,
    chatsLastDay: null,
  };
}

function formatTenantLimitsKey(limits: TenantChatExecutionLimits): string {
  return [
    limits.maxConcurrentChats ?? 'none',
    limits.maxChatsPerHour ?? 'none',
    limits.maxChatsPerDay ?? 'none',
  ].join(':');
}

function selectExecutionScopeStep(record: ExecutionRunStoredRecord): ExecutionRunStep | null {
  const nextRunnableStep = record.bundle.steps.find((step) => step.status === 'runnable');
  if (nextRunnableStep) return nextRunnableStep;
  return (
    record.bundle.steps.find((step) => step.status === 'running') ??
    record.bundle.steps.find((step) => step.service === 'chatgpt') ??
    null
  );
}

function countActiveTenantChats(input: {
  records: ExecutionRunStoredRecord[];
  reservations: Map<string, TenantExecutionReservation>;
  config: Record<string, unknown>;
  scope: TenantExecutionScope;
  excludingRunId: string;
  nowMs: number;
}): number {
  const activeRunIds = new Set<string>();
  for (const record of input.records) {
    if (record.runId === input.excludingRunId) continue;
    if (isTerminalRun(record)) continue;
    if (!recordHasActiveLease(record)) continue;
    if (!recordMatchesTenantScope(input.config, record, input.scope)) continue;
    activeRunIds.add(record.runId);
  }
  for (const reservation of input.reservations.values()) {
    if (reservation.runId === input.excludingRunId) continue;
    if (input.nowMs - reservation.reservedAtMs > TENANT_RESERVATION_TTL_MS) continue;
    activeRunIds.add(reservation.runId);
  }
  return activeRunIds.size;
}

function countTenantStartedChats(input: {
  records: ExecutionRunStoredRecord[];
  reservations: Map<string, TenantExecutionReservation>;
  config: Record<string, unknown>;
  scope: TenantExecutionScope;
  cutoffMs: number;
}): number {
  let count = 0;
  const startedRunIds = new Set<string>();
  const startedChatKeys = new Set<string>();
  for (const record of input.records) {
    const stepsById = new Map(record.bundle.steps.map((step) => [step.id, step]));
    for (const event of record.bundle.events) {
      if (event.type !== 'step-started') continue;
      const createdAtMs = Date.parse(event.createdAt);
      if (!Number.isFinite(createdAtMs) || createdAtMs < input.cutoffMs) continue;
      const step = event.stepId ? stepsById.get(event.stepId) ?? null : selectExecutionScopeStep(record);
      if (!stepMatchesTenantScope(input.config, step, input.scope)) continue;
      const chatKey = event.stepId ? `${record.runId}\0${event.stepId}` : record.runId;
      if (startedChatKeys.has(chatKey)) continue;
      startedChatKeys.add(chatKey);
      startedRunIds.add(record.runId);
      count += 1;
    }
  }
  for (const reservation of input.reservations.values()) {
    if (reservation.reservedAtMs < input.cutoffMs || startedRunIds.has(reservation.runId)) continue;
    count += 1;
  }
  return count;
}

function pruneTenantReservations(input: {
  records: ExecutionRunStoredRecord[];
  reservations: Map<string, TenantExecutionReservation> | undefined;
  config: Record<string, unknown>;
  scope: TenantExecutionScope;
  nowMs: number;
}): Map<string, TenantExecutionReservation> {
  const next = new Map<string, TenantExecutionReservation>();
  if (!input.reservations) return next;
  const recordsByRunId = new Map(input.records.map((record) => [record.runId, record]));
  for (const reservation of input.reservations.values()) {
    const record = recordsByRunId.get(reservation.runId);
    if (!record) continue;
    if (isTerminalRun(record)) continue;
    if (!recordMatchesTenantScope(input.config, record, input.scope)) continue;
    if (
      input.nowMs - reservation.reservedAtMs > TENANT_RESERVATION_TTL_MS &&
      !recordHasActiveLease(record) &&
      !record.bundle.steps.some((step) => step.status === 'running')
    ) {
      continue;
    }
    next.set(reservation.runId, reservation);
  }
  return next;
}

function recordMatchesTenantScope(
  config: Record<string, unknown>,
  record: ExecutionRunStoredRecord,
  scope: TenantExecutionScope,
): boolean {
  return record.bundle.steps.some((step) => stepMatchesTenantScope(config, step, scope));
}

function stepMatchesTenantScope(
  config: Record<string, unknown>,
  step: ExecutionRunStep | null | undefined,
  scope: TenantExecutionScope,
): boolean {
  if (!step || step.service !== scope.service) return false;
  const runtimeProfileId = normalizeNonEmptyString(step.runtimeProfileId);
  const browserProfileId = normalizeNonEmptyString(step.browserProfileId);
  const serviceAccountId = resolveConfiguredServiceAccountId(config, {
    serviceId: 'chatgpt',
    runtimeProfileId,
  });
  const tenantKey =
    serviceAccountId ??
    (runtimeProfileId ? `runtime-profile:chatgpt:${runtimeProfileId}` : null) ??
    (browserProfileId ? `browser-profile:chatgpt:${browserProfileId}` : null) ??
    'service:chatgpt:unbound';
  return tenantKey === scope.tenantKey;
}

function isTerminalRun(record: ExecutionRunStoredRecord): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(record.bundle.run.status);
}

function recordHasActiveLease(record: ExecutionRunStoredRecord): boolean {
  return record.bundle.leases.some((lease) => lease.status === 'active');
}

function readTenantLimits(value: unknown): Partial<TenantChatExecutionLimits> | null {
  const record = readRecord(value);
  if (!record) return null;
  return {
    maxConcurrentChats: readNullablePositiveInteger(record.maxConcurrentChats),
    maxChatsPerHour: readNullablePositiveInteger(record.maxChatsPerHour),
    maxChatsPerDay: readNullablePositiveInteger(record.maxChatsPerDay),
  };
}

function mergeTenantLimits(
  ...entries: Array<Partial<TenantChatExecutionLimits> | TenantChatExecutionLimits | null | undefined>
): TenantChatExecutionLimits {
  const merged: TenantChatExecutionLimits = {
    maxConcurrentChats: null,
    maxChatsPerHour: null,
    maxChatsPerDay: null,
  };
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.maxConcurrentChats !== undefined) {
      merged.maxConcurrentChats = entry.maxConcurrentChats;
    }
    if (entry.maxChatsPerHour !== undefined) {
      merged.maxChatsPerHour = entry.maxChatsPerHour;
    }
    if (entry.maxChatsPerDay !== undefined) {
      merged.maxChatsPerDay = entry.maxChatsPerDay;
    }
  }
  return merged;
}

function readNullablePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readRecord(value: unknown): MutableRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MutableRecord : null;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
