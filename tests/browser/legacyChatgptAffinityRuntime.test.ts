import { describe, expect, it, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runLegacyChatgptWithConfiguredAffinity } from "../../src/browser/legacyChatgptAffinityRuntime.js";
import type { BrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import type { ResolvedBrowserConfig } from "../../src/browser/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";

describe("legacy ChatGPT affinity runtime", () => {
	it("preserves exact legacy target custody and shared backend admission", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		const runtime: BrowserTabConcurrencyRuntime = {
			mode: "tab-affinity",
			enabled: true,
			storageRoot: null,
			registry,
			ledger,
			readStatus: vi.fn(),
		};
		const userConfig = {
			auracallProfile: "research",
			browser: {
				tabConcurrencyMode: "tab-affinity",
				target: "chatgpt",
				url: "https://chatgpt.com/",
			},
			services: {
				chatgpt: { identity: { email: "operator@example.com" }, maxBackendRequestsPerMinute: 1 },
			},
		} as ResolvedUserConfig;
		const backendDispatch = vi.fn(async () => undefined);
		const runLeased = vi.fn(async (target) => {
			expect(target.providerTrafficGovernor.admitBackendRequest).toBeTypeOf("function");
			await target.providerTrafficGovernor.admitBackendRequest(
				`sha256:${"a".repeat(64)}`,
				backendDispatch,
			);
			return {
				answerText: "complete answer",
				answerMarkdown: "complete answer",
				tookMs: 12,
				answerTokens: 3,
				answerChars: 15,
				chromeHost: target.host,
				chromePort: target.port,
				chromeTargetId: target.targetId,
				tabUrl: "https://chatgpt.com/c/conversation-1",
				conversationId: "conversation-1",
			};
		});

		const executionInput: Parameters<typeof runLegacyChatgptWithConfiguredAffinity>[0] = {
			userConfig,
			browserOptions: { prompt: "question" },
			resolvedConfig: {
				url: "https://chatgpt.com/",
				modelStrategy: "ignore",
				tabConcurrencyMode: "tab-affinity",
			} as ResolvedBrowserConfig,
			runtime,
			resolveServiceTarget: async () => ({
				host: "127.0.0.1",
				port: 45100,
				managedBrowserProfile: "/tmp/managed-chatgpt",
			}),
			openTarget: async ({ url }) => {
				expect(url).toBe("about:blank");
				return { targetId: "target-1", url };
			},
			closeTarget: async () => undefined,
			inspectTarget: async () => null,
			runLeased,
		};
		const result = await runLegacyChatgptWithConfiguredAffinity(executionInput);

		expect(runLeased).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "127.0.0.1",
				port: 45100,
				targetId: "target-1",
				targetUrl: "https://chatgpt.com/",
				abortSignal: expect.any(AbortSignal),
				providerTrafficGovernor: expect.objectContaining({
					attribution: expect.objectContaining({
						tabLeaseId: expect.any(String),
						operationId: expect.any(String),
					}),
				}),
			}),
		);
		expect(result.chromeTargetId).toBe("target-1");
		expect(backendDispatch).toHaveBeenCalledOnce();
		expect(
			(await ledger.list()).filter((row) => row.interactionClass === "backend-request"),
		).toMatchObject([{ state: "settled", effectState: "settled" }]);
		expect(
			await ledger.summarizeUsage({
				provider: "chatgpt",
				tenantKey: "service-account:chatgpt:operator@example.com",
				now: new Date().toISOString(),
			}),
		).toMatchObject({ chatsLastHour: 1, interactionsLastMinute: 1 });
		const leases = await registry.list();
		expect(leases).toHaveLength(1);
		expect(leases[0]).toMatchObject({
			state: "idle",
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
		});
		const secondDispatch = vi.fn(async () => undefined);
		await expect(
			runLegacyChatgptWithConfiguredAffinity({
				...executionInput,
				openTarget: async ({ url }) => ({ targetId: "target-2", url }),
				runLeased: async (target) => {
					await target.providerTrafficGovernor.admitBackendRequest?.(
						`sha256:${"b".repeat(64)}`,
						secondDispatch,
					);
					throw new Error("Second request should be denied before dispatch.");
				},
			}),
		).rejects.toMatchObject({ name: "ProviderBackendRequestBudgetExceededError" });
		expect(secondDispatch).not.toHaveBeenCalled();

		const uncertainRegistry = createInMemoryBrowserTabLeaseRegistry();
		const uncertainLedger = createInMemoryProviderInteractionLedger();
		await expect(
			runLegacyChatgptWithConfiguredAffinity({
				...executionInput,
				runtime: { ...runtime, registry: uncertainRegistry, ledger: uncertainLedger },
				runLeased: async (target) => {
					await target.providerTrafficGovernor
						.admitBackendRequest?.(`sha256:${"c".repeat(64)}`, async () => {
							throw new Error("dispatch outcome unknown");
						})
						.catch(() => undefined);
					return {
						...result,
						chromeHost: target.host,
						chromePort: target.port,
						chromeTargetId: target.targetId,
					};
				},
			}),
		).rejects.toMatchObject({ name: "AggregateError" });
		expect(
			(await uncertainLedger.list()).filter((row) => row.interactionClass === "backend-request"),
		).toMatchObject([{ effectState: "outcome-unknown" }]);
	});
});
