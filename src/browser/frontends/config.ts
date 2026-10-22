import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { createFrontendBroker } from "./broker.js";
import { FrontendService } from "./service.js";
import { FrontendError } from "./types.js";

const routeSchema = z
	.object({
		id: z.string().min(1).max(128),
		provider: z.literal("chatgpt"),
		expectedUrl: z.string().min(1),
		expectedModel: z.string().min(1).max(256),
		serviceTabHandle: z.record(z.string(), z.unknown()),
		profileCapabilityEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
	})
	.strict();
const configSchema = z
	.object({ brokerBaseUrl: z.string(), routes: z.array(routeSchema).max(32) })
	.strict();

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
		const config = configSchema.parse(JSON.parse(contents));
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
