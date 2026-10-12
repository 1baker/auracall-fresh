import { describe, expect, test, vi } from "vitest";
import {
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { retireExpiredTabLeases } from "../../packages/browser-service/src/service/tabLeaseRetirement.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/profiles/chatgpt",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

describe("tab lease retirement", () => {
	test.each([false, true])("records an expiry close and preserves the target on pre-close audit failure: %s", async (auditFails) => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 1_000,
			absoluteTtlMs: 60_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("fixture reserve failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const audit = vi.fn(async (event) => {
			if (auditFails && event.phase === "close-requested") throw new Error("Fixture journal unavailable");
		});
		let live = true;
		const closeTarget = vi.fn(async () => {
			expect(audit).toHaveBeenCalledWith(expect.objectContaining({ phase: "close-requested", reason: "idle-expired", leaseId: "lease-1", targetId: "target-1", actorPid: process.pid }));
			live = false;
		});

		const outcomes = await retireExpiredTabLeases({
			audit,
			registry,
			scope,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveEndpoint: async () => ({ host: "127.0.0.1", port: 45100 }),
			inspectTarget: async () => (live ? { url: "https://chatgpt.com/c/conversation-1" } : null),
			targetMatchesLease: (lease, target) => target.url === lease.targetFingerprint,
			closeTarget,
		});

		if (auditFails) expect(closeTarget).not.toHaveBeenCalled();
		else expect(closeTarget).toHaveBeenCalledWith({ host: "127.0.0.1", port: 45100 }, "target-1");
		expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "retirement-finished", reason: "idle-expired", disposition: auditFails ? "preserved" : "closed", leaseId: "lease-1", targetId: "target-1" }));
		expect(outcomes).toEqual([
			expect.objectContaining({ leaseId: "lease-1", disposition: auditFails ? "preserved" : "closed" }),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining({
				state: auditFails ? "lost" : "released",
				finalDisposition: auditFails ? "preserved" : "closed",
				actionCounts: expect.objectContaining({ closes: auditFails ? 0 : 1 }),
			}),
		]);
	});

	test("preserves an expired target when its current identity does not match the lease", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const mismatch = await registry.reserve({
			scope,
			targetId: "target-mismatch",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 1_000,
			absoluteTtlMs: 60_000,
		});
		if (!mismatch.ok) throw new Error("fixture reserve failed");
		await registry.idle({
			claim: mismatch.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const closeTarget = vi.fn();

		const outcomes = await retireExpiredTabLeases({
			registry,
			scope,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveEndpoint: async () => ({ host: "127.0.0.1", port: 45100 }),
			inspectTarget: async () => ({ url: "https://example.invalid/c/conversation-1" }),
			targetMatchesLease: () => false,
			closeTarget,
		});

		expect(closeTarget).not.toHaveBeenCalled();
		expect(outcomes).toEqual([
			expect.objectContaining({
				leaseId: mismatch.value.lease.leaseId,
				disposition: "preserved",
				detail: "target-identity-mismatch",
			}),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining({ targetId: "target-mismatch", state: "lost" }),
		]);
	});

	test("retires an expired outcome-unknown lease when its target is already missing", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-unknown",
		});
		const unknown = await registry.reserve({
			scope,
			targetId: "target-unknown",
			workload: { kind: "conversation", conversationId: "conversation-2" },
			operationId: "operation-2",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 1_000,
			absoluteTtlMs: 60_000,
		});
		if (!unknown.ok) throw new Error("fixture reserve failed");
		await registry.idle({
			claim: unknown.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "outcome-unknown",
		});
		const closeTarget = vi.fn();

		const audit = vi.fn(async () => undefined);
		const outcomes = await retireExpiredTabLeases({
			audit,
			registry,
			scope,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveEndpoint: async () => ({ host: "127.0.0.1", port: 45100 }),
			inspectTarget: async () => null,
			targetMatchesLease: () => false,
			closeTarget,
		});

		expect(audit).toHaveBeenCalledTimes(1);
		expect(audit).toHaveBeenCalledWith(expect.objectContaining({ phase: "retirement-finished", disposition: "already-missing" }));
		expect(closeTarget).not.toHaveBeenCalled();
		expect(outcomes).toEqual([
			expect.objectContaining({
				leaseId: "lease-unknown",
				reason: "idle-expired",
				disposition: "already-missing",
			}),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining({
				state: "released",
				effectState: "outcome-unknown",
				finalDisposition: "already-missing",
			}),
		]);
	});
});
