import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFrontendHttpConfig, validateFrontendHttpConfig } from "../src/mcp/http/config.js";

describe("private OAuth frontend configuration", () => {
	it.each(["resource", "issuer", "jwksUri"])("requires HTTPS for %s even in fixtures", (field) => {
		expect(() =>
			validateFrontendHttpConfig({
				resource: "https://auracall.example.test/mcp",
				issuer: "https://issuer.example.test",
				jwksUri: "https://issuer.example.test/jwks",
				subject: "fixture-owner",
				routeIds: ["public"],
				[field]: "http://127.0.0.1/unsafe",
			}),
		).toThrow("Invalid OAuth frontend MCP configuration.");
	});

	it("keeps malformed contents and private paths out of startup errors", async () => {
		const dir = await mkdtemp(join(tmpdir(), "auracall-http-config-"));
		const marker = "PUBLIC-FIXTURE-DO-NOT-ECHO";
		const path = join(dir, "private-location.json");
		try {
			await writeFile(path, '{"subject": "PUBLIC-FIXTURE-DO-NOT-ECHO", broken}', { mode: 0o600 });
			for (const file of [path, join(dir, "absent.json")]) {
				const variable = "AURACALL_FRONTEND_OAUTH_CONFIG";
				const error = await readFrontendHttpConfig({ [variable]: file }).catch(
					(failure: unknown) => failure,
				);
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe(
					"Cannot load the private OAuth frontend MCP configuration.",
				);
				expect(String(error)).not.toContain(marker);
				expect(String(error)).not.toContain(dir);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
