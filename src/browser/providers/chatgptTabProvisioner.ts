import {
	isProcessAlive,
	verifyChromeProcessAbsent,
} from "../../../packages/browser-service/src/processCheck.js";
import { withProcessTabAcquisition } from "../../../packages/browser-service/src/service/processTabAcquisition.js";
import { releaseAbsentBrowserTabLeases } from "../../../packages/browser-service/src/service/tabInventory.js";
import type {
	BrowserProfileControlClaim,
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseScope,
	TabLeaseWorkload,
} from "../../../packages/browser-service/src/service/tabLeaseRegistry.js";
import type { ProvisionedChatgptTab } from "../chatgptAffinityExecutor.js";

export interface ChatgptManagedBrowserEndpoint {
	browserProcessId?: number | null;
	host: string;
	port: number;
	managedBrowserProfile: string;
}

export interface ChatgptOpenedTarget {
	targetId: string;
	url: string;
}

export interface ChatgptTargetInspection {
	url: string;
}

export function createChatgptTabProvisioner(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	workload: Extract<TabLeaseWorkload, { kind: "conversation" | "new-conversation" }>;
	operationId: string;
	targetUrl: string;
	idleTtlMs: number;
	absoluteTtlMs: number;
	profileControlTtlMs?: number;
	isOwnerAlive?: (processId: number) => boolean;
	now?: () => Date;
	resolveExistingEndpoint: () => Promise<ChatgptManagedBrowserEndpoint | null>;
	verifyBrowserAbsent?: () => Promise<boolean>;
	startBrowser: () => Promise<ChatgptManagedBrowserEndpoint>;
	inspectTarget?: (
		endpoint: ChatgptManagedBrowserEndpoint,
		targetId: string,
	) => Promise<ChatgptTargetInspection | null>;
	openTarget: (input: { host: string; port: number; url: string }) => Promise<ChatgptOpenedTarget>;
	closeTarget: (input: { host: string; port: number; targetId: string }) => Promise<void>;
}): (request: { interactionReservationId: string }) => Promise<ProvisionedChatgptTab> {
	return (request) =>
		withProcessTabAcquisition(input.scope, async () => {
			requireNonEmpty(request.interactionReservationId, "interactionReservationId");
			const now = input.now ?? (() => new Date());
			let endpoint = await input.resolveExistingEndpoint();
			const absent =
				!endpoint &&
				(await (
					input.verifyBrowserAbsent ??
					(() => verifyChromeProcessAbsent(input.scope.managedBrowserProfile))
				)());
			if (absent) {
				await releaseAbsentBrowserTabLeases({
					registry: input.registry,
					scope: {
						managedBrowserProfile: input.scope.managedBrowserProfile,
						service: input.scope.service,
					},
					now: now().toISOString(),
				});
			}
			const processTab = await input.registry.findByProcess(input.scope);
			if (processTab) {
				if (!endpoint || !input.inspectTarget)
					throw new Error("ChatGPT process tab cannot be verified.");
				assertEndpoint(endpoint, input.scope.managedBrowserProfile);
				const inspected = await input.inspectTarget(endpoint, processTab.targetId);
				if (!inspected) {
					await releaseMissingLease(input.registry, processTab, now().toISOString());
				} else {
					if (new URL(inspected.url).origin !== new URL(input.targetUrl).origin) {
						throw new Error("ChatGPT process tab has a different provider origin.");
					}
					const acquired = await input.registry.acquireProcess({
						leaseId: processTab.leaseId,
						expectedRevision: processTab.revision,
						scope: input.scope,
						workload: input.workload,
						operationId: input.operationId,
						now: now().toISOString(),
						idleTtlMs: input.idleTtlMs,
						absoluteTtlMs: input.absoluteTtlMs,
					});
					if (!acquired.ok)
						throw new Error(`ChatGPT process tab acquisition failed: ${acquired.conflict.kind}.`);
					const adopted = await input.registry.recordTargetAction({
						claim: acquired.value.claim,
						action: "adopted",
						occurredAt: now().toISOString(),
						idleTtlMs: input.idleTtlMs,
					});
					if (!adopted.ok)
						throw new Error(`ChatGPT process tab adoption failed: ${adopted.conflict.kind}.`);
					return { ...adopted.value, endpoint: { ...endpoint } };
				}
			}
			const reused = await acquireVerifiedExistingLease(input, endpoint, now);
			if (reused) return reused;
			if (!endpoint) {
				if (absent)
					await releaseIdleLeasesForAbsentBrowser(
						input.registry,
						input.scope,
						now,
						input.isOwnerAlive ?? isProcessAlive,
					);
				let controlClaim: BrowserProfileControlClaim | null = null;
				const acquired = await input.registry.acquireProfileControl({
					scope: input.scope,
					kind: "browser-startup",
					operationId: input.operationId,
					now: now().toISOString(),
					ttlMs: input.profileControlTtlMs ?? 60_000,
				});
				if (!acquired.acquired) {
					throw new Error(`ChatGPT browser startup control denied: ${acquired.reason}.`);
				}
				controlClaim = acquired.claim;
				let startupError: unknown = null;
				try {
					endpoint = await input.startBrowser();
				} catch (error) {
					startupError = error;
				}
				let releaseError: unknown = null;
				let released = false;
				try {
					released = await input.registry.releaseProfileControl({
						claim: controlClaim,
						releasedAt: now().toISOString(),
					});
				} catch (error) {
					releaseError = error;
				}
				if (startupError && releaseError) {
					throw new AggregateError(
						[startupError, releaseError],
						"ChatGPT browser startup and profile-control release both failed.",
					);
				}
				if (startupError) throw startupError;
				if (releaseError) throw releaseError;
				if (!released) throw new Error("ChatGPT browser startup control release failed.");
			}

			if (!endpoint) throw new Error("ChatGPT browser startup returned no endpoint.");
			assertEndpoint(endpoint, input.scope.managedBrowserProfile);
			const target = await input.openTarget({
				host: endpoint.host,
				port: endpoint.port,
				url: input.targetUrl,
			});
			const targetId = requireNonEmpty(target.targetId, "targetId");
			const targetUrl = requireNonEmpty(target.url, "targetUrl");
			const reserved = await input.registry.reserve({
				scope: input.scope,
				targetId,
				workload: input.workload,
				operationId: input.operationId,
				now: now().toISOString(),
				idleTtlMs: input.idleTtlMs,
				absoluteTtlMs: input.absoluteTtlMs,
				targetFingerprint: targetUrl,
				processBound: true,
			});
			if (!reserved.ok) {
				await input.closeTarget({ host: endpoint.host, port: endpoint.port, targetId });
				throw new Error(`ChatGPT target lease reservation failed: ${reserved.conflict.kind}.`);
			}

			let lease = reserved.value.lease;
			let claim = reserved.value.claim;
			const created = await input.registry.recordTargetAction({
				claim,
				action: "target-created",
				occurredAt: now().toISOString(),
				idleTtlMs: input.idleTtlMs,
			});
			if (!created.ok) {
				const accountingError = new Error(
					`ChatGPT target creation accounting failed: ${created.conflict.kind}.`,
				);
				return rollbackCreatedTarget(input, endpoint, reserved.value.lease, accountingError, now);
			}
			lease = created.value.lease;
			claim = created.value.claim;

			if (input.workload.kind === "conversation") {
				const navigated = await input.registry.recordTargetAction({
					claim,
					action: "navigation",
					occurredAt: now().toISOString(),
					idleTtlMs: input.idleTtlMs,
				});
				if (!navigated.ok) {
					const accountingError = new Error(
						`ChatGPT target navigation accounting failed: ${navigated.conflict.kind}.`,
					);
					return rollbackCreatedTarget(input, endpoint, lease, accountingError, now);
				}
				lease = navigated.value.lease;
				claim = navigated.value.claim;
			}

			return {
				lease,
				claim,
				endpoint: { ...endpoint },
			};
		});
}

async function releaseIdleLeasesForAbsentBrowser(
	registry: BrowserTabLeaseRegistry,
	scope: TabLeaseScope,
	now: () => Date,
	isOwnerAlive: (processId: number) => boolean,
): Promise<void> {
	const profileLeases = await registry.list({
		scope: {
			runtimeProfileId: scope.runtimeProfileId,
			managedBrowserProfile: scope.managedBrowserProfile,
			service: scope.service,
		},
		states: ["active", "idle"],
	});
	for (const lease of profileLeases) {
		if (lease.effectState !== "none" && lease.effectState !== "settled") continue;
		if (lease.state === "active") {
			const ownerProcessId = lease.ownerProcessId;
			if (typeof ownerProcessId !== "number" || isOwnerAlive(ownerProcessId)) {
				continue;
			}
		}
		await releaseMissingLease(registry, lease, now().toISOString());
	}
}

async function rollbackCreatedTarget(
	input: Parameters<typeof createChatgptTabProvisioner>[0],
	endpoint: ChatgptManagedBrowserEndpoint,
	lease: BrowserTabLease,
	accountingError: Error,
	now: () => Date,
): Promise<never> {
	const lost = await input.registry.markLost({
		leaseId: lease.leaseId,
		expectedRevision: lease.revision,
		now: now().toISOString(),
		reason: "provisioning-failed",
	});
	if (!lost.ok) {
		throw new AggregateError(
			[accountingError, new Error(`Created-target fence failed: ${lost.conflict.kind}.`)],
			"ChatGPT target accounting and rollback fencing both failed.",
		);
	}
	try {
		await input.closeTarget({ host: endpoint.host, port: endpoint.port, targetId: lease.targetId });
	} catch (closeError) {
		throw new AggregateError(
			[accountingError, closeError],
			"ChatGPT target accounting failed and its lost target could not be closed.",
		);
	}
	const released = await input.registry.releaseLost({
		leaseId: lost.value.leaseId,
		expectedRevision: lost.value.revision,
		now: now().toISOString(),
		disposition: "closed",
	});
	if (!released.ok) {
		throw new AggregateError(
			[accountingError, new Error(`Created-target release failed: ${released.conflict.kind}.`)],
			"ChatGPT target accounting failed and its closed lease could not be released.",
		);
	}
	throw accountingError;
}

async function acquireVerifiedExistingLease(
	input: Parameters<typeof createChatgptTabProvisioner>[0],
	endpoint: ChatgptManagedBrowserEndpoint | null,
	now: () => Date,
): Promise<ProvisionedChatgptTab | null> {
	const existing = await input.registry.findByWorkload(input.scope, input.workload);
	if (!existing) return null;
	if (input.workload.kind !== "conversation") {
		throw new Error("A new-conversation reservation already owns a tab lease.");
	}
	if (!endpoint || !input.inspectTarget) {
		throw new Error("ChatGPT bound target cannot be verified on a live managed browser endpoint.");
	}
	assertEndpoint(endpoint, input.scope.managedBrowserProfile);
	const inspected = await input.inspectTarget(endpoint, existing.targetId);
	if (!inspected) {
		await releaseMissingLease(input.registry, existing, now().toISOString());
		return null;
	}
	if (!isExactConversationRoute(inspected.url, input.targetUrl, input.workload.conversationId)) {
		const lost = await input.registry.markLost({
			leaseId: existing.leaseId,
			expectedRevision: existing.revision,
			now: now().toISOString(),
			reason: "identity-conflict",
		});
		if (!lost.ok) {
			throw new Error(`ChatGPT mismatched target loss transition failed: ${lost.conflict.kind}.`);
		}
		throw new Error("ChatGPT bound target no longer has the exact conversation route.");
	}
	const acquired = await input.registry.acquire({
		processBound: true,
		scope: input.scope,
		workload: input.workload,
		operationId: input.operationId,
		now: now().toISOString(),
	});
	if (!acquired.ok) {
		throw new Error(`ChatGPT existing tab lease acquisition failed: ${acquired.conflict.kind}.`);
	}
	const adopted = await input.registry.recordTargetAction({
		claim: acquired.value.claim,
		action: "adopted",
		occurredAt: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
	});
	if (!adopted.ok) {
		throw new Error(`ChatGPT target adoption accounting failed: ${adopted.conflict.kind}.`);
	}
	return {
		lease: adopted.value.lease,
		claim: adopted.value.claim,
		endpoint: { ...endpoint },
	};
}

async function releaseMissingLease(
	registry: BrowserTabLeaseRegistry,
	existing: BrowserTabLease,
	now: string,
): Promise<void> {
	const lost = await registry.markLost({
		leaseId: existing.leaseId,
		expectedRevision: existing.revision,
		now,
		reason: "target-missing",
	});
	if (!lost.ok)
		throw new Error(`ChatGPT missing target loss transition failed: ${lost.conflict.kind}.`);
	const released = await registry.releaseLost({
		leaseId: lost.value.leaseId,
		expectedRevision: lost.value.revision,
		now,
		disposition: "already-missing",
	});
	if (!released.ok) {
		throw new Error(`ChatGPT missing target release failed: ${released.conflict.kind}.`);
	}
}

function isExactConversationRoute(
	url: string,
	expectedUrl: string,
	conversationId: string,
): boolean {
	try {
		const parsed = new URL(url);
		const expected = new URL(expectedUrl);
		if (parsed.hostname !== expected.hostname) return false;
		const match = parsed.pathname.match(/\/c\/([^/?#]+)/);
		return match?.[1] ? decodeURIComponent(match[1]) === conversationId : false;
	} catch {
		return false;
	}
}

function assertEndpoint(endpoint: ChatgptManagedBrowserEndpoint, expectedProfile: string): void {
	if (!endpoint.host.trim() || !Number.isInteger(endpoint.port) || endpoint.port <= 0) {
		throw new Error("ChatGPT tab provisioning requires an exact DevTools endpoint.");
	}
	if (endpoint.managedBrowserProfile !== expectedProfile) {
		throw new Error(
			`ChatGPT endpoint belongs to managed browser profile ${endpoint.managedBrowserProfile}, not ${expectedProfile}.`,
		);
	}
}

function requireNonEmpty(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${name} must not be empty.`);
	return normalized;
}
