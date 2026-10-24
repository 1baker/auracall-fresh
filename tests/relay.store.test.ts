import { mkdtemp, rm } from "node:fs/promises";
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
