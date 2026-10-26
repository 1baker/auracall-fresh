import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type NativeConsumerAdmission,
	NativeConsumerSession,
	type NativeMcpClient,
} from "../../src/browser/frontends/nativeConsumer.js";
import {
	nativeBudgetDigest,
	nativeReadAmendment,
	qualifyNativeReadBudget,
} from "../../src/browser/frontends/nativeReadBudget.js";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const makeSession = (
	client: NativeMcpClient,
	input: NativeConsumerAdmission,
	path: string,
	now = Date.now,
) => new NativeConsumerSession(client, input, path, now);

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const admission = {
	consumerGrantId: "synthetic-grant",
	profileCapability: "synthetic-private-capability",
	taskKey: "synthetic-own-task",
	profileId: "disposable:default:6",
	browserId: "synthetic-browser",
	tabId: "synthetic-tab",
	targetId: "synthetic-target",
	expiresAtMs: 2000000000000,
};
const data = (action = "open", key = "acquisition-key") =>
	withCompletedIdentity(
		{
			targetObservation: {
				operationId: `synthetic-operation-${key}`,
				targetId: "synthetic-target",
				targetType: "page",
				origin: "https://chatgpt.com",
				stage: "after_action",
				observedAtMs: 1000,
			},
			contractVersion: "agent-browser.retained-consumer.v1",
			taskId: "synthetic-consumer-task",
			controlRef: "synthetic-control",
			consumerGrantId: admission.consumerGrantId,
			acquisitionId: "synthetic-acquisition",
			state: "active",
			expiresAtMs: admission.expiresAtMs,
			profileId: admission.profileId,
			browserId: admission.browserId,
			tabId: admission.tabId,
			operation: {
				operationId: `synthetic-operation-${key}`,
				operationKey: key,
				action,
				state: "completed",
				ack: {
					kind:
						action === "open"
							? "opened"
							: ["url", "snapshot", "gettext"].includes(action)
								? "observed"
								: "input_acknowledged",
					completedAtMs: 1000,
				},
				createdAtMs: 900,
			},
			consumerAck: {
				kind:
					action === "open"
						? "opened"
						: ["url", "snapshot", "gettext"].includes(action)
							? "observed"
							: "input_acknowledged",
				completedAtMs: 1000,
			},
			result: action === "url" ? { url: "https://chatgpt.com/c/synthetic" } : null,
		},
		admission,
	);
const envelope = (tool: string, value: unknown) => ({
	isError: false,
	content: [
		{
			type: "text",
			text: JSON.stringify({
				tool,
				session: "synthetic-session",
				success: true,
				data: value,
				error: null,
			}),
		},
	],
});
async function directory() {
	const p = await mkdtemp(join(tmpdir(), "auracall-native-consumer-"));
	dirs.push(p);
	return p;
}
async function carriedBudget(
	consumed: Partial<{ read: number; control: number; acquisition: number }> = {},
	baselineRead = false,
) {
	const path = await directory();
	let reservationDigest = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
	const baselineName = `reservation-${nativeBudgetDigest("prior-read")}.json`;
	if (baselineRead) {
		const row = { bucket: "read", key: "prior-read", intentDigest: "c".repeat(64) };
		const raw = JSON.stringify(row);
		await writeFile(join(path, baselineName), raw, { mode: 0o600 });
		await writeFile(
			join(path, baselineName.replace("reservation-", "completed-")),
			JSON.stringify({ ...row, completed: true }),
			{ mode: 0o600 },
		);
		reservationDigest = nativeBudgetDigest([
			[baselineName, createHash("sha256").update(raw).digest("hex")],
		]);
	}
	const proof = {
		amendment: nativeReadAmendment,
		contextDigest: "",
		reservationDigest,
		consumed: { acquisition: 0, read: 18, control: 0, draft: 0, send: 2, ...consumed },
	};
	const context = {
		receiptDigest: "a".repeat(64),
		producerSha256: "b".repeat(64),
		admissionDigest: nativeBudgetDigest(admission),
		expiresAtMs: admission.expiresAtMs,
		ledgerDirectory: path,
	};
	const budget = await qualifyNativeReadBudget(
		context,
		async (ctx) => {
			proof.contextDigest = nativeBudgetDigest(ctx);
			return proof;
		},
		() => 2000,
	);
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		const action = name === "browser_open" ? "open" : args.action;
		const result = data(action, args.operationKey);
		if (action === "press") result.result = { pressed: true } as never;
		return envelope(name, result);
	});
	const session = new NativeConsumerSession({ callTool }, admission, path, () => 2000, budget);
	return { session, budget, proof, context, callTool, path, baselineName };
}

describe("carried Pro-only read allowance", () => {
	it.each([
		"amendment",
		"send-reset",
		"under-count",
		"snapshot",
		"unknown",
		"incomplete",
		"expired",
		"unresolved-lock",
	])("refuses %s qualification without creating policy or contacting a producer", async (change) => {
		const f = await carriedBudget({}, true);
		const proof: {
			amendment: string;
			contextDigest: string;
			reservationDigest: string;
			consumed: {
				acquisition: number;
				read: number | null;
				control: number;
				draft: number;
				send: number;
			};
		} = structuredClone(f.proof);
		let now = 2000;
		if (change === "amendment") proof.amendment = "arbitrary-refill";
		if (change === "send-reset") proof.consumed.send = 0;
		if (change === "under-count") proof.consumed.read = 0;
		if (change === "snapshot") proof.reservationDigest = nativeBudgetDigest([]);
		if (change === "unknown") proof.consumed.read = null;
		if (change === "incomplete")
			await rm(join(f.path, f.baselineName.replace("reservation-", "completed-")));
		if (change === "unresolved-lock")
			await writeFile(join(f.path, "operation.lock"), "", { mode: 0o600 });
		await expect(
			qualifyNativeReadBudget(
				f.context,
				async () => {
					if (change === "expired") now = admission.expiresAtMs;
					return proof;
				},
				() => now,
			),
		).rejects.toMatchObject({ code: "native_read_budget_unqualified" });
		expect(f.callTool).not.toHaveBeenCalled();
		expect(await readdir(f.path)).not.toContain("read-budget.json");
	});

	it("never restores consumed capacity when a later reservation disappears", async () => {
		const f = await carriedBudget({ read: 79 });
		await f.session.acquire();
		await f.session.read("url", {}, "last-admitted-read");
		await rm(join(f.path, `reservation-${nativeBudgetDigest("last-admitted-read")}.json`));
		await expect(f.session.read("url", {}, "reused-capacity-read")).rejects.toMatchObject({
			code: "native_read_budget_unqualified",
		});
		expect(f.callTool).toHaveBeenCalledTimes(2);
	});
	it("charges the preexisting baseline exactly once and stops at cumulative80", async () => {
		const f = await carriedBudget({ read: 79 }, true);
		await f.session.acquire();
		await f.session.read("url", {}, "last-admitted-read");
		await expect(f.session.read("url", {}, "over-cap-read")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		expect(f.callTool).toHaveBeenCalledTimes(2);
	});
	it("carries controls and prohibits drafts and Sends under this Pro-only policy", async () => {
		const f = await carriedBudget({ control: 5 });
		await f.session.acquire();
		await f.session.control("press", "e1", "last-control-key");
		await expect(f.session.control("press", "e2", "over-control-key")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		await expect(f.session.fill("not authorized", "forbidden-draft")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		await expect(f.session.send("forbidden-send")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		expect(f.callTool).toHaveBeenCalledTimes(2);
	});
	it("reserves independent readback headroom using carried counts before control", async () => {
		const f = await carriedBudget({ read: 75 });
		await f.session.acquire();
		await expect(f.session.control("press", "e1", "unsafe-control")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		expect(f.callTool).toHaveBeenCalledOnce();
	});
	it("does not admit a fresh acquisition when original counted acquisition is already used", async () => {
		const f = await carriedBudget({ acquisition: 1 });
		await expect(f.session.acquire()).rejects.toMatchObject({ code: "consumer_budget_exhausted" });
		expect(f.callTool).not.toHaveBeenCalled();
	});
	it.each([
		"directory",
		"target",
		"grant",
		"expiry",
		"serialized",
	])("rejects %s policy substitution before a producer call", async (change) => {
		const f = await carriedBudget();
		const changed = { ...admission };
		if (change === "target") changed.targetId = "other-target";
		if (change === "grant") changed.consumerGrantId = "other-grant";
		if (change === "expiry") changed.expiresAtMs++;
		const path = change === "directory" ? await directory() : f.path;
		expect(
			() =>
				new NativeConsumerSession(
					{ callTool: f.callTool },
					changed,
					path,
					() => 2000,
					change === "serialized" ? JSON.parse(JSON.stringify(f.budget)) : f.budget,
				),
		).toThrow();
		expect(f.callTool).not.toHaveBeenCalled();
	});
	it("copies verifier evidence so later caller mutation cannot restore capacity", async () => {
		const f = await carriedBudget({ read: 80 });
		f.proof.consumed.read = 0;
		await f.session.acquire();
		await expect(f.session.read("url", {}, "already-exhausted")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		expect(f.callTool).toHaveBeenCalledOnce();
	});
	it.each([
		"drop-policy",
		"replace-policy",
		"omit-baseline",
	])("refuses %s rather than regenerating a fresh allowance", async (change) => {
		const f = await carriedBudget({}, true);
		await f.session.acquire();
		if (change === "drop-policy") await rm(join(f.path, "read-budget.json"));
		if (change === "replace-policy") {
			const record = JSON.parse(await readFile(join(f.path, "read-budget.json"), "utf8"));
			record.policyId = "e".repeat(64);
			await writeFile(join(f.path, "read-budget.json"), JSON.stringify(record));
		}
		if (change === "omit-baseline") await rm(join(f.path, f.baselineName));
		await expect(f.session.read("url", {}, "no-new-allowance")).rejects.toMatchObject({
			code: "native_read_budget_unqualified",
		});
		expect(f.callTool).toHaveBeenCalledOnce();
	});
	it("preserves failed reservations and denies restart without the original policy", async () => {
		const f = await carriedBudget();
		await f.session.acquire();
		f.callTool.mockRejectedValueOnce(new Error("uncertain observed read"));
		await expect(f.session.read("url", {}, "failed-original-read")).rejects.toBeDefined();
		await expect(
			new NativeConsumerSession({ callTool: f.callTool }, admission, f.path, () => 2000).acquire(),
		).rejects.toBeDefined();
		await expect(
			new NativeConsumerSession(
				{ callTool: f.callTool },
				admission,
				f.path,
				() => 2000,
				f.budget,
			).acquire(),
		).rejects.toBeDefined();
		expect(f.callTool).toHaveBeenCalledTimes(2);
	});
});

describe("sealed-r2 public consumer transport with synthetic producer", () => {
	it("allows the twenty-first read only under the exact carried80 Pro policy", async () => {
		const path = await directory();
		const budget = await qualifyNativeReadBudget(
			{
				receiptDigest: "a".repeat(64),
				producerSha256: "b".repeat(64),
				admissionDigest: nativeBudgetDigest(admission),
				expiresAtMs: admission.expiresAtMs,
				ledgerDirectory: path,
			},
			async (context) => ({
				amendment: nativeReadAmendment,
				contextDigest: nativeBudgetDigest(context),
				reservationDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
				consumed: { acquisition: 0, read: 18, control: 0, draft: 0, send: 2 },
			}),
			() => 2000,
		);
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : "url", args.operationKey)),
		);
		const session = new NativeConsumerSession({ callTool }, admission, path, () => 2000, budget);
		await session.acquire();
		for (let i = 0; i < 21; i++) await session.read("url", {}, `approved-read-${i}`);
		expect(callTool).toHaveBeenCalledTimes(22);
	});
	it("does not reuse an old completed operation identity as an independent observation", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : "url", args.operationKey);
			if (name === "browser_command") {
				d.operation.operationId = "reused-observation";
				d.targetObservation.operationId = "reused-observation";
				d.identity.operationId = "reused-observation";
				d.operation.ack.identity.operationId = "reused-observation";
				d.consumerAck.identity.operationId = "reused-observation";
			}
			return envelope(name, d);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await session.read("url", {}, "first-observation");
		await expect(session.read("url", {}, "independent-observation")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		await expect(session.read("url", {}, "retry-observation")).rejects.toBeDefined();
		expect(callTool).toHaveBeenCalledTimes(3);
	});
	it.each([
		"lost",
		"falseAck",
		"mismatch",
		"notRetained",
		"notReleased",
		"foreign",
	])("holds %s release result; original metadata is the only next operation", async (change) => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : "url", args.operationKey);
			if (name === "browser_close" || name === "browser_continue") {
				if (name === "browser_close" && change === "lost")
					throw new Error("synthetic timeout after possible release");
				const { result: _result, targetObservation: _target, consumerAck: _ack, ...stored } = d;
				const metadata: Record<string, unknown> = {
					...stored,
					state: "released",
					browserDisposition: "retained",
					requestedOperationKey: args.operationKey,
					matchingOperation: true,
					identityFreshness: "stored_completion",
				};
				if (name === "browser_close") {
					if (change === "falseAck") metadata.consumerAck = { kind: "closed" };
					if (change === "mismatch") metadata.matchingOperation = false;
					if (change === "notRetained") metadata.browserDisposition = "closed";
					if (change === "notReleased") metadata.state = "active";
					if (change === "foreign") metadata.taskId = "foreign";
				}
				return envelope(name, metadata);
			}
			return envelope(name, d);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await session.read("url", {}, "original-url-key");
		await expect(session.release("original-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(await session.originalReadback("original-url-key")).toMatchObject({
			state: "released",
			readbackOnly: true,
			pageObserved: false,
		});
		await expect(session.release("different-original-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		await expect(session.originalReadback("original-url-key")).rejects.toMatchObject({
			code: "consumer_operation_held",
		});
		expect(callTool).toHaveBeenCalledTimes(4);
	});
	it("releases a ref with unknown original history without clearing or replacing that history", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : "url", args.operationKey);
			if (name === "browser_command") throw new Error("uncertain original read");
			if (name === "browser_close") {
				const { result: _result, targetObservation: _target, consumerAck: _ack, ...stored } = d;
				return envelope(name, {
					...stored,
					state: "released",
					browserDisposition: "retained",
					requestedOperationKey: args.operationKey,
					matchingOperation: true,
					identityFreshness: "unavailable",
					identity: null,
					operation: { ...stored.operation, state: "unknown", ack: null },
				});
			}
			return envelope(name, d);
		});
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		await expect(session.read("url", {}, "original-url-key")).rejects.toBeDefined();
		expect(await session.release("original-url-key")).toMatchObject({
			operationState: "unknown",
			state: "released",
			identityFreshness: "unavailable",
		});
		await expect(session.acquire()).rejects.toBeDefined();
		await expect(
			makeSession({ callTool }, admission, dir, () => 2000).acquire(),
		).rejects.toBeDefined();
		expect(callTool).toHaveBeenCalledTimes(3);
	});
	it("explicitly releases only the acquired consumer ref and returns prior operation metadata", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : "url", args.operationKey);
			if (name === "browser_close") {
				const { result: _result, targetObservation: _target, consumerAck: _ack, ...metadata } = d;
				return envelope(name, {
					...metadata,
					state: "released",
					browserDisposition: "retained",
					requestedOperationKey: args.operationKey,
					matchingOperation: true,
					identityFreshness: "stored_completion",
				});
			}
			return envelope(name, d);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await session.read("url", {}, "original-url-key");
		expect(await session.release("original-url-key")).toMatchObject({
			state: "released",
			browserDisposition: "retained",
			pageObserved: false,
			operationKey: "original-url-key",
		});
		expect(callTool.mock.calls[2][0]).toEqual({
			name: "browser_close",
			arguments: { taskId: "synthetic-consumer-task", operationKey: "original-url-key" },
		});
		await expect(session.release("original-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		await expect(session.read("url", {}, "after-release-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(3);
	});
	it("acquires once in consumer mode and retains the exact task/control on the same client", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		expect(await session.read("url", {}, "synthetic-url-key")).toEqual({
			url: "https://chatgpt.com/c/synthetic",
		});
		expect(callTool.mock.calls[0][0]).toEqual({
			name: "browser_open",
			arguments: {
				profileMode: "consumer",
				consumerGrantId: admission.consumerGrantId,
				profileCapability: admission.profileCapability,
				taskKey: admission.taskKey,
				profile: admission.profileId,
				url: "https://chatgpt.com/",
				serviceName: "AuraCall",
				agentName: "frontend-mcp",
				taskName: "auracall-e2e-20261021",
			},
		});
		expect(callTool.mock.calls[1][0]).toEqual({
			name: "browser_command",
			arguments: {
				taskId: "synthetic-consumer-task",
				operationKey: "synthetic-url-key",
				action: "url",
				params: {},
			},
		});
		await expect(session.acquire()).rejects.toMatchObject({ code: "consumer_acquisition_held" });
		expect(callTool).toHaveBeenCalledTimes(2);
	});
	it.each([
		"task",
		"control",
		"grant",
		"key",
		"action",
		"ack",
		"state",
		"replay",
		"queued",
	])("holds %s mismatch without input, new-key retry or private diagnostic disclosure", async (change) => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : args.action, args.operationKey);
			if (name !== "browser_open") {
				if (change === "task") d.taskId = "foreign-task";
				if (change === "control") d.controlRef = "foreign-control";
				if (change === "grant") d.consumerGrantId = "foreign-grant";
				if (change === "key") d.operation.operationKey = "foreign-key";
				if (change === "action") d.operation.action = "fill";
				if (change === "ack") d.consumerAck.completedAtMs++;
				if (change === "state") d.operation.state = "claimed";
				if (change === "replay") return envelope(name, { ...d, readbackOnly: true });
				if (change === "queued") return envelope(name, { jobId: "synthetic-job", state: "queued" });
			}
			return envelope(name, d);
		});
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		await expect(session.read("url", {}, "original-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		await expect(session.read("url", {}, "new-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(session)).not.toContain(admission.profileCapability);
		for (const file of await readdir(dir))
			expect(await readFile(join(dir, file), "utf8")).not.toContain(admission.profileCapability);
	});
	it.each([
		"fill",
		"click",
	])("requires an exact Boolean %s acknowledgment, never a reply", async (action) => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : args.action, args.operationKey);
			return envelope(
				name,
				name === "browser_open"
					? d
					: {
							...d,
							result: action === "fill" ? { filled: "true" } : { clicked: "true" },
						},
			);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await expect(
			action === "fill"
				? session.fill("synthetic text", "boolean-fill-key")
				: session.send("boolean-send-key"),
		).rejects.toMatchObject({ code: "consumer_completion_invalid" });
		await expect(session.read("url", {}, "after-invalid-ack")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("counts the original reservations across restart, refuses scripts and never renews a completed key", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		for (const action of ["evaluate", "focus", "probe", "ui_action", "upload", "script"]) {
			await expect(session.read(action as "url", {}, "unsupported-key")).rejects.toMatchObject({
				code: "consumer_arguments_invalid",
			});
		}
		expect(callTool).toHaveBeenCalledOnce();
		for (let i = 0; i < 20; i++) await session.read("url", {}, `native-read-${i}`);
		await expect(session.read("url", {}, "native-read-new")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		await expect(session.read("url", {}, "native-read-0")).rejects.toMatchObject({
			code: "consumer_operation_held",
		});
		const replacement = makeSession({ callTool }, admission, dir, () => 2000);
		await expect(replacement.acquire()).rejects.toMatchObject({
			code: "consumer_acquisition_held",
		});
		expect(callTool).toHaveBeenCalledTimes(21);
	});
	it("holds a torn completion file without treating its filename as proof of completion", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		const complete = (await readdir(dir)).find((n) => n.startsWith("completed-"));
		expect(complete).toBeDefined();
		if (!complete) throw new Error("Expected the synthetic completed acquisition.");
		await writeFile(join(dir, complete), '{"completed":', { mode: 0o600 });
		await expect(session.read("url", {}, "native-after-tear")).rejects.toMatchObject({
			code: "consumer_ledger_invalid",
		});
		expect(callTool).toHaveBeenCalledOnce();
	});
	it("reads only the original operation metadata after uncertainty, never promoting its ACK to a reply or unholding input", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			if (name === "browser_open") return envelope(name, data());
			if (name === "browser_continue") {
				const {
					targetObservation: _observation,
					result: _result,
					consumerAck: _ack,
					...metadata
				} = data("url", args.operationKey);
				return envelope(name, {
					...metadata,
					identityFreshness: "stored_completion",
					requestedOperationKey: args.operationKey,
					matchingOperation: true,
				});
			}
			throw new Error(admission.profileCapability);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await expect(session.read("url", {}, "original-unknown")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(await session.originalReadback("original-unknown")).toMatchObject({
			operationState: "completed",
			readbackOnly: true,
		});
		expect(callTool.mock.calls[2][0]).toEqual({
			name: "browser_continue",
			arguments: { taskId: "synthetic-consumer-task", operationKey: "original-unknown" },
		});
		await expect(session.send("new-send-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(3);
	});
});
