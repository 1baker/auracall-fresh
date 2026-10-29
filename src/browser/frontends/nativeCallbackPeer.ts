import type { Readable, Writable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
	NATIVE_CALLBACK_FRAME_LIMIT,
	NATIVE_CALLBACK_PROTOCOL,
	PRODUCER_CALLBACK_PROTOCOL,
	type NativeCallbackFrame,
	NativeCallbackFrames,
} from "./nativeCallbackFrames.js";
import {
	bindingSchema,
	recordRefSchema,
	type ProducerBinding,
	type ProducerRecordRef,
} from "./nativeProducerPhaseRecords.js";
import type { NativeFiniteAuthority, NativeFiniteOperation } from "./nativeFiniteSend.js";
import type { NativeLedgerOperation, NativeLedgerWriter } from "./nativeLedgerWriter.js";
import type {
	NativeAdmissionSupplier,
	NativeFullV2OperationResult,
	NativeObservationProjection,
	NativeOperatorDispatchJoin,
	NativeOriginalGuard,
} from "./nativeOperator.js";
import type {
	NativeRuntimeDispatch,
	NativeRuntimeLifetimeContext,
	NativeTaskReaderReceiver,
} from "./nativeRuntime.js";
import { FrontendError, type NativeTaskBinding } from "./types.js";

type Base = Readonly<Omit<NativeRuntimeLifetimeContext, "nativeTask">>;
type Target = Pick<NativeTaskBinding, "profileId" | "browserId" | "tabId" | "targetId">;
const text = z.string().min(1).max(1024);
const targetSchema = z
	.object({ profileId: text, browserId: text, tabId: text, targetId: text })
	.strict();
const taskSchema = targetSchema.extend({ taskId: text, controlRef: text }).strict();
const baseSchema = z
	.object({
		receiptDigest: z.string().regex(/^[a-f0-9]{64}$/),
		producerSha256: z.string().regex(/^[a-f0-9]{64}$/),
		expiresAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	})
	.strict();
const projectionSchema = z
	.object({
		receiptDigest: z.string(),
		producerSha256: z.string(),
		requestNonce: z.string(),
		observedAtMs: z.number().int(),
		validUntilMs: z.number().int(),
	})
	.strict();
type Callback = Extract<NativeCallbackFrame, { type: "callback" }>;
interface Pending {
	id: number;
	method: string;
	args: unknown[];
	resolve(value: unknown): void;
	reject(error: Error): void;
	timer: ReturnType<typeof setTimeout>;
}
interface Root extends Pending {
	operation?: () => Promise<unknown>;
	observe?: (nonce: string) => Promise<NativeFullV2OperationResult<unknown>>;
	validate?: (wire: unknown) => NativeObservationProjection;
	seen: Set<string>;
	busy: boolean;
	value?: unknown;
	wire?: unknown;
	beforeTask?: NativeTaskBinding;
	producer?: () => Promise<ProducerLocalResult<unknown>>;
	link?: () => Promise<StagedNativeLink>;
	trace?: ProducerTraceReference;
	staged?: StagedNativeLink;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const traceReferenceSchema = z
	.object({
		bindingDigest: hash,
		operationId: z.string().uuid(),
		reservationDigest: hash,
		traceRecord: recordRefSchema,
	})
	.strict();
const planSourceSchema = z
	.object({
		bindingRecord: recordRefSchema,
		planRecord: recordRefSchema,
		bindingDigest: hash,
		planDigest: hash,
	})
	.strict();
const prepareAckSchema = z
	.object({
		reservationRecord: recordRefSchema,
		reservationDigest: hash,
		bindingDigest: hash,
		planDigest: hash,
	})
	.strict();
const producerDescriptorSchema = z
	.object({ bindingDigest: hash, operationId: z.string().uuid(), operationRecord: recordRefSchema })
	.strict();
const runCheckSchema = z
	.object({
		bindingDigest: hash,
		operationId: z.string().uuid(),
		phase: z.enum(["reserved", "producer", "producer-completed", "native-link"]),
		point: z.enum([
			"before-callback",
			"after-callback",
			"before-dispatch",
			"after-dispatch",
			"before-commit",
			"before-publication",
			"cleanup",
		]),
	})
	.strict();
const traceReadbackSchema = z
	.object({
		state: z.enum(["completed", "unknown", "unavailable"]),
		trace: traceReferenceSchema.nullable(),
		fresh: z.literal(false),
	})
	.strict();
export type ProducerTraceReference = z.infer<typeof traceReferenceSchema>;
export type ProducerPlanSource = z.infer<typeof planSourceSchema>;
export type ProducerDescriptor = z.infer<typeof producerDescriptorSchema>;
export type ProducerRunCurrentCheck = z.infer<typeof runCheckSchema>;
export type ProducerPrepareAck = z.infer<typeof prepareAckSchema>;
export interface ProducerLocalResult<T> {
	readonly trace: ProducerTraceReference;
	readonly value: T;
}
export interface ProducerRunCapability {
	readonly kind: "retained-producer-run";
}
/** Private factory callback result. Only nativeLinkRecord crosses the channel. */
export interface StagedNativeLink {
	readonly nativeLinkRecord: ProducerRecordRef;
	readonly context: Base;
	readonly target: Target;
}
export interface ProducerCallbackPeerOptions {
	protocol: typeof PRODUCER_CALLBACK_PROTOCOL;
	input: Writable;
	output: Readable;
	timeoutMs: number;
}
export interface NativeCallbackPeerOptions {
	/** Already connected dedicated private IPC. No process creation/reconnect. The
	 * admitted operator must supply the matching pinned anonymous FD endpoints. */
	input: Writable;
	output: Readable;
	context: Base;
	target: Target;
	timeoutMs: number;
}
const attached = new WeakSet<object>();
// Preserve original opaque results and in-flight attempts on uncertainty. Never
// replace a poisoned binding, close its streams or discard its retained client.
const retained = new Set<object>();
function failure() {
	return new FrontendError(
		"native_callback_peer_uncertain",
		"Reconcile the original private carrier; do not replay.",
	);
}
function metadata<T>(value: T): T {
	const encoded = JSON.stringify(value);
	if (encoded === undefined) throw failure();
	const parsed = JSON.parse(encoded) as T;
	if (!isDeepStrictEqual(parsed, value)) throw failure();
	return parsed;
}

/** Exact revision3 carrier consumer, not an authority provider. Opaque budgets,
 * SDK clients and results never cross IPC. Its BEFORE/callback/AFTER sequence is
 * the ONE operator driver; ordinary/finite writers must not nest a join root. */
export function createNativeCallbackPeer(options: NativeCallbackPeerOptions) {
	if ("protocol" in options) throw failure();
	return createPeer(options);
}
/** Explicit candidate-only v4 from the initial connection; no protocol switch,
 * native context placeholders, second reader or second native peer at linkage. */
export function createProducerCallbackPeer(options: ProducerCallbackPeerOptions) {
	if (
		options.protocol !== PRODUCER_CALLBACK_PROTOCOL ||
		"context" in options ||
		"target" in options
	)
		throw failure();
	return createPeer(options);
}
function createPeer(options: NativeCallbackPeerOptions | ProducerCallbackPeerOptions) {
	const input = options.input,
		output = options.output;
	const phaseMode = "protocol" in options;
	const protocol = phaseMode ? PRODUCER_CALLBACK_PROTOCOL : NATIVE_CALLBACK_PROTOCOL;
	let context: Base | undefined = phaseMode
		? undefined
		: Object.freeze(baseSchema.parse(options.context));
	let target: Target | undefined = phaseMode
		? undefined
		: Object.freeze(targetSchema.parse(options.target));
	const timeoutMs = options.timeoutMs;
	if (
		!input ||
		!output ||
		attached.has(input) ||
		attached.has(output) ||
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs <= 0 ||
		timeoutMs > 300000 ||
		input.destroyed ||
		!input.writable ||
		output.destroyed ||
		!output.readable ||
		output.readableEncoding
	)
		throw failure();
	attached.add(input);
	attached.add(output);
	const pending = new Map<number, Pending>();
	const attempts: Root[] = [];
	const frames = new NativeCallbackFrames(protocol);
	let sequence = 0,
		callbackSequence = 0,
		held = false;
	let epoch = 0;
	const holdListeners = new Set<() => void>();
	let root: Root | undefined;
	let taskReader: (() => Readonly<NativeTaskBinding>) | undefined;
	const retention = { attempts, pending, input, output };
	retained.add(retention);
	function assertCurrent() {
		if (held) throw failure();
	}
	function poison() {
		if (!held) ++epoch;
		held = true;
		for (const p of pending.values()) {
			clearTimeout(p.timer);
			p.reject(failure());
		}
		pending.clear();
		for (const listener of holdListeners) {
			try {
				listener();
			} catch {
				/* already held */
			}
		}
	}
	function write(frame: object) {
		const bytes = Buffer.from(`${JSON.stringify({ protocol, ...frame })}\n`);
		if (bytes.length > NATIVE_CALLBACK_FRAME_LIMIT || input.destroyed || !input.writable)
			throw failure();
		input.write(bytes, (error: Error | null | undefined) => {
			if (error) poison();
		});
	}
	function hold() {
		if (held) return;
		poison(); // synchronous local fence BEFORE notification, never wait for ACK
		try {
			write({ type: "call", id: ++sequence, method: "binding.hold", args: [] });
		} catch {
			/* same binding retained */
		}
	}
	function refuse(): never {
		hold();
		throw failure();
	}
	function call<T>(
		method: string,
		args: unknown[],
		hooks?: Partial<Pick<Root, "operation" | "observe" | "validate" | "producer" | "link">>,
	): Promise<T> {
		try {
			assertCurrent();
			if (!method.startsWith("phase.") && method !== "binding.hold" && (!context || !target))
				return refuse();
			if (method.startsWith("phase.") && !phaseMode) return refuse();
			const capturedEpoch = epoch;
			const isRoot = hooks !== undefined;
			// One root; a nested assertion is allowed only while its Node callback runs.
			if (
				(isRoot && pending.size) ||
				(!isRoot && pending.size && (!root?.busy || pending.size !== 1)) ||
				(method === "finite.verify" && pending.size)
			)
				return refuse();
			const captured = metadata(args),
				id = ++sequence;
			return new Promise<T>((resolve, reject) => {
				const p: Pending = {
					id,
					method,
					args: captured,
					resolve: (value) => resolve(value as T),
					reject,
					timer: setTimeout(hold, timeoutMs),
				};
				if (isRoot) {
					root = { ...p, ...hooks, seen: new Set(), busy: false };
					attempts.push(root);
					pending.set(id, root);
				} else pending.set(id, p);
				try {
					write({ type: "call", id, method, args: captured });
				} catch {
					hold();
				}
			}).then((value) => {
				// A delivered ACK is not permission to hand off after a hold/fault
				// observed before this awaiting continuation resumes.
				assertCurrent();
				if (epoch !== capturedEpoch) return refuse();
				return value;
			});
		} catch {
			return Promise.reject(failure());
		}
	}
	function callbackKey(f: Callback): string {
		return f.method === "current_task" ? `${f.method}:${f.args[0]}` : f.method;
	}
	function validateCallback(f: Callback, r: Root) {
		if (f.parent !== r.id || f.id !== callbackSequence + 1 || r.busy || r.seen.has(callbackKey(f)))
			throw failure();
		const args = f.args;
		if (f.method === "execute_producer" || f.method === "verify_native_link") {
			if (
				!phaseMode ||
				args.length ||
				(f.method === "execute_producer"
					? r.method !== "phase.producer" || !r.producer
					: r.method !== "phase.link_native" || !r.link)
			)
				throw failure();
		} else if (f.method === "invoke") {
			if (!r.operation || !isDeepStrictEqual(args, [r.method, []])) throw failure();
			if (
				(r.method === "join.protected_dispatch" ||
					((r.method === "writer.protect" || r.method === "finite.protect") &&
						(r.args[0] as NativeLedgerOperation).bucket !== "acquisition")) &&
				!r.seen.has("current_task:before")
			)
				throw failure();
		} else if (f.method === "observe_full_v2") {
			if (!r.observe || !isDeepStrictEqual(args, [r.args[0]])) throw failure();
		} else if (f.method === "validate_full_v2") {
			if (!r.validate || !r.seen.has("observe_full_v2") || !isDeepStrictEqual(args, [r.wire]))
				throw failure();
		} else {
			if (
				!taskReader ||
				args.length !== 1 ||
				(args[0] !== "before" && args[0] !== "after") ||
				![
					"writer.protect",
					"finite.protect",
					"join.protected_dispatch",
					"binding.acquired",
				].includes(r.method) ||
				((r.method === "writer.protect" || r.method === "finite.protect") &&
					(r.args[0] as NativeLedgerOperation).bucket === "acquisition") ||
				(args[0] === "before" && r.seen.has("invoke")) ||
				(args[0] === "after" && (!r.seen.has("invoke") || !r.seen.has("current_task:before")))
			)
				throw failure();
		}
	}
	function complete(r: Root): boolean {
		if (r.method === "phase.prepare" || r.method === "phase.read_trace") return true;
		if (r.method === "phase.producer") return r.seen.has("execute_producer");
		if (r.method === "phase.link_native") return r.seen.has("verify_native_link");
		if (r.method === "join.admit_once")
			return r.seen.has("observe_full_v2") && r.seen.has("validate_full_v2");
		if (r.method === "binding.acquired") return r.seen.has("current_task:before");
		const needsTask =
			r.method === "join.protected_dispatch" ||
			((r.method === "writer.protect" || r.method === "finite.protect") &&
				(r.args[0] as NativeLedgerOperation).bucket !== "acquisition");
		return r.seen.has("invoke") && (!needsTask || r.seen.has("current_task:after"));
	}
	async function callback(f: Callback, r: Root) {
		r.busy = true;
		r.seen.add(callbackKey(f));
		callbackSequence = f.id;
		try {
			let result: unknown = null;
			if (f.method === "execute_producer") {
				const produced = await r.producer?.();
				if (!produced) throw failure();
				r.value = produced.value; // retain BEFORE metadata validation/AFTER
				r.trace = traceReferenceSchema.parse(metadata(produced.trace));
				result = r.trace;
			} else if (f.method === "verify_native_link") {
				const staged = await r.link?.();
				if (!staged) throw failure();
				r.staged = staged; // private native values never enter callback_result
				baseSchema.parse(staged.context);
				targetSchema.parse(staged.target);
				result = { nativeLinkRecord: recordRefSchema.parse(metadata(staged.nativeLinkRecord)) };
			} else if (f.method === "invoke") r.value = await r.operation?.();
			else if (f.method === "observe_full_v2") {
				const observed = await r.observe?.(f.args[0] as string);
				if (!observed) throw failure();
				r.value = observed.value;
				r.wire = metadata(observed.wire);
				result = { wire: r.wire };
			} else if (f.method === "validate_full_v2") {
				result = projectionSchema.parse(r.validate?.(f.args[0]));
				const wire = r.wire as Record<string, unknown>;
				for (const [key, value] of Object.entries(result as object))
					if (wire[key] !== value) throw failure();
			} else {
				// A fresh synchronous memory read from the SAME session for EACH stage.
				const task = taskSchema.parse(taskReader?.());
				for (const key of ["profileId", "browserId", "tabId", "targetId"] as const)
					if (!target || task[key] !== target[key]) throw failure();
				const descriptor = r.args[0] as NativeLedgerOperation &
					NativeFiniteOperation &
					NativeRuntimeLifetimeContext;
				const expected =
					r.method === "binding.acquired" || r.method === "join.protected_dispatch"
						? descriptor.nativeTask
						: r.method === "writer.protect"
							? descriptor.original.nativeTask
							: descriptor.context.nativeTask;
				if (
					!isDeepStrictEqual(task, expected) ||
					(r.beforeTask && !isDeepStrictEqual(task, r.beforeTask))
				)
					throw failure();
				if (f.args[0] === "before") r.beforeTask = task;
				result = task;
			}
			assertCurrent();
			// No assertion may outlive the callback that issued it.
			if (pending.size !== 1 || pending.get(r.id) !== r) throw failure();
			r.busy = false;
			write({ type: "callback_result", id: f.id, parent: f.parent, ok: true, result });
		} catch {
			// Preserve r.value even if the callback completed after local hold.
			poison();
			try {
				write({ type: "callback_result", id: f.id, parent: f.parent, ok: false, result: null });
			} catch {
				/* retained */
			}
		}
	}
	function accept(batch: NativeCallbackFrame[]) {
		const seen = new Set<number>();
		let hasCallback = false;
		for (const f of batch) {
			if (f.type === "fault") throw failure();
			if (f.type === "callback") {
				if (!root || hasCallback) throw failure();
				validateCallback(f, root);
				hasCallback = true;
			} else {
				const p = pending.get(f.id);
				if (
					!p ||
					seen.has(f.id) ||
					!f.ok ||
					(![
						"finite.verify",
						"supplier.observe",
						"supplier.original_usage",
						"phase.prepare",
						"phase.read_trace",
					].includes(p.method) &&
						f.result !== null)
				)
					throw failure();
				seen.add(f.id);
				if (p.method === "phase.prepare") prepareAckSchema.parse(f.result);
				if (p.method === "phase.read_trace") traceReadbackSchema.parse(f.result);
				if (p === root && (root.busy || !complete(root) || pending.size !== 1)) throw failure();
			}
		}
		if (hasCallback && batch.length !== 1) throw failure();
		// Nothing above this point may resolve a successful reply or run user code.
		for (const f of batch) {
			if (f.type === "callback") {
				void callback(f, root as Root);
				continue;
			}
			if (f.type !== "return") continue;
			const p = pending.get(f.id) as Pending;
			clearTimeout(p.timer);
			pending.delete(p.id);
			const value =
				p === root && !["phase.prepare", "phase.read_trace"].includes(p.method)
					? root.value
					: f.result;
			if (p === root) root = undefined;
			p.resolve(value);
		}
	}
	output.on("data", (chunk: Buffer) => {
		if (held) return;
		try {
			accept(frames.push(chunk));
		} catch {
			hold();
		}
	});
	for (const event of ["error", "close", "end"] as const) output.on(event, hold);
	for (const event of ["error", "close", "finish"] as const) input.on(event, hold);
	const taskReceiver = Object.freeze<NativeTaskReaderReceiver>({
		bind(reader) {
			assertCurrent();
			if (!context || !target || taskReader || typeof reader !== "function") refuse();
			taskReader = reader;
		},
	});
	const guard = Object.freeze<NativeOriginalGuard>({
		checkpoint: (stage, context) => call<void>("guard.checkpoint", [stage, context]),
		assert_current: (context) => call<void>("guard.assert_current", [context]),
		attach_read_budget_context: (context) =>
			call<void>("guard.attach_read_budget_context", [context]),
	});
	const dispatchJoin = Object.freeze<NativeOperatorDispatchJoin>({
		admit_once: (nonce, observe, validate) =>
			call("join.admit_once", [nonce], { observe, validate }),
		qualify_budget: (context, operation) => call("join.qualify_budget", [context], { operation }),
		handshake: (operation) => call("join.handshake", [], { operation }),
		acquire: (operation) => call("join.acquire", [], { operation }),
		// Current ledger/finite drivers carry the actual full dispatch. The old
		// callback-only port has NO metadata; never reconstruct it from a last call.
		protected_dispatch: async () => refuse(),
		acquired: (context) => call<void>("binding.acquired", [context], {}),
	});
	const writer = Object.freeze<NativeLedgerWriter>({
		protect: (operation, run) => call("writer.protect", [operation], { operation: run }),
		assertCurrent: (operation, stage) => call<void>("writer.assert_current", [operation, stage]),
	});
	const finite = Object.freeze<NativeFiniteAuthority>({
		verify: (context) => call("finite.verify", [context]),
		assertClaim: (context) => call<void>("finite.assert_claim", [context]),
		assertCurrent: (operation, stage) => call<void>("finite.assert_current", [operation, stage]),
		protect: (operation, run) => call("finite.protect", [operation], { operation: run }),
	});
	const assertNativeCurrent = (
		context: NativeRuntimeLifetimeContext,
		dispatch: NativeRuntimeDispatch,
	) => call<void>("native.assert_current", [context, dispatch]);
	// Exact v3 owner RPCs on this SAME retained channel. The existing admission
	// and read-budget validators consume the unmodified results. These calls do
	// not create a provider, inventory, reservation, capacity or local authority.
	const supplier = Object.freeze<NativeAdmissionSupplier>({
		reserveObservationReads: (context, reads) =>
			call<void>("supplier.reserve_observation_reads", [context, reads]),
		observe: (context, nonce) => call<unknown>("supplier.observe", [context, nonce]),
		originalUsage: (context) => call<unknown>("supplier.original_usage", [context]),
		assertCurrent: assertNativeCurrent,
	});
	interface RunState {
		binding: ProducerBinding;
		source: ProducerPlanSource;
		ack: ProducerPrepareAck;
		phase: "reserved" | "producer" | "producer-completed" | "native-link" | "native";
		trace?: ProducerTraceReference;
	}
	const capabilities = new WeakMap<ProducerRunCapability, RunState>();
	let prepared = false;
	function runState(capability: ProducerRunCapability) {
		assertCurrent();
		const state = capabilities.get(capability);
		if (!phaseMode || !state) return refuse();
		return state;
	}
	const phase = Object.freeze({
		/** Retention only, including late values after hold; never a success fence. */
		retainProducerValue(value: unknown) {
			if (!root || root.method !== "phase.producer" || !root.seen.has("execute_producer"))
				return refuse();
			root.value = value;
		},
		async prepare(
			binding: ProducerBinding,
			source: ProducerPlanSource,
		): Promise<ProducerRunCapability> {
			try {
				if (!phaseMode || prepared) return refuse();
				prepared = true; // consumed before ANY await
				const capturedBinding = bindingSchema.parse(metadata(binding));
				const capturedSource = planSourceSchema.parse(metadata(source));
				const ack = prepareAckSchema.parse(await call("phase.prepare", [capturedSource], {}));
				assertCurrent();
				if (
					ack.bindingDigest !== capturedSource.bindingDigest ||
					ack.planDigest !== capturedSource.planDigest
				)
					return refuse();
				const capability = Object.freeze({ kind: "retained-producer-run" as const });
				capabilities.set(capability, {
					binding: capturedBinding,
					source: capturedSource,
					ack,
					phase: "reserved",
				});
				return capability;
			} catch {
				return refuse();
			}
		},
		prepared(capability: ProducerRunCapability) {
			return metadata(runState(capability).ack);
		},
		async runProducer<T>(
			capability: ProducerRunCapability,
			operation: ProducerDescriptor,
			run: () => Promise<ProducerLocalResult<T>>,
		): Promise<T> {
			try {
				const state = runState(capability),
					descriptor = producerDescriptorSchema.parse(metadata(operation));
				if (
					state.phase !== "reserved" ||
					descriptor.bindingDigest !== state.source.bindingDigest ||
					descriptor.operationId !== state.binding.producerOperationId ||
					typeof run !== "function"
				)
					return refuse();
				state.phase = "producer";
				let trace: ProducerTraceReference | undefined;
				const value = await call<T>("phase.producer", [descriptor], {
					producer: async () => {
						const produced = await run();
						// Retain opaque value even when the trace/ACK is invalid.
						if (root) root.value = produced.value;
						trace = traceReferenceSchema.parse(metadata(produced.trace));
						if (
							trace.bindingDigest !== descriptor.bindingDigest ||
							trace.operationId !== descriptor.operationId ||
							trace.reservationDigest !== state.ack.reservationDigest
						)
							return refuse();
						return { value: produced.value, trace };
					},
				});
				assertCurrent();
				if (!trace || state.phase !== "producer") return refuse();
				state.trace = trace;
				state.phase = "producer-completed";
				return value;
			} catch {
				return refuse();
			}
		},
		async assertCurrent(
			capability: ProducerRunCapability,
			check: ProducerRunCurrentCheck,
		): Promise<void> {
			try {
				const state = runState(capability),
					captured = runCheckSchema.parse(metadata(check));
				if (
					captured.bindingDigest !== state.source.bindingDigest ||
					captured.operationId !== state.binding.producerOperationId ||
					(captured.phase !== state.phase &&
						!(state.phase === "native" && captured.phase === "native-link"))
				)
					return refuse();
				await call<void>("phase.assert_current", [{ ...captured, activeRootId: root?.id ?? null }]);
				assertCurrent();
			} catch {
				return refuse();
			}
		},
		async readOriginalTrace(
			capability: ProducerRunCapability,
			original: { bindingDigest: string; operationId: string },
		) {
			try {
				const state = runState(capability);
				if (
					!isDeepStrictEqual(original, {
						bindingDigest: state.source.bindingDigest,
						operationId: state.binding.producerOperationId,
					})
				)
					return refuse();
				const value = traceReadbackSchema.parse(
					await call("phase.read_trace", [metadata(original)], {}),
				);
				assertCurrent();
				if (
					(value.state === "completed" && !value.trace) ||
					(value.trace &&
						(value.trace.bindingDigest !== state.source.bindingDigest ||
							value.trace.operationId !== state.binding.producerOperationId ||
							value.trace.reservationDigest !== state.ack.reservationDigest))
				)
					return refuse();
				return value;
			} catch {
				return refuse();
			}
		},
		/** Called only by the owned recognized-input matcher; no wire/native JSON authority. */
		async linkNative(
			capability: ProducerRunCapability,
			link: () => Promise<StagedNativeLink>,
		): Promise<void> {
			try {
				const state = runState(capability);
				if (state.phase !== "producer-completed" || !state.trace || context || target)
					return refuse();
				state.phase = "native-link"; // sole opportunity consumed BEFORE await
				let staged: StagedNativeLink | undefined;
				await call<void>(
					"phase.link_native",
					[
						{
							bindingDigest: state.source.bindingDigest,
							completedProducerTraceDigest: state.trace.traceRecord.sha256,
						},
					],
					{
						link: async () => {
							const actual = await link();
							// Snapshot ONCE before callback_result/parent AFTER. Caller mutation
							// cannot substitute a different target or receipt at the final ACK.
							staged = Object.freeze({
								context: Object.freeze(baseSchema.parse(metadata(actual.context))),
								target: Object.freeze(targetSchema.parse(metadata(actual.target))),
								nativeLinkRecord: recordRefSchema.parse(metadata(actual.nativeLinkRecord)),
							});
							return staged;
						},
					},
				);
				assertCurrent();
				if (!staged || state.phase !== "native-link") return refuse();
				context = Object.freeze(baseSchema.parse(staged.context));
				target = Object.freeze(targetSchema.parse(staged.target));
				state.phase = "native";
			} catch {
				return refuse();
			}
		},
	});
	return Object.freeze({
		guard,
		dispatchJoin,
		writer,
		finite,
		supplier,
		taskReceiver,
		assertCurrent,
		hold,
		assertNativeCurrent,
		phase,
		onHold(listener: () => void) {
			if (typeof listener !== "function") return refuse();
			holdListeners.add(listener);
			if (held) listener();
		},
	});
}
