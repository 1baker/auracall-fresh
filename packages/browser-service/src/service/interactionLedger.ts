import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isProcessAlive } from '../processCheck.js';

export type ProviderInteractionClass =
  | 'conversation-start'
  | 'prompt-continuation'
  | 'navigation'
  | 'reload'
  | 'conversation-read'
  | 'list-read'
  | 'artifact-read'
  | 'selection'
  | 'provider-mutation'
  | 'passive-observation';

export type ProviderInteractionMutability = 'read-only' | 'provider-mutating';
export type ProviderInteractionState = 'reserved' | 'started' | 'settled' | 'abandoned' | 'frozen';
export type ProviderInteractionEffectState = 'none' | 'in-flight' | 'settled' | 'outcome-unknown';
export type ProviderWarningClassification =
  | 'rate-limit'
  | 'captcha'
  | 'human-verification'
  | 'identity-conflict'
  | 'account-mismatch'
  | 'provider-warning';

export interface ProviderInteractionScope {
  provider: string;
  tenantKey: string;
  runtimeProfileId: string;
  managedBrowserProfile: string;
}

export interface ProviderInteractionPolicy {
  maxConcurrentChats: number | null;
  maxConversationStartsPerHour: number | null;
  maxConversationStartsPerDay: number | null;
  maxInteractionsPerMinute?: number | null;
}

export interface ProviderInteractionUsageSummary {
  activeChats: number;
  chatsLastHour: number;
  chatsLastDay: number;
  interactionsLastMinute: number;
}

export interface ProviderWarningInteractionEvidence {
  occurredAt: string;
  deltaMs: number | null;
  interactionClass: ProviderInteractionClass | null;
  eventType: ProviderInteractionEventType;
  outcome: ProviderInteractionOutcome | null;
}

export interface ProviderWarningEvidence {
  version: 1;
  classifierVersion: string;
  visibleSummary: string;
  sourceTargetClass: string;
  firstObservedAt: string;
  openTargetCount: number | null;
  precedingInteractions: ProviderWarningInteractionEvidence[];
  cumulativeCounts: {
    interactions: number;
    navigations: number;
    reloads: number;
    conversationReads: number;
    artifactReads: number;
  };
  resourcePathClasses: string[];
  trafficAdmission?: {
    version: 1;
    phases: Array<{ phase: string; admitted: number; limit: number; remaining: number }>;
    budgets: Array<{
      phase: string;
      kind: string;
      admitted: number;
      limit: number;
      remaining: number;
    }>;
    recentEffects?: Array<{
      occurredAt: string;
      phase: string;
      kind: string;
      outcome: string;
    }>;
  };
}

export interface ProviderWarningRecord {
  provider: string;
  tenantKey: string;
  classification: ProviderWarningClassification;
  reason: string;
  observedAt: string;
  cooldownUntil: string | null;
  evidence: ProviderWarningEvidence | null;
}

export interface ProviderInteractionRecord {
  reservationId: string;
  scope: ProviderInteractionScope;
  workloadId: string;
  operationId: string;
  tabLeaseId: string | null;
  interactionClass: ProviderInteractionClass;
  mutability: ProviderInteractionMutability;
  startsNewConversation: boolean;
  state: ProviderInteractionState;
  effectState: ProviderInteractionEffectState;
  reservedAt: string;
  reservationExpiresAt: string;
  startedAt: string | null;
  settledAt: string | null;
  frozenAt: string | null;
  providerWarning: ProviderWarningClassification | null;
  stopReason: string | null;
  outcome: ProviderInteractionOutcome | null;
  /** Account-wide ceiling contributed by this admission for its rolling minute. */
  maxInteractionsPerMinute?: number | null;
}

export type ProviderInteractionOutcome = 'succeeded' | 'failed' | 'cancelled';
export type ProviderInteractionAdmissionRejectionReason =
  | 'provider-warning'
  | 'concurrent-limit'
  | 'minute-interaction-limit'
  | 'hourly-limit'
  | 'daily-limit';

export type ProviderInteractionEventType =
  | 'reservation-created'
  | 'tab-lease-bound'
  | 'interaction-started'
  | 'interaction-settled'
  | 'reservation-abandoned'
  | 'interaction-frozen'
  | 'provider-warning-observed'
  | 'provider-warning-cleared'
  | 'admission-rejected'
  | 'passive-observed';

export interface ProviderInteractionEvent {
  eventId: string;
  reservationId: string | null;
  scope: ProviderInteractionScope;
  workloadId: string | null;
  operationId: string | null;
  tabLeaseId: string | null;
  interactionClass: ProviderInteractionClass | null;
  mutability: ProviderInteractionMutability | null;
  startsNewConversation: boolean;
  type: ProviderInteractionEventType;
  occurredAt: string;
  effectState: ProviderInteractionEffectState;
  outcome: ProviderInteractionOutcome | null;
  providerWarning: ProviderWarningClassification | null;
  reason: string | null;
}

export type ProviderInteractionTransitionResult =
  | { ok: true; record: ProviderInteractionRecord }
  | { ok: false; reason: 'not-found' | 'invalid-state' | 'reservation-expired' };

export interface ReserveProviderInteractionInput {
  scope: ProviderInteractionScope;
  workloadId: string;
  operationId: string;
  tabLeaseId?: string | null;
  interactionClass: ProviderInteractionClass;
  mutability: ProviderInteractionMutability;
  startsNewConversation: boolean;
  now: string;
  reservationTtlMs: number;
  policy: ProviderInteractionPolicy;
}

export type ProviderInteractionAdmission =
  | { allowed: true; reservation: ProviderInteractionRecord }
  | {
      allowed: false;
      reason: ProviderInteractionAdmissionRejectionReason;
      warning?: ProviderWarningRecord;
    };

export interface ProviderInteractionLedger {
  reserve(input: ReserveProviderInteractionInput): Promise<ProviderInteractionAdmission>;
  bindTabLease(input: {
    reservationId: string;
    tabLeaseId: string;
    boundAt: string;
  }): Promise<ProviderInteractionTransitionResult>;
  start(input: {
    reservationId: string;
    startedAt: string;
  }): Promise<ProviderInteractionTransitionResult>;
  settle(input: {
    reservationId: string;
    settledAt: string;
    effectState: 'none' | 'settled' | 'outcome-unknown';
    outcome: ProviderInteractionOutcome;
    stopReason?: string | null;
  }): Promise<ProviderInteractionTransitionResult>;
  observePassive(input: {
    scope: ProviderInteractionScope;
    workloadId: string;
    operationId: string;
    tabLeaseId?: string | null;
    observedAt: string;
  }): Promise<ProviderInteractionEvent>;
  recordProviderWarning(input: {
    scope: ProviderInteractionScope;
    classification: ProviderWarningClassification;
    reason: string;
    observedAt: string;
    cooldownUntil?: string | null;
    evidence?: {
      classifierVersion: string;
      visibleSummary: string;
      sourceTargetClass: string;
      openTargetCount?: number | null;
      resourcePathClasses?: string[];
      precedingInteractionLimit?: number;
      trafficAdmission?: ProviderWarningEvidence['trafficAdmission'];
    } | null;
  }): Promise<{ warning: ProviderWarningRecord; frozenReservationIds: string[] }>;
  clearProviderWarning(input: {
    scope: ProviderInteractionScope;
    clearedAt: string;
    cooldownUntil?: string | null;
    reason: string;
  }): Promise<{ previous: ProviderWarningRecord | null; warning: ProviderWarningRecord | null }>;
  listActiveProviderWarnings(input: { now: string }): Promise<ProviderWarningRecord[]>;
  list(scope?: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>>): Promise<ProviderInteractionRecord[]>;
  listEvents(scope?: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>>): Promise<ProviderInteractionEvent[]>;
  summarizeUsage(input: {
    provider: string;
    tenantKey: string;
    now: string;
  }): Promise<ProviderInteractionUsageSummary>;
  summarizeAggregateUsage(input: { now: string }): Promise<ProviderInteractionUsageSummary>;
}

export interface InMemoryProviderInteractionLedgerOptions {
  createReservationId?: () => string;
}

export interface FileBackedProviderInteractionLedgerOptions extends InMemoryProviderInteractionLedgerOptions {
  ledgerRoot: string;
  isOwnerAlive?: (pid: number) => boolean;
  lockTimeoutMs?: number;
  lockPollMs?: number;
}

export function createInMemoryProviderInteractionLedger(
  options: InMemoryProviderInteractionLedgerOptions = {},
): ProviderInteractionLedger {
  return new InMemoryProviderInteractionLedger(options);
}

export function createFileBackedProviderInteractionLedger(
  options: FileBackedProviderInteractionLedgerOptions,
): ProviderInteractionLedger {
  return new FileBackedProviderInteractionLedger(options);
}

interface ProviderInteractionLedgerSnapshot {
  records: ProviderInteractionRecord[];
  warnings: ProviderWarningRecord[];
  events: ProviderInteractionEvent[];
}

class InMemoryProviderInteractionLedger implements ProviderInteractionLedger {
  private readonly records = new Map<string, ProviderInteractionRecord>();
  private readonly warnings = new Map<string, ProviderWarningRecord>();
  private readonly events: ProviderInteractionEvent[] = [];
  private readonly createReservationId: () => string;

  constructor(
    options: InMemoryProviderInteractionLedgerOptions,
    snapshot: ProviderInteractionLedgerSnapshot = { records: [], warnings: [], events: [] },
  ) {
    this.createReservationId = options.createReservationId ?? (() => crypto.randomUUID());
    for (const record of snapshot.records) this.records.set(record.reservationId, cloneRecord(record));
    for (const warning of snapshot.warnings) {
      this.warnings.set(aggregateScopeKey(warning), cloneWarning(warning));
    }
    this.events.push(...snapshot.events.map(cloneEvent));
  }

  snapshot(): ProviderInteractionLedgerSnapshot {
    return {
      records: [...this.records.values()].map(cloneRecord),
      warnings: [...this.warnings.values()].map(cloneWarning),
      events: this.events.map(cloneEvent),
    };
  }

  async reserve(input: ReserveProviderInteractionInput): Promise<ProviderInteractionAdmission> {
    const scope = normalizeScope(input.scope);
    const nowMs = parseTimestamp(input.now, 'now');
    this.expireReservations(nowMs);
    const warning = this.warnings.get(aggregateScopeKey(scope));
    if (warning && isWarningActive(warning, nowMs)) {
      return this.rejectAdmission(scope, input, 'provider-warning', warning);
    }

    const activeConversationWorkloads = new Set(
      [...this.records.values()]
        .filter(
          (record) =>
            aggregateScopeKey(record.scope) === aggregateScopeKey(scope) &&
            (record.state === 'reserved' || record.state === 'started') &&
            (record.interactionClass === 'conversation-start' ||
              record.interactionClass === 'prompt-continuation'),
        )
        .map((record) => record.workloadId),
    );
    const maxConcurrent = normalizeLimit(input.policy.maxConcurrentChats, 'maxConcurrentChats');
    const reservesConversationSlot =
      input.interactionClass === 'conversation-start' ||
      input.interactionClass === 'prompt-continuation';
    if (
      reservesConversationSlot &&
      maxConcurrent !== null &&
      activeConversationWorkloads.size >= maxConcurrent
    ) {
      return this.rejectAdmission(scope, input, 'concurrent-limit');
    }

    let minuteInteractionLimit = normalizeLimit(
      input.policy.maxInteractionsPerMinute ?? null,
      'maxInteractionsPerMinute',
    );
    for (const record of this.records.values()) {
      if (
        aggregateScopeKey(record.scope) !== aggregateScopeKey(scope) ||
        Date.parse(record.startedAt ?? record.reservedAt) < nowMs - 60_000 ||
        record.maxInteractionsPerMinute == null
      ) continue;
      const contributedLimit = normalizeLimit(record.maxInteractionsPerMinute, 'maxInteractionsPerMinute');
      if (contributedLimit !== null) {
        minuteInteractionLimit = minuteInteractionLimit === null
          ? contributedLimit : Math.min(minuteInteractionLimit, contributedLimit);
      }
    }
    if (
      minuteInteractionLimit !== null &&
      this.countInteractions(scope, nowMs - 60_000) >= minuteInteractionLimit
    ) {
      return this.rejectAdmission(scope, input, 'minute-interaction-limit');
    }

    if (input.startsNewConversation) {
      const hourlyLimit = normalizeLimit(
        input.policy.maxConversationStartsPerHour,
        'maxConversationStartsPerHour',
      );
      if (
        hourlyLimit !== null &&
        this.countConversationStarts(scope, nowMs - 60 * 60_000) >= hourlyLimit
      ) {
        return this.rejectAdmission(scope, input, 'hourly-limit');
      }
      const dailyLimit = normalizeLimit(
        input.policy.maxConversationStartsPerDay,
        'maxConversationStartsPerDay',
      );
      if (
        dailyLimit !== null &&
        this.countConversationStarts(scope, nowMs - 24 * 60 * 60_000) >= dailyLimit
      ) {
        return this.rejectAdmission(scope, input, 'daily-limit');
      }
    }

    const reservationTtlMs = normalizePositiveInteger(input.reservationTtlMs, 'reservationTtlMs');
    const reservationId = requireNonEmpty(this.createReservationId(), 'reservationId');
    if (this.records.has(reservationId)) throw new Error(`Interaction reservation ID already exists: ${reservationId}`);
    const now = new Date(nowMs).toISOString();
    const reservation: ProviderInteractionRecord = {
      reservationId,
      scope,
      workloadId: requireNonEmpty(input.workloadId, 'workloadId'),
      operationId: requireNonEmpty(input.operationId, 'operationId'),
      tabLeaseId: normalizeOptional(input.tabLeaseId),
      interactionClass: input.interactionClass,
      mutability: input.mutability,
      startsNewConversation: input.startsNewConversation,
      state: 'reserved',
      effectState: 'none',
      reservedAt: now,
      reservationExpiresAt: new Date(nowMs + reservationTtlMs).toISOString(),
      startedAt: null,
      settledAt: null,
      frozenAt: null,
      providerWarning: null,
      stopReason: null,
      outcome: null,
      maxInteractionsPerMinute: normalizeLimit(input.policy.maxInteractionsPerMinute ?? null, 'maxInteractionsPerMinute'),
    };
    this.records.set(reservationId, reservation);
    this.appendEvent({
      reservationId,
      scope,
      workloadId: reservation.workloadId,
      operationId: reservation.operationId,
      tabLeaseId: reservation.tabLeaseId,
      interactionClass: reservation.interactionClass,
      mutability: reservation.mutability,
      startsNewConversation: reservation.startsNewConversation,
      type: 'reservation-created',
      occurredAt: now,
      effectState: 'none',
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return { allowed: true, reservation: cloneRecord(reservation) };
  }

  async start(input: {
    reservationId: string;
    startedAt: string;
  }): Promise<ProviderInteractionTransitionResult> {
    const record = this.records.get(input.reservationId);
    if (!record) return { ok: false, reason: 'not-found' };
    if (record.state !== 'reserved') return { ok: false, reason: 'invalid-state' };
    const startedAtMs = parseTimestamp(input.startedAt, 'startedAt');
    if (startedAtMs > Date.parse(record.reservationExpiresAt)) {
      this.records.set(record.reservationId, {
        ...record,
        state: 'abandoned',
        settledAt: new Date(startedAtMs).toISOString(),
        stopReason: 'reservation-expired',
      });
      return { ok: false, reason: 'reservation-expired' };
    }
    const started: ProviderInteractionRecord = {
      ...record,
      state: 'started',
      effectState: 'in-flight',
      startedAt: new Date(startedAtMs).toISOString(),
    };
    this.records.set(started.reservationId, started);
    this.appendEvent({
      reservationId: started.reservationId,
      scope: started.scope,
      workloadId: started.workloadId,
      operationId: started.operationId,
      tabLeaseId: started.tabLeaseId,
      interactionClass: started.interactionClass,
      mutability: started.mutability,
      startsNewConversation: started.startsNewConversation,
      type: 'interaction-started',
      occurredAt: started.startedAt ?? input.startedAt,
      effectState: started.effectState,
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return { ok: true, record: cloneRecord(started) };
  }

  async bindTabLease(input: {
    reservationId: string;
    tabLeaseId: string;
    boundAt: string;
  }): Promise<ProviderInteractionTransitionResult> {
    const record = this.records.get(input.reservationId);
    if (!record) return { ok: false, reason: 'not-found' };
    if (record.state !== 'reserved' && record.state !== 'started') {
      return { ok: false, reason: 'invalid-state' };
    }
    const tabLeaseId = requireNonEmpty(input.tabLeaseId, 'tabLeaseId');
    if (record.tabLeaseId !== null) {
      return record.tabLeaseId === tabLeaseId
        ? { ok: true, record: cloneRecord(record) }
        : { ok: false, reason: 'invalid-state' };
    }
    const boundAtMs = parseTimestamp(input.boundAt, 'boundAt');
    if (boundAtMs < Date.parse(record.reservedAt)) {
      throw new Error('boundAt cannot be earlier than reservedAt');
    }
    if (record.state === 'reserved' && boundAtMs > Date.parse(record.reservationExpiresAt)) {
      this.expireReservations(boundAtMs);
      return { ok: false, reason: 'reservation-expired' };
    }
    const bound: ProviderInteractionRecord = { ...record, tabLeaseId };
    this.records.set(bound.reservationId, bound);
    this.appendEvent({
      reservationId: bound.reservationId,
      scope: bound.scope,
      workloadId: bound.workloadId,
      operationId: bound.operationId,
      tabLeaseId,
      interactionClass: bound.interactionClass,
      mutability: bound.mutability,
      startsNewConversation: bound.startsNewConversation,
      type: 'tab-lease-bound',
      occurredAt: new Date(boundAtMs).toISOString(),
      effectState: bound.effectState,
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return { ok: true, record: cloneRecord(bound) };
  }

  async settle(input: {
    reservationId: string;
    settledAt: string;
    effectState: 'none' | 'settled' | 'outcome-unknown';
    outcome: ProviderInteractionOutcome;
    stopReason?: string | null;
  }): Promise<ProviderInteractionTransitionResult> {
    const record = this.records.get(input.reservationId);
    if (!record) return { ok: false, reason: 'not-found' };
    if (record.state !== 'started') return { ok: false, reason: 'invalid-state' };
    const settledAtMs = parseTimestamp(input.settledAt, 'settledAt');
    if (record.startedAt !== null && settledAtMs < Date.parse(record.startedAt)) {
      throw new Error('settledAt cannot be earlier than startedAt');
    }
    const settled: ProviderInteractionRecord = {
      ...record,
      state: 'settled',
      effectState: input.effectState,
      settledAt: new Date(settledAtMs).toISOString(),
      stopReason: normalizeOptionalReason(input.stopReason),
      outcome: input.outcome,
    };
    this.records.set(settled.reservationId, settled);
    this.appendEvent({
      reservationId: settled.reservationId,
      scope: settled.scope,
      workloadId: settled.workloadId,
      operationId: settled.operationId,
      tabLeaseId: settled.tabLeaseId,
      interactionClass: settled.interactionClass,
      mutability: settled.mutability,
      startsNewConversation: settled.startsNewConversation,
      type: 'interaction-settled',
      occurredAt: settled.settledAt ?? input.settledAt,
      effectState: settled.effectState,
      outcome: settled.outcome,
      providerWarning: null,
      reason: settled.stopReason,
    });
    return { ok: true, record: cloneRecord(settled) };
  }

  async observePassive(input: {
    scope: ProviderInteractionScope;
    workloadId: string;
    operationId: string;
    tabLeaseId?: string | null;
    observedAt: string;
  }): Promise<ProviderInteractionEvent> {
    const event = this.appendEvent({
      reservationId: null,
      scope: normalizeScope(input.scope),
      workloadId: requireNonEmpty(input.workloadId, 'workloadId'),
      operationId: requireNonEmpty(input.operationId, 'operationId'),
      tabLeaseId: normalizeOptional(input.tabLeaseId),
      interactionClass: 'passive-observation',
      mutability: 'read-only',
      startsNewConversation: false,
      type: 'passive-observed',
      occurredAt: new Date(parseTimestamp(input.observedAt, 'observedAt')).toISOString(),
      effectState: 'none',
      outcome: null,
      providerWarning: null,
      reason: null,
    });
    return cloneEvent(event);
  }

  async recordProviderWarning(input: {
    scope: ProviderInteractionScope;
    classification: ProviderWarningClassification;
    reason: string;
    observedAt: string;
    cooldownUntil?: string | null;
    evidence?: {
      classifierVersion: string;
      visibleSummary: string;
      sourceTargetClass: string;
      openTargetCount?: number | null;
      resourcePathClasses?: string[];
      precedingInteractionLimit?: number;
      trafficAdmission?: ProviderWarningEvidence['trafficAdmission'];
    } | null;
  }): Promise<{ warning: ProviderWarningRecord; frozenReservationIds: string[] }> {
    const scope = normalizeScope(input.scope);
    const observedAtMs = parseTimestamp(input.observedAt, 'observedAt');
    const cooldownUntil = input.cooldownUntil == null
      ? null
      : new Date(parseTimestamp(input.cooldownUntil, 'cooldownUntil')).toISOString();
    if (cooldownUntil !== null && Date.parse(cooldownUntil) <= observedAtMs) {
      throw new Error('cooldownUntil must be later than observedAt');
    }
    const warning: ProviderWarningRecord = {
      provider: scope.provider,
      tenantKey: scope.tenantKey,
      classification: input.classification,
      reason: requireNonEmpty(input.reason, 'reason'),
      observedAt: new Date(observedAtMs).toISOString(),
      cooldownUntil,
      evidence: input.evidence
        ? buildProviderWarningEvidence({
            input: input.evidence,
            observedAt: new Date(observedAtMs).toISOString(),
            events: this.events.filter(
              (event) => aggregateScopeKey(event.scope) === aggregateScopeKey(scope),
            ),
          })
        : null,
    };
    this.warnings.set(aggregateScopeKey(scope), warning);
    this.appendEvent({
      reservationId: null,
      scope,
      workloadId: null,
      operationId: null,
      tabLeaseId: null,
      interactionClass: null,
      mutability: null,
      startsNewConversation: false,
      type: 'provider-warning-observed',
      occurredAt: warning.observedAt,
      effectState: 'none',
      outcome: null,
      providerWarning: warning.classification,
      reason: warning.reason,
    });

    const frozenReservationIds: string[] = [];
    for (const [reservationId, record] of this.records) {
      if (
        aggregateScopeKey(record.scope) !== aggregateScopeKey(scope) ||
        (record.state !== 'reserved' && record.state !== 'started')
      ) continue;
      const frozen: ProviderInteractionRecord = {
        ...record,
        state: 'frozen',
        effectState: record.state === 'started' ? 'outcome-unknown' : record.effectState,
        frozenAt: warning.observedAt,
        providerWarning: warning.classification,
        stopReason: warning.reason,
      };
      this.records.set(reservationId, frozen);
      this.appendEvent({
        reservationId,
        scope: frozen.scope,
        workloadId: frozen.workloadId,
        operationId: frozen.operationId,
        tabLeaseId: frozen.tabLeaseId,
        interactionClass: frozen.interactionClass,
        mutability: frozen.mutability,
        startsNewConversation: frozen.startsNewConversation,
        type: 'interaction-frozen',
        occurredAt: warning.observedAt,
        effectState: frozen.effectState,
        outcome: null,
        providerWarning: warning.classification,
        reason: warning.reason,
      });
      frozenReservationIds.push(reservationId);
    }
    frozenReservationIds.sort();
    return { warning: cloneWarning(warning), frozenReservationIds };
  }

  async clearProviderWarning(input: {
    scope: ProviderInteractionScope;
    clearedAt: string;
    cooldownUntil?: string | null;
    reason: string;
  }): Promise<{ previous: ProviderWarningRecord | null; warning: ProviderWarningRecord | null }> {
    const scope = normalizeScope(input.scope);
    const key = aggregateScopeKey(scope);
    const previous = this.warnings.get(key) ?? null;
    const clearedAtMs = parseTimestamp(input.clearedAt, 'clearedAt');
    const cooldownUntil = input.cooldownUntil == null
      ? null
      : new Date(parseTimestamp(input.cooldownUntil, 'cooldownUntil')).toISOString();
    if (cooldownUntil !== null && Date.parse(cooldownUntil) <= clearedAtMs) {
      throw new Error('cooldownUntil must be later than clearedAt');
    }
    const warning = cooldownUntil && previous
      ? {
          ...previous,
          reason: requireNonEmpty(input.reason, 'reason'),
          observedAt: new Date(clearedAtMs).toISOString(),
          cooldownUntil,
        }
      : null;
    if (warning) this.warnings.set(key, warning);
    else this.warnings.delete(key);
    this.appendEvent({
      reservationId: null,
      scope,
      workloadId: null,
      operationId: null,
      tabLeaseId: null,
      interactionClass: null,
      mutability: null,
      startsNewConversation: false,
      type: 'provider-warning-cleared',
      occurredAt: new Date(clearedAtMs).toISOString(),
      effectState: 'none',
      outcome: null,
      providerWarning: previous?.classification ?? null,
      reason: requireNonEmpty(input.reason, 'reason'),
    });
    return {
      previous: previous ? cloneWarning(previous) : null,
      warning: warning ? cloneWarning(warning) : null,
    };
  }

  async listActiveProviderWarnings(input: { now: string }): Promise<ProviderWarningRecord[]> {
    const nowMs = parseTimestamp(input.now, 'now');
    return [...this.warnings.values()]
      .filter((warning) => isWarningActive(warning, nowMs))
      .map(cloneWarning)
      .sort((left, right) =>
        left.provider.localeCompare(right.provider) || left.observedAt.localeCompare(right.observedAt));
  }

  async list(
    scope: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>> = {},
  ): Promise<ProviderInteractionRecord[]> {
    const provider = scope.provider === undefined ? null : normalizeKey(scope.provider, 'provider');
    const tenantKey = scope.tenantKey === undefined ? null : normalizeKey(scope.tenantKey, 'tenantKey');
    return [...this.records.values()]
      .filter((record) => provider === null || record.scope.provider === provider)
      .filter((record) => tenantKey === null || record.scope.tenantKey === tenantKey)
      .map(cloneRecord);
  }

  async listEvents(
    scope: Partial<Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>> = {},
  ): Promise<ProviderInteractionEvent[]> {
    const provider = scope.provider === undefined ? null : normalizeKey(scope.provider, 'provider');
    const tenantKey = scope.tenantKey === undefined ? null : normalizeKey(scope.tenantKey, 'tenantKey');
    return this.events
      .filter((event) => provider === null || event.scope.provider === provider)
      .filter((event) => tenantKey === null || event.scope.tenantKey === tenantKey)
      .map(cloneEvent);
  }

  async summarizeUsage(input: {
    provider: string;
    tenantKey: string;
    now: string;
  }): Promise<ProviderInteractionUsageSummary> {
    const scope = {
      provider: normalizeKey(input.provider, 'provider'),
      tenantKey: normalizeKey(input.tenantKey, 'tenantKey'),
    };
    const nowMs = parseTimestamp(input.now, 'now');
    this.expireReservations(nowMs);
    const activeWorkloads = new Set<string>();
    for (const record of this.records.values()) {
      if (aggregateScopeKey(record.scope) !== aggregateScopeKey(scope)) continue;
      if (record.state === 'reserved' || record.state === 'started') {
        activeWorkloads.add(record.workloadId);
      }
    }
    return {
      activeChats: activeWorkloads.size,
      chatsLastHour: this.countConversationStarts(scope, nowMs - 60 * 60_000),
      chatsLastDay: this.countConversationStarts(scope, nowMs - 24 * 60 * 60_000),
      interactionsLastMinute: this.countInteractions(scope, nowMs - 60_000),
    };
  }

  async summarizeAggregateUsage(input: { now: string }): Promise<ProviderInteractionUsageSummary> {
    const nowMs = parseTimestamp(input.now, 'now');
    this.expireReservations(nowMs);
    const scopes = new Map<string, Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>>();
    const activeWorkloads = new Set<string>();
    for (const record of this.records.values()) {
      const scopeKey = aggregateScopeKey(record.scope);
      scopes.set(scopeKey, {
        provider: record.scope.provider,
        tenantKey: record.scope.tenantKey,
      });
      if (record.state === 'reserved' || record.state === 'started') {
        activeWorkloads.add(`${scopeKey}\0${record.workloadId}`);
      }
    }
    let chatsLastHour = 0;
    let chatsLastDay = 0;
    let interactionsLastMinute = 0;
    for (const scope of scopes.values()) {
      chatsLastHour += this.countConversationStarts(scope, nowMs - 60 * 60_000);
      chatsLastDay += this.countConversationStarts(scope, nowMs - 24 * 60 * 60_000);
      interactionsLastMinute += this.countInteractions(scope, nowMs - 60_000);
    }
    return {
      activeChats: activeWorkloads.size,
      chatsLastHour,
      chatsLastDay,
      interactionsLastMinute,
    };
  }

  private expireReservations(nowMs: number): void {
    for (const [reservationId, record] of this.records) {
      if (record.state !== 'reserved' || Date.parse(record.reservationExpiresAt) > nowMs) continue;
      const abandoned: ProviderInteractionRecord = {
        ...record,
        state: 'abandoned',
        settledAt: new Date(nowMs).toISOString(),
        stopReason: 'reservation-expired',
      };
      this.records.set(reservationId, abandoned);
      this.appendEvent({
        reservationId,
        scope: abandoned.scope,
        workloadId: abandoned.workloadId,
        operationId: abandoned.operationId,
        tabLeaseId: abandoned.tabLeaseId,
        interactionClass: abandoned.interactionClass,
        mutability: abandoned.mutability,
        startsNewConversation: abandoned.startsNewConversation,
        type: 'reservation-abandoned',
        occurredAt: abandoned.settledAt ?? new Date(nowMs).toISOString(),
        effectState: abandoned.effectState,
        outcome: null,
        providerWarning: null,
        reason: abandoned.stopReason,
      });
    }
  }

  private countConversationStarts(
    scope: Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>,
    cutoffMs: number,
  ): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (!record.startsNewConversation || aggregateScopeKey(record.scope) !== aggregateScopeKey(scope)) continue;
      if (record.state === 'reserved' || record.state === 'started') {
        if (Date.parse(record.reservedAt) >= cutoffMs) count += 1;
        continue;
      }
      if (record.state === 'settled') {
        if (
          record.effectState !== 'none' &&
          record.settledAt !== null &&
          Date.parse(record.settledAt) >= cutoffMs
        ) count += 1;
        continue;
      }
      if (record.state === 'frozen' && record.effectState === 'outcome-unknown') {
        const evidenceAt = record.startedAt ?? record.reservedAt;
        if (Date.parse(evidenceAt) >= cutoffMs) count += 1;
      }
    }
    return count;
  }

  private countInteractions(
    scope: Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>,
    cutoffMs: number,
  ): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (aggregateScopeKey(record.scope) !== aggregateScopeKey(scope)) continue;
      if (record.state === 'reserved') {
        if (Date.parse(record.reservedAt) >= cutoffMs) count += 1;
        continue;
      }
      if (record.state === 'started') {
        const evidenceAt = record.startedAt ?? record.reservedAt;
        if (Date.parse(evidenceAt) >= cutoffMs) count += 1;
        continue;
      }
      if (
        (record.state === 'settled' || record.state === 'frozen') &&
        record.effectState !== 'none'
      ) {
        const evidenceAt = record.startedAt ?? record.reservedAt;
        if (Date.parse(evidenceAt) >= cutoffMs) count += 1;
      }
    }
    return count;
  }

  private rejectAdmission(
    scope: ProviderInteractionScope,
    input: ReserveProviderInteractionInput,
    reason: ProviderInteractionAdmissionRejectionReason,
    warning?: ProviderWarningRecord,
  ): ProviderInteractionAdmission {
    this.appendEvent({
      reservationId: null,
      scope,
      workloadId: input.workloadId || null,
      operationId: input.operationId || null,
      tabLeaseId: input.tabLeaseId?.trim() || null,
      interactionClass: input.interactionClass,
      mutability: input.mutability,
      startsNewConversation: input.startsNewConversation,
      type: 'admission-rejected',
      occurredAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      effectState: 'none',
      outcome: null,
      providerWarning: warning?.classification ?? null,
      reason,
    });
    return warning
      ? { allowed: false, reason, warning: cloneWarning(warning) }
      : { allowed: false, reason };
  }

  private appendEvent(event: Omit<ProviderInteractionEvent, 'eventId'>): ProviderInteractionEvent {
    const stored = { eventId: crypto.randomUUID(), ...event, scope: { ...event.scope } };
    this.events.push(stored);
    return stored;
  }
}

class FileBackedProviderInteractionLedger implements ProviderInteractionLedger {
  private readonly ledgerRoot: string;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly createReservationId?: () => string;
  private readonly isOwnerAlive: (pid: number) => boolean;
  private readonly lockTimeoutMs: number;
  private readonly lockPollMs: number;

  constructor(options: FileBackedProviderInteractionLedgerOptions) {
    this.ledgerRoot = path.resolve(options.ledgerRoot);
    this.statePath = path.join(this.ledgerRoot, 'provider-interactions.v1.json');
    this.lockPath = path.join(this.ledgerRoot, 'provider-interactions.lock');
    this.createReservationId = options.createReservationId;
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
    this.lockTimeoutMs = normalizePositiveInteger(options.lockTimeoutMs ?? 5_000, 'lockTimeoutMs');
    this.lockPollMs = normalizePositiveInteger(options.lockPollMs ?? 25, 'lockPollMs');
  }

  reserve(input: ReserveProviderInteractionInput) {
    return this.write((ledger) => ledger.reserve(input));
  }

  bindTabLease(input: Parameters<ProviderInteractionLedger['bindTabLease']>[0]) {
    return this.write((ledger) => ledger.bindTabLease(input));
  }

  start(input: Parameters<ProviderInteractionLedger['start']>[0]) {
    return this.write((ledger) => ledger.start(input));
  }

  settle(input: Parameters<ProviderInteractionLedger['settle']>[0]) {
    return this.write((ledger) => ledger.settle(input));
  }

  observePassive(input: Parameters<ProviderInteractionLedger['observePassive']>[0]) {
    return this.write((ledger) => ledger.observePassive(input));
  }

  recordProviderWarning(input: Parameters<ProviderInteractionLedger['recordProviderWarning']>[0]) {
    return this.write((ledger) => ledger.recordProviderWarning(input));
  }

  clearProviderWarning(input: Parameters<ProviderInteractionLedger['clearProviderWarning']>[0]) {
    return this.write((ledger) => ledger.clearProviderWarning(input));
  }

  listActiveProviderWarnings(input: Parameters<ProviderInteractionLedger['listActiveProviderWarnings']>[0]) {
    return this.read((ledger) => ledger.listActiveProviderWarnings(input));
  }

  list(scope?: Parameters<ProviderInteractionLedger['list']>[0]) {
    return this.read((ledger) => ledger.list(scope));
  }

  listEvents(scope?: Parameters<ProviderInteractionLedger['listEvents']>[0]) {
    return this.read((ledger) => ledger.listEvents(scope));
  }

  summarizeUsage(input: Parameters<ProviderInteractionLedger['summarizeUsage']>[0]) {
    return this.write((ledger) => ledger.summarizeUsage(input));
  }

  summarizeAggregateUsage(input: Parameters<ProviderInteractionLedger['summarizeAggregateUsage']>[0]) {
    return this.write((ledger) => ledger.summarizeAggregateUsage(input));
  }

  private async read<T>(operation: (ledger: InMemoryProviderInteractionLedger) => Promise<T>): Promise<T> {
    return this.withLock(async () => operation(await this.loadLedger()));
  }

  private async write<T>(operation: (ledger: InMemoryProviderInteractionLedger) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const ledger = await this.loadLedger();
      const result = await operation(ledger);
      await this.persist(ledger.snapshot());
      return result;
    });
  }

  private async loadLedger(): Promise<InMemoryProviderInteractionLedger> {
    let snapshot: ProviderInteractionLedgerSnapshot = { records: [], warnings: [], events: [] };
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, 'utf8')) as {
        schemaVersion?: unknown;
        records?: unknown;
        warnings?: unknown;
        events?: unknown;
      };
      if (
        parsed.schemaVersion !== 1 ||
        !Array.isArray(parsed.records) ||
        !Array.isArray(parsed.warnings) ||
        !Array.isArray(parsed.events)
      ) {
        throw new Error(`Unsupported provider interaction ledger snapshot: ${this.statePath}`);
      }
      snapshot = {
        records: parsed.records as ProviderInteractionRecord[],
        warnings: parsed.warnings as ProviderWarningRecord[],
        events: parsed.events as ProviderInteractionEvent[],
      };
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
    return new InMemoryProviderInteractionLedger(
      { createReservationId: this.createReservationId },
      snapshot,
    );
  }

  private async persist(snapshot: ProviderInteractionLedgerSnapshot): Promise<void> {
    const tempPath = `${this.statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const handle = await fs.open(tempPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, ...snapshot }, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tempPath, this.statePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.ledgerRoot, { recursive: true });
    const startedAt = Date.now();
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    while (!handle) {
      try {
        handle = await fs.open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ ownerPid: process.pid, acquiredAt: new Date().toISOString() }));
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) throw error;
        if (await this.removeStaleLock()) continue;
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(`Timed out waiting for provider interaction ledger lock: ${this.lockPath}`);
        }
        await delay(this.lockPollMs);
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.rm(this.lockPath, { force: true });
    }
  }

  private async removeStaleLock(): Promise<boolean> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.lockPath, 'utf8')) as { ownerPid?: unknown };
      if (typeof parsed.ownerPid === 'number' && this.isOwnerAlive(parsed.ownerPid)) return false;
      await fs.rm(this.lockPath, { force: true });
      return true;
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return true;
      return false;
    }
  }
}

function aggregateScopeKey(scope: Pick<ProviderInteractionScope, 'provider' | 'tenantKey'>): string {
  return `${scope.provider}\0${scope.tenantKey}`;
}

function normalizeScope(scope: ProviderInteractionScope): ProviderInteractionScope {
  return {
    provider: normalizeKey(scope.provider, 'scope.provider'),
    tenantKey: normalizeKey(scope.tenantKey, 'scope.tenantKey'),
    runtimeProfileId: requireNonEmpty(scope.runtimeProfileId, 'scope.runtimeProfileId'),
    managedBrowserProfile: requireNonEmpty(scope.managedBrowserProfile, 'scope.managedBrowserProfile'),
  };
}

function isWarningActive(warning: ProviderWarningRecord, nowMs: number): boolean {
  return warning.cooldownUntil === null || Date.parse(warning.cooldownUntil) > nowMs;
}

function normalizeLimit(value: number | null, name: string): number | null {
  if (value === null) return null;
  return normalizePositiveInteger(value, name);
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return Math.floor(value);
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`);
  return parsed;
}

function normalizeKey(value: string, name: string): string {
  return requireNonEmpty(value, name).toLowerCase();
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  return requireNonEmpty(value, 'tabLeaseId');
}

function normalizeOptionalReason(value: string | null | undefined): string | null {
  if (value == null) return null;
  return requireNonEmpty(value, 'stopReason');
}

function cloneWarning(warning: ProviderWarningRecord): ProviderWarningRecord {
  return {
    ...warning,
    evidence: warning.evidence
      ? {
          ...warning.evidence,
          precedingInteractions: warning.evidence.precedingInteractions.map((entry) => ({ ...entry })),
          cumulativeCounts: { ...warning.evidence.cumulativeCounts },
          resourcePathClasses: [...warning.evidence.resourcePathClasses],
          ...(warning.evidence.trafficAdmission
            ? {
                trafficAdmission: {
                  version: 1,
                  phases: warning.evidence.trafficAdmission.phases.map((entry) => ({ ...entry })),
                  budgets: warning.evidence.trafficAdmission.budgets.map((entry) => ({ ...entry })),
                  ...(warning.evidence.trafficAdmission.recentEffects
                    ? {
                        recentEffects: warning.evidence.trafficAdmission.recentEffects.map((entry) => ({
                          ...entry,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        }
      : null,
  };
}

function buildProviderWarningEvidence(input: {
  input: {
    classifierVersion: string;
    visibleSummary: string;
    sourceTargetClass: string;
    openTargetCount?: number | null;
    resourcePathClasses?: string[];
    precedingInteractionLimit?: number;
    trafficAdmission?: ProviderWarningEvidence['trafficAdmission'];
  };
  observedAt: string;
  events: ProviderInteractionEvent[];
}): ProviderWarningEvidence {
  const limit = Math.min(50, Math.max(1, Math.floor(input.input.precedingInteractionLimit ?? 20)));
  const relevant = input.events.filter((event) =>
    event.type === 'interaction-started' ||
    event.type === 'interaction-settled' ||
    event.type === 'passive-observed'
  );
  const window = relevant.slice(-limit);
  let previousAt: number | null = null;
  const precedingInteractions = window.map((event) => {
    const at = Date.parse(event.occurredAt);
    const deltaMs = previousAt === null ? null : Math.max(0, at - previousAt);
    previousAt = at;
    return {
      occurredAt: event.occurredAt,
      deltaMs,
      interactionClass: event.interactionClass,
      eventType: event.type,
      outcome: event.outcome,
    } satisfies ProviderWarningInteractionEvidence;
  });
  const settled = relevant.filter((event) => event.type === 'interaction-settled');
  const countClass = (interactionClass: ProviderInteractionClass) =>
    settled.filter((event) => event.interactionClass === interactionClass).length;
  return {
    version: 1,
    classifierVersion: requireNonEmpty(input.input.classifierVersion, 'classifierVersion'),
    visibleSummary: requireNonEmpty(input.input.visibleSummary, 'visibleSummary'),
    sourceTargetClass: requireNonEmpty(input.input.sourceTargetClass, 'sourceTargetClass'),
    firstObservedAt: input.observedAt,
    openTargetCount:
      input.input.openTargetCount == null
        ? null
        : Math.max(0, Math.floor(input.input.openTargetCount)),
    precedingInteractions,
    cumulativeCounts: {
      interactions: settled.length,
      navigations: countClass('navigation'),
      reloads: countClass('reload'),
      conversationReads: countClass('conversation-read'),
      artifactReads: countClass('artifact-read'),
    },
    resourcePathClasses: [...new Set((input.input.resourcePathClasses ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean))].slice(0, 20),
    ...(input.input.trafficAdmission
      ? {
          trafficAdmission: {
            version: 1,
            phases: input.input.trafficAdmission.phases.map(sanitizeTrafficAdmissionEntry),
            budgets: input.input.trafficAdmission.budgets.map(sanitizeTrafficAdmissionEntry),
            ...(input.input.trafficAdmission.recentEffects
              ? {
                  recentEffects: input.input.trafficAdmission.recentEffects.slice(-20).map((entry) => ({
                    occurredAt: new Date(Date.parse(entry.occurredAt)).toISOString(),
                    phase: requireNonEmpty(entry.phase, 'trafficAdmission.effect.phase').toLowerCase(),
                    kind: requireNonEmpty(entry.kind, 'trafficAdmission.effect.kind').toLowerCase(),
                    outcome: requireNonEmpty(entry.outcome, 'trafficAdmission.effect.outcome').toLowerCase(),
                  })),
                }
              : {}),
          },
        }
      : {}),
  };
}

function sanitizeTrafficAdmissionEntry<
  T extends { phase: string; admitted: number; limit: number; remaining: number },
>(
  entry: T,
): T {
  return {
    ...entry,
    phase: requireNonEmpty(entry.phase, 'trafficAdmission.phase').toLowerCase(),
    admitted: Math.max(0, Math.floor(entry.admitted)),
    limit: Math.max(0, Math.floor(entry.limit)),
    remaining: Math.max(0, Math.floor(entry.remaining)),
  };
}

function cloneRecord(record: ProviderInteractionRecord): ProviderInteractionRecord {
  return { ...record, scope: { ...record.scope } };
}

function cloneEvent(event: ProviderInteractionEvent): ProviderInteractionEvent {
  return { ...event, scope: { ...event.scope } };
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
