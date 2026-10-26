import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createNativeCallbackPeer } from "../../src/browser/frontends/nativeCallbackPeer.js";
import type { NativeLedgerOperation } from "../../src/browser/frontends/nativeLedgerWriter.js";
import type { NativeFullV2OperationResult } from "../../src/browser/frontends/nativeOperator.js";
import observation from "./fixtures/native-admission-observation-v2.json";

const protocol = "p266.original-callback-carrier.v1";
const context = {
	receiptDigest: "1".repeat(64),
	producerSha256: "2".repeat(64),
	expiresAtMs: 9999999999999,
};
const target = { profileId: "profile1", browserId: "browser1", tabId: "tab1", targetId: "target1" };
const task = { ...target, taskId: "consumer-task", controlRef: "consumer-control" };
function setup() {
	const input = new PassThrough(),
		output = new PassThrough();
	const calls: Record<string, unknown>[] = [];
	input.on("data", (data) => calls.push(JSON.parse(data.toString())));
	const peer = createNativeCallbackPeer({ input, output, context, target, timeoutMs: 500 });
	const send = (...frames: unknown[]) =>
		output.write(
			frames.map((frame) => `${JSON.stringify({ protocol, ...(frame as object) })}\n`).join(""),
		);
	return { input, output, calls, peer, send };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
describe("private persistent callback peer", () => {
	it("retains the original opaque value until the carrier's AFTER return", async () => {
		const { peer, calls, send } = setup();
		const opaque = { secretLocalOnly: new Map([["client", Symbol("client")]]) };
		const result = peer.dispatchJoin.handshake(async () => opaque);
		let settled = false;
		void result.then(() => {
			settled = true;
		});
		expect(calls[0]).toEqual({ protocol, type: "call", id: 1, method: "join.handshake", args: [] });
		send({ type: "callback", id: 1, parent: 1, method: "invoke", args: ["join.handshake", []] });
		await tick();
		expect(calls[1]).toEqual({
			protocol,
			type: "callback_result",
			id: 1,
			parent: 1,
			ok: true,
			result: null,
		});
		expect(settled).toBe(false);
		send({ type: "return", id: 1, ok: true, result: null });
		expect(await result).toBe(opaque);
	});
	it("passes the full v2 wire to the SAME validator and keeps its opaque value local", async () => {
		const { peer, calls, send } = setup();
		const wire = {
			...observation.privateResult,
			receiptDigest: context.receiptDigest,
			producerSha256: context.producerSha256,
			requestNonce: "nonce",
		} as NativeFullV2OperationResult<unknown>["wire"];
		const value = new Map([["opaque", Symbol("budget")]]);
		const validate = vi.fn((raw) => {
			expect(raw).toEqual(wire);
			return {
				receiptDigest: wire.receiptDigest,
				producerSha256: wire.producerSha256,
				requestNonce: wire.requestNonce,
				observedAtMs: wire.observedAtMs,
				validUntilMs: wire.validUntilMs,
			};
		});
		const result = peer.dispatchJoin.admit_once("nonce", async () => ({ wire, value }), validate);
		send({ type: "callback", id: 1, parent: 1, method: "observe_full_v2", args: ["nonce"] });
		await tick();
		expect(calls[1].result).toEqual({ wire });
		send({
			type: "callback",
			id: 2,
			parent: 1,
			method: "validate_full_v2",
			args: [wire, context, "nonce", target],
		});
		await tick();
		expect(validate).toHaveBeenCalledOnce();
		send({ type: "return", id: 1, ok: true, result: null });
		expect(await result).toBe(value);
	});
	it("reads the SAME session getter before acquired acknowledgment", async () => {
		const { peer, send } = setup();
		const reader = vi.fn(() => task);
		peer.taskReceiver.bind(reader);
		const result = peer.dispatchJoin.acquired({ ...context, nativeTask: task });
		send({ type: "callback", id: 1, parent: 1, method: "current_task", args: ["before"] });
		await tick();
		send({ type: "return", id: 1, ok: true, result: null });
		await result;
		expect(reader).toHaveBeenCalledOnce();
	});
	it("forwards full dispatch metadata and permits assertions inside ONE ledger root", async () => {
		const { peer, calls, send } = setup();
		peer.taskReceiver.bind(() => task);
		const operation: NativeLedgerOperation = {
			original: { ...context, nativeTask: task },
			dispatch: { kind: "command", action: "snapshot", operationKey: "snapshot-0001" },
			ledgerDirectory: "/synthetic-ledger",
			admissionDigest: "a".repeat(64),
			expiresAtMs: context.expiresAtMs,
			key: "snapshot-0001",
			bucket: "read",
			intentDigest: "b".repeat(64),
			originalKeys: [],
			readReserve: 1,
		};
		const value = Symbol("opaque-page-result");
		const result = peer.writer.protect(operation, async () => {
			await peer.writer.assertCurrent(operation, "effect");
			return value;
		});
		expect(calls[0].args).toEqual([operation]);
		send({ type: "callback", id: 1, parent: 1, method: "current_task", args: ["before"] });
		await tick();
		send({ type: "callback", id: 2, parent: 1, method: "invoke", args: ["writer.protect", []] });
		await tick();
		expect(calls.at(-1)?.method).toBe("writer.assert_current");
		send({ type: "return", id: 2, ok: true, result: null });
		await tick();
		send({ type: "callback", id: 3, parent: 1, method: "current_task", args: ["after"] });
		await tick();
		send({ type: "return", id: 1, ok: true, result: null });
		expect(await result).toBe(value);
	});
	it.each([
		"duplicate",
		"unknown",
		"missing",
		"nonfinite",
		"partial",
		"invalidUtf8",
		"negative",
		"future",
		"extra",
	])("rejects an apparent success when the SAME delivered batch contains %s", async (kind) => {
		const { peer, output, send } = setup();
		const result = peer.dispatchJoin.handshake(async () => "local");
		const check = expect(result).rejects.toMatchObject({ code: "native_callback_peer_uncertain" });
		send({ type: "callback", id: 1, parent: 1, method: "invoke", args: ["join.handshake", []] });
		await tick();
		const ok = `${JSON.stringify({ protocol, type: "return", id: 1, ok: true, result: null })}\n`;
		const bad =
			kind === "duplicate"
				? ok
				: kind === "unknown"
					? '{"x":1}\n'
					: kind === "missing"
						? `${JSON.stringify({ protocol, type: "return", id: 1, ok: true })}\n`
						: kind === "nonfinite"
							? '{"x":1e999}\n'
							: kind === "partial"
								? "{"
								: kind === "invalidUtf8"
									? Buffer.from([0xff, 10])
									: `${JSON.stringify({
											protocol,
											type: "return",
											id: kind === "future" ? 99 : 1,
											ok: kind !== "negative",
											result: null,
											...(kind === "extra" ? { extra: 1 } : {}),
										})}\n`;
		output.write(Buffer.concat([Buffer.from(ok), Buffer.from(bad)]));
		await check;
		expect(() => peer.assertCurrent()).toThrow();
	});
	it("refuses duplicate JSON keys even when the last value would be a valid ACK", async () => {
		const { peer, output } = setup();
		const result = peer.guard.assert_current(context);
		const check = expect(result).rejects.toThrow();
		output.write(
			`{"protocol":"${protocol}","type":"return","id":1,"ok":false,"ok":true,"result":null}\n`,
		);
		await check;
	});
	it("supports a fragmented complete frame but never a second partial frame after success", async () => {
		const { peer, output } = setup();
		const result = peer.guard.assert_current(context);
		const frame = Buffer.from(
			`${JSON.stringify({ protocol, type: "return", id: 1, ok: true, result: null })}\n`,
		);
		output.write(frame.subarray(0, 16));
		await tick();
		output.write(frame.subarray(16));
		await result;
	});
	it("retains a callback's value after hold without successful callback or root ACK", async () => {
		const { peer, calls, send } = setup();
		let finish!: (value: unknown) => void;
		const result = peer.dispatchJoin.handshake(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const check = expect(result).rejects.toThrow();
		send({ type: "callback", id: 1, parent: 1, method: "invoke", args: ["join.handshake", []] });
		peer.hold();
		finish({ opaqueClient: true });
		await check;
		await tick();
		expect(calls.filter((c) => c.type === "callback_result" && c.ok)).toEqual([]);
		expect(() => peer.assertCurrent()).toThrow();
	});
	it.each([
		"duplicate",
		"wrong-parent",
		"early-return",
		"wrong-slot",
	])("refuses %s without invoking or replaying an operation", async (kind) => {
		const { peer, send } = setup();
		const operation = vi.fn(async () => "value");
		const result = peer.dispatchJoin.handshake(operation);
		const check = expect(result).rejects.toThrow();
		if (kind === "early-return") send({ type: "return", id: 1, ok: true, result: null });
		else {
			send({
				type: "callback",
				id: 1,
				parent: kind === "wrong-parent" ? 2 : 1,
				method: "invoke",
				args: [kind === "wrong-slot" ? "join.acquire" : "join.handshake", []],
			});
			await tick();
			if (kind === "duplicate")
				send({
					type: "callback",
					id: 2,
					parent: 1,
					method: "invoke",
					args: ["join.handshake", []],
				});
		}
		await check;
		expect(operation).toHaveBeenCalledTimes(kind === "duplicate" ? 1 : 0);
	});
	it("does not substitute the descriptor when the same-session getter disagrees", async () => {
		const { peer, send } = setup();
		peer.taskReceiver.bind(() => ({ ...task, taskId: "wrong-task" }));
		const result = peer.dispatchJoin.acquired({ ...context, nativeTask: task });
		const check = expect(result).rejects.toThrow();
		send({ type: "callback", id: 1, parent: 1, method: "current_task", args: ["before"] });
		await check;
	});
	it("rejects a second root and does not close either private endpoint", async () => {
		const { peer, input, output } = setup();
		const first = peer.dispatchJoin.handshake(async () => 1);
		const check = expect(first).rejects.toThrow();
		await expect(peer.dispatchJoin.acquire(async () => 2)).rejects.toThrow();
		await check;
		expect(input.destroyed || output.destroyed).toBe(false);
	});
	it.each([
		"hold",
		"output-end",
	])("does not hand off an ACKed value after %s before the await resumes", async (event) => {
		const { peer, send, output, calls, input } = setup();
		const result = peer.dispatchJoin.handshake(async () => ({ opaque: true }));
		const check = expect(result).rejects.toMatchObject({ code: "native_callback_peer_uncertain" });
		send({ type: "callback", id: 1, parent: 1, method: "invoke", args: ["join.handshake", []] });
		await tick();
		send({ type: "return", id: 1, ok: true, result: null });
		if (event === "hold") peer.hold();
		else output.emit("end");
		await check;
		expect(calls.filter((c) => c.method === "binding.hold")).toHaveLength(1);
		expect(input.destroyed).toBe(false);
	});
	it("cannot silently rebuild metadata for the old callback-only SDK dispatch port", async () => {
		const { peer, calls } = setup();
		const op = vi.fn();
		await expect(peer.dispatchJoin.protected_dispatch(op)).rejects.toThrow();
		expect(op).not.toHaveBeenCalled();
		expect(calls.some((c) => c.method === "join.protected_dispatch")).toBe(false);
	});
});

it.skipIf(!process.env.AURACALL_PUBLIC_CARRIER_SOURCE)(
	"exchanges real anonymous IPC with frozen f862 Python and preserves its dispatch mismatch as refusal",
	async () => {
		const carrierSource = process.env.AURACALL_PUBLIC_CARRIER_SOURCE;
		if (!carrierSource) throw new Error("frozen public fixture source required");
		const child = spawn(
			"python3",
			[
				fileURLToPath(new URL("./fixtures/nativeCallbackPython.py", import.meta.url)),
				carrierSource,
			],
			{ stdio: ["ignore", "ignore", "pipe", "pipe", "pipe", "pipe"] },
		);
		const input = child.stdio[3] as Writable,
			output = child.stdio[4] as Readable;
		const trace: string[] = [];
		output.on("data", (bytes) => {
			for (const line of bytes.toString().trim().split("\n")) {
				try {
					const frame = JSON.parse(line);
					trace.push(`${frame.type}:${frame.id}:${frame.method ?? frame.ok}`);
				} catch {
					trace.push("fragment");
				}
			}
		});
		let diagnostics = "";
		child.stderr?.on("data", (d) => {
			diagnostics += d;
		});
		const closed = new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
		try {
			const ready = await new Promise<{
				context: typeof context;
				target: typeof target;
				task: typeof task;
				budget: typeof context & { admissionDigest: string; ledgerDirectory: string };
				wire: NativeFullV2OperationResult<unknown>["wire"];
			}>((resolve, reject) => {
				let data = "";
				const stream = (child.stdio as (Readable | Writable | null | undefined)[])[5] as Readable;
				stream.on("data", (d) => {
					data += d;
				});
				stream.once("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						reject(new Error(diagnostics || "fixture bootstrap failed"));
					}
				});
				stream.once("error", reject);
			});
			const peer = createNativeCallbackPeer({
				input,
				output,
				context: ready.context,
				target: ready.target,
				timeoutMs: 3000,
			});
			peer.taskReceiver.bind(() => ready.task);
			const nonce = "a".repeat(64),
				wire = { ...ready.wire, requestNonce: nonce };
			const opaqueAdmission = Symbol("local-admission");
			const admission = await peer.dispatchJoin.admit_once(
				nonce,
				async () => {
					wire.observedAtMs = Date.now();
					wire.validUntilMs = wire.observedAtMs + 30000;
					return { wire, value: opaqueAdmission };
				},
				(raw) => {
					expect(raw).toEqual(wire);
					return {
						receiptDigest: wire.receiptDigest,
						producerSha256: wire.producerSha256,
						requestNonce: nonce,
						observedAtMs: wire.observedAtMs,
						validUntilMs: wire.validUntilMs,
					};
				},
			);
			expect(admission).toBe(opaqueAdmission);
			const budget = new Map([["opaque", 80]]);
			expect(
				await peer.dispatchJoin.qualify_budget(ready.budget, async () => {
					await peer.guard.assert_current(ready.context);
					return budget;
				}),
			).toBe(budget);
			const client = { privateClient: Symbol("same-client") };
			expect(
				await peer.dispatchJoin.handshake(async () => {
					await peer.assertNativeCurrent(ready.context, { kind: "sdk_connect" });
					return client;
				}),
			).toBe(client);
			await peer.dispatchJoin.acquire(async () => null); // synthetic IPC phase fixture, NOT a browser Open
			const full = { ...ready.context, nativeTask: ready.task };
			await peer.dispatchJoin.acquired(full);
			const action: NativeLedgerOperation = {
				original: full,
				dispatch: { kind: "command", action: "snapshot", operationKey: "snapshot-0001" },
				ledgerDirectory: ready.budget.ledgerDirectory,
				admissionDigest: ready.budget.admissionDigest,
				expiresAtMs: ready.budget.expiresAtMs,
				key: "snapshot-0001",
				bucket: "read",
				intentDigest: "b".repeat(64),
				originalKeys: [],
				readReserve: 1,
			};
			const operation = vi.fn();
			await expect(peer.writer.protect(action, operation)).rejects.toMatchObject({
				code: "native_callback_peer_uncertain",
			});
			expect(operation).not.toHaveBeenCalled(); // frozen Python rejects mandatory dispatch; no downgrade
			expect(() => peer.assertCurrent()).toThrow();
		} catch (error) {
			throw new Error(`Public IPC fixture failed at ${trace.join(",")}`, { cause: error });
		} finally {
			input.end(); // explicit PUBLIC FIXTURE owner cleanup, peer never closes owner IPC
			const timer = setTimeout(() => child.kill(), 4000);
			const code = await closed;
			clearTimeout(timer);
			expect({ code, diagnostics }).toEqual({ code: 0, diagnostics: "" });
		}
	},
	10000,
);
