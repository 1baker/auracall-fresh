import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Offline response evidence only; never connects to a browser or provider. */
export function summarizeProviderResponses(input: {
	responses: Array<{
		at: string;
		path: string;
		status: number;
		requestId?: string;
		operationId?: string;
	}>;
}) {
	const backend = input.responses.filter((response) => response.path.startsWith("/backend-api/"));
	const times = backend.map((response) => Date.parse(response.at)).sort((a, b) => a - b);
	if (times.some((time) => !Number.isFinite(time))) throw new Error("Invalid response timestamp.");
	let left = 0;
	let peakResponsesInInclusiveMinute = 0;
	for (let right = 0; right < times.length; right++) {
		while (times[right] - times[left] > 60000) left++;
		peakResponsesInInclusiveMinute = Math.max(peakResponsesInInclusiveMinute, right - left + 1);
	}
	return {
		version: 1,
		totalResponses: input.responses.length,
		backendResponses: backend.length,
		backendRateLimitResponses: backend.filter((response) => response.status === 429).length,
		peakResponsesInInclusiveMinute,
		allBackendResponsesHaveRequestIds:
			backend.length > 0 && backend.every((response) => Boolean(response.requestId)),
		allBackendResponsesHaveOperationIds:
			backend.length > 0 && backend.every((response) => Boolean(response.operationId)),
		evidenceBoundary:
			"Observed responses; distinct request counts and per-operation attribution require additional evidence.",
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const file = process.argv[2];
	if (!file)
		throw new Error(
			"Usage: pnpm tsx scripts/replay-provider-response-accounting.ts <captured-observer.json>",
		);
	console.log(
		JSON.stringify(summarizeProviderResponses(JSON.parse(await readFile(file, "utf8"))), null, 2),
	);
}
