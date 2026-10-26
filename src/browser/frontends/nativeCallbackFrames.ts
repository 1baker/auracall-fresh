import { TextDecoder } from "node:util";
import { z } from "zod";

export const NATIVE_CALLBACK_PROTOCOL = "p266.original-callback-carrier.v2";
export const NATIVE_CALLBACK_FRAME_LIMIT = 16384;
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const common = { protocol: z.literal(NATIVE_CALLBACK_PROTOCOL), id: sequence };
const incoming = z.discriminatedUnion("type", [
	z.object({ ...common, type: z.literal("return"), ok: z.boolean(), result: z.unknown() }).strict(),
	z
		.object({
			...common,
			type: z.literal("callback"),
			parent: sequence,
			method: z.enum(["invoke", "observe_full_v2", "validate_full_v2", "current_task"]),
			args: z.array(z.unknown()),
		})
		.strict(),
	z
		.object({
			protocol: z.literal(NATIVE_CALLBACK_PROTOCOL),
			type: z.literal("fault"),
			code: z.literal("original_callback_carrier_uncertain"),
		})
		.strict(),
]);
export type NativeCallbackFrame = z.infer<typeof incoming>;

/** JSON.parse alone silently accepts duplicate keys and overflowing numbers.
 * Scan the already grammar-checked JSON, preserving decoded key equality. */
function strictJson(text: string): unknown {
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
			const raw = strictJson(text);
			// z.unknown permits absent keys; protocol result and args are mandatory.
			if (
				!raw ||
				typeof raw !== "object" ||
				("type" in raw && raw.type === "return" && !("result" in raw))
			)
				throw new Error("missing result");
			frames.push(incoming.parse(raw));
			start = end + 1;
		}
		this.#buffer = Buffer.alloc(0);
		return frames;
	}
}
