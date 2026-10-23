#!/usr/bin/env node
/** Frontend-only production MCP entry; no provider/browser lifecycle startup. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStartupFrontendService } from "../src/browser/frontends/config.js";
import { registerFrontendTools } from "../src/mcp/tools/frontends.js";

const server = new McpServer({ name: "auracall-stock-chrome", version: "0.1.0" });
registerFrontendTools(server, await createStartupFrontendService(process.env));
await server.connect(new StdioServerTransport());
