import { z } from "zod";
import { grokMessagesExpression } from "./grok.js";
import { FrontendError, type FrontendRoute } from "./types.js";

/** Exact, opt-in provider label; native DOM grounding remains unverified. */
export const GROK_HEAVY_MODEL = "Heavy";
type Request = (value: Record<string, unknown>) => Promise<Record<string, unknown>>;

function inspectGrokModelMenu(doc: Document) {
	const visible = (node: Element) => {
		const style = doc.defaultView?.getComputedStyle?.(node);
		return (
			!node.closest('[hidden],[aria-hidden="true"]') &&
			style?.display !== "none" &&
			style?.visibility !== "hidden" &&
			node.getClientRects().length > 0
		);
	};
	const all = (query: string, scope: Document | Element = doc) =>
		Array.from(scope.querySelectorAll(query)).filter(visible);
	const one = (nodes: Element[]) => (nodes.length === 1 ? nodes[0] : null);
	const path = (node: Element | null) => {
		if (!node) return null;
		const parts: string[] = [];
		for (let el: Element | null = node; el; el = el.parentElement) {
			const index = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) + 1 : 1;
			parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${index})`);
		}
		return parts.join(" > ");
	};
	const hit = (node: Element | null) => {
		if (!node) return false;
		const r = node.getBoundingClientRect();
		if (
			r.width <= 0 ||
			r.height <= 0 ||
			r.left < 0 ||
			r.top < 0 ||
			r.right > innerWidth ||
			r.bottom > innerHeight
		)
			return false;
		const top = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return !!top && (top === node || node.contains(top));
	};
	const composers = all(
		'div[contenteditable="true"][aria-label="Ask Grok anything"][role="combobox"],div[contenteditable="true"][aria-label="Ask Grok anything"][role="textbox"]',
	).filter((n) => n.closest("form") && !n.closest('[role="dialog"],[aria-modal="true"]'));
	const form = one(composers)?.closest("form");
	const model = form ? one(all('button[aria-label^="Model: "]', form)) : null;
	const modelOpen = model?.getAttribute("aria-expanded") === "true";
	const menus = all('[role="menu"],[role="listbox"]');
	const choices = menus.flatMap((menu) =>
		all('[role="menuitemradio"],[role="menuitem"],[role="option"]', menu),
	);
	return {
		modelSelector: path(model),
		modelHit: hit(model),
		modelOpen,
		modelDisabled: !model || !!model.closest('[disabled],[aria-disabled="true"]'),
		menuCount: menus.length,
		foreignMenu: menus.length > 1 || (!modelOpen && menus.length > 0),
		dialogPresent: all('[role="dialog"],[aria-modal="true"]').length > 0,
		choices: choices.map((node) => ({
			label: node.getAttribute("aria-label") ?? node.textContent ?? "",
			selector: path(node),
			hit: hit(node),
			disabled: !!node.closest('[disabled],[aria-disabled="true"]'),
			anchor: node.tagName === "A" || !!node.closest("a[href]") || !!node.querySelector("a[href]"),
			upsell: /upgrade|subscribe|subscription|purchase|unlock/i.test(
				`${node.textContent ?? ""} ${node.getAttribute("aria-label") ?? ""}`,
			),
		})),
	};
}

const schema = z.object({
	url: z.string(),
	model: z.string().max(256).nullable(),
	composer: z.string().nullable(),
	composerEmpty: z.boolean(),
	composerReady: z.boolean(),
	scopeCount: z.number().int(),
	challengePresent: z.boolean(),
	loginPresent: z.boolean(),
	accountPresent: z.boolean(),
	generating: z.boolean(),
	modelSelector: z.string().min(1).max(2048).nullable(),
	modelHit: z.boolean(),
	modelOpen: z.boolean(),
	modelDisabled: z.boolean(),
	menuCount: z.number().int(),
	foreignMenu: z.boolean(),
	dialogPresent: z.boolean(),
	choices: z
		.array(
			z.object({
				label: z.string().max(256),
				selector: z.string().min(1).max(2048),
				hit: z.boolean(),
				disabled: z.boolean(),
				anchor: z.boolean(),
				upsell: z.boolean(),
			}),
		)
		.max(50),
});

/** Match the message recipe's closed Grok root/conversation and transient rid rule. */
function conversationUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (value === "https://grok.com/" || /^https:\/\/grok\.com\/c\/[a-zA-Z0-9_-]+$/.test(value))
		return value;
	try {
		const u = new URL(value),
			entries = Array.from(u.searchParams.entries());
		const canonical = u.origin + u.pathname;
		if (
			u.protocol !== "https:" ||
			u.hostname !== "grok.com" ||
			u.port ||
			u.username ||
			u.password ||
			value.includes("#") ||
			!/^https:\/\/grok\.com\/c\/[a-zA-Z0-9_-]+$/.test(canonical) ||
			entries.length !== 1 ||
			entries[0][0] !== "rid" ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entries[0][1])
		)
			return null;
		return canonical;
	} catch {
		return null;
	}
}

export function grokControlsExpression(): string {
	return `(({messages,...state})=>({...state,...(${inspectGrokModelMenu.toString()})(document)}))(${grokMessagesExpression()})`;
}

async function observe(route: FrontendRoute, request: Request) {
	const expression = grokControlsExpression();
	const result = await request({
		action: "probe",
		timeoutMs: 5000,
		maxReturnBytes: 16384,
		probe: {
			recipeId: "auracall-grok-heavy-v1",
			detectors: [{ id: "frontend", type: "evaluate", expression }],
		},
	});
	if (result.targetId !== route.serviceTabHandle.targetId)
		throw new FrontendError("target_mismatch", "The retained Grok target changed.");
	if (result.ok !== true || conversationUrl(result.url) !== route.expectedUrl)
		throw new FrontendError("origin_mismatch", "The retained Grok conversation changed.");
	const detectors = result.detectors as {
		id?: unknown;
		ok?: unknown;
		resultTruncated?: unknown;
		result?: unknown;
	}[];
	if (
		!Array.isArray(detectors) ||
		detectors.length !== 1 ||
		detectors[0].id !== "frontend" ||
		detectors[0].ok !== true ||
		detectors[0].resultTruncated === true
	)
		throw new FrontendError("probe_failed", "Complete Grok control evidence is required.");
	const parsed = schema.safeParse(detectors[0].result);
	if (!parsed.success) throw new FrontendError("probe_failed", "Grok control evidence is invalid.");
	const o = parsed.data;
	const failure = (code: string, message: string) =>
		new FrontendError(code, message, o.modelOpen ? true : undefined);
	if (o.url !== result.url || conversationUrl(o.url) !== route.expectedUrl)
		throw failure("origin_mismatch", "The Grok URL changed during inspection.");
	if (o.challengePresent)
		throw failure("human_verification", "Human verification requires operator interaction.");
	if (o.loginPresent || !o.accountPresent)
		throw failure("login_required", "A signed-in frontend is required.");
	if (o.dialogPresent || o.foreignMenu)
		throw failure("unexpected_dialog", "Close the unrelated dialog or menu first.");
	if (o.scopeCount !== 1 || !o.model || !o.modelSelector || o.modelDisabled || !o.composerReady)
		throw failure(
			"selector_missing",
			"A unique enabled Grok model control and composer are required.",
		);
	if (!o.composerEmpty || o.composer !== "" || o.generating)
		throw failure("composer_busy", "The composer must be empty and generation stopped.");
	return o;
}

function state(route: FrontendRoute, o: z.infer<typeof schema>) {
	return {
		ok: true,
		routeId: route.id,
		provider: "grok",
		model: o.model,
		effort: o.model === GROK_HEAVY_MODEL ? "heavy" : null,
		grounding: "unverified-grounding",
		liveVerified: false,
	};
}

export async function inspectGrokHeavy(route: FrontendRoute, request: Request) {
	return state(route, await observe(route, request));
}

export async function configureGrokHeavy(
	route: FrontendRoute,
	effort: string,
	request: Request,
	maxSteps: number,
) {
	if (effort !== "heavy")
		throw new FrontendError(
			"unknown_effort",
			"Grok Heavy selects the Heavy model; other efforts are unsupported.",
		);
	let menuMayBeOpen = false;
	try {
		let o = await observe(route, request),
			steps = 0;
		menuMayBeOpen = o.modelOpen;
		const initialUrl = o.url;
		const click = async (selector: string | null, hit: boolean) => {
			if (!selector || !hit)
				throw new FrontendError(
					"blocked_overlay",
					"The model control is unavailable, covered or outside the viewport.",
				);
			if (++steps > Math.min(3, maxSteps))
				throw new FrontendError(
					"step_bound_exceeded",
					"The bounded Grok control recipe is exhausted.",
				);
			menuMayBeOpen = true;
			const r = await request({
				action: "ui_action",
				timeoutMs: 5000,
				maxTextBytes: 1024,
				uiAction: { maxActions: 1, steps: [{ type: "click", selector }] },
			});
			const actions = r.steps as { index?: unknown; type?: unknown; ok?: unknown }[];
			if (
				r.ok !== true ||
				r.targetId !== route.serviceTabHandle.targetId ||
				!Array.isArray(actions) ||
				actions.length !== 1 ||
				actions[0].index !== 0 ||
				actions[0].type !== "click" ||
				actions[0].ok !== true
			)
				throw new FrontendError(
					"ui_action_failed",
					"The model input was not confirmed; do not replay it.",
				);
			try {
				o = await observe(route, request);
			} catch {
				throw new FrontendError("readback_mismatch", "The Grok model action has no safe readback.");
			}
			if (o.url !== initialUrl || r.url !== initialUrl)
				throw new FrontendError("readback_mismatch", "The model action changed the URL.");
		};
		if (o.model !== GROK_HEAVY_MODEL) {
			if (!o.modelOpen) await click(o.modelSelector, o.modelHit);
			const choices = o.choices.filter((c) => c.label === GROK_HEAVY_MODEL);
			if (
				!o.modelOpen ||
				o.menuCount !== 1 ||
				choices.length !== 1 ||
				choices[0].disabled ||
				choices[0].anchor ||
				choices[0].upsell
			)
				throw new FrontendError(
					"effort_unavailable",
					"The exact Heavy menu choice is missing, ambiguous, disabled or gated.",
				);
			await click(choices[0].selector, choices[0].hit);
		}
		if (o.model !== GROK_HEAVY_MODEL)
			throw new FrontendError("readback_mismatch", "The Heavy model was not visibly selected.");
		if (o.modelOpen) await click(o.modelSelector, o.modelHit);
		if (o.model !== GROK_HEAVY_MODEL || o.modelOpen || o.menuCount !== 0 || o.url !== initialUrl)
			throw new FrontendError(
				"readback_mismatch",
				"The Heavy model needs an exact closed-menu readback.",
			);
		return { ...state(route, o), effort: "heavy", verified: true, uiSteps: steps };
	} catch (error) {
		throw new FrontendError(
			error instanceof FrontendError ? error.code : "ui_action_failed",
			error instanceof FrontendError
				? error.message
				: "Grok model input is uncertain; do not replay it.",
			menuMayBeOpen || (error instanceof FrontendError && error.menuMayBeOpen === true)
				? true
				: undefined,
		);
	}
}
