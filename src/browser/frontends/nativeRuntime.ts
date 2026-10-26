import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { prepareRelayProOnly } from "../../mcp/relay/proPreparation.js";
import { RelayStore, relayId } from "../../mcp/relay/store.js";
import { NativeChatgptFrontend } from "./nativeChatgpt.js";
import {
	type NativeConsumerAdmission,
	NativeConsumerSession,
	type NativeMcpClient,
	parseNativeConsumerAdmission,
} from "./nativeConsumer.js";
import {
	matchNativeReadBudget,
	type NativeReadBudget,
	type NativeReadBudgetContext,
	revalidateNativeReadBudget,
} from "./nativeReadBudget.js";
import { FrontendError, type NativeTaskBinding, type NativeTaskFrontendRoute } from "./types.js";

/** Trusted source policy, never an authority or pin supplied by the private JSON. */
export interface NativeProducerPin {
	readonly binarySha256: string;
	readonly manifestSha256: string;
	/** Reviewed source-selected realm, never supplied by private input or ambient env. */
	readonly namespace?: "p266new";
}
export const P266_ENROLLMENT_PRODUCER: NativeProducerPin = Object.freeze({
	binarySha256: "e43ca62a0728551aa0221304f8559bc8af6b943b6b95efff8f3c080f1a53f114",
	manifestSha256: "6814c8cc7d7d8a2bc1bc57843c7cd7940eba11c427f6d38bf7dd4b7baf8d661b",
});

const id = z
	.string()
	.min(1)
	.max(1024)
	.refine((s) => s.trim() === s && ![...s].some((c) => c.charCodeAt(0) < 32));
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const absolute = z
	.string()
	.min(1)
	.max(4096)
	.refine((s) => !s.includes("\0") && isAbsolute(s) && resolve(s) === s);
const producerSchema = z
	.object({
		allocationId: id,
		profileId: id,
		browserId: id,
		tabId: id,
		targetId: id,
		ownerTransportSession: id,
		ownerGeneration: positive,
		publishedProcessDigest: hash,
		custodyDigest: hash,
		origin: z.literal("https://chatgpt.com"),
	})
	.strict();
const grantSchema = z
	.object({
		grantId: id,
		consumerTaskKey: id,
		producer: producerSchema,
		caller: z
			.object({
				principalId: id.max(256),
				profileId: id,
				capabilityId: id,
				capabilityRevision: positive,
				provenance: z.literal("registered_capability"),
			})
			.strict(),
		issuedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		expiresAtMs: positive,
	})
	.strict();
const optionsSchema = z
	.object({
		producerExecutable: absolute,
		producerManifest: absolute,
		producerHome: absolute,
		producerSocketDirectory: absolute,
		consumerLedgerDirectory: absolute,
		preparationDirectory: absolute,
		routeId: id.max(128),
		expectedModel: id.max(256),
		operationId: relayId,
		expectedUrl: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/),
	})
	.strict();
const inputSchema = z
	.object({
		version: z.literal("auracall.own-sdk-runtime.v1"),
		bindingOut: absolute,
		grant: grantSchema,
		admission: z.unknown(),
		options: optionsSchema,
	})
	.strict();

/** Opaque: logs/serialization cannot reveal the private consumer capability. */
export interface NativeRuntimeInput {
	readonly kind: "auracall-own-sdk-runtime-input";
}
interface ReceivedInput {
	admission: NativeConsumerAdmission;
	grant: z.infer<typeof grantSchema>;
	options: z.infer<typeof optionsSchema>;
	path: string;
	bindingOut: string;
	inputHash: string;
	bindingHash: string;
	pin: NativeProducerPin;
	now: () => number;
}
const inputs = new WeakMap<NativeRuntimeInput, ReceivedInput>();
const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
function refuse(code: string): never {
	throw new FrontendError(code, "Native SDK runtime held; preserve the original private records.");
}
function posix() {
	if (process.platform === "win32" || !process.getuid)
		refuse("native_runtime_private_posix_required");
}
async function privateDirectory(path: string) {
	const s = await lstat(path);
	if (
		!s.isDirectory() ||
		s.isSymbolicLink() ||
		s.uid !== process.getuid?.() ||
		s.mode & 0o077 ||
		(await realpath(path)) !== path
	)
		refuse("native_runtime_private_input_invalid");
}
async function file(path: string, privateInput: boolean, executable = false): Promise<Buffer> {
	if (!absolute.safeParse(path).success || (await realpath(path)) !== path)
		refuse("native_runtime_private_input_invalid");
	if (privateInput) await privateDirectory(dirname(path));
	const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = await fd.stat();
		if (
			!before.isFile() ||
			before.uid !== process.getuid?.() ||
			before.mode & (privateInput ? 0o077 : 0o022) ||
			before.size > (privateInput ? 65536 : 134217728) ||
			(executable && !(before.mode & 0o111))
		)
			refuse("native_runtime_private_input_invalid");
		const bytes = await fd.readFile();
		const after = await fd.stat();
		if (
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs ||
			bytes.length !== before.size
		)
			refuse("native_runtime_private_input_invalid");
		return bytes;
	} finally {
		await fd.close();
	}
}
async function verifyProducer(options: ReceivedInput["options"], pin: NativeProducerPin) {
	if (
		digest(await file(options.producerExecutable, false, true)) !== pin.binarySha256 ||
		digest(await file(options.producerManifest, false)) !== pin.manifestSha256
	)
		refuse("native_runtime_producer_pin_mismatch");
}
async function verifyReceived(data: ReceivedInput) {
	if (
		digest(await file(data.path, true)) !== data.inputHash ||
		digest(await file(data.bindingOut, true)) !== data.bindingHash
	)
		refuse("native_runtime_input_changed");
	for (const path of [
		data.options.producerHome,
		data.options.producerSocketDirectory,
		data.options.consumerLedgerDirectory,
		data.options.preparationDirectory,
	])
		await privateDirectory(path);
	await verifyProducer(data.options, data.pin);
	if (data.grant.expiresAtMs <= data.now()) refuse("native_runtime_admission_expired");
}

/** Local receiving format, NOT a native mode in the existing frontend JSON factory.
 * Parsing is not proof of grant admission; the producer's scoped authority fence
 * still validates the distinct registered consumer capability on acquisition.
 */
export async function readNativeRuntimeInput(
	path: string,
	pin: NativeProducerPin = P266_ENROLLMENT_PRODUCER,
	now: () => number = Date.now,
): Promise<NativeRuntimeInput> {
	try {
		posix();
		const selectedPin = Object.freeze({ ...pin });
		if (selectedPin.namespace !== undefined && selectedPin.namespace !== "p266new")
			refuse("native_runtime_namespace_unqualified");
		if (
			!hash.safeParse(selectedPin.binarySha256).success ||
			!hash.safeParse(selectedPin.manifestSha256).success
		)
			refuse("native_runtime_producer_pin_mismatch");
		const raw = await file(path, true);
		const parsed = inputSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
		);
		const admission = parseNativeConsumerAdmission(parsed.admission);
		const bindingBytes = await file(parsed.bindingOut, true);
		const binding = producerSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bindingBytes)),
		);
		const { grant, options } = parsed;
		if (
			JSON.stringify(binding) !== JSON.stringify(grant.producer) ||
			grant.caller.profileId !== binding.profileId ||
			admission.consumerGrantId !== grant.grantId ||
			admission.taskKey !== grant.consumerTaskKey ||
			admission.expiresAtMs !== grant.expiresAtMs ||
			["profileId", "browserId", "tabId", "targetId"].some(
				(k) => admission[k as keyof NativeConsumerAdmission] !== binding[k as keyof typeof binding],
			)
		)
			refuse("native_runtime_admission_mismatch");
		if (
			grant.issuedAtMs > now() ||
			grant.expiresAtMs <= now() ||
			grant.issuedAtMs >= grant.expiresAtMs
		)
			refuse("native_runtime_admission_expired");
		const dirs = [
			options.producerHome,
			options.producerSocketDirectory,
			options.consumerLedgerDirectory,
			options.preparationDirectory,
		];
		for (const dir of dirs) await privateDirectory(dir);
		const [ledger, preparation] = [options.consumerLedgerDirectory, options.preparationDirectory];
		if (
			ledger === preparation ||
			ledger.startsWith(`${preparation}${sep}`) ||
			preparation.startsWith(`${ledger}${sep}`)
		)
			refuse("native_runtime_ledger_scope_invalid");
		await verifyProducer(options, selectedPin);
		const token: NativeRuntimeInput = Object.freeze({ kind: "auracall-own-sdk-runtime-input" });
		inputs.set(token, {
			admission,
			grant,
			options,
			path,
			bindingOut: parsed.bindingOut,
			inputHash: digest(raw),
			bindingHash: digest(bindingBytes),
			pin: selectedPin,
			now,
		});
		return token;
	} catch (error) {
		if (error instanceof FrontendError) throw error;
		return refuse("native_runtime_private_input_invalid");
	}
}

export interface NativeSdkDescriptor {
	readonly command: string;
	readonly args: readonly ["mcp", "serve"];
	readonly env: Readonly<Record<string, string>>;
	readonly binarySha256: string;
}
export interface NativeRuntimeLifetimeContext {
	readonly receiptDigest: string;
	readonly producerSha256: string;
	readonly expiresAtMs: number;
	readonly nativeTask?: Readonly<NativeTaskBinding>;
}
/** Public operation metadata only; no private capability, selector or prompt. */
export type NativeRuntimeDispatch =
	| { readonly kind: "sdk_connect" | "acquire" }
	| {
			readonly kind: "command";
			readonly action: "url" | "snapshot" | "gettext" | "click" | "press";
			readonly operationKey: string;
	  }
	| { readonly kind: "original_readback" | "release"; readonly operationKey: string };
/** Trusted compiled integration, NOT a JSON switch or proof of authority.
 * qualify must cover the actual producer lifetime, SDK handshake failure behavior,
 * original shared limits and operator admission. The compiled retention policy
 * still requires a trusted admission verifier; none is supplied by ordinary startup.
 * uncertain preserves the original connection/task; it must not invent release.
 */
export interface NativeRuntimeLifetime {
	qualify(context: NativeRuntimeLifetimeContext): Promise<void>;
	/** Actual held guard/current authority, immediately before each dispatch. Never re-observe. */
	assertCurrent(
		context: NativeRuntimeLifetimeContext,
		dispatch: NativeRuntimeDispatch,
	): Promise<void>;
	/** Confirm initial admission freshness after validated acquisition, before use. */
	acquired(context: NativeRuntimeLifetimeContext): Promise<void>;
	/** Retain this SAME client privately for original readback. No close/release port. */
	retain(context: NativeRuntimeLifetimeContext, client: NativeMcpClient): Promise<void>;
	uncertain(context: NativeRuntimeLifetimeContext, reason: string): Promise<void>;
}
export interface NativeRuntimeDependencies {
	lifetime?: NativeRuntimeLifetime;
	/** Trusted compiled operator qualifier. Never read from the private input JSON.
	 * Required for this Pro-only runtime; missing or unknown carried accounting refuses.
	 */
	readBudget?: (context: NativeReadBudgetContext) => Promise<NativeReadBudget>;
	/** Source fixture seam; production defaults to the pinned SDK stdio connector. */
	connect?: (descriptor: NativeSdkDescriptor) => Promise<NativeMcpClient>;
}
export interface OwnNativeProRuntime {
	readonly route: NativeTaskFrontendRoute;
	readonly state: "active" | "held";
	prepareProOnly(): Promise<Record<string, unknown>>;
	originalReadback(originalKey: string): Promise<Record<string, unknown>>;
	releaseConsumerReference(originalKey: string): Promise<Record<string, unknown>>;
	hold(): Promise<void>;
}

// Strong references preserve uncertain connections. No release/clear API or
// automatic SDK.close/browser_close exists; release needs separate reconciliation.
const retainedClients = new Set<NativeMcpClient>();
function lifetimeRequired(dependencies: NativeRuntimeDependencies): NativeRuntimeLifetime {
	const policy = dependencies.lifetime;
	if (
		!policy ||
		typeof policy.qualify !== "function" ||
		typeof policy.assertCurrent !== "function" ||
		typeof policy.acquired !== "function" ||
		typeof policy.retain !== "function" ||
		typeof policy.uncertain !== "function"
	)
		refuse("native_runtime_lifetime_contract_required");
	return policy;
}
function readBudgetRequired(dependencies: NativeRuntimeDependencies) {
	if (typeof dependencies.readBudget !== "function") refuse("native_read_budget_required");
	return dependencies.readBudget;
}
function publicError(error: unknown): FrontendError {
	if (error instanceof FrontendError && /^(native|consumer|relay)_[a-z_]{1,100}$/.test(error.code))
		return error;
	return new FrontendError(
		"native_runtime_connection_unresolved",
		"Preserve the original native connection and its private records.",
	);
}
async function metadataFile(directory: string, name: string, value: unknown) {
	await privateDirectory(directory);
	const fd = await open(
		join(directory, name),
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
		0o600,
	);
	try {
		await fd.writeFile(JSON.stringify(value));
		await fd.sync();
	} finally {
		await fd.close();
	}
	const parent = await open(directory, constants.O_RDONLY);
	try {
		await parent.sync();
	} finally {
		await parent.close();
	}
}
async function holdOriginal(
	directory: string,
	lifetime: NativeRuntimeLifetime,
	context: NativeRuntimeLifetimeContext,
	reason: string,
) {
	try {
		// Fence in-memory pending dispatch before waiting on any filesystem work.
		// The original intent already prevents a fresh attempt after a crash.
		await lifetime.uncertain(context, reason);
	} catch {
		/* Preserve the original failure and retained connection, never clean up. */
	}
	try {
		await metadataFile(directory, "held.json", { version: 1, state: "held", context, reason });
	} catch {
		/* An existing or unavailable receipt never permits another connection. */
	}
}

async function verifySdkProcess(pid: number | null, expected: string) {
	if (!pid || !Number.isSafeInteger(pid)) refuse("native_runtime_process_pin_unqualified");
	const root = `/proc/${pid}`;
	const before = await readFile(`${root}/stat`, "utf8");
	const uid = (await lstat(root)).uid;
	const fd = await open(`${root}/exe`, constants.O_RDONLY);
	let actual: string;
	try {
		actual = digest(await fd.readFile());
	} finally {
		await fd.close();
	}
	const after = await readFile(`${root}/stat`, "utf8");
	const start = (stat: string) => stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
	if (
		uid !== process.getuid?.() ||
		!start(before) ||
		start(before) !== start(after) ||
		actual !== expected
	)
		refuse("native_runtime_process_pin_unqualified");
}
async function connectPinnedSdk(descriptor: NativeSdkDescriptor): Promise<NativeMcpClient> {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
	const client = new Client({ name: "auracall-own-native-runtime", version: "1" });
	retainedClients.add(client);
	const transport = new StdioClientTransport({
		command: descriptor.command,
		args: [...descriptor.args],
		env: { ...descriptor.env },
		stderr: "pipe",
	});
	// Never forward producer diagnostics/private arguments into model/tool logs.
	transport.stderr?.on("data", () => {});
	await client.connect(transport);
	// This checks our bridge executable before any consumer capability is sent.
	// The producer separately verifies its exact connected backend peer/generation.
	await verifySdkProcess(transport.pid, descriptor.binarySha256);
	return client;
}

function protectedDispatch(
	request: Parameters<NativeMcpClient["callTool"]>[0],
): NativeRuntimeDispatch {
	if (request.name === "browser_open") return Object.freeze({ kind: "acquire" });
	const operationKey = request.arguments.operationKey;
	if (typeof operationKey !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(operationKey))
		return refuse("native_runtime_dispatch_unqualified");
	if (request.name === "browser_continue" || request.name === "browser_close")
		return Object.freeze({
			kind: request.name === "browser_continue" ? "original_readback" : "release",
			operationKey,
		});
	const action = z
		.enum(["url", "snapshot", "gettext", "click", "press"])
		.safeParse(request.arguments.action);
	if (request.name !== "browser_command" || !action.success)
		return refuse("native_runtime_dispatch_unqualified");
	return Object.freeze({ kind: "command", action: action.data, operationKey });
}

class NativeProRuntime implements OwnNativeProRuntime {
	#state: "active" | "held" = "active";
	#route: NativeTaskFrontendRoute;
	#frontend: NativeChatgptFrontend;
	#store: RelayStore;
	#data: ReceivedInput;
	#lifetime: NativeRuntimeLifetime;
	#context: NativeRuntimeLifetimeContext;
	#directory: string;
	#session: NativeConsumerSession;
	constructor(
		data: ReceivedInput,
		lifetime: NativeRuntimeLifetime,
		context: NativeRuntimeLifetimeContext,
		directory: string,
		session: NativeConsumerSession,
	) {
		this.#data = data;
		this.#lifetime = lifetime;
		this.#context = context;
		this.#directory = directory;
		this.#session = session;
		// Only the public validated acquired binding supplies taskId/controlRef.
		const binding = Object.freeze(session.binding);
		this.#route = Object.freeze({
			id: data.options.routeId,
			provider: "chatgpt",
			expectedUrl: data.options.expectedUrl,
			expectedModel: data.options.expectedModel,
			transport: "agent_browser_task",
			nativeTask: binding,
		});
		this.#frontend = new NativeChatgptFrontend(session, this.#route, data.now);
		this.#store = new RelayStore(data.options.preparationDirectory, data.grant.caller.principalId);
	}
	get route() {
		return this.#route;
	}
	get state() {
		return this.#state;
	}
	async hold() {
		this.#state = "held";
		await holdOriginal(
			this.#directory,
			this.#lifetime,
			this.#context,
			"native_runtime_operator_hold",
		);
	}
	/** Same-session metadata only. Reading never clears the preparation hold. */
	async originalReadback(originalKey: string): Promise<Record<string, unknown>> {
		await this.hold();
		return this.#session.originalReadback(originalKey);
	}
	/** Does not close the retained SDK or producer; preparation remains held. */
	async releaseConsumerReference(originalKey: string): Promise<Record<string, unknown>> {
		await this.hold();
		return this.#session.release(originalKey);
	}

	async prepareProOnly(): Promise<Record<string, unknown>> {
		if (this.#state !== "active") return refuse("native_runtime_readback_required");
		try {
			if (this.#data.grant.expiresAtMs <= this.#data.now())
				refuse("native_runtime_admission_expired");
			return await prepareRelayProOnly({
				store: this.#store,
				route: this.#route,
				frontend: this.#frontend,
				operationId: this.#data.options.operationId,
			});
		} catch (error) {
			this.#state = "held";
			const failure = publicError(error);
			await holdOriginal(this.#directory, this.#lifetime, this.#context, failure.code);
			throw failure;
		}
	}
}

/** One foreground owner. A new ID/config/client cannot recover a previous attempt. */
export async function startOwnNativeRuntime(
	input: NativeRuntimeInput,
	dependencies: NativeRuntimeDependencies = {},
): Promise<OwnNativeProRuntime> {
	const lifetime = lifetimeRequired(dependencies);
	const qualifyBudget = readBudgetRequired(dependencies);
	const data = inputs.get(input);
	if (!data) return refuse("native_runtime_private_input_invalid");
	try {
		await verifyReceived(data);
	} catch (error) {
		throw publicError(error);
	}
	const directory = join(data.options.consumerLedgerDirectory, ".sdk-runtime");
	// Preserve any original attempt before requalifying or constructing a client.
	try {
		await lstat(directory);
		return refuse("native_runtime_readback_required");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw publicError(error);
	}
	const context: NativeRuntimeLifetimeContext = Object.freeze({
		receiptDigest: digest(`${data.inputHash}:${data.bindingHash}`),
		producerSha256: data.pin.binarySha256,
		expiresAtMs: data.grant.expiresAtMs,
	});
	try {
		await lifetime.qualify(context);
	} catch {
		return refuse("native_runtime_lifetime_unqualified");
	}
	const budgetContext = Object.freeze({
		...context,
		admissionDigest: digest(JSON.stringify(data.admission)),
		ledgerDirectory: data.options.consumerLedgerDirectory,
	});
	let readBudget: NativeReadBudget;
	try {
		readBudget = await qualifyBudget(budgetContext);
		matchNativeReadBudget(readBudget, budgetContext, data.now);
	} catch {
		return refuse("native_read_budget_unqualified");
	}

	// Qualification may await an operator. Changed files/realm/pins cannot be
	// accepted merely because they were valid before that wait.
	try {
		await verifyReceived(data);
	} catch (error) {
		throw publicError(error);
	}
	try {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await metadataFile(directory, "intent.json", { version: 1, state: "attempted", context });
	} catch {
		return refuse("native_runtime_readback_required");
	}
	let acquiredContext = context;
	let runtime: NativeProRuntime | undefined;
	try {
		const descriptor: NativeSdkDescriptor = Object.freeze({
			command: data.options.producerExecutable,
			args: Object.freeze(["mcp", "serve"] as const),
			binarySha256: data.pin.binarySha256,
			env: Object.freeze(
				Object.fromEntries([
					["HOME", data.options.producerHome],
					["AGENT_BROWSER_SOCKET_DIR", data.options.producerSocketDirectory],
					["AGENT_BROWSER_RUNTIME_ENVIRONMENT", "development"],
					["AGENT_BROWSER_RUNTIME_HOST", "1"],
					["AGENT_BROWSER_EXTERNAL_BROWSER_DISCOVERY", "disabled"],
					...(data.pin.namespace ? [["AGENT_BROWSER_DEV_NAMESPACE", data.pin.namespace]] : []),
				]),
			),
		});
		await revalidateNativeReadBudget(readBudget, data.now);
		await lifetime.assertCurrent(context, Object.freeze({ kind: "sdk_connect" }));
		const client = await (dependencies.connect ?? connectPinnedSdk)(descriptor);
		retainedClients.add(client);
		await lifetime.retain(context, client);
		if (data.grant.expiresAtMs <= data.now()) refuse("native_runtime_admission_expired");
		const protectedClient: NativeMcpClient = Object.freeze({
			async callTool(request: Parameters<NativeMcpClient["callTool"]>[0]) {
				const dispatch = protectedDispatch(request);
				await lifetime.assertCurrent(acquiredContext, dispatch);
				// A hold is synchronous even if its lifetime hook or durable write fails.
				if (
					runtime?.state === "held" &&
					dispatch.kind !== "original_readback" &&
					dispatch.kind !== "release"
				)
					refuse("native_runtime_readback_required");
				return client.callTool(request);
			},
		});
		const session = new NativeConsumerSession(
			protectedClient,
			data.admission,
			data.options.consumerLedgerDirectory,
			data.now,
			readBudget,
		);
		await session.acquire();
		acquiredContext = Object.freeze({ ...context, nativeTask: Object.freeze(session.binding) });
		await lifetime.acquired(acquiredContext);
		runtime = new NativeProRuntime(data, lifetime, acquiredContext, directory, session);
		return runtime;
	} catch (error) {
		const failure = publicError(error);
		await holdOriginal(directory, lifetime, acquiredContext, failure.code);
		throw failure;
	}
}

/** Explicit private foreground caller. No ordinary startup, enrollment or JSON mode.
 * The CLI supplies no admitted lifetime policy: it refuses before private reads,
 * SDK process startup or Open. Only a separately reviewed compiled integration may
 * provide that policy; the input file has no lifetime/enable/cleanup flags.
 */
export async function prepareOwnNativeProFromFile(
	path: string,
	dependencies: NativeRuntimeDependencies & {
		producerPin?: NativeProducerPin;
		now?: () => number;
	} = {},
) {
	lifetimeRequired(dependencies);
	readBudgetRequired(dependencies);
	const input = await readNativeRuntimeInput(path, dependencies.producerPin, dependencies.now);
	const runtime = await startOwnNativeRuntime(input, dependencies);
	return runtime.prepareProOnly();
}
