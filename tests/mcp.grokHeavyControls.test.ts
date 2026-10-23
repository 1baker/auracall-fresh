import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	setAuracallHomeDirOverrideForTest(null);
	vi.restoreAllMocks();
});

// Synthetic browser boundary only; evaluates the production serialized DOM recipe.
async function fixture(expectedModel = "Heavy") {
	const home = await mkdtemp(join(tmpdir(), "auracall-heavy-"));
	setAuracallHomeDirOverrideForTest(home);
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	const { document, window } = parseHTML(
		'<html><body><button aria-label="Account menu"></button><main><section id="messages"></section><form><div contenteditable="true" role="combobox" aria-label="Ask Grok anything"></div><button id="picker" type="button" aria-label="Model: Fast" aria-expanded="false"></button><button type="button" aria-label="Enter voice mode"></button></form><div role="menu" id="menu" hidden><button id="heavy" role="menuitemradio" aria-checked="false">Heavy</button></div></main></body></html>',
	);
	const get = (selector: string) => {
		const node = document.querySelector(selector);
		if (!node) throw new Error(`Missing fixture element ${selector}`);
		return node;
	};
	const rect = (node: Element) => {
		const x = 10 + Array.from(document.querySelectorAll("*")).indexOf(node) * 3;
		return { x, y: 10, left: x, top: 10, right: x + 2, bottom: 12, width: 2, height: 2 };
	};
	Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
		configurable: true,
		value(this: Element) {
			return rect(this);
		},
	});
	Object.defineProperty(window.Element.prototype, "getClientRects", {
		configurable: true,
		value(this: Element) {
			return [rect(this)];
		},
	});
	let overlay = false,
		sticky = false,
		uncertain = false,
		clicks = 0,
		probes = 0,
		sends = 0,
		clock = 100000;
	let url = "https://grok.com/";
	let afterClick: (() => void) | undefined;
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
	const handle = {
		valid: true,
		browserId: "heavy-browser",
		targetId: "heavy-target",
		tabId: "heavy-tab",
		profileId: "heavy-profile",
		sessionName: "heavy-session",
	};
	const route = {
		id: "heavy",
		provider: "grok" as const,
		expectedUrl: url,
		expectedModel,
		serviceTabHandle: handle,
		profileCapabilityEnv: "FIXTURE_CAPABILITY",
	};
	const broker = async (request: Record<string, unknown>) => {
		expect(request.serviceTabHandle).toEqual(handle);
		expect(request.repairPolicy).toBe("reject_only");
		expect(request.profileLeasePolicy).toBe("reject");
		if (request.action === "probe") {
			probes++;
			const detector = (request.probe as { detectors: { id: string; expression: string }[] })
				.detectors[0];
			return {
				ok: true,
				targetId: handle.targetId,
				url,
				detectors: [
					{
						id: detector.id,
						ok: true,
						resultTruncated: false,
						result: runInNewContext(detector.expression, {
							document,
							location: { href: url },
							innerWidth: 1000,
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
		const nodes = document.querySelectorAll(step.selector);
		expect(nodes).toHaveLength(1);
		const node = nodes[0];
		if (step.type === "fill") {
			get("[contenteditable]").textContent = step.value ?? "";
			get("form").insertAdjacentHTML(
				"beforeend",
				'<button type="submit" aria-label="Send message"></button>',
			);
		} else {
			expect(step.type).toBe("click");
			clicks++;
			if (node.id === "picker") {
				const open = node.getAttribute("aria-expanded") !== "true";
				node.setAttribute("aria-expanded", String(open));
				get("#menu").toggleAttribute("hidden", !open);
			} else if (node.id === "heavy") {
				if (!sticky) {
					get("#picker").setAttribute("aria-label", "Model: Heavy");
					get("#picker").setAttribute("aria-expanded", "false");
					get("#menu").setAttribute("hidden", "");
					node.setAttribute("aria-checked", "true");
				}
			} else {
				expect(node.getAttribute("type")).toBe("submit");
				sends++;
				url = "https://grok.com/c/heavy-fixture";
				const composer = get("[contenteditable]");
				for (const [role, text] of [
					["user", composer.textContent],
					["assistant", sends === 1 ? "HEAVY-FIXTURE-17" : "HEAVY-FIXTURE-17 remembered"],
				]) {
					const row = document.createElement("div");
					row.className = role === "user" ? "items-end" : "items-start";
					const content = document.createElement("div");
					content.className = role === "user" ? "message-bubble" : "response-content-markdown";
					content.textContent = text;
					row.append(content);
					get("#messages").append(row);
				}
				composer.textContent = "";
				node.remove();
			}
			afterClick?.();
			if (uncertain) throw new Error("Fixture input response lost");
		}
		return {
			ok: true,
			targetId: handle.targetId,
			url,
			steps: [{ index: 0, type: step.type, ok: true }],
		};
	};
	const service = new FrontendService([route], broker);
	const server = new McpServer({ name: "heavy-fixture", version: "1" });
	registerFrontendTools(server, service);
	const client = new Client({ name: "heavy-fixture-caller", version: "1" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(b);
	await client.connect(a);
	cleanups.push(async () => {
		await client.close();
		await server.close();
	});
	const call = async (name: string, args: Record<string, unknown> = {}) =>
		(await client.callTool({ name, arguments: { routeId: route.id, ...args } }))
			.structuredContent as Record<string, unknown>;
	return {
		call,
		get,
		document,
		route,
		stats: () => ({ clicks, probes, sends }),
		advance: () => {
			clock += 2000;
		},
		setOverlay: () => {
			overlay = true;
		},
		setSticky: () => {
			sticky = true;
		},
		setUncertain: () => {
			uncertain = true;
		},
		afterClick: (fn: () => void) => {
			afterClick = fn;
		},
		setUrl: (value: string) => {
			url = value;
		},
	};
}

describe("Grok Heavy controls through public MCP (fixture only)", () => {
	it("selects Heavy through native UI and reads the exact closed model back", async () => {
		const f = await fixture();
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: true,
			model: "Heavy",
			effort: "heavy",
			verified: true,
			liveVerified: false,
		});
		expect(f.stats().clicks).toBe(2);
	});

	it("reports the current model without allowing Send on an unconfigured Heavy route", async () => {
		const f = await fixture();
		expect(await f.call("frontend_inspect")).toMatchObject({
			ok: true,
			model: "Fast",
			effort: null,
		});
		expect(
			await f.call("frontend_send", { requestId: "heavy-unswitched", text: "Do not send" }),
		).toMatchObject({ ok: false, code: "model_drift" });
		expect(f.stats().clicks).toBe(0);
	});

	it("preserves legacy Fast controls and rejects other Heavy-route efforts before the broker", async () => {
		const f = await fixture("Fast");
		for (const name of ["frontend_inspect", "frontend_configure"])
			expect(
				await f.call(name, name === "frontend_configure" ? { effort: "pro" } : {}),
			).toMatchObject({ ok: false, code: "controls_unsupported" });
		expect(f.stats().probes).toBe(0);
		f.route.expectedModel = "Heavy";
		expect(await f.call("frontend_configure", { effort: "pro" })).toMatchObject({
			ok: false,
			code: "unknown_effort",
		});
		expect(f.stats().probes).toBe(0);
	});

	it.each([
		"missing",
		"disabled",
		"ambiguous",
		"upsell",
		"anchor",
		"hidden",
	])("refuses a %s Heavy choice without selecting or sending", async (kind) => {
		const f = await fixture();
		const choice = f.get("#heavy");
		if (kind === "missing") choice.remove();
		if (kind === "disabled") choice.setAttribute("aria-disabled", "true");
		if (kind === "ambiguous") choice.parentElement?.append(choice.cloneNode(true));
		if (kind === "upsell") {
			choice.setAttribute("aria-label", "Heavy");
			choice.textContent = "Heavy Upgrade";
		}
		if (kind === "anchor")
			choice.outerHTML = '<a id="heavy" role="menuitemradio" href="/upgrade">Heavy</a>';
		if (kind === "hidden") choice.setAttribute("hidden", "");
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: false,
			code: "effort_unavailable",
			menuMayBeOpen: true,
		});
		expect(f.stats().clicks).toBe(1);
		expect(f.stats().sends).toBe(0);
	});

	it.each([
		"draft",
		"generation",
		"dialog",
		"overlay",
	])("protects an existing %s before input", async (kind) => {
		const f = await fixture();
		if (kind === "draft") f.get("[contenteditable]").textContent = "Keep my draft";
		if (kind === "generation")
			f.get("form").insertAdjacentHTML(
				"beforeend",
				'<button aria-label="Stop generating"></button>',
			);
		if (kind === "dialog")
			f.document.body.insertAdjacentHTML("beforeend", '<div role="dialog">Unrelated</div>');
		if (kind === "overlay") f.setOverlay();
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: false,
			code:
				kind === "overlay"
					? "blocked_overlay"
					: kind === "dialog"
						? "unexpected_dialog"
						: "composer_busy",
		});
		expect(f.stats().clicks).toBe(0);
	});

	it.each([
		"unchanged model",
		"different label",
		"URL change",
		"dialog",
		"uncertain input",
	])("stops on %s after input without a cleanup click or retry", async (kind) => {
		const f = await fixture();
		if (kind === "unchanged model") f.setSticky();
		if (kind === "different label")
			f.afterClick(() => {
				if (f.stats().clicks === 2) f.get("#picker").setAttribute("aria-label", "Model: Heavy ");
			});
		if (kind === "URL change") f.afterClick(() => f.setUrl("https://grok.com/c/other"));
		if (kind === "dialog")
			f.afterClick(() =>
				f.document.body.insertAdjacentHTML("beforeend", '<div role="dialog">Upgrade</div>'),
			);
		if (kind === "uncertain input") f.setUncertain();
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: false,
			code: kind === "uncertain input" ? "ui_action_failed" : "readback_mismatch",
			menuMayBeOpen: true,
		});
		expect(f.stats().clicks).toBe(kind === "unchanged model" || kind === "different label" ? 2 : 1);
	});

	it("verifies an already selected Heavy model without input", async () => {
		const f = await fixture();
		f.get("#picker").setAttribute("aria-label", "Model: Heavy");
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: true,
			model: "Heavy",
			verified: true,
			uiSteps: 0,
		});
		expect(f.stats().clicks).toBe(0);
	});

	it("preserves an initially open model menu when a draft blocks configuration", async () => {
		const f = await fixture();
		f.get("#picker").setAttribute("aria-expanded", "true");
		f.get("#menu").removeAttribute("hidden");
		f.get("[contenteditable]").textContent = "Keep my draft";
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: false,
			code: "composer_busy",
			menuMayBeOpen: true,
		});
		expect(f.stats().clicks).toBe(0);
	});

	it("refuses stale root controls after a conversation exists without input", async () => {
		const f = await fixture();
		f.setUrl("https://grok.com/c/existing");
		for (const name of ["frontend_inspect", "frontend_configure"])
			expect(
				await f.call(name, name === "frontend_configure" ? { effort: "heavy" } : {}),
			).toMatchObject({ ok: false, code: "origin_mismatch" });
		expect(f.stats().clicks).toBe(0);
	});

	it("keeps an unresolved response ahead of another model change", async () => {
		const f = await fixture();
		await f.call("frontend_configure", { effort: "heavy" });
		await f.call("frontend_send", {
			requestId: "heavy-unresolved",
			text: "Return the fixture token",
		});
		const before = f.stats();
		expect(await f.call("frontend_configure", { effort: "heavy" })).toMatchObject({
			ok: false,
			code: "request_unresolved",
		});
		expect(f.stats()).toEqual(before);
	});

	it("reads two full connected Heavy replies through public MCP (fixture)", async () => {
		const f = await fixture();
		await f.call("frontend_configure", { effort: "heavy" });
		await f.call("frontend_send", {
			requestId: "heavy-fixture-first",
			text: "Return the fixture token",
		});
		await f.call("frontend_status", { requestId: "heavy-fixture-first" });
		f.advance();
		expect(await f.call("frontend_status", { requestId: "heavy-fixture-first" })).toMatchObject({
			status: "completed",
			output: "HEAVY-FIXTURE-17",
			conversationUrl: "https://grok.com/c/heavy-fixture",
		});
		await f.call("frontend_send", {
			requestId: "heavy-fixture-second",
			text: "Use your actual previous token",
			previousRequestId: "heavy-fixture-first",
		});
		await f.call("frontend_status", { requestId: "heavy-fixture-second" });
		f.advance();
		const result = await f.call("frontend_status", { requestId: "heavy-fixture-second" });
		expect(result).toMatchObject({
			status: "completed",
			output: "HEAVY-FIXTURE-17 remembered",
			previousRequestId: "heavy-fixture-first",
		});
		const before = f.stats();
		expect(await f.call("frontend_status", { requestId: "heavy-fixture-second" })).toEqual(result);
		expect(f.stats()).toEqual(before);
		expect(f.stats().sends).toBe(2);
	});
});
