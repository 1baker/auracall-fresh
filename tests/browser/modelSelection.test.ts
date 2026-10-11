import { describe, expect, it, vi } from 'vitest';
import {
  buildModelMatchersLiteralForTest,
  ensureModelSelection,
  shouldApplyChatgptThinkingTime,
  buildModelSelectionExpressionForTest,
  chooseModelPickerNavigationActionForTest,
  scoreModelPickerOptionForTest,
  isModelPickerTriggerCandidateForTest,
} from '../../src/browser/actions/modelSelection.js';

const expectContains = (arr: string[], value: string) => {
  expect(arr).toContain(value);
};

describe('browser model selection matchers', () => {
  it('targets the current ChatGPT model picker button', () => {
    const expression = buildModelSelectionExpressionForTest('gpt-5.2-pro');
    expect(expression).toContain('[data-testid=\\"model-switcher-dropdown-button\\"]');
    expect(expression).toContain('button.__composer-pill');
		expect(expression).toContain('button[aria-label=\\"Select ChatGPT model\\"]');
    expect(expression).not.toContain('button[aria-label=\\"Switch model\\"]');
    expect(expression).toContain(`closest('form, [data-testid*="composer"]')`);
    expect(expression).toContain(`closest('[data-testid^="conversation-turn"]')`);
    expect(expression).toContain('button[aria-label*=\\"Model\\"]');
  });

  it('admits the current animated 6 Pro model trigger without admitting Power controls', () => {
    expect(isModelPickerTriggerCandidateForTest({
      selector: '[data-animated-slider-trigger="true"]',
      text: '6 Pro',
      ariaLabel: '6 Pro, Pro, 5 of 5',
      visible: true,
      inComposer: true,
      inAssistantTurn: false,
    })).toBe(true);
    expect(isModelPickerTriggerCandidateForTest({
      selector: '[data-animated-slider-trigger="true"]',
      text: '6Pro',
      ariaLabel: '6Pro, Pro, 5 of 5',
      visible: true,
      inComposer: true,
      inAssistantTurn: false,
    })).toBe(true);
    for (const label of ['Power', '6Power', 'High, 3 of 5', 'Pro, 5 of 5']) {
      expect(isModelPickerTriggerCandidateForTest({
        selector: '[data-animated-slider-trigger="true"]',
        text: label,
        ariaLabel: label,
        visible: true,
        inComposer: true,
        inAssistantTurn: false,
      })).toBe(false);
    }
    expect(isModelPickerTriggerCandidateForTest({
      selector: '[data-animated-slider-trigger="true"]',
      text: '6 Pro',
      ariaLabel: '6 Pro, Pro, 5 of 5',
      visible: false,
      inComposer: true,
      inAssistantTurn: false,
    })).toBe(false);
  });

  it.each([
    { desiredModel: '6 Pro', selectedLabel: '6 Pro' },
    { desiredModel: 'GPT-6', selectedLabel: 'GPT-6' },
    { desiredModel: 'gpt-5.6-sol', selectedLabel: 'Latest' },
  ])('opens the model trigger and reads the checked $selectedLabel current model', async ({
    desiredModel,
    selectedLabel,
  }) => {
		vi.useFakeTimers();
    class FixtureElement extends EventTarget {
      textContent: string;
      children: FixtureElement[] = [];
      classList = { contains: () => false };
      attributes = new Map<string, string>();
      closestHandler: (selector: string) => FixtureElement | null = () => null;
      queryAllHandler: (selector: string) => FixtureElement[] = () => [];

      constructor(text = '', attributes: Record<string, string> = {}) {
        super();
        this.textContent = text;
        for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
      }

      getAttribute(name: string) { return this.attributes.get(name) ?? null; }
      hasAttribute(name: string) { return this.attributes.has(name); }
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
      closest(selector: string) { return this.closestHandler(selector); }
      querySelectorAll(selector: string) { return this.queryAllHandler(selector); }
      querySelector() { return null; }
    }

    const prompt = new FixtureElement();
    const composer = new FixtureElement();
    const trigger = new FixtureElement('6Pro', {
      'aria-label': '6Pro, Pro, 5 of 5',
      'data-animated-slider-trigger': 'true',
    });
    const selected = new FixtureElement(selectedLabel, {
      'aria-checked': 'true',
      role: 'menuitemradio',
    });
    const menu = new FixtureElement();
    let menuOpen = false;
    prompt.closestHandler = () => composer;
    composer.queryAllHandler = (selector) => selector.includes('data-animated-slider-trigger') ? [trigger] : [];
    menu.queryAllHandler = () => [selected];
    let triggerClicks = 0;
    trigger.addEventListener('click', () => {
      triggerClicks += 1;
      menuOpen = !menuOpen;
    });

    vi.stubGlobal('Element', FixtureElement);
    vi.stubGlobal('HTMLElement', FixtureElement);
    vi.stubGlobal('MouseEvent', Event);
    vi.stubGlobal('KeyboardEvent', Event);
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    });
    vi.stubGlobal('document', {
      activeElement: menu,
      body: menu,
      querySelector: (selector: string) => selector.includes('#prompt-textarea') ? prompt : menuOpen ? menu : null,
      querySelectorAll: (selector: string) => selector.includes('[role="menu"]') && menuOpen ? [menu] : [],
    });

    try {
			const pending = new Function(
        `return ${buildModelSelectionExpressionForTest(desiredModel, 'current')}`,
      )();
			await vi.advanceTimersByTimeAsync(25_000);
      const result = await pending;
      expect(result).toEqual({ status: 'already-selected', label: selectedLabel });
      expect(triggerClicks).toBe(2);
      expect(menuOpen).toBe(false);
    } finally {
			vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('settles explicit select after clicking the current unmarked 6 Pro row', async () => {
    vi.useFakeTimers();
    class FixtureElement extends EventTarget {
      textContent: string;
      children: FixtureElement[] = [];
      classList = { contains: () => false };
      attributes = new Map<string, string>();
      closestHandler: (selector: string) => FixtureElement | null = () => null;
      queryAllHandler: (selector: string) => FixtureElement[] = () => [];

      constructor(text = '', attributes: Record<string, string> = {}) {
        super();
        this.textContent = text;
        for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
      }

      getAttribute(name: string) { return this.attributes.get(name) ?? null; }
      hasAttribute(name: string) { return this.attributes.has(name); }
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
      closest(selector: string) { return this.closestHandler(selector); }
      querySelectorAll(selector: string) { return this.queryAllHandler(selector); }
      querySelector() { return null; }
    }

    const prompt = new FixtureElement();
    const composer = new FixtureElement();
    const trigger = new FixtureElement('6Pro', {
      'aria-label': '6Pro, Pro, 5 of 5',
      'data-animated-slider-trigger': 'true',
    });
    const option = new FixtureElement('6Pro', {
      role: 'menuitem',
      'aria-expanded': 'false',
    });
    const menu = new FixtureElement();
    let menuOpen = false;
    let optionClicks = 0;
    prompt.closestHandler = () => composer;
    composer.queryAllHandler = (selector) => selector.includes('data-animated-slider-trigger') ? [trigger] : [];
    menu.queryAllHandler = () => [option];
    trigger.addEventListener('click', () => { menuOpen = true; });
    option.addEventListener('click', () => {
      optionClicks += 1;
      menuOpen = false;
    });

    vi.stubGlobal('Element', FixtureElement);
    vi.stubGlobal('HTMLElement', FixtureElement);
    vi.stubGlobal('MouseEvent', Event);
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    });
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector.includes('#prompt-textarea')) return prompt;
        if (selector.includes('[role="menu"]')) return menuOpen ? menu : null;
        return null;
      },
      querySelectorAll: (selector: string) =>
        selector.includes('[role="menu"]') && menuOpen ? [menu] : [],
    });

    try {
      const pending = new Function(
        `return ${buildModelSelectionExpressionForTest('6 Pro', 'select')}`,
      )();
      await vi.advanceTimersByTimeAsync(25_000);
      await expect(pending).resolves.toEqual({ status: 'switched-best-effort', label: '6Pro' });
      expect(optionClicks).toBe(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('waits for the current model picker to mount before failing closed', () => {
    const expression = buildModelSelectionExpressionForTest('Pro');
    expect(expression).toContain('const BUTTON_WAIT_MS = 12000');
    expect(expression).toContain(
      'while (!button && performance.now() - buttonWaitStartedAt <= BUTTON_WAIT_MS)',
    );
    expect(expression).toContain(
      'await new Promise((resolve) => setTimeout(resolve, REOPEN_INTERVAL_MS / 2))',
    );
  });

  it('includes rich tokens for gpt-5.1 base selection', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.1');
    expect(semanticTarget).toBe('instant');
    expectContains(labelTokens, 'gpt-5.1');
    expectContains(labelTokens, 'gpt-5-1');
    expectContains(labelTokens, 'gpt51');
    expectContains(labelTokens, 'chatgpt 5.1');
    expectContains(labelTokens, 'instant');
    expectContains(testIdTokens, 'gpt-5-1');
    expectContains(testIdTokens, 'model-switcher-gpt-5-3');
    expect(
      testIdTokens.some(
        (t) => t.includes('gpt-5.1') || t.includes('gpt-5-1') || t.includes('gpt51'),
      ),
    ).toBe(true);
  });

  it('includes pro/research tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(semanticTarget).toBe('pro');
    expect(labelTokens.some((t) => t.includes('pro') || t.includes('research'))).toBe(true);
    expectContains(labelTokens, 'extended pro');
    expectContains(labelTokens, 'pro extended');
    expectContains(testIdTokens, 'pro');
    expectContains(testIdTokens, 'model-switcher-pro');
    expectContains(testIdTokens, 'model-switcher-gpt-5-4-pro');
  });

  it('includes pro + 5.2 tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens } = buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(labelTokens.some((t) => t.includes('pro'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens.some((t) => t.includes('gpt-5.2-pro') || t.includes('gpt-5-2-pro'))).toBe(
      true,
    );
  });

  it('includes thinking tokens for gpt-5.2-thinking', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-thinking');
    expect(semanticTarget).toBe('thinking');
    expect(labelTokens.some((t) => t.includes('thinking'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-4-thinking');
    expect(testIdTokens).toContain('gpt-5.2-thinking');
  });

  it('includes Sol family tokens for gpt-5.6-sol', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.6-sol');
    expect(semanticTarget).toBe('sol');
    expect(labelTokens).toContain('gpt-5.6-sol');
    expect(testIdTokens).toContain('gpt-5-6-sol');
  });

  it.each([
    ['Latest', 'instant'],
    ['GPT-5.6 Sol', 'sol'],
    ['GPT-5.6 Terra', 'terra'],
    ['GPT-5.6 Luna', 'luna'],
    ['GPT-5.5', 'legacy'],
  ] as const)('classifies the current %s model-family row', (label, kind) => {
    const scored = scoreModelPickerOptionForTest(label, { text: label });
    expect(scored.optionKind).toBe(kind);
    expect(scored.score).toBeGreaterThan(0);
  });

  it('rejects a different GPT-5.6 family even though the version token matches', () => {
    expect(scoreModelPickerOptionForTest('GPT-5.6 Terra', { text: 'GPT-5.6 Sol' }).score).toBe(0);
    expect(scoreModelPickerOptionForTest('GPT-5.6 Luna', { text: 'GPT-5.6 Terra' }).score).toBe(0);
  });

  it('plans the provider-free compact to advanced to model submenu path', () => {
    expect(
      chooseModelPickerNavigationActionForTest([
        {
          text: 'Advanced',
          ariaLabel: 'Show advanced options',
          role: 'menuitem',
          expanded: 'false',
        },
      ]),
    ).toEqual({ kind: 'open-advanced', index: 0 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Power', role: 'menuitem', expanded: null },
        { text: 'Show advanced options', role: 'menuitem', expanded: 'false' },
      ]),
    ).toEqual({ kind: 'open-advanced', index: 1 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Show compact options', role: 'menuitem', expanded: 'true' },
        {
          text: 'ModelGPT-5.6 Sol',
          ariaLabel: 'Model GPT-5.6 Sol',
          role: 'menuitem',
          expanded: 'false',
        },
        { text: 'EffortLight', role: 'menuitem', expanded: 'false' },
      ]),
    ).toEqual({ kind: 'open-model', index: 1 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Model GPT-5.6 Sol', role: 'menuitem', expanded: 'true' },
        { text: 'GPT-5.6 Sol', role: 'menuitemradio', expanded: null },
      ]),
    ).toBeNull();
  });

  it('embeds semantic advanced-menu navigation in the browser expression', () => {
    const expression = buildModelSelectionExpressionForTest('GPT-5.6 Terra');
    expect(() => new Function(`return ${expression}`)).not.toThrow();
    expect(expression).toContain('show advanced options');
    expect(expression).toContain("kind: 'open-advanced'");
    expect(expression).toContain("kind: 'open-model'");
    expect(expression).toContain("getAttribute('aria-expanded')");
  });

  it('includes instant tokens for gpt-5.2-instant', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-instant');
    expect(semanticTarget).toBe('instant');
    expect(labelTokens.some((t) => t.includes('instant'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-3');
    expect(testIdTokens).toContain('gpt-5.2-instant');
  });

  it('does not satisfy a Pro request with an Instant row that mentions Pro', () => {
    const instant = scoreModelPickerOptionForTest('Pro', {
      text: 'Instant\nFast everyday answers\nUpgrade to Pro for extended reasoning',
      testId: 'model-switcher-gpt-5-3',
    });
    const extendedPro = scoreModelPickerOptionForTest('Pro', {
      text: 'Extended Pro\nAdvanced reasoning',
      testId: 'model-switcher-pro',
    });
    expect(instant.optionKind).toBe('instant');
    expect(instant.score).toBe(0);
    expect(extendedPro.optionKind).toBe('pro');
    expect(extendedPro.score).toBeGreaterThan(0);
  });

  it('recognizes updated Pro label variants without falling back to Instant', () => {
    expect(scoreModelPickerOptionForTest('Pro', { text: 'Pro Extended' }).optionKind).toBe('pro');
    expect(scoreModelPickerOptionForTest('Pro', { text: 'ChatGPT Pro' }).optionKind).toBe('pro');
    expect(scoreModelPickerOptionForTest('Pro', { text: 'Instant' }).score).toBe(0);
  });

  it('keeps effort labels separate from GPT-5.6 Sol model-family options', () => {
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Medium' }).optionKind).toBe(
      'thinking',
    );
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'High' }).score).toBe(0);
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Extra High' }).score).toBe(0);
    expect(
      scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'GPT-5.6 Sol' }).score,
    ).toBeGreaterThan(0);
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Pro' }).score).toBe(0);
  });
});


it('resolves premium through GPT-6 then Pro Power and protects the combined choice', async () => {
  const evaluate = vi.fn()
    .mockResolvedValueOnce({ result: { value: { status: 'option-not-found', hint: { availableOptions: ['Medium', 'GPT-6', 'GPT-5.6 Sol'] } } } })
    .mockResolvedValueOnce({ result: { value: { status: 'already-selected', label: 'GPT-6' } } })
    .mockResolvedValueOnce({ result: { value: { status: 'switched', label: 'Pro' } } });
  const selected = await ensureModelSelection({ evaluate } as never, '6 Pro', () => {}, 'select');
  expect(selected).toBe('GPT-6 Pro');
  expect(evaluate).toHaveBeenCalledTimes(3);
  expect(shouldApplyChatgptThinkingTime('6 Pro', selected)).toBe(false);
  expect(shouldApplyChatgptThinkingTime('GPT-5.6 Sol', 'GPT-5.6 Sol')).toBe(true);
});

it('preserves the current model without selecting premium Power', async () => {
  const evaluate = vi.fn().mockResolvedValue({ result: { value: { status: 'already-selected', label: 'GPT-6' } } });
  await expect(ensureModelSelection({ evaluate } as never, '6 Pro', () => {}, 'current')).resolves.toBe('GPT-6');
  expect(evaluate).toHaveBeenCalledTimes(1);
});
