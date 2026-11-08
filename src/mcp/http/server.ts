import { isUtf8 } from "node:buffer";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JWTVerifyGetKey } from "jose";
import {
	createStartupFrontendService,
	type FrontendTools,
} from "../../browser/frontends/config.js";
import { getCliVersion } from "../../version.js";
import { registerFrontendTools } from "../tools/frontends.js";
import {
	createFrontendTokenVerifier,
	type FrontendScope,
	type OAuthScope,
	frontendScopes,
	relayScopes,
	HttpRefusal,
} from "./auth.js";
import {
	type FrontendHttpConfig,
	readFrontendHttpConfig,
	validateFrontendHttpConfig,
} from "./config.js";
import { scopedFrontendTools } from "./scopedFrontend.js";
import { RelayStore } from "../relay/store.js";
import { registerRelayTools, relayToolScopes } from "../relay/tools.js";

const bodyLimit = 65536;
const operationScopes = new Map<string, FrontendScope>([
	["frontend_inspect", "frontend:read"],
	["frontend_status", "frontend:read"],
	["frontend_send", "frontend:send"],
	["frontend_configure", "frontend:configure"],
]);
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

function json(res: ServerResponse, status: number, value: unknown): void {
	if (res.headersSent || res.destroyed) return;
	res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
	res.end(JSON.stringify(value));
}

/** Bounded ingress before SDK validation, including for correctly authenticated callers. */
async function readBody(
	req: IncomingMessage,
	res: ServerResponse,
	limit = bodyLimit,
): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	const bytes = await new Promise<Buffer>((resolve, reject) => {
		const timeout = setTimeout(() => fail(new HttpRefusal(408, "request_timeout")), 5000);
		const cleanup = () => {
			clearTimeout(timeout);
			req.off("data", data);
			req.off("end", end);
			req.off("error", fail);
			req.off("aborted", aborted);
		};
		const fail = (error: Error) => {
			cleanup();
			req.once("error", () => {});
			req.resume();
			reject(error);
		};
		const aborted = () => fail(new HttpRefusal(400, "invalid_request"));
		const data = (chunk: Buffer) => {
			size += chunk.length;
			if (size > limit) {
				res.setHeader("connection", "close");
				res.once("finish", () => req.destroy());
				fail(new HttpRefusal(413, "request_too_large"));
			} else chunks.push(chunk);
		};
		const end = () => {
			cleanup();
			resolve(Buffer.concat(chunks, size));
		};
		req.on("data", data);
		req.once("end", end);
		req.once("error", fail);
		req.once("aborted", aborted);
	});
	let body: unknown;
	try {
		if (!isUtf8(bytes)) throw new Error("Invalid UTF-8");
		body = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new HttpRefusal(400, "invalid_json");
	}
	const stack: { value: unknown; depth: number }[] = [{ value: body, depth: 0 }];
	let nodes = 0;
	while (stack.length) {
		const item = stack.pop();
		if (!item || ++nodes > 2048 || item.depth > 16)
			throw new HttpRefusal(400, "request_too_complex");
		if (item.value !== null && typeof item.value === "object") {
			for (const [key, value] of Object.entries(item.value)) {
				if (key === "access_token" || key === "refresh_token")
					throw new HttpRefusal(400, "header_tokens_only");
				if (stack.length + nodes >= 2048) throw new HttpRefusal(400, "request_too_complex");
				stack.push({ value, depth: item.depth + 1 });
			}
		}
	}
	if (!record(body)) throw new HttpRefusal(400, "invalid_request");
	return body;
}

export interface FrontendHttpOptions {
	config: FrontendHttpConfig;
	service?: FrontendTools;
	keyResolver?: JWTVerifyGetKey;
	createMcpServer?: () => McpServer;
}

/** Factory does not listen, discover an issuer, launch a browser or create legacy MCP services. */
export function createFrontendHttpServer(options: FrontendHttpOptions) {
	const config = validateFrontendHttpConfig(options.config);
	const isRelay = config.mode === "relay";
	if (!isRelay && !options.service) throw new Error("Frontend service is required.");
	const relay = isRelay ? new RelayStore(config.relayDirectory ?? "", config.subject) : null;
	const scopes = isRelay ? relayScopes : frontendScopes;
	const requiredScopes: ReadonlyMap<string, OAuthScope> = isRelay
		? relayToolScopes
		: operationScopes;
	const resource = new URL(config.resource);
	const metadataPath = `/.well-known/oauth-protected-resource${resource.pathname === "/" ? "" : resource.pathname}`;
	const metadataUrl = resource.origin + metadataPath;
	const authenticate = createFrontendTokenVerifier(config, options.keyResolver, scopes);
	const origins = new Set([resource.origin, ...config.origins]);
	const makeMcp =
		options.createMcpServer ??
		(() =>
			new McpServer({
				name: isRelay ? "auracall-relay-mcp" : "auracall-frontend-mcp",
				version: getCliVersion(),
			}));
	const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
		try {
			if (
				req.headers.host?.toLowerCase() !== resource.host ||
				(req.headers.origin !== undefined &&
					(typeof req.headers.origin !== "string" || !origins.has(req.headers.origin)))
			)
				throw new HttpRefusal(403, "request_origin_denied");
			if (!req.url?.startsWith("/") || req.url.startsWith("//"))
				throw new HttpRefusal(400, "invalid_request");
			const url = new URL(req.url, resource.origin);
			if (url.search || url.hash) throw new HttpRefusal(400, "header_tokens_only");
			if (
				url.pathname === "/.well-known/oauth-protected-resource" ||
				url.pathname === metadataPath
			) {
				if (req.method !== "GET" && req.method !== "HEAD") {
					res.setHeader("allow", "GET, HEAD");
					throw new HttpRefusal(405, "method_not_allowed");
				}
				json(res, 200, {
					resource: config.resource,
					authorization_servers: [config.issuer],
					scopes_supported: scopes,
					bearer_methods_supported: ["header"],
				});
				return;
			}
			if (url.pathname !== resource.pathname) throw new HttpRefusal(404, "not_found");
			if (req.method !== "POST") {
				res.setHeader("allow", "POST");
				throw new HttpRefusal(405, "method_not_allowed");
			}
			const principal = await authenticate(req);
			if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? ""))
				throw new HttpRefusal(415, "unsupported_media_type");
			const body = await readBody(req, res, isRelay ? 2097152 : bodyLimit);
			if (
				record(body) &&
				body.method === "tools/call" &&
				record(body.params) &&
				typeof body.params.name === "string"
			) {
				const scope = requiredScopes.get(body.params.name);
				if (scope && !principal.scopes.has(scope))
					throw new HttpRefusal(403, "insufficient_scope", scope);
			}
			const mcp = makeMcp();
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
			});
			try {
				if (relay) registerRelayTools(mcp, relay, principal);
				else if (options.service)
					registerFrontendTools(
						mcp,
						scopedFrontendTools(options.service, principal, config.routeIds),
					);
				await mcp.connect(transport);
				await transport.handleRequest(req, res, body);
			} finally {
				await transport.close();
				await mcp.close();
			}
		} catch (error) {
			if (res.headersSent || res.destroyed) return;
			const refusal =
				error instanceof HttpRefusal ? error : new HttpRefusal(500, "mcp_request_failed");
			if (refusal.status === 401 || refusal.code === "insufficient_scope") {
				res.setHeader(
					"www-authenticate",
					'Bearer resource_metadata="' +
						metadataUrl +
						'", scope="' +
						(refusal.scope ?? scopes[0]) +
						'", error="' +
						refusal.code +
						'"',
				);
			}
			json(
				res,
				refusal.status,
				refusal.code === "invalid_request"
					? { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }
					: { error: refusal.code },
			);
		}
	};
	const server = createServer({ maxHeaderSize: 16384 }, (req, res) => {
		void handle(req, res);
	});
	server.headersTimeout = 10000;
	server.requestTimeout = 10000;
	server.timeout = 60000;
	server.maxConnections = 32;
	return server;
}

export async function startFrontendHttpServer(env: NodeJS.ProcessEnv = process.env) {
	const config = await readFrontendHttpConfig(env);
	const service = config.mode === "relay" ? undefined : await createStartupFrontendService(env);
	const server = createFrontendHttpServer({ config, service });
	server.listen(config.port, "127.0.0.1");
	await once(server, "listening");
	return server;
}
