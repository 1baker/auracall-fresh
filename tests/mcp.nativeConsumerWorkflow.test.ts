import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { NativeConsumerSession } from "../src/browser/frontends/nativeConsumer.js";
import { NativeChatgptFrontend } from "../src/browser/frontends/nativeChatgpt.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { withCompletedIdentity } from "./browser/nativeIdentityFixture.js";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const clean of cleanups.splice(0).reverse()) await clean();
});

it.each([
	"normal",
	"draft",
	"completion-draft",
])("sealed-r2 native reply fixture, not installed acceptance: %s", async (mode) => {
	const directory = await mkdtemp(join(tmpdir(), "auracall-native-mcp-"));
	setAuracallHomeDirOverrideForTest(directory);
	cleanups.push(async () => {
		setAuracallHomeDirOverrideForTest(null);
		await rm(directory, { recursive: true, force: true });
	});
	let now = Date.now();
	let composer = "";
	let reads = 0;
	let fills = 0;
	let sends = 0;
	const messages: { role: string; text: string }[] = [];
	const answers = [
		`First entire answer\n\n${"αβγ🧪 line\n".repeat(2500)}`,
		`Second linked answer\n\n${"完整 🚀\n".repeat(3000)}`,
	];
	const admission = {
		consumerGrantId: "synthetic-grant",
		profileCapability: "synthetic-secret-not-durable",
		taskKey: "synthetic-own-task",
		profileId: "disposable:default:6",
		browserId: "synthetic-browser",
		tabId: "synthetic-tab",
		targetId: "synthetic-target",
		expiresAtMs: now + 120000,
	};
	const nativeServer = new McpServer({ name: "synthetic-native-producer", version: "1" });
	const response = (tool: string, action: string, key: string, result: unknown) => {
		const kind =
			action === "open"
				? "opened"
				: ["url", "snapshot", "gettext"].includes(action)
					? "observed"
					: "input_acknowledged";
		const ack = { kind, completedAtMs: now };
		const value = withCompletedIdentity(
			{
				contractVersion: "agent-browser.retained-consumer.v1",
				taskId: "synthetic-consumer-task",
				controlRef: "synthetic-control",
				consumerGrantId: admission.consumerGrantId,
				acquisitionId: "synthetic-acquisition",
				state: "active",
				expiresAtMs: admission.expiresAtMs,
				operation: {
					operationId: `op-${key}`,
					operationKey: key,
					action,
					state: "completed",
					ack,
					createdAtMs: now,
				},
				consumerAck: ack,
				targetObservation: {
					operationId: `op-${key}`,
					targetId: "synthetic-target",
					targetType: "page",
					origin: "https://chatgpt.com",
					stage: "after_action",
					observedAtMs: now,
				},
				result,
				...(action === "open"
					? {
							profileId: admission.profileId,
							browserId: admission.browserId,
							tabId: admission.tabId,
						}
					: {}),
			},
			admission,
		);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						tool,
						session: "synthetic-native",
						success: true,
						data: value,
						error: null,
					}),
				},
			],
		};
	};
	nativeServer.registerTool(
		"browser_open",
		{
			inputSchema: z
				.object({
					profileMode: z.literal("consumer"),
					consumerGrantId: z.literal(admission.consumerGrantId),
					profileCapability: z.literal(admission.profileCapability),
					taskKey: z.literal(admission.taskKey),
					profile: z.literal(admission.profileId),
					url: z.literal("https://chatgpt.com/"),
					serviceName: z.literal("AuraCall"),
					agentName: z.literal("frontend-mcp"),
					taskName: z.literal("auracall-e2e-20261021"),
				})
				.strict(),
		},
		() => response("browser_open", "open", "native-acquisition", null),
	);
	nativeServer.registerTool(
		"browser_command",
		{
			inputSchema: z
				.object({
					taskId: z.literal("synthetic-consumer-task"),
					operationKey: z.string(),
					action: z.enum(["url", "snapshot", "gettext", "fill", "click"]),
					params: z.record(z.string(), z.unknown()),
				})
				.strict(),
		},
		({ action, operationKey, params }) => {
			let result: unknown;
			if (["url", "snapshot", "gettext"].includes(action)) reads++;
			if (action === "url") result = { url: "https://chatgpt.com/c/synthetic" };
			if (action === "snapshot")
				result = {
					snapshot:
						'- button "Fixture Pro" [ref=e1]\n- button "Open profile menu" [ref=e2]\n- textbox "Ask anything" [ref=e3]' +
						(composer && composer !== "Ask anything" ? `: ${composer}` : "") +
						"\n" +
						messages
							.map(
								(m) =>
									"- article\n  - heading " +
									JSON.stringify(m.role === "user" ? "You said:" : "ChatGPT said:") +
									" [level=5]\n  - paragraph " +
									JSON.stringify(m.text) +
									"\n",
							)
							.join(""),
					refs: {
						e1: { role: "button", name: "Fixture Pro" },
						e2: { role: "button", name: "Open profile menu" },
						e3: { role: "textbox", name: "Ask anything" },
					},
				};
			if (action === "fill") {
				expect(params.selector).toBe("#prompt-textarea");
				composer = String(params.value);
				fills++;
				result = { filled: true };
			}
			if (action === "click") {
				expect(params.selector).toBe('button[data-testid="send-button"]');
				messages.push(
					{ role: "user", text: composer },
					{ role: "assistant", text: answers[sends] },
				);
				composer = "";
				sends++;
				result = { clicked: true };
			}
			if (action === "gettext") {
				const index = String(params.selector).match(/conversation-turn-(\d+)/)?.[1];
				result = {
					text: params.selector === "#prompt-textarea" ? composer : messages[Number(index)]?.text,
				};
			}
			return response("browser_command", action, operationKey, result);
		},
	);
	const nativeClient = new Client({ name: "synthetic-auracall-native", version: "1" });
	const pair = InMemoryTransport.createLinkedPair();
	await nativeServer.connect(pair[1]);
	await nativeClient.connect(pair[0]);
	const session = new NativeConsumerSession(
		{ callTool: (request) => nativeClient.callTool(request) },
		admission,
		join(directory, "native-ledger"),
		() => now,
	);
	await session.acquire();
	const route = {
		id: "native",
		provider: "chatgpt" as const,
		expectedUrl: "https://chatgpt.com/c/synthetic",
		expectedModel: "Fixture Pro",
		transport: "agent_browser_task" as const,
		nativeTask: session.binding,
	};
	const service = new NativeChatgptFrontend(session, route, () => now);
	const publicServer = new McpServer({ name: "auracall-native-fixture", version: "1" });
	registerFrontendTools(publicServer, service);
	const publicClient = new Client({ name: "synthetic-codex", version: "1" });
	const publicPair = InMemoryTransport.createLinkedPair();
	await publicServer.connect(publicPair[1]);
	await publicClient.connect(publicPair[0]);
	cleanups.push(async () => {
		await publicClient.close();
		await publicServer.close();
	});
	const call = async (name: string, args: Record<string, unknown>) => {
		const raw = await publicClient.callTool({ name, arguments: { routeId: "native", ...args } });
		expect(raw.isError).not.toBe(true);
		return raw.structuredContent as Record<string, unknown>;
	};
	if (mode === "draft") {
		composer = "Ask anything";
		const raw = await publicClient.callTool({
			name: "frontend_send",
			arguments: {
				routeId: "native",
				requestId: "protected-draft-request",
				text: "Do not overwrite the existing draft.",
			},
		});
		expect(raw.isError).toBe(true);
		expect(raw.structuredContent).toMatchObject({ code: "composer_busy" });
		expect({ reads, fills, sends, composer }).toEqual({
			reads: 3,
			fills: 0,
			sends: 0,
			composer: "Ask anything",
		});
		await nativeClient.close();
		await nativeServer.close();
		return;
	}
	if (mode === "completion-draft") {
		await call("frontend_send", {
			requestId: "draft-completion-request",
			text: "A bounded synthetic question.",
		});
		composer = "Ask anything";
		expect(await call("frontend_status", { requestId: "draft-completion-request" })).toMatchObject({
			status: "sent",
			output: null,
		});
		now += 1100;
		expect(await call("frontend_status", { requestId: "draft-completion-request" })).toMatchObject({
			status: "sent",
			output: null,
		});
		expect(composer).toBe("Ask anything");
		expect(sends).toBe(1);
		await nativeClient.close();
		await nativeServer.close();
		return;
	}
	for (const [index, requestId] of ["native-request-first", "native-request-second"].entries()) {
		const prompt = index
			? "Use your previous answer to continue."
			: "A bounded synthetic question.";
		expect(
			await call("frontend_send", {
				requestId,
				text: prompt,
				...(index ? { previousRequestId: "native-request-first" } : {}),
			}),
		).toMatchObject({ status: "sent", output: null });
		if (index === 0) {
			expect(await call("frontend_status", { requestId })).toMatchObject({
				status: "sent",
				output: null,
			});
			now += 1100;
			expect(await call("frontend_status", { requestId })).toMatchObject({
				status: "completed",
				output: answers[index],
				liveVerified: false,
				userMessageId: null,
				assistantMessageId: null,
			});
		} else {
			const held = await publicClient.callTool({
				name: "frontend_status",
				arguments: { routeId: "native", requestId },
			});
			expect(held.isError).toBe(true);
			expect(held.structuredContent).toMatchObject({ code: "consumer_budget_exhausted" });
		}
	}
	expect({ reads, fills, sends }).toEqual({ reads: 20, fills: 2, sends: 2 });
	await nativeClient.close();
	await nativeServer.close();
	const offline = new NativeChatgptFrontend(null, route);
	expect(await offline.status("native", "native-request-first")).toMatchObject({
		output: answers[0],
		status: "completed",
	});
	await expect(offline.status("native", "native-request-second")).rejects.toMatchObject({
		code: "consumer_binding_mismatch",
	});
	expect(
		await offline.send(
			"native",
			"native-request-second",
			"Use your previous answer to continue.",
			"native-request-first",
		),
	).toMatchObject({ status: "sent", output: null });
	const bundle = join(directory, "native-readback.mjs");
	await build({
		entryPoints: [
			fileURLToPath(new URL("../src/browser/frontends/nativeChatgpt.ts", import.meta.url)),
		],
		outfile: bundle,
		bundle: true,
		platform: "node",
		target: "node22",
		format: "esm",
	});
	const script = `import {NativeChatgptFrontend} from ${JSON.stringify(pathToFileURL(bundle).href)}; const service=new NativeChatgptFrontend(null,${JSON.stringify(route)}); console.log(JSON.stringify(await service.status("native","native-request-first")));`;
	const homeKey = "AURACALL_HOME_DIR";
	const fresh = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
		env: { ...process.env, [homeKey]: directory },
		maxBuffer: 1048576,
	});
	expect(JSON.parse(fresh.stdout)).toMatchObject({ status: "completed", output: answers[0] });
	expect({ reads, fills, sends }).toEqual({ reads: 20, fills: 2, sends: 2 });
});
