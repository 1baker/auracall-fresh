import { requireInactiveChatgptTab, type probeChatgptTabActivity } from "./chatgptTabActivity.js";
import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	retireExpiredTabLeases,
	type TabLeaseRetirementEndpoint,
	type TabLeaseRetirementOutcome,
} from "../../packages/browser-service/src/service/tabLeaseRetirement.js";
import { UNOWNED_TAB_WORKLOAD_PREFIX } from "../../packages/browser-service/src/service/tabInventory.js";

export function retireExpiredChatgptTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	endpoint: TabLeaseRetirementEndpoint | null;
	now?: () => Date;
	inspectTarget: (
		endpoint: TabLeaseRetirementEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	closeTarget: (endpoint: TabLeaseRetirementEndpoint, targetId: string) => Promise<void>;
	endpointAbsenceProvesTargetsMissing?: boolean;
	probeActivity?: typeof probeChatgptTabActivity;
	retireAllExpiredPages?: boolean;
}): Promise<TabLeaseRetirementOutcome[]> {
	return retireExpiredTabLeases({
		registry: input.registry,
		scope: input.scope,
		now: input.now,
		resolveEndpoint: async () => input.endpoint,
		inspectTarget: input.inspectTarget,
		closeTarget: async (endpoint, targetId) => {
			await requireInactiveChatgptTab(endpoint, targetId, input.probeActivity);
			await input.closeTarget(endpoint, targetId);
		},
		endpointAbsenceProvesTargetsMissing: input.endpointAbsenceProvesTargetsMissing,
		targetMatchesLease: input.retireAllExpiredPages ? () => true : chatgptTargetMatchesLease,
	});
}

export function chatgptTargetMatchesLease(
	lease: BrowserTabLease,
	target: { url: string },
): boolean {
	// These are observed physical pages in this exact managed browser, not a
	// conversation binding. Their deadline survives page navigation.
	if (
		lease.workload.kind === "ephemeral" &&
		lease.workload.operationId.startsWith(UNOWNED_TAB_WORKLOAD_PREFIX)
	)
		return true;
	if (!lease.targetFingerprint) return false;
	try {
		const actual = new URL(target.url);
		const expected = new URL(lease.targetFingerprint);
		if (actual.hostname !== expected.hostname) return false;
		if (lease.workload.kind === "conversation") {
			const match = actual.pathname.match(/\/c\/([^/?#]+)/);
			return Boolean(match?.[1] && decodeURIComponent(match[1]) === lease.workload.conversationId);
		}
		if (lease.workload.kind === "live-follow") return true;
		return normalizeRoute(actual) === normalizeRoute(expected);
	} catch {
		return false;
	}
}

function normalizeRoute(url: URL): string {
	return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
}
