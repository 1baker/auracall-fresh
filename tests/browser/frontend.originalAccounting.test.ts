import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	nativeBudgetDigest,
	qualifyNativeReadBudget,
} from "../../src/browser/frontends/nativeReadBudget.js";
import * as runtimeModule from "../../src/browser/frontends/nativeRuntime.js";
import { openOriginalAccounting } from "../../src/browser/frontends/originalAccounting.js";
import {
	type OriginalAccountingSelection,
	type OriginalFilePin,
	originalSha,
	originalWriters,
	readOriginalHistory,
} from "../../src/browser/frontends/originalAccountingHistory.js";
import { startOriginalAccountedNativeFrontendHost } from "../../src/mcp/http/nativeHost.js";

const rootSource = process.env.AURACALL_PUBLIC_CARRIER_SOURCE;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function pin(path: string) {
	const s = await stat(path);
	return { path, dev: s.dev, ino: s.ino };
}
async function file(path: string, value: unknown): Promise<OriginalFilePin> {
	await writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
	return { ...(await pin(path)), sha256: originalSha(await readFile(path)) };
}
async function fixture(reads = 1, unknown = false) {
	if (!rootSource) throw new Error("public frozen fixture source required");
	const root = await mkdtemp(join(homedir(), ".auracall-original-accounting-test-"));
	const context = {
		receiptDigest: "1".repeat(64),
		producerSha256: "2".repeat(64),
		expiresAtMs: Date.now() + 90000,
	};
	const identity = await file(join(root, "identity"), {
		testOnly: "synthetic original identity, never production",
	});
	await file(join(root, "test-context.json"), context);
	const implementation = await file(join(root, "writer-source"), {
		testOnly: "five cooperating synthetic writers",
	});
	const target = join(root, "target"),
		legacy = join(root, "legacy");
	await mkdir(target, { mode: 0o700 });
	await mkdir(legacy, { mode: 0o700 });
	const reservations: { name: string; sha256: string }[] = [];
	for (let n = 0; n < reads; n++) {
		const row = { key: `historical-read-${n}`, bucket: "read", intentDigest: "3".repeat(64) },
			name = `reservation-${nativeBudgetDigest(row.key)}.json`;
		const p = await file(join(legacy, name), row);
		reservations.push({ name, sha256: p.sha256 });
		await file(join(legacy, name.replace("reservation-", "completed-")), {
			...row,
			completed: true,
		});
	}
	const manual = await file(join(root, "manual.json"), {
		job_id: "browser-owner-chatgpt-roundtrip-20261023",
		limits: {
			// biome-ignore lint/style/useNamingConvention: exact existing canonical job field
			shared_total_Send_cap: 2,
		},
		intent_and_reply_records: {
			effects: [1, 2].map((step) => ({
				step,
				request_id: `original-${step}`,
				phase: "FULL_REPLY_SAVED_AND_READBACK_VERIFIED",
			})),
		},
	});
	const proposal = await file(join(root, "proposal.json"), {
		job_id: "proposal-v7c-pro-review-20261023",
		provider_request_created: false,
		dispatch_claimed_at: null,
	});
	const eventSources = [];
	for (const writer of ["stock", "browser-owner"] as const)
		eventSources.push({
			kind: "events",
			writer,
			file: await file(join(root, `${writer}.json`), {
				schema: "auracall.original-counted-events.v1",
				writer,
				originalScopeDigest: "f".repeat(64),
				complete: true,
				gaps: [],
				events: [],
			}),
		});
	const coverage = await file(join(root, "coverage.json"), {
		schema: "auracall.original-accounting-coverage.v1",
		originalScopeDigest: "f".repeat(64),
		status: unknown ? "UNKNOWN" : "COMPLETE",
		gaps: unknown ? ["original read trace not enumerated"] : [],
		sources: [
			{ kind: "native-ledger", writer: "native", directory: await pin(legacy), reservations },
			{ kind: "manual-roundtrip", writer: "human-relay", file: manual },
			{ kind: "proposal-job", writer: "proposal", file: proposal },
			...eventSources,
		],
	});
	const writers = [];
	for (const writer of originalWriters) {
		const p = await file(join(root, `${writer}.lock`), {});
		writers.push({ writer, lock: { path: p.path, dev: p.dev, ino: p.ino }, implementation });
	}
	const child = spawn(
		"python3",
		[
			fileURLToPath(new URL("./fixtures/originalAccountingGuard.py", import.meta.url)),
			rootSource,
			root,
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	) as ChildProcessWithoutNullStreams;
	let errors = "";
	child.stderr.on("data", (d) => {
		errors += d;
	});
	const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
	const first = await lines.next();
	if (first.done) throw new Error(errors || "fixture guard did not start");
	const processIdentity = JSON.parse(first.value);
	const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
	cleanups.push(async () => {
		child.stdin.end();
		const timer = setTimeout(() => child.kill(), 2000);
		await closed;
		clearTimeout(timer);
		await rm(root, { recursive: true, force: true });
	});
	async function command(value: string) {
		child.stdin.write(`${JSON.stringify(value)}\n`);
		const response = await lines.next();
		if (response.done || JSON.parse(response.value).ok !== true) throw new Error("fixture lost");
	}
	const selection: OriginalAccountingSelection = {
		directory: await pin(root),
		identity,
		coverage,
		originalScopeDigest: "f".repeat(64),
		guard: {
			...processIdentity,
			claim: await pin(join(root, ".p266-original-authority.claim")),
			journal: await pin(join(root, ".p266-original-authority.events")),
		},
		writers,
		targetLedger: await pin(target),
	};
	const guard = {
		assert_current: vi.fn(async () => command("check")),
		checkpoint: vi.fn(async () => {}),
		attach_read_budget_context: vi.fn(async () => {}),
	};
	const writer = {
		protect: async <T>(_op: unknown, run: () => Promise<T>) => run(),
		assertCurrent: vi.fn(async () => command("check")),
	};
	const hold = vi.fn();
	return {
		root,
		target,
		legacy,
		selection,
		context,
		guard,
		writer,
		hold,
		command,
		open: async () => {
			const actor = await openOriginalAccounting(selection, { context, guard, writer, hold });
			cleanups.unshift(() => actor.closeReadHandle());
			return actor;
		},
		budget: { ...context, admissionDigest: "4".repeat(64), ledgerDirectory: target },
	};
}

describe.skipIf(!rootSource)("original accounting with actual synthetic POSIX guard locks", () => {
	it("counts original native rows and the two canonical Sends; commits two witness reads before invocation", async () => {
		const f = await fixture();
		const a = await f.open();
		await a.reserveObservationReads(f.context, 2);
		await a.reserveObservationReads(f.context, 2);
		const witness = vi.fn(async () => {
			expect(
				JSON.parse(
					await readFile(join(f.root, ".auracall-original-observer-reservation.json"), "utf8"),
				).reads,
			).toBe(2);
			return { synthetic: true };
		});
		await a.observe(f.context, "a".repeat(64), witness);
		const evidence = await a.originalUsage(f.budget);
		expect(evidence.consumed).toEqual({ acquisition: 0, read: 3, control: 0, draft: 0, send: 2 });
		expect(evidence.reservationDigest).toBe(nativeBudgetDigest([]));
		await expect(qualifyNativeReadBudget(f.budget, a.originalUsage)).resolves.toBeDefined();
		await expect(a.observe(f.context, "a".repeat(64), witness)).rejects.toBeDefined();
		expect(witness).toHaveBeenCalledOnce();
	});
	it("rejects incomplete original coverage before writing any reservation", async () => {
		const f = await fixture(1, true);
		await expect(f.open()).rejects.toBeDefined();
		expect((await readdir(f.root)).some((n) => n.startsWith(".auracall-"))).toBe(false);
	});
	it("an empty new target cannot hide a pending original reservation", async () => {
		const f = await fixture();
		const name = (await readdir(f.legacy)).find((n) => n.startsWith("completed-")) as string;
		await unlink(join(f.legacy, name));
		await expect(f.open()).rejects.toBeDefined();
		expect(await readdir(f.target)).toEqual([]);
	});
	it("retains both charges and the dispatch marker after a failed witness", async () => {
		const f = await fixture();
		const a = await f.open();
		await a.reserveObservationReads(f.context, 2);
		await expect(
			a.observe(f.context, "a".repeat(64), async () => {
				throw Error("uncertain public fixture");
			}),
		).rejects.toBeDefined();
		expect(
			JSON.parse(
				await readFile(join(f.root, ".auracall-original-observer-reservation.json"), "utf8"),
			).reads,
		).toBe(2);
		expect(await readdir(f.root)).toContain(".auracall-original-observer-dispatched.json");
		expect(await readdir(f.root)).not.toContain(".auracall-original-observer-returned.json");
		await expect(a.originalUsage(f.budget)).rejects.toBeDefined();
	});
	it("refuses lost relevant writer exclusion before mutation", async () => {
		const f = await fixture();
		const a = await f.open();
		await f.command("unlock");
		await expect(a.reserveObservationReads(f.context, 2)).rejects.toBeDefined();
		expect(await readdir(f.root)).not.toContain(".auracall-original-observer-reservation.json");
	});
	it("does not create authority when original identity is missing", async () => {
		const f = await fixture();
		await unlink(f.selection.identity.path);
		await expect(f.open()).rejects.toBeDefined();
		expect(await readdir(f.root)).not.toContain("identity");
	});
	it("cannot reset or overwrite a prior observation reservation on another instance", async () => {
		const f = await fixture();
		const a = await f.open();
		await a.reserveObservationReads(f.context, 2);
		const before = await readFile(join(f.root, ".auracall-original-observer-reservation.json"));
		const b = await f.open();
		await expect(b.reserveObservationReads(f.context, 2)).rejects.toBeDefined();
		expect(await readFile(join(f.root, ".auracall-original-observer-reservation.json"))).toEqual(
			before,
		);
	});
	it("requires capacity for BOTH observer reads, without consuming another Send", async () => {
		const f = await fixture(79);
		const a = await f.open();
		await expect(a.reserveObservationReads(f.context, 2)).rejects.toBeDefined();
		expect(await readdir(f.root)).not.toContain(".auracall-original-observer-reservation.json");
	});
	it("refuses an omitted reservation and a substituted guard process", async () => {
		const f = await fixture();
		await file(join(f.legacy, `reservation-${nativeBudgetDigest("omitted-read")}.json`), {
			key: "omitted-read",
			bucket: "read",
			intentDigest: "b".repeat(64),
		});
		await expect(readOriginalHistory(f.selection)).rejects.toBeDefined();
		f.selection.guard.startTime = "0";
		await expect(f.open()).rejects.toBeDefined();
	});
	it("does not reuse the original native directory as the new target", async () => {
		const f = await fixture();
		f.selection.targetLedger = await pin(f.legacy);
		await expect(f.open()).rejects.toBeDefined();
	});
	it.each([
		"already-consumed",
		"incomplete",
	])("checks %s target charges BEFORE reserving or observing", async (kind) => {
		const f = await fixture(kind === "already-consumed" ? 78 : 1);
		const row = { key: "prior-target-read", bucket: "read", intentDigest: "a".repeat(64) },
			name = `reservation-${nativeBudgetDigest(row.key)}.json`;
		await file(join(f.target, name), row);
		if (kind === "already-consumed")
			await file(join(f.target, name.replace("reservation-", "completed-")), {
				...row,
				completed: true,
			});
		await expect(
			(async () => {
				const actor = await f.open();
				await actor.reserveObservationReads(f.context, 2);
			})(),
		).rejects.toBeDefined();
		expect(await readdir(f.root)).not.toContain(".auracall-original-observer-reservation.json");
	});
	it("refuses a deleted observation receipt rather than forgetting its charges", async () => {
		const f = await fixture(),
			a = await f.open();
		await a.reserveObservationReads(f.context, 2);
		await a.observe(f.context, "a".repeat(64), async () => ({ synthetic: true }));
		await unlink(join(f.root, ".auracall-original-observer-returned.json"));
		await expect(a.originalUsage(f.budget)).rejects.toBeDefined();
		expect(await readdir(f.root)).toContain(".auracall-original-observer-reservation.json");
	});
	it("keeps the one outer writer and checks actual exclusion before a ledger callback", async () => {
		const f = await fixture();
		let roots = 0;
		f.writer.protect = async (_operation, run) => {
			roots++;
			return run();
		};
		const a = await f.open();
		const run = vi.fn(async () => Symbol("opaque-result"));
		const op = {
			original: f.context,
			dispatch: { kind: "acquire" as const },
			ledgerDirectory: f.target,
			admissionDigest: "4".repeat(64),
			expiresAtMs: f.context.expiresAtMs,
			key: "acquire",
			bucket: "acquisition" as const,
			intentDigest: "3".repeat(64),
			originalKeys: [],
			readReserve: 0,
		};
		await expect(a.writer.protect(op, run)).resolves.toEqual(expect.any(Symbol));
		expect(roots).toBe(1);
		expect(run).toHaveBeenCalledOnce();
		await f.command("unlock");
		await expect(a.writer.protect(op, run)).rejects.toBeDefined();
		expect(run).toHaveBeenCalledOnce();
	});
	it.each([
		"unknown-history",
		"missing-receiver",
	])("assembled private host refuses %s before SDK acquisition", async (reason) => {
		const f = await fixture(1, reason === "unknown-history");
		const input = new PassThrough(),
			output = new PassThrough();
		const acquire = vi.spyOn(runtimeModule, "startOwnNativeRuntime");
		const protocol = "p266.original-callback-carrier.v1";
		input.on("data", (raw) => {
			const frame = JSON.parse(raw.toString());
			if (frame.method === "binding.hold") return;
			void f
				.command("check")
				.then(() =>
					output.write(
						`${JSON.stringify({ protocol, type: "return", id: frame.id, ok: true, result: null })}\n`,
					),
				);
		});
		const observe = vi.fn();
		await expect(
			startOriginalAccountedNativeFrontendHost({
				input: { kind: "auracall-own-sdk-runtime-input" },
				transport: {
					input,
					output,
					context: f.context,
					target: {
						profileId: "synthetic",
						browserId: "synthetic",
						tabId: "synthetic",
						targetId: "synthetic",
					},
					timeoutMs: 1000,
				},
				accounting: {
					selection: f.selection,
					observe,
					ownerAuthority: {},
					producerTaskId: "synthetic-producer",
				},
				intent: {
					requestId: "synthetic",
					requestFingerprint: "a".repeat(64),
					promptDigest: "b".repeat(64),
					previousRequestId: null,
				},
				http: {
					mode: "frontend",
					port: 12345,
					routeIds: ["synthetic"],
					resource: "https://fixture.invalid/mcp",
					issuer: "https://fixture.invalid",
					jwksUri: "https://fixture.invalid/jwks",
					subject: "synthetic",
				},
			}),
		).rejects.toBeDefined();
		expect(acquire).not.toHaveBeenCalled();
		expect(observe).not.toHaveBeenCalled();
		expect(await readdir(f.root)).not.toContain(".auracall-original-observer-reservation.json");
		input.end();
		output.end();
	});
});
