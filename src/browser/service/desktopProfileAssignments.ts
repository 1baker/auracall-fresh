import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuracallHomeDir } from "../../auracallHome.js";
import {
	getCurrentRuntimeProfiles,
	getRuntimeProfileBrowserProfileId,
	getBrowserProfile,
} from "../../config/model.js";
import type { OracleConfig } from "../../schema/types.js";
import { NativeDesktopStore } from "./nativeDesktopStore.js";

const schema = z.object({
	version: z.literal(1),
	bindings: z.record(
		z.string(),
		z.object({
			browserProfileId: z.string().nullable(),
			provider: z.enum(["chatgpt", "gemini", "grok"]),
			desktopName: z.string().min(1),
		}),
	),
});
type Assignment = z.infer<typeof schema>["bindings"][string];
function file(): string {
	return path.join(getAuracallHomeDir(), "desktop-profile-assignments.json");
}
async function read() {
	try {
		return schema.parse(JSON.parse(await fs.readFile(file(), "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return { version: 1 as const, bindings: Object.create(null) as Record<string, Assignment> };
		throw error;
	}
}
/** Remembered Wake placement is configuration, never process-name or account inference. */
export async function applyDesktopProfileAssignments<
	T extends OracleConfig | Record<string, unknown>,
>(config: T): Promise<T> {
	const saved = await read();
	const profiles = getCurrentRuntimeProfiles(config);
	const valid = Object.entries(saved.bindings).filter(([id, binding]) => {
		const origin = Object.hasOwn(profiles, id) ? profiles[id] : undefined;
		return (
			origin &&
			getRuntimeProfileBrowserProfileId(origin) === binding.browserProfileId &&
			origin.defaultService === binding.provider
		);
	});
	for (const [id, profile] of Object.entries(profiles)) {
		const familyId = getRuntimeProfileBrowserProfileId(profile);
		const candidates = valid.filter(
			([origin, binding]) =>
				binding.provider === profile.defaultService &&
				(familyId === null ? origin === id : binding.browserProfileId === familyId),
		);
		if (!candidates.length) continue;
		const family = getBrowserProfile(config, familyId);
		const browser = profile.browser as Record<string, unknown> | undefined;
		// Explicit operator config wins over remembered placement.
		if (family?.desktop !== undefined || browser?.desktop !== undefined) continue;
		const placements = new Set(candidates.map(([, binding]) => binding.desktopName));
		if (placements.size !== 1)
			throw new Error("Shared browser family has conflicting remembered desktop placements.");
		const binding = candidates[0]?.[1];
		if (!binding) continue;
		const desktops = (config.remoteView as { desktops?: Record<string, unknown> } | undefined)
			?.desktops;
		if (!desktops || !Object.hasOwn(desktops, binding.desktopName)) continue;
		profile.browser = { ...browser, desktop: binding.desktopName };
	}
	return config;
}
export async function rememberDesktopProfileAssignment(
	id: string,
	binding: Assignment,
): Promise<void> {
	await new NativeDesktopStore().exclusive("desktop-profile-config", async () => {
		const saved = await read();
		const bindings = Object.assign(Object.create(null), saved.bindings);
		bindings[id] = binding;
		const parsed = schema.parse({ version: 1, bindings });
		const target = file(),
			temp = `${target}.${randomUUID()}.tmp`;
		await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
		try {
			await fs.writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, flag: "wx" });
			await fs.rename(temp, target);
		} finally {
			await fs.rm(temp, { force: true });
		}
	});
}
