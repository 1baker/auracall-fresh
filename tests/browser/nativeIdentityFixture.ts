/** Synthetic producer receipt from sealed export01de61ce; never used by production. */
interface FixtureFrame {
	taskId: string;
	acquisitionId: string;
	operation: {
		operationId: string;
		operationKey: string;
		action: string;
		ack: { completedAtMs: number };
	};
	consumerAck: { completedAtMs: number };
	targetObservation: { targetId: string; origin: string; observedAtMs: number };
}

export function withCompletedIdentity<T extends FixtureFrame>(
	frame: T,
	producer: { profileId: string; browserId: string; tabId: string },
) {
	const identity = {
		contractVersion: "agent-browser.retained-consumer.identity.v1",
		taskId: frame.taskId,
		acquisitionId: frame.acquisitionId,
		profileId: producer.profileId,
		browserId: producer.browserId,
		tabId: producer.tabId,
		targetId: frame.targetObservation.targetId,
		ownerGeneration: 7,
		publishedProcessDigest: "a".repeat(64),
		custodyDigest: "b".repeat(64),
		authentication: {
			principalId: "synthetic-auracall-principal",
			profileId: producer.profileId,
			capabilityId: "synthetic-capability-id-NOT-TOKEN",
			capabilityRevision: 3,
			provenance: "registered_capability",
		},
		operationId: frame.operation.operationId,
		operationKey: frame.operation.operationKey,
		action: frame.operation.action,
		origin: frame.targetObservation.origin,
		observedAtMs: frame.targetObservation.observedAtMs,
		completedAtMs: frame.consumerAck.completedAtMs,
	};
	return {
		...frame,
		identityFreshness: "completed_operation",
		identity,
		consumerAck: { ...frame.consumerAck, identity: structuredClone(identity) },
		operation: {
			...frame.operation,
			ack: { ...frame.operation.ack, identity: structuredClone(identity) },
		},
	};
}
