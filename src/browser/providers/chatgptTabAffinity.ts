import type { BrowserTabLease } from "../../../packages/browser-service/src/service/tabLeaseRegistry.js";
import type { PromptInput, PromptResult } from "../llmService/types.js";
import type { BrowserProviderListOptions } from "./types.js";

export type ChatgptLeasedPromptRunner = (
	input: PromptInput,
	options: BrowserProviderListOptions,
) => Promise<PromptResult>;

export interface RunChatgptPromptOnLeasedTabInput {
	lease: BrowserTabLease;
	operationId: string;
	endpoint: {
		host: string;
		port: number;
		browserProcessId?: number | null;
		managedBrowserProfile?: string;
	};
	options?: BrowserProviderListOptions;
	input: PromptInput;
	runPrompt: ChatgptLeasedPromptRunner;
}

export async function runChatgptPromptOnLeasedTab(
	request: RunChatgptPromptOnLeasedTabInput,
): Promise<PromptResult> {
	const { lease, input, runPrompt } = request;
	const options = buildChatgptLeasedPromptOptions(request);
	const result = await runPrompt(input, options);
	assertChatgptLeasedPromptResult(lease, result);
	return result;
}

export function buildChatgptLeasedPromptOptions(
	request: Omit<RunChatgptPromptOnLeasedTabInput, "runPrompt">,
): BrowserProviderListOptions {
	const { lease, operationId, endpoint, input } = request;
	assertChatgptConversationLease(lease, operationId, input);
	if (!endpoint.host.trim() || !Number.isInteger(endpoint.port) || endpoint.port <= 0) {
		throw new Error(
			"ChatGPT leased prompt requires an exact DevTools host and positive integer port.",
		);
	}

	return {
		...(request.options ?? {}),
		allowNavigation: Boolean(lease.processBinding),
		host: endpoint.host,
		port: endpoint.port,
		preserveActiveTab: !lease.processBinding,
		tabLifecycle: "retain",
		tabTargetId: lease.targetId,
		...(request.options?.providerSessionAuthorization
			? {
					providerSessionAuthorization: {
						...request.options.providerSessionAuthorization,
						context: {
							...request.options.providerSessionAuthorization.context,
							browserProcessId: endpoint.browserProcessId ?? null,
							managedBrowserProfile:
								endpoint.managedBrowserProfile ??
								request.options.providerSessionAuthorization.context.managedBrowserProfile,
							browserTargetId: lease.targetId,
							devtoolsHost: endpoint.host,
							devtoolsPort: endpoint.port,
						},
					},
				}
			: {}),
	};
}

export function assertChatgptLeasedPromptResult(
	lease: BrowserTabLease,
	result: PromptResult,
): void {
	if (result.tabTargetId !== lease.targetId) {
		throw new Error(
			`ChatGPT leased prompt returned target ${result.tabTargetId ?? "(missing)"} instead of leased target ${lease.targetId}.`,
		);
	}
	if (
		lease.workload.kind === "conversation" &&
		result.conversationId !== lease.workload.conversationId
	) {
		throw new Error(
			`ChatGPT leased prompt returned conversation ${result.conversationId ?? "(missing)"} instead of bound conversation ${lease.workload.conversationId}.`,
		);
	}
	if (lease.workload.kind === "new-conversation" && !result.conversationId) {
		throw new Error("ChatGPT new-conversation leased prompt did not return a conversation ID.");
	}
}

function assertChatgptConversationLease(
	lease: BrowserTabLease,
	operationId: string,
	input: PromptInput,
): asserts lease is BrowserTabLease & {
	workload:
		| { kind: "conversation"; conversationId: string }
		| { kind: "new-conversation"; reservationId: string };
} {
	if (lease.scope.service !== "chatgpt") {
		throw new Error(
			`Tab lease ${lease.leaseId} belongs to service ${lease.scope.service}, not chatgpt.`,
		);
	}
	if (lease.state !== "active") {
		throw new Error(`Tab lease ${lease.leaseId} is ${lease.state}, not active.`);
	}
	if (lease.ownerOperationId !== operationId) {
		throw new Error(
			`Tab lease ${lease.leaseId} is owned by operation ${lease.ownerOperationId ?? "(none)"}, not ${operationId}.`,
		);
	}
	if (lease.workload.kind !== "conversation" && lease.workload.kind !== "new-conversation") {
		throw new Error(`A ${lease.workload.kind} tab lease cannot run a ChatGPT conversation prompt.`);
	}
	if (lease.workload.kind === "conversation") {
		if (input.conversationId !== lease.workload.conversationId) {
			throw new Error(
				`Prompt conversation ${input.conversationId ?? "(missing)"} does not match tab lease conversation ${lease.workload.conversationId}.`,
			);
		}
		return;
	}
	if (input.conversationId) {
		throw new Error(
			`New-conversation tab lease ${lease.leaseId} cannot target existing conversation ${input.conversationId}.`,
		);
	}
}
