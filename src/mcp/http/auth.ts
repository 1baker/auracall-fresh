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
export const relayScopes = ["relay:read", "relay:dispatch", "relay:reply"] as const;
export type FrontendScope = (typeof frontendScopes)[number];
export type RelayScope = (typeof relayScopes)[number];
export type OAuthScope = FrontendScope | RelayScope;
export interface FrontendPrincipal {
	scopes: ReadonlySet<string>;
}

export class HttpRefusal extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly scope?: OAuthScope,
	) {
		super(code);
	}
}

function grantedScopes(payload: JWTPayload): Set<string> {
	const scopeToken = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
	let scopes: Set<string> | undefined;
	if (payload.scope !== undefined) {
		if (typeof payload.scope !== "string" || payload.scope.length > 4096)
			throw new HttpRefusal(401, "invalid_token");
		const listed = payload.scope.split(" ").filter(Boolean);
		if (listed.some((item) => !scopeToken.test(item))) throw new HttpRefusal(401, "invalid_token");
		scopes = new Set(listed);
	}
	if (payload.scp !== undefined) {
		if (
			!Array.isArray(payload.scp) ||
			payload.scp.length > 128 ||
			payload.scp.some((item) => typeof item !== "string" || !scopeToken.test(item)) ||
			payload.scp.join(" ").length > 4096
		)
			throw new HttpRefusal(401, "invalid_token");
		const listed = new Set<string>(payload.scp);
		if (scopes && (scopes.size !== listed.size || [...scopes].some((item) => !listed.has(item))))
			throw new HttpRefusal(401, "invalid_token");
		scopes ??= listed;
	}
	return scopes ?? new Set();
}

export function createFrontendTokenVerifier(
	config: ValidatedFrontendHttpConfig,
	injectedResolver?: JWTVerifyGetKey,
	acceptedScopes: readonly OAuthScope[] = frontendScopes,
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
		const scopes = grantedScopes(payload);
		if (!acceptedScopes.some((item) => scopes.has(item)))
			throw new HttpRefusal(403, "insufficient_scope", acceptedScopes[0]);
		// Only grants leave this module. The bearer token and claims never enter an adapter.
		return { scopes };
	};
}
