import type { IncomingMessage } from "node:http";
import {
	createRemoteJWKSet,
	customFetch,
	type JWTPayload,
	type JWTVerifyGetKey,
	jwtVerify,
} from "jose";
import type { ValidatedFrontendHttpConfig } from "./config.js";

export const frontendScopes = ["frontend:read", "frontend:send", "frontend:configure"] as const;
export type FrontendScope = (typeof frontendScopes)[number];
export interface FrontendPrincipal {
	scopes: ReadonlySet<string>;
}

export class HttpRefusal extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly scope?: FrontendScope,
	) {
		super(code);
	}
}

export function createFrontendTokenVerifier(
	config: ValidatedFrontendHttpConfig,
	injectedResolver?: JWTVerifyGetKey,
): (req: IncomingMessage) => Promise<FrontendPrincipal> {
	const key =
		injectedResolver ??
		createRemoteJWKSet(new URL(config.jwksUri), {
			timeoutDuration: 5000,
			cooldownDuration: 30000,
			cacheMaxAge: 300000,
			[customFetch]: (url, options) => fetch(url, { ...options, redirect: "error" }),
		});
	return async (req) => {
		const count = req.rawHeaders.filter(
			(_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === "authorization",
		).length;
		const header = req.headers.authorization;
		const match =
			typeof header === "string" && header.length <= 8192
				? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header)
				: null;
		if (count !== 1 || !match) throw new HttpRefusal(401, "invalid_token");
		let payload: JWTPayload;
		try {
			({ payload } = await jwtVerify(match[1], key, {
				algorithms: ["RS256", "ES256"],
				typ: "at+jwt",
				issuer: config.issuer,
				audience: config.resource,
				requiredClaims: ["exp", "sub"],
				clockTolerance: 5,
			}));
			const exactAudience =
				payload.aud === config.resource ||
				(Array.isArray(payload.aud) &&
					payload.aud.length === 1 &&
					payload.aud[0] === config.resource);
			if (!exactAudience || typeof payload.sub !== "string" || !payload.sub)
				throw new Error("Invalid claims");
		} catch {
			throw new HttpRefusal(401, "invalid_token");
		}
		if (payload.sub !== config.subject) throw new HttpRefusal(403, "access_denied");
		const scope = typeof payload.scope === "string" ? payload.scope : "";
		if (scope.length > 4096) throw new HttpRefusal(401, "invalid_token");
		const scopes = new Set<string>(scope.split(/\s+/).filter(Boolean));
		if (!frontendScopes.some((item) => scopes.has(item)))
			throw new HttpRefusal(403, "insufficient_scope", "frontend:read");
		// Only grants leave this module. The bearer token and claims never enter an adapter.
		return { scopes };
	};
}
