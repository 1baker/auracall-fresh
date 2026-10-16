import { describe, expect, it, vi } from "vitest";
import { createAccountMirrorArtifactRecoveryPlanner } from "../../src/accountMirror/artifactRecoveryPlanner.js";
import type {
	AccountMirrorAssetInventoryEvidence,
	AccountMirrorStatusEntry,
	AccountMirrorStatusRegistry,
	AccountMirrorStatusSummary,
} from "../../src/accountMirror/statusRegistry.js";
import type { SearchProjectionService } from "../../src/runtime/searchProjectionService.js";

describe("account mirror artifact recovery planner", () => {
	it("classifies remote-known missing local assets without launching browser work", async () => {
		const refreshPersistentState = vi.fn(async () => undefined);
		const registry = registryWithEntries(
			[
				statusEntry({
					provider: "chatgpt",
					runtimeProfileId: "wsl-chrome-4",
					tenantKey: "service-account:chatgpt:operator@example.com",
					expectedIdentityKey: "operator@example.com",
					assetInventory: assetInventory({
						remoteKnownMissingLocal: { artifacts: 4, files: 2, media: 0 },
						detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
					}),
				}),
				statusEntry({
					provider: "gemini",
					runtimeProfileId: "auracall-gemini-pro",
					tenantKey: "service-account:gemini:operator@example.com",
					expectedIdentityKey: "operator@example.com",
					assetInventory: assetInventory({
						state: "deferred",
						remoteKnownMissingLocal: { artifacts: 0, files: 0, media: 0 },
						unknownOrDeferred: { artifacts: 1, files: 1, media: 1 },
					}),
				}),
			],
			refreshPersistentState,
		);
		const search = vi.fn(async () => ({
			object: "search_results" as const,
			generatedAt: "2026-05-30T16:30:00.000Z",
			query: {
				q: null,
				provider: null,
				runtimeProfile: null,
				tenant: null,
				kind: "artifact",
				status: null,
				fileAvailable: null,
				assetAvailability: "unavailable" as const,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows: [],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
			now: () => new Date("2026-05-30T16:30:00.000Z"),
		});

		const result = await planner.plan({ limit: 1 });

		expect(refreshPersistentState).toHaveBeenCalled();
		expect(search).toHaveBeenCalledWith({
			provider: null,
			runtimeProfile: null,
			tenant: null,
			kind: "artifact",
			assetAvailability: "unavailable",
			limit: 500,
		});
		expect(result.metrics.total).toBe(2);
		expect(result.metrics.returned).toBe(1);
		expect(result.omitted.candidates).toBe(1);
		expect(result.metrics.remoteKnownMissingLocal.total).toBe(6);
		expect(result.metrics.unknownOrDeferred.total).toBe(3);
		expect(result.candidates[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-4",
			status: "eligible",
			action: "queue_history_materialization",
			counts: {
				remoteKnownMissingLocal: {
					total: 6,
				},
			},
			createRequest: {
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-4",
				boundIdentityKey: "operator@example.com",
				reconcile: true,
				assetKinds: ["artifacts", "files"],
			},
		});
	});

	it("narrows status recovery create requests to file assets when only files are retrievable", async () => {
		const registry = registryWithEntries([
			statusEntry({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				tenantKey: "service-account:chatgpt:consult@polymerconsultinggroup.com",
				expectedIdentityKey: "consult@polymerconsultinggroup.com",
				assetInventory: assetInventory({
					remoteKnownMissingLocal: { artifacts: 0, files: 9, media: 0 },
					detailScannedThisPass: { projects: 0, conversations: 4, total: 4 },
				}),
			}),
		]);
		const search = vi.fn(async () => ({
			object: "search_results" as const,
			generatedAt: "2026-06-10T16:42:00.000Z",
			query: {
				q: null,
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-2",
				tenant: null,
				kind: "artifact",
				status: null,
				fileAvailable: null,
				assetAvailability: "unavailable" as const,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows: [],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));
		const listJobs = vi.fn(async () => ({
			object: "history_materialization_jobs" as const,
			generatedAt: "2026-06-10T16:42:00.000Z",
			status: null,
			provider: "chatgpt" as const,
			runtimeProfile: "wsl-chrome-2",
			sourceType: null,
			limit: 50,
			jobs: [
				{
					object: "history_materialization_job" as const,
					id: "hmj_no_file_1",
					source: { type: "reconciliation" as const, provider: "chatgpt" as const },
					request: {
						provider: "chatgpt" as const,
						runtimeProfile: "wsl-chrome-2",
						browserProfile: null,
						boundIdentityKey: "consult@polymerconsultinggroup.com",
						conversationId: null,
						conversationIds: [],
						providerConversationUrl: null,
						projectId: null,
						catalogItemId: null,
						catalogKind: null,
						archiveItemId: null,
						reconcile: true,
						assetSource: null,
						refreshSnapshot: false,
						assetKinds: ["files" as const],
						maxItems: 1,
						providerWorkTimeoutMs: null,
						force: false,
					},
					sourceKey: "test",
					status: "skipped" as const,
					createdAt: "2026-06-10T16:40:00.000Z",
					updatedAt: "2026-06-10T16:40:10.000Z",
					startedAt: "2026-06-10T16:40:01.000Z",
					completedAt: "2026-06-10T16:40:10.000Z",
					attemptCount: 1,
					result: {
						object: "history_materialization_result" as const,
						generatedAt: "2026-06-10T16:40:10.000Z",
						status: "skipped" as const,
						target: null,
						source: { type: "reconciliation" as const, provider: "chatgpt" as const },
						manifestPaths: [],
						entries: [
							{
								kind: "file" as const,
								providerId: null,
								title: null,
								status: "skipped" as const,
								localPath: null,
								remoteUrl: null,
								cacheKey: null,
								checksumSha256: null,
								mimeType: null,
								size: null,
								materializationMethod: null,
								reason:
									"no-materializable-file: provider detail exposed no downloadable file assets",
								archiveItemId: null,
								assetRoute: null,
							},
						],
						archiveItems: [],
						metrics: {
							conversations: 1,
							materialized: 0,
							duplicateAliases: 0,
							skipped: 1,
							failed: 0,
						},
						message: "No downloadable files.",
					},
					error: null,
					message: "No downloadable files.",
				},
			],
			metrics: {
				total: 1,
				byStatus: { skipped: 1 },
				active: 0,
				terminal: 1,
			},
		}));
		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
			historyMaterializationService: { listJobs },
		});

		const result = await planner.plan({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			includeSearchRows: false,
		});

		expect(result.candidates[0]?.counts.retrievableMissingLocal).toMatchObject({
			artifacts: 0,
			files: 9,
			media: 0,
			total: 9,
		});
		expect(result.candidates[0]?.createRequest).toMatchObject({
			provider: "chatgpt",
			runtimeProfile: "wsl-chrome-2",
			boundIdentityKey: "consult@polymerconsultinggroup.com",
			reconcile: true,
			assetKinds: ["files"],
			maxItems: 9,
		});
	});

	it("can include unavailable search rows as explicit recovery candidates", async () => {
		const registry = registryWithEntries([]);
		const search = vi.fn(async () => ({
			object: "search_results" as const,
			generatedAt: "2026-05-30T16:30:00.000Z",
			query: {
				q: null,
				provider: "chatgpt",
				runtimeProfile: "default",
				tenant: null,
				kind: "artifact",
				status: null,
				fileAvailable: null,
				assetAvailability: "unavailable" as const,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows: [
				{
					id: "catalog:artifacts:chatgpt:default:artifact_1",
					object: "search_result_row" as const,
					source: "account_mirror" as const,
					sourceKind: "artifacts",
					kind: "artifact",
					title: "analysis.csv",
					summary: null,
					provider: "chatgpt",
					runtimeProfileId: "default",
					browserProfileId: "default",
					tenant: "operator@example.com",
					projectId: null,
					status: "available-remotely",
					runtimeState: null,
					sortTime: "2026-05-30T16:00:00.000Z",
					updatedAt: "2026-05-30T16:00:00.000Z",
					itemId: "artifact_1",
					counts: { messages: null, files: 0, artifacts: 1 },
					links: { catalogItem: "/v1/account-mirrors/catalog/items/artifact_1" },
					metadata: {},
				},
			],
			nextCursor: null,
			metrics: { total: 1, returned: 1 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
		});

		const result = await planner.plan({ provider: "chatgpt", runtimeProfileId: "default" });

		expect(result.candidates[0]).toMatchObject({
			source: "search_projection",
			sourceItem: {
				id: "artifact_1",
				kind: "artifact",
			},
			createRequest: {
				catalogItemId: "artifact_1",
				catalogKind: "artifacts",
				refreshSnapshot: true,
			},
		});
	});

	it("subtracts materialized archive evidence from remote-known missing counts", async () => {
		const registry = registryWithEntries([
			statusEntry({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-3",
				tenantKey: "service-account:chatgpt:operator@example.com",
				expectedIdentityKey: "operator@example.com",
				assetInventory: assetInventory({
					remoteKnownMissingLocal: { artifacts: 4, files: 2, media: 0 },
					detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
				}),
			}),
		]);
		const search = vi.fn(async (request) => ({
			object: "search_results" as const,
			generatedAt: "2026-05-30T16:30:00.000Z",
			query: {
				q: null,
				provider: "chatgpt",
				runtimeProfile: "wsl-chrome-3",
				tenant: null,
				kind: String(request?.kind ?? "artifact"),
				status: null,
				fileAvailable: null,
				assetAvailability: request?.assetAvailability ?? null,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows:
				request?.assetAvailability === "available"
					? request.kind === "artifact"
						? [
								searchRow({
									id: "archive:artifact_1",
									source: "run_archive",
									sourceKind: "generated_artifact",
									kind: "artifact",
									tenant: "operator@example.com",
								}),
							]
						: [
								searchRow({
									id: "archive:file_1",
									source: "run_archive",
									sourceKind: "upload",
									kind: "upload",
									tenant: "operator@example.com",
								}),
								searchRow({
									id: "archive:file_2",
									source: "run_archive",
									sourceKind: "upload",
									kind: "upload",
									tenant: "operator@example.com",
								}),
							]
					: [],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
		});

		const result = await planner.plan({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			includeSearchRows: false,
		});

		expect(result.metrics.remoteKnownMissingLocal).toEqual({
			artifacts: 3,
			files: 0,
			media: 0,
			total: 3,
		});
		expect(result.candidates[0]?.counts.localMaterialized).toEqual({
			artifacts: 1,
			files: 2,
			media: 0,
			total: 3,
		});
		expect(result.candidates[0]?.createRequest).toMatchObject({
			maxItems: 3,
		});
	});

	it.each([
		{
			failureKind: "retrieval_failed" as const,
			entryStatus: "failed" as const,
			remainingFiles: 2,
			remainingTotal: 4,
			retrievalFailures: 1,
			terminalFailures: 0,
		},
		{
			failureKind: "provider_unavailable" as const,
			entryStatus: "failed" as const,
			remainingFiles: 2,
			remainingTotal: 4,
			retrievalFailures: 0,
			terminalFailures: 1,
		},
		{
			failureKind: undefined,
			entryStatus: "failed" as const,
			remainingFiles: 3,
			remainingTotal: 5,
			retrievalFailures: 0,
			terminalFailures: 0,
		},
		{
			failureKind: undefined,
			entryStatus: "skipped" as const,
			remainingFiles: 3,
			remainingTotal: 5,
			retrievalFailures: 0,
			terminalFailures: 0,
		},
	])("separates typed terminal evidence from legacy $entryStatus/$failureKind", async ({
		failureKind,
		entryStatus,
		remainingFiles,
		remainingTotal,
		retrievalFailures,
		terminalFailures,
	}) => {
		const registry = registryWithEntries([
			statusEntry({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-3",
				tenantKey: "service-account:chatgpt:operator@example.com",
				expectedIdentityKey: "operator@example.com",
				assetInventory: assetInventory({
					remoteKnownMissingLocal: { artifacts: 4, files: 4, media: 0 },
					detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
				}),
			}),
		]);
		const search = vi.fn(async (request) => ({
			object: "search_results" as const,
			generatedAt: "2026-06-01T16:30:00.000Z",
			query: {
				q: null,
				provider: request?.provider ?? "chatgpt",
				runtimeProfile: request?.runtimeProfile ?? "wsl-chrome-3",
				tenant: null,
				kind: String(request?.kind ?? "artifact"),
				status: null,
				fileAvailable: null,
				assetAvailability: request?.assetAvailability ?? null,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows:
				request?.assetAvailability === "available"
					? []
					: request?.kind === "artifact"
						? [
								searchRow({
									id: "catalog:static_favicon",
									source: "account_mirror",
									sourceKind: "artifacts",
									kind: "artifact",
									tenant: "operator@example.com",
									eligibilityState: "static_image_false_positive",
								}),
							]
						: [
								searchRow({
									id: "catalog:unsupported_file",
									source: "account_mirror",
									sourceKind: "files",
									kind: "upload",
									tenant: "operator@example.com",
									eligibilityState: "unsupported_conversation_file",
								}),
							],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));
		const listJobs = vi.fn(async () => ({
			object: "history_materialization_jobs" as const,
			generatedAt: "2026-06-01T16:30:00.000Z",
			status: "terminal" as const,
			provider: "chatgpt" as const,
			runtimeProfile: "wsl-chrome-3",
			sourceType: null,
			limit: 500,
			jobs: [
				{
					object: "history_materialization_job" as const,
					id: "hmj_recent",
					source: { type: "reconciliation" as const, provider: "chatgpt" as const },
					request: {
						provider: "chatgpt" as const,
						runtimeProfile: "wsl-chrome-3",
						boundIdentityKey: "operator@example.com",
					},
					sourceKey: "hmj_recent",
					status: "succeeded" as const,
					createdAt: "2026-06-01T16:00:00.000Z",
					updatedAt: "2026-06-01T16:01:00.000Z",
					startedAt: "2026-06-01T16:00:00.000Z",
					completedAt: "2026-06-01T16:01:00.000Z",
					attemptCount: 1,
					result: {
						object: "history_materialization_result" as const,
						generatedAt: "2026-06-01T16:01:00.000Z",
						status: "materialized" as const,
						target: null,
						source: { type: "reconciliation" as const, provider: "chatgpt" as const },
						manifestPaths: [],
						entries: [
							{
								kind: "artifact" as const,
								providerId: "artifact_alias",
								title: "duplicate.pdf",
								status: "duplicate" as const,
								localPath: null,
								remoteUrl: null,
								cacheKey: null,
								checksumSha256: null,
								mimeType: null,
								size: null,
								materializationMethod: null,
								reason: "already_materialized_alias:archive_1",
								archiveItemId: "archive_1",
								assetRoute: "/asset/archive_1",
							},
							{
								kind: "file" as const,
								providerId: "file_missing_tile",
								title: "missing.docx",
								status: entryStatus,
								localPath: null,
								remoteUrl: "chatgpt://file/file_1",
								cacheKey: null,
								checksumSha256: null,
								mimeType: null,
								size: null,
								materializationMethod: null,
								reason: "ChatGPT conversation file fetch failed: tile_not_found",
								failureKind,
								retryable: false,
								archiveItemId: null,
								assetRoute: null,
							},
						],
						archiveItems: [],
						metrics: {
							conversations: 1,
							materialized: 0,
							duplicateAliases: 1,
							skipped: 0,
							failed: 1,
						},
						message: "test",
					},
					error: null,
					message: "test",
				},
			],
			metrics: {
				total: 1,
				byStatus: { succeeded: 1 },
				active: 0,
				terminal: 1,
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
			historyMaterializationService: { listJobs },
		});

		const result = await planner.plan({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			includeSearchRows: false,
		});

		expect(result.candidates[0]?.counts).toMatchObject({
			remoteKnownMissingLocal: { artifacts: 4, files: 4, total: 8 },
			retrievableMissingLocal: { artifacts: 2, files: remainingFiles, total: remainingTotal },
			duplicateAliases: { artifacts: 1, files: 0, total: 1 },
			staticFalsePositive: { artifacts: 1, files: 0, total: 1 },
			unsupportedMetadataOnly: { artifacts: 0, files: 1, total: 1 },
			retrievalFailed: { artifacts: 0, files: retrievalFailures, total: retrievalFailures },
			failedTerminal: { artifacts: 0, files: terminalFailures, total: terminalFailures },
		});
		expect(result.metrics.retrievableMissingLocal).toMatchObject({
			artifacts: 2,
			files: remainingFiles,
			total: remainingTotal,
		});
		expect(result.candidates[0]?.reason).toContain(
			`${remainingTotal} retrievable missing local assets`,
		);
		expect(result.candidates[0]?.createRequest).toMatchObject({
			assetKinds: ["artifacts", "files"],
			maxItems: remainingTotal,
		});
	});

	it("does not treat ChatGPT account-library metadata rows as retrievable history materialization work", async () => {
		const registry = registryWithEntries([
			statusEntry({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-3",
				tenantKey: "service-account:chatgpt:operator@example.com",
				expectedIdentityKey: "operator@example.com",
				assetInventory: assetInventory({
					remoteKnownMissingLocal: { artifacts: 1, files: 1, media: 0 },
					detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
				}),
			}),
		]);
		const search = vi.fn(async (request) => ({
			object: "search_results" as const,
			generatedAt: "2026-06-01T17:50:00.000Z",
			query: {
				q: null,
				provider: request?.provider ?? "chatgpt",
				runtimeProfile: request?.runtimeProfile ?? "wsl-chrome-3",
				tenant: null,
				kind: String(request?.kind ?? "artifact"),
				status: null,
				fileAvailable: null,
				assetAvailability: request?.assetAvailability ?? null,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows:
				request?.assetAvailability === "available"
					? []
					: [
							searchRow({
								id:
									request?.kind === "artifact"
										? "catalog:library_artifact"
										: "catalog:library_file",
								source: "account_mirror",
								sourceKind: request?.kind === "artifact" ? "artifacts" : "files",
								kind: request?.kind === "artifact" ? "artifact" : "upload",
								tenant: "operator@example.com",
								eligibilityState: "unsupported_account_library_asset",
							}),
						],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
		});

		const result = await planner.plan({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			includeSearchRows: false,
		});

		expect(result.metrics.retrievableMissingLocal.total).toBe(0);
		expect(result.metrics.unsupportedMetadataOnly).toMatchObject({
			artifacts: 1,
			files: 1,
			total: 2,
		});
		expect(result.metrics.accountLibrary).toMatchObject({
			remoteKnownMissingLocal: { artifacts: 1, files: 1, total: 2 },
			retrievableMissingLocal: { artifacts: 0, files: 0, total: 0 },
			unsupportedMetadataOnly: { artifacts: 1, files: 1, total: 2 },
			inventory: {
				total: { artifacts: 1, files: 1, total: 2 },
				stableIdentity: { artifacts: 1, files: 1, total: 2 },
				directDownload: { artifacts: 0, files: 0, total: 0 },
				needsBrowserDetail: { artifacts: 1, files: 1, total: 2 },
				unsupportedNoAuthority: { artifacts: 0, files: 0, total: 0 },
				detailRoutes: {
					unknown: { artifacts: 1, files: 1, total: 2 },
				},
			},
		});
		expect(result.candidates[0]?.counts.accountLibrary).toMatchObject({
			remoteKnownMissingLocal: { artifacts: 1, files: 1, total: 2 },
			unsupportedMetadataOnly: { artifacts: 1, files: 1, total: 2 },
		});
		expect(result.candidates[0]).toMatchObject({
			status: "unsupported",
			action: "none",
			createRequest: null,
		});
	});

	it("splits ChatGPT account-library browser-detail route kinds without marking them retrievable", async () => {
		const registry = registryWithEntries([
			statusEntry({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-3",
				tenantKey: "service-account:chatgpt:operator@example.com",
				expectedIdentityKey: "operator@example.com",
				assetInventory: assetInventory({
					remoteKnownMissingLocal: { artifacts: 3, files: 1, media: 0 },
					detailScannedThisPass: { projects: 0, conversations: 1, total: 1 },
				}),
			}),
		]);
		const search = vi.fn(async (request) => ({
			object: "search_results" as const,
			generatedAt: "2026-06-01T18:15:00.000Z",
			query: {
				q: null,
				provider: request?.provider ?? "chatgpt",
				runtimeProfile: request?.runtimeProfile ?? "wsl-chrome-3",
				tenant: null,
				kind: String(request?.kind ?? "artifact"),
				status: null,
				fileAvailable: null,
				assetAvailability: request?.assetAvailability ?? null,
				materialization: null,
				limit: 500,
				cursor: null,
			},
			rows:
				request?.assetAvailability === "available"
					? []
					: request?.kind === "artifact"
						? [
								searchRow({
									id: "catalog:library_file_detail_artifact",
									source: "account_mirror",
									sourceKind: "artifacts",
									kind: "artifact",
									tenant: "operator@example.com",
									eligibilityState: "unsupported_account_library_asset",
									libraryRouteKind: "library_file_detail",
									remoteUrl:
										"https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
								}),
								searchRow({
									id: "catalog:library_artifact_detail",
									source: "account_mirror",
									sourceKind: "artifacts",
									kind: "artifact",
									tenant: "operator@example.com",
									eligibilityState: "unsupported_account_library_asset",
									libraryRouteKind: "library_artifact_detail",
									remoteUrl:
										"https://chatgpt.com/library/artifacts/223e4567-e89b-12d3-a456-426614174111",
								}),
								searchRow({
									id: "catalog:conversation_detail",
									source: "account_mirror",
									sourceKind: "artifacts",
									kind: "artifact",
									tenant: "operator@example.com",
									eligibilityState: "unsupported_account_library_asset",
									libraryRouteKind: "conversation_detail",
									remoteUrl: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
								}),
							]
						: [
								searchRow({
									id: "catalog:library_file_detail_file",
									source: "account_mirror",
									sourceKind: "files",
									kind: "upload",
									tenant: "operator@example.com",
									eligibilityState: "unsupported_account_library_asset",
									libraryRouteKind: "library_file_detail",
									remoteUrl:
										"https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
								}),
							],
			nextCursor: null,
			metrics: { total: 0, returned: 0 },
			facets: {
				providers: [],
				tenants: [],
				runtimeProfiles: [],
				kinds: [],
				statuses: [],
				assetAvailability: [],
				materialization: [],
			},
		}));

		const planner = createAccountMirrorArtifactRecoveryPlanner({
			registry,
			searchProjectionService: { search } satisfies SearchProjectionService,
		});

		const result = await planner.plan({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			includeSearchRows: false,
		});

		expect(result.metrics.retrievableMissingLocal.total).toBe(0);
		expect(result.metrics.accountLibrary).toMatchObject({
			remoteKnownMissingLocal: { artifacts: 3, files: 1, total: 4 },
			retrievableMissingLocal: { artifacts: 0, files: 0, total: 0 },
			inventory: {
				needsBrowserDetail: { artifacts: 3, files: 1, total: 4 },
				directDownload: { artifacts: 0, files: 0, total: 0 },
				detailRoutes: {
					libraryFileDetail: { artifacts: 1, files: 1, total: 2 },
					libraryArtifactDetail: { artifacts: 1, files: 0, total: 1 },
					conversationDetail: { artifacts: 1, files: 0, total: 1 },
				},
			},
		});
		expect(result.candidates[0]).toMatchObject({
			status: "unsupported",
			action: "none",
			createRequest: null,
		});
	});
});

function searchRow(input: {
	id: string;
	source: "account_mirror" | "run_archive";
	sourceKind: string;
	kind: string;
	tenant: string;
	eligibilityState?: string;
	libraryRouteKind?: string;
	remoteUrl?: string;
}) {
	return {
		id: input.id,
		object: "search_result_row" as const,
		source: input.source,
		sourceKind: input.sourceKind,
		kind: input.kind,
		title: input.id,
		summary: null,
		provider: "chatgpt",
		runtimeProfileId: "wsl-chrome-3",
		browserProfileId: "default",
		tenant: input.tenant,
		projectId: null,
		status: "materialized",
		runtimeState: null,
		sortTime: "2026-05-30T16:00:00.000Z",
		updatedAt: "2026-05-30T16:00:00.000Z",
		itemId: input.id,
		counts: {
			messages: null,
			files: input.kind === "upload" ? 1 : 0,
			artifacts: input.kind === "artifact" ? 1 : 0,
		},
		links: {},
		metadata: {
			fileAvailable: input.source === "run_archive" ? true : null,
			raw: input.eligibilityState
				? {
						...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
						metadata: {
							materializationEligibility: {
								state: input.eligibilityState,
								reason: "test classification",
							},
							...(input.libraryRouteKind ? { libraryRouteKind: input.libraryRouteKind } : {}),
							...(input.remoteUrl ? { libraryRouteUrl: input.remoteUrl } : {}),
						},
					}
				: {},
		},
	};
}

function registryWithEntries(
	entries: AccountMirrorStatusEntry[],
	refreshPersistentState: () => Promise<void> = async () => undefined,
): AccountMirrorStatusRegistry {
	return {
		refreshPersistentState,
		readStatus(): AccountMirrorStatusSummary {
			return {
				object: "account_mirror_status",
				generatedAt: "2026-05-30T16:30:00.000Z",
				entries,
				metrics: {
					total: entries.length,
					eligible: entries.filter((entry) => entry.status === "eligible").length,
					delayed: entries.filter((entry) => entry.status === "delayed").length,
					blocked: entries.filter((entry) => entry.status === "blocked").length,
				},
			};
		},
		updateState() {},
		mergeState() {
			return {};
		},
	};
}

function statusEntry(input: {
	provider: AccountMirrorStatusEntry["provider"];
	runtimeProfileId: string;
	tenantKey: string;
	expectedIdentityKey: string;
	assetInventory: AccountMirrorAssetInventoryEvidence;
}): AccountMirrorStatusEntry {
	return {
		provider: input.provider,
		tenantKey: input.tenantKey,
		bindingKey: `binding:${input.provider}:${input.runtimeProfileId}:default`,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: "default",
		expectedIdentityKey: input.expectedIdentityKey,
		detectedIdentityKey: input.expectedIdentityKey,
		accountLevel: null,
		identityEvidence: {
			source: "provider-app",
			confidence: "authoritative",
			observedAt: null,
			recheckable: false,
			repairStatus: "none",
			previousDetectedIdentityKey: input.expectedIdentityKey,
			currentDetectedIdentityKey: input.expectedIdentityKey,
			lastCheckedAt: null,
			repair: null,
		},
		status: "delayed",
		reason: "minimum-interval",
		eligibleAt: null,
		delayMs: 0,
		lastAttemptAt: null,
		lastSuccessAt: null,
		lastFailureAt: null,
		lastQueuedAt: null,
		lastStartedAt: null,
		lastCompletedAt: null,
		consecutiveFailureCount: 0,
		mirrorState: {
			queued: false,
			running: false,
			lastRefreshRequestId: null,
			lastDispatcherKey: null,
			lastDispatcherOperationId: null,
			lastDispatcherBlockedBy: null,
		},
		providerGuard: {
			state: "clear",
			kind: null,
			summary: null,
			detectedAt: null,
			clearedAt: null,
			cooldownUntil: null,
			url: null,
			action: null,
		},
		metadataCounts: {
			projects: 0,
			conversations: 1,
			artifacts: input.assetInventory.remoteKnownMissingLocal.artifacts,
			files: input.assetInventory.remoteKnownMissingLocal.files,
			media: input.assetInventory.remoteKnownMissingLocal.media,
		},
		metadataEvidence: {
			identitySource: "test",
			projectSampleIds: [],
			conversationSampleIds: [],
			assetInventory: input.assetInventory,
			detailScannedThisPass: input.assetInventory.detailScannedThisPass,
			truncated: {
				projects: false,
				conversations: false,
				artifacts: input.assetInventory.state === "in_progress",
			},
		},
		mirrorCompleteness: {
			state: "in_progress",
			summary: "test completeness",
			assetInventory: input.assetInventory,
			remainingDetailSurfaces: null,
			signals: {
				projectsTruncated: false,
				conversationsTruncated: false,
				attachmentInventoryTruncated: input.assetInventory.state === "in_progress",
				attachmentCursorPresent: false,
			},
		},
		backfillLedger: null,
		liveFollow: {
			configured: true,
			enabled: true,
			state: "enabled",
			reason: "test live follow",
			mode: "metadata-first",
			priority: "normal",
			sweepMode: "steady_follow",
			materializationPolicy: null,
			materializationAssetKinds: null,
			materializationMaxItems: null,
			materializationRefreshSnapshot: null,
			materializationForce: null,
			accountLibrary: {
				configured: false,
				mode: "disabled",
				enabled: false,
				reason: "liveFollow.accountLibrary.mode is not configured",
				maxItems: null,
				minIntervalMs: null,
				failureCooldownMs: null,
				maxActiveJobs: null,
				providerWorkTimeoutMs: null,
			},
		},
		limits: {
			minIntervalMs: 0,
			explicitRefreshMinIntervalMs: 0,
			jitterMs: 0,
			jitterMaxMs: 0,
			failureCooldownMs: 0,
			hardStopCooldownMs: 0,
			maxBrowserInteractionsPerMinute: 0,
			maxPageReadsPerCycle: 0,
			maxConversationRowsPerCycle: 0,
			maxArtifactRowsPerCycle: 0,
			freshFrontierThreshold: 3,
			conversationReadCooldownMs: 0,
			pageRefreshCooldownMs: 0,
			renavigationCooldownMs: 0,
		},
	};
}

function assetInventory(input: {
	state?: AccountMirrorAssetInventoryEvidence["state"];
	remoteKnownMissingLocal: AccountMirrorAssetInventoryEvidence["remoteKnownMissingLocal"];
	unknownOrDeferred?: AccountMirrorAssetInventoryEvidence["unknownOrDeferred"];
	detailScannedThisPass?: AccountMirrorAssetInventoryEvidence["detailScannedThisPass"];
}): AccountMirrorAssetInventoryEvidence {
	return {
		state: input.state ?? "in_progress",
		summary: "test inventory",
		detailScannedThisPass: input.detailScannedThisPass ?? {
			projects: 0,
			conversations: 0,
			total: 0,
		},
		localMaterialized: { artifacts: 0, files: 0, media: 0 },
		remoteKnownMissingLocal: input.remoteKnownMissingLocal,
		unknownOrDeferred: input.unknownOrDeferred ?? { artifacts: 0, files: 0, media: 0 },
	};
}
