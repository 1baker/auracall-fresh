import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createFrontendHttpServer } from "../src/mcp/http/server.js";
import { RelayStore } from "../src/mcp/relay/store.js";

describe("relay over the existing OAuth HTTP MCP transport", () => {
	it("discovers relay-only tools and returns an exact full linked reply through actual HTTP", async () => {
		const root = await mkdtemp(join(tmpdir(), "auracall-relay-http-"));
		const issuer = "https://issuer.example.test",
			resource = "https://relay.example.test/mcp";
		const keys = await generateKeyPair("RS256");
		const publicKey = { ...(await exportJWK(keys.publicKey)), kid: "fixture", alg: "RS256" };
		const store = new RelayStore(root, "fixture-owner");
		const server = createFrontendHttpServer({
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
		const makeToken = (scope: string) =>
			new SignJWT({ scope })
				.setProtectedHeader({ alg: "RS256", kid: "fixture", typ: "at+jwt" })
				.setIssuer(issuer)
				.setAudience(resource)
				.setSubject("fixture-owner")
				.setExpirationTime("5m")
				.sign(keys.privateKey);
		const token = await makeToken("relay:read relay:dispatch relay:reply");
		const post = (body: unknown, bearer: string | null = token) =>
			new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
				const req = httpRequest(
					{
						hostname: "127.0.0.1",
						port: address.port,
						path: "/mcp",
						method: "POST",
						headers: {
							host: "relay.example.test",
							accept: "application/json, text/event-stream",
							"content-type": "application/json",
							...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
						},
					},
					(res) => {
						const chunks: Buffer[] = [];
						res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
						res.on("error", reject);
						res.on("end", () =>
							resolve({
								status: res.statusCode ?? 0,
								body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
							}),
						);
					},
				);
				req.on("error", reject);
				req.end(JSON.stringify(body));
			});
		const rpc = async (method: string, params: unknown) => {
			const response = await post({ jsonrpc: "2.0", id: 1, method, params });
			expect(response.status).toBe(200);
			expect(response.body.error).toBeUndefined();
			return response.body.result as Record<string, unknown>;
		};
		const call = async (name: string, args: unknown) =>
			(await rpc("tools/call", { name, arguments: args })).structuredContent as Record<
				string,
				unknown
			>;
		try {
			expect((await post({}, null)).status).toBe(401);
			await rpc("initialize", {
				protocolVersion: "2025-06-18",
				clientInfo: { name: "synthetic-relay-client", version: "1" },
				capabilities: {},
			});
			const tools = (await rpc("tools/list", {})).tools as {
				name: string;
				[key: string]: unknown;
			}[];
			expect(tools.map((x) => x.name).sort()).toEqual([
				"relay_claim",
				"relay_hold",
				"relay_open",
				"relay_reply",
				"relay_request",
				"relay_status",
			]);
			for (const name of ["relay_request", "relay_status", "relay_claim", "relay_hold"]) {
				const metadata = tools.find((tool) => tool.name === name)?._meta as Record<string, unknown>;
				expect(metadata["openai/widgetAccessible"]).toBe(true);
			}
			const job = await store.enqueue({
				requestId: "http_request_01",
				prompt: "Return a complete useful answer",
			});
			const denied = await post(
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "relay_claim", arguments: job },
				},
				await makeToken("relay:read"),
			);
			expect(denied.status).toBe(403);
			expect((await store.status(job.requestId)).state).toBe("ready");
			expect(
				(
					await post(
						{ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
						await makeToken("frontend:read"),
					)
				).status,
			).toBe(403);
			expect(await call("relay_request", { requestId: job.requestId })).toMatchObject({
				prompt: "Return a complete useful answer",
			});
			const claim = await call("relay_claim", job);
			expect(claim.fresh).toBe(true);
			const text = `${"No truncation: αβ and µm\n".repeat(4000)}COMPLETE END`;
			await call("relay_reply", { requestId: job.requestId, claimId: claim.claimId, text });
			expect(await call("relay_status", { requestId: job.requestId })).toMatchObject({
				state: "replied",
				reply: { text, providerResponseId: null, liveVerified: false },
			});
			expect((await new RelayStore(root, "fixture-owner").status(job.requestId)).reply?.text).toBe(
				text,
			);
			const next = await store.enqueue({
				requestId: "http_request_02",
				prompt: "Continue the prior answer",
				previousRequestId: job.requestId,
			});
			expect(await call("relay_request", { requestId: next.requestId })).toMatchObject({
				previousRequestId: job.requestId,
				previousReply: { text },
			});
			const panel = await rpc("resources/read", { uri: "ui://auracall/relay.html" });
			expect((panel.contents as { text: string }[])[0].text).toContain("Ask ChatGPT");
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			await rm(root, { recursive: true, force: true });
		}
	});
});
