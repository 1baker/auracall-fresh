import { afterEach, expect, test, vi } from "vitest";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createOwnedBackendRequestAuthority } from "../../src/browser/ownedBackendRequestAuthority.js";

afterEach(() => vi.useRealTimers());

test.each([
	"continue",
	"warning",
	"abort",
	"timeout",
])("shared backend wait preserves %s", async (mode) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-18T00:00:00Z"));
	const ledger = createInMemoryProviderInteractionLedger();
	const scope = {
		provider: "chatgpt",
		tenantKey: "account",
		runtimeProfileId: "a",
		managedBrowserProfile: "/managed",
	};
	const controller = new AbortController();
	const make = (id: string) =>
		createOwnedBackendRequestAuthority({
			ledger,
			scope,
			workloadId: id,
			operationId: id,
			tabLeaseId: id,
			backendRequestLimit: 1,
			budgetWaitTimeoutMs: mode === "timeout" ? 500 : 130000,
			abortSignal: controller.signal,
			assertOwnedLease: async () => undefined,
		});
	const sent = vi.fn(async () => undefined);
	await make("a").admit(`sha256:${"a".repeat(64)}`, sent);
	const pending = ["b", "c"].map((id) => make(id).admit(`sha256:${id.repeat(64)}`, sent));
	const result = Promise.allSettled(pending);
	await vi.advanceTimersByTimeAsync(0);
	expect(sent).toHaveBeenCalledTimes(1);
	if (mode === "warning") {
		await ledger.recordProviderWarning({
			scope,
			classification: "rate-limit",
			reason: "fixture429",
			observedAt: new Date().toISOString(),
		});
		await vi.advanceTimersByTimeAsync(1000);
	} else if (mode === "abort") {
		controller.abort(new Error("fixture cancellation"));
		await vi.advanceTimersByTimeAsync(0);
	} else if (mode === "timeout") {
		await vi.advanceTimersByTimeAsync(501);
	} else {
		await vi.advanceTimersByTimeAsync(61000);
		expect(sent).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(61000);
	}
	const outcomes = await result;
	expect(sent).toHaveBeenCalledTimes(mode === "continue" ? 3 : 1);
	expect(outcomes.map((item) => item.status)).toEqual(
		mode === "continue" ? ["fulfilled", "fulfilled"] : ["rejected", "rejected"],
	);
	if (mode === "timeout")
		for (const item of outcomes)
			expect(item).toMatchObject({ reason: { name: "ProviderBackendRequestBudgetExceededError" } });
});

test("transport cancellation preserves an already dispatched failure as uncertain", async () => {
	const ledger = createInMemoryProviderInteractionLedger();
	const cancellation = new AbortController();
	const authority = createOwnedBackendRequestAuthority({
		ledger,
		scope: {
			provider: "chatgpt",
			tenantKey: "account",
			runtimeProfileId: "a",
			managedBrowserProfile: "/managed",
		},
		workloadId: "dispatch",
		operationId: "dispatch",
		tabLeaseId: "dispatch",
		backendRequestLimit: 1,
		assertOwnedLease: async () => undefined,
	});
	await expect(
		authority.admit(
			`sha256:${"d".repeat(64)}`,
			async () => {
				cancellation.abort();
				throw new Error("dispatch failed after cancellation");
			},
			cancellation.signal,
		),
	).rejects.toThrow("dispatch failed after cancellation");
	expect(await ledger.list()).toMatchObject([{ effectState: "outcome-unknown" }]);
});
