import { vi as activityMock } from "vitest";
activityMock.mock("../../src/browser/chatgptTabActivity.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/browser/chatgptTabActivity.js")>();
	return { ...original, requireInactiveChatgptTab: activityMock.fn(async () => {}) };
});
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { BrowserService as BrowserServiceCore } from "../../packages/browser-service/src/service/browserService.js";
import {
	classifyStructuredProviderWarning,
	runChatgptPromptWithConfiguredAffinity,
} from "../../src/browser/chatgptAffinityRuntime.js";
import { DEFAULT_BROWSER_CONFIG } from "../../src/browser/config.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import { resolveConfiguredServiceAccountId } from "../../src/config/serviceAccountIdentity.js";

const processCheckMocks = vi.hoisted(() => ({
	isDevToolsResponsive: vi.fn(async () => true),
}));

vi.mock("../../packages/browser-service/src/processCheck.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../packages/browser-service/src/processCheck.js")>();
	return {
		...actual,
		isDevToolsResponsive: processCheckMocks.isDevToolsResponsive,
	};
});

describe("configured ChatGPT affinity runtime", () => {
	test("two conversations in one process navigate the same physical target", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "process-conversations-"));
		try {
			const userConfig = {
				auracallProfile: "runtime-1",
				browser: { tabConcurrencyMode: "tab-affinity" },
				services: { chatgpt: { identity: { email: "operator@example.com" } } },
			} as never;
			const runtime = createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory });
			const pages = new Map<string, string>();
			const openTarget = vi.fn(async ({ url }: { url: string }) => {
				const targetId = `target-${pages.size + 1}`;
				pages.set(targetId, url);
				return { targetId, url };
			});
			const runExact: Parameters<typeof runChatgptPromptWithConfiguredAffinity>[0]["runExact"] =
				async (input, options) => {
					const targetId = options.tabTargetId;
					if (!targetId || !input.conversationId)
						throw new Error("fixture requires an exact conversation target");
					const url = `https://chatgpt.com/c/${input.conversationId}`;
					if (pages.get(targetId) !== url) expect(options.allowNavigation).toBe(true);
					pages.set(targetId, url);
					return {
						text: "fixture",
						conversationId: input.conversationId,
						url,
						tabTargetId: targetId,
					};
				};
			for (const conversationId of ["chat-1", "chat-2"]) {
				await runChatgptPromptWithConfiguredAffinity({
					userConfig,
					runtime,
					input: { prompt: "fixture", conversationId },
					runSerialized: vi.fn(),
					runExact,
					resolveServiceTarget: async () => ({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/chatgpt",
					}),
					openTarget,
					closeTarget: async ({ targetId }) => {
						pages.delete(targetId);
					},
					inspectTarget: async (_endpoint, targetId) =>
						pages.get(targetId) ? { url: pages.get(targetId) as string } : null,
				});
			}
			expect(openTarget).toHaveBeenCalledOnce();
			expect(pages.size).toBe(1);
			expect((await runtime.registry?.list())?.[0]).toMatchObject({
				state: "idle",
				workload: { kind: "conversation", conversationId: "chat-2" },
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("classifies structured legacy browser warning details", () => {
		expect(
			classifyStructuredProviderWarning({
				message: "Manual verification required",
				details: { providerState: "human_verification" },
			}),
		).toEqual({
			classification: "human-verification",
			reason: "Manual verification required",
		});
	});

	test("preserves serialized execution without resolving or creating a browser target", async () => {
		const runSerialized = vi.fn(async () => ({ text: "serialized" }));
		const resolveServiceTarget = vi.fn();
		const openTarget = vi.fn();

		const result = await runChatgptPromptWithConfiguredAffinity({
			userConfig: { browser: { tabConcurrencyMode: "serialized" } } as never,
			runtime: createBrowserTabConcurrencyRuntime({
				browser: { tabConcurrencyMode: "serialized" },
			} as never),
			input: { prompt: "compatibility" },
			runSerialized,
			runExact: vi.fn(),
			resolveServiceTarget,
			openTarget,
			closeTarget: vi.fn(),
		});

		expect(result).toEqual({ text: "serialized" });
		expect(runSerialized).toHaveBeenCalledOnce();
		expect(resolveServiceTarget).not.toHaveBeenCalled();
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("runs explicit affinity on one newly leased exact target", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-affinity-runtime-"));
		try {
			const userConfig = {
				auracallProfile: "runtime-1",
				browser: {
					tabConcurrencyMode: "tab-affinity",
					chatgptUrl: "https://chatgpt.com/",
				},
				services: {
					chatgpt: { identity: { email: "operator@example.com" } },
				},
			} as never;
			const runtime = createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory });
			const resolveServiceTarget = vi.fn(async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: "/profiles/managed-1",
			}));
			const openTarget = vi.fn(async () => ({
				targetId: "target-1",
				url: "https://chatgpt.com/",
			}));
			const runExact = vi.fn(async (_input, options) => ({
				text: "created",
				conversationId: "conversation-1",
				url: "https://chatgpt.com/c/conversation-1",
				tabTargetId: options.tabTargetId,
			}));
			const operationIds = ["operation-1", "operation-2"];

			const result = await runChatgptPromptWithConfiguredAffinity({
				userConfig,
				runtime,
				input: { prompt: "new" },
				runSerialized: vi.fn(),
				runExact,
				resolveServiceTarget,
				openTarget,
				inspectTarget: vi.fn(async () => ({
					url: "https://chatgpt.com/c/conversation-1",
				})),
				closeTarget: vi.fn(),
				now: () => new Date("2026-09-24T12:00:00.000Z"),
				generateId: () => operationIds.shift() ?? "unexpected-operation",
			});
			const continued = await runChatgptPromptWithConfiguredAffinity({
				userConfig,
				runtime,
				input: { prompt: "continue", conversationId: "conversation-1" },
				runSerialized: vi.fn(),
				runExact,
				resolveServiceTarget,
				openTarget,
				inspectTarget: vi.fn(async () => ({
					url: "https://chatgpt.com/c/conversation-1",
				})),
				closeTarget: vi.fn(),
				now: () => new Date("2026-09-24T12:00:01.000Z"),
				generateId: () => operationIds.shift() ?? "unexpected-operation",
			});

			expect(result).toMatchObject({
				conversationId: "conversation-1",
				tabTargetId: "target-1",
			});
			expect(resolveServiceTarget).toHaveBeenCalledWith(
				expect.objectContaining({ serviceId: "chatgpt", ensurePort: false }),
			);
			expect(openTarget).toHaveBeenCalledOnce();
			expect(continued).toMatchObject({
				conversationId: "conversation-1",
				tabTargetId: "target-1",
			});
			expect(runExact.mock.calls[0]?.[1]).toMatchObject({
				tabTargetId: "target-1",
				preserveActiveTab: false,
			});
			expect(await runtime.readStatus()).toMatchObject({
				leaseCount: 1,
				interactionCount: 2,
				activeInteractionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("coexists with an unrelated exact-tab lease by adopting the live managed-profile owner", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-affinity-runtime-"));
		try {
			const managedBrowserProfile = "/profiles/managed-1";
			const userConfig = {
				auracallProfile: "runtime-1",
				browser: {
					tabConcurrencyMode: "tab-affinity",
					chatgptUrl: "https://chatgpt.com/",
				},
				services: {
					chatgpt: { identity: { email: "operator@example.com" } },
				},
			} as never;
			const runtime = createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory });
			if (!runtime.registry) throw new Error("expected affinity registry");
			const tenantKey = resolveConfiguredServiceAccountId(
				userConfig as unknown as Record<string, unknown>,
				{ serviceId: "chatgpt", runtimeProfileId: "runtime-1" },
			);
			if (!tenantKey) throw new Error("expected configured tenant identity");
			const background = await runtime.registry.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile,
					service: "chatgpt",
					tenantKey,
				},
				targetId: "materialization-target",
				workload: { kind: "ephemeral", operationId: "materialization-1" },
				operationId: "materialization-1",
				now: "2026-09-28T21:46:00.000Z",
				idleTtlMs: 300_000,
				absoluteTtlMs: 3_600_000,
				targetFingerprint: "https://chatgpt.com/library",
			});
			expect(background.ok).toBe(true);

			const launchManualLoginSession = vi.fn();
			const browserService = new BrowserServiceCore(
				{
					...DEFAULT_BROWSER_CONFIG,
					manualLoginProfileDir: managedBrowserProfile,
					chromeProfile: "Default",
				} as never,
				{
					resolveBrowserListTarget: vi.fn(async () => undefined),
					resolveManagedProfileOwner: vi.fn(async () => ({
						host: "127.0.0.1",
						port: 45015,
						pid: 28553,
					})),
					pruneRegistry: vi.fn(async () => undefined),
					launchManualLoginSession,
				},
			);
			const resolveServiceTarget = vi.fn(async (request: { ensurePort?: boolean }) => ({
				...(await browserService.resolveDevToolsTarget({
					ensurePort: request.ensurePort,
					defaultProfileDir: managedBrowserProfile,
					launchUrl: "https://chatgpt.com/",
				})),
				managedBrowserProfile,
			}));
			const openTarget = vi.fn(async () => ({
				targetId: "foreground-target",
				url: "https://chatgpt.com/",
			}));

			await expect(
				runChatgptPromptWithConfiguredAffinity({
					userConfig,
					runtime,
					input: { prompt: "new" },
					runSerialized: vi.fn(),
					runExact: vi.fn(async (_input, options) => ({
						text: "created",
						conversationId: "conversation-1",
						url: "https://chatgpt.com/c/conversation-1",
						tabTargetId: options.tabTargetId,
					})),
					resolveServiceTarget,
					openTarget,
					closeTarget: vi.fn(),
					now: () => new Date("2026-09-28T21:46:01.000Z"),
					generateId: () => "foreground-1",
				}),
			).resolves.toMatchObject({
				conversationId: "conversation-1",
				tabTargetId: "foreground-target",
			});
			expect(openTarget).toHaveBeenCalledOnce();
			expect(launchManualLoginSession).not.toHaveBeenCalled();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("fails before browser resolution when affinity lacks configured tenant identity", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-affinity-runtime-"));
		try {
			const userConfig = {
				browser: { tabConcurrencyMode: "tab-affinity" },
			} as never;
			const resolveServiceTarget = vi.fn();
			await expect(
				runChatgptPromptWithConfiguredAffinity({
					userConfig,
					runtime: createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory }),
					input: { prompt: "new" },
					runSerialized: vi.fn(),
					runExact: vi.fn(),
					resolveServiceTarget,
					openTarget: vi.fn(),
					closeTarget: vi.fn(),
				}),
			).rejects.toThrow("configured ChatGPT tenant identity");
			expect(resolveServiceTarget).not.toHaveBeenCalled();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
