import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	createFileBackedProviderInteractionLedger,
	createInMemoryProviderInteractionLedger,
	type ProviderInteractionScope,
} from "../../packages/browser-service/src/service/interactionLedger.js";

const foregroundScope: ProviderInteractionScope = {
	provider: "chatgpt",
	tenantKey: "account-a",
	runtimeProfileId: "default",
	managedBrowserProfile: "managed-chatgpt",
};

describe("interactionLedger (package)", () => {
	test("simultaneous backend callers share one request ceiling and one identity reservation", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-backend-race-"));
		try {
			const callers = Array.from({ length: 3 }, () =>
				createFileBackedProviderInteractionLedger({ ledgerRoot: directory }),
			);
			const request = {
				scope: foregroundScope,
				workloadId: "fixture",
				operationId: "request",
				tabLeaseId: "lease",
				interactionClass: "backend-request" as const,
				mutability: "read-only" as const,
				startsNewConversation: false,
				now: "2026-10-14T12:00:00Z",
				reservationTtlMs: 30000,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxBackendRequestsPerMinute: 1,
				},
			};
			const outcomes = await Promise.all(
				callers.map((ledger, index) =>
					ledger.reserve({ ...request, backendRequestKey: `sha256:${String(index).repeat(64)}` }),
				),
			);
			expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(1);
			expect(
				outcomes.filter((outcome) => !outcome.allowed).map((outcome) => outcome.reason),
			).toEqual(["minute-backend-request-limit", "minute-backend-request-limit"]);
			const winner = outcomes.find((outcome) => outcome.allowed);
			if (!winner?.allowed) throw new Error("Expected a winning request");
			const duplicates = await Promise.all(
				callers.map((ledger) =>
					ledger.reserve({ ...request, backendRequestKey: winner.reservation.backendRequestKey }),
				),
			);
			for (const duplicate of duplicates)
				expect(duplicate).toMatchObject({
					allowed: true,
					duplicate: true,
					reservation: { reservationId: winner.reservation.reservationId },
				});
			expect(await callers[0].list()).toHaveLength(1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("backend request identity deduplicates across restart without bypassing a shared warning", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-backend-identity-"));
		try {
			const ledger = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			const request = {
				scope: foregroundScope,
				workloadId: "fixture",
				operationId: "operation",
				tabLeaseId: "lease",
				interactionClass: "backend-request" as const,
				mutability: "read-only" as const,
				startsNewConversation: false,
				now: "2026-10-14T12:00:00Z",
				reservationTtlMs: 30000,
				backendRequestKey: `sha256:${"b".repeat(64)}`,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxInteractionsPerMinute: 1,
					maxBackendRequestsPerMinute: 1,
				},
			};
			const first = await ledger.reserve(request);
			if (!first.allowed) throw new Error("Expected first backend permit");
			await ledger.start({
				reservationId: first.reservation.reservationId,
				startedAt: request.now,
			});
			await ledger.settle({
				reservationId: first.reservation.reservationId,
				settledAt: request.now,
				effectState: "settled",
				outcome: "succeeded",
			});
			const restarted = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			expect(await restarted.reserve(request)).toMatchObject({
				allowed: true,
				duplicate: true,
				reservation: { reservationId: first.reservation.reservationId },
			});
			expect(await restarted.reserve({ ...request, tabLeaseId: "foreign-lease" })).toMatchObject({
				allowed: false,
				reason: "backend-request-identity-conflict",
			});
			expect(await restarted.list()).toHaveLength(1);
			await ledger.recordProviderWarning({
				scope: foregroundScope,
				classification: "rate-limit",
				reason: "fixture",
				observedAt: request.now,
				evidence: {
					classifierVersion: "fixture",
					visibleSummary: "fixture warning",
					sourceTargetClass: "leased-page",
				},
			});
			expect(
				(await restarted.listActiveProviderWarnings({ now: request.now }))[0].evidence
					?.cumulativeCounts,
			).toMatchObject({ interactions: 0, backendRequests: 1 });
			expect(await restarted.reserve(request)).toMatchObject({
				allowed: false,
				reason: "provider-warning",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("backend request permits do not consume or inherit the browser-operation minute budget", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-backend-budget-"));
		try {
			const ledger = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			const request = {
				scope: foregroundScope,
				workloadId: "fixture",
				operationId: "operation",
				tabLeaseId: "lease",
				interactionClass: "navigation" as const,
				mutability: "read-only" as const,
				startsNewConversation: false,
				now: "2026-10-14T12:00:00Z",
				reservationTtlMs: 30000,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxInteractionsPerMinute: 1,
					maxBackendRequestsPerMinute: 2,
				},
			};
			const operation = await ledger.reserve(request);
			if (!operation.allowed) throw new Error("Expected initial operation permit");
			await ledger.start({
				reservationId: operation.reservation.reservationId,
				startedAt: request.now,
			});
			await ledger.settle({
				reservationId: operation.reservation.reservationId,
				settledAt: request.now,
				effectState: "settled",
				outcome: "succeeded",
			});
			const restarted = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			const backend = await restarted.reserve({
				...request,
				interactionClass: "backend-request",
				operationId: "backend",
				backendRequestKey: `sha256:${"a".repeat(64)}`,
			});
			expect(backend.allowed).toBe(true);
			const second = await restarted.reserve({
				...request,
				scope: {
					...foregroundScope,
					runtimeProfileId: "runtime-b",
					managedBrowserProfile: "managed-b",
				},
				interactionClass: "backend-request",
				operationId: "backend-second",
				backendRequestKey: `sha256:${"c".repeat(64)}`,
			});
			expect(second.allowed).toBe(true);
			expect(
				await ledger.reserve({
					...request,
					interactionClass: "backend-request",
					operationId: "backend-third",
					backendRequestKey: `sha256:${"d".repeat(64)}`,
				}),
			).toMatchObject({ allowed: false, reason: "minute-backend-request-limit" });
			expect(
				await restarted.summarizeUsage({
					provider: "chatgpt",
					tenantKey: "account-a",
					now: request.now,
				}),
			).toMatchObject({ interactionsLastMinute: 1, activeChats: 0 });
			expect(
				await restarted.summarizeBackendRequestUsage({
					provider: "chatgpt",
					tenantKey: "account-a",
					now: request.now,
				}),
			).toEqual({ admittedRequestsLastMinute: 2, activeRequests: 2 });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("a stricter account cap expires with its contributing interaction rather than being renewed by other callers", async () => {
		const ledger = createInMemoryProviderInteractionLedger();
		const reserve = async (operationId: string, now: string, limit: number) => {
			const result = await ledger.reserve({
				scope: { ...foregroundScope, runtimeProfileId: operationId },
				workloadId: operationId,
				operationId,
				tabLeaseId: operationId,
				interactionClass: "conversation-read",
				mutability: "read-only",
				startsNewConversation: false,
				now,
				reservationTtlMs: 30000,
				policy: {
					maxConcurrentChats: null,
					maxConversationStartsPerHour: null,
					maxConversationStartsPerDay: null,
					maxInteractionsPerMinute: limit,
				},
			});
			if (result.allowed) {
				await ledger.start({ reservationId: result.reservation.reservationId, startedAt: now });
				await ledger.settle({
					reservationId: result.reservation.reservationId,
					settledAt: now,
					outcome: "succeeded",
					effectState: "settled",
				});
			}
			return result;
		};
		expect((await reserve("strict", "2026-10-14T12:00:00Z", 2)).allowed).toBe(true);
		expect((await reserve("loose", "2026-10-14T12:00:30Z", 3)).allowed).toBe(true);
		expect(await reserve("blocked", "2026-10-14T12:00:31Z", 3)).toMatchObject({
			allowed: false,
			reason: "minute-interaction-limit",
		});
		expect((await reserve("later", "2026-10-14T12:01:01Z", 3)).allowed).toBe(true);
		expect((await reserve("later-again", "2026-10-14T12:01:02Z", 3)).allowed).toBe(true);
	});
	test("binds a post-admission tab lease once and persists the association", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-interaction-binding-"));
		try {
			const ledger = createFileBackedProviderInteractionLedger({
				ledgerRoot: directory,
				createReservationId: () => "reservation-1",
			});
			const admission = await ledger.reserve({
				scope: foregroundScope,
				workloadId: "new-conversation-1",
				operationId: "operation-1",
				tabLeaseId: null,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T13:00:00.000Z",
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
			if (!admission.allowed) throw new Error("expected admission");

			expect(
				await ledger.bindTabLease({
					reservationId: "reservation-1",
					tabLeaseId: "lease-1",
					boundAt: "2026-09-24T13:00:01.000Z",
				}),
			).toMatchObject({ ok: true, record: { tabLeaseId: "lease-1" } });
			expect(
				await ledger.bindTabLease({
					reservationId: "reservation-1",
					tabLeaseId: "lease-other",
					boundAt: "2026-09-24T13:00:02.000Z",
				}),
			).toEqual({ ok: false, reason: "invalid-state" });

			const restarted = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			expect(await restarted.list()).toEqual([
				expect.objectContaining({ reservationId: "reservation-1", tabLeaseId: "lease-1" }),
			]);
			expect((await restarted.listEvents()).map((event) => event.type)).toEqual([
				"reservation-created",
				"tab-lease-bound",
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("a warning on one tab freezes existing work and denies every later tenant-provider permit", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
		};
		const foreground = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-a",
			operationId: "operation-a",
			tabLeaseId: "lease-a",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		const crawler = await ledger.reserve({
			scope: { ...foregroundScope, runtimeProfileId: "mirror" },
			workloadId: "live-follow-1",
			operationId: "operation-follow",
			tabLeaseId: "lease-crawler",
			interactionClass: "conversation-read",
			mutability: "read-only",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(foreground.allowed).toBe(true);
		expect(crawler.allowed).toBe(true);

		const warning = await ledger.recordProviderWarning({
			scope: foregroundScope,
			classification: "rate-limit",
			reason: "provider warning observed",
			observedAt: "2026-09-24T13:00:01.000Z",
			cooldownUntil: "2026-09-24T14:00:01.000Z",
		});
		expect(warning.frozenReservationIds).toEqual(["reservation-1", "reservation-2"]);

		const denied = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-b",
			operationId: "operation-b",
			tabLeaseId: "lease-b",
			interactionClass: "conversation-start",
			mutability: "provider-mutating",
			startsNewConversation: true,
			now: "2026-09-24T13:00:02.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(denied).toMatchObject({
			allowed: false,
			reason: "provider-warning",
			warning: { classification: "rate-limit" },
		});
		expect(
			(await ledger.list({ provider: "chatgpt", tenantKey: "account-a" })).map(
				(entry) => entry.state,
			),
		).toEqual(["frozen", "frozen"]);
	});

	test("persists a sanitized bounded interaction window with a provider warning", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `warning-evidence-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
		};
		for (const [index, interactionClass] of (
			["navigation", "conversation-read"] as const
		).entries()) {
			const second = index * 2;
			const admission = await ledger.reserve({
				scope: foregroundScope,
				workloadId: "live-follow:fixture",
				operationId: "operation-fixture",
				tabLeaseId: "lease-fixture",
				interactionClass,
				mutability: "read-only",
				startsNewConversation: false,
				now: `2026-09-24T13:00:0${second}.000Z`,
				reservationTtlMs: 30_000,
				policy,
			});
			if (!admission.allowed) throw new Error("expected warning-evidence admission");
			await ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: `2026-09-24T13:00:0${second}.250Z`,
			});
			await ledger.settle({
				reservationId: admission.reservation.reservationId,
				settledAt: `2026-09-24T13:00:0${second + 1}.000Z`,
				effectState: "settled",
				outcome: "succeeded",
			});
		}

		const recorded = await ledger.recordProviderWarning({
			scope: foregroundScope,
			classification: "rate-limit",
			reason: "requests too quickly",
			observedAt: "2026-09-24T13:00:05.000Z",
			evidence: {
				classifierVersion: "chatgpt-visible-blocking-surface-v1",
				visibleSummary: "Too many requests; temporarily limited.",
				sourceTargetClass: "leased-page",
				openTargetCount: 7,
				resourcePathClasses: ["Conversation", "conversation", "Project Index"],
				precedingInteractionLimit: 3,
				trafficAdmission: {
					version: 1,
					phases: [{ phase: "DETAIL", admitted: 1, limit: 2, remaining: 1 }],
					budgets: [
						{ phase: "DETAIL", kind: "page_navigate", admitted: 1, limit: 2, remaining: 1 },
					],
				},
			},
		});

		expect(recorded.warning.evidence).toEqual({
			version: 1,
			classifierVersion: "chatgpt-visible-blocking-surface-v1",
			visibleSummary: "Too many requests; temporarily limited.",
			sourceTargetClass: "leased-page",
			firstObservedAt: "2026-09-24T13:00:05.000Z",
			openTargetCount: 7,
			precedingInteractions: [
				expect.objectContaining({
					deltaMs: null,
					interactionClass: "navigation",
					eventType: "interaction-settled",
				}),
				expect.objectContaining({ deltaMs: 1_250, interactionClass: "conversation-read" }),
				expect.objectContaining({ deltaMs: 750, interactionClass: "conversation-read" }),
			],
			cumulativeCounts: {
				interactions: 2,
				navigations: 1,
				reloads: 0,
				conversationReads: 1,
				artifactReads: 0,
			},
			resourcePathClasses: ["conversation", "project index"],
			trafficAdmission: {
				version: 1,
				phases: [{ phase: "detail", admitted: 1, limit: 2, remaining: 1 }],
				budgets: [{ phase: "detail", kind: "page_navigate", admitted: 1, limit: 2, remaining: 1 }],
			},
		});
		expect(JSON.stringify(recorded.warning.evidence)).not.toContain("operation-fixture");
		expect(JSON.stringify(recorded.warning.evidence)).not.toContain("lease-fixture");
	});

	test("operator clearance replaces an indefinite warning with a bounded quiet cooldown", async () => {
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-after-clear",
		});
		await ledger.recordProviderWarning({
			scope: foregroundScope,
			classification: "human-verification",
			reason: "human verification required",
			observedAt: "2026-09-24T12:00:00.000Z",
		});

		const cleared = await ledger.clearProviderWarning({
			scope: foregroundScope,
			clearedAt: "2026-09-24T12:05:00.000Z",
			cooldownUntil: "2026-09-24T12:35:00.000Z",
			reason: "operator cleared provider guard; quiet cooldown",
		});
		expect(cleared).toMatchObject({
			previous: { classification: "human-verification", cooldownUntil: null },
			warning: {
				classification: "human-verification",
				cooldownUntil: "2026-09-24T12:35:00.000Z",
			},
		});

		const request = (now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: "conversation:after-clear",
				operationId: "operation-after-clear",
				interactionClass: "prompt-continuation",
				mutability: "provider-mutating",
				startsNewConversation: false,
				now,
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
		expect(await request("2026-09-24T12:34:59.999Z")).toMatchObject({
			allowed: false,
			reason: "provider-warning",
		});
		expect(await request("2026-09-24T12:35:00.000Z")).toMatchObject({ allowed: true });
		expect((await ledger.listEvents()).map((event) => event.type)).toContain(
			"provider-warning-cleared",
		);
		expect(await ledger.listActiveProviderWarnings({ now: "2026-09-24T12:34:59.999Z" })).toEqual([
			cleared.warning,
		]);
		expect(await ledger.listActiveProviderWarnings({ now: "2026-09-24T12:35:00.000Z" })).toEqual(
			[],
		);
	});

	test("atomic short reservations close concurrency races and expire without erasing history", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const request = (operationId: string) => ({
			scope: foregroundScope,
			workloadId: operationId,
			operationId,
			tabLeaseId: `lease-${operationId}`,
			interactionClass: "conversation-start" as const,
			mutability: "provider-mutating" as const,
			startsNewConversation: true,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 1_000,
			policy: {
				maxConcurrentChats: 1,
				maxConversationStartsPerHour: 120,
				maxConversationStartsPerDay: 240,
			},
		});

		const raced = await Promise.all([
			ledger.reserve(request("operation-a")),
			ledger.reserve(request("operation-b")),
		]);
		expect(raced.filter((result) => result.allowed)).toHaveLength(1);
		expect(raced.filter((result) => !result.allowed)).toEqual([
			{ allowed: false, reason: "concurrent-limit" },
		]);

		const afterExpiry = await ledger.reserve({
			...request("operation-c"),
			now: "2026-09-24T13:00:01.001Z",
		});
		expect(afterExpiry.allowed).toBe(true);
		expect((await ledger.list()).map((record) => record.state)).toEqual(["abandoned", "reserved"]);
	});

	test("settled conversation starts drive exact rolling hourly admission without double-counting reservations", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: 2,
			maxConversationStartsPerDay: 3,
		};
		const reserveStart = (operationId: string, now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: operationId,
				operationId,
				tabLeaseId: `lease-${operationId}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		const completeStart = async (operationId: string, now: string) => {
			const admission = await reserveStart(operationId, now);
			if (!admission.allowed) throw new Error(`expected admission for ${operationId}`);
			const started = await ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: now,
			});
			expect(started.ok).toBe(true);
			const settled = await ledger.settle({
				reservationId: admission.reservation.reservationId,
				settledAt: now,
				effectState: "settled",
				outcome: "succeeded",
			});
			expect(settled.ok).toBe(true);
		};

		await completeStart("operation-a", "2026-09-24T12:00:00.000Z");
		await completeStart("operation-b", "2026-09-24T12:30:00.000Z");
		expect(await reserveStart("operation-c", "2026-09-24T12:45:00.000Z")).toEqual({
			allowed: false,
			reason: "hourly-limit",
		});
		expect(await reserveStart("operation-d", "2026-09-24T13:00:00.000Z")).toEqual({
			allowed: false,
			reason: "hourly-limit",
		});
		expect((await reserveStart("operation-e", "2026-09-24T13:00:00.001Z")).allowed).toBe(true);
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"interaction-started",
			"interaction-settled",
			"reservation-created",
			"interaction-started",
			"interaction-settled",
			"admission-rejected",
			"admission-rejected",
			"reservation-created",
		]);
	});

	test("summarizes rolling usage across tenant scopes without merging equal workload ids", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `aggregate-${++sequence}`,
		});
		for (const tenantKey of ["account-a", "account-b"]) {
			const admission = await ledger.reserve({
				scope: { ...foregroundScope, tenantKey },
				workloadId: "same-conversation-id",
				operationId: `operation-${tenantKey}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:00:00.000Z",
				reservationTtlMs: 300_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
			expect(admission.allowed).toBe(true);
		}
		expect(await ledger.summarizeAggregateUsage({ now: "2026-09-24T12:00:01.000Z" })).toEqual({
			activeChats: 2,
			chatsLastHour: 2,
			chatsLastDay: 2,
			interactionsLastMinute: 2,
		});
	});

	test("passive observation is audited without consuming an interaction permit", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 1,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
		};
		const first = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-a",
			operationId: "operation-a",
			tabLeaseId: "lease-a",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(first.allowed).toBe(true);

		const observation = await ledger.observePassive({
			scope: foregroundScope,
			workloadId: "conversation-b",
			operationId: "status-poll",
			tabLeaseId: "lease-b",
			observedAt: "2026-09-24T13:00:01.000Z",
		});
		expect(observation).toMatchObject({
			type: "passive-observed",
			interactionClass: "passive-observation",
			workloadId: "conversation-b",
		});
		expect(await ledger.list()).toHaveLength(1);
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"passive-observed",
		]);
	});

	test("persists usage and provider warnings atomically across ledger instances and restart", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-interactions-"));
		try {
			let sequence = 0;
			const options = {
				ledgerRoot: directory,
				createReservationId: () => `reservation-${++sequence}`,
			};
			const policy = {
				maxConcurrentChats: 4,
				maxConversationStartsPerHour: 1,
				maxConversationStartsPerDay: 2,
			};
			const firstLedger = createFileBackedProviderInteractionLedger(options);
			const first = await firstLedger.reserve({
				scope: foregroundScope,
				workloadId: "conversation-a",
				operationId: "operation-a",
				tabLeaseId: "lease-a",
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:00:00.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			if (!first.allowed) throw new Error("expected first admission");
			await firstLedger.start({
				reservationId: first.reservation.reservationId,
				startedAt: "2026-09-24T12:00:00.000Z",
			});
			await firstLedger.settle({
				reservationId: first.reservation.reservationId,
				settledAt: "2026-09-24T12:00:01.000Z",
				effectState: "settled",
				outcome: "succeeded",
			});

			const restarted = createFileBackedProviderInteractionLedger(options);
			const hourlyDenied = await restarted.reserve({
				scope: foregroundScope,
				workloadId: "conversation-b",
				operationId: "operation-b",
				tabLeaseId: "lease-b",
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:30:00.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			expect(hourlyDenied).toEqual({ allowed: false, reason: "hourly-limit" });

			await restarted.recordProviderWarning({
				scope: foregroundScope,
				classification: "human-verification",
				reason: "provider verification required",
				observedAt: "2026-09-24T12:30:01.000Z",
				evidence: {
					classifierVersion: "fixture-v1",
					visibleSummary: "Provider verification required.",
					sourceTargetClass: "leased-page",
					openTargetCount: 2,
				},
			});
			const afterWarningRestart = createFileBackedProviderInteractionLedger(options);
			const warningDenied = await afterWarningRestart.reserve({
				scope: foregroundScope,
				workloadId: "conversation-a",
				operationId: "operation-c",
				tabLeaseId: "lease-a",
				interactionClass: "prompt-continuation",
				mutability: "provider-mutating",
				startsNewConversation: false,
				now: "2026-09-24T12:30:02.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			expect(warningDenied).toMatchObject({
				allowed: false,
				reason: "provider-warning",
				warning: {
					classification: "human-verification",
					evidence: {
						classifierVersion: "fixture-v1",
						openTargetCount: 2,
						cumulativeCounts: { interactions: 1 },
					},
				},
			});
			expect((await afterWarningRestart.listEvents()).map((event) => event.type)).toEqual([
				"reservation-created",
				"interaction-started",
				"interaction-settled",
				"admission-rejected",
				"provider-warning-observed",
				"admission-rejected",
			]);

			const raceScope = { ...foregroundScope, tenantKey: "account-b" };
			const racePolicy = { ...policy, maxConcurrentChats: 1 };
			const reserveRacer = (ledger: typeof firstLedger, operationId: string) =>
				ledger.reserve({
					scope: raceScope,
					workloadId: operationId,
					operationId,
					tabLeaseId: `lease-${operationId}`,
					interactionClass: "prompt-continuation",
					mutability: "provider-mutating",
					startsNewConversation: false,
					now: "2026-09-24T12:31:00.000Z",
					reservationTtlMs: 30_000,
					policy: racePolicy,
				});
			const raced = await Promise.all([
				reserveRacer(restarted, "race-a"),
				reserveRacer(afterWarningRestart, "race-b"),
			]);
			expect(raced.filter((result) => result.allowed)).toHaveLength(1);
			expect(raced.filter((result) => !result.allowed)).toEqual([
				{ allowed: false, reason: "concurrent-limit" },
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("retains pre-effect cancellation evidence without charging a conversation start", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 1,
			maxConversationStartsPerHour: 1,
			maxConversationStartsPerDay: 1,
		};
		const reserve = (operationId: string, now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: operationId,
				operationId,
				tabLeaseId: `lease-${operationId}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		const cancelled = await reserve("operation-a", "2026-09-24T12:00:00.000Z");
		if (!cancelled.allowed) throw new Error("expected reservation");
		await ledger.start({
			reservationId: cancelled.reservation.reservationId,
			startedAt: "2026-09-24T12:00:01.000Z",
		});
		await ledger.settle({
			reservationId: cancelled.reservation.reservationId,
			settledAt: "2026-09-24T12:00:02.000Z",
			effectState: "none",
			outcome: "cancelled",
			stopReason: "caller-aborted-before-provider-effect",
		});

		expect((await reserve("operation-b", "2026-09-24T12:00:03.000Z")).allowed).toBe(true);
		expect(await ledger.list()).toContainEqual(
			expect.objectContaining({
				operationId: "operation-a",
				state: "settled",
				effectState: "none",
				outcome: "cancelled",
			}),
		);
	});

	test("enforces the inclusive rolling daily boundary", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: null,
			maxConversationStartsPerDay: 1,
		};
		const reserve = (operationId: string, now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: operationId,
				operationId,
				tabLeaseId: `lease-${operationId}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		const first = await reserve("operation-a", "2026-09-24T12:00:00.000Z");
		if (!first.allowed) throw new Error("expected first start");
		await ledger.start({
			reservationId: first.reservation.reservationId,
			startedAt: "2026-09-24T12:00:00.000Z",
		});
		await ledger.settle({
			reservationId: first.reservation.reservationId,
			settledAt: "2026-09-24T12:00:00.000Z",
			effectState: "settled",
			outcome: "succeeded",
		});

		expect(await reserve("operation-b", "2026-09-25T12:00:00.000Z")).toEqual({
			allowed: false,
			reason: "daily-limit",
		});
		expect((await reserve("operation-c", "2026-09-25T12:00:00.001Z")).allowed).toBe(true);
	});

	test("enforces one aggregate rolling-minute interaction limit across runtime profiles", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: null,
			maxConversationStartsPerDay: null,
			maxInteractionsPerMinute: 1,
		};
		const first = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation:one",
			operationId: "operation-a",
			interactionClass: "conversation-read",
			mutability: "read-only",
			startsNewConversation: false,
			now: "2026-09-24T12:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		if (!first.allowed) throw new Error("expected first interaction");
		await ledger.start({
			reservationId: first.reservation.reservationId,
			startedAt: "2026-09-24T12:00:00.000Z",
		});
		await ledger.settle({
			reservationId: first.reservation.reservationId,
			settledAt: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
			outcome: "succeeded",
		});

		const reserveBackground = (now: string) =>
			ledger.reserve({
				scope: { ...foregroundScope, runtimeProfileId: "runtime-background" },
				workloadId: "live-follow:one",
				operationId: "operation-b",
				interactionClass: "list-read",
				mutability: "read-only",
				startsNewConversation: false,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		expect(await reserveBackground("2026-09-24T12:01:00.000Z")).toEqual({
			allowed: false,
			reason: "minute-interaction-limit",
		});
		expect((await reserveBackground("2026-09-24T12:01:00.001Z")).allowed).toBe(true);
		expect(
			await ledger.summarizeUsage({
				provider: foregroundScope.provider,
				tenantKey: foregroundScope.tenantKey,
				now: "2026-09-24T12:01:00.001Z",
			}),
		).toMatchObject({ interactionsLastMinute: 1 });
	});
});

test("a backend burst shares durable writes while retaining the account ceiling", async () => {
	const fs = await import("node:fs/promises");
	const { vi } = await import("vitest");
	const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-backend-write-burst-"));
	const originalRename = fs.default.rename;
	let durableWrites = 0;
	const rename = vi.spyOn(fs.default, "rename").mockImplementation(async (from, to) => {
		if (String(to).endsWith("provider-interactions.v1.json")) durableWrites++;
		return originalRename(from, to);
	});
	try {
		const ledger = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
		const outcomes = await Promise.all(
			Array.from({ length: 13 }, (_, id) =>
				ledger.reserve({
					scope: foregroundScope,
					workloadId: "burst",
					operationId: "burst",
					tabLeaseId: "burst-lease",
					interactionClass: "backend-request",
					mutability: "read-only",
					startsNewConversation: false,
					backendRequestKey: `sha256:${id.toString(16).repeat(64)}`,
					now: "2026-10-18T00:00:00Z",
					reservationTtlMs: 30000,
					policy: {
						maxConcurrentChats: null,
						maxConversationStartsPerHour: null,
						maxConversationStartsPerDay: null,
						maxBackendRequestsPerMinute: 3,
					},
				}),
			),
		);
		expect(outcomes.filter((value) => value.allowed)).toHaveLength(3);
		expect(outcomes.filter((value) => !value.allowed)).toHaveLength(10);
		expect(
			await createFileBackedProviderInteractionLedger({ ledgerRoot: directory }).list(),
		).toHaveLength(3);
		expect(durableWrites).toBeLessThanOrEqual(1);
	} finally {
		rename.mockRestore();
		await rm(directory, { recursive: true, force: true });
	}
});

test.each([
	"blocked",
	"failed",
])("backend batch publishes only after a %s durable commit", async (mode) => {
	const fs = await import("node:fs/promises");
	const { vi } = await import("vitest");
	const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-backend-durability-"));
	let entered!: () => void;
	let release!: () => void;
	const writing = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	const originalRename = fs.default.rename;
	const rename = vi.spyOn(fs.default, "rename").mockImplementation(async (from, to) => {
		if (String(to).endsWith("provider-interactions.v1.json")) {
			entered();
			if (mode === "failed") throw new Error("fixture durable commit failed");
			await released;
		}
		return originalRename(from, to);
	});
	try {
		const ledger = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
		let completed = 0;
		const calls = ["a", "b"].map((id) =>
			ledger
				.reserve({
					scope: foregroundScope,
					workloadId: "durability",
					operationId: "durability",
					tabLeaseId: "lease",
					interactionClass: "backend-request",
					mutability: "read-only",
					startsNewConversation: false,
					backendRequestKey: `sha256:${id.repeat(64)}`,
					now: "2026-10-18T00:00:00Z",
					reservationTtlMs: 30000,
					policy: {
						maxConcurrentChats: null,
						maxConversationStartsPerHour: null,
						maxConversationStartsPerDay: null,
						maxBackendRequestsPerMinute: 1,
					},
				})
				.then((value) => {
					completed++;
					return value;
				}),
		);
		const outcomes = Promise.allSettled(calls);
		await writing;
		if (mode === "blocked") expect(completed).toBe(0);
		release();
		const settled = await outcomes;
		if (mode === "failed") {
			expect(settled).toEqual([
				expect.objectContaining({ status: "rejected" }),
				expect.objectContaining({ status: "rejected" }),
			]);
			expect(
				await createFileBackedProviderInteractionLedger({ ledgerRoot: directory }).list(),
			).toHaveLength(0);
		} else {
			expect(settled.every((value) => value.status === "fulfilled")).toBe(true);
			expect(
				await createFileBackedProviderInteractionLedger({ ledgerRoot: directory }).list(),
			).toHaveLength(1);
		}
	} finally {
		release();
		rename.mockRestore();
		await rm(directory, { recursive: true, force: true });
	}
});
