import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpFrontend } from "../src/browser/frontends/mcpClient.js";
import * as integrationModule from "../src/browser/frontends/nativeCallbackIntegration.js";
import * as runtimeModule from "../src/browser/frontends/nativeRuntime.js";
import * as hostModule from "../src/mcp/http/nativeHost.js";
import { fixtureDispatchJoin, fixtureLedgerWriter } from "./browser/nativeDispatchFixture.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0)) await close();
	vi.restoreAllMocks();
});
const prompt = "Exact synthetic acceptance prompt λ";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
	const input = new PassThrough(),
		output = new PassThrough();
	let state = "active";
	const runtime = {
		route: { id: "synthetic-owned-route" },
		get state() {
			return state;
		},
		hold: vi.fn(async () => {
			state = "held";
		}),
	} as unknown as runtimeModule.OwnNativeProRuntime;
	let effort = "standard";
	const facade = {
		inspect: vi.fn(async () => ({ ok: true, provider: "chatgpt", effort })),
		configure: vi.fn(async (_id: string, value: string) => {
			effort = value;
			return { ok: true };
		}),
		send: vi.fn(async (_id: string, requestId: string) => ({
			ok: true,
			requestId,
			routeId: runtime.route.id,
		})),
		status: vi.fn(async (_id: string, requestId: string) => ({
			ok: true,
			requestId,
			routeId: runtime.route.id,
			previousRequestId: null,
			status: "completed",
			conversationUrl: "https://chatgpt.com/c/synthetic",
			output: "Complete reply λ\nFinal line 🧪",
		})),
	};
	const acquire = vi.spyOn(runtimeModule, "startOwnNativeRuntime").mockResolvedValue(runtime);
	const bind = vi.spyOn(runtimeModule, "bindOwnNativeSendFrontend").mockResolvedValue(facade);
	const execution = fixtureDispatchJoin();
	const options = {
		input: { kind: "auracall-own-sdk-runtime-input" as const },
		dependencies: {
			taskReceiver: vi.fn(),
			lifetime: {
				qualify: vi.fn(),
				assertCurrent: vi.fn(),
				acquired: vi.fn(),
				assertAcquiredCurrent: vi.fn(),
				retain: vi.fn(),
				uncertain: vi.fn(),
			},
			execution,
			writer: fixtureLedgerWriter(execution),
			readBudget: vi.fn(),
		},
		intent: {
			requestId: "synthetic-request",
			requestFingerprint: "a".repeat(64),
			promptDigest: createHash("sha256").update(prompt).digest("hex"),
			previousRequestId: null,
		},
		authority: { verify: vi.fn(), assertClaim: vi.fn(), protect: vi.fn(), assertCurrent: vi.fn() },
		channel: {
			input,
			output,
			routeId: runtime.route.id,
			assertCurrent: vi.fn(async (_check: unknown) => {}),
		},
	};
	cleanup.push(async () => {
		input.destroy();
		output.destroy();
	});
	return { options, runtime, facade, acquire, bind, input, output };
}

async function connect(f: ReturnType<typeof fixture>) {
	const host = await hostModule.startOwnNativeFrontendStdioHost(f.options);
	const client = new Client({ name: "synthetic-private-bastion", version: "1" });
	await client.connect(new StdioServerTransport(f.output, f.input));
	cleanup.unshift(async () => {
		await client.close();
		await host.server.close();
	});
	return { host, client };
}

it("exposes only four existing frontend tools on the SAME acquired finite facade over explicit streams", async () => {
	const f = fixture();
	const { host, client } = await connect(f);
	expect(host.runtime).toBe(f.runtime);
	expect(f.acquire).toHaveBeenCalledExactlyOnceWith(f.options.input, f.options.dependencies);
	expect(f.bind).toHaveBeenCalledExactlyOnceWith(f.runtime, f.options.intent, f.options.authority);
	expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
		"frontend_configure",
		"frontend_inspect",
		"frontend_send",
		"frontend_status",
	]);
	const frontend = createMcpFrontend(client, f.runtime.route.id);
	await frontend.configure(f.runtime.route.id, "pro");
	expect(await frontend.inspect(f.runtime.route.id)).toMatchObject({ effort: "pro" });
	await frontend.send(f.runtime.route.id, f.options.intent.requestId, prompt);
	expect(await frontend.status(f.runtime.route.id, f.options.intent.requestId)).toMatchObject({
		output: "Complete reply λ\nFinal line 🧪",
	});
	expect(f.facade.send).toHaveBeenCalledExactlyOnceWith(
		f.runtime.route.id,
		f.options.intent.requestId,
		prompt,
		undefined,
	);
	expect(f.options.channel.assertCurrent).toHaveBeenCalledWith(
		expect.objectContaining({
			stage: "before",
			scope: "frontend:send",
			routeId: f.runtime.route.id,
			intent: f.options.intent,
		}),
	);
	expect(f.options.channel.assertCurrent).toHaveBeenCalledWith(
		expect.objectContaining({ stage: "after", scope: "frontend:send" }),
	);
});

it("refuses missing or denied private channel authority before acquisition", async () => {
	const f = fixture();
	f.options.channel.assertCurrent.mockRejectedValue(new Error("private peer detail"));
	await expect(hostModule.startOwnNativeFrontendStdioHost(f.options)).rejects.toThrow();
	expect(f.acquire).not.toHaveBeenCalled();
	expect(f.bind).not.toHaveBeenCalled();
});

it.each([
	"wrong-route",
	"denied-scope",
	"hold-during-after",
])("holds %s without another acquisition or send", async (mode) => {
	const f = fixture();
	const { client } = await connect(f);
	let before = 0;
	f.options.channel.assertCurrent.mockImplementation(async (raw) => {
		const check = raw as { stage: string };
		if (check.stage === "before") before++;
		if (mode === "denied-scope" || (mode === "hold-during-after" && check.stage === "after"))
			throw new Error("private proof lost");
	});
	const r = await client.callTool({
		name: "frontend_inspect",
		arguments: { routeId: mode === "wrong-route" ? "unowned" : f.runtime.route.id },
	});
	expect(r.isError).toBe(true);
	expect(JSON.stringify(r)).not.toContain("private proof lost");
	expect(f.facade.inspect).toHaveBeenCalledTimes(mode === "hold-during-after" ? 1 : 0);
	await client.callTool({
		name: "frontend_send",
		arguments: { routeId: f.runtime.route.id, requestId: f.options.intent.requestId, text: prompt },
	});
	expect(f.facade.send).not.toHaveBeenCalled();
	expect(f.runtime.state).toBe("held");
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(before).toBeLessThanOrEqual(1);
});

it("holds the same runtime on private input EOF without browser release or reconnect", async () => {
	const f = fixture();
	await connect(f);
	f.input.end();
	await tick();
	expect(f.runtime.state).toBe("held");
	expect(f.runtime.hold).toHaveBeenCalledOnce();
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(f.facade.send).not.toHaveBeenCalled();
});

it("retains the acquired original when the private channel closes during acquisition", async () => {
	const f = fixture();
	f.acquire.mockImplementation(async () => {
		f.input.destroy();
		await tick();
		return f.runtime;
	});
	const error = await hostModule.startOwnNativeFrontendStdioHost(f.options).catch((value) => value);
	expect(error).toBeInstanceOf(hostModule.NativeFrontendHostError);
	expect(error.runtime).toBe(f.runtime);
	expect(f.runtime.hold).toHaveBeenCalledOnce();
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(f.facade.send).not.toHaveBeenCalled();
});

it("does not dispatch a tool after malformed framing in the same input chunk", async () => {
	const f = fixture();
	await connect(f);
	f.input.write(
		"broken JSON\n" +
			JSON.stringify({
				jsonrpc: "2.0",
				id: 100,
				method: "tools/call",
				params: { name: "frontend_inspect", arguments: { routeId: f.runtime.route.id } },
			}) +
			"\n",
	);
	await tick();
	expect(f.runtime.state).toBe("held");
	expect(f.facade.inspect).not.toHaveBeenCalled();
	expect(f.runtime.hold).toHaveBeenCalledOnce();
});

it("creates only one original accounted integration and forwards its exact authority and dependencies", async () => {
	const f = fixture();
	const transport = Object.freeze({}) as never;
	const accounting = Object.freeze({}) as never;
	const integration = vi
		.spyOn(integrationModule, "createOriginalAccountedNativeCallbackIntegration")
		.mockResolvedValue({ dependencies: f.options.dependencies, authority: f.options.authority });
	const host = await hostModule.startOriginalAccountedNativeFrontendStdioHost({
		input: f.options.input,
		intent: f.options.intent,
		channel: f.options.channel,
		transport,
		accounting,
	});
	cleanup.unshift(async () => {
		await host.server.close();
	});
	expect(integration).toHaveBeenCalledExactlyOnceWith(f.options.input, transport, accounting);
	expect(f.acquire).toHaveBeenCalledExactlyOnceWith(f.options.input, f.options.dependencies);
	expect(f.bind).toHaveBeenCalledExactlyOnceWith(f.runtime, f.options.intent, f.options.authority);
});
