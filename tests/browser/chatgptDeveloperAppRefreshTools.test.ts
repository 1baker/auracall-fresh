import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

describe("developer app tool refresh", () => {
	afterEach(() => vi.useRealTimers());
	it.each([
		"success",
		"body-fallback",
		"foreign-refresh-link",
		"http-error",
		"malformed",
		"identity-change",
		"app-member-change",
		"connection-change",
		"approval",
		"approval-before",
		"foreign-connection",
	])("reports refresh outcome without retry: %s", async (scenario) => {
		let request: (value: unknown) => void = () => {};
		let response: (value: unknown) => void = () => {};
		let finished: (value: unknown) => Promise<void> = async () => {};
		const clicks: string[] = [];
		if (scenario === "foreign-refresh-link") vi.useFakeTimers();
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
			if (expression.includes("refreshButtonCount:")) {
				const text = `Connected accounts\n${scenario === "connection-change" && clicks.length ? "Other account" : "Fixture account"}\nAbout\nURL\nhttps://fixture.example/mcp\nApp ID\n${["identity-change", "app-member-change"].includes(scenario) && clicks.length ? "other" : "fixture"}\nRefresh tools`;
				const control = {
					innerText: "Refresh tools",
					disabled: false,
					getAttribute: () => null,
					getBoundingClientRect: () => ({ width: 100, height: 30 }),
				};
				const approval = { ...control, innerText: "Approve new tool permissions" };
				return {
					result: {
						value: runInNewContext(expression, {
							location: { href: "https://chatgpt.com/settings/plugins-settings/plugin_fixture" },
							document: {
								body: { innerText: text },
								querySelectorAll: (selector: string) =>
									selector === "button"
										? [control]
										: (scenario === "approval" && clicks.length) || scenario === "approval-before"
											? [approval]
											: [],
							},
							getComputedStyle: () => ({ visibility: "visible", display: "block" }),
						}),
					},
				};
			}
			if (expression.includes("const stateKey ="))
				return {
					result: { value: { ok: true, center: { x: 10, y: 10 }, matchedLabel: "refresh tools" } },
				};
			if (expression.startsWith("window["))
				return { result: { value: { trusted: true, matchedLabel: "refresh tools" } } };
			return { result: { value: true } };
		});
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => null,
				connectDevTools: async () => ({
					port: 1,
					client: {
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Runtime: { enable: async () => {}, evaluate },
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Page: {
							enable: async () => {},
							navigate: async () => {
								response({
									requestId: "links",
									response: {
										url: "https://chatgpt.com/backend-api/aip/connectors/links/list_accessible",
										status: 200,
									},
								});
								await finished({ requestId: "links" });
								return {};
							},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Input: {
							dispatchMouseEvent: async ({ type }: { type: string }) => {
								if (type === "mouseReleased") {
									clicks.push(type);
									request({
										requestId: "refresh",
										request: {
											url: "https://chatgpt.com/backend-api/aip/connectors/mcp/refresh_actions",
											method: "POST",
											postData:
												scenario === "body-fallback"
													? undefined
													: JSON.stringify(
															scenario === "foreign-refresh-link"
																? { link_id: "foreign", server_url: "https://fixture.example/mcp" }
																: { link_id: "link_fixture" },
														),
										},
									});
									response({
										requestId: "refresh",
										response: { status: scenario === "http-error" ? 500 : 200 },
									});
									await finished({ requestId: "refresh" });
								}
							},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Network: {
							enable: async () => {},
							requestWillBeSent: (fn: typeof request) => {
								request = fn;
							},
							responseReceived: (fn: typeof response) => {
								response = fn;
							},
							loadingFinished: (fn: typeof finished) => {
								finished = fn;
							},
							getRequestPostData: async () => ({
								postData: JSON.stringify({ link_id: "link_fixture" }),
							}),
							getResponseBody: async ({ requestId }: { requestId: string }) => ({
								body:
									requestId === "links"
										? JSON.stringify({
												links: [
													{
														link_id: "link_fixture",
														connector_id: scenario === "foreign-connection" ? "foreign" : "fixture",
														name: "Fixture",
													},
												],
											})
										: JSON.stringify(
												scenario === "malformed"
													? { actions: [{ name: null }] }
													: { actions: [{ name: "new_tool", params: { type: "object" } }] },
											),
							}),
						},
						close: async () => {},
					} as never,
				}),
			},
			async () => {
				throw Error("unexpected browser creation");
			},
		);
		const resultPromise = adapter.refreshTools(
			{
				pluginId: "plugin_fixture",
				appIds: scenario === "app-member-change" ? ["fixture", "other"] : ["fixture"],
				name: "Fixture",
			},
			"https://fixture.example/mcp",
		);
		if (scenario === "foreign-refresh-link") await vi.runAllTimersAsync();
		if (scenario === "foreign-connection") {
			await expect(resultPromise).rejects.toThrow("Exact app connection identity unavailable");
			expect(clicks).toEqual([]);
			return;
		}
		const result = await resultPromise;
		expect(result.status).toBe(
			["success", "body-fallback"].includes(scenario)
				? "completed"
				: ["approval", "approval-before"].includes(scenario)
					? "awaiting-human"
					: "unconfirmed",
		);
		if (["success", "body-fallback"].includes(scenario))
			expect(result.catalog).toMatchObject({ toolCount: 1, toolNames: ["new_tool"] });
		else expect(result.catalog).toBeUndefined();
		expect(clicks).toEqual(scenario === "approval-before" ? [] : ["mouseReleased"]);
	});

	it("refuses an app settings endpoint mismatch before any refresh activation", async () => {
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
			if (expression.includes("refreshButtonCount:"))
				return {
					result: {
						value: {
							url: "https://chatgpt.com/settings/plugins-settings/plugin_fixture",
							text: "Connected accounts\nFixture account\nAbout\nURL\nhttps://wrong.example/mcp\nApp ID\nfixture\nRefresh tools",
							refreshButtonCount: 1,
							humanApproval: false,
						},
					},
				};
			return { result: { value: true } };
		});
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => null,
				connectDevTools: async () => ({
					port: 1,
					client: {
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Runtime: { enable: async () => {}, evaluate },
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Network: {
							enable: async () => {},
							requestWillBeSent: () => {},
							responseReceived: () => {},
							loadingFinished: () => {},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Page: { enable: async () => {}, navigate: async () => ({}) },
						close: async () => {},
					} as never,
				}),
			},
			async () => {
				throw Error("unexpected browser creation");
			},
		);
		await expect(
			adapter.refreshTools(
				{ pluginId: "plugin_fixture", appIds: ["fixture"], name: "Fixture" },
				"https://fixture.example/mcp",
			),
		).rejects.toThrow(/endpoint/);
		expect(
			evaluate.mock.calls.some(([p]) => p.expression.includes("__browserServiceTrustedPointer")),
		).toBe(false);
	});
});
