import type {
  HistoryMaterializationJob,
  HistoryMaterializationService,
} from '../runtime/historyMaterializationService.js';
import type {
  SearchProjectionRequest,
  SearchProjectionRow,
  SearchProjectionService,
} from '../runtime/searchProjectionService.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  AccountMirrorAssetInventoryEvidence,
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
} from './statusRegistry.js';

type AssetKindField = 'artifacts' | 'files' | 'media';

interface AssetCounts {
  artifacts: number;
  files: number;
  media: number;
  total: number;
}

interface AccountLibraryInventoryCounts {
  total: AssetCounts;
  stableIdentity: AssetCounts;
  directDownload: AssetCounts;
  needsBrowserDetail: AssetCounts;
  unsupportedNoAuthority: AssetCounts;
  detailRoutes: {
    libraryFileDetail: AssetCounts;
    libraryArtifactDetail: AssetCounts;
    libraryCanvasDetail: AssetCounts;
    conversationDetail: AssetCounts;
    externalOrInlineAsset: AssetCounts;
    unknown: AssetCounts;
  };
}

interface AccountLibraryRecoveryCounts {
  remoteKnownMissingLocal: AssetCounts;
  retrievableMissingLocal: AssetCounts;
  unsupportedMetadataOnly: AssetCounts;
  duplicateAliases: AssetCounts;
  failedTerminal: AssetCounts;
  inventory: AccountLibraryInventoryCounts;
}

export type AccountMirrorArtifactRecoveryCandidateStatus =
  | 'eligible'
  | 'needs_detail_refresh'
  | 'deferred'
  | 'blocked'
  | 'unsupported'
  | 'terminal';

export type AccountMirrorArtifactRecoveryCandidateAction =
  | 'queue_history_materialization'
  | 'refresh_detail_inventory'
  | 'start_materialization_policy_completion'
  | 'inspect_archive_materialization'
  | 'none';

export interface AccountMirrorArtifactRecoveryPlanRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  tenantKey?: string | null;
  status?: AccountMirrorArtifactRecoveryCandidateStatus | null;
  action?: AccountMirrorArtifactRecoveryCandidateAction | null;
  includeSearchRows?: boolean | null;
  limit?: number | null;
}

export interface AccountMirrorArtifactRecoveryCandidate {
  object: 'account_mirror_artifact_recovery_candidate';
  id: string;
  source: 'account_mirror_status' | 'search_projection';
  provider: AccountMirrorProvider | string | null;
  tenantKey: string | null;
  bindingKey: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  status: AccountMirrorArtifactRecoveryCandidateStatus;
  action: AccountMirrorArtifactRecoveryCandidateAction;
  reason: string;
  evidenceConfidence: 'high' | 'medium' | 'low';
  materializationPolicy: string | null;
  assetInventory: AccountMirrorAssetInventoryEvidence | null;
  counts: {
    remoteKnownMissingLocal: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    retrievableMissingLocal: AssetCounts;
    localMaterialized: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    unknownOrDeferred: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    duplicateAliases: AssetCounts;
    unsupportedMetadataOnly: AssetCounts;
    staticFalsePositive: AssetCounts;
    retrievalFailed: AssetCounts;
    failedTerminal: AssetCounts;
    accountLibrary: AccountLibraryRecoveryCounts;
  };
  sourceItem: {
    id: string | null;
    kind: string | null;
    title: string | null;
    links: Record<string, string>;
  } | null;
  createRequest: {
    provider?: string;
    runtimeProfile?: string;
    boundIdentityKey?: string;
    catalogItemId?: string;
    catalogKind?: 'artifacts' | 'files' | 'media' | 'conversations';
    archiveItemId?: string;
    reconcile?: boolean;
    refreshSnapshot?: boolean;
    assetKinds?: Array<'artifacts' | 'files' | 'media' | 'all'>;
    maxItems?: number;
  } | null;
}

export interface AccountMirrorArtifactRecoveryPlanResult {
  object: 'account_mirror_artifact_recovery_plan';
  generatedAt: string;
  query: {
    provider: AccountMirrorProvider | null;
    runtimeProfileId: string | null;
    tenantKey: string | null;
    status: AccountMirrorArtifactRecoveryCandidateStatus | null;
    action: AccountMirrorArtifactRecoveryCandidateAction | null;
    includeSearchRows: boolean;
    limit: number;
  };
  candidates: AccountMirrorArtifactRecoveryCandidate[];
  omitted: {
    candidates: number;
  };
  metrics: {
    total: number;
    returned: number;
    byStatus: Record<AccountMirrorArtifactRecoveryCandidateStatus, number>;
    byAction: Record<AccountMirrorArtifactRecoveryCandidateAction, number>;
    remoteKnownMissingLocal: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
    retrievableMissingLocal: AssetCounts;
    duplicateAliases: AssetCounts;
    unsupportedMetadataOnly: AssetCounts;
    staticFalsePositive: AssetCounts;
    retrievalFailed: AssetCounts;
    failedTerminal: AssetCounts;
    accountLibrary: AccountLibraryRecoveryCounts;
    unknownOrDeferred: {
      artifacts: number;
      files: number;
      media: number;
      total: number;
    };
  };
}

export interface AccountMirrorArtifactRecoveryPlanner {
  plan(request?: AccountMirrorArtifactRecoveryPlanRequest): Promise<AccountMirrorArtifactRecoveryPlanResult>;
}

export function createAccountMirrorArtifactRecoveryPlanner(input: {
  registry: AccountMirrorStatusRegistry;
  searchProjectionService?: SearchProjectionService | null;
  historyMaterializationService?: Pick<HistoryMaterializationService, 'listJobs'> | null;
  now?: () => Date;
}): AccountMirrorArtifactRecoveryPlanner {
  const now = input.now ?? (() => new Date());
  return {
    async plan(request = {}) {
      const normalized = normalizeRequest(request);
      await input.registry.refreshPersistentState?.();
      const status = input.registry.readStatus({
        provider: normalized.provider,
        runtimeProfileId: normalized.runtimeProfileId,
      });
      const catalogRows = input.searchProjectionService
        ? await readRecoveryCatalogRows(input.searchProjectionService, normalized)
        : [];
      const materializedOverlay = input.searchProjectionService
        ? await readMaterializedArchiveOverlay(input.searchProjectionService, normalized, catalogRows)
        : new Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>();
      const classificationOverlay = await readRecoveryClassificationOverlay({
        catalogRows,
        historyMaterializationService: input.historyMaterializationService ?? null,
        request: normalized,
      });
      const statusCandidates = status.entries
        .filter((entry) => !normalized.tenantKey || entry.tenantKey === normalized.tenantKey)
        .flatMap((entry) => candidateFromStatusEntry(entry, materializedOverlay, classificationOverlay));
      const searchCandidates = normalized.includeSearchRows && input.searchProjectionService
        ? await candidatesFromSearch(input.searchProjectionService, normalized)
        : [];
      const filtered = [...statusCandidates, ...searchCandidates]
        .filter((candidate) => !normalized.status || candidate.status === normalized.status)
        .filter((candidate) => !normalized.action || candidate.action === normalized.action)
        .sort(compareCandidates);
      const candidates = filtered.slice(0, normalized.limit);
      return {
        object: 'account_mirror_artifact_recovery_plan',
        generatedAt: now().toISOString(),
        query: normalized,
        candidates,
        omitted: {
          candidates: Math.max(0, filtered.length - candidates.length),
        },
        metrics: summarizeCandidates(filtered, candidates.length),
      };
    },
  };
}

type NormalizedAccountMirrorArtifactRecoveryPlanRequest = Required<
  Pick<AccountMirrorArtifactRecoveryPlanResult['query'], 'includeSearchRows' | 'limit'>
> & Omit<AccountMirrorArtifactRecoveryPlanResult['query'], 'includeSearchRows' | 'limit'>;

function candidateFromStatusEntry(
  entry: AccountMirrorStatusEntry,
  materializedOverlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
  classificationOverlay: Map<string, RecoveryClassificationCounts>,
): AccountMirrorArtifactRecoveryCandidate[] {
  const inventory = entry.mirrorCompleteness.assetInventory ?? entry.metadataEvidence?.assetInventory ?? null;
  if (!inventory) {
    if (entry.status !== 'blocked') return [];
    return [createStatusCandidate({
      entry,
      inventory: null,
      status: 'blocked',
      action: 'none',
      reason: entry.reason || 'Account mirror target is blocked before recovery planning.',
      confidence: 'low',
    })];
  }

  const adjustedInventory = applyMaterializedOverlay(entry, inventory, materializedOverlay);
  const rawClassification = classificationOverlay.get(materializedOverlayKey({
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    tenantKey: entry.tenantKey ?? entry.expectedIdentityKey ?? entry.detectedIdentityKey,
  })) ?? zeroRecoveryClassificationCounts();
  const classification = capRecoveryClassificationCounts(rawClassification, adjustedInventory.remoteKnownMissingLocal);
  const retrievableMissingLocal = classifyRetrievableMissing(adjustedInventory.remoteKnownMissingLocal, classification);
  const remoteTotal = sumAssetCounts(retrievableMissingLocal);
  const unknownTotal = sumAssetCounts(adjustedInventory.unknownOrDeferred);
  const nonActionableTotal = sumAssetCounts(classification.duplicateAliases) +
    sumAssetCounts(classification.unsupportedMetadataOnly) +
    sumAssetCounts(classification.staticFalsePositive) +
    sumAssetCounts(classification.retrievalFailed) +
    sumAssetCounts(classification.failedTerminal);
  if (remoteTotal <= 0 && unknownTotal <= 0 && nonActionableTotal <= 0) return [];

  if (entry.status === 'blocked') {
    return [createStatusCandidate({
      entry,
      inventory: adjustedInventory,
      classification,
      retrievableMissingLocal,
      status: 'blocked',
      action: 'none',
      reason: entry.reason || 'Account mirror target is blocked before recovery planning.',
      confidence: 'low',
    })];
  }

  if (remoteTotal > 0) {
    const materializationPolicy = entry.liveFollow.materializationPolicy;
    const action: AccountMirrorArtifactRecoveryCandidateAction =
      materializationPolicy === 'recent_missing_assets' || materializationPolicy === 'full_missing_assets'
        ? 'start_materialization_policy_completion'
        : 'queue_history_materialization';
    return [createStatusCandidate({
      entry,
      inventory: adjustedInventory,
      classification,
      retrievableMissingLocal,
      status: 'eligible',
      action,
      reason: materializationPolicy
        ? `Target has ${remoteTotal} retrievable missing local assets and materialization policy ${materializationPolicy}.`
        : `Target has ${remoteTotal} retrievable missing local assets; live follow is metadata-only until explicit recovery work is queued.`,
      confidence: recoveryConfidence(inventory),
    })];
  }

  if (nonActionableTotal > 0) {
    return [createStatusCandidate({
      entry,
      inventory: adjustedInventory,
      classification,
      retrievableMissingLocal,
      status: classificationOnlyStatus(classification),
      action: 'none',
      reason: sumAssetCounts(classification.retrievalFailed) > 0
        ? `Target has no currently retrievable missing local assets; ${sumAssetCounts(classification.retrievalFailed)} rows failed retrieval without provider-confirmed unavailability and require diagnosis before retry.`
        : `Target has no currently retrievable missing local assets; ${nonActionableTotal} remaining rows are classified as duplicate, unsupported/static, or provider-confirmed terminal work.`,
      confidence: recoveryConfidence(inventory),
    })];
  }

  return [createStatusCandidate({
    entry,
    inventory: adjustedInventory,
    classification,
    retrievableMissingLocal,
    status: 'needs_detail_refresh',
    action: 'refresh_detail_inventory',
    reason: `Target has ${unknownTotal} unknown or deferred asset counts and needs provider detail inventory before materialization.`,
    confidence: 'medium',
  })];
}

function createStatusCandidate(input: {
  entry: AccountMirrorStatusEntry;
  inventory: AccountMirrorAssetInventoryEvidence | null;
  classification?: RecoveryClassificationCounts | null;
  retrievableMissingLocal?: Partial<Record<AssetKindField, number>> | null;
  status: AccountMirrorArtifactRecoveryCandidateStatus;
  action: AccountMirrorArtifactRecoveryCandidateAction;
  reason: string;
  confidence: AccountMirrorArtifactRecoveryCandidate['evidenceConfidence'];
}): AccountMirrorArtifactRecoveryCandidate {
  const remote = totalAssetCounts(input.inventory?.remoteKnownMissingLocal);
  const retrievable = totalAssetCounts(input.retrievableMissingLocal ?? remote);
  const local = totalAssetCounts(input.inventory?.localMaterialized);
  const unknown = totalAssetCounts(input.inventory?.unknownOrDeferred);
  const classification = input.classification ?? zeroRecoveryClassificationCounts();
  const createRequestAssetKinds = recoveryCreateRequestAssetKinds(retrievable, unknown);
  return {
    object: 'account_mirror_artifact_recovery_candidate',
    id: `status:${input.entry.provider}:${input.entry.runtimeProfileId}:${input.entry.tenantKey ?? input.entry.bindingKey}`,
    source: 'account_mirror_status',
    provider: input.entry.provider,
    tenantKey: input.entry.tenantKey,
    bindingKey: input.entry.bindingKey,
    runtimeProfileId: input.entry.runtimeProfileId,
    browserProfileId: input.entry.browserProfileId,
    status: input.status,
    action: input.action,
    reason: input.reason,
    evidenceConfidence: input.confidence,
    materializationPolicy: input.entry.liveFollow.materializationPolicy,
    assetInventory: input.inventory,
    counts: {
      remoteKnownMissingLocal: remote,
      retrievableMissingLocal: retrievable,
      localMaterialized: local,
      unknownOrDeferred: unknown,
      duplicateAliases: totalAssetCounts(classification.duplicateAliases),
      unsupportedMetadataOnly: totalAssetCounts(classification.unsupportedMetadataOnly),
      staticFalsePositive: totalAssetCounts(classification.staticFalsePositive),
      retrievalFailed: totalAssetCounts(classification.retrievalFailed),
      failedTerminal: totalAssetCounts(classification.failedTerminal),
      accountLibrary: totalAccountLibraryRecoveryCounts(classification.accountLibrary),
    },
    sourceItem: null,
    createRequest: input.action === 'queue_history_materialization' || input.action === 'refresh_detail_inventory'
      ? {
          provider: input.entry.provider,
          runtimeProfile: input.entry.runtimeProfileId,
          boundIdentityKey: input.entry.expectedIdentityKey ?? undefined,
          reconcile: true,
          refreshSnapshot: input.action === 'refresh_detail_inventory',
          assetKinds: createRequestAssetKinds,
          maxItems: Math.max(1, Math.min(25, retrievable.total || unknown.total || 1)),
        }
      : null,
  };
}

function recoveryCreateRequestAssetKinds(
  retrievable: AssetCounts,
  unknown: AssetCounts,
): Array<'artifacts' | 'files' | 'media' | 'all'> {
  const source = retrievable.total > 0 ? retrievable : unknown;
  const kinds: Array<'artifacts' | 'files' | 'media'> = [];
  if (source.artifacts > 0) kinds.push('artifacts');
  if (source.files > 0) kinds.push('files');
  if (source.media > 0) kinds.push('media');
  return kinds.length > 0 ? kinds : ['all'];
}

interface RecoveryClassificationCounts {
  duplicateAliases: AssetCounts;
  unsupportedMetadataOnly: AssetCounts;
  staticFalsePositive: AssetCounts;
  retrievalFailed: AssetCounts;
  failedTerminal: AssetCounts;
  accountLibrary: AccountLibraryRecoveryCounts;
}

async function readRecoveryCatalogRows(
  searchProjectionService: SearchProjectionService,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
): Promise<SearchProjectionRow[]> {
  const results = await Promise.all([
    searchProjectionService.search(classificationCatalogSearchRequest(request, 'artifact')),
    searchProjectionService.search(classificationCatalogSearchRequest(request, 'upload')),
  ]);
  return results.flatMap(result => result.rows);
}

async function readRecoveryClassificationOverlay(input: {
  catalogRows: SearchProjectionRow[];
  historyMaterializationService: Pick<HistoryMaterializationService, 'listJobs'> | null;
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest;
}): Promise<Map<string, RecoveryClassificationCounts>> {
  const overlay = new Map<string, RecoveryClassificationCounts>();
  for (const row of input.catalogRows) addCatalogClassificationRow(overlay, row);
  if (input.historyMaterializationService) {
    const jobs = await input.historyMaterializationService.listJobs({
      status: 'terminal',
      provider: input.request.provider,
      runtimeProfile: input.request.runtimeProfileId,
      limit: 500,
    });
    for (const job of jobs.jobs) addHistoryMaterializationClassification(overlay, job, input.request);
  }
  return overlay;
}

function classificationCatalogSearchRequest(
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
  kind: 'artifact' | 'upload',
): SearchProjectionRequest {
  return {
    provider: request.provider,
    runtimeProfile: request.runtimeProfileId,
    tenant: request.tenantKey,
    kind,
    limit: 500,
  };
}

function addCatalogClassificationRow(
  overlay: Map<string, RecoveryClassificationCounts>,
  row: SearchProjectionRow,
): void {
  if (row.source !== 'account_mirror') return;
  if (!row.provider || !row.runtimeProfileId || !row.tenant) return;
  const field = row.kind === 'upload' || row.sourceKind === 'files' ? 'files'
    : row.kind === 'artifact' || row.sourceKind === 'artifacts' ? 'artifacts'
      : row.kind === 'media' || row.sourceKind === 'media' ? 'media'
        : null;
  if (!field) return;
  const state = readMaterializationEligibilityState(row);
  if (
    state !== 'unsupported_conversation_file' &&
    state !== 'unsupported_account_library_asset' &&
    state !== 'static_image_false_positive'
  ) {
    return;
  }
  const key = materializedOverlayKey({
    provider: row.provider,
    runtimeProfileId: row.runtimeProfileId,
    tenantKey: row.tenant,
  });
  const counts = getRecoveryClassificationCounts(overlay, key);
  if (state === 'unsupported_conversation_file' || state === 'unsupported_account_library_asset') {
    incrementAssetCount(counts.unsupportedMetadataOnly, field);
  }
  if (state === 'unsupported_account_library_asset') {
    addAccountLibraryClassificationRow(counts.accountLibrary, row, field);
  }
  if (state === 'static_image_false_positive') incrementAssetCount(counts.staticFalsePositive, field);
}

function addHistoryMaterializationClassification(
  overlay: Map<string, RecoveryClassificationCounts>,
  job: HistoryMaterializationJob,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
): void {
  if (!job.result) return;
  const provider = job.request.provider ?? job.result.target?.provider ?? (job.source.type === 'reconciliation' ? job.source.provider : null);
  const runtimeProfileId = job.request.runtimeProfile ?? job.result.target?.runtimeProfile ?? null;
  const tenantKey = job.request.boundIdentityKey ?? job.result.target?.boundIdentityKey ?? null;
  if (request.provider && provider !== request.provider) return;
  if (request.runtimeProfileId && runtimeProfileId !== request.runtimeProfileId) return;
  if (request.tenantKey && normalizeTenantKey(tenantKey) !== normalizeTenantKey(request.tenantKey)) return;
  const key = materializedOverlayKey({ provider, runtimeProfileId, tenantKey });
  const counts = getRecoveryClassificationCounts(overlay, key);
  for (const entry of job.result.entries) {
    const field = entry.kind === 'file' ? 'files' : entry.kind === 'artifact' ? 'artifacts' : 'media';
    if (entry.status === 'duplicate') incrementAssetCount(counts.duplicateAliases, field);
    if (entry.status === 'failed' || entry.status === 'skipped') {
      if (entry.failureKind === 'retrieval_failed') {
        incrementAssetCount(counts.retrievalFailed, field);
      } else if (entry.failureKind === 'provider_unavailable' || entry.assetAvailability === 'unavailable') {
        // Only explicit provider unavailability can make a historical failure
        // terminal. Generic legacy failures cannot suppress fresh inventory.
        incrementAssetCount(counts.failedTerminal, field);
      }
    }
  }
}

function readMaterializationEligibilityState(row: SearchProjectionRow): string | null {
  const raw = row.metadata.raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const metadata = (raw as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const eligibility = (metadata as Record<string, unknown>).materializationEligibility;
  if (!eligibility || typeof eligibility !== 'object' || Array.isArray(eligibility)) return null;
  const state = (eligibility as Record<string, unknown>).state;
  return typeof state === 'string' && state.trim() ? state.trim() : null;
}

function getRecoveryClassificationCounts(
  overlay: Map<string, RecoveryClassificationCounts>,
  key: string,
): RecoveryClassificationCounts {
  const current = overlay.get(key);
  if (current) return current;
  const next = zeroRecoveryClassificationCounts();
  overlay.set(key, next);
  return next;
}

function zeroRecoveryClassificationCounts(): RecoveryClassificationCounts {
  return {
    duplicateAliases: zeroAssetCountsWithTotal(),
    unsupportedMetadataOnly: zeroAssetCountsWithTotal(),
    staticFalsePositive: zeroAssetCountsWithTotal(),
    retrievalFailed: zeroAssetCountsWithTotal(),
    failedTerminal: zeroAssetCountsWithTotal(),
    accountLibrary: zeroAccountLibraryRecoveryCounts(),
  };
}

function capRecoveryClassificationCounts(
  classification: RecoveryClassificationCounts,
  remoteKnownMissingLocal: Partial<Record<AssetKindField, number>> | null | undefined,
): RecoveryClassificationCounts {
  const remaining = totalAssetCounts(remoteKnownMissingLocal);
  const duplicateAliases = takeClassificationCounts(classification.duplicateAliases, remaining);
  const staticFalsePositive = takeClassificationCounts(classification.staticFalsePositive, remaining);
  const retrievalFailed = takeClassificationCounts(classification.retrievalFailed, remaining);
  const failedTerminal = takeClassificationCounts(classification.failedTerminal, remaining);
  const unsupportedMetadataOnly = takeClassificationCounts(classification.unsupportedMetadataOnly, remaining);
  const accountLibraryRemoteKnownMissingLocal = capAssetCounts(classification.accountLibrary.remoteKnownMissingLocal, remoteKnownMissingLocal);
  const accountLibraryUnsupportedMetadataOnly = capAssetCounts(
    classification.accountLibrary.unsupportedMetadataOnly,
    accountLibraryRemoteKnownMissingLocal,
  );
  return {
    duplicateAliases,
    unsupportedMetadataOnly,
    staticFalsePositive,
    retrievalFailed,
    failedTerminal,
    accountLibrary: {
      ...classification.accountLibrary,
      remoteKnownMissingLocal: accountLibraryRemoteKnownMissingLocal,
      unsupportedMetadataOnly: accountLibraryUnsupportedMetadataOnly,
    },
  };
}

function takeClassificationCounts(
  requested: AssetCounts,
  remaining: AssetCounts,
): AssetCounts {
  const next = {
    artifacts: Math.min(requested.artifacts, remaining.artifacts),
    files: Math.min(requested.files, remaining.files),
    media: Math.min(requested.media, remaining.media),
    total: 0,
  };
  next.total = next.artifacts + next.files + next.media;
  remaining.artifacts -= next.artifacts;
  remaining.files -= next.files;
  remaining.media -= next.media;
  remaining.total = remaining.artifacts + remaining.files + remaining.media;
  return next;
}

function addAccountLibraryClassificationRow(
  counts: AccountLibraryRecoveryCounts,
  row: SearchProjectionRow,
  field: AssetKindField,
): void {
  incrementAssetCount(counts.remoteKnownMissingLocal, field);
  incrementAssetCount(counts.unsupportedMetadataOnly, field);
  incrementAssetCount(counts.inventory.total, field);
  const authority = classifyAccountLibraryAuthority(row);
  if (authority.stableIdentity) incrementAssetCount(counts.inventory.stableIdentity, field);
  if (authority.directDownload) {
    incrementAssetCount(counts.inventory.directDownload, field);
  } else if (authority.stableIdentity) {
    incrementAssetCount(counts.inventory.needsBrowserDetail, field);
  } else {
    incrementAssetCount(counts.inventory.unsupportedNoAuthority, field);
  }
  incrementAccountLibraryRouteKind(counts.inventory, row, field);
}

function classifyAccountLibraryAuthority(row: SearchProjectionRow): {
  stableIdentity: boolean;
  directDownload: boolean;
} {
  const raw = readSearchRowRawRecord(row);
  const metadata = readRecordField(raw, 'metadata');
  const stableIdentity = Boolean(
    normalizeString(row.itemId) ??
    readStringField(raw, 'id', 'artifactId', 'fileId', 'providerFileId', 'libraryIdentity') ??
    readStringField(metadata, 'id', 'artifactId', 'fileId', 'providerFileId', 'libraryIdentity'),
  );
  const directDownload = Boolean(
    readDirectDownloadEvidence(raw) ??
    readDirectDownloadEvidence(metadata) ??
    filterDirectDownloadLocation(readStringField(row.links, 'asset', 'download')),
  );
  return { stableIdentity, directDownload };
}

function incrementAccountLibraryRouteKind(
  counts: AccountLibraryInventoryCounts,
  row: SearchProjectionRow,
  field: AssetKindField,
): void {
  const raw = readSearchRowRawRecord(row);
  const metadata = readRecordField(raw, 'metadata');
  const routeKind = readStringField(metadata, 'libraryRouteKind') ?? classifyAccountLibraryRouteKind(
    readStringField(metadata, 'libraryRouteUrl') ??
    readStringField(raw, 'remoteUrl', 'uri', 'url', 'href') ??
    readStringField(metadata, 'remoteUrl', 'uri', 'url', 'href'),
  );
  switch (routeKind) {
    case 'library_file_detail':
      incrementAssetCount(counts.detailRoutes.libraryFileDetail, field);
      break;
    case 'library_artifact_detail':
      incrementAssetCount(counts.detailRoutes.libraryArtifactDetail, field);
      break;
    case 'library_canvas_detail':
      incrementAssetCount(counts.detailRoutes.libraryCanvasDetail, field);
      break;
    case 'conversation_detail':
      incrementAssetCount(counts.detailRoutes.conversationDetail, field);
      break;
    case 'external_or_inline_asset':
      incrementAssetCount(counts.detailRoutes.externalOrInlineAsset, field);
      break;
    default:
      incrementAssetCount(counts.detailRoutes.unknown, field);
      break;
  }
}

function classifyAccountLibraryRouteKind(value: string | null): string {
  if (!value) return 'unknown';
  const normalized = value.trim();
  if (!normalized) return 'unknown';
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) return 'external_or_inline_asset';
  try {
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.startsWith('/library/files/')) return 'library_file_detail';
    if (pathname.startsWith('/library/artifacts/')) return 'library_artifact_detail';
    if (pathname.startsWith('/library/canvas/')) return 'library_canvas_detail';
    if (pathname.startsWith('/c/')) return 'conversation_detail';
    if (parsed.hostname && parsed.hostname !== 'chatgpt.com' && !parsed.hostname.endsWith('.chatgpt.com')) {
      return 'external_or_inline_asset';
    }
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

function readSearchRowRawRecord(row: SearchProjectionRow): Record<string, unknown> | null {
  return readRecordField({ raw: row.metadata.raw }, 'raw');
}

function readRecordField(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!record) return null;
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStringField(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function readDirectDownloadEvidence(record: Record<string, unknown> | null): string | null {
  const location = readStringField(
    record,
    'uri',
    'remoteUrl',
    'url',
    'href',
    'downloadUrl',
    'sourceUrl',
  );
  return filterDirectDownloadLocation(location);
}

function filterDirectDownloadLocation(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.startsWith('chatgpt://file/')) return normalized;
  if (normalized.startsWith('sandbox:')) return normalized;
  if (normalized.startsWith('blob:')) return normalized;
  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com')) {
      const routeKind = classifyAccountLibraryRouteKind(normalized);
      if (routeKind !== 'unknown') return null;
    }
    if (pathname.includes('/download') || pathname.includes('/files/') || pathname.includes('/attachments/')) {
      return normalized;
    }
    if (hostname.includes('oaiusercontent.com') || hostname.includes('oaistatic.com')) return normalized;
    return null;
  } catch {
    return null;
  }
}

function capAssetCounts(
  requested: AssetCounts,
  maximum: Partial<Record<AssetKindField, number>> | null | undefined,
): AssetCounts {
  const cap = totalAssetCounts(maximum);
  const next = {
    artifacts: Math.min(requested.artifacts, cap.artifacts),
    files: Math.min(requested.files, cap.files),
    media: Math.min(requested.media, cap.media),
    total: 0,
  };
  next.total = next.artifacts + next.files + next.media;
  return next;
}

function zeroAccountLibraryRecoveryCounts(): AccountLibraryRecoveryCounts {
  return {
    remoteKnownMissingLocal: zeroAssetCountsWithTotal(),
    retrievableMissingLocal: zeroAssetCountsWithTotal(),
    unsupportedMetadataOnly: zeroAssetCountsWithTotal(),
    duplicateAliases: zeroAssetCountsWithTotal(),
    failedTerminal: zeroAssetCountsWithTotal(),
    inventory: {
      total: zeroAssetCountsWithTotal(),
      stableIdentity: zeroAssetCountsWithTotal(),
      directDownload: zeroAssetCountsWithTotal(),
      needsBrowserDetail: zeroAssetCountsWithTotal(),
      unsupportedNoAuthority: zeroAssetCountsWithTotal(),
      detailRoutes: {
        libraryFileDetail: zeroAssetCountsWithTotal(),
        libraryArtifactDetail: zeroAssetCountsWithTotal(),
        libraryCanvasDetail: zeroAssetCountsWithTotal(),
        conversationDetail: zeroAssetCountsWithTotal(),
        externalOrInlineAsset: zeroAssetCountsWithTotal(),
        unknown: zeroAssetCountsWithTotal(),
      },
    },
  };
}

function totalAccountLibraryRecoveryCounts(
  counts: AccountLibraryRecoveryCounts,
): AccountLibraryRecoveryCounts {
  return {
    remoteKnownMissingLocal: totalAssetCounts(counts.remoteKnownMissingLocal),
    retrievableMissingLocal: totalAssetCounts(counts.retrievableMissingLocal),
    unsupportedMetadataOnly: totalAssetCounts(counts.unsupportedMetadataOnly),
    duplicateAliases: totalAssetCounts(counts.duplicateAliases),
    failedTerminal: totalAssetCounts(counts.failedTerminal),
    inventory: {
      total: totalAssetCounts(counts.inventory.total),
      stableIdentity: totalAssetCounts(counts.inventory.stableIdentity),
      directDownload: totalAssetCounts(counts.inventory.directDownload),
      needsBrowserDetail: totalAssetCounts(counts.inventory.needsBrowserDetail),
      unsupportedNoAuthority: totalAssetCounts(counts.inventory.unsupportedNoAuthority),
      detailRoutes: {
        libraryFileDetail: totalAssetCounts(counts.inventory.detailRoutes.libraryFileDetail),
        libraryArtifactDetail: totalAssetCounts(counts.inventory.detailRoutes.libraryArtifactDetail),
        libraryCanvasDetail: totalAssetCounts(counts.inventory.detailRoutes.libraryCanvasDetail),
        conversationDetail: totalAssetCounts(counts.inventory.detailRoutes.conversationDetail),
        externalOrInlineAsset: totalAssetCounts(counts.inventory.detailRoutes.externalOrInlineAsset),
        unknown: totalAssetCounts(counts.inventory.detailRoutes.unknown),
      },
    },
  };
}

function zeroAssetCountsWithTotal(): AssetCounts {
  return { artifacts: 0, files: 0, media: 0, total: 0 };
}

function incrementAssetCount(counts: AssetCounts, field: AssetKindField): void {
  counts[field] += 1;
  counts.total = counts.artifacts + counts.files + counts.media;
}

function classifyRetrievableMissing(
  remoteKnownMissingLocal: Partial<Record<AssetKindField, number>> | null | undefined,
  classification: RecoveryClassificationCounts,
): AssetCounts {
  const nonActionable = addAssetCounts(
    addAssetCounts(classification.duplicateAliases, classification.unsupportedMetadataOnly),
    addAssetCounts(
      addAssetCounts(classification.staticFalsePositive, classification.retrievalFailed),
      classification.failedTerminal,
    ),
  );
  return totalAssetCounts(subtractAssetCounts(remoteKnownMissingLocal, nonActionable));
}

function classificationOnlyStatus(
  classification: RecoveryClassificationCounts,
): AccountMirrorArtifactRecoveryCandidateStatus {
  if (sumAssetCounts(classification.retrievalFailed) > 0) return 'blocked';
  if (sumAssetCounts(classification.failedTerminal) > 0) return 'terminal';
  if (sumAssetCounts(classification.unsupportedMetadataOnly) > 0 || sumAssetCounts(classification.staticFalsePositive) > 0) {
    return 'unsupported';
  }
  return 'terminal';
}

async function readMaterializedArchiveOverlay(
  searchProjectionService: SearchProjectionService,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
  catalogRows: SearchProjectionRow[],
): Promise<Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>> {
  const [artifactRows, uploadRows] = await Promise.all([
    searchProjectionService.search(materializedArchiveSearchRequest(request, 'artifact')),
    searchProjectionService.search(materializedArchiveSearchRequest(request, 'upload')),
  ]);
  const overlay = new Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>();
  const currentItems = new Set(catalogRows.filter(row => row.source === 'account_mirror')
    .map(catalogAssetKey).filter((key): key is string => key !== null));
  const countedItems = new Set<string>();
  for (const row of [...artifactRows.rows, ...uploadRows.rows]) {
    const key = catalogAssetKey(row);
    if (row.source !== 'run_archive' || !key || !currentItems.has(key) || countedItems.has(key)) continue;
    const field = row.kind === 'artifact' ? 'artifacts' : row.kind === 'upload' ? 'files' : null;
    if (!field) continue;
    countedItems.add(key);
    addMaterializedArchiveRow(overlay, row, field);
  }
  return overlay;
}

function catalogAssetKey(row: SearchProjectionRow): string | null {
  const locator = normalizeString(row.links.catalogItem);
  if (!locator || !row.provider || !row.runtimeProfileId || !row.tenant) return null;
  return [row.provider, row.runtimeProfileId, normalizeTenantKey(row.tenant), row.kind, locator].join('\0');
}

function materializedArchiveSearchRequest(
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
  kind: 'artifact' | 'upload',
): SearchProjectionRequest {
  return {
    provider: request.provider,
    runtimeProfile: request.runtimeProfileId,
    tenant: request.tenantKey,
    kind,
    assetAvailability: 'available',
    limit: 500,
  };
}

function addMaterializedArchiveRow(
  overlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
  row: SearchProjectionRow,
  field: 'artifacts' | 'files' | 'media',
): void {
  if (row.source !== 'run_archive') return;
  if (!row.provider || !row.runtimeProfileId || !row.tenant) return;
  const key = materializedOverlayKey({
    provider: row.provider,
    runtimeProfileId: row.runtimeProfileId,
    tenantKey: row.tenant,
  });
  const current = overlay.get(key) ?? { artifacts: 0, files: 0, media: 0, total: 0 };
  current[field] += 1;
  current.total = current.artifacts + current.files + current.media;
  overlay.set(key, current);
}

function applyMaterializedOverlay(
  entry: AccountMirrorStatusEntry,
  inventory: AccountMirrorAssetInventoryEvidence,
  overlay: Map<string, AccountMirrorArtifactRecoveryCandidate['counts']['localMaterialized']>,
): AccountMirrorAssetInventoryEvidence {
  const overlayCounts = overlay.get(materializedOverlayKey({
    provider: entry.provider,
    runtimeProfileId: entry.runtimeProfileId,
    tenantKey: entry.tenantKey ?? entry.expectedIdentityKey ?? entry.detectedIdentityKey,
  }));
  if (!overlayCounts || overlayCounts.total <= 0) return inventory;
  const localMaterialized = maxAssetCounts(inventory.localMaterialized, overlayCounts);
  const localDelta = subtractAssetCounts(localMaterialized, inventory.localMaterialized);
  const remoteKnownMissingLocal = subtractAssetCounts(inventory.remoteKnownMissingLocal, localDelta);
  return {
    ...inventory,
    state: sumAssetCounts(remoteKnownMissingLocal) > 0 || sumAssetCounts(inventory.unknownOrDeferred) > 0
      ? inventory.state
      : 'complete',
    localMaterialized,
    remoteKnownMissingLocal,
  };
}

function materializedOverlayKey(input: {
  provider: string | null;
  runtimeProfileId: string | null;
  tenantKey: string | null;
}): string {
  return [
    input.provider ?? '',
    input.runtimeProfileId ?? '',
    normalizeTenantKey(input.tenantKey),
  ].join('\n');
}

function normalizeTenantKey(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const serviceAccountMatch = trimmed.match(/^service-account:[^:]+:(.+)$/u);
  return serviceAccountMatch?.[1]?.trim() || trimmed;
}

async function candidatesFromSearch(
  searchProjectionService: SearchProjectionService,
  request: NormalizedAccountMirrorArtifactRecoveryPlanRequest,
): Promise<AccountMirrorArtifactRecoveryCandidate[]> {
  const result = await searchProjectionService.search({
    provider: request.provider,
    runtimeProfile: request.runtimeProfileId,
    tenant: request.tenantKey,
    kind: 'artifact',
    assetAvailability: 'unavailable',
    limit: 500,
  });
  return result.rows.map(candidateFromSearchRow);
}

function candidateFromSearchRow(row: SearchProjectionRow): AccountMirrorArtifactRecoveryCandidate {
  const archiveItemId = row.source === 'run_archive' ? row.itemId : null;
  const catalogKind = catalogKindFromSearchRow(row);
  const catalogItemId = row.source === 'account_mirror' ? row.itemId : null;
  return {
    object: 'account_mirror_artifact_recovery_candidate',
    id: `search:${row.id}`,
    source: 'search_projection',
    provider: row.provider,
    tenantKey: row.tenant,
    bindingKey: null,
    runtimeProfileId: row.runtimeProfileId,
    browserProfileId: row.browserProfileId,
    status: 'eligible',
    action: archiveItemId ? 'inspect_archive_materialization' : 'queue_history_materialization',
    reason: archiveItemId
      ? 'Search row is an unavailable archive artifact with archive-owned provider evidence.'
      : 'Search row is an unavailable account-mirror artifact with catalog evidence.',
    evidenceConfidence: archiveItemId || catalogItemId ? 'high' : 'medium',
    materializationPolicy: null,
    assetInventory: null,
    counts: {
      remoteKnownMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
      retrievableMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
      localMaterialized: { artifacts: 0, files: 0, media: 0, total: 0 },
      unknownOrDeferred: { artifacts: 0, files: 0, media: 0, total: 0 },
      duplicateAliases: { artifacts: 0, files: 0, media: 0, total: 0 },
      unsupportedMetadataOnly: { artifacts: 0, files: 0, media: 0, total: 0 },
      staticFalsePositive: { artifacts: 0, files: 0, media: 0, total: 0 },
      retrievalFailed: { artifacts: 0, files: 0, media: 0, total: 0 },
      failedTerminal: { artifacts: 0, files: 0, media: 0, total: 0 },
      accountLibrary: zeroAccountLibraryRecoveryCounts(),
    },
    sourceItem: {
      id: row.itemId,
      kind: row.kind,
      title: row.title,
      links: row.links,
    },
    createRequest: archiveItemId
      ? { archiveItemId, assetKinds: ['all'], maxItems: 1 }
      : catalogItemId && catalogKind
        ? {
            provider: typeof row.provider === 'string' ? row.provider : undefined,
            runtimeProfile: row.runtimeProfileId ?? undefined,
            boundIdentityKey: row.tenant ?? undefined,
            catalogItemId,
            catalogKind,
            refreshSnapshot: true,
            assetKinds: ['all'],
            maxItems: 1,
          }
        : null,
  };
}

function catalogKindFromSearchRow(row: SearchProjectionRow): 'artifacts' | 'files' | 'media' | 'conversations' | null {
  if (row.sourceKind === 'artifacts') return 'artifacts';
  if (row.sourceKind === 'files') return 'files';
  if (row.sourceKind === 'media') return 'media';
  if (row.sourceKind === 'conversations') return 'conversations';
  return null;
}

function normalizeRequest(
  request: AccountMirrorArtifactRecoveryPlanRequest,
): NormalizedAccountMirrorArtifactRecoveryPlanRequest {
  return {
    provider: normalizeProvider(request.provider),
    runtimeProfileId: normalizeString(request.runtimeProfileId),
    tenantKey: normalizeString(request.tenantKey),
    status: normalizeCandidateStatus(request.status),
    action: normalizeCandidateAction(request.action),
    includeSearchRows: request.includeSearchRows !== false,
    limit: normalizeLimit(request.limit),
  };
}

function normalizeProvider(value: unknown): AccountMirrorProvider | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function normalizeCandidateStatus(value: unknown): AccountMirrorArtifactRecoveryCandidateStatus | null {
  if (
    value === 'eligible' ||
    value === 'needs_detail_refresh' ||
    value === 'deferred' ||
    value === 'blocked' ||
    value === 'unsupported' ||
    value === 'terminal'
  ) {
    return value;
  }
  return null;
}

function normalizeCandidateAction(value: unknown): AccountMirrorArtifactRecoveryCandidateAction | null {
  if (
    value === 'queue_history_materialization' ||
    value === 'refresh_detail_inventory' ||
    value === 'start_materialization_policy_completion' ||
    value === 'inspect_archive_materialization' ||
    value === 'none'
  ) {
    return value;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.min(500, Math.max(0, Math.floor(value)));
}

function recoveryConfidence(inventory: AccountMirrorAssetInventoryEvidence): AccountMirrorArtifactRecoveryCandidate['evidenceConfidence'] {
  if (inventory.detailScannedThisPass.conversations > 0) return 'high';
  if (inventory.state === 'observed' || inventory.state === 'complete') return 'medium';
  return 'low';
}

function totalAssetCounts(value: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined) {
  const artifacts = Math.max(0, Math.floor(value?.artifacts ?? 0));
  const files = Math.max(0, Math.floor(value?.files ?? 0));
  const media = Math.max(0, Math.floor(value?.media ?? 0));
  return {
    artifacts,
    files,
    media,
    total: artifacts + files + media,
  };
}

function maxAssetCounts(
  left: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
  right: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
) {
  const leftCounts = totalAssetCounts(left);
  const rightCounts = totalAssetCounts(right);
  return {
    artifacts: Math.max(leftCounts.artifacts, rightCounts.artifacts),
    files: Math.max(leftCounts.files, rightCounts.files),
    media: Math.max(leftCounts.media, rightCounts.media),
  };
}

function subtractAssetCounts(
  left: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
  right: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
) {
  const leftCounts = totalAssetCounts(left);
  const rightCounts = totalAssetCounts(right);
  return {
    artifacts: Math.max(0, leftCounts.artifacts - rightCounts.artifacts),
    files: Math.max(0, leftCounts.files - rightCounts.files),
    media: Math.max(0, leftCounts.media - rightCounts.media),
  };
}

function addAssetCounts(
  left: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
  right: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined,
) {
  const leftCounts = totalAssetCounts(left);
  const rightCounts = totalAssetCounts(right);
  return {
    artifacts: leftCounts.artifacts + rightCounts.artifacts,
    files: leftCounts.files + rightCounts.files,
    media: leftCounts.media + rightCounts.media,
  };
}

function sumAssetCounts(value: Partial<Record<'artifacts' | 'files' | 'media', number>> | null | undefined): number {
  return totalAssetCounts(value).total;
}

function summarizeCandidates(
  candidates: AccountMirrorArtifactRecoveryCandidate[],
  returned: number,
): AccountMirrorArtifactRecoveryPlanResult['metrics'] {
  const byStatus = {
    eligible: 0,
    needs_detail_refresh: 0,
    deferred: 0,
    blocked: 0,
    unsupported: 0,
    terminal: 0,
  };
  const byAction = {
    queue_history_materialization: 0,
    refresh_detail_inventory: 0,
    start_materialization_policy_completion: 0,
    inspect_archive_materialization: 0,
    none: 0,
  };
  const remoteKnownMissingLocal = { artifacts: 0, files: 0, media: 0, total: 0 };
  const retrievableMissingLocal = { artifacts: 0, files: 0, media: 0, total: 0 };
  const duplicateAliases = { artifacts: 0, files: 0, media: 0, total: 0 };
  const unsupportedMetadataOnly = { artifacts: 0, files: 0, media: 0, total: 0 };
  const staticFalsePositive = { artifacts: 0, files: 0, media: 0, total: 0 };
  const retrievalFailed = { artifacts: 0, files: 0, media: 0, total: 0 };
  const failedTerminal = { artifacts: 0, files: 0, media: 0, total: 0 };
  const accountLibrary = zeroAccountLibraryRecoveryCounts();
  const unknownOrDeferred = { artifacts: 0, files: 0, media: 0, total: 0 };
  for (const candidate of candidates) {
    byStatus[candidate.status] += 1;
    byAction[candidate.action] += 1;
    remoteKnownMissingLocal.artifacts += candidate.counts.remoteKnownMissingLocal.artifacts;
    remoteKnownMissingLocal.files += candidate.counts.remoteKnownMissingLocal.files;
    remoteKnownMissingLocal.media += candidate.counts.remoteKnownMissingLocal.media;
    remoteKnownMissingLocal.total += candidate.counts.remoteKnownMissingLocal.total;
    retrievableMissingLocal.artifacts += candidate.counts.retrievableMissingLocal.artifacts;
    retrievableMissingLocal.files += candidate.counts.retrievableMissingLocal.files;
    retrievableMissingLocal.media += candidate.counts.retrievableMissingLocal.media;
    retrievableMissingLocal.total += candidate.counts.retrievableMissingLocal.total;
    duplicateAliases.artifacts += candidate.counts.duplicateAliases.artifacts;
    duplicateAliases.files += candidate.counts.duplicateAliases.files;
    duplicateAliases.media += candidate.counts.duplicateAliases.media;
    duplicateAliases.total += candidate.counts.duplicateAliases.total;
    unsupportedMetadataOnly.artifacts += candidate.counts.unsupportedMetadataOnly.artifacts;
    unsupportedMetadataOnly.files += candidate.counts.unsupportedMetadataOnly.files;
    unsupportedMetadataOnly.media += candidate.counts.unsupportedMetadataOnly.media;
    unsupportedMetadataOnly.total += candidate.counts.unsupportedMetadataOnly.total;
    staticFalsePositive.artifacts += candidate.counts.staticFalsePositive.artifacts;
    staticFalsePositive.files += candidate.counts.staticFalsePositive.files;
    staticFalsePositive.media += candidate.counts.staticFalsePositive.media;
    staticFalsePositive.total += candidate.counts.staticFalsePositive.total;
    retrievalFailed.artifacts += candidate.counts.retrievalFailed.artifacts;
    retrievalFailed.files += candidate.counts.retrievalFailed.files;
    retrievalFailed.media += candidate.counts.retrievalFailed.media;
    retrievalFailed.total += candidate.counts.retrievalFailed.total;
    failedTerminal.artifacts += candidate.counts.failedTerminal.artifacts;
    failedTerminal.files += candidate.counts.failedTerminal.files;
    failedTerminal.media += candidate.counts.failedTerminal.media;
    failedTerminal.total += candidate.counts.failedTerminal.total;
    addIntoAssetCounts(accountLibrary.remoteKnownMissingLocal, candidate.counts.accountLibrary.remoteKnownMissingLocal);
    addIntoAssetCounts(accountLibrary.retrievableMissingLocal, candidate.counts.accountLibrary.retrievableMissingLocal);
    addIntoAssetCounts(accountLibrary.unsupportedMetadataOnly, candidate.counts.accountLibrary.unsupportedMetadataOnly);
    addIntoAssetCounts(accountLibrary.duplicateAliases, candidate.counts.accountLibrary.duplicateAliases);
    addIntoAssetCounts(accountLibrary.failedTerminal, candidate.counts.accountLibrary.failedTerminal);
    addIntoAssetCounts(accountLibrary.inventory.total, candidate.counts.accountLibrary.inventory.total);
    addIntoAssetCounts(accountLibrary.inventory.stableIdentity, candidate.counts.accountLibrary.inventory.stableIdentity);
    addIntoAssetCounts(accountLibrary.inventory.directDownload, candidate.counts.accountLibrary.inventory.directDownload);
    addIntoAssetCounts(accountLibrary.inventory.needsBrowserDetail, candidate.counts.accountLibrary.inventory.needsBrowserDetail);
    addIntoAssetCounts(accountLibrary.inventory.unsupportedNoAuthority, candidate.counts.accountLibrary.inventory.unsupportedNoAuthority);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.libraryFileDetail, candidate.counts.accountLibrary.inventory.detailRoutes.libraryFileDetail);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.libraryArtifactDetail, candidate.counts.accountLibrary.inventory.detailRoutes.libraryArtifactDetail);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.libraryCanvasDetail, candidate.counts.accountLibrary.inventory.detailRoutes.libraryCanvasDetail);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.conversationDetail, candidate.counts.accountLibrary.inventory.detailRoutes.conversationDetail);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.externalOrInlineAsset, candidate.counts.accountLibrary.inventory.detailRoutes.externalOrInlineAsset);
    addIntoAssetCounts(accountLibrary.inventory.detailRoutes.unknown, candidate.counts.accountLibrary.inventory.detailRoutes.unknown);
    unknownOrDeferred.artifacts += candidate.counts.unknownOrDeferred.artifacts;
    unknownOrDeferred.files += candidate.counts.unknownOrDeferred.files;
    unknownOrDeferred.media += candidate.counts.unknownOrDeferred.media;
    unknownOrDeferred.total += candidate.counts.unknownOrDeferred.total;
  }
  return {
    total: candidates.length,
    returned,
    byStatus,
    byAction,
    remoteKnownMissingLocal,
    retrievableMissingLocal,
    duplicateAliases,
    unsupportedMetadataOnly,
    staticFalsePositive,
    retrievalFailed,
    failedTerminal,
    accountLibrary: totalAccountLibraryRecoveryCounts(accountLibrary),
    unknownOrDeferred,
  };
}

function addIntoAssetCounts(target: AssetCounts, source: Partial<Record<AssetKindField, number>> | null | undefined): void {
  const counts = totalAssetCounts(source);
  target.artifacts += counts.artifacts;
  target.files += counts.files;
  target.media += counts.media;
  target.total = target.artifacts + target.files + target.media;
}

function compareCandidates(left: AccountMirrorArtifactRecoveryCandidate, right: AccountMirrorArtifactRecoveryCandidate): number {
  const leftPriority = candidatePriority(left);
  const rightPriority = candidatePriority(right);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return right.counts.remoteKnownMissingLocal.total - left.counts.remoteKnownMissingLocal.total
    || right.counts.unknownOrDeferred.total - left.counts.unknownOrDeferred.total
    || String(left.provider ?? '').localeCompare(String(right.provider ?? ''))
    || String(left.runtimeProfileId ?? '').localeCompare(String(right.runtimeProfileId ?? ''))
    || left.id.localeCompare(right.id);
}

function candidatePriority(candidate: AccountMirrorArtifactRecoveryCandidate): number {
  if (candidate.status === 'eligible') return 0;
  if (candidate.status === 'needs_detail_refresh') return 1;
  if (candidate.status === 'deferred') return 2;
  if (candidate.status === 'blocked') return 3;
  if (candidate.status === 'unsupported') return 4;
  return 5;
}
