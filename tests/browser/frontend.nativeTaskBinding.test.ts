import { describe, expect, it, vi } from "vitest";
import { createFrontendBroker } from "../../src/browser/frontends/broker.js";
import {
	frontendRouteBinding,
	frontendTargetKey,
} from "../../src/browser/frontends/requestStore.js";
import { FrontendService } from "../../src/browser/frontends/service.js";
import type { FrontendRoute } from "../../src/browser/frontends/types.js";

const task = {
	controlRef: "fixture-issuer-revision-1",
	taskId: "fixture-native-task",
	profileId: "fixture-native-profile",
	browserId: "fixture-browser",
	tabId: "fixture-native-tab",
	targetId: "fixture-physical-target",
};
const nativeRoute = (patch = {}): FrontendRoute =>
	({
		id: "native-chatgpt",
		provider: "chatgpt",
		expectedUrl: "https://chatgpt.com/c/fixture",
		expectedModel: "Fixture Pro",
		transport: "agent_browser_task",
		nativeTask: { ...task, ...patch },
	}) as unknown as FrontendRoute;

describe("native task frontend identity", () => {
	it("refuses native tasks at the legacy probe service before any script dispatch", async () => {
		const broker = vi.fn();
		const service = new FrontendService([nativeRoute()], broker);
		await expect(service.inspect("native-chatgpt")).rejects.toMatchObject({
			code: "native_transport_required",
		});
		expect(broker).not.toHaveBeenCalled();
	});

	it("changes saved-reply binding when the native authority changes while retaining one target lock", () => {
		const first = nativeRoute();
		const next = nativeRoute({ controlRef: "fixture-issuer-revision-2" });
		expect(frontendRouteBinding(first)).not.toBe(frontendRouteBinding(next));
		expect(frontendTargetKey(first)).toBe(frontendTargetKey(next));
	});

	it.each([
		{ connectionRef: "fixture-readonly-reference" },
		{ controlRef: "" },
		{ targetId: "" },
	])("refuses malformed or legacy-reference task bindings before contacting the broker: %j", async (patch) => {
		const broker = vi.fn();
		const service = new FrontendService([nativeRoute(patch)], broker);
		await expect(service.inspect("native-chatgpt")).rejects.toMatchObject({
			code: "invalid_route",
		});
		expect(broker).not.toHaveBeenCalled();
	});

	it("never sends a native task to the legacy HTTP endpoint", async () => {
		const requestFetch = vi.fn();
		const broker = createFrontendBroker({ baseUrl: "http://127.0.0.1:1", fetch: requestFetch });
		await expect(
			broker({ action: "probe", nativeTask: task }, "FIXTURE_CAPABILITY"),
		).rejects.toMatchObject({ code: "invalid_request" });
		expect(requestFetch).not.toHaveBeenCalled();
	});
});
