// biome-ignore-all lint/style/useNamingConvention: CDP domains and DOM fixture constructors are case-sensitive.
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { clearDeveloperAppComposerForTest } from "../../src/browser/providers/chatgptDeveloperApps.js";
import {
	ensureChatgptEcosystemMention,
	readChatgptEcosystemMention,
} from "../../src/browser/actions/chatgptEcosystemMention.js";

const ui = vi.hoisted(() => ({
	pressButton: vi.fn(),
	dismissOpenMenus: vi.fn(async () => undefined),
}));
vi.mock("../../src/browser/service/ui.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/service/ui.js")>()),
	...ui,
}));

afterEach(() => vi.useRealTimers());

function capturedComposer(
	legacyId = false,
	options: {
		hidden?: boolean;
		dialog?: boolean;
		count?: number;
		disappear?: boolean;
		label?: string;
	} = {},
) {
	const attributes: Record<string, string> = {
		role: "textbox",
		"aria-label": options.label ?? "Ask ChatGPT",
		"data-composer-markdown": "",
		contenteditable: "true",
		...(legacyId ? { id: "prompt-textarea" } : {}),
	};
	const editor = {
		innerText: "fixture draft",
		focus: vi.fn(),
		getAttribute: (name: string) => attributes[name] ?? null,
		hasAttribute: (name: string) => Object.hasOwn(attributes, name),
		getBoundingClientRect: () => ({ width: 400, height: 60 }),
		closest: (selector: string) =>
			selector.includes("dialog") ? (options.dialog ? {} : null) : {},
		pills: [] as { textContent: string; getAttribute: (name: string) => string | null }[],
		querySelectorAll: (_selector: string) => editor.pills,
	};
	const matches = (selector: string) =>
		selector.split(",").some((raw) => {
			const part = raw.trim();
			const tag = part.match(/^[a-z]+/)?.[0];
			if (tag && tag !== "div") return false;
			const id = part.match(/#([\w-]+)/)?.[1];
			if (id && attributes.id !== id) return false;
			const attrs = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
			const remainder = part
				.replace(/^[a-z]+/, "")
				.replace(/#[\w-]+/, "")
				.replace(/\[[^\]]+\]/g, "")
				.trim();
			return (
				!remainder &&
				attrs.every(
					([, name, value]) =>
						Object.hasOwn(attributes, name) && (value === undefined || attributes[name] === value),
				)
			);
		});
	let present = true;
	const document = {
		getSelection: () => null,
		querySelector: (selector: string) => (present && matches(selector) ? editor : null),
		querySelectorAll: (selector: string) =>
			present && matches(selector) ? Array.from({ length: options.count ?? 1 }, () => editor) : [],
	};
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => ({
		result: {
			value: runInNewContext(expression, {
				location: { href: "https://chatgpt.com/" },
				document,
				window: {
					getComputedStyle: () => ({
						display: "block",
						visibility: options.hidden ? "hidden" : "visible",
					}),
				},
			}),
		},
	}));
	const dispatchKeyEvent = vi.fn(async ({ type, key }: { type: string; key: string }) => {
		if (type === "keyDown" && key === "Backspace") {
			editor.innerText = "";
			if (options.disappear) present = false;
		}
	});
	return { editor, document, client: { Runtime: { evaluate }, Input: { dispatchKeyEvent } } };
}

test.each([
	false,
	true,
])("clears the captured rich composer through trusted input (legacy ID: %s)", async (legacyId) => {
	vi.useFakeTimers();
	const { editor, client } = capturedComposer(legacyId);
	const pending = clearDeveloperAppComposerForTest(client as never).then(
		() => null,
		(error: unknown) => error,
	);
	await vi.runAllTimersAsync();
	expect(await pending).toBeNull();
	expect(editor.focus).toHaveBeenCalledOnce();
	expect(editor.innerText).toBe("");
	expect(client.Input.dispatchKeyEvent).toHaveBeenCalledTimes(6);
});

test.each([
	{ hidden: true },
	{ dialog: true },
	{ count: 2 },
	{ label: "Unrelated editor" },
])("rejects an unqualified composer before trusted input: %j", async (options) => {
	vi.useFakeTimers();
	const { client } = capturedComposer(false, options);
	const pending = clearDeveloperAppComposerForTest(client as never).then(
		() => null,
		(error: unknown) => error,
	);
	await vi.runAllTimersAsync();
	expect(await pending).toEqual(
		expect.objectContaining({ message: expect.stringContaining("editor was not found") }),
	);
	expect(client.Input.dispatchKeyEvent).not.toHaveBeenCalled();
});

test("does not report a disappeared composer as successfully cleared", async () => {
	vi.useFakeTimers();
	const { client } = capturedComposer(false, { disappear: true });
	const pending = clearDeveloperAppComposerForTest(client as never).then(
		() => null,
		(error: unknown) => error,
	);
	await vi.runAllTimersAsync();
	expect(await pending).toEqual(
		expect.objectContaining({ message: "ChatGPT composer text could not be cleared safely." }),
	);
});

test("reads exact app identity from the captured rich composer and rejects multiple pills", async () => {
	const { editor, client } = capturedComposer();
	const pill = {
		textContent: "LitScout",
		getAttribute: (name: string) =>
			({ "data-symbol": "ecosystemMention", "data-id": "plugin:asdk_fixture" })[name] ?? null,
	};
	editor.pills = [pill];
	expect(await readChatgptEcosystemMention(client as never)).toEqual({
		label: "LitScout",
		pluginId: "plugin:asdk_fixture",
	});
	editor.pills = [pill, pill];
	expect(await readChatgptEcosystemMention(client as never)).toBeNull();
});

test.each([
	{
		description: "Literature research with durable session provenance.",
		duplicate: false,
		selected: true,
	},
	{ description: null, duplicate: false, selected: false },
	{
		description: "Literature research with durable session provenance.",
		duplicate: true,
		selected: false,
	},
])("qualifies the captured app button and excludes same-name custom GPTs: %j", async ({
	description,
	duplicate,
	selected,
}) => {
	vi.useFakeTimers();
	const { editor, document, client } = capturedComposer();
	editor.innerText = "";
	const makeButton = (text: string) => {
		const attrs: Record<string, string> = { class: "min-h-[var(--app-menu-item-height,0px)]" };
		return {
			innerText: text,
			textContent: text,
			getAttribute: (name: string) => attrs[name] ?? null,
			hasAttribute: (name: string) => Object.hasOwn(attrs, name),
			setAttribute: (name: string, value: string) => {
				attrs[name] = value;
			},
			removeAttribute: (name: string) => {
				delete attrs[name];
			},
			getBoundingClientRect: () => ({ width: 500, height: 40 }),
			matches: (selector: string) =>
				selector.split(",").some((raw) => {
					const part = raw.trim();
					if (part === "button") return true;
					const match = part.match(/^(?:button)?\[([\w-]+)(\*=|=)?(?:"([^"]*)")?\]$/);
					return Boolean(
						match &&
							Object.hasOwn(attrs, match[1]) &&
							(!match[2] ||
								(match[2] === "*="
									? attrs[match[1]].includes(match[3])
									: attrs[match[1]] === match[3])),
					);
				}),
		};
	};
	const app = makeButton("LitScout\nLiterature research with durable session provenance.");
	const customGpt = makeButton("LitScout");
	let rendered = false;
	setTimeout(() => {
		rendered = true;
	}, 300);
	const oldQuery = document.querySelectorAll;
	document.querySelectorAll = ((selector: string) => {
		const buttons = (
			rendered ? [customGpt, app, ...(duplicate ? [makeButton(app.innerText)] : [])] : [customGpt]
		).filter((node) => node.matches(selector));
		return buttons.length ? buttons : oldQuery(selector);
	}) as typeof document.querySelectorAll;
	const clicked: unknown[] = [];
	ui.pressButton.mockReset();
	ui.pressButton.mockImplementation(async (_runtime, options) => {
		const candidates = document.querySelectorAll(options.selector);
		const node = candidates[0];
		if (!node) return { ok: false, reason: `Visible selector not found: ${options.selector}` };
		if (node === editor) return { ok: true };
		clicked.push(node);
		editor.pills = [
			{
				textContent: "LitScout",
				getAttribute: (name) =>
					({ "data-symbol": "ecosystemMention", "data-id": "plugin:asdk_fixture" })[name] ?? null,
			},
		];
		return { ok: true, matchedLabel: node.innerText };
	});
	const insertText = vi.fn(async ({ text }: { text: string }) => {
		editor.innerText = text;
	});
	const pending = ensureChatgptEcosystemMention({ ...client, Input: { insertText } } as never, {
		label: "LitScout",
		acceptedPluginIds: ["asdk_fixture"],
		description,
	}).then(
		() => null,
		(error: unknown) => error,
	);
	await vi.runAllTimersAsync();
	if (selected) {
		expect(await pending).toBeNull();
		expect(clicked).toEqual([app]);
	} else {
		expect(await pending).toEqual(
			expect.objectContaining({
				message: expect.stringContaining("No unique ChatGPT app mention option"),
			}),
		);
		expect(clicked).toEqual([]);
	}
	expect(editor.focus).toHaveBeenCalledOnce();
	expect(insertText).toHaveBeenCalledExactlyOnceWith({ text: "@LitScout" });
});
