import { expect, it } from "vitest";
import { validateNativeAdmissionObservation } from "../../src/browser/frontends/nativeAdmission.js";
import fixture from "./fixtures/native-admission-observation-v2.json";

function expected() {
	return {
		grant: structuredClone(fixture.request.expectedGrant),
		ownerAuthority: structuredClone(fixture.privateResult.ownerAuthority),
		producerTaskId: "synthetic-producer-task",
		context: {
			receiptDigest: fixture.request.receiptDigest,
			producerSha256: fixture.privateResult.producerSha256,
			expiresAtMs: 100000,
		},
		requestNonce: fixture.request.requestNonce,
		startedAtMs: 1900,
		nowMs: 2100,
	};
}

it("accepts the sealed producer v2 fixture with its explicit incomplete coverage", () => {
	const result = validateNativeAdmissionObservation(fixture.privateResult, expected());
	expect(result.nativeCustodyHistory.gaps).toEqual([
		"completed_ordinary_activity_is_pruned",
		"compacted_navigation_is_not_original_operations",
		"other_namespaces_and_external_writers",
		"platform_exclusion_and_pre_effect_protection",
		"shared_carried_usage_accounting",
	]);
});

it("refuses v1 rather than upgrading the old projection", () => {
	const old = {
		...fixture.privateResult,
		schemaVersion: "agent-browser.native-admission-observation.v1",
	};
	expect(() => validateNativeAdmissionObservation(old, expected())).toThrowError(/unqualified/);
});

it.each([
	[
		"omitted gap",
		(v: typeof fixture.privateResult) => {
			v.nativeCustodyHistory.gaps.pop();
		},
	],
	[
		"changed coverage",
		(v: typeof fixture.privateResult) => {
			v.historyScope = "complete";
		},
	],
	[
		"reordered source",
		(v: typeof fixture.privateResult) => {
			v.nativeCustodyHistory.sources.reverse();
		},
	],
	[
		"wrong task",
		(v: typeof fixture.privateResult) => {
			v.nativeCustodyHistory.taskId = "other";
		},
	],
	[
		"owner revision",
		(v: typeof fixture.privateResult) => {
			v.ownerAuthority.capabilityRevision++;
		},
	],
	[
		"grant mutation",
		(v: typeof fixture.privateResult) => {
			v.grant.producer.ownerGeneration++;
		},
	],
	[
		"nonce",
		(v: typeof fixture.privateResult) => {
			v.requestNonce = "e".repeat(64);
		},
	],
	[
		"producer",
		(v: typeof fixture.privateResult) => {
			v.producerSha256 = "e".repeat(64);
		},
	],
	[
		"receipt",
		(v: typeof fixture.privateResult) => {
			v.receiptDigest = "e".repeat(64);
		},
	],
	[
		"future timestamp",
		(v: typeof fixture.privateResult) => {
			v.observedAtMs = 2200;
		},
	],
	[
		"expired",
		(v: typeof fixture.privateResult) => {
			v.validUntilMs = 2100;
		},
	],
	[
		"renewed window",
		(v: typeof fixture.privateResult) => {
			v.validUntilMs = 32001;
		},
	],
	[
		"overflowing history",
		(v: typeof fixture.privateResult) => {
			v.nativeHistory.taskCount = 4096;
		},
	],
	[
		"guard removed",
		(v: typeof fixture.privateResult) => {
			v.requiresOperatorGuard = false;
		},
	],
])("rejects %s without returning private details", (_name, mutate) => {
	const changed = structuredClone(fixture.privateResult);
	mutate(changed);
	expect(() => validateNativeAdmissionObservation(changed, expected())).toThrowError(
		"Native observation is unqualified.",
	);
});
