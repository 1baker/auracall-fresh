/** Chrome native messaging uses byte-counted little-endian JSON frames. */
export const MAX_NATIVE_BYTES = 1024 * 1024;

export function encodeNativeMessage(message: unknown): Buffer {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	if (body.length > MAX_NATIVE_BYTES) throw new Error("Native message exceeds its byte bound");
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length);
	return Buffer.concat([header, body]);
}

export class NativeMessageDecoder {
	private pending = Buffer.alloc(0);
	push(chunk: Buffer): unknown[] {
		this.pending = Buffer.concat([this.pending, chunk]);
		const messages: unknown[] = [];
		while (this.pending.length >= 4) {
			const length = this.pending.readUInt32LE();
			if (length < 2 || length > MAX_NATIVE_BYTES) throw new Error("Invalid native frame size");
			if (this.pending.length < length + 4) break;
			const text = new TextDecoder("utf-8", { fatal: true }).decode(
				this.pending.subarray(4, length + 4),
			);
			messages.push(JSON.parse(text));
			this.pending = this.pending.subarray(length + 4);
		}
		if (this.pending.length > MAX_NATIVE_BYTES + 4) throw new Error("Native frame buffer exceeded");
		return messages;
	}
	finish(): void {
		if (this.pending.length) throw new Error("Truncated native frame");
	}
}
