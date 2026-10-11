import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getAuracallHomeDir } from "../../auracallHome.js";

interface GateOwner {
	id: string;
	role: "automation" | "human";
	binding: string;
	ownerPid: number;
	acquiredAt: string;
}

/** A clock alone never releases a human lease; exact provider revocation must qualify handoff. */
export class DesktopControlGate {
	private readonly lockPath: string;
	constructor(
		displayAllocationId: string,
		directory = path.join(getAuracallHomeDir(), "desktop-control"),
	) {
		this.lockPath = path.join(
			directory,
			createHash("sha256").update(displayAllocationId).digest("hex"),
		);
	}

	private async transition<T>(operation: () => Promise<T>): Promise<T> {
		await fs.mkdir(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
		const transitionPath = `${this.lockPath}.transition`;
		let acquired = false;
		for (let attempt = 0; attempt < 100; attempt += 1) {
			try {
				await fs.mkdir(transitionPath, { mode: 0o700 });
				acquired = true;
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				await delay(20);
			}
		}
		if (!acquired) throw new Error("Desktop control coordination is busy.");
		try {
			return await operation();
		} finally {
			await fs.rm(transitionPath, { recursive: true });
		}
	}

	private async acquire(
		role: GateOwner["role"],
		binding: string,
		id: string = randomUUID(),
	): Promise<GateOwner> {
		return this.transition(async () => {

      const previous = await this.owner();
      if (process.platform === 'linux' && previous?.role === 'automation' && Number.isInteger(previous.ownerPid) && previous.ownerPid > 0) {
        let absent = false;
        try { await fs.access(`/proc/${previous.ownerPid}`); }
        catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') absent = true; else throw e; }
        if (absent) await fs.rm(this.lockPath, { recursive: true });
      }
			await fs.mkdir(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
			try {
				await fs.mkdir(this.lockPath, { mode: 0o700 });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST")
					throw new Error("Desktop control is busy; automation or another human owns the display.");
				throw error;
			}
			const owner: GateOwner = {
				id,
				role,
				binding,
				ownerPid: process.pid,
				acquiredAt: new Date().toISOString(),
			};
			try {
				const pendingPath = path.join(this.lockPath, `owner.${randomUUID()}.pending`);
				await fs.writeFile(pendingPath, JSON.stringify(owner), {
					mode: 0o600,
					flag: "wx",
				});
				await fs.rename(pendingPath, path.join(this.lockPath, "owner.json"));
				return owner;
			} catch (error) {
				await fs.rm(this.lockPath, { recursive: true, force: true });
				throw error;
			}
		});
	}

	private async owner(): Promise<GateOwner | undefined> {
		const invalid = () => new Error(
			"Desktop control ownership record is invalid or incomplete; automation remains blocked. Preserve the record and qualify an explicit control recovery.",
		);
		let raw: string;
		try {
			raw = await fs.readFile(path.join(this.lockPath, "owner.json"), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			try {
				await fs.stat(this.lockPath);
			} catch (lockError) {
				if ((lockError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
				throw lockError;
			}
			throw invalid();
		}
		let value: unknown;
		try { value = JSON.parse(raw); } catch { throw invalid(); }
		if (!value || typeof value !== "object") throw invalid();
		const owner = value as Partial<GateOwner>;
		if (
			typeof owner.id !== "string" || !owner.id ||
			(owner.role !== "automation" && owner.role !== "human") ||
			typeof owner.binding !== "string" || !owner.binding ||
			typeof owner.ownerPid !== "number" || !Number.isInteger(owner.ownerPid) || owner.ownerPid <= 0 ||
			typeof owner.acquiredAt !== "string" || !Number.isFinite(Date.parse(owner.acquiredAt))
		) throw invalid();
		return owner as GateOwner;
	}

	async takeControl(binding: string, token: string = randomUUID()): Promise<{ token: string }> {
		const owner = await this.acquire("human", binding, token);
		return { token: owner.id };
	}

	async assertControl(token: string, binding: string): Promise<void> {
		const owner = await this.owner();
		if (!owner || owner.id !== token || owner.role !== "human" || owner.binding !== binding) {
			throw new Error("Desktop control ownership changed; refusing stale control.");
		}
	}

	async releaseControl(token: string, binding: string): Promise<void> {
		return this.transition(async () => {
			const owner = await this.owner();
			if (!owner || owner.id !== token || owner.role !== "human" || owner.binding !== binding) {
				throw new Error("Desktop control ownership changed; refusing stale release.");
			}
			await fs.rm(this.lockPath, { recursive: true });
		});
	}

	async withAutomation<T>(binding: string, effect: () => Promise<T>): Promise<T> {
		let owner: GateOwner | undefined;
		for (let attempt = 0; attempt < 100; attempt += 1) {
			try {
				owner = await this.acquire("automation", binding);
				break;
			} catch (error) {
				const current = await this.owner();
				if (current?.role === "human")
					throw new Error("AuraCall automation is paused while a human controls this desktop.");
				if (attempt === 99) throw error;
				await delay(20);
			}
		}
		if (!owner) throw new Error("Desktop automation admission unavailable.");
		try {
			return await effect();
		} finally {
			await this.transition(async () => {
				const current = await this.owner();
				if (current?.id === owner.id) await fs.rm(this.lockPath, { recursive: true });
			});
		}
	}
}
