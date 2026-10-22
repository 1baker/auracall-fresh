import { z } from "zod";
import { createHash } from "node:crypto";
import { grokMessagesExpression } from "./grok.js";
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
	model: z.string().nullable(),
	composer: z.string().nullable(),
	composerReady: z.boolean(),
	sendReady: z.boolean(),
	generating: z.boolean(),
	messages: z
		.array(
			z.object({
				id: z.string().min(1).max(256).nullable(),
				role: z.enum(["user", "assistant"]),
				text: z.string().max(64000),
			}),
		)
		.max(200),
	composerSelector: z.string().min(1).max(2048).nullable().optional(),
	sendSelector: z.string().min(1).max(2048).nullable().optional(),
	composerHit: z.boolean().optional(),
	sendHit: z.boolean().optional(),
	challengePresent: z.boolean().optional(),
	loginPresent: z.boolean().optional(),
	accountPresent: z.boolean().optional(),
	ambiguousMessages: z.boolean().optional(),
	composerEmpty: z.boolean().optional(),
	scopeCount: z.number().int().nonnegative().optional(),
});
type Observation = Omit<z.infer<typeof observationSchema>, "messages"> & {
	messages: { id: string; role: "user" | "assistant"; text: string }[];
};
interface MessageRecipe {
	root: string;
	conversation: RegExp;
	expression(): string;
}
const recipes: Record<FrontendRoute["provider"], MessageRecipe> = {
	chatgpt: {
		root: "https://chatgpt.com/",
		conversation: /^https:\/\/chatgpt\.com\/c\/[a-zA-Z0-9_-]+$/,
		expression: chatgptMessagesExpression,
	},
	grok: {
		root: "https://grok.com/",
		conversation: /^https:\/\/grok\.com\/c\/[a-zA-Z0-9_-]+$/,
		expression: grokMessagesExpression,
	},
};
const isRootUrl = (route: FrontendRoute, value: string) => value === recipes[route.provider].root;
const isConversationUrl = (route: FrontendRoute, value: unknown): value is string =>
	typeof value === "string" && recipes[route.provider].conversation.test(value);
const derivedKey = (index: number, role: string, text: string) =>
	createHash("sha256")
		.update(JSON.stringify([index, role, text]))
		.digest("hex");
interface MessageOperations {
	request(route: FrontendRoute, request: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class FrontendMessages {
	constructor(
		private readonly store: FrontendRequestStore,
		private readonly operations: MessageOperations,
	) {}
	private bound(route: FrontendRoute, record: FrontendRequestRecord): void {
		if (
			record.binding !== frontendRouteBinding(route) ||
			record.targetKey !== frontendTargetKey(route)
		)
			throw new FrontendError(
				"request_binding_mismatch",
				"The saved request belongs to a different retained route.",
			);
		if (
			(route.provider === "grok" &&
				(record.identityKind !== "derived_sequence" ||
					record.userMessageId !== null ||
					record.assistantMessageId !== null)) ||
			(route.provider === "chatgpt" && record.identityKind === "derived_sequence")
		)
			throw new FrontendError(
				"record_invalid",
				"The saved message identity contract does not match this provider.",
			);
	}
	private receipt(record: FrontendRequestRecord): Record<string, unknown> {
		const {
			requestId,
			routeId,
			previousRequestId,
			conversationUrl,
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
			conversationUrl,
			status,
			userMessageId,
			assistantMessageId,
			output,
			code,
			identityKind: record.identityKind ?? "native",
			...(record.identityKind === "derived_sequence"
				? {
						observedUserKey: record.observedUserKey ?? null,
						observedAssistantKey: record.observedAssistantKey ?? null,
						generationSignal: "unverified",
					}
				: {}),
			liveVerified: false,
		};
	}
	private async observe(
		route: FrontendRoute,
		allowFirstConversation = false,
		allowScopeChurn = false,
	): Promise<Observation> {
		const result = await this.operations.request(route, {
			action: "probe",
			timeoutMs: 5000,
			maxReturnBytes: 98304,
			probe: {
				recipeId: `auracall-${route.provider}-messages-v1`,
				detectors: [
					{ id: "messages", type: "evaluate", expression: recipes[route.provider].expression() },
				],
			},
		});
		if (result.targetId !== route.serviceTabHandle.targetId)
			throw new FrontendError("target_mismatch", "The retained target changed.");
		if (
			result.ok !== true ||
			(result.url !== route.expectedUrl &&
				!(
					allowFirstConversation &&
					isRootUrl(route, route.expectedUrl) &&
					isConversationUrl(route, result.url)
				))
		)
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
		const raw = parsed.data;
		if (route.provider === "grok") {
			if (raw.challengePresent !== false)
				throw new FrontendError(
					"human_verification",
					"Human verification requires operator interaction.",
				);
			if (raw.loginPresent !== false || raw.accountPresent !== true)
				throw new FrontendError("login_required", "A signed-in frontend is required.");
			if (raw.scopeCount !== 1 && !allowScopeChurn)
				throw new FrontendError(
					"unsupported_scope",
					"A unique visible conversation scope is required.",
				);
			if (raw.ambiguousMessages !== false)
				throw new FrontendError("probe_failed", "Conversation rows are ambiguous.");
			if (raw.scopeCount === 1 && (!raw.composerSelector || !raw.composerReady))
				throw new FrontendError(
					"composer_unavailable",
					"A unique enabled Grok composer is required.",
				);
		}
		if (route.provider === "chatgpt" && raw.model === null)
			throw new FrontendError("probe_failed", "The visible model is unavailable.");
		const observation: Observation = {
			...raw,
			messages: raw.messages.map((message, index) => {
				const id =
					route.provider === "grok" ? derivedKey(index, message.role, message.text) : message.id;
				if (!id) throw new FrontendError("probe_failed", "Native message identities are missing.");
				return {
					...message,
					id,
				};
			}),
		};
		if (observation.url !== result.url)
			throw new FrontendError("origin_mismatch", "The conversation URL changed.");
		if (route.provider === "grok" && observation.scopeCount !== 1 && allowScopeChurn)
			return observation;
		if (observation.model !== route.expectedModel)
			throw new FrontendError("model_drift", "The visible model changed.");
		if (
			new Set(observation.messages.map((message) => message.id)).size !==
			observation.messages.length
		)
			throw new FrontendError("probe_failed", "Message identities are ambiguous.");
		return observation;
	}
	private async ui(
		route: FrontendRoute,
		type: "fill" | "click",
		value?: string,
		control?: string | null,
	): Promise<void> {
		const result = await this.operations.request(route, {
			action: "ui_action",
			timeoutMs: 5000,
			maxTextBytes: 1024,
			uiAction: {
				maxActions: 1,
				steps: [
					{
						type,
						selector:
							control ??
							(type === "fill" ? "#prompt-textarea" : 'button[data-testid="send-button"]'),
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
		if (!isRootUrl(route, route.expectedUrl) && !isConversationUrl(route, route.expectedUrl))
			throw new FrontendError(
				"invalid_route",
				"Configure the exact provider root or a supported conversation URL.",
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
			let activeRoute = route;
			let previous: FrontendRequestRecord | null = null;
			if (previousRequestId) {
				previous = await this.store.read(previousRequestId);
				if (!previous)
					throw new FrontendError("previous_missing", "The previous request does not exist.");
				this.bound(route, previous);
				const previousUrl =
					previous.conversationUrl ??
					(previous.conversationUrl === undefined && isConversationUrl(route, route.expectedUrl)
						? route.expectedUrl
						: null);
				if (previous.status !== "completed" || !isConversationUrl(route, previousUrl))
					throw new FrontendError(
						"continuity_mismatch",
						"The previous request needs a completed, bound conversation.",
					);
				activeRoute = { ...route, expectedUrl: previousUrl };
			}
			const observation = await this.observe(activeRoute);
			if (route.provider === "grok") {
				if (!observation.composerSelector || !observation.composerReady)
					throw new FrontendError(
						"composer_unavailable",
						"A unique enabled Grok composer is required.",
					);
				if (!observation.composerHit)
					throw new FrontendError(
						"blocked_overlay",
						"The composer is outside the viewport or covered.",
					);
			}
			if (
				!observation.composerReady ||
				observation.composer !== "" ||
				observation.generating ||
				(route.provider === "grok" && observation.composerEmpty !== true)
			)
				throw new FrontendError(
					"composer_busy",
					"The composer must be empty and generation stopped.",
				);
			if (isRootUrl(route, activeRoute.expectedUrl) && observation.messages.length !== 0)
				throw new FrontendError(
					"conversation_not_empty",
					"A fresh root page must have no messages.",
				);
			if (previous) {
				if (
					previous.status !== "completed" ||
					observation.messages.at(-1)?.id !==
						(previous.observedAssistantKey ?? previous.assistantMessageId) ||
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
				conversationUrl: isConversationUrl(route, activeRoute.expectedUrl)
					? activeRoute.expectedUrl
					: null,
				status: "prepared",
				baseline: observation.messages.map((message) => message.id),
				userMessageId: null,
				assistantMessageId: null,
				output: null,
				code: null,
				...(route.provider === "grok"
					? {
							identityKind: "derived_sequence" as const,
							observedUserKey: null,
							observedAssistantKey: null,
							candidate: null,
						}
					: {}),
			};
			await this.store.write(record, true);
			let sendSelector: string | null | undefined;
			try {
				await this.ui(activeRoute, "fill", text, observation.composerSelector);
				const filled = await this.observe(activeRoute);
				if (route.provider === "grok") {
					if (!filled.sendSelector || !filled.sendReady)
						throw new FrontendError(
							"send_unavailable",
							"A unique enabled Grok Send control is required.",
						);
					if (!filled.sendHit)
						throw new FrontendError(
							"blocked_overlay",
							"The Send control is outside the viewport or covered.",
						);
					sendSelector = filled.sendSelector;
				}
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
			} catch (error) {
				record.status = "failed_presend";
				record.code =
					route.provider === "grok" && error instanceof FrontendError
						? error.code
						: "presend_unconfirmed";
				await this.store.write(record);
				return this.receipt(record);
			}
			record.status = "sending";
			await this.store.write(record);
			try {
				await this.ui(activeRoute, "click", undefined, sendSelector);
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
				const adopting = isRootUrl(route, route.expectedUrl) && record.conversationUrl === null;
				if (adopting && record.baseline.length !== 0)
					throw new FrontendError(
						"record_invalid",
						"A fresh-chat receipt must have an empty baseline.",
					);
				if (
					(isRootUrl(route, route.expectedUrl) && record.conversationUrl === undefined) ||
					(record.conversationUrl != null &&
						(!isConversationUrl(route, record.conversationUrl) ||
							(!isRootUrl(route, route.expectedUrl) &&
								record.conversationUrl !== route.expectedUrl)))
				)
					throw new FrontendError(
						"record_invalid",
						"The saved conversation binding is invalid; it was preserved.",
					);
				const activeRoute = { ...route, expectedUrl: record.conversationUrl ?? route.expectedUrl };
				const observation = await this.observe(activeRoute, adopting, route.provider === "grok");
				if (route.provider === "grok" && observation.scopeCount !== 1) {
					record.candidate = null;
					await this.store.write(record);
					return { ...this.receipt(record), code: "unsupported_scope" };
				}
				if (route.provider === "grok" && observation.messages.length === 0) {
					record.candidate = null;
					await this.store.write(record);
					return this.receipt(record);
				}
				const baseline = observation.messages
					.slice(0, record.baseline.length)
					.map((message) => message.id);
				const fresh = observation.messages.slice(record.baseline.length);
				if (
					JSON.stringify(baseline) !== JSON.stringify(record.baseline) ||
					fresh.length > 2 ||
					(fresh[0] && (fresh[0].role !== "user" || fresh[0].text !== record.text)) ||
					(fresh[1] && fresh[1].role !== "assistant")
				) {
					if (adopting || route.provider === "grok") {
						record.status = "uncertain";
						record.code = "continuity_mismatch";
						if (route.provider === "grok") record.candidate = null;
						await this.store.write(record);
					}
					return { ...this.receipt(record), code: "continuity_mismatch" };
				}
				if (adopting && isConversationUrl(route, observation.url)) {
					if (!fresh[0]) {
						record.status = "uncertain";
						record.code = "continuity_mismatch";
						await this.store.write(record);
						return this.receipt(record);
					}
					record.conversationUrl = observation.url;
					await this.store.write(record);
				}
				const ready =
					fresh.length === 2 &&
					(!isRootUrl(route, route.expectedUrl) ||
						isConversationUrl(route, record.conversationUrl)) &&
					!!fresh[1].text.trim() &&
					!observation.generating &&
					observation.composer === "" &&
					(route.provider !== "grok" || observation.composerEmpty === true);
				if (route.provider === "grok") {
					if (!ready) {
						record.candidate = null;
						await this.store.write(record);
						return this.receipt(record);
					}
					if (record.candidate?.key !== fresh[1].id) {
						record.candidate = { key: fresh[1].id, at: Date.now() };
						await this.store.write(record);
						return this.receipt(record);
					}
					if (Date.now() - record.candidate.at < 1000) return this.receipt(record);
				}
				if (ready) {
					record.status = "completed";
					if (route.provider === "grok") {
						record.observedUserKey = fresh[0].id;
						record.observedAssistantKey = fresh[1].id;
						record.candidate = null;
					} else {
						record.userMessageId = fresh[0].id;
						record.assistantMessageId = fresh[1].id;
					}
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
