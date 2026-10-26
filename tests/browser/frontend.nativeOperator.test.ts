import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createNativeOperatorIntegration } from "../../src/browser/frontends/nativeOperator.js";
import { nativeBudgetDigest } from "../../src/browser/frontends/nativeReadBudget.js";
import fixture from "./fixtures/native-admission-observation-v2.json";
import { fixtureDispatchJoin, fixtureLedgerWriter } from "./nativeDispatchFixture.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const context = {
	receiptDigest: fixture.request.receiptDigest,
	producerSha256: fixture.privateResult.producerSha256,
	expiresAtMs: 100000,
};
const task = {
	controlRef: "synthetic-control",
	taskId: "synthetic-consumer-task",
	profileId: fixture.privateResult.grant.producer.profileId,
	browserId: "synthetic-browser",
	tabId: "synthetic-tab",
	targetId: "synthetic-target",
};
async function harness() {
	const directory = await mkdtemp(join(tmpdir(), "auracall-operator-synthetic-"));
	dirs.push(directory);
	const stages: string[] = [];
	const events: string[] = [];
	const guard = {
		checkpoint: vi.fn(async (stage: string, ctx: unknown) => {
			expect(ctx).toEqual(context);
			stages.push(stage);
		}),
		assert_current: vi.fn(async (ctx: unknown) => {
			expect(ctx).toEqual(context);
		}),
		attach_read_budget_context: vi.fn(async () => {}),
	};
	const supplier = {
		reserveObservationReads: vi.fn(async (_ctx: unknown, reads: number) => {
			expect(reads).toBe(2);
			events.push("reserve");
		}),
		observe: vi.fn(async (_ctx: unknown, nonce: string) => {
			events.push("observe");
			return {
				publicResult: fixture.publicResult,
				privateResult: { ...fixture.privateResult, requestNonce: nonce },
			};
		}),
		originalUsage: vi.fn(async (ctx: unknown) => ({
			amendment: "same-p266-pro-only-063a5c60-additional60",
			contextDigest: nativeBudgetDigest(ctx),
			reservationDigest: nativeBudgetDigest([]),
			consumed: { acquisition: 0, read: 20, control: 0, draft: 0, send: 2 },
		})),
		assertCurrent: vi.fn(async (_ctx: unknown, _dispatch: unknown) => {}),
	};
	const joinEvents: string[] = [];
	const dispatchJoin = fixtureDispatchJoin(joinEvents);
	const integration = createNativeOperatorIntegration({
		dispatchJoin,
		writer: fixtureLedgerWriter(dispatchJoin),
		guard,
		supplier,
		grant: fixture.request.expectedGrant,
		ownerAuthority: fixture.privateResult.ownerAuthority,
		producerTaskId: "synthetic-producer-task",
		producerSha256: context.producerSha256,
		receiptDigest: context.receiptDigest,
		now: () => 2000,
	});
	const budgetContext = { ...context, admissionDigest: "a".repeat(64), ledgerDirectory: directory };
	return { ...integration, guard, supplier, budgetContext, stages, events, joinEvents };
}

it("joins the original three-field guard to the acquired identity without losing dispatch metadata", async () => {
	const h = await harness();
	await h.lifetime.qualify(context);
	await h.readBudget(h.budgetContext);
	await h.lifetime.assertCurrent(context, { kind: "sdk_connect" });
	await h.lifetime.retain(context, { callTool: vi.fn() });
	await h.lifetime.assertCurrent(context, { kind: "acquire" });
	const acquired = { ...context, nativeTask: task };
	await h.lifetime.acquired(acquired);
	const dispatch = { kind: "command", action: "snapshot", operationKey: "snapshot-0001" } as const;
	await h.lifetime.assertCurrent(acquired, dispatch);
	expect(h.supplier.assertCurrent).toHaveBeenLastCalledWith(acquired, dispatch);
	expect(h.events).toEqual(["reserve", "observe"]);
	expect(h.joinEvents).toEqual(["admit_once", "qualify_budget"]);
	expect(h.stages).toEqual([
		"qualifying_admit",
		"observing_native",
		"qualifying_budget",
		"sdk_handshake",
		"consumer_acquisition",
		"governed_use",
	]);
});

it("does not invoke the private observer when a hold arrives during its checkpoint", async () => {
	const h = await harness();
	let finish!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	h.guard.checkpoint.mockImplementation(async (stage) => {
		if (stage === "observing_native") {
			entered();
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
		}
	});
	const run = h.lifetime.qualify(context);
	const rejected = expect(run).rejects.toMatchObject({ code: "native_lifetime_held" });
	await waiting;
	await h.lifetime.uncertain(context, "operator_lost");
	finish();
	await rejected;
	expect(h.supplier.reserveObservationReads).toHaveBeenCalledOnce();
	expect(h.supplier.observe).not.toHaveBeenCalled();
});

it.each([
	"unknown carry",
	"guard lost",
	"bad completion",
	"v1",
])("retains one failed attempt after %s", async (failure) => {
	const h = await harness();
	if (failure === "unknown carry")
		h.supplier.reserveObservationReads.mockRejectedValueOnce(new Error("UNKNOWN"));
	if (failure === "guard lost") h.guard.assert_current.mockRejectedValueOnce(new Error("lost"));
	if (failure === "bad completion")
		h.supplier.observe.mockResolvedValueOnce({
			publicResult: { success: true, data: { ownerObservation: "queued" } },
			privateResult: fixture.privateResult,
		});
	if (failure === "v1")
		h.supplier.observe.mockImplementationOnce(async (_ctx, nonce) => ({
			publicResult: fixture.publicResult,
			privateResult: {
				...fixture.privateResult,
				requestNonce: nonce,
				schemaVersion: "agent-browser.native-admission-observation.v1",
			},
		}));
	await expect(h.lifetime.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
	await expect(h.lifetime.qualify(context)).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(h.supplier.observe.mock.calls.length).toBe(
		failure === "unknown carry" || failure === "guard lost" ? 0 : 1,
	);
});

it("rejects unknown complete carry before SDK admission", async () => {
	const h = await harness();
	await h.lifetime.qualify(context);
	h.supplier.originalUsage.mockResolvedValueOnce(null as never);
	await expect(h.readBudget(h.budgetContext)).rejects.toMatchObject({
		code: "native_operator_unqualified",
	});
	await expect(h.lifetime.assertCurrent(context, { kind: "sdk_connect" })).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	expect(h.supplier.assertCurrent).not.toHaveBeenCalled();
});

it("blocks changed task identity and later use after real current-authority refusal", async () => {
	const h = await harness();
	await h.lifetime.qualify(context);
	await h.readBudget(h.budgetContext);
	await h.lifetime.assertCurrent(context, { kind: "sdk_connect" });
	await h.lifetime.retain(context, { callTool: vi.fn() });
	await h.lifetime.assertCurrent(context, { kind: "acquire" });
	const acquired = { ...context, nativeTask: task };
	await h.lifetime.acquired(acquired);
	h.supplier.assertCurrent.mockRejectedValueOnce(new Error("authority_lost"));
	const dispatch = { kind: "command", action: "snapshot", operationKey: "snapshot-0001" } as const;
	await expect(h.lifetime.assertCurrent(acquired, dispatch)).rejects.toMatchObject({
		code: "native_lifetime_held",
	});
	const calls = h.supplier.assertCurrent.mock.calls.length;
	await expect(
		h.lifetime.assertCurrent(
			{ ...acquired, nativeTask: { ...task, controlRef: "borrowed" } },
			{ kind: "release", operationKey: "release-0001" },
		),
	).rejects.toMatchObject({ code: "native_lifetime_held" });
	expect(h.supplier.assertCurrent).toHaveBeenCalledTimes(calls);
});
