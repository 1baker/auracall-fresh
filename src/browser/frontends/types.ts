/** Server-owned routes bind frontend operations to an existing broker target. */
export interface FrontendRoute {
	id: string;
	provider: "chatgpt";
	expectedUrl: string;
	expectedModel: string;
	serviceTabHandle: Record<string, unknown>;
	profileCapabilityEnv: string;
}

export type FrontendEffort = "light" | "standard" | "extended" | "heavy" | "pro";

export interface FrontendControl {
	selector: string;
	value: number;
	disabled: boolean;
}

export interface FrontendObservation {
	url: string;
	model: string | null;
	value: number | null;
	label: string | null;
	minimum: number | null;
	maximum: number | null;
	disabled: boolean;
	openSelector: string | null;
	sliderSelector: string | null;
	sliderFocused: boolean;
	controls: FrontendControl[];
}

export type FrontendBroker = (
	request: Record<string, unknown>,
	capabilityEnv: string,
) => Promise<Record<string, unknown>>;

export class FrontendError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "FrontendError";
	}
}
