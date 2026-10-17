import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  createExecutionResponseForStoredRecord,
} from './responsesService.js';
import {
  createExecutionRunRecordStore,
  type ExecutionRunRecordStore,
  type ExecutionRunStoredRecord,
} from './store.js';
import {
  createResponseBatchStore,
  type ResponseBatchRecord,
  type ResponseBatchStore,
} from './responseBatchService.js';
import {
  createMediaGenerationRecordStore,
  type MediaGenerationRecordStore,
} from '../media/store.js';
import type { MediaGenerationStoredRecord } from '../media/types.js';
import type { ExecutionResponseOutputItem, ExecutionRuntimeDiagnosticsSummary } from './apiTypes.js';
import type { ExecutionRunServiceId, ExecutionRunStep } from './types.js';
import {
  createRunArchiveIndexStore,
  getRunArchiveDir,
  type RunArchiveIndexRecord,
  type RunArchiveIndexStore,
} from './archiveIndexStore.js';
import {
  createRunArchiveEvidenceStore,
  type CreateRunArchiveEvidenceInput,
  type RunArchiveEvidenceRecord,
  type RunArchiveEvidenceStore,
} from './archiveEvidenceStore.js';
import { findCachedConversationAttachmentEvidence } from './archiveCachedAssetLookup.js';
import type { FileRef } from '../browser/providers/domain.js';

export type RunArchiveItemKind =
  | 'response'
  | 'response_batch'
  | 'team_run'
  | 'media_generation'
  | 'upload'
  | 'generated_artifact'
  | 'provider_conversation'
  | 'evidence';

export interface RunArchiveListRequest {
  providerConversationId?: string | null;
  kind?: RunArchiveItemKind | 'all' | null;
  provider?: string | null;
  runtimeProfile?: string | null;
  projectId?: string | null;
  agent?: string | null;
  team?: string | null;
  responseId?: string | null;
  batchId?: string | null;
  status?: string | null;
  fileAvailable?: boolean | null;
  assetAvailability?: 'available' | 'unavailable' | 'pending' | null;
  query?: string | null;
  limit?: number | null;
}

export interface RunArchiveAssetLookupRequest {
  checksumSha256?: string | null;
  cacheKey?: string | null;
  providerArtifactId?: string | null;
  artifactId?: string | null;
  limit?: number | null;
}

export interface RunArchiveItem {
  id: string;
  object: 'run_archive_item';
  kind: RunArchiveItemKind;
  source: 'runtime' | 'response_batch' | 'media_generation' | 'evidence' | 'account_mirror';
  createdAt: string;
  updatedAt: string;
  title: string | null;
  status: string | null;
  runtimeState?: ExecutionRuntimeDiagnosticsSummary['runtimeState'] | null;
  provider: string | null;
  runtimeProfile: string | null;
  browserProfile: string | null;
  projectId: string | null;
  boundIdentityKey: string | null;
  agentId: string | null;
  teamId: string | null;
  responseId: string | null;
  batchId: string | null;
  batchIndex: number | null;
  mediaGenerationId: string | null;
  providerConversationId: string | null;
  providerConversationUrl: string | null;
  artifactId: string | null;
  fileName: string | null;
  mimeType: string | null;
  localPath: string | null;
  uri: string | null;
  cacheKey: string | null;
  checksumSha256: string | null;
  fileAvailable: boolean | null;
  metadata: Record<string, unknown>;
  links: Record<string, string>;
}

export interface RunArchiveListResult {
  object: 'run_archive';
  generatedAt: string;
  kind: RunArchiveItemKind | 'all';
  limit: number;
  items: RunArchiveItem[];
  metrics: {
    total: number;
    byKind: Record<RunArchiveItemKind, number>;
  };
}

export interface RunArchiveItemResult {
  object: 'run_archive_item_detail';
  generatedAt: string;
  item: RunArchiveItem;
}

export interface RunArchiveAssetResult {
  object: 'run_archive_asset';
  generatedAt: string;
  item: RunArchiveItem;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface RunArchiveAssetLookupResult {
  object: 'run_archive_asset_lookup';
  generatedAt: string;
  query: {
    checksumSha256: string | null;
    cacheKey: string | null;
    providerArtifactId: string | null;
    artifactId: string | null;
  };
  canonicalItem: RunArchiveItem | null;
  items: RunArchiveItem[];
  metrics: {
    total: number;
    fileAvailable: number;
    duplicateCacheKeys: string[];
  };
}

export interface RunArchiveBackfillResult {
  object: 'run_archive_backfill';
  generatedAt: string;
  index: {
    updatedAt: string;
    itemCount: number;
  };
  metrics: {
    byKind: Record<RunArchiveItemKind, number>;
  };
}

export interface RunArchiveHistoryMaterializationAsset {
  kind: 'artifact' | 'file' | 'media';
  file: FileRef;
  artifactId?: string | null;
  title?: string | null;
  manifestPath?: string | null;
  materializationMethod?: string | null;
}

export interface RunArchiveHistoryMaterializationUpsertInput {
  provider: string;
  runtimeProfile: string | null;
  browserProfile: string | null;
  projectId: string | null;
  boundIdentityKey: string | null;
  providerConversationId: string;
  providerConversationUrl: string | null;
  materializationJobId?: string | null;
  assets: RunArchiveHistoryMaterializationAsset[];
}

export interface RunArchiveHistoryMaterializationUpsertResult {
  object: 'run_archive_history_materialization_upsert';
  generatedAt: string;
  index: {
    updatedAt: string;
    itemCount: number;
  };
  metrics: {
    byKind: Record<RunArchiveItemKind, number>;
  };
  items: RunArchiveItem[];
}

export interface RunArchiveEvidenceResult {
  object: 'run_archive_evidence_result';
  generatedAt: string;
  evidence: RunArchiveEvidenceRecord;
  item: RunArchiveItem;
}

export interface RunArchiveService {
  listItems(request?: RunArchiveListRequest): Promise<RunArchiveListResult>;
  listItemsBatch?(requests: RunArchiveListRequest[]): Promise<RunArchiveListResult[]>;
  listItemsBatchAvailability?(requests: RunArchiveListRequest[]): Promise<RunArchiveListResult[]>;
  readItem(id: string): Promise<RunArchiveItemResult | null>;
  readAsset(id: string): Promise<RunArchiveAssetResult | null>;
  lookupAsset(request: RunArchiveAssetLookupRequest): Promise<RunArchiveAssetLookupResult>;
  attachEvidence(input: CreateRunArchiveEvidenceInput): Promise<RunArchiveEvidenceResult>;
  upsertResponseItems(responseId: string): Promise<RunArchiveBackfillResult>;
  upsertBatchItems(batchId: string): Promise<RunArchiveBackfillResult>;
  upsertMediaGenerationItems(mediaGenerationId: string): Promise<RunArchiveBackfillResult>;
  upsertHistoryMaterializationItems?(input: RunArchiveHistoryMaterializationUpsertInput): Promise<RunArchiveHistoryMaterializationUpsertResult>;
  backfillIndex(): Promise<RunArchiveBackfillResult>;
}

export interface RunArchiveServiceDeps {
  runStore?: ExecutionRunRecordStore;
  batchStore?: ResponseBatchStore;
  mediaStore?: MediaGenerationRecordStore;
  historyItemStore?: RunArchiveHistoryItemStore;
  indexStore?: RunArchiveIndexStore;
  evidenceStore?: RunArchiveEvidenceStore;
  now?: () => Date;
}

export interface RunArchiveHistoryItemStore {
  listItems(): Promise<RunArchiveItem[]>;
  upsertItems(items: RunArchiveItem[]): Promise<void>;
}

const DEFAULT_LIMIT = 50;

function encodeRunArchiveItemIdForRoute(id: string): string {
  return `b64/${Buffer.from(id, 'utf8').toString('base64url')}`;
}

function runArchiveItemRoute(id: string): string {
  return `/v1/archive/items/${encodeRunArchiveItemIdForRoute(id)}`;
}

export function createRunArchiveService(deps: RunArchiveServiceDeps = {}): RunArchiveService {
  const runStore = deps.runStore ?? createExecutionRunRecordStore();
  const batchStore = deps.batchStore ?? createResponseBatchStore();
  const mediaStore = deps.mediaStore ?? createMediaGenerationRecordStore();
  const historyItemStore = deps.historyItemStore ?? createRunArchiveHistoryItemStore();
  const indexStore = deps.indexStore ?? createRunArchiveIndexStore();
  const evidenceStore = deps.evidenceStore ?? createRunArchiveEvidenceStore();
  const now = deps.now ?? (() => new Date());
  async function readIndexedItems(
    scope: (item: RunArchiveItem) => boolean = () => true,
    refreshMode: 'full' | 'availability' = 'full',
  ): Promise<RunArchiveItem[]> {
    const index = await indexStore.readIndex();
    if (index) {
      const scopedItems = index.items.filter(scope);
      return refreshIndexedFileMetadata(scopedItems, {
        indexStore,
        updatedAt: now().toISOString(),
        refreshMode,
      });
    }
    return backfillIndexItems({
      runStore,
      batchStore,
      mediaStore,
      historyItemStore,
      evidenceStore,
      indexStore,
      updatedAt: now().toISOString(),
      refreshMode,
    }).then((record) => record.items);
  }
  return {
    async listItems(request = {}) {
      const normalizedRequest = {
        ...request,
        kind: normalizeKind(request.kind),
      };
      return createRunArchiveListResult(
        await readIndexedItems((item) => matchesStableRequest(item, normalizedRequest)),
        request,
        now().toISOString(),
      );
    },
    async listItemsBatch(requests) {
      if (requests.length === 0) return [];
      const normalizedRequests = requests.map((request) => ({
        ...request,
        kind: normalizeKind(request.kind),
      }));
      const items = await readIndexedItems((item) =>
        normalizedRequests.some((request) => matchesStableRequest(item, request))
      );
      const generatedAt = now().toISOString();
      return requests.map((request) => createRunArchiveListResult(items, request, generatedAt));
    },
    async listItemsBatchAvailability(requests) {
      if (requests.length === 0) return [];
      const normalizedRequests = requests.map((request) => ({
        ...request,
        kind: normalizeKind(request.kind),
      }));
      const items = await readIndexedItems(
        (item) => normalizedRequests.some((request) => matchesStableRequest(item, request)),
        'availability',
      );
      const generatedAt = now().toISOString();
      return requests.map((request) => createRunArchiveListResult(items, request, generatedAt));
    },
    async readItem(id) {
      const item = (await readIndexedItems()).find((entry) => entry.id === id) ?? null;
      if (!item) return null;
      return {
        object: 'run_archive_item_detail',
        generatedAt: now().toISOString(),
        item,
      };
    },
    async readAsset(id) {
      const item = (await readIndexedItems()).find((entry) => entry.id === id) ?? null;
      if (!item?.localPath) return null;
      const stat = await fs.stat(item.localPath).catch(() => null);
      if (!stat?.isFile()) return null;
      return {
        object: 'run_archive_asset',
        generatedAt: now().toISOString(),
        item,
        path: item.localPath,
        fileName: item.fileName ?? item.title ?? item.artifactId ?? item.id,
        mimeType: item.mimeType ?? inferArchiveAssetMimeType(item.fileName ?? item.title ?? item.localPath),
        size: stat.size,
      };
    },
    async lookupAsset(request) {
      const query = normalizeAssetLookupRequest(request);
      const limit = normalizeLimit(request.limit);
      const items = (await readIndexedItems())
        .filter((item) => matchesAssetLookupRequest(item, query))
        .sort(compareAssetLookupItems);
      const limited = items.slice(0, limit);
      const canonicalItem = limited.find((item) => item.fileAvailable === true && Boolean(item.localPath)) ?? limited[0] ?? null;
      const duplicateCacheKeys = Array.from(new Set(
        limited
          .map((item) => item.cacheKey)
          .filter((cacheKey): cacheKey is string => typeof cacheKey === 'string' && cacheKey.length > 0),
      )).filter((cacheKey) => limited.filter((item) => item.cacheKey === cacheKey).length > 1);
      return {
        object: 'run_archive_asset_lookup',
        generatedAt: now().toISOString(),
        query,
        canonicalItem,
        items: limited,
        metrics: {
          total: items.length,
          fileAvailable: items.filter((item) => item.fileAvailable === true).length,
          duplicateCacheKeys,
        },
      };
    },
    async attachEvidence(input) {
      const timestamp = now().toISOString();
      const evidence = await evidenceStore.createEvidence({
        ...input,
        createdAt: input.createdAt ?? timestamp,
        updatedAt: input.updatedAt ?? input.createdAt ?? timestamp,
      });
      const item = buildEvidenceArchiveItem(evidence);
      await ensureArchiveIndex({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
      });
      await indexStore.upsertItems([item], {
        updatedAt: timestamp,
      });
      return {
        object: 'run_archive_evidence_result',
        generatedAt: timestamp,
        evidence,
        item,
      };
    },
    async upsertResponseItems(responseId) {
      const timestamp = now().toISOString();
      const record = await runStore.readRecord(responseId);
      const items = record ? await enrichFileMetadata(await buildRunArchiveItems([record])) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.source === 'runtime' && item.responseId === responseId,
      });
      return toBackfillResult(index, timestamp);
    },
    async upsertBatchItems(batchId) {
      const timestamp = now().toISOString();
      const record = await batchStore.readBatch(batchId);
      const items = record ? buildBatchArchiveItems([record]) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.batchId === batchId && item.kind === 'response_batch',
      });
      return toBackfillResult(index, timestamp);
    },
    async upsertMediaGenerationItems(mediaGenerationId) {
      const timestamp = now().toISOString();
      const record = await mediaStore.readRecord(mediaGenerationId);
      const items = record ? await enrichFileMetadata(buildMediaArchiveItems([record])) : [];
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) => item.source === 'media_generation' && item.mediaGenerationId === mediaGenerationId,
      });
      return toBackfillResult(index, timestamp);
    },
    async upsertHistoryMaterializationItems(input) {
      const timestamp = now().toISOString();
      const items = await enrichFileMetadata(buildHistoryMaterializationArchiveItems(input, timestamp));
      await historyItemStore.upsertItems(items);
      const index = await upsertArchiveItems({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: timestamp,
        items,
        removeExisting: (item) =>
          item.source === 'account_mirror' &&
          item.provider === input.provider &&
          item.runtimeProfile === input.runtimeProfile &&
          item.boundIdentityKey === input.boundIdentityKey &&
          item.providerConversationId === input.providerConversationId &&
          items.some((candidate) => candidate.id === item.id),
      });
      return {
        ...toBackfillResult(index, timestamp),
        object: 'run_archive_history_materialization_upsert',
        items,
      };
    },
    async backfillIndex() {
      const index = await backfillIndexItems({
        runStore,
        batchStore,
        mediaStore,
        historyItemStore,
        evidenceStore,
        indexStore,
        updatedAt: now().toISOString(),
      });
      return {
        object: 'run_archive_backfill',
        generatedAt: now().toISOString(),
        index: {
          updatedAt: index.updatedAt,
          itemCount: index.itemCount,
        },
        metrics: {
          byKind: countByKind(index.items),
        },
      };
    },
  };
}

function inferArchiveAssetMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function backfillIndexItems(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  historyItemStore: RunArchiveHistoryItemStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
  refreshMode?: 'full' | 'availability';
}): Promise<RunArchiveIndexRecord> {
  const items = await collectArchiveItems(input, {
    includeChecksum: input.refreshMode !== 'availability',
  });
  return input.indexStore.writeIndex(items, { updatedAt: input.updatedAt });
}

async function ensureArchiveIndex(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  historyItemStore: RunArchiveHistoryItemStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
}): Promise<void> {
  if (await input.indexStore.readIndex()) return;
  await backfillIndexItems(input);
}

async function upsertArchiveItems(input: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  historyItemStore: RunArchiveHistoryItemStore;
  evidenceStore: RunArchiveEvidenceStore;
  indexStore: RunArchiveIndexStore;
  updatedAt: string;
  items: RunArchiveItem[];
  removeExisting: (item: RunArchiveItem) => boolean;
}): Promise<RunArchiveIndexRecord> {
  await ensureArchiveIndex(input);
  return input.indexStore.upsertItems(input.items, {
    updatedAt: input.updatedAt,
    removeExisting: input.removeExisting,
  });
}

function toBackfillResult(index: RunArchiveIndexRecord, generatedAt: string): RunArchiveBackfillResult {
  return {
    object: 'run_archive_backfill',
    generatedAt,
    index: {
      updatedAt: index.updatedAt,
      itemCount: index.itemCount,
    },
    metrics: {
      byKind: countByKind(index.items),
    },
  };
}

async function collectArchiveItems(deps: {
  runStore: ExecutionRunRecordStore;
  batchStore: ResponseBatchStore;
  mediaStore: MediaGenerationRecordStore;
  historyItemStore?: RunArchiveHistoryItemStore;
  evidenceStore?: RunArchiveEvidenceStore;
}, options: { includeChecksum?: boolean } = {}): Promise<RunArchiveItem[]> {
  const [runRecords, batchRecords, mediaRecords, historyItems, evidenceRecords] = await Promise.all([
    deps.runStore.listBundles().then((bundles) => bundles.map((bundle) => ({
      runId: bundle.run.id,
      revision: 0,
      persistedAt: bundle.run.updatedAt,
      bundle,
    } satisfies ExecutionRunStoredRecord))),
    listBatches(deps.batchStore),
    deps.mediaStore.listRecords({ limit: null }),
    (deps.historyItemStore ?? createRunArchiveHistoryItemStore()).listItems(),
    (deps.evidenceStore ?? createRunArchiveEvidenceStore()).listEvidence(),
  ]);
  return enrichFileMetadata([
    ...(await buildRunArchiveItems(runRecords)),
    ...buildBatchArchiveItems(batchRecords),
    ...buildMediaArchiveItems(mediaRecords),
    ...historyItems,
    ...evidenceRecords.map(buildEvidenceArchiveItem),
  ], options);
}

async function refreshIndexedFileMetadata(
  items: RunArchiveItem[],
  input: {
    indexStore: RunArchiveIndexStore;
    updatedAt: string;
    refreshMode: 'full' | 'availability';
  },
): Promise<RunArchiveItem[]> {
  const refreshed = await enrichFileMetadata(items, {
    includeChecksum: input.refreshMode === 'full',
  });
  const changed = refreshed.filter((item, index) => fileMetadataChanged(items[index], item));
  if (changed.length > 0) {
    await input.indexStore.upsertItems(changed, {
      updatedAt: input.updatedAt,
    });
  }
  return refreshed;
}

function listBatches(store: ResponseBatchStore): Promise<ResponseBatchRecord[]> {
  return store.listBatches
    ? store.listBatches({ limit: null })
    : createResponseBatchStore().listBatches?.({ limit: null }) ?? Promise.resolve([]);
}

export function createRunArchiveHistoryItemStore(
  filePath = path.join(getRunArchiveDir(), 'history-items', 'index.json'),
): RunArchiveHistoryItemStore {
  return {
    async listItems() {
      return readHistoryItemStoreFile(filePath);
    },
    async upsertItems(items) {
      const current = await readHistoryItemStoreFile(filePath);
      const incomingIds = new Set(items.map((item) => item.id));
      const nextItems = [
        ...current.filter((item) => !incomingIds.has(item.id)),
        ...items,
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
      await writeHistoryItemStoreFile(filePath, nextItems);
    },
  };
}

async function readHistoryItemStoreFile(filePath: string): Promise<RunArchiveItem[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStoredRunArchiveItem) : [];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function writeHistoryItemStoreFile(filePath: string, items: RunArchiveItem[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isStoredRunArchiveItem(value: unknown): value is RunArchiveItem {
  if (!isRecord(value)) return false;
  return value.object === 'run_archive_item' && typeof value.id === 'string' && isRunArchiveItemKind(value.kind);
}

function isRunArchiveItemKind(value: unknown): value is RunArchiveItemKind {
  return value === 'response' ||
    value === 'response_batch' ||
    value === 'team_run' ||
    value === 'media_generation' ||
    value === 'upload' ||
    value === 'generated_artifact' ||
    value === 'provider_conversation' ||
    value === 'evidence';
}

async function buildRunArchiveItems(records: ExecutionRunStoredRecord[]): Promise<RunArchiveItem[]> {
  const items: RunArchiveItem[] = [];
  for (const record of records) {
    const response = await createExecutionResponseForStoredRecord(record.bundle);
    const firstStep = record.bundle.steps.slice().sort((left, right) => left.order - right.order)[0] ?? null;
    const runtimeState = response.metadata?.executionSummary?.runtimeDiagnosticsSummary?.runtimeState ?? null;
    const base = createBaseRunItem(record, firstStep, runtimeState);
    const batch = readBatchMetadata(record);
    const responseKind: RunArchiveItemKind = record.bundle.run.sourceKind === 'team-run' ? 'team_run' : 'response';
    items.push({
      ...base,
      id: `${responseKind}:${record.runId}`,
      kind: responseKind,
      title: record.bundle.run.entryPrompt,
      responseId: record.runId,
      batchId: batch.batchId,
      batchIndex: batch.batchIndex,
      metadata: {
        sourceKind: record.bundle.run.sourceKind,
        outputItemCount: response.output.length,
        stepCount: record.bundle.steps.length,
        requestedOutputCount: response.metadata?.executionSummary?.requestedOutputSummary?.total ?? 0,
      },
      links: {
        response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        runtimeRun: `/v1/runtime-runs/inspect?runtimeRunId=${encodeURIComponent(record.runId)}`,
      },
    });

    for (const artifact of listInputArtifacts(record.bundle.steps)) {
      items.push({
        ...base,
        id: `upload:${record.runId}:${artifact.stepId}:${artifact.id}`,
        kind: 'upload',
        title: artifact.title,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        artifactId: artifact.id,
        fileName: artifact.title,
        localPath: artifact.path,
        uri: artifact.uri,
        metadata: {
          stepId: artifact.stepId,
          artifactKind: artifact.kind,
          ...(artifact.metadata ?? {}),
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        },
      });
    }

    for (const artifact of response.output.filter(isArtifactOutput)) {
      items.push({
        ...base,
        id: `generated-artifact:${record.runId}:${artifact.id}`,
        kind: 'generated_artifact',
        title: artifact.title ?? artifact.id,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        artifactId: artifact.id,
        fileName: readMetadataString(artifact.metadata, ['fileName', 'name']) ?? artifact.title ?? null,
        mimeType: artifact.mime_type ?? null,
        localPath: readMetadataString(artifact.metadata, ['localPath', 'path']),
        uri: artifact.uri ?? null,
        metadata: {
          artifactType: artifact.artifact_type,
          disposition: artifact.disposition ?? null,
          ...(artifact.metadata ?? {}),
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
        },
      });
    }

    for (const ref of listProviderConversationRefs(record)) {
      items.push({
        ...base,
        id: `provider-conversation:${record.runId}:${ref.provider}:${ref.conversationId}`,
        kind: 'provider_conversation',
        title: ref.conversationId,
        provider: ref.provider,
        runtimeProfile: ref.runtimeProfileId,
        browserProfile: ref.browserProfileId,
        projectId: ref.projectId,
        boundIdentityKey: ref.boundIdentityKey,
        responseId: record.runId,
        batchId: batch.batchId,
        batchIndex: batch.batchIndex,
        providerConversationId: ref.conversationId,
        providerConversationUrl: ref.url,
        metadata: {
          stepId: ref.stepId,
        },
        links: {
          response: `/v1/responses/${encodeURIComponent(record.runId)}`,
          catalogItem: buildCatalogItemPath(ref),
        },
      });
    }
  }
  return items;
}

function buildBatchArchiveItems(records: ResponseBatchRecord[]): RunArchiveItem[] {
  return records.map((record) => ({
    id: `response-batch:${record.id}`,
    object: 'run_archive_item',
    kind: 'response_batch',
    source: 'response_batch',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.id,
    status: null,
    runtimeState: null,
    provider: null,
    runtimeProfile: null,
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: null,
    batchId: record.id,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: null,
    providerConversationUrl: null,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {
      jobCount: record.jobs.length,
      limits: record.limits,
      ...record.metadata,
    },
    links: {
      batch: `/v1/response-batches/${encodeURIComponent(record.id)}`,
    },
  }));
}

function buildMediaArchiveItems(records: MediaGenerationStoredRecord[]): RunArchiveItem[] {
  const items: RunArchiveItem[] = [];
  for (const record of records) {
    const response = record.response;
    const conversation = resolveMediaGenerationConversation(response);
    const base: RunArchiveItem = {
      id: `media-generation:${response.id}`,
      object: 'run_archive_item',
      kind: 'media_generation',
      source: 'media_generation',
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      title: response.prompt,
      status: response.status,
      runtimeState: null,
      provider: response.provider,
      runtimeProfile: readRecordString(response.metadata, ['runtimeProfileId', 'runtimeProfile']),
      browserProfile: readRecordString(response.metadata, ['browserProfileId', 'browserProfile']),
      projectId: readRecordString(response.metadata, ['projectId', 'project']),
      boundIdentityKey: readRecordString(response.metadata, ['boundIdentityKey', 'identityKey', 'serviceAccountId']),
      agentId: null,
      teamId: null,
      responseId: null,
      batchId: null,
      batchIndex: null,
      mediaGenerationId: response.id,
      providerConversationId: conversation.id,
      providerConversationUrl: conversation.url,
      artifactId: null,
      fileName: null,
      mimeType: null,
      localPath: null,
      uri: null,
      cacheKey: null,
      checksumSha256: null,
      fileAvailable: null,
      metadata: {
        mediaType: response.mediaType,
        artifactCount: response.artifacts.length,
        model: response.model ?? null,
        ...(conversation.id ? { providerConversationId: conversation.id } : {}),
        ...(conversation.url ? { providerConversationUrl: conversation.url } : {}),
      },
      links: {
        mediaGeneration: `/v1/media-generations/${encodeURIComponent(response.id)}`,
      },
    };
    items.push(base);
    for (const artifact of response.artifacts) {
      items.push({
        ...base,
        id: `generated-artifact:${response.id}:${artifact.id}`,
        kind: 'generated_artifact',
        title: artifact.fileName ?? artifact.id,
        artifactId: artifact.id,
        fileName: artifact.fileName ?? null,
        mimeType: artifact.mimeType ?? null,
        localPath: artifact.path ?? null,
        uri: artifact.uri ?? null,
        metadata: {
          mediaType: artifact.type,
          width: artifact.width ?? null,
          height: artifact.height ?? null,
          durationSeconds: artifact.durationSeconds ?? null,
          ...(artifact.metadata ?? {}),
        },
      });
    }
    if (conversation.id) {
      items.push({
        ...base,
        id: `provider-conversation:${response.id}:${response.provider}:${conversation.id}`,
        kind: 'provider_conversation',
        title: conversation.id,
        links: {
          ...base.links,
          ...(conversation.url ? { conversation: conversation.url } : {}),
        },
      });
    }
  }
  return items;
}

function buildHistoryMaterializationArchiveItems(
  input: RunArchiveHistoryMaterializationUpsertInput,
  timestamp: string,
): RunArchiveItem[] {
  const items: RunArchiveItem[] = [];
  const seen = new Set<string>();
  for (const [index, asset] of input.assets.entries()) {
    const file = asset.file;
    const archiveKind: RunArchiveItemKind = asset.kind === 'file' ? 'upload' : 'generated_artifact';
    const itemId = buildHistoryMaterializationArchiveItemId(input, asset, index);
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const fileName = file.name || asset.title || file.id || null;
    const mimeType = file.mimeType ?? (fileName ? inferArchiveAssetMimeType(fileName) : null);
    const materializationMethod =
      asset.materializationMethod ??
      readRecordString(file.metadata, ['materialization', 'materializationSource']) ??
      null;
    items.push({
      id: itemId,
      object: 'run_archive_item',
      kind: archiveKind,
      source: 'account_mirror',
      createdAt: timestamp,
      updatedAt: timestamp,
      title: asset.title ?? file.name ?? file.id,
      status: 'materialized',
      runtimeState: null,
      provider: input.provider,
      runtimeProfile: input.runtimeProfile,
      browserProfile: input.browserProfile,
      projectId: input.projectId,
      boundIdentityKey: input.boundIdentityKey,
      agentId: null,
      teamId: null,
      responseId: null,
      batchId: null,
      batchIndex: null,
      mediaGenerationId: null,
      providerConversationId: input.providerConversationId,
      providerConversationUrl: input.providerConversationUrl,
      artifactId: asset.artifactId ?? file.id,
      fileName,
      mimeType,
      localPath: file.localPath ?? null,
      uri: file.remoteUrl ?? null,
      cacheKey: file.checksumSha256 ? `sha256:${file.checksumSha256}` : null,
      checksumSha256: file.checksumSha256 ?? null,
      fileAvailable: file.localPath ? null : false,
      metadata: {
        ...(file.metadata ?? {}),
        providerFileId:
          typeof file.metadata?.providerFileId === 'string' && file.metadata.providerFileId.trim().length > 0
            ? file.metadata.providerFileId
            : file.id,
        providerFileSource: file.source,
        historyAssetKind: asset.kind,
        historyMaterializationJobId: input.materializationJobId ?? null,
        manifestPath: asset.manifestPath ?? null,
        materialization: {
          status: file.localPath ? 'materialized' : 'unavailable',
          source: 'history-materialization',
          method: materializationMethod,
        },
      },
      links: {
        catalogItem: buildHistoryCatalogItemPath(input),
        ...(input.providerConversationUrl ? { conversation: input.providerConversationUrl } : {}),
      },
    });
  }
  return items;
}

function buildHistoryMaterializationArchiveItemId(
  input: RunArchiveHistoryMaterializationUpsertInput,
  asset: RunArchiveHistoryMaterializationAsset,
  index: number,
): string {
  const prefix = asset.kind === 'file' ? 'history-file' : asset.kind === 'media' ? 'history-media' : 'history-generated-artifact';
  const identity = input.boundIdentityKey ?? input.runtimeProfile ?? input.browserProfile ?? 'unknown-identity';
  const file = asset.file;
  return [
    prefix,
    input.provider,
    sanitizeHistoryArchiveIdSegment(identity),
    sanitizeHistoryArchiveIdSegment(input.providerConversationId),
    sanitizeHistoryArchiveIdSegment(asset.artifactId ?? file.id ?? file.name ?? `asset-${index + 1}`),
  ].join(':');
}

function sanitizeHistoryArchiveIdSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._=-]+/g, '_').slice(0, 140);
  return normalized || 'unknown';
}

function buildHistoryCatalogItemPath(input: {
  provider: string;
  providerConversationId: string;
  runtimeProfile: string | null;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    kind: 'conversations',
  });
  if (input.runtimeProfile) params.set('runtimeProfile', input.runtimeProfile);
  return `/v1/account-mirrors/catalog/items/${encodeURIComponent(input.providerConversationId)}?${params.toString()}`;
}

function resolveMediaGenerationConversation(
  response: MediaGenerationStoredRecord['response'],
): { id: string | null; url: string | null } {
  const metadataUrl = readRecordString(response.metadata, ['tabUrl', 'conversationUrl', 'providerConversationUrl', 'url']);
  const metadataId = readRecordString(response.metadata, ['conversationId', 'conversation_id', 'providerConversationId']);
  const timeline = Array.isArray(response.timeline) ? response.timeline : [];
  let timelineUrl: string | null = null;
  let timelineId: string | null = null;
  for (const event of timeline) {
    if (!isRecord(event)) continue;
    const details = event.details;
    timelineUrl = readRecordString(details, ['tabUrl', 'conversationUrl', 'providerConversationUrl', 'url']) ?? timelineUrl;
    timelineId = readRecordString(details, ['conversationId', 'conversation_id', 'providerConversationId']) ?? timelineId;
  }
  const url = metadataUrl ?? timelineUrl;
  const id = metadataId ?? timelineId ?? extractConversationIdFromProviderUrl(url);
  return {
    id,
    url: url ?? resolveProviderConversationUrl(response.provider, id),
  };
}

function createBaseRunItem(
  record: ExecutionRunStoredRecord,
  firstStep: ExecutionRunStep | null,
  runtimeState: ExecutionRuntimeDiagnosticsSummary['runtimeState'] | null,
): RunArchiveItem {
  const browserRun = readStepBrowserRun(firstStep);
  const providerConversationId = readRecordString(browserRun, ['conversationId', 'conversation_id']);
  const providerConversationUrl = readRecordString(browserRun, ['tabUrl', 'conversationUrl', 'url']);
  return {
    id: `response:${record.runId}`,
    object: 'run_archive_item',
    kind: 'response',
    source: 'runtime',
    createdAt: record.bundle.run.createdAt,
    updatedAt: record.bundle.run.updatedAt,
    title: record.bundle.run.entryPrompt,
    status: record.bundle.run.status,
    runtimeState,
    provider: readRecordString(browserRun, ['provider', 'service']) ?? firstStep?.service ?? null,
    runtimeProfile: firstStep?.runtimeProfileId ?? readRecordString(record.bundle.run.initialInputs, ['runtimeProfile']),
    browserProfile: firstStep?.browserProfileId ?? null,
    projectId: readRecordString(browserRun, ['projectId', 'project']),
    boundIdentityKey: readRecordString(browserRun, ['boundIdentityKey', 'identityKey', 'serviceAccountId']),
    agentId: firstStep?.agentId ?? null,
    teamId: record.bundle.run.sourceKind === 'team-run' ? record.bundle.run.sourceId : readRecordString(record.bundle.run.initialInputs, ['team']),
    responseId: record.runId,
    batchId: null,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId,
    providerConversationUrl,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {},
    links: {},
  };
}

function buildEvidenceArchiveItem(record: RunArchiveEvidenceRecord): RunArchiveItem {
  return {
    id: `evidence:${record.id}`,
    object: 'run_archive_item',
    kind: 'evidence',
    source: 'evidence',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.title ?? record.summary ?? record.schema,
    status: record.status,
    runtimeState: null,
    provider: null,
    runtimeProfile: null,
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: record.responseId,
    batchId: record.batchId,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: record.providerConversationId,
    providerConversationUrl: null,
    artifactId: record.archiveItemId,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {
      producer: record.producer,
      schema: record.schema,
      summary: record.summary,
      archiveItemId: record.archiveItemId,
      evidenceId: record.id,
      data: record.data,
      ...record.metadata,
    },
    links: {
      ...(record.responseId ? { response: `/v1/responses/${encodeURIComponent(record.responseId)}` } : {}),
      ...(record.batchId ? { batch: `/v1/response-batches/${encodeURIComponent(record.batchId)}` } : {}),
      ...(record.archiveItemId ? { archiveItem: runArchiveItemRoute(record.archiveItemId) } : {}),
    },
  };
}

function listInputArtifacts(steps: ExecutionRunStep[]): Array<{
  stepId: string;
  id: string;
  kind: string;
  title: string | null;
  path: string | null;
  uri: string | null;
  metadata: Record<string, unknown> | null;
}> {
  return steps.flatMap((step) =>
    step.input.artifacts.map((artifact) => ({
      stepId: step.id,
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title ?? null,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      metadata: artifact.metadata ?? null,
    })),
  );
}

function readStepBrowserRun(step: ExecutionRunStep | null): Record<string, unknown> | null {
  return isRecord(step?.output?.structuredData?.browserRun)
    ? step.output.structuredData.browserRun
    : null;
}

function listProviderConversationRefs(record: ExecutionRunStoredRecord): Array<{
  stepId: string;
  provider: Exclude<ExecutionRunServiceId, null>;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  projectId: string | null;
  boundIdentityKey: string | null;
  conversationId: string;
  url: string | null;
}> {
  const refs: ReturnType<typeof listProviderConversationRefs> = [];
  const seen = new Set<string>();
  for (const step of record.bundle.steps) {
    const browserRun = isRecord(step.output?.structuredData?.browserRun)
      ? step.output.structuredData.browserRun
      : null;
    if (!browserRun) continue;
    const provider = normalizeProvider(readRecordString(browserRun, ['provider', 'service']) ?? step.service);
    const conversationId = readRecordString(browserRun, ['conversationId', 'conversation_id']);
    if (!provider || !conversationId) continue;
    const runtimeProfileId = readRecordString(browserRun, ['runtimeProfileId', 'runtimeProfile']) ?? step.runtimeProfileId;
    const browserProfileId = readRecordString(browserRun, ['browserProfileId', 'browserProfile']) ?? step.browserProfileId;
    const projectId = readRecordString(browserRun, ['projectId', 'project']);
    const boundIdentityKey = readRecordString(browserRun, ['boundIdentityKey', 'identityKey', 'serviceAccountId']);
    const key = [provider, runtimeProfileId ?? '', conversationId].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      stepId: step.id,
      provider,
      runtimeProfileId,
      browserProfileId,
      projectId,
      boundIdentityKey,
      conversationId,
      url: readRecordString(browserRun, ['tabUrl', 'conversationUrl', 'url']),
    });
  }
  return refs;
}

function readBatchMetadata(record: ExecutionRunStoredRecord): {
  batchId: string | null;
  batchIndex: number | null;
} {
  const metadata = isRecord(record.bundle.run.initialInputs.metadata)
    ? record.bundle.run.initialInputs.metadata
    : {};
  return {
    batchId: readRecordString(metadata, ['batchId']),
    batchIndex: typeof metadata.batchIndex === 'number' ? metadata.batchIndex : null,
  };
}

function matchesStableRequest(
  item: RunArchiveItem,
  request: RunArchiveListRequest & { kind: RunArchiveItemKind | 'all' },
): boolean {
  if (request.kind !== 'all' && item.kind !== request.kind) return false;
  if (request.provider && item.provider !== request.provider) return false;
  if (request.providerConversationId && item.providerConversationId !== request.providerConversationId) return false;
  if (request.runtimeProfile && item.runtimeProfile !== request.runtimeProfile) return false;
  if (request.projectId && item.projectId !== request.projectId) return false;
  if (request.agent && item.agentId !== request.agent) return false;
  if (request.team && item.teamId !== request.team) return false;
  if (request.responseId && item.responseId !== request.responseId) return false;
  if (request.batchId && item.batchId !== request.batchId) return false;
  if (request.status && item.status !== request.status && item.runtimeState !== request.status) return false;
  return true;
}

function matchesRequest(item: RunArchiveItem, request: RunArchiveListRequest & { kind: RunArchiveItemKind | 'all' }): boolean {
  if (!matchesStableRequest(item, request)) return false;
  if (typeof request.fileAvailable === 'boolean' && item.fileAvailable !== request.fileAvailable) return false;
  if (request.assetAvailability === 'available' && item.fileAvailable !== true) return false;
  if (request.assetAvailability === 'unavailable' && item.fileAvailable !== false) return false;
  if (request.assetAvailability === 'pending' && item.fileAvailable !== null) return false;
  if (request.query && !itemMatchesQuery(item, request.query)) return false;
  return true;
}

function normalizeAssetLookupRequest(request: RunArchiveAssetLookupRequest): RunArchiveAssetLookupResult['query'] {
  const query = {
    checksumSha256: normalizeLookupString(request.checksumSha256)?.toLowerCase() ?? null,
    cacheKey: normalizeLookupString(request.cacheKey) ?? null,
    providerArtifactId: normalizeLookupString(request.providerArtifactId) ?? null,
    artifactId: normalizeLookupString(request.artifactId) ?? null,
  };
  if (!query.checksumSha256 && !query.cacheKey && !query.providerArtifactId && !query.artifactId) {
    throw new Error('At least one archive asset lookup key is required.');
  }
  return query;
}

function matchesAssetLookupRequest(item: RunArchiveItem, query: RunArchiveAssetLookupResult['query']): boolean {
  if (item.kind !== 'upload' && item.kind !== 'generated_artifact') return false;
  if (query.checksumSha256 && item.checksumSha256 !== query.checksumSha256) return false;
  if (query.cacheKey && item.cacheKey !== query.cacheKey) return false;
  if (query.artifactId && item.artifactId !== query.artifactId) return false;
  if (query.providerArtifactId) {
    const providerArtifactId =
      readRecordString(item.metadata, ['providerArtifactId', 'fileId', 'remoteId']) ??
      item.artifactId;
    if (providerArtifactId !== query.providerArtifactId) return false;
  }
  return true;
}

function compareAssetLookupItems(left: RunArchiveItem, right: RunArchiveItem): number {
  const leftAvailable = left.fileAvailable === true && Boolean(left.localPath) ? 1 : 0;
  const rightAvailable = right.fileAvailable === true && Boolean(right.localPath) ? 1 : 0;
  if (leftAvailable !== rightAvailable) return rightAvailable - leftAvailable;
  const leftChecksum = left.checksumSha256 ? 1 : 0;
  const rightChecksum = right.checksumSha256 ? 1 : 0;
  if (leftChecksum !== rightChecksum) return rightChecksum - leftChecksum;
  return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
}

function normalizeLookupString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function itemMatchesQuery(item: RunArchiveItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.id,
    item.title,
    item.runtimeState,
    item.provider,
    item.runtimeProfile,
    item.projectId,
    item.boundIdentityKey,
    item.agentId,
    item.teamId,
    item.responseId,
    item.batchId,
    item.providerConversationId,
    item.fileName,
    item.uri,
    item.localPath,
    item.checksumSha256,
    JSON.stringify(item.metadata),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();
  return haystack.includes(needle);
}

async function enrichFileMetadata(
  items: RunArchiveItem[],
  options: { includeChecksum?: boolean } = {},
): Promise<RunArchiveItem[]> {
  return Promise.all(items.map(async (item) => {
    const cachedConversationEvidence = item.localPath ? null : await findCachedConversationAttachmentEvidence(item);
    const cachedConversationAsset = cachedConversationEvidence?.file ?? null;
    const discoveredLocalPath =
      item.localPath ??
      cachedConversationAsset?.localPath ??
      await findExistingMaterializedArchiveFile(item);
    const localFile = await inspectArchiveLocalFile(discoveredLocalPath, options.includeChecksum ?? true);
    const liveChecksumSha256 = localFile.checksumSha256;
    const checksumSha256 = liveChecksumSha256 ?? item.checksumSha256 ?? readRecordString(item.metadata, ['checksumSha256']);
    const pathExists = localFile.pathExists;
    const unavailableEvidence: Record<string, unknown> | null =
      localFile.unavailableErrorCode
        ? buildUnavailableLocalFileEvidence(discoveredLocalPath ?? '', localFile.unavailableErrorCode)
        : pathExists === false
        ? buildMissingLocalFileEvidence(item, discoveredLocalPath ?? '')
        : !discoveredLocalPath
          ? cachedConversationEvidence?.unavailable
            ? { ...cachedConversationEvidence.unavailable }
            : buildGeneratedArtifactUnavailableEvidence(item)
          : null;
    const fileAvailable = pathExists ?? (unavailableEvidence ? false : null);
    const liveFileSizeBytes = localFile.fileSizeBytes;
    const fileSizeBytes = liveFileSizeBytes ?? readRecordNumber(item.metadata, ['fileSizeBytes', 'size']);
    const cacheKey = checksumSha256
      ? `sha256:${checksumSha256}`
      : discoveredLocalPath
        ? `path:${discoveredLocalPath}`
        : null;
    const fileName = item.fileName ?? cachedConversationAsset?.name ?? (discoveredLocalPath ? path.basename(discoveredLocalPath) : null);
    const mimeType = item.mimeType ?? cachedConversationAsset?.mimeType ?? (fileName ? inferArchiveAssetMimeType(fileName) : null);
    const currentMetadata = {
      ...item.metadata,
      ...(cachedConversationAsset?.metadata ?? {}),
    };
    const normalizedMetadata = fileAvailable === true
      ? clearRefreshOwnedUnavailableMetadata(currentMetadata)
      : currentMetadata;
    return {
      ...item,
      fileName,
      mimeType,
      localPath: discoveredLocalPath,
      cacheKey: cacheKey ?? item.cacheKey,
      checksumSha256,
      fileAvailable,
      uri: cachedConversationAsset?.remoteUrl ?? item.uri,
      links: {
        ...item.links,
        ...(fileAvailable === true ? { asset: `${runArchiveItemRoute(item.id)}/asset` } : {}),
      },
      metadata: {
        ...normalizedMetadata,
        ...(unavailableEvidence ? {
          ...unavailableEvidence,
          fileAvailable: false,
          materialization: {
            status: 'unavailable',
            source: 'archive-read-refresh',
            method: readUnavailableEvidenceReason(unavailableEvidence),
          },
        } : {}),
        ...(discoveredLocalPath ? { localPath: discoveredLocalPath, path: discoveredLocalPath } : {}),
        ...(cachedConversationAsset?.remoteUrl ? { remoteUrl: cachedConversationAsset.remoteUrl } : {}),
        ...(fileName ? { fileName } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(checksumSha256 ? { checksumSha256 } : {}),
        ...(fileSizeBytes !== null ? { fileSizeBytes } : {}),
        ...(fileAvailable !== null ? { fileAvailable } : {}),
      },
    };
  }));
}

function clearRefreshOwnedUnavailableMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...metadata };
  delete normalized.unavailableReason;
  delete normalized.missingLocalPath;
  delete normalized.unavailableLocalPath;
  delete normalized.unavailableErrorCode;

  if (
    isRecord(normalized.materialization) &&
    normalized.materialization.status === 'unavailable' &&
    normalized.materialization.source === 'archive-read-refresh'
  ) {
    delete normalized.materialization;
  }

  return normalized;
}

function buildGeneratedArtifactUnavailableEvidence(item: RunArchiveItem): Record<string, unknown> | null {
  if (item.kind !== 'generated_artifact') return null;
  if (item.localPath || readRecordString(item.metadata, ['localPath', 'path'])) return null;
  if (item.mediaGenerationId) {
    return {
      unavailableReason: 'media-artifact-missing-local-path',
    };
  }
  if (item.providerConversationId) return null;
  return {
    unavailableReason: 'missing-provider-conversation',
  };
}

function buildMissingLocalFileEvidence(item: RunArchiveItem, localPath: string): Record<string, unknown> | null {
  if (item.kind !== 'generated_artifact' && item.kind !== 'upload') return null;
  return {
    unavailableReason: item.mediaGenerationId ? 'media-artifact-local-file-missing' : 'local-file-missing',
    missingLocalPath: localPath,
  };
}

function buildUnavailableLocalFileEvidence(
  localPath: string,
  errorCode: string,
): Record<string, unknown> {
  return {
    unavailableReason: 'local-file-unavailable',
    unavailableLocalPath: localPath,
    unavailableErrorCode: errorCode,
  };
}

function readUnavailableEvidenceReason(evidence: Record<string, unknown>): string {
  return readRecordString(evidence, ['sourceArtifactFetchReason', 'unavailableReason']) ?? 'unavailable';
}

function fileMetadataChanged(previous: RunArchiveItem | undefined, next: RunArchiveItem): boolean {
  if (!previous) return true;
  return previous.cacheKey !== next.cacheKey ||
    previous.checksumSha256 !== next.checksumSha256 ||
    previous.fileAvailable !== next.fileAvailable ||
    previous.localPath !== next.localPath ||
    previous.uri !== next.uri ||
    previous.fileName !== next.fileName ||
    previous.mimeType !== next.mimeType ||
    previous.metadata.localPath !== next.metadata.localPath ||
    previous.metadata.path !== next.metadata.path ||
    previous.metadata.remoteUrl !== next.metadata.remoteUrl ||
    JSON.stringify(previous.metadata.materialization ?? null) !== JSON.stringify(next.metadata.materialization ?? null) ||
    previous.metadata.unavailableReason !== next.metadata.unavailableReason ||
    previous.metadata.sourceArtifactFetchStatus !== next.metadata.sourceArtifactFetchStatus ||
    previous.metadata.sourceArtifactFetchReason !== next.metadata.sourceArtifactFetchReason ||
    previous.metadata.fileName !== next.metadata.fileName ||
    previous.metadata.mimeType !== next.metadata.mimeType ||
    previous.metadata.checksumSha256 !== next.metadata.checksumSha256 ||
    previous.metadata.fileSizeBytes !== next.metadata.fileSizeBytes ||
    previous.metadata.fileAvailable !== next.metadata.fileAvailable ||
    previous.links.asset !== next.links.asset;
}

async function findExistingMaterializedArchiveFile(item: RunArchiveItem): Promise<string | null> {
  if (item.kind !== 'generated_artifact') return null;
  const dir = path.join(getRunArchiveDir(), 'materialized', sanitizeArchiveMaterializedPathSegment(item.id));
  const files = await listRegularArchiveFiles(dir);
  if (files.length === 0) return null;
  const expectedFileName = normalizeArchiveComparableString(item.fileName ?? item.title);
  if (expectedFileName) {
    const match = files.find((file) => normalizeArchiveComparableString(path.basename(file)) === expectedFileName);
    if (match) return match;
  }
  return files.length === 1 ? files[0] : null;
}

async function listRegularArchiveFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (isMissingFileError(error)) return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      files.push(entryPath);
    } else if (entry.isDirectory()) {
      files.push(...await listRegularArchiveFiles(entryPath));
    }
  }
  return files.sort();
}

function sanitizeArchiveMaterializedPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'archive-item';
}

function normalizeArchiveComparableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

async function inspectArchiveLocalFile(localPath: string | null, includeChecksum = true): Promise<{
  checksumSha256: string | null;
  pathExists: boolean | null;
  fileSizeBytes: number | null;
  unavailableErrorCode: string | null;
}> {
  if (!localPath) {
    return {
      checksumSha256: null,
      pathExists: null,
      fileSizeBytes: null,
      unavailableErrorCode: null,
    };
  }
  if (!includeChecksum) {
    try {
      const file = await fs.open(localPath, 'r');
      const stats = await (async () => {
        try {
          const stats = await file.stat();
          if (stats.isDirectory()) {
            throw Object.assign(new Error(`Cannot read archive directory: ${localPath}`), { code: 'EISDIR' });
          }
          // A stat alone can claim unreadable assets are available. Probe one byte
          // to preserve read failures without hashing or loading the payload.
          await file.read(Buffer.alloc(1), 0, 1, 0);
          return stats;
        } finally {
          await file.close();
        }
      })();
      return {
        checksumSha256: null,
        pathExists: true,
        fileSizeBytes: stats.isFile() ? stats.size : null,
        unavailableErrorCode: null,
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode: null };
      }
      const unavailableErrorCode = readUnavailableArchiveAssetErrorCode(error);
      if (unavailableErrorCode) {
        return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode };
      }
      throw error;
    }
  }
  let checksumSha256: string | null = null;
  try {
    const content = await fs.readFile(localPath);
    checksumSha256 = createHash('sha256').update(content).digest('hex');
  } catch (error) {
    if (isMissingFileError(error)) {
      return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode: null };
    }
    const unavailableErrorCode = readUnavailableArchiveAssetErrorCode(error);
    if (unavailableErrorCode) {
      return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode };
    }
    throw error;
  }
  try {
    await fs.access(localPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return { checksumSha256, pathExists: false, fileSizeBytes: null, unavailableErrorCode: null };
    }
    const unavailableErrorCode = readUnavailableArchiveAssetErrorCode(error);
    if (unavailableErrorCode) {
      return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode };
    }
    throw error;
  }
  try {
    const stats = await fs.stat(localPath);
    return {
      checksumSha256,
      pathExists: true,
      fileSizeBytes: stats.isFile() ? stats.size : null,
      unavailableErrorCode: null,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { checksumSha256, pathExists: false, fileSizeBytes: null, unavailableErrorCode: null };
    }
    const unavailableErrorCode = readUnavailableArchiveAssetErrorCode(error);
    if (unavailableErrorCode) {
      return { checksumSha256: null, pathExists: false, fileSizeBytes: null, unavailableErrorCode };
    }
    throw error;
  }
}

function readUnavailableArchiveAssetErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') return null;
  return ['ENODEV', 'ESTALE', 'EIO', 'EACCES', 'EPERM'].includes(error.code) ? error.code : null;
}

function normalizeKind(value: RunArchiveListRequest['kind']): RunArchiveItemKind | 'all' {
  if (
    value === 'response' ||
    value === 'response_batch' ||
    value === 'team_run' ||
    value === 'media_generation' ||
    value === 'upload' ||
    value === 'generated_artifact' ||
    value === 'provider_conversation' ||
    value === 'evidence'
  ) {
    return value;
  }
  return 'all';
}

function createRunArchiveListResult(
	indexedItems: RunArchiveItem[],
	request: RunArchiveListRequest,
	generatedAt: string,
): RunArchiveListResult {
	const kind = normalizeKind(request.kind);
	const limit = normalizeLimit(request.limit);
	const items = indexedItems
		.filter((item) => matchesRequest(item, { ...request, kind }))
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	return {
		object: 'run_archive',
		generatedAt,
		kind,
		limit,
		items: items.slice(0, limit),
		metrics: {
			total: items.length,
			byKind: countByKind(items),
		},
	};
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return DEFAULT_LIMIT;
}

function countByKind(items: RunArchiveItem[]): Record<RunArchiveItemKind, number> {
  const counts: Record<RunArchiveItemKind, number> = {
    response: 0,
    response_batch: 0,
    team_run: 0,
    media_generation: 0,
    upload: 0,
    generated_artifact: 0,
    provider_conversation: 0,
    evidence: 0,
  };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  return counts;
}

function isArtifactOutput(item: ExecutionResponseOutputItem): item is Extract<ExecutionResponseOutputItem, { type: 'artifact' }> {
  return item.type === 'artifact';
}

function buildCatalogItemPath(input: {
  provider: Exclude<ExecutionRunServiceId, null>;
  conversationId: string;
  runtimeProfileId: string | null;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    kind: 'conversations',
  });
  if (input.runtimeProfileId) params.set('runtimeProfile', input.runtimeProfileId);
  return `/v1/account-mirrors/catalog/items/${encodeURIComponent(input.conversationId)}?${params.toString()}`;
}

function normalizeProvider(value: unknown): Exclude<ExecutionRunServiceId, null> | null {
  if (value === 'chatgpt' || value === 'gemini' || value === 'grok') return value;
  return null;
}

function extractConversationIdFromProviderUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
    if (parsed.hostname === 'gemini.google.com') {
      const appIndex = segments.indexOf('app');
      return appIndex >= 0 ? segments[appIndex + 1] ?? null : null;
    }
    if (parsed.hostname === 'chatgpt.com') {
      const conversationIndex = segments.indexOf('c');
      return conversationIndex >= 0 ? segments[conversationIndex + 1] ?? null : null;
    }
    if (parsed.hostname === 'grok.com') {
      return segments.find((segment) => segment.length > 0) ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveProviderConversationUrl(provider: string, conversationId: string | null): string | null {
  if (!conversationId) return null;
  if (provider === 'gemini') return `https://gemini.google.com/app/${encodeURIComponent(conversationId)}`;
  if (provider === 'chatgpt') return `https://chatgpt.com/c/${encodeURIComponent(conversationId)}`;
  return null;
}

function readMetadataString(value: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  return readRecordString(value, keys);
}

function readRecordString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
  }
  return null;
}

function readRecordNumber(value: unknown, keys: string[]): number | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) return entry;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
