import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getAuracallHomeDir, setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	resolveChatgptRateLimitGuardPath,
	writeChatgptRateLimitGuardState,
} from "../../src/browser/chatgptRateLimitGuard.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import type {
	IdentityPrompt,
	LlmServiceAdapter,
	PromptInput,
	PromptResult,
} from "../../src/browser/llmService/types.js";
import type {
	BrowserProviderListOptions,
	ProviderUserIdentity,
} from "../../src/browser/providers/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";

class RateLimitTestLlmService extends LlmService {
	constructor(
		userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		options?: { identityPrompt?: IdentityPrompt },
	) {
		super(userConfig, provider, {} as never, options);
	}

	protected override getProviderGuardSettings() {
		return {
			cooldownMs: 120,
			autoWaitMaxMs: 10,
			mutationWindowMs: 120,
			mutationMaxWeight: 2,
			mutationBudgetAutoWaitMaxMs: 120,
			postCommitAutoWaitMaxMs: 120,
			postCommitQuietScale: 0.003,
			postCommitJitterMaxMs: 0,
			simplePostCommitQuietMs: 40,
			simpleMutationMinIntervalMs: 80,
		};
	}

	getGuardStatePath(providerId: "chatgpt" | "gemini" | "grok" = "chatgpt"): string | null {
		if (providerId === "chatgpt") {
			return resolveChatgptRateLimitGuardPath({ profileName: "default" });
		}
		return path.join(
			homeDirForTests(),
			"cache",
			"providers",
			providerId,
			"__runtime__",
			"rate-limit-default.json",
		);
	}

	async runGuarded<T>(action: string, fn: () => Promise<T>): Promise<T> {
		return this.withRetry(fn, { action, retries: 0 });
	}

	async runGuardedWithRetries<T>(
		action: string,
		fn: () => Promise<T>,
		retries: number,
	): Promise<T> {
		return this.withRetry(fn, { action, retries });
	}

	async runGuardedWithRetryHook<T>(
		action: string,
		fn: () => Promise<T>,
		retries: number,
		beforeRetry: (error: unknown, attempt: number) => Promise<void> | void,
	): Promise<T> {
		return this.withRetry(fn, { action, retries, beforeRetry });
	}

	async runGuardedSkippingPostCommitQuiet<T>(action: string, fn: () => Promise<T>): Promise<T> {
		return this.withRetry(fn, { action, retries: 0, skipPostCommitQuiet: true });
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

	async getUserIdentity(
		_options?: BrowserProviderListOptions,
	): Promise<ProviderUserIdentity | null> {
		return null;
	}
}

function homeDirForTests(): string {
	return getAuracallHomeDir();
}

function createGuardClock() {
	const epoch = 1_700_000_000_000;
	let now = epoch;
	const date = vi.spyOn(Date, "now").mockImplementation(() => now);
	const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: TimerHandler,
		ms?: number,
	) => {
		now += typeof ms === "number" ? ms : 0;
		if (typeof callback === "function") callback();
		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);
	return {
		epoch,
		setElapsed(ms: number) {
			now = epoch + ms;
		},
		restore() {
			timer.mockRestore();
			date.mockRestore();
		},
	};
}

describe("llmService ChatGPT rate-limit guard", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	test("persists cooldown after a ChatGPT rate-limit error and blocks later live calls", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				service.runGuarded("renameConversation", async () => {
					throw new Error("Too many requests. You’re making requests too quickly.");
				}),
			).rejects.toThrow(/cooling down until/i);

			const guardStatePath = service.getGuardStatePath();
			expect(guardStatePath).toBeTruthy();
			const persisted = JSON.parse(await readFile(guardStatePath as string, "utf8")) as {
				cooldownUntil?: number;
				cooldownAction?: string;
			};
			expect(typeof persisted.cooldownUntil).toBe("number");
			expect(persisted.cooldownAction).toBe("renameConversation");

			const nextProcess = new RateLimitTestLlmService(userConfig, provider);
			await expect(nextProcess.runGuarded("listConversations", async () => [])).rejects.toThrow(
				/cooldown active until/i,
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("extends cooldown when ChatGPT rate-limit warnings repeat for the same profile", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);
		const now = Date.now();

		try {
			await writeChatgptRateLimitGuardState(
				{
					provider: "chatgpt",
					profile: "default",
					updatedAt: now - 60,
					cooldownDetectedAt: now - 60,
					cooldownUntil: now - 1,
					cooldownReason: "Too many requests.",
					cooldownAction: "readConversationContext",
				},
				{ profileName: "default" },
			);

			await expect(
				service.runGuarded("readConversationContext", async () => {
					throw new Error("Too many requests. You’re making requests too quickly.");
				}),
			).rejects.toThrow(/cooling down until/i);

			const persisted = JSON.parse(
				await readFile(service.getGuardStatePath() as string, "utf8"),
			) as {
				cooldownUntil?: number;
			};
			expect(typeof persisted.cooldownUntil).toBe("number");
			expect((persisted.cooldownUntil ?? 0) - Date.now()).toBeGreaterThan(10 * 60_000);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("retains ChatGPT rate-limit detection history after a later successful read", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const service = new RateLimitTestLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider,
		);
		const detectedAt = Date.now() - 60_000;

		try {
			await writeChatgptRateLimitGuardState(
				{
					provider: "chatgpt",
					profile: "default",
					updatedAt: detectedAt,
					recentRateLimitDetectionAts: [detectedAt],
					cooldownDetectedAt: detectedAt,
					cooldownUntil: Date.now() - 1,
				},
				{ profileName: "default" },
			);

			await expect(service.runGuarded("listConversations", async () => [])).resolves.toEqual([]);
			const persisted = JSON.parse(
				await readFile(service.getGuardStatePath() as string, "utf8"),
			) as { recentRateLimitDetectionAts?: number[] };
			expect(persisted.recentRateLimitDetectionAts).toEqual([detectedAt]);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("uses clustered adaptive delays for ChatGPT rate-limit responses", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);
		const errorMessage = "Too many requests. You’re making requests too quickly.";
		const delays: number[] = [];
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			ms?: number,
		) => {
			delays.push(typeof ms === "number" ? ms : 0);
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout);

		let attempts = 0;
		try {
			await expect(
				service.runGuardedWithRetries(
					"renameConversation",
					async () => {
						attempts += 1;
						if (attempts < 3) {
							throw new Error(errorMessage);
						}
						return undefined;
					},
					2,
				),
			).resolves.toBeUndefined();

			expect(attempts).toBe(3);
			expect(delays).toHaveLength(2);
			expect(delays[0]).toBeGreaterThanOrEqual(2_000);
			expect(delays[0]).toBeLessThanOrEqual(3_500);
			expect(delays[1]).toBeGreaterThanOrEqual(5_000);
			expect(delays[1]).toBeLessThanOrEqual(6_500);
			expect(delays[1]).toBeGreaterThan(delays[0]);
		} finally {
			setTimeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("uses bounded delays for generic ChatGPT retryable failures", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);
		const errorMessage = "WebSocket connection closed";
		const delays: number[] = [];
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			ms?: number,
		) => {
			delays.push(typeof ms === "number" ? ms : 0);
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout);

		try {
			await expect(
				service.runGuardedWithRetries(
					"renameConversation",
					async () => {
						throw new Error(errorMessage);
					},
					1,
				),
			).rejects.toThrow(errorMessage);

			expect(delays).toHaveLength(1);
			expect(delays[0]).toBeGreaterThanOrEqual(500);
			expect(delays[0]).toBeLessThanOrEqual(750);
		} finally {
			setTimeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("does not retry a ChatGPT rate limit after provider effect was observed", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-effect-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const service = new RateLimitTestLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider,
		);
		let attempts = 0;
		const error = new BrowserAutomationError(
			"ChatGPT rate limit detected after provider effect",
			{ effectState: "effect_observed", retrySafe: false },
		);

		try {
			await expect(
				service.runGuardedWithRetries(
					"readConversationContext",
					async () => {
						attempts += 1;
						throw error;
					},
					2,
				),
			).rejects.toBe(error);
			expect(attempts).toBe(1);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("treats closed Gemini CDP WebSocket failures as retryable and runs retry hook", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-gemini-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);
		const errorMessage = "WebSocket is not open: readyState 3 (CLOSED)";
		const retryHooks: Array<{ message: string; attempt: number }> = [];
		const delays: number[] = [];
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			ms?: number,
		) => {
			delays.push(typeof ms === "number" ? ms : 0);
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout);

		let attempts = 0;
		try {
			await expect(
				service.runGuardedWithRetryHook(
					"materializeConversationArtifact",
					async () => {
						attempts += 1;
						if (attempts === 1) {
							throw new Error(errorMessage);
						}
						return { ok: true };
					},
					1,
					(error, attempt) => {
						retryHooks.push({
							message: error instanceof Error ? error.message : String(error),
							attempt,
						});
					},
				),
			).resolves.toEqual({ ok: true });

			expect(attempts).toBe(2);
			expect(retryHooks).toEqual([{ message: errorMessage, attempt: 0 }]);
			expect(delays).toEqual([500]);
		} finally {
			setTimeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("treats transient ChatGPT conversation read misses as retryable failures", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);
		const delays: number[] = [];
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			ms?: number,
		) => {
			delays.push(typeof ms === "number" ? ms : 0);
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as unknown as typeof setTimeout);

		let attempts = 0;
		try {
			await expect(
				service.runGuardedWithRetries(
					"readConversationContext",
					async () => {
						attempts += 1;
						if (attempts < 2) {
							throw new Error(
								"ChatGPT conversation 69d04b50-3c88-8325-8240-0d838d47ee50 messages not found",
							);
						}
						return { ok: true };
					},
					1,
				),
			).resolves.toEqual({ ok: true });

			expect(attempts).toBe(2);
			expect(delays).toHaveLength(1);
			expect(delays[0]).toBeGreaterThanOrEqual(500);
			expect(delays[0]).toBeLessThanOrEqual(750);
		} finally {
			setTimeoutSpy.mockRestore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("spaces ChatGPT mutating operations across separate service instances", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const first = new RateLimitTestLlmService(userConfig, provider);
		const second = new RateLimitTestLlmService(userConfig, provider);

		const clock = createGuardClock();
		try {
			await expect(
				first.runGuarded("renameConversation", async () => undefined),
			).resolves.toBeUndefined();
			clock.setElapsed(20);
			const executedAt = vi.fn(() => Date.now());
			await expect(
				second.runGuarded("updateProjectInstructions", async () => {
					executedAt();
				}),
			).resolves.toBeUndefined();
			// The 36ms quiet period includes 20ms already consumed by caller/storage work.
			expect(executedAt).toHaveBeenCalledTimes(1);
			expect(executedAt.mock.results[0]?.value).toBe(clock.epoch + 36);
		} finally {
			clock.restore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("can skip ChatGPT post-write quiet for scoped non-mutating materialization reads", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const first = new RateLimitTestLlmService(userConfig, provider);
		const second = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				first.runGuarded("renameConversation", async () => undefined),
			).resolves.toBeUndefined();
			const startedAt = Date.now();
			await expect(
				second.runGuardedSkippingPostCommitQuiet(
					"materializeConversationArtifact",
					async () => "ok",
				),
			).resolves.toBe("ok");
			expect(Date.now() - startedAt).toBeLessThan(30);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("does not skip active ChatGPT cooldowns when post-write quiet is bypassed", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);

		try {
			await writeChatgptRateLimitGuardState(
				{
					provider: "chatgpt",
					profile: "default",
					updatedAt: Date.now(),
					cooldownDetectedAt: Date.now(),
					cooldownUntil: Date.now() + 60_000,
					cooldownReason: "Too many requests.",
					cooldownAction: "readConversationContext",
				},
				{ profileName: "default" },
			);

			await expect(
				service.runGuardedSkippingPostCommitQuiet(
					"materializeConversationArtifact",
					async () => "ok",
				),
			).rejects.toThrow(/cooldown active until/i);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("enforces a rolling write budget across separate service instances", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const first = new RateLimitTestLlmService(userConfig, provider);
		const second = new RateLimitTestLlmService(userConfig, provider);
		const third = new RateLimitTestLlmService(userConfig, provider);
		const fourth = new RateLimitTestLlmService(userConfig, provider);

		const clock = createGuardClock();
		try {
			await expect(
				first.runGuarded("renameConversation", async () => undefined),
			).resolves.toBeUndefined();
			await expect(
				second.runGuarded("updateProjectInstructions", async () => undefined),
			).resolves.toBeUndefined();
			await third.runGuarded("deleteConversation", async () => undefined);
			// The first record expired; the second and third still exceed weight2.
			// Only 25ms remain until the second record leaves its 120ms window.
			clock.setElapsed(131);
			const executedAt = vi.fn(() => Date.now());
			await expect(
				fourth.runGuarded("renameConversation", async () => {
					executedAt();
				}),
			).resolves.toBeUndefined();
			expect(executedAt).toHaveBeenCalledTimes(1);
			expect(executedAt.mock.results[0]?.value).toBe(clock.epoch + 156);
		} finally {
			clock.restore();
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("persists Gemini anti-bot cooldown after a blocking error and blocks later live calls", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-gemini-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				service.runGuarded("deleteConversation", async () => {
					throw new Error(
						"Google blocked Gemini with an unusual-traffic interstitial (google.com/sorry).",
					);
				}),
			).rejects.toThrow(/Gemini anti-bot block detected/i);

			const guardStatePath = service.getGuardStatePath("gemini");
			const persisted = JSON.parse(await readFile(guardStatePath as string, "utf8")) as {
				cooldownUntil?: number;
				cooldownAction?: string;
			};
			expect(typeof persisted.cooldownUntil).toBe("number");
			expect(persisted.cooldownAction).toBe("deleteConversation");

			const nextProcess = new RateLimitTestLlmService(userConfig, provider);
			await expect(nextProcess.runGuarded("listConversations", async () => [])).rejects.toThrow(
				/Gemini anti-bot cooldown active until/i,
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("spaces Gemini mutating operations across separate service instances", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-gemini-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const first = new RateLimitTestLlmService(userConfig, provider);
		const second = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				first.runGuarded("deleteConversation", async () => undefined),
			).resolves.toBeUndefined();
			const startedAt = Date.now();
			await expect(
				second.runGuarded("renameProject", async () => undefined),
			).resolves.toBeUndefined();
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(70);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("persists Grok cooldown after a rate-limit error and blocks later live calls", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-grok-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const service = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				service.runGuarded("deleteConversation", async () => {
					throw new Error("Query limit reached for Auto. Try again in 4 minutes.");
				}),
			).rejects.toThrow(/Query limit reached for Auto|Try again in 4 minutes/i);

			const guardStatePath = service.getGuardStatePath("grok");
			const persisted = JSON.parse(await readFile(guardStatePath as string, "utf8")) as {
				cooldownUntil?: number;
				cooldownAction?: string;
			};
			expect(typeof persisted.cooldownUntil).toBe("number");
			expect(persisted.cooldownAction).toBe("deleteConversation");

			const nextProcess = new RateLimitTestLlmService(userConfig, provider);
			await expect(nextProcess.runGuarded("listConversations", async () => [])).rejects.toThrow(
				/Grok rate limit cooldown active until/i,
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("spaces Grok mutating operations across separate service instances", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-grok-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
		} satisfies LlmServiceAdapter;
		const userConfig = { browser: { cache: {} } } as ResolvedUserConfig;
		const first = new RateLimitTestLlmService(userConfig, provider);
		const second = new RateLimitTestLlmService(userConfig, provider);

		try {
			await expect(
				first.runGuarded("deleteConversation", async () => undefined),
			).resolves.toBeUndefined();
			const startedAt = Date.now();
			await expect(
				second.runGuarded("renameProject", async () => undefined),
			).resolves.toBeUndefined();
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(70);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});
