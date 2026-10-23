/** Frontend production modules over a real stdio process; no provider/browser runtime. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStartupFrontendService } from "../../../src/browser/frontends/config.js";
import { registerFrontendTools } from "../../../src/mcp/tools/frontends.js";

const server = new McpServer({ name: "frontend-process-fixture", version: "1" });
registerFrontendTools(server, await createStartupFrontendService(process.env));
await server.connect(new StdioServerTransport());
