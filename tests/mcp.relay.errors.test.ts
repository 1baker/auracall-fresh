import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createFrontendHttpServer } from "../src/mcp/http/server.js";
import { RelayError, RelayStore } from "../src/mcp/relay/store.js";

/**
 * Synthetic error-boundary characterization for the relay read tools.
 * Uses generated fixture keys, a temporary relay directory and a loopback
 * listener only. It cannot establish the cause of any deployed failure.
 */
const issuer = "https://issuer.example.test";
const resource = "https://relay.example.test/mcp";
const requestId = "fixture-request-0001";
const secretPrompt = "SYNTHETIC-PROMPT-DO-NOT-ECHO";
const secretPath = "/synthetic/private/relay/path";
const metaKey = "_meta";
const fingerprint = "a".repeat(64);
const fixtures = {
	request: { requestId, prompt: "full", fingerprint, previousRequestId: null, previousReply: null },
	status: {
		requestId,
		fingerprint,
		state: "approved",
		claimId: null,
		reply: null,
		liveVerified: false as const,
	},
};

type Reply = { status: number; text: string; body: Record<string, unknown> };

let root = "";
let token = "";
let port = 0;
let server: ReturnType<typeof createFrontendHttpServer>;

const post = (body: unknown): Promise<Reply> =>
	new Promise((resolve, reject) => {
		const req = httpRequest(
			{
				hostname: "127.0.0.1",
				port,
				path: "/mcp",
				method: "POST",
				headers: {
					host: "relay.example.test",
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
				res.on("error", reject);
				res.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					resolve({ status: res.statusCode ?? 0, text, body: text ? JSON.parse(text) : {} });
				});
			},
		);
		req.on("error", reject);
		req.end(JSON.stringify(body));
	});

const callTool = (params: unknown) => post({ jsonrpc: "2.0", id: 7, method: "tools/call", params });

const expectNoDisclosure = (reply: Reply) => {
	expect(reply.text).not.toContain(token);
	expect(reply.text).not.toContain(secretPrompt);
	expect(reply.text).not.toContain(secretPath);
	expect(reply.text).not.toMatch(/\bat .+\.(?:ts|js):\d+/);
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "auracall-relay-errors-"));
	const keys = await generateKeyPair("RS256");
	const publicKey = { ...(await exportJWK(keys.publicKey)), kid: "fixture", alg: "RS256" };
	server = createFrontendHttpServer({
		config: {
			mode: "relay",
			resource,
			issuer,
			jwksUri: `${issuer}/jwks`,
			subject: "fixture-owner",
			relayDirectory: root,
		},
		keyResolver: createLocalJWKSet({ keys: [publicKey] }),
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw Error("No loopback listener");
	port = address.port;
	token = await new SignJWT({ scope: "relay:read" })
		.setProtectedHeader({ alg: "RS256", kid: "fixture", typ: "at+jwt" })
		.setIssuer(issuer)
		.setAudience(resource)
		.setSubject("fixture-owner")
		.setExpirationTime("5m")
		.sign(keys.privateKey);
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	server.close();
	await rm(root, { recursive: true, force: true });
});

describe.each([
	["relay_request", "request"],
	["relay_status", "status"],
] as const)("%s store failures stay tool results, not JSON-RPC errors", (tool, method) => {
	it("maps a named RelayError to its code", async () => {
		vi.spyOn(RelayStore.prototype, method).mockRejectedValue(new RelayError("request_not_found"));
		const reply = await callTool({ name: tool, arguments: { requestId } });
		expect(reply.status).toBe(200);
		expect(reply.body.error).toBeUndefined();
		const result = reply.body.result as Record<string, unknown>;
		expect(result.isError).toBe(true);
		expect(result.structuredContent).toEqual({ ok: false, code: "request_not_found" });
		expectNoDisclosure(reply);
	});

	it("maps an ordinary error, even one carrying a numeric code, to relay_failed without its message", async () => {
		const error = Object.assign(new Error(`${secretPrompt} at ${secretPath}`), { code: -32603 });
		vi.spyOn(RelayStore.prototype, method).mockRejectedValue(error);
		const reply = await callTool({ name: tool, arguments: { requestId } });
		expect(reply.status).toBe(200);
		expect(reply.body.error).toBeUndefined();
		const result = reply.body.result as Record<string, unknown>;
		expect(result.isError).toBe(true);
		expect(result.structuredContent).toEqual({ ok: false, code: "relay_failed" });
		expectNoDisclosure(reply);
	});

	it("returns a full successful payload unchanged", async () => {
		vi.spyOn(RelayStore.prototype, method).mockResolvedValue(fixtures[method] as never);
		const reply = await callTool({ name: tool, arguments: { requestId } });
		const result = reply.body.result as Record<string, unknown>;
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual({ ok: true, ...fixtures[method] });
	});

	it.each([
		["malformed request ID", { requestId: "bad id!" }],
		["missing request ID", {}],
		["unknown extra argument", { requestId, extra: true }],
	])("reports %s as a tool input error before the store is read", async (_label, args) => {
		const spy = vi.spyOn(RelayStore.prototype, method);
		const reply = await callTool({ name: tool, arguments: args });
		expect(reply.status).toBe(200);
		expect(reply.body.error).toBeUndefined();
		const result = reply.body.result as Record<string, unknown>;
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain("Input validation error");
		expect(spy).not.toHaveBeenCalled();
		expectNoDisclosure(reply);
	});
});

describe("pre-handler framework boundary", () => {
	it("reports an unknown tool as a tool result", async () => {
		const reply = await callTool({ name: "relay_missing", arguments: {} });
		expect(reply.status).toBe(200);
		expect((reply.body.result as Record<string, unknown>).isError).toBe(true);
	});

	// SDK 1.32.0 parses the tools/call envelope before any tool handler and maps
	// a parse failure to the generic -32603 internal error. The HTTP layer now
	// checks the same SDK schema first and answers -32602 invalid params. This
	// is one local -32603 path; it is not evidence of the deployed cause.
	it.each([
		["arguments as a string", { name: "relay_request", arguments: "requestId" }],
		["arguments as an array", { name: "relay_status", arguments: [requestId] }],
		["arguments as null", { name: "relay_request", arguments: null }],
		["missing tool name", { arguments: { requestId } }],
	])("returns JSON-RPC -32602 invalid params for %s", async (_label, params) => {
		const read = vi.spyOn(RelayStore.prototype, "request");
		const status = vi.spyOn(RelayStore.prototype, "status");
		const reply = await callTool(params);
		expect(reply.status).toBe(200);
		expect(reply.body).toEqual({
			jsonrpc: "2.0",
			id: 7,
			error: { code: -32602, message: "Invalid params" },
		});
		expect(read).not.toHaveBeenCalled();
		expect(status).not.toHaveBeenCalled();
		expectNoDisclosure(reply);
	});

	// Characterizes SDK 1.32.0 transport validation: these never reach request
	// dispatch, so they are HTTP 400 transport refusals, not -32603.
	it.each([
		["non-object params", "relay_request"],
		[
			"malformed progress token",
			{ name: "relay_status", arguments: { requestId }, [metaKey]: { progressToken: {} } },
		],
	])("refuses %s at the transport with HTTP 400", async (_label, params) => {
		const read = vi.spyOn(RelayStore.prototype, "request");
		const status = vi.spyOn(RelayStore.prototype, "status");
		const reply = await callTool(params);
		expect(reply.status).toBe(400);
		expect((reply.body.error as Record<string, unknown>).code).not.toBe(-32603);
		expect(read).not.toHaveBeenCalled();
		expect(status).not.toHaveBeenCalled();
		expectNoDisclosure(reply);
	});
});

describe("notification and scope boundaries", () => {
	it.each([
		["valid arguments", { requestId }],
		["malformed arguments", null],
	])("keeps %s notifications response-free", async (_label, args) => {
		const read = vi.spyOn(RelayStore.prototype, "request");
		const reply = await post({
			jsonrpc: "2.0",
			method: "tools/call",
			params: { name: "relay_request", arguments: args },
		});
		expect(reply.status).toBe(202);
		expect(reply.text).toBe("");
		expect(read).not.toHaveBeenCalled();
	});

	it("preserves scope refusal before malformed-envelope validation", async () => {
		const write = vi.spyOn(RelayStore.prototype, "submit");
		const reply = await callTool({ name: "relay_reply", arguments: null });
		expect(reply.status).toBe(403);
		expect(reply.body).toEqual({ error: "insufficient_scope" });
		expect(write).not.toHaveBeenCalled();
		expectNoDisclosure(reply);
	});
});

describe("independent POST lifecycle", () => {
	it("serves a success after framework, input and store failures on the same listener", async () => {
		vi.spyOn(RelayStore.prototype, "status").mockRejectedValueOnce(new Error("synthetic"));
		await callTool({ name: "relay_request", arguments: null });
		await callTool({ name: "relay_status", arguments: { requestId: "bad id!" } });
		await callTool({ name: "relay_status", arguments: { requestId } });
		vi.spyOn(RelayStore.prototype, "request").mockResolvedValue(fixtures.request);
		const replies = await Promise.all(
			[1, 2, 3].map(() => callTool({ name: "relay_request", arguments: { requestId } })),
		);
		for (const reply of replies) {
			expect(reply.status).toBe(200);
			expect((reply.body.result as Record<string, unknown>).structuredContent).toEqual({
				ok: true,
				...fixtures.request,
			});
		}
	});
});
