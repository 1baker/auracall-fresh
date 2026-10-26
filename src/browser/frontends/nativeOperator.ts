import { z } from "zod";
import { validateNativeAdmissionObservation } from "./nativeAdmission.js";
import { type NativeLedgerWriter, requireNativeLedgerWriter } from "./nativeLedgerWriter.js";
import { createRetainedNativeLifetime } from "./nativeLifetime.js";
import { type NativeReadBudgetContext, qualifyNativeReadBudget } from "./nativeReadBudget.js";
import {
	type NativeRuntimeDispatch,
	type NativeRuntimeExecution,
	type NativeRuntimeLifetimeContext,
	nativeOwnerGrantSchema,
	nativeRegisteredAuthoritySchema,
	runNativeOperation,
} from "./nativeRuntime.js";
import { FrontendError } from "./types.js";

type OriginalContext = Readonly<Omit<NativeRuntimeLifetimeContext, "nativeTask">>;
type Stage =
	| "qualifying_admit"
	| "observing_native"
	| "qualifying_budget"
	| "sdk_handshake"
	| "consumer_acquisition"
	| "governed_use";

/** Exact26d component methods, on ONE already-acquired live instance/FD.
 * A Node/Python transport and actual all-writer participation are NOT supplied
 * here. No JSON handle, per-callback process/claim or automatic close is accepted.
 */
export interface NativeOriginalGuard {
	checkpoint(stage: Stage, context: OriginalContext): Promise<void>;
	assert_current(context: OriginalContext): Promise<void>;
	attach_read_budget_context(context: NativeReadBudgetContext): Promise<void>;
}
export interface NativeAdmissionSupplier {
	/** Actual complete original accounting + writer exclusion; persist TWO reads
	 * BEFORE observation. Unknown carry refuses; lost reply retains both charges.
	 */
	reserveObservationReads(context: OriginalContext, reads: 2): Promise<void>;
	/** Execute the pinned same-generation helper/peer ONCE using private stdin,
	 * new owned0600 output and this nonce. Never load caller-provided proof JSON.
	 * Expected grant/owner/task must come from the same private receiver binding.
	 */
	observe(context: OriginalContext, requestNonce: string): Promise<unknown>;
	/** Complete original carry including the two reserved reads; not nativeHistory counts. */
	originalUsage(context: NativeReadBudgetContext): Promise<unknown>;
	/** Actual held protection AND current native authority for the full acquired
	 * task and operation. The three-field operator checkpoint alone is insufficient.
	 */
	assertCurrent(
		context: NativeRuntimeLifetimeContext,
		dispatch: NativeRuntimeDispatch,
	): Promise<void>;
}
export interface NativeOperatorOptions {
	writer: NativeLedgerWriter;
	guard: NativeOriginalGuard;
	dispatchJoin: NativeOperatorDispatchJoin;
	supplier: NativeAdmissionSupplier;
	grant: unknown;
	ownerAuthority: unknown;
	producerTaskId: string;
	producerSha256: string;
	receiptDigest: string;
	now?: () => number;
}
/** Private Node callback boundary for reviewed ab099 full-v2 admission.
 * The actual persistent carrier implements the Python ABI; this is not an RPC
 * protocol or a new phase driver. Opaque values stay on this Node instance until
 * the same carrier acknowledges its AFTER checks. Timing alone is not proof.
 */
export interface NativeOperatorDispatchJoin extends NativeRuntimeExecution {
	admit_once<T>(
		nonce: string,
		observeAndValidate: (nonce: string) => Promise<NativeFullV2OperationResult<T>>,
		validateFullV2: (wire: unknown) => NativeObservationProjection,
	): Promise<T>;
	/** SAME validated acquisition; no second Open, task substitution or new handle. */
	acquired(context: NativeRuntimeLifetimeContext): Promise<void>;
	qualify_budget<T>(context: NativeReadBudgetContext, qualifier: () => Promise<T>): Promise<T>;
}
export interface NativeObservationProjection {
	readonly receiptDigest: string;
	readonly producerSha256: string;
	readonly requestNonce: string;
	readonly observedAtMs: number;
	readonly validUntilMs: number;
}
export interface NativeFullV2OperationResult<T> {
	/** Private completed observation only; never a general uploaded proof or tool result. */
	readonly wire: ReturnType<typeof validateNativeAdmissionObservation>;
	/** Original opaque Node value; the carrier must not serialize or reconstruct it. */
	readonly value: T;
}
function freezeObservation<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const nested of Object.values(value)) freezeObservation(nested);
		Object.freeze(value);
	}
	return value;
}
const envelope = z
	.object({
		publicResult: z
			.object({
				success: z.literal(true),
				data: z.object({ ownerObservation: z.literal("completed") }).strict(),
			})
			.strict(),
		privateResult: z.unknown(),
	})
	.strict();
function refuse(): never {
	throw new FrontendError(
		"native_operator_unqualified",
		"Original operator integration is unqualified.",
	);
}

/** Phase-aware source composition for startOwnNativeRuntime. It supplies neither
 * a production guard/supplier nor an activation path in the ordinary CLI.
 * Existing f874 accounting and daa lifetime checks remain mandatory.
 */
export function createNativeOperatorIntegration(options: NativeOperatorOptions) {
	const writer = requireNativeLedgerWriter(options.writer);
	const guard = options.guard,
		supplier = options.supplier,
		join = options.dispatchJoin,
		now = options.now ?? Date.now;
	if (
		!guard ||
		!supplier ||
		!join ||
		[
			guard.checkpoint,
			guard.assert_current,
			guard.attach_read_budget_context,
			supplier.reserveObservationReads,
			supplier.observe,
			supplier.originalUsage,
			supplier.assertCurrent,
			join.admit_once,
			join.qualify_budget,
			join.handshake,
			join.acquire,
			join.protected_dispatch,
			join.acquired,
		].some((method) => typeof method !== "function")
	)
		refuse();
	// Capture bound methods once: a caller cannot swap the guard object mid-attempt.
	const checkpoint = guard.checkpoint.bind(guard),
		assertGuard = guard.assert_current.bind(guard),
		attachBudget = guard.attach_read_budget_context.bind(guard),
		reserve = supplier.reserveObservationReads.bind(supplier),
		observe = supplier.observe.bind(supplier),
		usage = supplier.originalUsage.bind(supplier),
		authority = supplier.assertCurrent.bind(supplier),
		admitOnce = join.admit_once.bind(join),
		notifyAcquired = join.acquired.bind(join),
		qualifyBudget = join.qualify_budget.bind(join);
	const execution: NativeRuntimeExecution = Object.freeze({
		handshake: join.handshake.bind(join),
		acquire: join.acquire.bind(join),
		protected_dispatch: join.protected_dispatch.bind(join),
	});
	const parsedGrant = nativeOwnerGrantSchema.safeParse(options.grant);
	const parsedOwner = nativeRegisteredAuthoritySchema.safeParse(options.ownerAuthority);
	if (!parsedGrant.success || !parsedOwner.success) refuse();
	const grant = parsedGrant.data,
		owner = parsedOwner.data;
	const producerTaskId = options.producerTaskId,
		producerSha256 = options.producerSha256;
	const receiptDigest = options.receiptDigest;
	if (
		!producerTaskId ||
		producerTaskId.length > 1024 ||
		producerTaskId.trim() !== producerTaskId ||
		owner.profileId !== grant.producer.profileId ||
		owner.principalId === grant.caller.principalId ||
		owner.capabilityId === grant.caller.capabilityId
	)
		refuse();
	let base: OriginalContext | undefined;
	let admissionValidUntilMs = 0;
	let phase: "new" | "observed" | "budgeted" | "connected" | "acquiring" | "governed" = "new";
	let held = false,
		busy = false;
	function original(context: NativeRuntimeLifetimeContext): OriginalContext {
		if (
			!base ||
			context.receiptDigest !== base.receiptDigest ||
			context.producerSha256 !== base.producerSha256 ||
			context.expiresAtMs !== base.expiresAtMs
		)
			refuse();
		return base;
	}
	async function run<T>(action: () => Promise<T>, readback = false): Promise<T> {
		if (busy || (held && !readback)) {
			held = true;
			return refuse();
		}
		busy = true;
		try {
			const result = await action();
			if (held && !readback) refuse();
			return result;
		} catch {
			held = true;
			return refuse();
		} finally {
			busy = false;
		}
	}
	const policy = createRetainedNativeLifetime({
		producerSha256,
		now,
		admit: (context, nonce) =>
			run(async () => {
				if (
					phase !== "new" ||
					context.receiptDigest !== receiptDigest ||
					context.expiresAtMs !== grant.expiresAtMs
				)
					refuse();
				base = Object.freeze({
					receiptDigest: context.receiptDigest,
					producerSha256: context.producerSha256,
					expiresAtMs: context.expiresAtMs,
				});
				await checkpoint("qualifying_admit", base);
				if (held) refuse();
				await reserve(base, 2);
				await assertGuard(base);
				if (held) refuse();
				const admissionContext = base;
				let result: ReturnType<typeof validateNativeAdmissionObservation> | undefined;
				let startedAtMs = 0,
					validationCalls = 0,
					admissionClosed = false;
				const validateFullV2 = (wire: unknown): NativeObservationProjection => {
					if (admissionClosed || held || !result || validationCalls++ !== 0) {
						held = true;
						return refuse();
					}
					try {
						const checked = validateNativeAdmissionObservation(wire, {
							grant,
							ownerAuthority: owner,
							producerTaskId,
							context: admissionContext,
							requestNonce: nonce,
							startedAtMs,
							nowMs: now(),
						});
						if (JSON.stringify(checked) !== JSON.stringify(result)) refuse();
						return Object.freeze({
							receiptDigest: checked.receiptDigest,
							producerSha256: checked.producerSha256,
							requestNonce: checked.requestNonce,
							observedAtMs: checked.observedAtMs,
							validUntilMs: checked.validUntilMs,
						});
					} catch {
						held = true;
						return refuse();
					}
				};
				try {
					await runNativeOperation(
						(operation) =>
							admitOnce(
								nonce,
								async (suppliedNonce) => {
									if (suppliedNonce !== nonce) {
										held = true;
										refuse();
									}
									const value = await operation();
									return Object.freeze({ wire: value, value });
								},
								validateFullV2,
							),
						async () => {
							await checkpoint("observing_native", admissionContext);
							if (held || now() >= admissionContext.expiresAtMs) refuse();
							startedAtMs = now();
							const raw = envelope.parse(await observe(admissionContext, nonce));
							await assertGuard(admissionContext);
							if (held) refuse();
							result = freezeObservation(
								validateNativeAdmissionObservation(raw.privateResult, {
									grant,
									ownerAuthority: owner,
									producerTaskId,
									context: admissionContext,
									requestNonce: nonce,
									startedAtMs,
									nowMs: now(),
								}),
							);
							return result;
						},
					);
				} finally {
					admissionClosed = true;
				}
				if (!result || held || validationCalls !== 1) refuse();
				admissionValidUntilMs = result.validUntilMs;
				phase = "observed";
				return {
					receiptDigest: result.receiptDigest,
					producerSha256: result.producerSha256,
					requestNonce: result.requestNonce,
					observedAtMs: result.observedAtMs,
					validUntilMs: result.validUntilMs,
				};
			}),
		assertCurrent: (context, dispatch) =>
			run(
				async () => {
					const origin = original(context);
					let stage: Stage;
					if (dispatch.kind === "sdk_connect") {
						if (phase !== "budgeted") refuse();
						stage = "sdk_handshake";
					} else if (dispatch.kind === "acquire") {
						if (phase !== "connected") refuse();
						stage = "consumer_acquisition";
					} else {
						if ((phase !== "acquiring" && phase !== "governed") || !context.nativeTask) refuse();
						const task = context.nativeTask,
							expected = grant.producer;
						if (
							task.profileId !== expected.profileId ||
							task.browserId !== expected.browserId ||
							task.tabId !== expected.tabId ||
							task.targetId !== expected.targetId
						)
							refuse();
						stage = "governed_use";
					}
					await checkpoint(stage, origin);
					// Do not trim nativeTask/dispatch when asking the REAL authority supplier.
					await authority(context, dispatch);
					await assertGuard(origin);
					if (held && dispatch.kind !== "original_readback" && dispatch.kind !== "release")
						refuse();
					phase =
						stage === "sdk_handshake"
							? "connected"
							: stage === "consumer_acquisition"
								? "acquiring"
								: "governed";
				},
				dispatch.kind === "original_readback" || dispatch.kind === "release",
			),
	});
	const lifetime = Object.freeze({
		assertAcquiredCurrent(context: NativeRuntimeLifetimeContext) {
			if (held) refuse();
			original(context);
			policy.assertAcquiredCurrent(context);
		},
		qualify: policy.qualify.bind(policy),
		retain: policy.retain.bind(policy),
		acquired: (context: NativeRuntimeLifetimeContext) =>
			run(async () => {
				original(context);
				if (phase !== "acquiring" || !context.nativeTask) refuse();
				const captured = Object.freeze({
					...context,
					nativeTask: Object.freeze({ ...context.nativeTask }),
				});
				await policy.acquired(captured);
				if (held) refuse();
				await notifyAcquired(captured);
				const currentTime = now();
				if (held || currentTime >= admissionValidUntilMs || currentTime >= captured.expiresAtMs)
					refuse();
			}),
		assertCurrent: policy.assertCurrent.bind(policy),
		async uncertain(context: NativeRuntimeLifetimeContext, reason: string) {
			held = true;
			await policy.uncertain(context, reason);
		},
	});
	return Object.freeze({
		lifetime,
		execution,
		writer,
		readBudget: (context: NativeReadBudgetContext) =>
			run(async () => {
				const origin = original(context);
				if (phase !== "observed") refuse();
				await attachBudget(context);
				if (held) refuse();
				await checkpoint("qualifying_budget", origin);
				if (held) refuse();
				const budget = await runNativeOperation(
					(operation) => qualifyBudget(context, operation),
					() => qualifyNativeReadBudget(context, usage, now),
				);
				await assertGuard(origin);
				if (held) refuse();
				phase = "budgeted";
				return budget;
			}),
	});
}
