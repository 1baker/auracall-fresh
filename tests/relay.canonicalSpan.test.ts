import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { dispatchRelayRequest } from "../src/mcp/relay/dispatch.js";
import {
	type CanonicalDispatchAuthority,
	type CanonicalDispatchBinding,
	RelayStore,
} from "../src/mcp/relay/store.js";

const roots: string[] = [];
afterEach(async () => {
	for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "auracall-public-canonical-"));
	roots.push(root);
	const store = new RelayStore(root, "synthetic-canonical-owner"),
		requestId = "canonical_request_01";
	const job = await store.enqueue({ requestId, prompt: "Exact approved prompt λ\n" });
	const route = {
		routeId: "owned-route",
		expectedUrl: "https://chatgpt.com/c/owned-conversation",
		expectedModel: "Synthetic Pro",
	};
	const state = { current: true, verified: 0, sends: 0, configures: 0 };
	const authority: CanonicalDispatchAuthority = {
		assertCurrent: async () => {
			if (!state.current) throw new Error("actual authority lost");
		},
		verifyTerminal: async (_binding, _operation, receipt) => {
			expect(receipt.status).toBe("completed");
			state.verified++;
		},
	};
	const execution = { intent: "a".repeat(64), generation: "original-g1", authority };
	const binding = async (): Promise<CanonicalDispatchBinding> => ({
		...route,
		requestId,
		fingerprint: job.fingerprint,
		claimId: (await store.status(requestId)).claimId ?? "missing-claim",
		intent: execution.intent,
		generation: execution.generation,
	});
	return { root, store, requestId, job, route, state, authority, execution, binding };
}

it("holds one canonical span across actual sender callbacks, Pro configuration and full saved terminal reply", async () => {
	const f = await fixture();
	let pro = false;
	const result = await dispatchRelayRequest({
		store: f.store,
		requestId: f.requestId,
		...f.route,
		maxStatusChecks: 1,
		pollIntervalMs: 0,
		execution: f.execution,
		frontend: {
			inspect: async () => ({
				ok: true,
				provider: "chatgpt",
				url: f.route.expectedUrl,
				model: f.route.expectedModel,
				effort: pro ? "pro" : "standard",
			}),
			configure: async () => {
				expect((await f.store.exactRequestStatus(await f.binding())).state).toBe("pending");
				f.state.configures++;
				pro = true;
				return { ok: true };
			},
			send: async () => {
				const s = await f.store.exactRequestStatus(await f.binding());
				expect(s.operation?.operationId).toBe(f.requestId);
				f.state.sends++;
				return { ok: true, requestId: f.requestId, routeId: f.route.routeId };
			},
			status: async () => ({
				ok: true,
				status: "completed",
				requestId: f.requestId,
				routeId: f.route.routeId,
				previousRequestId: null,
				conversationUrl: f.route.expectedUrl,
				output: "Whole reply 🧪\nFINAL",
			}),
		},
	} as never);
	expect(result.reply?.text).toBe("Whole reply 🧪\nFINAL");
	expect(f.state).toMatchObject({ sends: 1, configures: 1, verified: 1 });
	expect(
		(
			await new RelayStore(f.root, "synthetic-canonical-owner").exactRequestStatus(
				await f.binding(),
			)
		).state,
	).toBe("settled");
});

function admission(f: Awaited<ReturnType<typeof fixture>>) {
	return {
		...f.route,
		requestId: f.requestId,
		fingerprint: f.job.fingerprint,
		intent: f.execution.intent,
		generation: f.execution.generation,
	};
}
async function begin(f: Awaited<ReturnType<typeof fixture>>) {
	const span = await f.store.beginExactRequest(admission(f), f.authority);
	return { binding: { ...span.binding }, span };
}
function terminal(f: Awaited<ReturnType<typeof fixture>>, output = "Original full answer λ") {
	return {
		ok: true as const,
		status: "completed" as const,
		requestId: f.requestId,
		routeId: f.route.routeId,
		previousRequestId: null,
		conversationUrl: f.route.expectedUrl,
		output,
	};
}

it("uses the SAME preproducer admission after startup without a second claim or acquisition", async () => {
	const f = await fixture(),
		{ span, binding } = await begin(f);
	// Synthetic private startup occurs under the already-held canonical span.
	await span.assertCurrent("admit");
	const result = await dispatchRelayRequest({
		store: f.store,
		requestId: f.requestId,
		...f.route,
		maxStatusChecks: 1,
		pollIntervalMs: 0,
		execution: { ...f.execution, span },
		frontend: {
			inspect: async () => ({
				ok: true,
				provider: "chatgpt",
				url: f.route.expectedUrl,
				model: f.route.expectedModel,
				effort: "pro",
			}),
			send: async () => {
				f.state.sends++;
				return { ok: true, requestId: f.requestId, routeId: f.route.routeId };
			},
			status: async () => terminal(f),
		},
	});
	expect(result.claimId).toBe(binding.claimId);
	expect(f.state.sends).toBe(1);
	await expect(f.store.attachExactRequest(span, admission(f))).rejects.toMatchObject({
		code: "relay_dispatch_span_not_owned",
	});
	const g = await fixture(),
		original = await begin(g);
	await original.span.recordOriginal();
	await expect(g.store.attachExactRequest(original.span, admission(g))).rejects.toMatchObject({
		code: "relay_dispatch_span_not_owned",
	});
});

it("admits only one exact generation and never upgrades a restarted legacy claim into a fresh Send", async () => {
	const f = await fixture();
	const race = await Promise.allSettled([
		f.store.beginExactRequest(admission(f), f.authority),
		f.store.beginExactRequest(admission(f), f.authority),
	]);
	expect(race.filter((x) => x.status === "fulfilled")).toHaveLength(1);
	const binding = await f.binding();
	const reopened = new RelayStore(f.root, "synthetic-canonical-owner");
	await expect(
		reopened.beginExactRequest({ ...admission(f), generation: "replacement-g2" }, f.authority),
	).rejects.toThrow();
	await expect(
		reopened.originalDispatch({ ...binding, intent: "b".repeat(64) }, f.authority),
	).rejects.toMatchObject({ code: "relay_dispatch_binding_mismatch" });
	const g = await fixture();
	await g.store.frontendClaim(g.requestId, g.job.fingerprint, g.route);
	await expect(
		new RelayStore(g.root, "synthetic-canonical-owner").beginExactRequest(
			admission(g),
			g.authority,
		),
	).rejects.toMatchObject({ code: "relay_dispatch_fresh_claim_required" });
});

it("retains pending original rights when admission acknowledgment is lost after durable publication", async () => {
	const f = await fixture();
	let calls = 0;
	const authority = {
		...f.authority,
		assertCurrent: async () => {
			if (++calls === 3) throw new Error("lost admission ACK");
		},
	};
	await expect(f.store.beginExactRequest(admission(f), authority)).rejects.toThrow(
		"lost admission ACK",
	);
	const binding = await f.binding();
	expect(
		(await new RelayStore(f.root, "synthetic-canonical-owner").exactRequestStatus(binding)).state,
	).toBe("pending");
	await expect(f.store.beginExactRequest(admission(f), f.authority)).rejects.toMatchObject({
		code: "relay_dispatch_fresh_claim_required",
	});
	const original = await f.store.originalDispatch(binding, f.authority);
	await expect(original.recordOriginal()).rejects.toMatchObject({
		code: "relay_dispatch_readback_only",
	});
});

it("a fence or hold does not cancel a pending send, admit a replacement, or lose a genuine original completion", async () => {
	const f = await fixture();
	let unblock: () => void = () => {};
	let started: () => void = () => {};
	const waiting = new Promise<void>((r) => {
			unblock = r;
		}),
		sending = new Promise<void>((r) => {
			started = r;
		});
	const common = {
		store: f.store,
		requestId: f.requestId,
		...f.route,
		maxStatusChecks: 1,
		pollIntervalMs: 0,
		execution: f.execution,
	};
	const run = dispatchRelayRequest({
		...common,
		frontend: {
			inspect: async () => ({
				ok: true,
				provider: "chatgpt",
				url: f.route.expectedUrl,
				model: f.route.expectedModel,
				effort: "pro",
			}),
			send: async () => {
				f.state.sends++;
				started();
				await waiting;
				return { ok: true, requestId: f.requestId, routeId: f.route.routeId };
			},
			status: async () => {
				throw new Error("old worker must not continue after fence");
			},
		},
	});
	await sending;
	const binding = await f.binding();
	expect(await f.store.fenceExactRequest(binding, f.authority)).toMatchObject({ cancelled: false });
	await f.store.hold(f.requestId, binding.claimId);
	unblock();
	expect((await run).state).toBe("held_unknown");
	expect((await f.store.exactRequestStatus(binding)).state).toBe("fenced");
	await expect(
		f.store.originalDispatch({ ...binding, generation: "replacement-g2" }, f.authority),
	).rejects.toMatchObject({ code: "relay_dispatch_binding_mismatch" });
	const recovered = await dispatchRelayRequest({
		...common,
		store: new RelayStore(f.root, "synthetic-canonical-owner"),
		frontend: {
			inspect: async () => {
				throw new Error("recovery cannot reconfigure");
			},
			send: async () => {
				throw new Error("recovery cannot resend");
			},
			status: async () => terminal(f),
		},
	});
	expect(recovered.reply?.text).toBe("Original full answer λ");
	expect(f.state.sends).toBe(1);
	expect(f.state.verified).toBe(1);
	expect((await f.store.exactRequestStatus(binding)).state).toBe("settled");
});

it("a refused terminal proof cannot publish a reply or treat a hold as settlement", async () => {
	const f = await fixture(),
		{ binding, span } = await begin(f);
	await span.recordOriginal();
	await span.hold();
	const recovering = await f.store.originalDispatch(binding, {
		...f.authority,
		verifyTerminal: async () => {
			throw new Error("no genuine terminal evidence");
		},
	});
	await expect(recovering.settleOriginal(terminal(f))).rejects.toThrow(
		"no genuine terminal evidence",
	);
	expect((await f.store.status(f.requestId)).reply).toBeNull();
	expect((await f.store.exactRequestStatus(binding)).state).toBe("pending");
	await expect(
		recovering.settleOriginal({ ...terminal(f), conversationUrl: "https://chatgpt.com/c/other" }),
	).rejects.toMatchObject({ code: "relay_dispatch_terminal_mismatch" });
});

it("consumes one original operation across concurrent callbacks and preserves strict legacy claim bytes", async () => {
	const f = await fixture(),
		{ binding, span } = await begin(f);
	const pair = await Promise.allSettled([span.recordOriginal(), span.recordOriginal()]);
	expect(pair.filter((x) => x.status === "fulfilled")).toHaveLength(1);
	const legacy = await f.store.claim(f.requestId, f.job.fingerprint);
	expect(Object.keys(legacy).sort()).toEqual(["claimId", "fingerprint", "fresh"]);
	const prior = await f.store.originalDispatch(binding, f.authority);
	await expect(prior.assertCurrent("configure")).rejects.toMatchObject({
		code: "relay_dispatch_readback_only",
	});
	await expect(prior.recordOriginal()).rejects.toMatchObject({
		code: "relay_dispatch_readback_only",
	});
	await prior.settleOriginal(terminal(f));
	await prior.settleOriginal(terminal(f));
	await expect(
		prior.settleOriginal(terminal(f, "Conflicting other response")),
	).rejects.toMatchObject({ code: "relay_dispatch_terminal_conflict" });
});

it("cannot promote a same-process legacy Send claim to fresh canonical execution", async () => {
	const f = await fixture();
	await dispatchRelayRequest({
		store: f.store,
		requestId: f.requestId,
		...f.route,
		maxStatusChecks: 1,
		pollIntervalMs: 0,
		frontend: {
			inspect: async () => ({
				ok: true,
				provider: "chatgpt",
				url: f.route.expectedUrl,
				model: f.route.expectedModel,
				effort: "pro",
			}),
			send: async () => {
				f.state.sends++;
				return { ok: true, requestId: f.requestId, routeId: f.route.routeId };
			},
			status: async () => ({
				ok: true,
				status: "sent",
				requestId: f.requestId,
				routeId: f.route.routeId,
				previousRequestId: null,
			}),
		},
	});
	await expect(f.store.beginExactRequest(admission(f), f.authority)).rejects.toMatchObject({
		code: "relay_dispatch_fresh_claim_required",
	});
	expect(f.state.sends).toBe(1);
});

it("generic reply submission cannot bypass terminal proof or advance linked work", async () => {
	const f = await fixture(),
		{ binding, span } = await begin(f);
	await span.recordOriginal();
	await expect(
		f.store.submit(f.requestId, binding.claimId, "Unverified reply"),
	).rejects.toMatchObject({ code: "relay_dispatch_span_required" });
	expect((await f.store.status(f.requestId)).state).not.toBe("replied");
	await expect(
		f.store.enqueue({
			requestId: "unverified_followup",
			prompt: "Do not advance",
			previousRequestId: f.requestId,
		}),
	).rejects.toMatchObject({ code: "previous_reply_required" });
});

it("lost publication acknowledgment keeps a saved reply nonterminal until matched settlement", async () => {
	const f = await fixture(),
		{ binding, span } = await begin(f);
	await span.recordOriginal();
	const recovering = await f.store.originalDispatch(binding, {
		...f.authority,
		assertCurrent: async (_binding, stage) => {
			if (stage === "publish" && (await f.store.exactRequestStatus(binding)).savedReplySha256)
				throw new Error("publication ACK lost");
		},
	});
	await expect(recovering.settleOriginal(terminal(f))).rejects.toThrow("publication ACK lost");
	expect((await f.store.exactRequestStatus(binding)).savedReplySha256).toMatch(/^[a-f0-9]{64}$/);
	expect(await f.store.status(f.requestId)).toMatchObject({ state: "held_unknown", reply: null });
	await expect(
		f.store.enqueue({
			requestId: "partial_followup",
			prompt: "Do not advance",
			previousRequestId: f.requestId,
		}),
	).rejects.toMatchObject({ code: "previous_reply_required" });
	const original = await f.store.originalDispatch(binding, f.authority);
	await original.settleOriginal(terminal(f));
	expect((await f.store.status(f.requestId)).state).toBe("replied");
});
