import { createFileBackedTabLeaseRetirementAudit, type TabLeaseRetirementAuditSink } from "../../packages/browser-service/src/service/tabLeaseRetirementAudit.js";
import path from "node:path";

import {
	createFileBackedProviderInteractionLedger,
	type ProviderInteractionAdmissionRejectionReason,
	type ProviderInteractionLedger,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	type BrowserTabActionCounts,
	type BrowserTabLease,
	type BrowserTabLeaseRegistry,
	createFileBackedBrowserTabLeaseRegistry,
	isTabLeaseTtlExempt,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { ResolvedUserConfig } from "../config.js";

export type BrowserTabConcurrencyMode = "serialized" | "tab-affinity";

export interface BrowserTabConcurrencyStatus {
	mode: BrowserTabConcurrencyMode;
	enabled: boolean;
	storageRoot: string | null;
	leaseCount: number;
	fencedLeaseCount: number;
	interactionCount: number;
	activeInteractionCount: number;
	providerWarningEventCount: number;
	providerWarnings: {
		active: number;
		indefinite: number;
		cooldown: number;
		classifications: Record<string, number>;
		maximumCooldownRemainingMs: number;
	};
	admissionRejections: {
		total: number;
		latestReason: ProviderInteractionAdmissionRejectionReason | null;
		reasons: Partial<Record<ProviderInteractionAdmissionRejectionReason, number>>;
	};
	aggregateUsage: {
		activeChats: number;
		chatsLastHour: number;
		chatsLastDay: number;
		interactionsLastMinute: number;
	};
	leaseStates: {
		active: number;
		idle: number;
		retiring: number;
		released: number;
		lost: number;
	};
	workloads: {
		conversations: number;
		newConversations: number;
		liveFollow: number;
		ephemeral: number;
	};
	attention: {
		expiredIdle: number;
		outcomeUnknown: number;
		restartUnverified: number;
	};
	bindingLifetimes: Array<{
		workloadKind: BrowserTabLease["workload"]["kind"];
		ttlExempt?: boolean;
		processId?: number | null;
		state: BrowserTabLease["state"];
		effectState: BrowserTabLease["effectState"];
		ageMs: number;
		lastMeaningfulUseAgeMs: number;
		idleRemainingMs: number;
		absoluteRemainingMs: number;
		idleExpired: boolean;
		absoluteExpired: boolean;
	}>;
	targetActions: BrowserTabActionCounts;
	targetActionsByWorkload: {
		conversations: BrowserTabActionCounts;
		newConversations: BrowserTabActionCounts;
		liveFollow: BrowserTabActionCounts;
		ephemeral: BrowserTabActionCounts;
	};
	retirements: {
		closed: number;
		alreadyMissing: number;
		preserved: number;
	};
}

export interface BrowserTabConcurrencyRuntime {
	mode: BrowserTabConcurrencyMode;
	enabled: boolean;
	storageRoot: string | null;
	registry: BrowserTabLeaseRegistry | null;
	retirementAudit?: TabLeaseRetirementAuditSink;
	ledger: ProviderInteractionLedger | null;
	readStatus(): Promise<BrowserTabConcurrencyStatus>;
}

export function createBrowserTabConcurrencyRuntime(
	userConfig: ResolvedUserConfig,
	options: { storageRoot?: string; now?: () => Date } = {},
): BrowserTabConcurrencyRuntime {
	const mode = userConfig.browser?.tabConcurrencyMode ?? "serialized";
	const storageRoot =
		options.storageRoot ?? path.join(getAuracallHomeDir(), "browser-coordination");
	const registry = createFileBackedBrowserTabLeaseRegistry({
		registryRoot: path.join(storageRoot, "tab-leases"),
	});
	const ledger = createFileBackedProviderInteractionLedger({
		ledgerRoot: path.join(storageRoot, "provider-interactions"),
	});
	return {
		mode,
		enabled: mode === "tab-affinity",
		storageRoot,
		registry,
		retirementAudit: createFileBackedTabLeaseRetirementAudit(path.join(storageRoot, "tab-leases", "retirement-events.v1.jsonl")),
		ledger,
		readStatus: async () => {
			const now = (options.now ?? (() => new Date()))();
			const [leases, interactions, events, activeWarnings, aggregateUsage] = await Promise.all([
				registry.list(),
				ledger.list(),
				ledger.listEvents(),
				ledger.listActiveProviderWarnings({ now: now.toISOString() }),
				ledger.summarizeAggregateUsage({ now: now.toISOString() }),
			]);
			const nowMs = now.getTime();
			const fencedLeases = leases.filter((lease) =>
				["active", "idle", "retiring", "lost"].includes(lease.state),
			);
			const rejectionEvents = events.filter((event) => event.type === "admission-rejected");
			return {
				mode,
				enabled: mode === "tab-affinity",
				storageRoot,
				leaseCount: leases.length,
				fencedLeaseCount: fencedLeases.length,
				interactionCount: interactions.length,
				activeInteractionCount: interactions.filter(
					(interaction) => interaction.state === "reserved" || interaction.state === "started",
				).length,
				providerWarningEventCount: events.filter(
					(event) => event.type === "provider-warning-observed",
				).length,
				providerWarnings: {
					active: activeWarnings.length,
					indefinite: activeWarnings.filter((warning) => warning.cooldownUntil === null).length,
					cooldown: activeWarnings.filter((warning) => warning.cooldownUntil !== null).length,
					classifications: activeWarnings.reduce<Record<string, number>>((counts, warning) => {
						counts[warning.classification] = (counts[warning.classification] ?? 0) + 1;
						return counts;
					}, {}),
					maximumCooldownRemainingMs: activeWarnings.reduce(
						(maximum, warning) =>
							warning.cooldownUntil === null
								? maximum
								: Math.max(maximum, Date.parse(warning.cooldownUntil) - nowMs),
						0,
					),
				},
				admissionRejections: {
					total: rejectionEvents.length,
					latestReason:
						(rejectionEvents.at(-1)
							?.reason as ProviderInteractionAdmissionRejectionReason | null) ?? null,
					reasons: rejectionEvents.reduce<
						Partial<Record<ProviderInteractionAdmissionRejectionReason, number>>
					>((counts, event) => {
						const reason = event.reason as ProviderInteractionAdmissionRejectionReason;
						counts[reason] = (counts[reason] ?? 0) + 1;
						return counts;
					}, {}),
				},
				aggregateUsage,
				leaseStates: {
					active: leases.filter((lease) => lease.state === "active").length,
					idle: leases.filter((lease) => lease.state === "idle").length,
					retiring: leases.filter((lease) => lease.state === "retiring").length,
					released: leases.filter((lease) => lease.state === "released").length,
					lost: leases.filter((lease) => lease.state === "lost").length,
				},
				workloads: {
					conversations: leases.filter((lease) => lease.workload.kind === "conversation").length,
					newConversations: leases.filter((lease) => lease.workload.kind === "new-conversation")
						.length,
					liveFollow: leases.filter((lease) => lease.workload.kind === "live-follow").length,
					ephemeral: leases.filter((lease) => lease.workload.kind === "ephemeral").length,
				},
				attention: {
					expiredIdle: leases.filter(
						(lease) =>
							lease.state === "idle" &&
							!isTabLeaseTtlExempt(lease) &&
							(nowMs >= Date.parse(lease.idleExpiresAt) ||
								nowMs >= Date.parse(lease.absoluteExpiresAt)),
					).length,
					outcomeUnknown: fencedLeases.filter((lease) => lease.effectState === "outcome-unknown")
						.length,
					restartUnverified: leases.filter(
						(lease) => lease.state === "lost" && lease.lossReason === "restart-unverified",
					).length,
				},
				bindingLifetimes: fencedLeases
					.map((lease) => ({
						workloadKind: lease.workload.kind,
						ttlExempt: isTabLeaseTtlExempt(lease),
						processId: lease.processBinding?.processId ?? null,
						state: lease.state,
						effectState: lease.effectState,
						ageMs: Math.max(0, nowMs - Date.parse(lease.acquiredAt)),
						lastMeaningfulUseAgeMs: Math.max(0, nowMs - Date.parse(lease.lastMeaningfulUseAt)),
						idleRemainingMs: Math.max(0, Date.parse(lease.idleExpiresAt) - nowMs),
						absoluteRemainingMs: Math.max(0, Date.parse(lease.absoluteExpiresAt) - nowMs),
						idleExpired: !isTabLeaseTtlExempt(lease) && nowMs >= Date.parse(lease.idleExpiresAt),
						absoluteExpired:
							!isTabLeaseTtlExempt(lease) && nowMs >= Date.parse(lease.absoluteExpiresAt),
					}))
					.sort(
						(left, right) =>
							[
								left.workloadKind.localeCompare(right.workloadKind),
								left.state.localeCompare(right.state),
								left.effectState.localeCompare(right.effectState),
								left.ageMs - right.ageMs,
								left.absoluteRemainingMs - right.absoluteRemainingMs,
							].find((value) => value !== 0) ?? 0,
					),
				targetActions: sumActionCounts(leases),
				targetActionsByWorkload: {
					conversations: sumActionCounts(
						leases.filter((lease) => lease.workload.kind === "conversation"),
					),
					newConversations: sumActionCounts(
						leases.filter((lease) => lease.workload.kind === "new-conversation"),
					),
					liveFollow: sumActionCounts(
						leases.filter((lease) => lease.workload.kind === "live-follow"),
					),
					ephemeral: sumActionCounts(leases.filter((lease) => lease.workload.kind === "ephemeral")),
				},
				retirements: {
					closed: leases.filter((lease) => lease.finalDisposition === "closed").length,
					alreadyMissing: leases.filter((lease) => lease.finalDisposition === "already-missing")
						.length,
					preserved: leases.filter((lease) => lease.finalDisposition === "preserved").length,
				},
			};
		},
	};
}

function emptyActionCounts(): BrowserTabActionCounts {
	return {
		targetCreations: 0,
		adoptions: 0,
		navigations: 0,
		reloads: 0,
		focuses: 0,
		closes: 0,
	};
}

function sumActionCounts(leases: readonly BrowserTabLease[]): BrowserTabActionCounts {
	return leases.reduce<BrowserTabActionCounts>(
		(totals, lease) => ({
			targetCreations: totals.targetCreations + lease.actionCounts.targetCreations,
			adoptions: totals.adoptions + lease.actionCounts.adoptions,
			navigations: totals.navigations + lease.actionCounts.navigations,
			reloads: totals.reloads + lease.actionCounts.reloads,
			focuses: totals.focuses + lease.actionCounts.focuses,
			closes: totals.closes + lease.actionCounts.closes,
		}),
		emptyActionCounts(),
	);
}
