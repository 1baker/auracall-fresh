// biome-ignore-all lint/style/useNamingConvention: native protocol fixture.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { maintainDesktopPool } from "../../src/browser/service/nativeDesktopPool.js";
import { NativeDesktopStore } from "../../src/browser/service/nativeDesktopStore.js";

test.each([
	{ viewerActive: false, recovery: false, replyLoss: false, unretained: false },
	{ viewerActive: false, recovery: false, replyLoss: false, unretained: true },
	{ viewerActive: true, recovery: false, replyLoss: false },
	{ viewerActive: false, recovery: true, replyLoss: false },
	{ viewerActive: false, recovery: false, replyLoss: true },
])("pool maintenance protects obligations: %j", async ({
	viewerActive,
	recovery,
	replyLoss,
	unretained,
}) => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-shrink-"));
	setAuracallHomeDirOverrideForTest(home);
	const active = new Set(["a1", "a2", "a3"]);
	const releases: string[] = [];
	let loseReply = replyLoss;
	const server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(Buffer.from(c));
		const { request } = JSON.parse(Buffer.concat(chunks).toString());
		res.setHeader("Content-Type", "application/json");
		let data: unknown;
		const id = request.assignment_id as string;
		const d = id?.replace("a", "d");
		const target = {
			assignmentId: id,
			registrationId: "r",
			desktopId: d,
			lifecycleGeneration: 1,
			viewingDesktopId: `v${d}`,
			viewingGeneration: 1,
		};
		if (request.operation === "inventory")
			data = {
				schemaVersion: 1,
				registration: { consumerKey: "auracall", registrationId: "r" },
				policy: {
					pools: {
						main: {
							minimum_reserved: 0,
							maximum_reserved: 5,
							idle_retention_seconds: 30,
							allow_scale_in: true,
						},
					},
				},
				pools: [
					{
						poolId: "p",
						registrationId: "r",
						name: "main",
						desktopMembers: [...active].map((a) => a.replace("a", "d")),
					},
				],
				assignments: [...active].map((a) => ({
					assignmentId: a,
					desktopId: a.replace("a", "d"),
					registrationId: "r",
					poolId: "p",
					generation: 1,
					state: "active",
				})),
				desktops: [...active].map((a) => ({
					desktopId: a.replace("a", "d"),
					lifecycle: {
						generation: 1,
						state: "ready",
						readinessScope: "live_resource",
						allocated: true,
					},
					viewing: { desktopId: `v${a}`, lifecycleGeneration: 1, generation: 1, publicRoute: "/1" },
				})),
			};
		else if (request.operation === "windows")
			data = {
				schemaVersion: 1,
				operation: "desktop.windows",
				desktopId: d,
				generation: 1,
				viewingGeneration: 1,
				windows: [],
			};
		else if (request.operation === "observe_idle")
			data = {
				schemaVersion: 1,
				readinessScope: "live_resource",
				target,
				idle: !(viewerActive && id === "a2"),
				viewerActive: viewerActive && id === "a2",
				retirement: {
					schemaVersion: 1,
					desktopId: d,
					generation: 1,
					sessions: viewerActive && id === "a2" ? ["viewer-session"] : [],
					routes: [],
				},
			};
		else if (request.operation === "release_idle") {
			if (active.has(id)) {
				releases.push(id);
				active.delete(id);
			}
			if (loseReply) {
				loseReply = false;
				res.statusCode = 503;
				res.end(JSON.stringify({ code: "fixture_reply_lost", retryable: true }));
				return;
			}
			data = {
				assignment: { assignmentId: id, desktopId: d, generation: 1, state: "released" },
				retirement: request.expected_retirement,
			};
		} else throw Error(`Unexpected request ${request.operation}`);
		res.end(JSON.stringify(data));
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const a = server.address();
		if (!a || typeof a === "string") throw Error("No port");
		const remoteView = {
			pool: { name: "main" },
			application: {
				name: "auracall",
				origin: `http://127.0.0.1:${a.port}`,
				publicOrigin: "https://viewer.example.test",
				appOrigin: "https://aura.example.test",
			},
		};
		const store = new NativeDesktopStore();
		for (const id of active) {
			if (unretained && id === "a2") continue;
			await store.recordDesktop({
				desktopName: `desktop-${id}`,
				application: "auracall",
				origin: remoteView.application.origin,
				poolName: "main",
				assignment: {
					assignmentId: id,
					desktopId: id.replace("a", "d"),
					generation: 1,
					viewingGeneration: 1,
				},
			});
		}
		if (unretained) {
			expect(await maintainDesktopPool(remoteView)).toBe("deferred");
			expect(releases).toEqual([]);
			return;
		}

		if (recovery) {
			const desktop = (await store.desktops()).find((d) => d.assignment.assignmentId === "a2");
			if (!desktop) throw Error("No recovery desktop");
			const managedProfileDir = path.join(home, "managed-recovery");
			await store.recordBrowser({
				...desktop,
				browserId: "recovery-browser",
				managedProfileDir,
				pid: 2147483647,
				processStart: "old",
				bootId: "old",
				executable: "/fixture/chrome",
				display: ":77",
				cdpHost: "127.0.0.1",
				cdpPort: 45000,
			});
			const leases = path.join(home, "browser-coordination", "tab-leases");
			await fs.mkdir(leases, { recursive: true });
			await fs.writeFile(
				path.join(leases, "tab-leases.v1.json"),
				JSON.stringify({
					schemaVersion: 1,
					leases: [{ scope: { managedBrowserProfile: managedProfileDir }, state: "lost" }],
					controls: [],
				}),
			);
		}
		await store.exclusive("wake:writer", async () => {
			expect(await maintainDesktopPool(remoteView)).toBe("deferred");
			expect(releases).toEqual([]);
		});
		if (replyLoss) await expect(maintainDesktopPool(remoteView)).rejects.toThrow("unavailable");
		await maintainDesktopPool(remoteView);
		expect(releases).toEqual(viewerActive || recovery ? ["a3"] : ["a2", "a3"]);
		expect([...active]).toEqual(viewerActive || recovery ? ["a1", "a2"] : ["a1"]);
		expect(new Set((await store.desktops()).map((d) => d.assignment.assignmentId))).toEqual(
			new Set(viewerActive || recovery ? ["a1", "a2"] : ["a1"]),
		);
	} finally {
		await new Promise<void>((r) => server.close(() => r()));
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true });
	}
});
