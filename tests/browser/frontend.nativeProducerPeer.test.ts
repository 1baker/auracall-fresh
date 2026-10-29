import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createProducerCallbackPeer } from "../../src/browser/frontends/nativeCallbackPeer.js";
import { PRODUCER_CALLBACK_PROTOCOL } from "../../src/browser/frontends/nativeCallbackFrames.js";
import type { ProducerBinding } from "../../src/browser/frontends/nativeProducerPhaseRecords.js";
const hash = "a".repeat(64),
	operationId = "11111111-1111-4111-8111-111111111111";
const record = {
	relativePath: "public.json",
	identity: { device: "1", inode: "2", uid: 1000, mode: "0600" as const },
	size: 10,
	sha256: hash,
};
const binding: ProducerBinding = {
	approvalSha256: "2663ec8f067a3dd531c6ee2934cf86072d3d1bbccff6ca85b926f06f3bc821d5",
	adjudicationSha256: "10515b538116cf187f4eab3177e7e9616b49a662209978d8d23b434cb4018f89",
	runReference: "p266-isolated-acceptance-20261027-2663ec8f",
	allocationIdentitySha256: "2df22702920b1b246df0c1838745ecf83beca678cc0bd5a2f0a7984b613aa12b",
	namespace: "p266new",
	realmPinSha256: hash,
	policyScopeDigest: hash,
	producerContractSha256: "703498fba269666d4d68e8000790e5eeaaee78cc588d132319c4102b75dce98f",
	producerOperationId: operationId,
	producerIntentDigest: hash,
	taskClaimKey: hash,
	expectedOwner: { pid: 123, startToken: "test", binarySha256: hash },
	ownerTransportSession: "test",
	expiresAtMs: Date.now() + 60000,
	participant: {
		instanceId: operationId,
		sourceSha256: hash,
		controller: { pid: 123, startToken: "test", sourceSha256: hash, generation: "test" },
		reservationJournal: record.identity,
	},
};
const source = { bindingRecord: record, planRecord: record, bindingDigest: hash, planDigest: hash };
const trace = { bindingDigest: hash, operationId, reservationDigest: hash, traceRecord: record };
const context = { receiptDigest: hash, producerSha256: hash, expiresAtMs: binding.expiresAtMs };
const target = { profileId: "p", browserId: "b", tabId: "t", targetId: "x" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
	const input = new PassThrough(),
		output = new PassThrough(),
		calls: Record<string, unknown>[] = [];
	input.on("data", (data) => calls.push(JSON.parse(data.toString())));
	const peer = createProducerCallbackPeer({
		protocol: PRODUCER_CALLBACK_PROTOCOL,
		input,
		output,
		timeoutMs: 500,
	});
	const send = (...frames: object[]) =>
		output.write(
			frames
				.map((frame) => `${JSON.stringify({ protocol: PRODUCER_CALLBACK_PROTOCOL, ...frame })}\n`)
				.join(""),
		);
	async function prepare() {
		const ready = peer.phase.prepare(binding, source);
		send({
			type: "return",
			id: 1,
			ok: true,
			result: {
				...source,
				reservationRecord: record,
				reservationDigest: hash,
				bindingRecord: undefined,
				planRecord: undefined,
			},
		});
		return ready;
	}
	return { peer, calls, send, prepare };
}
describe("explicit v4 original producer phase", () => {
	it("keeps one sequence/peer and opaque values through producer, native link and native RPC", async () => {
		const { peer, calls, send, prepare } = fixture(),
			cap = await prepare();
		const opaque = { symbol: Symbol("SDK stays Node local") };
		const produced = peer.phase.runProducer(
			cap,
			{ bindingDigest: hash, operationId, operationRecord: record },
			async () => {
				await peer.phase.assertCurrent(cap, {
					bindingDigest: hash,
					operationId,
					phase: "producer",
					point: "before-dispatch",
				});
				return { trace, value: opaque };
			},
		);
		send({ type: "callback", id: 1, parent: 2, method: "execute_producer", args: [] });
		await tick();
		expect(calls.at(-1)).toMatchObject({
			id: 3,
			method: "phase.assert_current",
			args: [{ activeRootId: 2 }],
		});
		send({ type: "return", id: 3, ok: true, result: null });
		await tick();
		expect(calls.at(-1)).toMatchObject({ type: "callback_result", parent: 2, result: trace });
		send({ type: "return", id: 2, ok: true, result: null });
		expect(await produced).toBe(opaque);
		const linked = peer.phase.linkNative(cap, async () => ({
			context,
			target,
			nativeLinkRecord: record,
		}));
		send({ type: "callback", id: 2, parent: 4, method: "verify_native_link", args: [] });
		await tick();
		expect(calls.at(-1)).toMatchObject({ result: { nativeLinkRecord: record } });
		expect(JSON.stringify(calls)).not.toContain("receiptDigest");
		send({ type: "return", id: 4, ok: true, result: null });
		await linked;
		const current = peer.guard.assert_current(context);
		expect(calls.at(-1)).toMatchObject({
			id: 5,
			protocol: PRODUCER_CALLBACK_PROTOCOL,
			method: "guard.assert_current",
		});
		send({ type: "return", id: 5, ok: true, result: null });
		await current;
		peer.hold();
	});
	it("refuses native calls before linkage without emitting a native request", async () => {
		const { peer, calls } = fixture();
		await expect(peer.guard.assert_current(context)).rejects.toThrow();
		expect(calls.every((c) => c.method === "binding.hold")).toBe(true);
	});
	it("does not reconstruct a capability from a clone", async () => {
		const { peer, prepare, calls } = fixture(),
			cap = await prepare();
		await expect(
			peer.phase.runProducer(
				{ ...cap },
				{ bindingDigest: hash, operationId, operationRecord: record },
				async () => ({ trace, value: 1 }),
			),
		).rejects.toThrow();
		expect(calls.filter((c) => c.method === "phase.producer")).toHaveLength(0);
	});
	it("rejects ACK plus poison in one batch before capability publication", async () => {
		const { peer, send } = fixture(),
			ready = peer.phase.prepare(binding, source);
		send(
			{
				type: "return",
				id: 1,
				ok: true,
				result: {
					reservationRecord: record,
					reservationDigest: hash,
					bindingDigest: hash,
					planDigest: hash,
				},
			},
			{ type: "fault", code: "original_callback_carrier_uncertain" },
		);
		await expect(ready).rejects.toThrow();
	});
	it("retains link once slot and refuses promotion after hold before ACK", async () => {
		const { peer, prepare, send, calls } = fixture(),
			cap = await prepare();
		const produced = peer.phase.runProducer(
			cap,
			{ bindingDigest: hash, operationId, operationRecord: record },
			async () => ({ trace, value: Symbol("local") }),
		);
		send({ type: "callback", id: 1, parent: 2, method: "execute_producer", args: [] });
		await tick();
		send({ type: "return", id: 2, ok: true, result: null });
		await produced;
		const linked = peer.phase.linkNative(cap, async () => ({
			context,
			target,
			nativeLinkRecord: record,
		}));
		send({ type: "callback", id: 2, parent: 3, method: "verify_native_link", args: [] });
		await tick();
		peer.hold();
		await expect(linked).rejects.toThrow();
		await expect(
			peer.phase.linkNative(cap, async () => ({ context, target, nativeLinkRecord: record })),
		).rejects.toThrow();
		expect(calls.filter((c) => c.method === "phase.link_native")).toHaveLength(1);
	});
	it("pins staged native metadata before parent ACK rather than rereading caller mutations", async () => {
		const { peer, prepare, send } = fixture(),
			cap = await prepare();
		const produced = peer.phase.runProducer(
			cap,
			{ bindingDigest: hash, operationId, operationRecord: record },
			async () => ({ trace, value: 1 }),
		);
		send({ type: "callback", id: 1, parent: 2, method: "execute_producer", args: [] });
		await tick();
		send({ type: "return", id: 2, ok: true, result: null });
		await produced;
		const staged = {
			context: { ...context },
			target: { ...target },
			nativeLinkRecord: structuredClone(record),
		};
		const linked = peer.phase.linkNative(cap, async () => staged);
		send({ type: "callback", id: 2, parent: 3, method: "verify_native_link", args: [] });
		await tick();
		staged.context.expiresAtMs = 0;
		staged.target.targetId = "changed-after-callback";
		send({ type: "return", id: 3, ok: true, result: null });
		await expect(linked).resolves.toBeUndefined();
		peer.hold();
	});
});
