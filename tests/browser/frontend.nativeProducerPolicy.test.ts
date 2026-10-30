import { chmod, cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { producerMetadataDigest } from "../../src/browser/frontends/nativeProducerAccounting.js";
import { planSchema } from "../../src/browser/frontends/nativeProducerPhaseRecords.js";
import { qualifyP266ProducerPolicy } from "../../src/browser/frontends/nativeProducerPolicy.js";

// Explicit source-only fixture: frozen public build-source files, never a
// browser process/private input. No live, SDK or candidate invocation here.
const snapshot = process.env.AURACALL_PUBLIC_P266_POLICY_SOURCE ?? "";
const qualified = it.skipIf(!snapshot);
const evidence = join(process.cwd(), "docs/dev/contracts/p266-producer-policy-qualification.md");
const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function copy() {
	const root = await mkdtemp(join(tmpdir(), "auracall-public-policy-"));
	roots.push(root);
	await cp(snapshot, root, { recursive: true });
	return root;
}
function options(root = snapshot) {
	return { browserSourceRoot: root, qualificationDocument: evidence };
}

qualified(
	"qualifies all nine phases and transitive conditional costs without creating authority",
	async () => {
		const result = await qualifyP266ProducerPolicy(options());
		expect(planSchema.parse(result.plan)).toEqual(result.plan);
		expect(result.plan.upper).toEqual({
			consumerAcquisitions: 0,
			producerLifecycles: 1,
			reads: 2,
			controls: 2,
			drafts: 0,
			sends: 0,
			localStateReads: 20,
		});
		expect(result.plan.rows.map((r) => r.step)).toEqual([
			"freshness",
			"initialize",
			"open",
			"open_state",
			"acquire_initial_tab",
			"target_state",
			"navigate",
			"url",
			"final_state",
		]);
		expect(result.plan.rows[2].policyUpper.localStateReads).toBe(10);
		expect(result.policy.planDigest).toBe(producerMetadataDigest(result.plan));
		expect(result).not.toHaveProperty("binding");
		expect(result).not.toHaveProperty("planRecord");
		expect(result).not.toHaveProperty("accounting_selection");
		expect(Object.isFrozen(result.plan.rows[2].coveredSourceOperations[0])).toBe(true);
		expect(new Set(result.operationTable.map(([, op]) => op.operationKey)).size).toBe(
			result.operationTable.length,
		);
	},
);

qualified(
	"covers exactly the five classified startup commands plus passive waits and page observations",
	async () => {
		const { plan } = await qualifyP266ProducerPolicy(options());
		const ops = plan.rows.flatMap((r) => r.coveredSourceOperations);
		const setup = ops.filter(
			(op) =>
				[
					"Target.setDiscoverTargets",
					"Target.getTargets",
					"Target.attachToTarget",
					"Page.enable",
				].includes(op.method) || op.method.includes("Browser.setDownloadBehavior"),
		);
		expect(setup).toHaveLength(5);
		expect(setup.every((op) => op.readsUpper === 0 && op.controlsUpper === 0)).toBe(true);
		expect(ops.find((op) => op.operationKey === "open:one_child")?.method).toContain(
			"conditional endpoint",
		);
		expect(
			ops.find((op) => op.operationKey === "open:wait_original_blank")?.localStateReadsUpper,
		).toBe(1);
		expect(ops.find((op) => op.operationKey === "navigate:navigation_terminal")?.readsUpper).toBe(
			1,
		);
		expect(ops.find((op) => op.operationKey === "url:original_url")?.readsUpper).toBe(1);
	},
);

qualified(
	"refuses changed transitive browser source rather than discovering a new policy",
	async () => {
		const root = await copy();
		const path = join(root, "cli/src/native/browser_producer.rs");
		await chmod(path, 0o600);
		await writeFile(path, `${await readFile(path, "utf8")}\n// changed effect\n`);
		await expect(qualifyP266ProducerPolicy(options(root))).rejects.toMatchObject({
			code: "producer_policy_source_changed",
		});
	},
);

qualified.each(["missing", "symlink", "writable"])(
	"refuses %s source before returning a selected plan",
	async (kind) => {
		const root = await copy(),
			path = join(root, "cli/src/native/browser.rs");
		if (kind === "writable") await chmod(path, 0o666);
		else {
			await rm(path);
			if (kind === "symlink") await symlink(join(snapshot, "cli/src/native/browser.rs"), path);
		}
		await expect(qualifyP266ProducerPolicy(options(root))).rejects.toThrow();
	},
);

qualified("refuses altered qualification evidence and client-supplied cost overrides", async () => {
	const root = await copy(),
		document = join(root, "unqualified.md");
	await writeFile(document, "These operations are free.\n", { mode: 0o600 });
	await expect(
		qualifyP266ProducerPolicy({ ...options(), qualificationDocument: document }),
	).rejects.toMatchObject({ code: "producer_policy_source_changed" });
	await expect(
		qualifyP266ProducerPolicy({ ...options(), rows: [] } as never),
	).rejects.toMatchObject({ code: "producer_policy_options_refused" });
});
