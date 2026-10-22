import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFrontendBroker } from "../src/browser/frontends/broker.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

/** Exercises MCP -> service -> actual HTTP client -> serialized DOM recipe, entirely on synthetic data. */
describe("synthetic frontend workflow through public MCP and HTTP", () => {
	it("sets Pro with native arrow requests and reads it back without any Send path", async () => {
		const contracts = JSON.parse(
			await readFile(
				new URL("./fixtures/frontend/service-contracts.json", import.meta.url),
				"utf8",
			),
		);
		const { document } = parseHTML(
			'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><div data-model-picker-view="simple"><div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" aria-valuetext="Instant"></div></div></body></html>',
		);
		const slider = document.querySelector('[role="slider"]');
		if (!slider) throw new Error("Missing fixture slider");
		const url = "https://chatgpt.com/c/fixture";
		const handle = {
			valid: true,
			browserId: "fixture-browser",
			sessionName: "fixture-session",
			profileId: "fixture-profile",
			tabId: "fixture-tab",
			targetId: "fixture-target",
		};
		const inputs: Record<string, unknown>[] = [];
		const http = createServer(async (req, res) => {
			expect(req.headers.authorization).toBe("Bearer fixture-capability");
			if (req.method === "GET" && req.url === "/api/service/contracts") {
				res.end(JSON.stringify(contracts));
				return;
			}
			expect(req.method).toBe("POST");
			expect(req.url).toBe("/api/service/request");
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			const body = JSON.parse(Buffer.concat(chunks).toString());
			inputs.push(body);
			expect(body.serviceTabHandle).toEqual(handle);
			expect(body.targetId).toBe(handle.targetId);
			expect(body.repairPolicy).toBe("reject_only");
			expect(body.profileLeasePolicy).toBe("reject");
			let data: Record<string, unknown>;
			if (body.action === "probe") {
				const expression = body.probe.detectors[0].expression;
				const observation = runInNewContext(expression, { document, location: { href: url } });
				data = {
					ok: true,
					action: "probe",
					targetId: handle.targetId,
					url,
					detectors: [
						{
							id: "frontend",
							type: "evaluate",
							ok: true,
							resultTruncated: false,
							result: observation,
						},
					],
				};
			} else if (body.action === "ui_action") {
				const step = body.uiAction.steps[0];
				expect(step.type).toBe("focus");
				expect(document.querySelector(step.selector)).toBe(slider);
				Object.defineProperty(document, "activeElement", { value: slider, configurable: true });
				data = {
					ok: true,
					action: "ui_action",
					targetId: handle.targetId,
					steps: [{ index: 0, type: "focus", ok: true }],
				};
			} else {
				expect(body.action).toBe("press");
				expect(body.params).toEqual({ key: "ArrowRight" });
				expect(document.activeElement).toBe(slider);
				const value = Number(slider.getAttribute("aria-valuenow")) + 1;
				slider.setAttribute("aria-valuenow", String(value));
				slider.setAttribute(
					"aria-valuetext",
					["Instant", "Medium", "High", "Extra High", "Pro"][value],
				);
				data = { pressed: "ArrowRight" };
			}
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ success: true, data }));
		});
		await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
		const address = http.address();
		if (!address || typeof address === "string") throw new Error("Missing fixture port");
		const capabilityName = "FIXTURE_CAPABILITY";
		const service = new FrontendService(
			[
				{
					id: "fixture",
					provider: "chatgpt",
					expectedUrl: url,
					expectedModel: "GPT fixture",
					serviceTabHandle: handle,
					profileCapabilityEnv: "FIXTURE_CAPABILITY",
				},
			],
			createFrontendBroker({
				baseUrl: `http://127.0.0.1:${address.port}`,
				env: { [capabilityName]: "fixture-capability" },
			}),
		);
		const server = new McpServer({ name: "frontend-workflow", version: "1" });
		registerFrontendTools(server, service);
		const client = new Client({ name: "workflow-fixture", version: "1" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const configured = await client.callTool({
				name: "frontend_configure",
				arguments: { routeId: "fixture", effort: "pro" },
			});
			expect(configured.isError).not.toBe(true);
			expect(configured.structuredContent).toMatchObject({
				effort: "pro",
				verified: true,
				uiSteps: 5,
				liveVerified: false,
			});
			const readback = await client.callTool({
				name: "frontend_inspect",
				arguments: { routeId: "fixture" },
			});
			expect(readback.structuredContent).toMatchObject({ effort: "pro", label: "Pro" });
			expect(inputs.filter((input) => input.action === "press")).toHaveLength(4);
			expect(inputs.filter((input) => input.action === "ui_action")).toHaveLength(1);
			expect(
				inputs.every((input) => ["probe", "ui_action", "press"].includes(String(input.action))),
			).toBe(true);
		} finally {
			await client.close();
			await server.close();
			await new Promise<void>((resolve) => {
				http.closeAllConnections();
				http.close(() => resolve());
			});
		}
	});
});

function requiredElement(doc: Document, selector: string): Element {
	const node = doc.querySelector(selector);
	if (!node) throw new Error(`Missing fixture element: ${selector}`);
	return node;
}

// S2: public protocol coverage. The fixture changes only in response to native
// ui_action input; production's serialized readonly detector supplies all reads.
async function messagingFixture(startUrl = "https://chatgpt.com/c/messaging-fixture") {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { setAuracallHomeDirOverrideForTest } = await import("../src/auracallHome.js");
	const home = await mkdtemp(join(tmpdir(), "auracall-send-"));
	setAuracallHomeDirOverrideForTest(home);
	const url = startUrl;
	const { document } = parseHTML(
		'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><main></main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body></html>',
	);
	const handle = {
		valid: true,
		browserId: "message-browser",
		sessionName: "message-session",
		profileId: "message-profile",
		tabId: "message-tab",
		targetId: "message-target",
	};
	const route = {
		id: "messages",
		provider: "chatgpt" as const,
		expectedUrl: url,
		expectedModel: "GPT fixture",
		serviceTabHandle: handle,
		profileCapabilityEnv: "FIXTURE_CAPABILITY",
	};
	let clicks = 0;
	let probes = 0;
	let timeoutClick = false;
	let mismatchFill = false;
	let observedUrl = url;
	let target = handle.targetId;
	const broker = async (request: Record<string, unknown>) => {
		expect(request.serviceTabHandle).toEqual(handle);
		expect(request.repairPolicy).toBe("reject_only");
		expect(request.profileLeasePolicy).toBe("reject");
		const common = { ok: true, targetId: target, url: observedUrl };
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
							location: { href: observedUrl },
						}),
					},
				],
			};
		}
		expect(request.action).toBe("ui_action");
		const step = (
			request.uiAction as { steps: { type: string; selector: string; value?: string }[] }
		).steps[0];
		const node = document.querySelector(step.selector) as HTMLTextAreaElement;
		expect(node).toBeTruthy();
		if (step.type === "fill") {
			if (typeof step.value !== "string") throw new Error("Missing native fill text");
			node.value = mismatchFill ? "wrong input" : step.value;
		} else {
			expect(step.type).toBe("click");
			expect(node.getAttribute("data-testid")).toBe("send-button");
			clicks++;
			if (url === "https://chatgpt.com/") observedUrl = "https://chatgpt.com/c/messaging-fixture";
			const text = (document.querySelector("#prompt-textarea") as HTMLTextAreaElement).value;
			for (const [role, content] of [
				["user", text],
				["assistant", clicks === 1 ? "BLUE-17" : "BLUE-17 remembered"],
			]) {
				const el = document.createElement("div");
				el.setAttribute("data-message-author-role", role);
				el.setAttribute("data-message-id", `${role}-${clicks}`);
				el.textContent = content;
				requiredElement(document, "main").append(el);
			}
			(document.querySelector("#prompt-textarea") as HTMLTextAreaElement).value = "";
			if (timeoutClick) throw new Error("unconfirmed native response");
		}
		return { ...common, steps: [{ index: 0, type: step.type, ok: true }] };
	};
	const servers: McpServer[] = [];
	const clients: Client[] = [];
	const connect = async () => {
		const server = new McpServer({ name: "send-fixture", version: "1" });
		registerFrontendTools(server, new FrontendService([route], broker));
		const client = new Client({ name: "send-fixture", version: "1" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await server.connect(b);
		await client.connect(a);
		servers.push(server);
		clients.push(client);
		return async (name: string, args: Record<string, unknown>) =>
			(await client.callTool({ name, arguments: { routeId: route.id, ...args } }))
				.structuredContent as Record<string, unknown>;
	};
	return {
		connect,
		document,
		home,
		route,
		stats: () => ({ clicks, probes }),
		setTimeout: () => {
			timeoutClick = true;
		},
		setMismatch: () => {
			mismatchFill = true;
		},
		setUrl: (value: string) => {
			observedUrl = value;
		},
		setTarget: (value: string) => {
			target = value;
		},
		cleanup: async () => {
			for (const c of clients) await c.close();
			for (const s of servers) await s.close();
			setAuracallHomeDirOverrideForTest(null);
			await rm(home, { recursive: true, force: true });
		},
	};
}

describe("durable frontend messages through MCP", () => {
	it("reads two connected replies and reopens the same saved receipt after restart", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "request-one", text: "Return BLUE-17" }),
			).toMatchObject({ requestId: "request-one", status: "sent", liveVerified: false });
			expect(await call("frontend_status", { requestId: "request-one" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
				userMessageId: "user-1",
				assistantMessageId: "assistant-1",
			});
			const afterRestart = await f.connect();
			expect(
				await afterRestart("frontend_send", { requestId: "request-one", text: "Return BLUE-17" }),
			).toMatchObject({ status: "completed", output: "BLUE-17" });
			expect(f.stats().clicks).toBe(1);
			expect(
				await afterRestart("frontend_send", {
					requestId: "request-two",
					text: "What was your actual previous answer?",
					previousRequestId: "request-one",
				}),
			).toMatchObject({ status: "sent" });
			expect(await afterRestart("frontend_status", { requestId: "request-two" })).toMatchObject({
				status: "completed",
				output: "BLUE-17 remembered",
				previousRequestId: "request-one",
			});
			expect(f.stats().clicks).toBe(2);
		} finally {
			await f.cleanup();
		}
	});
});

describe("frontend message safety and recovery through MCP", () => {
	it("rejects conflicting IDs and reads an uncertain click without replaying it", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			f.setTimeout();
			expect(
				await call("frontend_send", { requestId: "timeout-one", text: "Return BLUE-17" }),
			).toMatchObject({ status: "uncertain" });
			expect(
				await call("frontend_send", { requestId: "timeout-one", text: "different" }),
			).toMatchObject({ code: "request_conflict" });
			expect(
				await call("frontend_send", { requestId: "timeout-one", text: "Return BLUE-17" }),
			).toMatchObject({ status: "uncertain" });
			expect(
				await call("frontend_send", { requestId: "timeout-two", text: "another" }),
			).toMatchObject({ code: "request_unresolved" });
			expect(f.stats().clicks).toBe(1);
			const before = f.stats().probes;
			expect(await call("frontend_status", { requestId: "timeout-one" })).toMatchObject({
				status: "completed",
				output: "BLUE-17",
			});
			expect(f.stats().probes - before).toBe(1);
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it("records a failed composer readback with zero send clicks and does not retry that ID", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			f.setMismatch();
			expect(
				await call("frontend_send", { requestId: "mismatch-one", text: "exact text" }),
			).toMatchObject({ status: "failed_presend" });
			const before = f.stats();
			expect(
				await call("frontend_send", { requestId: "mismatch-one", text: "exact text" }),
			).toMatchObject({ status: "failed_presend" });
			expect(f.stats()).toEqual(before);
			expect(f.stats().clicks).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	it.each([
		"occupied",
		"generating",
		"target",
		"url",
		"model",
		"duplicate-message",
	])("refuses unsafe frontend state: %s", async (kind) => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			if (kind === "occupied")
				(f.document.querySelector("#prompt-textarea") as HTMLTextAreaElement).value =
					"unsent human draft";
			if (kind === "generating")
				requiredElement(f.document, "main").innerHTML =
					'<button data-testid="stop-button">Stop</button>';
			if (kind === "target") f.setTarget("foreign-target");
			if (kind === "url") f.setUrl("https://chatgpt.com/c/another");
			if (kind === "model")
				requiredElement(f.document, '[data-testid="model-switcher-dropdown-button"]').textContent =
					"another model";
			if (kind === "duplicate-message")
				requiredElement(f.document, "main").innerHTML =
					'<div data-message-author-role="user" data-message-id="duplicate">one</div><div data-message-author-role="assistant" data-message-id="duplicate">two</div>';
			const result = await call("frontend_send", { requestId: "unsafe-one", text: "test" });
			expect(result).toMatchObject({ ok: false });
			expect(f.stats().clicks).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	it("refuses a follow-up when a human turn has interleaved since the saved reply", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "linked-one", text: "one" });
			await call("frontend_status", { requestId: "linked-one" });
			requiredElement(f.document, "main").insertAdjacentHTML(
				"beforeend",
				'<div data-message-author-role="user" data-message-id="human-extra">human text</div>',
			);
			expect(
				await call("frontend_send", {
					requestId: "linked-two",
					text: "two",
					previousRequestId: "linked-one",
				}),
			).toMatchObject({ code: "continuity_mismatch" });
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it("does not accept an unrelated user turn as the requested reply", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "poll-one", text: "one" });
			requiredElement(f.document, '[data-message-author-role="user"]').textContent =
				"other person text";
			expect(await call("frontend_status", { requestId: "poll-one" })).toMatchObject({
				status: "sent",
				code: "continuity_mismatch",
				output: null,
			});
			expect(await call("frontend_send", { requestId: "poll-two", text: "two" })).toMatchObject({
				code: "request_unresolved",
			});
		} finally {
			await f.cleanup();
		}
	});
	it.each([
		"malformed",
		"version",
	])("preserves %s records and refuses to overwrite them", async (kind) => {
		const f = await messagingFixture();
		try {
			const { mkdir, writeFile, readFile } = await import("node:fs/promises");
			const { join } = await import("node:path");
			const path = join(f.home, "frontend-requests", "corrupt-one.json");
			await mkdir(join(f.home, "frontend-requests"), { mode: 0o700 });
			const contents = kind === "version" ? JSON.stringify({ version: 2 }) : "invalid JSON";
			await writeFile(path, contents);
			const call = await f.connect();
			expect(await call("frontend_send", { requestId: "corrupt-one", text: "one" })).toMatchObject({
				code: "record_invalid",
			});
			expect(await call("frontend_status", { requestId: "corrupt-one" })).toMatchObject({
				code: "record_invalid",
			});
			expect(await readFile(path, "utf8")).toBe(contents);
			expect(f.stats().clicks).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	it("refuses arbitrary code, handles, paths and invalid prior request IDs in public inputs", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			for (const args of [
				{ requestId: "../../escape", text: "x" },
				{ requestId: "safe-request", text: "x", script: "arbitrary code" },
				{ requestId: "safe-request", text: "x", previousRequestId: "bad" },
				{ requestId: "safe-request", text: "x", serviceTabHandle: {} },
			]) {
				expect(await call("frontend_send", args)).toBeUndefined();
			}
			expect(f.stats()).toEqual({ clicks: 0, probes: 0 });
		} finally {
			await f.cleanup();
		}
	});
	it("blocks simultaneous requests from separate services on the same retained target", async () => {
		const f = await messagingFixture();
		try {
			const call = await f.connect();
			const other = await f.connect();
			const results = await Promise.all([
				call("frontend_send", { requestId: "parallel-one", text: "one" }),
				other("frontend_send", { requestId: "parallel-two", text: "two" }),
			]);
			expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
			expect(
				results.filter((r) =>
					["lock_held", "lock_unproven", "request_unresolved"].includes(String(r.code)),
				),
			).toHaveLength(1);
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it("reports a process-held lock and a crash orphan without probing or stealing it", async () => {
		const f = await messagingFixture();
		let child: import("node:child_process").ChildProcess | undefined;
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "orphan-one", text: "one" });
			const { spawn } = await import("node:child_process");
			const { once } = await import("node:events");
			const moduleUrl = new URL("../src/browser/frontends/requestStore.ts", import.meta.url).href;
			const script = `import {FrontendRequestStore,frontendTargetKey} from ${JSON.stringify(moduleUrl)};const route=JSON.parse(process.env.FIXTURE_ROUTE);await new FrontendRequestStore().withLock(frontendTargetKey(route),'child-lock',async()=>{process.stdout.write('locked\\n');await new Promise(()=>{});});`;
			const homeVariable = "AURACALL_HOME_DIR";
			const routeVariable = "FIXTURE_ROUTE";
			child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
				env: {
					...process.env,
					[homeVariable]: f.home,
					[routeVariable]: JSON.stringify(f.route),
				},
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (!child.stdout) throw new Error("Missing child output");
			await Promise.race([
				once(child.stdout, "data"),
				once(child, "exit").then(() => {
					throw new Error("lock child exited before readiness");
				}),
			]);
			const before = f.stats().probes;
			expect(await call("frontend_status", { requestId: "orphan-one" })).toMatchObject({
				status: "sent",
				lockState: "lock_held",
			});
			expect(await call("frontend_send", { requestId: "orphan-two", text: "two" })).toMatchObject({
				code: "lock_held",
			});
			const exited = once(child, "exit");
			child.kill("SIGKILL");
			await exited;
			expect(await call("frontend_status", { requestId: "orphan-one" })).toMatchObject({
				status: "sent",
				lockState: "lock_orphaned",
			});
			expect(await call("frontend_send", { requestId: "orphan-two", text: "two" })).toMatchObject({
				code: "lock_orphaned",
			});
			expect(f.stats().probes).toBe(before);
			expect(f.stats().clicks).toBe(1);
		} finally {
			if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			await f.cleanup();
		}
	});
});

it("recovers an interrupted prepared intent without probing or sending", async () => {
	const f = await messagingFixture();
	try {
		const call = await f.connect();
		f.setMismatch();
		await call("frontend_send", { requestId: "prepared-one", text: "one" });
		const { readFile, writeFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const path = join(f.home, "frontend-requests", "prepared-one.json");
		const record = JSON.parse(await readFile(path, "utf8"));
		record.status = "prepared";
		record.code = null;
		await writeFile(path, JSON.stringify(record));
		const before = f.stats();
		expect(await call("frontend_status", { requestId: "prepared-one" })).toMatchObject({
			status: "failed_presend",
			code: "presend_interrupted",
		});
		expect(f.stats()).toEqual(before);
		(f.document.querySelector("#prompt-textarea") as HTMLTextAreaElement).value = "";
		expect(await call("frontend_send", { requestId: "prepared-two", text: "two" })).toMatchObject({
			status: "failed_presend",
		});
		expect(f.stats().clicks).toBe(0);
	} finally {
		await f.cleanup();
	}
});
it("gives direct service callers a typed invalid request ID before broker input", async () => {
	const service = new FrontendService(
		[
			{
				id: "route",
				provider: "chatgpt",
				expectedUrl: "https://chatgpt.com/c/fixture",
				expectedModel: "fixture",
				profileCapabilityEnv: "FIXTURE_CAPABILITY",
				serviceTabHandle: {
					valid: true,
					browserId: "browser",
					tabId: "tab",
					targetId: "target",
					profileId: "fixture",
					sessionName: "session",
				},
			},
		],
		async () => {
			throw new Error("Unexpected broker input");
		},
	);
	await expect(service.send("route", "bad", "text")).rejects.toMatchObject({
		code: "invalid_request_id",
	});
});

describe("starting a fresh frontend conversation through MCP", () => {
	it("adopts the new conversation URL and carries it across restart and three linked turns", async () => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			let call = await f.connect();
			expect(
				await call("frontend_send", { requestId: "fresh-one", text: "Return BLUE-17" }),
			).toMatchObject({ status: "sent", conversationUrl: null });
			expect(await call("frontend_status", { requestId: "fresh-one" })).toMatchObject({
				status: "completed",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
				output: "BLUE-17",
			});
			call = await f.connect();
			expect(
				await call("frontend_send", {
					requestId: "fresh-two",
					text: "Repeat the actual marker",
					previousRequestId: "fresh-one",
				}),
			).toMatchObject({
				status: "sent",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			expect(await call("frontend_status", { requestId: "fresh-two" })).toMatchObject({
				status: "completed",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			expect(
				await call("frontend_send", {
					requestId: "fresh-three",
					text: "Repeat once more",
					previousRequestId: "fresh-two",
				}),
			).toMatchObject({
				status: "sent",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			expect(await call("frontend_status", { requestId: "fresh-three" })).toMatchObject({
				status: "completed",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			expect(f.stats().clicks).toBe(3);
		} finally {
			await f.cleanup();
		}
	});
});

describe("fresh frontend conversation boundaries", () => {
	it.each([
		"https://chatgpt.com/?model=pro",
		"https://chatgpt.com/?temporary-chat=true",
		"https://chatgpt.com/g/custom",
		"https://chatgpt.com/g/g-p-project/c/fixture",
		"https://chatgpt.com/c/fixture?x=1",
		"https://chatgpt.com/c/fixture#fragment",
	])("refuses unsupported root or conversation URL %s", async (url) => {
		const f = await messagingFixture(url);
		try {
			const call = await f.connect();
			expect(await call("frontend_send", { requestId: "invalid-url", text: "test" })).toMatchObject(
				{ code: "invalid_route" },
			);
			expect(f.stats()).toEqual({ clicks: 0, probes: 0 });
		} finally {
			await f.cleanup();
		}
	});
	it("refuses root mode when the supposedly new page already contains a message", async () => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			requiredElement(f.document, "main").innerHTML =
				'<div data-message-author-role="user" data-message-id="prior-user">old user text</div>';
			const call = await f.connect();
			expect(await call("frontend_send", { requestId: "not-empty", text: "test" })).toMatchObject({
				code: "conversation_not_empty",
			});
			expect(f.stats().clicks).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	it.each([
		"wrong-user",
		"extra-user",
		"no-user",
	])("does not adopt an unverified new conversation: %s", async (kind) => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "adoption-one", text: "specific test" });
			if (kind === "wrong-user")
				requiredElement(f.document, '[data-message-author-role="user"]').textContent =
					"different text";
			if (kind === "extra-user")
				requiredElement(f.document, "main").insertAdjacentHTML(
					"beforeend",
					'<div data-message-author-role="user" data-message-id="extra-user">extra</div>',
				);
			if (kind === "no-user") requiredElement(f.document, "main").innerHTML = "";
			expect(await call("frontend_status", { requestId: "adoption-one" })).toMatchObject({
				status: "uncertain",
				conversationUrl: null,
				output: null,
				code: "continuity_mismatch",
			});
			expect(
				await call("frontend_send", { requestId: "adoption-two", text: "another" }),
			).toMatchObject({ code: "request_unresolved" });
			const before = f.stats();
			expect(
				await call("frontend_send", { requestId: "adoption-one", text: "specific test" }),
			).toMatchObject({ status: "uncertain" });
			expect(f.stats()).toEqual(before);
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it("pins the adopted URL while the first reply is still generating", async () => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "pending-one", text: "test" });
			requiredElement(f.document, "main").insertAdjacentHTML(
				"beforeend",
				'<button data-testid="stop-button">Stop</button>',
			);
			expect(await call("frontend_status", { requestId: "pending-one" })).toMatchObject({
				status: "sent",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			f.setUrl("https://chatgpt.com/c/other");
			expect(await call("frontend_status", { requestId: "pending-one" })).toMatchObject({
				code: "origin_mismatch",
			});
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it("recovers a timed out first-send click without sending again", async () => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			let call = await f.connect();
			f.setTimeout();
			expect(
				await call("frontend_send", { requestId: "root-timeout", text: "test" }),
			).toMatchObject({ status: "uncertain", conversationUrl: null });
			call = await f.connect();
			const before = f.stats();
			expect(
				await call("frontend_send", { requestId: "root-timeout", text: "test" }),
			).toMatchObject({ status: "uncertain" });
			expect(f.stats()).toEqual(before);
			expect(await call("frontend_status", { requestId: "root-timeout" })).toMatchObject({
				status: "completed",
				conversationUrl: "https://chatgpt.com/c/messaging-fixture",
			});
			expect(f.stats().clicks).toBe(1);
		} finally {
			await f.cleanup();
		}
	});
	it.each([
		"target-hash",
		"handle",
		"missing-url",
		"null-url",
		"incomplete",
	])("refuses an invalid previous request binding: %s", async (kind) => {
		const f = await messagingFixture("https://chatgpt.com/");
		try {
			const call = await f.connect();
			await call("frontend_send", { requestId: "bound-one", text: "one" });
			await call("frontend_status", { requestId: "bound-one" });
			const { readFile, writeFile } = await import("node:fs/promises");
			const { join } = await import("node:path");
			const path = join(f.home, "frontend-requests", "bound-one.json");
			const saved = JSON.parse(await readFile(path, "utf8"));
			if (kind === "target-hash") saved.targetKey = "0".repeat(64);
			if (kind === "missing-url") delete saved.conversationUrl;
			if (kind === "null-url") saved.conversationUrl = null;
			if (kind === "incomplete") saved.status = "sent";
			await writeFile(path, JSON.stringify(saved));
			if (kind === "handle") f.route.serviceTabHandle.tabId = "another-tab";
			const before = f.stats();
			const result = await call("frontend_send", {
				requestId: "bound-two",
				text: "two",
				previousRequestId: "bound-one",
			});
			expect(result.ok).toBe(false);
			expect(["request_binding_mismatch", "continuity_mismatch", "request_unresolved"]).toContain(
				result.code,
			);
			expect(f.stats()).toEqual(before);
		} finally {
			await f.cleanup();
		}
	});
	it("keeps legacy v1 receipts on their exact configured conversation route", async () => {
		const f = await messagingFixture();
		try {
			let call = await f.connect();
			await call("frontend_send", { requestId: "legacy-one", text: "one" });
			await call("frontend_status", { requestId: "legacy-one" });
			const { readFile, writeFile } = await import("node:fs/promises");
			const { join } = await import("node:path");
			const path = join(f.home, "frontend-requests", "legacy-one.json");
			const saved = JSON.parse(await readFile(path, "utf8"));
			delete saved.conversationUrl;
			await writeFile(path, JSON.stringify(saved));
			call = await f.connect();
			expect(
				await call("frontend_send", {
					requestId: "legacy-two",
					text: "two",
					previousRequestId: "legacy-one",
				}),
			).toMatchObject({ status: "sent", conversationUrl: f.route.expectedUrl });
			expect(await call("frontend_status", { requestId: "legacy-two" })).toMatchObject({
				status: "completed",
				conversationUrl: f.route.expectedUrl,
			});
			expect(f.stats().clicks).toBe(2);
		} finally {
			await f.cleanup();
		}
	});
});

it("preserves and refuses a corrupted fresh-chat baseline before any adoption probe", async () => {
	const f = await messagingFixture("https://chatgpt.com/");
	try {
		const call = await f.connect();
		await call("frontend_send", { requestId: "baseline-one", text: "one" });
		const { readFile, writeFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const path = join(f.home, "frontend-requests", "baseline-one.json");
		const record = JSON.parse(await readFile(path, "utf8"));
		record.baseline = ["not-a-fresh-root"];
		const bytes = JSON.stringify(record);
		await writeFile(path, bytes);
		const before = f.stats();
		expect(await call("frontend_status", { requestId: "baseline-one" })).toMatchObject({
			code: "record_invalid",
		});
		expect(f.stats()).toEqual(before);
		expect(await readFile(path, "utf8")).toBe(bytes);
	} finally {
		await f.cleanup();
	}
});
