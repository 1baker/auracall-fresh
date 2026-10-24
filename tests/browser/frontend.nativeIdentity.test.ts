import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeConsumerSession } from "../../src/browser/frontends/nativeConsumer.js";
import { createNativeConsumerFrontend } from "../../src/browser/frontends/config.js";

const directories: string[] = [];
const trustedTestProducer = vi.hoisted(() => ({
	decode: undefined as undefined | ((payload: unknown) => unknown),
}));
vi.mock("../../src/browser/frontends/nativeIdentity.js", () => ({
	getReviewedNativeAuthorityDecoder: () => trustedTestProducer.decode,
}));
afterEach(async () => {
	trustedTestProducer.decode = undefined;
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
// Internal normalized evidence from a synthetic trusted producer. These are NOT wire fields.
const authority = {
	profileId: "fixture-profile",
	browserId: "fixture-browser",
	tabId: "fixture-tab",
	targetId: "fixture-target",
	ownerGeneration: 1,
	processDigest: "a".repeat(64),
	custodyDigest: "b".repeat(64),
	principalId: "fixture-principal",
	capabilityId: "fixture-capability-id",
	capabilityRevision: 1,
	provenance: "registered_capability",
};

describe("native consumer observed identity integration", () => {
	it("does not accept a caller-supplied decoder as permission to Open", async () => {
		const callTool = vi.fn();
		const directory = await mkdtemp(join(tmpdir(), "auracall-native-gate-"));
		directories.push(directory);
		const session: NativeConsumerSession = Reflect.construct(NativeConsumerSession, [
			{ callTool },
			expected,
			directory,
			() => 3000,
			() => authority,
		]);
		await expect(session.acquire()).rejects.toMatchObject({
			code: "consumer_identity_schema_required",
		});
		expect(callTool).not.toHaveBeenCalled();
	});
	it("blocks the normal factory before Open when the reviewed generation/auth decoder is absent", async () => {
		const callTool = vi.fn();
		await expect(
			createNativeConsumerFrontend({ callTool }, expected, {
				routeId: "native",
				expectedUrl: "https://chatgpt.com/c/fixture",
				expectedModel: "Fixture model",
				ledgerDirectory: "/unneeded/no-dispatch",
			}),
		).rejects.toMatchObject({ code: "consumer_identity_schema_required" });
		expect(callTool).not.toHaveBeenCalled();
	});
	it.each([
		"missing target",
		"missing generation",
		"missing principal",
		"substituted target",
		"changed generation",
		"lost operation correlation",
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
				targetType: "page",
				origin: "https://chatgpt.com",
				stage: "after_action",
				observedAtMs: 1500,
			};
			const data = {
				contractVersion: "agent-browser.retained-consumer.v1",
				taskId: "fixture-consumer-task",
				controlRef: "fixture-control",
				consumerGrantId: expected.consumerGrantId,
				acquisitionId: "fixture-acquisition",
				state: "active",
				expiresAtMs: expected.expiresAtMs,
				profileId: expected.profileId,
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
				...(failure === "missing target" ? {} : { targetObservation }),
				result: isAction ? { url: "https://chatgpt.com/c/fixture" } : null,
			};
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
		const decodeSyntheticAuthority = () => ({
			...authority,
			...(failure === "missing generation" ? { ownerGeneration: undefined } : {}),
			...(failure === "missing principal" ? { principalId: undefined } : {}),
			...(failure === "changed generation" && isAction ? { ownerGeneration: 2 } : {}),
		});
		trustedTestProducer.decode = decodeSyntheticAuthority;
		const session = new NativeConsumerSession({ callTool }, expected, directory, () => 3000);
		const actionFailure = ["changed generation", "lost operation correlation"].includes(failure);
		if (actionFailure) {
			await session.acquire();
			await expect(session.read("url", {}, "fixture-original-read")).rejects.toMatchObject({
				code: "consumer_identity_mismatch",
			});
		} else {
			await expect(session.acquire()).rejects.toMatchObject({
				code: failure.startsWith("missing")
					? "consumer_identity_missing"
					: "consumer_identity_mismatch",
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
