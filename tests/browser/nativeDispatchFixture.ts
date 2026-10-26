import type { NativeOperatorDispatchJoin } from "../../src/browser/frontends/nativeOperator.js";

/** Synthetic callback forwarding only. No Python guard, admission or authority. */
export function fixtureDispatchJoin(events: string[] = []): NativeOperatorDispatchJoin {
	return {
		async admit_once(nonce, operation) {
			events.push("admit_once");
			return operation(nonce);
		},
		async qualify_budget(_context, operation) {
			events.push("qualify_budget");
			return operation();
		},
		async handshake(operation) {
			events.push("handshake");
			return operation();
		},
		async acquire(operation) {
			events.push("acquire");
			return operation();
		},
		async protected_dispatch(operation) {
			events.push("protected_dispatch");
			return operation();
		},
	};
}
