import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAuracallHomeDir } from "../../auracallHome.js";
import type { RemoteViewDesktopConfig } from "../types.js";
import { DesktopControlGate } from "./desktopControlGate.js";
import { readyNativeDesktopBrowsers } from "./nativeDesktopClient.js";
import {
	type NativeDesktopBrowser,
	NativeDesktopStore,
	nativeBrowserGeneration,
	nativeDesktopKey,
} from "./nativeDesktopStore.js";
import { RemoteViewApplication, RemoteViewProviderError } from "./remoteViewApplication.js";

const receiptSchema = z.object({
	token: z.string().uuid(),
	browserId: z.string(),
	binding: z.string(),
	issuanceKey: z.string().uuid(),
	routeId: z.string().optional(),
	revoked: z.boolean(),
	inactivityTimeoutMs: z.number().int().positive().optional(),
});
type Receipt = z.infer<typeof receiptSchema>;

export class NativeDesktopControlError extends Error {
  constructor(message: string, readonly claimRetained: boolean) { super(message); this.name = 'NativeDesktopControlError'; }
}

/** Exact provider revocation qualifies manual or inactivity handoff. URLs stay ephemeral. */
export class NativeDesktopControl {
	constructor(
		private readonly options: {
			directory?: string;
			gateDirectory?: string;
			ready?: typeof readyNativeDesktopBrowsers;
			inactivityTimeoutMs?: number;
		} = {},
	) {}

	private directory(): string {
		return this.options.directory ?? path.join(getAuracallHomeDir(), "native-controls");
	}
	private file(selected: RemoteViewDesktopConfig): string {
		return path.join(this.directory(), `${nativeDesktopKey(selected)}.json`);
	}
	private releasedFile(selected: RemoteViewDesktopConfig, token: string): string {
    z.string().uuid().parse(token);
    return path.join(`${this.directory()}-released`, `${nativeDesktopKey(selected)}-${token}.json`);
  }
  private async wasReleased(selected: RemoteViewDesktopConfig, browserId: string, token: string): Promise<boolean> {
    try { const receipt = receiptSchema.parse(JSON.parse(await fs.readFile(this.releasedFile(selected, token), 'utf8'))); return receipt.token === token && receipt.browserId === browserId && receipt.revoked; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  private async read(selected: RemoteViewDesktopConfig): Promise<Receipt | undefined> {
		try {
			return receiptSchema.parse(JSON.parse(await fs.readFile(this.file(selected), "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}
	private async write(selected: RemoteViewDesktopConfig, receipt: Receipt): Promise<void> {
		await fs.mkdir(this.directory(), { recursive: true, mode: 0o700 });
		const temporary = path.join(this.directory(), `.${randomUUID()}.tmp`);
		try {
			await fs.writeFile(temporary, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
			await fs.rename(temporary, this.file(selected));
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
	private async browser(
		selected: RemoteViewDesktopConfig,
		browserId: string,
	): Promise<NativeDesktopBrowser> {
		const matches = (await (this.options.ready ?? readyNativeDesktopBrowsers)(selected)).filter(
			(item) => item.browserId === browserId,
		);
		if (matches.length !== 1 || !matches[0])
			throw new Error("Select a ready AuraCall-owned native browser.");
		return matches[0];
	}
	private exclusive<T>(selected: RemoteViewDesktopConfig, effect: () => Promise<T>): Promise<T> {
		return new NativeDesktopStore(this.directory()).exclusive(nativeDesktopKey(selected), effect);
	}

	async take(
		selected: RemoteViewDesktopConfig,
		browserId: string,
		token: string,
	): Promise<{ url: string; capability: "control"; token: string; inactivityTimeoutSeconds: number }> {
		z.string().uuid().parse(token);
		try { return await this.exclusive(selected, async () => {
			const browser = await this.browser(selected, browserId);
			const binding = nativeBrowserGeneration(browser);
			const gate = new DesktopControlGate(browser.assignment.desktopId, this.options.gateDirectory);
			let receipt = await this.read(selected);
			if (receipt) {
				if (
					receipt.token !== token ||
					receipt.browserId !== browserId ||
					receipt.binding !== binding ||
					receipt.revoked
				) {
					throw new Error(
						"Desktop control is already held; release the retained claim before another takeover.",
					);
				}
				await gate.assertControl(token, binding);
			} else {
				// Persist the caller's recovery identity before a control grant can exist.
				receipt = { token, browserId, binding, issuanceKey: randomUUID(), revoked: false, inactivityTimeoutMs: this.options.inactivityTimeoutMs ?? 120_000 };
				await this.write(selected, receipt);
				try {
					await gate.takeControl(binding, token);
				} catch (error) {
					await fs.rm(this.file(selected));
					throw error;
				}
			}
			const grant = await new RemoteViewApplication(selected).issueEmbed(
				browser.assignment,
				selected,
				"control",
				receipt.issuanceKey,
			);
			await this.write(selected, { ...receipt, routeId: grant.routeId });
			return { url: grant.url, capability: "control" as const, token, inactivityTimeoutSeconds: Math.floor((receipt.inactivityTimeoutMs ?? this.options.inactivityTimeoutMs ?? 120_000) / 1000) };
		}); } catch (error) {
      // A definitive rejection must not strand a claim that never belonged to this caller.
      // Unknown receipt state stays retained, including lost issuance replies.
      let claimRetained = true;
      try { claimRetained = (await this.read(selected))?.token === token; } catch { /* fail closed */ }
      throw new NativeDesktopControlError(error instanceof Error ? error.message : 'Desktop control unavailable.', claimRetained);
    }
	}

	async status(selected: RemoteViewDesktopConfig, browserId: string, token: string): Promise<{ state: 'held' | 'released' }> {
    if (await this.wasReleased(selected, browserId, token)) return { state: 'released' };
    const receipt = await this.read(selected);
    if (!receipt || receipt.token !== token || receipt.browserId !== browserId) throw new Error('Desktop control status is unknown.');
    return { state: 'held' };
  }
  async expireInactive(selected: RemoteViewDesktopConfig): Promise<void> {
    const receipt = await this.read(selected);
    if (!receipt) return;
    const browser = await this.browser(selected, receipt.browserId);
    if (nativeBrowserGeneration(browser) !== receipt.binding) throw new Error('Desktop control ownership changed.');
    const provider = new RemoteViewApplication(selected);
    const result = receipt.routeId ? await provider.revokeInactiveEmbed(receipt.routeId, selected.appOrigin, Math.floor((receipt.inactivityTimeoutMs ?? this.options.inactivityTimeoutMs ?? 120_000) / 1000)) : undefined;
    if (result === 'revoked' || receipt.revoked) await this.release(selected, receipt.browserId, receipt.token);
  }

  async release(
		selected: RemoteViewDesktopConfig,
		browserId: string,
		token: string,
	): Promise<void> {
		return this.exclusive(selected, async () => {
			let receipt = await this.read(selected);
      if (!receipt && await this.wasReleased(selected, browserId, token)) return;
      const browser = await this.browser(selected, browserId);
      const binding = nativeBrowserGeneration(browser);
			if (
				!receipt ||
				receipt.token !== token ||
				receipt.browserId !== browserId ||
				receipt.binding !== binding
			) {
				throw new Error("Desktop control ownership changed; refusing stale release.");
			}
			const gate = new DesktopControlGate(browser.assignment.desktopId, this.options.gateDirectory);
			await gate.assertControl(token, binding);
			const provider = new RemoteViewApplication(selected);
			if (!receipt.revoked) {
				try {
					if (!receipt.routeId) {
						const grant = await provider.issueEmbed(
							browser.assignment,
							selected,
							"control",
							receipt.issuanceKey,
						);
						receipt = { ...receipt, routeId: grant.routeId };
						await this.write(selected, receipt);
					}
					await provider.revokeEmbed(receipt.routeId as string, selected.appOrigin);
				} catch (revokeError) {
					// Replaying the exact durable issuance proves a terminal grant after expiry
					// or an acknowledged-lost revoke. Access denied alone is never that proof.
					try {
						await provider.issueEmbed(browser.assignment, selected, "control", receipt.issuanceKey);
					} catch (error) {
						if (
							error instanceof RemoteViewProviderError &&
							error.code === "consumer_grant_unavailable"
						) {
							receipt = { ...receipt, revoked: true };
						} else throw revokeError;
					}
					if (!receipt.revoked) throw revokeError;
				}
				receipt = { ...receipt, revoked: true };
				await this.write(selected, receipt);
			}
			await gate.releaseControl(token, binding);
      const released = this.releasedFile(selected, token);
      await fs.mkdir(path.dirname(released), { recursive: true, mode: 0o700 });
      await fs.writeFile(released, JSON.stringify(receipt), { mode: 0o600 });
			await fs.rm(this.file(selected));
		});
	}
}
