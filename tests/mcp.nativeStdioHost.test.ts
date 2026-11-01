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

function preparedFixture() {
	const f = fixture();
	const native = Object.freeze({ kind: "same-actor-native-accounting-integration" as const });
	const run = {
		assertCurrent: vi.fn(async () => {}),
		runProducer: vi.fn(
			async (_operation: unknown, start: () => Promise<{ value: unknown }>) =>
				(await start()).value,
		),
		linkNative: vi.fn(
			async (_actual: Parameters<integrationModule.PreparedNativeRun["linkNative"]>[0]) => native,
		),
		readOriginalTrace: vi.fn(),
		hold: vi.fn(),
	};
	const take = vi
		.spyOn(integrationModule, "takeRetainedPreparedNativeRun")
		.mockReturnValue(run as unknown as integrationModule.PreparedNativeRun);
	const takeNative = vi
		.spyOn(integrationModule, "takeRetainedNativeAccountingIntegration")
		.mockReturnValue({
			input: f.options.input,
			dependencies: f.options.dependencies,
			authority: f.options.authority,
		} as never);
	const prepared = Object.freeze({ kind: "same-actor-prepared-native-run" as const });
	return { ...f, native, run, take, takeNative, prepared };
}

it("connects the SAME prepared server before acquisition and promotes it once after actual link", async () => {
	const f = preparedFixture();
	const { prepared, run, take, takeNative, native } = f;
	const host = await hostModule.startPreparedNativeFrontendStdioHost({
		prepared,
		channel: f.options.channel,
		intent: f.options.intent,
	});
	const server = host.server;
	const client = new Client({ name: "synthetic-prepared-bastion", version: "1" });
	await client.connect(new StdioServerTransport(f.output, f.input));
	cleanup.unshift(async () => {
		await client.close();
		await server.close();
	});
	await client.ping();
	expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
		"frontend_configure",
		"frontend_inspect",
		"frontend_send",
		"frontend_status",
	]);
	expect(host.runtime).toBeUndefined();
	expect(run.assertCurrent).toHaveBeenCalled();
	expect(run.runProducer).not.toHaveBeenCalled();
	expect(f.acquire).not.toHaveBeenCalled();
	expect(f.bind).not.toHaveBeenCalled();
	const early = await client.callTool({
		name: "frontend_inspect",
		arguments: { routeId: f.runtime.route.id },
	});
	expect(early.isError).toBe(true);
	expect(f.facade.inspect).not.toHaveBeenCalled();
	const value = Symbol("same original producer");
	expect(await host.runProducer({} as never, async () => ({ value, trace: {} as never }))).toBe(
		value,
	);
	const actual = {
		input: f.options.input,
		ownerAuthority: {},
		producerTaskId: "synthetic-producer",
	};
	expect(await host.linkNative(actual)).toBe(f.runtime);
	expect(run.linkNative).toHaveBeenCalledExactlyOnceWith(actual);
	expect(take).toHaveBeenCalledExactlyOnceWith(prepared);
	expect(takeNative).toHaveBeenCalledExactlyOnceWith(native);
	expect(host.server).toBe(server);
	expect(host.runtime).toBe(f.runtime);
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(f.bind).toHaveBeenCalledOnce();
	await client.ping();
	const frontend = createMcpFrontend(client, f.runtime.route.id);
	await frontend.configure(f.runtime.route.id, "pro");
	expect(await frontend.inspect(f.runtime.route.id)).toMatchObject({ effort: "pro" });
	expect(f.facade.send).not.toHaveBeenCalled();
	await expect(host.linkNative(actual)).rejects.toThrow();
	expect(run.linkNative).toHaveBeenCalledOnce();
	expect(f.acquire).toHaveBeenCalledOnce();
});

it("holds the consumed prepared run if initial private channel validation fails", async () => {
	const f = preparedFixture();
	await expect(
		hostModule.startPreparedNativeFrontendStdioHost({
			prepared: f.prepared,
			intent: f.options.intent,
			channel: { ...f.options.channel, input: undefined as never },
		}),
	).rejects.toThrow();
	expect(f.run.hold).toHaveBeenCalled();
	expect(f.acquire).not.toHaveBeenCalled();
	expect(f.run.runProducer).not.toHaveBeenCalled();
});

async function connectPrepared(f: ReturnType<typeof preparedFixture>) {
	const host = await hostModule.startPreparedNativeFrontendStdioHost({
		prepared: f.prepared,
		intent: f.options.intent,
		channel: f.options.channel,
	});
	const client = new Client({ name: "synthetic-prepared-guard", version: "1" });
	await client.connect(new StdioServerTransport(f.output, f.input));
	cleanup.unshift(async () => {
		await client.close();
		await host.server.close();
	});
	return { host, client };
}

it("refuses a held prepared ping instead of an automatic pong or producer retry", async () => {
	const f = preparedFixture();
	const { host, client } = await connectPrepared(f);
	f.run.assertCurrent.mockRejectedValue(new Error("private guard refusal"));
	await expect(client.ping({ timeout: 500 })).rejects.toThrow("Retained prepared run is held");
	expect(f.run.hold).toHaveBeenCalled();
	await expect(host.runProducer({} as never, vi.fn())).rejects.toThrow();
	expect(f.run.runProducer).not.toHaveBeenCalled();
	expect(f.acquire).not.toHaveBeenCalled();
});

it("holds a cancelled prepared ping before its delayed guard can acknowledge", async () => {
	const f = preparedFixture();
	const { client } = await connectPrepared(f);
	let release!: () => void;
	f.run.assertCurrent.mockImplementationOnce(
		() =>
			new Promise<void>((r) => {
				release = r;
			}),
	);
	const abort = new AbortController();
	const pending = client.ping({ signal: abort.signal, timeout: 1000 });
	const rejected = expect(pending).rejects.toThrow();
	for (let i = 0; i < 30 && !release; ++i) await tick();
	expect(release).toBeTypeOf("function");
	abort.abort(new Error("synthetic cancellation"));
	await rejected;
	for (let i = 0; i < 30 && !f.run.hold.mock.calls.length; ++i) await tick();
	const heldBeforeAck = f.run.hold.mock.calls.length;
	release();
	await tick();
	expect(heldBeforeAck).toBeGreaterThan(0);
	expect(f.run.runProducer).not.toHaveBeenCalled();
	expect(f.acquire).not.toHaveBeenCalled();
});

it("rejects overlapping ping before a second peer check and holds the original producer", async () => {
	const f = preparedFixture();
	const { host, client } = await connectPrepared(f);
	let finish!: (value: { value: symbol; trace: never }) => void;
	const pending = host.runProducer(
		{} as never,
		() =>
			new Promise<{ value: symbol; trace: never }>((r) => {
				finish = r;
			}),
	);
	const failure = expect(pending).rejects.toThrow();
	for (let i = 0; i < 30 && !finish; ++i) await tick();
	expect(finish).toBeTypeOf("function");
	const checks = f.run.assertCurrent.mock.calls.length;
	await expect(client.ping({ timeout: 500 })).rejects.toThrow();
	expect(f.run.assertCurrent).toHaveBeenCalledTimes(checks);
	finish({ value: Symbol("retained original"), trace: {} as never });
	await failure;
	expect(f.run.runProducer).toHaveBeenCalledOnce();
	expect(f.acquire).not.toHaveBeenCalled();
	expect(f.facade.send).not.toHaveBeenCalled();
});

it("retains a late acquired runtime after prepared-channel EOF and never promotes again", async () => {
	const f = preparedFixture();
	const { host } = await connectPrepared(f);
	await host.runProducer({} as never, async () => ({ value: 1, trace: {} as never }));
	f.acquire.mockImplementation(async () => {
		f.input.end();
		await tick();
		return f.runtime;
	});
	const actual = {
		input: f.options.input,
		ownerAuthority: {},
		producerTaskId: "synthetic-producer",
	};
	await expect(host.linkNative(actual)).rejects.toThrow();
	expect(host.runtime).toBe(f.runtime);
	expect(f.runtime.state).toBe("held");
	await expect(host.linkNative(actual)).rejects.toThrow();
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(f.run.linkNative).toHaveBeenCalledOnce();
	expect(f.facade.send).not.toHaveBeenCalled();
});

it("captures exact producer and native-link inputs before awaited prepared guards", async () => {
	const f = preparedFixture();
	const { host } = await connectPrepared(f);
	let releaseProducer!: () => void;
	const producerGuard = new Promise<void>((r) => {
		releaseProducer = r;
	});
	const operation = {
		bindingDigest: "a".repeat(64),
		operationId: "00000000-0000-4000-8000-000000000001",
		operationRecord: {
			relativePath: "original-producer.json",
			identity: { device: "1", inode: "2", uid: 1000, mode: "0600" as const },
			size: 10,
			sha256: "b".repeat(64),
		},
	};
	f.run.assertCurrent.mockReturnValueOnce(producerGuard);
	const producer = host.runProducer(operation, async () => ({ value: 1, trace: {} as never }));
	await tick();
	operation.operationRecord.relativePath = "changed.json";
	releaseProducer();
	await producer;
	expect(f.run.runProducer.mock.calls[0][0]).toMatchObject({
		operationRecord: { relativePath: "original-producer.json" },
	});
	const actual = {
		input: f.options.input,
		ownerAuthority: { selected: "original" },
		producerTaskId: "original-producer",
	};
	let releaseNative!: () => void;
	const nativeGuard = new Promise<void>((r) => {
		releaseNative = r;
	});
	f.run.assertCurrent.mockReturnValueOnce(nativeGuard);
	const promotion = host.linkNative(actual);
	await tick();
	actual.ownerAuthority.selected = "changed";
	actual.producerTaskId = "changed-producer";
	releaseNative();
	await promotion;
	expect(f.run.linkNative.mock.calls[0][0]).toEqual({
		input: f.options.input,
		ownerAuthority: { selected: "original" },
		producerTaskId: "original-producer",
	});
});

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
