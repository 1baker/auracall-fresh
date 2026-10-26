import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createRetainedNativeLifetime } from "../../src/browser/frontends/nativeLifetime.js";
import {
	type NativeSdkDescriptor,
	prepareOwnNativeProFromFile,
	readNativeRuntimeInput,
	startOwnNativeRuntime,
} from "../../src/browser/frontends/nativeRuntime.js";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const roots: string[] = [];
afterEach(async () => {
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
		retain: vi.fn(async (_context: unknown, _client: unknown) => {}),
		uncertain: vi.fn(async () => {}),
	};
}
it("connects one own client and obtains the preparation route from public acquired binding, never a borrowed task", async () => {
	const f = await fixture(),
		parentHome = process.env.HOME;
	const input = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	const client = { callTool: vi.fn(async (_request: unknown) => opened(f)), close: vi.fn() };
	const connect = vi.fn(async (_descriptor: NativeSdkDescriptor) => client),
		lifetime = fixtureLifetime();
	const runtime = await startOwnNativeRuntime(input, { connect, lifetime });
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
	await expect(startOwnNativeRuntime(input, { connect, lifetime })).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	await expect(startOwnNativeRuntime(input, { connect, lifetime })).rejects.toMatchObject({
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
	const runtime = await startOwnNativeRuntime(input, { connect: async () => client, lifetime });
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
		startOwnNativeRuntime(input, { connect, lifetime }),
		startOwnNativeRuntime(input, { connect, lifetime }),
	]);
	expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	expect(connect).toHaveBeenCalledOnce();
	f.input.options.operationId = "fixture-changed-operation";
	await writeFile(f.path, JSON.stringify(f.input));
	const changed = await readNativeRuntimeInput(f.path, fixturePin, () => f.now);
	await expect(startOwnNativeRuntime(changed, { connect, lifetime })).rejects.toMatchObject({
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
	await expect(startOwnNativeRuntime(input, { connect, lifetime })).rejects.toMatchObject({
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
	await expect(startOwnNativeRuntime(input, { connect, lifetime })).rejects.toMatchObject({
		code: "native_runtime_private_input_invalid",
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
						admit: async () => {},
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
	const runtime = await startOwnNativeRuntime(input, { connect, lifetime });
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
	const runtime = await startOwnNativeRuntime(input, { connect, lifetime });
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
		connect: async () => client,
		lifetime:
			mode === "fixture"
				? fixtureLifetime()
				: createRetainedNativeLifetime({
						admit: async () => {},
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
