import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrontendBroker } from "../../src/browser/frontends/broker.js";
import type { FrontendBroker } from "../../src/browser/frontends/types.js";

const contract = JSON.parse(
	await readFile(new URL("../fixtures/frontend/service-contracts.json", import.meta.url), "utf8"),
);
const handle = {
	valid: true,
	browserId: "fixture-browser",
	targetId: "fixture-target",
	tabId: "fixture-tab",
};
const request = { action: "press", params: { key: "ArrowRight" }, serviceTabHandle: handle };
const capabilityName = "FIXTURE_CAPABILITY";
const env = { [capabilityName]: "fixture-only-capability" };
const servers: Server[] = [];
afterEach(async () => {
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.closeAllConnections();
					server.close(() => resolve());
				}),
		),
	);
});

async function fixture(
	options: {
		missingAction?: boolean;
		reply?: unknown;
		status?: number;
		drop?: boolean;
		oversize?: boolean;
	} = {},
) {
	const inputs: Record<string, unknown>[] = [];
	let preflights = 0;
	const server = createServer(async (req, res) => {
		if (req.headers.authorization !== `Bearer ${env.FIXTURE_CAPABILITY}`) {
			res.writeHead(401).end();
			return;
		}
		if (req.method === "GET" && req.url === "/api/service/contracts") {
			preflights++;
			const data = structuredClone(contract);
			if (options.missingAction)
				data.data.contracts.serviceRequest.actions = ["probe", "ui_action"];
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify(data));
			return;
		}
		expect(req.method).toBe("POST");
		expect(req.url).toBe("/api/service/request");
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(Buffer.from(chunk));
		const body = JSON.parse(Buffer.concat(chunks).toString());
		inputs.push(body);
		// Canonical serviceTabHandle is top-level; action-specific key is in params.
		expect(body).not.toHaveProperty("handle");
		expect(body).not.toHaveProperty("key");
		expect(body).not.toHaveProperty("taskAuthority");
		expect(body.serviceTabHandle).toEqual(handle);
		expect(["probe", "ui_action", "press"]).toContain(body.action);
		if (options.drop) {
			req.socket.destroy();
			return;
		}
		res.writeHead(options.status ?? 200, { "Content-Type": "application/json" });
		res.end(
			options.oversize
				? "x".repeat(140000)
				: JSON.stringify(options.reply ?? { success: true, data: { pressed: "ArrowRight" } }),
		);
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No fixture port");
	const broker = createFrontendBroker({ baseUrl: `http://127.0.0.1:${address.port}`, env });
	return { broker, inputs, preflights: () => preflights };
}
const call = (broker: FrontendBroker, body = request) => broker(body, "FIXTURE_CAPABILITY");

describe("pinned synchronous broker contract", () => {
	it.each([
		{ accessMode: "read_only" },
		{ controlPlaneAttestation: { mode: "read_only" } },
		{
			connectionRef: "00000000-0000-4000-8000-000000000001",
			leaseRef: "00000000-0000-4000-8000-000000000002",
		},
		{ controlRef: "00000000-0000-4000-8000-000000000003", generation: 1 },
	])("refuses unsupported existing-Chrome references before HTTP: %j", async (references) => {
		const requestFetch = vi.fn(
			async (url: URL | RequestInfo) =>
				new Response(
					JSON.stringify(
						String(url).endsWith("/api/service/contracts")
							? contract
							: { success: true, data: { pressed: "ArrowRight" } },
					),
				),
		);
		const broker = createFrontendBroker({
			baseUrl: "http://127.0.0.1:1",
			env,
			fetch: requestFetch,
		});
		await expect(
			call(broker, { ...request, serviceTabHandle: { ...handle, ...references } }),
		).rejects.toMatchObject({ code: "invalid_request" });
		expect(requestFetch).not.toHaveBeenCalled();
	});
	it("reads the actual v1 contract before native keyboard dispatch", async () => {
		const f = await fixture();
		expect(await call(f.broker)).toEqual({ pressed: "ArrowRight" });
		expect(f.preflights()).toBe(1);
		expect(f.inputs).toEqual([request]);
	});
	it("refuses a missing required action before POST", async () => {
		const f = await fixture({ missingAction: true });
		await expect(call(f.broker)).rejects.toMatchObject({ code: "contract_mismatch" });
		expect(f.inputs).toEqual([]);
	});
	it.each([
		"Enter",
		"Space",
		"Tab",
		"Control+ArrowRight",
		"ArrowUp",
	])("rejects disallowed key %s before HTTP", async (key) => {
		const requestFetch = vi.fn();
		const broker = createFrontendBroker({
			baseUrl: "http://127.0.0.1:1",
			env,
			fetch: requestFetch,
		});
		await expect(
			broker({ ...request, params: { key } }, "FIXTURE_CAPABILITY"),
		).rejects.toMatchObject({ code: "invalid_key" });
		expect(requestFetch).not.toHaveBeenCalled();
	});
	it("requires capability and a valid explicit handle before HTTP", async () => {
		const requestFetch = vi.fn();
		const broker = createFrontendBroker({
			baseUrl: "http://127.0.0.1:1",
			env: {},
			fetch: requestFetch,
		});
		await expect(call(broker)).rejects.toMatchObject({ code: "authority_missing" });
		await expect(
			call(broker, { ...request, serviceTabHandle: { ...handle, valid: false } }),
		).rejects.toMatchObject({ code: "invalid_request" });
		expect(requestFetch).not.toHaveBeenCalled();
	});
	it.each([
		{ status: 403 },
		{ drop: true },
		{ oversize: true },
		{ reply: { success: true, data: { job: { state: "queued" } } } },
	])("never replays a POST after refusal or uncertainty %j", async (options) => {
		const f = await fixture(options);
		if ("reply" in options) {
			// Synchronous v1 only. The service cannot interpret this as successful input.
			expect(await call(f.broker)).not.toHaveProperty("pressed");
		} else await expect(call(f.broker)).rejects.toBeTruthy();
		expect(f.inputs).toHaveLength(1);
	});
	it.each([
		"https://example.com/",
		"http://localhost:123/",
		"http://127.0.0.1:123/path",
		"http://user@127.0.0.1:1",
	])("rejects an unbounded broker origin %s", (baseUrl) => {
		expect(() => createFrontendBroker({ baseUrl, env })).toThrow();
	});
});
