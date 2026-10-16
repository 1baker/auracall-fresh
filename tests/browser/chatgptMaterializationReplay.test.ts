import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { JsonCacheStore } from "../../src/browser/llmService/cache/store.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import type {
	LlmServiceAdapter,
	PromptInput,
	PromptResult,
} from "../../src/browser/llmService/types.js";
import type { ProviderCacheContext } from "../../src/browser/providers/cache.js";
import {
	materializeChatgptConversationArtifactWithClientForTest,
	normalizeChatgptConversationDownloadArtifactProbes,
	readVisibleChatgptDownloadArtifactProbesWithClientForTest,
} from "../../src/browser/providers/chatgptAdapter.js";
import type { ConversationArtifact } from "../../src/browser/providers/domain.js";
import { createBrowserScrapeTelemetryRecorder } from "../../src/browser/providers/scrapeTelemetry.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";
import { createHistoryMaterializationTrafficOptions } from "../../src/runtime/historyMaterializationService.js";

// Actual product evaluation and transfer logic with an isolated CDP transport.
class ReplayService extends LlmService {
	constructor(
		provider: LlmServiceAdapter,
		private readonly context: ProviderCacheContext,
	) {
		super({ browser: { cache: {} } } as ResolvedUserConfig, provider, {} as never, {
			cacheStore: new JsonCacheStore(),
		});
	}
	override async buildListOptions(options: BrowserProviderListOptions = {}) {
		return { ...options };
	}
	override async resolveCacheContext() {
		return this.context;
	}
	protected override getProviderGuardSettings() {
		return null;
	}
	async listProjects() {
		return [];
	}
	async listConversations() {
		return [];
	}
	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("No prompts in replay");
	}
	async renameConversation() {}
	async deleteConversation() {}
	async getUserIdentity() {
		return null;
	}
}

const conversationId = "6ab6d340-89e4-83ea-9990-d8fb278993e6";
const fileName = "Bailey_FY27_Proposal_With_Figures.zip";
// Empty ZIP: synthetic bytes, not the private proposal content.
const zip = Buffer.from("504b0506000000000000000000000000000000000000", "hex");

test.each([
	"clean",
	"resource-row",
	"unavailable404",
	"unavailable410",
	"neighbor404",
	"neighbor-conversation404",
	"stale",
	"collision",
	"mismatch",
	"ambiguous",
	"regenerate",
	"failed-turn",
])("recorded ZIP product replay: %s", async (scenario) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-materialization-replay-"));
	setAuracallHomeDirOverrideForTest(home);
	let downloadDir = "";
	const inputs: string[] = [];
	let requestListener:
		| ((event: { requestId: string; request: { url: string } }) => void)
		| undefined;
	let responseListener:
		| ((event: { requestId: string; response: { url: string; status: number } }) => void)
		| undefined;
	const runtimeWindow: Record<string, unknown> = { open: () => undefined };
	class FixtureElement {
		readonly attributes = new Map<string, string>();
		readonly textContent: string;
		constructor(
			readonly role: "root" | "control" | "regenerate" | "row-download" | "resource-row",
		) {
			this.textContent = role === "control" ? fileName : "fixture response";
			if (role === "root")
				this.attributes.set("data-content-search-unit-key", "fallback-turn-4:2:assistant");
			else
				this.attributes.set(
					"aria-label",
					role === "regenerate"
						? scenario === "failed-turn"
							? "Retry"
							: "Regenerate response"
						: role === "row-download"
							? "Download file"
							: scenario === "resource-row"
								? `Open preview of ${fileName}`
								: `Download ${fileName}`,
				);
		}
		getAttribute(name: string) {
			return this.attributes.get(name) ?? null;
		}
		setAttribute(name: string, value: string) {
			this.attributes.set(name, value);
		}
		removeAttribute(name: string) {
			this.attributes.delete(name);
		}
		getBoundingClientRect() {
			return { left: this.role === "row-download" ? 210 : 10, top: 20, width: 100, height: 30 };
		}
		getClientRects() {
			return [this.getBoundingClientRect()];
		}
		scrollIntoView() {}
		closest(selector?: string) {
			if (
				scenario === "resource-row" &&
				this.role === "control" &&
				selector === '[class~="group/resource-row"]'
			)
				return resourceRow;
			return this.role === "regenerate" ? root : null;
		}
		querySelector() {
			return null;
		}
		querySelectorAll(selector: string) {
			if (this.role === "resource-row" && selector === 'button[aria-label="Download file"]')
				return [rowDownload];
			return this.role === "root" && selector.includes("Open preview of") ? [control] : [];
		}
	}
	class FixtureAnchor extends FixtureElement {
		click() {}
	}
	const root = new FixtureElement("root");
	const control = new FixtureElement("control");
	const regenerate = new FixtureElement("regenerate");
	const rowDownload = new FixtureElement("row-download");
	const resourceRow = new FixtureElement("resource-row");
	const document = {
		documentElement: root,
		querySelectorAll(selector: string) {
			if (
				(scenario === "regenerate" || scenario === "failed-turn") &&
				selector === 'button, [role="button"]'
			)
				return [regenerate];
			if (selector.includes("data-content-search-unit-key")) return [root];
			if (
				selector.includes("data-auracall-chatgpt-download-button") &&
				(control.getAttribute("data-auracall-chatgpt-download-button") ||
					rowDownload.getAttribute("data-auracall-chatgpt-download-button"))
			)
				return [
					rowDownload.getAttribute("data-auracall-chatgpt-download-button") ? rowDownload : control,
				];
			return [];
		},
		querySelector(selector: string) {
			return this.querySelectorAll(selector)[0] ?? null;
		},
	};
	const context = {
		document,
		window: runtimeWindow,
		// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
		Element: FixtureElement,
		// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
		HTMLElement: FixtureElement,
		// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
		HTMLAnchorElement: FixtureAnchor,
		location: { pathname: `/c/${conversationId}`, href: `https://chatgpt.com/c/${conversationId}` },
		setTimeout,
		clearTimeout,
		getComputedStyle: () => ({ display: "block", visibility: "visible" }),
	};
	const evaluate = async ({ expression }: { expression: string }) => ({
		result: { value: await runInNewContext(expression, context) },
	});
	const client = {
		// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
		Runtime: { evaluate },
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		Network: {
			enable: async () => undefined,
			requestWillBeSent: (listener: typeof requestListener) => {
				requestListener = listener;
				return () => {
					requestListener = undefined;
				};
			},
			responseReceived: (listener: typeof responseListener) => {
				responseListener = listener;
				return () => {
					responseListener = undefined;
				};
			},
		},
		send: async (method: string, params: { downloadPath: string }) => {
			expect(method).toBe("Browser.setDownloadBehavior");
			downloadDir = params.downloadPath;
			if (scenario === "stale")
				await writeFile(path.join(downloadDir, "A-stale.txt"), "old unrelated file");
		},
		// biome-ignore lint/style/useNamingConvention: Browser and CDP names are protocol-defined.
		Input: {
			dispatchMouseEvent: async ({ type, x }: { type: string; x: number }) => {
				inputs.push(type);
				if (type === "mouseReleased") {
					if (
						scenario === "unavailable404" ||
						scenario === "unavailable410" ||
						scenario === "neighbor404" ||
						scenario === "neighbor-conversation404"
					) {
						const url = `https://chatgpt.com/backend-api/conversation/${scenario === "neighbor-conversation404" ? "other-conversation" : conversationId}/interpreter/download?sandbox_path=${encodeURIComponent(`/mnt/data/${scenario === "neighbor404" ? "Neighbor.zip" : fileName}`)}`;
						requestListener?.({ requestId: "download-request", request: { url } });
						responseListener?.({
							requestId: "download-request",
							response: { url, status: scenario === "unavailable410" ? 410 : 404 },
						});
						if (!scenario.startsWith("neighbor")) return;
					}
					if (scenario === "resource-row") expect(x).toBe(260);
					const name =
						scenario === "collision"
							? fileName.replace(".zip", " (1).zip")
							: scenario === "failed-turn"
								? "retry"
								: scenario === "mismatch"
									? "Neighbor.zip"
									: fileName;
					await writeFile(path.join(downloadDir, name), zip);
					if (scenario === "ambiguous")
						await writeFile(path.join(downloadDir, "Neighbor.zip"), zip);
					runtimeWindow.__auracallChatgptDownloadCapture = { href: "", download: fileName };
				}
			},
		},
	};
	try {
		const telemetry = createBrowserScrapeTelemetryRecorder();
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			readConversationContext: async (
				_id: string,
				_projectId: string,
				options: BrowserProviderListOptions,
			) => ({
				provider: "chatgpt",
				conversationId,
				messages: [{ role: "assistant", text: "fixture response" }],
				artifacts: normalizeChatgptConversationDownloadArtifactProbes(
					await readVisibleChatgptDownloadArtifactProbesWithClientForTest(client as never, options),
				),
			}),
			materializeConversationArtifact: (
				id: string,
				artifact: ConversationArtifact,
				dest: string,
				projectId: string,
				options: BrowserProviderListOptions,
			) =>
				materializeChatgptConversationArtifactWithClientForTest(
					client as never,
					id,
					artifact,
					dest,
					projectId,
					undefined,
					options,
				),
		} as unknown as LlmServiceAdapter;
		const service = new ReplayService(provider, {
			provider: "chatgpt",
			identityKey: "local-fixture@example.invalid",
			userConfig: {} as never,
			listOptions: {},
		});
		const result = await service.materializeConversationArtifacts(conversationId, {
			refresh: true,
			maxItems: 1,
			listOptions: {
				...createHistoryMaterializationTrafficOptions(conversationId, 1),
				allowNavigation: false,
				scrapeTelemetry: telemetry,
			},
		});
		expect(result.artifacts).toMatchObject([{ title: fileName, kind: "download" }]);
		if (scenario === "unavailable404" || scenario === "unavailable410") {
			expect(result.files).toHaveLength(0);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8"));
			expect(manifest.entries).toMatchObject([
				{
					status: "error",
					failureKind: "provider_unavailable",
					retryable: false,
					error: expect.stringContaining(`HTTP ${scenario === "unavailable410" ? "410" : "404"}`),
				},
			]);
			expect(telemetry.downloads).toEqual({ attempted: 1, succeeded: 0, failed: 1 });
			expect(responseListener).toBeUndefined();
			expect(requestListener).toBeUndefined();
			expect(inputs).toEqual(["mouseMoved", "mousePressed", "mouseReleased"]);
			return;
		}
		if (scenario === "mismatch" || scenario === "ambiguous" || scenario === "failed-turn") {
			expect(result.files).toHaveLength(0);
			const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8"));
			expect(manifest.materializedCount).toBe(0);
			expect(manifest.entries).toMatchObject([
				{
					status: "error",
					error: expect.stringContaining(
						scenario === "failed-turn"
							? "retry"
							: scenario === "mismatch"
								? "chatgpt_artifact_download_identity_mismatch"
								: "chatgpt_artifact_download_ambiguous",
					),
				},
			]);
			expect(inputs).toEqual(
				scenario === "failed-turn" ? [] : ["mouseMoved", "mousePressed", "mouseReleased"],
			);
			expect(telemetry.cdpCalls["Page.reload"] ?? 0).toBe(0);
			expect(telemetry.cdpCalls["Page.navigate"] ?? 0).toBe(0);
			return;
		}
		const expectedName = scenario === "collision" ? fileName.replace(".zip", " (1).zip") : fileName;
		expect(result.files).toHaveLength(1);
		expect(result.files[0]).toMatchObject({
			name: expectedName,
			size: zip.length,
			mimeType: "application/zip",
		});
		expect(await readFile(result.files[0]?.localPath as string)).toEqual(zip);
		const manifest = JSON.parse(await readFile(result.manifestPath as string, "utf8"));
		expect(manifest.materializedCount).toBe(1);
		expect(manifest.entries).toMatchObject([{ status: "materialized", fileName: expectedName }]);
		expect(inputs).toEqual(["mouseMoved", "mousePressed", "mouseReleased"]);
		expect(telemetry.cdpCalls["Page.navigate"] ?? 0).toBe(0);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
