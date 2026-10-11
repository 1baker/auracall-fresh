import type { ProviderTrafficGovernor } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { withProcessTabAcquisition } from "../../packages/browser-service/src/service/processTabAcquisition.js";
import {
	registerUnownedBrowserTabDeadlines,
	releaseAbsentBrowserTabLeases,
	UNOWNED_TAB_WORKLOAD_PREFIX,
} from "../../packages/browser-service/src/service/tabInventory.js";
import type {
	BrowserProfileControlClaim,
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
	TabLeaseScope,
	TabLeaseWorkload,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

export interface LiveFollowBrowserEndpoint {
	host: string;
	port: number;
	managedBrowserProfile: string;
}

export interface LiveFollowCrawlerTab {
	lease: BrowserTabLease;
	claim: TabLeaseClaim;
	endpoint: LiveFollowBrowserEndpoint;
}

export interface DedicatedBrowserTabInput {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	operationId: string;
	targetUrl: string;
	idleTtlMs: number;
	absoluteTtlMs: number;
	profileControlTtlMs?: number;
	now?: () => Date;
	resolveExistingEndpoint: () => Promise<LiveFollowBrowserEndpoint | null>;
	verifyBrowserAbsent?: () => Promise<boolean>;
	startBrowser: () => Promise<LiveFollowBrowserEndpoint>;
	listTargets?: (
		endpoint: LiveFollowBrowserEndpoint,
	) => Promise<Array<{ targetId: string; url: string }>>;
	requireExistingTarget?: boolean;
	coldStartTargetPolicy?: "adopt" | "create";
	preLeaseProviderTrafficGovernor?: ProviderTrafficGovernor;
	inspectTarget: (
		endpoint: LiveFollowBrowserEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	openTarget: (input: {
		host: string;
		port: number;
		url: string;
	}) => Promise<{ targetId: string; url: string }>;
	closeTarget: (input: { host: string; port: number; targetId: string }) => Promise<void>;
}

export function acquireLiveFollowCrawlerTab(
	input: DedicatedBrowserTabInput,
): Promise<LiveFollowCrawlerTab> {
	return withProcessTabAcquisition(input.scope, () =>
		acquireDedicatedBrowserTab(input, {
			kind: "live-follow",
			operationId: input.operationId,
		}),
	);
}

export function acquireEphemeralBrowserTab(
	input: DedicatedBrowserTabInput,
): Promise<LiveFollowCrawlerTab> {
	return withProcessTabAcquisition(input.scope, () =>
		acquireDedicatedBrowserTab(input, {
			kind: "ephemeral",
			operationId: input.operationId,
		}),
	);
}

async function acquireDedicatedBrowserTab(
	input: DedicatedBrowserTabInput,
	workload: TabLeaseWorkload,
): Promise<LiveFollowCrawlerTab> {
	const now = input.now ?? (() => new Date());
	let endpoint = await input.resolveExistingEndpoint();
	let startedBrowser = false;
	const browserAbsent = !endpoint && (await input.verifyBrowserAbsent?.()) === true;
	if (browserAbsent) {
		await releaseAbsentBrowserTabLeases({
			registry: input.registry,
			scope: {
				managedBrowserProfile: input.scope.managedBrowserProfile,
				service: input.scope.service,
			},
			now: now().toISOString(),
		});
	}
	let existing =
		(await input.registry.findByProcess(input.scope)) ??
		(await input.registry.findByWorkload(input.scope, workload));
	if (existing && browserAbsent) {
		await releaseMissingCrawler(input.registry, existing, now().toISOString());
		existing = null;
	}
	if (existing) {
		if (existing.processBinding && existing.state !== "idle") {
			throw new Error("The process tab is already owned by running or fenced work.");
		}
		if (!endpoint) {
			throw new Error(
				"Live-follow crawler target cannot be verified without its browser endpoint.",
			);
		}
		assertEndpoint(endpoint, input.scope.managedBrowserProfile);
		const inspected = await input.inspectTarget(endpoint, existing.targetId);
		if (
			inspected &&
			(input.requireExistingTarget
				? isExactProviderRoute(inspected.url, input.targetUrl)
				: isProviderRoute(inspected.url, input.targetUrl))
		) {
			const acquired = existing.processBinding
				? await input.registry.acquireProcess({
						leaseId: existing.leaseId,
						expectedRevision: existing.revision,
						scope: input.scope,
						workload,
						operationId: input.operationId,
						now: now().toISOString(),
						idleTtlMs: input.idleTtlMs,
						absoluteTtlMs: input.absoluteTtlMs,
					})
				: await input.registry.acquire({
						processBound: true,
						scope: input.scope,
						workload,
						operationId: input.operationId,
						now: now().toISOString(),
					});
			if (!acquired.ok) {
				throw new Error(`Live-follow crawler lease acquisition failed: ${acquired.conflict.kind}.`);
			}
			const adopted = await input.registry.recordTargetAction({
				claim: acquired.value.claim,
				action: "adopted",
				occurredAt: now().toISOString(),
				idleTtlMs: input.idleTtlMs,
			});
			if (!adopted.ok) {
				throw new Error(
					`Live-follow crawler adoption accounting failed: ${adopted.conflict.kind}.`,
				);
			}
			return { ...adopted.value, endpoint };
		}
		if (inspected) {
			if (
				existing.processBinding &&
				(existing.retention === "live-follow" || !input.requireExistingTarget)
			) {
				throw new Error(
					"The process tab is on an incompatible provider route; a second tab is forbidden.",
				);
			}
			const lost = await input.registry.markLost({
				leaseId: existing.leaseId,
				expectedRevision: existing.revision,
				now: now().toISOString(),
				reason: "identity-conflict",
			});
			if (!lost.ok) throw new Error(`Live-follow crawler loss failed: ${lost.conflict.kind}.`);
			if (!input.requireExistingTarget) {
				throw new Error("Live-follow crawler target is live on a different provider route.");
			}
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: existing.targetId,
			});
			const released = await input.registry.releaseLost({
				leaseId: lost.value.leaseId,
				expectedRevision: lost.value.revision,
				now: now().toISOString(),
				disposition: "closed",
			});
			if (!released.ok) {
				throw new Error(
					`Live-follow crawler stale-target release failed: ${released.conflict.kind}.`,
				);
			}
		} else {
			await releaseMissingCrawler(input.registry, existing, now().toISOString());
		}
	}

	if (!endpoint) {
		if (input.requireExistingTarget) {
			throw new Error("Dedicated browser work requires an existing compatible target.");
		}
		let claim: BrowserProfileControlClaim | null = null;
		const control = await input.registry.acquireProfileControl({
			scope: input.scope,
			kind: "browser-startup",
			operationId: input.operationId,
			now: now().toISOString(),
			ttlMs: input.profileControlTtlMs ?? 60_000,
		});
		if (!control.acquired) {
			throw new Error(`Live-follow browser startup control denied: ${control.reason}.`);
		}
		claim = control.claim;
		let startupError: unknown = null;
		try {
			endpoint = await input.startBrowser();
			startedBrowser = true;
		} catch (error) {
			startupError = error;
		}
		const released = await input.registry.releaseProfileControl({
			claim,
			releasedAt: now().toISOString(),
		});
		if (startupError) throw startupError;
		if (!released) throw new Error("Live-follow browser startup control release failed.");
	}
	if (!endpoint) throw new Error("Live-follow browser startup returned no endpoint.");
	assertEndpoint(endpoint, input.scope.managedBrowserProfile);
	const coldStart =
		startedBrowser && !input.requireExistingTarget
			? await prepareColdStartTarget(input, endpoint)
			: { target: null };
	const reusableTarget = input.requireExistingTarget
		? await selectExistingTarget(input, endpoint)
		: coldStart.target;
	if (input.requireExistingTarget && !reusableTarget) {
		throw new Error("Dedicated browser work found no existing compatible target.");
	}
	const target = reusableTarget ?? (await openPlannedPreLeaseTarget(input, endpoint));
	const reserved = await input.registry.reserve({
		scope: input.scope,
		targetId: requireNonEmpty(target.targetId, "targetId"),
		workload,
		operationId: input.operationId,
		now: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
		absoluteTtlMs: input.absoluteTtlMs,
		targetFingerprint: requireNonEmpty(target.url, "targetUrl"),
		processBound: true,
	});
	if (!reserved.ok) {
		if (!reusableTarget) {
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: requireNonEmpty(target.targetId, "targetId"),
			});
		}
		throw new Error(`Live-follow crawler lease reservation failed: ${reserved.conflict.kind}.`);
	}
	const provisioningAction = reusableTarget ? "adopted" : "target-created";
	const provisioned = await input.registry.recordTargetAction({
		claim: reserved.value.claim,
		action: provisioningAction,
		occurredAt: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
	});
	if (!provisioned.ok) {
		const actionLabel = reusableTarget ? "adoption" : "creation";
		const accountingError = new Error(
			`Live-follow crawler ${actionLabel} accounting failed: ${provisioned.conflict.kind}.`,
		);
		const lost = await input.registry.markLost({
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			now: now().toISOString(),
			reason: "provisioning-failed",
		});
		if (!lost.ok) {
			throw new AggregateError(
				[accountingError, new Error(`Crawler rollback fence failed: ${lost.conflict.kind}.`)],
				"Live-follow crawler accounting and rollback fencing both failed.",
			);
		}
		try {
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: target.targetId,
			});
		} catch (closeError) {
			throw new AggregateError(
				[accountingError, closeError],
				"Live-follow crawler accounting failed and its lost target could not be closed.",
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
				[accountingError, new Error(`Crawler rollback release failed: ${released.conflict.kind}.`)],
				"Live-follow crawler accounting failed and its closed lease could not be released.",
			);
		}
		throw accountingError;
	}
	if (coldStart.retirement) {
		try {
			const current = await input.inspectTarget(endpoint, coldStart.retirement.targetId);
			if (current && current.url !== coldStart.retirement.url) {
				throw new Error("Cold-start target changed before retirement; preserving it.");
			}
			if (current) {
				await input.closeTarget({
					host: endpoint.host,
					port: endpoint.port,
					targetId: coldStart.retirement.targetId,
				});
				await confirmColdStartTargetRetirement(input, endpoint, coldStart.retirement);
			}
		} catch (error) {
			// Retain qualified replacement custody rather than closing the browser's last window.
			const retained = await input.registry.idle({
				claim: provisioned.value.claim,
				now: now().toISOString(),
				effectState: "settled",
			});
			if (!retained.ok)
				throw new AggregateError(
					[error, new Error("Replacement lease could not be idled.")],
					"Cold-start retirement failed; replacement custody remains fenced.",
				);
			throw new Error(
				`Cold-start retirement failed; replacement retained under lease ${provisioned.value.lease.leaseId}.`,
				{ cause: error },
			);
		}
	}
	return { ...provisioned.value, endpoint };
}

async function confirmColdStartTargetRetirement(
	input: DedicatedBrowserTabInput,
	endpoint: LiveFollowBrowserEndpoint,
	retirement: { targetId: string; url: string },
): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const current = await Promise.race([
			input.inspectTarget(endpoint, retirement.targetId),
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new Error("Startup close confirmation timed out.")),
					Math.max(1, deadline - Date.now()),
				);
			}),
		]).finally(() => clearTimeout(timer));
		if (!current) return;
		if (current.url !== retirement.url)
			throw new Error("Startup target changed during close confirmation.");
		await new Promise((resolve) =>
			setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))),
		);
	}
	throw new Error("Live-follow browser startup target remained present after close.");
}

async function openPlannedPreLeaseTarget(
	input: DedicatedBrowserTabInput,
	endpoint: LiveFollowBrowserEndpoint,
): Promise<{ targetId: string; url: string }> {
	const action = await input.preLeaseProviderTrafficGovernor?.begin({
		kind: "target-open-or-reuse",
		interactionClass: "renavigation",
		source: "account-mirror:pre-lease-target",
		requestedUrl: input.targetUrl,
		toUrl: input.targetUrl,
		reused: false,
		reason: "dedicated crawler target creation",
	});
	let target: { targetId: string; url: string } | null = null;
	try {
		target = await input.openTarget({
			host: endpoint.host,
			port: endpoint.port,
			url: input.targetUrl,
		});
		await action?.settle({
			outcome: "succeeded",
			targetId: target.targetId,
			toUrl: target.url,
			reused: false,
		});
		return target;
	} catch (error) {
		if (target) {
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: target.targetId,
			});
		}
		if (action && !target) {
			await action.settle({
				outcome: "failed",
				error: error instanceof Error ? error.message : String(error),
				reused: false,
			});
		}
		throw error;
	}
}

async function selectExistingTarget(
	input: DedicatedBrowserTabInput,
	endpoint: LiveFollowBrowserEndpoint,
): Promise<{ targetId: string; url: string } | null> {
	if (!input.listTargets) {
		throw new Error("Dedicated browser work cannot inspect existing targets.");
	}
	const leases = await input.registry.list();
	const ownedTargetIds = new Set(
		leases
			.filter(
				(lease) =>
					lease.state !== "released" &&
					!(
						lease.state === "idle" &&
						lease.workload.kind === "ephemeral" &&
						lease.workload.operationId.startsWith(UNOWNED_TAB_WORKLOAD_PREFIX)
					),
			)
			.map((lease) => lease.targetId),
	);
	const targets = await input.listTargets(endpoint);
	const compatible = targets.filter(
		(target) =>
			Boolean(target.targetId.trim()) &&
			!ownedTargetIds.has(target.targetId) &&
			isExactProviderRoute(target.url, input.targetUrl),
	);
	if (compatible.length > 1) {
		throw new Error("Dedicated browser work found multiple existing compatible targets.");
	}
	const selected = compatible[0] ?? null;
	if (selected) {
		const deadlineLease = leases.find(
			(lease) => lease.targetId === selected.targetId && lease.state === "idle",
		);
		if (deadlineLease) {
			const released = await input.registry.releasePreserved({
				leaseId: deadlineLease.leaseId,
				expectedRevision: deadlineLease.revision,
				now: (input.now ?? (() => new Date()))().toISOString(),
			});
			if (!released.ok)
				throw new Error(`Existing target deadline transfer failed: ${released.conflict.kind}.`);
		}
	}
	await registerUnownedBrowserTabDeadlines({
		registry: input.registry,
		scope: input.scope,
		now: input.now,
		targets: targets.filter((target) => target.targetId !== selected?.targetId),
	});
	return selected;
}

async function prepareColdStartTarget(
	input: DedicatedBrowserTabInput,
	endpoint: LiveFollowBrowserEndpoint,
): Promise<{
	target: { targetId: string; url: string } | null;
	retirement?: { targetId: string; url: string };
}> {
	// A newly created target carries explicit custody even when Chromium restores other tabs.
	if (input.coldStartTargetPolicy === "create") {
		if (!input.preLeaseProviderTrafficGovernor) {
			throw new Error("Owned cold-start target creation requires a provider traffic governor.");
		}
		if (!input.listTargets)
			throw new Error("Owned cold startup requires a physical target census.");
		await registerUnownedBrowserTabDeadlines({
			registry: input.registry,
			scope: input.scope,
			now: input.now,
			targets: await input.listTargets(endpoint),
		});
		return { target: null };
	}
	if (!input.listTargets) return { target: null };
	const ownedTargetIds = new Set(
		(await input.registry.list())
			.filter((lease) => lease.state !== "released")
			.map((lease) => lease.targetId),
	);
	const unowned = (await input.listTargets(endpoint)).filter(
		(target) => Boolean(target.targetId.trim()) && !ownedTargetIds.has(target.targetId),
	);
	const compatible = unowned.filter((target) => isProviderRoute(target.url, input.targetUrl));
	if (compatible.length > 1) {
		throw new Error("Live-follow browser startup returned multiple compatible unowned targets.");
	}
	if (compatible[0]) return { target: compatible[0] };
	if (unowned.length > 1) {
		throw new Error("Live-follow browser startup returned multiple incompatible unowned targets.");
	}
	const disposable = unowned[0];
	if (!disposable) return { target: null };
	// Closing the only startup page can exit Chromium. Retire it after replacement custody exists.
	return { target: null, retirement: disposable };
}

async function releaseMissingCrawler(
	registry: BrowserTabLeaseRegistry,
	lease: BrowserTabLease,
	now: string,
): Promise<void> {
	const lost = await registry.markLost({
		leaseId: lease.leaseId,
		expectedRevision: lease.revision,
		now,
		reason: "target-missing",
	});
	if (!lost.ok) throw new Error(`Live-follow missing crawler loss failed: ${lost.conflict.kind}.`);
	const released = await registry.releaseLost({
		leaseId: lost.value.leaseId,
		expectedRevision: lost.value.revision,
		now,
		disposition: "already-missing",
	});
	if (!released.ok) {
		throw new Error(`Live-follow missing crawler release failed: ${released.conflict.kind}.`);
	}
}

function assertEndpoint(endpoint: LiveFollowBrowserEndpoint, managedBrowserProfile: string): void {
	if (!endpoint.host.trim() || !Number.isInteger(endpoint.port) || endpoint.port <= 0) {
		throw new Error("Live-follow crawler requires an exact DevTools endpoint.");
	}
	if (endpoint.managedBrowserProfile !== managedBrowserProfile) {
		throw new Error("Live-follow crawler endpoint belongs to a different managed browser profile.");
	}
}

function isProviderRoute(actualUrl: string, expectedUrl: string): boolean {
	try {
		return new URL(actualUrl).hostname === new URL(expectedUrl).hostname;
	} catch {
		return false;
	}
}

function isExactProviderRoute(actualUrl: string, expectedUrl: string): boolean {
	try {
		const actual = new URL(actualUrl);
		const expected = new URL(expectedUrl);
		const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";
		return (
			actual.origin === expected.origin &&
			normalizePath(actual.pathname) === normalizePath(expected.pathname)
		);
	} catch {
		return false;
	}
}

function requireNonEmpty(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${name} must not be empty.`);
	return normalized;
}
