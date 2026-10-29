import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { parseNativePrivateJson } from "./nativeCallbackFrames.js";
import type {
	ProducerDescriptor,
	ProducerPlanSource,
	ProducerPrepareAck,
	ProducerTraceReference,
} from "./nativeCallbackPeer.js";
import {
	bindingSchema,
	carrySchema,
	nativeLinkSchema,
	nativeLinkedCarrySchema,
	planSchema,
	preProducerPhaseRecordSchema,
	reservationSchema,
	traceSchema,
	ownerSchema,
	type ProducerBinding,
	type ProducerNativeContext,
	type ProducerPlan,
	type ProducerRecordRef,
} from "./nativeProducerPhaseRecords.js";
import { producerNativeMatch, type MatchedProducerNativeInput } from "./nativeRuntime.js";
import {
	accountingRefusal,
	originalSha,
	type OriginalAccountingSelection,
} from "./originalAccountingHistory.js";

/** Explicit reviewed compiled selection, never a field accepted by runtime JSON.
 * A plan cannot qualify itself. No default selects an unqualified full plan. */
export interface ProducerPolicySelection {
	readonly planDigest: string;
	readonly mappingSource: ProducerPlan["mappingSource"];
	readonly qualificationEvidence: ProducerPlan["qualificationEvidence"];
}
export interface OriginalProducerPhaseBindings {
	readonly binding: ProducerBinding;
	readonly source: ProducerPlanSource;
	readonly ack: ProducerPrepareAck;
	readonly policy: ProducerPolicySelection;
	assertCurrent(): Promise<void>;
	current(): void;
	nativeLinkPending(): boolean;
}
interface ActorIO {
	check(): Promise<void>;
	current(): void;
	writeOnce(name: string, value: unknown): Promise<void>;
	readOwned(name: string): Promise<unknown>;
	consumed: { acquisition: number; read: number; control: number; draft: number; send: number };
}
const phaseName = ".auracall-original-producer-phase.json";
const carryName = ".auracall-original-producer-carry.json";
const linkName = ".auracall-original-native-link.json";
const linkedCarryName = ".auracall-original-native-carry.json";
export const PRODUCER_LOCAL_RECORD_LIMIT = 1048576;
const phaseSource = fileURLToPath(import.meta.url);
const steps = [
	"freshness",
	"initialize",
	"open",
	"open_state",
	"acquire_initial_tab",
	"target_state",
	"navigate",
	"url",
	"final_state",
] as const;
const methods = [
	"freshness_snapshot",
	"initialize_fresh_host",
	"open_disposable",
	"read_durable_state",
	"acquire_initial_tab",
	"read_durable_state",
	"Page.navigate",
	"Target.getTargetInfo",
	"read_durable_state",
];
const nativeCosts = [
	[0, 0, 0, 0],
	[0, 0, 0, 0],
	[1, 0, 0, 0],
	[0, 0, 0, 1],
	[0, 0, 1, 0],
	[0, 0, 0, 1],
	[0, 0, 1, 0],
	[0, 1, 0, 0],
	[0, 0, 0, 1],
].map(([acquisitions, reads, controls, localStateReads]) => ({
	acquisitions,
	reads,
	controls,
	localStateReads,
}));
const bounded = z
	.string()
	.min(1)
	.max(1024)
	.refine((s) => s.trim() === s && ![...s].some((c) => c.charCodeAt(0) < 32));
const intentSchema = z
	.object({
		profileMode: z.literal("disposable"),
		taskKey: bounded,
		url: z.string().url().max(8192),
		serviceName: bounded,
		agentName: bounded,
		taskName: bounded,
	})
	.strict();
const requestSchema = z
	.object({
		operation: z
			.object({
				schemaVersion: z.literal("agent-browser.producer-open.v1"),
				operationId: z.string().uuid(),
				mode: z.literal("execute"),
				expectedOwner: ownerSchema,
				expiresAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
			})
			.strict(),
		intent: intentSchema,
	})
	.strict();
const zero = {
	consumerAcquisitions: 0,
	producerLifecycles: 0,
	reads: 0,
	controls: 0,
	drafts: 0,
	sends: 0,
	localStateReads: 0,
};
/** UTF8 compact key-sorted metadata only; native Browser digest namespaces and
 * SHA over exact record bytes are deliberately separate. */
export function producerMetadataDigest(value: unknown): string {
	function canonical(v: unknown): string {
		if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
		if (v && typeof v === "object")
			return `{${Object.keys(v)
				.sort()
				.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
				.join(",")}}`;
		if (typeof v === "number" && !Number.isSafeInteger(v)) return accountingRefusal();
		const text = JSON.stringify(v);
		if (text === undefined) return accountingRefusal();
		return text;
	}
	return originalSha(canonical(value));
}
function equal(a: unknown, b: unknown) {
	if (!isDeepStrictEqual(a, b)) accountingRefusal();
}
function add(a: typeof zero, b: typeof zero) {
	for (const k of Object.keys(a) as (keyof typeof zero)[]) {
		a[k] += b[k];
		if (!Number.isSafeInteger(a[k])) accountingRefusal();
	}
}
/** Source-selected full-plan verification and immutable reads live here, not in
 * an injected accounting verifier. Real parent/writer authority remains required. */
export async function openProducerPhaseAccounting(
	selection: OriginalAccountingSelection,
	raw: OriginalProducerPhaseBindings,
	io: ActorIO,
) {
	const binding = bindingSchema.parse(structuredClone(raw.binding));
	const source = structuredClone(raw.source),
		ack = structuredClone(raw.ack),
		policy = structuredClone(raw.policy);
	const root = selection.directory.path;
	const bindingDigest = producerMetadataDigest(binding);
	let producerStarted = false,
		producerCompleted = false,
		linkAttempted = false;
	let completedTrace: ReturnType<typeof traceSchema.parse> | undefined;
	let completedReference: ProducerTraceReference | undefined;
	let linked: ProducerNativeContext | undefined;
	let carryRef: ProducerRecordRef | undefined, linkRef: ProducerRecordRef | undefined;
	let linkedCarryRef: ProducerRecordRef | undefined;
	let completedCarry: ReturnType<typeof carrySchema.parse> | undefined;
	let nativeRecords: ProducerRecordRef[] = [];
	let requestIntent: z.infer<typeof intentSchema> | undefined;
	async function writeRecord(name: string, value: unknown) {
		if (Buffer.byteLength(`${JSON.stringify(value)}\n`) > PRODUCER_LOCAL_RECORD_LIMIT)
			accountingRefusal("producer_local_record_bound_exceeded");
		await io.writeOnce(name, value);
		io.current();
	}
	async function readRecord(ref: ProducerRecordRef): Promise<Buffer> {
		await io.check();
		io.current();
		if (
			!ref ||
			isAbsolute(ref.relativePath) ||
			ref.relativePath.includes("\0") ||
			ref.relativePath.split(/[\\/]/).some((x) => !x || x === "." || x === "..") ||
			ref.size < 1 ||
			ref.size > 1048576
		)
			return accountingRefusal();
		const path = resolve(root, ref.relativePath);
		if (!path.startsWith(`${root}${sep}`) || (await realpath(path)) !== path)
			return accountingRefusal();
		io.current();
		const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		io.current();
		try {
			const before = await fd.stat({ bigint: true });
			io.current();
			if (
				!before.isFile() ||
				before.dev.toString() !== ref.identity.device ||
				before.ino.toString() !== ref.identity.inode ||
				before.uid !== BigInt(ref.identity.uid) ||
				ref.identity.uid !== process.getuid?.() ||
				(before.mode & 0o777n) !== 0o600n ||
				before.size !== BigInt(ref.size)
			)
				return accountingRefusal();
			const bytes = await fd.readFile();
			io.current();
			const after = await fd.stat({ bigint: true });
			io.current();
			const named = await lstat(path, { bigint: true });
			io.current();
			if (
				after.dev !== before.dev ||
				after.ino !== before.ino ||
				after.size !== before.size ||
				after.mtimeNs !== before.mtimeNs ||
				after.ctimeNs !== before.ctimeNs ||
				named.isSymbolicLink() ||
				named.dev !== before.dev ||
				named.ino !== before.ino ||
				bytes.length !== ref.size ||
				originalSha(bytes) !== ref.sha256
			)
				return accountingRefusal();
			await io.check();
			io.current();
			return bytes;
		} finally {
			await fd.close();
			io.current();
		}
	}
	async function ownRef(name: string): Promise<ProducerRecordRef> {
		const path = join(root, name),
			s = await lstat(path, { bigint: true });
		io.current();
		const ref = {
			relativePath: name,
			identity: {
				device: s.dev.toString(),
				inode: s.ino.toString(),
				uid: Number(s.uid),
				mode: "0600" as const,
			},
			size: Number(s.size),
			sha256: "",
		};
		// Only an already create-only owned record; independently re-read exact bytes.
		const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		io.current();
		try {
			const bytes = await fd.readFile();
			io.current();
			ref.sha256 = originalSha(bytes);
		} finally {
			await fd.close();
			io.current();
		}
		await readRecord(ref);
		io.current();
		return ref;
	}
	async function jsonRecord(ref: ProducerRecordRef) {
		const bytes = await readRecord(ref);
		io.current();
		return parseNativePrivateJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	}
	async function verifySource(pin: ProducerPlan["mappingSource"]) {
		await io.check();
		io.current();
		if (!isAbsolute(pin.path) || (await realpath(pin.path)) !== pin.path)
			return accountingRefusal();
		io.current();
		const fd = await open(
			pin.path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		io.current();
		try {
			const before = await fd.stat();
			io.current();
			if (!before.isFile() || before.mode & 0o022 || before.size > 1048576)
				return accountingRefusal();
			const bytes = await fd.readFile();
			io.current();
			const after = await fd.stat();
			io.current();
			if (
				before.ino !== after.ino ||
				before.dev !== after.dev ||
				before.size !== after.size ||
				before.mtimeMs !== after.mtimeMs ||
				before.ctimeMs !== after.ctimeMs ||
				originalSha(bytes) !== pin.sha256
			)
				return accountingRefusal();
		} finally {
			await fd.close();
			io.current();
		}
	}
	equal(bindingDigest, source.bindingDigest);
	equal(ack.bindingDigest, bindingDigest);
	equal(ack.planDigest, source.planDigest);
	equal(await jsonRecord(source.bindingRecord), binding);
	io.current();
	const plan = planSchema.parse(await jsonRecord(source.planRecord));
	io.current();
	equal(producerMetadataDigest(plan), source.planDigest);
	if (!policy || policy.planDigest !== source.planDigest)
		accountingRefusal("producer_full_plan_unqualified");
	equal(plan.mappingSource, policy.mappingSource);
	equal(plan.qualificationEvidence, policy.qualificationEvidence);
	await verifySource(plan.mappingSource);
	io.current();
	for (const pin of plan.qualificationEvidence) {
		await verifySource(pin);
		io.current();
	}
	const total = { ...zero },
		keys = new Set<string>();
	for (const [i, row] of plan.rows.entries()) {
		if (row.step !== steps[i] || row.nativeMethod !== methods[i]) accountingRefusal();
		if (
			row.policyUpper.producerLifecycles !== (row.step === "open" ? 1 : 0) ||
			(["acquire_initial_tab", "navigate"].includes(row.step) && row.policyUpper.controls < 1) ||
			(row.step === "url" && row.policyUpper.reads < 1) ||
			(["open_state", "target_state", "final_state"].includes(row.step) &&
				row.policyUpper.localStateReads < 1)
		)
			accountingRefusal("producer_policy_projection_invalid");
		const costs = { reads: 0, controls: 0, localStateReads: 0 };
		for (const op of row.coveredSourceOperations) {
			if (keys.has(op.operationKey)) accountingRefusal();
			keys.add(op.operationKey);
			await verifySource(op.source);
			io.current();
			await verifySource(op.classificationEvidence);
			io.current();
			costs.reads += op.readsUpper;
			costs.controls += op.controlsUpper;
			costs.localStateReads += op.localStateReadsUpper;
		}
		if (
			costs.reads !== row.policyUpper.reads ||
			costs.controls !== row.policyUpper.controls ||
			costs.localStateReads !== row.policyUpper.localStateReads
		)
			accountingRefusal();
		add(total, row.policyUpper);
	}
	equal(total, plan.upper);
	if (
		io.consumed.acquisition !== 0 ||
		io.consumed.draft !== 0 ||
		io.consumed.send !== 2 ||
		io.consumed.read + plan.upper.reads + 2 > 80 ||
		io.consumed.control + plan.upper.controls > 6
	)
		accountingRefusal("producer_shared_budget_exhausted");
	const reservation = reservationSchema.parse(await jsonRecord(ack.reservationRecord));
	io.current();
	equal(reservation.binding, binding);
	equal(reservation.bindingDigest, bindingDigest);
	equal(reservation.planDigest, source.planDigest);
	equal(reservation.reservedUpper, plan.upper);
	equal(ack.reservationRecord.sha256, ack.reservationDigest);
	const dir = await lstat(root, { bigint: true });
	io.current();
	const actorSource = { path: phaseSource, sha256: "" };
	const sf = await open(phaseSource, constants.O_RDONLY | constants.O_NOFOLLOW);
	io.current();
	try {
		actorSource.sha256 = originalSha(await sf.readFile());
		io.current();
	} finally {
		await sf.close();
		io.current();
	}
	const phaseRecord = preProducerPhaseRecordSchema.parse({
		schemaVersion: "p266.preproducer-accounting-phase.v2",
		binding,
		plan,
		reservation,
		reservationRecord: ack.reservationRecord,
		actorLineage: {
			actorInstanceId: randomUUID(),
			participantCorrelation: binding.participant,
			runBindingDigest: bindingDigest,
			actorSource,
			accountingRootIdentity: {
				device: dir.dev.toString(),
				inode: dir.ino.toString(),
				uid: Number(dir.uid),
				mode: "0700",
			},
			originalReservationDigest: ack.reservationDigest,
		},
	});
	await writeRecord(phaseName, phaseRecord);
	io.current();
	const phaseRef = await ownRef(phaseName);
	io.current();
	async function durable() {
		for (const ref of [
			source.bindingRecord,
			source.planRecord,
			ack.reservationRecord,
			phaseRef,
			carryRef,
			linkRef,
			linkedCarryRef,
			completedReference?.traceRecord,
			completedTrace?.nativeResultRecord,
			completedTrace?.nativeJournal,
			...nativeRecords,
		]) {
			if (ref) {
				await readRecord(ref);
				io.current();
			}
		}
	}
	return Object.freeze({
		async begin(operation: ProducerDescriptor) {
			if (
				producerStarted ||
				operation.bindingDigest !== bindingDigest ||
				operation.operationId !== binding.producerOperationId
			)
				accountingRefusal();
			producerStarted = true; // local once slot BEFORE await
			await io.check();
			io.current();
			const request = requestSchema.parse(await jsonRecord(operation.operationRecord));
			io.current();
			if (
				request?.operation?.mode !== "execute" ||
				request.operation.operationId !== binding.producerOperationId ||
				request.operation.expiresAtMs !== binding.expiresAtMs ||
				!isDeepStrictEqual(request.operation.expectedOwner, binding.expectedOwner)
			)
				accountingRefusal();
			// Parent independently verifies exact Browser intent/task-claim digest rules.
			requestIntent = intentSchema.parse(request.intent);
			const url = new URL(requestIntent.url);
			if (
				!["http:", "https:"].includes(url.protocol) ||
				url.username ||
				url.password ||
				producerMetadataDigest(requestIntent) !== binding.producerIntentDigest ||
				producerMetadataDigest([
					requestIntent.serviceName,
					requestIntent.agentName,
					requestIntent.taskKey,
					null,
				]) !== binding.taskClaimKey
			)
				accountingRefusal();
			await io.check();
			io.current();
		},
		async complete(reference: ProducerTraceReference) {
			if (!producerStarted || producerCompleted) accountingRefusal();
			const trace = traceSchema.parse(await jsonRecord(reference.traceRecord));
			io.current();
			equal(reference.bindingDigest, bindingDigest);
			equal(reference.operationId, binding.producerOperationId);
			equal(reference.reservationDigest, ack.reservationDigest);
			equal(trace.bindingDigest, bindingDigest);
			equal(trace.reservationDigest, ack.reservationDigest);
			equal(trace.planDigest, source.planDigest);
			const native = trace.nativeResult;
			if (
				native.state !== "completed" ||
				!native.result ||
				native.errorCode !== null ||
				native.steps.length !== 18 ||
				native.operationId !== binding.producerOperationId ||
				native.intentDigest !== binding.producerIntentDigest ||
				native.ownerTransportSession !== binding.ownerTransportSession ||
				native.ownerProcessDigest !== producerMetadataDigest(binding.expectedOwner) ||
				!requestIntent
			)
				accountingRefusal("producer_original_trace_incomplete");
			equal(await jsonRecord(trace.nativeResultRecord), native);
			io.current();
			await readRecord(trace.nativeJournal);
			io.current();
			if (trace.mappedEvents.length !== native.steps.length) accountingRefusal();
			const charged = { ...zero },
				eventIds = new Set<string>();
			for (let i = 0; i < native.steps.length; i += 2) {
				const start = native.steps[i],
					done = native.steps[i + 1],
					row = plan.rows[i / 2],
					mapped = trace.mappedEvents[i],
					disposition = trace.mappedEvents[i + 1];
				if (
					start.sequence !== i + 1 ||
					done.sequence !== i + 2 ||
					start.eventId !== `${binding.producerOperationId}:${i + 1}` ||
					done.eventId !== `${binding.producerOperationId}:${i + 2}` ||
					start.status !== "started" ||
					done.status !== "completed" ||
					start.step !== row.step ||
					done.step !== row.step ||
					start.startEventId !== null ||
					done.startEventId !== start.eventId ||
					start.nativeMethod !== row.nativeMethod ||
					done.nativeMethod !== row.nativeMethod ||
					start.errorCode !== null ||
					done.errorCode !== null ||
					eventIds.has(start.eventId) ||
					eventIds.has(done.eventId)
				)
					accountingRefusal();
				equal(start.cost, nativeCosts[i / 2]);
				for (const [event, index] of [
					[start, i],
					[done, i + 1],
				] as const) {
					const expected =
						index < 5
							? null
							: {
									taskId: native.result.taskId,
									profileId: native.result.profileId,
									browserId: native.result.browserId,
									tabId: index < 9 ? null : native.result.tabId,
									targetId: index < 9 ? null : native.result.targetId,
								};
					equal(event.nativeIdentity, expected);
				}
				eventIds.add(start.eventId);
				eventIds.add(done.eventId);
				if (Object.values(done.cost).some((x) => x !== 0)) accountingRefusal();
				for (const [m, e] of [
					[mapped, start],
					[disposition, done],
				] as const) {
					if (
						m.eventId !== e.eventId ||
						m.planRow !== row.step ||
						m.startEventId !== e.startEventId
					)
						accountingRefusal();
					equal(
						m.sourceOperationKeys,
						row.coveredSourceOperations.map((x) => x.operationKey),
					);
				}
				equal(mapped.delta, row.policyUpper);
				equal(disposition.delta, zero);
				add(charged, mapped.delta);
			}
			equal(charged, trace.heldTotals);
			equal(charged, plan.upper);
			const carry = carrySchema.parse({
				schemaVersion: "p266.producer-local-carry.v1",
				binding,
				plan,
				reservation,
				reservationRecord: ack.reservationRecord,
				trace,
				traceRecord: reference.traceRecord,
			});
			await writeRecord(carryName, carry);
			io.current();
			carryRef = await ownRef(carryName);
			io.current();
			completedTrace = trace;
			completedReference = structuredClone(reference);
			completedCarry = carry;
			producerCompleted = true;
		},
		async stageNative(token: MatchedProducerNativeInput) {
			if (!producerCompleted || !completedTrace || !completedReference || linkAttempted)
				accountingRefusal();
			linkAttempted = true;
			const match = producerNativeMatch(token);
			await io.check();
			io.current();
			const recordFor = async (path: string, sha256: string): Promise<ProducerRecordRef> => {
				const s = await lstat(path, { bigint: true });
				io.current();
				const ref = {
					relativePath: relative(root, path),
					identity: {
						device: s.dev.toString(),
						inode: s.ino.toString(),
						uid: Number(s.uid),
						mode: "0600" as const,
					},
					size: Number(s.size),
					sha256,
				};
				await readRecord(ref);
				io.current();
				return ref;
			};
			const inputRecord = await recordFor(match.inputPath, match.inputHash);
			io.current();
			const bindingRecord = await recordFor(match.bindingPath, match.bindingHash);
			io.current();
			nativeRecords = [inputRecord, bindingRecord];
			const nativeLink = nativeLinkSchema.parse({
				schemaVersion: "p266.verified-native-phase-link.v2",
				runBindingDigest: bindingDigest,
				actorLineageDigest: producerMetadataDigest(phaseRecord.actorLineage),
				reservationDigest: ack.reservationDigest,
				completedProducerTraceDigest: completedReference.traceRecord.sha256,
				nativeInputRecord: inputRecord,
				privateBindingRecord: bindingRecord,
				inputHash: match.inputHash,
				bindingHash: match.bindingHash,
				nativeContext: match.context,
				actualProducerTaskId: match.producerTaskId,
				nativeRuntimeSource: match.runtimeSource,
				phaseJoinSource: actorSource,
				linkJournalSequence: 2,
				previousJournalHash: phaseRef.sha256,
			});
			await writeRecord(linkName, nativeLink);
			io.current();
			const ref = await ownRef(linkName);
			io.current();
			linkRef = ref;
			if (!completedCarry) accountingRefusal();
			const joined = nativeLinkedCarrySchema.parse({
				schemaVersion: "p266.same-actor-native-linked-carry.v2",
				preproducer: phaseRecord,
				producerCarry: completedCarry,
				nativeLink,
				nativeLinkRecord: ref,
			});
			await writeRecord(linkedCarryName, joined);
			io.current();
			linkedCarryRef = await ownRef(linkedCarryName);
			io.current();
			linked = Object.freeze({ ...match.context });
			return { nativeLinkRecord: ref, context: linked, target: match.target };
		},
		linkedContextMatches(context: ProducerNativeContext) {
			io.current();
			return !!linked && isDeepStrictEqual(linked, context);
		},
		durable,
		consumed() {
			io.current();
			if (!producerCompleted || !completedTrace || !linked) return accountingRefusal();
			return { read: completedTrace.heldTotals.reads, control: completedTrace.heldTotals.controls };
		},
		completedResult() {
			io.current();
			if (!producerCompleted || !completedTrace) return accountingRefusal();
			return structuredClone(completedTrace.nativeResult);
		},
	});
}
