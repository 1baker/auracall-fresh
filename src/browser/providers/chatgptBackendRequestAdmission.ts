import { createHash, randomUUID } from "node:crypto";
import type Protocol from "devtools-protocol";
import {
	CdpCommandCancelledBeforeSendError,
	holdCdpCommandAdmission,
	withCdpCommandTimeout,
} from "../../../packages/browser-service/src/guardedCdp.js";
import {
	ProviderBackendRequestCancelledBeforeDispatchError,
	type ProviderTrafficGovernor,
} from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type { ChromeClient } from "../types.js";

export async function attachOwnedChatgptBackendRequestAdmission(
	client: ChromeClient,
	governor: ProviderTrafficGovernor,
	options?: { abortSignal?: AbortSignal },
): Promise<{ dispose(): Promise<void> }> {
	const admit = governor.admitBackendRequest?.bind(governor);
	if (!admit || !governor.attribution.targetId)
		throw new Error("Owned backend request admission is unavailable.");
	const hold = await holdCdpCommandAdmission(client, options);
	const namespace = randomUUID();
	const requests = new Map<string, Promise<void>>();
	const pending = new Set<Promise<void>>();
	let closing = false;
	let interceptionShutdown: Promise<unknown> | undefined;
	const cancellation = new AbortController();
	const failures: unknown[] = [];
	const nativeRequests = new Map<string, Set<AbortController>>();
	const frameRequests = new Map<string, Set<AbortController>>();
	const documentReplaced = (event: Protocol.Page.FrameNavigatedEvent) => {
		// A document replacement can invalidate Fetch IDs without loadingFailed.
		// Cancel only queued requests belonging to that exact frame; the guarded
		// SDK boundary still decides whether cancellation proves no dispatch.
		for (const controller of frameRequests.get(event.frame.id) ?? [])
			controller.abort(new DOMException("Native request document replaced.", "AbortError"));
	};
	const observesDocumentReplacement = typeof client.Page?.frameNavigated === "function";
	const documentSubscription: unknown = observesDocumentReplacement
		? client.Page.frameNavigated(documentReplaced)
		: undefined;
	const cancelledNativeRequests = new Set<string>();
	const nativeFailure = (event: Protocol.Network.LoadingFailedEvent) => {
		if (event.canceled !== true) return;
		cancelledNativeRequests.add(event.requestId);
		for (const controller of nativeRequests.get(event.requestId) ?? [])
			controller.abort(new DOMException("Native backend request cancelled.", "AbortError"));
	};
	const observesNativeFailure = typeof client.Network.loadingFailed === "function";
	const nativeSubscription: unknown = observesNativeFailure
		? client.Network.loadingFailed(nativeFailure)
		: undefined;
	const failPausedRequest = async (requestId: string, knownNotDispatched: boolean) => {
		try {
			await withCdpCommandTimeout(
				client,
				{
					timeoutMs: 3_000,
					timeoutMessage: "Owned backend request cancellation command timed out.",
				},
				() => client.Fetch.failRequest({ requestId, errorReason: "BlockedByClient" }),
			);
		} catch (error) {
			// Chrome can cancel a paused resource while admission is being drained.
			// Only a proven pre-dispatch request may treat its disappearance as settled.
			if (
				!(
					knownNotDispatched &&
					error instanceof Error &&
					error.message === "Invalid InterceptionId."
				)
			)
				throw error;
		}
	};
	const handler = (event: Protocol.Fetch.RequestPausedEvent): Promise<void> => {
		// Events already queued by Chrome may arrive while disable is admitted.
		// Its outcome owns those events; never enqueue commands behind domain shutdown.
		// A failed disable is still propagated by dispose, not hidden by this barrier.
		if (interceptionShutdown)
			return interceptionShutdown.then(
				() => undefined,
				() => undefined,
			);
		const existing = requests.get(event.requestId);
		if (existing) return existing;
		const nativeCancellation = new AbortController();
		const requestSignal = AbortSignal.any([cancellation.signal, nativeCancellation.signal]);
		if (event.frameId) {
			const controllers = frameRequests.get(event.frameId) ?? new Set<AbortController>();
			controllers.add(nativeCancellation);
			frameRequests.set(event.frameId, controllers);
		}
		if (event.networkId) {
			const controllers = nativeRequests.get(event.networkId) ?? new Set<AbortController>();
			controllers.add(nativeCancellation);
			nativeRequests.set(event.networkId, controllers);
			if (cancelledNativeRequests.has(event.networkId))
				nativeCancellation.abort(
					new DOMException("Native backend request cancelled.", "AbortError"),
				);
		}
		const task = hold
			.run("Provider.backendRequest", async () => {
				if (closing) {
					await failPausedRequest(event.requestId, true);
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
					await admit(
						key,
						async () => {
							try {
								await withCdpCommandTimeout(
									client,
									{
										timeoutMs: 3_000,
										timeoutMessage: "Owned backend request continuation timed out.",
										abortSignal: requestSignal,
									},
									() => client.Fetch.continueRequest({ requestId: event.requestId }),
								);
							} catch (error) {
								if (error instanceof CdpCommandCancelledBeforeSendError)
									throw new ProviderBackendRequestCancelledBeforeDispatchError({ cause: error });
								throw error;
							}
						},
						requestSignal,
						client.Runtime,
					);
				} catch (error) {
					if (!(error instanceof ProviderBackendRequestCancelledBeforeDispatchError))
						failures.push(error);
					await failPausedRequest(
						event.requestId,
						error instanceof ProviderBackendRequestCancelledBeforeDispatchError,
					);
				}
			})
			.catch((error) => {
				failures.push(error);
			});
		requests.set(event.requestId, task);
		pending.add(task);
		void task.then(() => {
			pending.delete(task);
			if (event.frameId) {
				const controllers = frameRequests.get(event.frameId);
				controllers?.delete(nativeCancellation);
				if (controllers?.size === 0) frameRequests.delete(event.frameId);
			}
			if (event.networkId) {
				const controllers = nativeRequests.get(event.networkId);
				controllers?.delete(nativeCancellation);
				if (controllers?.size === 0) nativeRequests.delete(event.networkId);
			}
		});
		return task;
	};
	const subscription: unknown = client.Fetch.requestPaused(handler);
	const dispose = async () => {
		closing = true;
		cancellation.abort();
		while (pending.size) await Promise.all(pending);
		interceptionShutdown = withCdpCommandTimeout(
			client,
			{
				timeoutMs: 3_000,
				timeoutMessage: "Owned backend request interception shutdown timed out.",
			},
			() => client.Fetch.disable(),
		);
		await interceptionShutdown;
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
		if (typeof nativeSubscription === "function") nativeSubscription();
		else if (observesNativeFailure) {
			const remove = (
				client as ChromeClient & {
					removeListener?: (event: string, callback: typeof nativeFailure) => void;
				}
			).removeListener;
			if (!remove) throw new Error("Native request cancellation listener cleanup is unavailable.");
			remove.call(client, "Network.loadingFailed", nativeFailure);
		}
		if (typeof documentSubscription === "function") documentSubscription();
		else if (observesDocumentReplacement) {
			const remove = (
				client as ChromeClient & {
					removeListener?: (event: string, callback: typeof documentReplaced) => void;
				}
			).removeListener;
			if (!remove) throw new Error("Document replacement listener cleanup is unavailable.");
			remove.call(client, "Page.frameNavigated", documentReplaced);
		}
		frameRequests.clear();
		nativeRequests.clear();
		cancelledNativeRequests.clear();
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
