import crypto from "node:crypto";

import type { ProviderWarningClassification } from "../../packages/browser-service/src/service/interactionLedger.js";
import type { BrowserMutationAuditSink } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	resolveChatgptBackendRequestBudgetWaitMs,
	resolveChatgptBackendRequestsPerMinute,
	resolveChatgptInteractionsPerMinute,
	resolveChatgptTenantLimits,
} from "../runtime/tenantExecutionLimits.js";
import {
	executeProvisionedChatgptConversation,
	type ProviderWarningClassifier,
} from "./chatgptAffinityExecutor.js";
import { retireExpiredChatgptTabLeases } from "./chatgptTabRetirement.js";
import type { PromptInput, PromptResult } from "./llmService/types.js";
import { resolveChatgptConversationUrl } from "./providers/chatgptAdapter.js";
import type { ChatgptLeasedPromptRunner } from "./providers/chatgptTabAffinity.js";
import {
	type ChatgptManagedBrowserEndpoint,
	type ChatgptOpenedTarget,
	createChatgptTabProvisioner,
} from "./providers/chatgptTabProvisioner.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { BrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

export interface ChatgptServiceTargetResolution {
	browserProcessId?: number | null;
	host?: string;
	port?: number;
	managedBrowserProfile?: string | null;
}

export async function runChatgptPromptWithConfiguredAffinity(input: {
	userConfig: ResolvedUserConfig;
	runtime: BrowserTabConcurrencyRuntime;
	input: PromptInput;
	options?: BrowserProviderListOptions;
	runSerialized: (
		input: PromptInput,
		options?: BrowserProviderListOptions,
	) => Promise<PromptResult>;
	runExact: ChatgptLeasedPromptRunner;
	resolveServiceTarget: (input: {
		serviceId: "chatgpt";
		configuredUrl?: string | null;
		ensurePort?: boolean;
		abortSignal?: AbortSignal;
	}) => Promise<ChatgptServiceTargetResolution>;
	openTarget: (input: {
		host: string;
		port: number;
		url: string;
		operationId: string;
	}) => Promise<ChatgptOpenedTarget>;
	closeTarget: (input: { host: string; port: number; targetId: string }) => Promise<void>;
	inspectTarget?: (
		endpoint: ChatgptManagedBrowserEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	now?: () => Date;
	generateId?: () => string;
	classifyProviderWarning?: ProviderWarningClassifier;
	mutationAudit?: BrowserMutationAuditSink;
}): Promise<PromptResult> {
	if (input.runtime.mode === "serialized") {
		return input.runSerialized(input.input, input.options);
	}
	if (!input.runtime.registry || !input.runtime.ledger) {
		throw new Error("ChatGPT tab-affinity runtime is missing its registry or interaction ledger.");
	}

	const runtimeProfileId = input.userConfig.auracallProfile?.trim() || "default";
	const tenantKey = resolveConfiguredServiceAccountId(input.userConfig as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId,
	});
	if (!tenantKey) {
		throw new Error("ChatGPT tab affinity requires a configured ChatGPT tenant identity.");
	}
	const configuredUrl =
		input.input.configuredUrl ??
		input.options?.configuredUrl ??
		input.userConfig.browser?.chatgptUrl ??
		input.userConfig.browser?.url ??
		"https://chatgpt.com/";
	const initialTarget = await input.resolveServiceTarget({
		serviceId: "chatgpt",
		configuredUrl,
		ensurePort: false,
		abortSignal: input.options?.abortSignal,
	});
	const managedBrowserProfile = initialTarget.managedBrowserProfile?.trim();
	if (!managedBrowserProfile) {
		throw new Error("ChatGPT tab affinity could not resolve the exact managed browser profile.");
	}

	const operationId = (input.generateId ?? (() => crypto.randomUUID()))();
	const workload = input.input.conversationId
		? ({ kind: "conversation", conversationId: input.input.conversationId } as const)
		: ({ kind: "new-conversation", reservationId: `${operationId}:conversation` } as const);
	const scope = {
		runtimeProfileId,
		managedBrowserProfile,
		service: "chatgpt",
		tenantKey,
	} as const;
	const targetUrl = input.input.conversationId
		? resolveChatgptConversationUrl(input.input.conversationId, input.input.projectId ?? undefined)
		: configuredUrl;
	const toEndpoint = (
		target: ChatgptServiceTargetResolution,
	): ChatgptManagedBrowserEndpoint | null => {
		if (!target.host || !target.port || target.managedBrowserProfile !== managedBrowserProfile)
			return null;
		return {
			host: target.host,
			port: target.port,
			browserProcessId: target.browserProcessId ?? null,
			managedBrowserProfile,
		};
	};
	if (input.inspectTarget) {
		await retireExpiredChatgptTabLeases({
			registry: input.runtime.registry,
			audit: input.runtime.retirementAudit,
			scope,
			endpoint: toEndpoint(initialTarget),
			now: input.now,
			inspectTarget: (endpoint, targetId) =>
				input.inspectTarget?.({ ...endpoint, managedBrowserProfile }, targetId) ??
				Promise.resolve(null),
			closeTarget: (endpoint, targetId) =>
				input.closeTarget({ host: endpoint.host, port: endpoint.port, targetId }),
		});
	}
	const provision = createChatgptTabProvisioner({
		registry: input.runtime.registry,
		scope,
		workload,
		operationId,
		targetUrl,
		targetCreationUrl:
			resolveChatgptBackendRequestsPerMinute(
				input.userConfig as Record<string, unknown>,
				runtimeProfileId,
			) === undefined
				? undefined
				: "about:blank",
		idleTtlMs: 15 * 60_000,
		absoluteTtlMs: 8 * 60 * 60_000,
		now: input.now,
		resolveExistingEndpoint: async () => toEndpoint(initialTarget),
		startBrowser: async () => {
			const started = await input.resolveServiceTarget({
				serviceId: "chatgpt",
				configuredUrl,
				ensurePort: true,
				abortSignal: input.options?.abortSignal,
			});
			const endpoint = toEndpoint(started);
			if (!endpoint)
				throw new Error("ChatGPT browser startup did not return the expected endpoint.");
			return endpoint;
		},
		openTarget: (targetInput) => input.openTarget({ ...targetInput, operationId }),
		inspectTarget: input.inspectTarget,
		closeTarget: input.closeTarget,
	});
	const limits = resolveChatgptTenantLimits(
		input.userConfig as Record<string, unknown>,
		runtimeProfileId,
	);
	const execution = await executeProvisionedChatgptConversation({
		registry: input.runtime.registry,
		ledger: input.runtime.ledger,
		scope,
		workload,
		operationId,
		input: input.input,
		options: input.options,
		runPrompt: input.runExact,
		acquireTab: provision,
		backendRequestBudgetWaitMs: resolveChatgptBackendRequestBudgetWaitMs(
			input.userConfig as Record<string, unknown>,
			runtimeProfileId,
		),
		policy: {
			maxBackendRequestsPerMinute: resolveChatgptBackendRequestsPerMinute(
				input.userConfig as Record<string, unknown>,
				runtimeProfileId,
			),
			maxConcurrentChats: limits.maxConcurrentChats,
			maxConversationStartsPerHour: limits.maxChatsPerHour,
			maxConversationStartsPerDay: limits.maxChatsPerDay,
			maxInteractionsPerMinute: resolveChatgptInteractionsPerMinute(
				input.userConfig as Record<string, unknown>,
				runtimeProfileId,
			),
		},
		reservationTtlMs: 30_000,
		idleTtlMs: 15 * 60_000,
		now: input.now,
		classifyProviderWarning: input.classifyProviderWarning ?? classifyStructuredProviderWarning,
		mutationAudit: input.mutationAudit,
	});
	if (execution.status === "denied") {
		throw new Error(`ChatGPT tab-affinity admission denied: ${execution.admission.reason}.`);
	}
	return execution.result;
}

export function classifyStructuredProviderWarning(
	error: unknown,
): ReturnType<ProviderWarningClassifier> {
	if (!error || typeof error !== "object") return null;
	const record = error as Record<string, unknown>;
	const details =
		record.details && typeof record.details === "object"
			? (record.details as Record<string, unknown>)
			: null;
	const blockingSurface =
		(record.blockingSurface ?? details?.blockingSurface) &&
		typeof (record.blockingSurface ?? details?.blockingSurface) === "object"
			? ((record.blockingSurface ?? details?.blockingSurface) as Record<string, unknown>)
			: null;
	if (blockingSurface?.kind === "rate-limit") {
		return {
			classification: "rate-limit",
			reason: readReason(record, blockingSurface, "ChatGPT rate-limit warning observed."),
		};
	}
	const classification = structuredClassification(
		record.code ?? record.type ?? details?.code ?? details?.providerState ?? details?.stage,
	);
	return classification
		? { classification, reason: readReason(record, null, `ChatGPT ${classification} observed.`) }
		: null;
}

function structuredClassification(value: unknown): ProviderWarningClassification | null {
	if (typeof value !== "string") return null;
	switch (value.trim().toLowerCase().replaceAll("-", "_")) {
		case "captcha":
			return "captcha";
		case "human_verification":
		case "manual_clear_required":
			return "human-verification";
		case "identity_conflict":
			return "identity-conflict";
		case "account_mismatch":
			return "account-mismatch";
		case "rate_limit":
			return "rate-limit";
		default:
			return null;
	}
}

function readReason(
	error: Record<string, unknown>,
	surface: Record<string, unknown> | null,
	fallback: string,
): string {
	if (typeof surface?.summary === "string" && surface.summary.trim()) return surface.summary.trim();
	if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
	return fallback;
}
