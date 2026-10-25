import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RelayStore } from "../src/mcp/relay/store.js";

describe("durable OAuth relay requests", () => {
	it("allows only one fresh claim under concurrent callers and rejects a reply without that claim", async () => {
		const root = await mkdtemp(join(tmpdir(), "auracall-relay-concurrent-"));
		try {
			const store = new RelayStore(root, "synthetic-owner");
			const job = await store.enqueue({ requestId: "fixture_race_01", prompt: "Claim only once" });
			await expect(
				store.submit(job.requestId, "00000000-0000-4000-8000-000000000000", "Unclaimed reply"),
			).rejects.toMatchObject({ code: "claim_mismatch" });
			const attempts = await Promise.allSettled([
				store.claim(job.requestId, job.fingerprint),
				new RelayStore(root, "synthetic-owner").claim(job.requestId, job.fingerprint),
			]);
			expect(attempts.filter((x) => x.status === "fulfilled" && x.value.fresh)).toHaveLength(1);
			expect((await store.claim(job.requestId, job.fingerprint)).fresh).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("preserves exact prompt bytes and holds uncertain claims instead of redispatching", async () => {
		const root = await mkdtemp(join(tmpdir(), "auracall-relay-hold-"));
		try {
			const store = new RelayStore(root, "synthetic-owner");
			const prompt = "  Original wording α\n\n";
			const job = await store.enqueue({ requestId: "fixture_hold_01", prompt });
			expect((await store.request(job.requestId)).prompt).toBe(prompt);
			const claim = await store.claim(job.requestId, job.fingerprint);
			await store.hold(job.requestId, claim.claimId);
			expect(
				await new RelayStore(root, "synthetic-owner").claim(job.requestId, job.fingerprint),
			).toMatchObject({ fresh: false, claimId: claim.claimId });
			expect(await store.status(job.requestId)).toMatchObject({
				state: "held_unknown",
				reply: null,
			});
			await expect(
				store.enqueue({ requestId: job.requestId, prompt: "changed" }),
			).rejects.toMatchObject({ code: "request_conflict" });
			await expect(
				store.enqueue({
					requestId: "fixture_files_01",
					prompt: "Keep all files",
					attachments: ["figure.png"],
				}),
			).rejects.toMatchObject({ code: "relay_attachments_unsupported" });
			await expect(
				new RelayStore(root, "another-owner").request(job.requestId),
			).rejects.toMatchObject({ code: "request_missing" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("claims once and preserves a complete linked reply across store restart", async () => {
		const root = await mkdtemp(join(tmpdir(), "auracall-relay-"));
		try {
			let store = new RelayStore(root, "synthetic-owner");
			const job = await store.enqueue({ requestId: "fixture_request_01", prompt: "First request" });
			const claim = await store.claim(job.requestId, job.fingerprint);
			expect(claim.fresh).toBe(true);
			store = new RelayStore(root, "synthetic-owner");
			expect(await store.claim(job.requestId, job.fingerprint)).toMatchObject({
				fresh: false,
				claimId: claim.claimId,
			});
			const text = `${"Complete response αβ µm\n".repeat(1800)}FINAL END`;
			await store.submit(job.requestId, claim.claimId, text);
			store = new RelayStore(root, "synthetic-owner");
			expect(await store.status(job.requestId)).toMatchObject({
				state: "replied",
				reply: { text, providerResponseId: null, liveVerified: false },
			});
			const next = await store.enqueue({
				requestId: "fixture_request_02",
				prompt: "Continue the previous answer",
				previousRequestId: job.requestId,
			});
			expect((await store.request(next.requestId)).previousReply?.text).toBe(text);
			await expect(
				store.submit(job.requestId, claim.claimId, "different reply"),
			).rejects.toMatchObject({ code: "reply_conflict" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

it("discovers only this owner's unfinished requests without exposing payload or claim credentials", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-pending-"));
	try {
		const store = new RelayStore(root, "owner-a");
		await store.enqueue({ requestId: "request_ready_01", prompt: "Private original prompt" });
		await new RelayStore(root, "owner-b").enqueue({
			requestId: "foreign_request_01",
			prompt: "Other owner's private prompt",
		});
		const completed = await store.enqueue({
			requestId: "completed_request",
			prompt: "Already answered",
		});
		const claim = await store.claim(completed.requestId, completed.fingerprint);
		await store.submit(completed.requestId, claim.claimId, "Private completed answer");
		expect(await store.pending()).toEqual({
			requests: [{ requestId: "request_ready_01", state: "ready", previousRequestId: null }],
			nextCursor: null,
		});
		expect(await store.status("request_ready_01")).toMatchObject({ state: "ready", claimId: null });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("pages ready, claimed and held work deterministically across restart while excluding completed work", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-pages-"));
	try {
		let store = new RelayStore(root, "owner-a");
		const parent = await store.enqueue({ requestId: "pending_parent", prompt: "Prior request" });
		const parentClaim = await store.claim(parent.requestId, parent.fingerprint);
		await store.submit(parent.requestId, parentClaim.claimId, "Previous complete reply");
		const held = await store.enqueue({
			requestId: "pending_bbbb",
			prompt: "Follow-up",
			previousRequestId: parent.requestId,
		});
		const heldClaim = await store.claim(held.requestId, held.fingerprint);
		await store.hold(held.requestId, heldClaim.claimId);
		await store.enqueue({ requestId: "pending_aaaa", prompt: "Ready" });
		const claimed = await store.enqueue({ requestId: "pending_cccc", prompt: "Processing" });
		await store.claim(claimed.requestId, claimed.fingerprint);
		await new RelayStore(root, "owner-b").enqueue({
			requestId: "pending_abbb",
			prompt: "Private other owner",
		});
		store = new RelayStore(root, "owner-a");
		expect(await store.pending({ limit: 2 })).toEqual({
			requests: [
				{ requestId: "pending_aaaa", state: "ready", previousRequestId: null },
				{ requestId: "pending_bbbb", state: "held_unknown", previousRequestId: "pending_parent" },
			],
			nextCursor: "pending_bbbb",
		});
		expect(await store.pending({ limit: 2, after: "pending_bbbb" })).toEqual({
			requests: [{ requestId: "pending_cccc", state: "awaiting_reply", previousRequestId: null }],
			nextCursor: null,
		});
		expect(await store.claim(held.requestId, held.fingerprint)).toMatchObject({
			fresh: false,
			claimId: heldClaim.claimId,
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("returns an empty missing inbox and rejects invalid discovery bounds or cursors", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-query-"));
	try {
		const store = new RelayStore(join(root, "not-created"), "owner-a");
		expect(await store.pending()).toEqual({ requests: [], nextCursor: null });
		for (const query of [{ limit: 0 }, { limit: 21 }, { limit: 1.5 }, { after: "../outside" }]) {
			await expect(store.pending(query)).rejects.toMatchObject({ code: "invalid_pending_query" });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses unsafe or corrupt inbox state and never follows a request-directory symlink", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-unsafe-"));
	try {
		const store = new RelayStore(root, "owner-a");
		await store.enqueue({ requestId: "private_request", prompt: "Secret task" });
		await chmod(root, 0o755);
		await expect(store.pending()).rejects.toMatchObject({ code: "relay_storage_invalid" });
		await chmod(root, 0o700);
		await symlink(join(root, "private_request"), join(root, "symlink_request"));
		await expect(store.pending()).rejects.toMatchObject({ code: "relay_storage_invalid" });
		await rm(join(root, "symlink_request"));
		await writeFile(join(root, "private_request", "request.json"), "not valid JSON", {
			mode: 0o600,
		});
		await expect(store.pending()).rejects.toMatchObject({ code: "relay_storage_invalid" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("refuses a discovery scan beyond its fixed bound without modifying or claiming requests", async () => {
	const root = await mkdtemp(join(tmpdir(), "auracall-relay-scan-"));
	try {
		await Promise.all(
			Array.from({ length: 513 }, (_, i) =>
				mkdir(join(root, `fixture_${String(i).padStart(4, "0")}`), { mode: 0o700 }),
			),
		);
		await expect(new RelayStore(root, "owner-a").pending()).rejects.toMatchObject({
			code: "relay_pending_scan_limit",
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
