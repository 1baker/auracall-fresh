import { expect, it, vi } from "vitest";
import { createRetainedNativeLifetime } from "../../src/browser/frontends/nativeLifetime.js";
import type { NativeRuntimeLifetimeContext } from "../../src/browser/frontends/nativeRuntime.js";
import { P266_ENROLLMENT_PRODUCER } from "../../src/browser/frontends/nativeRuntime.js";

const context = {
	receiptDigest: "a".repeat(64),
	producerSha256: P266_ENROLLMENT_PRODUCER.binarySha256,
	expiresAtMs: 3000,
};

it("qualifies one exact attempt and retains one client without invoking or closing it", async () => {
	const admit = vi.fn(async () => {});
	const policy = createRetainedNativeLifetime({ admit, now: () => 2000 });
	const client = { callTool: vi.fn(), close: vi.fn() };
	await policy.qualify(context);
	await policy.retain(context, client);
	await policy.retain({ ...context }, client);
	expect(admit).toHaveBeenCalledOnce();
	expect(admit).toHaveBeenCalledWith(context);
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
	const admit = vi.fn(async () => {});
	const policy = createRetainedNativeLifetime({ admit, now: () => 2000 });
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
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const policy = createRetainedNativeLifetime({ admit, now: () => now });
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
	const admit = vi.fn(async () => {});
	const policy = createRetainedNativeLifetime({ admit, now: () => 2000 });
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
	const policy = createRetainedNativeLifetime({ admit, now: () => 2000 });
	await expect(policy.qualify(context)).rejects.toThrow(
		"Retain the original native connection and history.",
	);
	await expect(policy.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(admit).toHaveBeenCalledOnce();
});

it("keeps uncertain acquired task history, rejects task drift and never resumes on a stored result", async () => {
	const policy = createRetainedNativeLifetime({ admit: async () => {}, now: () => 2000 });
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
