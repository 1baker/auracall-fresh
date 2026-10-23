import { constants } from "node:fs";
import { mkdir, open, lstat, readdir, rename, link, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { getAuracallHomeDir } from "../../auracallHome.js";
import { FrontendError, type FrontendRoute } from "./types.js";
import { frontendTarget } from "./route.js";

export const requestIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
const recordSchema = z
	.object({
		version: z.literal(1),
		requestId: requestIdSchema,
		routeId: z.string(),
		binding: z.string().length(64),
		targetKey: z.string().length(64),
		text: z.string().min(1).max(8192),
		previousRequestId: requestIdSchema.nullable(),
		conversationUrl: z.string().max(2048).nullable().optional(),
		status: z.enum(["prepared", "failed_presend", "sending", "sent", "uncertain", "completed"]),
		baseline: z.array(z.string().min(1).max(256)).max(200),
		userMessageId: z.string().max(256).nullable(),
		assistantMessageId: z.string().max(256).nullable(),
		output: z.string().max(64000).nullable(),
		code: z.string().nullable(),
		identityKind: z.enum(["native", "derived_sequence"]).optional(),
		observedUserKey: z.string().length(64).nullable().optional(),
		observedAssistantKey: z.string().length(64).nullable().optional(),
		candidate: z
			.object({ key: z.string().length(64), at: z.number().int().nonnegative() })
			.strict()
			.nullable()
			.optional(),
	})
	.strict();
export type FrontendRequestRecord = z.infer<typeof recordSchema>;
const lockSchema = z
	.object({
		pid: z.number().int().positive(),
		hostname: z.string(),
		requestId: z.string(),
		createdAt: z.string(),
	})
	.strict();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const frontendTargetKey = (route: FrontendRoute): string =>
	digest([frontendTarget(route).browserId, frontendTarget(route).targetId]);
export const frontendRouteBinding = (route: FrontendRoute): string =>
	route.transport === "agent_browser_task"
		? digest([
				"agent_browser_task",
				route.id,
				route.provider,
				route.expectedUrl,
				route.expectedModel,
				route.nativeTask.authorityRef,
				route.nativeTask.taskId,
				route.nativeTask.profileId,
				route.nativeTask.browserId,
				route.nativeTask.tabId,
				route.nativeTask.targetId,
			])
		: digest([
				route.id,
				route.provider,
				route.expectedUrl,
				route.expectedModel,
				...["browserId", "tabId", "targetId", "profileId"].map(
					(key) => route.serviceTabHandle[key],
				),
				route.serviceTabHandle.sessionName ?? route.serviceTabHandle.ownerSessionId,
			]);
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

/** Private, crash-conservative receipts. No automatic stale-lock recovery. */
export class FrontendRequestStore {
	private get dir(): string {
		return join(getAuracallHomeDir(), "frontend-requests");
	}
	private path(id: string): string {
		if (!requestIdSchema.safeParse(id).success)
			throw new FrontendError(
				"invalid_request_id",
				"Use an opaque request ID of 8-128 letters, digits, underscores or hyphens.",
			);
		return join(this.dir, `${id}.json`);
	}
	private async ensure(): Promise<void> {
		await mkdir(this.dir, { recursive: true, mode: 0o700 });
		await this.validateDirectory();
	}
	private async validateDirectory(): Promise<void> {
		const info = await lstat(this.dir);
		if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
			throw new FrontendError("storage_invalid", "Frontend storage must be a private directory.");
	}
	private async syncDirectory(): Promise<void> {
		const fd = await open(this.dir, "r");
		try {
			await fd.sync();
		} finally {
			await fd.close();
		}
	}
	private async readJson(path: string): Promise<unknown> {
		const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const info = await fd.stat();
			if (!info.isFile() || info.size > 262144) throw new Error("Invalid record size");
			return JSON.parse(await fd.readFile("utf8"));
		} finally {
			await fd.close();
		}
	}
	async read(id: string): Promise<FrontendRequestRecord | null> {
		const path = this.path(id);
		try {
			await this.validateDirectory();
			return recordSchema.parse(await this.readJson(path));
		} catch (error) {
			if (missing(error)) return null;
			throw new FrontendError(
				"record_invalid",
				"The saved frontend request is invalid or has an unsupported version; it was preserved.",
			);
		}
	}
	async write(record: FrontendRequestRecord, create = false): Promise<void> {
		recordSchema.parse(record);
		await this.ensure();
		const path = this.path(record.requestId);
		const temporary = join(this.dir, `${record.requestId}.${randomUUID()}.tmp`);
		const fd = await open(temporary, "wx", 0o600).catch(() => {
			throw new FrontendError(
				"record_write_failed",
				"Cannot reserve the saved request; no input was attempted by this write.",
			);
		});
		try {
			await fd.writeFile(`${JSON.stringify(record)}\n`, "utf8");
			await fd.sync();
		} finally {
			await fd.close();
		}
		if (create) {
			// Atomic exclusive publication: concurrent IDs on different targets cannot overwrite.
			try {
				await link(temporary, path);
			} catch {
				throw new FrontendError(
					"record_write_failed",
					"The request ID could not be reserved; saved evidence was preserved.",
				);
			} finally {
				await unlink(temporary);
			}
		} else await rename(temporary, path);
		await this.syncDirectory();
	}
	async unresolved(targetKey: string): Promise<boolean> {
		await this.ensure();
		for (const name of await readdir(this.dir)) {
			if (!name.endsWith(".json")) continue;
			const record = await this.read(name.slice(0, -5));
			if (
				record?.targetKey === targetKey &&
				!["completed", "failed_presend"].includes(record.status)
			)
				return true;
		}
		return false;
	}
	async lockState(targetKey: string): Promise<string | null> {
		try {
			await this.validateDirectory();
			const holder = lockSchema.parse(await this.readJson(join(this.dir, `${targetKey}.lock`)));
			if (holder.hostname !== hostname()) return "lock_foreign_host";
			try {
				process.kill(holder.pid, 0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ESRCH") return "lock_orphaned";
			}
			return "lock_held";
		} catch (error) {
			return missing(error) ? null : "lock_unproven";
		}
	}
	async withLock<T>(targetKey: string, requestId: string, action: () => Promise<T>): Promise<T> {
		await this.ensure();
		const path = join(this.dir, `${targetKey}.lock`);
		const fd = await open(path, "wx", 0o600).catch(async () => {
			throw new FrontendError(
				(await this.lockState(targetKey)) ?? "lock_unproven",
				"The retained target is locked; inspect its owner before manual recovery.",
			);
		});
		try {
			await fd.writeFile(
				JSON.stringify({
					pid: process.pid,
					hostname: hostname(),
					requestId,
					createdAt: new Date().toISOString(),
				}),
			);
			await fd.sync();
			await this.syncDirectory();
			return await action();
		} finally {
			await fd.close();
			await unlink(path);
			await this.syncDirectory();
		}
	}
}
