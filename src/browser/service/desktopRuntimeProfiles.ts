import { createHash } from "node:crypto";
import path from "node:path";
import {
	getBrowserProfile,
	getCurrentRuntimeProfiles,
	getRuntimeProfileBrowserProfileId,
} from "../../config/model.js";
import type { ResolvedUserConfig } from "../../config.js";
import CDP from "../cdp.js";
import { launchChrome } from "../chromeLifecycle.js";
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from "../constants.js";
import { findChromeProcessUsingUserDataDir } from "../processCheck.js";
import type { ResolvedBrowserConfig } from "../types.js";
import { resolveBrowserLaunchPlan } from "./browserLaunchPlan.js";
import { listDesktopViews } from "./desktopClient.js";
import {
	applyDesktopProfileAssignments,
	rememberDesktopProfileAssignment,
} from "./desktopProfileAssignments.js";
import { findNativeDesktopBrowser } from "./nativeDesktopRuntime.js";
import {
	type NativeDesktopBrowser,
	NativeDesktopStore,
	nativeDesktopKey,
} from "./nativeDesktopStore.js";

export interface DesktopRuntimeProfile {
	runtimeProfileId: string;
	provider: "chatgpt" | "gemini" | "grok";
	accountKey: string;
	accountLabel: string;
	state: "ready" | "dormant" | "unavailable";
	desktopName?: string;
	browserId?: string;
	wakeable: boolean;
	message?: string;
}
function record(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function text(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
type Deps = {
	list?: typeof listDesktopViews;
	bindings?: () => Promise<NativeDesktopBrowser[]>;
	findProcess?: typeof findChromeProcessUsingUserDataDir;
	launch?: typeof launchChrome;
	findNative?: typeof findNativeDesktopBrowser;
};
async function effective(config: ResolvedUserConfig) {
	return applyDesktopProfileAssignments(structuredClone(config));
}
function providerFor(profile: Record<string, unknown>): "chatgpt" | "gemini" | "grok" | undefined {
	const p = profile.defaultService;
	return p === "chatgpt" || p === "gemini" || p === "grok" ? p : undefined;
}
export async function listDesktopRuntimeProfiles(
	config: ResolvedUserConfig,
	deps: Deps = {},
): Promise<DesktopRuntimeProfile[]> {
	const current = await effective(config);
	const profiles = getCurrentRuntimeProfiles(current);
	const catalog = await (deps.list ?? listDesktopViews)({ remoteView: current.remoteView });
	const bindings = await (deps.bindings ?? (() => new NativeDesktopStore().browsers()))();
	const result: DesktopRuntimeProfile[] = [];
	for (const [id, profile] of Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b))) {
		const provider = providerFor(profile);
		if (!provider) continue;
		const service = {
			...record(current.services?.[provider]),
			...record(record(profile.services)[provider]),
		};
		const identity = record(service.identity);
		const family = getRuntimeProfileBrowserProfileId(profile);
		const identityKey =
			text(identity.email)?.toLowerCase() ??
			(text(identity.accountId) ? `${provider}:${text(identity.accountId)}` : undefined) ??
			(text(identity.handle) ? `${provider}:${text(identity.handle)}` : undefined);
		const accountLabel =
			text(identity.accountLabel) ??
			text(identity.email) ??
			text(identity.name) ??
			text(identity.handle) ??
			(text(identity.accountId)
				? `${provider} account ${text(identity.accountId)}`
				: `Unassigned account · ${family ?? id}`);
		const item: DesktopRuntimeProfile = {
			runtimeProfileId: id,
			provider,
			accountKey: createHash("sha256")
				.update(identityKey ?? `${provider}:browser:${family ?? id}`)
				.digest("hex"),
			accountLabel,
			state: "dormant",
			wakeable: true,
		};
		try {
			if (profile.engine && profile.engine !== "browser")
				throw new Error("This runtime profile does not use a browser.");
			const plan = resolveBrowserLaunchPlan({
				source: { kind: "user-config", config: current },
				intent: { runtimeProfileId: id, provider },
			});
			const directory = plan.managedBrowserProfile.directory;
			if (
				/\\\\|^[A-Za-z]:/.test(plan.launchPolicy.chromePath ?? "") ||
				plan.launchPolicy.remoteChrome ||
				/\.exe$/i.test(plan.launchPolicy.chromePath ?? "") ||
				plan.launchPolicy.wslChromePreference === "windows"
			)
				throw new Error("This browser runs outside the local native desktop runtime.");
			const matching = bindings.filter(
				(b) => path.resolve(b.managedProfileDir) === path.resolve(directory),
			);
			if (matching.length > 1) throw new Error("Browser ownership is ambiguous.");
			const binding = matching[0];
			if (binding) {
				const desktop = catalog.desktops.find((d) => d.name === binding.desktopName);
				const ready =
					desktop?.state === "ready" &&
					desktop.browsers.some((b) => b.browserId === binding.browserId);
				if (ready) {
					if (
						!plan.launchPolicy.remoteViewDesktop ||
						nativeDesktopKey(binding) !== nativeDesktopKey(plan.launchPolicy.remoteViewDesktop)
					)
						throw new Error(
							"Running browser placement differs from this runtime profile configuration.",
						);
					if (
						!(await (deps.findNative ?? findNativeDesktopBrowser)(
							plan.launchPolicy as ResolvedBrowserConfig,
							directory,
						))
					)
						throw new Error("The retained native browser is unavailable.");
					Object.assign(item, {
						state: "ready",
						wakeable: false,
						desktopName: binding.desktopName,
						browserId: binding.browserId,
					});
				} else if (await (deps.findProcess ?? findChromeProcessUsingUserDataDir)(directory))
					throw new Error("The retained native browser is unavailable.");
			}
			if (
				item.state !== "ready" &&
				(await (deps.findProcess ?? findChromeProcessUsingUserDataDir)(directory))
			)
				throw new Error("Running outside these desktops. Close it before waking here.");
			item.desktopName ??= plan.launchPolicy.remoteViewDesktop?.desktopName;
			if (
				item.state !== "ready" &&
				!Object.values(current.remoteView?.desktops ?? {}).some((d) => d.poolName)
			)
				throw new Error("Configure a native desktop before waking this runtime profile.");
		} catch (error) {
			item.state = "unavailable";
			item.wakeable = false;
			item.message = error instanceof Error ? error.message : "Runtime profile unavailable.";
		}
		result.push(item);
	}
	return result;
}
async function openBlankProviderPage(browser: NativeDesktopBrowser, url: string): Promise<void> {
	const endpoint = { host: browser.cdpHost, port: browser.cdpPort };
	const inspector = await CDP(endpoint);
	let targetId: string | undefined;
	try {
		const { targetInfos } = await inspector.Target.getTargets();
		const pages = targetInfos.filter((target) => target.type === "page");
		// Preserve any existing work. Wake repairs a blank browser, never navigates a live conversation.
		if (pages.length && pages.every((target) => target.url === "about:blank"))
			targetId = pages[0]?.targetId;
	} finally {
		await inspector.close();
	}
	if (!targetId) return;
	const page = await CDP({ ...endpoint, target: targetId });
	try {
		const result = await page.Page.navigate({ url });
		if (result.errorText) throw new Error(`Provider page could not open: ${result.errorText}`);
	} finally {
		await page.close();
	}
}
export async function wakeDesktopRuntimeProfile(
	config: ResolvedUserConfig,
	id: string,
	desktopName?: string,
	deps: Deps = {},
): Promise<{ runtimeProfileId: string; desktopName: string; browserId: string }> {
	// Serialize aliases of the same browser profile at the native launch boundary as well.
	return new NativeDesktopStore().exclusive(`wake:${id}`, async () => {
		const current = await effective(config);
		const profiles = getCurrentRuntimeProfiles(current);
		if (!Object.hasOwn(profiles, id)) throw new Error("Unknown AuraCall runtime profile.");
		const profile = profiles[id];
		if (!profile) throw new Error("Unknown AuraCall runtime profile.");
		const existing = (await listDesktopRuntimeProfiles(current, deps)).find(
			(p) => p.runtimeProfileId === id,
		);
		const ready = existing?.state === "ready" && existing.desktopName && existing.browserId;
		if (!ready && !existing?.wakeable)
			throw new Error(existing?.message ?? "This runtime profile cannot be awakened.");
		const provider = providerFor(profile);
		if (!provider) throw new Error("Select a supported browser provider.");
		let plan = resolveBrowserLaunchPlan({
			source: { kind: "user-config", config: current },
			intent: { runtimeProfileId: id, provider },
		});
		if (ready) {
			const binding = await (deps.findNative ?? findNativeDesktopBrowser)(
				plan.launchPolicy as ResolvedBrowserConfig,
				plan.managedBrowserProfile.directory,
			);
			if (!binding) throw new Error("The retained native browser is unavailable.");
			await openBlankProviderPage(
				binding,
				plan.providerBinding.serviceUrl ??
					{ chatgpt: CHATGPT_URL, gemini: GEMINI_URL, grok: GROK_URL }[provider],
			);
			return {
				runtimeProfileId: id,
				desktopName: existing.desktopName as string,
				browserId: existing.browserId as string,
			};
		}
		const familyId = getRuntimeProfileBrowserProfileId(profile);
		const family = getBrowserProfile(current, familyId);
		const browser = record(profile.browser);
		const selected =
			plan.launchPolicy.remoteViewDesktop?.desktopName ??
			desktopName ??
			current.remoteView?.defaultDesktop;
		if (
			!selected ||
			!Object.hasOwn(current.remoteView?.desktops ?? {}, selected) ||
			!current.remoteView?.desktops[selected]?.poolName
		)
			throw new Error("Select a configured native desktop to wake this runtime profile.");
		if (!plan.launchPolicy.remoteViewDesktop) {
			if (family?.desktop !== undefined || browser.desktop !== undefined)
				throw new Error("This runtime profile has an explicit non-native desktop assignment.");
			profile.browser = { ...browser, desktop: selected };
			plan = resolveBrowserLaunchPlan({
				source: { kind: "user-config", config: current },
				intent: { runtimeProfileId: id, provider },
			});
		}
		if (!plan.launchPolicy.remoteViewDesktop)
			throw new Error("Native desktop placement is unavailable.");
		const url =
			plan.providerBinding.serviceUrl ??
			{ chatgpt: CHATGPT_URL, gemini: GEMINI_URL, grok: GROK_URL }[provider];
		const launchConfig = structuredClone(plan.launchPolicy) as ResolvedBrowserConfig;
		const handle = await (deps.launch ?? launchChrome)(
			{ ...launchConfig, manualLogin: true, keepBrowser: true, hideWindow: false, url },
			plan.managedBrowserProfile.directory,
			() => {},
		);
		handle.process?.unref();
		// Persist placement for normal CLI and API launches; never rewrite the user's config text.
		await rememberDesktopProfileAssignment(id, {
			browserProfileId: familyId,
			provider,
			desktopName: selected,
		});
		const result = (await listDesktopRuntimeProfiles(current, deps)).find(
			(p) => p.runtimeProfileId === id,
		);
		if (result?.state !== "ready" || !result.browserId || !result.desktopName)
			throw new Error(
				"Browser launch completed but native ownership is not ready. Inspect this profile before retrying.",
			);
		const binding = await (deps.findNative ?? findNativeDesktopBrowser)(
			plan.launchPolicy as ResolvedBrowserConfig,
			plan.managedBrowserProfile.directory,
		);
		if (!binding) throw new Error("The retained native browser is unavailable.");
		await openBlankProviderPage(binding, url);
		return { runtimeProfileId: id, desktopName: result.desktopName, browserId: result.browserId };
	});
}
