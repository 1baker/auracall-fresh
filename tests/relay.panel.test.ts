import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { describe, expect, it, vi } from "vitest";
import { relayPanelHtml } from "../src/mcp/relay/panel.js";

describe("ChatGPT relay panel dispatch boundary", () => {
	it.each([
		false,
		true,
	])("keeps the claimed request fixed while a late Load resolves; uncertain=%s", async (uncertain) => {
		const { document } = parseHTML(relayPanelHtml);
		const loads = new Map<string, (value: unknown) => void>();
		let finishClaim: ((value: unknown) => void) | undefined;
		const callTool = vi.fn((name: string, args: { requestId: string }) => {
			if (name === "relay_status")
				return Promise.resolve({ structuredContent: { state: "ready" } });
			if (name === "relay_request")
				return new Promise((resolve) => loads.set(args.requestId, resolve));
			if (name === "relay_claim")
				return new Promise((resolve) => {
					finishClaim = resolve;
				});
			return Promise.resolve({ structuredContent: { state: "held_unknown" } });
		});
		const sendFollowUpMessage = vi.fn(async (_message: { prompt: string }) => {
			if (uncertain) throw Error("Unknown delivery");
		});
		const openai = { callTool, sendFollowUpMessage };
		runInNewContext(document.querySelector("script")?.textContent ?? "", {
			document,
			window: { openai },
		});
		const input = document.getElementById("request") as HTMLInputElement;
		input.value = "request_A";
		document.getElementById("load")?.click();
		await vi.waitFor(() => expect(loads.has("request_A")).toBe(true));
		input.value = "request_B";
		document.getElementById("load")?.click();
		loads.get("request_A")?.({
			structuredContent: {
				requestId: "request_A",
				fingerprint: "a".repeat(64),
				prompt: "Prompt A",
			},
		});
		await vi.waitFor(() =>
			expect(document.getElementById("preview")?.textContent).toBe("Prompt A"),
		);
		document.getElementById("ask")?.click();
		await vi.waitFor(() => expect(finishClaim).toBeTypeOf("function"));
		loads.get("request_B")?.({
			structuredContent: {
				requestId: "request_B",
				fingerprint: "b".repeat(64),
				prompt: "Prompt B",
			},
		});
		finishClaim?.({ structuredContent: { fresh: true, claimId: "claim-for-A" } });
		await vi.waitFor(() => expect(sendFollowUpMessage).toHaveBeenCalledTimes(1));
		expect(sendFollowUpMessage.mock.calls[0]?.[0]).toMatchObject({
			prompt: expect.stringContaining("request_A"),
		});
		expect(sendFollowUpMessage.mock.calls[0]?.[0]).toMatchObject({
			prompt: expect.not.stringContaining("request_B"),
		});
		if (uncertain)
			await vi.waitFor(() =>
				expect(callTool.mock.calls.find(([name]) => name === "relay_hold")?.[1]).toMatchObject({
					requestId: "request_A",
					claimId: "claim-for-A",
				}),
			);
	});
	it.each([
		"fresh",
		"already_claimed",
		"unknown",
	])("handles %s without a duplicate message", async (mode) => {
		const { document } = parseHTML(relayPanelHtml);
		const callTool = vi.fn(async (name: string) => ({
			structuredContent:
				name === "relay_status"
					? { state: "ready" }
					: name === "relay_request"
						? {
								requestId: "fixture_panel_01",
								fingerprint: "a".repeat(64),
								prompt: "<img src=x onerror=unsafe()>",
							}
						: name === "relay_claim"
							? { claimId: "fixture-claim", fresh: mode !== "already_claimed" }
							: { state: "held_unknown" },
		}));
		const sendFollowUpMessage = vi.fn(async () => {
			if (mode === "unknown") throw Error("Unknown delivery");
		});
		const openai = { callTool, sendFollowUpMessage, toolOutput: { requestId: "fixture_panel_01" } };
		const script = document.querySelector("script")?.textContent;
		if (!script) throw Error("Missing panel script");
		runInNewContext(script, { document, window: { openai } });
		document.getElementById("load")?.click();
		await vi.waitFor(() =>
			expect(document.getElementById("preview")?.textContent).toBe("<img src=x onerror=unsafe()>"),
		);
		expect(document.getElementById("preview")?.querySelector("img")).toBeNull();
		document.getElementById("ask")?.click();
		document.getElementById("ask")?.click();
		await vi.waitFor(() =>
			expect(callTool.mock.calls.filter(([name]) => name === "relay_claim")).toHaveLength(1),
		);
		await vi.waitFor(() =>
			expect(document.getElementById("status")?.textContent).toMatch(
				mode === "already_claimed"
					? /already claimed/
					: mode === "unknown"
						? /could not be confirmed/
						: /Waiting for ChatGPT/,
			),
		);
		expect(sendFollowUpMessage).toHaveBeenCalledTimes(mode === "already_claimed" ? 0 : 1);
		expect(callTool.mock.calls.filter(([name]) => name === "relay_hold")).toHaveLength(
			mode === "unknown" ? 1 : 0,
		);
	});
	it("shows unavailable capability instead of trying browser or network fallbacks", () => {
		const { document } = parseHTML(relayPanelHtml);
		runInNewContext(document.querySelector("script")?.textContent ?? "", { document, window: {} });
		expect(document.getElementById("status")?.textContent).toContain("does not expose");
		expect(document.getElementById("load")?.hasAttribute("disabled")).toBe(true);
	});
});
