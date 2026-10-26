import { createHash } from "node:crypto";
import { z } from "zod";
import { nativeBudgetDigest } from "./nativeReadBudget.js";
import { runNativeOperation } from "./nativeRuntime.js";
import { requestIdSchema } from "./requestStore.js";
import { FrontendError } from "./types.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const task = z
	.object({
		controlRef: z.string().min(1),
		taskId: z.string().min(1),
		profileId: z.string().min(1),
		browserId: z.string().min(1),
		tabId: z.string().min(1),
		targetId: z.string().min(1),
	})
	.strict();
export const nativeSendIntentSchema = z
	.object({
		requestId: requestIdSchema,
		requestFingerprint: hash,
		promptDigest: hash,
		previousRequestId: requestIdSchema.nullable(),
	})
	.strict();
export type NativeSendIntent = Readonly<z.infer<typeof nativeSendIntentSchema>>;
const contextSchema = z
	.object({
		receiptDigest: hash,
		producerSha256: hash,
		admissionDigest: hash,
		expiresAtMs: count.positive(),
		ledgerDirectory: z.string().min(1),
		nativeTask: task,
		routeId: z.string().min(1).max(128),
		expectedUrl: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/),
		expectedModel: z.string().min(1).max(256),
		intent: nativeSendIntentSchema,
	})
	.strict();
export type NativeFiniteContext = Readonly<z.infer<typeof contextSchema>>;
const counters = z
	.object({
		acquisition: count.max(1),
		read: count.max(80),
		control: count.max(6),
		draft: count.max(2),
		send: z.literal(2),
	})
	.strict();
const evidenceSchema = z
	.object({
		contextDigest: hash,
		approvalDigest: hash,
		originalLineageDigest: hash,
		reservationDigest: hash,
		consumed: counters,
		additional: z.object({ draft: z.literal(1), send: z.literal(1) }).strict(),
		readCeiling: z.literal(80),
		controlCeiling: z.literal(6),
	})
	.strict();
export type NativeFiniteEvidence = z.infer<typeof evidenceSchema>;
export type NativeBucket = "acquisition" | "read" | "control" | "draft" | "send";
export type NativeCounts = Record<NativeBucket, number>;
export interface NativeFiniteOperation {
	readonly context: NativeFiniteContext;
	readonly key: string;
	readonly bucket: NativeBucket;
	readonly intentDigest: string;
}
/** Compiled operator supplies all three ports. Neither JSON nor an MCP scope creates
 * authority. protect holds ORIGINAL cooperating-writer exclusion across every
 * ledger mutation, SDK effect, completion and lock cleanup; one phase driver. Bind the same canonical request
 * and current P447 phase throughout: preclaim reads/controls use its ready or
 * configuration intent; draft/Send requires its current frontend claim.
 */
export interface NativeFiniteAuthority {
	verify(context: NativeFiniteContext): Promise<unknown>;
	/** Actual canonical P447 claim/fingerprint/route, not a manual relay claim. */
	assertClaim(context: NativeFiniteContext): Promise<void>;
	protect<T>(operation: NativeFiniteOperation, run: () => Promise<T>): Promise<T>;
}
export interface NativeFinitePermit {
	readonly kind: "auracall-native-finite-send";
}
interface State {
	owner: object;
	context: NativeFiniteContext;
	evidence: NativeFiniteEvidence;
	protect: NativeFiniteAuthority["protect"];
	assertClaim: NativeFiniteAuthority["assertClaim"];
	now: () => number;
	lastNow: number;
	held: boolean;
	active?: NativeFiniteOperation;
	busy: boolean;
	reservationDigest: string;
	counts: NativeCounts;
}
const permits = new WeakMap<NativeFinitePermit, State>();
export const nativePromptDigest = (text: string) =>
	createHash("sha256").update(text, "utf8").digest("hex");
function refuse(): never {
	throw new FrontendError(
		"native_finite_send_unqualified",
		"Retain the original finite request and accounting.",
	);
}
function current(permit: NativeFinitePermit): State {
	const s = permits.get(permit);
	if (!s) return refuse();
	const time = s.now();
	if (s.held || !Number.isSafeInteger(time) || time < s.lastNow || time >= s.context.expiresAtMs) {
		s.held = true;
		return refuse();
	}
	s.lastNow = time;
	return s;
}
export function holdNativeFiniteSend(permit: NativeFinitePermit) {
	const s = permits.get(permit);
	if (s) s.held = true;
}
/** No IO or allowance default. The verifier must bind a real future one-request
 * approval, COMPLETE original carry and exact current reservation digest.
 * The existing two Sends remain consumed. No supplied production actor exists.
 */
export async function qualifyNativeFiniteSend(
	context: NativeFiniteContext,
	owner: object,
	authority: NativeFiniteAuthority,
	now = Date.now,
): Promise<NativeFinitePermit> {
	if (
		!authority ||
		typeof authority.verify !== "function" ||
		typeof authority.protect !== "function" ||
		typeof authority.assertClaim !== "function"
	)
		throw new FrontendError(
			"native_finite_authority_required",
			"A finite allowance and original writer authority are required.",
		);
	try {
		const c = contextSchema.parse(context);
		Object.freeze(c.nativeTask);
		Object.freeze(c.intent);
		Object.freeze(c);
		const verify = authority.verify.bind(authority),
			protect = authority.protect.bind(authority),
			assertClaim = authority.assertClaim.bind(authority);
		const started = now();
		if (!Number.isSafeInteger(started) || started < 0 || started >= c.expiresAtMs) refuse();
		const e = evidenceSchema.parse(await verify(c));
		const finished = now();
		if (
			e.contextDigest !== nativeBudgetDigest(c) ||
			!Number.isSafeInteger(finished) ||
			finished < started ||
			finished >= c.expiresAtMs
		)
			refuse();
		Object.freeze(e.consumed);
		Object.freeze(e.additional);
		Object.freeze(e);
		const permit = Object.freeze({ kind: "auracall-native-finite-send" as const });
		permits.set(permit, {
			owner,
			context: c,
			evidence: e,
			protect,
			assertClaim,
			now,
			lastNow: finished,
			held: false,
			busy: false,
			reservationDigest: e.reservationDigest,
			counts: { ...e.consumed },
		});
		return permit;
	} catch {
		return refuse();
	}
}
export function matchNativeFiniteOwner(
	permit: NativeFinitePermit,
	owner: object,
	expected: {
		ledgerDirectory: string;
		admissionDigest: string;
		expiresAtMs: number;
		nativeTask: unknown;
	},
) {
	const s = current(permit),
		c = s.context;
	if (
		s.owner !== owner ||
		c.ledgerDirectory !== expected.ledgerDirectory ||
		c.admissionDigest !== expected.admissionDigest ||
		c.expiresAtMs !== expected.expiresAtMs ||
		nativeBudgetDigest(c.nativeTask) !== nativeBudgetDigest(expected.nativeTask)
	)
		refuse();
}
export function assertNativeFiniteSend(permit: NativeFinitePermit) {
	current(permit);
}
export async function assertNativeFiniteClaim(permit: NativeFinitePermit) {
	const s = current(permit);
	try {
		await s.assertClaim(s.context);
		current(permit);
	} catch {
		s.held = true;
		return refuse();
	}
}
export function finiteLedgerPolicy(
	permit: NativeFinitePermit,
	snapshot: string,
	counts: NativeCounts,
) {
	const s = current(permit);
	if (
		!s.active ||
		s.reservationDigest !== snapshot ||
		nativeBudgetDigest(counts) !== nativeBudgetDigest(s.counts)
	)
		refuse();
	return {
		id: nativeBudgetDigest([s.context, s.evidence]),
		limits: {
			acquisition: 1,
			read: 80,
			control: 6,
			draft: s.evidence.consumed.draft + 1,
			send: s.evidence.consumed.send + 1,
		},
	};
}
export function recordFiniteReservation(
	permit: NativeFinitePermit,
	snapshot: string,
	bucket: NativeBucket,
) {
	const s = current(permit);
	if (!s.active || s.active.bucket !== bucket) refuse();
	s.reservationDigest = snapshot;
	s.counts[bucket]++;
}
export async function protectFiniteLedger<T>(
	permit: NativeFinitePermit,
	key: string,
	bucket: NativeBucket,
	intent: unknown,
	operation: () => Promise<T>,
): Promise<T> {
	const s = current(permit);
	if (s.busy || bucket === "acquisition") {
		s.held = true;
		return refuse();
	}
	s.busy = true;
	const op = Object.freeze({
		context: s.context,
		key,
		bucket,
		intentDigest: nativeBudgetDigest(intent),
	});
	try {
		return await runNativeOperation(
			(run) => s.protect(op, run),
			async () => {
				current(permit);
				if (s.active) refuse();
				s.active = op;
				try {
					const value = await operation();
					current(permit);
					return value;
				} finally {
					s.active = undefined;
				}
			},
		).then((value) => {
			current(permit);
			return value;
		});
	} catch {
		s.held = true;
		return refuse();
	} finally {
		s.busy = false;
	}
}
/** A private active transaction, not a mode flag, authorizes the exact SDK call.
 * Metadata/release and unrelated calls never borrow this protection.
 */
export function finiteProtectsCall(
	permit: NativeFinitePermit,
	request: {
		name: string;
		arguments: Record<string, unknown>;
	},
): boolean {
	const s = current(permit),
		op = s.active,
		a = request.arguments;
	return Boolean(
		op &&
			request.name === "browser_command" &&
			a.taskId === s.context.nativeTask.taskId &&
			a.operationKey === op.key &&
			nativeBudgetDigest([s.context.nativeTask, a.action, a.params]) === op.intentDigest,
	);
}
export function checkFiniteInput(
	permit: NativeFinitePermit,
	bucket: NativeBucket,
	key: string,
	intent: unknown,
) {
	const s = current(permit);
	if (bucket !== "draft" && bucket !== "send") return;
	const [binding, action, params] = intent as [unknown, string, Record<string, unknown>];
	const expectedKey = `${bucket === "draft" ? "fill" : "send"}_${nativeBudgetDigest(s.context.intent.requestId)}`;
	if (
		nativeBudgetDigest(binding) !== nativeBudgetDigest(s.context.nativeTask) ||
		key !== expectedKey ||
		(bucket === "draft"
			? action !== "fill" ||
				params.selector !== "#prompt-textarea" ||
				typeof params.value !== "string" ||
				nativePromptDigest(params.value) !== s.context.intent.promptDigest
			: action !== "click" || params.selector !== 'button[data-testid="send-button"]')
	)
		refuse();
}
