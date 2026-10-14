import type {
	ProviderInteractionClass,
	ProviderInteractionLedger,
	ProviderInteractionPolicy,
	ProviderInteractionScope,
	ProviderInteractionOutcome,
} from "./interactionLedger.js";
import type {
	BrowserInteractionClass,
	BrowserInteractionGovernor,
} from "./interactionGovernor.js";

export interface LedgerBackedBrowserInteractionGovernor extends BrowserInteractionGovernor {
	finish(input?: {
		outcome?: ProviderInteractionOutcome;
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
	close(input?: {
		outcome?: ProviderInteractionOutcome;
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
}

export class ProviderInteractionAdmissionError extends Error {
	constructor(readonly reason: string) {
		super(`Provider interaction admission denied: ${reason}.`);
		this.name = "ProviderInteractionAdmissionError";
	}
}

export class ProviderInteractionGovernorClosedError extends Error {
	constructor() {
		super("Provider interaction governor is closed.");
		this.name = "ProviderInteractionGovernorClosedError";
	}
}

export function createLedgerBackedBrowserInteractionGovernor(input: {
	ledger: ProviderInteractionLedger;
	scope: ProviderInteractionScope;
	workloadId: string;
	operationId: string;
	tabLeaseId: string;
	policy: ProviderInteractionPolicy;
	baseGovernor: BrowserInteractionGovernor;
	reservationTtlMs?: number;
	now?: () => Date;
}): LedgerBackedBrowserInteractionGovernor {
	const now = input.now ?? (() => new Date());
	let latestLifecycleTimestampMs = Number.NEGATIVE_INFINITY;
	const readLifecycleTimestamp = () => {
		// The ledger intentionally rejects causal timestamps that move backward.
		// Preserve that invariant across host wall-clock corrections within this owner.
		const observedAtMs = now().getTime();
		latestLifecycleTimestampMs = Math.max(latestLifecycleTimestampMs, observedAtMs);
		return new Date(latestLifecycleTimestampMs).toISOString();
	};
	let activeReservationId: string | null = null;
	let closed = false;
	const checkSharedWarning = async () => {
		const warnings = await input.ledger.listActiveProviderWarnings({ now: readLifecycleTimestamp() });
		if (warnings.some((warning) =>
			warning.provider === input.scope.provider.trim().toLowerCase() &&
			warning.tenantKey === input.scope.tenantKey.trim().toLowerCase(),
		)) throw new ProviderInteractionAdmissionError("provider-warning");
	};
	const pace = async (kind: BrowserInteractionClass, abortSignal?: AbortSignal | null) => {
		await checkSharedWarning();
		const controller = new AbortController();
		const signal = abortSignal
			? AbortSignal.any([abortSignal, controller.signal])
			: controller.signal;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let wake: (() => void) | undefined;
		const monitor = async () => {
			while (!stopped) {
				await new Promise<void>((resolve) => {
					wake = resolve;
					timer = setTimeout(resolve, 1000);
				});
				if (stopped) return;
				await checkSharedWarning();
			}
		};
		try {
			await Promise.race([input.baseGovernor.beforeInteraction(kind, signal), monitor()]);
		} finally {
			stopped = true;
			clearTimeout(timer);
			wake?.();
			controller.abort(new Error("Interaction pacing ended."));
		}
	};

	const finish = async (
		settlement: {
			outcome?: ProviderInteractionOutcome;
			effectState?: "none" | "settled" | "outcome-unknown";
			reason?: string | null;
		} = {},
	) => {
		if (!activeReservationId) return;
		const reservationId = activeReservationId;
		activeReservationId = null;
		const settled = await input.ledger.settle({
			reservationId,
			settledAt: readLifecycleTimestamp(),
			effectState: settlement.effectState ?? "settled",
			outcome: settlement.outcome ?? "succeeded",
			stopReason: settlement.reason,
		});
		if (!settled.ok) {
			throw new Error(`Provider interaction settlement failed: ${settled.reason}.`);
		}
	};

	return {
		async beforeInteraction(kind = "generic", abortSignal) {
			if (closed) throw new ProviderInteractionGovernorClosedError();
			await finish();
			await pace(kind, abortSignal);
			if (closed) throw new ProviderInteractionGovernorClosedError();
			const admission = await input.ledger.reserve({
				scope: input.scope,
				workloadId: input.workloadId,
				operationId: input.operationId,
				tabLeaseId: input.tabLeaseId,
				interactionClass: toLedgerInteractionClass(kind),
				mutability: isMutating(kind) ? "provider-mutating" : "read-only",
				startsNewConversation: false,
				now: readLifecycleTimestamp(),
				reservationTtlMs: input.reservationTtlMs ?? 30_000,
				policy: input.policy,
			});
			if (!admission.allowed) throw new ProviderInteractionAdmissionError(admission.reason);
			if (closed) {
				const started = await input.ledger.start({
					reservationId: admission.reservation.reservationId,
					startedAt: readLifecycleTimestamp(),
				});
				if (started.ok) {
					activeReservationId = admission.reservation.reservationId;
					await finish({
						outcome: "cancelled",
						effectState: "none",
						reason: "interaction-governor-closed",
					});
				}
				throw new ProviderInteractionGovernorClosedError();
			}
			const started = await input.ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: readLifecycleTimestamp(),
			});
			if (!started.ok) {
				throw new Error(`Provider interaction start failed: ${started.reason}.`);
			}
			activeReservationId = admission.reservation.reservationId;
			if (closed) {
				await finish({
					outcome: "cancelled",
					effectState: "none",
					reason: "interaction-governor-closed",
				});
				throw new ProviderInteractionGovernorClosedError();
			}
		},
		finish,
		async close(settlement = {}) {
			closed = true;
			await finish(settlement);
		},
	};
}

function toLedgerInteractionClass(kind: BrowserInteractionClass): ProviderInteractionClass {
	switch (kind) {
		case "conversation-read":
			return "conversation-read";
		case "page-refresh":
			return "reload";
		case "renavigation":
			return "navigation";
		case "upload-submit":
		case "provider-recovery":
			return "provider-mutation";
		case "generic":
			return "list-read";
	}
}

function isMutating(kind: BrowserInteractionClass): boolean {
	return kind === "upload-submit" || kind === "provider-recovery";
}
