import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { NativeLedgerWriter } from "./nativeLedgerWriter.js";
import type { NativeOriginalGuard } from "./nativeOperator.js";
import {
	type NativeReadBudgetContext,
	nativeBudgetDigest,
	nativeReadAmendment,
} from "./nativeReadBudget.js";
import type { NativeRuntimeLifetimeContext } from "./nativeRuntime.js";
import {
	openProducerPhaseAccounting,
	type OriginalProducerPhaseBindings,
} from "./nativeProducerAccounting.js";
import {
	accountingRefusal,
	type OriginalAccountingSelection,
	originalSha,
	readNativeReservations,
	readOriginalHistory,
	verifyOriginalGuard,
	verifyOriginalPath,
} from "./originalAccountingHistory.js";

const reservationName = ".auracall-original-observer-reservation.json";
const dispatchName = ".auracall-original-observer-dispatched.json";
const completeName = ".auracall-original-observer-returned.json";
type Base = Omit<NativeRuntimeLifetimeContext, "nativeTask">;
export interface OriginalAccountingBindings {
	context: Base;
	guard: NativeOriginalGuard;
	writer: NativeLedgerWriter;
	hold(): void;
	now?: () => number;
}
export interface PreproducerAccountingBindings extends Omit<OriginalAccountingBindings, "context"> {
	preproducer: OriginalProducerPhaseBindings;
}

/** Select the pre-existing ORIGINAL lineage and real live guard. Never creates
 * an authority/coverage document, native ledger, process, lock or capacity. The
 * returned supplier does real filesystem accounting; it has no verifier callback.
 * Source-only construction must not be invoked on private state before admission. */
export async function openOriginalAccounting(
	selection: OriginalAccountingSelection,
	bindings: OriginalAccountingBindings | PreproducerAccountingBindings,
) {
	const selected = structuredClone(selection);
	const preproducer = "preproducer" in bindings ? bindings.preproducer : undefined;
	let base: Readonly<Base> | undefined =
		"context" in bindings ? Object.freeze({ ...bindings.context }) : undefined;
	if (base && Object.keys(base).sort().join(",") !== "expiresAtMs,producerSha256,receiptDigest")
		accountingRefusal();
	const originalContext = preproducer ? structuredClone(preproducer.binding) : base;
	if (!originalContext) accountingRefusal();
	const guard = bindings.guard.assert_current.bind(bindings.guard),
		protect = bindings.writer.protect.bind(bindings.writer),
		assertWriter = bindings.writer.assertCurrent.bind(bindings.writer),
		notify = bindings.hold.bind(bindings),
		now = bindings.now ?? Date.now;
	let held = false,
		reserved = false,
		witnessed = false,
		witnessBusy = false;
	let lastNow = 0;
	let root: Awaited<ReturnType<typeof open>> | undefined;
	let dispatchRecord: object | undefined, returnRecord: object | undefined;
	const paths = new Set([selected.directory.path, selected.targetLedger.path]);
	if (paths.size !== 2) accountingRefusal();
	const contextDigest = () => nativeBudgetDigest(requireBase());
	let producer: Awaited<ReturnType<typeof openProducerPhaseAccounting>> | undefined;
	let nativeCommitted = false;
	let baseline: Awaited<ReturnType<typeof readOriginalHistory>>;
	let targetSnapshot: string | undefined;
	function current() {
		preproducer?.current();
		const time = now();
		if (
			held ||
			!Number.isSafeInteger(time) ||
			time < lastNow ||
			time >=
				(base?.expiresAtMs ??
					(preproducer?.nativeLinkPending()
						? Number.MAX_SAFE_INTEGER
						: (preproducer?.binding.expiresAtMs ?? 0)))
		)
			accountingRefusal();
		lastNow = time;
	}
	function hold(): never {
		poison();
		return accountingRefusal();
	}
	function poison() {
		held = true;
		notify();
	}
	function original(context: NativeRuntimeLifetimeContext) {
		const base = requireBase();
		if (
			context.receiptDigest !== base.receiptDigest ||
			context.producerSha256 !== base.producerSha256 ||
			context.expiresAtMs !== base.expiresAtMs
		)
			hold();
	}
	function requireBase(): Readonly<Base> {
		current();
		if (!base) return hold();
		return base;
	}
	async function check() {
		current();
		if (preproducer) await preproducer.assertCurrent();
		else await guard(requireBase());
		current();
		if (preproducer && nativeCommitted) {
			await guard(requireBase());
			current();
		}
		await verifyOriginalGuard(selected, originalContext);
		current();
		if (root) {
			const s = await root.stat();
			current();
			if (s.dev !== selected.directory.dev || s.ino !== selected.directory.ino) hold();
		}
		if (preproducer) await preproducer.assertCurrent();
		else await guard(requireBase());
		current();
	}
	async function history() {
		await check();
		const result = await readOriginalHistory(selected);
		current();
		if (result.uncertain) accountingRefusal("original_accounting_history_unknown");
		if (baseline && nativeBudgetDigest(result) !== nativeBudgetDigest(baseline)) hold();
		await check();
		return result;
	}
	function fdPath(name: string) {
		if (!root) return accountingRefusal();
		return `/proc/self/fd/${root.fd}/${name}`;
	}
	async function readOwned(name: string) {
		await check();
		const fd = await open(
			fdPath(name),
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const s = await fd.stat();
			current();
			if (!s.isFile() || s.uid !== process.getuid?.() || s.mode & 0o077 || s.size > 16384) hold();
			const raw = await fd.readFile("utf8"),
				after = await fd.stat(),
				named = await lstat(fdPath(name));
			current();
			if (
				s.ino !== after.ino ||
				s.size !== after.size ||
				s.mtimeMs !== after.mtimeMs ||
				s.ctimeMs !== after.ctimeMs ||
				named.ino !== s.ino ||
				named.dev !== s.dev ||
				named.isSymbolicLink() ||
				Buffer.byteLength(raw) !== s.size
			)
				hold();
			await check();
			return JSON.parse(raw);
		} finally {
			await fd.close();
		}
	}
	async function writeOnce(name: string, value: unknown) {
		await check();
		const file = await open(
			fdPath(name),
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			await check();
			await file.writeFile(`${JSON.stringify(value)}\n`);
			current();
			await file.sync();
			current();
			await root?.sync();
			current();
			await check();
		} finally {
			await file.close();
		}
		// Partial, failed or lost acknowledgment leaves the original file in place.
	}
	const record = () =>
		Object.freeze({
			schema: "auracall.original-observer-reservation.v1",
			originalScopeDigest: selected.originalScopeDigest,
			coverageDigest: selected.coverage.sha256,
			contextDigest: contextDigest(),
			context: requireBase(),
			reads: 2,
			phase: "RESERVED",
		});
	async function reservation() {
		if (
			!reserved ||
			nativeBudgetDigest(await readOwned(reservationName)) !== nativeBudgetDigest(record())
		)
			hold();
	}
	async function durable() {
		await producer?.durable();
		current();
		if (reserved) await reservation();
		for (const [name, expected] of [
			[dispatchName, dispatchRecord],
			[completeName, returnRecord],
		] as const) {
			if (expected && nativeBudgetDigest(await readOwned(name)) !== nativeBudgetDigest(expected))
				hold();
		}
	}
	async function targetBeforeObservation(prior: typeof baseline) {
		await producer?.durable();
		current();
		await check();
		const target = await readNativeReservations(selected.targetLedger);
		current();
		if (
			target.uncertain ||
			target.names.includes("read-budget.json") ||
			target.names.includes("operation.lock")
		)
			hold();
		const digest = nativeBudgetDigest(target.snapshot);
		if (targetSnapshot !== undefined && targetSnapshot !== digest) hold();
		const producerCosts = producer?.consumed() ?? { read: 0, control: 0 };
		const consumed = {
			...prior.consumed,
			read: prior.consumed.read + producerCosts.read + 2,
			control: prior.consumed.control + producerCosts.control,
		};
		for (const row of target.rows) consumed[row.bucket]++;
		if (
			consumed.send !== 2 ||
			consumed.read > 80 ||
			consumed.control > 6 ||
			consumed.acquisition > 1 ||
			consumed.draft > 2
		)
			hold();
		await check();
		await producer?.durable();
		current();
		return { consumed, digest };
	}
	try {
		await check();
		baseline = await history();
		if (preproducer && !baseline.isolation) accountingRefusal("producer_isolated_history_required");
		await verifyOriginalPath(selected.targetLedger, true);
		current();
		root = await open(
			selected.directory.path,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
		);
		await check();
		if (preproducer) {
			producer = await openProducerPhaseAccounting(selected, preproducer, {
				check,
				current,
				writeOnce,
				readOwned,
				consumed: baseline.consumed,
			});
			current();
		}
	} catch {
		if (root) await root.close();
		return hold();
	}
	async function guarded<T>(
		context: NativeRuntimeLifetimeContext,
		operation: () => Promise<T>,
	): Promise<T> {
		try {
			original(context);
			await history();
			await durable();
			const result = await operation();
			current();
			await check();
			await producer?.durable();
			current();
			return result;
		} catch {
			return hold();
		}
	}
	const protectedWriter: NativeLedgerWriter = {
		protect: (operation, run) => protect(operation, () => guarded(operation.original, run)),
		assertCurrent: async (operation, stage) => {
			try {
				original(operation.original);
				await check();
				await assertWriter(operation, stage);
				current();
				await check();
				await durable();
			} catch {
				return hold();
			}
		},
	};
	return Object.freeze({
		poison,
		/** SAME actor, directory FD and baseline; never reopens a receipt-bound actor. */
		producerPhase: producer,
		commitNativeContext(context: Base) {
			current();
			if (!producer || base || nativeCommitted || !producer.linkedContextMatches(context))
				return hold();
			base = Object.freeze({ ...context });
			nativeCommitted = true;
			current();
		},
		writer: Object.freeze(protectedWriter),
		guarded,
		validateFiniteApproval(evidence: unknown) {
			if (
				baseline.isolation &&
				(!evidence ||
					typeof evidence !== "object" ||
					!("approvalDigest" in evidence) ||
					evidence.approvalDigest !== baseline.isolation.approvalDigest)
			)
				hold();
		},
		/** Only this supplier's read-only directory FD. This holds the participant;
		 * it releases NO authority lock, browser reference, SDK or durable record. */
		async closeReadHandle() {
			held = true;
			notify();
			const fd = root;
			root = undefined;
			await fd?.close();
		},
		async reserveObservationReads(context: Base, reads: 2) {
			try {
				original(context);
				if (reads !== 2) hold();
				await history();
				if (reserved) {
					await reservation();
					return;
				}
				const target = await targetBeforeObservation(baseline);
				targetSnapshot = target.digest;
				await writeOnce(reservationName, record());
				reserved = true;
				await reservation();
			} catch {
				return hold();
			}
		},
		async observe(
			context: Base,
			nonce: string,
			witness: (context: Base, nonce: string) => Promise<unknown>,
		) {
			try {
				original(context);
				if (witnessBusy || witnessed || !/^[a-f0-9]{64}$/.test(nonce)) hold();
				await reservation();
				await history();
				await targetBeforeObservation(baseline);
				witnessBusy = true;
				dispatchRecord = Object.freeze({
					schema: "auracall.original-observer-dispatch.v1",
					contextDigest: contextDigest(),
					nonce,
					reservationDigest: nativeBudgetDigest(record()),
				});
				await writeOnce(dispatchName, dispatchRecord);
				await check();
				const result = await witness(requireBase(), nonce);
				current();
				await check();
				returnRecord = Object.freeze({
					schema: "auracall.original-observer-return.v1",
					contextDigest: contextDigest(),
					nonce,
					resultDigest: originalSha(JSON.stringify(result)),
				});
				await writeOnce(completeName, returnRecord);
				witnessed = true;
				witnessBusy = false;
				return result;
			} catch {
				return hold();
			}
		},
		async originalUsage(context: NativeReadBudgetContext) {
			try {
				original(context);
				if (!witnessed || context.ledgerDirectory !== selected.targetLedger.path) hold();
				await durable();
				const prior = await history();
				const target = await targetBeforeObservation(prior);
				return {
					amendment: nativeReadAmendment,
					...prior.isolation,
					contextDigest: nativeBudgetDigest(context),
					reservationDigest: target.digest,
					consumed: target.consumed,
				};
			} catch {
				return hold();
			}
		},
	});
}
