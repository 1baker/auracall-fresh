import { z } from "zod";
import { FrontendError, type FrontendRoute } from "./types.js";

/** Product labels are documented; selectors/current-model availability have no live grounding. */
export const claudeFrontendRecipe = {
	grounding: "unverified-grounding",
	model: 'button[data-testid="model-selector-dropdown"]',
	composer: 'div.ProseMirror[contenteditable="true"][role="textbox"]',
	send: 'button[aria-label="Send message"]',
	effortLabel: '[aria-label="Effort"]',
	choices: '[role="menuitemradio"]',
	user: '[data-testid="user-message"]',
	assistant: '[data-testid="assistant-message"], .font-claude-response',
	labels: [
		["Low", "low"],
		["Medium", "medium"],
		["High", "high"],
		["Extra high", "xhigh"],
		["Max", "max"],
	],
} as const;
export type ClaudeFrontendEffort = "low" | "medium" | "high" | "xhigh" | "max";

export function isClaudeFrontendUrl(value: string): boolean {
	return /^https:\/\/claude\.ai\/(?:new|chat\/[a-zA-Z0-9_-]+)$/.test(value);
}

/** Serialized, bounded, read-only semantic DOM recipe; all input is broker-owned. */
export function inspectClaudePage(
	doc: Document,
	url: string,
	recipe: typeof claudeFrontendRecipe,
	messages: boolean,
) {
	const visible = (node: Element) => {
		const style = doc.defaultView?.getComputedStyle?.(node);
		return (
			!node.closest('[hidden],[aria-hidden="true"]') &&
			style?.display !== "none" &&
			style?.visibility !== "hidden" &&
			node.getClientRects().length > 0
		);
	};
	const all = (selector: string, scope: Document | Element = doc) =>
		Array.from(scope.querySelectorAll(selector)).filter(visible);
	const one = (nodes: Element[]) => (nodes.length === 1 ? nodes[0] : null);
	const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim() ?? null;
	const disabled = (node: Element | null) =>
		!node ||
		node.hasAttribute("disabled") ||
		node.hasAttribute("readonly") ||
		node.getAttribute("aria-disabled") === "true";
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
	const scopes = Array.from(new Set(all('main,[role="main"]')));
	const scope = one(scopes);
	const composer = scope ? one(all(recipe.composer, scope)) : null;
	const model = scope ? one(all(recipe.model, scope)) : null;
	const send = scope ? one(all(recipe.send, scope)) : null;
	const content = composer
		? ((composer as HTMLElement).innerText ?? composer.textContent ?? "")
		: null;
	const children = composer ? Array.from(composer.childNodes) : [];
	const paragraph =
		children.length === 1 && children[0].nodeType === 1 ? (children[0] as Element) : null;
	const structurallyEmpty =
		!!composer &&
		composer.textContent === "" &&
		(children.length === 0 ||
			(paragraph?.tagName === "P" &&
				paragraph.childNodes.length === 1 &&
				paragraph.firstChild?.nodeType === 1 &&
				(paragraph.firstChild as Element).tagName === "BR"));
	const composerEmpty = structurallyEmpty && content !== null && /^[\r\n]*$/.test(content);
	const buttons = all("button,a");
	const loginPresent = buttons.some((n) =>
		/^(?:log in|sign in|sign up|continue with (?:Google|email|SSO))$/i.test(text(n) ?? ""),
	);
	const challengePresent =
		all(
			'iframe[src*="captcha"],iframe[src*="challenges.cloudflare"],[id*="captcha"],[id^="challenge-"]',
		).length > 0 || /just a moment|verify.*human|checking.*browser/i.test(doc.title);
	const accountPresent =
		all('button[aria-label*="account" i],button[aria-label*="profile" i]').length > 0;
	const dialogPresent = all('[role="dialog"],[aria-modal="true"]').length > 0;
	const generating =
		dialogPresent ||
		all('[aria-busy="true"],[data-is-streaming="true"]').length > 0 ||
		buttons.some((n) => /stop (?:generating|response)/i.test(n.getAttribute("aria-label") ?? ""));
	const modelOpen = model?.getAttribute("aria-expanded") === "true";
	const menus = all('[role="menu"],[role="listbox"]');
	const menuItems = menus.flatMap((n) => all('[role^="menuitem"],[role="option"]', n));
	const effort = modelOpen ? one(menuItems.filter((n) => text(n) === "Effort")) : null;
	const choiceNodes = modelOpen
		? Array.from(new Set(menus.flatMap((n) => all(recipe.choices, n))))
		: [];
	const labels = scope
		? all(recipe.effortLabel, scope).filter((n) => !n.closest('[role="menu"],[role="listbox"]'))
		: [];
	const selected = choiceNodes.filter((n) => n.getAttribute("aria-checked") === "true");
	const badge = one(labels);
	const selectedLabel = text(one(selected));
	const badgeLabel = text(badge);
	const effortLabel = badgeLabel ?? selectedLabel;
	const rows: { id: null; role: "user" | "assistant"; text: string }[] = [];
	let ambiguousMessages = false;
	if (messages && scope) {
		const candidates = all(`${recipe.user},${recipe.assistant}`, scope).filter(
			(n) =>
				!n.closest(
					'form,nav,aside,[role="dialog"],[aria-modal="true"],[data-testid="thinking"],[data-testid="artifact"]',
				),
		);
		for (const node of candidates) {
			const parent = node.parentElement?.closest(`${recipe.user},${recipe.assistant}`);
			if (parent && candidates.includes(parent)) continue;
			const user = node.matches(recipe.user),
				assistant = node.matches(recipe.assistant);
			if (user === assistant) {
				ambiguousMessages = true;
				continue;
			}
			rows.push({
				id: null,
				role: user ? "user" : "assistant",
				text: (node as HTMLElement).innerText ?? node.textContent ?? "",
			});
		}
	}
	return {
		url,
		model: text(model),
		composer: composerEmpty ? "" : content,
		composerEmpty,
		composerReady: !disabled(composer),
		sendReady: !disabled(send),
		generating: generating || (messages && modelOpen),
		composerSelector: path(composer),
		sendSelector: path(send),
		composerHit: hit(composer),
		sendHit: hit(send),
		scopeCount: scopes.length,
		challengePresent,
		loginPresent,
		accountPresent,
		ambiguousMessages,
		messages: rows,
		dialogPresent,
		modelSelector: path(model),
		modelHit: hit(model),
		modelOpen,
		effortSelector: path(effort),
		effortHit: hit(effort),
		effortLabel,
		inconsistentEffort:
			labels.length > 1 ||
			selected.length > 1 ||
			(badgeLabel !== null && selectedLabel !== null && badgeLabel !== selectedLabel),
		foreignMenu: menus.length > 0 && !modelOpen,
		choices: choiceNodes.map((n) => ({
			label: text(n),
			selector: path(n),
			disabled: disabled(n),
			hit: hit(n),
		})),
	};
}

export const claudeInspectionExpression = (messages = false) =>
	`(${inspectClaudePage.toString()})(document,location.href,${JSON.stringify(claudeFrontendRecipe)},${messages})`;
export const claudeMessagesExpression = () => claudeInspectionExpression(true);

type Request = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
const selector = z.string().min(1).max(2048).nullable();
const schema = z.object({
	url: z.string(),
	model: z.string().nullable(),
	composer: z.string().nullable(),
	composerEmpty: z.boolean(),
	composerReady: z.boolean(),
	generating: z.boolean(),
	scopeCount: z.number().int().nonnegative(),
	challengePresent: z.boolean(),
	loginPresent: z.boolean(),
	accountPresent: z.boolean(),
	dialogPresent: z.boolean(),
	modelSelector: selector,
	modelHit: z.boolean(),
	modelOpen: z.boolean(),
	effortSelector: selector,
	effortHit: z.boolean(),
	effortLabel: z.string().nullable(),
	inconsistentEffort: z.boolean(),
	foreignMenu: z.boolean(),
	choices: z
		.array(
			z.object({ label: z.string().nullable(), selector, disabled: z.boolean(), hit: z.boolean() }),
		)
		.max(10),
});
const effortForLabel = (label: string | null): ClaudeFrontendEffort | null =>
	claudeFrontendRecipe.labels.find(([key]) => key === label)?.[1] ?? null;

async function observe(route: FrontendRoute, request: Request) {
	const result = await request({
		action: "probe",
		timeoutMs: 5000,
		maxReturnBytes: 16384,
		probe: {
			recipeId: "auracall-claude-controls-v1",
			detectors: [{ id: "frontend", type: "evaluate", expression: claudeInspectionExpression() }],
		},
	});
	if (result.targetId !== route.serviceTabHandle.targetId)
		throw new FrontendError("target_mismatch", "The retained target changed.");
	if (result.ok !== true || result.url !== route.expectedUrl)
		throw new FrontendError("origin_mismatch", "The retained Claude page changed.");
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
		throw new FrontendError("probe_failed", "Complete Claude control evidence is required.");
	const parsed = schema.safeParse(detectors[0].result);
	if (!parsed.success)
		throw new FrontendError("probe_failed", "Claude control evidence is invalid.");
	const o = parsed.data;
	if (o.url !== route.expectedUrl)
		throw new FrontendError("origin_mismatch", "The frontend URL changed.");
	if (o.challengePresent)
		throw new FrontendError(
			"human_verification",
			"Human verification requires operator interaction.",
		);
	if (o.loginPresent || !o.accountPresent)
		throw new FrontendError("login_required", "A signed-in frontend is required.");
	if (o.dialogPresent || o.foreignMenu)
		throw new FrontendError("unexpected_dialog", "Close the unrelated dialog or menu first.");
	if (o.scopeCount !== 1 || !o.modelSelector || !o.composerReady)
		throw new FrontendError(
			"selector_missing",
			"A unique Claude model control and composer are required.",
		);
	if (o.model !== route.expectedModel)
		throw new FrontendError("model_drift", "The visible model changed.");
	if (!o.composerEmpty || o.composer !== "" || o.generating)
		throw new FrontendError("composer_busy", "The composer must be empty and generation stopped.");
	return o;
}

function publicState(route: FrontendRoute, o: z.infer<typeof schema>) {
	return {
		ok: true,
		routeId: route.id,
		provider: "claude",
		model: o.model,
		effort: effortForLabel(o.effortLabel),
		label: o.effortLabel,
		availableEfforts: o.choices
			.filter((c) => !c.disabled)
			.map((c) => effortForLabel(c.label))
			.filter((v) => v !== null),
		grounding: claudeFrontendRecipe.grounding,
		liveVerified: false,
	};
}
export async function inspectClaudeControls(
	route: FrontendRoute,
	request: Request,
): Promise<Record<string, unknown>> {
	return publicState(route, await observe(route, request));
}
export async function configureClaudeEffort(
	route: FrontendRoute,
	effort: string,
	request: Request,
	maxSteps: number,
): Promise<Record<string, unknown>> {
	if (!claudeFrontendRecipe.labels.some(([, value]) => value === effort))
		throw new FrontendError("unknown_effort", "Choose a documented Claude effort level.");
	let o = await observe(route, request),
		steps = 0;
	const unsupported = () => ({
		...publicState(route, o),
		ok: false,
		code: "effort_unsupported_for_model",
		...(o.modelOpen ? { menuMayBeOpen: true } : {}),
	});
	if (o.inconsistentEffort)
		throw new FrontendError("readback_mismatch", "Visible effort states disagree.");
	if (o.effortLabel !== null && effortForLabel(o.effortLabel) === null) return unsupported();
	const click = async (control: string | null, hit: boolean) => {
		if (!control)
			throw new FrontendError("selector_missing", "The requested Claude control is unavailable.");
		if (!hit)
			throw new FrontendError("blocked_overlay", "The control is outside the viewport or covered.");
		if (++steps > maxSteps)
			throw new FrontendError("step_bound_exceeded", "The bounded control recipe is exhausted.");
		const r = await request({
			action: "ui_action",
			timeoutMs: 5000,
			maxTextBytes: 1024,
			uiAction: { maxActions: 1, steps: [{ type: "click", selector: control }] },
		});
		const a = r.steps as { index?: unknown; type?: unknown; ok?: unknown }[];
		if (
			r.ok !== true ||
			r.targetId !== route.serviceTabHandle.targetId ||
			!Array.isArray(a) ||
			a.length !== 1 ||
			a[0].index !== 0 ||
			a[0].type !== "click" ||
			a[0].ok !== true
		)
			throw new FrontendError(
				"ui_action_failed",
				"The native control action is uncertain; do not replay it.",
			);
		o = await observe(route, request);
		if (o.inconsistentEffort)
			throw new FrontendError("readback_mismatch", "Visible effort states disagree.");
	};
	try {
		if (effortForLabel(o.effortLabel) !== effort) {
			if (!o.modelOpen) await click(o.modelSelector, o.modelHit);
			if (!o.modelOpen)
				throw new FrontendError("selector_missing", "The model menu did not become visible.");
			if (o.choices.length === 0) {
				if (!o.effortSelector) {
					await click(o.modelSelector, o.modelHit);
					if (o.modelOpen)
						throw new FrontendError("readback_mismatch", "The model menu did not close.");
					return unsupported();
				}
				await click(o.effortSelector, o.effortHit);
			}
			const choices = o.choices.filter((c) => effortForLabel(c.label) === effort);
			if (choices.length !== 1)
				throw new FrontendError(
					"effort_unavailable",
					"The exact effort choice is unavailable or ambiguous.",
				);
			if (choices[0].disabled)
				throw new FrontendError("effort_unavailable", "The requested effort is disabled.");
			await click(choices[0].selector, choices[0].hit);
		}
		if (effortForLabel(o.effortLabel) !== effort)
			throw new FrontendError(
				"readback_mismatch",
				"The requested effort was not visibly selected.",
			);
		if (o.modelOpen) await click(o.modelSelector, o.modelHit);
		if (o.modelOpen || effortForLabel(o.effortLabel) !== effort)
			throw new FrontendError(
				"readback_mismatch",
				"The final effort state or closed menu was not confirmed.",
			);
		return { ...publicState(route, o), effort, verified: true, uiSteps: steps };
	} catch (error) {
		// Do not issue another native action after failure or uncertain input.
		if (error instanceof FrontendError && (steps > 0 || o.modelOpen))
			throw new FrontendError(error.code, error.message, true);
		throw error;
	}
}
