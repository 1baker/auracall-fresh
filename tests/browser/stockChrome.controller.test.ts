import { describe, expect, it } from "vitest";
import { StockChromeController } from "../../src/browser/stockChrome/controller.js";
import { stockHandleSchema } from "../../src/browser/stockChrome/protocol.js";
import { syntheticChrome } from "../fixtures/frontend/stockChrome.js";

const session = "00000000-0000-4000-8000-000000000001";
describe("explicit stock Chrome tab controls", () => {
	it("STD-01 refuses an empty descendant of Answer now without dispatching a mouse event", async () => {
		const browser = syntheticChrome();
		const button = browser.document.createElement("button");
		button.innerHTML = 'Answer now<span id="answer-icon"></span>';
		browser.document.body.append(button);
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		try {
			await expect(
				controller.execute(handle, {
					action: "ui_action",
					type: "click",
					selector: "#answer-icon",
				}),
			).rejects.toThrow();
			expect(browser.methods.filter((method) => method.startsWith("Input."))).toEqual([]);
		} finally {
			await controller.close();
		}
	});
	it("SP-01 permits Grok's canonical empty paragraph while preserving real draft content", async () => {
		const browser = syntheticChrome({ url: "https://grok.com/c/stock-fixture" });
		const composer = browser.document.querySelector("[contenteditable]") as HTMLElement;
		composer.innerHTML = "<p><br></p>";
		// linkedom has no layout; native empty paragraphs can render an LF.
		Object.defineProperty(composer, "innerText", {
			configurable: true,
			get() {
				return composer.textContent === "" ? "\n" : composer.textContent;
			},
		});
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		try {
			await controller.execute(handle, {
				action: "ui_action",
				type: "fill",
				selector: "[contenteditable]",
				value: "One prompt",
			});
			expect(browser.counts().fills).toBe(1);
			await expect(
				controller.execute(handle, {
					action: "ui_action",
					type: "fill",
					selector: "[contenteditable]",
					value: "Replacement",
				}),
			).rejects.toThrow();
			expect(browser.counts().fills).toBe(1);
		} finally {
			await controller.close();
		}
	});
	it("SP-02 refuses typing after focus moves during the final document guard", async () => {
		const browser = syntheticChrome();
		const other = browser.document.createElement("textarea");
		other.value = "Human draft";
		browser.document.body.append(other);
		const get = browser.api.tabs.get;
		let gets = 0;
		browser.api.tabs.get = async (tabId) => {
			const result = await get(tabId);
			if (++gets === 3)
				Object.defineProperty(browser.document, "activeElement", {
					configurable: true,
					value: other,
				});
			return result;
		};
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		try {
			await expect(
				controller.execute(handle, {
					action: "ui_action",
					type: "fill",
					selector: "#prompt-textarea",
					value: "Automation text",
				}),
			).rejects.toThrow();
			expect(other.value).toBe("Human draft");
			expect(browser.counts().fills).toBe(0);
		} finally {
			await controller.close();
		}
	});
	it("accepts its handle after native JSON schema decoding, types through Chrome and preserves drafts", async () => {
		const browser = syntheticChrome();
		const controller = new StockChromeController(browser.api, session);
		try {
			const handle = stockHandleSchema.parse(JSON.parse(JSON.stringify(await controller.share(1))));
			await controller.execute(handle, {
				action: "ui_action",
				type: "fill",
				selector: "#prompt-textarea",
				value: "Existing draft",
			});
			expect(browser.counts().fills).toBe(1);
			await expect(
				controller.execute(handle, {
					action: "ui_action",
					type: "fill",
					selector: "#prompt-textarea",
					value: "Replacement",
				}),
			).rejects.toThrow();
			expect(browser.counts().fills).toBe(1);
			expect(
				(browser.document.querySelector("#prompt-textarea") as HTMLTextAreaElement).value,
			).toBe("Existing draft");
		} finally {
			await controller.close();
		}
	});
	it.each([
		"https://claude.ai/chat/fixture",
		"https://chatgpt.com/",
		"https://chatgpt.com.evil.test/c/fixture",
	])("refuses unselected or non-conversation pages before attachment: %s", async (url) => {
		const browser = syntheticChrome({ url });
		const controller = new StockChromeController(browser.api, session);
		await expect(controller.share(1)).rejects.toThrow();
		expect(browser.counts().attached).toBe(false);
		expect(browser.methods).toEqual([]);
	});
	it("revokes after a same-URL document reload without sending input", async () => {
		const browser = syntheticChrome();
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		browser.reload();
		await expect(
			controller.execute(handle, {
				action: "ui_action",
				type: "fill",
				selector: "#prompt-textarea",
				value: "Never sent",
			}),
		).rejects.toThrow();
		expect(controller.getHandle(1)).toBeUndefined();
		expect(browser.counts()).toMatchObject({ fills: 0, sends: 0, attached: false });
	});
	it("refuses Answer now, unknown keys and forged handles without input", async () => {
		const browser = syntheticChrome();
		const button = browser.document.createElement("button");
		button.id = "answer-now";
		button.textContent = "Answer now";
		browser.document.body.append(button);
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		try {
			await expect(
				controller.execute(handle, { action: "ui_action", type: "click", selector: "#answer-now" }),
			).rejects.toThrow();
			await expect(controller.execute(handle, { action: "press", key: "Enter" })).rejects.toThrow();
			await expect(
				controller.execute(
					{ ...handle, targetId: "forged" },
					{ action: "press", key: "ArrowRight" },
				),
			).rejects.toThrow();
			expect(browser.methods.filter((method) => method.startsWith("Input."))).toEqual([]);
		} finally {
			await controller.close();
		}
	});
	it("stops on a visible human-verification challenge without input", async () => {
		const browser = syntheticChrome();
		const controller = new StockChromeController(browser.api, session);
		const handle = await controller.share(1);
		const challenge = browser.document.createElement("iframe");
		challenge.setAttribute("src", "https://challenges.cloudflare.com/");
		browser.document.body.append(challenge);
		await expect(
			controller.execute(handle, {
				action: "ui_action",
				type: "fill",
				selector: "#prompt-textarea",
				value: "Never typed",
			}),
		).rejects.toThrow();
		expect(browser.counts()).toMatchObject({ fills: 0, sends: 0, attached: false });
	});
});
