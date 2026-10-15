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
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import {
	annotateClientMutationContext,
	resolveProviderTrafficGovernor,
} from "../../src/browser/providers/mutationAudit.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

const fixture = vi.hoisted(() => ({
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
			failContinuation: false,
			beforeContinue: undefined as (() => Promise<void>) | undefined,
			responseHandler: undefined as ((event: unknown) => Promise<void>) | undefined,
			handler: undefined as ((event: unknown) => Promise<void>) | undefined,
		};
		fixture.clients.push(state);
		const client = {
			send: async (command: string, parameters: { requestId?: string }) => {
				if (command === "Fetch.continueRequest" || command === "Fetch.failRequest") {
					if (!parameters.requestId) throw new Error("Missing fixture request ID");
					(command === "Fetch.continueRequest" ? state.requests : state.failures).push(
						parameters.requestId,
					);
				}
				if (command === "Fetch.continueRequest" && state.failContinuation)
					throw new Error("Fixture continuation outcome is unknown");
				if (command === "Fetch.continueRequest") await state.beforeContinue?.();
				return {};
			},
			close: async () => undefined,
			// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
			Network: {
				enable: async () => undefined,
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
