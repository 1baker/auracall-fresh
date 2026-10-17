import { expect, test, vi } from "vitest";
import { DEFAULT_BROWSER_CONFIG } from "../../src/browser/config.js";
const mocks = vi.hoisted(() => ({ native: vi.fn(), generic: vi.fn() }));
vi.mock("../../src/browser/service/nativeDesktopRuntime.js", () => ({
	launchNativeDesktopBrowser: mocks.native,
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	launchChrome: mocks.generic,
}));
vi.mock("../../packages/browser-service/src/processCheck.js", () => ({
	isDevToolsResponsive: vi.fn(async () => true),
}));
vi.mock("../../packages/browser-service/src/profileState.js", () => ({
	writeChromePid: vi.fn(),
	writeDevToolsActivePort: vi.fn(),
}));
import { launchManualLoginSession } from "../../src/browser/manualLogin.js";
test("manual login uses the native desktop launcher selected by its browser launch plan", async () => {
	const nativeDesktop = {
		desktopName: "research",
		poolName: "main",
		application: "auracall",
		origin: "http://127.0.0.1:9999",
		publicOrigin: "https://desktop.example.test",
		appOrigin: "https://aura.example.test",
	};
	const handle = { pid: 1234, port: 45015, host: "127.0.0.1", kill: vi.fn(async () => undefined) };
	mocks.native.mockResolvedValue(handle);
	const config = {
		...DEFAULT_BROWSER_CONFIG,
		chromePath: "/opt/chrome/chrome",
		remoteViewDesktop: nativeDesktop,
	};
	const result = await launchManualLoginSession({
		chromePath: "/opt/chrome/chrome",
		profileName: "Default",
		userDataDir: "/tmp/native-login-test",
		url: "about:blank",
		logger: () => undefined,
		debugPortStrategy: "auto",
		browserConfig: config,
	});
	expect(result).toMatchObject({ chrome: { pid: 1234 }, port: 45015 });
	expect(mocks.native).toHaveBeenCalledWith(
		expect.objectContaining({
			userDataDir: "/tmp/native-login-test",
			config: expect.objectContaining({ remoteViewDesktop: nativeDesktop }),
		}),
	);
	expect(mocks.generic).not.toHaveBeenCalled();
});

test("a native ownership failure cannot fall back to an untracked generic browser", async () => {
	mocks.generic.mockClear();
	mocks.native.mockRejectedValueOnce(new Error("native ownership mismatch"));
	await expect(
		launchManualLoginSession({
			chromePath: "/opt/chrome/chrome",
			profileName: "Default",
			userDataDir: "/tmp/native-login-test",
			url: "about:blank",
			logger: () => undefined,
			debugPortStrategy: "auto",
			browserConfig: {
				...DEFAULT_BROWSER_CONFIG,
				remoteViewDesktop: {
					desktopName: "research",
					poolName: "main",
					application: "auracall",
					origin: "http://127.0.0.1:9999",
					publicOrigin: "https://desktop.example.test",
					appOrigin: "https://aura.example.test",
				},
			},
		}),
	).rejects.toThrow("native ownership mismatch");
	expect(mocks.generic).not.toHaveBeenCalled();
});
