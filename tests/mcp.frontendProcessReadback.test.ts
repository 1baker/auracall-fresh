import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

const homeEnv = "AURACALL_HOME_DIR";
const configEnv = "AURACALL_FRONTEND_CONFIG";
const capabilityEnv = "FIXTURE_CAPABILITY";

describe("complete frontend replies across real MCP process boundaries", () => {
	it.each([
		false,
		true,
	])("reads linked full replies across process restart with uncertain first Send=%s", async (uncertainFirstSend) => {
		const root = dirname(dirname(fileURLToPath(import.meta.url)));
		const home = await mkdtemp(join(tmpdir(), "auracall-process-readback-"));
		const cache = join(root, "node_modules", ".cache");
		await mkdir(cache, { recursive: true });
		const buildDir = await mkdtemp(join(cache, "auracall-frontend-process-"));
		const entry = join(buildDir, "server.mjs");
		const path = join(home, "frontend.json");
		const url = "https://chatgpt.com/c/process-readback-fixture";
		const handle = {
			valid: true,
			browserId: "process-browser",
			profileId: "process-profile",
			tabId: "process-tab",
			targetId: "process-target",
			sessionName: "process-session",
		};
		const replies = [
			`First complete reply αβ\n\n${"Equation: x² + y² = z²\n".repeat(250)}FIRST END`,
			`Connected continuation of the first reply.\n${"µm and λ, preserved exactly.\n".repeat(250)}SECOND END`,
		];
		const expectedHashes = replies.map((text) =>
			createHash("sha256").update(text, "utf8").digest("hex"),
		);
		const { document } = parseHTML(
			'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><main></main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body></html>',
		);
		const renderMessage = (role: string, text: string, index: number) => {
			const row = document.createElement("div");
			row.setAttribute("data-message-author-role", role);
			row.setAttribute("data-message-id", `${role}-${index}`);
			const lines = text.split("\n");
			for (const [lineIndex, line] of lines.entries()) {
				if (lineIndex > 0) row.append(document.createElement("br"));
				row.append(document.createTextNode(line));
			}
			return row;
		};
		let sends = 0;
		let fills = 0;
		let probes = 0;
		let posts = 0;
		let requests = 0;
		const errors: Error[] = [];
		const http = createServer(async (req, res) => {
			try {
				requests++;
				expect(req.headers.authorization).toBe("Bearer synthetic-capability");
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
				expect(req.method).toBe("POST");
				expect(req.url).toBe("/api/service/request");
				const chunks: Buffer[] = [];
				for await (const chunk of req) chunks.push(Buffer.from(chunk));
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				posts++;
				expect(body.serviceTabHandle).toEqual(handle);
				expect(body.targetId).toBe(handle.targetId);
				expect(body.repairPolicy).toBe("reject_only");
				expect(body.profileLeasePolicy).toBe("reject");
				let data: Record<string, unknown>;
				if (body.action === "probe") {
					probes++;
					const detector = body.probe.detectors[0];
					data = {
						ok: true,
						targetId: handle.targetId,
						url,
						detectors: [
							{
								id: detector.id,
								ok: true,
								resultTruncated: false,
								result: runInNewContext(detector.expression, { document, location: { href: url } }),
							},
						],
					};
				} else {
					expect(body.action).toBe("ui_action");
					expect(body.uiAction.maxActions).toBe(1);
					expect(body.uiAction.steps).toHaveLength(1);
					const step = body.uiAction.steps[0];
					const node = document.querySelector(step.selector);
					expect(node).toBeTruthy();
					const composer = document.querySelector("#prompt-textarea") as HTMLTextAreaElement;
					if (step.type === "fill") {
						expect(node).toBe(composer);
						expect(composer.value).toBe("");
						composer.value = step.value;
						fills++;
					} else {
						expect(step.type).toBe("click");
						expect(node?.getAttribute("data-testid")).toBe("send-button");
						expect(sends).toBeLessThan(2);
						for (const [role, text] of [
							["user", composer.value],
							["assistant", replies[sends]],
						]) {
							const row = renderMessage(role, text, sends + 1);
							document.querySelector("main")?.append(row);
						}
						composer.value = "";
						sends++;
						if (uncertainFirstSend && sends === 1) {
							req.socket.destroy();
							return;
						}
					}
					data = {
						ok: true,
						targetId: handle.targetId,
						url,
						steps: [{ index: 0, type: step.type, ok: true }],
					};
				}
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ success: true, data }));
			} catch (error) {
				errors.push(error as Error);
				res.writeHead(500).end();
			}
		});
		const clients: Client[] = [];
		const transports: StdioClientTransport[] = [];
		const pids: number[] = [];
		const connect = async (withCapability: boolean) => {
			const transport = new StdioClientTransport({
				command: process.execPath,
				args: [entry],
				cwd: root,
				env: {
					[homeEnv]: home,
					[configEnv]: path,
					...(withCapability ? { [capabilityEnv]: "synthetic-capability" } : {}),
				},
				stderr: "pipe",
			});
			transports.push(transport);
			const client = new Client({ name: "process-readback-client", version: "1" });
			clients.push(client);
			await client.connect(transport);
			if (transport.pid == null) throw new Error("The fixture did not start a real MCP process");
			pids.push(transport.pid);
			return async (name: string, args: Record<string, unknown>) => {
				const response = await client.callTool({
					name,
					arguments: { routeId: "fixture", ...args },
				});
				expect(
					response.isError,
					JSON.stringify({
						reply: response.structuredContent,
						fixtureErrors: errors.map((error) => error.message),
					}),
				).not.toBe(true);
				return response.structuredContent as Record<string, unknown>;
			};
		};
		try {
			// Rehearse visible text before starting a process or HTTP listener.
			for (const text of replies) expect(renderMessage("assistant", text, 1).innerText).toBe(text);
			// Match compiled production modules. TSX keepNames injects lexical
			// helpers into functions serialized for the browser's separate realm.
			await build({
				entryPoints: [join(root, "tests/fixtures/frontend/stdio-server.ts")],
				outfile: entry,
				bundle: true,
				packages: "external",
				platform: "node",
				format: "esm",
				target: "node22",
				keepNames: false,
				logLevel: "silent",
			});
			await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
			const address = http.address();
			if (!address || typeof address === "string") throw new Error("Missing synthetic port");
			await writeFile(
				path,
				JSON.stringify({
					brokerBaseUrl: `http://127.0.0.1:${address.port}`,
					routes: [
						{
							id: "fixture",
							provider: "chatgpt",
							expectedUrl: url,
							expectedModel: "GPT fixture",
							serviceTabHandle: handle,
							profileCapabilityEnv: "FIXTURE_CAPABILITY",
						},
					],
				}),
				{ mode: 0o600 },
			);
			let call = await connect(true);
			for (let index = 0; index < 2; index++) {
				const requestId = `process-reply-${index + 1}`;
				const sent = await call("frontend_send", {
					requestId,
					text: index === 0 ? "Return the first complete answer" : "Continue the previous answer",
					...(index === 1 ? { previousRequestId: "process-reply-1" } : {}),
				});
				expect(sent).toMatchObject({
					status: uncertainFirstSend && index === 0 ? "uncertain" : "sent",
					requestId,
				});
				if (uncertainFirstSend && index === 0) {
					await clients[0].close();
					call = await connect(true);
				}
				const read = await call("frontend_status", { requestId });
				expect(read).toMatchObject({
					status: "completed",
					output: replies[index],
					previousRequestId: index === 1 ? "process-reply-1" : null,
				});
				expect(createHash("sha256").update(String(read.output), "utf8").digest("hex")).toBe(
					expectedHashes[index],
				);
			}
			expect(errors).toEqual([]);
			expect({ sends, fills }).toEqual({ sends: 2, fills: 2 });
			await clients.at(-1)?.close();
			const before = { requests, posts, probes, sends, fills };
			await new Promise<void>((resolve) => {
				http.closeAllConnections();
				http.close(() => resolve());
			});
			const afterRestart = await connect(false);
			expect(new Set(pids).size).toBe(uncertainFirstSend ? 3 : 2);
			for (let index = 0; index < 2; index++) {
				const read = await afterRestart("frontend_status", {
					requestId: `process-reply-${index + 1}`,
				});
				expect(read).toMatchObject({ status: "completed", output: replies[index] });
				const repeated = await afterRestart("frontend_send", {
					requestId: `process-reply-${index + 1}`,
					text: index === 0 ? "Return the first complete answer" : "Continue the previous answer",
					...(index === 1 ? { previousRequestId: "process-reply-1" } : {}),
				});
				expect(repeated).toMatchObject({ status: "completed", output: replies[index] });
				expect(createHash("sha256").update(String(read.output), "utf8").digest("hex")).toBe(
					expectedHashes[index],
				);
			}
			expect({ requests, posts, probes, sends, fills }).toEqual(before);
		} finally {
			for (const client of clients) await client.close().catch(() => {});
			for (const transport of transports) await transport.close().catch(() => {});
			await new Promise<void>((resolve) => {
				http.closeAllConnections();
				http.close(() => resolve());
			});
			await rm(home, { recursive: true, force: true });
			await rm(buildDir, { recursive: true, force: true });
		}
	}, 45_000);
});
