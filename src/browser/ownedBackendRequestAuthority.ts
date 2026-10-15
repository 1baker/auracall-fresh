import type {
	ProviderInteractionLedger,
	ProviderInteractionScope,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import { ProviderBackendRequestBudgetExceededError } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type { TabLeaseEffectState } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

export class OwnedBackendRequestCleanupError extends AggregateError {
	constructor(error: unknown) {
		super(
			error instanceof AggregateError ? error.errors : [error],
			error instanceof Error ? error.message : "Owned backend request cleanup failed.",
		);
	}
}

function hasUnknownOwnedRequestCleanup(error: unknown): boolean {
	return (
		error instanceof OwnedBackendRequestCleanupError ||
		(error instanceof AggregateError && error.errors.some(hasUnknownOwnedRequestCleanup))
	);
}

export function validateBackendRequestLimit(limit: number | undefined): void {
	if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
		throw new Error("Backend request limit must be a positive safe integer.");
}

/** Request admission borrows the caller's exact lease; it never acquires or closes one.
 * The caller owns request draining and reconciles effects before settling that lease. */
export function createOwnedBackendRequestAuthority(input: {
	ledger: ProviderInteractionLedger;
	scope: ProviderInteractionScope;
	workloadId: string;
	operationId: string;
	tabLeaseId: string;
	backendRequestLimit: number;
	assertOwnedLease: () => Promise<void>;
	now?: () => Date;
}) {
	if (input.backendRequestLimit === undefined)
		throw new Error("Owned backend request authority requires an explicit limit.");
	validateBackendRequestLimit(input.backendRequestLimit);
	const { ledger, workloadId, operationId, tabLeaseId, backendRequestLimit, assertOwnedLease } =
		input;
	const { provider, tenantKey, runtimeProfileId, managedBrowserProfile } = input.scope;
	const now = input.now ?? (() => new Date());
	let backendBudgetDenied = false;
	return {
		admit: async (requestKey: string, effect: () => Promise<void>) => {
			const admission = await ledger.reserve({
				scope: {
					provider,
					tenantKey,
					runtimeProfileId,
					managedBrowserProfile,
				},
				workloadId,
				operationId,
				tabLeaseId,
				interactionClass: "backend-request",
				mutability: "provider-mutating",
				startsNewConversation: false,
				backendRequestKey: requestKey,
				now: now().toISOString(),
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxBackendRequestsPerMinute: backendRequestLimit,
				},
			});
			if (!admission.allowed) {
				if (admission.reason === "minute-backend-request-limit") {
					backendBudgetDenied = true;
					throw new ProviderBackendRequestBudgetExceededError();
				}
				throw new Error(`Backend request admission denied: ${admission.reason}.`);
			}
			if (admission.duplicate) return;
			let started = false;
			try {
				await assertOwnedLease();
				const transition = await ledger.start({
					reservationId: admission.reservation.reservationId,
					startedAt: now().toISOString(),
				});
				if (!transition.ok) throw new Error(`Backend request start denied: ${transition.reason}.`);
				started = true;
				await assertOwnedLease();
				await effect();
				const settled = await ledger.settle({
					reservationId: admission.reservation.reservationId,
					settledAt: now().toISOString(),
					effectState: "settled",
					outcome: "succeeded",
				});
				if (!settled.ok) throw new Error(`Backend request settlement failed: ${settled.reason}.`);
			} catch (error) {
				if (started)
					try {
						const settled = await ledger.settle({
							reservationId: admission.reservation.reservationId,
							settledAt: now().toISOString(),
							effectState: "outcome-unknown",
							outcome: "failed",
						});
						if (!settled.ok)
							throw new Error(`Backend request settlement failed: ${settled.reason}.`);
					} catch (settlementError) {
						throw new AggregateError(
							[error, settlementError],
							"Backend dispatch and settlement failed.",
						);
					}
				throw error;
			}
		},
		async reconcileEffectState<TEffect extends TabLeaseEffectState>(
			effectState: TEffect,
			failure?: unknown,
		): Promise<TEffect | "settled" | "outcome-unknown"> {
			if (hasUnknownOwnedRequestCleanup(failure)) return "outcome-unknown";
			const records = (await ledger.list({ provider, tenantKey })).filter(
				(record) => record.tabLeaseId === tabLeaseId && record.operationId === operationId,
			);
			if (
				records.some(
					(record) => record.state === "started" || record.effectState === "outcome-unknown",
				)
			)
				return "outcome-unknown";
			if (
				backendBudgetDenied &&
				effectState === "none" &&
				records.some((record) => record.effectState === "settled")
			)
				return "settled";
			return effectState;
		},
	};
}
