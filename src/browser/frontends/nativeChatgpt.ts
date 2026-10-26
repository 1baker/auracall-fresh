import { createHash, randomUUID } from "node:crypto";
import { interpretChatgptPowerSlider } from "../actions/chatgptPowerSlider.js";
import { nativeSnapshotSchema as snapshotSchema } from "./nativeAx.js";
import type { NativeConsumerSession } from "./nativeConsumer.js";
import {
	type FrontendRequestRecord,
	FrontendRequestStore,
	frontendRouteBinding,
	frontendTargetKey,
	requestIdSchema,
} from "./requestStore.js";
import { validateFrontendBinding } from "./route.js";
import { FrontendError, type NativeTaskFrontendRoute } from "./types.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function reject(code: string): never {
	throw new FrontendError(
		code,
		"The native ChatGPT evidence is incomplete; no automatic input or replay.",
	);
}

function withoutRefs(line: string): string {
	let result = "",
		quoted = false,
		escaped = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			result += c;
			if (escaped) escaped = false;
			else if (c === "\\") escaped = true;
			else if (c === '"') quoted = false;
			continue;
		}
		if (c === '"') quoted = true;
		if (c === "[") {
			const end = line.indexOf("]", i);
			if (end < 0) return reject("native_snapshot_unsupported");
			const attrs = line
				.slice(i + 1, end)
				.split(", ")
				.filter((p) => !p.startsWith("ref="));
			if (attrs.length) result += `[${attrs.join(", ")}]`;
			else result = result.replace(/ $/, "");
			i = end;
			continue;
		}
		result += c;
	}
	return result;
}

/** The full native AX tree supplies structure; gettext supplies exact answer text. */
function page(raw: Record<string, unknown>, model: string) {
	const parsed = snapshotSchema.safeParse(raw);
	if (!parsed.success) return reject("native_snapshot_unsupported");
	const { snapshot, refs } = parsed.data;
	const entries = Object.entries(refs);
	const find = (role: string, name: string) =>
		entries.filter(([, v]) => v.role === role && v.name === name);
	if (
		find("button", model).length !== 1 ||
		find("button", "Open profile menu").length !== 1 ||
		entries.some(
			([, v]) => v.role === "button" && /^(Log in|Sign up|Verify you are human)$/.test(v.name),
		)
	)
		return reject("native_model_or_account_unqualified");
	const composer = find("textbox", "Ask anything");
	if (composer.length !== 1) return reject("composer_unavailable");
	const lines = snapshot.split("\n");
	const escaped = composer[0][0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const matches = lines
		.map((line, i) => ({ line, i }))
		.filter(({ line }) =>
			new RegExp(`^\\s*- textbox .*\\[[^\\]]*ref=${escaped}(?:,|\\])`).test(line),
		);
	if (matches.length !== 1 || matches[0].line.includes("disabled"))
		return reject("composer_unavailable");
	const start = matches[0];
	const depth = start.line.match(/^ */)?.[0].length ?? 0;
	const children: string[] = [];
	for (let n = start.i + 1; n < lines.length && lines[n].trim(); n++) {
		if ((lines[n].match(/^ */)?.[0].length ?? 0) <= depth) break;
		children.push(lines[n]);
	}
	const composerEmpty =
		!/\]:/.test(start.line) && children.every((line) => /^\s*- (paragraph|generic)\s*$/.test(line));
	const articles: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*- article(?:\s|:|$)/.test(lines[i])) continue;
		const indent = lines[i].match(/^ */)?.[0].length ?? 0;
		const block = [lines[i]];
		for (let n = i + 1; n < lines.length && lines[n].trim(); n++) {
			if ((lines[n].match(/^ */)?.[0].length ?? 0) <= indent) break;
			block.push(lines[n]);
		}
		const text = block.join("\n");
		const roles = [...text.matchAll(/- heading "(You said:|ChatGPT said:)"/g)].map((m) => m[1]);
		if (roles.length !== 1 || roles[0] !== (articles.length % 2 ? "ChatGPT said:" : "You said:"))
			return reject("native_transcript_unsupported");
		articles.push(hash(block.map(withoutRefs).join("\n")));
	}
	if (articles.length > 200) return reject("native_transcript_unsupported");
	const generating = entries.some(
		([, v]) => v.role === "button" && /^(Stop generating|Stop streaming|Answer now)$/.test(v.name),
	);
	return { articles, composerEmpty, generating, refs };
}

/** Narrow semantic recipe; unknown site variants require qualification, not guessing. */
function intelligence(refs: ReturnType<typeof page>["refs"]) {
	const sliders = Object.entries(refs).filter(([, r]) => r.role === "slider");
	if (sliders.length !== 1) return null;
	const [ref, slider] = sliders[0];
	const a = slider.ax;
	if (
		!/^e[1-9][0-9]*$/.test(ref) ||
		!/^(Intelligence|Thinking effort)$/i.test(slider.name.trim()) ||
		!a ||
		a.disabled !== false ||
		a.minimum !== 0 ||
		a.maximum !== 4 ||
		!Number.isInteger(a.value)
	)
		return null;
	const effort = interpretChatgptPowerSlider(a.value, a.valueText);
	return effort ? { ref, value: a.value as number, effort } : null;
}

/** Existing frontend MCP tools, using closed native actions rather than DOM scripts. */
export class NativeChatgptFrontend {
	private readonly store = new FrontendRequestStore();
	private configuring = false;
	constructor(
		private readonly session: NativeConsumerSession | null,
		private readonly route: NativeTaskFrontendRoute,
		private readonly now = Date.now,
	) {
		validateFrontendBinding(route);
		if (
			route.provider !== "chatgpt" ||
			!/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(route.expectedUrl)
		)
			reject("native_conversation_required");
	}
	private check(id: string) {
		if (id !== this.route.id) reject("route_missing");
		if (this.configuring) reject("native_configuration_in_progress");
	}
	private native() {
		if (
			!this.session ||
			Object.entries(this.session.binding).some(
				([k, v]) => this.route.nativeTask[k as keyof typeof this.route.nativeTask] !== v,
			)
		)
			return reject("consumer_binding_mismatch");
		return this.session;
	}
	private async read(action: "url" | "snapshot" | "gettext", params: Record<string, unknown> = {}) {
		return this.native().read(action, params, `read_${randomUUID()}`);
	}
	private async url() {
		if ((await this.read("url")).url !== this.route.expectedUrl) reject("origin_mismatch");
	}
	private async snapshot() {
		return page(
			await this.read("snapshot", { compact: false, interactive: false }),
			this.route.expectedModel,
		);
	}
	private async observation() {
		await this.url();
		const p = await this.snapshot();
		await this.url();
		return p;
	}
	private async text(selector: string) {
		const r = await this.read("gettext", { selector });
		if (Object.keys(r).length !== 1 || typeof r.text !== "string" || r.text.length > 64000)
			return reject("native_text_incomplete");
		return r.text;
	}
	private receipt(r: FrontendRequestRecord) {
		return {
			ok: true,
			requestId: r.requestId,
			routeId: r.routeId,
			previousRequestId: r.previousRequestId,
			conversationUrl: r.conversationUrl,
			status: r.status,
			output: r.output,
			code: r.code,
			identityKind: "native_snapshot_sequence",
			userMessageId: null,
			assistantMessageId: null,
			observedUserKey: r.observedUserKey ?? null,
			observedAssistantKey: r.observedAssistantKey ?? null,
			generationSignal: r.status === "completed" ? "two_stable_native_observations" : "unverified",
			intelligence: "unverified",
			liveVerified: false,
		};
	}
	private bound(r: FrontendRequestRecord) {
		if (
			r.routeId !== this.route.id ||
			r.binding !== frontendRouteBinding(this.route) ||
			r.targetKey !== frontendTargetKey(this.route) ||
			r.conversationUrl !== this.route.expectedUrl
		)
			reject("binding_mismatch");
	}
	async inspect(routeId: string) {
		this.check(routeId);
		const p = await this.observation();
		const observed = intelligence(p.refs);
		return {
			ok: true,
			provider: "chatgpt",
			url: this.route.expectedUrl,
			model: this.route.expectedModel,
			intelligence: observed ? "native_ax_observation" : "unverified",
			effort: observed?.effort,
			composerEmpty: p.composerEmpty,
			generating: p.generating,
			liveVerified: false,
		};
	}
	async configure(routeId: string, effort: string = "pro") {
		this.check(routeId);
		if (effort !== "pro") return reject("native_intelligence_unsupported");
		this.configuring = true;
		try {
			let p = await this.observation();
			const ready = () => {
				if (!p.composerEmpty || p.generating) reject("native_configuration_busy");
			};
			ready();
			if (!Object.values(p.refs).some((r) => r.role === "slider")) {
				const buttons = Object.entries(p.refs).filter(
					([, r]) => r.role === "button" && r.name === this.route.expectedModel,
				);
				if (buttons.length !== 1 || buttons[0][1].ax?.disabled !== false)
					reject("native_intelligence_unqualified");
				await this.native().control("click", buttons[0][0], `control_${randomUUID()}`);
				p = await this.observation();
				ready();
			}
			let observed = intelligence(p.refs);
			if (!observed) return reject("native_intelligence_unqualified");
			while (observed.effort !== "pro") {
				const previous = observed.value;
				await this.native().control("press", observed.ref, `control_${randomUUID()}`);
				// ACK is only input; observe a new correlated snapshot on the same target.
				p = await this.observation();
				ready();
				observed = intelligence(p.refs);
				if (!observed || observed.value !== previous + 1)
					reject("native_intelligence_readback_mismatch");
			}
			return {
				ok: true,
				verified: true,
				provider: "chatgpt",
				routeId,
				url: this.route.expectedUrl,
				model: this.route.expectedModel,
				effort: "pro",
				intelligence: "native_ax_observation",
				liveVerified: false,
			};
		} catch (error) {
			this.native().hold();
			throw error;
		} finally {
			this.configuring = false;
		}
	}
	async send(
		routeId: string,
		requestId: string,
		text: string,
		previousRequestId?: string,
	): Promise<Record<string, unknown>> {
		this.check(routeId);
		if (
			!requestIdSchema.safeParse(requestId).success ||
			!text.trim() ||
			text.length > 8192 ||
			(previousRequestId !== undefined && !requestIdSchema.safeParse(previousRequestId).success)
		)
			reject("invalid_request");
		const existing = await this.store.read(requestId);
		if (existing) {
			this.bound(existing);
			if (existing.text !== text || existing.previousRequestId !== (previousRequestId ?? null))
				reject("request_conflict");
			return this.receipt(existing);
		}
		return this.store.withLock(frontendTargetKey(this.route), requestId, async () => {
			const concurrent = await this.store.read(requestId);
			if (concurrent) {
				this.bound(concurrent);
				if (
					concurrent.text !== text ||
					concurrent.previousRequestId !== (previousRequestId ?? null)
				)
					reject("request_conflict");
				return this.receipt(concurrent);
			}
			if (await this.store.unresolved(frontendTargetKey(this.route))) reject("request_unresolved");
			let prior: FrontendRequestRecord | null = null;
			if (previousRequestId) {
				prior = await this.store.read(previousRequestId);
				if (!prior) reject("previous_missing");
				this.bound(prior);
				if (prior.status !== "completed") reject("continuity_mismatch");
			}
			await this.url();
			const p = await this.snapshot();
			// AX omits a value equal to its accessible name. Exact gettext is also required.
			if (
				!p.composerEmpty ||
				p.generating ||
				p.articles.length % 2 ||
				(await this.text("#prompt-textarea")) !== ""
			)
				reject("composer_busy");
			if (
				prior &&
				JSON.stringify(p.articles) !==
					JSON.stringify([...prior.baseline, prior.observedUserKey, prior.observedAssistantKey])
			)
				reject("continuity_mismatch");
			const r: FrontendRequestRecord = {
				version: 1,
				requestId,
				routeId,
				binding: frontendRouteBinding(this.route),
				targetKey: frontendTargetKey(this.route),
				text,
				previousRequestId: previousRequestId ?? null,
				conversationUrl: this.route.expectedUrl,
				status: "prepared",
				baseline: p.articles,
				userMessageId: null,
				assistantMessageId: null,
				output: null,
				code: null,
				identityKind: "derived_sequence",
				candidate: null,
			};
			await this.store.write(r, true);
			try {
				if (
					(await this.native().fill(text, `fill_${hash(requestId)}`)).filled !== true ||
					(await this.text("#prompt-textarea")) !== text
				)
					reject("composer_mismatch");
				await this.url();
			} catch {
				r.status = "failed_presend";
				r.code = "presend_unconfirmed";
				await this.store.write(r);
				return this.receipt(r);
			}
			r.status = "sending";
			await this.store.write(r);
			try {
				if ((await this.native().send(`send_${hash(requestId)}`)).clicked !== true)
					reject("send_unconfirmed");
				r.status = "sent";
			} catch {
				r.status = "uncertain";
				r.code = "send_unconfirmed";
			}
			await this.store.write(r);
			return this.receipt(r);
		});
	}
	async status(routeId: string, requestId: string): Promise<Record<string, unknown>> {
		this.check(routeId);
		const saved = await this.store.read(requestId);
		if (!saved) return reject("request_missing");
		this.bound(saved);
		if (["completed", "failed_presend"].includes(saved.status)) return this.receipt(saved);
		return this.store.withLock(frontendTargetKey(this.route), requestId, async () => {
			const r = await this.store.read(requestId);
			if (!r) return reject("request_missing");
			this.bound(r);
			if (r.status === "completed") return this.receipt(r);
			if (r.status === "prepared") {
				r.status = "failed_presend";
				r.code = "presend_interrupted";
				await this.store.write(r);
				return this.receipt(r);
			}
			await this.url();
			const p = await this.snapshot();
			const fresh = p.articles.slice(r.baseline.length);
			if (
				JSON.stringify(p.articles.slice(0, r.baseline.length)) !== JSON.stringify(r.baseline) ||
				fresh.length > 2
			)
				reject("continuity_mismatch");
			if (
				fresh.length !== 2 ||
				!p.composerEmpty ||
				p.generating ||
				(await this.text("#prompt-textarea")) !== ""
			) {
				r.candidate = null;
				await this.store.write(r);
				return this.receipt(r);
			}
			const user = `article[data-testid="conversation-turn-${r.baseline.length}"] [data-message-author-role="user"]`;
			const assistant = `article[data-testid="conversation-turn-${r.baseline.length + 1}"] [data-message-author-role="assistant"]`;
			if (!r.candidate && (await this.text(user)) !== r.text) reject("continuity_mismatch");
			const answer = await this.text(assistant);
			if (!answer.trim()) {
				r.candidate = null;
				await this.store.write(r);
				return this.receipt(r);
			}
			const candidate = hash([fresh, answer]);
			if (r.candidate?.key !== candidate) {
				// Never skip fresh prompt correlation after a changed second observation.
				if (r.candidate) {
					r.candidate = null;
					await this.store.write(r);
					return this.receipt(r);
				}
				r.candidate = { key: candidate, at: this.now() };
				await this.store.write(r);
				return this.receipt(r);
			}
			if (this.now() - r.candidate.at < 1000) return this.receipt(r);
			r.status = "completed";
			r.output = answer;
			r.observedUserKey = fresh[0];
			r.observedAssistantKey = fresh[1];
			r.candidate = null;
			r.code = null;
			await this.store.write(r);
			return this.receipt(r);
		});
	}
}
