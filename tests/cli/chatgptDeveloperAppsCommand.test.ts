import { describe, expect, it, vi } from "vitest";
import {
	type ChatgptDeveloperAppAdapter,
	executeChatgptDeveloperAppOperation,
	formatChatgptDeveloperAppOperationResult,
	runChatgptDeveloperAppOperationForCli,
} from "../../src/cli/chatgptDeveloperAppsCommand.js";

function createAdapter(
	overrides: Partial<ChatgptDeveloperAppAdapter> = {},
): ChatgptDeveloperAppAdapter {
	return {
		readState: async () => ({
			account: {
				email: "eric.cochran@soylei.com",
				plan: "Pro",
			},
			developerMode: true,
			inventoryComplete: true,
			apps: [
				{
					pluginId: "plugin_asdk_app_corel33t",
					appIds: ["asdk_app_corel33t"],
					name: "Corel33t",
					status: "ENABLED",
					enabled: true,
					authStatus: "ACTIVE",
					reviewStatus: "development",
				},
			],
			observedAt: "2026-07-24T12:00:00.000Z",
		}),
		create: async () => {
			throw new Error("unexpected create");
		},
		delete: async () => {
			throw new Error("unexpected delete");
		},
		selectForTest: async () => {
			throw new Error("unexpected select");
		},
		submitTest: async () => {
			throw new Error("unexpected submit");
		},
		uninstall: async () => {
			throw new Error("unexpected uninstall");
		},
		...overrides,
	};
}

describe("executeChatgptDeveloperAppOperation", () => {
	it("binds developer-app mutations to the exact utility tab", async () => {
		const connectDevTools = vi.fn(async () => ({ client: {}, port: 45011 }));
		const runUtilityBrowserOperation = vi.fn(async (input) =>
			input.run({ host: "127.0.0.1", port: 45011, tabTargetId: "utility-tab-1" }),
		);
		const close = vi.fn(async () => undefined);

		await runChatgptDeveloperAppOperationForCli(
			{ browser: { tabConcurrencyMode: "tab-affinity" } } as never,
			{
				action: "test",
				app: "Corel33t",
				submit: false,
				confirmed: false,
				expectedAccount: "eric.cochran@soylei.com",
			},
			{
				createBrowser: async () =>
					({
						userConfig: {},
						getUserIdentity: vi.fn(),
						connectDevTools,
						runUtilityBrowserOperation,
					}) as never,
				createAdapter: (browser) => ({
					...createAdapter({
						readState: async () => {
							await browser.connectDevTools();
							return await createAdapter().readState();
						},
						selectForTest: async () => ({
							status: "completed",
							message: "selected",
						}),
					}),
					close,
				}),
			},
		);

		expect(runUtilityBrowserOperation).toHaveBeenCalledWith(
			expect.objectContaining({ mutability: "provider-mutating" }),
		);
		expect(connectDevTools).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "127.0.0.1",
				port: 45011,
				tabTargetId: "utility-tab-1",
			}),
		);
		expect(close).toHaveBeenCalledOnce();
	});

	it.each([
		"completed",
		"failed",
	] as const)("exposes terminal %s evidence in JSON and text without resubmission", async (status) => {
		const submitTest = vi.fn(async () => ({
			status,
			message: "terminal receipt",
			answerText: status === "completed" ? "App answer" : undefined,
			conversationId: "conversation",
			terminalUrl: "https://chatgpt.com/c/conversation",
			currentUrl: "https://chatgpt.com/c/conversation",
			effectState: "effect_observed" as const,
			retrySafe: false,
		}));
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "test",
				app: "Corel33t",
				submit: true,
				prompt: "Use app",
				expectedAccount: "eric.cochran@soylei.com",
				confirmed: true,
			},
			createAdapter({ submitTest }),
		);
		expect(JSON.parse(JSON.stringify(result))).toMatchObject({
			status,
			outcome: { conversationId: "conversation", effectState: "effect_observed", retrySafe: false },
		});
		const formatted = formatChatgptDeveloperAppOperationResult(result);
		expect(formatted).toContain("Conversation: conversation");
		expect(formatted).toContain("Provider effect: effect_observed; retry safe: no");
		if (status === "completed") expect(formatted).toContain("Answer: App answer");
		expect(submitTest).toHaveBeenCalledTimes(1);
	});
	it("bounds a stalled list operation and closes its adapter", async () => {
		const close = vi.fn(async () => undefined);
		const readState = vi.fn(() => new Promise<never>(() => undefined));

		await expect(
			runChatgptDeveloperAppOperationForCli(
				{} as never,
				{ action: "list" },
				{
					listTimeoutMs: 10,
					closeTimeoutMs: 10,
					createBrowser: async () => ({}) as never,
					createAdapter: () => ({
						...createAdapter({ readState }),
						close,
					}),
				},
			),
		).rejects.toThrow("ChatGPT developer-app list timed out after 10ms");
		expect(readState).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	});

	it("does not let a stalled adapter close retain the outer list operation", async () => {
		const close = vi.fn(() => new Promise<never>(() => undefined));

		await expect(
			runChatgptDeveloperAppOperationForCli(
				{} as never,
				{ action: "list" },
				{
					listTimeoutMs: 10,
					closeTimeoutMs: 10,
					createBrowser: async () => ({}) as never,
					createAdapter: () => ({
						...createAdapter({ readState: () => new Promise<never>(() => undefined) }),
						close,
					}),
				},
			),
		).rejects.toThrow("ChatGPT developer-app list timed out after 10ms");
		expect(close).toHaveBeenCalledOnce();
	});

	it("lists the account-bound developer-app state without mutation", async () => {
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "list",
			},
			createAdapter(),
		);

		expect(result).toEqual({
			action: "list",
			status: "observed",
			state: {
				account: {
					email: "eric.cochran@soylei.com",
					plan: "Pro",
				},
				developerMode: true,
				inventoryComplete: true,
				apps: [
					{
						pluginId: "plugin_asdk_app_corel33t",
						appIds: ["asdk_app_corel33t"],
						name: "Corel33t",
						status: "ENABLED",
						enabled: true,
						authStatus: "ACTIVE",
						reviewStatus: "development",
					},
				],
				observedAt: "2026-07-24T12:00:00.000Z",
			},
		});
	});

	it("rejects app creation before any browser mutation without explicit confirmation", async () => {
		let createCalled = false;
		const adapter = createAdapter({
			create: async () => {
				createCalled = true;
				throw new Error("should not mutate");
			},
		});

		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "create",
					name: "LitScout Dev",
					serverUrl: "https://litscout.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: false,
					expectedAccount: "eric.cochran@soylei.com",
				},
				adapter,
			),
		).rejects.toThrow("requires --yes");
		expect(createCalled).toBe(false);
	});

	it("confirms a false Developer mode observation once before guarded create", async () => {
		const baseAdapter = createAdapter();
		let reads = 0;
		let createCalled = false;
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "create",
				name: "LitScout OA exact test",
				serverUrl: "https://litscout.example.test/mcp",
				auth: "oauth",
				connection: "server-url",
				confirmed: true,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				readState: async () => {
					reads += 1;
					const state = await baseAdapter.readState();
					return reads === 1 ? { ...state, developerMode: false } : state;
				},
				create: async () => {
					createCalled = true;
					return {
						status: "completed",
						message: "created",
					};
				},
			}),
		);

		expect(reads).toBe(2);
		expect(createCalled).toBe(true);
		expect(result).toMatchObject({
			action: "create",
			status: "completed",
			state: {
				developerMode: true,
				inventoryComplete: true,
			},
		});
	});

	it.each([
		false,
		null,
	])("fails closed when two Developer mode observations remain %s", async (developerMode) => {
		const baseAdapter = createAdapter();
		let reads = 0;
		let createCalled = false;

		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "create",
					name: "LitScout OA exact test",
					serverUrl: "https://litscout.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					readState: async () => {
						reads += 1;
						return {
							...(await baseAdapter.readState()),
							developerMode,
						};
					},
					create: async () => {
						createCalled = true;
						throw new Error("should not create");
					},
				}),
			),
		).rejects.toThrow("Developer mode must be enabled");
		expect(reads).toBe(2);
		expect(createCalled).toBe(false);
	});

	it("rejects replacement when Developer mode is unknown without deleting the existing app", async () => {
		const baseAdapter = createAdapter();
		const deleteApp = vi.fn(async () => {
			throw new Error("unexpected deletion");
		});
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "Corel33t",
					serverUrl: "https://fixture.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					readState: async () => ({ ...(await baseAdapter.readState()), developerMode: null }),
					delete: deleteApp,
				}),
			),
		).rejects.toThrow("Developer mode must be enabled");
		expect(deleteApp).not.toHaveBeenCalled();
	});

	it("rejects create when the exact normalized app name already exists", async () => {
		let createCalled = false;
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "create",
					name: " corel33t ",
					serverUrl: "https://litscout.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					create: async () => {
						createCalled = true;
						throw new Error("should not create");
					},
				}),
			),
		).rejects.toThrow("already has one installed app named Corel33t");
		expect(createCalled).toBe(false);
	});

	it("fails closed when the live ChatGPT account does not match the expected account", async () => {
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "Corel33t",
					serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "other@example.com",
				},
				createAdapter(),
			),
		).rejects.toThrow(
			"Expected ChatGPT account other@example.com, but the managed browser is eric.cochran@soylei.com",
		);
	});

	it("replaces one exact app after confirmation, account verification, and absence proof", async () => {
		const events: string[] = [];
		let inventoryReads = 0;
		const baseAdapter = createAdapter();
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "refresh",
				app: "plugin_asdk_app_corel33t",
				serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
				description: "LitScout",
				auth: "oauth",
				connection: "server-url",
				confirmed: true,
				expectedAccount: "ERIC.COCHRAN@SOYLEI.COM",
			},
			createAdapter({
				readState: async () => {
					inventoryReads += 1;
					const state = await baseAdapter.readState();
					if (inventoryReads === 1) return state;
					if (inventoryReads === 2) return { ...state, apps: [] };
					return {
						...state,
						apps: [
							{
								...state.apps[0],
								pluginId: "plugin_asdk_app_corel33t_replacement",
								appIds: ["asdk_app_corel33t_replacement"],
								authStatus: null,
							},
						],
					};
				},
				delete: async (app) => {
					events.push(`delete:${app.pluginId}`);
					return {
						status: "completed",
						message: "Corel33t Delete action selected.",
						app,
					};
				},
				create: async (input) => {
					events.push(`create:${input.name}:${input.serverUrl}`);
					return {
						status: "awaiting-human",
						message: "Corel33t replacement submitted; complete OAuth.",
					};
				},
			}),
		);

		expect(events).toEqual([
			"delete:plugin_asdk_app_corel33t",
			"create:Corel33t:https://litscout.ecochran.dyndns.org/mcp",
		]);
		expect(inventoryReads).toBe(3);
		expect(result).toMatchObject({
			action: "refresh",
			status: "awaiting-human",
			outcome: {
				message: "Corel33t old app deleted. Corel33t replacement submitted; complete OAuth.",
				app: {
					pluginId: "plugin_asdk_app_corel33t_replacement",
				},
			},
		});
	});

	it("validates replacement inputs before deleting the exact app", async () => {
		let deleteCalled = false;
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "Corel33t",
					serverUrl: "http://litscout.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					delete: async () => {
						deleteCalled = true;
						throw new Error("should not delete");
					},
				}),
			),
		).rejects.toThrow("must use HTTPS");
		expect(deleteCalled).toBe(false);
	});

	it("refuses to recreate while the old app identity or name remains installed", async () => {
		let createCalled = false;
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "Corel33t",
					serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					delete: async (app) => ({
						status: "completed",
						message: `${app.name} Delete action selected.`,
						app,
					}),
					create: async () => {
						createCalled = true;
						throw new Error("should not create");
					},
				}),
			),
		).rejects.toThrow("still present after delete; refusing to create a duplicate");
		expect(createCalled).toBe(false);
	});

	it("does not recreate when exact-app deletion fails", async () => {
		let createCalled = false;
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "Corel33t",
					serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					delete: async () => {
						throw new Error("provider refused delete");
					},
					create: async () => {
						createCalled = true;
						throw new Error("should not create");
					},
				}),
			),
		).rejects.toThrow("provider refused delete");
		expect(createCalled).toBe(false);
	});

	it("fails before delete when a same-name sibling already makes replacement unsafe", async () => {
		const base = await createAdapter().readState();
		let deleteCalled = false;
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "refresh",
					app: "plugin_asdk_app_corel33t",
					serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter({
					readState: async () => ({
						...base,
						apps: [
							...base.apps,
							{
								...base.apps[0],
								pluginId: "plugin_asdk_app_corel33t_sibling",
								appIds: ["asdk_app_corel33t_sibling"],
							},
						],
					}),
					delete: async () => {
						deleteCalled = true;
						throw new Error("should not delete");
					},
				}),
			),
		).rejects.toThrow("same normalized name");
		expect(deleteCalled).toBe(false);
	});

	it("returns structured create recovery when post-delete inventory is incomplete", async () => {
		const baseAdapter = createAdapter();
		let inventoryReads = 0;
		let createCalled = false;
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "refresh",
				app: "Corel33t",
				serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
				description: "LitScout",
				auth: "oauth",
				connection: "server-url",
				confirmed: true,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				readState: async () => {
					inventoryReads += 1;
					const state = await baseAdapter.readState();
					return inventoryReads === 1 ? state : { ...state, inventoryComplete: false, apps: [] };
				},
				delete: async (app) => ({
					status: "completed",
					message: `${app.name} Delete action selected.`,
					app,
				}),
				create: async () => {
					createCalled = true;
					throw new Error("should not create without absence proof");
				},
			}),
		);

		expect(result).toMatchObject({
			action: "refresh",
			status: "recreate-pending",
			outcome: {
				recovery: {
					action: "create",
					reason: expect.stringContaining("inventory was incomplete"),
					input: {
						name: "Corel33t",
						serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
					},
				},
			},
		});
		expect(createCalled).toBe(false);
	});

	it("returns structured create recovery when recreation throws after verified deletion", async () => {
		const baseAdapter = createAdapter();
		let inventoryReads = 0;
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "refresh",
				app: "Corel33t",
				serverUrl: "https://litscout.ecochran.dyndns.org/mcp",
				auth: "oauth",
				connection: "server-url",
				confirmed: true,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				readState: async () => {
					inventoryReads += 1;
					const state = await baseAdapter.readState();
					return inventoryReads === 1 ? state : { ...state, apps: [] };
				},
				delete: async (app) => ({
					status: "completed",
					message: `${app.name} Delete action selected.`,
					app,
				}),
				create: async () => {
					throw new Error("create form changed");
				},
			}),
		);

		expect(result).toMatchObject({
			status: "recreate-pending",
			outcome: {
				recovery: {
					action: "create",
					reason: "create form changed",
				},
			},
		});
	});

	it("fails closed when an app name is ambiguous", async () => {
		const base = await createAdapter().readState();
		const adapter = createAdapter({
			readState: async () => ({
				...base,
				apps: [
					...base.apps,
					{
						...base.apps[0],
						pluginId: "plugin_asdk_app_corel33t_second",
						appIds: ["asdk_app_corel33t_second"],
					},
				],
			}),
		});

		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "uninstall",
					app: "Corel33t",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				adapter,
			),
		).rejects.toThrow("ambiguous; use an exact plugin id or app id");
	});

	it("returns an OAuth human gate from confirmed app creation", async () => {
		let receivedCreateInput: unknown = null;
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "create",
				name: "LitScout Dev",
				description: "LitScout developer app",
				serverUrl: "https://litscout.example.test/mcp",
				auth: "oauth",
				connection: "server-url",
				confirmed: true,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				create: async (input) => {
					receivedCreateInput = input;
					return {
						status: "awaiting-human",
						message: `Complete OAuth for ${input.name}.`,
						currentUrl: "https://litscout.example.test/oauth/authorize",
					};
				},
			}),
		);

		expect(result).toMatchObject({
			action: "create",
			status: "awaiting-human",
			outcome: {
				currentUrl: "https://litscout.example.test/oauth/authorize",
			},
		});
		expect(receivedCreateInput).toEqual({
			name: "LitScout Dev",
			description: "LitScout developer app",
			serverUrl: "https://litscout.example.test/mcp",
			auth: "oauth",
			connection: "server-url",
		});
	});

	it("select-tests an exact app without submitting a prompt or requiring mutation confirmation", async () => {
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "test",
				app: "Corel33t",
				submit: false,
				confirmed: false,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				selectForTest: async (app) => ({
					status: "completed",
					message: `${app.name} selected without prompt submission.`,
					app,
				}),
			}),
		);

		expect(result).toMatchObject({
			action: "test",
			status: "completed",
			outcome: {
				message: "Corel33t selected without prompt submission.",
			},
		});
	});

	it("requires a second explicit confirmation before a test prompt is submitted", async () => {
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "test",
					app: "Corel33t",
					submit: true,
					prompt: "Run a read-only auth smoke.",
					confirmed: false,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter(),
			),
		).rejects.toThrow("requires --yes");
	});

	it("uninstalls only the exact resolved app after confirmation", async () => {
		const uninstalled: string[] = [];
		const result = await executeChatgptDeveloperAppOperation(
			{
				action: "uninstall",
				app: "asdk_app_corel33t",
				confirmed: true,
				expectedAccount: "eric.cochran@soylei.com",
			},
			createAdapter({
				uninstall: async (app) => {
					uninstalled.push(app.pluginId);
					return {
						status: "completed",
						message: `${app.name} uninstall confirmed.`,
						app,
					};
				},
			}),
		);

		expect(uninstalled).toEqual(["plugin_asdk_app_corel33t"]);
		expect(result.status).toBe("completed");
	});

	it("rejects non-HTTPS remote MCP endpoints before opening the create form", async () => {
		await expect(
			executeChatgptDeveloperAppOperation(
				{
					action: "create",
					name: "LitScout Dev",
					serverUrl: "http://litscout.example.test/mcp",
					auth: "oauth",
					connection: "server-url",
					confirmed: true,
					expectedAccount: "eric.cochran@soylei.com",
				},
				createAdapter(),
			),
		).rejects.toThrow("must use HTTPS");
	});
});
