import { retireExpiredTabLeases } from "../../packages/browser-service/src/service/tabLeaseRetirement.js";
import { access, mkdtemp, rm, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { BrowserAutomationClient } from "../../src/browser/client.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

afterEach(() => {
	setAuracallHomeDirOverrideForTest(null);
});

describe("browser tab concurrency runtime", () => {
	test("durably records the expiry request before close and its confirmed result", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-retirement-audit-"));
		try {
			const runtime = createBrowserTabConcurrencyRuntime({ browser: { tabConcurrencyMode: "tab-affinity" } } as never, { storageRoot: directory });
			if (!runtime.registry) throw new Error("fixture registry missing");
			const scope = { runtimeProfileId: "fixture", managedBrowserProfile: "/private/managed", service: "chatgpt", tenantKey: "private-account@example.invalid" };
			const reserved = await runtime.registry.reserve({ scope, targetId: "fixture-tab", workload: { kind: "conversation", conversationId: "fixture-conversation" }, operationId: "fixture-operation", now: "2026-10-12T12:00:00.000Z", idleTtlMs: 1000, absoluteTtlMs: 60000 });
			if (!reserved.ok) throw new Error("fixture reserve failed");
			await runtime.registry.idle({ claim: reserved.value.claim, now: "2026-10-12T12:00:00.500Z", effectState: "settled" });
			const journal = path.join(directory, "tab-leases", "retirement-events.v1.jsonl");
			let live = true;
			await retireExpiredTabLeases({ registry: runtime.registry, audit: runtime.retirementAudit, scope, now: () => new Date("2026-10-12T12:00:02.000Z"), resolveEndpoint: async () => ({ host: "127.0.0.1", port: 9222 }), inspectTarget: async () => live ? { url: "https://chatgpt.com/c/fixture-conversation" } : null, targetMatchesLease: () => true, closeTarget: async () => {
				const request = JSON.parse((await readFile(journal, "utf8")).trim());
				expect(request).toMatchObject({ phase: "close-requested", actorPid: process.pid, reason: "idle-expired", targetId: "fixture-tab", leaseId: reserved.value.lease.leaseId });
				live = false;
			} });
			const text = await readFile(journal, "utf8");
			const events = text.trim().split("\n").map(line => JSON.parse(line));
			expect(events).toHaveLength(2);
			expect(events[1]).toMatchObject({ phase: "retirement-finished", disposition: "closed", targetDisposition: "closed", reason: "idle-expired", idleExpiresAt: "2026-10-12T12:00:01.000Z" });
			expect(text).not.toContain(scope.tenantKey);
			expect(text).not.toContain(scope.managedBrowserProfile);
			if (process.platform !== "win32") expect((await stat(journal)).mode & 0o777).toBe(0o600);
		} finally { await rm(directory, { recursive: true, force: true }); }
	});

	test("keeps serialized execution while enabling durable traffic safety stores", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const runtime = createBrowserTabConcurrencyRuntime({ browser: {} } as never);

			expect(runtime).toMatchObject({
				mode: "serialized",
				enabled: false,
				storageRoot: path.join(directory, "browser-coordination"),
			});
			expect(runtime.registry).not.toBeNull();
			expect(runtime.ledger).not.toBeNull();
			await runtime.readStatus();
			await expect(access(path.join(directory, "browser-coordination"))).resolves.toBeUndefined();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("enables tab affinity only for explicit affinity mode", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const runtime = createBrowserTabConcurrencyRuntime({
				browser: { tabConcurrencyMode: "tab-affinity" },
			} as never);

			expect(runtime).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				storageRoot: path.join(directory, "browser-coordination"),
			});
			expect(runtime.registry).not.toBeNull();
			expect(runtime.ledger).not.toBeNull();

			const lease = await runtime.registry?.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
					service: "chatgpt",
					tenantKey: "tenant-1",
				},
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(lease?.ok).toBe(true);
			expect(await runtime.readStatus()).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				leaseCount: 1,
				interactionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("reports sanitized lease lifecycle and target action aggregates", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			const runtime = createBrowserTabConcurrencyRuntime(
				{ browser: { tabConcurrencyMode: "tab-affinity" } } as never,
				{
					storageRoot: path.join(directory, "coordination"),
					now: () => new Date("2026-09-24T12:02:00.000Z"),
				},
			);
			const registry = runtime.registry;
			const ledger = runtime.ledger;
			expect(registry).not.toBeNull();
			expect(ledger).not.toBeNull();
			if (!registry || !ledger) throw new Error("expected coordination stores");
			const usageReservation = await ledger.reserve({
				scope: {
					provider: "chatgpt",
					tenantKey: "tenant-usage-secret",
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
				},
				workloadId: "conversation-usage-secret",
				operationId: "operation-usage-secret",
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:00:30.000Z",
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
			expect(usageReservation.allowed).toBe(true);
			if (!usageReservation.allowed) throw new Error("expected usage reservation");
			await ledger.start({
				reservationId: usageReservation.reservation.reservationId,
				startedAt: "2026-09-24T12:00:31.000Z",
			});
			await ledger.settle({
				reservationId: usageReservation.reservation.reservationId,
				settledAt: "2026-09-24T12:00:32.000Z",
				effectState: "settled",
				outcome: "succeeded",
			});
			await ledger.recordProviderWarning({
				scope: {
					provider: "chatgpt",
					tenantKey: "tenant-secret",
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
				},
				classification: "rate-limit",
				reason: "provider warning secret",
				observedAt: "2026-09-24T12:01:00.000Z",
				cooldownUntil: "2026-09-24T12:12:00.000Z",
			});
			await ledger.reserve({
				scope: {
					provider: "chatgpt",
					tenantKey: "tenant-secret",
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
				},
				workloadId: "conversation-rejected-secret",
				operationId: "operation-rejected-secret",
				interactionClass: "prompt-continuation",
				mutability: "provider-mutating",
				startsNewConversation: false,
				now: "2026-09-24T12:01:30.000Z",
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});

			const reserved = await registry.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
					service: "chatgpt",
					tenantKey: "tenant-1",
				},
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-secret" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(reserved.ok).toBe(true);
			if (!reserved.ok) throw new Error("expected tab lease reservation");

			const action = await registry.recordTargetAction({
				claim: reserved.value.claim,
				action: "navigation",
				occurredAt: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
			});
			expect(action.ok).toBe(true);
			if (!action.ok) throw new Error("expected target action");
			await registry.idle({
				claim: action.value.claim,
				now: "2026-09-24T12:00:02.000Z",
				effectState: "outcome-unknown",
			});

			const status = await runtime.readStatus();
			expect(status).toMatchObject({
				leaseStates: { active: 0, idle: 1, retiring: 0, released: 0, lost: 0 },
				workloads: {
					conversations: 1,
					newConversations: 0,
					liveFollow: 0,
					ephemeral: 0,
				},
				attention: { expiredIdle: 1, outcomeUnknown: 1, restartUnverified: 0 },
				providerWarningEventCount: 1,
				providerWarnings: {
					active: 1,
					indefinite: 0,
					cooldown: 1,
					classifications: { "rate-limit": 1 },
					maximumCooldownRemainingMs: 600_000,
				},
				admissionRejections: {
					total: 1,
					latestReason: "provider-warning",
					reasons: { "provider-warning": 1 },
				},
				aggregateUsage: {
					activeChats: 0,
					chatsLastHour: 1,
					chatsLastDay: 1,
					interactionsLastMinute: 0,
				},
				bindingLifetimes: [
					{
						workloadKind: "conversation",
						state: "idle",
						effectState: "outcome-unknown",
						ageMs: 120_000,
						lastMeaningfulUseAgeMs: 119_000,
						idleRemainingMs: 0,
						absoluteRemainingMs: 3_480_000,
						idleExpired: true,
						absoluteExpired: false,
					},
				],
				targetActions: {
					targetCreations: 0,
					adoptions: 0,
					navigations: 1,
					reloads: 0,
					focuses: 0,
					closes: 0,
				},
				targetActionsByWorkload: {
					conversations: {
						targetCreations: 0,
						adoptions: 0,
						navigations: 1,
						reloads: 0,
						focuses: 0,
						closes: 0,
					},
				},
				retirements: { closed: 0, alreadyMissing: 0, preserved: 0 },
			});
			expect(JSON.stringify(status)).not.toContain("conversation-secret");
			expect(JSON.stringify(status)).not.toContain("tenant-secret");
			expect(JSON.stringify(status)).not.toContain("provider warning secret");
			expect(JSON.stringify(status)).not.toContain("conversation-rejected-secret");
			expect(JSON.stringify(status)).not.toContain("operation-rejected-secret");
			expect(JSON.stringify(status)).not.toContain("tenant-usage-secret");
			expect(JSON.stringify(status)).not.toContain("conversation-usage-secret");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("publishes resolved mode status from the production browser client factory", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-client-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const client = await BrowserAutomationClient.fromConfig(
				{
					browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
				} as never,
				{ target: "chatgpt" },
			);

			expect(await client.getTabConcurrencyStatus()).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				leaseCount: 0,
				interactionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("keeps released uncertainty durable without reporting an operational fence", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			const runtime = createBrowserTabConcurrencyRuntime(
				{ browser: { tabConcurrencyMode: "tab-affinity" } } as never,
				{
					storageRoot: path.join(directory, "coordination"),
					now: () => new Date("2026-09-24T12:00:12.000Z"),
				},
			);
			const registry = runtime.registry;
			if (!registry) throw new Error("expected tab registry");
			const reserved = await registry.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
					service: "chatgpt",
					tenantKey: "tenant-1",
				},
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 10_000,
				absoluteTtlMs: 60_000,
			});
			if (!reserved.ok) throw new Error("expected reservation");
			const idled = await registry.idle({
				claim: reserved.value.claim,
				now: "2026-09-24T12:00:01.000Z",
				effectState: "outcome-unknown",
			});
			if (!idled.ok) throw new Error("expected idle lease");
			const retiring = await registry.beginRetirement({
				leaseId: idled.value.leaseId,
				expectedRevision: idled.value.revision,
				now: "2026-09-24T12:00:11.000Z",
				reason: "idle-expired",
			});
			if (!retiring.ok) throw new Error("expected retirement");
			const released = await registry.finishRetirement({
				leaseId: idled.value.leaseId,
				retirementRevision: retiring.value.retirementRevision,
				now: "2026-09-24T12:00:12.000Z",
				disposition: "already-missing",
			});
			if (!released.ok) throw new Error("expected release");

			expect(released.value).toMatchObject({
				state: "released",
				effectState: "outcome-unknown",
			});
			await expect(runtime.readStatus()).resolves.toMatchObject({
				fencedLeaseCount: 0,
				leaseStates: { released: 1 },
				attention: { outcomeUnknown: 0 },
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
