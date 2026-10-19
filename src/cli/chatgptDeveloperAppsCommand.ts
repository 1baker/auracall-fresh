import type { DeveloperAppSubmissionEvidence } from "../browser/chatgptDeveloperAppSubmission.js";
import { BrowserAutomationClient } from "../browser/client.js";
import { hasUnknownOwnedRequestCleanup } from "../browser/ownedBackendRequestAuthority.js";
import {
	type ChatgptDeveloperAppBrowserClient,
	type ChatgptDeveloperAppBrowserClientFactory,
	createChatgptDeveloperAppBrowserAdapter,
	type DeveloperAppInventoryStage,
} from "../browser/providers/chatgptDeveloperApps.js";
import {
	annotateClientMutationContext,
	resolveProviderTrafficGovernor,
} from "../browser/providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "../browser/providers/types.js";
import type { BrowserModelStrategy } from "../browser/types.js";
import type { ResolvedUserConfig } from "../config.js";

import { resolveChatgptBackendRequestBudgetWaitMs } from "../runtime/tenantExecutionLimits.js";

const DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS = 45_000;
const DEFAULT_CHATGPT_DEVELOPER_APP_CLOSE_TIMEOUT_MS = 5_000;

export type DeveloperAppStage =
	| DeveloperAppInventoryStage
	| "browser-resolution"
	| "utility-admission"
	| "interaction-admission"
	| "cleanup";

export class DeveloperAppTimeoutError extends Error {
	readonly code = "developer_app_timeout";
	constructor(
		message: string,
		readonly stage: DeveloperAppStage,
		readonly timeoutMs: number,
	) {
		super(message);
		this.name = "DeveloperAppTimeoutError";
	}
}

/** Stable JSON receipt; never serialize browser objects or raw error causes. */
export function formatChatgptDeveloperAppListFailure(error: unknown): string {
	const detail = error as { code?: string; stage?: string; timeoutMs?: number } | null;
	return JSON.stringify(
		{
			action: "list",
			status: "failed",
			code: detail?.code ?? "developer_app_failed",
			stage: detail?.stage ?? "queue-admission",
			timeoutMs: detail?.timeoutMs,
			message: error instanceof Error ? error.message : String(error),
			cleanup: hasUnknownOwnedRequestCleanup(error) ? "unknown" : "not-qualified",
		},
		null,
		2,
	);
}

export interface ChatgptDeveloperAppAccount {
	email: string | null;
	plan: string | null;
}

export interface ChatgptDeveloperApp {
	pluginId: string;
	appIds: string[];
	name: string;
	status?: string | null;
	enabled?: boolean | null;
	authStatus?: string | null;
	reviewStatus?: string | null;
	endpoint?: string | null;
	authorization?: string | null;
	versionId?: string | null;
	scope?: string | null;
	discoverability?: string | null;
	creatorName?: string | null;
	description?: string | null;
}

export interface ChatgptDeveloperAppState {
	account: ChatgptDeveloperAppAccount;
	developerMode: boolean | null;
	inventoryComplete: boolean;
	apps: ChatgptDeveloperApp[];
	observedAt: string;
}

export interface ChatgptDeveloperAppAdapter {
	readState(options?: { includeDeveloperMode?: boolean }): Promise<ChatgptDeveloperAppState>;
	create(input: ChatgptDeveloperAppCreateInput): Promise<ChatgptDeveloperAppMutationOutcome>;
	refreshTools(
		app: ChatgptDeveloperApp,
		serverUrl: string,
	): Promise<ChatgptDeveloperAppMutationOutcome>;
	delete(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	selectForTest(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	submitTest(app: ChatgptDeveloperApp, prompt: string): Promise<ChatgptDeveloperAppMutationOutcome>;
	uninstall(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
}

type ChatgptDeveloperAppCliAdapter = ChatgptDeveloperAppAdapter & {
	close(): Promise<void>;
};

export interface ChatgptDeveloperAppCliDependencies {
	onProgress?: (progress: { stage: DeveloperAppStage; timeoutMs?: number }) => void;
	browserOperationOwned?: boolean;
	listTimeoutMs?: number;
	refreshToolsTimeoutMs?: number;
	closeTimeoutMs?: number;
	createBrowser?: (
		userConfig: ResolvedUserConfig,
		options: { target: "chatgpt" },
	) => Promise<ChatgptDeveloperAppBrowserClient>;
	createAdapter?: (
		browser: ChatgptDeveloperAppBrowserClient,
		createBrowser: ChatgptDeveloperAppBrowserClientFactory,
		options: {
			abortSignal?: AbortSignal;
			browserOperationOwned?: boolean;
			modelStrategy?: BrowserModelStrategy;
			onInventoryStage?: (stage: DeveloperAppInventoryStage) => void;
		},
	) => ChatgptDeveloperAppCliAdapter;
}

export type ChatgptDeveloperAppAuth = "oauth" | "none" | "mixed";

export interface ChatgptDeveloperAppCreateInput {
	name: string;
	serverUrl: string;
	description?: string | null;
	auth: ChatgptDeveloperAppAuth;
	connection: "server-url" | "tunnel";
}

export interface ChatgptDeveloperAppMutationOutcome extends DeveloperAppSubmissionEvidence {
	status: "completed" | "awaiting-human" | "recreate-pending" | "unconfirmed" | "failed";
	catalog?: { toolCount: number; toolNames: string[]; sha256: string };
	message: string;
	currentUrl?: string | null;
	app?: ChatgptDeveloperApp | null;
	recovery?: {
		action: "create";
		input: ChatgptDeveloperAppCreateInput;
		reason: string;
	};
}

export type ChatgptDeveloperAppOperationInput =
	| { action: "list" }
	| ({
			action: "create";
			confirmed: boolean;
			expectedAccount: string;
	  } & ChatgptDeveloperAppCreateInput)
	| {
			action: "refresh-tools";
			app: string;
			serverUrl: string;
			confirmed: boolean;
			expectedAccount: string;
	  }
	| {
			action: "refresh";
			app: string;
			serverUrl: string;
			description?: string | null;
			auth: ChatgptDeveloperAppAuth;
			connection: "server-url" | "tunnel";
			confirmed: boolean;
			expectedAccount: string;
	  }
	| {
			action: "test";
			app: string;
			submit: boolean;
			modelStrategy?: BrowserModelStrategy;
			prompt?: string | null;
			confirmed: boolean;
			expectedAccount: string;
	  }
	| {
			action: "uninstall";
			app: string;
			confirmed: boolean;
			expectedAccount: string;
	  };

export type ChatgptDeveloperAppOperationResult =
	| {
			action: "list";
			status: "observed";
			state: ChatgptDeveloperAppState;
	  }
	| {
			action: Exclude<ChatgptDeveloperAppOperationInput["action"], "list">;
			status: ChatgptDeveloperAppMutationOutcome["status"];
			state: ChatgptDeveloperAppState;
			outcome: ChatgptDeveloperAppMutationOutcome;
	  };

export async function executeChatgptDeveloperAppOperation(
	input: ChatgptDeveloperAppOperationInput,
	adapter: ChatgptDeveloperAppAdapter,
): Promise<ChatgptDeveloperAppOperationResult> {
	return executeChatgptDeveloperAppOperationWithState(
		input,
		adapter,
		await adapter.readState(
			input.action === "refresh-tools" ? { includeDeveloperMode: false } : undefined,
		),
	);
}

async function executeChatgptDeveloperAppOperationWithState(
	input: ChatgptDeveloperAppOperationInput,
	adapter: ChatgptDeveloperAppAdapter,
	state: ChatgptDeveloperAppState,
): Promise<ChatgptDeveloperAppOperationResult> {
	if (input.action === "list") {
		return {
			action: "list",
			status: "observed",
			state,
		};
	}
	const requiresConfirmation = input.action !== "test" || input.submit;
	if (requiresConfirmation && !input.confirmed) {
		throw new Error(`ChatGPT developer-app ${input.action} requires --yes.`);
	}
	if (input.action === "create" && !state.developerMode) {
		// Settings navigation can briefly expose a stale switch value. Confirm
		// once through the same complete account/inventory read before either
		// rejecting or opening the provider create surface.
		state = await adapter.readState();
	}
	const expectedAccount = normalizeAccount(input.expectedAccount);
	const actualAccount = normalizeAccount(state.account.email);
	if (!actualAccount || actualAccount !== expectedAccount) {
		throw new Error(
			`Expected ChatGPT account ${input.expectedAccount}, but the managed browser is ${state.account.email ?? "unknown"}.`,
		);
	}
	if (!state.inventoryComplete) {
		throw new Error(
			`ChatGPT developer-app ${input.action} requires a complete installed-app inventory; the provider inventory response was incomplete.`,
		);
	}
	if (input.action === "create") {
		if (!state.developerMode) {
			throw new Error("ChatGPT Developer mode must be enabled before creating an app.");
		}
		const createInput = normalizeCreateInput(input);
		assertNoExistingAppName(state.apps, createInput.name);
		const outcome = await adapter.create(createInput);
		return {
			action: "create",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "refresh-tools") {
		const app = resolveExactApp(state.apps, input.app);
		const expectedEndpoint = new URL(input.serverUrl);
		if (
			expectedEndpoint.username ||
			expectedEndpoint.password ||
			(expectedEndpoint.protocol !== "https:" &&
				!(
					expectedEndpoint.protocol === "http:" &&
					["localhost", "127.0.0.1", "[::1]"].includes(expectedEndpoint.hostname)
				))
		) {
			throw new Error("Refresh tools requires an HTTPS or loopback MCP endpoint.");
		}
		if (app.endpoint && new URL(app.endpoint).href !== expectedEndpoint.href) {
			throw new Error("Refresh tools requires the exact expected MCP endpoint.");
		}
		const outcome = await adapter.refreshTools(app, expectedEndpoint.href);
		return { action: input.action, status: outcome.status, state, outcome };
	}

	if (input.action === "refresh") {
		if (!state.developerMode) {
			throw new Error("ChatGPT Developer mode must be enabled before replacing an app.");
		}
		const app = resolveExactApp(state.apps, input.app);
		assertUniqueReplacementName(state.apps, app);
		const replacementInput = normalizeDeveloperAppCreateInput({
			name: app.name,
			serverUrl: input.serverUrl,
			description: input.description ?? app.description ?? null,
			auth: input.auth,
			connection: input.connection,
		});
		const deleteOutcome = await adapter.delete(app);
		if (deleteOutcome.status === "awaiting-human") {
			return {
				action: "refresh",
				status: deleteOutcome.status,
				state,
				outcome: deleteOutcome,
			};
		}
		let postDeleteState: ChatgptDeveloperAppState;
		try {
			postDeleteState = await adapter.readState();
		} catch (error) {
			const outcome = buildRecreatePendingOutcome(
				app,
				replacementInput,
				`post-delete inventory failed: ${readErrorMessage(error)}`,
			);
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		if (!postDeleteState.inventoryComplete) {
			const outcome = buildRecreatePendingOutcome(
				app,
				replacementInput,
				"post-delete installed-app inventory was incomplete, so absence was not proven",
			);
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		if (replacementTargetRemains(postDeleteState.apps, app)) {
			throw new Error(
				`ChatGPT developer app ${app.name} is still present after delete; refusing to create a duplicate.`,
			);
		}
		let createOutcome: ChatgptDeveloperAppMutationOutcome;
		try {
			createOutcome = await adapter.create(replacementInput);
		} catch (error) {
			const outcome = buildRecreatePendingOutcome(app, replacementInput, readErrorMessage(error));
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		let replacementApp: ChatgptDeveloperApp | null = null;
		try {
			const postCreateState = await adapter.readState();
			if (postCreateState.inventoryComplete) {
				const candidates = postCreateState.apps.filter(
					(candidate) =>
						normalizeAccount(candidate.name) === normalizeAccount(app.name) &&
						!appIdentityOverlaps(candidate, app),
				);
				if (candidates.length === 1) replacementApp = candidates[0];
			}
		} catch {
			// Creation was submitted already; later read-only inventory must verify its identity.
		}
		const outcome: ChatgptDeveloperAppMutationOutcome = {
			...createOutcome,
			message: `${app.name} old app deleted. ${createOutcome.message}`,
			app: replacementApp ?? createOutcome.app ?? null,
		};
		return {
			action: "refresh",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "uninstall") {
		const app = resolveExactApp(state.apps, input.app);
		const outcome = await adapter.uninstall(app);
		return {
			action: "uninstall",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "test") {
		const app = resolveExactApp(state.apps, input.app);
		const outcome = input.submit
			? await adapter.submitTest(app, normalizeTestPrompt(input.prompt))
			: await adapter.selectForTest(app);
		return {
			action: "test",
			status: outcome.status,
			state,
			outcome,
		};
	}
	throw new Error("Unsupported ChatGPT developer-app action.");
}

export async function runChatgptDeveloperAppOperationForCli(
	userConfig: ResolvedUserConfig,
	input: ChatgptDeveloperAppOperationInput,
	dependencies: ChatgptDeveloperAppCliDependencies = {},
): Promise<ChatgptDeveloperAppOperationResult> {
	const createBrowser = dependencies.createBrowser ?? BrowserAutomationClient.fromConfig;
	const createAdapter = dependencies.createAdapter ?? createChatgptDeveloperAppBrowserAdapter;
	const abortController =
		input.action === "list" ||
		input.action === "refresh-tools" ||
		(input.action === "test" && input.submit)
			? new AbortController()
			: null;
	const active: { adapter: ChatgptDeveloperAppCliAdapter | null } = { adapter: null };
	let stage: DeveloperAppStage = "browser-resolution";
	let failureStage: DeveloperAppStage | undefined;
	let operationFailure: unknown;
	const reportStage = (nextStage: DeveloperAppStage) => {
		stage = nextStage;
		dependencies.onProgress?.({ stage });
	};
	const operation = async () => {
		const browser = await createBrowser(userConfig, { target: "chatgpt" });
		abortController?.signal.throwIfAborted();
		const run = async (listOptions: BrowserProviderListOptions) => {
			reportStage("interaction-admission");
			await listOptions.interactionGovernor?.beforeInteraction("generic", abortController?.signal);
			const exactBrowser = scopeChatgptDeveloperAppBrowser(browser, listOptions);
			active.adapter = createAdapter(
				exactBrowser,
				async (config) =>
					scopeChatgptDeveloperAppBrowser(
						await createBrowser(config, { target: "chatgpt" }),
						listOptions,
					),
				{
					abortSignal: abortController?.signal,
					browserOperationOwned: dependencies.browserOperationOwned,
					onInventoryStage: reportStage,
				},
			);
			abortController?.signal.throwIfAborted();
			let adapterFailure: { error: unknown } | undefined;
			try {
				reportStage("inventory");
				if (input.action === "test" && input.submit) {
					return {
						action: "list" as const,
						status: "observed" as const,
						state: await withChatgptDeveloperAppDeadline(
							active.adapter.readState(),
							normalizePositiveTimeout(
								dependencies.listTimeoutMs,
								DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS +
									resolveChatgptBackendRequestBudgetWaitMs(
										userConfig as Record<string, unknown>,
										userConfig.auracallProfile ?? "default",
									),
							),
							"ChatGPT developer-app test preflight timed out.",
							(error) => abortController?.abort(error),
						),
					};
				}
				return await executeChatgptDeveloperAppOperation(input, active.adapter);
			} catch (error) {
				failureStage = stage;
				adapterFailure = { error };
				throw error;
			} finally {
				reportStage("cleanup");
				const adapter = active.adapter;
				active.adapter = null;
				await closeDeveloperAppAdapter(adapter, adapterFailure);
			}
		};
		if (
			!browser.runUtilityBrowserOperation &&
			userConfig.browser?.tabConcurrencyMode === "tab-affinity"
		) {
			throw new Error("ChatGPT developer-app affinity requires utility-operation support.");
		}
		const submitting = input.action === "test" && input.submit;
		reportStage("utility-admission");
		const observed = browser.runUtilityBrowserOperation
			? await browser.runUtilityBrowserOperation({
					options: { abortSignal: abortController?.signal },
					mutability: input.action === "list" || submitting ? "read-only" : "provider-mutating",
					run,
				})
			: await run({});
		if (!submitting) return observed;
		// Inventory custody must settle before the shared submission lifecycle
		// acquires this process's tab. It revalidates account/app identity before Send.
		active.adapter = createAdapter(
			browser,
			(config) => createBrowser(config, { target: "chatgpt" }),
			{
				browserOperationOwned: dependencies.browserOperationOwned,
				modelStrategy: input.action === "test" ? input.modelStrategy : undefined,
			},
		);
		let adapterFailure: { error: unknown } | undefined;
		try {
			return await executeChatgptDeveloperAppOperationWithState(
				input,
				active.adapter,
				observed.state,
			);
		} catch (error) {
			adapterFailure = { error };
			throw error;
		} finally {
			const adapter = active.adapter;
			active.adapter = null;
			await closeDeveloperAppAdapter(adapter, adapterFailure);
		}
	};
	try {
		if (input.action !== "list" && input.action !== "refresh-tools") return await operation();
		const timeoutMs = normalizePositiveTimeout(
			input.action === "refresh-tools"
				? dependencies.refreshToolsTimeoutMs
				: dependencies.listTimeoutMs,
			(input.action === "refresh-tools" ? 90_000 : DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS) +
				resolveChatgptBackendRequestBudgetWaitMs(
					userConfig as Record<string, unknown>,
					userConfig.auracallProfile ?? "default",
				),
		);
		dependencies.onProgress?.({ stage, timeoutMs });
		return await withChatgptDeveloperAppDeadline(
			operation(),
			timeoutMs,
			`ChatGPT developer-app ${input.action} timed out after ${timeoutMs}ms.`,
			(error) => abortController?.abort(error),
			() =>
				new DeveloperAppTimeoutError(
					`ChatGPT developer-app ${input.action} timed out after ${timeoutMs}ms.`,
					stage,
					timeoutMs,
				),
		);
	} catch (error) {
		operationFailure = error;
		if (input.action !== "list" || error instanceof DeveloperAppTimeoutError) throw error;
		throw Object.assign(
			new Error(error instanceof Error ? error.message : String(error), { cause: error }),
			{
				stage: failureStage ?? stage,
				code:
					typeof (error as { code?: unknown } | null)?.code === "string"
						? (error as { code: string }).code
						: "developer_app_failed",
			},
		);
	} finally {
		abortController?.abort();
		if (active.adapter) {
			const closeTimeoutMs = normalizePositiveTimeout(
				dependencies.closeTimeoutMs,
				DEFAULT_CHATGPT_DEVELOPER_APP_CLOSE_TIMEOUT_MS,
			);
			await withChatgptDeveloperAppDeadline(
				active.adapter.close(),
				closeTimeoutMs,
				`ChatGPT developer-app browser client close timed out after ${closeTimeoutMs}ms.`,
			).catch((error: unknown) => {
				if (hasUnknownOwnedRequestCleanup(error)) {
					if (input.action !== "list") throw error;
					throw Object.assign(
						new AggregateError(
							operationFailure === undefined ? [error] : [operationFailure, error],
							"Developer-app owned cleanup remains unknown.",
						),
						{ stage: "cleanup", code: "developer_app_cleanup_unknown" },
					);
				}
			});
		}
	}
}

async function closeDeveloperAppAdapter(
	adapter: ChatgptDeveloperAppCliAdapter,
	primaryFailure?: { error: unknown },
): Promise<void> {
	try {
		await adapter.close();
	} catch (error) {
		if (!hasUnknownOwnedRequestCleanup(error)) return;
		if (primaryFailure)
			throw new AggregateError(
				[primaryFailure.error, error],
				"Developer-app operation and owned cleanup failed.",
			);
		throw error;
	}
}

function scopeChatgptDeveloperAppBrowser(
	browser: ChatgptDeveloperAppBrowserClient,
	listOptions: BrowserProviderListOptions,
): ChatgptDeveloperAppBrowserClient {
	const exactConnection = {
		host: listOptions.host,
		port: listOptions.port,
		tabTargetId: listOptions.tabTargetId,
	};
	return {
		userConfig: browser.userConfig,
		getUserIdentity: (options) =>
			browser.getUserIdentity({ ...listOptions, ...options, ...exactConnection }),
		connectDevTools: async (options) => {
			const connected = await browser.connectDevTools({ ...options, ...exactConnection });
			if (listOptions.providerTrafficGovernor || listOptions.providerTrafficAuthorityFactory) {
				try {
					await annotateClientMutationContext(
						connected.client,
						{ ...listOptions, abortSignal: options?.abortSignal ?? listOptions.abortSignal },
						"provider:chatgpt:developer-apps",
						listOptions.tabTargetId,
					);
					await resolveProviderTrafficGovernor(connected.client)?.checkWarning?.(
						connected.client.Runtime,
					);
				} catch (error) {
					try {
						await connected.client.close();
					} catch (cleanup) {
						throw new AggregateError(
							[error, cleanup],
							"Developer-app connection admission and cleanup failed.",
						);
					}
					throw error;
				}
			}
			return connected;
		},
	};
}

function normalizePositiveTimeout(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

async function withChatgptDeveloperAppDeadline<T>(
	operation: Promise<T>,
	timeoutMs: number,
	message: string,
	onTimeout?: (error: Error) => void,
	createError?: () => Error,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					const error = createError?.() ?? new Error(message);
					try {
						onTimeout?.(error);
					} finally {
						reject(error);
					}
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export function formatChatgptDeveloperAppOperationResult(
	result: ChatgptDeveloperAppOperationResult,
): string {
	const account = result.state.account.email ?? "unknown";
	const header = [
		`ChatGPT developer apps (${account})`,
		`Developer mode: ${result.state.developerMode === null ? "unknown" : result.state.developerMode ? "enabled" : "disabled"}`,
		`Inventory complete: ${result.state.inventoryComplete ? "yes" : "no"}`,
	];
	if (result.action !== "list") {
		return [
			...header,
			`Action: ${result.action}`,
			`Status: ${result.status}`,
			...(result.outcome.catalog
				? [
						`Tool count: ${result.outcome.catalog.toolCount}`,
						`Catalog SHA-256: ${result.outcome.catalog.sha256}`,
					]
				: []),
			result.outcome.message,
			...(result.outcome.currentUrl ? [`Current URL: ${result.outcome.currentUrl}`] : []),
			...(result.outcome.conversationId ? [`Conversation: ${result.outcome.conversationId}`] : []),
			...(result.outcome.effectState
				? [
						`Provider effect: ${result.outcome.effectState}; retry safe: ${result.outcome.retrySafe === true ? "yes" : "no"}`,
					]
				: []),
			...(result.outcome.answerText !== undefined ? [`Answer: ${result.outcome.answerText}`] : []),
		].join("\n");
	}
	const rows = result.state.apps.map((app) =>
		[
			app.name,
			app.pluginId,
			app.reviewStatus ?? app.discoverability ?? "installed",
			app.authStatus ?? "auth unknown",
			app.status ?? "status unknown",
		].join(" | "),
	);
	return [
		...header,
		`Installed apps: ${result.state.apps.length}`,
		...(rows.length > 0 ? rows : ["(none)"]),
	].join("\n");
}

function normalizeAccount(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function resolveExactApp(
	apps: readonly ChatgptDeveloperApp[],
	reference: string,
): ChatgptDeveloperApp {
	const normalized = normalizeAccount(reference);
	const matches = apps.filter((app) =>
		[app.pluginId, app.name, ...app.appIds].some(
			(candidate) => normalizeAccount(candidate) === normalized,
		),
	);
	if (matches.length === 0) {
		throw new Error(`ChatGPT developer app "${reference}" is not installed.`);
	}
	if (matches.length > 1) {
		throw new Error(
			`ChatGPT developer app "${reference}" is ambiguous; use an exact plugin id or app id.`,
		);
	}
	return matches[0];
}

function normalizeCreateInput(
	input: Extract<ChatgptDeveloperAppOperationInput, { action: "create" }>,
): ChatgptDeveloperAppCreateInput {
	return normalizeDeveloperAppCreateInput(input);
}

function normalizeDeveloperAppCreateInput(
	input: ChatgptDeveloperAppCreateInput,
): ChatgptDeveloperAppCreateInput {
	const name = input.name.trim();
	if (!name) {
		throw new Error("ChatGPT developer-app create requires --name.");
	}
	let serverUrl: URL;
	try {
		serverUrl = new URL(input.serverUrl);
	} catch {
		throw new Error("ChatGPT developer-app create requires a valid --server-url.");
	}
	if (serverUrl.protocol !== "https:" && serverUrl.hostname !== "localhost") {
		throw new Error("ChatGPT developer-app server URL must use HTTPS unless it is localhost.");
	}
	if (input.auth !== "oauth" && input.auth !== "none" && input.auth !== "mixed") {
		throw new Error("ChatGPT developer-app auth must be oauth, none, or mixed.");
	}
	if (input.connection !== "server-url" && input.connection !== "tunnel") {
		throw new Error("ChatGPT developer-app connection must be server-url or tunnel.");
	}
	return {
		name,
		serverUrl: serverUrl.href,
		description: input.description?.trim() || null,
		auth: input.auth,
		connection: input.connection,
	};
}

function replacementTargetRemains(
	apps: readonly ChatgptDeveloperApp[],
	target: ChatgptDeveloperApp,
): boolean {
	const targetIds = new Set(
		[target.pluginId, ...target.appIds].map(normalizeAccount).filter(Boolean),
	);
	const targetName = normalizeAccount(target.name);
	return apps.some((app) => {
		if (normalizeAccount(app.name) === targetName) return true;
		return [app.pluginId, ...app.appIds]
			.map(normalizeAccount)
			.some((candidate) => targetIds.has(candidate));
	});
}

function assertUniqueReplacementName(
	apps: readonly ChatgptDeveloperApp[],
	target: ChatgptDeveloperApp,
): void {
	const sameName = apps.filter(
		(app) => normalizeAccount(app.name) === normalizeAccount(target.name),
	);
	if (sameName.length !== 1 || sameName[0].pluginId !== target.pluginId) {
		throw new Error(
			`ChatGPT developer app ${target.name} cannot be replaced because more than one installed app has the same normalized name.`,
		);
	}
}

function assertNoExistingAppName(apps: readonly ChatgptDeveloperApp[], name: string): void {
	const existing = apps.find((app) => normalizeAccount(app.name) === normalizeAccount(name));
	if (existing) {
		throw new Error(
			`ChatGPT already has one installed app named ${existing.name}; refusing to create a duplicate.`,
		);
	}
}

function appIdentityOverlaps(left: ChatgptDeveloperApp, right: ChatgptDeveloperApp): boolean {
	const rightIds = new Set([right.pluginId, ...right.appIds].map(normalizeAccount).filter(Boolean));
	return [left.pluginId, ...left.appIds]
		.map(normalizeAccount)
		.some((candidate) => rightIds.has(candidate));
}

function buildRecreatePendingOutcome(
	app: ChatgptDeveloperApp,
	input: ChatgptDeveloperAppCreateInput,
	reason: string,
): ChatgptDeveloperAppMutationOutcome {
	return {
		status: "recreate-pending",
		message: `${app.name} was deleted, but recreation is pending: ${reason}. Verify the old app remains absent, then resume with guarded apps create using the returned input.`,
		app,
		recovery: {
			action: "create",
			input,
			reason,
		},
	};
}

function readErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeTestPrompt(value: string | null | undefined): string {
	const prompt = String(value ?? "").trim();
	if (!prompt) {
		throw new Error("ChatGPT developer-app submitted test requires --prompt.");
	}
	return prompt;
}
