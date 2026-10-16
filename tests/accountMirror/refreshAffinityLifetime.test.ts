import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import * as chrome from "../../packages/browser-service/src/chromeLifecycle.js";
import { isTabLeaseTtlExempt } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { createAccountMirrorRefreshService } from "../../src/accountMirror/refreshService.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { retireExpiredChatgptTabLeases } from "../../src/browser/chatgptTabRetirement.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import type { ResolvedUserConfig } from "../../src/config.js";

test.each([
	{ liveFollowOperationId: undefined, scoped: false },
	{ liveFollowOperationId: "completion-1", scoped: false },
	{ liveFollowOperationId: "completion-scoped", scoped: true },
])("refresh tab lifetime follows its caller (%s)", async ({ liveFollowOperationId, scoped }) => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-refresh-lifetime-"));
	setAuracallHomeDirOverrideForTest(home);
	const now = new Date("2026-10-13T12:00:00Z");
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
		Runtime: { evaluate: async () => ({ result: { value: null } }) },
		close: async () => undefined,
	} as never);
	try {
		const service = createAccountMirrorRefreshService({
			config,
			now: () => now,
			registry: createAccountMirrorStatusRegistry({ config, now: () => now }),
			providerGuardCensus: async () => null,
			metadataCollector: {
				collect: async (input) => {
					if (scoped) {
						expect(pages.get("fixture-target")).toBe("about:blank");
						expect(input.tabAffinity).toMatchObject({
							configuredUrl: "https://chatgpt.com/c/conversation-scoped",
							allowInitialNavigation: true,
						});
					}
					return {
						detectedIdentityKey: "operator@example.test",
						detectedAccountLevel: "Pro",
						metadataCounts: { projects: 0, conversations: 0, artifacts: 0, files: 0, media: 0 },
						manifests: { projects: [], conversations: [], artifacts: [], files: [], media: [] },
						evidence: {
							identitySource: "profile-menu",
							projectSampleIds: [],
							conversationSampleIds: [],
							truncated: { projects: false, conversations: false, artifacts: false },
						},
					};
				},
			},
		});
		await expect(
			service.requestRefresh({
				provider: "chatgpt",
				runtimeProfileId: "fixture",
				explicitRefresh: true,
				liveFollowOperationId,
				...(scoped
					? {
							requestedPhase: "detail-inventory" as const,
							conversationIds: ["conversation-scoped"],
						}
					: {}),
			}),
		).resolves.toMatchObject({ status: "completed" });
		const runtime = createBrowserTabConcurrencyRuntime(config);
		const registry = runtime.registry;
		if (!registry) throw new Error("Fixture registry unavailable");
		const leases = await registry.list();
		expect(leases).toHaveLength(1);
		const lease = leases[0];
		if (!lease) throw new Error("Fixture lease unavailable");
		expect(lease.state).toBe("idle");
		expect(lease.retention).toBe(liveFollowOperationId ? "live-follow" : "ttl");
		expect(isTabLeaseTtlExempt(lease)).toBe(Boolean(liveFollowOperationId));
		if (liveFollowOperationId && !scoped) {
			now.setTime(now.getTime() + 30 * 60_000);
			await expect(
				service.requestRefresh({
					provider: "chatgpt",
					runtimeProfileId: "fixture",
					explicitRefresh: true,
				}),
			).resolves.toMatchObject({ status: "completed" });
			const borrowed = (await registry.list())[0];
			expect(borrowed).toMatchObject({
				leaseId: lease.leaseId,
				retention: "live-follow",
				workload: { kind: "ephemeral" },
			});
			expect(chrome.openChromeTarget).toHaveBeenCalledOnce();
		}
		const closeTarget = vi.fn(async (_endpoint, targetId: string) => {
			pages.delete(targetId);
		});
		const retirement = await retireExpiredChatgptTabLeases({
			registry,
			audit: runtime.retirementAudit,
			scope: lease.scope,
			endpoint: { host: "127.0.0.1", port: 45011 },
			now: () => new Date(now.getTime() + 16 * 60_000),
			inspectTarget: async (_endpoint, targetId) =>
				typeof pages.get(targetId) === "string" ? { url: String(pages.get(targetId)) } : null,
			probeActivity: async () => "inactive",
			closeTarget,
		});
		if (liveFollowOperationId) {
			expect(retirement).toEqual([]);
			expect(closeTarget).not.toHaveBeenCalled();
		} else {
			expect(retirement).toEqual([
				expect.objectContaining({ disposition: "closed", reason: "idle-expired" }),
			]);
			expect(closeTarget).toHaveBeenCalledOnce();
		}
	} finally {
		vi.restoreAllMocks();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true });
	}
});
