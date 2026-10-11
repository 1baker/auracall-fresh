import { describe, expect, test, vi } from "vitest";

import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown,
	runConfiguredChatgptTabMaintenance,
} from "../../src/browser/configuredChatgptTabMaintenance.js";

vi.mock("../../src/browser/chatgptTabActivity.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/browser/chatgptTabActivity.js")>();
	return {
		...original,
		probeChatgptTabActivity: vi.fn(async () => "inactive"),
		requireInactiveChatgptTab: vi.fn(async () => {}),
	};
});

describe("configured ChatGPT tab maintenance", () => {
	test("expires every extra physical page while retaining the live-follow tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const scope = {
			runtimeProfileId: "affinity",
			managedBrowserProfile: "/managed/affinity/chatgpt",
			service: "chatgpt",
			tenantKey: "service-account:chatgpt:account-id=account-1",
		};
		const follow = await registry.reserve({
			scope,
			targetId: "follow",
			workload: { kind: "live-follow", operationId: "completion" },
			operationId: "completion",
			now: "2026-10-05T11:00:00Z",
			idleTtlMs: 1000,
			absoluteTtlMs: 2000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!follow.ok) throw new Error("fixture failed");
		await registry.idle({
			claim: follow.value.claim,
			now: "2026-10-05T11:00:00Z",
			effectState: "settled",
		});
		const pages = new Map<string, string>([
			["follow", "https://chatgpt.com/"],
			["blank", "about:blank"],
			["external", "https://example.com/"],
			...Array.from({ length: 32 }, (_, i): [string, string] => [
				`restored-${i}`,
				`https://chatgpt.com/c/fixture-${i}`,
			]),
		]);
		let time = "2026-10-05T11:00:01Z";
		const run = () =>
			runConfiguredChatgptTabMaintenance({
				userConfig: {
					browser: { tabConcurrencyMode: "tab-affinity" },
					profiles: {
						affinity: {
							browser: { tabConcurrencyMode: "tab-affinity" },
							services: { chatgpt: { identity: { accountId: "account-1" } } },
						},
					},
				} as never,
				now: () => new Date(time),
				deps: {
					createRuntime: () => ({ registry }),
					createBrowserService: () => ({
						resolveServiceTarget: async () => ({
							host: "127.0.0.1",
							port: 9222,
							managedBrowserProfile: scope.managedBrowserProfile,
						}),
					}),
					listTargets: (async () =>
						Array.from(pages, ([id, url]) => ({ id, url, type: "page" }))) as never,
					closeTarget: (async (_host: string, _port: number, id: string) => {
						pages.delete(id);
					}) as never,
				},
			});
		await run();
		time = "2026-10-05T11:04:01Z";
		await run();
		expect(pages.size).toBe(35);
		time = "2026-10-05T11:05:01Z";
		const summary = await run();
		expect(summary.errors).toEqual([]);
		expect(Array.from(pages.keys())).toEqual(["follow"]);
		expect(summary.closedCount).toBe(34);
	});
	test("retires only settled idle leases in the exact stopped managed-browser scope", async () => {
		const leaseIds = ["crawler", "materialization", "active", "uncertain", "unrelated"];
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => leaseIds.shift() ?? "unexpected",
		});
		const scope = {
			runtimeProfileId: "affinity",
			managedBrowserProfile: "/managed/affinity/chatgpt",
			service: "chatgpt",
			tenantKey: "service-account:chatgpt:account-id=account-1",
		};
		const reserve = async (input: {
			targetId: string;
			workload: { kind: "live-follow" | "ephemeral"; operationId: string };
			scope?: typeof scope;
		}) => {
			const result = await registry.reserve({
				scope: input.scope ?? scope,
				targetId: input.targetId,
				workload: input.workload,
				operationId: `owner-${input.targetId}`,
				now: "2026-09-30T18:00:00.000Z",
				idleTtlMs: 900_000,
				absoluteTtlMs: 3_600_000,
			});
			if (!result.ok) throw new Error(`failed to reserve ${input.targetId}`);
			return result.value.claim;
		};
		const crawlerClaim = await reserve({
			targetId: "crawler-target",
			workload: { kind: "live-follow", operationId: "completion-1" },
		});
		const materializationClaim = await reserve({
			targetId: "materialization-target",
			workload: { kind: "ephemeral", operationId: "materialization-1" },
		});
		await reserve({
			targetId: "active-target",
			workload: { kind: "ephemeral", operationId: "active-1" },
		});
		const uncertainClaim = await reserve({
			targetId: "uncertain-target",
			workload: { kind: "ephemeral", operationId: "uncertain-1" },
		});
		const unrelatedClaim = await reserve({
			targetId: "unrelated-target",
			workload: { kind: "ephemeral", operationId: "unrelated-1" },
			scope: {
				...scope,
				runtimeProfileId: "other",
				managedBrowserProfile: "/managed/other/chatgpt",
			},
		});
		await registry.idle({
			claim: crawlerClaim,
			now: "2026-09-30T18:00:01.000Z",
			effectState: "settled",
		});
		await registry.idle({
			claim: materializationClaim,
			now: "2026-09-30T18:00:02.000Z",
			effectState: "settled",
		});
		await registry.idle({
			claim: uncertainClaim,
			now: "2026-09-30T18:00:03.000Z",
			effectState: "outcome-unknown",
		});
		await registry.idle({
			claim: unrelatedClaim,
			now: "2026-09-30T18:00:04.000Z",
			effectState: "settled",
		});

		const summary = await retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			runtimeProfileId: "affinity",
			managedBrowserProfile: "/managed/affinity/chatgpt",
			now: () => new Date("2026-09-30T18:01:00.000Z"),
			deps: { createRuntime: () => ({ registry }) },
		});

		expect(summary).toEqual({
			retiredLeaseIds: ["crawler", "materialization"],
			deferredLeaseIds: ["uncertain"],
		});
		const leases = Object.fromEntries(
			(await registry.list()).map((lease) => [lease.leaseId, lease]),
		);
		expect(leases.crawler).toMatchObject({
			state: "released",
			retirementReason: "operator",
			finalDisposition: "already-missing",
		});
		expect(leases.materialization).toMatchObject({
			state: "released",
			retirementReason: "operator",
			finalDisposition: "already-missing",
		});
		expect(leases.active).toMatchObject({ state: "active" });
		expect(leases.uncertain).toMatchObject({ state: "idle", effectState: "outcome-unknown" });
		expect(leases.unrelated).toMatchObject({ state: "idle" });
	});

	test("counts one physical browser census across runtime profiles", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const listTargets = vi.fn(async () => [
			{ id: "unleased-target", type: "page", url: "https://chatgpt.com/" },
		]) as never;
		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					first: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
					second: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/shared/chatgpt",
					}),
				}),
				listTargets,
			},
		});

		expect(summary).toMatchObject({
			configuredScopeCount: 2,
			visitedScopeCount: 2,
			liveChatgptTargetCount: 1,
			fencedLiveTargetCount: 1,
			unleasedLiveTargetCount: 0,
		});
		expect(listTargets).toHaveBeenCalledOnce();
	});

	test("registers unleased pages for TTL without closing them before their deadline", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "leased-target",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 300_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const closeTarget = vi.fn();

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:01:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
				listTargets: vi.fn(async () => [
					{ id: "leased-target", type: "page", url: "https://chatgpt.com/c/conversation-1" },
					{ id: "unleased-target", type: "page", url: "https://chatgpt.com/" },
					{ id: "other-target", type: "page", url: "https://example.com/" },
				]) as never,
				closeTarget,
			},
		});

		expect(summary).toMatchObject({
			liveChatgptTargetCount: 2,
			fencedLiveTargetCount: 2,
			unleasedLiveTargetCount: 0,
			targetCensusErrorCount: 0,
		});
		expect(closeTarget).not.toHaveBeenCalled();
		expect((await registry.list())[0]?.state).toBe("idle");
	});

	test("marks a dead-owner active lease lost and releases it only after target absence proof", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			ownerIdentity: { processId: 41, instanceId: "previous-process" },
		});
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		expect(reserved.ok).toBe(true);

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:01:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
				listTargets: vi.fn(async () => []) as never,
				currentOwner: { processId: 99, instanceId: "current-process" },
				isOwnerAlive: () => false,
			},
		});

		expect(summary).toMatchObject({
			restartLostCount: 1,
			restartMissingReleasedCount: 1,
			restartPreservedCount: 0,
			errors: [],
		});
		expect((await registry.list())[0]).toMatchObject({
			state: "released",
			lossReason: "restart-unverified",
			finalDisposition: "already-missing",
		});
	});

	test("visits only explicit affinity profiles without launching a browser", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const resolveServiceTarget = vi.fn().mockResolvedValue({
			host: "127.0.0.1",
			port: 9222,
			managedBrowserProfile: "/managed/affinity/chatgpt",
		});
		let targetLive = true;
		const closeTarget = vi.fn(async () => {
			targetLive = false;
		});
		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({ resolveServiceTarget }),
				listTargets: vi.fn(async () => {
					return targetLive
						? [{ id: "target-1", url: "https://chatgpt.com/c/conversation-1" }]
						: [];
				}) as never,
				closeTarget,
			},
		});

		expect(resolveServiceTarget).toHaveBeenCalledWith(
			expect.objectContaining({ serviceId: "chatgpt", ensurePort: false }),
		);
		expect(closeTarget).toHaveBeenCalledWith("127.0.0.1", 9222, "target-1", expect.any(Function));
		expect(summary).toMatchObject({
			configuredScopeCount: 1,
			visitedScopeCount: 1,
			closedCount: 1,
			errors: [],
		});
	});

	test("revisits and releases a previously lost lease when the managed browser is absent", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-lost" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-lost",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		const lost = await registry.markLost({
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			now: "2026-09-24T12:01:00.000Z",
			reason: "target-missing",
		});
		if (!lost.ok) throw new Error("expected lost lease");

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
			},
		});

		expect(summary).toMatchObject({ restartMissingReleasedCount: 1, errors: [] });
		expect((await registry.list())[0]).toMatchObject({
			state: "released",
			finalDisposition: "already-missing",
		});
	});

	test.each([
		"conversation",
		"live-follow",
	] as const)("closes an expired lost %s tab after its work has lost ownership", async (kind) => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-lost" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-lost",
			workload:
				kind === "conversation"
					? { kind, conversationId: "conversation-1" }
					: { kind, operationId: "follow" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		const lost = await registry.markLost({
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			now: "2026-09-24T12:01:00.000Z",
			reason: "heartbeat-expired",
		});
		if (!lost.ok) throw new Error("expected lost lease");
		let targetLive = true;
		const closeTarget = vi.fn(async () => {
			targetLive = false;
		});

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
				listTargets: vi.fn(async () =>
					targetLive
						? [{ id: "target-lost", type: "page", url: "https://chatgpt.com/c/conversation-1" }]
						: [],
				) as never,
				closeTarget,
			},
		});

		expect(closeTarget).toHaveBeenCalledWith(
			"127.0.0.1",
			9222,
			"target-lost",
			expect.any(Function),
		);
		expect(summary).toMatchObject({ closedCount: 1, restartPreservedCount: 0, errors: [] });
		expect((await registry.list())[0]).toMatchObject({
			state: "released",
			finalDisposition: "closed",
		});
	});

	test("retires expired uncertain leases when the managed browser endpoint is absent", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "live-follow", operationId: "completion-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "outcome-unknown",
		});

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
			},
		});

		expect(summary).toMatchObject({
			deferredScopeCount: 0,
			closedCount: 0,
			alreadyMissingCount: 1,
			errors: [],
		});
		expect((await registry.list())[0]).toMatchObject({
			state: "released",
			effectState: "outcome-unknown",
			finalDisposition: "already-missing",
		});
	});
});
