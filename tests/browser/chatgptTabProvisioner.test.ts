import { describe, expect, test, vi } from "vitest";

import {
	type BrowserTabLeaseRegistry,
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { createChatgptTabProvisioner } from "../../src/browser/providers/chatgptTabProvisioner.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/profiles/managed-1",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

describe("ChatGPT tab provisioner", () => {
	test("creates a guarded conversation target blank without claiming provider navigation", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const openTarget = vi.fn(async ({ url }: { url: string }) => ({ targetId: "guarded", url }));
		const recordTargetAction = vi.spyOn(registry, "recordTargetAction");
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "existing" },
			operationId: "guarded",
			targetUrl: "https://chatgpt.com/c/existing",
			targetCreationUrl: "about:blank",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			openTarget,
			closeTarget: vi.fn(),
		});
		const result = await provision({ interactionReservationId: "reservation" });
		expect(openTarget).toHaveBeenCalledWith(expect.objectContaining({ url: "about:blank" }));
		expect(result.lease.targetFingerprint).toBe("about:blank");
		expect(recordTargetAction.mock.calls.map(([action]) => action.action)).toEqual([
			"target-created",
		]);
	});

	test.each([
		true,
		false,
	])("cold process-tab recovery requires native browser absence: %s", async (absent) => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const first = await registry.reserve({
			scope,
			processBound: true,
			targetId: "old",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "old",
			now: new Date().toISOString(),
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!first.ok) throw new Error("fixture failed");
		await registry.idle({
			claim: first.value.claim,
			now: new Date().toISOString(),
			effectState: "settled",
		});
		const openTarget = vi.fn(async () => ({
			targetId: "new",
			url: "https://chatgpt.com/c/conversation-1",
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "new",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => null,
			verifyBrowserAbsent: async () => absent,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			inspectTarget: async () => null,
			openTarget,
			closeTarget: vi.fn(),
		});
		if (absent) {
			expect((await provision({ interactionReservationId: "reservation" })).lease.targetId).toBe(
				"new",
			);
			expect(openTarget).toHaveBeenCalledOnce();
		} else {
			await expect(provision({ interactionReservationId: "reservation" })).rejects.toThrow(
				"cannot be verified",
			);
			expect(openTarget).not.toHaveBeenCalled();
		}
	});
	test("reacquires a verified idle conversation lease without creating or navigating a tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-previous",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("fixture reservation failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn();
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-next",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => ({
				url: "https://chatgpt.com/c/conversation-1",
			})),
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-2" });

		expect(result.lease).toMatchObject({
			leaseId: "lease-1",
			targetId: "target-1",
			state: "active",
			ownerOperationId: "operation-next",
			actionCounts: { adoptions: 1, navigations: 0, targetCreations: 0 },
		});
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("releases a proven-missing binding before creating one replacement target", async () => {
		const leaseIds = ["lease-old", "lease-new"];
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => leaseIds.shift() ?? "unexpected",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-missing",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-previous",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture reservation failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn(async () => ({
			targetId: "target-new",
			url: "https://chatgpt.com/c/conversation-1",
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-next",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => null),
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-2" });

		expect(result.lease).toMatchObject({ leaseId: "lease-new", targetId: "target-new" });
		expect(openTarget).toHaveBeenCalledOnce();
		expect(await registry.list()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leaseId: "lease-old",
					state: "released",
					lossReason: "target-missing",
					finalDisposition: "already-missing",
				}),
			]),
		);
	});

	test("creates and immediately leases one exact target on an existing endpoint", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const startBrowser = vi.fn();
		const openTarget = vi.fn(async () => ({
			targetId: "target-1",
			url: "https://chatgpt.com/",
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser,
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-1" });

		expect(startBrowser).not.toHaveBeenCalled();
		expect(openTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			url: "https://chatgpt.com/",
		});
		expect(result).toMatchObject({
			lease: {
				leaseId: "lease-1",
				targetId: "target-1",
				state: "active",
				actionCounts: { targetCreations: 1, navigations: 0 },
			},
			endpoint: { host: "127.0.0.1", port: 45011 },
		});
	});

	test("releases settled idle leases when the managed browser endpoint is absent", async () => {
		const leaseIds = ["lease-stale", "lease-new"];
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => leaseIds.shift() ?? "lease-unexpected",
			createControlId: () => "control-1",
		});
		const stale = await registry.reserve({
			scope,
			targetId: "target-stale",
			workload: { kind: "ephemeral", operationId: "history-materialization-stale" },
			operationId: "operation-stale",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 900_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/stale",
		});
		if (!stale.ok) throw new Error("fixture reservation failed");
		await registry.idle({
			claim: stale.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const startBrowser = vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile: scope.managedBrowserProfile,
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveExistingEndpoint: async () => null,
			startBrowser,
			openTarget: async () => ({ targetId: "target-new", url: "https://chatgpt.com/" }),
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-1" });

		expect(startBrowser).toHaveBeenCalledOnce();
		expect(result.lease).toMatchObject({ leaseId: "lease-new", targetId: "target-new" });
		expect(await registry.list()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leaseId: "lease-stale",
					state: "released",
					lossReason: "target-missing",
					finalDisposition: "already-missing",
				}),
			]),
		);
	});

	test("releases settled active leases owned by a dead process across the browser profile", async () => {
		const leaseIds = ["lease-stale", "lease-new"];
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => leaseIds.shift() ?? "lease-unexpected",
			createControlId: () => "control-1",
			ownerIdentity: { processId: 1111, instanceId: "instance-old" },
		});
		const stale = await registry.reserve({
			scope: { ...scope, tenantKey: "tenant-background" },
			targetId: "target-stale",
			workload: { kind: "ephemeral", operationId: "history-materialization-stale" },
			operationId: "operation-stale",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 900_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/stale",
		});
		if (!stale.ok) throw new Error("fixture reservation failed");
		await registry.recordMeaningfulUse({
			claim: stale.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			idleTtlMs: 900_000,
			effectState: "settled",
		});
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			isOwnerAlive: () => false,
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			openTarget: async () => ({ targetId: "target-new", url: "https://chatgpt.com/" }),
			closeTarget: vi.fn(),
		});

		await expect(provision({ interactionReservationId: "interaction-1" })).resolves.toMatchObject({
			lease: { leaseId: "lease-new", targetId: "target-new" },
		});
		expect(await registry.list()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leaseId: "lease-stale",
					state: "released",
					lossReason: "target-missing",
					finalDisposition: "already-missing",
				}),
			]),
		);
	});

	test("holds profile control only around browser startup before target creation", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			createControlId: () => "control-1",
		});
		const events: string[] = [];
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => {
				events.push("start-browser");
				expect(
					await registry.acquireProfileControl({
						scope,
						kind: "browser-startup",
						operationId: "competitor",
						now: "2026-09-24T12:00:00.000Z",
						ttlMs: 30_000,
					}),
				).toMatchObject({ acquired: false, reason: "profile-control-active" });
				return {
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				};
			},
			openTarget: async () => {
				events.push("open-target");
				return {
					targetId: "target-1",
					url: "https://chatgpt.com/c/conversation-1",
				};
			},
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-1" });

		expect(events).toEqual(["start-browser", "open-target"]);
		expect(result.lease.actionCounts).toMatchObject({ targetCreations: 1, navigations: 1 });
	});

	test("closes only its newly created target when immediate lease reservation fails", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-existing",
		});
		await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-existing" },
			operationId: "operation-existing",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		const closeTarget = vi.fn(async () => undefined);
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "reservation-new" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			openTarget: async () => ({ targetId: "target-1", url: "https://chatgpt.com/" }),
			closeTarget,
		});

		await expect(provision({ interactionReservationId: "interaction-1" })).rejects.toThrow(
			"target-owned",
		);
		expect(closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "target-1",
		});
	});

	test("closes and releases its created target when creation accounting fails", async () => {
		const baseRegistry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const registry = new Proxy(baseRegistry, {
			get(target, property, receiver) {
				if (property === "recordTargetAction") {
					return async () => ({
						ok: false as const,
						conflict: { kind: "invalid-transition" as const, lease: (await target.list())[0] },
					});
				}
				const value = Reflect.get(target, property, receiver) as unknown;
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as BrowserTabLeaseRegistry;
		const closeTarget = vi.fn(async () => undefined);
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "reservation-new" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			openTarget: async () => ({ targetId: "target-new", url: "https://chatgpt.com/" }),
			closeTarget,
		});

		await expect(provision({ interactionReservationId: "interaction-1" })).rejects.toThrow(
			"target creation accounting failed",
		);
		expect(closeTarget).toHaveBeenCalledOnce();
		expect(await baseRegistry.list()).toEqual([
			expect.objectContaining({
				state: "released",
				lossReason: "provisioning-failed",
				finalDisposition: "closed",
				actionCounts: expect.objectContaining({ closes: 1 }),
			}),
		]);
	});
});
