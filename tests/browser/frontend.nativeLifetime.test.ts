import { expect, it, vi } from "vitest";
import { createRetainedNativeLifetime } from "../../src/browser/frontends/nativeLifetime.js";
import type { NativeRuntimeLifetimeContext } from "../../src/browser/frontends/nativeRuntime.js";
import { P266_ENROLLMENT_PRODUCER } from "../../src/browser/frontends/nativeRuntime.js";

function observation(ctx: NativeRuntimeLifetimeContext, requestNonce: string, observedAtMs = 2000) {
	return {
		receiptDigest: ctx.receiptDigest,
		producerSha256: ctx.producerSha256,
		requestNonce,
		observedAtMs,
		validUntilMs: Math.min(ctx.expiresAtMs, observedAtMs + 30000),
	};
}
const context = {
	receiptDigest: "a".repeat(64),
	producerSha256: P266_ENROLLMENT_PRODUCER.binarySha256,
	expiresAtMs: 3000,
};

it("qualifies one exact attempt and retains one client without invoking or closing it", async () => {
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => 2000,
	});
	const client = { callTool: vi.fn(), close: vi.fn() };
	await policy.qualify(context);
	await policy.retain(context, client);
	await policy.retain({ ...context }, client);
	expect(admit).toHaveBeenCalledOnce();
	expect(admit).toHaveBeenCalledWith(context, expect.stringMatching(/^[a-f0-9]{64}$/));
	expect(client.callTool).not.toHaveBeenCalled();
	expect(client.close).not.toHaveBeenCalled();
	expect(JSON.stringify(policy)).toBe("{}");
	await expect(policy.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
});

it.each([
	{ name: "malformed digest", change: { receiptDigest: "not-a-digest" } },
	{ name: "nonfinite expiry", change: { expiresAtMs: Number.POSITIVE_INFINITY } },
	{ name: "pre-acquired task", change: { nativeTask: { taskId: "borrowed-task" } } },
	{ name: "JSON enable flag", change: { enabled: true } },
])("refuses $name before admission and retains the hold", async ({ change }) => {
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => 2000,
	});
	await expect(
		policy.qualify({ ...context, ...change } as NativeRuntimeLifetimeContext),
	).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(admit).not.toHaveBeenCalled();
	await expect(policy.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
});

it.each(["hold", "expiry"])("never revives a %s while admission is pending", async (change) => {
	let finish!: () => void;
	let now = 2000;
	const admit = vi.fn(
		(ctx: NativeRuntimeLifetimeContext, nonce: string) =>
			new Promise<ReturnType<typeof observation>>((resolve) => {
				finish = () => resolve(observation(ctx, nonce));
			}),
	);
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => now,
	});
	const attempt = policy.qualify(context);
	const rejected = expect(attempt).rejects.toMatchObject({ code: "native_lifetime_held" });
	if (change === "hold") await policy.uncertain(context, "native_runtime_operator_hold");
	else now = 3000;
	finish();
	await rejected;
	await expect(policy.retain(context, { callTool: vi.fn() })).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(admit).toHaveBeenCalledOnce();
});

it.each([
	"client",
	"receipt",
	"producer",
	"expiry",
	"pre-retain",
])("holds %s drift without closing either client", async (change) => {
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => 2000,
	});
	const client = { callTool: vi.fn(), close: vi.fn() };
	const other = { callTool: vi.fn(), close: vi.fn() };
	if (change !== "pre-retain") {
		await policy.qualify(context);
		await policy.retain(context, client);
	}
	const changed = { ...context };
	if (change === "receipt") changed.receiptDigest = "b".repeat(64);
	if (change === "producer") changed.producerSha256 = "b".repeat(64);
	if (change === "expiry") changed.expiresAtMs++;
	await expect(policy.retain(changed, change === "client" ? other : client)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	await expect(policy.retain(context, client)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	for (const value of [client, other]) {
		expect(value.callTool).not.toHaveBeenCalled();
		expect(value.close).not.toHaveBeenCalled();
	}
});

it("keeps rejected admission private and permanently held", async () => {
	const admit = vi.fn(async () => {
		throw new Error("fixture-private-details");
	});
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => 2000,
	});
	await expect(policy.qualify(context)).rejects.toThrow(
		"Retain the original native connection and history.",
	);
	await expect(policy.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(admit).toHaveBeenCalledOnce();
});

it("keeps uncertain acquired task history, rejects task drift and never resumes on a stored result", async () => {
	const policy = createRetainedNativeLifetime({
		admit: async (ctx, nonce) => observation(ctx, nonce),
		assertCurrent: async () => {},
		now: () => 2000,
	});
	const client = { callTool: vi.fn(), close: vi.fn() };
	await policy.qualify(context);
	await policy.retain(context, client);
	const acquired = {
		...context,
		nativeTask: {
			controlRef: "fixture-control",
			taskId: "fixture-task",
			profileId: "fixture-profile",
			browserId: "fixture-browser",
			tabId: "fixture-tab",
			targetId: "fixture-target",
		},
	};
	await policy.uncertain(acquired, "consumer_readback_required");
	await policy.uncertain({ ...acquired }, "stored_completion");
	await expect(policy.retain(context, client)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	await expect(
		policy.uncertain(
			{ ...acquired, nativeTask: { ...acquired.nativeTask, taskId: "foreign-task" } },
			"matching_false",
		),
	).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(client.callTool).not.toHaveBeenCalled();
	expect(client.close).not.toHaveBeenCalled();
});

it("retains the original observation deadline rather than the longer grant expiry", async () => {
	let now = 2000;
	const initial = { ...context, expiresAtMs: 100000 };
	const policy = createRetainedNativeLifetime({
		admit: async (ctx, requestNonce) => ({
			receiptDigest: ctx.receiptDigest,
			producerSha256: ctx.producerSha256,
			requestNonce,
			observedAtMs: now,
			validUntilMs: now + 30000,
		}),
		assertCurrent: async () => {},
		now: () => now,
	});
	const client = { callTool: vi.fn(), close: vi.fn() };
	await policy.qualify(initial);
	now = 32000;
	await expect(policy.retain(initial, client)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(client.close).not.toHaveBeenCalled();
});

it.each([
	"receipt",
	"producer",
	"nonce",
	"future",
	"stale",
	"long-window",
	"grant-expiry",
	"empty-window",
])("refuses %s observation without renewing admission", async (change) => {
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) => {
		const value = observation(ctx, nonce);
		if (change === "receipt") value.receiptDigest = "f".repeat(64);
		if (change === "producer") value.producerSha256 = "f".repeat(64);
		if (change === "nonce") value.requestNonce = "f".repeat(64);
		if (change === "future") value.observedAtMs = 2001;
		if (change === "stale") value.observedAtMs = 1999;
		if (change === "long-window") value.validUntilMs = 32001;
		if (change === "grant-expiry") value.validUntilMs = ctx.expiresAtMs + 1;
		if (change === "empty-window") value.validUntilMs = 2000;
		return value;
	});
	const initial = { ...context, expiresAtMs: change === "grant-expiry" ? 3000 : 100000 };
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => 2000,
	});
	await expect(policy.qualify(initial)).rejects.toMatchObject({ code: "native_lifetime_held" });
	await expect(policy.qualify(initial)).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(admit).toHaveBeenCalledOnce();
});

const task = {
	controlRef: "fixture-control",
	taskId: "fixture-task",
	profileId: "fixture-profile",
	browserId: "fixture-browser",
	tabId: "fixture-tab",
	targetId: "fixture-target",
};
it("requires initial freshness through completed acquisition and never re-observes", async () => {
	let now = 2000;
	const initial = { ...context, expiresAtMs: 100000 };
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const policy = createRetainedNativeLifetime({
		admit,
		assertCurrent: async () => {},
		now: () => now,
	});
	const client = { callTool: vi.fn(), close: vi.fn() };
	await policy.qualify(initial);
	await policy.assertCurrent(initial, { kind: "sdk_connect" });
	await policy.retain(initial, client);
	await policy.assertCurrent(initial, { kind: "acquire" });
	now = 32000;
	await expect(policy.acquired({ ...initial, nativeTask: task })).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(admit).toHaveBeenCalledOnce();
	expect(client.close).not.toHaveBeenCalled();
});

it("requires current protection after acquisition instead of renewing the original observation", async () => {
	let now = 2000;
	const initial = { ...context, expiresAtMs: 100000 },
		acquired = { ...initial, nativeTask: task };
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const assertCurrent = vi.fn(async () => {});
	const policy = createRetainedNativeLifetime({ admit, assertCurrent, now: () => now });
	await policy.qualify(initial);
	await policy.retain(initial, { callTool: vi.fn() });
	await policy.acquired(acquired);
	now = 40000; // Initial observation is expired; original grant and live guard are still valid.
	const command = {
		kind: "command" as const,
		action: "press" as const,
		operationKey: "fixture-control-1",
	};
	await policy.assertCurrent(acquired, command);
	expect(assertCurrent).toHaveBeenCalledWith(acquired, command);
	assertCurrent.mockRejectedValueOnce(new Error("fixture-guard-lost"));
	await expect(policy.assertCurrent(acquired, command)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	await expect(policy.assertCurrent(acquired, command)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(assertCurrent).toHaveBeenCalledTimes(2);
	await policy.assertCurrent(acquired, {
		kind: "original_readback",
		operationKey: "fixture-control-1",
	});
	await expect(policy.assertCurrent(acquired, command)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(admit).toHaveBeenCalledOnce();
	expect(assertCurrent).toHaveBeenCalledTimes(3);
});

it.each([
	"hold",
	"clock-reversal",
	"grant-expiry",
])("does not dispatch after %s during an awaited guard assertion", async (change) => {
	let now = 2000,
		finish!: () => void;
	const initial = { ...context, expiresAtMs: 100000 },
		acquired = { ...initial, nativeTask: task };
	const policy = createRetainedNativeLifetime({
		admit: async (ctx, nonce) => observation(ctx, nonce),
		assertCurrent: () =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
		now: () => now,
	});
	await policy.qualify(initial);
	await policy.retain(initial, { callTool: vi.fn() });
	await policy.acquired(acquired);
	const checking = policy.assertCurrent(acquired, {
		kind: "command",
		action: "snapshot",
		operationKey: "fixture-read-1",
	});
	const rejected = expect(checking).rejects.toMatchObject({ code: "native_lifetime_held" });
	if (change === "hold") await policy.uncertain(acquired, "fixture-operator-hold");
	else now = change === "clock-reversal" ? 1999 : 100000;
	finish();
	await rejected;
});

it("refuses a missing production guard before executing the private admission callback", async () => {
	const admit = vi.fn(async (ctx: NativeRuntimeLifetimeContext, nonce: string) =>
		observation(ctx, nonce),
	);
	const policy = createRetainedNativeLifetime({ admit, now: () => 2000 } as never);
	await expect(policy.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(admit).not.toHaveBeenCalled();
});
