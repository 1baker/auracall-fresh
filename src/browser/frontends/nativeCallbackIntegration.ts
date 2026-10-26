import { createNativeCallbackPeer, type NativeCallbackPeerOptions } from "./nativeCallbackPeer.js";
import { createNativeOperatorIntegration, type NativeOperatorOptions } from "./nativeOperator.js";

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
	const lifetime = Object.freeze({
		...integration.lifetime,
		assertAcquiredCurrent(
			context: Parameters<typeof integration.lifetime.assertAcquiredCurrent>[0],
		) {
			peer.assertCurrent();
			integration.lifetime.assertAcquiredCurrent(context);
		},
		async uncertain(context: Parameters<typeof integration.lifetime.uncertain>[0], reason: string) {
			peer.hold();
			await integration.lifetime.uncertain(context, reason);
		},
	});
	return Object.freeze({
		dependencies: Object.freeze({ ...integration, lifetime, taskReceiver: peer.taskReceiver }),
		authority: peer.finite,
	});
}
