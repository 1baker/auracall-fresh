import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { NativeDesktopControlError } from "../src/browser/service/nativeDesktopControl.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

test("the dedicated desktop app serves an owned inventory and passive frames through the operator HTTP boundary", async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-http-desktops-"));
	setAuracallHomeDirOverrideForTest(home);
	const calls: string[] = [];
	let refusal: Error | undefined;
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0, tabAffinityMaintenanceIntervalMs: 0 },
		{
			config: {
				api: {
					auth: {
						required: true,
						keys: [
							{ id: "operator", secret: "fixture-api-key" },
							{ id: "scoped", secret: "scoped-api-key", services: ["chatgpt"] },
						],
					},
				},
			},
			desktopClient: {
				closeBrowser: async (name, browserId) => {
					calls.push(`close:${name}:${browserId}`);
					return { state: "closed" as const };
				},
				profiles: async () => [
					{
						runtimeProfileId: "writer",
						provider: "chatgpt",
						accountKey: "account",
						accountLabel: "Account",
						state: "dormant",
						wakeable: true,
					},
				],
				wakeProfile: async (id, desktopName) => {
					calls.push(`wake:${id}:${desktopName}`);
					return {
						runtimeProfileId: id,
						desktopName: desktopName ?? "research",
						browserId: "owned-browser",
					};
				},
				list: async () => ({
					desktops: [
						{
							name: "research",
							label: "Research",
							state: "ready" as const,
							browsers: [
								{
									browserId: "owned-browser",
									handoffUrl: "https://browser.example.test/remote-view/owned",
								},
							],
						},
					],
				}),
				view: async (name, browserId) => {
					calls.push(`native:${name}:${browserId}`);
					return {
						url: "https://desktop.example.test/embed/11111111-1111-4111-8111-111111111111",
						capability: "observe" as const,
					};
				},
				takeControl: async (name, browserId, token) => {
					if (refusal) throw refusal;
					calls.push(`take:${name}:${browserId}`);
					return {
						url: "https://desktop.example.test/embed/11111111-1111-4111-8111-111111111111",
						capability: "control" as const,
						token,
					};
				},
				releaseControl: async (name, browserId) => {
					calls.push(`release:${name}:${browserId}`);
				},
				capture: async (name, browserId) => {
					calls.push(`${name}:${browserId}`);
					return { imageBase64: "iVBORw0KGgo=", width: 1920, height: 1080 };
				},
			},
		},
	);
	try {
		const base = `http://127.0.0.1:${server.port}`;
		const page = await fetch(`${base}/desktops`);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("AuraCall Desktops");
		expect((await fetch(`${base}/v1/desktops`)).status).toBe(401);
		const operatorHeaders = { referer: `${base}/desktops` };
		expect(
			(await (await fetch(`${base}/v1/desktops`, { headers: operatorHeaders })).json()).desktops[0]
				.name,
		).toBe("research");
		const frame = await fetch(`${base}/v1/desktops/research/frame?browser=owned-browser`, {
			headers: operatorHeaders,
		});
		expect(frame.status).toBe(200);
		expect(frame.headers.get("cache-control")).toBe("no-store");
		expect((await frame.json()).width).toBe(1920);
		expect(calls).toEqual(["research:owned-browser"]);
		expect(
			(await fetch(`${base}/v1/desktops`, { headers: { authorization: "Bearer scoped-api-key" } }))
				.status,
		).toBe(403);
		expect((await fetch(`${base}/v1/desktops/research/view?browser=owned-browser`)).status).toBe(
			401,
		);
		const native = await fetch(`${base}/v1/desktops/research/view?browser=owned-browser`, {
			headers: operatorHeaders,
		});
		expect(native.status).toBe(200);
		expect(await native.json()).toMatchObject({
			capability: "observe",
			url: expect.stringContaining("/embed/"),
		});
		expect(calls).toEqual(["research:owned-browser", "native:research:owned-browser"]);
		const claim = { browserId: "owned-browser", token: randomUUID() };
		const controlUrl = `${base}/v1/desktops/research/control`;
		const body = JSON.stringify(claim);
		expect((await fetch(controlUrl, { method: "POST", body })).status).toBe(401);
		expect(
			(
				await fetch(controlUrl, {
					method: "POST",
					body,
					headers: { authorization: "Bearer scoped-api-key" },
				})
			).status,
		).toBe(403);
		expect(
			(await fetch(controlUrl, { method: "POST", body: "{}", headers: operatorHeaders })).status,
		).toBe(400);
		const takeover = await fetch(controlUrl, { method: "POST", body, headers: operatorHeaders });
		expect(takeover.headers.get("cache-control")).toBe("no-store");
		expect(await takeover.json()).toMatchObject({ capability: "control", token: claim.token });
		const release = await fetch(`${base}/v1/desktops/research/release`, {
			method: "POST",
			body,
			headers: operatorHeaders,
		});
		expect(await release.json()).toEqual({ state: "released" });
		expect(calls.slice(-2)).toEqual([
			"take:research:owned-browser",
			"release:research:owned-browser",
		]);
		const wakeUrl = `${base}/v1/desktops/profiles/writer/wake`;
		expect((await fetch(wakeUrl, { method: "POST", body: "{}" })).status).toBe(401);
		expect(
			(
				await fetch(wakeUrl, {
					method: "POST",
					body: "{}",
					headers: { authorization: "Bearer scoped-api-key" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await fetch(wakeUrl, {
					method: "POST",
					body: JSON.stringify({ chromePath: "/arbitrary" }),
					headers: operatorHeaders,
				})
			).status,
		).toBe(409);
		const wake = await fetch(wakeUrl, {
			method: "POST",
			body: JSON.stringify({ desktopName: "research" }),
			headers: operatorHeaders,
		});
		expect(await wake.json()).toMatchObject({
			runtimeProfileId: "writer",
			desktopName: "research",
		});
		expect(calls.at(-1)).toBe("wake:writer:research");
		refusal = new NativeDesktopControlError("Another controller owns this desktop.", false);
		const rejected = await fetch(controlUrl, { method: "POST", body, headers: operatorHeaders });
		expect(rejected.status).toBe(409);
		expect(await rejected.json()).toMatchObject({ error: { claimRetained: false } });
		refusal = new Error("Issuance response lost.");
		const unknown = await fetch(controlUrl, { method: "POST", body, headers: operatorHeaders });
		expect((await unknown.json()).error).not.toHaveProperty("claimRetained");
		const closeUrl = `${base}/v1/desktops/research/close`;
		const closeBody = JSON.stringify({ browserId: "owned-browser" });
		expect((await fetch(closeUrl, { method: "POST", body: closeBody })).status).toBe(401);
		expect(
			(
				await fetch(closeUrl, {
					method: "POST",
					body: closeBody,
					headers: { authorization: "Bearer scoped-api-key" },
				})
			).status,
		).toBe(403);
		expect(
			(await fetch(closeUrl, { method: "POST", body: "{}", headers: operatorHeaders })).status,
		).toBe(400);
		const closed = await fetch(closeUrl, {
			method: "POST",
			body: closeBody,
			headers: operatorHeaders,
		});
		expect(closed.headers.get("cache-control")).toBe("no-store");
		expect(await closed.json()).toEqual({ state: "closed" });
		expect(calls.at(-1)).toBe("close:research:owned-browser");
	} finally {
		await server.close();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true });
	}
});
