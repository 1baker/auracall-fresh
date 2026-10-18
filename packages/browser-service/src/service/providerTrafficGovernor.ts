import crypto from "node:crypto";

import type { BrowserInteractionClass, BrowserInteractionGovernor } from "./interactionGovernor.js";
import type { ProviderWarningClassification } from "./interactionLedger.js";
import type {
	BrowserMutationAuditSink,
	BrowserMutationKind,
	BrowserMutationOutcome,
	BrowserMutationRecord,
	ProviderTrafficPhase,
} from "./mutationDispatcher.js";

/** Proven cancellation before a backend request was dispatched. */
export class ProviderBackendRequestCancelledBeforeDispatchError extends Error {
	constructor() {
		super("Backend request cancelled before dispatch.");
		this.name = "ProviderBackendRequestCancelledBeforeDispatchError";
	}
}

export interface ProviderTrafficAttribution {
	provider: string;
	runtimeProfileId: string;
	managedBrowserProfile: string;
	workloadId: string;
	operationId: string;
	tabLeaseId: string;
	targetId?: string;
}

export interface ProviderTrafficWarning {
	classification: ProviderWarningClassification;
	reason: string;
	cooldownUntil?: string | null;
}

export interface ProviderTrafficActionInput {
	kind: BrowserMutationKind;
	interactionClass: BrowserInteractionClass;
	source: string;
	trafficPhase?: ProviderTrafficPhase | null;
	workKey?: string | null;
	abortSignal?: AbortSignal | null;
	requestedUrl?: string | null;
	fromUrl?: string | null;
	toUrl?: string | null;
	targetId?: string | null;
	reused?: boolean;
	reason?: string | null;
	fallbackUsed?: boolean;
}

export interface ProviderTrafficActionSettlement {
	outcome: BrowserMutationOutcome;
	toUrl?: string | null;
	targetId?: string | null;
	reused?: boolean;
	reason?: string | null;
	fallbackUsed?: boolean;
	error?: string | null;
	probeContext?: unknown;
}

export interface ProviderTrafficAction {
	id: string;
	settle(details: ProviderTrafficActionSettlement): Promise<void>;
}

export interface ProviderTrafficGovernor {
	readonly attribution: ProviderTrafficAttribution;
	begin(input: ProviderTrafficActionInput): Promise<ProviderTrafficAction>;
	checkWarning?(context?: unknown): Promise<void>;
	admitBackendRequest?(requestKey: string, effect: () => Promise<void>, signal?: AbortSignal): Promise<void>;
	snapshotAdmissionState?(): ProviderTrafficAdmissionState;
}

export interface ProviderTrafficAdmissionState {
	version: 1;
	backendRequestOutcome?: "ready" | "budget-exhausted" | "uncertain" | "guarded";
	phases: Array<{ phase: string; admitted: number; limit: number; remaining: number }>;
	budgets: Array<{
		phase: string;
		kind: string;
		admitted: number;
		limit: number;
		remaining: number;
	}>;
	recentEffects?: Array<{
		occurredAt: string;
		phase: string;
		kind: string;
		outcome: BrowserMutationOutcome;
	}>;
}

export interface ProviderTrafficAuthority {
	governor: ProviderTrafficGovernor;
	close(input?: {
		outcome?: "succeeded" | "failed" | "cancelled";
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
}

export interface ProviderTrafficAuthorityFactory {
	/** Request-aware factories report true before acquisition; this grants no lease or governor. */
	readonly backendRequestAdmissionEnabled?: boolean;
	acquire(input: { targetId: string }): Promise<ProviderTrafficAuthority>;
}

/** Match client authority precedence without taking or borrowing its lease. */
export function hasProviderBackendRequestAdmission(
	options:
		| {
				providerTrafficGovernor?: ProviderTrafficGovernor;
				providerTrafficAuthorityFactory?: ProviderTrafficAuthorityFactory;
		  }
		| undefined,
): boolean {
	return options?.providerTrafficGovernor
		? Boolean(options.providerTrafficGovernor.admitBackendRequest)
		: options?.providerTrafficAuthorityFactory?.backendRequestAdmissionEnabled === true;
}

export interface ProviderTrafficContext {
	trafficPhase: ProviderTrafficPhase;
	workKey: string;
}

export function withProviderTrafficContext(
	governor: ProviderTrafficGovernor,
	context: ProviderTrafficContext,
): ProviderTrafficGovernor {
	const workKey = context.workKey.trim();
	if (!/^(?:scope|sha256):[a-zA-Z0-9._-]+$/.test(workKey)) {
		throw new Error("Provider traffic work key must be a privacy-bounded scope or sha256 key.");
	}
	return {
		attribution: governor.attribution,
		checkWarning: governor.checkWarning?.bind(governor),
		admitBackendRequest: governor.admitBackendRequest?.bind(governor),
		snapshotAdmissionState: governor.snapshotAdmissionState?.bind(governor),
		begin: (input) =>
			governor.begin({
				...input,
				trafficPhase: context.trafficPhase,
				workKey,
			}),
	};
}

export class ProviderTrafficAttributionError extends Error {
	constructor(readonly field: keyof ProviderTrafficAttribution) {
		super(`Provider traffic attribution requires ${field}.`);
		this.name = "ProviderTrafficAttributionError";
	}
}

export class ProviderTrafficWarningError extends Error {
	constructor(readonly warning: ProviderTrafficWarning) {
		super(`Provider traffic stopped after ${warning.classification}: ${warning.reason}`);
		this.name = "ProviderTrafficWarningError";
	}
}

export class ProviderBackendRequestBudgetExceededError extends Error {
	constructor() {
		super("Backend request admission denied: minute-backend-request-limit.");
		this.name = "ProviderBackendRequestBudgetExceededError";
	}
}

/** Every failure must prove pre-send budget denial; mixed cleanup failures stay unknown. */
export function isKnownBackendRequestBudgetDenial(error: unknown): boolean {
	return error instanceof ProviderBackendRequestBudgetExceededError ||
		(error instanceof AggregateError && error.errors.length > 0 && error.errors.every(isKnownBackendRequestBudgetDenial));
}

export class ProviderTrafficGovernorRequiredError extends Error {
	constructor(readonly source: string) {
		super(`Provider traffic governor is required before physical action: ${source}.`);
		this.name = "ProviderTrafficGovernorRequiredError";
	}
}

export function createProviderTrafficGovernor(input: {
	attribution: ProviderTrafficAttribution;
	interactionGovernor: BrowserInteractionGovernor;
	mutationAudit: BrowserMutationAuditSink;
	settleInteraction?: (input: {
		outcome: "succeeded" | "failed" | "cancelled";
		effectState: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}) => Promise<void>;
	assertLease?: (attribution: ProviderTrafficAttribution) => Promise<void> | void;
	probeWarning?: (
		context: unknown,
		attribution: ProviderTrafficAttribution,
	) => Promise<ProviderTrafficWarning | null>;
	persistWarning?: (
		warning: ProviderTrafficWarning,
		attribution: ProviderTrafficAttribution,
	) => Promise<void>;
	createActionId?: () => string;
	admitBackendRequest?: (requestKey: string, effect: () => Promise<void>, signal?: AbortSignal) => Promise<void>;
}): ProviderTrafficGovernor {
	const attribution = normalizeAttribution(input.attribution);
	const createActionId = input.createActionId ?? crypto.randomUUID;
	const admitBackendRequest = input.admitBackendRequest;
	let observedWarning: ProviderTrafficWarning | null = null;
	let backendBudgetError: ProviderBackendRequestBudgetExceededError | null = null;
	let backendRequestFailure: unknown;
	let backendRequestFailed = false;
	const assertBackendRequestState = () => {
		if (backendRequestFailed) throw backendRequestFailure;
		if (backendBudgetError) throw backendBudgetError;
	};
	const backendRequestOutcome = (): NonNullable<ProviderTrafficAdmissionState["backendRequestOutcome"]> => {
		if (observedWarning) return "guarded";
		if (backendRequestFailed) return "uncertain";
		return backendBudgetError ? "budget-exhausted" : "ready";
	};
	let lastProbeContext: unknown;
	const recentEffects: NonNullable<ProviderTrafficAdmissionState["recentEffects"]> = [];
	const checkWarning = async (context?: unknown) => {
		if (observedWarning) throw new ProviderTrafficWarningError(observedWarning);
		await input.assertLease?.(attribution);
		if (context !== undefined) lastProbeContext = context;
		const warning = input.probeWarning
			? await input.probeWarning(lastProbeContext, attribution)
			: null;
		if (!warning) return;
		// Freeze first. Persistence may be asynchronous or fail, but no later
		// provider action may pass admission after a visible warning is known.
		observedWarning = warning;
		if (!input.persistWarning) {
			throw new Error("Provider traffic warning persistence is not configured.");
		}
		await input.persistWarning(warning, attribution);
		throw new ProviderTrafficWarningError(warning);
	};

	return {
		attribution,
		checkWarning,
		...(admitBackendRequest ? { admitBackendRequest: async (requestKey: string, effect: () => Promise<void>, signal?: AbortSignal) => {
			await checkWarning();
			assertBackendRequestState();
			try { await admitBackendRequest(requestKey, effect, signal); }
			catch (error) {
				if (error instanceof ProviderBackendRequestBudgetExceededError) backendBudgetError ??= error;
				else if (!(error instanceof ProviderBackendRequestCancelledBeforeDispatchError) && !backendRequestFailed) { backendRequestFailed = true; backendRequestFailure = error; }
				throw error;
			}
		} } : {}),
		snapshotAdmissionState: () => ({
			version: 1,
			phases: [],
			budgets: [],
			...(admitBackendRequest ? { backendRequestOutcome: backendRequestOutcome() } : {}),
			recentEffects: recentEffects.map((effect) => ({ ...effect })),
		}),
		async begin(actionInput) {
			if (observedWarning) throw new ProviderTrafficWarningError(observedWarning);
			assertBackendRequestState();
			actionInput.abortSignal?.throwIfAborted();
			await input.assertLease?.(attribution);
			await input.interactionGovernor.beforeInteraction(
				actionInput.interactionClass,
				actionInput.abortSignal,
			);
			actionInput.abortSignal?.throwIfAborted();

			const id = createActionId();
			const started: BrowserMutationRecord = {
				id,
				phase: "start",
				kind: actionInput.kind,
				source: actionInput.source,
				trafficPhase: actionInput.trafficPhase ?? null,
				workKey: actionInput.workKey ?? null,
				at: new Date().toISOString(),
				requestedUrl: actionInput.requestedUrl ?? null,
				fromUrl: actionInput.fromUrl ?? null,
				toUrl: actionInput.toUrl ?? null,
				targetId: actionInput.targetId ?? null,
				reused: actionInput.reused,
				reason: actionInput.reason ?? null,
				fallbackUsed: actionInput.fallbackUsed,
			};
			// This record is part of admission, not optional diagnostics. If it cannot
			// be persisted, the physical browser action must not start.
			await input.mutationAudit(started);

			let settled = false;
			return {
				id,
				async settle(details) {
					if (settled) throw new Error(`Provider traffic action ${id} is already settled.`);
					settled = true;
					await input.mutationAudit({
						...started,
						phase: "complete",
						at: new Date().toISOString(),
						toUrl: details.toUrl ?? started.toUrl ?? null,
						targetId: details.targetId ?? started.targetId ?? null,
						reused: details.reused ?? started.reused,
						reason: details.reason ?? started.reason ?? null,
						fallbackUsed: details.fallbackUsed ?? started.fallbackUsed,
						outcome: details.outcome,
						error: details.error ?? null,
					});
					recentEffects.push({
						occurredAt: new Date().toISOString(),
						phase: actionInput.trafficPhase ?? "unattributed",
						kind: actionInput.kind,
						outcome: details.outcome,
					});
					if (recentEffects.length > 20) recentEffects.splice(0, recentEffects.length - 20);
					await input.settleInteraction?.({
						outcome: details.outcome === "succeeded" ? "succeeded" : "failed",
						effectState: "settled",
						reason: details.error ?? details.reason ?? null,
					});

					await checkWarning(details.probeContext);
				},
			};
		},
	};
}

function normalizeAttribution(input: ProviderTrafficAttribution): ProviderTrafficAttribution {
	const normalized = { ...input };
	for (const field of Object.keys(normalized) as Array<keyof ProviderTrafficAttribution>) {
		const value = normalized[field]?.trim();
		if (!value) throw new ProviderTrafficAttributionError(field);
		normalized[field] = value;
	}
	return Object.freeze(normalized);
}
