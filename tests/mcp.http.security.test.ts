import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import type { FrontendRoute } from "../src/browser/frontends/types.js";
import { createFrontendHttpServer } from "../src/mcp/http/server.js";

const issuer = "https://issuer.example.test";
const resource = "https://auracall.example.test/mcp";
const subject = "OWNER-CLAIM-CANARY";
const hiddenReply = "HIDDEN-REPLY-CANARY";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	setAuracallHomeDirOverrideForTest(null);
	vi.restoreAllMocks();
});

async function fixture() {
	const home = await mkdtemp(join(tmpdir(), "auracall-http-security-"));
	setAuracallHomeDirOverrideForTest(home);
	const keys = await generateKeyPair("RS256");
	const ec = await generateKeyPair("ES256");
	const ecJwk = { ...(await exportJWK(ec.publicKey)), kid: "fixture-ec", alg: "ES256" };
	const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "fixture", alg: "RS256" };
	const contexts = ["public", "hidden"].map((id) => {
		const { document } = parseHTML(
			'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><main></main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body></html>',
		);
		const route: FrontendRoute = {
			id,
			provider: "chatgpt",
			expectedUrl: `https://chatgpt.com/c/http-${id}`,
			expectedModel: "GPT fixture",
			profileCapabilityEnv: "FIXTURE_BROWSER_CAP",
			serviceTabHandle: {
				valid: true,
				browserId: "fixture-browser",
				sessionName: "fixture-session",
				profileId: `fixture-profile-${id}`,
				targetId: `fixture-target-${id}`,
				tabId: `fixture-tab-${id}`,
			},
		};
		return { document, route, clicks: 0, probes: 0, ui: 0 };
	});
	const brokerRequests: Record<string, unknown>[] = [];
	const broker = async (request: Record<string, unknown>, capability?: string) => {
		expect(capability).toBe("FIXTURE_BROWSER_CAP");
		const context = contexts.find((c) => c.route.serviceTabHandle.targetId === request.targetId);
		if (!context) throw new Error("Fixture target changed");
		expect(request.serviceTabHandle).toEqual(context.route.serviceTabHandle);
		expect(request.repairPolicy).toBe("reject_only");
		expect(request.profileLeasePolicy).toBe("reject");
		brokerRequests.push(request);
		const common = { ok: true, targetId: request.targetId, url: context.route.expectedUrl };
		if (request.action === "probe") {
			context.probes++;
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
							document: context.document,
							location: { href: context.route.expectedUrl },
						}),
					},
				],
			};
		}
		expect(request.action).toBe("ui_action");
		context.ui++;
		const step = (
			request.uiAction as { steps: { type: string; selector: string; value?: string }[] }
		).steps[0];
		const node = context.document.querySelector(step.selector) as HTMLTextAreaElement | null;
		if (!node) throw new Error("Missing native fixture control");
		if (step.type === "fill") node.value = String(step.value);
		else {
			expect(step.type).toBe("click");
			expect(node.getAttribute("data-testid")).toBe("send-button");
			context.clicks++;
			const input = context.document.querySelector("#prompt-textarea") as HTMLTextAreaElement;
			const text = input.value;
			const reply =
				context.route.id === "hidden"
					? hiddenReply
					: context.clicks === 1
						? "BLUE-17"
						: text.includes("BLUE-17")
							? "BLUE-17 remembered"
							: "CONTEXT LOST";
			for (const [role, value] of [
				["user", text],
				["assistant", reply],
			]) {
				const element = context.document.createElement("div");
				element.setAttribute("data-message-author-role", role);
				element.setAttribute("data-message-id", `${role}-${context.clicks}`);
				element.textContent = value;
				context.document.querySelector("main")?.append(element);
			}
			input.value = "";
		}
		return { ...common, steps: [{ index: 0, type: step.type, ok: true }] };
	};
	let service = new FrontendService(
		contexts.map((c) => c.route),
		broker,
	);
	let server: Server;
	let serverConstructions = 0;
	let base = "";
	const clients = new Set<Client>();
	const responses: string[] = [];
	const start = async () => {
		server = createFrontendHttpServer({
			config: { issuer, resource, jwksUri: `${issuer}/jwks`, subject, routeIds: ["public"] },
			service,
			keyResolver: createLocalJWKSet({ keys: [publicJwk, ecJwk] }),
			createMcpServer: () => {
				serverConstructions++;
				return new McpServer({ name: "real-service-http", version: "1" });
			},
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No fixture address");
		base = `http://127.0.0.1:${address.port}`;
	};
	const stop = async () => {
		for (const client of clients) await client.close();
		clients.clear();
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	};
	await start();
	cleanups.push(async () => {
		await stop();
		await rm(home, { recursive: true, force: true });
	});
	const responseBody = (
		response: IncomingMessage,
		resolve: (value: Response) => void,
		reject: (error: Error) => void,
	) => {
		const chunks: Buffer[] = [];
		response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		response.once("error", reject);
		response.once("end", () => {
			const bytes = Buffer.concat(chunks);
			responses.push(bytes.toString("utf8"));
			resolve(
				new Response(bytes, {
					status: response.statusCode,
					headers: response.headers as Record<string, string>,
				}),
			);
		});
	};
	const nativeFetch: typeof fetch = async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		if (url.origin !== base) throw new Error("Fixture left loopback");
		return new Promise<Response>((resolve, reject) => {
			const request = httpRequest(
				url,
				{
					method: init?.method ?? "GET",
					headers: Object.fromEntries(new Headers(init?.headers)),
				},
				(response) => responseBody(response, resolve, reject),
			);
			request.once("error", reject);
			const abort = () => request.destroy(new Error("Fixture request aborted"));
			init?.signal?.addEventListener("abort", abort, { once: true });
			request.once("close", () => init?.signal?.removeEventListener("abort", abort));
			if (init?.body && typeof init.body !== "string") throw new Error("Unexpected fixture body");
			request.end(init?.body ?? undefined);
		});
	};
	const token = async (
		claims: JWTPayload = {},
		algorithm = "RS256",
		tokenType: string | null = "at+jwt",
	) =>
		new SignJWT({
			iss: issuer,
			aud: resource,
			sub: subject,
			exp: Math.floor(Date.now() / 1000) + 300,
			scope: "frontend:read frontend:send frontend:configure",
			private_fixture_claim: "CLAIM-CANARY",
			...claims,
		})
			.setProtectedHeader({
				alg: algorithm,
				kid: algorithm === "ES256" ? "fixture-ec" : "fixture",
				...(tokenType === null ? {} : { typ: tokenType }),
			})
			.sign(
				algorithm === "HS256"
					? new Uint8Array(32).fill(7)
					: algorithm === "ES256"
						? ec.privateKey
						: keys.privateKey,
			);
	const connect = async (bearer?: string) => {
		const client = new Client({ name: "real-service-http-fixture", version: "1" });
		clients.add(client);
		await client.connect(
			new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
				requestInit: {
					headers: {
						host: "auracall.example.test",
						authorization: `Bearer ${bearer ?? (await token())}`,
					},
				},
				fetch: nativeFetch,
			}),
		);
		return client;
	};
	const post = async (
		bearer: string,
		body: unknown = { jsonrpc: "2.0", id: 1, method: "ping" },
		moreHeaders: Record<string, string> = {},
	) =>
		nativeFetch(`${base}/mcp`, {
			method: "POST",
			headers: {
				host: "auracall.example.test",
				authorization: `Bearer ${bearer}`,
				"content-type": "application/json",
				...moreHeaders,
			},
			body: JSON.stringify(body),
		});
	return {
		home,
		contexts,
		responses,
		brokerRequests,
		token,
		connect,
		post,
		get serverConstructions() {
			return serverConstructions;
		},
		get service() {
			return service;
		},
		get base() {
			return base;
		},
		fetch: nativeFetch,
		stats: () => contexts.map(({ clicks, probes, ui }) => ({ clicks, probes, ui })),
		record: (id: string) => readFile(join(home, "frontend-requests", `${id}.json`)),
		absent: async (id: string) =>
			stat(join(home, "frontend-requests", `${id}.json`)).then(
				() => false,
				(error: NodeJS.ErrnoException) => error.code === "ENOENT",
			),
		restart: async () => {
			await stop();
			service = new FrontendService(
				contexts.map((c) => c.route),
				broker,
			);
			await start();
		},
		duplicate: async (bearer: string) =>
			new Promise<Response>((resolve, reject) => {
				const request = httpRequest(
					`${base}/mcp`,
					{
						method: "POST",
						headers: [
							"Host",
							"auracall.example.test",
							"Authorization",
							`Bearer ${bearer}`,
							"Authorization",
							`Bearer ${bearer}`,
							"Content-Type",
							"application/json",
						],
					},
					(response) => responseBody(response, resolve, reject),
				);
				request.once("error", reject);
				request.end('{"jsonrpc":"2.0","id":1,"method":"ping"}');
			}),
	};
}

const call = async (client: Client, name: string, args: Record<string, unknown>) =>
	client.callTool({ name, arguments: { routeId: "public", ...args } });

describe("real frontend service behind OAuth HTTP", () => {
	it("accepts the application/at+jwt access-token type", async () => {
		const f = await fixture();
		const client = await f.connect(await f.token({}, "RS256", "application/at+jwt"));
		expect(f.serverConstructions).toBeGreaterThan(0);
		const result = await call(client, "frontend_status", { requestId: "unknown-media-token" });
		expect(result.structuredContent).toMatchObject({ code: "request_missing" });
	});

	it.each([
		"JWT",
		null,
		"id_token+jwt",
	])("rejects a token without the access-token type (%s)", async (tokenType) => {
		const f = await fixture();
		const response = await f.post(await f.token({}, "RS256", tokenType), undefined, {
			accept: "application/json, text/event-stream",
		});
		expect(response.status).toBe(401);
		const text = await response.text();
		expect(JSON.parse(text)).toEqual({ error: "invalid_token" });
		const parts = (await f.token()).split(".");
		parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
		const badSignature = await f.post(parts.join("."));
		expect(await badSignature.text()).toBe(text);
		expect(response.headers.get("www-authenticate")).toBe(
			badSignature.headers.get("www-authenticate"),
		);
		expect(f.serverConstructions).toBe(0);
		expect(f.stats()[0]).toEqual({ clicks: 0, probes: 0, ui: 0 });
	});

	it("masks hidden saved-request status and send errors without disclosing a receipt", async () => {
		const f = await fixture();
		await f.service.send("hidden", "hidden-request-01", "private fixture prompt");
		const hidden = await f.service.status("hidden", "hidden-request-01");
		expect(hidden.output).toBe(hiddenReply);
		const bytes = await f.record("hidden-request-01");
		const client = await f.connect();
		const before = f.stats();
		const unknown = await call(client, "frontend_status", { requestId: "unknown-request-01" });
		const concealed = await call(client, "frontend_status", { requestId: "hidden-request-01" });
		expect(JSON.stringify(concealed)).toBe(JSON.stringify(unknown));
		const replay = await call(client, "frontend_send", {
			requestId: "hidden-request-01",
			text: "x",
		});
		expect(replay.structuredContent).toMatchObject({ code: "request_conflict" });
		const previous = await call(client, "frontend_send", {
			requestId: "fresh-request-01",
			text: "x",
			previousRequestId: "hidden-request-01",
		});
		expect(previous.structuredContent).toMatchObject({ code: "request_conflict" });
		expect(await f.absent("fresh-request-01")).toBe(true);
		expect(f.stats()).toEqual(before);
		expect(await f.record("hidden-request-01")).toEqual(bytes);
		const raw = JSON.stringify([unknown, concealed, replay, previous]);
		expect(raw).not.toContain(hiddenReply);
		expect(raw).not.toContain(f.contexts[1].route.expectedUrl);
		const missingPrior = await call(client, "frontend_send", {
			requestId: "unknown-parent-01",
			text: "x",
			previousRequestId: "unknown-request-01",
		});
		expect(missingPrior.structuredContent).toMatchObject({ code: "previous_missing" });
		const sent = await call(client, "frontend_send", { requestId: "fresh-request-01", text: "x" });
		expect(sent.structuredContent).toMatchObject({ status: "sent" });
		const conflict = await call(client, "frontend_send", {
			requestId: "fresh-request-01",
			text: "different",
		});
		expect(JSON.stringify(replay)).toBe(JSON.stringify(conflict));
		expect(f.stats()[0].clicks).toBe(1);
	});

	it("accepts a valid ES256 grant through the official client", async () => {
		const f = await fixture();
		const client = await f.connect(await f.token({}, "ES256"));
		const result = await call(client, "frontend_status", { requestId: "unknown-es-request" });
		expect(result.structuredContent).toMatchObject({ code: "request_missing" });
		expect(f.stats()[0]).toEqual({ clicks: 0, probes: 0, ui: 0 });
	});

	it.each([
		"origin",
		"query-token",
		"body-token",
		"method",
		"content-type",
	] as const)("rejects invalid %s before frontend effects", async (kind) => {
		const f = await fixture(),
			bearer = await f.token();
		let response: Response;
		if (kind === "origin")
			response = await f.post(bearer, undefined, { origin: "https://untrusted.example.test" });
		else if (kind === "body-token")
			response = await f.post(bearer, {
				jsonrpc: "2.0",
				id: 1,
				method: "ping",
				access_token: bearer,
			});
		else if (kind === "content-type")
			response = await f.post(bearer, undefined, { "content-type": "text/plain" });
		else
			response = await f.fetch(
				`${f.base}/mcp${kind === "query-token" ? `?access_token=${bearer}` : ""}`,
				{
					method: kind === "method" ? "DELETE" : "POST",
					headers: {
						host: "auracall.example.test",
						authorization: `Bearer ${bearer}`,
						"content-type": "application/json",
					},
					body: "{}",
				},
			);
		expect(response.status).toBe(
			{ origin: 403, "query-token": 400, "body-token": 400, method: 405, "content-type": 415 }[
				kind
			],
		);
		expect(await response.text()).not.toContain(bearer);
		expect(f.stats()).toEqual([
			{ clicks: 0, probes: 0, ui: 0 },
			{ clicks: 0, probes: 0, ui: 0 },
		]);
	});

	it.each([
		"signature",
		"issuer",
		"audience",
		"multiple-audiences",
		"expired",
		"future",
		"missing-exp",
		"missing-sub",
		"wrong-sub",
		"hs256",
		"none",
	] as const)("rejects %s without touching the real frontend service", async (kind) => {
		const f = await fixture();
		let bearer: string;
		if (kind === "signature") {
			const parts = (await f.token()).split(".");
			parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
			bearer = parts.join(".");
		} else if (kind === "none") {
			bearer = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from("{}").toString("base64url")}.`;
		} else if (kind === "hs256") bearer = await f.token({}, "HS256");
		else {
			const cases: Record<string, JWTPayload> = {
				issuer: { iss: "https://wrong.example.test" },
				audience: { aud: "https://other.example.test/mcp" },
				"multiple-audiences": { aud: [resource, "https://other.example.test/mcp"] },
				expired: { exp: Math.floor(Date.now() / 1000) - 60 },
				future: { nbf: Math.floor(Date.now() / 1000) + 60 },
				"missing-exp": { exp: undefined },
				"missing-sub": { sub: undefined },
				"wrong-sub": { sub: "OTHER-OWNER" },
			};
			bearer = await f.token(cases[kind]);
		}
		const response = await f.post(bearer);
		expect(response.status).toBe(kind === "wrong-sub" ? 403 : 401);
		expect(f.stats()).toEqual([
			{ clicks: 0, probes: 0, ui: 0 },
			{ clicks: 0, probes: 0, ui: 0 },
		]);
		expect(await response.text()).not.toContain(bearer);
	});

	it.each([
		["frontend_inspect", "frontend:send", "frontend:read", {}],
		["frontend_status", "frontend:send", "frontend:read", { requestId: "scope-request-01" }],
		[
			"frontend_send",
			"frontend:read",
			"frontend:send",
			{ requestId: "scope-request-01", text: "x" },
		],
		["frontend_configure", "frontend:read", "frontend:configure", { effort: "pro" }],
	] as const)("requires the exact scope for %s", async (name, granted, required, args) => {
		const f = await fixture();
		const bearer = await f.token({ scope: granted });
		const client = await f.connect(bearer);
		await expect(call(client, name, args)).rejects.toMatchObject({ code: 403 });
		const response = await f.post(bearer, {
			jsonrpc: "2.0",
			id: 22,
			method: "tools/call",
			params: { name, arguments: { routeId: "public", ...args } },
		});
		expect(response.status).toBe(403);
		expect(response.headers.get("www-authenticate")).toContain(`scope="${required}"`);
		expect(f.stats()[0]).toEqual({ clicks: 0, probes: 0, ui: 0 });
	});

	it("rejects duplicate bearer headers and ungranted routes", async () => {
		const f = await fixture();
		const duplicate = await f.duplicate(await f.token());
		expect(duplicate.status).toBe(401);
		const client = await f.connect();
		const hidden = await call(client, "frontend_status", {
			routeId: "hidden",
			requestId: "any-request-01",
		});
		const absent = await call(client, "frontend_status", {
			routeId: "no-such-route",
			requestId: "any-request-01",
		});
		expect(JSON.stringify(hidden)).toBe(JSON.stringify(absent));
		expect(f.stats()).toEqual([
			{ clicks: 0, probes: 0, ui: 0 },
			{ clicks: 0, probes: 0, ui: 0 },
		]);
	});

	it("allows one concurrent send per target across HTTP clients", async () => {
		const f = await fixture();
		const a = await f.connect(),
			b = await f.connect();
		const results = await Promise.all([
			call(a, "frontend_send", { requestId: "parallel-http-01", text: "one" }),
			call(b, "frontend_send", { requestId: "parallel-http-02", text: "two" }),
		]);
		const receipts = results.map((r) => r.structuredContent as Record<string, unknown>);
		expect(receipts.filter((r) => r.status === "sent")).toHaveLength(1);
		expect(
			receipts.filter((r) =>
				["lock_held", "lock_unproven", "request_unresolved"].includes(String(r.code)),
			),
		).toHaveLength(1);
		expect(f.stats()[0].clicks).toBe(1);
	});

	it("reads two linked replies after HTTP and service restart without resending or leaking grants", async () => {
		const f = await fixture();
		const logs = [
			vi.spyOn(console, "error").mockImplementation(() => {}),
			vi.spyOn(console, "warn").mockImplementation(() => {}),
			vi.spyOn(console, "log").mockImplementation(() => {}),
		];
		const bearer = await f.token();
		let client = await f.connect(bearer);
		await call(client, "frontend_send", { requestId: "first-http-01", text: "remember BLUE-17" });
		const first = await call(client, "frontend_status", { requestId: "first-http-01" });
		expect(first.structuredContent).toMatchObject({ status: "completed", output: "BLUE-17" });
		const text = `Use your actual reply ${(first.structuredContent as { output: string }).output}`;
		await call(client, "frontend_send", {
			requestId: "second-http-01",
			previousRequestId: "first-http-01",
			text,
		});
		const second = await call(client, "frontend_status", { requestId: "second-http-01" });
		expect(second.structuredContent).toMatchObject({
			status: "completed",
			previousRequestId: "first-http-01",
			output: "BLUE-17 remembered",
		});
		const counts = f.stats();
		await f.restart();
		client = await f.connect(bearer);
		const recovered = await call(client, "frontend_status", { requestId: "second-http-01" });
		const replay = await call(client, "frontend_send", {
			requestId: "second-http-01",
			previousRequestId: "first-http-01",
			text,
		});
		expect(recovered).toEqual(second);
		expect(replay).toEqual(second);
		expect(f.stats()).toEqual(counts);
		expect(counts[0].clicks).toBe(2);
		expect(f.brokerRequests.length).toBeGreaterThan(0);
		for (const serialized of [
			JSON.stringify(f.brokerRequests),
			JSON.stringify(f.responses),
			JSON.stringify(logs.map((log) => log.mock.calls)),
		]) {
			expect(serialized).not.toContain(bearer);
			expect(serialized).not.toContain(subject);
			expect(serialized).not.toContain("CLAIM-CANARY");
		}
	});
});
