// biome-ignore-all lint/style/useNamingConvention: native protocol fixture keys.
import { maintainDesktopPool } from "../../src/browser/service/nativeDesktopPool.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import type { ResolvedBrowserConfig, BrowserLogger } from "../../src/browser/types.js";
import { DEFAULT_BROWSER_CONFIG } from "../../src/browser/config.js";
import { launchNativeDesktopBrowser } from "../../src/browser/service/nativeDesktopRuntime.js";
import { wakeDesktopRuntimeProfile } from "../../src/browser/service/desktopRuntimeProfiles.js";
import { ComposedConfigSchema } from "../../src/config/schema.js";
import { listDesktopViews } from "../../src/browser/service/desktopClient.js";
import { NativeDesktopStore } from "../../src/browser/service/nativeDesktopStore.js";

vi.mock("../../src/browser/cdp.js", () => ({
	default: async () => ({
		Target: { getTargets: async () => ({ targetInfos: [] }) },
		close: async () => {},
	}),
}));

test.each([
	2, 4,
])("automatic rail Wake grows and wraps at configured capacity %i", async (maximum) => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-pool-"));
	setAuracallHomeDirOverrideForTest(home);
	const children: ChildProcess[] = [];
	const assignments: Array<{
		assignmentId: string;
		desktopId: string;
		generation: number;
		viewingGeneration: number;
	}> = [];
	const occupied = new Map<string, number>();
	let acquisitions = 0;
	let unknownWindows = false;
	let failAcquireReply = false;
	const replay = new Map<string, (typeof assignments)[number]>();
	const server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(Buffer.from(c));
		const { request } = JSON.parse(Buffer.concat(chunks).toString());
		res.setHeader("Content-Type", "application/json");
		let data: unknown;
		if (request.operation === "windows" && unknownWindows) {
			res.statusCode = 503;
			res.end(JSON.stringify({ code: "fixture_window_unavailable", retryable: true }));
			return;
		}
		if (request.operation === "acquire") {
			let a = replay.get(request.idempotency_key);
			if (!a) {
				acquisitions++;
				const i = assignments.length + 1;
				a = { assignmentId: `a${i}`, desktopId: `d${i}`, generation: 1, viewingGeneration: 1 };
				assignments.push(a);
				replay.set(request.idempotency_key, a);
			}
			if (failAcquireReply) {
				failAcquireReply = false;
				res.statusCode = 503;
				res.end(JSON.stringify({ code: "fixture_reply_lost", retryable: true }));
				return;
			}
			data = { ...a, state: "active" };
		} else if (request.operation === "inventory")
			data = {
				schemaVersion: 1,
				registration: { consumerKey: "auracall", registrationId: "r" },
				policy: {
					pools: {
						main: {
							minimum_reserved: 0,
							maximum_reserved: maximum,
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
						desktopMembers: assignments.map((a) => a.desktopId),
					},
				],
				assignments: assignments.map((a) => ({
					...a,
					registrationId: "r",
					poolId: "p",
					state: "active",
				})),
				desktops: assignments.map((a) => ({
					desktopId: a.desktopId,
					lifecycle: {
						generation: 1,
						state: "ready",
						readinessScope: "live_resource",
						allocated: true,
					},
					viewing: {
						desktopId: `v${a.desktopId}`,
						lifecycleGeneration: 1,
						generation: 1,
						publicRoute: "/1",
					},
				})),
			};
		else {
			const a = assignments.find((a) => a.assignmentId === request.assignment_id);
			if (!a) throw Error("Unknown assignment");
			if (request.operation === "windows")
				data = {
					schemaVersion: 1,
					operation: "desktop.windows",
					desktopId: a.desktopId,
					generation: 1,
					viewingGeneration: 1,
					windows: occupied.has(a.assignmentId)
						? [{ id: 1, pid: occupied.get(a.assignmentId) }]
						: [],
				};
			else
				data = {
					schemaVersion: 1,
					readinessScope: "live_resource",
					target: {
						assignmentId: a.assignmentId,
						registrationId: "r",
						desktopId: a.desktopId,
						lifecycleGeneration: 1,
						viewingDesktopId: `v${a.desktopId}`,
						viewingGeneration: 1,
					},
					environment: {
						DISPLAY: `:${70 + assignments.indexOf(a)}`,
						XAUTHORITY: "/private/Xauthority",
						REMOTE_VIEW_SLOT_GENERATION: "1",
					},
				};
		}
		res.end(JSON.stringify(data));
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const address = server.address();
		if (!address || typeof address === "string") throw Error("No port");
		const config = {
			...DEFAULT_BROWSER_CONFIG,
			chromePath: process.execPath,
			remoteViewDesktop: {
				automatic: true,
				desktopName: "auto",
				poolName: "main",
				application: "auracall",
				origin: `http://127.0.0.1:${address.port}`,
				publicOrigin: "https://viewer.example.test",
				appOrigin: "https://aura.example.test",
			},
		};
		const launch = async (c: typeof config, dir: string) => {
			const child = spawn(
				process.execPath,
				["-e", "setInterval(()=>{},1000)", "--", `--user-data-dir=${dir}`],
				{ env: { ...process.env, DISPLAY: c.display ?? "" }, stdio: "ignore" },
			);
			children.push(child);
			await once(child, "spawn");
			const a = assignments.find((_, i) => c.display === `:${70 + i}`);
			if (!a || !child.pid) throw Error("No child assignment");
			occupied.set(a.assignmentId, child.pid);
			return {
				pid: child.pid,
				port: 45000 + children.length,
				kill: async () => {
					child.kill();
				},
			};
		};
		await launchNativeDesktopBrowser({
			config,
			userDataDir: path.join(home, "first"),
			logger: () => {},
			launch: launch as never,
		});
		await launchNativeDesktopBrowser({
			config,
			userDataDir: path.join(home, "second"),
			logger: () => {},
			launch: launch as never,
		});
		const bindings = await new NativeDesktopStore().browsers();
		expect(new Set(bindings.map((b) => b.assignment.desktopId)).size).toBe(2);
		expect(acquisitions).toBe(2);
		const catalog = await listDesktopViews({
			remoteView: {
				pool: { name: "main" },
				application: {
					name: "auracall",
					origin: config.remoteViewDesktop.origin,
					publicOrigin: config.remoteViewDesktop.publicOrigin,
					appOrigin: config.remoteViewDesktop.appOrigin,
				},
			},
		});
		expect(catalog.desktops.filter((d) => d.state === "ready")).toHaveLength(2);
		await maintainDesktopPool({
			pool: { name: "main" },
			application: {
				name: "auracall",
				origin: config.remoteViewDesktop.origin,
				publicOrigin: config.remoteViewDesktop.publicOrigin,
				appOrigin: config.remoteViewDesktop.appOrigin,
			},
		});
		expect(acquisitions).toBe(maximum === 2 ? 2 : 3);
const store=new NativeDesktopStore();const old=(await store.browsers())[0];if(!old)throw Error('No live binding');
 await store.recordBrowser({...old,browserId:'closed-old-browser',managedProfileDir:path.join(home,'closed-old'),pid:2147483647,processStart:'old-generation',assignment:{...old.assignment,generation:999}});
 expect((await listDesktopViews({remoteView:{pool:{name:'main'},application:{name:'auracall',origin:config.remoteViewDesktop.origin,publicOrigin:config.remoteViewDesktop.publicOrigin,appOrigin:config.remoteViewDesktop.appOrigin}}})).desktops.filter(d=>d.state==='ready')).toHaveLength(2);
		const user = ComposedConfigSchema.parse({
			browserProfiles: { account: { chromePath: process.execPath } },
			runtimeProfiles: {
				writer: { engine: "browser", defaultService: "chatgpt", browserProfile: "account" },
			},
			remoteView: {
				pool: { name: "main" },
				application: {
					name: "auracall",
					origin: config.remoteViewDesktop.origin,
					publicOrigin: config.remoteViewDesktop.publicOrigin,
					appOrigin: config.remoteViewDesktop.appOrigin,
				},
			},
		});
		const wake = await wakeDesktopRuntimeProfile(user, "writer", undefined, {
			launch: (async (c: ResolvedBrowserConfig, dir: string, logger: BrowserLogger) =>
				launchNativeDesktopBrowser({
					config: c,
					userDataDir: dir,
					logger,
					launch: launch as never,
				})) as never,
		});
		expect(wake).toMatchObject({
			runtimeProfileId: "writer",
			desktopName: maximum === 2 ? "desktop-d1" : "desktop-d3",
		});
		expect(
			(await listDesktopViews({ remoteView: user.remoteView })).desktops.filter(
				(d) => d.state === "ready",
			),
		).toHaveLength(maximum === 2 ? 2 : 3);
		expect(acquisitions).toBe(maximum === 2 ? 2 : 3);
		unknownWindows = true;
		await expect(
			launchNativeDesktopBrowser({
				config,
				userDataDir: path.join(home, "blocked"),
				logger: () => {},
				launch: launch as never,
			}),
		).rejects.toThrow("unavailable");
		expect(children).toHaveLength(3);
		expect(acquisitions).toBe(maximum === 2 ? 2 : 3);
		unknownWindows = false;
		if (maximum === 4) {
			failAcquireReply = true;
			const retry = {
				config,
				userDataDir: path.join(home, "fourth"),
				logger: () => {},
				launch: launch as never,
			};
			await expect(launchNativeDesktopBrowser(retry)).rejects.toThrow("unavailable");
			expect(children).toHaveLength(3);
			expect(acquisitions).toBe(4);
			await launchNativeDesktopBrowser(retry);
			expect(children).toHaveLength(4);
			expect(acquisitions).toBe(4);
		}
	} finally {
		for (const c of children) {
			const done = once(c, "exit");
			c.kill();
			await done;
		}
		await new Promise<void>((r) => server.close(() => r()));
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true });
	}
});
