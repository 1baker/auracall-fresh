import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, opendir, unlink } from "node:fs/promises";
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
export const relayPendingQuerySchema = z
	.object({
		limit: z.number().int().min(1).max(20).default(10),
		after: relayId.optional(),
	})
	.strict();
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
const proBindingSchema = frontendBindingSchema.extend({ targetKey: hash, binding: hash }).strict();
export type RelayProPreparationBinding = z.infer<typeof proBindingSchema>;
const proIntentSchema = proBindingSchema
	.extend({
		operationId: relayId,
		owner: z.string().min(1).max(256),
	})
	.strict();
type ProPreparationIntent = z.infer<typeof proIntentSchema>;
const proVerifiedSchema = proIntentSchema.extend({ verifiedAt: z.string().datetime() }).strict();
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
const dispatchBindingSchema = frontendClaimSchema
	.extend({
		requestId: relayId,
		intent: hash,
		generation: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
	})
	.strict();
export type CanonicalDispatchBinding = z.infer<typeof dispatchBindingSchema>;
const dispatchAdmissionSchema = dispatchBindingSchema.omit({ claimId: true }).strict();
export type CanonicalDispatchAdmission = z.infer<typeof dispatchAdmissionSchema>;
export type CanonicalDispatchStage =
	| "admit"
	| "configure"
	| "send"
	| "readback"
	| "publish"
	| "settle"
	| "fence";
/** Selected private operator code supplies real authority. These methods are
 * deliberately unavailable in JSON startup/MCP metadata; labels do not authorize. */
export interface CanonicalDispatchAuthority {
	assertCurrent(
		binding: Readonly<CanonicalDispatchBinding>,
		stage: CanonicalDispatchStage,
	): Promise<void>;
	verifyTerminal(
		binding: Readonly<CanonicalDispatchBinding>,
		operation: Readonly<CanonicalOriginalOperation>,
		receipt: Readonly<CanonicalTerminalReceipt>,
	): Promise<void>;
}
const originalOperationSchema = z
	.object({
		method: z.literal("frontend_send"),
		operationId: relayId,
		requestId: relayId,
		routeId: z.string().min(1).max(128),
		promptSha256: hash,
		previousRequestId: relayId.nullable(),
	})
	.strict();
export type CanonicalOriginalOperation = z.infer<typeof originalOperationSchema>;
const terminalReceiptSchema = z
	.object({
		ok: z.literal(true),
		status: z.literal("completed"),
		requestId: relayId,
		routeId: z.string().min(1).max(128),
		previousRequestId: relayId.nullable(),
		conversationUrl: z.string().regex(/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/),
		output: z.string().min(1).max(262144),
	})
	.strict();
export type CanonicalTerminalReceipt = z.infer<typeof terminalReceiptSchema>;
const dispatchRecordSchema = z
	.object({
		version: z.literal(1),
		spanId: z.string().uuid(),
		binding: dispatchBindingSchema,
	})
	.strict();
const dispatchOperationSchema = z
	.object({
		spanId: z.string().uuid(),
		operation: originalOperationSchema,
	})
	.strict();
const dispatchSettlementSchema = z
	.object({
		spanId: z.string().uuid(),
		binding: dispatchBindingSchema,
		operation: originalOperationSchema,
		replySha256: hash,
		terminalReceiptSha256: hash,
	})
	.strict();
const dispatchFenceSchema = z
	.object({ spanId: z.string().uuid(), binding: dispatchBindingSchema })
	.strict();
export interface CanonicalDispatchSpan {
	readonly binding: Readonly<CanonicalDispatchBinding>;
	assertCurrent(stage: CanonicalDispatchStage): Promise<void>;
	recordOriginal(): Promise<Readonly<CanonicalOriginalOperation>>;
	settleOriginal(receipt: CanonicalTerminalReceipt): Promise<void>;
	hold(): Promise<void>;
}
const dispatchSpans = new WeakMap<
	CanonicalDispatchSpan,
	{
		store: RelayStore;
		binding: CanonicalDispatchBinding;
		fresh: boolean;
		attached: boolean;
		issued: boolean;
	}
>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
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
	/** Advisory owner-only discovery; never claims, sends or returns task payloads. */
	async pending(query: z.input<typeof relayPendingQuerySchema> = {}) {
		const parsed = relayPendingQuerySchema.safeParse(query);
		if (!parsed.success) throw new RelayError("invalid_pending_query");
		try {
			await this.privateDir(this.directory);
		} catch (error) {
			if (missing(error)) return { requests: [], nextCursor: null };
			throw error;
		}
		const ids: string[] = [];
		const directory = await opendir(this.directory);
		let scanned = 0;
		for await (const entry of directory) {
			if (++scanned > 512) throw new RelayError("relay_pending_scan_limit");
			if (!relayId.safeParse(entry.name).success) continue;
			if (!entry.isDirectory() || entry.isSymbolicLink())
				throw new RelayError("relay_storage_invalid");
			ids.push(entry.name);
		}
		const requests: { requestId: string; state: string; previousRequestId: string | null }[] = [];
		for (const id of ids.sort()) {
			if (parsed.data.after && id <= parsed.data.after) continue;
			const job = await this.read(this.dir(id), "request.json", jobSchema);
			if (!job || job.owner !== this.owner) continue;
			const status = await this.status(id);
			if (status.state === "replied") continue;
			requests.push({
				requestId: id,
				state: status.state,
				previousRequestId: job.previousRequestId ?? null,
			});
			if (requests.length > parsed.data.limit) break;
		}
		return {
			requests: requests.slice(0, parsed.data.limit),
			nextCursor:
				requests.length > parsed.data.limit ? requests[parsed.data.limit - 1].requestId : null,
		};
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
	/** A route-control journal, never a model request or a Send claim. */
	async prepareProOnly(
		operationId: string,
		value: RelayProPreparationBinding,
		prepare: () => Promise<void>,
	) {
		const expected = proIntentSchema.safeParse({ ...value, operationId, owner: this.owner });
		if (!expected.success) throw new RelayError("relay_pro_preparation_invalid");
		await this.privateDir(this.directory, true);
		if (await this.read(this.dir(operationId), "request.json", jobSchema))
			throw new RelayError("relay_pro_preparation_id_is_request");
		const namespace = join(this.directory, ".frontend-preparations");
		await this.privateDir(namespace, true);
		const targets = new RelayStore(join(namespace, "targets"), this.owner);
		const operations = new RelayStore(join(namespace, "operations"), this.owner);
		return targets.locked(
			value.targetKey,
			(targetDir) =>
				operations.locked(
					operationId,
					async (dir) => {
						const intent = await operations.read(dir, "intent.json", proIntentSchema);
						const target = await targets.read(targetDir, "intent.json", proIntentSchema);
						const verified = await operations.read(dir, "verified.json", proVerifiedSchema);
						const same = (row: ProPreparationIntent) =>
							Object.entries(expected.data).every(
								([k, v]) => row[k as keyof ProPreparationIntent] === v,
							);
						if ((intent && !same(intent)) || (target && !same(target)))
							throw new RelayError("relay_pro_preparation_binding_mismatch");
						if (verified && (!intent || !target || !same(verified)))
							throw new RelayError("relay_storage_invalid");
						const receipt = (at: string, cached: boolean) => ({
							ok: true,
							operationId,
							routeId: value.routeId,
							state: "verified" as const,
							preparationOnly: true,
							effort: "pro" as const,
							verifiedAt: at,
							currentPageObserved: !cached,
							cached,
							liveVerified: false as const,
						});
						if (verified) return receipt(verified.verifiedAt, true);
						if (intent || target) throw new RelayError("relay_pro_preparation_held");
						await targets.publish(targetDir, "intent.json", expected.data);
						await operations.publish(dir, "intent.json", expected.data);
						await prepare();
						const verifiedAt = new Date().toISOString();
						await operations.publish(dir, "verified.json", { ...expected.data, verifiedAt });
						return receipt(verifiedAt, false);
					},
					true,
				),
			true,
		);
	}
	/** Reserve before changing controls; an interrupted/failed attempt never retries itself. */
	async configureFrontend(
		id: string,
		fingerprint: string,
		value: RelayFrontendBinding,
		configureAndObserve: () => Promise<void>,
		span?: CanonicalDispatchSpan,
	) {
		const binding = frontendBindingSchema.safeParse(value);
		if (!binding.success) throw new RelayError("relay_sender_binding_invalid");
		return this.locked(id, async (dir) => {
			const job = await this.job(id);
			if (job.fingerprint !== fingerprint) throw new RelayError("request_conflict");
			await this.status(id);
			const claim = await this.read(dir, "claim.json", claimSchema);
			if (claim) {
				const own = span && dispatchSpans.get(span);
				if (
					!own ||
					own.store !== this ||
					own.binding.requestId !== id ||
					own.binding.claimId !== claim.claimId ||
					own.binding.fingerprint !== fingerprint ||
					Object.entries(binding.data).some(
						([k, v]) => own.binding[k as keyof RelayFrontendBinding] !== v,
					)
				)
					throw new RelayError("relay_sender_claim_not_owned");
				await span.assertCurrent("configure");
			}
			if (await this.read(dir, "configuration.json", configurationSchema))
				throw new RelayError("relay_frontend_configuration_held");
			const intent = { ...binding.data, fingerprint, effort: "pro" as const };
			await this.publish(dir, "configuration.json", intent);
			await configureAndObserve();
			await this.publish(dir, "configuration-verified.json", intent);
		});
	}
	/** Exact immutable claim + generation. No lease expiry, takeover or automatic
	 * replacement. The reservation remains pending across crashes and lost ACKs. */
	async beginExactRequest(
		value: CanonicalDispatchAdmission,
		authority: CanonicalDispatchAuthority,
	): Promise<CanonicalDispatchSpan> {
		const parsed = dispatchAdmissionSchema.safeParse(value);
		if (!parsed.success) throw new RelayError("relay_dispatch_binding_invalid");
		if (
			typeof authority?.assertCurrent !== "function" ||
			typeof authority?.verifyTerminal !== "function"
		)
			throw new RelayError("relay_dispatch_authority_required");
		const binding = dispatchBindingSchema.parse({ ...parsed.data, claimId: randomUUID() });
		await authority.assertCurrent(Object.freeze({ ...binding }), "admit");
		const record = await this.locked(binding.requestId, async (dir) => {
			const job = await this.job(binding.requestId);
			if (job.fingerprint !== binding.fingerprint) throw new RelayError("request_conflict");
			if (await this.read(dir, "claim.json", claimSchema))
				throw new RelayError("relay_dispatch_fresh_claim_required");
			if ((await this.status(binding.requestId)).state !== "ready")
				throw new RelayError("relay_dispatch_not_fresh");
			const preparation = await this.read(dir, "configuration.json", configurationSchema);
			if (
				preparation &&
				Object.entries({
					routeId: binding.routeId,
					expectedUrl: binding.expectedUrl,
					expectedModel: binding.expectedModel,
				}).some(([k, v]) => preparation[k as keyof RelayFrontendBinding] !== v)
			)
				throw new RelayError("relay_sender_binding_mismatch");
			await authority.assertCurrent(Object.freeze({ ...binding }), "admit");
			const row = { version: 1 as const, spanId: randomUUID(), binding };
			const claim = { claimId: binding.claimId, fingerprint: binding.fingerprint };
			// Same request lock: no legacy Send can escape before its canonical
			// reservation exists. Partial publication is permanently non-fresh.
			await this.publish(dir, "claim.json", claim);
			await this.publish(dir, "sender.json", {
				...{
					routeId: binding.routeId,
					expectedUrl: binding.expectedUrl,
					expectedModel: binding.expectedModel,
				},
				...claim,
			});
			await this.publish(dir, "dispatch.json", row);
			return row;
		});
		const span = this.dispatchSpan(record, authority, true);
		await span.assertCurrent("admit");
		return span;
	}
	/** Recovery is original-readback/settlement ONLY, never another Send or Pro
	 * change. Actual current readback authority must be supplied independently. */
	async originalDispatch(
		value: CanonicalDispatchBinding,
		authority: CanonicalDispatchAuthority,
	): Promise<CanonicalDispatchSpan> {
		const binding = dispatchBindingSchema.parse(value);
		if (
			typeof authority?.assertCurrent !== "function" ||
			typeof authority?.verifyTerminal !== "function"
		)
			throw new RelayError("relay_dispatch_authority_required");
		await authority.assertCurrent(Object.freeze({ ...binding }), "readback");
		const record = await this.matchDispatchBinding(binding);
		if (!record) throw new RelayError("relay_dispatch_missing");
		return this.dispatchSpan(record, authority, false);
	}
	async fenceExactRequest(value: CanonicalDispatchBinding, authority: CanonicalDispatchAuthority) {
		const binding = dispatchBindingSchema.parse(value);
		if (typeof authority?.assertCurrent !== "function")
			throw new RelayError("relay_dispatch_authority_required");
		await authority.assertCurrent(Object.freeze({ ...binding }), "fence");
		return this.locked(binding.requestId, async (dir) => {
			const record = await this.matchDispatchBinding(binding);
			if (!record) throw new RelayError("relay_dispatch_missing");
			await authority.assertCurrent(Object.freeze({ ...binding }), "fence");
			const old = await this.read(dir, "dispatch-fence.json", dispatchFenceSchema);
			if (!old) await this.publish(dir, "dispatch-fence.json", { spanId: record.spanId, binding });
			else if (old.spanId !== record.spanId || !same(old.binding, binding))
				throw new RelayError("relay_storage_invalid");
			return { state: "fenced_original_unsettled" as const, cancelled: false as const };
		});
	}
	private async matchDispatchBinding(binding: CanonicalDispatchBinding) {
		const dir = this.dir(binding.requestId),
			job = await this.job(binding.requestId);
		const claim = await this.read(dir, "claim.json", claimSchema);
		const sender = await this.read(dir, "sender.json", frontendClaimSchema);
		if (
			job.fingerprint !== binding.fingerprint ||
			claim?.claimId !== binding.claimId ||
			!sender ||
			Object.entries(sender).some(([k, v]) => binding[k as keyof CanonicalDispatchBinding] !== v)
		)
			throw new RelayError("relay_dispatch_binding_mismatch");
		const record = await this.read(dir, "dispatch.json", dispatchRecordSchema);
		if (record && !same(record.binding, binding))
			throw new RelayError("relay_dispatch_binding_mismatch");
		const operation = await this.read(dir, "dispatch-operation.json", dispatchOperationSchema);
		if (
			operation &&
			(!record ||
				operation.spanId !== record.spanId ||
				operation.operation.operationId !== binding.requestId ||
				operation.operation.requestId !== binding.requestId ||
				operation.operation.routeId !== binding.routeId ||
				operation.operation.promptSha256 !== digest(job.prompt) ||
				operation.operation.previousRequestId !== (job.previousRequestId ?? null))
		)
			throw new RelayError("relay_dispatch_binding_mismatch");
		return record;
	}
	private dispatchSpan(
		record: z.infer<typeof dispatchRecordSchema>,
		authority: CanonicalDispatchAuthority,
		fresh: boolean,
	): CanonicalDispatchSpan {
		const binding = Object.freeze({ ...record.binding }),
			dir = this.dir(binding.requestId);
		let held = false,
			issued = false;
		const assertCurrent = async (stage: CanonicalDispatchStage) => {
			if (!fresh && !["readback", "publish", "settle"].includes(stage))
				throw new RelayError("relay_dispatch_readback_only");
			try {
				await authority.assertCurrent(binding, stage);
				const current = await this.matchDispatchBinding(binding);
				if (!current || current.spanId !== record.spanId)
					throw new RelayError("relay_dispatch_binding_mismatch");
				if (
					!["readback", "publish", "settle"].includes(stage) &&
					(held ||
						(await this.read(dir, "hold.json", holdSchema)) ||
						(await this.read(dir, "dispatch-fence.json", dispatchFenceSchema)))
				)
					throw new RelayError("relay_dispatch_held");
				await authority.assertCurrent(binding, stage);
			} catch (error) {
				held = true;
				throw error;
			}
		};
		const span: CanonicalDispatchSpan = {
			binding,
			assertCurrent,
			recordOriginal: async () => {
				if (!fresh || held || issued) throw new RelayError("relay_dispatch_readback_only");
				issued = true; // consume before the first await; failed reservation never retries
				const capability = dispatchSpans.get(span);
				if (!capability) throw new RelayError("relay_dispatch_span_not_owned");
				capability.issued = true;
				await assertCurrent("send");
				const job = await this.job(binding.requestId);
				const operation: CanonicalOriginalOperation = {
					method: "frontend_send",
					operationId: binding.requestId,
					requestId: binding.requestId,
					routeId: binding.routeId,
					promptSha256: digest(job.prompt),
					previousRequestId: job.previousRequestId ?? null,
				};
				await this.locked(binding.requestId, async () => {
					await assertCurrent("send");
					if (await this.read(dir, "dispatch-operation.json", dispatchOperationSchema))
						throw new RelayError("relay_dispatch_operation_exists");
					await this.publish(dir, "dispatch-operation.json", { spanId: record.spanId, operation });
					await assertCurrent("send");
				});
				return Object.freeze(operation);
			},
			settleOriginal: async (raw) => {
				const receipt = terminalReceiptSchema.parse(raw);
				await assertCurrent("settle");
				const original = await this.read(dir, "dispatch-operation.json", dispatchOperationSchema);
				if (
					!original ||
					original.spanId !== record.spanId ||
					receipt.requestId !== binding.requestId ||
					receipt.routeId !== binding.routeId ||
					receipt.previousRequestId !== original.operation.previousRequestId ||
					receipt.conversationUrl !== binding.expectedUrl ||
					!receipt.output.trim()
				)
					throw new RelayError("relay_dispatch_terminal_mismatch");
				await authority.verifyTerminal(
					binding,
					Object.freeze({ ...original.operation }),
					Object.freeze({ ...receipt }),
				);
				await assertCurrent("settle");
				await this.locked(binding.requestId, async () => {
					await assertCurrent("settle");
					let reply = await this.read(dir, "reply.json", replySchema);
					if (
						reply &&
						(reply.claimId !== binding.claimId ||
							reply.text !== receipt.output ||
							reply.sha256 !== digest(receipt.output))
					)
						throw new RelayError("relay_dispatch_terminal_conflict");
					if (!reply) {
						await assertCurrent("publish");
						reply = replySchema.parse({
							claimId: binding.claimId,
							text: receipt.output,
							sha256: digest(receipt.output),
							providerResponseId: null,
							liveVerified: false,
						});
						await this.publish(dir, "reply.json", reply);
						await assertCurrent("publish");
					}
					const terminal = {
						spanId: record.spanId,
						binding,
						operation: original.operation,
						replySha256: reply.sha256,
						terminalReceiptSha256: digest(JSON.stringify(receipt)),
					};
					const old = await this.read(dir, "dispatch-settlement.json", dispatchSettlementSchema);
					if (old) {
						if (!same(old, terminal)) throw new RelayError("relay_dispatch_terminal_conflict");
					} else await this.publish(dir, "dispatch-settlement.json", terminal);
					await assertCurrent("settle");
				});
			},
			hold: async () => {
				held = true;
				await this.hold(binding.requestId, binding.claimId);
			},
		};
		dispatchSpans.set(span, {
			store: this,
			binding: { ...binding },
			fresh,
			attached: false,
			issued: false,
		});
		return Object.freeze(span);
	}
	/** Consume the SAME local span once after private producer/startup work.
	 * No serialized Node object, second claim or factory acquisition is accepted. */
	async attachExactRequest(span: CanonicalDispatchSpan, value: CanonicalDispatchAdmission) {
		const expected = dispatchAdmissionSchema.parse(value),
			own = dispatchSpans.get(span);
		if (
			!own ||
			own.store !== this ||
			!own.fresh ||
			own.issued ||
			own.attached ||
			Object.entries(expected).some(
				([k, v]) => own.binding[k as keyof CanonicalDispatchBinding] !== v,
			)
		)
			throw new RelayError("relay_dispatch_span_not_owned");
		own.attached = true;
		await span.assertCurrent("admit");
		return span.binding;
	}
	/** Canonical metadata only; settled means the exact verified terminal record
	 * and saved reply agree, not a new grant or native/provider identity. */
	async exactRequestStatus(value: CanonicalDispatchBinding) {
		const binding = dispatchBindingSchema.parse(value);
		const record = await this.matchDispatchBinding(binding);
		if (!record) throw new RelayError("relay_dispatch_missing");
		const dir = this.dir(binding.requestId);
		const original = await this.read(dir, "dispatch-operation.json", dispatchOperationSchema);
		const terminal = await this.read(dir, "dispatch-settlement.json", dispatchSettlementSchema);
		const fence = await this.read(dir, "dispatch-fence.json", dispatchFenceSchema);
		const reply = await this.read(dir, "reply.json", replySchema);
		if (
			(original && original.spanId !== record.spanId) ||
			(fence && (fence.spanId !== record.spanId || !same(fence.binding, binding))) ||
			(terminal &&
				(!original ||
					!reply ||
					terminal.spanId !== record.spanId ||
					!same(terminal.binding, binding) ||
					!same(terminal.operation, original.operation) ||
					reply.sha256 !== digest(reply.text) ||
					terminal.replySha256 !== reply.sha256))
		)
			throw new RelayError("relay_storage_invalid");
		return {
			binding,
			spanId: record.spanId,
			state: terminal ? "settled" : fence ? "fenced" : "pending",
			operation: original?.operation ?? null,
			settlement: terminal,
			savedReplySha256: reply?.sha256 ?? null,
			cancelled: false as const,
		};
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
			if (await this.read(dir, "dispatch.json", dispatchRecordSchema))
				throw new RelayError("relay_dispatch_span_required");
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
		const execution = await this.read(dir, "dispatch.json", dispatchRecordSchema);
		const settled = execution
			? (await this.exactRequestStatus(execution.binding)).state === "settled"
			: true;
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
			state:
				reply && settled
					? "replied"
					: hold || (reply && !settled) || (preparation && !verified)
						? "held_unknown"
						: claim
							? "awaiting_reply"
							: "ready",
			claimId: claim?.claimId ?? null,
			reply: settled ? reply : null,
			liveVerified: false as const,
		};
	}
}
