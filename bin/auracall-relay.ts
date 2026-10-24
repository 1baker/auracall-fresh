#!/usr/bin/env node
/** Explicit local producer/readback or relay-only HTTP process. No browser startup. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { readFrontendHttpConfig } from "../src/mcp/http/config.js";
import { RelayError, relayRequestSchema, RelayStore } from "../src/mcp/relay/store.js";

try {
	const [command, value, extra] = process.argv.slice(2);
	if (extra || !["serve", "enqueue", "status"].includes(command ?? "") || (command === "serve" ? value !== undefined : !value))
		throw new RelayError("usage: auracall-relay serve | enqueue PRIVATE_REQUEST_JSON | status REQUEST_ID");
	const path = process.env.AURACALL_RELAY_OAUTH_CONFIG;
	if (!path) throw new RelayError("set_AURACALL_RELAY_OAUTH_CONFIG");
	const env = { ...process.env, AURACALL_FRONTEND_OAUTH_CONFIG: path };
	const config = await readFrontendHttpConfig(env);
	if (config.mode !== "relay" || !config.relayDirectory) throw new RelayError("relay_mode_required");
	if (command === "serve") {
		const { startFrontendHttpServer } = await import("../src/mcp/http/server.js");
		await startFrontendHttpServer(env);
		process.stderr.write(`AuraCall relay listening on loopback port ${config.port}.\n`);
	} else {
		const store = new RelayStore(config.relayDirectory, config.subject);
		if (command === "enqueue") {
			const fd = await open(value, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			let data: unknown;
			try {
				const info = await fd.stat();
				if (!info.isFile() || info.size > 2097152 || (info.mode & 0o077) || info.uid !== process.getuid?.()) throw new RelayError("private_request_file_required");
				const bytes = await fd.readFile();
				if (bytes.length > 2097152) throw new RelayError("request_too_large");
				data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
			} finally { await fd.close(); }
			const parsed = relayRequestSchema.safeParse(data);
			if (!parsed.success) throw new RelayError("invalid_or_unsupported_relay_request");
			process.stdout.write(`${JSON.stringify(await store.enqueue(parsed.data))}\n`);
		} else process.stdout.write(`${JSON.stringify(await store.status(value))}\n`);
	}
} catch (error) {
	process.stderr.write(`${error instanceof RelayError ? error.code : "relay_failed_check_private_configuration_and_original_request"}\n`);
	process.exitCode = 1;
}
