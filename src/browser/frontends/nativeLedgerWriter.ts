import type { NativeRuntimeDispatch, NativeRuntimeLifetimeContext } from "./nativeRuntime.js";
import { FrontendError } from "./types.js";

export type NativeLedgerBucket = "acquisition" | "read" | "control" | "draft" | "send";
export type NativeLedgerCheck = "mutation" | "effect" | "cleanup";
export interface NativeLedgerOperation {
	readonly original: NativeRuntimeLifetimeContext;
	readonly dispatch: NativeRuntimeDispatch;
	readonly ledgerDirectory: string;
	readonly admissionDigest: string;
	readonly expiresAtMs: number;
	readonly key: string;
	readonly bucket: NativeLedgerBucket;
	readonly intentDigest: string;
	readonly originalKeys: readonly string[];
	readonly readReserve: number;
}
/** Real original-authority participation, not a local lock or completeness marker.
 * protect is the ONE phase driver for the complete ledger transaction. The
 * operator binds original lineage/all cooperating writers and current authority.
 * assertCurrent revalidates that SAME held participant; it must not checkpoint
 * a second driver, manufacture coverage, reserve quota again or reobserve.
 * cleanup may permit only known owned lock cleanup; uncertainty must refuse.
 */
export interface NativeLedgerWriter {
	protect<T>(operation: NativeLedgerOperation, run: () => Promise<T>): Promise<T>;
	assertCurrent(operation: NativeLedgerOperation, stage: NativeLedgerCheck): Promise<void>;
}
export function requireNativeLedgerWriter(writer?: NativeLedgerWriter): NativeLedgerWriter {
	if (!writer || typeof writer.protect !== "function" || typeof writer.assertCurrent !== "function")
		throw new FrontendError(
			"native_ledger_writer_required",
			"Original writer participation is required.",
		);
	return Object.freeze({
		protect: writer.protect.bind(writer),
		assertCurrent: writer.assertCurrent.bind(writer),
	});
}
