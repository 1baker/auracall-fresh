import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileBackedBrowserOperationDispatcher } from "../../packages/browser-service/src/service/operationDispatcher.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import {
	clearBrowserOperationQueueObservationsForTest,
	summarizeBrowserOperationQueueObservations,
} from "../../src/browser/operationQueueObservations.js";
import { resolveBrowserLaunchPlan } from "../../src/browser/service/browserLaunchPlan.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import type { ResolvedUserConfig } from "../../src/config.js";

const providerRunPrompt = vi.hoisted(() =>
	vi.fn(async (input: { conversationId?: string | null; targetUrl?: string | null }) => ({
		text: "",
		conversationId: input.conversationId ?? "chatgpt-conversation-1",
		url: input.targetUrl ?? "https://chatgpt.com/c/chatgpt-conversation-1",
		tabTargetId: "chatgpt-tab-1",
		devtoolsHost: "127.0.0.1",
		devtoolsPort: 45011,
	})),
);
const providerListProjectFiles = vi.hoisted(() => vi.fn(async () => []));
const providerListProjects = vi.hoisted(() => vi.fn(async () => []));
const providerUploadProjectFiles = vi.hoisted(() => vi.fn(async () => undefined));
const providerRenameProject = vi.hoisted(() => vi.fn(async () => undefined));
const providerValidateProjectUrl = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../src/browser/providers/index.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/browser/providers/index.js")>();
	return {
		...original,
		getProvider: (id: "chatgpt" | "gemini" | "grok") => {
			const provider = original.getProvider(id);
			return id === "chatgpt"
				? {
						...provider,
						runPrompt: providerRunPrompt,
						listProjects: providerListProjects,
						listProjectFiles: providerListProjectFiles,
						uploadProjectFiles: providerUploadProjectFiles,
						renameProject: providerRenameProject,
						validateProjectUrl: providerValidateProjectUrl,
					}
				: provider;
		},
	};
});

const tempRoots: string[] = [];

afterEach(async () => {
	for (const root of tempRoots.splice(0)) {
		await rm(root, { recursive: true, force: true, maxRetries: 2 });
	}
	providerRunPrompt.mockClear();
	providerListProjectFiles.mockClear();
	providerListProjects.mockClear();
	providerUploadProjectFiles.mockReset();
	providerUploadProjectFiles.mockResolvedValue(undefined);
	providerRenameProject.mockReset();
	providerRenameProject.mockResolvedValue(undefined);
	providerValidateProjectUrl.mockReset();
	providerValidateProjectUrl.mockResolvedValue(undefined);
	clearBrowserOperationQueueObservationsForTest();
	vi.restoreAllMocks();
	setAuracallHomeDirOverrideForTest(null);
});

describe("ChatGPT llm service", () => {
	it("qualifies a provider session through utility custody when no exact target was supplied", async () => {
		const proof = { verdict: "match" };
		const base = vi
			.spyOn(LlmService.prototype, "getProviderSessionProof")
			.mockResolvedValue(proof as never);
		const runUtilityOperation = vi.fn(
			async (input: { run: (options: { tabTargetId: string }) => Promise<unknown> }) =>
				input.run({ tabTargetId: "owned-qualification-target" }),
		);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{ browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" } } as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);
		expect(await service.getProviderSessionProof()).toBe(proof);
		expect(runUtilityOperation).toHaveBeenCalledOnce();
		expect(base).toHaveBeenCalledWith({ tabTargetId: "owned-qualification-target" });
	});

	it("keeps an already selected provider-proof target without acquiring a second utility task", async () => {
		const proof = { verdict: "match" };
		const base = vi
			.spyOn(LlmService.prototype, "getProviderSessionProof")
			.mockResolvedValue(proof as never);
		const runUtilityOperation = vi.fn();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{ browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" } } as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);
		const options = { tabTargetId: "caller-owned-target" };
		expect(await service.getProviderSessionProof(options)).toBe(proof);
		expect(base).toHaveBeenCalledWith(options);
		expect(runUtilityOperation).not.toHaveBeenCalled();
	});
	it("reuses an explicit utility affinity identity across service instances", async () => {
		const runUtilityOperation = vi.fn(async () => []);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const config = {
			browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
		} as ResolvedUserConfig;
		const options = {
			runUtilityOperation: runUtilityOperation as never,
			utilityAffinityId: "history-materialization:hmj-1",
		};

		await ChatgptService.create(config, options).listProjects();
		await ChatgptService.create(config, options).listProjects();

		expect(runUtilityOperation).toHaveBeenCalledTimes(2);
		expect(runUtilityOperation).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ utilityId: "history-materialization:hmj-1" }),
		);
		expect(runUtilityOperation).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ utilityId: "history-materialization:hmj-1" }),
		);
	});

	it("routes ChatGPT CRUD reads through utility affinity when explicitly enabled", async () => {
		const runUtilityOperation = vi.fn(async () => [
			{ id: "project-1", name: "Project 1", provider: "chatgpt" as const },
		]);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(service.listProjects()).resolves.toEqual([
			{ id: "project-1", name: "Project 1", provider: "chatgpt" },
		]);
		expect(runUtilityOperation).toHaveBeenCalledWith(
			expect.objectContaining({ mutability: "read-only" }),
		);
	});

	it("routes ChatGPT conversation mutations once through utility affinity", async () => {
		const runUtilityOperation = vi.fn(async () => undefined);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await service.renameConversation("conversation-1", "Renamed");
		expect(runUtilityOperation).toHaveBeenCalledOnce();
		expect(runUtilityOperation).toHaveBeenCalledWith(
			expect.objectContaining({ mutability: "provider-mutating" }),
		);
	});

	it("keeps inherited ChatGPT reads on one exact utility tab without nested acquisition", async () => {
		const cacheRoot = await tempRoot("auracall-chatgpt-utility-read-");
		const runUtilityOperation = vi.fn(
			async (input: {
				run: (options: {
					host: string;
					port: number;
					tabTargetId: string;
					skipFeatureSignature: boolean;
				}) => Promise<unknown>;
			}) =>
				input.run({
					host: "127.0.0.1",
					port: 45011,
					tabTargetId: "utility-tab-1",
					skipFeatureSignature: true,
				}),
		);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: {
					target: "chatgpt",
					tabConcurrencyMode: "tab-affinity",
					cache: { rootDir: cacheRoot, identityKey: "test", useDetectedIdentity: false },
				},
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(service.listProjectFiles("project-1")).resolves.toEqual([]);

		expect(runUtilityOperation).toHaveBeenCalledOnce();
		expect(providerListProjectFiles).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({ tabTargetId: "utility-tab-1" }),
		);
	});

	it("does not reacquire utility affinity for an already exact inherited read", async () => {
		const cacheRoot = await tempRoot("auracall-chatgpt-exact-read-");
		const runUtilityOperation = vi.fn();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: {
					target: "chatgpt",
					tabConcurrencyMode: "tab-affinity",
					cache: { rootDir: cacheRoot, identityKey: "test", useDetectedIdentity: false },
				},
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(
			service.listProjectFiles("project-1", {
				listOptions: {
					host: "127.0.0.1",
					port: 45011,
					tabTargetId: "utility-tab-1",
					skipFeatureSignature: true,
				},
			}),
		).resolves.toEqual([]);

		expect(runUtilityOperation).not.toHaveBeenCalled();
		expect(providerListProjectFiles).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({ tabTargetId: "utility-tab-1" }),
		);
	});

	it("rebuilds provider-session authorization for an already exact affinity target", async () => {
		stubBrowserServiceTarget();
		const runUtilityOperation = vi.fn();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				auracallProfile: "wsl-chrome-3",
				services: { chatgpt: { identity: { email: "operator@example.com" } } },
				browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(
			service.listProjects({
				host: "127.0.0.1",
				port: 45011,
				tabTargetId: "crawler-tab-1",
			}),
		).resolves.toEqual([]);

		expect(runUtilityOperation).not.toHaveBeenCalled();
		expect(providerListProjects).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "127.0.0.1",
				port: 45011,
				tabTargetId: "crawler-tab-1",
				providerSessionAuthorization: expect.objectContaining({
					expectation: expect.objectContaining({
						configuredIdentity: expect.objectContaining({ email: "operator@example.com" }),
					}),
					context: expect.objectContaining({
						providerId: "chatgpt",
						browserTargetId: "crawler-tab-1",
						devtoolsPort: 45011,
					}),
				}),
			}),
		);
	});

	it("runs a ChatGPT project upload and cache refresh once on the same utility tab", async () => {
		const cacheRoot = await tempRoot("auracall-chatgpt-utility-upload-");
		const runUtilityOperation = vi.fn(
			async (input: {
				mutability: string;
				run: (options: {
					host: string;
					port: number;
					tabTargetId: string;
					skipFeatureSignature: boolean;
				}) => Promise<unknown>;
			}) =>
				input.run({
					host: "127.0.0.1",
					port: 45011,
					tabTargetId: "utility-tab-1",
					skipFeatureSignature: true,
				}),
		);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: {
					target: "chatgpt",
					tabConcurrencyMode: "tab-affinity",
					cache: { rootDir: cacheRoot, identityKey: "test", useDetectedIdentity: false },
				},
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await service.uploadProjectFiles("project-1", ["/tmp/source.txt"]);

		expect(runUtilityOperation).toHaveBeenCalledOnce();
		expect(runUtilityOperation).toHaveBeenCalledWith(
			expect.objectContaining({ mutability: "provider-mutating" }),
		);
		expect(providerUploadProjectFiles).toHaveBeenCalledOnce();
		expect(providerUploadProjectFiles).toHaveBeenCalledWith(
			"project-1",
			["/tmp/source.txt"],
			expect.objectContaining({ tabTargetId: "utility-tab-1" }),
		);
		expect(providerListProjectFiles).toHaveBeenCalledOnce();
		expect(providerListProjectFiles).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({ tabTargetId: "utility-tab-1" }),
		);
	});

	it("does not retry a failed ChatGPT project upload inside utility affinity", async () => {
		providerUploadProjectFiles.mockRejectedValueOnce(new Error("connection lost after upload"));
		const runUtilityOperation = vi.fn(
			async (input: {
				run: (options: { host: string; port: number; tabTargetId: string }) => Promise<unknown>;
			}) =>
				input.run({
					host: "127.0.0.1",
					port: 45011,
					tabTargetId: "utility-tab-1",
				}),
		);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(service.uploadProjectFiles("project-1", ["/tmp/source.txt"])).rejects.toThrow(
			"connection lost after upload",
		);
		expect(providerUploadProjectFiles).toHaveBeenCalledOnce();
		expect(providerListProjectFiles).not.toHaveBeenCalled();
	});

	it("does not retry an uncertain ChatGPT project rename inside utility affinity", async () => {
		stubBrowserServiceTarget();
		providerRenameProject.mockRejectedValue(new Error("connection lost after rename"));
		const runUtilityOperation = vi.fn(
			async (input: {
				run: (options: {
					host: string;
					port: number;
					tabTargetId: string;
					disableProviderMutationRetry: boolean;
				}) => Promise<unknown>;
			}) =>
				input.run({
					host: "127.0.0.1",
					port: 45011,
					tabTargetId: "utility-tab-1",
					disableProviderMutationRetry: true,
				}),
		);
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create(
			{
				browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
			} as ResolvedUserConfig,
			{ runUtilityOperation: runUtilityOperation as never },
		);

		await expect(service.renameProject("project-1", "Renamed")).rejects.toThrow(
			"connection lost after rename",
		);
		expect(runUtilityOperation).toHaveBeenCalledOnce();
		expect(providerValidateProjectUrl).toHaveBeenCalledOnce();
		expect(providerRenameProject).toHaveBeenCalledOnce();
	});

	it("passes ChatGPT image capability intent to the provider adapter", async () => {
		stubBrowserServiceTarget();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create({
			browser: {
				target: "chatgpt",
				modelStrategy: "select",
				composerTool: "deep-research",
			},
		} as ResolvedUserConfig);

		await service.runPrompt({
			prompt: "Generate an image of an asphalt secret agent",
			capabilityId: "chatgpt.media.create_image",
			completionMode: "prompt_submitted",
		});

		expect(providerRunPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				capabilityId: "chatgpt.media.create_image",
				modelStrategy: undefined,
			}),
			expect.objectContaining({ browserService: expect.any(Object) }),
		);
	});

	it("passes configured account identity into ChatGPT browser runs", async () => {
		stubBrowserServiceTarget();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create({
			auracallProfile: "wsl-chrome-2",
			services: {
				chatgpt: {
					identity: {
						email: "consult@polymerconsultinggroup.com",
						accountLevel: "Pro",
					},
				},
			},
			browser: {
				target: "chatgpt",
				modelStrategy: "select",
			},
		} as ResolvedUserConfig);

		await service.runPrompt({
			prompt: "Say ok",
			completionMode: "prompt_submitted",
		});

		expect(providerRunPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: "Say ok" }),
			expect.objectContaining({
				providerSessionAuthorization: expect.objectContaining({
					expectation: expect.objectContaining({
						configuredIdentity: expect.objectContaining({
							email: "consult@polymerconsultinggroup.com",
							accountLevel: "Pro",
						}),
						configuredServiceAccountId:
							"service-account:chatgpt:consult@polymerconsultinggroup.com",
					}),
				}),
			}),
		);
	});

	it("passes prompt attachments into ChatGPT browser runs", async () => {
		stubBrowserServiceTarget();
		const { ChatgptService } = await import(
			"../../src/browser/llmService/providers/chatgptService.js"
		);
		const service = ChatgptService.create({
			browser: {
				target: "chatgpt",
			},
		} as ResolvedUserConfig);

		await service.runPrompt({
			prompt: "Continue with attached context.",
			completionMode: "prompt_submitted",
			attachments: [{ path: "/tmp/handoff.txt", displayPath: "handoff.txt", sizeBytes: 42 }],
		});

		expect(providerRunPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Continue with attached context.",
				attachments: [{ path: "/tmp/handoff.txt", displayPath: "handoff.txt", sizeBytes: 42 }],
			}),
			expect.any(Object),
		);
	});

	it.each([
		{ selector: null, desiredModel: null, thinkingTime: null, modelStrategy: "current" },
		{
			selector: "chatgpt:reasoning-high",
			desiredModel: "GPT-5.6 Sol",
			thinkingTime: "extended",
			modelStrategy: "select",
		},
	])("submits handoff context and files with model selector $selector", async ({
		selector,
		desiredModel,
		thinkingTime,
		modelStrategy,
	}) => {
		stubBrowserServiceTarget();
		const root = await tempRoot("auracall-chatgpt-handoff-adapter-");
		const auracallHome = await tempRoot("auracall-chatgpt-handoff-operation-");
		setAuracallHomeDirOverrideForTest(auracallHome);
		const selectedPath = path.join(root, "handoff-context.txt");
		await writeFile(selectedPath, "selected handoff context", "utf8");
		const {
			approveHandoffTargetSubmit,
			approveHandoffTargetUpload,
			prepareCrossServiceHandoffPacket,
			recoverHandoffLive,
		} = await import("../../src/handoff/service.js");
		const { createChatgptBrowserHandoffTargetAdapter } = await import(
			"../../src/handoff/chatgptBrowserAdapter.js"
		);
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "chatgpt-browser-adapter-fixture",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetRef: "https://chatgpt.com/g/g-p-target-pro-soylei",
			targetProjectRef: "g-p-target-pro",
			targetModelSelector: selector,
			sourceContext: { messages: [{ role: "user", content: "handoff adapter" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "chatgpt_attachment", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T14:00:00.000Z",
		});
		const adapterConfig = {
			auracallProfile: "target-pro",
			browser: {
				target: "chatgpt",
				keepBrowser: true,
			},
			runtimeProfiles: fixtureConfig().runtimeProfiles,
		} as ResolvedUserConfig;
		const adapter = createChatgptBrowserHandoffTargetAdapter(adapterConfig);

		await approveHandoffTargetUpload({
			handoffId: "chatgpt-browser-adapter-fixture",
			outputRoot: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const uploadRecovery = await recoverHandoffLive({
			handoffId: "chatgpt-browser-adapter-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T14:01:00.000Z",
			targetAdapter: adapter,
		});
		expect(uploadRecovery.recovery).toMatchObject({
			executor: "provider_native_file_prompt_adapter",
			executedAction: "upload",
			status: "recovered",
		});
		const uploadJson = JSON.parse(
			await readFile(
				path.join(root, "chatgpt-browser-adapter-fixture", "target", "upload-result.json"),
				"utf8",
			),
		);
		expect(uploadJson).toMatchObject({
			status: "uploaded",
			rows: [
				expect.objectContaining({
					sourceManifestItemId: "chatgpt_attachment",
					providerFileId: expect.stringMatching(/^chatgpt-prompt-attachment-[a-f0-9]{32}$/),
				}),
			],
		});

		await approveHandoffTargetSubmit({
			handoffId: "chatgpt-browser-adapter-fixture",
			outputRoot: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const launchPlan = resolveBrowserLaunchPlan({
			source: { kind: "user-config", config: adapterConfig },
			intent: { provider: "chatgpt" },
		});
		const dispatcher = createFileBackedBrowserOperationDispatcher({
			lockRoot: path.join(auracallHome, "browser-operations"),
			isOwnerAlive: () => true,
		});
		const activeOperation = await dispatcher.acquire({
			managedProfileDir: launchPlan.managedBrowserProfile.directory,
			serviceTarget: "chatgpt",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: process.pid,
			ownerCommand: "competing-chatgpt-job",
		});
		expect(activeOperation.acquired).toBe(true);

		let submitPromise: ReturnType<typeof recoverHandoffLive> | null = null;
		try {
			submitPromise = recoverHandoffLive({
				handoffId: "chatgpt-browser-adapter-fixture",
				outputRoot: root,
				generatedAt: "2026-06-07T14:02:00.000Z",
				targetAdapter: adapter,
			});
			await vi.waitFor(() => {
				const observations = summarizeBrowserOperationQueueObservations({
					managedProfileDir: launchPlan.managedBrowserProfile.directory,
					serviceTarget: "chatgpt",
				});
				expect(observations.items.some((item) => item.event === "queued")).toBe(true);
			});
			expect(providerRunPrompt).not.toHaveBeenCalled();
		} finally {
			if (activeOperation.acquired) {
				await activeOperation.release();
			}
		}
		if (!submitPromise) {
			throw new Error("ChatGPT handoff submission did not start.");
		}
		const submitRecovery = await submitPromise;
		expect(
			summarizeBrowserOperationQueueObservations({
				managedProfileDir: launchPlan.managedBrowserProfile.directory,
				serviceTarget: "chatgpt",
			}).items.map((item) => item.event),
		).toEqual(["queued", "acquired"]);
		const replacementOperation = await dispatcher.acquire({
			managedProfileDir: launchPlan.managedBrowserProfile.directory,
			serviceTarget: "chatgpt",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerCommand: "post-handoff-verification",
		});
		expect(replacementOperation.acquired).toBe(true);
		if (replacementOperation.acquired) {
			await replacementOperation.release();
		}

		expect(providerRunPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				completionMode: "prompt_submitted",
				prompt: expect.stringContaining("## Compact Context JSON"),
				attachments: [
					expect.objectContaining({
						path: path.join(
							root,
							"chatgpt-browser-adapter-fixture",
							"target",
							"selected-files",
							"001-Selected_file-chatgpt_attachment",
						),
						displayPath: "001-Selected_file-chatgpt_attachment",
					}),
				],
				conversationId: null,
				targetUrl: "https://chatgpt.com/g/g-p-target-pro-soylei",
				desiredModel,
				thinkingTime,
				modelStrategy,
			}),
			expect.objectContaining({
				tabLifecycle: "retain-new",
				mutationSourcePrefix: "handoff:chatgpt-target-submit",
			}),
		);
		expect(submitRecovery).toMatchObject({
			recovery: {
				executor: "provider_native_file_prompt_adapter",
				executedAction: "submit",
				status: "recovered",
			},
			afterResumePlan: {
				nextAction: "complete",
			},
		});
	});
});

function stubBrowserServiceTarget(): void {
	const promptGuard = LlmService.prototype as unknown as {
		enforceProviderGuard: (action: string) => Promise<void>;
		noteProviderGuardSuccess: (action: string) => Promise<void>;
	};
	vi.spyOn(promptGuard, "enforceProviderGuard").mockResolvedValue(undefined);
	vi.spyOn(promptGuard, "noteProviderGuardSuccess").mockResolvedValue(undefined);
	vi.spyOn(BrowserService.prototype, "resolveServiceTarget").mockResolvedValue({
		host: "127.0.0.1",
		port: 45011,
		browserProfile: "default",
		sourceBrowserProfile: "Default",
		managedBrowserProfile: "/managed/default/chatgpt",
		browserProcessId: 1234,
		tab: {
			targetId: "chatgpt-tab-1",
			url: "https://chatgpt.com/",
		},
	} as never);
	vi.spyOn(BrowserService.prototype, "getMutationAuditSink").mockReturnValue(undefined as never);
}

async function tempRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}

function fixtureConfig(): Record<string, unknown> {
	return {
		runtimeProfiles: {
			"target-gemini": {
				browserProfile: "gemini-browser",
				services: {
					gemini: {
						identity: {
							email: "source@example.com",
						},
					},
				},
			},
			"target-pro": {
				browserProfile: "pro-browser",
				services: {
					chatgpt: {
						identity: {
							email: "target@example.com",
							accountPlanType: "pro",
						},
					},
				},
			},
		},
	};
}

function manifestItemFixture(overrides: Partial<{ id: string; localPath: string | null }> = {}): {
	id: string;
	kind: "file";
	title: string;
	localPath: string | null;
	archiveItemId: null;
	sourceRef: null;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string;
	materializationMethod: null;
	importanceHint: number;
} {
	return {
		id: overrides.id ?? "selected",
		kind: "file",
		title: "Selected file",
		localPath: Object.hasOwn(overrides, "localPath")
			? (overrides.localPath ?? null)
			: "/tmp/selected.txt",
		archiveItemId: null,
		sourceRef: null,
		mimeType: "text/plain",
		sizeBytes: 10,
		checksumSha256: "e".repeat(64),
		materializationMethod: null,
		importanceHint: 1,
	};
}
