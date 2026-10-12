import { hasCdpCommandAdmission } from '../../../packages/browser-service/src/guardedCdp.js';
import {
  ANSWER_SELECTORS,
  ASSISTANT_ROLE_SELECTOR,
  CONVERSATION_TURN_SELECTOR,
  COPY_BUTTON_SELECTORS,
  FINISHED_ACTIONS_SELECTOR,
  STOP_BUTTON_SELECTOR,
} from '../constants.js';
import { buildConversationDebugExpression, logConversationSnapshot, logDomFailure } from '../domDebug.js';
import type { BrowserLogger, ChromeClient } from '../types.js';
import { delay } from '../utils.js';
import { buildClickDispatcher } from './domEvents.js';

const ASSISTANT_POLL_TIMEOUT_ERROR = 'assistant-response-watchdog-timeout';
const PASSIVE_DOM_PROBE_INTERVAL_MS = 5_000;

export interface WaitForAssistantResponseOptions {
  onResponseIncoming?: () => void | Promise<void>;
  onPassiveDomProbe?: () => void | Promise<void>;
  onProgress?: (progress: AssistantResponseProgress) => void | Promise<void>;
}

export interface AssistantResponseBoundary {
  minTurnIndex?: number | null;
  baselineMessageId?: string | null;
  baselineTurnId?: string | null;
  baselineTextFingerprint?: string | null;
}

export type AssistantResponseBoundaryInput = number | AssistantResponseBoundary | null | undefined;

export interface AssistantResponseProgress {
  state: 'assistant-text' | 'tool-approval-visible' | 'assistant-turn-no-text' | 'no-assistant-turn';
  url: string | null;
  turnCount: number;
  minTurnIndex: number | null;
  boundaryState: 'position' | 'stable-identity' | 'stable-text' | 'unresolved' | 'none';
  assistantTurnIndex: number | null;
  assistantTextChars: number;
  assistantMessageId: string | null;
  assistantTurnId: string | null;
  assistantTextFingerprint: string | null;
  stopVisible: boolean;
  completionVisible: boolean;
  toolApprovalCardsVisible: number;
  dialogVisible: boolean;
}

function normalizeBoundaryText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function fingerprintAssistantResponseText(value: string | null | undefined): string | null {
  const normalized = normalizeBoundaryText(value ?? '');
  if (!normalized) return null;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length}:${hash >>> 0}`;
}

function normalizeAssistantResponseBoundary(input: AssistantResponseBoundaryInput): Required<AssistantResponseBoundary> {
  const source = typeof input === 'number' ? { minTurnIndex: input } : (input ?? {});
  const minTurnIndex =
    typeof source.minTurnIndex === 'number' && Number.isFinite(source.minTurnIndex) && source.minTurnIndex >= 0
      ? Math.floor(source.minTurnIndex)
      : null;
  const clean = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  return {
    minTurnIndex,
    baselineMessageId: clean(source.baselineMessageId),
    baselineTurnId: clean(source.baselineTurnId),
    baselineTextFingerprint: clean(source.baselineTextFingerprint),
  };
}

function buildResponseBoundaryHelpers(boundaryVariable = 'RESPONSE_BOUNDARY'): string {
  return `
    const fingerprintBoundaryText = (value) => {
      const normalized = String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      if (!normalized) return null;
      let hash = 2166136261;
      for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return normalized.length + ':' + (hash >>> 0);
    };
    const responseBoundaryState = (snapshot, turnCount) => {
      if (!snapshot) return null;
      const boundary = ${boundaryVariable} || {};
      const minTurnIndex = Number.isFinite(boundary.minTurnIndex) ? boundary.minTurnIndex : null;
      const turnIndex = Number.isFinite(snapshot.turnIndex) ? snapshot.turnIndex : null;
      if (minTurnIndex === null) return 'none';
      if (turnIndex !== null && turnIndex >= minTurnIndex) return 'position';
      if (!Number.isFinite(turnCount) || turnCount > minTurnIndex) return null;
      const baselineMessageId = boundary.baselineMessageId || null;
      const baselineTurnId = boundary.baselineTurnId || null;
      const messageId = snapshot.messageId || null;
      const turnId = snapshot.turnId || null;
      const fingerprint = fingerprintBoundaryText(snapshot.text || '');
      if (
        boundary.baselineTextFingerprint &&
        fingerprint &&
        fingerprint === boundary.baselineTextFingerprint
      ) {
        return null;
      }
      if (
        (baselineMessageId && messageId && baselineMessageId === messageId) ||
        (baselineTurnId && turnId && baselineTurnId === turnId)
      ) {
        return null;
      }
      if (
        (baselineMessageId && messageId && baselineMessageId !== messageId) ||
        (baselineTurnId && turnId && baselineTurnId !== turnId)
      ) {
        return 'stable-identity';
      }
      if (!baselineMessageId && !baselineTurnId && boundary.baselineTextFingerprint) {
        if (fingerprint && fingerprint !== boundary.baselineTextFingerprint) return 'stable-text';
      }
      return null;
    };`;
}

// This predicate is also injected into renderer expressions through
// buildAnswerNowPlaceholderPredicateJs, so keep it closure-free.
export function isAnswerNowPlaceholderText(value: unknown): boolean {
  let raw = '';
  if (typeof value === 'string') {
    raw = value;
  } else if (value && typeof value === 'object' && 'text' in value) {
    const candidate = (value as { text?: unknown }).text;
    if (typeof candidate === 'string') raw = candidate;
  }
  const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (text === 'chatgpt said:' || text === 'chatgpt said') return true;
  if (text.length > 60) return false;
  const chromeLabels = ['chatgpt said:', 'chatgpt said', 'file upload request', 'pro thinking', 'answer now'];
  let rest = text;
  let sawOwner = false;
  let sawGate = false;
  while (rest.length > 0) {
    let matched = '';
    for (const label of chromeLabels) {
      if (label.length > matched.length && rest.startsWith(label)) matched = label;
    }
    if (!matched) return false;
    if (matched === 'answer now' || matched === 'file upload request') sawGate = true;
    else sawOwner = true;
    rest = rest.slice(matched.length).replace(/^[\s:.,;|\u00b7\u2022-]+/, '');
  }
  return sawGate && sawOwner;
}

export function buildAnswerNowPlaceholderPredicateJs(functionName: string): string {
  return `const ${functionName} = ${isAnswerNowPlaceholderText.toString()};`;
}

export async function waitForAssistantResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
  responseBoundary?: AssistantResponseBoundaryInput,
  options: WaitForAssistantResponseOptions = {},
): Promise<{
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
}> {
  const start = Date.now();
  let responseIncomingEmitted = false;
  const waitOptions: WaitForAssistantResponseOptions = {
    ...options,
    onResponseIncoming: async () => {
      if (responseIncomingEmitted) {
        return;
      }
      responseIncomingEmitted = true;
      await options.onResponseIncoming?.();
    },
  };
  logger('Waiting for ChatGPT response');
  // An awaited renderer observer holds coordinated desktop admission until it
  // finishes. Its parallel watchdog then cannot read progress. Keep each
  // coordinated observation short and retain the existing ownership checks.
  if (hasCdpCommandAdmission(Runtime)) {
    const response = await pollAssistantCompletion(Runtime, timeoutMs, responseBoundary, undefined, waitOptions);
    if (!response) throw new Error(ASSISTANT_POLL_TIMEOUT_ERROR);
    await waitOptions.onResponseIncoming?.();
    return response;
  }

  // Learned: two paths are needed:
  // 1) DOM observer (fast when mutations fire),
  // 2) snapshot poller (fallback when observers miss or JS stalls).
  const expression = buildResponseObserverExpression(timeoutMs, responseBoundary);
  const evaluationPromise = Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const raceReadyEvaluation = evaluationPromise.then(
    (value) => ({ kind: 'evaluation' as const, value }),
    (error) => {
      throw { source: 'evaluation' as const, error };
    },
  );
  // Stop the watchdog loop once the observer path wins so we do not keep polling until timeout.
  const pollerAbort = new AbortController();
  const pollerPromise = pollAssistantCompletion(Runtime, timeoutMs, responseBoundary, pollerAbort.signal, waitOptions).then(
    (value) => {
      if (!value) {
        throw { source: 'poll' as const, error: new Error(ASSISTANT_POLL_TIMEOUT_ERROR) };
      }
      return { kind: 'poll' as const, value };
    },
    (error) => {
      throw { source: 'poll' as const, error };
    },
  );

  let evaluation: Awaited<ReturnType<ChromeClient['Runtime']['evaluate']>> | null = null;
  try {
    const winner = await Promise.race([raceReadyEvaluation, pollerPromise]);
    if (winner.kind === 'poll') {
      logger('Captured assistant response via snapshot watchdog');
      evaluationPromise.catch(() => undefined);
      await terminateRuntimeExecution(Runtime);
      await waitOptions.onResponseIncoming?.();
      return winner.value;
    }
    pollerAbort.abort();
    evaluation = winner.value;
  } catch (wrappedError) {
    if (wrappedError && typeof wrappedError === 'object' && 'source' in wrappedError && 'error' in wrappedError) {
      const { source, error } = wrappedError as { source: string; error: unknown };
      if (source === 'poll' && error instanceof Error && error.message === ASSISTANT_POLL_TIMEOUT_ERROR) {
        evaluation = await evaluationPromise;
      } else if (source === 'poll') {
        throw error;
      } else if (source === 'evaluation') {
        const recovered = await recoverAssistantResponse(Runtime, timeoutMs, logger, responseBoundary, waitOptions);
        if (recovered) {
          await waitOptions.onResponseIncoming?.();
          return recovered;
        }
        await logDomFailure(Runtime, logger, 'assistant-response');
        throw error ?? new Error('Failed to capture assistant response');
      }
    } else {
      throw wrappedError;
    }
  }

  if (!evaluation) {
    await logDomFailure(Runtime, logger, 'assistant-response');
    throw new Error('Failed to capture assistant response');
  }

  const parsed = await parseAssistantEvaluationResult(Runtime, evaluation, logger);
  if (!parsed) {
    let remainingMs = Math.max(0, timeoutMs - (Date.now() - start));
    if (remainingMs > 0) {
      const recovered = await recoverAssistantResponse(Runtime, remainingMs, logger, responseBoundary, waitOptions);
      if (recovered) {
        return recovered;
      }
      remainingMs = Math.max(0, timeoutMs - (Date.now() - start));
      if (remainingMs > 0) {
        const polled = await Promise.race([pollerPromise.catch(() => null), delay(remainingMs).then(() => null)]);
        if (polled && polled.kind === 'poll') {
          return polled.value;
        }
      }
    }
    await logDomFailure(Runtime, logger, 'assistant-response');
    throw new Error('Unable to capture assistant response');
  }

  const refreshed = await refreshAssistantSnapshot(Runtime, parsed, logger, responseBoundary);
  const candidate = refreshed ?? parsed;
  // The evaluation path can race ahead of completion. If ChatGPT is still streaming, wait for the watchdog poller.
  const elapsedMs = Date.now() - start;
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);
  if (remainingMs > 0) {
    const [stopVisible, completionVisible] = await Promise.all([
      isStopButtonVisible(Runtime),
      isCompletionVisible(Runtime),
    ]);
    if (stopVisible) {
      logger('Assistant still generating; waiting for completion');
      const completed = await pollAssistantCompletion(Runtime, remainingMs, responseBoundary, undefined, waitOptions);
      if (completed) {
        await waitOptions.onResponseIncoming?.();
        return completed;
      }
    } else if (completionVisible) {
      // No-op: completion UI surfaced and stop button is gone.
    }
  }

  return candidate;
}

export async function readAssistantSnapshot(
  Runtime: ChromeClient['Runtime'],
  responseBoundary?: AssistantResponseBoundaryInput,
): Promise<AssistantSnapshot | null> {
  const { result } = await Runtime.evaluate({
    expression: buildAssistantSnapshotExpression(responseBoundary),
    returnByValue: true,
  });
  const value = result?.value;
  if (value && typeof value === 'object') {
    return value as AssistantSnapshot;
  }
  return null;
}

export async function readAssistantResponseProgress(
  Runtime: ChromeClient['Runtime'],
  responseBoundary?: AssistantResponseBoundaryInput,
): Promise<AssistantResponseProgress | null> {
  const { result } = await Runtime.evaluate({
    expression: buildAssistantResponseProgressExpression(responseBoundary),
    returnByValue: true,
  });
  const value = result?.value;
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as AssistantResponseProgress;
}

export async function captureAssistantMarkdown(
  Runtime: ChromeClient['Runtime'],
  meta: { messageId?: string | null; turnId?: string | null },
  logger: BrowserLogger,
): Promise<string | null> {
  const { result } = await Runtime.evaluate({
    expression: buildCopyExpression(meta),
    returnByValue: true,
    awaitPromise: true,
  });
  if (result?.value?.success && typeof result.value.markdown === 'string') {
    return result.value.markdown;
  }
  const status = result?.value?.status;
  if (status && status !== 'missing-button') {
    logger(`Copy button fallback status: ${status}`);
    await logDomFailure(Runtime, logger, 'copy-markdown');
  }
  if (!status) {
    await logDomFailure(Runtime, logger, 'copy-markdown');
  }
  return null;
}

export function buildAssistantExtractorForTest(name: string): string {
  return buildAssistantExtractor(name);
}

export function buildAssistantSnapshotExpressionForTest(
  responseBoundary?: AssistantResponseBoundaryInput,
): string {
  return buildAssistantSnapshotExpression(responseBoundary);
}

export function buildAssistantResponseProgressExpressionForTest(
  responseBoundary?: AssistantResponseBoundaryInput,
): string {
  return buildAssistantResponseProgressExpression(responseBoundary);
}

export function buildConversationDebugExpressionForTest(): string {
  return buildConversationDebugExpression();
}

export function buildMarkdownFallbackExtractorForTest(minTurnLiteral = '0'): string {
  return buildMarkdownFallbackExtractor(`{
    minTurnIndex: ${minTurnLiteral},
    baselineMessageId: null,
    baselineTurnId: null,
    baselineTextFingerprint: null
  }`);
}

export function getAssistantCompletionWatchdogThresholdsForTest(currentLength: number): {
  completionStableTarget: number;
  requiredStableCycles: number;
  minStableMs: number;
} {
  return getAssistantCompletionWatchdogThresholds(currentLength);
}

export function buildCopyExpressionForTest(meta: { messageId?: string | null; turnId?: string | null } = {}): string {
  return buildCopyExpression(meta);
}

async function recoverAssistantResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
  responseBoundary?: AssistantResponseBoundaryInput,
  options: WaitForAssistantResponseOptions = {},
): Promise<{
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
} | null> {
  const recoveryTimeoutMs = Math.max(0, timeoutMs);
  if (recoveryTimeoutMs === 0) {
    return null;
  }
  const quickSnapshot = normalizeAssistantSnapshot(
    await readAssistantSnapshot(Runtime, responseBoundary).catch(() => null),
  );
  if (quickSnapshot) {
    await options.onPassiveDomProbe?.();
    await options.onResponseIncoming?.();
    logger('Recovered assistant response via immediate snapshot fallback');
    return quickSnapshot;
  }
  const recovered = await pollAssistantCompletion(Runtime, recoveryTimeoutMs, responseBoundary, undefined, options);
  if (recovered) {
    logger('Recovered assistant response via polling fallback');
    return recovered;
  }
  await logConversationSnapshot(Runtime, logger).catch(() => undefined);
  return null;
}

async function parseAssistantEvaluationResult(
  _Runtime: ChromeClient['Runtime'],
  evaluation: Awaited<ReturnType<ChromeClient['Runtime']['evaluate']>>,
  _logger: BrowserLogger,
): Promise<{
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
} | null> {
  const { result } = evaluation;
  if (result.type === 'object' && result.value && typeof result.value === 'object' && 'text' in result.value) {
    const html =
      typeof (result.value as { html?: unknown }).html === 'string'
        ? ((result.value as { html?: string }).html ?? undefined)
        : undefined;
    const turnId =
      typeof (result.value as { turnId?: unknown }).turnId === 'string'
        ? ((result.value as { turnId?: string }).turnId ?? undefined)
        : undefined;
    const messageId =
      typeof (result.value as { messageId?: unknown }).messageId === 'string'
        ? ((result.value as { messageId?: string }).messageId ?? undefined)
        : undefined;
    const text = cleanAssistantText(String((result.value as { text: unknown }).text ?? ''));
    const normalized = text.toLowerCase();
    if (isAnswerNowPlaceholderText(normalized)) {
      return null;
    }
    return { text, html, meta: { turnId, messageId } };
  }
  const fallbackText = typeof result.value === 'string' ? cleanAssistantText(result.value as string) : '';
  if (!fallbackText) {
    return null;
  }
  if (isAnswerNowPlaceholderText(fallbackText.toLowerCase())) {
    return null;
  }
  return { text: fallbackText, html: undefined, meta: {} };
}

async function refreshAssistantSnapshot(
  Runtime: ChromeClient['Runtime'],
  current: {
    text: string;
    html?: string;
    meta: { turnId?: string | null; messageId?: string | null };
  },
  logger: BrowserLogger,
  responseBoundary?: AssistantResponseBoundaryInput,
): Promise<{
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
} | null> {
  const deadline = Date.now() + 5_000;
  let best: {
    text: string;
    html?: string;
    meta: { turnId?: string | null; messageId?: string | null };
  } | null = null;
  let stableCycles = 0;
  const stableTarget = 3;
  while (Date.now() < deadline) {
    // Learned: short/fast answers can race; poll a few extra cycles to pick up messageId + full text.
    const latestSnapshot = await readAssistantSnapshot(Runtime, responseBoundary).catch(() => null);
    const latest = normalizeAssistantSnapshot(latestSnapshot);
    if (latest) {
      if (!best || latest.text.length > best.text.length || (!best.meta.messageId && latest.meta.messageId)) {
        best = latest;
        stableCycles = 0;
      } else if (latest.text.trim() === best.text.trim()) {
        stableCycles += 1;
      }
    }
    if (best && stableCycles >= stableTarget) {
      break;
    }
    await delay(300);
  }
  if (!best) {
    return null;
  }
  const currentLength = cleanAssistantText(current.text).trim().length;
  const latestLength = best.text.length;
  const hasBetterId = !current.meta?.messageId && Boolean(best.meta.messageId);
  const isLonger = latestLength > currentLength;
  const hasDifferentText = best.text.trim() !== current.text.trim();
  if (isLonger || hasBetterId || hasDifferentText) {
    logger('Refreshed assistant response via latest snapshot');
    return best;
  }
  return null;
}

async function terminateRuntimeExecution(Runtime: ChromeClient['Runtime']): Promise<void> {
  if (typeof Runtime.terminateExecution !== 'function') {
    return;
  }
  try {
    await Runtime.terminateExecution();
  } catch {
    // ignore termination failures
  }
}

async function pollAssistantCompletion(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  responseBoundary?: AssistantResponseBoundaryInput,
  abortSignal?: AbortSignal,
  options: WaitForAssistantResponseOptions = {},
): Promise<{
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
} | null> {
  const watchdogDeadline = Date.now() + timeoutMs;
  let previousLength = 0;
  let stableCycles = 0;
  let lastChangeAt = Date.now();
  let responseIncomingEmitted = false;
  let lastPassiveProbeAt = 0;
  while (Date.now() < watchdogDeadline) {
    if (abortSignal?.aborted) {
      return null;
    }
    const snapshot = await readAssistantSnapshot(Runtime, responseBoundary);
    const observedAt = Date.now();
    if (observedAt - lastPassiveProbeAt >= PASSIVE_DOM_PROBE_INTERVAL_MS) {
      lastPassiveProbeAt = observedAt;
      await options.onPassiveDomProbe?.();
      const progress = await readAssistantResponseProgress(Runtime, responseBoundary).catch(() => null);
      if (progress) {
        await options.onProgress?.(progress);
      }
    }
    const normalized = normalizeAssistantSnapshot(snapshot);
    if (normalized) {
      if (!responseIncomingEmitted) {
        responseIncomingEmitted = true;
        await options.onResponseIncoming?.();
      }
      const currentLength = normalized.text.length;
      if (currentLength > previousLength) {
        previousLength = currentLength;
        stableCycles = 0;
        lastChangeAt = Date.now();
      } else {
        stableCycles += 1;
      }
      const [stopVisible, completionVisible] = await Promise.all([
        isStopButtonVisible(Runtime),
        isCompletionVisible(Runtime),
      ]);
      const { completionStableTarget, requiredStableCycles, minStableMs } =
        getAssistantCompletionWatchdogThresholds(currentLength);
      const stableMs = Date.now() - lastChangeAt;
      // Require stop button to disappear before treating completion as final.
      if (!stopVisible) {
        const stableEnough = stableCycles >= requiredStableCycles && stableMs >= minStableMs;
        const completionEnough = completionVisible && stableCycles >= completionStableTarget && stableMs >= minStableMs;
        if (completionEnough || stableEnough) {
          return normalized;
        }
      }
    } else {
      previousLength = 0;
      stableCycles = 0;
    }
    await delay(400);
  }
  return null;
}

async function isStopButtonVisible(Runtime: ChromeClient['Runtime']): Promise<boolean> {
  try {
    const { result } = await Runtime.evaluate({
      expression: `Boolean(document.querySelector('${STOP_BUTTON_SELECTOR}'))`,
      returnByValue: true,
    });
    return Boolean(result?.value);
  } catch {
    return false;
  }
}

function getAssistantCompletionWatchdogThresholds(currentLength: number): {
  completionStableTarget: number;
  requiredStableCycles: number;
  minStableMs: number;
} {
  const shortAnswer = currentLength > 0 && currentLength < 16;
  const mediumAnswer = currentLength >= 16 && currentLength < 40;
  const longAnswer = currentLength >= 40 && currentLength < 500;
  // Learned: short answers need a longer stability window or they truncate.
  // Learned: long streaming responses can pause mid-stream; require a longer stable window.
  return {
    completionStableTarget: shortAnswer ? 12 : mediumAnswer ? 8 : longAnswer ? 6 : 8,
    requiredStableCycles: shortAnswer ? 12 : mediumAnswer ? 8 : longAnswer ? 8 : 10,
    minStableMs: shortAnswer ? 8000 : mediumAnswer ? 1200 : longAnswer ? 2000 : 3000,
  };
}

async function isCompletionVisible(Runtime: ChromeClient['Runtime']): Promise<boolean> {
  try {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        // Find the LAST assistant turn to check completion status
        // Must match the same logic as buildAssistantExtractor for consistency
        const ASSISTANT_SELECTOR = '${ASSISTANT_ROLE_SELECTOR}';
        const isAssistantTurn = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const turnAttr = (node.getAttribute('data-turn') || node.dataset?.turn || '').toLowerCase();
          if (turnAttr === 'assistant') return true;
          const role = (node.getAttribute('data-message-author-role') || node.dataset?.messageAuthorRole || '').toLowerCase();
          if (role === 'assistant') return true;
          const testId = (node.getAttribute('data-testid') || '').toLowerCase();
          if (testId.includes('assistant')) return true;
	      return Boolean(
	        node.matches(ASSISTANT_SELECTOR) ||
	        node.querySelector(ASSISTANT_SELECTOR) ||
	        node.querySelector('[data-testid*="assistant"]')
	      );
        };

        const turns = Array.from(document.querySelectorAll('${CONVERSATION_TURN_SELECTOR}'));
        let lastAssistantTurn = null;
        for (let i = turns.length - 1; i >= 0; i--) {
          if (isAssistantTurn(turns[i])) {
            lastAssistantTurn = turns[i];
            break;
          }
        }
        if (!lastAssistantTurn) {
          return false;
        }
        // Check if the last assistant turn has finished action buttons (copy, thumbs up/down, share)
        if (lastAssistantTurn.querySelector('${FINISHED_ACTIONS_SELECTOR}')) {
          return true;
        }
        // Also check for "Done" text in the last assistant turn's markdown
        const markdowns = lastAssistantTurn.querySelectorAll('.markdown');
        return Array.from(markdowns).some((n) => (n.textContent || '').trim() === 'Done');
      })()`,
      returnByValue: true,
    });
    return Boolean(result?.value);
  } catch {
    return false;
  }
}

function normalizeAssistantSnapshot(snapshot: AssistantSnapshot | null): {
  text: string;
  html?: string;
  meta: { turnId?: string | null; messageId?: string | null };
} | null {
  const text = snapshot?.text ? cleanAssistantText(snapshot.text) : '';
  if (!text.trim()) {
    return null;
  }
  const normalized = text.toLowerCase();
  // "Pro thinking" often renders a placeholder turn containing an "Answer now" gate.
  // Treat it as incomplete so browser mode keeps waiting for the real assistant text.
  if (isAnswerNowPlaceholderText(normalized)) {
    return null;
  }
  // Ignore user echo turns that can show up in project view fallbacks.
  if (normalized.startsWith('you said')) {
    return null;
  }
  return {
    text,
    html: snapshot?.html ?? undefined,
    meta: { turnId: snapshot?.turnId ?? undefined, messageId: snapshot?.messageId ?? undefined },
  };
}

function buildAssistantSnapshotExpression(responseBoundary?: AssistantResponseBoundaryInput): string {
  const boundary = normalizeAssistantResponseBoundary(responseBoundary);
  return `(() => {
    const RESPONSE_BOUNDARY = ${JSON.stringify(boundary)};
    const MIN_TURN_INDEX = RESPONSE_BOUNDARY.minTurnIndex ?? -1;
    ${buildResponseBoundaryHelpers()}
    // Learned: the default turn DOM misses project view; keep a fallback extractor.
    ${buildAssistantExtractor('extractAssistantTurn')}
    const turnCount = document.querySelectorAll(${JSON.stringify(CONVERSATION_TURN_SELECTOR)}).length;
    const extractedRaw = extractAssistantTurn();
    const extracted = responseBoundaryState(extractedRaw, turnCount) ? extractedRaw : null;
    ${buildAnswerNowPlaceholderPredicateJs('isPlaceholder')}
    if (extracted && extracted.text && !isPlaceholder(extracted)) {
      return extracted;
    }
    // Fallback for ChatGPT project view: answers can live outside conversation turns.
    const extractFromMarkdownFallback = ${buildMarkdownFallbackExtractor('RESPONSE_BOUNDARY')};
    const fallback = extractFromMarkdownFallback();
    return fallback ?? extracted;
  })()`;
}

function buildAssistantResponseProgressExpression(responseBoundary?: AssistantResponseBoundaryInput): string {
  const boundary = normalizeAssistantResponseBoundary(responseBoundary);
  const conversationLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
  const assistantLiteral = JSON.stringify(ASSISTANT_ROLE_SELECTOR);
  return `(() => {
    const RESPONSE_BOUNDARY = ${JSON.stringify(boundary)};
    const MIN_TURN_INDEX = RESPONSE_BOUNDARY.minTurnIndex ?? -1;
    ${buildResponseBoundaryHelpers()}
    const CONVERSATION_SELECTOR = ${conversationLiteral};
    const ASSISTANT_SELECTOR = ${assistantLiteral};
    const CONTENT_SELECTOR = '.markdown,[data-message-content],[data-testid*="message"],[data-testid*="assistant"],.prose,[class*="markdown"]';
    const EXCLUDED_SELECTOR = '[data-testid="tool-approval-card"],[data-testid*="tool-approval"],[data-testid*="composer"],form';
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
    };
    const isAssistantTurn = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const turnAttr = (node.getAttribute('data-turn') || node.dataset?.turn || '').toLowerCase();
      if (turnAttr === 'assistant') return true;
      const role = (node.getAttribute('data-message-author-role') || node.dataset?.messageAuthorRole || '').toLowerCase();
      if (role === 'assistant') return true;
      const testId = (node.getAttribute('data-testid') || '').toLowerCase();
      if (testId.includes('assistant')) return true;
      return Boolean(node.matches(ASSISTANT_SELECTOR) || node.querySelector(ASSISTANT_SELECTOR) || node.querySelector('[data-testid*="assistant"]'));
    };
    const turns = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
    let assistantTurn = null;
    let assistantTurnIndex = null;
    let assistantMessageId = null;
    let assistantTurnId = null;
    let boundaryState = null;
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (!isAssistantTurn(turn)) continue;
      const messageNode = turn.querySelector?.('[data-message-id]');
      const candidateBoundaryState = responseBoundaryState(
        {
          text: '',
          messageId: turn.getAttribute('data-message-id') || messageNode?.getAttribute?.('data-message-id') || null,
          turnId: turn.getAttribute('data-testid') || null,
          turnIndex: index,
        },
        turns.length,
      );
      if (!candidateBoundaryState) continue;
      assistantTurn = turn;
      assistantTurnIndex = index;
      assistantMessageId = turn.getAttribute('data-message-id') || messageNode?.getAttribute?.('data-message-id') || null;
      assistantTurnId = turn.getAttribute('data-testid') || null;
      boundaryState = candidateBoundaryState;
      break;
    }
    const candidates = [];
    if (assistantTurn) {
      if (assistantTurn.matches?.(CONTENT_SELECTOR)) candidates.push(assistantTurn);
      candidates.push(...Array.from(assistantTurn.querySelectorAll(CONTENT_SELECTOR)));
    }
    let assistantTextChars = 0;
    let assistantTextFingerprint = null;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (!(candidate instanceof HTMLElement)) continue;
      if (candidate.matches?.(EXCLUDED_SELECTOR) || candidate.closest?.(EXCLUDED_SELECTOR)) continue;
      if (candidate.querySelector?.(EXCLUDED_SELECTOR)) continue;
      const text = String(candidate.innerText || candidate.textContent || '').trim();
      if (!text) continue;
      assistantTextChars = text.length;
      assistantTextFingerprint = fingerprintBoundaryText(text);
      break;
    }
    const toolApprovalCardsVisible = assistantTurn
      ? Array.from(
          assistantTurn.querySelectorAll('[data-testid="tool-approval-card"],[data-testid*="tool-approval"]'),
        ).filter(isVisible).length
      : 0;
    const stopVisible = Array.from(document.querySelectorAll('${STOP_BUTTON_SELECTOR}')).some(isVisible);
    const completionVisible = Boolean(
      assistantTurn &&
        (assistantTurn.querySelector('${FINISHED_ACTIONS_SELECTOR}') ||
          Array.from(assistantTurn.querySelectorAll('.markdown')).some(
            (node) => String(node.textContent || '').trim() === 'Done',
          )),
    );
    const dialogVisible = Array.from(document.querySelectorAll('[role="dialog"]')).some(isVisible);
    const state = assistantTextChars > 0
      ? 'assistant-text'
      : toolApprovalCardsVisible > 0
        ? 'tool-approval-visible'
        : assistantTurn
          ? 'assistant-turn-no-text'
          : 'no-assistant-turn';
    return {
      state,
      url:
        typeof location?.origin === 'string' && typeof location?.pathname === 'string'
          ? location.origin + location.pathname
          : null,
      turnCount: turns.length,
      minTurnIndex: MIN_TURN_INDEX >= 0 ? MIN_TURN_INDEX : null,
      boundaryState: boundaryState ?? (MIN_TURN_INDEX >= 0 ? 'unresolved' : 'none'),
      assistantTurnIndex,
      assistantTextChars,
      assistantMessageId,
      assistantTurnId,
      assistantTextFingerprint,
      stopVisible,
      completionVisible,
      toolApprovalCardsVisible,
      dialogVisible,
    };
  })()`;
}

function buildResponseObserverExpression(timeoutMs: number, responseBoundary?: AssistantResponseBoundaryInput): string {
  const selectorsLiteral = JSON.stringify(ANSWER_SELECTORS);
  const conversationLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
  const assistantLiteral = JSON.stringify(ASSISTANT_ROLE_SELECTOR);
  const boundary = normalizeAssistantResponseBoundary(responseBoundary);
  return `(() => {
    ${buildClickDispatcher()}
    const SELECTORS = ${selectorsLiteral};
    const STOP_SELECTOR = '${STOP_BUTTON_SELECTOR}';
    const FINISHED_SELECTOR = '${FINISHED_ACTIONS_SELECTOR}';
    const CONVERSATION_SELECTOR = ${conversationLiteral};
    const ASSISTANT_SELECTOR = ${assistantLiteral};
    // Learned: settling avoids capturing mid-stream HTML; keep short.
    const settleDelayMs = 800;
    ${buildAnswerNowPlaceholderPredicateJs('isAnswerNowPlaceholder')}

    // Helper to detect assistant turns - must match buildAssistantExtractor logic for consistency.
    const isAssistantTurn = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const turnAttr = (node.getAttribute('data-turn') || node.dataset?.turn || '').toLowerCase();
      if (turnAttr === 'assistant') return true;
      const role = (node.getAttribute('data-message-author-role') || node.dataset?.messageAuthorRole || '').toLowerCase();
      if (role === 'assistant') return true;
      const testId = (node.getAttribute('data-testid') || '').toLowerCase();
      if (testId.includes('assistant')) return true;
      return Boolean(node.matches(ASSISTANT_SELECTOR) || node.querySelector(ASSISTANT_SELECTOR) || node.querySelector('[data-testid*="assistant"]'));
    };

    const RESPONSE_BOUNDARY = ${JSON.stringify(boundary)};
    const MIN_TURN_INDEX = RESPONSE_BOUNDARY.minTurnIndex ?? -1;
    ${buildResponseBoundaryHelpers()}
    ${buildAssistantExtractor('extractFromTurns')}
    // Learned: some layouts (project view) render markdown without assistant turn wrappers.
    const extractFromMarkdownFallback = ${buildMarkdownFallbackExtractor('RESPONSE_BOUNDARY')};

    const acceptSnapshot = (snapshot) => {
      if (!snapshot) return null;
      const turnCount = document.querySelectorAll(CONVERSATION_SELECTOR).length;
      return responseBoundaryState(snapshot, turnCount) ? snapshot : null;
    };

    const captureViaObserver = () =>
      new Promise((resolve, reject) => {
        const deadline = Date.now() + ${timeoutMs};
        let stopInterval = null;
        const observer = new MutationObserver(() => {
          const extractedRaw = extractFromTurns();
          const extractedCandidate =
            extractedRaw && !isAnswerNowPlaceholder(extractedRaw) ? extractedRaw : null;
          let extracted = acceptSnapshot(extractedCandidate);
          if (!extracted) {
            const fallbackRaw = extractFromMarkdownFallback();
            const fallbackCandidate =
              fallbackRaw && !isAnswerNowPlaceholder(fallbackRaw) ? fallbackRaw : null;
            extracted = acceptSnapshot(fallbackCandidate);
          }
          if (extracted) {
            observer.disconnect();
            if (stopInterval) {
              clearInterval(stopInterval);
            }
            resolve(extracted);
          } else if (Date.now() > deadline) {
            observer.disconnect();
            if (stopInterval) {
              clearInterval(stopInterval);
            }
            reject(new Error('Response timeout'));
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        stopInterval = setInterval(() => {
          const stop = document.querySelector(STOP_SELECTOR);
          if (!stop) {
            return;
          }
          const isStopButton =
            stop.getAttribute('data-testid') === 'stop-button' || stop.getAttribute('aria-label')?.toLowerCase()?.includes('stop');
          if (isStopButton) {
            return;
          }
          dispatchClickSequence(stop);
        }, 500);
        setTimeout(() => {
          if (stopInterval) {
            clearInterval(stopInterval);
          }
          observer.disconnect();
          reject(new Error('Response timeout'));
        }, ${timeoutMs});
      });

    // Check if the last assistant turn has finished (scoped to avoid detecting old turns).
    const isLastAssistantTurnFinished = () => {
      const turns = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
      let lastAssistantTurn = null;
      for (let i = turns.length - 1; i >= 0; i--) {
        if (isAssistantTurn(turns[i])) {
          lastAssistantTurn = turns[i];
          break;
        }
      }
      if (!lastAssistantTurn) return false;
      // Check for action buttons in this specific turn
      if (lastAssistantTurn.querySelector(FINISHED_SELECTOR)) return true;
      // Check for "Done" text in this turn's markdown
      const markdowns = lastAssistantTurn.querySelectorAll('.markdown');
      return Array.from(markdowns).some((n) => (n.textContent || '').trim() === 'Done');
    };

    const waitForSettle = async (snapshot) => {
      // Learned: short answers can be 1-2 tokens; enforce longer settle windows to avoid truncation.
      const initialLength = snapshot?.text?.length ?? 0;
      const shortAnswer = initialLength > 0 && initialLength < 16;
      const settleWindowMs = shortAnswer ? 12_000 : 5_000;
      const settleIntervalMs = 400;
      const deadline = Date.now() + settleWindowMs;
      let latest = snapshot;
      let lastLength = snapshot?.text?.length ?? 0;
      let stableCycles = 0;
      const stableTarget = shortAnswer ? 6 : 3;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, settleIntervalMs));
        const refreshedRaw = extractFromTurns();
        const refreshedCandidate =
          refreshedRaw && !isAnswerNowPlaceholder(refreshedRaw) ? refreshedRaw : null;
        let refreshed = acceptSnapshot(refreshedCandidate);
        if (!refreshed) {
          const fallbackRaw = extractFromMarkdownFallback();
          const fallbackCandidate =
            fallbackRaw && !isAnswerNowPlaceholder(fallbackRaw) ? fallbackRaw : null;
          refreshed = acceptSnapshot(fallbackCandidate);
        }
        const nextLength = refreshed?.text?.length ?? lastLength;
        if (refreshed && nextLength >= lastLength) {
          latest = refreshed;
        }
        if (nextLength > lastLength) {
          lastLength = nextLength;
          stableCycles = 0;
        } else {
          stableCycles += 1;
        }
        const stopVisible = Boolean(document.querySelector(STOP_SELECTOR));
        const finishedVisible = isLastAssistantTurnFinished();

        if (finishedVisible || (!stopVisible && stableCycles >= stableTarget)) {
          break;
        }
      }
      return latest ?? snapshot;
    };

    const extractedRaw = extractFromTurns();
    const extractedCandidate = extractedRaw && !isAnswerNowPlaceholder(extractedRaw) ? extractedRaw : null;
    let extracted = acceptSnapshot(extractedCandidate);
    if (!extracted) {
      const fallbackRaw = extractFromMarkdownFallback();
      const fallbackCandidate = fallbackRaw && !isAnswerNowPlaceholder(fallbackRaw) ? fallbackRaw : null;
      extracted = acceptSnapshot(fallbackCandidate);
    }
    if (extracted) {
      return waitForSettle(extracted);
    }
    return captureViaObserver().then((payload) => waitForSettle(payload));
  })()`;
}

function buildAssistantExtractor(functionName: string): string {
  const conversationLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
  const assistantLiteral = JSON.stringify(ASSISTANT_ROLE_SELECTOR);
  return `const ${functionName} = () => {
    ${buildClickDispatcher()}
    const CONVERSATION_SELECTOR = ${conversationLiteral};
    const ASSISTANT_SELECTOR = ${assistantLiteral};
    const isAssistantTurn = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const turnAttr = (node.getAttribute('data-turn') || node.dataset?.turn || '').toLowerCase();
      if (turnAttr === 'assistant') {
        return true;
      }
      const role = (node.getAttribute('data-message-author-role') || node.dataset?.messageAuthorRole || '').toLowerCase();
      if (role === 'assistant') {
        return true;
      }
      const testId = (node.getAttribute('data-testid') || '').toLowerCase();
      if (testId.includes('assistant')) {
        return true;
      }
      return Boolean(node.matches(ASSISTANT_SELECTOR) || node.querySelector(ASSISTANT_SELECTOR) || node.querySelector('[data-testid*="assistant"]'));
    };

    const expandCollapsibles = (root) => {
      const buttons = Array.from(root.querySelectorAll('button'));
      for (const button of buttons) {
        const label = (button.textContent || '').toLowerCase();
        const testid = (button.getAttribute('data-testid') || '').toLowerCase();
        if (
          label.includes('more') ||
          label.includes('expand') ||
          label.includes('show') ||
          testid.includes('markdown') ||
          testid.includes('toggle')
        ) {
          dispatchClickSequence(button);
        }
      }
    };

    const turns = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (!isAssistantTurn(turn)) {
        continue;
      }
      const messageRoot = turn.querySelector(ASSISTANT_SELECTOR) ?? turn;
      expandCollapsibles(messageRoot);
      const contentSelectors = [
        '.markdown',
        '[data-message-content]',
        '[data-testid*="message"]',
        '[data-testid*="assistant"]',
        '.prose',
        '[class*="markdown"]',
      ];
      const excludedSelector = '[data-testid="tool-approval-card"],[data-testid*="tool-approval"],[data-testid*="composer"],form';
      const readCandidate = (contentRoot) => {
        if (!(contentRoot instanceof HTMLElement)) return null;
        if (contentRoot.matches?.(excludedSelector) || contentRoot.closest?.(excludedSelector)) return null;
        if (contentRoot.querySelector?.(excludedSelector)) return null;
        const innerText = contentRoot.innerText ?? '';
        const textContent = contentRoot.textContent ?? '';
        const text = innerText.trim().length > 0 ? innerText : textContent;
        if (!text.trim()) return null;
        const html = contentRoot.innerHTML ?? '';
        const messageId =
          contentRoot.getAttribute('data-message-id') || messageRoot.getAttribute('data-message-id');
        const turnId = turn.getAttribute('data-testid') || messageRoot.getAttribute('data-testid');
        return { text, html, messageId, turnId, turnIndex: index };
      };
      for (const selector of contentSelectors) {
        const candidates = [];
        if (messageRoot.matches?.(selector)) candidates.push(messageRoot);
        candidates.push(...Array.from(messageRoot.querySelectorAll(selector)));
        for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
          const extracted = readCandidate(candidates[candidateIndex]);
          if (extracted) return extracted;
        }
      }
      if (!messageRoot.querySelector(excludedSelector)) {
        const extracted = readCandidate(messageRoot);
        if (extracted) return extracted;
      }
    }
    return null;
  };`;
}

function buildMarkdownFallbackExtractor(boundaryLiteral = '{}'): string {
  return `(() => {
    const FALLBACK_RESPONSE_BOUNDARY = ${boundaryLiteral};
    const MIN_TURN_INDEX = FALLBACK_RESPONSE_BOUNDARY?.minTurnIndex ?? null;
    ${buildResponseBoundaryHelpers('FALLBACK_RESPONSE_BOUNDARY')}
    const roots = [
      document.querySelector('section[data-testid="screen-threadFlyOut"]'),
      document.querySelector('[data-testid="chat-thread"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
    ].filter(Boolean);
    if (roots.length === 0) return null;
    const markdownSelector = '.markdown,[data-message-content],[data-testid*="message"],.prose,[class*="markdown"]';
    const isExcluded = (node) =>
      Boolean(
        node?.closest?.(
          'nav, aside, [data-testid*="sidebar"], [data-testid*="chat-history"], [data-testid*="composer"], [data-testid="tool-approval-card"], [data-testid*="tool-approval"], form',
        ),
      );
    const scoreRoot = (node) => {
      const actions = node.querySelectorAll('${FINISHED_ACTIONS_SELECTOR}').length;
      const assistants = node.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"]').length;
      const markdowns = node.querySelectorAll(markdownSelector).length;
      return actions * 10 + assistants * 5 + markdowns;
    };
    let root = roots[0];
    let bestScore = scoreRoot(root);
    for (let i = 1; i < roots.length; i += 1) {
      const candidate = roots[i];
      const score = scoreRoot(candidate);
      if (score > bestScore) {
        bestScore = score;
        root = candidate;
      }
    }
    if (!root) return null;
    const CONVERSATION_SELECTOR = '${CONVERSATION_TURN_SELECTOR}';
    const turnNodes = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
    const hasTurns = turnNodes.length > 0;
    const resolveTurnIndex = (node) => {
      const turn = node?.closest?.(CONVERSATION_SELECTOR);
      if (!turn) return null;
      const idx = turnNodes.indexOf(turn);
      return idx >= 0 ? idx : null;
    };
    const readBoundarySnapshot = (node, text) => {
      const turn = node?.closest?.(CONVERSATION_SELECTOR);
      const idx = resolveTurnIndex(node);
      const messageNode = node?.closest?.('[data-message-id]') || turn?.querySelector?.('[data-message-id]');
      return {
        text,
        messageId: node?.getAttribute?.('data-message-id') || messageNode?.getAttribute?.('data-message-id') || null,
        turnId: turn?.getAttribute?.('data-testid') || null,
        turnIndex: idx,
      };
    };
    const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
    const collectUserText = (scope) => {
      if (!scope?.querySelectorAll) return '';
      const userTurns = Array.from(scope.querySelectorAll('[data-message-author-role="user"], [data-turn="user"]'));
      const lastUser = userTurns[userTurns.length - 1];
      return lastUser ? normalize(lastUser.innerText || lastUser.textContent || '') : '';
    };
    const userText = collectUserText(root) || collectUserText(document);
    const isUserEcho = (text) => {
      if (!userText) return false;
      const normalized = normalize(text);
      if (!normalized) return false;
      return normalized === userText || normalized.startsWith(userText);
    };
    const markdowns = Array.from(root.querySelectorAll(markdownSelector))
      .filter((node) => !isExcluded(node))
      .filter((node) => {
        const container = node.closest('[data-message-author-role], [data-turn]');
        if (!container) return true;
        const role =
          (container.getAttribute('data-message-author-role') || container.getAttribute('data-turn') || '').toLowerCase();
        return role !== 'user';
      });
    if (markdowns.length === 0) return null;
    const actionButtons = Array.from(root.querySelectorAll('${FINISHED_ACTIONS_SELECTOR}'));
    const actionMarkdowns = [];
    for (const button of actionButtons) {
      const container =
        button.closest('${CONVERSATION_TURN_SELECTOR}') ||
        button.closest('[data-message-author-role="assistant"], [data-turn="assistant"]') ||
        button.closest('[data-message-author-role], [data-turn]') ||
        button.closest('[data-testid*="assistant"]');
      if (!container || container === root || container === document.body) continue;
      const scoped = Array.from(container.querySelectorAll(markdownSelector))
        .filter((node) => !isExcluded(node))
        .filter((node) => {
          const roleNode = node.closest('[data-message-author-role], [data-turn]');
          if (!roleNode) return true;
          const role =
            (roleNode.getAttribute('data-message-author-role') || roleNode.getAttribute('data-turn') || '').toLowerCase();
          return role !== 'user';
        });
      if (scoped.length === 0) continue;
      for (const node of scoped) {
        actionMarkdowns.push(node);
      }
    }
    const assistantMarkdowns = markdowns.filter((node) => {
      const container = node.closest('[data-message-author-role], [data-turn], [data-testid*="assistant"]');
      if (!container) return false;
      const role =
        (container.getAttribute('data-message-author-role') || container.getAttribute('data-turn') || '').toLowerCase();
      if (role === 'assistant') return true;
      const testId = (container.getAttribute('data-testid') || '').toLowerCase();
      return testId.includes('assistant');
    });
    const hasAssistantIndicators = Boolean(
      root.querySelector('${FINISHED_ACTIONS_SELECTOR}') ||
        root.querySelector('[data-message-author-role="assistant"], [data-turn="assistant"], [data-testid*="assistant"]'),
    );
    const allowMarkdownFallback = hasAssistantIndicators || hasTurns || Boolean(userText);
    const candidates =
      actionMarkdowns.length > 0
        ? actionMarkdowns
        : assistantMarkdowns.length > 0
          ? assistantMarkdowns
          : allowMarkdownFallback
            ? markdowns
            : [];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const node = candidates[i];
      if (!node) continue;
      const text = (node.innerText || node.textContent || '').trim();
      if (!text) continue;
      if (isUserEcho(text)) continue;
      const boundarySnapshot = readBoundarySnapshot(node, text);
      if (!responseBoundaryState(boundarySnapshot, turnNodes.length)) continue;
      const html = node.innerHTML ?? '';
      return { text, html, ...boundarySnapshot };
    }
    return null;
  })`;
}

function buildCopyExpression(meta: { messageId?: string | null; turnId?: string | null }): string {
  return `(() => {
    ${buildClickDispatcher()}
    const BUTTON_SELECTORS = ${JSON.stringify(COPY_BUTTON_SELECTORS)};
    const TIMEOUT_MS = 10000;
    const queryButtons = (node) => {
      if (!node) return [];
      return BUTTON_SELECTORS.flatMap((selector) => Array.from(node.querySelectorAll(selector)));
    };

    const locateButton = () => {
      const hint = ${JSON.stringify(meta ?? {})};
      if (hint?.messageId) {
        const node = document.querySelector('[data-message-id="' + hint.messageId + '"]');
        const buttons = queryButtons(node);
        const button = buttons.at(-1) ?? null;
        if (button) {
          return button;
        }
      }
      if (hint?.turnId) {
        const node = document.querySelector('[data-testid="' + hint.turnId + '"]');
        const buttons = queryButtons(node);
        const button = buttons.at(-1) ?? null;
        if (button) {
          return button;
        }
      }
      const CONVERSATION_SELECTOR = ${JSON.stringify(CONVERSATION_TURN_SELECTOR)};
      const ASSISTANT_SELECTOR = '${ASSISTANT_ROLE_SELECTOR}';
      const isAssistantTurn = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const turnAttr = (node.getAttribute('data-turn') || node.dataset?.turn || '').toLowerCase();
        if (turnAttr === 'assistant') return true;
        const role = (node.getAttribute('data-message-author-role') || node.dataset?.messageAuthorRole || '').toLowerCase();
        if (role === 'assistant') return true;
        const testId = (node.getAttribute('data-testid') || '').toLowerCase();
        if (testId.includes('assistant')) return true;
        return Boolean(node.matches(ASSISTANT_SELECTOR) || node.querySelector(ASSISTANT_SELECTOR) || node.querySelector('[data-testid*="assistant"]'));
      };
      const turns = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
      for (let i = turns.length - 1; i >= 0; i -= 1) {
        const turn = turns[i];
        if (!isAssistantTurn(turn)) continue;
        const button = queryButtons(turn)[0] ?? null;
        if (button) {
          return button;
        }
      }
      const all = queryButtons(document);
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const button = all[i];
        const turn = button?.closest?.(CONVERSATION_SELECTOR);
        if (turn && isAssistantTurn(turn)) {
          return button;
        }
      }
      return null;
    };

    const interceptClipboard = () => {
      const clipboard = navigator.clipboard;
      const state = { text: '', updatedAt: 0 };
      if (!clipboard) {
        return { state, restore: () => {} };
      }
      const originalWriteText = clipboard.writeText;
      const originalWrite = clipboard.write;
      clipboard.writeText = (value) => {
        state.text = typeof value === 'string' ? value : '';
        state.updatedAt = Date.now();
        return Promise.resolve();
      };
      clipboard.write = async (items) => {
        try {
          const list = Array.isArray(items) ? items : items ? [items] : [];
          for (const item of list) {
            if (!item) continue;
            const types = Array.isArray(item.types) ? item.types : [];
            if (types.includes('text/plain') && typeof item.getType === 'function') {
              const blob = await item.getType('text/plain');
              const text = await blob.text();
              state.text = text ?? '';
              state.updatedAt = Date.now();
              break;
            }
          }
        } catch {
          state.text = '';
          state.updatedAt = Date.now();
        }
        return Promise.resolve();
      };
      return {
        state,
        restore: () => {
          clipboard.writeText = originalWriteText;
          clipboard.write = originalWrite;
        },
      };
    };

    return new Promise((resolve) => {
      const deadline = Date.now() + TIMEOUT_MS;
      const waitForButton = () => {
        const button = locateButton();
        if (button) {
          const interception = interceptClipboard();
          let settled = false;
          let pollId = null;
          let timeoutId = null;
          const finish = (payload) => {
            if (settled) {
              return;
            }
            settled = true;
            if (pollId) {
              clearInterval(pollId);
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            button.removeEventListener('copy', handleCopy, true);
            interception.restore?.();
            resolve(payload);
          };

          const readIntercepted = () => {
            const markdown = interception.state.text ?? '';
            const updatedAt = interception.state.updatedAt ?? 0;
            return { success: Boolean(markdown.trim()), markdown, updatedAt };
          };

          let lastText = '';
          let stableTicks = 0;
          const requiredStableTicks = 3;
          const requiredStableMs = 250;
          const maybeFinish = () => {
            const payload = readIntercepted();
            if (!payload.success) return;
            if (payload.markdown !== lastText) {
              lastText = payload.markdown;
              stableTicks = 0;
              return;
            }
            stableTicks += 1;
            const ageMs = Date.now() - (payload.updatedAt || 0);
            if (stableTicks >= requiredStableTicks && ageMs >= requiredStableMs) {
              finish(payload);
            }
          };

          const handleCopy = () => {
            maybeFinish();
          };

          button.addEventListener('copy', handleCopy, true);
          button.scrollIntoView({ block: 'center', behavior: 'instant' });
          dispatchClickSequence(button);
          pollId = setInterval(maybeFinish, 120);
          timeoutId = setTimeout(() => {
            button.removeEventListener('copy', handleCopy, true);
            finish({ success: false, status: 'timeout' });
          }, TIMEOUT_MS);
          return;
        }
        if (Date.now() > deadline) {
          resolve({ success: false, status: 'missing-button' });
          return;
        }
        setTimeout(waitForButton, 120);
      };

      waitForButton();
    });
  })()`;
}

interface AssistantSnapshot {
  text?: string;
  html?: string;
  messageId?: string | null;
  turnId?: string | null;
  turnIndex?: number | null;
}

const LANGUAGE_TAGS = new Set(
  [
    'copy code',
    'markdown',
    'bash',
    'sh',
    'shell',
    'javascript',
    'typescript',
    'ts',
    'js',
    'yaml',
    'json',
    'python',
    'py',
    'go',
    'java',
    'c',
    'c++',
    'cpp',
    'c#',
    'php',
    'ruby',
    'rust',
    'swift',
    'kotlin',
    'html',
    'css',
    'sql',
    'text',
  ].map((token) => token.toLowerCase()),
);

function cleanAssistantText(text: string): string {
  const normalized = text.replace(/\u00a0/g, ' ');
  const lines = normalized.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    if (LANGUAGE_TAGS.has(trimmed)) return false;
    return true;
  });
  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
