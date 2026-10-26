import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { FrontendTools } from "./config.js";
import { requestIdSchema } from "./requestStore.js";
import { FrontendError } from "./types.js";

export interface FrontendMcpClient {
	callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}
const routeSchema = z.string().min(1).max(128);
const effortSchema = z.enum([
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
]);
const textSchema = z.string().min(1).max(8192);
const record = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === "object" && !Array.isArray(value));
const fail = (code: string, menuMayBeOpen?: true): never => {
	throw new FrontendError(
		code,
		"Owned frontend MCP call was not confirmed; preserve the original request.",
		menuMayBeOpen,
	);
};

/** Consumer of the EXISTING frontend_* MCP tools. The compiled operator supplies
 * its own already-connected/authenticated SDK client and one qualified route.
 * Never constructs a transport, polls a catalog, borrows a browser namespace,
 * reconnects, retries, closes or changes authority. A facade is not readiness.
 * P447 retains canonical store/claim/completion correlation on the sender host.
 */
export function createMcpFrontend(client: FrontendMcpClient, routeId: string): FrontendTools {
	if (!routeSchema.safeParse(routeId).success || !client || typeof client.callTool !== "function")
		fail("mcp_frontend_binding_invalid");
	const callTool = client.callTool.bind(client);
	async function call(name: string, route: string, args: Record<string, unknown> = {}) {
		if (route !== routeId) fail("mcp_frontend_binding_mismatch");
		let response: unknown;
		try {
			response = await callTool({ name, arguments: { routeId, ...args } });
		} catch {
			return fail("mcp_frontend_transport_unresolved");
		}
		if (!record(response) || !record(response.structuredContent))
			return fail("mcp_frontend_protocol");
		const data = response.structuredContent;
		if (response.isError === true || data.ok === false) {
			const code =
				typeof data.code === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(data.code)
					? data.code
					: "mcp_frontend_refused";
			return fail(code, data.menuMayBeOpen === true ? true : undefined);
		}
		if (data.ok !== true || (response.isError !== undefined && response.isError !== false))
			return fail("mcp_frontend_protocol");
		// Exact current tools return the same complete object in both representations.
		// Do not parse an ACK, truncate a reply, or silently pick a conflicting copy.
		try {
			const content = response.content;
			if (
				!Array.isArray(content) ||
				content.length !== 1 ||
				!record(content[0]) ||
				content[0].type !== "text" ||
				typeof content[0].text !== "string" ||
				Buffer.byteLength(content[0].text, "utf8") > 1048576 ||
				Buffer.byteLength(JSON.stringify(data), "utf8") > 1048576 ||
				!isDeepStrictEqual(JSON.parse(content[0].text), data)
			)
				fail("mcp_frontend_protocol");
			return data;
		} catch {
			return fail("mcp_frontend_protocol");
		}
	}
	return Object.freeze({
		inspect: (route) => call("frontend_inspect", route),
		configure: (route, effort) => {
			if (!effortSchema.safeParse(effort).success) fail("mcp_frontend_arguments_invalid");
			return call("frontend_configure", route, { effort });
		},
		send: (route, requestId, text, previousRequestId) => {
			if (
				!requestIdSchema.safeParse(requestId).success ||
				!textSchema.safeParse(text).success ||
				(previousRequestId !== undefined && !requestIdSchema.safeParse(previousRequestId).success)
			)
				fail("mcp_frontend_arguments_invalid");
			return call("frontend_send", route, {
				requestId,
				text,
				...(previousRequestId === undefined ? {} : { previousRequestId }),
			});
		},
		status: (route, requestId) => {
			if (!requestIdSchema.safeParse(requestId).success) fail("mcp_frontend_arguments_invalid");
			return call("frontend_status", route, { requestId });
		},
	});
}
