import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

const identity = z.string().min(1);
const generation = z.number().int().positive();
const inventorySchema = z.object({
	schemaVersion: z.literal(1),
	registration: z.object({ consumerKey: identity, registrationId: identity }),
	pools: z.array(
		z.object({
			poolId: identity,
			registrationId: identity,
			name: identity,
			desktopMembers: z.array(identity),
		}),
	),
	assignments: z.array(
		z.object({
			assignmentId: identity,
			desktopId: identity,
			generation,
			poolId: identity,
			registrationId: identity,
			state: z.string(),
		}),
	),
	desktops: z.array(
		z.object({
			desktopId: identity,
			lifecycle: z
				.object({
					generation,
					state: z.string(),
					readinessScope: z.string(),
					allocated: z.boolean(),
				})
				.optional(),
			viewing: z
				.object({
					lifecycleGeneration: generation,
					generation,
					desktopId: identity,
					publicRoute: identity,
				})
				.optional(),
		}),
	),
});

const viewTargetSchema = z.object({
	assignmentId: identity,
	registrationId: identity,
	desktopId: identity,
	lifecycleGeneration: generation,
	viewingDesktopId: identity,
	viewingGeneration: generation,
});
function httpsOrigin(value: string): string {
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error("Remote View presentation requires a configured HTTPS origin.");
	}
	return url.origin;
}

export interface RemoteViewAssignment {
	assignmentId: string;
	desktopId: string;
	generation: number;
	viewingGeneration: number;
}

export class RemoteViewProviderError extends Error {
	constructor(readonly code: string) {
		super("Remote View application operation unavailable.");
	}
}

/** The native provider owns desktop presentation; this client owns no pixel/input protocol. */
export class RemoteViewApplication {
	private readonly endpoint: URL;
	private readonly application: string;

	constructor(config: { origin: string; application: string }) {
		let origin: URL;
		try {
			origin = new URL(config.origin);
		} catch {
			throw new Error("Remote View requires a loopback HTTP origin.");
		}
		const host = origin.hostname.replace(/^\[|\]$/g, "");
		const loopback = (isIP(host) === 4 && host.split(".")[0] === "127") || host === "::1";
		if (
			origin.protocol !== "http:" ||
			!loopback ||
			origin.username ||
			origin.password ||
			origin.pathname !== "/" ||
			origin.search ||
			origin.hash ||
			origin.port === "0"
		) {
			throw new Error("Remote View requires a loopback HTTP origin.");
		}
		this.endpoint = new URL("/v1/consumer", origin);
		this.application = identity.parse(config.application);
	}

	private async request(request: Record<string, unknown>): Promise<unknown> {
		const response = await fetch(this.endpoint, {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(15_000),
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ application: this.application, request }),
		});
		if (response.headers.get("content-type")?.split(";")[0] !== "application/json") {
			throw new Error("Remote View application inventory unavailable.");
		}
		const reader = response.body?.getReader();
		if (!reader) throw new Error("Remote View application inventory unavailable.");
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		try {
			for (;;) {
				const part = await reader.read();
				if (part.done) break;
				bytes += part.value.byteLength;
				if (bytes > 4 * 1024 * 1024)
					throw new Error("Remote View inventory exceeds response limit.");
				chunks.push(part.value);
			}
		} catch (error) {
			await reader.cancel();
			throw error;
		}
		const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (!response.ok) {
			const failure = z.object({ code: z.string(), retryable: z.boolean() }).safeParse(data);
			if (failure.success && !failure.data.retryable)
				throw new RemoteViewProviderError(failure.data.code);
			throw new Error("Remote View application operation unavailable.");
		}
		return data;
	}

	async listReadyAssignments(poolName: string): Promise<RemoteViewAssignment[]> {
		const parsed = inventorySchema.safeParse(await this.request({ operation: "inventory" }));
		if (!parsed.success)
			throw new Error("Remote View application inventory has an invalid contract.");
		const inventory = parsed.data;
		if (inventory.registration.consumerKey !== this.application)
			throw new Error("Remote View application identity mismatch.");
		const registrationId = inventory.registration.registrationId;
		const pools = inventory.pools.filter(
			(pool) => pool.name === poolName && pool.registrationId === registrationId,
		);
		if (pools.length !== 1 || !pools[0])
			throw new Error("Remote View configured pool is missing or ambiguous.");
		const pool = pools[0];
		const result: RemoteViewAssignment[] = [];
		for (const assignment of inventory.assignments) {
			if (
				assignment.state !== "active" ||
				assignment.registrationId !== registrationId ||
				assignment.poolId !== pool.poolId ||
				!pool.desktopMembers.includes(assignment.desktopId)
			)
				continue;
			const desktops = inventory.desktops.filter(
				(desktop) => desktop.desktopId === assignment.desktopId,
			);
			if (desktops.length !== 1 || !desktops[0])
				throw new Error("Remote View desktop identity is missing or ambiguous.");
			const { lifecycle, viewing } = desktops[0];
			if (
				!lifecycle ||
				!viewing ||
				lifecycle.state !== "ready" ||
				!lifecycle.allocated ||
				lifecycle.readinessScope !== "live_resource" ||
				lifecycle.generation !== assignment.generation ||
				viewing.lifecycleGeneration !== assignment.generation
			)
				continue;
			if (
				result.some(
					(item) =>
						item.desktopId === assignment.desktopId ||
						item.assignmentId === assignment.assignmentId,
				)
			) {
				throw new Error("Remote View assignment identity is ambiguous.");
			}
			result.push({
				assignmentId: assignment.assignmentId,
				desktopId: assignment.desktopId,
				generation: assignment.generation,
				viewingGeneration: viewing.generation,
			});
		}
		return result;
	}

	async acquire(
		poolName: string,
		idempotencyKey: string,
		sessionLabel: string,
	): Promise<RemoteViewAssignment> {
		const acquired = z
			.object({
				assignmentId: identity,
				desktopId: identity,
				generation,
				state: z.literal("active"),
			})
			.parse(
				await this.request({
					operation: "acquire",
					pool_name: poolName,
					idempotency_key: idempotencyKey,
					presentation: { sessionLabel },
				}),
			);
		const ready = (await this.listReadyAssignments(poolName)).filter(
			(item) =>
				item.assignmentId === acquired.assignmentId &&
				item.desktopId === acquired.desktopId &&
				item.generation === acquired.generation,
		);
		if (ready.length !== 1 || !ready[0])
			throw new Error(
				"Remote View acquired assignment is not ready in the configured application pool.",
			);
		return ready[0];
	}

	async launchEnvironment(assignment: RemoteViewAssignment): Promise<Record<string, string>> {
		const response = z
			.object({
				schemaVersion: z.literal(1),
				readinessScope: z.literal("live_resource"),
				target: viewTargetSchema,
				environment: z.record(z.string(), z.string()),
			})
			.parse(
				await this.request({
					operation: "launch_environment",
					assignment_id: assignment.assignmentId,
					expected_generation: assignment.generation,
					expected_viewing_generation: assignment.viewingGeneration,
				}),
			);
		const target = response.target;
		const environment = response.environment;
		if (
			target.assignmentId !== assignment.assignmentId ||
			target.desktopId !== assignment.desktopId ||
			target.lifecycleGeneration !== assignment.generation ||
			target.viewingGeneration !== assignment.viewingGeneration ||
			!/^:[0-9]+(?:\.[0-9]+)?$/.test(environment.DISPLAY ?? "") ||
			!environment.XAUTHORITY?.startsWith("/") ||
			environment.REMOTE_VIEW_SLOT_GENERATION !== String(assignment.viewingGeneration)
		) {
			throw new Error("Remote View launch environment generation or assignment mismatch.");
		}
		const allowed = new Set([
			"DISPLAY",
			"XAUTHORITY",
			"REMOTE_VIEW_SLOT_GENERATION",
			"WAYLAND_DISPLAY",
			"GDK_BACKEND",
			"QT_QPA_PLATFORM",
			"SDL_VIDEODRIVER",
			"DBUS_SESSION_BUS_ADDRESS",
			"PULSE_SERVER",
		]);
		if (Object.keys(environment).some((key) => !allowed.has(key)))
			throw new Error("Remote View launch environment contains unsupported variables.");
		return environment;
	}

	async issueObserveEmbed(
		assignment: RemoteViewAssignment,
		origins: { publicOrigin: string; appOrigin: string },
	): Promise<string> {
		return (await this.issueEmbed(assignment, origins, "observe", randomUUID())).url;
	}

	async issueEmbed(
		assignment: RemoteViewAssignment,
		origins: { publicOrigin: string; appOrigin: string },
		capability: "observe" | "control",
		idempotencyKey: string,
	): Promise<{ url: string; routeId: string; expiresAt: number }> {
		const publicOrigin = httpsOrigin(origins.publicOrigin);
		const appOrigin = httpsOrigin(origins.appOrigin);
		const observed = z
			.object({
				schemaVersion: z.literal(1),
				readinessScope: z.literal("live_resource"),
				target: viewTargetSchema,
			})
			.parse(
				await this.request({
					operation: "observe_assignment",
					assignment_id: assignment.assignmentId,
					expected_generation: assignment.generation,
				}),
			);
		const target = observed.target;
		if (
			target.assignmentId !== assignment.assignmentId ||
			target.desktopId !== assignment.desktopId ||
			target.lifecycleGeneration !== assignment.generation ||
			target.viewingGeneration !== assignment.viewingGeneration
		) {
			throw new Error("Remote View assignment generation changed before presentation.");
		}
		const issued = z
			.object({
				schemaVersion: z.literal(1),
				readinessScope: z.literal("live_resource"),
				path: identity,
				grant: z.object({
					routeId: identity,
					revoked: z.literal(false),
					issuedAt: generation,
					expiresAt: generation,
					request: z.object({
						application: identity,
						audience: identity,
						capability: z.enum(["observe", "control"]),
						target: viewTargetSchema,
					}),
				}),
			})
			.parse(
				await this.request({
					operation: "issue_view",
					assignment_id: assignment.assignmentId,
					expected_generation: assignment.generation,
					expected_viewing_generation: assignment.viewingGeneration,
					audience: appOrigin,
					capability,
					lifetime_seconds: 300,
					idempotency_key: idempotencyKey,
				}),
			);
		const now = Date.now();
		if (
			issued.grant.expiresAt <= now ||
			issued.grant.issuedAt > now + 30_000 ||
			issued.grant.expiresAt <= issued.grant.issuedAt ||
			issued.grant.expiresAt - issued.grant.issuedAt > 300_000 ||
			issued.grant.request.capability !== capability ||
			issued.grant.request.application !== this.application ||
			issued.grant.request.audience !== appOrigin ||
			JSON.stringify(issued.grant.request.target) !== JSON.stringify(target) ||
			issued.path !== `/embed/${issued.grant.routeId}` ||
			!/^\/embed\/[0-9a-fA-F-]{32,128}$/.test(issued.path)
		) {
			throw new Error("Remote View native embed identity mismatch.");
		}
		return {
			url: new URL(issued.path, publicOrigin).href,
			routeId: issued.grant.routeId,
			expiresAt: issued.grant.expiresAt,
		};
	}

  async hasBrowserWindow(assignment: RemoteViewAssignment, pid: number): Promise<boolean> {
    const observed = z.object({ schemaVersion: z.literal(1), operation: z.literal('desktop.windows'),
      desktopId: identity, generation, viewingGeneration: generation,
      windows: z.array(z.object({ id: z.number().int().positive(), pid: z.number().int().positive().nullable().optional() }))
    }).parse(await this.request({ operation: 'windows', assignment_id: assignment.assignmentId,
      expected_generation: assignment.generation, expected_viewing_generation: assignment.viewingGeneration }));
    if (observed.desktopId !== assignment.desktopId || observed.generation !== assignment.generation || observed.viewingGeneration !== assignment.viewingGeneration) {
      throw new Error('Remote View window ownership generation mismatch.');
    }
    return observed.windows.some(window => window.pid === pid);
  }

  async revokeInactiveEmbed(routeId: string, appOrigin: string, idleSeconds: number): Promise<'active' | 'revoked'> {
    const result = z.object({schemaVersion: z.literal(1), routeId: identity, state: z.enum(['active', 'revoked'])}).parse(
      await this.request({ operation: 'revoke_inactive_view', route_id: routeId, audience: appOrigin, idle_seconds: idleSeconds }));
    if (result.routeId !== routeId) throw new Error('Remote View returned a different grant inactivity result.');
    return result.state;
  }

	async revokeEmbed(routeId: string, appOrigin: string): Promise<void> {
		const result = z
			.object({ schemaVersion: z.literal(1), routeId: identity, state: z.literal("revoked") })
			.parse(
				await this.request({
					operation: "revoke_view",
					route_id: routeId,
					audience: httpsOrigin(appOrigin),
				}),
			);
		if (result.routeId !== routeId) throw new Error("Remote View revoked a different grant.");
	}
}
