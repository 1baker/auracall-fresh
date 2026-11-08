import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Compiled MCP entry used by process-level MCP tests. */
export const builtMcpEntry = fileURLToPath(new URL("../dist/bin/auracall-mcp.js", import.meta.url));

/** Fail with an actionable message instead of a misleading spawn error. */
export function requireBuiltMcpEntry(): string {
	if (!existsSync(builtMcpEntry)) {
		throw new Error(
			"dist/bin/auracall-mcp.js is missing. Run `pnpm run build` first, or use `pnpm run test:mcp`, which builds before testing.",
		);
	}
	return builtMcpEntry;
}
