import { z } from "zod";
import {
	type NativeRuntimeLifetimeContext,
	nativeOwnerGrantSchema,
	nativeRegisteredAuthoritySchema,
} from "./nativeRuntime.js";
import { FrontendError } from "./types.js";

/** Sealed e0db1fed / fixture74e327bf. Neither the schema nor its data grants authority. */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
const source = <T extends string>(name: T) =>
	z.object({ source: z.literal(name), present: z.boolean() }).strict();
const observationSchema = z
	.object({
		schemaVersion: z.literal("agent-browser.native-admission-observation.v2"),
		grant: nativeOwnerGrantSchema,
		ownerAuthority: nativeRegisteredAuthoritySchema,
		producerSha256: hash,
		receiptDigest: hash,
		requestNonce: hash,
		observedAtMs: time,
		validUntilMs: time,
		nativeHistory: z
			.object({
				digest: hash,
				grantCount: count.min(1).max(4096),
				taskCount: count.max(4096),
				operationCount: count.max(4096),
			})
			.strict()
			.refine((v) => v.grantCount + v.taskCount + v.operationCount <= 4096),
		historyScope: z.literal("native_consumer_and_runtime_custody_records"),
		requiresOperatorGuard: z.literal(true),
		nativeCustodyHistory: z
			.object({
				schemaVersion: z.literal("agent-browser.native-custody-history.v1"),
				digest: hash,
				taskId: z.string().min(1).max(1024),
				rows: count.max(8192),
				sources: z.tuple([
					source("browser_session_state"),
					source("browser_launch_custody"),
					source("browser_idle_retirement_custody"),
					source("browser_recovery_registry"),
					source("remote_view_mutation:*"),
					source("terminal_history_archive"),
					source("retained_cache_transitions_v1+events_v1"),
				]),
				gaps: z.tuple([
					z.literal("completed_ordinary_activity_is_pruned"),
					z.literal("compacted_navigation_is_not_original_operations"),
					z.literal("other_namespaces_and_external_writers"),
					z.literal("platform_exclusion_and_pre_effect_protection"),
					z.literal("shared_carried_usage_accounting"),
				]),
			})
			.strict(),
	})
	.strict();
export interface NativeObservationExpectation {
	/** Independently bound private receiver values; never derived from the observation. */
	readonly grant: unknown;
	readonly ownerAuthority: unknown;
	readonly producerTaskId: string;
	readonly context: NativeRuntimeLifetimeContext;
	readonly requestNonce: string;
	readonly startedAtMs: number;
	readonly nowMs: number;
}

/** Validates the complete result of the caller's own one-shot pinned helper.
 * This pure decoder does not execute a helper, attest its origin, reserve reads,
 * establish writer exclusion or accept an uploaded JSON file as authority.
 */
export function validateNativeAdmissionObservation(
	raw: unknown,
	expected: NativeObservationExpectation,
) {
	try {
		const result = observationSchema.parse(raw);
		const grant = nativeOwnerGrantSchema.parse(expected.grant);
		const owner = nativeRegisteredAuthoritySchema.parse(expected.ownerAuthority);
		const { context, requestNonce, startedAtMs, nowMs } = expected;
		if (
			context.nativeTask !== undefined ||
			JSON.stringify(result.grant) !== JSON.stringify(grant) ||
			JSON.stringify(result.ownerAuthority) !== JSON.stringify(owner) ||
			owner.profileId !== grant.producer.profileId ||
			grant.caller.profileId !== grant.producer.profileId ||
			owner.principalId === grant.caller.principalId ||
			owner.capabilityId === grant.caller.capabilityId ||
			result.nativeCustodyHistory.taskId !== expected.producerTaskId ||
			result.producerSha256 !== context.producerSha256 ||
			result.receiptDigest !== context.receiptDigest ||
			result.requestNonce !== requestNonce ||
			result.grant.expiresAtMs !== context.expiresAtMs ||
			!Number.isSafeInteger(startedAtMs) ||
			startedAtMs <= 0 ||
			!Number.isSafeInteger(nowMs) ||
			nowMs < startedAtMs ||
			grant.issuedAtMs > startedAtMs ||
			grant.issuedAtMs >= grant.expiresAtMs ||
			result.observedAtMs < startedAtMs ||
			result.observedAtMs > nowMs ||
			result.validUntilMs <= nowMs ||
			result.validUntilMs > grant.expiresAtMs ||
			result.validUntilMs - result.observedAtMs > 30000
		)
			throw new Error("mismatch");
		return result;
	} catch {
		throw new FrontendError("native_observation_unqualified", "Native observation is unqualified.");
	}
}
