import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { FrontendError } from "./types.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const contextSchema = z
	.object({
		receiptDigest: hash,
		producerSha256: hash,
		admissionDigest: hash,
		expiresAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		ledgerDirectory: z
			.string()
			.min(1)
			.max(4096)
			.refine((p) => isAbsolute(p) && resolve(p) === p && !p.includes("\0")),
	})
	.strict();
export type NativeReadBudgetContext = Readonly<z.infer<typeof contextSchema>>;
export const nativeReadAmendment = "same-p266-pro-only-063a5c60-additional60";
export const isolatedAcceptanceRun = "p266-isolated-acceptance-20261027-2663ec8f";
export const isolatedAcceptanceApproval =
	"2663ec8f067a3dd531c6ee2934cf86072d3d1bbccff6ca85b926f06f3bc821d5";
const originalEvidenceSchema = z
	.object({
		amendment: z.literal(nativeReadAmendment),
		contextDigest: hash,
		reservationDigest: hash,
		consumed: z
			.object({
				acquisition: count.max(1),
				read: count.max(80),
				control: count.max(6),
				draft: count.max(2),
				send: z.literal(2),
			})
			.strict(),
	})
	.strict();
// The explicitly approved new run has its own read/control trace. Old Sends stay
// consumed and old read history stays UNKNOWN; neither becomes fresh headroom.
const evidenceSchema = z.union([
	originalEvidenceSchema,
	originalEvidenceSchema.extend({
		amendment: z.literal(isolatedAcceptanceRun),
		approvalDigest: z.literal(isolatedAcceptanceApproval),
		historicalReadUsage: z.literal("UNKNOWN"),
	}),
]);
export type NativeReadBudgetEvidence = z.infer<typeof evidenceSchema>;
export interface NativeReadBudget {
	readonly kind: "auracall-native-pro-read-budget";
}
interface QualifiedBudget {
	context: NativeReadBudgetContext;
	evidence: NativeReadBudgetEvidence;
}
const qualified = new WeakMap<NativeReadBudget, QualifiedBudget>();
const currentReservations = new WeakMap<NativeReadBudget, string>();
export const nativeBudgetDigest = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
function refuse(): never {
	throw new FrontendError(
		"native_read_budget_unqualified",
		"Original native read accounting is not qualified.",
	);
}
function fresh(expires: number, now: () => number) {
	const time = now();
	return Number.isSafeInteger(time) && time >= 0 && expires > time;
}
async function privateJson(path: string) {
	const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await fd.stat();
		if (
			!stat.isFile() ||
			stat.size > 16384 ||
			stat.mode & 0o077 ||
			(process.getuid && stat.uid !== process.getuid())
		)
			refuse();
		const raw = await fd.readFile("utf8");
		const after = await fd.stat();
		if (
			after.size !== stat.size ||
			after.mtimeMs !== stat.mtimeMs ||
			after.ctimeMs !== stat.ctimeMs ||
			Buffer.byteLength(raw) !== stat.size
		)
			refuse();
		return { raw, value: JSON.parse(raw) };
	} finally {
		await fd.close();
	}
}
/** Qualification reads only original private accounting metadata; no reservation,
 * completion or policy file is created. Incomplete originals cannot start a client.
 */
async function verifySnapshot(
	context: NativeReadBudgetContext,
	evidence: NativeReadBudgetEvidence,
) {
	const stat = await lstat(context.ledgerDirectory);
	if (
		(await realpath(context.ledgerDirectory)) !== context.ledgerDirectory ||
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		stat.mode & 0o077 ||
		(process.getuid && stat.uid !== process.getuid())
	)
		refuse();
	const entries = await readdir(context.ledgerDirectory);
	if (entries.includes("read-budget.json") || entries.includes("operation.lock")) refuse();
	const snapshot: [string, string][] = [];
	const counts = { acquisition: 0, read: 0, control: 0, draft: 0, send: 0 };
	for (const name of entries.filter((n) => n.startsWith("reservation-"))) {
		if (!/^reservation-[a-f0-9]{64}\.json$/.test(name) || snapshot.length >= 128) refuse();
		const record = await privateJson(join(context.ledgerDirectory, name));
		const row = z
			.object({
				key: z.string().min(1),
				bucket: z.enum(["acquisition", "read", "control", "draft", "send"]),
				intentDigest: hash,
			})
			.strict()
			.parse(record.value);
		if (name !== `reservation-${nativeBudgetDigest(row.key)}.json`) refuse();
		const done = (
			await privateJson(join(context.ledgerDirectory, name.replace("reservation-", "completed-")))
		).value;
		if (
			done.completed !== true ||
			done.key !== row.key ||
			done.bucket !== row.bucket ||
			done.intentDigest !== row.intentDigest
		)
			refuse();
		counts[row.bucket]++;
		snapshot.push([name, createHash("sha256").update(record.raw).digest("hex")]);
	}
	snapshot.sort(([a], [b]) => a.localeCompare(b));
	if (nativeBudgetDigest(snapshot) !== evidence.reservationDigest) refuse();
	for (const bucket of Object.keys(counts) as (keyof typeof counts)[]) {
		if (counts[bucket] > evidence.consumed[bucket]) refuse();
	}
}
/** Compiled operator port only. The verifier must independently enumerate COMPLETE
 * original usage and bind this exact receipt/producer/admission/ledger. It is not
 * supplied by JSON or ordinary startup. Null/unknown counters cannot grant capacity.
 */
export async function qualifyNativeReadBudget(
	context: NativeReadBudgetContext,
	verify: (context: NativeReadBudgetContext) => Promise<unknown>,
	now: () => number = Date.now,
): Promise<NativeReadBudget> {
	try {
		const parsed = Object.freeze(contextSchema.parse(context));
		if (!fresh(parsed.expiresAtMs, now) || typeof verify !== "function") refuse();
		const evidence = evidenceSchema.parse(await verify(parsed));
		if (evidence.contextDigest !== nativeBudgetDigest(parsed) || !fresh(parsed.expiresAtMs, now))
			refuse();
		await verifySnapshot(parsed, evidence);
		if (!fresh(parsed.expiresAtMs, now)) refuse();
		Object.freeze(evidence.consumed);
		Object.freeze(evidence);
		const token = Object.freeze({ kind: "auracall-native-pro-read-budget" as const });
		qualified.set(token, Object.freeze({ context: parsed, evidence }));
		currentReservations.set(token, evidence.reservationDigest);
		return token;
	} catch {
		return refuse();
	}
}
/** Reads only an opaque token issued by the compiled verifier boundary. */
export function nativeReadBudgetData(
	token: NativeReadBudget,
	expected: {
		ledgerDirectory: string;
		admissionDigest: string;
		expiresAtMs: number;
	},
	now: () => number,
): Readonly<QualifiedBudget> {
	const data = qualified.get(token);
	if (
		!data ||
		data.context.ledgerDirectory !== expected.ledgerDirectory ||
		data.context.admissionDigest !== expected.admissionDigest ||
		data.context.expiresAtMs !== expected.expiresAtMs ||
		!fresh(data.context.expiresAtMs, now)
	)
		refuse();
	return data;
}
export function matchNativeReadBudget(
	token: NativeReadBudget,
	context: NativeReadBudgetContext,
	now: () => number,
) {
	const parsed = contextSchema.safeParse(context);
	if (!parsed.success) refuse();
	const data = nativeReadBudgetData(token, parsed.data, now);
	if (nativeBudgetDigest(data.context) !== nativeBudgetDigest(parsed.data)) refuse();
}

/** Same-session anchor complements durable rows: deletion of a later reservation
 * cannot restore headroom. A lost process/token requires original reconciliation,
 * never requalification from an already-budgeted ledger.
 */
export function matchNativeReadReservations(token: NativeReadBudget, snapshotDigest: string) {
	if (!qualified.has(token) || currentReservations.get(token) !== snapshotDigest) refuse();
}
export function recordNativeReadReservation(
	token: NativeReadBudget,
	previousDigest: string,
	nextDigest: string,
) {
	matchNativeReadReservations(token, previousDigest);
	if (!hash.safeParse(nextDigest).success) refuse();
	currentReservations.set(token, nextDigest);
}

/** Revalidate original history immediately before the first SDK effect. This is
 * not a replacement for the operator's independently held writer exclusion.
 */
export async function revalidateNativeReadBudget(token: NativeReadBudget, now: () => number) {
	const data = qualified.get(token);
	if (!data) refuse();
	try {
		nativeReadBudgetData(token, data.context, now);
		matchNativeReadReservations(token, data.evidence.reservationDigest);
		await verifySnapshot(data.context, data.evidence);
		nativeReadBudgetData(token, data.context, now);
	} catch {
		return refuse();
	}
}
