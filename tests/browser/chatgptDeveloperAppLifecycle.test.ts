// biome-ignore-all lint/style/useNamingConvention: CDP domain names are protocol-defined.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertProviderSessionAuthorization } from "../../src/browser/providers/providerSessionAuthority.js";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";
import { runBrowserMode } from "../../src/browser/index.js";
import { submitChatgptDeveloperApp } from "../../src/browser/chatgptDeveloperAppSubmission.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import { resolveBrowserLaunchPlan } from "../../src/browser/service/browserLaunchPlan.js";
import { readChromePid } from "../../src/browser/profileState.js";
import { WINDOWS_LOOPBACK_REMOTE_HOST } from "../../packages/browser-service/src/windowsLoopbackRelay.js";

const fixture = vi.hoisted(() => ({
	connect: vi.fn(),
	submit: vi.fn(),
	wait: vi.fn(),
	snapshot: vi.fn(),
	select: vi.fn(),
	assertSelected: vi.fn(),
	forbiddenLaunch: vi.fn(),
	closeTarget: vi.fn(),
	localConnect: vi.fn(),
	localReuse: vi.fn(),
	localOpen: vi.fn(),
}));
vi.mock("../../src/browser/providers/providerSessionAuthority.js", async (original) => {
	const actual = await original<typeof import("../../src/browser/providers/providerSessionAuthority.js")>();
	return { ...actual, assertProviderSessionAuthorization: vi.fn(actual.assertProviderSessionAuthorization) };
});
// Transport is hermetic and fail-closed: no real browser connector/launcher can run.
vi.mock("../../src/browser/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../src/browser/chromeLifecycle.js")>()),
	connectToRemoteChrome: fixture.connect,
	closeRemoteChromeTarget: fixture.closeTarget,
	launchChrome: fixture.forbiddenLaunch,
	reuseRunningChromeProfile: fixture.localReuse,
	connectToChrome: fixture.forbiddenLaunch,
	connectToChromeTarget: fixture.localConnect,
	openChromeTarget: fixture.localOpen,
	registerTerminationHooks: vi.fn(() => () => {}),
}));
vi.mock("../../src/browser/pageActions.js", async (original) => ({
	...(await original<typeof import("../../src/browser/pageActions.js")>()),
	navigateToChatGPT: vi.fn(),
	ensureNotBlocked: vi.fn(),
	ensureLoggedIn: vi.fn(),
	ensurePromptReady: vi.fn(),
	ensureModelSelection: vi.fn(async () => "Current model"),
	installJavaScriptDialogAutoDismissal: vi.fn(() => () => {}),
	submitPrompt: fixture.submit,
	waitForAssistantResponse: fixture.wait,
	readAssistantSnapshot: fixture.snapshot,
	captureAssistantMarkdown: vi.fn(async () => "App terminal answer"),
}));
vi.mock("../../src/browser/actions/chatgptComposerMode.js", async (original) => ({
	...(await original<typeof import("../../src/browser/actions/chatgptComposerMode.js")>()),
	ensureChatgptComposerMode: vi.fn(),
}));
vi.mock("../../src/browser/actions/chatgptEcosystemMention.js", async (original) => ({
	...(await original<typeof import("../../src/browser/actions/chatgptEcosystemMention.js")>()),
	ensureChatgptEcosystemMention: fixture.select,
	assertChatgptEcosystemMentionSelected: fixture.assertSelected,
}));
vi.mock("../../src/browser/service/ui.js", async (original) => ({
	...(await original<typeof import("../../src/browser/service/ui.js")>()),
	dismissOpenMenus: vi.fn(async () => false),
}));
vi.mock("../../src/browser/chatgptRateLimitGuard.js", async (original) => ({
	...(await original<typeof import("../../src/browser/chatgptRateLimitGuard.js")>()),
	readChatgptRateLimitGuardState: vi.fn(async () => null),
	writeChatgptRateLimitGuardState: vi.fn(),
}));
vi.mock("../../src/browser/profileState.js", async (original) => ({
	...(await original<typeof import("../../src/browser/profileState.js")>()),
	readChromePid: vi.fn(async () => 1234),
	writeDevToolsActivePort: vi.fn(async () => {}),
	writeChromePid: vi.fn(async () => {}),
}));
vi.mock("../../src/browser/profileStore.js", async (original) => ({
	...(await original<typeof import("../../src/browser/profileStore.js")>()),
	bootstrapManagedProfile: vi.fn(async () => ({ cloned: false })),
	findBrowserCookieFile: vi.fn(() => null),
}));
vi.mock("../../src/browser/processCheck.js", async (original) => ({
	...(await original<typeof import("../../src/browser/processCheck.js")>()),
	isChromeAlive: vi.fn(async () => true),
}));

vi.mock("../../src/browser/tabConcurrencyRuntime.js", async (original) => {
	const actual = await original<typeof import("../../src/browser/tabConcurrencyRuntime.js")>();
	const { createInMemoryBrowserTabLeaseRegistry } = await import(
		"../../packages/browser-service/src/service/tabLeaseRegistry.js"
	);
	const { createInMemoryProviderInteractionLedger } = await import(
		"../../packages/browser-service/src/service/interactionLedger.js"
	);
	return {
		...actual,
		createBrowserTabConcurrencyRuntime: () => ({
			mode: "tab-affinity",
			enabled: true,
			storageRoot: null,
			registry: createInMemoryBrowserTabLeaseRegistry(),
			ledger: createInMemoryProviderInteractionLedger(),
			readStatus: vi.fn(),
		}),
	};
});
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	openChromeTarget: fixture.localOpen,
	listChromeTargets: vi.fn(async () => []),
	closeRemoteChromeTarget: fixture.closeTarget,
}));

const app = { name: "Fixture App", pluginId: "plugin_fixture", appIds: ["fixture"] };
const config = {
	auracallProfile: "fixture",
	profiles: {
		fixture: {
			browserProfile: "fixture",
			services: { chatgpt: { identity: { email: "fixture@example.com" } } },
		},
	},
	browser: {
		remoteChrome: { host: "127.0.0.1", port: 12345 },
		composerTool: "old-tool",
		projectId: "old-project",
		conversationId: "old-chat",
	},
	services: { chatgpt: { identity: { email: "fixture@example.com" } } },
};

function setup(
	options: {
		uncertainSend?: boolean;
		terminalFailure?: boolean;
		manualApproval?: boolean;
		wrongIdentity?: boolean;
		lateTerminalUrl?: boolean;
	} = {},
) {
	let submitted = false;
	let terminalObserved = false;
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
		if (expression === "location.href")
			return {
				result: {
					value: submitted && (!options.lateTerminalUrl || terminalObserved) ? "https://chatgpt.com/c/fixture-conversation" : "https://chatgpt.com/",
				},
			};
		if (expression.startsWith("document.querySelectorAll("))
			return { result: { value: submitted ? 1 : 0 } };
		if (expression.includes("/api/auth/session"))
			return {
				result: {
					value: {
						user: { email: options.wrongIdentity ? "other@example.com" : "fixture@example.com" },
					},
				},
			};
		if (expression.includes("approval-required"))
			return {
				result: {
					value: options.manualApproval
						? {
								status: "approval-required",
								fingerprint: "fixture-approval",
								surfaceKind: "tool",
								actionLabel: "Allow once",
								x: 1,
								y: 1,
							}
						: { status: "none" },
				},
			};
		return { result: { value: null } };
	});
	const client = {
		Runtime: { enable: vi.fn(), evaluate },
		Page: { enable: vi.fn() },
		Network: { enable: vi.fn() },
		Input: {},
		on: vi.fn(),
		close: vi.fn(),
	};
	fixture.connect.mockResolvedValue({
		client,
		targetId: "fixture-target",
		host: "127.0.0.1",
		port: 12345,
	});
	fixture.submit.mockImplementation(async (deps) => {
		await deps.beforeSend();
		submitted = true;
		if (options.uncertainSend) throw new Error("send acknowledgement lost");
		await deps.onPromptDispatched();
		return 1;
	});
	fixture.snapshot.mockImplementation(async () =>
		submitted ? { text: "App terminal answer", messageId: "answer-1" } : null,
	);
	fixture.wait.mockImplementation(async (_runtime, _timeout, _logger, _boundary, callbacks) => {
		try {
			await callbacks.onPassiveDomProbe(); // Real P45 handler, not an app-local watcher.
		} catch (error) {
			terminalObserved = true;
			throw error;
		}
		terminalObserved = true;
		if (options.terminalFailure) throw new Error("terminal provider failure");
		return { text: "App terminal answer", meta: { messageId: "answer-1" } };
	});
	const adapter = createChatgptDeveloperAppBrowserAdapter(
		{ userConfig: config } as never,
		vi.fn(),
		{ browserOperationOwned: true },
	);
	return { adapter, client };
}

beforeEach(() => {
	vi.resetAllMocks();
	fixture.forbiddenLaunch.mockImplementation(() => {
		throw new Error("TEST SAFETY: real/local browser launch forbidden");
	});
	for (const mock of [fixture.localConnect, fixture.localReuse, fixture.localOpen]) {
		mock.mockImplementation(fixture.forbiddenLaunch);
	}
});

describe("developer app to real shared local lifecycle", () => {
	it.each([{ terminalFailure: true }, { manualApproval: true }])("refreshes a late terminal conversation before returning committed-Send failure: %j", async (failure) => {
		const { client } = setup({ ...failure, lateTerminalUrl: true });
		fixture.localReuse.mockResolvedValue({ pid: 1234, port: 12345, kill: vi.fn() });
		fixture.localOpen.mockResolvedValue({ id: "fixture-target", url: "https://chatgpt.com/" });
		fixture.localConnect.mockResolvedValue(client);
		const localConfig = { ...config, model: "current", browser: { ...config.browser, remoteChrome: null, debugPort: 12345, keepBrowser: true, cookieSync: false } };
		const adapter = createChatgptDeveloperAppBrowserAdapter({ userConfig: localConfig } as never, vi.fn(), { browserOperationOwned: true });
		const result = await adapter.submitTest(app, "Use the app to answer.");
		expect(result, result.message).toMatchObject({ status: "failed", conversationId: "fixture-conversation", terminalUrl: "https://chatgpt.com/c/fixture-conversation", effectState: "effect_observed", retrySafe: false });
		expect(fixture.submit).toHaveBeenCalledTimes(1);
		expect(fixture.connect).not.toHaveBeenCalled();
		expect(fixture.forbiddenLaunch).not.toHaveBeenCalled();
	});
});

describe("developer app to real shared remote lifecycle", () => {
	it.each([
		{ browserProcessId: 1234, wrongIdentity: false, originalConfig: false, completed: true },
		{ browserProcessId: 1234, wrongIdentity: false, originalConfig: true, completed: true },
		{ browserProcessId: null, wrongIdentity: false, originalConfig: false, completed: false },
		{ browserProcessId: 1234, wrongIdentity: true, originalConfig: false, completed: false },
	])("carries managed browser provenance through affinity without a legacy PID file: %j", async (scenario) => {
		setup({ wrongIdentity: scenario.wrongIdentity });
		const minimalConfig = {
			auracallProfile: "fixture",
			model: "current",
			services: config.services,
			browser: {
				tabConcurrencyMode: "tab-affinity" as const,
				remoteChrome: { host: "127.0.0.1", port: 12345 },
			},
		};
		const affinityConfig = scenario.originalConfig
			? {
					...config,
					model: "current",
					browser: { ...config.browser, tabConcurrencyMode: "tab-affinity" as const },
				}
			: minimalConfig;
		const plan = resolveBrowserLaunchPlan({
			source: { kind: "user-config", config: affinityConfig as never },
			intent: { provider: "chatgpt" },
		});
		const resolveTarget = vi
			.spyOn(BrowserService.prototype, "resolveServiceTarget")
			.mockResolvedValue({
				host: "127.0.0.1",
				port: 12345,
				managedBrowserProfile: plan.managedBrowserProfile.directory,
				browserProcessId: scenario.browserProcessId,
			} as never);
		fixture.localOpen.mockResolvedValue({ id: "fixture-target", url: "https://chatgpt.com/" });
		vi.mocked(readChromePid).mockResolvedValue(null);
		try {
			const result = await submitChatgptDeveloperApp(affinityConfig as never, app, "Use app", {
				browserOperationOwned: true,
			});
			expect(result, result.message).toMatchObject({
				status: scenario.completed ? "completed" : "failed",
				effectState: scenario.completed ? "effect_observed" : "pre_effect",
			});
			expect(fixture.submit).toHaveBeenCalledTimes(scenario.completed ? 1 : 0);
			if (scenario.completed) {
				expect(readChromePid).not.toHaveBeenCalled();
				expect(assertProviderSessionAuthorization).toHaveBeenCalledWith(expect.anything(), expect.anything(), { browserProcessId: 1234, browserTargetId: "fixture-target" });
			} else {
				expect(result.message).toContain(scenario.wrongIdentity ? "provider_session_dimension_conflict" : "provider_session_provenance_missing");
			}
		} finally {
			resolveTarget.mockRestore();
		}
	});

	it("preserves attributable WSL Windows loopback provenance through the canonical host alias", async () => {
		setup();
		const windowsConfig = { ...config, model: "current", browser: { ...config.browser, remoteChrome: { host: WINDOWS_LOOPBACK_REMOTE_HOST, port: 12345 } } };
		expect(await submitChatgptDeveloperApp(windowsConfig, app, "Use app", { browserOperationOwned: true })).toMatchObject({ status: "completed", effectState: "effect_observed", conversationId: "fixture-conversation" });
		expect(assertProviderSessionAuthorization).toHaveBeenCalledWith(expect.anything(), expect.anything(), { browserProcessId: 1234, browserTargetId: "fixture-target" });
		expect(fixture.submit).toHaveBeenCalledTimes(1);
	});
	it("fails closed without a matching managed process and never authorizes arbitrary remote hosts from a local PID", async () => {
		const { adapter } = setup();
		vi.mocked(readChromePid).mockResolvedValueOnce(null);
		expect(await adapter.submitTest(app, "Use app")).toMatchObject({
			status: "failed",
			effectState: "pre_effect",
		});
		vi.mocked(readChromePid).mockResolvedValue(1234).mockClear();
		const remoteConfig = {
			...config,
			browser: { ...config.browser, remoteChrome: { host: "remote.invalid", port: 12345 } },
		};
		expect(
			await submitChatgptDeveloperApp(remoteConfig as never, app, "Use app", {
				browserOperationOwned: true,
			}),
		).toMatchObject({ status: "failed", effectState: "pre_effect" });
		expect(fixture.submit).not.toHaveBeenCalled();
		expect(readChromePid).not.toHaveBeenCalled();
	});
	it("returns answer and refreshed terminal identity after exactly one Send", async () => {
		const { adapter } = setup();
		const result = await adapter.submitTest(app, "Use the app to answer.");
		expect(result, result.message).toMatchObject({
			status: "completed",
			answerText: "App terminal answer",
			conversationId: "fixture-conversation",
			terminalUrl: "https://chatgpt.com/c/fixture-conversation",
			effectState: "effect_observed",
			retrySafe: false,
		});
		expect(fixture.submit).toHaveBeenCalledTimes(1);
		expect(fixture.select).toHaveBeenCalledWith(expect.anything(), {
			label: app.name,
			acceptedPluginIds: ["plugin_fixture", "fixture"],
		});
		expect(fixture.assertSelected).toHaveBeenCalledTimes(1);
		expect(fixture.forbiddenLaunch).not.toHaveBeenCalled();
		expect(assertProviderSessionAuthorization).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: "fixture@example.com" }), { browserProcessId: 1234, browserTargetId: "fixture-target" });
	});
	it.each([
		{ terminalFailure: true, effectState: "effect_observed" },
		{ uncertainSend: true, effectState: "unknown" },
		{ manualApproval: true, effectState: "effect_observed" },
	])("preserves terminal failure evidence without retry: %j", async ({
		effectState,
		...options
	}) => {
		const { adapter } = setup(options);
		const result = await adapter.submitTest(app, "Use the app to answer.");
		expect(result).toMatchObject({
			status: "failed",
			effectState,
			retrySafe: false,
			conversationId: "fixture-conversation",
			terminalUrl: "https://chatgpt.com/c/fixture-conversation",
		});
		expect(fixture.submit).toHaveBeenCalledTimes(1);
	});
	it("does not send after selection changes or account preflight fails", async () => {
		const { adapter } = setup();
		fixture.assertSelected.mockRejectedValueOnce(new Error("selection changed"));
		expect(await adapter.submitTest(app, "Use app")).toMatchObject({
			status: "failed",
			effectState: "pre_effect",
			retrySafe: true,
		});
		expect(fixture.wait).not.toHaveBeenCalled();
		fixture.submit.mockClear();
		const wrong = setup({ wrongIdentity: true });
		expect(await wrong.adapter.submitTest(app, "Use app")).toMatchObject({
			status: "failed",
			effectState: "pre_effect",
		});
		expect(fixture.submit).not.toHaveBeenCalled();
	});
});

describe("bounded submission contract", () => {
	it("preserves full selected runtime configuration at affinity admission without provider effects", async () => {
		const selectedConfig = {
			...config,
			defaultRuntimeProfile: "other",
			profiles: {
				...config.profiles,
				other: { browserProfile: "other", services: { chatgpt: { identity: { email: "other@example.com" } } } },
			},
			model: "current",
			browser: { ...config.browser, tabConcurrencyMode: "tab-affinity" as const },
		};
		const runBrowser = vi.fn(async (options) => {
			expect(options.tabAffinityUserConfig).toBe(selectedConfig);
			expect(options.tabAffinityUserConfig.auracallProfile).toBe("fixture");
			expect(options.tabAffinityUserConfig.profiles.fixture.services.chatgpt.identity.email).toBe("fixture@example.com");
			throw new BrowserAutomationError("Fixture affinity admission stopped before transport", { effectState: "pre_effect" });
		});
		const outcome = await submitChatgptDeveloperApp(selectedConfig as never, app, "Fixture prompt", { runBrowser });
		expect(outcome).toMatchObject({ status: "failed", message: "Fixture affinity admission stopped before transport", effectState: "pre_effect", retrySafe: true, conversationId: null });
		expect(runBrowser).toHaveBeenCalledTimes(1);
		expect(fixture.submit).not.toHaveBeenCalled();
		expect(fixture.forbiddenLaunch).not.toHaveBeenCalled();
	});

	it("preserves the selected AuraCall runtime profile across the shared submit lifecycle", async () => {
		const runBrowser = vi.fn(async () => ({ answerText: "answer" }) as never);
		await submitChatgptDeveloperApp(config as never, { ...app, description: "Installed fixture description" }, "Use app", { runBrowser });
		expect(runBrowser).toHaveBeenCalledWith(
			expect.objectContaining({
				ecosystemMention: expect.objectContaining({ description: "Installed fixture description" }),
				config: expect.objectContaining({
					auracallProfileName: "fixture",
					manualLoginProfileDir: expect.stringContaining("/browser-profiles/fixture/chatgpt"),
				}),
			}),
		);
	});
	it("upgrades unknown to structured observed effect without retry", async () => {
		const runBrowser = vi.fn(async (options) => {
			options.onProviderEffectState("unknown");
			throw new BrowserAutomationError("observed failure", { effectState: "effect_observed" });
		});
		expect(await submitChatgptDeveloperApp({model: "current", browser: {}}, app, "Use app", { runBrowser })).toMatchObject({
			status: "failed",
			effectState: "effect_observed",
			retrySafe: false,
		});
		expect(runBrowser).toHaveBeenCalledTimes(1);
	});
	it("forces per-run Chat/current and removes inherited Work/composer settings", async () => {
		const runBrowser = vi.fn(async () => ({ answerText: "answer" }) as never);
		await submitChatgptDeveloperApp(
			{ model: "current", browser: { chatgptMode: "work", composerTool: "other" } },
			app,
			"Use app",
			{ runBrowser },
		);
		expect(runBrowser).toHaveBeenCalledWith(
			expect.objectContaining({
				skipBrowserExecutionOperation: false,
				tabAffinityUserConfig: undefined,
				config: expect.objectContaining({
					chatgptMode: "chat",
					modelStrategy: "current",
					composerTool: null,
				}),
			}),
		);
	});
	it.each([
		{ attachments: [{ path: "/unused", displayPath: "unused" }] },
		{ fallbackSubmission: { prompt: "retry", attachments: [] } },
		{ config: { composerTool: "other" } },
		{ config: { projectId: "project" } },
		{ config: { conversationId: "conversation" } },
		{ config: { chatgptMode: "work" } },
	])("rejects unsupported high-level input before transport: %j", async (extra) => {
		await expect(
			runBrowserMode({
				prompt: "Use app",
				ecosystemMention: { label: app.name, acceptedPluginIds: app.appIds },
				...extra,
				config: { remoteChrome: { host: "hermetic.invalid", port: 12345 }, ...extra.config },
			} as never),
		).rejects.toMatchObject({ details: { effectState: "pre_effect" } });
		expect(fixture.connect).not.toHaveBeenCalled();
	});
});
