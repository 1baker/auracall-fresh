#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { NativeDesktopControlError } from "../src/browser/service/nativeDesktopControl.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

interface NativeFixtureWindow {
	// biome-ignore lint/style/useNamingConvention: Exact Remote View browser global.
	RemoteViewConsumer?: unknown;
	fixtureErrors?: string[];
	fixtureInput: unknown[][];
	fixtureKeyboards: Array<{
		element: Document | HTMLElement;
		onkeydown: (key: number) => boolean;
		onkeyup: (key: number) => boolean;
	}>;
	fixtureMice: Array<{ onmousedown?: (state: { x: number; y: number; left: boolean }) => void }>;
}

const nativeSourceRoot = process.env.AURACALL_REMOTE_VIEW_SOURCE_ROOT;
if (!nativeSourceRoot)
	throw new Error(
		"Set AURACALL_REMOTE_VIEW_SOURCE_ROOT to the matching Remote View checkout for native controls validation.",
	);
const nativeViewerSource = await fs.readFile(
	path.join(nativeSourceRoot, "web/consumer-viewer.js"),
	"utf8",
);
const primaryViewerSource = await fs.readFile(path.join(nativeSourceRoot, "web/viewer.js"), "utf8");
const nativeGatewaySource = await fs.readFile(
	path.join(nativeSourceRoot, "src/gateway/server.rs"),
	"utf8",
);
const chromeLiteral = nativeGatewaySource.match(
	/fn viewer_chrome_html\(index: u32\) -> String \{\s*format!\(\s*("(?:[^"\\]|\\.)*")/s,
)?.[1];
if (!chromeLiteral) throw Error("Shared native viewer chrome missing");
const nativeChrome = JSON.parse(chromeLiteral).replaceAll("{index}", "1");
const nativeAssistanceSource = await fs.readFile(
	path.join(nativeSourceRoot, "web/assistance.js"),
	"utf8",
);
const nativeCss = await fs.readFile(path.join(nativeSourceRoot, "web/viewer.css"), "utf8");
const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-desktop-client-smoke-"));
setAuracallHomeDirOverrideForTest(home);
const imageBase64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=";
const desktops = [
	{
		name: "research",
		label: "Research",
		state: "ready" as const,
		presentation: "native" as const,
		browsers: [
			{
				browserId: "research-browser",
				handoffUrl: "https://browser.example.test/remote-view/research",
			},
		],
	},
	{
		name: "writing",
		label: "Writing",
		state: "ready" as const,
		presentation: "native" as const,
		browsers: [
			{
				browserId: "writing-browser",
				handoffUrl: "https://browser.example.test/remote-view/writing",
			},
		],
	},
	{ name: "empty", label: "Empty desktop", state: "empty" as const, browsers: [] },
	{
		name: "unavailable",
		label: "Unavailable desktop",
		state: "unavailable" as const,
		browsers: [],
		message: "Configured desktop route is unavailable.",
	},
];
desktops.push({
	name: "constructor",
	label: "Constructor desktop",
	state: "ready",
	presentation: "native",
	browsers: [{ browserId: "constructor-browser", handoffUrl: "/desktops?desktop=constructor" }],
});
const runtimeProfiles = [
	{
		runtimeProfileId: "research-runtime",
		provider: "chatgpt" as const,
		accountKey: "account-a",
		accountLabel: "Research account",
		state: "ready" as "ready" | "dormant",
		wakeable: false,
		desktopName: "research",
		browserId: "research-browser",
	},
	{
		runtimeProfileId: "writing-runtime",
		provider: "chatgpt" as const,
		accountKey: "account-a",
		accountLabel: "Research account",
		state: "ready" as "ready" | "dormant",
		wakeable: false,
		desktopName: "writing",
		browserId: "writing-browser",
	},
	{
		runtimeProfileId: "dormant-runtime",
		provider: "grok" as const,
		accountKey: "account-b",
		accountLabel: "Writing account",
		state: "dormant" as "ready" | "dormant",
		wakeable: true,
		desktopName: "writing",
		browserId: undefined as string | undefined,
	},
];
const frames: string[] = [];
let observeGrantSequence = 0;
const controlEvents: string[] = [];
const controlTokens: string[] = [];
let rejectRelease = true;
let rejectClose = true;
const server = await createResponsesHttpServer(
	{ host: "127.0.0.1", port: 0, tabAffinityMaintenanceIntervalMs: 0 },
	{
		desktopClient: {
			profiles: async () => runtimeProfiles,
			closeBrowser: async (name, id) => {
				controlEvents.push(`close:${name}:${id}`);
				if (rejectClose) throw Error("Fixture browser close was not confirmed.");
				const desktop = desktops.find((x) => x.name === name);
				assert(desktop);
				desktop.browsers = desktop.browsers.filter((x) => x.browserId !== id);
 if (!desktop.browsers.length) desktop.state = "empty";
				for (const profile of runtimeProfiles.filter((x) => x.browserId === id)) {
					profile.state = "dormant";
					profile.browserId = undefined;
					profile.wakeable = true;
				}
				return { state: "closed" as const };
			},
			wakeProfile: async (id) => {
				assert.equal(id, "dormant-runtime");
				controlEvents.push(`wake:${id}`);
				const item = runtimeProfiles[2];
				assert(item);
				item.state = "ready";
				item.wakeable = false;
				item.browserId = "writing-browser";
				return { runtimeProfileId: id, desktopName: "writing", browserId: "writing-browser" };
			},
			list: async () => ({
				defaultDesktop: "research",
				rootDesktopUrl: "https://browser.example.test/root",
				desktops,
			}),
			view: async (name, browserId) => {
				frames.push(`${name}:${browserId}`);
				return {
					url:
						"https://desktop.example.test/embed/" +
						(name === "research"
							? "11111111-1111-4111-8111-"
							: "22222222-2222-4222-8222-") + String(++observeGrantSequence).padStart(12, "0"),
					capability: "observe" as const,
				};
			},
			takeControl: async (name, browserId, token) => {
				controlEvents.push(`take:${name}:${browserId}`);
				controlTokens.push(token);
				if (name === "constructor")
					throw new NativeDesktopControlError("Another controller owns this desktop.", false);
				return {
					url: "https://desktop.example.test/embed/33333333-3333-4333-8333-333333333333",
					capability: "control" as const,
					token,
				};
			},
			controlStatus: async () => ({ state: "held" as const }),
			releaseControl: async (name, browserId) => {
				controlEvents.push(`release:${name}:${browserId}`);
				if (rejectRelease) throw new Error("Fixture revoke not confirmed.");
			},
			capture: async (name, browserId) => {
				frames.push(`${name}:${browserId}`);
				return { imageBase64, width: 1, height: 1 };
			},
		},
	},
);
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let browserProfileArgument: string | undefined;
try {
	browser = await puppeteer.launch({
		executablePath: process.env.AURACALL_OPERATOR_UX_SMOKE_CHROME_PATH ?? "/usr/bin/google-chrome",
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	browserProfileArgument = browser
		.process()
		?.spawnargs.find((argument) => argument.startsWith("--user-data-dir="));
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.origin === "https://desktop.example.test") {
			const capability = url.pathname.includes("33333333") ? "control" : "observe";
			if (url.pathname.endsWith("/status"))
				void request.respond({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						state: "ready",
						capability,
						slot: 1,
						generation: 1,
						recordingContext: {application: "fixture", sessionId: "assignment"},
						clipboardCopy: true,
						clipboardPaste: true,
						audioEnabled: true,
					}),
				});
			else if (url.pathname === "/assets/viewer.css")
				void request.respond({ status: 200, contentType: "text/css", body: nativeCss });
			else
				void request.respond({
					status: 200,
					contentType: "text/html",
					body: `<!doctype html><html><head><link rel="stylesheet" href="/assets/viewer.css"></head><body id="consumer-viewer" data-route="${url.pathname.split("/")[2]}" data-capability="${capability}" data-presentation="embed" data-parent-origin="http://127.0.0.1:${server.port}" data-slot="1" data-generation="1">${nativeChrome}<script>
const displayElement=document.createElement('div');displayElement.textContent='Native Remote View fixture';displayElement.style.cssText='width:800px;height:600px;background:#122035;color:white;display:grid;place-items:center;font:24px system-ui';
const display={getElement:()=>displayElement,getWidth:()=>800,getHeight:()=>600,getScale:()=>1,scale:value=>{displayElement.style.transform='scale('+value+')';displayElement.style.transformOrigin='top left';}};
window.fixtureInput=[];window.fixtureKeyboards=[];window.fixtureMice=[];window.fixtureErrors=[];window.addEventListener('error',event=>window.fixtureErrors.push(event.message));
class Mouse {constructor(element){this.element=element;this.currentState={};window.fixtureMice.push(this);}};Mouse.Touchscreen=class extends Mouse{};Mouse.Touchpad=class extends Mouse{};Mouse.State=class{constructor(state){Object.assign(this,state);}};
const Guacamole={Tunnel:{State:{OPEN:1,UNSTABLE:2,CLOSED:3}},AudioContextFactory:{getAudioContext:()=>null},AudioPlayer:{getSupportedTypes:()=>[]},ChainedTunnel:class{},WebSocketTunnel:class{},HTTPTunnel:class{},Client:class{getDisplay(){return display;}connect(){this.onstatechange(3);}disconnect(){this.onstatechange?.(5);}sendKeyEvent(...args){window.fixtureInput.push(['key',...args]);}sendMouseState(...args){window.fixtureInput.push(['mouse',...args]);}},Keyboard:class{constructor(element){this.element=element;window.fixtureKeyboards.push(this);}reset(){}},Mouse};
${nativeAssistanceSource}
${nativeViewerSource}
${primaryViewerSource}
</script></body></html>`,
				});
		} else void request.continue();
	});
	async function clickNativeMode() {
		const frame = page
			.frames()
			.find((frame) => frame.url().startsWith("https://desktop.example.test/embed/"));
		assert(frame, "Native viewer frame missing");
		await frame.waitForSelector("#view-only:not([disabled])");
		await frame.click("#view-only");
	}

	await page.evaluateOnNewDocument(() => {
		const schedule = window.setTimeout.bind(window);
		window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
			if (delay !== undefined && delay >= 100000 && delay <= 240000)
				(window as unknown as { nativeRefreshDelay: number }).nativeRefreshDelay = delay;
			if (delay !== undefined && delay > 230000 && delay <= 240000 && typeof callback === "function")
				(window as unknown as { stabilityRefresh: () => void }).stabilityRefresh = callback as () => void;
			return schedule(callback, delay, ...args);
		}) as typeof window.setTimeout;
	});
	await page.goto(`http://127.0.0.1:${server.port}/desktops`);
	await page
		.waitForFunction(
			() => document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
		)
		.catch(async (cause) => {
			console.log(
				JSON.stringify({
					nativeFixtureErrors: errors,
					nativeFrames: await Promise.all(
						page.frames().map(async (frame) => ({
							url: frame.url(),
							diagnostic: await frame.evaluate(() => ({
								adapter: typeof (window as unknown as NativeFixtureWindow).RemoteViewConsumer,
								errors: (window as unknown as NativeFixtureWindow).fixtureErrors,
								keys: (window as unknown as NativeFixtureWindow).fixtureKeyboards?.length,
								buttons: document.querySelectorAll("button").length,
								mode: document.querySelector("#settings")?.getAttribute("data-mode"),
								scripts: [...document.scripts].map((x) => x.textContent?.length),
							})),
							status: await frame
								.$eval("#connection-status", (node) => node.textContent)
								.catch(() => null),
						})),
					),
				}),
			);
			throw cause;
		});
	// Expiring passive grants must renew through the existing iframe. Advance
	// the actual scheduled callback, retaining the real parent/child handshake.
	const passiveViewsBefore = frames.length;
	await page.evaluate(() => {
		(window as unknown as { renewalFrame: Element | null }).renewalFrame = document.querySelector('#native-view iframe');
		(window as unknown as { stabilityRefresh: () => void }).stabilityRefresh();
	});
	await page.waitForNetworkIdle();
	assert.equal(frames.length, passiveViewsBefore + 1, 'Scheduled passive refresh must issue a new grant before expiry.');
	assert.equal(await page.evaluate(() => document.querySelector('#native-view iframe') ===
		(window as unknown as { renewalFrame: Element | null }).renewalFrame), true,
		'Passive grant renewal must preserve the native iframe.');
	await page.waitForFunction(() => document.querySelector('#native-view section')?.getAttribute('data-state') === 'ready');
	// Visibility return must retain the original renewal deadline rather than
	// postponing an expiring grant by another four minutes.
	await page.evaluate(() => {
		const clock = Date.now;
		(window as unknown as { fixtureClock: () => number }).fixtureClock = clock;
		Date.now = () => clock() + 120000;
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.waitForNetworkIdle();
	const remainingDelay = await page.evaluate(() => {
		const w = window as unknown as { fixtureClock: () => number; nativeRefreshDelay: number };
		Date.now = w.fixtureClock;
		return w.nativeRefreshDelay;
	});
	assert(remainingDelay > 110000 && remainingDelay <= 120000,
		'Visibility return must preserve the passive grant renewal deadline.');
	for (const id of ["refresh", "browser", "browser-label", "title"])
		assert.equal(await page.$(`#${id}`), null);
	assert.equal(await page.$("body > header"), null);
	assert.equal(await page.$eval("#content", (node) => node.getAttribute("aria-label")), "Research");
	await page.$eval('#desktops button[data-desktop="writing"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#content")?.getAttribute("aria-label") === "Writing" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(new URL(page.url()).searchParams.get("desktop"), "writing");
	await page.reload();
	await page.waitForFunction(
		() =>
			document.querySelector("#content")?.getAttribute("aria-label") === "Writing" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	await page.evaluate(() => { (window as unknown as { modeFrame: Element | null }).modeFrame = document.querySelector('#native-view iframe'); });
	await clickNativeMode();
	await page.waitForFunction(
		() =>
			document.querySelector("#native-view section")?.getAttribute("data-capability") === "control" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	await page.evaluate(() => {
		(window as unknown as { stabilityFrame: Element | null }).stabilityFrame = document.querySelector("#native-view iframe");
		(window as unknown as { stabilityRefresh: () => void }).stabilityRefresh();
	});
	await page.waitForNetworkIdle();
	assert.equal(await page.evaluate(() => document.querySelector("#native-view iframe") ===
		(window as unknown as { stabilityFrame: Element | null }).stabilityFrame), true,
		"Periodic refresh must retain the connected control viewer.");
	// Returning to the page must retain the connected control iframe and claim.
	await page.evaluate(() => {
		const frame = document.querySelector("#native-view iframe");
		(window as unknown as { stabilityFrame: Element | null }).stabilityFrame = frame;
		document.dispatchEvent(new Event("visibilitychange"));
	});
	await page.waitForNetworkIdle();
	assert.equal(await page.evaluate(() => document.querySelector("#native-view iframe") ===
		(window as unknown as { stabilityFrame: Element | null }).stabilityFrame), true,
		"Visibility refresh must retain the connected control viewer.");
	assert.equal(controlEvents.length, 1, "Visibility refresh must not replay takeover.");
	assert.equal(await page.evaluate(() => document.querySelector('#native-view iframe') === (window as unknown as { modeFrame: Element | null }).modeFrame),true,'Initial takeover must keep the iframe document.');
	await page.reload();
	await page.waitForFunction(
		() =>
			document.querySelector("#native-view section")?.getAttribute("data-capability") === "control" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(controlEvents.length, 2, "Reload replays the retained claim.");
	assert.equal(new Set(controlTokens).size, 1, "Reload must not create a new claim token.");
	const interactiveFrame = page.frames().find((frame) => frame.url().includes("33333333"));
	assert(interactiveFrame);
	await interactiveFrame.waitForSelector("#view-only:not([disabled])");
	assert.deepEqual(
		await interactiveFrame.evaluate(() => {
			const w = window as unknown as NativeFixtureWindow;
			const settings = document.getElementById("settings") as HTMLButtonElement;
			const modes = [settings.dataset.mode];
			for (let i = 0; i < 3; i++) {
				settings.click();
				modes.push(settings.dataset.mode);
			}
			const surface = document.getElementById("desktop-surface") as HTMLElement;
			surface.focus();
			const keyboard = w.fixtureKeyboards[0];
			keyboard.onkeydown(97);
			keyboard.onkeyup(97);
			const mouse = w.fixtureMice.find((x) => typeof x.onmousedown === "function");
			mouse?.onmousedown?.({ x: 4, y: 5, left: true });
			return {
				modes,
				documentKeyboard: keyboard.element === document,
				duplicateSettingsPanel: !!document.getElementById("settings-panel"),
				events: w.fixtureInput.map((x) => x[0]),
				errors: w.fixtureErrors,
			};
		}),
		{
			modes: ["mouse", "touchscreen", "touchpad", "mouse"],
			documentKeyboard: true,
			duplicateSettingsPanel: false,
			events: ["key", "key", "mouse"],
			errors: [],
		},
	);
	await interactiveFrame.click("#keyboard-button");
	await interactiveFrame.type("#mobile-keyboard-input", "hi");
	assert.equal(
		await interactiveFrame.evaluate(
			() =>
				(window as unknown as NativeFixtureWindow).fixtureInput.filter((x) => x[0] === "key")
					.length,
		),
		6,
	);
	await interactiveFrame.click("#keyboard-close");
	for (const id of ["clipboard-paste", "clipboard-copy", "audio-volume-control"])
		assert(await interactiveFrame.$(`#${id}`));

	await page.evaluate(() => { (window as unknown as { modeFrame: Element | null }).modeFrame = document.querySelector('#native-view iframe'); });
	await clickNativeMode();
	await page.waitForFunction(() =>
		document.querySelector("#error")?.textContent?.includes("Release was not confirmed"),
	);
	assert.equal(await page.$("#release-control"), null);

	rejectRelease = false;
	await clickNativeMode();
	await page.waitForFunction(
		() =>
			!Object.hasOwn(
				JSON.parse(sessionStorage.getItem("auracall-desktop-claims") || "{}"),
				"constructor",
			),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#native-view section")?.getAttribute("data-capability") === "observe" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(await page.evaluate(() => document.querySelector('#native-view iframe') === (window as unknown as { modeFrame: Element | null }).modeFrame),true,'Release must keep the iframe document.');
	const observeFrame=page.frames().find(frame=>frame.url().startsWith('https://desktop.example.test/embed/'));assert(observeFrame);
	const beforeObserveInput=await observeFrame.evaluate(()=>(window as unknown as NativeFixtureWindow).fixtureInput.length);
	await observeFrame.evaluate(()=>{const w=window as unknown as NativeFixtureWindow;w.fixtureKeyboards[0].onkeydown(97);});
	assert.equal(await observeFrame.evaluate(()=>(window as unknown as NativeFixtureWindow).fixtureInput.length),beforeObserveInput,'Released observation must reject keyboard input.');
	assert.deepEqual(controlEvents, [
		"take:writing:writing-browser",
		"take:writing:writing-browser",
		"release:writing:writing-browser",
		"release:writing:writing-browser",
	]);
	if (process.env.AURACALL_DESKTOP_STABILITY_ONLY === "1") {
		assert.deepEqual(errors, []);
		console.log(JSON.stringify({scope:"provider-free rendered stability",passed:["passive-grant-renewed-in-place","periodic-control-viewer-retained","visibility-control-viewer-retained","native-keyboard-and-mouse","control-claim-replay","failed-release-retained","same-iframe-mode-transitions","release-to-observe-input-blocked"],pageErrors:errors,installedDesktopAcceptance:false}));
	} else {
	assert.equal(await page.$(".toolbar"), null, "No duplicate control toolbar.");
	assert.equal(await page.$$eval(".profile-row[data-runtime-profile]", (rows) => rows.length), 3);
	await page.click("#group-profile");
	assert.equal(
		await page.$eval("#group-profile", (node) => node.getAttribute("aria-pressed")),
		"true",
	);
	await page.reload();
	await page.waitForFunction(
		() => document.querySelector("#group-profile")?.getAttribute("aria-pressed") === "true",
	);
	await page.click("#group-account");
	await page.click("#rail-toggle");
	await page.waitForFunction(
		() => document.querySelector("#workspace")?.getAttribute("data-collapsed") === "true",
	);
	assert.equal(await page.$eval("#rail", (node) => (node as HTMLElement).inert), true);
	await page.click("#rail-toggle");
	await page.waitForFunction(
		() => document.querySelector("#workspace")?.getAttribute("data-collapsed") === "false",
	);
	await page.waitForFunction(
		() =>
			getComputedStyle(document.getElementById("rail") as HTMLElement).transform ===
			"matrix(1, 0, 0, 1, 0, 0)",
	);
	await page.click('[data-runtime-profile="dormant-runtime"] .wake');
	await page.waitForFunction(
		() =>
			document
				.querySelector('[data-runtime-profile="dormant-runtime"]')
				?.getAttribute("aria-current") === "true",
	);
	assert.equal(controlEvents.at(-1), "wake:dormant-runtime");
	assert.equal(await page.$('[data-runtime-profile="dormant-runtime"] .wake'), null);
	await page.waitForFunction(
		() => document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	const nativeFrame = page
		.frames()
		.find((frame) => frame.url().startsWith("https://desktop.example.test/embed/"));
	assert(nativeFrame);
	for (const id of [
		"view-only",
		"zoom-in",
		"zoom-out",
		"fit",
		"actual-size",
		"fullscreen",
		"keyboard-button",
		"settings",
		"record-viewer",
	])
		assert(await nativeFrame.$(`#${id}`), `Missing native tool: ${id}`);
	await page.screenshot({ path: "/tmp/auracall391-native-client.png", fullPage: true });
	await page.$eval('#desktops button[data-desktop="empty"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("No AuraCall browsers"),
	);
	await page.$eval('#desktops button[data-desktop="unavailable"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("Configured desktop route"),
	);
	assert.equal(
		await page.$eval("#root", (node) => (node as HTMLAnchorElement).href),
		"https://browser.example.test/root",
	);
	await page.$eval('#desktops button[data-desktop="constructor"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#content")?.getAttribute("aria-label") === "Constructor desktop" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(await page.$("#take-control"), null);
	await clickNativeMode();
	await page.waitForFunction(
		() =>
			!Object.hasOwn(
				JSON.parse(sessionStorage.getItem("auracall-desktop-claims") || "{}"),
				"constructor",
			),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#native-view section")?.getAttribute("data-capability") === "observe" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(await page.$("#release-control"), null);

	assert.equal(
		await page.evaluate(() =>
			Object.hasOwn(
				JSON.parse(sessionStorage.getItem("auracall-desktop-claims") || "{}"),
				"constructor",
			),
		),
		false,
	);
	await page.$eval('[data-runtime-profile="writing-runtime"] .profile-select', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.click('[data-runtime-profile="writing-runtime"] .close-browser');
	await page.waitForFunction(() =>
		document.getElementById("error")?.textContent?.includes("close was not confirmed"),
	);
	assert(await page.$('[data-runtime-profile="writing-runtime"] .close-browser'));
	rejectClose = false;
	await page.click('[data-runtime-profile="writing-runtime"] .close-browser');
	await page.waitForFunction(() =>
		document.querySelector('[data-runtime-profile="writing-runtime"] .wake'),
	);
	assert.equal(controlEvents.at(-1), "close:writing:writing-browser");
	assert(await page.$('[data-runtime-profile="dormant-runtime"] .wake'));
	assert.equal(await page.$('[data-runtime-profile="writing-runtime"] .close-browser'), null);
	assert.deepEqual(errors, []);
	assert(
		frames.includes("research:research-browser") && frames.includes("writing:writing-browser"),
	);
	console.log(
		JSON.stringify({
			scope: "provider-free rendered client",
			passed: [
				"compact-profile-rows",
				"account-profile-toggle",
				"persisted-grouping",
				"svg-rail-collapse",
				"dormant-profile-wake",
				"no-redundant-top-navigation",
				"rail-browser-close-and-wake",
				"native-full-toolbar",
				"shared-primary-pointer-cycle",
				"shared-document-keyboard",
				"shared-mobile-text-editing",
				"shared-clipboard-audio-controls",
				"native-mode-coordination",
				"status-replay-handshake",
				"native-observe-embed",
				"constructor-desktop-observe",
				"refused-take-clears-only-unowned-claim",
				"explicit-control",
				"retained-control-reload",
				"failed-release-retains-claim",
				"explicit-release-to-observe",
				"two-desktop-navigation",
				"durable-selection-reload",
				"empty-state",
				"unavailable-state",
				"independent-root-link",
			],
			pageErrors: errors,
			installedDesktopAcceptance: false,
		}),
	);
	}
} finally {
	await browser?.close();
	await server.close();
	setAuracallHomeDirOverrideForTest(null);
	await fs.rm(home, { recursive: true, force: true });
	const processList = await promisify(execFile)("ps", ["-eo", "pid,args"]);
	const remaining = browserProfileArgument
		? processList.stdout
				.split("\n")
				.filter((line) => line.includes(browserProfileArgument as string))
		: [];
	assert.equal(remaining.length, 0, "The smoke browser left an owned process running.");
	console.log(JSON.stringify({ freshOsReadback: true, remainingOwnedProcesses: remaining.length }));
}
