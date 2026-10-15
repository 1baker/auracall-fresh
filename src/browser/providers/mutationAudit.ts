import type { BrowserMutationAuditSink } from "../../../packages/browser-service/src/service/mutationDispatcher.js";
import type {
	ProviderTrafficAuthority,
	ProviderTrafficGovernor,
} from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import {
	isKnownBackendRequestBudgetDenial,
	ProviderTrafficWarningError,
} from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { OwnedBackendRequestCleanupError } from "../ownedBackendRequestAuthority.js";
import type { ChromeClient } from "../types.js";
import { attachOwnedChatgptBackendRequestAdmission } from "./chatgptBackendRequestAdmission.js";
import type { BrowserProviderListOptions } from "./types.js";

type MutationContextCarrier = {
	__auracallMutationAudit?: BrowserMutationAuditSink;
	__auracallMutationSourcePrefix?: string;
	__auracallProviderTrafficGovernor?: ProviderTrafficGovernor;
	__auracallProviderTrafficRequired?: boolean;
	__auracallProviderTrafficAuthority?: ProviderTrafficAuthority;
	__auracallResponseObserver?: { dispose(): Promise<void> };
};

function asMutationContextCarrier(value: unknown): MutationContextCarrier | null {
	return typeof value === "object" && value !== null ? (value as MutationContextCarrier) : null;
}

function isBrowserProviderListOptions(value: unknown): value is BrowserProviderListOptions {
	return (
		typeof value === "object" &&
		value !== null &&
		("mutationAudit" in value ||
			"mutationSourcePrefix" in value ||
			"providerTrafficGovernor" in value)
	);
}

function normalizeMutationSourcePrefix(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

export async function annotateClientMutationContext(
	client: ChromeClient,
	options: BrowserProviderListOptions | undefined,
	defaultSourcePrefix: string,
	resolvedTargetId?: string,
): Promise<void> {
	const extendedClient = client as ChromeClient & MutationContextCarrier;
	const targetId = resolvedTargetId?.trim() || options?.tabTargetId?.trim();
	const authority =
		!options?.providerTrafficGovernor && options?.providerTrafficAuthorityFactory && targetId
			? await options.providerTrafficAuthorityFactory.acquire({ targetId })
			: undefined;
	if (options?.providerTrafficRequired && !options.providerTrafficGovernor && !authority) {
		throw new Error(
			`Provider traffic authority is unavailable for target ${targetId || "unknown"}.`,
		);
	}
	const nextGovernor = options?.providerTrafficGovernor ?? authority?.governor;
	if (
		nextGovernor?.attribution.provider === "chatgpt" &&
		nextGovernor.attribution.targetId &&
		nextGovernor.attribution.targetId !== targetId
	) {
		throw new Error("Provider response target does not match its owned authority.");
	}

	extendedClient.__auracallMutationAudit = options?.mutationAudit;
	extendedClient.__auracallProviderTrafficGovernor =
		options?.providerTrafficGovernor ?? authority?.governor;
	extendedClient.__auracallProviderTrafficRequired =
		options?.providerTrafficRequired === true ||
		options?.providerTrafficGovernor !== undefined ||
		options?.providerTrafficAuthorityFactory !== undefined;
	extendedClient.__auracallProviderTrafficAuthority = authority;
	extendedClient.__auracallMutationSourcePrefix =
		normalizeMutationSourcePrefix(options?.mutationSourcePrefix) ?? defaultSourcePrefix;
	await extendedClient.__auracallResponseObserver?.dispose();
	extendedClient.__auracallResponseObserver = undefined;
	const governor = extendedClient.__auracallProviderTrafficGovernor;
	let observer: { dispose(): Promise<void> } | undefined;
	let backendObserver: { dispose(): Promise<void> } | undefined;
	if (governor?.attribution.provider === "chatgpt" && governor.attribution.targetId) {
		if (client.Network?.responseReceived && governor.checkWarning) {
			const pending = new Set<Promise<void>>();
			let failure: unknown;
			let disposed = false;
			const handler = (event: { response: { url: string; status: number } }) => {
				if (disposed || event.response.status !== 429) return Promise.resolve();
				const task =
					governor
						.checkWarning?.({ nativeProviderResponse: event.response })
						.catch((error: unknown) => {
							if (!(error instanceof ProviderTrafficWarningError)) failure = error;
						}) ?? Promise.resolve();
				pending.add(task);
				void task.finally(() => pending.delete(task));
				return task;
			};
			const subscription: unknown = client.Network.responseReceived(handler);
			observer = {
				async dispose() {
					disposed = true;
					if (typeof subscription === "function") subscription();
					else
						(
							client as ChromeClient & {
								removeListener?: (event: string, callback: typeof handler) => void;
							}
						).removeListener?.("Network.responseReceived", handler);
					await Promise.all(pending);
					if (failure) throw failure;
				},
			};
			extendedClient.__auracallResponseObserver = observer;
		}
	}
	if (authority || observer || governor?.admitBackendRequest) {
		const failClose = (error: unknown): never => {
			if (governor?.admitBackendRequest && !isKnownBackendRequestBudgetDenial(error))
				throw new OwnedBackendRequestCleanupError(error);
			throw error;
		};
		const close = client.close.bind(client);
		let closed = false;
		client.close = async () => {
			if (closed) return;
			closed = true;
			let closeError: unknown = null;
			try {
				const failures: unknown[] = [];
				// Backend callbacks can deliver a native warning while they drain.
				for (const dispose of [() => backendObserver?.dispose(), () => observer?.dispose()]) {
					try {
						await dispose();
					} catch (error) {
						failures.push(error);
					}
				}
				if (failures.length)
					throw new AggregateError(failures, "Provider observer cleanup failed.");
			} catch (error) {
				closeError = error;
			}
			try {
				await close();
			} catch (error) {
				closeError = closeError
					? new AggregateError(
							[closeError, error],
							"Provider warning persistence and transport cleanup failed.",
						)
					: error;
			}
			try {
				await authority?.close({
					outcome: closeError ? "failed" : "succeeded",
					effectState: closeError
						? isKnownBackendRequestBudgetDenial(closeError)
							? "none"
							: "outcome-unknown"
						: "settled",
					reason: closeError instanceof Error ? closeError.message : null,
				});
			} catch (error) {
				failClose(
					closeError
						? new AggregateError(
								[closeError, error],
								"Provider cleanup and authority settlement failed.",
							)
						: error,
				);
			}
			if (closeError) failClose(closeError);
		};
	}
	if (observer) {
		try {
			await client.Network.enable();
		} catch (error) {
			try {
				await client.close();
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					"Provider response observer setup and cleanup failed.",
				);
			}
			throw error;
		}
	}
	if (governor?.admitBackendRequest) {
		try {
			backendObserver = await attachOwnedChatgptBackendRequestAdmission(client, governor);
		} catch (error) {
			try {
				await client.close();
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					"Backend admission setup and cleanup failed.",
				);
			}
			throw error;
		}
	}
}

export function resolveProviderTrafficGovernor(
	clientOrOptions: unknown,
): ProviderTrafficGovernor | undefined {
	if (!clientOrOptions) return undefined;
	if (isBrowserProviderListOptions(clientOrOptions)) return clientOrOptions.providerTrafficGovernor;
	return asMutationContextCarrier(clientOrOptions)?.__auracallProviderTrafficGovernor;
}

export function resolveMutationAudit(
	clientOrOptions: unknown,
): BrowserMutationAuditSink | undefined {
	if (!clientOrOptions) {
		return undefined;
	}
	if (isBrowserProviderListOptions(clientOrOptions)) {
		return clientOrOptions.mutationAudit;
	}
	return asMutationContextCarrier(clientOrOptions)?.__auracallMutationAudit;
}

export function resolveMutationSource(
	clientOrOptions: unknown,
	defaultSourcePrefix: string,
	action: string,
): string {
	const explicitPrefix = isBrowserProviderListOptions(clientOrOptions)
		? normalizeMutationSourcePrefix(clientOrOptions.mutationSourcePrefix)
		: normalizeMutationSourcePrefix(
				asMutationContextCarrier(clientOrOptions)?.__auracallMutationSourcePrefix,
			);
	const prefix = explicitPrefix ?? defaultSourcePrefix;
	return `${prefix}:${action}`;
}
