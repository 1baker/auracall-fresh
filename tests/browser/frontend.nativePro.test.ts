import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { nativeSnapshotSchema } from "../../src/browser/frontends/nativeAx.js";
import { NativeChatgptFrontend } from "../../src/browser/frontends/nativeChatgpt.js";
import { NativeConsumerSession } from "../../src/browser/frontends/nativeConsumer.js";
import {
	nativeBudgetDigest,
	nativeReadAmendment,
	qualifyNativeReadBudget,
} from "../../src/browser/frontends/nativeReadBudget.js";
import { prepareRelayProOnly } from "../../src/mcp/relay/proPreparation.js";
import { RelayStore } from "../../src/mcp/relay/store.js";
import shared from "./fixtures/native-ax-control-privacy-r2.json";
import { withCompletedIdentity } from "./nativeIdentityFixture.js";

const dirs: string[] = [];
afterEach(async () => {
	for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true });
});
const admission = {
	consumerGrantId: "fixture-grant",
	profileCapability: "fixture-cap",
	taskKey: "fixture-key",
	profileId: "fixture-profile",
	browserId: "fixture-browser",
	tabId: "fixture-tab",
	targetId: "fixture-target",
	expiresAtMs: 10000,
};
const labels = ["Instant", "Medium", "High", "Extra High", "Pro"];
function snapshot(value = 4) {
	return {
		snapshot:
			'- button "Fixture model" [ref=e1]\n- button "Open profile menu" [ref=e2]\n- textbox "Ask anything" [ref=e3]\n- slider "Intelligence" [ref=e4]',
		refs: {
			e1: {
				role: "button",
				name: "Fixture model",
				ax: { schemaVersion: "agent-browser.ax-control.v1", disabled: false },
			},
			e2: { role: "button", name: "Open profile menu" },
			e3: { role: "textbox", name: "Ask anything" },
			e4: {
				role: "slider",
				name: "Intelligence",
				ax: {
					schemaVersion: "agent-browser.ax-control.v1",
					value,
					minimum: 0,
					maximum: 4,
					valueText: labels[value],
					disabled: false,
					focused: true,
				},
			},
		},
	};
}
type MutableFixture = {
	result: {
		snapshot: string;
		refs: Record<string, { role: string; name: string; ax?: Record<string, unknown> }>;
		url?: string;
		pressed?: unknown;
	};
	identity: { custodyDigest: string };
	operation: { operationKey: string };
	targetObservation: { targetId: string };
	identityFreshness: string;
};
async function fixture(
	value = 4,
	modify?: (data: MutableFixture, args: Record<string, unknown>) => void,
	carriedAllowance = false,
) {
	const directory = await mkdtemp(join(tmpdir(), "auracall-native-pro-"));
	dirs.push(directory);
	let current = value;
	const callTool = vi.fn(async ({ name, arguments: args }) => {
		const action = name === "browser_open" ? "open" : args.action;
		if (action === "press") current++;
		const key = args.operationKey ?? "fixture-open";
		const ack = {
			kind:
				action === "open"
					? "opened"
					: ["url", "snapshot"].includes(action)
						? "observed"
						: "input_acknowledged",
			completedAtMs: 1000,
		};
		const data = withCompletedIdentity(
			{
				contractVersion: "agent-browser.retained-consumer.v1",
				taskId: "fixture-task",
				controlRef: "fixture-control",
				consumerGrantId: admission.consumerGrantId,
				acquisitionId: "fixture-acquisition",
				state: "active",
				expiresAtMs: admission.expiresAtMs,
				profileId: admission.profileId,
				browserId: admission.browserId,
				tabId: admission.tabId,
				operation: {
					operationId: key,
					operationKey: key,
					action,
					state: "completed",
					ack,
					createdAtMs: 900,
				},
				consumerAck: ack,
				targetObservation: {
					operationId: key,
					targetId: admission.targetId,
					targetType: "page",
					origin: "https://chatgpt.com",
					stage: "after_action",
					observedAtMs: 1000,
				},
				result:
					action === "url"
						? { url: "https://chatgpt.com/c/fixture" }
						: action === "snapshot"
							? snapshot(current)
							: action === "press"
								? { pressed: true }
								: action === "click"
									? { clicked: true }
									: null,
			},
			admission,
		);
		modify?.(data as unknown as MutableFixture, args);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						tool: name,
						session: "fixture-session",
						success: true,
						data,
						error: null,
					}),
				},
			],
		};
	});
	const budget = carriedAllowance
		? await qualifyNativeReadBudget(
				{
					receiptDigest: "a".repeat(64),
					producerSha256: "b".repeat(64),
					admissionDigest: nativeBudgetDigest(admission),
					ledgerDirectory: directory,
					expiresAtMs: admission.expiresAtMs,
				},
				async (ctx) => ({
					amendment: nativeReadAmendment,
					contextDigest: nativeBudgetDigest(ctx),
					reservationDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
					consumed: { acquisition: 0, read: 18, control: 0, draft: 0, send: 2 },
				}),
				() => 2000,
			)
		: undefined;
	const session = new NativeConsumerSession({ callTool }, admission, directory, () => 2000, budget);
	await session.acquire();
	const route = {
		id: "fixture-route",
		provider: "chatgpt" as const,
		expectedUrl: "https://chatgpt.com/c/fixture",
		expectedModel: "Fixture model",
		transport: "agent_browser_task" as const,
		nativeTask: session.binding,
	};
	return {
		frontend: new NativeChatgptFrontend(session, route, () => 2000),
		session,
		callTool,
		directory,
		route,
	};
}

it("observes actual typed Pro value and label through the authenticated native snapshot", async () => {
	const f = await fixture();
	expect(await f.frontend.inspect(f.route.id)).toMatchObject({
		effort: "pro",
		model: "Fixture model",
		liveVerified: false,
	});
	expect(f.callTool.mock.calls.slice(1).map(([r]) => r.arguments.action)).toEqual([
		"url",
		"snapshot",
		"url",
	]);
});

it("moves one observed slider step to Pro and independently verifies it before returning", async () => {
	const f = await fixture(3);
	expect(await f.frontend.configure(f.route.id, "pro")).toMatchObject({
		ok: true,
		verified: true,
		effort: "pro",
		liveVerified: false,
	});
	expect(f.callTool.mock.calls.slice(1).map(([r]) => r.arguments.action)).toEqual([
		"url",
		"snapshot",
		"url",
		"press",
		"url",
		"snapshot",
		"url",
	]);
	const input = f.callTool.mock.calls.find(([r]) => r.arguments.action === "press")?.[0];
	expect(input?.arguments.params).toEqual({ selector: "@e4", key: "ArrowRight" });
	expect(await f.frontend.inspect(f.route.id)).toMatchObject({ effort: "pro" });
});

it.each(shared.cases)("decodes the pinned privacy-r2 projection: $name", (c) => {
	expect(nativeSnapshotSchema.parse({ snapshot: "", refs: c.expectedRefs }).refs).toEqual(
		c.expectedRefs,
	);
});

it.each([
	{ value: Number.NaN },
	{ value: Number.POSITIVE_INFINITY },
	{ value: "4" },
	{ value: 5 },
	{ minimum: 5 },
	{ maximum: -1 },
	{ disabled: "false" },
	{ schemaVersion: "future" },
	{ secret: "not-allowed" },
])("rejects malformed AX projection %j", (patch) => {
	const p = snapshot();
	Object.assign(p.refs.e4.ax, patch);
	expect(nativeSnapshotSchema.safeParse(p).success).toBe(false);
});

it.each([
	"textbox",
	"searchbox",
	"combobox",
	"spinbutton",
	"button",
])("never accepts slider value fields on %s", (role) => {
	const p = snapshot();
	p.refs.e4.role = role;
	expect(nativeSnapshotSchema.safeParse(p).success).toBe(false);
});

it.each([
	"absent",
	"disabled",
	"unknownEnabled",
	"wrongLabel",
	"wrongRange",
	"fraction",
	"duplicate",
	"wrongRole",
	"unrelated",
	"busy",
	"draft",
])("refuses %s evidence without input and stays held", async (change) => {
	const f = await fixture(3, (data, args) => {
		if (args.action !== "snapshot") return;
		const p = data.result,
			a = p.refs.e4.ax;
		if (!a) throw new Error("synthetic fixture missing AX facts");
		if (change === "absent") delete p.refs.e4.ax;
		if (change === "disabled") a.disabled = true;
		if (change === "unknownEnabled") delete a.disabled;
		if (change === "wrongLabel") a.valueText = "Pro";
		if (change === "wrongRange") a.maximum = 5;
		if (change === "fraction") a.value = 3.5;
		if (change === "duplicate") p.refs.e5 = structuredClone(p.refs.e4);
		if (change === "wrongRole") p.refs.e4.role = "textbox";
		if (change === "unrelated") p.refs.e4.name = "Volume";
		if (change === "busy") p.refs.e5 = { role: "button", name: "Stop generating" };
		if (change === "draft") p.snapshot = p.snapshot.replace("[ref=e3]", "[ref=e3]: saved draft");
	});
	await expect(f.frontend.configure(f.route.id)).rejects.toBeDefined();
	const count = f.callTool.mock.calls.length;
	await expect(f.frontend.configure(f.route.id)).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(f.callTool).toHaveBeenCalledTimes(count);
	expect(
		f.callTool.mock.calls.some(([r]) => ["click", "press", "fill"].includes(r.arguments.action)),
	).toBe(false);
});

it.each([
	"url",
	"model",
	"target",
	"custody",
	"operation",
	"stored",
	"unchanged",
	"label",
	"ack",
])("holds %s drift after input without replay", async (change) => {
	let acted = false;
	const f = await fixture(3, (d, a) => {
		if (a.action === "press") {
			acted = true;
			if (change === "ack") d.result.pressed = "true";
		}
		if (!acted) return;
		if (a.action === "url" && change === "url") d.result.url = "https://chatgpt.com/c/other";
		if (a.action !== "snapshot") return;
		if (change === "model") d.result.refs.e1.name = "Different model";
		if (change === "target") d.targetObservation.targetId = "foreign";
		if (change === "custody") d.identity.custodyDigest = "c".repeat(64);
		if (change === "operation") d.operation.operationKey = "old-snapshot-key";
		if (change === "stored") d.identityFreshness = "stored_completion";
		if (change === "unchanged") d.result = snapshot(3);
		if (change === "label") {
			const a = d.result.refs.e4.ax;
			if (!a) throw new Error("synthetic fixture missing AX facts");
			a.valueText = "Medium";
		}
	});
	await expect(f.frontend.configure(f.route.id)).rejects.toBeDefined();
	const count = f.callTool.mock.calls.length;
	await expect(f.frontend.configure(f.route.id)).rejects.toMatchObject({
		code: "consumer_readback_required",
	});
	expect(f.callTool).toHaveBeenCalledTimes(count);
	expect(f.callTool.mock.calls.filter(([r]) => r.arguments.action === "press")).toHaveLength(1);
});

it("uses each newly observed ref, never a ref cached across slider observations", async () => {
	let count = 0;
	const f = await fixture(2, (d, a) => {
		if (a.action === "snapshot" && ++count > 1) {
			d.result.refs.e9 = d.result.refs.e4;
			delete d.result.refs.e4;
		}
	});
	await f.frontend.configure(f.route.id);
	expect(
		f.callTool.mock.calls
			.filter(([r]) => r.arguments.action === "press")
			.map(([r]) => r.arguments.params.selector),
	).toEqual(["@e4", "@e9"]);
});

it("opens only the observed enabled model picker and then uses the slider", async () => {
	let opened = false;
	const f = await fixture(3, (d, a) => {
		if (a.action === "click") opened = true;
		if (a.action === "snapshot" && !opened) {
			delete d.result.refs.e4;
			d.result.snapshot = d.result.snapshot.split("\n").slice(0, 3).join("\n");
		}
	});
	await f.frontend.configure(f.route.id);
	expect(
		f.callTool.mock.calls
			.filter(([r]) => r.arguments.action === "click")
			.map(([r]) => r.arguments.params),
	).toEqual([{ selector: "@e1" }]);
});

it("reserves remaining reads before input; it never moves a control it cannot verify", async () => {
	const f = await fixture(3);
	for (let i = 0; i < 12; i++) await f.session.read("url", {}, `budget-url-${i}`);
	await expect(f.frontend.configure(f.route.id)).rejects.toMatchObject({
		code: "consumer_budget_exhausted",
	});
	expect(f.callTool.mock.calls.some(([r]) => r.arguments.action === "press")).toBe(false);
});

it("composes with the durable Pro-only journal and its extra independent inspection", async () => {
	const f = await fixture(3);
	const store = new RelayStore(join(f.directory, "preparation"), "fixture-owner");
	const input = {
		store,
		operationId: "fixture-pro-operation",
		route: f.route,
		frontend: f.frontend,
	};
	expect(await prepareRelayProOnly(input)).toMatchObject({
		state: "verified",
		preparationOnly: true,
	});
	const count = f.callTool.mock.calls.length;
	await prepareRelayProOnly(input);
	expect(f.callTool).toHaveBeenCalledTimes(count);
	expect(f.callTool.mock.calls.slice(-3).map(([r]) => r.arguments.action)).toEqual([
		"url",
		"snapshot",
		"url",
	]);
	expect(f.callTool.mock.calls.some(([r]) => ["fill"].includes(r.arguments.action))).toBe(false);
});

it("prepares closed-picker Instant through Pro with carried80 and no draft or Send", async () => {
	let opened = false;
	const f = await fixture(
		0,
		(d, a) => {
			if (a.action === "click") opened = true;
			if (a.action === "snapshot" && !opened) {
				delete d.result.refs.e4;
				d.result.snapshot = d.result.snapshot.split("\n").slice(0, 3).join("\n");
			}
		},
		true,
	);
	const input = {
		store: new RelayStore(join(f.directory, "preparation"), "fixture-owner"),
		operationId: "fixture-full-pro-operation",
		route: f.route,
		frontend: f.frontend,
	};
	expect(await prepareRelayProOnly(input)).toMatchObject({
		state: "verified",
		preparationOnly: true,
	});
	const actions = f.callTool.mock.calls.slice(1).map(([r]) => r.arguments.action);
	expect(actions.filter((a) => ["url", "snapshot"].includes(a))).toHaveLength(21);
	expect(actions.filter((a) => a === "press")).toHaveLength(4);
	expect(actions.filter((a) => a === "click")).toHaveLength(1);
	expect(actions.slice(-3)).toEqual(["url", "snapshot", "url"]);
	expect(actions).not.toContain("fill");
	const calls = f.callTool.mock.calls.length;
	await prepareRelayProOnly(input);
	expect(f.callTool).toHaveBeenCalledTimes(calls);
});
