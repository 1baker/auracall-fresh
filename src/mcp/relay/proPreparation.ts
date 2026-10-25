import type { FrontendTools } from "../../browser/frontends/config.js";
import { frontendRouteBinding, frontendTargetKey } from "../../browser/frontends/requestStore.js";
import { validateFrontendBinding } from "../../browser/frontends/route.js";
import type { FrontendRoute } from "../../browser/frontends/types.js";
import { RelayError, type RelayStore, relayId } from "./store.js";

/** Only control preparation; the supplied interface has no Send or claim method. */
export async function prepareRelayProOnly(input: {
	store: RelayStore;
	operationId: string;
	route: FrontendRoute;
	frontend: Pick<FrontendTools, "configure" | "inspect">;
}) {
	const { store, operationId, route, frontend } = input;
	if (
		!relayId.safeParse(operationId).success ||
		route.provider !== "chatgpt" ||
		!route.id ||
		route.id.length > 128 ||
		!route.expectedModel ||
		route.expectedModel.length > 256 ||
		!/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(route.expectedUrl)
	)
		throw new RelayError("relay_pro_preparation_invalid");
	validateFrontendBinding(route);
	const binding = frontendRouteBinding(route),
		targetKey = frontendTargetKey(route);
	const { id, expectedUrl, expectedModel } = route;
	const assertBinding = () => {
		if (frontendRouteBinding(route) !== binding || frontendTargetKey(route) !== targetKey)
			throw new RelayError("relay_pro_preparation_binding_mismatch");
	};
	const qualify = (observed: Record<string, unknown>) => {
		if (
			observed.ok !== true ||
			observed.provider !== "chatgpt" ||
			observed.url !== expectedUrl ||
			(observed.routeId !== undefined && observed.routeId !== id)
		)
			throw new RelayError("relay_frontend_target_unqualified");
		if (observed.model !== expectedModel || observed.effort !== "pro")
			throw new RelayError("relay_frontend_model_unqualified");
	};
	return store.prepareProOnly(
		operationId,
		{
			routeId: id,
			expectedUrl,
			expectedModel,
			binding,
			targetKey,
		},
		async () => {
			assertBinding();
			const configured = await frontend.configure(id, "pro");
			assertBinding();
			if (configured.ok !== true || configured.verified !== true)
				throw new RelayError("relay_frontend_configuration_unconfirmed");
			qualify(configured);
			// Independent inspection is required; a configuration ACK is not the final proof.
			const observed = await frontend.inspect(id);
			assertBinding();
			qualify(observed);
		},
	);
}
