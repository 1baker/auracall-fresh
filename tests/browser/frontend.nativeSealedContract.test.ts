import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createNativeConsumerFrontend } from "../../src/browser/frontends/config.js";
import { NativeConsumerSession } from "../../src/browser/frontends/nativeConsumer.js";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
const admission = {
	consumerGrantId: "sealed-fixture-grant",
	profileCapability: "sealed-fixture-private-capability",
	taskKey: "sealed-fixture-own-task",
	profileId: "sealed-fixture-profile",
	browserId: "sealed-fixture-browser",
	tabId: "sealed-fixture-tab",
	targetId: "sealed-fixture-target",
	expiresAtMs: 10000,
};

it.each([
	"session",
	"factory",
])("%s consumes sealed r2 public identity without invented private fields", async (mode) => {
	const path = await mkdtemp(join(tmpdir(), "auracall-sealed-r2-"));
	directories.push(path);
	const now = Date.now();
	const ownerAdmission = { ...admission, expiresAtMs: now + 10000 };
	const ack = { kind: "opened", completedAtMs: now };
	const callTool = vi.fn(async () => ({
		content: [
			{
				type: "text",
				text: JSON.stringify({
					tool: "browser_open",
					session: "sealed-fixture-connection",
					success: true,
					data: {
						contractVersion: "agent-browser.retained-consumer.v1",
						taskId: "sealed-fixture-consumer-task",
						controlRef: "sealed-fixture-control",
						consumerGrantId: admission.consumerGrantId,
						acquisitionId: "sealed-fixture-acquisition",
						state: "active",
						expiresAtMs: ownerAdmission.expiresAtMs,
						browserDisposition: "retained",
						profileId: admission.profileId,
						browserId: admission.browserId,
						tabId: admission.tabId,
						operation: {
							operationId: "sealed-fixture-operation",
							operationKey: "sealed-fixture-open-key",
							action: "open",
							state: "completed",
							ack,
							createdAtMs: now - 2000,
						},
						consumerAck: ack,
						result: null,
						targetObservation: {
							operationId: "sealed-fixture-operation",
							targetId: admission.targetId,
							targetType: "page",
							origin: "https://chatgpt.com",
							stage: "after_action",
							observedAtMs: now - 1000,
						},
					},
					error: null,
				}),
			},
		],
	}));
	if (mode === "factory") {
		const frontend = await createNativeConsumerFrontend({ callTool }, ownerAdmission, {
			routeId: "sealed-fixture-route",
			expectedUrl: "https://chatgpt.com/c/fixture",
			expectedModel: "Fixture model",
			ledgerDirectory: path,
		});
		expect(typeof frontend.status).toBe("function");
		expect(callTool).toHaveBeenCalledOnce();
		return;
	}
	const session = new NativeConsumerSession({ callTool }, ownerAdmission, path, () => now);
	await expect(session.acquire()).resolves.toEqual({
		controlRef: "sealed-fixture-control",
		taskId: "sealed-fixture-consumer-task",
		profileId: admission.profileId,
		browserId: admission.browserId,
		tabId: admission.tabId,
		targetId: "sealed-fixture-target",
	});
	expect(callTool).toHaveBeenCalledOnce();
});
