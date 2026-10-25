import {
	CHATGPT_POWER_SLIDER_TARGETS,
	type ChatgptPowerEffort,
	interpretChatgptPowerSlider,
	resolveChatgptPowerSliderTarget,
} from "../actions/chatgptPowerSlider.js";
import { chatgptInspectionExpression } from "./chatgpt.js";
import { configureClaudeEffort, inspectClaudeControls, isClaudeFrontendUrl } from "./claude.js";
import { configureGrokHeavy, GROK_HEAVY_MODEL, inspectGrokHeavy } from "./grokControls.js";
import { FrontendMessages } from "./messages.js";
import { FrontendRequestStore, frontendTargetKey } from "./requestStore.js";
import { frontendRequest, frontendTargetId, validateFrontendBinding } from "./route.js";
import {
	type FrontendBroker,
	type FrontendEffort,
	FrontendError,
	type FrontendObservation,
	type FrontendRoute,
} from "./types.js";

const record = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === "object" && !Array.isArray(value));
const selector = (value: unknown): boolean =>
	value === null || (typeof value === "string" && value.length > 0 && value.length <= 2048);
const sliderValue = (value: unknown): boolean =>
	value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4);

export class FrontendService {
	private readonly locks = new Map<string, Promise<void>>();
	private readonly requestStore = new FrontendRequestStore();
	private readonly messages = new FrontendMessages(this.requestStore, {
		request: (route, request) => this.request(route, request),
	});
	constructor(
		readonly routes: FrontendRoute[],
		readonly broker: FrontendBroker,
		readonly maxUiSteps = 6,
	) {
		if (new Set(routes.map((route) => route.id)).size !== routes.length)
			throw new FrontendError("invalid_config", "Route IDs must be unique.");
		if (!Number.isInteger(maxUiSteps) || maxUiSteps < 0 || maxUiSteps > 6)
			throw new FrontendError("invalid_config", "UI action bound must be between zero and six.");
	}

	async inspect(routeId: string): Promise<Record<string, unknown>> {
		const route = this.route(routeId);
		if (route.provider === "grok" && route.expectedModel === GROK_HEAVY_MODEL)
			return this.serial(route, () =>
				inspectGrokHeavy(route, (request) => this.request(route, request)),
			);
		if (route.provider === "claude")
			return this.serial(route, () =>
				inspectClaudeControls(route, (request) => this.request(route, request)),
			);
		this.requireControls(route);
		return this.serial(route, async () => this.publicObservation(route, await this.observe(route)));
	}

	async send(
		routeId: string,
		requestId: string,
		text: string,
		previousRequestId?: string,
	): Promise<Record<string, unknown>> {
		return this.messages.send(this.route(routeId), requestId, text, previousRequestId);
	}

	async status(routeId: string, requestId: string): Promise<Record<string, unknown>> {
		return this.messages.status(this.route(routeId), requestId);
	}

	async configure(routeId: string, effort: FrontendEffort): Promise<Record<string, unknown>> {
		const route = this.route(routeId);
		if (route.provider === "grok" && route.expectedModel === GROK_HEAVY_MODEL)
			return this.serial(route, async () => {
				if (await this.requestStore.unresolved(frontendTargetKey(route)))
					throw new FrontendError(
						"request_unresolved",
						"Read status for the previous request before changing the model.",
					);
				return configureGrokHeavy(
					route,
					effort,
					(request) => this.request(route, request),
					this.maxUiSteps,
				);
			});
		if (route.provider === "claude")
			return this.serial(route, () =>
				configureClaudeEffort(
					route,
					effort,
					(request) => this.request(route, request),
					this.maxUiSteps,
				),
			);
		this.requireControls(route);
		return this.serial(route, async () => {
			const target = Object.hasOwn(CHATGPT_POWER_SLIDER_TARGETS, effort)
				? resolveChatgptPowerSliderTarget(effort as ChatgptPowerEffort)
				: null;
			if (!target)
				throw new FrontendError("unknown_effort", "Choose a documented intelligence level.");
			let observation = await this.observe(route);
			let steps = 0;
			const consume = () => {
				if (++steps > this.maxUiSteps)
					throw new FrontendError(
						"step_bound_exceeded",
						"The bounded control recipe is exhausted.",
					);
			};
			const ui = async (type: "click" | "focus", control: string) => {
				consume();
				const result = await this.request(route, {
					action: "ui_action",
					timeoutMs: 5000,
					maxTextBytes: 1024,
					uiAction: { maxActions: 1, steps: [{ type, selector: control }] },
				});
				this.checkTarget(route, result);
				if (
					result.ok !== true ||
					!Array.isArray(result.steps) ||
					result.steps.length !== 1 ||
					!record(result.steps[0]) ||
					result.steps[0].ok !== true ||
					result.steps[0].type !== type ||
					result.steps[0].index !== 0
				) {
					throw new FrontendError(
						"ui_action_failed",
						"The control action was not confirmed; do not replay it blindly.",
					);
				}
			};
			if (observation.openSelector) {
				await ui("click", observation.openSelector);
				observation = await this.observe(route);
			}
			this.checkAvailable(observation, target.value);
			if (interpretChatgptPowerSlider(observation.value, observation.label) !== effort) {
				const control = observation.controls.find((item) => item.value === target.value);
				if (control) {
					if (control.disabled)
						throw new FrontendError(
							"effort_unavailable",
							"The requested intelligence level is disabled.",
						);
					await ui("click", control.selector);
					observation = await this.observe(route);
				} else {
					const initial = observation.value;
					if (
						initial === null ||
						!observation.sliderSelector ||
						!interpretChatgptPowerSlider(initial, observation.label)
					) {
						throw new FrontendError(
							"readback_mismatch",
							"The slider has no unambiguous starting value.",
						);
					}
					const distance = Math.abs(target.value - initial);
					if (distance > 4)
						throw new FrontendError(
							"step_bound_exceeded",
							"The slider needs more than four arrow keys.",
						);
					await ui("focus", observation.sliderSelector);
					observation = await this.observe(route);
					if (observation.value !== initial)
						throw new FrontendError(
							"readback_mismatch",
							"Focusing unexpectedly changed the slider.",
						);
					for (let index = 0; index < distance; index++) {
						this.checkAvailable(observation, target.value);
						if (!observation.sliderFocused)
							throw new FrontendError("focus_lost", "The observed slider must own keyboard focus.");
						const direction: number = target.value > Number(observation.value) ? 1 : -1;
						const before: number = Number(observation.value);
						consume();
						const key = direction === 1 ? "ArrowRight" : "ArrowLeft";
						const result = await this.request(route, { action: "press", params: { key } });
						// agent-browser 028471e8 interaction.rs:1651 returns {pressed}, without targetId.
						// Its native action fence selects the handle target; the following probe checks it again.
						if (result.pressed !== key)
							throw new FrontendError(
								"ui_action_failed",
								"The keyboard action was not confirmed; do not replay it blindly.",
							);
						observation = await this.observe(route);
						if (
							observation.value !== before + direction ||
							!interpretChatgptPowerSlider(observation.value, observation.label)
						) {
							throw new FrontendError(
								"readback_mismatch",
								"The slider did not move exactly one visible step.",
							);
						}
					}
				}
			}
			if (interpretChatgptPowerSlider(observation.value, observation.label) !== effort) {
				throw new FrontendError(
					"readback_mismatch",
					"The requested intelligence level was not observed after the action.",
				);
			}
			return {
				...this.publicObservation(route, observation),
				effort,
				verified: true,
				uiSteps: steps,
			};
		});
	}

	private requireControls(route: FrontendRoute): void {
		if (route.provider !== "chatgpt")
			throw new FrontendError(
				"controls_unsupported",
				"Intelligence controls are not supported for this provider.",
			);
	}

	private checkAvailable(observation: FrontendObservation, value: number): void {
		if (
			observation.disabled ||
			observation.minimum === null ||
			observation.maximum === null ||
			value < observation.minimum ||
			value > observation.maximum
		) {
			throw new FrontendError(
				"effort_unavailable",
				"The requested intelligence level is unavailable on this frontend.",
			);
		}
	}

	private route(id: string): FrontendRoute {
		const route = this.routes.find((candidate) => candidate.id === id);
		if (!route)
			throw new FrontendError(
				"route_missing",
				"Configure an explicit retained frontend route first.",
			);
		validateFrontendBinding(route);
		if (route.transport === "agent_browser_task")
			throw new FrontendError(
				"native_transport_required",
				"Native consumer routes require the closed native adapter; legacy probes are unavailable.",
			);
		if (!route.expectedModel || !["chatgpt", "grok", "claude"].includes(route.provider))
			throw new FrontendError("invalid_route", "The retained route or provider is invalid.");
		let url: URL;
		try {
			url = new URL(route.expectedUrl);
		} catch {
			throw new FrontendError("invalid_route", "The route URL is invalid.");
		}
		if (
			url.protocol !== "https:" ||
			url.hostname !==
				(route.provider === "grok"
					? "grok.com"
					: route.provider === "claude"
						? "claude.ai"
						: "chatgpt.com") ||
			url.username ||
			url.password ||
			url.port ||
			(route.provider === "claude" && !isClaudeFrontendUrl(route.expectedUrl))
		)
			throw new FrontendError(
				"origin_mismatch",
				"The route must name an exact provider HTTPS page.",
			);
		return route;
	}

	private request(
		route: FrontendRoute,
		request: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		return this.broker(frontendRequest(route, request), route.profileCapabilityEnv);
	}

	private checkTarget(route: FrontendRoute, result: Record<string, unknown>): void {
		if (result.targetId !== frontendTargetId(route))
			throw new FrontendError("target_mismatch", "The broker returned a different target.");
	}

	private async observe(route: FrontendRoute): Promise<FrontendObservation> {
		const result = await this.request(route, {
			action: "probe",
			timeoutMs: 5000,
			maxReturnBytes: 16384,
			probe: {
				recipeId: "auracall-chatgpt-frontend-v1",
				detectors: [
					{ id: "frontend", type: "evaluate", expression: chatgptInspectionExpression() },
				],
			},
		});
		this.checkTarget(route, result);
		if (result.ok !== true || result.url !== route.expectedUrl)
			throw new FrontendError(
				"origin_mismatch",
				"The retained page no longer matches the configured URL.",
			);
		const detectors = Array.isArray(result.detectors)
			? result.detectors.filter((item) => record(item) && item.id === "frontend")
			: [];
		const detector = detectors[0];
		if (
			detectors.length !== 1 ||
			!record(detector) ||
			detector.ok !== true ||
			detector.resultTruncated === true ||
			!record(detector.result)
		)
			throw new FrontendError(
				"probe_failed",
				"The frontend detector did not return complete evidence.",
			);
		const observation = detector.result as unknown as FrontendObservation;
		if (observation.url !== route.expectedUrl)
			throw new FrontendError("origin_mismatch", "The frontend URL changed during observation.");
		if (observation.model !== route.expectedModel)
			throw new FrontendError(
				"model_drift",
				"The visible model differs from the configured model.",
			);
		if (
			![observation.value, observation.minimum, observation.maximum].every(sliderValue) ||
			(observation.minimum !== null &&
				observation.maximum !== null &&
				observation.minimum > observation.maximum) ||
			(observation.label !== null && typeof observation.label !== "string") ||
			typeof observation.disabled !== "boolean" ||
			!selector(observation.openSelector) ||
			!selector(observation.sliderSelector) ||
			typeof observation.sliderFocused !== "boolean" ||
			!Array.isArray(observation.controls) ||
			observation.controls.some(
				(item) =>
					!record(item) ||
					!selector(item.selector) ||
					item.selector === null ||
					!Number.isInteger(item.value) ||
					typeof item.disabled !== "boolean",
			)
		)
			throw new FrontendError("probe_failed", "The frontend control evidence is invalid.");
		return observation;
	}

	private publicObservation(
		route: FrontendRoute,
		observation: FrontendObservation,
	): Record<string, unknown> {
		return {
			ok: true,
			routeId: route.id,
			provider: route.provider,
			model: observation.model,
			url: observation.url,
			effort: interpretChatgptPowerSlider(observation.value, observation.label),
			label: observation.label,
			availableValues:
				!observation.disabled &&
				observation.sliderSelector &&
				observation.minimum !== null &&
				observation.maximum !== null
					? Array.from(
							{ length: observation.maximum - observation.minimum + 1 },
							(_, index) => Number(observation.minimum) + index,
						)
					: [],
			liveVerified: false,
		};
	}

	private async serial<T>(route: FrontendRoute, operation: () => Promise<T>): Promise<T> {
		const id = frontendTargetKey(route);
		const previous = this.locks.get(id) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.locks.set(id, current);
		await previous;
		try {
			return await this.requestStore.withLock(frontendTargetKey(route), "controls", operation);
		} finally {
			release();
			if (this.locks.get(id) === current) this.locks.delete(id);
		}
	}
}
