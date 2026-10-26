import { z } from "zod";
import { validateNativeAdmissionObservation } from "./nativeAdmission.js";
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
/** Node callback ports for exact311f NativeDispatchJoin, backed by the SAME
 * persistent original guard. This is not a Python FD or a bridge implementation.
 * The actual bridge owns Python ObservationTiming conversion; timing is not proof.
 * Opaque qualifier/client/results stay in their original Node process.
 */
export interface NativeOperatorDispatchJoin extends NativeRuntimeExecution {
	admit_once(
		nonce: string,
		observeAndValidate: (nonce: string) => Promise<NativeObservationTiming>,
	): Promise<NativeObservationTiming>;
	qualify_budget<T>(context: NativeReadBudgetContext, qualifier: () => Promise<T>): Promise<T>;
}
interface NativeObservationTiming {
	requestNonce: string;
	observedAtMs: number;
	validUntilMs: number;
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
				await runNativeOperation(
					(operation) =>
						admitOnce(nonce, (suppliedNonce) => {
							if (suppliedNonce !== nonce) refuse();
							return operation();
						}),
					async () => {
						await checkpoint("observing_native", admissionContext);
						if (held || now() >= admissionContext.expiresAtMs) refuse();
						const startedAtMs = now();
						const raw = envelope.parse(await observe(admissionContext, nonce));
						await assertGuard(admissionContext);
						if (held) refuse();
						result = validateNativeAdmissionObservation(raw.privateResult, {
							grant,
							ownerAuthority: owner,
							producerTaskId,
							context: admissionContext,
							requestNonce: nonce,
							startedAtMs,
							nowMs: now(),
						});
						return Object.freeze({
							requestNonce: result.requestNonce,
							observedAtMs: result.observedAtMs,
							validUntilMs: result.validUntilMs,
						});
					},
				);
				if (!result || held) refuse();
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
		qualify: policy.qualify.bind(policy),
		retain: policy.retain.bind(policy),
		acquired: policy.acquired.bind(policy),
		assertCurrent: policy.assertCurrent.bind(policy),
		async uncertain(context: NativeRuntimeLifetimeContext, reason: string) {
			held = true;
			await policy.uncertain(context, reason);
		},
	});
	return Object.freeze({
		lifetime,
		execution,
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
