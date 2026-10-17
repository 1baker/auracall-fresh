import { createHash, randomUUID } from "node:crypto";
import type Protocol from "devtools-protocol";
import { holdCdpCommandAdmission } from "../../../packages/browser-service/src/guardedCdp.js";
import type { ProviderTrafficGovernor } from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type { ChromeClient } from "../types.js";

export async function attachOwnedChatgptBackendRequestAdmission(
	client: ChromeClient,
	governor: ProviderTrafficGovernor,
): Promise<{ dispose(): Promise<void> }> {
	const admit = governor.admitBackendRequest?.bind(governor);
	if (!admit || !governor.attribution.targetId)
		throw new Error("Owned backend request admission is unavailable.");
	const hold = await holdCdpCommandAdmission(client);
	const namespace = randomUUID();
	const requests = new Map<string, Promise<void>>();
	const pending = new Set<Promise<void>>();
	let closing = false;
	const failures: unknown[] = [];
	const handler = (event: Protocol.Fetch.RequestPausedEvent): Promise<void> => {
		const existing = requests.get(event.requestId);
		if (existing) return existing;
		const task = hold
			.run("Provider.backendRequest", async () => {
				if (closing) {
					await client.Fetch.failRequest({
						requestId: event.requestId,
						errorReason: "BlockedByClient",
					});
					return;
				}
				const url = new URL(event.request.url);
				if (
					!["https://chatgpt.com", "https://chat.openai.com"].includes(url.origin) ||
					!url.pathname.startsWith("/backend-api/")
				) {
					await client.Fetch.continueRequest({ requestId: event.requestId });
					return;
				}
				const key = `sha256:${createHash("sha256")
					.update(
						JSON.stringify([
							namespace,
							governor.attribution.targetId,
							governor.attribution.tabLeaseId,
							event.requestId,
						]),
					)
					.digest("hex")}`;
				try {
					await admit(key, async () => {
						await client.Fetch.continueRequest({ requestId: event.requestId });
					});
				} catch (error) {
					failures.push(error);
					await client.Fetch.failRequest({
						requestId: event.requestId,
						errorReason: "BlockedByClient",
					});
				}
			})
			.catch((error) => {
				failures.push(error);
			});
		requests.set(event.requestId, task);
		pending.add(task);
		void task.then(() => pending.delete(task));
		return task;
	};
	const subscription: unknown = client.Fetch.requestPaused(handler);
	const dispose = async () => {
		closing = true;
		while (pending.size) await Promise.all(pending);
		await client.Fetch.disable();
		while (pending.size) await Promise.all(pending);
		if (typeof subscription === "function") subscription();
		else {
			const remove = (
				client as ChromeClient & {
					removeListener?: (event: string, callback: typeof handler) => void;
				}
			).removeListener;
			if (!remove) throw new Error("Fetch listener cleanup is unavailable.");
			remove.call(client, "Fetch.requestPaused", handler);
		}
		// Keep custody until the guarded transport successfully disconnects.
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, "Owned backend request admission failed.");
	};
	try {
		await client.Fetch.enable({
			patterns: [
				{ urlPattern: "https://chatgpt.com/backend-api/*", requestStage: "Request" },
				{ urlPattern: "https://chat.openai.com/backend-api/*", requestStage: "Request" },
			],
		});
	} catch (error) {
		try {
			await dispose();
		} catch (cleanup) {
			throw new AggregateError([error, cleanup], "Backend request setup and cleanup failed.");
		}
		throw error;
	}
	return { dispose };
}
