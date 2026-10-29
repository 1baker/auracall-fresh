import { z } from "zod";
/** Closed data shapes from b9e5/a0f5 inherited phase schema 28bbfc0c.
 * Parsing is never participant, policy-selection or native authority. */
export const sourcePinSchema = z
	.object({
		path: z.string().min(1).max(4096),
		sha256: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const ownerSchema = z
	.object({
		pid: z.number().int().min(1).max(4294967295),
		startToken: z.string().min(1).max(256),
		binarySha256: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const fileIdentitySchema = z
	.object({
		device: z.string().regex(/^(0|[1-9][0-9]*)$/),
		inode: z.string().regex(/^(0|[1-9][0-9]*)$/),
		uid: z.number().int().min(0).max(4294967295),
		mode: z.literal("0600"),
	})
	.strict();
export const recordRefSchema = z
	.object({
		relativePath: z.string().min(1).max(4096),
		identity: fileIdentitySchema,
		size: z.number().int().min(1).max(1048576),
		sha256: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const controllerSchema = z
	.object({
		pid: z.number().int().min(1).max(4294967295),
		startToken: z.string().min(1).max(256),
		sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
		generation: z.string().min(1).max(256),
	})
	.strict();
export const participantCorrelationSchema = z
	.object({
		instanceId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
		sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
		controller: controllerSchema,
		reservationJournal: fileIdentitySchema,
	})
	.strict();
export const bindingSchema = z
	.object({
		approvalSha256: z.literal("2663ec8f067a3dd531c6ee2934cf86072d3d1bbccff6ca85b926f06f3bc821d5"),
		adjudicationSha256: z.literal(
			"10515b538116cf187f4eab3177e7e9616b49a662209978d8d23b434cb4018f89",
		),
		runReference: z.literal("p266-isolated-acceptance-20261027-2663ec8f"),
		allocationIdentitySha256: z.literal(
			"2df22702920b1b246df0c1838745ecf83beca678cc0bd5a2f0a7984b613aa12b",
		),
		namespace: z.literal("p266new"),
		realmPinSha256: z.string().regex(/^[0-9a-f]{64}$/),
		policyScopeDigest: z.string().regex(/^[0-9a-f]{64}$/),
		producerContractSha256: z.literal(
			"703498fba269666d4d68e8000790e5eeaaee78cc588d132319c4102b75dce98f",
		),
		producerOperationId: z
			.string()
			.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
		producerIntentDigest: z.string().regex(/^[0-9a-f]{64}$/),
		taskClaimKey: z.string().regex(/^[0-9a-f]{64}$/),
		expectedOwner: ownerSchema,
		ownerTransportSession: z.string().min(1).max(1024),
		expiresAtMs: z.number().int().min(1).max(9007199254740991),
		participant: participantCorrelationSchema,
	})
	.strict();
export const policyUpperSchema = z
	.object({
		consumerAcquisitions: z.literal(0),
		producerLifecycles: z.literal(1),
		reads: z.number().int().min(0).max(80),
		controls: z.number().int().min(0).max(6),
		drafts: z.literal(0),
		sends: z.literal(0),
		localStateReads: z.number().int().min(0).max(4294967295),
	})
	.strict();
export const policyDeltaSchema = z
	.object({
		consumerAcquisitions: z.literal(0),
		producerLifecycles: z.number().int().min(0).max(1),
		reads: z.number().int().min(0).max(80),
		controls: z.number().int().min(0).max(6),
		drafts: z.literal(0),
		sends: z.literal(0),
		localStateReads: z.number().int().min(0).max(4294967295),
	})
	.strict();
export const sourceOperationSchema = z
	.object({
		operationKey: z.string().min(1).max(256),
		source: sourcePinSchema,
		symbol: z.string().min(1).max(1024),
		method: z.string().min(1).max(256),
		maxStarts: z.literal(1),
		readsUpper: z.number().int().min(0).max(80),
		controlsUpper: z.number().int().min(0).max(6),
		localStateReadsUpper: z.number().int().min(0).max(4294967295),
		classificationEvidence: sourcePinSchema,
	})
	.strict();
export const planRowSchema = z
	.object({
		step: z.enum([
			"freshness",
			"initialize",
			"open",
			"open_state",
			"acquire_initial_tab",
			"target_state",
			"navigate",
			"url",
			"final_state",
		]),
		nativeMethod: z.enum([
			"freshness_snapshot",
			"initialize_fresh_host",
			"open_disposable",
			"read_durable_state",
			"acquire_initial_tab",
			"Page.navigate",
			"Target.getTargetInfo",
		]),
		coveredSourceOperations: z.array(sourceOperationSchema).min(1).max(128),
		policyUpper: policyDeltaSchema,
	})
	.strict();
export const planSchema = z
	.object({
		schemaVersion: z.literal("p266.producer-policy-plan.v1"),
		nativePlanVersion: z.literal("agent-browser.producer-step-budget.v1"),
		mappingVersion: z.string().min(1).max(256),
		mappingSource: sourcePinSchema,
		qualificationEvidence: z.array(sourcePinSchema).min(1).max(64),
		producerContractSha256: z.literal(
			"703498fba269666d4d68e8000790e5eeaaee78cc588d132319c4102b75dce98f",
		),
		rows: z.array(planRowSchema).min(9).max(9),
		upper: policyUpperSchema,
		sharedNewRunCaps: z
			.object({
				consumerAcquisitions: z.literal(1),
				reads: z.literal(80),
				controls: z.literal(6),
				sends: z.literal(1),
			})
			.strict(),
		producerLifecycleLimit: z.literal(1),
	})
	.strict();
export const reservationSchema = z
	.object({
		schemaVersion: z.literal("p266.producer-pre-reservation.v1"),
		binding: bindingSchema,
		bindingDigest: z.string().regex(/^[0-9a-f]{64}$/),
		planDigest: z.string().regex(/^[0-9a-f]{64}$/),
		reservationId: z
			.string()
			.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
		previousReservationDigest: z.union([z.string().regex(/^[0-9a-f]{64}$/), z.null()]),
		journalSequence: z.number().int().min(1).max(9007199254740991),
		previousJournalHash: z.string().regex(/^[0-9a-f]{64}$/),
		reservedUpper: policyUpperSchema,
	})
	.strict();
export const nativeCostSchema = z
	.object({
		acquisitions: z.number().int().min(0).max(4294967295),
		reads: z.number().int().min(0).max(4294967295),
		controls: z.number().int().min(0).max(4294967295),
		localStateReads: z.number().int().min(0).max(4294967295),
	})
	.strict();
export const nativeIdentitySchema = z
	.object({
		taskId: z.string().min(1).max(1024),
		profileId: z.string().min(1).max(1024),
		browserId: z.string().min(1).max(1024),
		tabId: z.union([z.string().min(1).max(1024), z.null()]),
		targetId: z.union([z.string().min(1).max(1024), z.null()]),
	})
	.strict();
export const nativeEventSchema = z
	.object({
		eventId: z.string().min(1).max(128),
		sequence: z.number().int().min(1).max(64),
		step: z.enum([
			"freshness",
			"initialize",
			"open",
			"open_state",
			"acquire_initial_tab",
			"target_state",
			"navigate",
			"url",
			"final_state",
		]),
		status: z.enum(["started", "completed", "refused", "unknown"]),
		startEventId: z.union([z.string().min(1).max(128), z.null()]),
		nativeMethod: z.union([
			z.enum([
				"freshness_snapshot",
				"initialize_fresh_host",
				"open_disposable",
				"read_durable_state",
				"acquire_initial_tab",
				"Page.navigate",
				"Target.getTargetInfo",
			]),
			z.null(),
		]),
		cost: nativeCostSchema,
		nativeIdentity: z.union([nativeIdentitySchema, z.null()]),
		errorCode: z.union([
			z.enum([
				"producer_invalid",
				"producer_owner_changed",
				"producer_unavailable",
				"producer_expired",
				"producer_not_fresh",
				"producer_task_conflict",
				"producer_already_attempted",
				"producer_readback_required",
				"producer_journal_invalid",
				"producer_storage_uncertain",
				"producer_step_failed",
			]),
			z.null(),
		]),
	})
	.strict();
export const nativeResultTupleSchema = z
	.object({
		taskId: z.string().min(1).max(1024),
		profileId: z.string().min(1).max(1024),
		browserId: z.string().min(1).max(1024),
		tabId: z.string().min(1).max(1024),
		targetId: z.string().min(1).max(1024),
		url: z.string().min(1).max(8192),
	})
	.strict();
export const nativeResultSchema = z
	.object({
		schemaVersion: z.literal("agent-browser.producer-open-result.v1"),
		operationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
		intentDigest: z.string().regex(/^[0-9a-f]{64}$/),
		ownerTransportSession: z.string().min(1).max(1024),
		ownerProcessDigest: z.string().regex(/^[0-9a-f]{64}$/),
		state: z.enum(["completed", "unknown", "unavailable"]),
		steps: z.array(nativeEventSchema).min(0).max(64),
		result: z.union([nativeResultTupleSchema, z.null()]),
		fresh: z.literal(false),
		errorCode: z.union([
			z.enum([
				"producer_invalid",
				"producer_owner_changed",
				"producer_unavailable",
				"producer_expired",
				"producer_not_fresh",
				"producer_task_conflict",
				"producer_already_attempted",
				"producer_readback_required",
				"producer_journal_invalid",
				"producer_storage_uncertain",
				"producer_step_failed",
			]),
			z.null(),
		]),
	})
	.strict();
export const policyEventSchema = z
	.object({
		eventId: z.string().min(1).max(128),
		planRow: z.enum([
			"freshness",
			"initialize",
			"open",
			"open_state",
			"acquire_initial_tab",
			"target_state",
			"navigate",
			"url",
			"final_state",
		]),
		sourceOperationKeys: z.array(z.string().min(1).max(256)).min(1).max(128),
		startEventId: z.union([z.string().min(1).max(128), z.null()]),
		delta: policyDeltaSchema,
	})
	.strict();
export const traceSchema = z
	.object({
		schemaVersion: z.literal("p266.producer-policy-trace.v1"),
		bindingDigest: z.string().regex(/^[0-9a-f]{64}$/),
		reservationDigest: z.string().regex(/^[0-9a-f]{64}$/),
		planDigest: z.string().regex(/^[0-9a-f]{64}$/),
		nativeJournal: recordRefSchema,
		nativeResultRecord: recordRefSchema,
		nativeResult: nativeResultSchema,
		mappedEvents: z.array(policyEventSchema).min(0).max(64),
		heldTotals: policyDeltaSchema,
		terminalJournalSequence: z.number().int().min(1).max(9007199254740991),
		terminalJournalHash: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const carrySchema = z
	.object({
		schemaVersion: z.literal("p266.producer-local-carry.v1"),
		binding: bindingSchema,
		plan: planSchema,
		reservation: reservationSchema,
		reservationRecord: recordRefSchema,
		trace: traceSchema,
		traceRecord: recordRefSchema,
	})
	.strict();
export const directoryIdentitySchema = z
	.object({
		device: z.string().regex(/^(0|[1-9][0-9]*)$/),
		inode: z.string().regex(/^(0|[1-9][0-9]*)$/),
		uid: z.number().int().min(0).max(4294967295),
		mode: z.literal("0700"),
	})
	.strict();
export const actorLineageSchema = z
	.object({
		actorInstanceId: z
			.string()
			.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
		participantCorrelation: participantCorrelationSchema,
		runBindingDigest: z.string().regex(/^[0-9a-f]{64}$/),
		actorSource: sourcePinSchema,
		accountingRootIdentity: directoryIdentitySchema,
		originalReservationDigest: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const preProducerPhaseRecordSchema = z
	.object({
		schemaVersion: z.literal("p266.preproducer-accounting-phase.v2"),
		binding: bindingSchema,
		plan: planSchema,
		reservation: reservationSchema,
		reservationRecord: recordRefSchema,
		actorLineage: actorLineageSchema,
	})
	.strict();
export const nativeContextSchema = z
	.object({
		receiptDigest: z.string().regex(/^[0-9a-f]{64}$/),
		producerSha256: z.string().regex(/^[0-9a-f]{64}$/),
		expiresAtMs: z.number().int().min(1).max(9007199254740991),
	})
	.strict();
export const nativeLinkSchema = z
	.object({
		schemaVersion: z.literal("p266.verified-native-phase-link.v2"),
		runBindingDigest: z.string().regex(/^[0-9a-f]{64}$/),
		actorLineageDigest: z.string().regex(/^[0-9a-f]{64}$/),
		reservationDigest: z.string().regex(/^[0-9a-f]{64}$/),
		completedProducerTraceDigest: z.string().regex(/^[0-9a-f]{64}$/),
		nativeInputRecord: recordRefSchema,
		privateBindingRecord: recordRefSchema,
		inputHash: z.string().regex(/^[0-9a-f]{64}$/),
		bindingHash: z.string().regex(/^[0-9a-f]{64}$/),
		nativeContext: nativeContextSchema,
		actualProducerTaskId: z.string().min(1).max(1024),
		nativeRuntimeSource: sourcePinSchema,
		phaseJoinSource: sourcePinSchema,
		linkJournalSequence: z.number().int().min(1).max(9007199254740991),
		previousJournalHash: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();
export const nativeLinkedCarrySchema = z
	.object({
		schemaVersion: z.literal("p266.same-actor-native-linked-carry.v2"),
		preproducer: preProducerPhaseRecordSchema,
		producerCarry: carrySchema,
		nativeLink: nativeLinkSchema,
		nativeLinkRecord: recordRefSchema,
	})
	.strict();
export type ProducerBinding = z.infer<typeof bindingSchema>;
export type ProducerPlan = z.infer<typeof planSchema>;
export type ProducerReservation = z.infer<typeof reservationSchema>;
export type ProducerTrace = z.infer<typeof traceSchema>;
export type ProducerCarry = z.infer<typeof carrySchema>;
export type ProducerNativeLink = z.infer<typeof nativeLinkSchema>;
export type ProducerRecordRef = z.infer<typeof recordRefSchema>;
export type ProducerNativeContext = z.infer<typeof nativeContextSchema>;
export type ProducerNativeResult = z.infer<typeof nativeResultSchema>;
export type ProducerPreProducerPhaseRecord = z.infer<typeof preProducerPhaseRecordSchema>;
