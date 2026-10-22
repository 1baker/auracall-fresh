import type { FrontendTools } from "../../browser/frontends/config.js";
import { FrontendError } from "../../browser/frontends/types.js";
import type { FrontendPrincipal, FrontendScope } from "./auth.js";

/** One configured resource owner; preserve the existing shared receipt store and target locks. */
export function scopedFrontendTools(
	service: FrontendTools,
	principal: FrontendPrincipal,
	routeIds: readonly string[],
): FrontendTools {
	const allowed = new Set(routeIds);
	const guard = (scope: FrontendScope, routeId: string) => {
		if (!principal.scopes.has(scope))
			throw new FrontendError("insufficient_scope", "The required frontend scope was not granted.");
		if (!allowed.has(routeId))
			throw new FrontendError("route_missing", "No authorized frontend route is available.");
	};
	return {
		inspect: async (id) => {
			guard("frontend:read", id);
			return service.inspect(id);
		},
		configure: async (id, effort) => {
			guard("frontend:configure", id);
			return service.configure(id, effort);
		},
		send: async (id, requestId, text, previousRequestId) => {
			guard("frontend:send", id);
			try {
				return await service.send(id, requestId, text, previousRequestId);
			} catch (error) {
				if (error instanceof FrontendError && error.code === "request_binding_mismatch")
					throw new FrontendError(
						"request_conflict",
						"This request ID already names different content.",
					);
				throw error;
			}
		},
		status: async (id, requestId) => {
			guard("frontend:read", id);
			try {
				return await service.status(id, requestId);
			} catch (error) {
				if (error instanceof FrontendError && error.code === "request_binding_mismatch")
					throw new FrontendError("request_missing", "No saved frontend request has this ID.");
				throw error;
			}
		},
	};
}
