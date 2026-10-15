import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { readBoundedConversations } from "../../src/accountMirror/chatgptMetadataCollector.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import { ChatgptService } from "../../src/browser/llmService/providers/chatgptService.js";
import type { ResolvedUserConfig } from "../../src/config.js";

const realSetTimeout = setTimeout;
const wire = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../packages/browser-service/src/chromeLifecycle.js")
	>()),
	connectToChromeTarget: wire.connect,
}));

afterEach(() => {
	setAuracallHomeDirOverrideForTest(null);
	vi.restoreAllMocks();
});

test.each([
	"cold",
	"cold-startup",
	"cold-denied",
	"denied-payload",
	"next",
	"preserved",
	"exact-preserved",
	"late-rate-limit",
	"project-index",
	"project-index-mixed",
	"project-conversations-slug",
	"project-conversations-different",
])("standalone reads preserve route custody (%s)", async (scenario) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-context-route-"));
	setAuracallHomeDirOverrideForTest(home);
	const pages = new Map<string, string>();
	let browserReady = scenario !== "cold-startup";
	const opened: string[] = [];
	const navigated: string[] = [];
	const mutations: Array<{ phase: string; kind: string }> = [];
	let reloads = 0;
	let nativeRateLimited = false;
	let payloadReads = 0;
	let payloadReadsAtWarning = 0;
	const registry = createInMemoryBrowserTabLeaseRegistry();
	const ledger = createInMemoryProviderInteractionLedger();
	const config = {
		auracallProfile: "fixture",
		services: {
			chatgpt: {
				identity: { email: "operator@example.test" },
				...(scenario === "denied-payload"
					? { liveFollow: { maxBrowserInteractionsPerMinute: 6, renavigationCooldownMs: 120000 } }
					: {}),
			},
		},
		browser: {
			target: "chatgpt",
			tabConcurrencyMode: "tab-affinity",
			chatgptUrl: "https://chatgpt.com/",
			cache: { rootDir: home, identityKey: "fixture", useDetectedIdentity: false },
		},
	} as ResolvedUserConfig;
	// The endpoint resolver models the external browser process. The production
	// service, affinity wrapper, coordinator, registry and adapter remain real.
	const browserService = {
		getConfig: () => ({}),
		resolveServiceTarget: async (options: { ensurePort?: boolean; configuredUrl?: string }) => {
			if (!browserReady && !options.ensurePort)
				return { managedBrowserProfile: path.join(home, "managed"), browserProfile: "fixture" };
			if (!browserReady) {
				expect(options.configuredUrl).toBe("about:blank");
				browserReady = true;
			}
			return {
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: path.join(home, "managed"),
				browserProfile: "fixture",
				browserProcessId: process.pid,
			};
		},
	} as never;
	wire.connect.mockImplementation(async ({ target }: { target: string }) => ({
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		Runtime: {
			enable: async () => undefined,
			evaluate: async ({ expression }: { expression: string }) => {
				let value: unknown = [];
				if (expression.includes("const latest = new Map()")) {
					value = runInNewContext(expression, {
						document: { querySelectorAll: () => [] },
						location: { origin: "https://chatgpt.com", href: pages.get(target) },
						// biome-ignore lint/style/useNamingConvention: Browser platform constructor.
						URL,
						performance: {
							getEntriesByType: () =>
								nativeRateLimited
									? [
											{
												name: "https://chatgpt.com/backend-api/conversations?offset=0",
												responseStatus: 429,
												responseEnd: 100,
											},
										]
									: [],
						},
					});
				} else if (expression.includes("const projects = new Map()")) {
					const projectRow = {
						getAttribute: (name: string) =>
							(
								({
									"data-app-action-sidebar-project-id": "g-p-11111111111111111111111111111111",
									"data-app-action-sidebar-project-label": "Fixture project",
								}) as Record<string, string>
							)[name] ?? null,
					};
					const legacyLink = {
						getAttribute: () => "/g/g-p-22222222222222222222222222222222/project",
						textContent: "Legacy project",
					};
					const invalidRow = { getAttribute: () => "invalid-project" };
					value = runInNewContext(expression, {
						document: {
							title: "ChatGPT",
							querySelectorAll: (selector: string) =>
								selector === "[data-app-action-sidebar-project-id]"
									? scenario === "project-index-mixed"
										? [projectRow, projectRow, invalidRow]
										: [projectRow]
									: selector === 'a[href*="/project"]' && scenario === "project-index-mixed"
										? [legacyLink]
										: [],
						},
						location: { origin: "https://chatgpt.com", href: pages.get(target) },
						// biome-ignore lint/style/useNamingConvention: Browser platform constructor.
						URL,
					});
				} else if (expression.includes("const expectedChatsLabel")) value = true;
				else if (expression.includes("const conversationOptionsPrefix"))
					value = [
						{
							id: "fixture-conversation",
							title: "Fixture chat",
							projectId: "g-p-11111111111111111111111111111111",
							url: "https://chatgpt.com/g/g-p-11111111111111111111111111111111/c/fixture-conversation",
						},
					];
				else if (expression.includes("const rawId = String(match[1]"))
					value = runInNewContext(expression, {
						location: new URL(pages.get(target) ?? "https://chatgpt.com/"),
						document: { title: "Fixture project" },
					});
				else if (expression === "location.href") value = pages.get(target);
				else if (expression.includes("/api/auth/session"))
					value = { user: { id: "fixture-user", email: "operator@example.test" } };
				else if (expression.includes("const rawConversationId")) value = true;
				else if (expression.includes("document.readyState")) value = true;
				else if (expression.includes("/backend-api/conversation/")) {
					payloadReads += 1;
					value =
						scenario === "denied-payload"
							? { ok: false, status: 404, body: "{}" }
							: { ok: true, body: JSON.stringify({ mapping: {} }) };
				} else if (expression.includes("const pageStart =")) {
					if (scenario === "late-rate-limit") {
						nativeRateLimited = true;
						payloadReadsAtWarning = payloadReads;
					}
					value = {
						messages:
							scenario === "late-rate-limit"
								? []
								: [{ role: "assistant", text: "Known fixture answer" }],
						nextOffset: null,
						totalMessages: 1,
					};
				}
				return { result: { value } };
			},
		},
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		Network: {
			enable: async () => undefined,
			responseReceived: () => () => undefined,
			loadingFinished: () => () => undefined,
		},
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		Page: {
			reload: async () => {
				reloads++;
			},
			enable: async () => undefined,
			navigate: async ({ url }: { url: string }) => {
				expect(
					(await registry.list()).some(
						(lease) => lease.state === "active" && lease.targetId === target,
					),
				).toBe(true);
				expect(
					mutations.some((record) => record.phase === "start" && record.kind === "navigate"),
				).toBe(true);
				navigated.push(url);
				pages.set(target, url);
				return {};
			},
		},
		close: async () => undefined,
	}));
	const service = ChatgptService.create(config, {
		browserService,
		runUtilityOperation: (input) =>
			runConfiguredChatgptUtilityOperation({
				...input,
				buildListOptions: async (overrides) => ({
					...(await input.buildListOptions(overrides)),
					mutationAudit: async (record) => {
						mutations.push(record);
					},
				}),
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: async () =>
						[...pages].map(([id, url]) => ({ id, url, type: "page" })) as never,
					openTarget: async (_port, url) => {
						if (scenario.startsWith("cold")) expect(url).toBe("about:blank");
						opened.push(url);
						pages.set(
							"fixture-target",
							scenario === "project-conversations-slug"
								? "https://chatgpt.com/g/g-p-11111111111111111111111111111111-fixture-project/project"
								: scenario === "project-conversations-different"
									? "https://chatgpt.com/g/g-p-22222222222222222222222222222222/project"
									: url,
						);
						return { id: "fixture-target", url } as never;
					},
					closeTarget: async () => undefined,
				},
			}),
	});
	const controller = new AbortController();
	try {
		if (
			scenario === "project-conversations-slug" ||
			scenario === "project-conversations-different"
		) {
			const projectId = "g-p-11111111111111111111111111111111";
			await expect(
				readBoundedConversations(service as never, projectId, 1, {
					listOptions: { allowNavigation: true },
				}),
			).resolves.toMatchObject({
				items: [expect.objectContaining({ id: "fixture-conversation", projectId })],
				truncated: false,
			});
			expect(navigated).toEqual(
				scenario === "project-conversations-slug"
					? []
					: [`https://chatgpt.com/g/${projectId}/project`],
			);
			expect(reloads).toBe(0);
			expect(opened).toHaveLength(1);
			return;
		}
		if (scenario === "denied-payload") {
			vi.useFakeTimers();
			let settled = false;
			const pending = service
				.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 60000,
					listOptions: { abortSignal: controller.signal },
				})
				.then(
					(value) => ({ value, error: null }),
					(error) => ({ value: null, error }),
				)
				.finally(() => {
					settled = true;
				});
			for (let tick = 0; tick < 180 && !settled; tick++) {
				await vi.advanceTimersByTimeAsync(1000);
				await new Promise<void>((resolve) => realSetTimeout(resolve, 10));
			}
			expect(settled).toBe(true);
			const outcome = await pending;
			expect(outcome.error).toBeNull();
			expect(outcome.value).toMatchObject({
				conversationId: "fixture-conversation",
				messages: [{ role: "assistant", text: "Known fixture answer" }],
			});
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual([
				"https://chatgpt.com/c/fixture-conversation",
				"https://chatgpt.com/c/fixture-conversation",
			]);
			return;
		}
		if (scenario === "project-index" || scenario === "project-index-mixed") {
			await expect(
				service.listProjects({ disableProjectClickFallback: true, accountMirrorInventory: true }),
			).resolves.toEqual([
				{
					id: "g-p-11111111111111111111111111111111",
					name: "Fixture project",
					provider: "chatgpt",
					url: "https://chatgpt.com/g/g-p-11111111111111111111111111111111/project",
				},
				...(scenario === "project-index-mixed"
					? [
							{
								id: "g-p-22222222222222222222222222222222",
								name: "Legacy project",
								provider: "chatgpt",
								url: "https://chatgpt.com/g/g-p-22222222222222222222222222222222/project",
							},
						]
					: []),
			]);
			expect(navigated).toEqual(["https://chatgpt.com/"]);
			expect(opened).toEqual(["about:blank"]);
			expect(payloadReads).toBe(0);
			return;
		}
		if (scenario === "late-rate-limit") {
			await expect(
				service.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 10000,
				}),
			).rejects.toThrow("Provider traffic stopped after rate-limit");
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			expect(payloadReads).toBe(payloadReadsAtWarning);
			await expect(
				service.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
				}),
			).rejects.toThrow(/rate.limit/i);
			expect(payloadReads).toBe(payloadReadsAtWarning);
			expect(opened).toHaveLength(1);
			return;
		}
		if (scenario === "cold-denied") {
			await expect(
				service.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
					listOptions: {
						interactionGovernor: {
							beforeInteraction: async () => {
								throw new Error("fixture denied initial navigation");
							},
						},
					},
				}),
			).rejects.toThrow("fixture denied initial navigation");
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual([]);
			expect(pages.get("fixture-target")).toBe("about:blank");
			await expect(
				service.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
				}),
			).resolves.toMatchObject({ messages: [{ role: "assistant", text: "Known fixture answer" }] });
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			return;
		}
		await expect(
			service.getConversationContext("fixture-conversation", {
				refresh: true,
				retryAttempts: 0,
				timeoutMs: 1000,
			}),
		).resolves.toMatchObject({
			conversationId: "fixture-conversation",
			messages: [{ role: "assistant", text: "Known fixture answer" }],
		});
		if (scenario === "cold" || scenario === "cold-startup") {
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			return;
		}
		expect(opened).toEqual(["about:blank"]);
		expect(navigated).toEqual(["https://chatgpt.com/c/fixture-conversation"]);

		if (scenario === "next") {
			await expect(
				service.getConversationContext("next-conversation", {
					listOptions: { interactionGovernor: { beforeInteraction: async () => undefined } },
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
				}),
			).resolves.toMatchObject({
				conversationId: "next-conversation",
				messages: [{ role: "assistant", text: "Known fixture answer" }],
			});
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual([
				"https://chatgpt.com/c/fixture-conversation",
				"https://chatgpt.com/c/next-conversation",
			]);
		}
		if (scenario === "preserved" || scenario === "exact-preserved") {
			await expect(
				service.getConversationContext("next-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
					listOptions: {
						interactionGovernor: { beforeInteraction: async () => undefined },
						preserveActiveTab: true,
						...(scenario === "exact-preserved"
							? {
									host: "127.0.0.1",
									port: 45011,
									tabTargetId: "fixture-target",
								}
							: {}),
					},
				}),
			).rejects.toThrow("not the expected https://chatgpt.com/c/next-conversation");
			expect(opened).toEqual(["about:blank"]);
			expect(navigated).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
		}
		expect(pages.size).toBe(1);
	} finally {
		if (scenario === "denied-payload") {
			controller.abort(new Error("fixture finished"));
			await vi.advanceTimersByTimeAsync(200000);
			vi.useRealTimers();
		}
		await rm(home, { recursive: true, force: true, maxRetries: 2 });
	}
}, 15000);
