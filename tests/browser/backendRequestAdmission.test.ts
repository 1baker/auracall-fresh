import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import CDP, {
	setCdpCommandAdmissionResolver,
} from "../../packages/browser-service/src/guardedCdp.js";
import { createChatgptAccountMirrorMetadataCollector } from "../../src/accountMirror/chatgptMetadataCollector.js";
import { createAccountMirrorMetadataTrafficPlanController } from "../../src/accountMirror/providerTrafficPlan.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { recordChatgptRateLimitDetection } from "../../src/browser/chatgptRateLimitGuard.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { ChatgptService } from "../../src/browser/llmService/providers/chatgptService.js";
import {
	annotateClientMutationContext,
	resolveProviderTrafficGovernor,
} from "../../src/browser/providers/mutationAudit.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

const fixture = vi.hoisted(() => ({
	page: undefined as
		| undefined
		| {
				url: string;
				navigations: string[];
				bootstrapRequests: number;
				payloadReads: number;
				closeAttempts: number;
				failClose?: boolean;
				stallClose?: boolean;
				warnPayload?: boolean;
				failRead?: boolean;
				abortRead?: () => void;
				failContinuation?: boolean;
		  },
	clients: [] as Array<{
		requests: string[];
		failures: string[];
		handler?: (event: unknown) => Promise<void>;
		failContinuation?: boolean;
		beforeContinue?: () => Promise<void>;
		responseHandler?: (event: unknown) => Promise<void>;
	}>,
}));
vi.mock("chrome-remote-interface", () => ({
	default: vi.fn(async () => {
		const state = {
			requests: [] as string[],
			failures: [] as string[],
			failContinuation: fixture.page?.failContinuation ?? false,
			beforeContinue: undefined as (() => Promise<void>) | undefined,
			responseHandler: undefined as ((event: unknown) => Promise<void>) | undefined,
			handler: undefined as ((event: unknown) => Promise<void>) | undefined,
		};
		fixture.clients.push(state);
		const client = {
			send: async (
				command: string,
				parameters: { requestId?: string; expression?: string; url?: string },
			) => {
				if (command === "Fetch.continueRequest" || command === "Fetch.failRequest") {
					if (!parameters.requestId) throw new Error("Missing fixture request ID");
					(command === "Fetch.continueRequest" ? state.requests : state.failures).push(
						parameters.requestId,
					);
				}
				if (command === "Fetch.continueRequest" && state.failContinuation)
					throw new Error("Fixture continuation outcome is unknown");
				if (command === "Fetch.continueRequest") await state.beforeContinue?.();
				if (
					command === "Fetch.continueRequest" &&
					fixture.page?.warnPayload &&
					parameters.requestId?.startsWith("payload-")
				)
					await state.responseHandler?.({
						response: {
							url: "https://chatgpt.com/backend-api/conversation/fixture-conversation",
							status: 429,
						},
					});
				if (command === "Page.navigate" && fixture.page) {
					if (!state.handler)
						throw new Error("Provider navigation started before request interception");
					if (!parameters.url) throw new Error("Missing navigation URL");
					fixture.page.navigations.push(parameters.url);
					fixture.page.url = parameters.url;
					for (let index = 0; index < fixture.page.bootstrapRequests; index++)
						await state.handler({
							requestId: `bootstrap-${index}`,
							request: { url: "https://chatgpt.com/backend-api/conversations" },
						});
					return { frameId: "fixture-frame" };
				}
				if (command === "Runtime.evaluate" && fixture.page) {
					const expression = parameters.expression ?? "";
					let value: unknown = [];
					if (expression === "location.href") value = fixture.page.url;
					else if (expression.includes("/api/auth/session"))
						value = { user: { id: "fixture-user", email: "operator@example.test" } };
					else if (
						expression.includes("const rawConversationId") ||
						expression.includes("document.readyState")
					)
						value = true;
					else if (expression.includes("/backend-api/conversation/")) {
						const requestId = `payload-${++fixture.page.payloadReads}`;
						if (!state.handler)
							throw new Error("Payload fetch started without request interception");
						await state.handler({
							requestId,
							request: { url: "https://chatgpt.com/backend-api/conversation/fixture-conversation" },
						});
						value =
							state.requests.includes(requestId) && !state.failures.includes(requestId)
								? { ok: true, body: JSON.stringify({ mapping: {} }) }
								: { ok: false, status: 0, body: null };
					} else if (expression.includes("const pageStart =")) {
						if (fixture.page.abortRead) {
							const abort = fixture.page.abortRead;
							fixture.page.abortRead = undefined;
							abort();
							throw new Error("fixture context interrupted");
						}
						if (fixture.page.failRead) throw new Error("fixture public read failed");
						value = {
							messages: [{ role: "assistant", text: "Known fixture answer" }],
							nextOffset: null,
							totalMessages: 1,
						};
					}
					return { result: { value } };
				}
				return {};
			},
			close: async () => {
				if (fixture.page) {
					fixture.page.closeAttempts++;
					if (fixture.page.failClose) throw new Error("fixture transport close outcome unknown");
					if (fixture.page.stallClose) await new Promise<never>(() => undefined);
				}
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Runtime: {
				enable: () => client.send("Runtime.enable", {}),
				evaluate: (input: { expression: string }) => client.send("Runtime.evaluate", input),
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Page: {
				enable: () => client.send("Page.enable", {}),
				navigate: (input: { url: string }) => client.send("Page.navigate", input),
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Network: {
				enable: async () => undefined,
				loadingFinished: () => () => undefined,
				responseReceived: (handler: (event: unknown) => Promise<void>) => {
					state.responseHandler = handler;
					return () => {
						state.responseHandler = undefined;
					};
				},
			},
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Fetch: {
				requestPaused: (handler: (event: unknown) => Promise<void>) => {
					state.handler = handler;
					return () => {
						state.handler = undefined;
					};
				},
				enable: (parameters: unknown) => client.send("Fetch.enable", parameters as never),
				disable: () => client.send("Fetch.disable", {}),
				continueRequest: (parameters: { requestId: string }) =>
					client.send("Fetch.continueRequest", parameters),
				failRequest: (parameters: { requestId: string }) =>
					client.send("Fetch.failRequest", parameters),
			},
		};
		return client;
	}),
}));

test.each([
	"known",
	"active-action",
	"mixed-failure",
])("owned backend denial releases only known custody; mode=%s", async (mode) => {
	const pendingAction = mode === "active-action";
	const mixedFailure = mode === "mixed-failure";
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-request-admission-"));
	setAuracallHomeDirOverrideForTest(home);
	fixture.clients.length = 0;
	const clients: Array<Awaited<ReturnType<typeof CDP>>> = [];
	setCdpCommandAdmissionResolver(async ({ port }) => {
		const gate = new DesktopControlGate(`fixture-${port}`);
		return {
			run: (_command, effect) => gate.withAutomation("generation", effect),
			hold: async () => {
				const held = await gate.holdAutomation("generation");
				return { run: (_command, effect) => held.run(effect), close: () => held.close() };
			},
		};
	});
	try {
		for (let index = 0; index < 2; index++) {
			const client = await CDP({ host: "127.0.0.1", port: 45130 + index });
			clients.push(client);
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: {
					auracallProfile: `runtime-${index}`,
					services: { chatgpt: { identity: { email: "operator@example.test" } } },
				} as never,
				provider: "chatgpt",
				managedBrowserProfile: `/fixture/${index}`,
				mutationAudit: async () => undefined,
				baseOptions: {},
				backendRequestLimit: mixedFailure ? 2 : 1,
			});
			await annotateClientMutationContext(
				client,
				{ providerTrafficAuthorityFactory: factory, providerTrafficRequired: true },
				"provider:chatgpt",
				`target-${index}`,
			);
		}
		expect(fixture.clients[0].handler).toBeTypeOf("function");
		const firstHandler = fixture.clients[0].handler;
		const secondHandler = fixture.clients[1].handler;
		if (!firstHandler || !secondHandler) throw new Error("Expected owned request handlers");
		const request = (requestId: string) => ({
			requestId,
			networkId: requestId,
			request: { url: "https://chatgpt.com/backend-api/conversations?private=fixture" },
		});
		await firstHandler(request("first"));
		await firstHandler(request("first"));
		await firstHandler({
			requestId: "static",
			request: { url: "https://chatgpt.com/cdn/asset.js" },
		});
		if (pendingAction) {
			const governor = resolveProviderTrafficGovernor(clients[1]);
			if (!governor) throw new Error("Expected owned governor");
			await governor.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "fixture:unfinished-navigation",
				targetId: "target-1",
			});
			await clients[1].send("Page.navigate", { url: "https://fixture.invalid" });
		}
		fixture.clients[1].failContinuation = mixedFailure;
		await secondHandler(request("second"));
		if (mixedFailure) await secondHandler(request("third"));
		expect(fixture.clients[0].requests).toEqual(["first", "static"]);
		expect(fixture.clients[1].requests).toEqual(mixedFailure ? ["second"] : []);
		expect(fixture.clients[1].failures).toEqual(mixedFailure ? ["second", "third"] : ["second"]);
		const ledger = createBrowserTabConcurrencyRuntime({
			auracallProfile: "runtime-0",
		} as never).ledger;
		if (!ledger) throw new Error("Expected fixture ledger");
		const records = await ledger.list();
		expect(records.filter((record) => record.interactionClass === "backend-request")).toHaveLength(
			mixedFailure ? 2 : 1,
		);
		expect(JSON.stringify(records)).not.toContain("private=fixture");
		await clients[0].close();
		if (mixedFailure) {
			const error = await clients[1].close().catch((error) => error);
			const messages = (value: unknown): string[] =>
				value instanceof AggregateError
					? value.errors.flatMap(messages)
					: value instanceof Error
						? [value.message]
						: [];
			expect(messages(error)).toContain("Fixture continuation outcome is unknown");
			// An uncertain dispatch now fences the next request before another quota check.
			expect(fixture.clients[1].requests).toEqual(["second"]);
		} else if (pendingAction)
			await expect(clients[1].close()).rejects.toMatchObject({
				message: "Provider cleanup and authority settlement failed.",
				errors: [
					expect.objectContaining({
						errors: [
							expect.objectContaining({
								message: "Backend request admission denied: minute-backend-request-limit.",
							}),
						],
					}),
					expect.objectContaining({
						message: "Provider traffic lease release failed: invalid-transition.",
					}),
				],
			});
		else
			await expect(clients[1].close()).rejects.toMatchObject({
				message: "Provider observer cleanup failed.",
			});
		const registry = createBrowserTabConcurrencyRuntime({
			auracallProfile: "runtime-1",
		} as never).registry;
		if (!registry) throw new Error("Expected fixture registry");
		const leases = await registry.list();
		const deniedLease = leases.find((lease) => lease.targetId === "target-1");
		expect(deniedLease).toMatchObject(
			pendingAction || mixedFailure
				? { state: "idle", effectState: "outcome-unknown" }
				: { state: "released", effectState: "none" },
		);
		for (let index = 0; index < 2; index++) {
			expect(fixture.clients[index].handler).toBeUndefined();
			const gate = new DesktopControlGate(`fixture-${45130 + index}`);
			const human = await gate.takeControl("generation");
			await gate.releaseControl(human.token, "generation");
		}
	} finally {
		for (const client of clients) await client.close().catch(() => undefined);
		setCdpCommandAdmissionResolver(undefined);
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("closing an owned client retains its warning observer while backend dispatch drains", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-draining-request-"));
	setAuracallHomeDirOverrideForTest(home);
	fixture.clients.length = 0;
	const gate = new DesktopControlGate("fixture-drain");
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => gate.withAutomation("generation", effect),
		hold: async () => {
			const held = await gate.holdAutomation("generation");
			return { run: (_command, effect) => held.run(effect), close: () => held.close() };
		},
	}));
	let entered!: () => void;
	let release!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const resumed = new Promise<void>((resolve) => {
		release = resolve;
	});
	let client: Awaited<ReturnType<typeof CDP>> | undefined;
	let sending: Promise<void> | undefined;
	let closing: Promise<unknown> | undefined;
	const config = {
		auracallProfile: "fixture",
		services: { chatgpt: { identity: { email: "operator@example.test" } } },
	} as never;
	try {
		client = await CDP({ host: "127.0.0.1", port: 45130 });
		const factory = createConfiguredProviderTrafficAuthorityFactory({
			userConfig: config,
			provider: "chatgpt",
			managedBrowserProfile: "/fixture/managed",
			mutationAudit: async () => undefined,
			baseOptions: {},
			backendRequestLimit: 1,
		});
		await annotateClientMutationContext(
			client,
			{ providerTrafficAuthorityFactory: factory, providerTrafficRequired: true },
			"provider:chatgpt",
			"fixture-target",
		);
		const state = fixture.clients[0];
		state.beforeContinue = async () => {
			entered();
			await resumed;
		};
		if (!state.handler) throw new Error("Expected backend handler");
		sending = state.handler({
			requestId: "fixture-request",
			request: { url: "https://chatgpt.com/backend-api/conversations" },
		});
		await started;
		closing = client.close().catch((error) => error);
		expect(state.responseHandler).toBeTypeOf("function");
		if (!state.responseHandler) throw new Error("Expected warning observer during drain");
		await state.responseHandler({
			response: { url: "https://chatgpt.com/backend-api/conversations", status: 429 },
		});
		release();
		await sending;
		expect(await closing).toBeInstanceOf(AggregateError);
		const ledger = createBrowserTabConcurrencyRuntime(config).ledger;
		if (!ledger) throw new Error("Expected fixture ledger");
		expect(await ledger.listActiveProviderWarnings({ now: new Date().toISOString() })).toHaveLength(
			1,
		);
	} finally {
		release();
		await sending;
		await closing;
		await client?.close().catch(() => undefined);
		setCdpCommandAdmissionResolver(undefined);
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test.each([
	"budget",
	"warning",
	"uncertain",
	"active-action",
	"detail-budget",
	"detail-warning",
	"detail-persisted-warning",
	"detail-uncertain",
	"detail-active-action",
	"detail-chunk",
	"files-budget",
	"files-warning",
	"files-persisted-warning",
	"files-uncertain",
	"files-active-action",
	"library-budget",
	"library-warning",
	"library-persisted-warning",
	"library-uncertain",
	"library-active-action",
])("unfinished owned read yields only known budget denial; mode=%s", async (mode) => {
	const detail = mode.startsWith("detail-");
	const projectFiles = mode.startsWith("files-");
	const library = mode.startsWith("library-");
	const failureMode =
		mode === "detail-chunk" ? "budget" : mode.replace(/^(detail|files|library)-/, "");
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-project-request-yield-"));
	setAuracallHomeDirOverrideForTest(home);
	fixture.clients.length = 0;
	const clients: Array<Awaited<ReturnType<typeof CDP>>> = [];
	const gate = new DesktopControlGate("fixture-project-yield");
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => gate.withAutomation("generation", effect),
		hold: async () => {
			const held = await gate.holdAutomation("generation");
			return { run: (_command, effect) => held.run(effect), close: () => held.close() };
		},
	}));
	const identity = {
		email: "operator@example.test",
		accountLevel: "Business",
		source: "auth-session",
	};
	const config = {
		runtimeProfiles: {
			default: {
				browserProfile: "default",
				defaultService: "chatgpt",
				services: { chatgpt: { identity } },
			},
		},
	};
	const sessionAuthority = createProviderSessionAuthority({
		profiles: { default: { services: { chatgpt: { identity } } } },
	});
	const context = {
		providerId: "chatgpt" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		managedBrowserProfile: "/fixture/managed",
		browserProcessId: 1234,
		browserTargetId: "fixture",
	};
	const proof = sessionAuthority.verify({
		context,
		expectation: sessionAuthority.resolveExpectation(context),
		observation: identity,
	});
	const calls: string[] = [];
	try {
		const collect = async (
			pass: number,
			previousEvidence?: Parameters<
				ReturnType<typeof createChatgptAccountMirrorMetadataCollector>["collect"]
			>[0]["previousEvidence"],
		) => {
			const client = await CDP({ host: "127.0.0.1", port: 45150 });
			clients.push(client);
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: { auracallProfile: "default", services: { chatgpt: { identity } } } as never,
				provider: "chatgpt",
				managedBrowserProfile: "/fixture/managed",
				mutationAudit: async () => undefined,
				baseOptions: {},
				now: () => new Date(1792036000000 + pass * 61000),
				backendRequestLimit: failureMode === "uncertain" ? 2 : 1,
			});
			await annotateClientMutationContext(
				client,
				{ providerTrafficAuthorityFactory: factory, providerTrafficRequired: true },
				"provider:chatgpt",
				`project-pass-${pass}`,
			);
			const governor = resolveProviderTrafficGovernor(client);
			if (!governor) throw new Error("Expected owned governor");
			const controller = createAccountMirrorMetadataTrafficPlanController(governor, {
				maxPageReadsPerCycle: 4,
			});
			const transport = fixture.clients[fixture.clients.length - 1];
			if ((mode === "detail-chunk" || library) && pass === 0) {
				if (!transport.handler) throw new Error("Expected owned request handler");
				await transport.handler({
					requestId: "prior-work",
					request: { url: "https://chatgpt.com/backend-api/conversations" },
				});
			}
			const readRow = async (projectId: string) => {
				calls.push(projectId);
				if ((projectId === "project_2" || library) && failureMode === "active-action") {
					await governor.begin({
						kind: "navigate",
						interactionClass: "renavigation",
						source: "fixture:unfinished-project",
					});
					await client.send("Page.navigate", { url: "https://fixture.invalid" });
				}
				if (!transport.handler) throw new Error("Expected owned request handler");
				if ((projectId === "project_2" || library) && failureMode === "uncertain")
					transport.failContinuation = true;
				await transport.handler({
					requestId: projectId,
					request: { url: "https://chatgpt.com/backend-api/conversations" },
				});
				if (transport.failures.length && failureMode === "persisted-warning") {
					await recordChatgptRateLimitDetection({
						profileName: "default",
						action: "fixture:other-owner",
						reason: "fixture external warning",
					});
				}
				if (transport.failures.length && failureMode === "warning") {
					if (!transport.responseHandler) throw new Error("Expected owned warning observer");
					await transport.responseHandler({
						response: { url: "https://chatgpt.com/backend-api/conversations", status: 429 },
					});
				}
				if (transport.failures.length) await client.close();
				return [{ id: `conv_${projectId}`, title: projectId, projectId, provider: "chatgpt" }];
			};
			const collector = createChatgptAccountMirrorMetadataCollector(config as never, {
				createClient: async () =>
					({
						getProviderSessionProof: async () => proof,
						listProjects: async () =>
							(library ? [] : ["project_1", "project_2"]).map((id) => ({
								id,
								name: id,
								provider: "chatgpt",
							})),
						listConversations: readRow,
						listAccountFiles: async () => {
							if (!library) return [];
							await readRow("library");
							return [
								{ id: "library-file", name: "library.csv", provider: "chatgpt", source: "library" },
							];
						},
						listProjectFiles: async (id: string) => {
							if (!projectFiles) return [];
							await readRow(id);
							return [
								{ id: `file_${id}`, name: `${id}.csv`, provider: "chatgpt", source: "project" },
							];
						},
						listConversationFiles: async () => [],
						getConversationContext: async (
							id: string,
							options: {
								listOptions: { accountMirrorContextChunk: { startMessageIndex: number } };
							},
						) => {
							if (mode === "detail-chunk")
								expect(options.listOptions.accountMirrorContextChunk.startMessageIndex).toBe(24);
							if (!detail) throw new Error("No detail reads authorized");
							await readRow(id);
							return {
								provider: "chatgpt",
								conversationId: id,
								messages: [],
								files: [],
								artifacts: [{ id: `artifact_${id}`, title: id, kind: "spreadsheet" }],
							};
						},
					}) as never,
			});
			try {
				return await collector.collect({
					provider: "chatgpt",
					runtimeProfileId: "default",
					expectedIdentityKey: identity.email,
					sweepMode: library ? "full_sweep" : "steady_follow",
					requestedPhase: detail ? "detail-inventory" : "project-conversations",
					...(detail
						? {
								previousConversations: ["project_1", "project_2"].map((id) => ({
									id,
									title: id,
									provider: "chatgpt" as const,
								})),
							}
						: {}),
					previousEvidence:
						previousEvidence ??
						(detail
							? ({
									identitySource: "auth-session",
									truncated: { projects: false, conversations: false, artifacts: true },
									...(mode === "detail-chunk"
										? {
												attachmentInventory: {
													nextProjectIndex: 0,
													nextConversationIndex: 1,
													detailReadLimit: 4,
													scannedProjects: 0,
													scannedConversations: 0,
													conversationDetail: {
														conversationId: "project_2",
														nextMessageIndex: 24,
														messageLimit: 24,
														totalMessages: 48,
													},
												},
											}
										: {}),
									conversationFreshnessFrontier: {
										selectedConversationIds: ["project_1", "project_2"],
									},
								} as never)
							: undefined),
					providerTrafficGovernor: controller.governor,
					providerTrafficPlanController:
						(detail && mode !== "detail-chunk") || projectFiles ? undefined : controller,
					limits: {
						maxPageReadsPerCycle: 4,
						maxConversationRowsPerCycle: projectFiles || library ? 0 : 30,
						maxArtifactRowsPerCycle: detail || projectFiles || library ? 20 : 0,
						maxBrowserInteractionsPerMinute: 0,
					},
				});
			} finally {
				await client.close();
			}
		};
		if (failureMode !== "budget") {
			const error = await collect(0).catch((error: unknown) => error);
			if (failureMode === "persisted-warning") {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("fixture external warning");
				expect(calls).toEqual(library ? ["library"] : ["project_1", "project_2"]);
				return;
			}
			expect(error).toBeInstanceOf(AggregateError);
			const messages = (value: unknown): string[] =>
				value instanceof AggregateError
					? value.errors.flatMap(messages)
					: value instanceof Error
						? [value.message]
						: [];
			expect(messages(error)).toContain(
				failureMode === "uncertain"
					? "Fixture continuation outcome is unknown"
					: failureMode === "active-action"
						? "Provider traffic lease release failed: invalid-transition."
						: "Backend request admission denied: minute-backend-request-limit.",
			);
			expect(calls).toEqual(library ? ["library"] : ["project_1", "project_2"]);
			return;
		}
		const first = await collect(0);
		if (library) {
			expect(calls).toEqual(["library"]);
			expect(first.manifests.files).toEqual([]);
			expect(first.evidence.truncated.artifacts).toBe(true);
			expect(first.evidence.attachmentInventory).toMatchObject({ yielded: true });
			const second = await collect(1, JSON.parse(JSON.stringify(first.evidence)));
			expect(calls).toEqual(["library", "library"]);
			expect(second.manifests.files.map((f) => f.id)).toEqual(["library-file"]);
			expect(second.evidence.truncated.artifacts).toBe(false);
			expect(second.evidence.attachmentInventory).toMatchObject({ yielded: false });
			return;
		}
		if (mode === "detail-chunk") {
			expect(calls).toEqual(["project_2"]);
			expect(first.manifests.artifacts).toEqual([]);
			expect(first.evidence.detailConversationIdsThisPass).toEqual([]);
			expect(first.evidence.attachmentInventory).toMatchObject({
				nextConversationIndex: 0,
				yielded: true,
				conversationDetail: { conversationId: "project_2", nextMessageIndex: 24 },
			});
			const second = await collect(1, JSON.parse(JSON.stringify(first.evidence)));
			expect(calls).toEqual(["project_2", "project_2"]);
			expect(second.manifests.artifacts.map((a) => a.id)).toEqual(["artifact_project_2"]);
			expect(second.evidence.detailConversationIdsThisPass).toEqual(["project_2"]);
			expect(second.evidence.attachmentInventory?.conversationDetail).toBeNull();
			return;
		}
		expect(calls).toEqual(["project_1", "project_2"]);
		if (projectFiles) {
			expect(first.manifests.files.map((f) => f.id)).toEqual(["file_project_1"]);
			expect(first.evidence.attachmentInventory).toMatchObject({
				nextProjectIndex: 1,
				yielded: true,
			});
			expect(first.evidence.truncated.artifacts).toBe(true);
			const second = await collect(1, JSON.parse(JSON.stringify(first.evidence)));
			expect(calls).toEqual(["project_1", "project_2", "project_2"]);
			expect(second.manifests.files.map((f) => f.id)).toEqual(["file_project_2"]);
			expect(second.evidence.attachmentInventory).toMatchObject({
				nextProjectIndex: 0,
				yielded: false,
			});
			return;
		}
		if (detail) {
			expect(first.manifests.artifacts.map((a) => a.id)).toEqual(["artifact_project_1"]);
			expect(first.evidence.detailConversationIdsThisPass).toEqual(["project_1"]);
			expect(first.evidence.attachmentInventory).toMatchObject({
				nextConversationIndex: 1,
				yielded: true,
			});
			expect(first.evidence.truncated.artifacts).toBe(true);
			const second = await collect(1, JSON.parse(JSON.stringify(first.evidence)));
			expect(calls).toEqual(["project_1", "project_2", "project_2"]);
			expect(second.manifests.artifacts.map((a) => a.id)).toEqual(["artifact_project_2"]);
			expect(second.evidence.detailConversationIdsThisPass).toEqual(["project_2"]);
			expect(second.evidence.attachmentInventory).toMatchObject({
				nextConversationIndex: 0,
				yielded: false,
			});
			return;
		}
		expect(first.manifests.conversations.map((c) => c.id)).toEqual(["conv_project_1"]);
		expect(first.evidence.projectConversations).toMatchObject({
			nextProjectIndex: 1,
			scannedProjects: 1,
			yielded: true,
		});
		expect(first.evidence.truncated.conversations).toBe(true);
		const second = await collect(1, JSON.parse(JSON.stringify(first.evidence)));
		expect(calls).toEqual(["project_1", "project_2", "project_2"]);
		expect(second.manifests.conversations.map((c) => c.id)).toEqual(["conv_project_2"]);
		expect(second.evidence.projectConversations).toMatchObject({
			nextProjectIndex: 0,
			scannedProjects: 1,
			yielded: false,
		});
	} finally {
		for (const client of clients) await client.close().catch(() => undefined);
		setCdpCommandAdmissionResolver(undefined);
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test.each([
	"factory-first",
	"utility-first",
	"uncertain",
	"warning",
	"disabled",
	"lease-lost",
	"reconcile-failure",
])("utility request admission shares account permits and preserves effects; mode=%s", async (mode) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-utility-request-"));
	setAuracallHomeDirOverrideForTest(home);
	fixture.clients.length = 0;
	const clients: Array<Awaited<ReturnType<typeof CDP>>> = [];
	const gate = new DesktopControlGate("fixture-utility-request");
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => gate.withAutomation("generation", effect),
		hold: async () => {
			const held = await gate.holdAutomation("generation");
			return { run: (_command, effect) => held.run(effect), close: () => held.close() };
		},
	}));
	const identity = { email: "operator@example.test" };
	const config = {
		auracallProfile: "utility",
		services: { chatgpt: { identity } },
		browser: { tabConcurrencyMode: "tab-affinity" },
	} as never;
	const pages = new Map<string, string>();
	const runtime = createBrowserTabConcurrencyRuntime(config);
	let failReconciliation = false;
	const ledger = runtime.ledger;
	if (!ledger) throw new Error("Expected utility ledger");
	const utilityLedger = new Proxy(ledger, {
		get(target, key, receiver) {
			if (key === "list")
				return async (...args: Parameters<typeof ledger.list>) => {
					if (failReconciliation) throw new Error("fixture reconciliation failed");
					return target.list(...args);
				};
			const value = Reflect.get(target, key, receiver) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	const request = (requestId: string) => ({
		requestId,
		request: { url: "https://chatgpt.com/backend-api/conversations" },
	});
	const configuredRequest = async (denied: boolean) => {
		const client = await CDP({ host: "127.0.0.1", port: 45160 });
		clients.push(client);
		const factory = createConfiguredProviderTrafficAuthorityFactory({
			userConfig: { auracallProfile: "other", services: { chatgpt: { identity } } } as never,
			provider: "chatgpt",
			managedBrowserProfile: "/fixture/other",
			mutationAudit: async () => undefined,
			baseOptions: {},
			backendRequestLimit: 1,
		});
		await annotateClientMutationContext(
			client,
			{ providerTrafficAuthorityFactory: factory, providerTrafficRequired: true },
			"provider:chatgpt",
			"other-target",
		);
		const state = fixture.clients[fixture.clients.length - 1];
		if (!state.handler) throw new Error("Expected configured request interceptor");
		await state.handler(request("other"));
		if (denied) await expect(client.close()).rejects.toBeInstanceOf(AggregateError);
		else await client.close();
		expect(state.requests).toEqual(denied ? [] : ["other"]);
		expect(state.failures).toEqual(denied ? ["other"] : []);
	};
	try {
		if (mode === "factory-first") await configuredRequest(false);
		const utilityIndex = fixture.clients.length;
		const running = runConfiguredChatgptUtilityOperation({
			userConfig: config,
			browserService: {
				resolveServiceTarget: async () => ({
					host: "127.0.0.1",
					port: 45161,
					managedBrowserProfile: "/fixture/utility",
					browserProcessId: process.pid,
				}),
			} as never,
			utilityId: "fixture-utility",
			mutability: "read-only",
			backendRequestLimit: mode === "disabled" ? undefined : 1,
			buildListOptions: async (options) => options,
			deps: {
				createRuntime: () => ({ ...runtime, ledger: utilityLedger }),
				listTargets: async () =>
					[...pages].map(([id, url]) => ({ id, url, type: "page" })) as never,
				openTarget: async (_port, url) => {
					pages.set("utility-target", url);
					return { id: "utility-target", url } as never;
				},
				closeTarget: async () => undefined,
			},
			run: async (options) => {
				const client = await CDP({ host: "127.0.0.1", port: 45161 });
				clients.push(client);
				await annotateClientMutationContext(
					client,
					options,
					"provider:chatgpt",
					options.tabTargetId,
				);
				const state = fixture.clients[utilityIndex];
				if (mode === "disabled") {
					expect(state.handler).toBeUndefined();
					await client.close();
					return "request admission disabled";
				}
				expect(state.handler).toBeTypeOf("function");
				if (!state.handler) throw new Error("Expected utility request interceptor");
				state.failContinuation = mode === "uncertain";
				if (mode === "warning")
					state.beforeContinue = async () => {
						if (!state.responseHandler) throw new Error("Expected utility warning observer");
						await state.responseHandler({
							response: { url: "https://chatgpt.com/backend-api/conversations", status: 429 },
						});
					};
				if (mode === "lease-lost") {
					const lease = (await runtime.registry?.list())?.find(
						(lease) => lease.targetId === "utility-target",
					);
					if (!lease || !runtime.registry) throw new Error("Expected exact utility lease");
					const idle = await runtime.registry.idle({
						claim: {
							leaseId: lease.leaseId,
							revision: lease.revision,
							operationId: "fixture-utility",
						},
						now: new Date().toISOString(),
						effectState: "settled",
					});
					expect(idle.ok).toBe(true);
				}
				await state.handler(request("utility"));
				await client.close();
				if (mode === "utility-first") {
					await configuredRequest(true);
					return "utility sent once";
				}
				if (mode === "reconcile-failure") {
					failReconciliation = true;
					throw new Error("fixture operation failed");
				}
				throw new Error("Unreachable after denied or uncertain close");
			},
		});
		if (mode === "utility-first") await expect(running).resolves.toBe("utility sent once");
		else if (mode === "disabled") await expect(running).resolves.toBe("request admission disabled");
		else if (mode === "reconcile-failure") {
			const error = await running.catch((error: unknown) => error);
			expect(error).toBeInstanceOf(AggregateError);
			const messages = (value: unknown): string[] =>
				value instanceof AggregateError
					? value.errors.flatMap(messages)
					: value instanceof Error
						? [value.message]
						: [];
			expect(messages(error)).toEqual(
				expect.arrayContaining(["fixture operation failed", "fixture reconciliation failed"]),
			);
		} else await expect(running).rejects.toBeInstanceOf(AggregateError);
		expect(fixture.clients[utilityIndex].requests).toEqual(
			mode === "factory-first" || mode === "disabled" || mode === "lease-lost" ? [] : ["utility"],
		);
		expect(fixture.clients[utilityIndex].failures).toEqual(
			mode === "utility-first" || mode === "disabled" || mode === "reconcile-failure"
				? []
				: ["utility"],
		);

		failReconciliation = false;
		const requestRecords = (await ledger.list()).filter(
			(record) =>
				record.operationId === "fixture-utility" && record.interactionClass === "backend-request",
		);
		expect(requestRecords).toHaveLength(
			mode === "factory-first" || mode === "disabled" || mode === "lease-lost" ? 0 : 1,
		);
		const leases = (await runtime.registry?.list())?.filter(
			(lease) => lease.targetId === "utility-target",
		);
		expect(leases).toHaveLength(1);
		expect(leases?.[0]).toMatchObject({
			state: "idle",
			effectState:
				mode === "uncertain" || mode === "warning" || mode === "reconcile-failure"
					? "outcome-unknown"
					: "settled",
		});
		if (mode === "warning") {
			const ledger = runtime.ledger;
			if (!ledger) throw new Error("Expected utility ledger");
			expect(
				await ledger.listActiveProviderWarnings({ now: new Date().toISOString() }),
			).toHaveLength(1);
		}
	} finally {
		for (const client of clients) await client.close().catch(() => undefined);
		setCdpCommandAdmissionResolver(undefined);
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test.each([
	"invalid-limit",
	"inherited-session",
])("utility rejects %s before resolving a browser", async (mode) => {
	const resolveServiceTarget = vi.fn();
	const close = vi.fn();
	await expect(
		runConfiguredChatgptUtilityOperation({
			userConfig: { browser: { tabConcurrencyMode: "tab-affinity" } } as never,
			browserService: { resolveServiceTarget } as never,
			utilityId: mode,
			mutability: "read-only",
			backendRequestLimit: mode === "invalid-limit" ? 0 : 1,
			options:
				mode === "inherited-session"
					? { providerSession: { providerId: "chatgpt", key: "foreign", value: {}, close } }
					: {},
			buildListOptions: async (options) => options,
			run: vi.fn(),
		}),
	).rejects.toThrow(
		mode === "invalid-limit" ? "positive safe integer" : "cannot inherit a provider session",
	);
	expect(resolveServiceTarget).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

test.each([
	"allowed",
	"budget",
	"uncertain",
	"read-and-budget",
	"transport-failure",
	"transport-timeout",
	"warning",
	"abort-retained-failure",
	"abort-retained-timeout",
	"abort-retained-clean",
	"retained-clean",
	"retained-budget",
	"retained-failure",
	"retained-timeout",
	"retained-read-and-close",
])("public utility bootstrap owns request admission before first navigation; mode=%s", async (mode) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-public-request-"));
	setAuracallHomeDirOverrideForTest(home);
	fixture.clients.length = 0;
	const aborting = mode.startsWith("abort-");
	const unknownAbort = aborting && mode !== "abort-retained-clean";
	const retaining = mode.startsWith("retained-");
	const unknownRetained = retaining && mode !== "retained-clean" && mode !== "retained-budget";
	const controller = new AbortController();
	let utilityError: unknown;
	let finishUtility!: () => void;
	const utilitySettled = new Promise<void>((resolve) => {
		finishUtility = resolve;
	});
	const completeRequests =
		aborting ||
		(retaining && mode !== "retained-budget") ||
		mode === "allowed" ||
		mode === "transport-failure" ||
		mode === "transport-timeout" ||
		mode === "warning";
	fixture.page = {
		url: "about:blank",
		navigations: [],
		bootstrapRequests: completeRequests ? 1 : 2,
		payloadReads: 0,
		closeAttempts: 0,
		failClose:
			mode === "transport-failure" ||
			mode === "abort-retained-failure" ||
			mode === "retained-failure" ||
			mode === "retained-read-and-close",
		abortRead: aborting ? () => controller.abort(new Error("fixture public abort")) : undefined,
		stallClose:
			mode === "transport-timeout" ||
			mode === "abort-retained-timeout" ||
			mode === "retained-timeout",
		warnPayload: mode === "warning",
		failRead: mode === "read-and-budget" || mode === "retained-read-and-close",
		failContinuation: mode === "uncertain",
	};
	const gate = new DesktopControlGate("fixture-public-request");
	let held: Awaited<ReturnType<typeof gate.holdAutomation>> | undefined;
	let released = false;
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => gate.withAutomation("generation", effect),
		hold: async () => {
			const hold = await gate.holdAutomation("generation");
			held = hold;
			return {
				run: (_command, effect) => hold.run(effect),
				close: async () => {
					released = true;
					await hold.close();
				},
			};
		},
	}));
	const config = {
		auracallProfile: "public",
		services: { chatgpt: { identity: { email: "operator@example.test" } } },
		browser: {
			tabConcurrencyMode: "tab-affinity",
			chatgptUrl: "https://chatgpt.com/",
			cache: { rootDir: home, identityKey: "fixture", useDetectedIdentity: false },
		},
	} as never;
	let opened = false;
	const service = ChatgptService.create(config, {
		browserService: {
			getConfig: () => ({}),
			resolveServiceTarget: async () => ({
				host: "127.0.0.1",
				port: 45170,
				managedBrowserProfile: "/fixture/public",
				browserProfile: "fixture",
				browserProcessId: process.pid,
			}),
		} as never,
		runUtilityOperation: (input) =>
			runConfiguredChatgptUtilityOperation({
				...input,
				backendRequestLimit: mode === "retained-clean" ? 3 : completeRequests ? 2 : 1,
				deps: {
					listTargets: async () =>
						opened
							? ([{ id: "public-target", type: "page", url: fixture.page?.url }] as never)
							: [],
					openTarget: async (_port, url) => {
						expect(url).toBe("about:blank");
						opened = true;
						return { id: "public-target", url } as never;
					},
					closeTarget: async () => undefined,
				},
			})
				.catch((error: unknown) => {
					utilityError = error;
					throw error;
				})
				.finally(() => finishUtility()),
	});
	const listOptions: BrowserProviderListOptions = {
		interactionGovernor: { beforeInteraction: async () => undefined },
		abortSignal: controller.signal,
		useProviderSession: aborting || retaining,
	};
	try {
		const reading = service.getConversationContext("fixture-conversation", {
			refresh: true,
			retryAttempts: 0,
			timeoutMs: 5000,
			listOptions,
		});
		if (mode === "allowed" || mode === "retained-clean")
			await expect(reading).resolves.toMatchObject({
				messages: [{ role: "assistant", text: "Known fixture answer" }],
			});
		else {
			const error = await reading.catch((error: unknown) => error);
			expect(error).toBeInstanceOf(Error);
			const messages = (value: unknown): string[] =>
				value instanceof AggregateError
					? value.errors.flatMap(messages)
					: value instanceof Error
						? [value.message]
						: [];
			if (aborting)
				expect(error).toMatchObject({ code: "conversation_context_aborted", outcome: "aborted" });
			else if (mode === "warning")
				expect(messages(error).some((message) => /rate.limit/i.test(message))).toBe(true);
			else
				expect(messages(error)).toContain(
					mode === "uncertain"
						? "Fixture continuation outcome is unknown"
						: mode === "transport-failure" || mode === "transport-timeout" || unknownRetained
							? mode === "transport-timeout" || mode === "retained-timeout"
								? "Owned backend request client cleanup timed out."
								: "fixture transport close outcome unknown"
							: "Backend request admission denied: minute-backend-request-limit.",
				);
			if (mode === "read-and-budget" || mode === "retained-read-and-close")
				expect(messages(error)).toContain("fixture public read failed");
		}
		await utilitySettled;
		if (aborting) expect(listOptions.providerSession).toBeUndefined();
		expect(fixture.page.navigations).toEqual(["https://chatgpt.com/c/fixture-conversation"]);
		expect(fixture.clients).toHaveLength(1);
		expect(fixture.clients[0].requests).toEqual(
			completeRequests ? ["bootstrap-0", "payload-1"] : ["bootstrap-0"],
		);
		expect(fixture.clients[0].handler).toBeUndefined();
		expect(fixture.page.closeAttempts).toBe(1);

		const leases = await createBrowserTabConcurrencyRuntime(config).registry?.list();
		expect(leases?.find((lease) => lease.targetId === "public-target")).toMatchObject({
			state: "idle",
			effectState:
				unknownAbort ||
				unknownRetained ||
				mode === "uncertain" ||
				mode === "transport-failure" ||
				mode === "transport-timeout" ||
				mode === "warning"
					? "outcome-unknown"
					: "settled",
		});

		if (unknownAbort) {
			const messages = (value: unknown): string[] =>
				value instanceof AggregateError
					? value.errors.flatMap(messages)
					: value instanceof Error
						? [value.message, ...messages(value.cause)]
						: [];
			expect(messages(utilityError)).toContain(
				mode === "abort-retained-timeout"
					? "Owned backend request retained-session cleanup timed out."
					: "fixture transport close outcome unknown",
			);
		}
		if (mode === "warning") {
			const ledger = createBrowserTabConcurrencyRuntime(config).ledger;
			if (!ledger) throw new Error("Expected public request ledger");
			expect(
				await ledger.listActiveProviderWarnings({ now: new Date().toISOString() }),
			).toHaveLength(1);
		}
		if (mode === "retained-clean") {
			await expect(
				service.getConversationContext("fixture-conversation", {
					refresh: true,
					retryAttempts: 0,
					listOptions,
				}),
			).resolves.toMatchObject({ messages: [{ text: "Known fixture answer" }] });
			expect(fixture.clients).toHaveLength(2);
			expect(fixture.clients[1].requests).toEqual(["payload-2"]);
			expect(fixture.clients[1].handler).toBeUndefined();
			expect(fixture.page.closeAttempts).toBe(2);
			expect(fixture.page.navigations).toHaveLength(1);
			const records = await createBrowserTabConcurrencyRuntime(config).ledger?.list();
			expect(
				records?.filter((record) => record.interactionClass === "backend-request"),
			).toHaveLength(3);
		}
		if (
			unknownAbort ||
			unknownRetained ||
			mode === "transport-failure" ||
			mode === "transport-timeout"
		)
			expect(released).toBe(false);
		else {
			const human = await gate.takeControl("generation");
			await gate.releaseControl(human.token, "generation");
		}
	} finally {
		// Isolated fixture cleanup after assertions, not proof of a transport disconnect.
		if (
			unknownAbort ||
			unknownRetained ||
			mode === "transport-failure" ||
			mode === "transport-timeout"
		)
			await held?.close();
		fixture.page = undefined;
		setCdpCommandAdmissionResolver(undefined);
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
