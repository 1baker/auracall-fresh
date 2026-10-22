import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FrontendTools } from "../../browser/frontends/config.js";
import { FrontendError } from "../../browser/frontends/types.js";

/** Expose only opaque route IDs and documented effort values to MCP clients. */
export function registerFrontendTools(server: McpServer, service: FrontendTools): void {
	const route = z.object({ routeId: z.string().min(1) }).strict();
	const effort = route.extend({
		effort: z.enum(["light", "standard", "extended", "heavy", "pro"]),
	});
	const respond = async (action: () => Promise<Record<string, unknown>>) => {
		try {
			const data = await action();
			return {
				content: [{ type: "text" as const, text: JSON.stringify(data) }],
				structuredContent: data,
			};
		} catch (error) {
			const data = {
				ok: false,
				code: error instanceof FrontendError ? error.code : "frontend_failed",
				message:
					error instanceof FrontendError
						? error.message
						: "Frontend operation failed; inspect the configured route.",
			};
			return {
				isError: true,
				content: [{ type: "text" as const, text: data.message }],
				structuredContent: data,
			};
		}
	};
	server.registerTool(
		"frontend_inspect",
		{
			description:
				"Read visible frontend intelligence controls on one configured retained browser route. Never launches or sends.",
			inputSchema: route,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		({ routeId }) => respond(() => service.inspect(routeId)),
	);
	server.registerTool(
		"frontend_configure",
		{
			description:
				"Set ChatGPT intelligence using broker UI actions and verify readback. Never sends a prompt.",
			inputSchema: effort,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		({ routeId, effort }) => respond(() => service.configure(routeId, effort)),
	);
}
