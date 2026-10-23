import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = resolve(root, "dist/stock-chrome"),
	extension = resolve(outdir, "extension");
await mkdir(extension, { recursive: true });
await build({
	entryPoints: [resolve(root, "src/browser/stockChrome/extension/worker.ts")],
	outfile: resolve(extension, "worker.js"),
	bundle: true,
	platform: "browser",
	target: "chrome120",
	format: "iife",
	keepNames: false,
});
await copyFile(
	resolve(root, "src/browser/stockChrome/extension/manifest.json"),
	resolve(extension, "manifest.json"),
);
for (const [entry, name] of [
	["bin/auracall-stock-chrome-host.ts", "native-host"],
	["bin/auracall-stock-chrome-mcp.ts", "frontend-mcp"],
	["scripts/stock-chrome-config.ts", "configure"],
	["scripts/prepare-stock-chrome-host.ts", "prepare-host"],
]) {
	await build({
		entryPoints: [resolve(root, entry)],
		outfile: resolve(outdir, `${name}.mjs`),
		bundle: true,
		platform: "node",
		target: "node22",
		format: "esm",
		keepNames: false,
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
		},
	});
}
