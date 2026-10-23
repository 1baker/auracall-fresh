import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { createStockChromeBroker } from "../stockChrome/config.js";
import { stockHandleSchema } from "../stockChrome/protocol.js";
import { createFrontendBroker } from "./broker.js";
import { FrontendService } from "./service.js";
import { FrontendError } from "./types.js";

const routeSchema = z
	.object({
		id: z.string().min(1).max(128),
		provider: z.enum(["chatgpt", "grok", "claude"]),
		expectedUrl: z.string().min(1),
		expectedModel: z.string().min(1).max(256),
		serviceTabHandle: z.record(z.string(), z.unknown()),
		profileCapabilityEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
	})
	.strict();
const configSchema = z
	.object({ brokerBaseUrl: z.string(), routes: z.array(routeSchema).max(32) })
	.strict();
const stockConfigSchema = z
	.object({
		transport: z.literal("stock_chrome"),
		connectionFile: z.string().min(1),
		routes: z
			.array(
				routeSchema.omit({ profileCapabilityEnv: true }).extend({
					provider: z.enum(["chatgpt", "grok"]),
					serviceTabHandle: stockHandleSchema,
				}),
			)
			.max(8),
	})
	.strict();

export type FrontendTools = Pick<FrontendService, "inspect" | "configure" | "send" | "status">;

/** Bad opt-in configuration disables frontend calls without disabling sibling tools. */
export async function createStartupFrontendService(
	env: NodeJS.ProcessEnv = process.env,
): Promise<FrontendTools> {
	try {
		return await createConfiguredFrontendService(env);
	} catch (error) {
		if (!(error instanceof FrontendError) || error.code !== "invalid_config") throw error;
		const unavailable = async (): Promise<Record<string, unknown>> => {
			throw new FrontendError("invalid_config", error.message);
		};
		return { inspect: unavailable, configure: unavailable, send: unavailable, status: unavailable };
	}
}

/** Missing opt-in config registers fail-closed tools without contacting a broker. */
export async function createConfiguredFrontendService(
	env: NodeJS.ProcessEnv = process.env,
): Promise<FrontendService> {
	const path = env.AURACALL_FRONTEND_CONFIG;
	if (!path)
		return new FrontendService([], async () => {
			throw new FrontendError("route_missing", "No frontend routes are configured.");
		});
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size > 65536) throw new Error("Invalid config file");
		const contents = await readFile(path, "utf8");
		if (Buffer.byteLength(contents, "utf8") > 65536) throw new Error("Invalid config size");
		const parsed = JSON.parse(contents);
		if (parsed?.transport === "stock_chrome") {
			const config = stockConfigSchema.parse(parsed);
			return new FrontendService(
				config.routes.map((route) => ({
					...route,
					profileCapabilityEnv: "AURACALL_STOCK_CHROME_CAPABILITY",
				})),
				createStockChromeBroker(config.connectionFile),
			);
		}
		const config = configSchema.parse(parsed);
		return new FrontendService(
			config.routes,
			createFrontendBroker({ baseUrl: config.brokerBaseUrl, env }),
		);
	} catch {
		throw new FrontendError(
			"invalid_config",
			"Cannot load the explicit frontend configuration; no browser operation was attempted.",
		);
	}
}
