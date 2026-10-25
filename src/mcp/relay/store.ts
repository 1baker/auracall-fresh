import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

export const relayId = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
export const relayRequestSchema = z
	.object({
		requestId: relayId,
		prompt: z
			.string()
			.min(1)
			.max(131072)
			.refine((text) => text.trim().length > 0),
		previousRequestId: relayId.optional(),
		attachments: z.array(z.unknown()).max(0).default([]),
	})
	.strict();
type Input = z.input<typeof relayRequestSchema>;
const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const jobSchema = relayRequestSchema
	.extend({
		version: z.literal(1),
		owner: z.string(),
		fingerprint: hash,
		previousReplyDigest: hash.nullable(),
	})
	.strict();
const claimSchema = z.object({ claimId: z.string().uuid(), fingerprint: hash }).strict();
const frontendBindingSchema = z
	.object({
		routeId: z.string().min(1).max(128),
		expectedUrl: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/),
		expectedModel: z.string().min(1).max(256),
	})
	.strict();
export type RelayFrontendBinding = z.infer<typeof frontendBindingSchema>;
const frontendClaimSchema = frontendBindingSchema
	.extend({
		claimId: z.string().uuid(),
		fingerprint: hash,
	})
	.strict();
const configurationSchema = frontendBindingSchema
	.extend({ fingerprint: hash, effort: z.literal("pro") })
	.strict();
const replySchema = z
	.object({
		claimId: z.string().uuid(),
		text: z.string().min(1).max(262144),
		sha256: hash,
		providerResponseId: z.null(),
		liveVerified: z.literal(false),
	})
	.strict();
const holdSchema = z
	.object({ claimId: z.string().uuid(), state: z.literal("held_unknown") })
	.strict();
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export class RelayError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

/** Private POSIX store. Claims and replies are immutable; no stale-lock/claim recovery. */
export class RelayStore {
	constructor(
		readonly directory: string,
		private readonly owner: string,
	) {
		if (!isAbsolute(directory) || !owner || owner.length > 256 || process.platform === "win32")
			throw new RelayError("relay_private_posix_store_required");
	}
	private dir(id: string) {
		if (!relayId.safeParse(id).success) throw new RelayError("invalid_request_id");
		return join(this.directory, id);
	}
	private async privateDir(path: string, create = false) {
		if (create) await mkdir(path, { recursive: true, mode: 0o700 });
		const info = await lstat(path);
		if (
			!info.isDirectory() ||
			info.isSymbolicLink() ||
			info.mode & 0o077 ||
			info.uid !== process.getuid?.()
		)
			throw new RelayError("relay_storage_invalid");
	}
	private async read<T>(dir: string, name: string, schema: z.ZodType<T>): Promise<T | null> {
		try {
			await this.privateDir(this.directory);
			await this.privateDir(dir);
			const fd = await open(
				join(dir, name),
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			try {
				const info = await fd.stat();
				if (
					!info.isFile() ||
					info.size > 2097152 ||
					info.mode & 0o077 ||
					info.uid !== process.getuid?.()
				)
					throw new RelayError("relay_storage_invalid");
				const bytes = await fd.readFile();
				if (bytes.length > 2097152) throw new RelayError("relay_storage_invalid");
				return schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
			} finally {
				await fd.close();
			}
		} catch (error) {
			if (missing(error)) return null;
			throw new RelayError("relay_storage_invalid");
		}
	}
	private async publish(dir: string, name: string, value: unknown) {
		const tmp = join(dir, `${randomUUID()}.tmp`);
		const fd = await open(tmp, "wx", 0o600);
		try {
			await fd.writeFile(JSON.stringify(value));
			await fd.sync();
		} finally {
			await fd.close();
		}
		try {
			await link(tmp, join(dir, name));
		} finally {
			await unlink(tmp);
		}
		const directory = await open(dir, "r");
		try {
			await directory.sync();
		} finally {
			await directory.close();
		}
	}
	private async locked<T>(
		id: string,
		action: (dir: string) => Promise<T>,
		create = false,
	): Promise<T> {
		const dir = this.dir(id);
		await this.privateDir(this.directory, create);
		await this.privateDir(dir, create);
		const path = join(dir, ".lock");
		const lock = await open(path, "wx", 0o600).catch(() => {
			throw new RelayError("relay_request_locked");
		});
		try {
			return await action(dir);
		} finally {
			await lock.close();
			await unlink(path);
		}
	}
	private async job(id: string) {
		const job = await this.read(this.dir(id), "request.json", jobSchema);
		if (!job || job.owner !== this.owner) throw new RelayError("request_missing");
		if (job.requestId !== id || job.fingerprint !== this.fingerprint(job))
			throw new RelayError("relay_storage_invalid");
		return job;
	}
	private fingerprint(input: Input & { previousReplyDigest?: string | null }) {
		return digest(
			JSON.stringify([
				this.owner,
				input.requestId,
				input.prompt,
				input.previousRequestId ?? null,
				input.previousReplyDigest ?? null,
			]),
		);
	}
	async enqueue(value: Input) {
		if (Array.isArray(value.attachments) && value.attachments.length)
			throw new RelayError("relay_attachments_unsupported");
		const input = relayRequestSchema.safeParse(value);
		if (!input.success) throw new RelayError("invalid_relay_request");
		const request = input.data;
		if (request.previousRequestId === request.requestId)
			throw new RelayError("continuity_mismatch");
		let previousReplyDigest: string | null = null;
		if (request.previousRequestId) {
			const previous = await this.status(request.previousRequestId);
			if (previous.state !== "replied" || !previous.reply)
				throw new RelayError("previous_reply_required");
			previousReplyDigest = previous.reply.sha256;
		}
		return this.locked(
			request.requestId,
			async (dir) => {
				const old = await this.read(dir, "request.json", jobSchema);
				const fingerprint = this.fingerprint({ ...request, previousReplyDigest });
				if (old) {
					if (old.owner !== this.owner || old.fingerprint !== fingerprint)
						throw new RelayError("request_conflict");
					return { requestId: old.requestId, fingerprint: old.fingerprint };
				}
				await this.publish(dir, "request.json", {
					version: 1,
					...request,
					owner: this.owner,
					fingerprint,
					previousReplyDigest,
				});
				return { requestId: request.requestId, fingerprint };
			},
			true,
		);
	}
	async request(id: string) {
		const job = await this.job(id);
		const previous = job.previousRequestId ? await this.status(job.previousRequestId) : null;
		if (previous && (!previous.reply || previous.reply.sha256 !== job.previousReplyDigest))
			throw new RelayError("continuity_mismatch");
		return {
			requestId: job.requestId,
			prompt: job.prompt,
			fingerprint: job.fingerprint,
			previousRequestId: job.previousRequestId ?? null,
			previousReply: previous?.reply ?? null,
		};
	}
	async claim(id: string, fingerprint: string) {
		return this.locked(id, async (dir) => {
			const job = await this.job(id);
			if (job.fingerprint !== fingerprint) throw new RelayError("request_conflict");
			// Corrupt/orphaned reply/hold files cannot turn into a new dispatch.
			await this.status(id);
			const old = await this.read(dir, "claim.json", claimSchema);
			if (old) return { ...old, fresh: false };
			if ((await this.status(id)).state === "held_unknown")
				throw new RelayError("relay_frontend_configuration_held");
			const claim = { claimId: randomUUID(), fingerprint };
			await this.publish(dir, "claim.json", claim);
			return { ...claim, fresh: true };
		});
	}
	/** Reserve before changing controls; an interrupted/failed attempt never retries itself. */
	async configureFrontend(
		id: string,
		fingerprint: string,
		value: RelayFrontendBinding,
		configureAndObserve: () => Promise<void>,
	) {
		const binding = frontendBindingSchema.safeParse(value);
		if (!binding.success) throw new RelayError("relay_sender_binding_invalid");
		return this.locked(id, async (dir) => {
			const job = await this.job(id);
			if (job.fingerprint !== fingerprint) throw new RelayError("request_conflict");
			await this.status(id);
			if (await this.read(dir, "claim.json", claimSchema))
				throw new RelayError("relay_sender_claim_not_owned");
			if (await this.read(dir, "configuration.json", configurationSchema))
				throw new RelayError("relay_frontend_configuration_held");
			const intent = { ...binding.data, fingerprint, effort: "pro" as const };
			await this.publish(dir, "configuration.json", intent);
			await configureAndObserve();
			await this.publish(dir, "configuration-verified.json", intent);
		});
	}
	/** Route comparison metadata, never browser authority. Partial writes refuse recovery. */
	async frontendClaim(id: string, fingerprint: string, value: RelayFrontendBinding) {
		const binding = frontendBindingSchema.safeParse(value);
		if (!binding.success) throw new RelayError("relay_sender_binding_invalid");
		return this.locked(id, async (dir) => {
			const job = await this.job(id);
			if (job.fingerprint !== fingerprint) throw new RelayError("request_conflict");
			await this.status(id);
			const old = await this.read(dir, "claim.json", claimSchema);
			const sender = await this.read(dir, "sender.json", frontendClaimSchema);
			const preparation = await this.read(dir, "configuration.json", configurationSchema);
			if (preparation) {
				if (
					Object.entries(binding.data).some(
						([key, val]) => preparation[key as keyof RelayFrontendBinding] !== val,
					)
				)
					throw new RelayError("relay_sender_binding_mismatch");
				if ((await this.status(id)).state === "held_unknown" && !old)
					throw new RelayError("relay_frontend_configuration_held");
			}

			if (sender) {
				if (
					!old ||
					sender.claimId !== old.claimId ||
					sender.fingerprint !== fingerprint ||
					Object.entries(binding.data).some(
						([key, val]) => sender[key as keyof RelayFrontendBinding] !== val,
					)
				)
					throw new RelayError("relay_sender_binding_mismatch");
				return { ...old, fresh: false };
			}
			if (old) throw new RelayError("relay_sender_claim_not_owned");
			const claim = { claimId: randomUUID(), fingerprint };
			// A crash before the binding write leaves a non-adoptable claim, never a new Send.
			await this.publish(dir, "claim.json", claim);
			await this.publish(dir, "sender.json", { ...binding.data, ...claim });
			return { ...claim, fresh: true };
		});
	}
	async submit(id: string, claimId: string, text: string) {
		const reply = replySchema.safeParse({
			claimId,
			text,
			sha256: digest(text),
			providerResponseId: null,
			liveVerified: false,
		});
		if (!reply.success || !text.trim()) throw new RelayError("invalid_relay_reply");
		return this.locked(id, async (dir) => {
			const job = await this.job(id);
			const claim = await this.read(dir, "claim.json", claimSchema);
			if (!claim || claim.claimId !== claimId || claim.fingerprint !== job.fingerprint)
				throw new RelayError("claim_mismatch");
			const old = await this.read(dir, "reply.json", replySchema);
			if (old) {
				if (old.claimId !== claimId || old.text !== text || old.sha256 !== reply.data.sha256)
					throw new RelayError("reply_conflict");
				return old;
			}
			await this.publish(dir, "reply.json", reply.data);
			return reply.data;
		});
	}
	async hold(id: string, claimId: string) {
		return this.locked(id, async (dir) => {
			await this.job(id);
			const claim = await this.read(dir, "claim.json", claimSchema);
			if (!claim || claim.claimId !== claimId) throw new RelayError("claim_mismatch");
			if (!(await this.read(dir, "hold.json", holdSchema)))
				await this.publish(dir, "hold.json", { claimId, state: "held_unknown" });
			return { state: "held_unknown" as const };
		});
	}
	async status(id: string) {
		const job = await this.job(id),
			dir = this.dir(id);
		const claim = await this.read(dir, "claim.json", claimSchema);
		const reply = await this.read(dir, "reply.json", replySchema);
		const hold = await this.read(dir, "hold.json", holdSchema);
		const preparation = await this.read(dir, "configuration.json", configurationSchema);
		const verified = await this.read(dir, "configuration-verified.json", configurationSchema);
		if (
			(preparation && preparation.fingerprint !== job.fingerprint) ||
			(verified && JSON.stringify(verified) !== JSON.stringify(preparation)) ||
			(claim && claim.fingerprint !== job.fingerprint) ||
			(reply &&
				(!claim || reply.claimId !== claim.claimId || reply.sha256 !== digest(reply.text))) ||
			(hold && hold.claimId !== claim?.claimId)
		)
			throw new RelayError("relay_storage_invalid");
		return {
			requestId: id,
			fingerprint: job.fingerprint,
			state: reply
				? "replied"
				: hold || (preparation && !verified)
					? "held_unknown"
					: claim
						? "awaiting_reply"
						: "ready",
			claimId: claim?.claimId ?? null,
			reply,
			liveVerified: false as const,
		};
	}
}
