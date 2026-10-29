import {
	createNativeCallbackPeer,
	createProducerCallbackPeer,
	type NativeCallbackPeerOptions,
	type ProducerCallbackPeerOptions,
	type ProducerRunCapability,
	type ProducerPlanSource,
	type ProducerDescriptor,
	type ProducerLocalResult,
	type ProducerRunCurrentCheck,
} from "./nativeCallbackPeer.js";
import { isDeepStrictEqual } from "node:util";
import type { NativeFiniteAuthority } from "./nativeFiniteSend.js";
import { bindingSchema, type ProducerBinding } from "./nativeProducerPhaseRecords.js";
import {
	producerMetadataDigest as producerMetadata,
	type ProducerPolicySelection,
} from "./nativeProducerAccounting.js";
import { createNativeOperatorIntegration, type NativeOperatorOptions } from "./nativeOperator.js";
import {
	bindNativeOperatorIntegration,
	matchOriginalProducerNativeInput,
	producerNativeMatch,
	nativeRegisteredAuthoritySchema,
	type NativeRuntimeInput,
} from "./nativeRuntime.js";
import { openOriginalAccounting } from "./originalAccounting.js";
import type { OriginalAccountingSelection } from "./originalAccountingHistory.js";
import { FrontendError } from "./types.js";

/** Exact existing70 host dependencies, using ONE persistent Python peer.
 * Still requires the real private receiver, original accounting suppliers,
 * admitted inherited IPC, producer pins and frontend ingress. No defaults or
 * process acquisition; it cannot manufacture authority from JSON or filenames. */
export function createNativeCallbackIntegration(
	transport: NativeCallbackPeerOptions,
	options: Omit<NativeOperatorOptions, "guard" | "dispatchJoin" | "writer" | "supplier"> & {
		supplier: Omit<NativeOperatorOptions["supplier"], "assertCurrent">;
	},
) {
	const peer = createNativeCallbackPeer(transport);
	const integration = createNativeOperatorIntegration({
		...options,
		guard: peer.guard,
		dispatchJoin: peer.dispatchJoin,
		writer: peer.writer,
		supplier: {
			reserveObservationReads: options.supplier.reserveObservationReads.bind(options.supplier),
			observe: options.supplier.observe.bind(options.supplier),
			originalUsage: options.supplier.originalUsage.bind(options.supplier),
			assertCurrent: peer.assertNativeCurrent,
		},
	});
	return finish(peer, integration, peer.finite);
}

function finish(
	peer: ReturnType<typeof createNativeCallbackPeer>,
	integration: ReturnType<typeof createNativeOperatorIntegration>,
	authority: ReturnType<typeof createNativeCallbackPeer>["finite"],
) {
	const lifetime = Object.freeze({
		...integration.lifetime,
		assertAcquiredCurrent(
			context: Parameters<
				ReturnType<typeof createNativeOperatorIntegration>["lifetime"]["assertAcquiredCurrent"]
			>[0],
		) {
			peer.assertCurrent();
			integration.lifetime.assertAcquiredCurrent(context);
		},
		async uncertain(
			context: Parameters<
				ReturnType<typeof createNativeOperatorIntegration>["lifetime"]["uncertain"]
			>[0],
			reason: string,
		) {
			peer.hold();
			await integration.lifetime.uncertain(context, reason);
		},
	});
	return Object.freeze({
		dependencies: Object.freeze({ ...integration, lifetime, taskReceiver: peer.taskReceiver }),
		authority,
	});
}

/** Production accounting selection is explicit and read-only until qualification.
 * All usage/reservation callbacks are implemented here; only the separately owned
 * native witness actuator remains supplied by the admitted operator. */
export async function createOriginalAccountedNativeCallbackIntegration(
	input: NativeRuntimeInput,
	transport: NativeCallbackPeerOptions,
	options: Pick<NativeOperatorOptions, "ownerAuthority" | "producerTaskId"> & {
		selection: OriginalAccountingSelection;
		/** Explicit compiled binding, never a default or JSON authority. */
		observe: NativeOperatorOptions["supplier"]["observe"] | "same-peer";
	},
) {
	const selectedObserve = options?.observe;
	if (selectedObserve !== "same-peer" && typeof selectedObserve !== "function")
		throw new FrontendError(
			"native_observation_binding_invalid",
			"Select the existing private witness binding explicitly before accounting setup.",
		);
	const peer = createNativeCallbackPeer(transport);
	const witness =
		selectedObserve === "same-peer" ? peer.supplier.observe.bind(peer.supplier) : selectedObserve;
	let accounting: Awaited<ReturnType<typeof openOriginalAccounting>> | undefined;
	try {
		accounting = await openOriginalAccounting(options.selection, {
			context: transport.context,
			guard: peer.guard,
			writer: peer.writer,
			hold: peer.hold,
		});
		return await finishAccounted(peer, accounting, input, options, witness);
	} catch (error) {
		peer.hold();
		await accounting?.closeReadHandle();
		throw error;
	}
}

async function finishAccounted(
	peer: ReturnType<typeof createNativeCallbackPeer>,
	heldAccounting: Awaited<ReturnType<typeof openOriginalAccounting>>,
	input: NativeRuntimeInput,
	options: Pick<NativeOperatorOptions, "ownerAuthority" | "producerTaskId">,
	witness: NativeOperatorOptions["supplier"]["observe"] = peer.supplier.observe.bind(peer.supplier),
) {
	const integration = await bindNativeOperatorIntegration(
		input,
		{
			ownerAuthority: options.ownerAuthority,
			producerTaskId: options.producerTaskId,
			guard: peer.guard,
			dispatchJoin: peer.dispatchJoin,
			writer: heldAccounting.writer,
			supplier: {
				reserveObservationReads: async (context, reads) => {
					await heldAccounting.reserveObservationReads(context, reads);
					// The accounted carrier provider only verifies this SAME committed
					// record. Its ACK enables observation; it must never charge again.
					await heldAccounting.guarded(context, () =>
						peer.supplier.reserveObservationReads(context, reads),
					);
				},
				originalUsage: heldAccounting.originalUsage,
				observe: (context, nonce) => heldAccounting.observe(context, nonce, witness),
				assertCurrent: peer.assertNativeCurrent,
			},
		},
		peer.assertCurrent,
	);
	const authority: NativeFiniteAuthority = {
		verify: (context) =>
			heldAccounting.guarded(context, async () => {
				const evidence = await peer.finite.verify(context);
				heldAccounting.validateFiniteApproval(evidence);
				return evidence;
			}),
		assertClaim: (context) =>
			heldAccounting.guarded(context, () => peer.finite.assertClaim(context)),
		protect: (operation, run) =>
			peer.finite.protect(operation, () => heldAccounting.guarded(operation.context, run)),
		assertCurrent: (operation, stage) =>
			heldAccounting.guarded(operation.context, () => peer.finite.assertCurrent(operation, stage)),
	};
	return finish(peer, integration, Object.freeze(authority));
}

export interface RetainedNativeAccountingIntegration {
	readonly kind: "same-actor-native-accounting-integration";
}
type Accounted = Awaited<ReturnType<typeof finishAccounted>>;
const phaseIntegrations = new WeakMap<
	RetainedNativeAccountingIntegration,
	{ input: NativeRuntimeInput; integration: Accounted; used: boolean; current(): void }
>();
/** Owned host consumption only. A clone, JSON record or second host attempt
 * cannot reconstruct the retained integration or reenter the old factory. */
export function takeRetainedNativeAccountingIntegration(
	token: RetainedNativeAccountingIntegration,
) {
	const state = phaseIntegrations.get(token);
	if (!state || state.used)
		throw new FrontendError(
			"native_phase_integration_unqualified",
			"Use the same retained original host attempt.",
		);
	state.current();
	state.used = true;
	return { input: state.input, ...state.integration };
}

/** Explicit source-only v4 extension to the SAME accounted factory lifecycle.
 * No SDK acquisition, process creation, private defaults or startup JSON mode.
 * Real matching parent/participant and a qualified whole source plan are required. */
export function createPreproducerAccountedNativeCallbackIntegration(
	begin: { phase: "preproducer"; preproducerBinding: ProducerBinding },
	transport: ProducerCallbackPeerOptions,
	options: {
		selection: OriginalAccountingSelection;
		observe: "same-peer";
		policy: ProducerPolicySelection;
	},
) {
	if (begin.phase !== "preproducer" || options.observe !== "same-peer")
		throw new FrontendError(
			"native_phase_unqualified",
			"Explicit preproducer source composition required.",
		);
	const binding = bindingSchema.parse(structuredClone(begin.preproducerBinding));
	const selection = structuredClone(options.selection),
		policy = structuredClone(options.policy);
	const peer = createProducerCallbackPeer(transport);
	let actor: Awaited<ReturnType<typeof openOriginalAccounting>> | undefined;
	let capability: ProducerRunCapability | undefined,
		prepareAttempted = false,
		activationAttempted = false;
	let phase: "reserved" | "producer" | "producer-completed" | "native-link" = "reserved";
	let held = false,
		epoch = 0;
	peer.onHold(() => {
		if (!held) ++epoch;
		held = true;
		actor?.poison();
	});
	function current() {
		peer.assertCurrent();
		if (held)
			throw new FrontendError(
				"native_phase_held",
				"Preserve the same original accounting attempt.",
			);
	}
	function same(cap: ProducerRunCapability) {
		current();
		if (!capability || cap !== capability) {
			peer.hold();
			current();
		}
	}
	async function checked<T>(run: () => Promise<T>): Promise<T> {
		const captured = epoch;
		try {
			current();
			const result = await run();
			current();
			if (captured !== epoch) throw new Error("held");
			return result;
		} catch (error) {
			peer.hold();
			throw error;
		}
	}
	const assertPhase = async () => {
		current();
		if (!capability) throw new Error("unprepared");
		await peer.phase.assertCurrent(capability, {
			bindingDigest: producerMetadata(binding),
			operationId: binding.producerOperationId,
			phase,
			point: "before-dispatch",
		});
		current();
	};
	return Promise.resolve(
		Object.freeze({
			async prepare(actual: ProducerBinding, source: ProducerPlanSource) {
				if (prepareAttempted) {
					peer.hold();
					current();
				}
				prepareAttempted = true;
				return checked(async () => {
					if (!isDeepStrictEqual(actual, binding)) throw new Error("changed binding");
					const capturedSource = structuredClone(source);
					if (
						!policy ||
						policy.planDigest !== capturedSource.planDigest ||
						capturedSource.bindingDigest !== producerMetadata(binding)
					)
						throw new Error("unselected producer plan");
					capability = await peer.phase.prepare(binding, capturedSource);
					current();
					actor = await openOriginalAccounting(selection, {
						preproducer: {
							binding,
							source: capturedSource,
							ack: peer.phase.prepared(capability),
							policy,
							assertCurrent: assertPhase,
							current,
							nativeLinkPending: () => phase === "native-link",
						},
						guard: peer.guard,
						writer: peer.writer,
						hold: peer.hold,
					});
					current();
					return capability;
				});
			},
			async runProducer<T>(
				cap: ProducerRunCapability,
				operation: ProducerDescriptor,
				run: () => Promise<ProducerLocalResult<T>>,
			): Promise<T> {
				return checked(async () => {
					same(cap);
					const producer = actor?.producerPhase;
					if (!producer || phase !== "reserved") throw new Error("unprepared");
					const descriptor = structuredClone(operation);
					phase = "producer";
					const value = await peer.phase.runProducer(cap, descriptor, async () => {
						await producer.begin(descriptor);
						current();
						const produced = await run(),
							value = produced.value;
						peer.phase.retainProducerValue(value);
						current();
						const trace = structuredClone(produced.trace);
						// Retain original value in the peer before filesystem trace validation.
						await producer.complete(trace);
						current();
						return { trace, value };
					});
					current();
					producer.completedResult();
					phase = "producer-completed";
					return value;
				});
			},
			async assertCurrent(cap: ProducerRunCapability, check: ProducerRunCurrentCheck) {
				return checked(async () => {
					same(cap);
					await peer.phase.assertCurrent(cap, check);
					current();
				});
			},
			async readOriginalTrace(
				cap: ProducerRunCapability,
				original: { bindingDigest: string; operationId: string },
			) {
				return checked(async () => {
					same(cap);
					const result = await peer.phase.readOriginalTrace(cap, original);
					current();
					return result;
				});
			},
			async linkNative(
				cap: ProducerRunCapability,
				actual: { input: NativeRuntimeInput; ownerAuthority: unknown; producerTaskId: string },
			): Promise<RetainedNativeAccountingIntegration> {
				if (activationAttempted) {
					peer.hold();
					current();
				}
				activationAttempted = true;
				return checked(async () => {
					same(cap);
					const accounting = actor;
					const producer = accounting?.producerPhase;
					if (!accounting || !producer || phase !== "producer-completed")
						throw new Error("producer incomplete");
					const selectedActual = {
						input: actual.input,
						ownerAuthority: nativeRegisteredAuthoritySchema.parse(
							structuredClone(actual.ownerAuthority),
						),
						producerTaskId: actual.producerTaskId,
					};
					phase = "native-link";
					let matched: Awaited<ReturnType<typeof matchOriginalProducerNativeInput>> | undefined;
					await peer.phase.linkNative(cap, async () => {
						matched = await matchOriginalProducerNativeInput(
							selectedActual.input,
							binding,
							producer.completedResult(),
							selectedActual.producerTaskId,
							selectedActual.ownerAuthority,
							current,
						);
						current();
						const staged = await producer.stageNative(matched);
						current();
						return staged;
					});
					current();
					if (!matched) throw new Error("link missing");
					accounting.commitNativeContext(producerNativeMatch(matched).context);
					const integration = await finishAccounted(
						peer,
						accounting,
						selectedActual.input,
						selectedActual,
					);
					current();
					await assertPhase();
					current();
					const token: RetainedNativeAccountingIntegration = Object.freeze({
						kind: "same-actor-native-accounting-integration",
					});
					phaseIntegrations.set(token, {
						input: selectedActual.input,
						integration,
						used: false,
						current,
					});
					current();
					return token;
				});
			},
			hold(_reason: "refused" | "lost-reply" | "disconnect" | "currentness-lost") {
				peer.hold();
			},
		}),
	);
}
