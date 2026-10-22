/** Read-only Grok DOM recipe. Native input is exclusively the broker's job. */
export function inspectGrokMessages(doc: Document, url: string) {
	const visible = (node: Element) => {
		const style = doc.defaultView?.getComputedStyle?.(node);
		return (
			!node.closest('[hidden], [aria-hidden="true"]') &&
			style?.display !== "none" &&
			style?.visibility !== "hidden" &&
			node.getClientRects().length > 0
		);
	};
	const unique = (nodes: Element[]) => (nodes.length === 1 ? nodes[0] : null);
	const disabled = (node: Element | null) =>
		!node || node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
	const label = (node: Element) => node.getAttribute("aria-label") ?? "";
	const composers = Array.from(
		doc.querySelectorAll(
			'div[contenteditable="true"][role="combobox"][aria-label="Ask Grok anything"]',
		),
	).filter(
		(node) =>
			visible(node) &&
			!node.closest('[role="dialog"], [aria-modal="true"]') &&
			node.closest("form"),
	);
	const composer = unique(composers);
	const form = composer?.closest("form");
	const buttons = form ? Array.from(form.querySelectorAll("button")).filter(visible) : [];
	const model = unique(buttons.filter((node) => /^Model: .+/.test(label(node))));
	const sends = buttons.filter(
		(node) =>
			!/^(?:Attach|Model:|Dictation|Enter voice)/i.test(label(node)) &&
			(node.getAttribute("type") === "submit" || ["Send message", "Submit"].includes(label(node))),
	);
	const send = unique(sends);
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
	const selector = (node: Element | null) => {
		if (!node) return null;
		const parts: string[] = [];
		for (let el: Element | null = node; el; el = el.parentElement) {
			const index = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) + 1 : 1;
			parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${index})`);
		}
		return parts.join(" > ");
	};
	const controls = Array.from(doc.querySelectorAll("button,a")).filter(visible);
	const challengePresent =
		/just a moment|verify you are human|checking your browser/i.test(
			`${doc.title} ${(doc.body?.innerText ?? doc.body?.textContent ?? "").slice(0, 1000)}`,
		) ||
		Array.from(
			doc.querySelectorAll(
				'iframe[src*="captcha"], iframe[src*="challenges.cloudflare"], [id*="captcha"]',
			),
		).some(visible);
	const loginPresent = controls.some((node) =>
		/^(log in|sign in|sign up)$/i.test(node.textContent?.trim() ?? ""),
	);
	const accountPresent = Array.from(
		doc.querySelectorAll(
			'button[aria-label*="profile" i],button[aria-label*="account" i],[data-testid="UserAvatar-Container"]',
		),
	).some(visible);
	const rows = new Map<Element, { id: null; role: string; text: string }>();
	const roleRows = new Set<Element>();
	const roleSelector = 'div[class*="items-end"], div[class*="items-start"]';
	let ambiguousMessages = false;
	for (const content of Array.from(
		doc.querySelectorAll('main div.message-bubble, main [class*="response-content-markdown"]'),
	).filter(visible)) {
		if (content.closest('form, nav, [role="dialog"], [aria-modal="true"]')) continue;
		const row = content.closest(roleSelector);
		if (!row) {
			ambiguousMessages = true;
			continue;
		}
		roleRows.add(row);
	}
	for (const row of roleRows) {
		const classes = row.getAttribute("class") ?? "";
		const user = classes.includes("items-end");
		const assistant = classes.includes("items-start");
		const ownedContent = (selector: string) =>
			Array.from(row.querySelectorAll(selector)).filter(
				(node) => visible(node) && node.closest(roleSelector) === row,
			);
		const markdown = ownedContent('[class*="response-content-markdown"]');
		const bubbles = ownedContent("div.message-bubble");
		const content = markdown[0] ?? bubbles[0];
		if (user === assistant || markdown.length > 1 || bubbles.length > 1 || !content) {
			ambiguousMessages = true;
			continue;
		}
		rows.set(row, {
			id: null,
			role: user ? "user" : "assistant",
			text: (content as HTMLElement).innerText ?? content.textContent ?? "",
		});
	}
	const busyCount = Array.from(doc.querySelectorAll('[aria-busy="true"]')).filter(visible).length;
	const progressCount = Array.from(doc.querySelectorAll('[role="progressbar"]')).filter(
		visible,
	).length;
	const stopCount = buttons.filter((node) =>
		/stop/i.test(`${label(node)} ${node.getAttribute("title") ?? ""} ${node.textContent ?? ""}`),
	).length;
	const dialogs = Array.from(
		new Set(doc.querySelectorAll('[role="dialog"], [aria-modal="true"]')),
	).filter(visible);
	const unexpectedDialogCount = dialogs.filter(
		(node) => !node.querySelector('button[aria-label="Dismiss cookie notice"]'),
	).length;
	return {
		url,
		model: model ? label(model).slice(7) : null,
		composer: composer ? ((composer as HTMLElement).innerText ?? composer.textContent ?? "") : null,
		composerReady: !disabled(composer),
		sendReady: !disabled(send),
		composerSelector: selector(composer),
		sendSelector: selector(send),
		composerHit: hit(composer),
		sendHit: hit(send),
		challengePresent,
		loginPresent,
		accountPresent,
		ambiguousMessages,
		diagnostics: {
			mainPresent: !!doc.querySelector("main"),
			busyCount,
			progressCount,
			stopCount,
			unexpectedDialogCount,
			visibleComposerCount: composers.length,
		},
		generating:
			Array.from(
				doc.querySelectorAll(
					'[aria-busy="true"], [role="progressbar"], [data-is-streaming="true"]',
				),
			).some(visible) ||
			buttons.some((node) =>
				/stop/i.test(
					`${label(node)} ${node.getAttribute("title") ?? ""} ${node.textContent ?? ""}`,
				),
			) ||
			(!send && !buttons.some((node) => /^Enter voice mode/.test(label(node)) && !disabled(node))),
		messages: Array.from(rows.values()),
	};
}

export const grokMessagesExpression = () =>
	`(${inspectGrokMessages.toString()})(document, location.href)`;
