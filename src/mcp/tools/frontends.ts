import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FrontendTools } from "../../browser/frontends/config.js";
import { requestIdSchema } from "../../browser/frontends/requestStore.js";
import { FrontendError } from "../../browser/frontends/types.js";

/** Expose only opaque route IDs and documented effort values to MCP clients. */
export function registerFrontendTools(server: McpServer, service: FrontendTools): void {
	const route = z.object({ routeId: z.string().min(1) }).strict();
	const effort = route.extend({
		effort: z.enum([
			"light",
			"standard",
			"extended",
			"heavy",
			"pro",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]),
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
				...(error instanceof FrontendError && error.menuMayBeOpen === true
					? { menuMayBeOpen: true }
					: {}),
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
				"Read visible ChatGPT intelligence, Claude effort or opt-in Grok Heavy model controls on one configured retained route. Never launches or sends.",
			inputSchema: route,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		({ routeId }) => respond(() => service.inspect(routeId)),
	);
	server.registerTool(
		"frontend_configure",
		{
			description:
				"Set ChatGPT intelligence or Claude effort, or select the Grok Heavy model with effort heavy on an explicit Heavy route. Uses broker UI input and exact visible readback; never sends a prompt.",
			inputSchema: effort,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		({ routeId, effort }) => respond(() => service.configure(routeId, effort)),
	);
	server.registerTool(
		"frontend_send",
		{
			description:
				"Send once through a configured ChatGPT, Claude or Grok frontend conversation, including an empty root. Save requestId; repeat only that same ID/content to recover the receipt. Never automatically replays uncertain input.",
			inputSchema: route.extend({
				requestId: requestIdSchema,
				text: z.string().min(1).max(8192),
				previousRequestId: requestIdSchema.optional(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		({ routeId, requestId, text, previousRequestId }) =>
			respond(() => service.send(routeId, requestId, text, previousRequestId)),
	);
	server.registerTool(
		"frontend_status",
		{
			description:
				"Read a saved frontend request and perform at most one read-only conversation probe. Returns saved replies and message IDs; never types or sends, including after restart.",
			inputSchema: route.extend({ requestId: requestIdSchema }),
			annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
		},
		({ routeId, requestId }) => respond(() => service.status(routeId, requestId)),
	);
}
