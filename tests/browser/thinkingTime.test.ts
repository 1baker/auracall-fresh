import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ThinkingTierUnavailableError,
  buildThinkingTimeExpressionForTest,
  ensureThinkingTime,
  ensureThinkingTimeIfAvailable,
  evaluateChatgptProModeGate,
  formatChatgptProModeGateError,
  isChatgptProModelTarget,
  resolveChatgptPowerSliderTarget,
  resolveChatgptProModeFromThinkingTime,
} from '../../src/browser/actions/thinkingTime.js';

class FixtureElement extends EventTarget {
  textContent: string;
  private readonly attributes = new Map<string, string>();
  onClick?: () => void;
  queryAll: (selector: string) => FixtureElement[] = () => [];

  constructor(text: string, attributes: Record<string, string> = {}) {
    super();
    this.textContent = text;
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 30 };
  }

  querySelector(selector: string): FixtureElement | null {
    return this.queryAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FixtureElement[] {
    return this.queryAll(selector);
  }

  override dispatchEvent(event: Event): boolean {
    if (event.type === 'click') this.onClick?.();
    return super.dispatchEvent(event);
  }
}

class FixtureMouseEvent extends Event {}

function installFixtureDocument(query: (selector: string) => FixtureElement[]): void {
  vi.stubGlobal('Element', FixtureElement);
  vi.stubGlobal('HTMLElement', FixtureElement);
  vi.stubGlobal('MouseEvent', FixtureMouseEvent);
  vi.stubGlobal('PointerEvent', FixtureMouseEvent);
  vi.stubGlobal('window', Object.fromEntries([
    ['PointerEvent', FixtureMouseEvent],
    ['getComputedStyle', () => ({ visibility: 'visible', display: 'block' })],
  ]));
  vi.stubGlobal('document', {
    querySelector: (selector: string) => query(selector)[0] ?? null,
    querySelectorAll: query,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser thinking-time selection expression', () => {
  it('uses centralized menu selectors and normalized matching', () => {
    const expression = buildThinkingTimeExpressionForTest();
    expect(expression).toContain('const MENU_CONTAINER_SELECTOR');
    expect(expression).toContain('const MENU_ITEM_SELECTOR');
    expect(expression).toContain('role=\\"menu\\"');
    expect(expression).toContain('data-radix-collection-root');
    expect(expression).toContain('role=\\"menuitem\\"');
    expect(expression).toContain('role=\\"menuitemradio\\"');
    expect(expression).toContain('thinking time');
    expect(expression).toContain('intelligence');
    expect(expression).toContain('configure');
    expect(expression).toContain('[role="dialog"]');
    expect(expression).toContain('[role="combobox"]');
    expect(expression).toContain('[role="listbox"]');
    expect(expression).toContain('[role="option"]');
    expect(expression).toContain('[data-radix-select-viewport]');
    expect(expression).toContain('[data-radix-select-item]');
    expect(expression).toContain('normalize');
    expect(expression).toContain('extended');
    expect(expression).toContain('pro extended');
    expect(expression).toContain('extra high');
    expect(expression).toContain('medium');
    expect(expression).toContain('findSelectedLevelPill');
    expect(expression).toContain('button.__composer-pill, .__composer-pill-composite button');
    expect(expression).toContain('show advanced options');
    expect(expression).toContain("text.startsWith('effort ')");
    expect(expression).toContain("getAttribute('aria-expanded')");
    expect(expression).toContain('clientX');
    expect(expression).toContain('clientY');
    expect(expression).toContain('composer-model-picker-slider-simple-view');
    expect(expression).toContain('composer-intelligence-picker-content');
    expect(expression).toContain('TARGET_SLIDER_VALUE');
    expect(expression).toContain("endsWith('_Tick')");
    expect(expression).toContain("getAttribute('aria-valuenow')");
  });

  it('maps AuraCall effort levels onto the live five-position Power slider', () => {
    expect(resolveChatgptPowerSliderTarget('light')).toEqual({ value: 0, label: 'Instant' });
    expect(resolveChatgptPowerSliderTarget('standard')).toEqual({ value: 1, label: 'Medium' });
    expect(resolveChatgptPowerSliderTarget('extended')).toEqual({ value: 2, label: 'High' });
    expect(resolveChatgptPowerSliderTarget('heavy')).toEqual({ value: 3, label: 'Extra High' });
  });

  it('targets the requested thinking time level', () => {
    const levels = ['light', 'standard', 'extended', 'heavy'] as const;
    for (const level of levels) {
      const expression = buildThinkingTimeExpressionForTest(level);
      expect(() => new Function(`return ${expression}`)).not.toThrow();
      expect(expression).toContain('const TARGET_LEVELS');
      if (level === 'light') {
        expect(expression).toContain('"light","standard","instant"');
      } else if (level === 'heavy') {
        expect(expression).toContain('"heavy","extra high","pro extended","extended"');
      } else if (level === 'standard') {
        expect(expression).toContain('"standard","medium"');
      } else {
        expect(expression).toContain('"pro extended","extended","high"');
      }
    }
  });

  it('reports exact control absence for a composer without a Thinking chip', async () => {
    installFixtureDocument(() => []);

    const result = new Function(
      `return ${buildThinkingTimeExpressionForTest('light')}`,
    )() as Promise<unknown>;

    await expect(result).resolves.toEqual({ status: 'chip-not-found' });
  });

  it('opens the exact Configure control on the integrated Pro selector', async () => {
    vi.useFakeTimers();
    const chip = new FixtureElement('Pro • Standard', { 'aria-haspopup': 'menu' });
    const broadMenuItem = new FixtureElement(
      'Latest • 5.5 Instant Thinking • Standard Pro • Standard Configure...',
      { role: 'menuitem' },
    );
    const configure = new FixtureElement('Configure...', { role: 'menuitem' });
    const extended = new FixtureElement('Extended', { role: 'option' });
    const levelMenu = new FixtureElement('Standard Extended', { role: 'listbox' });
    levelMenu.queryAll = (selector) => selector.includes('[role="option"]') ? [extended] : [];

    let modelMenuOpen = false;
    let levelMenuOpen = false;
    chip.onClick = () => {
      modelMenuOpen = true;
    };
    configure.onClick = () => {
      levelMenuOpen = true;
    };

    installFixtureDocument((selector) => {
      if (selector.includes('button.__composer-pill, .__composer-pill-composite button')) return [chip];
      if (
        selector === '[data-testid="composer-footer-actions"] button[aria-haspopup="menu"]' ||
        selector === 'button.__composer-pill[aria-haspopup="menu"]' ||
        selector === '.__composer-pill-composite button[aria-haspopup="menu"]'
      ) return [chip];
      if (selector.includes('[role="dialog"]')) return [];
      if (selector.includes('[role="menu"]') && selector.includes('[role="group"]')) {
        return [
          ...(modelMenuOpen ? [broadMenuItem] : []),
          ...(levelMenuOpen ? [levelMenu] : []),
        ];
      }
      if (selector.includes('[role="menuitem"]') && selector.includes('button')) {
        return modelMenuOpen ? [broadMenuItem, configure] : [];
      }
      if (selector.includes('[role="menuitem"]')) return modelMenuOpen ? [broadMenuItem, configure] : [];
      return [];
    });

    const resultPromise = new Function(
      `return ${buildThinkingTimeExpressionForTest('extended')}`,
    )() as Promise<unknown>;
    await vi.advanceTimersByTimeAsync(11_000);

    await expect(resultPromise).resolves.toEqual({ status: 'switched', label: 'Extended' });
    expect(levelMenuOpen).toBe(true);
  });

  it('opens the current compact EffortPro submenu without requiring Configure', async () => {
    vi.useFakeTimers();
    const chip = new FixtureElement('Pro', { 'aria-haspopup': 'menu' });
    const modelMenu = new FixtureElement(
      'Advanced Faster Smarter Model GPT-5.6 Sol Effort Pro',
      { role: 'menu' },
    );
    const effort = new FixtureElement('EffortPro', {
      role: 'menuitem',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    });
    const extended = new FixtureElement('Extended', { role: 'menuitemradio' });
    const levelMenu = new FixtureElement('Standard Extended', { role: 'menu' });
    levelMenu.queryAll = (selector) => selector.includes('[role="menuitemradio"]') ? [extended] : [];

    let modelMenuOpen = false;
    let levelMenuOpen = false;
    chip.onClick = () => {
      modelMenuOpen = true;
    };
    effort.onClick = () => {
      levelMenuOpen = true;
      effort.setAttribute('aria-expanded', 'true');
    };

    installFixtureDocument((selector) => {
      if (selector.includes('button.__composer-pill, .__composer-pill-composite button')) return [chip];
      if (
        selector === '[data-testid="composer-footer-actions"] button[aria-haspopup="menu"]' ||
        selector === 'button.__composer-pill[aria-haspopup="menu"]' ||
        selector === '.__composer-pill-composite button[aria-haspopup="menu"]'
      ) return [chip];
      if (selector.includes('[role="dialog"]')) return [];
      if (selector.includes('[role="menu"]') && selector.includes('[role="group"]')) {
        return [
          ...(modelMenuOpen ? [modelMenu] : []),
          ...(levelMenuOpen ? [levelMenu] : []),
        ];
      }
      if (selector.includes('[role="menuitem"]') && selector.includes('button')) {
        return modelMenuOpen ? [effort] : [];
      }
      if (selector.includes('[role="menuitem"]')) return modelMenuOpen ? [effort] : [];
      return [];
    });

    const resultPromise = new Function(
      `return ${buildThinkingTimeExpressionForTest('extended')}`,
    )() as Promise<unknown>;
    await vi.advanceTimersByTimeAsync(11_000);

    await expect(resultPromise).resolves.toEqual({ status: 'switched', label: 'Extended' });
    expect(levelMenuOpen).toBe(true);
  });

  it('reports an unavailable tier without clicking its disabled row', async () => {
    vi.useFakeTimers();
    const chip = new FixtureElement('Thinking', { 'aria-haspopup': 'menu' });
    const extended = new FixtureElement('Extended', {
      role: 'menuitemradio',
      'aria-disabled': 'true',
      title: 'Limit reached until tomorrow.',
    });
    const levelMenu = new FixtureElement('Standard Extended', { role: 'menu' });
    levelMenu.queryAll = (selector) => selector.includes('[role="menuitemradio"]') ? [extended] : [];
    let menuOpen = false;
    let clicks = 0;
    chip.onClick = () => {
      menuOpen = true;
    };
    extended.onClick = () => {
      clicks += 1;
    };

    installFixtureDocument((selector) => {
      if (selector.includes('button.__composer-pill, .__composer-pill-composite button')) return [chip];
      if (
        selector === '[data-testid="composer-footer-actions"] button[aria-haspopup="menu"]' ||
        selector === 'button.__composer-pill[aria-haspopup="menu"]' ||
        selector === '.__composer-pill-composite button[aria-haspopup="menu"]'
      ) return [chip];
      if (selector.includes('[role="dialog"]')) return [];
      if (selector.includes('[role="menu"]') && selector.includes('[role="group"]')) {
        return menuOpen ? [levelMenu] : [];
      }
      if (selector.includes('[role="menuitem"]')) return menuOpen ? [extended] : [];
      return [];
    });

    const resultPromise = new Function(
      `return ${buildThinkingTimeExpressionForTest('extended')}`,
    )() as Promise<unknown>;
    await vi.advanceTimersByTimeAsync(11_000);

    await expect(resultPromise).resolves.toEqual({
      status: 'option-disabled',
      label: 'Extended',
      notice: 'Limit reached until tomorrow.',
    });
    expect(clicks).toBe(0);
  });
});

describe('unavailable thinking-time tiers', () => {
  it('uses the provider default when Instant intent has no separate effort control', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: { value: { status: 'chip-not-found' } },
      }),
    };
    const logger = vi.fn();
    Object.assign(logger, { verbose: false });

    await expect(ensureThinkingTime(runtime as never, 'light', logger as never)).resolves.toBe(false);
    expect(logger).toHaveBeenCalledWith(
      'Thinking time: no separate effort control; using the provider default for Instant intent.',
    );
  });

  it.each(['standard', 'extended', 'heavy'] as const)(
    'fails closed when explicit %s effort has no separate control',
    async (level) => {
      const runtime = {
        evaluate: vi.fn().mockResolvedValue({
          result: { value: { status: 'chip-not-found' } },
        }),
      };
      const logger = vi.fn();
      Object.assign(logger, { verbose: false });

      await expect(ensureThinkingTime(runtime as never, level, logger as never)).rejects.toThrow(
        'Unable to find the Thinking chip button in the composer area.',
      );
    },
  );

  it('fails closed when Instant intent finds an ambiguous effort surface', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: { value: { status: 'menu-not-found' } },
      }),
    };
    const logger = vi.fn();
    Object.assign(logger, { verbose: false });

    await expect(ensureThinkingTime(runtime as never, 'light', logger as never)).rejects.toThrow(
      'Unable to find the Thinking time dropdown menu.',
    );
  });

  it('fails closed with a typed browser automation error for strict selection', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          value: {
            status: 'option-disabled',
            label: 'Extended',
            notice: 'Limit reached until tomorrow.',
          },
        },
      }),
    };
    const logger = vi.fn();
    Object.assign(logger, { verbose: false });

    await expect(ensureThinkingTime(runtime as never, 'extended', logger as never)).rejects.toMatchObject({
      name: 'ThinkingTierUnavailableError',
      category: 'browser-automation',
      requestedLevel: 'extended',
      optionLabel: 'Extended',
      notice: 'Limit reached until tomorrow.',
      details: { stage: 'thinking-tier-unavailable' },
    });
    await expect(ensureThinkingTime(runtime as never, 'extended', logger as never)).rejects.toBeInstanceOf(
      ThinkingTierUnavailableError,
    );
  });

  it('does not weaken unavailable explicit effort through the compatibility helper', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: { value: { status: 'option-disabled', label: 'Extended', notice: null } },
      }),
    };
    const logger = vi.fn();
    Object.assign(logger, { verbose: false });

    await expect(
      ensureThinkingTimeIfAvailable(runtime as never, 'extended', logger as never),
    ).rejects.toBeInstanceOf(ThinkingTierUnavailableError);
  });
});

describe('ChatGPT Pro mode account gate', () => {
  it('maps thinking-time aliases to ChatGPT Pro modes', () => {
    expect(resolveChatgptProModeFromThinkingTime('light')).toBe('standard');
    expect(resolveChatgptProModeFromThinkingTime('standard')).toBe('standard');
    expect(resolveChatgptProModeFromThinkingTime('extended')).toBe('extended');
    expect(resolveChatgptProModeFromThinkingTime('heavy')).toBe('extended');
  });

  it('treats Pro as a model-picker lane, not a Standard/Extended depth selector', () => {
    expect(isChatgptProModelTarget('Pro')).toBe(true);
    expect(isChatgptProModelTarget('gpt-5.2-pro')).toBe(true);
    expect(isChatgptProModelTarget('Thinking')).toBe(false);
    expect(isChatgptProModelTarget('gpt-5.2-thinking')).toBe(false);
    expect(isChatgptProModelTarget(null)).toBe(false);
  });

  it('allows Pro accounts to use standard and extended Pro modes', () => {
    expect(
      evaluateChatgptProModeGate('standard', {
        accountLevel: 'Pro',
        accountPlanType: 'pro',
        accountStructure: 'personal',
      }),
    ).toMatchObject({
      allowed: true,
      proMode: 'standard',
      accountLevel: 'Pro',
    });
    expect(
      evaluateChatgptProModeGate('extended', {
        accountLevel: 'Pro',
        accountPlanType: 'pro',
        accountStructure: 'personal',
      }),
    ).toMatchObject({
      allowed: true,
      proMode: 'extended',
      accountPlanType: 'pro',
    });
  });

  it('blocks Business accounts before selecting a Pro mode', () => {
    const gate = evaluateChatgptProModeGate('heavy', {
      accountLevel: 'Business',
      accountPlanType: 'team',
      accountStructure: 'workspace',
    });
    expect(gate).toMatchObject({
      allowed: false,
      proMode: 'extended',
      reason: 'requires-pro-account',
    });
    expect(formatChatgptProModeGateError(gate)).toContain('requires a Pro account');
    expect(formatChatgptProModeGateError(gate)).toContain('level=Business');
  });

  it('blocks unverified accounts instead of guessing the quota lane', () => {
    const gate = evaluateChatgptProModeGate('standard', null);
    expect(gate).toMatchObject({
      allowed: false,
      proMode: 'standard',
      reason: 'account-unverified',
    });
    expect(formatChatgptProModeGateError(gate)).toContain('could not verify');
  });
});


it.each([4, 3])('requires an available verified Pro position on a Power control with max %s', async (maximum) => {
  vi.useFakeTimers();
  const chip = new FixtureElement('Thinking effort', { 'aria-haspopup': 'menu', 'aria-label': 'Select ChatGPT model' });
  const slider = new FixtureElement('', { role: 'slider', 'aria-valuenow': '1', 'aria-valuemin': '0', 'aria-valuemax': String(maximum) });
  const announcement = new FixtureElement('Medium, 2 of 5.');
  const power = new FixtureElement('', { 'data-reasoning-slider': 'true' });
  power.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'ArrowRight') {
      const value = Number(slider.getAttribute('aria-valuenow')) + 1;
      slider.setAttribute('aria-valuenow', String(value));
      announcement.textContent = value === 4 ? 'Pro, 5 of 5.' : 'Other';
    }
  });
  const view = new FixtureElement('Medium');
  view.queryAll = (selector) => selector.includes('[role="slider"]') ? [slider] : selector.includes('[role="status"]') ? [announcement] : selector.includes('data-reasoning-slider') ? [power] : [];
  let opened = false;
  chip.onClick = () => { opened = true; };
  vi.stubGlobal('KeyboardEvent', class extends Event { key: string; constructor(type: string, options: KeyboardEventInit) { super(type, options); this.key = options.key ?? ''; } });
  installFixtureDocument((selector) => {
    if (selector.includes('Select ChatGPT model') || selector.includes('button.__composer-pill')) return [chip];
    if (opened && (selector.includes('data-model-picker') || selector.includes('[role="menu"]'))) return [view];
    return [];
  });
  const pending = new Function(`return ${buildThinkingTimeExpressionForTest('pro')}`)();
  await vi.advanceTimersByTimeAsync(11_000);
  await expect(pending).resolves.toEqual(maximum === 4 ? { status: 'switched', label: 'Pro' } : { status: 'option-not-found' });
  expect(slider.getAttribute('aria-valuenow')).toBe(maximum === 4 ? '4' : '1');
});
