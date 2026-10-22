import { CHATGPT_POWER_SLIDER_TARGETS } from "../actions/chatgptPowerSlider.js";
import type { FrontendObservation } from "./types.js";

/** Read-only detector. Keep provider DOM knowledge in AuraCall, not the broker. */
export function inspectChatgptDocument(
	doc: Document,
	url: string,
	targets: Readonly<Record<string, { value: number; label: string }>>,
): FrontendObservation {
	const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
	const visible = (node: Element | null): node is HTMLElement => {
		if (!node || node.closest('[hidden], [aria-hidden="true"]')) return false;
		const element = node as HTMLElement;
		const style = doc.defaultView?.getComputedStyle?.(element);
		if (
			element.style?.display === "none" ||
			element.style?.visibility === "hidden" ||
			style?.display === "none" ||
			style?.visibility === "hidden"
		)
			return false;
		return !element.getClientRects || element.getClientRects().length > 0;
	};
	const disabled = (node: Element) =>
		node.hasAttribute("disabled") ||
		node.getAttribute("aria-disabled") === "true" ||
		(node.hasAttribute("data-disabled") && node.getAttribute("data-disabled") !== "false");
	const path = (node: Element): string => {
		const parts: string[] = [];
		for (let item: Element | null = node; item; item = item.parentElement) {
			const tag = item.localName;
			if (!/^[a-z][a-z0-9-]*$/.test(tag)) return "";
			const peers: Element[] = item.parentElement
				? Array.from(item.parentElement.children).filter((child) => child.localName === tag)
				: [item];
			parts.unshift(`${tag}:nth-of-type(${peers.indexOf(item) + 1})`);
		}
		return parts.join(" > ");
	};
	const models = Array.from(
		doc.querySelectorAll(
			'[data-testid="model-switcher-dropdown-button"], button[aria-label="Select ChatGPT model"]',
		),
	).filter(visible);
	const modelButton = models.length === 1 ? models[0] : null;
	const roots = Array.from(
		doc.querySelectorAll(
			'[data-model-picker-view="simple"], [data-testid="composer-model-picker-slider-simple-view"], [data-testid="composer-intelligence-picker-content"]',
		),
	).filter(visible);
	const sliders = [
		...new Set(
			roots.flatMap((candidate) =>
				Array.from(candidate.querySelectorAll('[role="slider"]')).filter(visible),
			),
		),
	];
	const slider = sliders.length === 1 ? sliders[0] : null;
	const root = slider ? (roots.find((candidate) => candidate.contains(slider)) ?? null) : null;
	const number = (name: string) => {
		const raw = slider?.getAttribute(name);
		return raw !== null && raw !== undefined && raw.trim() !== "" && Number.isFinite(Number(raw))
			? Number(raw)
			: null;
	};
	const value = number("aria-valuenow");
	const minimum = number("aria-valuemin");
	const maximum = number("aria-valuemax");
	const label =
		normalize(
			slider?.getAttribute("aria-valuetext") || root?.querySelector('[role="status"]')?.textContent,
		) || null;
	const controls: FrontendObservation["controls"] = [];
	if (root && minimum !== null && maximum !== null) {
		const ticks = Array.from(root.querySelectorAll('[class*="_Tick"]')).filter(
			(node) => visible(node) && Array.from(node.classList).some((name) => name.endsWith("_Tick")),
		);
		if (ticks.length === maximum - minimum + 1) {
			ticks.forEach((node, index) => {
				controls.push({ selector: path(node), value: index + minimum, disabled: disabled(node) });
			});
		}
		// Some provider variants expose explicit labelled choices instead of ticks.
		for (const node of root.querySelectorAll('[role="menuitemradio"], [role="option"], button')) {
			if (!visible(node)) continue;
			const text = normalize(node.getAttribute("aria-label") || node.textContent).toLowerCase();
			const target = Object.values(targets).find((item) => item.label.toLowerCase() === text);
			if (target && !controls.some((control) => control.value === target.value)) {
				controls.push({ selector: path(node), value: target.value, disabled: disabled(node) });
			}
		}
	}
	return {
		url,
		model: modelButton ? normalize(modelButton.textContent) || null : null,
		value,
		label,
		minimum,
		maximum,
		disabled: slider ? disabled(slider) : false,
		openSelector:
			roots.length === 0 && modelButton && !disabled(modelButton) ? path(modelButton) : null,
		sliderSelector: slider ? path(slider) : null,
		sliderFocused: slider !== null && doc.activeElement === slider,
		controls,
	};
}

export function chatgptInspectionExpression(): string {
	return `(${inspectChatgptDocument.toString()})(document, location.href, ${JSON.stringify(CHATGPT_POWER_SLIDER_TARGETS)})`;
}
