import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserTabLease, TabLeaseRetirementReason, TabLeaseFinalDisposition } from "./tabLeaseRegistry.js";

export interface TabLeaseRetirementAuditEvent {
	schemaVersion: 1;
	phase: "close-requested" | "retirement-finished";
	observedAt: string;
	actorPid: number;
	actorProcessStartTicks: string | null;
	leaseId: string;
	leaseRevision: number;
	targetId: string;
	runtimeProfileId: string;
	service: string;
	managedBrowserProfileFingerprint: string;
	tenantFingerprint: string;
	reason: TabLeaseRetirementReason;
	idleExpiresAt: string;
	absoluteExpiresAt: string;
	endpoint: { host: string; port: number; browserProcessId: number | null } | null;
	disposition?: TabLeaseFinalDisposition | "deferred";
	targetDisposition?: TabLeaseFinalDisposition;
	detail?: string;
}
export type TabLeaseRetirementAuditSink = (event: TabLeaseRetirementAuditEvent) => Promise<void>;

export function createFileBackedTabLeaseRetirementAudit(filePath: string): TabLeaseRetirementAuditSink {
	return async event => {
		await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
		await appendFile(filePath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
	};
}

export async function recordTabLeaseRetirementAudit(
	audit: TabLeaseRetirementAuditSink | undefined,
	input: {
		phase: TabLeaseRetirementAuditEvent["phase"];
		lease: BrowserTabLease;
		reason: TabLeaseRetirementReason;
		endpoint: { host: string; port: number; browserProcessId?: number | null } | null;
		observedAt: string;
		disposition?: TabLeaseRetirementAuditEvent["disposition"];
		targetDisposition?: TabLeaseFinalDisposition;
		detail?: string;
	},
): Promise<void> {
	if (!audit) return;
	let actorProcessStartTicks: string | null = null;
	if (process.platform === "linux") {
		try {
			const stat = readFileSync("/proc/self/stat", "utf8");
			actorProcessStartTicks = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19] ?? null;
		} catch { /* Process identity remains unknown when unavailable. */ }
	}
	const hash = (value: string) => createHash("sha256").update(value).digest("hex");
	const lease = input.lease;
	await audit({
		schemaVersion: 1, phase: input.phase, observedAt: input.observedAt,
		actorPid: process.pid, actorProcessStartTicks,
		leaseId: lease.leaseId, leaseRevision: lease.revision, targetId: lease.targetId,
		runtimeProfileId: lease.scope.runtimeProfileId, service: lease.scope.service,
		managedBrowserProfileFingerprint: hash(lease.scope.managedBrowserProfile),
		tenantFingerprint: hash(lease.scope.tenantKey),
		reason: input.reason, idleExpiresAt: lease.idleExpiresAt, absoluteExpiresAt: lease.absoluteExpiresAt,
		endpoint: input.endpoint ? { host: input.endpoint.host, port: input.endpoint.port, browserProcessId: input.endpoint.browserProcessId ?? null } : null,
		...(input.disposition ? { disposition: input.disposition } : {}),
		...(input.targetDisposition ? { targetDisposition: input.targetDisposition } : {}),
		...(input.detail ? { detail: input.detail } : {}),
	});
}
