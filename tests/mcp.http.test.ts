import { once } from "node:events";
import { request as httpRequest, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrontendTools } from "../src/browser/frontends/config.js";
import { createFrontendHttpServer } from "../src/mcp/http/server.js";

const resource = "https://auracall.example.test/mcp";
const issuer = "https://issuer.example.test";
const servers: Server[] = [];
const clients: Client[] = [];

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
	await Promise.all(
		servers.splice(0).map(async (server) => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}),
	);
});

async function fixture() {
	const keys = await generateKeyPair("RS256");
	const jwk = { ...(await exportJWK(keys.publicKey)), kid: "public-fixture", alg: "RS256" };
	const service = {
		inspect: vi.fn(async () => ({ ok: true, effort: "pro" })),
		configure: vi.fn(async () => ({ ok: true })),
		send: vi.fn(async () => ({ ok: true })),
		status: vi.fn(async () => ({ ok: true })),
	} satisfies FrontendTools;
	const dispatch = { created: 0 };
	const server = createFrontendHttpServer({
		config: {
			resource,
			issuer,
			jwksUri: `${issuer}/jwks`,
			subject: "owner-public-fixture",
			routeIds: ["frontend-fixture"],
			port: 3100,
		},
		service,
		keyResolver: createLocalJWKSet({ keys: [jwk] }),
		createMcpServer: () => {
			dispatch.created++;
			return new McpServer({ name: "bounded-http-fixture", version: "1" });
		},
	});
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Fixture did not bind loopback");
	const base = `http://127.0.0.1:${address.port}`;
	const token = await new SignJWT({ scope: "frontend:read frontend:send frontend:configure" })
		.setProtectedHeader({ alg: "RS256", kid: "public-fixture", typ: "at+jwt" })
		.setIssuer(issuer)
		.setAudience(resource)
		.setSubject("owner-public-fixture")
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(keys.privateKey);
	const headers = { host: "auracall.example.test" };
	// Real Node HTTP preserves the ingress Host that undici's fetch drops.
	// Requests stay on loopback; the application's Host allowlist is unchanged.
	const nativeFetch: typeof fetch = async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		if (url.origin !== base) throw new Error("Fixture request left loopback");
		return new Promise<Response>((resolve, reject) => {
			const request = httpRequest(
				url,
				{
					method: init?.method ?? "GET",
					headers: Object.fromEntries(new Headers(init?.headers)),
				},
				(response) => {
					const chunks: Buffer[] = [];
					response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
					response.once("error", reject);
					response.once("end", () =>
						resolve(
							new Response(
								init?.method === "HEAD" || response.statusCode === 204
									? null
									: Buffer.concat(chunks),
								{
									status: response.statusCode,
									headers: response.headers as Record<string, string>,
								},
							),
						),
					);
				},
			);
			request.once("error", reject);
			const abort = () => request.destroy(new Error("Fixture request aborted"));
			init?.signal?.addEventListener("abort", abort, { once: true });
			request.once("close", () => init?.signal?.removeEventListener("abort", abort));
			if (init?.body && typeof init.body !== "string") throw new Error("Unexpected fixture body");
			request.end(init?.body ?? undefined);
		});
	};
	return { server, base, token, service, headers, fetch: nativeFetch, dispatch };
}

describe("OAuth frontend MCP over real loopback HTTP", () => {
	it("discovers the protected resource, refuses anonymous input, and lists only frontend tools", async () => {
		const f = await fixture();
		for (const path of [
			"/.well-known/oauth-protected-resource",
			"/.well-known/oauth-protected-resource/mcp",
		]) {
			const result = await f.fetch(f.base + path, { headers: f.headers });
			expect(result.status).toBe(200);
			expect(await result.json()).toMatchObject({
				resource,
				authorization_servers: [issuer],
				bearer_methods_supported: ["header"],
			});
		}
		const unauthorized = await f.fetch(`${f.base}/mcp`, {
			method: "POST",
			headers: { ...f.headers, "content-type": "application/json" },
			body: "{}",
		});
		expect(unauthorized.status).toBe(401);
		expect(unauthorized.headers.get("www-authenticate")).toContain(
			'resource_metadata="https://auracall.example.test/.well-known/oauth-protected-resource/mcp"',
		);
		expect(unauthorized.headers.get("www-authenticate")).toContain('scope="frontend:read"');
		const wrongHost = await f.fetch(`${f.base}/mcp`, {
			method: "POST",
			headers: { ...f.headers, host: "evil.test", authorization: `Bearer ${f.token}` },
			body: "{}",
		});
		expect(wrongHost.status).toBe(403);
		expect(await wrongHost.json()).toEqual({ error: "request_origin_denied" });
		expect(f.dispatch.created).toBe(0);
		const client = new Client({ name: "public-http-fixture", version: "1" });
		clients.push(client);
		await client.connect(
			new StreamableHTTPClientTransport(new URL(`${f.base}/mcp`), {
				requestInit: { headers: { ...f.headers, authorization: `Bearer ${f.token}` } },
				fetch: f.fetch,
			}),
		);
		expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
			"frontend_configure",
			"frontend_inspect",
			"frontend_send",
			"frontend_status",
		]);
		expect(f.service.inspect).not.toHaveBeenCalled();
		expect(f.service.send).not.toHaveBeenCalled();
	});

	it.each([
		"oversize",
		"deep",
		"nodes",
		"batch",
	] as const)("refuses %s before constructing an MCP server or calling a frontend", async (kind) => {
		const f = await fixture();
		let body: string;
		const expected = {
			oversize: [413, "request_too_large"],
			deep: [400, "request_too_complex"],
			nodes: [400, "request_too_complex"],
			batch: [400, -32600],
		} as const;
		if (kind === "oversize") body = " ".repeat(65537);
		else if (kind === "batch") body = '[{"jsonrpc":"2.0","id":1,"method":"ping"}]';
		else if (kind === "nodes")
			body = JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "ping",
				params: { values: Array(2050).fill(0) },
			});
		else {
			let nested: unknown = "leaf";
			for (let i = 0; i < 18; i++) nested = { next: nested };
			body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: nested });
		}
		const response = await f.fetch(`${f.base}/mcp`, {
			method: "POST",
			headers: {
				...f.headers,
				authorization: `Bearer ${f.token}`,
				"content-type": "application/json",
			},
			body,
		});
		expect(response.status).toBe(expected[kind][0]);
		const result = (await response.json()) as { error: string | { code: number } };
		expect(typeof result.error === "string" ? result.error : result.error.code).toBe(
			expected[kind][1],
		);
		expect(f.dispatch.created).toBe(0);
		for (const action of Object.values(f.service)) expect(action).not.toHaveBeenCalled();
	});
});
