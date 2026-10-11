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
	return { editor, client: { Runtime: { evaluate }, Input: { dispatchKeyEvent } } };
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

test("selects and verifies the exact app through the current rich editor", async () => {
	const { editor, client } = capturedComposer();
	editor.innerText = "";
	const insertText = vi.fn(async () => undefined);
	ui.pressButton.mockReset();
	ui.pressButton.mockResolvedValueOnce({ ok: true }).mockImplementationOnce(async () => {
		editor.pills = [
			{
				textContent: "LitScout",
				getAttribute: (name) =>
					({ "data-symbol": "ecosystemMention", "data-id": "plugin:asdk_fixture" })[name] ?? null,
			},
		];
		return { ok: true, matchedLabel: "LitScout" };
	});
	await ensureChatgptEcosystemMention({ ...client, Input: { insertText } } as never, {
		label: "LitScout",
		acceptedPluginIds: ["asdk_fixture"],
	});
	expect(insertText).toHaveBeenCalledExactlyOnceWith({ text: "@LitScout" });
	expect(editor.focus).toHaveBeenCalledOnce();
});
