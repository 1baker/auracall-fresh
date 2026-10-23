import { z } from "zod";

export const STOCK_HOST_NAME = "com.auracall.stock_chrome";
export const stockHandleSchema = z
	.object({
		kind: z.literal("auracall-stock-chrome-v1"),
		valid: z.literal(true),
		browserId: z.string().min(1).max(256),
		profileId: z.literal("stock-chrome"),
		tabId: z.string().regex(/^[1-9][0-9]{0,12}$/),
		targetId: z.string().min(1).max(256),
		sessionName: z.string().uuid(),
		url: z.string().url().max(4096),
	})
	.strict();
export type StockChromeHandle = z.infer<typeof stockHandleSchema>;

export const stockCommandSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("probe"),
			detectorId: z.enum(["frontend", "messages"]),
			expression: z.string().min(1).max(65536),
			maxBytes: z.number().int().min(1).max(98304),
		})
		.strict(),
	z
		.object({
			action: z.literal("ui_action"),
			type: z.enum(["click", "focus", "fill"]),
			selector: z.string().min(1).max(2048),
			value: z.string().max(32000).optional(),
		})
		.strict(),
	z.object({ action: z.literal("press"), key: z.enum(["ArrowLeft", "ArrowRight"]) }).strict(),
]);
export type StockChromeCommand = z.infer<typeof stockCommandSchema>;

export const extensionPacketSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("shared"), handle: stockHandleSchema }).strict(),
	z.object({ kind: z.literal("revoked"), targetId: z.string().min(1).max(256) }).strict(),
	z
		.object({
			kind: z.literal("result"),
			id: z.string().uuid(),
			success: z.boolean(),
			data: z.record(z.string(), z.unknown()).optional(),
		})
		.strict(),
]);

/** V1 shares existing conversations only: navigation/root-to-chat needs a fresh share. */
export function stockConversationUrl(value: string): boolean {
	return /^https:\/\/(chatgpt|grok)\.com\/c\/[a-zA-Z0-9_-]+$/.test(value);
}
