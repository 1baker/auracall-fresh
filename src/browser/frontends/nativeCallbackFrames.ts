import { TextDecoder } from "node:util";
import { z } from "zod";

export const NATIVE_CALLBACK_PROTOCOL = "p266.original-callback-carrier.v3";
export const PRODUCER_CALLBACK_PROTOCOL = "p266.original-callback-carrier.v4";
export type NativeCallbackProtocol =
	| typeof NATIVE_CALLBACK_PROTOCOL
	| typeof PRODUCER_CALLBACK_PROTOCOL;
export const NATIVE_CALLBACK_FRAME_LIMIT = 16384;
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
function incomingSchema(protocol: NativeCallbackProtocol) {
	const common = { protocol: z.literal(protocol), id: sequence };
	return z
		.discriminatedUnion("type", [
			z
				.object({ ...common, type: z.literal("return"), ok: z.boolean(), result: z.unknown() })
				.strict(),
			z
				.object({
					...common,
					type: z.literal("callback"),
					parent: sequence,
					method: z.enum([
						"invoke",
						"observe_full_v2",
						"validate_full_v2",
						"current_task",
						"execute_producer",
						"verify_native_link",
					]),
					args: z.array(z.unknown()),
				})
				.strict(),
			z
				.object({
					protocol: z.literal(protocol),
					type: z.literal("fault"),
					code: z.literal("original_callback_carrier_uncertain"),
				})
				.strict(),
		])
		.superRefine((frame, ctx) => {
			if (
				protocol === NATIVE_CALLBACK_PROTOCOL &&
				frame.type === "callback" &&
				(frame.method === "execute_producer" || frame.method === "verify_native_link")
			)
				ctx.addIssue({ code: "custom", message: "phase callback requires explicit v4" });
		});
}
export type NativeCallbackFrame = z.infer<ReturnType<typeof incomingSchema>>;

/** JSON.parse alone silently accepts duplicate keys and overflowing numbers.
 * Scan the already grammar-checked JSON, preserving decoded key equality. */
export function parseNativePrivateJson(text: string): unknown {
	const value: unknown = JSON.parse(text);
	const tokens =
		text.match(/"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ??
		[];
	let at = 0;
	function walk(depth: number): void {
		if (depth > 64) throw new Error("frame depth");
		const token = tokens[at++];
		if (token === "{") {
			const keys = new Set<string>();
			while (tokens[at] !== "}") {
				const key: string = JSON.parse(tokens[at++]);
				if (keys.has(key)) throw new Error("duplicate key");
				keys.add(key);
				at++; // colon; JSON.parse already checked grammar
				walk(depth + 1);
				if (tokens[at] !== ",") break;
				at++;
			}
			at++;
		} else if (token === "[") {
			while (tokens[at] !== "]") {
				walk(depth + 1);
				if (tokens[at] !== ",") break;
				at++;
			}
			at++;
		} else if (/^-?\d/.test(token) && !Number.isFinite(Number(token))) {
			throw new Error("nonfinite number");
		}
	}
	walk(0);
	return value;
}

/** Decode the entire delivered batch BEFORE the caller resolves ACKs or invokes
 * callbacks. An unfinished frame is allowed only when it is the entire batch. */
export class NativeCallbackFrames {
	#buffer: Buffer = Buffer.alloc(0);
	#incoming: ReturnType<typeof incomingSchema>;
	constructor(protocol: NativeCallbackProtocol = NATIVE_CALLBACK_PROTOCOL) {
		if (protocol !== NATIVE_CALLBACK_PROTOCOL && protocol !== PRODUCER_CALLBACK_PROTOCOL)
			throw new Error("unknown protocol");
		this.#incoming = incomingSchema(protocol);
	}
	push(chunk: Buffer): NativeCallbackFrame[] {
		if (!Buffer.isBuffer(chunk)) throw new Error("binary IPC required");
		this.#buffer = Buffer.concat([this.#buffer, chunk]);
		if (this.#buffer.length > 32768) throw new Error("batch limit");
		const last = this.#buffer.lastIndexOf(10);
		if (last < 0) {
			if (this.#buffer.length >= NATIVE_CALLBACK_FRAME_LIMIT) throw new Error("frame limit");
			return [];
		}
		if (last !== this.#buffer.length - 1) throw new Error("trailing partial frame");
		const frames: NativeCallbackFrame[] = [];
		let start = 0;
		for (let end = this.#buffer.indexOf(10); end >= 0; end = this.#buffer.indexOf(10, start)) {
			if (end - start + 1 > NATIVE_CALLBACK_FRAME_LIMIT) throw new Error("frame limit");
			const text = new TextDecoder("utf-8", { fatal: true }).decode(
				this.#buffer.subarray(start, end),
			);
			const raw = parseNativePrivateJson(text);
			// z.unknown permits absent keys; protocol result and args are mandatory.
			if (
				!raw ||
				typeof raw !== "object" ||
				("type" in raw && raw.type === "return" && !("result" in raw))
			)
				throw new Error("missing result");
			frames.push(this.#incoming.parse(raw));
			start = end + 1;
		}
		this.#buffer = Buffer.alloc(0);
		return frames;
	}
}
