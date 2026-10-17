import { beforeEach, describe, expect, test, vi } from "vitest";

const chatgptTabLifecycleMocks = vi.hoisted(() => ({
	cdpClose: vi.fn(async () => undefined),
}));

vi.mock("chrome-remote-interface", () => {
	const defaultExport = {};
	Object.defineProperty(defaultExport, "Close", {
		configurable: true,
		writable: true,
		enumerable: true,
		value: chatgptTabLifecycleMocks.cdpClose,
	});
	return { default: defaultExport };
});

import { shouldAttachResolvedServiceTabForTest } from "../../src/browser/llmService/llmService.js";
import {
	assertChatgptNavigationSettledForTest,
	bindChatgptAbortCleanupForTest,
	closeChatgptTabConnectionForTest,
	prepareChatgptPromptWorkbenchTargetForTest,
	runWithChatgptAbortBoundConnectionForTest,
	selectChatgptPromptWorkbenchTargetForTest,
	shouldDisposeChatgptTabConnectionForTest,
	shouldForceNewChatgptTabConnectionForTest,
	shouldNavigateExactChatgptTargetForTest,
} from "../../src/browser/providers/chatgptAdapter.js";

function createConnection(input: {
	shouldClose?: boolean;
	targetId?: string;
	clientClose?: () => Promise<void>;
}) {
	return {
		client: {
			close: vi.fn(input.clientClose ?? (async () => undefined)),
		},
		shouldClose: input.shouldClose ?? true,
		targetId: input.targetId ?? "target-1",
		host: "127.0.0.1",
		port: 45011,
	};
}

function asClosableConnection(connection: ReturnType<typeof createConnection>) {
	return connection as unknown as Parameters<typeof closeChatgptTabConnectionForTest>[0];
}

describe("ChatGPT tab lifecycle", () => {
	test("foregrounds a retained root before measuring its visible prompt workbench", async () => {
		const events: string[] = [];
		let expression = "";
		const ready = await prepareChatgptPromptWorkbenchTargetForTest({
			["Page"]: {
				enable: vi.fn(async () => {
					events.push("page-enable");
				}),
				bringToFront: vi.fn(async () => {
					events.push("front");
				}),
			},
			["Runtime"]: {
				enable: vi.fn(async () => {
					events.push("runtime-enable");
				}),
				evaluate: vi.fn(async (input: { expression: string }) => {
					events.push("evaluate");
					expression = input.expression;
					return { result: { value: true } };
				}),
			},
		} as never);

		expect(ready).toBe(true);
		expect(events).toEqual(["page-enable", "front", "runtime-enable", "evaluate"]);
		expect(expression).toContain('textarea[name="prompt-textarea"]');
	});

	beforeEach(() => {
		chatgptTabLifecycleMocks.cdpClose.mockClear();
	});

	test("disposes newly opened tabs only when account-mirror asks for disposable reads", async () => {
		const connection = createConnection({});

		expect(
			shouldDisposeChatgptTabConnectionForTest(connection, {
				tabLifecycle: "dispose-new",
			}),
		).toBe(true);

		await closeChatgptTabConnectionForTest(asClosableConnection(connection), {
			tabLifecycle: "dispose-new",
		});

		expect(connection.client.close).toHaveBeenCalledTimes(1);
		expect(chatgptTabLifecycleMocks.cdpClose).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			id: "target-1",
		});
	});

	test("closes a disposable inventory tab as soon as its provider call is aborted", async () => {
		const connection = createConnection({});
		const controller = new AbortController();
		const unbind = bindChatgptAbortCleanupForTest(
			asClosableConnection(connection) as Parameters<typeof bindChatgptAbortCleanupForTest>[0],
			{
				tabLifecycle: "dispose-new",
				abortSignal: controller.signal,
			},
		);

		controller.abort(new Error("provider deadline exceeded"));
		await vi.waitFor(() => {
			expect(connection.client.close).toHaveBeenCalledTimes(1);
			expect(chatgptTabLifecycleMocks.cdpClose).toHaveBeenCalledTimes(1);
		});
		unbind();

		expect(chatgptTabLifecycleMocks.cdpClose).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			id: "target-1",
		});
	});

	test("does not read identity after its disposable connection was aborted", async () => {
		const connection = createConnection({});
		const controller = new AbortController();
		const readIdentity = vi.fn(async () => ({ email: "operator@example.com" }));
		controller.abort(new Error("identity deadline exceeded"));

		await expect(
			runWithChatgptAbortBoundConnectionForTest(
				asClosableConnection(connection) as Parameters<
					typeof runWithChatgptAbortBoundConnectionForTest
				>[0],
				{
					tabLifecycle: "dispose-new",
					abortSignal: controller.signal,
				},
				readIdentity,
			),
		).rejects.toThrow("identity deadline exceeded");

		expect(readIdentity).not.toHaveBeenCalled();
		expect(connection.client.close).toHaveBeenCalledTimes(1);
		expect(chatgptTabLifecycleMocks.cdpClose).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			id: "target-1",
		});
	});

	test("awaits retained-session eviction after abort before the next read begins", async () => {
		const events: string[] = [];
		let releaseCleanup: (() => void) | undefined;
		const cleanupReleased = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const retainedConnection = createConnection({
			shouldClose: false,
			clientClose: async () => {
				events.push("cleanup-start");
				await cleanupReleased;
				events.push("cleanup-complete");
			},
		});
		const borrowedConnection = {
			...retainedConnection,
			borrowedFromSession: true,
			usedExisting: true,
		};
		const controller = new AbortController();
		const options: Parameters<typeof runWithChatgptAbortBoundConnectionForTest>[1] = {
			useProviderSession: true,
			abortSignal: controller.signal,
		};
		const closeSession = vi.fn(async () => {
			options.providerSession = undefined;
			await retainedConnection.client.close();
		});
		options.providerSession = {
			providerId: "chatgpt",
			key: "chatgpt:127.0.0.1:45011:https://chatgpt.com/",
			value: { connection: retainedConnection },
			close: closeSession,
		};
		const firstRead = runWithChatgptAbortBoundConnectionForTest(
			borrowedConnection as unknown as Parameters<
				typeof runWithChatgptAbortBoundConnectionForTest
			>[0],
			options,
			async () =>
				new Promise<never>((_resolve, reject) => {
					controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
						once: true,
					});
				}),
		);

		controller.abort(new Error("conversation deadline exceeded"));
		let firstSettled = false;
		void firstRead.catch(() => {
			firstSettled = true;
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(closeSession).toHaveBeenCalledTimes(1);
		expect(options.providerSession).toBeUndefined();
		expect(events).toEqual(["cleanup-start"]);
		expect(firstSettled).toBe(false);

		releaseCleanup?.();
		await expect(firstRead).rejects.toThrow("conversation deadline exceeded");
		events.push("next-read-start");
		expect(events).toEqual(["cleanup-start", "cleanup-complete", "next-read-start"]);
	});

	test("retains submitted or explicitly preserved tabs", async () => {
		const submittedTab = createConnection({});
		const preservedTab = createConnection({});

		expect(
			shouldDisposeChatgptTabConnectionForTest(submittedTab, {
				tabLifecycle: "dispose-new",
				tabTargetId: "submitted-target",
			}),
		).toBe(false);
		expect(
			shouldDisposeChatgptTabConnectionForTest(preservedTab, {
				tabLifecycle: "dispose-new",
				preserveActiveTab: true,
			}),
		).toBe(false);

		await closeChatgptTabConnectionForTest(asClosableConnection(submittedTab), {
			tabLifecycle: "dispose-new",
			tabTargetId: "submitted-target",
		});
		await closeChatgptTabConnectionForTest(asClosableConnection(preservedTab), {
			tabLifecycle: "dispose-new",
			preserveActiveTab: true,
		});

		expect(chatgptTabLifecycleMocks.cdpClose).not.toHaveBeenCalled();
	});

	test("retains reused targets and default provider calls", async () => {
		const reused = createConnection({ shouldClose: false });
		const defaultCall = createConnection({});

		expect(
			shouldDisposeChatgptTabConnectionForTest(reused, {
				tabLifecycle: "dispose-new",
			}),
		).toBe(false);
		expect(shouldDisposeChatgptTabConnectionForTest(defaultCall)).toBe(false);

		await closeChatgptTabConnectionForTest(asClosableConnection(reused), {
			tabLifecycle: "dispose-new",
		});
		await closeChatgptTabConnectionForTest(asClosableConnection(defaultCall));

		expect(chatgptTabLifecycleMocks.cdpClose).not.toHaveBeenCalled();
	});

	test("forces disposable inventory reads onto a new tab instead of a resolved service tab", () => {
		expect(
			shouldAttachResolvedServiceTabForTest({
				tabLifecycle: "dispose-new",
			}),
		).toBe(false);
		expect(
			shouldForceNewChatgptTabConnectionForTest({
				tabLifecycle: "dispose-new",
			}),
		).toBe(true);
	});

	test("skips a service-resolved root without a prompt workbench for a healthy retained root", async () => {
		const candidates = [{ id: "stale-root" }, { id: "healthy-root" }];
		const inspected: string[] = [];
		const selected = await selectChatgptPromptWorkbenchTargetForTest(
			candidates,
			"stale-root",
			async (candidate) => {
				inspected.push(candidate.id);
				return candidate.id === "healthy-root";
			},
		);

		expect(inspected).toEqual(["stale-root", "healthy-root"]);
		expect(selected).toEqual({ id: "healthy-root" });
	});

	test("opens a fresh retained tab for isolated prompt submission", async () => {
		const retained = createConnection({});
		const options = { tabLifecycle: "retain-new" as const };

		expect(shouldAttachResolvedServiceTabForTest(options)).toBe(false);
		expect(shouldForceNewChatgptTabConnectionForTest(options)).toBe(true);
		expect(shouldDisposeChatgptTabConnectionForTest(retained, options)).toBe(false);

		await closeChatgptTabConnectionForTest(asClosableConnection(retained), options);

		expect(retained.client.close).toHaveBeenCalledTimes(1);
		expect(chatgptTabLifecycleMocks.cdpClose).not.toHaveBeenCalled();
	});

	test("keeps explicit submitted tabs eligible for attachment", () => {
		expect(
			shouldAttachResolvedServiceTabForTest({
				tabLifecycle: "dispose-new",
				tabTargetId: "submitted-target",
			}),
		).toBe(true);
		expect(
			shouldForceNewChatgptTabConnectionForTest({
				tabLifecycle: "dispose-new",
				tabTargetId: "submitted-target",
			}),
		).toBe(false);
		expect(
			shouldForceNewChatgptTabConnectionForTest({
				tabLifecycle: "dispose-new",
				preserveActiveTab: true,
			}),
		).toBe(false);
	});

	test("navigates a mismatched exact target only when its caller allows navigation", () => {
		const input = {
			tabTargetId: "job-tab",
			allowNavigation: true,
			preserveActiveTab: true,
		};
		expect(
			shouldNavigateExactChatgptTargetForTest(
				"https://chatgpt.com/",
				"https://chatgpt.com/c/conversation-1",
				input,
			),
		).toBe(true);
		expect(
			shouldNavigateExactChatgptTargetForTest(
				"https://chatgpt.com/",
				"https://chatgpt.com/c/conversation-1",
				{ ...input, allowNavigation: false },
			),
		).toBe(false);
	});

	test("rejects every ChatGPT route that fails to settle", () => {
		expect(() =>
			assertChatgptNavigationSettledForTest(
				{ ok: false, reason: "chatgpt route did not settle" },
				"https://chatgpt.com/c/conversation-1",
			),
		).toThrow("chatgpt route did not settle");
		expect(() =>
			assertChatgptNavigationSettledForTest({ ok: false }, "https://chatgpt.com/c/conversation-1"),
		).toThrow("ChatGPT route https://chatgpt.com/c/conversation-1 did not settle");
		expect(() =>
			assertChatgptNavigationSettledForTest(
				{ ok: false },
				"https://chatgpt.com/g/project-1/project",
				"project-1",
			),
		).toThrow("ChatGPT project project-1 did not settle");
		expect(() =>
			assertChatgptNavigationSettledForTest({ ok: true }, "https://chatgpt.com/c/conversation-1"),
		).not.toThrow();
	});
});
