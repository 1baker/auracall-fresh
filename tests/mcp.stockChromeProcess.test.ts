import { spawn } from "node:child_process";
import { createHash, webcrypto } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { writeStockChromeFrontendConfig } from "../src/browser/stockChrome/config.js";
import { encodeNativeMessage, NativeMessageDecoder } from "../src/browser/stockChrome/framing.js";
import { syntheticChrome } from "./fixtures/frontend/stockChrome.js";

function chromeEvent<Args extends unknown[]>() {
	const listeners: ((...args: Args) => void)[] = [];
	return {
		addListener(listener: (...args: Args) => void) {
			listeners.push(listener);
		},
		emit(...args: Args) {
			for (const listener of listeners) listener(...args);
		},
	};
}

const homeEnv = "AURACALL_HOME_DIR",
	configEnv = "AURACALL_FRONTEND_CONFIG";

it.each([
	"chatgpt",
	"grok",
] as const)("configures %s and reads two complete linked replies through real MCP/native-host processes, then recovers with the bridge absent", async (provider) => {
	const root = dirname(dirname(fileURLToPath(import.meta.url)));
	const home = await mkdtemp(join(tmpdir(), "auracall-stock-process-"));
	const cache = join(root, "node_modules", ".cache");
	await mkdir(cache, { recursive: true });
	const compiled = await mkdtemp(join(cache, "auracall-stock-process-"));
	const hostEntry = join(compiled, "native-host.mjs"),
		mcpEntry = join(compiled, "mcp.mjs");
	const configFile = join(home, "frontend.json"),
		connectionFile = join(home, "connection.json"),
		hostConfig = join(home, "native.json");
	const extensionId = "a".repeat(32),
		url = `https://${provider === "chatgpt" ? "chatgpt.com" : "grok.com"}/c/stock-fixture`;
	const replies = [
		`Complete first reply µ\n\n${"x² + y² = z²\n".repeat(250)}FIRST END`,
		`Follow-up to the first reply.\n${"λ and αβ are preserved\n".repeat(250)}SECOND END`,
	];
	const hashes = replies.map((reply) => createHash("sha256").update(reply).digest("hex"));
	const browser = syntheticChrome({ url, replies });
	const clients: Client[] = [],
		transports: StdioClientTransport[] = [],
		pids: number[] = [];
	let child: ReturnType<typeof spawn> | undefined;
	const errors: string[] = [],
		stderr: string[] = [];
	let nativeRequests = 0;
	try {
		await Promise.all(
			[
				[join(root, "bin/auracall-stock-chrome-host.ts"), hostEntry],
				[join(root, "bin/auracall-stock-chrome-mcp.ts"), mcpEntry],
			].map(([entry, outfile]) =>
				build({
					entryPoints: [entry],
					outfile,
					bundle: true,
					platform: "node",
					format: "esm",
					target: "node22",
					keepNames: false,
					logLevel: "silent",
					banner: {
						js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
					},
				}),
			),
		);
		await writeFile(hostConfig, JSON.stringify({ extensionId, connectionFile }), { mode: 0o600 });
		const worker = await build({
			entryPoints: [join(root, "src/browser/stockChrome/extension/worker.ts")],
			bundle: true,
			platform: "browser",
			format: "iife",
			target: "chrome120",
			keepNames: false,
			write: false,
			logLevel: "silent",
		});
		const clicked = chromeEvent<[{ id: number }]>(),
			messages = chromeEvent<[unknown]>(),
			disconnected = chromeEvent<[]>();
		const badges: string[] = [];
		let connects = 0;
		let sharedResolve: () => void = () => {},
			sharedReject: (error: Error) => void = () => {};
		const shared = new Promise<void>((resolve, reject) => {
			sharedResolve = resolve;
			sharedReject = reject;
		});
		const timer = setTimeout(
			() => sharedReject(new Error(`Native sharing did not become ready: ${stderr.join("")}`)),
			8000,
		);
		const nativePort = {
			onMessage: messages,
			onDisconnect: disconnected,
			postMessage(packet: { kind: string; success?: boolean }) {
				if (packet.kind === "result" && packet.success === false)
					errors.push("Compiled extension declined a native request");
				child?.stdin?.write(encodeNativeMessage(packet));
			},
			disconnect() {
				child?.stdin?.end();
			},
		};
		const chrome = {
			...browser.api,
			tabs: {
				...browser.api.tabs,
				onUpdated: chromeEvent<[number, { url?: string; status?: string }]>(),
				onRemoved: chromeEvent<[number]>(),
			},
			debugger: { ...browser.api.debugger, onDetach: chromeEvent<[{ tabId?: number }]>() },
			action: {
				onClicked: clicked,
				async setBadgeText(options: { text: string }) {
					badges.push(options.text);
				},
				async setTitle() {},
			},
			runtime: {
				connectNative(name: string) {
					expect(name).toBe("com.auracall.stock_chrome");
					expect(++connects).toBe(1);
					child = spawn(
						process.execPath,
						[hostEntry, "--config", hostConfig, `chrome-extension://${extensionId}/`],
						{ stdio: ["pipe", "pipe", "pipe"] },
					);
					const native = child;
					if (!native.stdin || !native.stdout || !native.stderr)
						throw new Error("Missing native stdio");
					const decoder = new NativeMessageDecoder();
					native.stderr.on("data", (chunk) => stderr.push(String(chunk)));
					native.once("error", sharedReject);
					native.once("exit", () => {
						clearTimeout(timer);
						disconnected.emit();
						sharedReject(new Error(`Native host exited: ${stderr.join("")}`));
					});
					native.stdout.on("data", (chunk) => {
						for (const raw of decoder.push(chunk)) {
							const packet = raw as { kind: string };
							if (packet.kind === "request") nativeRequests++;
							messages.emit(packet);
							if (packet.kind === "shared") {
								clearTimeout(timer);
								sharedResolve();
							}
						}
					});
					return nativePort;
				},
			},
		};
		// Execute the actual bundled toolbar/Port entry, not a replacement controller.
		runInNewContext(worker.outputFiles[0].text, {
			chrome,
			crypto: webcrypto,
			setTimeout,
			clearTimeout,
			...Object.fromEntries([
				["TextEncoder", TextEncoder],
				["TextDecoder", TextDecoder],
				["URL", URL],
			]),
		});
		clicked.emit({ id: 1 });
		await shared;
		expect(badges).toContain("ON");
		const native = child;
		if (!native?.stdin) throw new Error("Toolbar did not open its native connection");
		await writeStockChromeFrontendConfig({
			connectionFile,
			outputFile: configFile,
			provider,
			id: "fixture",
			expectedUrl: url,
			expectedModel: provider === "chatgpt" ? "GPT fixture" : "Heavy",
		});
		const connect = async () => {
			const transport = new StdioClientTransport({
				command: process.execPath,
				args: [mcpEntry],
				cwd: root,
				env: { [homeEnv]: home, [configEnv]: configFile },
				stderr: "pipe",
			});
			transports.push(transport);
			const client = new Client({ name: "stock-process-test", version: "1" });
			clients.push(client);
			await client.connect(transport);
			if (!transport.pid) throw new Error("No real MCP process");
			pids.push(transport.pid);
			return async (name: string, args: Record<string, unknown>) => {
				const result = await client.callTool({ name, arguments: { routeId: "fixture", ...args } });
				expect(
					result.isError,
					JSON.stringify({ reply: result.structuredContent, errors, stderr }),
				).not.toBe(true);
				return result.structuredContent as Record<string, unknown>;
			};
		};
		let call = await connect();
		const effort = provider === "chatgpt" ? "pro" : "heavy";
		expect(await call("frontend_configure", { effort })).toMatchObject({ verified: true, effort });
		if (provider === "chatgpt")
			expect(browser.document.querySelector('[role="slider"]')?.getAttribute("aria-valuenow")).toBe(
				"4",
			);
		else
			expect(browser.document.querySelector("#picker")?.getAttribute("aria-label")).toBe(
				"Model: Heavy",
			);
		for (let index = 0; index < 2; index++) {
			const args = {
				requestId: `stock-reply-${index + 1}`,
				text: index === 1 ? "Continue your first answer" : "Return a complete answer",
				...(index === 1 ? { previousRequestId: "stock-reply-1" } : {}),
			};
			expect(await call("frontend_send", args)).toMatchObject({ status: "sent" });
			let response: Record<string, unknown> = {};
			await expect
				.poll(
					async () => {
						response = await call("frontend_status", { requestId: args.requestId });
						return response.status;
					},
					{ timeout: 5000, interval: 200 },
				)
				.toBe("completed");
			expect(response).toMatchObject({
				status: "completed",
				output: replies[index],
				previousRequestId: index === 1 ? "stock-reply-1" : null,
			});
			expect(createHash("sha256").update(String(response.output)).digest("hex")).toBe(
				hashes[index],
			);
		}
		expect(browser.counts()).toMatchObject({ fills: 2, sends: 2 });
		expect(browser.inputs).toEqual(["Return a complete answer", "Continue your first answer"]);
		expect(errors).toEqual([]);
		await clients.at(-1)?.close();
		const exited = once(native, "exit");
		native.stdin.end();
		const [code] = await exited;
		expect(code).toBe(0);
		await expect.poll(() => browser.counts().attached).toBe(false);
		const before = { nativeRequests, counts: browser.counts() };
		call = await connect();
		expect(new Set(pids).size).toBe(2);
		for (let index = 0; index < 2; index++) {
			expect(
				await call("frontend_status", { requestId: `stock-reply-${index + 1}` }),
			).toMatchObject({ status: "completed", output: replies[index] });
			expect(
				await call("frontend_send", {
					requestId: `stock-reply-${index + 1}`,
					text: index === 1 ? "Continue your first answer" : "Return a complete answer",
					...(index === 1 ? { previousRequestId: "stock-reply-1" } : {}),
				}),
			).toMatchObject({ status: "completed", output: replies[index] });
		}
		expect({ nativeRequests, counts: browser.counts() }).toEqual(before);
		expect(
			browser.methods.filter(
				(method) =>
					![
						"Runtime.evaluate",
						"Input.insertText",
						"Input.dispatchMouseEvent",
						"Input.dispatchKeyEvent",
					].includes(method),
			),
		).toEqual([]);
	} finally {
		for (const client of clients) await client.close().catch(() => {});
		for (const transport of transports) await transport.close().catch(() => {});
		if (child && child.exitCode === null) {
			const exit = once(child, "exit");
			child.stdin?.end();
			await exit;
		}
		await rm(home, { recursive: true, force: true });
		await rm(compiled, { recursive: true, force: true });
	}
}, 45000);
