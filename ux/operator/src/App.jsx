import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bot,
  ChevronDown,
  Check,
  Columns3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  HeartPulse,
  KeyRound,
  ListFilter,
  Menu,
  MessageSquareText,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "auracall.operatorUx.v1";
const SEARCH_TABLE_STORAGE_KEY = "auracall.operatorUx.searchTable.v2";
const SEARCH_VIEWS_STORAGE_KEY = "auracall.operatorUx.searchViews.v1";
const STATUS_POLL_MS = 30000;
const SEARCH_REFRESH_MS = 45000;
const SEARCH_PAGE_SIZE = 80;
const SEARCH_ROW_HEIGHT = 34;
const SEARCH_OVERSCAN_ROWS = 8;
const COMPACT_SEARCH_COLUMN_WIDTHS = {
  sortTime: 138,
  provider: 82,
  title: 260,
  actions: 104,
};

const NAV_ITEMS = [
  { id: "chats", label: "Chats", icon: MessageSquareText },
  { id: "search", label: "Search", icon: Search },
  { id: "runs", label: "Runs", icon: Activity },
  { id: "health", label: "Health", icon: HeartPulse },
];

const MENU_ITEMS = [
  { label: "UX Settings", icon: Settings },
  { label: "Tenant Config", icon: ShieldCheck },
  { label: "Agents", icon: Bot },
  { label: "Teams", icon: UsersRound },
  { label: "API Keys", icon: KeyRound },
  { label: "Diagnostics", icon: TerminalSquare },
];

const SEARCH_KIND_FACETS = [
  { id: "all", label: "All" },
  { id: "conversation", label: "Chats" },
  { id: "artifact", label: "Artifacts" },
  { id: "upload", label: "Uploads" },
  { id: "run", label: "Runs" },
  { id: "evidence", label: "Evidence" },
];

const SEARCH_ASSET_FACETS = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "unavailable", label: "Missing" },
  { id: "pending", label: "Pending" },
];

const SEARCH_MATERIALIZATION_FACETS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "queued", label: "Queued" },
  { id: "running", label: "Running" },
  { id: "succeeded", label: "Done" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "skipped", label: "Skipped" },
];

const SEARCH_TABLE_COLUMNS = [
  { id: "sortTime", label: "Time", width: 156, minWidth: 124, sortable: true, pinned: true },
  { id: "provider", label: "Provider", width: 98, minWidth: 82, sortable: true, pinned: true },
  { id: "tenant", label: "Tenant", width: 190, minWidth: 148, sortable: true, pinned: true },
  { id: "project", label: "Project", width: 160, minWidth: 120, sortable: true },
  { id: "title", label: "Title", width: 480, minWidth: 240, sortable: true },
  { id: "actions", label: "Actions", width: 108, minWidth: 96, sortable: false },
  { id: "kind", label: "Kind", width: 104, minWidth: 88, sortable: true },
  { id: "status", label: "Status", width: 112, minWidth: 92, sortable: true },
  { id: "files", label: "Files", width: 96, minWidth: 80, sortable: true },
  { id: "ids", label: "IDs", width: 220, minWidth: 160, sortable: false },
  { id: "updatedAt", label: "Updated", width: 156, minWidth: 124, sortable: true },
];
const PINNED_SEARCH_COLUMN_IDS = new Set(SEARCH_TABLE_COLUMNS.filter((column) => column.pinned).map((column) => column.id));
const DEFAULT_SEARCH_TABLE_HIDDEN = ["project", "ids", "updatedAt"];
const DEFAULT_SEARCH_TABLE_ORDER = ["title", "status", "kind", "files", "actions", "project", "ids", "updatedAt"];
const DEFAULT_SEARCH_TABLE_PREFS = {
  sort: { column: "sortTime", direction: "desc" },
  widths: {},
  hidden: DEFAULT_SEARCH_TABLE_HIDDEN,
  order: DEFAULT_SEARCH_TABLE_ORDER,
};

const DEFAULT_LAYOUT = {
  activeNav: "chats",
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 264,
  rightWidth: 320,
};

function readUrlParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function statusReadout(input) {
  const hasPayload = Boolean(input.payload);
  const tone = input.error ? "error" : hasPayload ? "ok" : input.loading ? "waiting" : "error";
  const label = input.error
    ? input.errorLabel
    : hasPayload
      ? input.loadedLabel
      : input.loading
        ? "Loading"
        : input.unavailableLabel;
  const detail = input.updatedAt
    ? `Updated ${formatDateTime(input.updatedAt)}`
    : hasPayload
      ? "Loaded from latest available payload"
      : "Waiting for first poll";
  return { tone, label, detail };
}

function readLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const params = readUrlParams();
    const activeNav = params.get("nav");
    return {
      ...DEFAULT_LAYOUT,
      ...stored,
      ...(NAV_ITEMS.some((item) => item.id === activeNav) ? { activeNav } : {}),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function readLiveFollowAccountFromUrl() {
  const params = readUrlParams();
  const provider = params.get("provider");
  const runtimeProfileId = params.get("runtime") ?? params.get("runtimeProfile");
  if (!provider || !runtimeProfileId) return null;
  return { provider, runtimeProfileId };
}

function replaceUrlParams(updates) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatDateTime(value) {
  if (!value) return "not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function compactText(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function fileNameFromDisposition(value) {
  const match = String(value ?? "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/u, "")) : null;
}

function isPreviewableText(mimeType, fileName) {
  const mime = String(mimeType ?? "").toLowerCase();
  const name = String(fileName ?? "").toLowerCase();
  return (
    mime.startsWith("text/")
    || ["application/json", "application/xml", "application/javascript"].includes(mime)
    || /\.(json|txt|md|csv|xml|log)$/u.test(name)
  );
}

function base64UrlEncodeText(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function base64UrlDecodeText(value) {
  try {
    const normalized = String(value ?? "").replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function readArchiveItemFromUrl() {
  const params = readUrlParams();
  const encodedId = params.get("archiveItem");
  if (!encodedId) return null;
  const id = base64UrlDecodeText(encodedId);
  return id ? { id } : null;
}

function readSearchRowFromUrl() {
  const params = readUrlParams();
  const encodedId = params.get("row");
  if (!encodedId) return null;
  const id = base64UrlDecodeText(encodedId);
  return id ? { id } : null;
}

function readSearchFiltersFromUrl() {
  const params = readUrlParams();
  const kinds = new Set(SEARCH_KIND_FACETS.map((facet) => facet.id));
  const assets = new Set(SEARCH_ASSET_FACETS.map((facet) => facet.id));
  const materializations = new Set(SEARCH_MATERIALIZATION_FACETS.map((facet) => facet.id));
  const kind = params.get("kind") ?? "all";
  const assetAvailability = params.get("assets") ?? params.get("assetAvailability") ?? "all";
  const materialization = params.get("materialization") ?? "all";
  return {
    q: params.get("q") ?? "",
    kind: kinds.has(kind) ? kind : "all",
    assets: assets.has(assetAvailability) ? assetAvailability : "all",
    materialization: materializations.has(materialization) ? materialization : "all",
    providers: new Set(splitSearchUrlList(params.get("searchProvider"))),
    statuses: new Set(splitSearchUrlList(params.get("searchStatus"))),
  };
}

function splitSearchUrlList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeSearchUrlList(values) {
  return [...(values ?? new Set())].sort().join(",");
}

function archiveItemRoute(item) {
  if (!item?.id) return null;
  return `/v1/archive/items/b64/${base64UrlEncodeText(item.id)}`;
}

function archiveItemAssetRoute(item) {
  if (!item?.fileAvailable) return null;
  const route = archiveItemRoute(item);
  return item.links?.asset ?? (route ? `${route}/asset` : null);
}

function archiveItemMaterializeRoute(item) {
  const route = archiveItemRoute(item);
  return route ? `${route}/materialize` : null;
}

function archiveMaterializationCreateRoute() {
  return "/v1/archive/materializations";
}

function archiveMaterializationJobsRoute(item, limit = 5) {
  if (!item?.id) return null;
  const params = new URLSearchParams();
  params.set("archiveItemId", item.id);
  params.set("limit", String(limit));
  return `${archiveMaterializationCreateRoute()}?${params.toString()}`;
}

function archiveMaterializationJobRoute(job) {
  const id = typeof job === "string" ? job : job?.id;
  return id ? `${archiveMaterializationCreateRoute()}/${encodeURIComponent(id)}` : null;
}

function historyMaterializationCreateRoute() {
  return "/v1/account-mirrors/materializations";
}

function historyMaterializationJobRoute(job) {
  const id = typeof job === "string" ? job : job?.id;
  return id ? `${historyMaterializationCreateRoute()}/${encodeURIComponent(id)}` : null;
}

function archiveMaterializationStatusTone(status) {
  if (status === "succeeded") return "ok";
  if (status === "failed" || status === "cancelled") return "bad";
  if (status === "skipped") return "warn";
  return "warn";
}

function isActiveArchiveMaterializationJob(job) {
  return job?.status === "queued" || job?.status === "running";
}

function isActiveHistoryMaterializationJob(job) {
  return job?.status === "queued" || job?.status === "running";
}

function searchRowMaterializationStatus(row, job = null) {
  return job?.status ?? row?.metadata?.materializationJob?.status ?? row?.metadata?.materializationStatus ?? null;
}

function searchRowAssetFreshness(row) {
  const freshness = row?.metadata?.assetFreshness ?? row?.raw?.metadata?.assetFreshness ?? null;
  const materializedAt = freshness?.materializedAt;
  const jobId = freshness?.materializationJobId;
  if (freshness?.availability === "available" && materializedAt) {
    return jobId ? `fresh ${formatDateTime(materializedAt)} via ${compactText(jobId, 18)}` : `cached ${formatDateTime(materializedAt)}`;
  }
  if (freshness?.availability === "available") return "cached asset";
  if (freshness?.availability === "unavailable" && freshness?.evidenceUpdatedAt) return `missing ${formatDateTime(freshness.evidenceUpdatedAt)}`;
  return null;
}

function materializationFilterMatches(row, job, filter) {
  if (!filter || filter === "all") return true;
  const status = searchRowMaterializationStatus(row, job);
  if (!status) return false;
  if (filter === "active") return status === "queued" || status === "running";
  return status === filter;
}

function materializationRowTitle(job, queuing = false, row = null) {
  if (queuing) return "Queuing materialization";
  if (!isActiveArchiveMaterializationJob(job) && row?.fileAvailable === true) return "Refresh cached asset";
  if (job?.status === "succeeded") return "Materialization complete; refresh";
  if (job?.status === "failed") return "Materialization failed; retry";
  if (job?.status === "cancelled") return "Materialization cancelled; retry";
  if (job?.status === "skipped") return "Materialization skipped";
  if (job?.status) return `Materialization ${statusLabel(job.status)}`;
  return "Queue artifact materialization";
}

function materializationRowIcon(job, queuing = false, row = null) {
  if (queuing || job?.status === "queued" || job?.status === "running") return <Activity size={13} aria-hidden="true" />;
  if (!isActiveArchiveMaterializationJob(job) && row?.fileAvailable === true) return <RefreshCcw size={13} aria-hidden="true" />;
  if (job?.status === "succeeded") return <RefreshCcw size={13} aria-hidden="true" />;
  return <PackagePlus size={13} aria-hidden="true" />;
}

function canReconcileSearchRow(row) {
  return row?.kind === "conversation"
    && Boolean(row.itemId)
    && Boolean(row.provider)
    && row.provider !== "unknown"
    && Boolean(row.runtimeProfileId)
    && row.runtimeProfileId !== "unknown";
}

function reconciliationRowTitle(job, queuing = false) {
  if (queuing) return "Queuing conversation reconciliation";
  if (job?.status === "succeeded") return "Conversation reconciliation complete; refresh";
  if (job?.status === "failed") return "Conversation reconciliation failed; retry";
  if (job?.status === "cancelled") return "Conversation reconciliation cancelled; retry";
  if (job?.status === "skipped") return "Conversation reconciliation skipped";
  if (job?.status) return `Conversation reconciliation ${statusLabel(job.status)}`;
  return "Reconcile conversation";
}

function reconciliationRowIcon(job, queuing = false) {
  if (queuing || job?.status === "queued" || job?.status === "running") return <Activity size={13} aria-hidden="true" />;
  return <RefreshCcw size={13} aria-hidden="true" />;
}

function readStringField(value, fields) {
  if (!value || typeof value !== "object") return null;
  for (const field of fields) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function readObjectField(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[field];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
}

function readNumberField(value, fields) {
  if (!value || typeof value !== "object") return null;
  for (const field of fields) {
    const candidate = value[field];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return null;
}

function readArrayField(value, fields) {
  if (!value || typeof value !== "object") return null;
  for (const field of fields) {
    const candidate = value[field];
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

function normalizeChatRole(value) {
  const role = String(value ?? "").toLowerCase();
  if (["assistant", "ai", "model", "gpt"].includes(role)) return "assistant";
  if (["user", "human", "operator"].includes(role)) return "user";
  if (["system", "developer", "tool"].includes(role)) return role;
  return "assistant";
}

function stringifyMessagePart(part) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  return readStringField(part, ["text", "content", "markdown", "body"]) ?? JSON.stringify(part);
}

function readConversationTurnContent(value) {
  const direct = readStringField(value, ["text", "content", "message", "body", "markdown"]);
  if (direct) return direct;
  const content = readObjectField(value, "content");
  if (content) {
    const parts = content.parts;
    if (Array.isArray(parts)) return parts.map(stringifyMessagePart).join("\n").trim();
    return readStringField(content, ["text", "content", "markdown", "body"]);
  }
  const parts = value && typeof value === "object" ? value.parts : null;
  if (Array.isArray(parts)) return parts.map(stringifyMessagePart).join("\n").trim();
  return null;
}

function normalizeConversationTurn(value, index) {
  if (!value || typeof value !== "object") return null;
  const author = readObjectField(value, "author");
  const role = normalizeChatRole(readStringField(value, ["role", "authorRole", "speaker", "from"]) ?? readStringField(author, ["role", "name"]));
  const content = readConversationTurnContent(value);
  if (!content) return null;
  return {
    id: readStringField(value, ["id", "messageId"]) ?? `turn-${index}`,
    role,
    content,
    createdAt: readStringField(value, ["createdAt", "created", "timestamp", "time"]),
  };
}

function extractConversationTurns(item) {
  if (!item || typeof item !== "object") return [];
  for (const field of ["messages", "turns", "conversation", "transcript"]) {
    const value = item[field];
    if (Array.isArray(value)) return value.map(normalizeConversationTurn).filter(Boolean);
  }
  if (item.mapping && typeof item.mapping === "object") {
    return Object.values(item.mapping)
      .map((entry) => (entry && typeof entry === "object" ? entry.message : null))
      .filter(Boolean)
      .map(normalizeConversationTurn)
      .filter(Boolean);
  }
  return [];
}

function flattenConversationEntries(payload) {
  return (payload?.entries ?? []).flatMap((entry) =>
    (entry.manifests?.conversations ?? []).map((conversation) => ({
      ...conversation,
      provider: conversation.provider ?? entry.provider,
      tenantKey: entry.tenantKey ?? null,
      bindingKey: entry.bindingKey ?? null,
      runtimeProfileId: entry.runtimeProfileId,
      browserProfileId: entry.browserProfileId,
      boundIdentityKey: entry.boundIdentityKey,
      mirrorStatus: entry.status,
      mirrorCompleteness: entry.mirrorCompleteness?.state,
    })),
  );
}

function readCatalogItemId(item, index = 0) {
  return (
    readStringField(item, ["id", "conversationId", "providerConversationId", "itemId", "artifactId", "fileId", "mediaId"])
    ?? `item-${index}`
  );
}

function readCatalogItemTitle(item) {
  return (
    readStringField(item, ["title", "name", "fileName", "prompt", "summary", "id", "conversationId"])
    ?? "Untitled"
  );
}

function readCatalogItemTime(item) {
  const explicitTime = readStringField(item, ["updatedAt", "lastMessageAt", "createdAt", "createTime", "timestamp", "time"]);
  if (explicitTime) return explicitTime;
  const provider = readStringField(item, ["provider"]);
  const itemId = readCatalogItemId(item);
  const timestampPrefix = itemId.match(/^([0-9a-f]{8})-/iu)?.[1];
  if (provider === "chatgpt" && timestampPrefix) {
    const seconds = Number.parseInt(timestampPrefix, 16);
    if (Number.isFinite(seconds)) {
      const derived = new Date(seconds * 1000);
      const timestamp = derived.getTime();
      const earliest = Date.UTC(2022, 0, 1);
      const latest = Date.now() + 24 * 60 * 60 * 1000;
      if (timestamp >= earliest && timestamp <= latest) return derived.toISOString();
    }
  }
  return null;
}

function toSearchRow(entry, item, kind, index) {
  const itemId = readCatalogItemId(item, index);
  const provider = entry.provider ?? item.provider ?? "unknown";
  const runtimeProfileId = entry.runtimeProfileId ?? item.runtimeProfileId ?? "unknown";
  const rowId = `catalog:${kind}:${provider}:${runtimeProfileId}:${itemId}`;
  const sortTime = readCatalogItemTime(item);
  const fileCount =
    readNumberField(item, ["fileCount", "filesCount", "cachedFileCount", "attachmentCount", "attachmentsCount"])
    ?? readArrayField(item, ["files", "attachments"])?.length
    ?? 0;
  const artifactCount =
    readNumberField(item, ["artifactCount", "artifactsCount", "cachedArtifactCount"])
    ?? readArrayField(item, ["artifacts", "generatedArtifacts"])?.length
    ?? 0;
  return {
    id: rowId,
    source: "account-mirror",
    kind: kind === "conversations" ? "conversation" : kind.replace(/s$/u, ""),
    provider,
    tenantKey: entry.tenantKey ?? null,
    bindingKey: entry.bindingKey ?? null,
    runtimeProfileId,
    browserProfileId: entry.browserProfileId ?? null,
    boundIdentityKey: entry.boundIdentityKey ?? "unbound",
    accountLevel: entry.accountLevel ?? null,
    mirrorStatus: entry.status ?? "unknown",
    project: readStringField(item, ["projectName", "projectTitle", "projectId", "workspaceName"]) ?? "none",
    title: readCatalogItemTitle(item),
    summary: readStringField(item, ["summary", "description", "snippet"]) ?? null,
    status: readStringField(item, ["status", "state"]) ?? entry.status ?? "cached",
    sortTime,
    updatedAt: sortTime,
    itemId,
    messageCount: readNumberField(item, ["messageCount", "messagesCount", "turnCount"]),
    fileCount,
    artifactCount,
    url: readStringField(item, ["url", "providerUrl", "conversationUrl"]),
    catalogItemRoute: `/v1/account-mirrors/catalog/items/${encodeURIComponent(itemId)}?${new URLSearchParams({
      provider,
      runtimeProfile: runtimeProfileId,
      kind,
    }).toString()}`,
    raw: item,
  };
}

function flattenSearchCatalogRows(payload) {
  if (Array.isArray(payload?.rows)) {
    return payload.rows.map((row) => ({
      id: row.id,
      source: row.source ?? "search",
      kind: row.kind ?? row.sourceKind ?? "unknown",
      provider: row.provider ?? "unknown",
      tenantKey: row.tenantKey ?? null,
      bindingKey: row.bindingKey ?? null,
      runtimeProfileId: row.runtimeProfileId ?? "unknown",
      browserProfileId: row.browserProfileId ?? null,
      boundIdentityKey: row.tenant ?? "unbound",
      accountLevel: null,
      mirrorStatus: row.status ?? "unknown",
      project: row.projectId ?? "none",
      title: row.title ?? row.id,
      summary: row.summary ?? null,
      status: row.status ?? "cached",
      sortTime: row.sortTime ?? row.updatedAt ?? null,
      updatedAt: row.updatedAt ?? row.sortTime ?? null,
      itemId: row.itemId ?? row.id,
      messageCount: row.counts?.messages ?? null,
      fileCount: row.counts?.files ?? 0,
      artifactCount: row.counts?.artifacts ?? 0,
      url: row.links?.provider ?? row.links?.providerConversation ?? null,
      catalogItemRoute: row.links?.catalogItem ?? null,
      archiveItemRoute: row.links?.archiveItem ?? null,
      assetRoute: row.links?.asset ?? (row.links?.archiveItem && row.metadata?.fileAvailable ? `${row.links.archiveItem}/asset` : null),
      fileAvailable: typeof row.metadata?.fileAvailable === "boolean" ? row.metadata.fileAvailable : null,
      metadata: row.metadata ?? {},
      links: row.links ?? {},
      raw: row,
    }));
  }
  return (payload?.entries ?? []).flatMap((entry) => {
    const manifests = entry?.manifests ?? {};
    return ["conversations"].flatMap((kind) =>
      (manifests[kind] ?? []).map((item, index) => toSearchRow(entry, item, kind, index)),
    );
  });
}

function readSearchTablePreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEARCH_TABLE_STORAGE_KEY) ?? "{}");
    const knownColumnIds = new Set(SEARCH_TABLE_COLUMNS.map((column) => column.id));
    return {
      sort: {
        column: stored?.sort?.column ?? "sortTime",
        direction: stored?.sort?.direction === "asc" ? "asc" : "desc",
      },
      widths: stored?.widths && typeof stored.widths === "object" ? stored.widths : {},
      hidden: Array.isArray(stored?.hidden) ? stored.hidden.filter((id) => knownColumnIds.has(id) && !PINNED_SEARCH_COLUMN_IDS.has(id)) : DEFAULT_SEARCH_TABLE_PREFS.hidden,
      order: Array.isArray(stored?.order) ? stored.order.filter((id) => knownColumnIds.has(id) && !PINNED_SEARCH_COLUMN_IDS.has(id)) : DEFAULT_SEARCH_TABLE_PREFS.order,
    };
  } catch {
    return DEFAULT_SEARCH_TABLE_PREFS;
  }
}

function normalizeSearchTablePreferences(value) {
  const knownColumnIds = new Set(SEARCH_TABLE_COLUMNS.map((column) => column.id));
  return {
    sort: {
      column: knownColumnIds.has(value?.sort?.column) ? value.sort.column : "sortTime",
      direction: value?.sort?.direction === "asc" ? "asc" : "desc",
    },
    widths: value?.widths && typeof value.widths === "object" ? value.widths : {},
    hidden: Array.isArray(value?.hidden) ? value.hidden.filter((id) => knownColumnIds.has(id) && !PINNED_SEARCH_COLUMN_IDS.has(id)) : [],
    order: Array.isArray(value?.order) ? value.order.filter((id) => knownColumnIds.has(id) && !PINNED_SEARCH_COLUMN_IDS.has(id)) : [],
  };
}

function serializeSearchFilters(filters) {
  return {
    q: filters.q ?? "",
    kind: filters.kind ?? "all",
    assets: filters.assets ?? "all",
    materialization: filters.materialization ?? "all",
    providers: [...(filters.providers ?? new Set())],
    statuses: [...(filters.statuses ?? new Set())],
  };
}

function hydrateSearchFilters(filters) {
  const kinds = new Set(SEARCH_KIND_FACETS.map((facet) => facet.id));
  const assets = new Set(SEARCH_ASSET_FACETS.map((facet) => facet.id));
  const materializations = new Set(SEARCH_MATERIALIZATION_FACETS.map((facet) => facet.id));
  return {
    q: filters?.q ?? "",
    kind: kinds.has(filters?.kind) ? filters.kind : "all",
    assets: assets.has(filters?.assets) ? filters.assets : "all",
    materialization: materializations.has(filters?.materialization) ? filters.materialization : "all",
    providers: new Set(Array.isArray(filters?.providers) ? filters.providers : []),
    statuses: new Set(Array.isArray(filters?.statuses) ? filters.statuses : []),
  };
}

function readSearchViews() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEARCH_VIEWS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((view) => view && typeof view === "object" && typeof view.name === "string")
      .map((view) => ({
        id: String(view.id ?? `view-${view.name}`),
        name: view.name.trim() || "Saved view",
        createdAt: view.createdAt ?? new Date().toISOString(),
        updatedAt: view.updatedAt ?? view.createdAt ?? new Date().toISOString(),
        filters: serializeSearchFilters(hydrateSearchFilters(view.filters)),
        tablePrefs: normalizeSearchTablePreferences(view.tablePrefs),
      }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function orderedSearchColumns(tablePrefs) {
  const hidden = new Set(tablePrefs.hidden ?? []);
  const byId = new Map(SEARCH_TABLE_COLUMNS.map((column) => [column.id, column]));
  const pinnedColumns = SEARCH_TABLE_COLUMNS.filter((column) => column.pinned);
  const orderedNonPinnedIds = [
    ...(tablePrefs.order ?? []),
    ...SEARCH_TABLE_COLUMNS.filter((column) => !column.pinned).map((column) => column.id),
  ];
  const seen = new Set();
  const nonPinnedColumns = [];
  for (const id of orderedNonPinnedIds) {
    if (seen.has(id) || hidden.has(id)) continue;
    const column = byId.get(id);
    if (!column || column.pinned) continue;
    seen.add(id);
    nonPinnedColumns.push(column);
  }
  return [...pinnedColumns, ...nonPinnedColumns];
}

function compareSearchRows(left, right, sort) {
  const column = sort?.column ?? "sortTime";
  const direction = sort?.direction === "asc" ? 1 : -1;
  let comparison = 0;
  if (column === "sortTime" || column === "updatedAt") {
    const leftTime = Date.parse(left[column] ?? "");
    const rightTime = Date.parse(right[column] ?? "");
    const leftHasTime = Number.isFinite(leftTime);
    const rightHasTime = Number.isFinite(rightTime);
    if (leftHasTime !== rightHasTime) {
      return leftHasTime ? -1 : 1;
    }
    comparison = leftTime - rightTime;
  } else if (column === "files") {
    comparison = (left.fileCount + left.artifactCount) - (right.fileCount + right.artifactCount);
  } else {
    comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
  }
  return comparison * direction || String(left.title ?? "").localeCompare(String(right.title ?? ""));
}

function statusTone(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["ok", "healthy", "running", "complete", "completed", "enabled", "idle_waiting", "scheduled"].includes(normalized)) {
    return "good";
  }
  if (["waiting", "delayed", "deferred", "eligible", "draft", "planned", "queued", "completed_with_skips", "unconfigured"].includes(normalized)) {
    return "warn";
  }
  if (["blocked", "failed", "cancelled", "error", "attention_needed", "attention"].includes(normalized)) {
    return "bad";
  }
  return "neutral";
}

function statusLabel(value) {
  const normalized = String(value ?? "unknown").trim();
  if (!normalized) return "unknown";
  return normalized
    .replace(/^expected[-_]identity[-_]missing$/i, "identity missing")
    .replace(/^minimum[-_]interval$/i, "min interval")
    .replace(/^already[-_]running$/i, "already running")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function liveFollowAccountKey(account) {
  if (!account) return null;
  return `${account.provider ?? "unknown"}:${account.runtimeProfileId ?? "unknown"}`;
}

function liveFollowAccountStatusRoute(account) {
  if (!account?.provider || !account?.runtimeProfileId) return "/v1/account-mirrors/status";
  const params = new URLSearchParams({
    provider: account.provider,
    runtimeProfile: account.runtimeProfileId,
  });
  return `/v1/account-mirrors/status?${params.toString()}`;
}

function liveFollowAccountCatalogRoute(account) {
  if (!account?.provider || !account?.runtimeProfileId) return "/v1/account-mirrors/catalog";
  const params = new URLSearchParams({
    provider: account.provider,
    runtimeProfile: account.runtimeProfileId,
  });
  return `/v1/account-mirrors/catalog?${params.toString()}`;
}

function liveFollowAccountCompletionRoute(account) {
  if (!account?.activeCompletionId) return null;
  return `/v1/account-mirrors/completions/${encodeURIComponent(account.activeCompletionId)}`;
}

function accountMirrorReconciliationsRoute(limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  return `/v1/account-mirrors/reconciliations?${params.toString()}`;
}

function accountMirrorReconciliationRoute(campaign) {
  const id = typeof campaign === "string" ? campaign : campaign?.id;
  return id ? `/v1/account-mirrors/reconciliations/${encodeURIComponent(id)}` : null;
}

function findMirrorStatusEntry(status, account) {
  const key = liveFollowAccountKey(account);
  if (!key) return null;
  return (status?.accountMirrorStatus?.entries ?? []).find((entry) => liveFollowAccountKey(entry) === key) ?? null;
}

function routeLabel(value) {
  const route = String(value ?? "").trim();
  if (!route) return "unknown";
  const withoutMethod = route.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  try {
    const url = new URL(withoutMethod);
    return url.pathname || url.hostname;
  } catch {
    const pathStart = withoutMethod.indexOf("/");
    const candidate = pathStart >= 0 ? withoutMethod.slice(pathStart) : withoutMethod;
    return candidate.split("[")[0].split("?")[0].split(" ")[0] || candidate;
  }
}

function linkKeyLabel(value) {
  return String(value ?? "Link")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ""));
}

function isNavigableRoute(value) {
  const route = String(value ?? "");
  return isUrl(route) || route.startsWith("/");
}

function RouteChip({ value, label }) {
  const [copied, setCopied] = useState(false);
  const fullValue = String(value ?? "unknown");
  const display = label ?? routeLabel(fullValue);
  const external = isUrl(fullValue);

  async function copyRoute() {
    try {
      await navigator.clipboard.writeText(fullValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="route-chip" title={fullValue}>
      <code>{display}</code>
      <button type="button" aria-label={`Copy ${display}`} title="Copy full route" onClick={copyRoute}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
      {isNavigableRoute(fullValue) ? (
        <a href={fullValue} aria-label={`Open ${display}`} title="Open route" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}

function DetailValue({ detail }) {
  if (detail && typeof detail === "object" && detail.kind === "route") {
    return <RouteChip value={detail.value} label={detail.label} />;
  }
  return detail;
}

function providerTone(provider) {
  const normalized = String(provider ?? "unknown").toLowerCase();
  if (normalized.includes("chatgpt") || normalized.includes("openai")) return "chatgpt";
  if (normalized.includes("gemini") || normalized.includes("google")) return "gemini";
  if (normalized.includes("grok") || normalized.includes("xai")) return "grok";
  return "unknown";
}

const PROVIDER_MARKS = {
  chatgpt: "GPT",
  gemini: "Gem",
  grok: "xAI",
  unknown: "--",
};

function ProviderIcon({ provider, embedded = false, label = true }) {
  const tone = providerTone(provider);
  const display = String(provider ?? "unknown");
  const mark = PROVIDER_MARKS[tone] ?? PROVIDER_MARKS.unknown;
  return (
    <span className={`provider-badge provider-${tone}${embedded ? " embedded" : ""}`} title={display}>
      <span className="provider-mark" aria-hidden="true">{mark}</span>
      {label ? <span>{display}</span> : null}
    </span>
  );
}

function useApiStatus() {
  const [state, setState] = useState({
    status: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let alive = true;
    let timer = null;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await fetch("/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        if (!alive) return;
        setState({
          status,
          loading: false,
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!alive || error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Unable to load status",
        }));
      }
    }

    load();
    timer = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return state;
}

function useAccountMirrorReconciliations() {
  const [state, setState] = useState({
    payload: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch(accountMirrorReconciliationsRoute(10), { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setState({
        payload,
        loading: false,
        error: null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to load reconciliation campaigns",
      }));
    }
  }

  useEffect(() => {
    let alive = true;
    let timer = null;
    const guardedLoad = async () => {
      if (!alive) return;
      await load();
    };
    guardedLoad();
    timer = window.setInterval(guardedLoad, SEARCH_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return { ...state, refresh: load };
}

function useRunRecoveryStatus() {
  const [state, setState] = useState({
    status: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let alive = true;
    let timer = null;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await fetch("/status?recovery=true&sourceKind=all", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        if (!alive) return;
        setState({
          status,
          loading: false,
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!alive || error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Unable to load run recovery status",
        }));
      }
    }

    load();
    timer = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return state;
}

function useApiKeyList() {
  const [state, setState] = useState({
    status: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch("/v1/config/api-keys", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setState({
        status: payload,
        loading: false,
        error: null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to load API keys",
      }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { ...state, refresh: load };
}

function SectionList({ title, items }) {
  return (
    <section className="section-list" aria-label={title}>
      <h2>{title}</h2>
      <div className="list-stack">
        {items.map((item) => (
          <article className="list-row" key={item.title}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.route ? <RouteChip value={item.route} label={item.meta} /> : item.meta}</small>
            </span>
            <span className={`status-pill status-${item.status}`}>{item.statusLabel ?? item.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function parseIdList(value) {
  return String(value ?? "").split(/[,\s]+/u).map((item) => item.trim()).filter(Boolean);
}

function ApiKeysSection() {
  const apiKeys = useApiKeyList();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    agentId: "",
    teamId: "",
    keyId: "",
    services: "",
    runtimeProfiles: "",
    clientEnvPath: "",
    overwrite: false,
  });
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [result, setResult] = useState(null);
  const keys = apiKeys.status?.apiKeys ?? [];
  const restartRequired = Boolean(result?.payload?.restartRequired);

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function issueKey(event) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const body = {};
      if (form.agentId.trim()) body.agentId = form.agentId.trim();
      if (form.teamId.trim()) body.teamId = form.teamId.trim();
      if (form.keyId.trim()) body.keyId = form.keyId.trim();
      if (form.clientEnvPath.trim()) body.clientEnvPath = form.clientEnvPath.trim();
      body.services = parseIdList(form.services);
      body.runtimeProfiles = parseIdList(form.runtimeProfiles);
      body.overwrite = form.overwrite;
      const response = await fetch("/v1/config/api-keys/issue", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setResult({ tone: "ok", payload });
      await apiKeys.refresh();
    } catch (error) {
      setResult({ tone: "bad", message: error.message || "API key issue failed" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(keyId) {
    if (!window.confirm(`Delete API key ${keyId} from ~/.auracall/api.env? Service restart is still required.`)) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/v1/config/api-keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setResult({ tone: payload.deleted ? "ok" : "warn", payload });
      await apiKeys.refresh();
    } catch (error) {
      setResult({ tone: "bad", message: error.message || "API key delete failed" });
    } finally {
      setBusy(false);
    }
  }

  async function restartApiService() {
    if (!window.confirm("Restart auracall-api.service now? The dashboard may disconnect briefly while the service reloads.")) return;
    setRestarting(true);
    setResult(null);
    try {
      const response = await fetch("/status", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceControl: { action: "restart-api-service" } }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setResult({ tone: "ok", payload: payload.controlResult ?? payload });
      window.setTimeout(() => {
        apiKeys.refresh();
      }, 3000);
    } catch (error) {
      setResult({ tone: "bad", message: error.message || "API service restart failed" });
    } finally {
      window.setTimeout(() => setRestarting(false), 3000);
    }
  }

  return (
    <section className="health-section" aria-label="API key management">
      <div className="section-heading">
        <h2>API Keys</h2>
        <span>{apiKeys.loading ? "Loading" : `${formatNumber(keys.length)} configured / ${apiKeys.status?.envPath ?? "~/.auracall/api.env"}`}</span>
      </div>
      {apiKeys.error ? <div className="health-error">Unable to load API keys: {apiKeys.error}</div> : null}
      <div className="api-key-actions">
        <button className="icon-label-button" type="button" disabled={apiKeys.loading || busy} onClick={apiKeys.refresh} title="Refresh API keys">
          <RefreshCcw size={14} aria-hidden="true" />
          <span>Refresh</span>
        </button>
        <button className="icon-label-button" type="button" onClick={() => setExpanded((current) => !current)} title={expanded ? "Collapse API key controls" : "Expand API key controls"}>
          <ChevronDown className={expanded ? "rotated-icon" : ""} size={14} aria-hidden="true" />
          <span>{expanded ? "Hide" : "Manage"}</span>
        </button>
        <button className="icon-label-button" type="button" disabled={busy || restarting} onClick={restartApiService} title="Restart API service">
          <RefreshCcw size={14} aria-hidden="true" />
          <span>{restarting ? "Restarting" : "Restart API"}</span>
        </button>
        <small>{apiKeys.updatedAt ? `Updated ${formatDateTime(apiKeys.updatedAt)}` : "/v1/config/api-keys"}</small>
      </div>
      {expanded ? (
        <>
          <div className="health-table-wrap">
            <table className="health-table compact-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Secret</th>
                  <th>Agents</th>
                  <th>Teams</th>
                  <th>Services</th>
                  <th>Runtime</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.id}</td>
                    <td>{key.hasSecret ? "stored" : "missing"}</td>
                    <td>{(key.agents ?? []).join(", ") || "all"}</td>
                    <td>{(key.teams ?? []).join(", ") || "all"}</td>
                    <td>{(key.services ?? []).join(", ") || "all"}</td>
                    <td>{(key.runtimeProfiles ?? []).join(", ") || "all"}</td>
                    <td>
                      <button className="icon-label-button danger" type="button" disabled={busy} onClick={() => deleteKey(key.id)} title={`Delete ${key.id}`}>
                        <Trash2 size={14} aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!keys.length ? (
                  <tr>
                    <td colSpan="7">No API keys found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <form className="api-key-form" onSubmit={issueKey}>
            <div className="section-heading">
              <h3>Issue Scoped Key</h3>
              <span>Restart required after issue or delete</span>
            </div>
            <div className="api-key-form-grid">
              <label>
                <span>Agent</span>
                <input value={form.agentId} placeholder="agent id" onChange={(event) => updateForm("agentId", event.target.value)} />
              </label>
              <label>
                <span>Team</span>
                <input value={form.teamId} placeholder="team id" onChange={(event) => updateForm("teamId", event.target.value)} />
              </label>
              <label>
                <span>Key ID</span>
                <input value={form.keyId} placeholder="client id" onChange={(event) => updateForm("keyId", event.target.value)} />
              </label>
              <label>
                <span>Services</span>
                <input value={form.services} placeholder="chatgpt, gemini" onChange={(event) => updateForm("services", event.target.value)} />
              </label>
              <label>
                <span>Runtime</span>
                <input value={form.runtimeProfiles} placeholder="default" onChange={(event) => updateForm("runtimeProfiles", event.target.value)} />
              </label>
              <label>
                <span>Client Env</span>
                <input value={form.clientEnvPath} placeholder="optional handoff path" onChange={(event) => updateForm("clientEnvPath", event.target.value)} />
              </label>
            </div>
            <div className="api-key-form-footer">
              <label className="checkbox-row">
                <input type="checkbox" checked={form.overwrite} onChange={(event) => updateForm("overwrite", event.target.checked)} />
                <span>Overwrite existing key id</span>
              </label>
              <button className="primary-action" type="submit" disabled={busy || (!form.agentId.trim() && !form.teamId.trim())} title="Issue API key">
                <Plus size={16} aria-hidden="true" />
                <span>{busy ? "Working" : "Issue"}</span>
              </button>
            </div>
          </form>
        </>
      ) : null}
      {result && expanded ? (
        <div className={`api-key-result api-key-result-${result.tone}`}>
          <strong>{result.tone === "ok" ? "Operation complete" : result.tone === "warn" ? "No matching key removed" : "Operation failed"}</strong>
          {restartRequired ? <p>Restart the API service before external clients rely on this key change.</p> : null}
          {result.message ? <p>{result.message}</p> : null}
          {result.payload ? <pre>{JSON.stringify(result.payload, null, 2)}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}

function ReconciliationCampaignsSection() {
  const campaignsState = useAccountMirrorReconciliations();
  const campaigns = campaignsState.payload?.data ?? [];
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null;
  const selectedTargets = selectedCampaign?.targets ?? [];
  const selectedMaterialization = selectedCampaign?.metrics?.materialization ?? null;

  async function createCampaign(dryRun) {
    setBusyAction(dryRun ? "dry-run" : "execute");
    setActionResult(null);
    try {
      const response = await fetch("/v1/account-mirrors/reconciliations", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun,
          materializationPolicy: "full_missing_assets",
          materializationAssetKinds: ["all"],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setSelectedCampaignId(payload.id);
      setActionResult({ tone: "ok", message: `${dryRun ? "Planned" : "Started"} ${payload.id}` });
      await campaignsState.refresh();
    } catch (error) {
      setActionResult({ tone: "bad", message: error.message || "Campaign request failed" });
    } finally {
      setBusyAction(null);
    }
  }

  async function controlCampaign(campaign, action) {
    const route = accountMirrorReconciliationRoute(campaign);
    if (!route) return;
    setBusyAction(`${action}:${campaign.id}`);
    setActionResult(null);
    try {
      const response = await fetch(route, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setActionResult({ tone: "ok", message: `${statusLabel(action)} ${payload.id}` });
      await campaignsState.refresh();
    } catch (error) {
      setActionResult({ tone: "bad", message: error.message || "Campaign control failed" });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="health-section" aria-label="Reconciliation campaigns">
      <div className="section-heading">
        <h2>Reconciliation Campaigns</h2>
        <span>{campaignsState.loading ? "Loading" : `${formatNumber(campaigns.length)} recent / ${campaignsState.updatedAt ? formatDateTime(campaignsState.updatedAt) : "not loaded"}`}</span>
      </div>
      <div className="api-key-actions">
        <button className="icon-label-button" type="button" disabled={campaignsState.loading || Boolean(busyAction)} onClick={campaignsState.refresh} title="Refresh campaigns">
          <RefreshCcw size={14} aria-hidden="true" />
          <span>Refresh</span>
        </button>
        <button className="icon-label-button" type="button" disabled={Boolean(busyAction)} onClick={() => createCampaign(true)} title="Plan reconciliation dry run">
          <ListFilter size={14} aria-hidden="true" />
          <span>Dry Run</span>
        </button>
        <button className="primary-action" type="button" disabled={Boolean(busyAction)} onClick={() => createCampaign(false)} title="Start reconciliation campaign">
          <Activity size={14} aria-hidden="true" />
          <span>Start</span>
        </button>
        <small>{campaignsState.error ? `Error: ${campaignsState.error}` : "/v1/account-mirrors/reconciliations"}</small>
      </div>
      {actionResult ? (
        <div className={`campaign-result campaign-result-${actionResult.tone}`}>
          <span className={`status-pill status-${statusTone(actionResult.tone)}`}>{statusLabel(actionResult.tone)}</span>
          <strong>{actionResult.message}</strong>
        </div>
      ) : null}
      <div className="health-table-wrap">
        <table className="health-table compact-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Mode</th>
              <th>Targets</th>
              <th>Created</th>
              <th>Route</th>
              <th>Control</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const route = accountMirrorReconciliationRoute(campaign);
              const selected = campaign.id === selectedCampaign?.id;
              return (
                <tr
                  key={campaign.id}
                  className={selected ? "selectable-row is-selected" : "selectable-row"}
                  tabIndex="0"
                  aria-selected={selected}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCampaignId(campaign.id);
                    }
                  }}
                >
                  <td><span className={`status-pill status-${statusTone(campaign.status)}`}>{statusLabel(campaign.status)}</span></td>
                  <td>{campaign.dryRun ? "dry run" : "execute"}</td>
                  <td>{formatNumber(campaign.metrics?.selectedTargets)} selected / {formatNumber(campaign.metrics?.totalTargets)} total</td>
                  <td>{formatDateTime(campaign.createdAt)}</td>
                  <td>{route ? <RouteChip value={route} label={compactText(campaign.id, 22)} /> : "none"}</td>
                  <td>
                    <div className="campaign-controls">
                      <button className="icon-label-button" type="button" disabled={Boolean(busyAction) || campaign.status === "cancelled" || campaign.status === "completed"} onClick={(event) => {
                        event.stopPropagation();
                        controlCampaign(campaign, "pause");
                      }} title="Pause campaign" aria-label="Pause campaign">
                        <PanelRightClose size={13} aria-hidden="true" />
                      </button>
                      <button className="icon-label-button" type="button" disabled={Boolean(busyAction) || campaign.status !== "paused"} onClick={(event) => {
                        event.stopPropagation();
                        controlCampaign(campaign, "resume");
                      }} title="Resume campaign" aria-label="Resume campaign">
                        <PanelRightOpen size={13} aria-hidden="true" />
                      </button>
                      <button className="icon-label-button" type="button" disabled={Boolean(busyAction) || campaign.status === "paused" || ["cancelled", "completed", "failed"].includes(campaign.status)} onClick={(event) => {
                        event.stopPropagation();
                        controlCampaign(campaign, "run_next_pass");
                      }} title="Run next pass" aria-label="Run next pass">
                        <ArrowRight size={13} aria-hidden="true" />
                      </button>
                      <button className="icon-label-button danger" type="button" disabled={Boolean(busyAction) || ["cancelled", "completed", "completed_with_skips", "failed"].includes(campaign.status)} onClick={(event) => {
                        event.stopPropagation();
                        controlCampaign(campaign, "cancel");
                      }} title="Cancel campaign" aria-label="Cancel campaign">
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!campaigns.length ? (
              <tr>
                <td colSpan="6">No campaigns found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {selectedCampaign ? (
        <div className="campaign-detail">
          <div className="section-heading">
            <h3>{compactText(selectedCampaign.id, 44)}</h3>
            <span>{formatNumber(selectedTargets.length)} targets / {selectedCampaign.policy?.materializationPolicy ?? "policy unknown"} / {formatNumber(selectedMaterialization?.materialized)} assets / {formatNumber(selectedMaterialization?.checksummedAssets)} checksums</span>
          </div>
          <div className="health-table-wrap">
            <table className="health-table compact-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Tenant</th>
                  <th>Binding</th>
                  <th>Runtime</th>
                  <th>Eligibility</th>
                  <th>Execution</th>
                  <th>Child</th>
                  <th>Assets</th>
                  <th>Next</th>
                </tr>
              </thead>
              <tbody>
                {selectedTargets.map((target) => {
                  const materializationMetrics = target.execution?.materializationMetrics ?? null;
                  const materializedAssets = target.execution?.materializedAssets ?? [];
                  const materializedCount = materializationMetrics?.materialized ?? materializedAssets.length;
                  const checksumCount = materializationMetrics?.checksummedAssets ?? materializedAssets.filter((asset) => asset?.checksumSha256).length;
                  return (
                    <tr key={target.key}>
                      <td><ProviderIcon provider={target.provider} embedded /></td>
                      <td title={target.tenantKey ?? "unbound"}>{compactIdentity(target.tenantKey)}</td>
                      <td title={target.bindingKey ?? "not reported"}>{compactText(target.bindingKey ?? "not reported", 34)}</td>
                      <td>{target.runtimeProfileId}</td>
                      <td>
                        <span className={`status-pill status-${statusTone(target.state)}`}>{statusLabel(target.state)}</span>
                        <small>{compactText(target.reason, 90)}</small>
                      </td>
                      <td>
                        <span className={`status-pill status-${statusTone(target.execution?.status)}`}>{statusLabel(target.execution?.status)}</span>
                        <small>{compactText(target.execution?.reason, 90)}</small>
                      </td>
                      <td>
                        {target.childOperations?.completionId ? (
                          <RouteChip value={`/v1/account-mirrors/completions/${encodeURIComponent(target.childOperations.completionId)}`} label={compactText(target.childOperations.completionId, 18)} />
                        ) : "none"}
                      </td>
                      <td>
                        {target.childOperations?.materializationJobId ? compactText(target.childOperations.materializationJobId, 22) : target.execution?.materializationJobStatus ?? "none"}
                        {materializationMetrics || materializedAssets.length ? (
                          <small>{formatNumber(materializedCount)} materialized / {formatNumber(checksumCount)} checksums</small>
                        ) : null}
                      </td>
                      <td>{formatDateTime(target.execution?.nextEligibleAt ?? target.nextEligibleAt)}</td>
                    </tr>
                  );
                })}
                {!selectedTargets.length ? (
                  <tr>
                    <td colSpan="9">No target rows recorded.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HealthViewport({ apiStatus, selectedLiveFollowAccount, onSelectedLiveFollowAccountChange }) {
  const { status, loading, error, updatedAt } = apiStatus;
  const [liveFollowFilter, setLiveFollowFilter] = useState("all");
  const liveFollow = status?.liveFollow ?? {};
  const targets = liveFollow.targets ?? {};
  const accounts = targets.accounts ?? [];
  const selectedLiveFollowKey = liveFollowAccountKey(selectedLiveFollowAccount);
  const enabledAccountCount = targets.enabled ?? accounts.filter((account) => account.desiredEnabled || account.desiredState === "enabled").length;
  const unconfiguredAccountCount = targets.unconfigured ?? accounts.filter((account) => account.desiredState === "unconfigured").length;
  const attentionAccountCount = targets.attentionNeeded ?? accounts.filter((account) => account.attentionNeeded).length;
  const runningAccountCount = accounts.filter((account) => account.actualStatus === "running").length;
  const filteredAccounts = accounts.filter((account) => {
    if (liveFollowFilter === "enabled") return account.desiredEnabled || account.desiredState === "enabled";
    if (liveFollowFilter === "unconfigured") return account.desiredState === "unconfigured";
    if (liveFollowFilter === "attention") return Boolean(account.attentionNeeded) && account.desiredState !== "unconfigured";
    if (liveFollowFilter === "running") return account.actualStatus === "running";
    return true;
  });
  const liveFollowFilters = [
    { id: "all", label: "All", count: accounts.length },
    { id: "enabled", label: "Enabled", count: enabledAccountCount },
    { id: "unconfigured", label: "Unconfigured", count: unconfiguredAccountCount },
    { id: "attention", label: "Attention", count: attentionAccountCount },
    { id: "running", label: "Running", count: runningAccountCount },
  ];
  const routes = status?.routes ?? {};
  const discovery = status?.serviceDiscovery ?? {};
  const process = status?.process ?? {};
  const binding = status?.binding ?? {};
  const readout = statusReadout({
    payload: status,
    loading,
    error,
    updatedAt,
    loadedLabel: status?.ok ? "API reachable" : "API status loaded",
    errorLabel: "API unavailable",
    unavailableLabel: "API unavailable",
  });

  useEffect(() => {
    if (!selectedLiveFollowKey) return;
    if (!accounts.length) return;
    const replacement = accounts.find((account) => liveFollowAccountKey(account) === selectedLiveFollowKey);
    if (!replacement) {
      onSelectedLiveFollowAccountChange(null);
      return;
    }
    if (replacement !== selectedLiveFollowAccount) {
      onSelectedLiveFollowAccountChange(replacement);
    }
  }, [accounts, onSelectedLiveFollowAccountChange, selectedLiveFollowAccount, selectedLiveFollowKey]);

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Live status</span>
          <h1>Health</h1>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(readout.tone)}`} />
          <strong>{readout.label}</strong>
          <small>{readout.detail}</small>
        </div>
      </div>

      {error ? <div className="health-error">Unable to load /status: {error}</div> : null}

      <section className="ops-strip" aria-label="Health summary">
        <article>
          <span>API</span>
          <strong>{status?.version ?? "unknown"}</strong>
          <small>{binding.host ?? "127.0.0.1"}:{binding.port ?? "unknown"} / {status?.auth?.keyCount ?? 0} keys</small>
        </article>
        <article>
          <span>Live follow</span>
          <strong>{liveFollow.severity ?? "unknown"}</strong>
          <small>{formatNumber(liveFollow.activeCompletions)} active / {formatNumber(attentionAccountCount)} attention</small>
        </article>
        <article>
          <span>Targets</span>
          <strong>{formatNumber(enabledAccountCount)} enabled</strong>
          <small>{formatNumber(unconfiguredAccountCount)} unconfigured / {formatNumber(runningAccountCount)} running</small>
        </article>
        <article>
          <span>Scheduler</span>
          <strong>{liveFollow.schedulerPosture ?? "unknown"}</strong>
          <small>{liveFollow.schedulerState ?? "unknown"}</small>
        </article>
        <article>
          <span>Runtime</span>
          <strong>{process.service ?? "auracall-api.service"}</strong>
          <small>PID {process.pid ?? "unknown"} / {formatUptime(process.uptimeSeconds)}</small>
        </article>
        <article className="ops-strip-routes">
          <span>{discovery.local?.hostname ?? "auracall.localhost"}</span>
          <div className="route-list">
            <a href={routes.operatorBrowserDashboard ?? "/dashboard"}>Dashboard</a>
            <a href="/desktops">Desktops</a>
            <a href={routes.operatorDebugDashboard ?? "/ops/browser"}>Debug</a>
            <a href={routes.accountMirrorDashboard ?? "/account-mirror"}>Mirror</a>
          </div>
        </article>
      </section>

      <ApiKeysSection />
      <ReconciliationCampaignsSection />

      <section className="health-section" aria-label="Live follow accounts">
        <div className="section-heading">
          <h2>Live Follow Accounts</h2>
          <span>
            showing {formatNumber(filteredAccounts.length)} of {formatNumber(accounts.length)} / {formatNumber(enabledAccountCount)} enabled /{" "}
            {formatNumber(attentionAccountCount)} attention
          </span>
        </div>
        <div className="table-filter-bar" role="tablist" aria-label="Live follow account filters">
          {liveFollowFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={liveFollowFilter === filter.id}
              className={`filter-chip ${liveFollowFilter === filter.id ? "active" : ""}`}
              onClick={() => setLiveFollowFilter(filter.id)}
            >
              <span>{filter.label}</span>
              <b>{formatNumber(filter.count)}</b>
            </button>
          ))}
        </div>
        <div className="health-table-wrap">
          <table className="health-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Tenant</th>
                <th>Binding</th>
                <th>Profile</th>
                <th>Desired</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Mirror</th>
                <th>Content</th>
                <th>Next attempt</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const accountKey = liveFollowAccountKey(account);
                const selected = selectedLiveFollowKey === accountKey;
                const counts = account.metadataCounts ?? {};
                const assetInventory = account.assetInventory ?? {};
                const assetState = assetInventory.state ?? "unknown";
                const scanned = assetInventory.detailScannedThisPass ?? {};
                const observedCounts = account.metadataCountEvidence?.observedThisPass ?? {};
                const materializationOutcome = account.materializationOutcome ?? null;
                const reasonLabel =
                  account.attentionNeeded && account.desiredState !== "unconfigured" ? "attention" : account.statusReason ?? "clear";
                return (
                  <tr
                    key={accountKey}
                    className={selected ? "selectable-row is-selected" : "selectable-row"}
                    tabIndex="0"
                    aria-selected={selected}
                    title="Inspect live-follow account"
                    onClick={() => onSelectedLiveFollowAccountChange(account)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectedLiveFollowAccountChange(account);
                      }
                    }}
                  >
                    <td>
                      <button
                        className="row-inspect-button"
                        type="button"
                        aria-label={`Inspect ${account.provider ?? "provider"} ${account.runtimeProfileId ?? "runtime"}`}
                        title="Inspect account"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectedLiveFollowAccountChange(account);
                        }}
                      >
                        <ProviderIcon provider={account.provider} embedded />
                      </button>
                    </td>
                    <td title={account.tenantKey ?? "unbound"}>{compactIdentity(account.tenantKey)}</td>
                    <td title={account.bindingKey ?? "not reported"}>{compactText(account.bindingKey ?? "not reported", 34)}</td>
                    <td>{account.runtimeProfileId}</td>
                    <td>
                      <span className={`status-pill status-${statusTone(account.desiredState)}`}>{statusLabel(account.desiredState)}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${statusTone(account.actualStatus)}`}>{statusLabel(account.actualStatus)}</span>
                    </td>
                    <td>
                      <div className="status-reason">
                        <span className={`status-pill status-${statusTone(reasonLabel)}`}>
                          {statusLabel(reasonLabel)}
                        </span>
                        <small>{account.latestCompletionError ?? account.providerGuard?.summary ?? account.liveFollow?.reason ?? ""}</small>
                      </div>
                    </td>
                    <td>{account.mirrorCompleteness ?? "unknown"}</td>
                    <td>
                      <div className="status-reason">
                        <span>
                          {formatNumber(counts.conversations)} chats
                          {account.metadataCountEvidence ? ` (${formatNumber(observedCounts.conversations)} observed)` : ""}
                        </span>
                        {assetState === "deferred" || assetState === "unknown" ? (
                          <small>{statusLabel(assetState)} assets / detail {formatNumber(scanned.conversations)} chats</small>
                        ) : (
                          <small>{formatNumber((counts.artifacts ?? 0) + (counts.files ?? 0) + (counts.media ?? 0))} assets / {statusLabel(assetState)}</small>
                        )}
                        {materializationOutcome ? (
                          <small>{formatNumber(materializationOutcome.materialized)} materialized / {formatNumber(materializationOutcome.checksumCount)} checksums</small>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatDateTime(account.nextAttemptAt)}</td>
                  </tr>
                );
              })}
              {!accounts.length ? (
                <tr>
                  <td colSpan="10">No live-follow accounts reported yet.</td>
                </tr>
              ) : null}
              {accounts.length > 0 && filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan="10">No accounts match the selected filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function IdList({ title, ids }) {
  const visible = Array.isArray(ids) ? ids.slice(0, 12) : [];
  return (
    <article className="id-list">
      <div className="id-list-heading">
        <strong>{title}</strong>
        <span>{formatNumber(Array.isArray(ids) ? ids.length : 0)}</span>
      </div>
      {visible.length ? (
        <ul>
          {visible.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : (
        <p>No runs reported.</p>
      )}
    </article>
  );
}

function RunsViewport({ runStatus }) {
  const { status, loading, error, updatedAt } = runStatus;
  const recovery = status?.recoverySummary ?? {};
  const localClaim = status?.localClaimSummary ?? {};
  const topology = status?.runnerTopology ?? {};
  const topologyMetrics = topology.metrics ?? {};
  const localClaimMetrics = localClaim.metrics ?? {};
  const readout = statusReadout({
    payload: status,
    loading,
    error,
    updatedAt,
    loadedLabel: "Run status loaded",
    errorLabel: "Run status unavailable",
    unavailableLabel: "Run status unavailable",
  });

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Runtime posture</span>
          <h1>Runs</h1>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(readout.tone)}`} />
          <strong>{readout.label}</strong>
          <small>{readout.detail}</small>
        </div>
      </div>

      {error ? <div className="health-error">Unable to load run status: {error}</div> : null}

      <div className="health-grid runs-grid">
        <article className="health-card">
          <span className="card-kicker">Recovery</span>
          <strong>{formatNumber(recovery.totalRuns)} total</strong>
          <p>All runtime records currently visible to the recovery scanner.</p>
          <div className="metric-row">
            <span>Reclaimable</span>
            <b>{formatNumber(recovery.reclaimableRunIds?.length)}</b>
          </div>
          <div className="metric-row">
            <span>Stranded</span>
            <b>{formatNumber(recovery.strandedRunIds?.length)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Local Claim</span>
          <strong>{formatNumber(localClaimMetrics.selectedCount)} selected</strong>
          <p>{localClaim.runnerId ?? "No local runner id reported"}</p>
          <div className="metric-row">
            <span>Blocked</span>
            <b>{formatNumber(localClaimMetrics.blockedCount)}</b>
          </div>
          <div className="metric-row">
            <span>Not ready</span>
            <b>{formatNumber(localClaimMetrics.notReadyCount)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Runner Topology</span>
          <strong>{formatNumber(topologyMetrics.activeRunnerCount)} active</strong>
          <p>{topology.localExecutionOwnerRunnerId ?? "No execution owner reported"}</p>
          <div className="metric-row">
            <span>Fresh</span>
            <b>{formatNumber(topologyMetrics.freshRunnerCount)}</b>
          </div>
          <div className="metric-row">
            <span>Stale</span>
            <b>{formatNumber(topologyMetrics.staleRunnerCount)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Operator APIs</span>
          <strong>{status?.routes?.runtimeRunsRecent ? "available" : "unknown"}</strong>
          <p>Deep run listing and inspection are available to the dashboard; external clients still use API keys.</p>
          <div className="metric-row">
            <span>Recent</span>
            <b>{status?.routes?.runtimeRunsRecent ?? "unknown"}</b>
          </div>
          <div className="metric-row">
            <span>Inspect</span>
            <b>{status?.routes?.runtimeRunInspection ?? "unknown"}</b>
          </div>
        </article>
      </div>

      <section className="run-lists" aria-label="Runtime run id summaries">
        <IdList title="Reclaimable" ids={recovery.reclaimableRunIds} />
        <IdList title="Active Leases" ids={recovery.activeLeaseRunIds} />
        <IdList title="Stranded" ids={recovery.strandedRunIds} />
        <IdList title="Cancelled" ids={recovery.cancelledRunIds} />
      </section>
    </main>
  );
}

function selectedArchiveSummary(item) {
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    file: {
      name: item.fileName,
      mimeType: item.mimeType,
      available: item.fileAvailable,
      checksumSha256: item.checksumSha256 ? compactText(item.checksumSha256, 28) : null,
    },
    provider: {
      name: item.provider,
      runtimeProfile: item.runtimeProfile,
      browserProfile: item.browserProfile,
      conversationId: item.providerConversationId,
    },
    ownership: {
      projectId: item.projectId,
      boundIdentityKey: item.boundIdentityKey,
      agentId: item.agentId,
      teamId: item.teamId,
    },
    links: Object.keys(item.links ?? {}),
    metadataKeys: Object.keys(item.metadata ?? {}),
    updatedAt: item.updatedAt,
  };
}

function archiveItemAssetLookupRoute(item) {
  if (!item) return null;
  const params = new URLSearchParams();
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const providerArtifactId = metadata.providerArtifactId ?? metadata.remoteUrl ?? item.uri;
  if (item.checksumSha256) params.set("checksumSha256", item.checksumSha256);
  if (item.cacheKey) params.set("cacheKey", item.cacheKey);
  if (typeof providerArtifactId === "string" && providerArtifactId.trim()) params.set("providerArtifactId", providerArtifactId.trim());
  if (item.artifactId) params.set("artifactId", item.artifactId);
  if (!Array.from(params.keys()).length) return null;
  params.set("limit", "10");
  return `/v1/archive/assets/lookup?${params.toString()}`;
}

function assetMissingReason(item) {
  if (!item) return "No selected archive item.";
  if (item.fileAvailable === false) return "Archive metadata points at a local path that is not readable.";
  if (item.uri && String(item.uri).startsWith("sandbox:")) return "Provider exposed a sandbox artifact reference, but AuraCall has no local cached file yet.";
  if (item.uri) return "Provider artifact URI is recorded, but no cache-owned local file is attached.";
  return "This archive item has metadata only and no cache-owned local file.";
}

function compactIdentity(value) {
  if (!value) return "none";
  const text = String(value);
  const withoutPrefix = text.replace(/^service-account:/, "");
  const accountPart = withoutPrefix.split("|")[0] ?? withoutPrefix;
  const providerScopedMatch = accountPart.match(/^[^:]+:(.+@.+)$/u);
  return (providerScopedMatch?.[1] ?? accountPart).replace(/\|/g, " | ");
}

function compactRuntimeProfile(value) {
  return String(value ?? "unknown").replace(/^auracall-/, "");
}

function searchRowCellTitle(row, column) {
  if (column.id === "sortTime") return formatDateTime(row.sortTime);
  if (column.id === "provider") return row.provider;
  if (column.id === "tenant") return `${row.boundIdentityKey ?? "unbound"} / ${row.runtimeProfileId ?? "unknown"}`;
  if (column.id === "project") return row.project;
  if (column.id === "title") return compactText([row.title, row.summary].filter(Boolean).join("\n"), 520);
  if (column.id === "actions") return "Inspect, copy handoff link, open provider link, or download cached asset";
  if (column.id === "kind") return row.kind;
  if (column.id === "status") return statusLabel(row.status);
  if (column.id === "files") {
    const freshness = searchRowAssetFreshness(row);
    return `${formatNumber(row.fileCount)} files / ${formatNumber(row.artifactCount)} artifacts${freshness ? `; ${freshness}` : ""}`;
  }
  if (column.id === "ids") return row.itemId;
  if (column.id === "updatedAt") return formatDateTime(row.updatedAt);
  return "";
}

function routeEntriesFromSearch(row, archiveItem) {
  const links = {
    handoff: row?.id ? `/dashboard?nav=search&row=${base64UrlEncodeText(row.id)}` : null,
    ...(row?.links ?? {}),
    ...(archiveItem?.links ?? {}),
    catalogItem: row?.catalogItemRoute,
    archiveItem: row?.archiveItemRoute ?? archiveItemRoute(archiveItem),
    asset: row?.assetRoute ?? archiveItemAssetRoute(archiveItem),
    provider: row?.url ?? archiveItem?.providerConversationUrl,
  };
  return Object.entries(links).filter(([, value]) => typeof value === "string" && value.trim());
}

function SearchInspectorSummary({ row, archiveItem }) {
  if (!row && !archiveItem) return null;
  const source = archiveItem ?? row ?? {};
  const metadata = {
    ...(row?.raw?.metadata ?? {}),
    ...(row?.metadata ?? {}),
    ...(archiveItem?.metadata ?? {}),
  };
  const title = String(source.title ?? source.fileName ?? source.id ?? "Selected result");
  const subtitle = row?.summary ?? archiveItem?.uri ?? archiveItem?.localPath ?? row?.itemId ?? archiveItem?.id;
  const fileSummary = `${formatNumber(row?.fileCount ?? 0)} files / ${formatNumber(row?.artifactCount ?? 0)} artifacts`;
  const assetFreshness = searchRowAssetFreshness(row);
  const facts = [
    ["Response", metadata.responseId ?? archiveItem?.responseId ?? "none"],
    ["Batch", metadata.batchId ?? archiveItem?.batchId ?? "none"],
    ["Agent", metadata.agentId ?? archiveItem?.agentId ?? "none"],
    ["Asset", archiveItemAssetRoute(archiveItem) || row?.assetRoute ? "cached" : archiveItem?.fileAvailable === false ? "missing" : "not materialized"],
    ["Asset Freshness", assetFreshness ?? "not materialized"],
  ];
  const meta = [
    [source.provider ? <ProviderIcon provider={source.provider} /> : "none", "Provider"],
    [compactIdentity(row?.tenantKey ?? row?.boundIdentityKey ?? archiveItem?.boundIdentityKey), "Tenant"],
    [compactText(row?.bindingKey ?? "not reported", 42), "Binding"],
    [compactRuntimeProfile(row?.runtimeProfileId ?? archiveItem?.runtimeProfile), "Runtime"],
    [row?.project ?? archiveItem?.projectId ?? "No project", "Project"],
    [row?.kind ?? archiveItem?.kind ?? "unknown", "Kind"],
    [fileSummary, "Files"],
  ];

  return (
    <section className="search-inspector-card" aria-label="Selected search result summary">
      <div className="search-inspector-title">
        <span className={`status-pill status-${statusTone(row?.status ?? archiveItem?.status)}`}>{statusLabel(row?.status ?? archiveItem?.status)}</span>
        <strong title={title}>{compactText(title, 160)}</strong>
        {subtitle ? <small title={String(subtitle)}>{compactText(subtitle, 180)}</small> : null}
      </div>
      <div className="search-inspector-meta" aria-label="Selected result routing context">
        {meta.map(([value, label]) => (
          <span key={label}>
            <b><DetailValue detail={value} /></b>
            <small>{label}</small>
          </span>
        ))}
      </div>
      <div className="search-inspector-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b><DetailValue detail={value} /></b>
          </div>
        ))}
      </div>
    </section>
  );
}

function mergedSearchMetadata(row, archiveItem) {
  return {
    ...(row?.metadata ?? {}),
    ...(row?.raw?.metadata ?? {}),
    ...(row?.raw?.metadata?.raw ?? {}),
    ...(archiveItem?.metadata ?? {}),
  };
}

function SearchKindFacts({ facts }) {
  const visibleFacts = facts.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visibleFacts.length) return null;
  return (
    <div className="search-kind-facts">
      {visibleFacts.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b><DetailValue detail={value} /></b>
        </div>
      ))}
    </div>
  );
}

function SearchRouteStrip({ row, archiveItem, only }) {
  const allowed = only ? new Set(only) : null;
  const entries = routeEntriesFromSearch(row, archiveItem)
    .filter(([key]) => !allowed || allowed.has(key));
  if (!entries.length) return null;
  return (
    <div className="inspector-actions search-kind-actions" aria-label="Selected result routes">
      {entries.map(([key, value]) => (
        <RouteChip key={`${key}:${value}`} value={value} label={linkKeyLabel(key)} />
      ))}
    </div>
  );
}

function SearchRouteSection({ row, archiveItem }) {
  const entries = routeEntriesFromSearch(row, archiveItem);
  if (!entries.length) return null;
  return (
    <section className="search-route-section" aria-label="Selected search result routes">
      <div className="inspector-section-head">
        <strong>Routes</strong>
        <span>{formatNumber(entries.length)} links</span>
      </div>
      <div className="inspector-actions search-kind-actions">
        {entries.map(([key, value]) => (
          <RouteChip key={`${key}:${value}`} value={value} label={linkKeyLabel(key)} />
        ))}
      </div>
    </section>
  );
}

function RunLineageStep({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`run-lineage-step run-lineage-${tone}`}>
      <span>{label}</span>
      <strong title={String(value ?? "")}>{compactText(value ?? "none", 58)}</strong>
      {detail ? <small title={String(detail)}>{compactText(detail, 86)}</small> : null}
    </div>
  );
}

function RunLineageTimeline({ row, archiveItem, metadata, responseId, sourceKind }) {
  const batchLabel = metadata.batchId ?? archiveItem?.batchId;
  const batchIndex = metadata.batchIndex ?? archiveItem?.batchIndex;
  const agentId = metadata.agentId ?? archiveItem?.agentId;
  const teamId = metadata.teamId ?? archiveItem?.teamId;
  const runtime = row?.runtimeProfileId ?? archiveItem?.runtimeProfile;
  const runtimeState = archiveItem?.runtimeState ?? metadata.runtimeState ?? row?.status ?? archiveItem?.status;
  const outputCount = metadata.outputItemCount ?? "not reported";
  const requestedOutputCount = metadata.requestedOutputCount ?? null;
  const stepCount = metadata.stepCount ?? null;

  return (
    <div className="run-lineage-timeline" aria-label="Run lineage timeline">
      <RunLineageStep
        label="Source"
        value={sourceKind ?? metadata.sourceKind ?? row?.kind ?? archiveItem?.kind ?? "run"}
        detail={archiveItem?.id ?? row?.itemId}
      />
      <RunLineageStep
        label={batchLabel ? "Batch" : "Response"}
        value={batchLabel ?? responseId ?? archiveItem?.responseId ?? row?.itemId}
        detail={batchIndex !== null && batchIndex !== undefined ? `index ${batchIndex}` : responseId ? `response ${responseId}` : null}
      />
      <RunLineageStep
        label={teamId ? "Team" : "Agent"}
        value={teamId ?? agentId ?? "none"}
        detail={teamId && agentId ? `agent ${agentId}` : null}
      />
      <RunLineageStep
        label="Runtime"
        value={runtime ?? "none"}
        detail={runtimeState ? `state ${runtimeState}` : null}
        tone={statusTone(row?.status ?? archiveItem?.status)}
      />
      <RunLineageStep
        label="Outputs"
        value={`${outputCount}`}
        detail={[
          requestedOutputCount !== null ? `${requestedOutputCount} requested` : null,
          stepCount !== null ? `${stepCount} steps` : null,
        ].filter(Boolean).join(" / ")}
      />
    </div>
  );
}

function RawPreviewSection({ preview, collapsed }) {
  if (!preview) return null;
  if (!collapsed) {
    return (
      <div className="json-preview">
        <code>{JSON.stringify(preview, null, 2)}</code>
      </div>
    );
  }
  return (
    <details className="raw-inspector-section">
      <summary>
        <strong>Raw</strong>
        <span>JSON preview</span>
      </summary>
      <div className="json-preview">
        <code>{JSON.stringify(preview, null, 2)}</code>
      </div>
    </details>
  );
}

function RunSearchInspector({ row, archiveItem }) {
  const kind = row?.kind ?? archiveItem?.kind;
  const sourceKind = row?.raw?.sourceKind ?? archiveItem?.kind;
  if (kind !== "run" && !["response", "team_run"].includes(sourceKind)) return null;
  const metadata = mergedSearchMetadata(row, archiveItem);
  const responseId = metadata.responseId ?? archiveItem?.responseId ?? row?.raw?.metadata?.responseId;
  const prompt = row?.title ?? archiveItem?.title;
  const facts = [
    ["Source", sourceKind ?? metadata.sourceKind ?? "run"],
    ["Response", responseId ?? "none"],
    ["Batch", metadata.batchId ?? archiveItem?.batchId ?? "none"],
    ["Batch index", metadata.batchIndex ?? archiveItem?.batchIndex ?? "none"],
    ["Agent", metadata.agentId ?? archiveItem?.agentId ?? "none"],
    ["Team", metadata.teamId ?? archiveItem?.teamId ?? "none"],
    ["Steps", metadata.stepCount ?? "not reported"],
    ["Outputs", metadata.outputItemCount ?? "not reported"],
    ["Requested outputs", metadata.requestedOutputCount ?? "not reported"],
    ["Runtime", row?.runtimeProfileId ?? archiveItem?.runtimeProfile ?? "none"],
  ];

  return (
    <section className="search-kind-panel" aria-label="Run result inspector">
      <div className="search-kind-title">
        <Activity size={14} aria-hidden="true" />
        <strong>Run</strong>
        <span>{statusLabel(row?.status ?? archiveItem?.status)}</span>
      </div>
      <RunLineageTimeline
        row={row}
        archiveItem={archiveItem}
        metadata={metadata}
        responseId={responseId}
        sourceKind={sourceKind}
      />
      <SearchKindFacts facts={facts} />
      {prompt ? <p className="search-kind-preview">{compactText(prompt, 360)}</p> : null}
      <SearchRouteStrip row={row} archiveItem={archiveItem} only={["response", "runtimeRun", "batch", "archiveItem"]} />
    </section>
  );
}

function EvidenceSearchInspector({ row, archiveItem }) {
  const kind = row?.kind ?? archiveItem?.kind;
  if (kind !== "evidence") return null;
  const metadata = mergedSearchMetadata(row, archiveItem);
  const evidenceData = metadata.data && typeof metadata.data === "object" ? metadata.data : null;
  const evidencePreview = evidenceData ? compactText(JSON.stringify(evidenceData, null, 2), 1200) : null;
  const facts = [
    ["Producer", metadata.producer ?? "not reported"],
    ["Schema", metadata.schema ?? "not reported"],
    ["Evidence ID", metadata.evidenceId ?? archiveItem?.id ?? row?.itemId ?? "none"],
    ["Archive item", metadata.archiveItemId ?? archiveItem?.artifactId ?? "none"],
    ["Response", metadata.responseId ?? archiveItem?.responseId ?? "none"],
    ["Batch", metadata.batchId ?? archiveItem?.batchId ?? "none"],
    ["Conversation", row?.raw?.providerConversationId ?? archiveItem?.providerConversationId ?? "none"],
    ["Runtime", row?.runtimeProfileId ?? archiveItem?.runtimeProfile ?? "none"],
  ];

  return (
    <section className="search-kind-panel" aria-label="Evidence result inspector">
      <div className="search-kind-title">
        <FileText size={14} aria-hidden="true" />
        <strong>Evidence</strong>
        <span>{statusLabel(row?.status ?? archiveItem?.status)}</span>
      </div>
      <SearchKindFacts facts={facts} />
      {metadata.summary ? <p className="search-kind-preview">{compactText(metadata.summary, 420)}</p> : null}
      {evidencePreview ? <pre className="search-kind-json">{evidencePreview}</pre> : null}
      <SearchRouteStrip row={row} archiveItem={archiveItem} only={["response", "batch", "archiveItem", "asset"]} />
    </section>
  );
}

function emptyArchiveDetailState() {
  return {
    loading: false,
    error: null,
    result: null,
    updatedAt: null,
  };
}

function ArchiveSearchViewport({
  apiStatus,
  selectedArchiveItem,
  onSelectedArchiveItemChange,
  onSelectedArchiveDetailChange,
  selectedSearchRow,
  onSelectedSearchRowChange,
  onSelectedSearchDetailChange,
}) {
  const [filters, setFilters] = useState(readSearchFiltersFromUrl);
  const [tablePrefs, setTablePrefs] = useState(readSearchTablePreferences);
  const [catalog, setCatalog] = useState(null);
  const [virtualViewport, setVirtualViewport] = useState({ scrollTop: 0, height: 560 });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchedAt, setSearchedAt] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [savedViews, setSavedViews] = useState(readSearchViews);
  const [newViewName, setNewViewName] = useState("");
  const [activeViewId, setActiveViewId] = useState(null);
  const [copiedRowId, setCopiedRowId] = useState(null);
  const [copiedSearchUrl, setCopiedSearchUrl] = useState(false);
  const [materializingRowId, setMaterializingRowId] = useState(null);
  const [rowMaterializationJobs, setRowMaterializationJobs] = useState({});
  const [reconcilingRowId, setReconcilingRowId] = useState(null);
  const [rowReconciliationJobs, setRowReconciliationJobs] = useState({});
  const [isCompactSearchTable, setIsCompactSearchTable] = useState(() => window.matchMedia("(max-width: 620px)").matches);
  const searchRoute = apiStatus.status?.routes?.search ?? "/v1/search";
  const dragColumnRef = useRef(null);
  const searchWorkbenchRef = useRef(null);
  const searchScrollRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const allRows = useMemo(() => flattenSearchCatalogRows(catalog), [catalog]);
  const facets = useMemo(() => {
    if (catalog?.facets) {
      return {
        providers: (catalog.facets.providers ?? []).map((item) => [item.value, item.count]),
        statuses: (catalog.facets.statuses ?? []).map((item) => [item.value, item.count]),
        assetAvailability: (catalog.facets.assetAvailability ?? []).map((item) => [item.value, item.count]),
        materialization: (catalog.facets.materialization ?? []).map((item) => [item.value, item.count]),
      };
    }
    const providers = new Map();
    const statuses = new Map();
    const assetAvailability = new Map();
    const materialization = new Map();
    for (const row of allRows) {
      providers.set(row.provider, (providers.get(row.provider) ?? 0) + 1);
      statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1);
      const availability = row.fileAvailable === true ? "available" : row.fileAvailable === false ? "unavailable" : "pending";
      assetAvailability.set(availability, (assetAvailability.get(availability) ?? 0) + 1);
      const materializationStatus = searchRowMaterializationStatus(row);
      if (materializationStatus) materialization.set(materializationStatus, (materialization.get(materializationStatus) ?? 0) + 1);
    }
    return {
      providers: [...providers.entries()].sort(([left], [right]) => left.localeCompare(right)),
      statuses: [...statuses.entries()].sort(([left], [right]) => left.localeCompare(right)),
      assetAvailability: [...assetAvailability.entries()].sort(([left], [right]) => left.localeCompare(right)),
      materialization: [...materialization.entries()].sort(([left], [right]) => left.localeCompare(right)),
    };
  }, [allRows]);
  const filteredRows = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return allRows
      .filter((row) => filters.kind === "all" || row.kind === filters.kind)
      .filter((row) => {
        if (filters.assets === "all") return true;
        const availability = row.fileAvailable === true ? "available" : row.fileAvailable === false ? "unavailable" : "pending";
        return availability === filters.assets;
      })
      .filter((row) => materializationFilterMatches(row, rowMaterializationJobs[row.id], filters.materialization))
      .filter((row) => !filters.providers.size || filters.providers.has(row.provider))
      .filter((row) => !filters.statuses.size || filters.statuses.has(row.status))
      .filter((row) => {
        if (!needle) return true;
        return [
          row.provider,
          row.runtimeProfileId,
          row.boundIdentityKey,
          row.project,
          row.title,
          row.summary,
          row.kind,
          row.status,
          row.itemId,
          row.url,
        ].join(" ").toLowerCase().includes(needle);
      })
      .sort((left, right) => compareSearchRows(left, right, tablePrefs.sort));
  }, [allRows, filters, rowMaterializationJobs, tablePrefs.sort]);
  const loadedAvailableRows = allRows.filter((row) => row.fileAvailable === true).length;
  const materializationFacetCounts = useMemo(() => {
    const counts = new Map(SEARCH_MATERIALIZATION_FACETS.map((facet) => [facet.id, 0]));
    for (const row of allRows) {
      const job = rowMaterializationJobs[row.id];
      const status = searchRowMaterializationStatus(row, job);
      if (!status) continue;
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(status, (counts.get(status) ?? 0) + 1);
      if (status === "queued" || status === "running") counts.set("active", (counts.get("active") ?? 0) + 1);
    }
    return counts;
  }, [allRows, rowMaterializationJobs]);
  const activeMaterializationRows = materializationFacetCounts.get("active") ?? 0;
  const activeRowMaterializationJobIds = useMemo(() =>
    Object.values(rowMaterializationJobs)
      .filter(isActiveArchiveMaterializationJob)
      .map((job) => job.id)
      .filter(Boolean)
      .sort()
      .join(","),
  [rowMaterializationJobs]);
  const activeRowReconciliationJobIds = useMemo(() =>
    Object.values(rowReconciliationJobs)
      .filter(isActiveHistoryMaterializationJob)
      .map((job) => job.id)
      .filter(Boolean)
      .sort()
      .join(","),
  [rowReconciliationJobs]);
  const selectedRow = selectedSearchRow?.id ? (allRows.find((row) => row.id === selectedSearchRow.id) ?? selectedSearchRow) : null;
  const virtualWindow = useMemo(() => {
    const visibleCapacity = Math.ceil(virtualViewport.height / SEARCH_ROW_HEIGHT);
    const startIndex = clamp(Math.floor(virtualViewport.scrollTop / SEARCH_ROW_HEIGHT) - SEARCH_OVERSCAN_ROWS, 0, filteredRows.length);
    const endIndex = clamp(startIndex + visibleCapacity + SEARCH_OVERSCAN_ROWS * 2, startIndex, filteredRows.length);
    return {
      rows: filteredRows.slice(startIndex, endIndex),
      startIndex,
      topPadding: startIndex * SEARCH_ROW_HEIGHT,
      bottomPadding: Math.max(0, (filteredRows.length - endIndex) * SEARCH_ROW_HEIGHT),
    };
  }, [filteredRows, virtualViewport]);
  const visibleRows = virtualWindow.rows;
  const selectedArchiveLike = selectedArchiveItem?.id && !selectedRow;
  const visibleColumns = useMemo(() => {
    const columns = orderedSearchColumns(tablePrefs);
    if (!isCompactSearchTable) return columns;
    const compactColumnIds = new Set(["sortTime", "provider", "title", "actions"]);
    return columns.filter((column) => compactColumnIds.has(column.id));
  }, [isCompactSearchTable, tablePrefs]);
  const hiddenColumnCount = tablePrefs.hidden?.length ?? 0;
  const activeFilterCount = (filters.q.trim() ? 1 : 0)
    + (filters.kind !== "all" ? 1 : 0)
    + (filters.assets !== "all" ? 1 : 0)
    + (filters.materialization !== "all" ? 1 : 0)
    + filters.providers.size
    + filters.statuses.size;
  const hasActiveFilters = activeFilterCount > 0;
  const hasOpenSearchPopover = showAdvancedFilters || isColumnMenuOpen || isViewsMenuOpen;
  const activeFilterSummaryItems = [
    filters.kind !== "all" ? { key: "kind", label: SEARCH_KIND_FACETS.find((facet) => facet.id === filters.kind)?.label ?? filters.kind, type: "kind", value: filters.kind } : null,
    filters.assets !== "all" ? { key: "assets", label: SEARCH_ASSET_FACETS.find((facet) => facet.id === filters.assets)?.label ?? filters.assets, type: "assets", value: filters.assets } : null,
    filters.materialization !== "all" ? { key: "materialization", label: SEARCH_MATERIALIZATION_FACETS.find((facet) => facet.id === filters.materialization)?.label ?? filters.materialization, type: "materialization", value: filters.materialization } : null,
    ...[...filters.providers].slice(0, 2).map((provider) => ({ key: `provider:${provider}`, label: provider, type: "providers", value: provider })),
    filters.providers.size > 2 ? { key: "provider-more", label: `+${filters.providers.size - 2} providers`, type: "more" } : null,
    ...[...filters.statuses].slice(0, 2).map((status) => ({ key: `status:${status}`, label: statusLabel(status), type: "statuses", value: status })),
    filters.statuses.size > 2 ? { key: "status-more", label: `+${filters.statuses.size - 2} statuses`, type: "more" } : null,
  ].filter(Boolean).slice(0, 5);

  function closeSearchPopovers() {
    setShowAdvancedFilters(false);
    setIsColumnMenuOpen(false);
    setIsViewsMenuOpen(false);
  }

  useEffect(() => {
    localStorage.setItem(SEARCH_TABLE_STORAGE_KEY, JSON.stringify(tablePrefs));
  }, [tablePrefs]);

  useEffect(() => {
    localStorage.setItem(SEARCH_VIEWS_STORAGE_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px)");
    function updateCompactSearchTable() {
      setIsCompactSearchTable(media.matches);
    }
    updateCompactSearchTable();
    media.addEventListener("change", updateCompactSearchTable);
    return () => media.removeEventListener("change", updateCompactSearchTable);
  }, []);

  useEffect(() => {
    if (!hasOpenSearchPopover) return undefined;
    const handlePointerDown = (event) => {
      if (searchWorkbenchRef.current?.contains(event.target)) return;
      closeSearchPopovers();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSearchPopovers();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasOpenSearchPopover]);

  useEffect(() => {
    replaceUrlParams({
      nav: "search",
      q: filters.q.trim() || null,
      kind: filters.kind === "all" ? null : filters.kind,
      assets: filters.assets === "all" ? null : filters.assets,
      materialization: filters.materialization === "all" ? null : filters.materialization,
      searchProvider: filters.providers.size ? serializeSearchUrlList(filters.providers) : null,
      searchStatus: filters.statuses.size ? serializeSearchUrlList(filters.statuses) : null,
    });
  }, [filters]);

  useEffect(() => {
    function onPopState() {
      setFilters(readSearchFiltersFromUrl());
      setActiveViewId(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!selectedArchiveItem) {
      onSelectedArchiveDetailChange(emptyArchiveDetailState());
      return undefined;
    }

    let alive = true;
    const controller = new AbortController();
    onSelectedArchiveDetailChange({
      loading: true,
      error: null,
      result: null,
      updatedAt: null,
    });

    fetch(archiveItemRoute(selectedArchiveItem), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        onSelectedArchiveDetailChange({
          loading: false,
          error: null,
          result: payload,
          updatedAt: new Date().toISOString(),
        });
      })
      .catch((detailError) => {
        if (!alive || detailError.name === "AbortError") return;
        onSelectedArchiveDetailChange({
          loading: false,
          error: detailError.message || "Archive item inspection failed",
          result: null,
          updatedAt: null,
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedArchiveItem, onSelectedArchiveDetailChange]);

  useEffect(() => {
    const detailRoute = selectedRow?.archiveItemRoute ?? selectedRow?.catalogItemRoute ?? null;
    if (!detailRoute) {
      onSelectedSearchDetailChange(null);
      return undefined;
    }
    let alive = true;
    const controller = new AbortController();
    onSelectedSearchDetailChange({
      loading: true,
      error: null,
      result: null,
      updatedAt: null,
    });
    fetch(detailRoute, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        onSelectedSearchDetailChange({
          loading: false,
          error: null,
          result: payload,
          updatedAt: new Date().toISOString(),
        });
      })
      .catch((detailError) => {
        if (!alive || detailError.name === "AbortError") return;
        onSelectedSearchDetailChange({
          loading: false,
          error: detailError.message || "Search row inspection failed",
          result: null,
          updatedAt: null,
        });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedRow?.archiveItemRoute, selectedRow?.catalogItemRoute, onSelectedSearchDetailChange]);

  useEffect(() => {
    if (!selectedSearchRow?.id) return;
    if (!allRows.length) return;
    const replacement = allRows.find((row) => row.id === selectedSearchRow.id);
    if (replacement && replacement !== selectedSearchRow) onSelectedSearchRowChange(replacement);
  }, [allRows, onSelectedSearchRowChange, selectedSearchRow]);

  useEffect(() => {
    if (!selectedSearchRow?.id || !allRows.length || !catalog?.nextCursor || loading || loadingMore) return;
    if (allRows.some((row) => row.id === selectedSearchRow.id)) return;
    loadMoreRows();
  }, [allRows, catalog?.nextCursor, loading, loadingMore, selectedSearchRow?.id]);

  useEffect(() => {
    if (!selectedRow?.id || !filteredRows.length) return;
    const selectedIndex = filteredRows.findIndex((row) => row.id === selectedRow.id);
    if (selectedIndex < 0) return;
    const rowTop = selectedIndex * SEARCH_ROW_HEIGHT;
    const rowBottom = rowTop + SEARCH_ROW_HEIGHT;
    const viewTop = virtualViewport.scrollTop;
    const viewBottom = viewTop + virtualViewport.height;
    if (rowTop >= viewTop && rowBottom <= viewBottom) return;
    const nextScrollTop = Math.max(0, rowTop - SEARCH_ROW_HEIGHT * 2);
    setVirtualViewport((current) => ({ ...current, scrollTop: nextScrollTop }));
    if (searchScrollRef.current) searchScrollRef.current.scrollTop = nextScrollTop;
  }, [filteredRows, selectedRow?.id, virtualViewport.height, virtualViewport.scrollTop]);

  useEffect(() => {
    if (!isLive) return undefined;
    const timer = window.setInterval(() => loadCatalog(false), SEARCH_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isLive, filters]);

  useEffect(() => {
    if (!activeRowMaterializationJobIds) return undefined;
    const timer = window.setInterval(() => {
      for (const jobId of activeRowMaterializationJobIds.split(",").filter(Boolean)) {
        void refreshRowMaterializationJob(jobId, { silent: true });
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeRowMaterializationJobIds]);

  useEffect(() => {
    if (!activeRowReconciliationJobIds) return undefined;
    const timer = window.setInterval(() => {
      for (const jobId of activeRowReconciliationJobIds.split(",").filter(Boolean)) {
        void refreshRowReconciliationJob(jobId, { silent: true });
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeRowReconciliationJobIds]);

  useEffect(() => {
    loadCatalog();
  }, [filters]);

  useEffect(() => {
    setVirtualViewport((current) => ({ ...current, scrollTop: 0 }));
    if (searchScrollRef.current) searchScrollRef.current.scrollTop = 0;
  }, [tablePrefs.sort]);

  function searchParamsForRequest(cursor = null) {
    const params = new URLSearchParams({ limit: String(SEARCH_PAGE_SIZE) });
    const query = filters.q.trim();
    if (query) params.set("q", query);
    if (filters.kind !== "all") params.set("kind", filters.kind);
    if (filters.assets !== "all") params.set("assetAvailability", filters.assets);
    if (filters.materialization !== "all") params.set("materialization", filters.materialization);
    if (filters.providers.size === 1) params.set("provider", [...filters.providers][0]);
    if (filters.statuses.size === 1) params.set("status", [...filters.statuses][0]);
    if (cursor) params.set("cursor", cursor);
    return params;
  }

  async function fetchSearchPage(cursor = null) {
    const response = await fetch(`/v1/search?${searchParamsForRequest(cursor).toString()}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
    }
    return payload;
  }

  async function loadCatalog(resetScroll = true) {
    setLoading(true);
    setError(null);
    loadingMoreRef.current = false;
    try {
      const firstPage = await fetchSearchPage();
      setCatalog(firstPage);
      if (resetScroll) {
        setVirtualViewport((current) => ({ ...current, scrollTop: 0 }));
        if (searchScrollRef.current) searchScrollRef.current.scrollTop = 0;
      }
      setSearchedAt(new Date().toISOString());
    } catch (searchError) {
      setError(searchError.message || "Search projection load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreRows() {
    if (loading || loadingMore || loadingMoreRef.current || !catalog?.nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchSearchPage(catalog.nextCursor);
      setCatalog((current) => ({
        ...(page ?? {}),
        rows: [...(current?.rows ?? []), ...(page?.rows ?? [])],
        metrics: page?.metrics ?? current?.metrics,
        facets: page?.facets ?? current?.facets,
        nextCursor: page?.nextCursor ?? null,
      }));
      setSearchedAt(new Date().toISOString());
    } catch (searchError) {
      setError(searchError.message || "Search projection page load failed");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  function updateQuery(value) {
    setFilters((current) => ({ ...current, q: value }));
    setActiveViewId(null);
  }

  function updateKind(kind) {
    setFilters((current) => ({ ...current, kind }));
    setActiveViewId(null);
  }

  function updateAssets(assets) {
    setFilters((current) => ({ ...current, assets }));
    setActiveViewId(null);
  }

  function updateMaterialization(materialization) {
    setFilters((current) => ({ ...current, materialization }));
    setActiveViewId(null);
  }

  function toggleAvailableAssetsView() {
    setActiveViewId(null);
    setFilters((current) => {
      const active = current.kind === "artifact" && current.assets === "available";
      return {
        ...current,
        kind: active ? "all" : "artifact",
        assets: active ? "all" : "available",
      };
    });
  }

  function toggleSetFacet(name, value) {
    setActiveViewId(null);
    setFilters((current) => {
      const next = new Set(current[name]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...current, [name]: next };
    });
  }

  function removeSummaryFilter(item) {
    if (item.type === "more") {
      setShowAdvancedFilters(true);
      setIsColumnMenuOpen(false);
      setIsViewsMenuOpen(false);
      return;
    }
    setActiveViewId(null);
    setFilters((current) => {
      if (item.type === "kind") return { ...current, kind: "all" };
      if (item.type === "assets") return { ...current, assets: "all" };
      if (item.type === "materialization") return { ...current, materialization: "all" };
      const next = new Set(current[item.type]);
      next.delete(item.value);
      return { ...current, [item.type]: next };
    });
  }

  function clearFacets() {
    setFilters({ q: "", kind: "all", assets: "all", materialization: "all", providers: new Set(), statuses: new Set() });
    setActiveViewId(null);
  }

  function setSort(column) {
    const descriptor = SEARCH_TABLE_COLUMNS.find((item) => item.id === column);
    if (!descriptor?.sortable) return;
    setTablePrefs((current) => ({
      ...current,
      sort: {
        column,
        direction: current.sort.column === column && current.sort.direction === "desc" ? "asc" : "desc",
      },
    }));
    setActiveViewId(null);
  }

  function beginColumnResize(column, event) {
    setActiveViewId(null);
    dragColumnRef.current = {
      column,
      startX: event.clientX,
      startWidth: tablePrefs.widths[column] ?? SEARCH_TABLE_COLUMNS.find((item) => item.id === column)?.width ?? 120,
    };
    document.body.classList.add("is-resizing-pane");
  }

  function toggleColumnVisibility(columnId) {
    if (PINNED_SEARCH_COLUMN_IDS.has(columnId)) return;
    setActiveViewId(null);
    setTablePrefs((current) => {
      const hidden = new Set(current.hidden ?? []);
      if (hidden.has(columnId)) hidden.delete(columnId);
      else hidden.add(columnId);
      return { ...current, hidden: [...hidden] };
    });
  }

  function moveColumn(columnId, direction) {
    if (PINNED_SEARCH_COLUMN_IDS.has(columnId)) return;
    setActiveViewId(null);
    setTablePrefs((current) => {
      const nonPinnedIds = SEARCH_TABLE_COLUMNS.filter((column) => !column.pinned).map((column) => column.id);
      const order = [
        ...(current.order ?? []),
        ...nonPinnedIds,
      ].filter((id, index, list) => nonPinnedIds.includes(id) && list.indexOf(id) === index);
      const index = order.indexOf(columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      const nextOrder = [...order];
      [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
      return { ...current, order: nextOrder };
    });
  }

  function resetColumnPreferences() {
    setTablePrefs((current) => ({
      ...current,
      widths: {},
      hidden: DEFAULT_SEARCH_TABLE_PREFS.hidden,
      order: DEFAULT_SEARCH_TABLE_PREFS.order,
    }));
    setActiveViewId(null);
  }

  function defaultViewName() {
    const parts = [];
    if (filters.q.trim()) parts.push(filters.q.trim());
    if (filters.kind !== "all") parts.push(SEARCH_KIND_FACETS.find((facet) => facet.id === filters.kind)?.label ?? filters.kind);
    if (filters.assets !== "all") parts.push(SEARCH_ASSET_FACETS.find((facet) => facet.id === filters.assets)?.label ?? filters.assets);
    if (filters.materialization !== "all") parts.push(SEARCH_MATERIALIZATION_FACETS.find((facet) => facet.id === filters.materialization)?.label ?? filters.materialization);
    if (filters.providers.size) parts.push([...filters.providers].join("+"));
    if (filters.statuses.size) parts.push([...filters.statuses].map(statusLabel).join("+"));
    return parts.join(" / ") || `Search view ${savedViews.length + 1}`;
  }

  function saveCurrentView() {
    const name = (newViewName.trim() || defaultViewName()).slice(0, 80);
    const now = new Date().toISOString();
    const id = `view-${now.replace(/[^0-9]/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
    const view = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      filters: serializeSearchFilters(filters),
      tablePrefs,
    };
    setSavedViews((current) => [view, ...current.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 20));
    setNewViewName("");
    setActiveViewId(id);
  }

  function applySavedView(view) {
    setFilters(hydrateSearchFilters(view.filters));
    setTablePrefs(normalizeSearchTablePreferences(view.tablePrefs));
    setActiveViewId(view.id);
    setIsViewsMenuOpen(false);
  }

  function deleteSavedView(viewId, event) {
    event.stopPropagation();
    setSavedViews((current) => current.filter((view) => view.id !== viewId));
    if (activeViewId === viewId) setActiveViewId(null);
  }

  useEffect(() => {
    function onPointerMove(event) {
      if (!dragColumnRef.current) return;
      const { column, startX, startWidth } = dragColumnRef.current;
      const descriptor = SEARCH_TABLE_COLUMNS.find((item) => item.id === column);
      const width = Math.max(descriptor?.minWidth ?? 80, startWidth + event.clientX - startX);
      setTablePrefs((current) => ({
        ...current,
        widths: { ...current.widths, [column]: width },
      }));
    }

    function onPointerUp() {
      dragColumnRef.current = null;
      document.body.classList.remove("is-resizing-pane");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  function gridTemplateColumns() {
    return visibleColumns
      .map((column) => `${isCompactSearchTable ? (COMPACT_SEARCH_COLUMN_WIDTHS[column.id] ?? column.width) : (tablePrefs.widths[column.id] ?? column.width)}px`)
      .join(" ");
  }

  function columnWidth(columnId) {
    if (isCompactSearchTable && COMPACT_SEARCH_COLUMN_WIDTHS[columnId]) return COMPACT_SEARCH_COLUMN_WIDTHS[columnId];
    return tablePrefs.widths[columnId] ?? SEARCH_TABLE_COLUMNS.find((column) => column.id === columnId)?.width ?? 0;
  }

  function tablePinStyles() {
    const timeWidth = columnWidth("sortTime");
    const providerWidth = columnWidth("provider");
    return {
      "--search-pin-time": "0px",
      "--search-pin-provider": `${timeWidth}px`,
      "--search-pin-tenant": `${timeWidth + providerWidth}px`,
    };
  }

  function columnClassName(column, index, baseClassName) {
    const classNames = baseClassName ? [baseClassName] : [];
    if (column.pinned) {
      classNames.push("is-pinned", `pinned-${index + 1}`);
    }
    if (column.id === "actions") {
      classNames.push("is-sticky-action");
    }
    return classNames.join(" ");
  }

  function cellClassName(column, index, baseClassName = "") {
    if (column.id === "tenant") return columnClassName(column, index, "two-line-cell");
    if (column.id === "title") return columnClassName(column, index, "title-cell");
    if (column.id === "files") return columnClassName(column, index, "two-line-cell");
    if (column.id === "ids") return columnClassName(column, index, "mono-cell");
    if (column.id === "actions") return columnClassName(column, index, "search-row-actions");
    return columnClassName(column, index, baseClassName);
  }

  function sortButtonLabel(column) {
    if (!column.sortable) return column.label;
    if (tablePrefs.sort.column !== column.id) return `Sort by ${column.label}`;
    return `Sort by ${column.label}, currently ${tablePrefs.sort.direction === "desc" ? "descending" : "ascending"}`;
  }

  function renderSearchRowCell(row, column) {
    if (column.id === "sortTime") return formatDateTime(row.sortTime);
    if (column.id === "provider") return <ProviderIcon provider={row.provider} />;
    if (column.id === "tenant") return <><b>{compactIdentity(row.boundIdentityKey)}</b><small>{compactRuntimeProfile(row.runtimeProfileId)}</small></>;
    if (column.id === "project") return row.project;
    if (column.id === "title") return <><b>{compactText(row.title, 150)}</b>{row.summary ? <small>{compactText(row.summary, 100)}</small> : null}</>;
    if (column.id === "actions") {
      const canDownloadAsset = Boolean(row.assetRoute);
      const canMaterializeAsset = row.kind === "artifact" && row.archiveItemRoute;
      const materializationJob = rowMaterializationJobs[row.id] ?? null;
      const reconciliationJob = rowReconciliationJobs[row.id] ?? null;
      const activeMaterializationJob = isActiveArchiveMaterializationJob(materializationJob);
      const activeReconciliationJob = isActiveHistoryMaterializationJob(reconciliationJob);
      const showMaterializeAction = canMaterializeAsset || materializationJob;
      const showReconciliationAction = canReconcileSearchRow(row) || reconciliationJob;
      return (
        <>
          <button type="button" className="row-action-button" title="Inspect row" aria-label="Inspect result" onClick={(event) => { event.stopPropagation(); openRow(row); }}>
            <Database size={13} aria-hidden="true" />
          </button>
          <button type="button" className="row-action-button" title="Copy handoff link" aria-label="Copy handoff link" onClick={(event) => copySearchRowLink(row, event)}>
            {copiedRowId === row.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
          {row.url ? (
            <a className="row-action-button" href={row.url} target="_blank" rel="noreferrer" title="Open provider link" aria-label="Open provider link" onClick={handleSearchRowAction}>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ) : null}
          {canDownloadAsset ? (
            <a className="row-action-button" href={row.assetRoute} download title="Download cached asset" aria-label="Download cached asset" onClick={handleSearchRowAction}>
              <Download size={13} aria-hidden="true" />
            </a>
          ) : null}
          {showMaterializeAction ? (
            <button
              type="button"
              className={`row-action-button materialize-row-action materialize-row-${materializationJob?.status ?? "idle"}`}
              title={materializationRowTitle(materializationJob, materializingRowId === row.id, row)}
              aria-label={materializationRowTitle(materializationJob, materializingRowId === row.id, row)}
              disabled={materializingRowId === row.id || activeMaterializationJob}
              onClick={(event) => materializeSearchRow(row, event)}
            >
              {materializationRowIcon(materializationJob, materializingRowId === row.id, row)}
            </button>
          ) : null}
          {showReconciliationAction ? (
            <button
              type="button"
              className={`row-action-button reconcile-row-action reconcile-row-${reconciliationJob?.status ?? "idle"}`}
              title={reconciliationRowTitle(reconciliationJob, reconcilingRowId === row.id)}
              aria-label={reconciliationRowTitle(reconciliationJob, reconcilingRowId === row.id)}
              disabled={reconcilingRowId === row.id || activeReconciliationJob}
              onClick={(event) => reconcileSearchRow(row, event)}
            >
              {reconciliationRowIcon(reconciliationJob, reconcilingRowId === row.id)}
            </button>
          ) : null}
        </>
      );
    }
    if (column.id === "kind") return <span className="status-pill status-neutral">{row.kind}</span>;
    if (column.id === "status") return <span className={`status-pill status-${statusTone(row.status)}`}>{statusLabel(row.status)}</span>;
    if (column.id === "files") {
      const freshness = searchRowAssetFreshness(row);
      return (
        <>
          <b>{formatNumber(row.fileCount)} files / {formatNumber(row.artifactCount)} art</b>
          {freshness ? <small>{freshness}</small> : null}
        </>
      );
    }
    if (column.id === "ids") return row.itemId;
    if (column.id === "updatedAt") return formatDateTime(row.updatedAt);
    return "";
  }

  function openRow(row) {
    onSelectedArchiveItemChange(null);
    onSelectedSearchRowChange(row);
  }

  function searchRowHandoffUrl(row) {
    const url = new URL(window.location.href);
    url.searchParams.set("nav", "search");
    url.searchParams.delete("archiveItem");
    url.searchParams.delete("provider");
    url.searchParams.delete("runtime");
    if (row?.id) url.searchParams.set("row", base64UrlEncodeText(row.id));
    return url.toString();
  }

  function currentSearchHandoffUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("nav", "search");
    url.searchParams.delete("provider");
    url.searchParams.delete("runtime");
    url.searchParams.delete("runtimeProfile");
    return url.toString();
  }

  async function copyCurrentSearchUrl() {
    try {
      await navigator.clipboard.writeText(currentSearchHandoffUrl());
      setCopiedSearchUrl(true);
      window.setTimeout(() => setCopiedSearchUrl(false), 1200);
    } catch {
      setCopiedSearchUrl(false);
    }
  }

  async function copySearchRowLink(row, event) {
    event.stopPropagation();
    if (!row?.id) return;
    try {
      await navigator.clipboard.writeText(searchRowHandoffUrl(row));
      setCopiedRowId(row.id);
      window.setTimeout(() => setCopiedRowId((current) => (current === row.id ? null : current)), 1200);
    } catch {
      setCopiedRowId(null);
    }
  }

  async function materializeSearchRow(row, event) {
    event.stopPropagation();
    if (!row?.itemId) return;
    setMaterializingRowId(row.id);
    try {
      const response = await fetch(archiveMaterializationCreateRoute(), {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archiveItemId: row.itemId, force: row.fileAvailable === true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? null;
      if (job) {
        setRowMaterializationJobs((current) => ({ ...current, [row.id]: job }));
        if (!isActiveArchiveMaterializationJob(job)) {
          window.setTimeout(() => {
            void loadCatalog(false);
          }, 500);
        }
      }
      window.setTimeout(() => {
        void loadCatalog(false);
      }, 900);
    } catch {
      setMaterializingRowId(null);
    } finally {
      setMaterializingRowId((current) => (current === row.id ? null : current));
    }
  }

  async function reconcileSearchRow(row, event) {
    event.stopPropagation();
    if (!canReconcileSearchRow(row)) return;
    setReconcilingRowId(row.id);
    try {
      const response = await fetch(historyMaterializationCreateRoute(), {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: row.provider,
          runtimeProfile: row.runtimeProfileId,
          catalogItemId: row.itemId,
          catalogKind: "conversations",
          assetKinds: ["all"],
          refreshSnapshot: true,
          force: false,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? null;
      if (job) {
        setRowReconciliationJobs((current) => ({ ...current, [row.id]: job }));
        if (!isActiveHistoryMaterializationJob(job)) {
          window.setTimeout(() => {
            void loadCatalog(false);
          }, 500);
        }
      }
      window.setTimeout(() => {
        void loadCatalog(false);
      }, 900);
    } catch {
      setReconcilingRowId(null);
    } finally {
      setReconcilingRowId((current) => (current === row.id ? null : current));
    }
  }

  async function refreshRowMaterializationJob(jobId, options = {}) {
    const route = archiveMaterializationJobRoute(jobId);
    if (!route) return;
    try {
      const response = await fetch(route, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? payload;
      if (!job?.id) return;
      setRowMaterializationJobs((current) => {
        const next = { ...current };
        for (const [rowId, currentJob] of Object.entries(current)) {
          if (currentJob?.id === job.id) next[rowId] = job;
        }
        return next;
      });
      if (!isActiveArchiveMaterializationJob(job)) {
        void loadCatalog(false);
      }
    } catch {
      if (!options.silent) setMaterializingRowId(null);
    }
  }

  async function refreshRowReconciliationJob(jobId, options = {}) {
    const route = historyMaterializationJobRoute(jobId);
    if (!route) return;
    try {
      const response = await fetch(route, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? payload;
      if (!job?.id) return;
      setRowReconciliationJobs((current) => {
        const next = { ...current };
        for (const [rowId, currentJob] of Object.entries(current)) {
          if (currentJob?.id === job.id) next[rowId] = job;
        }
        return next;
      });
      if (!isActiveHistoryMaterializationJob(job)) {
        void loadCatalog(false);
      }
    } catch {
      if (!options.silent) setReconcilingRowId(null);
    }
  }

  function handleSearchRowAction(event) {
    event.stopPropagation();
  }

  function selectRowAtIndex(index) {
    if (!filteredRows.length) return;
    const row = filteredRows[clamp(index, 0, filteredRows.length - 1)];
    if (row) openRow(row);
  }

  function searchRowDomId(row) {
    return row?.id ? `search-row-${base64UrlEncodeText(row.id).slice(0, 80)}` : undefined;
  }

  function selectedRowIndex() {
    if (!selectedRow?.id) return -1;
    return filteredRows.findIndex((row) => row.id === selectedRow.id);
  }

  function handleSearchTableKeyDown(event) {
    if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = selectedRowIndex();
    const fallbackIndex = virtualWindow.startIndex;
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    if (event.key === "Enter" || event.key === " ") {
      selectRowAtIndex(baseIndex);
      return;
    }
    const pageStep = Math.max(1, Math.floor(virtualViewport.height / SEARCH_ROW_HEIGHT) - 2);
    if (event.key === "ArrowDown" && baseIndex >= filteredRows.length - 1 && catalog?.nextCursor) {
      loadMoreRows();
      return;
    }
    if (event.key === "End" && catalog?.nextCursor) {
      loadMoreRows();
    }
    const nextIndexByKey = {
      ArrowDown: baseIndex + 1,
      ArrowUp: baseIndex - 1,
      PageDown: baseIndex + pageStep,
      PageUp: baseIndex - pageStep,
      Home: 0,
      End: filteredRows.length - 1,
    };
    selectRowAtIndex(nextIndexByKey[event.key]);
  }

  return (
    <main className="viewport search-viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>All-tenant cache workbench</span>
          <h1>Search</h1>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(error ? "error" : "ok")}`} />
          <strong>{loading ? "Refreshing" : loadingMore ? "Loading page" : isLive ? "Live cache view" : "Paused"}</strong>
          <small>{searchedAt ? `Updated ${formatDateTime(searchedAt)}` : searchRoute}</small>
        </div>
      </div>

      <section ref={searchWorkbenchRef} className="search-workbench" aria-label="Search workbench">
        <div className="search-command-bar">
          <Search size={15} aria-hidden="true" />
          <input
            id="searchQuery"
            type="search"
            value={filters.q}
            placeholder="Search chats, tenants, projects, ids, and cached metadata"
            onChange={(event) => updateQuery(event.target.value)}
          />
          <div className={hasActiveFilters ? "facet-summary command-facet-summary active" : "facet-summary command-facet-summary"} aria-label="Search filter summary">
            <strong>{formatNumber(filteredRows.length)}</strong>
            <span>loaded</span>
            {hasActiveFilters ? (
              <>
                <b>{formatNumber(activeFilterCount)} active</b>
                {activeFilterSummaryItems.map((item) => (
                  <button
                    key={item.key}
                    className="facet-summary-chip"
                    type="button"
                    title={item.type === "more" ? "Show remaining filters" : `Remove ${item.label} filter`}
                    aria-label={item.type === "more" ? "Show remaining active filters" : `Remove ${item.label} filter`}
                    onClick={() => removeSummaryFilter(item)}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            ) : <b>all</b>}
          </div>
          <button className={isLive ? "search-live-toggle active" : "search-live-toggle"} type="button" onClick={() => setIsLive((current) => !current)} title={isLive ? "Pause live refresh" : "Resume live refresh"}>
            <span className={`state-dot state-${isLive ? "good" : "warn"}`} />
            <span>{isLive ? "Live" : "Paused"}</span>
          </button>
          <button className="icon-label-button search-toolbar-button" type="button" onClick={() => loadCatalog()} disabled={loading} title="Refresh search projection" aria-label="Refresh search projection">
            <RefreshCcw size={14} aria-hidden="true" />
            <span>{loading ? "Refreshing" : "Refresh"}</span>
          </button>
          <button
            className={copiedSearchUrl ? "icon-button search-url-copy active" : "icon-button search-url-copy"}
            type="button"
            onClick={copyCurrentSearchUrl}
            title={copiedSearchUrl ? "Search URL copied" : "Copy current Search URL"}
            aria-label={copiedSearchUrl ? "Search URL copied" : "Copy current Search URL"}
          >
            {copiedSearchUrl ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          <button
            className={filters.kind === "artifact" && filters.assets === "available" ? "icon-button search-asset-toggle active" : "icon-button search-asset-toggle"}
            type="button"
            onClick={toggleAvailableAssetsView}
            title="Show available cached assets"
            aria-label="Show available cached assets"
            aria-pressed={filters.kind === "artifact" && filters.assets === "available"}
          >
            <Download size={14} aria-hidden="true" />
          </button>
          <button
            className={showAdvancedFilters ? "icon-label-button search-toolbar-button active" : "icon-label-button search-toolbar-button"}
            type="button"
            onClick={() => {
              setShowAdvancedFilters((current) => !current);
              setIsColumnMenuOpen(false);
              setIsViewsMenuOpen(false);
            }}
            title={showAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
            aria-label={showAdvancedFilters ? "Hide advanced search filters" : "Show advanced search filters"}
            aria-expanded={showAdvancedFilters}
            aria-controls="searchAdvancedFilters"
          >
            <ListFilter size={14} aria-hidden="true" />
            <span>Filters</span>
          </button>
          <button
            className={isColumnMenuOpen ? "icon-label-button search-toolbar-button active" : "icon-label-button search-toolbar-button"}
            type="button"
            onClick={() => {
              setIsColumnMenuOpen((current) => !current);
              setIsViewsMenuOpen(false);
              setShowAdvancedFilters(false);
            }}
            title="Configure visible columns"
            aria-label="Configure visible columns"
            aria-expanded={isColumnMenuOpen}
            aria-controls="searchColumnMenu"
          >
            <Columns3 size={14} aria-hidden="true" />
            <span>Columns{hiddenColumnCount ? ` -${hiddenColumnCount}` : ""}</span>
          </button>
          <button
            className={isViewsMenuOpen ? "icon-label-button search-toolbar-button active" : "icon-label-button search-toolbar-button"}
            type="button"
            onClick={() => {
              setIsViewsMenuOpen((current) => !current);
              setIsColumnMenuOpen(false);
              setShowAdvancedFilters(false);
            }}
            title="Save or apply Search views"
            aria-label="Save or apply Search views"
            aria-expanded={isViewsMenuOpen}
            aria-controls="searchViewMenu"
          >
            <FileText size={14} aria-hidden="true" />
            <span>{activeViewId ? savedViews.find((view) => view.id === activeViewId)?.name ?? "View" : `Views${savedViews.length ? ` ${savedViews.length}` : ""}`}</span>
          </button>
          {hasActiveFilters ? (
            <button className="icon-button" type="button" onClick={clearFacets} title="Clear filters" aria-label="Clear search filters">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {isViewsMenuOpen ? (
          <div id="searchViewMenu" className="search-view-menu" aria-label="Saved Search views">
            <div className="search-view-save">
              <input
                type="text"
                value={newViewName}
                placeholder={defaultViewName()}
                onChange={(event) => setNewViewName(event.target.value)}
              />
              <button type="button" className="icon-label-button" onClick={saveCurrentView} title="Save current Search view">
                <Plus size={13} aria-hidden="true" />
                <span>Save</span>
              </button>
            </div>
            <div className="search-view-list">
              {savedViews.length ? savedViews.map((view) => (
                <div key={view.id} className={activeViewId === view.id ? "search-view-row active" : "search-view-row"}>
                  <button type="button" onClick={() => applySavedView(view)} title={`Apply ${view.name}`}>
                    <span>
                      <strong>{view.name}</strong>
                      <small>{view.filters.kind === "all" ? "all kinds" : view.filters.kind} / {view.filters.assets === "all" ? "all assets" : view.filters.assets} / {view.filters.materialization === "all" ? "all materializations" : view.filters.materialization} / {view.filters.providers.length || "all"} providers / {view.filters.statuses.length || "all"} statuses</small>
                    </span>
                  </button>
                  <button type="button" className="row-action-button" title={`Delete ${view.name}`} aria-label={`Delete ${view.name}`} onClick={(event) => deleteSavedView(view.id, event)}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )) : <p>No saved views yet.</p>}
            </div>
          </div>
        ) : null}

        {isColumnMenuOpen ? (
          <div id="searchColumnMenu" className="search-column-menu" aria-label="Search column controls">
            <div className="search-column-menu-head">
              <strong>Columns</strong>
              <button type="button" className="text-button" onClick={resetColumnPreferences}>Reset</button>
            </div>
            <div className="search-column-list">
              {SEARCH_TABLE_COLUMNS.map((column) => {
                const hidden = tablePrefs.hidden?.includes(column.id);
                const pinned = PINNED_SEARCH_COLUMN_IDS.has(column.id);
                return (
                  <div key={column.id} className="search-column-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={!hidden}
                        disabled={pinned}
                        onChange={() => toggleColumnVisibility(column.id)}
                      />
                      <span>{column.label}</span>
                      {pinned ? <small>Pinned</small> : null}
                    </label>
                    {!pinned ? (
                      <span className="column-move-buttons">
                        <button type="button" className="row-action-button" title={`Move ${column.label} left`} aria-label={`Move ${column.label} left`} onClick={() => moveColumn(column.id, -1)}>
                          <ArrowLeft size={12} aria-hidden="true" />
                        </button>
                        <button type="button" className="row-action-button" title={`Move ${column.label} right`} aria-label={`Move ${column.label} right`} onClick={() => moveColumn(column.id, 1)}>
                          <ArrowRight size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {showAdvancedFilters ? (
          <div id="searchAdvancedFilters" className="search-facet-popover" aria-label="Search facets">
            <div className="facet-section">
              <strong>Kind</strong>
              <div className="facet-group" role="tablist" aria-label="Kind">
                {SEARCH_KIND_FACETS.map((facet) => (
                  <button
                    key={facet.id}
                    type="button"
                    role="tab"
                    aria-selected={filters.kind === facet.id}
                    className={filters.kind === facet.id ? "filter-chip active" : "filter-chip"}
                    onClick={() => updateKind(facet.id)}
                  >
                    <span>{facet.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="facet-section">
              <strong>Assets</strong>
              <div className="facet-group compact-facets" role="tablist" aria-label="Asset availability">
                {SEARCH_ASSET_FACETS.map((facet) => {
                  const count = facet.id === "all"
                    ? allRows.length
                    : facets.assetAvailability.find(([value]) => value === facet.id)?.[1] ?? 0;
                  return (
                    <button
                      key={facet.id}
                      type="button"
                      role="tab"
                      aria-selected={filters.assets === facet.id}
                      className={filters.assets === facet.id ? "filter-chip active" : "filter-chip"}
                      title={`Filter assets: ${facet.label}`}
                      onClick={() => updateAssets(facet.id)}
                    >
                      <span>{facet.label}</span>
                      <b>{formatNumber(count)}</b>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="facet-section">
              <strong>Materialize</strong>
              <div className="facet-group compact-facets" role="tablist" aria-label="Materialization status">
                {SEARCH_MATERIALIZATION_FACETS.map((facet) => (
                  <button
                    key={facet.id}
                    type="button"
                    role="tab"
                    aria-selected={filters.materialization === facet.id}
                    className={filters.materialization === facet.id ? "filter-chip active" : "filter-chip"}
                    title={`Filter materialization: ${facet.label}`}
                    onClick={() => updateMaterialization(facet.id)}
                  >
                    <span>{facet.label}</span>
                    <b>{formatNumber(materializationFacetCounts.get(facet.id) ?? 0)}</b>
                  </button>
                ))}
              </div>
            </div>
            <div className="facet-section">
              <strong>Provider</strong>
              <div className="facet-group" aria-label="Providers">
                {facets.providers.map(([provider, count]) => (
                  <button
                    key={provider}
                    type="button"
                    aria-pressed={filters.providers.has(provider)}
                    className={filters.providers.has(provider) ? "filter-chip active provider-filter-chip" : "filter-chip provider-filter-chip"}
                    title={`Filter provider: ${provider}`}
                    onClick={() => toggleSetFacet("providers", provider)}
                  >
                    <ProviderIcon provider={provider} embedded />
                    <b>{formatNumber(count)}</b>
                  </button>
                ))}
              </div>
            </div>
            <div className="facet-section">
              <strong>Status</strong>
              <div className="facet-group compact-facets" aria-label="Status">
                {facets.statuses.slice(0, 6).map(([status, count]) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={filters.statuses.has(status)}
                    className={filters.statuses.has(status) ? "filter-chip active" : "filter-chip"}
                    title={`Filter status: ${statusLabel(status)}`}
                    onClick={() => toggleSetFacet("statuses", status)}
                  >
                    <span>{statusLabel(status)}</span>
                    <b>{formatNumber(count)}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {error ? <div className="health-error">Search catalog load failed: {error}</div> : null}

      <section className="search-table-shell" aria-label="All tenant search results">
        <div className="search-table-summary">
          <span className="summary-metric primary"><b>{formatNumber(filteredRows.length)}</b><small>filtered</small></span>
          <span className="summary-metric"><b>{formatNumber(allRows.length)}</b><small>loaded</small></span>
          <span className="summary-metric good"><b>{formatNumber(loadedAvailableRows)}</b><small>assets</small></span>
          <span className="summary-metric"><b>{formatNumber(catalog?.metrics?.total ?? allRows.length)}</b><small>matched</small></span>
          <span className="summary-metric"><b>{formatNumber(visibleRows.length)}</b><small>rendered</small></span>
          <span className="summary-metric"><b>{tablePrefs.sort.direction === "desc" ? "newest" : "oldest"}</b><small>sort</small></span>
          {activeMaterializationRows ? <span className="summary-metric attention"><b>{formatNumber(activeMaterializationRows)}</b><small>materializing</small></span> : null}
          {catalog?.nextCursor ? <span className="summary-metric attention"><b>more</b><small>available</small></span> : null}
        </div>
        <div
          ref={searchScrollRef}
          className="search-table-scroll"
          role="grid"
          aria-rowcount={filteredRows.length}
          aria-activedescendant={searchRowDomId(selectedRow)}
          aria-label="Search results. Use arrow keys to move selection and Enter to inspect the selected row."
          tabIndex="0"
          style={tablePinStyles()}
          onKeyDown={handleSearchTableKeyDown}
          onScroll={(event) => {
          const element = event.currentTarget;
          setVirtualViewport({ scrollTop: element.scrollTop, height: element.clientHeight });
          const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 420;
          if (nearBottom && catalog?.nextCursor) {
            loadMoreRows();
          }
        }}>
          <div className="search-table-grid search-table-head" style={{ gridTemplateColumns: gridTemplateColumns() }}>
            {visibleColumns.map((column, index) => (
              <button
                key={column.id}
                type="button"
                className={columnClassName(column, index, [
                  "search-th",
                  column.sortable ? "is-sortable" : "",
                  tablePrefs.sort.column === column.id ? `active sort-${tablePrefs.sort.direction}` : "",
                ].filter(Boolean).join(" "))}
                onClick={() => setSort(column.id)}
                title={sortButtonLabel(column)}
                aria-label={sortButtonLabel(column)}
              >
                <span>{column.label}</span>
                {column.sortable ? (
                  <span className="sort-indicator" aria-hidden="true">
                    {tablePrefs.sort.column === column.id
                      ? tablePrefs.sort.direction === "desc"
                        ? <ArrowDown size={12} />
                        : <ArrowUp size={12} />
                      : <ArrowUpDown size={11} />}
                  </span>
                ) : null}
                <i
                  aria-hidden="true"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    beginColumnResize(column.id, event);
                  }}
                />
              </button>
            ))}
          </div>
          <div className="search-table-body" style={{ minHeight: `${filteredRows.length * SEARCH_ROW_HEIGHT}px` }}>
            {virtualWindow.topPadding ? <div className="search-table-spacer" style={{ height: `${virtualWindow.topPadding}px` }} /> : null}
            {visibleRows.map((row, offset) => {
              const selected = selectedRow?.id === row.id;
              return (
                <div
                  id={searchRowDomId(row)}
                  key={row.id}
                  role="row"
                  className={selected ? "search-table-grid search-row is-selected" : "search-table-grid search-row"}
                  style={{ gridTemplateColumns: gridTemplateColumns() }}
                  aria-rowindex={virtualWindow.startIndex + offset + 1}
                  aria-selected={selected}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => openRow(row)}
                >
                  {visibleColumns.map((column, index) => (
                    <span key={column.id} role="gridcell" className={cellClassName(column, index)} title={searchRowCellTitle(row, column)}>
                      {renderSearchRowCell(row, column)}
                    </span>
                  ))}
                </div>
              );
            })}
            {virtualWindow.bottomPadding ? <div className="search-table-spacer" style={{ height: `${virtualWindow.bottomPadding}px` }} /> : null}
            {!loading && !visibleRows.length ? <p className="empty-state">No search rows match the current facets.</p> : null}
            {loadingMore ? <p className="empty-state">Loading more rows...</p> : null}
          </div>
        </div>
      </section>

      {selectedArchiveLike ? (
        <section className="archive-results archive-compat-panel" aria-label="Archive compatibility result">
          <div className="section-heading">
            <h2>Selected Archive Item</h2>
            <span>Opened from archiveItem URL compatibility state</span>
          </div>
          <div className="archive-result-list">
            <article className="archive-result is-selected">
              <div className="archive-result-topline">
                <span>
                  <span className="status-pill status-neutral">{selectedArchiveItem.kind ?? "archive"}</span>
                  {selectedArchiveItem.status ? <span className={`status-pill status-${statusTone(selectedArchiveItem.status)}`}>{selectedArchiveItem.status}</span> : null}
                </span>
                <button
                    type="button"
                    className="inspect-action"
                    aria-label={`Inspect archive item ${selectedArchiveItem.id}`}
                    aria-pressed="true"
                    title="Inspect archive item"
                    onClick={() => onSelectedArchiveItemChange(selectedArchiveItem)}
                  >
                    <Database size={14} aria-hidden="true" />
                    <span>Selected</span>
                </button>
              </div>
              <strong>{selectedArchiveItem.title ?? selectedArchiveItem.fileName ?? selectedArchiveItem.id}</strong>
              <p>{selectedArchiveItem.id}</p>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ConversationChatViewport() {
  const [filters, setFilters] = useState({
    provider: "chatgpt",
    runtimeProfile: "default",
    limit: "25",
  });
  const [catalog, setCatalog] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationDetail, setConversationDetail] = useState({ loading: false, error: null, result: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const conversations = useMemo(() => flattenConversationEntries(catalog), [catalog]);
  const selectedItem = conversationDetail.result?.item ?? selectedConversation;
  const turns = useMemo(() => extractConversationTurns(selectedItem), [selectedItem]);
  const relatedSources = Array.isArray(selectedItem?.sources) ? selectedItem.sources : [];
  const relatedArtifacts = Array.isArray(selectedItem?.artifacts) ? selectedItem.artifacts : [];
  const relatedFiles = Array.isArray(selectedItem?.files) ? selectedItem.files : [];

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function loadConversations(event) {
    event?.preventDefault();
    const params = new URLSearchParams({
      provider: filters.provider || "chatgpt",
      runtimeProfile: filters.runtimeProfile || "default",
      kind: "conversations",
      limit: filters.limit || "25",
    });
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/v1/account-mirrors/catalog?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const nextConversations = flattenConversationEntries(payload);
      setCatalog(payload);
      setSelectedConversation(nextConversations[0] ?? null);
    } catch (loadError) {
      setError(loadError.message || "Conversation catalog load failed");
      setCatalog(null);
      setSelectedConversation(null);
      setConversationDetail({ loading: false, error: null, result: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedConversation) {
      setConversationDetail({ loading: false, error: null, result: null });
      return undefined;
    }
    const controller = new AbortController();
    let alive = true;
    const params = new URLSearchParams({
      provider: filters.provider || selectedConversation.provider || "chatgpt",
      runtimeProfile: filters.runtimeProfile || selectedConversation.runtimeProfileId || "default",
      kind: "conversations",
    });
    setConversationDetail({ loading: true, error: null, result: null });
    fetch(`/v1/account-mirrors/catalog/items/${encodeURIComponent(selectedConversation.id)}?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        setConversationDetail({ loading: false, error: null, result: payload });
      })
      .catch((detailError) => {
        if (!alive || detailError.name === "AbortError") return;
        setConversationDetail({ loading: false, error: detailError.message || "Conversation detail load failed", result: null });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [filters.provider, filters.runtimeProfile, selectedConversation]);

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Cache-backed chat review</span>
          <h1>Chats</h1>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(error ? "error" : "ok")}`} />
          <strong>Operator access</strong>
          <small>{catalog ? `${formatNumber(conversations.length)} conversations shown` : "/v1/account-mirrors/catalog"}</small>
        </div>
      </div>

      <form className="archive-search-panel chat-filter-panel" onSubmit={loadConversations}>
        <div className="field-row">
          <label htmlFor="chatProvider">Provider</label>
          <input id="chatProvider" value={filters.provider} onChange={(event) => updateFilter("provider", event.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="chatRuntime">Runtime</label>
          <input id="chatRuntime" value={filters.runtimeProfile} onChange={(event) => updateFilter("runtimeProfile", event.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="chatLimit">Limit</label>
          <input id="chatLimit" type="number" min="1" max="100" value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)} />
        </div>
        <button className="primary-action" type="submit" disabled={loading} title="Load conversations" aria-label="Load conversations">
          <MessageSquareText size={16} aria-hidden="true" />
          <span>{loading ? "Loading" : "Load"}</span>
        </button>
      </form>

      {error ? <div className="health-error">Conversation load failed: {error}</div> : null}

      <section className="conversation-workbench" aria-label="Conversation dialog view">
        <div className="conversation-list" aria-label="Cached conversations">
          <div className="section-heading">
            <h2>Conversations</h2>
            <span>{catalog ? `${formatNumber(catalog.metrics?.conversations)} listed` : "No catalog yet"}</span>
          </div>
          <div className="conversation-list-scroll">
            {conversations.map((conversation) => {
              const selected = selectedConversation?.id === conversation.id;
              return (
                <button
                  type="button"
                  key={`${conversation.runtimeProfileId}:${conversation.id}`}
                  className={selected ? "conversation-row is-selected" : "conversation-row"}
                  aria-pressed={selected}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <strong>{compactText(conversation.title ?? conversation.id, 76)}</strong>
                  <span className="conversation-provider-line">
                    <ProviderIcon provider={conversation.provider ?? "provider"} />
                    <span>{conversation.runtimeProfileId ?? "runtime"}</span>
                  </span>
                  <small>{conversation.messageCount ? `${conversation.messageCount} messages` : conversation.hasCachedTranscript ? "cached transcript" : "metadata only"}</small>
                </button>
              );
            })}
            {!catalog ? <p className="empty-state">Load a provider/runtime catalog to review cached conversations.</p> : null}
            {catalog && !conversations.length ? <p className="empty-state">No cached conversations matched this provider/runtime.</p> : null}
          </div>
        </div>

        <article className="chat-dialog" aria-label="Selected conversation transcript">
          {selectedItem ? (
            <>
              <div className="chat-dialog-header">
                <span>
                  <strong>{selectedItem.title ?? selectedItem.id}</strong>
                  <small className="conversation-provider-line">
                    <ProviderIcon provider={selectedItem.provider ?? filters.provider} />
                    <span>{filters.runtimeProfile}</span>
                  </small>
                </span>
                {selectedItem.url ? <a href={selectedItem.url} target="_blank" rel="noreferrer">Provider</a> : null}
              </div>
              {conversationDetail.error ? <div className="health-error">Detail unavailable: {conversationDetail.error}</div> : null}
              {conversationDetail.loading ? <p className="empty-state">Loading cached transcript...</p> : null}
              {turns.length ? (
                <div className="chat-turns">
                  {turns.map((turn, index) => (
                    <section className={`chat-turn chat-turn-${turn.role}`} key={`${turn.id}-${index}`}>
                      <div className="chat-bubble">
                        <div className="chat-bubble-meta">
                          <span>{turn.role}</span>
                          {turn.createdAt ? <time>{formatDateTime(turn.createdAt)}</time> : null}
                        </div>
                        <p>{turn.content}</p>
                      </div>
                    </section>
                  ))}
                </div>
              ) : !conversationDetail.loading ? (
                <div className="empty-state">No cached transcript turns are available for this conversation yet.</div>
              ) : null}
              {(relatedFiles.length || relatedArtifacts.length || relatedSources.length) ? (
                <div className="conversation-related">
                  {relatedFiles.length ? <span>{formatNumber(relatedFiles.length)} files</span> : null}
                  {relatedArtifacts.length ? <span>{formatNumber(relatedArtifacts.length)} artifacts</span> : null}
                  {relatedSources.length ? <span>{formatNumber(relatedSources.length)} sources</span> : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Select a cached conversation to inspect its transcript.</div>
          )}
        </article>
      </section>
    </main>
  );
}

function MainViewport({
  activeNav,
  apiStatus,
  runStatus,
  selectedLiveFollowAccount,
  onSelectedLiveFollowAccountChange,
  selectedArchiveItem,
  onSelectedArchiveItemChange,
  onSelectedArchiveDetailChange,
  selectedSearchRow,
  onSelectedSearchRowChange,
  onSelectedSearchDetailChange,
}) {
  if (activeNav === "chats") {
    return <ConversationChatViewport />;
  }
  if (activeNav === "health") {
    return (
      <HealthViewport
        apiStatus={apiStatus}
        selectedLiveFollowAccount={selectedLiveFollowAccount}
        onSelectedLiveFollowAccountChange={onSelectedLiveFollowAccountChange}
      />
    );
  }
  if (activeNav === "runs") {
    return <RunsViewport runStatus={runStatus} />;
  }
  if (activeNav === "search") {
    return (
      <ArchiveSearchViewport
        apiStatus={apiStatus}
        selectedArchiveItem={selectedArchiveItem}
        onSelectedArchiveItemChange={onSelectedArchiveItemChange}
        onSelectedArchiveDetailChange={onSelectedArchiveDetailChange}
        selectedSearchRow={selectedSearchRow}
        onSelectedSearchRowChange={onSelectedSearchRowChange}
        onSelectedSearchDetailChange={onSelectedSearchDetailChange}
      />
    );
  }

  const content = {
    search: {
      title: "Search Workbench",
      kicker: "Lexical plus semantic retrieval",
      body:
        "Search should cover mirrored chats, AuraCall run archives, uploaded files, generated artifacts, and caller-supplied evidence without requiring browser work.",
      rows: [
        ["Lexical", "Fast exact text, metadata, ids, and file names"],
        ["Semantic", "Embeddings-backed retrieval across text and artifacts"],
        ["Result actions", "Open chat, inspect run, download asset, attach evidence"],
      ],
    },
  }[activeNav] ?? {
    title: "Operator Workbench",
    kicker: "AuraCall",
    body: "Select a workspace surface from the top navigation.",
    rows: [],
  };

  return (
    <main className="viewport" tabIndex="-1">
      <div className="viewport-heading">
        <span>{content.kicker}</span>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
      </div>
      <div className="capability-grid">
        {content.rows.map(([title, detail]) => (
          <article className="capability-card" key={title}>
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </div>
      <section className="timeline-band" aria-label="Implementation sequence">
        <div>
          <strong>First UX slice</strong>
          <p>Static operator shell with persistent layout, route taxonomy, and inspector surfaces.</p>
        </div>
        <div>
          <strong>Next integration</strong>
          <p>Typed API client for health, runs, archive search, and account mirror status.</p>
        </div>
      </section>
    </main>
  );
}

function LeftPane({ activeNav, apiStatus, runStatus }) {
  const status = apiStatus.status;
  if (activeNav === "health" && status) {
    const liveFollow = status.liveFollow ?? {};
    const targets = liveFollow.targets ?? {};
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "API service",
            meta: `${status.binding?.host ?? "127.0.0.1"}:${status.binding?.port ?? "unknown"} / ${status.auth?.keyCount ?? 0} keys`,
            status: status.ok ? "good" : "bad",
          },
          {
            title: "Live follow",
            meta: `${targets.enabled ?? 0} enabled, ${targets.running ?? 0} running, ${targets.attentionNeeded ?? 0} attention`,
            status: statusTone(liveFollow.severity),
          },
          {
            title: "Routes",
            meta: "Dashboard",
            route: status.serviceDiscovery?.local?.dashboardUrl ?? "/dashboard",
            status: "good",
          },
        ]}
      />
    );
  }
  if (activeNav === "runs" && runStatus.status) {
    const recovery = runStatus.status.recoverySummary ?? {};
    const localClaim = runStatus.status.localClaimSummary ?? {};
    const metrics = localClaim.metrics ?? {};
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "Recovery scan",
            meta: `${recovery.totalRuns ?? 0} total, ${(recovery.reclaimableRunIds ?? []).length} reclaimable`,
            status: statusTone((recovery.strandedRunIds ?? []).length ? "attention" : "healthy"),
          },
          {
            title: "Local claim",
            meta: `${metrics.selectedCount ?? 0} selected, ${metrics.notReadyCount ?? 0} not ready`,
            status: statusTone((metrics.blockedCount ?? 0) ? "blocked" : "waiting"),
          },
          {
            title: "Deep inspection",
            meta: "Same-origin operator runtime run APIs",
            status: "warn",
          },
        ]}
      />
    );
  }
  if (activeNav === "search" && status) {
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "Archive route",
            meta: "Archive",
            route: status.routes?.runArchive ?? "/v1/archive",
            status: "good",
          },
          {
            title: "Operator access",
            meta: "Same-origin dashboard superuser",
            status: "good",
          },
          {
            title: "Assets",
            meta: "Detail and asset links use protected archive routes",
            status: "good",
            statusLabel: "live",
          },
        ]}
      />
    );
  }

  const datasets = {
    chats: [
      { title: "Recent conversations", meta: "Provider cache and project-bound runs", status: "good", statusLabel: "live" },
      { title: "Artifacts", meta: "Generated files and upload references", status: "good", statusLabel: "live" },
      { title: "Conversation filters", meta: "Provider, tenant, project, model", status: "good", statusLabel: "ready" },
    ],
    search: [
      { title: "All indexed content", meta: "Archive, mirrors, artifacts, evidence", status: "good", statusLabel: "live" },
      { title: "Saved filters", meta: "Operator-owned search presets", status: "neutral", statusLabel: "local" },
      { title: "Dedupe keys", meta: "UUID, checksum, provider ids", status: "good", statusLabel: "tracked" },
    ],
    runs: [
      { title: "Active work", meta: "Responses, batches, live follow", status: "good", statusLabel: "live" },
      { title: "Queues", meta: "Priority, cooldowns, dispatcher locks", status: "good", statusLabel: "guarded" },
      { title: "Algorithms", meta: "Course grading, transcript enrichment", status: "neutral", statusLabel: "scoped" },
    ],
    health: [
      { title: "Service surfaces", meta: "API, MCP, scheduler, archive", status: "good", statusLabel: "live" },
      { title: "Browser profiles", meta: "Identity, auth, DOM drift, locks", status: "good", statusLabel: "managed" },
      { title: "Provider guards", meta: "Bot gates, rate limits, status probes", status: "good", statusLabel: "guarded" },
    ],
  };
  return <SectionList title="Context" items={datasets[activeNav]} />;
}

function ArchiveAssetPreview({ item }) {
  const [asset, setAsset] = useState(null);
  const [materializedItem, setMaterializedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [materializationJob, setMaterializationJob] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [error, setError] = useState(null);
  const [controlResult, setControlResult] = useState(null);
  const [lookupResult, setLookupResult] = useState(null);
  const effectiveItem = materializedItem ?? item;
  const assetRoute = archiveItemAssetRoute(effectiveItem);
  const canFetch = Boolean(assetRoute);
  const lookupRoute = archiveItemAssetLookupRoute(effectiveItem);
  const materializeRoute = archiveItemMaterializeRoute(effectiveItem);
  const materializationCreateRoute = archiveMaterializationCreateRoute();
  const materializationJobsRoute = archiveMaterializationJobsRoute(effectiveItem);
  const materializationJobRoute = archiveMaterializationJobRoute(materializationJob);
  const activeMaterializationJob = isActiveArchiveMaterializationJob(materializationJob);
  const canCancelMaterializationJob = materializationJob?.status === "queued";

  useEffect(() => {
    setAsset((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setMaterializedItem(null);
    setLoading(false);
    setRefreshing(false);
    setLookupLoading(false);
    setMaterializing(false);
    setMaterializationJob(null);
    setJobLoading(false);
    setError(null);
    setControlResult(null);
    setLookupResult(null);
  }, [item?.id]);

  useEffect(() => () => {
    if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl);
  }, [asset?.objectUrl]);

  useEffect(() => {
    if (!item?.id || canFetch) return;
    void loadLatestMaterializationJob();
  }, [item?.id, canFetch]);

  useEffect(() => {
    if (!materializationJob?.id || !activeMaterializationJob) return;
    const interval = window.setInterval(() => {
      void refreshMaterializationJob(materializationJob.id, { silent: true });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [materializationJob?.id, activeMaterializationJob]);

  async function fetchAsset() {
    if (!assetRoute) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(assetRoute, {
        cache: "no-store",
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text ? compactText(text, 160) : `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const mimeType = response.headers.get("content-type") ?? effectiveItem.mimeType ?? blob.type;
      const fileName = fileNameFromDisposition(response.headers.get("content-disposition")) ?? effectiveItem.fileName ?? effectiveItem.title ?? effectiveItem.id;
      const objectUrl = URL.createObjectURL(blob);
      let textPreview = null;
      if (blob.size <= 256 * 1024 && isPreviewableText(mimeType, fileName)) {
        textPreview = compactText(await blob.text(), 5000);
      }
      setAsset((current) => {
        if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
        return {
          objectUrl,
          mimeType,
          fileName,
          size: blob.size,
          textPreview,
        };
      });
    } catch (assetError) {
      setError(assetError.message || "Asset fetch failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshArchiveIndex() {
    setRefreshing(true);
    setError(null);
    setControlResult(null);
    try {
      const response = await fetch("/v1/archive/backfill", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setControlResult({
        tone: "ok",
        message: `Archive refreshed: ${formatNumber(payload?.index?.itemCount ?? 0)} indexed items`,
      });
    } catch (assetError) {
      setControlResult({
        tone: "bad",
        message: assetError.message || "Archive refresh failed",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function lookupArchiveAsset() {
    if (!lookupRoute) return;
    setLookupLoading(true);
    setError(null);
    setLookupResult(null);
    try {
      const response = await fetch(lookupRoute, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      setLookupResult(payload);
    } catch (assetError) {
      setLookupResult({
        error: assetError.message || "Archive asset lookup failed",
      });
    } finally {
      setLookupLoading(false);
    }
  }

  function applyMaterializationJob(job, options = {}) {
    if (!job) return;
    setMaterializationJob(job);
    if (job.result?.item) {
      setMaterializedItem(job.result.item);
    }
    if (options.quiet) return;
    const message = job.result?.message ?? job.error?.message ?? `Materialization job ${job.status}`;
    setControlResult({
      tone: archiveMaterializationStatusTone(job.status),
      message,
    });
  }

  async function loadLatestMaterializationJob(options = {}) {
    const route = archiveMaterializationJobsRoute(item, 1);
    if (!route) return;
    if (!options.silent) setJobLoading(true);
    try {
      const response = await fetch(route, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.jobs?.[0] ?? null;
      if (job) applyMaterializationJob(job, { quiet: true });
    } catch (assetError) {
      if (!options.silent) {
        setControlResult({
          tone: "bad",
          message: assetError.message || "Materialization job lookup failed",
        });
      }
    } finally {
      if (!options.silent) setJobLoading(false);
    }
  }

  async function refreshMaterializationJob(jobId, options = {}) {
    const route = archiveMaterializationJobRoute(jobId);
    if (!route) return;
    if (!options.silent) setJobLoading(true);
    try {
      const response = await fetch(route, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      applyMaterializationJob(payload?.job ?? payload, { quiet: options.silent && isActiveArchiveMaterializationJob(payload?.job ?? payload) });
    } catch (assetError) {
      if (!options.silent) {
        setControlResult({
          tone: "bad",
          message: assetError.message || "Materialization job refresh failed",
        });
      }
    } finally {
      if (!options.silent) setJobLoading(false);
    }
  }

  async function materializeArchiveAsset() {
    if (!effectiveItem?.id) return;
    setMaterializing(true);
    setError(null);
    setControlResult(null);
    try {
      const response = await fetch(materializationCreateRoute, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archiveItemId: effectiveItem.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? null;
      if (job) applyMaterializationJob(job, { quiet: true });
      setControlResult({
        tone: payload?.reused ? "warn" : "ok",
        message: payload?.reused ? `Using existing ${job?.status ?? "active"} materialization job` : `Queued materialization job ${job?.id ?? ""}`.trim(),
      });
    } catch (assetError) {
      setControlResult({
        tone: "bad",
        message: assetError.message || "Archive materialization failed",
      });
    } finally {
      setMaterializing(false);
    }
  }

  async function cancelMaterializationJob() {
    if (!materializationJobRoute) return;
    setJobLoading(true);
    setControlResult(null);
    try {
      const response = await fetch(materializationJobRoute, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const job = payload?.job ?? payload;
      applyMaterializationJob(job, { quiet: true });
      setControlResult({
        tone: "warn",
        message: `Cancelled materialization job ${job?.id ?? ""}`.trim(),
      });
    } catch (assetError) {
      setControlResult({
        tone: "bad",
        message: assetError.message || "Materialization cancellation failed",
      });
      await loadLatestMaterializationJob({ silent: true });
    } finally {
      setJobLoading(false);
    }
  }

  if (!item) return null;

  return (
    <section className="asset-preview" aria-label="Selected archive asset preview">
      <div className="asset-preview-head">
        <span>
          <FileText size={15} aria-hidden="true" />
          <strong>Asset</strong>
        </span>
        <button
          type="button"
          className="icon-label-button"
          disabled={!canFetch || loading}
          title={canFetch ? "Fetch archived asset" : "No local asset available"}
          onClick={fetchAsset}
        >
          <Download size={14} aria-hidden="true" />
          <span>{loading ? "Fetching" : "Fetch"}</span>
        </button>
      </div>
      <dl className="asset-facts">
        <div><dt>Available</dt><dd>{canFetch ? "yes" : "no"}</dd></div>
        <div><dt>Name</dt><dd>{asset?.fileName ?? effectiveItem.fileName ?? effectiveItem.title ?? "none"}</dd></div>
        <div><dt>Type</dt><dd>{asset?.mimeType ?? effectiveItem.mimeType ?? "unknown"}</dd></div>
        <div><dt>Size</dt><dd>{asset ? `${formatNumber(asset.size)} bytes` : "not fetched"}</dd></div>
      </dl>
      {error ? <div className="asset-error">Asset fetch failed: {error}</div> : null}
      {!canFetch ? (
        <div className="asset-missing-controls" aria-label="Missing asset controls">
          <div className="asset-missing-copy">
            <strong>Missing local asset</strong>
            <span>{assetMissingReason(effectiveItem)}</span>
          </div>
          <div className="asset-actions">
            <button type="button" disabled={refreshing} onClick={refreshArchiveIndex}>
              <RefreshCcw size={13} aria-hidden="true" />
              <span>{refreshing ? "Refreshing" : "Backfill"}</span>
            </button>
            <button type="button" disabled={!lookupRoute || lookupLoading} onClick={lookupArchiveAsset}>
              <Search size={13} aria-hidden="true" />
              <span>{lookupLoading ? "Checking" : "Lookup"}</span>
            </button>
            <button type="button" disabled={!effectiveItem?.id || materializing || activeMaterializationJob} onClick={materializeArchiveAsset}>
              <Download size={13} aria-hidden="true" />
              <span>{materializing ? "Queuing" : activeMaterializationJob ? materializationJob.status : "Materialize"}</span>
            </button>
            <button type="button" disabled={!canCancelMaterializationJob || jobLoading} onClick={cancelMaterializationJob}>
              <Trash2 size={13} aria-hidden="true" />
              <span>{jobLoading && canCancelMaterializationJob ? "Cancelling" : "Cancel"}</span>
            </button>
          </div>
          {materializationJob ? (
            <div className={`asset-job-status asset-job-${archiveMaterializationStatusTone(materializationJob.status)}`}>
              <div className="asset-job-head">
                <strong>{materializationJob.status}</strong>
                <span>{materializationJob.updatedAt ? `Updated ${formatDateTime(materializationJob.updatedAt)}` : materializationJob.id}</span>
              </div>
              <span>{materializationJob.result?.message ?? materializationJob.error?.message ?? `Job ${materializationJob.id}`}</span>
            </div>
          ) : null}
          <div className="inspector-actions search-kind-actions">
            {effectiveItem.uri ? <RouteChip value={effectiveItem.uri} label="Provider URI" /> : null}
            {effectiveItem.links?.response ? <RouteChip value={effectiveItem.links.response} label="Response" /> : null}
            {effectiveItem.providerConversationUrl ? <RouteChip value={effectiveItem.providerConversationUrl} label="Provider Chat" /> : null}
            {lookupRoute ? <RouteChip value={lookupRoute} label="Asset Lookup" /> : null}
            {materializationJobsRoute ? <RouteChip value={materializationJobsRoute} label="Materialization Jobs" /> : null}
            {materializationJobRoute ? <RouteChip value={materializationJobRoute} label="Materialization Job" /> : null}
            {materializeRoute ? <RouteChip value={materializeRoute} label="Foreground Materialize" /> : null}
          </div>
        </div>
      ) : null}
      {controlResult ? (
        <div className={`asset-control-result asset-control-${controlResult.tone}`}>
          {controlResult.message}
        </div>
      ) : null}
      {lookupResult ? (
        <div className="asset-lookup-result">
          {lookupResult.error ? (
            <span>Lookup failed: {lookupResult.error}</span>
          ) : (
            <>
              <span>
                Lookup found {formatNumber(lookupResult.metrics?.total ?? 0)} item{lookupResult.metrics?.total === 1 ? "" : "s"};
                {" "}{formatNumber(lookupResult.metrics?.fileAvailable ?? 0)} with local assets.
              </span>
              <div className="inspector-actions search-kind-actions">
                {(lookupResult.items ?? []).slice(0, 4).map((resultItem) => (
                  <RouteChip key={resultItem.id} value={archiveItemRoute(resultItem)} label={compactText(resultItem.title ?? resultItem.fileName ?? resultItem.id, 28)} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
      {asset ? (
        <div className="asset-actions">
          <a href={asset.objectUrl} target="_blank" rel="noreferrer">Open</a>
          <a href={asset.objectUrl} download={asset.fileName}>Download</a>
        </div>
      ) : null}
      {asset?.mimeType?.startsWith("image/") ? <img className="asset-image-preview" src={asset.objectUrl} alt="" /> : null}
      {asset?.mimeType === "application/pdf" ? <iframe className="asset-frame-preview" title="Asset PDF preview" src={asset.objectUrl} /> : null}
      {asset?.textPreview ? (
        <pre className="asset-text-preview">{asset.textPreview}</pre>
      ) : null}
    </section>
  );
}

function RightPane({
  activeNav,
  apiStatus,
  runStatus,
  selectedLiveFollowAccount,
  selectedArchiveItem,
  selectedArchiveDetail,
  selectedSearchRow,
  selectedSearchDetail,
}) {
  const labels = {
    chats: "Conversation inspector",
    search: "Result inspector",
    runs: "Run inspector",
    health: "Health inspector",
  };
  const status = apiStatus.status;
  const runs = runStatus.status;
  const selectedMirrorStatusEntry = findMirrorStatusEntry(status, selectedLiveFollowAccount);
  const selectedLiveFollowCounts = selectedLiveFollowAccount?.metadataCounts ?? selectedMirrorStatusEntry?.metadataCounts ?? {};
  const selectedLiveFollowGuard = selectedLiveFollowAccount?.providerGuard ?? selectedMirrorStatusEntry?.providerGuard ?? {};
  const selectedLiveFollowCompletionRoute = liveFollowAccountCompletionRoute(selectedLiveFollowAccount);
  const fetchedSearchItem = selectedSearchDetail?.result?.item ?? null;
  const inspectedSearchArchiveItem = fetchedSearchItem?.object === "run_archive_item" ? fetchedSearchItem : null;
  const inspectedSearchRow = selectedSearchDetail?.result?.item
    ? {
        ...selectedSearchRow,
        raw: selectedSearchDetail.result.item,
        title: selectedSearchDetail.result.item.title ?? selectedSearchRow?.title,
      }
    : selectedSearchRow;
  const inspectedArchiveItem = selectedArchiveDetail?.result?.item ?? selectedArchiveItem ?? inspectedSearchArchiveItem;
  const selectedArchiveDetails = inspectedArchiveItem
    ? [
        ["Kind", inspectedArchiveItem.kind ?? "unknown"],
        ["Status", inspectedArchiveItem.status ?? "none"],
        ["Provider", inspectedArchiveItem.provider ? <ProviderIcon provider={inspectedArchiveItem.provider} /> : "none"],
        ["Runtime", inspectedArchiveItem.runtimeProfile ?? "none"],
        ["Project", inspectedArchiveItem.projectId ?? "none"],
        ["File", inspectedArchiveItem.fileName ?? inspectedArchiveItem.mimeType ?? "none"],
        ["Agent", inspectedArchiveItem.agentId ?? "none"],
        ["Updated", formatDateTime(inspectedArchiveItem.updatedAt)],
      ]
    : null;
  const details =
    activeNav === "health" && status && selectedLiveFollowAccount
      ? [
          ["Account", <span className="detail-provider-line"><ProviderIcon provider={selectedLiveFollowAccount.provider} /><span>{selectedLiveFollowAccount.runtimeProfileId ?? "unknown"}</span></span>],
          ["Mirror status", { kind: "route", value: liveFollowAccountStatusRoute(selectedLiveFollowAccount), label: "Status" }],
          ["Catalog", { kind: "route", value: liveFollowAccountCatalogRoute(selectedLiveFollowAccount), label: "Catalog" }],
          ...(selectedLiveFollowCompletionRoute
            ? [["Completion", { kind: "route", value: selectedLiveFollowCompletionRoute, label: selectedLiveFollowAccount.activeCompletionId }]]
            : []),
          ["Tenant key", selectedMirrorStatusEntry?.tenantKey ?? selectedLiveFollowAccount.tenantKey ?? "unbound"],
          ["Binding key", selectedMirrorStatusEntry?.bindingKey ?? selectedLiveFollowAccount.bindingKey ?? "not reported"],
          ["Desired", statusLabel(selectedLiveFollowAccount.desiredState ?? selectedMirrorStatusEntry?.liveFollow?.state)],
          ["Actual", statusLabel(selectedLiveFollowAccount.actualStatus ?? selectedMirrorStatusEntry?.status)],
          ["Reason", statusLabel(selectedLiveFollowAccount.statusReason ?? selectedMirrorStatusEntry?.reason)],
          ["Expected identity", selectedMirrorStatusEntry?.expectedIdentityKey ?? "not reported"],
          ["Detected identity", selectedMirrorStatusEntry?.detectedIdentityKey ?? "not reported"],
          ["Account level", selectedMirrorStatusEntry?.accountLevel ?? "not reported"],
          ["Browser profile", selectedMirrorStatusEntry?.browserProfileId ?? "not reported"],
          ["Guard", selectedLiveFollowGuard.summary ?? selectedLiveFollowGuard.state ?? "clear"],
          ["Next attempt", formatDateTime(selectedLiveFollowAccount.nextAttemptAt ?? selectedMirrorStatusEntry?.eligibleAt)],
          ["Last success", formatDateTime(selectedMirrorStatusEntry?.lastSuccessAt)],
          ["Last failure", formatDateTime(selectedMirrorStatusEntry?.lastFailureAt)],
        ]
      : activeNav === "health" && status
      ? [
          ["Source", { kind: "route", value: "/status" }],
          ["Service", status.process?.service ?? "auracall-api.service"],
          ["Route", { kind: "route", value: status.routes?.operatorBrowserDashboardUrl ?? status.routes?.operatorBrowserDashboard ?? "/dashboard", label: "Dashboard" }],
          ["Debug", { kind: "route", value: status.routes?.operatorDebugDashboard ?? "/ops/browser", label: "Debug" }],
        ]
      : activeNav === "search" && selectedArchiveDetails
        ? selectedArchiveDetails
      : activeNav === "search" && inspectedSearchRow
        ? [
            ["Kind", inspectedSearchRow.kind ?? "unknown"],
            ["Provider", inspectedSearchRow.provider ? <ProviderIcon provider={inspectedSearchRow.provider} /> : "none"],
            ["Tenant", inspectedSearchRow.boundIdentityKey ?? "unbound"],
            ["Tenant key", inspectedSearchRow.tenantKey ?? "unbound"],
            ["Binding key", inspectedSearchRow.bindingKey ?? "not reported"],
            ["Runtime", inspectedSearchRow.runtimeProfileId ?? "none"],
            ["Project", inspectedSearchRow.project ?? "none"],
            ["Status", statusLabel(inspectedSearchRow.status)],
            ["Messages", inspectedSearchRow.messageCount ?? "not reported"],
            ["Files", `${formatNumber(inspectedSearchRow.fileCount ?? 0)} files / ${formatNumber(inspectedSearchRow.artifactCount ?? 0)} artifacts`],
            ["Catalog", { kind: "route", value: inspectedSearchRow.catalogItemRoute, label: "Catalog Item" }],
            ["Archive", { kind: "route", value: inspectedSearchRow.archiveItemRoute, label: "Archive Item" }],
            ["Updated", formatDateTime(inspectedSearchRow.updatedAt)],
          ]
      : activeNav === "search" && status
        ? [
            ["Source", { kind: "route", value: status.routes?.runArchive ?? "/v1/archive", label: "Archive" }],
            ["Auth", "Dashboard superuser"],
            ["Scope", "Same-origin operator UX"],
            ["Mode", "Read-only archive search"],
          ]
      : activeNav === "runs" && runs
        ? [
            ["Source", { kind: "route", value: "/status?recovery=true&sourceKind=all", label: "/status" }],
            ["Recent runs", { kind: "route", value: runs.routes?.runtimeRunsRecent ?? "/v1/runtime-runs/recent", label: "/v1/runtime-runs/recent" }],
            ["Inspect", { kind: "route", value: runs.routes?.runtimeRunInspection ?? "/v1/runtime-runs/inspect", label: "/v1/runtime-runs/inspect" }],
            ["Auth", "Dashboard superuser"],
          ]
      : [
          ["Source of truth", "AuraCall JSON API"],
          ["Mode", "Read-only shell scaffold"],
          ["Debug dashboard", "Keep existing surface for low-level probes"],
        ];
  const preview =
    activeNav === "health" && status && selectedLiveFollowAccount
      ? {
          account: {
            provider: selectedLiveFollowAccount.provider,
            runtimeProfileId: selectedLiveFollowAccount.runtimeProfileId,
            browserProfileId: selectedMirrorStatusEntry?.browserProfileId,
            expectedIdentityKey: selectedMirrorStatusEntry?.expectedIdentityKey,
            detectedIdentityKey: selectedMirrorStatusEntry?.detectedIdentityKey,
            accountLevel: selectedMirrorStatusEntry?.accountLevel,
          },
          state: {
            desired: selectedLiveFollowAccount.desiredState,
            actual: selectedLiveFollowAccount.actualStatus,
            reason: selectedLiveFollowAccount.statusReason ?? selectedMirrorStatusEntry?.reason,
            activeCompletionId: selectedLiveFollowAccount.activeCompletionId ?? null,
            nextAttemptAt: selectedLiveFollowAccount.nextAttemptAt ?? selectedMirrorStatusEntry?.eligibleAt,
          },
          guard: {
            state: selectedLiveFollowGuard.state,
            kind: selectedLiveFollowGuard.kind,
            cooldownUntil: selectedLiveFollowGuard.cooldownUntil,
            summary: selectedLiveFollowGuard.summary,
          },
          counts: {
            conversations: selectedLiveFollowCounts.conversations ?? 0,
            artifacts: selectedLiveFollowCounts.artifacts ?? 0,
            files: selectedLiveFollowCounts.files ?? 0,
            media: selectedLiveFollowCounts.media ?? 0,
          },
          mirrorCompleteness: selectedLiveFollowAccount.mirrorCompleteness ?? selectedMirrorStatusEntry?.mirrorCompleteness?.state,
        }
      : activeNav === "health" && status
      ? {
          ok: status.ok,
          port: status.binding?.port,
          liveFollow: {
            severity: status.liveFollow?.severity,
            active: status.liveFollow?.activeCompletions,
            attention: status.liveFollow?.targets?.attentionNeeded,
          },
        }
      : activeNav === "search" && inspectedArchiveItem
        ? selectedArchiveSummary(inspectedArchiveItem)
      : activeNav === "search" && inspectedSearchRow
        ? {
            id: inspectedSearchRow.id,
            source: inspectedSearchRow.source,
            kind: inspectedSearchRow.kind,
            title: inspectedSearchRow.title,
            provider: inspectedSearchRow.provider,
            tenant: inspectedSearchRow.boundIdentityKey,
            runtimeProfileId: inspectedSearchRow.runtimeProfileId,
            status: inspectedSearchRow.status,
            counts: {
              messages: inspectedSearchRow.messageCount ?? null,
              files: inspectedSearchRow.fileCount ?? 0,
              artifacts: inspectedSearchRow.artifactCount ?? 0,
            },
            itemId: inspectedSearchRow.itemId,
            routes: {
              catalogItem: inspectedSearchRow.catalogItemRoute,
              archiveItem: inspectedSearchRow.archiveItemRoute,
              provider: inspectedSearchRow.url ?? null,
            },
          }
      : activeNav === "search" && status
        ? {
            route: status.routes?.runArchive,
            authRequired: status.auth?.required,
            keyCount: status.auth?.keyCount,
            mutable: false,
          }
      : activeNav === "runs" && runs
        ? {
            totalRuns: runs.recoverySummary?.totalRuns,
            reclaimable: runs.recoverySummary?.reclaimableRunIds?.length,
            stranded: runs.recoverySummary?.strandedRunIds?.length,
            selected: runs.localClaimSummary?.metrics?.selectedCount,
            activeRunners: runs.runnerTopology?.metrics?.activeRunnerCount,
          }
      : { route: activeNav, mutable: false };
  const showDetailsList = !(activeNav === "search" && (inspectedSearchRow || inspectedArchiveItem));
  const hasSearchSelection = activeNav === "search" && (inspectedSearchRow || inspectedArchiveItem);

  return (
    <aside className="inspector-body" aria-label={labels[activeNav]}>
      <div className="inspector-header">
        <Database size={18} />
        <span>{labels[activeNav]}</span>
      </div>
      {showDetailsList ? (
        <dl>
          {details.map(([term, detail]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>
                <DetailValue detail={detail} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {activeNav === "health" && selectedLiveFollowAccount ? (
        <div className="inspector-actions" aria-label="Selected live-follow account links">
          <RouteChip value={liveFollowAccountStatusRoute(selectedLiveFollowAccount)} label="Mirror Status" />
          <RouteChip value={liveFollowAccountCatalogRoute(selectedLiveFollowAccount)} label="Catalog" />
          {selectedLiveFollowCompletionRoute ? <RouteChip value={selectedLiveFollowCompletionRoute} label="Completion" /> : null}
        </div>
      ) : null}
      {activeNav === "search" && selectedArchiveItem ? (
        <div className={`inspector-status inspector-status-${selectedArchiveDetail?.error ? "bad" : selectedArchiveDetail?.loading ? "warn" : "good"}`}>
          <span className={`state-dot state-${selectedArchiveDetail?.error ? "bad" : selectedArchiveDetail?.loading ? "warn" : "good"}`} />
          <span>
            <strong>{selectedArchiveDetail?.error ? "Detail unavailable" : selectedArchiveDetail?.loading ? "Loading detail" : "Detail loaded"}</strong>
            <small>{selectedArchiveDetail?.error ?? (selectedArchiveDetail?.updatedAt ? formatDateTime(selectedArchiveDetail.updatedAt) : "Using selected result summary")}</small>
          </span>
        </div>
      ) : null}
      {activeNav === "search" && selectedSearchRow ? (
        <div className={`inspector-status inspector-status-${selectedSearchDetail?.error ? "bad" : selectedSearchDetail?.loading ? "warn" : "good"}`}>
          <span className={`state-dot state-${selectedSearchDetail?.error ? "bad" : selectedSearchDetail?.loading ? "warn" : "good"}`} />
          <span>
            <strong>{selectedSearchDetail?.error ? "Detail unavailable" : selectedSearchDetail?.loading ? "Loading detail" : "Search row selected"}</strong>
            <small>{selectedSearchDetail?.error ?? (selectedSearchDetail?.updatedAt ? formatDateTime(selectedSearchDetail.updatedAt) : selectedSearchRow.id)}</small>
          </span>
        </div>
      ) : null}
      {hasSearchSelection ? (
        <SearchInspectorSummary row={inspectedSearchRow} archiveItem={inspectedArchiveItem} />
      ) : null}
      {hasSearchSelection ? (
        <SearchRouteSection row={inspectedSearchRow} archiveItem={inspectedArchiveItem} />
      ) : null}
      {hasSearchSelection ? (
        <RunSearchInspector row={inspectedSearchRow} archiveItem={inspectedArchiveItem} />
      ) : null}
      {hasSearchSelection ? (
        <EvidenceSearchInspector row={inspectedSearchRow} archiveItem={inspectedArchiveItem} />
      ) : null}
      {activeNav === "search" && inspectedArchiveItem ? (
        <ArchiveAssetPreview item={inspectedArchiveItem} />
      ) : null}
      <RawPreviewSection preview={preview} collapsed={hasSearchSelection} />
    </aside>
  );
}

export default function App() {
  const [layout, setLayout] = useState(readLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLiveFollowAccount, setSelectedLiveFollowAccount] = useState(readLiveFollowAccountFromUrl);
  const [selectedArchiveItem, setSelectedArchiveItem] = useState(readArchiveItemFromUrl);
  const [selectedArchiveDetail, setSelectedArchiveDetail] = useState(emptyArchiveDetailState);
  const [selectedSearchRow, setSelectedSearchRow] = useState(readSearchRowFromUrl);
  const [selectedSearchDetail, setSelectedSearchDetail] = useState(null);
  const [dismissedSearchInspectorKey, setDismissedSearchInspectorKey] = useState(null);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const dragRef = useRef(null);
  const apiStatus = useApiStatus();
  const runStatus = useRunRecoveryStatus();
  const selectedSearchInspectorKey = layout.activeNav === "search"
    ? selectedSearchRow?.id
      ? `row:${selectedSearchRow.id}`
      : selectedArchiveItem?.id
        ? `archive:${selectedArchiveItem.id}`
        : null
    : null;
  const rightPaneHasSelection = Boolean(selectedSearchInspectorKey);
  const rightPaneToggleLabel = rightPaneHasSelection && !layout.rightCollapsed
    ? "Close selected Search inspector"
    : layout.rightCollapsed
      ? "Expand right pane"
      : "Collapse right pane";
  const closeSelectedSearchInspector = () => {
    if (!rightPaneHasSelection) return;
    setDismissedSearchInspectorKey(selectedSearchInspectorKey);
    setLayout((current) => ({ ...current, rightCollapsed: true }));
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    replaceUrlParams({ nav: layout.activeNav === DEFAULT_LAYOUT.activeNav ? null : layout.activeNav });
  }, [layout.activeNav]);

  useEffect(() => {
    if (layout.activeNav !== "health") return;
    replaceUrlParams({
      nav: "health",
      provider: selectedLiveFollowAccount?.provider ?? null,
      runtime: selectedLiveFollowAccount?.runtimeProfileId ?? null,
      runtimeProfile: null,
      archiveItem: null,
    });
  }, [layout.activeNav, selectedLiveFollowAccount]);

  useEffect(() => {
    if (layout.activeNav !== "search") return;
    replaceUrlParams({
      nav: "search",
      archiveItem: selectedArchiveItem?.id ? base64UrlEncodeText(selectedArchiveItem.id) : null,
      row: selectedSearchRow?.id ? base64UrlEncodeText(selectedSearchRow.id) : null,
      provider: null,
      runtime: null,
      runtimeProfile: null,
    });
  }, [layout.activeNav, selectedArchiveItem?.id, selectedSearchRow?.id]);

  useEffect(() => {
    if (!rightPaneHasSelection || !layout.rightCollapsed || layout.activeNav !== "search") return;
    if (selectedSearchInspectorKey === dismissedSearchInspectorKey) return;
    const compactViewport = window.matchMedia?.("(max-width: 980px)").matches ?? window.innerWidth <= 980;
    if (!compactViewport) return;
    setLayout((current) => (current.rightCollapsed ? { ...current, rightCollapsed: false } : current));
  }, [dismissedSearchInspectorKey, layout.activeNav, layout.rightCollapsed, rightPaneHasSelection, selectedSearchInspectorKey]);

  useEffect(() => {
    if (!rightPaneHasSelection || layout.rightCollapsed || layout.activeNav !== "search") return;
    const compactViewport = window.matchMedia?.("(max-width: 980px)").matches ?? window.innerWidth <= 980;
    if (!compactViewport) return;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSelectedSearchInspector();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layout.activeNav, layout.rightCollapsed, rightPaneHasSelection, selectedSearchInspectorKey]);

  useEffect(() => {
    if (layout.activeNav === "health" || layout.activeNav === "search") return;
    replaceUrlParams({
      provider: null,
      runtime: null,
      runtimeProfile: null,
      archiveItem: null,
      row: null,
      q: null,
      kind: null,
      assets: null,
      materialization: null,
      searchProvider: null,
      searchStatus: null,
    });
  }, [layout.activeNav]);

  useEffect(() => {
    function onPopState() {
      const params = readUrlParams();
      const activeNav = params.get("nav");
      setLayout((current) => ({
        ...current,
        ...(NAV_ITEMS.some((item) => item.id === activeNav) ? { activeNav } : { activeNav: DEFAULT_LAYOUT.activeNav }),
      }));
      setSelectedLiveFollowAccount(readLiveFollowAccountFromUrl());
      setSelectedArchiveItem(readArchiveItemFromUrl());
      setSelectedArchiveDetail(emptyArchiveDetailState());
      setSelectedSearchRow(readSearchRowFromUrl());
      setSelectedSearchDetail(null);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onPointerMove(event) {
      if (!dragRef.current) return;
      const { pane } = dragRef.current;
      if (pane === "left") {
        setLayout((current) => ({
          ...current,
          leftWidth: clamp(event.clientX, 232, 440),
        }));
      }
      if (pane === "right") {
        setLayout((current) => ({
          ...current,
          rightWidth: clamp(window.innerWidth - event.clientX, 280, 520),
        }));
      }
    }

    function onPointerUp() {
      dragRef.current = null;
      document.body.classList.remove("is-resizing-pane");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.id === layout.activeNav) ?? NAV_ITEMS[0],
    [layout.activeNav],
  );

  function beginResize(pane) {
    dragRef.current = { pane };
    document.body.classList.add("is-resizing-pane");
  }

  function setActiveNav(activeNav) {
    setLayout((current) => ({ ...current, activeNav }));
    setMobileLeftOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label={mobileLeftOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileLeftOpen}
            onClick={() => setMobileLeftOpen((open) => !open)}
          >
            <Menu size={18} />
          </button>
          <span>AuraCall</span>
        </div>
        <nav className="topnav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={item.id === layout.activeNav ? "nav-item is-active" : "nav-item"}
                type="button"
                key={item.id}
                aria-label={item.label}
                title={item.label}
                onClick={() => setActiveNav(item.id)}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="account-wrap">
          <button
            className="account-chip"
            type="button"
            aria-label={`Operator menu, ${activeItem.label}`}
            title="Operator menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="avatar">AC</span>
            <span className="account-copy">
              <strong>Operator</strong>
              <small>{activeItem.label}</small>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="account-menu" role="menu">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button type="button" key={item.label} role="menuitem" title={item.label}>
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <div
        className="workbench"
        style={{
          "--left-width": `${layout.leftWidth}px`,
          "--right-width": `${layout.rightWidth}px`,
        }}
      >
        {mobileLeftOpen ? (
          <button
            className="mobile-pane-backdrop"
            type="button"
            aria-label="Close context pane"
            onClick={() => setMobileLeftOpen(false)}
          />
        ) : null}

        <aside className={[
          "pane",
          "left-pane",
          layout.leftCollapsed ? "is-collapsed" : "",
          mobileLeftOpen ? "mobile-open" : "",
        ].filter(Boolean).join(" ")}>
          <div className="pane-toolbar">
            <button
              className="icon-button"
              type="button"
              aria-label={layout.leftCollapsed ? "Expand left pane" : "Collapse left pane"}
              title={layout.leftCollapsed ? "Expand left pane" : "Collapse left pane"}
              onClick={() => setLayout((current) => ({ ...current, leftCollapsed: !current.leftCollapsed }))}
            >
              {layout.leftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
          <div className="pane-content">
            <LeftPane activeNav={layout.activeNav} apiStatus={apiStatus} runStatus={runStatus} />
          </div>
          <button className="resize-handle right" type="button" aria-label="Resize left pane" onPointerDown={() => beginResize("left")}>
            <GripVertical size={16} />
          </button>
        </aside>

        <MainViewport
          activeNav={layout.activeNav}
          apiStatus={apiStatus}
          runStatus={runStatus}
          selectedLiveFollowAccount={selectedLiveFollowAccount}
          onSelectedLiveFollowAccountChange={setSelectedLiveFollowAccount}
          selectedArchiveItem={selectedArchiveItem}
          onSelectedArchiveItemChange={setSelectedArchiveItem}
          onSelectedArchiveDetailChange={setSelectedArchiveDetail}
          selectedSearchRow={selectedSearchRow}
          onSelectedSearchRowChange={setSelectedSearchRow}
          onSelectedSearchDetailChange={setSelectedSearchDetail}
        />

        {rightPaneHasSelection && !layout.rightCollapsed ? (
          <button
            className="mobile-inspector-backdrop"
            type="button"
            aria-label="Close selected Search inspector"
            onClick={closeSelectedSearchInspector}
          />
        ) : null}

        <aside className={[
          "pane",
          "right-pane",
          layout.rightCollapsed ? "is-collapsed" : "",
          rightPaneHasSelection ? "has-selection" : "",
        ].filter(Boolean).join(" ")}>
          <button className="resize-handle left" type="button" aria-label="Resize right pane" onPointerDown={() => beginResize("right")}>
            <GripVertical size={16} />
          </button>
          <div className="pane-toolbar">
            {rightPaneHasSelection ? <span className="mobile-inspector-label">Selected result</span> : null}
            <button
              className="icon-button"
              type="button"
              aria-label={rightPaneToggleLabel}
              title={rightPaneToggleLabel}
              onClick={() => {
                if (rightPaneHasSelection && !layout.rightCollapsed) {
                  closeSelectedSearchInspector();
                  return;
                } else {
                  setDismissedSearchInspectorKey(null);
                }
                setLayout((current) => ({ ...current, rightCollapsed: !current.rightCollapsed }));
              }}
            >
              {layout.rightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            </button>
          </div>
          <div className="pane-content">
            <RightPane
              activeNav={layout.activeNav}
              apiStatus={apiStatus}
              runStatus={runStatus}
              selectedLiveFollowAccount={selectedLiveFollowAccount}
              selectedArchiveItem={selectedArchiveItem}
              selectedArchiveDetail={selectedArchiveDetail}
              selectedSearchRow={selectedSearchRow}
              selectedSearchDetail={selectedSearchDetail}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
