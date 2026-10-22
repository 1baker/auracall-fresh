import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { createConfiguredFrontendService } from "../src/browser/frontends/config.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import type { FrontendRoute } from "../src/browser/frontends/types.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	setAuracallHomeDirOverrideForTest(null);
	vi.restoreAllMocks();
});

// Synthetic semantic UI contract only; no claim of observed Claude DOM.
async function fixture(provider = "claude", startUrl = "https://claude.ai/new") {
	const home = await mkdtemp(join(tmpdir(), "auracall-claude-"));
	setAuracallHomeDirOverrideForTest(home);
	const { document, window } = parseHTML(
		'<html><body><button aria-label="Account menu"></button><main><section id="messages"></section><form><div class="ProseMirror" role="textbox" contenteditable="true" aria-label="Write your prompt to Claude"></div><button type="button" data-testid="model-selector-dropdown" aria-expanded="false">Fable fixture</button><span aria-label="Effort">High</span><button type="button" aria-label="Send message">Send</button></form><div role="menu" hidden id="model-menu"><button role="menuitem" id="effort-menu-trigger">Effort</button></div><div role="menu" hidden id="effort-menu"></div></main></body></html>',
	);
	const get = (selector: string) => {
		const node = document.querySelector(selector);
		if (!node) throw new Error(`Missing fixture node ${selector}`);
		return node;
	};
	const composer = get("[contenteditable]");
	const choices = get("#effort-menu");
	for (const label of ["Low", "Medium", "High", "Extra high", "Max"]) {
		const node = document.createElement("button");
		node.setAttribute("role", "menuitemradio");
		node.setAttribute("aria-checked", String(label === "High"));
		node.textContent = label;
		choices.append(node);
	}
	const rect = (node: Element) => {
		const index = Array.from(document.querySelectorAll("*")).indexOf(node);
		return {
			x: 10 + index * 4,
			y: 20,
			left: 10 + index * 4,
			top: 20,
			right: 12 + index * 4,
			bottom: 22,
			width: 2,
			height: 2,
		};
	};
	Object.defineProperty(window.Element.prototype, "getClientRects", {
		configurable: true,
		value(this: Element) {
			return [rect(this)];
		},
	});
	Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
		configurable: true,
		value(this: Element) {
			return rect(this);
		},
	});
	let overlay = false,
		sticky = false,
		clicks = 0,
		fills = 0,
		probes = 0,
		clock = 100000;
	let url = startUrl;
	Object.defineProperty(document, "elementFromPoint", {
		configurable: true,
		value(x: number) {
			return overlay
				? document.body
				: Array.from(document.querySelectorAll("*")).find(
						(n) => Math.abs(rect(n).left + 1 - x) < 0.1,
					);
		},
	});
	vi.spyOn(Date, "now").mockImplementation(() => clock);
	let fillRelease: (() => void) | undefined;
	let fillStarted: (() => void) | undefined;
	const started = new Promise<void>((resolve) => {
		fillStarted = resolve;
	});
	const handle = {
		valid: true,
		browserId: "claude-browser",
		sessionName: "claude-session",
		profileId: "claude-profile",
		tabId: "claude-tab",
		targetId: "claude-target",
	};
	const route = {
		id: "claude",
		provider,
		expectedUrl: startUrl,
		expectedModel: "Fable fixture",
		serviceTabHandle: handle,
		profileCapabilityEnv: "FIXTURE_CAPABILITY",
	} as FrontendRoute;
	const broker = async (request: Record<string, unknown>) => {
		expect(request.serviceTabHandle).toEqual(handle);
		expect(request.repairPolicy).toBe("reject_only");
		expect(request.profileLeasePolicy).toBe("reject");
		const common = { ok: true, targetId: handle.targetId, url };
		if (request.action === "probe") {
			probes++;
			const detector = (request.probe as { detectors: { id: string; expression: string }[] })
				.detectors[0];
			return {
				...common,
				detectors: [
					{
						id: detector.id,
						ok: true,
						resultTruncated: false,
						result: runInNewContext(detector.expression, {
							document,
							location: { href: url },
							innerWidth: 2000,
							innerHeight: 800,
						}),
					},
				],
			};
		}
		expect(request.action).toBe("ui_action");
		const step = (
			request.uiAction as { steps: { type: string; selector: string; value?: string }[] }
		).steps[0];
		const node = get(step.selector);
		if (step.type === "fill") {
			fills++;
			composer.textContent = String(step.value);
			fillStarted?.();
			if (fillRelease)
				await new Promise<void>((resolve) => {
					fillRelease = resolve;
				});
		} else {
			expect(step.type).toBe("click");
			clicks++;
			if (node === get('[data-testid="model-selector-dropdown"]')) {
				const menu = get("#model-menu");
				if (menu.hasAttribute("hidden")) {
					menu.removeAttribute("hidden");
					node.setAttribute("aria-expanded", "true");
				} else {
					menu.setAttribute("hidden", "");
					choices.setAttribute("hidden", "");
					node.setAttribute("aria-expanded", "false");
				}
			} else if (node.id === "effort-menu-trigger") choices.removeAttribute("hidden");
			else if (node.getAttribute("role") === "menuitemradio") {
				if (!sticky) {
					for (const child of choices.children)
						child.setAttribute("aria-checked", String(child === node));
					get('[aria-label="Effort"]').textContent = node.textContent;
				}
				choices.setAttribute("hidden", "");
				get("#model-menu").setAttribute("hidden", "");
				get('[data-testid="model-selector-dropdown"]').setAttribute("aria-expanded", "false");
			} else {
				expect(node.getAttribute("aria-label")).toBe("Send message");
				const text = composer.textContent ?? "";
				const count = document.querySelectorAll('[data-testid="user-message"]').length;
				for (const [role, value] of [
					["user", text],
					[
						"assistant",
						count === 0
							? "CLAUDE-BLUE"
							: text.includes("CLAUDE-BLUE")
								? "CLAUDE-BLUE CONNECTED"
								: "CONTEXT LOST",
					],
				]) {
					const row = document.createElement("div");
					row.setAttribute("data-testid", `${role}-message`);
					row.textContent = value;
					get("#messages").append(row);
				}
				composer.textContent = "";
				url = "https://claude.ai/chat/fixture-conversation";
			}
		}
		return { ...common, steps: [{ index: 0, type: step.type, ok: true }] };
	};
	let service: FrontendService, client: Client, server: McpServer;
	const start = async () => {
		service = new FrontendService([route], broker);
		server = new McpServer({ name: "claude-semantic-fixture", version: "1" });
		registerFrontendTools(server, service);
		client = new Client({ name: "claude-public-client", version: "1" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await server.connect(a);
		await client.connect(b);
	};
	await start();
	cleanups.push(async () => {
		fillRelease?.();
		await client.close();
		await server.close();
		await rm(home, { recursive: true, force: true });
	});
	const call = (name: string, args: Record<string, unknown> = {}) =>
		client.callTool({ name, arguments: { routeId: "claude", ...args } });
	return {
		home,
		route,
		document,
		get,
		composer,
		call,
		stats: () => ({ clicks, fills, probes }),
		block: () => {
			overlay = true;
		},
		sticky: () => {
			sticky = true;
		},
		tick: () => {
			clock += 1100;
		},
		holdFill: () => {
			fillRelease = () => {};
			return started;
		},
		releaseFill: () => fillRelease?.(),
		restart: async () => {
			await client.close();
			await server.close();
			await start();
		},
	};
}

describe("Claude through public frontend MCP (synthetic, unverified UI grounding)", () => {
	it("loads an explicit Claude route without connecting or reading a capability", async () => {
		const f = await fixture();
		const path = join(f.home, "frontend.json");
		await writeFile(
			path,
			JSON.stringify({ brokerBaseUrl: "http://127.0.0.1:1", routes: [f.route] }),
		);
		const key = "AURACALL_FRONTEND_CONFIG";
		const service = await createConfiguredFrontendService({ [key]: path });
		expect(service.routes[0].provider).toBe("claude");
	});
	it.each([
		["Low", "low"],
		["Medium", "medium"],
		["High", "high"],
		["Extra high", "xhigh"],
		["Max", "max"],
	])("selects visible %s and verifies %s", async (label, effort) => {
		const f = await fixture();
		const result = await f.call("frontend_configure", { effort });
		expect(result.structuredContent).toMatchObject({
			ok: true,
			provider: "claude",
			effort,
			verified: true,
			grounding: "unverified-grounding",
		});
		expect(f.get('[aria-label="Effort"]').textContent).toBe(label);
		expect(f.stats().fills).toBe(0);
		expect(f.document.querySelectorAll('[data-testid="user-message"]').length).toBe(0);
	});
	it("returns typed unsupported when the model has no Effort menu", async () => {
		const f = await fixture();
		f.get("#effort-menu-trigger").remove();
		f.get('[aria-label="Effort"]').remove();
		expect((await f.call("frontend_configure", { effort: "max" })).structuredContent).toMatchObject(
			{ ok: false, code: "effort_unsupported_for_model" },
		);
		expect(f.stats().fills).toBe(0);
	});
	it("does not translate a nearby or unknown effort label", async () => {
		const f = await fixture();
		f.get('[aria-label="Effort"]').textContent = "Maximum";
		expect((await f.call("frontend_configure", { effort: "max" })).structuredContent).toMatchObject(
			{ ok: false, code: "effort_unsupported_for_model" },
		);
		expect(f.stats().clicks).toBe(0);
	});
	it("requires changed visible readback rather than a successful click", async () => {
		const f = await fixture();
		f.sticky();
		expect((await f.call("frontend_configure", { effort: "max" })).structuredContent).toMatchObject(
			{ ok: false, code: "readback_mismatch" },
		);
	});
	it.each([
		["chatgpt", "https://chatgpt.com/", "max"],
		["grok", "https://grok.com/", "max"],
		["claude", "https://claude.ai/new", "pro"],
	])("rejects a cross-provider effort on %s before effects", async (provider, url, effort) => {
		const f = await fixture(provider, url);
		expect((await f.call("frontend_configure", { effort })).structuredContent).toMatchObject({
			ok: false,
			code: provider === "grok" ? "controls_unsupported" : "unknown_effort",
		});
		expect(f.stats()).toEqual({ clicks: 0, fills: 0, probes: 0 });
	});
	it.each([
		"https://example.test/new",
		"https://claude.ai/login",
		"https://claude.ai/new?x=1",
		"https://claude.ai/new#x",
		"http://claude.ai/new",
		"https://claude.ai.evil.test/new",
	])("rejects unsafe configured URL %s", async (url) => {
		const f = await fixture("claude", url);
		expect((await f.call("frontend_inspect")).structuredContent).toMatchObject({
			ok: false,
			code: "origin_mismatch",
		});
		expect(f.stats()).toEqual({ clicks: 0, fills: 0, probes: 0 });
	});
	it.each([
		"draft",
		"dialog",
		"challenge",
		"login",
		"generation",
		"composer-missing",
		"model-mismatch",
		"overlay",
	])("refuses %s before native input", async (kind) => {
		const f = await fixture();
		if (kind === "draft") f.composer.textContent = "PRIVATE DRAFT";
		if (kind === "dialog") {
			const n = f.document.createElement("div");
			n.setAttribute("role", "dialog");
			f.document.body.append(n);
		}
		if (kind === "challenge") {
			const n = f.document.createElement("iframe");
			n.setAttribute("src", "https://challenges.cloudflare.com/");
			f.document.body.append(n);
		}
		if (kind === "login") {
			const n = f.document.createElement("button");
			n.textContent = "Sign in";
			f.document.body.append(n);
		}
		if (kind === "generation") f.get("main").setAttribute("aria-busy", "true");
		if (kind === "composer-missing") f.composer.remove();
		if (kind === "model-mismatch")
			f.get('[data-testid="model-selector-dropdown"]').textContent = "Other model";
		if (kind === "overlay") f.block();
		const codes: Record<string, string> = {
			draft: "composer_busy",
			dialog: "composer_busy",
			challenge: "human_verification",
			login: "login_required",
			generation: "composer_busy",
			"composer-missing": "composer_unavailable",
			"model-mismatch": "model_drift",
			overlay: "blocked_overlay",
		};
		expect(
			(await f.call("frontend_send", { requestId: "unsafe-claude-01", text: "public marker" }))
				.structuredContent,
		).toMatchObject({ ok: false, code: codes[kind] });
		expect(f.stats().fills).toBe(0);
		expect(f.stats().clicks).toBe(0);
	});
	it("reports a possibly open menu on a refused effort without automatic cleanup", async () => {
		const f = await fixture();
		const max = Array.from(f.get("#effort-menu").children).find((n) => n.textContent === "Max");
		if (!max) throw new Error("Missing Max fixture");
		max.setAttribute("aria-disabled", "true");
		const result = await f.call("frontend_configure", { effort: "max" });
		expect(result.structuredContent).toMatchObject({
			ok: false,
			code: "effort_unavailable",
			menuMayBeOpen: true,
		});
		expect(f.get('[data-testid="model-selector-dropdown"]').getAttribute("aria-expanded")).toBe(
			"true",
		);
		expect(f.stats().clicks).toBe(2);
		expect(f.stats().fills).toBe(0);
	});
	it("refuses Send while the visible model menu remains open", async () => {
		const f = await fixture();
		f.get("#model-menu").removeAttribute("hidden");
		f.get('[data-testid="model-selector-dropdown"]').setAttribute("aria-expanded", "true");
		expect(
			(await f.call("frontend_send", { requestId: "menu-open-claude", text: "NO SEND" }))
				.structuredContent,
		).toMatchObject({ ok: false, code: "composer_busy" });
		expect(f.stats().fills).toBe(0);
		expect(f.stats().clicks).toBe(0);
	});
	it("saves two linked replies and recovers identical receipts after restart without replay", async () => {
		const f = await fixture();
		expect(
			(
				await f.call("frontend_send", {
					requestId: "claude-first-01",
					text: "Remember CLAUDE-BLUE",
				})
			).structuredContent,
		).toMatchObject({ status: "sent" });
		expect(
			(await f.call("frontend_status", { requestId: "claude-first-01" })).structuredContent,
		).toMatchObject({ status: "sent" });
		f.tick();
		const first = await f.call("frontend_status", { requestId: "claude-first-01" });
		expect(first.structuredContent).toMatchObject({
			status: "completed",
			output: "CLAUDE-BLUE",
			identityKind: "derived_sequence",
			userMessageId: null,
			assistantMessageId: null,
		});
		const text = `Use actual prior reply ${(first.structuredContent as { output: string }).output}`;
		await f.call("frontend_send", {
			requestId: "claude-second-01",
			previousRequestId: "claude-first-01",
			text,
		});
		await f.call("frontend_status", { requestId: "claude-second-01" });
		f.tick();
		const second = await f.call("frontend_status", { requestId: "claude-second-01" });
		expect(second.structuredContent).toMatchObject({
			status: "completed",
			output: "CLAUDE-BLUE CONNECTED",
			previousRequestId: "claude-first-01",
		});
		const path = join(f.home, "frontend-requests/claude-second-01.json");
		const before = await readFile(path);
		const counts = f.stats();
		await f.restart();
		expect(await f.call("frontend_status", { requestId: "claude-second-01" })).toEqual(second);
		expect(
			await f.call("frontend_send", {
				requestId: "claude-second-01",
				previousRequestId: "claude-first-01",
				text,
			}),
		).toEqual(second);
		expect(await readFile(path)).toEqual(before);
		expect(f.stats()).toEqual(counts);
		expect(counts.fills).toBe(2);
	});
	it("shares the durable target lock between a pending Send and control changes", async () => {
		const f = await fixture();
		const started = f.holdFill();
		const send = f.call("frontend_send", { requestId: "claude-lock-01", text: "ONE" });
		await started;
		expect((await f.call("frontend_configure", { effort: "max" })).structuredContent).toMatchObject(
			{ ok: false, code: "lock_held" },
		);
		f.releaseFill();
		expect((await send).structuredContent).toMatchObject({ status: "sent" });
		expect(f.stats().clicks).toBe(1);
	});
});
