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
			const staleEvaluate = vi.fn(async () => ({ result: { value: null } }));
			await affinity?.providerTrafficGovernor.checkWarning?.({ evaluate: staleEvaluate });
			staleEvaluate.mockRejectedValue(new Error("WebSocket is not open: readyState 3 (CLOSED)"));
			registry.list.mockResolvedValue([lease] as never);
			if (outcome === "clean") await expect(affinity?.completeSuccess()).resolves.toBeUndefined();
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
			expect(open).toHaveBeenCalledTimes(1);
			expect(close).not.toHaveBeenCalled();
			expect((await registry.list()).filter((lease) => lease.state !== "released")).toHaveLength(4);
			expect((await registry.list()).filter((lease) => lease.processBinding)).toHaveLength(1);
			if (retainedLease) expect(verifyAbsent).toHaveBeenCalledWith("/managed/chatgpt");
		} finally {
			vi.restoreAllMocks();
		}
	});
});
