import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";

const httpsUrl = z
	.string()
	.max(2048)
	.refine((value) => {
		try {
			const url = new URL(value);
			return (
				url.protocol === "https:" &&
				!url.username &&
				!url.password &&
				!url.search &&
				!url.hash &&
				(url.href === value || (url.pathname === "/" && url.href === `${value}/`))
			);
		} catch {
			return false;
		}
	}, "Use an exact canonical HTTPS URL without credentials, query or fragment.");

const schema = z
	.object({
		resource: httpsUrl,
		issuer: httpsUrl,
		jwksUri: httpsUrl,
		subject: z.string().min(1).max(256),
		routeIds: z
			.array(z.string().min(1).max(128))
			.min(1)
			.max(32)
			.refine((ids) => new Set(ids).size === ids.length, "Route IDs must be unique."),
		origins: z
			.array(
				z
					.string()
					.max(2048)
					.refine((value) => {
						try {
							return new URL(value).protocol === "https:" && new URL(value).origin === value;
						} catch {
							return false;
						}
					}),
			)
			.max(8)
			.default([]),
		port: z.number().int().min(1).max(65535).default(3100),
	})
	.strict();

export type FrontendHttpConfig = z.input<typeof schema>;
export type ValidatedFrontendHttpConfig = z.output<typeof schema>;

export function validateFrontendHttpConfig(value: unknown): ValidatedFrontendHttpConfig {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new Error("Invalid OAuth frontend MCP configuration.");
	return parsed.data;
}

/** Explicit opt-in only. No issuer discovery, browser access or global config writes. */
export async function readFrontendHttpConfig(
	env: NodeJS.ProcessEnv = process.env,
): Promise<ValidatedFrontendHttpConfig> {
	const path = env.AURACALL_FRONTEND_OAUTH_CONFIG;
	if (!path) throw new Error("Set AURACALL_FRONTEND_OAUTH_CONFIG to a private configuration file.");
	try {
		const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const info = await fd.stat();
			if (!info.isFile() || info.size > 16384 || (info.mode & 0o077) !== 0)
				throw new Error("OAuth frontend configuration must be a private bounded file.");
			const data = await fd.readFile();
			if (data.byteLength > 16384) throw new Error("OAuth frontend configuration is too large.");
			return validateFrontendHttpConfig(JSON.parse(data.toString("utf8")));
		} finally {
			await fd.close();
		}
	} catch {
		throw new Error("Cannot load the private OAuth frontend MCP configuration.");
	}
}
