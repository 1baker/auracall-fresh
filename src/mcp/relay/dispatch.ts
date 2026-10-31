import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FrontendTools } from "../../browser/frontends/config.js";
import { FrontendError } from "../../browser/frontends/types.js";
import {
	type CanonicalDispatchAuthority,
	type CanonicalDispatchSpan,
	type CanonicalDispatchStage,
	type CanonicalTerminalReceipt,
	RelayError,
	type RelayStore,
	relayId,
} from "./store.js";

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
	frontend: Pick<FrontendTools, "inspect" | "send" | "status"> &
		Partial<Pick<FrontendTools, "configure">>;
	/** Private compiled composition only; never created from startup JSON. */
	execution?: {
		generation: string;
		intent: string;
		authority: CanonicalDispatchAuthority;
		span?: CanonicalDispatchSpan;
	};
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
	if (saved.state === "replied" && !input.execution) {
		await store.frontendClaim(requestId, request.fingerprint, {
			routeId,
			expectedUrl,
			expectedModel,
		});
		return saved;
	}
	if (request.prompt.length > 8192) throw new RelayError("relay_frontend_prompt_too_large");
	let span: CanonicalDispatchSpan | undefined;
	let claim: Awaited<ReturnType<RelayStore["frontendClaim"]>> | undefined;
	const binding = { routeId, expectedUrl, expectedModel };
	const bindSpan = async () => {
		if (!input.execution || span) return;
		const exact = {
			...binding,
			requestId,
			fingerprint: request.fingerprint,
			generation: input.execution.generation,
			intent: input.execution.intent,
		};
		if (input.execution.span || saved.state === "ready") {
			const selected =
				input.execution.span ?? (await store.beginExactRequest(exact, input.execution.authority));
			await store.attachExactRequest(selected, exact);
			span = selected;
			claim = { claimId: span.binding.claimId, fingerprint: request.fingerprint, fresh: true };
		} else {
			claim = await store.frontendClaim(requestId, request.fingerprint, binding);
			span = await store.originalDispatch(
				{ ...exact, claimId: claim.claimId },
				input.execution.authority,
			);
		}
	};
	const checked = async <T>(stage: CanonicalDispatchStage, action: () => Promise<T>) => {
		await span?.assertCurrent(stage);
		const value = await action();
		await span?.assertCurrent(stage);
		return value;
	};
	try {
		if (input.execution?.span) await bindSpan();
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
		if (saved.state === "ready" || input.execution?.span) {
			const qualifyTarget = (observed: Record<string, unknown>) => {
				if (
					observed.ok !== true ||
					observed.provider !== "chatgpt" ||
					observed.url !== expectedUrl ||
					(observed.routeId !== undefined && observed.routeId !== routeId)
				)
					throw new RelayError("relay_frontend_target_unqualified");
				if (observed.model !== expectedModel)
					throw new RelayError("relay_frontend_model_unqualified");
			};
			let observed = await checked("configure", () => frontend.inspect(routeId));
			qualifyTarget(observed);
			// Generation-bound execution reserves its immutable claim/span before
			// the first mutation. Legacy Pro-before-claim behavior remains unchanged.
			await bindSpan();
			const configure = frontend.configure?.bind(frontend);
			if (observed.effort !== "pro" && configure) {
				await store.configureFrontend(
					requestId,
					request.fingerprint,
					{
						routeId,
						expectedUrl,
						expectedModel,
					},
					async () => {
						const configured = await checked("configure", () => configure(routeId, "pro"));
						if (configured.ok !== true)
							throw new RelayError("relay_frontend_configuration_unconfirmed");
						// A control acknowledgement is not an observation of the current UI.
						observed = await checked("configure", () => frontend.inspect(routeId));
						qualifyTarget(observed);
						if (observed.effort !== "pro") throw new RelayError("relay_frontend_model_unqualified");
					},
					span,
				);
			}
			if (observed.effort !== "pro") throw new RelayError("relay_frontend_model_unqualified");
		}
		await bindSpan();
		claim ??= await store.frontendClaim(requestId, request.fingerprint, {
			routeId,
			expectedUrl,
			expectedModel,
		});
		if (claim.fresh) {
			try {
				await span?.recordOriginal();
				const receipt = await checked("send", () =>
					frontend.send(routeId, requestId, request.prompt, request.previousRequestId ?? undefined),
				);
				if (receipt.ok !== true || receipt.requestId !== requestId || receipt.routeId !== routeId)
					throw new RelayError("relay_frontend_send_unconfirmed");
			} catch (error) {
				if (span) await span.hold();
				else await store.hold(requestId, claim.claimId);
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
				receipt = await checked("readback", () => frontend.status(routeId, requestId));
			} catch (error) {
				if (span) await span.hold();
				else await store.hold(requestId, claim.claimId);
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
				if (span) {
					const terminal: CanonicalTerminalReceipt = {
						ok: true,
						status: "completed",
						requestId,
						routeId,
						previousRequestId: request.previousRequestId,
						conversationUrl: expectedUrl,
						output: receipt.output,
					};
					await span.settleOriginal(terminal);
				} else await store.submit(requestId, claim.claimId, receipt.output);
				return store.status(requestId);
			}
			if (!["sent", "sending", "uncertain"].includes(String(receipt.status))) {
				await store.hold(requestId, claim.claimId);
				return store.status(requestId);
			}
			if (pollIntervalMs > 0 && maxStatusChecks - check > 1) await delay(pollIntervalMs);
		}
		return store.status(requestId);
	} catch (error) {
		if (span) await span.hold();
		throw error;
	}
}
