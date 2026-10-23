import { describe, expect, it } from "vitest";
import {
	encodeNativeMessage,
	NativeMessageDecoder,
} from "../../src/browser/stockChrome/framing.js";

describe("Chrome native messaging wire", () => {
	it("preserves UTF8 across split length headers, split text and joined messages", () => {
		// Independently specified wire bytes: thirteen bytes then {"text":"µ"} in UTF8.
		const wire = Buffer.from([
			13, 0, 0, 0, 123, 34, 116, 101, 120, 116, 34, 58, 34, 194, 181, 34, 125,
		]);
		const decoder = new NativeMessageDecoder();
		expect(decoder.push(wire.subarray(0, 2))).toEqual([]);
		expect(decoder.push(wire.subarray(2, 14))).toEqual([]);
		expect(decoder.push(Buffer.concat([wire.subarray(14), wire]))).toEqual([
			{ text: "µ" },
			{ text: "µ" },
		]);
		expect(encodeNativeMessage({ text: "µ" })).toEqual(wire);
	});
	it("rejects oversized headers, invalid UTF8 and incomplete frames", () => {
		expect(() => new NativeMessageDecoder().push(Buffer.from([1, 0, 16, 0]))).toThrow("frame size");
		expect(() => new NativeMessageDecoder().push(Buffer.from([2, 0, 0, 0, 0xff, 0xff]))).toThrow();
		const decoder = new NativeMessageDecoder();
		decoder.push(Buffer.from([2, 0]));
		expect(() => decoder.finish()).toThrow("Truncated");
		expect(() => encodeNativeMessage({ text: "x".repeat(1048576) })).toThrow("byte bound");
	});
});
