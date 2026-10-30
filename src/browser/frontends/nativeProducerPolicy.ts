import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type ProducerPolicySelection,
	producerMetadataDigest,
} from "./nativeProducerAccounting.js";
import { type ProducerPlan, planSchema } from "./nativeProducerPhaseRecords.js";
import { P266_PRODUCER_SOURCE_PINS } from "./nativeProducerPolicySources.js";
import { accountingRefusal, originalSha } from "./originalAccountingHistory.js";

export const P266_POLICY_BROWSER_SHA256 =
	"ac1782b6684af44517b1ffea03f980b5852f48fbf0d32615582328732bd07d9b";
const qualificationSha = "475f09d6552c2d76ea45147a0f558852980dcd2c96c02b4eba8cd788439cfe94";
type Source = keyof typeof P266_PRODUCER_SOURCE_PINS;
type Step = ProducerPlan["rows"][number]["step"];
type Method = ProducerPlan["rows"][number]["nativeMethod"];
type Pin = ProducerPlan["mappingSource"];
type Operation = readonly [string, Source, string, string, number, number, number];

// One entry is one bounded source invocation/compound observation, not one
// syscall, polling iteration, transport frame or passive event. See qualification.
const native = "cli/src/native/";
const backend = `${native}browser_session_producer_open.rs` as const;
const runtime = `${native}browser_session_runtime.rs` as const;
const host = `${native}browser_session_host.rs` as const;
const manager = "crates/agent-browser-service-model/src/browser_session_manager.rs";
const rows: readonly (readonly [Step, Method, readonly Operation[]])[] = [
	[
		"freshness",
		"freshness_snapshot",
		[
			[
				"original_boundary",
				"cli/src/producer_open_engine.rs",
				"execute_original/step",
				"validate/deadline/owner/journal",
				0,
				0,
				0,
			],
			[
				"fresh_realm",
				backend,
				"require_fresh_sources",
				"readonly SQLite/legacy/ledger/archive freshness",
				0,
				0,
				1,
			],
		],
	],
	[
		"initialize",
		"initialize_fresh_host",
		[
			[
				"fresh_recheck",
				backend,
				"NativeProducer::initialize_fresh_host",
				"repeat freshness immediately before host construction",
				0,
				0,
				1,
			],
			[
				"fresh_host",
				host,
				"load_fresh_producer_host/load_browser_session_host",
				"load empty state/catalog/retention; start fresh-only thread",
				0,
				0,
				1,
			],
		],
	],
	[
		"open",
		"open_disposable",
		[
			[
				"open_empty_state",
				backend,
				"NativeProducer::open_once",
				"fresh state/exact original session",
				0,
				0,
				1,
			],
			[
				"new_allocation",
				runtime,
				"BrowserSessionEffectAdapter::allocate_disposable_profile",
				"empty private root/create-only disposable profile",
				0,
				0,
				1,
			],
			[
				"launch_preflight",
				runtime,
				"BrowserRuntimeCommand::PreflightLaunch",
				"bounded local resource admission wait",
				0,
				0,
				1,
			],
			[
				"launch_resources",
				runtime,
				"BrowserRuntimeCommand::Launch",
				"second bounded local resource admission wait",
				0,
				0,
				1,
			],
			[
				"one_child",
				`${native}cdp/chrome.rs`,
				"launch_chrome/try_launch_chrome",
				"single spawn/owned-child readiness and conditional endpoint reachability",
				0,
				0,
				1,
			],
			[
				"original_transport",
				"crates/agent-browser-cdp/src/client.rs",
				"CdpClient::connect_with_headers",
				"one own-child WebSocket; transport reader/keepalive",
				0,
				0,
				1,
			],
			[
				"discover_blank",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"Target.setDiscoverTargets",
				0,
				0,
				0,
			],
			[
				"query_blank",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"Target.getTargets",
				0,
				0,
				1,
			],
			[
				"wait_original_blank",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"conditional passive original blank targetCreated wait",
				0,
				0,
				1,
			],
			[
				"attach_blank",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"Target.attachToTarget",
				0,
				0,
				0,
			],
			[
				"enable_blank",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"Page.enable",
				0,
				0,
				0,
			],
			[
				"own_download_directory",
				`${native}browser_producer.rs`,
				"BrowserManager::launch_producer_once",
				"create own directory/Browser.setDownloadBehavior",
				0,
				0,
				0,
			],
			[
				"retain_original_child",
				runtime,
				"BrowserRuntimeCommand::Launch",
				"cache same manager/process identity; no attach/recovery",
				0,
				0,
				1,
			],
			[
				"commit_original_session",
				manager,
				"BrowserSessionManager::open",
				"empty-state new session/liveness; host commit_state",
				0,
				0,
				1,
			],
		],
	],
	[
		"open_state",
		"read_durable_state",
		[
			[
				"open_snapshot",
				backend,
				"NativeProducer::read_state",
				"readonly SQLite original browser/session identity",
				0,
				0,
				1,
			],
		],
	],
	[
		"acquire_initial_tab",
		"acquire_initial_tab",
		[
			[
				"cached_initial_tab",
				runtime,
				"BrowserRuntimeCommand::AcquireInitialTab",
				"select cached about:blank; host tab_for_navigation/commit",
				0,
				1,
				1,
			],
		],
	],
	[
		"target_state",
		"read_durable_state",
		[
			[
				"target_snapshot",
				backend,
				"NativeProducer::read_state",
				"readonly SQLite original target identity",
				0,
				0,
				1,
			],
		],
	],
	[
		"navigate",
		"Page.navigate",
		[
			[
				"cached_navigation_identity",
				runtime,
				"BrowserRuntimeCommand::ProducerPage",
				"require same cached child/session/target",
				0,
				0,
				1,
			],
			[
				"navigate_once",
				`${native}browser.rs`,
				"BrowserManager::producer_navigate_target_once",
				"Page.navigate exactly once",
				0,
				1,
				0,
			],
			[
				"navigation_terminal",
				`${native}browser.rs`,
				"BrowserManager::wait_for_lifecycle",
				"conditional same-session Page.loadEventFired wait",
				1,
				0,
				0,
			],
			[
				"navigation_history",
				host,
				"BrowserSessionHost::record_navigation",
				"update/compact own URL history and durable state",
				0,
				0,
				1,
			],
		],
	],
	[
		"url",
		"Target.getTargetInfo",
		[
			[
				"cached_url_identity",
				runtime,
				"BrowserRuntimeCommand::ProducerPage",
				"require same cached child/session/target",
				0,
				0,
				1,
			],
			[
				"original_url",
				runtime,
				"BrowserRuntimeCommand::ProducerPage",
				"Target.getTargetInfo exact target/type/URL",
				1,
				0,
				0,
			],
		],
	],
	[
		"final_state",
		"read_durable_state",
		[
			[
				"final_snapshot",
				backend,
				"NativeProducer::read_state",
				"readonly SQLite final identity",
				0,
				0,
				1,
			],
		],
	],
];

async function pinFile(path: string, expected?: string): Promise<Pin> {
	if (!isAbsolute(path) || (await realpath(path)) !== path)
		return accountingRefusal("producer_policy_source_path_refused");
	const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = await fd.stat({ bigint: true });
		if (!before.isFile() || before.mode & 0o022n || before.size < 1n || before.size > 1048576n)
			return accountingRefusal("producer_policy_source_refused");
		const bytes = await fd.readFile();
		const after = await fd.stat({ bigint: true });
		const named = await lstat(path, { bigint: true });
		for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"] as const)
			if (before[field] !== after[field] || before[field] !== named[field])
				return accountingRefusal("producer_policy_source_changed");
		const sha256 = originalSha(bytes);
		if (expected && sha256 !== expected) return accountingRefusal("producer_policy_source_changed");
		return { path, sha256 };
	} finally {
		await fd.close();
	}
}
function freeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const v of Object.values(value)) freeze(v);
		Object.freeze(value);
	}
	return value;
}

/** Non-executing policy qualification. This reads public frozen source only.
 * The operator must select these compiled bytes; JSON output is not authority.
 * No directory, planRecord, participant, grant, browser or SDK is constructed. */
export async function qualifyP266ProducerPolicy(paths: {
	readonly browserSourceRoot: string;
	readonly qualificationDocument: string;
}) {
	if (Object.keys(paths).sort().join(",") !== "browserSourceRoot,qualificationDocument")
		return accountingRefusal("producer_policy_options_refused");
	if (
		!isAbsolute(paths.browserSourceRoot) ||
		(await realpath(paths.browserSourceRoot)) !== paths.browserSourceRoot
	)
		return accountingRefusal("producer_policy_source_path_refused");
	const source = await pinFile(fileURLToPath(import.meta.url));
	const sourceCatalog = await pinFile(
		fileURLToPath(
			new URL(
				import.meta.url.endsWith(".ts")
					? "./nativeProducerPolicySources.ts"
					: "./nativeProducerPolicySources.js",
				import.meta.url,
			),
		),
	);
	const evidence = await pinFile(paths.qualificationDocument, qualificationSha);
	const sources = new Map<Source, Pin>();
	for (const [relativePath, sha256] of Object.entries(P266_PRODUCER_SOURCE_PINS))
		sources.set(
			relativePath as Source,
			await pinFile(join(paths.browserSourceRoot, relativePath), sha256),
		);
	const zero = {
		consumerAcquisitions: 0,
		producerLifecycles: 0,
		reads: 0,
		controls: 0,
		drafts: 0,
		sends: 0,
		localStateReads: 0,
	};
	const planRows = rows.map(([step, nativeMethod, operations]) => {
		const coveredSourceOperations = operations.map(
			([key, path, symbol, method, readsUpper, controlsUpper, localStateReadsUpper]) => ({
				operationKey: `${step}:${key}`,
				source: sources.get(path) ?? accountingRefusal("producer_policy_source_missing"),
				symbol,
				method,
				maxStarts: 1 as const,
				readsUpper,
				controlsUpper,
				localStateReadsUpper,
				classificationEvidence: evidence,
			}),
		);
		const policyUpper = { ...zero, producerLifecycles: step === "open" ? 1 : 0 };
		for (const op of coveredSourceOperations) {
			policyUpper.reads += op.readsUpper;
			policyUpper.controls += op.controlsUpper;
			policyUpper.localStateReads += op.localStateReadsUpper;
		}
		return { step, nativeMethod, coveredSourceOperations, policyUpper };
	});
	const upper = { ...zero };
	for (const row of planRows)
		for (const key of Object.keys(upper) as (keyof typeof upper)[])
			upper[key] += row.policyUpper[key];
	const plan = planSchema.parse({
		schemaVersion: "p266.producer-policy-plan.v1",
		nativePlanVersion: "agent-browser.producer-step-budget.v1",
		mappingVersion: "auracall.p266.ac178.transitive-policy.v1",
		mappingSource: source,
		qualificationEvidence: [evidence, sourceCatalog, ...sources.values()],
		producerContractSha256: "703498fba269666d4d68e8000790e5eeaaee78cc588d132319c4102b75dce98f",
		rows: planRows,
		upper,
		sharedNewRunCaps: { consumerAcquisitions: 1, reads: 80, controls: 6, sends: 1 },
		producerLifecycleLimit: 1,
	});
	const planDigest = producerMetadataDigest(plan);
	const policy: ProducerPolicySelection = {
		planDigest,
		mappingSource: plan.mappingSource,
		qualificationEvidence: plan.qualificationEvidence,
	};
	const operationTable = plan.rows.flatMap((row) =>
		row.coveredSourceOperations.map((operation) => [row.step, operation] as const),
	);
	const policyScopeDigest = producerMetadataDigest({
		policy: plan.mappingVersion,
		browserBinarySha256: P266_POLICY_BROWSER_SHA256,
		buildInputsSha256: "ff332c7e8d06afef8d77ba52a24a66c1dc7daa3b2a8e77c86545c65d3a2128bf",
		planDigest,
		operationTable,
	});
	return freeze({
		source,
		plan,
		policy,
		policyScopeDigest,
		operationTable,
		browserBinarySha256: P266_POLICY_BROWSER_SHA256,
	});
}
