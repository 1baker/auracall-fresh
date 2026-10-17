// biome-ignore-all lint/style/useNamingConvention: Chrome DevTools Protocol domain names are case-sensitive.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import { createBrowserScrapeTelemetryRecorder } from "../../src/browser/providers/scrapeTelemetry.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const promptActionMocks = vi.hoisted(() => ({
	ensurePromptReady: vi.fn(async () => undefined),
	ensureChatgptComposerMode: vi.fn(async () => undefined),
	ensureModelSelection: vi.fn(async () => undefined),
	ensureChatgptWorkModelSelection: vi.fn(async () => undefined),
	ensureThinkingTime: vi.fn(async () => undefined),
	ensureChatgptComposerTool: vi.fn(async () => ({
		receipt: {
			requested: "create image",
			observed: {
				id: "chatgpt.media.create_image",
				label: "Create image",
				kind: "composer_tool" as const,
				availability: "available" as const,
				connectionState: "not_applicable" as const,
				verified: true as const,
			},
		},
	})),
	ensureChatgptEcosystemMention: vi.fn(async () => undefined),
	assertChatgptEcosystemMentionSelected: vi.fn(async () => undefined),
	attachChatgptLibraryFiles: vi.fn(async (_client, selectors) => ({
		requested: selectors,
		attached: [{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" as const }],
		inventoryObservedAt: "2026-09-27T12:00:00.000Z",
	})),
	verifyChatgptLibraryFileAttachments: vi.fn(async () => undefined),
	clearComposerAttachments: vi.fn(async () => undefined),
	uploadAttachmentFile: vi.fn(async () => true),
	waitForAttachmentCompletion: vi.fn(async () => undefined),
	submitPrompt: vi.fn(async (options: {
		beforeSend?: () => void | Promise<void>;
		onPromptDispatched?: () => Promise<void>;
	}) => {
		await options.beforeSend?.();
		await options.onPromptDispatched?.();
		return 1;
	}),
}));

const chatgptConnectionMocks = vi.hoisted(() => ({
	connectToChromeTarget: vi.fn(),
}));

vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../packages/browser-service/src/chromeLifecycle.js")
	>()),
	connectToChromeTarget: chatgptConnectionMocks.connectToChromeTarget,
}));

vi.mock("../../src/browser/actions/navigation.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/navigation.js")>()),
	ensurePromptReady: promptActionMocks.ensurePromptReady,
}));

vi.mock("../../src/browser/actions/chatgptComposerMode.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/chatgptComposerMode.js")>()),
	ensureChatgptComposerMode: promptActionMocks.ensureChatgptComposerMode,
}));

vi.mock("../../src/browser/actions/modelSelection.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/modelSelection.js")>()),
	ensureModelSelection: promptActionMocks.ensureModelSelection,
}));

vi.mock("../../src/browser/actions/chatgptWorkModelSelection.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/browser/actions/chatgptWorkModelSelection.js")
	>()),
	ensureChatgptWorkModelSelection: promptActionMocks.ensureChatgptWorkModelSelection,
}));

vi.mock("../../src/browser/actions/thinkingTime.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/thinkingTime.js")>()),
	ensureThinkingTime: promptActionMocks.ensureThinkingTime,
}));

vi.mock("../../src/browser/actions/chatgptComposerTool.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/chatgptComposerTool.js")>()),
	ensureChatgptComposerTool: promptActionMocks.ensureChatgptComposerTool,
}));

vi.mock("../../src/browser/actions/chatgptEcosystemMention.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/browser/actions/chatgptEcosystemMention.js")
	>()),
	ensureChatgptEcosystemMention: promptActionMocks.ensureChatgptEcosystemMention,
	assertChatgptEcosystemMentionSelected: promptActionMocks.assertChatgptEcosystemMentionSelected,
}));

vi.mock("../../src/browser/actions/chatgptLibraryFiles.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/browser/actions/chatgptLibraryFiles.js")
	>()),
	attachChatgptLibraryFiles: promptActionMocks.attachChatgptLibraryFiles,
	verifyChatgptLibraryFileAttachments: promptActionMocks.verifyChatgptLibraryFileAttachments,
}));

vi.mock("../../src/browser/actions/attachments.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/attachments.js")>()),
	clearComposerAttachments: promptActionMocks.clearComposerAttachments,
	uploadAttachmentFile: promptActionMocks.uploadAttachmentFile,
	waitForAttachmentCompletion: promptActionMocks.waitForAttachmentCompletion,
}));

vi.mock("../../src/browser/actions/promptComposer.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/promptComposer.js")>()),
	submitPrompt: promptActionMocks.submitPrompt,
}));

describe("ChatGPT provider prompt adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("closes an exact-target connection when its route is rejected before handoff", async () => {
		const client = {
			Runtime: {
				enable: vi.fn(async () => undefined),
				evaluate: vi.fn(async ({ expression }: { expression: string }) =>
					expression === "location.href"
						? { result: { value: "about:blank" } }
						: { result: { value: null } },
				),
			},
			Page: { enable: vi.fn(async () => undefined) },
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		chatgptConnectionMocks.connectToChromeTarget.mockResolvedValueOnce(client);

		await expect(
			createChatgptAdapter().listAccountFiles?.({
				host: "127.0.0.1",
				port: 45009,
				tabTargetId: "blank-target",
				configuredUrl: "https://chatgpt.com/library",
				preserveActiveTab: true,
			}),
		).rejects.toThrow(
			"ChatGPT target blank-target is on about:blank, not the expected https://chatgpt.com/library.",
		);
		expect(client.close).toHaveBeenCalledOnce();
	});

	test("bounds an unsettled exact-target Library DOM inventory and closes its CDP client", async () => {
		vi.useFakeTimers();
		try {
			const targetUrl = "https://chatgpt.com/library";
			const targetId = "chatgpt-library-target";
			const host = "127.0.0.1";
			const port = 45009;
			const authority = createProviderSessionAuthority({
				services: { chatgpt: { identity: { email: "operator@example.com" } } },
			});
			const scrapeTelemetry = createBrowserScrapeTelemetryRecorder();
			const context = {
				providerId: "chatgpt" as const,
				auracallRuntimeProfile: "wsl-chrome-3",
				browserProfile: "wsl-chrome-3",
				sourceBrowserProfile: "Default",
				managedBrowserProfile: "/managed/wsl-chrome-3/chatgpt",
				browserProcessId: 1234,
				browserTargetId: targetId,
				devtoolsHost: host,
				devtoolsPort: port,
			};
			let inventoryStarted: (() => void) | null = null;
			const started = new Promise<void>((resolve) => {
				inventoryStarted = resolve;
			});
			const Runtime = {
				enable: vi.fn(async () => undefined),
				evaluate: vi.fn(({ expression }: { expression: string }) => {
					if (expression.includes("for (let attempt = 0; attempt < 12")) {
						inventoryStarted?.();
						return new Promise<never>(() => undefined);
					}
					if (expression === "location.href") {
						return Promise.resolve({ result: { value: targetUrl } });
					}
					if (expression.includes("fetch('/api/auth/session'")) {
						return Promise.resolve({
							result: { value: { user: { email: "operator@example.com" }, account: null } },
						});
					}
					if (expression.includes("script#client-bootstrap")) {
						return Promise.resolve({ result: { value: null } });
					}
					if (expression.includes("create project")) {
						return Promise.resolve({ result: { value: { present: false } } });
					}
					return Promise.resolve({ result: { value: { ok: true } } });
				}),
			};
			const client = {
				Runtime,
				Page: {
					enable: vi.fn(async () => undefined),
					navigate: vi.fn(async () => ({ frameId: "frame-1" })),
				},
				Input: {},
				DOM: {},
				close: vi.fn(() => new Promise<void>(() => undefined)),
			};
			chatgptConnectionMocks.connectToChromeTarget.mockResolvedValueOnce(client);

			const pending = createChatgptAdapter().listAccountFiles?.({
				host,
				port,
				tabTargetId: targetId,
				configuredUrl: targetUrl,
				preserveActiveTab: true,
				requireExistingTarget: true,
				scrapeTelemetry,
				providerSessionAuthorization: {
					authority,
					context,
					expectation: authority.resolveExpectation(context),
				},
			});
			const rejection = expect(pending).rejects.toThrow(
				"ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
			);

			await started;
			await vi.advanceTimersByTimeAsync(10_000);
			await vi.advanceTimersByTimeAsync(3_000);

			await rejection;
			expect(client.close).toHaveBeenCalledOnce();
			expect(client.Page.navigate).not.toHaveBeenCalled();
			expect(chatgptConnectionMocks.connectToChromeTarget).toHaveBeenCalledWith({
				host,
				port,
				target: targetId,
				abortSignal: expect.any(AbortSignal),
			});
			expect(scrapeTelemetry.pendingOperation).toBeNull();
			expect(scrapeTelemetry.providerActions["chatgpt.listAccountFiles.dom-inventory"]).toBe(
				1,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test("rejects unsupported completion before browser interaction", async () => {
		const adapter = createChatgptAdapter();

		expect(adapter.runPrompt).toBeDefined();
		await expect(
			adapter.runPrompt?.({
				prompt: "Wait for the assistant response",
				completionMode: "assistant_response",
			}),
		).rejects.toThrow(
			"ChatGPT llmService prompt execution currently supports completionMode=prompt_submitted only.",
		);
	});

	test("prepares Work with the requested model without inserting or sending a prompt", async () => {
		const targetUrl =
			"https://chatgpt.com/g/g-p-6a8bc9d6f0408191bba2b2cbf816e63a-frakktal-t3cp-clean-room-proposal-replay/project";
		let currentUrl = "https://chatgpt.com/";
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return {
						result: { value: currentUrl },
					};
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		const client = {
			Runtime,
			Page: {
				navigate: vi.fn(async ({ url }: { url: string }) => {
					currentUrl = url;
					return { frameId: "frame-1" };
				}),
			},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45005;
		const targetId = "chatgpt-workbench-target";
		const connection = {
			client,
			targetId,
			shouldClose: false,
			host,
			port,
			usedExisting: true,
		};
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const messages: string[] = [];
		const result = await createChatgptAdapter().preparePromptWorkbench?.(
			{
				targetUrl,
				chatgptMode: "work",
				workModel: "GPT-5.6 Sol",
				modelStrategy: "select",
				onProgress: (event) => {
					const message = event.details?.message;
					if (typeof message === "string") messages.push(message);
				},
			},
			{
				host,
				port,
				configuredUrl: targetUrl,
				useProviderSession: true,
				providerSession: {
					providerId: "chatgpt",
					key: `chatgpt:${host}:${port}:${targetUrl}`,
					value: { connection },
					close: vi.fn(async () => undefined),
				},
				providerSessionAuthorization: {
					authority,
					context,
					expectation: authority.resolveExpectation(context),
				},
			},
		);

		expect(promptActionMocks.ensureChatgptComposerMode).toHaveBeenCalledWith(
			Runtime,
			"work",
			expect.any(Function),
		);
		expect(client.Page.navigate).toHaveBeenCalledWith({ url: targetUrl });
		expect(promptActionMocks.ensureChatgptWorkModelSelection).toHaveBeenCalledWith(
			Runtime,
			"GPT-5.6 Sol",
			expect.any(Function),
			"select",
		);
		expect(promptActionMocks.submitPrompt).not.toHaveBeenCalled();
		expect(result).toEqual({
			chatgptMode: "work",
			modelSelectionKind: "work-model",
			model: "GPT-5.6 Sol",
			messages,
			url: targetUrl,
			tabTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		});
	});

	test("authorizes before submitting and projects a prompt-submitted result", async () => {
		const events: string[] = [];
		const targetUrl = "https://chatgpt.com/";
		const submittedUrl = "https://chatgpt.com/c/conversation-1";
		let locationReads = 0;
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					locationReads += 1;
					return { result: { value: locationReads > 1 ? submittedUrl : targetUrl } };
				}
				events.push("authorize");
				return {
					result: {
						value: {
							user: { email: "operator@example.com" },
							account: null,
						},
					},
				};
			}),
		};
		promptActionMocks.ensurePromptReady.mockImplementation(async () => {
			events.push("composer-ready");
		});
		promptActionMocks.submitPrompt.mockImplementation(
			async (options: {
				beforeSend?: () => void | Promise<void>;
				onPromptDispatched?: () => Promise<void>;
			}) => {
				events.push("submit");
				await options.beforeSend?.();
				await options.onPromptDispatched?.();
				return 1;
			},
		);
		const client = {
			Runtime,
			Page: {},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45005;
		const targetId = "chatgpt-target-1";
		const connection = {
			client,
			targetId,
			shouldClose: false,
			host,
			port,
			usedExisting: true,
		};
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const onProof = vi.fn();
		const onProgress = vi.fn();
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: `chatgpt:${host}:${port}:${targetUrl}`,
				value: { connection },
				close: vi.fn(async () => undefined),
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
				onProof,
			},
			browserService: {
				getConfig: () => ({
					modelStrategy: "select",
					composerTool: "deep-research",
					inputTimeoutMs: 5_000,
				}),
			} as never,
		};

		const result = await createChatgptAdapter().runPrompt?.(
			{
				prompt: "Generate an image",
				capabilityId: "chatgpt.media.create_image",
				completionMode: "prompt_submitted",
				targetUrl,
				onProgress,
			},
			options,
		);

		expect(events.indexOf("authorize")).toBeLessThan(events.indexOf("composer-ready"));
		expect(events.indexOf("composer-ready")).toBeLessThan(events.indexOf("submit"));
		expect(onProof).toHaveBeenCalledTimes(1);
		expect(promptActionMocks.ensureModelSelection).not.toHaveBeenCalled();
		expect(promptActionMocks.ensureChatgptComposerTool).toHaveBeenCalledWith(
			client,
			"create image",
			expect.any(Function),
		);
			expect(result).toEqual({
			text: "",
			conversationId: "conversation-1",
			url: submittedUrl,
			tabTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
			composerCapability: {
				requested: "create image",
				observed: {
					id: "chatgpt.media.create_image",
					label: "Create image",
					kind: "composer_tool",
					availability: "available",
					connectionState: "not_applicable",
					verified: true,
				},
			},
		});
		expect(onProgress).toHaveBeenCalledWith({
			phase: "submit_path_observed",
			details: expect.objectContaining({ provider: "chatgpt" }),
		});
	});

	test("selects an exact ecosystem mention before submitting a developer-app prompt", async () => {
		const targetUrl = "https://chatgpt.com/";
		const submittedUrl = "https://chatgpt.com/c/conversation-app";
		let locationReads = 0;
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					locationReads += 1;
					return { result: { value: locationReads > 1 ? submittedUrl : targetUrl } };
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		const client = {
			Runtime,
			Page: {},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45005;
		const targetId = "chatgpt-target-app";
		const connection = {
			client,
			targetId,
			shouldClose: false,
			host,
			port,
			usedExisting: true,
		};
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: `chatgpt:${host}:${port}:${targetUrl}`,
				value: { connection },
				close: vi.fn(async () => undefined),
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
			browserService: {
				getConfig: () => ({ modelStrategy: "current", inputTimeoutMs: 5_000 }),
			} as never,
		};
		const ecosystemMention = {
			label: "LitScout",
			acceptedPluginIds: ["plugin_asdk_app_litscout", "asdk_app_litscout"],
		};

		await createChatgptAdapter().runPrompt?.(
			{
				prompt: "Use only LitScout.",
				completionMode: "prompt_submitted",
				targetUrl,
				ecosystemMention,
			},
			options,
		);

		expect(promptActionMocks.ensureChatgptComposerTool).not.toHaveBeenCalled();
		expect(promptActionMocks.ensureChatgptEcosystemMention).toHaveBeenCalledWith(
			client,
			ecosystemMention,
		);
		expect(promptActionMocks.assertChatgptEcosystemMentionSelected).toHaveBeenCalledWith(
			client,
			ecosystemMention,
		);
		expect(
			promptActionMocks.ensureChatgptEcosystemMention.mock.invocationCallOrder[0],
		).toBeLessThan(promptActionMocks.submitPrompt.mock.invocationCallOrder[0]);
	});

	test("uploads and settles attachments before submitting their names", async () => {
		const events: string[] = [];
		const targetUrl = "https://chatgpt.com/c/conversation-attachments";
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: targetUrl } };
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		promptActionMocks.uploadAttachmentFile.mockImplementation(async () => {
			events.push("upload");
			return true;
		});
		promptActionMocks.waitForAttachmentCompletion.mockImplementation(async () => {
			events.push("settled");
		});
		promptActionMocks.attachChatgptLibraryFiles.mockImplementation(async (_client, selectors) => {
			events.push("library");
			return {
				requested: selectors,
				attached: [{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" }],
				inventoryObservedAt: "2026-09-27T12:00:00.000Z",
			};
		});
		promptActionMocks.verifyChatgptLibraryFileAttachments.mockImplementation(async () => {
			events.push("verify");
		});
		promptActionMocks.submitPrompt.mockImplementation(async (submitOptions) => {
			await submitOptions.beforeSend?.();
			events.push("submit");
			return 1;
		});
		const client = {
			Runtime,
			Page: {},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45006;
		const targetId = "chatgpt-target-attachments";
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: `chatgpt:${host}:${port}:${targetUrl}`,
				value: {
					connection: {
						client,
						targetId,
						shouldClose: false,
						host,
						port,
						usedExisting: true,
					},
				},
				close: vi.fn(async () => undefined),
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
			browserService: {
				getConfig: () => ({ modelStrategy: "ignore", inputTimeoutMs: 5_000 }),
			} as never,
		};
		const attachment = {
			path: "/tmp/handoff-context.txt",
			displayPath: "handoff-context.txt",
			sizeBytes: 42,
		};

		const result = await createChatgptAdapter().runPrompt?.(
			{
				prompt: "Continue with attached context.",
				attachments: [attachment],
				libraryFiles: [{ id: "file_packet" }],
				completionMode: "prompt_submitted",
				targetUrl,
			},
			options,
		);

		expect(events).toEqual(["upload", "settled", "library", "verify", "submit"]);
		expect(promptActionMocks.clearComposerAttachments).toHaveBeenCalledWith(
			Runtime,
			5_000,
			expect.any(Function),
		);
		expect(promptActionMocks.uploadAttachmentFile).toHaveBeenCalledWith(
			{ runtime: Runtime, dom: client.DOM, input: client.Input, page: client.Page },
			attachment,
			expect.any(Function),
			{ expectedCount: 1 },
		);
		expect(promptActionMocks.waitForAttachmentCompletion).toHaveBeenCalledWith(
			Runtime,
			45_000,
			["handoff-context.txt"],
			expect.any(Function),
		);
		expect(promptActionMocks.submitPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ attachmentNames: ["handoff-context.txt"] }),
			"Continue with attached context.",
			expect.any(Function),
		);
		expect(promptActionMocks.attachChatgptLibraryFiles).toHaveBeenCalledWith(
			client,
			[{ id: "file_packet" }],
			expect.any(Function),
		);
		expect(promptActionMocks.verifyChatgptLibraryFileAttachments).toHaveBeenCalledWith(
			client,
			[{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" }],
		);
		expect(result?.libraryFiles).toEqual({
			requested: [{ id: "file_packet" }],
			attached: [{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" }],
			inventoryObservedAt: "2026-09-27T12:00:00.000Z",
		});
	});

	test("closes an owned ChatGPT connection when prompt preparation fails after authorization", async () => {
		const targetUrl = "https://chatgpt.com/";
		const failure = new Error("ChatGPT prompt preparation failed");
		const Runtime = {
			enable: vi.fn(async () => undefined),
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: targetUrl } };
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		const client = {
			Runtime,
			Page: { enable: vi.fn(async () => undefined) },
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		chatgptConnectionMocks.connectToChromeTarget.mockResolvedValueOnce(client);
		promptActionMocks.ensurePromptReady.mockRejectedValueOnce(failure);
		const host = "127.0.0.1";
		const port = 45009;
		const targetId = "chatgpt-target-owned";
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};

		await expect(
			createChatgptAdapter().runPrompt?.(
				{ prompt: "Fail after authorization", completionMode: "prompt_submitted", targetUrl },
				{
					host,
					port,
					tabTargetId: targetId,
					providerSessionAuthorization: {
						authority,
						context,
						expectation: authority.resolveExpectation(context),
					},
					browserService: {
						getConfig: () => ({ modelStrategy: "ignore", inputTimeoutMs: 5_000 }),
					} as never,
				},
			),
		).rejects.toBe(failure);
		expect(promptActionMocks.ensurePromptReady).toHaveBeenCalledTimes(1);
		expect(client.close).toHaveBeenCalledTimes(1);
	});
});
