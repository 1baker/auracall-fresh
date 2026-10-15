import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import type { CacheStore } from "../../src/browser/llmService/cache/store.js";
import { JsonCacheStore } from "../../src/browser/llmService/cache/store.js";
import {
	LlmService,
	stripProjectInstructionsPrefixFromConversationContext,
} from "../../src/browser/llmService/llmService.js";
import type {
	LlmServiceAdapter,
	PromptInput,
	PromptResult,
} from "../../src/browser/llmService/types.js";
import {
	hasUnknownOwnedRequestCleanup,
	OwnedBackendRequestCleanupError,
} from "../../src/browser/ownedBackendRequestAuthority.js";
import type { ProviderCacheContext } from "../../src/browser/providers/cache.js";
import { readConversationContextReadReceipt } from "../../src/browser/providers/cache.js";
import { readChatgptConversationContextWithClientForTest } from "../../src/browser/providers/chatgptAdapter.js";
import type { ConversationContext } from "../../src/browser/providers/domain.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";

class TestContextLlmService extends LlmService {
	constructor(
		provider: LlmServiceAdapter,
		cacheStore: CacheStore,
		protected readonly fixedCacheContext: ProviderCacheContext,
	) {
		super({ browser: { cache: {} } } as ResolvedUserConfig, provider, {} as never, { cacheStore });
	}

	override async buildListOptions(
		overrides: BrowserProviderListOptions = {},
	): Promise<BrowserProviderListOptions> {
		return { ...overrides };
	}

	override async resolveCacheContext(
		_listOptions: BrowserProviderListOptions = {},
		_options: { prompt?: boolean; detect?: boolean } = {},
	): Promise<ProviderCacheContext> {
		return this.fixedCacheContext;
	}

	async listProjects(): Promise<[]> {
		return [];
	}

	async listConversations(): Promise<[]> {
		return [];
	}

	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("not implemented");
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity() {
		return null;
	}
}

class HangingListOptionsContextLlmService extends TestContextLlmService {
	listOptionsSignal: AbortSignal | undefined;

	override async buildListOptions(
		overrides: BrowserProviderListOptions = {},
		options: {
			onPreflightStage?: (stage: string) => void;
		} = {},
	): Promise<BrowserProviderListOptions> {
		this.listOptionsSignal = overrides.abortSignal;
		options.onPreflightStage?.("browserTargetDiscovery");
		await new Promise(() => {});
		return overrides;
	}
}

class HangingCacheContextLlmService extends TestContextLlmService {
	cacheContextSignal: AbortSignal | undefined;

	override async resolveCacheContext(
		listOptions: BrowserProviderListOptions = {},
		options: { prompt?: boolean; detect?: boolean } = {},
	): Promise<ProviderCacheContext> {
		if (
			options.detect === false &&
			options.prompt === false &&
			listOptions.skipFeatureSignature === true
		) {
			return this.fixedCacheContext;
		}
		this.cacheContextSignal = listOptions.abortSignal;
		await new Promise(() => {});
		return this.fixedCacheContext;
	}
}

class InventoryContextLlmService extends LlmService {
	identityReads = 0;

	constructor(provider: LlmServiceAdapter, cacheStore: CacheStore) {
		super(
			{ browser: { cache: { identityKey: "inventory@example.com" } } } as ResolvedUserConfig,
			provider,
			{} as never,
			{ cacheStore },
		);
	}

	override async buildListOptions(
		overrides: BrowserProviderListOptions = {},
	): Promise<BrowserProviderListOptions> {
		return { ...overrides };
	}

	async listProjects(): Promise<[]> {
		return [];
	}

	async listConversations(): Promise<[]> {
		return [];
	}

	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("not implemented");
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity() {
		this.identityReads += 1;
		return { email: "detected@example.com", source: "browser-session" };
	}
}

class HangingAuthorizedCacheIdentityLlmService extends InventoryContextLlmService {
	override async getUserIdentity(): Promise<never> {
		this.identityReads += 1;
		await new Promise(() => {});
		throw new Error("unreachable");
	}
}

describe("project-scoped conversation context normalization", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	test("strips a prefixed project instructions block from the first assistant message", () => {
		const context: ConversationContext = {
			provider: "grok",
			conversationId: "conversation-123",
			messages: [
				{ role: "user", text: "Reply exactly with: Context Probe Answer" },
				{
					role: "assistant",
					text: "Context probe instructions\nLine two\nContext Probe Answer",
				},
			],
		};

		expect(
			stripProjectInstructionsPrefixFromConversationContext(
				context,
				"Context probe instructions\nLine two\n",
			),
		).toEqual({
			provider: "grok",
			conversationId: "conversation-123",
			messages: [
				{ role: "user", text: "Reply exactly with: Context Probe Answer" },
				{ role: "assistant", text: "Context Probe Answer" },
			],
		});
	});

	test("does not strip when the assistant message does not start with the project instructions", () => {
		const context: ConversationContext = {
			provider: "grok",
			conversationId: "conversation-123",
			messages: [
				{ role: "assistant", text: "Context Probe Answer\nContext probe instructions\nLine two" },
			],
		};

		expect(
			stripProjectInstructionsPrefixFromConversationContext(
				context,
				"Context probe instructions\nLine two\n",
			),
		).toEqual(context);
	});

	test("getConversationContext writes Gemini-style context into cache on the shared contract", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const context: ConversationContext = {
			provider: "gemini",
			conversationId: "conversation-ctx",
			messages: [
				{
					role: "user",
					text: "Disposable Gemini context probe 2026-04-06: reply exactly ACK CONTEXT PROBE",
				},
				{ role: "assistant", text: "ACK CONTEXT PROBE" },
			],
			files: [
				{
					id: "gemini-conversation-file:conversation-ctx:0:probe.txt",
					name: "probe.txt",
					provider: "gemini",
					source: "conversation",
					mimeType: "text/plain",
				},
			],
			artifacts: [
				{
					id: "gemini-artifact:conversation-ctx:1:0",
					title: "Generated image 1",
					kind: "image",
					uri: "blob:https://gemini.google.com/fake-artifact",
					messageIndex: 1,
				},
				{
					id: "gemini-document:conversation-ctx",
					title: "Deep Research Brief",
					kind: "document",
					uri: "gemini://document/conversation-ctx",
					messageIndex: 1,
					metadata: {
						documentType: "deep-research",
					},
				},
			],
		};
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			readConversationContext: vi.fn(async () => context),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);
		const emittedReceipts: unknown[] = [];

		try {
			const result = await service.getConversationContext("conversation-ctx", {
				listOptions: {},
				onReceipt: (receipt) => {
					emittedReceipts.push(receipt);
				},
			});
			expect(result).toEqual(context);
			expect(provider.readConversationContext).toHaveBeenCalledWith(
				"conversation-ctx",
				undefined,
				expect.objectContaining({
					abortSignal: expect.any(AbortSignal),
					scrapeTelemetry: expect.any(Object),
				}),
			);
			const cached = await store.readConversationContext(cacheContext, "conversation-ctx");
			expect(cached.items).toEqual(context);
			const receipt = await readConversationContextReadReceipt(cacheContext, "conversation-ctx");
			expect(receipt.items).toMatchObject({
				outcome: "succeeded",
				attemptCount: 1,
				lastStage: "complete",
				errorCode: null,
			});
			expect(emittedReceipts).toEqual([receipt.items]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext composes caller abort without retrying", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-abort-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const callerController = new AbortController();
		let markProviderEntered: (() => void) | undefined;
		const providerEntered = new Promise<void>((resolve) => {
			markProviderEntered = resolve;
		});
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			readConversationContext: vi.fn(
				async (
					_conversationId: string,
					_projectId: string | undefined,
					options: BrowserProviderListOptions,
				) => {
					markProviderEntered?.();
					await new Promise<void>((resolve) => {
						options.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
					});
					throw new Error("provider cleanup complete");
				},
			),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);

		try {
			const read = service.getConversationContext("conversation-abort", {
				refresh: true,
				allowCacheFallback: false,
				timeoutMs: 5_000,
				listOptions: { abortSignal: callerController.signal },
			});
			await providerEntered;
			callerController.abort();
			await expect(read).rejects.toMatchObject({
				code: "conversation_context_aborted",
				outcome: "aborted",
			});
			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
			const receipt = await readConversationContextReadReceipt(cacheContext, "conversation-abort");
			expect(receipt.items).toMatchObject({
				outcome: "aborted",
				attemptCount: 1,
				errorCode: "conversation_context_aborted",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext times out a never-settling provider once and preserves a terminal receipt", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-timeout-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		await store.writeConversationContext(cacheContext, "conversation-timeout", {
			provider: "chatgpt",
			conversationId: "conversation-timeout",
			messages: [{ role: "assistant", text: "stale cache must not mask timeout" }],
		});

		let providerSignal: AbortSignal | undefined;
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(
				async (
					_conversationId: string,
					_projectId: string | undefined,
					options: BrowserProviderListOptions,
				) => {
					providerSignal = options.abortSignal;
					const telemetry = options.scrapeTelemetry;
					if (!telemetry) throw new Error("missing scrape telemetry");
					telemetry.cdpCalls["Runtime.evaluate"] = 1;
					telemetry.onUpdate?.();
					await new Promise(() => {});
				},
			),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);
		const emittedReceipts: unknown[] = [];

		try {
			await expect(
				service.getConversationContext("conversation-timeout", {
					refresh: true,
					allowCacheFallback: false,
					timeoutMs: 25,
					listOptions: {},
					onReceipt: (receipt) => {
						emittedReceipts.push(receipt);
					},
				}),
			).rejects.toMatchObject({
				code: "conversation_context_timeout",
				outcome: "timed_out",
			});

			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
			expect(providerSignal?.aborted).toBe(true);
			const receipt = await readConversationContextReadReceipt(
				cacheContext,
				"conversation-timeout",
			);
			expect(receipt.items).toMatchObject({
				object: "conversation_context_read_receipt",
				version: 1,
				provider: "chatgpt",
				accountScopeHash: expect.stringMatching(/^[0-9a-f]{16}$/),
				conversationId: "conversation-timeout",
				outcome: "timed_out",
				timeoutMs: 25,
				attemptCount: 1,
				lastStage: "cdp:Runtime.evaluate",
				errorCode: "conversation_context_timeout",
			});
			expect(receipt.items?.elapsedMs).toBeGreaterThanOrEqual(20);
			expect(JSON.stringify(receipt.items)).not.toContain("messages");
			expect(emittedReceipts).toEqual([receipt.items]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("preserves a safe completed evaluation-failure stage after the CDP method marker", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-eval-stage-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(
				async (
					_conversationId: string,
					_projectId: string | undefined,
					options: BrowserProviderListOptions,
				) => {
					const telemetry = options.scrapeTelemetry;
					if (!telemetry) throw new Error("missing scrape telemetry");
					telemetry.cdpCalls["Runtime.evaluate"] = 1;
					telemetry.onUpdate?.();
					telemetry.providerActions[
						"chatgpt.postPayloadReadiness.failed.execution_context_destroyed.v1"
					] = 1;
					telemetry.onUpdate?.();
					throw new Error("Execution context was destroyed. raw-provider-detail");
				},
			),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);

		try {
			await expect(
				service.getConversationContext("conversation-eval-stage", {
					refresh: true,
					allowCacheFallback: false,
					retryAttempts: 0,
					listOptions: {},
				}),
			).rejects.toThrow("raw-provider-detail");
			const receipt = await readConversationContextReadReceipt(
				cacheContext,
				"conversation-eval-stage",
			);
			expect(receipt.items).toMatchObject({
				outcome: "failed",
				attemptCount: 1,
				lastStage: "provider:chatgpt.postPayloadReadiness.failed.execution_context_destroyed.v1",
				pendingOperation: null,
				errorCode: "Error",
			});
			expect(JSON.stringify(receipt.items)).not.toContain("raw-provider-detail");
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext bounds pre-provider list-option resolution and preserves a terminal receipt", async () => {
		const homeDir = await mkdtemp(
			path.join(os.tmpdir(), "auracall-llm-context-preflight-timeout-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(),
		};
		const service = new HangingListOptionsContextLlmService(provider as never, store, cacheContext);

		try {
			const outcome = await Promise.race([
				service
					.getConversationContext("conversation-preflight-timeout", {
						refresh: true,
						allowCacheFallback: false,
						timeoutMs: 25,
						listOptions: {},
					})
					.then(
						() => ({ kind: "resolved" as const }),
						(error: unknown) => ({ kind: "rejected" as const, error }),
					),
				new Promise<{ kind: "still-pending" }>((resolve) => {
					setTimeout(() => resolve({ kind: "still-pending" }), 100);
				}),
			]);

			expect(outcome).toMatchObject({
				kind: "rejected",
				error: {
					code: "conversation_context_timeout",
					outcome: "timed_out",
				},
			});
			expect(service.listOptionsSignal?.aborted).toBe(true);
			expect(provider.readConversationContext).not.toHaveBeenCalled();
			const receipt = await readConversationContextReadReceipt(
				cacheContext,
				"conversation-preflight-timeout",
			);
			expect(receipt.items).toMatchObject({
				provider: "chatgpt",
				conversationId: "conversation-preflight-timeout",
				outcome: "timed_out",
				timeoutMs: 25,
				attemptCount: 0,
				lastStage: "preflight:browserTargetDiscovery",
				errorCode: "conversation_context_timeout",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext bounds pre-provider cache identity resolution and preserves a terminal receipt", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-identity-timeout-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(),
		};
		const service = new HangingCacheContextLlmService(provider as never, store, cacheContext);

		try {
			await expect(
				service.getConversationContext("conversation-identity-timeout", {
					refresh: true,
					allowCacheFallback: false,
					timeoutMs: 25,
					listOptions: {},
				}),
			).rejects.toMatchObject({
				code: "conversation_context_timeout",
				outcome: "timed_out",
			});
			expect(service.cacheContextSignal?.aborted).toBe(true);
			expect(provider.readConversationContext).not.toHaveBeenCalled();
			const receipt = await readConversationContextReadReceipt(
				cacheContext,
				"conversation-identity-timeout",
			);
			expect(receipt.items).toMatchObject({
				provider: "chatgpt",
				conversationId: "conversation-identity-timeout",
				outcome: "timed_out",
				timeoutMs: 25,
				attemptCount: 0,
				lastStage: "preflight:resolveCacheContext",
				errorCode: "conversation_context_timeout",
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext does not repeat live cache identity detection for an authorized provider session", async () => {
		const homeDir = await mkdtemp(
			path.join(os.tmpdir(), "auracall-llm-context-authorized-cache-identity-"),
		);
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = new JsonCacheStore();
		const context: ConversationContext = {
			provider: "chatgpt",
			conversationId: "conversation-authorized-cache-identity",
			messages: [{ role: "assistant", text: "bounded context" }],
		};
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			getFeatureSignature: vi.fn(async () => {
				await new Promise(() => {});
				throw new Error("unreachable");
			}),
			readConversationContext: vi.fn(async () => context),
		};
		const service = new HangingAuthorizedCacheIdentityLlmService(provider as never, store);
		const providerSessionAuthorization = {
			authority: {},
			context: { providerId: "chatgpt" },
			expectation: {
				providerId: "chatgpt",
				configuredIdentity: { email: "inventory@example.com" },
				configuredServiceAccountId: "service-account:chatgpt:inventory@example.com",
				source: "runtime-profile",
			},
		} as never;

		try {
			await expect(
				service.getConversationContext("conversation-authorized-cache-identity", {
					refresh: true,
					allowCacheFallback: false,
					timeoutMs: 25,
					listOptions: { providerSessionAuthorization },
				}),
			).resolves.toEqual(context);

			expect(service.identityReads).toBe(0);
			expect(provider.getFeatureSignature).not.toHaveBeenCalled();
			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext can require a live refresh instead of cached fallback", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-no-fallback-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const cacheContext: ProviderCacheContext = {
			provider: "gemini",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		await store.writeConversationContext(cacheContext, "conversation-ctx", {
			provider: "gemini",
			conversationId: "conversation-ctx",
			messages: [{ role: "assistant", text: "stale cached context" }],
		});

		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			readConversationContext: vi.fn(async () => {
				throw new Error("live Gemini context failed");
			}),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);

		try {
			await expect(
				service.getConversationContext("conversation-ctx", {
					refresh: true,
					allowCacheFallback: false,
					listOptions: {},
				}),
			).rejects.toThrow("live Gemini context failed");

			await expect(
				service.getConversationContext("conversation-ctx", {
					refresh: true,
					listOptions: {},
				}),
			).resolves.toMatchObject({
				messages: [{ role: "assistant", text: "stale cached context" }],
			});
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("account-mirror context reads reuse verified identity instead of opening cache identity probes", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-inventory-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			getFeatureSignature: vi.fn(async () => "feature-signature"),
			readConversationContext: vi.fn(async () => ({
				provider: "chatgpt" as const,
				conversationId: "conversation-inventory",
				messages: [{ role: "assistant" as const, text: "inventory context" }],
			})),
		};
		const service = new InventoryContextLlmService(provider as never, store);

		try {
			await service.getConversationContext("conversation-inventory", {
				refresh: true,
				listOptions: {
					accountMirrorInventory: true,
					skipFeatureSignature: true,
				},
			});

			expect(service.identityReads).toBe(0);
			expect(provider.getFeatureSignature).not.toHaveBeenCalled();
			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("account-mirror context reads do not retry a distinguished rate-limit hard stop", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-hard-stop-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = new JsonCacheStore();
		const hardStop = Object.assign(new Error("Too many requests."), {
			blockingSurface: {
				kind: "rate-limit" as const,
				summary: "ChatGPT rate limit warning",
			},
		});
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => {
				throw hardStop;
			}),
		};
		const service = new InventoryContextLlmService(provider as never, store);
		const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
			callback();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});

		try {
			await expect(
				service.getConversationContext("conversation-hard-stop", {
					refresh: true,
					allowCacheFallback: false,
					listOptions: {
						accountMirrorInventory: true,
						skipFeatureSignature: true,
					},
				}),
			).rejects.toThrow("ChatGPT rate limit detected");

			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
		} finally {
			timeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("account-mirror context reads still retry an ordinary transient failure", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-transient-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi
				.fn()
				.mockRejectedValueOnce(new Error("WebSocket connection closed"))
				.mockResolvedValueOnce({
					provider: "chatgpt" as const,
					conversationId: "conversation-transient",
					messages: [{ role: "assistant" as const, text: "recovered context" }],
				}),
		};
		const service = new InventoryContextLlmService(provider as never, store);
		const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
			callback();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});

		try {
			await expect(
				service.getConversationContext("conversation-transient", {
					refresh: true,
					allowCacheFallback: false,
					listOptions: {
						accountMirrorInventory: true,
						skipFeatureSignature: true,
					},
				}),
			).resolves.toMatchObject({
				conversationId: "conversation-transient",
				messages: [{ text: "recovered context" }],
			});

			expect(provider.readConversationContext).toHaveBeenCalledTimes(2);
		} finally {
			timeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext honors an explicit zero-retry ceiling", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-llm-context-no-retry-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const store = new JsonCacheStore();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(async () => {
				throw new Error("WebSocket connection closed");
			}),
		};
		const service = new InventoryContextLlmService(provider as never, store);

		try {
			await expect(
				service.getConversationContext("conversation-no-retry", {
					refresh: true,
					allowCacheFallback: false,
					retryAttempts: 0,
					listOptions: {
						accountMirrorInventory: true,
						skipFeatureSignature: true,
					},
				}),
			).rejects.toThrow();

			expect(provider.readConversationContext).toHaveBeenCalledTimes(1);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("getConversationContext preserves the pending ChatGPT payload operation separately from the last completed stage", async () => {
		vi.useFakeTimers();
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-context-pending-payload-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const conversationId = "same-route-pending-payload";
		const url = `https://chatgpt.com/c/${conversationId}`;
		const cacheContext: ProviderCacheContext = {
			provider: "chatgpt",
			userConfig: {} as ProviderCacheContext["userConfig"],
			listOptions: {},
			identityKey: "cache-test@example.com",
		};
		const store = new JsonCacheStore();
		let resolvePayloadStarted: (() => void) | undefined;
		const payloadStarted = new Promise<void>((resolve) => {
			resolvePayloadStarted = resolve;
		});
		const evaluate = vi.fn(() => {
			const call = evaluate.mock.calls.length;
			if (call <= 2) return Promise.resolve({ result: { value: [] } });
			if (call === 3) return Promise.resolve({ result: { value: url } });
			if (call <= 6) return Promise.resolve({ result: { value: true } });
			if (call === 7) {
				resolvePayloadStarted?.();
				return new Promise<never>(() => undefined);
			}
			return Promise.resolve({ result: { value: [] } });
		});
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
			Page: { navigate: vi.fn() },
			// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
			Runtime: { evaluate },
		};
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: vi.fn(
				async (id: string, _projectId: string | undefined, options: BrowserProviderListOptions) =>
					readChatgptConversationContextWithClientForTest(
						client as never,
						id,
						null,
						undefined,
						options,
					),
			),
		};
		const service = new TestContextLlmService(provider as never, store, cacheContext);

		try {
			const read = service.getConversationContext(conversationId, {
				refresh: true,
				allowCacheFallback: false,
				timeoutMs: 25,
				listOptions: { allowNavigation: true },
			});
			await payloadStarted;
			expect(evaluate).toHaveBeenCalledTimes(7);
			await vi.advanceTimersByTimeAsync(25);
			await expect(read).rejects.toMatchObject({
				code: "conversation_context_timeout",
				outcome: "timed_out",
			});
			const receipt = await readConversationContextReadReceipt(cacheContext, conversationId);
			expect(receipt.items).toMatchObject({
				outcome: "timed_out",
				attemptCount: 1,
				lastStage: "provider:chatgpt.skipSameRouteNavigation",
				pendingOperation: "provider:chatgpt.readConversationPayload",
			});
		} finally {
			await vi.advanceTimersByTimeAsync(10_001);
			vi.useRealTimers();
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});

test.each([
	"failed",
	"stalled",
	"clean",
	"deadline",
])("request-aware abort drains cleanup before considering cached context: %s", async (mode) => {
	const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-context-abort-drain-"));
	setAuracallHomeDirOverrideForTest(homeDir);
	const cacheContext: ProviderCacheContext = {
		provider: "chatgpt",
		userConfig: {} as ProviderCacheContext["userConfig"],
		listOptions: {},
		identityKey: "fixture@example.test",
	};
	const store = new JsonCacheStore();
	const cached: ConversationContext = {
		provider: "chatgpt",
		conversationId: "fixture-abort",
		messages: [{ role: "assistant", text: "cached fixture answer" }],
	};
	await store.writeConversationContext(cacheContext, "fixture-abort", cached);
	const controller = new AbortController();
	const read = vi.fn(
		async (_id: string, _project: unknown, options: BrowserProviderListOptions) => {
			if (mode === "deadline") {
				await new Promise<void>((resolve) =>
					options.abortSignal?.addEventListener("abort", () => resolve(), { once: true }),
				);
				throw new OwnedBackendRequestCleanupError(new Error("fixture deadline cleanup unknown"));
			}
			controller.abort();
			if (mode === "stalled") return new Promise<never>(() => {});
			if (mode === "failed")
				throw new OwnedBackendRequestCleanupError(new Error("fixture cleanup unknown"));
			throw controller.signal.reason;
		},
	);
	const service = new TestContextLlmService(
		{
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} },
			readConversationContext: read,
		} as never,
		store,
		cacheContext,
	);
	try {
		const reading = service.getConversationContext("fixture-abort", {
			refresh: true,
			retryAttempts: 0,
			timeoutMs: mode === "deadline" ? 25 : 10000,
			listOptions: {
				abortSignal: controller.signal,
				providerTrafficGovernor: {
					admitBackendRequest: async (_key: string, effect: () => Promise<void>) => effect(),
				} as never,
			},
		});
		if (mode === "clean")
			await expect(reading).resolves.toMatchObject({ messages: cached.messages });
		else {
			const error = await reading.catch((failure: unknown) => failure);
			expect(error).toMatchObject(
				mode === "deadline"
					? { code: "conversation_context_timeout", outcome: "timed_out" }
					: { code: "conversation_context_aborted", outcome: "aborted" },
			);
			expect(hasUnknownOwnedRequestCleanup(error)).toBe(true);
			expect(await store.readConversationContext(cacheContext, "fixture-abort")).toMatchObject({
				items: { messages: cached.messages },
			});
		}
		expect(read).toHaveBeenCalledTimes(1);
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
}, 10000);
