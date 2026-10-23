import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STOCK_HOST_NAME } from "./protocol.js";

export function chromeExtensionId(publicKey: string): string {
	return [...createHash("sha256").update(Buffer.from(publicKey, "base64")).digest().subarray(0, 16)]
		.map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
		.join("");
}

/** Prepares files only. Never reads Chrome, executes Windows or edits the registry. */
export async function prepareStockChromeWindowsHost(options: {
	outputDir: string;
	windowsDirectory: string;
	windowsNodePath: string;
	extensionId: string;
}) {
	const windowsPath = /^[A-Za-z]:\\[^"\r\n%!<>|&^*?]+$/;
	if (
		!windowsPath.test(options.windowsDirectory) ||
		!windowsPath.test(options.windowsNodePath) ||
		!/^[a-p]{32}$/.test(options.extensionId)
	)
		throw new Error("Use explicit absolute Windows paths without shell expansion characters");
	const directory = options.windowsDirectory.replace(/\\$/, "");
	const manifest = {
		name: STOCK_HOST_NAME,
		description: "AuraCall explicitly shared stock Chrome conversations",
		path: `${directory}\\auracall-host.bat`,
		type: "stdio",
		allowed_origins: [`chrome-extension://${options.extensionId}/`],
	};
	await mkdir(options.outputDir, { recursive: true, mode: 0o700 });
	const files: Record<string, string> = {
		"native-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
		"native-config.json": `${JSON.stringify({ extensionId: options.extensionId, connectionFile: `${directory}\\private\\connection.json` }, null, 2)}\n`,
		"auracall-host.bat": `@echo off\r\n"${options.windowsNodePath}" "%~dp0native-host.mjs" --config "%~dp0native-config.json" %*\r\n`,
		"SETUP.txt": `Source candidate only; no installation performed.\nWindows Node22+ and actual Chrome extension ID must be verified.\nCopy the complete bundle to ${directory}.\nLoad its extension subdirectory into the existing Chrome.\nExpected extension ID: ${options.extensionId}.\nProposed registry key: HKEY_CURRENT_USER\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${STOCK_HOST_NAME}\nProposed default value: ${directory}\\native-manifest.json\nInspect and preserve any existing registration before changing that one key.\nProtect the private subdirectory with the current Windows user's ACL only.\nThen click the extension on an existing ChatGPT/Grok conversation to share it.\nNo remote-debugging flag or browser restart is required by this design.\nRun native host and frontend MCP using the same Windows user and Node runtime;\nthis avoids assuming WSL can reach Windows loopback or read Windows-private secrets.\nNative setup, ACL, launcher, extension ID, permissions and browser acceptance remain UNVERIFIED.\n`,
	};
	for (const [name, text] of Object.entries(files))
		await writeFile(join(options.outputDir, name), text, { flag: "wx", mode: 0o600 });
	return {
		hostName: STOCK_HOST_NAME,
		extensionOrigin: manifest.allowed_origins[0],
		files: Object.keys(files),
	};
}
