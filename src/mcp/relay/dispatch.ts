import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FrontendTools } from "../../browser/frontends/config.js";
import { FrontendError } from "../../browser/frontends/types.js";
import { RelayError, type RelayStore, relayId } from "./store.js";

const optionsSchema = z.object({
	requestId: relayId,
	routeId: z.string().min(1).max(128),
	expectedUrl: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/),
	expectedModel: z.string().min(1).max(256),
	maxStatusChecks: z.number().int().min(1).max(20).default(2),
	pollIntervalMs: z.number().int().min(0).max(10000).default(1000),
});

export type RelayDispatchOptions = z.input<typeof optionsSchema> & {
	store: RelayStore;
	frontend: Pick<FrontendTools, "inspect" | "send" | "status">;
};

function refusalCode(value: unknown, fallback: string): string {
	return typeof value === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(value) ? value : fallback;
}

/** One foreground dispatch. Existing claims are status-only, never a Send retry. */
export async function dispatchRelayRequest(input: RelayDispatchOptions) {
	const options = optionsSchema.safeParse(input);
	if (!options.success) throw new RelayError("relay_sender_options_invalid");
	const { store, frontend } = input;
	const { requestId, routeId, expectedUrl, expectedModel, maxStatusChecks, pollIntervalMs } =
		options.data;
	const saved = await store.status(requestId);
	const request = await store.request(requestId);
	if (saved.state === "replied") {
		await store.frontendClaim(requestId, request.fingerprint, {
			routeId,
			expectedUrl,
			expectedModel,
		});
		return saved;
	}
	if (request.prompt.length > 8192) throw new RelayError("relay_frontend_prompt_too_large");
	if (request.previousRequestId) {
		let previous: Record<string, unknown>;
		try {
			previous = await frontend.status(routeId, request.previousRequestId);
		} catch {
			throw new RelayError("relay_sender_previous_reply_unavailable");
		}
		if (
			previous.ok !== true ||
			previous.status !== "completed" ||
			previous.requestId !== request.previousRequestId ||
			previous.routeId !== routeId ||
			previous.conversationUrl !== expectedUrl ||
			!request.previousReply ||
			previous.output !== request.previousReply.text
		)
			throw new RelayError("relay_sender_previous_reply_mismatch");
	}
	if (saved.state === "ready") {
		const observed = await frontend.inspect(routeId);
		if (
			observed.ok !== true ||
			observed.provider !== "chatgpt" ||
			observed.url !== expectedUrl ||
			(observed.routeId !== undefined && observed.routeId !== routeId)
		)
			throw new RelayError("relay_frontend_target_unqualified");
		if (observed.model !== expectedModel || observed.effort !== "pro")
			throw new RelayError("relay_frontend_model_unqualified");
	}
	const claim = await store.frontendClaim(requestId, request.fingerprint, {
		routeId,
		expectedUrl,
		expectedModel,
	});
	if (claim.fresh) {
		try {
			const receipt = await frontend.send(
				routeId,
				requestId,
				request.prompt,
				request.previousRequestId ?? undefined,
			);
			if (receipt.ok !== true || receipt.requestId !== requestId || receipt.routeId !== routeId)
				throw new RelayError("relay_frontend_send_unconfirmed");
		} catch (error) {
			await store.hold(requestId, claim.claimId);
			return {
				...(await store.status(requestId)),
				code: refusalCode(
					error instanceof FrontendError ? error.code : null,
					"relay_frontend_send_unconfirmed",
				),
			};
		}
	}
	for (let check = 0; check < maxStatusChecks; check++) {
		let receipt: Record<string, unknown>;
		try {
			receipt = await frontend.status(routeId, requestId);
		} catch (error) {
			await store.hold(requestId, claim.claimId);
			return {
				...(await store.status(requestId)),
				code: refusalCode(
					error instanceof FrontendError ? error.code : null,
					"relay_frontend_status_unavailable",
				),
			};
		}
		if (
			receipt.ok !== true ||
			receipt.requestId !== requestId ||
			receipt.routeId !== routeId ||
			receipt.previousRequestId !== request.previousRequestId
		) {
			await store.hold(requestId, claim.claimId);
			throw new RelayError("relay_frontend_readback_mismatch");
		}
		const refusal = receipt.code ?? (receipt.status !== "completed" ? receipt.lockState : null);
		if (refusal !== null && refusal !== undefined) {
			await store.hold(requestId, claim.claimId);
			return {
				...(await store.status(requestId)),
				code: refusalCode(refusal, "relay_frontend_refused"),
			};
		}
		if (receipt.status === "completed") {
			if (
				receipt.conversationUrl !== expectedUrl ||
				typeof receipt.output !== "string" ||
				!receipt.output.trim()
			) {
				await store.hold(requestId, claim.claimId);
				throw new RelayError("relay_frontend_readback_mismatch");
			}
			await store.submit(requestId, claim.claimId, receipt.output);
			return store.status(requestId);
		}
		if (!["sent", "sending", "uncertain"].includes(String(receipt.status))) {
			await store.hold(requestId, claim.claimId);
			return store.status(requestId);
		}
		if (pollIntervalMs > 0 && maxStatusChecks - check > 1) await delay(pollIntervalMs);
	}
	return store.status(requestId);
}
