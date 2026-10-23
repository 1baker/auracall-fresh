import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import type { ServiceFrontendRoute } from "../src/browser/frontends/types.js";

const route: ServiceFrontendRoute = {
	id: "chatgpt-dev",
	provider: "chatgpt",
	expectedUrl: "https://chatgpt.com/c/fixture",
	expectedModel: "GPT fixture",
	serviceTabHandle: {
		browserId: "fixture-browser",
		sessionName: "fixture-session",
		profileId: "fixture-profile",
		tabId: "fixture-tab",
		targetId: "fixture-target",
		valid: true,
	},
	profileCapabilityEnv: "FIXTURE_CAPABILITY",
};
const labels = ["Instant", "Medium", "High", "Extra High", "Pro"];
interface Scenario {
	ticks?: boolean;
	value?: number;
	label?: string;
	focusLost?: boolean;
	delta?: number;
	privateFailure?: boolean;
	observedUrl?: string;
	model?: string;
	target?: string;
	disabled?: boolean;
	maximum?: number;
	actionFails?: boolean;
}
async function run(
	scenario: Scenario = {},
	args: Record<string, unknown> = { routeId: route.id, effort: "pro" },
	override: Partial<ServiceFrontendRoute> = {},
	maxSteps = 6,
) {
	let selected = scenario.value ?? 1;
	let focused = false;
	const requests: Record<string, unknown>[] = [];
	const service = new FrontendService(
		[{ ...route, ...override }],
		async (request, capabilityEnv) => {
			if (scenario.privateFailure)
				throw new Error(`fixture-private-capability ${JSON.stringify(route.serviceTabHandle)}`);
			expect(capabilityEnv).toBe("FIXTURE_CAPABILITY");
			expect(request).not.toHaveProperty("taskAuthority");
			expect(request).not.toHaveProperty("key");
			expect(request.serviceTabHandle).toEqual(route.serviceTabHandle);
			requests.push(request);
			const common = {
				ok: true,
				action: request.action,
				targetId: scenario.target ?? "fixture-target",
				url: scenario.observedUrl ?? route.expectedUrl,
			};
			if (request.action === "ui_action") {
				const action = (request.uiAction as { steps: { type: string }[] }).steps[0];
				if (action.type === "focus") focused = true;
				else selected = 4;
				return { ...common, steps: [{ index: 0, type: action.type, ok: !scenario.actionFails }] };
			}
			if (request.action === "press") {
				const key = (request.params as { key: string }).key;
				expect(["ArrowRight", "ArrowLeft"]).toContain(key);
				selected += (key === "ArrowRight" ? 1 : -1) * (scenario.delta ?? 1);
				return { pressed: key };
			}
			expect(request.action).toBe("probe");
			return {
				...common,
				detectors: [
					{
						id: "frontend",
						type: "evaluate",
						ok: true,
						resultTruncated: false,
						result: {
							url: common.url,
							model: scenario.model ?? "GPT fixture",
							value: selected,
							label: scenario.label ?? labels[selected],
							minimum: 0,
							maximum: scenario.maximum ?? 4,
							disabled: scenario.disabled ?? false,
							openSelector: null,
							sliderSelector: "#slider",
							sliderFocused: focused && !scenario.focusLost,
							controls: scenario.ticks
								? [{ value: 4, selector: "#intelligence-pro", disabled: false }]
								: [],
						},
					},
				],
			};
		},
		maxSteps,
	);
	const server = new McpServer({ name: "frontend-test", version: "1" });
	registerFrontendTools(server, service);
	const client = new Client({ name: "test", version: "1" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	try {
		const result = await client.callTool({ name: "frontend_configure", arguments: args });
		expect(JSON.stringify(result)).not.toMatch(
			/fixture-private-capability|fixture-authority|fixture-browser|fixture-target|fixture-profile/,
		);
		// Every dispatch must be a detector or a bounded UI input; no Send or model API exists in this seam.
		expect(
			requests.every((request) => ["probe", "ui_action", "press"].includes(String(request.action))),
		).toBe(true);
		expect(JSON.stringify(requests)).not.toMatch(
			/response_create|chat\/completions|send-button|ArrowUp|Enter/,
		);
		return { result, requests };
	} finally {
		await client.close();
		await server.close();
	}
}
const errorCode = (result: Awaited<ReturnType<typeof run>>["result"]) =>
	(result.structuredContent as { code?: string })?.code;

describe("frontend tools through MCP", () => {
	it("clicks an exposed Pro tick and requires observed readback", async () => {
		const { result, requests } = await run({ ticks: true });
		expect(result.isError).not.toBe(true);
		expect(result.structuredContent).toMatchObject({
			effort: "pro",
			verified: true,
			liveVerified: false,
		});
		expect(requests.map((request) => request.action)).toEqual(["probe", "ui_action", "probe"]);
	});
	it("focuses the slider and presses three native arrow keys, checking each step", async () => {
		const { result, requests } = await run();
		expect(result.isError).not.toBe(true);
		expect(result.structuredContent).toMatchObject({ effort: "pro", verified: true, uiSteps: 4 });
		expect(requests.filter((request) => request.action === "press")).toHaveLength(3);
		expect(requests.filter((request) => request.action === "probe")).toHaveLength(5);
	});
	it("uses left arrows for a lower effort", async () => {
		const { result, requests } = await run({ value: 4 }, { routeId: route.id, effort: "standard" });
		expect(result.isError).not.toBe(true);
		expect(
			requests
				.filter((request) => request.action === "press")
				.every((request) => (request.params as { key: string }).key === "ArrowLeft"),
		).toBe(true);
	});
	it("is idempotent when Pro is already visibly selected", async () => {
		const { result, requests } = await run({ value: 4 });
		expect(result.isError).not.toBe(true);
		expect(requests).toHaveLength(1);
	});
	it.each([
		[{ focusLost: true }, "focus_lost"],
		[{ delta: 0 }, "readback_mismatch"],
		[{ delta: 2 }, "readback_mismatch"],
		[{ maximum: 3 }, "effort_unavailable"],
		[{ disabled: true }, "effort_unavailable"],
		[{ model: "different" }, "model_drift"],
		[{ observedUrl: "https://example.com/" }, "origin_mismatch"],
		[{ target: "different" }, "target_mismatch"],
		[{ actionFails: true }, "ui_action_failed"],
		[{ value: 4, label: "Medium" }, "readback_mismatch"],
	] as const)("refuses unsafe or unconfirmed state %j", async (scenario, code) => {
		const { result, requests } = await run(scenario);
		expect(result.isError).toBe(true);
		expect(errorCode(result)).toBe(code);
		expect(requests.filter((request) => request.action === "press").length).toBeLessThanOrEqual(1);
	});
	it("stops at the shared UI action bound", async () => {
		const { result, requests } = await run({}, undefined, {}, 2);
		expect(errorCode(result)).toBe("step_bound_exceeded");
		expect(requests.filter((request) => request.action === "press")).toHaveLength(1);
	});
	it.each([
		"Enter",
		"ArrowUp",
		"unknown",
	])("rejects an undocumented effort %s before dispatch", async (effort) => {
		const { result, requests } = await run({}, { routeId: route.id, effort });
		expect(result.isError).toBe(true);
		expect(requests).toEqual([]);
	});
	it("refuses arbitrary JS and handles in the public schema", async () => {
		const { result, requests } = await run(
			{},
			{ routeId: route.id, effort: "pro", script: "alert(1)", serviceTabHandle: {} },
		);
		expect(result.isError).toBe(true);
		expect(requests).toEqual([]);
	});
	it.each([
		[{ expectedUrl: "invalid" }, "invalid_route"],
		[{ expectedUrl: "http://chatgpt.com/" }, "origin_mismatch"],
		[{ profileCapabilityEnv: "" }, "authority_missing"],
		[{ serviceTabHandle: { valid: false } }, "invalid_route"],
	] as const)("rejects invalid server route %j", async (override, code) => {
		const { result, requests } = await run({}, undefined, override);
		expect(errorCode(result)).toBe(code);
		expect(requests).toEqual([]);
	});
	it("refuses an unknown route", async () => {
		const { result, requests } = await run({}, { routeId: "missing", effort: "pro" });
		expect(errorCode(result)).toBe("route_missing");
		expect(requests).toEqual([]);
	});
	it("redacts a private broker exception from public errors", async () => {
		const { result } = await run({ privateFailure: true });
		expect(errorCode(result)).toBe("frontend_failed");
	});
});
