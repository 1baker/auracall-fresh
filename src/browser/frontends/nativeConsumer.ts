import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
	matchNativeReadReservations,
	type NativeReadBudget,
	nativeReadBudgetData,
	recordNativeReadReservation,
} from "./nativeReadBudget.js";
import { FrontendError, type NativeTaskBinding } from "./types.js";

const version = "agent-browser.retained-consumer.v1";
const id = z.string().min(1).max(1024);
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
/** Exact reviewed producer-v2 identity.v1; identifiers are evidence, never bearer authority. */
const completedIdentitySchema = z
	.object({
		contractVersion: z.literal("agent-browser.retained-consumer.identity.v1"),
		taskId: id,
		acquisitionId: id,
		profileId: id,
		browserId: id,
		tabId: id,
		targetId: id,
		ownerGeneration: positiveInteger,
		publishedProcessDigest: z.string().regex(/^[0-9a-f]{64}$/),
		custodyDigest: z.string().regex(/^[0-9a-f]{64}$/),
		authentication: z
			.object({
				principalId: id,
				profileId: id,
				capabilityId: id,
				capabilityRevision: positiveInteger,
				provenance: z.literal("registered_capability"),
			})
			.strict(),
		operationId: id,
		operationKey: id,
		action: id,
		origin: z.literal("https://chatgpt.com"),
		observedAtMs: positiveInteger,
		completedAtMs: positiveInteger,
	})
	.strict();
const ackSchema = z.object({
	kind: z.enum(["opened", "observed", "input_acknowledged"]),
	completedAtMs: positiveInteger,
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
	expiresAtMs: positiveInteger,
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
		expiresAtMs: positiveInteger,
	})
	.strict();
export type NativeConsumerAdmission = z.infer<typeof admissionSchema>;
export function parseNativeConsumerAdmission(value: unknown): NativeConsumerAdmission {
	const parsed = admissionSchema.safeParse(value);
	if (!parsed.success) fail("consumer_admission_invalid");
	return parsed.data;
}
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
	constructor(
		private readonly directory: string,
		private readonly budget?: NativeReadBudget,
		private readonly expectedBudget?: {
			ledgerDirectory: string;
			admissionDigest: string;
			expiresAtMs: number;
		},
		private readonly now: () => number = Date.now,
	) {
		if (!isAbsolute(directory) || process.platform === "win32")
			fail("consumer_ledger_private_required");
	}
	private async accounting(
		entries: string[],
		rows: Map<string, { hash: string; bucket: Bucket; budgetId?: string }>,
	) {
		const totals: Record<Bucket, number> = {
			acquisition: 0,
			read: 0,
			control: 0,
			draft: 0,
			send: 0,
		};
		for (const row of rows.values()) totals[row.bucket]++;
		const fileName = "read-budget.json";
		if (!this.budget) {
			if (
				entries.includes(fileName) ||
				[...rows.values()].some((row) => row.budgetId !== undefined)
			)
				fail("native_read_budget_unqualified");
			return { totals, readLimit: limits.read, policyId: undefined };
		}
		if (!this.expectedBudget) fail("native_read_budget_unqualified");
		const bound = nativeReadBudgetData(this.budget, this.expectedBudget, this.now);
		const snapshot = [...rows]
			.map(([name, row]): [string, string] => [name, row.hash])
			.sort(([a], [b]) => a.localeCompare(b));
		matchNativeReadReservations(this.budget, digest(snapshot));
		const policyId = digest(bound);
		let baseline: [string, string][];
		if (entries.includes(fileName)) {
			const path = join(this.directory, fileName);
			await this.privatePath(path);
			const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
			try {
				if ((await f.stat()).size > 262144) fail("consumer_ledger_invalid");
				const saved = z
					.object({
						version: z.literal(1),
						policyId: z.string().regex(/^[a-f0-9]{64}$/),
						baseline: z
							.array(
								z.tuple([
									z.string().regex(/^reservation-[a-f0-9]{64}\.json$/),
									z.string().regex(/^[a-f0-9]{64}$/),
								]),
							)
							.max(128),
					})
					.strict()
					.parse(JSON.parse(await f.readFile("utf8")));
				if (saved.policyId !== policyId) fail("native_read_budget_unqualified");
				baseline = saved.baseline;
			} finally {
				await f.close();
			}
		} else {
			if ([...rows.values()].some((row) => row.budgetId !== undefined))
				fail("native_read_budget_unqualified");
			baseline = [...rows]
				.map(([name, row]): [string, string] => [name, row.hash])
				.sort(([a], [b]) => a.localeCompare(b));
		}
		if (
			digest(baseline) !== bound.evidence.reservationDigest ||
			new Set(baseline.map(([name]) => name)).size !== baseline.length
		)
			fail("native_read_budget_unqualified");
		const baseCounts: Record<Bucket, number> = {
			acquisition: 0,
			read: 0,
			control: 0,
			draft: 0,
			send: 0,
		};
		const names = new Set<string>();
		for (const [name, hash] of baseline) {
			const row = rows.get(name);
			if (!row || row.hash !== hash) fail("native_read_budget_unqualified");
			names.add(name);
			baseCounts[row.bucket]++;
		}
		for (const [name, row] of rows) {
			if (!names.has(name) && row.budgetId !== policyId) fail("native_read_budget_unqualified");
		}
		for (const bucket of Object.keys(totals) as Bucket[]) {
			if (bound.evidence.consumed[bucket] < baseCounts[bucket])
				fail("native_read_budget_unqualified");
			totals[bucket] += bound.evidence.consumed[bucket] - baseCounts[bucket];
		}
		if (!entries.includes(fileName)) await this.write(fileName, { version: 1, policyId, baseline });
		return { totals, readLimit: 80, policyId };
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
		originalKey?: string | string[],
		readReserve = 0,
	): Promise<T> {
		if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) fail("consumer_operation_key_invalid");
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await this.privatePath(this.directory, true);
		const lock = join(this.directory, "operation.lock");
		const fd = await open(lock, "wx", 0o600).catch(() => fail("consumer_operation_held"));
		try {
			const entries = await readdir(this.directory);
			const originals =
				originalKey === undefined ? [] : Array.isArray(originalKey) ? originalKey : [originalKey];
			const found = new Set<string>();
			const rows = new Map<string, { hash: string; bucket: Bucket; budgetId?: string }>();
			for (const name of entries.filter((n) => /^reservation-[a-f0-9]{64}\.json$/.test(n))) {
				await this.privatePath(join(this.directory, name));
				const f = await open(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
				let record: { bucket: Bucket; key: string; intentDigest: string; budgetId?: string };
				try {
					if ((await f.stat()).size > 16384) fail("consumer_ledger_invalid");
					const raw = await f.readFile("utf8");
					record = z
						.object({
							bucket: z.enum(["acquisition", "read", "control", "draft", "send"]),
							key: id,
							intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
							budgetId: z
								.string()
								.regex(/^[a-f0-9]{64}$/)
								.optional(),
						})
						.strict()
						.parse(JSON.parse(raw));
					rows.set(name, {
						hash: createHash("sha256").update(raw).digest("hex"),
						bucket: record.bucket,
						budgetId: record.budgetId,
					});
				} finally {
					await f.close();
				}
				if (!Object.hasOwn(limits, record.bucket)) fail("consumer_ledger_invalid");
				if (originals.includes(record.key)) found.add(record.key);
				if (name !== `reservation-${digest(record.key)}.json`) fail("consumer_ledger_invalid");
				const completion = name.replace("reservation-", "completed-");
				if (!entries.includes(completion) && !originals.includes(record.key))
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
			}
			const accounting = await this.accounting(entries, rows);
			const token = digest(key);
			if (found.size !== originals.length) fail("consumer_operation_key_invalid");
			if (entries.includes(`reservation-${token}.json`))
				fail(bucket === "acquisition" ? "consumer_acquisition_held" : "consumer_operation_held");
			if (accounting.policyId && (bucket === "draft" || bucket === "send"))
				fail("consumer_budget_exhausted");
			if (accounting.totals[bucket] >= (bucket === "read" ? accounting.readLimit : limits[bucket]))
				fail("consumer_budget_exhausted");
			// Leave capacity for the post-input URL/snapshot/URL and independent prepare check.
			if (accounting.readLimit - accounting.totals.read < readReserve)
				fail("consumer_budget_exhausted");
			if (this.budget && this.expectedBudget)
				nativeReadBudgetData(this.budget, this.expectedBudget, this.now);
			const reservation = {
				bucket,
				key,
				intentDigest: digest(intent),
				...(accounting.policyId ? { budgetId: accounting.policyId } : {}),
			};
			await this.write(`reservation-${token}.json`, reservation);
			if (this.budget) {
				const previous = [...rows].map(([name, row]): [string, string] => [name, row.hash]);
				const next = [
					...previous,
					[`reservation-${token}.json`, digest(reservation)] as [string, string],
				];
				recordNativeReadReservation(
					this.budget,
					digest(previous.sort(([a], [b]) => a.localeCompare(b))),
					digest(next.sort(([a], [b]) => a.localeCompare(b))),
				);
			}
			if (this.budget && this.expectedBudget)
				nativeReadBudgetData(this.budget, this.expectedBudget, this.now);
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
	#releaseKey: string | null = null;
	#expires: number | null = null;
	#wireSession: string | null = null;
	#controlRef: string | null = null;
	#acquisitionId: string | null = null;
	#bindingDigest: string | null = null;
	#completedOperations = new Set<string>();
	constructor(
		client: NativeMcpClient,
		admission: NativeConsumerAdmission,
		directory: string,
		now = Date.now,
		readBudget?: NativeReadBudget,
	) {
		this.#client = client;
		this.#admission = parseNativeConsumerAdmission(admission);
		const expectedBudget = {
			ledgerDirectory: directory,
			admissionDigest: digest(this.#admission),
			expiresAtMs: this.#admission.expiresAtMs,
		};
		if (readBudget) nativeReadBudgetData(readBudget, expectedBudget, now);
		this.#ledger = new NativeLedger(directory, readBudget, expectedBudget, now);
		this.#now = now;
	}
	get binding(): NativeTaskBinding {
		if (!this.#binding) return fail("consumer_acquisition_required");
		return { ...this.#binding };
	}
	/** Sticky semantic uncertainty; original metadata may still be read. */
	hold() {
		this.#held = true;
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
	private identityBinding(
		identity: z.infer<typeof completedIdentitySchema>,
		data: Pick<
			z.infer<typeof statusSchema>,
			"taskId" | "controlRef" | "consumerGrantId" | "acquisitionId" | "expiresAtMs" | "operation"
		>,
	) {
		const a = this.#admission;
		if (
			identity.taskId !== data.taskId ||
			identity.acquisitionId !== data.acquisitionId ||
			identity.profileId !== a.profileId ||
			identity.browserId !== a.browserId ||
			identity.tabId !== a.tabId ||
			identity.targetId !== a.targetId ||
			identity.authentication.profileId !== identity.profileId ||
			identity.operationId !== data.operation.operationId ||
			identity.operationKey !== data.operation.operationKey ||
			identity.action !== data.operation.action ||
			identity.completedAtMs !== data.operation.ack.completedAtMs ||
			identity.observedAtMs < data.operation.createdAtMs ||
			identity.observedAtMs > identity.completedAtMs ||
			identity.completedAtMs >= data.expiresAtMs ||
			identity.completedAtMs > this.#now()
		)
			fail("consumer_identity_mismatch");
		// Pin only receipt facts from this authenticated connection, never local substitutes.
		return digest([
			data.taskId,
			data.controlRef,
			data.consumerGrantId,
			data.acquisitionId,
			data.expiresAtMs,
			identity.profileId,
			identity.browserId,
			identity.tabId,
			identity.targetId,
			identity.ownerGeneration,
			identity.publishedProcessDigest,
			identity.custodyDigest,
			identity.authentication,
		]);
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
				this.#completedOperations.has(data.operation.operationId) ||
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
			const receipt = z
				.object({
					identityFreshness: z.literal("completed_operation"),
					identity: completedIdentitySchema,
					consumerAck: z.object({ identity: completedIdentitySchema }),
					operation: z.object({ ack: z.object({ identity: completedIdentitySchema }) }),
				})
				.safeParse(envelope.data);
			if (!receipt.success) fail("consumer_identity_missing");
			const identity = receipt.data.identity;
			for (const name of ["profileId", "browserId", "tabId", "targetId"] as const) {
				const alias = (envelope.data as Record<string, unknown>)[name];
				if (alias !== undefined && alias !== identity[name]) fail("consumer_identity_mismatch");
			}
			if (
				digest(identity) !== digest(receipt.data.consumerAck.identity) ||
				digest(identity) !== digest(receipt.data.operation.ack.identity) ||
				identity.observedAtMs !== observed.data.observedAtMs
			)
				fail("consumer_identity_mismatch");
			const bindingDigest = this.identityBinding(identity, data);
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
			this.#completedOperations.add(data.operation.operationId);
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
		return this.#ledger.run(
			key,
			[binding, action, params],
			bucket,
			async () => {
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
							.safeParse(data.result).success) ||
					(action === "press" &&
						!z
							.object({ pressed: z.literal(true) })
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
			},
			undefined,
			bucket === "control" ? 6 : 0,
		);
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
	/** Only snapshot refs and slider arrow input; no arbitrary selector/key or Send alias. */
	control(action: "click" | "press", ref: string, key: string) {
		if (!/^[e][1-9][0-9]*$/.test(ref) || !["click", "press"].includes(action))
			return Promise.reject(
				new FrontendError("consumer_arguments_invalid", "Use an observed native control ref."),
			);
		return this.command(
			action,
			action === "click" ? { selector: `@${ref}` } : { selector: `@${ref}`, key: "ArrowRight" },
			key,
			"control",
		);
	}
	private async metadata(tool: "browser_continue" | "browser_close", key: string, release = false) {
		const b = this.binding,
			controlRef = this.#controlRef,
			acquisitionId = this.#acquisitionId;
		if (!controlRef || !acquisitionId) return fail("consumer_acquisition_required");
		try {
			const envelope = await this.payload(tool, { taskId: b.taskId, operationKey: key });
			const d = z
				.object({
					contractVersion: z.literal(version),
					taskId: z.literal(b.taskId),
					controlRef: z.literal(controlRef),
					acquisitionId: z.literal(acquisitionId),
					consumerGrantId: z.literal(this.#admission.consumerGrantId),
					expiresAtMs: z.literal(this.#expires ?? this.#admission.expiresAtMs),
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
				("targetObservation" in envelope.data ||
					"result" in envelope.data ||
					"consumerAck" in envelope.data)
			)
				fail("consumer_readback_required");
			const receipt = z
				.object({
					identityFreshness: z.enum(["stored_completion", "unavailable"]),
					identity: completedIdentitySchema.nullable(),
				})
				.parse(envelope.data);
			if (receipt.identityFreshness === "stored_completion") {
				const stored = z
					.object({
						operation: operationSchema.extend({
							ack: ackSchema.extend({ identity: completedIdentitySchema }),
						}),
					})
					.parse(envelope.data);
				if (
					!receipt.identity ||
					digest(receipt.identity) !== digest(stored.operation.ack.identity) ||
					this.identityBinding(receipt.identity, { ...d, operation: stored.operation }) !==
						this.#bindingDigest
				)
					fail("consumer_readback_required");
			} else {
				const unavailable = z
					.object({
						operation: z.object({
							ack: z.object({ identity: z.unknown().optional() }).nullable().optional(),
						}),
					})
					.parse(envelope.data);
				if (receipt.identity !== null || unavailable.operation.ack?.identity != null)
					fail("consumer_readback_required");
			}
			if (
				release &&
				(d.state !== "released" ||
					(envelope.data as Record<string, unknown>).browserDisposition !== "retained")
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
				identityFreshness: receipt.identityFreshness,
				browserDisposition:
					(envelope.data as Record<string, unknown>).browserDisposition === "retained"
						? "retained"
						: undefined,
			};
			return { value: metadata, metadata };
		} catch {
			return fail("consumer_readback_required");
		}
	}
	/** Metadata for the ORIGINAL key only; never returns page text or clears a hold. */
	async originalReadback(key: string): Promise<Record<string, unknown>> {
		if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) return fail("consumer_operation_key_invalid");
		if (this.#releaseKey !== null && this.#releaseKey !== key)
			return fail("consumer_readback_required");
		this.#held = true;
		return this.#ledger.run(
			`${this.#releaseKey === null ? "metadata" : "release_metadata"}_${digest(key)}`,
			[this.binding, key],
			"read",
			() => this.metadata("browser_continue", key),
			this.#releaseKey === null ? key : [key, "consumer_reference_release"],
		);
	}
	/** Explicit consumer-ref release only. Stored operation metadata is not a close ACK. */
	async release(originalKey: string): Promise<Record<string, unknown>> {
		if (!/^[a-zA-Z0-9_-]{8,128}$/.test(originalKey)) return fail("consumer_operation_key_invalid");
		if (this.#releaseKey !== null) return fail("consumer_readback_required");
		const binding = this.binding;
		this.#held = true;
		this.#releaseKey = originalKey;
		return this.#ledger.run(
			"consumer_reference_release",
			[binding, originalKey, "release"],
			"control",
			() => this.metadata("browser_close", originalKey, true),
			originalKey,
			1,
		);
	}
}
