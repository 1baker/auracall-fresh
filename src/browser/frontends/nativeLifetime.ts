import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { NativeMcpClient } from "./nativeConsumer.js";
import {
	type NativeRuntimeDispatch,
	type NativeRuntimeLifetime,
	type NativeRuntimeLifetimeContext,
	P266_ENROLLMENT_PRODUCER,
} from "./nativeRuntime.js";
import { FrontendError } from "./types.js";

const id = z
	.string()
	.min(1)
	.max(1024)
	.refine((s) => s.trim() === s && ![...s].some((c) => c.charCodeAt(0) < 32));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const taskSchema = z
	.object({
		controlRef: id,
		taskId: id,
		profileId: id,
		browserId: id,
		tabId: id,
		targetId: id,
	})
	.strict();
const contextSchema = z
	.object({
		receiptDigest: hash,
		producerSha256: hash,
		expiresAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		nativeTask: taskSchema.optional(),
	})
	.strict();
const observationSchema = z
	.object({
		receiptDigest: hash,
		producerSha256: hash,
		requestNonce: hash,
		observedAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		validUntilMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	})
	.strict();
/** Correlation projection of final1727, after the trusted caller validates the
 * full self-executed private helper result and exact grant/owner/guard/accounting.
 * This is not an exported wire decoder or authority accepted from JSON.
 */
export type NativeInitialObservation = z.infer<typeof observationSchema>;
const operationKey = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
const dispatchSchema = z.union([
	z.object({ kind: z.enum(["sdk_connect", "acquire"]) }).strict(),
	z
		.object({
			kind: z.literal("command"),
			action: z.enum(["url", "snapshot", "gettext", "click", "press"]),
			operationKey,
		})
		.strict(),
	z.object({ kind: z.enum(["original_readback", "release"]), operationKey }).strict(),
]);

export interface RetainedNativeLifetimeOptions {
	/** Trusted operator integration, never a JSON flag or an inferred grant.
	 * Must qualify current producer preservation, private admission and shared limits.
	 * No production verifier or activation is supplied by this source policy.
	 */
	admit(
		context: Readonly<NativeRuntimeLifetimeContext>,
		requestNonce: string,
	): Promise<NativeInitialObservation>;
	/** Assert the actual held operator guard/current authority; never call observe again. */
	assertCurrent(
		context: Readonly<NativeRuntimeLifetimeContext>,
		dispatch: Readonly<NativeRuntimeDispatch>,
	): Promise<void>;
	/** Compiled integration pin; not read from the private runtime JSON. */
	producerSha256?: string;
	now?: () => number;
}

/** Contract6b47: retain the connection; never mistake SDK.close for consumer release.
 * The runtime's existing durable journal fences new attempts across processes.
 * This policy adds one-attempt in-memory ordering, exact binding and sticky holds.
 */
class RetainedNativeLifetime implements NativeRuntimeLifetime {
	#phase: "new" | "qualifying" | "qualified" | "retained" | "acquired" | "held" = "new";
	#context: Readonly<NativeRuntimeLifetimeContext> | null = null;
	#client: NativeMcpClient | null = null;
	#task: string | null = null;
	#admit: RetainedNativeLifetimeOptions["admit"];
	#assert: RetainedNativeLifetimeOptions["assertCurrent"];
	#observation: Readonly<NativeInitialObservation> | null = null;
	#lastNow = 0;
	#producer: string;
	#now: () => number;
	constructor(options: RetainedNativeLifetimeOptions) {
		this.#admit = options.admit;
		this.#assert = options.assertCurrent;
		this.#producer = options.producerSha256 ?? P266_ENROLLMENT_PRODUCER.binarySha256;
		this.#now = options.now ?? Date.now;
	}
	private refuse(): never {
		this.#phase = "held";
		throw new FrontendError(
			"native_lifetime_held",
			"Retain the original native connection and history.",
		);
	}
	private matches(context: NativeRuntimeLifetimeContext): boolean {
		return (
			this.#context !== null &&
			context.receiptDigest === this.#context.receiptDigest &&
			context.producerSha256 === this.#context.producerSha256 &&
			context.expiresAtMs === this.#context.expiresAtMs
		);
	}
	private parsed(context: NativeRuntimeLifetimeContext): NativeRuntimeLifetimeContext {
		const result = contextSchema.safeParse(context);
		if (!result.success) return this.refuse();
		return result.data;
	}
	private clock(): number {
		const now = this.#now();
		if (!Number.isSafeInteger(now) || now < this.#lastNow) this.refuse();
		this.#lastNow = now;
		return now;
	}
	private fresh(context: NativeRuntimeLifetimeContext): boolean {
		return context.expiresAtMs > this.clock();
	}
	private initialFresh(context: NativeRuntimeLifetimeContext): boolean {
		return (
			this.fresh(context) &&
			this.#observation !== null &&
			this.#observation.observedAtMs <= this.#lastNow &&
			this.#observation.validUntilMs > this.#lastNow
		);
	}
	async qualify(context: NativeRuntimeLifetimeContext): Promise<void> {
		const checked = this.parsed(context);
		if (
			this.#phase !== "new" ||
			checked.nativeTask !== undefined ||
			checked.producerSha256 !== this.#producer ||
			!this.fresh(checked) ||
			typeof this.#admit !== "function" ||
			typeof this.#assert !== "function"
		)
			this.refuse();
		this.#phase = "qualifying";
		this.#context = Object.freeze(checked);
		const startedAtMs = this.#lastNow,
			requestNonce = randomBytes(32).toString("hex");
		try {
			const observed = observationSchema.parse(await this.#admit(this.#context, requestNonce));
			if (
				observed.receiptDigest !== checked.receiptDigest ||
				observed.producerSha256 !== checked.producerSha256 ||
				observed.requestNonce !== requestNonce ||
				observed.observedAtMs < startedAtMs ||
				observed.validUntilMs <= observed.observedAtMs ||
				observed.validUntilMs > checked.expiresAtMs ||
				observed.validUntilMs - observed.observedAtMs > 30000
			)
				this.refuse();
			this.#observation = Object.freeze(observed);
			if (this.#phase !== "qualifying" || !this.initialFresh(this.#context)) this.refuse();
			this.#phase = "qualified";
		} catch {
			this.refuse();
		}
	}
	async retain(context: NativeRuntimeLifetimeContext, client: NativeMcpClient): Promise<void> {
		const checked = this.parsed(context);
		if (
			!this.matches(checked) ||
			checked.nativeTask !== undefined ||
			!this.initialFresh(checked) ||
			(this.#phase !== "qualified" && this.#phase !== "retained") ||
			(this.#client !== null && this.#client !== client) ||
			!client ||
			typeof client.callTool !== "function"
		)
			this.refuse();
		this.#client = client;
		this.#phase = "retained";
	}
	async acquired(context: NativeRuntimeLifetimeContext): Promise<void> {
		const checked = this.parsed(context);
		if (
			!this.matches(checked) ||
			!checked.nativeTask ||
			!this.#client ||
			this.#phase !== "retained" ||
			this.#task !== null ||
			!this.initialFresh(checked)
		)
			this.refuse();
		this.#task = JSON.stringify(checked.nativeTask);
		this.#phase = "acquired";
	}
	private dispatchAllowed(
		context: NativeRuntimeLifetimeContext,
		dispatch: NativeRuntimeDispatch,
	): boolean {
		if (!this.matches(context)) return false;
		if (dispatch.kind === "sdk_connect" || dispatch.kind === "acquire")
			return (
				context.nativeTask === undefined &&
				this.#task === null &&
				this.initialFresh(context) &&
				(dispatch.kind === "sdk_connect"
					? this.#phase === "qualified" && this.#client === null
					: this.#phase === "retained" && this.#client !== null)
			);
		return (
			this.#client !== null &&
			context.nativeTask !== undefined &&
			this.#task === JSON.stringify(context.nativeTask) &&
			this.fresh(context) &&
			(this.#phase === "acquired" ||
				(this.#phase === "held" &&
					(dispatch.kind === "original_readback" || dispatch.kind === "release")))
		);
	}
	async assertCurrent(
		context: NativeRuntimeLifetimeContext,
		dispatch: NativeRuntimeDispatch,
	): Promise<void> {
		const checked = this.parsed(context),
			operation = dispatchSchema.safeParse(dispatch);
		if (!operation.success || !this.dispatchAllowed(checked, operation.data)) this.refuse();
		if (checked.nativeTask) Object.freeze(checked.nativeTask);
		try {
			await this.#assert(Object.freeze(checked), Object.freeze(operation.data));
			// An asynchronous guard check cannot revive a hold, drift or expiry.
			if (!this.dispatchAllowed(checked, operation.data)) this.refuse();
		} catch {
			this.refuse();
		}
	}
	async uncertain(context: NativeRuntimeLifetimeContext, _reason: string): Promise<void> {
		this.#phase = "held";
		const checked = this.parsed(context);
		if (!this.matches(checked)) this.refuse();
		// Only the runtime's validated acquisition supplies this later task binding.
		// Its presence never permits reconnecting or releasing the retained producer.
		const task = checked.nativeTask ? JSON.stringify(checked.nativeTask) : null;
		if (this.#task !== null && task !== this.#task) this.refuse();
		this.#task = task;
	}
}

/** Source composition only. The ordinary CLI still provides no admission verifier. */
export function createRetainedNativeLifetime(
	options: RetainedNativeLifetimeOptions,
): NativeRuntimeLifetime {
	return new RetainedNativeLifetime(options);
}
