import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAuracallHomeDir } from "../../auracallHome.js";
import type { RemoteViewDesktopConfig } from "../types.js";
import { randomUUID } from "node:crypto";
import { RemoteViewConfigSchema } from "../../schema/types.js";
import { DesktopControlGate } from "./desktopControlGate.js";
import { findChromeProcessUsingUserDataDir } from "../processCheck.js";
import type { RemoteViewRetirement } from "./remoteViewApplication.js";
import { RemoteViewApplication } from "./remoteViewApplication.js";
import {
	NativeDesktopStore,
	verifyNativeBrowser,
	type NativeDesktop,
} from "./nativeDesktopStore.js";

/** Caller holds the pool lock through browser launch so concurrent demand cannot share a free slot. */
export async function selectPoolDesktop(
	config: RemoteViewDesktopConfig,
	store: NativeDesktopStore,
): Promise<NativeDesktop> {
	const app = new RemoteViewApplication(config);
	const pending = await store.pendingPoolAcquisition(config);
	if (pending) {
		const assignment = await app.acquire(config.poolName, pending.key, pending.label);
		const desktop = { ...config, desktopName: `desktop-${assignment.desktopId}`, assignment };
		await store.recordDesktop(desktop);
		await store.completePoolAcquisition(config);
	}
	const state = await app.poolState(config.poolName);
	const observed = [];
	for (const assignment of state.assignments) {
		// Observation failure is never proof that a slot is empty or justification for new capacity.
		observed.push({ assignment, count: await app.windowCount(assignment) });
	}
	const free = observed.find((item) => item.count === 0);
	let assignment = free?.assignment;
	if (!assignment && state.reserved < state.maximum) {
		const request = await store.poolAcquisition(config);
		assignment = await app.acquire(config.poolName, request.key, request.label);
		const desktop = { ...config, desktopName: `desktop-${assignment.desktopId}`, assignment };
		await store.recordDesktop(desktop);
		await store.completePoolAcquisition(config);
	}
	assignment ??= observed.sort(
		(a, b) => a.count - b.count || a.assignment.desktopId.localeCompare(b.assignment.desktopId),
	)[0]?.assignment;
	if (!assignment) throw new Error("No healthy desktop is available in the configured pool.");
	const retained = (await store.desktops()).find(
		(d) =>
			d.origin === config.origin &&
			d.application === config.application &&
			d.poolName === config.poolName &&
			d.assignment.assignmentId === assignment.assignmentId &&
			d.assignment.generation === assignment.generation,
	);
	const desktop = {
		...config,
		desktopName: retained?.desktopName ?? `desktop-${assignment.desktopId}`,
		assignment,
	};
	await store.recordDesktop(desktop);
	return desktop;
}

async function recoveryReferences(directories: string[]): Promise<boolean> {
	const matches = (directory: string) =>
		directories.some((d) => path.resolve(d) === path.resolve(directory));
	try {
		const registry = z
			.object({
				schemaVersion: z.literal(1),
				leases: z.array(
					z.object({
						scope: z.object({ managedBrowserProfile: z.string() }),
						state: z.enum(["active", "idle", "retiring", "released", "lost"]),
					}),
				),
				controls: z
					.array(
						z.object({
							scope: z.object({ managedBrowserProfile: z.string() }),
							state: z.enum(["active", "released"]),
						}),
					)
					.default([]),
			})
			.parse(
				JSON.parse(
					await fs.readFile(
						path.join(
							getAuracallHomeDir(),
							"browser-coordination",
							"tab-leases",
							"tab-leases.v1.json",
						),
						"utf8",
					),
				),
			);
		if (
			registry.leases.some(
				(l) => matches(l.scope.managedBrowserProfile) && l.state !== "released",
			) ||
			registry.controls.some((c) => matches(c.scope.managedBrowserProfile) && c.state === "active")
		)
			return true;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
	}
	try {
		const registry = z
			.object({
				instances: z.record(
					z.string(),
					z.object({
						profilePath: z.string(),
						owner: z.unknown().optional(),
						operation: z.unknown().optional(),
						lease: z.unknown().optional(),
					}),
				),
			})
			.parse(
				JSON.parse(
					await fs.readFile(path.join(getAuracallHomeDir(), "browser-state.json"), "utf8"),
				),
			);
		if (
			Object.values(registry.instances).some(
				(b) =>
					matches(b.profilePath) && (b.owner != null || b.operation != null || b.lease != null),
			)
		)
			return true;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
	}
	return false;
}

/** Maintenance has no browser-close authority; only owner-qualified empty capacity can shrink. */
export async function maintainDesktopPool(
	remoteView: unknown,
): Promise<"ready" | "unused" | "deferred"> {
	const config = RemoteViewConfigSchema.parse(remoteView ?? {});
	if (!config.pool || !config.application) return "unused";
	const selected: RemoteViewDesktopConfig = {
		automatic: true,
		desktopName: "auto",
		poolName: config.pool.name,
		application: config.application.name,
		...config.application,
	};
	const store = new NativeDesktopStore(),
		app = new RemoteViewApplication(selected);
	const lock = `pool:${selected.origin}:${selected.application}:${selected.poolName}`;
	return store.exclusive(lock, async () => {
		if ((await store.hasOtherOperations(lock)) || (await store.pendingPoolAcquisition(selected)))
			return "deferred";
		const bindings = await store.browsers();
		// A retained release may have lost its reply, but renewed local custody still blocks retry.
		// Reconcile durable submitted releases before observing new cleanup candidates.
		for (const record of await store.poolReleases()) {
			if (
				record.desktop.origin !== selected.origin ||
				record.desktop.application !== selected.application ||
				record.desktop.poolName !== selected.poolName
			)
				continue;
			const related = bindings.filter(
				(b) => b.assignment.assignmentId === record.desktop.assignment.assignmentId,
			);
			if (await recoveryReferences(related.map((b) => b.managedProfileDir))) return "deferred";
			for (const browser of related) {
				if (
					(await verifyNativeBrowser(browser)) ||
					(await findChromeProcessUsingUserDataDir(browser.managedProfileDir))
				)
					return "deferred";
			}
			await new DesktopControlGate(record.desktop.assignment.desktopId).withAutomation(
				"pool-release-reconcile",
				async () => {
					const result = await app.releaseIdle(
						record.desktop.assignment,
						record.retirement,
						record.key,
					);
					if (result === "released") await store.forgetDesktop(record.desktop);
					await store.completePoolRelease(record.key);
				},
			);
		}
		const state = await app.poolState(selected.poolName);
		if (!state.reserved) return "unused"; // An unused application does not create demand.
		const desktops = await store.desktops();
		const idle: Array<{ desktop: NativeDesktop; retirement: RemoteViewRetirement }> = [];
		for (const assignment of state.assignments) {
			const desktop = desktops.find(
				(d) =>
					d.origin === selected.origin &&
					d.application === selected.application &&
					d.poolName === selected.poolName &&
					d.assignment.assignmentId === assignment.assignmentId &&
					d.assignment.generation === assignment.generation,
			);
			if (!desktop) return "deferred"; // Unknown local custody cannot qualify release or spare growth.
			const related = bindings.filter(
				(b) =>
					b.assignment.assignmentId === assignment.assignmentId &&
					b.assignment.generation === assignment.generation,
			);
			let referenced = false;
			for (const browser of related) {
				if (
					(await verifyNativeBrowser(browser)) ||
					(await findChromeProcessUsingUserDataDir(browser.managedProfileDir))
				) {
					referenced = true;
					break;
				}
			}
			if (
				referenced ||
				(await recoveryReferences(related.map((b) => b.managedProfileDir))) ||
				(await app.windowCount(assignment))
			)
				continue;
			const observed = await app.observeIdle(assignment);
			if (observed.idle)
				idle.push({ desktop: { ...desktop, assignment }, retirement: observed.retirement });
		}
		if (state.allowScaleIn) {
			let remaining = state.reserved;
			for (const item of idle.slice(1)) {
				if (remaining <= Math.max(1, state.minimum)) break;
				await new DesktopControlGate(item.desktop.assignment.desktopId).withAutomation(
					"pool-idle-release",
					async () => {
						if (await app.windowCount(item.desktop.assignment)) return;
						if (
							await recoveryReferences(
								bindings
									.filter((b) => b.assignment.assignmentId === item.desktop.assignment.assignmentId)
									.map((b) => b.managedProfileDir),
							)
						)
							return;
						const observed = await app.observeIdle(item.desktop.assignment);
						if (!observed.idle) return;
						const key = `auracall-release-${randomUUID()}`;
						await store.recordPoolRelease({
							key,
							desktop: item.desktop,
							retirement: observed.retirement,
						});
						const result = await app.releaseIdle(item.desktop.assignment, observed.retirement, key);
						if (result === "released") {
							await store.forgetDesktop(item.desktop);
							remaining--;
						}
						await store.completePoolRelease(key);
					},
				);
			}
		}
		if (!idle.length && state.reserved < state.maximum) {
			const request = await store.poolAcquisition(selected);
			const assignment = await app.acquire(selected.poolName, request.key, request.label);
			await store.recordDesktop({
				...selected,
				desktopName: `desktop-${assignment.desktopId}`,
				assignment,
			});
			await store.completePoolAcquisition(selected);
		}
		return "ready";
	});
}
