import { z } from "zod";

/** Reviewed privacy-r2 d082ce05; facts belong only to this snapshot's ref. */
const ax = z
	.object({
		schemaVersion: z.literal("agent-browser.ax-control.v1"),
		value: z.number().finite().optional(),
		minimum: z.number().finite().optional(),
		maximum: z.number().finite().optional(),
		valueText: z.string().optional(),
		disabled: z.boolean().optional(),
		focused: z.boolean().optional(),
		selected: z.boolean().optional(),
		checked: z.enum(["true", "false", "mixed"]).optional(),
	})
	.strict()
	.refine((v) => Object.keys(v).length > 1);
const roles = new Set([
	"slider",
	"button",
	"checkbox",
	"radio",
	"switch",
	"option",
	"tab",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
]);
const ref = z
	.object({ role: z.string(), name: z.string(), ax: ax.optional() })
	.strict()
	.refine((r) => {
		if (!r.ax) return true;
		if (!roles.has(r.role)) return false;
		const { value, minimum, maximum, valueText } = r.ax;
		if (r.role !== "slider")
			return [value, minimum, maximum, valueText].every((v) => v === undefined);
		return (
			!(minimum !== undefined && maximum !== undefined && minimum > maximum) &&
			!(value !== undefined && minimum !== undefined && value < minimum) &&
			!(value !== undefined && maximum !== undefined && value > maximum)
		);
	});
export const nativeSnapshotSchema = z
	.object({
		snapshot: z.string().max(1048576),
		refs: z.record(z.string(), ref),
	})
	.strict();
