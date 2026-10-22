import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { runInNewContext } from "node:vm";
import { chatgptInspectionExpression } from "../../src/browser/frontends/chatgpt.js";

function inspect(content: string, focused = false) {
	const { document } = parseHTML(`<html><body>${content}</body></html>`);
	if (focused)
		Object.defineProperty(document, "activeElement", {
			value: document.querySelector('[role="slider"]'),
		});
	return runInNewContext(chatgptInspectionExpression(), {
		document,
		location: { href: "https://chatgpt.com/c/fixture" },
	});
}
const model = '<button data-testid="model-switcher-dropdown-button">GPT fixture</button>';
const slider =
	'<div data-model-picker-view="simple"><div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="4" aria-valuenow="1" aria-valuetext="Medium"></div></div>';

describe("serialized read-only ChatGPT frontend detector", () => {
	it("observes a keyboard slider and exact focus without editing the DOM", () => {
		const result = inspect(model + slider, true);
		expect(result).toMatchObject({
			model: "GPT fixture",
			value: 1,
			label: "Medium",
			minimum: 0,
			maximum: 4,
			sliderFocused: true,
			controls: [],
			openSelector: null,
		});
		expect(result.sliderSelector).toMatch(/div:nth-of-type/);
	});
	it("ignores a hidden duplicate model button", () => {
		expect(inspect(`${model}<div hidden>${model}</div>${slider}`).model).toBe("GPT fixture");
	});
	it("fails model identity for two visible model buttons", () => {
		expect(inspect(model + model + slider).model).toBeNull();
	});
	it("does not guess between two visible sliders", () => {
		expect(inspect(model + slider + slider)).toMatchObject({
			value: null,
			sliderSelector: null,
			openSelector: null,
		});
	});
	it("returns an opener only when the picker is absent", () => {
		expect(inspect(model)).toMatchObject({
			value: null,
			sliderSelector: null,
			sliderFocused: false,
		});
		expect(inspect(model).openSelector).toBeTruthy();
	});
	it("maps five visible tick targets to known values", () => {
		const ticks = Array.from({ length: 5 }, () => '<span class="power_Tick"></span>').join("");
		const result = inspect(model + slider.replace("</div></div>", `</div>${ticks}</div>`));
		expect(result.controls.map((control: { value: number }) => control.value)).toEqual([
			0, 1, 2, 3, 4,
		]);
	});
	it("preserves disabled controls and does not manufacture a numeric default", () => {
		const result = inspect(model + slider.replace('aria-valuenow="1"', 'aria-disabled="true"'));
		expect(result).toMatchObject({ disabled: true, value: null });
	});
});
