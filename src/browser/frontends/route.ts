import { FrontendError, type FrontendRoute } from "./types.js";

const taskFields = ["authorityRef", "taskId", "profileId", "browserId", "tabId", "targetId"];
const record = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Validate routing metadata only. The connected Browser broker owns authorization. */
export function validateFrontendBinding(route: FrontendRoute): void {
	if (route.transport === "agent_browser_task") {
		const binding = route.nativeTask;
		if (
			route.provider !== "chatgpt" ||
			"serviceTabHandle" in route ||
			"profileCapabilityEnv" in route ||
			!record(binding) ||
			Object.keys(binding).some((key) => !taskFields.includes(key)) ||
			taskFields.some((key) => {
				const value = binding[key];
				return (
					typeof value !== "string" ||
					value.length === 0 ||
					value.length > 1024 ||
					value.trim() !== value ||
					[...value].some((character) => character.charCodeAt(0) < 32)
				);
			})
		)
			throw new FrontendError("invalid_route", "The native task binding is invalid.");
		return;
	}
	if (route.transport !== undefined && route.transport !== "service_request")
		throw new FrontendError("invalid_route", "The frontend transport is unsupported.");
	if (!route.profileCapabilityEnv || !/^[A-Z_][A-Z0-9_]*$/.test(route.profileCapabilityEnv))
		throw new FrontendError(
			"authority_missing",
			"The route needs an explicit broker capability environment variable.",
		);
	const handle = route.serviceTabHandle;
	if (
		"nativeTask" in route ||
		!record(handle) ||
		handle.valid !== true ||
		["browserId", "tabId", "targetId", "profileId"].some(
			(field) => typeof handle[field] !== "string" || !handle[field],
		) ||
		typeof (handle.sessionName ?? handle.ownerSessionId) !== "string" ||
		!(handle.sessionName ?? handle.ownerSessionId)
	)
		throw new FrontendError("invalid_route", "The retained frontend binding is invalid.");
}

export function frontendTarget(route: FrontendRoute): Record<string, unknown> {
	return route.transport === "agent_browser_task"
		? { ...route.nativeTask }
		: route.serviceTabHandle;
}

export const frontendTargetId = (route: FrontendRoute): unknown => frontendTarget(route).targetId;

/** Native tasks never travel in the legacy serviceTabHandle slot. */
export function frontendRequest(
	route: FrontendRoute,
	request: Record<string, unknown>,
): Record<string, unknown> {
	if (route.transport === "agent_browser_task")
		return {
			...request,
			serviceName: "AuraCall",
			agentName: "frontend-mcp",
			taskName: "frontend-controls",
			nativeTask: { ...route.nativeTask },
		};
	const handle = route.serviceTabHandle;
	return {
		serviceName: "AuraCall",
		agentName: "frontend-mcp",
		taskName: "frontend-controls",
		browserId: handle.browserId,
		sessionName: handle.sessionName ?? handle.ownerSessionId,
		targetId: handle.targetId,
		runtimeProfile: handle.profileId,
		serviceTabHandle: handle,
		repairPolicy: "reject_only",
		profileLeasePolicy: "reject",
		jobTimeoutMs: 5000,
		...request,
	};
}
