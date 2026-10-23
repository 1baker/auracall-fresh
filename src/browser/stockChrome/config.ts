import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { createFrontendBroker } from "../frontends/broker.js";
import { type FrontendBroker, FrontendError } from "../frontends/types.js";
import { assertStockPrivatePath } from "./privatePath.js";
import { stockHandleSchema } from "./protocol.js";

const stockCapabilityEnv = "AURACALL_STOCK_CHROME_CAPABILITY";
const connectionSchema = z
	.object({
		version: z.literal("auracall-stock-chrome-v1"),
		sessionId: z.string().uuid(),
		baseUrl: z.string(),
		token: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export async function readStockChromeConnection(path: string) {
	if (!isAbsolute(path)) throw new Error("Use an explicit native connection file");
	await assertStockPrivatePath(dirname(path));
	await assertStockPrivatePath(path);
	const info = await lstat(path);
	if (
		!info.isFile() ||
		info.isSymbolicLink() ||
		info.size > 4096 ||
		(process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
	)
		throw new Error("Connection file must be private and user-owned");
	const text = await readFile(path, "utf8");
	if (Buffer.byteLength(text) > 4096) throw new Error("Connection file too large");
	const connection = connectionSchema.parse(JSON.parse(text));
	// Apply the same strict loopback-only URL validation before returning a capability.
	createFrontendBroker({ baseUrl: connection.baseUrl });
	return connection;
}

/** Read capabilities only when an uncached operation needs the live shared tab. */
export function createStockChromeBroker(connectionFile: string): FrontendBroker {
	return async (request) => {
		try {
			const handle = stockHandleSchema.parse(request.serviceTabHandle);
			const connection = await readStockChromeConnection(connectionFile);
			if (handle.sessionName !== connection.sessionId) throw new Error("Native session changed");
			return await createFrontendBroker({
				baseUrl: connection.baseUrl,
				transport: "stock_chrome",
				env: { [stockCapabilityEnv]: connection.token },
			})(request, stockCapabilityEnv);
		} catch (error) {
			if (error instanceof FrontendError) throw error;
			throw new FrontendError(
				"stock_chrome_unavailable",
				"The explicitly shared Chrome connection is unavailable; no repair or replay was attempted.",
			);
		}
	};
}

/** Prepare configuration from exactly one explicitly shared, exact-URL tab. */
export async function writeStockChromeFrontendConfig(options: {
	connectionFile: string;
	outputFile: string;
	id: string;
	provider: "chatgpt" | "grok";
	expectedUrl: string;
	expectedModel: string;
}) {
	const connection = await readStockChromeConnection(options.connectionFile);
	const response = await fetch(`${connection.baseUrl}/api/stock-chrome/tabs`, {
		headers: { authorization: `Bearer ${connection.token}` },
		redirect: "error",
		signal: AbortSignal.timeout(5000),
	});
	if (!response.ok) throw new Error("Native inventory refused");
	const text = await response.text();
	if (Buffer.byteLength(text) > 65536) throw new Error("Native inventory too large");
	const result = z
		.object({
			success: z.literal(true),
			data: z.object({ sessionId: z.string().uuid(), handles: z.array(stockHandleSchema).max(8) }),
		})
		.parse(JSON.parse(text));
	const handles = result.data.handles.filter(
		(handle) => handle.url === options.expectedUrl && handle.sessionName === connection.sessionId,
	);
	if (
		result.data.sessionId !== connection.sessionId ||
		handles.length !== 1 ||
		!options.expectedUrl.startsWith(
			`https://${options.provider === "chatgpt" ? "chatgpt.com" : "grok.com"}/`,
		)
	)
		throw new Error("Select exactly one matching shared conversation");
	const config = {
		transport: "stock_chrome",
		connectionFile: options.connectionFile,
		routes: [
			{
				id: options.id,
				provider: options.provider,
				expectedUrl: options.expectedUrl,
				expectedModel: options.expectedModel,
				serviceTabHandle: handles[0],
			},
		],
	};
	await writeFile(options.outputFile, `${JSON.stringify(config, null, 2)}\n`, {
		flag: "wx",
		mode: 0o600,
	});
	return { routeId: options.id, targetId: handles[0].targetId };
}
