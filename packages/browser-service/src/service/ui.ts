import type { ChromeClient } from '../types.js';
import type { BrowserInteractionClass, BrowserInteractionGovernor } from './interactionGovernor.js';
import {
  beginBrowserMutation,
  type BrowserMutationAuditSink,
  type BrowserMutationKind,
} from './mutationDispatcher.js';
import type {
  ProviderTrafficAction,
  ProviderTrafficGovernor,
} from './providerTrafficGovernor.js';
import { ProviderTrafficGovernorRequiredError } from './providerTrafficGovernor.js';

export const DEFAULT_DIALOG_SELECTORS = ['[role="dialog"]', 'dialog', '[aria-modal="true"]'] as const;
const DEFAULT_VISIBLE_MENU_SELECTORS = [
  '[role="menu"]',
  '[role="listbox"]',
  '[data-radix-menu-content][data-state="open"]',
  '[data-radix-collection-root]',
] as const;
const DEFAULT_VISIBLE_MENU_ITEM_SELECTORS = [
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[data-radix-collection-item]',
  'button',
  'a',
] as const;
const DEFAULT_VISIBLE_OVERLAY_SELECTORS = ['[role="dialog"]', 'dialog', '[aria-modal="true"]', '[role="alert"]', '[aria-live]'] as const;
const DEFAULT_VISIBLE_OVERLAY_BUTTON_SELECTORS = ['button', '[role="button"]'] as const;

export type LabelMatchOptions = {
  includeAny?: string[];
  includeAll?: string[];
  startsWith?: string[];
  exact?: string[];
};

export type UiInteractionStrategy =
  | 'click'
  | 'pointer'
  | 'keyboard-enter'
  | 'keyboard-space'
  | 'keyboard-arrowdown';

export type FindAndClickOptions = {
  selectors: string[];
  match: LabelMatchOptions;
  rootSelectors?: readonly string[];
};

export type PressButtonOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  interactionStrategies?: readonly UiInteractionStrategy[];
  requireVisible?: boolean;
  timeoutMs?: number;
  postSelector?: string;
  postGoneSelector?: string;
  logCandidatesOnMiss?: boolean;
};

export type TrustedPointerPressButtonResult = {
  ok: boolean;
  reason?: string;
  matchedLabel?: string;
  rootSelectorUsed?: string | null;
  trusted?: boolean;
};

export type SetInputValueOptions = {
  selector?: string;
  match?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  value: string;
  requireVisible?: boolean;
  timeoutMs?: number;
};

export type QueryRowMatch = {
  text: string;
  caseSensitive?: boolean;
};

export type EnsureCollapsibleExpandedOptions = {
  rootSelector: string;
  rowSelector: string;
  toggleSelector?: string;
  toggleMatch?: LabelMatchOptions;
  timeoutMs?: number;
};

export type HoverRowActionOptions = {
  rootSelector: string;
  rowSelector: string;
  match: QueryRowMatch;
  actionMatch: LabelMatchOptions;
  timeoutMs?: number;
};

export type RowMatchInfo = {
  ok: boolean;
  reason?: string;
  selector?: string;
  text?: string;
};

export type OpenMenuOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  anchorSelector?: string;
  anchorRootSelectors?: readonly string[];
  expectedItemMatch?: LabelMatchOptions;
  timeoutMs?: number;
};

export type OpenSurfaceAttempt = {
  name: string;
  trigger: PressButtonOptions;
};

export type OpenSurfaceOptions = {
  attempts: readonly OpenSurfaceAttempt[];
  readyExpression?: string;
  readySelector?: string;
  readyDescription?: string;
  timeoutMs?: number;
  readyTimeoutMs?: number;
  alreadyOpenTimeoutMs?: number;
  pollMs?: number;
};

export type OpenSurfaceResult = {
  ok: boolean;
  attempt?: string;
  reason?: string;
  attempts: Array<{
    name: string;
    triggerOk: boolean;
    triggerReason?: string;
    matchedLabel?: string;
    readyOk?: boolean;
  }>;
};

export type OrderedSurfaceFallbackAttempt<T> = {
  name: string;
  run: () => Promise<T>;
};

export type RunOrderedSurfaceFallbackOptions<T> = {
  attempts: readonly OrderedSurfaceFallbackAttempt<T>[];
  isSuccess?: (value: T) => boolean;
};

export type RunOrderedSurfaceFallbackResult<T> = {
  ok: boolean;
  attempt?: string;
  value?: T;
  attempts: Array<{
    name: string;
    ok: boolean;
  }>;
};

export type WaitForAttachmentSignalsOptions<T> = {
  read: () => Promise<T>;
  isReady: (value: T) => boolean;
  timeoutMs: number;
  pollMs?: number;
  requiredStablePolls?: number;
  formatLastState?: (value: T) => string;
  timeoutMessage?: string;
};

export type OpenRadixMenuOptions = OpenMenuOptions;

export type SelectMenuItemOptions = {
  menuSelector?: string;
  menuRootSelectors?: readonly string[];
  itemMatch: LabelMatchOptions;
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type WaitForMenuOpenOptions = {
  menuSelector?: string;
  fallbackSelectors?: string[];
  anchorSelector?: string;
  anchorRootSelectors?: readonly string[];
  expectedItemMatch?: LabelMatchOptions;
  existingMenuSignatures?: readonly string[];
  timeoutMs?: number;
};

export type VisibleMenuInventoryItem = {
  label: string;
  role?: string | null;
  selected: boolean;
};

export type VisibleMenuInventoryEntry = {
  selector: string;
  sourceSelector: string;
  signature: string;
  rect: { x: number; y: number; width: number; height: number };
  distanceToAnchor: number | null;
  items: VisibleMenuInventoryItem[];
  itemLabels: string[];
};

export type CollectVisibleMenuInventoryOptions = {
  menuSelectors?: readonly string[];
  itemSelectors?: readonly string[];
  anchorSelector?: string;
  anchorRootSelectors?: readonly string[];
  limit?: number;
};

export type VisibleOverlayInventoryEntry = {
  selector: string;
  sourceSelector: string;
  signature: string;
  rect: { x: number; y: number; width: number; height: number };
  distanceToAnchor: number | null;
  tag: string | null;
  role: string | null;
  ariaLabel: string | null;
  text: string | null;
  buttonLabels: string[];
};

export type CollectVisibleOverlayInventoryOptions = {
  overlaySelectors?: readonly string[];
  buttonSelectors?: readonly string[];
  anchorSelector?: string;
  anchorRootSelectors?: readonly string[];
  limit?: number;
};

export type DismissOverlayRootOptions = {
  closeButtonMatch?: LabelMatchOptions;
  buttonSelectors?: readonly string[];
  timeoutMs?: number;
};

export type BlockingSurfaceMatch = {
  kind: string;
  summary: string;
  selector?: string | null;
  details?: Record<string, unknown> | null;
};

export type ActionPhaseDiagnosticsEntry<T> = {
  phase: string;
  value: T;
};

export type CaptureActionPhaseDiagnosticsOptions<T> = {
  phases: readonly string[] | readonly { name: string; pauseMs?: number }[];
  capture: (phase: string) => Promise<T>;
};

export type WithBlockingSurfaceRecoveryOptions<TMatch extends BlockingSurfaceMatch = BlockingSurfaceMatch> = {
  inspect: () => Promise<TMatch | null>;
  dismiss?: (match: TMatch) => Promise<void>;
  classifyError?: (error: unknown) => Promise<TMatch | null> | TMatch | null;
  pauseMs?: number;
  retries?: number;
  label?: string;
  onRecover?: (event: { match: TMatch; phase: 'pre' | 'post' | 'error'; attempt: number }) => Promise<void> | void;
};

export type SelectFromListboxOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  listboxSelector?: string;
  timeoutMs?: number;
  closeAfter?: boolean;
};

export type OpenSubmenuOptions = {
  parentMenuSelector: string;
  itemMatch: LabelMatchOptions;
  submenuSelector?: string;
  expectedItemMatch?: LabelMatchOptions;
  interactionStrategies?: readonly UiInteractionStrategy[];
  timeoutMs?: number;
};

export type OpenSubmenuResult = {
  ok: boolean;
  menuSelector?: string;
  interactionStrategy?: UiInteractionStrategy;
  reason?: string;
};

export type NestedMenuPathStep = {
  itemMatch: LabelMatchOptions;
  menuSelector?: string;
  interactionStrategies?: readonly UiInteractionStrategy[];
};

export type SelectNestedMenuPathOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  steps: readonly NestedMenuPathStep[];
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type SelectNestedMenuPathResult = {
  ok: boolean;
  menuSelector?: string;
  failedStep?: number;
  reason?: string;
};

export type InspectNestedMenuPathSelectionOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  steps: readonly NestedMenuPathStep[];
  selectedItemMatch?: LabelMatchOptions;
  timeoutMs?: number;
  closeMenusAfter?: boolean;
};

export type InspectNestedMenuPathSelectionResult = {
  ok: boolean;
  selected?: boolean;
  label?: string | null;
  menuSelector?: string;
  failedStep?: number;
  reason?: string;
  availableLabels?: string[];
};

export type SelectAndVerifyNestedMenuPathOptionOptions = {
  trigger: PressButtonOptions;
  menuSelector?: string;
  steps: readonly NestedMenuPathStep[];
  selectedItemMatch?: LabelMatchOptions;
  timeoutMs?: number;
  closeMenusAfter?: boolean;
};

export type SelectAndVerifyNestedMenuPathOptionResult = {
  ok: boolean;
  alreadySelected?: boolean;
  label?: string | null;
  menuSelector?: string;
  failedStep?: number;
  reason?: string;
  phase?: 'inspect' | 'select' | 'verify';
  availableLabels?: string[];
};

export type OpenAndSelectMenuItemOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  menuSelector?: string;
  menuRootSelectors?: readonly string[];
  timeoutMs?: number;
  closeMenuAfter?: boolean;
};

export type FallbackMenuTriggerOption = {
  name?: string;
  trigger: PressButtonOptions;
  menuSelector?: string;
  menuRootSelectors?: readonly string[];
  closeMenuAfter?: boolean;
  beforeAttempt?: () => Promise<void> | void;
};

export type OpenAndSelectMenuItemFromTriggersOptions = {
  triggers: readonly FallbackMenuTriggerOption[];
  itemMatch: LabelMatchOptions;
  timeoutMs?: number;
  dismissOpenMenusBetweenAttempts?: boolean;
};

export type OpenAndSelectMenuItemFromTriggersResult = {
  ok: boolean;
  triggerIndex?: number;
  triggerName?: string;
  menuSelector?: string;
  reason?: string;
  attempts: Array<{
    triggerIndex: number;
    triggerName?: string;
    menuOpened: boolean;
    menuSelected: boolean;
    reason?: string;
    menuSelector?: string;
  }>;
};

export type OpenAndSelectListboxOptions = {
  trigger: PressButtonOptions;
  itemMatch: LabelMatchOptions;
  listboxSelector?: string;
  timeoutMs?: number;
  closeAfter?: boolean;
};

export type TogglePanelOptions = {
  trigger: PressButtonOptions;
  isOpenSelector: string;
  open: boolean;
  timeoutMs?: number;
};

export type PressMenuButtonByAriaLabelOptions = {
  label: string;
  rootSelectors?: readonly string[];
  menuSelector?: string;
  timeoutMs?: number;
};

export type HoverElementOptions = {
  selector: string;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type HoverElementResult = {
  ok: boolean;
  reason?: string;
  point?: { x: number; y: number };
  rect?: { x: number; y: number; width: number; height: number };
  element?: { tag?: string | null; ariaLabel?: string | null; className?: string | null; id?: string | null };
};

export type HoverAndRevealOptions = {
  rowSelector: string;
  actionMatch?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type HoverAndRevealResult = {
  ok: boolean;
  reason?: string;
  point?: { x: number; y: number };
  row?: { selector: string };
  actions?: { label: string }[];
};

export type PressRowActionOptions = {
  anchorSelector: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type ClickRevealedRowActionOptions = {
  rowSelector: string;
  anchorSelector?: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
};

export type OpenRevealedRowMenuOptions = {
  rowSelector: string;
  triggerSelector: string;
  actionMatch: LabelMatchOptions;
  rootSelectors?: readonly string[];
  triggerRootSelectors?: readonly string[];
  menuSelector?: string;
  prepareTriggerBeforeOpen?: boolean;
  directTriggerClickFallback?: boolean;
  timeoutMs?: number;
};

export type OpenAndSelectRevealedRowMenuItemOptions = OpenRevealedRowMenuOptions & {
  itemMatch: LabelMatchOptions;
  closeMenuAfter?: boolean;
  itemInteractionStrategies?: readonly UiInteractionStrategy[];
  itemRootSelectors?: readonly string[];
};

export type PressDialogButtonOptions = {
  match: LabelMatchOptions;
  rootSelectors?: readonly string[];
  timeoutMs?: number;
  preferLast?: boolean;
};

export type SubmitInlineRenameOptions = {
  value: string;
  inputSelector?: string;
  inputMatch?: LabelMatchOptions;
  rootSelectors?: readonly string[];
  saveButtonMatch?: LabelMatchOptions;
  timeoutMs?: number;
  closeSelector?: string;
  requireEditable?: boolean;
  entryStrategy?: 'setter' | 'native-input';
  submitStrategy?: 'synthetic-enter' | 'native-enter' | 'native-then-synthetic' | 'blur-body-click';
  closeGraceMs?: number;
};

export type DownloadCapture = {
  href: string | null;
  downloadName: string | null;
};

export type CaptureDownloadOptions = {
  stateKey?: string;
  timeoutMs?: number;
  pollMs?: number;
  requireTarget?: boolean;
};

export type WaitForPredicateOptions = {
  timeoutMs?: number;
  pollMs?: number;
  description?: string;
  evaluationTimeoutMs?: number;
  interrupt?: () => Promise<void> | void;
  interruptPollMs?: number;
};

export type WaitForPredicateResult = {
  ok: boolean;
  value?: unknown;
  attempts: number;
  elapsedMs: number;
  description?: string;
};

export type WaitForDocumentReadyOptions = WaitForPredicateOptions & {
  states?: Array<'loading' | 'interactive' | 'complete'>;
  requireVisible?: boolean;
};

export type WaitForVisibleSelectorOptions = WaitForPredicateOptions & {
  rootSelectors?: readonly string[];
};

export type WaitForScriptTextOptions = WaitForPredicateOptions & {
  includeAny?: string[];
  includeAll?: string[];
  scriptSelector?: string;
  caseSensitive?: boolean;
};

export type NavigateAndSettleOptions = WaitForPredicateOptions & {
  url: string;
  forceNavigation?: boolean;
  routeExpression?: string;
  routeDescription?: string;
  readyExpression?: string;
  readyDescription?: string;
  waitForDocumentReady?: boolean;
  documentReadyStates?: Array<'loading' | 'interactive' | 'complete'>;
  requireVisibleDocument?: boolean;
  fallbackToLocationAssign?: boolean;
  fallbackTimeoutMs?: number;
  mutationAudit?: BrowserMutationAuditSink;
  mutationSource?: string;
  interactionGovernor?: BrowserInteractionGovernor;
  providerTrafficGovernor?: ProviderTrafficGovernor;
  interactionClass?: BrowserInteractionClass;
  /**
   * Settles the governed navigation audit from caller-owned response evidence
   * when the CDP Page.navigate acknowledgement may remain pending. A rejected
   * navigation command still fails the operation.
   */
  completionSignal?: Promise<{ ok: boolean; reason?: string }>;
};

export type NavigateAndSettleResult = {
  ok: boolean;
  url: string;
  fallbackUsed: boolean;
  mutationPerformed: boolean;
  phase: 'complete' | 'route' | 'document-ready' | 'ready';
  reason?: string;
  route?: WaitForPredicateResult;
  documentReady?: WaitForPredicateResult;
  ready?: WaitForPredicateResult;
};

export type ReloadAndSettleOptions = WaitForPredicateOptions & {
  ignoreCache?: boolean;
  waitForDocumentReady?: boolean;
  documentReadyStates?: Array<'loading' | 'interactive' | 'complete'>;
  requireVisibleDocument?: boolean;
  fallbackToLocationReload?: boolean;
  mutationAudit?: BrowserMutationAuditSink;
  mutationSource?: string;
  interactionGovernor?: BrowserInteractionGovernor;
  providerTrafficGovernor?: ProviderTrafficGovernor;
  interactionClass?: BrowserInteractionClass;
  /**
   * Settles the governed reload audit from caller-owned response evidence when
   * the CDP Page.reload acknowledgement may remain pending. A rejected reload
   * command still fails the operation.
   */
  completionSignal?: Promise<{ ok: boolean; reason?: string }>;
};

export type ReloadAndSettleResult = {
  ok: boolean;
  fallbackUsed: boolean;
  reason?: string;
  documentReady?: WaitForPredicateResult;
};

async function beginUiPhysicalAction(input: {
  providerTrafficGovernor?: ProviderTrafficGovernor;
  interactionGovernor?: BrowserInteractionGovernor;
  interactionClass: BrowserInteractionClass;
  mutationAudit?: BrowserMutationAuditSink;
  kind: BrowserMutationKind;
  source: string;
  requestedUrl?: string | null;
  fromUrl?: string | null;
  fallbackUsed?: boolean;
  reason?: string | null;
  providerTrafficRequired?: boolean;
}): Promise<ProviderTrafficAction> {
  if (input.providerTrafficGovernor) {
    return input.providerTrafficGovernor.begin({
      kind: input.kind,
      interactionClass: input.interactionClass,
      source: input.source,
      requestedUrl: input.requestedUrl,
      fromUrl: input.fromUrl,
      fallbackUsed: input.fallbackUsed,
      reason: input.reason,
    });
  }
  if (input.providerTrafficRequired) {
    throw new ProviderTrafficGovernorRequiredError(input.source);
  }
  await input.interactionGovernor?.beforeInteraction(input.interactionClass);
  const legacy = beginBrowserMutation(input.mutationAudit, {
    kind: input.kind,
    source: input.source,
    requestedUrl: input.requestedUrl,
    fromUrl: input.fromUrl,
    fallbackUsed: input.fallbackUsed,
    reason: input.reason,
  });
  return {
    id: legacy.id,
    settle: legacy.complete,
  };
}

export type CollectUiDiagnosticsOptions = {
  rootSelectors?: readonly string[];
  dialogSelectors?: readonly string[];
  menuSelectors?: readonly string[];
  candidateSelectors?: readonly string[];
  buttonSelectors?: readonly string[];
  limit?: number;
  context?: Record<string, unknown>;
};

export type CollectAnchoredActionDiagnosticsOptions = {
  rowSelector?: string;
  triggerSelector?: string;
  editorSelector?: string;
  dialogSelectors?: readonly string[];
  menuSelectors?: readonly string[];
  anchorSelector?: string;
  anchorRootSelectors?: readonly string[];
  context?: Record<string, unknown>;
};

export type AnchoredActionDiagnostics = {
  row: {
    found: boolean;
    visible: boolean;
    text: string | null;
  };
  trigger: {
    found: boolean;
    visible: boolean;
    label: string | null;
  };
  editor: {
    found: boolean;
    visible: boolean;
    value: string | null;
  } | null;
  dialog: {
    found: boolean;
    visible: boolean;
    text: string | null;
  } | null;
  activeElement: {
    tag: string | null;
    ariaLabel: string | null;
    text: string | null;
  } | null;
  menus: VisibleMenuInventoryEntry[];
  overlays: VisibleOverlayInventoryEntry[];
  context?: Record<string, unknown>;
};

export type UiDiagnosticElement = {
  selector: string;
  tag: string | null;
  role: string | null;
  ariaLabel: string | null;
  text: string | null;
};

export type UiDiagnosticMenu = UiDiagnosticElement & {
  items: string[];
};

export type UiDiagnosticCandidate = {
  selector: string;
  count: number;
  samples: string[];
};

export type UiDiagnostics = {
  url: string | null;
  title: string | null;
  readyState: string | null;
  activeElement: {
    tag: string | null;
    role: string | null;
    ariaLabel: string | null;
    text: string | null;
  } | null;
  dialogs: UiDiagnosticElement[];
  menus: UiDiagnosticMenu[];
  buttons: UiDiagnosticElement[];
  candidates: UiDiagnosticCandidate[];
  roots: string[];
  context?: Record<string, unknown>;
};

export type WithUiDiagnosticsOptions = CollectUiDiagnosticsOptions & {
  label?: string;
};

export type WithAnchoredActionDiagnosticsOptions = CollectAnchoredActionDiagnosticsOptions & {
  label?: string;
  includeOnSuccess?: boolean;
};

const DEFAULT_WAIT_POLL_MS = 200;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveInteractionStrategies(
  strategies: readonly UiInteractionStrategy[] | undefined,
  fallback: readonly UiInteractionStrategy[],
): UiInteractionStrategy[] {
  const unique = new Set<UiInteractionStrategy>();
  for (const strategy of strategies ?? fallback) {
    unique.add(strategy);
  }
  return Array.from(unique);
}

function normalizeUiLabel(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreLabelMatch(label: string, match: LabelMatchOptions | undefined): number {
  if (!match) return label ? 1 : 0;
  const normalized = normalizeUiLabel(label);
  if (!normalized) return 0;

  let best = 0;
  for (const token of match.exact ?? []) {
    const normalizedToken = normalizeUiLabel(token);
    if (normalizedToken && normalized === normalizedToken) {
      best = Math.max(best, 4_000 + normalizedToken.length);
    }
  }
  for (const token of match.startsWith ?? []) {
    const normalizedToken = normalizeUiLabel(token);
    if (normalizedToken && normalized.startsWith(normalizedToken)) {
      best = Math.max(best, 3_000 + normalizedToken.length);
    }
  }
  const includeAll = (match.includeAll ?? []).map((token) => normalizeUiLabel(token)).filter(Boolean);
  if (includeAll.length > 0 && includeAll.every((token) => normalized.includes(token))) {
    best = Math.max(best, 2_000 + includeAll.join('').length);
  }
  for (const token of match.includeAny ?? []) {
    const normalizedToken = normalizeUiLabel(token);
    if (normalizedToken && normalized.includes(normalizedToken)) {
      best = Math.max(best, 1_000 + normalizedToken.length);
    }
  }
  return best;
}

function findBestVisibleMenuItemMatch(
  items: readonly VisibleMenuInventoryItem[],
  match: LabelMatchOptions | undefined,
): VisibleMenuInventoryItem | null {
  let best: VisibleMenuInventoryItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = scoreLabelMatch(item.label, match);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function isLikelyMenuContainerSelector(selector: string): boolean {
  const normalized = selector.toLowerCase();
  return !(
    normalized.includes('menuitem') ||
    normalized.includes('collection-item') ||
    normalized.includes('[role="option"]') ||
    normalized.includes('[role="button"]')
  );
}

function buildMenuFallbackSelectors(primarySelector?: string): string[] {
  return Array.from(
    new Set(
      [
        primarySelector,
        '[role="menu"]',
        '[role="listbox"]',
        '[data-radix-menu-content][data-state="open"]',
        '[data-radix-collection-root]',
        '[data-radix-collection-item]',
      ].filter((selector): selector is string => Boolean(selector)),
    ),
  );
}

async function dispatchMatchedTrigger(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions,
  interactionStrategy: UiInteractionStrategy,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string; listId?: string; rootSelectorUsed?: string | null }> {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const interactionStrategy = ${JSON.stringify(interactionStrategy)};
      const logCandidatesOnMiss = ${JSON.stringify(options.logCandidatesOnMiss ?? false)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => ({ selector: sel, root: document.querySelector(sel) })).filter((entry) => entry.root)
        : [{ selector: 'document', root: document }];
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const dispatchInteraction = (match) => {
        if (interactionStrategy === 'pointer') {
          const pointerOpts = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 };
          match.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
          match.dispatchEvent(new MouseEvent('mousedown', pointerOpts));
          match.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
          match.dispatchEvent(new MouseEvent('mouseup', pointerOpts));
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return;
        }
        if (interactionStrategy === 'keyboard-enter') {
          match.focus?.();
          const keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        if (interactionStrategy === 'keyboard-space') {
          match.focus?.();
          const keyOpts = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        if (interactionStrategy === 'keyboard-arrowdown') {
          match.focus?.();
          const keyOpts = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true };
          match.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          match.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          return;
        }
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        match.dispatchEvent(clickEvent);
      };

      const candidateLabels = [];
      for (const entry of roots) {
        const root = entry.root;
        if (!root) continue;
        const candidates = selector
          ? Array.from(root.querySelectorAll(selector))
          : Array.from(
              root.querySelectorAll(
                'button,[role="button"],a,[role="link"],[role="menuitem"],[role="menuitemradio"],[role="option"]',
              )
            );
        const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
        const match = selector
          ? visibleCandidates[0] || null
          : visibleCandidates.find((el) => {
              const label = normalize(el.getAttribute?.('aria-label') || el.textContent || '');
              return matchesLabel(label);
            }) || null;
        if (!match) {
          if (logCandidatesOnMiss) {
            candidateLabels.push(
              ...visibleCandidates
                .map((el) => normalize(el.getAttribute?.('aria-label') || el.textContent || ''))
                .filter(Boolean)
                .slice(0, 12 - candidateLabels.length),
            );
          }
          continue;
        }
        const label = normalize(match.getAttribute?.('aria-label') || match.textContent || '');
        const listId = match.getAttribute?.('aria-controls') || '';
        dispatchInteraction(match);
        return {
          ok: true,
          matchedLabel: label,
          listId,
          rootSelectorUsed: entry.selector,
        };
      }

      if (logCandidatesOnMiss && candidateLabels.length > 0) {
        return { ok: false, reason: 'Button not found (candidates: ' + candidateLabels.join(', ') + ')' };
      }
      return { ok: false, reason: 'Button not found' };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as
    | { ok?: boolean; reason?: string; matchedLabel?: string; listId?: string; rootSelectorUsed?: string | null }
    | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason || 'Button click failed' };
  }
  return {
    ok: true,
    matchedLabel: info.matchedLabel,
    listId: info.listId,
    rootSelectorUsed: info.rootSelectorUsed ?? null,
  };
}

/** A bounded predicate evaluation expired; this does not establish a false predicate. */
export class PredicateEvaluationTimeoutError extends Error {
  constructor(description: string, timeoutMs: number) {
    super(`Timed out waiting for ${description} after ${timeoutMs}ms.`);
    this.name = 'PredicateEvaluationTimeoutError';
  }
}

export async function waitForPredicate(
  Runtime: ChromeClient['Runtime'],
  expression: string,
  options: WaitForPredicateOptions = {},
): Promise<WaitForPredicateResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollMs = options.pollMs ?? DEFAULT_WAIT_POLL_MS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastValue: unknown;
  let lastInterruptAt = Number.NEGATIVE_INFINITY;
  while (Date.now() < deadline) {
    attempts += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const evaluationTimeoutMs = Math.max(
      1,
      Math.min(options.evaluationTimeoutMs ?? remainingMs, remainingMs),
    );
    const evaluation = Runtime.evaluate({
      expression,
      returnByValue: true,
      timeout: evaluationTimeoutMs,
    });
    const { result } = await new Promise<Awaited<typeof evaluation>>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new PredicateEvaluationTimeoutError(options.description ?? 'predicate', evaluationTimeoutMs),
        );
      }, evaluationTimeoutMs);
      evaluation.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
    lastValue = result?.value;
    if (result?.value) {
      return {
        ok: true,
        value: result.value,
        attempts,
        elapsedMs: Date.now() - startedAt,
        description: options.description,
      };
    }
    const interruptPollMs = Math.max(0, options.interruptPollMs ?? 0);
    if (options.interrupt && Date.now() - lastInterruptAt >= interruptPollMs) {
      lastInterruptAt = Date.now();
      await options.interrupt();
    }
    await sleep(pollMs);
  }
  return {
    ok: false,
    value: lastValue,
    attempts,
    elapsedMs: Date.now() - startedAt,
    description: options.description,
  };
}

export async function waitForDocumentReady(
  Runtime: ChromeClient['Runtime'],
  options: WaitForDocumentReadyOptions = {},
): Promise<WaitForPredicateResult> {
  const states = options.states?.length ? options.states : ['interactive', 'complete'];
  const requireVisible = options.requireVisible ?? false;
  return waitForPredicate(
    Runtime,
    `(() => {
      const allowedStates = ${JSON.stringify(states)};
      const readyState = document.readyState;
      const visibilityState = document.visibilityState ?? null;
      const ok =
        allowedStates.includes(readyState) &&
        (${JSON.stringify(requireVisible)} ? visibilityState === 'visible' : true);
      if (!ok) {
        return null;
      }
      return { readyState, visibilityState };
    })()`,
    {
      ...options,
      description:
        options.description ??
        `document.readyState in [${states.join(', ')}]${requireVisible ? ' and visible' : ''}`,
    },
  );
}

export async function waitForVisibleSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  options: WaitForVisibleSelectorOptions = {},
): Promise<WaitForPredicateResult> {
  const rootSelectors = options.rootSelectors ?? [];
  return waitForPredicate(
    Runtime,
    `(() => {
      const selector = ${JSON.stringify(selector)};
      const rootSelectors = ${JSON.stringify(rootSelectors)};
      const roots = rootSelectors.length
        ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
        : [document];
      for (const root of roots) {
        const node = root?.querySelector?.(selector);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        return {
          tagName: node.tagName?.toLowerCase?.() ?? null,
          text: (node.textContent || '').trim().slice(0, 120) || null,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
      return null;
    })()`,
    {
      ...options,
      description: options.description ?? `visible selector ${selector}`,
    },
  );
}

export async function waitForScriptText(
  Runtime: ChromeClient['Runtime'],
  options: WaitForScriptTextOptions,
): Promise<WaitForPredicateResult> {
  const includeAny = options.includeAny ?? [];
  const includeAll = options.includeAll ?? [];
  const caseSensitive = options.caseSensitive ?? false;
  const scriptSelector = options.scriptSelector ?? 'script';
  return waitForPredicate(
    Runtime,
    `(() => {
      const includeAny = ${JSON.stringify(includeAny)};
      const includeAll = ${JSON.stringify(includeAll)};
      const caseSensitive = ${JSON.stringify(caseSensitive)};
      const normalize = (value) => {
        const text = String(value || '');
        return caseSensitive ? text : text.toLowerCase();
      };
      const texts = Array.from(document.querySelectorAll(${JSON.stringify(scriptSelector)}))
        .map((node) => normalize(node.textContent || ''))
        .filter(Boolean);
      const anyTokens = includeAny.map(normalize);
      const allTokens = includeAll.map(normalize);
      const match = texts.find((text) => {
        if (allTokens.length && !allTokens.every((token) => text.includes(token))) {
          return false;
        }
        if (anyTokens.length && !anyTokens.some((token) => text.includes(token))) {
          return false;
        }
        return allTokens.length > 0 || anyTokens.length > 0;
      });
      if (!match) {
        return null;
      }
      return {
        matchedLength: match.length,
        preview: match.slice(0, 160),
      };
    })()`,
    {
      ...options,
      description:
        options.description ??
        `script text contains ${[...includeAll, ...includeAny].map((token) => JSON.stringify(token)).join(', ')}`,
    },
  );
}

export async function navigateAndSettle(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  options: NavigateAndSettleOptions,
): Promise<NavigateAndSettleResult> {
  const mutationSource = options.mutationSource ?? 'browser-service:navigateAndSettle';
  const providerTrafficGovernor = options.providerTrafficGovernor ??
    (client as { __auracallProviderTrafficGovernor?: ProviderTrafficGovernor }).__auracallProviderTrafficGovernor;
  const providerTrafficRequired =
    (client as { __auracallProviderTrafficRequired?: boolean }).__auracallProviderTrafficRequired === true;
  const mutationAudit = options.mutationAudit;
  const fromUrl = await readLocationHrefForAudit(client.Runtime);
  const evaluateState = async (
    timeoutMs: number | undefined,
    fallbackUsed: boolean,
    mutationPerformed: boolean,
  ): Promise<NavigateAndSettleResult> => {
    let route: WaitForPredicateResult | undefined;
    if (options.routeExpression) {
      route = await waitForPredicate(client.Runtime, options.routeExpression, {
        timeoutMs,
        pollMs: options.pollMs,
        description: options.routeDescription ?? `route settled for ${options.url}`,
      });
      if (!route.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          mutationPerformed,
          phase: 'route',
          route,
          reason: `${route.description ?? 'route'} did not settle`,
        };
      }
    }

    let documentReady: WaitForPredicateResult | undefined;
    if (options.waitForDocumentReady !== false) {
      documentReady = await waitForDocumentReady(client.Runtime, {
        timeoutMs,
        pollMs: options.pollMs,
        states: options.documentReadyStates,
        requireVisible: options.requireVisibleDocument,
        description: `document ready for ${options.url}`,
      });
      if (!documentReady.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          mutationPerformed,
          phase: 'document-ready',
          route,
          documentReady,
          reason: `${documentReady.description ?? 'document ready'} did not settle`,
        };
      }
    }

    let ready: WaitForPredicateResult | undefined;
    if (options.readyExpression) {
      ready = await waitForPredicate(client.Runtime, options.readyExpression, {
        timeoutMs,
        pollMs: options.pollMs,
        description: options.readyDescription ?? `ready state for ${options.url}`,
      });
      if (!ready.ok) {
        return {
          ok: false,
          url: options.url,
          fallbackUsed,
          mutationPerformed,
          phase: 'ready',
          route,
          documentReady,
          ready,
          reason: `${ready.description ?? 'ready state'} did not settle`,
        };
      }
    }

    return {
      ok: true,
      url: options.url,
      fallbackUsed,
      mutationPerformed,
      phase: 'complete',
      route,
      documentReady,
      ready,
    };
  };

  if (!options.forceNavigation && areEquivalentNavigationUrls(fromUrl, options.url)) {
    const alreadySettled = await evaluateState(options.timeoutMs, false, false);
    if (alreadySettled.ok) {
      return alreadySettled;
    }
  }

  let activeAction: ProviderTrafficAction | null = await beginUiPhysicalAction({
    providerTrafficGovernor,
    providerTrafficRequired,
    interactionGovernor: options.interactionGovernor,
    interactionClass: options.interactionClass ?? 'renavigation',
    mutationAudit,
    kind: 'navigate',
    source: mutationSource,
    requestedUrl: options.url,
    fromUrl,
  });
  const settleActiveAction = async (
    details: Parameters<ProviderTrafficAction['settle']>[0],
  ): Promise<void> => {
    const action = activeAction;
    if (!action) return;
    activeAction = null;
    await action.settle({ ...details, probeContext: details.probeContext ?? client.Runtime });
  };
  try {
    const navigationCommand = client.Page.navigate({ url: options.url });
    const navigationOutcome = await waitForNavigationCommandOrCompletion(
      navigationCommand,
      options.timeoutMs ?? 10_000,
      options.completionSignal,
    );
    if (navigationOutcome.kind === 'external-completion') {
      const completion = navigationOutcome.completion;
      const externallySettled: NavigateAndSettleResult = {
        ok: completion.ok,
        url: options.url,
        fallbackUsed: false,
        mutationPerformed: true,
        phase: 'complete',
        reason: completion.reason,
      };
      await settleActiveAction({
        outcome: externallySettled.ok ? 'succeeded' : 'failed',
        toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : options.url,
        fallbackUsed: false,
        reason: 'external-completion-signal',
        error: externallySettled.ok ? null : externallySettled.reason ?? null,
      });
      return externallySettled;
    }
    if (
      navigationOutcome.kind === 'command-timeout' &&
      !options.routeExpression &&
      options.waitForDocumentReady === false &&
      !options.readyExpression
    ) {
      throw navigationOutcome.error;
    }
    const primary = await evaluateState(options.timeoutMs, false, true);
    if (primary.ok || !options.fallbackToLocationAssign) {
      await settleActiveAction({
        outcome: primary.ok ? 'succeeded' : 'failed',
        toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : options.url,
        fallbackUsed: primary.fallbackUsed,
        error: primary.ok ? null : primary.reason ?? null,
      });
      return primary;
    }

    await settleActiveAction({
      outcome: 'failed',
      toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : options.url,
      fallbackUsed: false,
      reason: 'primary-navigation-did-not-settle',
      error: primary.reason ?? null,
    });
    // The fallback expression does not assign when navigation already reached
    // this exact URL. Keep its bounded readiness wait without admitting a
    // physical mutation that will not occur.
    if (await readLocationHrefForAudit(client.Runtime) === options.url) {
      return await evaluateState(options.fallbackTimeoutMs ?? options.timeoutMs, true, true);
    }
    activeAction = await beginUiPhysicalAction({
      providerTrafficGovernor,
      providerTrafficRequired,
      interactionGovernor: options.interactionGovernor,
      interactionClass: options.interactionClass ?? 'renavigation',
      mutationAudit,
      kind: 'location-assign',
      source: mutationSource,
      requestedUrl: options.url,
      fromUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
      fallbackUsed: true,
      reason: 'location-assign-fallback',
    });
    await client.Runtime.evaluate({
      expression: `(() => {
        const target = ${JSON.stringify(options.url)};
        if (location.href !== target) {
          location.assign(target);
          return 'assigned';
        }
        return 'already-there';
      })()`,
      awaitPromise: false,
    }).catch(() => undefined);

    const fallback = await evaluateState(options.fallbackTimeoutMs ?? options.timeoutMs, true, true);
    await settleActiveAction({
      outcome: fallback.ok ? 'succeeded' : 'failed',
      toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : options.url,
      fallbackUsed: true,
      reason: 'location-assign-fallback',
      error: fallback.ok ? null : fallback.reason ?? null,
    });
    return fallback;
  } catch (error) {
    await settleActiveAction({
      outcome: 'failed',
      toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : options.url,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function waitForNavigationCommandOrCompletion(
  navigationCommand: Promise<unknown>,
  timeoutMs: number,
  completionSignal?: Promise<{ ok: boolean; reason?: string }>,
): Promise<
  | { kind: 'command-acknowledged' }
  | { kind: 'command-timeout'; error: Error }
  | { kind: 'external-completion'; completion: { ok: boolean; reason?: string } }
> {
  const effectiveTimeoutMs = Math.max(1, timeoutMs);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = <T>(callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(
        resolve,
        {
          kind: 'command-timeout',
          error: new Error(
            `Timed out waiting for Page.navigate acknowledgement after ${effectiveTimeoutMs}ms.`,
          ),
        },
      );
    }, effectiveTimeoutMs);

    navigationCommand.then(
      () => finish(resolve, { kind: 'command-acknowledged' }),
      (error: unknown) => finish(reject, error),
    );
    completionSignal?.then(
      (completion) => finish(resolve, { kind: 'external-completion', completion }),
      (error: unknown) => finish(reject, error),
    );
  });
}

function areEquivalentNavigationUrls(currentUrl: string | null, requestedUrl: string): boolean {
  if (!currentUrl) return false;
  try {
    const current = new URL(currentUrl);
    const requested = new URL(requestedUrl);
    current.hash = '';
    requested.hash = '';
    current.pathname = normalizeNavigationPathname(current.pathname);
    requested.pathname = normalizeNavigationPathname(requested.pathname);
    current.searchParams.sort();
    requested.searchParams.sort();
    return current.href === requested.href;
  } catch {
    return currentUrl === requestedUrl;
  }
}

function normalizeNavigationPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export async function reloadAndSettle(
  client: Pick<ChromeClient, 'Page' | 'Runtime'>,
  options: ReloadAndSettleOptions = {},
): Promise<ReloadAndSettleResult> {
  const mutationSource = options.mutationSource ?? 'browser-service:reloadAndSettle';
  const providerTrafficGovernor = options.providerTrafficGovernor ??
    (client as { __auracallProviderTrafficGovernor?: ProviderTrafficGovernor }).__auracallProviderTrafficGovernor;
  const providerTrafficRequired =
    (client as { __auracallProviderTrafficRequired?: boolean }).__auracallProviderTrafficRequired === true;
  const mutationAudit = options.mutationAudit;
  const fromUrl = mutationAudit ? await readLocationHrefForAudit(client.Runtime) : null;
  let activeAction: ProviderTrafficAction | null = await beginUiPhysicalAction({
    providerTrafficGovernor,
    providerTrafficRequired,
    interactionGovernor: options.interactionGovernor,
    interactionClass: options.interactionClass ?? 'page-refresh',
    mutationAudit,
    kind: 'reload',
    source: mutationSource,
    requestedUrl: fromUrl,
    fromUrl,
  });
  const settleActiveAction = async (
    details: Parameters<ProviderTrafficAction['settle']>[0],
  ): Promise<void> => {
    const action = activeAction;
    if (!action) return;
    activeAction = null;
    await action.settle({ ...details, probeContext: details.probeContext ?? client.Runtime });
  };

  const evaluateReady = async (fallbackUsed: boolean): Promise<ReloadAndSettleResult> => {
    if (options.waitForDocumentReady === false) {
      return { ok: true, fallbackUsed };
    }
    const documentReady = await waitForDocumentReady(client.Runtime, {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      states: options.documentReadyStates,
      requireVisible: options.requireVisibleDocument,
      description: options.description ?? 'document ready after reload',
    });
    if (!documentReady.ok) {
      return {
        ok: false,
        fallbackUsed,
        documentReady,
        reason: `${documentReady.description ?? 'document ready'} did not settle`,
      };
    }
    return { ok: true, fallbackUsed, documentReady };
  };

  try {
    try {
      const reloadCommand = client.Page.reload({ ignoreCache: options.ignoreCache });
      if (options.completionSignal) {
        const commandFailure = new Promise<never>((_resolve, reject) => {
          void reloadCommand.catch(reject);
        });
        const completion = await Promise.race([options.completionSignal, commandFailure]);
        const externallySettled: ReloadAndSettleResult = {
          ok: completion.ok,
          fallbackUsed: false,
          reason: completion.reason,
        };
        await settleActiveAction({
          outcome: externallySettled.ok ? 'succeeded' : 'failed',
          toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
          fallbackUsed: false,
          reason: 'external-completion-signal',
          error: externallySettled.ok ? null : externallySettled.reason ?? null,
        });
        return externallySettled;
      }
      await reloadCommand;
    } catch (error) {
      if (!options.fallbackToLocationReload) {
        throw error;
      }
      await settleActiveAction({
        outcome: 'failed',
        toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
        fallbackUsed: false,
        reason: 'page-reload-command-failed',
        error: error instanceof Error ? error.message : String(error),
      });
      activeAction = await beginUiPhysicalAction({
        providerTrafficGovernor,
        providerTrafficRequired,
        interactionGovernor: options.interactionGovernor,
        interactionClass: options.interactionClass ?? 'page-refresh',
        mutationAudit,
        kind: 'location-assign',
        source: mutationSource,
        requestedUrl: fromUrl,
        fromUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
        fallbackUsed: true,
        reason: 'location-reload-fallback',
      });
      await client.Runtime.evaluate({
        expression: 'location.reload()',
        awaitPromise: false,
      }).catch(() => undefined);
      const fallback = await evaluateReady(true);
      await settleActiveAction({
        outcome: fallback.ok ? 'succeeded' : 'failed',
        toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
        fallbackUsed: true,
        reason: 'location-reload-fallback',
        error: fallback.ok ? null : fallback.reason ?? null,
      });
      return fallback;
    }

    const primary = await evaluateReady(false);
    await settleActiveAction({
      outcome: primary.ok ? 'succeeded' : 'failed',
      toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
      fallbackUsed: false,
      error: primary.ok ? null : primary.reason ?? null,
    });
    return primary;
  } catch (error) {
    await settleActiveAction({
      outcome: 'failed',
      toUrl: mutationAudit ? await readLocationHrefForAudit(client.Runtime) : fromUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function readLocationHrefForAudit(Runtime: Pick<ChromeClient['Runtime'], 'evaluate'>): Promise<string | null> {
  try {
    const result = await Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    return typeof result.result?.value === 'string' && result.result.value.trim().length > 0
      ? result.result.value
      : null;
  } catch {
    return null;
  }
}

export async function collectUiDiagnostics(
  Runtime: ChromeClient['Runtime'],
  options: CollectUiDiagnosticsOptions = {},
): Promise<UiDiagnostics> {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const result = await Runtime.evaluate({
    expression: `(() => {
      const limit = ${JSON.stringify(limit)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const summarize = (el, selector) => ({
        selector,
        tag: el?.tagName?.toLowerCase?.() ?? null,
        role: el?.getAttribute?.('role') ?? null,
        ariaLabel: normalize(el?.getAttribute?.('aria-label') || '') || null,
        text: normalize(el?.textContent || '').slice(0, 160) || null,
      });
      const uniqueVisible = (selectors) => {
        const entries = [];
        const seen = new Set();
        for (const selector of selectors) {
          for (const el of Array.from(document.querySelectorAll(selector))) {
            if (!isVisible(el) || seen.has(el)) continue;
            seen.add(el);
            entries.push({ el, selector });
            if (entries.length >= limit) {
              return entries;
            }
          }
        }
        return entries;
      };
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const dialogSelectors = ${JSON.stringify(options.dialogSelectors ?? Array.from(DEFAULT_DIALOG_SELECTORS))};
      const menuSelectors = ${JSON.stringify(options.menuSelectors ?? ['[role="menu"]', '[role="listbox"]', '[data-radix-menu-content][data-state="open"]'])};
      const candidateSelectors = ${JSON.stringify(options.candidateSelectors ?? [])};
      const buttonSelectors = ${JSON.stringify(options.buttonSelectors ?? ['button', '[role="button"]', '[role="menuitem"]', 'a[role="button"]'])};
      const roots = rootSelectors.length
        ? rootSelectors
            .map((selector) => ({ selector, node: document.querySelector(selector) }))
            .filter((entry) => entry.node && isVisible(entry.node))
            .slice(0, limit)
            .map((entry) => entry.selector)
        : [];

      const dialogs = uniqueVisible(dialogSelectors).map(({ el, selector }) => summarize(el, selector));
      const menuEntries = uniqueVisible(menuSelectors).map(({ el, selector }) => {
        const items = Array.from(el.querySelectorAll('[role="menuitem"], [role="option"], button, a'))
          .filter((node) => isVisible(node))
          .map((node) => normalize(node.textContent || node.getAttribute?.('aria-label') || ''))
          .filter(Boolean)
          .slice(0, limit);
        return {
          ...summarize(el, selector),
          items,
        };
      });

      const buttonRoots = rootSelectors.length
        ? rootSelectors.map((selector) => document.querySelector(selector)).filter((node) => node instanceof Element || node instanceof Document)
        : [document];
      const buttonResults = [];
      const seenButtons = new Set();
      for (const root of buttonRoots) {
        if (!(root instanceof Element || root instanceof Document)) continue;
        for (const selector of buttonSelectors) {
          for (const el of Array.from(root.querySelectorAll(selector))) {
            if (!isVisible(el) || seenButtons.has(el)) continue;
            seenButtons.add(el);
            buttonResults.push(summarize(el, selector));
            if (buttonResults.length >= limit) {
              break;
            }
          }
          if (buttonResults.length >= limit) {
            break;
          }
        }
        if (buttonResults.length >= limit) {
          break;
        }
      }

      const candidates = candidateSelectors.slice(0, limit).map((selector) => {
        const nodes = Array.from(document.querySelectorAll(selector)).filter((el) => isVisible(el));
        return {
          selector,
          count: nodes.length,
          samples: nodes
            .map((el) => normalize(el.textContent || el.getAttribute?.('aria-label') || ''))
            .filter(Boolean)
            .slice(0, Math.min(limit, 5)),
        };
      });

      const activeElement = document.activeElement instanceof Element
        ? {
            tag: document.activeElement.tagName?.toLowerCase?.() ?? null,
            role: document.activeElement.getAttribute?.('role') ?? null,
            ariaLabel: normalize(document.activeElement.getAttribute?.('aria-label') || '') || null,
            text: normalize(document.activeElement.textContent || '').slice(0, 160) || null,
          }
        : null;

      return {
        url: location.href || null,
        title: document.title || null,
        readyState: document.readyState || null,
        activeElement,
        dialogs,
        menus: menuEntries,
        buttons: buttonResults,
        candidates,
        roots,
        context: ${JSON.stringify(options.context ?? null)},
      };
    })()`,
    returnByValue: true,
  });
  const value = result.result?.value as UiDiagnostics | undefined;
  return (
    value ?? {
      url: null,
      title: null,
      readyState: null,
      activeElement: null,
      dialogs: [],
      menus: [],
      buttons: [],
      candidates: [],
      roots: [],
      context: options.context,
    }
  );
}

export async function captureActionPhaseDiagnostics<T>(
  options: CaptureActionPhaseDiagnosticsOptions<T>,
): Promise<Record<string, T>> {
  const results: Record<string, T> = {};
  for (const phaseEntry of options.phases) {
    const phase = typeof phaseEntry === 'string' ? { name: phaseEntry, pauseMs: 0 } : phaseEntry;
    results[phase.name] = await options.capture(phase.name);
    if ((phase.pauseMs ?? 0) > 0) {
      await new Promise((resolve) => setTimeout(resolve, phase.pauseMs));
    }
  }
  return results;
}

export async function runOrderedSurfaceFallback<T>(
  options: RunOrderedSurfaceFallbackOptions<T>,
): Promise<RunOrderedSurfaceFallbackResult<T>> {
  const attempts: RunOrderedSurfaceFallbackResult<T>['attempts'] = [];
  const isSuccess = options.isSuccess ?? ((value: T) => Boolean(value));
  for (const candidate of options.attempts) {
    const value = await candidate.run();
    const ok = isSuccess(value);
    attempts.push({ name: candidate.name, ok });
    if (ok) {
      return {
        ok: true,
        attempt: candidate.name,
        value,
        attempts,
      };
    }
  }
  return {
    ok: false,
    attempts,
  };
}

export async function waitForAttachmentSignals<T>(
  options: WaitForAttachmentSignalsOptions<T>,
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  const pollMs = Math.max(1, options.pollMs ?? 250);
  const requiredStablePolls = Math.max(1, options.requiredStablePolls ?? 1);
  let lastState: T | null = null;
  let stableCount = 0;

  while (Date.now() < deadline) {
    const state = await options.read();
    lastState = state;
    if (options.isReady(state)) {
      stableCount += 1;
      if (stableCount >= requiredStablePolls) {
        return state;
      }
    } else {
      stableCount = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const detail =
    lastState && options.formatLastState ? options.formatLastState(lastState) : lastState ? JSON.stringify(lastState) : 'unavailable';
  throw new Error(`${options.timeoutMessage ?? 'Attachment signals did not stabilize before timeout.'} Last state: ${detail}`);
}

export async function collectAnchoredActionDiagnostics(
  Runtime: ChromeClient['Runtime'],
  options: CollectAnchoredActionDiagnosticsOptions = {},
): Promise<AnchoredActionDiagnostics> {
  const rowSelector = options.rowSelector ?? null;
  const triggerSelector = options.triggerSelector ?? null;
  const editorSelector = options.editorSelector ?? null;
  const dialogSelectors = Array.from(options.dialogSelectors ?? DEFAULT_DIALOG_SELECTORS);
  const menuSelectors = Array.from(options.menuSelectors ?? DEFAULT_VISIBLE_MENU_SELECTORS);
  const anchorSelector = options.anchorSelector ?? triggerSelector ?? rowSelector ?? null;
  const anchorRootSelectors = options.anchorRootSelectors ?? [rowSelector, triggerSelector].filter(
    (selector): selector is string => Boolean(selector),
  );

  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const rowSelector = ${JSON.stringify(rowSelector)};
      const triggerSelector = ${JSON.stringify(triggerSelector)};
      const editorSelector = ${JSON.stringify(editorSelector)};
      const dialogSelectors = ${JSON.stringify(dialogSelectors)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const summarizeEditor = (node) => {
        if (!(node instanceof Element)) {
          return { found: false, visible: false, value: null };
        }
        const value =
          node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
            ? node.value
            : normalize(node.textContent || '');
        return {
          found: true,
          visible: isVisible(node),
          value: value || null,
        };
      };
      const summarizeElement = (node) => ({
        found: node instanceof Element,
        visible: isVisible(node),
        text: node instanceof Element ? normalize(node.textContent || '') || null : null,
      });
      const row = rowSelector ? document.querySelector(rowSelector) : null;
      const trigger = triggerSelector ? document.querySelector(triggerSelector) : null;
      const editor = editorSelector ? document.querySelector(editorSelector) : null;
      const dialog =
        dialogSelectors
          .map((selector) => document.querySelector(selector))
          .find((node) => node instanceof Element && isVisible(node)) || null;
      const active = document.activeElement instanceof Element ? document.activeElement : null;
      return {
        row: summarizeElement(row),
        trigger: {
          found: trigger instanceof Element,
          visible: isVisible(trigger),
          label:
            trigger instanceof Element
              ? normalize(trigger.getAttribute('aria-label') || trigger.textContent || '') || null
              : null,
        },
        editor: editorSelector ? summarizeEditor(editor) : null,
        dialog: dialogSelectors.length
          ? {
              found: dialog instanceof Element,
              visible: isVisible(dialog),
              text: dialog instanceof Element ? normalize(dialog.textContent || '') || null : null,
            }
          : null,
        activeElement: active
          ? {
              tag: active.tagName?.toLowerCase?.() ?? null,
              ariaLabel: normalize(active.getAttribute('aria-label') || '') || null,
              text: normalize(active.textContent || '') || null,
            }
          : null,
      };
    })()`,
    returnByValue: true,
  });

  const snapshot = (result?.value ?? null) as Omit<AnchoredActionDiagnostics, 'menus' | 'overlays' | 'context'> | null;
  const menus = await collectVisibleMenuInventory(Runtime, {
    menuSelectors,
    anchorSelector: anchorSelector ?? undefined,
    anchorRootSelectors,
    limit: 6,
  }).catch(() => []);
  const overlays = await collectVisibleOverlayInventory(Runtime, {
    overlaySelectors: dialogSelectors,
    anchorSelector: anchorSelector ?? undefined,
    anchorRootSelectors,
    limit: 4,
  }).catch(() => []);

  return {
    row: snapshot?.row ?? { found: false, visible: false, text: null },
    trigger: snapshot?.trigger ?? { found: false, visible: false, label: null },
    editor: snapshot?.editor ?? null,
    dialog: snapshot?.dialog ?? null,
    activeElement: snapshot?.activeElement ?? null,
    menus,
    overlays,
    context: options.context,
  };
}

export async function collectVisibleMenuInventory(
  Runtime: ChromeClient['Runtime'],
  options: CollectVisibleMenuInventoryOptions = {},
): Promise<VisibleMenuInventoryEntry[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const menuSelectors = Array.from(
    new Set((options.menuSelectors?.length ? options.menuSelectors : Array.from(DEFAULT_VISIBLE_MENU_SELECTORS)).filter(Boolean)),
  );
  const itemSelectors = Array.from(
    new Set(
      (options.itemSelectors?.length ? options.itemSelectors : Array.from(DEFAULT_VISIBLE_MENU_ITEM_SELECTORS)).filter(Boolean),
    ),
  );
  const result = await Runtime.evaluate({
    expression: `(() => {
      const limit = ${JSON.stringify(limit)};
      const menuSelectors = ${JSON.stringify(menuSelectors)};
      const itemSelectors = ${JSON.stringify(itemSelectors)};
      const anchorSelector = ${JSON.stringify(options.anchorSelector ?? null)};
      const anchorRootSelectors = ${JSON.stringify(options.anchorRootSelectors ?? [])};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const readRect = (node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      const distance = (left, right) => {
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        return Math.round(Math.sqrt(dx * dx + dy * dy));
      };

      let nextOracleMenuIndex = Array.from(document.querySelectorAll('[data-oracle-visible-menu-index]'))
        .map((node) => Number.parseInt(node.getAttribute('data-oracle-visible-menu-index') || '', 10))
        .filter((value) => Number.isFinite(value))
        .reduce((max, value) => Math.max(max, value), -1) + 1;

      const roots = anchorRootSelectors.length
        ? anchorRootSelectors
            .map((selector) => document.querySelector(selector))
            .filter((node) => node instanceof Element || node instanceof Document)
        : [document];

      let anchorRect = null;
      if (anchorSelector) {
        for (const root of roots) {
          if (!(root instanceof Element || root instanceof Document)) continue;
          const nodes = Array.from(root.querySelectorAll(anchorSelector)).filter(isVisible);
          const node = nodes[0];
          if (node) {
            anchorRect = readRect(node);
            break;
          }
        }
      }

      const seen = new Set();
      const entries = [];
      for (const selector of menuSelectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(node) || seen.has(node)) continue;
          seen.add(node);
          const rect = readRect(node);
          const items = [];
          const itemSeen = new Set();
          for (const itemSelector of itemSelectors) {
            for (const item of Array.from(node.querySelectorAll(itemSelector))) {
              if (!isVisible(item) || itemSeen.has(item)) continue;
              itemSeen.add(item);
              const label = normalize(item.getAttribute?.('aria-label') || item.textContent || '');
              if (!label) continue;
              items.push({
                label,
                role: item.getAttribute?.('role') ?? null,
                selected:
                  item.getAttribute?.('aria-selected') === 'true' ||
                  item.getAttribute?.('aria-checked') === 'true' ||
                  item.getAttribute?.('data-selected') === 'true' ||
                  ['checked', 'selected', 'on', 'true'].includes((item.getAttribute?.('data-state') ?? '').toLowerCase()),
              });
              if (items.length >= limit) break;
            }
            if (items.length >= limit) break;
          }
          const itemLabels = items.map((item) => item.label);
          const signature = JSON.stringify({
            selector,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            items: itemLabels.slice(0, 8),
          });
          const oracleIndex =
            node.getAttribute('data-oracle-visible-menu-index') ||
            (() => {
              const assigned = String(nextOracleMenuIndex);
              nextOracleMenuIndex += 1;
              node.setAttribute('data-oracle-visible-menu-index', assigned);
              return assigned;
            })();
          entries.push({
            selector: selector,
            sourceSelector: selector,
            oracleSelector: '[data-oracle-visible-menu-index="' + oracleIndex + '"]',
            signature,
            rect,
            distanceToAnchor: anchorRect ? distance(center(rect), center(anchorRect)) : null,
            items,
            itemLabels,
          });
          if (entries.length >= limit) {
            return entries;
          }
        }
      }
      return entries;
    })()`,
    returnByValue: true,
  });
  const value = result.result?.value as Array<(VisibleMenuInventoryEntry & { oracleSelector?: string })> | undefined;
  return (value ?? []).map((entry) => {
    const { oracleSelector, ...rest } = entry;
    return {
      ...rest,
      sourceSelector: entry.sourceSelector || entry.selector,
      selector: oracleSelector || entry.selector,
    };
  });
}

export async function collectVisibleOverlayInventory(
  Runtime: ChromeClient['Runtime'],
  options: CollectVisibleOverlayInventoryOptions = {},
): Promise<VisibleOverlayInventoryEntry[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const overlaySelectors = Array.from(
    new Set(
      (options.overlaySelectors?.length ? options.overlaySelectors : Array.from(DEFAULT_VISIBLE_OVERLAY_SELECTORS)).filter(Boolean),
    ),
  );
  const buttonSelectors = Array.from(
    new Set(
      (options.buttonSelectors?.length ? options.buttonSelectors : Array.from(DEFAULT_VISIBLE_OVERLAY_BUTTON_SELECTORS)).filter(
        Boolean,
      ),
    ),
  );
  const result = await Runtime.evaluate({
    expression: `(() => {
      const limit = ${JSON.stringify(limit)};
      const overlaySelectors = ${JSON.stringify(overlaySelectors)};
      const buttonSelectors = ${JSON.stringify(buttonSelectors)};
      const anchorSelector = ${JSON.stringify(options.anchorSelector ?? null)};
      const anchorRootSelectors = ${JSON.stringify(options.anchorRootSelectors ?? [])};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const readRect = (node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      const distance = (left, right) => {
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        return Math.round(Math.sqrt(dx * dx + dy * dy));
      };

      let nextOracleOverlayIndex = Array.from(document.querySelectorAll('[data-oracle-visible-overlay-index]'))
        .map((node) => Number.parseInt(node.getAttribute('data-oracle-visible-overlay-index') || '', 10))
        .filter((value) => Number.isFinite(value))
        .reduce((max, value) => Math.max(max, value), -1) + 1;

      const roots = anchorRootSelectors.length
        ? anchorRootSelectors
            .map((selector) => document.querySelector(selector))
            .filter((node) => node instanceof Element || node instanceof Document)
        : [document];

      let anchorRect = null;
      if (anchorSelector) {
        for (const root of roots) {
          if (!(root instanceof Element || root instanceof Document)) continue;
          const nodes = Array.from(root.querySelectorAll(anchorSelector)).filter(isVisible);
          const node = nodes[0];
          if (node) {
            anchorRect = readRect(node);
            break;
          }
        }
      }

      const seen = new Set();
      const entries = [];
      for (const selector of overlaySelectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(node) || seen.has(node)) continue;
          seen.add(node);
          const rect = readRect(node);
          const buttonLabels = [];
          const buttonSeen = new Set();
          for (const buttonSelector of buttonSelectors) {
            for (const button of Array.from(node.querySelectorAll(buttonSelector))) {
              if (!isVisible(button) || buttonSeen.has(button)) continue;
              buttonSeen.add(button);
              const label = normalize(button.getAttribute?.('aria-label') || button.getAttribute?.('title') || button.textContent || '');
              if (!label) continue;
              buttonLabels.push(label);
              if (buttonLabels.length >= limit) break;
            }
            if (buttonLabels.length >= limit) break;
          }
          const text = normalize(node.textContent || '').slice(0, 500) || null;
          const signature = JSON.stringify({
            selector,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: text ? text.slice(0, 120) : null,
            buttonLabels: buttonLabels.slice(0, 8),
          });
          const oracleIndex =
            node.getAttribute('data-oracle-visible-overlay-index') ||
            (() => {
              const assigned = String(nextOracleOverlayIndex);
              nextOracleOverlayIndex += 1;
              node.setAttribute('data-oracle-visible-overlay-index', assigned);
              return assigned;
            })();
          entries.push({
            selector,
            sourceSelector: selector,
            oracleSelector: '[data-oracle-visible-overlay-index="' + oracleIndex + '"]',
            signature,
            rect,
            distanceToAnchor: anchorRect ? distance(center(rect), center(anchorRect)) : null,
            tag: node.tagName?.toLowerCase?.() ?? null,
            role: node.getAttribute?.('role') ?? null,
            ariaLabel: normalize(node.getAttribute?.('aria-label') || '') || null,
            text,
            buttonLabels,
          });
          if (entries.length >= limit) {
            return entries;
          }
        }
      }
      return entries;
    })()`,
    returnByValue: true,
  });
  const value = result.result?.value as Array<(VisibleOverlayInventoryEntry & { oracleSelector?: string })> | undefined;
  return (value ?? []).map((entry) => {
    const { oracleSelector, ...rest } = entry;
    return {
      ...rest,
      sourceSelector: entry.sourceSelector || entry.selector,
      selector: oracleSelector || entry.selector,
    };
  });
}

export async function armDownloadCapture(
  Runtime: ChromeClient['Runtime'],
  options: CaptureDownloadOptions = {},
): Promise<void> {
  const stateKey = options.stateKey ?? '__auracallDownloadCapture';
  await Runtime.evaluate({
    expression: `(() => {
      const stateKey = ${JSON.stringify(stateKey)};
      const existing = window[stateKey];
      if (existing && typeof existing === 'object') {
        existing.href = null;
        existing.download = null;
        return true;
      }
      const state = {
        href: null,
        download: null,
        originalAnchorClick: HTMLAnchorElement.prototype.click,
        originalWindowOpen: window.open,
      };
      HTMLAnchorElement.prototype.click = function(...args) {
        try {
          state.href = this.href || state.href;
          state.download = this.getAttribute('download') || state.download;
        } catch {}
        return state.originalAnchorClick.apply(this, args);
      };
      window.open = function(url, target, features) {
        try {
          if (typeof url === 'string' && url) {
            state.href = url;
          }
        } catch {}
        return state.originalWindowOpen.call(this, url, target, features);
      };
      window[stateKey] = state;
      return true;
    })()`,
  });
}

export async function readDownloadCapture(
  Runtime: ChromeClient['Runtime'],
  stateKey = '__auracallDownloadCapture',
): Promise<DownloadCapture> {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const state = window[${JSON.stringify(stateKey)}];
      if (!state || typeof state !== 'object') {
        return { href: null, downloadName: null };
      }
      return {
        href: typeof state.href === 'string' ? state.href : null,
        downloadName: typeof state.download === 'string' ? state.download : null,
      };
    })()`,
    returnByValue: true,
  });
  const value = result.result?.value;
  return {
    href: value && typeof value.href === 'string' ? value.href : null,
    downloadName: value && typeof value.downloadName === 'string' ? value.downloadName : null,
  };
}

export async function waitForDownloadCapture(
  Runtime: ChromeClient['Runtime'],
  options: CaptureDownloadOptions = {},
): Promise<DownloadCapture> {
  const stateKey = options.stateKey ?? '__auracallDownloadCapture';
  const timeoutMs = options.timeoutMs ?? 1500;
  const pollMs = options.pollMs ?? 100;
  const requireTarget = options.requireTarget ?? true;
  const deadline = Date.now() + timeoutMs;
  let lastValue: DownloadCapture = { href: null, downloadName: null };
  while (Date.now() < deadline) {
    const value = await readDownloadCapture(Runtime, stateKey);
    lastValue = value;
    if (!requireTarget || value.href || value.downloadName) {
      return value;
    }
    await sleep(pollMs);
  }
  return lastValue;
}

export async function withUiDiagnostics<T>(
  Runtime: ChromeClient['Runtime'],
  action: () => Promise<T>,
  options: WithUiDiagnosticsOptions = {},
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const diagnostics = await collectUiDiagnostics(Runtime, options).catch((diagError) => ({
      url: null,
      title: null,
      readyState: null,
      activeElement: null,
      dialogs: [],
      menus: [],
      buttons: [],
      candidates: [],
      roots: [],
      context: options.context,
      collectionError: String(diagError),
    }));
    const labelPrefix = options.label ? `${options.label}: ` : '';
    const serialized = JSON.stringify(diagnostics);
    if (error instanceof Error) {
      const enriched = error as Error & { uiDiagnostics?: unknown };
      enriched.uiDiagnostics = diagnostics;
      if (!enriched.message.includes('UI diagnostics:')) {
        enriched.message = `${labelPrefix}${enriched.message}\nUI diagnostics: ${serialized}`;
      } else if (labelPrefix && !enriched.message.startsWith(labelPrefix)) {
        enriched.message = `${labelPrefix}${enriched.message}`;
      }
      throw enriched;
    }
    const enriched = new Error(`${labelPrefix}${String(error)}\nUI diagnostics: ${serialized}`) as Error & {
      cause?: unknown;
      uiDiagnostics?: unknown;
    };
    enriched.cause = error;
    enriched.uiDiagnostics = diagnostics;
    throw enriched;
  }
}

export async function withAnchoredActionDiagnostics<T>(
  Runtime: ChromeClient['Runtime'],
  action: () => Promise<T>,
  options: WithAnchoredActionDiagnosticsOptions = {},
): Promise<T> {
  const attachDiagnostics = async (result: T): Promise<T> => {
    const shouldAttach =
      options.includeOnSuccess ||
      (typeof result === 'object' &&
        result !== null &&
        'ok' in result &&
        (result as { ok?: unknown }).ok === false &&
        !('diagnostics' in (result as object)) );
    if (!shouldAttach) {
      return result;
    }
    const diagnostics = await collectAnchoredActionDiagnostics(Runtime, options).catch((diagError) => ({
      row: { found: false, visible: false, text: null },
      trigger: { found: false, visible: false, label: null },
      editor: null,
      dialog: null,
      activeElement: null,
      menus: [],
      overlays: [],
      context: {
        ...(options.context ?? {}),
        collectionError: String(diagError),
      },
    }));
    if (typeof result === 'object' && result !== null) {
      return {
        ...(result as Record<string, unknown>),
        diagnostics: (result as Record<string, unknown>).diagnostics ?? diagnostics,
      } as T;
    }
    return result;
  };

  try {
    const result = await action();
    return attachDiagnostics(result);
  } catch (error) {
    const diagnostics = await collectAnchoredActionDiagnostics(Runtime, options).catch((diagError) => ({
      row: { found: false, visible: false, text: null },
      trigger: { found: false, visible: false, label: null },
      editor: null,
      dialog: null,
      activeElement: null,
      menus: [],
      overlays: [],
      context: {
        ...(options.context ?? {}),
        collectionError: String(diagError),
      },
    }));
    const labelPrefix = options.label ? `${options.label}: ` : '';
    const serialized = JSON.stringify(diagnostics);
    if (error instanceof Error) {
      const enriched = error as Error & { anchoredActionDiagnostics?: unknown };
      enriched.anchoredActionDiagnostics = diagnostics;
      if (!enriched.message.includes('Anchored action diagnostics:')) {
        enriched.message = `${labelPrefix}${enriched.message}\nAnchored action diagnostics: ${serialized}`;
      } else if (labelPrefix && !enriched.message.startsWith(labelPrefix)) {
        enriched.message = `${labelPrefix}${enriched.message}`;
      }
      throw enriched;
    }
    const enriched = new Error(`${labelPrefix}${String(error)}\nAnchored action diagnostics: ${serialized}`) as Error & {
      cause?: unknown;
      anchoredActionDiagnostics?: unknown;
    };
    enriched.cause = error;
    enriched.anchoredActionDiagnostics = diagnostics;
    throw enriched;
  }
}

export async function withBlockingSurfaceRecovery<T, TMatch extends BlockingSurfaceMatch = BlockingSurfaceMatch>(
  action: () => Promise<T>,
  options: WithBlockingSurfaceRecoveryOptions<TMatch>,
): Promise<T> {
  const pauseMs = options.pauseMs ?? 15_000;
  const retries = options.retries ?? 1;
  let lastError: unknown;
  let lastMatch: TMatch | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const preMatch = await options.inspect();
    if (preMatch) {
      lastMatch = preMatch;
      await options.dismiss?.(preMatch);
      await options.onRecover?.({ match: preMatch, phase: 'pre', attempt });
      if (attempt >= retries) {
        break;
      }
      await sleep(pauseMs);
      continue;
    }
    try {
      const result = await action();
      const postMatch = await options.inspect();
      if (!postMatch) {
        return result;
      }
      lastMatch = postMatch;
      await options.dismiss?.(postMatch);
      await options.onRecover?.({ match: postMatch, phase: 'post', attempt });
      if (attempt >= retries) {
        break;
      }
    } catch (error) {
      lastError = error;
      const classified = options.classifyError ? await options.classifyError(error) : null;
      const errorMatch = classified ?? (await options.inspect());
      if (!errorMatch) {
        throw error;
      }
      lastMatch = errorMatch;
      await options.dismiss?.(errorMatch);
      await options.onRecover?.({ match: errorMatch, phase: 'error', attempt });
      if (attempt >= retries) {
        break;
      }
    }
    await sleep(pauseMs);
  }
  const prefix = options.label ? `${options.label}: ` : '';
  if (lastMatch) {
    const error = new Error(`${prefix}${lastMatch.summary}`) as Error & {
      blockingSurface?: TMatch;
      cause?: unknown;
    };
    error.blockingSurface = lastMatch;
    if (lastError !== undefined) {
      error.cause = lastError;
    }
    throw error;
  }
  throw lastError instanceof Error ? lastError : new Error(`${prefix}blocking surface recovery failed`);
}

export async function isDialogOpen(
  Runtime: ChromeClient['Runtime'],
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<boolean> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(dialogSelectors)};
    return selectors.some((selector) => Boolean(document.querySelector(selector)));
  })()`;
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  return Boolean(result?.value);
}

export async function waitForDialog(
  Runtime: ChromeClient['Runtime'],
  timeoutMs = 10_000,
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<boolean> {
  const ready = await waitForPredicate(
    Runtime,
    `(() => {
      const selectors = ${JSON.stringify(dialogSelectors)};
      return selectors.some((selector) => Boolean(document.querySelector(selector)));
    })()`,
    { timeoutMs, description: 'dialog open' },
  );
  return ready.ok;
}

export async function waitForSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const ready = await waitForPredicate(
    Runtime,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    { timeoutMs, description: `selector ${selector}` },
  );
  return ready.ok;
}

export async function waitForNotSelector(
  Runtime: ChromeClient['Runtime'],
  selector: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const gone = await waitForPredicate(
    Runtime,
    `!Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    { timeoutMs, description: `selector gone ${selector}` },
  );
  return gone.ok;
}

export async function hoverElement(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverElementOptions,
): Promise<HoverElementResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.selector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const el = root.querySelector(selector);
        if (!el) return { ok: false, reason: 'Selector not found: ' + selector };
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return { ok: false, reason: 'Element not visible', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        }
        return {
          ok: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; center: { x: number; y: number } }
      | { ok: false; reason?: string; rect?: { x: number; y: number; width: number; height: number } }
      | undefined;
    if (!info?.ok) {
      lastError = info?.reason || 'Hover target not found';
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    const x = Math.round(info.center.x);
    const y = Math.round(info.center.y);
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

    const verify = await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.selector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((root) => document.querySelector(root)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const el = root.querySelector(selector);
        const hit = document.elementFromPoint(${x}, ${y});
        const ok = Boolean(el && hit && (el === hit || el.contains(hit)));
        return {
          ok,
          element: hit
            ? {
                tag: hit.tagName.toLowerCase(),
                ariaLabel: hit.getAttribute('aria-label'),
                className: hit.className,
                id: hit.id,
              }
            : null,
        };
      })()`,
      returnByValue: true,
    });
    const verifyInfo = verify.result?.value as
      | { ok: boolean; element?: { tag?: string | null; ariaLabel?: string | null; className?: string | null; id?: string | null } }
      | undefined;
    if (verifyInfo?.ok) {
      return { ok: true, point: { x, y }, rect: info.rect, element: verifyInfo.element };
    }
    lastError = 'Hover point did not hit element';
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return { ok: false, reason: lastError || 'Hover target not found' };
}

export async function hoverAndReveal(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverAndRevealOptions,
): Promise<HoverAndRevealResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const hoverResult = await hoverElement(Runtime, Input, {
    selector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    timeoutMs,
  });
  if (!hoverResult.ok) {
    return { ok: false, reason: hoverResult.reason };
  }

  const evalResult = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.rowSelector)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const matchOptions = ${JSON.stringify(options.actionMatch ?? {})};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const root = roots[0] || document;
      const row = root.querySelector(selector);
      if (!row) return { ok: false, reason: 'Row not found' };
      const actions = Array.from(row.querySelectorAll('button,[role="button"],a'))
        .map((el) => ({ label: normalize(el.getAttribute?.('aria-label') || el.textContent || '') }))
        .filter((entry) => entry.label);
      const matches = (label) => {
        if (!label) return false;
        const exact = (matchOptions.exact || []).map(normalize);
        const startsWith = (matchOptions.startsWith || []).map(normalize);
        const includeAll = (matchOptions.includeAll || []).map(normalize);
        const includeAny = (matchOptions.includeAny || []).map(normalize);
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      if (
        matchOptions.exact ||
        matchOptions.startsWith ||
        matchOptions.includeAll ||
        matchOptions.includeAny
      ) {
        const match = actions.find((entry) => matches(entry.label));
        if (!match) {
          return { ok: false, reason: 'Action not revealed', actions };
        }
      }
      return { ok: true, actions };
    })()`,
    returnByValue: true,
  });
  const info = evalResult.result?.value as
    | { ok: true; actions?: { label: string }[] }
    | { ok: false; reason?: string; actions?: { label: string }[] }
    | undefined;
  if (!info?.ok) {
    return { ok: false, reason: info?.reason, actions: info?.actions };
  }
  return {
    ok: true,
    point: hoverResult.point,
    row: { selector: options.rowSelector },
    actions: info?.actions,
  };
}

export async function pressRowAction(
  Runtime: ChromeClient['Runtime'],
  options: PressRowActionOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const anchorSelector = ${JSON.stringify(options.anchorSelector)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const includeAny = ${JSON.stringify(options.actionMatch.includeAny ?? [])};
        const includeAll = ${JSON.stringify(options.actionMatch.includeAll ?? [])};
        const startsWith = ${JSON.stringify(options.actionMatch.startsWith ?? [])};
        const exact = ${JSON.stringify(options.actionMatch.exact ?? [])};
        const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const matches = (label) => {
          if (!label) return false;
          if (exact.length && exact.includes(label)) return true;
          if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
          if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
          if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
          return false;
        };

        const roots = rootSelectors.length
          ? rootSelectors.map((selector) => document.querySelector(selector)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        let anchor = root.querySelector(anchorSelector);
        if (!anchor && root !== document) {
          anchor = document.querySelector(anchorSelector);
        }
        if (!anchor) {
          return { ok: false, reason: 'Anchor not found' };
        }
        const row =
          anchor.closest('div.grid') ||
          anchor.closest('div[class*="rounded"]') ||
          anchor.closest('li') ||
          anchor.closest('div') ||
          anchor.parentElement;
        if (!row) {
          return { ok: false, reason: 'Row container not found' };
        }

        const visibleRect = (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? rect : null;
        };
        const rowRect = visibleRect(row);
        const distanceToRow = (rect) => {
          if (!rowRect) return 0;
          const dx = Math.abs(rect.x - rowRect.x);
          const dy = Math.abs(rect.y - rowRect.y);
          return dx + dy;
        };

        const candidates = Array.from(
          row.querySelectorAll('button, [role="button"]'),
        ).concat(Array.from(root.querySelectorAll('button, [role="button"]')));

        const matching = candidates
          .map((button) => ({
            button,
            label: normalize(button.getAttribute?.('aria-label') || button.textContent || ''),
          }))
          .filter((entry) => matches(entry.label));

        if (matching.length === 0) {
          return { ok: false, reason: 'Action button not found' };
        }

        let target =
          matching.find((entry) => row.contains(entry.button)) ||
          null;
        if (!target && rowRect) {
          target =
            matching
              .map((entry) => ({ ...entry, rect: visibleRect(entry.button) }))
              .filter((entry) => entry.rect)
              .sort((a, b) => distanceToRow(a.rect) - distanceToRow(b.rect))[0] || null;
        }
        if (!target) {
          target = matching[0];
        }
        target.button.click();
        return { ok: true, matchedLabel: target.label };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as { ok: boolean; reason?: string; matchedLabel?: string } | undefined;
    if (info?.ok) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ok: false, reason: 'Action button not found' };
}

export async function clickRevealedRowAction(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: ClickRevealedRowActionOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const revealed = await hoverAndReveal(client.Runtime, client.Input, {
    rowSelector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
  if (!revealed.ok) {
    return { ok: false, reason: revealed.reason || 'Row action did not appear' };
  }
  return pressRowAction(client.Runtime, {
    anchorSelector: options.anchorSelector ?? options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
}

export async function openRevealedRowMenu(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: OpenRevealedRowMenuOptions,
): Promise<{ ok: boolean; reason?: string; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const revealed = await hoverAndReveal(client.Runtime, client.Input, {
    rowSelector: options.rowSelector,
    rootSelectors: options.rootSelectors,
    actionMatch: options.actionMatch,
    timeoutMs,
  });
  if (!revealed.ok) {
    return { ok: false, reason: revealed.reason || 'Row menu trigger did not appear' };
  }

  const prepareTrigger = async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!options.prepareTriggerBeforeOpen) {
      return { ok: true };
    }
    const prepared = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector(${JSON.stringify(options.rowSelector)});
        const trigger = document.querySelector(${JSON.stringify(options.triggerSelector)});
        if (!(row instanceof HTMLElement)) {
          return { ok: false, reason: 'Row not found' };
        }
        if (!(trigger instanceof HTMLElement)) {
          return { ok: false, reason: 'Trigger not found' };
        }
        const link =
          trigger.closest('a[href], [role="link"]') ||
          row.querySelector('a[href], [role="link"]');
        const stopNav = (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        };
        if (link instanceof HTMLElement) {
          for (const type of ['click', 'auxclick']) {
            link.addEventListener(type, stopNav, { once: true });
          }
        }
        trigger.style.opacity = '1';
        trigger.style.pointerEvents = 'auto';
        trigger.style.visibility = 'visible';
        trigger.style.display = trigger.style.display || 'inline-flex';
        for (const eventName of ['mouseenter', 'mouseover', 'mousemove']) {
          row.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
        }
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const info = prepared.result?.value as { ok?: boolean; reason?: string } | undefined;
    return info?.ok ? { ok: true } : { ok: false, reason: info?.reason || 'Trigger prep failed' };
  };

  const prep = await prepareTrigger();
  if (!prep.ok) {
    return { ok: false, reason: prep.reason };
  }

  const opened = await openMenu(client.Runtime, {
    trigger: {
      selector: options.triggerSelector,
      rootSelectors: options.triggerRootSelectors ?? [options.rowSelector],
      requireVisible: true,
    },
    menuSelector: options.menuSelector,
    timeoutMs,
  });
  if (!opened.ok && options.directTriggerClickFallback) {
    const fallbackClick = await client.Runtime.evaluate({
      expression: `(() => {
        const trigger = document.querySelector(${JSON.stringify(options.triggerSelector)});
        if (!(trigger instanceof HTMLElement)) {
          return { ok: false, reason: 'Trigger not found' };
        }
        trigger.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    const fallbackInfo = fallbackClick.result?.value as { ok?: boolean; reason?: string } | undefined;
    if (!fallbackInfo?.ok) {
      return { ok: false, reason: fallbackInfo?.reason || 'Row menu did not open' };
    }
    const ready = await waitForMenuOpen(client.Runtime, {
      menuSelector: options.menuSelector,
      fallbackSelectors: options.menuSelector
        ? [options.menuSelector, '[role="menu"], [role="listbox"], [data-radix-collection-item]']
        : ['[role="menu"], [role="listbox"], [data-radix-collection-item]'],
      timeoutMs,
    });
    if (!ready.ok) {
      return { ok: false, reason: 'Row menu did not open' };
    }
    return { ok: true, menuSelector: ready.menuSelector || options.menuSelector };
  }
  if (!opened.ok) {
    return { ok: false, reason: 'Row menu did not open' };
  }
  return { ok: true, menuSelector: opened.menuSelector || options.menuSelector };
}

export async function openAndSelectRevealedRowMenuItem(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: OpenAndSelectRevealedRowMenuItemOptions,
): Promise<{ ok: boolean; reason?: string; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openRevealedRowMenu(client, options);
  if (!opened.ok) {
    return opened;
  }

  const menuSelector = opened.menuSelector || options.menuSelector;
  const itemRootSelectors = options.itemRootSelectors ?? (menuSelector ? [menuSelector] : ['[role="menu"]']);
  const interactionStrategies = resolveInteractionStrategies(options.itemInteractionStrategies, ['pointer']);
  const clicked = await pressButton(client.Runtime, {
    match: options.itemMatch,
    rootSelectors: itemRootSelectors,
    interactionStrategies,
    requireVisible: true,
    timeoutMs,
  });
  if (!clicked.ok) {
    return {
      ok: false,
      reason: clicked.reason || 'Row menu item not found',
      menuSelector,
    };
  }
  if (options.closeMenuAfter) {
    await waitForNotSelector(client.Runtime, menuSelector || '[role="menu"], [role="listbox"]', timeoutMs);
  }
  return { ok: true, menuSelector };
}

export async function pressDialogButton(
  Runtime: ChromeClient['Runtime'],
  options: PressDialogButtonOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? DEFAULT_DIALOG_SELECTORS)};
        const includeAny = ${JSON.stringify(options.match.includeAny ?? [])};
        const includeAll = ${JSON.stringify(options.match.includeAll ?? [])};
        const startsWith = ${JSON.stringify(options.match.startsWith ?? [])};
        const exact = ${JSON.stringify(options.match.exact ?? [])};
        const preferLast = ${JSON.stringify(Boolean(options.preferLast))};
        const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const matches = (label) => {
          if (!label) return false;
          if (exact.length && exact.includes(label)) return true;
          if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
          if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
          if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
          return false;
        };
        const roots = rootSelectors
          .map((selector) => document.querySelector(selector))
          .filter(Boolean);
        const root = roots[0] || document;
        const buttons = Array.from(root.querySelectorAll('button, [role="button"]'));
        const matchesList = buttons
          .map((button) => ({
            button,
            label: normalize(button.getAttribute?.('aria-label') || button.textContent || ''),
          }))
          .filter((entry) => matches(entry.label));
        if (matchesList.length === 0) {
          return { ok: false, reason: 'Dialog button not found' };
        }
        const target = preferLast ? matchesList[matchesList.length - 1] : matchesList[0];
        target.button.click();
        return { ok: true, matchedLabel: target.label };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as { ok: boolean; reason?: string; matchedLabel?: string } | undefined;
    if (info?.ok) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ok: false, reason: 'Dialog button not found' };
}

export async function findAndClickByLabel(
  Runtime: ChromeClient['Runtime'],
  options: FindAndClickOptions,
): Promise<boolean> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(options.selectors)};
    const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
    const includeAny = ${JSON.stringify(options.match.includeAny ?? [])};
    const includeAll = ${JSON.stringify(options.match.includeAll ?? [])};
    const startsWith = ${JSON.stringify(options.match.startsWith ?? [])};
    const exact = ${JSON.stringify(options.match.exact ?? [])};
    const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();

    const roots = rootSelectors.length
      ? rootSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      : [document];
    const seen = new Set();
    const nodes = [];
    for (const root of roots) {
      if (!(root instanceof Element || root instanceof Document)) continue;
      for (const node of Array.from(root.querySelectorAll(selectors.join(',')))) {
        if (seen.has(node)) continue;
        seen.add(node);
        nodes.push(node);
      }
    }

    const matches = (label) => {
      if (!label) return false;
      if (exact.length && exact.includes(label)) return true;
      if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
      if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
      if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
      return false;
    };

    for (const node of nodes) {
      const label = normalize(node.getAttribute?.('aria-label') || node.textContent || '');
      if (!matches(label)) continue;
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      node.dispatchEvent(clickEvent);
      return true;
    }
    return false;
  })()`;
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  return Boolean(result?.value);
}

export async function closeDialog(
  Runtime: ChromeClient['Runtime'],
  dialogSelectors: readonly string[] = DEFAULT_DIALOG_SELECTORS,
): Promise<void> {
  const expression = `(() => {
    const selectors = ${JSON.stringify(dialogSelectors)};
    const getDialog = () => selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    const dialog = getDialog();
    if (!dialog) return true;

    const closeButton =
      dialog.querySelector('[aria-label*="close" i], [data-state="open"] [aria-label*="close" i]') ||
      dialog.querySelector('button[aria-label*="close" i]') ||
      dialog.querySelector('button[title*="close" i]');
    if (closeButton) {
      closeButton.click();
    }

    const backdrop =
      dialog.parentElement?.querySelector?.('[data-state="open"][class*="backdrop"]') ||
      document.querySelector('[data-state="open"][data-radix-portal] > [class*="backdrop"]') ||
      document.querySelector('[data-radix-portal] [data-state="open"]');
    if (backdrop && backdrop !== dialog) {
      backdrop.click();
    }

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    const active = getDialog();
    if (active) {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    return true;
  })()`;
  await Runtime.evaluate({ expression, returnByValue: true });

  const combined = dialogSelectors.join(', ');
  await waitForNotSelector(Runtime, combined, 3000);
}

export async function dismissOverlayRoot(
  Runtime: ChromeClient['Runtime'],
  rootSelector: string,
  options: DismissOverlayRootOptions = {},
): Promise<boolean> {
  const buttonSelectors = Array.from(
    new Set(
      (options.buttonSelectors?.length ? options.buttonSelectors : Array.from(DEFAULT_VISIBLE_OVERLAY_BUTTON_SELECTORS)).filter(
        Boolean,
      ),
    ),
  );
  const closeButtonMatch: LabelMatchOptions = options.closeButtonMatch ?? {
    includeAny: ['close', 'dismiss', 'ok', 'okay', 'got it', 'cancel', 'done'],
  };
  await Runtime.evaluate({
    expression: `(() => {
      const rootSelector = ${JSON.stringify(rootSelector)};
      const buttonSelectors = ${JSON.stringify(buttonSelectors)};
      const match = ${JSON.stringify(closeButtonMatch)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matches = (label) => {
        if (!label) return false;
        const exact = (match.exact || []).map(normalize);
        const startsWith = (match.startsWith || []).map(normalize);
        const includeAll = (match.includeAll || []).map(normalize);
        const includeAny = (match.includeAny || []).map(normalize);
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const root = document.querySelector(rootSelector);
      if (!root || !isVisible(root)) {
        return { ok: true, reason: 'overlay-missing' };
      }
      const candidates = [];
      for (const selector of buttonSelectors) {
        for (const node of Array.from(root.querySelectorAll(selector))) {
          if (!isVisible(node)) continue;
          const label = normalize(node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.textContent || '');
          if (!label) continue;
          candidates.push({ node, label });
        }
      }
      const target = candidates.find((entry) => matches(entry.label));
      if (target?.node instanceof HTMLElement) {
        target.node.click();
      }
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(escapeEvent);
      if (root instanceof HTMLElement) {
        root.dispatchEvent(escapeEvent);
      }
      return { ok: true };
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
  return waitForNotSelector(Runtime, rootSelector, options.timeoutMs ?? 3_000);
}

export async function dismissOpenMenus(
  Runtime: ChromeClient['Runtime'],
  timeoutMs = 1_500,
): Promise<boolean> {
  const menuSelector = '[role="menu"], [role="listbox"], [data-radix-collection-root]';
  const visibleMenus = await Runtime.evaluate({
    expression: `(() => {
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(menuSelector)}));
      return nodes.some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    })()`,
    returnByValue: true,
  });
  if (!visibleMenus.result?.value) {
    return false;
  }

  await Runtime.evaluate({
    expression: `(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent?.(event);
      document.body.dispatchEvent(event);
      return true;
    })()`,
    returnByValue: true,
  });

  await waitForPredicate(
    Runtime,
    `(() => {
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(menuSelector)}));
      return nodes.every((node) => {
        const rect = node.getBoundingClientRect();
        return !(rect.width > 0 && rect.height > 0);
      });
    })()`,
    { timeoutMs, description: 'visible menus dismissed' },
  );
  return true;
}

export async function pressButton(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions,
): Promise<{ ok: boolean; reason?: string; matchedLabel?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (options.selector) {
    const ready = options.requireVisible ?? true
      ? await waitForVisibleSelector(Runtime, options.selector, {
          timeoutMs,
          rootSelectors: options.rootSelectors,
        })
      : await waitForPredicate(
          Runtime,
          `Boolean(document.querySelector(${JSON.stringify(options.selector)}))`,
          { timeoutMs, description: `selector ${options.selector}` },
        );
    if (!ready.ok) {
      return {
        ok: false,
        reason: `${options.requireVisible ?? true ? 'Visible selector' : 'Selector'} not found: ${options.selector}`,
      };
    }
  }
  const interactionStrategies = resolveInteractionStrategies(options.interactionStrategies, ['click']);
  const perAttemptTimeoutMs = Math.max(250, Math.floor(timeoutMs / Math.max(interactionStrategies.length, 1)));
  let lastReason = 'Button click failed';
  let matchedLabel: string | undefined;

  for (const interactionStrategy of interactionStrategies) {
    const info = await dispatchMatchedTrigger(Runtime, options, interactionStrategy);
    if (!info.ok) {
      lastReason = info.reason || lastReason;
      continue;
    }
    matchedLabel = info.matchedLabel;
    if (options.postSelector) {
      const ok = await waitForSelector(Runtime, options.postSelector, perAttemptTimeoutMs);
      if (!ok) {
        lastReason = 'Post selector not found: ' + options.postSelector;
        continue;
      }
    }
    if (options.postGoneSelector) {
      const ok = await waitForNotSelector(Runtime, options.postGoneSelector, perAttemptTimeoutMs);
      if (!ok) {
        lastReason = 'Post-gone selector still present: ' + options.postGoneSelector;
        continue;
      }
    }
    return { ok: true, matchedLabel };
  }

  return { ok: false, reason: lastReason };
}

export async function pressButtonWithTrustedPointer(
  client: Pick<ChromeClient, 'Runtime' | 'Input'>,
  options: Omit<PressButtonOptions, 'interactionStrategies'>,
): Promise<TrustedPointerPressButtonResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const stateKey = `__browserServiceTrustedPointer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const prepared = await waitForPredicate(
    client.Runtime,
    `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const stateKey = ${JSON.stringify(stateKey)};
      const logCandidatesOnMiss = ${JSON.stringify(options.logCandidatesOnMiss ?? false)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((rootSelector) => ({
            rootSelector,
            root: document.querySelector(rootSelector),
          })).filter((entry) => entry.root)
        : [{ rootSelector: 'document', root: document }];
      const candidateLabels = [];
      for (const entry of roots) {
        const candidates = selector
          ? Array.from(entry.root.querySelectorAll(selector))
          : Array.from(entry.root.querySelectorAll(
              'button,[role="button"],a,[role="link"],[role="menuitem"],[role="menuitemradio"],[role="option"]',
            ));
        const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
        const match = selector
          ? visibleCandidates[0] || null
          : visibleCandidates.find((element) => {
              const label = normalize(element.getAttribute?.('aria-label') || element.textContent || '');
              return matchesLabel(label);
            }) || null;
        if (!match) {
          if (logCandidatesOnMiss) {
            candidateLabels.push(
              ...visibleCandidates
                .map((element) => normalize(element.getAttribute?.('aria-label') || element.textContent || ''))
                .filter(Boolean)
                .slice(0, 12 - candidateLabels.length),
            );
          }
          continue;
        }
        const label = normalize(match.getAttribute?.('aria-label') || match.textContent || '');
        if (match.disabled || match.getAttribute?.('aria-disabled') === 'true') {
          return null;
        }
        match.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = match.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.top >= window.innerHeight ||
          rect.left >= window.innerWidth
        ) {
          return null;
        }
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        const hit = document.elementFromPoint(center.x, center.y);
        if (!hit || !(hit === match || match.contains(hit))) {
          return null;
        }
        const controller = new AbortController();
        window[stateKey] = { controller, result: null };
        match.addEventListener('click', (event) => {
          const state = window[stateKey];
          if (state) {
            state.result = {
              trusted: event.isTrusted === true,
              matchedLabel: label,
              rootSelectorUsed: entry.rootSelector,
            };
          }
        }, { capture: true, once: true, signal: controller.signal });
        return {
          ok: true,
          center,
          matchedLabel: label,
          rootSelectorUsed: entry.rootSelector,
        };
      }
      return null;
    })()`,
    {
      timeoutMs,
      description: 'trusted pointer button target',
    },
  );
  const target = prepared.value as
    | {
        ok?: boolean;
        reason?: string;
        center?: { x: number; y: number };
        matchedLabel?: string;
        rootSelectorUsed?: string | null;
      }
    | undefined;
  if (!prepared.ok || !target?.ok || !target.center) {
    return {
      ok: false,
      reason: target?.reason || 'Trusted pointer button target not found',
      matchedLabel: target?.matchedLabel,
      rootSelectorUsed: target?.rootSelectorUsed ?? null,
    };
  }

  const x = Math.round(target.center.x);
  const y = Math.round(target.center.y);
  await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y, button: 'none' });
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  const activation = await waitForPredicate(
    client.Runtime,
    `window[${JSON.stringify(stateKey)}]?.result || null`,
    {
      timeoutMs: Math.min(timeoutMs, 1500),
      pollMs: 50,
      description: 'trusted pointer click activation',
    },
  );
  await client.Runtime.evaluate({
    expression: `(() => {
      const state = window[${JSON.stringify(stateKey)}];
      state?.controller?.abort?.();
      delete window[${JSON.stringify(stateKey)}];
      return true;
    })()`,
    returnByValue: true,
  });
  const activationResult = activation.value as
    | { trusted?: boolean; matchedLabel?: string; rootSelectorUsed?: string | null }
    | undefined;
  if (!activation.ok || activationResult?.trusted !== true) {
    return {
      ok: false,
      reason: activationResult
        ? 'Matched control did not receive a trusted click'
        : 'Matched control did not receive a click',
      matchedLabel: activationResult?.matchedLabel ?? target.matchedLabel,
      rootSelectorUsed: activationResult?.rootSelectorUsed ?? target.rootSelectorUsed ?? null,
      trusted: activationResult?.trusted ?? false,
    };
  }

  if (options.postSelector) {
    const ok = await waitForSelector(client.Runtime, options.postSelector, timeoutMs);
    if (!ok) {
      return {
        ok: false,
        reason: `Post selector not found: ${options.postSelector}`,
        matchedLabel: activationResult.matchedLabel,
        rootSelectorUsed: activationResult.rootSelectorUsed ?? null,
        trusted: true,
      };
    }
  }
  if (options.postGoneSelector) {
    const ok = await waitForNotSelector(client.Runtime, options.postGoneSelector, timeoutMs);
    if (!ok) {
      return {
        ok: false,
        reason: `Post-gone selector still present: ${options.postGoneSelector}`,
        matchedLabel: activationResult.matchedLabel,
        rootSelectorUsed: activationResult.rootSelectorUsed ?? null,
        trusted: true,
      };
    }
  }

  return {
    ok: true,
    matchedLabel: activationResult.matchedLabel ?? target.matchedLabel,
    rootSelectorUsed: activationResult.rootSelectorUsed ?? target.rootSelectorUsed ?? null,
    trusted: true,
  };
}

export async function openSurface(
  Runtime: ChromeClient['Runtime'],
  options: OpenSurfaceOptions,
): Promise<OpenSurfaceResult> {
  if (!options.readyExpression && !options.readySelector) {
    throw new Error('openSurface requires readyExpression or readySelector');
  }
  const attempts: OpenSurfaceResult['attempts'] = [];
  const waitForReady = async (timeoutMs: number): Promise<boolean> => {
    if (options.readySelector) {
      return waitForSelector(Runtime, options.readySelector, timeoutMs);
    }
    const ready = await waitForPredicate(Runtime, options.readyExpression!, {
      timeoutMs,
      pollMs: options.pollMs,
      description: options.readyDescription,
    });
    return ready.ok;
  };

  const alreadyOpen = await waitForReady(options.alreadyOpenTimeoutMs ?? 500);
  if (alreadyOpen) {
    return { ok: true, attempt: 'already-open', attempts };
  }

  for (const attempt of options.attempts) {
    const pressed = await pressButton(Runtime, {
      ...attempt.trigger,
      timeoutMs: attempt.trigger.timeoutMs ?? options.timeoutMs,
    });
    const record: OpenSurfaceResult['attempts'][number] = {
      name: attempt.name,
      triggerOk: pressed.ok,
      triggerReason: pressed.reason,
      matchedLabel: pressed.matchedLabel,
    };
    if (!pressed.ok) {
      attempts.push(record);
      continue;
    }
    const ready = await waitForReady(options.readyTimeoutMs ?? options.timeoutMs ?? 5000);
    record.readyOk = ready;
    attempts.push(record);
    if (ready) {
      return { ok: true, attempt: attempt.name, attempts };
    }
  }

  const last = attempts.at(-1);
  return {
    ok: false,
    reason: last?.triggerReason || `Surface did not become ready${options.readyDescription ? `: ${options.readyDescription}` : ''}`,
    attempts,
  };
}

export async function queryRowsByText(
  Runtime: ChromeClient['Runtime'],
  options: { rootSelector: string; rowSelector: string; match: QueryRowMatch },
): Promise<RowMatchInfo> {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = Array.from(root.querySelectorAll(${JSON.stringify(options.rowSelector)}));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const target = ${JSON.stringify(options.match.text)};
      const needle = ${JSON.stringify(options.match.caseSensitive ? null : options.match.text.toLowerCase())};
      const matchRow = rows.find((row) => {
        const text = normalize(row.textContent || '');
        if (!text) return false;
        if (${JSON.stringify(Boolean(options.match.caseSensitive))}) {
          return text.includes(target);
        }
        return text.toLowerCase().includes(needle);
      });
      if (!matchRow) return { ok: false, reason: 'Row not found' };
      const selector = matchRow.getAttribute('data-oracle-row-selector') || '';
      return { ok: true, text: normalize(matchRow.textContent || ''), selector };
    })()`,
    returnByValue: true,
  });
  const info = result.result?.value as RowMatchInfo | undefined;
  return info ?? { ok: false, reason: 'Row not found' };
}

export async function ensureCollapsibleExpanded(
  Runtime: ChromeClient['Runtime'],
  options: EnsureCollapsibleExpandedOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const result = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = root.querySelectorAll(${JSON.stringify(options.rowSelector)});
      return { ok: rows.length > 0 };
    })()`,
    returnByValue: true,
  });
  if (result.result?.value?.ok) {
    return;
  }
  const pressed = await pressButton(Runtime, {
    selector: options.toggleSelector,
    match: options.toggleMatch,
    rootSelectors: options.toggleSelector ? undefined : [options.rootSelector],
    requireVisible: true,
    timeoutMs,
  });
  if (!pressed.ok) {
    throw new Error(pressed.reason || 'Collapsible toggle not found');
  }
  const ready = await waitForSelector(Runtime, options.rowSelector, timeoutMs);
  if (!ready) {
    throw new Error('Collapsible rows did not appear');
  }
}

export async function hoverRowAndClickAction(
  Runtime: ChromeClient['Runtime'],
  Input: ChromeClient['Input'],
  options: HoverRowActionOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const rectResult = await Runtime.evaluate({
    expression: `(() => {
      const root = document.querySelector(${JSON.stringify(options.rootSelector)});
      if (!root) return { ok: false, reason: 'Root not found' };
      const rows = Array.from(root.querySelectorAll(${JSON.stringify(options.rowSelector)}));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const target = ${JSON.stringify(options.match.text)};
      const needle = ${JSON.stringify(options.match.caseSensitive ? null : options.match.text.toLowerCase())};
      const row = rows.find((el) => {
        const text = normalize(el.textContent || '');
        if (!text) return false;
        if (${JSON.stringify(Boolean(options.match.caseSensitive))}) {
          return text.includes(target);
        }
        return text.toLowerCase().includes(needle);
      });
      if (!row) return { ok: false, reason: 'Row not found' };
      row.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = row.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: 'Row not visible' };
      }
      return {
        ok: true,
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    })()`,
    returnByValue: true,
  });
  const rectInfo = rectResult.result?.value as
    | { ok: true; center: { x: number; y: number } }
    | { ok: false; reason?: string }
    | undefined;
  if (!rectInfo?.ok) {
    throw new Error(rectInfo?.reason || 'Row not found');
  }
  const x = Math.round(rectInfo.center.x);
  const y = Math.round(rectInfo.center.y);
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

  const clicked = await pressButton(Runtime, {
    match: options.actionMatch,
    rootSelectors: [options.rootSelector],
    requireVisible: true,
    timeoutMs,
  });
  if (!clicked.ok) {
    throw new Error(clicked.reason || 'Row action not found');
  }
}

export async function openRadixMenu(
  Runtime: ChromeClient['Runtime'],
  options: OpenRadixMenuOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  return openMenu(Runtime, options);
}

export async function openDialog(
  Runtime: ChromeClient['Runtime'],
  options: PressButtonOptions & { dialogSelectors?: readonly string[]; readySelector?: string },
): Promise<boolean> {
  const pressed = await pressButton(Runtime, options);
  if (!pressed.ok) return false;
  const dialogSelectors = options.dialogSelectors ?? DEFAULT_DIALOG_SELECTORS;
  const opened = await waitForDialog(Runtime, options.timeoutMs ?? 5000, dialogSelectors);
  if (!opened) return false;
  if (options.readySelector) {
    return waitForSelector(Runtime, options.readySelector, options.timeoutMs ?? 5000);
  }
  return true;
}

export async function openMenu(
  Runtime: ChromeClient['Runtime'],
  options: OpenMenuOptions,
): Promise<{
  ok: boolean;
  menuSelector?: string;
  interactionStrategy?: UiInteractionStrategy;
  rootSelectorUsed?: string | null;
  reason?: string;
  attemptedStrategies?: UiInteractionStrategy[];
}> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const interactionStrategies = resolveInteractionStrategies(options.trigger.interactionStrategies, ['pointer']);
  const perAttemptTimeoutMs = Math.max(250, Math.floor(timeoutMs / Math.max(interactionStrategies.length, 1)));
  let lastReason = 'Menu trigger not found';
  let lastRootSelectorUsed: string | null = null;
  const useAnchoredMenuSelection = Boolean(
    options.anchorSelector || options.expectedItemMatch || (options.anchorRootSelectors && options.anchorRootSelectors.length > 0),
  );
  const fallbackSelectors = buildMenuFallbackSelectors(options.menuSelector);
  const inventorySelectors = Array.from(
    new Set(
      fallbackSelectors.filter(isLikelyMenuContainerSelector),
    ),
  );
  const existingMenuSignatures = useAnchoredMenuSelection
    ? (await collectVisibleMenuInventory(Runtime, {
        menuSelectors: inventorySelectors,
        anchorSelector: options.anchorSelector,
        anchorRootSelectors: options.anchorRootSelectors,
        limit: 12,
      })).map((entry) => entry.signature)
    : [];

  for (const interactionStrategy of interactionStrategies) {
    const info = await dispatchMatchedTrigger(Runtime, options.trigger, interactionStrategy);
    if (!info.ok) {
      lastReason = info.reason || lastReason;
      continue;
    }
    lastRootSelectorUsed = info.rootSelectorUsed ?? null;
    const menuSelector = info.listId ? `#${info.listId}` : options.menuSelector;
    const ready = await waitForMenuOpen(Runtime, {
      menuSelector,
      fallbackSelectors,
      anchorSelector: options.anchorSelector,
      anchorRootSelectors: options.anchorRootSelectors,
      expectedItemMatch: options.expectedItemMatch,
      existingMenuSignatures,
      timeoutMs: perAttemptTimeoutMs,
    });
    if (ready.ok) {
      return {
        ok: true,
        menuSelector: ready.menuSelector,
        interactionStrategy,
        rootSelectorUsed: lastRootSelectorUsed,
        attemptedStrategies: interactionStrategies,
      };
    }
    lastReason = `Menu did not open after ${interactionStrategy}`;
  }
  return {
    ok: false,
    reason: lastReason,
    rootSelectorUsed: lastRootSelectorUsed,
    attemptedStrategies: interactionStrategies,
  };
}

export async function waitForMenuOpen(
  Runtime: ChromeClient['Runtime'],
  options: WaitForMenuOpenOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const fallbackSelectors = options.fallbackSelectors ?? buildMenuFallbackSelectors(options.menuSelector);
  const primarySelector = options.menuSelector ?? fallbackSelectors[0];
  const useInventorySelection = Boolean(
    options.anchorSelector ||
      options.expectedItemMatch ||
      (options.anchorRootSelectors && options.anchorRootSelectors.length > 0) ||
      (options.existingMenuSignatures && options.existingMenuSignatures.length > 0),
  );
  if (useInventorySelection) {
    const menuSelectors = Array.from(
      new Set([primarySelector, ...fallbackSelectors].filter(isLikelyMenuContainerSelector)),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inventory = await collectVisibleMenuInventory(Runtime, {
        menuSelectors,
        anchorSelector: options.anchorSelector,
        anchorRootSelectors: options.anchorRootSelectors,
        limit: 12,
      });
      if (inventory.length > 0) {
        const existingSignatures = new Set(options.existingMenuSignatures ?? []);
        const ranked = inventory
          .map((entry) => {
            const itemScore = options.expectedItemMatch
              ? Math.max(0, ...entry.itemLabels.map((label) => scoreLabelMatch(label, options.expectedItemMatch)))
              : 1;
            if (options.expectedItemMatch && itemScore <= 0) {
              return { entry, score: 0 };
            }
            const noveltyScore = existingSignatures.size > 0 && !existingSignatures.has(entry.signature) ? 10_000 : 0;
            const distanceScore =
              entry.distanceToAnchor == null ? 0 : Math.max(0, 1_000 - Math.min(entry.distanceToAnchor, 1_000));
            const selectorScore = entry.sourceSelector === primarySelector ? 50 : 0;
            return {
              entry,
              score: itemScore + noveltyScore + distanceScore + selectorScore,
            };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score);
        const best = ranked[0]?.entry;
        if (best) {
          return { ok: true, menuSelector: best.selector };
        }
      }
      await sleep(Math.min(DEFAULT_WAIT_POLL_MS, Math.max(25, Math.floor(timeoutMs / 20))));
    }
    return { ok: false };
  }
  const primaryReady = await waitForSelector(Runtime, primarySelector, timeoutMs);
  if (primaryReady) {
    return { ok: true, menuSelector: primarySelector };
  }
  for (const selector of fallbackSelectors) {
    if (selector === primarySelector) continue;
    const ready = await waitForSelector(Runtime, selector, timeoutMs);
    if (ready) {
      return { ok: true, menuSelector: selector };
    }
  }
  return { ok: false };
}

export async function pressMenuButtonByAriaLabel(
  Runtime: ChromeClient['Runtime'],
  options: PressMenuButtonByAriaLabelOptions,
): Promise<{ ok: boolean; menuSelector?: string }> {
  return openMenu(Runtime, {
    trigger: {
      match: { exact: [options.label.toLowerCase()] },
      rootSelectors: options.rootSelectors,
    },
    menuSelector: options.menuSelector,
    timeoutMs: options.timeoutMs,
  });
}

export async function openSubmenu(
  Runtime: ChromeClient['Runtime'],
  options: OpenSubmenuOptions,
): Promise<OpenSubmenuResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const fallbackSelectors = buildMenuFallbackSelectors(options.submenuSelector);
  const inventorySelectors = Array.from(new Set(fallbackSelectors.filter(isLikelyMenuContainerSelector)));
  const existingMenuSignatures = (
    await collectVisibleMenuInventory(Runtime, {
      menuSelectors: inventorySelectors,
      limit: 12,
    })
  ).map((entry) => entry.signature);

  const interactionStrategies = resolveInteractionStrategies(options.interactionStrategies, ['pointer', 'click']);
  const pressed = await pressButton(Runtime, {
    match: options.itemMatch,
    rootSelectors: [options.parentMenuSelector],
    requireVisible: true,
    interactionStrategies,
    timeoutMs,
  });
  if (!pressed.ok) {
    return { ok: false, reason: pressed.reason };
  }
  const ready = await waitForMenuOpen(Runtime, {
    menuSelector: options.submenuSelector,
    fallbackSelectors,
    expectedItemMatch: options.expectedItemMatch,
    existingMenuSignatures,
    timeoutMs,
  });
  if (!ready.ok) {
    return { ok: false, reason: 'Submenu did not open' };
  }
  return {
    ok: true,
    menuSelector: ready.menuSelector,
    interactionStrategy: interactionStrategies[0],
  };
}

export async function openAndSelectMenuItem(
  Runtime: ChromeClient['Runtime'],
  options: OpenAndSelectMenuItemOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openMenu(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    expectedItemMatch: options.itemMatch,
    timeoutMs,
  });
  if (!opened.ok) return false;
  const menuSelector = opened.menuSelector || options.menuSelector;
  const clicked = await selectMenuItem(Runtime, {
    menuSelector,
    menuRootSelectors: options.menuRootSelectors,
    itemMatch: options.itemMatch,
    timeoutMs,
    closeMenuAfter: options.closeMenuAfter,
  });
  return clicked;
}

export async function openAndSelectMenuItemFromTriggers(
  Runtime: ChromeClient['Runtime'],
  options: OpenAndSelectMenuItemFromTriggersOptions,
): Promise<OpenAndSelectMenuItemFromTriggersResult> {
  if (!options.triggers.length) {
    return {
      ok: false,
      reason: 'No menu triggers configured',
      attempts: [],
    };
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  const attempts: OpenAndSelectMenuItemFromTriggersResult['attempts'] = [];
  let lastReason = 'Menu item could not be selected from any trigger';

  for (let index = 0; index < options.triggers.length; index += 1) {
    const candidate = options.triggers[index]!;
    if (index > 0 && options.dismissOpenMenusBetweenAttempts !== false) {
      await dismissOpenMenus(Runtime, Math.min(timeoutMs, 1_500)).catch(() => false);
    }
    await candidate.beforeAttempt?.();
    const opened = await openMenu(Runtime, {
      trigger: candidate.trigger,
      menuSelector: candidate.menuSelector,
      expectedItemMatch: options.itemMatch,
      timeoutMs,
    });
    if (!opened.ok) {
      const reason = opened.reason || 'Menu did not open';
      attempts.push({
        triggerIndex: index,
        triggerName: candidate.name,
        menuOpened: false,
        menuSelected: false,
        reason,
      });
      lastReason = reason;
      continue;
    }
    const menuSelector = opened.menuSelector || candidate.menuSelector;
    const selected = await selectMenuItem(Runtime, {
      menuSelector,
      menuRootSelectors: candidate.menuRootSelectors,
      itemMatch: options.itemMatch,
      timeoutMs,
      closeMenuAfter: candidate.closeMenuAfter,
    });
    if (selected) {
      attempts.push({
        triggerIndex: index,
        triggerName: candidate.name,
        menuOpened: true,
        menuSelected: true,
        menuSelector,
      });
      return {
        ok: true,
        triggerIndex: index,
        triggerName: candidate.name,
        menuSelector,
        attempts,
      };
    }
    const reason = 'Menu item not found';
    attempts.push({
      triggerIndex: index,
      triggerName: candidate.name,
      menuOpened: true,
      menuSelected: false,
      reason,
      menuSelector,
    });
    lastReason = reason;
  }

  return {
    ok: false,
    reason: lastReason,
    attempts,
  };
}

export async function selectMenuItem(
  Runtime: ChromeClient['Runtime'],
  options: SelectMenuItemOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const ready = await waitForSelector(
    Runtime,
    options.menuSelector || '[role="menu"], [role="listbox"], [data-radix-collection-item]',
    timeoutMs,
  );
  if (!ready) return false;
  const clicked = await findAndClickByLabel(Runtime, {
    selectors: ['[role="menuitem"]', '[role="menuitemradio"]', '[role="option"]', '[data-radix-collection-item]', 'button', 'a'],
    match: options.itemMatch,
    rootSelectors: options.menuRootSelectors ?? (options.menuSelector ? [options.menuSelector] : undefined),
  });
  if (!clicked) return false;
  if (options.closeMenuAfter) {
    await waitForNotSelector(Runtime, options.menuSelector || '[role="menu"], [role="listbox"]', timeoutMs);
  }
  return true;
}

export async function selectFromListbox(
  Runtime: ChromeClient['Runtime'],
  options: SelectFromListboxOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openMenu(Runtime, {
    trigger: options.trigger,
    menuSelector: options.listboxSelector,
    expectedItemMatch: options.itemMatch,
    timeoutMs,
  });
  if (!opened.ok) return false;
  const menuSelector = opened.menuSelector || options.listboxSelector;
  const clicked = await findAndClickByLabel(Runtime, {
    selectors: ['[role="option"]', '[data-radix-collection-item]', '[data-slot="select-item"]'],
    match: options.itemMatch,
    rootSelectors: menuSelector ? [menuSelector] : undefined,
  });
  if (!clicked) return false;
  if (options.closeAfter !== false) {
    await waitForNotSelector(Runtime, menuSelector || '[role="listbox"]', timeoutMs);
  }
  return true;
}

export async function openAndSelectListbox(
  Runtime: ChromeClient['Runtime'],
  options: OpenAndSelectListboxOptions,
): Promise<boolean> {
  return selectFromListbox(Runtime, options);
}

export async function selectNestedMenuPath(
  Runtime: ChromeClient['Runtime'],
  options: SelectNestedMenuPathOptions,
): Promise<SelectNestedMenuPathResult> {
  if (!options.steps.length) {
    return { ok: false, reason: 'Nested menu path requires at least one step' };
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  const opened = await openMenu(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    expectedItemMatch: options.steps[0]?.itemMatch,
    timeoutMs,
  });
  if (!opened.ok) {
    return { ok: false, reason: opened.reason };
  }

  let currentMenuSelector = opened.menuSelector || options.menuSelector;
  for (let index = 0; index < options.steps.length; index += 1) {
    const step = options.steps[index];
    if (!currentMenuSelector) {
      return { ok: false, failedStep: index, reason: 'Current menu selector unavailable' };
    }
    const isLast = index === options.steps.length - 1;
    if (isLast) {
      const clicked = await selectMenuItem(Runtime, {
        menuSelector: currentMenuSelector,
        menuRootSelectors: [currentMenuSelector],
        itemMatch: step.itemMatch,
        timeoutMs,
        closeMenuAfter: options.closeMenuAfter,
      });
      return clicked
        ? { ok: true, menuSelector: currentMenuSelector }
        : { ok: false, failedStep: index, reason: 'Nested menu item not found' };
    }

    const submenu = await openSubmenu(Runtime, {
      parentMenuSelector: currentMenuSelector,
      itemMatch: step.itemMatch,
      submenuSelector: step.menuSelector,
      expectedItemMatch: options.steps[index + 1]?.itemMatch,
      interactionStrategies: step.interactionStrategies,
      timeoutMs,
    });
    if (!submenu.ok) {
      return { ok: false, failedStep: index, reason: submenu.reason };
    }
    currentMenuSelector = submenu.menuSelector || step.menuSelector;
  }

  return { ok: false, reason: 'Nested menu path ended unexpectedly' };
}

export async function inspectNestedMenuPathSelection(
  Runtime: ChromeClient['Runtime'],
  options: InspectNestedMenuPathSelectionOptions,
): Promise<InspectNestedMenuPathSelectionResult> {
  if (!options.steps.length) {
    return { ok: false, reason: 'Nested menu path requires at least one step' };
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  const selectedItemMatch = options.selectedItemMatch ?? options.steps[options.steps.length - 1]?.itemMatch;

  try {
    const opened = await openMenu(Runtime, {
      trigger: options.trigger,
      menuSelector: options.menuSelector,
      expectedItemMatch: options.steps[0]?.itemMatch,
      timeoutMs,
    });
    if (!opened.ok) {
      return { ok: false, reason: opened.reason };
    }

    let currentMenuSelector = opened.menuSelector || options.menuSelector;
    for (let index = 0; index < options.steps.length - 1; index += 1) {
      const step = options.steps[index];
      if (!currentMenuSelector) {
        return { ok: false, failedStep: index, reason: 'Current menu selector unavailable' };
      }
      const submenu = await openSubmenu(Runtime, {
        parentMenuSelector: currentMenuSelector,
        itemMatch: step.itemMatch,
        submenuSelector: step.menuSelector,
        expectedItemMatch: options.steps[index + 1]?.itemMatch,
        interactionStrategies: step.interactionStrategies,
        timeoutMs,
      });
      if (!submenu.ok) {
        return { ok: false, failedStep: index, reason: submenu.reason };
      }
      currentMenuSelector = submenu.menuSelector || step.menuSelector;
    }

    if (!currentMenuSelector) {
      return { ok: false, failedStep: options.steps.length - 1, reason: 'Current menu selector unavailable' };
    }

    const inventory = await collectVisibleMenuInventory(Runtime, {
      menuSelectors: [currentMenuSelector],
      limit: 12,
    });
    const menuEntry = inventory.find((entry) => entry.selector === currentMenuSelector) ?? inventory[0];
    if (!menuEntry) {
      return {
        ok: false,
        failedStep: options.steps.length - 1,
        reason: 'Verification menu not found',
      };
    }

    const matchedItem = findBestVisibleMenuItemMatch(menuEntry.items, selectedItemMatch);
    if (!matchedItem) {
      return {
        ok: true,
        selected: false,
        label: null,
        menuSelector: menuEntry.selector,
        availableLabels: menuEntry.itemLabels,
      };
    }

    return {
      ok: true,
      selected: matchedItem.selected,
      label: matchedItem.label,
      menuSelector: menuEntry.selector,
      availableLabels: menuEntry.itemLabels,
    };
  } finally {
    if (options.closeMenusAfter !== false) {
      await dismissOpenMenus(Runtime, 500).catch(() => false);
    }
  }
}

export async function selectAndVerifyNestedMenuPathOption(
  Runtime: ChromeClient['Runtime'],
  options: SelectAndVerifyNestedMenuPathOptionOptions,
): Promise<SelectAndVerifyNestedMenuPathOptionResult> {
  const initial = await inspectNestedMenuPathSelection(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    steps: options.steps,
    selectedItemMatch: options.selectedItemMatch,
    timeoutMs: options.timeoutMs,
    closeMenusAfter: options.closeMenusAfter,
  });
  if (!initial.ok) {
    return {
      ok: false,
      phase: 'inspect',
      reason: initial.reason,
      failedStep: initial.failedStep,
      availableLabels: initial.availableLabels,
    };
  }
  if (initial.selected) {
    return {
      ok: true,
      alreadySelected: true,
      label: initial.label,
      menuSelector: initial.menuSelector,
      availableLabels: initial.availableLabels,
    };
  }

  const selected = await selectNestedMenuPath(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    steps: options.steps,
    timeoutMs: options.timeoutMs,
    closeMenuAfter: options.closeMenusAfter,
  });
  if (!selected.ok) {
    return {
      ok: false,
      phase: 'select',
      reason: selected.reason,
      failedStep: selected.failedStep,
    };
  }

  const verified = await inspectNestedMenuPathSelection(Runtime, {
    trigger: options.trigger,
    menuSelector: options.menuSelector,
    steps: options.steps,
    selectedItemMatch: options.selectedItemMatch,
    timeoutMs: options.timeoutMs,
    closeMenusAfter: options.closeMenusAfter,
  });
  if (!verified.ok) {
    return {
      ok: false,
      phase: 'verify',
      reason: verified.reason,
      failedStep: verified.failedStep,
      availableLabels: verified.availableLabels,
    };
  }
  if (!verified.selected) {
    return {
      ok: false,
      phase: 'verify',
      reason: 'Menu option did not stay selected after activation',
      menuSelector: verified.menuSelector,
      availableLabels: verified.availableLabels,
    };
  }
  return {
    ok: true,
    alreadySelected: false,
    label: verified.label,
    menuSelector: verified.menuSelector,
    availableLabels: verified.availableLabels,
  };
}

export async function setInputValue(
  Runtime: ChromeClient['Runtime'],
  options: SetInputValueOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (options.selector) {
    const ready = await waitForSelector(Runtime, options.selector, timeoutMs);
    if (!ready) return false;
  }
  const result = await Runtime.evaluate({
    expression: `(() => {
      const selector = ${JSON.stringify(options.selector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const requireVisible = ${JSON.stringify(options.requireVisible ?? true)};
      const includeAny = ${JSON.stringify(options.match?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.match?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.match?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.match?.exact ?? [])};
      const value = ${JSON.stringify(options.value)};
      const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matchesLabel = (label) => {
        if (!label) return false;
        if (exact.length && exact.includes(label)) return true;
        if (startsWith.length && startsWith.some((token) => label.startsWith(token))) return true;
        if (includeAll.length && includeAll.every((token) => label.includes(token))) return true;
        if (includeAny.length && includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const candidates = [];
      for (const root of roots) {
        if (!root) continue;
        if (selector) {
          candidates.push(...Array.from(root.querySelectorAll(selector)));
        } else {
          candidates.push(...Array.from(root.querySelectorAll('input, textarea, [contenteditable=\"true\"]')));
        }
      }
      const visibleCandidates = requireVisible ? candidates.filter(isVisible) : candidates;
      let match = null;
      if (selector) {
        match = visibleCandidates[0] || null;
      } else {
        match = visibleCandidates.find((el) => {
          const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
          return matchesLabel(label);
        }) || null;
      }
      if (!match) return { ok: false };
      if (match.tagName === 'INPUT' || match.tagName === 'TEXTAREA') {
        const setter =
          Object.getOwnPropertyDescriptor(match.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(match, value);
        } else {
          match.value = value;
        }
        match.dispatchEvent(new Event('input', { bubbles: true }));
        match.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        match.textContent = value;
        match.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  return Boolean((result.result?.value as { ok?: boolean } | undefined)?.ok);
}

export async function submitInlineRename(
  Runtime: ChromeClient['Runtime'],
  options: SubmitInlineRenameOptions,
  deps?: { Input?: ChromeClient['Input'] },
): Promise<{ ok: boolean; reason?: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const closeGraceMs = options.closeGraceMs ?? Math.min(750, timeoutMs);
  const submitStrategy =
    options.submitStrategy ?? (deps?.Input ? 'native-then-synthetic' : 'synthetic-enter');
  const entryStrategy = options.entryStrategy ?? 'setter';
  if (options.inputSelector) {
    const ready = await waitForSelector(Runtime, options.inputSelector, timeoutMs);
    if (!ready) return { ok: false, reason: 'Rename input not found' };
  }
  if (options.requireEditable ?? true) {
    const editable = await waitForPredicate(
      Runtime,
      `(() => {
        const selector = ${JSON.stringify(options.inputSelector ?? null)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const includeAny = ${JSON.stringify(options.inputMatch?.includeAny ?? [])};
        const includeAll = ${JSON.stringify(options.inputMatch?.includeAll ?? [])};
        const startsWith = ${JSON.stringify(options.inputMatch?.startsWith ?? [])};
        const exact = ${JSON.stringify(options.inputMatch?.exact ?? [])};
        const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const matchesLabel = (label, match) => {
          if (!label) return false;
          if (match.exact.length && match.exact.includes(label)) return true;
          if (match.startsWith.length && match.startsWith.some((token) => label.startsWith(token))) return true;
          if (match.includeAll.length && match.includeAll.every((token) => label.includes(token))) return true;
          if (match.includeAny.length && match.includeAny.some((token) => label.includes(token))) return true;
          return false;
        };
        const visible = (el) => {
          if (!(el instanceof Element)) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const editable = (el) => {
          if (!(el instanceof Element) || !visible(el)) return false;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return !el.disabled && !el.readOnly;
          }
          return el.getAttribute('contenteditable') === 'true';
        };
        const roots = rootSelectors.length
          ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        let input = null;
        if (selector) {
          input = root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null);
        } else {
          const match = { includeAny, includeAll, startsWith, exact };
          const hasMatch =
            match.includeAny.length || match.includeAll.length || match.startsWith.length || match.exact.length;
          const active = document.activeElement;
          const activeValid = active && editable(active);
          if (activeValid) {
            input = active;
          } else {
            const candidates = Array.from(root.querySelectorAll('input, textarea, [contenteditable="true"]')).filter(editable);
            if (hasMatch) {
              input = candidates.find((el) => {
                const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
                return matchesLabel(label, match);
              }) || null;
            } else {
              input = candidates[0] || null;
            }
          }
        }
        return editable(input) ? { ok: true } : null;
      })()`,
      {
        timeoutMs,
        description: 'inline rename input editable',
      },
    );
    if (!editable.ok) {
      return { ok: false, reason: 'Rename input not editable' };
    }
  }

  const resolveInputExpression = `(() => {
      const selector = ${JSON.stringify(options.inputSelector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const includeAny = ${JSON.stringify(options.inputMatch?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.inputMatch?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.inputMatch?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.inputMatch?.exact ?? [])};
      const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const matchesLabel = (label, match) => {
        if (!label) return false;
        if (match.exact.length && match.exact.includes(label)) return true;
        if (match.startsWith.length && match.startsWith.some((token) => label.startsWith(token))) return true;
        if (match.includeAll.length && match.includeAll.every((token) => label.includes(token))) return true;
        if (match.includeAny.length && match.includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const visible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const editable = (el) => {
        if (!(el instanceof Element) || !visible(el)) return false;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return !el.disabled && !el.readOnly;
        }
        return el.getAttribute('contenteditable') === 'true';
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const root = roots[0] || document;

      let input = null;
      if (selector) {
        input = root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null);
      } else {
        const match = { includeAny, includeAll, startsWith, exact };
        const hasMatch =
          match.includeAny.length || match.includeAll.length || match.startsWith.length || match.exact.length;
        const candidates = Array.from(root.querySelectorAll('input, textarea, [contenteditable="true"]')).filter(visible);
        const active = document.activeElement;
        const activeValid =
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true') &&
          editable(active);
        if (activeValid) {
          input = active;
        } else if (hasMatch) {
          input = candidates.find((el) => {
            const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
            return matchesLabel(label, match);
          }) || null;
        } else {
          input = candidates[0] || null;
        }
      }
      if (!input) return { ok: false, reason: 'Rename input not found' };
      if (!editable(input)) return { ok: false, reason: 'Rename input not editable' };

      const rect = input.getBoundingClientRect();
      return {
        ok: true,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        tag: input.tagName,
      };
    })()`;

  const setValueWithSetter = async () =>
    Runtime.evaluate({
      expression: `(() => {
      const value = ${JSON.stringify(options.value)};
      const selector = ${JSON.stringify(options.inputSelector ?? null)};
      const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
      const includeAny = ${JSON.stringify(options.inputMatch?.includeAny ?? [])};
      const includeAll = ${JSON.stringify(options.inputMatch?.includeAll ?? [])};
      const startsWith = ${JSON.stringify(options.inputMatch?.startsWith ?? [])};
      const exact = ${JSON.stringify(options.inputMatch?.exact ?? [])};
      const saveIncludeAny = ${JSON.stringify(options.saveButtonMatch?.includeAny ?? [])};
      const saveIncludeAll = ${JSON.stringify(options.saveButtonMatch?.includeAll ?? [])};
      const saveStartsWith = ${JSON.stringify(options.saveButtonMatch?.startsWith ?? [])};
      const saveExact = ${JSON.stringify(options.saveButtonMatch?.exact ?? [])};

      const normalize = (v) => String(v || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const matchesLabel = (label, match) => {
        if (!label) return false;
        if (match.exact.length && match.exact.includes(label)) return true;
        if (match.startsWith.length && match.startsWith.some((token) => label.startsWith(token))) return true;
        if (match.includeAll.length && match.includeAll.every((token) => label.includes(token))) return true;
        if (match.includeAny.length && match.includeAny.some((token) => label.includes(token))) return true;
        return false;
      };
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const editable = (el) => {
        if (!(el instanceof Element) || !visible(el)) return false;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return !el.disabled && !el.readOnly;
        }
        return el.getAttribute('contenteditable') === 'true';
      };
      const roots = rootSelectors.length
        ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
        : [document];
      const root = roots[0] || document;

      let input = null;
      if (selector) {
        input = root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null);
      } else {
        const match = { includeAny, includeAll, startsWith, exact };
        const hasMatch =
          match.includeAny.length || match.includeAll.length || match.startsWith.length || match.exact.length;
        const candidates = Array.from(root.querySelectorAll('input, textarea, [contenteditable=\"true\"]')).filter(visible);
        const active = document.activeElement;
        const activeValid =
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true') &&
          editable(active);
        if (activeValid) {
          input = active;
        } else if (hasMatch) {
          input = candidates.find((el) => {
            const label = normalize(el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || el.textContent || '');
            return matchesLabel(label, match);
          }) || null;
        } else {
          input = candidates[0] || null;
        }
      }
      if (!input) return { ok: false, reason: 'Rename input not found' };
      if (!editable(input)) return { ok: false, reason: 'Rename input not editable' };

      input.focus();
      let usedSaveButton = false;
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        const proto = input.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        input.textContent = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const saveMatch = {
        includeAny: saveIncludeAny,
        includeAll: saveIncludeAll,
        startsWith: saveStartsWith,
        exact: saveExact,
      };
      if (saveMatch.includeAny.length || saveMatch.includeAll.length || saveMatch.startsWith.length || saveMatch.exact.length) {
        const saveButtons = Array.from(root.querySelectorAll('button[aria-label], button')).filter(visible);
        const saveBtn = saveButtons.find((btn) => {
          const label = normalize(btn.getAttribute?.('aria-label') || btn.textContent || '');
          return matchesLabel(label, saveMatch);
        }) || null;
        if (saveBtn) {
          saveBtn.click();
          usedSaveButton = true;
        }
      }
      return { ok: true, usedSaveButton };
    })()`,
      returnByValue: true,
    });

  const setValueWithNativeInput = async () => {
    if (!deps?.Input) {
      return { ok: false, reason: 'Native input requested without Input domain' };
    }
    const resolved = await Runtime.evaluate({
      expression: resolveInputExpression,
      returnByValue: true,
    });
    const info = resolved.result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; tag: string }
      | { ok: false; reason?: string }
      | undefined;
    if (!info?.ok) {
      return { ok: false, reason: info?.reason || 'Rename input not found' };
    }
    const x = info.rect.x + Math.min(24, Math.max(8, info.rect.width / 4));
    const y = info.rect.y + info.rect.height / 2;
    await deps.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y, button: 'none' });
    await deps.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await deps.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    const selected = await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.inputSelector ?? null)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const input = selector
          ? root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null)
          : document.activeElement;
        if (!(input instanceof HTMLElement)) {
          return { ok: false, reason: 'Rename input not found for native typing' };
        }
        input.focus();
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.select();
          return { ok: true };
        }
        if (input.getAttribute('contenteditable') === 'true') {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          selection?.removeAllRanges();
          selection?.addRange(range);
          return { ok: true };
        }
        return { ok: false, reason: 'Rename input not editable for native typing' };
      })()`,
      returnByValue: true,
    });
    const selectedInfo = selected.result?.value as { ok: boolean; reason?: string } | undefined;
    if (!selectedInfo?.ok) {
      return { ok: false, reason: selectedInfo?.reason || 'Rename input not focusable for native typing' };
    }
    await deps.Input.dispatchKeyEvent({
      type: 'rawKeyDown',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await deps.Input.dispatchKeyEvent({
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await deps.Input.insertText({ text: options.value });
    return { ok: true, usedSaveButton: false };
  };

  const result =
    entryStrategy === 'native-input' ? await setValueWithNativeInput() : await setValueWithSetter();

  const info =
    'result' in result
      ? (result.result?.value as { ok: boolean; reason?: string; usedSaveButton?: boolean } | undefined)
      : (result as { ok: boolean; reason?: string; usedSaveButton?: boolean } | undefined);
  if (!info?.ok) {
    return { ok: false, reason: info?.reason || 'Rename submit failed' };
  }

  const waitForClose = async (ms: number) => {
    if (!options.closeSelector) return true;
    return waitForNotSelector(Runtime, options.closeSelector, ms);
  };

  if (info.usedSaveButton) {
    const closed = await waitForClose(closeGraceMs);
    if (closed) {
      return { ok: true };
    }
  }

  const dispatchSyntheticEnter = async () => {
    await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.inputSelector ?? null)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const input = selector
          ? root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null)
          : document.activeElement;
        if (!(input instanceof Element)) {
          return { ok: false, reason: 'Rename input not found for submit' };
        }
        input.focus?.();
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
        );
        input.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
        );
        return { ok: true };
      })()`,
      returnByValue: true,
    });
  };

  const dispatchNativeEnter = async () => {
    if (!deps?.Input) return false;
    await deps.Input.dispatchKeyEvent({
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: '\r',
      unmodifiedText: '\r',
    });
    await deps.Input.dispatchKeyEvent({
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    return true;
  };

  const dispatchBlurBodyClick = async () => {
    await Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(options.inputSelector ?? null)};
        const rootSelectors = ${JSON.stringify(options.rootSelectors ?? [])};
        const roots = rootSelectors.length
          ? rootSelectors.map((sel) => document.querySelector(sel)).filter(Boolean)
          : [document];
        const root = roots[0] || document;
        const input = selector
          ? root.querySelector(selector) || (root !== document ? document.querySelector(selector) : null)
          : document.activeElement;
        if (!(input instanceof HTMLElement)) {
          return { ok: false, reason: 'Rename input not found for blur submit' };
        }
        input.blur();
        document.body.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    });
  };

  if (submitStrategy === 'native-enter' || submitStrategy === 'native-then-synthetic') {
    const nativeSent = await dispatchNativeEnter();
    if (nativeSent) {
      const closed = await waitForClose(closeGraceMs);
      if (closed) {
        return { ok: true };
      }
      if (submitStrategy === 'native-enter') {
        return { ok: false, reason: 'Rename input did not close after native Enter' };
      }
    }
  }

  if (submitStrategy === 'synthetic-enter' || submitStrategy === 'native-then-synthetic') {
    await dispatchSyntheticEnter();
  }

  if (submitStrategy === 'blur-body-click') {
    await dispatchBlurBodyClick();
  }

  if (options.closeSelector) {
    const closed = await waitForNotSelector(Runtime, options.closeSelector, timeoutMs);
    if (!closed) {
      return { ok: false, reason: 'Rename input did not close' };
    }
  }
  return { ok: true };
}

export async function togglePanel(
  Runtime: ChromeClient['Runtime'],
  options: TogglePanelOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const isOpen = await waitForSelector(Runtime, options.isOpenSelector, 250);
  if (options.open && isOpen) return true;
  if (!options.open && !isOpen) return true;
  const pressed = await pressButton(Runtime, options.trigger);
  if (!pressed.ok) return false;
  if (options.open) {
    return waitForSelector(Runtime, options.isOpenSelector, timeoutMs);
  }
  return waitForNotSelector(Runtime, options.isOpenSelector, timeoutMs);
}
