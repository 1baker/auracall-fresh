import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import type { launchChrome } from "../../src/browser/chromeLifecycle.js";
import { resolveBrowserLaunchPlan } from "../../src/browser/service/browserLaunchPlan.js";
import {
	applyDesktopProfileAssignments,
	rememberDesktopProfileAssignment,
} from "../../src/browser/service/desktopProfileAssignments.js";
import {
	listDesktopRuntimeProfiles,
	wakeDesktopRuntimeProfile,
} from "../../src/browser/service/desktopRuntimeProfiles.js";
import type { NativeDesktopBrowser } from "../../src/browser/service/nativeDesktopStore.js";
import { ComposedConfigSchema } from "../../src/config/schema.js";
import { loadUserConfig } from "../../src/config.js";

const browserPage = vi.hoisted(() => ({ url: "about:blank", navigate: vi.fn() }));
vi.mock("../../src/browser/cdp.js", () => ({
	default: async () => ({
		Target: {
			getTargets: async () => ({
				targetInfos: [{ type: "page", targetId: "provider-page", url: browserPage.url }],
			}),
		},
		Page: {
			navigate: async ({ url }: { url: string }) => {
				browserPage.navigate(url);
				browserPage.url = url;
				return {};
			},
		},
		close: async () => {},
	}),
}));
let home: string;
beforeEach(async () => {
	browserPage.url = "about:blank";
	browserPage.navigate.mockClear();
	home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-runtime-rail-"));
	setAuracallHomeDirOverrideForTest(home);
});
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	await fs.rm(home, { recursive: true, force: true });
});
function config() {
	return ComposedConfigSchema.parse({
		model: "chatgpt",
		browser: {},
		browserProfiles: {
			account: {
				chromePath: "/usr/bin/chromium",
				browserFamily: "chromium",
				browserBuild: "stealthcdp_chromium",
			},
		},
		runtimeProfiles: {
			writer: {
				engine: "browser",
				defaultService: "chatgpt",
				browserProfile: "account",
				services: {
					chatgpt: { identity: { email: "writer@example.test" }, url: "https://chatgpt.com" },
				},
			},
			reader: {
				engine: "browser",
				defaultService: "chatgpt",
				browserProfile: "account",
				services: { chatgpt: { identity: { email: "writer@example.test" } } },
			},
		},
		remoteView: {
			application: {
				name: "auracall",
				origin: "http://127.0.0.1:19096",
				publicOrigin: "https://viewer.example.test",
				appOrigin: "https://auracall.example.test",
			},
			desktops: { research: { poolName: "research" } },
		},
	});
}
function deps() {
	return {
		list: async () => ({
			desktops: [
				{
					name: "research",
					label: "Research",
					presentation: "native" as const,
					state: "ready" as const,
					browsers: [] as { browserId: string; handoffUrl: string }[],
				},
			],
		}),
		bindings: async () => [] as NativeDesktopBrowser[],
		findProcess: vi.fn(async () => null),
	};
}
test("inventory projects real runtime profiles and configured account identity without exposing filesystem paths", async () => {
	const c = config();
	const rows = await listDesktopRuntimeProfiles(c, deps());
	expect(rows.map((p) => p.runtimeProfileId)).toEqual(["reader", "writer"]);
	expect(rows[0]?.accountKey).toBe(rows[1]?.accountKey);
	expect(rows[0]).toMatchObject({
		accountLabel: "writer@example.test",
		state: "dormant",
		wakeable: true,
	});
	expect(JSON.stringify(rows)).not.toContain(home);
});
test("remembered placement reaches normal config loads and ignores stale identity or explicit operator assignment", async () => {
	const c = config();
	await rememberDesktopProfileAssignment("writer", {
		browserProfileId: "account",
		provider: "chatgpt",
		desktopName: "research",
	});
	await fs.writeFile(path.join(home, "config.json"), JSON.stringify(c));
	const loaded = await loadUserConfig(home);
	expect(loaded.config.runtimeProfiles?.writer?.browser?.desktop).toBe("research");
	expect(loaded.config.runtimeProfiles?.reader?.browser?.desktop).toBe("research");
	const writer = c.runtimeProfiles?.writer;
	expect(writer).toBeDefined();
	if (!writer) throw new Error("Missing fixture profile");
	writer.browser = { desktop: "root" };
	expect((await applyDesktopProfileAssignments(c)).runtimeProfiles?.writer?.browser?.desktop).toBe(
		"root",
	);
	const changed = config();
	const changedWriter = changed.runtimeProfiles?.writer;
	if (!changedWriter) throw new Error("Missing fixture profile");
	changedWriter.browserProfile = "other-account";
	expect(
		(await applyDesktopProfileAssignments(changed)).runtimeProfiles?.writer?.browser?.desktop,
	).toBeUndefined();
});
test("shared placement ignores rebound origins and other providers", async () => {
	await rememberDesktopProfileAssignment("writer", {
		browserProfileId: "account",
		provider: "chatgpt",
		desktopName: "research",
	});
	const c = config();
	if (!c.runtimeProfiles?.reader || !c.runtimeProfiles.writer)
		throw new Error("Missing fixture profiles");
	c.runtimeProfiles.reader.defaultService = "grok";
	expect(
		(await applyDesktopProfileAssignments(c)).runtimeProfiles?.reader?.browser?.desktop,
	).toBeUndefined();
	const rebound = config();
	if (!rebound.runtimeProfiles?.writer) throw new Error("Missing fixture profile");
	rebound.runtimeProfiles.writer.browserProfile = "other-account";
	expect(
		(await applyDesktopProfileAssignments(rebound)).runtimeProfiles?.reader?.browser?.desktop,
	).toBeUndefined();
});
test("running root browsers and Windows runtime profiles cannot be moved or awakened by the rail", async () => {
	const c = config();
	const d = deps();
	d.findProcess.mockResolvedValue({ pid: 1234 } as never);
	const rows = await listDesktopRuntimeProfiles(c, d);
	expect(rows.every((p) => !p.wakeable && p.message?.includes("Close it"))).toBe(true);
	await expect(wakeDesktopRuntimeProfile(c, "writer", "research", d)).rejects.toThrow("Close it");
	const win = config();
	const windowsFamily = win.browserProfiles?.account;
	if (!windowsFamily) throw new Error("Missing fixture browser profile");
	windowsFamily.chromePath = "C:\\Chrome\\chrome.exe";
	expect((await listDesktopRuntimeProfiles(win, deps()))[0]?.wakeable).toBe(false);
	windowsFamily.chromePath = "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe";
	expect((await listDesktopRuntimeProfiles(win, deps()))[0]?.wakeable).toBe(false);
});
test("Wake uses the exact canonical managed profile, remembers placement, and repeated Wake returns the ready browser", async () => {
	const c = config();
	const bindings: NativeDesktopBrowser[] = [];
	const d = deps();
	d.bindings = async () => bindings;
	d.list = async () => ({
		desktops: [
			{
				name: "research",
				label: "Research",
				presentation: "native" as const,
				state: "ready" as const,
				browsers: bindings.map((b) => ({ browserId: b.browserId, handoffUrl: "/desktops" })),
			},
		],
	});
	const launch = vi.fn(async (launchConfig, directory) => {
		expect(launchConfig.remoteViewDesktop?.desktopName).toBe("research");
		expect(launchConfig.manualLogin).toBe(true);
		expect(new URL(launchConfig.url).origin).toBe("https://chatgpt.com");
		const expected = resolveBrowserLaunchPlan({
			source: { kind: "user-config", config: c },
			intent: { runtimeProfileId: "writer", provider: "chatgpt" },
		});
		expect(directory).toBe(expected.managedBrowserProfile.directory);
		bindings.push({
			browserId: "writer-browser",
			managedProfileDir: directory,
			desktopName: "research",
			application: "auracall",
			origin: "http://127.0.0.1:19096",
			poolName: "research",
			assignment: {
				assignmentId: "assignment",
				desktopId: "desktop",
				generation: 1,
				viewingGeneration: 1,
			},
			pid: 999,
			processStart: "fixture",
			bootId: "fixture",
			executable: "/usr/bin/chromium",
			display: ":920",
			cdpHost: "127.0.0.1",
			cdpPort: 12345,
		});
		return { process: { unref: () => {} }, port: 12345 };
	});
	const input = {
		...d,
		findNative: async () => bindings[0],
		launch: launch as unknown as typeof launchChrome,
	};
	expect(await wakeDesktopRuntimeProfile(c, "writer", "research", input)).toMatchObject({
		browserId: "writer-browser",
		desktopName: "research",
	});
	expect(await wakeDesktopRuntimeProfile(c, "writer", "research", input)).toMatchObject({
		browserId: "writer-browser",
	});
	expect(await wakeDesktopRuntimeProfile(c, "reader", "research", input)).toMatchObject({
		browserId: "writer-browser",
	});
	expect(launch).toHaveBeenCalledTimes(1);
	expect(browserPage.navigate).toHaveBeenCalledTimes(1);
	expect(new URL(browserPage.navigate.mock.calls[0]?.[0]).origin).toBe("https://chatgpt.com");
	browserPage.url = "about:blank";
	await wakeDesktopRuntimeProfile(c, "writer", "research", input);
	expect(browserPage.navigate).toHaveBeenCalledTimes(2);
	browserPage.url = "https://chatgpt.com/c/existing";
	await wakeDesktopRuntimeProfile(c, "reader", "research", input);
	expect(browserPage.navigate).toHaveBeenCalledTimes(2);
	expect(browserPage.url).toBe("https://chatgpt.com/c/existing");
	const explicit = config();
	if (explicit.runtimeProfiles?.reader)
		explicit.runtimeProfiles.reader.browser = { desktop: "root" };
	expect(
		(await listDesktopRuntimeProfiles(explicit, input)).find((p) => p.runtimeProfileId === "reader")
			?.state,
	).toBe("unavailable");
	expect(
		(await applyDesktopProfileAssignments(config())).runtimeProfiles?.writer?.browser?.desktop,
	).toBe("research");
});
test("unknown profiles, unknown desktops and failed launches never persist placement", async () => {
	const c = config();
	await expect(wakeDesktopRuntimeProfile(c, "missing", "research", deps())).rejects.toThrow(
		"Unknown",
	);
	await expect(wakeDesktopRuntimeProfile(c, "writer", "missing", deps())).rejects.toThrow(
		"configured native desktop",
	);
	await expect(
		wakeDesktopRuntimeProfile(c, "writer", "research", {
			...deps(),
			launch: vi.fn(async () => {
				throw new Error("owner uncertain");
			}) as unknown as typeof launchChrome,
		}),
	).rejects.toThrow("owner uncertain");
	await expect(
		fs.readFile(path.join(home, "desktop-profile-assignments.json")),
	).rejects.toMatchObject({ code: "ENOENT" });
});
