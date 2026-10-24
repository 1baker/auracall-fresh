import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { RelayStore } from "../src/mcp/relay/store.js";

const configEnv = "AURACALL_RELAY_OAUTH_CONFIG";

describe("explicit local relay producer and readback command", () => {
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
