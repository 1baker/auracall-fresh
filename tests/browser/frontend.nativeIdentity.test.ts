import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeConsumerSession } from "../../src/browser/frontends/nativeConsumer.js";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
const expected = {
	consumerGrantId: "fixture-grant",
	profileCapability: "fixture-private-capability",
	taskKey: "fixture-own-task",
	profileId: "fixture-profile",
	browserId: "fixture-browser",
	tabId: "fixture-tab",
	targetId: "fixture-target",
	expiresAtMs: 10000,
};
describe("native consumer observed identity integration", () => {
	it.each([
		"missing target",
		"missing profile",
		"missing control",
		"substituted target",
		"changed acquisition",
		"lost operation correlation",
		"wrong origin",
		"wrong type",
		"wrong stage",
		"future observation",
		"old observation",
	])("fails closed for %s instead of promoting local expectations", async (failure) => {
		const directory = await mkdtemp(join(tmpdir(), "auracall-native-identity-"));
		directories.push(directory);
		let isAction = false;
		const callTool = vi.fn(async ({ name, arguments: args }) => {
			isAction = name !== "browser_open";
			const action = isAction ? args.action : "open";
			const key = isAction ? args.operationKey : "fixture-acquisition-key";
			const operationId = `fixture-operation-${key}`;
			const ack = { kind: isAction ? "observed" : "opened", completedAtMs: 2000 };
			const targetObservation = {
				operationId:
					failure === "lost operation correlation" && isAction ? "foreign-operation" : operationId,
				targetId: failure === "substituted target" ? "foreign-target" : "fixture-target",
				targetType: failure === "wrong type" ? "iframe" : "page",
				origin: failure === "wrong origin" ? "https://example.invalid" : "https://chatgpt.com",
				stage: failure === "wrong stage" ? "before_action" : "after_action",
				observedAtMs:
					failure === "future observation" ? 4000 : failure === "old observation" ? 500 : 1500,
			};
			const data = withCompletedIdentity(
				{
					contractVersion: "agent-browser.retained-consumer.v1",
					taskId: "fixture-consumer-task",
					controlRef: failure === "missing control" ? undefined : "fixture-control",
					consumerGrantId: expected.consumerGrantId,
					acquisitionId:
						failure === "changed acquisition" && isAction
							? "foreign-acquisition"
							: "fixture-acquisition",
					state: "active",
					expiresAtMs: expected.expiresAtMs,
					profileId: failure === "missing profile" ? undefined : expected.profileId,
					browserId: expected.browserId,
					tabId: expected.tabId,
					operation: {
						operationId,
						operationKey: key,
						action,
						state: "completed",
						ack,
						createdAtMs: 1000,
					},
					consumerAck: ack,
					targetObservation,
					result: isAction ? { url: "https://chatgpt.com/c/fixture" } : null,
				},
				expected,
			);
			if (failure === "missing target") Reflect.deleteProperty(data, "targetObservation");
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							tool: name,
							session: "fixture-connection",
							success: true,
							data,
							error: null,
						}),
					},
				],
				isError: false,
			};
		});
		const session = new NativeConsumerSession({ callTool }, expected, directory, () => 3000);
		const actionFailure = ["changed acquisition", "lost operation correlation"].includes(failure);
		if (actionFailure) {
			await session.acquire();
			await expect(session.read("url", {}, "fixture-original-read")).rejects.toMatchObject({
				code: "consumer_identity_mismatch",
			});
		} else {
			await expect(session.acquire()).rejects.toMatchObject({
				code: ["missing target", "wrong origin", "wrong type", "wrong stage"].includes(failure)
					? "consumer_identity_missing"
					: ["substituted target", "future observation", "old observation"].includes(failure)
						? "consumer_identity_mismatch"
						: "consumer_readback_required",
			});
			await expect(async () => session.binding).rejects.toMatchObject({
				code: "consumer_acquisition_required",
			});
		}
		await expect(session.read("url", {}, "fixture-new-key")).rejects.toMatchObject({
			code: "consumer_readback_required",
		});
		expect(callTool).toHaveBeenCalledTimes(actionFailure ? 2 : 1);
	});
});
