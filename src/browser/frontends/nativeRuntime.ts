import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prepareRelayProOnly } from "../../mcp/relay/proPreparation.js";
import { RelayStore, relayId } from "../../mcp/relay/store.js";
import type { FrontendTools } from "./config.js";
import { NativeChatgptFrontend } from "./nativeChatgpt.js";
import {
	type NativeConsumerAdmission,
	NativeConsumerSession,
	type NativeMcpClient,
	parseNativeConsumerAdmission,
} from "./nativeConsumer.js";
import {
	assertNativeFiniteClaim,
	assertNativeFiniteSend,
	finiteProtectsCall,
	holdNativeFiniteSend,
	type NativeFiniteAuthority,
	type NativeFinitePermit,
	type NativeSendIntent,
	nativePromptDigest,
	nativeSendIntentSchema,
	qualifyNativeFiniteSend,
} from "./nativeFiniteSend.js";
import { type NativeLedgerWriter, requireNativeLedgerWriter } from "./nativeLedgerWriter.js";
import {
	matchNativeReadBudget,
	type NativeReadBudget,
	type NativeReadBudgetContext,
	revalidateNativeReadBudget,
} from "./nativeReadBudget.js";
import { FrontendError, type NativeTaskBinding, type NativeTaskFrontendRoute } from "./types.js";
import type { ProducerBinding, ProducerNativeResult } from "./nativeProducerPhaseRecords.js";

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
export const nativeRegisteredAuthoritySchema = z
	.object({
		principalId: id.max(256),
		profileId: id,
		capabilityId: id,
		capabilityRevision: positive,
		provenance: z.literal("registered_capability"),
	})
	.strict();
export const nativeOwnerGrantSchema = z
	.object({
		grantId: id,
		consumerTaskKey: id,
		producer: producerSchema,
		caller: nativeRegisteredAuthoritySchema,
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
		grant: nativeOwnerGrantSchema,
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
	grant: z.infer<typeof nativeOwnerGrantSchema>;
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
async function privateDirectory(path: string, fence: () => void = () => {}) {
	const s = await lstat(path);
	fence();
	const real = await realpath(path);
	fence();
	if (
		!s.isDirectory() ||
		s.isSymbolicLink() ||
		s.uid !== process.getuid?.() ||
		s.mode & 0o077 ||
		real !== path
	)
		refuse("native_runtime_private_input_invalid");
}
async function file(
	path: string,
	privateInput: boolean,
	executable = false,
	fence: () => void = () => {},
): Promise<Buffer> {
	const real = await realpath(path);
	fence();
	if (!absolute.safeParse(path).success || real !== path)
		refuse("native_runtime_private_input_invalid");
	if (privateInput) {
		await privateDirectory(dirname(path), fence);
		fence();
	}
	const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	fence();
	try {
		const before = await fd.stat();
		fence();
		if (
			!before.isFile() ||
			before.uid !== process.getuid?.() ||
			before.mode & (privateInput ? 0o077 : 0o022) ||
			before.size > (privateInput ? 65536 : 134217728) ||
			(executable && !(before.mode & 0o111))
		)
			refuse("native_runtime_private_input_invalid");
		const bytes = await fd.readFile();
		fence();
		const after = await fd.stat();
		fence();
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
		fence();
	}
}
async function verifyProducer(
	options: ReceivedInput["options"],
	pin: NativeProducerPin,
	fence: () => void = () => {},
) {
	if (
		digest(await file(options.producerExecutable, false, true, fence)) !== pin.binarySha256 ||
		digest(await file(options.producerManifest, false, false, fence)) !== pin.manifestSha256
	)
		refuse("native_runtime_producer_pin_mismatch");
}
async function verifyReceived(data: ReceivedInput, fence: () => void = () => {}) {
	if (
		digest(await file(data.path, true, false, fence)) !== data.inputHash ||
		digest(await file(data.bindingOut, true, false, fence)) !== data.bindingHash
	)
		refuse("native_runtime_input_changed");
	for (const path of [
		data.options.producerHome,
		data.options.producerSocketDirectory,
		data.options.consumerLedgerDirectory,
		data.options.preparationDirectory,
	]) {
		await privateDirectory(path, fence);
		fence();
	}
	await verifyProducer(data.options, data.pin, fence);
	fence();
	if (data.grant.expiresAtMs <= data.now()) refuse("native_runtime_admission_expired");
}

interface ProducerNativeMatch {
	readonly inputPath: string;
	readonly bindingPath: string;
	readonly inputHash: string;
	readonly bindingHash: string;
	readonly context: Readonly<Omit<NativeRuntimeLifetimeContext, "nativeTask">>;
	readonly target: Pick<NativeTaskBinding, "profileId" | "browserId" | "tabId" | "targetId">;
	readonly producerTaskId: string;
	readonly runtimeSource: { readonly path: string; readonly sha256: string };
}
export interface MatchedProducerNativeInput {
	readonly kind: "matched-original-producer-native-input";
}
const producerMatches = new WeakMap<MatchedProducerNativeInput, ProducerNativeMatch>();
/** Private owned actor boundary, not a JSON decoder or caller verifier. */
export function producerNativeMatch(token: MatchedProducerNativeInput): ProducerNativeMatch {
	const value = producerMatches.get(token);
	if (!value) return refuse("native_runtime_private_input_invalid");
	return value;
}
/** Reuse the EXISTING opaque receiver and actual accepted bytes. Browser owner
 * and published native process digests remain distinct, independently joined by
 * the real parent authority; neither is substituted for the receipt digest. */
export async function matchOriginalProducerNativeInput(
	input: NativeRuntimeInput,
	binding: ProducerBinding,
	completed: ProducerNativeResult,
	producerTaskId: string,
	ownerAuthority: unknown,
	fence: () => void,
): Promise<MatchedProducerNativeInput> {
	const data = inputs.get(input);
	if (!data) return refuse("native_runtime_private_input_invalid");
	fence();
	await verifyReceived(data, fence);
	fence();
	const owner = nativeRegisteredAuthoritySchema.parse(ownerAuthority),
		actual = completed.result,
		p = data.grant.producer;
	if (
		completed.state !== "completed" ||
		!actual ||
		completed.operationId !== binding.producerOperationId ||
		completed.intentDigest !== binding.producerIntentDigest ||
		completed.ownerTransportSession !== binding.ownerTransportSession ||
		p.ownerTransportSession !== binding.ownerTransportSession ||
		actual.taskId !== producerTaskId ||
		owner.profileId !== p.profileId ||
		owner.principalId === data.grant.caller.principalId ||
		owner.capabilityId === data.grant.caller.capabilityId ||
		binding.expectedOwner.binarySha256 !== data.pin.binarySha256 ||
		binding.expiresAtMs <= data.now() ||
		new URL(actual.url).origin !== p.origin
	)
		return refuse("native_runtime_producer_link_mismatch");
	for (const key of ["profileId", "browserId", "tabId", "targetId"] as const)
		if (actual[key] !== p[key]) return refuse("native_runtime_producer_link_mismatch");
	const sourcePath = fileURLToPath(import.meta.url),
		sourceBytes = await file(sourcePath, false, false, fence);
	fence();
	const token: MatchedProducerNativeInput = Object.freeze({
		kind: "matched-original-producer-native-input",
	});
	producerMatches.set(
		token,
		Object.freeze({
			inputPath: data.path,
			bindingPath: data.bindingOut,
			inputHash: data.inputHash,
			bindingHash: data.bindingHash,
			context: Object.freeze({
				receiptDigest: digest(`${data.inputHash}:${data.bindingHash}`),
				producerSha256: data.pin.binarySha256,
				expiresAtMs: data.grant.expiresAtMs,
			}),
			target: Object.freeze({
				profileId: p.profileId,
				browserId: p.browserId,
				tabId: p.tabId,
				targetId: p.targetId,
			}),
			producerTaskId,
			runtimeSource: Object.freeze({ path: sourcePath, sha256: digest(sourceBytes) }),
		}),
	);
	fence();
	return token;
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
			readonly action: "url" | "snapshot" | "gettext" | "click" | "press" | "fill";
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
	/** Synchronous local publication fence after the acquired ACK; no RPC or await. */
	assertAcquiredCurrent(context: NativeRuntimeLifetimeContext): void;
	/** Retain this SAME client privately for original readback. No close/release port. */
	retain(context: NativeRuntimeLifetimeContext, client: NativeMcpClient): Promise<void>;
	uncertain(context: NativeRuntimeLifetimeContext, reason: string): Promise<void>;
}
/** Private memory reader, bound exactly once to the acquired session itself.
 * Reading this getter causes no SDK call and does not establish live authority. */
export interface NativeTaskReaderReceiver {
	bind(reader: () => Readonly<NativeTaskBinding>): void;
}
export interface NativeRuntimeDependencies {
	/** Optional for existing local drivers; mandatory in the callback carrier composition. */
	taskReceiver?: NativeTaskReaderReceiver;
	/** Mandatory original-authority writer participant. A local lock is not this authority. */
	writer?: NativeLedgerWriter;
	lifetime?: NativeRuntimeLifetime;
	/** Whole-call ports from ONE actual operator NativeDispatchJoin. A check-before
	 * callback or JSON guard receipt cannot replace its before/after protection.
	 * The persistent Python/Node binding and real suppliers remain operator-owned.
	 */
	execution?: NativeRuntimeExecution;
	/** Trusted compiled operator qualifier. Never read from the private input JSON.
	 * Required for this Pro-only runtime; missing or unknown carried accounting refuses.
	 */
	readBudget?: (context: NativeReadBudgetContext) => Promise<NativeReadBudget>;
	/** Source fixture seam; production defaults to the pinned SDK stdio connector. */
	connect?: (descriptor: NativeSdkDescriptor) => Promise<NativeMcpClient>;
}
export interface NativeRuntimeExecution {
	handshake<T>(operation: () => Promise<T>): Promise<T>;
	acquire<T>(operation: () => Promise<T>): Promise<T>;
	protected_dispatch<T>(operation: () => Promise<T>): Promise<T>;
}

/** Bind the final operator composition to this EXACT opaque private receiver.
 * No extra runtime JSON fields and no descriptor/grant supplied in place of it.
 * This validates local files only; startOwnNativeRuntime remains the sole caller.
 * Real persistent guard, private helper and original-accounting suppliers are
 * separately required. This function does not acquire any of them.
 */
export async function bindNativeOperatorIntegration(
	input: NativeRuntimeInput,
	operator: Pick<
		import("./nativeOperator.js").NativeOperatorOptions,
		"guard" | "supplier" | "dispatchJoin" | "writer" | "ownerAuthority" | "producerTaskId"
	>,
	fence: () => void = () => {},
) {
	const data = inputs.get(input);
	if (!data) return refuse("native_runtime_private_input_invalid");
	try {
		await verifyReceived(data, fence);
		fence();
		const { createNativeOperatorIntegration } = await import("./nativeOperator.js");
		fence();
		const integration = createNativeOperatorIntegration({
			...operator,
			grant: data.grant,
			producerSha256: data.pin.binarySha256,
			receiptDigest: digest(`${data.inputHash}:${data.bindingHash}`),
			now: data.now,
		});
		fence();
		return integration;
	} catch (error) {
		throw publicError(error);
	}
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
		typeof policy.assertAcquiredCurrent !== "function" ||
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
function executionRequired(dependencies: NativeRuntimeDependencies): NativeRuntimeExecution {
	const execution = dependencies.execution;
	if (
		!execution ||
		[execution.handshake, execution.acquire, execution.protected_dispatch].some(
			(method) => typeof method !== "function",
		)
	)
		refuse("native_runtime_execution_required");
	return Object.freeze({
		handshake: execution.handshake.bind(execution),
		acquire: execution.acquire.bind(execution),
		protected_dispatch: execution.protected_dispatch.bind(execution),
	});
}

/** Preserve opaque local results; the bridge must invoke exactly one actual call.
 * A lost post-call guard reply holds the original operation, never retries it.
 */
export async function runNativeOperation<T>(
	wrap: (operation: () => Promise<T>) => Promise<T>,
	operation: () => Promise<T>,
): Promise<T> {
	let called = false,
		finished = false,
		closed = false,
		invalid = false;
	let value: T | undefined;
	try {
		const returned = await wrap(async () => {
			if (called || closed) {
				invalid = true;
				return refuse("native_runtime_execution_unqualified");
			}
			called = true;
			value = await operation();
			finished = true;
			return value;
		});
		if (invalid || !called || !finished || !Object.is(returned, value))
			refuse("native_runtime_execution_unqualified");
		return returned;
	} finally {
		closed = true;
	}
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
	finite = false,
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
		.enum(["url", "snapshot", "gettext", "click", "press", "fill"])
		.safeParse(request.arguments.action);
	if (request.name !== "browser_command" || !action.success || (action.data === "fill" && !finite))
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
	#finite?: NativeFinitePermit;
	#finiteBound = false;
	#busy = false;
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
		this.#session.hold();
		if (this.#finite) holdNativeFiniteSend(this.#finite);
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
		if (this.#busy || this.#finiteBound) return refuse("native_finite_send_unqualified");
		this.#busy = true;
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
		} finally {
			this.#busy = false;
		}
	}
	/** Checked only for the exact active ledger call. There is no global skip flag. */
	finiteProtects(request: Parameters<NativeMcpClient["callTool"]>[0]): boolean {
		return Boolean(
			this.#finite &&
				request.name === "browser_command" &&
				finiteProtectsCall(this.#finite, request),
		);
	}
	async bindFinite(
		intent: NativeSendIntent,
		authority: NativeFiniteAuthority,
	): Promise<FrontendTools> {
		if (
			!authority ||
			typeof authority.verify !== "function" ||
			typeof authority.protect !== "function" ||
			typeof authority.assertClaim !== "function" ||
			typeof authority.assertCurrent !== "function"
		)
			return refuse("native_finite_authority_required");
		if (this.#state !== "active" || this.#busy || this.#finiteBound)
			return refuse("native_finite_send_unqualified");
		this.#busy = true;
		this.#finiteBound = true;
		try {
			const request = nativeSendIntentSchema.parse(intent);
			const permit = await qualifyNativeFiniteSend(
				{
					...this.#context,
					nativeTask: this.#session.binding,
					admissionDigest: digest(JSON.stringify(this.#data.admission)),
					ledgerDirectory: this.#data.options.consumerLedgerDirectory,
					routeId: this.#route.id,
					expectedUrl: this.#route.expectedUrl,
					expectedModel: this.#route.expectedModel,
					intent: request,
				},
				this.#session,
				authority,
				this.#data.now,
			);
			this.#finite = permit;
			if (this.#state !== "active") {
				holdNativeFiniteSend(permit);
				return refuse("native_finite_send_unqualified");
			}
			this.#session.bindFiniteSend(permit);
			let sent = false;
			const call = async (routeId: string, operation: () => Promise<Record<string, unknown>>) => {
				if (this.#state !== "active" || this.#busy || routeId !== this.#route.id)
					return refuse("native_finite_send_unqualified");
				assertNativeFiniteSend(permit);
				this.#busy = true;
				try {
					const value = await operation();
					assertNativeFiniteSend(permit);
					if (this.#state !== "active") return refuse("native_finite_send_unqualified");
					if (value.code || ["failed_presend", "uncertain"].includes(String(value.status)))
						await this.hold();
					return value;
				} catch (error) {
					await this.hold();
					throw publicError(error);
				} finally {
					this.#busy = false;
				}
			};
			return Object.freeze({
				inspect: (routeId: string) => call(routeId, () => this.#frontend.inspect(routeId)),
				configure: (routeId: string, effort = "pro") =>
					call(routeId, () => {
						if (sent || effort !== "pro") return refuse("native_finite_send_unqualified");
						return this.#frontend.configure(routeId, effort);
					}),
				send: (routeId: string, requestId: string, text: string, previousRequestId?: string) =>
					call(routeId, async () => {
						if (
							sent ||
							requestId !== request.requestId ||
							nativePromptDigest(text) !== request.promptDigest ||
							(previousRequestId ?? null) !== request.previousRequestId
						)
							return refuse("native_finite_send_unqualified");
						sent = true;
						await assertNativeFiniteClaim(permit);
						const observed = await this.#frontend.inspect(routeId);
						assertNativeFiniteSend(permit);
						if (
							observed.effort !== "pro" ||
							observed.url !== this.#route.expectedUrl ||
							observed.model !== this.#route.expectedModel
						)
							return refuse("native_finite_send_unqualified");
						return this.#frontend.send(routeId, requestId, text, previousRequestId);
					}),
				status: (routeId: string, requestId: string) =>
					call(routeId, () => {
						if (requestId !== request.requestId && requestId !== request.previousRequestId)
							return refuse("native_finite_send_unqualified");
						return this.#frontend.status(routeId, requestId);
					}),
			});
		} catch (error) {
			await this.hold();
			throw publicError(error);
		} finally {
			this.#busy = false;
		}
	}
}

/** Distinct compiled finite-Send facade over the SAME runtime/frontend/session.
 * No acquisition, transport construction, endpoint/store alias, JSON enable or
 * canonical claim occurs here. P447 on the canonical host owns claim/Send/return.
 */
export async function bindOwnNativeSendFrontend(
	runtime: OwnNativeProRuntime,
	intent: NativeSendIntent,
	authority: NativeFiniteAuthority,
): Promise<FrontendTools> {
	if (!(runtime instanceof NativeProRuntime)) return refuse("native_finite_send_unqualified");
	return runtime.bindFinite(intent, authority);
}

/** One foreground owner. A new ID/config/client cannot recover a previous attempt. */
export async function startOwnNativeRuntime(
	input: NativeRuntimeInput,
	dependencies: NativeRuntimeDependencies = {},
): Promise<OwnNativeProRuntime> {
	const lifetime = lifetimeRequired(dependencies);
	const assertAcquiredCurrent = lifetime.assertAcquiredCurrent.bind(lifetime);
	const qualifyBudget = readBudgetRequired(dependencies);
	const execution = executionRequired(dependencies);
	const writer = requireNativeLedgerWriter(dependencies.writer);
	if (dependencies.taskReceiver && typeof dependencies.taskReceiver.bind !== "function")
		refuse("native_runtime_task_receiver_invalid");
	const bindTaskReader = dependencies.taskReceiver?.bind.bind(dependencies.taskReceiver);
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
	let session: NativeConsumerSession | undefined;
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
		const client = await runNativeOperation(execution.handshake, async () => {
			await lifetime.assertCurrent(context, Object.freeze({ kind: "sdk_connect" }));
			const connected = await (dependencies.connect ?? connectPinnedSdk)(descriptor);
			// Retain even if the operator's AFTER check or reply fails.
			retainedClients.add(connected);
			return connected;
		});
		await lifetime.retain(context, client);
		if (data.grant.expiresAtMs <= data.now()) refuse("native_runtime_admission_expired");
		const protectedClient: NativeMcpClient = Object.freeze({
			async callTool(request: Parameters<NativeMcpClient["callTool"]>[0]) {
				const finite = runtime?.finiteProtects(request) ?? false;
				const dispatch = protectedDispatch(request, finite);
				const ledgerProtected = session?.protectsRequest(request) ?? false;
				if (!finite && !ledgerProtected) return refuse("native_ledger_writer_held");
				const invoke = async () => {
					await lifetime.assertCurrent(acquiredContext, dispatch);
					// A hold is synchronous even if its lifetime hook or durable write fails.
					if (
						runtime?.state === "held" &&
						dispatch.kind !== "original_readback" &&
						dispatch.kind !== "release"
					)
						refuse("native_runtime_readback_required");
					if (finite && !runtime?.finiteProtects(request)) refuse("native_finite_send_unqualified");
					if (ledgerProtected && !session?.protectsRequest(request))
						refuse("native_ledger_writer_held");
					return client.callTool(request);
				};
				// The finite authority encloses the WHOLE ledger transaction; never
				// reenter the same Python phase driver at its inner SDK effect.
				return invoke();
			},
		});
		session = new NativeConsumerSession(
			protectedClient,
			data.admission,
			data.options.consumerLedgerDirectory,
			data.now,
			readBudget,
			writer,
			() => acquiredContext,
		);
		if (bindTaskReader) {
			const sameSession = session;
			const bound = bindTaskReader(() => Object.freeze(sameSession.binding)) as unknown;
			if (bound !== undefined) {
				if (bound instanceof Promise) void bound.catch(() => {});
				refuse("native_runtime_task_receiver_invalid");
			}
		}
		await session.acquire();
		acquiredContext = Object.freeze({ ...context, nativeTask: Object.freeze(session.binding) });
		await lifetime.acquired(acquiredContext);
		const publicationFence = assertAcquiredCurrent(acquiredContext) as unknown;
		if (publicationFence !== undefined) {
			if (publicationFence instanceof Promise) void publicationFence.catch(() => {});
			refuse("native_runtime_lifetime_contract_required");
		}
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
	executionRequired(dependencies);
	requireNativeLedgerWriter(dependencies.writer);
	const input = await readNativeRuntimeInput(path, dependencies.producerPin, dependencies.now);
	const runtime = await startOwnNativeRuntime(input, dependencies);
	return runtime.prepareProOnly();
}
