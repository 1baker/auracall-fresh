/** Local routing metadata from an authenticated Browser acquisition, not a grant. */
export interface NativeTaskBinding {
	readonly authorityRef: string;
	readonly taskId: string;
	readonly profileId: string;
	readonly browserId: string;
	readonly tabId: string;
	readonly targetId: string;
}

interface FrontendRouteDetails {
	id: string;
	provider: "chatgpt" | "grok" | "claude";
	expectedUrl: string;
	expectedModel: string;
}

/** Server-owned routes preserve the identity native to their authorized transport. */
export type ServiceFrontendRoute = FrontendRouteDetails & {
	transport?: "service_request";
	serviceTabHandle: Record<string, unknown>;
	profileCapabilityEnv: string;
	nativeTask?: never;
};
export type NativeTaskFrontendRoute = FrontendRouteDetails & {
	transport: "agent_browser_task";
	nativeTask: NativeTaskBinding;
	serviceTabHandle?: never;
	profileCapabilityEnv?: never;
};
export type FrontendRoute = ServiceFrontendRoute | NativeTaskFrontendRoute;

export type FrontendEffort =
	| "light"
	| "standard"
	| "extended"
	| "heavy"
	| "pro"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

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
	capabilityEnv?: string,
) => Promise<Record<string, unknown>>;

export class FrontendError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly menuMayBeOpen?: true,
	) {
		super(message);
		this.name = "FrontendError";
	}
}
