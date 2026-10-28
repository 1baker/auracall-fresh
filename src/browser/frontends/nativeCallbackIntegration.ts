import { createNativeCallbackPeer, type NativeCallbackPeerOptions } from "./nativeCallbackPeer.js";
import { createNativeOperatorIntegration, type NativeOperatorOptions } from "./nativeOperator.js";
import { bindNativeOperatorIntegration, type NativeRuntimeInput } from "./nativeRuntime.js";
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
		const heldAccounting = accounting;
		const integration = await bindNativeOperatorIntegration(input, {
			ownerAuthority: options.ownerAuthority,
			producerTaskId: options.producerTaskId,
			guard: peer.guard,
			dispatchJoin: peer.dispatchJoin,
			writer: accounting.writer,
			supplier: {
				reserveObservationReads: async (context, reads) => {
					await heldAccounting.reserveObservationReads(context, reads);
					// The accounted carrier provider only verifies this SAME committed
					// record. Its ACK enables observation; it must never charge again.
					await heldAccounting.guarded(context, () =>
						peer.supplier.reserveObservationReads(context, reads),
					);
				},
				originalUsage: accounting.originalUsage,
				observe: (context, nonce) => heldAccounting.observe(context, nonce, witness),
				assertCurrent: peer.assertNativeCurrent,
			},
		});
		const authority: typeof peer.finite = {
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
				heldAccounting.guarded(operation.context, () =>
					peer.finite.assertCurrent(operation, stage),
				),
		};
		return finish(peer, integration, Object.freeze(authority));
	} catch (error) {
		peer.hold();
		await accounting?.closeReadHandle();
		throw error;
	}
}
