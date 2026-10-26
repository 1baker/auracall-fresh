import { once } from "node:events";
import type { Server } from "node:http";
import {
	type NativeFiniteAuthority,
	type NativeSendIntent,
	nativeSendIntentSchema,
} from "../../browser/frontends/nativeFiniteSend.js";
import {
	bindOwnNativeSendFrontend,
	type NativeRuntimeDependencies,
	type NativeRuntimeInput,
	type OwnNativeProRuntime,
	startOwnNativeRuntime,
} from "../../browser/frontends/nativeRuntime.js";
import { FrontendError } from "../../browser/frontends/types.js";
import { type FrontendHttpConfig, validateFrontendHttpConfig } from "./config.js";
import { createFrontendHttpServer } from "./server.js";

/** A private compiled operator supplies actual authority, never JSON callbacks.
 * Production uses the receiver's pinned SDK connector; no injected connector.
 */
export interface OwnNativeFrontendHostOptions {
	input: NativeRuntimeInput;
	dependencies: Required<Omit<NativeRuntimeDependencies, "connect" | "taskReceiver">> &
		Pick<NativeRuntimeDependencies, "taskReceiver">;
	intent: NativeSendIntent;
	authority: NativeFiniteAuthority;
	http: FrontendHttpConfig;
}

export interface OwnNativeFrontendHost {
	readonly runtime: OwnNativeProRuntime;
	readonly server: Server;
}

/** Private caller retains the SAME held runtime for original-only reconciliation.
 * The handle is deliberately absent from error serialization and log properties.
 */
export class NativeFrontendHostError extends FrontendError {
	#runtime: OwnNativeProRuntime;
	constructor(runtime: OwnNativeProRuntime) {
		super("native_frontend_host_unqualified", "Reconcile the retained original host runtime.");
		this.#runtime = runtime;
	}
	get runtime(): OwnNativeProRuntime {
		return this.#runtime;
	}
}

function refuse(): never {
	throw new FrontendError(
		"native_frontend_host_unqualified",
		"Use the original private host composition and reconcile it before another start.",
	);
}

/** Executable home-host composition for an admitted private operator bootstrap.
 * Acquires ONCE, binds the finite facade to that SAME runtime, then listens using
 * the existing authenticated frontend MCP server. It never dispatches a prompt.
 * Bastion P447 remains the canonical store/claim/sender via the existing MCP client.
 * No environment defaults, service installation, signals, stdin lifetime, release,
 * reconnect or retry. The operator must supervise this process independently of SSH.
 */
export async function startOwnNativeFrontendHost(
	options: OwnNativeFrontendHostOptions,
): Promise<OwnNativeFrontendHost> {
	// Reject incomplete ingress/finite bindings before acquisition. In particular,
	// do not inherit the generic HTTP factory's default port or relay-store mode.
	const config = validateFrontendHttpConfig(options.http);
	if (
		options.http.mode !== "frontend" ||
		options.http.port === undefined ||
		config.routeIds.length !== 1 ||
		!options.dependencies ||
		"connect" in options.dependencies ||
		!options.authority ||
		["verify", "assertClaim", "protect", "assertCurrent"].some(
			(name) => typeof options.authority[name as keyof NativeFiniteAuthority] !== "function",
		)
	)
		refuse();
	const intent = Object.freeze(nativeSendIntentSchema.parse(options.intent));
	const runtime = await startOwnNativeRuntime(options.input, options.dependencies);
	let server: Server | undefined;
	try {
		if (runtime.route.id !== config.routeIds[0] || runtime.state !== "active") refuse();
		const service = await bindOwnNativeSendFrontend(runtime, intent, options.authority);
		if (runtime.state !== "active") refuse();
		server = createFrontendHttpServer({ config, service });
		server.listen(config.port, "127.0.0.1");
		await once(server, "listening");
		if (runtime.state !== "active") refuse();
		return Object.freeze({ runtime, server });
	} catch {
		// Hold first: uncertain acquisition/binding/listen is never a second Open.
		// Closing this owned HTTP listener does not release the retained consumer.
		try {
			await runtime.hold();
		} catch {
			// hold() marks the runtime held synchronously. Preserve the handle even
			// if its journal/operator acknowledgement fails; do not claim a saved hold.
		} finally {
			if (server?.listening) server.close();
		}
		throw new NativeFrontendHostError(runtime);
	}
}
