/** Precise rich-editor shape shared by conversation reads and app mention input. */
export const CHATGPT_RICH_PROMPT_INPUT_SELECTOR =
	'div[data-composer-markdown][contenteditable="true"][role="textbox"][aria-label="Ask ChatGPT"]';

export const CHATGPT_APP_COMPOSER_SELECTORS = [
	'#prompt-textarea[contenteditable="true"]',
	CHATGPT_RICH_PROMPT_INPUT_SELECTOR,
];

/** Resolve exactly one visible, enabled composer, excluding modal editors. */
export function buildChatgptAppComposerLookup(): string {
	return `(() => {
    const candidates = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_APP_COMPOSER_SELECTORS.join(", "))})).filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0
        && style.visibility !== 'hidden' && style.display !== 'none'
        && !node.closest('[role="dialog"], dialog')
        && !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true'
        && Boolean(node.closest('form, [data-testid*="composer"], [data-chatgpt-composer]'));
    });
    return candidates.length === 1 ? candidates[0] : null;
  })()`;
}
