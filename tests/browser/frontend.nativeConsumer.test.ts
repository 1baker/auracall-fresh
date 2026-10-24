import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	NativeConsumerSession,
	type NativeMcpClient,
	type NativeConsumerAdmission,
} from "../../src/browser/frontends/nativeConsumer.js";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";
const makeSession = (
	client: NativeMcpClient,
	input: NativeConsumerAdmission,
	path: string,
	now = Date.now,
) => new NativeConsumerSession(client, input, path, now);

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const admission = {
	consumerGrantId: "synthetic-grant",
	profileCapability: "synthetic-private-capability",
	taskKey: "synthetic-own-task",
	profileId: "disposable:default:6",
	browserId: "synthetic-browser",
	tabId: "synthetic-tab",
	targetId: "synthetic-target",
	expiresAtMs: 2000000000000,
};
const data = (action = "open", key = "acquisition-key") =>
	withCompletedIdentity(
		{
			targetObservation: {
				operationId: `synthetic-operation-${key}`,
				targetId: "synthetic-target",
				targetType: "page",
				origin: "https://chatgpt.com",
				stage: "after_action",
				observedAtMs: 1000,
			},
			contractVersion: "agent-browser.retained-consumer.v1",
			taskId: "synthetic-consumer-task",
			controlRef: "synthetic-control",
			consumerGrantId: admission.consumerGrantId,
			acquisitionId: "synthetic-acquisition",
			state: "active",
			expiresAtMs: admission.expiresAtMs,
			profileId: admission.profileId,
			browserId: admission.browserId,
			tabId: admission.tabId,
			operation: {
				operationId: `synthetic-operation-${key}`,
				operationKey: key,
				action,
				state: "completed",
				ack: {
					kind:
						action === "open"
							? "opened"
							: ["url", "snapshot", "gettext"].includes(action)
								? "observed"
								: "input_acknowledged",
					completedAtMs: 1000,
				},
				createdAtMs: 900,
			},
			consumerAck: {
				kind:
					action === "open"
						? "opened"
						: ["url", "snapshot", "gettext"].includes(action)
							? "observed"
							: "input_acknowledged",
				completedAtMs: 1000,
			},
			result: action === "url" ? { url: "https://chatgpt.com/c/synthetic" } : null,
		},
		admission,
	);
const envelope = (tool: string, value: unknown) => ({
	isError: false,
	content: [
		{
			type: "text",
			text: JSON.stringify({
				tool,
				session: "synthetic-session",
				success: true,
				data: value,
				error: null,
			}),
		},
	],
});
async function directory() {
	const p = await mkdtemp(join(tmpdir(), "auracall-native-consumer-"));
	dirs.push(p);
	return p;
}

describe("sealed-r2 public consumer transport with synthetic producer", () => {
	it("acquires once in consumer mode and retains the exact task/control on the same client", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		expect(await session.read("url", {}, "synthetic-url-key")).toEqual({
			url: "https://chatgpt.com/c/synthetic",
		});
		expect(callTool.mock.calls[0][0]).toEqual({
			name: "browser_open",
			arguments: {
				profileMode: "consumer",
				consumerGrantId: admission.consumerGrantId,
				profileCapability: admission.profileCapability,
				taskKey: admission.taskKey,
				profile: admission.profileId,
				url: "https://chatgpt.com/",
				serviceName: "AuraCall",
				agentName: "frontend-mcp",
				taskName: "auracall-e2e-20261021",
			},
		});
		expect(callTool.mock.calls[1][0]).toEqual({
			name: "browser_command",
			arguments: {
				taskId: "synthetic-consumer-task",
				operationKey: "synthetic-url-key",
				action: "url",
				params: {},
			},
		});
		await expect(session.acquire()).rejects.toMatchObject({ code: "consumer_acquisition_held" });
		expect(callTool).toHaveBeenCalledTimes(2);
	});
	it.each([
		"task",
		"control",
		"grant",
		"key",
		"action",
		"ack",
		"state",
		"replay",
		"queued",
	])("holds %s mismatch without input, new-key retry or private diagnostic disclosure", async (change) => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : args.action, args.operationKey);
			if (name !== "browser_open") {
				if (change === "task") d.taskId = "foreign-task";
				if (change === "control") d.controlRef = "foreign-control";
				if (change === "grant") d.consumerGrantId = "foreign-grant";
				if (change === "key") d.operation.operationKey = "foreign-key";
				if (change === "action") d.operation.action = "fill";
				if (change === "ack") d.consumerAck.completedAtMs++;
				if (change === "state") d.operation.state = "claimed";
				if (change === "replay") return envelope(name, { ...d, readbackOnly: true });
				if (change === "queued") return envelope(name, { jobId: "synthetic-job", state: "queued" });
			}
			return envelope(name, d);
		});
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		await expect(session.read("url", {}, "original-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		await expect(session.read("url", {}, "new-url-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(session)).not.toContain(admission.profileCapability);
		for (const file of await readdir(dir))
			expect(await readFile(join(dir, file), "utf8")).not.toContain(admission.profileCapability);
	});
	it.each([
		"fill",
		"click",
	])("requires an exact Boolean %s acknowledgment, never a reply", async (action) => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			const d = data(name === "browser_open" ? "open" : args.action, args.operationKey);
			return envelope(
				name,
				name === "browser_open"
					? d
					: {
							...d,
							result: action === "fill" ? { filled: "true" } : { clicked: "true" },
						},
			);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await expect(
			action === "fill"
				? session.fill("synthetic text", "boolean-fill-key")
				: session.send("boolean-send-key"),
		).rejects.toMatchObject({ code: "consumer_completion_invalid" });
		await expect(session.read("url", {}, "after-invalid-ack")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("counts the original reservations across restart, refuses scripts and never renews a completed key", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		for (const action of ["evaluate", "focus", "probe", "ui_action", "upload", "script"]) {
			await expect(session.read(action as "url", {}, "unsupported-key")).rejects.toMatchObject({
				code: "consumer_arguments_invalid",
			});
		}
		expect(callTool).toHaveBeenCalledOnce();
		for (let i = 0; i < 20; i++) await session.read("url", {}, `native-read-${i}`);
		await expect(session.read("url", {}, "native-read-new")).rejects.toMatchObject({
			code: "consumer_budget_exhausted",
		});
		await expect(session.read("url", {}, "native-read-0")).rejects.toMatchObject({
			code: "consumer_operation_held",
		});
		const replacement = makeSession({ callTool }, admission, dir, () => 2000);
		await expect(replacement.acquire()).rejects.toMatchObject({
			code: "consumer_acquisition_held",
		});
		expect(callTool).toHaveBeenCalledTimes(21);
	});
	it("holds a torn completion file without treating its filename as proof of completion", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) =>
			envelope(name, data(name === "browser_open" ? "open" : args.action, args.operationKey)),
		);
		const dir = await directory();
		const session = makeSession({ callTool }, admission, dir, () => 2000);
		await session.acquire();
		const complete = (await readdir(dir)).find((n) => n.startsWith("completed-"));
		expect(complete).toBeDefined();
		if (!complete) throw new Error("Expected the synthetic completed acquisition.");
		await writeFile(join(dir, complete), '{"completed":', { mode: 0o600 });
		await expect(session.read("url", {}, "native-after-tear")).rejects.toMatchObject({
			code: "consumer_ledger_invalid",
		});
		expect(callTool).toHaveBeenCalledOnce();
	});
	it("reads only the original operation metadata after uncertainty, never promoting its ACK to a reply or unholding input", async () => {
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			if (name === "browser_open") return envelope(name, data());
			if (name === "browser_continue") {
				const {
					targetObservation: _observation,
					result: _result,
					consumerAck: _ack,
					...metadata
				} = data("url", args.operationKey);
				return envelope(name, {
					...metadata,
					identityFreshness: "stored_completion",
					requestedOperationKey: args.operationKey,
					matchingOperation: true,
				});
			}
			throw new Error(admission.profileCapability);
		});
		const session = makeSession({ callTool }, admission, await directory(), () => 2000);
		await session.acquire();
		await expect(session.read("url", {}, "original-unknown")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(await session.originalReadback("original-unknown")).toMatchObject({
			operationState: "completed",
			readbackOnly: true,
		});
		expect(callTool.mock.calls[2][0]).toEqual({
			name: "browser_continue",
			arguments: { taskId: "synthetic-consumer-task", operationKey: "original-unknown" },
		});
		await expect(session.send("new-send-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(3);
	});
});
