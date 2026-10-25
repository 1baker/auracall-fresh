import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { FrontendRoute } from "../src/browser/frontends/types.js";
import { prepareRelayProOnly } from "../src/mcp/relay/proPreparation.js";
import { RelayStore } from "../src/mcp/relay/store.js";

const route: FrontendRoute = {
	id: "owned-chatgpt",
	provider: "chatgpt",
	expectedUrl: "https://chatgpt.com/c/pro-fixture",
	expectedModel: "GPT fixture",
	profileCapabilityEnv: "SYNTHETIC_CAPABILITY",
	serviceTabHandle: {
		valid: true,
		browserId: "fixture-browser",
		tabId: "fixture-tab",
		targetId: "fixture-target",
		profileId: "fixture-profile",
		sessionName: "fixture-session",
	},
};
const observed = {
	ok: true,
	routeId: route.id,
	provider: "chatgpt",
	url: route.expectedUrl,
	model: route.expectedModel,
	effort: "pro",
};

it("prepares and independently verifies Pro without a model request, claim or Send", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-only-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		let configured = 0,
			inspected = 0;
		const result = await prepareRelayProOnly({
			store,
			route,
			operationId: "pro_operation_01",
			frontend: {
				configure: async (id, effort) => {
					expect([id, effort]).toEqual([route.id, "pro"]);
					configured++;
					return { ...observed, verified: true };
				},
				inspect: async () => {
					inspected++;
					return { ...observed };
				},
			},
		});
		expect(result).toMatchObject({
			operationId: "pro_operation_01",
			routeId: route.id,
			state: "verified",
			preparationOnly: true,
			currentPageObserved: true,
			liveVerified: false,
		});
		expect([configured, inspected]).toEqual([1, 1]);
		expect(await store.pending()).toEqual({ requests: [], nextCursor: null });
		await expect(store.status("pro_operation_01")).rejects.toMatchObject({
			code: "request_missing",
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("returns only historical metadata on cached preparation, without calling the frontend again", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-cache-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		await prepareRelayProOnly({
			store,
			route,
			operationId: "pro_cache_operation",
			frontend: {
				configure: async () => ({ ...observed, verified: true }),
				inspect: async () => ({ ...observed }),
			},
		});
		const unavailable = async () => {
			throw Error("No live frontend");
		};
		const cached = await prepareRelayProOnly({
			store: new RelayStore(root, "synthetic-owner"),
			route,
			operationId: "pro_cache_operation",
			frontend: { configure: unavailable, inspect: unavailable },
		});
		expect(cached).toMatchObject({
			cached: true,
			currentPageObserved: false,
			state: "verified",
			preparationOnly: true,
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("holds refused or uncertain control across restart and cannot bypass it with another operation or route alias", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-held-"));
	try {
		let effects = 0;
		const frontend = {
			configure: async () => {
				effects++;
				throw Error("Uncertain control");
			},
			inspect: async () => ({ ...observed }),
		};
		const input = {
			store: new RelayStore(root, "synthetic-owner"),
			route,
			operationId: "pro_held_operation",
			frontend,
		};
		await expect(prepareRelayProOnly(input)).rejects.toThrow("Uncertain control");
		await expect(
			prepareRelayProOnly({ ...input, store: new RelayStore(root, "synthetic-owner") }),
		).rejects.toMatchObject({ code: "relay_pro_preparation_held" });
		await expect(
			prepareRelayProOnly({ ...input, operationId: "different_operation" }),
		).rejects.toMatchObject({ code: "relay_pro_preparation_binding_mismatch" });
		await expect(
			prepareRelayProOnly({
				...input,
				route: { ...route, id: "alias" },
				operationId: "alias_operation",
			}),
		).rejects.toMatchObject({ code: "relay_pro_preparation_binding_mismatch" });
		expect(effects).toBe(1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("requires fresh independent Pro evidence and preserves a terminal model request without reusing its ID", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-proof-"));
	try {
		const store = new RelayStore(root, "synthetic-owner");
		const job = await store.enqueue({
			requestId: "completed_model_request",
			prompt: "Synthetic original",
		});
		const claim = await store.claim(job.requestId, job.fingerprint);
		await store.submit(job.requestId, claim.claimId, "Original complete answer");
		const before = await store.status(job.requestId);
		const frontend = {
			configure: async () => ({ ...observed, verified: true }),
			inspect: async () => ({ ...observed, effort: "standard" }),
		};
		await expect(
			prepareRelayProOnly({ store, route, operationId: job.requestId, frontend }),
		).rejects.toMatchObject({ code: "relay_pro_preparation_id_is_request" });
		await expect(
			prepareRelayProOnly({ store, route, operationId: "distinct_pro_operation", frontend }),
		).rejects.toMatchObject({ code: "relay_frontend_model_unqualified" });
		expect(await store.status(job.requestId)).toEqual(before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses changing the bound target during Pro preparation even when URL/model/Pro still match", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-drift-"));
	try {
		const changing = structuredClone(route);
		const frontend = {
			configure: async () => {
				changing.serviceTabHandle.targetId = "another-target";
				return { ...observed, verified: true };
			},
			inspect: async () => ({ ...observed }),
		};
		await expect(
			prepareRelayProOnly({
				store: new RelayStore(root, "synthetic-owner"),
				route: changing,
				operationId: "pro_drift_operation",
				frontend,
			}),
		).rejects.toMatchObject({ code: "relay_pro_preparation_binding_mismatch" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("allows only one control transaction for a target even with concurrent distinct operation IDs", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-pro-concurrent-"));
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let signal = () => {};
	const started = new Promise<void>((resolve) => {
		signal = resolve;
	});
	let running: ReturnType<typeof prepareRelayProOnly> | undefined;
	try {
		let controls = 0;
		const frontend = {
			configure: async () => {
				controls++;
				signal();
				await gate;
				return { ...observed, verified: true };
			},
			inspect: async () => ({ ...observed }),
		};
		running = prepareRelayProOnly({
			store: new RelayStore(root, "synthetic-owner"),
			route,
			operationId: "first_pro_operation",
			frontend,
		});
		await started;
		await expect(
			prepareRelayProOnly({
				store: new RelayStore(root, "synthetic-owner"),
				route,
				operationId: "second_pro_operation",
				frontend,
			}),
		).rejects.toMatchObject({ code: "relay_request_locked" });
		release();
		await running;
		expect(controls).toBe(1);
		await expect(
			prepareRelayProOnly({
				store: new RelayStore(root, "another-owner"),
				route,
				operationId: "first_pro_operation",
				frontend,
			}),
		).rejects.toMatchObject({ code: "relay_pro_preparation_binding_mismatch" });
		expect(controls).toBe(1);
	} finally {
		release();
		await running?.catch(() => {});
		await rm(root, { recursive: true, force: true });
	}
});
