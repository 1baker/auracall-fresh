import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createMcpFrontend } from "../../src/browser/frontends/mcpClient.js";
import {
	type NativeFiniteAuthority,
	type NativeFiniteContext,
	nativePromptDigest,
} from "../../src/browser/frontends/nativeFiniteSend.js";
import { createRetainedNativeLifetime } from "../../src/browser/frontends/nativeLifetime.js";
import {
	nativeBudgetDigest,
	nativeReadAmendment,
	qualifyNativeReadBudget,
} from "../../src/browser/frontends/nativeReadBudget.js";
import {
	startOwnNativeRuntime as actualStartOwnNativeRuntime,
	bindNativeOperatorIntegration,
	bindOwnNativeSendFrontend,
	type NativeRuntimeDependencies,
	type NativeRuntimeInput,
	type NativeSdkDescriptor,
	prepareOwnNativeProFromFile,
	readNativeRuntimeInput,
	runNativeOperation,
} from "../../src/browser/frontends/nativeRuntime.js";
import { dispatchRelayRequest } from "../../src/mcp/relay/dispatch.js";
import { RelayStore } from "../../src/mcp/relay/store.js";
import { fixtureDispatchJoin } from "./nativeDispatchFixture.js";

// Synthetic wrappers for existing runtime fixtures; production has no default.
const startOwnNativeRuntime = (
	input: NativeRuntimeInput,
	dependencies: NativeRuntimeDependencies = {},
) => actualStartOwnNativeRuntime(input, { execution: fixtureDispatchJoin(), ...dependencies });

import observationV2 from "./fixtures/native-admission-observation-v2.json";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
const fixturePin = {
	binarySha256: "4698bc4f6a7289de883b0da458decc0ff16d74d6373e1c799164955020a6043d",
	manifestSha256: "2ea3c332f97db8f0525f96ce891a00f6af84190b930da556c52fab68cd20249d",
};
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "auracall-own-sdk-"));
	roots.push(root);
	const dirs = Object.fromEntries(
		["home", "socket", "consumer", "preparation"].map((name) => [name, join(root, name)]),
	);
	for (const path of Object.values(dirs)) await mkdir(path, { mode: 0o700 });
	const executable = join(root, "producer"),
		manifest = join(root, "manifest");
	await writeFile(executable, "fixture-producer\n", { mode: 0o700 });
	await writeFile(manifest, "fixture-manifest\n", { mode: 0o600 });
	const producer = {
		allocationId: "fixture-allocation",
		profileId: "fixture-profile",
		browserId: "fixture-browser",
		tabId: "fixture-tab",
		targetId: "fixture-target",
		ownerTransportSession: "fixture-owner-route",
		ownerGeneration: 1,
		publishedProcessDigest: "a".repeat(64),
		custodyDigest: "b".repeat(64),
		origin: "https://chatgpt.com",
	};
	const bindingOut = join(root, "binding.json"),
		path = join(root, "input.json");
	await writeFile(bindingOut, JSON.stringify(producer), { mode: 0o600 });
	const now = Date.now(),
		expiresAtMs = now + 60_000;
	const admission = {
		consumerGrantId: "fixture-grant",
		profileCapability: "fixture-CONSUMER-secret",
		taskKey: "fixture-task-key",
		profileId: producer.profileId,
		browserId: producer.browserId,
		tabId: producer.tabId,
		targetId: producer.targetId,
		expiresAtMs,
	};
	const input = {
		version: "auracall.own-sdk-runtime.v1",
		bindingOut,
		grant: {
			grantId: admission.consumerGrantId,
			consumerTaskKey: admission.taskKey,
			caller: {
				principalId: "fixture-consumer-principal",
				profileId: producer.profileId,
				capabilityId: "fixture-consumer-capability-id",
				capabilityRevision: 1,
				provenance: "registered_capability",
			},
			producer,
			issuedAtMs: now - 1000,
			expiresAtMs,
		},
		admission,
		options: {
			producerExecutable: executable,
			producerManifest: manifest,
			producerHome: dirs.home,
			producerSocketDirectory: dirs.socket,
			consumerLedgerDirectory: dirs.consumer,
			preparationDirectory: dirs.preparation,
			routeId: "fixture-native-route",
			expectedUrl: "https://chatgpt.com/c/fixture-native",
			expectedModel: "Fixture model",
			operationId: "fixture-pro-only-operation",
		},
	};
	await writeFile(path, JSON.stringify(input), { mode: 0o600 });
	return { root, dirs, input, path, bindingOut, now };
}

it("receives an exact private binding, admitted grant and separate consumer capability without exposing them", async () => {
	const f = await fixture();
	const received = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	expect(received).toBeDefined();
	expect(JSON.stringify(received)).not.toContain("fixture-CONSUMER-secret");
	expect(JSON.stringify(received)).not.toContain("fixture-task-key");
	expect(await readFile(f.bindingOut, "utf8")).toBe(JSON.stringify(f.input.grant.producer));
});

it.each([
	"grant",
	"task",
	"expiry",
	"target",
	"scope",
])("refuses mismatched %s admission without exposing its value", async (change) => {
	const f = await fixture();
	if (change === "grant") f.input.admission.consumerGrantId = "other-grant";
	if (change === "task") f.input.admission.taskKey = "other-task";
	if (change === "expiry") f.input.admission.expiresAtMs += 1;
	if (change === "target") f.input.grant.producer.targetId = "other-target";
	if (change === "scope") f.input.grant.caller.profileId = "other-profile";
	await writeFile(f.path, JSON.stringify(f.input));
	await expect(readNativeRuntimeInput(f.path, fixturePin)).rejects.toMatchObject({
		code: "native_runtime_admission_mismatch",
	});
});

it.each([
	"bindingAsGrant",
	"ownerCapability",
	"lifetimeFlag",
	"namespaceFlag",
	"expired",
	"publicFile",
	"symlink",
	"pin",
])("fails closed on %s input", async (change) => {
	const f = await fixture();
	const input: Record<string, unknown> = f.input;
	if (change === "bindingAsGrant") input.grant = f.input.grant.producer;
	if (change === "ownerCapability") input.ownerProfileCapability = "fixture-OWNER-secret";
	if (change === "lifetimeFlag") input.lifetime = { cleanupVerified: true };
	if (change === "namespaceFlag") input.namespace = "p266new";
	if (change === "expired") {
		f.input.grant.expiresAtMs = f.input.admission.expiresAtMs = f.now - 1;
	}
	await writeFile(f.path, JSON.stringify(input));
	if (change === "publicFile") await chmod(f.path, 0o644);
	if (change === "symlink") {
		await rm(f.path);
		await symlink(f.bindingOut, f.path);
	}
	if (change === "pin") await writeFile(f.input.options.producerExecutable, "changed-binary");
	await expect(readNativeRuntimeInput(f.path, fixturePin, () => f.now)).rejects.toMatchObject({
		message: expect.not.stringContaining("secret"),
	});
});

it("does not connect or reserve a new connection when the lifetime contract is unresolved", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const connect = vi.fn();
	await expect(startOwnNativeRuntime(input, { connect })).rejects.toMatchObject({
		code: "native_runtime_lifetime_contract_required",
	});
	expect(connect).not.toHaveBeenCalled();
	expect(await readdir(f.dirs.consumer)).toEqual([]);
});

function opened(f: Awaited<ReturnType<typeof fixture>>, operationKey = "fixture-open-key") {
	const ack = { kind: "opened", completedAtMs: f.now };
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					tool: "browser_open",
					session: "fixture-OWN-sdk-connection",
					success: true,
					error: null,
					data: withCompletedIdentity(
						{
							contractVersion: "agent-browser.retained-consumer.v1",
							taskId: "fixture-OWN-consumer-task",
							controlRef: "fixture-returned-control",
							consumerGrantId: f.input.admission.consumerGrantId,
							acquisitionId: "fixture-acquisition",
							state: "active",
							expiresAtMs: f.input.admission.expiresAtMs,
							profileId: f.input.admission.profileId,
							browserId: f.input.admission.browserId,
							tabId: f.input.admission.tabId,
							operation: {
								operationId: "fixture-open-operation",
								operationKey,
								action: "open",
								state: "completed",
								ack,
								createdAtMs: f.now - 2000,
							},
							consumerAck: ack,
							result: null,
							targetObservation: {
								operationId: "fixture-open-operation",
								targetId: f.input.admission.targetId,
								targetType: "page",
								origin: "https://chatgpt.com",
								stage: "after_action",
								observedAtMs: f.now - 1000,
							},
						},
						f.input.admission,
					),
				}),
			},
		],
	};
}
function fixtureLifetime() {
	return {
		qualify: vi.fn(async () => {}),
		assertCurrent: vi.fn(async (_context: unknown, _dispatch: unknown) => {}),
		acquired: vi.fn(async (_context: unknown) => {}),
		retain: vi.fn(async (_context: unknown, _client: unknown) => {}),
		uncertain: vi.fn(async () => {}),
	};
}
function fixtureBudget(f: Awaited<ReturnType<typeof fixture>>, reads = 18, drafts = 0) {
	return (
		context: import("../../src/browser/frontends/nativeReadBudget.js").NativeReadBudgetContext,
	) =>
		qualifyNativeReadBudget(
			context,
			async (ctx) => ({
				amendment: nativeReadAmendment,
				contextDigest: nativeBudgetDigest(ctx),
				reservationDigest: nativeBudgetDigest([]),
				consumed: { acquisition: 0, read: reads, control: 0, draft: drafts, send: 2 },
			}),
			() => f.now,
		);
}
it("retains a connected client when the whole-operation guard refuses after handshake", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const connect = vi.fn(async () => client);
	const lifetime = fixtureLifetime();
	const handshake = vi.fn(async (operation: () => Promise<unknown>) => {
		await operation();
		throw new Error("private post-dispatch guard failure");
	});
	await expect(
		startOwnNativeRuntime(input, {
			lifetime,
			readBudget: fixtureBudget(f),
			connect,
			execution: { handshake, acquire: vi.fn(), protected_dispatch: vi.fn() },
		} as never),
	).rejects.toMatchObject({ code: "native_runtime_connection_unresolved" });
	expect(handshake).toHaveBeenCalledOnce();
	expect(connect).toHaveBeenCalledOnce();
	expect(client.callTool).not.toHaveBeenCalled();
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.uncertain).toHaveBeenCalledOnce();
});
it("requires a whole-operation executor before admission or SDK effects", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const lifetime = fixtureLifetime(),
		connect = vi.fn();
	await expect(
		actualStartOwnNativeRuntime(input, {
			lifetime,
			readBudget: fixtureBudget(f),
			connect,
		}),
	).rejects.toMatchObject({ code: "native_runtime_execution_required" });
	expect(lifetime.qualify).not.toHaveBeenCalled();
	expect(connect).not.toHaveBeenCalled();
	expect(await readdir(f.dirs.consumer)).toEqual([]);
});
it("holds the original acquisition when the operator refuses its completion", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const execution = fixtureDispatchJoin();
	execution.acquire = async (operation) => {
		await operation();
		throw new Error("guard lost after Open");
	};
	const lifetime = fixtureLifetime();
	await expect(
		actualStartOwnNativeRuntime(input, {
			lifetime,
			readBudget: fixtureBudget(f),
			execution,
			connect: async () => client,
		}),
	).rejects.toMatchObject({ code: "consumer_readback_required" });
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.uncertain).toHaveBeenCalledOnce();
	expect(await readdir(join(f.dirs.consumer, ".sdk-runtime"))).toContain("held.json");
});
it.each([
	"originalReadback",
	"releaseConsumerReference",
] as const)("never bypasses a refusing whole-call guard for %s", async (method) => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const execution = fixtureDispatchJoin();
	execution.protected_dispatch = vi.fn(async () => {
		throw new Error("operator uncertain");
	});
	const runtime = await actualStartOwnNativeRuntime(input, {
		lifetime: fixtureLifetime(),
		readBudget: fixtureBudget(f),
		execution,
		connect: async () => client,
	});
	await expect(runtime[method]("consumer_acquisition")).rejects.toBeDefined();
	expect(runtime.state).toBe("held");
	expect(execution.protected_dispatch).toHaveBeenCalledOnce();
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
});
it.each([
	"skipped",
	"replaced",
	"duplicate",
])("refuses %s operation result without allowing another call", async (mode) => {
	const original = Object.freeze({ opaque: "local-result" });
	const call = vi.fn(async () => original);
	await expect(
		runNativeOperation(async (operation) => {
			if (mode === "skipped") return original;
			const value = await operation();
			if (mode === "replaced") return { ...value };
			try {
				await operation();
			} catch {
				/* A bridge cannot swallow its second invocation. */
			}
			return value;
		}, call),
	).rejects.toMatchObject({ code: "native_runtime_execution_unqualified" });
	expect(call).toHaveBeenCalledTimes(mode === "skipped" ? 0 : 1);
});
it("binds v2 observation and the phase-aware operator to the actual private receiver and own SDK", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const owner = {
		...observationV2.privateResult.ownerAuthority,
		profileId: f.input.grant.producer.profileId,
	};
	const observe = vi.fn(
		async (ctx: { receiptDigest: string; producerSha256: string }, nonce: string) => ({
			publicResult: observationV2.publicResult,
			privateResult: {
				...observationV2.privateResult,
				grant: f.input.grant,
				ownerAuthority: owner,
				receiptDigest: ctx.receiptDigest,
				producerSha256: ctx.producerSha256,
				requestNonce: nonce,
				observedAtMs: f.now,
				validUntilMs: f.now + 30000,
			},
		}),
	);
	const authority = vi.fn(async () => {});
	const joinEvents: string[] = [];
	const operator = await bindNativeOperatorIntegration(input, {
		dispatchJoin: fixtureDispatchJoin(joinEvents),
		ownerAuthority: owner,
		producerTaskId: "synthetic-producer-task",
		guard: {
			checkpoint: vi.fn(async () => {}),
			assert_current: vi.fn(async () => {}),
			attach_read_budget_context: vi.fn(async () => {}),
		},
		supplier: {
			reserveObservationReads: vi.fn(async () => {}),
			observe,
			assertCurrent: authority,
			originalUsage: async (ctx) => ({
				amendment: nativeReadAmendment,
				contextDigest: nativeBudgetDigest(ctx),
				reservationDigest: nativeBudgetDigest([]),
				consumed: { acquisition: 0, read: 20, control: 0, draft: 0, send: 2 },
			}),
		},
	});
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const connect = vi.fn(async () => client);
	const runtime = await startOwnNativeRuntime(input, { ...operator, connect });
	expect(runtime.route.nativeTask?.taskId).toBe("fixture-OWN-consumer-task");
	expect(observe).toHaveBeenCalledOnce();
	expect(connect).toHaveBeenCalledOnce();
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
	expect(authority).toHaveBeenCalledTimes(2);
	expect(joinEvents).toEqual(["admit_once", "qualify_budget", "handshake", "acquire"]);
});
it("requires carried accounting even when lifetime admission succeeds", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const connect = vi.fn(async () => ({ callTool: vi.fn(async () => opened(f)) }));
	await expect(
		startOwnNativeRuntime(input, { lifetime: fixtureLifetime(), connect }),
	).rejects.toMatchObject({ code: "native_read_budget_required" });
	expect(connect).not.toHaveBeenCalled();
	expect(await readdir(f.dirs.consumer)).toEqual([]);
	await expect(
		prepareOwnNativeProFromFile("/must-not-read-private-input", { lifetime: fixtureLifetime() }),
	).rejects.toMatchObject({ code: "native_read_budget_required" });
});
it("refuses unknown carried reads before starting an SDK even when lifetime is admitted", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const connect = vi.fn(async () => ({ callTool: vi.fn(async () => opened(f)) }));
	await expect(
		startOwnNativeRuntime(input, {
			connect,
			lifetime: fixtureLifetime(),
			readBudget: async (context) =>
				qualifyNativeReadBudget(
					context,
					async (ctx) => ({
						amendment: nativeReadAmendment,
						contextDigest: nativeBudgetDigest(ctx),
						reservationDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
						consumed: { acquisition: 0, read: null, control: 0, draft: 0, send: 2 },
					}),
					() => f.now,
				),
		}),
	).rejects.toMatchObject({ code: "native_read_budget_unqualified" });
	expect(connect).not.toHaveBeenCalled();
	expect(await readdir(f.dirs.consumer)).toEqual([]);
});
it.each([
	"serialized",
	"receipt",
	"producer",
	"admission",
	"expired",
])("refuses %s allowance before SDK connection", async (change) => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const connect = vi.fn();
	await expect(
		startOwnNativeRuntime(input, {
			connect,
			lifetime: fixtureLifetime(),
			readBudget: async (context) => {
				const changed = { ...context };
				if (change === "receipt") changed.receiptDigest = "e".repeat(64);
				if (change === "producer") changed.producerSha256 = "e".repeat(64);
				if (change === "admission") changed.admissionDigest = "e".repeat(64);
				if (change === "expired") changed.expiresAtMs = f.now;
				const budget = await qualifyNativeReadBudget(
					changed,
					async (ctx) => ({
						amendment: nativeReadAmendment,
						contextDigest: nativeBudgetDigest(ctx),
						reservationDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
						consumed: { acquisition: 0, read: 18, control: 0, draft: 0, send: 2 },
					}),
					() => f.now,
				);
				return change === "serialized" ? JSON.parse(JSON.stringify(budget)) : budget;
			},
		}),
	).rejects.toMatchObject({ code: "native_read_budget_unqualified" });
	expect(connect).not.toHaveBeenCalled();
	expect(await readdir(f.dirs.consumer)).toEqual([]);
});
it("rechecks original history after asynchronous qualification before starting an SDK", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const row = { bucket: "read", key: "original-read-key", intentDigest: "c".repeat(64) };
	const name = `reservation-${nativeBudgetDigest(row.key)}.json`;
	const completion = join(f.dirs.consumer, name.replace("reservation-", "completed-"));
	await writeFile(join(f.dirs.consumer, name), JSON.stringify(row), { mode: 0o600 });
	await writeFile(completion, JSON.stringify({ ...row, completed: true }), { mode: 0o600 });
	const connect = vi.fn(async () => ({ callTool: vi.fn(async () => opened(f)) }));
	await expect(
		startOwnNativeRuntime(input, {
			lifetime: fixtureLifetime(),
			connect,
			readBudget: async (context) => {
				const budget = await qualifyNativeReadBudget(
					context,
					async (ctx) => ({
						amendment: nativeReadAmendment,
						contextDigest: nativeBudgetDigest(ctx),
						reservationDigest: nativeBudgetDigest([[name, nativeBudgetDigest(row)]]),
						consumed: { acquisition: 0, read: 18, control: 0, draft: 0, send: 2 },
					}),
					() => f.now,
				);
				await rm(completion);
				return budget;
			},
		}),
	).rejects.toMatchObject({ code: "native_read_budget_unqualified" });
	expect(connect).not.toHaveBeenCalled();
});
it("uses carried read accounting in the real owned runtime preparation", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const callTool = vi.fn(async () => opened(f));
	const runtime = await startOwnNativeRuntime(input, {
		connect: async () => ({ callTool }),
		lifetime: fixtureLifetime(),
		readBudget: (context) =>
			qualifyNativeReadBudget(
				context,
				async (ctx) => ({
					amendment: nativeReadAmendment,
					contextDigest: nativeBudgetDigest(ctx),
					reservationDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
					consumed: { acquisition: 0, read: 80, control: 0, draft: 0, send: 2 },
				}),
				() => f.now,
			),
	});
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "consumer_budget_exhausted",
	});
	expect(runtime.state).toBe("held");
	expect(callTool).toHaveBeenCalledOnce();
});
it.each([
	"",
	"default",
	"../p266new",
	"p266new\n",
])("rejects unselected compiled namespace %j before private reads", async (namespace) => {
	await expect(
		readNativeRuntimeInput("/must-not-read-private-input", { ...fixturePin, namespace } as never),
	).rejects.toMatchObject({ code: "native_runtime_namespace_unqualified" });
});
it("carries the compiled isolated namespace into the exact SDK child without inherited authority", async () => {
	const f = await fixture();
	const pin = { ...fixturePin, namespace: "p266new" as const };
	const input = await readNativeRuntimeInput(f.path, pin, () => f.now);
	Object.assign(pin, { namespace: "default" }); // Caller mutation cannot retarget the received selection.
	const connect = vi.fn(async (_descriptor: NativeSdkDescriptor) => ({
		callTool: vi.fn(async () => opened(f)),
	}));
	await startOwnNativeRuntime(input, {
		connect,
		lifetime: fixtureLifetime(),
		readBudget: fixtureBudget(f),
	});
	expect(connect).toHaveBeenCalledOnce();
	expect(connect.mock.calls[0][0].env).toEqual(
		Object.fromEntries([
			["HOME", f.dirs.home],
			["AGENT_BROWSER_SOCKET_DIR", f.dirs.socket],
			["AGENT_BROWSER_RUNTIME_ENVIRONMENT", "development"],
			["AGENT_BROWSER_RUNTIME_HOST", "1"],
			["AGENT_BROWSER_EXTERNAL_BROWSER_DISCOVERY", "disabled"],
			["AGENT_BROWSER_DEV_NAMESPACE", "p266new"],
		]),
	);
});
it("connects one own client and obtains the preparation route from public acquired binding, never a borrowed task", async () => {
	const f = await fixture(),
		parentHome = process.env.HOME;
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async (_request: unknown) => opened(f)), close: vi.fn() };
	const connect = vi.fn(async (_descriptor: NativeSdkDescriptor) => client),
		lifetime = fixtureLifetime();
	const runtime = await startOwnNativeRuntime(input, {
		connect,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	expect(connect).toHaveBeenCalledOnce();
	expect(connect.mock.calls[0][0]).toMatchObject({
		command: f.input.options.producerExecutable,
		args: ["mcp", "serve"],
	});
	expect(connect.mock.calls[0][0].env.HOME).toBe(f.dirs.home);
	expect(connect.mock.calls[0][0].env.AGENT_BROWSER_SOCKET_DIR).toBe(f.dirs.socket);
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.callTool.mock.calls[0][0]).toMatchObject({
		name: "browser_open",
		arguments: {
			profileMode: "consumer",
			consumerGrantId: "fixture-grant",
			profileCapability: "fixture-CONSUMER-secret",
		},
	});
	expect(runtime.route).toEqual({
		id: "fixture-native-route",
		provider: "chatgpt",
		expectedUrl: "https://chatgpt.com/c/fixture-native",
		expectedModel: "Fixture model",
		transport: "agent_browser_task",
		nativeTask: {
			taskId: "fixture-OWN-consumer-task",
			controlRef: "fixture-returned-control",
			profileId: "fixture-profile",
			browserId: "fixture-browser",
			tabId: "fixture-tab",
			targetId: "fixture-target",
		},
	});
	expect(process.env.HOME).toBe(parentHome);
	expect(JSON.stringify(runtime)).not.toContain("fixture-CONSUMER-secret");
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.retain).toHaveBeenCalledOnce();
	expect(lifetime.retain.mock.calls[0][1]).toBe(client);
	expect(runtime.state).toBe("active");
});

it("holds the original connection on uncertain acquisition and never reconnects or invents release", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = {
		callTool: vi.fn(async () => {
			throw new Error("fixture-private-failure");
		}),
		close: vi.fn(),
	};
	const connect = vi.fn(async () => client);
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	expect(connect).toHaveBeenCalledOnce();
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.uncertain).toHaveBeenCalledOnce();
	expect(JSON.stringify(lifetime.uncertain.mock.calls)).not.toContain("fixture-CONSUMER-secret");
});

it("holds journaled preparation when the producer has no correlated page evidence, with zero model sends", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const runtime = await startOwnNativeRuntime(input, {
		connect: async () => client,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(runtime.state).toBe("held");
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	expect(client.callTool).toHaveBeenCalledTimes(2); // Acquisition and refused observation; no input or Send.
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.uncertain).toHaveBeenCalledOnce();
});

it("permits only one SDK attempt across concurrent starts and changed operation IDs", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)) },
		connect = vi.fn(async () => client);
	const results = await Promise.allSettled([
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	]);
	expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	expect(connect).toHaveBeenCalledOnce();
	f.input.options.operationId = "fixture-changed-operation";
	await writeFile(f.path, JSON.stringify(f.input));
	const changed = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	await expect(
		startOwnNativeRuntime(changed, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	expect(connect).toHaveBeenCalledOnce();
});

it("holds a connection that outlives its finite admission before sending the capability or Open", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(), close: vi.fn() };
	await expect(
		startOwnNativeRuntime(input, {
			readBudget: fixtureBudget(f),
			lifetime,
			connect: async () => {
				f.now = f.input.admission.expiresAtMs + 1;
				return client;
			},
		}),
	).rejects.toMatchObject({ code: "native_runtime_admission_expired" });
	expect(client.callTool).not.toHaveBeenCalled();
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.uncertain).toHaveBeenCalledOnce();
});

it("refuses drift after private reception before any connector call", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	await writeFile(f.bindingOut, "changed-private-binding");
	const connect = vi.fn();
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({
		code: "native_runtime_input_changed",
	});
	expect(connect).not.toHaveBeenCalled();
});

it("revalidates input and directory privacy after lifetime qualification before connecting", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	lifetime.qualify.mockImplementation(async () => {
		await chmod(f.dirs.consumer, 0o755);
	});
	const connect = vi.fn();
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({
		code: "native_read_budget_unqualified",
	});
	expect(connect).not.toHaveBeenCalled();
});

it("the foreground file caller fails closed before reading private inputs when lifetime is unresolved", async () => {
	await expect(
		prepareOwnNativeProFromFile("/no-private-input-read-for-this-fixture"),
	).rejects.toMatchObject({
		code: "native_runtime_lifetime_contract_required",
	});
});

it.each([
	"fixture",
	"compiled",
])("%s policy reads original metadata on the retained session and keeps preparation permanently held", async (mode) => {
	const f = await fixture(),
		lifetime =
			mode === "fixture"
				? fixtureLifetime()
				: createRetainedNativeLifetime({
						admit: async (ctx, requestNonce) => ({
							receiptDigest: ctx.receiptDigest,
							producerSha256: ctx.producerSha256,
							requestNonce,
							observedAtMs: f.now,
							validUntilMs: Math.min(ctx.expiresAtMs, f.now + 30000),
						}),
						assertCurrent: async () => {},
						producerSha256: fixturePin.binarySha256,
						now: () => f.now,
					});
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const wire = JSON.parse(opened(f, "consumer_acquisition").content[0].text);
	const { targetObservation: _target, result: _result, consumerAck: _ack, ...metadata } = wire.data;
	const readback = {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					...wire,
					tool: "browser_continue",
					data: {
						...metadata,
						requestedOperationKey: "consumer_acquisition",
						matchingOperation: true,
						identityFreshness: "stored_completion",
					},
				}),
			},
		],
	};
	const client = {
		callTool: vi
			.fn()
			.mockResolvedValueOnce(opened(f, "consumer_acquisition"))
			.mockResolvedValue(readback),
		close: vi.fn(),
	};
	const connect = vi.fn(async () => client);
	const runtime = await startOwnNativeRuntime(input, {
		connect,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	expect(await runtime.originalReadback("consumer_acquisition")).toMatchObject({
		operationKey: "consumer_acquisition",
		operationState: "completed",
		readbackOnly: true,
		pageObserved: false,
		identityFreshness: "stored_completion",
	});
	expect(runtime.state).toBe("held");
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	await expect(runtime.originalReadback("consumer_acquisition")).rejects.toMatchObject({
		code: "consumer_operation_held",
	});
	expect(client.callTool.mock.calls).toEqual([
		[expect.objectContaining({ name: "browser_open" })],
		[
			{
				name: "browser_continue",
				arguments: { taskId: "fixture-OWN-consumer-task", operationKey: "consumer_acquisition" },
			},
		],
	]);
	expect(connect).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
});

it("exposes explicit consumer-ref release while retaining the SDK and permanently holding preparation", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const wire = JSON.parse(opened(f, "consumer_acquisition").content[0].text);
	const { targetObservation: _target, result: _result, consumerAck: _ack, ...metadata } = wire.data;
	const released = {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					...wire,
					tool: "browser_close",
					data: {
						...metadata,
						state: "released",
						browserDisposition: "retained",
						requestedOperationKey: "consumer_acquisition",
						matchingOperation: true,
						identityFreshness: "stored_completion",
					},
				}),
			},
		],
	};
	const client = {
		callTool: vi
			.fn()
			.mockResolvedValueOnce(opened(f, "consumer_acquisition"))
			.mockResolvedValue(released),
		close: vi.fn(),
	};
	const connect = vi.fn(async () => client);
	const runtime = await startOwnNativeRuntime(input, {
		connect,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	expect(await runtime.releaseConsumerReference("consumer_acquisition")).toMatchObject({
		state: "released",
		browserDisposition: "retained",
		pageObserved: false,
	});
	expect(runtime.state).toBe("held");
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	await expect(runtime.releaseConsumerReference("consumer_acquisition")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(client.callTool).toHaveBeenCalledTimes(2);
	expect(connect).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
});

it.each([
	"fixture",
	"compiled",
])("%s policy preserves the original readback validator and hold when the producer reports a different latest operation", async (mode) => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const wire = JSON.parse(opened(f).content[0].text);
	const { targetObservation: _target, result: _result, consumerAck: _ack, ...metadata } = wire.data;
	const client = {
		callTool: vi
			.fn()
			.mockResolvedValueOnce(opened(f))
			.mockResolvedValue({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							...wire,
							tool: "browser_continue",
							data: {
								...metadata,
								requestedOperationKey: "consumer_acquisition",
								matchingOperation: false,
								identityFreshness: "stored_completion",
							},
						}),
					},
				],
			}),
		close: vi.fn(),
	};
	const runtime = await startOwnNativeRuntime(input, {
		readBudget: fixtureBudget(f),
		connect: async () => client,
		lifetime:
			mode === "fixture"
				? fixtureLifetime()
				: createRetainedNativeLifetime({
						admit: async (ctx, requestNonce) => ({
							receiptDigest: ctx.receiptDigest,
							producerSha256: ctx.producerSha256,
							requestNonce,
							observedAtMs: f.now,
							validUntilMs: Math.min(ctx.expiresAtMs, f.now + 30000),
						}),
						assertCurrent: async () => {},
						producerSha256: fixturePin.binarySha256,
						now: () => f.now,
					}),
	});
	await expect(runtime.originalReadback("consumer_acquisition")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(runtime.state).toBe("held");
	await expect(runtime.prepareProOnly()).rejects.toMatchObject({
		code: "native_runtime_readback_required",
	});
	expect(client.callTool).toHaveBeenCalledTimes(2);
	expect(client.close).not.toHaveBeenCalled();
});

it("blocks the next page dispatch when operator authority is lost after acquisition", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const runtime = await startOwnNativeRuntime(input, {
		connect: async () => client,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	lifetime.assertCurrent.mockRejectedValue(new Error("fixture-private-authority-revoked"));
	await expect(runtime.prepareProOnly()).rejects.toBeDefined();
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(runtime.state).toBe("held");
	expect(client.close).not.toHaveBeenCalled();
	expect(lifetime.qualify).toHaveBeenCalledOnce();
});

it.each([
	"sdk_connect",
	"acquire",
])("stops at refused %s protection before any native Open", async (kind) => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	lifetime.assertCurrent.mockImplementation(async (_context, dispatch) => {
		if ((dispatch as { kind: string }).kind === kind)
			throw new Error("fixture-private-guard-denial");
	});
	const client = { callTool: vi.fn(), close: vi.fn() },
		connect = vi.fn(async () => client);
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toBeDefined();
	expect(connect).toHaveBeenCalledTimes(kind === "sdk_connect" ? 0 : 1);
	expect(client.callTool).not.toHaveBeenCalled();
	expect(client.close).not.toHaveBeenCalled();
	const held = JSON.parse(
		await readFile(join(f.dirs.consumer, ".sdk-runtime", "held.json"), "utf8"),
	);
	expect(JSON.stringify(held)).not.toContain("fixture-private-guard-denial");
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({ code: "native_runtime_readback_required" });
});

it("holds the actual completed acquisition when the initial observation expires during Open", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const observedAtMs = f.now;
	const admit = vi.fn(
		async (
			ctx: import("../../src/browser/frontends/nativeRuntime.js").NativeRuntimeLifetimeContext,
			requestNonce: string,
		) => ({
			receiptDigest: ctx.receiptDigest,
			producerSha256: ctx.producerSha256,
			requestNonce,
			observedAtMs,
			validUntilMs: observedAtMs + 30000,
		}),
	);
	const lifetime = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		producerSha256: fixturePin.binarySha256,
		now: () => f.now,
	});
	const client = {
		callTool: vi.fn(async () => {
			const response = opened(f);
			f.now += 30000;
			return response;
		}),
		close: vi.fn(),
	};
	const connect = vi.fn(async () => client);
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({ code: "native_lifetime_held" });
	const held = JSON.parse(
		await readFile(join(f.dirs.consumer, ".sdk-runtime", "held.json"), "utf8"),
	);
	expect(held.context.nativeTask.taskId).toBe("fixture-OWN-consumer-task");
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
	expect(admit).toHaveBeenCalledOnce();
	await expect(
		startOwnNativeRuntime(input, { connect, lifetime, readBudget: fixtureBudget(f) }),
	).rejects.toMatchObject({ code: "native_runtime_readback_required" });
	expect(connect).toHaveBeenCalledOnce();
});

it("fences a pending browser dispatch immediately when the runtime is held", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	let entered!: () => void, finish!: () => void;
	const inGuard = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const lifetime = createRetainedNativeLifetime({
		admit: async (ctx, requestNonce) => ({
			receiptDigest: ctx.receiptDigest,
			producerSha256: ctx.producerSha256,
			requestNonce,
			observedAtMs: f.now,
			validUntilMs: f.now + 30000,
		}),
		assertCurrent: async (_ctx, dispatch) => {
			if (dispatch.kind === "command") {
				entered();
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
			}
		},
		producerSha256: fixturePin.binarySha256,
		now: () => f.now,
	});
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const runtime = await startOwnNativeRuntime(input, {
		connect: async () => client,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	const preparing = runtime.prepareProOnly();
	await inGuard;
	const holding = runtime.hold();
	expect(runtime.state).toBe("held");
	finish();
	const [result] = await Promise.allSettled([preparing, holding]);
	expect(result.status).toBe("rejected");
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
});

it("keeps the runtime dispatch fence even if the lifetime hold hook refuses", async () => {
	const f = await fixture(),
		lifetime = fixtureLifetime();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	let entered!: () => void, finish!: () => void;
	const inGuard = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const client = { callTool: vi.fn(async () => opened(f)), close: vi.fn() };
	const runtime = await startOwnNativeRuntime(input, {
		connect: async () => client,
		lifetime,
		readBudget: fixtureBudget(f),
	});
	lifetime.assertCurrent.mockImplementation(async () => {
		entered();
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	lifetime.uncertain.mockRejectedValue(new Error("fixture-private-hold-refusal"));
	const preparing = runtime.prepareProOnly();
	await inGuard;
	const holding = runtime.hold();
	finish();
	await Promise.allSettled([preparing, holding]);
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(runtime.state).toBe("held");
	expect(client.close).not.toHaveBeenCalled();
});

it("keeps a retained runtime closed to automatic Send without a finite authority", async () => {
	const f = await fixture();
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async () => opened(f)) };
	const runtime = await startOwnNativeRuntime(input, {
		lifetime: fixtureLifetime(),
		readBudget: fixtureBudget(f),
		connect: async () => client,
	});
	await expect(
		bindOwnNativeSendFrontend(
			runtime,
			{
				requestId: "finite-synthetic-request",
				requestFingerprint: "b".repeat(64),
				promptDigest: "a".repeat(64),
				previousRequestId: null,
			},
			undefined as never,
		),
	).rejects.toMatchObject({ code: "native_finite_authority_required" });
	expect(client.callTool).toHaveBeenCalledOnce();
	expect(runtime.state).toBe("active");
});

async function finiteFixture(reads = 18, drafts = 0) {
	const f = await fixture();
	setAuracallHomeDirOverrideForTest(join(f.root, "frontend-home"));
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const prompt = " Exact request λ\n",
		answer = "Complete answer αβ\n\nFinal line 🧪";
	const requestId = `finite_${randomUUID()}`;
	const canonical = new RelayStore(join(f.root, "synthetic-canonical-host"), "synthetic-owner");
	await canonical.enqueue({ requestId, prompt });
	const saved = await canonical.request(requestId);
	const intent = {
		requestId,
		requestFingerprint: saved.fingerprint,
		promptDigest: nativePromptDigest(prompt),
		previousRequestId: null,
	};
	let effort = 3,
		composer = "",
		sent = false,
		sends = 0,
		protectedNow = false;
	let failSend = false;
	const events: string[] = [];
	const client = {
		callTool: vi.fn(async (request: { name: string; arguments: Record<string, unknown> }) => {
			if (request.name === "browser_open") return opened(f);
			expect(protectedNow).toBe(true);
			const a = request.arguments,
				action = String(a.action),
				key = String(a.operationKey),
				params = a.params as Record<string, unknown>;
			events.push(`native:${action}`);
			let result: unknown;
			if (action === "url") result = { url: f.input.options.expectedUrl };
			else if (action === "snapshot")
				result = {
					snapshot:
						'- button "Fixture model" [ref=e1]\n- button "Open profile menu" [ref=e2]\n- textbox "Ask anything" [ref=e3]\n- slider "Intelligence" [ref=e4]' +
						(sent
							? '\n- article\n  - heading "You said:"\n  - paragraph: Exact request\n- article\n  - heading "ChatGPT said:"\n  - paragraph: Complete answer'
							: ""),
					refs: {
						e1: { role: "button", name: "Fixture model" },
						e2: { role: "button", name: "Open profile menu" },
						e3: { role: "textbox", name: "Ask anything" },
						e4: {
							role: "slider",
							name: "Intelligence",
							ax: {
								schemaVersion: "agent-browser.ax-control.v1",
								disabled: false,
								minimum: 0,
								maximum: 4,
								value: effort,
								valueText: effort === 4 ? "Pro" : "Extra High",
							},
						},
					},
				};
			else if (action === "press") {
				effort++;
				result = { pressed: true };
			} else if (action === "fill") {
				composer = String(params.value);
				result = { filled: true };
			} else if (action === "click") {
				expect(composer).toBe(prompt);
				expect(effort).toBe(4);
				expect(await canonical.status(requestId)).toMatchObject({ state: "awaiting_reply" });
				sends++;
				sent = true;
				composer = "";
				if (failSend) throw new Error("synthetic lost native Send ACK");
				result = { clicked: true };
			} else if (action === "gettext")
				result = {
					text:
						params.selector === "#prompt-textarea"
							? composer
							: String(params.selector).includes('"user"')
								? prompt
								: answer,
				};
			else throw new Error("unexpected synthetic action");
			f.now += 200;
			const base = JSON.parse(opened(f).content[0].text).data;
			const ack = {
				kind: ["url", "snapshot", "gettext"].includes(action) ? "observed" : "input_acknowledged",
				completedAtMs: f.now,
			};
			const data = withCompletedIdentity(
				{
					...base,
					operation: {
						operationId: key,
						operationKey: key,
						action,
						state: "completed",
						ack,
						createdAtMs: f.now - 1,
					},
					consumerAck: ack,
					result,
					targetObservation: { ...base.targetObservation, operationId: key, observedAtMs: f.now },
				},
				f.input.admission,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							tool: request.name,
							session: "fixture-OWN-sdk-connection",
							success: true,
							error: null,
							data,
						}),
					},
				],
			};
		}),
	};
	const lifetime = fixtureLifetime(),
		execution = fixtureDispatchJoin();
	const protectedDispatch = vi.fn();
	const originalDispatch = execution.protected_dispatch;
	execution.protected_dispatch = async (run) => {
		protectedDispatch();
		return originalDispatch(run);
	};
	const runtime = await actualStartOwnNativeRuntime(input, {
		lifetime,
		execution,
		readBudget: fixtureBudget(f, reads, drafts),
		connect: async () => client,
	});
	const evidence = async (context: NativeFiniteContext) => {
		const names = (await readdir(f.dirs.consumer)).filter((n) => n.startsWith("reservation-"));
		const rows = await Promise.all(
			names.map(async (name) => [
				name,
				createHash("sha256")
					.update(await readFile(join(f.dirs.consumer, name)))
					.digest("hex"),
			]),
		);
		rows.sort(([a], [b]) => a.localeCompare(b));
		return {
			contextDigest: nativeBudgetDigest(context),
			approvalDigest: "c".repeat(64),
			originalLineageDigest: "d".repeat(64),
			reservationDigest: nativeBudgetDigest(rows),
			consumed: { acquisition: 1, read: reads, control: 0, draft: drafts, send: 2 },
			additional: { draft: 1, send: 1 },
			readCeiling: 80,
			controlCeiling: 6,
		};
	};
	const authority: NativeFiniteAuthority = {
		verify: vi.fn(evidence),
		assertClaim: vi.fn(async (c) => {
			expect(await canonical.status(c.intent.requestId)).toMatchObject({ state: "awaiting_reply" });
			expect((await canonical.request(c.intent.requestId)).fingerprint).toBe(
				c.intent.requestFingerprint,
			);
		}),
		protect: vi.fn(async (_op, run) => {
			expect(await readdir(f.dirs.consumer)).not.toContain("operation.lock");
			events.push(`before:${_op.bucket}`);
			protectedNow = true;
			try {
				return await run();
			} finally {
				protectedNow = false;
				expect(await readdir(f.dirs.consumer)).not.toContain("operation.lock");
				events.push(`after:${_op.bucket}`);
			}
		}),
	};
	const dispatch = async (frontend: Awaited<ReturnType<typeof bindOwnNativeSendFrontend>>) =>
		dispatchRelayRequest({
			store: canonical,
			frontend,
			requestId,
			routeId: f.input.options.routeId,
			expectedUrl: f.input.options.expectedUrl,
			expectedModel: f.input.options.expectedModel,
			maxStatusChecks: 3,
			pollIntervalMs: 0,
		});
	return {
		f,
		runtime,
		client,
		lifetime,
		authority,
		evidence,
		intent,
		prompt,
		answer,
		canonical,
		dispatch,
		events,
		protectedDispatch,
		get sends() {
			return sends;
		},
		set failSend(value: boolean) {
			failSend = value;
		},
	};
}

it("runs one finite native Send on the retained session through P447 and saves the complete reply", async () => {
	const h = await finiteFixture();
	const frontend = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(h.runtime.prepareProOnly()).rejects.toMatchObject({
		code: "native_finite_send_unqualified",
	});
	const result = await h.dispatch(frontend);
	expect(result).toMatchObject({ state: "replied", reply: { text: h.answer } });
	expect(await h.canonical.status(h.intent.requestId)).toMatchObject({ reply: { text: h.answer } });
	expect(h.sends).toBe(1);
	expect(h.client.callTool.mock.calls.filter(([r]) => r.name === "browser_open")).toHaveLength(1);
	expect(h.protectedDispatch).not.toHaveBeenCalled(); // full-ledger guard replaces inner SDK wrapper
	expect(h.events).toContain("native:press");
	expect(h.events).toContain("before:draft");
	expect(h.events).toContain("after:send");
	await expect(h.dispatch(frontend)).resolves.toMatchObject({ state: "replied" });
	expect(h.sends).toBe(1);
	const budget = JSON.parse(await readFile(join(h.f.dirs.consumer, "read-budget.json"), "utf8"));
	expect(budget.version).toBe(1);
	expect(await readdir(h.f.dirs.consumer)).toContain("finite-send-policy.json");
});

it.each([
	"prompt",
	"request",
	"previous",
	"route",
])("rejects wrong finite %s before native effects", async (kind) => {
	const h = await finiteFixture();
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(
		api.send(
			kind === "route" ? "other" : h.f.input.options.routeId,
			kind === "request" ? "other-request" : h.intent.requestId,
			kind === "prompt" ? `${h.prompt}x` : h.prompt,
			kind === "previous" ? "other-previous" : undefined,
		),
	).rejects.toBeDefined();
	expect(h.client.callTool).toHaveBeenCalledOnce();
	expect(h.sends).toBe(0);
});

it.each([
	"unknown",
	"carry",
	"snapshot",
	"draft",
	"approval",
	"context",
])("refuses unqualified finite %s evidence", async (kind) => {
	const h = await finiteFixture();
	h.authority.verify = async (c) => {
		const e: Record<string, unknown> = await h.evidence(c);
		if (kind === "unknown")
			e.consumed = { acquisition: 1, read: null, control: 0, draft: 0, send: 2 };
		if (kind === "carry") e.consumed = { acquisition: 1, read: 18, control: 0, draft: 0, send: 0 };
		if (kind === "snapshot") e.reservationDigest = "e".repeat(64);
		if (kind === "draft") e.additional = { send: 1 };
		if (kind === "approval") delete e.approvalDigest;
		if (kind === "context") e.contextDigest = "e".repeat(64);
		return e;
	};
	try {
		const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
		await api.inspect(h.f.input.options.routeId);
		throw new Error("accepted");
	} catch (error) {
		expect(error).toMatchObject({ code: "native_finite_send_unqualified" });
	}
	expect(h.client.callTool).toHaveBeenCalledOnce();
	expect(h.sends).toBe(0);
});

it.each([
	"verify",
	"before",
	"authority",
	"after",
])("preserves callback hold at finite %s boundary", async (when) => {
	const h = await finiteFixture();
	const original = h.authority.protect;
	if (when === "verify")
		h.authority.verify = async (c) => {
			const e = await h.evidence(c);
			await h.runtime.hold();
			return e;
		};
	if (when === "before")
		h.authority.protect = async (_op, run) => {
			await h.runtime.hold();
			return run();
		};
	if (when === "after")
		h.authority.protect = async (op, run) => {
			const result = await original(op, run);
			await h.runtime.hold();
			return result;
		};
	if (when === "authority")
		h.lifetime.assertCurrent.mockImplementation(async () => {
			await h.runtime.hold();
		});
	await expect(
		(async () => {
			const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
			return api.inspect(h.f.input.options.routeId);
		})(),
	).rejects.toBeDefined();
	expect(h.runtime.state).toBe("held");
	expect(h.client.callTool).toHaveBeenCalledTimes(when === "after" ? 2 : 1);
	expect(h.sends).toBe(0);
});

it("retains an uncertain native Send without replay or ordinary reply-read permission", async () => {
	const h = await finiteFixture();
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	h.failSend = true;
	await expect(h.dispatch(api)).resolves.toMatchObject({ state: "held_unknown" });
	expect(h.sends).toBe(1);
	expect(h.runtime.state).toBe("held");
	const calls = h.client.callTool.mock.calls.length;
	await expect(api.status(h.f.input.options.routeId, h.intent.requestId)).rejects.toBeDefined();
	await expect(
		api.send(h.f.input.options.routeId, h.intent.requestId, h.prompt),
	).rejects.toBeDefined();
	expect(h.client.callTool).toHaveBeenCalledTimes(calls);
	expect(h.sends).toBe(1);
});

it("refuses foreign runtime, rebinding and a second acquisition", async () => {
	await expect(
		bindOwnNativeSendFrontend({} as never, {} as never, {} as never),
	).rejects.toMatchObject({ code: "native_finite_send_unqualified" });
	const h = await finiteFixture();
	await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority)).rejects.toMatchObject({
		code: "native_finite_send_unqualified",
	});
	expect(h.client.callTool).toHaveBeenCalledOnce();
});

it("recovers a lost OUTER frontend ACK through08b/P447 without repeating the native Send", async () => {
	const h = await finiteFixture();
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	let lose = true;
	const frontend = createMcpFrontend(
		{
			callTool: async (request) => {
				const a = request.arguments;
				let result: Record<string, unknown>;
				if (request.name === "frontend_inspect") result = await api.inspect(String(a.routeId));
				else if (request.name === "frontend_configure") {
					expect(a.effort).toBe("pro");
					result = await api.configure(String(a.routeId), "pro");
				} else if (request.name === "frontend_send") {
					result = await api.send(String(a.routeId), String(a.requestId), String(a.text));
					if (lose) {
						lose = false;
						throw new Error("lost outer acknowledgment after confirmed native send");
					}
				} else result = await api.status(String(a.routeId), String(a.requestId));
				return {
					structuredContent: result,
					content: [{ type: "text", text: JSON.stringify(result) }],
				};
			},
		},
		h.f.input.options.routeId,
	);
	await expect(h.dispatch(frontend)).resolves.toMatchObject({ state: "held_unknown" });
	expect(h.runtime.state).toBe("active");
	await expect(h.dispatch(frontend)).resolves.toMatchObject({
		state: "replied",
		reply: { text: h.answer },
	});
	expect(h.sends).toBe(1);
});

it.each([
	"skip",
	"replace",
	"duplicate",
	"refuse",
])("rejects a finite protector that %s the whole transaction", async (mode) => {
	const h = await finiteFixture();
	const original = h.authority.protect;
	h.authority.protect = async (op, run) => {
		if (mode === "skip") return {} as never;
		if (mode === "refuse") throw new Error("synthetic no authority");
		const value = await original(op, run);
		if (mode === "replace") return {} as never;
		try {
			await original(op, run);
		} catch {
			/* cannot swallow double operation */
		}
		return value;
	};
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(api.inspect(h.f.input.options.routeId)).rejects.toBeDefined();
	expect(h.runtime.state).toBe("held");
	expect(h.client.callTool).toHaveBeenCalledTimes(["skip", "refuse"].includes(mode) ? 1 : 2);
	if (["skip", "refuse"].includes(mode))
		expect(await readdir(h.f.dirs.consumer)).not.toContain("finite-send-policy.json");
});

it.each([
	"expired",
	"clock_reverse",
	"claim_hold",
	"claim_refused",
])("retains finite protection when %s", async (mode) => {
	const h = await finiteFixture();
	if (mode === "claim_hold" || mode === "claim_refused")
		h.authority.assertClaim = async () => {
			if (mode === "claim_hold") await h.runtime.hold();
			else throw new Error("not a P447 claim");
		};
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	if (mode === "expired") h.f.now = h.f.input.admission.expiresAtMs;
	if (mode === "clock_reverse") h.f.now--;
	if (mode === "claim_hold" || mode === "claim_refused") {
		await expect(h.dispatch(api)).resolves.toMatchObject({ state: "held_unknown" });
		expect(h.sends).toBe(0);
		expect(h.runtime.state).toBe("held");
	} else {
		await expect(api.inspect(h.f.input.options.routeId)).rejects.toBeDefined();
		expect(h.client.callTool).toHaveBeenCalledOnce();
	}
});

it("refuses finite draft and Send when minimum complete readback cannot fit", async () => {
	const h = await finiteFixture(60);
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(h.dispatch(api)).resolves.toMatchObject({ state: "held_unknown" });
	expect(h.sends).toBe(0);
	expect(h.events).not.toContain("native:fill");
});
it("carries two original drafts and Sends without resetting them", async () => {
	const h = await finiteFixture(18, 2);
	const api = await bindOwnNativeSendFrontend(h.runtime, h.intent, h.authority);
	await expect(h.dispatch(api)).resolves.toMatchObject({
		state: "replied",
		reply: { text: h.answer },
	});
	expect(h.sends).toBe(1);
	const rows = await readdir(h.f.dirs.consumer);
	const reservations = await Promise.all(
		rows
			.filter((n) => n.startsWith("reservation-"))
			.map(async (n) => JSON.parse(await readFile(join(h.f.dirs.consumer, n), "utf8"))),
	);
	expect(reservations.filter((r) => r.bucket === "send")).toHaveLength(1);
	expect(reservations.filter((r) => r.bucket === "draft")).toHaveLength(1);
});
