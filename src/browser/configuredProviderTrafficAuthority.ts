import { randomUUID } from "node:crypto";

import { createBrowserInteractionGovernor } from "../../packages/browser-service/src/service/interactionGovernor.js";
import { createLedgerBackedBrowserInteractionGovernor } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserMutationAuditSink } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	createProviderTrafficGovernor,
	ProviderBackendRequestBudgetExceededError,
	type ProviderTrafficAuthorityFactory,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type {
	TabLeaseClaim,
	TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import { resolveChatgptInteractionsPerMinute } from "../runtime/tenantExecutionLimits.js";
import { probeChatgptRateLimitWarning } from "./chatgptProviderTraffic.js";
import { recordChatgptRateLimitDetection } from "./chatgptRateLimitGuard.js";
import type { ProviderId } from "./providers/domain.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

const PROVIDER_TRAFFIC_IDLE_TTL_MS = 5 * 60_000;
const PROVIDER_TRAFFIC_ABSOLUTE_TTL_MS = 60 * 60_000;

export function createConfiguredProviderTrafficAuthorityFactory(input: {
	userConfig: ResolvedUserConfig;
	mutationAudit: BrowserMutationAuditSink;
	provider: ProviderId;
	managedBrowserProfile: string;
	baseOptions: BrowserProviderListOptions;
	now?: () => Date;
	backendRequestLimit?: number;
}): ProviderTrafficAuthorityFactory {
	if (
		input.backendRequestLimit !== undefined &&
		(!Number.isSafeInteger(input.backendRequestLimit) || input.backendRequestLimit < 1)
	) {
		throw new Error("Backend request limit must be a positive safe integer.");
	}
	const now = input.now ?? (() => new Date());
	const runtime = createBrowserTabConcurrencyRuntime(input.userConfig);
	if (!runtime.registry || !runtime.ledger) {
		throw new Error("Provider traffic authority requires durable coordination stores.");
	}
	const registry = runtime.registry;
	const ledger = runtime.ledger;
	const runtimeProfileId = input.userConfig.auracallProfile?.trim() || "default";
	const managedBrowserProfile = requireValue(
		input.managedBrowserProfile,
		"managed browser profile",
	);
	const tenantKey =
		resolveConfiguredServiceAccountId(input.userConfig as Record<string, unknown>, {
			serviceId: input.provider,
			runtimeProfileId,
		}) ?? `managed-browser:${managedBrowserProfile}`;
	const scope: TabLeaseScope = {
		runtimeProfileId,
		managedBrowserProfile,
		service: input.provider,
		tenantKey,
	};

	return {
		async acquire({ targetId }) {
			const operationId = `provider-traffic-${randomUUID()}`;
			const workloadId = `provider-client:${operationId}`;
			const reserved = await registry.reserve({
				scope,
				targetId: requireValue(targetId, "target ID"),
				workload: { kind: "ephemeral", operationId },
				operationId,
				now: now().toISOString(),
				idleTtlMs: PROVIDER_TRAFFIC_IDLE_TTL_MS,
				absoluteTtlMs: PROVIDER_TRAFFIC_ABSOLUTE_TTL_MS,
			});
			if (!reserved.ok) {
				throw new Error(`Provider traffic lease reservation failed: ${reserved.conflict.kind}.`);
			}
			let claim: TabLeaseClaim = reserved.value.claim;
			let backendBudgetDenied = false;
			const assertOwnedLease = async () => {
				const lease = (await registry.list({ scope, states: ["active"] })).find(
					(candidate) => candidate.leaseId === reserved.value.lease.leaseId,
				);
				if (
					!lease ||
					lease.ownerOperationId !== operationId ||
					lease.targetId !== targetId ||
					lease.revision !== claim.revision
				) {
					throw new Error("Provider traffic lease ownership changed before physical action.");
				}
			};
			const interactionGovernor = createLedgerBackedBrowserInteractionGovernor({
				ledger,
				scope: { provider: input.provider, tenantKey, runtimeProfileId, managedBrowserProfile },
				workloadId,
				operationId,
				tabLeaseId: reserved.value.lease.leaseId,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxInteractionsPerMinute:
						input.provider === "chatgpt"
							? resolveChatgptInteractionsPerMinute(
									input.userConfig as Record<string, unknown>,
									runtimeProfileId,
								)
							: null,
				},
				baseGovernor:
					input.baseOptions.interactionGovernor ??
					createBrowserInteractionGovernor({ abortSignal: input.baseOptions.abortSignal }),
				now,
			});
			const governor = createProviderTrafficGovernor({
				attribution: {
					provider: input.provider,
					runtimeProfileId,
					managedBrowserProfile,
					workloadId,
					operationId,
					tabLeaseId: reserved.value.lease.leaseId,
					targetId,
				},
				interactionGovernor,
				mutationAudit: input.baseOptions.mutationAudit ?? input.mutationAudit,
				settleInteraction: (settlement) => interactionGovernor.finish(settlement),
				assertLease: assertOwnedLease,
				admitBackendRequest:
					input.provider === "chatgpt" && input.backendRequestLimit !== undefined
						? async (requestKey, effect) => {
								const admission = await ledger.reserve({
									scope: {
										provider: input.provider,
										tenantKey,
										runtimeProfileId,
										managedBrowserProfile,
									},
									workloadId,
									operationId,
									tabLeaseId: reserved.value.lease.leaseId,
									interactionClass: "backend-request",
									mutability: "provider-mutating",
									startsNewConversation: false,
									backendRequestKey: requestKey,
									now: now().toISOString(),
									reservationTtlMs: 30_000,
									policy: {
										maxConcurrentChats: null,
										maxConversationStartsPerHour: null,
										maxConversationStartsPerDay: null,
										maxBackendRequestsPerMinute: input.backendRequestLimit,
									},
								});
								if (!admission.allowed) {
									if (admission.reason === "minute-backend-request-limit") {
										backendBudgetDenied = true;
										throw new ProviderBackendRequestBudgetExceededError();
									}
									throw new Error(`Backend request admission denied: ${admission.reason}.`);
								}
								if (admission.duplicate) return;
								let started = false;
								try {
									await assertOwnedLease();
									const transition = await ledger.start({
										reservationId: admission.reservation.reservationId,
										startedAt: now().toISOString(),
									});
									if (!transition.ok)
										throw new Error(`Backend request start denied: ${transition.reason}.`);
									started = true;
									await assertOwnedLease();
									await effect();
									const settled = await ledger.settle({
										reservationId: admission.reservation.reservationId,
										settledAt: now().toISOString(),
										effectState: "settled",
										outcome: "succeeded",
									});
									if (!settled.ok)
										throw new Error(`Backend request settlement failed: ${settled.reason}.`);
								} catch (error) {
									if (started)
										try {
											const settled = await ledger.settle({
												reservationId: admission.reservation.reservationId,
												settledAt: now().toISOString(),
												effectState: "outcome-unknown",
												outcome: "failed",
											});
											if (!settled.ok)
												throw new Error(`Backend request settlement failed: ${settled.reason}.`);
										} catch (settlementError) {
											throw new AggregateError(
												[error, settlementError],
												"Backend dispatch and settlement failed.",
											);
										}
									throw error;
								}
							}
						: undefined,
				probeWarning: input.provider === "chatgpt" ? probeChatgptRateLimitWarning : undefined,
				persistWarning:
					input.provider === "chatgpt"
						? async (warning) => {
								const observedAt = now();
								await ledger.recordProviderWarning({
									scope: {
										provider: input.provider,
										tenantKey,
										runtimeProfileId,
										managedBrowserProfile,
									},
									classification: warning.classification,
									reason: warning.reason,
									observedAt: observedAt.toISOString(),
									cooldownUntil: warning.cooldownUntil,
								});
								await recordChatgptRateLimitDetection({
									profileName: runtimeProfileId,
									managedProfileDir: managedBrowserProfile,
									action: `provider-traffic:${operationId}`,
									reason: warning.reason,
									now: observedAt.getTime(),
								});
							}
						: undefined,
			});
			let closed = false;
			return {
				governor,
				async close(settlement = {}) {
					if (closed) return;
					closed = true;
					let effectState = settlement.effectState ?? "settled";
					if (input.backendRequestLimit !== undefined) {
						const records = (await ledger.list({ provider: input.provider, tenantKey })).filter(
							(record) =>
								record.tabLeaseId === reserved.value.lease.leaseId &&
								record.operationId === operationId,
						);
						if (
							records.some(
								(record) =>
									record.interactionClass === "backend-request" &&
									(record.state === "started" || record.effectState === "outcome-unknown"),
							)
						) {
							effectState = "outcome-unknown";
						} else if (backendBudgetDenied && effectState === "none") {
							if (
								records.some(
									(record) =>
										record.state === "started" || record.effectState === "outcome-unknown",
								)
							)
								effectState = "outcome-unknown";
							else if (records.some((record) => record.effectState === "settled"))
								effectState = "settled";
						}
					}
					await interactionGovernor.close({ ...settlement, effectState });
					const used = await registry.recordMeaningfulUse({
						claim,
						now: now().toISOString(),
						idleTtlMs: PROVIDER_TRAFFIC_IDLE_TTL_MS,
						effectState,
					});
					if (!used.ok) {
						throw new Error(`Provider traffic lease settlement failed: ${used.conflict.kind}.`);
					}
					claim = used.value.claim;
					const idled = await registry.idle({
						claim,
						now: now().toISOString(),
						effectState,
					});
					if (!idled.ok) {
						throw new Error(`Provider traffic lease idle failed: ${idled.conflict.kind}.`);
					}
					const released = await registry.releasePreserved({
						leaseId: idled.value.leaseId,
						expectedRevision: idled.value.revision,
						now: now().toISOString(),
					});
					if (!released.ok) {
						throw new Error(`Provider traffic lease release failed: ${released.conflict.kind}.`);
					}
				},
			};
		},
	};
}

function requireValue(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`Provider traffic authority requires ${name}.`);
	return normalized;
}
