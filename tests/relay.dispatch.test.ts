import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dispatchRelayRequest, type RelayDispatchOptions } from "../src/mcp/relay/dispatch.js";
import { RelayStore } from "../src/mcp/relay/store.js";

it("claims before one frontend Send and saves the entire completed answer", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-dispatch-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		const requestId = "sender_first_01";
		const prompt = "  Preserve this original prompt λ\n";
		const answer = "Complete response αβ\n\nFinal line 🧪";
		await store.enqueue({ requestId, prompt });
		let sends = 0;
		const result = await dispatchRelayRequest({
			store,
			requestId,
			routeId: "retained-chatgpt",
			expectedUrl: "https://chatgpt.com/c/synthetic-chat",
			expectedModel: "GPT fixture",
			maxStatusChecks: 1,
			pollIntervalMs: 0,
			frontend: {
				inspect: async () => ({
					ok: true,
					provider: "chatgpt",
					model: "GPT fixture",
					effort: "pro",
					url: "https://chatgpt.com/c/synthetic-chat",
				}),
				send: async (routeId, id, text, previous) => {
					expect(await store.status(requestId)).toMatchObject({ state: "awaiting_reply" });
					expect([routeId, id, text, previous]).toEqual([
						"retained-chatgpt",
						requestId,
						prompt,
						undefined,
					]);
					sends++;
					return { ok: true, requestId, routeId, status: "sent" };
				},
				status: async (routeId, id) => ({
					ok: true,
					requestId: id,
					routeId,
					previousRequestId: null,
					conversationUrl: "https://chatgpt.com/c/synthetic-chat",
					status: "completed",
					output: answer,
				}),
			},
		});
		expect(sends).toBe(1);
		expect(result).toMatchObject({
			state: "replied",
			reply: { text: answer, liveVerified: false },
		});
		expect(await new RelayStore(root, "synthetic-owner").status(requestId)).toMatchObject({
			state: "replied",
			reply: { text: answer },
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses a changed route after a claim instead of accepting another route's answer", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-route-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		const requestId = "sender_route_01";
		await store.enqueue({ requestId, prompt: "Keep this conversation" });
		let complete = false;
		let sends = 0;
		const options = {
			store,
			requestId,
			expectedUrl: "https://chatgpt.com/c/one-chat",
			expectedModel: "GPT fixture",
			maxStatusChecks: 1,
			pollIntervalMs: 0,
			frontend: {
				inspect: async () => ({
					ok: true,
					provider: "chatgpt",
					model: "GPT fixture",
					effort: "pro",
					url: "https://chatgpt.com/c/one-chat",
				}),
				send: async (routeId: string, id: string) => {
					sends++;
					return { ok: true, requestId: id, routeId, status: "sent" };
				},
				status: async (routeId: string, id: string) => ({
					ok: true,
					requestId: id,
					routeId,
					previousRequestId: null,
					conversationUrl: "https://chatgpt.com/c/one-chat",
					status: complete ? "completed" : "sent",
					output: complete ? "An answer" : null,
				}),
			},
		};
		expect(await dispatchRelayRequest({ ...options, routeId: "original-route" })).toMatchObject({
			state: "awaiting_reply",
		});
		complete = true;
		await expect(
			dispatchRelayRequest({ ...options, routeId: "different-route" }),
		).rejects.toMatchObject({ code: "relay_sender_binding_mismatch" });
		expect(sends).toBe(1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses an observed different conversation before creating a claim or sending", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-target-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		const requestId = "sender_target_01";
		await store.enqueue({ requestId, prompt: "Use only the approved conversation" });
		let sends = 0;
		await expect(
			dispatchRelayRequest({
				store,
				requestId,
				routeId: "retained-chatgpt",
				expectedUrl: "https://chatgpt.com/c/approved-chat",
				expectedModel: "GPT fixture",
				maxStatusChecks: 1,
				pollIntervalMs: 0,
				frontend: {
					inspect: async () => ({
						ok: true,
						provider: "chatgpt",
						model: "GPT fixture",
						effort: "pro",
						url: "https://chatgpt.com/c/different-chat",
					}),
					send: async () => {
						sends++;
						return {};
					},
					status: async () => ({}),
				},
			}),
		).rejects.toMatchObject({ code: "relay_frontend_target_unqualified" });
		expect(sends).toBe(0);
		expect(await store.status(requestId)).toMatchObject({ state: "ready", claimId: null });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function senderFixture() {
	const root = await mkdtemp(join(tmpdir(), "auracall-sender-guards-"));
	const store = new RelayStore(root, "synthetic-owner");
	const requestId = "sender_guard_01";
	await store.enqueue({ requestId, prompt: "Keep the original request" });
	const control = { complete: true, throwSend: false, unavailable: false, sends: 0, reads: 0 };
	const observed: Record<string, unknown> = {
		ok: true,
		provider: "chatgpt",
		model: "GPT fixture",
		effort: "pro",
		url: "https://chatgpt.com/c/guard-chat",
	};
	const options: RelayDispatchOptions = {
		store,
		requestId,
		routeId: "guard-route",
		expectedUrl: "https://chatgpt.com/c/guard-chat",
		expectedModel: "GPT fixture",
		maxStatusChecks: 1,
		pollIntervalMs: 0,
		frontend: {
			inspect: async () => {
				if (control.unavailable) throw Error("Unavailable");
				return observed;
			},
			send: async (routeId, id) => {
				control.sends++;
				if (control.throwSend) throw Error("Acknowledgment lost after input");
				return { ok: true, routeId, requestId: id, status: "sent" };
			},
			status: async (routeId, id) => {
				if (control.unavailable) throw Error("Unavailable");
				control.reads++;
				return {
					ok: true,
					routeId,
					requestId: id,
					previousRequestId: null,
					conversationUrl: "https://chatgpt.com/c/guard-chat",
					status: control.complete ? "completed" : "sent",
					output: control.complete ? "Entire answer λ\nEND" : null,
				};
			},
		},
	};
	return {
		root,
		store,
		requestId,
		control,
		observed,
		options,
		close: () => rm(root, { recursive: true, force: true }),
	};
}

it("refuses unverified Pro before a claim or frontend Send", async () => {
	const f = await senderFixture();
	try {
		f.observed.effort = "high";
		await expect(dispatchRelayRequest(f.options)).rejects.toMatchObject({
			code: "relay_frontend_model_unqualified",
		});
		expect(f.control.sends).toBe(0);
		expect(await f.store.status(f.requestId)).toMatchObject({ state: "ready", claimId: null });
	} finally {
		await f.close();
	}
});

it("does not adopt a panel or other actor's existing claim", async () => {
	const f = await senderFixture();
	try {
		const job = await f.store.request(f.requestId);
		await f.store.claim(f.requestId, job.fingerprint);
		await expect(dispatchRelayRequest(f.options)).rejects.toMatchObject({
			code: "relay_sender_claim_not_owned",
		});
		expect([f.control.sends, f.control.reads]).toEqual([0, 0]);
	} finally {
		await f.close();
	}
});

it("recovers a late complete reply after uncertain input using status only, including restart", async () => {
	const f = await senderFixture();
	try {
		f.control.throwSend = true;
		expect(await dispatchRelayRequest(f.options)).toMatchObject({
			state: "held_unknown",
			reply: null,
		});
		expect(f.control.sends).toBe(1);
		const restarted = { ...f.options, store: new RelayStore(f.root, "synthetic-owner") };
		expect(await dispatchRelayRequest(restarted)).toMatchObject({
			state: "replied",
			reply: { text: "Entire answer λ\nEND" },
		});
		f.control.unavailable = true;
		expect(await dispatchRelayRequest(restarted)).toMatchObject({
			state: "replied",
			reply: { text: "Entire answer λ\nEND" },
		});
		expect([f.control.sends, f.control.reads]).toEqual([1, 1]);
	} finally {
		await f.close();
	}
});

it("allows at most one Send under simultaneous callers", async () => {
	const f = await senderFixture();
	try {
		const results = await Promise.allSettled([
			dispatchRelayRequest(f.options),
			dispatchRelayRequest({ ...f.options, store: new RelayStore(f.root, "synthetic-owner") }),
		]);
		expect(results.some((r) => r.status === "fulfilled")).toBe(true);
		expect(f.control.sends).toBe(1);
	} finally {
		await f.close();
	}
});

it("bounds status polling and preserves the original claim for the next readback", async () => {
	const f = await senderFixture();
	try {
		f.control.complete = false;
		const first = await dispatchRelayRequest({ ...f.options, maxStatusChecks: 2 });
		expect(first).toMatchObject({ state: "awaiting_reply", reply: null });
		const next = await dispatchRelayRequest(f.options);
		expect(next.claimId).toBe(first.claimId);
		expect([f.control.sends, f.control.reads]).toEqual([1, 3]);
	} finally {
		await f.close();
	}
});

it("does not attribute a cached automatic reply to a different route", async () => {
	const f = await senderFixture();
	try {
		await dispatchRelayRequest(f.options);
		await expect(
			dispatchRelayRequest({ ...f.options, routeId: "another-route" }),
		).rejects.toMatchObject({ code: "relay_sender_binding_mismatch" });
		expect(f.control.sends).toBe(1);
	} finally {
		await f.close();
	}
});

it("preserves a frontend continuity refusal instead of reporting ordinary pending generation", async () => {
	const f = await senderFixture();
	try {
		f.options.frontend.status = async (routeId, requestId) => ({
			ok: true,
			routeId,
			requestId,
			previousRequestId: null,
			status: "sent",
			code: "continuity_mismatch",
		});
		expect(await dispatchRelayRequest(f.options)).toMatchObject({
			state: "held_unknown",
			code: "continuity_mismatch",
		});
		expect(f.control.sends).toBe(1);
	} finally {
		await f.close();
	}
});

it("refuses a different preceding frontend answer before the linked request claims or sends", async () => {
	const f = await senderFixture();
	try {
		const parent = await f.store.request(f.requestId);
		const claim = await f.store.claim(f.requestId, parent.fingerprint);
		await f.store.submit(f.requestId, claim.claimId, "Relay preceding answer A");
		const child = "sender_guard_child";
		await f.store.enqueue({
			requestId: child,
			prompt: "Continue that answer",
			previousRequestId: f.requestId,
		});
		f.options.frontend.status = async (routeId, requestId) => ({
			ok: true,
			routeId,
			requestId,
			previousRequestId: requestId === child ? f.requestId : null,
			conversationUrl: f.options.expectedUrl,
			status: "completed",
			output: requestId === child ? "Child answer" : "Different frontend preceding answer B",
		});
		await expect(dispatchRelayRequest({ ...f.options, requestId: child })).rejects.toMatchObject({
			code: "relay_sender_previous_reply_mismatch",
		});
		expect(f.control.sends).toBe(0);
		expect(await f.store.status(child)).toMatchObject({ state: "ready", claimId: null });
	} finally {
		await f.close();
	}
});
