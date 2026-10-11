import type { ResolvedUserConfig } from "../config.js";
import { resolveBrowserLaunchPlan } from "./service/browserLaunchPlan.js";
import { createProviderSessionAuthorization } from "./providers/providerSessionAuthority.js";
import type { BrowserAutomationConfig, BrowserRunOptions, BrowserRunResult } from "./types.js";

export type DeveloperAppEffectState = "pre_effect" | "unknown" | "effect_observed";
export interface DeveloperAppSubmissionEvidence {
	answerText?: string;
	conversationId?: string | null;
	terminalUrl?: string | null;
	effectState?: DeveloperAppEffectState;
	retrySafe?: boolean;
}
export interface DeveloperAppSubmissionOptions {
	abortSignal?: AbortSignal;
	browserOperationOwned?: boolean;
	runBrowser?: (options: BrowserRunOptions) => Promise<BrowserRunResult>;
}

/** One shared lifecycle invocation; failures are evidence, never permission to resubmit. */
export async function submitChatgptDeveloperApp(
	userConfig: ResolvedUserConfig,
	app: { name: string; pluginId: string; appIds: string[]; description?: string | null },
	prompt: string,
	options: DeveloperAppSubmissionOptions = {},
): Promise<
	DeveloperAppSubmissionEvidence & {
		status: "completed" | "failed";
		message: string;
		currentUrl: string | null;
	}
> {
	let effectState: DeveloperAppEffectState = "pre_effect";
	let terminalUrl: string | null = null;
	let conversationId: string | null = null;
	try {
		options.abortSignal?.throwIfAborted();
		const plan = resolveBrowserLaunchPlan({
			source: { kind: "user-config", config: userConfig },
			intent: { provider: "chatgpt" },
		});
		const runBrowser = options.runBrowser ?? (await import("./index.js")).runBrowserMode;
		const result = await runBrowser({
			prompt,
			completionMode: "assistant_response",
			tabAffinityUserConfig:
				plan.launchPolicy.tabConcurrencyMode === "tab-affinity" ? userConfig : undefined,
			abortSignal: options.abortSignal,
			skipBrowserExecutionOperation: options.browserOperationOwned === true,
			config: {
				...(structuredClone(plan.launchPolicy) as BrowserAutomationConfig),
				auracallProfileName: plan.selection.auraCallRuntimeProfileId,
				providerSessionAuthorization: createProviderSessionAuthorization(
					userConfig as Record<string, unknown>,
					{
						providerId: "chatgpt",
						auracallRuntimeProfile: plan.selection.auraCallRuntimeProfileId,
						browserProfile: plan.selection.browserProfileId,
						sourceBrowserProfile: plan.sourceBrowserProfile.name,
						managedBrowserProfile: plan.managedBrowserProfile.directory,
						devtoolsHost: plan.launchPolicy.remoteChrome?.host ?? null,
						devtoolsPort: plan.launchPolicy.remoteChrome?.port ?? null,
					},
				),
				target: "chatgpt",
				url: "https://chatgpt.com/",
				chatgptUrl: "https://chatgpt.com/",
				conversationId: null,
				projectId: null,
				modelStrategy: "current",
				chatgptMode: "chat",
				thinkingTime: undefined,
				composerTool: null,
				timeoutMs: 120_000,
			},
			ecosystemMention: {
				label: app.name,
				acceptedPluginIds: [app.pluginId, ...app.appIds],
				...(app.description ? { description: app.description } : {}),
			},
			onProviderEffectState: (state) => {
				effectState = state;
			},
			runtimeHintCb: async (hint) => {
				terminalUrl = hint.tabUrl ?? terminalUrl;
				conversationId = hint.conversationId ?? conversationId;
			},
		});
		return {
			status: "completed",
			message: `${app.name} test response completed.`,
			answerText: result.answerText,
			conversationId: result.conversationId ?? null,
			terminalUrl: result.tabUrl ?? terminalUrl,
			currentUrl: result.tabUrl ?? terminalUrl,
			effectState: "effect_observed",
			retrySafe: false,
		};
	} catch (error) {
		const details =
			error && typeof error === "object" && "details" in error
				? (error.details as Record<string, unknown> | undefined)
				: undefined;
		const rank = { pre_effect: 0, unknown: 1, effect_observed: 2 };
		const detailedState = details?.effectState;
		if (
			(detailedState === "unknown" || detailedState === "effect_observed") &&
			rank[detailedState] > rank[effectState]
		) {
			effectState = detailedState;
		}
		return {
			status: "failed",
			message: error instanceof Error ? error.message : String(error),
			conversationId,
			terminalUrl,
			currentUrl: terminalUrl,
			effectState,
			retrySafe: effectState === "pre_effect",
		};
	}
}
