import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	chromeExtensionId,
	prepareStockChromeWindowsHost,
} from "../../src/browser/stockChrome/setup.js";

describe("stock Chrome reviewable setup files", () => {
	it("pins the manifest public key and emits one exact-user host registration proposal without executing it", async () => {
		const home = await mkdtemp(join(tmpdir(), "stock-setup-"));
		try {
			const manifest = JSON.parse(
				await readFile(
					new URL("../../src/browser/stockChrome/extension/manifest.json", import.meta.url),
					"utf8",
				),
			);
			const id = chromeExtensionId(manifest.key);
			expect(id).toBe("iikcjmnbnpamgdjedcgcghoaimaegaho");
			await prepareStockChromeWindowsHost({
				outputDir: home,
				windowsDirectory: "D:\\AuraCall DEV",
				windowsNodePath: "C:\\Program Files\\nodejs\\node.exe",
				extensionId: id,
			});
			expect(JSON.parse(await readFile(join(home, "native-manifest.json"), "utf8"))).toMatchObject({
				path: "D:\\AuraCall DEV\\auracall-host.bat",
				allowed_origins: ["chrome-extension://iikcjmnbnpamgdjedcgcghoaimaegaho/"],
			});
			expect(await readFile(join(home, "auracall-host.bat"), "utf8")).toBe(
				'@echo off\r\n"C:\\Program Files\\nodejs\\node.exe" "%~dp0native-host.mjs" --config "%~dp0native-config.json" %*\r\n',
			);
			await expect(
				prepareStockChromeWindowsHost({
					outputDir: home,
					windowsDirectory: "D:\\AuraCall DEV",
					windowsNodePath: "C:\\Program Files\\nodejs\\node.exe",
					extensionId: id,
				}),
			).rejects.toMatchObject({ code: "EEXIST" });
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
	it.each([
		"C:\\unsafe%PATH%",
		'C:\\unsafe" & echo broken',
		"relative\\node.exe",
	])("rejects shell-expanding or relative Windows paths before writing: %s", async (windowsNodePath) => {
		await expect(
			prepareStockChromeWindowsHost({
				outputDir: "/never-created/stock-chrome",
				windowsDirectory: "D:\\AuraCall",
				windowsNodePath,
				extensionId: "a".repeat(32),
			}),
		).rejects.toThrow("explicit absolute");
	});
});
