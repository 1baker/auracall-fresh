import { describe, expect, test } from 'vitest';
import { ASSISTANT_ROLE_SELECTOR, CONVERSATION_TURN_SELECTOR } from '../../src/browser/constants.ts';
import {
  buildAssistantExtractorForTest,
  buildAssistantResponseProgressExpressionForTest,
  buildAssistantSnapshotExpressionForTest,
  buildConversationDebugExpressionForTest,
  buildCopyExpressionForTest,
  buildMarkdownFallbackExtractorForTest,
  fingerprintAssistantResponseText,
  getAssistantCompletionWatchdogThresholdsForTest,
} from '../../src/browser/pageActions.ts';

class FixtureElement {
  readonly dataset: Record<string, string> = {};

  constructor(
    private readonly attributes: Record<string, string> = {},
    readonly innerText = '',
    readonly textContent = innerText,
    readonly innerHTML = '',
    private readonly selectorMatches: string[] = [],
    private readonly selectorChildren: Record<string, FixtureElement[]> = {},
    private readonly closestMatches: Record<string, FixtureElement | null> = {},
  ) {}

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  matches(selector: string): boolean {
    return this.selectorMatches.includes(selector);
  }

  querySelector(selector: string): FixtureElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FixtureElement[] {
    const exact = this.selectorChildren[selector];
    if (exact) return exact;
    const collected = selector.split(',').flatMap((part) => this.selectorChildren[part.trim()] ?? []);
    return [...new Set(collected)];
  }

  closest(selector: string): FixtureElement | null {
    const exact = this.closestMatches[selector];
    if (exact !== undefined) return exact;
    for (const [candidate, match] of Object.entries(this.closestMatches)) {
      if (selector.includes(candidate)) return match;
    }
    return null;
  }

  getBoundingClientRect() {
    return { width: 100, height: 20 };
  }
}

function runAssistantExtractorFixture(turns: FixtureElement[]) {
  const expression = buildAssistantExtractorForTest('capture');
  const fixtureDocument = {
    querySelectorAll(selector: string) {
      return selector === CONVERSATION_TURN_SELECTOR ? turns : [];
    },
  };
  return Function('document', 'HTMLElement', `${expression}; return capture();`)(fixtureDocument, FixtureElement) as {
    text?: string;
    turnIndex?: number;
  } | null;
}

function runAssistantSnapshotFixture(
  turns: FixtureElement[],
  responseBoundary: Parameters<typeof buildAssistantSnapshotExpressionForTest>[0],
) {
  const expression = buildAssistantSnapshotExpressionForTest(responseBoundary);
  const fixtureDocument = {
    querySelector: () => null,
    querySelectorAll(selector: string) {
      return selector === CONVERSATION_TURN_SELECTOR ? turns : [];
    },
  };
  return Function('document', 'HTMLElement', `return ${expression};`)(fixtureDocument, FixtureElement) as {
    text?: string;
    messageId?: string | null;
    turnId?: string | null;
    turnIndex?: number | null;
  } | null;
}

function runAssistantProgressFixture(input: {
  turns: FixtureElement[];
  toolCards?: FixtureElement[];
  stopButtons?: FixtureElement[];
  dialogs?: FixtureElement[];
  responseBoundary?: Parameters<typeof buildAssistantResponseProgressExpressionForTest>[0];
}) {
  const expression = buildAssistantResponseProgressExpressionForTest(input.responseBoundary ?? 0);
  const fixtureDocument = {
    querySelectorAll(selector: string) {
      if (selector === CONVERSATION_TURN_SELECTOR) return input.turns;
      if (selector.includes('tool-approval')) return input.toolCards ?? [];
      if (selector.includes('stop-button')) return input.stopButtons ?? [];
      if (selector === '[role="dialog"]') return input.dialogs ?? [];
      return [];
    },
  };
  return Function(
    'document',
    'HTMLElement',
    'window',
    'location',
    `return ${expression};`,
  )(
    fixtureDocument,
    FixtureElement,
    { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    { href: 'https://chatgpt.com/c/fixture?private=omitted', origin: 'https://chatgpt.com', pathname: '/c/fixture' },
  );
}

describe('browser automation expressions', () => {
  test('assistant extractor references constants', () => {
    const expression = buildAssistantExtractorForTest('capture');
    expect(expression).toContain(JSON.stringify(CONVERSATION_TURN_SELECTOR));
    expect(expression).toContain(JSON.stringify(ASSISTANT_ROLE_SELECTOR));
  });

  test('extracts the current role-bearing ChatGPT search unit', () => {
    const prose = new FixtureElement(
      {},
      'AURACALL_AFFINITY_ALPHA_20260925_R5',
      'AURACALL_AFFINITY_ALPHA_20260925_R5',
      '<p>AURACALL_AFFINITY_ALPHA_20260925_R5</p>',
      ['.markdown'],
    );
    const assistantUnit = new FixtureElement(
      { 'data-content-search-unit-key': 'fallback-turn-0:2:assistant' },
      '',
      '',
      '',
      [ASSISTANT_ROLE_SELECTOR],
      { '.markdown': [prose] },
    );

    expect(runAssistantExtractorFixture([assistantUnit])).toMatchObject({
      text: 'AURACALL_AFFINITY_ALPHA_20260925_R5',
      turnIndex: 0,
    });
  });

  test('response progress recognizes the same plain search-unit answer as the collector', () => {
    // Sanitized from the retained issue311 conversation: role-bearing search
    // unit, plain prose, no article/legacy role or markdown wrapper.
    const unit = new FixtureElement(
      { 'data-content-search-unit-key': 'fixture-turn:assistant' },
      'Read-only connector answer.',
      'Read-only connector answer.',
      '<p>Read-only connector answer.</p>',
      [ASSISTANT_ROLE_SELECTOR],
    );

    expect(runAssistantSnapshotFixture([unit], 0)).toMatchObject({
      text: 'Read-only connector answer.',
      turnIndex: 0,
    });
    expect(runAssistantProgressFixture({ turns: [unit], responseBoundary: 0 })).toMatchObject({
      state: 'assistant-text',
      assistantTextChars: 27,
      assistantTurnIndex: 0,
    });
    expect(runAssistantProgressFixture({ turns: [unit], responseBoundary: 1 })).toMatchObject({
      state: 'no-assistant-turn',
      assistantTextChars: 0,
    });
  });

  test('assistant extractor skips an earlier tool card and returns later final prose in the same turn', () => {
    const toolCard = new FixtureElement({ 'data-testid': 'tool-approval-card' });
    const toolStatus = new FixtureElement(
      {},
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      '<button>Allow once</button>',
      ['.markdown'],
      {},
      { '[data-testid="tool-approval-card"]': toolCard },
    );
    const finalProse = new FixtureElement(
      { 'data-message-id': 'final-message' },
      'Session 68 remains at evidence gap review.',
      'Session 68 remains at evidence gap review.',
      '<p>Session 68 remains at evidence gap review.</p>',
      ['.markdown'],
    );
    const turn = new FixtureElement(
      { 'data-turn': 'assistant', 'data-testid': 'conversation-turn-9' },
      '',
      '',
      '',
      [],
      {
        button: [],
        '.markdown': [toolStatus, finalProse],
      },
    );

    expect(runAssistantExtractorFixture([turn])).toMatchObject({
      text: 'Session 68 remains at evidence gap review.',
      turnIndex: 0,
    });
  });

  test('assistant extractor never returns approval-card text when no final prose exists', () => {
    const toolCard = new FixtureElement({ 'data-testid': 'tool-approval-card' });
    const toolStatus = new FixtureElement(
      {},
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      '<button>Allow once</button>',
      ['.markdown'],
      {},
      { '[data-testid="tool-approval-card"]': toolCard },
    );
    const turn = new FixtureElement({ 'data-turn': 'assistant' }, '', '', '', [], {
      button: [],
      '.markdown': [toolStatus],
    });

    expect(runAssistantExtractorFixture([turn])).toBeNull();
  });

  test('passive response progress classifies a tool-only turn without exposing tool text as answer text', () => {
    const toolCard = new FixtureElement({ 'data-testid': 'tool-approval-card' });
    const toolStatus = new FixtureElement(
      {},
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      '',
      ['.markdown'],
      {},
      { '[data-testid="tool-approval-card"]': toolCard },
    );
    const turn = new FixtureElement({ 'data-turn': 'assistant' }, toolStatus.innerText, toolStatus.textContent, '', [], {
      '.markdown': [toolStatus],
      '[data-testid="tool-approval-card"]': [toolCard],
    });

    expect(runAssistantProgressFixture({ turns: [turn], toolCards: [toolCard] })).toMatchObject({
      state: 'tool-approval-visible',
      assistantTextChars: 0,
      toolApprovalCardsVisible: 1,
      turnCount: 1,
      assistantTurnIndex: 0,
    });
  });

  test('passive response progress ignores approval cards from an older assistant turn', () => {
    const staleToolCard = new FixtureElement({ 'data-testid': 'tool-approval-card' });
    const staleTurn = new FixtureElement({ 'data-turn': 'assistant' }, '', '', '', [], {
      '[data-testid="tool-approval-card"]': [staleToolCard],
    });
    const userTurn = new FixtureElement({ 'data-turn': 'user' });
    const currentTurn = new FixtureElement({ 'data-turn': 'assistant' });

    expect(
      runAssistantProgressFixture({ turns: [staleTurn, userTurn, currentTurn], toolCards: [staleToolCard] }),
    ).toMatchObject({
      state: 'assistant-turn-no-text',
      toolApprovalCardsVisible: 0,
      assistantTurnIndex: 2,
    });
  });

  test('passive response progress classifies later final prose without returning its text', () => {
    const finalProse = new FixtureElement(
      {},
      'Session 68 remains at evidence gap review.',
      'Session 68 remains at evidence gap review.',
      '<p>Session 68 remains at evidence gap review.</p>',
      ['.markdown'],
    );
    const turn = new FixtureElement(
      {
        'data-turn': 'assistant',
        'data-message-id': 'message-experiment-51-turn-03',
        'data-testid': 'conversation-turn-experiment-51-03',
      },
      'Provider control chrome',
      'Provider control chrome',
      '',
      [],
      {
      '.markdown': [finalProse],
      },
    );

    const progress = runAssistantProgressFixture({ turns: [turn] });
    expect(progress).toMatchObject({
      state: 'assistant-text',
      assistantTextChars: 'Session 68 remains at evidence gap review.'.length,
      assistantMessageId: 'message-experiment-51-turn-03',
      assistantTurnId: 'conversation-turn-experiment-51-03',
      assistantTextFingerprint: expect.stringMatching(/^\d+:\d+$/),
      toolApprovalCardsVisible: 0,
      url: 'https://chatgpt.com/c/fixture',
    });
    expect(JSON.stringify(progress)).not.toContain('Session 68');
    expect(JSON.stringify(progress)).not.toContain('private');
  });

  test('passive response progress preserves a fresh assistant turn when virtualization shrinks below the committed turn count', () => {
    const mountedTurns = Array.from(
      { length: 11 },
      (_, index) => new FixtureElement({ 'data-turn': index % 2 === 0 ? 'user' : 'assistant' }),
    );
    const finalProse = new FixtureElement(
      { 'data-message-id': 'fresh-message' },
      'Session 68 remains at evidence gap review.',
      'Session 68 remains at evidence gap review.',
      '<p>Session 68 remains at evidence gap review.</p>',
      ['.markdown'],
    );
    mountedTurns.push(
      new FixtureElement(
        {
          'data-turn': 'assistant',
          'data-testid': 'conversation-turn-fresh',
          'data-message-id': 'fresh-message',
        },
        '',
        '',
        '',
        [],
        { '.markdown': [finalProse] },
      ),
    );

    expect(
      runAssistantProgressFixture({
        turns: mountedTurns,
        responseBoundary: {
          minTurnIndex: 15,
          baselineMessageId: 'baseline-message',
          baselineTurnId: 'conversation-turn-14',
        },
      }),
    ).toMatchObject({
      state: 'assistant-text',
      turnCount: 12,
      assistantTurnIndex: 11,
      boundaryState: 'stable-identity',
    });
  });

  test('snapshot boundary accepts a fresh stable identity below the positional floor and rejects the baseline identity', () => {
    const finalProse = new FixtureElement(
      { 'data-message-id': 'fresh-message' },
      'Session 68 remains at evidence gap review.',
      'Session 68 remains at evidence gap review.',
      '<p>Session 68 remains at evidence gap review.</p>',
      ['.markdown'],
    );
    const freshTurn = new FixtureElement(
      {
        'data-turn': 'assistant',
        'data-testid': 'conversation-turn-fresh',
        'data-message-id': 'fresh-message',
      },
      '',
      '',
      '',
      [],
      { button: [], '.markdown': [finalProse] },
    );
    const mountedTurns = Array.from({ length: 11 }, () => new FixtureElement({ 'data-turn': 'user' }));
    mountedTurns.push(freshTurn);

    expect(
      runAssistantSnapshotFixture(mountedTurns, {
        minTurnIndex: 15,
        baselineMessageId: 'baseline-message',
        baselineTurnId: 'conversation-turn-14',
      }),
    ).toMatchObject({
      text: 'Session 68 remains at evidence gap review.',
      messageId: 'fresh-message',
      turnId: 'conversation-turn-fresh',
      turnIndex: 11,
    });

    expect(
      runAssistantSnapshotFixture(mountedTurns, {
        minTurnIndex: 15,
        baselineMessageId: 'fresh-message',
        baselineTurnId: 'conversation-turn-fresh',
      }),
    ).toBeNull();

    expect(
      runAssistantSnapshotFixture(mountedTurns, {
        minTurnIndex: 15,
        baselineMessageId: 'reindexed-baseline-message',
        baselineTurnId: 'reindexed-baseline-turn',
        baselineTextFingerprint: fingerprintAssistantResponseText(
          'Session 68 remains at evidence gap review.',
        ),
      }),
    ).toBeNull();
  });

  test('snapshot boundary does not convert a fresh tool-only turn into assistant prose', () => {
    const toolCard = new FixtureElement({ 'data-testid': 'tool-approval-card' });
    const toolStatus = new FixtureElement(
      {},
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      'Allow ChatGPT to use LitScout? Allow once Always allow',
      '<button>Allow once</button>',
      ['.markdown'],
      {},
      { '[data-testid="tool-approval-card"]': toolCard },
    );
    const toolTurn = new FixtureElement(
      {
        'data-turn': 'assistant',
        'data-testid': 'conversation-turn-tool',
        'data-message-id': 'tool-message',
      },
      '',
      '',
      '',
      [],
      {
        button: [],
        '.markdown': [toolStatus],
        '[data-testid="tool-approval-card"]': [toolCard],
      },
    );

    expect(
      runAssistantSnapshotFixture([toolTurn], {
        minTurnIndex: 15,
        baselineMessageId: 'baseline-message',
        baselineTurnId: 'conversation-turn-14',
      }),
    ).toBeNull();
  });

  test('conversation debug expression references conversation selector', () => {
    const expression = buildConversationDebugExpressionForTest();
    expect(expression).toContain(JSON.stringify(CONVERSATION_TURN_SELECTOR));
  });

  test('markdown fallback filters user turns and respects assistant indicators', () => {
    const expression = buildMarkdownFallbackExtractorForTest('2');
    expect(expression).toContain('MIN_TURN_INDEX');
    expect(expression).toContain("role !== 'user'");
    expect(expression).toContain('copy-turn-action-button');
    expect(expression).toContain(CONVERSATION_TURN_SELECTOR);
    expect(expression).toContain('[data-testid="tool-approval-card"]');
  });

  test('copy expression scopes to assistant turn buttons', () => {
    const expression = buildCopyExpressionForTest({});
    expect(expression).toContain(JSON.stringify(CONVERSATION_TURN_SELECTOR));
    expect(expression).toContain(ASSISTANT_ROLE_SELECTOR);
    expect(expression).toContain('isAssistantTurn');
    expect(expression).toContain('copy-turn-action-button');
  });

  test('watchdog thresholds keep long streamed answers alive longer than medium answers', () => {
    expect(getAssistantCompletionWatchdogThresholdsForTest(8)).toEqual({
      completionStableTarget: 12,
      requiredStableCycles: 12,
      minStableMs: 8000,
    });
    expect(getAssistantCompletionWatchdogThresholdsForTest(32)).toEqual({
      completionStableTarget: 8,
      requiredStableCycles: 8,
      minStableMs: 1200,
    });
    expect(getAssistantCompletionWatchdogThresholdsForTest(120)).toEqual({
      completionStableTarget: 6,
      requiredStableCycles: 8,
      minStableMs: 2000,
    });
    expect(getAssistantCompletionWatchdogThresholdsForTest(700)).toEqual({
      completionStableTarget: 8,
      requiredStableCycles: 10,
      minStableMs: 3000,
    });
  });
});
