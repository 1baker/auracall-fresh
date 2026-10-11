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
		null,
		true,
		false,
	])("returns complete installed apps with Developer mode observation %s", async (developerMode) => {
		vi.useFakeTimers();
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
						responseReceived({
							requestId: "inventory",
							response: { status: 200, url: `${url}/backend-api/ps/plugins/installed` },
						});
						loadingFinished({ requestId: "inventory" });
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
				userConfig: {} as never,
				getUserIdentity: async () => ({ email: "owner@example.test" }) as never,
				connectDevTools: async () => ({ client: client as never, port: 45015 }),
			},
			async () => {
				throw new Error("unexpected browser creation");
			},
		);
		try {
			const result = adapter.readState().then(
				(state) => ({ state, error: null }),
				(error) => ({ state: null, error: String(error) }),
			);
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
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});
});
