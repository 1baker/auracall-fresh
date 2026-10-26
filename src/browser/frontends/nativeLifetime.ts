import { z } from "zod";
import type { NativeMcpClient } from "./nativeConsumer.js";
import {
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

export interface RetainedNativeLifetimeOptions {
	/** Trusted operator integration, never a JSON flag or an inferred grant.
	 * Must qualify current producer preservation, private admission and shared limits.
	 * No production verifier or activation is supplied by this source policy.
	 */
	admit(context: Readonly<NativeRuntimeLifetimeContext>): Promise<void>;
	/** Compiled integration pin; not read from the private runtime JSON. */
	producerSha256?: string;
	now?: () => number;
}

/** Contract6b47: retain the connection; never mistake SDK.close for consumer release.
 * The runtime's existing durable journal fences new attempts across processes.
 * This policy adds one-attempt in-memory ordering, exact binding and sticky holds.
 */
class RetainedNativeLifetime implements NativeRuntimeLifetime {
	#phase: "new" | "qualifying" | "qualified" | "retained" | "held" = "new";
	#context: Readonly<NativeRuntimeLifetimeContext> | null = null;
	#client: NativeMcpClient | null = null;
	#task: string | null = null;
	#admit: RetainedNativeLifetimeOptions["admit"];
	#producer: string;
	#now: () => number;
	constructor(options: RetainedNativeLifetimeOptions) {
		this.#admit = options.admit;
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
	private fresh(context: NativeRuntimeLifetimeContext): boolean {
		const now = this.#now();
		return Number.isSafeInteger(now) && now >= 0 && context.expiresAtMs > now;
	}
	async qualify(context: NativeRuntimeLifetimeContext): Promise<void> {
		const checked = this.parsed(context);
		if (
			this.#phase !== "new" ||
			checked.nativeTask !== undefined ||
			checked.producerSha256 !== this.#producer ||
			!this.fresh(checked) ||
			typeof this.#admit !== "function"
		)
			this.refuse();
		this.#phase = "qualifying";
		this.#context = Object.freeze(checked);
		try {
			await this.#admit(this.#context);
			if (this.#phase !== "qualifying" || !this.fresh(this.#context)) this.refuse();
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
			!this.fresh(checked) ||
			(this.#phase !== "qualified" && this.#phase !== "retained") ||
			(this.#client !== null && this.#client !== client) ||
			!client ||
			typeof client.callTool !== "function"
		)
			this.refuse();
		this.#client = client;
		this.#phase = "retained";
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
