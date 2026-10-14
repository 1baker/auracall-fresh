import { createHash } from "node:crypto";

export type AccountMirrorProviderTrafficPhase =
	| "bootstrap"
	| "index"
	| "detail"
	| "materialization"
	| "cleanup"
	| "unattributed";

export type AccountMirrorProviderTrafficEffectKind =
	| "target_create"
	| "route_visit"
	| "in_page_action"
	| "page_navigate"
	| "reload"
	| "top_level_document"
	| "frame_navigation"
	| "snapshot_refresh"
	| "artifact_resolution"
	| "download_attempt"
	| "network_request"
	| "chatgpt_request"
	| "third_party_request";

export interface AccountMirrorProviderTrafficEffect {
	phase: AccountMirrorProviderTrafficPhase;
	kind: AccountMirrorProviderTrafficEffectKind;
	count: number;
}

export interface AccountMirrorProviderTrafficObservation {
	object: "account_mirror_provider_traffic_observation";
	version: 1;
	scope: "bounded_steady_follow_pass";
	observedAt: string;
	logicalInteractions: number;
	effects: AccountMirrorProviderTrafficEffect[];
	requestKinds?: Readonly<Record<string, number>>;
	warningObserved: boolean;
}

export interface AccountMirrorProviderTrafficBudget {
	phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
	kind: AccountMirrorProviderTrafficEffectKind;
	workKey?: string;
	reason?: string;
	limit: number;
}

export interface AccountMirrorProviderTrafficPlan {
	object: "account_mirror_provider_traffic_plan";
	version: 1;
	budgets: AccountMirrorProviderTrafficBudget[];
}

export interface AccountMirrorProviderTrafficReconciliation {
	object: "account_mirror_provider_traffic_reconciliation";
	version: 1;
	totals: {
		pageNavigations: number;
		topLevelDocuments: number;
		frameNavigations: number;
		networkRequests: number;
	};
	observedEffects: AccountMirrorProviderTrafficEffect[];
	unattributedControllableEffects: Array<{
		kind: AccountMirrorProviderTrafficEffectKind;
		count: number;
	}>;
	budgetViolations: Array<{
		phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
		kind: AccountMirrorProviderTrafficEffectKind;
		observed: number;
		limit: number;
	}>;
}

const CONTROLLABLE_EFFECTS = new Set<AccountMirrorProviderTrafficEffectKind>([
	"target_create",
	"route_visit",
	"in_page_action",
	"page_navigate",
	"reload",
	"top_level_document",
	"snapshot_refresh",
	"artifact_resolution",
	"download_attempt",
]);

export class ProviderTrafficBudgetExceededError extends Error {
	constructor(
		readonly trafficPhase: AccountMirrorProviderTrafficPhase,
		readonly kind: AccountMirrorProviderTrafficEffectKind,
		readonly limit: number,
	) {
		super(`Provider traffic budget exhausted for ${trafficPhase}/${kind} at limit ${limit}.`);
		this.name = "ProviderTrafficBudgetExceededError";
	}
}

export function withAccountMirrorProviderTrafficPlan(
	governor: ProviderTrafficGovernor,
	plan: AccountMirrorProviderTrafficPlan,
): ProviderTrafficGovernor {
	const controller = createAccountMirrorProviderTrafficPlanController(governor);
	for (const phase of uniquePhases(plan.budgets)) {
		controller.freezePhase(
			phase,
			plan.budgets.filter((budget) => budget.phase === phase),
		);
	}
	return controller.governor;
}

export interface AccountMirrorProviderTrafficPlanController {
	readonly governor: ProviderTrafficGovernor;
	freezePhase(
		phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">,
		budgets: readonly AccountMirrorProviderTrafficBudget[],
	): void;
	admitRecovery(input: {
		phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
		kind: AccountMirrorProviderTrafficEffectKind;
		workKey: string;
		reason: string;
	}): void;
	snapshotPlan(): AccountMirrorProviderTrafficPlan;
}

export function createAccountMirrorMetadataTrafficPlanController(
	governor: ProviderTrafficGovernor,
	input: { maxPageReadsPerCycle: number },
): AccountMirrorProviderTrafficPlanController {
	const controller = createAccountMirrorProviderTrafficPlanController(governor);
	controller.freezePhase("bootstrap", [
		{
			phase: "bootstrap",
			kind: "page_navigate",
			workKey: "scope:identity",
			limit: 1,
		},
		{
			phase: "bootstrap",
			kind: "in_page_action",
			workKey: "scope:identity",
			limit: 1,
		},
	]);
	controller.freezePhase("index", [
		{
			phase: "index",
			kind: "page_navigate",
			workKey: "scope:provider-index",
			limit: 1,
		},
		{
			phase: "index",
			kind: "in_page_action",
			workKey: "scope:provider-index",
			limit: Math.max(0, Math.floor(input.maxPageReadsPerCycle)) + 2,
		},
	]);
	return controller;
}

export function freezeAccountMirrorDetailTrafficPlan(
	controller: AccountMirrorProviderTrafficPlanController,
	input: { workKeys: readonly string[] },
): void {
	controller.freezePhase(
		"detail",
		input.workKeys.flatMap((workKey) => [
			{ phase: "detail" as const, kind: "page_navigate" as const, workKey, limit: 1 },
			{ phase: "detail" as const, kind: "in_page_action" as const, workKey, limit: 1 },
		]),
	);
}

export function createAccountMirrorProviderTrafficWorkKey(
	scope: "conversation" | "project" | "materialization" | "recovery",
	localId: string,
): string {
	return `sha256:${createHash("sha256").update(`${scope}\0${localId}`).digest("hex")}`;
}

export function createAccountMirrorProviderTrafficPlanController(
	governor: ProviderTrafficGovernor,
): AccountMirrorProviderTrafficPlanController {
	const budgets: AccountMirrorProviderTrafficBudget[] = [];
	const frozenPhases = new Set<Exclude<AccountMirrorProviderTrafficPhase, "unattributed">>();
	const admitted = new Map<string, number>();
	const plannedKey = (
		phase: AccountMirrorProviderTrafficPhase,
		kind: AccountMirrorProviderTrafficEffectKind,
		workKey: string | null | undefined,
	) => `${phase}:${kind}:${workKey ?? "*"}`;
	const budgetLimit = (
		phase: AccountMirrorProviderTrafficPhase,
		kind: AccountMirrorProviderTrafficEffectKind,
		workKey: string | null | undefined,
		interactionClass: string,
		reason: string | null | undefined,
	) =>
		budgets.reduce(
			(total, budget) =>
				budget.phase === phase &&
				budget.kind === kind &&
				(budget.workKey === undefined || budget.workKey === workKey) &&
				(budget.reason
					? interactionClass === "provider-recovery" && budget.reason === reason
					: interactionClass !== "provider-recovery")
					? total + Math.max(0, Math.floor(budget.limit))
					: total,
			0,
		);
	const budgetKey = (
		phase: AccountMirrorProviderTrafficPhase,
		kind: AccountMirrorProviderTrafficEffectKind,
		workKey: string | null | undefined,
		interactionClass: string,
		reason: string | null | undefined,
	) => {
		const hasExact = budgets.some(
			(budget) =>
				budget.phase === phase &&
				budget.kind === kind &&
				budget.workKey === workKey &&
				(budget.reason ?? null) ===
					(interactionClass === "provider-recovery" ? (reason ?? null) : null),
		);
		return `${plannedKey(phase, kind, hasExact ? workKey : null)}:${interactionClass === "provider-recovery" ? (reason ?? "missing-reason") : "ordinary"}`;
	};
	const budgetedGovernor: ProviderTrafficGovernor = {
		attribution: governor.attribution,
		checkWarning: governor.checkWarning?.bind(governor),
		admitBackendRequest: governor.admitBackendRequest?.bind(governor),
		snapshotAdmissionState: () => {
			const byBudget = new Map<
				string,
				{ phase: string; kind: string; admitted: number; limit: number }
			>();
			for (const budget of budgets) {
				const interactionClass = budget.reason ? "provider-recovery" : "ordinary";
				const key = budgetKey(
					budget.phase,
					budget.kind,
					budget.workKey,
					interactionClass,
					budget.reason,
				);
				const aggregateKey = `${budget.phase}:${budget.kind}`;
				const current = byBudget.get(aggregateKey) ?? {
					phase: budget.phase,
					kind: budget.kind,
					admitted: 0,
					limit: 0,
				};
				current.admitted += admitted.get(key) ?? 0;
				current.limit += budget.limit;
				byBudget.set(aggregateKey, current);
			}
			const budgetState = [...byBudget.values()].map((entry) => ({
				...entry,
				remaining: Math.max(0, entry.limit - entry.admitted),
			}));
			const byPhase = new Map<string, { phase: string; admitted: number; limit: number }>();
			for (const entry of budgetState) {
				const current = byPhase.get(entry.phase) ?? {
					phase: entry.phase,
					admitted: 0,
					limit: 0,
				};
				current.admitted += entry.admitted;
				current.limit += entry.limit;
				byPhase.set(entry.phase, current);
			}
			const recentEffects = governor.snapshotAdmissionState?.().recentEffects;
			return {
				version: 1,
				phases: [...byPhase.values()].map((entry) => ({
					...entry,
					remaining: Math.max(0, entry.limit - entry.admitted),
				})),
				budgets: budgetState,
				...(recentEffects ? { recentEffects } : {}),
			};
		},
		async begin(input) {
			const kind = mutationEffectKind(input.kind);
			if (!kind) return governor.begin(input);
			const phase = input.trafficPhase ?? "unattributed";
			const limit = budgetLimit(phase, kind, input.workKey, input.interactionClass, input.reason);
			const key = budgetKey(phase, kind, input.workKey, input.interactionClass, input.reason);
			const next = (admitted.get(key) ?? 0) + 1;
			if (next > limit) throw new ProviderTrafficBudgetExceededError(phase, kind, limit);
			admitted.set(key, next);
			try {
				return await governor.begin(input);
			} catch (error) {
				admitted.set(key, next - 1);
				throw error;
			}
		},
	};
	return {
		governor: budgetedGovernor,
		freezePhase(phase, phaseBudgets) {
			if (frozenPhases.has(phase)) {
				throw new Error(`Provider traffic phase ${phase} is already frozen.`);
			}
			for (const budget of phaseBudgets) {
				if (budget.phase !== phase) {
					throw new Error(
						`Provider traffic budget phase ${budget.phase} does not match frozen phase ${phase}.`,
					);
				}
				budgets.push({
					...budget,
					...(budget.workKey ? { workKey: budget.workKey.trim() } : {}),
					limit: Math.max(0, Math.floor(budget.limit)),
				});
			}
			frozenPhases.add(phase);
		},
		admitRecovery({ phase, kind, workKey, reason }) {
			if (!frozenPhases.has(phase)) {
				throw new Error(`Provider traffic recovery requires frozen phase ${phase}.`);
			}
			const normalizedWorkKey = workKey.trim();
			const normalizedReason = reason.trim();
			if (!/^sha256:[a-f0-9]{64}$/.test(normalizedWorkKey)) {
				throw new Error("Provider traffic recovery requires a privacy-bounded sha256 work key.");
			}
			if (!normalizedReason) {
				throw new Error("Provider traffic recovery requires a causal reason.");
			}
			budgets.push({
				phase,
				kind,
				workKey: normalizedWorkKey,
				reason: normalizedReason,
				limit: 1,
			});
		},
		snapshotPlan: () => ({
			object: "account_mirror_provider_traffic_plan",
			version: 1,
			budgets: budgets.map((budget) => ({ ...budget })),
		}),
	};
}

function uniquePhases(
	budgets: readonly AccountMirrorProviderTrafficBudget[],
): Array<Exclude<AccountMirrorProviderTrafficPhase, "unattributed">> {
	return [...new Set(budgets.map((budget) => budget.phase))];
}

export function createAccountMirrorProviderTrafficObservation(input: {
	observedAt: string;
	logicalInteractions: number;
	mutations: readonly BrowserMutationRecord[];
	cdpEffects?: readonly AccountMirrorProviderTrafficEffect[];
	requestKinds?: Readonly<Record<string, number>>;
	warningObserved: boolean;
}): AccountMirrorProviderTrafficObservation {
	const effects: AccountMirrorProviderTrafficEffect[] = [];
	for (const mutation of input.mutations) {
		if (mutation.phase !== "complete") continue;
		const kind = mutationEffectKind(mutation.kind);
		if (!kind) continue;
		effects.push({
			phase: mutation.trafficPhase ?? "unattributed",
			kind,
			count: 1,
		});
	}
	effects.push(...(input.cdpEffects ?? []).map(normalizeEffect));
	return {
		object: "account_mirror_provider_traffic_observation",
		version: 1,
		scope: "bounded_steady_follow_pass",
		observedAt: input.observedAt,
		logicalInteractions: Math.max(0, Math.floor(input.logicalInteractions)),
		effects: aggregateEffects(effects),
		...(input.requestKinds ? { requestKinds: { ...input.requestKinds } } : {}),
		warningObserved: input.warningObserved,
	};
}

export function reconcileAccountMirrorProviderTraffic(input: {
	plan: AccountMirrorProviderTrafficPlan;
	observation: AccountMirrorProviderTrafficObservation;
}): AccountMirrorProviderTrafficReconciliation {
	const effects = input.observation.effects.map(normalizeEffect);
	const budgetViolations = collectBudgetViolations(input.plan, effects);
	return {
		object: "account_mirror_provider_traffic_reconciliation",
		version: 1,
		totals: {
			pageNavigations: sumEffects(effects, "page_navigate"),
			topLevelDocuments: sumEffects(effects, "top_level_document"),
			frameNavigations: sumEffects(effects, "frame_navigation"),
			networkRequests: sumEffects(effects, "network_request"),
		},
		observedEffects: effects,
		unattributedControllableEffects: effects
			.filter((effect) => effect.phase === "unattributed" && CONTROLLABLE_EFFECTS.has(effect.kind))
			.map(({ kind, count }) => ({ kind, count })),
		budgetViolations,
	};
}

export function assertAccountMirrorProviderTrafficReconciled(
	reconciliation: AccountMirrorProviderTrafficReconciliation,
): void {
	const unattributedCount = reconciliation.unattributedControllableEffects.reduce(
		(total, effect) => total + effect.count,
		0,
	);
	if (unattributedCount > 0) {
		throw new Error(
			`Provider traffic reconciliation failed: ${unattributedCount} unattributed controllable provider effects.`,
		);
	}
	if (reconciliation.budgetViolations.length > 0) {
		throw new Error(
			`Provider traffic reconciliation failed: ${reconciliation.budgetViolations.length} provider traffic budget violation${reconciliation.budgetViolations.length === 1 ? "" : "s"}.`,
		);
	}
}

function collectBudgetViolations(
	plan: AccountMirrorProviderTrafficPlan,
	effects: readonly AccountMirrorProviderTrafficEffect[],
): AccountMirrorProviderTrafficReconciliation["budgetViolations"] {
	const observed = new Map<
		string,
		{
			phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
			kind: AccountMirrorProviderTrafficEffectKind;
			count: number;
		}
	>();
	for (const effect of effects) {
		if (effect.phase === "unattributed" || !CONTROLLABLE_EFFECTS.has(effect.kind)) continue;
		const key = `${effect.phase}:${effect.kind}`;
		const current = observed.get(key);
		observed.set(key, {
			phase: effect.phase,
			kind: effect.kind,
			count: (current?.count ?? 0) + effect.count,
		});
	}
	const limits = new Map<string, number>();
	for (const budget of plan.budgets) {
		const key = `${budget.phase}:${budget.kind}`;
		limits.set(key, (limits.get(key) ?? 0) + Math.max(0, Math.floor(budget.limit)));
	}
	return [...observed.entries()]
		.filter(([key, effect]) => effect.count > (limits.get(key) ?? 0))
		.map(([key, effect]) => ({
			phase: effect.phase,
			kind: effect.kind,
			observed: effect.count,
			limit: limits.get(key) ?? 0,
		}));
}

function normalizeEffect(
	effect: AccountMirrorProviderTrafficEffect,
): AccountMirrorProviderTrafficEffect {
	return {
		phase: effect.phase,
		kind: effect.kind,
		count: Math.max(0, Math.floor(effect.count)),
	};
}

function mutationEffectKind(
	kind: BrowserMutationRecord["kind"],
): AccountMirrorProviderTrafficEffectKind | null {
	if (kind === "navigate" || kind === "location-assign") return "page_navigate";
	if (kind === "reload") return "reload";
	if (kind === "target-open-or-reuse") return "target_create";
	if (kind === "in-page-click") return "in_page_action";
	return null;
}

function aggregateEffects(
	effects: readonly AccountMirrorProviderTrafficEffect[],
): AccountMirrorProviderTrafficEffect[] {
	const aggregated = new Map<string, AccountMirrorProviderTrafficEffect>();
	for (const rawEffect of effects) {
		const effect = normalizeEffect(rawEffect);
		const key = `${effect.phase}:${effect.kind}`;
		const previous = aggregated.get(key);
		aggregated.set(key, { ...effect, count: (previous?.count ?? 0) + effect.count });
	}
	return [...aggregated.values()];
}

function sumEffects(
	effects: readonly AccountMirrorProviderTrafficEffect[],
	kind: AccountMirrorProviderTrafficEffectKind,
): number {
	return effects.reduce((total, effect) => total + (effect.kind === kind ? effect.count : 0), 0);
}

import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import type { ProviderTrafficGovernor } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
