/** Provider-visible intelligence positions; shared by legacy and broker paths. */
export const CHATGPT_POWER_SLIDER_TARGETS = {
	light: { value: 0, label: "Instant" },
	standard: { value: 1, label: "Medium" },
	extended: { value: 2, label: "High" },
	heavy: { value: 3, label: "Extra High" },
	pro: { value: 4, label: "Pro" },
} as const;

export type ChatgptPowerEffort = keyof typeof CHATGPT_POWER_SLIDER_TARGETS;

export function resolveChatgptPowerSliderTarget(level: ChatgptPowerEffort): {
	value: number;
	label: string;
} {
	return CHATGPT_POWER_SLIDER_TARGETS[level];
}

/** A numeric position alone is insufficient when the visible label conflicts. */
export function interpretChatgptPowerSlider(
	value: unknown,
	label: unknown,
): ChatgptPowerEffort | null {
	if (typeof value !== "number" || !Number.isInteger(value) || typeof label !== "string")
		return null;
	const normalized = label
		.trim()
		.toLowerCase()
		.replace(/\s+\d+\s+of\s+\d+$/, "")
		.trim();
	return (
		(Object.keys(CHATGPT_POWER_SLIDER_TARGETS) as ChatgptPowerEffort[]).find((level) => {
			const target = CHATGPT_POWER_SLIDER_TARGETS[level];
			return value === target.value && normalized === target.label.toLowerCase();
		}) ?? null
	);
}
