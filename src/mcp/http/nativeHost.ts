import { once } from "node:events";
import type { Server } from "node:http";
import { Readable, Writable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError, PingRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { FrontendTools } from "../../browser/frontends/config.js";
import {
	createOriginalAccountedNativeCallbackIntegration,
	type PreparedNativeRun,
	type RetainedNativeAccountingIntegration,
	type RetainedPreparedNativeRun,
	takeRetainedNativeAccountingIntegration,
	takeRetainedPreparedNativeRun,
} from "../../browser/frontends/nativeCallbackIntegration.js";
import type {
	ProducerDescriptor,
	ProducerLocalResult,
} from "../../browser/frontends/nativeCallbackPeer.js";
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

export interface PreparedNativeFrontendStdioOptions {
	prepared: RetainedPreparedNativeRun;
	intent: NativeSendIntent;
	channel: NativePrivateFrontendChannel;
}

/** Connect once using the SAME prepared factory. Producer startup and actual
 * native linking are explicit local operations, never MCP ping/tool effects.
 * Guarded ping checks the retained run only; it is not canonical authority or
 * terminal proof. The actual source-bound channel/provider remains required.
 */
export async function startPreparedNativeFrontendStdioHost(
	options: PreparedNativeFrontendStdioOptions,
) {
	const prepared = takeRetainedPreparedNativeRun(options.prepared);
	try {
		return await startPrivateNativeStdioHost(options, { prepared });
	} catch (error) {
		try {
			prepared.hold("refused");
		} catch {
			/* Same consumed actor remains retained. */
		}
		throw error;
	}
}

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

/** Consume the SAME phase factory's opaque result once. No accounting factory
 * reentry, protocol switch or second sender/runtime during producer promotion. */
export async function startRetainedNativeFrontendStdioHost(
	options: Omit<OwnNativeFrontendStdioOptions, "input" | "dependencies" | "authority"> & {
		integration: RetainedNativeAccountingIntegration;
	},
) {
	const retained = takeRetainedNativeAccountingIntegration(options.integration);
	return startOwnNativeFrontendStdioHost({
		channel: options.channel,
		intent: options.intent,
		...retained,
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
	const host = await startPrivateNativeStdioHost(options, { native: options });
	if (!host.runtime) refuse();
	return Object.freeze({ runtime: host.runtime, server: host.server });
}

async function startPrivateNativeStdioHost(
	options: Pick<OwnNativeFrontendStdioOptions, "intent" | "channel">,
	mode: { native: OwnNativeFrontendStdioOptions } | { prepared: PreparedNativeRun },
) {
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
	const prepared = "prepared" in mode ? mode.prepared : undefined;
	let held = false,
		holdStarted = false,
		preparedHoldStarted = false,
		busy = false,
		promotionAttempted = false,
		runtime: OwnNativeProRuntime | undefined,
		bound: Awaited<ReturnType<typeof bindFrontend>> | undefined;
	const lose = () => {
		held = true;
		if (prepared && !preparedHoldStarted) {
			preparedHoldStarted = true;
			try {
				prepared.hold("currentness-lost");
			} catch {
				/* Retain without a hold ACK. */
			}
		}
		if (runtime && !holdStarted) {
			holdStarted = true;
			void runtime.hold().catch(() => {});
		}
	};
	const current = () => {
		if (held || input.destroyed || input.readableEnded || output.destroyed || output.writableEnded)
			refuse();
	};
	const check = async (stage: NativePrivateChannelCheck["stage"], scope: FrontendScope | null) => {
		try {
			current();
			if (prepared) await prepared.assertCurrent();
			current();
			await assertCurrent(Object.freeze({ stage, scope, routeId, intent }));
			current();
			if (prepared) await prepared.assertCurrent();
			current();
		} catch {
			lose();
			throw new FrontendError(
				"native_private_channel_unqualified",
				"Reconcile the original private channel; do not reconnect or replay.",
			);
		}
	};
	const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
		if (busy) {
			lose();
			refuse();
		}
		busy = true;
		try {
			current();
			const value = await action();
			current();
			return value;
		} catch (error) {
			if (error instanceof NativeFrontendHostError) runtime = error.runtime;
			lose();
			throw error;
		} finally {
			busy = false;
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
		if ("native" in mode) {
			bound = await bindFrontend({ ...mode.native, intent }, routeId);
			runtime = bound.runtime;
		}
		await check("attach", null);
		const run = async (
			id: string,
			scope: FrontendScope,
			action: (service: FrontendTools) => Promise<Record<string, unknown>>,
		) => {
			if (id !== routeId) {
				lose();
				refuse();
			}
			const selected = bound;
			if (!selected)
				throw new FrontendError("native_frontend_not_ready", "Native linking is not complete.");
			const invoke = async () => {
				await check("before", scope);
				try {
					return await action(selected.service);
				} finally {
					await check("after", scope);
				}
			};
			return prepared ? exclusive(invoke) : invoke();
		};
		const service: FrontendTools = {
			inspect: (id) => run(id, "frontend:read", (service) => service.inspect(id)),
			configure: (id, effort) =>
				run(id, "frontend:configure", (service) => service.configure(id, effort)),
			send: (id, requestId, text, previous) =>
				run(id, "frontend:send", (service) => service.send(id, requestId, text, previous)),
			status: (id, requestId) =>
				run(id, "frontend:read", (service) => service.status(id, requestId)),
		};
		server = new McpServer({ name: "auracall-private-native-frontend", version: "1" });
		registerFrontendTools(server, service);
		if (prepared) {
			// Replace the SDK's automatic pong BEFORE connecting. This performs only
			// the actual retained run and channel checks; no producer or page action.
			server.server.setRequestHandler(PingRequestSchema, async (_request, extra) => {
				const cancelled = () => lose();
				extra.signal.addEventListener("abort", cancelled, { once: true });
				try {
					if (extra.signal.aborted) {
						lose();
						refuse();
					}
					await exclusive(() => check("attach", null));
					if (extra.signal.aborted) {
						lose();
						refuse();
					}
					return {};
				} catch {
					throw new McpError(ErrorCode.InvalidRequest, "Retained prepared run is held.");
				} finally {
					extra.signal.removeEventListener("abort", cancelled);
				}
			});
		}
		server.server.onclose = lose;
		server.server.onerror = lose;
		await server.connect(new StdioServerTransport(input, output, { maxBufferSize: 65536 }));
		await check("attach", null);
		return Object.freeze({
			get runtime() {
				return runtime;
			},
			server,
			runProducer: <T>(operation: ProducerDescriptor, run: () => Promise<ProducerLocalResult<T>>) =>
				exclusive(async () => {
					if (!prepared) refuse();
					const selected = structuredClone(operation);
					await check("attach", null);
					const value = await prepared.runProducer(selected, run);
					await check("attach", null);
					return value;
				}),
			linkNative: (actual: Parameters<PreparedNativeRun["linkNative"]>[0]) =>
				exclusive(async () => {
					if (!prepared || promotionAttempted || runtime) refuse();
					promotionAttempted = true;
					const selected = {
						input: actual.input,
						ownerAuthority: structuredClone(actual.ownerAuthority),
						producerTaskId: actual.producerTaskId,
					};
					await check("attach", null);
					const token = await prepared.linkNative(selected);
					current();
					const retained = takeRetainedNativeAccountingIntegration(token);
					bound = await bindFrontend({ ...retained, intent }, routeId);
					runtime = bound.runtime;
					await check("attach", null);
					return runtime;
				}),
			readOriginalTrace: (original: Parameters<PreparedNativeRun["readOriginalTrace"]>[0]) =>
				exclusive(async () => {
					if (!prepared) refuse();
					const selected = structuredClone(original);
					await check("attach", null);
					const trace = await prepared.readOriginalTrace(selected);
					await check("attach", null);
					return trace;
				}),
		});
	} catch (error) {
		lose();
		await server?.close();
		if (runtime) {
			throw new NativeFrontendHostError(runtime);
		}
		throw error;
	}
}
