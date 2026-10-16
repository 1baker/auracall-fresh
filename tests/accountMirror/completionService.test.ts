import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AccountMirrorBackfillLedger } from "../../src/accountMirror/backfillLedger.js";
import {
	type AccountMirrorCompletionOperation,
	createAccountMirrorCompletionService,
	hasLocallyActionableMaterializationBacklog,
} from "../../src/accountMirror/completionService.js";
import { createAccountMirrorCompletionStore } from "../../src/accountMirror/completionStore.js";
import { chooseLiveFollowCyclePhase } from "../../src/accountMirror/liveFollowCycleDecision.js";
import {
	AccountMirrorRefreshError,
	type AccountMirrorRefreshRequest,
	type AccountMirrorRefreshResult,
} from "../../src/accountMirror/refreshService.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";

const config = {
	runtimeProfiles: {
		default: {
			browserProfile: "default",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: {
						email: "ecochran76@gmail.com",
					},
				},
			},
		},
	},
};

const completeMirror = {
	state: "complete" as const,
	summary: "Mirrored metadata indexes are complete within current provider surfaces.",
	remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
	signals: {
		projectsTruncated: false,
		conversationsTruncated: false,
		attachmentInventoryTruncated: false,
		attachmentCursorPresent: false,
	},
};

const completeBackfillLedger: AccountMirrorBackfillLedger = {
	object: "account_mirror_backfill_ledger",
	version: 1,
	provider: "chatgpt",
	runtimeProfileId: "default",
	browserProfileId: "default",
	boundIdentityKey: "ecochran76@gmail.com",
	updatedAt: "2026-04-30T12:00:01.000Z",
	state: "complete",
	lastCompletedPhase: "detail-inventory",
	nextEligiblePhase: "complete",
	cursors: {
		projects: {
			status: "complete",
			reason: "project cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: 1,
			yielded: false,
		},
		rootRail: {
			status: "complete",
			reason: "root rail cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: 2,
			yielded: false,
		},
		projectConversations: {
			status: "skipped",
			reason: "No project conversation cursor was emitted.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
		newestFirstDetail: {
			status: "complete",
			reason: "detail cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
			conversationDetail: null,
		},
		accountLibrary: {
			status: "skipped",
			reason: "No account-library cursor recorded yet.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
		materialization: {
			status: "skipped",
			reason: "No materialization cursor recorded yet.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
	},
};

function createRefreshResult(): AccountMirrorRefreshResult {
	return {
		object: "account_mirror_refresh",
		requestId: "acctmirror_refresh_1",
		status: "completed",
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		requestedPhase: null,
		startedAt: "2026-04-30T12:00:00.000Z",
		completedAt: "2026-04-30T12:00:01.000Z",
		dispatcher: {
			key: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
			operationId: "op_1",
			blockedBy: null,
		},
		metadataCounts: {
			projects: 1,
			conversations: 2,
			artifacts: 0,
			files: 0,
			media: 0,
		},
		metadataEvidence: null,
		mirrorCompleteness: completeMirror,
		detectedIdentityKey: "ecochran76@gmail.com",
		detectedAccountLevel: "Business",
		mirrorStatus: {
			object: "account_mirror_status",
			generatedAt: "2026-04-30T12:00:01.000Z",
			entries: [],
			metrics: {
				total: 1,
				eligible: 0,
				delayed: 1,
				blocked: 0,
			},
		},
	};
}

describe("live-follow cycle decision", () => {
	test("requires positive local backlog evidence before provider materialization", () => {
		expect(hasLocallyActionableMaterializationBacklog(undefined)).toBe(false);
		expect(
			hasLocallyActionableMaterializationBacklog({
				retrievableMissing: 0,
				unknownOrDeferred: 4,
			}),
		).toBe(false);
		expect(
			hasLocallyActionableMaterializationBacklog({
				retrievableMissing: 1,
				unknownOrDeferred: 0,
			}),
		).toBe(true);
	});

	test("continues conversation detail when a detail cursor is pending", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 4,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
				attachmentInventory: {
					nextProjectIndex: 5,
					nextConversationIndex: 2,
					detailReadLimit: 4,
					scannedProjects: 5,
					scannedConversations: 2,
					conversationDetail: {
						conversationId: "conv_pending",
						nextMessageIndex: 24,
						messageLimit: 24,
						totalMessages: 90,
					},
				},
			},
			remainingDetailSurfaces: 3,
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "pending",
		});
		expect(decision.reason).toContain("conv_pending");
	});

	test("chooses detail before project conversations when freshness selected rows", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 2,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				conversationFreshnessFrontier: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 4,
					rowsSelectedForDetail: 1,
					frontierReached: true,
					selectedConversationIds: ["conv_recent"],
					firstStoppedRow: {
						conversationId: "conv_old",
						index: 3,
						remoteMtime: "2026-06-27T18:00:00.000Z",
					},
					fallbackReason: null,
					rowEvidence: [],
				},
				projectConversations: {
					nextProjectIndex: 1,
					readLimit: 2,
					scannedProjects: 1,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "pending",
		});
	});

	test("does not repeat detail inventory after selected frontier rows completed", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 7,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				collectorProgress: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					sweepMode: "steady_follow",
					phase: "complete",
					event: "completed",
					observedAt: "2026-04-30T12:00:01.000Z",
				},
				conversationFreshnessFrontier: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 7,
					rowsSelectedForDetail: 4,
					frontierReached: true,
					selectedConversationIds: ["conv_1", "conv_2", "conv_3", "conv_4"],
					firstStoppedRow: {
						conversationId: "conv_old",
						index: 6,
						remoteMtime: "2026-06-25T01:19:57.866Z",
					},
					fallbackReason: "missing_cached_summary",
					rowEvidence: [],
				},
				attachmentInventory: {
					nextProjectIndex: 0,
					nextConversationIndex: 0,
					detailReadLimit: 4,
					scannedProjects: 0,
					scannedConversations: 4,
					conversationDetail: null,
					yielded: false,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "complete",
			status: "complete",
		});
	});

	test("resumes project conversation cursor when no detail work is pending", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 3,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: true,
					artifacts: false,
				},
				projectConversations: {
					nextProjectIndex: 8,
					readLimit: 2,
					scannedProjects: 8,
					yielded: true,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "project-conversations",
			status: "yielded",
		});
	});

	test("does not resume completed project conversation cursor after keep-current pass", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 4,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				collectorProgress: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					sweepMode: "steady_follow",
					phase: "complete",
					event: "completed",
					observedAt: "2026-04-30T12:00:01.000Z",
				},
				conversationFreshnessFrontier: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 3,
					rowsSelectedForDetail: 0,
					frontierReached: true,
					selectedConversationIds: [],
					firstStoppedRow: {
						conversationId: "conv_fresh",
						index: 2,
						remoteMtime: "2026-06-27T18:00:00.000Z",
					},
					fallbackReason: null,
					rowEvidence: [],
				},
				projectConversations: {
					nextProjectIndex: 0,
					readLimit: 0,
					scannedProjects: 0,
					yielded: false,
				},
				attachmentInventory: {
					nextProjectIndex: 0,
					nextConversationIndex: 0,
					detailReadLimit: 4,
					scannedProjects: 0,
					scannedConversations: 0,
					conversationDetail: null,
					yielded: false,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "complete",
			status: "complete",
		});
	});

	test("uses persisted backfill ledger phase before stale completion evidence", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 8,
				lastRefresh: createRefreshResult(),
			},
			evidence: null,
			remainingDetailSurfaces: 0,
			backfillLedger: {
				...completeBackfillLedger,
				state: "in_progress",
				lastCompletedPhase: "detail-inventory",
				nextEligiblePhase: "account-library",
				cursors: {
					...completeBackfillLedger.cursors,
					accountLibrary: {
						...completeBackfillLedger.cursors.accountLibrary,
						status: "pending",
						reason: "queued account-library materialization job hmj_account_library_1",
						updatedAt: "2026-04-30T12:00:05.000Z",
						readLimit: 3,
					},
				},
			},
		});

		expect(decision).toMatchObject({
			phase: "account-library",
			status: "pending",
			reason: "queued account-library materialization job hmj_account_library_1",
		});
	});

	test("treats a completed durable backfill ledger as authoritative over stale detail evidence", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 80,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
				collectorProgress: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					sweepMode: "steady_follow",
					phase: "detail-inventory",
					event: "failed",
					observedAt: "2026-04-30T12:00:01.000Z",
				},
				attachmentInventory: {
					nextProjectIndex: 0,
					nextConversationIndex: 5,
					detailReadLimit: 6,
					scannedProjects: 0,
					scannedConversations: 5,
					conversationDetail: null,
					yielded: true,
				},
			},
			remainingDetailSurfaces: 0,
			backfillLedger: completeBackfillLedger,
		});

		expect(decision).toMatchObject({
			phase: "complete",
			status: "complete",
		});
		expect(decision.reason).toContain("durable backfill ledger");
	});

	test("projects a collector failure that is newer than the completed backfill ledger", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 80,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				collectorProgress: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					sweepMode: "full_sweep",
					phase: "detail-inventory",
					event: "failed",
					observedAt: "2026-04-30T12:00:02.000Z",
				},
			},
			remainingDetailSurfaces: 0,
			backfillLedger: completeBackfillLedger,
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "blocked",
		});
		expect(decision.reason).toContain("collector failed during detail-inventory");
	});

	test("projects a collector failure newer than the last successful refresh even when the ledger was persisted later", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 80,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: { projects: false, conversations: false, artifacts: false },
				collectorProgress: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					sweepMode: "full_sweep",
					phase: "detail-inventory",
					event: "failed",
					observedAt: "2026-04-30T12:05:00.000Z",
				},
			},
			remainingDetailSurfaces: 0,
			backfillLedger: {
				...completeBackfillLedger,
				updatedAt: "2026-04-30T12:06:00.000Z",
			},
			latestSuccessfulRefreshAt: "2026-04-30T12:00:00.000Z",
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "blocked",
		});
	});
});

describe("account mirror completion service", () => {
	test("serializes same-provider completion refreshes in FIFO order", async () => {
		let releaseFirstRefresh: () => void = () => undefined;
		const firstRefreshGate = new Promise<void>((resolve) => {
			releaseFirstRefresh = resolve;
		});
		const refreshOrder: string[] = [];
		const requestRefresh = vi.fn(async (request?: { runtimeProfileId?: string | null }) => {
			const runtimeProfileId = request?.runtimeProfileId ?? "default";
			refreshOrder.push(runtimeProfileId);
			if (runtimeProfileId === "default") {
				await firstRefreshGate;
			}
			return {
				...createRefreshResult(),
				requestId: `acctmirror_refresh_${runtimeProfileId}`,
			};
		});
		const ids = ["acctmirror_fifo_default", "acctmirror_fifo_wsl_2"];
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: {
					runtimeProfiles: {
						default: config.runtimeProfiles.default,
						"wsl-chrome-2": {
							browserProfile: "wsl-chrome-2",
							defaultService: "chatgpt",
							services: {
								chatgpt: {
									identity: {
										email: "consulting@example.com",
									},
								},
							},
						},
					},
				},
				now: () => new Date("2026-07-23T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			now: () => new Date("2026-07-23T12:00:00.000Z"),
			generateId: () => ids.shift() ?? "unexpected_completion_id",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await waitFor(() => requestRefresh.mock.calls.length === 1);

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await new Promise((resolve) => setTimeout(resolve, 25));

		expect(refreshOrder).toEqual(["default"]);

		releaseFirstRefresh();
		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(refreshOrder).toEqual(["default", "wsl-chrome-2"]);
	});

	test("allows different providers to refresh independently", async () => {
		let releaseChatgptRefresh: () => void = () => undefined;
		const chatgptRefreshGate = new Promise<void>((resolve) => {
			releaseChatgptRefresh = resolve;
		});
		const refreshOrder: string[] = [];
		const requestRefresh = vi.fn(
			async (request?: { provider?: string | null; runtimeProfileId?: string | null }) => {
				const provider = request?.provider ?? "chatgpt";
				refreshOrder.push(provider);
				if (provider === "chatgpt") {
					await chatgptRefreshGate;
				}
				return {
					...createRefreshResult(),
					requestId: `acctmirror_refresh_${provider}`,
					provider: provider as AccountMirrorRefreshResult["provider"],
				};
			},
		);
		const ids = ["acctmirror_provider_chatgpt", "acctmirror_provider_gemini"];
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-23T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			now: () => new Date("2026-07-23T12:00:00.000Z"),
			generateId: () => ids.shift() ?? "unexpected_completion_id",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await waitFor(() => requestRefresh.mock.calls.length === 1);
		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(refreshOrder).toEqual(["chatgpt", "gemini"]);
		releaseChatgptRefresh();
	});

	test("retains provider ownership until completion-owned materialization settles", async () => {
		let materializationSettled = false;
		let currentTimeMs = Date.parse("2026-07-23T12:00:00.000Z");
		const refreshOrder: string[] = [];
		const requestRefresh = vi.fn(async (request?: { runtimeProfileId?: string | null }) => {
			const runtimeProfileId = request?.runtimeProfileId ?? "default";
			refreshOrder.push(runtimeProfileId);
			return {
				...createRefreshResult(),
				requestId: `acctmirror_refresh_${runtimeProfileId}`,
			};
		});
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-07-23T12:00:01.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_provider_lease",
				status: "running",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_provider_lease",
			status: materializationSettled ? "succeeded" : "running",
			completedAt: materializationSettled ? "2026-07-23T12:00:02.000Z" : null,
		}));
		const ids = ["acctmirror_materializing", "acctmirror_waiting_after_materialization"];
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: {
					runtimeProfiles: {
						default: config.runtimeProfiles.default,
						"wsl-chrome-2": {
							browserProfile: "wsl-chrome-2",
							defaultService: "chatgpt",
							services: {
								chatgpt: {
									identity: {
										email: "consulting@example.com",
									},
								},
							},
						},
					},
				},
				now: () => new Date("2026-07-23T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob, readJob },
			now: () => new Date(currentTimeMs),
			generateId: () => ids.shift() ?? "unexpected_completion_id",
			sleep: async (ms) => {
				currentTimeMs += ms;
				await new Promise((resolve) => setTimeout(resolve, 1));
			},
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});
		await waitFor(() => createJob.mock.calls.length === 1);

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(refreshOrder).toEqual(["default"]);

		materializationSettled = true;
		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(refreshOrder).toEqual(["default", "wsl-chrome-2"]);
	});

	test("removes a paused completion from the provider FIFO", async () => {
		let releaseFirstRefresh: () => void = () => undefined;
		const firstRefreshGate = new Promise<void>((resolve) => {
			releaseFirstRefresh = resolve;
		});
		const refreshOrder: string[] = [];
		const requestRefresh = vi.fn(async (request?: { runtimeProfileId?: string | null }) => {
			const runtimeProfileId = request?.runtimeProfileId ?? "default";
			refreshOrder.push(runtimeProfileId);
			if (runtimeProfileId === "default") {
				await firstRefreshGate;
			}
			return createRefreshResult();
		});
		const ids = ["acctmirror_pause_owner", "acctmirror_pause_waiter"];
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-23T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			now: () => new Date("2026-07-23T12:00:00.000Z"),
			generateId: () => ids.shift() ?? "unexpected_completion_id",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await waitFor(() => requestRefresh.mock.calls.length === 1);
		service.start({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
		await waitFor(() =>
			Boolean(
				service
					.read("acctmirror_pause_waiter")
					?.lifecycleEvents?.some((event) => event.type === "provider_work_waiting"),
			),
		);

		service.control({ id: "acctmirror_pause_waiter", action: "pause" });
		releaseFirstRefresh();
		await waitFor(() => service.read("acctmirror_pause_owner")?.status === "completed");
		await new Promise((resolve) => setTimeout(resolve, 25));

		expect(refreshOrder).toEqual(["default"]);
		expect(service.read("acctmirror_pause_waiter")?.status).toBe("paused");
	});

	test("persists bounded operation state and preserves its live-follow affinity id", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-completion-store-"));
		try {
			const store = createAccountMirrorCompletionStore({
				config: {
					browser: {
						cache: {
							rootDir: tmp,
						},
					},
				},
			});
			const requestRefresh = vi.fn(async () => createRefreshResult());
			const service = createAccountMirrorCompletionService({
				registry: createAccountMirrorStatusRegistry({
					config,
					now: () => new Date("2026-04-30T12:00:00.000Z"),
				}),
				refreshService: {
					requestRefresh,
				},
				store,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
				generateId: () => "acctmirror_persisted",
			});

			service.start({ maxPasses: 3, conversationIds: ["conv_scoped_persisted"] });

			await waitFor(
				async () => (await store.readOperation("acctmirror_persisted"))?.status === "completed",
			);

			expect(await store.readOperation("acctmirror_persisted")).toMatchObject({
				id: "acctmirror_persisted",
				conversationIds: ["conv_scoped_persisted"],
				status: "completed",
				mode: "bounded",
				passCount: 1,
			});
			expect(requestRefresh).toHaveBeenCalledWith(
				expect.objectContaining({
					liveFollowOperationId: "acctmirror_persisted",
				}),
			);
			expect(await store.listOperations({ activeOnly: false, limit: null })).toHaveLength(1);
			expect(await store.listOperations({ activeOnly: true, limit: null })).toHaveLength(0);

			const completed = await store.readOperation("acctmirror_persisted");
			if (!completed) throw new Error("Expected persisted completion.");
			await store.writeOperation({
				...completed,
				id: "acctmirror_legacy_materialization_counts",
				materializationOutcome: {
					jobId: "hmj_legacy_counts",
					jobStatus: "skipped",
					completedAt: "2026-04-30T12:00:01.000Z",
					conversationsAttempted: 0,
					materialized: 0,
					skipped: 1,
					failed: 0,
					checksumCount: 0,
					manifestPaths: [],
					terminalRouteabilityCounts: {},
					message: "Legacy outcome without candidate counts.",
				} as unknown as AccountMirrorCompletionOperation["materializationOutcome"],
			});
			expect(
				(await store.readOperation("acctmirror_legacy_materialization_counts"))
					?.materializationOutcome,
			).toMatchObject({
				eligibleCandidates: 0,
				selectedCandidates: 0,
			});
		} finally {
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test("bounds concurrent reads when listing a large persisted completion history", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-completion-store-concurrency-"));
		const store = createAccountMirrorCompletionStore({
			config: {
				browser: {
					cache: {
						rootDir: tmp,
					},
				},
			},
		});
		const template: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_list_concurrency_0",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "bounded",
			sweepMode: "steady_follow",
			phase: "steady_follow",
			status: "completed",
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: "2026-04-30T12:00:01.000Z",
			nextAttemptAt: null,
			maxPasses: 1,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		let readFileSpy: ReturnType<typeof vi.spyOn> | null = null;
		try {
			for (let index = 0; index < 40; index += 1) {
				await store.writeOperation({
					...template,
					id: `acctmirror_list_concurrency_${index}`,
					startedAt: new Date(Date.parse(template.startedAt) + index * 1000).toISOString(),
				});
			}
			const originalReadFile = fs.readFile.bind(fs);
			let activeReads = 0;
			let maxActiveReads = 0;
			readFileSpy = vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
				activeReads += 1;
				maxActiveReads = Math.max(maxActiveReads, activeReads);
				try {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return await originalReadFile(...args);
				} finally {
					activeReads -= 1;
				}
			});

			const operations = await store.listOperations({ activeOnly: false, limit: 10 });

			expect(operations).toHaveLength(10);
			expect(operations[0]?.id).toBe("acctmirror_list_concurrency_39");
			expect(maxActiveReads).toBeLessThanOrEqual(16);
		} finally {
			readFileSpy?.mockRestore();
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test("reconciles stale loaded live-follow cycle from completed refresh evidence", () => {
		const refresh = createRefreshResult();
		refresh.metadataEvidence = {
			identitySource: null,
			projectSampleIds: [],
			conversationSampleIds: [],
			truncated: {
				projects: false,
				conversations: false,
				artifacts: false,
			},
			collectorProgress: {
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				phase: "complete",
				event: "completed",
				observedAt: "2026-04-30T12:00:01.000Z",
			},
			conversationFreshnessFrontier: {
				object: "account_mirror_conversation_freshness_frontier",
				provider: "chatgpt",
				sweepMode: "steady_follow",
				threshold: 3,
				rowsExamined: 7,
				rowsSelectedForDetail: 4,
				frontierReached: true,
				selectedConversationIds: ["conv_1", "conv_2", "conv_3", "conv_4"],
				firstStoppedRow: {
					conversationId: "conv_old",
					index: 6,
					remoteMtime: "2026-06-25T01:19:57.866Z",
				},
				fallbackReason: "missing_cached_summary",
				rowEvidence: [],
			},
		};
		const operation: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_loaded_stale_cycle",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "steady_follow",
			phase: "steady_follow",
			status: "paused",
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:20:00.000Z",
			maxPasses: null,
			passCount: 7,
			lastRefresh: refresh,
			materializationPolicy: "metadata_only",
			materializationAssetKinds: ["all"],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			materializationOutcome: null,
			accountLibraryCursor: null,
			liveFollowCycle: {
				cycleId: "lfc_stale",
				startedAt: "2026-04-30T12:00:00.000Z",
				updatedAt: "2026-04-30T12:00:01.000Z",
				currentPhase: "detail-inventory",
				nextPhase: "detail-inventory",
				decisionReason: "freshness frontier selected 4 conversation row(s) for detail",
				passCount: 7,
				phases: [
					{
						phase: "detail-inventory",
						status: "pending",
						reason: "freshness frontier selected 4 conversation row(s) for detail",
						updatedAt: "2026-04-30T12:00:01.000Z",
						passCount: 7,
					},
				],
			},
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [operation],
			now: () => new Date("2026-04-30T12:30:00.000Z"),
		});

		expect(service.read("acctmirror_loaded_stale_cycle")?.liveFollowCycle).toMatchObject({
			currentPhase: "complete",
			nextPhase: "complete",
			decisionReason:
				"all required live-follow phases are complete for the current evidence window",
			passCount: 7,
		});
	});

	test("hydrates completion status mirror completeness from current registry evidence", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});
		registry.mergeState(
			{
				provider: "chatgpt",
				runtimeProfileId: "default",
			},
			{
				lastRefreshRequestId: "acctmirror_frontier_registry",
				lastSuccessAtMs: Date.parse("2026-04-30T11:58:02.000Z"),
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 0,
					conversations: 416,
					artifacts: 109,
					files: 126,
					media: 0,
				},
				metadataEvidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: ["conv_1"],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: true,
					},
					conversationFreshnessFrontier: {
						object: "account_mirror_conversation_freshness_frontier",
						provider: "chatgpt",
						sweepMode: "steady_follow",
						threshold: 3,
						rowsExamined: 30,
						rowsSelectedForDetail: 30,
						frontierReached: false,
						firstStoppedRow: null,
						fallbackReason: "missing_cached_summary",
						selectedConversationIds: ["conv_1", "conv_2", "conv_3", "conv_4"],
						rowEvidence: [],
					},
					attachmentInventory: {
						nextProjectIndex: 0,
						nextConversationIndex: 4,
						detailReadLimit: 4,
						scannedProjects: 0,
						scannedConversations: 4,
						conversationDetail: null,
						yielded: false,
					},
				},
			},
		);
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [
				{
					object: "account_mirror_completion",
					id: "acctmirror_frontier_stale_completion",
					provider: "chatgpt",
					runtimeProfileId: "default",
					mode: "live_follow",
					sweepMode: "steady_follow",
					phase: "backfill_history",
					status: "idle_waiting",
					startedAt: "2026-04-30T11:00:00.000Z",
					completedAt: null,
					nextAttemptAt: "2026-04-30T12:30:00.000Z",
					maxPasses: null,
					passCount: 3,
					lastRefresh: createRefreshResult(),
					materializationPolicy: "metadata_only",
					materializationAssetKinds: ["all"],
					materializationMaxItems: null,
					materializationRefreshSnapshot: false,
					materializationForce: false,
					materializationCursor: null,
					materializationOutcome: null,
					accountLibraryCursor: null,
					liveFollowCycle: null,
					forceRunUntilPassCount: null,
					mirrorCompleteness: {
						...completeMirror,
						state: "in_progress",
						summary: "Attachment inventory has 412 detail surfaces remaining.",
						remainingDetailSurfaces: { projects: 0, conversations: 412, total: 412 },
						signals: {
							projectsTruncated: false,
							conversationsTruncated: false,
							attachmentInventoryTruncated: true,
							attachmentCursorPresent: true,
						},
					},
					error: null,
					lifecycleEvents: [],
				},
			],
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		await expect(
			service.refreshMaterializationStatus?.("acctmirror_frontier_stale_completion"),
		).resolves.toMatchObject({
			mirrorCompleteness: {
				state: "in_progress",
				summary: "Attachment inventory has 26 detail surfaces remaining.",
				remainingDetailSurfaces: { projects: 0, conversations: 26, total: 26 },
			},
			liveFollowCycle: {
				currentPhase: "detail-inventory",
				nextPhase: "detail-inventory",
				phases: [
					{
						phase: "detail-inventory",
						status: "pending",
					},
				],
			},
		});
	});

	test("hydrates a newer collector failure into completion phase and error readback", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:05:00.000Z"),
			initialState: {
				"chatgpt:default": {
					lastSuccessAtMs: Date.parse("2026-04-30T12:00:00.000Z"),
					detectedIdentityKey: "ecochran76@gmail.com",
					metadataCounts: {
						projects: 1,
						conversations: 3,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					metadataEvidence: {
						identitySource: "profile-menu",
						projectSampleIds: ["project_1"],
						conversationSampleIds: ["conversation_1"],
						truncated: { projects: false, conversations: false, artifacts: false },
						collectorProgress: {
							provider: "chatgpt",
							runtimeProfileId: "default",
							sweepMode: "full_sweep",
							phase: "detail-inventory",
							event: "failed",
							observedAt: "2026-04-30T12:05:00.000Z",
						},
						collectorDiagnostics: [
							{
								stage: "conversation-context",
								event: "timed_out",
								observedAt: "2026-04-30T12:05:00.000Z",
								detail: "Conversation context read exceeded its 90000ms deadline.",
							},
						],
					},
					backfillLedger: {
						...completeBackfillLedger,
						updatedAt: "2026-04-30T12:06:00.000Z",
					},
				},
			},
		});
		const operation: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_failed_readback",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "full_sweep",
			phase: "steady_follow",
			status: "paused",
			startedAt: "2026-04-30T11:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 4,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: null,
			materializationRefreshSnapshot: true,
			materializationForce: false,
			materializationCursor: null,
			materializationOutcome: null,
			accountLibraryCursor: null,
			liveFollowCycle: null,
			forceRunUntilPassCount: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: { requestRefresh: vi.fn(async () => createRefreshResult()) },
			initialOperations: [operation],
			now: () => new Date("2026-04-30T12:05:00.000Z"),
		});

		const hydrated = await service.refreshMaterializationStatus?.("acctmirror_failed_readback");
		expect(hydrated).toMatchObject({
			status: "paused",
			error: {
				message: "Conversation context read exceeded its 90000ms deadline.",
				code: "account_mirror_collector_timeout",
			},
			liveFollowCycle: {
				currentPhase: "detail-inventory",
			},
		});
		expect(hydrated?.liveFollowCycle?.phases).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ phase: "detail-inventory", status: "blocked" }),
			]),
		);
	});

	test("hydrates active cooldown operations without refreshing before eligible time", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_hydrated",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const requestRefresh = vi.fn(async (request) => ({
			...createRefreshResult(),
			requestedPhase: request.requestedPhase ?? null,
		}));
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleep.mock.calls.length > 0);

		expect(service.read("acctmirror_hydrated")).toMatchObject({
			status: "idle_waiting",
			phase: "steady_follow",
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			passCount: 1,
			lifecycleEvents: [
				{
					type: "resumed_after_restart",
					status: "running",
					previousStatus: "running",
				},
			],
		});
		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("hydrates active operations without launching them when startup resume is disabled", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_startup_isolated",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "backfill_history" as const,
			status: "queued" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 0,
			lastRefresh: null,
			mirrorCompleteness: null,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: false,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await Promise.resolve();

		expect(service.read("acctmirror_startup_isolated")).toMatchObject({
			status: "queued",
			passCount: 0,
			lifecycleEvents: [],
		});
		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(service.prepareForShutdown?.()).toEqual([]);
		expect(service.read("acctmirror_startup_isolated")).toMatchObject({
			status: "queued",
			passCount: 0,
			lifecycleEvents: [],
		});
	});

	test("blocks unsafe legacy Gemini live-follow startup resume", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_legacy_gemini",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "queued" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 10,
			lastRefresh: {
				...createRefreshResult(),
				provider: "gemini" as const,
				runtimeProfileId: "auracall-gemini-pro",
				metadataCounts: {
					projects: 0,
					conversations: 71,
					artifacts: 0,
					files: 0,
					media: 0,
				},
			},
			materializationPolicy: "metadata_only" as const,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await Promise.resolve();

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(service.read("acctmirror_legacy_gemini")).toMatchObject({
			status: "paused",
			passCount: 10,
			error: {
				code: "gemini_live_follow_resume_blocked",
			},
			lifecycleEvents: [
				{
					type: "automatic_resume_blocked",
					status: "paused",
					previousStatus: "queued",
				},
			],
		});
	});

	test("blocks unsafe legacy Gemini live-follow operator resume", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_paused_legacy_gemini",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "paused" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 10,
			lastRefresh: {
				...createRefreshResult(),
				provider: "gemini" as const,
				runtimeProfileId: "auracall-gemini-pro",
			},
			materializationPolicy: "metadata_only" as const,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		expect(
			service.control({
				id: "acctmirror_paused_legacy_gemini",
				action: "resume",
			}),
		).toMatchObject({
			status: "paused",
			error: {
				code: "gemini_live_follow_resume_blocked",
			},
			lifecycleEvents: [
				{
					type: "operator_resume_blocked",
					status: "paused",
					previousStatus: "paused",
				},
			],
		});
		await Promise.resolve();

		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("lists persisted and active operations with filters", async () => {
		const active = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_active",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:10:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:20:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const completed = {
			...active,
			id: "acctmirror_completed",
			status: "completed" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: "2026-04-30T12:01:00.000Z",
			nextAttemptAt: null,
			maxPasses: 3,
			mode: "bounded" as const,
		};
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [completed, active],
			resumeActiveOperations: false,
			sleep,
		});

		expect(service.list().map((operation) => operation.id)).toEqual([
			"acctmirror_active",
			"acctmirror_completed",
		]);
		expect(service.list({ status: "active" }).map((operation) => operation.id)).toEqual([
			"acctmirror_active",
		]);
		expect(service.list({ status: "completed" }).map((operation) => operation.id)).toEqual([
			"acctmirror_completed",
		]);
		expect(service.list({ provider: "gemini" })).toEqual([]);
		expect(service.list({ limit: 1 })).toHaveLength(1);
	});

	test("pauses, resumes, and cancels live-follow operations", async () => {
		let resolveRefresh: (value: AccountMirrorRefreshResult) => void = () => undefined;
		const requestRefresh = vi.fn(
			(_request?: AccountMirrorRefreshRequest) =>
				new Promise<AccountMirrorRefreshResult>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_control",
		});

		service.start();
		await waitFor(() => requestRefresh.mock.calls.length === 1);
		const firstRefreshRequest = requestRefresh.mock.calls[0]?.[0];
		expect(firstRefreshRequest?.abortSignal?.aborted).toBe(false);
		expect(service.read("acctmirror_control")?.lifecycleEvents?.map((event) => event.type)).toEqual(
			["started", "provider_work_acquired"],
		);

		expect(service.control({ id: "acctmirror_control", action: "pause" })).toMatchObject({
			id: "acctmirror_control",
			status: "paused",
		});
		expect(service.list({ status: "active" }).map((operation) => operation.id)).toEqual([
			"acctmirror_control",
		]);
		expect(firstRefreshRequest?.abortSignal?.aborted).toBe(true);

		resolveRefresh(createRefreshResult());
		await waitFor(() => service.read("acctmirror_control")?.status === "paused");
		expect(service.read("acctmirror_control")).toMatchObject({
			status: "paused",
			passCount: 0,
			phase: "backfill_history",
			mirrorCompleteness: null,
			lastRefresh: null,
		});

		expect(service.control({ id: "acctmirror_control", action: "resume" })).toMatchObject({
			status: "queued",
		});
		await waitFor(() => service.read("acctmirror_control")?.status === "running");
		expect(service.read("acctmirror_control")?.lifecycleEvents?.map((event) => event.type)).toEqual(
			expect.arrayContaining(["started", "operator_paused", "operator_resumed"]),
		);
		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(requestRefresh).toHaveBeenCalledTimes(2);

		expect(service.control({ id: "acctmirror_control", action: "cancel" })).toMatchObject({
			status: "cancelled",
			completedAt: "2026-04-30T12:00:00.000Z",
		});
		expect(service.read("acctmirror_control")?.lifecycleEvents?.at(-1)).toMatchObject({
			type: "operator_cancelled",
			status: "cancelled",
			previousStatus: "running",
			processPid: process.pid,
		});
		expect(service.control({ id: "missing", action: "pause" })).toBeNull();
	});

	test("aborts an in-flight collector and forbids post-cancel materialization", async () => {
		let resolveRefresh: (value: AccountMirrorRefreshResult) => void = () => undefined;
		const requestRefresh = vi.fn(
			(_request?: AccountMirrorRefreshRequest) =>
				new Promise<AccountMirrorRefreshResult>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create" as const,
			generatedAt: "2026-04-30T12:00:01.000Z",
			reused: false,
			job: { id: "hmj_forbidden_after_cancel", status: "queued" },
		}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob },
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_cancel_inflight",
		});

		service.start({
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});
		await waitFor(() => requestRefresh.mock.calls.length === 1);
		const refreshRequest = requestRefresh.mock.calls[0]?.[0];
		expect(refreshRequest?.abortSignal?.aborted).toBe(false);

		expect(service.control({ id: "acctmirror_cancel_inflight", action: "cancel" })).toMatchObject({
			status: "cancelled",
			passCount: 0,
		});
		expect(refreshRequest?.abortSignal?.aborted).toBe(true);

		// Simulate a provider boundary that resolves despite observing cancellation.
		resolveRefresh(createRefreshResult());
		await waitFor(() =>
			Boolean(
				service
					.read("acctmirror_cancel_inflight")
					?.lifecycleEvents?.some((event) => event.type === "provider_work_released"),
			),
		);

		expect(service.read("acctmirror_cancel_inflight")).toMatchObject({
			status: "cancelled",
			passCount: 0,
			materializationCursor: null,
			materializationOutcome: null,
		});
		expect(createJob).not.toHaveBeenCalled();
	});

	test("forces one live-follow pass without converting the subscription to bounded completion", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [
				{
					object: "account_mirror_completion",
					id: "acctmirror_force_one",
					provider: "chatgpt",
					runtimeProfileId: "default",
					mode: "live_follow",
					sweepMode: "steady_follow",
					phase: "steady_follow",
					status: "idle_waiting",
					startedAt: "2026-04-30T11:45:00.000Z",
					completedAt: null,
					nextAttemptAt: "2026-04-30T12:30:00.000Z",
					maxPasses: null,
					passCount: 4,
					lastRefresh: createRefreshResult(),
					materializationPolicy: "metadata_only",
					mirrorCompleteness: completeMirror,
					error: null,
					lifecycleEvents: [],
				},
			],
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		expect(service.control({ id: "acctmirror_force_one", action: "run_one_pass" })).toMatchObject({
			id: "acctmirror_force_one",
			status: "queued",
			nextAttemptAt: null,
			forceRunUntilPassCount: 5,
			lifecycleEvents: [
				{
					type: "operator_forced_pass",
					status: "queued",
					previousStatus: "idle_waiting",
				},
			],
		});

		await waitFor(() => service.read("acctmirror_force_one")?.passCount === 5);

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				cleanupManagedBrowserAfterRefresh: true,
				explicitRefresh: true,
				ignoreMinimumInterval: false,
				requestedPhase: null,
			}),
		);
		expect(service.read("acctmirror_force_one")).toMatchObject({
			mode: "live_follow",
			status: "idle_waiting",
			maxPasses: null,
			passCount: 5,
			forceRunUntilPassCount: null,
			mirrorCompleteness: completeMirror,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
			},
		});
	});

	test("blocks child materialization when managed browser cleanup does not release ownership", async () => {
		const requestRefresh = vi.fn(async () => ({
			...createRefreshResult(),
			browserLifecycle: {
				cleanupRequested: true,
				status: "failed" as const,
				managedProfileDir: "/tmp/default/chatgpt",
				pid: 37909,
				message: "Managed browser profile remained owned by PID 37909 after bounded cleanup.",
			},
		}));
		const createJob = vi.fn();
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-31T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob },
			now: () => new Date("2026-07-31T12:00:00.000Z"),
			generateId: () => "acctmirror_cleanup_handoff",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});

		await waitFor(() => service.read("acctmirror_cleanup_handoff")?.status === "blocked");

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_cleanup_handoff")).toMatchObject({
			status: "blocked",
			passCount: 1,
			lastRefresh: {
				browserLifecycle: {
					status: "failed",
					pid: 37909,
				},
			},
			error: {
				code: "account_mirror_browser_cleanup_failed",
			},
		});
	});

	test("re-arms one blocked live-follow pass without resuming continuous follow", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-31T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			initialOperations: [
				{
					object: "account_mirror_completion",
					id: "acctmirror_force_blocked_one",
					provider: "chatgpt",
					runtimeProfileId: "default",
					mode: "live_follow",
					sweepMode: "steady_follow",
					phase: "steady_follow",
					status: "blocked",
					startedAt: "2026-07-31T11:45:00.000Z",
					completedAt: "2026-07-31T11:59:00.000Z",
					nextAttemptAt: null,
					maxPasses: null,
					passCount: 37,
					lastRefresh: createRefreshResult(),
					materializationPolicy: "metadata_only",
					mirrorCompleteness: completeMirror,
					error: {
						message: "Prior materialization failed.",
						code: "account_mirror_materialization_failed",
					},
					lifecycleEvents: [],
				},
			],
			now: () => new Date("2026-07-31T12:00:00.000Z"),
		});

		expect(
			service.control({ id: "acctmirror_force_blocked_one", action: "run_one_pass" }),
		).toMatchObject({
			status: "queued",
			completedAt: null,
			forceRunUntilPassCount: 38,
			lifecycleEvents: [
				{
					type: "operator_forced_pass",
					status: "queued",
					previousStatus: "blocked",
				},
			],
		});

		await waitFor(() => service.read("acctmirror_force_blocked_one")?.passCount === 38);

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(service.read("acctmirror_force_blocked_one")).toMatchObject({
			status: "idle_waiting",
			passCount: 38,
			forceRunUntilPassCount: null,
			error: null,
		});
	});

	test.each([
		"blocked",
		"failed",
	] as const)("does not re-arm a %s bounded completion with run-one-pass", (status) => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const id = `acctmirror_bounded_${status}`;
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({ config }),
			refreshService: { requestRefresh },
			initialOperations: [
				{
					object: "account_mirror_completion",
					id,
					provider: "chatgpt",
					runtimeProfileId: "default",
					mode: "bounded",
					sweepMode: "steady_follow",
					phase: "steady_follow",
					status,
					startedAt: "2026-07-31T11:45:00.000Z",
					completedAt: "2026-07-31T11:59:00.000Z",
					nextAttemptAt: null,
					maxPasses: 1,
					passCount: 0,
					lastRefresh: null,
					materializationPolicy: "metadata_only",
					mirrorCompleteness: null,
					error: {
						message:
							status === "blocked"
								? "Provider guard blocked the bounded run."
								: "The bounded collector failed.",
						code:
							status === "blocked"
								? "account_mirror_provider_cooldown"
								: "account_mirror_collector_failed",
					},
					lifecycleEvents: [],
				},
			],
		});

		expect(service.control({ id, action: "run_one_pass" })).toMatchObject({
			status,
			passCount: 0,
			lifecycleEvents: [],
		});
		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("re-arms one failed live-follow pass without opening an unbounded retry loop", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-08-24T16:30:00.000Z"),
			}),
			refreshService: { requestRefresh },
			initialOperations: [
				{
					object: "account_mirror_completion",
					id: "acctmirror_force_failed_one",
					provider: "chatgpt",
					runtimeProfileId: "wsl-chrome-3",
					mode: "live_follow",
					sweepMode: "steady_follow",
					phase: "steady_follow",
					status: "failed",
					startedAt: "2026-08-24T15:45:00.000Z",
					completedAt: "2026-08-24T16:00:00.000Z",
					nextAttemptAt: null,
					maxPasses: null,
					passCount: 1,
					forceRunUntilPassCount: 2,
					lastRefresh: createRefreshResult(),
					materializationPolicy: "metadata_only",
					mirrorCompleteness: completeMirror,
					error: {
						message: "Timed out waiting for ChatGPT sidebar readiness after 587ms.",
						code: null,
					},
					lifecycleEvents: [],
				},
			],
			now: () => new Date("2026-08-24T16:30:00.000Z"),
		});

		expect(
			service.control({ id: "acctmirror_force_failed_one", action: "run_one_pass" }),
		).toMatchObject({
			status: "queued",
			completedAt: null,
			forceRunUntilPassCount: 2,
			error: null,
			lifecycleEvents: [
				{
					type: "operator_forced_pass",
					status: "queued",
					previousStatus: "failed",
				},
			],
		});

		await waitFor(() => service.read("acctmirror_force_failed_one")?.passCount === 2);

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({ cleanupManagedBrowserAfterRefresh: true }),
		);
		expect(service.read("acctmirror_force_failed_one")).toMatchObject({
			status: "idle_waiting",
			passCount: 2,
			forceRunUntilPassCount: null,
			error: null,
		});
		expect(requestRefresh).toHaveBeenCalledTimes(1);

		expect(service.control({ id: "acctmirror_force_failed_one", action: "cancel" })).toMatchObject({
			status: "cancelled",
			passCount: 2,
		});
		expect(
			service.control({ id: "acctmirror_force_failed_one", action: "run_one_pass" }),
		).toMatchObject({ status: "cancelled", passCount: 2 });
		expect(requestRefresh).toHaveBeenCalledTimes(1);
	});

	test("defaults to live follow and keeps running after a complete refresh", async () => {
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValue(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-04-30T12:10:00.000Z",
					},
				),
			);
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_live_follow",
			sleep,
		});

		const started = service.start();

		expect(started).toMatchObject({
			mode: "live_follow",
			phase: "backfill_history",
			maxPasses: null,
		});

		await waitFor(
			() => service.read("acctmirror_live_follow")?.nextAttemptAt === "2026-04-30T12:10:00.000Z",
		);

		expect(requestRefresh).toHaveBeenCalledTimes(2);
		for (const [refreshRequest] of requestRefresh.mock.calls) {
			expect(refreshRequest).not.toHaveProperty("cleanupManagedBrowserAfterRefresh");
		}
		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(service.read("acctmirror_live_follow")).toMatchObject({
			status: "idle_waiting",
			mode: "live_follow",
			phase: "steady_follow",
			passCount: 1,
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
		});
	});

	test("continues pending full-sweep detail work as a wide steady-follow phase request", async () => {
		let resolveRefresh: (value: AccountMirrorRefreshResult) => void = () => {};
		const requestRefresh = vi.fn(
			() =>
				new Promise<AccountMirrorRefreshResult>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				initialState: {
					"chatgpt:default": {
						metadataCounts: {
							projects: 1,
							conversations: 4,
							artifacts: 1,
							files: 1,
							media: 0,
						},
						metadataEvidence: {
							identitySource: "profile-menu",
							projectSampleIds: ["project_1"],
							conversationSampleIds: ["conv_pending"],
							conversationFreshnessFrontier: {
								object: "account_mirror_conversation_freshness_frontier",
								provider: "chatgpt",
								sweepMode: "steady_follow",
								threshold: 3,
								rowsExamined: 4,
								rowsSelectedForDetail: 1,
								frontierReached: true,
								firstStoppedRow: null,
								fallbackReason: null,
								selectedConversationIds: ["conv_pending"],
								rowEvidence: [],
							},
							truncated: { projects: false, conversations: false, artifacts: true },
						},
					},
				},
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_phase_contract",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "full_sweep",
		});

		await waitFor(() => requestRefresh.mock.calls.length === 1);
		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				requestedPhase: "detail-inventory",
				collectorTimeoutMs: 900_000,
			}),
		);
		resolveRefresh(createRefreshResult());
		await waitFor(() => service.read("acctmirror_phase_contract")?.passCount === 1);
		service.control({ id: "acctmirror_phase_contract", action: "cancel" });
	});

	test("uses persisted phase ledger for the first bounded refresh", async () => {
		const requestRefresh = vi.fn(async (request) => ({
			...createRefreshResult(),
			requestedPhase: request.requestedPhase ?? null,
		}));
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: {
						...completeBackfillLedger,
						state: "in_progress",
						lastCompletedPhase: "project-conversations",
						nextEligiblePhase: "detail-inventory",
						cursors: {
							...completeBackfillLedger.cursors,
							newestFirstDetail: {
								status: "pending",
								reason: "Detail inventory cursor or remaining detail surfaces are still pending.",
								updatedAt: "2026-04-30T12:00:01.000Z",
								nextIndex: 4,
								readLimit: 4,
								scanned: 4,
								yielded: false,
								conversationDetail: null,
							},
						},
					},
				},
			},
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_bounded_phase_contract",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_bounded_phase_contract")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				materializationPolicy: "metadata_only",
				requestedPhase: "detail-inventory",
			}),
		);
		expect(service.read("acctmirror_bounded_phase_contract")).toMatchObject({
			status: "completed",
			mode: "bounded",
			passCount: 1,
			lastRefresh: {
				requestedPhase: "detail-inventory",
			},
		});
	});

	test("blocks bounded completion before refresh while provider guard cooldown is active", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					providerGuard: {
						state: "cooldown",
						kind: "unknown",
						summary: "ChatGPT rate limit detected: Too many requests.",
						detectedAtMs: Date.parse("2026-04-30T11:59:00.000Z"),
						clearedAtMs: null,
						cooldownUntilMs: Date.parse("2026-04-30T12:15:00.000Z"),
						url: null,
						action: "readConversationContext",
					},
				},
			},
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_guarded_bounded",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_guarded_bounded")?.status === "blocked");

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(service.read("acctmirror_guarded_bounded")).toMatchObject({
			status: "blocked",
			passCount: 0,
			completedAt: "2026-04-30T12:00:00.000Z",
			error: {
				code: "account_mirror_provider_cooldown",
				message:
					"ChatGPT rate limit detected: Too many requests. Automation is delayed until 2026-04-30T12:15:00.000Z before chatgpt/default live follow can continue.",
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "provider_guard_backoff",
					status: "running",
					message:
						"ChatGPT rate limit detected: Too many requests. Automation is delayed until 2026-04-30T12:15:00.000Z before chatgpt/default live follow can continue.",
				}),
			]),
		});
	});

	test("records collector progress lifecycle events while refresh is running", async () => {
		const requestRefresh = vi.fn(async (request) => {
			await request.onCollectorProgress?.({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				phase: "detail-inventory",
				event: "started",
				observedAt: "2026-04-30T12:00:01.000Z",
				conversationsObserved: 1,
			});
			return new Promise<AccountMirrorRefreshResult>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_progress_events",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
		});

		await waitFor(() =>
			Boolean(
				service
					.read("acctmirror_progress_events")
					?.lifecycleEvents?.some((event) => event.type === "collector_progress"),
			),
		);
		expect(service.read("acctmirror_progress_events")?.lifecycleEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "collector_progress",
					status: "running",
					message: "Collector progress: detail-inventory:started conversations=1.",
				}),
			]),
		);
		service.control({ id: "acctmirror_progress_events", action: "cancel" });
	});

	test.each([
		"full_sweep",
		"scoped",
		"steady_frontier",
		"retained_only",
		"quiet_frontier",
	])("respects materialization frontier and settles owned failure (mode=%s)", async (mode) => {
		const scoped = mode === "scoped";
		const quiet = mode === "quiet_frontier";
		const retainedOnly = mode === "retained_only";
		const frontier = mode === "steady_frontier" || retainedOnly || quiet;
		const pacedConfig = {
			runtimeProfiles: {
				default: {
					...config.runtimeProfiles.default,
					services: {
						chatgpt: {
							...config.runtimeProfiles.default.services.chatgpt,
							liveFollow: {
								enabled: true,
								maxBrowserInteractionsPerMinute: 8,
								conversationReadCooldownMs: 120_000,
								pageRefreshCooldownMs: 120_000,
								renavigationCooldownMs: 120_000,
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_full_sweep_1",
				status: "queued",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_full_sweep_1",
			status: "failed",
			completedAt: "2026-04-30T12:00:08.000Z",
			result: {
				metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 1 },
				entries: [
					{
						status: "failed",
						reason: "json_missing_download_url",
						failureKind: "retrieval_failed",
					},
				],
				message: "History reconciliation failed to retrieve 1 asset.",
			},
		}));
		const requestRefresh = vi.fn(async () => ({
			...createRefreshResult(),
			metadataEvidence: {
				identitySource: "browser_session",
				projectSampleIds: [],
				conversationSampleIds: ["conv_collector_fresh_1"],
				detailConversationIdsThisPass: quiet || retainedOnly ? [] : ["conv_collector_fresh_1"],
				retainedMaterializationConversationIds: quiet ? [] : ["conv_retained_1"],
				...(quiet
					? {
							changeFrontierPlan: {
								object: "account_mirror_change_frontier_plan" as const,
								version: 1 as const,
								epochId: "quiet-epoch",
								resumeAfterConversationKey: null,
								checkpointFound: true,
								decisions: [
									{
										conversationKey: "complete-A",
										checkpointKey: "complete-A",
										action: "skip" as const,
										reason: "unchanged_complete" as const,
									},
								],
								counts: { skip: 1, visit_once: 0, materialize_retained: 0, defer: 0 },
							},
						}
					: {}),
				truncated: { projects: false, conversations: false, artifacts: false },
			},
		}));
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config: pacedConfig,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: completeBackfillLedger,
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			readMaterializationBacklog:
				scoped || frontier
					? async () => ({ retrievableMissing: 1, unknownOrDeferred: 0 })
					: undefined,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
				readJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_full_sweep",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			conversationIds: scoped ? [" conv_collector_fresh_1 ", "conv_collector_fresh_1"] : undefined,
			materializationPolicy: "full_missing_assets",
			materializationRefreshSnapshot: true,
			sweepMode: scoped || frontier ? "steady_follow" : "full_sweep",
			materializationAssetKinds: ["media"],
			materializationMaxItems: 2,
		});

		if (quiet) {
			await waitFor(() => service.read("acctmirror_full_sweep")?.passCount === 1);
			service.control({ id: "acctmirror_full_sweep", action: "pause" });
			expect(createJob).not.toHaveBeenCalled();
			expect(readJob).not.toHaveBeenCalled();
			return;
		}
		await waitFor(() => service.read("acctmirror_full_sweep")?.status === "blocked");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: scoped || frontier ? "steady_follow" : "full_sweep",
				collectorTimeoutMs: 900_000,
				...(scoped
					? { conversationIds: ["conv_collector_fresh_1"], requestedPhase: "detail-inventory" }
					: {}),
			}),
		);
		expect(createJob).toHaveBeenCalledWith({
			...(scoped
				? { conversationIds: ["conv_collector_fresh_1"] }
				: frontier
					? {
							conversationIds: retainedOnly
								? ["conv_retained_1"]
								: ["conv_collector_fresh_1", "conv_retained_1"],
						}
					: {}),
			provider: "chatgpt",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			reuseSnapshotAfter: "2026-04-30T12:00:00.000Z",
			...(retainedOnly ? {} : { reuseSnapshotConversationIds: ["conv_collector_fresh_1"] }),
			providerWorkNotBefore: "2026-04-30T12:02:01.000Z",
			interactionPolicy: {
				maxInteractionsPerMinute: 8,
				conversationReadCooldownMs: 120_000,
				pageRefreshCooldownMs: 120_000,
				renavigationCooldownMs: 120_000,
			},
			assetKinds: ["media"],
			maxItems: 2,
			force: false,
		});
		expect(readJob).toHaveBeenCalledTimes(1);
		expect(service.read("acctmirror_full_sweep")).toMatchObject({
			status: "blocked",
			sweepMode: scoped || frontier ? "steady_follow" : "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationCursor: {
				jobId: "hmj_full_sweep_1",
				jobStatus: "failed",
				providerWorkSettledAt: "2026-04-30T12:00:08.000Z",
				passCount: 1,
				request: {
					reconcile: true,
					refreshSnapshot: true,
					reuseSnapshotAfter: "2026-04-30T12:00:00.000Z",
					...(retainedOnly ? {} : { reuseSnapshotConversationIds: ["conv_collector_fresh_1"] }),
					providerWorkNotBefore: "2026-04-30T12:02:01.000Z",
					interactionPolicy: {
						maxInteractionsPerMinute: 8,
						conversationReadCooldownMs: 120_000,
						pageRefreshCooldownMs: 120_000,
						renavigationCooldownMs: 120_000,
					},
					assetKinds: ["media"],
					maxItems: 2,
				},
			},
			materializationOutcome: {
				materialized: 0,
				failed: 1,
				dispositionCounts: {
					retrieval_failed: 1,
				},
			},
			error: {
				code: "account_mirror_materialization_failed",
			},
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "in_progress",
				nextEligiblePhase: "materialization",
				cursors: {
					materialization: {
						status: "pending",
						reason:
							"materialization job hmj_full_sweep_1 finished with status failed; materialized=0 failed=1",
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "materialization",
						state: "in_progress",
					}),
				}),
			}),
		);
	});

	test("queues missing assets from a complete ledger without replaying provider discovery", async () => {
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_complete_ledger_1",
				status: "queued",
			},
		}));
		const readMaterializationBacklog = vi.fn(async () => ({
			retrievableMissing: 5,
			unknownOrDeferred: 0,
		}));
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					metadataCounts: {
						projects: 1,
						conversations: 3,
						artifacts: 3,
						files: 2,
						media: 0,
					},
					metadataEvidence: {
						identitySource: "test",
						projectSampleIds: ["project_1"],
						conversationSampleIds: ["conversation_1"],
						assetInventory: {
							state: "observed",
							summary: "Five remote assets are not materialized locally.",
							detailScannedThisPass: { projects: 1, conversations: 3, total: 4 },
							localMaterialized: { artifacts: 0, files: 0, media: 0 },
							remoteKnownMissingLocal: { artifacts: 3, files: 2, media: 0 },
							unknownOrDeferred: { artifacts: 0, files: 0, media: 0 },
						},
						truncated: { projects: false, conversations: false, artifacts: false },
					},
					backfillLedger: completeBackfillLedger,
				},
			},
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob },
			readMaterializationBacklog,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_complete_ledger_shortcut",
			sleep: () => new Promise<void>(() => {}),
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});

		await waitFor(() => createJob.mock.calls.length === 1);
		const operation = service.read("acctmirror_complete_ledger_shortcut");
		expect(requestRefresh).not.toHaveBeenCalled();
		expect(readMaterializationBacklog).toHaveBeenCalledTimes(1);
		expect(createJob).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "default",
				reconcile: true,
				assetKinds: ["all"],
			}),
		);
		expect(operation).toMatchObject({
			status: "idle_waiting",
			passCount: 1,
			lastRefresh: null,
			materializationCursor: {
				jobId: "hmj_complete_ledger_1",
				jobStatus: "queued",
				passCount: 1,
			},
			liveFollowCycle: {
				currentPhase: "materialization",
			},
		});
		expect(operation?.lifecycleEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "materialization_from_complete_ledger" }),
			]),
		);
		service.control({ id: "acctmirror_complete_ledger_shortcut", action: "cancel" });
	});

	test("does not queue raw missing assets when the recovery backlog is non-actionable", async () => {
		const createJob = vi.fn();
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValue(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-09-01T16:10:00.000Z",
					},
				),
			);
		const readMaterializationBacklog = vi.fn(async () => ({
			retrievableMissing: 0,
			unknownOrDeferred: 4,
		}));
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-09-01T16:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					metadataCounts: {
						projects: 1,
						conversations: 3,
						artifacts: 3,
						files: 2,
						media: 0,
					},
					metadataEvidence: {
						identitySource: "test",
						projectSampleIds: ["project_1"],
						conversationSampleIds: ["conversation_1"],
						assetInventory: {
							state: "observed",
							summary: "Raw inventory contains only non-actionable assets.",
							detailScannedThisPass: { projects: 1, conversations: 3, total: 4 },
							localMaterialized: { artifacts: 0, files: 0, media: 0 },
							remoteKnownMissingLocal: { artifacts: 3, files: 2, media: 0 },
							unknownOrDeferred: { artifacts: 0, files: 0, media: 0 },
						},
						truncated: { projects: false, conversations: false, artifacts: false },
					},
					backfillLedger: completeBackfillLedger,
				},
			},
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob },
			readMaterializationBacklog,
			now: () => new Date("2026-09-01T16:00:00.000Z"),
			generateId: () => "acctmirror_non_actionable_backlog",
			sleep: () => new Promise<void>(() => {}),
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});

		await waitFor(
			() =>
				service.read("acctmirror_non_actionable_backlog")?.nextAttemptAt ===
				"2026-09-01T16:10:00.000Z",
		);
		expect(readMaterializationBacklog).toHaveBeenCalled();
		expect(createJob).not.toHaveBeenCalled();
		expect(requestRefresh).toHaveBeenCalledTimes(2);
		service.control({ id: "acctmirror_non_actionable_backlog", action: "cancel" });
	});

	test("settles complete-ledger materialization before ending a forced pass", async () => {
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_forced_complete_ledger_1",
				status: "queued",
			},
		}));
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const readJob = vi.fn(async () => ({
			id: "hmj_forced_complete_ledger_1",
			status: "succeeded",
			completedAt: "2026-04-30T12:00:03.000Z",
			result: {
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				entries: [{ status: "materialized", checksumSha256: "abc123" }],
				message: "History reconciliation materialized 1 asset from 1 conversation.",
			},
		}));
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					metadataCounts: {
						projects: 0,
						conversations: 1,
						artifacts: 1,
						files: 0,
						media: 0,
					},
					metadataEvidence: {
						identitySource: "test",
						projectSampleIds: [],
						conversationSampleIds: ["conversation_1"],
						truncated: { projects: false, conversations: false, artifacts: false },
					},
					backfillLedger: completeBackfillLedger,
				},
			},
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob, readJob },
			initialOperations: [
				{
					object: "account_mirror_completion",
					id: "acctmirror_forced_complete_ledger",
					provider: "chatgpt",
					runtimeProfileId: "default",
					mode: "live_follow",
					sweepMode: "full_sweep",
					phase: "steady_follow",
					status: "paused",
					startedAt: "2026-04-30T11:00:00.000Z",
					completedAt: null,
					nextAttemptAt: null,
					maxPasses: null,
					passCount: 0,
					lastRefresh: null,
					materializationPolicy: "full_missing_assets",
					mirrorCompleteness: completeMirror,
					error: null,
					lifecycleEvents: [],
				},
			],
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		service.control({ id: "acctmirror_forced_complete_ledger", action: "run_one_pass" });
		await waitFor(
			() =>
				service.read("acctmirror_forced_complete_ledger")?.materializationCursor?.jobStatus ===
				"succeeded",
		);

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(readJob).toHaveBeenCalledTimes(1);
		expect(service.read("acctmirror_forced_complete_ledger")).toMatchObject({
			status: "idle_waiting",
			passCount: 1,
			forceRunUntilPassCount: null,
			nextAttemptAt: null,
			materializationCursor: {
				jobId: "hmj_forced_complete_ledger_1",
				jobStatus: "succeeded",
				providerWorkSettledAt: "2026-04-30T12:00:03.000Z",
			},
			materializationOutcome: {
				materialized: 1,
				failed: 0,
			},
		});
	});

	test("blocks a forced pass when its asynchronous materialization fails", async () => {
		const requestRefresh = vi.fn(async () => ({
			...createRefreshResult(),
			metadataEvidence: {
				identitySource: "provider-app",
				projectSampleIds: [],
				conversationSampleIds: ["conversation_1"],
				detailConversationIdsThisPass: ["conversation_1"],
				truncated: { projects: false, conversations: false, artifacts: false },
			},
		}));
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-07-31T12:00:01.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_forced_async_failure",
				status: "queued",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_forced_async_failure",
			status: "failed",
			completedAt: "2026-07-31T12:00:02.000Z",
			result: {
				metrics: { conversations: 2, materialized: 0, skipped: 1, failed: 6 },
				entries: [{ status: "failed", reason: "account_session_drift" }],
				message: "History reconciliation failed to materialize 6 assets from 2 conversations.",
			},
		}));
		const initial: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_forced_async_failure",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "full_sweep",
			phase: "backfill_history",
			status: "paused",
			startedAt: "2026-07-31T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 0,
			lastRefresh: null,
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 6,
			materializationRefreshSnapshot: true,
			materializationForce: false,
			materializationCursor: null,
			materializationOutcome: null,
			mirrorCompleteness: null,
			error: null,
			lifecycleEvents: [],
		};
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-31T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: { createJob, readJob },
			initialOperations: [initial],
			now: () => new Date("2026-07-31T12:00:00.000Z"),
		});

		service.control({ id: initial.id, action: "run_one_pass" });

		await waitFor(() => service.read(initial.id)?.status === "blocked");
		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(createJob).toHaveBeenCalledTimes(1);
		expect(readJob).toHaveBeenCalledTimes(1);
		expect(service.read(initial.id)).toMatchObject({
			status: "blocked",
			passCount: 1,
			forceRunUntilPassCount: null,
			nextAttemptAt: null,
			materializationCursor: {
				jobId: "hmj_forced_async_failure",
				jobStatus: "failed",
				providerWorkSettledAt: "2026-07-31T12:00:02.000Z",
			},
			materializationOutcome: {
				materialized: 0,
				failed: 6,
			},
			error: {
				code: "account_mirror_materialization_failed",
			},
		});
	});

	test("eligible account-library live follow queues capped file reconciliation after a refresh pass", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 3,
									providerWorkTimeoutMs: 120_000,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-06-05T04:00:02.000Z",
			reused: false,
			reuseReason: null,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_account_library_1",
				status: "queued",
			},
		}));
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config: eligibleConfig,
			now: () => new Date("2026-06-05T04:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: {
						...completeBackfillLedger,
						browserProfileId: "wsl-chrome-3",
					},
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:00:00.000Z"),
			generateId: () => "acctmirror_account_library_queue",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_account_library_queue")?.status === "completed");

		expect(createJob).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "default",
				browserProfile: "wsl-chrome-3",
				reconcile: true,
				assetSource: "account-library",
				refreshSnapshot: false,
				assetKinds: ["files"],
				maxItems: 3,
				providerWorkTimeoutMs: 120_000,
				force: false,
			}),
		);
		expect(service.read("acctmirror_account_library_queue")).toMatchObject({
			accountLibraryCursor: {
				jobId: "hmj_account_library_1",
				jobStatus: "queued",
				reused: false,
				passCount: 1,
				status: "queued",
				reason: "queued account-library materialization job hmj_account_library_1",
				request: expect.objectContaining({
					assetSource: "account-library",
					assetKinds: ["files"],
					maxItems: 3,
				}),
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_queued",
					message: "queued account-library materialization job hmj_account_library_1",
				}),
			]),
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "in_progress",
				nextEligiblePhase: "account-library",
				cursors: {
					accountLibrary: {
						status: "pending",
						reason: "queued account-library materialization job hmj_account_library_1",
						readLimit: 3,
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "account-library",
					}),
				}),
			}),
		);
	});

	test("eligible account-library live follow records reused active reconciliation jobs", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 1,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-06-05T04:02:02.000Z",
			reused: true,
			reuseReason: "active sourceKey is already running",
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_account_library_active",
				status: "running",
			},
		}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: eligibleConfig,
				now: () => new Date("2026-06-05T04:02:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:02:00.000Z"),
			generateId: () => "acctmirror_account_library_reuse",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_account_library_reuse")?.status === "completed");

		expect(service.read("acctmirror_account_library_reuse")).toMatchObject({
			accountLibraryCursor: {
				jobId: "hmj_account_library_active",
				jobStatus: "running",
				reused: true,
				passCount: 1,
				status: "reused",
				reason: "active sourceKey is already running",
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_queued",
					message: "active sourceKey is already running",
				}),
			]),
		});
	});

	test("eligible account-library live follow skips duplicate catch-up evaluation for the same pass", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 1,
								},
							},
						},
					},
				},
			},
		};
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_account_library_duplicate_pass",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "bounded" as const,
			sweepMode: "steady_follow" as const,
			phase: "backfill_history" as const,
			status: "queued" as const,
			startedAt: "2026-06-05T04:06:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: 1,
			passCount: 0,
			lastRefresh: null,
			materializationPolicy: "metadata_only" as const,
			accountLibraryCursor: {
				jobId: "hmj_account_library_prior",
				jobStatus: "queued",
				reused: false,
				requestedAt: "2026-06-05T04:05:00.000Z",
				passCount: 1,
				status: "queued" as const,
				reason: "queued account-library materialization job hmj_account_library_prior",
				request: {
					provider: "chatgpt" as const,
					runtimeProfile: "default",
					browserProfile: "wsl-chrome-3",
					boundIdentityKey: "ecochran76@gmail.com",
					reconcile: true as const,
					assetSource: "account-library" as const,
					refreshSnapshot: false,
					assetKinds: ["files" as const],
					maxItems: 1,
					providerWorkTimeoutMs: null,
					force: false,
				},
			},
			mirrorCompleteness: null,
			error: null,
			lifecycleEvents: [],
		};
		const createJob = vi.fn();
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: eligibleConfig,
				now: () => new Date("2026-06-05T04:06:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-06-05T04:06:00.000Z"),
		});

		await waitFor(
			() => service.read("acctmirror_account_library_duplicate_pass")?.status === "completed",
		);

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_account_library_duplicate_pass")).toMatchObject({
			passCount: 1,
			accountLibraryCursor: {
				jobId: null,
				jobStatus: null,
				reused: false,
				passCount: 1,
				status: "skipped",
				reason: "account-library catch-up already evaluated for this pass",
				request: null,
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_skipped",
					message: "account-library catch-up already evaluated for this pass",
				}),
			]),
		});
	});

	test("preview-only account-library live follow records a skip reason after refresh", async () => {
		const previewConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "preview_only",
									maxItems: 3,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn();
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: previewConfig,
				now: () => new Date("2026-06-05T04:04:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:04:00.000Z"),
			generateId: () => "acctmirror_account_library_preview_skip",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});

		await waitFor(
			() => service.read("acctmirror_account_library_preview_skip")?.status === "completed",
		);

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_account_library_preview_skip")).toMatchObject({
			accountLibraryCursor: {
				jobId: null,
				jobStatus: null,
				reused: false,
				passCount: 1,
				status: "skipped",
				reason: "liveFollow.accountLibrary.mode is preview_only",
				request: null,
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_skipped",
					message: "liveFollow.accountLibrary.mode is preview_only",
				}),
			]),
		});
	});

	test("does not queue Gemini materialization when the refresh only reached the app shell", async () => {
		const requestRefresh = vi.fn(
			async (): Promise<AccountMirrorRefreshResult> => ({
				...createRefreshResult(),
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				metadataEvidence: {
					identitySource: "google-account-label",
					projectSampleIds: [],
					conversationSampleIds: [],
					routeProgress: {
						provider: "gemini",
						strategy: "gemini-left-rail",
						routeSequence: ["/app"],
						appShellVisits: 1,
						gemsViewVisits: 0,
						repeatedRouteVisits: 0,
						conversationCandidates: 0,
						selectedConversationIds: [],
						artifactBearingConversationIds: [],
						fileBearingConversationIds: [],
						materializationAttempts: 0,
						churnDetected: true,
						yieldCause: "shell_without_conversation_selection",
					},
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			}),
		);
		const createJob = vi.fn(async () => ({
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				id: "hmj_should_not_queue",
				status: "queued",
			},
		}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_shell_churn",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "full_missing_assets",
			materializationMaxItems: 1,
		});

		await waitFor(() => service.read("acctmirror_gemini_shell_churn")?.status === "completed");

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_gemini_shell_churn")).toMatchObject({
			status: "completed",
			materializationCursor: null,
			materializationOutcome: null,
		});
	});

	test("hydrates terminal materialization job evidence into completion readback", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_terminal_1",
				status: "queued",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_terminal_1",
			status: "succeeded",
			completedAt: "2026-04-30T12:00:08.000Z",
			result: {
				metrics: {
					conversations: 5,
					eligibleCandidates: 12,
					selectedCandidates: 5,
					materialized: 4,
					skipped: 1,
					failed: 0,
				},
				manifestPaths: ["/tmp/gemini-artifacts.json"],
				entries: [
					{ status: "materialized", checksumSha256: "abc123" },
					{ status: "materialized", checksumSha256: "def456" },
					{ status: "materialized", checksumSha256: null },
					{ status: "skipped", reason: "already_materialized in archive" },
					{
						status: "failed",
						reason: "conversation-not-found-or-unavailable: deleted conversation",
						failureKind: "provider_unavailable",
					},
					{ status: "skipped", reason: "unsupported remote media asset" },
					{
						status: "failed",
						reason: "missing provider download link",
						failureKind: "retrieval_failed",
					},
					{ status: "failed", reason: "provider call timed out; retry allowed" },
				],
				snapshotRefreshes: [
					{ routeabilityState: "routeable" },
					{ routeabilityState: "not_found_or_unavailable" },
					{ routeabilityState: "routeable" },
				],
				message: "History reconciliation materialized 4 assets from 5 conversations.",
			},
		}));
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: completeBackfillLedger,
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
				readJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_terminal_hydration",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});

		await waitFor(
			() =>
				service.read("acctmirror_terminal_hydration")?.materializationCursor?.jobId ===
				"hmj_terminal_1",
		);
		const hydrated = await service.refreshMaterializationStatus?.("acctmirror_terminal_hydration");

		expect(hydrated).toMatchObject({
			materializationCursor: {
				jobId: "hmj_terminal_1",
				jobStatus: "succeeded",
			},
			materializationOutcome: {
				jobId: "hmj_terminal_1",
				jobStatus: "succeeded",
				completedAt: "2026-04-30T12:00:08.000Z",
				conversationsAttempted: 5,
				eligibleCandidates: 12,
				selectedCandidates: 5,
				materialized: 4,
				skipped: 1,
				failed: 0,
				checksumCount: 2,
				manifestPaths: ["/tmp/gemini-artifacts.json"],
				terminalRouteabilityCounts: {
					routeable: 2,
					not_found_or_unavailable: 1,
				},
				dispositionCounts: {
					materialized: 3,
					duplicate: 1,
					provider_unavailable: 1,
					unsupported_remote_media: 1,
					retrieval_failed: 1,
					retryable: 1,
				},
			},
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "complete",
				nextEligiblePhase: "complete",
				cursors: {
					materialization: {
						status: "complete",
						reason:
							"materialization job hmj_terminal_1 finished with status succeeded; materialized=4 failed=0",
						scanned: 5,
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "complete",
					}),
				}),
			}),
		);
	});

	test("waits a full collector interval after terminal materialization before refreshing", async () => {
		const initial: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_post_materialization_quiet_window",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "full_sweep",
			phase: "backfill_history",
			status: "running",
			startedAt: "2026-07-23T11:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 6,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 8,
			materializationRefreshSnapshot: true,
			materializationForce: false,
			materializationCursor: {
				jobId: "hmj_post_materialization_quiet_window",
				jobStatus: "running",
				reused: false,
				requestedAt: "2026-07-23T11:50:00.000Z",
				passCount: 6,
				request: {
					provider: "chatgpt",
					runtimeProfile: "default",
					reconcile: true,
					refreshSnapshot: true,
					assetKinds: ["all"],
					maxItems: 8,
					force: false,
				},
			},
			materializationOutcome: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: {
					runtimeProfiles: {
						default: {
							browserProfile: "default",
							services: {
								chatgpt: {
									identity: { email: "ecochran76@gmail.com" },
									liveFollow: { minIntervalMs: 300_000 },
								},
							},
						},
					},
				},
				now: () => new Date("2026-07-23T12:00:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: {
				createJob: vi.fn(),
				readJob: vi.fn(async () => ({
					id: "hmj_post_materialization_quiet_window",
					status: "succeeded",
					completedAt: "2026-07-23T11:59:00.000Z",
				})),
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-07-23T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleep.mock.calls.length > 0);

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(service.read(initial.id)).toMatchObject({
			status: "idle_waiting",
			nextAttemptAt: "2026-07-23T12:04:00.000Z",
			materializationCursor: {
				jobStatus: "succeeded",
				providerWorkSettledAt: "2026-07-23T11:59:00.000Z",
			},
		});
		expect(sleep).toHaveBeenCalledWith(60_000);
	});

	test("blocks live follow after an all-failed materialization job instead of retrying next pass", async () => {
		const initial: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_failed_materialization_stop",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "full_sweep",
			phase: "backfill_history",
			status: "running",
			startedAt: "2026-07-31T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 35,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 6,
			materializationRefreshSnapshot: true,
			materializationForce: false,
			materializationCursor: {
				jobId: "hmj_failed_materialization_stop",
				jobStatus: "running",
				reused: false,
				requestedAt: "2026-07-31T12:44:00.000Z",
				passCount: 35,
				request: {
					provider: "chatgpt",
					runtimeProfile: "default",
					reconcile: true,
					refreshSnapshot: true,
					assetKinds: ["all"],
					maxItems: 6,
					force: false,
				},
			},
			materializationOutcome: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-31T12:45:00.000Z"),
			}),
			refreshService: { requestRefresh },
			historyMaterializationService: {
				createJob: vi.fn(),
				readJob: vi.fn(async () => ({
					id: "hmj_failed_materialization_stop",
					status: "failed",
					completedAt: "2026-07-31T12:44:30.000Z",
					result: {
						metrics: { conversations: 1, materialized: 0, skipped: 0, failed: 6 },
						entries: [{ status: "failed", reason: "account_session_drift" }],
						message: "History reconciliation failed to materialize 6 assets.",
					},
				})),
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-07-31T12:45:00.000Z"),
			sleep,
		});

		await waitFor(() => service.read(initial.id)?.status === "blocked");

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(service.read(initial.id)).toMatchObject({
			status: "blocked",
			completedAt: "2026-07-31T12:45:00.000Z",
			nextAttemptAt: null,
			materializationCursor: {
				jobStatus: "failed",
				providerWorkSettledAt: "2026-07-31T12:44:30.000Z",
			},
			materializationOutcome: {
				failed: 6,
				materialized: 0,
			},
			error: {
				code: "account_mirror_materialization_failed",
				message: "History reconciliation failed to materialize 6 assets.",
			},
		});
	});

	test("continues live follow after a partial-success materialization job", async () => {
		const initial: AccountMirrorCompletionOperation = {
			object: "account_mirror_completion",
			id: "acctmirror_partial_materialization_continue",
			provider: "chatgpt",
			runtimeProfileId: "default",
			mode: "live_follow",
			sweepMode: "full_sweep",
			phase: "backfill_history",
			status: "running",
			startedAt: "2026-07-31T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 35,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 6,
			materializationRefreshSnapshot: true,
			materializationForce: false,
			materializationCursor: {
				jobId: "hmj_partial_materialization_continue",
				jobStatus: "running",
				reused: false,
				requestedAt: "2026-07-31T12:44:00.000Z",
				passCount: 35,
				request: {
					provider: "chatgpt",
					runtimeProfile: "default",
					reconcile: true,
					refreshSnapshot: true,
					assetKinds: ["all"],
					maxItems: 6,
					force: false,
				},
			},
			materializationOutcome: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-07-31T12:45:00.000Z"),
			}),
			refreshService: { requestRefresh: vi.fn(async () => createRefreshResult()) },
			historyMaterializationService: {
				createJob: vi.fn(),
				readJob: vi.fn(async () => ({
					id: "hmj_partial_materialization_continue",
					status: "failed",
					completedAt: "2026-07-31T12:44:30.000Z",
					result: {
						metrics: { conversations: 4, materialized: 2, skipped: 1, failed: 1 },
						entries: [
							{ status: "materialized", checksumSha256: "abc123" },
							{ status: "materialized", checksumSha256: "def456" },
							{ status: "failed", reason: "provider call timed out; retry allowed" },
						],
						message: "History reconciliation materialized 2 assets from 4 conversations.",
					},
				})),
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-07-31T12:45:00.000Z"),
			sleep,
		});

		await waitFor(
			() => service.read(initial.id)?.status === "blocked" || sleep.mock.calls.length > 0,
		);

		expect(service.read(initial.id)).toMatchObject({
			status: "idle_waiting",
			completedAt: null,
			error: null,
			materializationOutcome: {
				jobStatus: "failed",
				materialized: 2,
				failed: 1,
			},
		});
		expect(sleep).toHaveBeenCalledWith(60_000);
	});

	test("upgrades idle live-follow completion into bounded full-sweep materialization", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_upgrade_claim",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T11:50:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "metadata_only" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:03.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_upgrade_claim",
				status: "queued",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_upgrade_claim",
			status: "succeeded",
			completedAt: "2026-04-30T12:00:04.000Z",
			result: {
				metrics: { conversations: 1, materialized: 1, skipped: 0, failed: 0 },
				entries: [{ status: "materialized", checksumSha256: "abc123" }],
				message: "History reconciliation materialized 1 asset.",
			},
		}));
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
				readJob,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleep.mock.calls.length > 0);
		const upgraded = service.upgradePolicy?.({
			id: "acctmirror_upgrade_claim",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["media"],
			materializationMaxItems: 2,
			materializationRefreshSnapshot: true,
		});

		expect(upgraded).toMatchObject({
			id: "acctmirror_upgrade_claim",
			status: "running",
			mode: "bounded",
			maxPasses: 2,
			nextAttemptAt: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "campaign_policy_upgraded",
					previousStatus: "idle_waiting",
				}),
			]),
		});

		await waitFor(() => service.read("acctmirror_upgrade_claim")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
		expect(createJob).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			reuseSnapshotAfter: "2026-04-30T12:00:00.000Z",
			interactionPolicy: {
				maxInteractionsPerMinute: 30,
				conversationReadCooldownMs: 0,
				pageRefreshCooldownMs: 0,
				renavigationCooldownMs: 0,
			},
			assetKinds: ["media"],
			maxItems: 2,
			force: false,
		});
		expect(service.read("acctmirror_upgrade_claim")).toMatchObject({
			status: "completed",
			passCount: 2,
			materializationCursor: {
				jobId: "hmj_upgrade_claim",
				passCount: 2,
			},
		});
	});

	test("live-follow policy upgrade preserves live-follow mode when maxPasses is null", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_live_follow_upgrade",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "backfill_history" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:05:00.000Z",
			maxPasses: null,
			passCount: 8,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "recent_missing_assets" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: 5,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [initial],
			resumeActiveOperations: false,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		const upgraded = service.upgradePolicy?.({
			id: "acctmirror_live_follow_upgrade",
			maxPasses: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
		});

		expect(upgraded).toMatchObject({
			id: "acctmirror_live_follow_upgrade",
			status: "running",
			mode: "live_follow",
			maxPasses: null,
			nextAttemptAt: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "live_follow_policy_upgraded",
					previousStatus: "idle_waiting",
				}),
			]),
		});
	});

	test("uses a wider collector timeout for Gemini full-sweep completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_full_sweep",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_gemini_full_sweep")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for ChatGPT full-sweep completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_chatgpt_full_sweep",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_chatgpt_full_sweep")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for ChatGPT steady-follow completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_chatgpt_steady_follow_timeout",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(
			() => service.read("acctmirror_chatgpt_steady_follow_timeout")?.status === "completed",
		);

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for Gemini steady-follow completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_steady_follow",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
		});

		await waitFor(() => service.read("acctmirror_gemini_steady_follow")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "steady_follow",
				collectorTimeoutMs: 300_000,
			}),
		);
	});

	test("steady-follow refreshes start from the recent rail instead of resuming deep sweep cursor", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_steady_follow_recent",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
		});

		await waitFor(() => service.read("acctmirror_steady_follow_recent")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
			}),
		);
	});

	test.each([
		{
			label: "polite eligibility",
			error: new AccountMirrorRefreshError(
				409,
				"account_mirror_not_eligible",
				"Account mirror chatgpt/default is delayed: minimum-interval.",
				{
					provider: "chatgpt",
					runtimeProfileId: "default",
					reason: "minimum-interval",
					eligibleAt: "2026-04-30T12:01:00.000Z",
				},
			),
		},
		{
			label: "provider guard",
			error: new AccountMirrorRefreshError(
				409,
				"account_mirror_provider_cooldown",
				"ChatGPT rate limit cooldown is active.",
				{
					provider: "chatgpt",
					runtimeProfileId: "default",
					providerCooldownUntilMs: Date.parse("2026-04-30T12:01:00.000Z"),
				},
			),
		},
	])("waits through $label cooldown instead of blocking the operation", async ({ error }) => {
		const requestRefresh = vi
			.fn()
			.mockRejectedValueOnce(error)
			.mockResolvedValueOnce(createRefreshResult());
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const sleep = vi.fn((ms: number) => {
			if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
			nowMs += ms;
			return Promise.resolve();
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date(nowMs),
			generateId: () => "acctmirror_completion_delayed",
			sleep,
		});

		service.start({ maxPasses: 3 });

		await waitFor(() => service.read("acctmirror_completion_delayed")?.status === "completed");

		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(requestRefresh).toHaveBeenCalledTimes(2);
		expect(service.read("acctmirror_completion_delayed")).toMatchObject({
			status: "completed",
			passCount: 1,
			nextAttemptAt: null,
		});
	});

	test("live follow wakes from cooldown and continues without operator resume", async () => {
		const firstEligibleAt = "2026-04-30T12:01:00.000Z";
		const secondEligibleAt = "2026-04-30T12:11:00.000Z";
		let sleepCount = 0;
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const requestRefresh = vi
			.fn()
			.mockRejectedValueOnce(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: firstEligibleAt,
					},
				),
			)
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValueOnce(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: secondEligibleAt,
					},
				),
			);
		const sleep = vi.fn((ms: number) => {
			sleepCount += 1;
			nowMs += ms;
			return sleepCount === 1 ? Promise.resolve() : new Promise<void>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date(nowMs),
			generateId: () => "acctmirror_live_follow_cadence",
			sleep,
		});

		service.start();

		await waitFor(() => service.read("acctmirror_live_follow_cadence")?.passCount === 1);
		await waitFor(
			() => service.read("acctmirror_live_follow_cadence")?.nextAttemptAt === secondEligibleAt,
		);

		expect(requestRefresh).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenNthCalledWith(1, 60_000);
		expect(service.read("acctmirror_live_follow_cadence")).toMatchObject({
			status: "idle_waiting",
			mode: "live_follow",
			passCount: 1,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
			},
			nextAttemptAt: secondEligibleAt,
		});
	});

	test("rechecks persisted cooldowns in bounded slices after restart", async () => {
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_restart_slice",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "backfill_history" as const,
			status: "running" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:03:00.000Z",
			maxPasses: null,
			passCount: 4,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: {
				...completeMirror,
				state: "in_progress" as const,
				remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
			},
			error: null,
		};
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValue(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-04-30T12:13:00.000Z",
					},
				),
			);
		const sleep = vi.fn((ms: number) => {
			if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
			nowMs += ms;
			return Promise.resolve();
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date(nowMs),
			sleep,
		});

		await waitFor(() => service.read("acctmirror_restart_slice")?.passCount === 5);

		expect(sleep.mock.calls.slice(0, 3).map(([ms]) => ms)).toEqual([60_000, 60_000, 60_000]);
		await waitFor(
			() => service.read("acctmirror_restart_slice")?.nextAttemptAt === "2026-04-30T12:13:00.000Z",
		);
		expect(requestRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(service.read("acctmirror_restart_slice")).toMatchObject({
			status: "idle_waiting",
			nextAttemptAt: "2026-04-30T12:13:00.000Z",
			passCount: 5,
			phase: "steady_follow",
		});
	});

	test("defers due live-follow completion refreshes while foreground work is active", async () => {
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_foreground_deferred",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "steady_follow" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:00:00.000Z",
			maxPasses: null,
			passCount: 4,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "recent_missing_assets" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: 5,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn((ms: number) => {
			nowMs += ms;
			return new Promise<void>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date(nowMs),
			sleep,
			foregroundRetryDelayMs: 5_000,
			shouldYieldToForegroundWork: () => ({
				reason: "foreground-work",
				message: "Foreground AuraCall API work is pending.",
			}),
		});

		await waitFor(
			() =>
				service.read("acctmirror_foreground_deferred")?.nextAttemptAt ===
				"2026-04-30T12:00:05.000Z",
		);

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).toHaveBeenCalledWith(5_000);
		expect(service.read("acctmirror_foreground_deferred")).toMatchObject({
			status: "idle_waiting",
			passCount: 4,
			nextAttemptAt: "2026-04-30T12:00:05.000Z",
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "foreground_work_deferred",
					status: "idle_waiting",
					previousStatus: "running",
					message: "Foreground AuraCall API work is pending. Retry at 2026-04-30T12:00:05.000Z.",
				}),
			]),
		});
	});

	test("does not sleep on stale persisted minimum interval for bounded reconciliation", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_bounded_resume",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "bounded" as const,
			sweepMode: "full_sweep" as const,
			phase: "steady_follow" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: 2,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "metadata_only" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => service.read("acctmirror_bounded_resume")?.status === "completed");

		expect(sleep).not.toHaveBeenCalled();
		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				ignoreMinimumInterval: true,
				ignoreFailureBackoff: true,
			}),
		);
		expect(service.read("acctmirror_bounded_resume")).toMatchObject({
			status: "completed",
			nextAttemptAt: null,
			passCount: 2,
		});
	});

	test("serializes restored same-provider registry hydration behind the provider-work lease", async () => {
		const baseRegistry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});
		let activeHydrations = 0;
		let maxConcurrentHydrations = 0;
		const refreshPersistentState = vi.fn(async () => {
			activeHydrations += 1;
			maxConcurrentHydrations = Math.max(maxConcurrentHydrations, activeHydrations);
			await new Promise((resolve) => setTimeout(resolve, 20));
			activeHydrations -= 1;
		});
		const registry = {
			...baseRegistry,
			refreshPersistentState,
		};
		const first = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_restore_default",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "bounded" as const,
			phase: "backfill_history" as const,
			status: "running" as const,
			startedAt: "2026-04-30T11:58:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: 2,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const second = {
			...first,
			id: "acctmirror_restore_consulting",
			runtimeProfileId: "wsl-chrome-2",
			startedAt: "2026-04-30T11:59:00.000Z",
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			initialOperations: [first, second],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		await waitFor(
			() =>
				service.read(first.id)?.status === "completed" &&
				service.read(second.id)?.status === "completed",
		);

		expect(requestRefresh).toHaveBeenCalledTimes(2);
		expect(maxConcurrentHydrations).toBe(1);
	});

	test("parks runnable operations for restart instead of cancelling them", async () => {
		const requestRefresh = vi.fn(() => new Promise<AccountMirrorRefreshResult>(() => {}));
		const running = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_shutdown_running",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const paused = {
			...running,
			id: "acctmirror_shutdown_paused",
			status: "paused" as const,
			startedAt: "2026-04-30T11:59:00.000Z",
		};
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [running, paused],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		await waitFor(() => requestRefresh.mock.calls.length > 0);

		expect(service.prepareForShutdown?.().map((operation) => operation.id)).toEqual([
			"acctmirror_shutdown_running",
		]);

		expect(service.read("acctmirror_shutdown_running")).toMatchObject({
			status: "queued",
			completedAt: null,
			nextAttemptAt: null,
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "resumed_after_restart",
					status: "running",
					previousStatus: "running",
				}),
				expect.objectContaining({
					type: "parked_for_shutdown",
					status: "queued",
					previousStatus: "running",
				}),
			]),
		});
		expect(service.read("acctmirror_shutdown_paused")).toMatchObject({
			status: "paused",
		});
	});

	test("wakes cooldown sleeps during shutdown parking", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_shutdown_sleep",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		let sleepStarted = false;
		let sleepSettled = false;
		const sleep = vi.fn(async () => {
			sleepStarted = true;
			await new Promise<void>(() => {});
			sleepSettled = true;
		});
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleepStarted);
		service.prepareForShutdown?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(service.read("acctmirror_shutdown_sleep")).toMatchObject({
			status: "queued",
		});
		expect(sleepSettled).toBe(false);
		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("persists parked shutdown operations for restart resume", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-completion-shutdown-"));
		try {
			const store = createAccountMirrorCompletionStore({
				config: {
					browser: {
						cache: {
							rootDir: tmp,
						},
					},
				},
			});
			const requestRefresh = vi.fn(() => new Promise<AccountMirrorRefreshResult>(() => {}));
			const service = createAccountMirrorCompletionService({
				registry: createAccountMirrorStatusRegistry({
					config,
					now: () => new Date("2026-04-30T12:00:00.000Z"),
				}),
				refreshService: {
					requestRefresh,
				},
				store,
				generateId: () => "acctmirror_shutdown_persisted",
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			});

			service.start();
			await waitFor(() => requestRefresh.mock.calls.length > 0);
			service.prepareForShutdown?.();

			await waitFor(async () =>
				Boolean(
					(await store.readOperation("acctmirror_shutdown_persisted"))?.lifecycleEvents?.some(
						(event) => event.type === "parked_for_shutdown",
					),
				),
			);
			expect(await store.readOperation("acctmirror_shutdown_persisted")).toMatchObject({
				status: "queued",
				completedAt: null,
				nextAttemptAt: null,
				lifecycleEvents: [
					{
						type: "started",
						status: "queued",
						previousStatus: null,
					},
					{
						type: "parked_for_shutdown",
						status: "queued",
						previousStatus: "running",
					},
				],
			});
		} finally {
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test("forces a verification refresh even when persisted status already says complete", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});
		registry.mergeState(
			{ provider: "chatgpt", runtimeProfileId: "default" },
			{
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 1,
					conversations: 76,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				metadataEvidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
				lastSuccessAtMs: Date.parse("2026-04-30T11:00:00.000Z"),
				lastRefreshRequestId: "acctmirror_previous",
			},
		);
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_completion_verification",
		});

		service.start({ maxPasses: 3 });

		await waitFor(() => service.read("acctmirror_completion_verification")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(service.read("acctmirror_completion_verification")).toMatchObject({
			status: "completed",
			passCount: 1,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
			},
		});
	});

	test("starts nonblocking and records completion after refresh finishes", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_completion_test",
		});

		const started = service.start({ maxPasses: 3 });

		expect(started).toMatchObject({
			id: "acctmirror_completion_test",
			status: "queued",
			mode: "bounded",
			maxPasses: 3,
		});

		await waitFor(() => service.read("acctmirror_completion_test")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				requestedPhase: null,
				explicitRefresh: true,
				ignoreMinimumInterval: true,
				queueTimeoutMs: 0,
				collectorTimeoutMs: 900_000,
			}),
		);
		expect(service.read("acctmirror_completion_test")).toMatchObject({
			status: "completed",
			passCount: 1,
			mirrorCompleteness: {
				state: "complete",
			},
		});
	});

	test("requests managed browser cleanup for the final bounded Gemini refresh", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_bounded_cleanup",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_gemini_bounded_cleanup")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "steady_follow",
				cleanupManagedBrowserAfterRefresh: true,
			}),
		);
	});
});

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs = 1000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Timed out waiting for predicate");
}
