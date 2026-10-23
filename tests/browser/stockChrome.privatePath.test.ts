import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStockChromeConnection } from "../../src/browser/stockChrome/config.js";
import { assertStockPrivatePath } from "../../src/browser/stockChrome/privatePath.js";

describe("native capability file privacy (Linux source checks; Windows ACL check is native-pending)", () => {
	it("refuses a broadly accessible directory before exposing a capability", async () => {
		const home = await mkdtemp(join(tmpdir(), "stock-private-"));
		try {
			await expect(assertStockPrivatePath(home)).resolves.toBeUndefined();
			await chmod(home, 0o755);
			await expect(assertStockPrivatePath(home)).rejects.toThrow("private");
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
	it("refuses symlinked capability files and non-loopback discovery without any browser/network request", async () => {
		const home = await mkdtemp(join(tmpdir(), "stock-private-"));
		try {
			const path = join(home, "connection.json");
			await writeFile(
				path,
				JSON.stringify({
					version: "auracall-stock-chrome-v1",
					sessionId: "00000000-0000-4000-8000-000000000001",
					baseUrl: "https://example.invalid/",
					token: "f".repeat(64),
				}),
				{ mode: 0o600 },
			);
			await expect(readStockChromeConnection(path)).rejects.toMatchObject({
				code: "invalid_config",
			});
			await symlink(path, join(home, "link.json"));
			await expect(readStockChromeConnection(join(home, "link.json"))).rejects.toThrow(
				"regular private",
			);
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
});
