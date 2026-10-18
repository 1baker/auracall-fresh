import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi as activityMock } from "vitest";

activityMock.mock("../../src/browser/chatgptTabActivity.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/browser/chatgptTabActivity.js")>();
	return { ...original, requireInactiveChatgptTab: activityMock.fn(async () => {}) };
});

import { describe, expect, test, vi } from "vitest";

import {
	buildLiveFollowWarningEvidence,
	classifyLiveFollowFailureEffectState,
	classifyLiveFollowWarning,
} from "../../src/accountMirror/configuredLiveFollowAffinity.js";

describe("configured live-follow affinity", () => {
	test("settles read-only failures without an outcome-unknown fence", () => {
		expect(classifyLiveFollowFailureEffectState()).toBe("settled");
	});

	test("projects an Account Mirror census warning into the aggregate warning taxonomy", () => {
		const error = Object.assign(new Error("Requests too quickly"), {
			details: {
				providerGuard: {
					kind: "requests-too-quickly",
					summary: "ChatGPT requests-too-quickly warning detected.",
				},
			},
		});

		expect(classifyLiveFollowWarning(error)).toEqual({
			classification: "rate-limit",
			reason: "ChatGPT requests-too-quickly warning detected.",
		});
	});

	test("builds privacy-bounded warning evidence without provider identifiers", () => {
		expect(
			buildLiveFollowWarningEvidence({ reason: "Too many requests; temporarily limited." }, 7),
		).toEqual({
			classifierVersion: "chatgpt-visible-blocking-surface-v1",
			visibleSummary: "Too many requests; temporarily limited.",
			sourceTargetClass: "leased-page",
			openTargetCount: 7,
			resourcePathClasses: [],
		});
	});
});

// Exercise completion after the collector has released its read transport.
describe("live-follow final warning transport", () => {
	test.each([
		"clean",
		"late-warning",
		"probe-failure",
		"probe-stall",
	])("checks fresh final transport and preserves %s outcome", async (outcome) => {
		const lifecycle = await import("../../packages/browser-service/src/chromeLifecycle.js");
		const runtimeModule = await import("../../src/browser/tabConcurrencyRuntime.js");
		const coordinator = await import("../../src/accountMirror/liveFollowTabCoordinator.js");
		const { BrowserService } = await import("../../src/browser/service/browserService.js");
		const { createConfiguredLiveFollowAffinity } = await import(
			"../../src/accountMirror/configuredLiveFollowAffinity.js"
		);
		const claim = { leaseId: "lease-1", revision: 1 };
		const lease = {
			leaseId: "lease-1",
			targetId: "target-1",
			ownerOperationId: "op-1",
			revision: 1,
		};
		const registry = {
			list: vi.fn(async () => []),
			recordMeaningfulUse: vi.fn(async () => ({ ok: true, value: { claim } })),
			idle: vi.fn(async () => ({ ok: true })),
		};
		const warningRecord = vi.fn(async () => undefined);
		const guardModule = await import("../../src/browser/chatgptRateLimitGuard.js");
		vi.spyOn(guardModule, "recordChatgptRateLimitDetection").mockResolvedValue(undefined as never);
		vi.spyOn(lifecycle, "listChromeTargets").mockResolvedValue([]);
		const close = vi.fn(async () => undefined);
		const evaluate = vi.fn(async () => {
			if (outcome === "probe-failure") throw new Error("fresh probe failed");
			if (outcome === "probe-stall") return new Promise<never>(() => {});
			return { result: { value: outcome === "late-warning" ? "Too many requests" : null } };
		});
		const connect = vi
			.spyOn(lifecycle, "connectToChromeTarget")
			// biome-ignore lint/style/useNamingConvention: CDP names its protocol domain Runtime.
			.mockResolvedValue({ Runtime: { evaluate }, close } as never);
		vi.spyOn(runtimeModule, "createBrowserTabConcurrencyRuntime").mockReturnValue({
			registry,
			ledger: { recordProviderWarning: warningRecord },
		} as never);
		vi.spyOn(coordinator, "acquireLiveFollowCrawlerTab").mockResolvedValue({
			endpoint: { host: "127.0.0.1", port: 37749 },
			lease,
			claim,
		} as never);
		vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
			resolveServiceTarget: async () => ({
				host: "127.0.0.1",
				port: 37749,
				managedBrowserProfile: "/managed/chatgpt",
			}),
			getMutationAuditSink: () => async () => undefined,
		} as never);
		try {
			const affinity = await createConfiguredLiveFollowAffinity({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: { tabConcurrencyMode: "tab-affinity" },
					profiles: {
						"runtime-1": { services: { chatgpt: { identity: { accountId: "account-1" } } } },
					},
				} as never,
				provider: "chatgpt",
				runtimeProfileId: "runtime-1",
				operationId: "op-1",
				maxBrowserInteractionsPerMinute: 20,
			});
			registry.list.mockResolvedValue([lease] as never);
			const staleEvaluate = vi.fn(async () => ({ result: { value: null } }));
			await affinity?.providerTrafficGovernor.checkWarning?.({ evaluate: staleEvaluate });
			staleEvaluate.mockRejectedValue(new Error("WebSocket is not open: readyState 3 (CLOSED)"));
			if (outcome === "probe-stall") {
				vi.useFakeTimers();
				const pending = affinity?.completeSuccess().then(
					() => null,
					(e) => e.message,
				);
				await vi.advanceTimersByTimeAsync(10000);
				expect(await pending).toContain("Owned ChatGPT warning check timed out");
				vi.useRealTimers();
			} else if (outcome === "clean")
				await expect(affinity?.completeSuccess()).resolves.toBeUndefined();
			else
				await expect(affinity?.completeSuccess()).rejects.toThrow(
					outcome === "late-warning" ? /Too many requests/ : /fresh probe failed/,
				);
			expect(registry.idle).toHaveBeenCalledTimes(outcome === "clean" ? 1 : 0);
			expect(warningRecord).toHaveBeenCalledTimes(outcome === "late-warning" ? 1 : 0);
			expect(connect).toHaveBeenCalledWith(
				expect.objectContaining({ target: "target-1", port: 37749 }),
			);
			expect(evaluate).toHaveBeenCalledOnce();
			expect(close).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
		}
	});
});

describe("configured cold-start custody", () => {
	test.each([
		false,
		true,
	])("launches blank with one process crawler and deadlines for restored pages; retained lease: %s", async (retainedLease) => {
		const lifecycle = await import("../../packages/browser-service/src/chromeLifecycle.js");
		const runtimeModule = await import("../../src/browser/tabConcurrencyRuntime.js");
		const { createInMemoryBrowserTabLeaseRegistry } = await import(
			"../../packages/browser-service/src/service/tabLeaseRegistry.js"
		);
		const { BrowserService } = await import("../../src/browser/service/browserService.js");
		const { createConfiguredLiveFollowAffinity } = await import(
			"../../src/accountMirror/configuredLiveFollowAffinity.js"
		);
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const processCheck = await import("../../packages/browser-service/src/processCheck.js");
		const verifyAbsent = vi
			.spyOn(processCheck, "verifyChromeProcessAbsent")
			.mockResolvedValue(true);
		if (retainedLease) {
			const reserved = await registry.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "/managed/chatgpt",
					service: "chatgpt",
					tenantKey: "service-account:chatgpt:account-id=account-1",
				},
				targetId: "gone-target",
				workload: { kind: "live-follow", operationId: "cold-start" },
				operationId: "cold-start",
				now: new Date().toISOString(),
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				targetFingerprint: "https://chatgpt.com/",
			});
			if (!reserved.ok) throw new Error("reserve failed");
			await registry.idle({
				claim: reserved.value.claim,
				now: new Date().toISOString(),
				effectState: "settled",
			});
		}
		const resolveServiceTarget = vi.fn(async (request: { ensurePort: boolean }) =>
			request.ensurePort
				? {
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/chatgpt",
						tabs: [
							{ id: "restored-1", type: "page", url: "https://chatgpt.com/c/retained" },
							{ id: "restored-2", type: "page", url: "https://chatgpt.com/c/retained" },
							{ id: "startup-blank", type: "page", url: "about:blank" },
						],
					}
				: { managedBrowserProfile: "/managed/chatgpt" },
		);
		vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
			resolveServiceTarget,
			getMutationAuditSink: () => async () => undefined,
		} as never);
		vi.spyOn(runtimeModule, "createBrowserTabConcurrencyRuntime").mockReturnValue({
			registry,
			ledger: {},
		} as never);
		const open = vi
			.spyOn(lifecycle, "openChromeTarget")
			.mockResolvedValue({ id: "owned-crawler" } as never);
		const close = vi.spyOn(lifecycle, "closeRemoteChromeTarget").mockResolvedValue(undefined);
		try {
			const affinity = await createConfiguredLiveFollowAffinity({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: { tabConcurrencyMode: "tab-affinity" },
					profiles: {
						"runtime-1": { services: { chatgpt: { identity: { accountId: "account-1" } } } },
					},
				} as never,
				provider: "chatgpt",
				runtimeProfileId: "runtime-1",
				operationId: "cold-start",
				maxBrowserInteractionsPerMinute: 12,
			});
			expect(resolveServiceTarget).toHaveBeenLastCalledWith(
				expect.objectContaining({ configuredUrl: "about:blank", ensurePort: true }),
			);
			expect(affinity?.tabAffinity.targetId).toBe("owned-crawler");
			expect(affinity?.tabAffinity.allowInitialNavigation).toBe(true);
			expect(open).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledWith(
				45011,
				"about:blank",
				"127.0.0.1",
				undefined,
				expect.objectContaining({ kind: "pre-lease-target-acquisition" }),
			);
			expect(close).not.toHaveBeenCalled();
			expect((await registry.list()).filter((lease) => lease.state !== "released")).toHaveLength(4);
			expect((await registry.list()).filter((lease) => lease.processBinding)).toHaveLength(1);
			if (retainedLease) expect(verifyAbsent).toHaveBeenCalledWith("/managed/chatgpt");
		} finally {
			vi.restoreAllMocks();
		}
	});
});

describe("live-follow shared backend admission", () => {
	test.each([
		"shared-budget",
		"uncertain",
	])("owned follow request admission preserves %s", async (mode) => {
		const { createFileBackedProviderInteractionLedger } = await import(
			"../../packages/browser-service/src/service/interactionLedger.js"
		);
		const lifecycle = await import("../../packages/browser-service/src/chromeLifecycle.js");
		const runtimeModule = await import("../../src/browser/tabConcurrencyRuntime.js");
		const coordinator = await import("../../src/accountMirror/liveFollowTabCoordinator.js");
		const { BrowserService } = await import("../../src/browser/service/browserService.js");
		const { createConfiguredLiveFollowAffinity } = await import(
			"../../src/accountMirror/configuredLiveFollowAffinity.js"
		);
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-follow-backend-"));
		const ledger = () => createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
		const leases = [1, 2].map((id) => ({
			leaseId: `lease-${id}`,
			targetId: `target-${id}`,
			ownerOperationId: `op-${id}`,
			revision: 1,
			workload: { kind: "live-follow" },
			retention: "live-follow",
		}));
		const registry = {
			list: vi.fn(async () => leases),
			recordMeaningfulUse: vi.fn(
				async (input: { claim: { leaseId: string; revision: number } }) => ({
					ok: true,
					value: { claim: input.claim },
				}),
			),
			idle: vi.fn(async () => ({ ok: true })),
		};
		vi.spyOn(lifecycle, "listChromeTargets").mockResolvedValue([]);
		vi.spyOn(runtimeModule, "createBrowserTabConcurrencyRuntime").mockImplementation(
			() => ({ registry, ledger: ledger() }) as never,
		);
		vi.spyOn(coordinator, "acquireLiveFollowCrawlerTab").mockImplementation(async (input) => {
			const lease = leases.find((item) => item.ownerOperationId === input.operationId);
			if (!lease) throw new Error("Missing fixture lease");
			return {
				endpoint: { host: "127.0.0.1", port: 37749 },
				lease,
				claim: { leaseId: lease.leaseId, revision: 1 },
			} as never;
		});
		vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
			resolveServiceTarget: async () => ({
				host: "127.0.0.1",
				port: 37749,
				managedBrowserProfile: "/managed/chatgpt",
			}),
			getMutationAuditSink: () => async () => undefined,
		} as never);
		try {
			const tasks = await Promise.all(
				leases.slice(0, mode === "uncertain" ? 1 : 2).map((lease) =>
					createConfiguredLiveFollowAffinity({
						userConfig: {
							auracallProfile: "runtime-1",
							browser: { tabConcurrencyMode: "tab-affinity" },
							services: { chatgpt: { maxBackendRequestsPerMinute: 1 } },
							profiles: {
								"runtime-1": { services: { chatgpt: { identity: { accountId: "account-1" } } } },
							},
						} as never,
						provider: "chatgpt",
						runtimeProfileId: "runtime-1",
						operationId: lease.ownerOperationId,
						maxBrowserInteractionsPerMinute: 20,
						now: () => new Date("2026-10-17T12:00:00Z"),
					}),
				),
			);
			const dispatched = vi.fn(async () => {
				if (mode === "uncertain") throw new Error("fixture send outcome unknown");
			});
			const outcomes = await Promise.allSettled(
				tasks.map(async (task, index) => {
					const admit = task?.providerTrafficGovernor.admitBackendRequest;
					if (!admit) throw new Error("Live-follow backend admission missing");
					await admit(`sha256:${String(index + 1).repeat(64)}`, dispatched);
				}),
			);
			if (mode === "uncertain") {
				expect(dispatched).toHaveBeenCalledOnce();
				expect(outcomes).toEqual([
					expect.objectContaining({
						status: "rejected",
						reason: expect.objectContaining({ message: "fixture send outcome unknown" }),
					}),
				]);
				vi.spyOn(lifecycle, "connectToChromeTarget").mockResolvedValue({
					// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
					Runtime: { evaluate: async () => ({ result: { value: null } }) },
					close: async () => undefined,
				} as never);
				await expect(tasks[0]?.completeSuccess()).rejects.toThrow(
					"backend request outcome remains unknown",
				);
				return;
			}
			expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
			expect(dispatched).toHaveBeenCalledOnce();
			expect(outcomes.filter((item) => item.status === "rejected")).toEqual([
				expect.objectContaining({
					reason: expect.objectContaining({ name: "ProviderBackendRequestBudgetExceededError" }),
				}),
			]);
		} finally {
			vi.restoreAllMocks();
			await rm(directory, { recursive: true, force: true });
		}
	});
});
