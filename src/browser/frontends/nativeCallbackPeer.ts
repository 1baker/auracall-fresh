import type { Readable, Writable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
	NATIVE_CALLBACK_FRAME_LIMIT,
	NATIVE_CALLBACK_PROTOCOL,
	type NativeCallbackFrame,
	NativeCallbackFrames,
} from "./nativeCallbackFrames.js";
import type { NativeFiniteAuthority, NativeFiniteOperation } from "./nativeFiniteSend.js";
import type { NativeLedgerOperation, NativeLedgerWriter } from "./nativeLedgerWriter.js";
import type {
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

/** Exact revision2 carrier consumer, not an authority provider. Opaque budgets,
 * SDK clients and results never cross IPC. Its BEFORE/callback/AFTER sequence is
 * the ONE operator driver; ordinary/finite writers must not nest a join root. */
export function createNativeCallbackPeer(options: NativeCallbackPeerOptions) {
	const input = options.input,
		output = options.output;
	baseSchema.parse(options.context);
	const target = Object.freeze(targetSchema.parse(options.target));
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
	const frames = new NativeCallbackFrames();
	let sequence = 0,
		callbackSequence = 0,
		held = false;
	let root: Root | undefined;
	let taskReader: (() => Readonly<NativeTaskBinding>) | undefined;
	const retention = { attempts, pending, input, output };
	retained.add(retention);
	function assertCurrent() {
		if (held) throw failure();
	}
	function poison() {
		held = true;
		for (const p of pending.values()) {
			clearTimeout(p.timer);
			p.reject(failure());
		}
		pending.clear();
	}
	function write(frame: object) {
		const bytes = Buffer.from(
			`${JSON.stringify({ protocol: NATIVE_CALLBACK_PROTOCOL, ...frame })}\n`,
		);
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
		hooks?: Partial<Pick<Root, "operation" | "observe" | "validate">>,
	): Promise<T> {
		try {
			assertCurrent();
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
		if (f.method === "invoke") {
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
			if (f.method === "invoke") r.value = await r.operation?.();
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
					if (task[key] !== target[key]) throw failure();
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
				if (!p || seen.has(f.id) || !f.ok || (p.method !== "finite.verify" && f.result !== null))
					throw failure();
				seen.add(f.id);
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
			const value = p === root ? root.value : f.result;
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
			if (taskReader || typeof reader !== "function") refuse();
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
	return Object.freeze({
		guard,
		dispatchJoin,
		writer,
		finite,
		taskReceiver,
		assertCurrent,
		hold,
		assertNativeCurrent: (context: NativeRuntimeLifetimeContext, dispatch: NativeRuntimeDispatch) =>
			call<void>("native.assert_current", [context, dispatch]),
	});
}
