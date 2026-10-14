import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import * as chrome from "../../packages/browser-service/src/chromeLifecycle.js";
import { createConfiguredLiveFollowAffinity } from "../../src/accountMirror/configuredLiveFollowAffinity.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import type { ResolvedUserConfig } from "../../src/config.js";

const realSetTimeout = setTimeout;
test("owned native warning interrupts the next admission before its cooldown wait", async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-warning-admission-"));
	setAuracallHomeDirOverrideForTest(home);
	const now = new Date("2026-10-14T12:00:00Z");
	let rateLimited = false;
	const managedBrowserProfile = path.join(home, "managed");
	const pages = new Map<string, string>();
	const config = {
		auracallProfile: "fixture",
		model: "gpt-5.2",
		browser: {
			tabConcurrencyMode: "tab-affinity",
			chatgptUrl: "https://chatgpt.com/",
			cache: { rootDir: path.join(home, "cache"), store: "json" },
		},
		runtimeProfiles: {
			fixture: {
				browserProfile: "fixture",
				defaultService: "chatgpt",
				services: {
					chatgpt: {
						identity: { email: "operator@example.test", accountLevel: "Pro" },
						liveFollow: { enabled: true, mode: "metadata-first", priority: "background" },
					},
				},
			},
		},
	} as unknown as ResolvedUserConfig;
	vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
		resolveServiceTarget: async () => ({
			host: "127.0.0.1",
			port: 45011,
			managedBrowserProfile,
			browserProcessId: process.pid,
		}),
		getMutationAuditSink: () => async () => undefined,
	} as never);
	vi.spyOn(chrome, "listChromeTargets").mockImplementation(
		async () => [...pages].map(([id, url]) => ({ id, url, type: "page" })) as never,
	);
	vi.spyOn(chrome, "openChromeTarget").mockImplementation(async (_port, url) => {
		pages.set("fixture-target", url);
		return { id: "fixture-target", url } as never;
	});
	vi.spyOn(chrome, "connectToChromeTarget").mockResolvedValue({
		// biome-ignore lint/style/useNamingConvention: CDP wire name.
		Runtime: {
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value: runInNewContext(expression, {
						document: { querySelectorAll: () => [] },
						location: { origin: "https://chatgpt.com", href: "https://chatgpt.com/" },
						// biome-ignore lint/style/useNamingConvention: Browser platform constructor.
						URL,
						performance: {
							getEntriesByType: () =>
								rateLimited
									? [
											{
												name: "https://chatgpt.com/backend-api/conversations",
												responseStatus: 429,
												responseEnd: 100,
											},
										]
									: [],
						},
					}),
				},
			}),
		},
		close: async () => undefined,
	} as never);
	let affinity: Awaited<ReturnType<typeof createConfiguredLiveFollowAffinity>>;
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	vi.setSystemTime(now);
	const controller = new AbortController();
	try {
		affinity = await createConfiguredLiveFollowAffinity({
			userConfig: config,
			provider: "chatgpt",
			runtimeProfileId: "fixture",
			operationId: "fixture-op",
			workloadKind: "ephemeral",
			maxBrowserInteractionsPerMinute: 6,
			conversationReadCooldownMs: 120000,
			abortSignal: controller.signal,
			now: () => now,
		});
		if (!affinity) throw new Error("Fixture affinity missing");
		let firstDone = false;
		const first = affinity.interactionGovernor
			.beforeInteraction("conversation-read", controller.signal)
			.finally(() => {
				firstDone = true;
			});
		for (let i = 0; i < 20 && !firstDone; i++) {
			await vi.advanceTimersByTimeAsync(1000);
			await new Promise<void>((r) => realSetTimeout(r, 10));
		}
		expect(firstDone).toBe(true);
		await first;
		rateLimited = true;
		let outcome: string | null = null;
		const pending = affinity.interactionGovernor
			.beforeInteraction("conversation-read", controller.signal)
			.then(
				() => {
					outcome = "unexpected admission";
				},
				(e) => {
					outcome = e.message;
				},
			);
		for (let i = 0; i < 10 && outcome === null; i++) {
			await vi.advanceTimersByTimeAsync(100);
			await new Promise<void>((r) => realSetTimeout(r, 10));
		}
		expect(outcome).toEqual(expect.stringMatching(/HTTP 429/));
		const runtime = createBrowserTabConcurrencyRuntime(config);
		expect(await runtime.ledger?.listActiveProviderWarnings({ now: now.toISOString() })).toEqual([
			expect.objectContaining({ classification: "rate-limit" }),
		]);
		await pending;
	} finally {
		controller.abort(new Error("fixture finished"));
		await vi.advanceTimersByTimeAsync(200000);
		vi.useRealTimers();
		vi.restoreAllMocks();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true, maxRetries: 2 });
	}
}, 15000);
