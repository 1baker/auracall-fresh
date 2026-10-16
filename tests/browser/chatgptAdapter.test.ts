import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import {
	awaitChatgptDownloadPromiseWithTimeout,
	beforeChatgptBrowserInteractionForTest,
	bindChatgptProviderSessionConnectionForTest,
	buildChatgptAuthSessionIdentityExpression,
	buildChatgptCreateProjectDialogStateExpressionForTest,
	buildChatgptDisposableRootComposerExpression,
	buildChatgptFallbackIdentityExpressionForTest,
	buildChatgptFeatureProbeExpressionForTest,
	buildChatgptPayloadDirectRetryOptionsForTest,
	buildChatgptPostPayloadReadinessFailureStageForTest,
	buildChatgptUrlRouteExpressionForTest,
	classifyChatgptBlockingSurfaceProbe,
	classifyChatgptCapturedFileIdentityValuesForTest,
	classifyChatgptConversationPayloadShapeForTest,
	classifyChatgptFileRetrievalFailure,
	classifyChatgptPostPayloadRouteForTest,
	classifyChatgptRuntimeEvaluationFailureForTest,
	clickChatgptViewerDownloadButtonWithClientForTest,
	clickTaggedChatgptDownloadControlWithClientForTest,
	closeChatgptTabConnectionForTest,
	createChatgptAdapter,
	downloadChatgptConversationFilesWithClientForTest,
	ensureChatgptConversationSurfaceReadyForReadForTest,
	ensureChatgptSidebarOpenForTest,
	extractChatgptArtifactFileNameFromUriForTest,
	extractChatgptConversationArtifactsFromPayload,
	extractChatgptConversationIdFromUrl,
	extractChatgptConversationSourcesFromPayload,
	extractChatgptProjectIdFromUrl,
	extractChatgptProjectSourceName,
	fetchChatgptBinaryWithClientForTest,
	filterChatgptDeepResearchTargets,
	findChatgptProjectByName,
	findChatgptProjectSourceName,
	isChatgptAccountMirrorHardStopForTest,
	isChatgptTargetReusableForPreferredUrl,
	isRetryableChatgptTransientMessage,
	isRetryableConnectionErrorForTest,
	matchesChatgptConversationTitleProbe,
	matchesChatgptDeleteConfirmationProbe,
	matchesChatgptDownloadButtonProbe,
	matchesChatgptImageArtifactProbe,
	matchesChatgptProjectDeleteConfirmationProbe,
	matchesChatgptProjectSettingsSnapshot,
	matchesChatgptRenameEditorProbe,
	mergeChatgptCanvasArtifactContent,
	mergeChatgptConversationArtifacts,
	normalizeChatgptAuthSessionIdentity,
	normalizeChatgptConversationDownloadArtifactProbes,
	normalizeChatgptConversationFileProbes,
	normalizeChatgptConversationHistoryLimit,
	normalizeChatgptConversationId,
	normalizeChatgptConversationLinkProbes,
	normalizeChatgptFeatureSignatureForTest,
	normalizeChatgptLibraryItemProbes,
	normalizeChatgptProjectId,
	normalizeChatgptProjectSourceProbes,
	normalizeChatgptVisibleImageArtifactProbes,
	readChatgptConversationContextWithClientForTest,
	readChatgptConversationPayloadWithClient,
	readChatgptUserIdentityWithClientForTest,
	readVisibleChatgptConversationFilesWithClientForTest,
	readVisibleChatgptConversationMessagesWithClientForTest,
	readVisibleChatgptDownloadArtifactProbesWithClientForTest,
	recordChatgptTargetNavigationForTest,
	recordChatgptTargetSessionForTest,
	recoverVisibleChatgptBlockingSurfaceWithClientForTest,
	resolveChatgptCanvasArtifactContentText,
	resolveChatgptConversationUrl,
	resolveChatgptDownloadUrlFromJson,
	resolveChatgptProjectCreateConfirmLabelsForTest,
	resolveChatgptProjectMemoryLabel,
	resolveChatgptProjectMemoryLabelCandidates,
	resolveChatgptProjectSettingsCommitLabelsForTest,
	resolveChatgptProjectSourceUploadActionLabelsForTest,
	resolveChatgptProjectUrl,
	runWithChatgptAbortBoundConnectionForTest,
	selectChatgptDownloadFailure,
	serializeChatgptGridRowsToCsv,
	summarizeChatgptDownloadJsonShape,
	summarizeChatgptDownloadProviderError,
	waitForChatgptCaptureProgress,
} from "../../src/browser/providers/chatgptAdapter.js";
import {
	reconcileChatgptPayloadDownloadControls,
	resolveChatgptArtifactControlCandidate,
} from "../../src/browser/providers/chatgptArtifactControls.js";
import type { FileRef } from "../../src/browser/providers/domain.js";
import { normalizeProjectMemoryMode } from "../../src/browser/providers/domain.js";
import { annotateClientMutationContext } from "../../src/browser/providers/mutationAudit.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import {
	createBrowserScrapeTelemetryRecorder,
	withBrowserScrapePendingOperation,
} from "../../src/browser/providers/scrapeTelemetry.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

describe("ChatGPT leased-target navigation accounting", () => {
	test("records only a navigation that was physically performed", async () => {
		const onTargetNavigation = vi.fn(async () => undefined);

		await recordChatgptTargetNavigationForTest(false, { onTargetNavigation });
		await recordChatgptTargetNavigationForTest(true, { onTargetNavigation });

		expect(onTargetNavigation).toHaveBeenCalledTimes(1);
	});
});

describe("ChatGPT sidebar readiness recovery", () => {
	test("falls through to the sidebar opener when the readiness transport times out", async () => {
		vi.useFakeTimers();
		try {
			const openSidebar = vi.fn(async () => ({ ok: false }));
			const outcome = ensureChatgptSidebarOpenForTest(
				{
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Runtime: {
						evaluate: vi.fn(() => new Promise<never>(() => undefined)),
					},
				} as never,
				openSidebar,
			);
			const assertion = expect(outcome).resolves.toBeUndefined();

			await vi.advanceTimersByTimeAsync(801);

			await assertion;
			expect(openSidebar).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test("preserves unrelated Runtime.evaluate failures", async () => {
		const openSidebar = vi.fn(async () => ({ ok: false }));

		await expect(
			ensureChatgptSidebarOpenForTest(
				{
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Runtime: {
						evaluate: vi.fn(async () => {
							throw new Error("CDP disconnected");
						}),
					},
				} as never,
				openSidebar,
			),
		).rejects.toThrow("CDP disconnected");
		expect(openSidebar).not.toHaveBeenCalled();
	});
});

describe("browser scrape pending-operation telemetry", () => {
	test("restores the prior operation only after the nested operation settles", async () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		let releaseOuter: (() => void) | undefined;
		const outer = withBrowserScrapePendingOperation(
			{ scrapeTelemetry },
			"provider:chatgpt.outer",
			() =>
				new Promise<void>((resolve) => {
					releaseOuter = resolve;
				}),
		);
		expect(scrapeTelemetry.pendingOperation).toBe("provider:chatgpt.outer");

		await withBrowserScrapePendingOperation(
			{ scrapeTelemetry },
			"provider:chatgpt.inner",
			async () => {
				expect(scrapeTelemetry.pendingOperation).toBe("provider:chatgpt.inner");
			},
		);
		expect(scrapeTelemetry.pendingOperation).toBe("provider:chatgpt.outer");

		releaseOuter?.();
		await outer;
		expect(scrapeTelemetry.pendingOperation).toBeNull();
	});

	test("does not restore an earlier operation that settled before a newer operation", async () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		let releaseEarlier: (() => void) | undefined;
		let releaseLater: (() => void) | undefined;
		const earlier = withBrowserScrapePendingOperation(
			{ scrapeTelemetry },
			"provider:chatgpt.earlier",
			() =>
				new Promise<void>((resolve) => {
					releaseEarlier = resolve;
				}),
		);
		const later = withBrowserScrapePendingOperation(
			{ scrapeTelemetry },
			"provider:chatgpt.later",
			() =>
				new Promise<void>((resolve) => {
					releaseLater = resolve;
				}),
		);
		expect(scrapeTelemetry.pendingOperation).toBe("provider:chatgpt.later");

		releaseEarlier?.();
		await earlier;
		expect(scrapeTelemetry.pendingOperation).toBe("provider:chatgpt.later");

		releaseLater?.();
		await later;
		expect(scrapeTelemetry.pendingOperation).toBeNull();
	});
});

describe("ChatGPT provider-session connection provenance", () => {
	test("binds a disposable connection target before provider identity authorization", () => {
		const authority = createProviderSessionAuthority({
			runtimeProfiles: {
				default: {
					services: {
						chatgpt: { identity: { email: "operator@example.com" } },
					},
				},
			},
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: null,
			devtoolsHost: "127.0.0.1",
			devtoolsPort: 45015,
		};
		const authorization = {
			authority,
			context,
			expectation: authority.resolveExpectation(context),
		};

		bindChatgptProviderSessionConnectionForTest(
			{ providerSessionAuthorization: authorization },
			{ targetId: "disposable-target", host: "127.0.0.1", port: 45015 },
		);

		expect(authorization.context).toMatchObject({
			browserProcessId: 1234,
			browserTargetId: "disposable-target",
			devtoolsHost: "127.0.0.1",
			devtoolsPort: 45015,
		});
		expect(
			authority.verify({
				context: authorization.context,
				expectation: authorization.expectation,
				observation: { email: "operator@example.com", source: "auth-session" },
			}).verdict,
		).toBe("match");
	});
});

describe("ChatGPT disposable root readiness", () => {
	test("accepts the current provider-owned ProseMirror composer", () => {
		const expression = buildChatgptDisposableRootComposerExpression();

		expect(expression).toContain("form[data-chatgpt-composer] .ProseMirror");
		expect(expression).toContain("editor.closest('form[data-chatgpt-composer]')");
		expect(expression).toContain("location.pathname !== '/'");
	});
});

describe("normalizeChatgptFeatureSignature", () => {
	test("uses current drawer rows and composer-scoped selection pills", () => {
		const expression = buildChatgptFeatureProbeExpressionForTest();
		expect(expression).toContain(".__menu-item, [data-fill][tabindex]");
		expect(expression).toContain('form[data-type="unified-composer"]');
		expect(expression).toContain("[data-inline-selection-pill]");
		expect(expression).not.toContain(".__menu-item[tabindex]");
		expect(expression).not.toContain("#prompt-textarea [data-inline-selection-pill]");
	});

	test("normalizes nullable live model selections before schema validation", () => {
		const signature = normalizeChatgptFeatureSignatureForTest({
			detector: "chatgpt-feature-probe-v1",
			web_search: false,
			deep_research: true,
			company_knowledge: false,
			shopping: true,
			composer_tools: ["Add photos & files", "Shopping"],
			apps: [],
			composer_mode: "work",
			composer_apps: [],
			model_controls: {
				visible: true,
				label: "5.6 Sol Light",
				aria_label: "",
				location: "prompt_workbench",
				selector: "button.__composer-pill",
				model_options: [],
				depth_options: [],
				synthesized_options: [],
				selected_model: null,
				selected_depth: null,
			},
		});

		expect(JSON.parse(signature ?? "null")).toMatchObject({
			deep_research: true,
			shopping: true,
			composer_tools: ["Add photos & files", "Shopping"],
			composer_mode: "work",
			model_controls: {
				visible: true,
				label: "5.6 Sol Light",
				location: "prompt_workbench",
			},
		});
	});
});

describe("buildChatgptUrlRouteExpression", () => {
	test("uses the requested origin and pathname for non-project navigation", () => {
		const expression = buildChatgptUrlRouteExpressionForTest(
			"https://chatgpt.com/plugins#settings/Plugins",
		);

		expect(expression).toContain('"https://chatgpt.com"');
		expect(expression).toContain('"/plugins"');
		expect(expression).not.toContain("/project");
	});
});

describe("closeChatgptTabConnection", () => {
	test("keeps retained scoped provider sessions open for later materialization steps", async () => {
		const close = vi.fn(async () => undefined);
		const connection = {
			client: { close },
			targetId: "target-1",
			shouldClose: false,
			host: "127.0.0.1",
			port: 9222,
			usedExisting: true,
		};

		await closeChatgptTabConnectionForTest(connection as never, {
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: "chatgpt:127.0.0.1:9222:https://chatgpt.com/c/conv",
				value: { connection },
				close: vi.fn(),
			},
		});

		expect(close).not.toHaveBeenCalled();
	});

	test("bounds a pending provider-session close after a named Library abort", async () => {
		vi.useFakeTimers();
		try {
			const cleanupPhases: string[] = [];
			const controller = new AbortController();
			const closeSession = vi.fn(() => new Promise<void>(() => undefined));
			const connection = {
				client: { close: vi.fn(async () => undefined) },
				targetId: "library-target",
				shouldClose: false,
				host: "127.0.0.1",
				port: 45015,
				usedExisting: true,
				borrowedFromSession: true,
			};
			const options: BrowserProviderListOptions = {
				abortSignal: controller.signal,
				libraryInventoryLifecycle: {
					onStageEntered: vi.fn(),
					onCleanupPhase: (phase) => cleanupPhases.push(phase),
				},
				useProviderSession: true,
				providerSession: {
					providerId: "chatgpt",
					key: "chatgpt:127.0.0.1:45015:https://chatgpt.com/library",
					value: { connection },
					close: closeSession,
				},
			};
			const pending = runWithChatgptAbortBoundConnectionForTest(
				connection as never,
				options,
				async () => new Promise<never>(() => undefined),
			);
			const outcome = Promise.race([
				pending.then(
					() => ({ status: "resolved" as const }),
					(error: unknown) => ({
						status: "rejected" as const,
						message: error instanceof Error ? error.message : String(error),
					}),
				),
				new Promise<{ status: "still-pending" }>((resolve) => {
					setTimeout(() => resolve({ status: "still-pending" }), 33_001);
				}),
			]);
			setTimeout(() => {
				controller.abort(
					new Error(
						"ChatGPT Library inventory operation timed out after 30000ms during stage dom-inventory.",
					),
				);
			}, 30_000);

			await vi.advanceTimersByTimeAsync(33_001);

			expect(await outcome).toEqual({
				status: "rejected",
				message:
					"ChatGPT Library inventory operation timed out after 30000ms during stage dom-inventory.",
			});
			expect(closeSession).toHaveBeenCalledOnce();
			expect(options.providerSession).toBeUndefined();
			expect(connection.client.close).not.toHaveBeenCalled();
			expect(cleanupPhases).toEqual([
				"abort-cleanup-started",
				"read-rejected",
				"abort-cleanup-timed-out",
			]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("recordChatgptTargetSession", () => {
	test("records one-way target fingerprints that prove attach, retain, and reuse identity", () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();

		recordChatgptTargetSessionForTest(
			{ scrapeTelemetry },
			"attach",
			"raw-target-id-that-must-not-persist",
		);
		recordChatgptTargetSessionForTest(
			{ scrapeTelemetry },
			"retain",
			"raw-target-id-that-must-not-persist",
		);
		recordChatgptTargetSessionForTest(
			{ scrapeTelemetry },
			"reuse",
			"raw-target-id-that-must-not-persist",
		);

		expect(scrapeTelemetry.notes).toHaveLength(3);
		const fingerprints = scrapeTelemetry.notes.map((note) => note.split(":").at(-1));
		expect(new Set(fingerprints)).toEqual(new Set([fingerprints[0]]));
		expect(scrapeTelemetry.notes.join("\n")).not.toContain("raw-target-id-that-must-not-persist");
		expect(scrapeTelemetry.notes).toEqual([
			`chatgpt.target.attach:${fingerprints[0]}`,
			`chatgpt.target.retain:${fingerprints[0]}`,
			`chatgpt.target.reuse:${fingerprints[0]}`,
		]);
	});
});

describe("ensureChatgptConversationSurfaceReadyForRead", () => {
	test.each([
		{
			error: new Error("Timed out waiting for a provider predicate after 10000ms."),
			expected: "evaluation_timeout",
		},
		{
			error: new Error("Execution context was destroyed. raw-provider-detail"),
			expected: "execution_context_destroyed",
		},
		{
			error: Object.assign(new Error("Cannot find context with specified id"), {
				name: "ProtocolError",
			}),
			expected: "execution_context_missing",
		},
		{
			error: new Error("WebSocket is not open: readyState 3 (CLOSED)"),
			expected: "transport_closed",
		},
		{
			error: Object.assign(new Error("opaque protocol failure"), { name: "ProtocolError" }),
			expected: "protocol_error",
		},
		{
			error: new Error("raw-provider-detail"),
			expected: "generic_error",
		},
	])("classifies $expected without returning raw evaluation detail", ({ error, expected }) => {
		const classification = classifyChatgptRuntimeEvaluationFailureForTest(error);
		expect(classification).toBe(expected);
		expect(classification).not.toContain("raw-provider-detail");
	});

	test("hands a ready same-route conversation directly to the context reader", async () => {
		const conversationId = "same-route-context";
		const url = `https://chatgpt.com/c/${conversationId}`;
		const evaluate = vi.fn((_input: { expression?: string }) => {
			const call = evaluate.mock.calls.length;
			if (call === 1) {
				return Promise.resolve({ result: { value: url } });
			}
			if (call <= 4) {
				return Promise.resolve({ result: { value: true } });
			}
			return new Promise<never>(() => undefined);
		});
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();

		const outcome = await Promise.race([
			ensureChatgptConversationSurfaceReadyForReadForTest(
				{
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Page: { navigate: vi.fn() },
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Runtime: { evaluate },
				} as never,
				conversationId,
				null,
				{ allowNavigation: true, scrapeTelemetry },
			).then(() => "ready" as const),
			new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), 25)),
		]);

		expect(outcome).toBe("ready");
		expect(evaluate).toHaveBeenCalledTimes(4);
		expect(scrapeTelemetry.providerActions).toMatchObject({
			"chatgpt.skipSameRouteNavigation": 1,
		});
	});

	test("interrupts a stalled post-payload readiness evaluation", async () => {
		vi.useFakeTimers();
		try {
			const conversationId = "same-route-post-payload-stall";
			const url = `https://chatgpt.com/c/${conversationId}`;
			const evaluate = vi.fn((_input: { expression?: string }) => {
				const call = evaluate.mock.calls.length;
				if (call <= 2) {
					return Promise.resolve({ result: { value: [] } });
				}
				if (call === 3) {
					return Promise.resolve({ result: { value: url } });
				}
				if (call <= 6) {
					return Promise.resolve({ result: { value: true } });
				}
				if (call === 7) {
					return Promise.resolve({
						result: {
							value: {
								ok: true,
								body: JSON.stringify({ mapping: {} }),
							},
						},
					});
				}
				if (call === 8) {
					return new Promise<never>(() => undefined);
				}
				return Promise.resolve({ result: { value: [] } });
			});
			const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
			const outcome = Promise.race([
				readChatgptConversationContextWithClientForTest(
					{
						// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
						Page: { navigate: vi.fn() },
						// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
						Runtime: { evaluate },
					} as never,
					conversationId,
					null,
					undefined,
					{ allowNavigation: true, scrapeTelemetry },
				).then(
					() => "completed",
					(error: unknown) => (error instanceof Error ? error.message : String(error)),
				),
				new Promise<string>((resolve) => setTimeout(() => resolve("outer-stalled"), 10_001)),
			]);

			for (let index = 0; index < 20 && evaluate.mock.calls.length < 8; index += 1) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(evaluate).toHaveBeenCalledTimes(8);
			await vi.advanceTimersByTimeAsync(10_001);
			expect(await outcome).toBe(
				`Timed out waiting for ChatGPT conversation ${conversationId} post-payload readiness after 10000ms.`,
			);
			expect(evaluate.mock.calls[7]?.[0]).toMatchObject({ timeout: 10_000 });
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.skipSameRouteNavigation": 1,
				"chatgpt.waitPostPayloadReadiness": 1,
				"chatgpt.postPayloadReadiness.failed.evaluation_timeout.v1": 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test.each([
		{ label: "expected route", currentUrl: null, routeClass: "expected_conversation" },
		{ label: "ChatGPT home", currentUrl: "https://chatgpt.com/", routeClass: "home" },
	])("fails closed with sanitized payload and route evidence on $label", async ({
		currentUrl,
		routeClass,
	}) => {
		vi.useFakeTimers();
		try {
			const conversationId = "same-route-post-payload-not-ready";
			const url = `https://chatgpt.com/c/${conversationId}`;
			let payloadRead = false;
			const evaluate = vi.fn((input: { expression?: string }) => {
				const expression = input.expression ?? "";
				if (expression.includes("fetch(") && expression.includes("/backend-api/conversation/")) {
					payloadRead = true;
					return Promise.resolve({
						result: { value: { ok: true, body: JSON.stringify({ mapping: {} }) } },
					});
				}
				if (expression.includes("hasTurns || hasComposer")) {
					return Promise.resolve({ result: { value: !payloadRead } });
				}
				if (expression.trim() === "location.href") {
					return Promise.resolve({ result: { value: payloadRead ? (currentUrl ?? url) : url } });
				}
				return Promise.resolve({ result: { value: [] } });
			});
			const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
			const outcome = readChatgptConversationContextWithClientForTest(
				{
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Page: { navigate: vi.fn() },
					// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
					Runtime: { evaluate },
				} as never,
				conversationId,
				null,
				undefined,
				{ allowNavigation: true, scrapeTelemetry },
			).then(
				() => "completed",
				(error: unknown) => (error instanceof Error ? error.message : String(error)),
			);

			for (let index = 0; index < 120; index += 1) {
				await vi.advanceTimersByTimeAsync(100);
			}
			expect(await outcome).toBe(
				`ChatGPT conversation ${conversationId} post-payload readiness was not satisfied.`,
			);
			expect(scrapeTelemetry.providerActions).toMatchObject({
				[`chatgpt.postPayloadReadiness.failed.predicate_unsatisfied.payload_mapping.route_${routeClass}.v1`]: 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("sanitizes post-payload failure into closed payload and route classes", () => {
		expect(classifyChatgptConversationPayloadShapeForTest(null)).toBe("missing");
		expect(classifyChatgptConversationPayloadShapeForTest({ detail: "redacted" })).toBe(
			"non_mapping",
		);
		expect(classifyChatgptConversationPayloadShapeForTest({ mapping: {} })).toBe("mapping");

		const conversationId = "route-class-conversation";
		expect(
			classifyChatgptPostPayloadRouteForTest(
				`https://chatgpt.com/c/${conversationId}`,
				conversationId,
			),
		).toBe("expected_conversation");
		expect(classifyChatgptPostPayloadRouteForTest("https://chatgpt.com/", conversationId)).toBe(
			"home",
		);
		expect(
			classifyChatgptPostPayloadRouteForTest(
				"https://chatgpt.com/c/another-conversation",
				conversationId,
			),
		).toBe("other_chatgpt");
		expect(classifyChatgptPostPayloadRouteForTest("https://example.com/", conversationId)).toBe(
			"non_chatgpt",
		);
		expect(classifyChatgptPostPayloadRouteForTest(null, conversationId)).toBe("unknown");

		expect(
			buildChatgptPostPayloadReadinessFailureStageForTest(
				{ mapping: {} },
				"https://chatgpt.com/",
				conversationId,
			),
		).toBe(
			"chatgpt.postPayloadReadiness.failed.predicate_unsatisfied.payload_mapping.route_home.v1",
		);
		expect(
			buildChatgptPostPayloadReadinessFailureStageForTest(
				{ detail: "not retained" },
				"https://chatgpt.com/c/another-conversation",
				conversationId,
			),
		).toBe(
			"chatgpt.postPayloadReadiness.failed.predicate_unsatisfied.payload_non_mapping.route_other_chatgpt.v1",
		);
	});

	test("propagates terminal payload unavailability before post-payload readiness", async () => {
		const conversationId = "terminal-context-404";
		const url = `https://chatgpt.com/c/${conversationId}`;
		let onResponseReceived: ((params: never) => void) | null = null;
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("fetch(") && expression.includes("/backend-api/conversation/")) {
				return { result: { value: { ok: false, status: 404, body: "{}" } } };
			}
			const call = evaluate.mock.calls.length;
			if (call <= 2) return { result: { value: [] } };
			if (call === 3) return { result: { value: url } };
			if (call <= 6) return { result: { value: true } };
			return { result: { value: [] } };
		});
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: { evaluate },
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn((handler: (params: never) => void) => {
					onResponseReceived = handler;
					return () => undefined;
				}),
				loadingFinished: vi.fn(() => () => undefined),
				getResponseBody: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(async () => undefined),
				navigate: vi.fn(async () => {
					onResponseReceived?.({
						requestId: "request-terminal-context-404",
						response: {
							url: `https://chatgpt.com/backend-api/conversation/${conversationId}`,
							status: 404,
						},
					} as never);
				}),
				reload: vi.fn(),
			},
		};

		await expect(
			readChatgptConversationContextWithClientForTest(
				client as never,
				conversationId,
				null,
				undefined,
				{ allowNavigation: true, scrapeTelemetry },
			),
		).rejects.toThrow(
			`conversation-not-found-or-unavailable: ChatGPT conversation ${conversationId} exact fallback response returned status 404.`,
		);
		expect(scrapeTelemetry.providerActions).toMatchObject({
			"chatgpt.readConversationPayload.failed.conversation_unavailable.v1": 1,
		});
		expect(scrapeTelemetry.providerActions).not.toHaveProperty("chatgpt.waitPostPayloadReadiness");
	});
});

describe("clickChatgptViewerDownloadButtonWithClient", () => {
	test("activates a visible viewer download with trusted input rather than DOM click", async () => {
		class ViewerControl {
			textContent = "Download file";
			ownerDocument = {
				defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) },
			};
			getAttribute(name: string) {
				return name === "aria-label" ? "Download file" : null;
			}
			getBoundingClientRect() {
				return { left: 10, top: 20, width: 100, height: 30 };
			}
			scrollIntoView() {}
			click() {
				throw new Error("untrusted viewer activation");
			}
		}
		const control = new ViewerControl();
		const dispatchMouseEvent = vi.fn(async (_event: unknown) => undefined);
		const evaluate = async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
					Element: ViewerControl,
					// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
					HTMLElement: ViewerControl,
					document: { querySelectorAll: () => [control] },
				}),
			},
		});
		await expect(
			clickChatgptViewerDownloadButtonWithClientForTest({
				// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
				Runtime: { evaluate },
				// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
				Input: { dispatchMouseEvent },
			} as never),
		).resolves.toBe(true);
		expect(dispatchMouseEvent.mock.calls.map(([event]) => event)).toEqual([
			{ type: "mouseMoved", x: 60, y: 35 },
			{ type: "mousePressed", x: 60, y: 35, button: "left", buttons: 1, clickCount: 1 },
			{ type: "mouseReleased", x: 60, y: 35, button: "left", buttons: 0, clickCount: 1 },
		]);
	});

	test("clicks the viewer pane Download control after artifact activation opens a preview", async () => {
		const telemetry = createBrowserScrapeTelemetryRecorder();
		const evaluate = vi.fn(async (input: { expression?: string; returnByValue?: boolean }) => {
			expect(input.returnByValue).toBe(true);
			expect(input.expression).toContain("aria-label");
			expect(input.expression).toContain("Download");
			expect(input.expression).toContain("data-auracall-chatgpt-download-button");
			return { result: { value: { ok: true, label: "Download", x: 60, y: 35 } } };
		});
		const clicked = await clickChatgptViewerDownloadButtonWithClientForTest(
			{
				// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
				Runtime: { evaluate },
				// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
				Input: { dispatchMouseEvent: vi.fn(async () => undefined) },
			} as never,
			{ scrapeTelemetry: telemetry },
		);

		expect(clicked).toBe(true);
		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(telemetry.cdpCalls).toMatchObject({ "Runtime.evaluate": 1 });
		expect(telemetry.providerActions).toMatchObject({
			"chatgpt.clickArtifactViewerDownload": 1,
		});
	});

	test("accepts the current viewer pane Download file control label", async () => {
		const telemetry = createBrowserScrapeTelemetryRecorder();
		const evaluate = vi.fn(async (input: { expression?: string; returnByValue?: boolean }) => {
			expect(input.returnByValue).toBe(true);
			expect(input.expression).toContain("/^Download(?: file)?$/i");
			return { result: { value: { ok: true, label: "Download file", x: 60, y: 35 } } };
		});

		await expect(
			clickChatgptViewerDownloadButtonWithClientForTest(
				{
					// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
					Runtime: { evaluate },
					// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
					Input: { dispatchMouseEvent: vi.fn(async () => undefined) },
				} as never,
				{ scrapeTelemetry: telemetry },
			),
		).resolves.toBe(true);
		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(telemetry.providerActions).toMatchObject({
			"chatgpt.clickArtifactViewerDownload": 1,
			"chatgpt.clickArtifactViewerDownload.currentFileLabel.v1": 1,
		});
	});
});

describe("extractChatgptArtifactFileNameFromUri", () => {
	test("normalizes sandbox basenames for visible behavior-button matching", () => {
		expect(
			extractChatgptArtifactFileNameFromUriForTest(
				"sandbox:/mnt/data/Delta_Tie_Phase_I_SOW_One_Pager.docx",
			),
		).toBe("Delta_Tie_Phase_I_SOW_One_Pager.docx");
		expect(
			extractChatgptArtifactFileNameFromUriForTest(
				"sandbox:/mnt/data/EPSCoR%20Cochran%20Dolgos.docx",
			),
		).toBe("EPSCoR Cochran Dolgos.docx");
	});
});

describe("fetchChatgptBinaryWithClient", () => {
	test("records a bounded failed download when the in-page fetch hangs", async () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
			Runtime: {
				evaluate: vi.fn(() => new Promise<never>(() => undefined)),
			},
		};

		await expect(
			fetchChatgptBinaryWithClientForTest(
				client as never,
				"https://chatgpt.com/backend-api/artifact",
				{ scrapeTelemetry },
				5,
			),
		).rejects.toThrow("Timed out fetching ChatGPT artifact binary");

		expect(scrapeTelemetry.providerActions).toMatchObject({
			"chatgpt.fetchBinary": 1,
		});
		expect(scrapeTelemetry.cdpCalls).toMatchObject({
			"Runtime.evaluate": 1,
		});
		expect(scrapeTelemetry.downloads).toEqual({
			attempted: 1,
			succeeded: 0,
			failed: 1,
		});
	});

	test("records a successful captured binary fetch", async () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: {
						value: {
							ok: true,
							contentType: "text/plain",
							contentDisposition: 'attachment; filename="artifact.txt"',
							base64: Buffer.from("artifact bytes", "utf8").toString("base64"),
						},
					},
				})),
			},
		};

		const result = await fetchChatgptBinaryWithClientForTest(
			client as never,
			"https://chatgpt.com/backend-api/artifact",
			{ scrapeTelemetry },
			100,
		);

		expect(result.buffer.toString("utf8")).toBe("artifact bytes");
		expect(result.contentType).toBe("text/plain");
		expect(result.contentDisposition).toBe('attachment; filename="artifact.txt"');
		expect(scrapeTelemetry.downloads).toEqual({
			attempted: 1,
			succeeded: 1,
			failed: 0,
		});
	});

	test.each([
		{
			shape: "object-shaped exception value",
			evaluation: {
				result: { type: "object", subtype: "error", value: {} },
				exceptionDetails: { text: "Uncaught (in promise) TypeError: Failed to fetch" },
			},
		},
		{
			shape: "missing by-value result",
			evaluation: {
				result: { type: "object", subtype: "error" },
				exceptionDetails: { text: "Uncaught (in promise) TypeError: Failed to fetch" },
			},
		},
	])("falls back to loaded resource content for $shape", async ({ evaluation }) => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
		const evaluate = vi.fn(async () => evaluation);
		const getResourceTree = vi.fn(async () => ({
			frameTree: {
				frame: { id: "frame-main" },
				resources: [
					{
						url: "https://themadpickler.com/cdn/shop/files/Honolulu_J2CR_Blue.jpg?v=1782685624",
						mimeType: "image/jpeg",
					},
				],
			},
		}));
		const getResourceContent = vi.fn(async () => ({
			content: imageBytes.toString("base64"),
			base64Encoded: true,
		}));
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
			Runtime: { evaluate },
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Page.
			Page: { getResourceTree, getResourceContent },
		};

		const result = await fetchChatgptBinaryWithClientForTest(
			client as never,
			"https://themadpickler.com/cdn/shop/files/Honolulu_J2CR_Blue.jpg?v=1782685624",
			{ scrapeTelemetry },
			100,
		);

		expect(result.buffer).toEqual(imageBytes);
		expect(result.contentType).toBe("image/jpeg");
		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(getResourceTree).toHaveBeenCalledTimes(1);
		expect(getResourceContent).toHaveBeenCalledWith({
			frameId: "frame-main",
			url: "https://themadpickler.com/cdn/shop/files/Honolulu_J2CR_Blue.jpg?v=1782685624",
		});
		expect(scrapeTelemetry.providerActions).toMatchObject({
			"chatgpt.fetchBinary": 1,
			"chatgpt.fetchBinaryResourceContent": 1,
		});
		expect(scrapeTelemetry.cdpCalls).toMatchObject({
			"Runtime.evaluate": 1,
			"Page.getResourceTree": 1,
			"Page.getResourceContent": 1,
		});
		expect(scrapeTelemetry.downloads).toEqual({
			attempted: 1,
			succeeded: 1,
			failed: 0,
		});
	});

	test("preserves an explicit non-success response without consulting loaded resources", async () => {
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const getResourceTree = vi.fn();
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
			Runtime: {
				evaluate: vi.fn(async () => ({ result: { value: { ok: false, status: 404 } } })),
			},
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Page.
			Page: { getResourceTree },
		};

		await expect(
			fetchChatgptBinaryWithClientForTest(
				client as never,
				"https://example.test/missing.jpg",
				{ scrapeTelemetry },
				100,
			),
		).rejects.toThrow("ChatGPT artifact binary fetch failed (status 404)");

		expect(getResourceTree).not.toHaveBeenCalled();
		expect(scrapeTelemetry.downloads).toEqual({
			attempted: 1,
			succeeded: 0,
			failed: 1,
		});
	});
});

async function runNativeConversationDownloadIdentityScenario(
	targetName: string,
	downloadedName: string,
): Promise<{
	result: Awaited<ReturnType<typeof downloadChatgptConversationFilesWithClientForTest>>;
	destinationBytes: Buffer | null;
	providerActions: Record<string, number>;
}> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-native-identity-"));
	const destPath = path.join(tempDir, targetName);
	const sourceBytes = Buffer.from("native identity scenario bytes\n", "utf8");
	const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
	let browserDownloadDir: string | null = null;
	const send = vi.fn(async (method: string, params?: Record<string, unknown>) => {
		if (method === "Browser.setDownloadBehavior" && typeof params?.downloadPath === "string") {
			browserDownloadDir = params.downloadPath;
		}
	});
	const evaluate = vi.fn(async (input: { expression?: string }) => {
		const expression = input.expression ?? "";
		if (expression.includes("captureDownloadResponse")) {
			if (browserDownloadDir) {
				await fs.writeFile(path.join(browserDownloadDir, downloadedName), sourceBytes);
			}
			return {
				result: {
					value: {
						ok: false,
						reason: "json_missing_download_url",
						tileMatched: true,
						viewerDownloadClicked: true,
						previewIdentityMatched: true,
						previewSurfaceCount: 1,
						previewDownloadControlCount: 1,
						fallbackAttempted: true,
						status: 403,
						endpointKind: "files-download",
						contentType: "application/json",
						providerError: { message: "Forbidden" },
					},
				},
			};
		}
		if (expression.includes("hasTurns")) {
			return { result: { value: { href: "https://chatgpt.com/c/native-identity" } } };
		}
		return { result: { value: [] } };
	});
	const file: FileRef = {
		id: `native-identity:turn:0:${targetName}`,
		name: targetName,
		provider: "chatgpt",
		source: "conversation",
		metadata: { providerFileId: "file_native_identity" },
	};

	try {
		const result = await downloadChatgptConversationFilesWithClientForTest(
			// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
			{ Runtime: { evaluate }, send } as never,
			"native-identity",
			[{ file, destPath }],
			null,
			undefined,
			{ scrapeTelemetry, preserveActiveTab: true },
		);
		return {
			result,
			destinationBytes: await fs.readFile(destPath).catch(() => null),
			providerActions: { ...scrapeTelemetry.providerActions },
		};
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
}

describe("downloadChatgptConversationFilesWithClient", () => {
	test("keeps waiting when a signed-content capture belongs to a neighboring file tile", () => {
		expect(
			classifyChatgptCapturedFileIdentityValuesForTest({
				capturedUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_neighbor",
				contentDisposition: 'attachment; filename="auracall-m5-20260802T185953Z(7).docx"',
				targetProviderFileId: "file_requested_txt",
				targetName: "auracall-m5-source-20260802T185953Z(7).txt",
			}),
		).toEqual({
			decision: "extensionMismatch",
			failure:
				"captured_asset_identity_mismatch: requested=auracall-m5-source-20260802T185953Z(7).txt response=auracall-m5-20260802T185953Z(7).docx",
		});
	});

	test("accepts exact, collision-suffixed, and provider-id-bound captures", () => {
		expect(
			classifyChatgptCapturedFileIdentityValuesForTest({
				capturedUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_requested",
				contentDisposition: 'attachment; filename="report.txt"',
				targetProviderFileId: "file_requested",
				targetName: "report.txt",
			}),
		).toEqual({ decision: "exactMatch", failure: null });
		expect(
			classifyChatgptCapturedFileIdentityValuesForTest({
				capturedUrl: "https://chatgpt.com/backend-api/estuary/content?id=file_requested",
				contentDisposition: 'attachment; filename="report.txt"',
				targetProviderFileId: "file_requested",
				targetName: "report(7).txt",
			}),
		).toEqual({ decision: "collisionSuffixMatch", failure: null });
		expect(
			classifyChatgptCapturedFileIdentityValuesForTest({
				capturedUrl: "https://chatgpt.com/backend-api/files/download/file_requested?inline=true",
				contentDisposition: 'attachment; filename="neighbor.docx"',
				targetProviderFileId: "file_requested",
				targetName: "report.txt",
			}),
		).toEqual({ decision: "providerFileIdMatch", failure: null });
	});

	test("accepts an unsuffixed captured response for a collision-suffixed catalog name", async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-chatgpt-captured-catalog-suffix-"),
		);
		const targetName = "auracall-m5-source-20260802T185953Z(7).txt";
		const responseName = "auracall-m5-source-20260802T185953Z.txt";
		const destPath = path.join(tempDir, targetName);
		const sourceBytes = Buffer.from("exact captured source bytes\n", "utf8");
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				return {
					result: {
						value: {
							ok: true,
							status: 200,
							url: "https://chatgpt.com/backend-api/estuary/content?id=file_other_identity",
							contentType: "text/plain",
							contentDisposition: `attachment; filename="${responseName}"`,
							byteLength: sourceBytes.byteLength,
							base64: sourceBytes.toString("base64"),
							captureTransport: "fetch",
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return { result: { value: { href: "https://chatgpt.com/c/captured-identity" } } };
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: `captured-identity:turn:0:${targetName}`,
			name: targetName,
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_captured_identity" },
		};

		try {
			const result = await downloadChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
				{ Runtime: { evaluate } } as never,
				"captured-identity",
				[{ file, destPath }],
				null,
				undefined,
				{ scrapeTelemetry, preserveActiveTab: true },
			);

			expect(result).toEqual([{ fileId: file.id, status: "materialized" }]);
			expect(await fs.readFile(destPath)).toEqual(sourceBytes);
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.downloadConversationFile.capturedIdentity.collisionSuffixMatch.v1": 1,
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test.each([
		{
			targetName: "uploaded-transcript.docx",
			responseName: "generated-exam.docx",
			decision: "stemMismatch",
		},
		{
			targetName: "auracall-m5-source-20260802T185953Z(7).txt",
			responseName: "auracall-m5-source-20260802T185953Z.pdf",
			decision: "extensionMismatch",
		},
	])("rejects a captured download on $decision", async ({ targetName, responseName, decision }) => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-file-identity-"));
		const destPath = path.join(tempDir, targetName);
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				return {
					result: {
						value: {
							ok: true,
							status: 200,
							url: "https://chatgpt.com/backend-api/estuary/content?id=file_generated_exam",
							contentType:
								"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
							contentDisposition: `attachment; filename="${responseName}"`,
							byteLength: 4,
							base64: Buffer.from("exam", "utf8").toString("base64"),
							captureTransport: "fetch",
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return {
					result: { value: { href: "https://chatgpt.com/c/conversation-file-identity" } },
				};
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: `conversation-file-identity:turn:0:${targetName}`,
			name: targetName,
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_uploaded_transcript" },
		};

		try {
			const result = await downloadChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
				{ Runtime: { evaluate } } as never,
				"conversation-file-identity",
				[{ file, destPath }],
				null,
				undefined,
				{ scrapeTelemetry, preserveActiveTab: true },
			);

			expect(result).toEqual([
				expect.objectContaining({
					fileId: file.id,
					status: "error",
					error: expect.stringContaining("captured_asset_identity_mismatch"),
				}),
			]);
			await expect(fs.stat(destPath)).rejects.toMatchObject({ code: "ENOENT" });
			expect(scrapeTelemetry.providerActions).toMatchObject({
				[`chatgpt.downloadConversationFile.capturedIdentity.${decision}.v1`]: 1,
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("scopes the preview Download control to the exact filename-labelled flyout", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-viewer-scope-"));
		const destPath = path.join(tempDir, "uploaded-transcript.docx");
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		let downloadExpression = "";
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				downloadExpression = expression;
				return {
					result: {
						value: {
							ok: true,
							status: 200,
							url: "https://chatgpt.com/backend-api/estuary/content?id=file_uploaded",
							contentDisposition: 'attachment; filename="uploaded-transcript.docx"',
							byteLength: 4,
							base64: Buffer.from("body", "utf8").toString("base64"),
							captureTransport: "fetch",
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return { result: { value: { href: "https://chatgpt.com/c/conversation-viewer-scope" } } };
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: "conversation-viewer-scope:turn:0:uploaded-transcript.docx",
			name: "uploaded-transcript.docx",
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_uploaded" },
		};

		try {
			await expect(
				downloadChatgptConversationFilesWithClientForTest(
					// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
					{ Runtime: { evaluate } } as never,
					"conversation-viewer-scope",
					[{ file, destPath }],
					null,
					undefined,
					{ scrapeTelemetry, preserveActiveTab: true },
				),
			).resolves.toEqual([{ fileId: file.id, status: "materialized" }]);
			expect(downloadExpression).toContain(
				'section[data-testid="screen-threadFlyOut"][aria-label]',
			);
			expect(downloadExpression).toContain(
				"normalize(node.getAttribute('aria-label')) === previewName",
			);
			expect(downloadExpression).toContain(
				"const previewName = normalize(match.tile.getAttribute('aria-label')) ||",
			);
			expect(downloadExpression).toContain("previewSurface.querySelectorAll");
			expect(downloadExpression).toContain('button[aria-label="Download"]');
			expect(downloadExpression).toContain("if (previewSurfaces.length !== 1)");
			expect(downloadExpression).toContain("if (controls.length !== 1) return false");
			expect(downloadExpression).toContain("previewIdentityPresentBeforeTileClick");
			expect(downloadExpression).toContain("previewObservationCount += 1");
			expect(downloadExpression).toContain(
				"previewScopedDownloadControlTotalCount = scopedControls.length",
			);
			expect(downloadExpression).toContain("globalDownloadControlCount = globalControls.length");
			expect(downloadExpression).toContain(
				"globalVisibleDownloadControlCount = globalControls.filter((node) => " +
					"isVisible(node)).length",
			);
			expect(downloadExpression).not.toContain("previewDownloadControlsBeforeTileClick");
			expect(downloadExpression).not.toContain("newPreviewDownloadControls");
			expect(downloadExpression).not.toContain(
				"Array.from(document.querySelectorAll('button, [role=\"button\"], a'))",
			);
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.downloadConversationFile.capturedIdentity.exactMatch.v1": 1,
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("preserves bounded preview lifecycle evidence when source transfer fails", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-preview-evidence-"));
		const file: FileRef = {
			id: "conversation-preview-evidence:turn:0:uploaded-source.txt",
			name: "uploaded-source.txt",
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_uploaded_source" },
		};
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				return {
					result: {
						value: {
							ok: false,
							reason: "json_missing_download_url",
							tileMatched: true,
							fallbackAttempted: true,
							status: 403,
							endpointKind: "files-download",
							contentType: "application/json",
							previewIdentityMatched: true,
							previewIdentityPresentBeforeTileClick: false,
							previewSurfaceCount: 1,
							previewObservationCount: 42,
							previewDownloadControlCount: 0,
							previewScopedDownloadControlTotalCount: 1,
							globalDownloadControlCount: 1,
							globalVisibleDownloadControlCount: 0,
							providerError: { message: "Forbidden" },
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return {
					result: { value: { href: "https://chatgpt.com/c/conversation-preview-evidence" } },
				};
			}
			return { result: { value: [] } };
		});

		try {
			const [result] = await downloadChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
				{ Runtime: { evaluate } } as never,
				"conversation-preview-evidence",
				[{ file, destPath: path.join(tempDir, file.name) }],
				null,
				undefined,
				{ preserveActiveTab: true },
			);

			expect(result.status).toBe("error");
			if (result.status !== "error") throw new Error("expected failed source transfer");
			expect(result.fileId).toBe(file.id);
			expect(result.error).toContain('"previewIdentityPresentBeforeTileClick":false');
			expect(result.error).toContain('"previewObservationCount":42');
			expect(result.error).toContain('"previewScopedDownloadControlTotalCount":1');
			expect(result.error).toContain('"globalDownloadControlCount":1');
			expect(result.error).toContain('"globalVisibleDownloadControlCount":0');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("accepts a files-download JSON string as the signed download URL", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-json-string-url-"));
		const destPath = path.join(tempDir, "uploaded-transcript.docx");
		let downloadExpression = "";
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				downloadExpression = expression;
				return {
					result: {
						value: {
							ok: false,
							reason: "json_missing_download_url",
							status: 200,
							endpointKind: "files-download",
							contentType: "application/json",
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return {
					result: { value: { href: "https://chatgpt.com/c/conversation-json-string-url" } },
				};
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: "conversation-json-string-url:turn:0:uploaded-transcript.docx",
			name: "uploaded-transcript.docx",
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_uploaded" },
		};

		try {
			await downloadChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
				{ Runtime: { evaluate } } as never,
				"conversation-json-string-url",
				[{ file, destPath }],
				null,
				undefined,
				{ preserveActiveTab: true },
			);

			expect(
				resolveChatgptDownloadUrlFromJson(
					" https://files.oaiusercontent.com/file-uploaded?sig=bounded ",
				),
			).toBe("https://files.oaiusercontent.com/file-uploaded?sig=bounded");
			expect(
				resolveChatgptDownloadUrlFromJson({
					data: { signed_url: "/backend-api/estuary/content?id=file_uploaded" },
				}),
			).toBe("https://chatgpt.com/backend-api/estuary/content?id=file_uploaded");
			expect(resolveChatgptDownloadUrlFromJson({ detail: "File not found" })).toBeNull();
			expect(downloadExpression).toContain("resolveChatgptDownloadUrlFromJson");
			expect(downloadExpression).toContain("summarizeChatgptDownloadJsonShape");
			expect(downloadExpression).toContain("summarizeChatgptDownloadProviderError");
			expect(downloadExpression).toContain("selectChatgptDownloadFailure");
			expect(downloadExpression).toContain("classifyCapturedFileIdentity");
			expect(downloadExpression).toContain("candidate.ok && !identity?.failure");
			expect(downloadExpression).toContain("waitForChatgptCaptureProgress");
			expect(downloadExpression).toContain("awaitChatgptDownloadPromiseWithTimeout");
			expect(downloadExpression).toContain("'signed-follow-fetch'");
			expect(downloadExpression).toContain("'signed-follow-body'");
			expect(downloadExpression).toContain("'direct-fetch'");
			expect(downloadExpression).toContain("'anchor-fetch'");
			expect(downloadExpression).toContain(
				"waitForCaptureProgress(capturePromises, deadline - Date.now(), 250)",
			);
			expect(downloadExpression).not.toContain("await Promise.allSettled(capturePromises)");
			expect(downloadExpression).toContain("responseShape: summarizeDownloadJsonShape(json)");
			expect(downloadExpression).toContain(
				"resolveDownloadUrlFromJson(json, window.location.href)",
			);
			expect(() => new Function(`return ${downloadExpression}`)).not.toThrow();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("preserves bounded JSON shape evidence when a download URL is not resolved", () => {
		expect(
			summarizeChatgptDownloadJsonShape({
				payload: { temporary_link: "https://secret.example/download?token=do-not-persist" },
				request_id: "private-request-id",
			}),
		).toEqual({
			kind: "object",
			keys: ["payload", "request_id"],
			valueKinds: { payload: "object", request_id: "string" },
			children: {
				payload: {
					kind: "object",
					keys: ["temporary_link"],
					valueKinds: { temporary_link: "string" },
				},
			},
		});
		expect(
			JSON.stringify(summarizeChatgptDownloadJsonShape({ url: "?token=secret" })),
		).not.toContain("secret");
	});

	test("normalizes the live snake-case file-not-found download envelope", () => {
		const providerError = summarizeChatgptDownloadProviderError({
			error_code: "file_not_found",
			error_type: "GetDownloadLinkError",
			status: "error",
			error_message: null,
		});
		expect(providerError).toEqual({
			code: "file_not_found",
			type: "GetDownloadLinkError",
			status: "error",
		});
		const error = new Error("ChatGPT conversation file fetch failed") as Error & {
			retrievalDiagnostics?: Record<string, unknown>;
		};
		error.retrievalDiagnostics = { status: 200, providerError };
		expect(classifyChatgptFileRetrievalFailure(error)).toEqual({
			failureKind: "provider_unavailable",
			retryable: false,
		});
	});

	test("distinguishes provider-confirmed file unavailability from retrieval failure", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-unavailable-"));
		const file: FileRef = {
			id: "conversation-unavailable:turn:0:deleted-upload.docx",
			name: "deleted-upload.docx",
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_deleted_upload" },
		};
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				return {
					result: {
						value: {
							ok: false,
							reason: "json_missing_download_url",
							status: 404,
							endpointKind: "files-download",
							contentType: "application/json",
							providerError: { detail: "File not found or no longer available." },
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return { result: { value: { href: "https://chatgpt.com/c/conversation-unavailable" } } };
			}
			return { result: { value: [] } };
		});

		try {
			await expect(
				downloadChatgptConversationFilesWithClientForTest(
					// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
					{ Runtime: { evaluate } } as never,
					"conversation-unavailable",
					[{ file, destPath: path.join(tempDir, file.name) }],
					null,
					undefined,
					{ preserveActiveTab: true },
				),
			).resolves.toEqual([
				expect.objectContaining({
					fileId: file.id,
					status: "error",
					failureKind: "provider_unavailable",
					retryable: false,
				}),
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("classifies structured provider unavailability independent of phrase order", () => {
		const unavailable = new Error("ChatGPT conversation file fetch failed") as Error & {
			retrievalDiagnostics?: Record<string, unknown>;
		};
		unavailable.retrievalDiagnostics = {
			status: 403,
			providerError: { detail: "Not found: requested file was deleted." },
		};
		expect(classifyChatgptFileRetrievalFailure(unavailable)).toEqual({
			failureKind: "provider_unavailable",
			retryable: false,
		});

		const denied = new Error("ChatGPT conversation file fetch failed") as Error & {
			retrievalDiagnostics?: Record<string, unknown>;
		};
		denied.retrievalDiagnostics = {
			status: 403,
			providerError: { detail: "Access denied for this request." },
		};
		expect(classifyChatgptFileRetrievalFailure(denied)).toEqual({
			failureKind: "retrieval_failed",
			retryable: false,
		});
	});

	test("retains provider-confirmed failure evidence over a later generic fallback", () => {
		const unavailable = {
			reason: "download_response_not_ok",
			status: 403,
			providerError: { detail: "Requested file is no longer available." },
		};
		const generic = {
			reason: "json_missing_download_url",
			status: 200,
			responseShape: { kind: "object", keys: [] },
		};
		expect(selectChatgptDownloadFailure(unavailable, generic)).toBe(unavailable);
		expect(selectChatgptDownloadFailure(generic, unavailable)).toBe(unavailable);
	});

	test("keeps the capture poll deadline reachable when an intercepted response hangs", async () => {
		const startedAt = Date.now();
		await waitForChatgptCaptureProgress([new Promise<never>(() => undefined)], 5, 5);
		expect(Date.now() - startedAt).toBeLessThan(100);
	});

	test("yields for the bounded poll interval when no capture is pending", async () => {
		vi.useFakeTimers();
		try {
			let settled = false;
			const wait = waitForChatgptCaptureProgress([], 25, 25).then(() => {
				settled = true;
			});

			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toBe(false);

			await vi.advanceTimersByTimeAsync(24);
			expect(settled).toBe(false);

			await vi.advanceTimersByTimeAsync(1);
			await wait;
			expect(settled).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	test("bounds stalled download stages without changing prompt results", async () => {
		await expect(
			awaitChatgptDownloadPromiseWithTimeout(
				new Promise<never>(() => undefined),
				5,
				"signed-follow-fetch",
			),
		).rejects.toThrow("chatgpt_download_timeout:signed-follow-fetch:5ms");
		await expect(
			awaitChatgptDownloadPromiseWithTimeout(Promise.resolve("ok"), 100, "direct-fetch"),
		).resolves.toBe("ok");
	});

	test("materializes an uploaded file when its preview Download control uses the browser download manager", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-native-download-"));
		const destPath = path.join(tempDir, "auracall-m5-source-20260802T185953Z.txt");
		const sourceBytes = Buffer.from("exact uploaded source bytes\n", "utf8");
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		let browserDownloadDir: string | null = null;
		const send = vi.fn(async (method: string, params?: Record<string, unknown>) => {
			if (method === "Browser.setDownloadBehavior" && typeof params?.downloadPath === "string") {
				browserDownloadDir = params.downloadPath;
			}
		});
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				if (browserDownloadDir) {
					await fs.writeFile(
						path.join(browserDownloadDir, "auracall-m5-source-20260802T185953Z(1).txt"),
						sourceBytes,
					);
				}
				return {
					result: {
						value: {
							ok: false,
							reason: "json_missing_download_url",
							tileMatched: true,
							viewerDownloadClicked: true,
							previewIdentityMatched: true,
							previewSurfaceCount: 1,
							previewDownloadControlCount: 1,
							fallbackAttempted: true,
							status: 403,
							endpointKind: "files-download",
							contentType: "application/json",
							providerError: { message: "Forbidden" },
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return { result: { value: { href: "https://chatgpt.com/c/conversation-native" } } };
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: "conversation-native:turn:0:auracall-m5-source-20260802T185953Z.txt",
			name: "auracall-m5-source-20260802T185953Z.txt",
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_native_upload" },
		};

		try {
			await expect(
				downloadChatgptConversationFilesWithClientForTest(
					// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
					{ Runtime: { evaluate }, send } as never,
					"conversation-native",
					[{ file, destPath }],
					null,
					undefined,
					{ scrapeTelemetry, preserveActiveTab: true },
				),
			).resolves.toEqual([{ fileId: file.id, status: "materialized" }]);
			expect(send).toHaveBeenCalledWith(
				"Browser.setDownloadBehavior",
				expect.objectContaining({ behavior: "allow", eventsEnabled: true }),
			);
			expect(await fs.readFile(destPath)).toEqual(sourceBytes);
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.downloadConversationFile.preview.exactFlyout": 1,
				"chatgpt.downloadConversationFile.viewerDownload": 1,
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test("accepts an unsuffixed native download for a collision-suffixed catalog name", async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "auracall-chatgpt-native-catalog-suffix-"),
		);
		const targetName = "auracall-m5-source-20260802T185953Z(6).txt";
		const downloadedName = "auracall-m5-source-20260802T185953Z.txt";
		const destPath = path.join(tempDir, targetName);
		const sourceBytes = Buffer.from("exact uploaded source bytes\n", "utf8");
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		let browserDownloadDir: string | null = null;
		const send = vi.fn(async (method: string, params?: Record<string, unknown>) => {
			if (method === "Browser.setDownloadBehavior" && typeof params?.downloadPath === "string") {
				browserDownloadDir = params.downloadPath;
			}
		});
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			if (expression.includes("captureDownloadResponse")) {
				if (browserDownloadDir) {
					await fs.writeFile(path.join(browserDownloadDir, downloadedName), sourceBytes);
				}
				return {
					result: {
						value: {
							ok: false,
							reason: "json_missing_download_url",
							tileMatched: true,
							viewerDownloadClicked: true,
							previewIdentityMatched: true,
							previewSurfaceCount: 1,
							previewDownloadControlCount: 1,
							fallbackAttempted: true,
							status: 403,
							endpointKind: "files-download",
							contentType: "application/json",
							providerError: { message: "Forbidden" },
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return {
					result: { value: { href: "https://chatgpt.com/c/conversation-native-suffix" } },
				};
			}
			return { result: { value: [] } };
		});
		const file: FileRef = {
			id: `conversation-native-suffix:turn:0:${targetName}`,
			name: targetName,
			provider: "chatgpt",
			source: "conversation",
			metadata: { providerFileId: "file_native_upload_suffix" },
		};

		try {
			await expect(
				downloadChatgptConversationFilesWithClientForTest(
					// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
					{ Runtime: { evaluate }, send } as never,
					"conversation-native-suffix",
					[{ file, destPath }],
					null,
					undefined,
					{ scrapeTelemetry, preserveActiveTab: true },
				),
			).resolves.toEqual([{ fileId: file.id, status: "materialized" }]);
			expect(await fs.readFile(destPath)).toEqual(sourceBytes);
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.downloadConversationFile.nativeIdentity.collisionSuffixMatch.v1": 1,
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test.each([
		{
			targetName: "auracall-m5-source-20260802T185953Z(6).txt",
			downloadedName: "unrelated-source-20260802T185953Z.txt",
			decision: "stemMismatch",
		},
		{
			targetName: "auracall-m5-source-20260802T185953Z(6).txt",
			downloadedName: "auracall-m5-source-20260802T185953Z.pdf",
			decision: "extensionMismatch",
		},
	])("rejects a native download on $decision", async ({ targetName, downloadedName, decision }) => {
		const outcome = await runNativeConversationDownloadIdentityScenario(targetName, downloadedName);

		expect(outcome.result).toEqual([
			expect.objectContaining({
				fileId: `native-identity:turn:0:${targetName}`,
				status: "error",
				error: expect.stringContaining("captured_asset_identity_mismatch"),
			}),
		]);
		expect(outcome.destinationBytes).toBeNull();
		expect(outcome.providerActions).toMatchObject({
			[`chatgpt.downloadConversationFile.nativeIdentity.${decision}.v1`]: 1,
		});
	});

	test("records an exact native download identity decision", async () => {
		const fileName = "auracall-m5-source-20260802T185953Z.txt";
		const outcome = await runNativeConversationDownloadIdentityScenario(fileName, fileName);

		expect(outcome.result).toEqual([
			{ fileId: `native-identity:turn:0:${fileName}`, status: "materialized" },
		]);
		expect(outcome.destinationBytes?.toString("utf8")).toBe("native identity scenario bytes\n");
		expect(outcome.providerActions).toMatchObject({
			"chatgpt.downloadConversationFile.nativeIdentity.exactMatch.v1": 1,
		});
	});

	test("checks readiness once and sequentially downloads twelve files on one client", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-batch-"));
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
		const expressions: string[] = [];
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			const expression = input.expression ?? "";
			expressions.push(expression);
			if (expression.includes("captureDownloadResponse")) {
				const providerFileId = expression.match(/file_\d+/)?.[0] ?? "unknown";
				return {
					result: {
						value: {
							ok: true,
							status: 200,
							url: `https://chatgpt.com/backend-api/files/download/${providerFileId}`,
							byteLength: 4,
							base64: Buffer.from("body", "utf8").toString("base64"),
						},
					},
				};
			}
			if (expression.includes("hasTurns")) {
				return {
					result: { value: { href: "https://chatgpt.com/c/conversation-batch" } },
				};
			}
			return { result: { value: [] } };
		});
		const items = Array.from({ length: 12 }, (_, index) => {
			const file: FileRef = {
				id: `conversation-batch:turn:${index}:asset-${index}.txt`,
				name: `asset-${index}.txt`,
				provider: "chatgpt",
				source: "conversation",
				metadata: { providerFileId: `file_${index}` },
			};
			return { file, destPath: path.join(tempDir, file.name) };
		});

		try {
			const results = await downloadChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP client shape uses Runtime.
				{ Runtime: { evaluate } } as never,
				"conversation-batch",
				items,
				null,
				undefined,
				{ scrapeTelemetry, preserveActiveTab: true },
			);

			expect(results).toEqual(
				items.map((item) => ({ fileId: item.file.id, status: "materialized" })),
			);
			const readinessExpressions = expressions.filter((expression) =>
				expression.includes("hasTurns"),
			);
			const downloadExpressions = expressions.filter((expression) =>
				expression.includes("captureDownloadResponse"),
			);
			expect(readinessExpressions).toHaveLength(1);
			expect(downloadExpressions).toHaveLength(12);
			for (const expression of downloadExpressions) {
				expect(expression.indexOf("target.click();")).toBeLessThan(
					expression.lastIndexOf("const direct = await tryDirectProviderFileDownload"),
				);
				expect(expression.indexOf("HTMLAnchorElement.prototype.click = function")).toBeLessThan(
					expression.indexOf("target.click();"),
				);
				expect(expression).toContain("capturedNavigationUrl = href");
				expect(expression).toContain("const clickViewerDownload = () =>");
				expect(expression).toContain('section[data-testid="screen-threadFlyOut"][aria-label]');
				expect(expression).toContain("previewSurface.querySelectorAll");
				expect(expression).toContain("viewerDownloadClicked = clickViewerDownload()");
				expect(expression).toContain("const response = await fetchWithTimeout(");
				expect(expression).toContain("recordCaptureCandidate(candidate, 'anchor')");
				expect(expression).toContain("recordCaptureCandidate(candidate, 'fetch')");
				expect(expression).toContain("recordCaptureCandidate(direct.value, 'direct')");
				expect(expression).toContain(
					"const isSignedContent = /\\/backend-api\\/estuary\\/content/.test(text)",
				);
				expect(expression).toContain("if (candidate.ok && !identity?.failure) {");
				expect(expression).toContain("identity?.failure");
				expect(expression).toContain("HTMLAnchorElement.prototype.click = originalAnchorClick");
				expect(expression).toContain("window.open = originalWindowOpen");
				expect(expression).toContain("providerErrorShape");
				expect(expression).toContain("endpointKind");
				expect(expression).toContain("tileMatched");
			}
			expect(scrapeTelemetry.providerActions).toMatchObject({
				"chatgpt.downloadConversationFile": 12,
				"chatgpt.downloadConversationFile.capturedIdentity.providerFileIdMatch.v1": 12,
			});
			for (const item of items) {
				expect(await fs.readFile(item.destPath, "utf8")).toBe("body");
			}
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

describe("beforeChatgptBrowserInteraction", () => {
	test("does not double-admit an action owned by the provider traffic governor", async () => {
		const beforeInteraction = vi.fn(async () => undefined);

		await beforeChatgptBrowserInteractionForTest(
			{
				interactionGovernor: { beforeInteraction },
				providerTrafficGovernor: { attribution: {} as never, begin: vi.fn() },
			},
			"renavigation",
		);

		expect(beforeInteraction).not.toHaveBeenCalled();
	});

	test("does not reapply conversation-read pacing inside a scoped provider session", async () => {
		const beforeInteraction = vi.fn(async () => undefined);
		const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();

		await beforeChatgptBrowserInteractionForTest(
			{
				useProviderSession: true,
				scrapeTelemetry,
				providerSession: {
					providerId: "chatgpt",
					key: "chatgpt:127.0.0.1:9222:https://chatgpt.com/c/conv",
					value: {},
					close: vi.fn(),
				},
				interactionGovernor: { beforeInteraction },
			},
			"conversation-read",
		);

		expect(beforeInteraction).not.toHaveBeenCalled();
		expect(scrapeTelemetry.providerActions).toMatchObject({
			"chatgpt.skipScopedInteractionGovernor": 1,
		});
	});

	test("keeps pacing for the first conversation-read before a session exists", async () => {
		const beforeInteraction = vi.fn(async () => undefined);

		await beforeChatgptBrowserInteractionForTest(
			{
				useProviderSession: true,
				interactionGovernor: { beforeInteraction },
			},
			"conversation-read",
		);

		expect(beforeInteraction).toHaveBeenCalledWith("conversation-read");
	});

	test("binds fallback pacing to the active context-read abort signal", async () => {
		const beforeInteraction = vi.fn(async () => undefined);
		const abortController = new AbortController();

		await beforeChatgptBrowserInteractionForTest(
			{
				interactionGovernor: { beforeInteraction },
				abortSignal: abortController.signal,
			},
			"renavigation",
		);

		expect(beforeInteraction).toHaveBeenCalledWith("renavigation", abortController.signal);
	});
});

describe("isChatgptTargetReusableForPreferredUrl", () => {
	test("does not reuse running conversation tabs for root/library requests", () => {
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/library",
			),
		).toBe(false);
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/",
			),
		).toBe(false);
	});

	test("allows exact conversation reuse only for the matching conversation request", () => {
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
			),
		).toBe(true);
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/c/6a0a69aa-1f5c-83ea-bcdc-692457c7e212",
			),
		).toBe(false);
	});
});

describe("filterChatgptDeepResearchTargets", () => {
	test("keeps only Deep Research iframe targets embedded in the active page", () => {
		const activeFrameUrl = "https://chatgpt.com/backend-api/deep_research/report-active?token=1";
		const staleFrameUrl = "https://chatgpt.com/backend-api/deep_research/report-stale?token=2";
		const targets = [
			{
				type: "iframe",
				id: "active-frame",
				title: "Deep Research",
				url: activeFrameUrl,
			},
			{
				type: "iframe",
				id: "stale-frame",
				title: "Deep Research",
				url: staleFrameUrl,
			},
			{
				type: "page",
				id: "page-target",
				title: "ChatGPT",
				url: "https://chatgpt.com/c/6a09ccc6-7576-439e-896e-10f9feae6ab5",
			},
		] as Parameters<typeof filterChatgptDeepResearchTargets>[0];

		expect(
			filterChatgptDeepResearchTargets(targets, new Set([activeFrameUrl])).map(
				(target) => target.id,
			),
		).toEqual(["active-frame"]);
		expect(
			filterChatgptDeepResearchTargets(targets, new Set([activeFrameUrl]), {
				expectedTargetId: "stale-frame",
			}),
		).toEqual([]);
	});
});

describe("normalizeChatgptLibraryItemProbes", () => {
	test("uses provider UUIDs and dedupes duplicated library entries", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "Research appendix.pdf",
				href: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				kind: "file",
				text: "Research appendix.pdf PDF",
			},
			{
				title: "Research appendix.pdf",
				href: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				kind: "download",
				text: "Research appendix.pdf Download",
			},
			{
				title: "Market model.xlsx",
				href: "https://chatgpt.com/library/artifacts/223e4567-e89b-12d3-a456-426614174111",
				kind: "spreadsheet",
				text: "Market model.xlsx Spreadsheet",
			},
		]);

		expect(inventory.files.map((file) => file.id)).toEqual([
			"123e4567-e89b-12d3-a456-426614174000",
			"223e4567-e89b-12d3-a456-426614174111",
		]);
		expect(inventory.files[0]).toMatchObject({
			name: "Research appendix.pdf",
			provider: "chatgpt",
			source: "account",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				libraryIdentitySource: "provider-uuid",
				libraryRouteKind: "library_file_detail",
				libraryRouteUrl: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				artifactId: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
				artifactKind: "download",
			},
		});
		expect(inventory.artifacts).toMatchObject([
			{
				id: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
				title: "Research appendix.pdf",
				kind: "download",
			},
			{
				id: "chatgpt-library:223e4567-e89b-12d3-a456-426614174111",
				title: "Market model.xlsx",
				kind: "spreadsheet",
			},
		]);
	});

	test("creates stable UUID-shaped IDs when the library item has no provider UUID", () => {
		const first = normalizeChatgptLibraryItemProbes([
			{
				title: "Untitled canvas",
				href: "https://chatgpt.com/library/canvas/local-route",
				kind: "canvas",
			},
		]);
		const second = normalizeChatgptLibraryItemProbes([
			{
				title: "Untitled canvas",
				href: "https://chatgpt.com/library/canvas/local-route",
				kind: "canvas",
			},
		]);

		expect(first.files[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(second.files[0]?.id).toBe(first.files[0]?.id);
		expect(first.artifacts[0]).toMatchObject({
			id: `chatgpt-library:${first.files[0]?.id}`,
			kind: "canvas",
			metadata: {
				libraryRouteKind: "library_canvas_detail",
				libraryRouteUrl: "https://chatgpt.com/library/canvas/local-route",
			},
		});
	});

	test("uses ChatGPT Library row file ids for account-file retrieval", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "2026-05-15 GreenKey whitepaper.pdf",
				testId: "artifact-checkbox-bridge-file_00000000fa5871fbaa5ba6f3e05d99f6",
				ariaLabel: "Select 2026-05-15 GreenKey whitepaper.pdf",
				providerFileId: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryFileId: "libfile_ea646b8add488191959d6333f4a6ef9b",
			},
		]);

		expect(inventory.files).toHaveLength(1);
		expect(inventory.files[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(inventory.files[0]).toMatchObject({
			name: "2026-05-15 GreenKey whitepaper.pdf",
			provider: "chatgpt",
			source: "account",
			remoteUrl: "chatgpt://file/file_00000000fa5871fbaa5ba6f3e05d99f6",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				libraryIdentity: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryIdentitySource: "provider-file-id",
				libraryRouteKind: "library_file_detail",
				libraryRouteUrl:
					"https://chatgpt.com/library/files/libfile_ea646b8add488191959d6333f4a6ef9b",
				providerFileId: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryFileId: "libfile_ea646b8add488191959d6333f4a6ef9b",
				materializationSurface: "chatgpt-library-file-row-click",
			},
		});
	});

	test("classifies conversation links as detail routes rather than downloads", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "File creation request",
				href: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
				kind: "download",
			},
		]);

		expect(inventory.files[0]).toMatchObject({
			name: "File creation request",
			remoteUrl: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
			metadata: {
				libraryRouteKind: "conversation_detail",
				libraryRouteUrl: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
			},
		});
	});

	test("drops library page chrome while preserving decoded file titles", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "Skip to content",
				href: "https://chatgpt.com/library#main",
			},
			{
				title: "Library",
				href: "https://chatgpt.com/library",
				testId: "sidebar-item-recall",
			},
			{
				title: "ChE%204470%20Exam.docx",
				kind: "file",
			},
		]);

		expect(inventory.files).toHaveLength(1);
		expect(inventory.files[0]).toMatchObject({
			name: "ChE 4470 Exam.docx",
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
	});
});

describe("extractChatgptProjectIdFromUrl", () => {
	test("returns the project id for concrete project URLs", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/project",
			),
		).toBe("g-p-68c1a5feea188191809eb91ef1f14c3b");
	});

	test("returns the project id for project conversation URLs", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("g-p-68c1a5feea188191809eb91ef1f14c3b");
	});

	test("keeps bare project ids unchanged", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
			),
		).toBe("g-p-69c851be8cc88191afe109bea1b2a28d");
	});

	test("returns null for non-project urls", () => {
		expect(
			extractChatgptProjectIdFromUrl("https://chatgpt.com/c/69c80cee-440c-8333-8369-c36b99382172"),
		).toBeNull();
	});

	test("returns null for malformed project routes without a canonical g-p id", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/AuraCall%20Cache%20Identity%20Probe%201774743669/project",
			),
		).toBeNull();
	});
});

describe("extractChatgptConversationIdFromUrl", () => {
	test("returns the conversation id for root conversation URLs", () => {
		expect(
			extractChatgptConversationIdFromUrl(
				"https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
			),
		).toBe("69c93b5d-e6b0-8332-8c20-da466cc863da");
	});

	test("returns the conversation id for project conversation URLs", () => {
		expect(
			extractChatgptConversationIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("69c73884-2fb0-832f-8acc-c043e5002222");
	});
});

describe("normalizeChatgptConversationId", () => {
	test("keeps bare root conversation ids unchanged", () => {
		expect(normalizeChatgptConversationId("69c9a282-91a4-832e-b8c0-21fa595a24a9")).toBe(
			"69c9a282-91a4-832e-b8c0-21fa595a24a9",
		);
	});

	test("extracts ids from root and project conversation urls", () => {
		expect(
			normalizeChatgptConversationId("https://chatgpt.com/c/69c9a282-91a4-832e-b8c0-21fa595a24a9"),
		).toBe("69c9a282-91a4-832e-b8c0-21fa595a24a9");
		expect(
			normalizeChatgptConversationId(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("69c73884-2fb0-832f-8acc-c043e5002222");
	});

	test("rejects non-conversation selectors", () => {
		expect(normalizeChatgptConversationId("ChatGPT ACCEPT BASE")).toBeNull();
		expect(
			normalizeChatgptConversationId(
				"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
			),
		).toBeNull();
	});
});

describe("normalizeChatgptProjectId", () => {
	test("keeps bare ids unchanged and strips slug suffixes", () => {
		expect(normalizeChatgptProjectId("g-p-69c859e5d5b48191af37847a03153475")).toBe(
			"g-p-69c859e5d5b48191af37847a03153475",
		);
		expect(normalizeChatgptProjectId("g-p-69c859e5d5b48191af37847a03153475-oracle")).toBe(
			"g-p-69c859e5d5b48191af37847a03153475",
		);
		expect(normalizeChatgptProjectId("133ad4c5-b857-4a30-bf17-d951db57c33f")).toBe(
			"133ad4c5-b857-4a30-bf17-d951db57c33f",
		);
	});

	test("rejects non-canonical project ids", () => {
		expect(normalizeChatgptProjectId("AuraCall Cache Identity Probe 1774743669")).toBeNull();
		expect(
			normalizeChatgptProjectId("AuraCall%20Cache%20Identity%20Probe%201774743669"),
		).toBeNull();
	});
});

describe("findChatgptProjectByName", () => {
	test("matches projects by normalized exact name", () => {
		expect(
			findChatgptProjectByName(
				[
					{
						id: "g-p-1-reviewer",
						name: "Reviewer",
						url: "https://chatgpt.com/g/g-p-1-reviewer/project",
					},
					{
						id: "g-p-2-auracall-cedar",
						name: "  AuraCall   Cedar Harbor  ",
						url: "https://chatgpt.com/g/g-p-2-auracall-cedar/project",
					},
				],
				"AuraCall Cedar Harbor",
			),
		).toEqual({
			id: "g-p-2-auracall-cedar",
			name: "  AuraCall   Cedar Harbor  ",
			url: "https://chatgpt.com/g/g-p-2-auracall-cedar/project",
		});
	});
});

describe("resolveChatgptProjectMemoryLabel", () => {
	test("maps global mode to the ChatGPT Default label", () => {
		expect(resolveChatgptProjectMemoryLabel("global")).toBe("Default");
	});

	test("maps project mode to the ChatGPT Project-only label", () => {
		expect(resolveChatgptProjectMemoryLabel("project")).toBe("Project-only");
	});

	test("keeps tolerant candidates for current menuitem-based project memory selector", () => {
		expect(resolveChatgptProjectMemoryLabelCandidates("global")).toEqual(
			expect.arrayContaining(["Default", "Default memory"]),
		);
		expect(resolveChatgptProjectMemoryLabelCandidates("project")).toEqual(
			expect.arrayContaining(["Project-only", "Project only", "Project-only memory"]),
		);
	});
});

describe("resolveChatgptProjectSettingsCommitLabelsForTest", () => {
	test("uses manifest-owned project settings commit button labels", () => {
		expect(resolveChatgptProjectSettingsCommitLabelsForTest()).toEqual(
			expect.arrayContaining(["save", "save changes", "done", "apply"]),
		);
	});
});

describe("resolveChatgptProjectCreateConfirmLabelsForTest", () => {
	test("uses manifest-owned create-project confirm button labels", () => {
		expect(resolveChatgptProjectCreateConfirmLabelsForTest()).toEqual(
			expect.arrayContaining(["create project", "create", "continue"]),
		);
	});
});

describe("buildChatgptCreateProjectDialogStateExpressionForTest", () => {
	test("recognizes the current create-project modal selectors", () => {
		const expression = buildChatgptCreateProjectDialogStateExpressionForTest();

		expect(expression).toContain('input[name=\\"projectName\\"]');
		expect(expression).toContain("create project");
		expect(expression).toContain("projectName");
		expect(expression).toContain("closeButtonLabels");
	});
});

describe("resolveChatgptProjectSourceUploadActionLabelsForTest", () => {
	test("uses manifest-owned project source upload action labels", () => {
		expect(resolveChatgptProjectSourceUploadActionLabelsForTest()).toEqual(
			expect.arrayContaining(["upload", "browse", "upload file"]),
		);
	});
});

describe("resolveChatgptProjectUrl", () => {
	test("builds project routes from the service manifest template", () => {
		expect(resolveChatgptProjectUrl("g-p-69c851be8cc88191afe109bea1b2a28d")).toBe(
			"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
		);
		expect(resolveChatgptProjectUrl("133ad4c5-b857-4a30-bf17-d951db57c33f")).toBe(
			"https://chatgpt.com/g/133ad4c5-b857-4a30-bf17-d951db57c33f/project",
		);
	});
});

describe("classifyChatgptBlockingSurfaceProbe", () => {
	test("classifies rate limit surfaces", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Too many requests. You are making requests too quickly. Please try again later.",
			}),
		).toEqual({
			kind: "rate-limit",
			summary: "Too many requests.",
		});
	});

	test("classifies connection failures", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Server connection failed. Please check your network and try again.",
			}),
		).toEqual({
			kind: "connection-failed",
			summary: "Server connection failed.",
		});
	});

	test.each([
		"Regenerate",
		"Regenerate response",
		"Continue generating",
	])("does not classify the normal %s control as a failed turn", (buttonLabel) => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Completed proposal with generated files",
				buttonLabels: [buttonLabel],
			}),
		).toBeNull();
	});

	test("classifies retry affordances on failed chat turns", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Server connection failed.",
				buttonLabels: ["Retry"],
			}),
		).toEqual({
			kind: "retry-affordance",
			summary: "retry",
		});
	});

	test("classifies generic transient error surfaces", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Something went wrong while generating the response. Please try again.",
			}),
		).toEqual({
			kind: "transient-error",
			summary: "Something went wrong while generating the response.",
		});
	});
});

describe("isChatgptAccountMirrorHardStop", () => {
	test("hard-stops account-mirror rate limits without disabling ordinary recovery", () => {
		const rateLimit = { kind: "rate-limit" as const, summary: "Too many requests." };
		const connectionFailure = {
			kind: "connection-failed" as const,
			summary: "Server connection failed.",
		};

		expect(isChatgptAccountMirrorHardStopForTest(rateLimit, { accountMirrorInventory: true })).toBe(
			true,
		);
		expect(isChatgptAccountMirrorHardStopForTest(rateLimit, undefined)).toBe(false);
		expect(
			isChatgptAccountMirrorHardStopForTest(connectionFailure, {
				accountMirrorInventory: true,
			}),
		).toBe(false);
	});
});

describe("isRetryableChatgptTransientMessage", () => {
	test("treats known transient ChatGPT failures as retryable", () => {
		expect(isRetryableChatgptTransientMessage("Server connection failed.")).toBe(true);
		expect(isRetryableChatgptTransientMessage("Something went wrong. Please try again.")).toBe(
			true,
		);
		expect(isRetryableChatgptTransientMessage("Too many requests.")).toBe(true);
	});

	test("does not mark unrelated text as retryable", () => {
		expect(isRetryableChatgptTransientMessage("Project settings")).toBe(false);
	});
});

describe("isRetryableConnectionError", () => {
	test("treats closed CDP WebSocket errors as retryable", () => {
		expect(
			isRetryableConnectionErrorForTest(new Error("WebSocket is not open: readyState 3 (CLOSED)")),
		).toBe(true);
		expect(isRetryableConnectionErrorForTest(new Error("WebSocket connection closed"))).toBe(true);
	});
});

describe("readChatgptConversationPayloadWithClient", () => {
	test.each([
		{ path: "/c/conversation-visible", text: "Rendered response", project: null, reuse: true },
		{ path: "/c/conversation-other", text: "Rendered response", project: null, reuse: false },
		{ path: "/c/conversation-visible", text: " ", project: null, reuse: false },
		{
			path: "/g/g-p-abcdef/c/conversation-visible",
			text: "Rendered response",
			project: "g-p-fedcba",
			reuse: false,
		},
	])("rendered payload fallback respects route and content ($path, $text, $project)", async ({
		path,
		text,
		project,
		reuse,
	}) => {
		const location = new URL(`https://chatgpt.com${path}`);
		const client = {
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Runtime: {
				evaluate: vi.fn(async ({ expression }: { expression: string }) => {
					if (expression.includes("/backend-api/conversation/"))
						return { result: { value: { ok: false, status: 404, body: "{}" } } };
					if (expression === "location.href") return { result: { value: location.href } };
					if (expression.includes("const renderedRoute"))
						return {
							result: {
								value: runInNewContext(expression, {
									location,
									document: {
										title: "Fixture",
										querySelectorAll: () => [
											{
												textContent: text,
												getBoundingClientRect: () => ({ width: 100, height: 40 }),
											},
										],
									},
								}),
							},
						};
					return { result: { value: true } };
				}),
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn(() => () => {}),
				loadingFinished: vi.fn(() => () => {}),
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Page: { enable: vi.fn(async () => undefined), navigate: vi.fn(async () => ({})) },
		};
		vi.useFakeTimers();
		try {
			const pending = readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-visible",
				project,
				{ allowNavigation: true },
			);
			await vi.runAllTimersAsync();
			await expect(pending).resolves.toBeNull();
			expect(client.Page.navigate).toHaveBeenCalledTimes(reuse ? 0 : 1);
		} finally {
			vi.useRealTimers();
		}
	});
	test("does not force a second route visit for account-mirror payload fallback", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: { value: { ok: false, status: 404, body: "{}" } },
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: { enable: vi.fn() },
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: { enable: vi.fn(), navigate: vi.fn() },
		};

		await expect(
			readChatgptConversationPayloadWithClient(client as never, "conversation-single", null, {
				allowNavigation: true,
				accountMirrorInventory: true,
				accountMirrorSingleConversationVisit: true,
			}),
		).resolves.toBeNull();
		expect(client.Network.enable).not.toHaveBeenCalled();
		expect(client.Page.navigate).not.toHaveBeenCalled();
	});

	test("reacquires the exact payload from ChatGPT home through one route-bound fallback", async () => {
		vi.useFakeTimers();
		try {
			const conversationId = "conversation-route-bound";
			let onResponseReceived: ((params: never) => void) | null = null;
			let onLoadingFinished: ((params: never) => void) | null = null;
			const client = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async (input: { expression?: string }) =>
						input.expression === "location.href"
							? { result: { value: "https://chatgpt.com/" } }
							: { result: { value: { ok: false, status: 404, body: "{}" } } },
					),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Network: {
					enable: vi.fn(async () => undefined),
					responseReceived: vi.fn((handler) => {
						onResponseReceived = handler;
					}),
					loadingFinished: vi.fn((handler) => {
						onLoadingFinished = handler;
					}),
					getResponseBody: vi.fn(async () => ({
						body: JSON.stringify({ mapping: { recovered: { message: { id: "recovered" } } } }),
						base64Encoded: false,
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Page: {
					enable: vi.fn(async () => undefined),
					reload: vi.fn(async () => undefined),
					navigate: vi.fn(async ({ url }: { url: string }) => {
						if (url !== resolveChatgptConversationUrl(conversationId)) return;
						onResponseReceived?.({
							requestId: "request-route-bound",
							response: {
								url: `https://chatgpt.com/backend-api/conversation/${conversationId}`,
								status: 200,
							},
						} as never);
						onLoadingFinished?.({ requestId: "request-route-bound" } as never);
					}),
				},
			};

			const result = readChatgptConversationPayloadWithClient(
				client as never,
				conversationId,
				null,
				{ allowNavigation: true },
			);
			await vi.advanceTimersByTimeAsync(20_001);

			await expect(result).resolves.toMatchObject({
				mapping: { recovered: { message: { id: "recovered" } } },
			});
			expect(client.Page.navigate).toHaveBeenCalledTimes(1);
			expect(client.Page.navigate).toHaveBeenCalledWith({
				url: resolveChatgptConversationUrl(conversationId),
			});
			expect(client.Page.reload).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test("bounds a hanging payload evaluation before the next selected conversation starts", async () => {
		vi.useFakeTimers();
		try {
			const events: string[] = [];
			const successfulClient = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => {
						events.push("first-complete");
						return {
							result: {
								value: {
									ok: true,
									status: 200,
									body: JSON.stringify({ mapping: { first: { message: { id: "first" } } } }),
								},
							},
						};
					}),
				},
			};
			await expect(
				readChatgptConversationPayloadWithClient(successfulClient as never, "conversation-first"),
			).resolves.toMatchObject({ mapping: { first: { message: { id: "first" } } } });

			const hangingEvaluate = vi.fn((_input: { expression: string; timeout?: number }) => {
				events.push("second-evaluate-start");
				return new Promise(() => {});
			});
			const hangingClient = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: { evaluate: hangingEvaluate },
			};
			let hangingOutcome: { kind: "pending" | "resolved" | "rejected"; error?: unknown } = {
				kind: "pending",
			};
			void readChatgptConversationPayloadWithClient(
				hangingClient as never,
				"conversation-hanging",
			).then(
				() => {
					hangingOutcome = { kind: "resolved" };
				},
				(error: unknown) => {
					hangingOutcome = { kind: "rejected", error };
				},
			);
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(10_001);

			const evaluation = hangingEvaluate.mock.calls[0]?.[0] as
				| { expression?: string; timeout?: number }
				| undefined;
			expect(evaluation).toMatchObject({ timeout: 10_000 });
			expect(evaluation?.expression).toContain("AbortController");
			expect(evaluation?.expression).toContain("signal: controller.signal");
			expect(hangingOutcome).toMatchObject({
				kind: "rejected",
				error: expect.objectContaining({
					message: expect.stringContaining("conversation-hanging"),
				}),
			});

			const nextClient = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => {
						events.push("third-evaluate-start");
						return {
							result: {
								value: {
									ok: true,
									status: 200,
									body: JSON.stringify({ mapping: { third: { message: { id: "third" } } } }),
								},
							},
						};
					}),
				},
			};
			await expect(
				readChatgptConversationPayloadWithClient(nextClient as never, "conversation-third"),
			).resolves.toMatchObject({ mapping: { third: { message: { id: "third" } } } });
			expect(events).toEqual(["first-complete", "second-evaluate-start", "third-evaluate-start"]);
		} finally {
			vi.useRealTimers();
		}
	});

	test("forces the settled payload retry onto the direct-fetch-only path", () => {
		const interactionGovernor = { beforeInteraction: vi.fn(async () => undefined) };
		expect(
			buildChatgptPayloadDirectRetryOptionsForTest({
				allowNavigation: true,
				preserveActiveTab: false,
				interactionGovernor,
			}),
		).toMatchObject({
			allowNavigation: false,
			preserveActiveTab: true,
			interactionGovernor,
		});
	});

	test("does not reload the active ChatGPT tab when preserveActiveTab is set", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: {
						value: {
							ok: false,
							status: 404,
							body: "{}",
						},
					},
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn(),
				loadingFinished: vi.fn(),
				getResponseBody: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(async () => undefined),
				reload: vi.fn(),
			},
		};

		await expect(
			readChatgptConversationPayloadWithClient(
				client as never,
				"69d04b50-3c88-8325-8240-0d838d47ee50",
				null,
				{ preserveActiveTab: true },
			),
		).resolves.toBeNull();

		expect(client.Runtime.evaluate).toHaveBeenCalledTimes(1);
		expect(client.Network.enable).not.toHaveBeenCalled();
		expect(client.Page.enable).not.toHaveBeenCalled();
		expect(client.Page.reload).not.toHaveBeenCalled();
	});

	test.each([
		404, 410,
	] as const)("classifies an exact fallback $status as terminal conversation unavailability", async (status) => {
		vi.useFakeTimers();
		try {
			const conversationId = `conversation-terminal-${status}`;
			let onResponseReceived: ((params: never) => void) | null = null;
			const responseHandlers = new Set<(params: never) => void>();
			const loadingHandlers = new Set<(params: never) => void>();
			const client = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => ({
						result: { value: { ok: false, status: 404, body: "{}" } },
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Network: {
					enable: vi.fn(async () => undefined),
					responseReceived: vi.fn((handler: (params: never) => void) => {
						onResponseReceived = handler;
						responseHandlers.add(handler);
						return () => responseHandlers.delete(handler);
					}),
					loadingFinished: vi.fn((handler: (params: never) => void) => {
						loadingHandlers.add(handler);
						return () => loadingHandlers.delete(handler);
					}),
					getResponseBody: vi.fn(),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Page: {
					enable: vi.fn(async () => undefined),
					navigate: vi.fn(async () => {
						onResponseReceived?.({
							requestId: `request-terminal-${status}`,
							response: {
								url: `https://chatgpt.com/backend-api/conversation/${conversationId}`,
								status,
							},
						} as never);
					}),
					reload: vi.fn(),
				},
			};
			let outcome: { kind: "pending" | "resolved" | "rejected"; error?: unknown } = {
				kind: "pending",
			};
			void readChatgptConversationPayloadWithClient(client as never, conversationId, null, {
				allowNavigation: true,
			}).then(
				() => {
					outcome = { kind: "resolved" };
				},
				(error: unknown) => {
					outcome = { kind: "rejected", error };
				},
			);

			await vi.advanceTimersByTimeAsync(0);
			expect(outcome).toMatchObject({
				kind: "rejected",
				error: expect.objectContaining({
					message: `conversation-not-found-or-unavailable: ChatGPT conversation ${conversationId} exact fallback response returned status ${status}.`,
				}),
			});
			expect(responseHandlers.size).toBe(0);
			expect(loadingHandlers.size).toBe(0);
			expect(client.Network.getResponseBody).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test("bounds a stalled fallback response-body read", async () => {
		vi.useFakeTimers();
		try {
			let onResponseReceived: ((params: never) => void) | null = null;
			let onLoadingFinished: ((params: never) => void) | null = null;
			const getResponseBody = vi.fn(() => new Promise<never>(() => {}));
			const client = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => ({
						result: { value: { ok: false, status: 404, body: "{}" } },
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Network: {
					enable: vi.fn(async () => undefined),
					responseReceived: vi.fn((handler) => {
						onResponseReceived = handler;
					}),
					loadingFinished: vi.fn((handler) => {
						onLoadingFinished = handler;
					}),
					getResponseBody,
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Page: {
					enable: vi.fn(async () => undefined),
					navigate: vi.fn(async () => {
						onResponseReceived?.({
							requestId: "request-stalled-body",
							response: {
								url: "https://chatgpt.com/backend-api/conversation/conversation-stalled-body",
								status: 200,
							},
						} as never);
						onLoadingFinished?.({ requestId: "request-stalled-body" } as never);
					}),
					reload: vi.fn(),
				},
			};
			let outcome:
				| { kind: "pending" }
				| { kind: "resolved"; value: unknown }
				| { kind: "rejected"; error: unknown } = { kind: "pending" };
			void readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-stalled-body",
				null,
				{ allowNavigation: true },
			).then(
				(value) => {
					outcome = { kind: "resolved", value };
				},
				(error: unknown) => {
					outcome = { kind: "rejected", error };
				},
			);
			for (let index = 0; index < 10 && getResponseBody.mock.calls.length === 0; index += 1) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(getResponseBody).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(9_001);
			expect(outcome).toEqual({ kind: "resolved", value: null });
		} finally {
			vi.useRealTimers();
		}
	});

	test("settles from the exact fallback body when the navigation command remains pending", async () => {
		vi.useFakeTimers();
		try {
			const mutationRecords: Array<{ phase: string; outcome?: string }> = [];
			let onResponseReceived: ((params: never) => void) | null = null;
			let onLoadingFinished: ((params: never) => void) | null = null;
			const getResponseBody = vi.fn(async () => ({
				body: JSON.stringify({ mapping: { recovered: { message: { id: "recovered" } } } }),
				base64Encoded: false,
			}));
			const client = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => ({
						result: { value: { ok: false, status: 404, body: "{}" } },
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Network: {
					enable: vi.fn(async () => undefined),
					responseReceived: vi.fn((handler) => {
						onResponseReceived = handler;
					}),
					loadingFinished: vi.fn((handler) => {
						onLoadingFinished = handler;
					}),
					getResponseBody,
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Page: {
					enable: vi.fn(async () => undefined),
					navigate: vi.fn(() => {
						onResponseReceived?.({
							requestId: "request-reload-pending",
							response: {
								url: "https://chatgpt.com/backend-api/conversation/conversation-reload-pending",
								status: 200,
							},
						} as never);
						onLoadingFinished?.({ requestId: "request-reload-pending" } as never);
						return new Promise<never>(() => {});
					}),
					reload: vi.fn(),
				},
			};
			await annotateClientMutationContext(
				client as never,
				{
					mutationAudit: (record) => {
						mutationRecords.push({ phase: record.phase, outcome: record.outcome });
					},
				},
				"provider:chatgpt",
			);
			let outcome:
				| { kind: "pending" }
				| { kind: "resolved"; value: unknown }
				| { kind: "rejected"; error: unknown } = { kind: "pending" };
			void readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-reload-pending",
				null,
				{ allowNavigation: true },
			).then(
				(value) => {
					outcome = { kind: "resolved", value };
				},
				(error: unknown) => {
					outcome = { kind: "rejected", error };
				},
			);

			for (let index = 0; index < 10 && getResponseBody.mock.calls.length === 0; index += 1) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(getResponseBody).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(10_001);
			expect(outcome).toEqual({
				kind: "resolved",
				value: { mapping: { recovered: { message: { id: "recovered" } } } },
			});
			expect(mutationRecords).toEqual([
				{ phase: "start", outcome: undefined },
				{ phase: "complete", outcome: "succeeded" },
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	test("waits for governed route-bound fallback before starting the body deadline", async () => {
		vi.useFakeTimers();
		let releaseGovernor: (() => void) | undefined;
		try {
			let onResponseReceived: ((params: never) => void) | null = null;
			let onLoadingFinished: ((params: never) => void) | null = null;
			const beforeInteraction = vi.fn(
				() =>
					new Promise<void>((resolve) => {
						releaseGovernor = resolve;
					}),
			);
			const client = {
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Runtime: {
					evaluate: vi.fn(async () => ({
						result: { value: { ok: false, status: 404, body: "{}" } },
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Network: {
					enable: vi.fn(async () => undefined),
					responseReceived: vi.fn((handler) => {
						onResponseReceived = handler;
					}),
					loadingFinished: vi.fn((handler) => {
						onLoadingFinished = handler;
					}),
					getResponseBody: vi.fn(async () => ({
						body: JSON.stringify({ mapping: { governed: { message: { id: "governed" } } } }),
						base64Encoded: false,
					})),
				},
				// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
				Page: {
					enable: vi.fn(async () => undefined),
					navigate: vi.fn(async () => {
						onResponseReceived?.({
							requestId: "request-governed",
							response: {
								url: "https://chatgpt.com/backend-api/conversation/conversation-governed",
								status: 200,
							},
						} as never);
						onLoadingFinished?.({ requestId: "request-governed" } as never);
					}),
					reload: vi.fn(),
				},
			};
			let outcome:
				| { kind: "pending" }
				| { kind: "resolved"; value: unknown }
				| { kind: "rejected"; error: unknown } = { kind: "pending" };
			void readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-governed",
				null,
				{
					allowNavigation: true,
					interactionGovernor: { beforeInteraction },
				},
			).then(
				(value) => {
					outcome = { kind: "resolved", value };
				},
				(error: unknown) => {
					outcome = { kind: "rejected", error };
				},
			);

			await vi.advanceTimersByTimeAsync(0);
			expect(beforeInteraction).toHaveBeenCalledWith("renavigation");
			expect(client.Page.navigate).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(10_001);
			expect(outcome).toEqual({ kind: "pending" });

			releaseGovernor?.();
			await vi.advanceTimersByTimeAsync(0);
			expect(outcome).toEqual({
				kind: "resolved",
				value: { mapping: { governed: { message: { id: "governed" } } } },
			});
		} finally {
			releaseGovernor?.();
			vi.useRealTimers();
		}
	});

	test("disposes fallback network listeners before a sequential read", async () => {
		const responseHandlers = new Set<(params: never) => void>();
		const loadingHandlers = new Set<(params: never) => void>();
		let activeConversationId = "conversation-sequential-one";
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: { value: { ok: false, status: 404, body: "{}" } },
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn((handler: (params: never) => void) => {
					responseHandlers.add(handler);
					return () => responseHandlers.delete(handler);
				}),
				loadingFinished: vi.fn((handler: (params: never) => void) => {
					loadingHandlers.add(handler);
					return () => loadingHandlers.delete(handler);
				}),
				getResponseBody: vi.fn(async () => ({
					body: JSON.stringify({
						mapping: { [activeConversationId]: { message: { id: activeConversationId } } },
					}),
					base64Encoded: false,
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(async () => undefined),
				navigate: vi.fn(async () => {
					const requestId = `request-${activeConversationId}`;
					for (const handler of responseHandlers) {
						handler({
							requestId,
							response: {
								url: `https://chatgpt.com/backend-api/conversation/${activeConversationId}`,
								status: 200,
							},
						} as never);
					}
					for (const handler of loadingHandlers) {
						handler({ requestId } as never);
					}
				}),
				reload: vi.fn(),
			},
		};

		await expect(
			readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-sequential-one",
				null,
				{ allowNavigation: true },
			),
		).resolves.toMatchObject({
			mapping: {
				"conversation-sequential-one": { message: { id: "conversation-sequential-one" } },
			},
		});
		expect(responseHandlers.size).toBe(0);
		expect(loadingHandlers.size).toBe(0);

		activeConversationId = "conversation-sequential-two";
		await expect(
			readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-sequential-two",
				null,
				{ allowNavigation: true },
			),
		).resolves.toMatchObject({
			mapping: {
				"conversation-sequential-two": { message: { id: "conversation-sequential-two" } },
			},
		});
		expect(responseHandlers.size).toBe(0);
		expect(loadingHandlers.size).toBe(0);
	});

	test("settles a rejected route-bound fallback and closes its mutation audit", async () => {
		const responseHandlers = new Set<(params: never) => void>();
		const loadingHandlers = new Set<(params: never) => void>();
		const mutationRecords: Array<{ phase: string; outcome?: string }> = [];
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: { value: { ok: false, status: 404, body: "{}" } },
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn((handler: (params: never) => void) => {
					responseHandlers.add(handler);
					return () => responseHandlers.delete(handler);
				}),
				loadingFinished: vi.fn((handler: (params: never) => void) => {
					loadingHandlers.add(handler);
					return () => loadingHandlers.delete(handler);
				}),
				getResponseBody: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(async () => undefined),
				navigate: vi.fn(async () => {
					throw new Error("WebSocket is not open: readyState 3 (CLOSED)");
				}),
				reload: vi.fn(),
			},
		};
		await annotateClientMutationContext(
			client as never,
			{
				mutationAudit: (record) => {
					mutationRecords.push({ phase: record.phase, outcome: record.outcome });
				},
			},
			"provider:chatgpt",
		);

		await expect(
			readChatgptConversationPayloadWithClient(
				client as never,
				"conversation-reload-rejected",
				null,
				{ allowNavigation: true },
			),
		).resolves.toBeNull();
		expect(responseHandlers.size).toBe(0);
		expect(loadingHandlers.size).toBe(0);
		expect(mutationRecords).toEqual([
			{ phase: "start", outcome: undefined },
			{ phase: "complete", outcome: "failed" },
		]);
	});

	test("governs the route-bound payload fallback before mutating the page", async () => {
		let onResponseReceived: ((params: never) => void) | null = null;
		let onLoadingFinished: ((params: never) => void) | null = null;
		const beforeInteraction = vi.fn(async () => undefined);
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: { value: { ok: false, status: 404, body: "{}" } },
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(async () => undefined),
				responseReceived: vi.fn((handler) => {
					onResponseReceived = handler;
				}),
				loadingFinished: vi.fn((handler) => {
					onLoadingFinished = handler;
				}),
				getResponseBody: vi.fn(async () => ({
					body: JSON.stringify({ mapping: { one: { message: { id: "one" } } } }),
					base64Encoded: false,
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(async () => undefined),
				navigate: vi.fn(async () => {
					onResponseReceived?.({
						requestId: "request-1",
						response: {
							url: "https://chatgpt.com/backend-api/conversation/conversation-1",
							status: 200,
						},
					} as never);
					onLoadingFinished?.({ requestId: "request-1" } as never);
				}),
				reload: vi.fn(),
			},
		};

		await expect(
			readChatgptConversationPayloadWithClient(client as never, "conversation-1", null, {
				allowNavigation: true,
				interactionGovernor: { beforeInteraction },
			}),
		).resolves.toMatchObject({ mapping: { one: { message: { id: "one" } } } });

		expect(beforeInteraction).toHaveBeenCalledWith("renavigation");
		expect(beforeInteraction.mock.invocationCallOrder[0]).toBeLessThan(
			client.Page.navigate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});
});

describe("recoverVisibleChatgptBlockingSurfaceWithClient", () => {
	test("does not reload a blocking surface during an account-mirror single visit", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: { enable: vi.fn(), reload: vi.fn() },
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: { evaluate: vi.fn() },
		};

		await expect(
			recoverVisibleChatgptBlockingSurfaceWithClientForTest(
				client as never,
				{
					kind: "transient-error",
					summary: "Something went wrong while loading the conversation.",
					selector: null,
				},
				{ allowNavigation: true, accountMirrorSingleConversationVisit: true },
			),
		).resolves.toMatchObject({ action: "reload-page", outcome: "skipped" });
		expect(client.Page.reload).not.toHaveBeenCalled();
	});

	test("skips reload recovery when preserveActiveTab is set", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(),
				reload: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(),
			},
		};

		await expect(
			recoverVisibleChatgptBlockingSurfaceWithClientForTest(
				client as never,
				{
					kind: "transient-error",
					summary: "Something went wrong while generating the response.",
					selector: null,
				},
				{ preserveActiveTab: true },
			),
		).resolves.toEqual({
			action: "reload-page",
			outcome: "skipped",
			summary: "Something went wrong while generating the response.:navigation-forbidden",
		});

		expect(client.Page.enable).not.toHaveBeenCalled();
		expect(client.Page.reload).not.toHaveBeenCalled();
		expect(client.Runtime.evaluate).not.toHaveBeenCalled();
	});
});

describe("normalizeChatgptAuthSessionIdentity", () => {
	test("auth session expression bounds stalled session fetches", () => {
		const expression = buildChatgptAuthSessionIdentityExpression();

		expect(expression).toContain("AbortController");
		expect(expression).toContain("controller?.abort()");
		expect(expression).toContain("}, 8000)");
		expect(expression).toContain("signal: controller?.signal");
	});

	test("fallback identity reads only logged-in bootstrap identity fields", () => {
		const expression = buildChatgptFallbackIdentityExpressionForTest();
		const bootstrap = {
			textContent: JSON.stringify({
				authStatus: "logged_in",
				session: {
					user: {
						id: "user-current",
						name: "Current User",
						email: "current@example.test",
					},
					account: {
						id: "account-current",
						name: "Personal",
						email: null,
						planType: "pro",
						structure: "personal",
						organizationId: null,
					},
					accessToken: "must-never-leave-bootstrap",
				},
			}),
		};
		const document = {
			querySelector: vi.fn(() => bootstrap),
			querySelectorAll: vi.fn(() => []),
		};
		const window = { localStorage: {} };
		const evaluate = new Function("document", "window", `return ${expression};`);

		const result = evaluate(document, window);

		expect(document.querySelector).toHaveBeenCalledWith(
			'script#client-bootstrap[type="application/json"]',
		);
		expect(result).toEqual({
			user: {
				id: "user-current",
				name: "Current User",
				email: "current@example.test",
			},
			account: {
				id: "account-current",
				name: "Personal",
				email: null,
				planType: "pro",
				structure: "personal",
				organizationId: null,
			},
		});
		expect(JSON.stringify(result)).not.toContain("must-never-leave-bootstrap");
	});

	test("merges a partial auth response with bootstrap account evidence", async () => {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: {
					value: {
						user: { id: "user-current", name: "Current User", email: null },
						account: null,
					},
				},
			})
			.mockResolvedValueOnce({
				result: {
					value: {
						user: {
							id: "user-current",
							name: "Current User",
							email: "current@example.test",
						},
						account: {
							id: "account-current",
							planType: "pro",
							structure: "personal",
							organizationId: null,
						},
					},
				},
			});

		await expect(
			// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
			readChatgptUserIdentityWithClientForTest({ Runtime: { evaluate } } as never),
		).resolves.toMatchObject({
			id: "user-current",
			email: "current@example.test",
			accountId: "account-current",
			accountLevel: "Pro",
			accountPlanType: "pro",
			accountStructure: "personal",
		});
		expect(evaluate).toHaveBeenCalledTimes(2);
	});

	test("prefers auth session user email and id", () => {
		expect(
			normalizeChatgptAuthSessionIdentity({
				user: {
					id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
					name: "Eric Cochra",
					email: "ecochran76@gmail.com",
				},
				account: {
					id: "27e72181-04ee-4a6e-9859-ba8617766af4",
					name: "Cochran Group",
					email: null,
					planType: "team",
					structure: "workspace",
					organizationId: "org-QClZe3UFCU1m8w330umx4eHP",
				},
			}),
		).toEqual({
			id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			name: "Eric Cochra",
			email: "ecochran76@gmail.com",
			accountId: "27e72181-04ee-4a6e-9859-ba8617766af4",
			accountLevel: "Business",
			accountPlanType: "team",
			accountStructure: "workspace",
			organizationId: "org-QClZe3UFCU1m8w330umx4eHP",
			capabilityProfile: "chatgpt-business-restricted",
			proAccess: "restricted",
			deepResearchAccess: "restricted",
			source: "auth-session",
		});
	});

	test("falls back to account or storage-derived fields when user email is unavailable", () => {
		expect(
			normalizeChatgptAuthSessionIdentity({
				user: {
					id: null,
					name: "Cochran Group",
					email: null,
				},
				account: {
					id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
					name: null,
					email: null,
					planType: "pro",
					structure: "personal",
				},
			}),
		).toEqual({
			id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			name: "Cochran Group",
			email: undefined,
			accountId: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			accountLevel: "Pro",
			accountPlanType: "pro",
			accountStructure: "personal",
			organizationId: undefined,
			capabilityProfile: "chatgpt-pro-unlimited",
			proAccess: "unlimited-standard-extended",
			deepResearchAccess: "unlimited",
			source: "auth-session",
		});
	});
});

describe("extractChatgptProjectSourceName", () => {
	test("prefers the concise leaf text over row metadata", () => {
		expect(
			extractChatgptProjectSourceName({
				rowText: "20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025",
				leafTexts: [
					"20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025",
					"20251106-NSF GRFP Instructions.md",
					"File · Nov 6, 2025",
				],
			}),
		).toBe("20251106-NSF GRFP Instructions.md");
	});

	test("falls back to stripping the trailing kind label from row text", () => {
		expect(
			extractChatgptProjectSourceName({
				rowText: "Cochran_Faculty_Vita (15).pdfPDF · Oct 6, 2025",
				leafTexts: [],
			}),
		).toBe("Cochran_Faculty_Vita (15).pdf");
	});
});

describe("matchesChatgptImageArtifactProbe", () => {
	test("matches image probes by file id when the artifact uri is concrete", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/file-abc123?se=1&id=file-xyz789",
					alt: "irrelevant preview text",
				},
				{
					title: "diagram.png",
					uri: "chatgpt://file/file-xyz789",
				},
			),
		).toBe(true);
	});

	test("matches image probes by exact visible DOM image src", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "blob:https://chatgpt.com/generated-image",
					alt: "",
				},
				{
					title: "Generated image",
					uri: "blob:https://chatgpt.com/generated-image",
				},
			),
		).toBe(true);
	});

	test("falls back to alt-text title matching when no file id is available", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/generated-image.png",
					alt: "AuraCall Architecture Diagram preview",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: undefined,
				},
			),
		).toBe(true);
	});

	test("rejects probes that do not match the image artifact identity", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/generated-image.png",
					alt: "different artifact",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: undefined,
				},
			),
		).toBe(false);
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/file-abc123?se=1&id=file-other",
					alt: "AuraCall Architecture Diagram preview",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: "chatgpt://file/file-xyz789",
				},
			),
		).toBe(false);
	});
});

describe("normalizeChatgptVisibleImageArtifactProbes", () => {
	test("turns visible ImageGen DOM probes into image artifacts", () => {
		expect(
			normalizeChatgptVisibleImageArtifactProbes([
				{
					turnId: "turn-1",
					messageId: "msg-1",
					messageIndex: 1,
					imageIndex: 0,
					wrapperId: "image-abc",
					src: "blob:https://chatgpt.com/generated-image",
					alt: "",
					title: "",
				},
			]),
		).toEqual([
			expect.objectContaining({
				id: "image-dom:turn-1:image-abc",
				title: "Generated image 1",
				kind: "image",
				uri: "blob:https://chatgpt.com/generated-image",
				messageIndex: 1,
				messageId: "msg-1",
				metadata: expect.objectContaining({
					extraction: "dom-imagegen-image",
					turnId: "turn-1",
					wrapperId: "image-abc",
				}),
			}),
		]);
	});

	test("deduplicates repeated rendered nodes for the same visible image src", () => {
		const artifacts = normalizeChatgptVisibleImageArtifactProbes([
			{
				turnId: "turn-1",
				messageId: null,
				messageIndex: 1,
				imageIndex: 0,
				wrapperId: "image-abc",
				src: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
				alt: "",
				title: "",
			},
			{
				turnId: "turn-1",
				messageId: null,
				messageIndex: 1,
				imageIndex: 1,
				wrapperId: null,
				src: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
				alt: "",
				title: "",
			},
		]);

		expect(artifacts).toHaveLength(1);
		expect(artifacts[0]).toEqual(
			expect.objectContaining({
				id: "image-dom:turn-1:image-abc",
				uri: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
			}),
		);
	});
});

describe("matchesChatgptDownloadButtonProbe", () => {
	test("matches assistant artifact buttons by title and turn identity", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(true);
	});

	test("matches download button titles split by ChatGPT layout whitespace", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "legacy_readout.j on",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "legacy_readout.json",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(true);
	});

	test("falls back to message identity when turn id is unavailable", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "other-turn",
					messageId: "message-2",
					messageIndex: 7,
					buttonIndex: 1,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-2",
					messageIndex: 7,
					metadata: {},
				},
			),
		).toBe(true);
	});

	test("rejects probes that do not match download button identity", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "wrong.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(false);
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 2,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(false);
	});
});

describe("normalizeChatgptConversationLinkProbes", () => {
	test("keeps metadata-only conversation titles available when sidebar rows have no text", async () => {
		const source = await fs.readFile(
			path.resolve("src/browser/providers/chatgptAdapter.ts"),
			"utf8",
		);
		const start = source.indexOf("async function scrapeChatgptConversations(");
		const end = source.indexOf("export function normalizeChatgptConversationHistoryLimit", start);
		const scraper = source.slice(start, end);

		expect(start).toBeGreaterThanOrEqual(0);
		expect(end).toBeGreaterThan(start);
		expect(scraper).toContain("const title = normalize(item.title || item.name);");
		expect(scraper).toContain("title: title && title !== id ? title : null,");
		expect(scraper).toContain("normalize(cached?.title || '') ||");
		expect(scraper.indexOf("normalize(cached?.title || '') ||")).toBeLessThan(
			scraper.indexOf("normalize(anchor.getAttribute('aria-label') || '') ||"),
		);
	});

	test("dedupes conversation ids and prefers concrete titles, urls, and project ids", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
					title: "69c93b5d-e6b0-8332-8c20-da466cc863da",
				},
				{
					id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
					title: "AURACALL VERIFY PROBE",
					url: "https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
				},
				{
					id: "69c93212-f180-8330-815b-5f831fc395e6",
					title: "AURACALL CHATGPT REQUEST",
					projectId: "g-p-69c851be8cc88191afe109bea1b2a28d-oracle",
					url: "https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6",
				},
			]),
		).toEqual([
			{
				id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
				title: "AURACALL VERIFY PROBE",
				provider: "chatgpt",
				url: "https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
			},
			{
				id: "69c93212-f180-8330-815b-5f831fc395e6",
				title: "AURACALL CHATGPT REQUEST",
				provider: "chatgpt",
				projectId: "g-p-69c851be8cc88191afe109bea1b2a28d",
				url: "https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6",
			},
		]);
	});

	test("preserves cached conversation history timestamps from link probes", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					updatedAt: "2026-06-27T00:17:47.211915Z",
					metadata: {
						chatgptHistoryCacheSource: "cache/user/account/conversation-history-without-projects",
						chatgptHistoryCacheCreatedAt: "2026-06-27T00:16:18.808314Z",
					},
				},
			]),
		).toEqual([
			{
				id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
				title: "Handoff Preview ChatGPT",
				provider: "chatgpt",
				updatedAt: "2026-06-27T00:17:47.211Z",
				metadata: {
					chatgptHistoryCacheSource: "cache/user/account/conversation-history-without-projects",
					chatgptHistoryCacheCreatedAt: "2026-06-27T00:16:18.808314Z",
				},
			},
		]);
	});

	test("prefers a timestamped duplicate over an otherwise complete untimestamped probe", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					url: "https://chatgpt.com/c/6a3f1652-2490-83ea-add0-0a900e6d55bc",
				},
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					updatedAt: "2026-06-27T00:17:47.211915Z",
				},
			]),
		).toEqual([
			{
				id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
				title: "Handoff Preview ChatGPT",
				provider: "chatgpt",
				url: "https://chatgpt.com/c/6a3f1652-2490-83ea-add0-0a900e6d55bc",
				updatedAt: "2026-06-27T00:17:47.211Z",
			},
		]);
	});

	test("prefers a shorter authoritative title over a concatenated title+preview string", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
					title: "AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.",
					projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
					url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
				},
				{
					id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
					title: "AC GPT PC bqeekf",
					projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
					url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
				},
			]),
		).toEqual([
			{
				id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
				title: "AC GPT PC bqeekf",
				provider: "chatgpt",
				projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
				url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
			},
		]);
	});

	test("does not keep a generic ChatGPT title when a concrete row title exists", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
					title: "ChatGPT",
					projectId: "g-p-69cc275fdfac8191be921387165ca803",
					url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
				},
				{
					id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
					title: "AC GPT PC live exact",
					projectId: "g-p-69cc275fdfac8191be921387165ca803",
					url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
				},
			]),
		).toEqual([
			{
				id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
				title: "AC GPT PC live exact",
				provider: "chatgpt",
				projectId: "g-p-69cc275fdfac8191be921387165ca803",
				url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
			},
		]);
	});
});

describe("normalizeChatgptConversationFileProbes", () => {
	test("delegates message extraction to a non-layout paged reader", async () => {
		const source = await fs.readFile(
			path.resolve("src/browser/providers/chatgptAdapter.ts"),
			"utf8",
		);
		const start = source.indexOf("async function readChatgptConversationContextWithClient(");
		const end = source.indexOf("function applyChatgptConversationContextChunk(", start);
		const contextReader = source.slice(start, end);

		expect(start).toBeGreaterThanOrEqual(0);
		expect(end).toBeGreaterThan(start);
		expect(contextReader).toContain("readVisibleChatgptConversationMessagesWithClient(");
		expect(contextReader).not.toContain("node.innerText");
	});

	test("pages and preserves complete ordered ChatGPT message bodies", async () => {
		const firstPage = Array.from({ length: 8 }, (_, index) => ({
			role: index % 2 === 0 ? "user" : "assistant",
			text: `complete body ${index}`,
			messageId: `message-${index}`,
		}));
		const secondPage = [
			{ role: "user", text: "complete body 8", messageId: "message-8" },
			{ role: "assistant", text: "complete body 9", messageId: "message-9" },
		];
		const requests: Array<{
			expression?: string;
			returnByValue?: boolean;
			timeout?: number;
		}> = [];
		const evaluate = vi.fn(async (request: (typeof requests)[number]) => {
			requests.push(request);
			return requests.length === 1
				? {
						result: {
							value: { messages: firstPage, nextOffset: 8, totalMessages: 10 },
						},
					}
				: {
						result: {
							value: { messages: secondPage, nextOffset: null, totalMessages: 10 },
						},
					};
		});

		await expect(
			readVisibleChatgptConversationMessagesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate } } as never,
			),
		).resolves.toEqual([...firstPage, ...secondPage]);
		expect(evaluate).toHaveBeenCalledTimes(2);
		expect(requests.map((request) => request.timeout)).toEqual([10_000, 10_000]);
		expect(requests.map((request) => request.returnByValue)).toEqual([true, true]);
		expect(requests[0]?.expression).toContain("const pageStart = 0;");
		expect(requests[1]?.expression).toContain("const pageStart = 8;");
		for (const request of requests) {
			expect(request.expression).toContain("fallbackNodes.slice(pageStart, pageStart + pageSize)");
			expect(request.expression).toContain("node.textContent");
			expect(request.expression).not.toContain("node.innerText");
		}
	});

	test("interrupts a stalled later message page", async () => {
		vi.useFakeTimers();
		try {
			const evaluate = vi
				.fn()
				.mockResolvedValueOnce({
					result: {
						value: {
							messages: [{ role: "user", text: "first page", messageId: "message-0" }],
							nextOffset: 8,
							totalMessages: 9,
						},
					},
				})
				.mockImplementationOnce(() => new Promise(() => undefined));
			const pending = readVisibleChatgptConversationMessagesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate } } as never,
			);
			const rejection = expect(pending).rejects.toThrow(
				"Timed out reading ChatGPT conversation messages page starting at 8 after 10000ms.",
			);
			await vi.advanceTimersByTimeAsync(10_000);
			await rejection;
			expect(evaluate).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	test("collects the ready conversation file DOM only once", async () => {
		let expression = "";
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			expression = input.expression ?? "";
			return { result: { value: [] } };
		});

		await expect(
			readVisibleChatgptConversationFilesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate } } as never,
				"6a563289-d5d8-83ea-9a2b-0e89e7078dff",
			),
		).resolves.toEqual([]);
		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(expression.match(/\bcollect\(\)/g) ?? []).toHaveLength(1);
		expect(expression).toContain('button[aria-label^="Open preview of "]');
		expect(expression).toContain("/^Open preview of\\s+(.+)$/i");
		expect(expression).toContain("hasUserFileControl");
		expect(expression).toContain('[data-message-author-role=\\"user\\"]');
	});

	test.each([
		"hidden",
		"empty",
		"textdoc",
	])("waits past an ineligible %s control for the recorded ZIP shape", async (kind) => {
		let mounted = false;
		let observed = false;
		class FixtureElement {
			constructor(private readonly control: boolean) {}
			getAttribute(name: string) {
				if (name === "data-content-search-unit-key") return "fallback-turn-4:2:assistant";
				if (name === "aria-label")
					return mounted || kind !== "empty"
						? "Download Bailey_FY27_Proposal_With_Figures.zip"
						: "";
				return null;
			}
			get textContent() {
				return mounted ? "Bailey_FY27_Proposal_With_Figures.zip" : "";
			}
			getBoundingClientRect() {
				return { width: !mounted && kind === "hidden" ? 0 : 80, height: 24 };
			}
			closest() {
				return !mounted && kind === "textdoc" ? this : null;
			}
			querySelector() {
				return this.control ? null : control;
			}
			querySelectorAll() {
				return [control];
			}
		}
		const control = new FixtureElement(true);
		const root = new FixtureElement(false);
		const evaluate = async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					// biome-ignore lint/style/useNamingConvention: Browser global name.
					Element: FixtureElement,
					document: { querySelectorAll: () => [root], documentElement: root },
					// biome-ignore lint/style/useNamingConvention: Browser global name.
					MutationObserver: class {
						constructor(private readonly callback: () => void) {}
						observe() {
							observed = true;
							queueMicrotask(() => {
								mounted = true;
								this.callback();
							});
						}
						disconnect() {}
					},
					setTimeout: () => 1,
				}),
			},
		});
		const probes = await readVisibleChatgptDownloadArtifactProbesWithClientForTest(
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			{ Runtime: { evaluate } } as never,
		);
		expect(observed).toBe(true);
		expect(probes).toMatchObject([
			{ title: "Bailey_FY27_Proposal_With_Figures.zip", messageIndex: 0, buttonIndex: 0 },
		]);
	});

	test("bounds a stalled visible download artifact probe and records its pending operation", async () => {
		vi.useFakeTimers();
		try {
			let request: {
				expression?: string;
				awaitPromise?: boolean;
				returnByValue?: boolean;
				timeout?: number;
			} = {};
			const evaluate = vi.fn((input: typeof request) => {
				request = input;
				return new Promise<never>(() => undefined);
			});
			const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
			const read = readVisibleChatgptDownloadArtifactProbesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate } } as never,
				{ scrapeTelemetry },
			);
			const pendingOperation = scrapeTelemetry.pendingOperation;
			const outcome = Promise.race([
				read.then(
					() => "completed",
					(error: unknown) => (error instanceof Error ? error.message : String(error)),
				),
				new Promise<string>((resolve) => setTimeout(() => resolve("outer-stalled"), 10_001)),
			]);

			await vi.advanceTimersByTimeAsync(10_001);
			expect(await outcome).toBe(
				"Timed out reading visible ChatGPT download artifact probes after 10000ms.",
			);
			expect(pendingOperation).toBe("provider:chatgpt.readVisibleDownloadArtifactProbes");
			expect(scrapeTelemetry.pendingOperation).toBeNull();
			expect(evaluate).toHaveBeenCalledTimes(1);
			expect(request).toMatchObject({
				awaitPromise: true,
				returnByValue: true,
				timeout: 10_000,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("evaluates visible download artifact readiness with the collection predicate", async () => {
		let expression = "";
		const evaluate = vi.fn(async (input: { expression?: string }) => {
			expression = input.expression ?? "";
			return { result: { value: [] } };
		});

		await expect(
			readVisibleChatgptDownloadArtifactProbesWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate } } as never,
			),
		).resolves.toEqual([]);
		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(expression.match(/\bcollect\(\)/g) ?? []).toHaveLength(2);
		expect(expression).not.toContain("for (let attempt = 0; attempt < 20");
		expect(expression).toContain("Open preview of");
		expect(expression).toContain("previewMatch?.[1]");
		expect(expression).toContain("MutationObserver");
		expect(expression).toContain("setTimeout(finish, 5_000)");
		expect(expression).toContain("downloadMatch?.[1]");
		expect(expression).toContain("if (probes.length === 0)");
		expect(expression).toContain("role !== 'assistant'");
		expect(expression).toContain("section.getAttribute('data-content-search-unit-key')");
		expect(expression).toContain("section.getAttribute('data-chatgpt-search-unit-key')");
	});

	test("emits stable conversation file refs from user-turn probes", () => {
		expect(
			normalizeChatgptConversationFileProbes("69c95f14-2ca0-8329-9d3a-be5d1a1967ab", [
				{
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					tileIndex: 0,
					name: "chatgpt-real-upload-vmuk.txt",
					label: "Document",
				},
				{
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					tileIndex: 0,
					name: "chatgpt-real-upload-vmuk.txt",
					label: "Document",
				},
			]),
		).toEqual([
			{
				id: "69c95f14-2ca0-8329-9d3a-be5d1a1967ab:1411ca60-9384-407a-a39a-ce9b772c737a:0:chatgpt-real-upload-vmuk.txt",
				name: "chatgpt-real-upload-vmuk.txt",
				provider: "chatgpt",
				source: "conversation",
				metadata: {
					label: "Document",
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
				},
			},
		]);
	});

	test("marks React-backed ChatGPT file tiles as retrievable provider files", () => {
		expect(
			normalizeChatgptConversationFileProbes("6a092419-33c0-83ea-bca8-27c694312842", [
				{
					turnId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					messageId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					tileIndex: 0,
					name: "Earthline - ISU Mutual Confidentiality Agreement.pdf",
					label: "PDF",
					providerFileId: "file_000000004a0c71f89172ec251ae22c52",
					mimeType: "application/pdf",
					downloadable: "default-only",
					previewable: "default-only",
				},
			]),
		).toEqual([
			{
				id: "6a092419-33c0-83ea-bca8-27c694312842:3e6c04a6-29d0-45f6-b37c-f33353965543:0:Earthline - ISU Mutual Confidentiality Agreement.pdf",
				name: "Earthline - ISU Mutual Confidentiality Agreement.pdf",
				provider: "chatgpt",
				source: "conversation",
				mimeType: "application/pdf",
				remoteUrl: "chatgpt://file/file_000000004a0c71f89172ec251ae22c52",
				metadata: {
					label: "PDF",
					turnId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					messageId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					providerFileId: "file_000000004a0c71f89172ec251ae22c52",
					downloadable: "default-only",
					previewable: "default-only",
					materializationSurface: "chatgpt-file-tile-default-action",
				},
			},
		]);
	});
});

describe("extractChatgptConversationSourcesFromPayload", () => {
	test("normalizes file citations and dedupes content references against citations", () => {
		expect(
			extractChatgptConversationSourcesFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-1",
								author: { role: "assistant" },
								content: { parts: ["answer"] },
								metadata: {
									content_references: [
										{
											type: "file",
											name: "proof.pdf",
											id: "file_0001",
											source: "my_files",
										},
									],
									citations: [
										{
											reference: {
												type: "file",
												name: "proof.pdf",
												id: "file_0001",
												source: "my_files",
											},
										},
									],
								},
							},
						},
					},
				},
				new Map([["assist-1", 1]]),
			),
		).toEqual([
			{
				url: "chatgpt://file/file_0001",
				title: "proof.pdf",
				domain: "chatgpt-file",
				messageIndex: 1,
				sourceGroup: "my_files",
			},
		]);
	});
});

describe("extractChatgptConversationArtifactsFromPayload", () => {
	test("extracts downloadable sandbox artifacts from assistant markdown", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-2",
								author: { role: "assistant" },
								content: {
									parts: [
										"Files:\n[updated skill.zip](sandbox:/mnt/data/skilldist_papers_fix/skill.zip)\n[combined JSON extraction](sandbox:/mnt/data/papers_fixed_extract.json)",
									],
								},
							},
						},
					},
				},
				new Map([["assist-2", 3]]),
			),
		).toEqual([
			{
				id: "assist-2:download:sandbox:/mnt/data/skilldist_papers_fix/skill.zip",
				title: "updated skill.zip",
				kind: "download",
				uri: "sandbox:/mnt/data/skilldist_papers_fix/skill.zip",
				messageIndex: 3,
				messageId: "assist-2",
			},
			{
				id: "assist-2:download:sandbox:/mnt/data/papers_fixed_extract.json",
				title: "combined JSON extraction",
				kind: "download",
				uri: "sandbox:/mnt/data/papers_fixed_extract.json",
				messageIndex: 3,
				messageId: "assist-2",
			},
		]);
	});

	test("classifies spreadsheet-like sandbox downloads as spreadsheet artifacts", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-sheet-1",
								author: { role: "assistant" },
								content: {
									parts: [
										"[parabola_trendline_demo.xlsx](sandbox:/mnt/data/parabola_trendline_demo.xlsx)",
									],
								},
							},
						},
					},
				},
				new Map([["assist-sheet-1", 2]]),
			),
		).toEqual([
			{
				id: "assist-sheet-1:download:sandbox:/mnt/data/parabola_trendline_demo.xlsx",
				title: "parabola_trendline_demo.xlsx",
				kind: "spreadsheet",
				uri: "sandbox:/mnt/data/parabola_trendline_demo.xlsx",
				messageIndex: 2,
				messageId: "assist-sheet-1",
			},
		]);
	});

	test("extracts canvas artifacts and carries forward code preview metadata", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						code: {
							message: {
								id: "code-1",
								author: { role: "assistant" },
								content: {
									content_type: "code",
									parts: [
										'{"name":"probe.txt","type":"document","content":"AURACALL CHATGPT CANVAS PROBE 1."}',
									],
								},
							},
						},
						tool: {
							message: {
								id: "tool-1",
								author: { role: "tool" },
								metadata: {
									command: "create_textdoc",
									canvas: {
										textdoc_id: "69c8a1018ea08191b3e3cbdb038221e4",
										textdoc_type: "document",
										version: 1,
										title: "Probe",
										create_source: "system_hint_canvas",
									},
								},
							},
						},
					},
				},
				new Map([["tool-1", 4]]),
			),
		).toEqual([
			{
				id: "canvas:69c8a1018ea08191b3e3cbdb038221e4",
				title: "Probe",
				kind: "canvas",
				uri: "chatgpt://canvas/69c8a1018ea08191b3e3cbdb038221e4",
				messageIndex: 4,
				messageId: "tool-1",
				metadata: {
					textdocId: "69c8a1018ea08191b3e3cbdb038221e4",
					textdocType: "document",
					version: 1,
					createSource: "system_hint_canvas",
					command: "create_textdoc",
					documentName: "probe.txt",
					documentType: "document",
					contentText: "AURACALL CHATGPT CANVAS PROBE 1.",
				},
			},
		]);
	});

	test("extracts generated image artifacts from tool multimodal payloads", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						image: {
							message: {
								id: "tool-image-1",
								author: { role: "tool" },
								content: {
									content_type: "multimodal_text",
									parts: [
										JSON.stringify({
											content_type: "image_asset_pointer",
											asset_pointer: "sediment://file_00000000000000000000000000000001",
											size_bytes: 450123,
											width: 1024,
											height: 1024,
											metadata: {
												generation: {
													gen_id: "gen-123",
													size: "1024x1024",
												},
												dalle: {
													prompt: "A calm lake at sunrise",
												},
											},
										}),
									],
								},
								metadata: {
									title: "Sunrise lake",
								},
							},
						},
					},
				},
				new Map([["tool-image-1", 6]]),
			),
		).toEqual([
			{
				id: "tool-image-1:image:sediment://file_00000000000000000000000000000001",
				title: "Sunrise lake",
				kind: "image",
				uri: "sediment://file_00000000000000000000000000000001",
				messageIndex: 6,
				messageId: "tool-image-1",
				metadata: {
					contentType: "image_asset_pointer",
					assetPointer: "sediment://file_00000000000000000000000000000001",
					sizeBytes: 450123,
					width: 1024,
					height: 1024,
					generation: {
						gen_id: "gen-123",
						size: "1024x1024",
					},
					dalle: {
						prompt: "A calm lake at sunrise",
					},
				},
			},
		]);
	});

	test("extracts spreadsheet artifacts from ada visualizations", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						table: {
							message: {
								id: "tool-table-1",
								author: { role: "tool" },
								metadata: {
									ada_visualizations: [
										{
											type: "table",
											file_id: "file-dtzUOh5KSZFM2ZdWH83pbrfO",
											title: "New Patents with ISURF Numbers",
										},
									],
								},
							},
						},
					},
				},
				new Map([["tool-table-1", 7]]),
			),
		).toEqual([
			{
				id: "spreadsheet:file-dtzUOh5KSZFM2ZdWH83pbrfO",
				title: "New Patents with ISURF Numbers",
				kind: "spreadsheet",
				uri: "chatgpt://file/file-dtzUOh5KSZFM2ZdWH83pbrfO",
				messageIndex: 7,
				messageId: "tool-table-1",
				metadata: {
					visualizationType: "table",
					fileId: "file-dtzUOh5KSZFM2ZdWH83pbrfO",
				},
			},
		]);
	});

	test("uses manifest-backed default artifact titles when payload titles are absent", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload({
				mapping: {
					image: {
						message: {
							id: "tool-image-untitled",
							author: { role: "tool" },
							content: {
								content_type: "multimodal_text",
								parts: [
									JSON.stringify({
										content_type: "image_asset_pointer",
										asset_pointer: "sediment://file_untitled_image",
									}),
								],
							},
						},
					},
					table: {
						message: {
							id: "tool-table-untitled",
							author: { role: "tool" },
							metadata: {
								ada_visualizations: [
									{
										type: "table",
									},
								],
							},
						},
					},
					canvas: {
						message: {
							id: "tool-canvas-untitled",
							author: { role: "tool" },
							metadata: {
								canvas: {
									textdoc_id: "canvas-untitled",
								},
							},
						},
					},
				},
			}),
		).toEqual([
			{
				id: "tool-image-untitled:image:sediment://file_untitled_image",
				title: "Generated image",
				kind: "image",
				uri: "sediment://file_untitled_image",
				messageId: "tool-image-untitled",
				metadata: {
					contentType: "image_asset_pointer",
					assetPointer: "sediment://file_untitled_image",
				},
			},
			{
				id: "tool-table-untitled:spreadsheet",
				title: "Spreadsheet artifact",
				kind: "spreadsheet",
				messageId: "tool-table-untitled",
				metadata: {
					visualizationType: "table",
				},
			},
			{
				id: "canvas:canvas-untitled",
				title: "Canvas artifact",
				kind: "canvas",
				uri: "chatgpt://canvas/canvas-untitled",
				messageId: "tool-canvas-untitled",
				metadata: {
					textdocId: "canvas-untitled",
				},
			},
		]);
	});
});

describe("normalizeChatgptConversationDownloadArtifactProbes", () => {
	test("activates the tagged live download control with a trusted CDP pointer sequence", async () => {
		const evaluate = vi.fn(async (_input: { expression?: string }) => ({
			result: { value: { ok: true, x: 412.5, y: 287.25 } },
		}));
		const dispatchMouseEvent = vi.fn(async () => undefined);

		await expect(
			clickTaggedChatgptDownloadControlWithClientForTest(
				// biome-ignore lint/style/useNamingConvention: CDP domain names are protocol-defined.
				{ Runtime: { evaluate }, Input: { dispatchMouseEvent } } as never,
			),
		).resolves.toBe(true);

		expect(evaluate).toHaveBeenCalledTimes(1);
		expect(evaluate.mock.calls[0]?.[0].expression).toContain(
			"target.scrollIntoView({ block: 'center', inline: 'center' })",
		);
		expect(evaluate.mock.calls[0]?.[0].expression).not.toContain("target.click()");
		expect(dispatchMouseEvent.mock.calls).toEqual([
			[{ type: "mouseMoved", x: 412.5, y: 287.25 }],
			[
				{
					type: "mousePressed",
					x: 412.5,
					y: 287.25,
					button: "left",
					buttons: 1,
					clickCount: 1,
				},
			],
			[
				{
					type: "mouseReleased",
					x: 412.5,
					y: 287.25,
					button: "left",
					buttons: 0,
					clickCount: 1,
				},
			],
		]);
	});

	test("normalizes visible behavior-button downloads into synthetic artifacts", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-1",
					messageId: "assist-dom-1",
					messageIndex: 3,
					buttonIndex: 0,
					title: "Fresh investigation bundle",
				},
				{
					turnId: "turn-1",
					messageId: "assist-dom-1",
					messageIndex: 3,
					buttonIndex: 0,
					title: "Fresh investigation bundle",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-1:0",
				title: "Fresh investigation bundle",
				kind: "download",
				uri: "chatgpt://download-button/turn-1/0",
				messageIndex: 3,
				messageId: "assist-dom-1",
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-1",
					buttonIndex: 0,
				},
			},
		]);
	});

	test("classifies spreadsheet-like button titles as spreadsheet artifacts", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-2",
					messageIndex: 5,
					buttonIndex: 1,
					title: "Download workbook.xlsx",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-2:1",
				title: "Download workbook.xlsx",
				kind: "spreadsheet",
				uri: "chatgpt://download-button/turn-2/1",
				messageIndex: 5,
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-2",
					buttonIndex: 1,
				},
			},
		]);
	});

	test("classifies ods downloads as spreadsheet artifacts via manifest taxonomy", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-3",
					messageIndex: 6,
					buttonIndex: 2,
					title: "Analysis export.ods",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-3:2",
				title: "Analysis export.ods",
				kind: "spreadsheet",
				uri: "chatgpt://download-button/turn-3/2",
				messageIndex: 6,
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-3",
					buttonIndex: 2,
				},
			},
		]);
	});
});

describe("mergeChatgptConversationArtifacts", () => {
	test("preserves canonical payload identity while attaching a matching live DOM control", () => {
		expect(
			mergeChatgptConversationArtifacts(
				[
					{
						id: "assist-1:download:sandbox:/mnt/data/comment_demo.docx",
						title: "Download the DOCX",
						kind: "download",
						uri: "sandbox:/mnt/data/comment_demo.docx",
						messageIndex: 2,
					},
				],
				[
					{
						id: "download-dom:turn-1:0",
						title: "Download the DOCX",
						kind: "download",
						uri: "chatgpt://download-button/turn-1/0",
						messageIndex: 2,
						messageId: "assist-dom-1",
						metadata: {
							extraction: "dom-behavior-button",
							turnId: "turn-1",
							buttonIndex: 0,
						},
					},
					{
						id: "download-dom:turn-2:0",
						title: "Fresh investigation bundle",
						kind: "download",
						uri: "chatgpt://download-button/turn-2/0",
						messageIndex: 4,
					},
				],
				{ reconcileDownloadControls: true },
			),
		).toEqual([
			{
				id: "assist-1:download:sandbox:/mnt/data/comment_demo.docx",
				title: "Download the DOCX",
				kind: "download",
				uri: "sandbox:/mnt/data/comment_demo.docx",
				messageIndex: 2,
				messageId: "assist-dom-1",
				metadata: {
					liveControlState: "available",
					recoverabilityState: "downloadable_now",
					liveControlUri: "chatgpt://download-button/turn-1/0",
					liveControlArtifactId: "download-dom:turn-1:0",
					turnId: "turn-1",
					buttonIndex: 0,
				},
			},
			{
				id: "download-dom:turn-2:0",
				title: "Fresh investigation bundle",
				kind: "download",
				uri: "chatgpt://download-button/turn-2/0",
				messageIndex: 4,
			},
		]);
	});
});

describe("ChatGPT payload live-control reconciliation", () => {
	test("keeps the exact cone asset visible but marks it unavailable beside unrelated DOCX controls", () => {
		const result = reconcileChatgptPayloadDownloadControls([
			{
				id: "cone-payload",
				title: "Download the exact cone.docx",
				kind: "download",
				uri: "sandbox:/mnt/data/exact_cone.docx",
				messageIndex: 7,
				messageId: "cone-message",
			},
			{
				id: "download-dom:other-turn:0",
				title: "Download another.docx",
				kind: "download",
				uri: "chatgpt://download-button/other-turn/0",
				messageIndex: 8,
				messageId: "other-message",
				metadata: { extraction: "dom-behavior-button", turnId: "other-turn", buttonIndex: 0 },
			},
			{
				id: "download-dom:last-turn:0",
				title: "Download final.docx",
				kind: "download",
				uri: "chatgpt://download-button/last-turn/0",
				messageIndex: 9,
				messageId: "last-message",
				metadata: { extraction: "dom-behavior-button", turnId: "last-turn", buttonIndex: 0 },
			},
		]);

		expect(result.map((artifact) => artifact.id)).toEqual([
			"cone-payload",
			"download-dom:other-turn:0",
			"download-dom:last-turn:0",
		]);
		expect(result[0]).toMatchObject({
			id: "cone-payload",
			uri: "sandbox:/mnt/data/exact_cone.docx",
			metadata: {
				liveControlState: "missing",
				liveControlReason: "missing_live_control",
				recoverabilityState: "repair_prompt_candidate",
			},
		});
	});

	test("does not broaden a same-title match across message scope", () => {
		const result = reconcileChatgptPayloadDownloadControls([
			{
				id: "scoped-payload",
				title: "Download report.docx",
				kind: "download",
				uri: "sandbox:/mnt/data/report.docx",
				messageIndex: 2,
				messageId: "expected-message",
			},
			{
				id: "download-dom:wrong-turn:0",
				title: "Download report.docx",
				kind: "download",
				uri: "chatgpt://download-button/wrong-turn/0",
				messageIndex: 3,
				messageId: "wrong-message",
				metadata: { extraction: "dom-behavior-button", turnId: "wrong-turn", buttonIndex: 0 },
			},
		]);

		expect(result[0]?.metadata).toMatchObject({
			liveControlState: "missing",
			liveControlReason: "missing_live_control",
			recoverabilityState: "repair_prompt_candidate",
		});
		expect(result[1]?.id).toBe("download-dom:wrong-turn:0");
	});

	test("leaves DOM-native controls and non-download artifacts unchanged", () => {
		const artifacts = [
			{
				id: "download-dom:turn-1:0",
				title: "Download live.docx",
				kind: "download" as const,
				uri: "chatgpt://download-button/turn-1/0",
				metadata: { extraction: "dom-behavior-button", turnId: "turn-1", buttonIndex: 0 },
			},
			{
				id: "canvas:1",
				title: "Canvas",
				kind: "canvas" as const,
				uri: "chatgpt://canvas/1",
			},
			{
				id: "spreadsheet:1",
				title: "Workbook.xlsx",
				kind: "spreadsheet" as const,
				uri: "sandbox:/mnt/data/workbook.xlsx",
			},
		];
		expect(reconcileChatgptPayloadDownloadControls(artifacts)).toEqual(artifacts);
	});

	test("uses the same scoped resolver contract for provider-free and click-time candidates", () => {
		expect(
			resolveChatgptArtifactControlCandidate(
				{
					title: "Report.docx",
					uri: "sandbox:/mnt/data/report.docx",
					uriFileName: "report.docx",
					turnId: "turn-2",
					messageId: null,
					messageIndex: 4,
					buttonIndex: 0,
				},
				[
					{
						title: "Report.docx",
						href: "",
						turnId: "turn-1",
						messageId: "message-1",
						messageIndex: 3,
						buttonIndex: 0,
					},
					{
						title: "Report.docx",
						href: "",
						turnId: "turn-2",
						messageId: "message-2",
						messageIndex: 4,
						buttonIndex: 0,
					},
				],
			),
		).toMatchObject({ turnId: "turn-2", messageId: "message-2" });
	});
});

describe("mergeChatgptCanvasArtifactContent", () => {
	test("fills missing canvas content from visible textdoc probes", () => {
		expect(
			mergeChatgptCanvasArtifactContent(
				[
					{
						id: "canvas:69caaa25d42081919961766acc4b79a1",
						title: "Short Document With Comments",
						kind: "canvas",
						uri: "chatgpt://canvas/69caaa25d42081919961766acc4b79a1",
						metadata: {
							textdocId: "69caaa25d42081919961766acc4b79a1",
						},
					},
				],
				[
					{
						textdocId: "69caaa25d42081919961766acc4b79a1",
						title: "Short Document With Comments",
						contentText: "Sample Document\nThe final paragraph concludes the document.",
					},
				],
			),
		).toEqual([
			{
				id: "canvas:69caaa25d42081919961766acc4b79a1",
				title: "Short Document With Comments",
				kind: "canvas",
				uri: "chatgpt://canvas/69caaa25d42081919961766acc4b79a1",
				metadata: {
					textdocId: "69caaa25d42081919961766acc4b79a1",
					contentText: "Sample Document\nThe final paragraph concludes the document.",
				},
			},
		]);
	});
});

describe("resolveChatgptCanvasArtifactContentText", () => {
	test("returns existing canvas content before consulting visible probes", () => {
		expect(
			resolveChatgptCanvasArtifactContentText(
				{
					id: "canvas:existing",
					title: "Existing Canvas",
					kind: "canvas",
					metadata: {
						textdocId: "existing",
						contentText: "Existing content",
					},
				},
				[
					{
						textdocId: "existing",
						title: "Existing Canvas",
						contentText: "Visible probe content",
					},
				],
			),
		).toBe("Existing content");
	});

	test("falls back to title match when textdoc id is unavailable", () => {
		expect(
			resolveChatgptCanvasArtifactContentText(
				{
					id: "canvas:title-only",
					title: "Title Only Canvas",
					kind: "canvas",
					metadata: {},
				},
				[
					{
						title: "Title Only Canvas",
						contentText: "Visible title-matched content",
					},
				],
			),
		).toBe("Visible title-matched content");
	});
});

describe("serializeChatgptGridRowsToCsv", () => {
	test("quotes cells with commas, quotes, and newlines", () => {
		expect(
			serializeChatgptGridRowsToCsv([
				["id", "title", "notes"],
				["1", "alpha,beta", 'line 1\nline "2"'],
			]),
		).toBe('id,title,notes\n1,"alpha,beta","line 1\nline ""2"""');
	});
});

describe("normalizeChatgptProjectSourceProbes", () => {
	test("dedupes rows and emits project-scoped file refs", () => {
		expect(
			normalizeChatgptProjectSourceProbes([
				{
					rowText: "spec.mdFile · Mar 28, 2026",
					leafTexts: ["spec.mdFile · Mar 28, 2026", "spec.md", "File · Mar 28, 2026"],
					metadataText: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
					hrefs: ["https://chatgpt.com/backend-api/files/file_abc123"],
					mimeType: "text/markdown",
					size: 42,
				},
				{
					rowText: "spec.mdFile · Mar 28, 2026",
					leafTexts: ["spec.md"],
					metadataText: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
				},
			]),
		).toEqual([
			{
				id: "file_abc123",
				name: "spec.md",
				provider: "chatgpt",
				source: "project",
				mimeType: "text/markdown",
				remoteUrl: "chatgpt://file/file_abc123",
				size: 42,
				metadata: {
					label: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
					hrefs: ["https://chatgpt.com/backend-api/files/file_abc123"],
					materializationSurface: "chatgpt-project-source-provider-file",
				},
			},
		]);
	});

	test("keeps metadata-only project source rows as deterministic row refs", () => {
		expect(
			normalizeChatgptProjectSourceProbes([
				{
					rowText: "policy.pdfFile · Apr 2, 2026",
					leafTexts: ["policy.pdfFile · Apr 2, 2026", "policy.pdf", "File · Apr 2, 2026"],
					metadataText: "File · Apr 2, 2026",
					testIds: ["project-source-row"],
					ariaLabels: ["More actions"],
				},
			]),
		).toEqual([
			{
				id: "policy.pdf",
				name: "policy.pdf",
				provider: "chatgpt",
				source: "project",
				metadata: {
					label: "File · Apr 2, 2026",
					testIds: ["project-source-row"],
					ariaLabels: ["More actions"],
					materializationSurface: "chatgpt-project-source-row",
				},
			},
		]);
	});
});

describe("findChatgptProjectSourceName", () => {
	test("returns the canonical matched source name from normalized file refs", () => {
		expect(
			findChatgptProjectSourceName([{ name: "Spec.md" }, { name: "notes.txt" }], "spec.md"),
		).toBe("Spec.md");
	});

	test("returns null when the normalized source name is absent", () => {
		expect(findChatgptProjectSourceName([{ name: "notes.txt" }], "spec.md")).toBeNull();
	});
});

describe("matchesChatgptProjectSettingsSnapshot", () => {
	test("matches by persisted project name only when requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "instructions",
				},
				{ name: "AC GPT R test" },
			),
		).toBe(true);
	});

	test("matches by normalized instructions only when requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "Line 1\n\nLine 2",
				},
				{ instructions: "Line 1\n\nLine 2" },
			),
		).toBe(true);
	});

	test("requires both name and instructions when both are requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "Line 1",
				},
				{
					name: "AC GPT R test",
					instructions: "Different line",
				},
			),
		).toBe(false);
	});
});

describe("normalizeProjectMemoryMode", () => {
	test("accepts the user-facing global alias", () => {
		expect(normalizeProjectMemoryMode("global")).toBe("global");
		expect(normalizeProjectMemoryMode("default")).toBe("global");
	});

	test("accepts the user-facing project alias", () => {
		expect(normalizeProjectMemoryMode("project")).toBe("project");
		expect(normalizeProjectMemoryMode("project-only")).toBe("project");
	});
});

describe("matchesChatgptDeleteConfirmationProbe", () => {
	test("accepts the native delete dialog when the confirm button is visible even if title text drifted", () => {
		expect(
			matchesChatgptDeleteConfirmationProbe(
				{
					dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
					buttonLabels: ["Delete", "Cancel"],
					hasVisibleConfirmButton: true,
				},
				"Older page title that no longer matches",
			),
		).toBe(true);
	});

	test("still requires the expected title when no visible confirm button is present", () => {
		expect(
			matchesChatgptDeleteConfirmationProbe(
				{
					dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
					buttonLabels: ["Delete", "Cancel"],
					hasVisibleConfirmButton: false,
				},
				"Older page title that no longer matches",
			),
		).toBe(false);
	});
});

describe("matchesChatgptProjectDeleteConfirmationProbe", () => {
	test("accepts the project delete dialog when the expected buttons are visible", () => {
		expect(
			matchesChatgptProjectDeleteConfirmationProbe({
				dialogText:
					"Delete project? This will permanently delete all project files and chats. To save chats, move them to your chat list or another project before deleting. Delete Cancel",
				buttonLabels: ["Delete", "Cancel"],
			}),
		).toBe(true);
	});

	test("rejects non-project dialogs even if delete and cancel buttons exist", () => {
		expect(
			matchesChatgptProjectDeleteConfirmationProbe({
				dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
				buttonLabels: ["Delete", "Cancel"],
			}),
		).toBe(false);
	});
});

describe("matchesChatgptConversationTitleProbe", () => {
	test("accepts a matching root conversation row even when another row remains at the top", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69ca9d71-1a04-8332-abe1-830d327b2a65",
					topTitle: "Something else",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
			),
		).toBe(true);
	});

	test("requires the matching row to be top for strict root checks", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69ca9d71-1a04-8332-abe1-830d327b2a65",
					topTitle: "Something else",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				null,
				{ requireTopForRootMatch: true },
			),
		).toBe(false);
	});

	test("passes strict root checks when the matching row is already top", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					topTitle: "AC GPT C tpuivt",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				null,
				{ requireTopForRootMatch: true },
			),
		).toBe(true);
	});

	test("accepts root conversation page-title fallback when the sidebar row is unavailable", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					routeConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					routeProjectId: null,
					documentTitle: "AC GPT C tpuivt - ChatGPT",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
			),
		).toBe(true);
	});

	test("does not apply the root page-title fallback to project conversations", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					routeConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					routeProjectId: "g-p-69c851be8cc88191afe109bea1b2a28d",
					documentTitle: "AC GPT C tpuivt - ChatGPT",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				"g-p-69c851be8cc88191afe109bea1b2a28d",
			),
		).toBe(false);
	});
});

describe("matchesChatgptRenameEditorProbe", () => {
	test("accepts the visible title editor input", () => {
		expect(
			matchesChatgptRenameEditorProbe({
				inputName: "title-editor",
				value: "AC GPT C tpuivt",
				active: true,
			}),
		).toBe(true);
	});

	test("rejects unrelated active text inputs", () => {
		expect(
			matchesChatgptRenameEditorProbe({
				inputName: "search",
				value: "AC GPT C tpuivt",
				active: true,
			}),
		).toBe(false);
	});

	test("rejects missing probes", () => {
		expect(matchesChatgptRenameEditorProbe(null)).toBe(false);
	});
});

describe("resolveChatgptConversationUrl", () => {
	test("builds a root conversation route when no project is supplied", () => {
		expect(resolveChatgptConversationUrl("69c93b5d-e6b0-8332-8c20-da466cc863da")).toBe(
			"https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
		);
	});

	test("builds a canonical project conversation route from a bare or slugged project id", () => {
		expect(
			resolveChatgptConversationUrl(
				"69c93212-f180-8330-815b-5f831fc395e6",
				"g-p-69c851be8cc88191afe109bea1b2a28d-oracle",
			),
		).toBe(
			"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/c/69c93212-f180-8330-815b-5f831fc395e6",
		);
		expect(
			resolveChatgptConversationUrl(
				"69c93212-f180-8330-815b-5f831fc395e6",
				"133ad4c5-b857-4a30-bf17-d951db57c33f",
			),
		).toBe(
			"https://chatgpt.com/g/133ad4c5-b857-4a30-bf17-d951db57c33f/c/69c93212-f180-8330-815b-5f831fc395e6",
		);
	});
});

describe("normalizeChatgptConversationHistoryLimit", () => {
	test("normalizes bounded history requests", () => {
		expect(normalizeChatgptConversationHistoryLimit(250.9)).toBe(250);
		expect(normalizeChatgptConversationHistoryLimit(0)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(-10)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(Number.NaN)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(undefined)).toBe(0);
	});
});

describe("createChatgptAdapter", () => {
	test("advertises project and conversation support", () => {
		expect(createChatgptAdapter().capabilities).toEqual({
			projects: true,
			conversations: true,
			instructions: true,
			files: true,
		});
	});
});
