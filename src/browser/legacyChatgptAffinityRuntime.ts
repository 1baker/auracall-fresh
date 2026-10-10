import {
	closeRemoteChromeTarget,
	listChromeTargets,
	openChromeTarget,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	type ChatgptServiceTargetResolution,
	runChatgptPromptWithConfiguredAffinity,
} from "./chatgptAffinityRuntime.js";
import { resolveChatgptConversationUrl } from "./providers/chatgptAdapter.js";
import type {
	ChatgptManagedBrowserEndpoint,
	ChatgptOpenedTarget,
} from "./providers/chatgptTabProvisioner.js";
import { BrowserService } from "./service/browserService.js";
import {
	type BrowserTabConcurrencyRuntime,
	createBrowserTabConcurrencyRuntime,
} from "./tabConcurrencyRuntime.js";
import type { BrowserRunOptions, BrowserRunResult, ResolvedBrowserConfig } from "./types.js";

export interface LegacyChatgptLeasedTarget {
	abortSignal?: AbortSignal;
	host: string;
	port: number;
	targetId: string;
	targetUrl: string;
	providerTrafficGovernor: NonNullable<BrowserRunOptions["providerTrafficGovernor"]>;
}

export async function runLegacyChatgptWithConfiguredAffinity(input: {
	userConfig: ResolvedUserConfig;
	browserOptions: BrowserRunOptions;
	resolvedConfig: ResolvedBrowserConfig;
	runLeased: (target: LegacyChatgptLeasedTarget) => Promise<BrowserRunResult>;
	runtime?: BrowserTabConcurrencyRuntime;
	resolveServiceTarget?: (input: {
		serviceId: "chatgpt";
		configuredUrl?: string | null;
		ensurePort?: boolean;
		abortSignal?: AbortSignal;
	}) => Promise<ChatgptServiceTargetResolution>;
	openTarget?: (input: { host: string; port: number; url: string }) => Promise<ChatgptOpenedTarget>;
	inspectTarget?: (
		endpoint: ChatgptManagedBrowserEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	closeTarget?: (input: { host: string; port: number; targetId: string }) => Promise<void>;
}): Promise<BrowserRunResult> {
	const browserService = BrowserService.fromConfig(input.userConfig, "chatgpt");
	const runtime = input.runtime ?? createBrowserTabConcurrencyRuntime(input.userConfig);
	const legacyResultRef: { current: BrowserRunResult | null } = { current: null };
	const configuredUrl = input.resolvedConfig.url;
	const promptResult = await runChatgptPromptWithConfiguredAffinity({
		userConfig: input.userConfig,
		runtime,
		input: {
			prompt: input.browserOptions.prompt,
			attachments: input.browserOptions.attachments,
			completionMode: input.browserOptions.completionMode ?? "assistant_response",
			configuredUrl,
			projectId: input.resolvedConfig.projectId,
			conversationId: input.resolvedConfig.conversationId,
			desiredModel: input.resolvedConfig.desiredModel,
			modelStrategy: input.resolvedConfig.modelStrategy,
			thinkingTime: input.resolvedConfig.thinkingTime,
			chatgptMode: input.resolvedConfig.chatgptMode,
			workModel: input.resolvedConfig.workModel,
			timeoutMs: input.resolvedConfig.timeoutMs,
		},
		options: { abortSignal: input.browserOptions.abortSignal, configuredUrl },
		runSerialized: async () => {
			throw new Error("Legacy ChatGPT affinity unexpectedly selected serialized execution.");
		},
		runExact: async (promptInput, options) => {
			if (!options.tabTargetId || !options.host || !options.port) {
				throw new Error("Legacy ChatGPT affinity did not receive an exact leased target.");
			}
			if (!options.providerTrafficGovernor) {
				throw new Error("Legacy ChatGPT affinity did not receive provider traffic authority.");
			}
			const targetUrl = promptInput.conversationId
				? resolveChatgptConversationUrl(
						promptInput.conversationId,
						promptInput.projectId ?? undefined,
					)
				: (promptInput.configuredUrl ?? configuredUrl);
			const legacyResult = await input.runLeased({
				abortSignal: options.abortSignal,
				host: options.host,
				port: options.port,
				targetId: options.tabTargetId,
				targetUrl,
				providerTrafficGovernor: options.providerTrafficGovernor,
			});
			legacyResultRef.current = legacyResult;
			return {
				text: legacyResult.answerMarkdown || legacyResult.answerText,
				conversationId: legacyResult.conversationId ?? null,
				url: legacyResult.tabUrl ?? targetUrl,
				tabTargetId: legacyResult.chromeTargetId ?? options.tabTargetId,
				devtoolsHost: legacyResult.chromeHost ?? options.host,
				devtoolsPort: legacyResult.chromePort ?? options.port,
			};
		},
		resolveServiceTarget:
			input.resolveServiceTarget ?? ((options) => browserService.resolveServiceTarget(options)),
		openTarget:
			input.openTarget ??
			(async ({ host, port, url, operationId }) => {
				const target = await openChromeTarget(port, url, host, undefined, {
					kind: "pre-lease-target-acquisition",
					operationId,
					reason: "legacy ChatGPT prompt lease acquisition",
				});
				const targetId = typeof target === "string" ? target : target.id;
				if (!targetId) throw new Error("Legacy ChatGPT target creation returned no target ID.");
				return { targetId, url };
			}),
		inspectTarget:
			input.inspectTarget ??
			(async (endpoint, targetId) => {
				const targets = await listChromeTargets(endpoint.port, endpoint.host);
				const target = targets.find((candidate) => {
					const record = candidate as { id?: string; targetId?: string };
					return (record.targetId ?? record.id) === targetId;
				}) as { url?: string } | undefined;
				return typeof target?.url === "string" ? { url: target.url } : null;
			}),
		closeTarget:
			input.closeTarget ??
			(({ host, port, targetId }) =>
				closeRemoteChromeTarget(host, port, targetId, () => undefined)),
	});
	const legacyResult = legacyResultRef.current;
	if (!legacyResult) {
		throw new Error("Legacy ChatGPT affinity completed without a browser result.");
	}
	if (promptResult.tabTargetId !== legacyResult.chromeTargetId) {
		throw new Error("Legacy ChatGPT affinity result lost its exact target identity.");
	}
	return legacyResult;
}
