import { expect, test, vi } from "vitest";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runConfiguredChatgptTabMaintenance } from "../../src/browser/configuredChatgptTabMaintenance.js";

test.each([
	["active", "idle"],
	["unknown", "idle"],
	["active", "lost"],
	["unknown", "lost"],
	["inactive", "idle"],
] as const)("handles an expired %s response in a %s lease", async (activity, state) => {
	const registry = createInMemoryBrowserTabLeaseRegistry();
	let now = "2026-10-10T00:00:00Z";
	let live = true;
	const closeTarget = vi.fn(async () => {
		live = false;
	});
	const run = () =>
		runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					fixture: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "fixture" } } },
					},
				},
			} as never,
			now: () => new Date(now),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: async () => ({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/fixture/chatgpt",
					}),
				}),
				listTargets: async () =>
					(live
						? [{ id: "active-chat", url: "https://chatgpt.com/c/fixture", type: "page" }]
						: []) as never,
				closeTarget,
				probeActivity: async () => activity,
			} as never,
		});
	await run();
	if (state === "lost") {
		const lease = (await registry.list())[0];
		await registry.markLost({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now,
			reason: "restart-unverified",
		});
	}
	now = "2026-10-10T00:05:01Z";
	await run();
	expect(closeTarget).toHaveBeenCalledTimes(activity === "inactive" ? 1 : 0);
	expect((await registry.list())[0].actionCounts.closes).toBe(activity === "inactive" ? 1 : 0);
});
