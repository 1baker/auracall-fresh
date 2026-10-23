import { type StockChromeHandle, stockCommandSchema, stockConversationUrl } from "./protocol.js";

export interface ChromeControlApi {
	tabs: { get(tabId: number): Promise<{ id?: number; url?: string }> };
	debugger: {
		attach(target: { tabId: number }, version: string): Promise<void>;
		detach(target: { tabId: number }): Promise<void>;
		sendCommand(
			target: { tabId: number },
			method: string,
			params?: Record<string, unknown>,
		): Promise<unknown>;
	};
}
type Shared = { handle: StockChromeHandle; timeOrigin: number };
const contextExpression = () =>
	`(${documentContext.toString()})(document, location.href, performance.timeOrigin)`;

/** Only user-clicked existing tabs; owns no browser lifecycle or navigation. */
export class StockChromeController {
	private readonly shared = new Map<number, Shared>();
	private readonly busy = new Set<number>();
	constructor(
		private readonly chrome: ChromeControlApi,
		private readonly sessionId: string,
	) {}

	async share(tabId: number): Promise<StockChromeHandle> {
		if (this.shared.has(tabId)) throw new Error("Tab already shared");
		const tab = await this.chrome.tabs.get(tabId);
		if (!tab.url || !stockConversationUrl(tab.url))
			throw new Error("Select an existing ChatGPT or Grok conversation");
		await this.chrome.debugger.attach({ tabId }, "1.3");
		try {
			const context = (await this.evaluate(tabId, contextExpression())) as {
				url: string;
				timeOrigin: number;
				blocked: boolean;
			};
			if (
				context.url !== tab.url ||
				!Number.isFinite(context.timeOrigin) ||
				context.blocked !== false
			)
				throw new Error("Tab changed or requires human attention");
			const handle: StockChromeHandle = {
				kind: "auracall-stock-chrome-v1",
				valid: true,
				browserId: `stock-chrome:${this.sessionId}`,
				profileId: "stock-chrome",
				sessionName: this.sessionId,
				tabId: String(tabId),
				targetId: `${this.sessionId}:${tabId}:${crypto.randomUUID()}`,
				url: tab.url,
			};
			this.shared.set(tabId, { handle, timeOrigin: context.timeOrigin });
			return handle;
		} catch (error) {
			await this.chrome.debugger.detach({ tabId }).catch(() => {});
			throw error;
		}
	}
	getHandle(tabId: number): StockChromeHandle | undefined {
		return this.shared.get(tabId)?.handle;
	}
	async revoke(tabId: number): Promise<string | undefined> {
		const shared = this.shared.get(tabId);
		if (!shared) return;
		this.shared.delete(tabId);
		await this.chrome.debugger.detach({ tabId }).catch(() => {});
		return shared.handle.targetId;
	}
	async close(): Promise<void> {
		await Promise.all([...this.shared.keys()].map((tabId) => this.revoke(tabId)));
	}
	private async evaluate(tabId: number, expression: string): Promise<unknown> {
		const reply = (await this.chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: false,
			timeout: 3000,
		})) as { result?: { value?: unknown; subtype?: string }; exceptionDetails?: unknown };
		if (reply.exceptionDetails || !reply.result || !("value" in reply.result))
			throw new Error("DOM observation refused");
		return reply.result.value;
	}
	private async guard(tabId: number, shared: Shared): Promise<void> {
		if (this.shared.get(tabId) !== shared) throw new Error("Tab share revoked");
		const tab = await this.chrome.tabs.get(tabId);
		if (tab.url !== shared.handle.url) throw new Error("Shared URL changed");
		const context = (await this.evaluate(tabId, contextExpression())) as {
			url: string;
			timeOrigin: number;
			blocked: boolean;
		};
		if (
			context.url !== shared.handle.url ||
			context.timeOrigin !== shared.timeOrigin ||
			context.blocked !== false
		)
			throw new Error("Shared document changed or requires human attention");
	}
	async execute(handle: StockChromeHandle, rawCommand: unknown): Promise<Record<string, unknown>> {
		const tabId = Number(handle.tabId);
		const shared = this.shared.get(tabId);
		if (
			!shared ||
			Object.entries(shared.handle).some(([key, value]) => Reflect.get(handle, key) !== value)
		)
			throw new Error("Unshared target");
		if (this.busy.has(tabId)) throw new Error("Shared target busy");
		const command = stockCommandSchema.parse(rawCommand);
		this.busy.add(tabId);
		try {
			await this.guard(tabId, shared);
			const base = { ok: true, targetId: handle.targetId, url: handle.url };
			if (command.action === "probe") {
				const result = await this.evaluate(tabId, command.expression);
				await this.guard(tabId, shared);
				const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
				if (bytes > command.maxBytes) throw new Error("Observation exceeds byte bound");
				return {
					...base,
					detectors: [{ id: command.detectorId, ok: true, resultTruncated: false, result }],
				};
			}
			if (command.action === "press") {
				const ownsSlider = await this.evaluate(
					tabId,
					"Boolean(document.activeElement?.matches('[role=slider], input[type=range]'))",
				);
				if (ownsSlider !== true) throw new Error("Slider must own keyboard focus");
				const code = command.key === "ArrowLeft" ? 37 : 39;
				for (const type of ["keyDown", "keyUp"]) {
					await this.guard(tabId, shared);
					await this.chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
						type,
						key: command.key,
						code: command.key,
						windowsVirtualKeyCode: code,
						nativeVirtualKeyCode: code,
					});
				}
				return { ...base, pressed: command.key };
			}
			const expression = `(${prepareControl.toString()})(${JSON.stringify(command.selector)},${JSON.stringify(command.type)})`;
			const point = (await this.evaluate(tabId, expression)) as { x: number; y: number };
			if (command.type === "click") {
				for (const type of ["mousePressed", "mouseReleased"]) {
					await this.guard(tabId, shared);
					await this.chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
						type,
						x: point.x,
						y: point.y,
						button: "left",
						clickCount: 1,
					});
				}
			} else if (command.type === "fill") {
				if (command.value === undefined) throw new Error("Fill needs text");
				await this.guard(tabId, shared);
				// Never regain focus or overwrite a draft after the final async guard.
				await this.evaluate(
					tabId,
					`(${prepareControl.toString()})(${JSON.stringify(command.selector)},"check_fill")`,
				);
				await this.chrome.debugger.sendCommand({ tabId }, "Input.insertText", {
					text: command.value,
				});
			}
			await this.guard(tabId, shared);
			return { ...base, steps: [{ index: 0, type: command.type, ok: true }] };
		} catch (error) {
			// URL/document failures cannot revive an old handle. Never replay input.
			try {
				await this.guard(tabId, shared);
			} catch {
				await this.revoke(tabId);
			}
			throw error;
		} finally {
			this.busy.delete(tabId);
		}
	}
}

function documentContext(doc: Document, url: string, timeOrigin: number) {
	const blocked =
		/just a moment|verify you are human|checking your browser/i.test(doc.title) ||
		Array.from(
			doc.querySelectorAll(
				'iframe[src*="captcha"], iframe[src*="challenges.cloudflare"], [id*="captcha"]',
			),
		).some(
			(node) => !node.closest('[hidden],[aria-hidden="true"]') && node.getClientRects().length > 0,
		);
	return { url, timeOrigin, blocked };
}

/** Serialized locator preparation only; actual typing/clicking uses Chrome Input. */
function prepareControl(selector: string, type: string) {
	const nodes = Array.from(document.querySelectorAll(selector));
	if (nodes.length !== 1) throw new Error("Control must be unique");
	const node = nodes[0] as HTMLElement;
	if (
		node.closest('[hidden],[aria-hidden="true"]') ||
		node.hasAttribute("disabled") ||
		node.getAttribute("aria-disabled") === "true"
	)
		throw new Error("Control unavailable");
	const actionable = node.closest('button,[role="button"]') ?? node;
	const label = `${actionable.textContent ?? ""} ${actionable.getAttribute("aria-label") ?? ""} ${actionable.getAttribute("title") ?? ""}`;
	if (/\banswer\s+now\b/i.test(label)) throw new Error("Answer now is prohibited");
	const style = getComputedStyle(node);
	if (style.display === "none" || style.visibility === "hidden") throw new Error("Control hidden");
	if (type !== "check_fill") node.scrollIntoView({ block: "center", inline: "center" });
	const rect = node.getBoundingClientRect();
	const x = rect.left + rect.width / 2,
		y = rect.top + rect.height / 2;
	const hit = document.elementFromPoint(x, y);
	if (rect.width <= 0 || rect.height <= 0 || !hit || (hit !== node && !node.contains(hit)))
		throw new Error("Control obscured");
	if (type === "focus" || type === "fill" || type === "check_fill") {
		if (type === "fill" || type === "check_fill") {
			if (node.tagName !== "TEXTAREA" && node.getAttribute("contenteditable") !== "true")
				throw new Error("Composer is not editable");
			const value =
				"value" in node ? String(node.value) : (node.innerText ?? node.textContent ?? "");
			const children = Array.from(node.childNodes);
			const paragraph =
				children.length === 1 && children[0].nodeType === 1 ? (children[0] as Element) : null;
			const structuralEmpty =
				node.textContent === "" &&
				(children.length === 0 ||
					(paragraph?.tagName === "P" &&
						paragraph.childNodes.length === 1 &&
						paragraph.firstChild?.nodeType === 1 &&
						(paragraph.firstChild as Element).tagName === "BR"));
			if (node.tagName === "TEXTAREA" ? value !== "" : !structuralEmpty || !/^[\r\n]*$/.test(value))
				throw new Error("Preserve the existing draft");
		}
		if (type !== "check_fill") node.focus();
		if (document.activeElement !== node) throw new Error("Control did not gain focus");
	}
	return { x, y };
}
