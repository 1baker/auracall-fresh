import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import {
	createPreproducerAccountedNativeCallbackIntegration,
	takeRetainedNativeAccountingIntegration,
} from "../../src/browser/frontends/nativeCallbackIntegration.js";
import { PRODUCER_CALLBACK_PROTOCOL } from "../../src/browser/frontends/nativeCallbackFrames.js";
import { producerMetadataDigest } from "../../src/browser/frontends/nativeProducerAccounting.js";
import {
	bindingSchema,
	planSchema,
	nativeResultSchema,
	type ProducerRecordRef,
} from "../../src/browser/frontends/nativeProducerPhaseRecords.js";
import { readNativeRuntimeInput } from "../../src/browser/frontends/nativeRuntime.js";
import * as history from "../../src/browser/frontends/originalAccountingHistory.js";
import * as accountingModule from "../../src/browser/frontends/originalAccounting.js";
import type { OriginalAccountingSelection } from "../../src/browser/frontends/originalAccountingHistory.js";
import browserFixture from "./fixtures/producer-open-r4-public.json";

const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (v: string | Buffer) => history.originalSha(v);
const hex = "a".repeat(64);
async function fixture(
	options: {
		unknown?: boolean;
		holdLink?: boolean;
		wrongPolicy?: boolean;
		wrongNativeCost?: boolean;
	} = {},
) {
	const root = await mkdtemp(join(tmpdir(), "auracall-public-producer-phase-"));
	roots.push(root);
	async function pathPin(path: string) {
		const s = await stat(path);
		return { path, dev: s.dev, ino: s.ino };
	}
	async function record(name: string, value: unknown): Promise<ProducerRecordRef> {
		const path = join(root, name),
			bytes = `${JSON.stringify(value)}\n`;
		await writeFile(path, bytes, { mode: 0o600 });
		const s = await stat(path);
		return {
			relativePath: name,
			identity: { device: String(s.dev), inode: String(s.ino), uid: s.uid, mode: "0600" },
			size: Buffer.byteLength(bytes),
			sha256: hash(bytes),
		};
	}
	async function filePin(name: string, value: unknown) {
		const r = await record(name, value);
		return { ...(await pathPin(join(root, name))), sha256: r.sha256 };
	}
	const sourcePin = {
		path: join(root, "synthetic-source"),
		sha256: hash("public synthetic source only\n"),
	};
	await writeFile(sourcePin.path, "public synthetic source only\n", { mode: 0o600 });
	const now = Date.now(),
		expiresAtMs = now + 120000;
	const request = structuredClone(browserFixture.wireRequest);
	request.operation.expiresAtMs = expiresAtMs;
	const binary = join(root, "synthetic-producer"),
		manifest = join(root, "synthetic-manifest");
	await writeFile(binary, "not an executable browser\n", { mode: 0o700 });
	await writeFile(manifest, "synthetic manifest\n", { mode: 0o600 });
	request.operation.expectedOwner.binarySha256 = hash(await readFile(binary));
	const participant = {
		instanceId: request.operation.operationId,
		sourceSha256: sourcePin.sha256,
		controller: {
			pid: process.pid,
			startToken: "synthetic",
			sourceSha256: sourcePin.sha256,
			generation: "synthetic",
		},
		reservationJournal: { device: "1", inode: "2", uid: process.getuid?.(), mode: "0600" },
	};
	const binding = bindingSchema.parse({
		approvalSha256: "2663ec8f067a3dd531c6ee2934cf86072d3d1bbccff6ca85b926f06f3bc821d5",
		adjudicationSha256: "10515b538116cf187f4eab3177e7e9616b49a662209978d8d23b434cb4018f89",
		runReference: "p266-isolated-acceptance-20261027-2663ec8f",
		allocationIdentitySha256: "2df22702920b1b246df0c1838745ecf83beca678cc0bd5a2f0a7984b613aa12b",
		namespace: "p266new",
		realmPinSha256: hex,
		policyScopeDigest: hex,
		producerContractSha256: "703498fba269666d4d68e8000790e5eeaaee78cc588d132319c4102b75dce98f",
		producerOperationId: request.operation.operationId,
		producerIntentDigest: producerMetadataDigest(request.intent),
		taskClaimKey: producerMetadataDigest([
			request.intent.serviceName,
			request.intent.agentName,
			request.intent.taskKey,
			null,
		]),
		expectedOwner: request.operation.expectedOwner,
		ownerTransportSession: "synthetic-owner",
		expiresAtMs,
		participant,
	});
	const native = nativeResultSchema.parse(structuredClone(browserFixture.completed));
	native.intentDigest = binding.producerIntentDigest;
	native.ownerProcessDigest = producerMetadataDigest(binding.expectedOwner);
	native.ownerTransportSession = binding.ownerTransportSession;
	const rows = native.steps
		.filter((e) => e.status === "started")
		.map((e) => ({
			step: e.step,
			nativeMethod: e.nativeMethod,
			coveredSourceOperations: [
				{
					operationKey: `public-${e.step}`,
					source: sourcePin,
					symbol: "public fixture only",
					method: e.nativeMethod,
					maxStarts: 1,
					readsUpper: e.cost.reads,
					controlsUpper: e.cost.controls,
					localStateReadsUpper: e.cost.localStateReads,
					classificationEvidence: sourcePin,
				},
			],
			policyUpper: {
				consumerAcquisitions: 0,
				producerLifecycles: e.step === "open" ? 1 : 0,
				reads: e.cost.reads,
				controls: e.cost.controls,
				drafts: 0,
				sends: 0,
				localStateReads: e.cost.localStateReads,
			},
		}));
	const upper = {
		consumerAcquisitions: 0,
		producerLifecycles: 1,
		reads: 1,
		controls: 2,
		drafts: 0,
		sends: 0,
		localStateReads: 3,
	};
	const plan = planSchema.parse({
		schemaVersion: "p266.producer-policy-plan.v1",
		nativePlanVersion: "agent-browser.producer-step-budget.v1",
		mappingVersion: "SYNTHETIC_ONLY_NOT_PRODUCTION",
		mappingSource: sourcePin,
		qualificationEvidence: [sourcePin],
		producerContractSha256: binding.producerContractSha256,
		rows,
		upper,
		sharedNewRunCaps: { consumerAcquisitions: 1, reads: 80, controls: 6, sends: 1 },
		producerLifecycleLimit: 1,
	});
	const source = {
		bindingRecord: await record("binding.record", binding),
		planRecord: await record("plan.record", plan),
		bindingDigest: producerMetadataDigest(binding),
		planDigest: producerMetadataDigest(plan),
	};
	const reservation = {
		schemaVersion: "p266.producer-pre-reservation.v1",
		binding,
		bindingDigest: source.bindingDigest,
		planDigest: source.planDigest,
		reservationId: request.operation.operationId,
		previousReservationDigest: null,
		journalSequence: 1,
		previousJournalHash: "0".repeat(64),
		reservedUpper: upper,
	};
	const reservationRecord = await record("reservation.record", reservation);
	const ack = {
		reservationRecord,
		reservationDigest: reservationRecord.sha256,
		bindingDigest: source.bindingDigest,
		planDigest: source.planDigest,
	};
	if (options.unknown) {
		native.state = "unknown";
		native.errorCode = "producer_step_failed";
		native.result = null;
	}
	if (options.wrongNativeCost) native.steps[12].cost.controls = 0;
	const nativeResultRecord = await record("native.result", native),
		nativeJournal = await record("native.journal", {
			testOnly: "immutable export of synthetic journal",
			steps: native.steps,
		});
	const trace = {
		schemaVersion: "p266.producer-policy-trace.v1",
		bindingDigest: source.bindingDigest,
		reservationDigest: ack.reservationDigest,
		planDigest: source.planDigest,
		nativeJournal,
		nativeResultRecord,
		nativeResult: native,
		mappedEvents: native.steps.map((e) => ({
			eventId: e.eventId,
			planRow: e.step,
			sourceOperationKeys: [`public-${e.step}`],
			startEventId: e.startEventId,
			delta:
				e.status === "started"
					? rows.find((r) => r.step === e.step)?.policyUpper
					: {
							consumerAcquisitions: 0,
							producerLifecycles: 0,
							reads: 0,
							controls: 0,
							drafts: 0,
							sends: 0,
							localStateReads: 0,
						},
		})),
		heldTotals: upper,
		terminalJournalSequence: 1,
		terminalJournalHash: hex,
	};
	const traceRecord = await record("trace.record", trace),
		traceRef = {
			bindingDigest: source.bindingDigest,
			operationId: binding.producerOperationId,
			reservationDigest: ack.reservationDigest,
			traceRecord,
		};
	const operation = {
		bindingDigest: source.bindingDigest,
		operationId: binding.producerOperationId,
		operationRecord: await record("operation.record", request),
	};
	const legacy = join(root, "prior"),
		ledger = join(root, "consumer"),
		home = join(root, "home"),
		socket = join(root, "socket"),
		prep = join(root, "preparation");
	for (const p of [legacy, ledger, home, socket, prep]) await mkdir(p, { mode: 0o700 });
	const identity = await filePin("identity.record", { testOnly: "NOT real authority" }),
		sources: unknown[] = [
			{
				kind: "native-ledger",
				writer: "native",
				directory: await pathPin(legacy),
				reservations: [],
			},
		];
	for (const writer of ["stock", "browser-owner", "human-relay", "proposal"])
		sources.push({
			kind: "isolated-events",
			writer,
			file: await filePin(`${writer}.record`, {
				schema: "auracall.isolated-counted-events.v1",
				runReference: binding.runReference,
				originalScopeDigest: hex,
				writer,
				complete: true,
				gaps: [],
				events: [],
			}),
		});
	const coverage = await filePin("coverage.record", {
		schema: "auracall.isolated-acceptance-accounting.v1",
		runReference: binding.runReference,
		approvalDigest: binding.approvalSha256,
		originalScopeDigest: hex,
		status: "COMPLETE_FOR_NEW_RUN",
		gaps: [],
		historical: { sendsConsumed: 2, readUsage: "UNKNOWN", readLimit: 80, controlLimit: 6 },
		sources,
	});
	const selection: OriginalAccountingSelection = {
		directory: await pathPin(root),
		identity,
		coverage,
		originalScopeDigest: hex,
		guard: {
			pid: process.pid,
			startTime: "synthetic",
			claim: await pathPin(identity.path),
			journal: await pathPin(identity.path),
		},
		writers: [],
		targetLedger: await pathPin(ledger),
	};
	// Only this public unit fixture replaces physical authority. Production keeps
	// real Linux locks, current participant and all-writer validation mandatory.
	vi.spyOn(history, "verifyOriginalGuard").mockResolvedValue(undefined);
	const realOpen = accountingModule.openOriginalAccounting;
	let localActor: Awaited<ReturnType<typeof realOpen>> | undefined;
	const opened = vi
		.spyOn(accountingModule, "openOriginalAccounting")
		.mockImplementation(async (...args) => {
			localActor = await realOpen(...args);
			return localActor;
		});
	const producer = {
		allocationId: "synthetic",
		profileId: "synthetic-profile",
		browserId: "synthetic-browser",
		tabId: "synthetic-tab",
		targetId: "synthetic-target",
		ownerTransportSession: binding.ownerTransportSession,
		ownerGeneration: 1,
		publishedProcessDigest: "b".repeat(64),
		custodyDigest: "c".repeat(64),
		origin: "https://chatgpt.com",
	};
	const admission = {
		consumerGrantId: "synthetic-grant",
		profileCapability: "synthetic-CONSUMER-secret",
		taskKey: "synthetic-consumer-key",
		profileId: producer.profileId,
		browserId: producer.browserId,
		tabId: producer.tabId,
		targetId: producer.targetId,
		expiresAtMs,
	};
	const privateBinding = await record("actual.binding", producer);
	const inputRaw = {
		version: "auracall.own-sdk-runtime.v1",
		bindingOut: join(root, privateBinding.relativePath),
		grant: {
			grantId: admission.consumerGrantId,
			consumerTaskKey: admission.taskKey,
			producer,
			caller: {
				principalId: "consumer",
				profileId: producer.profileId,
				capabilityId: "consumer-capability",
				capabilityRevision: 1,
				provenance: "registered_capability",
			},
			issuedAtMs: now - 1000,
			expiresAtMs,
		},
		admission,
		options: {
			producerExecutable: binary,
			producerManifest: manifest,
			producerHome: home,
			producerSocketDirectory: socket,
			consumerLedgerDirectory: ledger,
			preparationDirectory: prep,
			routeId: "synthetic-route",
			expectedModel: "synthetic-model",
			operationId: "synthetic-prepare-pro",
			expectedUrl: "https://chatgpt.com/c/synthetic",
		},
	};
	const inputRef = await record("actual.input", inputRaw);
	const input = await readNativeRuntimeInput(join(root, inputRef.relativePath), {
		binarySha256: binding.expectedOwner.binarySha256,
		manifestSha256: hash(await readFile(manifest)),
		namespace: "p266new",
	});
	const ownerAuthority = {
		principalId: "owner",
		profileId: producer.profileId,
		capabilityId: "owner-capability",
		capabilityRevision: 1,
		provenance: "registered_capability",
	};
	const fromNode = new PassThrough(),
		toNode = new PassThrough(),
		frames: Record<string, unknown>[] = [],
		rootsByCallback = new Map<number, number>();
	let cb = 0;
	const reply = (value: object) =>
		toNode.write(`${JSON.stringify({ protocol: PRODUCER_CALLBACK_PROTOCOL, ...value })}\n`);
	fromNode.on("data", (bytes: Buffer) => {
		const f = JSON.parse(bytes.toString());
		frames.push(f);
		if (f.type === "call") {
			if (f.method === "binding.hold") return;
			if (f.method === "phase.prepare") reply({ type: "return", id: f.id, ok: true, result: ack });
			else if (f.method === "phase.assert_current")
				reply({ type: "return", id: f.id, ok: true, result: null });
			else if (
				["guard.assert_current", "guard.checkpoint", "guard.attach_read_budget_context"].includes(
					f.method,
				)
			)
				reply({ type: "return", id: f.id, ok: true, result: null });
			else if (f.method === "phase.producer" || f.method === "phase.link_native") {
				const id = ++cb;
				rootsByCallback.set(id, f.id);
				reply({
					type: "callback",
					id,
					parent: f.id,
					method: f.method === "phase.producer" ? "execute_producer" : "verify_native_link",
					args: [],
				});
			}
		} else if (f.type === "callback_result" && f.ok) {
			if (options.holdLink && cb === 2) return;
			reply({ type: "return", id: rootsByCallback.get(f.id), ok: true, result: null });
		}
	});
	const flow = await createPreproducerAccountedNativeCallbackIntegration(
		{ phase: "preproducer", preproducerBinding: binding },
		{ protocol: PRODUCER_CALLBACK_PROTOCOL, input: fromNode, output: toNode, timeoutMs: 1500 },
		{
			selection,
			observe: "same-peer",
			policy: {
				planDigest: options.wrongPolicy ? hex : source.planDigest,
				mappingSource: sourcePin,
				qualificationEvidence: [sourcePin],
			},
		},
	);
	return {
		root,
		binding,
		source,
		ack,
		operation,
		traceRef,
		input,
		ownerAuthority,
		flow,
		frames,
		reply,
		receipt: hash(`${inputRef.sha256}:${privateBinding.sha256}`),
		actor() {
			if (!localActor) throw new Error("actor absent");
			return localActor;
		},
		opened,
		ledger,
	};
}

it("uses one real local actor through durable producer carry and actual opaque native-input link", async () => {
	const f = await fixture(),
		cap = await f.flow.prepare(f.binding, f.source),
		value = Symbol("opaque SDK-like value");
	expect(
		await f.flow.runProducer(cap, f.operation, async () => ({ trace: f.traceRef, value })),
	).toBe(value);
	const token = await f.flow.linkNative(cap, {
		input: f.input,
		ownerAuthority: f.ownerAuthority,
		producerTaskId: "synthetic-task",
	});
	const link = JSON.parse(
		await readFile(join(f.root, ".auracall-original-native-link.json"), "utf8"),
	);
	expect(link.nativeContext.receiptDigest).toBe(f.receipt);
	expect(link.actualProducerTaskId).toBe("synthetic-task");
	expect(link.nativeContext.receiptDigest).not.toBe(f.source.bindingDigest);
	expect(f.opened).toHaveBeenCalledTimes(1);
	const actor = f.actor(),
		context = link.nativeContext;
	await actor.reserveObservationReads(context, 2);
	await actor.reserveObservationReads(context, 2); // same record, not a second charge
	await actor.observe(context, "a".repeat(64), async () => ({ testOnly: "synthetic witness" }));
	const usage = await actor.originalUsage({
		...context,
		admissionDigest: hex,
		ledgerDirectory: f.ledger,
	});
	expect(usage.consumed).toEqual({ acquisition: 0, read: 3, control: 2, draft: 0, send: 2 });
	expect(f.opened).toHaveBeenCalledTimes(1);
	expect(f.frames.filter((x) => x.method === "phase.prepare")).toHaveLength(1);
	expect(f.frames.filter((x) => x.method === "phase.link_native")).toHaveLength(1);
	expect(JSON.stringify(f.frames)).not.toContain("synthetic-CONSUMER-secret");
	expect(JSON.stringify(f.frames)).not.toContain("actualProducerTaskId");
	expect(() => takeRetainedNativeAccountingIntegration({ ...token })).toThrow();
	const retained = takeRetainedNativeAccountingIntegration(token);
	expect(retained.input).toBe(f.input);
	expect(() => takeRetainedNativeAccountingIntegration(token)).toThrow();
	f.flow.hold("refused");
});

it("holds complete original reservation on unknown producer instead of admitting native or retrying", async () => {
	const f = await fixture({ unknown: true }),
		cap = await f.flow.prepare(f.binding, f.source);
	await expect(
		f.flow.runProducer(cap, f.operation, async () => ({
			trace: f.traceRef,
			value: Symbol("retained"),
		})),
	).rejects.toThrow();
	await expect(
		f.flow.runProducer(cap, f.operation, async () => ({ trace: f.traceRef, value: 1 })),
	).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.producer")).toHaveLength(1);
	expect(f.frames.filter((x) => x.method === "phase.link_native")).toHaveLength(0);
	expect(
		JSON.parse(await readFile(join(f.root, "reservation.record"), "utf8")).reservedUpper,
	).toMatchObject({ producerLifecycles: 1, reads: 1, controls: 2 });
});

it("refuses unselected full plan before sending prepare", async () => {
	const f = await fixture({ wrongPolicy: true });
	await expect(f.flow.prepare(f.binding, f.source)).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.prepare")).toHaveLength(0);
});

it("refuses legacy complete history as authority for the new isolated tranche", async () => {
	const f = await fixture(),
		read = history.readOriginalHistory;
	vi.spyOn(history, "readOriginalHistory").mockImplementation(async (selection) => {
		const { isolation: _historicalNewRun, ...legacy } = await read(selection);
		return legacy;
	});
	await expect(f.flow.prepare(f.binding, f.source)).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.producer")).toHaveLength(0);
});

it("retains create-only native link but publishes no integration after lost/held ACK", async () => {
	const f = await fixture({ holdLink: true }),
		cap = await f.flow.prepare(f.binding, f.source);
	await f.flow.runProducer(cap, f.operation, async () => ({ trace: f.traceRef, value: 1 }));
	const pending = f.flow.linkNative(cap, {
		input: f.input,
		ownerAuthority: f.ownerAuthority,
		producerTaskId: "synthetic-task",
	});
	for (let i = 0; i < 100 && !f.frames.some((x) => x.type === "callback_result" && x.id === 2); i++)
		await new Promise((r) => setTimeout(r, 5));
	f.flow.hold("lost-reply");
	await expect(pending).rejects.toThrow();
	expect(
		JSON.parse(await readFile(join(f.root, ".auracall-original-native-link.json"), "utf8"))
			.nativeContext.receiptDigest,
	).toBe(f.receipt);
	await expect(
		f.flow.linkNative(cap, {
			input: f.input,
			ownerAuthority: f.ownerAuthority,
			producerTaskId: "synthetic-task",
		}),
	).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.link_native")).toHaveLength(1);
});

it.each([
	"unrecognized-input",
	"wrong-producer-task",
	"consumer-as-owner",
] as const)("refuses %s at actual native linkage without publishing integration", async (fault) => {
	const f = await fixture(),
		cap = await f.flow.prepare(f.binding, f.source);
	await f.flow.runProducer(cap, f.operation, async () => ({ trace: f.traceRef, value: 1 }));
	const input =
		fault === "unrecognized-input"
			? Object.freeze({ kind: "auracall-own-sdk-runtime-input" as const })
			: f.input;
	const ownerAuthority =
		fault === "consumer-as-owner"
			? { ...f.ownerAuthority, principalId: "consumer", capabilityId: "consumer-capability" }
			: f.ownerAuthority;
	await expect(
		f.flow.linkNative(cap, {
			input,
			ownerAuthority,
			producerTaskId: fault === "wrong-producer-task" ? "other-task" : "synthetic-task",
		}),
	).rejects.toThrow();
	await expect(readFile(join(f.root, ".auracall-original-native-link.json"))).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.link_native")).toHaveLength(1);
});

it("rejects a complete-shaped producer trace that drops a native control debit", async () => {
	const f = await fixture({ wrongNativeCost: true }),
		cap = await f.flow.prepare(f.binding, f.source);
	await expect(
		f.flow.runProducer(cap, f.operation, async () => ({ trace: f.traceRef, value: 1 })),
	).rejects.toThrow();
	expect(f.frames.filter((x) => x.method === "phase.link_native")).toHaveLength(0);
});
