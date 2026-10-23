import { writeStockChromeFrontendConfig } from "../src/browser/stockChrome/config.js";

const [connectionFile, outputFile, provider, expectedUrl, expectedModel] = process.argv.slice(2);
if (
	!connectionFile ||
	!outputFile ||
	!expectedUrl ||
	!expectedModel ||
	!["chatgpt", "grok"].includes(provider)
) {
	throw new Error(
		"Usage: stock-chrome-config CONNECTION_FILE OUTPUT_FILE chatgpt|grok EXACT_CONVERSATION_URL VISIBLE_MODEL",
	);
}
const result = await writeStockChromeFrontendConfig({
	connectionFile,
	outputFile,
	provider: provider as "chatgpt" | "grok",
	id: provider,
	expectedUrl,
	expectedModel,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
