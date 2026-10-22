import { z } from "zod";
import { FrontendError, type FrontendRoute } from "./types.js";
import {
	type FrontendRequestStore,
	frontendRouteBinding,
	frontendTargetKey,
	requestIdSchema,
	type FrontendRequestRecord,
} from "./requestStore.js";

/** Serialized read-only DOM recipe; no input or network operations. */
export function inspectChatgptMessages(doc: Document, url: string) {
	const visible = (node: Element) => {
		const style = doc.defaultView?.getComputedStyle?.(node);
		return (
			!node.closest('[hidden], [aria-hidden="true"]') &&
			style?.display !== "none" &&
			style?.visibility !== "hidden" &&
			(!node.getClientRects || node.getClientRects().length > 0)
		);
	};
	const one = (selector: string) => {
		const nodes = Array.from(doc.querySelectorAll(selector)).filter(visible);
		return nodes.length === 1 ? nodes[0] : null;
	};
	const composer = one("#prompt-textarea");
	const send = one('button[data-testid="send-button"]');
	const model = one(
		'[data-testid="model-switcher-dropdown-button"], button[aria-label="Select ChatGPT model"]',
	);
	const disabled = (node: Element | null) =>
		!node || node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
	return {
		url,
		model: model?.textContent?.replace(/\s+/g, " ").trim() ?? null,
		composer: composer
			? "value" in composer
				? String(composer.value)
				: ((composer as HTMLElement).innerText ?? composer.textContent ?? "")
			: null,
		composerReady:
			!disabled(composer) &&
			(composer?.tagName === "TEXTAREA" || composer?.getAttribute("contenteditable") === "true"),
		sendReady: !disabled(send),
		generating: Array.from(
			doc.querySelectorAll(
				'[data-testid="stop-button"], button[aria-label="Stop generating"], [data-is-streaming="true"]',
			),
		).some(visible),
		messages: Array.from(doc.querySelectorAll("[data-message-author-role]"))
			.filter(visible)
			.map((node) => ({
				id: node.getAttribute("data-message-id"),
				role: node.getAttribute("data-message-author-role"),
				text: (node as HTMLElement).innerText ?? node.textContent ?? "",
			})),
	};
}
export const chatgptMessagesExpression = () =>
	`(${inspectChatgptMessages.toString()})(document, location.href)`;
const observationSchema = z.object({
	url: z.string(),
	model: z.string(),
	composer: z.string().nullable(),
	composerReady: z.boolean(),
	sendReady: z.boolean(),
	generating: z.boolean(),
	messages: z
		.array(
			z.object({
				id: z.string().min(1).max(256),
				role: z.enum(["user", "assistant"]),
				text: z.string().max(64000),
			}),
		)
		.max(200),
});
type Observation = z.infer<typeof observationSchema>;
interface MessageOperations {
	request(route: FrontendRoute, request: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class FrontendMessages {
	constructor(
		private readonly store: FrontendRequestStore,
		private readonly operations: MessageOperations,
	) {}
	private bound(route: FrontendRoute, record: FrontendRequestRecord): void {
		if (record.binding !== frontendRouteBinding(route))
			throw new FrontendError(
				"request_binding_mismatch",
				"The saved request belongs to a different retained route.",
			);
	}
	private receipt(record: FrontendRequestRecord): Record<string, unknown> {
		const {
			requestId,
			routeId,
			previousRequestId,
			status,
			userMessageId,
			assistantMessageId,
			output,
			code,
		} = record;
		return {
			ok: true,
			requestId,
			routeId,
			previousRequestId,
			status,
			userMessageId,
			assistantMessageId,
			output,
			code,
			liveVerified: false,
		};
	}
	private async observe(route: FrontendRoute): Promise<Observation> {
		const result = await this.operations.request(route, {
			action: "probe",
			timeoutMs: 5000,
			maxReturnBytes: 98304,
			probe: {
				recipeId: "auracall-chatgpt-messages-v1",
				detectors: [{ id: "messages", type: "evaluate", expression: chatgptMessagesExpression() }],
			},
		});
		if (result.targetId !== route.serviceTabHandle.targetId)
			throw new FrontendError("target_mismatch", "The retained target changed.");
		if (result.ok !== true || result.url !== route.expectedUrl)
			throw new FrontendError("origin_mismatch", "The retained conversation changed.");
		const detectors = result.detectors as {
			id?: unknown;
			ok?: unknown;
			resultTruncated?: unknown;
			result?: unknown;
		}[];
		if (
			!Array.isArray(detectors) ||
			detectors.length !== 1 ||
			detectors[0]?.id !== "messages" ||
			detectors[0].ok !== true ||
			detectors[0].resultTruncated === true
		)
			throw new FrontendError("probe_failed", "Complete conversation evidence is unavailable.");
		const parsed = observationSchema.safeParse(detectors[0].result);
		if (!parsed.success)
			throw new FrontendError("probe_failed", "Conversation evidence is invalid or incomplete.");
		const observation = parsed.data;
		if (observation.url !== route.expectedUrl)
			throw new FrontendError("origin_mismatch", "The conversation URL changed.");
		if (observation.model !== route.expectedModel)
			throw new FrontendError("model_drift", "The visible model changed.");
		if (
			new Set(observation.messages.map((message) => message.id)).size !==
			observation.messages.length
		)
			throw new FrontendError("probe_failed", "Message identities are ambiguous.");
		return observation;
	}
	private async ui(route: FrontendRoute, type: "fill" | "click", value?: string): Promise<void> {
		const result = await this.operations.request(route, {
			action: "ui_action",
			timeoutMs: 5000,
			maxTextBytes: 1024,
			uiAction: {
				maxActions: 1,
				steps: [
					{
						type,
						selector: type === "fill" ? "#prompt-textarea" : 'button[data-testid="send-button"]',
						...(value === undefined ? {} : { value }),
					},
				],
			},
		});
		const steps = result.steps as { index?: unknown; type?: unknown; ok?: unknown }[];
		if (
			result.ok !== true ||
			result.targetId !== route.serviceTabHandle.targetId ||
			!Array.isArray(steps) ||
			steps.length !== 1 ||
			steps[0]?.index !== 0 ||
			steps[0].type !== type ||
			steps[0].ok !== true
		)
			throw new FrontendError(
				"ui_action_failed",
				"Native input was not confirmed; no automatic replay.",
			);
	}
	async send(
		route: FrontendRoute,
		requestId: string,
		text: string,
		previousRequestId?: string,
	): Promise<Record<string, unknown>> {
		if (!requestIdSchema.safeParse(requestId).success)
			throw new FrontendError("invalid_request_id", "Use a valid opaque request ID.");
		if (
			!text.trim() ||
			text.length > 8192 ||
			(previousRequestId !== undefined && !requestIdSchema.safeParse(previousRequestId).success)
		)
			throw new FrontendError(
				"invalid_request",
				"Provide bounded text and a valid prior request ID.",
			);
		if (
			!/^\/c\/[a-zA-Z0-9_-]+$/.test(new URL(route.expectedUrl).pathname) ||
			new URL(route.expectedUrl).search ||
			new URL(route.expectedUrl).hash
		)
			throw new FrontendError(
				"conversation_required",
				"Configure an existing exact ChatGPT conversation URL.",
			);
		const replay = (saved: FrontendRequestRecord) => {
			this.bound(route, saved);
			if (saved.text !== text || saved.previousRequestId !== (previousRequestId ?? null))
				throw new FrontendError(
					"request_conflict",
					"This request ID already names different content.",
				);
			return this.receipt(saved);
		};
		const existing = await this.store.read(requestId);
		if (existing) return replay(existing);
		return this.store.withLock(frontendTargetKey(route), requestId, async () => {
			const saved = await this.store.read(requestId);
			if (saved) return replay(saved);
			if (await this.store.unresolved(frontendTargetKey(route)))
				throw new FrontendError(
					"request_unresolved",
					"Read status for the previous request before sending another.",
				);
			const observation = await this.observe(route);
			if (!observation.composerReady || observation.composer !== "" || observation.generating)
				throw new FrontendError(
					"composer_busy",
					"The composer must be empty and generation stopped.",
				);
			if (previousRequestId) {
				const previous = await this.store.read(previousRequestId);
				if (!previous)
					throw new FrontendError("previous_missing", "The previous request does not exist.");
				this.bound(route, previous);
				if (
					previous.status !== "completed" ||
					observation.messages.at(-1)?.id !== previous.assistantMessageId ||
					observation.messages.at(-1)?.text !== previous.output
				)
					throw new FrontendError(
						"continuity_mismatch",
						"The completed previous reply must still be the conversation tail.",
					);
			}
			const record: FrontendRequestRecord = {
				version: 1,
				requestId,
				routeId: route.id,
				binding: frontendRouteBinding(route),
				targetKey: frontendTargetKey(route),
				text,
				previousRequestId: previousRequestId ?? null,
				status: "prepared",
				baseline: observation.messages.map((message) => message.id),
				userMessageId: null,
				assistantMessageId: null,
				output: null,
				code: null,
			};
			await this.store.write(record, true);
			try {
				await this.ui(route, "fill", text);
				const filled = await this.observe(route);
				if (
					!filled.composerReady ||
					!filled.sendReady ||
					filled.composer !== text ||
					filled.generating ||
					JSON.stringify(filled.messages.map((message) => message.id)) !==
						JSON.stringify(record.baseline)
				)
					throw new FrontendError(
						"composer_mismatch",
						"Composer readback or conversation changed before Send.",
					);
			} catch {
				record.status = "failed_presend";
				record.code = "presend_unconfirmed";
				await this.store.write(record);
				return this.receipt(record);
			}
			record.status = "sending";
			await this.store.write(record);
			try {
				await this.ui(route, "click");
				record.status = "sent";
			} catch {
				record.status = "uncertain";
				record.code = "send_unconfirmed";
			}
			await this.store.write(record);
			return this.receipt(record);
		});
	}
	async status(route: FrontendRoute, requestId: string): Promise<Record<string, unknown>> {
		const saved = await this.store.read(requestId);
		if (!saved)
			throw new FrontendError("request_missing", "No saved frontend request has this ID.");
		this.bound(route, saved);
		const key = frontendTargetKey(route);
		const held = await this.store.lockState(key);
		if (held) return { ...this.receipt(saved), lockState: held };
		if (["completed", "failed_presend"].includes(saved.status)) return this.receipt(saved);
		try {
			return await this.store.withLock(key, requestId, async () => {
				const record = await this.store.read(requestId);
				if (!record) throw new FrontendError("request_missing", "The saved request disappeared.");
				this.bound(route, record);
				if (record.status === "prepared") {
					// Sending is durably saved before the only click, so this intent never sent.
					record.status = "failed_presend";
					record.code = "presend_interrupted";
					await this.store.write(record);
					return this.receipt(record);
				}
				if (record.status === "completed") return this.receipt(record);
				const observation = await this.observe(route);
				const baseline = observation.messages
					.slice(0, record.baseline.length)
					.map((message) => message.id);
				const fresh = observation.messages.slice(record.baseline.length);
				if (
					JSON.stringify(baseline) !== JSON.stringify(record.baseline) ||
					fresh.length > 2 ||
					(fresh[0] && (fresh[0].role !== "user" || fresh[0].text !== record.text)) ||
					(fresh[1] && fresh[1].role !== "assistant")
				)
					return { ...this.receipt(record), code: "continuity_mismatch" };
				if (
					fresh.length === 2 &&
					fresh[1].text.trim() &&
					!observation.generating &&
					observation.composer === ""
				) {
					record.status = "completed";
					record.userMessageId = fresh[0].id;
					record.assistantMessageId = fresh[1].id;
					record.output = fresh[1].text;
					record.code = null;
					await this.store.write(record);
				}
				return this.receipt(record);
			});
		} catch (error) {
			if (error instanceof FrontendError && error.code.startsWith("lock_"))
				return { ...this.receipt(saved), lockState: error.code };
			throw error;
		}
	}
}
