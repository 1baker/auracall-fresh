import { requireInactiveChatgptTab, type probeChatgptTabActivity } from "./chatgptTabActivity.js";
import {
	closeRemoteChromeTarget,
	listChromeTargets,
} from "../../packages/browser-service/src/chromeLifecycle.js";
import { registerUnownedBrowserTabDeadlines } from "../../packages/browser-service/src/service/tabInventory.js";
import {
	type BrowserTabLeaseRegistry,
	getCurrentTabLeaseOwnerIdentity,
	isTabLeaseTtlExempt,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";
import { getCurrentRuntimeProfiles } from "../config/model.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import {
	chatgptTargetMatchesLease,
	retireExpiredChatgptTabLeases,
} from "./chatgptTabRetirement.js";
import { BrowserService } from "./service/browserService.js";
import { resolveRuntimeProfileUserConfig } from "./service/profileConfig.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

export interface ConfiguredChatgptTabMaintenanceSummary {
	configuredScopeCount: number;
	visitedScopeCount: number;
	deferredScopeCount: number;
	closedCount: number;
	alreadyMissingCount: number;
	preservedCount: number;
	restartLostCount: number;
	restartMissingReleasedCount: number;
	restartPreservedCount: number;
	restartIdentityMismatchCount: number;
	liveChatgptTargetCount: number;
	fencedLiveTargetCount: number;
	unleasedLiveTargetCount: number;
	targetCensusErrorCount: number;
	errors: Array<{ runtimeProfileId: string; message: string }>;
}

interface MaintenanceBrowserService {
	resolveServiceTarget(input: {
		serviceId: "chatgpt";
		configuredUrl: string;
		ensurePort: false;
		abortSignal?: AbortSignal;
	}): Promise<{
		host?: string;
		port?: number;
		managedBrowserProfile?: string | null;
	}>;
}

export interface ConfiguredChatgptTabMaintenanceDeps {
	createRuntime?: (config: ResolvedUserConfig) => {
		registry: BrowserTabLeaseRegistry | null;
	};
	createBrowserService?: (config: ResolvedUserConfig) => MaintenanceBrowserService;
	listTargets?: typeof listChromeTargets;
	closeTarget?: typeof closeRemoteChromeTarget;
	probeActivity?: typeof probeChatgptTabActivity;
	currentOwner?: { processId: number; instanceId: string };
	isOwnerAlive?: (processId: number) => boolean;
}

export interface ConfiguredChatgptShutdownLeaseRetirementSummary {
	retiredLeaseIds: string[];
	deferredLeaseIds: string[];
}

/**
 * Reconcile lease records only after the caller has positively established
 * that the exact managed browser is stopped. This deliberately performs no
 * browser or provider I/O.
 */
export async function retireConfiguredChatgptIdleLeasesAfterManagedBrowserShutdown(input: {
	userConfig: ResolvedUserConfig | Record<string, unknown>;
	runtimeProfileId: string;
	managedBrowserProfile: string;
	now?: () => Date;
	deps?: Pick<ConfiguredChatgptTabMaintenanceDeps, "createRuntime">;
}): Promise<ConfiguredChatgptShutdownLeaseRetirementSummary> {
	const summary: ConfiguredChatgptShutdownLeaseRetirementSummary = {
		retiredLeaseIds: [],
		deferredLeaseIds: [],
	};
	const runtimeProfileId = input.runtimeProfileId.trim();
	const managedBrowserProfile = input.managedBrowserProfile.trim();
	if (!runtimeProfileId || !managedBrowserProfile) return summary;
	const config = resolveRuntimeProfileUserConfig(input.userConfig as ResolvedUserConfig, {
		runtimeProfileId,
		provider: "chatgpt",
	}) as ResolvedUserConfig;
	if (config.browser?.tabConcurrencyMode !== "tab-affinity") return summary;
	const tenantKey = resolveConfiguredServiceAccountId(config as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId,
	});
	if (!tenantKey) throw new Error("configured ChatGPT tenant identity is missing");
	const runtime = (input.deps?.createRuntime ?? createBrowserTabConcurrencyRuntime)(config);
	if (!runtime.registry) throw new Error("tab-affinity registry is unavailable");
	const idleLeases = await runtime.registry.list({
		scope: {
			runtimeProfileId,
			managedBrowserProfile,
			service: "chatgpt",
			tenantKey,
		},
		states: ["idle"],
	});
	for (const lease of idleLeases.sort((left, right) => left.leaseId.localeCompare(right.leaseId))) {
		if (
			lease.ownerOperationId !== null ||
			lease.effectState === "in-flight" ||
			lease.effectState === "outcome-unknown"
		) {
			summary.deferredLeaseIds.push(lease.leaseId);
			continue;
		}
		const now = (input.now ?? (() => new Date()))().toISOString();
		const retiring = await runtime.registry.beginRetirement({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now,
			reason: "operator",
		});
		if (!retiring.ok) {
			summary.deferredLeaseIds.push(lease.leaseId);
			continue;
		}
		const released = await runtime.registry.finishRetirement({
			leaseId: lease.leaseId,
			retirementRevision: retiring.value.retirementRevision,
			now,
			disposition: "already-missing",
		});
		if (!released.ok) {
			summary.deferredLeaseIds.push(lease.leaseId);
			continue;
		}
		summary.retiredLeaseIds.push(lease.leaseId);
	}
	return summary;
}

export async function runConfiguredChatgptTabMaintenance(input: {
	userConfig: ResolvedUserConfig;
	now?: () => Date;
	abortSignal?: AbortSignal;
	deps?: ConfiguredChatgptTabMaintenanceDeps;
}): Promise<ConfiguredChatgptTabMaintenanceSummary> {
	const summary: ConfiguredChatgptTabMaintenanceSummary = {
		configuredScopeCount: 0,
		visitedScopeCount: 0,
		deferredScopeCount: 0,
		closedCount: 0,
		alreadyMissingCount: 0,
		preservedCount: 0,
		restartLostCount: 0,
		restartMissingReleasedCount: 0,
		restartPreservedCount: 0,
		restartIdentityMismatchCount: 0,
		liveChatgptTargetCount: 0,
		fencedLiveTargetCount: 0,
		unleasedLiveTargetCount: 0,
		targetCensusErrorCount: 0,
		errors: [],
	};
	const deps = input.deps ?? {};
	const observedCensuses = new Map<string, Awaited<ReturnType<typeof listChromeTargets>>>();
	const configuredRuntimeProfileIds = Object.keys(
		getCurrentRuntimeProfiles(input.userConfig as Record<string, unknown>),
	).sort();
	const fallbackRuntimeProfileId =
		typeof input.userConfig.auracallProfile === "string" && input.userConfig.auracallProfile.trim()
			? input.userConfig.auracallProfile.trim()
			: typeof input.userConfig.defaultRuntimeProfile === "string" &&
					input.userConfig.defaultRuntimeProfile.trim()
				? input.userConfig.defaultRuntimeProfile.trim()
				: "default";
	const runtimeProfileIds =
		configuredRuntimeProfileIds.length > 0
			? configuredRuntimeProfileIds
			: [fallbackRuntimeProfileId];
	const seenScopes = new Set<string>();
	const seenTargetCensuses = new Set<string>();

	for (const runtimeProfileId of runtimeProfileIds) {
		if (input.abortSignal?.aborted) break;
		try {
			const config = resolveRuntimeProfileUserConfig(input.userConfig, {
				runtimeProfileId,
				provider: "chatgpt",
			}) as ResolvedUserConfig;
			if (config.browser?.tabConcurrencyMode !== "tab-affinity") continue;
			summary.configuredScopeCount += 1;
			const tenantKey = resolveConfiguredServiceAccountId(config as Record<string, unknown>, {
				serviceId: "chatgpt",
				runtimeProfileId,
			});
			if (!tenantKey) throw new Error("configured ChatGPT tenant identity is missing");

			const runtime = (deps.createRuntime ?? createBrowserTabConcurrencyRuntime)(config);
			if (!runtime.registry) throw new Error("tab-affinity registry is unavailable");
			const browserService =
				deps.createBrowserService?.(config) ?? BrowserService.fromConfig(config, "chatgpt");
			const configuredUrl =
				config.browser?.chatgptUrl ?? config.browser?.url ?? "https://chatgpt.com/";
			const target = await browserService.resolveServiceTarget({
				serviceId: "chatgpt",
				configuredUrl,
				ensurePort: false,
				abortSignal: input.abortSignal,
			});
			const managedBrowserProfile = target.managedBrowserProfile?.trim();
			if (!managedBrowserProfile) throw new Error("managed browser profile is unresolved");
			const scopeKey = [runtimeProfileId, managedBrowserProfile, tenantKey].join("\u0000");
			if (seenScopes.has(scopeKey)) continue;
			seenScopes.add(scopeKey);
			summary.visitedScopeCount += 1;
			const endpoint =
				target.host && target.port
					? { host: target.host, port: target.port, managedBrowserProfile }
					: null;
			const listTargets = deps.listTargets ?? listChromeTargets;
			const closeTarget = deps.closeTarget ?? closeRemoteChromeTarget;
			const scope = {
				runtimeProfileId,
				managedBrowserProfile,
				service: "chatgpt",
				tenantKey,
			};
			if (endpoint) {
				const censusKey = `${managedBrowserProfile}\u0000${endpoint.host}\u0000${endpoint.port}`;
				const targets =
					observedCensuses.get(censusKey) ?? (await listTargets(endpoint.port, endpoint.host));
				observedCensuses.set(censusKey, targets);
				await registerUnownedBrowserTabDeadlines({
					registry: runtime.registry,
					scope,
					now: input.now,
					targets: targets.flatMap((target) => {
						const record = target as {
							id?: string;
							targetId?: string;
							type?: string;
							url?: string;
						};
						const targetId = record.targetId ?? record.id;
						return targetId && (!record.type || record.type === "page")
							? [{ targetId, url: record.url ?? "about:blank" }]
							: [];
					}),
				});
			}
			const staleActive = await reconcileStaleTabLeases({
				registry: runtime.registry,
				scope,
				now: input.now,
				currentOwner: deps.currentOwner ?? getCurrentTabLeaseOwnerIdentity(),
				isOwnerAlive: deps.isOwnerAlive,
			});
			summary.restartLostCount += staleActive.filter(
				(stale) => stale.disposition === "lost",
			).length;
			const lostLeases = await runtime.registry.list({ scope, states: ["lost"] });
			for (const lostLease of lostLeases) {
				let target: { url?: string } | undefined;
				if (endpoint) {
					const targets = await listTargets(endpoint.port, endpoint.host);
					target = targets.find((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						return (record.targetId ?? record.id) === lostLease.targetId;
					}) as { url?: string } | undefined;
				}
				if (!target) {
					const released = await runtime.registry.releaseLost({
						leaseId: lostLease.leaseId,
						expectedRevision: lostLease.revision,
						now: (input.now ?? (() => new Date()))().toISOString(),
						disposition: "already-missing",
					});
					if (released.ok) summary.restartMissingReleasedCount += 1;
					else summary.deferredScopeCount += 1;
					continue;
				}
				const nowMs = (input.now ?? (() => new Date()))().getTime();
				const expired =
					nowMs >= Date.parse(lostLease.idleExpiresAt) ||
					nowMs >= Date.parse(lostLease.absoluteExpiresAt);
				if (expired && endpoint && !isTabLeaseTtlExempt(lostLease)) {
					await requireInactiveChatgptTab(endpoint, lostLease.targetId, deps.probeActivity);
					await closeTarget(endpoint.host, endpoint.port, lostLease.targetId, () => undefined);
					const remainingTargets = await listTargets(endpoint.port, endpoint.host);
					const stillLive = remainingTargets.some((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						return (record.targetId ?? record.id) === lostLease.targetId;
					});
					if (!stillLive) {
						const released = await runtime.registry.releaseLost({
							leaseId: lostLease.leaseId,
							expectedRevision: lostLease.revision,
							now: new Date(nowMs).toISOString(),
							disposition: "closed",
						});
						if (released.ok) summary.closedCount += 1;
						else summary.deferredScopeCount += 1;
						continue;
					}
					if (!chatgptTargetMatchesLease(lostLease, { url: target.url ?? "" })) {
						summary.restartIdentityMismatchCount += 1;
						continue;
					}
				}
				summary.restartPreservedCount += 1;
			}
			const outcomes = await retireExpiredChatgptTabLeases({
				retireAllExpiredPages: true,
				probeActivity: deps.probeActivity,
				registry: runtime.registry,
				scope,
				endpoint,
				now: input.now,
				inspectTarget: async (resolvedEndpoint, targetId) => {
					const targets = await listTargets(resolvedEndpoint.port, resolvedEndpoint.host);
					const match = targets.find((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						return (record.targetId ?? record.id) === targetId;
					}) as { url?: string } | undefined;
					return typeof match?.url === "string" ? { url: match.url } : null;
				},
				closeTarget: (resolvedEndpoint, targetId) =>
					closeTarget(resolvedEndpoint.host, resolvedEndpoint.port, targetId, () => undefined),
				endpointAbsenceProvesTargetsMissing: true,
			});
			for (const outcome of outcomes) {
				if (outcome.disposition === "deferred") summary.deferredScopeCount += 1;
				if (outcome.disposition === "closed") summary.closedCount += 1;
				if (outcome.disposition === "already-missing") summary.alreadyMissingCount += 1;
				if (outcome.disposition === "preserved") summary.preservedCount += 1;
			}
			if (endpoint) {
				const censusKey = [managedBrowserProfile, endpoint.host, String(endpoint.port)].join(
					"\u0000",
				);
				if (seenTargetCensuses.has(censusKey)) continue;
				try {
					const [targets, fencedTargetIds] = await Promise.all([
						Promise.resolve(observedCensuses.get(censusKey) ?? []).then((targets) =>
							summary.closedCount > 0 ? listTargets(endpoint.port, endpoint.host) : targets,
						),
						runtime.registry.listFencedTargetIds(scope),
					]);
					const fenced = new Set(fencedTargetIds);
					const chatgptTargets = targets.filter((candidate) => {
						const record = candidate as { type?: string; url?: string };
						if (record.type && record.type !== "page") return false;
						try {
							return new URL(record.url ?? "").hostname === "chatgpt.com";
						} catch {
							return false;
						}
					});
					const fencedLiveCount = chatgptTargets.filter((candidate) => {
						const record = candidate as { id?: string; targetId?: string };
						const targetId = record.targetId ?? record.id;
						return Boolean(targetId && fenced.has(targetId));
					}).length;
					summary.liveChatgptTargetCount += chatgptTargets.length;
					summary.fencedLiveTargetCount += fencedLiveCount;
					summary.unleasedLiveTargetCount += chatgptTargets.length - fencedLiveCount;
					seenTargetCensuses.add(censusKey);
				} catch {
					summary.targetCensusErrorCount += 1;
				}
			}
		} catch (error) {
			summary.errors.push({
				runtimeProfileId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return summary;
}
