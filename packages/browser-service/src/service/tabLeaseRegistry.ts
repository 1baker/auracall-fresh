import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isProcessAlive } from '../processCheck.js';

export type TabLeaseState = 'active' | 'idle' | 'retiring' | 'released' | 'lost';
export type TabLeaseEffectState = 'none' | 'in-flight' | 'settled' | 'outcome-unknown';

export type TabLeaseWorkload =
  | { kind: 'new-conversation'; reservationId: string }
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'live-follow'; operationId: string }
  | { kind: 'ephemeral'; operationId: string };

export interface TabLeaseScope {
  runtimeProfileId: string;
  managedBrowserProfile: string;
  service: string;
  tenantKey: string;
}

export type BrowserProfileControlScope = Pick<
  TabLeaseScope,
  'runtimeProfileId' | 'managedBrowserProfile' | 'service'
>;
export type BrowserProfileControlKind =
  | 'browser-startup'
  | 'browser-shutdown'
  | 'login'
  | 'setup'
  | 'cookie-bootstrap'
  | 'profile-replacement';

export interface BrowserProfileControlRecord {
  controlId: string;
  revision: number;
  scope: BrowserProfileControlScope;
  kind: BrowserProfileControlKind;
  ownerOperationId: string;
  state: 'active' | 'released';
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  releasedAt: string | null;
}

export interface BrowserProfileControlClaim {
  controlId: string;
  revision: number;
  operationId: string;
}

export type BrowserProfileControlAcquireResult =
  | {
      acquired: true;
      control: BrowserProfileControlRecord;
      claim: BrowserProfileControlClaim;
    }
  | {
      acquired: false;
      reason: 'profile-control-active' | 'tab-leases-active';
      blockingControl?: BrowserProfileControlRecord;
      blockingTargetIds?: string[];
    };

export interface BrowserTabLease {
  leaseId: string;
  revision: number;
  scope: TabLeaseScope;
  targetId: string;
  workload: TabLeaseWorkload;
  state: TabLeaseState;
  ownerOperationId: string | null;
  ownerProcessId?: number | null;
  ownerInstanceId?: string | null;
  processBinding?: { processId: number; instanceId: string };
  retention?: 'live-follow' | 'ttl';
  effectState: TabLeaseEffectState;
  acquiredAt: string;
  heartbeatAt: string;
  lastMeaningfulUseAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  targetFingerprint: string | null;
  retirementReason: TabLeaseRetirementReason | null;
  finalDisposition: TabLeaseFinalDisposition | null;
  lossReason: TabLeaseLossReason | null;
  actionCounts: BrowserTabActionCounts;
}

export interface BrowserTabActionCounts {
  targetCreations: number;
  adoptions: number;
  navigations: number;
  reloads: number;
  focuses: number;
  closes: number;
}

export type BrowserTabTargetAction = 'target-created' | 'adopted' | 'navigation' | 'reload' | 'focus';

export type TabLeaseRetirementReason = 'idle-expired' | 'absolute-expired' | 'cancelled' | 'operator';
export type TabLeaseFinalDisposition = 'closed' | 'already-missing' | 'preserved';
export type TabLeaseLossReason =
  | 'target-missing'
  | 'restart-unverified'
  | 'heartbeat-expired'
  | 'identity-conflict'
  | 'provisioning-failed';

export interface TabLeaseClaim {
  leaseId: string;
  revision: number;
  operationId: string;
}

export function isTabLeaseTtlExempt(lease: BrowserTabLease): boolean {
  return lease.retention ? lease.retention === 'live-follow' : lease.workload.kind === 'live-follow';
}

export type TabLeaseConflict =
  | { kind: 'process-owned'; lease: BrowserTabLease }
  | { kind: 'target-owned'; lease: BrowserTabLease }
  | { kind: 'workload-owned'; lease: BrowserTabLease }
  | { kind: 'not-found' }
  | { kind: 'stale-claim'; lease: BrowserTabLease }
  | { kind: 'invalid-transition'; lease: BrowserTabLease }
  | { kind: 'profile-controlled'; control: BrowserProfileControlRecord };

export type TabLeaseResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: TabLeaseConflict };

export interface ReserveTabLeaseInput {
  scope: TabLeaseScope;
  targetId: string;
  workload: TabLeaseWorkload;
  operationId: string;
  now: string;
  idleTtlMs: number;
  absoluteTtlMs: number;
  targetFingerprint?: string | null;
  processBound?: boolean;
}

export interface BrowserTabLeaseRegistry {
  findByProcess(scope: TabLeaseScope): Promise<BrowserTabLease | null>;
  acquireProcess(input: {
    leaseId: string;
    expectedRevision: number;
    scope: TabLeaseScope;
    workload: TabLeaseWorkload;
    operationId: string;
    now: string;
    idleTtlMs: number;
    absoluteTtlMs: number;
  }): Promise<TabLeaseResult<{ lease: BrowserTabLease; claim: TabLeaseClaim }>>;
  acquireProfileControl(input: {
    scope: BrowserProfileControlScope;
    kind: BrowserProfileControlKind;
    operationId: string;
    now: string;
    ttlMs: number;
  }): Promise<BrowserProfileControlAcquireResult>;
  releaseProfileControl(input: {
    claim: BrowserProfileControlClaim;
    releasedAt: string;
  }): Promise<boolean>;
  reserve(input: ReserveTabLeaseInput): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  bindConversation(input: {
    claim: TabLeaseClaim;
    conversationId: string;
    targetFingerprint: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  /** Renew active-owner liveness without recording meaningful provider activity. */
  heartbeat(input: {
    claim: TabLeaseClaim;
    now: string;
    idleTtlMs: number;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  recordMeaningfulUse(input: {
    claim: TabLeaseClaim;
    now: string;
    idleTtlMs: number;
    targetFingerprint?: string | null;
    effectState?: TabLeaseEffectState;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  recordTargetAction(input: {
    claim: TabLeaseClaim;
    action: BrowserTabTargetAction;
    occurredAt: string;
    idleTtlMs: number;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  idle(input: {
    claim: TabLeaseClaim;
    now: string;
    effectState: Exclude<TabLeaseEffectState, 'in-flight'>;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  acquire(input: {
    scope: TabLeaseScope;
    workload: TabLeaseWorkload;
    operationId: string;
    now: string;
    processBound?: boolean;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>>;
  beginRetirement(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseRetirementReason;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    retirementRevision: number;
  }>>;
  finishRetirement(input: {
    leaseId: string;
    retirementRevision: number;
    now: string;
    disposition: TabLeaseFinalDisposition;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  markLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseLossReason;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  releaseLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    disposition: Extract<TabLeaseFinalDisposition, 'closed' | 'already-missing'>;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  releasePreserved(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
  }): Promise<TabLeaseResult<BrowserTabLease>>;
  listFencedTargetIds(scope: TabLeaseScope): Promise<string[]>;
  findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null>;
  list(input?: {
    scope?: Partial<TabLeaseScope>;
    states?: readonly TabLeaseState[];
  }): Promise<BrowserTabLease[]>;
}

export interface InMemoryBrowserTabLeaseRegistryOptions {
  createLeaseId?: () => string;
  createControlId?: () => string;
  ownerIdentity?: { processId: number; instanceId: string };
  isOwnerAlive?: (pid: number) => boolean;
}

export interface FileBackedBrowserTabLeaseRegistryOptions extends InMemoryBrowserTabLeaseRegistryOptions {
  registryRoot: string;
  isOwnerAlive?: (pid: number) => boolean;
  lockTimeoutMs?: number;
  lockPollMs?: number;
}

const FENCED_STATES = new Set<TabLeaseState>(['active', 'idle', 'retiring', 'lost']);

const CURRENT_TAB_LEASE_OWNER_INSTANCE_ID = crypto.randomUUID();

export function getCurrentTabLeaseOwnerIdentity(): {
  processId: number;
  instanceId: string;
} {
  return { processId: process.pid, instanceId: CURRENT_TAB_LEASE_OWNER_INSTANCE_ID };
}

interface TabLeaseRegistrySnapshot {
  leases: BrowserTabLease[];
  controls: BrowserProfileControlRecord[];
}

export function createInMemoryBrowserTabLeaseRegistry(
  options: InMemoryBrowserTabLeaseRegistryOptions = {},
): BrowserTabLeaseRegistry {
  return new InMemoryBrowserTabLeaseRegistry(options);
}

export function createFileBackedBrowserTabLeaseRegistry(
  options: FileBackedBrowserTabLeaseRegistryOptions,
): BrowserTabLeaseRegistry {
  return new FileBackedBrowserTabLeaseRegistry(options);
}

class InMemoryBrowserTabLeaseRegistry implements BrowserTabLeaseRegistry {
  private readonly leases = new Map<string, BrowserTabLease>();
  private readonly controls = new Map<string, BrowserProfileControlRecord>();
  private readonly createLeaseId: () => string;
  private readonly createControlId: () => string;
  private readonly ownerIdentity: { processId: number; instanceId: string };
  private readonly isOwnerAlive: (pid: number) => boolean;

  constructor(
    options: InMemoryBrowserTabLeaseRegistryOptions,
    snapshot: TabLeaseRegistrySnapshot = { leases: [], controls: [] },
  ) {
    this.createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());
    this.createControlId = options.createControlId ?? (() => crypto.randomUUID());
    this.ownerIdentity = options.ownerIdentity ?? getCurrentTabLeaseOwnerIdentity();
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
    for (const lease of snapshot.leases) this.leases.set(lease.leaseId, cloneLease(lease));
    for (const control of snapshot.controls) {
      this.controls.set(control.controlId, cloneControl(control));
    }
  }

  snapshot(): TabLeaseRegistrySnapshot {
    return {
      leases: [...this.leases.values()].map(cloneLease),
      controls: [...this.controls.values()].map(cloneControl),
    };
  }

  async acquireProfileControl(input: {
    scope: BrowserProfileControlScope;
    kind: BrowserProfileControlKind;
    operationId: string;
    now: string;
    ttlMs: number;
  }): Promise<BrowserProfileControlAcquireResult> {
    const scope = normalizeControlScope(input.scope);
    const nowMs = parseTimestamp(input.now, 'now');
    this.pruneExpiredControls(nowMs);
    const blockingControl = [...this.controls.values()].find((control) =>
      control.state === 'active' && sameControlScope(control.scope, scope));
    if (blockingControl) {
      return {
        acquired: false,
        reason: 'profile-control-active',
        blockingControl: cloneControl(blockingControl),
      };
    }
    const blockingTargetIds = [...this.leases.values()]
      .filter((lease) => FENCED_STATES.has(lease.state) && sameControlScope(lease.scope, scope))
      .map((lease) => lease.targetId)
      .sort();
    if (blockingTargetIds.length > 0) {
      return { acquired: false, reason: 'tab-leases-active', blockingTargetIds };
    }
    const controlId = requireNonEmpty(this.createControlId(), 'controlId');
    if (this.controls.has(controlId)) throw new Error(`Profile control ID already exists: ${controlId}`);
    const now = new Date(nowMs).toISOString();
    const control: BrowserProfileControlRecord = {
      controlId,
      revision: 1,
      scope,
      kind: input.kind,
      ownerOperationId: requireNonEmpty(input.operationId, 'operationId'),
      state: 'active',
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: new Date(nowMs + normalizeTtl(input.ttlMs, 'ttlMs')).toISOString(),
      releasedAt: null,
    };
    this.controls.set(controlId, control);
    return {
      acquired: true,
      control: cloneControl(control),
      claim: { controlId, revision: control.revision, operationId: control.ownerOperationId },
    };
  }

  async releaseProfileControl(input: {
    claim: BrowserProfileControlClaim;
    releasedAt: string;
  }): Promise<boolean> {
    const existing = this.controls.get(input.claim.controlId);
    if (
      !existing ||
      existing.state !== 'active' ||
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) return false;
    const releasedAt = new Date(parseTimestamp(input.releasedAt, 'releasedAt')).toISOString();
    this.controls.set(existing.controlId, {
      ...existing,
      revision: existing.revision + 1,
      state: 'released',
      heartbeatAt: releasedAt,
      releasedAt,
    });
    return true;
  }

  async findByProcess(scope: TabLeaseScope): Promise<BrowserTabLease | null> {
    const normalized = normalizeScope(scope);
    const candidates = [...this.leases.values()].filter(candidate =>
      FENCED_STATES.has(candidate.state) && sameOwnershipScope(candidate.scope, normalized));
    const lease = candidates.find(candidate => this.ownsProcessBinding(candidate)) ??
      candidates.find(candidate => candidate.state === 'idle' && candidate.effectState !== 'outcome-unknown' &&
        this.canAdoptProcessBinding(candidate));
    return lease ? cloneLease(lease) : null;
  }

  private ownsProcessBinding(lease: BrowserTabLease): boolean {
    return lease.processBinding?.processId === this.ownerIdentity.processId;
  }

  private canAdoptProcessBinding(lease: BrowserTabLease): boolean {
    if (this.ownsProcessBinding(lease)) return true;
    if (!lease.processBinding) return false;
    return lease.processBinding.processId === this.ownerIdentity.processId ||
      !this.isOwnerAlive(lease.processBinding.processId);
  }

  async acquireProcess(input: Parameters<BrowserTabLeaseRegistry['acquireProcess']>[0]) {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false as const, conflict: { kind: 'not-found' as const } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false as const, conflict: { kind: 'stale-claim' as const, lease: cloneLease(existing) } };
    }
    const scope = normalizeScope(input.scope);
    const workload = normalizeWorkload(input.workload);
    const processTab = await this.findByProcess(scope);
    if (processTab && processTab.leaseId !== existing.leaseId && this.ownsProcessBinding(processTab)) {
      return { ok: false as const, conflict: { kind: 'process-owned' as const, lease: processTab } };
    }
    const nowMs = parseTimestamp(input.now, 'now');
    const idleTtlMs = normalizeTtl(input.idleTtlMs, 'idleTtlMs');
    const absoluteTtlMs = normalizeTtl(input.absoluteTtlMs, 'absoluteTtlMs');
    if (idleTtlMs > absoluteTtlMs) throw new Error('idleTtlMs cannot exceed absoluteTtlMs');
    if (!sameOwnershipScope(existing.scope, scope) ||
      !this.canAdoptProcessBinding(existing) ||
      existing.state !== 'idle' || (existing.effectState !== 'none' && existing.effectState !== 'settled') ||
      (!isTabLeaseTtlExempt(existing) &&
        (nowMs >= Date.parse(existing.idleExpiresAt) || nowMs >= Date.parse(existing.absoluteExpiresAt)))) {
      return { ok: false as const, conflict: { kind: 'process-owned' as const, lease: cloneLease(existing) } };
    }
    const other = [...this.leases.values()].find(candidate => candidate.leaseId !== existing.leaseId &&
      FENCED_STATES.has(candidate.state) && sameOwnershipScope(candidate.scope, scope) &&
      sameWorkload(candidate.workload, workload));
    if (other) return { ok: false as const, conflict: { kind: 'workload-owned' as const, lease: cloneLease(other) } };
    const operationId = requireNonEmpty(input.operationId, 'operationId');
    const lease: BrowserTabLease = {
      ...existing, workload, revision: existing.revision + 1, state: 'active',
      ownerOperationId: operationId, ownerProcessId: this.ownerIdentity.processId,
      ownerInstanceId: this.ownerIdentity.instanceId, heartbeatAt: input.now,
      processBinding: { ...this.ownerIdentity },
      retention: isTabLeaseTtlExempt(existing) || workload.kind === 'live-follow' ? 'live-follow' : 'ttl',
      idleExpiresAt: new Date(nowMs + idleTtlMs).toISOString(),
      absoluteExpiresAt: isTabLeaseTtlExempt(existing) ? new Date(nowMs + absoluteTtlMs).toISOString() : existing.absoluteExpiresAt,
    };
    this.leases.set(lease.leaseId, lease);
    return { ok: true as const, value: { lease: cloneLease(lease), claim: { leaseId: lease.leaseId, revision: lease.revision, operationId } } };
  }

  async reserve(input: ReserveTabLeaseInput): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const normalized = normalizeReserveInput(input);
    const nowMs = parseTimestamp(normalized.now, 'now');
    this.pruneExpiredControls(nowMs);
    const blockingControl = [...this.controls.values()].find((control) =>
      control.state === 'active' && sameControlScope(control.scope, normalized.scope));
    if (blockingControl) {
      return { ok: false, conflict: { kind: 'profile-controlled', control: cloneControl(blockingControl) } };
    }
    for (const existing of this.leases.values()) {
      if (!FENCED_STATES.has(existing.state)) continue;
      if (normalized.processBound && sameOwnershipScope(existing.scope, normalized.scope) &&
        existing.processBinding?.processId === this.ownerIdentity.processId) {
        return { ok: false, conflict: { kind: 'process-owned', lease: cloneLease(existing) } };
      }
      if (
        sameTargetDomain(existing.scope, normalized.scope) &&
        existing.targetId === normalized.targetId
      ) {
        return { ok: false, conflict: { kind: 'target-owned', lease: cloneLease(existing) } };
      }
      if (
        sameOwnershipScope(existing.scope, normalized.scope) &&
        sameWorkload(existing.workload, normalized.workload)
      ) {
        return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(existing) } };
      }
    }

    const leaseId = requireNonEmpty(this.createLeaseId(), 'leaseId');
    if (this.leases.has(leaseId)) {
      throw new Error(`Tab lease ID already exists: ${leaseId}`);
    }
    const lease: BrowserTabLease = {
      leaseId,
      revision: 1,
      scope: normalized.scope,
      targetId: normalized.targetId,
      workload: normalized.workload,
      state: 'active',
      ownerOperationId: normalized.operationId,
      ownerProcessId: this.ownerIdentity.processId,
      ownerInstanceId: this.ownerIdentity.instanceId,
      ...(normalized.processBound ? { processBinding: { ...this.ownerIdentity } } : {}),
      retention: normalized.workload.kind === 'live-follow' ? 'live-follow' : 'ttl',
      effectState: 'none',
      acquiredAt: normalized.now,
      heartbeatAt: normalized.now,
      lastMeaningfulUseAt: normalized.now,
      idleExpiresAt: new Date(nowMs + normalized.idleTtlMs).toISOString(),
      absoluteExpiresAt: new Date(nowMs + normalized.absoluteTtlMs).toISOString(),
      targetFingerprint: normalized.targetFingerprint ?? null,
      retirementReason: null,
      finalDisposition: null,
      lossReason: null,
      actionCounts: emptyActionCounts(),
    };
    this.leases.set(leaseId, lease);
    return {
      ok: true,
      value: {
        lease: cloneLease(lease),
        claim: { leaseId, revision: lease.revision, operationId: normalized.operationId },
      },
    };
  }

  async bindConversation(input: {
    claim: TabLeaseClaim;
    conversationId: string;
    targetFingerprint: string;
    now: string;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active' || existing.workload.kind !== 'new-conversation') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }

    const now = new Date(parseTimestamp(input.now, 'now')).toISOString();
    const workload: TabLeaseWorkload = {
      kind: 'conversation',
      conversationId: requireNonEmpty(input.conversationId, 'conversationId'),
    };
    for (const other of this.leases.values()) {
      if (
        other.leaseId !== existing.leaseId &&
        FENCED_STATES.has(other.state) &&
        sameOwnershipScope(other.scope, existing.scope) &&
        sameWorkload(other.workload, workload)
      ) {
        return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(other) } };
      }
    }

    const rebound: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      workload,
      heartbeatAt: now,
      lastMeaningfulUseAt: now,
      targetFingerprint: requireNonEmpty(input.targetFingerprint, 'targetFingerprint'),
    };
    this.leases.set(rebound.leaseId, rebound);
    return {
      ok: true,
      value: {
        lease: cloneLease(rebound),
        claim: {
          leaseId: rebound.leaseId,
          revision: rebound.revision,
          operationId: input.claim.operationId,
        },
      },
    };
  }

  recordMeaningfulUse(input: Parameters<BrowserTabLeaseRegistry['recordMeaningfulUse']>[0]) {
    return this.renewHeartbeat(input, true);
  }

  heartbeat(input: Parameters<BrowserTabLeaseRegistry['heartbeat']>[0]) {
    return this.renewHeartbeat({ claim: input.claim, now: input.now, idleTtlMs: input.idleTtlMs }, false);
  }

  private async renewHeartbeat(
    input: Parameters<BrowserTabLeaseRegistry['recordMeaningfulUse']>[0],
    meaningfulUse: boolean,
  ): ReturnType<BrowserTabLeaseRegistry['recordMeaningfulUse']> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }

    const nowMs = parseTimestamp(input.now, 'now');
    const absoluteExpiresAtMs = parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt');
    if (!meaningfulUse && (nowMs >= parseTimestamp(existing.idleExpiresAt, 'idleExpiresAt') ||
      (!isTabLeaseTtlExempt(existing) && nowMs >= absoluteExpiresAtMs))) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    if (nowMs > absoluteExpiresAtMs && !isTabLeaseTtlExempt(existing)) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const now = new Date(nowMs).toISOString();
    const updated: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      heartbeatAt: now,
      lastMeaningfulUseAt: meaningfulUse ? now : existing.lastMeaningfulUseAt,
      idleExpiresAt: new Date(
        isTabLeaseTtlExempt(existing)
          ? nowMs + normalizeTtl(input.idleTtlMs, 'idleTtlMs')
          : Math.min(nowMs + normalizeTtl(input.idleTtlMs, 'idleTtlMs'), absoluteExpiresAtMs),
      ).toISOString(),
      targetFingerprint: input.targetFingerprint === undefined
        ? existing.targetFingerprint
        : normalizeOptional(input.targetFingerprint) ?? null,
      effectState: input.effectState ?? existing.effectState,
    };
    this.leases.set(updated.leaseId, updated);
    return {
      ok: true,
      value: {
        lease: cloneLease(updated),
        claim: {
          leaseId: updated.leaseId,
          revision: updated.revision,
          operationId: input.claim.operationId,
        },
      },
    };
  }

  async recordTargetAction(input: {
    claim: TabLeaseClaim;
    action: BrowserTabTargetAction;
    occurredAt: string;
    idleTtlMs: number;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const occurredAtMs = parseTimestamp(input.occurredAt, 'occurredAt');
    const absoluteExpiresAtMs = parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt');
    if (occurredAtMs > absoluteExpiresAtMs && !isTabLeaseTtlExempt(existing)) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const actionCounts = cloneActionCounts(existing.actionCounts);
    actionCounts[actionCountKey(input.action)] += 1;
    const occurredAt = new Date(occurredAtMs).toISOString();
    const updated: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      heartbeatAt: occurredAt,
      lastMeaningfulUseAt: occurredAt,
      idleExpiresAt: new Date(
        isTabLeaseTtlExempt(existing)
          ? occurredAtMs + normalizeTtl(input.idleTtlMs, 'idleTtlMs')
          : Math.min(
          occurredAtMs + normalizeTtl(input.idleTtlMs, 'idleTtlMs'),
          absoluteExpiresAtMs,
        ),
      ).toISOString(),
      actionCounts,
    };
    this.leases.set(updated.leaseId, updated);
    return {
      ok: true,
      value: {
        lease: cloneLease(updated),
        claim: {
          leaseId: updated.leaseId,
          revision: updated.revision,
          operationId: input.claim.operationId,
        },
      },
    };
  }

  async idle(input: {
    claim: TabLeaseClaim;
    now: string;
    effectState: Exclude<TabLeaseEffectState, 'in-flight'>;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.claim.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (
      existing.revision !== input.claim.revision ||
      existing.ownerOperationId !== input.claim.operationId
    ) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'active') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const now = new Date(parseTimestamp(input.now, 'now')).toISOString();
    const idled: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'idle',
      ownerOperationId: null,
      ownerProcessId: null,
      ownerInstanceId: null,
      heartbeatAt: now,
      effectState: input.effectState,
    };
    this.leases.set(idled.leaseId, idled);
    return { ok: true, value: cloneLease(idled) };
  }

  async acquire(input: {
    scope: TabLeaseScope;
    workload: TabLeaseWorkload;
    operationId: string;
    now: string;
    processBound?: boolean;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    claim: TabLeaseClaim;
  }>> {
    const scope = normalizeScope(input.scope);
    const workload = normalizeWorkload(input.workload);
    const operationId = requireNonEmpty(input.operationId, 'operationId');
    const nowMs = parseTimestamp(input.now, 'now');
    const existing = [...this.leases.values()].find((lease) =>
      FENCED_STATES.has(lease.state) &&
      sameOwnershipScope(lease.scope, scope) &&
      sameWorkload(lease.workload, workload));
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.state === 'active') {
      return { ok: false, conflict: { kind: 'workload-owned', lease: cloneLease(existing) } };
    }
    if (
      existing.state !== 'idle' ||
      existing.effectState === 'outcome-unknown' ||
      ((!isTabLeaseTtlExempt(existing)) &&
        (nowMs >= parseTimestamp(existing.idleExpiresAt, 'idleExpiresAt') ||
        nowMs >= parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt')))
    ) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    if (input.processBound) {
      if (existing.processBinding && !this.canAdoptProcessBinding(existing)) {
        return { ok: false, conflict: { kind: 'process-owned', lease: cloneLease(existing) } };
      }
      const other = await this.findByProcess(scope);
      if (other && other.leaseId !== existing.leaseId) return { ok: false, conflict: { kind: 'process-owned', lease: other } };
    }
    const acquired: BrowserTabLease = {
      ...existing,
      scope,
      revision: existing.revision + 1,
      state: 'active',
      ownerOperationId: operationId,
      ownerProcessId: this.ownerIdentity.processId,
      ownerInstanceId: this.ownerIdentity.instanceId,
      ...(input.processBound ? { processBinding: { ...this.ownerIdentity } } : {}),
      heartbeatAt: new Date(nowMs).toISOString(),
    };
    this.leases.set(acquired.leaseId, acquired);
    return {
      ok: true,
      value: {
        lease: cloneLease(acquired),
        claim: {
          leaseId: acquired.leaseId,
          revision: acquired.revision,
          operationId,
        },
      },
    };
  }

  async beginRetirement(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseRetirementReason;
  }): Promise<TabLeaseResult<{
    lease: BrowserTabLease;
    retirementRevision: number;
  }>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    const nowMs = parseTimestamp(input.now, 'now');
    const reasonIsEligible =
      (input.reason === 'idle-expired' && nowMs >= parseTimestamp(existing.idleExpiresAt, 'idleExpiresAt')) ||
      (input.reason === 'absolute-expired' && nowMs >= parseTimestamp(existing.absoluteExpiresAt, 'absoluteExpiresAt')) ||
      input.reason === 'cancelled' ||
      input.reason === 'operator';
    if (
      existing.state !== 'idle' ||
      existing.ownerOperationId !== null ||
      existing.effectState === 'in-flight' ||
      !reasonIsEligible
    ) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const retiring: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'retiring',
      heartbeatAt: new Date(nowMs).toISOString(),
      retirementReason: input.reason,
    };
    this.leases.set(retiring.leaseId, retiring);
    return {
      ok: true,
      value: { lease: cloneLease(retiring), retirementRevision: retiring.revision },
    };
  }

  async finishRetirement(input: {
    leaseId: string;
    retirementRevision: number;
    now: string;
    disposition: TabLeaseFinalDisposition;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.retirementRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'retiring') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const finished: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: input.disposition === 'preserved' ? 'lost' : 'released',
      heartbeatAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      finalDisposition: input.disposition,
      actionCounts: {
        ...existing.actionCounts,
        closes: existing.actionCounts.closes + (input.disposition === 'closed' ? 1 : 0),
      },
    };
    this.leases.set(finished.leaseId, finished);
    return { ok: true, value: cloneLease(finished) };
  }

  async markLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    reason: TabLeaseLossReason;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state === 'released' || existing.state === 'lost') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const lost: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'lost',
      ownerOperationId: null,
      ownerProcessId: null,
      ownerInstanceId: null,
      heartbeatAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      lossReason: input.reason,
      retention: 'ttl',
    };
    this.leases.set(lost.leaseId, lost);
    return { ok: true, value: cloneLease(lost) };
  }

  async releaseLost(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
    disposition: Extract<TabLeaseFinalDisposition, 'closed' | 'already-missing'>;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (existing.state !== 'lost') {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const now = new Date(parseTimestamp(input.now, 'now')).toISOString();
    const released: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'released',
      heartbeatAt: now,
      finalDisposition: input.disposition,
      actionCounts: {
        ...existing.actionCounts,
        closes: existing.actionCounts.closes + (input.disposition === 'closed' ? 1 : 0),
      },
    };
    this.leases.set(released.leaseId, released);
    return { ok: true, value: cloneLease(released) };
  }

  async releasePreserved(input: {
    leaseId: string;
    expectedRevision: number;
    now: string;
  }): Promise<TabLeaseResult<BrowserTabLease>> {
    const existing = this.leases.get(input.leaseId);
    if (!existing) return { ok: false, conflict: { kind: 'not-found' } };
    if (existing.revision !== input.expectedRevision) {
      return { ok: false, conflict: { kind: 'stale-claim', lease: cloneLease(existing) } };
    }
    if (
      (existing.state !== 'idle' && existing.state !== 'lost') ||
      existing.ownerOperationId !== null ||
      existing.ownerProcessId != null ||
      existing.ownerInstanceId != null ||
      existing.effectState === 'in-flight' ||
      existing.effectState === 'outcome-unknown'
    ) {
      return { ok: false, conflict: { kind: 'invalid-transition', lease: cloneLease(existing) } };
    }
    const released: BrowserTabLease = {
      ...existing,
      revision: existing.revision + 1,
      state: 'released',
      heartbeatAt: new Date(parseTimestamp(input.now, 'now')).toISOString(),
      finalDisposition: 'preserved',
    };
    this.leases.set(released.leaseId, released);
    return { ok: true, value: cloneLease(released) };
  }

  async listFencedTargetIds(scope: TabLeaseScope): Promise<string[]> {
    const normalizedScope = normalizeScope(scope);
    return [...this.leases.values()]
      .filter((lease) =>
        FENCED_STATES.has(lease.state) && sameTargetDomain(lease.scope, normalizedScope))
      .map((lease) => lease.targetId)
      .sort();
  }

  async findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload): Promise<BrowserTabLease | null> {
    const normalizedScope = normalizeScope(scope);
    const normalizedWorkload = normalizeWorkload(workload);
    for (const lease of this.leases.values()) {
      if (
        FENCED_STATES.has(lease.state) &&
        sameOwnershipScope(lease.scope, normalizedScope) &&
        sameWorkload(lease.workload, normalizedWorkload)
      ) {
        return cloneLease(lease);
      }
    }
    return null;
  }

  private pruneExpiredControls(nowMs: number): void {
    for (const [controlId, control] of this.controls) {
      if (control.state !== 'active' || Date.parse(control.expiresAt) > nowMs) continue;
      const releasedAt = new Date(nowMs).toISOString();
      this.controls.set(controlId, {
        ...control,
        revision: control.revision + 1,
        state: 'released',
        heartbeatAt: releasedAt,
        releasedAt,
      });
    }
  }

  async list(input: {
    scope?: Partial<TabLeaseScope>;
    states?: readonly TabLeaseState[];
  } = {}): Promise<BrowserTabLease[]> {
    return [...this.leases.values()]
      .filter((lease) => matchesPartialScope(lease.scope, input.scope))
      .filter((lease) => !input.states || input.states.includes(lease.state))
      .map(cloneLease);
  }
}

// Share only concurrent identical observations, never settled custody state.
// Mutations continue through the exclusive registry lock and atomic persistence.
const pendingLeaseLists = new Map<string, Promise<BrowserTabLease[]>>();

class FileBackedBrowserTabLeaseRegistry implements BrowserTabLeaseRegistry {
  private readonly registryRoot: string;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly createLeaseId?: () => string;
  private readonly createControlId?: () => string;
  private readonly ownerIdentity?: { processId: number; instanceId: string };
  private readonly isOwnerAlive: (pid: number) => boolean;
  private readonly lockTimeoutMs: number;
  private readonly lockPollMs: number;

  constructor(options: FileBackedBrowserTabLeaseRegistryOptions) {
    this.registryRoot = path.resolve(options.registryRoot);
    this.statePath = path.join(this.registryRoot, 'tab-leases.v1.json');
    this.lockPath = path.join(this.registryRoot, 'tab-leases.lock');
    this.createLeaseId = options.createLeaseId;
    this.createControlId = options.createControlId;
    this.ownerIdentity = options.ownerIdentity;
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
    this.lockTimeoutMs = normalizePositiveInteger(options.lockTimeoutMs ?? 5_000, 'lockTimeoutMs');
    this.lockPollMs = normalizePositiveInteger(options.lockPollMs ?? 25, 'lockPollMs');
  }

  acquireProfileControl(input: Parameters<BrowserTabLeaseRegistry['acquireProfileControl']>[0]) {
    return this.write((registry) => registry.acquireProfileControl(input));
  }

  releaseProfileControl(input: Parameters<BrowserTabLeaseRegistry['releaseProfileControl']>[0]) {
    return this.write((registry) => registry.releaseProfileControl(input));
  }

  reserve(input: ReserveTabLeaseInput) {
    return this.write((registry) => registry.reserve(input));
  }

  bindConversation(input: Parameters<BrowserTabLeaseRegistry['bindConversation']>[0]) {
    return this.write((registry) => registry.bindConversation(input));
  }

  heartbeat(input: Parameters<BrowserTabLeaseRegistry['heartbeat']>[0]) {
    return this.write((registry) => registry.heartbeat(input));
  }

  recordMeaningfulUse(input: Parameters<BrowserTabLeaseRegistry['recordMeaningfulUse']>[0]) {
    return this.write((registry) => registry.recordMeaningfulUse(input));
  }

  recordTargetAction(input: Parameters<BrowserTabLeaseRegistry['recordTargetAction']>[0]) {
    return this.write((registry) => registry.recordTargetAction(input));
  }

  idle(input: Parameters<BrowserTabLeaseRegistry['idle']>[0]) {
    return this.write((registry) => registry.idle(input));
  }

  acquire(input: Parameters<BrowserTabLeaseRegistry['acquire']>[0]) {
    return this.write((registry) => registry.acquire(input));
  }

  beginRetirement(input: Parameters<BrowserTabLeaseRegistry['beginRetirement']>[0]) {
    return this.write((registry) => registry.beginRetirement(input));
  }

  finishRetirement(input: Parameters<BrowserTabLeaseRegistry['finishRetirement']>[0]) {
    return this.write((registry) => registry.finishRetirement(input));
  }

  markLost(input: Parameters<BrowserTabLeaseRegistry['markLost']>[0]) {
    return this.write((registry) => registry.markLost(input));
  }

  releaseLost(input: Parameters<BrowserTabLeaseRegistry['releaseLost']>[0]) {
    return this.write((registry) => registry.releaseLost(input));
  }

  releasePreserved(input: Parameters<BrowserTabLeaseRegistry['releasePreserved']>[0]) {
    return this.write((registry) => registry.releasePreserved(input));
  }

  findByProcess(scope: TabLeaseScope) {
    return this.read(registry => registry.findByProcess(scope));
  }

  acquireProcess(input: Parameters<BrowserTabLeaseRegistry['acquireProcess']>[0]) {
    return this.write(registry => registry.acquireProcess(input));
  }

  listFencedTargetIds(scope: TabLeaseScope) {
    return this.read((registry) => registry.listFencedTargetIds(scope));
  }

  findByWorkload(scope: TabLeaseScope, workload: TabLeaseWorkload) {
    return this.read((registry) => registry.findByWorkload(scope, workload));
  }

  async list(input?: Parameters<BrowserTabLeaseRegistry['list']>[0]) {
    const key = JSON.stringify([this.registryRoot, input ?? {}]);
    let pending = pendingLeaseLists.get(key);
    if (!pending) {
      pending = this.read((registry) => registry.list(input));
      pendingLeaseLists.set(key, pending);
      const clear = () => {
        if (pendingLeaseLists.get(key) === pending) pendingLeaseLists.delete(key);
      };
      void pending.then(clear, clear);
    }
    // Each caller owns its result even when it shares the underlying observation.
    return (await pending).map(cloneLease);
  }

  private async read<T>(operation: (registry: InMemoryBrowserTabLeaseRegistry) => Promise<T>): Promise<T> {
    return this.withLock(async () => operation(await this.loadRegistry()));
  }

  private async write<T>(operation: (registry: InMemoryBrowserTabLeaseRegistry) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const registry = await this.loadRegistry();
      const result = await operation(registry);
      await this.persist(registry.snapshot());
      return result;
    });
  }

  private async loadRegistry(): Promise<InMemoryBrowserTabLeaseRegistry> {
    let snapshot: TabLeaseRegistrySnapshot = { leases: [], controls: [] };
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, 'utf8')) as {
        schemaVersion?: unknown;
        leases?: unknown;
        controls?: unknown;
      };
      if (
        parsed.schemaVersion !== 1 ||
        !Array.isArray(parsed.leases) ||
        (parsed.controls !== undefined && !Array.isArray(parsed.controls))
      ) {
        throw new Error(`Unsupported tab lease registry snapshot: ${this.statePath}`);
      }
      snapshot = {
        leases: parsed.leases as BrowserTabLease[],
        controls: (parsed.controls ?? []) as BrowserProfileControlRecord[],
      };
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
    return new InMemoryBrowserTabLeaseRegistry(
      {
        createLeaseId: this.createLeaseId,
        createControlId: this.createControlId,
        ownerIdentity: this.ownerIdentity,
        isOwnerAlive: this.isOwnerAlive,
      },
      snapshot,
    );
  }

  private async persist(snapshot: TabLeaseRegistrySnapshot): Promise<void> {
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
    await fs.mkdir(this.registryRoot, { recursive: true });
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
          throw new Error(`Timed out waiting for tab lease registry lock: ${this.lockPath}`);
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

function normalizeReserveInput(input: ReserveTabLeaseInput): ReserveTabLeaseInput {
  const idleTtlMs = normalizeTtl(input.idleTtlMs, 'idleTtlMs');
  const absoluteTtlMs = normalizeTtl(input.absoluteTtlMs, 'absoluteTtlMs');
  if (idleTtlMs > absoluteTtlMs) {
    throw new Error('idleTtlMs cannot exceed absoluteTtlMs');
  }
  parseTimestamp(input.now, 'now');
  return {
    ...input,
    scope: normalizeScope(input.scope),
    targetId: requireNonEmpty(input.targetId, 'targetId'),
    workload: normalizeWorkload(input.workload),
    operationId: requireNonEmpty(input.operationId, 'operationId'),
    idleTtlMs,
    absoluteTtlMs,
    targetFingerprint: normalizeOptional(input.targetFingerprint),
  };
}

function normalizeScope(scope: TabLeaseScope): TabLeaseScope {
  return {
    runtimeProfileId: requireNonEmpty(scope.runtimeProfileId, 'scope.runtimeProfileId'),
    managedBrowserProfile: requireNonEmpty(scope.managedBrowserProfile, 'scope.managedBrowserProfile'),
    service: requireNonEmpty(scope.service, 'scope.service').toLowerCase(),
    tenantKey: requireNonEmpty(scope.tenantKey, 'scope.tenantKey'),
  };
}

function normalizeControlScope(scope: BrowserProfileControlScope): BrowserProfileControlScope {
  return {
    runtimeProfileId: requireNonEmpty(scope.runtimeProfileId, 'scope.runtimeProfileId'),
    managedBrowserProfile: requireNonEmpty(scope.managedBrowserProfile, 'scope.managedBrowserProfile'),
    service: requireNonEmpty(scope.service, 'scope.service').toLowerCase(),
  };
}

function normalizeWorkload(workload: TabLeaseWorkload): TabLeaseWorkload {
  switch (workload.kind) {
    case 'new-conversation':
      return { kind: workload.kind, reservationId: requireNonEmpty(workload.reservationId, 'reservationId') };
    case 'conversation':
      return { kind: workload.kind, conversationId: requireNonEmpty(workload.conversationId, 'conversationId') };
    case 'live-follow':
    case 'ephemeral':
      return { kind: workload.kind, operationId: requireNonEmpty(workload.operationId, 'workload.operationId') };
  }
}

function sameOwnershipScope(left: TabLeaseScope, right: TabLeaseScope): boolean {
  return left.managedBrowserProfile === right.managedBrowserProfile &&
    left.service === right.service &&
    left.tenantKey === right.tenantKey;
}

function sameTargetDomain(left: TabLeaseScope, right: TabLeaseScope): boolean {
  return left.managedBrowserProfile === right.managedBrowserProfile &&
    left.service === right.service;
}

function sameControlScope(
  left: BrowserProfileControlScope,
  right: BrowserProfileControlScope,
): boolean {
  return left.managedBrowserProfile === right.managedBrowserProfile &&
    left.service === right.service;
}

function sameWorkload(left: TabLeaseWorkload, right: TabLeaseWorkload): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'new-conversation':
      return left.reservationId === (right as typeof left).reservationId;
    case 'conversation':
      return left.conversationId === (right as typeof left).conversationId;
    case 'live-follow':
    case 'ephemeral':
      return left.operationId === (right as typeof left).operationId;
  }
}

function matchesPartialScope(scope: TabLeaseScope, partial: Partial<TabLeaseScope> | undefined): boolean {
  if (!partial) return true;
  return Object.entries(partial).every(([key, value]) => value === undefined || scope[key as keyof TabLeaseScope] === value);
}

function cloneLease(lease: BrowserTabLease): BrowserTabLease {
  return {
    ...lease,
    scope: { ...lease.scope },
    ...(lease.processBinding ? { processBinding: { ...lease.processBinding } } : {}),
    workload: { ...lease.workload } as TabLeaseWorkload,
    actionCounts: cloneActionCounts(lease.actionCounts),
  };
}

function emptyActionCounts(): BrowserTabActionCounts {
  return {
    targetCreations: 0,
    adoptions: 0,
    navigations: 0,
    reloads: 0,
    focuses: 0,
    closes: 0,
  };
}

function cloneActionCounts(counts: BrowserTabActionCounts | null | undefined): BrowserTabActionCounts {
  return { ...emptyActionCounts(), ...(counts ?? {}) };
}

function actionCountKey(action: BrowserTabTargetAction): keyof BrowserTabActionCounts {
  switch (action) {
    case 'target-created': return 'targetCreations';
    case 'adopted': return 'adoptions';
    case 'navigation': return 'navigations';
    case 'reload': return 'reloads';
    case 'focus': return 'focuses';
  }
}

function cloneControl(control: BrowserProfileControlRecord): BrowserProfileControlRecord {
  return { ...control, scope: { ...control.scope } };
}

function normalizeTtl(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return Math.floor(value);
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

function requireNonEmpty(value: string, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return requireNonEmpty(value, 'targetFingerprint');
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
