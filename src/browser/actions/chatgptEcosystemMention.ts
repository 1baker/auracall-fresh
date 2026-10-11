import {
	buildChatgptAppComposerLookup,
	CHATGPT_APP_COMPOSER_SELECTORS,
} from "./chatgptComposer.js";
import { dismissOpenMenus, pressButton, waitForPredicate } from "../service/ui.js";
import type { ChromeClient } from "../types.js";

export interface ChatgptEcosystemMentionRequest {
	label: string;
	acceptedPluginIds: string[];
	/** Current picker rows require the installed description to exclude same-name custom GPTs. */
	description?: string | null;
	/** Developer-app tests require a new chat; connected capabilities may use an empty composer in a bound conversation. */
	requireFreshConversation?: boolean;
}

export interface ChatgptEcosystemMentionSelection {
	label: string | null;
	pluginId: string | null;
}

export async function readChatgptEcosystemMention(
	client: ChromeClient,
): Promise<ChatgptEcosystemMentionSelection | null> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = ${buildChatgptAppComposerLookup()};
      if (!editor) return null;
      const pills = Array.from(editor.querySelectorAll('[data-inline-selection-pill]'));
      const ecosystem = pills.filter((pill) => pill.getAttribute('data-symbol') === 'ecosystemMention');
      const documents = pills.filter((pill) => pill.getAttribute('data-symbol') === 'documentReference');
      if (ecosystem.length !== 1 || documents.length !== 0) return null;
      const pill = ecosystem[0];
      return {
        label: String(pill.textContent || '').replace(/\\s+/g, ' ').trim() || null,
        pluginId: pill.getAttribute('data-system-hint-type') || pill.getAttribute('data-id') || null,
      };
    })()`,
		returnByValue: true,
	});
	return isRecord(result.result?.value)
		? {
				label: readString(result.result.value.label),
				pluginId: readString(result.result.value.pluginId),
			}
		: null;
}

export async function ensureChatgptEcosystemMention(
	client: ChromeClient,
	request: ChatgptEcosystemMentionRequest,
): Promise<void> {
	const acceptedPluginIds = request.acceptedPluginIds.map(normalizeAppIdentity).filter(Boolean);
	if (!request.label.trim() || acceptedPluginIds.length === 0) {
		throw new Error("ChatGPT ecosystem mention requires a label and at least one app identity.");
	}
	await selectChatgptEcosystemMention(client, request, acceptedPluginIds);
}

async function selectChatgptEcosystemMention(
	client: ChromeClient,
	request: ChatgptEcosystemMentionRequest,
	acceptedPluginIds: string[],
): Promise<void> {
	const requireFreshConversation = request.requireFreshConversation !== false;
	const pristine = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = ${buildChatgptAppComposerLookup()};
      if (!editor) return false;
      const text = String(editor.innerText || '').trim();
      const pills = editor.querySelectorAll('[data-inline-selection-pill]');
      const turns = document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]');
      return text.length === 0 && pills.length === 0
        && (${JSON.stringify(requireFreshConversation)} ? turns.length === 0 : true);
    })()`,
		returnByValue: true,
	});
	if (pristine.result?.value !== true) {
		throw new Error(
			`ChatGPT app ${request.label} requires an empty pill-free composer${requireFreshConversation ? " in a fresh chat" : ""} before selection.`,
		);
	}

	await dismissOpenMenus(client.Runtime);
	const focused = await pressButton(client.Runtime, {
		selector: CHATGPT_APP_COMPOSER_SELECTORS.join(", "),
		interactionStrategies: ["pointer"],
		requireVisible: true,
		timeoutMs: 5_000,
	});
	if (!focused.ok) {
		throw new Error("Unable to focus the blank ChatGPT composer for app selection.");
	}
	const selectionFocus = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = ${buildChatgptAppComposerLookup()};
      if (!editor) return false;
      editor.focus();
      const selection = document.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return true;
    })()`,
		returnByValue: true,
	});
	if (selectionFocus.result?.value !== true) {
		throw new Error("ChatGPT composer changed before app selection.");
	}
	await client.Input.insertText({ text: `@${request.label}` });
	const choice = await waitForPredicate(client.Runtime, buildAppMentionChoiceExpression(request), {
		timeoutMs: 8_000,
		description: "exact ChatGPT app mention option",
	});
	if (!choice.ok) {
		throw new Error(`No unique ChatGPT app mention option qualified for ${request.label}.`);
	}
	const selected = await pressButton(client.Runtime, {
		selector: '[data-auracall-app-mention-choice="true"]',
		interactionStrategies: ["pointer"],
		requireVisible: true,
		postSelector: CHATGPT_APP_COMPOSER_SELECTORS.map(
			(selector) => `${selector} [data-inline-selection-pill][data-symbol="ecosystemMention"]`,
		).join(", "),
		timeoutMs: 8_000,
	});
	const mention = await readChatgptEcosystemMention(client);
	if (
		!selected.ok ||
		!normalize(selected.matchedLabel).includes(normalize(request.label)) ||
		!mention ||
		!acceptedPluginIds.includes(normalizeAppIdentity(mention.pluginId))
	) {
		const diagnostic = await readMentionPickerDiagnostic(client);
		throw new Error(
			`Unable to select ChatGPT developer app ${request.label} from the composer mention picker: ${selected.reason ?? "exact app pill not verified"} (${diagnostic}).`,
		);
	}
}

function buildAppMentionChoiceExpression(request: ChatgptEcosystemMentionRequest): string {
	return `(() => {
    const marker = 'data-auracall-app-mention-choice';
    document.querySelectorAll('[' + marker + ']').forEach((node) => node.removeAttribute(marker));
    const editor = ${buildChatgptAppComposerLookup()};
    if (!editor || String(editor.innerText || '').trim() !== ${JSON.stringify(`@${request.label}`)}) return false;
    const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const label = ${JSON.stringify(normalize(request.label).replace(/\s+/g, " "))};
    const description = ${JSON.stringify(normalize(request.description).replace(/\s+/g, " "))};
    const currentSelector = 'button[class*="--app-menu-item-height"]';
    const candidates = Array.from(document.querySelectorAll('.popover .__menu-item[tabindex], ' + currentSelector)).filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden'
        || node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') return false;
      const text = String(node.innerText || node.textContent || '');
      if (node.matches(currentSelector)) return Boolean(description) && normalize(text) === label + ' ' + description;
      return normalize(text.split('\\n')[0]) === label;
    });
    if (candidates.length !== 1) return false;
    candidates[0].setAttribute(marker, 'true');
    return true;
  })()`;
}

export async function assertChatgptEcosystemMentionSelected(
	client: ChromeClient,
	request: ChatgptEcosystemMentionRequest,
): Promise<void> {
	const selected = await readChatgptEcosystemMention(client);
	const accepted = request.acceptedPluginIds.map(normalizeAppIdentity).filter(Boolean);
	if (!selected || !accepted.includes(normalizeAppIdentity(selected.pluginId))) {
		throw new Error(`ChatGPT developer app ${request.label} selection changed before Send.`);
	}
}

function normalizeAppIdentity(value: string | null | undefined): string {
	return normalize(value)
		.replace(/^plugin:/, "")
		.replace(/^plugin_/, "");
}

function normalize(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readMentionPickerDiagnostic(client: ChromeClient): Promise<string> {
	const result = await client.Runtime.evaluate({
		expression: `JSON.stringify({
      url: location.href,
      editorText: (${buildChatgptAppComposerLookup()})?.innerText || '',
      activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
      popovers: Array.from(document.querySelectorAll('.popover,[role="listbox"],[role="menu"]'))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((node) => String(node.textContent || '').trim().slice(0, 240)),
    })`,
		returnByValue: true,
	});
	return readString(result.result?.value) ?? "no composer diagnostic available";
}
