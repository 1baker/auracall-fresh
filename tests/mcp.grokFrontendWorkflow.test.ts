import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

function element(doc: Document | Element, selector: string): Element {
	const node = doc.querySelector(selector);
	if (!node) throw new Error(`Missing fixture element: ${selector}`);
	return node;
}

// Synthetic native-input boundary; reads execute the production serialized DOM recipe.
async function fixture(startUrl = "https://grok.com/", roleMain = false) {
	const home = await mkdtemp(join(tmpdir(), "auracall-grok-"));
	setAuracallHomeDirOverrideForTest(home);
	const { document, window } = parseHTML(
		`<html><head><title>Grok</title></head><body><button aria-label="Account menu"></button>${roleMain ? '<div role="main"></div>' : "<main></main>"}<form><div contenteditable="true" role="combobox" aria-label="Ask Grok anything"></div><button type="button" aria-label="Attach"></button><button type="button" aria-label="Model: Fast"></button><button type="button" aria-label="Enter voice mode"></button></form></body></html>`,
	);
	const composer = element(document, "[contenteditable]");
	const form = element(document, "form");
	const main = element(document, 'main, [role="main"]');
	let url = startUrl;
	let target = "grok-target";
	let clicks = 0;
	let fills = 0;
	let probes = 0;
	let overlay = false;
	let timeout = false;
	let rootLag = false;
	let noSend = false;
	let overlayAfterFill = false;
	let afterClick: ((click: number) => string) | undefined;
	const rect = { x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 50, width: 100, height: 40 };
	// linkedom has no layout engine. Explicit layout/hit-test boundary fixtures.
	Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
		configurable: true,
		value() {
			return rect;
		},
	});
	Object.defineProperty(window.Element.prototype, "getClientRects", {
		configurable: true,
		value() {
			return [rect];
		},
	});
	Object.defineProperty(document, "elementFromPoint", {
		configurable: true,
		value() {
			return overlay
				? document.body
				: composer.textContent
					? (form.querySelector('[type="submit"]') ?? composer)
					: composer;
		},
	});
	const handle = {
		valid: true,
		browserId: "grok-browser",
		sessionName: "grok-session",
		profileId: "grok-profile",
		tabId: "grok-tab",
		targetId: "grok-target",
	};
	const route = {
		id: "grok",
		provider: "grok" as const,
		expectedUrl: startUrl,
		expectedModel: "Fast",
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
				targetId: target,
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
		if (step.type === "fill") {
			expect(nodes[0]).toBe(composer);
			fills++;
			if (typeof step.value !== "string") throw new Error("Missing native fill text");
			composer.textContent = step.value;
			if (!noSend)
				form.insertAdjacentHTML(
					"beforeend",
					'<button type="submit" aria-label="Send message"></button>',
				);
			if (overlayAfterFill) overlay = true;
		} else {
			expect(step.type).toBe("click");
			expect(nodes[0].getAttribute("type")).toBe("submit");
			clicks++;
			if (!rootLag) url = afterClick ? afterClick(clicks) : "https://grok.com/c/fixture";
			for (const [role, text] of [
				["user", composer.textContent],
				["assistant", clicks === 1 ? "BLUE-17" : "BLUE-17 remembered"],
			]) {
				const row = document.createElement("div");
				row.className = role === "user" ? "items-end" : "items-start";
				const content = document.createElement("div");
				content.className = role === "user" ? "message-bubble" : "response-content-markdown";
				content.textContent = text;
				row.append(content);
				main.append(row);
			}
			composer.textContent = "";
			form.querySelector('[type="submit"]')?.remove();
			if (timeout) throw new Error("Native click response lost after commit");
		}
		return { ok: true, targetId: target, url, steps: [{ index: 0, type: step.type, ok: true }] };
	};
	const clients: Client[] = [];
	const servers: McpServer[] = [];
	const connect = async () => {
		const server = new McpServer({ name: "grok-fixture", version: "1" });
		registerFrontendTools(server, new FrontendService([route], broker));
		const client = new Client({ name: "grok-caller", version: "1" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await server.connect(b);
		await client.connect(a);
		clients.push(client);
		servers.push(server);
		return async (name: string, args: Record<string, unknown> = {}) =>
			(await client.callTool({ name, arguments: { routeId: route.id, ...args } }))
				.structuredContent as Record<string, unknown>;
	};
	return {
		connect,
		document,
		composer,
		form,
		main,
		home,
		route,
		stats: () => ({ clicks, fills, probes }),
		setOverlay: () => {
			overlay = true;
		},
		setOverlayAfterFill: () => {
			overlayAfterFill = true;
		},
		setNoSend: () => {
			noSend = true;
		},
		setTimeout: () => {
			timeout = true;
		},
		setRootLag: () => {
			rootLag = true;
		},
		setUrl: (v: string) => {
			url = v;
		},
		setTarget: (v: string) => {
			target = v;
		},
		setAfterClick: (value: (click: number) => string) => {
			afterClick = value;
		},
		cleanup: async () => {
			for (const c of clients) await c.close();
			for (const s of servers) await s.close();
			setAuracallHomeDirOverrideForTest(null);
			vi.useRealTimers();
			await rm(home, { recursive: true, force: true });
		},
	};
}

describe("Grok durable conversation through public MCP", () => {
	it("adopts only the canonical conversation across rid changes, textbox transition and restart", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			f.setAfterClick(
				(click) =>
					`https://grok.com/c/fixture?rid=${click === 1 ? "12345678-1234-1234-1234-123456789abc" : "abcdef01-2345-6789-abcd-0123456789ab"}`,
			);
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-rid-first", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent", conversationUrl: null });
			f.composer.setAttribute("role", "textbox");
			expect(await call("frontend_status", { requestId: "grok-rid-first" })).toMatchObject({
				status: "sent",
				conversationUrl: "https://grok.com/c/fixture",
			});
			const again = await f.connect();
			vi.setSystemTime(Date.now() + 1500);
			expect(await again("frontend_status", { requestId: "grok-rid-first" })).toMatchObject({
				status: "completed",
				conversationUrl: "https://grok.com/c/fixture",
				output: "BLUE-17",
				identityKind: "derived_sequence",
			});
			expect(
				await again("frontend_send", {
					requestId: "grok-rid-second",
					text: "Recall the first answer",
					previousRequestId: "grok-rid-first",
				}),
			).toMatchObject({ status: "sent" });
			await again("frontend_status", { requestId: "grok-rid-second" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await again("frontend_status", { requestId: "grok-rid-second" })).toMatchObject({
				status: "completed",
				output: "BLUE-17 remembered",
				conversationUrl: "https://grok.com/c/fixture",
			});
			expect(f.stats().clicks).toBe(2);
			f.setUrl("https://grok.com/c/different?rid=12345678-1234-1234-1234-123456789abc");
			expect(
				await again("frontend_send", {
					requestId: "grok-wrong-path",
					text: "Do not send",
					previousRequestId: "grok-rid-second",
				}),
			).toMatchObject({ ok: false, code: "origin_mismatch" });
			expect(f.stats().clicks).toBe(2);
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"https://grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc&rid=abcdef01-2345-6789-abcd-0123456789ab",
		"https://grok.com/c/fixture?rid=",
		"https://grok.com/c/fixture?rid=invalid",
		"https://grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc&extra=1",
		"https://grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc#fragment",
		"https://user@grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc",
		"https://grok.com:444/c/fixture?rid=12345678-1234-1234-1234-123456789abc",
		"http://grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc",
		"https://www.grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc",
	])("refuses unsupported observed URL %s without replaying a saved send", async (url) => {
		const f = await fixture();
		try {
			f.setAfterClick(() => url);
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-bad-rid", text: "Return BLUE-17" });
			expect(await call("frontend_status", { requestId: "grok-bad-rid" })).toMatchObject({
				ok: false,
				code: "origin_mismatch",
			});
			expect(
				await call("frontend_send", { requestId: "grok-bad-rid", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent", conversationUrl: null });
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});

	it("reconciles the preserved sent record after a rejected URL without migrating or resending", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-preserved", text: "Return BLUE-17" });
			f.setUrl("https://grok.com/c/fixture?unexpected=1");
			expect(await call("frontend_status", { requestId: "grok-preserved" })).toMatchObject({
				ok: false,
				code: "origin_mismatch",
			});
			f.setUrl("https://grok.com/c/fixture?rid=12345678-1234-1234-1234-123456789abc");
			f.composer.setAttribute("role", "textbox");
			const again = await f.connect();
			await again("frontend_status", { requestId: "grok-preserved" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await again("frontend_status", { requestId: "grok-preserved" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
			});
			expect(f.stats()).toMatchObject({ clicks: 1, fills: 1 });
		} finally {
			await f.cleanup();
		}
	});

	it("refuses simultaneous textbox and combobox composers before input", async () => {
		const f = await fixture();
		try {
			const other = f.composer.cloneNode(true) as Element;
			other.setAttribute("role", "textbox");
			f.form.append(other);
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-two-roles", text: "Do not send" }),
			).toMatchObject({ ok: false, code: "composer_unavailable" });
			expect(f.stats()).toMatchObject({ clicks: 0, fills: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it("uses role=main and an empty P/BR editor for linked exact-text replies", async () => {
		const f = await fixture("https://grok.com/", true);
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			f.composer.innerHTML = "<p><br></p>";
			Object.defineProperty(f.composer, "innerText", {
				configurable: true,
				get() {
					return f.composer.textContent === "" ? "\n" : f.composer.textContent;
				},
			});
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-role-one", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent" });
			await call("frontend_status", { requestId: "grok-role-one" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-role-one" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
			});
			expect(
				await call("frontend_send", {
					requestId: "grok-role-two",
					text: "Repeat the actual reply",
					previousRequestId: "grok-role-one",
				}),
			).toMatchObject({ status: "sent" });
			await call("frontend_status", { requestId: "grok-role-two" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-role-two" })).toMatchObject({
				status: "completed",
				output: "BLUE-17 remembered",
			});
		} finally {
			await f.cleanup();
		}
	});

	it("deduplicates a main element that also has role=main", async () => {
		const f = await fixture();
		try {
			f.main.setAttribute("role", "main");
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-main-both", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent" });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"zero",
		"multiple",
	])("refuses %s visible message scopes before any fill", async (kind) => {
		const f = await fixture();
		try {
			if (kind === "zero") f.main.remove();
			else f.document.body.insertAdjacentHTML("beforeend", '<section role="main"></section>');
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-scope", text: "Do not send" }),
			).toMatchObject({ ok: false, code: "unsupported_scope" });
			expect(f.stats()).toMatchObject({ clicks: 0, fills: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"<p>   </p>",
		"<p><br></p><span></span>",
		"<p><br></p> ",
		"<p><img></p>",
	])("preserves a nonempty or ambiguous editor %s", async (html) => {
		const f = await fixture();
		try {
			f.composer.innerHTML = html;
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-editor", text: "Do not send" }),
			).toMatchObject({ ok: false, code: "composer_busy" });
			expect(f.stats()).toMatchObject({ clicks: 0, fills: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it("resets stability while the message scope is temporarily absent", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-scope-churn", text: "Return BLUE-17" });
			await call("frontend_status", { requestId: "grok-scope-churn" });
			vi.setSystemTime(Date.now() + 1500);
			f.main.setAttribute("hidden", "");
			expect(await call("frontend_status", { requestId: "grok-scope-churn" })).toMatchObject({
				status: "sent",
				code: "unsupported_scope",
				output: null,
			});
			f.main.removeAttribute("hidden");
			expect(await call("frontend_status", { requestId: "grok-scope-churn" })).toMatchObject({
				status: "sent",
			});
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-scope-churn" })).toMatchObject({
				status: "completed",
			});
		} finally {
			await f.cleanup();
		}
	});

	it("reads one assistant message when markdown is nested in its message bubble", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-nested", text: "Return BLUE-17" });
			const markdown = element(f.main, ".response-content-markdown");
			const row = markdown.parentElement;
			if (!row) throw new Error("Missing assistant fixture row");
			const bubble = f.document.createElement("div");
			bubble.className = "message-bubble";
			bubble.textContent = "Copy UI label";
			row.append(bubble);
			bubble.append(markdown);
			expect(await call("frontend_status", { requestId: "grok-nested" })).toMatchObject({
				status: "sent",
				output: null,
			});
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-nested" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
			});
		} finally {
			await f.cleanup();
		}
	});

	it("reads two linked stable replies after root adoption and a caller restart", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-first", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent", identityKind: "derived_sequence" });
			expect(await call("frontend_status", { requestId: "grok-first" })).toMatchObject({
				status: "sent",
				output: null,
			});
			vi.setSystemTime(Date.now() + 1500);
			const again = await f.connect();
			expect(await again("frontend_status", { requestId: "grok-first" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
				conversationUrl: "https://grok.com/c/fixture",
				userMessageId: null,
				assistantMessageId: null,
				observedUserKey: expect.any(String),
				observedAssistantKey: expect.any(String),
				generationSignal: "unverified",
			});
			expect(
				await again("frontend_send", { requestId: "grok-first", text: "Return BLUE-17" }),
			).toMatchObject({ status: "completed" });
			expect(f.stats().clicks).toBe(1);
			expect(
				await again("frontend_send", {
					requestId: "grok-second",
					text: "Repeat your actual first answer",
					previousRequestId: "grok-first",
				}),
			).toMatchObject({ status: "sent" });
			await again("frontend_status", { requestId: "grok-second" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await again("frontend_status", { requestId: "grok-second" })).toMatchObject({
				status: "completed",
				output: "BLUE-17 remembered",
				previousRequestId: "grok-first",
			});
			expect(f.stats().clicks).toBe(2);
		} finally {
			await f.cleanup();
		}
	});

	it("rejects changed content for a used ID and recovers an uncertain click without replay", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			f.setTimeout();
			expect(
				await call("frontend_send", { requestId: "grok-timeout", text: "Return BLUE-17" }),
			).toMatchObject({ status: "uncertain", code: "send_unconfirmed" });
			expect(
				await call("frontend_send", { requestId: "grok-timeout", text: "Changed" }),
			).toMatchObject({ ok: false, code: "request_conflict" });
			expect(
				await call("frontend_send", { requestId: "grok-next", text: "Do not send" }),
			).toMatchObject({ ok: false, code: "request_unresolved" });
			const restarted = await f.connect();
			await restarted("frontend_status", { requestId: "grok-timeout" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await restarted("frontend_status", { requestId: "grok-timeout" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
			});
			expect(f.stats()).toMatchObject({ clicks: 1, fills: 1 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		["https://grok.com/imagine", "invalid_route"],
		["https://grok.com/project/123", "invalid_route"],
		["https://grok.com/?x=1", "invalid_route"],
		["https://grok.com/c/123#fragment", "invalid_route"],
		["https://grok.example/c/123", "origin_mismatch"],
	])("rejects unsupported route %s before any native input", async (url, code) => {
		const f = await fixture(url);
		try {
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-url", text: "Do not send" }),
			).toMatchObject({ ok: false, code });
			expect(f.stats()).toEqual({ clicks: 0, fills: 0, probes: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"frontend_inspect",
		"frontend_configure",
	])("refuses unsupported Grok intelligence operation %s", async (name) => {
		const f = await fixture();
		try {
			const call = await f.connect();
			expect(
				await call(name, name === "frontend_configure" ? { effort: "pro" } : {}),
			).toMatchObject({ ok: false, code: "controls_unsupported" });
			expect(f.stats()).toEqual({ clicks: 0, fills: 0, probes: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		["missing composer", "composer_unavailable"],
		["two composers", "composer_unavailable"],
		["occupied composer", "composer_busy"],
		["overlay", "blocked_overlay"],
		["login", "login_required"],
		["challenge", "human_verification"],
		["different model", "model_drift"],
		["different target", "target_mismatch"],
	])("refuses %s before filling or sending", async (kind, code) => {
		const f = await fixture();
		try {
			if (kind === "missing composer") f.composer.remove();
			if (kind === "two composers") f.form.append(f.composer.cloneNode(true));
			if (kind === "occupied composer") f.composer.textContent = "Unrelated draft";
			if (kind === "overlay") f.setOverlay();
			if (kind === "login")
				f.document.body.insertAdjacentHTML("beforeend", "<button>Log in</button>");
			if (kind === "challenge") f.document.title = "Verify you are human";
			if (kind === "different model")
				element(f.form, '[aria-label="Model: Fast"]').setAttribute("aria-label", "Model: Expert");
			if (kind === "different target") f.setTarget("foreign-target");
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-refuse", text: "Do not send" }),
			).toMatchObject({ ok: false, code });
			expect(f.stats()).toMatchObject({ clicks: 0, fills: 0 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"missing Send",
		"ambiguous Send",
		"overlay after fill",
	])("saves a proven presend failure for %s", async (kind) => {
		const f = await fixture();
		try {
			if (kind === "missing Send") f.setNoSend();
			if (kind === "ambiguous Send")
				f.form.insertAdjacentHTML(
					"beforeend",
					'<button aria-label="Submit" type="submit"></button>',
				);
			if (kind === "overlay after fill") f.setOverlayAfterFill();
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-presend", text: "Do not send" }),
			).toMatchObject({
				status: "failed_presend",
				code: kind === "overlay after fill" ? "blocked_overlay" : "send_unavailable",
			});
			expect(await call("frontend_status", { requestId: "grok-presend" })).toMatchObject({
				status: "failed_presend",
			});
			expect(f.stats()).toMatchObject({ clicks: 0, fills: 1 });
		} finally {
			await f.cleanup();
		}
	});

	it.each([
		"aria-busy",
		"progressbar",
		"stop button",
		"streaming",
		"text change",
		"disappearing rows",
	])("requires a new stable observation after %s", async (kind) => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-stable", text: "Return BLUE-17" });
			await call("frontend_status", { requestId: "grok-stable" });
			vi.setSystemTime(Date.now() + 1500);
			const signal = f.document.createElement("div");
			if (kind === "aria-busy") signal.setAttribute("aria-busy", "true");
			if (kind === "progressbar") signal.setAttribute("role", "progressbar");
			if (kind === "streaming") signal.setAttribute("data-is-streaming", "true");
			if (kind === "stop button") {
				f.form.insertAdjacentHTML("beforeend", '<button aria-label="Stop generating"></button>');
			}
			if (kind === "text change")
				element(f.main, '[class="response-content-markdown"]').textContent =
					"BLUE-17 still growing";
			if (kind === "disappearing rows") f.main.setAttribute("hidden", "");
			f.document.body.append(signal);
			expect(await call("frontend_status", { requestId: "grok-stable" })).toMatchObject({
				status: "sent",
				output: null,
			});
			signal.remove();
			f.form.querySelector('[aria-label="Stop generating"]')?.remove();
			f.main.removeAttribute("hidden");
			expect(await call("frontend_status", { requestId: "grok-stable" })).toMatchObject({
				status: "sent",
			});
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-stable" })).toMatchObject({
				status: "completed",
			});
		} finally {
			await f.cleanup();
		}
	});

	it("keeps a delayed root URL pending without falsely completing or replaying", async () => {
		const f = await fixture();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			f.setRootLag();
			const call = await f.connect();
			await call("frontend_send", { requestId: "grok-url-lag", text: "Return BLUE-17" });
			await call("frontend_status", { requestId: "grok-url-lag" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-url-lag" })).toMatchObject({
				status: "sent",
				conversationUrl: null,
				output: null,
			});
			f.setUrl("https://grok.com/c/fixture");
			await call("frontend_status", { requestId: "grok-url-lag" });
			vi.setSystemTime(Date.now() + 1500);
			expect(await call("frontend_status", { requestId: "grok-url-lag" })).toMatchObject({
				status: "completed",
			});
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});

	it("marks changed baseline rows uncertain instead of text-searching for the sent prompt", async () => {
		const f = await fixture("https://grok.com/c/fixture");
		try {
			f.main.innerHTML =
				'<div class="items-end"><div class="message-bubble">Older</div></div><div class="items-start"><div class="response-content-markdown">Older answer</div></div>';
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "grok-baseline", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent" });
			element(f.main, ".message-bubble").textContent = "Changed older turn";
			expect(await call("frontend_status", { requestId: "grok-baseline" })).toMatchObject({
				status: "uncertain",
				code: "continuity_mismatch",
				output: null,
			});
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
});
