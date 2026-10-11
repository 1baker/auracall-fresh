import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, test, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.exitCode = 0;
	vi.resetModules();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
});

function createExecFileMock() {
	return vi.fn(
		(
			_file: string,
			_args: string[],
			options: unknown,
			callback?: (...cbArgs: unknown[]) => void,
		) => {
			const cb = typeof options === "function" ? options : callback;
			cb?.(null, { stdout: "", stderr: "" });
			return {} as never;
		},
	);
}

async function importChromeLifecycleWithMocks(options: {
	registeredPid?: number | null;
	onLaunch?: () => void;
	existingProcess?: { pid: number; port: number; commandLine: string } | null;
}) {
	const execFileMock = createExecFileMock();
	const unregisterInstance = vi.fn(async (..._args: unknown[]) => {});
	const unregisterInstanceIfMatches = vi.fn(async (..._args: unknown[]) => true);
	const registerInstance = vi.fn(async (_registryOptions: unknown, _instance: unknown) => {});
	const chromeProcess = new EventEmitter();
	const findActiveInstance = vi.fn(async () => {
		if (!options.registeredPid) {
			return null;
		}
		return {
			pid: options.registeredPid,
			port: 45891,
			host: "127.0.0.1",
			profilePath: "/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok",
			profileName: "Default",
			type: "chrome" as const,
			launchedAt: new Date().toISOString(),
			lastSeenAt: new Date().toISOString(),
		};
	});
	const findChromeProcessUsingUserDataDir = vi.fn(async () => options.existingProcess ?? null);
	const isDevToolsResponsive = vi.fn(async () => true);
	const ensureDetachedWindowsLoopbackRelay = vi.fn(
		async (_port: number, _logger: unknown, relayOptions?: { listenPort?: number }) => ({
			host: "127.0.0.1",
			port: relayOptions?.listenPort ?? 45891,
		}),
	);

	vi.doMock("node:child_process", () => ({
		execFile: execFileMock,
	}));
	vi.doMock("chrome-launcher", () => ({
		Launcher: class {
			pid = 44567;
			port = 9222;
			chromeProcess = chromeProcess;
			remoteDebuggingPipes = undefined;
			spawn() {}
			async launch() {
				options.onLaunch?.();
			}
			async kill() {}
		},
	}));
	vi.doMock("../../packages/browser-service/src/service/stateRegistry.js", () => ({
		findActiveInstance,
		registerInstance,
		unregisterInstance,
		unregisterInstanceIfMatches,
	}));
	vi.doMock("../../packages/browser-service/src/processCheck.js", () => ({
		isDevToolsResponsive,
		findChromePidUsingUserDataDir: vi.fn(async () => options.existingProcess?.pid ?? null),
		findChromeProcessUsingUserDataDir,
		findResponsiveWindowsDevToolsPortForUserDataDir: vi.fn(
			async () => options.existingProcess?.port ?? null,
		),
		isChromeAlive: vi.fn(async () => true),
		probeWindowsLocalDevToolsPort: vi.fn(async () => true),
		isProcessAlive: vi.fn(() => false),
		verifyChromeProcessAbsent: vi.fn(async () => true),
	}));
	vi.doMock("../../packages/browser-service/src/windowsLoopbackRelay.js", () => ({
		ensureDetachedWindowsLoopbackRelay,
		isWindowsLoopbackRemoteHost: vi.fn((host: string) => host === "windows-loopback"),
		resolveChromeEndpoint: vi.fn(async (host: string, port: number) => ({ host, port })),
		resolveWindowsPowerShellPath: vi.fn(
			() => "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
		),
		WINDOWS_LOOPBACK_REMOTE_HOST: "windows-loopback",
	}));

	const chromeLifecycle = await import("../../packages/browser-service/src/chromeLifecycle.js");
	return {
		chromeLifecycle,
		execFileMock,
		unregisterInstance,
		unregisterInstanceIfMatches,
		registerInstance,
		chromeProcess,
		findActiveInstance,
		findChromeProcessUsingUserDataDir,
		isDevToolsResponsive,
		ensureDetachedWindowsLoopbackRelay,
	};
}

describe("chromeLifecycle ownership", () => {
	test("persists owned shutdown and exit attribution for the same browser generation", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "chrome-exit-attribution-"));
		try {
			const registryPath = path.join(root, "registry.json");
			const { chromeLifecycle, chromeProcess } = await importChromeLifecycleWithMocks({});
			const chrome = await chromeLifecycle.launchChrome(
				{ chromeProfile: "Default" } as never,
				path.join(root, "managed"), () => undefined, { registryPath },
			);
			await chrome.kill();
			chromeProcess.emit("exit", null, "SIGTERM");
			const events = (await readFile(`${registryPath}.lifecycle.jsonl`, "utf8"))
				.trim().split("\n").map(line => JSON.parse(line));
			expect(events.map(event => event.event)).toEqual([
				"owned-browser-launched", "owned-shutdown-requested", "owned-shutdown-returned", "owned-child-exit",
			]);
			expect(events[3]).toMatchObject({ pid: 44567, exitCode: null, exitSignal: "SIGTERM", ownerPid: process.pid });
			expect(events[0].launchedAt).toBe(events[3].launchedAt);
			expect(events[0].profileFingerprint).toBe(events[3].profileFingerprint);
			expect(events[0].profileFingerprint).toMatch(/^[a-f0-9]{64}$/);
			expect(events[0]).not.toHaveProperty("profilePath");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	test("keeps owned shutdown working when durable observations cannot be written", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "chrome-attribution-failure-"));
		try {
			const messages: string[] = [];
			const { chromeLifecycle, unregisterInstanceIfMatches } = await importChromeLifecycleWithMocks({});
			const chrome = await chromeLifecycle.launchChrome(
				{ chromeProfile: "Default" } as never, path.join(root, "managed"),
				message => messages.push(message), { registryPath: path.join(root, "absent", "registry.json") },
			);
			await expect(chrome.kill()).resolves.toBeUndefined();
			expect(unregisterInstanceIfMatches).toHaveBeenCalledOnce();
			expect(messages).toContain("[browser-lifecycle] durable observation write failed");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	test.each([
		true,
		false,
	])("removes managed restore inputs before cold process launch; endpoint-only=%s", async (suppressStartupWindow) => {
		const root = await mkdtemp(path.join(os.tmpdir(), "browser-cold-session-"));
		const userDataDir = path.join(root, "managed", "chatgpt");
		const profileDir = path.join(userDataDir, "Default");
		try {
			await mkdir(path.join(profileDir, "Sessions"), { recursive: true });
			await writeFile(path.join(profileDir, "Sessions", "Session_1"), "restorable-tabs");
			await writeFile(path.join(profileDir, "Preferences"), "auth-settings");
			const onLaunch = vi.fn(() => {
				expect(existsSync(path.join(profileDir, "Sessions"))).toBe(false);
			});
			const { chromeLifecycle } = await importChromeLifecycleWithMocks({ onLaunch });
			const chrome = await chromeLifecycle.launchChrome(
				{
					chromePath: "/usr/bin/google-chrome",
					chromeProfile: "Default",
					manualLogin: true,
					managedProfileRoot: path.join(root, "managed"),
				} as never,
				userDataDir,
				() => undefined,
				{ suppressStartupWindow },
			);
			expect(onLaunch).toHaveBeenCalledOnce();
			expect(await readFile(path.join(profileDir, "Preferences"), "utf8")).toBe("auth-settings");
			await chrome.kill();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("keeps shutdown ownership when reusing a registry instance started by the current run", async () => {
		process.env.WSL_DISTRO_NAME = "Ubuntu";
		const { chromeLifecycle, execFileMock, unregisterInstanceIfMatches } =
			await importChromeLifecycleWithMocks({
				registeredPid: 41234,
			});

		const chrome = await chromeLifecycle.launchChrome(
			{
				chromePath: "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
				chromeProfile: "Default",
			} as never,
			"/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok",
			() => undefined,
			{
				registryPath: "/tmp/auracall-browser-state.json",
				ownedPids: new Set([41234]),
			},
		);

		expect(chrome.pid).toBe(41234);
		await chrome.kill();
		expect(unregisterInstanceIfMatches).toHaveBeenCalledWith(
			{ registryPath: "/tmp/auracall-browser-state.json" },
			"/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok",
			"Default",
			{
				pid: 41234,
				port: 45891,
				launchedAt: expect.any(String),
			},
		);
		expect(execFileMock).toHaveBeenCalledWith(
			"/mnt/c/Windows/System32/taskkill.exe",
			["/PID", "41234", "/T", "/F"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	test("keeps shutdown ownership when re-adopting a live process started by the current run", async () => {
		process.env.WSL_DISTRO_NAME = "Ubuntu";
		const messages: string[] = [];
		const userDataDir =
			"/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/test/ownership-grok";
		const { chromeLifecycle, execFileMock, registerInstance } =
			await importChromeLifecycleWithMocks({
				registeredPid: null,
				existingProcess: {
					pid: 42345,
					port: 45891,
					commandLine:
						'"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
						"--remote-debugging-port=45891 " +
						"--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\test\\ownership-grok about:blank",
				},
			});

		const chrome = await chromeLifecycle.launchChrome(
			{
				chromePath: "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
				chromeProfile: "Default",
			} as never,
			userDataDir,
			(message) => messages.push(message),
			{
				registryPath: "/tmp/auracall-browser-state.json",
				ownedPids: new Set([99999]),
				ownedPorts: new Set([45891]),
			},
		);

		expect(chrome.pid, messages.join("\n")).toBe(42345);
		expect(registerInstance).toHaveBeenCalled();
		await chrome.kill();
		expect(execFileMock).toHaveBeenCalledWith(
			"/mnt/c/Windows/System32/taskkill.exe",
			["/PID", "42345", "/T", "/F"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	test("still skips shutdown for genuinely reused registry instances", async () => {
		process.env.WSL_DISTRO_NAME = "Ubuntu";
		const messages: string[] = [];
		const { chromeLifecycle, execFileMock } = await importChromeLifecycleWithMocks({
			registeredPid: 43456,
		});

		const chrome = await chromeLifecycle.launchChrome(
			{
				chromePath: "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
				chromeProfile: "Default",
			} as never,
			"/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok",
			(message) => messages.push(message),
			{
				registryPath: "/tmp/auracall-browser-state.json",
				ownedPids: new Set(),
			},
		);

		expect(chrome.pid).toBeUndefined();
		await chrome.kill();
		expect(messages).toContain("Skipping shutdown of reused Chrome instance.");
		expect(execFileMock).not.toHaveBeenCalled();
	});

	test("retires the matching registry generation when owned Chrome exits", async () => {
		const userDataDir = "/tmp/auracall-owned-chrome";
		const { chromeLifecycle, chromeProcess, registerInstance, unregisterInstanceIfMatches } =
			await importChromeLifecycleWithMocks({ registeredPid: null });

		await chromeLifecycle.launchChrome(
			{ chromeProfile: "Default" } as never,
			userDataDir,
			() => undefined,
			{ registryPath: "/tmp/auracall-browser-state.json" },
		);
		const registered = registerInstance.mock.calls[0]?.[1] as {
			pid: number;
			port: number;
			launchedAt: string;
		};

		chromeProcess.emit("exit", 0, null);
		await vi.waitFor(() => expect(unregisterInstanceIfMatches).toHaveBeenCalledTimes(1));
		expect(unregisterInstanceIfMatches).toHaveBeenCalledWith(
			{ registryPath: "/tmp/auracall-browser-state.json" },
			userDataDir,
			"Default",
			{
				pid: registered?.pid,
				port: registered?.port,
				launchedAt: registered?.launchedAt,
			},
		);
	});

	test("retires the matching owned generation during SIGTERM cleanup", async () => {
		const userDataDir = "/tmp/auracall-owned-chrome-sigterm";
		const { chromeLifecycle, registerInstance, unregisterInstanceIfMatches } =
			await importChromeLifecycleWithMocks({ registeredPid: null });
		const chrome = await chromeLifecycle.launchChrome(
			{ chromeProfile: "Default" } as never,
			userDataDir,
			() => undefined,
			{ registryPath: "/tmp/auracall-browser-state.json" },
		);
		const registered = registerInstance.mock.calls[0]?.[1] as {
			pid: number;
			port: number;
			launchedAt: string;
		};
		const removeHooks = chromeLifecycle.registerTerminationHooks(
			chrome,
			userDataDir,
			false,
			() => undefined,
		);

		process.emit("SIGTERM");
		await vi.waitFor(() => expect(unregisterInstanceIfMatches).toHaveBeenCalledTimes(1));
		removeHooks();

		expect(unregisterInstanceIfMatches).toHaveBeenCalledWith(
			{ registryPath: "/tmp/auracall-browser-state.json" },
			userDataDir,
			"Default",
			{
				pid: registered?.pid,
				port: registered?.port,
				launchedAt: registered?.launchedAt,
			},
		);
	});
});
