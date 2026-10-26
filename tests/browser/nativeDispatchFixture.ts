import type { NativeLedgerWriter } from "../../src/browser/frontends/nativeLedgerWriter.js";
import type { NativeOperatorDispatchJoin } from "../../src/browser/frontends/nativeOperator.js";
import type { NativeRuntimeExecution } from "../../src/browser/frontends/nativeRuntime.js";

/** Synthetic callback forwarding only. No Python guard, admission or authority. */
export function fixtureDispatchJoin(events: string[] = []): NativeOperatorDispatchJoin {
	return {
		async admit_once(nonce, operation, validate) {
			events.push("admit_once");
			const completed = await operation(nonce);
			validate(completed.wire);
			return completed.value;
		},
		async acquired() {
			events.push("acquired");
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

/** Synthetic participant only, explicitly reuses the fixture's single driver. */
export function fixtureLedgerWriter(
	execution: NativeRuntimeExecution = fixtureDispatchJoin(),
): NativeLedgerWriter {
	return {
		protect: async (op, run) =>
			(op.bucket === "acquisition" ? execution.acquire : execution.protected_dispatch)(run),
		assertCurrent: async () => {},
	};
}
