import { describe, expect, test, vi } from "vitest";
import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	createProviderTrafficGovernor,
	ProviderBackendRequestBudgetExceededError,
	ProviderTrafficAttributionError,
	type ProviderTrafficWarning,
	ProviderTrafficWarningError,
	withProviderTrafficContext,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { navigateAndSettle } from "../../packages/browser-service/src/service/ui.js";

const attribution = {
	provider: "chatgpt",
	runtimeProfileId: "wsl-chrome-3",
	managedBrowserProfile: "/managed/chatgpt",
	workloadId: "live-follow:completion-1",
	operationId: "completion-1",
	tabLeaseId: "lease-1",
};

describe("provider traffic governor", () => {
	test("backend budget exhaustion stops the next browser action while warning detection remains active", async () => {
		const beforeInteraction = vi.fn(async () => undefined);
		const audit = vi.fn(async () => undefined);
		const exhausted = new ProviderBackendRequestBudgetExceededError();
		let warning: ProviderTrafficWarning | null = null;
		const persistWarning = vi.fn(async () => undefined);
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction },
			mutationAudit: audit,
			admitBackendRequest: async () => {
				throw exhausted;
			},
			probeWarning: async () => warning,
			persistWarning,
		});
		if (!governor.admitBackendRequest) throw new Error("Expected backend admission");
		await expect(
			governor.admitBackendRequest("sha256:fixture", async () => undefined),
		).rejects.toBe(exhausted);
		await expect(
			governor.begin({ kind: "navigate", interactionClass: "renavigation", source: "fixture" }),
		).rejects.toBe(exhausted);
		expect(beforeInteraction).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
		expect(governor.snapshotAdmissionState?.()).toMatchObject({
			backendRequestOutcome: "budget-exhausted",
		});
		warning = { classification: "rate-limit", reason: "fixture429" };
		await expect(governor.checkWarning?.({})).rejects.toBeInstanceOf(ProviderTrafficWarningError);
		expect(persistWarning).toHaveBeenCalledTimes(1);
		expect(governor.snapshotAdmissionState?.()).toMatchObject({ backendRequestOutcome: "guarded" });
		await expect(
			governor.begin({ kind: "navigate", interactionClass: "renavigation", source: "fixture" }),
		).rejects.toBeInstanceOf(ProviderTrafficWarningError);
	});

	test("an uncertain in-flight request takes precedence over concurrent budget exhaustion", async () => {
		const uncertain = new Error("fixture-uncertain-dispatch");
		const exhausted = new ProviderBackendRequestBudgetExceededError();
		let rejectDispatch!: (error: Error) => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const dispatch = new Promise<void>((_resolve, reject) => {
			rejectDispatch = reject;
		});
		const hook = vi.fn(async (key: string) => {
			if (key === "first") {
				entered();
				await dispatch;
			} else throw exhausted;
		});
		const beforeInteraction = vi.fn(async () => undefined);
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction },
			mutationAudit: vi.fn(),
			admitBackendRequest: hook,
		});
		if (!governor.admitBackendRequest) throw new Error("Expected backend admission");
		const first = governor
			.admitBackendRequest("first", async () => undefined)
			.catch((error) => error);
		await started;
		await expect(governor.admitBackendRequest("second", async () => undefined)).rejects.toBe(
			exhausted,
		);
		rejectDispatch(uncertain);
		expect(await first).toBe(uncertain);
		expect(governor.snapshotAdmissionState?.()).toMatchObject({
			backendRequestOutcome: "uncertain",
		});
		await expect(
			governor.begin({ kind: "navigate", interactionClass: "renavigation", source: "fixture" }),
		).rejects.toBe(uncertain);
		await expect(governor.admitBackendRequest("third", async () => undefined)).rejects.toBe(
			uncertain,
		);
		expect(hook).toHaveBeenCalledTimes(2);
		expect(beforeInteraction).not.toHaveBeenCalled();
	});
	test("rejects missing exact provider-work attribution during construction", () => {
		expect(() =>
			createProviderTrafficGovernor({
				attribution: { ...attribution, tabLeaseId: "" },
				interactionGovernor: { beforeInteraction: vi.fn() },
				mutationAudit: vi.fn(),
			}),
		).toThrowError(ProviderTrafficAttributionError);
	});

	test("fails before effect when lease validation, admission, or start persistence fails", async () => {
		const physicalEffect = vi.fn();
		const rejectedLease = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn() },
			mutationAudit: vi.fn(),
			assertLease: vi.fn(async () => {
				throw new Error("lease-lost");
			}),
		});
		await expect(
			rejectedLease.begin({ kind: "reload", interactionClass: "page-refresh", source: "test" }),
		).rejects.toThrow("lease-lost");

		const rejectedAdmission = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: {
				beforeInteraction: vi.fn(async () => {
					throw new Error("cooldown-active");
				}),
			},
			mutationAudit: vi.fn(),
		});
		await expect(
			rejectedAdmission.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "test",
			}),
		).rejects.toThrow("cooldown-active");

		const rejectedStart = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn() },
			mutationAudit: vi.fn(async () => {
				throw new Error("ledger-unwritable");
			}),
		});
		await expect(
			rejectedStart.begin({ kind: "reload", interactionClass: "page-refresh", source: "test" }),
		).rejects.toThrow("ledger-unwritable");
		expect(physicalEffect).not.toHaveBeenCalled();
	});

	test("fails before effect when a provider-marked client loses its governor", async () => {
		const navigate = vi.fn(async () => undefined);
		await expect(
			navigateAndSettle(
				{
					Page: { navigate } as never,
					Runtime: { evaluate: vi.fn(async () => ({ result: { value: null } })) } as never,
					__auracallProviderTrafficRequired: true,
				} as never,
				{ url: "https://chatgpt.com/c/1" },
			),
		).rejects.toThrow("Provider traffic governor is required");
		expect(navigate).not.toHaveBeenCalled();
	});

	test("records settlement and persists a warning before rejecting later traffic", async () => {
		const observedRecords: BrowserMutationRecord[] = [];
		const audit = vi.fn(async (record: BrowserMutationRecord) => {
			observedRecords.push(record);
		});
		const persistWarning = vi.fn(async () => undefined);
		const settleInteraction = vi.fn(async () => undefined);
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			mutationAudit: audit,
			settleInteraction,
			probeWarning: vi.fn(
				async (): Promise<ProviderTrafficWarning> => ({
					classification: "rate-limit",
					reason: "Too many requests",
					cooldownUntil: "2026-09-30T02:00:00.000Z",
				}),
			),
			persistWarning,
			createActionId: () => "action-1",
		});

		const action = await governor.begin({
			kind: "reload",
			interactionClass: "page-refresh",
			source: "live-follow:reload",
		});
		await expect(
			action.settle({ outcome: "succeeded", probeContext: { visible: true } }),
		).rejects.toBeInstanceOf(ProviderTrafficWarningError);

		expect(audit).toHaveBeenCalledTimes(2);
		expect(settleInteraction).toHaveBeenCalledWith({
			outcome: "succeeded",
			effectState: "settled",
			reason: null,
		});
		expect(observedRecords.map((record) => record.phase)).toEqual(["start", "complete"]);
		expect(persistWarning).toHaveBeenCalledWith(
			expect.objectContaining({ classification: "rate-limit", reason: "Too many requests" }),
			expect.objectContaining({ operationId: "completion-1", tabLeaseId: "lease-1" }),
		);
		await expect(
			governor.begin({ kind: "reload", interactionClass: "page-refresh", source: "late" }),
		).rejects.toBeInstanceOf(ProviderTrafficWarningError);
	});

	test("freezes admissions before warning persistence completes", async () => {
		let releasePersistence: (() => void) | undefined;
		const persistenceBlocked = new Promise<void>((resolve) => {
			releasePersistence = resolve;
		});
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			mutationAudit: vi.fn(async () => undefined),
			probeWarning: vi.fn(async () => ({
				classification: "rate-limit" as const,
				reason: "Too many requests",
			})),
			persistWarning: vi.fn(async () => persistenceBlocked),
		});
		const action = await governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture",
		});
		const settling = action.settle({ outcome: "succeeded", probeContext: { visible: true } });
		await vi.waitFor(async () => {
			await expect(
				governor.begin({ kind: "reload", interactionClass: "page-refresh", source: "late" }),
			).rejects.toBeInstanceOf(ProviderTrafficWarningError);
		});
		releasePersistence?.();
		await expect(settling).rejects.toBeInstanceOf(ProviderTrafficWarningError);
	});

	test("detects a delayed warning with a final passive probe", async () => {
		let visible = false;
		const probeWarning = vi.fn(async (context: unknown) =>
			visible && context
				? { classification: "rate-limit" as const, reason: "temporarily limited" }
				: null,
		);
		const persistWarning = vi.fn(async () => undefined);
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			mutationAudit: vi.fn(async () => undefined),
			probeWarning,
			persistWarning,
		});
		const runtime = { evaluate: vi.fn() };
		const action = await governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "fixture",
		});
		await action.settle({ outcome: "succeeded", probeContext: runtime });
		visible = true;
		await expect(governor.checkWarning?.()).rejects.toBeInstanceOf(ProviderTrafficWarningError);
		expect(probeWarning).toHaveBeenLastCalledWith(runtime, attribution);
		expect(persistWarning).toHaveBeenCalledOnce();
	});

	test("persists phase and privacy-bounded work attribution before physical traffic", async () => {
		const observedRecords: BrowserMutationRecord[] = [];
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			mutationAudit: async (record) => {
				observedRecords.push(record);
			},
			createActionId: () => "action-phase-1",
		});

		const action = await governor.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "live-follow:detail",
			trafficPhase: "detail",
			workKey: "sha256:fixture-work-key",
		});
		await action.settle({ outcome: "succeeded" });

		expect(observedRecords).toHaveLength(2);
		expect(observedRecords[0]).toMatchObject({
			phase: "start",
			trafficPhase: "detail",
			workKey: "sha256:fixture-work-key",
		});
		expect(observedRecords[1]).toMatchObject({
			phase: "complete",
			trafficPhase: "detail",
			workKey: "sha256:fixture-work-key",
		});
		expect(governor.snapshotAdmissionState?.().recentEffects).toEqual([
			expect.objectContaining({
				phase: "detail",
				kind: "navigate",
				outcome: "succeeded",
			}),
		]);
		expect(JSON.stringify(governor.snapshotAdmissionState?.())).not.toContain("fixture-work-key");
	});

	test("binds a phase context without allowing a nested caller to replace it", async () => {
		const begin = vi.fn(async () => ({ id: "action", settle: vi.fn() }));
		const scoped = withProviderTrafficContext(
			{ attribution, begin },
			{ trafficPhase: "index", workKey: "scope:provider-index" },
		);

		await scoped.begin({
			kind: "navigate",
			interactionClass: "conversation-read",
			source: "nested-provider-call",
			trafficPhase: "detail",
			workKey: "raw-conversation-id",
		});

		expect(begin).toHaveBeenCalledWith(
			expect.objectContaining({
				trafficPhase: "index",
				workKey: "scope:provider-index",
			}),
		);
	});
});
