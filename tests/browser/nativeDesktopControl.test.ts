import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";
import { NativeDesktopControl } from "../../src/browser/service/nativeDesktopControl.js";
import type { NativeDesktopBrowser } from "../../src/browser/service/nativeDesktopStore.js";

test("native takeover admits one human, blocks automation, and resumes only after exact grant revocation", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-native-control-"));
	const gateDirectory = path.join(directory, "gates");
	const events: string[] = [];
	let failRevocation = true;
	let terminal = false;
  let failIssuance = false;
  let inactive = false;
	const routeId = randomUUID();
	const target = {
		assignmentId: "assignment",
		registrationId: "registration",
		desktopId: "desktop",
		lifecycleGeneration: 1,
		viewingDesktopId: "viewer",
		viewingGeneration: 2,
	};
	const server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(Buffer.from(chunk));
		const { application, request } = JSON.parse(Buffer.concat(chunks).toString());
		expect(application).toBe("auracall");
		events.push(request.operation);
		res.setHeader("Content-Type", "application/json");
		if (request.operation === "observe_assignment")
			res.end(JSON.stringify({ schemaVersion: 1, readinessScope: "live_resource", target }));
		else if (request.operation === "issue_view") {
			expect(request.capability).toBe("control");
      if (failIssuance) { res.statusCode = 503; res.end("{}"); return; }
			if (terminal) {
				res.statusCode = 400;
				res.end(JSON.stringify({ code: "consumer_grant_unavailable", retryable: false }));
				return;
			}
			const now = Date.now();
			res.end(
				JSON.stringify({
					schemaVersion: 1,
					readinessScope: "live_resource",
					path: `/embed/${routeId}`,
					grant: {
						routeId,
						revoked: false,
						issuedAt: now,
						expiresAt: now + 300000,
						request: {
							application,
							target,
							capability: request.capability,
							audience: request.audience,
						},
					},
				}),
			);
    } else if (request.operation === 'revoke_inactive_view') {
      expect(request.idle_seconds).toBe(120);
      expect(request.route_id).toBe(routeId);
      if (inactive) terminal = true;
      res.end(JSON.stringify({ schemaVersion: 1, routeId, state: inactive ? 'revoked' : 'active' }));
		} else {
			expect(request).toEqual({
				operation: "revoke_view",
				route_id: routeId,
				audience: "https://aura.test",
			});
			if (failRevocation) {
				res.statusCode = 503;
				res.end("{}");
			} else res.end(JSON.stringify({ schemaVersion: 1, routeId, state: "revoked" }));
		}
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("fixture port");
		const selected = {
			desktopName: "research",
			origin: `http://127.0.0.1:${address.port}`,
			application: "auracall",
			poolName: "main",
			publicOrigin: "https://remote.test",
			appOrigin: "https://aura.test",
		};
		const browser: NativeDesktopBrowser = {
			...selected,
			assignment: {
				assignmentId: "assignment",
				desktopId: "desktop",
				generation: 1,
				viewingGeneration: 2,
			},
			browserId: "browser",
			managedProfileDir: "/fixture",
			pid: 1,
			bootId: "boot",
			processStart: "start",
			executable: "/chrome",
			display: ":1",
			cdpHost: "127.0.0.1",
			cdpPort: 9222,
		};
		const control = new NativeDesktopControl({
			directory: path.join(directory, "claims"),
			gateDirectory,
			ready: async () => [browser],
		});
		const gate = new DesktopControlGate("desktop", gateDirectory);
		let settle: (() => void) | undefined;
		let started: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			settle = resolve;
		});
		const admitted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const command = gate.withAutomation("fixture", async () => {
			started?.();
			await pending;
		});
		await admitted;
		await expect(control.take(selected, "browser", randomUUID())).rejects.toMatchObject({ message: expect.stringContaining('busy'), claimRetained: false });
		expect(events).toEqual([]);
		settle?.();
		await command;
		const token = randomUUID();
		expect(await control.take(selected, "browser", token)).toEqual({
			capability: "control",
      inactivityTimeoutSeconds: 120,
			token,
			url: `https://remote.test/embed/${routeId}`,
		});
		await expect(
			gate.withAutomation("fixture", async () => events.push("automation")),
		).rejects.toThrow("paused");
		const persisted = await fs.readFile(
			path.join(
				directory,
				"claims",
				(await fs.readdir(path.join(directory, "claims")))[0] as string,
			),
			"utf8",
		);
		expect(persisted).not.toContain("https://");
		const effects = events.length;
		await expect(control.take(selected, "browser", randomUUID())).rejects.toMatchObject({ message: expect.stringContaining('already held'), claimRetained: false });
		await expect(control.release(selected, "browser", randomUUID())).rejects.toThrow("stale");
		expect(events).toHaveLength(effects);
		await expect(control.release(selected, "browser", token)).rejects.toThrow("unavailable");
		await expect(
			gate.withAutomation("fixture", async () => events.push("automation")),
		).rejects.toThrow("paused");
		failRevocation = false;
		await control.release(selected, "browser", token);
		await gate.withAutomation("fixture", async () => {
			events.push("automation");
		});
		expect(events.slice(-2)).toEqual(["revoke_view", "automation"]);
		const files = await fs.readdir(path.join(directory, "claims"));
		expect(files).toEqual([]);
		const secondToken = randomUUID();
		await control.take(selected, "browser", secondToken);
		failRevocation = true;
		terminal = true;
		// Expiry/acknowledged-lost revoke is qualified by exact idempotent issuance,
		// never by a clock timeout or generic access-denied response.
		const restarted = new NativeDesktopControl({
			directory: path.join(directory, "claims"),
			gateDirectory,
			ready: async () => [browser],
		});
		await restarted.release(selected, "browser", secondToken);
		await gate.withAutomation("fixture", async () => {
			events.push("resumed-after-terminal-proof");
		});
		expect(events.slice(-3)).toEqual([
			"observe_assignment",
			"issue_view",
			"resumed-after-terminal-proof",
		]);
    terminal = false; failIssuance = true;
    const uncertainToken = randomUUID();
    await expect(control.take(selected, 'browser', uncertainToken)).rejects.toMatchObject({ claimRetained: true });
    await expect(gate.withAutomation('fixture', async () => {})).rejects.toThrow('paused');
    failIssuance = false; terminal = true;
    await control.release(selected, 'browser', uncertainToken);
    terminal = false; failRevocation = false;
    const idleToken = randomUUID();
    await control.take(selected, 'browser', idleToken);
    await control.expireInactive(selected);
    await expect(gate.withAutomation('fixture', async () => {})).rejects.toThrow('paused');
    expect(await control.status(selected, 'browser', idleToken)).toEqual({state: 'held'});
    inactive = true;
    await restarted.expireInactive(selected);
    expect(await control.status(selected, 'browser', idleToken)).toEqual({state: 'released'});
    await gate.withAutomation('fixture', async () => events.push('resumed-after-input-inactivity'));
    const afterIdle = events.length;
    await control.release(selected, 'browser', idleToken);
    expect(events).toHaveLength(afterIdle);
    await expect(control.status(selected, 'browser', randomUUID())).rejects.toThrow('unknown');

	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		await fs.rm(directory, { recursive: true, force: true });
	}
});
