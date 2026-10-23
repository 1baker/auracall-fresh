import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import type { ChromeControlApi } from "../../../src/browser/stockChrome/controller.js";

/** Synthetic Chrome protocol/DOM boundary. Never launches or attaches a browser. */
export function syntheticChrome(options: { url?: string; html?: string; replies?: string[] } = {}) {
	const grok = options.url?.startsWith("https://grok.com/") ?? false;
	const defaultHtml = grok
		? '<html><body><button aria-label="Account menu"></button><main><section id="messages"></section><form><div contenteditable="true" role="combobox" aria-label="Ask Grok anything"></div><button id="picker" type="button" aria-label="Model: Fast" aria-expanded="false"></button><button type="button" aria-label="Enter voice mode"></button></form><div role="menu" id="menu" hidden><button id="heavy" role="menuitemradio" aria-checked="false">Heavy</button></div></main></body></html>'
		: '<html><body><button data-testid="model-switcher-dropdown-button">GPT fixture</button><div data-model-picker-view="simple"><div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" aria-valuetext="Instant"></div></div><main></main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body></html>';
	const { document, window } = parseHTML(options.html ?? defaultHtml);
	let url = options.url ?? "https://chatgpt.com/c/stock-fixture";
	let timeOrigin = 1000,
		attached = false,
		fills = 0,
		sends = 0,
		detachments = 0;
	const methods: string[] = [],
		inputs: string[] = [];
	const rect = (node: Element) => {
		const left = 10 + Array.from(document.querySelectorAll("*")).indexOf(node) * 3;
		return { left, right: left + 2, top: 10, bottom: 12, width: 2, height: 2 };
	};
	Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
		configurable: true,
		value(this: Element) {
			return rect(this);
		},
	});
	Object.defineProperty(window.Element.prototype, "getClientRects", {
		configurable: true,
		value(this: Element) {
			return [rect(this)];
		},
	});
	Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value() {},
	});
	Object.defineProperty(window.HTMLElement.prototype, "focus", {
		configurable: true,
		value(this: Element) {
			Object.defineProperty(document, "activeElement", { configurable: true, value: this });
		},
	});
	Object.defineProperty(document, "elementFromPoint", {
		configurable: true,
		value(x: number) {
			return (
				Array.from(document.querySelectorAll("*")).find(
					(node) => Math.abs(rect(node).left + 1 - x) < 0.01,
				) ?? null
			);
		},
	});
	const render = (role: string, text: string, index: number) => {
		const row = document.createElement("div");
		row.setAttribute("data-message-author-role", role);
		row.setAttribute("data-message-id", `${role}-${index}`);
		const content = grok ? document.createElement("div") : row;
		if (grok) {
			row.className = role === "user" ? "items-end" : "items-start";
			content.className = role === "user" ? "message-bubble" : "response-content-markdown";
			row.append(content);
		}
		for (const [i, line] of text.split("\n").entries()) {
			if (i) content.append(document.createElement("br"));
			content.append(document.createTextNode(line));
		}
		document.querySelector("main")?.append(row);
	};
	const send = () => {
		const composer = document.querySelector(
			grok ? "[contenteditable]" : "#prompt-textarea",
		) as HTMLTextAreaElement;
		const text = grok ? (composer.innerText ?? composer.textContent ?? "") : composer.value;
		inputs.push(text);
		sends++;
		render("user", text, sends);
		render("assistant", options.replies?.[sends - 1] ?? "Fixture response", sends);
		if (grok) {
			composer.textContent = "";
			document.querySelector('[type="submit"]')?.remove();
		} else composer.value = "";
	};
	document.querySelector('[data-testid="send-button"]')?.addEventListener("click", send);
	document.querySelector("#picker")?.addEventListener("click", () => {
		const picker = document.querySelector("#picker");
		const open = picker?.getAttribute("aria-expanded") !== "true";
		picker?.setAttribute("aria-expanded", String(open));
		document.querySelector("#menu")?.toggleAttribute("hidden", !open);
	});
	document.querySelector("#heavy")?.addEventListener("click", () => {
		document.querySelector("#picker")?.setAttribute("aria-label", "Model: Heavy");
		document.querySelector("#picker")?.setAttribute("aria-expanded", "false");
		document.querySelector("#menu")?.setAttribute("hidden", "");
		document.querySelector("#heavy")?.setAttribute("aria-checked", "true");
	});
	const api: ChromeControlApi = {
		tabs: {
			get: async (tabId) => {
				if (tabId !== 1) throw new Error("Wrong synthetic tab");
				return { id: 1, url };
			},
		},
		debugger: {
			attach: async ({ tabId }) => {
				if (tabId !== 1 || attached) throw new Error("Debugger already owned");
				attached = true;
			},
			detach: async ({ tabId }) => {
				if (tabId !== 1) throw new Error("Wrong synthetic tab");
				attached = false;
				detachments++;
			},
			sendCommand: async ({ tabId }, method, params = {}) => {
				if (tabId !== 1 || !attached) throw new Error("No synthetic attachment");
				methods.push(method);
				if (method === "Runtime.evaluate") {
					try {
						return {
							result: {
								value: runInNewContext(String(params.expression), {
									document,
									location: { href: url },
									performance: { timeOrigin },
									innerWidth: 10000,
									innerHeight: 10000,
									getComputedStyle: () => ({ display: "block", visibility: "visible" }),
								}),
							},
						};
					} catch {
						return { exceptionDetails: { text: "Synthetic evaluation failed" } };
					}
				}
				if (method === "Input.insertText") {
					const node = document.activeElement as HTMLTextAreaElement;
					if (!node) throw new Error("No focused composer");
					if (node.tagName === "TEXTAREA") node.value += String(params.text);
					else node.textContent += String(params.text);
					if (grok) {
						const button = document.createElement("button");
						button.setAttribute("type", "submit");
						button.setAttribute("aria-label", "Send message");
						button.addEventListener("click", send);
						document.querySelector("form")?.append(button);
					}
					fills++;
				} else if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") {
					const node = document.elementFromPoint(Number(params.x), Number(params.y));
					node?.dispatchEvent(new window.Event("click"));
				} else if (method === "Input.dispatchKeyEvent" && params.type === "keyDown") {
					const slider = document.activeElement;
					if (!slider?.matches('[role="slider"]')) throw new Error("Synthetic focus mismatch");
					const value =
						Number(slider.getAttribute("aria-valuenow")) + (params.key === "ArrowRight" ? 1 : -1);
					slider.setAttribute("aria-valuenow", String(value));
					slider.setAttribute(
						"aria-valuetext",
						["Instant", "Medium", "High", "Extra High", "Pro"][value],
					);
				} else if (!["Input.dispatchMouseEvent", "Input.dispatchKeyEvent"].includes(method))
					throw new Error("Unsupported synthetic Chrome method");
				return {};
			},
		},
	};
	return {
		api,
		document,
		methods,
		inputs,
		setUrl: (next: string) => {
			url = next;
		},
		reload: () => {
			timeOrigin++;
		},
		counts: () => ({ fills, sends, detachments, attached }),
	};
}
