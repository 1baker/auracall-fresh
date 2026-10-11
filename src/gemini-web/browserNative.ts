import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connectGuardedPuppeteer } from '../../packages/browser-service/src/guardedPuppeteer.js';
import type { Browser, Page, Target } from 'puppeteer-core';
import { launchChrome, hideChromeWindow, wasChromeLaunchedByAuracall } from '../browser/chromeLifecycle.js';
import { openOrReuseChromeTarget } from '../../packages/browser-service/src/chromeLifecycle.js';
import { bootstrapManagedProfile } from '../browser/profileStore.js';
import { resolveBrowserLaunchPlan } from '../browser/service/browserLaunchPlan.js';
import { captureActionPhaseDiagnostics, runOrderedSurfaceFallback, waitForAttachmentSignals } from '../browser/service/ui.js';
import type {
  BrowserRunOptions,
  BrowserRunResult,
  BrowserLogger,
  BrowserPassiveObservation,
  ResolvedBrowserConfig,
} from '../browser/types.js';

const GEMINI_PROMPT_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]';
const GEMINI_UPLOAD_BUTTON_SELECTOR = 'button[aria-label="Open upload file menu"]';
const GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR = `${GEMINI_UPLOAD_BUTTON_SELECTOR} .mat-mdc-button-touch-target`;
const GEMINI_UPLOAD_FILES_MENU_SELECTOR = '[data-test-id="local-images-files-uploader-button"]';
const GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR = '[data-test-id="hidden-local-image-upload-button"]';
const GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR = '[data-test-id="hidden-local-file-upload-button"]';
const GEMINI_SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const GEMINI_SEND_TOUCH_TARGET_SELECTOR = `${GEMINI_SEND_BUTTON_SELECTOR} .mat-mdc-button-touch-target`;
const GEMINI_HISTORY_SELECTOR = '[data-test-id="chat-history-container"]';

function isLikelyImagePath(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(path.extname(filePath).toLowerCase());
}

const GEMINI_SIGNED_OUT_PROBE_EXPRESSION = `(() => {
  const host = String(globalThis.location?.hostname ?? '').toLowerCase();
  if (host === 'accounts.google.com') return true;
  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = globalThis.getComputedStyle?.(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  return Array.from(document.querySelectorAll('a,button,[role="button"]')).some((el) => {
    if (!isVisible(el)) return false;
    const label = normalize(\`\${el.getAttribute?.('aria-label') ?? ''} \${el.textContent ?? ''}\`);
    if (!/(^|\\b)(sign in|log in|login)(\\b|$)/.test(label)) return false;
    const href = el instanceof HTMLAnchorElement ? normalize(el.getAttribute('href') ?? '') : '';
    return host === 'gemini.google.com' || href.includes('accounts.google.com');
  });
})()`;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function recordBrowserPassiveObservation(
  observations: BrowserPassiveObservation[],
  observation: Omit<BrowserPassiveObservation, 'observedAt'>,
): void {
  if (observations.some((entry) => entry.state === observation.state)) {
    return;
  }
  observations.push({
    ...observation,
    observedAt: new Date().toISOString(),
  });
}

function isTransientGeminiPageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /frame got detached|requesting main frame too early/i.test(message);
}

function resolveChromeTargetId(target: { id?: string; targetId?: string } | null | undefined): string | null {
  if (!target) return null;
  return typeof target.id === 'string'
    ? target.id
    : typeof target.targetId === 'string'
      ? target.targetId
      : null;
}

async function waitForPuppeteerPageTarget(browser: Browser, targetId: string, timeoutMs: number): Promise<Page> {
  const target = await browser.waitForTarget(
    (candidate) => ((candidate as Target & { _targetId?: string })._targetId ?? null) === targetId,
    { timeout: timeoutMs },
  );
  const page = await target.page();
  if (!page) {
    throw new Error(`Gemini browser target ${targetId} did not resolve to a Puppeteer page.`);
  }
  return page;
}

async function reacquireOwnedGeminiPage(browser: Browser, targetId: string): Promise<Page> {
  const page = await waitForPuppeteerPageTarget(browser, targetId, 15_000);
  await page.bringToFront().catch(() => undefined);
  return page;
}

async function closeCompetingGeminiPages(browser: Browser, selectedTargetId: string): Promise<void> {
  const pages = await browser.pages();
  await Promise.all(
    pages.map(async (candidate) => {
      const candidateTargetId = ((candidate.target() as Target & { _targetId?: string })._targetId ?? null);
      if (candidateTargetId === selectedTargetId) {
        return;
      }
      let url = '';
      try {
        url = candidate.url();
      } catch {
        url = '';
      }
      if (!url.startsWith('https://gemini.google.com/')) {
        return;
      }
      await candidate.close().catch(() => undefined);
    }),
  );
}

async function waitForOwnedGeminiReady(options: {
  browser: Browser;
  targetId: string;
  page: Page;
  selector: string;
  timeoutMs: number;
}): Promise<Page> {
  let currentPage = options.page;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await currentPage.waitForSelector(options.selector, { visible: true, timeout: options.timeoutMs });
      return currentPage;
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiPageError(error) || attempt > 0) {
        throw error;
      }
      currentPage = await reacquireOwnedGeminiPage(options.browser, options.targetId);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Waiting for selector \`${options.selector}\` failed`);
}

export function extractGeminiAnswerText(options: {
  currentText: string;
  prompt: string;
}): string {
  let text = normalizeWhitespace(options.currentText);
  const prompt = normalizeWhitespace(options.prompt);

  if (!prompt) {
    return '';
  }

  const promptIndex = text.toLowerCase().lastIndexOf(prompt.toLowerCase());
  if (promptIndex < 0) {
    return '';
  }

  text = text.slice(promptIndex + prompt.length).trim();
  text = text.replace(/^(?:tools|fast|submit)(?:\s+(?:tools|fast|submit))*\b/i, '').trim();
  text = text.replace(/\b(?:tools|fast|submit)(?:\s+(?:tools|fast|submit))*\s*$/i, '').trim();
  return text;
}

export function detectGeminiNativeAttachmentFailure(currentText: string): string | null {
  const text = normalizeWhitespace(currentText).toLowerCase();
  if (text.includes('image upload failed')) {
    return 'Gemini native image upload failed on the page before the prompt was answered.';
  }
  if (text.includes('image not received, please re-upload')) {
    return 'Gemini reported that the uploaded image was not received and must be re-uploaded.';
  }
  return null;
}

export function isGeminiAttachmentBlindAnswer(answerText: string): boolean {
  const text = normalizeWhitespace(answerText).toLowerCase();
  if (!text) {
    return false;
  }
  return (
    /please upload (the )?image/.test(text) ||
    /image you('| a)?re referring to/.test(text) ||
    /i('ll| will) (be )?happy to describe it/.test(text)
  );
}

export function isGeminiPromptCommitted(options: {
  historyText: string;
  prompt: string;
}): boolean {
  const historyText = normalizeWhitespace(options.historyText);
  const prompt = normalizeWhitespace(options.prompt);
  if (!historyText || !prompt) {
    return false;
  }
  return historyText.includes(prompt) || historyText.includes(prompt.slice(0, 80));
}

type GeminiAttachmentPreviewState = {
  ready: boolean;
  sendReady: boolean;
  textboxText: string;
  visibleBlobCount: number;
  removeLabels: string[];
  previewNames: string[];
  matchedNames: string[];
};

type GeminiAttachmentSubmitDiagnostics = {
  promptText: string;
  historyText: string;
  historyHasPrompt: boolean;
  visibleBlobCount: number;
  removeLabels: string[];
  previewNames: string[];
  sendReady: boolean;
};

async function triggerGeminiFileChooser(page: Page, attachmentPaths: string[]): Promise<void> {
  const imageOnly = attachmentPaths.length > 0 && attachmentPaths.every(isLikelyImagePath);
  let menuReady = false;
  let lastMenuError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.bringToFront();
      if (await page.$(GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR)) {
        await page.click(GEMINI_UPLOAD_TOUCH_TARGET_SELECTOR);
      } else {
        await page.click(GEMINI_UPLOAD_BUTTON_SELECTOR);
      }
      if (imageOnly && (await page.$(GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR) || await page.$(GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR))) {
        menuReady = true;
        break;
      }
      await page.waitForSelector(GEMINI_UPLOAD_FILES_MENU_SELECTOR, { visible: true, timeout: 10_000 });
      menuReady = true;
      break;
    } catch (error) {
      lastMenuError = error;
      if (!isTransientGeminiPageError(error) || attempt > 0) {
        if (!imageOnly) {
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  if (!menuReady) {
    throw lastMenuError instanceof Error ? lastMenuError : new Error('Gemini upload menu did not become ready.');
  }

  if (imageOnly) {
    const files = await Promise.all(
      attachmentPaths.map(async (filePath) => ({
        name: path.basename(filePath),
        mimeType:
          path.extname(filePath).toLowerCase() === '.jpg' || path.extname(filePath).toLowerCase() === '.jpeg'
            ? 'image/jpeg'
            : path.extname(filePath).toLowerCase() === '.gif'
              ? 'image/gif'
              : path.extname(filePath).toLowerCase() === '.webp'
                ? 'image/webp'
                : path.extname(filePath).toLowerCase() === '.svg'
                  ? 'image/svg+xml'
                  : 'image/png',
        base64: (await readFile(filePath)).toString('base64'),
      })),
    );
    const dispatchedSelector = await page.evaluate(`(() => {
      const selectors = ${JSON.stringify([
        GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR,
        GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR,
      ])};
      const payloads = ${JSON.stringify(files)};
      const decode = (b64) => Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
      for (const selector of selectors) {
        const target = document.querySelector(selector);
        if (!(target instanceof HTMLElement)) continue;
        const event = new Event('fileSelected', { bubbles: false, cancelable: true });
        event.files = payloads.map((file) => new File([decode(file.base64)], file.name, { type: file.mimeType }));
        if (target.dispatchEvent(event)) {
          return selector;
        }
      }
      return null;
    })()`);
    if (typeof dispatchedSelector === 'string' && dispatchedSelector.length > 0) {
      await page.evaluate((selector: string) => {
        document.documentElement.setAttribute('data-auracall-gemini-upload-selector', selector);
      }, dispatchedSelector);
      return;
    }
  }

  const trustedClick = async (selector: string): Promise<boolean> => {
    try {
      const handle = await page.$(selector);
      if (!handle) return false;
      const box = await handle.boundingBox();
      if (!box || box.width <= 0 || box.height <= 0) return false;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 8 });
      await page.mouse.down();
      await page.mouse.up();
      return true;
    } catch {
      return false;
    }
  };

  const tryChooser = async (
    selector: string,
    timeoutMs: number,
  ): Promise<import('puppeteer-core').FileChooser | null> => {
    try {
      const clickedTrusted = await trustedClick(selector);
      return await Promise.all([
        page.waitForFileChooser({ timeout: timeoutMs }),
        clickedTrusted
          ? Promise.resolve()
          : page.evaluate((targetSelector: string) => {
              const target = document.querySelector(targetSelector);
              if (target instanceof HTMLElement) {
                target.click();
                return;
              }
              throw new Error(`No Gemini upload trigger matched ${targetSelector}`);
            }, selector),
      ]).then(([fileChooser]) => fileChooser);
    } catch {
      return null;
    }
  };

  const cdp = await page.createCDPSession();
  await cdp.send('Page.enable').catch(() => undefined);
  await cdp.send('DOM.enable').catch(() => undefined);
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => undefined);

  const tryInterceptedChooser = async (selector: string, timeoutMs: number): Promise<boolean> => {
    const chooserPromise = new Promise<{ backendNodeId?: number } | null>((resolve) => {
      const timer = setTimeout(() => {
        cdp.off('Page.fileChooserOpened', onOpened);
        resolve(null);
      }, timeoutMs);
      const onOpened = (event: { backendNodeId?: number }) => {
        clearTimeout(timer);
        cdp.off('Page.fileChooserOpened', onOpened);
        resolve(event);
      };
      cdp.on('Page.fileChooserOpened', onOpened);
    });
    const clickedTrusted = await trustedClick(selector);
    if (!clickedTrusted) {
      await page.evaluate((targetSelector: string) => {
        const target = document.querySelector(targetSelector);
        if (target instanceof HTMLElement) {
          target.click();
          return;
        }
        throw new Error(`No Gemini upload trigger matched ${targetSelector}`);
      }, selector).catch(() => undefined);
    }
    const chooser = await chooserPromise;
    if (!chooser || typeof chooser.backendNodeId !== 'number') {
      return false;
    }
    await cdp.send('DOM.setFileInputFiles', {
      backendNodeId: chooser.backendNodeId,
      files: [...attachmentPaths],
    });
    return true;
  };

  const selectorOrder = imageOnly
    ? [GEMINI_UPLOAD_FILES_MENU_SELECTOR, GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR, GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR]
    : [GEMINI_UPLOAD_FILES_MENU_SELECTOR, GEMINI_HIDDEN_FILE_UPLOAD_SELECTOR, GEMINI_HIDDEN_IMAGE_UPLOAD_SELECTOR];

  try {
    const interceptedAttempt = await runOrderedSurfaceFallback({
      attempts: selectorOrder.map((selector, index) => ({
        name: `intercept:${selector}`,
        run: async () => tryInterceptedChooser(selector, index === 0 ? 2_500 : 10_000),
      })),
      isSuccess: (value) => value === true,
    });
    if (interceptedAttempt.ok && interceptedAttempt.value === true) {
      return;
    }

    const chooserAttempt = await runOrderedSurfaceFallback({
      attempts: selectorOrder.map((selector, index) => ({
        name: selector,
        run: async () => tryChooser(selector, index === 0 ? 2_500 : 10_000),
      })),
      isSuccess: (value) => value !== null,
    });

    if (!chooserAttempt.ok || !chooserAttempt.value) {
      throw new Error('Waiting for Gemini file chooser failed across all known upload triggers.');
    }

    await chooserAttempt.value.accept(attachmentPaths);
  } finally {
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}

async function readGeminiNativeState(page: Page): Promise<{
  historyText: string;
  promptText: string;
  hasPendingBlob: boolean;
  hasRemoveButton: boolean;
}> {
  const result = await page.evaluate(
    (promptSelector: string, historySelector: string) => {
      const prompt = document.querySelector(promptSelector);
      const history = document.querySelector(historySelector);
      const hasPendingBlob = Array.from(document.querySelectorAll('img')).some((el) => {
        const src = String(el.getAttribute('src') ?? '');
        if (!src.startsWith('blob:')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const hasRemoveButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((el) =>
        String(el.getAttribute('aria-label') ?? '').toLowerCase().includes('remove file'),
      );
      return {
        historyText: String(history instanceof HTMLElement ? history.innerText : history?.textContent ?? ''),
        promptText: String(prompt?.textContent ?? ''),
        hasPendingBlob,
        hasRemoveButton,
      };
    },
    GEMINI_PROMPT_SELECTOR,
    GEMINI_HISTORY_SELECTOR,
  );
  return {
    historyText: typeof result.historyText === 'string' ? result.historyText : '',
    promptText: typeof result.promptText === 'string' ? result.promptText : '',
    hasPendingBlob: Boolean(result.hasPendingBlob),
    hasRemoveButton: Boolean(result.hasRemoveButton),
  };
}

async function readGeminiAttachmentSubmitDiagnostics(
  page: Page,
  promptText: string,
): Promise<GeminiAttachmentSubmitDiagnostics> {
  const normalizedPrompt = normalizeWhitespace(promptText);
  const result = await page.evaluate(
    (promptSelector: string, historySelector: string, sendSelector: string, expectedPrompt: string) => {
      const prompt = document.querySelector(promptSelector);
      const history = document.querySelector(historySelector);
      const send = document.querySelector(sendSelector);
      const previews = Array.from(document.querySelectorAll('[data-test-id="file-preview"]'));
      const previewNames = previews.map((el) => {
        const previewText = String(el.textContent ?? '').replace(/\s+/g, ' ').trim();
        const previewTitle =
          String(el.getAttribute('title') ?? '') ||
          String(el.querySelector('[data-test-id="file-name"]')?.getAttribute?.('title') ?? '');
        return previewTitle || previewText;
      }).filter(Boolean);
      const visibleBlobCount = Array.from(document.querySelectorAll('img')).filter((el) => {
        const src = String(el.getAttribute('src') ?? '');
        if (!src.startsWith('blob:')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length;
      const removeLabels = Array.from(document.querySelectorAll('button,[role="button"]'))
        .map((el) => String(el.getAttribute('aria-label') ?? ''))
        .filter((label) => /remove file/i.test(label));
      const historyText = String(history instanceof HTMLElement ? history.innerText : history?.textContent ?? '');
      const sendReady = (() => {
        if (!(send instanceof HTMLElement)) return false;
        const style = globalThis.getComputedStyle?.(send);
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) {
          return false;
        }
        const rect = send.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
        return ariaDisabled !== 'true' && !send.hasAttribute('disabled');
      })();
      return {
        promptText: String(prompt?.textContent ?? ''),
        historyText,
        historyHasPrompt:
          expectedPrompt.length > 0 &&
          (historyText.includes(expectedPrompt) || historyText.includes(expectedPrompt.slice(0, 80))),
        visibleBlobCount,
        removeLabels,
        previewNames,
        sendReady,
      };
    },
    GEMINI_PROMPT_SELECTOR,
    GEMINI_HISTORY_SELECTOR,
    GEMINI_SEND_BUTTON_SELECTOR,
    normalizedPrompt,
  );
  return {
    promptText: typeof result.promptText === 'string' ? result.promptText : '',
    historyText: typeof result.historyText === 'string' ? result.historyText : '',
    historyHasPrompt: Boolean(result.historyHasPrompt),
    visibleBlobCount: Number.isFinite(result.visibleBlobCount) ? result.visibleBlobCount : 0,
    removeLabels: Array.isArray(result.removeLabels) ? result.removeLabels.map((value) => String(value)) : [],
    previewNames: Array.isArray(result.previewNames) ? result.previewNames.map((value) => String(value)) : [],
    sendReady: Boolean(result.sendReady),
  };
}

async function isGeminiSignedOut(page: Page): Promise<boolean> {
  const result = await page.evaluate(GEMINI_SIGNED_OUT_PROBE_EXPRESSION);
  return Boolean(result);
}

async function waitForGeminiAnswer(page: Page, options: {
  prompt: string;
  timeoutMs: number;
  passiveObservations?: BrowserPassiveObservation[];
}): Promise<string> {
  const deadline = Date.now() + options.timeoutMs;
  let lastAnswer = '';
  let stableCount = 0;
  let lastState: Awaited<ReturnType<typeof readGeminiNativeState>> | null = null;
  let retriedPendingComposerSend = false;

  while (Date.now() < deadline) {
    const state = await readGeminiNativeState(page);
    lastState = state;
    const currentText = state.historyText;
    const attachmentFailure = detectGeminiNativeAttachmentFailure(currentText);
    if (attachmentFailure) {
      throw new Error(attachmentFailure);
    }
    const answer = extractGeminiAnswerText({
      currentText,
      prompt: options.prompt,
    });
    if (
      options.passiveObservations &&
      answer.length === 0 &&
      isGeminiPromptCommitted({ historyText: currentText, prompt: options.prompt })
    ) {
      recordBrowserPassiveObservation(options.passiveObservations, {
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'gemini-native-prompt-committed',
        confidence: 'medium',
      });
    }

    const promptText = normalizeWhitespace(state.promptText);
    if (promptText.length > 0 && !state.hasPendingBlob && !state.hasRemoveButton) {
      if (!retriedPendingComposerSend) {
        const retried = await retryGeminiPendingComposerSend(page);
        if (retried) {
          retriedPendingComposerSend = true;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }
      throw new Error('Gemini prompt remained in the composer after the attachment vanished and no response materialized.');
    }

    if (answer.length > 0) {
      if (options.passiveObservations) {
        recordBrowserPassiveObservation(options.passiveObservations, {
          state: 'response-incoming',
          source: 'browser-service',
          evidenceRef: 'gemini-native-answer-visible',
          confidence: 'high',
        });
      }
      if (answer === lastAnswer) {
        stableCount += 1;
      } else {
        lastAnswer = answer;
        stableCount = 0;
      }

      if (stableCount >= 2) {
        return answer;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (lastState) {
    const promptText = normalizeWhitespace(lastState.promptText);
    if (promptText.length > 0 && !lastState.hasPendingBlob && !lastState.hasRemoveButton) {
      throw new Error('Gemini prompt remained in the composer after the attachment vanished and no response materialized.');
    }
    if (promptText.length > 0 && (lastState.hasPendingBlob || lastState.hasRemoveButton)) {
      throw new Error('Gemini prompt remained pending with the attachment still staged and no response materialized.');
    }
  }

  throw new Error('Timed out waiting for Gemini browser-native attachment response.');
}

async function waitForAttachmentPreview(
  page: Page,
  attachmentNames: string[],
  timeoutMs: number,
): Promise<void> {
  const imageNames = attachmentNames.filter(isLikelyImagePath);
  const requiredStableReadyCount = imageNames.length > 0 ? 3 : 2;

  await waitForAttachmentSignals<GeminiAttachmentPreviewState>({
    read: async () => page.evaluate(`(() => {
      const names = ${JSON.stringify(attachmentNames)};
      const imageNamesInner = ${JSON.stringify(imageNames)};
      const prompt = document.querySelector('div[role="textbox"][aria-label="Enter a prompt for Gemini"]');
      const send = document.querySelector('button[aria-label="Send message"]');
      const locateComposerScope = () => {
        if (!(prompt instanceof HTMLElement)) {
          return document.body;
        }
        let current = prompt;
        let fallback = prompt;
        while (current && current !== document.body) {
          const hasSend = Boolean(send && current.contains(send));
          if (hasSend) {
            fallback = current;
            const hasAttachmentSignals =
              current.querySelector('[data-test-id="file-preview"]') ||
              current.querySelector('[aria-label*="Remove file"]') ||
              Array.from(current.querySelectorAll('img')).some((el) => {
                const src = String(el.getAttribute('src') ?? '');
                if (!src.startsWith('blob:')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
            if (hasAttachmentSignals) {
              return current;
            }
          }
          current = current.parentElement;
        }
        return fallback;
      };
      const composer = locateComposerScope();
      const previews = Array.from(document.querySelectorAll('[data-test-id="file-preview"]'));
      const scopedPreviews = previews.filter((el) => composer.contains(el));
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
      const scopedButtons = buttons.filter((el) => composer.contains(el));
      const visibleImages = Array.from(composer.querySelectorAll('img')).filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = globalThis.getComputedStyle?.(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const src = String(el.getAttribute('src') ?? '');
        return src.startsWith('blob:');
      });
      const removeLabels = buttons
        .map((el) => String(el.getAttribute('aria-label') ?? ''))
        .filter((label) => /remove file/i.test(label));
      const sendReady = (() => {
        if (!(send instanceof HTMLElement)) return false;
        const style = globalThis.getComputedStyle?.(send);
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) {
          return false;
        }
        const rect = send.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
        return ariaDisabled !== 'true' && !send.hasAttribute('disabled');
      })();
      const previewNames = scopedPreviews.map((el) => {
        const previewText = String(el.textContent ?? '').replace(/s+/g, ' ').trim();
        const previewTitle =
          String(el.getAttribute('title') ?? '') ||
          String(el.querySelector('[data-test-id="file-name"]')?.getAttribute?.('title') ?? '');
        return previewTitle || previewText;
      }).filter(Boolean);
      const matchedNames = names.filter((name) => {
        const removeLabel = 'Remove file ' + name;
        const hasRemove =
          scopedButtons.some((el) => String(el.getAttribute('aria-label') ?? '').includes(removeLabel)) ||
          buttons.some((el) => String(el.getAttribute('aria-label') ?? '').includes(removeLabel));
        const hasPreview = scopedPreviews.some((el) => {
          const previewText = String(el.textContent ?? '').replace(/s+/g, ' ').trim();
          const previewTitle =
            String(el.getAttribute('title') ?? '') ||
            String(el.querySelector('[data-test-id="file-name"]')?.getAttribute?.('title') ?? '');
          return previewText.includes(name) || previewTitle.includes(name);
        });
        const isImageName = imageNamesInner.includes(name);
        const hasImagePreview = isImageName && visibleImages.length > 0;
        return hasRemove || hasPreview || hasImagePreview;
      });
      return {
        ready: matchedNames.length === names.length,
        sendReady,
        textboxText: String(prompt instanceof HTMLElement ? prompt.textContent ?? '' : ''),
        visibleBlobCount: visibleImages.length,
        removeLabels,
        previewNames,
        matchedNames,
      };
    })()`) as Promise<GeminiAttachmentPreviewState>,
    isReady: (state) => state.ready && state.sendReady,
    timeoutMs,
    pollMs: 500,
    requiredStablePolls: requiredStableReadyCount,
    formatLastState: (state) =>
      JSON.stringify({
        sendReady: state.sendReady,
        textboxText: normalizeWhitespace(state.textboxText),
        visibleBlobCount: state.visibleBlobCount,
        removeLabels: state.removeLabels,
        previewNames: state.previewNames,
        matchedNames: state.matchedNames,
      }),
    timeoutMessage: 'Gemini attachment preview did not stabilize before timeout.',
  });
}

async function waitForGeminiSendReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (sendSelector: string) => {
      const send = document.querySelector(sendSelector);
      if (!(send instanceof HTMLElement)) return false;
      const style = globalThis.getComputedStyle?.(send);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      const rect = send.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
      return ariaDisabled !== 'true' && !send.hasAttribute('disabled');
    },
    { timeout: timeoutMs },
    GEMINI_SEND_BUTTON_SELECTOR,
  );
}

async function clearGeminiPromptText(page: Page): Promise<void> {
  await page.evaluate((promptSelector: string) => {
    const prompt = document.querySelector(promptSelector);
    if (!(prompt instanceof HTMLElement)) {
      return;
    }
    prompt.focus();
    if (prompt instanceof HTMLTextAreaElement || prompt instanceof HTMLInputElement) {
      prompt.value = '';
      prompt.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
      prompt.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    prompt.textContent = '';
    prompt.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: '', inputType: 'deleteByCut' }));
    prompt.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
  }, GEMINI_PROMPT_SELECTOR);
}

async function retryGeminiPendingComposerSend(page: Page): Promise<boolean> {
  const result = await page.evaluate(`(() => {
    const touchSelector = ${JSON.stringify(GEMINI_SEND_TOUCH_TARGET_SELECTOR)};
    const sendSelector = ${JSON.stringify(GEMINI_SEND_BUTTON_SELECTOR)};
    const isUsable = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = globalThis.getComputedStyle?.(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const send = document.querySelector(sendSelector);
    if (!isUsable(send)) {
      return false;
    }
    const ariaDisabled = String(send.getAttribute('aria-disabled') ?? '').toLowerCase();
    if (ariaDisabled === 'true' || send.hasAttribute('disabled')) {
      return false;
    }
    const touchTarget = document.querySelector(touchSelector);
    if (isUsable(touchTarget)) {
      touchTarget.click();
      return true;
    }
    send.click();
    return true;
  })()`);
  return Boolean(result);
}

async function waitForGeminiSubmit(page: Page, promptText: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const normalizedPrompt = normalizeWhitespace(promptText);
  let lastState: {
    composerText: string;
    ariaDisabled: string;
    disabled: boolean;
    promptInHistory: boolean;
    nativeFailure: boolean;
    hasPendingBlob: boolean;
    hasRemoveButton: boolean;
  } | null = null;
  while (Date.now() < deadline) {
    const state = await page.evaluate(
      (promptSelector: string, sendSelector: string, expectedPrompt: string) => {
        const prompt = document.querySelector(promptSelector);
        const send = document.querySelector(sendSelector);
        const composerText = String(prompt?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const ariaDisabled = String(send?.getAttribute?.('aria-disabled') ?? '').toLowerCase();
        const disabled = Boolean(send?.hasAttribute?.('disabled'));
        const history = document.querySelector('[data-test-id="chat-history-container"]');
        const historyText = String(history instanceof HTMLElement ? history.innerText : history?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const promptInHistory =
          expectedPrompt.length > 0 &&
          (historyText.includes(expectedPrompt) || historyText.includes(expectedPrompt.slice(0, 80)));
        const nativeFailure =
          historyText.toLowerCase().includes('image upload failed') ||
          historyText.toLowerCase().includes('image not received, please re-upload');
        const hasPendingBlob = Array.from(document.querySelectorAll('img')).some((el) => {
          const src = String(el.getAttribute('src') ?? '');
          if (!src.startsWith('blob:')) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const hasRemoveButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((el) =>
          String(el.getAttribute('aria-label') ?? '').toLowerCase().includes('remove file'),
        );
        return {
          composerText,
          ariaDisabled,
          disabled,
          promptInHistory,
          nativeFailure,
          hasPendingBlob,
          hasRemoveButton,
        };
      },
      GEMINI_PROMPT_SELECTOR,
      GEMINI_SEND_BUTTON_SELECTOR,
      normalizedPrompt,
    );
    lastState = state;

    if (state.promptInHistory || state.nativeFailure) {
      return;
    }

    if (state.composerText.length > 0 && !state.hasPendingBlob && !state.hasRemoveButton) {
      throw new Error('Gemini native attachment disappeared before the prompt committed to history.');
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const detail = lastState
    ? JSON.stringify({
      composerText: normalizeWhitespace(lastState.composerText),
      ariaDisabled: lastState.ariaDisabled,
      disabled: lastState.disabled,
      promptInHistory: lastState.promptInHistory,
      nativeFailure: lastState.nativeFailure,
      hasPendingBlob: lastState.hasPendingBlob,
      hasRemoveButton: lastState.hasRemoveButton,
    })
    : 'unavailable';
  throw new Error(`Gemini prompt did not commit to history before timeout. Last state: ${detail}`);
}

async function submitGeminiPrompt(
  page: Page,
  promptText: string,
  timeoutMs: number,
  options?: { preferButtonFirst?: boolean },
): Promise<void> {
  await waitForGeminiSendReady(page, timeoutMs);
  const clickSend = async () => {
    if (await page.$(GEMINI_SEND_TOUCH_TARGET_SELECTOR)) {
      await page.click(GEMINI_SEND_TOUCH_TARGET_SELECTOR);
    } else {
      await page.click(GEMINI_SEND_BUTTON_SELECTOR);
    }
  };
  const enterSubmit = async () => {
    await page.bringToFront();
    await page.focus(GEMINI_PROMPT_SELECTOR);
    await page.keyboard.press('Enter');
  };
  const evaluateClickSend = async () => {
    await page.evaluate((touchSelector: string, sendSelector: string) => {
      const touchTarget = document.querySelector(touchSelector);
      if (touchTarget instanceof HTMLElement) {
        touchTarget.click();
        return;
      }
      const send = document.querySelector(sendSelector);
      if (send instanceof HTMLElement) send.click();
    }, GEMINI_SEND_TOUCH_TARGET_SELECTOR, GEMINI_SEND_BUTTON_SELECTOR);
  };

  const attempts: Array<() => Promise<void>> = options?.preferButtonFirst
    ? [clickSend, enterSubmit, evaluateClickSend]
    : [enterSubmit, clickSend, evaluateClickSend];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      await attempt();
      await waitForGeminiSubmit(page, promptText, 10_000);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini prompt submit failed.');
}

export async function runGeminiNativeBrowserAttachmentPrompt(options: {
  runOptions: BrowserRunOptions;
  prompt: string;
  geminiUrl: string;
  timeoutMs: number;
  logger?: BrowserLogger;
}): Promise<BrowserRunResult> {
  const startTime = Date.now();
  const logger = options.logger ?? (() => undefined);
  const passiveObservations: BrowserPassiveObservation[] = [];
  const plan = resolveBrowserLaunchPlan({
    source: {
      kind: 'session-config',
      config: { ...(options.runOptions.config ?? {}), target: 'gemini' },
    },
    intent: { provider: 'gemini' },
  });
  const config = structuredClone(plan.launchPolicy) as ResolvedBrowserConfig;
  const userDataDir = plan.managedBrowserProfile.directory;
  const chromeProfile = plan.managedBrowserProfile.configuredProfileName;
  await mkdir(userDataDir, { recursive: true });
  await bootstrapManagedProfile({
    managedProfileDir: userDataDir,
    managedProfileName: chromeProfile,
    sourceCookiePath: plan.sourceBrowserProfile.bootstrapCookiePath,
    logger,
  });

  const chrome = await launchChrome(config, userDataDir, logger);
  const chromeHost = (chrome as { host?: string }).host ?? '127.0.0.1';
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await connectGuardedPuppeteer({
      browserURL: `http://${chromeHost}:${chrome.port}`,
      defaultViewport: null,
    });
    const opened = await openOrReuseChromeTarget(chrome.port, options.geminiUrl, {
      host: chromeHost,
      logger,
      reusePolicy: 'new',
      blankTabLimit: 0,
      mutationSource: 'legacy:gemini-native:connect-tab',
    });
    const targetId = resolveChromeTargetId(opened.target);
    if (!targetId) {
      throw new Error('Gemini native browser run did not get a Chrome target id.');
    }
    page = await waitForPuppeteerPageTarget(browser, targetId, 15_000);
    await closeCompetingGeminiPages(browser, targetId);
    await page.bringToFront();
    if (!config.headless && config.hideWindow && wasChromeLaunchedByAuracall(chrome)) {
      await hideChromeWindow(chrome, logger);
    }

    page = await waitForOwnedGeminiReady({
      browser,
      targetId,
      page,
      selector: GEMINI_PROMPT_SELECTOR,
      timeoutMs: 45_000,
    });
    page = await waitForOwnedGeminiReady({
      browser,
      targetId,
      page,
      selector: GEMINI_UPLOAD_BUTTON_SELECTOR,
      timeoutMs: 45_000,
    });
    if (await isGeminiSignedOut(page)) {
      throw new Error(
        'Gemini login required; the opened Gemini page still shows a visible Sign in state. Finish signing in to gemini.google.com in the managed browser profile, then retry.',
      );
    }

    const attachmentPaths = (options.runOptions.attachments ?? []).map((attachment) => attachment.path);
    const attachmentNames = attachmentPaths.map((filePath) => path.basename(filePath));

    await triggerGeminiFileChooser(page, attachmentPaths);
    await waitForAttachmentPreview(
      page,
      attachmentNames,
      attachmentPaths.some(isLikelyImagePath) ? 45_000 : 20_000,
    );
    if (attachmentPaths.some(isLikelyImagePath)) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }

    await page.click(GEMINI_PROMPT_SELECTOR);
    await clearGeminiPromptText(page);
    await page.keyboard.type(options.prompt);
    const activePage = page;
    const phaseDiagnostics = await captureActionPhaseDiagnostics({
      phases: ['pre-submit'],
      capture: async () => readGeminiAttachmentSubmitDiagnostics(activePage, options.prompt),
    });
    const preSubmitDiagnostics = phaseDiagnostics['pre-submit'];
    logger?.(
      `[gemini-native] pre-submit diagnostics: ${JSON.stringify({
        promptText: normalizeWhitespace(preSubmitDiagnostics.promptText),
        historyHasPrompt: preSubmitDiagnostics.historyHasPrompt,
        visibleBlobCount: preSubmitDiagnostics.visibleBlobCount,
        removeLabels: preSubmitDiagnostics.removeLabels,
        previewNames: preSubmitDiagnostics.previewNames,
        sendReady: preSubmitDiagnostics.sendReady,
      })}`,
    );
    await submitGeminiPrompt(page, options.prompt, 20_000, {
      preferButtonFirst: attachmentPaths.length > 0,
    });
    phaseDiagnostics['post-submit'] = await readGeminiAttachmentSubmitDiagnostics(activePage, options.prompt);
    const postSubmitDiagnostics = phaseDiagnostics['post-submit'];
    logger?.(
      `[gemini-native] post-submit diagnostics: ${JSON.stringify({
        promptText: normalizeWhitespace(postSubmitDiagnostics.promptText),
        historyHasPrompt: postSubmitDiagnostics.historyHasPrompt,
        visibleBlobCount: postSubmitDiagnostics.visibleBlobCount,
        removeLabels: postSubmitDiagnostics.removeLabels,
        previewNames: postSubmitDiagnostics.previewNames,
        sendReady: postSubmitDiagnostics.sendReady,
      })}`,
    );

    const answerText = await waitForGeminiAnswer(page, {
      prompt: options.prompt,
      timeoutMs: options.timeoutMs,
      passiveObservations,
    });
    if (attachmentPaths.some(isLikelyImagePath) && isGeminiAttachmentBlindAnswer(answerText)) {
      phaseDiagnostics.final = await readGeminiAttachmentSubmitDiagnostics(activePage, options.prompt);
      const finalDiagnostics = phaseDiagnostics.final;
      throw new Error(
        `Gemini returned an attachment-blind answer after image submit. Diagnostics: ${JSON.stringify({
          preSubmit: {
            promptText: normalizeWhitespace(preSubmitDiagnostics.promptText),
            historyHasPrompt: preSubmitDiagnostics.historyHasPrompt,
            visibleBlobCount: preSubmitDiagnostics.visibleBlobCount,
            removeLabels: preSubmitDiagnostics.removeLabels,
            previewNames: preSubmitDiagnostics.previewNames,
            sendReady: preSubmitDiagnostics.sendReady,
          },
          postSubmit: {
            promptText: normalizeWhitespace(postSubmitDiagnostics.promptText),
            historyHasPrompt: postSubmitDiagnostics.historyHasPrompt,
            visibleBlobCount: postSubmitDiagnostics.visibleBlobCount,
            removeLabels: postSubmitDiagnostics.removeLabels,
            previewNames: postSubmitDiagnostics.previewNames,
            sendReady: postSubmitDiagnostics.sendReady,
          },
          final: {
            promptText: normalizeWhitespace(finalDiagnostics.promptText),
            historyHasPrompt: finalDiagnostics.historyHasPrompt,
            visibleBlobCount: finalDiagnostics.visibleBlobCount,
            removeLabels: finalDiagnostics.removeLabels,
            previewNames: finalDiagnostics.previewNames,
            sendReady: finalDiagnostics.sendReady,
          },
        })}`,
      );
    }
    const tookMs = Date.now() - startTime;
    recordBrowserPassiveObservation(passiveObservations, {
      state: 'response-complete',
      source: 'browser-service',
      evidenceRef: 'gemini-native-response-finished',
      confidence: 'high',
    });
    return {
      answerText,
      answerMarkdown: answerText,
      tookMs,
      answerTokens: Math.ceil(answerText.length / 4),
      answerChars: answerText.length,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      chromeHost,
      userDataDir,
      passiveObservations,
    };
  } finally {
    if (!config.keepBrowser) {
      await page?.close().catch(() => undefined);
    }
    browser?.disconnect();
    if (!config.keepBrowser && wasChromeLaunchedByAuracall(chrome)) {
      try {
        await chrome.kill();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
