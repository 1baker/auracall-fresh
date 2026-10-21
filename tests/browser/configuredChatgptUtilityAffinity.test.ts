import { verifyChromeProcessAbsent } from "../../packages/browser-service/src/processCheck.js";

vi.mock("../../packages/browser-service/src/processCheck.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../packages/browser-service/src/processCheck.js")>()),
	verifyChromeProcessAbsent: vi.fn(async () => false),
}));

import { vi as activityMock } from "vitest";

activityMock.mock("../../src/browser/chatgptTabActivity.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/browser/chatgptTabActivity.js")>();
	return { ...original, requireInactiveChatgptTab: activityMock.fn(async () => {}) };
});

import { describe, expect, test, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { ProviderInteractionGovernorClosedError } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const userConfig = {
	auracallProfile: "runtime-1",
	browser: { tabConcurrencyMode: "tab-affinity", chatgptUrl: "https://chatgpt.com/" },
	profiles: {
		"runtime-1": {
			services: { chatgpt: { identity: { accountId: "account-1" } } },
		},
	},
} as never;

describe("configured ChatGPT utility affinity", () => {
	test.each([
		"active",
		"lost-owner",
		"storage-failure",
		"expired",
	])("maintains utility custody or fails closed; %s", async (mode) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
		const owner = { processId: process.pid, instanceId: "fixture-utility" };
		const registry = createInMemoryBrowserTabLeaseRegistry({ ownerIdentity: owner });
		const ledger = createInMemoryProviderInteractionLedger();
		const storageError = new Error("fixture heartbeat storage unavailable");
		let signal: AbortSignal | undefined;
		try {
			const operation = runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: async () => ({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "settings-inventory",
				mutability: "read-only",
				options: { configuredUrl: "https://chatgpt.com/library", requireExistingTarget: true },
				buildListOptions: async (options) => options,
				run: async (options) => {
					signal = options.abortSignal;
					if (mode !== "active") {
						if (mode === "storage-failure")
							vi.spyOn(registry, "heartbeat").mockRejectedValueOnce(storageError);
						else if (mode === "lost-owner") {
							const [lease] = await registry.list();
							await registry.markLost({
								leaseId: lease.leaseId,
								expectedRevision: lease.revision,
								now: new Date().toISOString(),
								reason: "restart-unverified",
							});
						}
						if (mode === "expired") vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1));
						await vi.advanceTimersByTimeAsync(30_001);
						expect(signal?.aborted).toBe(true);
						// Deliberately ignore cancellation: the controller must still reject success.
						return "observed";
					}
					await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
					await reconcileStaleTabLeases({
						registry,
						scope: {
							runtimeProfileId: "runtime-1",
							service: "chatgpt",
							managedBrowserProfile: "/managed/runtime-1/chatgpt",
							tenantKey: "service-account:chatgpt:account-id=account-1",
						},
						currentOwner: { processId: process.pid + 100_000, instanceId: "maintenance" },
						isOwnerAlive: () => true,
					});
					const heartbeat = registry.heartbeat.bind(registry);
					let release!: () => void;
					let entered!: () => void;
					const held = new Promise<void>((resolve) => {
						release = resolve;
					});
					const started = new Promise<void>((resolve) => {
						entered = resolve;
					});
					vi.spyOn(registry, "heartbeat").mockImplementationOnce(async (input) => {
						const result = await heartbeat(input);
						entered();
						await held;
						return result;
					});
					await vi.advanceTimersByTimeAsync(30_000);
					await started;
					const governor = options.providerTrafficGovernor;
					if (!governor) throw new Error("Expected provider traffic governor");
					const actionResult = governor
						.begin({
							kind: "navigate",
							interactionClass: "conversation-read",
							source: "fixture:settings-restore",
						})
						.then(
							(action) => ({ ok: true as const, action }),
							(error) => ({ ok: false as const, error }),
						);
					await vi.advanceTimersByTimeAsync(0);
					release();
					const observed = await actionResult;
					if (!observed.ok) throw observed.error;
					const action = observed.action;
					await action?.settle({ outcome: "succeeded" });
					return "observed";
				},
				deps: {
					currentOwner: owner,
					isOwnerAlive: () => true,
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: async () =>
						[{ id: "library-target", url: "https://chatgpt.com/library" }] as never,
					mutationAudit: async () => undefined,
				},
			});
			if (mode === "active") await expect(operation).resolves.toBe("observed");
			else if (mode === "storage-failure") await expect(operation).rejects.toBe(storageError);
			else if (mode === "expired") {
				await expect(operation).rejects.toThrow(
					"ChatGPT utility lease heartbeat failed: invalid-transition.",
				);
				expect((await registry.list())[0]).toMatchObject({
					idleExpiresAt: "2026-10-19T12:05:00.000Z",
					lastMeaningfulUseAt: "2026-10-19T12:00:00.000Z",
				});
			} else await expect(operation).rejects.toThrow("Utility operation and settlement failed.");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	test("adopts the existing exact Library target without opening or closing a page", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: (() => {
				let index = 0;
				return () => `lease-library-${++index}`;
			})(),
		});
		const ledger = createInMemoryProviderInteractionLedger();
		const openTarget = vi.fn();
		const closeTarget = vi.fn();
		const records: BrowserMutationRecord[] = [];
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			const action = await options.providerTrafficGovernor?.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "history-materialization:fixture",
			});
			await action?.settle({ outcome: "succeeded" });
			return options.tabTargetId;
		});

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: {
						tabConcurrencyMode: "tab-affinity",
						chatgptUrl: "https://chatgpt.com/",
					},
					profiles: {
						"runtime-1": {
							services: { chatgpt: { identity: { accountId: "account-1" } } },
						},
					},
				} as never,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					preserveActiveTab: true,
					requireExistingTarget: true,
					providerTrafficContext: {
						trafficPhase: "materialization",
						workKey: "scope:history-materialization",
					},
				},
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => [
						{ id: "blank-target", url: "about:blank" },
						{ id: "library-target", url: "https://chatgpt.com/library?fixture=1" },
					]) as never,
					openTarget: openTarget as never,
					closeTarget,
					mutationAudit: async (record) => {
						records.push(record);
					},
				},
			}),
		).resolves.toBe("library-target");

		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({
				tabTargetId: "library-target",
				tabUrl: "https://chatgpt.com/library?fixture=1",
				preserveActiveTab: true,
				providerTrafficGovernor: expect.objectContaining({
					attribution: expect.objectContaining({
						operationId: "library-files",
						tabLeaseId: "lease-library-2",
					}),
				}),
			}),
		);
		expect(openTarget).not.toHaveBeenCalled();
		expect(closeTarget).not.toHaveBeenCalled();
		expect(records).toEqual([
			expect.objectContaining({
				phase: "start",
				trafficPhase: "materialization",
				workKey: "scope:history-materialization",
			}),
			expect.objectContaining({
				phase: "complete",
				trafficPhase: "materialization",
				workKey: "scope:history-materialization",
			}),
		]);
	});

	test("fails closed without creating a target when no exact Library target exists", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		const openTarget = vi.fn();
		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: {
						tabConcurrencyMode: "tab-affinity",
						chatgptUrl: "https://chatgpt.com/",
					},
					profiles: {
						"runtime-1": {
							services: { chatgpt: { identity: { accountId: "account-1" } } },
						},
					},
				} as never,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					requireExistingTarget: true,
				},
				buildListOptions: async (options) => options,
				run: vi.fn(),
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => [{ id: "blank-target", url: "about:blank" }]) as never,
					openTarget: openTarget as never,
					closeTarget: vi.fn(),
				},
			}),
		).rejects.toThrow("no existing compatible target");
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("enforces a materialization traffic plan before a second provider action", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-materialization",
		});
		const ledger = createInMemoryProviderInteractionLedger();
		const records: BrowserMutationRecord[] = [];
		const workKey = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "history-materialization:hmj-budget",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					preserveActiveTab: true,
					requireExistingTarget: true,
					providerTrafficContext: { trafficPhase: "materialization", workKey },
					accountMirrorProviderTrafficPlan: {
						object: "account_mirror_provider_traffic_plan",
						version: 1,
						budgets: [{ phase: "materialization", kind: "page_navigate", workKey, limit: 1 }],
					},
				},
				buildListOptions: async (options) => options,
				run: async (options) => {
					const first = await options.providerTrafficGovernor?.begin({
						kind: "navigate",
						interactionClass: "conversation-read",
						source: "history-materialization:first",
					});
					await first?.settle({ outcome: "succeeded" });
					await options.providerTrafficGovernor?.begin({
						kind: "navigate",
						interactionClass: "conversation-read",
						source: "history-materialization:second",
					});
				},
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => [
						{ id: "library-target", url: "https://chatgpt.com/library" },
					]) as never,
					openTarget: vi.fn() as never,
					closeTarget: vi.fn(),
					mutationAudit: async (record) => {
						records.push(record);
					},
				},
			}),
		).rejects.toThrow(
			"Provider traffic budget exhausted for materialization/page_navigate at limit 1",
		);
		expect(records).toHaveLength(2);
	});

	test("reuses one exact utility target and accounts each read", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: (() => {
				let index = 0;
				return () => `reservation-${++index}`;
			})(),
		});
		const openTarget = vi.fn(async () => ({ id: "utility-target" }));
		const listTargets = vi.fn(async () => [
			{ id: "utility-target", url: "https://chatgpt.com/" },
		]) as never;
		const browserService = {
			resolveServiceTarget: vi.fn().mockResolvedValue({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: "/managed/runtime-1/chatgpt",
			}),
		} as never;
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			await options.interactionGovernor?.beforeInteraction("generic");
			return options.tabTargetId;
		});
		const common = {
			userConfig,
			browserService,
			utilityId: "utility-1",
			mutability: "read-only" as const,
			buildListOptions: async (options: BrowserProviderListOptions) => options,
			run,
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets,
				openTarget: openTarget as never,
				closeTarget: vi.fn(),
			},
		};

		await expect(runConfiguredChatgptUtilityOperation(common)).resolves.toBe("utility-target");
		await expect(runConfiguredChatgptUtilityOperation(common)).resolves.toBe("utility-target");

		expect(openTarget).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledTimes(2);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({
				disableProviderMutationRetry: false,
				preserveInteractionGovernorForProviderSession: true,
			}),
		);
		expect(await registry.list()).toEqual([
			expect.objectContaining({
				state: "idle",
				workload: { kind: "ephemeral", operationId: "utility-1" },
				actionCounts: expect.objectContaining({ targetCreations: 1, adoptions: 1 }),
			}),
		]);
		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "settled", interactionClass: "list-read" }),
			expect.objectContaining({ state: "settled", interactionClass: "list-read" }),
		]);
	});

	test("lets a job-owned utility tab navigate when the caller explicitly allows it", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-1",
		});
		const run = vi.fn(async (options: BrowserProviderListOptions) => options.preserveActiveTab);

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "history-materialization:hmj-1",
				mutability: "read-only",
				options: { allowNavigation: true },
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			}),
		).resolves.toBe(false);
	});

	test("closes the interaction governor when the utility operation returns", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger();
		let escapedOptions: BrowserProviderListOptions | undefined;

		await runConfiguredChatgptUtilityOperation({
			userConfig,
			browserService: {
				resolveServiceTarget: vi.fn().mockResolvedValue({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: "/managed/runtime-1/chatgpt",
				}),
			} as never,
			utilityId: "history-materialization:hmj-1",
			mutability: "read-only",
			buildListOptions: async (options) => options,
			run: async (options) => {
				escapedOptions = options;
				return "complete";
			},
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets: vi.fn(async () => []) as never,
				openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
				closeTarget: vi.fn(),
			},
		});

		await expect(
			escapedOptions?.interactionGovernor?.beforeInteraction("renavigation"),
		).rejects.toBeInstanceOf(ProviderInteractionGovernorClosedError);
		expect(await ledger.list()).toEqual([]);
	});

	test("preserves a provider-stage error when governor settlement does not settle", async () => {
		vi.useFakeTimers();
		try {
			const cleanupPhases: string[] = [];
			const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
			const ledger = createInMemoryProviderInteractionLedger({
				createReservationId: () => "reservation-1",
			});
			const settle = vi
				.spyOn(ledger, "settle")
				.mockImplementation(() => new Promise(() => undefined));
			const operation = runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					libraryInventoryLifecycle: {
						onStageEntered: vi.fn(),
						onCleanupPhase: (phase) => cleanupPhases.push(phase),
					},
				},
				buildListOptions: async (options) => options,
				run: async (options) => {
					await options.interactionGovernor?.beforeInteraction("generic");
					throw new Error("ChatGPT Library inventory stage dom-inventory timed out after 10000ms.");
				},
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			});
			const rejection = expect(operation).rejects.toThrow(
				"ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
			);

			await vi.advanceTimersByTimeAsync(5_000);
			await rejection;

			expect(settle).toHaveBeenCalledOnce();
			expect((await registry.list())[0]).toMatchObject({
				state: "active",
				targetId: "utility-target",
			});
			expect(cleanupPhases).toEqual([
				"read-rejected",
				"affinity-settlement-started",
				"affinity-settlement-timed-out",
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	test("marks a failed provider mutation outcome unknown without retrying", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-1",
		});
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			await options.interactionGovernor?.beforeInteraction("upload-submit");
			throw new Error("connection lost after click");
		});

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "utility-1",
				mutability: "provider-mutating",
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			}),
		).rejects.toThrow("connection lost after click");

		expect(run).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ disableProviderMutationRetry: true }),
		);
		expect((await registry.list())[0]).toMatchObject({
			state: "idle",
			effectState: "outcome-unknown",
		});
		expect((await ledger.list())[0]).toMatchObject({
			state: "settled",
			effectState: "outcome-unknown",
			outcome: "failed",
		});
	});
});

test.each([
	true,
	false,
])("utility cold startup reconciles idle leases only with native absence: %s", async (absent) => {
	const registry = createInMemoryBrowserTabLeaseRegistry();
	const ledger = createInMemoryProviderInteractionLedger();
	const scope = {
		runtimeProfileId: "runtime-1",
		service: "chatgpt",
		managedBrowserProfile: "/managed/runtime-1/chatgpt",
		tenantKey: "service-account:chatgpt:account-id=account-1",
	};
	const now = () => new Date();
	const reserved = await registry.reserve({
		scope,
		targetId: "gone",
		workload: { kind: "ephemeral", operationId: "old" },
		operationId: "old",
		now: now().toISOString(),
		idleTtlMs: 300000,
		absoluteTtlMs: 3600000,
	});
	if (!reserved.ok) throw new Error("fixture reserve failed");
	await registry.idle({
		claim: reserved.value.claim,
		now: now().toISOString(),
		effectState: "settled",
	});
	const resolveServiceTarget = vi.fn(async ({ ensurePort }) => ({
		host: ensurePort ? "127.0.0.1" : undefined,
		port: ensurePort ? 45011 : undefined,
		managedBrowserProfile: scope.managedBrowserProfile,
	}));
	const run = vi.fn(async () => "observed");
	vi.mocked(verifyChromeProcessAbsent).mockResolvedValue(absent);
	try {
		const pending = runConfiguredChatgptUtilityOperation({
			userConfig,
			browserService: { resolveServiceTarget } as never,
			utilityId: "inventory",
			mutability: "read-only",
			buildListOptions: async (o) => o,
			run,
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets: async () => [],
				openTarget: async () => ({ id: "new", targetId: "new", url: "https://chatgpt.com/" }),
				closeTarget: async () => {},
			} as never,
		});
		if (absent) {
			await expect(pending).resolves.toBe("observed");
			expect((await registry.list()).find((l) => l.targetId === "gone")?.state).toBe("released");
			expect(run).toHaveBeenCalledOnce();
		} else {
			await expect(pending).rejects.toThrow("tab-leases-active");
			expect((await registry.list()).find((l) => l.targetId === "gone")?.state).toBe("idle");
			expect(run).not.toHaveBeenCalled();
			expect(resolveServiceTarget.mock.calls.some(([o]) => o.ensurePort)).toBe(false);
		}
	} finally {
		vi.mocked(verifyChromeProcessAbsent).mockResolvedValue(false);
	}
});
