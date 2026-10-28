import { once } from "node:events";
import type { Server } from "node:http";
import { Readable, Writable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { FrontendTools } from "../../browser/frontends/config.js";
import { createOriginalAccountedNativeCallbackIntegration } from "../../browser/frontends/nativeCallbackIntegration.js";
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
import { registerFrontendTools } from "../tools/frontends.js";
import type { FrontendScope } from "./auth.js";
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

export interface NativePrivateChannelCheck {
	readonly routeId: string;
	readonly intent: NativeSendIntent;
	readonly stage: "attach" | "before" | "after";
	readonly scope: FrontendScope | null;
}

/** A compiled operator binds actual peer/authenticated channel and home lifetime.
 * Explicit streams are not proof of authority. No JSON, process stdio defaults,
 * SSH launcher, credentials or reconnection policy is accepted here. */
export interface NativePrivateFrontendChannel {
	readonly input: Readable;
	readonly output: Writable;
	readonly routeId: string;
	assertCurrent(check: NativePrivateChannelCheck): Promise<void>;
}

export type OwnNativeFrontendStdioOptions = Omit<OwnNativeFrontendHostOptions, "http"> & {
	channel: NativePrivateFrontendChannel;
};

/** One concrete private bootstrap; complete history and actual original guard
 * selection must pass before the existing host can acquire a client. No launcher,
 * new server or JSON callback mode, and no caller-provided usage verifier. */
export async function startOriginalAccountedNativeFrontendHost(
	options: Omit<OwnNativeFrontendHostOptions, "dependencies" | "authority"> & {
		transport: Parameters<typeof createOriginalAccountedNativeCallbackIntegration>[1];
		accounting: Parameters<typeof createOriginalAccountedNativeCallbackIntegration>[2];
	},
) {
	const integration = await createOriginalAccountedNativeCallbackIntegration(
		options.input,
		options.transport,
		options.accounting,
	);
	return startOwnNativeFrontendHost({
		input: options.input,
		http: options.http,
		intent: options.intent,
		...integration,
	});
}

/** Alternative private transport for the SAME accounted host, never both hosts.
 * Platform qualifies the private channel; local accounting/finite authority do
 * not authenticate a network or stdio peer. */
export async function startOriginalAccountedNativeFrontendStdioHost(
	options: Omit<OwnNativeFrontendStdioOptions, "dependencies" | "authority"> & {
		transport: Parameters<typeof createOriginalAccountedNativeCallbackIntegration>[1];
		accounting: Parameters<typeof createOriginalAccountedNativeCallbackIntegration>[2];
	},
) {
	const integration = await createOriginalAccountedNativeCallbackIntegration(
		options.input,
		options.transport,
		options.accounting,
	);
	return startOwnNativeFrontendStdioHost({
		input: options.input,
		channel: options.channel,
		intent: options.intent,
		...integration,
	});
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

async function bindFrontend(options: Omit<OwnNativeFrontendHostOptions, "http">, routeId: string) {
	if (
		!routeId ||
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
	try {
		if (runtime.route.id !== routeId || runtime.state !== "active") refuse();
		const service = await bindOwnNativeSendFrontend(runtime, intent, options.authority);
		if (runtime.state !== "active") refuse();
		return { runtime, service };
	} catch {
		try {
			await runtime.hold();
		} catch {
			/* Retain the original even without hold ACK. */
		}
		throw new NativeFrontendHostError(runtime);
	}
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
		config.routeIds.length !== 1
	)
		refuse();
	const { runtime, service } = await bindFrontend(options, config.routeIds[0]);
	let server: Server | undefined;
	try {
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

/** Four existing frontend tools on one explicitly authenticated private channel.
 * Same runtime/facade and canonical P447 sender; no HTTP/JWT substitution, second
 * Open, process launch, auto-dispatch or browser release on channel loss. */
export async function startOwnNativeFrontendStdioHost(options: OwnNativeFrontendStdioOptions) {
	const channel = options.channel;
	if (
		!channel ||
		!(channel.input instanceof Readable) ||
		!(channel.output instanceof Writable) ||
		typeof channel.assertCurrent !== "function" ||
		!channel.routeId ||
		channel.routeId.length > 128
	)
		refuse();
	const { input, output, routeId } = channel;
	const assertCurrent = channel.assertCurrent.bind(channel);
	const intent = Object.freeze(nativeSendIntentSchema.parse(options.intent));
	let held = false,
		holdStarted = false,
		runtime: OwnNativeProRuntime | undefined;
	const lose = () => {
		held = true;
		if (runtime && !holdStarted) {
			holdStarted = true;
			void runtime.hold().catch(() => {});
		}
	};
	const check = async (stage: NativePrivateChannelCheck["stage"], scope: FrontendScope | null) => {
		try {
			if (
				held ||
				input.destroyed ||
				input.readableEnded ||
				output.destroyed ||
				output.writableEnded
			)
				refuse();
			await assertCurrent(Object.freeze({ stage, scope, routeId, intent }));
			if (
				held ||
				input.destroyed ||
				input.readableEnded ||
				output.destroyed ||
				output.writableEnded
			)
				refuse();
		} catch {
			lose();
			throw new FrontendError(
				"native_private_channel_unqualified",
				"Reconcile the original private channel; do not reconnect or replay.",
			);
		}
	};
	input.once("end", lose);
	input.once("close", lose);
	input.on("error", lose);
	output.once("close", lose);
	output.once("finish", lose);
	output.on("error", lose);
	let server: McpServer | undefined;
	try {
		await check("attach", null);
		const bound = await bindFrontend({ ...options, intent }, routeId);
		runtime = bound.runtime;
		await check("attach", null);
		const run = async (
			id: string,
			scope: FrontendScope,
			action: () => Promise<Record<string, unknown>>,
		) => {
			if (id !== routeId) {
				lose();
				refuse();
			}
			await check("before", scope);
			try {
				return await action();
			} finally {
				await check("after", scope);
			}
		};
		const service: FrontendTools = {
			inspect: (id) => run(id, "frontend:read", () => bound.service.inspect(id)),
			configure: (id, effort) =>
				run(id, "frontend:configure", () => bound.service.configure(id, effort)),
			send: (id, requestId, text, previous) =>
				run(id, "frontend:send", () => bound.service.send(id, requestId, text, previous)),
			status: (id, requestId) =>
				run(id, "frontend:read", () => bound.service.status(id, requestId)),
		};
		server = new McpServer({ name: "auracall-private-native-frontend", version: "1" });
		registerFrontendTools(server, service);
		server.server.onclose = lose;
		server.server.onerror = lose;
		await server.connect(new StdioServerTransport(input, output, { maxBufferSize: 65536 }));
		await check("attach", null);
		return Object.freeze({ runtime, server });
	} catch (error) {
		lose();
		await server?.close();
		if (runtime) {
			throw new NativeFrontendHostError(runtime);
		}
		throw error;
	}
}
