import { afterEach, expect, test, vi } from "vitest";
import { setCdpCommandAdmissionResolver } from "../../packages/browser-service/src/guardedCdp.js";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";

const transport = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("chrome-remote-interface", () => ({ default: transport.connect }));
const realSetTimeout = setTimeout;
afterEach(() => {
	setCdpCommandAdmissionResolver(undefined);
	vi.useRealTimers();
});

test.each([
	"admission-wait",
	"wire-stall",
	"uncoordinated-wire-stall",
	"queued-abort",
	"admission-denied",
])("identity target enablement distinguishes %s from wire response time", async (scenario) => {
	vi.useFakeTimers();
	const commands: string[] = [];
	let closed = false;
	const close = vi.fn(async () => {
		closed = true;
	});
	const client = {
		send: async (command: string, params?: { expression?: string }) => {
			if (closed) throw new Error("Fixture client closed");
			commands.push(command);
			if (scenario.endsWith("wire-stall") && command === "Page.enable")
				return new Promise(() => undefined);
			if (command !== "Runtime.evaluate") return {};
			const expression = params?.expression ?? "";
			const value =
				expression === "location.href"
					? "https://chatgpt.com/c/fixture"
					: expression.includes("/api/auth/session") ||
							expression.includes("script#client-bootstrap")
						? {
								user: { id: "fixture-user", email: "operator@example.test" },
								account: { planType: "pro" },
							}
						: null;
			return { result: { value } };
		},
		// biome-ignore lint/style/useNamingConvention: CDP wire domains.
		Page: { enable: () => client.send("Page.enable") },
		// biome-ignore lint/style/useNamingConvention: CDP wire domains.
		Runtime: {
			enable: () => client.send("Runtime.enable"),
			evaluate: (params: { expression?: string }) => client.send("Runtime.evaluate", params),
		},
		close,
	};
	transport.connect.mockResolvedValue(client);
	setCdpCommandAdmissionResolver(async () =>
		scenario === "uncoordinated-wire-stall"
			? undefined
			: {
					run: async (command, effect) => {
						if (scenario === "admission-denied") throw new Error("fixture human controls desktop");
						if (command.endsWith(".enable"))
							await new Promise((resolve) => setTimeout(resolve, 6000));
						return effect();
					},
				},
	);
	const controller = new AbortController();
	if (scenario === "queued-abort")
		setTimeout(() => controller.abort(new Error("fixture cancellation")), 4000);
	let settled = false;
	const pending = createChatgptAdapter()
		.getUserIdentity?.({
			host: "127.0.0.1",
			port: 45011,
			tabTargetId: "fixture-target",
			configuredUrl: "https://chatgpt.com/c/fixture",
			allowNavigation: false,
			tabLifecycle: "retain",
			abortSignal: controller.signal,
		})
		.then(
			(value) => ({ value, error: null }),
			(error: Error) => ({ value: null, error }),
		)
		.finally(() => {
			settled = true;
		});
	for (let tick = 0; tick < 30 && !settled; tick++) {
		await vi.advanceTimersByTimeAsync(1000);
		await new Promise<void>((resolve) => realSetTimeout(resolve, 5));
	}
	const outcome = await pending;
	expect(outcome).toBeDefined();
	if (scenario === "admission-wait") {
		expect(outcome?.error).toBeNull();
		expect(outcome?.value).toMatchObject({ email: "operator@example.test", accountLevel: "Pro" });
		expect(commands.slice(0, 2)).toEqual(["Page.enable", "Runtime.enable"]);
	} else if (scenario.endsWith("wire-stall")) {
		expect(outcome?.error?.message).toContain("Timed out enabling ChatGPT page target");
		expect(commands).toContain("Page.enable");
	} else if (scenario === "admission-denied") {
		expect(outcome?.error?.message).toBe("fixture human controls desktop");
		expect(commands).toEqual([]);
	} else {
		expect(outcome?.error?.message).toBe("fixture cancellation");
		await vi.advanceTimersByTimeAsync(7000);
		expect(commands).toEqual([]);
	}
	expect(close).toHaveBeenCalledOnce();
});
