import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfiguredFrontendService } from "../../src/browser/frontends/config.js";

describe("explicit frontend configuration", () => {
	it("fails closed with no opt-in config", async () => {
		const service = await createConfiguredFrontendService({});
		await expect(service.inspect("missing")).rejects.toMatchObject({ code: "route_missing" });
	});
	it("rejects malformed files without leaking file contents", async () => {
		const dir = await mkdtemp(join(tmpdir(), "auracall-frontend-"));
		const path = join(dir, "config.json");
		const configEnvName = "AURACALL_FRONTEND_CONFIG";
		try {
			for (const body of [
				"not JSON",
				JSON.stringify({
					brokerBaseUrl: "http://127.0.0.1:1",
					routes: [],
					secret: "fixture-private",
				}),
				"x".repeat(65537),
			]) {
				await writeFile(path, body);
				await expect(
					createConfiguredFrontendService({ [configEnvName]: path }),
				).rejects.toMatchObject({ code: "invalid_config" });
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
	it("creates configured services without a connection or capability lookup", async () => {
		const dir = await mkdtemp(join(tmpdir(), "auracall-frontend-"));
		const path = join(dir, "config.json");
		const configEnvName = "AURACALL_FRONTEND_CONFIG";
		const requestFetch = vi.fn();
		vi.stubGlobal("fetch", requestFetch);
		try {
			await writeFile(
				path,
				JSON.stringify({
					brokerBaseUrl: "http://127.0.0.1:1",
					routes: [
						{
							id: "fixture",
							provider: "chatgpt",
							expectedUrl: "https://chatgpt.com/c/fixture",
							expectedModel: "GPT fixture",
							serviceTabHandle: { valid: true },
							profileCapabilityEnv: "FIXTURE_CAPABILITY",
						},
					],
				}),
			);
			const env = new Proxy(
				{ [configEnvName]: path },
				{
					get(target, key) {
						if (key === "FIXTURE_CAPABILITY") throw new Error("Startup read the capability");
						return Reflect.get(target, key);
					},
				},
			);
			const service = await createConfiguredFrontendService(env);
			await expect(service.inspect("missing")).rejects.toMatchObject({ code: "route_missing" });
			expect(requestFetch).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
