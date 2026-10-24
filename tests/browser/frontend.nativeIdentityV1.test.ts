import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NativeConsumerSession } from "../../src/browser/frontends/nativeConsumer.js";
import { createNativeConsumerFrontend } from "../../src/browser/frontends/config.js";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
const admission = {
	consumerGrantId: "identity-v1-grant",
	profileCapability: "identity-v1-private-capability",
	taskKey: "identity-v1-own-task",
	profileId: "identity-v1-profile",
	browserId: "identity-v1-browser",
	tabId: "identity-v1-tab",
	targetId: "identity-v1-target",
	expiresAtMs: 10000,
};
function frame(action = "open", key = "acquire") {
	const ack = { kind: action === "open" ? "opened" : "observed", completedAtMs: 2000 };
	return withCompletedIdentity(
		{
			contractVersion: "agent-browser.retained-consumer.v1",
			taskId: "identity-v1-own-consumer",
			controlRef: "identity-v1-control",
			consumerGrantId: admission.consumerGrantId,
			acquisitionId: "identity-v1-acquisition",
			state: "active",
			expiresAtMs: admission.expiresAtMs,
			profileId: admission.profileId,
			browserId: admission.browserId,
			tabId: admission.tabId,
			operation: {
				operationId: `op-${key}`,
				operationKey: key,
				action,
				state: "completed",
				ack,
				createdAtMs: 1000,
			},
			consumerAck: ack,
			targetObservation: {
				operationId: `op-${key}`,
				targetId: admission.targetId,
				targetType: "page",
				origin: "https://chatgpt.com",
				stage: "after_action",
				observedAtMs: 1500,
			},
			result: action === "url" ? { url: "https://chatgpt.com/c/identity-fixture" } : null,
		},
		admission,
	);
}
function envelope(tool: string, data: unknown) {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					tool,
					session: "identity-v1-connection",
					success: true,
					data,
					error: null,
				}),
			},
		],
	};
}
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "auracall-identity-v1-"));
	directories.push(path);
	return path;
}

it("holds a changed authenticated principal even when all legacy target aliases still match", async () => {
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		const data = frame(name === "browser_open" ? "open" : args.action, args.operationKey);
		if (name !== "browser_open") {
			for (const identity of [
				data.identity,
				data.consumerAck.identity,
				data.operation.ack.identity,
			])
				identity.authentication.principalId = "foreign-principal";
		}
		return envelope(name, data);
	});
	const session = new NativeConsumerSession({ callTool }, admission, await directory(), () => 3000);
	await session.acquire();
	await expect(session.read("url", {}, "identity-original-read")).rejects.toMatchObject({
		code: "consumer_identity_mismatch",
	});
	await expect(session.send("identity-after-change")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(callTool).toHaveBeenCalledTimes(2);
});

it("refuses a purported current identity in metadata-only original readback", async () => {
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		if (name === "browser_open") return envelope(name, frame());
		if (name === "browser_continue") {
			const {
				targetObservation: _target,
				result: _result,
				consumerAck: _ack,
				...metadata
			} = frame("url", args.operationKey);
			return envelope(name, {
				...metadata,
				requestedOperationKey: args.operationKey,
				matchingOperation: true,
			});
		}
		throw new Error("synthetic original outcome unknown");
	});
	const session = new NativeConsumerSession({ callTool }, admission, await directory(), () => 3000);
	await session.acquire();
	await expect(session.read("url", {}, "identity-unknown-read")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	await expect(session.originalReadback("identity-unknown-read")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(callTool).toHaveBeenCalledTimes(3);
});

it.each([
	"ownerGeneration",
	"publishedProcessDigest",
	"custodyDigest",
	"principalId",
	"capabilityId",
	"capabilityRevision",
])("pins the completed %s across operations instead of trusting unchanged aliases", async (field) => {
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		const data = frame(name === "browser_open" ? "open" : args.action, args.operationKey);
		if (name !== "browser_open") {
			for (const identity of [
				data.identity,
				data.consumerAck.identity,
				data.operation.ack.identity,
			]) {
				if (field === "ownerGeneration") identity.ownerGeneration++;
				if (field === "publishedProcessDigest") identity.publishedProcessDigest = "c".repeat(64);
				if (field === "custodyDigest") identity.custodyDigest = "d".repeat(64);
				if (field === "principalId") identity.authentication.principalId = "other-principal";
				if (field === "capabilityId") identity.authentication.capabilityId = "other-capability-id";
				if (field === "capabilityRevision") identity.authentication.capabilityRevision++;
			}
		}
		return envelope(name, data);
	});
	const session = new NativeConsumerSession({ callTool }, admission, await directory(), () => 3000);
	await session.acquire();
	await expect(session.read("url", {}, "identity-bound-read")).rejects.toMatchObject({
		code: "consumer_identity_mismatch",
	});
	await expect(
		session.fill("Do not type this after drift", "identity-bound-fill"),
	).rejects.toMatchObject({ code: "consumer_readback_required" });
	expect(callTool).toHaveBeenCalledTimes(2);
});

it.each([
	"missing",
	"ack missing",
	"ack conflict",
	"operation ack conflict",
	"stored",
	"unavailable",
	"unknown field",
	"wrong principal profile",
	"task",
	"acquisition",
	"profile",
	"browser",
	"tab",
	"target",
	"operation",
	"operation key",
	"action",
	"observation time",
	"completion time",
	"zero generation",
	"unsafe generation",
	"fractional revision",
	"unsafe revision",
	"wrong provenance",
	"target alias",
])("refuses malformed or uncorrelated %s identity before factory returns a frontend", async (fault) => {
	const data = frame();
	const factoryAdmission = { ...admission, expiresAtMs: Date.now() + 10000 };
	data.expiresAtMs = factoryAdmission.expiresAtMs;
	if (fault === "missing") Reflect.deleteProperty(data, "identity");
	if (fault === "ack missing") Reflect.deleteProperty(data.consumerAck, "identity");
	if (fault === "ack conflict") data.consumerAck.identity.custodyDigest = "c".repeat(64);
	if (fault === "operation ack conflict") data.operation.ack.identity.ownerGeneration++;
	if (fault === "stored") data.identityFreshness = "stored_completion";
	if (fault === "unavailable") data.identityFreshness = "unavailable";
	if (fault === "target alias") Object.assign(data, { targetId: "foreign-target-alias" });
	for (const identity of [data.identity, data.consumerAck.identity, data.operation.ack.identity]) {
		if (!identity) continue;
		if (fault === "unknown field")
			Object.assign(identity, { privateOwnerGrant: "must-not-be-accepted" });
		if (fault === "wrong principal profile") identity.authentication.profileId = "foreign-profile";
		if (fault === "task") identity.taskId = "foreign-consumer";
		if (fault === "acquisition") identity.acquisitionId = "foreign-acquisition";
		if (fault === "profile") identity.profileId = "foreign-profile";
		if (fault === "browser") identity.browserId = "foreign-browser";
		if (fault === "tab") identity.tabId = "foreign-tab";
		if (fault === "target") identity.targetId = "foreign-target";
		if (fault === "operation") identity.operationId = "foreign-operation";
		if (fault === "operation key") identity.operationKey = "foreign-operation-key";
		if (fault === "action") identity.action = "fill";
		if (fault === "observation time") identity.observedAtMs++;
		if (fault === "completion time") identity.completedAtMs--;
		if (fault === "zero generation") identity.ownerGeneration = 0;
		if (fault === "unsafe generation") identity.ownerGeneration = Number.MAX_SAFE_INTEGER + 1;
		if (fault === "fractional revision") identity.authentication.capabilityRevision = 1.5;
		if (fault === "unsafe revision")
			identity.authentication.capabilityRevision = Number.MAX_SAFE_INTEGER + 1;
		if (fault === "wrong provenance") identity.authentication.provenance = "registered-capability";
	}
	const callTool = vi.fn(async () => envelope("browser_open", data));
	await expect(
		createNativeConsumerFrontend({ callTool }, factoryAdmission, {
			routeId: "identity-fixture",
			expectedUrl: "https://chatgpt.com/c/identity-fixture",
			expectedModel: "Fixture model",
			ledgerDirectory: await directory(),
		}),
	).rejects.toBeInstanceOf(Error);
	expect(callTool).toHaveBeenCalledOnce();
});

it("accepts safe-integer generation/revision boundaries and keeps private bindings out of the ledger", async () => {
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		const data = frame(name === "browser_open" ? "open" : args.action, args.operationKey);
		for (const identity of [
			data.identity,
			data.consumerAck.identity,
			data.operation.ack.identity,
		]) {
			identity.ownerGeneration = Number.MAX_SAFE_INTEGER;
			identity.authentication.capabilityRevision = Number.MAX_SAFE_INTEGER;
		}
		return envelope(name, data);
	});
	const path = await directory();
	const session = new NativeConsumerSession({ callTool }, admission, path, () => 3000);
	await session.acquire();
	await expect(session.read("url", {}, "identity-safe-boundary")).resolves.toEqual({
		url: "https://chatgpt.com/c/identity-fixture",
	});
	for (const name of await readdir(path)) {
		const text = await readFile(join(path, name), "utf8");
		expect(text).not.toContain(admission.profileCapability);
		expect(text).not.toContain("synthetic-capability-id-NOT-TOKEN");
	}
});

it.each([
	["stored_completion", "completed"],
	["unavailable", "unknown"],
	["unavailable", "completed"],
])("keeps %s/%s original readback metadata-only and never clears the input hold", async (freshness, operationState) => {
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		if (name === "browser_open") return envelope(name, frame());
		if (name !== "browser_continue") throw new Error("synthetic original outcome unknown");
		const {
			targetObservation: _target,
			result: _result,
			consumerAck: _ack,
			...metadata
		} = frame("url", args.operationKey);
		return envelope(name, {
			...metadata,
			identityFreshness: freshness,
			identity: freshness === "unavailable" ? null : metadata.identity,
			operation:
				freshness === "unavailable"
					? {
							...metadata.operation,
							state: operationState,
							ack:
								operationState === "completed" ? { kind: "observed", completedAtMs: 2000 } : null,
						}
					: metadata.operation,
			requestedOperationKey: args.operationKey,
			matchingOperation: true,
		});
	});
	const session = new NativeConsumerSession({ callTool }, admission, await directory(), () => 3000);
	await session.acquire();
	await expect(session.read("url", {}, "identity-readback-original")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	await expect(session.originalReadback("identity-readback-original")).resolves.toMatchObject({
		identityFreshness: freshness,
		operationState,
		readbackOnly: true,
		pageObserved: false,
	});
	await expect(session.send("identity-after-readback")).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(callTool).toHaveBeenCalledTimes(3);
});
