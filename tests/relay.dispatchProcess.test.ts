import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { stockCommand } from "../src/browser/stockChrome/commands.js";
import { StockChromeController } from "../src/browser/stockChrome/controller.js";
import { syntheticChrome } from "./fixtures/frontend/stockChrome.js";

const homeEnv = "AURACALL_HOME_DIR",
	relayEnv = "AURACALL_RELAY_OAUTH_CONFIG",
	frontendEnv = "AURACALL_FRONTEND_CONFIG";

it.each([
	"dispatch",
	"prepare-only",
] as const)("compiled CLI %s uses real frontend Pro controls and durable recovery", async (mode) => {
	const repo = dirname(dirname(fileURLToPath(import.meta.url)));
	const home = await mkdtemp(join(tmpdir(), "auracall-dispatch-process-"));
	const cache = join(repo, "node_modules/.cache");
	await mkdir(cache, { recursive: true });
	const out = await mkdtemp(join(cache, "relay-sender-process-"));
	const url = "https://chatgpt.com/c/sender-fixture";
	const answers = [
		`${"Full Unicode reply λ🧪\n".repeat(400)}FIRST END`,
		"A linked follow-up\nSECOND END",
	];
	const browser = syntheticChrome({ url, replies: answers });
	const slider = browser.document.querySelector('[role="slider"]');
	expect(slider?.getAttribute("aria-valuetext")).toBe("Instant");
	const controller = new StockChromeController(browser.api, "00000000-0000-4000-8000-000000000001");
	const handle = await controller.share(1);
	const token = "f".repeat(64);
	let requests = 0;
	const failures: string[] = [];
	const http = createServer(async (req, res) => {
		requests++;
		res.setHeader("Content-Type", "application/json");
		try {
			if (req.headers.authorization !== `Bearer ${token}`) throw Error("Wrong fixture capability");
			if (req.method === "GET" && req.url === "/api/service/contracts") {
				res.end(
					JSON.stringify({
						success: true,
						data: {
							schemaVersion: "v1",
							contracts: {
								serviceRequest: { version: "v1", actions: ["probe", "ui_action", "press"] },
							},
						},
					}),
				);
				return;
			}
			if (req.method !== "POST" || req.url !== "/api/service/request")
				throw Error("Wrong fixture endpoint");
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			const request = JSON.parse(Buffer.concat(chunks).toString());
			expect(request.serviceTabHandle).toEqual(handle);
			const data = await controller.execute(handle, stockCommand(request, handle));
			res.end(JSON.stringify({ success: true, data }));
		} catch (error) {
			failures.push(error instanceof Error ? error.message : "Fixture refused");
			res.statusCode = 409;
			res.end(JSON.stringify({ success: false, error: "fixture_refused" }));
		}
	});
	try {
		await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
		const address = http.address();
		if (!address || typeof address === "string") throw Error("Missing fixture port");
		const entry = join(out, "relay.mjs");
		await build({
			entryPoints: [join(repo, "bin/auracall-relay.ts")],
			outfile: entry,
			bundle: true,
			platform: "node",
			format: "esm",
			target: "node22",
			keepNames: false,
			banner: {
				js: 'import {createRequire as __createRequire} from "node:module"; const require=__createRequire(import.meta.url);',
			},
		});
		const oauth = join(home, "oauth.json"),
			frontend = join(home, "frontend.json"),
			connectionFile = join(home, "connection.json");
		await writeFile(
			oauth,
			JSON.stringify({
				mode: "relay",
				resource: "https://relay.example.test/mcp",
				issuer: "https://issuer.example.test",
				jwksUri: "https://issuer.example.test/jwks",
				subject: "synthetic-owner",
				relayDirectory: join(home, "jobs"),
			}),
			{ mode: 0o600 },
		);
		await writeFile(
			connectionFile,
			JSON.stringify({
				version: "auracall-stock-chrome-v1",
				sessionId: handle.sessionName,
				baseUrl: `http://127.0.0.1:${address.port}`,
				token,
			}),
			{ mode: 0o600 },
		);
		await writeFile(
			frontend,
			JSON.stringify({
				transport: "stock_chrome",
				connectionFile,
				routes: [
					{
						id: "fixture",
						provider: "chatgpt",
						expectedUrl: url,
						expectedModel: "GPT fixture",
						serviceTabHandle: handle,
					},
				],
			}),
			{ mode: 0o600 },
		);
		const env = {
			...process.env,
			[homeEnv]: home,
			[relayEnv]: oauth,
			[frontendEnv]: frontend,
		};
		const run = async (...args: string[]) => {
			try {
				return JSON.parse(
					(
						await promisify(execFile)(process.execPath, [entry, ...args], {
							env,
							timeout: 15000,
							maxBuffer: 2097152,
						})
					).stdout,
				);
			} catch (error) {
				throw new Error(`${String(error)}; synthetic transport failures: ${failures.join(", ")}`);
			}
		};
		if (mode === "prepare-only") {
			const prepared = await run("prepare-pro", "process_control_only", "fixture");
			expect(prepared).toMatchObject({
				state: "verified",
				preparationOnly: true,
				currentPageObserved: true,
				cached: false,
			});
			expect(slider?.getAttribute("aria-valuetext")).toBe("Pro");
			expect(browser.counts()).toMatchObject({ fills: 0, sends: 0 });
			const before = requests;
			await new Promise<void>((resolve) => {
				http.closeAllConnections();
				http.close(() => resolve());
			});
			await controller.close();
			expect(await run("prepare-pro", "process_control_only", "fixture")).toMatchObject({
				state: "verified",
				preparationOnly: true,
				currentPageObserved: false,
				cached: true,
			});
			expect(requests).toBe(before);
			expect(browser.counts()).toMatchObject({ fills: 0, sends: 0 });
			return;
		}
		const first = "process_sender_first",
			second = "process_sender_second";
		const firstInput = join(home, "first.json"),
			secondInput = join(home, "second.json");
		await writeFile(
			firstInput,
			JSON.stringify({ requestId: first, prompt: "Original first prompt λ" }),
			{ mode: 0o600 },
		);
		await run("enqueue", firstInput);
		const firstReply = await run("dispatch", first, "fixture");
		expect(firstReply.state).toBe("replied");
		expect(firstReply.reply.text).toBe(answers[0]);
		expect(slider?.getAttribute("aria-valuetext")).toBe("Pro");
		expect(slider?.getAttribute("aria-valuenow")).toBe("4");
		await writeFile(
			secondInput,
			JSON.stringify({
				requestId: second,
				prompt: "Continue the original answer",
				previousRequestId: first,
			}),
			{ mode: 0o600 },
		);
		await run("enqueue", secondInput);
		const secondReply = await run("dispatch", second, "fixture");
		expect(secondReply.state).toBe("replied");
		expect(secondReply.reply.text).toBe(answers[1]);
		expect(browser.inputs).toEqual(["Original first prompt λ", "Continue the original answer"]);
		expect(browser.counts()).toMatchObject({ fills: 2, sends: 2 });
		expect(failures).toEqual([]);
		const before = requests;
		await new Promise<void>((resolve) => {
			http.closeAllConnections();
			http.close(() => resolve());
		});
		await controller.close();
		expect(await run("dispatch", first, "fixture")).toMatchObject({
			state: "replied",
			reply: { text: answers[0] },
		});
		expect(await run("status", second)).toMatchObject({
			state: "replied",
			reply: { text: answers[1] },
		});
		expect(requests).toBe(before);
		expect(browser.counts().sends).toBe(2);
	} finally {
		http.closeAllConnections();
		if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
		await controller.close();
		await rm(home, { recursive: true, force: true });
		await rm(out, { recursive: true, force: true });
	}
}, 45000);
