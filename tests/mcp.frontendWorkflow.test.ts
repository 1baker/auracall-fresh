import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFrontendBroker } from "../src/browser/frontends/broker.js";
import { FrontendService } from "../src/browser/frontends/service.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

/** Exercises MCP -> service -> actual HTTP client -> serialized DOM recipe, entirely on synthetic data. */
describe("synthetic frontend workflow through public MCP and HTTP", () => {
	it("sets Pro with native arrow requests and reads it back without any Send path", async () => {
		const contracts = JSON.parse(
			await readFile(
				new URL("./fixtures/frontend/service-contracts.json", import.meta.url),
				"utf8",
			),
		);
		const { document } = parseHTML(
			'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><div data-model-picker-view="simple"><div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" aria-valuetext="Instant"></div></div></body></html>',
		);
		const slider = document.querySelector('[role="slider"]');
		if (!slider) throw new Error("Missing fixture slider");
		const url = "https://chatgpt.com/c/fixture";
		const handle = {
			valid: true,
			browserId: "fixture-browser",
			sessionName: "fixture-session",
			profileId: "fixture-profile",
			tabId: "fixture-tab",
			targetId: "fixture-target",
		};
		const inputs: Record<string, unknown>[] = [];
		const http = createServer(async (req, res) => {
			expect(req.headers.authorization).toBe("Bearer fixture-capability");
			if (req.method === "GET" && req.url === "/api/service/contracts") {
				res.end(JSON.stringify(contracts));
				return;
			}
			expect(req.method).toBe("POST");
			expect(req.url).toBe("/api/service/request");
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			const body = JSON.parse(Buffer.concat(chunks).toString());
			inputs.push(body);
			expect(body.serviceTabHandle).toEqual(handle);
			expect(body.targetId).toBe(handle.targetId);
			expect(body.repairPolicy).toBe("reject_only");
			expect(body.profileLeasePolicy).toBe("reject");
			let data: Record<string, unknown>;
			if (body.action === "probe") {
				const expression = body.probe.detectors[0].expression;
				const observation = runInNewContext(expression, { document, location: { href: url } });
				data = {
					ok: true,
					action: "probe",
					targetId: handle.targetId,
					url,
					detectors: [
						{
							id: "frontend",
							type: "evaluate",
							ok: true,
							resultTruncated: false,
							result: observation,
						},
					],
				};
			} else if (body.action === "ui_action") {
				const step = body.uiAction.steps[0];
				expect(step.type).toBe("focus");
				expect(document.querySelector(step.selector)).toBe(slider);
				Object.defineProperty(document, "activeElement", { value: slider, configurable: true });
				data = {
					ok: true,
					action: "ui_action",
					targetId: handle.targetId,
					steps: [{ index: 0, type: "focus", ok: true }],
				};
			} else {
				expect(body.action).toBe("press");
				expect(body.params).toEqual({ key: "ArrowRight" });
				expect(document.activeElement).toBe(slider);
				const value = Number(slider.getAttribute("aria-valuenow")) + 1;
				slider.setAttribute("aria-valuenow", String(value));
				slider.setAttribute(
					"aria-valuetext",
					["Instant", "Medium", "High", "Extra High", "Pro"][value],
				);
				data = { pressed: "ArrowRight" };
			}
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ success: true, data }));
		});
		await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
		const address = http.address();
		if (!address || typeof address === "string") throw new Error("Missing fixture port");
		const capabilityName = "FIXTURE_CAPABILITY";
		const service = new FrontendService(
			[
				{
					id: "fixture",
					provider: "chatgpt",
					expectedUrl: url,
					expectedModel: "GPT fixture",
					serviceTabHandle: handle,
					profileCapabilityEnv: "FIXTURE_CAPABILITY",
				},
			],
			createFrontendBroker({
				baseUrl: `http://127.0.0.1:${address.port}`,
				env: { [capabilityName]: "fixture-capability" },
			}),
		);
		const server = new McpServer({ name: "frontend-workflow", version: "1" });
		registerFrontendTools(server, service);
		const client = new Client({ name: "workflow-fixture", version: "1" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const configured = await client.callTool({
				name: "frontend_configure",
				arguments: { routeId: "fixture", effort: "pro" },
			});
			expect(configured.isError).not.toBe(true);
			expect(configured.structuredContent).toMatchObject({
				effort: "pro",
				verified: true,
				uiSteps: 5,
				liveVerified: false,
			});
			const readback = await client.callTool({
				name: "frontend_inspect",
				arguments: { routeId: "fixture" },
			});
			expect(readback.structuredContent).toMatchObject({ effort: "pro", label: "Pro" });
			expect(inputs.filter((input) => input.action === "press")).toHaveLength(4);
			expect(inputs.filter((input) => input.action === "ui_action")).toHaveLength(1);
			expect(
				inputs.every((input) => ["probe", "ui_action", "press"].includes(String(input.action))),
			).toBe(true);
		} finally {
			await client.close();
			await server.close();
			await new Promise<void>((resolve) => {
				http.closeAllConnections();
				http.close(() => resolve());
			});
		}
	});
});
