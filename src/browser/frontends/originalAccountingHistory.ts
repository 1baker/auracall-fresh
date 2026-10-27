import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
	isolatedAcceptanceApproval,
	isolatedAcceptanceRun,
	nativeBudgetDigest,
} from "./nativeReadBudget.js";
import { FrontendError } from "./types.js";

export const originalWriters = [
	"native",
	"stock",
	"browser-owner",
	"human-relay",
	"proposal",
] as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/);
const pinSchema = z.object({ path: z.string().min(1), dev: integer, ino: integer }).strict();
const filePin = pinSchema.extend({ sha256: hash }).strict();
export type OriginalPathPin = Readonly<z.infer<typeof pinSchema>>;
export type OriginalFilePin = Readonly<z.infer<typeof filePin>>;
export const originalCountsSchema = z
	.object({ acquisition: integer, read: integer, control: integer, draft: integer, send: integer })
	.strict();
export type OriginalCounts = z.infer<typeof originalCountsSchema>;
export const originalBucket = z.enum(["acquisition", "read", "control", "draft", "send"]);
const sourceSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("native-ledger"),
			writer: z.literal("native"),
			directory: pinSchema,
			reservations: z.array(z.object({ name, sha256: hash }).strict()).max(128),
		})
		.strict(),
	z
		.object({
			kind: z.literal("manual-roundtrip"),
			writer: z.literal("human-relay"),
			file: filePin,
		})
		.strict(),
	z
		.object({ kind: z.literal("proposal-job"), writer: z.literal("proposal"), file: filePin })
		.strict(),
	z
		.object({
			kind: z.literal("events"),
			writer: z.enum(["stock", "browser-owner"]),
			file: filePin,
		})
		.strict(),
]);
const coverageSchema = z
	.object({
		schema: z.literal("auracall.original-accounting-coverage.v1"),
		originalScopeDigest: hash,
		/** An approved inventory is necessary, but all named bytes and native rows are
		 * independently checked. The supplier NEVER creates or repairs this document. */
		status: z.literal("COMPLETE"),
		gaps: z.array(z.string()).length(0),
		sources: z.array(sourceSchema).min(5).max(32),
	})
	.strict();
export interface OriginalAccountingSelection {
	/** Existing real authority. A new isolated identity is eligible ONLY through
	 * the separately approved isolated coverage variant, never as old history. */
	directory: OriginalPathPin;
	identity: OriginalFilePin;
	coverage: OriginalFilePin;
	originalScopeDigest: string;
	/** SAME admitted Python process and held claim; independently checked via Linux metadata. */
	guard: { pid: number; startTime: string; claim: OriginalPathPin; journal: OriginalPathPin };
	/** Actual source-reviewed cooperating writer locks, all held by that SAME guard.
	 * Source hashes are independently selected by the private operator, not JSON authority. */
	writers: readonly {
		writer: (typeof originalWriters)[number];
		lock: OriginalPathPin;
		implementation: OriginalFilePin;
	}[];
	targetLedger: OriginalPathPin;
}
export function accountingRefusal(code = "original_accounting_unqualified"): never {
	throw new FrontendError(
		code,
		"Original accounting is incomplete or changed; preserve its records.",
	);
}
export const originalSha = (bytes: string | Buffer) =>
	createHash("sha256").update(bytes).digest("hex");
export function originalCanonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(originalCanonical).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([k, v]) => `${originalCanonical(k)}:${originalCanonical(v)}`)
			.join(",")}}`;
	// Match the selected Python guard's ensure_ascii=True journal encoding.
	const encoded = JSON.stringify(value);
	if (encoded === undefined) return accountingRefusal();
	return encoded.replace(
		/[\u007f-\uffff]/g,
		(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}
export async function verifyOriginalPath(
	pin: OriginalPathPin,
	directory = false,
	privateMode = true,
) {
	pinSchema.parse(pin);
	if (!isAbsolute(pin.path) || (await realpath(pin.path)) !== pin.path) accountingRefusal();
	const s = await lstat(pin.path);
	if (
		(directory ? !s.isDirectory() : !s.isFile()) ||
		s.isSymbolicLink() ||
		s.dev !== pin.dev ||
		s.ino !== pin.ino ||
		s.uid !== process.getuid?.() ||
		s.mode & (privateMode ? 0o077 : 0o022)
	)
		accountingRefusal();
	return s;
}
export async function readOriginalFile(pin: OriginalFilePin, privateMode = true): Promise<Buffer> {
	filePin.parse(pin);
	const bytes = await readPinnedFile({ path: pin.path, dev: pin.dev, ino: pin.ino }, privateMode);
	if (originalSha(bytes) !== pin.sha256) accountingRefusal();
	return bytes;
}
async function readPinnedFile(pin: OriginalPathPin, privateMode = true): Promise<Buffer> {
	await verifyOriginalPath(pin, false, privateMode);
	const fd = await open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = await fd.stat();
		if (
			!before.isFile() ||
			before.dev !== pin.dev ||
			before.ino !== pin.ino ||
			before.size > 1048576
		)
			accountingRefusal();
		const bytes = await fd.readFile(),
			after = await fd.stat();
		if (
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs ||
			before.ctimeMs !== after.ctimeMs ||
			bytes.length !== before.size
		)
			accountingRefusal();
		await verifyOriginalPath(pin, false, privateMode);
		return bytes;
	} finally {
		await fd.close();
	}
}
/** No claim or FD is created here. A file name/marker is insufficient: actual
 * kernel-held FLOCK write locks must belong to the selected live process. */
export async function verifyOriginalGuard(
	selection: OriginalAccountingSelection,
	context: unknown,
) {
	if (process.platform !== "linux" || !process.getuid || !process.getuid()) accountingRefusal();
	const g = selection.guard;
	if (!Number.isSafeInteger(g.pid) || g.pid <= 0 || !/^\d+$/.test(g.startTime)) accountingRefusal();
	const stat = await readFile(`/proc/${g.pid}/stat`, "utf8");
	const fields = stat
		.slice(stat.lastIndexOf(")") + 2)
		.trim()
		.split(/\s+/);
	if (fields[19] !== g.startTime) accountingRefusal();
	const status = await readFile(`/proc/${g.pid}/status`, "utf8");
	const uid = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
	if (!uid || uid.slice(1).some((v) => Number(v) !== process.getuid?.())) accountingRefusal();
	await verifyOriginalPath(selection.directory, true);
	await readOriginalFile(selection.identity);
	if (
		selection.identity.path !==
			join(selection.directory.path, selection.identity.path.split("/").at(-1) ?? "") ||
		g.claim.path !== join(selection.directory.path, ".p266-original-authority.claim") ||
		g.journal.path !== join(selection.directory.path, ".p266-original-authority.events")
	)
		accountingRefusal();
	if (
		selection.writers.length !== originalWriters.length ||
		originalWriters.some((w) => selection.writers.filter((v) => v.writer === w).length !== 1)
	)
		accountingRefusal();
	const locks = await readFile("/proc/locks", "utf8");
	for (const pin of [g.claim, ...selection.writers.map((w) => w.lock)]) {
		const s = await verifyOriginalPath(pin);
		const dev = BigInt(s.dev),
			major = ((dev >> 8n) & 0xfffn) | ((dev >> 32n) & 0xfffff000n),
			minor = (dev & 0xffn) | ((dev >> 12n) & 0xffffff00n);
		const found = locks.split("\n").some((line) => {
			const m = line.match(
				/^\d+: FLOCK\s+ADVISORY\s+WRITE\s+(\d+)\s+([\da-f]+):([\da-f]+):(\d+)\s+0\s+EOF$/i,
			);
			return (
				m &&
				Number(m[1]) === g.pid &&
				BigInt(`0x${m[2]}`) === major &&
				BigInt(`0x${m[3]}`) === minor &&
				Number(m[4]) === pin.ino
			);
		});
		if (!found) accountingRefusal("original_accounting_writer_not_held");
	}
	for (const writer of selection.writers) await readOriginalFile(writer.implementation, false);
	const bytes = (await readPinnedFile(g.journal)).toString();
	if (!bytes.length || !bytes.endsWith("\n")) accountingRefusal();
	const pinDigest = originalSha(
		originalCanonical({
			directory: selection.directory.path,
			directoryDev: selection.directory.dev,
			directoryIno: selection.directory.ino,
			identityName: selection.identity.path.split("/").at(-1),
			identityDev: selection.identity.dev,
			identityIno: selection.identity.ino,
			identitySha256: selection.identity.sha256,
			originalScopeDigest: selection.originalScopeDigest,
		}),
	);
	let previous = "0".repeat(64),
		sequence = 0;
	for (const line of bytes.trimEnd().split("\n")) {
		const row = JSON.parse(line),
			{ hash: digest, ...body } = row;
		if (
			row.sequence !== ++sequence ||
			row.previous !== previous ||
			row.authorityPinDigest !== pinDigest ||
			originalSha(originalCanonical(body)) !== digest
		)
			accountingRefusal();
		if (
			sequence === 1 &&
			(row.phase !== "original_claimed" ||
				row.contextDigest !== originalSha(originalCanonical(context)))
		)
			accountingRefusal();
		previous = digest;
	}
}

const rowSchema = z
	.object({
		key: z.string().min(1),
		bucket: originalBucket,
		intentDigest: hash,
		budgetId: hash.optional(),
	})
	.strict();
/** Enumerate actual reservation bytes; an empty new target is only a snapshot,
 * never a complete-original-usage claim. Incomplete rows retain a charge. */
export async function readNativeReservations(directory: OriginalPathPin) {
	await verifyOriginalPath(directory, true);
	const names = await readdir(directory.path),
		snapshot: [string, string][] = [],
		rows: z.infer<typeof rowSchema>[] = [];
	let uncertain = false;
	for (const file of names.filter((n) => n.startsWith("reservation-"))) {
		if (!/^reservation-[a-f0-9]{64}\.json$/.test(file) || rows.length >= 128) accountingRefusal();
		const path = join(directory.path, file),
			s = await lstat(path);
		if (
			!s.isFile() ||
			s.isSymbolicLink() ||
			s.uid !== process.getuid?.() ||
			s.mode & 0o077 ||
			s.size > 16384
		)
			accountingRefusal();
		const raw = await readPinnedFile({ path, dev: s.dev, ino: s.ino }),
			row = rowSchema.parse(JSON.parse(raw.toString()));
		if (file !== `reservation-${nativeBudgetDigest(row.key)}.json`) accountingRefusal();
		const complete = file.replace("reservation-", "completed-");
		if (!names.includes(complete)) uncertain = true;
		else {
			const cp = join(directory.path, complete),
				cs = await lstat(cp);
			if (
				!cs.isFile() ||
				cs.isSymbolicLink() ||
				cs.uid !== process.getuid?.() ||
				cs.mode & 0o077 ||
				cs.size > 16384
			)
				accountingRefusal();
			const done = JSON.parse(
				(await readPinnedFile({ path: cp, dev: cs.dev, ino: cs.ino })).toString(),
			);
			if (
				done.completed !== true ||
				done.key !== row.key ||
				done.bucket !== row.bucket ||
				done.intentDigest !== row.intentDigest
			)
				uncertain = true;
		}
		rows.push(row);
		snapshot.push([file, originalSha(raw)]);
	}
	if (
		names.some(
			(n) => n.startsWith("completed-") && !names.includes(n.replace("completed-", "reservation-")),
		)
	)
		accountingRefusal();
	await verifyOriginalPath(directory, true);
	if (!isSameNames(names, await readdir(directory.path))) accountingRefusal();
	snapshot.sort(([a], [b]) => a.localeCompare(b));
	return { rows, snapshot, uncertain, names };
}
function isSameNames(a: string[], b: string[]) {
	return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

interface AccountingHistory {
	consumed: OriginalCounts;
	uncertain: boolean;
	coverageDigest: string;
	isolation?: {
		amendment: typeof isolatedAcceptanceRun;
		approvalDigest: typeof isolatedAcceptanceApproval;
		historicalReadUsage: "UNKNOWN";
	};
}

const isolatedEventSource = z
	.object({
		kind: z.literal("isolated-events"),
		writer: z.enum(["stock", "browser-owner", "human-relay", "proposal"]),
		file: filePin,
	})
	.strict();
const isolatedCoverageSchema = z
	.object({
		schema: z.literal("auracall.isolated-acceptance-accounting.v1"),
		runReference: z.literal(isolatedAcceptanceRun),
		approvalDigest: z.literal(isolatedAcceptanceApproval),
		originalScopeDigest: hash,
		status: z.literal("COMPLETE_FOR_NEW_RUN"),
		gaps: z.array(z.string()).length(0),
		historical: z
			.object({
				sendsConsumed: z.literal(2),
				readUsage: z.literal("UNKNOWN"),
				readLimit: z.literal(80),
				controlLimit: z.literal(6),
			})
			.strict(),
		sources: z
			.array(z.discriminatedUnion("kind", [sourceSchema.options[0], isolatedEventSource]))
			.length(5),
	})
	.strict();

/** New-run records cannot satisfy the old-history validator. The same selected
 * live guard and all five enforcing writers must still qualify before this read.
 * This function never creates identity, coverage, event records or capacity. */
async function readIsolatedHistory(
	selection: OriginalAccountingSelection,
	value: unknown,
): Promise<AccountingHistory> {
	const coverage = isolatedCoverageSchema.parse(value);
	if (
		coverage.originalScopeDigest !== selection.originalScopeDigest ||
		originalWriters.some((w) => coverage.sources.filter((s) => s.writer === w).length !== 1)
	)
		accountingRefusal("isolated_accounting_history_unknown");
	const consumed: OriginalCounts = { acquisition: 0, read: 0, control: 0, draft: 0, send: 2 };
	const paths = new Set<string>(),
		events = new Set<string>();
	let uncertain = false;
	function add(id: string, bucket: keyof OriginalCounts, units = 1) {
		if (events.has(id) || !Number.isSafeInteger(units) || units < 1) accountingRefusal();
		events.add(id);
		consumed[bucket] += units;
		if (!Number.isSafeInteger(consumed[bucket])) accountingRefusal();
	}
	for (const source of coverage.sources) {
		const path = source.kind === "native-ledger" ? source.directory.path : source.file.path;
		if (paths.has(path)) accountingRefusal();
		paths.add(path);
		if (source.kind === "native-ledger") {
			if (
				source.directory.path === selection.targetLedger.path ||
				(source.directory.dev === selection.targetLedger.dev &&
					source.directory.ino === selection.targetLedger.ino)
			)
				accountingRefusal();
			const data = await readNativeReservations(source.directory);
			if (
				nativeBudgetDigest(data.snapshot) !==
				nativeBudgetDigest(
					source.reservations.map((r) => [r.name, r.sha256]).sort(([a], [b]) => a.localeCompare(b)),
				)
			)
				accountingRefusal();
			for (const row of data.rows) add(`native:${row.key}`, row.bucket);
			uncertain ||= data.uncertain;
		} else {
			const record = z
				.object({
					schema: z.literal("auracall.isolated-counted-events.v1"),
					runReference: z.literal(isolatedAcceptanceRun),
					originalScopeDigest: hash,
					writer: isolatedEventSource.shape.writer,
					complete: z.literal(true),
					gaps: z.array(z.string()).length(0),
					events: z
						.array(
							z
								.object({
									id: z.string().min(1),
									bucket: originalBucket,
									units: integer.positive(),
									state: z.enum(["completed", "reserved", "uncertain"]),
									evidence: filePin,
								})
								.strict(),
						)
						.max(4096),
				})
				.strict()
				.parse(JSON.parse((await readOriginalFile(source.file)).toString()));
			if (
				record.writer !== source.writer ||
				record.originalScopeDigest !== selection.originalScopeDigest
			)
				accountingRefusal();
			for (const event of record.events) {
				await readOriginalFile(event.evidence);
				add(`${source.writer}:${event.id}`, event.bucket, event.units);
				uncertain ||= event.state !== "completed";
			}
		}
	}
	// Any prior Send/draft/uncertainty in this run needs original reconciliation,
	// not another startup allowance or a replacement run.
	if (
		consumed.send !== 2 ||
		consumed.draft !== 0 ||
		consumed.acquisition > 1 ||
		consumed.read > 80 ||
		consumed.control > 6
	)
		accountingRefusal();
	return {
		consumed,
		uncertain,
		coverageDigest: selection.coverage.sha256,
		isolation: {
			amendment: isolatedAcceptanceRun,
			approvalDigest: isolatedAcceptanceApproval,
			historicalReadUsage: "UNKNOWN",
		},
	};
}

export async function readOriginalHistory(
	selection: OriginalAccountingSelection,
): Promise<AccountingHistory> {
	const value = JSON.parse((await readOriginalFile(selection.coverage)).toString());
	if (value.schema === "auracall.isolated-acceptance-accounting.v1")
		return readIsolatedHistory(selection, value);
	const coverage = coverageSchema.parse(value);
	if (
		coverage.originalScopeDigest !== selection.originalScopeDigest ||
		originalWriters.some((w) => !coverage.sources.some((s) => s.writer === w))
	)
		accountingRefusal("original_accounting_history_unknown");
	const consumed: OriginalCounts = { acquisition: 0, read: 0, control: 0, draft: 0, send: 0 },
		events = new Set<string>(),
		seenFiles = new Set<string>();
	let uncertain = false;
	function add(id: string, bucket: keyof OriginalCounts, units = 1) {
		if (events.has(id) || !Number.isSafeInteger(units) || units < 1) accountingRefusal();
		events.add(id);
		consumed[bucket] += units;
		if (!Number.isSafeInteger(consumed[bucket])) accountingRefusal();
	}
	for (const source of coverage.sources) {
		const path = source.kind === "native-ledger" ? source.directory.path : source.file.path;
		if (seenFiles.has(path)) accountingRefusal();
		seenFiles.add(path);
		if (source.kind === "native-ledger") {
			if (
				source.directory.path === selection.targetLedger.path ||
				(source.directory.dev === selection.targetLedger.dev &&
					source.directory.ino === selection.targetLedger.ino)
			)
				accountingRefusal();
			const data = await readNativeReservations(source.directory);
			if (
				nativeBudgetDigest(data.snapshot) !==
				nativeBudgetDigest(
					source.reservations.map((r) => [r.name, r.sha256]).sort(([a], [b]) => a.localeCompare(b)),
				)
			)
				accountingRefusal();
			for (const row of data.rows) add(`native:${row.key}`, row.bucket);
			uncertain ||= data.uncertain;
		} else {
			const record = JSON.parse((await readOriginalFile(source.file)).toString());
			if (source.kind === "manual-roundtrip") {
				if (
					record.job_id !== "browser-owner-chatgpt-roundtrip-20261023" ||
					record.limits?.shared_total_Send_cap !== 2 ||
					!Array.isArray(record.intent_and_reply_records?.effects) ||
					record.intent_and_reply_records.effects.length !== 2
				)
					accountingRefusal();
				for (const e of record.intent_and_reply_records.effects) {
					if (![1, 2].includes(e.step) || typeof e.request_id !== "string") accountingRefusal();
					add(`manual:${e.step}`, "send");
					if (e.phase !== "FULL_REPLY_SAVED_AND_READBACK_VERIFIED") uncertain = true;
				}
			} else if (source.kind === "proposal-job") {
				if (
					record.job_id !== "proposal-v7c-pro-review-20261023" ||
					record.provider_request_created !== false ||
					record.dispatch_claimed_at !== null
				)
					accountingRefusal("original_accounting_pending_send");
			} else {
				const data = z
					.object({
						schema: z.literal("auracall.original-counted-events.v1"),
						originalScopeDigest: hash,
						writer: z.enum(["stock", "browser-owner"]),
						complete: z.literal(true),
						gaps: z.array(z.string()).length(0),
						events: z
							.array(
								z
									.object({
										id: z.string().min(1),
										bucket: originalBucket,
										units: integer.positive(),
										state: z.enum(["completed", "reserved", "uncertain"]),
										evidence: filePin,
									})
									.strict(),
							)
							.max(4096),
					})
					.strict()
					.parse(record);
				if (
					data.originalScopeDigest !== selection.originalScopeDigest ||
					data.writer !== source.writer
				)
					accountingRefusal();
				for (const e of data.events) {
					await readOriginalFile(e.evidence);
					add(`${source.writer}:${e.id}`, e.bucket, e.units);
					uncertain ||= e.state !== "completed";
				}
			}
		}
	}
	if (
		consumed.send !== 2 ||
		consumed.acquisition > 1 ||
		consumed.read > 80 ||
		consumed.control > 6 ||
		consumed.draft > 2
	)
		accountingRefusal();
	return { consumed, uncertain, coverageDigest: selection.coverage.sha256 };
}
