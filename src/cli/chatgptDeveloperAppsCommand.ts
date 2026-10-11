import type { DeveloperAppSubmissionEvidence } from "../browser/chatgptDeveloperAppSubmission.js";
import { BrowserAutomationClient } from "../browser/client.js";
import {
	type ChatgptDeveloperAppBrowserClient,
	type ChatgptDeveloperAppBrowserClientFactory,
	createChatgptDeveloperAppBrowserAdapter,
} from "../browser/providers/chatgptDeveloperApps.js";
import type { BrowserProviderListOptions } from "../browser/providers/types.js";
import type { ResolvedUserConfig } from "../config.js";

const DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS = 45_000;
const DEFAULT_CHATGPT_DEVELOPER_APP_CLOSE_TIMEOUT_MS = 5_000;

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
	readState(): Promise<ChatgptDeveloperAppState>;
	create(input: ChatgptDeveloperAppCreateInput): Promise<ChatgptDeveloperAppMutationOutcome>;
	delete(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	selectForTest(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	submitTest(app: ChatgptDeveloperApp, prompt: string): Promise<ChatgptDeveloperAppMutationOutcome>;
	uninstall(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
}

type ChatgptDeveloperAppCliAdapter = ChatgptDeveloperAppAdapter & {
	close(): Promise<void>;
};

export interface ChatgptDeveloperAppCliDependencies {
	browserOperationOwned?: boolean;
	listTimeoutMs?: number;
	closeTimeoutMs?: number;
	createBrowser?: (
		userConfig: ResolvedUserConfig,
		options: { target: "chatgpt" },
	) => Promise<ChatgptDeveloperAppBrowserClient>;
	createAdapter?: (
		browser: ChatgptDeveloperAppBrowserClient,
		createBrowser: ChatgptDeveloperAppBrowserClientFactory,
		options: { abortSignal?: AbortSignal; browserOperationOwned?: boolean },
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
	status: "completed" | "awaiting-human" | "recreate-pending" | "failed";
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
	let state = await adapter.readState();
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
	const abortController = input.action === "list" ? new AbortController() : null;
	const active: { adapter: ChatgptDeveloperAppCliAdapter | null } = { adapter: null };
	const operation = async () => {
		const browser = await createBrowser(userConfig, { target: "chatgpt" });
		abortController?.signal.throwIfAborted();
		const run = async (listOptions: BrowserProviderListOptions) => {
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
				},
			);
			abortController?.signal.throwIfAborted();
			try {
				return await executeChatgptDeveloperAppOperation(input, active.adapter);
			} finally {
				await active.adapter.close().catch(() => undefined);
				active.adapter = null;
			}
		};
		if (!browser.runUtilityBrowserOperation) {
			if (userConfig.browser?.tabConcurrencyMode === "tab-affinity") {
				throw new Error("ChatGPT developer-app affinity requires utility-operation support.");
			}
			return run({});
		}
		return browser.runUtilityBrowserOperation({
			options: { abortSignal: abortController?.signal },
			mutability: input.action === "list" ? "read-only" : "provider-mutating",
			run,
		});
	};
	try {
		if (input.action !== "list") return await operation();
		const timeoutMs = normalizePositiveTimeout(
			dependencies.listTimeoutMs,
			DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS,
		);
		return await withChatgptDeveloperAppDeadline(
			operation(),
			timeoutMs,
			`ChatGPT developer-app list timed out after ${timeoutMs}ms.`,
			(error) => abortController?.abort(error),
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
			).catch(() => undefined);
		}
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
		connectDevTools: (options) => browser.connectDevTools({ ...options, ...exactConnection }),
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
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					const error = new Error(message);
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
