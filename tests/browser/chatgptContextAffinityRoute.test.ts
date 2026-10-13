import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import { ChatgptService } from "../../src/browser/llmService/providers/chatgptService.js";
import type { ResolvedUserConfig } from "../../src/config.js";

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
	"next",
	"preserved",
	"exact-preserved",
	"late-rate-limit",
	"project-index",
	"project-index-mixed",
])("standalone reads preserve route custody (%s)", async (scenario) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-context-route-"));
	setAuracallHomeDirOverrideForTest(home);
	const pages = new Map<string, string>();
	const opened: string[] = [];
	const navigated: string[] = [];
	let nativeRateLimited = false;
	let payloadReads = 0;
	let payloadReadsAtWarning = 0;
	const registry = createInMemoryBrowserTabLeaseRegistry();
	const ledger = createInMemoryProviderInteractionLedger();
	const config = {
		auracallProfile: "fixture",
		services: { chatgpt: { identity: { email: "operator@example.test" } } },
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
		resolveServiceTarget: async () => ({
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile: path.join(home, "managed"),
			browserProfile: "fixture",
			browserProcessId: process.pid,
		}),
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
				} else if (expression === "location.href") value = pages.get(target);
				else if (expression.includes("/api/auth/session"))
					value = { user: { id: "fixture-user", email: "operator@example.test" } };
				else if (expression.includes("const rawConversationId")) value = true;
				else if (expression.includes("document.readyState")) value = true;
				else if (expression.includes("/backend-api/conversation/")) {
					payloadReads += 1;
					value = { ok: true, body: JSON.stringify({ mapping: {} }) };
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
		Page: {
			enable: async () => undefined,
			navigate: async ({ url }: { url: string }) => {
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
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: async () =>
						[...pages].map(([id, url]) => ({ id, url, type: "page" })) as never,
					openTarget: async (_port, url) => {
						opened.push(url);
						pages.set("fixture-target", url);
						return { id: "fixture-target", url } as never;
					},
					closeTarget: async () => undefined,
				},
			}),
	});
	try {
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
			expect(navigated).toEqual([]);
			expect(opened).toEqual(["https://chatgpt.com/"]);
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
			expect(opened).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			expect(navigated).toEqual([]);
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
		expect(opened).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
		expect(navigated).toEqual([]);
		if (scenario === "next") {
			await expect(
				service.getConversationContext("next-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
				}),
			).resolves.toMatchObject({
				conversationId: "next-conversation",
				messages: [{ role: "assistant", text: "Known fixture answer" }],
			});
			expect(opened).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			expect(navigated).toEqual(["https://chatgpt.com/c/next-conversation"]);
		}
		if (scenario === "preserved" || scenario === "exact-preserved") {
			await expect(
				service.getConversationContext("next-conversation", {
					refresh: true,
					retryAttempts: 0,
					timeoutMs: 1000,
					listOptions: {
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
			expect(opened).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
			expect(navigated).toEqual([]);
		}
		expect(pages.size).toBe(1);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
}, 15000);
