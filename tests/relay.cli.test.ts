import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { RelayStore } from "../src/mcp/relay/store.js";

const configEnv = "AURACALL_RELAY_OAUTH_CONFIG";
const frontendEnv = "AURACALL_FRONTEND_CONFIG",
	homeEnv = "AURACALL_HOME_DIR";

describe("explicit local relay producer and readback command", () => {
	it("requires an explicit retained frontend route before automatic dispatch can claim", async () => {
		const repo = dirname(dirname(fileURLToPath(import.meta.url)));
		const root = await mkdtemp(join(tmpdir(), "auracall-dispatch-cli-"));
		const cache = join(repo, "node_modules/.cache");
		await mkdir(cache, { recursive: true });
		const out = await mkdtemp(join(cache, "dispatch-cli-"));
		try {
			const entry = join(out, "relay.mjs");
			await build({
				entryPoints: [join(repo, "bin/auracall-relay.ts")],
				outfile: entry,
				bundle: true,
				platform: "node",
				format: "esm",
				target: "node22",
				banner: {
					js: 'import {createRequire as __createRequire} from "node:module"; const require=__createRequire(import.meta.url);',
				},
			});
			const config = join(root, "oauth.json");
			await writeFile(
				config,
				JSON.stringify({
					mode: "relay",
					resource: "https://relay.example.test/mcp",
					issuer: "https://issuer.example.test",
					jwksUri: "https://issuer.example.test/jwks",
					subject: "fixture-owner",
					relayDirectory: join(root, "jobs"),
				}),
				{ mode: 0o600 },
			);
			const store = new RelayStore(join(root, "jobs"), "fixture-owner");
			await store.enqueue({ requestId: "cli_dispatch_01", prompt: "Use only a bound frontend" });
			await expect(
				promisify(execFile)(
					process.execPath,
					[entry, "dispatch", "cli_dispatch_01", "missing-route"],
					{
						env: {
							...process.env,
							[configEnv]: config,
							[frontendEnv]: "",
							[homeEnv]: root,
						},
						timeout: 10000,
					},
				),
			).rejects.toMatchObject({ stderr: "relay_sender_route_missing\n" });
			expect(await store.status("cli_dispatch_01")).toMatchObject({
				state: "ready",
				claimId: null,
			});
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(out, { recursive: true, force: true });
		}
	});
	it("stages once and reads the full saved answer in a fresh real process", async () => {
		const repo = dirname(dirname(fileURLToPath(import.meta.url)));
		const root = await mkdtemp(join(tmpdir(), "auracall-relay-cli-"));
		const cache = join(repo, "node_modules/.cache");
		await mkdir(cache, { recursive: true });
		const out = await mkdtemp(join(cache, "relay-cli-"));
		try {
			const entry = join(out, "relay.mjs");
			await build({
				entryPoints: [join(repo, "bin/auracall-relay.ts")],
				outfile: entry,
				bundle: true,
				platform: "node",
				format: "esm",
				target: "node22",
				banner: {
					js: 'import {createRequire as __createRequire} from "node:module"; const require=__createRequire(import.meta.url);',
				},
			});
			const config = join(root, "oauth.json"),
				input = join(root, "request.json"),
				storeDir = join(root, "jobs");
			await writeFile(
				config,
				JSON.stringify({
					mode: "relay",
					resource: "https://relay.example.test/mcp",
					issuer: "https://issuer.example.test",
					jwksUri: "https://issuer.example.test/jwks",
					subject: "fixture-owner",
					relayDirectory: storeDir,
				}),
				{ mode: 0o600 },
			);
			await writeFile(
				input,
				JSON.stringify({ requestId: "cli_request_01", prompt: "Keep the exact request" }),
				{ mode: 0o600 },
			);
			const run = async (...args: string[]) =>
				JSON.parse(
					(
						await promisify(execFile)(process.execPath, [entry, ...args], {
							env: { ...process.env, [configEnv]: config },
							timeout: 10000,
							maxBuffer: 2097152,
						})
					).stdout,
				);
			const job = await run("enqueue", input);
			expect(await run("enqueue", input)).toEqual(job);
			const store = new RelayStore(storeDir, "fixture-owner"),
				claim = await store.claim(job.requestId, job.fingerprint);
			const text = `${"Persist every line λ\n".repeat(1800)}LAST LINE`;
			await store.submit(job.requestId, claim.claimId, text);
			expect(await run("status", job.requestId)).toMatchObject({
				state: "replied",
				reply: { text, liveVerified: false, providerResponseId: null },
			});
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(out, { recursive: true, force: true });
		}
	});
});
