import type { DevToolsConnectionOptions } from "../../../packages/browser-service/src/types.js";
import type { ResolvedUserConfig } from "../../config.js";
import {
	ensureChatgptEcosystemMention,
	readChatgptEcosystemMention,
} from "../actions/chatgptEcosystemMention.js";
import {
	type DeveloperAppSubmissionEvidence,
	type DeveloperAppSubmissionOptions,
	submitChatgptDeveloperApp,
} from "../chatgptDeveloperAppSubmission.js";
import {
	navigateAndSettle,
	openAndSelectMenuItem,
	pressButton,
	pressButtonWithTrustedPointer,
	reloadAndSettle,
	setInputValue,
	waitForPredicate,
} from "../service/ui.js";
import type { ChromeClient } from "../types.js";
import {
	classifyChatgptBlockingSurfaceProbe,
	normalizeChatgptInstalledAppProbes,
	normalizeChatgptLinkedAppProbes,
} from "./chatgptAdapter.js";
import type { BrowserProviderListOptions, ProviderUserIdentity } from "./types.js";

export interface ChatgptDeveloperAppStateInput {
	identity: ProviderUserIdentity | null;
	developerMode: boolean | null;
	featureSignature: string | null | undefined;
	observedAt: string;
}

export interface ChatgptDeveloperAppBrowserState {
	account: {
		email: string | null;
		plan: string | null;
	};
	developerMode: boolean | null;
	inventoryComplete: boolean;
	apps: ChatgptDeveloperAppBrowserEntry[];
	observedAt: string;
}

export interface ChatgptDeveloperAppBrowserEntry {
	pluginId: string;
	appIds: string[];
	name: string;
	status: string | null;
	enabled: boolean | null;
	authStatus: string | null;
	reviewStatus: string | null;
	authorization: string | null;
	endpoint: string | null;
	versionId: string | null;
	scope: string | null;
	discoverability: string | null;
	creatorName: string | null;
	description: string | null;
}

export type ChatgptDeveloperAppBrowserTarget = Pick<
	ChatgptDeveloperAppBrowserEntry,
	"pluginId" | "appIds" | "name"
> &
	Partial<Omit<ChatgptDeveloperAppBrowserEntry, "pluginId" | "appIds" | "name">>;

export interface ChatgptDeveloperAppBrowserMutationOutcome extends DeveloperAppSubmissionEvidence {
	status: "completed" | "awaiting-human" | "failed";
	message: string;
	currentUrl?: string | null;
	app?: ChatgptDeveloperAppBrowserTarget | null;
}

export interface ChatgptDeveloperAppBrowserCreateInput {
	name: string;
	serverUrl: string;
	description?: string | null;
	auth: "oauth" | "none" | "mixed";
	connection: "server-url" | "tunnel";
}

export interface ChatgptDeveloperAppTargetSnapshot {
	targetId: string;
	type: string;
	url: string;
}

export interface ChatgptDeveloperAppCreateSurfaceProbe {
	url: string | null;
	createDialogVisible: boolean;
	dialogText: string | null;
	alertTexts: string[];
}

export interface ChatgptDeveloperAppCreatePostconditionInput {
	auth: ChatgptDeveloperAppBrowserCreateInput["auth"];
	appName: string;
	apps: ChatgptDeveloperAppBrowserEntry[];
	inventoryComplete: boolean;
	preSubmitTargets: ChatgptDeveloperAppTargetSnapshot[];
	postSubmitTargets: ChatgptDeveloperAppTargetSnapshot[];
}

export type ChatgptDeveloperAppCreatePostcondition =
	| {
			status: "awaiting-human";
			app: ChatgptDeveloperAppBrowserEntry | null;
			handoffUrl: string;
	  }
	| {
			status: "completed";
			app: ChatgptDeveloperAppBrowserEntry;
			handoffUrl: null;
	  }
	| {
			status: "unconfirmed";
			app: null;
			handoffUrl: null;
	  };

export const CHATGPT_DEVELOPER_APP_SERVER_URL_SELECTOR =
	'[role="dialog"] input[name="custom-connector-url"]';

const CHATGPT_DEVELOPER_APP_ATTACHMENT_STAGE_TIMEOUT_MS = 10_000;

export interface ChatgptDeveloperAppBrowserClient {
	readonly userConfig: ResolvedUserConfig;
	getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null>;
	connectDevTools(
		options?: DevToolsConnectionOptions,
	): Promise<{ client: ChromeClient; port: number }>;
	runUtilityBrowserOperation?<TResult>(input: {
		options?: BrowserProviderListOptions;
		mutability: "read-only" | "provider-mutating";
		run: (options: BrowserProviderListOptions) => Promise<TResult>;
	}): Promise<TResult>;
}

export type ChatgptDeveloperAppBrowserClientFactory = (
	userConfig: ResolvedUserConfig,
) => Promise<ChatgptDeveloperAppBrowserClient>;

export class ChatgptDeveloperAppBrowserAdapter {
	private cdpClient: ChromeClient | null = null;

	constructor(
		private readonly browser: ChatgptDeveloperAppBrowserClient,
		_createBrowser: ChatgptDeveloperAppBrowserClientFactory,
		private readonly abortSignal?: AbortSignal,
		private readonly submissionOptions: DeveloperAppSubmissionOptions = {},
	) {}

	async readState(): Promise<ChatgptDeveloperAppBrowserState> {
		this.throwIfAborted();
		debugDeveloperApps("reading ChatGPT identity");
		const identity = await this.browser.getUserIdentity({ abortSignal: this.abortSignal });
		this.throwIfAborted();
		debugDeveloperApps("connecting to the managed browser for app inventory");
		const client = await this.ensureClient();
		const originalUrl = await readCurrentUrl(client);
		try {
			debugDeveloperApps("reading installed and linked app signals");
			const featureSignature = await captureChatgptDeveloperAppFeatureSignature(client);
			this.throwIfAborted();
			debugDeveloperApps("reading Developer mode");
			const developerMode = await readChatgptDeveloperMode(client);
			this.throwIfAborted();
			debugDeveloperApps("developer-app inventory complete");
			return deriveChatgptDeveloperAppState({
				identity,
				developerMode,
				featureSignature,
				observedAt: new Date().toISOString(),
			});
		} finally {
			if (originalUrl?.startsWith("https://chatgpt.com/")) {
				await navigateChatgpt(client, originalUrl).catch(() => undefined);
			}
		}
	}

	async create(
		input: ChatgptDeveloperAppBrowserCreateInput,
	): Promise<ChatgptDeveloperAppBrowserMutationOutcome> {
		const client = await this.ensureClient();
		await navigateChatgpt(client, "https://chatgpt.com/plugins");
		await assertNoChatgptBlockingSurface(client, "create developer app");
		const opened = await pressButtonWithTrustedPointer(client, {
			selector: 'button[aria-label="Create app"]',
			requireVisible: true,
			postSelector: '[role="dialog"]',
			timeoutMs: 8_000,
		});
		if (!opened.ok) {
			throw new Error(
				`Unable to open ChatGPT Create app: ${opened.reason ?? "control not found"}.`,
			);
		}
		await setRequiredInput(client, 'input[aria-label="Name"]', input.name, "app name");
		if (input.description) {
			await setRequiredInput(
				client,
				'input[aria-label="Description (optional)"]',
				input.description,
				"app description",
			);
		}
		const connectionLabel = input.connection === "tunnel" ? "Tunnel" : "Server URL";
		const connectionSelector = `[role="dialog"] button[role="radio"][aria-label="${connectionLabel}"]`;
		const connectionSelected = await selectChatgptDeveloperAppConnectionMode(
			client,
			connectionSelector,
		);
		if (!connectionSelected) {
			throw new Error(`Unable to select ChatGPT app connection mode ${connectionLabel}.`);
		}
		const connectionReady = await waitForPredicate(
			client.Runtime,
			`document.querySelector(${JSON.stringify(
				connectionSelector,
			)})?.getAttribute('aria-checked') === 'true'`,
			{
				timeoutMs: 3_000,
				description: `selected ChatGPT app connection mode ${connectionLabel}`,
			},
		);
		if (!connectionReady.ok) {
			throw new Error(`ChatGPT app connection mode ${connectionLabel} did not become selected.`);
		}
		await setRequiredInput(
			client,
			CHATGPT_DEVELOPER_APP_SERVER_URL_SELECTOR,
			input.serverUrl,
			"MCP server URL",
		);
		await selectNativeOptionByText(
			client,
			'[role="dialog"] select',
			input.auth === "none" ? "No Auth" : input.auth === "mixed" ? "Mixed" : "OAuth",
		);
		const acknowledged = await pressButtonWithTrustedPointer(client, {
			selector: '[role="dialog"] input#trust-checkbox',
			requireVisible: true,
			timeoutMs: 5_000,
		});
		if (!acknowledged.ok) {
			throw new Error("Unable to acknowledge the ChatGPT custom MCP server risk warning.");
		}
		const createReady = await waitForPredicate(
			client.Runtime,
			`(() => {
        const buttons = Array.from(document.querySelectorAll('[role="dialog"] button'));
        const button = buttons.find((candidate) => String(candidate.textContent || '').trim() === 'Create');
        return Boolean(button && !button.disabled);
      })()`,
			{ timeoutMs: 15_000, description: "enabled ChatGPT Create app button" },
		);
		if (!createReady.ok) {
			throw new Error("ChatGPT Create app did not become enabled after form validation.");
		}
		const preSubmitTargets = await readChatgptDeveloperAppTargetSnapshots(client);
		const submitted = await pressButtonWithTrustedPointer(client, {
			rootSelectors: ['[role="dialog"]'],
			match: { exact: ["create"] },
			requireVisible: true,
			timeoutMs: 5_000,
		});
		if (!submitted.ok) {
			throw new Error(
				`Unable to submit ChatGPT Create app: ${submitted.reason ?? "button unavailable"}.`,
			);
		}
		const postSubmitObservation = await waitForChatgptDeveloperAppPostSubmitObservation(
			client,
			input,
			preSubmitTargets,
		);
		await assertNoChatgptBlockingSurface(client, "create developer app");
		const postSubmitTargets = postSubmitObservation.targets;
		const navigationPostcondition = classifyChatgptDeveloperAppCreatePostcondition({
			auth: input.auth,
			appName: input.name,
			apps: [],
			inventoryComplete: false,
			preSubmitTargets,
			postSubmitTargets,
		});
		if (navigationPostcondition.status === "awaiting-human") {
			return {
				status: "awaiting-human",
				message:
					"App creation opened a fresh OAuth or human-action surface. Complete only the visible sign-in, MFA, or consent in the managed browser, then rerun apps list.",
				currentUrl: navigationPostcondition.handoffUrl,
			};
		}
		const rejectedSurface = summarizeChatgptDeveloperAppCreateSurfaceProbe(
			postSubmitObservation.surface,
		);
		if (rejectedSurface) {
			throw new Error(
				`ChatGPT developer app ${input.name} submission was not accepted: ${rejectedSurface}.`,
			);
		}

		await navigateChatgpt(client, "https://chatgpt.com/plugins");
		const featureSignature = await captureChatgptDeveloperAppFeatureSignature(client);
		const postCreateState = deriveChatgptDeveloperAppState({
			identity: null,
			developerMode: true,
			featureSignature,
			observedAt: new Date().toISOString(),
		});
		const inventoryPostcondition = classifyChatgptDeveloperAppCreatePostcondition({
			auth: input.auth,
			appName: input.name,
			apps: postCreateState.apps,
			inventoryComplete: postCreateState.inventoryComplete,
			preSubmitTargets,
			postSubmitTargets,
		});
		if (inventoryPostcondition.status !== "completed") {
			throw new Error(
				`ChatGPT developer app ${input.name} creation is unconfirmed: no fresh OAuth or human-action surface appeared and fresh complete inventory did not contain exactly one exact app.`,
			);
		}
		return {
			status: "completed",
			message: `${input.name} creation confirmed by fresh installed-app inventory.`,
			currentUrl: await readCurrentUrl(client),
			app: inventoryPostcondition.app,
		};
	}

	async selectForTest(
		app: ChatgptDeveloperAppBrowserTarget,
	): Promise<ChatgptDeveloperAppBrowserMutationOutcome> {
		const client = await this.ensureClient();
		await navigateChatgpt(client, "https://chatgpt.com/");
		await assertNoChatgptBlockingSurface(client, `select ${app.name}`);
		await clearDeveloperAppComposer(client);
		try {
			await ensureChatgptEcosystemMention(client, {
				label: app.name,
				acceptedPluginIds: [app.pluginId, ...app.appIds],
			});
			const selected = await readChatgptEcosystemMention(client);
			if (!selected || !chatgptDeveloperAppSelectionMatchesForTest(selected.pluginId, app)) {
				throw new Error(`ChatGPT selected ${selected?.label ?? "no app"} instead of ${app.name}.`);
			}
			return {
				status: "completed",
				message: `${app.name} selected without prompt submission; the blank composer was cleared afterward.`,
				currentUrl: await readCurrentUrl(client),
				app,
			};
		} finally {
			await clearDeveloperAppComposer(client);
		}
	}

	async submitTest(
		app: ChatgptDeveloperAppBrowserTarget,
		prompt: string,
	): Promise<ChatgptDeveloperAppBrowserMutationOutcome> {
		const result = await submitChatgptDeveloperApp(this.browser.userConfig, app, prompt, {
			...this.submissionOptions,
			abortSignal: this.abortSignal,
		});
		return {
			...result,
			app,
		};
	}

	async delete(
		app: ChatgptDeveloperAppBrowserTarget,
	): Promise<ChatgptDeveloperAppBrowserMutationOutcome> {
		const client = await this.ensureClient();
		await navigateChatgpt(
			client,
			`https://chatgpt.com/plugins#settings/Plugins/${encodeURIComponent(app.pluginId)}`,
		);
		await assertNoChatgptBlockingSurface(client, `delete ${app.name}`);
		const targetMarker = `auracall-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const ready = await waitForChatgptDeveloperAppSettingsForDelete(client, app, targetMarker);
		if (!ready.ok) {
			throw new Error(
				`ChatGPT developer app ${app.name} did not expose its exact Developer mode management surface.`,
			);
		}
		const opened = await pressButtonWithTrustedPointer(client, {
			selector: `button[data-auracall-delete-trigger="${targetMarker}"]`,
			requireVisible: true,
			postSelector: '[role="menu"]',
			timeoutMs: 8_000,
		});
		const exactMenuReady = await markExactChatgptDeveloperAppDeleteMenu(client, targetMarker);
		if (!opened.ok && !exactMenuReady.ok) {
			throw new Error(
				`Unable to open the exact Developer mode actions for ${app.name}: ${opened.reason ?? "trusted pointer activation failed"}.`,
			);
		}
		if (!exactMenuReady.ok) {
			throw new Error(`Unable to isolate one exact Delete menu item for ${app.name}.`);
		}
		const selected = await pressButtonWithTrustedPointer(client, {
			selector: `[data-auracall-delete-item="${targetMarker}"]`,
			requireVisible: true,
			timeoutMs: 8_000,
		});
		if (!selected.ok) {
			throw new Error(
				`Unable to select the exact Delete action for ${app.name}: ${selected.reason ?? "trusted pointer activation failed"}.`,
			);
		}
		await wait(750);
		await assertNoChatgptBlockingSurface(client, `complete delete ${app.name}`);
		return {
			status: "completed",
			message: `${app.name} Delete action selected.`,
			currentUrl: await readCurrentUrl(client),
			app,
		};
	}

	async uninstall(
		app: ChatgptDeveloperAppBrowserTarget,
	): Promise<ChatgptDeveloperAppBrowserMutationOutcome> {
		const client = await this.ensureClient();
		await navigateChatgpt(
			client,
			`https://chatgpt.com/plugins/${encodeURIComponent(app.pluginId)}`,
		);
		await assertNoChatgptBlockingSurface(client, `uninstall ${app.name}`);
		const selected = await openAndSelectMenuItem(client.Runtime, {
			trigger: {
				selector: 'button[aria-label="Plugin actions"]',
				interactionStrategies: ["pointer"],
				requireVisible: true,
			},
			itemMatch: { exact: ["uninstall"] },
			menuSelector: '[role="menu"]',
			timeoutMs: 8_000,
		});
		if (!selected) {
			throw new Error(`Unable to open the uninstall confirmation for ${app.name}.`);
		}
		const confirmed = await pressButton(client.Runtime, {
			rootSelectors: ['[role="dialog"]'],
			match: { exact: ["uninstall"] },
			interactionStrategies: ["pointer"],
			requireVisible: true,
			timeoutMs: 8_000,
		});
		if (!confirmed.ok) {
			throw new Error(`Unable to confirm uninstall for ${app.name}.`);
		}
		return {
			status: "completed",
			message: `${app.name} uninstall confirmed.`,
			currentUrl: await readCurrentUrl(client),
			app,
		};
	}

	async close(): Promise<void> {
		const client = this.cdpClient;
		this.cdpClient = null;
		debugDeveloperApps("closing developer-app browser client");
		await client?.close().catch(() => undefined);
		debugDeveloperApps("developer-app browser client closed");
	}

	private async ensureClient(): Promise<ChromeClient> {
		this.throwIfAborted();
		if (this.cdpClient) return this.cdpClient;
		const connected = await this.browser.connectDevTools({
			abortSignal: this.abortSignal,
			stageTimeoutMs: CHATGPT_DEVELOPER_APP_ATTACHMENT_STAGE_TIMEOUT_MS,
			onStage: (stage) => debugDeveloperApps(`DevTools attachment stage: ${stage}`),
		});
		this.throwIfAborted();
		this.cdpClient = connected.client;
		try {
			await this.runAttachmentStage(
				"browserDevToolsRuntimeEnable",
				this.cdpClient.Runtime.enable(),
			);
			await this.runAttachmentStage("browserDevToolsPageEnable", this.cdpClient.Page.enable());
			this.throwIfAborted();
			return this.cdpClient;
		} catch (error) {
			const client = this.cdpClient;
			this.cdpClient = null;
			await client.close().catch(() => undefined);
			throw error;
		}
	}

	private runAttachmentStage<T>(stage: string, operation: Promise<T>): Promise<T> {
		debugDeveloperApps(`DevTools attachment stage: ${stage}`);
		return runDeveloperAppAttachmentStage(operation, {
			stage,
			abortSignal: this.abortSignal,
			timeoutMs: CHATGPT_DEVELOPER_APP_ATTACHMENT_STAGE_TIMEOUT_MS,
		});
	}

	private throwIfAborted(): void {
		this.abortSignal?.throwIfAborted();
	}
}

function runDeveloperAppAttachmentStage<T>(
	operation: Promise<T>,
	options: { stage: string; abortSignal?: AbortSignal; timeoutMs: number },
): Promise<T> {
	options.abortSignal?.throwIfAborted();
	let timeout: NodeJS.Timeout | null = null;
	let onAbort: (() => void) | null = null;
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => {
			if (timeout) clearTimeout(timeout);
			if (onAbort && options.abortSignal) {
				options.abortSignal.removeEventListener("abort", onAbort);
			}
		};
		operation.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
		onAbort = () => {
			cleanup();
			reject(options.abortSignal?.reason ?? new Error("DevTools attachment aborted."));
		};
		options.abortSignal?.addEventListener("abort", onAbort, { once: true });
		timeout = setTimeout(() => {
			cleanup();
			reject(
				new Error(
					`DevTools attachment stage ${options.stage} timed out after ${options.timeoutMs}ms.`,
				),
			);
		}, options.timeoutMs);
	});
}

export function createChatgptDeveloperAppBrowserAdapter(
	browser: ChatgptDeveloperAppBrowserClient,
	createBrowser: ChatgptDeveloperAppBrowserClientFactory,
	options: DeveloperAppSubmissionOptions = {},
): ChatgptDeveloperAppBrowserAdapter {
	return new ChatgptDeveloperAppBrowserAdapter(
		browser,
		createBrowser,
		options.abortSignal,
		options,
	);
}

export function deriveChatgptDeveloperAppState(
	input: ChatgptDeveloperAppStateInput,
): ChatgptDeveloperAppBrowserState {
	const signature = parseRecord(input.featureSignature);
	const installed = Array.isArray(signature?.installed_apps) ? signature.installed_apps : [];
	const links = Array.isArray(signature?.linked_apps) ? signature.linked_apps.filter(isRecord) : [];
	const apps = installed
		.filter(isRecord)
		.map((record): ChatgptDeveloperAppBrowserEntry | null => {
			const pluginId = readString(record.plugin_id);
			const name = readString(record.name);
			if (!pluginId || !name) return null;
			const appIds = readStringArray(record.app_ids);
			const matchingLinks = links.filter((candidate) =>
				appIds.some((appId) => appIdentityMatches(appId, readString(candidate.connector_id))),
			);
			const link = matchingLinks.length === 1 ? matchingLinks[0] : null;
			const scope = readString(record.scope);
			const discoverability = readString(record.discoverability);
			const providerName = readString(record.provider_name);
			const reviewStatus =
				scope === "USER" && discoverability === "PRIVATE" && providerName?.startsWith("dev-")
					? "development"
					: null;
			return {
				pluginId,
				appIds,
				name,
				status: readString(record.status),
				enabled: readBoolean(record.enabled),
				authStatus: readString(link?.auth_status),
				reviewStatus,
				authorization: readString(record.authentication_policy),
				endpoint: readString(record.endpoint),
				versionId: readString(record.release_version),
				scope,
				discoverability,
				creatorName: readString(record.creator_name),
				description: readString(record.description),
			};
		})
		.filter((app): app is ChatgptDeveloperAppBrowserEntry => app !== null)
		.sort((left, right) => left.name.localeCompare(right.name));
	return {
		account: {
			email: readString(input.identity?.email),
			plan: readString(input.identity?.accountPlanType ?? input.identity?.accountLevel),
		},
		developerMode: input.developerMode,
		inventoryComplete: signature?.inventory_complete === true,
		apps,
		observedAt: input.observedAt,
	};
}

export function classifyChatgptDeveloperAppCreatePostconditionForTest(
	input: ChatgptDeveloperAppCreatePostconditionInput,
): ChatgptDeveloperAppCreatePostcondition {
	return classifyChatgptDeveloperAppCreatePostcondition(input);
}

export function summarizeChatgptDeveloperAppCreateSurfaceProbeForTest(
	probe: ChatgptDeveloperAppCreateSurfaceProbe,
): string | null {
	return summarizeChatgptDeveloperAppCreateSurfaceProbe(probe);
}

function summarizeChatgptDeveloperAppCreateSurfaceProbe(
	probe: ChatgptDeveloperAppCreateSurfaceProbe,
): string | null {
	const alerts = probe.alertTexts
		.map((value) => compactDiagnosticText(value))
		.filter(Boolean)
		.slice(0, 3);
	if (alerts.length > 0) {
		return `provider alert remained visible (${alerts.join(" | ")})`;
	}
	if (!probe.createDialogVisible) return null;
	const dialogText = compactDiagnosticText(probe.dialogText);
	return dialogText
		? `Create app dialog remained open (${dialogText})`
		: "Create app dialog remained open without a visible provider explanation";
}

function compactDiagnosticText(value: string | null | undefined): string {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 480);
}

function classifyChatgptDeveloperAppCreatePostcondition(
	input: ChatgptDeveloperAppCreatePostconditionInput,
): ChatgptDeveloperAppCreatePostcondition {
	const exactApps = input.inventoryComplete
		? input.apps.filter((app) => normalize(app.name) === normalize(input.appName))
		: [];
	const exactApp = exactApps.length === 1 ? exactApps[0] : null;
	if (input.auth === "oauth") {
		const baseline = new Map(input.preSubmitTargets.map((target) => [target.targetId, target.url]));
		const handoff = input.postSubmitTargets.find((target) => {
			if (target.type !== "page" || !isHttpUrl(target.url)) return false;
			if (baseline.get(target.targetId) === target.url) return false;
			return isChatgptDeveloperAppHumanActionUrl(target.url);
		});
		if (handoff) {
			return {
				status: "awaiting-human",
				app: exactApp,
				handoffUrl: handoff.url,
			};
		}
	}
	if (exactApp) {
		return {
			status: "completed",
			app: exactApp,
			handoffUrl: null,
		};
	}
	return {
		status: "unconfirmed",
		app: null,
		handoffUrl: null,
	};
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function isChatgptDeveloperAppHumanActionUrl(value: string): boolean {
	const url = new URL(value);
	if (url.hostname !== "chatgpt.com") return true;
	return /(?:oauth|authorize|consent|login|signin|mfa|verify)/i.test(url.pathname);
}

function parseRecord(value: string | null | undefined): Record<string, unknown> | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function appIdentityMatches(
	left: string | null | undefined,
	right: string | null | undefined,
): boolean {
	if (!left || !right) return false;
	return normalize(left) === normalize(right);
}

export function chatgptDeveloperAppSelectionMatchesForTest(
	selectedPluginId: string | null | undefined,
	app: ChatgptDeveloperAppBrowserTarget,
): boolean {
	const selected = normalizeAppIdentity(selectedPluginId);
	if (!selected) return false;
	return [app.pluginId, ...app.appIds].some(
		(candidate) => normalizeAppIdentity(candidate) === selected,
	);
}

function normalizeAppIdentity(value: string | null | undefined): string {
	return normalize(value)
		.replace(/^plugin:/, "")
		.replace(/^plugin_/, "");
}

function normalize(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.map(readString).filter((entry): entry is string => entry !== null)
		: [];
}

function readBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function captureChatgptDeveloperAppFeatureSignature(client: ChromeClient): Promise<string> {
	const endpoints = {
		installed: "/backend-api/ps/plugins/installed",
		linked: "/backend-api/aip/connectors/links/list_accessible",
	} as const;
	await client.Network.enable();
	let resolveInstalled: () => void = () => undefined;
	const installedReady = new Promise<void>((resolve) => {
		resolveInstalled = resolve;
	});
	const payloadPromise = new Promise<{
		installed: unknown | null;
		linked: unknown | null;
	}>((resolve) => {
		const requestKinds = new Map<string, keyof typeof endpoints>();
		const payloads: { installed: unknown | null; linked: unknown | null } = {
			installed: null,
			linked: null,
		};
		let settled = false;
		const finish = () => {
			if (settled || !Object.values(payloads).every((payload) => payload !== null)) return;
			settled = true;
			clearTimeout(timer);
			resolve(payloads);
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(payloads);
		}, 12_000);
		client.Network.responseReceived((params) => {
			if (settled || params.response.status < 200 || params.response.status >= 300) return;
			for (const [kind, endpoint] of Object.entries(endpoints) as Array<
				[keyof typeof endpoints, string]
			>) {
				if (params.response.url.includes(endpoint)) {
					requestKinds.set(params.requestId, kind);
					break;
				}
			}
		});
		client.Network.loadingFinished(async (params) => {
			if (settled) return;
			const kind = requestKinds.get(params.requestId);
			if (!kind) return;
			const response = await client.Network.getResponseBody({
				requestId: params.requestId,
			}).catch(() => null);
			if (!response?.body) return;
			try {
				const body = response.base64Encoded
					? Buffer.from(response.body, "base64").toString("utf8")
					: response.body;
				payloads[kind] = JSON.parse(body) as unknown;
				if (kind === "installed") resolveInstalled();
				finish();
			} catch {
				// Keep waiting for another successful response for this endpoint.
			}
		});
	});
	const currentUrl = await readCurrentUrl(client);
	if (currentUrl?.startsWith("https://chatgpt.com/plugins")) {
		const reloaded = await reloadAndSettle(client, {
			ignoreCache: true,
			timeoutMs: 10_000,
			mutationSource: "chatgpt-developer-apps:inventory-reload",
		});
		if (!reloaded.ok) {
			throw new Error(
				`ChatGPT developer-app inventory reload did not settle: ${reloaded.reason ?? "unknown"}.`,
			);
		}
		await wait(250);
	} else {
		await navigateChatgpt(client, "https://chatgpt.com/plugins");
	}
	await Promise.race([installedReady, wait(5_000)]);
	await navigateChatgpt(client, "https://chatgpt.com/");
	const payloads = await payloadPromise;
	const installedPayload = isRecord(payloads.installed) ? payloads.installed : {};
	const linkedPayload = isRecord(payloads.linked) ? payloads.linked : {};
	debugDeveloperApps(
		`installed payload keys=${Object.keys(installedPayload).join(",") || "none"}; linked payload keys=${Object.keys(linkedPayload).join(",") || "none"}`,
	);
	return JSON.stringify({
		inventory_complete: isCompleteChatgptInstalledAppsPayload(payloads.installed),
		installed_apps: normalizeChatgptInstalledAppProbes(installedPayload.plugins),
		linked_apps: normalizeChatgptLinkedAppProbes(linkedPayload.links),
	});
}

function isCompleteChatgptInstalledAppsPayload(value: unknown): boolean {
	return isRecord(value) && Array.isArray(value.plugins);
}

export const isCompleteChatgptInstalledAppsPayloadForTest = isCompleteChatgptInstalledAppsPayload;

async function readChatgptDeveloperMode(client: ChromeClient): Promise<boolean | null> {
	const originalUrl = await readCurrentUrl(client);
	try {
		await dismissEmptyNewAppDialog(client);
		await navigateChatgpt(client, "https://chatgpt.com/plugins#settings/Security");
		const ready = await waitForPredicate(
			client.Runtime,
			`Boolean(document.querySelector('button[role="switch"][aria-label="Developer mode"]'))`,
			{ timeoutMs: 8_000, description: "ChatGPT Developer mode switch" },
		);
		if (!ready.ok) {
			// Inventory and current Developer-mode settings are independent observations.
			// An absent control must never establish permission to create or replace apps.
			debugDeveloperApps("Developer mode unavailable in current settings UI");
			return null;
		}
		const result = await client.Runtime.evaluate({
			expression: `document.querySelector('button[role="switch"][aria-label="Developer mode"]')?.getAttribute('aria-checked')`,
			returnByValue: true,
		});
		return result.result?.value === "true";
	} finally {
		if (originalUrl?.startsWith("https://chatgpt.com/")) {
			await navigateChatgpt(client, originalUrl).catch(() => undefined);
		}
	}
}

async function dismissEmptyNewAppDialog(client: ChromeClient): Promise<void> {
	const probe = await client.Runtime.evaluate({
		expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog || !String(dialog.textContent || '').includes('New App')) return false;
      const name = dialog.querySelector('input[aria-label="Name"]');
      const server = dialog.querySelector('input[type="url"], input[placeholder*="https://"]');
      return Boolean(name && server && !String(name.value || '').trim() && !String(server.value || '').trim());
    })()`,
		returnByValue: true,
	});
	if (probe.result?.value !== true) return;
	const closed = await pressButton(client.Runtime, {
		rootSelectors: ['[role="dialog"]'],
		selector: 'button[aria-label="Close"]',
		interactionStrategies: ["pointer"],
		requireVisible: true,
		postGoneSelector: '[role="dialog"] input[aria-label="Name"]',
		timeoutMs: 5_000,
	});
	if (!closed.ok) {
		throw new Error("An empty ChatGPT New App dialog blocked inventory and could not be closed.");
	}
}

async function waitForChatgptDeveloperAppSettingsForDelete(
	client: Pick<ChromeClient, "Runtime">,
	app: ChatgptDeveloperAppBrowserTarget,
	targetMarker = "auracall-delete-target",
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
	return waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const expectedName = ${JSON.stringify(app.name)};
      const targetMarker = ${JSON.stringify(targetMarker)};
      const expectedHash = ${JSON.stringify(
				`#settings/Plugins/${encodeURIComponent(app.pluginId)}`,
			)};
      if (location.origin !== 'https://chatgpt.com' || location.pathname !== '/plugins' || location.hash !== expectedHash) {
        return null;
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((dialog) => {
        const heading = Array.from(dialog.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
          .find((candidate) => normalize(candidate.textContent) === expectedName);
        return Boolean(heading);
      });
      if (dialogs.length !== 1) return null;
      const actionButtons = Array.from(dialogs[0].querySelectorAll('button')).filter((button) => {
        const label = normalize(button.getAttribute('aria-label'));
        const rect = button.getBoundingClientRect();
        return label === 'Plugin actions' && rect.width > 0 && rect.height > 0;
      });
      if (actionButtons.length !== 1) return null;
      const button = actionButtons[0];
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
      dialogs[0].setAttribute('data-auracall-delete-dialog', targetMarker);
      button.setAttribute('data-auracall-delete-trigger', targetMarker);
      return {
        appName: expectedName,
        hash: location.hash,
        dialogCount: dialogs.length,
        actionButtonCount: actionButtons.length,
      };
    })()`,
		{
			timeoutMs: 15_000,
			pollMs: 200,
			description: `exact Developer mode management surface for ${app.name}`,
		},
	);
}

async function markExactChatgptDeveloperAppDeleteMenu(
	client: Pick<ChromeClient, "Runtime">,
	targetMarker: string,
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
	return waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const targetMarker = ${JSON.stringify(targetMarker)};
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('[role="menu"]'))
        .filter(visible)
        .map((menu) => ({
          menu,
          deleteItems: Array.from(menu.querySelectorAll('[role="menuitem"],button,[role="button"]'))
            .filter((item) => visible(item) && normalize(item.getAttribute('aria-label') || item.textContent) === 'delete'),
        }))
        .filter((entry) => entry.deleteItems.length > 0);
      if (candidates.length !== 1 || candidates[0].deleteItems.length !== 1) return null;
      candidates[0].menu.setAttribute('data-auracall-delete-menu', targetMarker);
      candidates[0].deleteItems[0].setAttribute('data-auracall-delete-item', targetMarker);
      return {
        menuCount: candidates.length,
        deleteItemCount: candidates[0].deleteItems.length,
      };
    })()`,
		{
			timeoutMs: 5_000,
			pollMs: 100,
			description: "one exact ChatGPT developer-app Delete menu item",
		},
	);
}

export const waitForChatgptDeveloperAppSettingsForDeleteForTest =
	waitForChatgptDeveloperAppSettingsForDelete;
export const markExactChatgptDeveloperAppDeleteMenuForTest = markExactChatgptDeveloperAppDeleteMenu;
export const selectChatgptDeveloperAppConnectionModeForTest =
	selectChatgptDeveloperAppConnectionMode;

async function selectChatgptDeveloperAppConnectionMode(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	selector: string,
): Promise<boolean> {
	const focused = await client.Runtime.evaluate({
		expression: `(() => {
      const radio = document.querySelector(${JSON.stringify(selector)});
      if (!(radio instanceof HTMLElement)) return { found: false, selected: false };
      const rect = radio.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { found: false, selected: false };
      if (radio.getAttribute('aria-checked') === 'true') {
        return { found: true, selected: true };
      }
      radio.focus();
      return { found: true, selected: false };
    })()`,
		returnByValue: true,
	});
	const state = isRecord(focused.result?.value) ? focused.result.value : null;
	if (state?.found !== true) return false;
	if (state.selected === true) return true;
	await client.Input.dispatchKeyEvent({
		type: "rawKeyDown",
		key: " ",
		code: "Space",
		windowsVirtualKeyCode: 32,
		nativeVirtualKeyCode: 32,
	});
	await client.Input.dispatchKeyEvent({
		type: "keyUp",
		key: " ",
		code: "Space",
		windowsVirtualKeyCode: 32,
		nativeVirtualKeyCode: 32,
	});
	return true;
}

async function navigateChatgpt(client: ChromeClient, url: string): Promise<void> {
	const settled = await navigateAndSettle(client, {
		url,
		timeoutMs: 10_000,
		mutationSource: "chatgpt-developer-apps:navigate",
	});
	if (!settled.ok) {
		throw new Error(
			`ChatGPT developer-app navigation did not settle: ${settled.reason ?? settled.phase}.`,
		);
	}
	await wait(250);
}

async function setRequiredInput(
	client: ChromeClient,
	selector: string,
	value: string,
	label: string,
): Promise<void> {
	const set = await setInputValue(client.Runtime, {
		selector,
		value,
		requireVisible: true,
		timeoutMs: 8_000,
	});
	if (!set) {
		throw new Error(`Unable to set ChatGPT developer-app ${label}.`);
	}
}

async function selectNativeOptionByText(
	client: ChromeClient,
	selector: string,
	label: string,
): Promise<void> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!(select instanceof HTMLSelectElement)) return false;
      const expected = ${JSON.stringify(label.toLowerCase())};
      const option = Array.from(select.options).find((candidate) =>
        String(candidate.textContent || '').trim().toLowerCase() === expected
      );
      if (!option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(select, option.value);
      else select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
		returnByValue: true,
	});
	if (result.result?.value !== true) {
		throw new Error(`Unable to select ChatGPT developer-app authentication ${label}.`);
	}
}

async function clearDeveloperAppComposer(client: ChromeClient): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		`Boolean(document.querySelector('#prompt-textarea[contenteditable="true"]'))`,
		{ timeoutMs: 8_000, description: "ChatGPT developer-app test composer" },
	);
	if (!ready.ok) {
		throw new Error("Unable to clear the ChatGPT composer because its editor was not found.");
	}
	const focused = await client.Runtime.evaluate({
		expression: `(() => {
      const editor = document.querySelector('#prompt-textarea[contenteditable="true"]');
      if (!editor) return false;
      editor.focus();
      return true;
    })()`,
		returnByValue: true,
	});
	if (focused.result?.value !== true) {
		throw new Error("Unable to clear the ChatGPT composer because its editor was not found.");
	}
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await client.Input.dispatchKeyEvent({
			type: "keyDown",
			key: "Control",
			code: "ControlLeft",
			windowsVirtualKeyCode: 17,
			nativeVirtualKeyCode: 17,
			modifiers: 2,
		});
		await client.Input.dispatchKeyEvent({
			type: "keyDown",
			key: "a",
			code: "KeyA",
			windowsVirtualKeyCode: 65,
			nativeVirtualKeyCode: 65,
			modifiers: 2,
		});
		await client.Input.dispatchKeyEvent({
			type: "keyUp",
			key: "a",
			code: "KeyA",
			windowsVirtualKeyCode: 65,
			nativeVirtualKeyCode: 65,
			modifiers: 2,
		});
		await client.Input.dispatchKeyEvent({
			type: "keyUp",
			key: "Control",
			code: "ControlLeft",
			windowsVirtualKeyCode: 17,
			nativeVirtualKeyCode: 17,
		});
		await client.Input.dispatchKeyEvent({
			type: "keyDown",
			key: "Backspace",
			code: "Backspace",
			windowsVirtualKeyCode: 8,
			nativeVirtualKeyCode: 8,
		});
		await client.Input.dispatchKeyEvent({
			type: "keyUp",
			key: "Backspace",
			code: "Backspace",
			windowsVirtualKeyCode: 8,
			nativeVirtualKeyCode: 8,
		});
		await wait(250);
		const cleared = await client.Runtime.evaluate({
			expression: `!String(document.querySelector('#prompt-textarea')?.innerText || '').trim()`,
			returnByValue: true,
		});
		if (cleared.result?.value === true) return;
	}
	throw new Error("ChatGPT composer text could not be cleared safely.");
}

export async function clearDeveloperAppComposerForTest(client: ChromeClient): Promise<void> {
	await clearDeveloperAppComposer(client);
}

async function assertNoChatgptBlockingSurface(client: ChromeClient, action: string): Promise<void> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
        .filter(visible)
        .map((element) => String(element.textContent || element.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .slice(0, 80);
      return {
        text: String(document.body?.innerText || '').slice(0, 12000),
        ariaLabel: '',
        buttonLabels: buttons,
      };
    })()`,
		returnByValue: true,
	});
	const probe = isRecord(result.result?.value) ? result.result.value : {};
	const match = classifyChatgptBlockingSurfaceProbe({
		text: readString(probe.text),
		ariaLabel: readString(probe.ariaLabel),
		buttonLabels: readStringArray(probe.buttonLabels),
	});
	if (match) {
		throw new Error(`Cannot ${action}: ${match.summary}`);
	}
}

async function readCurrentUrl(client: ChromeClient): Promise<string | null> {
	const result = await client.Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	return readString(result.result?.value);
}

async function readChatgptDeveloperAppTargetSnapshots(
	client: ChromeClient,
): Promise<ChatgptDeveloperAppTargetSnapshot[]> {
	try {
		const result = await client.Target.getTargets();
		return result.targetInfos
			.filter((target) => target.type === "page")
			.map((target) => ({
				targetId: target.targetId,
				type: target.type,
				url: target.url,
			}));
	} catch {
		const currentUrl = await readCurrentUrl(client);
		return currentUrl ? [{ targetId: "current-page", type: "page", url: currentUrl }] : [];
	}
}

async function readChatgptDeveloperAppCreateSurfaceProbe(
	client: ChromeClient,
): Promise<ChatgptDeveloperAppCreateSurfaceProbe> {
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((candidate) => {
        if (!visible(candidate)) return false;
        const nameInput = candidate.querySelector('input[aria-label="Name"]');
        const createButton = Array.from(candidate.querySelectorAll('button')).find(
          (button) => String(button.textContent || '').trim() === 'Create',
        );
        return Boolean(nameInput && createButton);
      }) || null;
      const alerts = Array.from(document.querySelectorAll('[role="alert"],[aria-live="assertive"]'))
        .filter(visible)
        .map((element) => String(element.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        url: location.href,
        createDialogVisible: Boolean(dialog),
        dialogText: dialog
          ? String(dialog.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200)
          : null,
        alertTexts: alerts,
      };
    })()`,
		returnByValue: true,
	});
	const probe = isRecord(result.result?.value) ? result.result.value : {};
	return {
		url: readString(probe.url),
		createDialogVisible: readBoolean(probe.createDialogVisible) === true,
		dialogText: readString(probe.dialogText),
		alertTexts: readStringArray(probe.alertTexts),
	};
}

async function waitForChatgptDeveloperAppPostSubmitObservation(
	client: ChromeClient,
	input: ChatgptDeveloperAppBrowserCreateInput,
	preSubmitTargets: ChatgptDeveloperAppTargetSnapshot[],
): Promise<{
	targets: ChatgptDeveloperAppTargetSnapshot[];
	surface: ChatgptDeveloperAppCreateSurfaceProbe;
}> {
	const deadline = Date.now() + 5_000;
	const observedTargets = new Map(
		preSubmitTargets.map((target) => [`${target.targetId}\u0000${target.url}`, target]),
	);
	let surface = await readChatgptDeveloperAppCreateSurfaceProbe(client);
	while (Date.now() < deadline) {
		const latest = await readChatgptDeveloperAppTargetSnapshots(client);
		for (const target of latest) {
			observedTargets.set(`${target.targetId}\u0000${target.url}`, target);
		}
		surface = await readChatgptDeveloperAppCreateSurfaceProbe(client);
		const targets = [...observedTargets.values()];
		const postcondition = classifyChatgptDeveloperAppCreatePostcondition({
			auth: input.auth,
			appName: input.name,
			apps: [],
			inventoryComplete: false,
			preSubmitTargets,
			postSubmitTargets: targets,
		});
		if (postcondition.status === "awaiting-human") return { targets, surface };
		await wait(100);
	}
	return { targets: [...observedTargets.values()], surface };
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugDeveloperApps(message: string): void {
	if (process.env.AURACALL_DEBUG_DEVELOPER_APPS === "1") {
		process.stderr.write(`[developer-apps] ${message}\n`);
	}
}
