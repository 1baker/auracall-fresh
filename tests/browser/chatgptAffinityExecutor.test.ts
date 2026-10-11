import { describe, expect, test, vi } from "vitest";

import {
	createInMemoryProviderInteractionLedger,
	type ProviderInteractionLedger,
	type ProviderInteractionPolicy,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";
import {
	executeChatgptConversation,
	executeProvisionedChatgptConversation,
} from "../../src/browser/chatgptAffinityExecutor.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "managed-1",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

const policy: ProviderInteractionPolicy = {
	maxConcurrentChats: 4,
	maxConversationStartsPerHour: 120,
	maxConversationStartsPerDay: 240,
};

describe("ChatGPT affinity executor", () => {
	test("reserves aggregate capacity before provisioning and then binds the created tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const acquireTab = vi.fn(async () => {
			expect(await ledger.list()).toEqual([
				expect.objectContaining({ state: "started", tabLeaseId: null }),
			]);
			const reserved = await registry.reserve({
				scope,
				targetId: "target-1",
				workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				targetFingerprint: "https://chatgpt.com/",
			});
			if (!reserved.ok) throw new Error("fixture lease conflict");
			return {
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				endpoint: { host: "127.0.0.1", port: 45011 },
			};
		});
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "created",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		const result = await executeProvisionedChatgptConversation({
			registry,
			ledger,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			input: { prompt: "new" },
			runPrompt,
			acquireTab,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			classifyProviderWarning: () => null,
		});

		expect(result.status).toBe("completed");
		expect(acquireTab).toHaveBeenCalledOnce();
		expect(runPrompt).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				providerTrafficGovernor: expect.objectContaining({
					attribution: expect.objectContaining({
						operationId: "operation-1",
						tabLeaseId: "lease-1",
					}),
				}),
			}),
		);
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"interaction-started",
			"tab-lease-bound",
			"interaction-settled",
		]);
	});

	test("does not provision a tab when aggregate warning admission denies the workload", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		await ledger.recordProviderWarning({
			scope: { ...scope, provider: "chatgpt" },
			classification: "human-verification",
			reason: "manual clearance required",
			observedAt: "2026-09-24T12:00:00.000Z",
		});
		const acquireTab = vi.fn();
		const runPrompt = vi.fn();

		const result = await executeProvisionedChatgptConversation({
			registry,
			ledger,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			input: { prompt: "new" },
			runPrompt,
			acquireTab,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			classifyProviderWarning: () => null,
		});

		expect(result).toMatchObject({ status: "denied", admission: { reason: "provider-warning" } });
		expect(acquireTab).not.toHaveBeenCalled();
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("projects a provider warning before any later workload can be admitted", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: (() => {
				let sequence = 0;
				return () => `interaction-${++sequence}`;
			})(),
		});
		const acquireTab = async () => {
			const reserved = await registry.reserve({
				scope,
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			if (!reserved.ok) throw new Error("fixture lease conflict");
			return {
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				endpoint: { host: "127.0.0.1", port: 45011 },
			};
		};
		const rateLimitError = new Error("provider rate limit visible");

		await expect(
			executeProvisionedChatgptConversation({
				registry,
				ledger,
				scope,
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt: async () => {
					throw rateLimitError;
				},
				acquireTab,
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
				classifyProviderWarning: (error) =>
					error === rateLimitError
						? { classification: "rate-limit", reason: "provider rate limit visible" }
						: null,
			}),
		).rejects.toThrow("provider rate limit visible");

		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "frozen", providerWarning: "rate-limit" }),
		]);
		const denied = await ledger.reserve({
			scope: { ...scope, provider: "chatgpt" },
			workloadId: "conversation:conversation-2",
			operationId: "operation-2",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T12:00:02.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(denied).toMatchObject({ allowed: false, reason: "provider-warning" });
	});

	test("keeps serialized rollback free of lease and aggregate-ledger dependencies", async () => {
		const runSerialized = vi.fn(async () => ({ text: "compatibility" }));

		const result = await executeChatgptConversation({
			mode: "serialized",
			input: { prompt: "compatibility" },
			runSerialized,
		});

		expect(result).toEqual({ status: "completed", result: { text: "compatibility" } });
		expect(runSerialized).toHaveBeenCalledOnce();
	});

	test("admits, submits, rebinds, and idles a new conversation on its exact tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "created",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		const result = await executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger,
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "operation-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			input: { prompt: "new" },
			runPrompt,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
		});

		expect(result.status).toBe("completed");
		expect(runPrompt).toHaveBeenCalledOnce();
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({
			targetId: "target-1",
			state: "idle",
			effectState: "settled",
		});
		expect(await ledger.list()).toEqual([
			expect.objectContaining({
				reservationId: "interaction-1",
				tabLeaseId: "lease-1",
				interactionClass: "conversation-start",
				state: "settled",
				effectState: "settled",
				outcome: "succeeded",
			}),
		]);
	});

	test("denies before provider execution when aggregate admission is unavailable", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		await ledger.recordProviderWarning({
			scope: { ...scope, provider: "chatgpt" },
			classification: "rate-limit",
			reason: "provider warning",
			observedAt: "2026-09-24T12:00:00.000Z",
		});
		const runPrompt = vi.fn();

		const result = await executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger,
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "operation-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			input: { prompt: "continue", conversationId: "conversation-1" },
			runPrompt,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
		});

		expect(result).toMatchObject({ status: "denied", admission: { reason: "provider-warning" } });
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("retains an outcome-unknown failure without retrying the provider", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const runPrompt = vi.fn(async () => {
			throw new Error("submit outcome unavailable");
		});

		await expect(
			executeChatgptConversation({
				mode: "tab-affinity",
				registry,
				ledger,
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt,
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
			}),
		).rejects.toThrow("submit outcome unavailable");

		expect(runPrompt).toHaveBeenCalledOnce();
		expect(await ledger.list()).toEqual([
			expect.objectContaining({
				state: "settled",
				effectState: "outcome-unknown",
				outcome: "failed",
			}),
		]);
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({ state: "idle", effectState: "outcome-unknown" });
	});

	test("cancels a confirmed pre-effect failure without consuming settled interaction usage", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const failure = Object.assign(new Error("selector failed before Send"), {
			details: { effectState: "pre_effect" },
		});

		await expect(
			executeChatgptConversation({
				mode: "tab-affinity",
				registry,
				ledger,
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt: vi.fn(async () => {
					throw failure;
				}),
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
			}),
		).rejects.toThrow("selector failed before Send");

		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "settled", effectState: "none", outcome: "cancelled" }),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining({ state: "idle", effectState: "none" }),
		]);
	});

	test("fences the exact lease when ledger settlement fails after provider success", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const failingLedger = new Proxy(ledger, {
			get(target, property, receiver) {
				if (property === "settle") {
					return async () => ({ ok: false as const, reason: "invalid-state" as const });
				}
				const value = Reflect.get(target, property, receiver) as unknown;
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as ProviderInteractionLedger;
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "observed provider response",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		await expect(
			executeChatgptConversation({
				mode: "tab-affinity",
				registry,
				ledger: failingLedger,
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt,
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
			}),
		).rejects.toThrow("Interaction settlement failed: invalid-state.");

		expect(runPrompt).toHaveBeenCalledOnce();
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({ state: "idle", effectState: "outcome-unknown" });
		const reacquired = await registry.acquire({
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-2",
			now: "2026-09-24T12:00:02.000Z",
		});
		expect(reacquired).toMatchObject({
			ok: false,
			conflict: {
				kind: "invalid-transition",
				lease: { effectState: "outcome-unknown" },
			},
		});
	});
});

test.each([
	"conversation",
	"new-conversation",
] as const)("keeps an in-flight %s active through maintenance past its original idle expiry", async (kind) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			ownerIdentity: { processId: 41, instanceId: "chat" },
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "pending",
			workload:
				kind === "conversation"
					? { kind, conversationId: "fixture" }
					: { kind, reservationId: "fixture" },
			operationId: "pending",
			now: new Date().toISOString(),
			idleTtlMs: 900_000,
			absoluteTtlMs: 28_800_000,
		});
		if (!reserved.ok) throw Error("reserve failed");
		let complete!: (value: {
			text: string;
			conversationId: string;
			url: string;
			tabTargetId: string;
		}) => void;
		let started!: () => void;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		const pending = executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger: createInMemoryProviderInteractionLedger(),
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "pending",
			endpoint: { host: "127.0.0.1", port: 9222 },
			input: { prompt: "fixture", conversationId: kind === "conversation" ? "fixture" : undefined },
			policy,
			reservationTtlMs: 28_800_000,
			idleTtlMs: 900_000,
			runPrompt: async () => {
				started();
				return new Promise((resolve) => {
					complete = resolve;
				});
			},
		});
		await ready;
		await vi.advanceTimersByTimeAsync(960_000);
		await reconcileStaleTabLeases({
			registry,
			scope,
			currentOwner: { processId: 99, instanceId: "maintenance" },
			isOwnerAlive: () => true,
		});
		expect((await registry.list())[0].state).toBe("active");
		complete({
			text: "done",
			conversationId: "fixture",
			url: "https://chatgpt.com/c/fixture",
			tabTargetId: "pending",
		});
		await expect(pending).resolves.toMatchObject({ status: "completed" });
		const idle = (await registry.list())[0];
		expect(idle.state).toBe("idle");
		await vi.advanceTimersByTimeAsync(120_000);
		expect((await registry.list())[0]).toEqual(idle);
	} finally {
		vi.useRealTimers();
	}
});

async function pendingChatFixture(
	idleTtlMs = 900_000,
	absoluteTtlMs = 28_800_000,
	abortSignal?: AbortSignal,
) {
	const registry = createInMemoryBrowserTabLeaseRegistry({
		ownerIdentity: { processId: 41, instanceId: "chat" },
	});
	const ledger = createInMemoryProviderInteractionLedger();
	const reserved = await registry.reserve({
		scope,
		targetId: "pending",
		workload: { kind: "conversation", conversationId: "fixture" },
		operationId: "pending",
		now: new Date().toISOString(),
		idleTtlMs,
		absoluteTtlMs,
	});
	if (!reserved.ok) throw Error("reserve failed");
	let fail!: (error: Error) => void;
	let started!: () => void;
	let providerSignal: AbortSignal | undefined;
	let governor:
		| import("../../packages/browser-service/src/service/providerTrafficGovernor.js").ProviderTrafficGovernor
		| undefined;
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	const pending = executeChatgptConversation({
		mode: "tab-affinity",
		registry,
		ledger,
		lease: reserved.value.lease,
		claim: reserved.value.claim,
		operationId: "pending",
		endpoint: { host: "127.0.0.1", port: 9222 },
		input: { prompt: "fixture", conversationId: "fixture" },
		policy,
		reservationTtlMs: 28_800_000,
		idleTtlMs,
		options: { abortSignal },
		runPrompt: async (_input, options) => {
			providerSignal = options?.abortSignal;
			governor = options?.providerTrafficGovernor;
			started();
			return new Promise((_resolve, reject) => {
				fail = reject;
			});
		},
	});
	void pending.catch(() => undefined);
	await Promise.race([
		ready,
		pending.then(
			() => undefined,
			() => undefined,
		),
	]);
	return {
		registry,
		ledger,
		pending,
		fail,
		signal: () => providerSignal,
		governor: () => governor,
	};
}

test.each([
	"provider-error",
	"cancelled",
] as const)("stops in-flight renewal after %s", async (kind) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const controller = new AbortController();
		const f = await pendingChatFixture(900_000, 28_800_000, controller.signal);
		await vi.advanceTimersByTimeAsync(60_000);
		const failure = Error("stop original");
		if (kind === "cancelled") controller.abort(failure);
		else f.fail(failure);
		await expect(f.pending).rejects.toThrow("stop original");
		const settled = (await f.registry.list())[0];
		expect(settled.state).toBe("idle");
		expect(settled.effectState).toBe("outcome-unknown");
		await vi.advanceTimersByTimeAsync(120_000);
		expect((await f.registry.list())[0]).toEqual(settled);
	} finally {
		vi.useRealTimers();
	}
});

test("renewal does not extend the absolute deadline of a pending response", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const f = await pendingChatFixture(1000, 3000);
		await vi.advanceTimersByTimeAsync(3400);
		await expect(f.pending).rejects.toThrow("absolute deadline");
		expect(f.signal()?.aborted).toBe(true);
		const lease = (await f.registry.list())[0];
		expect(Date.parse(lease.idleExpiresAt)).toBeLessThanOrEqual(
			Date.parse(lease.absoluteExpiresAt),
		);
		const before = lease;
		await vi.advanceTimersByTimeAsync(5000);
		expect((await f.registry.list())[0]).toEqual(before);
	} finally {
		vi.useRealTimers();
	}
});

test("a lost lease cancels the original provider instead of renewing another claim", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const f = await pendingChatFixture();
		const lease = (await f.registry.list())[0];
		await f.registry.markLost({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now: new Date().toISOString(),
			reason: "restart-unverified",
		});
		await vi.advanceTimersByTimeAsync(30_000);
		await expect(f.pending).rejects.toThrow("renewal failed");
		expect(f.signal()?.aborted).toBe(true);
		expect((await f.registry.list())[0].state).toBe("lost");
	} finally {
		vi.useRealTimers();
	}
});

test("provider actions remain admitted using the renewed claim", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const f = await pendingChatFixture();
		await vi.advanceTimersByTimeAsync(60_000);
		const governor = f.governor();
		if (!governor) throw new Error("Provider governor missing");
		const action = await governor.begin({
			kind: "in-page-click",
			interactionClass: "generic",
			source: "fixture",
			abortSignal: f.signal(),
		});
		await action.settle({ outcome: "succeeded" });
		f.fail(Error("done"));
		await expect(f.pending).rejects.toThrow("done");
	} finally {
		vi.useRealTimers();
	}
});

test("an already cancelled request never dispatches the provider", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const controller = new AbortController();
		controller.abort(Error("already cancelled"));
		const f = await pendingChatFixture(900_000, 28_800_000, controller.signal);
		await expect(f.pending).rejects.toThrow("already cancelled");
		expect(f.signal()).toBeUndefined();
		const before = (await f.registry.list())[0];
		await vi.advanceTimersByTimeAsync(60_000);
		expect((await f.registry.list())[0]).toEqual(before);
	} finally {
		vi.useRealTimers();
	}
});

test("failure settlement waits for an outstanding renewal write and uses its claim", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const f = await pendingChatFixture();
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const original = f.registry.recordMeaningfulUse.bind(f.registry);
		let first = true;
		vi.spyOn(f.registry, "recordMeaningfulUse").mockImplementation(async (input) => {
			if (first) {
				first = false;
				await blocked;
			}
			return original(input);
		});
		await vi.advanceTimersByTimeAsync(30_000);
		f.fail(Error("provider failed"));
		await Promise.resolve();
		expect((await f.ledger.list())[0].state).toBe("started");
		release();
		await expect(f.pending).rejects.toThrow("provider failed");
		const lease = (await f.registry.list())[0];
		expect(lease.state).toBe("idle");
		expect(lease.effectState).toBe("outcome-unknown");
	} finally {
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});


test.each([
	{ kind: "new-conversation", lateMs: 0 },
	{ kind: "new-conversation", lateMs: 1 },
	{ kind: "conversation", lateMs: 0 },
	{ kind: "conversation", lateMs: 1 },
] as const)("reject $kind completion $lateMs ms after unscheduled absolute deadline", async ({
	kind,
	lateMs,
}) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
	try {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		const reserved = await registry.reserve({
			scope,
			targetId: "pending",
			workload:
				kind === "new-conversation"
					? { kind, reservationId: "fixture" }
					: { kind, conversationId: "fixture" },
			operationId: "pending",
			now: new Date().toISOString(),
			idleTtlMs: 60000,
			absoluteTtlMs: 60000,
		});
		if (!reserved.ok) throw Error("reserve failed");
		let complete!: (result: import("../../src/browser/llmService/types.js").PromptResult) => void;
		let started!: () => void;
		const ready = new Promise<void>((r) => {
			started = r;
		});
		const pending = executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger,
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "pending",
			endpoint: { host: "127.0.0.1", port: 9222 },
			input: { prompt: "fixture", conversationId: kind === "conversation" ? "fixture" : undefined },
			policy,
			reservationTtlMs: 3600000,
			idleTtlMs: 60000,
			runPrompt: async () => {
				started();
				return new Promise((r) => {
					complete = r;
				});
			},
		});
		void pending.catch(() => undefined);
		await ready;
		// Jump the clock without executing the renewal callback: event-loop ordering gate.
		vi.setSystemTime(new Date(Date.parse("2026-10-10T12:01:00Z") + lateMs));
		complete({
			text: "done",
			conversationId: "fixture",
			url: "https://chatgpt.com/c/fixture",
			tabTargetId: "pending",
		});
		await expect(pending).rejects.toThrow("absolute deadline");
		expect(await ledger.list()).toEqual([
			expect.objectContaining({ effectState: "outcome-unknown", outcome: "failed" }),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining(lateMs === 0
          ? { state: "idle", effectState: "outcome-unknown", ownerOperationId: null }
          : { state: "active", ownerOperationId: "pending" }),
		]);
	} finally {
		vi.useRealTimers();
	}
});
