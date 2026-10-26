import { once } from "node:events";
import { createServer, request, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import * as runtimeModule from "../src/browser/frontends/nativeRuntime.js";
import {
	NativeFrontendHostError,
	type OwnNativeFrontendHostOptions,
	startOwnNativeFrontendHost,
} from "../src/mcp/http/nativeHost.js";
import * as serverModule from "../src/mcp/http/server.js";
import { fixtureDispatchJoin, fixtureLedgerWriter } from "./browser/nativeDispatchFixture.js";

const servers: Server[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	for (const server of servers.splice(0)) {
		if (!server.listening) continue;
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

async function fixture() {
	const reservation = createServer();
	servers.push(reservation);
	reservation.listen(0, "127.0.0.1");
	await once(reservation, "listening");
	const address = reservation.address();
	if (!address || typeof address === "string") throw new Error("Fixture port missing");
	await new Promise<void>((resolve) => reservation.close(() => resolve()));
	let state: "active" | "held" = "active";
	const runtime = {
		route: { id: "synthetic-owned-route" },
		get state() {
			return state;
		},
		hold: vi.fn(async () => {
			state = "held";
		}),
	} as unknown as runtimeModule.OwnNativeProRuntime;
	const facade = {
		inspect: vi.fn(),
		configure: vi.fn(),
		send: vi.fn(),
		status: vi.fn(),
	};
	// These are explicitly source-only composition fixtures. Native admission and
	// sender behavior are tested by their existing real-module suites, not replayed here.
	const acquire = vi.spyOn(runtimeModule, "startOwnNativeRuntime").mockResolvedValue(runtime);
	const bind = vi.spyOn(runtimeModule, "bindOwnNativeSendFrontend").mockResolvedValue(facade);
	const createHttp = vi.spyOn(serverModule, "createFrontendHttpServer");
	const execution = fixtureDispatchJoin();
	const options: OwnNativeFrontendHostOptions = {
		input: { kind: "auracall-own-sdk-runtime-input" },
		dependencies: {
			lifetime: {
				qualify: vi.fn(async () => {}),
				assertCurrent: vi.fn(async () => {}),
				acquired: vi.fn(async () => {}),
				assertAcquiredCurrent: vi.fn(),
				retain: vi.fn(async () => {}),
				uncertain: vi.fn(async () => {}),
			},
			execution,
			writer: fixtureLedgerWriter(execution),
			readBudget: vi.fn(),
		},
		intent: {
			requestId: "synthetic-automatic-request",
			requestFingerprint: "a".repeat(64),
			promptDigest: "b".repeat(64),
			previousRequestId: null,
		},
		authority: {
			verify: vi.fn(),
			assertClaim: vi.fn(),
			protect: vi.fn(),
			assertCurrent: vi.fn(),
		},
		http: {
			mode: "frontend",
			resource: "https://frontend.example.test/mcp",
			issuer: "https://issuer.example.test",
			jwksUri: "https://issuer.example.test/jwks",
			subject: "synthetic-owned-principal",
			routeIds: [runtime.route.id],
			port: address.port,
		},
	};
	return { options, runtime, facade, acquire, bind, createHttp };
}

it("listens through the existing authenticated server with one acquired runtime and its SAME facade", async () => {
	const f = await fixture();
	const host = await startOwnNativeFrontendHost(f.options);
	servers.push(host.server);
	expect(host.runtime).toBe(f.runtime);
	expect(f.acquire).toHaveBeenCalledExactlyOnceWith(f.options.input, f.options.dependencies);
	expect(f.bind).toHaveBeenCalledExactlyOnceWith(f.runtime, f.options.intent, f.options.authority);
	expect(f.createHttp).toHaveBeenCalledOnce();
	expect(f.createHttp.mock.calls[0][0].service).toBe(f.facade);
	expect(host.server.address()).toMatchObject({ address: "127.0.0.1", port: f.options.http.port });
	const response = await new Promise<{ status?: number; challenge?: string }>((resolve, reject) => {
		const req = request(
			{
				hostname: "127.0.0.1",
				port: f.options.http.port,
				path: "/mcp",
				method: "POST",
				headers: { host: "frontend.example.test", "content-type": "application/json" },
			},
			(res) => {
				res.resume();
				res.once("end", () =>
					resolve({ status: res.statusCode, challenge: res.headers["www-authenticate"] }),
				);
			},
		);
		req.once("error", reject);
		req.end("{}");
	});
	expect(response.status).toBe(401);
	expect(response.challenge).toContain("Bearer");
	for (const call of Object.values(f.facade)) expect(call).not.toHaveBeenCalled();
	expect(f.options.authority.assertClaim).not.toHaveBeenCalled();
});

it.each([
	"default-port",
	"default-mode",
	"extra-route",
	"relay",
	"connector",
	"finite-authority",
	"intent",
])("refuses incomplete %s binding before acquisition", async (kind) => {
	const f = await fixture();
	if (kind === "default-port") delete f.options.http.port;
	if (kind === "default-mode") delete f.options.http.mode;
	if (kind === "extra-route") f.options.http.routeIds?.push("unowned-route");
	if (kind === "relay") f.options.http.mode = "relay";
	if (kind === "connector") Object.assign(f.options.dependencies, { connect: vi.fn() });
	if (kind === "finite-authority") f.options.authority.assertCurrent = undefined as never;
	if (kind === "intent") f.options.intent = { ...f.options.intent, promptDigest: "invalid" };
	await expect(startOwnNativeFrontendHost(f.options)).rejects.toThrow();
	expect(f.acquire).not.toHaveBeenCalled();
	expect(f.bind).not.toHaveBeenCalled();
	expect(f.createHttp).not.toHaveBeenCalled();
});

it.each([
	"wrong-route",
	"finite-refusal",
	"held-during-bind",
	"occupied-port",
	"hold-ack-lost",
])("holds the original runtime on %s without reacquisition or a sender call", async (kind) => {
	const f = await fixture();
	if (kind === "wrong-route") f.options.http.routeIds = ["wrong-route"];
	if (kind === "finite-refusal") f.bind.mockRejectedValue(new Error("synthetic authority refusal"));
	if (kind === "held-during-bind")
		f.bind.mockImplementation(async () => {
			await f.runtime.hold();
			return f.facade;
		});
	if (kind === "hold-ack-lost") {
		const hold = f.runtime.hold.bind(f.runtime);
		f.runtime.hold = vi.fn(async () => {
			await hold();
			throw new Error("synthetic private hold-ACK detail");
		});
		f.bind.mockRejectedValue(new Error("synthetic private binding detail"));
	}
	if (kind === "occupied-port") {
		const occupied = createServer();
		servers.push(occupied);
		occupied.listen(f.options.http.port, "127.0.0.1");
		await once(occupied, "listening");
	}
	const failure = await startOwnNativeFrontendHost(f.options).catch((error: unknown) => error);
	expect(failure).toBeInstanceOf(NativeFrontendHostError);
	if (!(failure instanceof NativeFrontendHostError)) throw new Error("Expected retained failure");
	expect(failure.runtime).toBe(f.runtime);
	expect(failure.code).toBe("native_frontend_host_unqualified");
	expect(JSON.stringify(failure)).not.toMatch(/"runtime"|synthetic private|owned-route|consumer/);
	expect(f.acquire).toHaveBeenCalledOnce();
	expect(f.runtime.hold).toHaveBeenCalled();
	expect(f.runtime.state).toBe("held");
	expect(f.facade.send).not.toHaveBeenCalled();
	if (kind !== "occupied-port") expect(f.createHttp).not.toHaveBeenCalled();
});
