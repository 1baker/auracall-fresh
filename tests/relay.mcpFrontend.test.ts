import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, it, vi } from "vitest";
import { createMcpFrontend } from "../src/browser/frontends/mcpClient.js";
import { dispatchRelayRequest } from "../src/mcp/relay/dispatch.js";
import { RelayStore } from "../src/mcp/relay/store.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

it.each([
	false,
	true,
])("uses existing MCP tools for Pro and full saved reply; lost Send ACK=%s", async (lostAck) => {
	const root = await mkdtemp(join(tmpdir(), "auracall-mcp-sender-synthetic-"));
	const store = new RelayStore(root, "synthetic-owner");
	const requestId = "automatic_first_01",
		routeId = "owned-route";
	const prompt = "  Exact prompt λ\n",
		answer = "Complete response αβ\n\nFinal line 🧪";
	const url = "https://chatgpt.com/c/synthetic-chat",
		model = "GPT fixture";
	await store.enqueue({ requestId, prompt });
	let effort = "standard",
		sends = 0;
	const events: string[] = [];
	const server = new McpServer({ name: "synthetic-owned-frontend", version: "1" });
	registerFrontendTools(server, {
		inspect: async (route) => {
			expect(route).toBe(routeId);
			events.push(`inspect:${effort}`);
			return { ok: true, provider: "chatgpt", routeId, url, model, effort };
		},
		configure: async (route, value) => {
			expect([route, value]).toEqual([routeId, "pro"]);
			events.push("configure");
			effort = "pro";
			return { ok: true, verified: true };
		},
		send: async (route, id, text, previous) => {
			expect(await store.status(id)).toMatchObject({ state: "awaiting_reply" });
			expect([route, id, text, previous]).toEqual([routeId, requestId, prompt, undefined]);
			sends++;
			events.push("send");
			return { ok: true, requestId: id, routeId: route, status: "sent" };
		},
		status: async (route, id) => ({
			ok: true,
			routeId: route,
			requestId: id,
			previousRequestId: null,
			conversationUrl: url,
			status: "completed",
			output: answer,
			liveVerified: false,
			assistantMessageId: null,
		}),
	});
	const client = new Client({ name: "synthetic-bastion-sender", version: "1" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(b);
	await client.connect(a);
	try {
		let drop = lostAck;
		const transport = {
			callTool: async (request: Parameters<Client["callTool"]>[0]) => {
				const result = await client.callTool(request);
				if (drop && request.name === "frontend_send") {
					drop = false;
					throw new Error("PRIVATE transport detail");
				}
				return result;
			},
		};
		const options = {
			store,
			frontend: createMcpFrontend(transport, routeId),
			requestId,
			routeId,
			expectedUrl: url,
			expectedModel: model,
			pollIntervalMs: 0,
			maxStatusChecks: 1,
		};
		let returned = await dispatchRelayRequest(options);
		if (lostAck) {
			expect(returned).toMatchObject({
				state: "held_unknown",
				reply: null,
				code: "mcp_frontend_transport_unresolved",
			});
			expect(JSON.stringify(returned)).not.toContain("PRIVATE");
			returned = await dispatchRelayRequest(options);
		}
		expect(returned).toMatchObject({
			requestId,
			state: "replied",
			reply: { text: answer, liveVerified: false, providerResponseId: null },
		});
		expect(await new RelayStore(root, "synthetic-owner").status(requestId)).toEqual(returned);
		expect(await dispatchRelayRequest(options)).toEqual(returned);
		expect(sends).toBe(1);
		expect(events).toEqual(["inspect:standard", "configure", "inspect:pro", "send"]);
	} finally {
		await client.close();
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});

const wire = (data: Record<string, unknown>) => ({
	structuredContent: data,
	content: [{ type: "text", text: JSON.stringify(data) }],
});
it("binds one route and forwards the exact linked request without a relabel", async () => {
	const callTool = vi.fn(async () => wire({ ok: true }));
	const frontend = createMcpFrontend({ callTool }, "owned-route");
	await frontend.send("owned-route", "current_request", "  λ\n", "previous_request");
	expect(callTool).toHaveBeenLastCalledWith({
		name: "frontend_send",
		arguments: {
			routeId: "owned-route",
			requestId: "current_request",
			text: "  λ\n",
			previousRequestId: "previous_request",
		},
	});
	await expect(frontend.inspect("borrowed-route")).rejects.toMatchObject({
		code: "mcp_frontend_binding_mismatch",
	});
	expect(callTool).toHaveBeenCalledOnce();
});

it.each([
	["missing structured content", { content: [{ type: "text", text: "{}" }] }],
	[
		"conflicting copies",
		{
			structuredContent: { ok: true },
			content: [{ type: "text", text: '{"ok":true,"status":"completed"}' }],
		},
	],
	["non-JSON text", { structuredContent: { ok: true }, content: [{ type: "text", text: "ACK" }] }],
	[
		"extra content",
		{
			structuredContent: { ok: true },
			content: [
				{ type: "text", text: '{"ok":true}' },
				{ type: "text", text: "PRIVATE" },
			],
		},
	],
	["queued ACK", wire({ accepted: true })],
	["oversized reply", wire({ ok: true, output: "x".repeat(1048577) })],
])("refuses %s without clipping or retrying", async (_label, response) => {
	const callTool = vi.fn(async () => response);
	await expect(
		createMcpFrontend({ callTool }, "owned-route").status("owned-route", "original_request"),
	).rejects.toMatchObject({ code: "mcp_frontend_protocol" });
	expect(callTool).toHaveBeenCalledOnce();
});

it("preserves the explicit menu hold but does not echo remote private errors", async () => {
	const callTool = vi.fn(async () => ({
		isError: true,
		...wire({
			ok: false,
			code: "native_intelligence_unqualified",
			menuMayBeOpen: true,
			message: "PRIVATE",
		}),
	}));
	const failure = await createMcpFrontend({ callTool }, "owned-route")
		.configure("owned-route", "pro")
		.catch((e: unknown) => e);
	expect(failure).toMatchObject({ code: "native_intelligence_unqualified", menuMayBeOpen: true });
	expect(String(failure)).not.toContain("PRIVATE");
	expect(callTool).toHaveBeenCalledOnce();
});
