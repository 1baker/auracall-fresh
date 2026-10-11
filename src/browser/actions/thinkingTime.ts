import type { ChromeClient, BrowserLogger } from '../types.js';
import type { ThinkingTimeLevel } from '../../oracle/types.js';
import type { ProviderUserIdentity } from '../providers/types.js';
import { MENU_CONTAINER_SELECTOR, MENU_ITEM_SELECTOR } from '../constants.js';
import { logDomFailure } from '../domDebug.js';
import { buildClickDispatcher } from './domEvents.js';
import { BrowserAutomationError } from '../../oracle/errors.js';

export type ChatgptProMode = 'standard' | 'extended';

export type ChatgptProModeGate = {
  allowed: boolean;
  proMode: ChatgptProMode;
  accountLevel?: string | null;
  accountPlanType?: string | null;
  accountStructure?: string | null;
  reason?: 'account-unverified' | 'requires-pro-account';
};

type ThinkingTimeOutcome =
  | { status: 'already-selected'; label?: string | null }
  | { status: 'switched'; label?: string | null }
  | { status: 'option-disabled'; label?: string | null; notice?: string | null }
  | { status: 'chip-not-found' }
  | { status: 'menu-not-found' }
  | { status: 'option-not-found' };

const THINKING_TIME_EVALUATE_TIMEOUT_MS = 25_000;

const CHATGPT_POWER_SLIDER_TARGETS = {
  light: { value: 0, label: 'Instant' },
  standard: { value: 1, label: 'Medium' },
  extended: { value: 2, label: 'High' },
  heavy: { value: 3, label: 'Extra High' },
  pro: { value: 4, label: 'Pro' },
} satisfies Record<ThinkingTimeLevel | 'pro', { value: number; label: string }>;

export class ThinkingTierUnavailableError extends BrowserAutomationError {
  readonly requestedLevel: ThinkingTimeLevel | 'pro';
  readonly optionLabel: string | null;
  readonly notice: string | null;

  constructor(level: ThinkingTimeLevel | 'pro', optionLabel: string | null, notice: string | null) {
    const requestedLabel = level.charAt(0).toUpperCase() + level.slice(1);
    super(
      `Thinking time: ${optionLabel ?? requestedLabel} is unavailable on this account (${notice ?? 'no reason given'}); refusing to submit without confirmed ${requestedLabel}.`,
      {
        stage: 'thinking-tier-unavailable',
        requestedLevel: level,
        optionLabel,
        notice,
      },
    );
    this.name = 'ThinkingTierUnavailableError';
    this.requestedLevel = level;
    this.optionLabel = optionLabel;
    this.notice = notice;
  }
}

/**
 * Selects a specific thinking time level in ChatGPT's composer pill menu.
 * @param level - The thinking time intensity: 'light', 'standard', 'extended', or 'heavy'
 */
export async function ensureThinkingTime(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel | 'pro',
  logger: BrowserLogger,
): Promise<boolean> {
  const result = await evaluateThinkingTimeSelection(Runtime, level);
  const capitalizedLevel = level.charAt(0).toUpperCase() + level.slice(1);

  switch (result?.status) {
    case 'already-selected':
      logger(`Thinking time: ${result.label ?? capitalizedLevel} (already selected)`);
      return true;
    case 'switched':
      logger(`Thinking time: ${result.label ?? capitalizedLevel}`);
      return true;
    case 'option-disabled':
      await logDomFailure(Runtime, logger, 'thinking-option-disabled');
      throw new ThinkingTierUnavailableError(
        level,
        result.label ?? null,
        result.notice ?? null,
      );
    case 'chip-not-found': {
      if (level === 'light') {
        logger(
          'Thinking time: no separate effort control; using the provider default for Instant intent.',
        );
        return false;
      }
      await logDomFailure(Runtime, logger, 'thinking-chip');
      throw new Error('Unable to find the Thinking chip button in the composer area.');
    }
    case 'menu-not-found': {
      await logDomFailure(Runtime, logger, 'thinking-time-menu');
      throw new Error('Unable to find the Thinking time dropdown menu.');
    }
    case 'option-not-found': {
      await logDomFailure(Runtime, logger, `${level}-option`);
      throw new Error(`Unable to find the ${capitalizedLevel} option in the Thinking time menu.`);
    }
    default: {
      await logDomFailure(Runtime, logger, 'thinking-time-unknown');
      throw new Error(`Unknown error selecting ${capitalizedLevel} thinking time.`);
    }
  }
}

/**
 * Compatibility wrapper for callers that previously requested best-effort selection.
 * Only the default/Instant intent may proceed when no separate effort control exists;
 * explicit higher effort and ambiguous selector surfaces remain fail-closed.
 */
export async function ensureThinkingTimeIfAvailable(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel | 'pro',
  logger: BrowserLogger,
): Promise<boolean> {
  return ensureThinkingTime(Runtime, level, logger);
}

async function evaluateThinkingTimeSelection(
  Runtime: ChromeClient['Runtime'],
  level: ThinkingTimeLevel | 'pro',
): Promise<ThinkingTimeOutcome | undefined> {
  const outcome = await withStageTimeout(
    Runtime.evaluate({
      expression: buildThinkingTimeExpression(level),
      awaitPromise: true,
      returnByValue: true,
    }),
    THINKING_TIME_EVALUATE_TIMEOUT_MS,
    `Timed out waiting for ChatGPT thinking-time selector after ${Math.round(THINKING_TIME_EVALUATE_TIMEOUT_MS / 1000)}s.`,
  );

  return outcome.result?.value as ThinkingTimeOutcome | undefined;
}

function withStageTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([task, timer]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function buildThinkingTimeExpression(level: ThinkingTimeLevel | 'pro'): string {
  const menuContainerLiteral = JSON.stringify(MENU_CONTAINER_SELECTOR);
  const menuItemLiteral = JSON.stringify(MENU_ITEM_SELECTOR);
  const targetLevelsLiteral = JSON.stringify(resolveThinkingTimeCandidates(level));
  const sliderTarget = resolveChatgptPowerSliderTarget(level);
  const sliderTargetValueLiteral = JSON.stringify(sliderTarget.value);
  const sliderTargetLabelLiteral = JSON.stringify(sliderTarget.label);

  return `(async () => {
    ${buildClickDispatcher()}

    const MENU_CONTAINER_SELECTOR = ${menuContainerLiteral};
    const MENU_ITEM_SELECTOR = ${menuItemLiteral};
    const THINKING_MENU_CONTAINER_SELECTOR = [
      MENU_CONTAINER_SELECTOR,
      '[role="listbox"]',
      '[data-radix-select-viewport]',
    ].join(', ');
    const THINKING_MENU_ITEM_SELECTOR = [
      MENU_ITEM_SELECTOR,
      '[role="option"]',
      '[data-radix-select-item]',
    ].join(', ');
    const TARGET_LEVELS = ${targetLevelsLiteral};
    const TARGET_SLIDER_VALUE = ${sliderTargetValueLiteral};
    const TARGET_SLIDER_LABEL = ${sliderTargetLabelLiteral};

    const CHIP_SELECTORS = [
      '[data-testid="composer-footer-actions"] button[aria-haspopup="menu"]',
      'button.__composer-pill[aria-haspopup="menu"]',
      'button[aria-label="Select ChatGPT model"]',
      '.__composer-pill-composite button[aria-haspopup="menu"]',
    ];

    const INITIAL_WAIT_MS = 150;
    const REOPEN_INTERVAL_MS = 400;
    const MAX_WAIT_MS = 10000;

    const normalize = (value) => (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const findSelectedLevelPill = () => {
      const candidates = document.querySelectorAll(
        'button.__composer-pill, .__composer-pill-composite button, [data-testid="composer-footer-actions"] button'
      );
      for (const candidate of candidates) {
        if (!visible(candidate)) continue;
        const text = normalize([candidate.textContent ?? '', candidate.getAttribute?.('aria-label') ?? ''].join(' '));
        if (TARGET_LEVELS.some((target) => text.includes(target))) {
          return candidate;
        }
      }
      return null;
    };

    const findThinkingChip = () => {
      for (const selector of CHIP_SELECTORS) {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          // Skip toggle buttons (no haspopup) - only click dropdown triggers to avoid disabling Pro mode
          if (btn.getAttribute?.('aria-haspopup') !== 'menu') continue;
          const aria = normalize(btn.getAttribute?.('aria-label') ?? '');
          const text = normalize(btn.textContent ?? '');
          if (aria === 'select chatgpt model' || aria.includes('thinking') || text.includes('thinking')) {
            return btn;
          }

          // In some cases the pill is labeled "Pro".
          if (aria.includes('pro') || text.includes('pro')) {
            return btn;
          }

          // GPT-5.6 Sol surfaces can label the same control by reasoning level.
          if (
            aria.includes('sol') ||
            aria.includes('light') ||
            aria.includes('medium') ||
            aria.includes('high') ||
            aria.includes('extra high') ||
            text.includes('sol') ||
            text.includes('light') ||
            text.includes('medium') ||
            text.includes('high') ||
            text.includes('extra high')
          ) {
            return btn;
          }
        }
      }
      return null;
    };

    const selectedLevelPill = findSelectedLevelPill();
    if (selectedLevelPill) {
      return { status: 'already-selected', label: selectedLevelPill.textContent?.trim?.() || null };
    }

    const chip = findThinkingChip();
    if (!chip) {
      return { status: 'chip-not-found' };
    }
    const chipLabel = [chip.textContent ?? '', chip.getAttribute?.('aria-label') ?? '']
      .map(normalize)
      .filter(Boolean)
      .join(' ');
    if (TARGET_LEVELS.some((target) => chipLabel.includes(target))) {
      return { status: 'already-selected', label: chip.textContent?.trim?.() || null };
    }

    dispatchClickSequence(chip);

    return new Promise((resolve) => {
      const start = performance.now();
      let lastOpenAttemptAt = performance.now();
      let configureOpened = false;
      let depthComboOpened = false;
      let advancedOpened = false;
      let effortOpened = false;

      const findMenu = () => {
        const modernPicker = document.querySelector('[data-model-picker-view="simple"]');
        if (visible(modernPicker)) return modernPicker;
        const intelligencePicker = document.querySelector('[data-testid="composer-intelligence-picker-content"]');
        if (visible(intelligencePicker)) {
          return intelligencePicker;
        }
        const menus = document.querySelectorAll(THINKING_MENU_CONTAINER_SELECTOR + ', [role="group"]');
        for (const menu of menus) {
          const label = menu.querySelector?.('.__menu-label, [class*="menu-label"]');
          if (normalize(label?.textContent ?? '').includes('thinking time')) {
            return menu;
          }
          const text = normalize(menu.textContent ?? '');
          if (text.includes('standard') && text.includes('extended')) {
            return menu;
          }
          if (
            text.includes('intelligence') &&
            (text.includes('pro extended') || text.includes('extra high') || text.includes('medium'))
          ) {
            return menu;
          }
          if (text.includes('instant') && text.includes('medium') && text.includes('high')) {
            return menu;
          }
          if (
            text.includes('light') &&
            text.includes('medium') &&
            text.includes('high') &&
            text.includes('extra high')
          ) {
            return menu;
          }
        }
        return null;
      };

      const findConfigureNode = () => Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR + ', button'))
        .filter(visible)
        .find((node) => {
          const text = normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' '));
          return text === 'configure' || text.startsWith('configure ');
        });

      const findAdvancedNode = () => Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR))
        .filter(visible)
        .find((node) => {
          const text = normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' '));
          return text.startsWith('show advanced options') && node.getAttribute('aria-expanded') !== 'true';
        });

      const findEffortNode = () => Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR))
        .filter(visible)
        .find((node) => {
          const text = normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' '));
          const isEffortTrigger = text.startsWith('effort ') ||
            (text.startsWith('effort') && node.getAttribute('aria-haspopup') === 'menu');
          return isEffortTrigger && node.getAttribute('aria-expanded') !== 'true';
        });

      const findDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], div[aria-modal="true"]'))
        .filter(visible)
        .at(-1);

      const findDepthCombo = (dialog) => Array.from(dialog?.querySelectorAll?.('[role="combobox"], button') ?? [])
        .filter(visible)
        .find((node) => {
          const text = normalize([node.textContent ?? '', node.getAttribute?.('aria-label') ?? ''].join(' '));
          return text.includes('thinking time') ||
            text.includes('effort') ||
            text.includes('mode') ||
            text.includes('standard') ||
            text.includes('extended');
        });

      const findTargetOption = (menu) => {
        const items = menu.querySelectorAll(THINKING_MENU_ITEM_SELECTOR);
        const scored = [];
        for (const item of items) {
          const text = normalize(item.textContent ?? '');
          for (const [targetIndex, target] of TARGET_LEVELS.entries()) {
            if (text === target) {
              scored.push({ item, score: 1000 - targetIndex });
            } else if (text.includes(target)) {
              scored.push({ item, score: 500 - targetIndex });
            }
          }
        }
        scored.sort((left, right) => right.score - left.score);
        return scored[0]?.item ?? null;
      };

      const optionIsSelected = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const ariaChecked = node.getAttribute('aria-checked');
        const dataState = (node.getAttribute('data-state') || '').toLowerCase();
        if (ariaChecked === 'true') return true;
        if (dataState === 'checked' || dataState === 'selected' || dataState === 'on') return true;
        return false;
      };

      const optionIsDisabled = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const dataDisabled = node.getAttribute('data-disabled');
        return node.getAttribute('aria-disabled') === 'true' ||
          (dataDisabled !== null && dataDisabled.toLowerCase() !== 'false') ||
          (node.getAttribute('data-state') || '').toLowerCase() === 'disabled' ||
          Boolean(node.disabled) ||
          node.getAttribute('disabled') !== null;
      };

      const disabledNotice = (node) => {
        if (!(node instanceof HTMLElement)) return null;
        return node.getAttribute('title') || node.getAttribute('aria-description') || null;
      };

      let attempt;

      const attemptPowerSlider = () => {
        const modern = document.querySelector('[data-model-picker-view="simple"]');
        const modernSlider = modern?.querySelector?.('[role="slider"]');
        const power = modern?.querySelector?.('[data-reasoning-slider="true"]');
        if (visible(modern) && modernSlider instanceof HTMLElement && power instanceof HTMLElement) {
          const maximum = Number(modernSlider.getAttribute('aria-valuemax'));
          let remaining = 5;
          const started = performance.now();
          const verify = () => {
            const value = Number(modernSlider.getAttribute('aria-valuenow'));
            const announcement = modern.querySelector('[role="status"]')?.textContent ?? '';
            if (value === TARGET_SLIDER_VALUE && normalize(announcement) === normalize(TARGET_SLIDER_LABEL) + ' ' + (value + 1) + ' of ' + (maximum + 1)) {
              resolve({ status: value === initialValue ? 'already-selected' : 'switched', label: TARGET_SLIDER_LABEL });
              return;
            }
            if (!Number.isFinite(value) || value === TARGET_SLIDER_VALUE || TARGET_SLIDER_VALUE > maximum || remaining-- <= 0 || performance.now() - started > 1200) {
              resolve({ status: 'option-not-found' });
              return;
            }
            const key = value < TARGET_SLIDER_VALUE ? 'ArrowRight' : 'ArrowLeft';
            for (const type of ['keydown', 'keyup']) power.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
            setTimeout(verify, 100);
          };
          const initialValue = Number(modernSlider.getAttribute('aria-valuenow'));
          verify();
          return true;
        }
        const view = document.querySelector('[data-testid="composer-model-picker-slider-simple-view"]');
        const slider = view?.querySelector?.('[role="slider"]') ?? null;
        if (!(view instanceof HTMLElement) || !(slider instanceof HTMLElement)) return false;
        const currentValue = Number(slider.getAttribute('aria-valuenow'));
        const minimum = Number(slider.getAttribute('aria-valuemin'));
        const maximum = Number(slider.getAttribute('aria-valuemax'));
        if (![currentValue, minimum, maximum].every(Number.isFinite)) return false;
        if (TARGET_SLIDER_VALUE < minimum || TARGET_SLIDER_VALUE > maximum) return false;
        if (currentValue === TARGET_SLIDER_VALUE) {
          resolve({ status: 'already-selected', label: TARGET_SLIDER_LABEL });
          return true;
        }
        const ticks = Array.from(view.querySelectorAll('[class*="_Tick"]')).filter((node) =>
          Array.from(node.classList).some((className) => className.endsWith('_Tick'))
        );
        const targetTick = ticks[TARGET_SLIDER_VALUE - minimum] ?? null;
        if (!(targetTick instanceof HTMLElement)) return false;
        dispatchClickSequence(targetTick);
        const verifyStartedAt = performance.now();
        const verify = () => {
          const selectedValue = Number(slider.getAttribute('aria-valuenow'));
          if (selectedValue === TARGET_SLIDER_VALUE) {
            resolve({ status: 'switched', label: TARGET_SLIDER_LABEL });
            return;
          }
          if (performance.now() - verifyStartedAt > 1200) {
            resolve({ status: 'option-not-found' });
            return;
          }
          setTimeout(verify, 50);
        };
        setTimeout(verify, 50);
        return true;
      };

      const attemptDirectMenu = () => {
        const menu = findMenu();
        if (!menu) {
          if (performance.now() - start > MAX_WAIT_MS) {
            resolve({ status: 'menu-not-found' });
            return;
          }
          if (performance.now() - lastOpenAttemptAt >= REOPEN_INTERVAL_MS) {
            dispatchClickSequence(chip);
            lastOpenAttemptAt = performance.now();
          }
          setTimeout(attempt, 100);
          return;
        }

        if (attemptPowerSlider()) {
          return;
        }

        const targetOption = findTargetOption(menu);
        if (!targetOption) {
          resolve({ status: 'option-not-found' });
          return;
        }

        const label = targetOption.textContent?.trim?.() || null;
        if (optionIsDisabled(targetOption)) {
          resolve({ status: 'option-disabled', label, notice: disabledNotice(targetOption) });
          return;
        }

        const alreadySelected =
          optionIsSelected(targetOption) ||
          optionIsSelected(targetOption.querySelector?.('[aria-checked="true"], [data-state="checked"], [data-state="selected"]'));
        if (alreadySelected) {
          resolve({ status: 'already-selected', label });
          return;
        }
        dispatchClickSequence(targetOption);
        resolve({ status: 'switched', label });
      };

      const attemptViaConfigure = () => {
        const menu = findMenu();
        if (menu) {
          return false;
        }

        const dialog = findDialog();
        if (dialog) {
          const dialogTarget = findTargetOption(dialog);
          if (dialogTarget) {
            const label = dialogTarget.textContent?.trim?.() || null;
            if (optionIsDisabled(dialogTarget)) {
              resolve({ status: 'option-disabled', label, notice: disabledNotice(dialogTarget) });
              return true;
            }
            if (
              optionIsSelected(dialogTarget) ||
              optionIsSelected(dialogTarget.querySelector?.('[aria-checked="true"], [data-state="checked"], [data-state="selected"]'))
            ) {
              resolve({ status: 'already-selected', label });
              return true;
            }
            dispatchClickSequence(dialogTarget);
            resolve({ status: 'switched', label });
            return true;
          }
          if (!depthComboOpened) {
            const depthCombo = findDepthCombo(dialog);
            if (depthCombo) {
              dispatchClickSequence(depthCombo);
              depthComboOpened = true;
              setTimeout(attempt, 150);
              return true;
            }
          }
        }

        if (!advancedOpened) {
          const advancedNode = findAdvancedNode();
          if (advancedNode) {
            dispatchClickSequence(advancedNode);
            advancedOpened = true;
            setTimeout(attempt, 150);
            return true;
          }
        }

        if (!effortOpened) {
          const effortNode = findEffortNode();
          if (effortNode) {
            dispatchClickSequence(effortNode);
            effortOpened = true;
            setTimeout(attempt, 150);
            return true;
          }
        }

        if (!configureOpened) {
          const configureNode = findConfigureNode();
          if (configureNode) {
            dispatchClickSequence(configureNode);
            configureOpened = true;
            setTimeout(attempt, 200);
            return true;
          }
        }
        return false;
      };

      attempt = () => {
        const menu = findMenu();
        if (!menu && attemptViaConfigure()) {
          return;
        }
        attemptDirectMenu();
      };

      setTimeout(attempt, INITIAL_WAIT_MS);
    });
  })()`;
}

export function buildThinkingTimeExpressionForTest(level: ThinkingTimeLevel | 'pro' = 'extended'): string {
  return buildThinkingTimeExpression(level);
}

export function resolveChatgptProModeFromThinkingTime(level: ThinkingTimeLevel | 'pro'): ChatgptProMode {
  return level === 'extended' || level === 'heavy' ? 'extended' : 'standard';
}

export function resolveChatgptPowerSliderTarget(
  level: ThinkingTimeLevel | 'pro',
): { value: number; label: string } {
  return CHATGPT_POWER_SLIDER_TARGETS[level];
}

export function isChatgptProModelTarget(desiredModel: string | null | undefined): boolean {
  if (!desiredModel) return false;
  return /\bpro\b/i.test(desiredModel);
}

export function evaluateChatgptProModeGate(
  level: ThinkingTimeLevel | 'pro',
  identity: ProviderUserIdentity | null | undefined,
): ChatgptProModeGate {
  const proMode = resolveChatgptProModeFromThinkingTime(level);
  const accountLevel = identity?.accountLevel ?? null;
  const accountPlanType = identity?.accountPlanType ?? null;
  const accountStructure = identity?.accountStructure ?? null;
  const normalizedLevel = accountLevel?.trim().toLowerCase();
  const normalizedPlan = accountPlanType?.trim().toLowerCase();
  const isPro = normalizedLevel === 'pro' || normalizedPlan === 'pro';

  if (isPro) {
    return { allowed: true, proMode, accountLevel, accountPlanType, accountStructure };
  }
  return {
    allowed: false,
    proMode,
    accountLevel,
    accountPlanType,
    accountStructure,
    reason: accountLevel || accountPlanType || accountStructure ? 'requires-pro-account' : 'account-unverified',
  };
}

export function formatChatgptProModeGateError(gate: ChatgptProModeGate): string {
  if (gate.reason === 'account-unverified') {
    return `ChatGPT Pro mode "${gate.proMode}" requires a verified Pro account, but AuraCall could not verify the current browser profile account level. Run the ChatGPT identity smoke for this AuraCall runtime profile before using --browser-thinking-time.`;
  }
  const accountSummary = [
    gate.accountLevel ? `level=${gate.accountLevel}` : null,
    gate.accountPlanType ? `plan=${gate.accountPlanType}` : null,
    gate.accountStructure ? `structure=${gate.accountStructure}` : null,
  ].filter(Boolean).join(', ');
  const suffix = accountSummary ? ` Current account: ${accountSummary}.` : '';
  return `ChatGPT Pro mode "${gate.proMode}" requires a Pro account.${suffix} Use a Pro-bound AuraCall runtime profile or omit --browser-thinking-time.`;
}

function resolveThinkingTimeCandidates(level: ThinkingTimeLevel | 'pro'): string[] {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case 'pro':
      return ['pro'];
    case 'light':
      return ['light', 'standard', 'instant'];
    case 'heavy':
      return ['heavy', 'extra high', 'pro extended', 'extended'];
    case 'standard':
      return ['standard', 'medium'];
    default:
      return ['pro extended', 'extended', 'high'];
  }
}
