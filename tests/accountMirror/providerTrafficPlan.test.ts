import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	type AccountMirrorProviderTrafficObservation,
	assertAccountMirrorProviderTrafficReconciled,
	createAccountMirrorMetadataTrafficPlanController,
	createAccountMirrorProviderTrafficObservation,
	createAccountMirrorProviderTrafficPlanController,
	createAccountMirrorProviderTrafficWorkKey,
	freezeAccountMirrorDetailTrafficPlan,
	ProviderTrafficBudgetExceededError,
	reconcileAccountMirrorProviderTraffic,
	withAccountMirrorProviderTrafficPlan,
} from "../../src/accountMirror/providerTrafficPlan.js";

const baseline = JSON.parse(
	readFileSync(
		new URL("../fixtures/accountMirror/issue151-provider-traffic-baseline.json", import.meta.url),
		"utf8",
	),
) as AccountMirrorProviderTrafficObservation;

describe("account-mirror provider traffic plan", () => {
	it("preserves backend request admission independently of browser phase budgets", async () => {
		const effect = vi.fn(async () => undefined);
		const admitBackendRequest = vi.fn(async (_key: string, send: () => Promise<void>) => send());
		const governor = withAccountMirrorProviderTrafficPlan(
			{
				attribution: {} as never,
				begin: vi.fn(async () => ({ id: "action", settle: vi.fn() })),
				admitBackendRequest,
			},
			{ object: "account_mirror_provider_traffic_plan", version: 1, budgets: [] },
		);
		expect(governor.admitBackendRequest).toBeTypeOf("function");
		if (!governor.admitBackendRequest) throw new Error("Missing backend admission");
		await governor.admitBackendRequest("sha256:fixture", effect);
		expect(admitBackendRequest).toHaveBeenCalledTimes(1);
		expect(effect).toHaveBeenCalledTimes(1);
		expect(governor.snapshotAdmissionState?.().budgets).toEqual([]);
	});
	it("preserves the Issue 151 baseline while failing unexplained controllable effects", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [],
			},
			observation: baseline,
		});

		expect(report.totals).toEqual({
			pageNavigations: 4,
			topLevelDocuments: 11,
			frameNavigations: 56,
			networkRequests: 2146,
		});
		expect(report.unattributedControllableEffects).toEqual([
			{ kind: "page_navigate", count: 4 },
			{ kind: "top_level_document", count: 11 },
		]);
		expect(() => assertAccountMirrorProviderTrafficReconciled(report)).toThrow(
			"15 unattributed controllable provider effects",
		);
	});

	it("keeps subframe navigation and network hydration observable but non-controlling", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [],
			},
			observation: baseline,
		});

		expect(report.observedEffects).toContainEqual({
			phase: "unattributed",
			kind: "frame_navigation",
			count: 56,
		});
		expect(report.observedEffects).toContainEqual({
			phase: "unattributed",
			kind: "network_request",
			count: 2146,
		});
	});

	it("rejects attributed controllable effects that exceed their phase budget", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [
					{ phase: "detail", kind: "page_navigate", limit: 1 },
					{ phase: "detail", kind: "top_level_document", limit: 1 },
				],
			},
			observation: {
				object: "account_mirror_provider_traffic_observation",
				version: 1,
				scope: "bounded_steady_follow_pass",
				observedAt: "2026-09-30T00:00:00.000Z",
				logicalInteractions: 1,
				effects: [
					{ phase: "detail", kind: "page_navigate", count: 2 },
					{ phase: "detail", kind: "top_level_document", count: 1 },
					{ phase: "detail", kind: "network_request", count: 400 },
				],
				warningObserved: false,
			},
		});

		expect(report.budgetViolations).toEqual([
			{ phase: "detail", kind: "page_navigate", observed: 2, limit: 1 },
		]);
		expect(() => assertAccountMirrorProviderTrafficReconciled(report)).toThrow(
			"1 provider traffic budget violation",
		);
	});

	it("reconciles completed governor actions with phase-attributed CDP effects", () => {
		const mutations: BrowserMutationRecord[] = [
			{
				id: "action-1",
				phase: "start",
				kind: "navigate",
				source: "fixture",
				trafficPhase: "detail",
				workKey: "sha256:redacted",
				at: "2026-09-30T00:00:00.000Z",
			},
			{
				id: "action-1",
				phase: "complete",
				kind: "navigate",
				source: "fixture",
				trafficPhase: "detail",
				workKey: "sha256:redacted",
				at: "2026-09-30T00:00:01.000Z",
				outcome: "succeeded",
			},
		];

		const observation = createAccountMirrorProviderTrafficObservation({
			observedAt: "2026-09-30T00:00:02.000Z",
			logicalInteractions: 1,
			mutations,
			cdpEffects: [
				{ phase: "detail", kind: "top_level_document", count: 1 },
				{ phase: "detail", kind: "frame_navigation", count: 3 },
				{ phase: "detail", kind: "network_request", count: 410 },
			],
			warningObserved: false,
		});

		expect(observation.effects).toEqual([
			{ phase: "detail", kind: "page_navigate", count: 1 },
			{ phase: "detail", kind: "top_level_document", count: 1 },
			{ phase: "detail", kind: "frame_navigation", count: 3 },
			{ phase: "detail", kind: "network_request", count: 410 },
		]);
		expect(JSON.stringify(observation)).not.toContain("action-1");
		expect(JSON.stringify(observation)).not.toContain("fixture");
	});

	it("rejects excess controllable actions before the underlying governor admits them", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const governor = withAccountMirrorProviderTrafficPlan(
			{ attribution: {} as never, begin },
			{
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [{ phase: "detail", kind: "page_navigate", limit: 1 }],
			},
		);

		await governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture:first",
			trafficPhase: "detail",
			workKey: "scope:conversation-detail",
		});
		await expect(
			governor.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "fixture:second",
				trafficPhase: "detail",
				workKey: "scope:conversation-detail",
			}),
		).rejects.toBeInstanceOf(ProviderTrafficBudgetExceededError);
		expect(begin).toHaveBeenCalledTimes(1);
	});

	it("rolls back reserved capacity when delegate admission is cancelled", async () => {
		const cancelled = new DOMException("cancelled", "AbortError");
		const begin = vi
			.fn()
			.mockRejectedValueOnce(cancelled)
			.mockResolvedValueOnce({ id: "action", settle: vi.fn() });
		const governor = withAccountMirrorProviderTrafficPlan(
			{ attribution: {} as never, begin },
			{
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [{ phase: "detail", kind: "page_navigate", limit: 1 }],
			},
		);
		const action = {
			kind: "navigate" as const,
			interactionClass: "conversation-read" as const,
			source: "fixture:cancelled-admission",
			trafficPhase: "detail" as const,
			workKey: "scope:conversation-detail",
		};

		await expect(governor.begin(action)).rejects.toBe(cancelled);
		await expect(governor.begin(action)).resolves.toMatchObject({ id: "action" });
		expect(begin).toHaveBeenCalledTimes(2);
	});

	it("exposes privacy-safe phase admission state for warning receipts", async () => {
		const rawWorkKey = createAccountMirrorProviderTrafficWorkKey("conversation", "secret-id");
		const governor = withAccountMirrorProviderTrafficPlan(
			{ attribution: {} as never, begin: vi.fn(async () => ({ id: "action", settle: vi.fn() })) },
			{
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [{ phase: "detail", kind: "page_navigate", workKey: rawWorkKey, limit: 2 }],
			},
		);
		await governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture",
			trafficPhase: "detail",
			workKey: rawWorkKey,
		});

		expect(governor.snapshotAdmissionState?.()).toEqual({
			version: 1,
			phases: [{ phase: "detail", admitted: 1, limit: 2, remaining: 1 }],
			budgets: [{ phase: "detail", kind: "page_navigate", admitted: 1, limit: 2, remaining: 1 }],
		});
		expect(JSON.stringify(governor.snapshotAdmissionState?.())).not.toContain("secret-id");
		expect(JSON.stringify(governor.snapshotAdmissionState?.())).not.toContain(rawWorkKey);
	});

	it("freezes staged phase authority before delegating exact planned work", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const controller = createAccountMirrorProviderTrafficPlanController({
			attribution: {} as never,
			begin,
		});

		controller.freezePhase("bootstrap", [
			{
				phase: "bootstrap",
				kind: "page_navigate",
				workKey: "scope:identity",
				limit: 1,
			},
		]);

		await controller.governor.begin({
			kind: "navigate",
			interactionClass: "page-refresh",
			source: "fixture:identity",
			trafficPhase: "bootstrap",
			workKey: "scope:identity",
		});
		await expect(
			controller.governor.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "fixture:unplanned-index",
				trafficPhase: "index",
				workKey: "scope:provider-index",
			}),
		).rejects.toMatchObject({
			name: "ProviderTrafficBudgetExceededError",
			trafficPhase: "index",
			kind: "page_navigate",
			limit: 0,
		});
		expect(() => controller.freezePhase("bootstrap", [])).toThrow(
			"Provider traffic phase bootstrap is already frozen",
		);
		expect(begin).toHaveBeenCalledTimes(1);
		expect(controller.snapshotPlan()).toEqual({
			object: "account_mirror_provider_traffic_plan",
			version: 1,
			budgets: [
				{
					phase: "bootstrap",
					kind: "page_navigate",
					workKey: "scope:identity",
					limit: 1,
				},
			],
		});
	});

	it("freezes the detail frontier to one ordinary navigation while retaining exact local work", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const controller = createAccountMirrorMetadataTrafficPlanController(
			{ attribution: {} as never, begin },
			{ maxPageReadsPerCycle: 4 },
		);
		const workKey = createAccountMirrorProviderTrafficWorkKey("conversation", "conversation-1");
		freezeAccountMirrorDetailTrafficPlan(controller, { workKeys: [workKey] });

		await controller.governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture:detail:first",
			trafficPhase: "detail",
			workKey,
		});
		await expect(
			controller.governor.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "fixture:detail:second",
				trafficPhase: "detail",
				workKey,
			}),
		).rejects.toBeInstanceOf(ProviderTrafficBudgetExceededError);
		expect(controller.snapshotPlan().budgets).toContainEqual({
			phase: "detail",
			kind: "page_navigate",
			workKey,
			limit: 1,
		});
		expect(begin).toHaveBeenCalledTimes(1);
	});

	it("does not admit a different row under another selected row's detail authority", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const controller = createAccountMirrorMetadataTrafficPlanController(
			{ attribution: {} as never, begin },
			{ maxPageReadsPerCycle: 4 },
		);
		const selected = createAccountMirrorProviderTrafficWorkKey("conversation", "selected-id");
		const unselected = createAccountMirrorProviderTrafficWorkKey("conversation", "other-id");
		freezeAccountMirrorDetailTrafficPlan(controller, { workKeys: [selected] });

		await expect(
			controller.governor.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "fixture:detail:unselected",
				trafficPhase: "detail",
				workKey: unselected,
			}),
		).rejects.toMatchObject({ limit: 0 });
		expect(begin).not.toHaveBeenCalled();
		expect(selected).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(selected).not.toContain("selected-id");
	});

	it("requires a separately causal admission for one recovery visit", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const controller = createAccountMirrorProviderTrafficPlanController({
			attribution: {} as never,
			begin,
		});
		const ordinaryKey = createAccountMirrorProviderTrafficWorkKey("conversation", "row-1");
		const recoveryKey = createAccountMirrorProviderTrafficWorkKey("recovery", "row-1:route-stall");
		controller.freezePhase("detail", [
			{ phase: "detail", kind: "page_navigate", workKey: ordinaryKey, limit: 1 },
		]);

		await controller.governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture:ordinary",
			trafficPhase: "detail",
			workKey: ordinaryKey,
		});
		await expect(
			controller.governor.begin({
				kind: "navigate",
				interactionClass: "provider-recovery",
				source: "fixture:implicit-recovery",
				trafficPhase: "detail",
				workKey: ordinaryKey,
				reason: "route-stall",
			}),
		).rejects.toBeInstanceOf(ProviderTrafficBudgetExceededError);

		controller.admitRecovery({
			phase: "detail",
			kind: "page_navigate",
			workKey: recoveryKey,
			reason: "route-stall",
		});
		await expect(
			controller.governor.begin({
				kind: "navigate",
				interactionClass: "provider-recovery",
				source: "fixture:recovery",
				trafficPhase: "detail",
				workKey: recoveryKey,
				reason: "route-stall",
			}),
		).resolves.toMatchObject({ id: "action" });
		expect(begin).toHaveBeenCalledTimes(2);
		expect(controller.snapshotPlan().budgets).toContainEqual({
			phase: "detail",
			kind: "page_navigate",
			workKey: recoveryKey,
			reason: "route-stall",
			limit: 1,
		});
	});

	it("keeps in-page actions distinct from route visits", () => {
		const observation = createAccountMirrorProviderTrafficObservation({
			observedAt: "2026-09-30T00:00:00.000Z",
			logicalInteractions: 1,
			mutations: [
				{
					id: "action",
					phase: "complete",
					kind: "in-page-click",
					source: "fixture",
					trafficPhase: "index",
					workKey: "scope:provider-index",
					at: "2026-09-30T00:00:00.000Z",
					outcome: "succeeded",
				},
			],
			warningObserved: false,
		});

		expect(observation.effects).toEqual([{ phase: "index", kind: "in_page_action", count: 1 }]);
	});
});
