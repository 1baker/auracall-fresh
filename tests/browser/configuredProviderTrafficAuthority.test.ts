import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

afterEach(() => {
	setAuracallHomeDirOverrideForTest(null);
});

describe("configured provider traffic authority", () => {
	test("a warning during backend dispatch preserves the failed settlement and frozen custody", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-request-warning-"));
		setAuracallHomeDirOverrideForTest(directory);
		const config = {
			auracallProfile: "fixture",
			services: { chatgpt: { identity: { email: "operator@example.test" } } },
		} as never;
		try {
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: config,
				provider: "chatgpt",
				managedBrowserProfile: "/fixture/managed",
				mutationAudit: async () => undefined,
				baseOptions: {},
				backendRequestLimit: 1,
			});
			const authority = await factory.acquire({ targetId: "fixture-target" });
			const ledger = createBrowserTabConcurrencyRuntime(config).ledger;
			if (!ledger || !authority.governor.admitBackendRequest)
				throw new Error("Missing backend admission");
			await expect(
				authority.governor.admitBackendRequest(`sha256:${"a".repeat(64)}`, async () => {
					const request = (await ledger.list())[0];
					if (!request) throw new Error("Expected dispatched request record");
					await ledger.recordProviderWarning({
						scope: request.scope,
						classification: "rate-limit",
						reason: "fixture429",
						observedAt: new Date().toISOString(),
					});
				}),
			).rejects.toThrow("Backend dispatch and settlement failed");
			expect(await ledger.list()).toEqual([
				expect.objectContaining({ state: "frozen", effectState: "outcome-unknown" }),
			]);
			await expect(authority.close()).rejects.toThrow("release failed");
			expect(
				await ledger.listActiveProviderWarnings({ now: new Date().toISOString() }),
			).toHaveLength(1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("an owned backend response freezes another runtime's account admission before a DOM probe", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-owned-response-"));
		setAuracallHomeDirOverrideForTest(directory);
		const clients: Array<{ close(): Promise<void> }> = [];
		try {
			const { annotateClientMutationContext } = await import(
				"../../src/browser/providers/mutationAudit.js"
			);
			const config = {
				auracallProfile: "runtime-a",
				services: { chatgpt: { identity: { email: "operator@example.test" } } },
			};
			const makeFactory = (runtime: string) =>
				createConfiguredProviderTrafficAuthorityFactory({
					userConfig: { ...config, auracallProfile: runtime } as never,
					provider: "chatgpt",
					managedBrowserProfile: `/fixture/${runtime}`,
					mutationAudit: async () => undefined,
					baseOptions: { interactionGovernor: { beforeInteraction: async () => undefined } },
				});
			const handlers = new Set<(event: unknown) => unknown>();
			const client = {
				// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
				Network: {
					enable: async () => undefined,
					responseReceived: (handler: (event: unknown) => unknown) => {
						handlers.add(handler);
						return () => handlers.delete(handler);
					},
				},
				close: async () => undefined,
			};
			await annotateClientMutationContext(
				client as never,
				{
					providerTrafficAuthorityFactory: makeFactory("runtime-a"),
					providerTrafficRequired: true,
				},
				"provider:chatgpt",
				"target-a",
			);
			clients.push(client);
			const other = await makeFactory("runtime-b").acquire({ targetId: "target-b" });
			clients.push({ close: () => other.close() });
			const { resolveProviderTrafficGovernor } = await import(
				"../../src/browser/providers/mutationAudit.js"
			);
			const originalGovernor = resolveProviderTrafficGovernor(client);
			await expect(
				annotateClientMutationContext(
					client as never,
					{ providerTrafficGovernor: other.governor },
					"provider:chatgpt",
					"target-a",
				),
			).rejects.toThrow("does not match its owned authority");
			expect(resolveProviderTrafficGovernor(client)).toBe(originalGovernor);
			for (const url of [
				"https://example.test/backend-api/conversations",
				"https://chatgpt.com/cdn/asset.js",
			]) {
				for (const handler of handlers) await handler({ response: { url, status: 429 } });
			}
			expect(
				await createBrowserTabConcurrencyRuntime(
					config as never,
				).ledger?.listActiveProviderWarnings({ now: new Date().toISOString() }),
			).toEqual([]);
			for (const handler of handlers)
				await handler({
					requestId: "fixture-request",
					response: {
						url: "https://chatgpt.com/backend-api/conversations?private=query",
						status: 429,
					},
				});
			for (const handler of handlers)
				await handler({
					requestId: "fixture-request",
					response: { url: "https://chatgpt.com/backend-api/conversations", status: 429 },
				});
			await expect(
				other.governor.begin({
					kind: "navigate",
					interactionClass: "renavigation",
					source: "fixture:other-runtime",
					targetId: "target-b",
				}),
			).rejects.toThrow("provider-warning");
			const warnings = await createBrowserTabConcurrencyRuntime(
				config as never,
			).ledger?.listActiveProviderWarnings({ now: new Date().toISOString() });
			expect(warnings).toEqual([expect.objectContaining({ classification: "rate-limit" })]);
			expect(JSON.stringify(warnings)).not.toContain("private=query");
			await client.close();
			expect(handlers.size).toBe(0);
		} finally {
			for (const client of clients) await client.close();
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("response observer setup failure closes transport and releases its newly acquired authority", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-response-setup-"));
		setAuracallHomeDirOverrideForTest(directory);
		try {
			const { annotateClientMutationContext } = await import(
				"../../src/browser/providers/mutationAudit.js"
			);
			const config = {
				auracallProfile: "fixture",
				services: { chatgpt: { identity: { email: "operator@example.test" } } },
			} as never;
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: config,
				provider: "chatgpt",
				managedBrowserProfile: "/fixture/managed",
				mutationAudit: async () => undefined,
				baseOptions: {},
			});
			const close = vi.fn(async () => undefined);
			const dispose = vi.fn();
			const client = {
				// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
				Network: {
					responseReceived: () => dispose,
					enable: async () => {
						throw new Error("fixture network setup failed");
					},
				},
				close,
			};
			await expect(
				annotateClientMutationContext(
					client as never,
					{ providerTrafficAuthorityFactory: factory, providerTrafficRequired: true },
					"provider:chatgpt",
					"fixture-target",
				),
			).rejects.toThrow("fixture network setup failed");
			expect(close).toHaveBeenCalledOnce();
			expect(dispose).toHaveBeenCalledOnce();
			expect(await createBrowserTabConcurrencyRuntime(config).readStatus()).toMatchObject({
				activeInteractionCount: 0,
				fencedLeaseCount: 0,
				leaseStates: { released: 1 },
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	test("gives serialized provider clients an exact persisted lease and releases it on close", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-provider-traffic-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const records: Array<{ phase: string; targetId?: string | null }> = [];
			const config = {
				auracallProfile: "runtime-1",
				browser: { tabConcurrencyMode: "serialized" },
			} as never;
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: config,
				provider: "gemini",
				managedBrowserProfile: "/managed/gemini",
				mutationAudit: (record) => {
					records.push(record);
				},
				baseOptions: {},
			});

			const authority = await factory.acquire({ targetId: "target-1" });
			const action = await authority.governor.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "test:gemini",
				targetId: "target-1",
			});
			await action.settle({ outcome: "succeeded", targetId: "target-1" });
			await authority.close();

			expect(records).toEqual([
				expect.objectContaining({ phase: "start", targetId: "target-1" }),
				expect.objectContaining({ phase: "complete", targetId: "target-1" }),
			]);
			const status = await createBrowserTabConcurrencyRuntime(config).readStatus();
			expect(status).toMatchObject({
				mode: "serialized",
				enabled: false,
				leaseCount: 1,
				fencedLeaseCount: 0,
				interactionCount: 1,
				activeInteractionCount: 0,
				leaseStates: { released: 1 },
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("client attachment closes authority exactly once", async () => {
		const close = vi.fn(async () => undefined);
		const authorityClose = vi.fn(async () => undefined);
		const acquire = vi.fn(async () => ({
			governor: { attribution: {} as never, begin: vi.fn() },
			close: authorityClose,
		}));
		const { annotateClientMutationContext } = await import(
			"../../src/browser/providers/mutationAudit.js"
		);
		const client = { close } as never;
		await annotateClientMutationContext(
			client,
			{
				providerTrafficRequired: true,
				providerTrafficAuthorityFactory: { acquire },
			},
			"provider:gemini",
			"target-1",
		);

		await (client as { close: () => Promise<void> }).close();
		await (client as { close: () => Promise<void> }).close();
		expect(acquire).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		expect(authorityClose).toHaveBeenCalledOnce();
	});
});
