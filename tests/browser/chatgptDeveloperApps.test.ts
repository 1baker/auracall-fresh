import { describe, expect, it, vi } from "vitest";
import { normalizeChatgptInstalledAppProbesForTest } from "../../src/browser/providers/chatgptAdapter.js";
import {
	CHATGPT_DEVELOPER_APP_SERVER_URL_SELECTOR,
	chatgptDeveloperAppSelectionMatchesForTest,
	classifyChatgptDeveloperAppCreatePostconditionForTest,
	clearDeveloperAppComposerForTest,
	createChatgptDeveloperAppBrowserAdapter,
	deriveChatgptDeveloperAppState,
	isCompleteChatgptInstalledAppsPayloadForTest,
	markExactChatgptDeveloperAppDeleteMenuForTest,
	selectChatgptDeveloperAppConnectionModeForTest,
	summarizeChatgptDeveloperAppCreateSurfaceProbeForTest,
	waitForChatgptDeveloperAppSettingsForDeleteForTest,
} from "../../src/browser/providers/chatgptDeveloperApps.js";

describe("deriveChatgptDeveloperAppState", () => {
	it("cancels a stalled identity read before connecting to DevTools", async () => {
		const abortController = new AbortController();
		const getUserIdentity = vi.fn(
			(options: { abortSignal?: AbortSignal } = {}) =>
				new Promise<never>((_resolve, reject) => {
					options.abortSignal?.addEventListener(
						"abort",
						() => reject(options.abortSignal?.reason),
						{ once: true },
					);
				}),
		);
		const connectDevTools = vi.fn(async () => {
			throw new Error("should not connect");
		});
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity,
				connectDevTools,
			},
			async () => {
				throw new Error("should not create a browser");
			},
			{ abortSignal: abortController.signal },
		);

		const state = adapter.readState();
		abortController.abort(new Error("list deadline reached"));

		await expect(state).rejects.toThrow("list deadline reached");
		expect(getUserIdentity).toHaveBeenCalledWith({ abortSignal: abortController.signal });
		expect(connectDevTools).not.toHaveBeenCalled();
	});

	it("cancels a stalled DevTools attachment through the shared abort signal", async () => {
		const abortController = new AbortController();
		const connectDevTools = vi.fn(
			(options: { abortSignal?: AbortSignal } = {}) =>
				new Promise<never>((_resolve, reject) => {
					options.abortSignal?.addEventListener(
						"abort",
						() => reject(options.abortSignal?.reason),
						{ once: true },
					);
				}),
		);
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => null,
				connectDevTools,
			},
			async () => {
				throw new Error("should not create a browser");
			},
			{ abortSignal: abortController.signal },
		);

		const state = adapter.readState();
		await vi.waitFor(() => expect(connectDevTools).toHaveBeenCalledOnce());
		abortController.abort(new Error("list deadline reached"));

		await expect(
			Promise.race([
				state,
				new Promise<never>((_resolve, reject) =>
					setTimeout(() => reject(new Error("test guard elapsed")), 100),
				),
			]),
		).rejects.toThrow("list deadline reached");
		expect(connectDevTools).toHaveBeenCalledWith(
			expect.objectContaining({ abortSignal: abortController.signal }),
		);
	});

	it("bounds stalled Runtime enablement and closes the unpublished client", async () => {
		vi.useFakeTimers();
		try {
			const close = vi.fn(async () => undefined);
			const runtimeEnable = vi.fn(() => new Promise<never>(() => undefined));
			const pageEnable = vi.fn(async () => undefined);
			const adapter = createChatgptDeveloperAppBrowserAdapter(
				{
					userConfig: {} as never,
					getUserIdentity: async () => null,
					connectDevTools: async () => ({
						client: {
							// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
							Runtime: { enable: runtimeEnable },
							// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
							Page: { enable: pageEnable },
							close,
						} as never,
						port: 45015,
					}),
				},
				async () => {
					throw new Error("should not create a browser");
				},
			);

			const state = adapter.readState().then(
				() => null,
				(error: unknown) => error,
			);
			await vi.advanceTimersByTimeAsync(10_000);

			expect(await state).toEqual(
				expect.objectContaining({
					message:
						"DevTools attachment stage browserDevToolsRuntimeEnable timed out after 10000ms.",
				}),
			);
			expect(runtimeEnable).toHaveBeenCalledOnce();
			expect(pageEnable).not.toHaveBeenCalled();
			expect(close).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it("bounds stalled Page enablement and closes the unpublished client", async () => {
		vi.useFakeTimers();
		try {
			const close = vi.fn(async () => undefined);
			const pageEnable = vi.fn(() => new Promise<never>(() => undefined));
			const adapter = createChatgptDeveloperAppBrowserAdapter(
				{
					userConfig: {} as never,
					getUserIdentity: async () => null,
					connectDevTools: async () => ({
						client: {
							// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
							Runtime: { enable: vi.fn(async () => undefined) },
							// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
							Page: { enable: pageEnable },
							close,
						} as never,
						port: 45015,
					}),
				},
				async () => {
					throw new Error("should not create a browser");
				},
			);

			const state = adapter.readState().then(
				() => null,
				(error: unknown) => error,
			);
			await vi.advanceTimersByTimeAsync(10_000);

			expect(await state).toEqual(
				expect.objectContaining({
					message: "DevTools attachment stage browserDevToolsPageEnable timed out after 10000ms.",
				}),
			);
			expect(pageEnable).toHaveBeenCalledOnce();
			expect(close).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it("preserves the active model and routes submission through the exact app mention", async () => {
		const runBrowser = vi.fn(async () => ({
			answerText: "App answer",
			conversationId: "conversation-1",
			tabUrl: "https://chatgpt.com/c/conversation-1",
		}));
		const createBrowser = vi.fn();
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {
					browser: {
						desiredModel: "Instant",
						modelStrategy: "select",
					},
				},
			} as never,
			createBrowser as never,
			{ runBrowser: runBrowser as never, browserOperationOwned: true },
		);
		const app = {
			pluginId: "plugin_asdk_app_litscout",
			appIds: ["asdk_app_litscout"],
			name: "LitScout",
		};
		const result = await adapter.submitTest(app, "Use only LitScout.");
		expect(createBrowser).not.toHaveBeenCalled();
		expect(runBrowser).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			status: "completed",
			answerText: "App answer",
			conversationId: "conversation-1",
			effectState: "effect_observed",
			retrySafe: false,
		});
		expect(runBrowser).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Use only LitScout.",
				completionMode: "assistant_response",
				skipBrowserExecutionOperation: true,
				config: expect.objectContaining({
					timeoutMs: 120_000,
					modelStrategy: "current",
					composerTool: null,
					conversationId: null,
					projectId: null,
					url: "https://chatgpt.com/",
				}),
				ecosystemMention: {
					label: "LitScout",
					acceptedPluginIds: ["plugin_asdk_app_litscout", "asdk_app_litscout"],
				},
			}),
		);
	});

	it("does not claim an OAuth human gate when no app or fresh handoff exists", () => {
		expect(
			classifyChatgptDeveloperAppCreatePostconditionForTest({
				auth: "oauth",
				appName: "LitScout OA exact test",
				apps: [],
				inventoryComplete: true,
				preSubmitTargets: [
					{
						targetId: "chatgpt-apps",
						type: "page",
						url: "https://chatgpt.com/plugins",
					},
				],
				postSubmitTargets: [
					{
						targetId: "chatgpt-apps",
						type: "page",
						url: "https://chatgpt.com/plugins",
					},
				],
			}),
		).toEqual({
			status: "unconfirmed",
			app: null,
			handoffUrl: null,
		});
	});

	it("reports awaiting-human only for a fresh OAuth navigation target", () => {
		expect(
			classifyChatgptDeveloperAppCreatePostconditionForTest({
				auth: "oauth",
				appName: "LitScout OA exact test",
				apps: [],
				inventoryComplete: false,
				preSubmitTargets: [
					{
						targetId: "chatgpt-apps",
						type: "page",
						url: "https://chatgpt.com/plugins",
					},
				],
				postSubmitTargets: [
					{
						targetId: "chatgpt-apps",
						type: "page",
						url: "https://isolated-litscout.example.test/oauth/authorize",
					},
				],
			}),
		).toEqual({
			status: "awaiting-human",
			app: null,
			handoffUrl: "https://isolated-litscout.example.test/oauth/authorize",
		});
	});

	it("reports completion only for one exact app in fresh complete inventory", () => {
		const app = {
			pluginId: "plugin_asdk_app_litscout_oa",
			appIds: ["asdk_app_litscout_oa"],
			name: "LitScout OA exact test",
			status: "ENABLED",
			enabled: true,
			authStatus: null,
			reviewStatus: "development",
			authorization: "ON_INSTALL",
			endpoint: null,
			versionId: "1.0.0",
			scope: "USER",
			discoverability: "PRIVATE",
			creatorName: "Eric Cochran",
			description: "Disposable LitScout proof",
		};
		expect(
			classifyChatgptDeveloperAppCreatePostconditionForTest({
				auth: "oauth",
				appName: app.name,
				apps: [app],
				inventoryComplete: true,
				preSubmitTargets: [],
				postSubmitTargets: [],
			}),
		).toEqual({
			status: "completed",
			app,
			handoffUrl: null,
		});
	});

	it("preserves a bounded provider alert when create remains on the form", () => {
		expect(
			summarizeChatgptDeveloperAppCreateSurfaceProbeForTest({
				url: "https://chatgpt.com/plugins",
				createDialogVisible: true,
				dialogText: "Create app",
				alertTexts: ["  Unable   to connect to the MCP server.  "],
			}),
		).toBe("provider alert remained visible (Unable to connect to the MCP server.)");
	});

	it("reports a still-open create dialog even without a recognized generic error phrase", () => {
		expect(
			summarizeChatgptDeveloperAppCreateSurfaceProbeForTest({
				url: "https://chatgpt.com/plugins",
				createDialogVisible: true,
				dialogText: "Create app Name Connection Authentication Cancel Create",
				alertTexts: [],
			}),
		).toBe(
			"Create app dialog remained open (Create app Name Connection Authentication Cancel Create)",
		);
	});

	it("does not treat a closed post-submit surface as provider rejection evidence", () => {
		expect(
			summarizeChatgptDeveloperAppCreateSurfaceProbeForTest({
				url: "https://chatgpt.com/plugins",
				createDialogVisible: false,
				dialogText: null,
				alertTexts: [],
			}),
		).toBeNull();
	});

	it("targets the current named server URL input rather than a volatile input type", () => {
		expect(CHATGPT_DEVELOPER_APP_SERVER_URL_SELECTOR).toBe(
			'[role="dialog"] input[name="custom-connector-url"]',
		);
	});

	it("selects the current Radix connection radio with trusted CDP Space input", async () => {
		const evaluate = vi.fn(async (_options: { expression: string }) => ({
			result: { value: { found: true, selected: false } },
		}));
		const dispatchKeyEvent = vi.fn(async () => undefined);

		const selected = await selectChatgptDeveloperAppConnectionModeForTest(
			{
				// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
				Runtime: { evaluate } as never,
				// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
				Input: { dispatchKeyEvent } as never,
			},
			'[role="dialog"] button[role="radio"][aria-label="Server URL"]',
		);

		expect(selected).toBe(true);
		expect(evaluate.mock.calls[0]?.[0]?.expression).toContain("radio.focus()");
		expect(dispatchKeyEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ type: "rawKeyDown", key: " ", code: "Space" }),
		);
		expect(dispatchKeyEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ type: "keyUp", key: " ", code: "Space" }),
		);
	});

	it("clears an ecosystem mention that first unwraps into literal composer text", async () => {
		let clearChecks = 0;
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
			if (expression.includes("Boolean(document.querySelector")) {
				return { result: { value: true } };
			}
			if (expression.includes("editor.focus()")) {
				return { result: { value: true } };
			}
			if (expression.includes("innerText")) {
				clearChecks += 1;
				return { result: { value: clearChecks >= 2 } };
			}
			throw new Error(`Unexpected evaluation: ${expression}`);
		});
		const dispatchKeyEvent = vi.fn(async () => undefined);

		await clearDeveloperAppComposerForTest({
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			Runtime: { evaluate } as never,
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			Input: { dispatchKeyEvent } as never,
		} as never);

		expect(clearChecks).toBe(2);
		expect(dispatchKeyEvent).toHaveBeenCalledTimes(12);
	});

	it("maps private user-owned installed metadata and active OAuth link state", () => {
		const state = deriveChatgptDeveloperAppState({
			identity: {
				email: "eric.cochran@soylei.com",
				accountPlanType: "Pro",
			},
			developerMode: true,
			observedAt: "2026-07-24T12:00:00.000Z",
			featureSignature: JSON.stringify({
				inventory_complete: true,
				installed_apps: [
					{
						plugin_id: "plugin_asdk_app_corel33t",
						canonical_app_id: "asdk_app_corel33t",
						provider_name: "dev-corel33t",
						name: "Corel33t",
						app_ids: ["asdk_app_corel33t"],
						status: "ENABLED",
						enabled: true,
						scope: "USER",
						discoverability: "PRIVATE",
						creator_name: "Eric Cochran",
						release_version: "1.0.0",
						description: "LitScout",
						authentication_policy: "ON_INSTALL",
					},
				],
				linked_apps: [
					{
						connector_id: "asdk_app_corel33t",
						name: "Corel33t",
						auth_status: "ACTIVE",
						connector_status: "ENABLED",
					},
				],
			}),
		});

		expect(state).toEqual({
			account: {
				email: "eric.cochran@soylei.com",
				plan: "Pro",
			},
			developerMode: true,
			inventoryComplete: true,
			observedAt: "2026-07-24T12:00:00.000Z",
			apps: [
				{
					pluginId: "plugin_asdk_app_corel33t",
					appIds: ["asdk_app_corel33t"],
					name: "Corel33t",
					status: "ENABLED",
					enabled: true,
					authStatus: "ACTIVE",
					reviewStatus: "development",
					authorization: "ON_INSTALL",
					endpoint: null,
					versionId: "1.0.0",
					scope: "USER",
					discoverability: "PRIVATE",
					creatorName: "Eric Cochran",
					description: "LitScout",
				},
			],
		});
	});

	it("does not transfer auth state from a same-name link with a different app id", () => {
		const state = deriveChatgptDeveloperAppState({
			identity: { email: "eric.cochran@soylei.com" },
			developerMode: true,
			observedAt: "2026-08-14T12:00:00.000Z",
			featureSignature: JSON.stringify({
				inventory_complete: true,
				installed_apps: [
					{
						plugin_id: "plugin_asdk_app_new_litscout",
						name: "LitScout",
						app_ids: ["asdk_app_new_litscout"],
						status: "ENABLED",
						enabled: true,
					},
				],
				linked_apps: [
					{
						connector_id: "asdk_app_old_litscout",
						name: "LitScout",
						auth_status: "ACTIVE",
					},
				],
			}),
		});

		expect(state.apps[0]?.authStatus).toBeNull();
	});

	it("fails closed when more than one link matches the exact app id", () => {
		const state = deriveChatgptDeveloperAppState({
			identity: { email: "eric.cochran@soylei.com" },
			developerMode: true,
			observedAt: "2026-08-14T12:00:00.000Z",
			featureSignature: JSON.stringify({
				inventory_complete: true,
				installed_apps: [
					{
						plugin_id: "plugin_asdk_app_litscout",
						name: "LitScout",
						app_ids: ["asdk_app_litscout"],
						status: "ENABLED",
						enabled: true,
					},
				],
				linked_apps: [
					{
						connector_id: "asdk_app_litscout",
						auth_status: "ACTIVE",
					},
					{
						connector_id: "asdk_app_litscout",
						auth_status: "REAUTH_REQUIRED",
					},
				],
			}),
		});

		expect(state.apps[0]?.authStatus).toBeNull();
	});

	it("preserves reauthentication state from one exact app-id match", () => {
		const state = deriveChatgptDeveloperAppState({
			identity: { email: "eric.cochran@soylei.com" },
			developerMode: true,
			observedAt: "2026-08-14T12:00:00.000Z",
			featureSignature: JSON.stringify({
				inventory_complete: true,
				installed_apps: [
					{
						plugin_id: "plugin_asdk_app_litscout",
						name: "LitScout",
						app_ids: ["asdk_app_litscout"],
						status: "ENABLED",
						enabled: true,
					},
				],
				linked_apps: [
					{
						connector_id: "asdk_app_litscout",
						auth_status: "REAUTH_REQUIRED",
					},
				],
			}),
		});

		expect(state.apps[0]?.authStatus).toBe("REAUTH_REQUIRED");
	});

	it("does not treat a missing installed-app response as a complete empty inventory", () => {
		const state = deriveChatgptDeveloperAppState({
			identity: {
				email: "eric.cochran@soylei.com",
			},
			developerMode: true,
			observedAt: "2026-07-25T12:00:00.000Z",
			featureSignature: JSON.stringify({
				inventory_complete: false,
				installed_apps: [],
				linked_apps: [],
			}),
		});

		expect(state.inventoryComplete).toBe(false);
		expect(state.apps).toEqual([]);
	});

	it("requires the installed-app plugins array before treating a 2xx payload as complete", () => {
		expect(isCompleteChatgptInstalledAppsPayloadForTest(null)).toBe(false);
		expect(isCompleteChatgptInstalledAppsPayloadForTest([])).toBe(false);
		expect(isCompleteChatgptInstalledAppsPayloadForTest({})).toBe(false);
		expect(
			isCompleteChatgptInstalledAppsPayloadForTest({
				error: "temporarily unavailable",
			}),
		).toBe(false);
		expect(isCompleteChatgptInstalledAppsPayloadForTest({ plugins: [] })).toBe(true);
	});

	it("preserves provider metadata needed to distinguish a private development app", () => {
		const apps = normalizeChatgptInstalledAppProbesForTest([
			{
				id: "plugin_asdk_app_corel33t",
				name: "dev-corel33t",
				canonical_app_id: "asdk_app_corel33t",
				scope: "USER",
				discoverability: "PRIVATE",
				creator_name: "Eric Cochran",
				status: "ENABLED",
				enabled: true,
				installation_policy: undefined,
				authentication_policy: "ON_INSTALL",
				release: {
					version: "1.0.0",
					display_name: "Corel33t",
					description: "LitScout",
					app_ids: ["asdk_app_corel33t"],
				},
			},
		]);

		expect(apps).toEqual([
			{
				plugin_id: "plugin_asdk_app_corel33t",
				canonical_app_id: "asdk_app_corel33t",
				provider_name: "dev-corel33t",
				name: "Corel33t",
				app_ids: ["asdk_app_corel33t"],
				status: "ENABLED",
				enabled: true,
				authentication_policy: "ON_INSTALL",
				scope: "USER",
				discoverability: "PRIVATE",
				creator_name: "Eric Cochran",
				release_version: "1.0.0",
				description: "LitScout",
			},
		]);
	});

	it("matches a selected ecosystem mention against canonical app IDs as well as plugin IDs", () => {
		expect(
			chatgptDeveloperAppSelectionMatchesForTest("plugin:asdk_app_corel33t", {
				pluginId: "plugin_asdk_app_corel33t",
				appIds: ["asdk_app_corel33t"],
				name: "Corel33t",
			}),
		).toBe(true);
	});

	it("binds replacement deletion readiness to the exact app management route and heading", async () => {
		const evaluate = vi.fn(async (_options: { expression: string }) => ({
			result: {
				value: {
					appName: "Corel33t",
					hash: "#settings/Plugins/plugin_asdk_app_corel33t",
					dialogCount: 1,
					actionButtonCount: 1,
				},
			},
		}));

		const result = await waitForChatgptDeveloperAppSettingsForDeleteForTest(
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			{ Runtime: { evaluate } as never },
			{
				pluginId: "plugin_asdk_app_corel33t",
				appIds: ["asdk_app_corel33t"],
				name: "Corel33t",
			},
		);

		expect(result.ok).toBe(true);
		const expression = evaluate.mock.calls[0]?.[0]?.expression as string;
		expect(expression).toContain('"Corel33t"');
		expect(expression).toContain('"#settings/Plugins/plugin_asdk_app_corel33t"');
		expect(expression).toContain("dialogs.length !== 1");
		expect(expression).toContain("actionButtons.length !== 1");
		expect(expression).toContain("data-auracall-delete-dialog");
		expect(expression).toContain("data-auracall-delete-trigger");
	});

	it("requires one visible menu with one exact Delete item before marking the trusted target", async () => {
		const evaluate = vi.fn(async (_options: { expression: string }) => ({
			result: {
				value: {
					menuCount: 1,
					deleteItemCount: 1,
				},
			},
		}));

		const result = await markExactChatgptDeveloperAppDeleteMenuForTest(
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			{ Runtime: { evaluate } as never },
			"fixed-delete-marker",
		);

		expect(result.ok).toBe(true);
		const expression = evaluate.mock.calls[0]?.[0]?.expression as string;
		expect(expression).toContain("candidates.length !== 1");
		expect(expression).toContain("deleteItems.length !== 1");
		expect(expression).toContain("data-auracall-delete-menu");
		expect(expression).toContain("data-auracall-delete-item");
		expect(expression).toContain('"fixed-delete-marker"');
	});
});

describe("developer-mode observation during complete inventory reads", () => {
	it.each([
		"timeout",
		"absent",
		"transport",
	])("retains inventory for optional mode timeout/absence while propagating transport failures: %s", async (mode) => {
		vi.useFakeTimers();
		let url = "https://chatgpt.com/";
		let response: (value: unknown) => void = () => undefined;
		let finished: (value: unknown) => Promise<void> = async () => undefined;
		const transportError = new Error("fixture transport disconnected");
		let modeStarted = 0;
		let modeCalls = 0;
		const payloads: Record<string, unknown> = {
			installed: {
				plugins: [
					{ plugin_id: "plugin_fixture", name: "Fixture", app_ids: ["fixture"], enabled: true },
				],
			},
			linked: { links: [] },
		};
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			Runtime: {
				enable: async () => undefined,
				evaluate: vi.fn(async ({ expression }: { expression: string }) => {
					if (expression === "location.href") return { result: { value: url } };
					if (
						expression.startsWith("Boolean(document.querySelector") &&
						expression.includes("Developer mode")
					) {
						if (!modeCalls++) modeStarted = Date.now();
						if (mode === "transport") throw transportError;
						if (mode === "timeout" && Date.now() - modeStarted >= 7_600)
							return new Promise<never>(() => undefined);
						return { result: { value: false } };
					}
					return { result: { value: expression.includes("document.readyState") } };
				}),
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			Page: {
				enable: async () => undefined,
				navigate: async (input: { url: string }) => {
					url = input.url;
					if (url === "https://chatgpt.com/plugins") {
						for (const [kind, endpoint] of [
							["installed", "/backend-api/ps/plugins/installed"],
							["linked", "/backend-api/aip/connectors/links/list_accessible"],
						]) {
							response({ requestId: kind, response: { status: 200, url: endpoint } });
							await finished({ requestId: kind });
						}
					}
					return {};
				},
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical capitalized names.
			Network: {
				enable: async () => undefined,
				responseReceived: (callback: typeof response) => {
					response = callback;
				},
				loadingFinished: (callback: typeof finished) => {
					finished = callback;
				},
				getResponseBody: async ({ requestId }: { requestId: string }) => ({
					body: JSON.stringify(payloads[requestId]),
				}),
			},
			close: async () => undefined,
		};
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => ({ email: "fixture@example.invalid" }),
				connectDevTools: async () => ({ client: client as never, port: 45015 }),
			},
			async () => {
				throw new Error("unexpected browser launch");
			},
		);
		try {
			const observed = adapter.readState().then(
				(value) => ({ value, error: null }),
				(error) => ({ value: null, error }),
			);
			await vi.advanceTimersByTimeAsync(10_000);
			const result = await observed;
			if (mode === "transport") {
				expect(result.error).toBe(transportError);
				expect(result.value).toBeNull();
			} else {
				expect(result.error).toBeNull();
				expect(result.value).toMatchObject({
					developerMode: null,
					inventoryComplete: true,
					apps: [{ pluginId: "plugin_fixture" }],
				});
				expect(modeCalls).toBeGreaterThan(1);
			}
			expect(url).toBe("https://chatgpt.com/");
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});
});
