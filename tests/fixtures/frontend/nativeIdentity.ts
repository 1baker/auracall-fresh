import type { NativeAuthorityDecoder } from "../../../src/browser/frontends/nativeIdentity.js";

/** Synthetic trusted-producer state for core tests, NOT a Browser wire decoder.
 * The normal factory has no decoder and cannot acquire a real task. */
export const syntheticNativeAuthority: NativeAuthorityDecoder = () => ({
	profileId: "disposable:default:6",
	browserId: "synthetic-browser",
	tabId: "synthetic-tab",
	targetId: "synthetic-target",
	ownerGeneration: 1,
	processDigest: "a".repeat(64),
	custodyDigest: "b".repeat(64),
	principalId: "synthetic-registered-consumer",
	capabilityId: "synthetic-registered-capability-id",
	capabilityRevision: 1,
	provenance: "registered_capability",
});
