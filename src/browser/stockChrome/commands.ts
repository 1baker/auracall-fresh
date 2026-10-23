import { z } from "zod";
import { chatgptInspectionExpression } from "../frontends/chatgpt.js";
import { grokMessagesExpression } from "../frontends/grok.js";
import { grokControlsExpression } from "../frontends/grokControls.js";
import { chatgptMessagesExpression } from "../frontends/messages.js";
import { type StockChromeCommand, type StockChromeHandle, stockCommandSchema } from "./protocol.js";

const probeSchema = z
	.object({
		recipeId: z.enum([
			"auracall-chatgpt-frontend-v1",
			"auracall-chatgpt-messages-v1",
			"auracall-grok-heavy-v1",
			"auracall-grok-messages-v1",
		]),
		detectors: z
			.array(
				z
					.object({
						id: z.enum(["frontend", "messages"]),
						type: z.literal("evaluate"),
						expression: z.string().max(65536),
					})
					.strict(),
			)
			.length(1),
	})
	.strict();
const stepSchema = z
	.object({
		type: z.enum(["click", "focus", "fill"]),
		selector: z.string().min(1).max(2048),
		value: z.string().max(32000).optional(),
	})
	.strict();

/** Caller-supplied JavaScript is never executed. Recipes are compiled source. */
export function stockCommand(
	request: Record<string, unknown>,
	handle: StockChromeHandle,
): StockChromeCommand {
	if (request.action === "probe") {
		const probe = probeSchema.parse(request.probe);
		const grok = handle.url.startsWith("https://grok.com/");
		if (grok !== probe.recipeId.includes("grok"))
			throw new Error("Recipe provider differs from shared tab");
		const messages = probe.recipeId.endsWith("messages-v1");
		if (probe.detectors[0].id !== (messages ? "messages" : "frontend"))
			throw new Error("Detector differs from recipe");
		const maxBytes = Number(request.maxReturnBytes);
		return stockCommandSchema.parse({
			action: "probe",
			detectorId: probe.detectors[0].id,
			expression: grok
				? messages
					? grokMessagesExpression()
					: grokControlsExpression()
				: messages
					? chatgptMessagesExpression()
					: chatgptInspectionExpression(),
			maxBytes,
		});
	}
	if (request.action === "ui_action") {
		const ui = z
			.object({ maxActions: z.literal(1), steps: z.array(stepSchema).length(1) })
			.strict()
			.parse(request.uiAction);
		const step = ui.steps[0];
		if ((step.type === "fill") !== (step.value !== undefined))
			throw new Error("Only fill accepts text");
		return stockCommandSchema.parse({ action: "ui_action", ...step });
	}
	if (request.action === "press") {
		const params = z
			.object({ key: z.enum(["ArrowLeft", "ArrowRight"]) })
			.strict()
			.parse(request.params);
		return { action: "press", ...params };
	}
	throw new Error("Unsupported stock Chrome action");
}
