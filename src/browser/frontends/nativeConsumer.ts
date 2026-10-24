import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { FrontendError, type NativeTaskBinding } from "./types.js";

const version = "agent-browser.retained-consumer.v1";
const id = z.string().min(1).max(1024);
const ackSchema = z.object({
	kind: z.enum(["opened", "observed", "input_acknowledged"]),
	completedAtMs: z.number().int().nonnegative(),
});
const operationSchema = z.object({
	operationId: id,
	operationKey: id,
	action: id,
	state: z.literal("completed"),
	ack: ackSchema,
	createdAtMs: z.number().int().nonnegative(),
});
const statusSchema = z.object({
	contractVersion: z.literal(version),
	taskId: id,
	controlRef: id,
	consumerGrantId: id,
	acquisitionId: id,
	state: z.literal("active"),
	expiresAtMs: z.number().int().positive(),
	operation: operationSchema,
	consumerAck: ackSchema,
	result: z.unknown(),
});
const admissionSchema = z
	.object({
		consumerGrantId: id,
		profileCapability: id,
		taskKey: id,
		profileId: id,
		browserId: id,
		tabId: id,
		targetId: id,
		expiresAtMs: z.number().int().positive(),
	})
	.strict();
export type NativeConsumerAdmission = z.infer<typeof admissionSchema>;
/** The existing SDK Client satisfies this port. No launcher, reconnect or discovery. */
export interface NativeMcpClient {
	callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}
/** Exact sealed r2 fragment, CONTRACT.md70fbb8e9. No generation/auth wire guessed. */
const targetObservationSchema = z
	.object({
		operationId: id,
		targetId: id,
		targetType: z.literal("page"),
		origin: z.literal("https://chatgpt.com"),
		stage: z.literal("after_action"),
		observedAtMs: z.number().int().nonnegative(),
	})
	.strict();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Bucket = "acquisition" | "read" | "control" | "draft" | "send";
const limits: Record<Bucket, number> = { acquisition: 1, read: 20, control: 6, draft: 2, send: 2 };
function fail(code: string): never {
	throw new FrontendError(
		code,
		"Native consumer held; retain the original operation and inspect its readback.",
	);
}

/** Immutable reservations count even on failure. No private UI text or credentials. */
class NativeLedger {
	constructor(private readonly directory: string) {
		if (!isAbsolute(directory) || process.platform === "win32")
			fail("consumer_ledger_private_required");
	}
	private async privatePath(path: string, directory = false) {
		const s = await lstat(path);
		if (
			(directory ? !s.isDirectory() : !s.isFile()) ||
			s.isSymbolicLink() ||
			(process.getuid && s.uid !== process.getuid()) ||
			s.mode & 0o077
		)
			fail("consumer_ledger_private_required");
	}
	private async write(name: string, value: unknown) {
		const fd = await open(
			join(this.directory, name),
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			await fd.writeFile(JSON.stringify(value));
			await fd.sync();
		} finally {
			await fd.close();
		}
		const parent = await open(this.directory, "r");
		try {
			await parent.sync();
		} finally {
			await parent.close();
		}
	}
	async run<T>(
		key: string,
		intent: unknown,
		bucket: Bucket,
		effect: () => Promise<{ value: T; metadata: unknown }>,
		originalKey?: string,
	): Promise<T> {
		if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) fail("consumer_operation_key_invalid");
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await this.privatePath(this.directory, true);
		const lock = join(this.directory, "operation.lock");
		const fd = await open(lock, "wx", 0o600).catch(() => fail("consumer_operation_held"));
		try {
			const entries = await readdir(this.directory);
			let used = 0,
				originalFound = originalKey === undefined;
			for (const name of entries.filter((n) => /^reservation-[a-f0-9]{64}\.json$/.test(n))) {
				await this.privatePath(join(this.directory, name));
				const f = await open(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
				let record: { bucket: Bucket; key: string; intentDigest: string };
				try {
					if ((await f.stat()).size > 16384) fail("consumer_ledger_invalid");
					record = z
						.object({
							bucket: z.enum(["acquisition", "read", "control", "draft", "send"]),
							key: id,
							intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
						})
						.strict()
						.parse(JSON.parse(await f.readFile("utf8")));
				} finally {
					await f.close();
				}
				if (!Object.hasOwn(limits, record.bucket)) fail("consumer_ledger_invalid");
				if (record.key === originalKey) originalFound = true;
				if (name !== `reservation-${digest(record.key)}.json`) fail("consumer_ledger_invalid");
				const completion = name.replace("reservation-", "completed-");
				if (!entries.includes(completion) && record.key !== originalKey)
					fail("consumer_readback_required");
				if (entries.includes(completion)) {
					await this.privatePath(join(this.directory, completion));
					const complete = await open(
						join(this.directory, completion),
						constants.O_RDONLY | constants.O_NOFOLLOW,
					);
					try {
						if ((await complete.stat()).size > 16384) fail("consumer_ledger_invalid");
						const row = JSON.parse(await complete.readFile("utf8"));
						if (
							row.completed !== true ||
							row.key !== record.key ||
							row.intentDigest !== record.intentDigest ||
							row.bucket !== record.bucket
						)
							fail("consumer_ledger_invalid");
					} finally {
						await complete.close();
					}
				}
				if (record.bucket === bucket) used++;
			}
			const token = digest(key);
			if (!originalFound) fail("consumer_operation_key_invalid");
			if (entries.includes(`reservation-${token}.json`))
				fail(bucket === "acquisition" ? "consumer_acquisition_held" : "consumer_operation_held");
			if (used >= limits[bucket]) fail("consumer_budget_exhausted");
			await this.write(`reservation-${token}.json`, { bucket, key, intentDigest: digest(intent) });
			const result = await effect();
			await this.write(`completed-${token}.json`, {
				bucket,
				key,
				intentDigest: digest(intent),
				completed: true,
				metadata: result.metadata,
			});
			return result.value;
		} catch (error) {
			if (error instanceof FrontendError) throw error;
			return fail("consumer_ledger_invalid");
		} finally {
			await fd.close();
			await unlink(lock);
		}
	}
}

/** One admitted consumer on one caller-owned MCP connection. Never retries a call. */
export class NativeConsumerSession {
	#client: NativeMcpClient;
	#admission: NativeConsumerAdmission;
	#ledger: NativeLedger;
	#binding: NativeTaskBinding | null = null;
	#now: () => number;
	#held = false;
	#expires: number | null = null;
	#wireSession: string | null = null;
	#controlRef: string | null = null;
	#acquisitionId: string | null = null;
	#bindingDigest: string | null = null;
	constructor(
		client: NativeMcpClient,
		admission: NativeConsumerAdmission,
		directory: string,
		now = Date.now,
	) {
		const parsed = admissionSchema.safeParse(admission);
		if (!parsed.success) fail("consumer_admission_invalid");
		this.#client = client;
		this.#admission = parsed.data;
		this.#ledger = new NativeLedger(directory);
		this.#now = now;
	}
	get binding(): NativeTaskBinding {
		if (!this.#binding) return fail("consumer_acquisition_required");
		return { ...this.#binding };
	}
	private async payload(tool: string, args: Record<string, unknown>) {
		const raw = await this.#client.callTool({ name: tool, arguments: args });
		const message = z
			.object({
				isError: z.literal(false).optional(),
				content: z
					.array(z.object({ type: z.literal("text"), text: z.string().max(2097152) }))
					.length(1),
			})
			.parse(raw);
		const envelope = z
			.object({
				tool: z.literal(tool),
				session: id,
				success: z.literal(true),
				data: z.unknown(),
				error: z.null().optional(),
			})
			.parse(JSON.parse(message.content[0].text));
		if (this.#wireSession !== null && this.#wireSession !== envelope.session)
			fail("consumer_connection_mismatch");
		return envelope;
	}
	private async invoke(tool: string, args: Record<string, unknown>, action: string, key?: string) {
		try {
			const envelope = await this.payload(tool, args);
			const data = statusSchema.parse(envelope.data);
			const a = this.#admission;
			const kind =
				action === "open"
					? "opened"
					: ["url", "snapshot", "gettext"].includes(action)
						? "observed"
						: "input_acknowledged";
			if (
				data.consumerGrantId !== a.consumerGrantId ||
				data.expiresAtMs !== (this.#expires ?? a.expiresAtMs) ||
				data.expiresAtMs <= this.#now() ||
				data.consumerAck.completedAtMs > this.#now() ||
				data.operation.action !== action ||
				(key !== undefined && data.operation.operationKey !== key) ||
				data.consumerAck.kind !== kind ||
				JSON.stringify(data.operation.ack) !== JSON.stringify(data.consumerAck) ||
				(this.#binding &&
					(data.taskId !== this.#binding.taskId || data.controlRef !== this.#controlRef)) ||
				(envelope.data as Record<string, unknown>).readbackOnly === true
			)
				fail("consumer_completion_invalid");
			const observed = targetObservationSchema.safeParse(
				(envelope.data as Record<string, unknown>).targetObservation,
			);
			if (!observed.success) fail("consumer_identity_missing");
			if (
				observed.data.operationId !== data.operation.operationId ||
				observed.data.targetId !== a.targetId ||
				observed.data.observedAtMs < data.operation.createdAtMs ||
				observed.data.observedAtMs > data.consumerAck.completedAtMs ||
				observed.data.observedAtMs > this.#now()
			)
				fail("consumer_identity_mismatch");
			// Private generation/custody/principal validation belongs to Browser v1.
			// This is only a stable public-reference fingerprint, never new authority.
			const bindingDigest = digest([
				data.taskId,
				data.controlRef,
				data.consumerGrantId,
				data.acquisitionId,
				data.expiresAtMs,
				observed.data.targetId,
			]);
			if (this.#bindingDigest !== null && bindingDigest !== this.#bindingDigest)
				fail("consumer_identity_mismatch");

			if (action === "open") {
				const identity = envelope.data as Record<string, unknown>;
				if (
					identity.profileId !== a.profileId ||
					identity.browserId !== a.browserId ||
					identity.tabId !== a.tabId
				)
					fail("consumer_binding_mismatch");
				this.#wireSession = envelope.session;
			}
			const identity =
				action === "open"
					? z.object({ profileId: id, browserId: id, tabId: id }).parse(envelope.data)
					: this.#binding;
			if (!identity) fail("consumer_binding_mismatch");
			return { ...data, identity, targetObservation: observed.data, bindingDigest };
		} catch (error) {
			this.#held = true;
			if (
				error instanceof FrontendError &&
				["consumer_identity_missing", "consumer_identity_mismatch"].includes(error.code)
			)
				throw error;
			return fail("consumer_readback_required");
		}
	}
	async acquire(): Promise<NativeTaskBinding> {
		if (this.#binding) return fail("consumer_acquisition_held");
		if (this.#held || this.#admission.expiresAtMs <= this.#now())
			return fail("consumer_readback_required");
		const a = this.#admission;
		return this.#ledger.run(
			"consumer_acquisition",
			[a.consumerGrantId, a.taskKey, a.profileId, a.browserId, a.tabId, a.targetId, a.expiresAtMs],
			"acquisition",
			async () => {
				const data = await this.invoke(
					"browser_open",
					{
						profileMode: "consumer",
						consumerGrantId: a.consumerGrantId,
						profileCapability: a.profileCapability,
						taskKey: a.taskKey,
						profile: a.profileId,
						url: "https://chatgpt.com/",
						serviceName: "AuraCall",
						agentName: "frontend-mcp",
						taskName: "auracall-e2e-20261021",
					},
					"open",
				);
				this.#expires = data.expiresAtMs;
				this.#controlRef = data.controlRef;
				this.#acquisitionId = data.acquisitionId;
				this.#bindingDigest = data.bindingDigest;
				this.#binding = {
					controlRef: data.controlRef,
					taskId: data.taskId,
					profileId: data.identity.profileId,
					browserId: data.identity.browserId,
					tabId: data.identity.tabId,
					targetId: data.targetObservation.targetId,
				};
				return {
					value: this.binding,
					metadata: { taskId: data.taskId, controlRef: data.controlRef, ack: data.consumerAck },
				};
			},
		);
	}
	private async command(
		action: string,
		params: Record<string, unknown>,
		key: string,
		bucket: Bucket,
	): Promise<Record<string, unknown>> {
		if (this.#held || (this.#expires ?? 0) <= this.#now())
			return fail("consumer_readback_required");
		const binding = this.binding;
		return this.#ledger.run(key, [binding, action, params], bucket, async () => {
			const data = await this.invoke(
				"browser_command",
				{ taskId: binding.taskId, operationKey: key, action, params },
				action,
				key,
			);
			if (
				!data.result ||
				typeof data.result !== "object" ||
				Array.isArray(data.result) ||
				(action === "fill" &&
					!z
						.object({ filled: z.literal(true) })
						.strict()
						.safeParse(data.result).success) ||
				(action === "click" &&
					!z
						.object({ clicked: z.literal(true) })
						.strict()
						.safeParse(data.result).success)
			) {
				this.#held = true;
				return fail("consumer_completion_invalid");
			}
			return {
				value: data.result as Record<string, unknown>,
				metadata: { taskId: data.taskId, controlRef: data.controlRef, operation: data.operation },
			};
		});
	}
	read(action: "url" | "snapshot" | "gettext", params: Record<string, unknown>, key: string) {
		if (
			!["url", "snapshot", "gettext"].includes(action) ||
			(action === "url" && Object.keys(params).length) ||
			(action === "snapshot" &&
				Object.keys(params).some((p) => !["compact", "interactive"].includes(p))) ||
			(action === "gettext" &&
				(Object.keys(params).length !== 1 ||
					typeof params.selector !== "string" ||
					!params.selector ||
					params.selector.length > 2048))
		)
			return Promise.reject(
				new FrontendError("consumer_arguments_invalid", "Use the closed native read parameters."),
			);
		return this.command(action, params, key, "read");
	}
	fill(text: string, key: string) {
		if (!text.trim() || text.length > 8192)
			return Promise.reject(new FrontendError("invalid_request", "Use bounded nonempty text."));
		return this.command("fill", { selector: "#prompt-textarea", value: text }, key, "draft");
	}
	send(key: string) {
		return this.command("click", { selector: 'button[data-testid="send-button"]' }, key, "send");
	}
	/** Metadata for the ORIGINAL key only; never returns page text or clears an input hold. */
	async originalReadback(key: string): Promise<Record<string, unknown>> {
		if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) return fail("consumer_operation_key_invalid");
		const b = this.binding;
		const controlRef = this.#controlRef;
		const acquisitionId = this.#acquisitionId;
		if (!controlRef || !acquisitionId) return fail("consumer_acquisition_required");
		this.#held = true;
		return this.#ledger.run(
			`metadata_${digest(key)}`,
			[b, key],
			"read",
			async () => {
				try {
					const envelope = await this.payload("browser_continue", {
						taskId: b.taskId,
						operationKey: key,
					});
					const d = z
						.object({
							contractVersion: z.literal(version),
							taskId: z.literal(b.taskId),
							controlRef: z.literal(controlRef),
							acquisitionId: z.literal(acquisitionId),
							consumerGrantId: z.literal(this.#admission.consumerGrantId),
							requestedOperationKey: z.literal(key),
							matchingOperation: z.literal(true),
							state: z.enum(["active", "unknown", "released", "expired", "revoked"]),
							operation: z.object({
								operationKey: z.literal(key),
								state: z.enum(["reserved", "claimed", "completed", "unknown"]),
							}),
						})
						.parse(envelope.data);
					if (
						envelope.data &&
						typeof envelope.data === "object" &&
						("targetObservation" in envelope.data || "result" in envelope.data)
					)
						fail("consumer_readback_required");
					const metadata = {
						taskId: d.taskId,
						controlRef: d.controlRef,
						operationKey: key,
						state: d.state,
						operationState: d.operation.state,
						readbackOnly: true,
						pageObserved: false,
					};
					return { value: metadata, metadata };
				} catch {
					return fail("consumer_readback_required");
				}
			},
			key,
		);
	}
}
