import { describe, expect, test, vi } from "vitest";

import {
	type BrowserTabLeaseRegistry,
	createInMemoryBrowserTabLeaseRegistry,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	acquireEphemeralBrowserTab,
	acquireLiveFollowCrawlerTab,
} from "../../src/accountMirror/liveFollowTabCoordinator.js";

const scope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/managed/chatgpt",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

describe("live-follow crawler tab coordinator", () => {
	test("concurrent acquisitions in one process never open a second physical target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		let opened = 0;
		let releaseOpen!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseOpen = resolve;
		});
		let opening!: () => void;
		const started = new Promise<void>((resolve) => {
			opening = resolve;
		});
		const endpoint = {
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile: scope.managedBrowserProfile,
		};
		const common = {
			registry,
			scope,
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => endpoint,
			startBrowser: async () => endpoint,
			inspectTarget: async () => ({ url: "https://chatgpt.com/" }),
			openTarget: async () => {
				const id = `target-${++opened}`;
				opening();
				await gate;
				return { targetId: id, url: "https://chatgpt.com/" };
			},
			closeTarget: async () => {},
		};
		const first = acquireLiveFollowCrawlerTab({ ...common, operationId: "follow" });
		const second = acquireEphemeralBrowserTab({ ...common, operationId: "child" });
		await started;
		releaseOpen();
		const results = await Promise.allSettled([first, second]);
		expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
		expect(opened).toBe(1);
	});
	test("live follow and child materialization reuse one physical tab in the same process", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const pages = new Map<string, string>();
		const endpoint = {
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile: scope.managedBrowserProfile,
		};
		const common = {
			registry,
			scope,
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => endpoint,
			startBrowser: async () => endpoint,
			inspectTarget: async (_endpoint: unknown, id: string) =>
				pages.get(id) ? { url: pages.get(id) as string } : null,
			openTarget: async () => {
				const id = `page-${pages.size + 1}`;
				pages.set(id, "https://chatgpt.com/");
				return { targetId: id, url: "https://chatgpt.com/" };
			},
			closeTarget: async ({ targetId }: { targetId: string }) => {
				pages.delete(targetId);
			},
		};
		const follow = await acquireLiveFollowCrawlerTab({ ...common, operationId: "follow" });
		await registry.idle({
			claim: follow.claim,
			now: new Date().toISOString(),
			effectState: "settled",
		});
		const child = await acquireEphemeralBrowserTab({
			...common,
			operationId: "history-materialization:child",
		});
		expect(child.lease.targetId).toBe(follow.lease.targetId);
		expect(pages.size).toBe(1);
		expect(child.lease.retention).toBe("live-follow");
		await expect(
			acquireEphemeralBrowserTab({ ...common, operationId: "concurrent-child" }),
		).rejects.toThrow("process");
		expect(pages.size).toBe(1);
	});
	test("adopts the only compatible cold-start target instead of opening a second page", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-cold-start",
		});
		const openTarget = vi.fn();
		const tab = await acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "completion-cold-start",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-25T12:00:00.000Z"),
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [
				{ targetId: "startup-page", url: "https://chatgpt.com/" },
				{ targetId: "extension-page", url: "chrome-extension://fixture/background.html" },
			],
			inspectTarget: vi.fn(),
			openTarget,
			closeTarget: vi.fn(),
		});

		expect(tab.lease).toMatchObject({
			targetId: "startup-page",
			workload: { kind: "live-follow", operationId: "completion-cold-start" },
			actionCounts: { targetCreations: 0, adoptions: 1 },
		});
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("fails closed when cold start exposes multiple compatible unowned targets", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-ambiguous",
		});
		const openTarget = vi.fn();

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-ambiguous",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				resolveExistingEndpoint: async () => null,
				startBrowser: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				listTargets: async () => [
					{ targetId: "startup-page-1", url: "https://chatgpt.com/" },
					{ targetId: "startup-page-2", url: "https://chatgpt.com/c/restored" },
				],
				inspectTarget: vi.fn(),
				openTarget,
				closeTarget: vi.fn(),
			}),
		).rejects.toThrow("multiple compatible unowned targets");

		expect(openTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toEqual([]);
	});

	test("creates one governed process crawler and assigns restored pages finite deadlines", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const closeTarget = vi.fn();
		const openTarget = vi.fn(async () => ({
			targetId: "owned-crawler",
			url: "https://chatgpt.com/",
		}));
		const settle = vi.fn(async () => undefined);
		const begin = vi.fn(async () => ({ settle }));
		const tab = await acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "restored-startup",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			coldStartTargetPolicy: "create",
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [
				{ targetId: "restored-1", url: "https://chatgpt.com/c/retained" },
				{ targetId: "restored-2", url: "https://chatgpt.com/c/retained" },
				{ targetId: "startup-blank", url: "about:blank" },
			],
			preLeaseProviderTrafficGovernor: { begin } as never,
			inspectTarget: vi.fn(),
			openTarget,
			closeTarget,
		});
		expect(tab.lease.targetId).toBe("owned-crawler");
		expect(openTarget).toHaveBeenCalledTimes(1);
		expect(begin).toHaveBeenCalledTimes(1);
		expect(settle).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "succeeded", targetId: "owned-crawler" }),
		);
		expect(closeTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toHaveLength(4);
		expect((await registry.list()).filter((lease) => lease.retention === "ttl")).toHaveLength(3);
	});

	test.each([
		"success",
		"open-failure",
		"cleanup-failure",
	])("retains browser custody while replacing its only startup page: %s", async (mode) => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-after-blank",
		});
		const pages = new Map([["startup-blank", "about:blank"]]);
		let browserAlive = true;
		const closeTarget = vi.fn(async ({ targetId }: { targetId: string }) => {
			if (mode === "cleanup-failure") throw new Error("fixture cleanup unavailable");
			pages.delete(targetId);
			if (!pages.size) browserAlive = false;
		});
		const inspectTarget = vi.fn(async (_endpoint: unknown, id: string) => {
			const url = pages.get(id);
			return url ? { url } : null;
		});
		const openTarget = vi.fn(async () => {
			if (!browserAlive) throw new Error("Browser exited after its last window closed");
			if (mode === "open-failure") throw new Error("fixture creation unavailable");
			pages.set("crawler-after-blank", "https://chatgpt.com/");
			return { targetId: "crawler-after-blank", url: "https://chatgpt.com/" };
		});

		const acquisition = acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "completion-after-blank",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [{ targetId: "startup-blank", url: "about:blank" }],
			inspectTarget,
			openTarget,
			closeTarget,
		});

		if (mode === "open-failure") {
			await expect(acquisition).rejects.toThrow("fixture creation unavailable");
			expect(browserAlive).toBe(true);
			expect([...pages.keys()]).toEqual(["startup-blank"]);
			expect(closeTarget).not.toHaveBeenCalled();
			expect(await registry.list()).toEqual([]);
			return;
		}
		if (mode === "cleanup-failure") {
			await expect(acquisition).rejects.toThrow("replacement retained under lease");
			expect(browserAlive).toBe(true);
			expect([...pages.keys()]).toEqual(["startup-blank", "crawler-after-blank"]);
			expect(await registry.list()).toMatchObject([
				{ targetId: "crawler-after-blank", state: "idle", effectState: "settled" },
			]);
			return;
		}
		const tab = await acquisition;

		expect(closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "startup-blank",
		});
		expect(inspectTarget).toHaveBeenCalledWith(
			expect.objectContaining({ port: 45011 }),
			"startup-blank",
		);
		expect(openTarget).toHaveBeenCalledOnce();
		expect(browserAlive).toBe(true);
		expect([...pages.keys()]).toEqual(["crawler-after-blank"]);
		expect(tab.lease).toMatchObject({
			targetId: "crawler-after-blank",
			actionCounts: { targetCreations: 1, adoptions: 0, closes: 0 },
		});
	});

	test("creates one dedicated crawler target and reuses it on the next pass", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const openTarget = vi.fn(async () => ({
			targetId: "crawler-1",
			url: "https://chatgpt.com/",
		}));
		const common = {
			registry,
			scope,
			operationId: "completion-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => ({ url: "https://chatgpt.com/c/observed" })),
			openTarget,
			closeTarget: vi.fn(),
		};
		const first = await acquireLiveFollowCrawlerTab({
			...common,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
		});
		await registry.idle({
			claim: first.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const second = await acquireLiveFollowCrawlerTab({
			...common,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
		});

		expect(second.lease).toMatchObject({
			leaseId: "lease-1",
			targetId: "crawler-1",
			workload: { kind: "live-follow", operationId: "completion-1" },
			actionCounts: { targetCreations: 1, adoptions: 1 },
		});
		expect(openTarget).toHaveBeenCalledOnce();
	});

	test.each([
		"existing",
		"cold",
	])("rejects unplanned pre-lease target creation for %s browser before opening a page", async (mode) => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const openTarget = vi.fn();
		const begin = vi.fn(async () => {
			throw new Error("pre-lease target budget exhausted");
		});

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-pre-lease-budget",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				coldStartTargetPolicy: "create",
				listTargets: async () => [],
				resolveExistingEndpoint: async () =>
					mode === "cold"
						? null
						: {
								host: "127.0.0.1",
								port: 45011,
								managedBrowserProfile: scope.managedBrowserProfile,
							},
				startBrowser: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				inspectTarget: vi.fn(),
				openTarget,
				closeTarget: vi.fn(),
				preLeaseProviderTrafficGovernor: {
					attribution: {} as never,
					begin,
				},
			}),
		).rejects.toThrow("pre-lease target budget exhausted");

		expect(begin).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "target-open-or-reuse",
				interactionClass: "renavigation",
				reused: false,
			}),
		);
		expect(openTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toEqual([]);
	});

	test.each([
		true,
		false,
	])("reconciles a retained idle crawler only with proven browser absence: %s", async (absent) => {
		let sequence = 0;
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => `lease-${++sequence}`,
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "gone-target",
			workload: { kind: "live-follow", operationId: "stable-scheduler" },
			operationId: "stable-scheduler",
			now: "2026-10-04T20:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("fixture reserve failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-10-04T20:00:01.000Z",
			effectState: "settled",
		});
		const startBrowser = vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile: scope.managedBrowserProfile,
		}));
		const openTarget = vi.fn(async () => ({
			targetId: "new-owned-target",
			url: "https://chatgpt.com/",
		}));
		const acquisition = acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "stable-scheduler",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => null,
			verifyBrowserAbsent: async () => absent,
			startBrowser,
			coldStartTargetPolicy: "create",
			preLeaseProviderTrafficGovernor: {
				// Physical startup inventory is independently supplied below.
				begin: async () => ({ settle: async () => undefined }),
			} as never,
			inspectTarget: vi.fn(),
			openTarget,
			closeTarget: vi.fn(),
			listTargets: async () => [],
		});
		if (absent) {
			expect((await acquisition).lease.targetId).toBe("new-owned-target");
			expect((await registry.list()).find((l) => l.targetId === "gone-target")?.state).toBe(
				"released",
			);
			expect(startBrowser).toHaveBeenCalledTimes(1);
		} else {
			await expect(acquisition).rejects.toThrow("cannot be verified without its browser endpoint");
			expect(startBrowser).not.toHaveBeenCalled();
			expect(openTarget).not.toHaveBeenCalled();
			expect((await registry.list()).find((l) => l.targetId === "gone-target")?.state).toBe("idle");
		}
	});

	test("uses the same exact-target lifecycle for bounded ephemeral work", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-utility",
		});
		const tab = await acquireEphemeralBrowserTab({
			registry,
			scope,
			operationId: "utility-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(),
			openTarget: vi.fn(async () => ({ targetId: "utility-tab", url: "https://chatgpt.com/" })),
			closeTarget: vi.fn(),
		});

		expect(tab.lease).toMatchObject({
			targetId: "utility-tab",
			workload: { kind: "ephemeral", operationId: "utility-1" },
		});
	});

	test("replaces a retained blank lease by adopting an existing exact target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: (() => {
				let index = 0;
				return () => `lease-${++index}`;
			})(),
		});
		const common = {
			registry,
			scope,
			operationId: "library-files",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			closeTarget: vi.fn(),
		};
		const stale = await acquireEphemeralBrowserTab({
			...common,
			targetUrl: "https://chatgpt.com/library",
			inspectTarget: vi.fn(),
			openTarget: vi.fn(async () => ({ targetId: "blank-target", url: "about:blank" })),
		});
		await registry.idle({
			claim: stale.claim,
			now: "2026-09-27T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn();

		const adopted = await acquireEphemeralBrowserTab({
			...common,
			targetUrl: "https://chatgpt.com/library",
			requireExistingTarget: true,
			listTargets: async () => [
				{ targetId: "blank-target", url: "about:blank" },
				{ targetId: "library-target", url: "https://chatgpt.com/library" },
			],
			inspectTarget: vi.fn(async (_endpoint, targetId) =>
				targetId === "blank-target" ? { url: "about:blank" } : null,
			),
			openTarget,
		});

		expect(adopted.lease).toMatchObject({
			targetId: "library-target",
			actionCounts: { targetCreations: 0, adoptions: 1 },
		});
		expect(openTarget).not.toHaveBeenCalled();
		expect(common.closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "blank-target",
		});
	});

	test("closes and releases a new crawler when creation accounting fails", async () => {
		const baseRegistry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-crawler",
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

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-1",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				now: () => new Date("2026-09-24T12:00:00.000Z"),
				resolveExistingEndpoint: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				startBrowser: vi.fn(),
				inspectTarget: vi.fn(),
				openTarget: vi.fn(async () => ({
					targetId: "crawler-1",
					url: "https://chatgpt.com/",
				})),
				closeTarget,
			}),
		).rejects.toThrow("crawler creation accounting failed");

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
