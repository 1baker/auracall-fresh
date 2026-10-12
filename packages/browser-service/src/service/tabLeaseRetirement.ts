import { recordTabLeaseRetirementAudit, type TabLeaseRetirementAuditSink } from "./tabLeaseRetirementAudit.js";
import { isTabLeaseTtlExempt } from "./tabLeaseRegistry.js";
import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseFinalDisposition,
	TabLeaseRetirementReason,
	TabLeaseScope,
} from "./tabLeaseRegistry.js";

export interface TabLeaseRetirementEndpoint {
	host: string;
	port: number;
	browserProcessId?: number | null;
}

export interface TabLeaseRetirementOutcome {
	leaseId: string;
	targetId: string;
	reason: TabLeaseRetirementReason;
	disposition: TabLeaseFinalDisposition | "deferred";
	detail?: string;
}

export async function retireExpiredTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	audit?: TabLeaseRetirementAuditSink;
	scope: TabLeaseScope;
	now?: () => Date;
	resolveEndpoint: () => Promise<TabLeaseRetirementEndpoint | null>;
	inspectTarget: (
		endpoint: TabLeaseRetirementEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	targetMatchesLease: (lease: BrowserTabLease, target: { url: string }) => boolean;
	closeTarget: (
		endpoint: TabLeaseRetirementEndpoint,
		targetId: string,
	) => Promise<void>;
	endpointAbsenceProvesTargetsMissing?: boolean;
}): Promise<TabLeaseRetirementOutcome[]> {
	const now = input.now ?? (() => new Date());
	const nowIso = now().toISOString();
	const nowMs = Date.parse(nowIso);
	const candidates = await input.registry.list({
		scope: input.scope,
		states: ["idle", "retiring"],
	});
	const outcomes: TabLeaseRetirementOutcome[] = [];
	let endpoint: TabLeaseRetirementEndpoint | null;
	try {
		endpoint = await input.resolveEndpoint();
	} catch (error) {
		endpoint = null;
	}

	for (const candidate of candidates) {
		const retainedFollow = isTabLeaseTtlExempt(candidate);
		if (retainedFollow && endpoint && candidate.state !== "retiring") continue;
		const reason = retainedFollow && !endpoint && input.endpointAbsenceProvesTargetsMissing
			? "operator" : retirementReason(candidate, nowMs);
		if (!reason) continue;
		if (!endpoint && !input.endpointAbsenceProvesTargetsMissing) {
			outcomes.push({
				leaseId: candidate.leaseId,
				targetId: candidate.targetId,
				reason,
				disposition: "deferred",
				detail: "browser-endpoint-unavailable",
			});
			continue;
		}
		let lease = candidate;
		let retirementRevision = candidate.revision;
		if (candidate.state === "idle") {
			const begun = await input.registry.beginRetirement({
				leaseId: candidate.leaseId,
				expectedRevision: candidate.revision,
				now: nowIso,
				reason,
			});
			if (!begun.ok) {
				outcomes.push({
					leaseId: candidate.leaseId,
					targetId: candidate.targetId,
					reason,
					disposition: "deferred",
					detail: begun.conflict.kind,
				});
				continue;
			}
			lease = begun.value.lease;
			retirementRevision = begun.value.retirementRevision;
		}

		let disposition: TabLeaseFinalDisposition;
		let detail: string | undefined;
		try {
			if (!endpoint) {
				disposition = "already-missing";
			} else {
				const target = await input.inspectTarget(endpoint, lease.targetId);
				if (!target) {
					disposition = "already-missing";
				} else if (!input.targetMatchesLease(lease, target)) {
					disposition = "preserved";
					detail = "target-identity-mismatch";
				} else {
					await recordTabLeaseRetirementAudit(input.audit, { phase: "close-requested", lease, reason, endpoint, observedAt: now().toISOString() });
					await input.closeTarget(endpoint, lease.targetId);
					const afterClose = await input.inspectTarget(endpoint, lease.targetId);
					disposition = afterClose ? "preserved" : "closed";
					if (afterClose) detail = "target-still-live-after-close";
				}
			}
		} catch (error) {
			disposition = "preserved";
			detail = error instanceof Error ? error.message : String(error);
		}

		const finished = await input.registry.finishRetirement({
			leaseId: lease.leaseId,
			retirementRevision,
			now: now().toISOString(),
			disposition,
		});
		await recordTabLeaseRetirementAudit(input.audit, {
			phase: "retirement-finished", lease, reason, endpoint, observedAt: now().toISOString(),
			disposition: finished.ok ? disposition : "deferred", targetDisposition: disposition,
			detail: finished.ok ? detail : finished.conflict.kind,
		});
		outcomes.push({
			leaseId: lease.leaseId,
			targetId: lease.targetId,
			reason,
			disposition: finished.ok ? disposition : "deferred",
			detail: finished.ok ? detail : finished.conflict.kind,
		});
	}

	return outcomes;
}

function retirementReason(
	lease: BrowserTabLease,
	nowMs: number,
): TabLeaseRetirementReason | null {
	if (lease.state === "retiring") return lease.retirementReason ?? "operator";
	if (lease.state !== "idle") return null;
	if (lease.effectState === "in-flight") return null;
	if (nowMs >= Date.parse(lease.absoluteExpiresAt)) return "absolute-expired";
	if (nowMs >= Date.parse(lease.idleExpiresAt)) return "idle-expired";
	return null;
}
