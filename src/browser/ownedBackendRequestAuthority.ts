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

export function hasUnknownOwnedRequestCleanup(error: unknown, seen = new Set<unknown>()): boolean {
	if (seen.has(error)) return false;
	seen.add(error);
	return (
		error instanceof OwnedBackendRequestCleanupError ||
		(error instanceof AggregateError &&
			error.errors.some((item) => hasUnknownOwnedRequestCleanup(item, seen))) ||
		(error instanceof Error && hasUnknownOwnedRequestCleanup(error.cause, seen))
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
	budgetWaitTimeoutMs?: number;
	abortSignal?: AbortSignal;
	assertOwnedLease: () => Promise<void>;
	now?: () => Date;
}) {
	if (input.backendRequestLimit === undefined)
		throw new Error("Owned backend request authority requires an explicit limit.");
	validateBackendRequestLimit(input.backendRequestLimit);
	const budgetWaitTimeoutMs = input.budgetWaitTimeoutMs ?? 0;
	if (!Number.isSafeInteger(budgetWaitTimeoutMs) || budgetWaitTimeoutMs < 0)
		throw new Error("Backend request budget wait must be a nonnegative safe integer.");
	const { ledger, workloadId, operationId, tabLeaseId, backendRequestLimit, assertOwnedLease } =
		input;
	const { provider, tenantKey, runtimeProfileId, managedBrowserProfile } = input.scope;
	const now = input.now ?? (() => new Date());
	let backendBudgetDenied = false;
	return {
		admit: async (requestKey: string, effect: () => Promise<void>) => {
			const deadlineMs = now().getTime() + budgetWaitTimeoutMs;
			let admission: Awaited<ReturnType<ProviderInteractionLedger["reserve"]>>;
			for (;;) {
				input.abortSignal?.throwIfAborted();
				await assertOwnedLease();
				admission = await ledger.reserve({
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
				if (
					admission.allowed ||
					admission.reason !== "minute-backend-request-limit" ||
					now().getTime() >= deadlineMs
				)
					break;
				const records = await ledger.list({ provider, tenantKey });
				const timestamps = records
					.filter(
						(record) =>
							record.interactionClass === "backend-request" &&
							(record.state === "reserved" ||
								record.state === "started" ||
								((record.state === "settled" || record.state === "frozen") &&
									record.effectState !== "none")),
					)
					.map((record) => Date.parse(record.startedAt ?? record.reservedAt))
					.filter((at) => at >= now().getTime() - 60000);
				const retryAt = timestamps.length ? Math.min(...timestamps) + 60001 : now().getTime() + 1;
				while (now().getTime() < Math.min(retryAt, deadlineMs)) {
					input.abortSignal?.throwIfAborted();
					await assertOwnedLease();
					const warnings = await ledger.listActiveProviderWarnings({ now: now().toISOString() });
					if (
						warnings.some(
							(warning) =>
								warning.provider === provider.trim().toLowerCase() &&
								warning.tenantKey === tenantKey.trim().toLowerCase(),
						)
					)
						throw new Error("Backend request admission denied: provider-warning.");
					await waitForBackendBudget(
						Math.min(1000, retryAt - now().getTime(), deadlineMs - now().getTime()),
						input.abortSignal,
					);
				}
			}
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

function waitForBackendBudget(ms: number, signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const finish = () => {
			signal?.removeEventListener("abort", abort);
			resolve();
		};
		const timer = setTimeout(finish, Math.max(1, ms));
		const abort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
}
