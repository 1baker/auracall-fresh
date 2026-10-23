import { prepareStockChromeWindowsHost } from "../src/browser/stockChrome/setup.js";

const [outputDir, windowsDirectory, windowsNodePath, extensionId] = process.argv.slice(2);
if (!outputDir || !windowsDirectory || !windowsNodePath || !extensionId)
	throw new Error(
		"Usage: prepare-host OUTPUT_DIR WINDOWS_BUNDLE_DIRECTORY WINDOWS_NODE_EXE EXTENSION_ID",
	);
process.stdout.write(
	`${JSON.stringify(await prepareStockChromeWindowsHost({ outputDir, windowsDirectory, windowsNodePath, extensionId }))}\n`,
);
