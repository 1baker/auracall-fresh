#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { startStockChromeHost } from "../src/browser/stockChrome/host.js";

// Native stdout is framed JSON only; diagnostics never include page or capability data.
try {
	const args = process.argv.slice(2);
	if (args[0] !== "--config" || !args[1]) throw new Error("Explicit native config required");
	const raw = await readFile(args[1], "utf8");
	if (Buffer.byteLength(raw) > 4096) throw new Error("Native config too large");
	const config = z.object({ extensionId: z.string().regex(/^[a-p]{32}$/), connectionFile: z.string().min(1) }).strict().parse(JSON.parse(raw));
	const host = await startStockChromeHost({ ...config, extensionOrigin: args[2] ?? "", input: process.stdin, output: process.stdout });
	await host.done;
} catch {
	process.stderr.write("AuraCall stock Chrome host stopped; inspect the explicit local setup. No automatic retry.\n");
	process.exitCode = 1;
}
