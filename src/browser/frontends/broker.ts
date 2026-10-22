import { FrontendError, type FrontendBroker } from "./types.js";

const record = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === "object" && !Array.isArray(value));
const allowedActions = ["probe", "ui_action", "press"];

/** Synchronous service-request v1 client. Never launches, repairs, or retries a POST. */
export function createFrontendBroker(options: {
	baseUrl: string;
	env?: NodeJS.ProcessEnv;
	fetch?: typeof fetch;
	timeoutMs?: number;
	maxResponseBytes?: number;
}): FrontendBroker {
	let base: URL;
	try {
		base = new URL(options.baseUrl);
	} catch {
		throw new FrontendError("invalid_config", "The broker URL is invalid.");
	}
	if (
		base.protocol !== "http:" ||
		!["127.0.0.1", "[::1]"].includes(base.hostname) ||
		base.pathname !== "/" ||
		base.search ||
		base.hash ||
		base.username ||
		base.password
	) {
		throw new FrontendError("invalid_config", "Use an explicit loopback broker origin.");
	}
	const env = options.env ?? process.env;
	const requestFetch = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? 7000;
	const maxResponseBytes = options.maxResponseBytes ?? 131072;
	if (
		!Number.isInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > 30000 ||
		!Number.isInteger(maxResponseBytes) ||
		maxResponseBytes < 1 ||
		maxResponseBytes > 1048576
	)
		throw new FrontendError("invalid_config", "Broker response bounds are invalid.");

	async function json(
		path: string,
		token: string,
		body?: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		try {
			const response = await requestFetch(new URL(path, base), {
				method: body ? "POST" : "GET",
				redirect: "error",
				signal: AbortSignal.timeout(timeoutMs),
				headers: {
					authorization: `Bearer ${token}`,
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			if (!response.ok) {
				await response.body?.cancel();
				throw new FrontendError(
					"broker_refused",
					"The broker refused the request; no automatic replay.",
				);
			}
			if (!response.body)
				throw new FrontendError("broker_protocol", "The broker returned no response body.");
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let size = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > maxResponseBytes) {
					await reader.cancel();
					throw new FrontendError(
						"broker_protocol",
						"The broker response exceeded its byte limit.",
					);
				}
				chunks.push(value);
			}
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
			if (!record(parsed) || parsed.success !== true || !record(parsed.data))
				throw new FrontendError(
					"broker_refused",
					"The broker did not confirm success; inspect before retrying.",
				);
			return parsed.data;
		} catch (error) {
			if (error instanceof FrontendError) throw error;
			throw new FrontendError(
				"broker_uncertain",
				body
					? "The broker result is uncertain; do not replay the UI action."
					: "The broker preflight failed before input.",
			);
		}
	}

	return async (request, capabilityEnv) => {
		if (
			!allowedActions.includes(String(request.action)) ||
			!record(request.serviceTabHandle) ||
			request.serviceTabHandle.valid !== true ||
			"key" in request ||
			"taskAuthority" in request ||
			"handle" in request
		)
			throw new FrontendError(
				"invalid_request",
				"The frontend broker accepts only explicit retained UI operations.",
			);
		if (request.targetId !== undefined && request.targetId !== request.serviceTabHandle.targetId)
			throw new FrontendError(
				"target_mismatch",
				"The explicit target differs from the retained handle.",
			);
		if (
			request.action === "press" &&
			(!record(request.params) ||
				!["ArrowLeft", "ArrowRight"].includes(String(request.params.key)) ||
				Object.keys(request.params).length !== 1)
		)
			throw new FrontendError("invalid_key", "Only slider arrow keys are permitted.");
		const token = /^[A-Z_][A-Z0-9_]*$/.test(capabilityEnv) ? env[capabilityEnv] : undefined;
		if (!token?.trim() || /[\r\n]/.test(token))
			throw new FrontendError(
				"authority_missing",
				"The configured broker capability is unavailable.",
			);
		const contracts = await json("/api/service/contracts", token);
		const contract = record(contracts.contracts) ? contracts.contracts.serviceRequest : null;
		if (
			contracts.schemaVersion !== "v1" ||
			!record(contract) ||
			contract.version !== "v1" ||
			!Array.isArray(contract.actions) ||
			!allowedActions.every((action) => (contract.actions as unknown[]).includes(action))
		) {
			throw new FrontendError(
				"contract_mismatch",
				"The broker does not advertise the required service-request v1 actions.",
			);
		}
		// Top-level serviceTabHandle is canonical. Action-specific key belongs in params.
		return json("/api/service/request", token, request);
	};
}
