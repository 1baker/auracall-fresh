import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { parseHTML } from "linkedom";
import { expect, it } from "vitest";

async function listen(server: Server) {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No isolated fixture address");
	return address.port;
}
async function close(server: Server | undefined) {
	if (!server?.listening) return;
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

it("uses the normal CLI and HTTPS JWKS, preserving linked receipts across real process restart", async () => {
	const home = await mkdtemp(join(tmpdir(), "auracall-http-process-"));
	let broker: Server | undefined,
		as: Server | undefined,
		child: ChildProcess | undefined,
		client: Client | undefined;
	const stop = async () => {
		if (client) {
			await client.close();
			client = undefined;
		}
		if (child && child.exitCode === null && child.signalCode === null) {
			const exited = once(child, "exit");
			child.kill("SIGTERM");
			await exited;
		}
	};
	try {
		const certificate = join(home, "ca.pem"),
			certificateKey = join(home, "ca-key.pem");
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-sha256",
				"-subj",
				"/CN=127.0.0.1",
				"-addext",
				"subjectAltName=IP:127.0.0.1",
				"-keyout",
				certificateKey,
				"-out",
				certificate,
				"-days",
				"1",
			],
			{ stdio: "ignore" },
		);
		await chmod(certificateKey, 0o600);
		const signing = await generateKeyPair("RS256");
		const jwk = { ...(await exportJWK(signing.publicKey)), kid: "process-key", alg: "RS256" };
		let jwksReads = 0;
		as = createTlsServer(
			{ key: await readFile(certificateKey), cert: await readFile(certificate) },
			(req, res) => {
				expect(req.url).toBe("/jwks");
				expect(req.headers.authorization).toBeUndefined();
				jwksReads++;
				res.setHeader("content-type", "application/json");
				res.end(JSON.stringify({ keys: [jwk] }));
			},
		);
		const issuer = `https://127.0.0.1:${await listen(as)}`;
		const resource = "https://auracall.example.test/mcp";
		const bearer = await new SignJWT({ scope: "frontend:read frontend:send" })
			.setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "process-key" })
			.setIssuer(issuer)
			.setAudience(resource)
			.setSubject("process-owner")
			.setExpirationTime("5m")
			.sign(signing.privateKey);
		const url = "https://chatgpt.com/c/process-fixture";
		const { document } = parseHTML(
			'<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><main></main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body></html>',
		);
		const handle = {
			valid: true,
			browserId: "process-browser",
			sessionName: "process-session",
			profileId: "process-profile",
			targetId: "process-target",
			tabId: "process-tab",
		};
		const contracts = JSON.parse(
			await readFile(
				new URL("./fixtures/frontend/service-contracts.json", import.meta.url),
				"utf8",
			),
		);
		let clicks = 0,
			probes = 0;
		const brokerErrors: string[] = [];
		broker = createServer((req, res) => {
			void (async () => {
				expect(req.headers.authorization).toBe("Bearer process-fixture-cap");
				expect(req.headers.authorization).not.toContain(bearer);
				res.setHeader("content-type", "application/json");
				if (req.url === "/api/service/contracts") {
					res.end(JSON.stringify(contracts));
					return;
				}
				expect(req.url).toBe("/api/service/request");
				const chunks: Buffer[] = [];
				for await (const chunk of req) chunks.push(Buffer.from(chunk));
				const request = JSON.parse(Buffer.concat(chunks).toString());
				expect(request.serviceTabHandle).toEqual(handle);
				expect(request.repairPolicy).toBe("reject_only");
				const common = { ok: true, targetId: handle.targetId, url };
				let data: Record<string, unknown>;
				if (request.action === "probe") {
					probes++;
					const detector = request.probe.detectors[0];
					data = {
						...common,
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
					expect(request.action).toBe("ui_action");
					const step = request.uiAction.steps[0];
					const node = document.querySelector(step.selector) as HTMLTextAreaElement;
					expect(node).toBeTruthy();
					if (step.type === "fill") node.value = step.value;
					else {
						expect(step.type).toBe("click");
						clicks++;
						const input = document.querySelector("#prompt-textarea") as HTMLTextAreaElement;
						const reply =
							clicks === 1
								? "PROCESS-BLUE"
								: input.value.includes("PROCESS-BLUE")
									? "PROCESS-BLUE CONNECTED"
									: "CONTEXT LOST";
						for (const [role, value] of [
							["user", input.value],
							["assistant", reply],
						]) {
							const element = document.createElement("div");
							element.setAttribute("data-message-author-role", role);
							element.setAttribute("data-message-id", `${role}-${clicks}`);
							element.textContent = value;
							document.querySelector("main")?.append(element);
						}
						input.value = "";
					}
					data = { ...common, steps: [{ index: 0, type: step.type, ok: true }] };
				}
				res.end(JSON.stringify({ success: true, data }));
			})().catch((error) => {
				brokerErrors.push(String(error));
				res.statusCode = 500;
				res.end('{"error":"fixture_broker_failed"}');
			});
		});
		const brokerPort = await listen(broker);
		const reserve = createServer();
		const port = await listen(reserve);
		await close(reserve);
		const frontendPath = join(home, "frontend.json"),
			authPath = join(home, "oauth.json");
		await writeFile(
			frontendPath,
			JSON.stringify({
				brokerBaseUrl: `http://127.0.0.1:${brokerPort}`,
				routes: [
					{
						id: "process-route",
						provider: "chatgpt",
						expectedUrl: url,
						expectedModel: "GPT fixture",
						serviceTabHandle: handle,
						profileCapabilityEnv: "FIXTURE_BROWSER_CAP",
					},
				],
			}),
			{ mode: 0o600 },
		);
		await writeFile(
			authPath,
			JSON.stringify({
				resource,
				issuer,
				jwksUri: `${issuer}/jwks`,
				subject: "process-owner",
				routeIds: ["process-route"],
				port,
			}),
			{ mode: 0o600 },
		);
		const base = `http://127.0.0.1:${port}`;
		const nativeFetch: typeof fetch = async (input, init) => {
			const target = new URL(input instanceof Request ? input.url : input.toString());
			if (target.origin !== base) throw new Error("Process fixture left loopback");
			return new Promise<Response>((resolve, reject) => {
				const request = httpRequest(
					target,
					{
						method: init?.method ?? "GET",
						headers: Object.fromEntries(new Headers(init?.headers)),
					},
					(response) => {
						const chunks: Buffer[] = [];
						response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
						response.once("error", reject);
						response.once("end", () =>
							resolve(
								new Response(Buffer.concat(chunks), {
									status: response.statusCode,
									headers: response.headers as Record<string, string>,
								}),
							),
						);
					},
				);
				request.once("error", reject);
				if (init?.body && typeof init.body !== "string") throw new Error("Unexpected fixture body");
				request.end(init?.body ?? undefined);
			});
		};
		let diagnostic = "";
		const start = async () => {
			child = spawn(
				process.execPath,
				[fileURLToPath(new URL("../dist/bin/auracall-mcp.js", import.meta.url)), "--http"],
				{
					cwd: fileURLToPath(new URL("..", import.meta.url)),
					stdio: ["ignore", "pipe", "pipe"],
					env: Object.fromEntries([
						["PATH", process.env.PATH],
						["NODE_EXTRA_CA_CERTS", certificate],
						["AURACALL_HOME_DIR", join(home, "store")],
						["AURACALL_FRONTEND_CONFIG", frontendPath],
						["AURACALL_FRONTEND_OAUTH_CONFIG", authPath],
						["FIXTURE_BROWSER_CAP", "process-fixture-cap"],
					]),
				},
			);
			child.stdout?.on("data", (data) => {
				diagnostic += String(data);
			});
			child.stderr?.on("data", (data) => {
				diagnostic += String(data);
			});
			let ready = false;
			for (let n = 0; n < 100; n++) {
				if (child.exitCode !== null)
					throw new Error(`CLI fixture exited before ready: ${diagnostic}`);
				try {
					const response = await nativeFetch(`${base}/.well-known/oauth-protected-resource`, {
						headers: { host: "auracall.example.test" },
					});
					if (response.status === 200) {
						ready = true;
						break;
					}
				} catch {
					/* Only the isolated fixture's startup is polled. */
				}
				await delay(50);
			}
			if (!ready) throw new Error("CLI fixture was not ready");
			client = new Client({ name: "normal-entrypoint-fixture", version: "1" });
			await client.connect(
				new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
					requestInit: {
						headers: { host: "auracall.example.test", authorization: `Bearer ${bearer}` },
					},
					fetch: nativeFetch,
				}),
			);
		};
		const call = async (name: string, args: Record<string, unknown>) => {
			if (!client) throw new Error("Missing process client");
			return client.callTool({ name, arguments: { routeId: "process-route", ...args } });
		};
		await start();
		expect((await client?.listTools())?.tools.map((tool) => tool.name).sort()).toEqual([
			"frontend_configure",
			"frontend_inspect",
			"frontend_send",
			"frontend_status",
		]);
		const sent = await call("frontend_send", {
			requestId: "process-first-01",
			text: "Remember PROCESS-BLUE",
		});
		expect(brokerErrors).toEqual([]);
		expect(sent.structuredContent).toMatchObject({ status: "sent" });
		const first = await call("frontend_status", { requestId: "process-first-01" });
		expect(first.structuredContent).toMatchObject({ status: "completed", output: "PROCESS-BLUE" });
		const text = `Use actual first reply ${(first.structuredContent as { output: string }).output}`;
		await call("frontend_send", {
			requestId: "process-second-01",
			previousRequestId: "process-first-01",
			text,
		});
		const second = await call("frontend_status", { requestId: "process-second-01" });
		expect(second.structuredContent).toMatchObject({
			status: "completed",
			previousRequestId: "process-first-01",
			output: "PROCESS-BLUE CONNECTED",
		});
		const record = join(home, "store/frontend-requests/process-second-01.json");
		const before = await readFile(record);
		const counts = { clicks, probes };
		await stop();
		await start();
		expect(await call("frontend_status", { requestId: "process-second-01" })).toEqual(second);
		expect(
			await call("frontend_send", {
				requestId: "process-second-01",
				previousRequestId: "process-first-01",
				text,
			}),
		).toEqual(second);
		expect(await readFile(record)).toEqual(before);
		expect({ clicks, probes }).toEqual(counts);
		expect(clicks).toBe(2);
		expect(jwksReads).toBe(2);
		expect(diagnostic).not.toContain(bearer);
	} finally {
		await stop();
		await close(broker);
		await close(as);
		await rm(home, { recursive: true, force: true });
	}
}, 30000);
