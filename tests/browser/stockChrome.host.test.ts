import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { StockChromeController } from "../../src/browser/stockChrome/controller.js";
import {
	encodeNativeMessage,
	NativeMessageDecoder,
} from "../../src/browser/stockChrome/framing.js";
import { startStockChromeHost } from "../../src/browser/stockChrome/host.js";
import { syntheticChrome } from "../fixtures/frontend/stockChrome.js";

const extensionId = "a".repeat(32);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(timeout = 1000, dropInput = false) {
	const home = await mkdtemp(join(tmpdir(), "stock-host-"));
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	const connectionFile = join(home, "connection.json"),
		input = new PassThrough(),
		output = new PassThrough();
	const decoder = new NativeMessageDecoder();
	const packets: Record<string, unknown>[] = [];
	let controller: StockChromeController | undefined;
	output.on("data", (chunk) => {
		for (const raw of decoder.push(chunk)) {
			const packet = raw as Record<string, unknown>;
			packets.push(packet);
			if (packet.kind !== "request" || !controller) continue;
			if (dropInput && (packet.command as { action: string }).action !== "probe") continue;
			void controller.execute(packet.handle as never, packet.command).then(
				(data) =>
					input.write(encodeNativeMessage({ kind: "result", id: packet.id, success: true, data })),
				() => input.write(encodeNativeMessage({ kind: "result", id: packet.id, success: false })),
			);
		}
	});
	const host = await startStockChromeHost({
		extensionId,
		extensionOrigin: `chrome-extension://${extensionId}/`,
		connectionFile,
		input,
		output,
		requestTimeoutMs: timeout,
	});
	cleanups.push(async () => {
		input.end();
		await host.done;
	});
	const connection = JSON.parse(await readFile(connectionFile, "utf8"));
	const browser = syntheticChrome();
	controller = new StockChromeController(browser.api, host.sessionId);
	cleanups.push(() => controller?.close() ?? Promise.resolve());
	const handle = await controller.share(1);
	input.write(encodeNativeMessage({ kind: "shared", handle }));
	await expect.poll(() => packets.some((packet) => packet.kind === "shared")).toBe(true);
	const headers = {
		authorization: `Bearer ${connection.token}`,
		"content-type": "application/json",
	};
	const request = {
		action: "probe",
		maxReturnBytes: 16384,
		targetId: handle.targetId,
		browserId: handle.browserId,
		sessionName: handle.sessionName,
		runtimeProfile: handle.profileId,
		serviceTabHandle: handle,
		repairPolicy: "reject_only",
		profileLeasePolicy: "reject",
		probe: {
			recipeId: "auracall-chatgpt-frontend-v1",
			detectors: [
				{
					id: "frontend",
					type: "evaluate",
					expression: '(()=>{throw new Error("Caller JavaScript executed")})()',
				},
			],
		},
	};
	const post = (changes: Record<string, unknown> = {}) =>
		fetch(`${host.baseUrl}/api/service/request`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...request, ...changes }),
		});
	return { home, host, headers, post, request, handle, browser, packets, input, connectionFile };
}

describe("stock Chrome native host over authenticated real loopback HTTP", () => {
	it("requires exact extension origin before opening a broker or writing discovery", async () => {
		await expect(
			startStockChromeHost({
				extensionId,
				extensionOrigin: `chrome-extension://${"b".repeat(32)}/`,
				connectionFile: "/not-written/connection.json",
				input: new PassThrough(),
				output: new PassThrough(),
			}),
		).rejects.toThrow("binding");
	});
	it("rejects unauthenticated/web-origin requests and replaces caller JavaScript with a reviewed recipe", async () => {
		const f = await fixture();
		expect((await fetch(`${f.host.baseUrl}/api/stock-chrome/tabs`)).status).toBe(401);
		expect(
			(
				await fetch(`${f.host.baseUrl}/api/stock-chrome/tabs`, {
					headers: { ...f.headers, origin: "https://chatgpt.com" },
				})
			).status,
		).toBe(401);
		expect((await stat(f.connectionFile)).mode & 0o077).toBe(0);
		const response = await f.post();
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.data.detectors[0].result.model).toBe("GPT fixture");
		expect(f.browser.counts()).toMatchObject({ fills: 0, sends: 0 });
	});
	it("refuses foreign handles, provider recipes, Enter and multi-step input before dispatch", async () => {
		const f = await fixture();
		const before = f.packets.length;
		for (const changes of [
			{ serviceTabHandle: { ...f.handle, targetId: "foreign" } },
			{ probe: { ...f.request.probe, recipeId: "auracall-grok-heavy-v1" } },
			{ action: "press", params: { key: "Enter" } },
			{
				action: "ui_action",
				uiAction: {
					maxActions: 2,
					steps: [
						{ type: "click", selector: "button" },
						{ type: "click", selector: "button" },
					],
				},
			},
		])
			expect((await f.post(changes)).status).toBe(409);
		expect(f.packets.length).toBe(before);
		expect(f.browser.counts().sends).toBe(0);
	});
	it("does not redispatch timed-out input and still permits read-only recovery", async () => {
		const f = await fixture(30, true);
		const action = {
			action: "ui_action",
			uiAction: {
				maxActions: 1,
				steps: [{ type: "click", selector: '[data-testid="send-button"]' }],
			},
		};
		expect((await f.post(action)).status).toBe(409);
		expect((await f.post(action)).status).toBe(409);
		expect(f.packets.filter((packet) => packet.kind === "request")).toHaveLength(1);
		expect((await f.post()).status).toBe(200);
	});
	it("retires all handles and removes only its own discovery file on native disconnect", async () => {
		const f = await fixture();
		f.input.end();
		await f.host.done;
		await expect(stat(f.connectionFile)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			fetch(`${f.host.baseUrl}/api/stock-chrome/tabs`, { headers: f.headers }),
		).rejects.toThrow();
	});
});
