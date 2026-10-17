import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";
import {
	createHistoryMaterializationJobStore,
	createHistoryMaterializationService,
} from "../src/runtime/historyMaterializationService.js";

afterEach(() => setAuracallHomeDirOverrideForTest(null));

test("HTTP materialization can use private history storage while retaining server work boundaries", async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-private-history-http-"));
	setAuracallHomeDirOverrideForTest(home);
	const privateStore = createHistoryMaterializationJobStore(path.join(home, "proof", "jobs.json"));
	const defaultStore = createHistoryMaterializationJobStore();
	const globalFixture = await createHistoryMaterializationService({
		config: {},
		store: defaultStore,
		schedule: () => undefined,
	}).createJob({
		provider: "chatgpt",
		runtimeProfile: "fixture",
		reconcile: true,
		refreshSnapshot: false,
		assetKinds: ["artifacts"],
		maxItems: 2,
	});
	await defaultStore.upsertJob({
		...globalFixture.job,
		status: "running",
		startedAt: new Date().toISOString(),
	});
	const scheduled: Array<() => Promise<void>> = [];
	const factory = vi.fn(
		(deps: NonNullable<Parameters<typeof createHistoryMaterializationService>[0]>) =>
			createHistoryMaterializationService({
				...deps,
				store: privateStore,
				schedule: (work) => {
					scheduled.push(work);
				},
			}),
	);
	const dependencies = {
		config: { browser: { cache: { rootDir: path.join(home, "cache") } } },
		createHistoryMaterializationService: factory,
	};
	const server = await createResponsesHttpServer(
		{
			host: "127.0.0.1",
			port: 0,
			recoverRunsOnStart: false,
			backgroundDrainIntervalMs: 0,
			accountMirrorSchedulerIntervalMs: 0,
			resumeAccountMirrorCompletionsOnStart: false,
			reconcileAccountMirrorLiveFollowOnStart: false,
		},
		dependencies,
	);
	try {
		expect(factory).toHaveBeenCalledTimes(1);
		expect(factory.mock.calls[0]?.[0]).toMatchObject({
			cleanupManagedBrowserAfterProviderWork: true,
			withForegroundWork: expect.any(Function),
			onProviderGuardObserved: expect.any(Function),
		});
		const response = await fetch(
			`http://127.0.0.1:${server.port}/v1/account-mirrors/materializations`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "chatgpt",
					runtimeProfile: "fixture",
					reconcile: true,
					refreshSnapshot: false,
					assetKinds: ["artifacts"],
					maxItems: 2,
				}),
			},
		);
		expect(response.status).toBe(202);
		const result = (await response.json()) as { job: { id: string; status: string } };
		expect(result.job.status).toBe("queued");
		expect(await privateStore.readJob(result.job.id)).toMatchObject({
			id: result.job.id,
			status: "queued",
		});
		expect(await defaultStore.readJob(result.job.id)).toBeNull();
		expect(scheduled).toHaveLength(1);
		expect(result.job.id).not.toBe(globalFixture.job.id);
		expect(await defaultStore.readJob(globalFixture.job.id)).toMatchObject({ status: "running" });
	} finally {
		await server.close();
		await fs.rm(home, { recursive: true, force: true });
	}
}, 15000);
