import { beforeEach, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => ({
	ready: vi.fn(),
	command: vi.fn(),
	disconnect: vi.fn(),
	stat: vi.fn(),
	connect: vi.fn(),
}));
vi.mock("../../src/browser/service/nativeDesktopClient.js", () => ({
	readyNativeDesktopBrowsers: fixture.ready,
	nativeDesktopObserveView: vi.fn(),
}));
vi.mock("../../src/browser/cdp.js", () => ({ default: fixture.connect }));
vi.mock("node:fs/promises", () => ({ default: { readFile: fixture.stat } }));

import { closeDesktopBrowser } from "../../src/browser/service/desktopClient.js";

const input = {
	remoteView: {
		defaultDesktop: "research",
 application: {origin: "http://127.0.0.1:8090", publicOrigin: "https://remote-view.example.test", appOrigin: "https://auracall.example.test", name: "auracall"},
		desktops: {
			research: {
				label: "Research",
				origin: "https://remote-view.example.test",
				application: "auracall",
				poolName: "auracall",
			},
		},
	},
	name: "research",
	browserId: "owned",
};
beforeEach(() => {
	vi.clearAllMocks();
	fixture.ready.mockResolvedValue([
		{ browserId: "owned", pid: 1234, processStart: "birth", cdpHost: "127.0.0.1", cdpPort: 9222 },
	]);
	fixture.connect.mockResolvedValue({
		Browser: { close: fixture.command },
		close: fixture.disconnect,
	});
	fixture.command.mockResolvedValue(undefined);
	fixture.disconnect.mockResolvedValue(undefined);
	fixture.stat.mockRejectedValue(Object.assign(new Error("gone"), { code: "ENOENT" }));
});
test("close targets the verified native browser and confirms process exit without removing desktop or managed data", async () => {
	await expect(closeDesktopBrowser(input)).resolves.toEqual({ state: "closed" });
	expect(fixture.connect).toHaveBeenCalledWith({ host: "127.0.0.1", port: 9222 });
	expect(fixture.command).toHaveBeenCalledOnce();
	expect(fixture.stat).toHaveBeenCalledWith("/proc/1234/stat", "utf8");
	expect(fixture.disconnect).toHaveBeenCalledOnce();
});
test("foreign or stale browser IDs are refused before any command", async () => {
	fixture.ready.mockResolvedValue([]);
	await expect(closeDesktopBrowser(input)).rejects.toThrow("owned browser");
	expect(fixture.connect).not.toHaveBeenCalled();
});
test("guard refusal with a still-live original process cannot report closed", async () => {
	fixture.command.mockRejectedValue(new Error("Desktop control is busy"));
	fixture.stat.mockResolvedValue("1234 (chrome) " + [...Array(19).fill("0"), "birth"].join(" "));
	await expect(closeDesktopBrowser(input)).rejects.toThrow("not confirmed");
	expect(fixture.disconnect).toHaveBeenCalledOnce();
});
test("a transport disconnect reconciles a proven exited process without repeating the command", async () => {
	fixture.command.mockRejectedValue(new Error("WebSocket closed"));
	await expect(closeDesktopBrowser(input)).resolves.toEqual({ state: "closed" });
	expect(fixture.command).toHaveBeenCalledOnce();
});
