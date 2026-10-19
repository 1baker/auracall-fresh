import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

vi.mock("../../src/browser/service/ui.js", () => ({
	navigateAndSettle: async (
		client: { Page: { navigate: (input: unknown) => Promise<void> } },
		input: unknown,
	) => {
		await client.Page.navigate(input);
		return { ok: true };
	},
	waitForPredicate: async (
		runtime: { evaluate: (input: unknown) => Promise<{ result: { value: unknown } }> },
		expression: string,
	) => ({
		ok: (await runtime.evaluate({ expression })).result.value === true,
	}),
}));

describe("developer app inventory with current settings UI", () => {
	it.each([
		{ developerMode: null, responseDelay: 0, cancelAfterMs: 0 },
		{ developerMode: true, responseDelay: 0, cancelAfterMs: 0 },
		{ developerMode: false, responseDelay: 0, cancelAfterMs: 0 },
		{ developerMode: true, responseDelay: 20_000, cancelAfterMs: 0 },
		{ developerMode: true, responseDelay: 20_000, cancelAfterMs: 1_000 },
	])("observes or cancels installed apps for %j", async ({
		developerMode,
		responseDelay,
		cancelAfterMs,
	}) => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let url = "https://chatgpt.com/";
		let responseReceived = (_event: unknown) => {};
		let loadingFinished = (_event: unknown) => {};
		const client = {
			Runtime: {
				enable: async () => {},
				evaluate: async ({ expression }: { expression: string }) => ({
					result: {
						value:
							expression === "location.href"
								? url
								: expression.includes("?.getAttribute('aria-checked')")
									? String(developerMode)
									: expression.includes("Boolean(document.querySelector")
										? developerMode !== null
										: expression.startsWith("JSON.stringify")
											? JSON.stringify({ url, dialogs: [], switches: [] })
											: false,
					},
				}),
			},
			Page: {
				enable: async () => {},
				navigate: async (input: { url: string }) => {
					url = input.url;
					if (url === "https://chatgpt.com/plugins") {
						const deliver = () => {
							if (url !== "https://chatgpt.com/plugins") return;
							responseReceived({
								requestId: "inventory",
								response: { status: 200, url: `${url}/backend-api/ps/plugins/installed` },
							});
							loadingFinished({ requestId: "inventory" });
						};
						if (responseDelay) setTimeout(deliver, responseDelay);
						else deliver();
					}
				},
			},
			Network: {
				enable: async () => {},
				responseReceived: (handler: typeof responseReceived) => {
					responseReceived = handler;
				},
				loadingFinished: (handler: typeof loadingFinished) => {
					loadingFinished = handler;
				},
				getResponseBody: async () => ({
					body: JSON.stringify({
						plugins: [
							{
								id: "plugin_asdk_app_fixture",
								name: "dev-fixture",
								enabled: true,
								release: { display_name: "Fixture App", app_ids: ["asdk_app_fixture"] },
							},
						],
					}),
					base64Encoded: false,
				}),
			},
			close: async () => {},
		};
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {
					services: { chatgpt: { backendRequestBudgetWaitMs: responseDelay ? 60_000 : 0 } },
				} as never,
				getUserIdentity: async () => ({ email: "owner@example.test" }) as never,
				connectDevTools: async () => ({ client: client as never, port: 45015 }),
			},
			async () => {
				throw new Error("unexpected browser creation");
			},
			{ abortSignal: controller.signal },
		);
		try {
			const started = Date.now();
			const result = adapter.readState().then(
				(state) => ({ state, error: null }),
				(error) => ({ state: null, error: String(error) }),
			);
			if (cancelAfterMs) {
				setTimeout(() => controller.abort(new Error("fixture inventory cancelled")), cancelAfterMs);
				await vi.advanceTimersByTimeAsync(cancelAfterMs);
				expect((await result).error).toContain("fixture inventory cancelled");
				expect(url).toBe("https://chatgpt.com/plugins");
				return;
			}
			await vi.runAllTimersAsync();
			const observed = await result;
			expect(observed.error).toBeNull();
			expect(observed.state).toMatchObject({
				account: { email: "owner@example.test" },
				inventoryComplete: true,
				developerMode,
				apps: [{ name: "Fixture App", enabled: true }],
			});
			expect(url).toBe("https://chatgpt.com/");
			expect(Date.now() - started).toBeLessThanOrEqual(responseDelay + 15_000);
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});
});

describe("developer app operation blocking scope", () => {
	it.each([
		"healthy",
		"main",
		"sidebar-dialog",
	])("history Retry retains operation gate for %s", async (location) => {
		const operationFailure = location !== "healthy";
		const element = (text: string, sidebar: boolean, dialog = false) => ({
			textContent: text,
			getAttribute: () => null,
			getBoundingClientRect: () => ({ width: 100, height: 20 }),
			closest: (selector: string) =>
				selector.includes("dialog") ? (dialog ? {} : null) : sidebar ? {} : null,
		});
		const sidebar = element("Unable to load history Retry", true);
		const main = element(
			operationFailure ? "Something went wrong Retry" : "Ready when you are",
			location === "sidebar-dialog",
			location === "sidebar-dialog",
		);
		const buttons = [
			element("Retry", true),
			...(operationFailure
				? [element("Retry", location === "sidebar-dialog", location === "sidebar-dialog")]
				: []),
		];
		const nodes = [sidebar, main].map((parentElement) => ({
			parentElement,
			textContent: parentElement.textContent,
		}));
		const document = {
			body: { innerText: nodes.map((n) => n.textContent).join("\n") },
			querySelectorAll: () => buttons,
			createTreeWalker: () => {
				let i = 0;
				return { nextNode: () => nodes[i++] ?? null };
			},
		};
		let guardEvaluated = false;
		const client = {
			Runtime: {
				enable: async () => {},
				evaluate: async ({ expression }: { expression: string }) => {
					if (!guardEvaluated) {
						guardEvaluated = true;
						return {
							result: {
								value: runInNewContext(expression, { document, NodeFilter: { SHOW_TEXT: 4 } }),
							},
						};
					}
					throw new Error("fixture selection reached");
				},
			},
			Page: { enable: async () => {}, navigate: async () => {} },
			close: async () => {},
		};
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => ({ email: "owner@example.test" }) as never,
				connectDevTools: async () => ({ client: client as never, port: 45015 }),
			},
			async () => {
				throw new Error("unexpected browser creation");
			},
		);
		try {
			await expect(adapter.selectForTest({ name: "Fixture App" } as never)).rejects.toThrow(
				operationFailure ? "Cannot select Fixture App: retry" : "fixture selection reached",
			);
		} finally {
			await adapter.close();
		}
	});
});
