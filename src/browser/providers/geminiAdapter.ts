import * as fs from "node:fs/promises";
import path from "node:path";
import CDP from "../cdp.js";
import type { Page } from "puppeteer-core";
import type { BrowserToolsUiListResult } from "../../../packages/browser-service/src/browserTools.js";
import {
	connectToChromeTarget,
	openOrReuseChromeTarget,
} from "../../../packages/browser-service/src/chromeLifecycle.js";
import {
	type BrowserDomSearchMatch,
	type BrowserDomSearchOptions,
	buildBrowserDomSearchExpression,
} from "../../../packages/browser-service/src/service/domSearch.js";
import { beginBrowserMutation } from "../../../packages/browser-service/src/service/mutationDispatcher.js";
import {
	requireBundledServiceBaseUrl,
	requireBundledServiceCompatibleHosts,
	requireBundledServiceRouteTemplate,
	resolveBundledServiceComposerKnownLabels,
	resolveBundledServiceFeatureDetector,
	resolveBundledServiceFeatureFlagTokens,
} from "../../services/registry.js";
import { GeminiFeatureSchema } from "../llmService/providers/schema.js";
import {
	armDownloadCapture,
	navigateAndSettle,
	pressButton,
	setInputValue,
	submitInlineRename,
	waitForDownloadCapture,
	waitForPredicate,
} from "../service/ui.js";
import type { ChromeClient } from "../types.js";
import type {
	Conversation,
	ConversationArtifact,
	ConversationContext,
	ConversationMessage,
	FileRef,
	Project,
	ProjectMemoryMode,
} from "./domain.js";
import {
	buildGeminiActivityEvidenceExpression,
	coerceGeminiActivityEvidence,
	type GeminiActivityEvidence,
} from "./geminiEvidence.js";
import {
	assertProviderSessionAuthorization,
	recordProviderSessionProof,
} from "./providerSessionAuthority.js";
import {
	annotateClientMutationContext,
	resolveMutationAudit,
	resolveMutationSource,
	resolveProviderTrafficGovernor,
} from "./mutationAudit.js";
import { providerNavigationAllowed } from "./navigationPolicy.js";
import type {
	BrowserProvider,
	BrowserProviderListOptions,
	BrowserProviderPromptInput,
	BrowserProviderPromptProgressEvent,
	BrowserProviderPromptResult,
	ProviderUserIdentity,
} from "./types.js";

const GEMINI_BASE_URL = requireBundledServiceBaseUrl("gemini");
const GEMINI_APP_URL = requireBundledServiceRouteTemplate("gemini", "app");
const GEMINI_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts("gemini");
const GEMINI_GEMS_VIEW_URL = new URL("gems/view", GEMINI_BASE_URL).toString();
const GEMINI_GEM_CREATE_URL = new URL("gems/create", GEMINI_BASE_URL).toString();
const GOOGLE_SYSTEM_GEM_IDS = new Set(["chess-champ", "brainstormer", "storybook"]);
const GEMINI_FEATURE_DETECTOR = resolveBundledServiceFeatureDetector(
	"gemini",
	"gemini-feature-probe-v1",
);
const GEMINI_FEATURE_FLAG_TOKENS = resolveBundledServiceFeatureFlagTokens("gemini", {
	search: ["search"],
	grounding: ["grounding"],
	deep_research: ["deep research"],
	personal_intelligence: ["personal intelligence"],
});
const GEMINI_DISCOVERY_LABELS = resolveBundledServiceComposerKnownLabels("gemini", [
	"create image",
	"images",
	"create music",
	"music",
	"write anything",
	"create video",
	"videos",
	"help me learn",
	"guided learning",
	"canvas",
	"deep research",
	"personal intelligence",
]);
const GEMINI_TOOLS_BUTTON_SELECTORS = [
	"button.toolbox-drawer-button",
	"button.toolbox-drawer-button-with-label",
	'button[aria-haspopup="menu"] .toolbox-drawer-button-label-icon-text',
	'button[aria-haspopup="menu"] .toolbox-drawer-button-label-icon-only',
	'button[aria-label="Tools"] .toolbox-drawer-button-label-icon-only',
	'button[aria-haspopup="menu"]',
	'button[aria-label="Tools"]',
];
const GEMINI_TOOLS_DRAWER_ROW_SELECTORS = [
	'button.toolbox-drawer-item-list-button[role="menuitemcheckbox"]',
	'button[mat-list-item].toolbox-drawer-item-list-button[role="menuitemcheckbox"]',
	'button[role="menuitemcheckbox"]',
];
const GEMINI_PERSONAL_INTELLIGENCE_SELECTORS = [
	'button[role="switch"][aria-label="Personal Intelligence"]',
	'button[role="switch"][aria-label*="Personal Intelligence"]',
];
const GEMINI_MODE_PICKER_SELECTORS = [
	'button[data-test-id="bard-mode-menu-button"]',
	'button[aria-label="Open mode picker"]',
];
const GEMINI_NEW_CHAT_BUTTON_SELECTORS = [
	'button[data-test-id="new-chat-button"]',
	'button[aria-label="New chat"]',
];
const GEMINI_GEM_NAME_INPUT_SELECTOR = 'input[aria-label="Input for a Gem name"]';
const GEMINI_GEM_DESCRIPTION_INPUT_SELECTOR = 'textarea[data-test-id="description-input-field"]';
const GEMINI_GEM_INSTRUCTIONS_INPUT_SELECTOR = 'div[aria-label="Enter a prompt for Gemini"]';
const GEMINI_GEM_CREATE_BUTTON_SELECTOR = 'button[data-test-id="create-button"]';
const GEMINI_GEM_START_CHAT_BUTTON_SELECTOR = 'button[data-test-id="new-chat-button"]';
const GEMINI_GEM_KNOWLEDGE_UPLOAD_TRIGGER_SELECTOR =
	'button[aria-label*="upload file menu for gem knowledge" i]';
const GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR =
	'button[role="menuitem"][data-test-id="local-images-files-uploader-button"][aria-label*="Upload files" i]';
const _GEMINI_GEM_KNOWLEDGE_HIDDEN_UPLOAD_SELECTORS = [
	'button[data-test-id="hidden-local-image-upload-button"]',
	'button[data-test-id="hidden-local-file-upload-button"]',
];
const GEMINI_PROMPT_INPUT_SELECTORS = [
	'div[role="textbox"][aria-label="Enter a prompt for Gemini"]',
	'div[role="textbox"][contenteditable="true"]',
	'textarea[aria-label*="Gemini"]',
];
const GEMINI_SEND_BUTTON_SELECTORS = [
	'button[aria-label="Send message"]',
	'button[type="submit"][aria-label*="Send"]',
];
const GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR =
	'input[data-test-id="edit-title-input"][aria-label="Rename this chat"]';
const GEMINI_CONVERSATION_RENAME_SAVE_SELECTOR = 'button[data-test-id="save-button"]';

function resolvePortFromEnv(): number | undefined {
	const raw = process.env.AURACALL_BROWSER_PORT;
	if (!raw) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeWhitespace(value: string): string {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizePromptText(value: string): string {
	return String(value ?? "")
		.replace(/\r\n/g, "\n")
		.replace(/\u00a0/g, " ")
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.join("\n")
		.trim();
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeGeminiAssistantText(value: string): string {
	const normalized = normalizePromptText(value);
	return normalized
		.replace(/^(?:show thinking\s+)?gemini said(?:\s+|$)/i, "")
		.replace(
			/\s+(?:copy prompt|listen|show more options)(?:\s+(?:copy prompt|listen|show more options))*$/i,
			"",
		)
		.trim();
}

function sanitizeGeminiUserText(value: string): string {
	return normalizePromptText(value)
		.replace(/^you said\s+/i, "")
		.trim();
}

type GeminiFeatureProbe = {
	detector?: string | null;
	search?: boolean;
	grounding?: boolean;
	deep_research?: boolean;
	personal_intelligence?: boolean;
	signed_out?: boolean;
	modes?: string[] | null;
	disabled_modes?: string[] | null;
	toggles?: Record<string, boolean> | null;
	active_mode?: string | null;
};

type GeminiDomSearchResult = {
	totalScanned: number;
	matched: BrowserDomSearchMatch[];
};

function normalizeGeminiDiscoveryLabel(value: string | null | undefined): string {
	return normalizeWhitespace(value ?? "")
		.toLowerCase()
		.replace(/^[^\p{L}\p{N}]+/gu, "")
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/(?:\s+new)+$/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function geminiClassNameHasDisabledToolToken(value: string | null | undefined): boolean {
	const classTokens = new Set(
		normalizeWhitespace(value ?? "")
			.split(/\s+/)
			.filter(Boolean),
	);
	return classTokens.has("disabled") || classTokens.has("mdc-list-item--disabled");
}

export function normalizeGeminiFeatureSignature(
	probe: GeminiFeatureProbe | null | undefined,
): string | null {
	if (!probe || typeof probe !== "object") {
		return null;
	}
	const knownModes = new Set(
		GEMINI_DISCOVERY_LABELS.map((entry) => normalizeGeminiDiscoveryLabel(entry)).filter(Boolean),
	);
	const modes = Array.isArray(probe.modes)
		? Array.from(
				new Set(
					probe.modes
						.map((entry) => normalizeGeminiDiscoveryLabel(entry))
						.filter((entry) => Boolean(entry) && knownModes.has(entry)),
				),
			).sort()
		: [];
	const disabledModes = Array.isArray(probe.disabled_modes)
		? Array.from(
				new Set(
					probe.disabled_modes
						.map((entry) => normalizeGeminiDiscoveryLabel(entry))
						.filter((entry) => Boolean(entry) && knownModes.has(entry)),
				),
			).sort()
		: [];
	const toggles =
		probe.toggles && typeof probe.toggles === "object"
			? Object.fromEntries(
					Object.entries(probe.toggles)
						.map(([key, value]) => [normalizeGeminiDiscoveryLabel(key), Boolean(value)] as const)
						.filter(([key]) => key.length > 0)
						.sort(([left], [right]) => left.localeCompare(right)),
				)
			: undefined;
	const normalizedActiveMode = normalizeGeminiDiscoveryLabel(probe.active_mode ?? "");
	const normalized = {
		detector: normalizeWhitespace(probe.detector ?? "") || GEMINI_FEATURE_DETECTOR,
		search: typeof probe.search === "boolean" ? probe.search : undefined,
		grounding: typeof probe.grounding === "boolean" ? probe.grounding : undefined,
		deep_research: typeof probe.deep_research === "boolean" ? probe.deep_research : undefined,
		personal_intelligence:
			typeof probe.personal_intelligence === "boolean" ? probe.personal_intelligence : undefined,
		signed_out: typeof probe.signed_out === "boolean" ? probe.signed_out : undefined,
		modes,
		disabled_modes: disabledModes.length > 0 ? disabledModes : undefined,
		toggles: toggles && Object.keys(toggles).length > 0 ? toggles : undefined,
		active_mode:
			normalizedActiveMode && normalizedActiveMode !== "open mode picker"
				? normalizedActiveMode
				: undefined,
	};
	const parsed = GeminiFeatureSchema.safeParse(normalized);
	if (!parsed.success) {
		return null;
	}
	const hasAnySignal =
		normalized.search !== undefined ||
		normalized.grounding !== undefined ||
		normalized.deep_research !== undefined ||
		normalized.personal_intelligence !== undefined ||
		normalized.signed_out !== undefined ||
		normalized.modes.length > 0 ||
		disabledModes.length > 0 ||
		(normalized.toggles && Object.keys(normalized.toggles).length > 0) ||
		normalized.active_mode !== undefined;
	if (!hasAnySignal) {
		return null;
	}
	return JSON.stringify(normalized);
}

export function deriveGeminiFeatureProbeFromUiList(
	uiList: BrowserToolsUiListResult | null | undefined,
): GeminiFeatureProbe | null {
	if (!uiList) {
		return null;
	}
	const modes = Array.from(
		new Set(
			uiList.sections.menuItems
				.filter((item) => item.visible !== false)
				.map((item) => normalizeGeminiDiscoveryLabel(item.text ?? item.ariaLabel ?? null))
				.filter(Boolean),
		),
	).sort();
	const disabledModes = Array.from(
		new Set(
			uiList.sections.menuItems
				.filter((item) => item.visible !== false && item.disabled === true)
				.map((item) => normalizeGeminiDiscoveryLabel(item.text ?? item.ariaLabel ?? null))
				.filter(Boolean),
		),
	).sort();
	const signedOut = uiList.sections.links.some(
		(item) =>
			item.visible !== false &&
			normalizeGeminiDiscoveryLabel(item.text ?? item.ariaLabel ?? item.title ?? null) ===
				"sign in",
	);
	const toggles = Object.fromEntries(
		uiList.sections.switches
			.map((item) => {
				const label = normalizeGeminiDiscoveryLabel(item.ariaLabel ?? item.text ?? null);
				if (!label || typeof item.checked !== "boolean") {
					return null;
				}
				return [label, item.checked] as const;
			})
			.filter((entry): entry is readonly [string, boolean] => Boolean(entry))
			.sort(([left], [right]) => left.localeCompare(right)),
	);
	if (modes.length === 0 && Object.keys(toggles).length === 0) {
		return null;
	}
	return {
		detector: GEMINI_FEATURE_DETECTOR,
		deep_research: modes.includes("deep research"),
		personal_intelligence: Object.hasOwn(toggles, "personal intelligence")
			? Boolean(toggles["personal intelligence"])
			: undefined,
		signed_out: signedOut || undefined,
		modes,
		disabled_modes: disabledModes.length > 0 ? disabledModes : undefined,
		toggles,
		active_mode: null,
	};
}

export function mergeGeminiFeatureProbes(
	providerProbe: GeminiFeatureProbe | null | undefined,
	uiListProbe: GeminiFeatureProbe | null | undefined,
): GeminiFeatureProbe | null {
	if (!providerProbe && !uiListProbe) {
		return null;
	}
	const modes = Array.from(
		new Set(
			[...(providerProbe?.modes ?? []), ...(uiListProbe?.modes ?? [])]
				.map((entry) => normalizeGeminiDiscoveryLabel(entry))
				.filter(Boolean),
		),
	).sort();
	const disabledModes = Array.from(
		new Set(
			[...(providerProbe?.disabled_modes ?? []), ...(uiListProbe?.disabled_modes ?? [])]
				.map((entry) => normalizeGeminiDiscoveryLabel(entry))
				.filter(Boolean),
		),
	).sort();
	const toggles = Object.fromEntries(
		Object.entries({
			...(providerProbe?.toggles ?? {}),
			...(uiListProbe?.toggles ?? {}),
		})
			.map(([key, value]) => [normalizeGeminiDiscoveryLabel(key), Boolean(value)] as const)
			.filter(([key]) => key.length > 0)
			.sort(([left], [right]) => left.localeCompare(right)),
	);
	return {
		detector:
			normalizeWhitespace(providerProbe?.detector ?? uiListProbe?.detector ?? "") ||
			GEMINI_FEATURE_DETECTOR,
		search: providerProbe?.search,
		grounding: providerProbe?.grounding,
		deep_research:
			typeof uiListProbe?.deep_research === "boolean"
				? uiListProbe.deep_research
				: (providerProbe?.deep_research ?? modes.includes("deep research")),
		personal_intelligence: Object.hasOwn(toggles, "personal intelligence")
			? Boolean(toggles["personal intelligence"])
			: (providerProbe?.personal_intelligence ?? uiListProbe?.personal_intelligence),
		signed_out: uiListProbe?.signed_out ?? providerProbe?.signed_out,
		modes,
		disabled_modes: disabledModes.length > 0 ? disabledModes : undefined,
		toggles,
		active_mode:
			normalizeGeminiDiscoveryLabel(providerProbe?.active_mode ?? uiListProbe?.active_mode ?? "") ||
			null,
	};
}

export async function prepareGeminiToolsDrawerForUiList(page: Page): Promise<void> {
	const dismissOverlayExpression = `(() => {
    const dispatchEscape = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    };
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    dispatchEscape();
    dispatchEscape();
    return true;
  })()`;
	await page.evaluate(dismissOverlayExpression).catch(() => undefined);
	await new Promise((resolve) => setTimeout(resolve, 150));

	const drawerReadyExpression = `(() => {
    const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
    const switchSelectors = ${JSON.stringify(GEMINI_PERSONAL_INTELLIGENCE_SELECTORS)};
    const modeMenus = Array.from(document.querySelectorAll('.gds-mode-switch-menu, [data-test-id="bard-mode-menu-button"][aria-expanded="true"]'))
      .filter((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    return (
      modeMenus.length === 0 &&
      rowSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node))) ||
      switchSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node)))
    );
  })()`;
	const drawerReady = await page.evaluate(drawerReadyExpression);
	if (drawerReady) {
		return;
	}

	const pointExpression = `(() => {
    const selectors = ${JSON.stringify(GEMINI_TOOLS_BUTTON_SELECTORS)};
    const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement) || !visible(node)) continue;
        const button = node.matches('button') ? node : node.closest('button');
        if (!(button instanceof HTMLElement) || !visible(button)) continue;
        const label = normalize(button.getAttribute('aria-label') || button.textContent);
        if (label !== 'tools') continue;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  })()`;
	const point = (await page.evaluate(pointExpression)) as { x: number; y: number } | null;

	if (!point) {
		return;
	}

	await page.mouse.move(point.x, point.y);
	await page.mouse.down();
	await page.mouse.up();
	await new Promise((resolve) => setTimeout(resolve, 200));

	await page
		.waitForFunction(
			`(() => {
      const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
      const switchSelectors = ${JSON.stringify(GEMINI_PERSONAL_INTELLIGENCE_SELECTORS)};
      const modeMenus = Array.from(document.querySelectorAll('.gds-mode-switch-menu'))
        .filter((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      const visible = (node: Element | null) =>
        Boolean(node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      return (
        modeMenus.length === 0 &&
        (rowSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node))) ||
        switchSelectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => visible(node)))
        )
      );
    })()`,
			{
				timeout: 3000,
			},
		)
		.catch(() => undefined);
}

export async function cleanupGeminiUiListPreparation(page: Page): Promise<void> {
	await page
		.evaluate(`(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    return true;
  })()`)
		.catch(() => undefined);
	await new Promise((resolve) => setTimeout(resolve, 150));
}

async function runGeminiDomSearch(
	Runtime: ChromeClient["Runtime"],
	options: BrowserDomSearchOptions,
): Promise<GeminiDomSearchResult> {
	const { result } = await Runtime.evaluate({
		expression: buildBrowserDomSearchExpression(options),
		returnByValue: true,
	});
	return (
		(result?.value as GeminiDomSearchResult | null | undefined) ?? { totalScanned: 0, matched: [] }
	);
}

function buildGeminiDomSearchHasMatchesExpression(options: BrowserDomSearchOptions): string {
	const searchExpression = buildBrowserDomSearchExpression(options);
	return `(() => {
    const result = ${searchExpression};
    return Boolean(result && Array.isArray(result.matched) && result.matched.length > 0);
  })()`;
}

async function ensureGeminiToolsDrawerOpen(client: ChromeClient): Promise<boolean> {
	const readRows = async (): Promise<GeminiDomSearchResult> =>
		runGeminiDomSearch(client.Runtime, {
			classIncludes: ["toolbox-drawer-item-list-button"],
			role: ["menuitemcheckbox"],
			visibleOnly: true,
			limit: 50,
			maxScan: 10_000,
		}).catch(() => ({ totalScanned: 0, matched: [] }));
	const waitForRows = async (timeoutMs: number): Promise<boolean> => {
		await waitForPredicate(
			client.Runtime,
			buildGeminiDomSearchHasMatchesExpression({
				classIncludes: ["toolbox-drawer-item-list-button"],
				role: ["menuitemcheckbox"],
				visibleOnly: true,
				limit: 1,
				maxScan: 10_000,
			}),
			{
				timeoutMs,
				description: "Gemini tools drawer rows",
			},
		).catch(() => undefined);
		const rows = await readRows();
		return rows.matched.length > 0;
	};

	const existingRows = await readRows();
	if (existingRows.matched.length > 0) {
		return true;
	}
	await pressEscape(client).catch(() => undefined);
	await new Promise((resolve) => setTimeout(resolve, 150));
	const programmaticOpen = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const labelsFor = (node) => [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.textContent,
      ].map(normalize).filter(Boolean);
      const labelMatches = (node) => labelsFor(node).some((label) => label === 'tools');
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(GEMINI_TOOLS_BUTTON_SELECTORS.join(","))}));
      const matched = candidates
        .map((candidate) => {
          if (!(candidate instanceof HTMLElement)) return null;
          const button = candidate.matches('button') ? candidate : candidate.closest('button');
          return button instanceof HTMLElement ? { candidate, button } : null;
        })
        .find((entry) => entry && visible(entry.button) && (labelMatches(entry.button) || labelMatches(entry.candidate)));
      const button = matched?.button;
      if (!(button instanceof HTMLElement)) return false;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const clickTarget = button.querySelector('.mat-mdc-button-touch-target');
      const target = clickTarget instanceof HTMLElement && visible(clickTarget) ? clickTarget : button;
      const rect = target.getBoundingClientRect();
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
      };
      if (typeof PointerEvent === 'function') {
        target.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
      }
      target.dispatchEvent(new MouseEvent('mousedown', { ...eventOptions, buttons: 1 }));
      if (typeof PointerEvent === 'function') {
        target.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
      }
      target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...eventOptions, buttons: 0 }));
      return true;
    })()`,
		returnByValue: true,
	}).catch(() => ({ result: { value: false } }));
	if (Boolean(programmaticOpen.result?.value) && (await waitForRows(5_000))) {
		return true;
	}

	const coordinateClicked = await clickGeminiFeatureProbeTarget(
		client,
		GEMINI_TOOLS_BUTTON_SELECTORS,
		{
			requireText: "tools",
		},
	).catch(() => false);
	if (coordinateClicked && (await waitForRows(5_000))) {
		return true;
	}

	const rows = await readRows();
	return rows.matched.length > 0;
}

async function selectGeminiWorkbenchCapability(
	client: ChromeClient,
	capabilityId: string | null | undefined,
): Promise<void> {
	const normalizedCapabilityId = normalizeWhitespace(capabilityId ?? "");
	if (!normalizedCapabilityId) {
		return;
	}
	const labelsByCapabilityId: Record<string, string[]> = {
		"gemini.media.create_image": ["create image", "images"],
		"gemini.media.create_music": ["create music", "music"],
		"gemini.media.create_video": ["create video", "videos"],
	};
	const targetLabels = labelsByCapabilityId[normalizedCapabilityId];
	if (!targetLabels) {
		throw new Error(
			`Gemini prompt capability ${normalizedCapabilityId} is not supported by the browser adapter yet.`,
		);
	}
	const selectedFromZeroState = await client.Runtime.evaluate({
		expression: `(() => {
      const targetLabels = ${JSON.stringify(targetLabels)};
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const labelsFor = (node) => [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.textContent,
      ].map(normalize).filter(Boolean);
      const matches = (node) => labelsFor(node).some((label) => targetLabels.some((targetLabel) => label === targetLabel || label.includes(targetLabel)));
      const buttons = Array.from(document.querySelectorAll('button.card-zero-state, button[aria-label*="Create image"], button'));
      const button = buttons.find((candidate) => candidate instanceof HTMLElement && visible(candidate) && matches(candidate));
      if (!(button instanceof HTMLElement)) return false;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      clickTarget.click();
      return true;
    })()`,
		returnByValue: true,
	}).catch(() => ({ result: { value: false } }));
	if (selectedFromZeroState.result?.value) {
		const zeroStateSelectionVerified = await waitForPredicate(
			client.Runtime,
			`(() => {
        const normalize = (value) =>
          String(value ?? '')
            .replace(/\\s+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/^[^\\p{L}\\p{N}]+/gu, '')
            .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
            .replace(/\\s+/g, ' ')
            .trim();
        const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        return Array.from(document.querySelectorAll('button, [role="button"]')).some((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          normalize([node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent].filter(Boolean).join(' ')).includes('deselect create image')
        );
      })()`,
			{
				timeoutMs: 2_000,
				description: `Gemini capability ${normalizedCapabilityId} zero-state selection`,
			},
		).then(
			() => true,
			() => false,
		);
		if (zeroStateSelectionVerified) {
			return;
		}
	}

	const opened = await ensureGeminiToolsDrawerOpen(client);
	if (!opened) {
		throw new Error("Gemini tools drawer did not open before capability selection.");
	}
	const selected = await client.Runtime.evaluate({
		expression: `(() => {
      const targetLabels = ${JSON.stringify(targetLabels)};
      const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/(?:\\s+new)+$/gu, '')
          .replace(/\\s+/g, ' ')
          .trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      for (const selector of rowSelectors) {
        for (const row of Array.from(document.querySelectorAll(selector))) {
          if (!(row instanceof HTMLElement) || !visible(row)) continue;
          const label = normalize(row.getAttribute('aria-label') || row.textContent || '');
          if (!targetLabels.includes(label)) continue;
          if (row.getAttribute('aria-checked') === 'true') {
            return { selected: true, alreadySelected: true, label };
          }
          row.scrollIntoView({ block: 'center', inline: 'center' });
          const touchTarget = row.querySelector('.mat-mdc-button-touch-target');
          const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : row;
          clickTarget.click();
          return { selected: true, alreadySelected: false, label };
        }
      }
      return { selected: false, alreadySelected: false, label: targetLabels.join(' | ') };
    })()`,
		returnByValue: true,
	});
	const payload = selected.result?.value as
		| { selected?: boolean; alreadySelected?: boolean; label?: string }
		| undefined;
	if (!payload?.selected) {
		throw new Error(
			`Gemini workbench capability ${normalizedCapabilityId} was not visible in the tools drawer.`,
		);
	}
	if (!payload.alreadySelected) {
		await waitForPredicate(
			client.Runtime,
			`(() => {
        const targetLabels = ${JSON.stringify(targetLabels)};
        const rowSelectors = ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)};
        const normalize = (value) =>
          String(value ?? '')
            .replace(/\\s+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/^[^\\p{L}\\p{N}]+/gu, '')
            .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
            .replace(/(?:\\s+new)+$/gu, '')
            .replace(/\\s+/g, ' ')
            .trim();
        const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        return ${JSON.stringify(GEMINI_TOOLS_DRAWER_ROW_SELECTORS)}.some((selector) =>
          Array.from(document.querySelectorAll(selector)).some((row) =>
            row instanceof HTMLElement &&
            visible(row) &&
            targetLabels.includes(normalize(row.getAttribute('aria-label') || row.textContent || '')) &&
            row.getAttribute('aria-checked') === 'true'
          )
        );
      })()`,
			{
				timeoutMs: 2_000,
				description: `Gemini capability ${normalizedCapabilityId} selection`,
			},
		).catch(() => undefined);
	}
	await client.Runtime.evaluate({
		expression: `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      return true;
    })()`,
		returnByValue: true,
	}).catch(() => undefined);
}

function _guessMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".txt":
		case ".md":
		case ".log":
		case ".csv":
		case ".ts":
		case ".tsx":
		case ".js":
		case ".json":
		case ".yaml":
		case ".yml":
		case ".xml":
		case ".html":
		case ".css":
			return "text/plain";
		case ".pdf":
			return "application/pdf";
		case ".doc":
			return "application/msword";
		case ".docx":
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		case ".xls":
			return "application/vnd.ms-excel";
		case ".xlsx":
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

function isLikelyImagePath(filePath: string): boolean {
	return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(
		path.extname(filePath).toLowerCase(),
	);
}

export function normalizeGeminiProjectId(value: string | null | undefined): string | null {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return null;
	const extracted = extractGeminiProjectIdFromUrl(trimmed);
	if (extracted) return extracted;
	const normalized = trimmed.replace(/^gem\//i, "").replace(/^\/+|\/+$/g, "");
	if (!normalized) return null;
	return /^[a-z0-9_-]{6,}$/i.test(normalized) ? normalized : null;
}

export function normalizeGeminiConversationId(value: string | null | undefined): string | null {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return null;
	const match = trimmed.match(/\/app\/([^/?#]+)/i);
	return match?.[1] ?? (trimmed.replace(/^app\//i, "").replace(/^\/+|\/+$/g, "") || null);
}

export function extractGeminiProjectIdFromUrl(url: string): string | null {
	const match = String(url).match(/\/gem\/([^/?#]+)|\/gems\/edit\/([^/?#]+)/i);
	return match?.[1] ?? match?.[2] ?? null;
}

export function resolveGeminiProjectUrl(projectId: string): string {
	return new URL(`gem/${projectId}`, GEMINI_BASE_URL).toString();
}

export function resolveGeminiCreateProjectUrl(): string {
	return GEMINI_GEM_CREATE_URL;
}

export function resolveGeminiEditProjectUrl(projectId: string): string {
	return new URL(`gems/edit/${projectId}`, GEMINI_BASE_URL).toString();
}

export function resolveGeminiConversationUrl(conversationId: string): string {
	return new URL(`app/${conversationId}`, GEMINI_BASE_URL).toString();
}

function isGeminiUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return GEMINI_COMPATIBLE_HOSTS.includes(parsed.hostname);
	} catch {
		return false;
	}
}

function geminiConversationRouteExpression(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/\/+$/, "") || "/";
		if (/^\/app\/[^/]+$/i.test(path)) {
			return `location.pathname === ${JSON.stringify(path)}`;
		}
		if (path === "/app") {
			return `location.pathname === "/app" || /^\\/app\\/[^/?#]+$/i.test(location.pathname)`;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

export function geminiConversationSurfaceReadyExpression(): string {
	return `(() => {
    const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
    const conversationList = document.querySelector('[data-test-id="all-conversations"]');
    if (
      visible(conversationList) &&
      Array.from(document.querySelectorAll('a[href*="/app/"]')).some((node) => visible(node))
    ) return true;
    if (visible(document.querySelector('button[aria-label="Main menu"]'))) {
      const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (text.includes('conversation with gemini') || text.includes('what can we get done')) return true;
      if (Array.from(document.querySelectorAll('div[role="textbox"], textarea')).some((node) => visible(node))) return true;
    }
    if (Array.from(document.querySelectorAll('a[href*="/app/"]')).some((node) => visible(node))) return true;
    if (Array.from(document.querySelectorAll('button[data-test-id="actions-menu-button"], a[data-test-id="actions-menu-button"]')).some((node) => visible(node))) return true;
    if (Array.from(document.querySelectorAll('button[aria-label], a[aria-label]')).some((node) => {
      if (!visible(node)) return false;
      const label = String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return label.startsWith('more options for ');
    })) return true;
    const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    if (text.includes('use your precise location')) return true;
    return false;
  })()`;
}

export function classifyGeminiBlockingState(
	state:
		| {
				href?: string | null;
				title?: string | null;
				bodyText?: string | null;
		  }
		| null
		| undefined,
): string | null {
	const href = normalizeWhitespace(state?.href ?? "").toLowerCase();
	const title = normalizeWhitespace(state?.title ?? "").toLowerCase();
	const bodyText = normalizeWhitespace(state?.bodyText ?? "").toLowerCase();
	const combined = `${title} ${bodyText}`.trim();
	if (
		href.includes("google.com/sorry/") ||
		(combined.includes("our systems have detected unusual traffic") &&
			combined.includes("this page checks to see if it's really you"))
	) {
		return "Google blocked Gemini with an unusual-traffic interstitial (google.com/sorry).";
	}
	if (
		href.includes("accounts.google.com/") ||
		href.includes("/signin/") ||
		/\bchoose an account\b|\buse your google account\b|\bsign in\b.*\bgoogle\b|\bgoogle accounts\b/.test(
			combined,
		)
	) {
		return "Google account chooser or sign-in gate blocked Gemini.";
	}
	if (/recaptcha|g-recaptcha|hcaptcha|captcha/.test(combined)) {
		return "CAPTCHA or reCAPTCHA challenge blocked Gemini.";
	}
	if (
		/human verification|verify you are human|prove you are human|confirm you are human|anti-bot/.test(
			combined,
		)
	) {
		return "Human-verification gate blocked Gemini.";
	}
	return null;
}

export function resolveGeminiConfiguredUrl(
	value: string | null | undefined,
	fallback: string = GEMINI_APP_URL,
): string {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return fallback;
	return isGeminiUrl(trimmed) ? trimmed : fallback;
}

export function resolveGeminiConversationRailTargetUrl(
	options?: Pick<BrowserProviderListOptions, "configuredUrl"> | null,
	projectId?: string | null,
): string {
	const normalizedProjectId = normalizeGeminiProjectId(projectId);
	if (normalizedProjectId) {
		return resolveGeminiProjectUrl(normalizedProjectId);
	}
	const configuredUrl = resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL);
	if (!isGeminiAppConversationSurfaceUrl(configuredUrl)) {
		return GEMINI_APP_URL;
	}
	return extractGeminiConversationIdFromUrl(configuredUrl) ? GEMINI_APP_URL : configuredUrl;
}

function isGeminiAppConversationSurfaceUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.pathname === "/app" || parsed.pathname.startsWith("/app/");
	} catch {
		return false;
	}
}

export function geminiUrlMatchesPreference(
	candidateUrl: string | null | undefined,
	preferredUrl: string | null | undefined,
): boolean {
	const candidate = String(candidateUrl ?? "").trim();
	const preferred = String(preferredUrl ?? "").trim();
	if (!candidate || !preferred) {
		return false;
	}
	try {
		const candidateParsed = new URL(candidate);
		const preferredParsed = new URL(preferred);
		if (candidateParsed.hostname !== preferredParsed.hostname) {
			return false;
		}
		const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";
		const candidatePath = normalizePath(candidateParsed.pathname);
		const preferredPath = normalizePath(preferredParsed.pathname);
		if (
			preferredPath === "/app" &&
			(candidatePath === "/app" || /^\/app\/[^/]+$/i.test(candidatePath))
		) {
			return candidateParsed.search === preferredParsed.search;
		}
		if (candidatePath !== preferredPath) {
			return false;
		}
		return candidateParsed.search === preferredParsed.search;
	} catch {
		return candidate === preferred;
	}
}

export function selectPreferredGeminiTarget<T extends { url?: string | null }>(
	targets: T[],
	preferredUrl?: string,
): T | undefined {
	if (targets.length === 0) {
		return undefined;
	}
	if (!preferredUrl) {
		return targets[0];
	}
	return targets.find((target) => geminiUrlMatchesPreference(target.url, preferredUrl));
}

export function canReuseGeminiResolvedTabTarget(
	tabUrl: string | null | undefined,
	preferredUrl: string | null | undefined,
): boolean {
	const preferred = String(preferredUrl ?? "").trim();
	if (!preferred) {
		return true;
	}
	const tab = String(tabUrl ?? "").trim();
	if (!tab) {
		return true;
	}
	return geminiUrlMatchesPreference(tab, preferred);
}

export function canReuseGeminiConversationSurfaceForTarget(
	currentUrl: string | null | undefined,
	targetUrl: string | null | undefined,
): boolean {
	const current = String(currentUrl ?? "").trim();
	const target = String(targetUrl ?? "").trim();
	if (!current || !target) return false;
	try {
		const currentParsed = new URL(current);
		const targetParsed = new URL(target);
		if (currentParsed.hostname !== targetParsed.hostname) return false;
		const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";
		const currentPath = normalizePath(currentParsed.pathname);
		const targetPath = normalizePath(targetParsed.pathname);
		if (targetPath === "/app") {
			return (
				currentParsed.search === targetParsed.search &&
				(currentPath === "/app" || /^\/app\/[^/]+$/i.test(currentPath))
			);
		}
		if (/^\/app\/[^/]+$/i.test(targetPath)) {
			return currentPath === targetPath && currentParsed.search === targetParsed.search;
		}
		return currentPath === targetPath && currentParsed.search === targetParsed.search;
	} catch {
		return false;
	}
}

function resolveGeminiTargetId(
	target: { id?: string; targetId?: string } | null | undefined,
): string | undefined {
	if (!target) return undefined;
	if (typeof target.id === "string" && target.id.trim()) return target.id;
	if (typeof target.targetId === "string" && target.targetId.trim()) return target.targetId;
	return undefined;
}

async function connectToGeminiTab(
	options?: BrowserProviderListOptions,
	urlOverride?: string,
): Promise<{
	client: ChromeClient;
	targetId?: string;
	shouldClose: boolean;
	host: string;
	port: number;
	usedExisting: boolean;
	borrowedFromSession?: boolean;
}> {
	let host = options?.host ?? "127.0.0.1";
	let port = options?.port ?? resolvePortFromEnv();
	const preferredUrl = urlOverride ?? options?.configuredUrl ?? GEMINI_APP_URL;
	const forceNewDisposableTab = shouldForceNewGeminiTabConnection(options);
	if (port) {
		const scopedConnection = readGeminiScopedSession(
			options,
			buildGeminiScopedSessionKey(host, port, preferredUrl),
		);
		if (scopedConnection) {
			return {
				...scopedConnection,
				shouldClose: false,
				usedExisting: true,
				borrowedFromSession: true,
			};
		}
	}
	const allowDirectTabReuse = canReuseGeminiResolvedTabTarget(options?.tabUrl, preferredUrl);
	if (options?.tabTargetId && port && allowDirectTabReuse) {
		try {
			const client = await connectToChromeTarget({ host, port, target: options.tabTargetId });
			await Promise.all([client.Page.enable(), client.Runtime.enable()]);
			await annotateClientMutationContext(
				client,
				options,
				"provider:gemini",
				options.tabTargetId,
			);
			const connection = {
				client,
				targetId: options.tabTargetId,
				shouldClose: false,
				host,
				port,
				usedExisting: true,
			};
			retainGeminiScopedSession(
				options,
				buildGeminiScopedSessionKey(host, port, preferredUrl),
				connection,
			);
			return connection;
		} catch {
			// Resolve again below if the cached target id is stale.
		}
	}

	const serviceResolver = options?.browserService as
		| (import("../service/browserService.js").BrowserService & {
				resolveServiceTarget?: (options: {
					serviceId: "gemini";
					configuredUrl?: string | null;
					ensurePort?: boolean;
				}) => Promise<{
					host?: string;
					port?: number;
					tab?: { targetId?: string; id?: string } | null;
				}>;
		  })
		| undefined;

	let resolvedTargetIdFromService: string | undefined;
	if (serviceResolver?.resolveServiceTarget) {
		const target = await serviceResolver.resolveServiceTarget({
			serviceId: "gemini",
			configuredUrl: preferredUrl,
			ensurePort: true,
		});
		host = target.host ?? host;
		port = target.port ?? port;
		resolvedTargetIdFromService = forceNewDisposableTab
			? undefined
			: resolveGeminiTargetId(target.tab);
	}
	if ((!port || !host) && options?.browserService) {
		const target = await options.browserService.resolveDevToolsTarget({
			host,
			port: port ?? undefined,
			ensurePort: true,
			launchUrl: preferredUrl,
		});
		host = target.host ?? host;
		port = target.port ?? port;
	}
	if (!port) {
		throw new Error(
			"Missing DevTools port. Launch a Gemini browser session or set AURACALL_BROWSER_PORT.",
		);
	}

	const sessionKey = buildGeminiScopedSessionKey(host, port, preferredUrl);
	const scopedConnection = readGeminiScopedSession(options, sessionKey);
	if (scopedConnection) {
		return {
			...scopedConnection,
			shouldClose: false,
			usedExisting: true,
			borrowedFromSession: true,
		};
	}
	const targets = await CDP.List({ host, port });
	const candidates = forceNewDisposableTab
		? []
		: targets.filter((target) => target.type === "page" && isGeminiUrl(target.url ?? ""));
	const serviceResolved = resolvedTargetIdFromService
		? candidates.find((target) => resolveGeminiTargetId(target) === resolvedTargetIdFromService)
		: undefined;
	const preferred = selectPreferredGeminiTarget(candidates, preferredUrl);
	let targetInfo = serviceResolved ?? preferred;
	let shouldClose = false;
	let usedExisting = Boolean(resolveGeminiTargetId(targetInfo));
	if (!targetInfo) {
		const opened = await openOrReuseChromeTarget(port, preferredUrl, {
			host,
			reusePolicy: "same-origin",
			compatibleHosts: GEMINI_COMPATIBLE_HOSTS,
			navigateReusedTargets: false,
			mutationAudit: resolveMutationAudit(options),
			providerTrafficGovernor: resolveProviderTrafficGovernor(options),
			providerTrafficAuthorityFactory: options?.providerTrafficAuthorityFactory,
			providerTrafficRequired:
				options?.providerTrafficRequired === true ||
				resolveProviderTrafficGovernor(options) !== undefined,
			mutationSource: resolveMutationSource(options, "provider:gemini", "connect-tab"),
		});
		targetInfo = opened.target ?? undefined;
		shouldClose = !opened.reused;
		usedExisting = opened.reused;
	}
	const targetId = resolveGeminiTargetId(targetInfo);
	if (!targetId) {
		throw new Error("No Gemini tab found. Launch a Gemini browser session and retry.");
	}
	const client = await connectToChromeTarget({ host, port, target: targetId });
	await Promise.all([client.Page.enable(), client.Runtime.enable()]);
	await annotateClientMutationContext(client, options, "provider:gemini", targetId);
	const connection = { client, targetId, shouldClose, host, port, usedExisting };
	retainGeminiScopedSession(options, sessionKey, connection);
	return connection;
}

type GeminiTabConnection = Awaited<ReturnType<typeof connectToGeminiTab>>;
type GeminiScopedTabSessionValue = {
	connection: GeminiTabConnection;
};

function shouldDisposeGeminiTabConnection(
	connection: Pick<GeminiTabConnection, "shouldClose" | "targetId">,
	options?: BrowserProviderListOptions,
): boolean {
	if (options?.tabLifecycle !== "dispose-new") return false;
	if (options.preserveActiveTab === true) return false;
	if (options.tabTargetId) return false;
	return Boolean(connection.shouldClose && connection.targetId);
}

async function closeGeminiTabConnection(
	connection: Pick<
		GeminiTabConnection,
		"client" | "targetId" | "shouldClose" | "host" | "port" | "borrowedFromSession"
	>,
	options?: BrowserProviderListOptions,
): Promise<void> {
	if (connection.borrowedFromSession) return;
	const retainedSession = options?.providerSession?.value as
		| Partial<GeminiScopedTabSessionValue>
		| undefined;
	if (options?.useProviderSession && retainedSession?.connection === connection) return;
	await connection.client.close().catch(() => undefined);
	if (!shouldDisposeGeminiTabConnection(connection, options)) return;
	await CDP.Close({
		host: connection.host,
		port: connection.port,
		id: connection.targetId as string,
	}).catch(() => undefined);
}

export const closeGeminiTabConnectionForTest = closeGeminiTabConnection;
export const shouldDisposeGeminiTabConnectionForTest = shouldDisposeGeminiTabConnection;

function shouldForceNewGeminiTabConnection(options?: BrowserProviderListOptions): boolean {
	if (options?.tabLifecycle !== "dispose-new") return false;
	if (options.preserveActiveTab === true) return false;
	if (options.tabTargetId) return false;
	return true;
}

export const shouldForceNewGeminiTabConnectionForTest = shouldForceNewGeminiTabConnection;

function buildGeminiScopedSessionKey(host: string, port: number, preferredUrl: string): string {
	return `gemini:${host}:${port}:${preferredUrl}`;
}

function readGeminiScopedSession(
	options: BrowserProviderListOptions | undefined,
	key: string,
): GeminiTabConnection | null {
	const session = options?.providerSession;
	if (!options?.useProviderSession || !session) return null;
	if (session.providerId !== "gemini" || session.key !== key) return null;
	const value = session.value as Partial<GeminiScopedTabSessionValue> | null;
	return value?.connection ?? null;
}

function retainGeminiScopedSession(
	options: BrowserProviderListOptions | undefined,
	key: string,
	connection: GeminiTabConnection,
): void {
	if (!options?.useProviderSession || options.providerSession) return;
	options.providerSession = {
		providerId: "gemini",
		key,
		value: { connection } satisfies GeminiScopedTabSessionValue,
		close: async () => {
			options.providerSession = undefined;
			await closeGeminiTabConnection(connection, {
				...options,
				useProviderSession: false,
			});
		},
	};
}

type GeminiProjectProbe = {
	id: string;
	name: string;
	url?: string | null;
	editable?: boolean | null;
	editUrl?: string | null;
};

type GeminiConversationProbe = {
	id: string;
	title: string;
	url?: string | null;
	updatedAt?: string | null;
};

type GeminiConversationContextProbe = {
	provider: "gemini";
	conversationId: string;
	messages: Array<{
		role: "user" | "assistant";
		text: string;
	}>;
	files?: FileRef[];
	artifacts?: ConversationContext["artifacts"];
};

type GeminiDeleteTrace = Array<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeGeminiDeleteTrace(trace: GeminiDeleteTrace, edgeCount: number = 6): string {
	if (trace.length <= edgeCount * 2) {
		return JSON.stringify(trace);
	}
	return JSON.stringify([
		...trace.slice(0, edgeCount),
		{ phase: "trace-truncated", omitted: trace.length - edgeCount * 2 },
		...trace.slice(-edgeCount),
	]);
}

const GEMINI_USER_IDENTITY_LABEL_EXPRESSION = `(() => {
  const labels = Array.from(document.querySelectorAll('[aria-label]'))
    .map((node) => String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim())
    .filter(Boolean);
  return labels.find((label) => /^Google Account:/i.test(label)) ?? null;
})()`;

export function extractGeminiIdentityFromLabel(
	label: string | null | undefined,
): ProviderUserIdentity | null {
	const normalized = normalizeWhitespace(label ?? "");
	if (!normalized) return null;
	const match = normalized.match(/^Google Account:\s*(.+?)\s*\(([^)]+@[^)]+)\)$/i);
	if (!match) return null;
	return {
		name: normalizeWhitespace(match[1]),
		email: normalizeWhitespace(match[2]).toLowerCase(),
		source: "google-account-label",
	};
}

async function scrapeGeminiProjects(client: ChromeClient): Promise<Project[]> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const rows = Array.from(document.querySelectorAll('a[href*="/gem/"]'));
      const items = [];
      const seen = new Set();
      const titleCaseSlug = (value) => normalize(value)
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      for (const anchor of rows) {
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        const href = anchor.href || '';
        if (!href || href.includes('/gems/view')) continue;
        const match = href.match(/\\/gem\\/([^/?#]+)/i);
        if (!match?.[1]) continue;
        const row = anchor.closest('li,div,section,article') || anchor;
        const id = match[1];
        if (${JSON.stringify(["chess-champ", "brainstormer", "storybook"])}.includes(id)) continue;
        if (seen.has(id)) continue;
        const optionLabel = Array.from(row.querySelectorAll('button[aria-label],a[aria-label]'))
          .map((node) => normalize(node.getAttribute('aria-label') || ''))
          .find((label) => /more options for .* gem/i.test(label));
        const editLink = Array.from(row.querySelectorAll('a[href*="/gems/edit/"]'))
          .find((node) => {
            if (node instanceof HTMLAnchorElement && node.href.includes('/gems/edit/')) return true;
            return false;
          });
        const editable = Boolean(editLink);
        if (!editable) continue;
        const optionMatch = optionLabel?.match(/more options for "?(.+?)"? gem/i);
        const startLabel = normalize(anchor.getAttribute('aria-label') || '');
        const startMatch = startLabel.match(/start a new conversation with gem:\\s*(.+)$/i);
        const buttonText = Array.from(row.querySelectorAll('button'))
          .map((node) => normalize(node.textContent || ''))
          .find((label) => label.length > 0 && label.length <= 80 && !/^(share|edit gem|new gem|show more)$/i.test(label));
        const textName = normalize(anchor.textContent || '');
        const slugName = id.includes('-') && /^[a-z0-9-]+$/i.test(id) && /[a-z]/i.test(id) ? titleCaseSlug(id) : '';
        const preferOptionMatch = !slugName;
        let name =
          (preferOptionMatch ? optionMatch?.[1] : '') ||
          startMatch?.[1] ||
          slugName ||
          optionMatch?.[1] ||
          buttonText ||
          textName;
        name = name.replace(/^start a new conversation with gem:\\s*/i, '').replace(/^[A-Z]\\s+(?=[A-Z])/,'').trim();
        if (!name || !isVisible(anchor)) continue;
        seen.add(id);
        items.push({
          id,
          name,
          url: href,
          editable,
          editUrl: editLink instanceof HTMLAnchorElement ? editLink.href : null,
        });
      }
      return items;
    })()`,
		returnByValue: true,
	});
	const payload = Array.isArray(result?.value) ? (result.value as GeminiProjectProbe[]) : [];
	return payload
		.filter((item) => item?.id && item?.name && isEditableGeminiProjectProbe(item))
		.map((item) => ({
			id: item.id,
			name: item.name,
			provider: "gemini" as const,
			url: item.url ?? undefined,
		}));
}

export function isEditableGeminiProjectProbe(
	item: Partial<Pick<GeminiProjectProbe, "editable" | "editUrl" | "id" | "url">> | null | undefined,
): boolean {
	if (!item) return false;
	const id = typeof item.id === "string" ? item.id.trim().toLowerCase() : "";
	if (id && GOOGLE_SYSTEM_GEM_IDS.has(id)) return false;
	const url = typeof item.url === "string" ? item.url.trim().toLowerCase() : "";
	if ([...GOOGLE_SYSTEM_GEM_IDS].some((systemId) => url.includes(`/gem/${systemId}`))) return false;
	if (typeof item.editUrl === "string" && item.editUrl.trim()) return true;
	return false;
}

async function readGeminiUserIdentity(client: ChromeClient): Promise<ProviderUserIdentity | null> {
	const { result } = await client.Runtime.evaluate({
		expression: GEMINI_USER_IDENTITY_LABEL_EXPRESSION,
		returnByValue: true,
	});
	const immediate = extractGeminiIdentityFromLabel(
		typeof result?.value === "string" ? result.value : null,
	);
	if (immediate) return immediate;

	const waited = await waitForPredicate(client.Runtime, GEMINI_USER_IDENTITY_LABEL_EXPRESSION, {
		timeoutMs: 5_000,
		pollMs: 250,
		description: "Gemini Google Account identity label",
	});
	return extractGeminiIdentityFromLabel(typeof waited.value === "string" ? waited.value : null);
}

async function assertGeminiExpectedIdentity(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<void> {
	if (!options?.providerSessionAuthorization) {
		throw new Error("Gemini provider-session authorization context is missing.");
	}
	assertProviderSessionAuthorization(
		options.providerSessionAuthorization,
		await readGeminiUserIdentity(client),
		{
			browserTargetId:
				options.tabTargetId ?? options.providerSessionAuthorization.context.browserTargetId ?? null,
			devtoolsHost: options.host ?? options.providerSessionAuthorization.context.devtoolsHost ?? null,
			devtoolsPort: options.port ?? options.providerSessionAuthorization.context.devtoolsPort ?? null,
		},
	);
}

async function clickGeminiFeatureProbeTarget(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	selectors: readonly string[],
	options: { requireText?: string | null } = {},
): Promise<boolean> {
	const located = await client.Runtime.evaluate({
		expression: `(() => {
      const selectors = ${JSON.stringify(selectors)};
      const requiredText = ${JSON.stringify(normalizeGeminiDiscoveryLabel(options.requireText ?? ""))};
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const labelsFor = (node) => [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.textContent,
      ].map(normalize).filter(Boolean);
      for (const selector of selectors) {
        const candidates = Array.from(document.querySelectorAll(selector));
        const target = candidates.find((candidate) => {
          if (!(candidate instanceof HTMLElement)) return false;
          if (!visible(candidate)) return false;
          if (requiredText) {
            const labels = labelsFor(candidate);
            if (!labels.some((label) => label === requiredText)) return false;
          }
          return true;
        });
        if (!(target instanceof HTMLElement)) continue;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const touchTarget = target.querySelector('.mat-mdc-button-touch-target');
        const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : target;
        const rect = clickTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      return null;
    })()`,
		returnByValue: true,
	});
	const point = located.result?.value as { x?: number; y?: number } | undefined;
	if (typeof point?.x !== "number" || typeof point?.y !== "number") {
		return false;
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: point.x,
		y: point.y,
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	return true;
}

async function readGeminiToolsDrawerProbe(
	Runtime: ChromeClient["Runtime"],
): Promise<GeminiFeatureProbe | null> {
	const [rowSearch, toggleSearch] = await Promise.all([
		runGeminiDomSearch(Runtime, {
			classIncludes: ["toolbox-drawer-item-list-button"],
			role: ["menuitemcheckbox"],
			visibleOnly: true,
			limit: 50,
			maxScan: 10_000,
		}),
		runGeminiDomSearch(Runtime, {
			ariaLabel: ["Personal Intelligence"],
			role: ["switch"],
			visibleOnly: true,
			limit: 10,
			maxScan: 10_000,
		}),
	]);
	const modes = Array.from(
		new Set(
			rowSearch.matched
				.map((match) => normalizeGeminiDiscoveryLabel(match.text || match.ariaLabel || null))
				.filter(Boolean),
		),
	).sort();
	const disabledModes = Array.from(
		new Set(
			rowSearch.matched
				.filter((match) => geminiClassNameHasDisabledToolToken(match.className))
				.map((match) => normalizeGeminiDiscoveryLabel(match.text || match.ariaLabel || null))
				.filter(Boolean),
		),
	).sort();
	const toggles = Object.fromEntries(
		toggleSearch.matched
			.map((match) => {
				const label = normalizeGeminiDiscoveryLabel(match.ariaLabel || match.text || null);
				if (!label || typeof match.checked !== "boolean") {
					return null;
				}
				return [label, match.checked] as const;
			})
			.filter((entry): entry is readonly [string, boolean] => Boolean(entry))
			.sort(([left], [right]) => left.localeCompare(right)),
	);
	if (modes.length === 0 && Object.keys(toggles).length === 0) {
		return null;
	}
	return {
		detector: GEMINI_FEATURE_DETECTOR,
		deep_research: modes.includes("deep research"),
		personal_intelligence: Object.hasOwn(toggles, "personal intelligence")
			? Boolean(toggles["personal intelligence"])
			: undefined,
		modes,
		disabled_modes: disabledModes.length > 0 ? disabledModes : undefined,
		toggles,
		active_mode: null,
	};
}

async function readGeminiFeatureProbe(
	Runtime: ChromeClient["Runtime"],
): Promise<GeminiFeatureProbe | null> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const simplify = (value) =>
        normalize(value)
          .toLowerCase()
          .replace(/^[^\\p{L}\\p{N}]+/gu, '')
          .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const detector = ${JSON.stringify(GEMINI_FEATURE_DETECTOR)};
      const flagTokens = ${JSON.stringify(GEMINI_FEATURE_FLAG_TOKENS)};
      const knownLabels = ${JSON.stringify(GEMINI_DISCOVERY_LABELS)};
      const ignore = new Set([
        'main menu',
        'new chat',
        'my stuff',
        'settings help',
        'microphone',
        'temporary chat',
        'search',
        'pro',
        'open mode picker',
      ]);
      const addText = (sink, value) => {
        const normalized = simplify(value);
        if (normalized) sink.push(normalized);
      };
      const bodyCorpus = [];
      addText(bodyCorpus, document.body?.innerText || '');
      for (const key of Object.keys(localStorage).slice(0, 100)) {
        addText(bodyCorpus, key);
        try { addText(bodyCorpus, localStorage.getItem(key) || ''); } catch {}
      }
      for (const key of Object.keys(sessionStorage).slice(0, 100)) {
        addText(bodyCorpus, key);
        try { addText(bodyCorpus, sessionStorage.getItem(key) || ''); } catch {}
      }
      for (const script of Array.from(document.querySelectorAll('script[type="application/json"], script')).slice(0, 20)) {
        addText(bodyCorpus, (script.textContent || '').slice(0, 50000));
      }
      const pickerButton = document.querySelector(${JSON.stringify(GEMINI_MODE_PICKER_SELECTORS.join(","))});
      const activeMode = pickerButton instanceof HTMLElement
        ? simplify(pickerButton.getAttribute('aria-label') || pickerButton.textContent || '')
        : '';
      const overlayRoots = Array.from(document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="dialog"]'))
        .filter((node) => visible(node));
      const drawerRoot = overlayRoots[0] || null;
      const modeLabels = new Set();
      const disabledModeLabels = new Set();
      const toggleStates = {};
      const modeCorpus = [];
      const sourceRoot = drawerRoot || document.body;
      for (const node of Array.from(sourceRoot.querySelectorAll('button, [role="button"], [role="menuitem"], [role="switch"], a[aria-label], button[aria-label]')).slice(0, 500)) {
        if (!visible(node)) continue;
        const label = simplify(node.getAttribute?.('aria-label') || node.textContent || '');
        if (!label) continue;
        if (ignore.has(label)) continue;
        if (label.startsWith('google account ')) continue;
        modeLabels.add(label);
        if (
          node instanceof HTMLButtonElement && node.disabled ||
          node.getAttribute?.('aria-disabled') === 'true' ||
          node.classList?.contains('mdc-list-item--disabled') ||
          node.classList?.contains('disabled')
        ) {
          disabledModeLabels.add(label);
        }
        modeCorpus.push(label);
        const ariaChecked = node.getAttribute?.('aria-checked');
        if (ariaChecked === 'true' || ariaChecked === 'false') {
          toggleStates[label] = ariaChecked === 'true';
        }
      }
      const haystack = Array.from(new Set([...bodyCorpus, ...modeCorpus, activeMode].filter(Boolean))).join('\\n');
      const flags = {};
      for (const [name, tokens] of Object.entries(flagTokens)) {
        flags[name] = tokens.some((token) => haystack.includes(String(token || '').toLowerCase().trim()));
      }
      for (const label of knownLabels) {
        const normalized = simplify(label);
        if (normalized && haystack.includes(normalized)) {
          modeLabels.add(normalized);
        }
      }
      return {
        detector,
        search: Boolean(flags.search),
        grounding: Boolean(flags.grounding),
        deep_research: Boolean(flags.deep_research),
        personal_intelligence: Boolean(flags.personal_intelligence),
        signed_out: Array.from(document.querySelectorAll('a, button'))
          .filter((node) => visible(node))
          .some((node) => simplify(node.getAttribute?.('aria-label') || node.textContent || '') === 'sign in'),
        modes: Array.from(modeLabels).sort(),
        disabled_modes: Array.from(disabledModeLabels).sort(),
        toggles: toggleStates,
        active_mode: activeMode || null,
      };
    })()`,
		returnByValue: true,
	});
	return (result?.value as GeminiFeatureProbe | null | undefined) ?? null;
}

async function readGeminiFeatureSignature(client: ChromeClient): Promise<string | null> {
	await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
	await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
	await clickGeminiFeatureProbeTarget(client, GEMINI_NEW_CHAT_BUTTON_SELECTORS).catch(() => false);
	await waitForPredicate(client.Runtime, `(() => location.pathname === "/app")()`, {
		timeoutMs: 5_000,
		description: "Gemini root composer route",
	}).catch(() => undefined);
	const openedTools = await ensureGeminiToolsDrawerOpen(client).catch(() => false);
	if (openedTools) {
		const drawerProbe = await readGeminiToolsDrawerProbe(client.Runtime);
		const normalizedDrawerSignature = normalizeGeminiFeatureSignature(drawerProbe);
		if (normalizedDrawerSignature) {
			await client.Runtime.evaluate({
				expression: `(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
          return true;
        })()`,
				returnByValue: true,
			}).catch(() => undefined);
			return normalizedDrawerSignature;
		}
	}
	const opened = await clickGeminiFeatureProbeTarget(client, GEMINI_MODE_PICKER_SELECTORS).catch(
		() => false,
	);
	if (opened) {
		await waitForPredicate(
			client.Runtime,
			`(() => {
        const roots = document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="dialog"]');
        return Array.from(roots).some((node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      })()`,
			{
				timeoutMs: 3_000,
				description: "Gemini mode picker overlay",
			},
		).catch(() => undefined);
	}
	const probe = await readGeminiFeatureProbe(client.Runtime);
	await client.Runtime.evaluate({
		expression: `(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      return true;
    })()`,
		returnByValue: true,
	}).catch(() => undefined);
	return normalizeGeminiFeatureSignature(probe);
}

async function scrapeGeminiConversations(
	client: ChromeClient,
	projectId?: string,
): Promise<Conversation[]> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const root = document.querySelector('[data-test-id="all-conversations"]') || document.body;
      const rows = Array.from(root.querySelectorAll('[data-test-id="conversation"], a[href*="/app/"]'));
      const items = [];
      const seen = new Set();
      const ignoredAppRoutes = new Set(['download']);
      for (const row of rows) {
        const anchor = row.matches?.('a[href*="/app/"]')
          ? row
          : row.querySelector?.('a[href*="/app/"]');
        if (!(anchor instanceof HTMLAnchorElement)) continue;
        if (!isVisible(anchor)) continue;
        const href = anchor.href || '';
        const match = href.match(/\\/app\\/([^/?#]+)/i);
        if (!match?.[1]) continue;
        const id = match[1];
        if (ignoredAppRoutes.has(id.toLowerCase())) continue;
        if (seen.has(id)) continue;
        const title = normalize(row.textContent || anchor.textContent || '') || id;
        seen.add(id);
        items.push({
          id,
          title,
          url: href,
          updatedAt: null,
        });
      }
      return items;
    })()`,
		returnByValue: true,
	});
	const payload = Array.isArray(result?.value) ? (result.value as GeminiConversationProbe[]) : [];
	return payload
		.filter((item) => item?.id && item?.title)
		.map((item) => ({
			id: item.id,
			title: item.title,
			provider: "gemini" as const,
			projectId,
			url: item.url ?? undefined,
			updatedAt: item.updatedAt ?? undefined,
		}));
}

export function normalizeGeminiConversationHistoryLimit(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 80;
	return Math.max(1, Math.min(500, Math.floor(value)));
}

export function shouldHydrateGeminiConversationHistory(
	options: Pick<BrowserProviderListOptions, "includeHistory"> | null | undefined,
): boolean {
	return options?.includeHistory === true;
}

async function hydrateGeminiConversationHistory(
	client: ChromeClient,
	historyLimit: number,
	abortSignal?: AbortSignal,
): Promise<void> {
	const limit = normalizeGeminiConversationHistoryLimit(historyLimit);
	const maxSteps = Math.max(3, Math.min(24, Math.ceil(limit / 12)));
	let stableSteps = 0;
	let previousCount = 0;
	for (let step = 0; step < maxSteps; step += 1) {
		if (abortSignal?.aborted) {
			const reason = abortSignal.reason;
			throw reason instanceof Error
				? reason
				: new Error("Gemini conversation history hydration was aborted.");
		}
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const list = document.querySelector('[data-test-id="all-conversations"]') || document.body;
        if (!list) return { ok: false, count: 0, scrollable: false };
        const count = new Set(Array.from(list.querySelectorAll('a[href*="/app/"]')).map((node) => node.href || node.getAttribute('href') || '')).size;
        const scrollRoot = (() => {
          let node = list;
          while (node && node !== document.body) {
            if (node.scrollHeight > node.clientHeight + 8) return node;
            node = node.parentElement;
          }
          return document.scrollingElement || document.documentElement;
        })();
        const before = scrollRoot.scrollTop;
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
        scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
        return {
          ok: true,
          count,
          scrollable: scrollRoot.scrollHeight > scrollRoot.clientHeight + 8,
          moved: scrollRoot.scrollTop !== before,
        };
      })()`,
			returnByValue: true,
		});
		const state = result?.value as
			| { ok?: boolean; count?: number; scrollable?: boolean; moved?: boolean }
			| undefined;
		const count = typeof state?.count === "number" ? state.count : 0;
		if (!state?.ok || count >= limit) return;
		stableSteps = count > previousCount ? 0 : stableSteps + 1;
		previousCount = count;
		if (!state.scrollable || (!state.moved && stableSteps >= 2)) return;
		await sleep(500);
	}
}

async function navigateToGeminiCreatePage(
	client: Pick<ChromeClient, "Page" | "Runtime">,
): Promise<void> {
	const settled = await navigateAndSettle(client, {
		url: GEMINI_GEM_CREATE_URL,
		routeExpression: `location.pathname === "/gems/create"`,
		routeDescription: "Gemini Gem create route",
		readyExpression: `Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)})) && Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))`,
		readyDescription: "Gemini Gem create surface",
		timeoutMs: 20_000,
		fallbackToLocationAssign: true,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:gemini", "navigate-create-page"),
	});
	if (!settled.ok) {
		throw new Error(
			`Gemini Gem create page did not become ready: ${settled.reason ?? settled.phase}`,
		);
	}
}

type GeminiReadyNavigationOptions = {
	forceNavigate?: boolean;
};

const GEMINI_GEMS_VIEW_ROUTE_EXPRESSION = `location.pathname === "/gems/view"`;
const GEMINI_GEMS_VIEW_READY_EXPRESSION = `Boolean(document.querySelector('button[data-test-id="open-bots-creation-window"]'))`;

function geminiEditRouteExpression(projectId: string): string {
	return `location.pathname === ${JSON.stringify(`/gems/edit/${projectId}`)}`;
}

function geminiEditReadyExpression(): string {
	return `Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)})) && Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))`;
}

async function isCurrentGeminiRouteReady(
	client: Pick<ChromeClient, "Runtime">,
	input: {
		routeExpression: string;
		routeDescription: string;
		readyExpression: string;
		readyDescription: string;
	},
): Promise<boolean> {
	const route = await waitForPredicate(client.Runtime, input.routeExpression, {
		timeoutMs: 500,
		description: input.routeDescription,
	});
	if (!route.ok) {
		return false;
	}
	const ready = await waitForPredicate(client.Runtime, input.readyExpression, {
		timeoutMs: 1_000,
		description: input.readyDescription,
	});
	return ready.ok;
}

async function navigateToGeminiGemsViewPage(
	client: Pick<ChromeClient, "Page" | "Runtime">,
	options: GeminiReadyNavigationOptions = {},
): Promise<void> {
	if (
		options.forceNavigate !== true &&
		(await isCurrentGeminiRouteReady(client, {
			routeExpression: GEMINI_GEMS_VIEW_ROUTE_EXPRESSION,
			routeDescription: "current Gemini Gem manager route",
			readyExpression: GEMINI_GEMS_VIEW_READY_EXPRESSION,
			readyDescription: "current Gemini Gem manager surface",
		}))
	) {
		return;
	}
	const settled = await navigateAndSettle(client, {
		url: GEMINI_GEMS_VIEW_URL,
		routeExpression: GEMINI_GEMS_VIEW_ROUTE_EXPRESSION,
		routeDescription: "Gemini Gem manager route",
		readyExpression: GEMINI_GEMS_VIEW_READY_EXPRESSION,
		readyDescription: "Gemini Gem manager surface",
		timeoutMs: 20_000,
		fallbackToLocationAssign: false,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:gemini", "navigate-gems-view-page"),
	});
	if (!settled.ok) {
		throw new Error(
			`Gemini Gem manager page did not become ready: ${settled.reason ?? settled.phase}`,
		);
	}
}

async function navigateToGeminiEditPage(
	client: Pick<ChromeClient, "Page" | "Runtime">,
	projectId: string,
	options: GeminiReadyNavigationOptions = {},
): Promise<void> {
	const routeExpression = geminiEditRouteExpression(projectId);
	const readyExpression = geminiEditReadyExpression();
	if (
		options.forceNavigate !== true &&
		(await isCurrentGeminiRouteReady(client, {
			routeExpression,
			routeDescription: `current Gemini Gem edit route for ${projectId}`,
			readyExpression,
			readyDescription: `current Gemini Gem edit surface for ${projectId}`,
		}))
	) {
		return;
	}
	const settled = await navigateAndSettle(client, {
		url: resolveGeminiEditProjectUrl(projectId),
		routeExpression,
		routeDescription: `Gemini Gem edit route for ${projectId}`,
		readyExpression,
		readyDescription: `Gemini Gem edit surface for ${projectId}`,
		timeoutMs: 20_000,
		fallbackToLocationAssign: true,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:gemini", "navigate-edit-page"),
	});
	if (!settled.ok) {
		throw new Error(
			`Gemini Gem edit page did not become ready: ${settled.reason ?? settled.phase}`,
		);
	}
}

async function navigateToGeminiConversationSurface(
	client: Pick<ChromeClient, "Page" | "Runtime">,
	url: string,
	options: { mutationAction?: string } = {},
): Promise<void> {
	if (await isCurrentGeminiConversationSurfaceReusable(client, url)) {
		return;
	}
	const routeExpression = geminiConversationRouteExpression(url);
	const readyExpression = geminiConversationSurfaceReadyExpression();
	const settled = await navigateAndSettle(client, {
		url,
		routeExpression,
		routeDescription: "Gemini conversation route",
		readyExpression,
		readyDescription: "Gemini conversation surface",
		timeoutMs: 20_000,
		fallbackToLocationAssign: true,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(
			client,
			"provider:gemini",
			options.mutationAction ?? "navigate-conversation-surface",
		),
	});
	if (settled.ok) {
		return;
	}
	await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
	if (routeExpression) {
		const routeReady = await waitForPredicate(client.Runtime, routeExpression, {
			timeoutMs: 5_000,
			description: "Gemini conversation route recovery",
		});
		if (!routeReady.ok) {
			const state = await collectGeminiConversationSurfaceState(
				client.Runtime,
				"route-recovery-failed",
			);
			const blockingReason = classifyGeminiBlockingState(state);
			if (blockingReason) {
				throw new Error(`${blockingReason} state=${JSON.stringify(state)}`);
			}
			throw new Error(
				`Gemini conversation surface did not become ready: ${settled.reason ?? settled.phase} state=${JSON.stringify(state)}`,
			);
		}
	}
	const recovered = await waitForPredicate(client.Runtime, readyExpression, {
		timeoutMs: 8_000,
		description: "Gemini conversation surface recovery",
	});
	if (!recovered.ok) {
		const state = await collectGeminiConversationSurfaceState(
			client.Runtime,
			"ready-recovery-failed",
		);
		const blockingReason = classifyGeminiBlockingState(state);
		if (blockingReason) {
			throw new Error(`${blockingReason} state=${JSON.stringify(state)}`);
		}
		throw new Error(
			`Gemini conversation surface did not become ready: ${settled.reason ?? settled.phase} state=${JSON.stringify(state)}`,
		);
	}
}

async function readGeminiLocationHref(Runtime: ChromeClient["Runtime"]): Promise<string | null> {
	const { result } = await Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	return typeof result?.value === "string" ? result.value : null;
}

async function isCurrentGeminiConversationSurfaceReusable(
	client: Pick<ChromeClient, "Runtime">,
	url: string,
): Promise<boolean> {
	const currentHref = await readGeminiLocationHref(client.Runtime).catch(() => null);
	if (!canReuseGeminiConversationSurfaceForTarget(currentHref, url)) {
		return false;
	}
	const targetConversationId = extractGeminiConversationIdFromUrl(url);
	if (targetConversationId) {
		await isGeminiConversationSurfaceAlreadyReady(client, targetConversationId).catch(() => false);
	}
	return true;
}

function extractGeminiConversationIdFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/^\/app\/([^/?#]+)$/i);
		const conversationId = match?.[1] ?? null;
		if (!conversationId || conversationId.toLowerCase() === "download") return null;
		return conversationId;
	} catch {
		return null;
	}
}

async function isGeminiConversationSurfaceAlreadyReady(
	client: Pick<ChromeClient, "Runtime">,
	conversationId: string,
): Promise<boolean> {
	const route = `/app/${conversationId}`;
	const ready = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      if (location.pathname !== ${JSON.stringify(route)}) return false;
      const hasUser = Array.from(document.querySelectorAll(
        'user-query, user-query-content, button.preview-image-button, img[data-test-id="uploaded-img"], button.new-file-preview-file'
      )).some((node) => visible(node));
      const hasAssistant = Array.from(document.querySelectorAll(
        'structured-content-container.model-response-text, structured-content-container, message-content, .response-content, model-response, model-response video, model-response img.image, model-response img.loaded'
      )).some((node) => visible(node));
      const hasCanvas = Array.from(document.querySelectorAll(
        '[data-test-id="container"], [data-test-id="artifact-text"], immersive-panel, .ProseMirror[aria-label="Canvas editor"]'
      )).some((node) => visible(node));
      return hasUser || hasAssistant || hasCanvas;
    })()`,
		returnByValue: true,
	});
	return ready.result?.value === true;
}

async function readGeminiActiveTabState(Runtime: ChromeClient["Runtime"]): Promise<{
	href: string;
	title: string;
	pathname: string;
	conversationId: string | null;
	bodyTextLength: number;
}> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const bodyText = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      const match = location.pathname.match(/^\\/app\\/([^/?#]+)/i);
      return {
        href: location.href,
        title: document.title || '',
        pathname: location.pathname || '',
        conversationId: match?.[1] ?? null,
        bodyTextLength: bodyText.length,
      };
    })()`,
		returnByValue: true,
	}).catch(() => ({ result: { value: null } }));
	const value = isRecord(result?.value) ? result.value : {};
	return {
		href: normalizeWhitespace(typeof value.href === "string" ? value.href : ""),
		title: normalizeWhitespace(typeof value.title === "string" ? value.title : ""),
		pathname: normalizeWhitespace(typeof value.pathname === "string" ? value.pathname : ""),
		conversationId:
			typeof value.conversationId === "string" && value.conversationId.trim().length > 0
				? value.conversationId.trim()
				: null,
		bodyTextLength:
			typeof value.bodyTextLength === "number" && Number.isFinite(value.bodyTextLength)
				? value.bodyTextLength
				: 0,
	};
}

async function collectGeminiConversationSurfaceState(
	Runtime: ChromeClient["Runtime"],
	phase: string,
): Promise<Record<string, unknown>> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || ''))
        .slice(0, 5);
      const anchors = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .filter((node) => visible(node))
        .map((node) => ({
          href: node instanceof HTMLAnchorElement ? node.href : '',
          text: normalize(node.textContent || ''),
        }))
        .slice(0, 8);
      const actionLabels = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean)
        .filter((label) => /more options|dismiss|delete/i.test(label))
        .slice(0, 12);
      return {
        href: location.href,
        title: document.title || '',
        hasConversationList: visible(document.querySelector('[data-test-id="all-conversations"]')),
        dialogs,
        anchors,
        actionLabels,
        bodyText: normalize(document.body?.innerText || '').slice(0, 800),
      };
    })()`,
		returnByValue: true,
	});
	return {
		phase,
		...(typeof result?.value === "object" && result?.value
			? (result.value as Record<string, unknown>)
			: {}),
	};
}

async function collectGeminiDeleteSurfaceState(
	Runtime: ChromeClient["Runtime"],
	phase: string,
): Promise<Record<string, unknown>> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const deleteButton = document.querySelector('button[data-test-id="delete-button"]');
      const confirmButton = document.querySelector('button[data-test-id="confirm-button"]');
      const confirmButtons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node))
        .map((node) => {
          const touchTarget = node instanceof HTMLElement ? node.querySelector('.mat-mdc-button-touch-target') : null;
          const rect = (touchTarget instanceof HTMLElement ? touchTarget : node).getBoundingClientRect();
          return {
            text: normalize(node.textContent || ''),
            ariaLabel: normalize(node.getAttribute('aria-label') || ''),
            disabled: node instanceof HTMLButtonElement ? node.disabled : false,
            ariaDisabled: normalize(node.getAttribute('aria-disabled') || ''),
            className: normalize(node.getAttribute('class') || '').slice(0, 200),
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        })
        .slice(0, 4);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.textContent || ''))
        .slice(0, 5);
      const visibleActionLabels = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter((label) => /more options|delete|dismiss/i.test(label))
        .slice(0, 20);
      return {
        href: location.href,
        deleteReady: deleteButton instanceof HTMLElement && visible(deleteButton),
        confirmReady: confirmButton instanceof HTMLElement && visible(confirmButton),
        confirmButtons,
        dialogs,
        visibleActionLabels,
      };
    })()`,
		returnByValue: true,
	});
	return {
		phase,
		...(typeof result?.value === "object" && result?.value
			? (result.value as Record<string, unknown>)
			: {}),
	};
}

async function waitForGeminiConversationListEntry(
	Runtime: ChromeClient["Runtime"],
	conversationId: string,
	options?: { timeoutMs?: number; description?: string },
): Promise<Awaited<ReturnType<typeof waitForPredicate>>> {
	await Runtime.evaluate({
		expression: `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (list instanceof HTMLElement) {
        list.scrollTop = 0;
        return { reset: true };
      }
      return { reset: false };
    })()`,
		returnByValue: true,
	});
	return waitForPredicate(
		Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const list = document.querySelector('[data-test-id="all-conversations"]');
      const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .find((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
      if (anchor instanceof HTMLAnchorElement) {
        const rowNode = anchor.closest('[data-test-id="conversation"], li, div, section, article') || anchor;
        if (!(rowNode instanceof Element)) {
          return null;
        }
        rowNode.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = rowNode.getBoundingClientRect();
        return {
          title: normalize(rowNode.textContent || anchor.textContent || '') || '${conversationId}',
          x: rect.left + rect.width - 12,
          y: rect.top + rect.height / 2,
          left: rect.left,
          visible: visible(rowNode),
        };
      }
      if (list instanceof HTMLElement && list.scrollHeight > list.clientHeight) {
        const before = list.scrollTop;
        const step = Math.max(Math.floor(list.clientHeight * 0.8), 200);
        list.scrollTop = Math.min(list.scrollHeight, before + step);
      }
      return null;
    })()`,
		{
			timeoutMs: options?.timeoutMs ?? 10_000,
			description:
				options?.description ?? `Gemini conversation list entry ready for ${conversationId}`,
		},
	);
}

async function openGeminiConversationFromRail(
	client: Pick<ChromeClient, "Runtime">,
	conversationId: string,
): Promise<boolean> {
	await ensureGeminiMainMenuOpen(client).catch(() => undefined);
	const ready = await waitForGeminiConversationListEntry(client.Runtime, conversationId, {
		timeoutMs: 12_000,
		description: `Gemini rail conversation entry ready for ${conversationId}`,
	});
	if (!ready.ok) {
		return false;
	}
	const mutationAudit = resolveMutationAudit(client);
	const fromUrl = mutationAudit ? await readGeminiLocationHref(client.Runtime) : null;
	const audit = beginBrowserMutation(mutationAudit, {
		kind: "in-page-click",
		source: resolveMutationSource(client, "provider:gemini", "rail-conversation-click"),
		requestedUrl: resolveGeminiConversationUrl(conversationId),
		fromUrl,
		toUrl: fromUrl,
	});
	const clicked = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .find((node) =>
          node instanceof HTMLAnchorElement &&
          visible(node) &&
          node.href.includes('/app/' + ${JSON.stringify(conversationId)}),
        );
      if (!(anchor instanceof HTMLAnchorElement)) return { clicked: false };
      anchor.scrollIntoView({ block: 'center', inline: 'center' });
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        anchor.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: 0,
          buttons: 1,
          view: window,
        }));
      }
      return { clicked: true, href: anchor.href || anchor.getAttribute('href') || '' };
    })()`,
		returnByValue: true,
	});
	if ((clicked.result?.value as { clicked?: boolean } | undefined)?.clicked !== true) {
		await audit.complete({
			outcome: "failed",
			toUrl: mutationAudit ? await readGeminiLocationHref(client.Runtime) : fromUrl,
			error: "Gemini conversation rail entry click failed.",
		});
		return false;
	}
	const routeReady = await waitForPredicate(
		client.Runtime,
		`(() => location.pathname === ${JSON.stringify(`/app/${conversationId}`)})()`,
		{
			timeoutMs: 12_000,
			description: `Gemini rail conversation route ready for ${conversationId}`,
		},
	);
	if (!routeReady.ok) {
		const state = await collectGeminiConversationSurfaceState(
			client.Runtime,
			"rail-open-route-failed",
		);
		const blockingReason = classifyGeminiBlockingState(state);
		if (blockingReason) {
			await audit.complete({
				outcome: "failed",
				toUrl: mutationAudit ? await readGeminiLocationHref(client.Runtime) : fromUrl,
				error: blockingReason,
			});
			throw new Error(`${blockingReason} state=${JSON.stringify(state)}`);
		}
		await audit.complete({
			outcome: "failed",
			toUrl: mutationAudit ? await readGeminiLocationHref(client.Runtime) : fromUrl,
			error: routeReady.description ?? "Gemini rail conversation route did not settle.",
		});
		return false;
	}
	await audit.complete({
		outcome: "succeeded",
		toUrl: mutationAudit ? await readGeminiLocationHref(client.Runtime) : fromUrl,
	});
	return true;
}

async function validateGeminiConversationUrlWithClient(
	client: Pick<ChromeClient, "Page" | "Runtime" | "Runtime">,
	conversationId: string,
): Promise<void> {
	const targetUrl = resolveGeminiConversationUrl(conversationId);
	const settled = await navigateAndSettle(client, {
		url: targetUrl,
		routeExpression: `location.pathname === ${JSON.stringify(`/app/${conversationId}`)}`,
		routeDescription: `Gemini conversation route for ${conversationId}`,
		readyExpression: `document.readyState === "interactive" || document.readyState === "complete"`,
		readyDescription: `Gemini conversation document ready for ${conversationId}`,
		timeoutMs: 12_000,
		fallbackToLocationAssign: true,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:gemini", "validate-conversation-url"),
	});
	if (!settled.ok) {
		throw new Error("Conversation URL is invalid or missing.");
	}
	const { result } = await client.Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	const href = typeof result?.value === "string" ? result.value : "";
	if (!href.includes(`/app/${conversationId}`)) {
		throw new Error("Conversation URL is invalid or missing.");
	}
	await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
	await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
	const rowReady = await waitForGeminiConversationListEntry(client.Runtime, conversationId, {
		timeoutMs: 8_000,
		description: `Gemini root conversation list entry visible for ${conversationId}`,
	});
	if (!rowReady.ok) {
		throw new Error("Conversation URL is invalid or missing.");
	}
}

async function dismissGeminiPreciseLocationDialog(Runtime: ChromeClient["Runtime"]): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { result } = await Runtime.evaluate({
			expression: `(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const visible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
          .filter((node) => visible(node) && normalize(node.textContent || '').includes('use your precise location'));
        if (!dialogs.length) return { present: false };
        let clicked = 0;
        for (const dialog of dialogs) {
          const dismissButtons = Array.from(dialog.querySelectorAll('button, [role="button"]'))
            .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || node.textContent || '') === 'dismiss');
          for (const button of dismissButtons) {
            if (!(button instanceof HTMLElement)) continue;
            button.click();
            clicked += 1;
          }
        }
        return { present: true, clicked };
      })()`,
			returnByValue: true,
		});
		const payload = (result?.value ?? {}) as { present?: boolean; clicked?: number };
		if (!payload.present) {
			return;
		}
		if ((payload.clicked ?? 0) < 1) {
			throw new Error(
				"Gemini precise-location dialog is blocking the conversation list, but no visible Dismiss button was found.",
			);
		}
		const dismissed = await waitForPredicate(
			Runtime,
			`(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const visible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const remaining = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
          .filter((node) => visible(node) && normalize(node.textContent || '').includes('use your precise location'));
        return remaining.length === 0 ? { dismissed: true } : null;
      })()`,
			{
				timeoutMs: 3_000,
				description: "Gemini precise-location dialog dismissed",
			},
		);
		if (dismissed.ok) {
			return;
		}
	}
	throw new Error(
		"Gemini precise-location dialog remained visible after repeated dismiss attempts.",
	);
}

async function ensureGeminiMainMenuOpen(client: Pick<ChromeClient, "Runtime">): Promise<void> {
	const listReady = await waitForPredicate(
		client.Runtime,
		`(() => {
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (!isVisible(list)) return null;
      const visibleConversationAnchors = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .filter((node) => isVisible(node)).length;
      return visibleConversationAnchors > 0 ? { open: true, visibleConversationAnchors } : null;
    })()`,
		{
			timeoutMs: 1_000,
			description: "Gemini conversation rail already open",
		},
	);
	if (listReady.ok) {
		return;
	}
	const opened = await pressButton(client.Runtime, {
		selector: 'button[aria-label="Open sidebar"], button[aria-label="Main menu"]',
		interactionStrategies: ["click", "pointer"],
		timeoutMs: 5_000,
	});
	if (!opened.ok) {
		throw new Error(opened.reason ?? "Gemini conversation rail toggle not found.");
	}
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (!isVisible(list)) return null;
      const visibleConversationAnchors = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .filter((node) => isVisible(node)).length;
      return visibleConversationAnchors > 0 ? { open: true, visibleConversationAnchors } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini conversation rail open",
		},
	);
	if (!ready.ok) {
		throw new Error("Gemini conversation rail did not open.");
	}
}

async function setGeminiPrompt(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	prompt: string,
): Promise<void> {
	const normalizedPrompt = normalizePromptText(prompt);
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dispatchClick = (target) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: 1,
            view: window,
          }));
        }
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (!(target instanceof HTMLElement)) return { ok: false };
      dispatchClick(target);
      target.focus();
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.value = '';
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'input' };
      }
      if (target.isContentEditable) {
        const selection = target.ownerDocument?.getSelection?.();
        if (selection) {
          const range = target.ownerDocument.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        target.replaceChildren();
        target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: '', inputType: 'deleteByCut' }));
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteByCut' }));
        return { ok: true, mode: 'contenteditable' };
      }
      return { ok: false };
    })()`,
		returnByValue: true,
	});
	if (!result?.value?.ok) {
		throw new Error("Gemini prompt composer did not become ready.");
	}

	await client.Input.insertText({ text: prompt });

	const verified = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '')
        .replace(/\\r\\n/g, '\\n')
        .replace(/\\u00a0/g, ' ')
        .split('\\n')
        .map((line) => line.replace(/\\s+/g, ' ').trim())
        .join('\\n')
        .trim();
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        return { text: normalize(target.value || '') };
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        return { text: normalize(target.innerText || target.textContent || '') };
      }
      return { text: '' };
    })()`,
		returnByValue: true,
	});
	if (normalizePromptText(String(verified.result?.value?.text ?? "")) === normalizedPrompt) {
		return;
	}

	const fallback = await client.Runtime.evaluate({
		expression: `(() => {
      const text = ${JSON.stringify(prompt)};
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.value = text;
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        target.replaceChildren();
        const lines = text.split(/\\r?\\n/);
        lines.forEach((line, index) => {
          if (index > 0) {
            target.appendChild(document.createElement('br'));
          }
          target.appendChild(document.createTextNode(line));
        });
        target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: text, inputType: 'insertFromPaste' }));
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
        return true;
      }
      return false;
    })()`,
		returnByValue: true,
	});
	if (!fallback.result?.value) {
		throw new Error("Gemini prompt text could not be inserted into the composer.");
	}
}

async function clickGeminiSendButton(
	client: Pick<ChromeClient, "Runtime" | "Input">,
): Promise<void> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_SEND_BUTTON_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node) && !(node instanceof HTMLButtonElement && node.disabled));
      if (!(target instanceof HTMLElement)) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
		returnByValue: true,
	});
	const point = (result?.value ?? null) as { x?: number; y?: number } | null;
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
		throw new Error("Gemini send button did not become ready.");
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: Number(point.x),
		y: Number(point.y),
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
}

async function clickGeminiSendButtonDom(Runtime: ChromeClient["Runtime"]): Promise<boolean> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_SEND_BUTTON_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => {
          if (!(node instanceof HTMLElement) || !visible(node)) return false;
          const button = node.matches('button') ? node : node.closest('button');
          if (button instanceof HTMLButtonElement && button.disabled) return false;
          if (button instanceof HTMLElement && button.getAttribute('aria-disabled') === 'true') return false;
          return true;
        });
      if (!(target instanceof HTMLElement)) return false;
      const button = target.matches('button') ? target : target.closest('button');
      const clickTarget = button instanceof HTMLElement ? button : target;
      clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
      clickTarget.click();
      return true;
    })()`,
		returnByValue: true,
	});
	return Boolean(result?.value);
}

async function pressGeminiComposerEnter(
	client: Pick<ChromeClient, "Runtime" | "Input">,
): Promise<boolean> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const selectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const target = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      if (!(target instanceof HTMLElement)) return false;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.focus();
      return document.activeElement === target || target.contains(document.activeElement);
    })()`,
		returnByValue: true,
	});
	if (!result?.value) {
		return false;
	}
	await client.Input.dispatchKeyEvent({
		type: "keyDown",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		nativeVirtualKeyCode: 13,
	});
	await client.Input.dispatchKeyEvent({
		type: "keyUp",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		nativeVirtualKeyCode: 13,
	});
	return true;
}

async function readGeminiPromptState(Runtime: ChromeClient["Runtime"]): Promise<
	{
		href: string;
		conversationId: string | null;
		composerText: string;
		userTexts: string[];
		assistantTexts: string[];
	} & GeminiActivityEvidence
> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const root =
        document.querySelector('[data-test-id="chat-history-container"]') ||
        document.querySelector('main') ||
        document.body;
      const composerSelectors = ${JSON.stringify(GEMINI_PROMPT_INPUT_SELECTORS)};
      const composer = composerSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));
      let composerText = '';
      if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
        composerText = normalize(composer.value || '');
      } else if (composer instanceof HTMLElement && composer.isContentEditable) {
        composerText = normalize(composer.innerText || composer.textContent || '');
      }
      const userTexts = [];
      const seenUsers = new Set();
      const userNodes = root
        ? Array.from(root.querySelectorAll('user-query, user-query-content, [data-test-id="user-query"], [data-test-id="user-query-content"]'))
        : [];
      for (const node of userNodes) {
        if (!(node instanceof HTMLElement) || !visible(node)) continue;
        const text = normalize(node.innerText || node.textContent || '');
        if (text.length < 3 || seenUsers.has(text)) continue;
        seenUsers.add(text);
        userTexts.push(text);
      }
      const assistantTexts = [];
      const seen = new Set();
      const responseSelectors = [
        'structured-content-container.model-response-text',
        'structured-content-container',
        'message-content',
        '.response-content .markdown',
        '.response-content',
        'model-response',
      ];
      const responseNodes = root
        ? Array.from(root.querySelectorAll(responseSelectors.join(',')))
        : [];
      for (const node of responseNodes) {
        if (!(node instanceof HTMLElement) || !visible(node)) continue;
        if (node.closest('form,[role="textbox"],textarea,input,button,nav,aside,[role="dialog"],[data-test-id="all-conversations"],user-query,user-query-content')) continue;
        const text = normalize(node.innerText || node.textContent || '');
        if (text.length < 3) continue;
        const childDuplicates = Array.from(node.children)
          .filter((child) => child instanceof HTMLElement && visible(child))
          .some((child) => normalize((child).innerText || child.textContent || '') === text);
        if (childDuplicates) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        assistantTexts.push(text);
      }
      if (assistantTexts.length === 0 && root) {
        const fallbackNodes = Array.from(root.querySelectorAll('p,li,pre,code,blockquote,div,span'));
        for (const node of fallbackNodes) {
          if (!(node instanceof HTMLElement) || !visible(node)) continue;
          if (node.closest('form,[role="textbox"],textarea,input,button,nav,aside,[role="dialog"],[data-test-id="all-conversations"],user-query,user-query-content')) continue;
          const text = normalize(node.innerText || node.textContent || '');
          if (text.length < 16) continue;
          const childDuplicates = Array.from(node.children)
            .filter((child) => child instanceof HTMLElement && visible(child))
            .some((child) => normalize((child).innerText || child.textContent || '') === text);
          if (childDuplicates) continue;
          if (seen.has(text)) continue;
          seen.add(text);
          assistantTexts.push(text);
        }
      }
      const activityEvidence = ${buildGeminiActivityEvidenceExpression()};
      const match = location.pathname.match(/^\\/app\\/([^/?#]+)/i);
      return {
        href: location.href,
        conversationId: match?.[1] ?? null,
        composerText,
        userTexts,
        assistantTexts,
        ...activityEvidence,
      };
    })()`,
		returnByValue: true,
	});
	const value = (result?.value ?? {}) as {
		href?: string;
		conversationId?: string | null;
		composerText?: string;
		userTexts?: string[];
		assistantTexts?: string[];
	};
	const activityEvidence = coerceGeminiActivityEvidence(value);
	return {
		href: typeof value.href === "string" ? value.href : "",
		conversationId:
			typeof value.conversationId === "string" && value.conversationId.trim()
				? value.conversationId
				: null,
		composerText:
			typeof value.composerText === "string" ? normalizePromptText(value.composerText) : "",
		userTexts: Array.isArray(value.userTexts)
			? value.userTexts.map((entry) => sanitizeGeminiUserText(entry))
			: [],
		assistantTexts: Array.isArray(value.assistantTexts)
			? value.assistantTexts.map((entry) => normalizeWhitespace(entry))
			: [],
		...activityEvidence,
	};
}

function geminiPromptWasSubmitted(
	baseline: { href: string; conversationId: string | null; userTexts?: string[] },
	state: {
		href: string;
		conversationId: string | null;
		composerText: string;
		userTexts: string[];
		isGenerating: boolean;
	},
	prompt: string,
): boolean {
	if (state.isGenerating) return true;
	if (state.conversationId && state.conversationId !== baseline.conversationId) return true;
	if (
		state.href &&
		state.href !== baseline.href &&
		/^https:\/\/gemini\.google\.com\/app\/[^/?#]+/i.test(state.href)
	)
		return true;

	const normalizedPrompt = sanitizeGeminiUserText(prompt);
	const baselineUsers = new Set(
		(baseline.userTexts ?? []).map((entry) => sanitizeGeminiUserText(entry)),
	);
	const submittedUserText = state.userTexts
		.map((entry) => sanitizeGeminiUserText(entry))
		.find(
			(entry) =>
				entry &&
				!baselineUsers.has(entry) &&
				(entry === normalizedPrompt || entry.includes(normalizedPrompt)),
		);
	if (submittedUserText) return true;

	return normalizePromptText(state.composerText).length === 0;
}

function geminiPromptVisibleInUserHistory(state: { userTexts: string[] }, prompt: string): boolean {
	const normalizedPrompt = sanitizeGeminiUserText(prompt);
	return state.userTexts
		.map((entry) => sanitizeGeminiUserText(entry))
		.some((entry) => entry && (entry === normalizedPrompt || entry.includes(normalizedPrompt)));
}

async function waitForGeminiPromptSubmit(
	Runtime: ChromeClient["Runtime"],
	baseline: { href: string; conversationId: string | null; userTexts?: string[] },
	prompt: string,
	timeoutMs: number,
): Promise<{ submitted: boolean; state: Awaited<ReturnType<typeof readGeminiPromptState>> }> {
	const deadline = Date.now() + timeoutMs;
	let state = await readGeminiPromptState(Runtime);
	while (Date.now() < deadline) {
		state = await readGeminiPromptState(Runtime);
		if (geminiPromptWasSubmitted(baseline, state, prompt)) {
			return { submitted: true, state };
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return { submitted: false, state };
}

async function submitGeminiPromptWithFallback(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	baseline: { href: string; conversationId: string | null; userTexts?: string[] },
	prompt: string,
	emitProgress?: (event: BrowserProviderPromptProgressEvent) => Promise<void>,
): Promise<Awaited<ReturnType<typeof readGeminiPromptState>>> {
	const attempts: Array<{ name: string; run: () => Promise<boolean> }> = [
		{
			name: "pointer click",
			run: async () => {
				await clickGeminiSendButton(client);
				return true;
			},
		},
		{
			name: "DOM click",
			run: () => clickGeminiSendButtonDom(client.Runtime),
		},
		{
			name: "Enter key",
			run: () => pressGeminiComposerEnter(client),
		},
	];
	let lastState = await readGeminiPromptState(client.Runtime);
	const attempted: string[] = [];
	for (const [index, attempt] of attempts.entries()) {
		attempted.push(attempt.name);
		const ran = await attempt.run().catch(() => false);
		await emitProgress?.({
			phase: "send_attempted",
			details: {
				method: attempt.name,
				attempt: index + 1,
				ran,
			},
		});
		if (!ran) continue;
		const result = await waitForGeminiPromptSubmit(client.Runtime, baseline, prompt, 10_000);
		lastState = result.state;
		await emitProgress?.({
			phase: "send_attempted",
			details: {
				method: attempt.name,
				attempt: index + 1,
				ran,
				submitted: result.submitted,
				href: lastState.href || null,
				conversationId: lastState.conversationId ?? null,
				isGenerating: lastState.isGenerating,
				hasGeneratedMedia: lastState.hasGeneratedMedia,
			},
		});
		if (result.submitted) {
			return lastState;
		}
	}
	const composerPreview = normalizePromptText(lastState.composerText).slice(0, 120);
	throw new Error(
		`Gemini prompt did not submit after ${attempted.join(", ")}. ` +
			`composerText=${JSON.stringify(composerPreview)} isGenerating=${lastState.isGenerating}`,
	);
}

async function waitForGeminiSubmittedPromptResult(
	Runtime: ChromeClient["Runtime"],
	baseline: { href: string; conversationId: string | null },
	initialState: Awaited<ReturnType<typeof readGeminiPromptState>>,
	prompt: string,
	timeoutMs: number,
): Promise<BrowserProviderPromptResult> {
	const deadline = Date.now() + timeoutMs;
	let state = initialState;
	while (Date.now() < deadline) {
		const conversationId = state.conversationId ?? baseline.conversationId;
		if (conversationId && (state.isGenerating || geminiPromptVisibleInUserHistory(state, prompt))) {
			return {
				text: "",
				conversationId,
				url: state.href || baseline.href,
			};
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
		state = await readGeminiPromptState(Runtime);
	}
	throw new Error("Gemini prompt submitted, but no conversation id became available for readback.");
}

async function waitForGeminiSubmittedMediaPromptResult(
	Runtime: ChromeClient["Runtime"],
	baseline: { href: string; conversationId: string | null },
	initialState: Awaited<ReturnType<typeof readGeminiPromptState>>,
	prompt: string,
	timeoutMs: number,
): Promise<BrowserProviderPromptResult> {
	const deadline = Date.now() + timeoutMs;
	let state = initialState;
	while (Date.now() < deadline) {
		const conversationId = state.conversationId ?? baseline.conversationId;
		const promptVisible = geminiPromptVisibleInUserHistory(state, prompt);
		if (conversationId && (state.isGenerating || promptVisible || state.href !== baseline.href)) {
			return {
				text: "",
				conversationId,
				url: state.href || baseline.href,
			};
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		state = await readGeminiPromptState(Runtime);
	}
	throw new Error(
		"Gemini media prompt submitted, but no conversation id became available for readback.",
	);
}

export function selectNewestGeminiAssistantText(
	baseline: string[],
	current: string[],
	prompt: string,
): string | null {
	const baselineSet = new Set(baseline.map((entry) => normalizePromptText(entry)));
	const normalizedPrompt = normalizePromptText(prompt);
	const candidates = current
		.map((entry) => sanitizeGeminiAssistantText(entry))
		.filter((entry) => entry && entry !== normalizedPrompt && !baselineSet.has(entry));
	return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function extractGeminiArtifactFileName(uri: string | null | undefined): string | null {
	if (typeof uri !== "string" || !uri.trim()) return null;
	try {
		const parsed = new URL(uri);
		const fromQuery = parsed.searchParams.get("filename");
		if (typeof fromQuery === "string" && fromQuery.trim()) {
			return fromQuery.trim();
		}
		const pathname = parsed.pathname || "";
		const lastSegment = pathname.split("/").filter(Boolean).pop();
		return typeof lastSegment === "string" && lastSegment.trim()
			? decodeURIComponent(lastSegment.trim())
			: null;
	} catch {
		return null;
	}
}

function prettifyGeminiArtifactBaseName(fileName: string): string {
	const trimmed = fileName.trim();
	if (!trimmed) return "";
	const withoutExtension = trimmed.replace(/\.[a-z0-9]{1,8}$/i, "").trim();
	const humanized = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
	if (!humanized || /^(video|track|audio|music)$/i.test(humanized)) return "";
	return humanized.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
}

export function inferGeminiGeneratedArtifactMediaType(
	artifact: Pick<ConversationArtifact, "kind" | "uri" | "metadata">,
): "music" | "video" | null {
	if (artifact.kind !== "generated") return null;
	const metadata = artifact.metadata ?? {};
	const directType =
		typeof metadata.mediaType === "string" ? metadata.mediaType.trim().toLowerCase() : "";
	if (directType === "music" || directType === "video") return directType;
	const downloadOptions = Array.isArray(metadata.downloadOptions)
		? metadata.downloadOptions.filter((entry): entry is string => typeof entry === "string")
		: [];
	const labelCandidates = [
		typeof metadata.shareLabel === "string" ? metadata.shareLabel : "",
		typeof metadata.downloadLabel === "string" ? metadata.downloadLabel : "",
		typeof metadata.playLabel === "string" ? metadata.playLabel : "",
		typeof metadata.muteLabel === "string" ? metadata.muteLabel : "",
		...downloadOptions,
	]
		.join(" ")
		.toLowerCase();
	if (/\b(track|music|song|remix|mp3|audio)\b/.test(labelCandidates)) return "music";
	if (/\b(video|movie)\b/.test(labelCandidates)) return "video";
	const fileName = extractGeminiArtifactFileName(artifact.uri);
	if (typeof fileName === "string" && /\b(track|music|song|remix)\b/i.test(fileName))
		return "music";
	if (typeof fileName === "string" && /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(fileName))
		return "music";
	return null;
}

export function normalizeGeminiConversationArtifacts(
	artifacts: ReadonlyArray<ConversationArtifact> | null | undefined,
): ConversationArtifact[] {
	if (!Array.isArray(artifacts) || artifacts.length === 0) return [];
	return artifacts.map((artifact, index) => {
		if (artifact.kind === "document") {
			const documentTitle =
				(typeof artifact.metadata?.documentTitle === "string" &&
					artifact.metadata.documentTitle.trim()) ||
				(typeof artifact.metadata?.taskTitle === "string" && artifact.metadata.taskTitle.trim()) ||
				"";
			if (!documentTitle) return artifact;
			return {
				...artifact,
				title: documentTitle,
			};
		}
		const mediaType = inferGeminiGeneratedArtifactMediaType(artifact);
		if (!mediaType) return artifact;
		const fileName =
			(typeof artifact.metadata?.fileName === "string" && artifact.metadata.fileName.trim()) ||
			extractGeminiArtifactFileName(artifact.uri);
		const titleFromFile =
			typeof fileName === "string" ? prettifyGeminiArtifactBaseName(fileName) : "";
		const fallbackTitle =
			mediaType === "music" ? `Generated track ${index + 1}` : `Generated video ${index + 1}`;
		const currentTitle = typeof artifact.title === "string" ? artifact.title.trim() : "";
		const normalizedTitle =
			titleFromFile ||
			(!currentTitle || /^generated media\b/i.test(currentTitle) ? fallbackTitle : currentTitle);
		return {
			...artifact,
			title: normalizedTitle,
			metadata: {
				...(artifact.metadata ?? {}),
				mediaType,
				...(fileName ? { fileName } : {}),
			},
		};
	});
}

export function normalizeGeminiConversationFiles(
	files: ReadonlyArray<FileRef> | null | undefined,
): FileRef[] {
	if (!Array.isArray(files) || files.length === 0) return [];
	const normalized: FileRef[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const remoteUrl = normalizeWhitespace(file.remoteUrl ?? "");
		const kind = normalizeWhitespace(
			file.metadata && typeof file.metadata === "object" && typeof file.metadata.kind === "string"
				? file.metadata.kind
				: "",
		).toLowerCase();
		const messageIndex =
			file.metadata &&
			typeof file.metadata === "object" &&
			typeof file.metadata.messageIndex === "number"
				? String(file.metadata.messageIndex)
				: "";
		const key =
			remoteUrl ||
			[
				normalizeWhitespace(file.name).toLowerCase(),
				kind,
				messageIndex,
				normalizeWhitespace(file.mimeType ?? "").toLowerCase(),
				normalizeWhitespace(file.source ?? "").toLowerCase(),
			].join("::");
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(file);
	}
	return normalized;
}

function stripAsciiControlCharacters(value: string): string {
	return Array.from(value)
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code >= 0x20 && code !== 0x7f;
		})
		.join("");
}

function sanitizeGeminiArtifactFileName(value: string | null | undefined): string {
	const normalized = stripAsciiControlCharacters(String(value ?? ""))
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 ? normalized.slice(0, 160) : "artifact";
}

function ensureGeminiArtifactExtension(name: string, fallbackExt: string): string {
	const trimmed = sanitizeGeminiArtifactFileName(name);
	if (/\.[a-z0-9]{1,8}$/i.test(trimmed)) {
		return trimmed;
	}
	return `${trimmed}${fallbackExt}`;
}

function geminiContentTypeToExtension(contentType: string | null | undefined): string {
	const normalized = String(contentType ?? "")
		.trim()
		.toLowerCase();
	if (normalized.includes("image/png")) return ".png";
	if (normalized.includes("image/jpeg")) return ".jpg";
	if (normalized.includes("image/webp")) return ".webp";
	if (normalized.includes("image/gif")) return ".gif";
	if (normalized.includes("video/mp4")) return ".mp4";
	if (normalized.includes("audio/mpeg")) return ".mp3";
	if (normalized.includes("audio/mp4")) return ".m4a";
	if (normalized.includes("text/plain")) return ".txt";
	return "";
}

function extractFilenameFromContentDisposition(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim();
	if (!normalized) return null;
	const utfMatch = normalized.match(/filename\*=UTF-8''([^;]+)/i);
	if (utfMatch?.[1]) {
		try {
			return decodeURIComponent(utfMatch[1]);
		} catch {
			return utfMatch[1];
		}
	}
	const quotedMatch = normalized.match(/filename="([^"]+)"/i);
	if (quotedMatch?.[1]) return quotedMatch[1];
	const plainMatch = normalized.match(/filename=([^;]+)/i);
	return plainMatch?.[1]?.trim() ?? null;
}

function inferGeminiArtifactMimeType(name: string | null | undefined): string | undefined {
	const lower = String(name || "").toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".mp4")) return "video/mp4";
	if (lower.endsWith(".mp3")) return "audio/mpeg";
	if (lower.endsWith(".m4a")) return "audio/mp4";
	if (lower.endsWith(".txt")) return "text/plain";
	return undefined;
}

async function configureGeminiDownloadBehaviorWithClient(
	client: ChromeClient,
	downloadPath: string,
): Promise<void> {
	const cdpClient = client as unknown as {
		send?: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
	};
	if (typeof cdpClient.send !== "function") {
		return;
	}
	try {
		await cdpClient.send("Browser.setDownloadBehavior", {
			behavior: "allow",
			downloadPath,
			eventsEnabled: true,
		});
		return;
	} catch {
		// Fall back to the older Page domain when Browser.setDownloadBehavior is unavailable.
	}
	try {
		await cdpClient.send("Page.setDownloadBehavior", {
			behavior: "allow",
			downloadPath,
		});
	} catch {
		// Leave downloads unconfigured if the target does not support either method.
	}
}

async function waitForGeminiDownloadedFile(
	destDir: string,
	timeoutMs = 20_000,
	options: { excludeNames?: ReadonlySet<string> } = {},
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	let lastPath: string | null = null;
	let lastSize = -1;
	let stableCount = 0;
	while (Date.now() < deadline) {
		const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
		const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
		const completed = fileNames.filter(
			(name) =>
				!name.endsWith(".crdownload") && !name.endsWith(".tmp") && !options.excludeNames?.has(name),
		);
		if (completed.length > 0) {
			const candidateName = completed.sort()[0];
			if (!candidateName) continue;
			const candidatePath = path.join(destDir, candidateName);
			const stat = await fs.stat(candidatePath).catch(() => null);
			if (stat) {
				if (candidatePath === lastPath && stat.size === lastSize) {
					stableCount += 1;
				} else {
					lastPath = candidatePath;
					lastSize = stat.size;
					stableCount = 0;
				}
				if (stableCount >= 1) {
					return candidatePath;
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return null;
}

const GEMINI_GENERATED_IMAGE_DOWNLOAD_BUTTON_ATTR = "data-auracall-gemini-generated-image-download";
const GEMINI_GENERATED_IMAGE_DOWNLOAD_CAPTURE_STATE_KEY =
	"__auracallGeminiGeneratedImageDownloadCapture";
const GEMINI_GENERATED_MEDIA_VARIANT_DOWNLOAD_CAPTURE_STATE_KEY =
	"__auracallGeminiGeneratedMediaVariantDownloadCapture";

function inferGeminiMusicDownloadVariantFromLabel(label: string | null | undefined): string | null {
	const normalized = String(label ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (/\bmp3\b|audio only/.test(normalized)) return "mp3";
	if (/cover art|album art|\bvideo\b/.test(normalized)) return "video_with_album_art";
	return null;
}

function fallbackGeminiMusicVariantExtension(label: string | null | undefined): string {
	return inferGeminiMusicDownloadVariantFromLabel(label) === "mp3" ? ".mp3" : ".mp4";
}

export function geminiGeneratedMediaVariantDownloadPointExpression(
	downloadVariantLabel: string,
): string {
	return `(async () => {
    const desired = ${JSON.stringify(downloadVariantLabel)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const compact = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const actionable = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const labelOf = (node) => normalize(
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.textContent ||
      ''
    );
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const desiredCompact = compact(desired);
    const readOptions = () => {
      const optionNodes = Array.from(document.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menu"] button, .mat-mdc-menu-panel button, .mat-mdc-menu-panel [role="menuitem"], .cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"]'
      )).filter((node) => actionable(node));
      return optionNodes.map((node) => ({ node, label: labelOf(node) })).filter((entry) => entry.label);
    };
    let options = readOptions();
    let target = options.find((entry) => compact(entry.label) === desiredCompact) ||
      options.find((entry) => compact(entry.label).includes(desiredCompact) || desiredCompact.includes(compact(entry.label)));
    if (!(target?.node instanceof HTMLElement)) {
      const triggers = Array.from(document.querySelectorAll('button, [role="button"]'))
        .filter((node) => actionable(node) && /download/i.test(labelOf(node)))
        .sort((a, b) => {
          const aLabel = labelOf(a).toLowerCase();
          const bLabel = labelOf(b).toLowerCase();
          const score = (label) => (label.includes('track') ? 3 : 0) + (label.includes('download') ? 1 : 0);
          return score(bLabel) - score(aLabel);
        });
      const trigger = triggers[0] || null;
      if (!(trigger instanceof HTMLElement)) {
        return { ok: false, reason: 'download-trigger-missing', labels: [] };
      }
      trigger.click();
      await sleep(300);
      options = readOptions();
      target = options.find((entry) => compact(entry.label) === desiredCompact) ||
        options.find((entry) => compact(entry.label).includes(desiredCompact) || desiredCompact.includes(compact(entry.label)));
    }
    if (!(target?.node instanceof HTMLElement)) {
      return { ok: false, reason: 'download-variant-missing', labels: options.map((entry) => entry.label).slice(0, 20) };
    }
    target.node.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = target.node.getBoundingClientRect();
    return {
      ok: true,
      label: target.label,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`;
}

async function materializeGeminiGeneratedMediaDownloadVariantWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
	destDir: string,
	downloadVariantLabel: string,
): Promise<FileRef | null> {
	await fs.mkdir(destDir, { recursive: true });
	const existingNames = new Set(
		(await fs.readdir(destDir, { withFileTypes: true }).catch(() => []))
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name),
	);
	await configureGeminiDownloadBehaviorWithClient(client, destDir);
	await armDownloadCapture(client.Runtime, {
		stateKey: GEMINI_GENERATED_MEDIA_VARIANT_DOWNLOAD_CAPTURE_STATE_KEY,
	});
	const located = await client.Runtime.evaluate({
		expression: geminiGeneratedMediaVariantDownloadPointExpression(downloadVariantLabel),
		awaitPromise: true,
		returnByValue: true,
	});
	const point = isRecord(located.result?.value) ? located.result.value : null;
	if (point?.ok !== true || typeof point.x !== "number" || typeof point.y !== "number") {
		return null;
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: point.x,
		y: point.y,
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	const capture = await waitForDownloadCapture(client.Runtime, {
		stateKey: GEMINI_GENERATED_MEDIA_VARIANT_DOWNLOAD_CAPTURE_STATE_KEY,
		timeoutMs: 1_500,
		pollMs: 100,
	});
	const capturedHref = normalizeWhitespace(capture.href ?? "");
	const capturedName = normalizeWhitespace(capture.downloadName ?? "");
	const downloadVariant = inferGeminiMusicDownloadVariantFromLabel(downloadVariantLabel);
	if (capturedHref) {
		try {
			const { buffer, contentType, contentDisposition } = await fetchGeminiBinaryWithClient(
				client,
				capturedHref,
			);
			const fallbackBaseName =
				extractFilenameFromContentDisposition(contentDisposition) ||
				extractGeminiArtifactFileName(capturedHref) ||
				capturedName ||
				artifact.title;
			const fileName = ensureGeminiArtifactExtension(
				fallbackBaseName,
				geminiContentTypeToExtension(contentType) ||
					fallbackGeminiMusicVariantExtension(downloadVariantLabel),
			);
			const destPath = path.join(destDir, fileName);
			await fs.writeFile(destPath, buffer);
			return {
				id: artifact.id,
				name: fileName,
				provider: "gemini",
				source: "conversation",
				size: buffer.byteLength,
				mimeType: contentType ?? inferGeminiArtifactMimeType(fileName),
				remoteUrl: capturedHref,
				localPath: destPath,
				metadata: {
					artifactKind: artifact.kind,
					artifactTitle: artifact.title,
					materialization: "generated-media-download-variant-anchor-fetch",
					...(artifact.metadata ?? {}),
					downloadLabel: downloadVariantLabel,
					...(downloadVariant ? { downloadVariant } : {}),
				},
			};
		} catch {
			// Fall through to browser-native download polling.
		}
	}
	const downloadedPath = await waitForGeminiDownloadedFile(destDir, 10_000, {
		excludeNames: existingNames,
	});
	if (!downloadedPath) {
		return null;
	}
	const stat = await fs.stat(downloadedPath);
	const fileName = path.basename(downloadedPath);
	return {
		id: artifact.id,
		name: fileName,
		provider: "gemini",
		source: "conversation",
		size: stat.size,
		mimeType: inferGeminiArtifactMimeType(fileName),
		remoteUrl: capturedHref || artifact.uri,
		localPath: downloadedPath,
		metadata: {
			artifactKind: artifact.kind,
			artifactTitle: artifact.title,
			materialization: capturedHref
				? "generated-media-download-variant-anchor-fetch"
				: "generated-media-download-variant",
			...(artifact.metadata ?? {}),
			downloadLabel: downloadVariantLabel,
			...(downloadVariant ? { downloadVariant } : {}),
		},
	};
}

export function geminiGeneratedImageDownloadButtonTagExpression(
	artifact: Pick<ConversationArtifact, "id" | "uri" | "messageIndex">,
): string {
	return `(() => {
    const attr = ${JSON.stringify(GEMINI_GENERATED_IMAGE_DOWNLOAD_BUTTON_ATTR)};
    const normalize = (value) => String(value || '').trim();
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    document.querySelectorAll('button[' + attr + '="true"]').forEach((node) => node.removeAttribute(attr));
    const expectedUri = normalize(${JSON.stringify(typeof artifact.uri === "string" ? artifact.uri : "")});
    const expectedMessageIndex = ${JSON.stringify(
			typeof artifact.messageIndex === "number" ? artifact.messageIndex : null,
		)};
    const parseArtifactOrdinal = (value) => {
      const match = String(value || '').match(/^(?:gemini-artifact:[^:]+:(?:fallback:)?\\d+:(\\d+))$/);
      if (!match) return null;
      const parsed = Number.parseInt(match[1] || '', 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const expectedArtifactOrdinal = parseArtifactOrdinal(${JSON.stringify(artifact.id)});
    const turns = Array.from(document.querySelectorAll('user-query, model-response'))
      .filter((node) => node instanceof HTMLElement && visible(node));
    turns.sort((left, right) => {
      const position = left.compareDocumentPosition(right);
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      return 0;
    });
    const assistantTurns = [];
    let logicalMessageIndex = 0;
    for (const node of turns) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches('user-query')) {
        logicalMessageIndex += 1;
        continue;
      }
      assistantTurns.push({ node, logicalMessageIndex });
      logicalMessageIndex += 1;
    }
    const taggedButton = (button) => {
      if (!(button instanceof HTMLElement) || !visible(button)) return false;
      button.setAttribute(attr, 'true');
      return true;
    };
    if (expectedUri) {
      for (const entry of assistantTurns) {
        const matchingImage = Array.from(entry.node.querySelectorAll('img[src]'))
          .find((candidate) =>
            candidate instanceof HTMLImageElement &&
            visible(candidate) &&
            normalize(candidate.currentSrc || candidate.src || candidate.getAttribute('src') || '') === expectedUri
          );
        if (!(matchingImage instanceof HTMLImageElement)) continue;
        const container =
          matchingImage.closest('image-renderer, image-response, .image-container, .image-button') ||
          matchingImage.parentElement ||
          entry.node;
        const directButton = container instanceof Element
          ? container.querySelector('button[data-test-id="download-generated-image-button"]')
          : null;
        if (taggedButton(directButton)) {
          return { ok: true, strategy: 'uri-match' };
        }
      }
    }
    const ordinalCandidates = assistantTurns.filter((entry) =>
      expectedMessageIndex === null || entry.logicalMessageIndex === expectedMessageIndex
    );
    for (const entry of ordinalCandidates) {
      const buttons = Array.from(entry.node.querySelectorAll('button[data-test-id="download-generated-image-button"]'))
        .filter((button) => button instanceof HTMLElement && visible(button));
      if (buttons.length === 0) continue;
      const targetIndex = expectedArtifactOrdinal !== null && expectedArtifactOrdinal < buttons.length ? expectedArtifactOrdinal : 0;
      const target = buttons[targetIndex];
      if (taggedButton(target)) {
        return { ok: true, strategy: 'ordinal-fallback', buttonCount: buttons.length, targetIndex };
      }
    }
    const fallback = Array.from(document.querySelectorAll('button[data-test-id="download-generated-image-button"]'))
      .find((button) => button instanceof HTMLElement && visible(button));
    if (taggedButton(fallback)) {
      return { ok: true, strategy: 'global-fallback' };
    }
    return { ok: false };
  })()`;
}

async function fetchGeminiBinaryWithClient(
	client: ChromeClient,
	url: string,
): Promise<{ buffer: Buffer; contentType: string | null; contentDisposition: string | null }> {
	const expression = `(async () => {
    const response = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return {
      ok: true,
      contentType,
      contentDisposition,
      base64: btoa(binary),
    };
  })()`;
	const result = await client.Runtime.evaluate({
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	const value = isRecord(result.result?.value) ? result.result.value : null;
	if (!value || value.ok !== true || typeof value.base64 !== "string") {
		const status = typeof value?.status === "number" ? ` (status ${value.status})` : "";
		throw new Error(`Gemini artifact binary fetch failed${status}`);
	}
	return {
		buffer: Buffer.from(value.base64, "base64"),
		contentType: typeof value.contentType === "string" ? value.contentType : null,
		contentDisposition:
			typeof value.contentDisposition === "string" ? value.contentDisposition : null,
	};
}

function isGeminiTextLikeFileName(fileName: string): boolean {
	const extension = path
		.extname(String(fileName ?? ""))
		.trim()
		.toLowerCase();
	return new Set([
		".txt",
		".md",
		".markdown",
		".json",
		".jsonl",
		".csv",
		".tsv",
		".js",
		".mjs",
		".cjs",
		".ts",
		".tsx",
		".jsx",
		".py",
		".rb",
		".go",
		".rs",
		".java",
		".kt",
		".swift",
		".html",
		".htm",
		".css",
		".scss",
		".less",
		".xml",
		".yml",
		".yaml",
		".toml",
		".ini",
		".cfg",
		".conf",
		".log",
		".sql",
		".sh",
		".bash",
		".zsh",
		".ps1",
	]).has(extension);
}

async function pressEscape(client: ChromeClient): Promise<void> {
	await client.Input.dispatchKeyEvent({
		type: "keyDown",
		key: "Escape",
		code: "Escape",
		windowsVirtualKeyCode: 27,
	});
	await client.Input.dispatchKeyEvent({
		type: "keyUp",
		key: "Escape",
		code: "Escape",
		windowsVirtualKeyCode: 27,
	});
}

async function copyGeminiDeepResearchContentsWithClient(
	client: ChromeClient,
): Promise<{ text: string; documentTitle?: string; taskTitle?: string } | null> {
	const stateKey = "__auracallGeminiDeepResearchCopyState";
	const setup = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const panel = Array.from(document.querySelectorAll('deep-research-immersive-panel, immersive-panel'))
        .find((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          Boolean(node.querySelector('button[data-test-id="export-menu-button"]')) &&
          !node.querySelector('button[aria-label="Share and export canvas"]'),
        );
      if (!(panel instanceof HTMLElement)) {
        return { ok: false, reason: 'missing-panel' };
      }
      const toolbarTitle = panel.querySelector(
        'toolbar [data-test-id="title"], toolbar [data-test-id="title-text"], .toolbar [data-test-id="title"], .toolbar [data-test-id="title-text"]',
      );
      const taskTitle = normalize(toolbarTitle?.textContent || '');
      const contentHeadings = Array.from(panel.querySelectorAll('h1, h2, h3'))
        .map((node) => normalize(node.textContent || ''))
        .filter((value) =>
          value &&
          value.toLowerCase() !== taskTitle.toLowerCase() &&
          !/^researching\b/i.test(value) &&
          !/^completed\b/i.test(value),
        );
      const documentTitle = contentHeadings[0] || taskTitle;
      const clipboard = navigator.clipboard;
      const state = {
        text: '',
        updatedAt: 0,
        taskTitle,
        documentTitle,
        originalWriteText: clipboard?.writeText?.bind(clipboard) || null,
        originalWrite: clipboard?.write?.bind(clipboard) || null,
      };
      if (clipboard) {
        clipboard.writeText = (value) => {
          state.text = typeof value === 'string' ? value : '';
          state.updatedAt = Date.now();
          return Promise.resolve();
        };
        clipboard.write = async (items) => {
          try {
            const list = Array.isArray(items) ? items : items ? [items] : [];
            for (const item of list) {
              if (!item) continue;
              const types = Array.isArray(item.types) ? item.types : [];
              if (types.includes('text/plain') && typeof item.getType === 'function') {
                const blob = await item.getType('text/plain');
                const text = await blob.text();
                state.text = typeof text === 'string' ? text : '';
                state.updatedAt = Date.now();
                break;
              }
            }
          } catch {
            state.text = '';
            state.updatedAt = Date.now();
          }
          return Promise.resolve();
        };
      }
      globalThis[${JSON.stringify(stateKey)}] = state;
      return { ok: true, taskTitle, documentTitle };
    })()`,
		returnByValue: true,
	});
	const setupValue = setup.result?.value;
	if (!isRecord(setupValue) || setupValue.ok !== true) {
		return null;
	}
	try {
		const exportClicked = await clickGeminiFeatureProbeTarget(client, [
			'button[data-test-id="export-menu-button"]',
		]);
		if (!exportClicked) {
			return null;
		}
		const copyReady = await waitForPredicate(
			client.Runtime,
			`(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        const button = Array.from(document.querySelectorAll('button[data-test-id="copy-button"], [role="menuitem"][data-test-id="copy-button"]'))
          .find((node) =>
            node instanceof HTMLElement &&
            visible(node) &&
            (node.classList.contains('menu-item-button') || node.getAttribute('role') === 'menuitem') &&
            normalize(node.textContent || node.getAttribute('aria-label') || '').includes('copy')
          );
        return button ? { ready: true } : null;
      })()`,
			{
				timeoutMs: 5_000,
				description: "Gemini deep research copy contents menu item",
			},
		);
		if (!copyReady.ok) {
			return null;
		}
		const copyClicked = await clickGeminiFeatureProbeTarget(
			client,
			[
				'button[data-test-id="copy-button"].menu-item-button',
				'[role="menuitem"][data-test-id="copy-button"]',
			],
			{ requireText: "copy contents" },
		);
		if (!copyClicked) {
			return null;
		}
		const copied = await waitForPredicate(
			client.Runtime,
			`(() => {
        const state = globalThis[${JSON.stringify(stateKey)}];
        if (!state || typeof state !== 'object') return null;
        if (typeof state.text !== 'string' || !state.text.trim()) return null;
        if (Date.now() - (Number(state.updatedAt) || 0) < 250) return null;
        return {
          text: state.text,
          taskTitle: typeof state.taskTitle === 'string' ? state.taskTitle : '',
          documentTitle: typeof state.documentTitle === 'string' ? state.documentTitle : '',
        };
      })()`,
			{
				timeoutMs: 10_000,
				description: "Gemini deep research clipboard contents",
			},
		);
		if (!copied.ok || !isRecord(copied.value) || typeof copied.value.text !== "string") {
			return null;
		}
		return {
			text: copied.value.text,
			documentTitle:
				typeof copied.value.documentTitle === "string" ? copied.value.documentTitle : undefined,
			taskTitle: typeof copied.value.taskTitle === "string" ? copied.value.taskTitle : undefined,
		};
	} finally {
		await client.Runtime.evaluate({
			expression: `(() => {
        const state = globalThis[${JSON.stringify(stateKey)}];
        const clipboard = navigator.clipboard;
        if (state && clipboard) {
          if (typeof state.originalWriteText === 'function') clipboard.writeText = state.originalWriteText;
          if (typeof state.originalWrite === 'function') clipboard.write = state.originalWrite;
        }
        try {
          delete globalThis[${JSON.stringify(stateKey)}];
        } catch {}
        return true;
      })()`,
			returnByValue: true,
		}).catch(() => undefined);
	}
}

async function clickGeminiConversationFileChip(
	client: ChromeClient,
	fileName: string,
	_targetOrdinal?: number,
): Promise<boolean> {
	const normalizedName = normalizeWhitespace(fileName).toLowerCase();
	const located = await client.Runtime.evaluate({
		expression: `(() => {
      const targetName = ${JSON.stringify(normalizedName)};
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const chips = Array.from(document.querySelectorAll(
        '[data-test-id="uploaded-file"], [data-test-id="file-preview"], button.new-file-preview-file, button.preview-image-button, uploader-file-preview, uploader-file-preview-container'
      )).filter((node) => node instanceof HTMLElement && visible(node));
      let ordinal = 0;
      for (const chip of chips) {
        if (!(chip instanceof HTMLElement)) continue;
        const directPreviewButton =
          chip.matches('button.new-file-preview-file, button.preview-image-button')
            ? chip
            : chip.querySelector('button.new-file-preview-file, button.preview-image-button');
        const removeButton = chip.querySelector('button[aria-label^="Remove file "]');
        const labeledButton = chip.querySelector('button[aria-label]') || chip.querySelector('[aria-label]');
        const imagePreview = chip.matches('img[data-test-id="image-preview"], img[data-test-id="uploaded-img"]')
          ? chip
          : chip.querySelector('img[data-test-id="image-preview"], img[data-test-id="uploaded-img"]');
        const currentOrdinal = ordinal;
        ordinal += 1;
        const explicitName = labeledButton instanceof HTMLElement
          ? normalize(labeledButton.getAttribute('aria-label') || labeledButton.getAttribute('title') || '')
          : '';
        const directButtonName = directPreviewButton instanceof HTMLElement
          ? normalize(directPreviewButton.getAttribute('aria-label') || directPreviewButton.getAttribute('title') || '')
          : '';
        const removeName = removeButton instanceof HTMLElement
          ? normalize((removeButton.getAttribute('aria-label') || '').replace(/^Remove file\\s+/i, ''))
          : '';
        const visibleName = normalize(
          chip.querySelector('.new-file-name, [data-test-id="file-name"]')?.textContent || ''
        );
        const visibleType = normalize(
          chip.querySelector('.new-file-type, .file-type')?.textContent || ''
        );
        let name = directButtonName || explicitName || removeName || visibleName;
        if (name && visibleType && !/\\.[a-z0-9]{1,8}$/i.test(name) && /^[a-z0-9]{1,8}$/i.test(visibleType)) {
          name = name + '.' + visibleType.toLowerCase();
        }
        if (!name && imagePreview instanceof HTMLImageElement) {
          name = normalize(imagePreview.getAttribute('aria-label') || imagePreview.getAttribute('alt') || '');
        }
        if (name !== targetName && (typeof targetOrdinal !== 'number' || currentOrdinal !== targetOrdinal)) continue;
        const clickable =
          (directPreviewButton instanceof HTMLElement ? directPreviewButton : null) ||
          chip.querySelector('button.image-preview, button.clickable, .file-preview.clickable, .image-preview.clickable') ||
          chip;
        if (!(clickable instanceof HTMLElement)) continue;
        clickable.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = clickable.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      return null;
    })()`,
		returnByValue: true,
	});
	const point = located.result?.value as { x?: number; y?: number } | undefined;
	if (typeof point?.x !== "number" || typeof point?.y !== "number") {
		return false;
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: point.x,
		y: point.y,
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	return true;
}

async function readGeminiConversationFilePreviewState(Runtime: ChromeClient["Runtime"]): Promise<{
	directUrl: string | null;
	imageUrl: string | null;
	textContent: string | null;
} | null> {
	const result = await Runtime.evaluate({
		expression: `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = Array.from(document.querySelectorAll(
        '[role="dialog"], .cdk-overlay-pane, mat-dialog-container, .mat-mdc-dialog-container, .docs-preview, .preview-container'
      ))
        .filter((node) => node instanceof HTMLElement && visible(node))
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        });
      const root = roots[0] instanceof HTMLElement ? roots[0] : document.body;
      const directAnchor = root.querySelector('a[href][download], a[href*="usercontent"], a[href*="googleusercontent"], a[href*="download"]');
      const image = root.querySelector('img[src]');
      const textCandidates = Array.from(root.querySelectorAll('pre, code, textarea, .cm-content, [role="textbox"], article, [role="document"]'))
        .filter((node) => node instanceof HTMLElement && visible(node))
        .map((node) => String(node.textContent || '').trim())
        .filter((value) => value.length > 0)
        .sort((left, right) => right.length - left.length);
      return {
        directUrl: directAnchor instanceof HTMLAnchorElement ? (directAnchor.getAttribute('href') || directAnchor.href || null) : null,
        imageUrl: image instanceof HTMLImageElement ? (image.currentSrc || image.src || image.getAttribute('src') || null) : null,
        textContent: textCandidates[0] || null,
      };
    })()`,
		returnByValue: true,
	});
	const value = isRecord(result.result?.value) ? result.result.value : null;
	if (!value) return null;
	return {
		directUrl:
			typeof value.directUrl === "string" && value.directUrl.trim() ? value.directUrl.trim() : null,
		imageUrl:
			typeof value.imageUrl === "string" && value.imageUrl.trim() ? value.imageUrl.trim() : null,
		textContent:
			typeof value.textContent === "string" && value.textContent.trim() ? value.textContent : null,
	};
}

async function captureGeminiVisibleImageToFile(
	client: Pick<ChromeClient, "Runtime" | "Page">,
	destPath: string,
): Promise<boolean> {
	const geometry = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const images = Array.from(document.querySelectorAll(
        '[role="dialog"] img[src], .cdk-overlay-pane img[src], mat-dialog-container img[src], .mat-mdc-dialog-container img[src], img[data-test-id="uploaded-img"], button.preview-image-button img[src], model-response img.image[src], model-response img.loaded[src], model-response button.image-button img[src]'
      ))
        .filter((entry) => entry instanceof HTMLImageElement && visible(entry))
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        });
      const image = images[0];
      if (!(image instanceof HTMLImageElement)) return null;
      const rect = image.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    })()`,
		returnByValue: true,
	});
	const value = isRecord(geometry.result?.value) ? geometry.result.value : null;
	const x = typeof value?.x === "number" ? value.x : NaN;
	const y = typeof value?.y === "number" ? value.y : NaN;
	const width = typeof value?.width === "number" ? value.width : NaN;
	const height = typeof value?.height === "number" ? value.height : NaN;
	if (
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return false;
	}
	if (width < 2 || height < 2) {
		return false;
	}
	const screenshot = await client.Page.captureScreenshot({
		format: "png",
		clip: {
			x,
			y,
			width,
			height,
			scale: 1,
		},
	});
	if (typeof screenshot.data !== "string" || !screenshot.data) {
		return false;
	}
	await fs.writeFile(destPath, Buffer.from(screenshot.data, "base64"));
	return true;
}

async function readGeminiVisibleConversationUploadFiles(
	Runtime: ChromeClient["Runtime"],
	conversationId: string,
	messages: ConversationMessage[],
): Promise<FileRef[]> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const buttonHosts = Array.from(document.querySelectorAll(
        'user-query button.new-file-preview-file, user-query button.preview-image-button, user-query [data-test-id="uploaded-file"], user-query [data-test-id="file-preview"]'
      )).filter((entry) => entry instanceof HTMLElement && visible(entry));
      const fallbackImageNodes = Array.from(document.querySelectorAll('user-query img[data-test-id="uploaded-img"]'))
        .filter((entry) => entry instanceof HTMLElement && visible(entry));
      const chips = [];
      const seenChips = new Set();
      for (const entry of [...buttonHosts, ...fallbackImageNodes]) {
        const chip =
          entry.closest('button.new-file-preview-file, button.preview-image-button, [data-test-id="uploaded-file"], [data-test-id="file-preview"]')
          || entry;
        if (!(chip instanceof Element) || seenChips.has(chip)) continue;
        seenChips.add(chip);
        chips.push(chip);
      }
      const seenKeys = new Set();
      let ordinal = 0;
      return chips.map((entry) => {
        const chip = entry;
        const button =
          chip instanceof Element && chip.matches('button.new-file-preview-file, button.preview-image-button')
            ? chip
            : chip instanceof Element
              ? chip.querySelector('button.new-file-preview-file, button.preview-image-button')
              : null;
        const image =
          chip instanceof Element && chip.matches('img[data-test-id="uploaded-img"]')
            ? chip
            : chip instanceof Element
              ? chip.querySelector('img[data-test-id="uploaded-img"]')
              : null;
        const visibleName = normalize(
          chip instanceof Element
            ? (chip.querySelector('.new-file-name, [data-test-id="file-name"]')?.textContent || '')
            : '',
        );
        const visibleType = normalize(
          chip instanceof Element
            ? (chip.querySelector('.new-file-type, .file-type')?.textContent || '')
            : '',
        );
        const remoteUrl = image instanceof HTMLImageElement
          ? normalize(image.currentSrc || image.src || image.getAttribute('src') || '')
          : '';
        let name = normalize(
          button instanceof HTMLElement
            ? (button.getAttribute('aria-label') || button.getAttribute('title') || '')
            : '',
        );
        if (visibleName) {
          name = visibleName;
          if (visibleType && !/\\.[a-z0-9]{1,8}$/i.test(name) && /^[a-z0-9]{1,8}$/i.test(visibleType)) {
            name = name + '.' + visibleType.toLowerCase();
          }
        }
        if ((!name || /show the uploaded image in a lightbox/i.test(name)) && remoteUrl) {
          name = 'uploaded-image-' + (ordinal + 1);
        }
        if (!name) return null;
        const dedupeKey = remoteUrl ? normalize(remoteUrl) : normalize(name);
        if (seenKeys.has(dedupeKey)) return null;
        seenKeys.add(dedupeKey);
        const file = {
          id: ${JSON.stringify("gemini-conversation-file:")} + ${JSON.stringify(conversationId)} + ':' + ordinal + ':' + name,
          name,
          remoteUrl: remoteUrl || null,
          mimeType: remoteUrl ? 'image/*' : null,
          kind: remoteUrl ? 'uploaded-image' : 'uploaded-file',
        };
        ordinal += 1;
        return file;
      }).filter(Boolean);
    })()`,
		returnByValue: true,
	});
	const rows = Array.isArray(result?.value) ? result.value : [];
	let messageIndex: number | undefined;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") {
			messageIndex = index;
			break;
		}
	}
	return rows
		.filter(
			(
				entry,
			): entry is {
				id: string;
				name: string;
				remoteUrl: string | null;
				mimeType: string | null;
				kind: string | null;
			} => isRecord(entry),
		)
		.map((entry) => ({
			id: typeof entry.id === "string" ? entry.id : "",
			name: typeof entry.name === "string" ? entry.name : "",
			provider: "gemini" as const,
			source: "conversation" as const,
			mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
			remoteUrl: typeof entry.remoteUrl === "string" ? entry.remoteUrl : undefined,
			metadata: {
				messageIndex,
				kind: typeof entry.kind === "string" ? entry.kind : "uploaded-file",
				hasDirectUrl: typeof entry.remoteUrl === "string" && entry.remoteUrl.length > 0,
			},
		}))
		.filter((entry) => entry.id && entry.name);
}

async function downloadGeminiConversationFileWithClient(
	client: ChromeClient,
	conversationId: string,
	fileId: string,
	destPath: string,
	options: { allowNavigation?: boolean } = {},
): Promise<void> {
	const refreshed = await readGeminiConversationContextWithClient(client, conversationId, {
		allowNavigation: options.allowNavigation,
	});
	const file = (Array.isArray(refreshed.files) ? refreshed.files : []).find(
		(candidate) => candidate.id === fileId,
	);
	if (!file) {
		throw new Error(`Gemini conversation file ${fileId} was not found on ${conversationId}.`);
	}
	const directUrl = normalizeWhitespace(file.remoteUrl ?? "");
	if (directUrl) {
		try {
			const { buffer } = await fetchGeminiBinaryWithClient(client, directUrl);
			await fs.writeFile(destPath, buffer);
			return;
		} catch (error) {
			const isUploadedImage =
				file.metadata &&
				typeof file.metadata === "object" &&
				file.metadata.kind === "uploaded-image";
			if (!isUploadedImage) {
				throw error;
			}
		}
	}
	let targetOrdinal: number | undefined;
	const ordinalMatch = file.id.match(
		new RegExp(`^gemini-conversation-file:${conversationId}:(\\d+):`),
	);
	if (ordinalMatch) {
		const parsed = Number.parseInt(ordinalMatch[1] ?? "", 10);
		if (Number.isFinite(parsed)) {
			targetOrdinal = parsed;
		}
	}
	const clicked = await clickGeminiConversationFileChip(client, file.name, targetOrdinal);
	if (!clicked) {
		if (
			file.metadata &&
			typeof file.metadata === "object" &&
			file.metadata.kind === "uploaded-image"
		) {
			const captured = await captureGeminiVisibleImageToFile(client, destPath);
			if (captured) {
				return;
			}
		}
		throw new Error(`Gemini conversation file preview did not open for ${file.name}.`);
	}
	try {
		const preview = await waitForPredicate(
			client.Runtime,
			`(() => {
        const visible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const root = Array.from(document.querySelectorAll('[role="dialog"], .cdk-overlay-pane, mat-dialog-container, .mat-mdc-dialog-container'))
          .find((node) => node instanceof HTMLElement && visible(node));
        if (!root && !Array.from(document.querySelectorAll('img[src], pre, code, textarea')).some((node) => visible(node))) {
          return null;
        }
        return { ready: true };
      })()`,
			{ timeoutMs: 5_000 },
		);
		if (!preview) {
			throw new Error(`Gemini conversation file preview did not hydrate for ${file.name}.`);
		}
		const previewState = await readGeminiConversationFilePreviewState(client.Runtime);
		if (previewState?.directUrl) {
			const { buffer } = await fetchGeminiBinaryWithClient(client, previewState.directUrl);
			await fs.writeFile(destPath, buffer);
			return;
		}
		if (previewState?.imageUrl) {
			try {
				const { buffer } = await fetchGeminiBinaryWithClient(client, previewState.imageUrl);
				await fs.writeFile(destPath, buffer);
				return;
			} catch {
				const captured = await captureGeminiVisibleImageToFile(client, destPath);
				if (captured) {
					return;
				}
			}
		}
		if (
			file.metadata &&
			typeof file.metadata === "object" &&
			file.metadata.kind === "uploaded-image"
		) {
			const captured = await captureGeminiVisibleImageToFile(client, destPath);
			if (captured) {
				return;
			}
		}
		if (previewState?.textContent && isGeminiTextLikeFileName(file.name)) {
			const text = previewState.textContent.endsWith("\n")
				? previewState.textContent
				: `${previewState.textContent}\n`;
			await fs.writeFile(destPath, text, "utf8");
			return;
		}
		throw new Error(
			`Gemini conversation file ${file.name} did not expose a downloadable or text-preview surface.`,
		);
	} finally {
		await pressEscape(client).catch(() => undefined);
	}
}

async function materializeGeminiConversationArtifactWithClient(
	client: ChromeClient,
	conversationId: string,
	artifact: ConversationArtifact,
	destDir: string,
	options: { allowNavigation?: boolean; downloadVariantLabel?: string | null } = {},
): Promise<FileRef | null> {
	const directFile = await materializeGeminiArtifactDirectRemoteUrlWithClient(
		client,
		artifact,
		destDir,
	);
	if (directFile) return directFile;
	const refreshed = await readGeminiConversationContextWithClient(client, conversationId, {
		allowNavigation: options.allowNavigation,
	});
	const resolvedArtifact =
		normalizeGeminiConversationArtifacts(refreshed.artifacts).find(
			(candidate) => candidate.id === artifact.id,
		) ?? artifact;

	if (resolvedArtifact.kind === "document") {
		try {
			const copied = await copyGeminiDeepResearchContentsWithClient(client);
			const contentText =
				copied?.text?.trim() ||
				(resolvedArtifact.metadata && typeof resolvedArtifact.metadata.contentText === "string"
					? resolvedArtifact.metadata.contentText.trim()
					: "");
			if (!contentText) return null;
			const fileName = ensureGeminiArtifactExtension(
				copied?.documentTitle || resolvedArtifact.title,
				".txt",
			);
			const destPath = path.join(destDir, fileName);
			await fs.writeFile(
				destPath,
				contentText.endsWith("\n") ? contentText : `${contentText}\n`,
				"utf8",
			);
			const stat = await fs.stat(destPath);
			return {
				id: resolvedArtifact.id,
				name: fileName,
				provider: "gemini",
				source: "conversation",
				size: stat.size,
				mimeType: "text/plain",
				remoteUrl: resolvedArtifact.uri,
				localPath: destPath,
				metadata: {
					artifactKind: resolvedArtifact.kind,
					artifactTitle: resolvedArtifact.title,
					materialization: copied?.text ? "deep-research-copy-contents" : "document-content-text",
					...(resolvedArtifact.metadata ?? {}),
					...(copied?.documentTitle ? { documentTitle: copied.documentTitle } : {}),
					...(copied?.taskTitle ? { taskTitle: copied.taskTitle } : {}),
				},
			};
		} finally {
			await pressEscape(client).catch(() => undefined);
		}
	}

	if (resolvedArtifact.kind === "canvas") {
		const contentText =
			resolvedArtifact.metadata && typeof resolvedArtifact.metadata.contentText === "string"
				? resolvedArtifact.metadata.contentText.trim()
				: "";
		if (!contentText) return null;
		const fileName = ensureGeminiArtifactExtension(resolvedArtifact.title, ".txt");
		const destPath = path.join(destDir, fileName);
		await fs.writeFile(
			destPath,
			contentText.endsWith("\n") ? contentText : `${contentText}\n`,
			"utf8",
		);
		const stat = await fs.stat(destPath);
		return {
			id: resolvedArtifact.id,
			name: fileName,
			provider: "gemini",
			source: "conversation",
			size: stat.size,
			mimeType: "text/plain",
			remoteUrl: resolvedArtifact.uri,
			localPath: destPath,
			metadata: {
				artifactKind: resolvedArtifact.kind,
				artifactTitle: resolvedArtifact.title,
				materialization: "canvas-content-text",
				...(resolvedArtifact.metadata ?? {}),
			},
		};
	}

	if (resolvedArtifact.kind === "generated" || resolvedArtifact.kind === "image") {
		const remoteUrl = typeof resolvedArtifact.uri === "string" ? resolvedArtifact.uri.trim() : "";
		if (!remoteUrl) return null;
		const downloadVariantLabel = normalizeWhitespace(options.downloadVariantLabel ?? "");
		if (
			resolvedArtifact.kind === "generated" &&
			resolvedArtifact.metadata?.mediaType === "music" &&
			downloadVariantLabel
		) {
			const variantFile = await materializeGeminiGeneratedMediaDownloadVariantWithClient(
				client,
				resolvedArtifact,
				destDir,
				downloadVariantLabel,
			);
			if (variantFile) {
				return variantFile;
			}
			return null;
		}
		if (
			resolvedArtifact.kind === "image" &&
			resolvedArtifact.metadata &&
			resolvedArtifact.metadata.hasDownloadButton
		) {
			await fs.mkdir(destDir, { recursive: true });
			await configureGeminiDownloadBehaviorWithClient(client, destDir);
			const tagged = await client.Runtime.evaluate({
				expression: geminiGeneratedImageDownloadButtonTagExpression(resolvedArtifact),
				returnByValue: true,
			});
			const taggedValue = isRecord(tagged.result?.value) ? tagged.result.value : null;
			if (taggedValue?.ok === true) {
				await armDownloadCapture(client.Runtime, {
					stateKey: GEMINI_GENERATED_IMAGE_DOWNLOAD_CAPTURE_STATE_KEY,
				});
				const clickResult = await client.Runtime.evaluate({
					expression: `(() => {
            const button = document.querySelector(${JSON.stringify(
							`button[${GEMINI_GENERATED_IMAGE_DOWNLOAD_BUTTON_ATTR}="true"]`,
						)});
            if (!(button instanceof HTMLElement)) {
              return { ok: false, reason: 'Gemini generated image download button missing before click' };
            }
            button.click();
            return { ok: true };
          })()`,
					returnByValue: true,
				});
				const clicked = isRecord(clickResult.result?.value) ? clickResult.result.value : null;
				if (clicked?.ok === true) {
					const capture = await waitForDownloadCapture(client.Runtime, {
						stateKey: GEMINI_GENERATED_IMAGE_DOWNLOAD_CAPTURE_STATE_KEY,
						timeoutMs: 1_500,
						pollMs: 100,
					});
					const capturedHref = normalizeWhitespace(capture.href ?? "");
					const capturedName = normalizeWhitespace(capture.downloadName ?? "");
					if (capturedHref) {
						try {
							const { buffer, contentType, contentDisposition } = await fetchGeminiBinaryWithClient(
								client,
								capturedHref,
							);
							const fallbackBaseName =
								extractFilenameFromContentDisposition(contentDisposition) ||
								extractGeminiArtifactFileName(capturedHref) ||
								capturedName ||
								resolvedArtifact.title;
							const fileName = ensureGeminiArtifactExtension(
								fallbackBaseName,
								geminiContentTypeToExtension(contentType) || ".png",
							);
							const destPath = path.join(destDir, fileName);
							await fs.writeFile(destPath, buffer);
							return {
								id: resolvedArtifact.id,
								name: fileName,
								provider: "gemini",
								source: "conversation",
								size: buffer.byteLength,
								mimeType: contentType ?? inferGeminiArtifactMimeType(fileName),
								remoteUrl: capturedHref,
								localPath: destPath,
								metadata: {
									artifactKind: resolvedArtifact.kind,
									artifactTitle: resolvedArtifact.title,
									materialization: "download-button-anchor-fetch",
									...(resolvedArtifact.metadata ?? {}),
								},
							};
						} catch {
							// Fall through to filesystem download polling and existing fetch/screenshot fallbacks.
						}
					}
					const downloadedPath = await waitForGeminiDownloadedFile(destDir, 10_000);
					if (downloadedPath) {
						const stat = await fs.stat(downloadedPath);
						const fileName = path.basename(downloadedPath);
						return {
							id: resolvedArtifact.id,
							name: fileName,
							provider: "gemini",
							source: "conversation",
							size: stat.size,
							mimeType: inferGeminiArtifactMimeType(fileName),
							remoteUrl,
							localPath: downloadedPath,
							metadata: {
								artifactKind: resolvedArtifact.kind,
								artifactTitle: resolvedArtifact.title,
								materialization: "download-button",
								...(resolvedArtifact.metadata ?? {}),
							},
						};
					}
				}
			}
		}
		let fetched: Awaited<ReturnType<typeof fetchGeminiBinaryWithClient>> | null = null;
		try {
			fetched = await fetchGeminiBinaryWithClient(client, remoteUrl);
		} catch (error) {
			if (resolvedArtifact.kind !== "image") {
				throw error;
			}
		}
		if (!fetched && resolvedArtifact.kind === "image") {
			const fileName = ensureGeminiArtifactExtension(resolvedArtifact.title, ".png");
			const destPath = path.join(destDir, fileName);
			const captured = await captureGeminiVisibleImageToFile(client, destPath);
			if (captured) {
				const stat = await fs.stat(destPath);
				return {
					id: resolvedArtifact.id,
					name: fileName,
					provider: "gemini",
					source: "conversation",
					size: stat.size,
					mimeType: "image/png",
					remoteUrl,
					localPath: destPath,
					metadata: {
						artifactKind: resolvedArtifact.kind,
						artifactTitle: resolvedArtifact.title,
						materialization: "visible-image-screenshot",
						...(resolvedArtifact.metadata ?? {}),
					},
				};
			}
		}
		if (!fetched) {
			return null;
		}
		const { buffer, contentType, contentDisposition } = fetched;
		const fallbackBaseName =
			extractFilenameFromContentDisposition(contentDisposition) ||
			extractGeminiArtifactFileName(remoteUrl) ||
			resolvedArtifact.title;
		const fileName = ensureGeminiArtifactExtension(
			fallbackBaseName,
			geminiContentTypeToExtension(contentType) ||
				(resolvedArtifact.kind === "image" ? ".png" : ".mp4"),
		);
		const destPath = path.join(destDir, fileName);
		await fs.writeFile(destPath, buffer);
		return {
			id: resolvedArtifact.id,
			name: fileName,
			provider: "gemini",
			source: "conversation",
			size: buffer.byteLength,
			mimeType: contentType ?? inferGeminiArtifactMimeType(fileName),
			remoteUrl,
			localPath: destPath,
			metadata: {
				artifactKind: resolvedArtifact.kind,
				artifactTitle: resolvedArtifact.title,
				materialization:
					resolvedArtifact.kind === "image" ? "blob-image-fetch" : "generated-media-fetch",
				...(resolvedArtifact.metadata ?? {}),
			},
		};
	}

	return null;
}

async function materializeGeminiArtifactDirectRemoteUrlWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
	destDir: string,
): Promise<FileRef | null> {
	if (artifact.kind !== "generated" && artifact.kind !== "image") return null;
	const remoteUrl = normalizeGeminiDirectRemoteArtifactUrl(artifact);
	if (!remoteUrl) return null;
	try {
		const { buffer, contentType, contentDisposition } = await fetchGeminiBinaryWithClient(
			client,
			remoteUrl,
		);
		const fallbackBaseName =
			extractFilenameFromContentDisposition(contentDisposition) ||
			extractGeminiArtifactFileName(remoteUrl) ||
			artifact.title;
		const fileName = ensureGeminiArtifactExtension(
			fallbackBaseName,
			geminiContentTypeToExtension(contentType) || (artifact.kind === "image" ? ".png" : ".mp4"),
		);
		const destPath = path.join(destDir, fileName);
		await fs.writeFile(destPath, buffer);
		return {
			id: artifact.id,
			name: fileName,
			provider: "gemini",
			source: "conversation",
			size: buffer.byteLength,
			mimeType: contentType ?? inferGeminiArtifactMimeType(fileName),
			remoteUrl,
			localPath: destPath,
			metadata: {
				artifactKind: artifact.kind,
				artifactTitle: artifact.title,
				materialization: "direct-remote-fetch",
				...(artifact.metadata ?? {}),
			},
		};
	} catch {
		return null;
	}
}

function normalizeGeminiDirectRemoteArtifactUrl(artifact: ConversationArtifact): string | null {
	const remoteUrl = normalizeWhitespace(
		artifact.uri ||
			(artifact.metadata && typeof artifact.metadata.remoteUrl === "string"
				? artifact.metadata.remoteUrl
				: ""),
	);
	if (!remoteUrl || remoteUrl.startsWith("blob:") || remoteUrl.startsWith("data:")) return null;
	try {
		const parsed = new URL(remoteUrl);
		if (parsed.protocol !== "https:") return null;
		if (parsed.hostname === "contribution.usercontent.google.com") return remoteUrl;
		return null;
	} catch {
		return null;
	}
}

async function waitForGeminiPromptResponse(
	Runtime: ChromeClient["Runtime"],
	baseline: { href: string; conversationId: string | null; assistantTexts: string[] },
	prompt: string,
	timeoutMs: number,
): Promise<BrowserProviderPromptResult> {
	const deadline = Date.now() + timeoutMs;
	let stableText: string | null = null;
	let stableCount = 0;
	while (Date.now() < deadline) {
		const state = await readGeminiPromptState(Runtime);
		const nextText = selectNewestGeminiAssistantText(
			baseline.assistantTexts,
			state.assistantTexts,
			prompt,
		);
		if (nextText) {
			if (nextText === stableText) {
				stableCount += 1;
			} else {
				stableText = nextText;
				stableCount = 1;
			}
			if (!state.isGenerating && stableCount >= 2) {
				return {
					text: nextText,
					conversationId: state.conversationId ?? baseline.conversationId,
					url: state.href || baseline.href,
				};
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 1_250));
	}
	throw new Error("Timed out waiting for Gemini assistant response.");
}

async function readGeminiConversationContextWithClient(
	client: Pick<ChromeClient, "Runtime" | "Page">,
	conversationId: string,
	options: { allowNavigation?: boolean } = {},
): Promise<GeminiConversationContextProbe> {
	if (!(await isGeminiConversationSurfaceAlreadyReady(client, conversationId))) {
		if (options.allowNavigation === false) {
			const ready = await waitForPredicate(
				client.Runtime,
				`(() => {
          const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
          if (location.pathname !== ${JSON.stringify(`/app/${conversationId}`)}) return null;
          const hasUser = Array.from(document.querySelectorAll('user-query, user-query-content'))
            .some((node) => visible(node));
          const hasAssistant = Array.from(document.querySelectorAll(
            'structured-content-container.model-response-text, structured-content-container, message-content, .response-content, model-response, model-response video, model-response img.image, model-response img.loaded'
          )).some((node) => visible(node));
          const hasCanvas = Array.from(document.querySelectorAll(
            '[data-test-id="container"], [data-test-id="artifact-text"], immersive-panel, .ProseMirror[aria-label="Canvas editor"]'
          )).some((node) => visible(node));
          return hasUser || hasAssistant || hasCanvas ? { ready: true } : null;
        })()`,
				{
					timeoutMs: 10_000,
					description: `Gemini active conversation content ready for ${conversationId}`,
				},
			);
			if (!ready.ok) {
				const activeState = await readGeminiActiveTabState(client.Runtime);
				throw new Error(
					`Gemini conversation content not found on the active tab for ${conversationId}. ` +
						`activeState=${JSON.stringify(activeState)}`,
				);
			}
		} else {
			const openedFromRail = await openGeminiConversationFromRail(client, conversationId);
			if (!openedFromRail) {
				await navigateToGeminiConversationSurface(
					client,
					resolveGeminiConversationUrl(conversationId),
					{
						mutationAction: "direct-conversation-fallback",
					},
				);
			}
		}
	}
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasUser = Array.from(document.querySelectorAll('user-query, user-query-content'))
        .some((node) => visible(node));
      const hasAssistantText = Array.from(document.querySelectorAll(
        'structured-content-container.model-response-text, structured-content-container, message-content, .response-content .markdown, .response-content, model-response'
      )).some((node) => visible(node));
      const hasAssistantMedia = Array.from(document.querySelectorAll(
        'model-response img.image, model-response img.loaded, model-response button.image-button, model-response button[data-test-id="download-generated-image-button"], model-response video'
      )).some((node) => visible(node));
      const hasCanvasSignals = Array.from(document.querySelectorAll(
        '[data-test-id="container"], [data-test-id="artifact-text"], immersive-panel, .ProseMirror[aria-label="Canvas editor"], button[aria-label="Share and export canvas"]'
      )).some((node) => visible(node));
      return hasUser || hasAssistantText || hasAssistantMedia || hasCanvasSignals ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: `Gemini conversation content ready for ${conversationId}`,
		},
	);
	if (!ready.ok) {
		const activeState = await readGeminiActiveTabState(client.Runtime);
		throw new Error(
			`Gemini conversation content not found for ${conversationId}. activeState=${JSON.stringify(activeState)}`,
		);
	}
	await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasAssistantText = Array.from(document.querySelectorAll(
        'structured-content-container.model-response-text message-content, structured-content-container.model-response-text .markdown, message-content'
      )).some((node) => visible(node) && String(node.textContent || '').trim().length > 0);
      const hasAssistantMedia = Array.from(document.querySelectorAll(
        'model-response img.image, model-response img.loaded, model-response button.image-button, model-response button[data-test-id="download-generated-image-button"], model-response video'
      )).some((node) => visible(node));
      const hasCanvasEditor = Array.from(document.querySelectorAll(
        'immersive-panel, .ProseMirror[aria-label="Canvas editor"], [data-test-id="artifact-text"], button[aria-label="Share and export canvas"]'
      )).some((node) => visible(node));
      return hasAssistantText || hasAssistantMedia || hasCanvasEditor ? { settled: true } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: `Gemini conversation response settled for ${conversationId}`,
		},
	).catch(() => undefined);
	await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasCanvasChip = Array.from(document.querySelectorAll('[data-test-id="container"], [data-test-id="artifact-text"]'))
        .some((node) => visible(node));
      if (!hasCanvasChip) return { settled: true };
      const hasCanvasPanel = Array.from(document.querySelectorAll(
        'immersive-panel, .ProseMirror[aria-label="Canvas editor"], button[aria-label="Share and export canvas"]'
      )).some((node) => visible(node));
      return hasCanvasPanel ? { settled: true } : null;
    })()`,
		{
			timeoutMs: 8_000,
			description: `Gemini canvas surface settled for ${conversationId}`,
		},
	).catch(() => undefined);
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const sanitizeAssistant = (value) => normalize(value)
        .replace(/^(?:show thinking\\s+)?gemini said(?:\\s+|$)/i, '')
        .replace(/\\s+(?:copy prompt|listen|show more options)(?:\\s+(?:copy prompt|listen|show more options))*$/i, '')
        .trim();
      const sanitizeUser = (value) => normalize(value)
        .replace(/^you said\\s+/i, '')
        .trim();
      const inferMimeType = (name) => {
        const lower = String(name || '').toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.pdf')) return 'application/pdf';
        if (lower.endsWith('.doc')) return 'application/msword';
        if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
        if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (lower.endsWith('.csv')) return 'text/csv';
        if (lower.endsWith('.md')) return 'text/markdown';
        if (lower.endsWith('.txt')) return 'text/plain';
        return undefined;
      };
      const extractFileNameFromUri = (uri) => {
        const value = normalize(uri || '');
        if (!value) return '';
        try {
          const parsed = new URL(value, location.href);
          const fromQuery = normalize(parsed.searchParams.get('filename') || '');
          if (fromQuery) return fromQuery;
          const pathname = parsed.pathname || '';
          const lastSegment = pathname.split('/').filter(Boolean).pop();
          return normalize(lastSegment || '');
        } catch {
          return '';
        }
      };
      const collectMediaControls = (container, fallbackRoot) => {
        const scope = container instanceof Element ? container : fallbackRoot;
        const controls = Array.from(scope.querySelectorAll('button[aria-label]'))
          .filter((entry) => entry instanceof HTMLElement && visible(entry))
          .map((entry) => normalize(entry.getAttribute('aria-label') || ''))
          .filter(Boolean);
        const labelForOption = (entry) => normalize(
          entry.getAttribute('aria-label') ||
          entry.getAttribute('title') ||
          entry.textContent ||
          '',
        );
        const expandDownloadOptionLabels = (labels) => labels.flatMap((label) => {
          const audioOnlyIndex = label.indexOf('Audio only');
          if (audioOnlyIndex > 0 && /cover art/i.test(label.slice(0, audioOnlyIndex))) {
            return [label.slice(0, audioOnlyIndex), label.slice(audioOnlyIndex)].map(normalize).filter(Boolean);
          }
          return [label];
        });
        const scopedDownloadOptions = Array.from(scope.querySelectorAll('[role="menuitem"], [role="option"], button, a'))
          .filter((entry) => entry instanceof HTMLElement && visible(entry))
          .map(labelForOption)
          .filter((label) => /download/i.test(label));
        const visibleMenuOptionLabels = expandDownloadOptionLabels(Array.from(document.querySelectorAll('[role="menu"], [role="menu"] [role="menuitem"], .mat-mdc-menu-panel, .mat-mdc-menu-panel [role="menuitem"], .cdk-overlay-pane, .cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button, .cdk-overlay-pane a'))
          .filter((entry) => entry instanceof HTMLElement && visible(entry))
          .map(labelForOption)
          .filter((label) => /\b(download|audio|mp3|track|video)\b|cover art|with album art/i.test(label)));
        const downloadOptions = Array.from(new Set([...scopedDownloadOptions, ...visibleMenuOptionLabels]));
        const findLabel = (needle) => controls.find((label) => label.toLowerCase().includes(needle)) || '';
        const shareLabel = findLabel('share');
        const downloadLabel = findLabel('download');
        const playLabel = findLabel('play');
        const muteLabel = findLabel('mute');
        const combined = [shareLabel, downloadLabel, playLabel, muteLabel, ...downloadOptions].join(' ').toLowerCase();
        const mediaType =
          /\b(track|music|song|remix|mp3|audio)\b/.test(combined)
            ? 'music'
            : /\b(video|movie)\b/.test(combined)
              ? 'video'
              : '';
        return {
          mediaType,
          shareLabel,
          downloadLabel,
          downloadOptions,
          playLabel,
          muteLabel,
        };
      };
      const readVisibleCanvasSurface = () => {
        const panel = document.querySelector('immersive-panel');
        if (!(panel instanceof HTMLElement) || !visible(panel)) return null;
        const editor =
          panel.querySelector('.ProseMirror[aria-label="Canvas editor"]') ||
          panel.querySelector('.ProseMirror') ||
          document.querySelector('.ProseMirror[aria-label="Canvas editor"]') ||
          document.querySelector('.ProseMirror');
        if (!(editor instanceof HTMLElement) || !visible(editor)) return null;
        const title = normalize(
          document.querySelector('[data-test-id="artifact-text"]')?.textContent || '',
        );
        const createdAt = normalize(
          document.querySelector('[data-test-id="creation-timestamp"]')?.textContent || '',
        );
        const contentText = normalize(editor.innerText || editor.textContent || '');
        const hasShareButton = Boolean(document.querySelector('button[aria-label="Share and export canvas"]'));
        const hasPrintButton = Boolean(document.querySelector('button[aria-label="Print"], [data-test-id="print-button"]'));
        const hasCreateButton = Boolean(document.querySelector('[data-test-id="canvas-create-task-menu"]'));
        return {
          title,
          createdAt,
          contentText,
          hasShareButton,
          hasPrintButton,
          hasCreateButton,
        };
      };
      const readVisibleDeepResearchSurface = () => {
        const panel = Array.from(document.querySelectorAll('deep-research-immersive-panel, immersive-panel'))
          .find((node) =>
            node instanceof HTMLElement &&
            visible(node) &&
            Boolean(node.querySelector('button[data-test-id="export-menu-button"]')) &&
            !node.querySelector('button[aria-label="Share and export canvas"]'),
          );
        if (!(panel instanceof HTMLElement)) return null;
        const toolbarTitle = panel.querySelector(
          'toolbar [data-test-id="title"], toolbar [data-test-id="title-text"], .toolbar [data-test-id="title"], .toolbar [data-test-id="title-text"]',
        );
        const taskTitle = normalize(toolbarTitle?.textContent || '');
        const headings = Array.from(panel.querySelectorAll('h1, h2, h3'))
          .map((node) => normalize(node.textContent || ''))
          .filter((value) =>
            value &&
            value.toLowerCase() !== taskTitle.toLowerCase() &&
            !/^researching\b/i.test(value) &&
            !/^completed\b/i.test(value),
          );
        const documentTitle = headings[0] || taskTitle;
        const contentText = normalize(panel.innerText || panel.textContent || '');
        const hasCreateButton = Boolean(Array.from(panel.querySelectorAll('button')).find((node) =>
          normalize(node.textContent || node.getAttribute('aria-label') || '').toLowerCase() === 'create'
        ));
        return {
          taskTitle,
          documentTitle,
          contentText,
          hasExportButton: Boolean(panel.querySelector('button[data-test-id="export-menu-button"]')),
          hasCreateButton,
        };
      };
      const chooseText = (container, selectors, sanitizer) => {
        for (const selector of selectors) {
          for (const node of Array.from(container.querySelectorAll(selector))) {
            if (!(node instanceof HTMLElement) || !visible(node)) continue;
            const text = sanitizer(node.innerText || node.textContent || '');
            if (!text) continue;
            const childDuplicates = Array.from(node.children)
              .filter((child) => child instanceof HTMLElement && visible(child))
              .some((child) => sanitizer(child.innerText || child.textContent || '') === text);
            if (childDuplicates) continue;
            return text;
          }
        }
        return sanitizer(container.innerText || container.textContent || '');
      };
      const root = document.querySelector('main') || document.body;
      const turns = Array.from(root.querySelectorAll('user-query, model-response'))
        .filter((node) => node instanceof HTMLElement && visible(node));
      turns.sort((left, right) => {
        const position = left.compareDocumentPosition(right);
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        return 0;
      });
      const messages = [];
      const files = [];
      const artifacts = [];
      const seenFileIds = new Set();
      const seenFileKeys = new Set();
      const seenArtifactIds = new Set();
      for (const node of turns) {
        if (!(node instanceof HTMLElement)) continue;
        const isUser = node.matches('user-query');
        let assistantArtifactsAdded = 0;
        if (!isUser) {
          const messageIndex = messages.length;
          let artifactOrdinal = 0;
          const generatedImages = Array.from(node.querySelectorAll('img.image, img.loaded, img'))
            .filter((entry) => entry instanceof HTMLImageElement && visible(entry));
          for (const image of generatedImages) {
            if (!(image instanceof HTMLImageElement)) continue;
            const container =
              image.closest('image-renderer, image-response, .image-container, .image-button') ||
              image.parentElement ||
              node;
            const dedupeKey = normalize(image.src || '') || ('message-' + messageIndex + '-image-' + artifactOrdinal);
            if (seenArtifactIds.has(dedupeKey)) continue;
            seenArtifactIds.add(dedupeKey);
            const artifactId =
              ${JSON.stringify("gemini-artifact:")} +
              ${JSON.stringify(conversationId)} +
              ':' + messageIndex +
              ':' + artifactOrdinal;
            artifactOrdinal += 1;
            const width = image.naturalWidth || image.width || null;
            const height = image.naturalHeight || image.height || null;
            artifacts.push({
              id: artifactId,
              title: 'Generated image ' + artifactOrdinal,
              kind: 'image',
              uri: image.src || undefined,
              messageIndex,
              metadata: {
                width,
                height,
                hasDownloadButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="download-generated-image-button"]'),
                ),
                hasShareButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="share-button"]'),
                ),
              },
            });
            assistantArtifactsAdded += 1;
          }
          const generatedMedia = Array.from(node.querySelectorAll('video'))
            .filter((entry) => entry instanceof HTMLVideoElement && visible(entry));
          for (const media of generatedMedia) {
            if (!(media instanceof HTMLVideoElement)) continue;
            const src = normalize(media.currentSrc || media.src || media.getAttribute('src') || '');
            if (!src || seenArtifactIds.has(src)) continue;
            seenArtifactIds.add(src);
            const container =
              media.closest('video-player, response-container, model-response, .response-container') ||
              media.parentElement ||
              node;
            const controls = collectMediaControls(container, node);
            const fileName = extractFileNameFromUri(src);
            const artifactId =
              ${JSON.stringify("gemini-artifact:")} +
              ${JSON.stringify(conversationId)} +
              ':' + messageIndex +
              ':' + artifactOrdinal;
            artifactOrdinal += 1;
            artifacts.push({
              id: artifactId,
              title: 'Generated media ' + artifactOrdinal,
              kind: 'generated',
              uri: src || undefined,
              messageIndex,
              metadata: {
                mediaType: controls.mediaType || undefined,
                fileName: fileName || undefined,
                width: media.videoWidth || null,
                height: media.videoHeight || null,
                shareLabel: controls.shareLabel || undefined,
                downloadLabel: controls.downloadLabel || undefined,
                downloadOptions: controls.downloadOptions.length > 0 ? controls.downloadOptions : undefined,
                playLabel: controls.playLabel || undefined,
                muteLabel: controls.muteLabel || undefined,
                hasDownloadButton: Boolean(controls.downloadLabel),
                hasShareButton: Boolean(controls.shareLabel),
              },
            });
            assistantArtifactsAdded += 1;
          }
        }
        const text = isUser
          ? chooseText(
              node,
              [
                'user-query-content p.query-text-line',
                'user-query-content .query-text',
                'user-query-content .query-content',
                'user-query-content',
              ],
              sanitizeUser,
            )
          : chooseText(
              node,
              [
                'structured-content-container.model-response-text message-content',
                'structured-content-container.model-response-text .markdown',
                'structured-content-container.model-response-text',
                'message-content',
                '.response-content .markdown',
                '.response-content',
              ],
              sanitizeAssistant,
            );
        if (!text && assistantArtifactsAdded === 0) continue;
        const role = isUser ? 'user' : 'assistant';
        const previous = messages[messages.length - 1];
        if (previous && previous.role === role && previous.text === text) continue;
        if (text) {
          messages.push({ role, text });
        }
        if (isUser) {
          const turnFileNodes = Array.from(node.querySelectorAll(
            '[data-test-id="uploaded-file"], [data-test-id="file-preview"], button.new-file-preview-file, button.preview-image-button, img[data-test-id="image-preview"], img[data-test-id="uploaded-img"], button[aria-label^="Remove file "]',
          )).filter((entry) => entry instanceof HTMLElement && visible(entry));
          const turnFileChips = [];
          const seenTurnFileChips = new Set();
          for (const fileNode of turnFileNodes) {
            if (!(fileNode instanceof HTMLElement)) continue;
            const chip = fileNode.closest('[data-test-id="uploaded-file"], [data-test-id="file-preview"], button.new-file-preview-file, button.preview-image-button, uploader-file-preview, uploader-file-preview-container')
              || fileNode;
            if (!(chip instanceof Element) || seenTurnFileChips.has(chip)) continue;
            seenTurnFileChips.add(chip);
            turnFileChips.push(chip);
          }
          let fileOrdinal = 0;
          for (const chip of turnFileChips) {
            if (!(chip instanceof HTMLElement)) continue;
            const directPreviewButton =
              chip.matches('button.new-file-preview-file, button.preview-image-button')
                ? chip
                : chip.querySelector('button.new-file-preview-file, button.preview-image-button');
            const labeledButton = chip.querySelector('button[aria-label]') || chip.querySelector('[aria-label]');
            const removeButton = chip.querySelector('button[aria-label^="Remove file "]');
            const imagePreview = chip.matches('img[data-test-id="image-preview"], img[data-test-id="uploaded-img"]')
              ? chip
              : chip.querySelector('img[data-test-id="image-preview"], img[data-test-id="uploaded-img"]');
            const anchor = chip.querySelector('a[href]');
            const imageSrc = imagePreview instanceof HTMLImageElement
              ? normalize(imagePreview.currentSrc || imagePreview.src || imagePreview.getAttribute('src') || '')
              : '';
            const anchorHref = anchor instanceof HTMLAnchorElement
              ? normalize(anchor.getAttribute('href') || anchor.href || '')
              : '';
            const explicitName = labeledButton instanceof HTMLElement
              ? normalize(labeledButton.getAttribute('aria-label') || labeledButton.getAttribute('title') || '')
              : '';
            const directButtonName = directPreviewButton instanceof HTMLElement
              ? normalize(directPreviewButton.getAttribute('aria-label') || directPreviewButton.getAttribute('title') || '')
              : '';
            const removeName = removeButton instanceof HTMLElement
              ? normalize((removeButton.getAttribute('aria-label') || '').replace(/^Remove file\\s+/i, ''))
              : '';
            const visibleName = normalize(
              chip.querySelector('.new-file-name, [data-test-id="file-name"]')?.textContent || '',
            );
            const visibleType = normalize(
              chip.querySelector('.new-file-type, .file-type')?.textContent || '',
            );
            let name = directButtonName || explicitName || removeName || visibleName;
            if (name && visibleType && !/\\.[a-z0-9]{1,8}$/i.test(name) && /^[A-Z0-9]{1,8}$/i.test(visibleType)) {
              name = name + '.' + visibleType.toLowerCase();
            }
            if (!name && imagePreview instanceof HTMLImageElement) {
              name = normalize(imagePreview.getAttribute('aria-label') || imagePreview.getAttribute('alt') || '');
            }
            if ((!name || /^uploaded image preview$/i.test(name) || /^show the uploaded image in a lightbox$/i.test(name)) && imageSrc) {
              name = 'uploaded-image-' + (fileOrdinal + 1);
            }
            if (!name) continue;
            const fileId = ${JSON.stringify("gemini-conversation-file:")} + ${JSON.stringify(conversationId)} + ':' + fileOrdinal + ':' + name;
            const fileKey = imageSrc
              ? normalize(imageSrc)
              : (anchorHref ? normalize(anchorHref + '::' + name) : fileId);
            fileOrdinal += 1;
            if (seenFileIds.has(fileId) || seenFileKeys.has(fileKey)) continue;
            seenFileIds.add(fileId);
            seenFileKeys.add(fileKey);
            const mimeType = inferMimeType(name);
            files.push({
              id: fileId,
              name,
              provider: 'gemini',
              source: 'conversation',
              mimeType,
              remoteUrl: anchorHref || imageSrc || undefined,
              metadata: {
                messageIndex: messages.length - 1,
                kind:
                  imagePreview instanceof HTMLImageElement && imagePreview.getAttribute('data-test-id') === 'uploaded-img'
                    ? 'uploaded-image'
                    : imagePreview instanceof HTMLImageElement
                      ? 'image-preview'
                      : 'uploaded-file',
                hasDirectUrl: Boolean(anchorHref || imageSrc),
              },
            });
          }
          continue;
        }
      }
      const fallbackImageButtons = Array.from(document.querySelectorAll('button.preview-image-button, img[data-test-id="uploaded-img"]'))
        .filter((entry) => entry instanceof HTMLElement && visible(entry));
      let fallbackImageOrdinal = files.filter((entry) => entry.metadata?.kind === 'uploaded-image').length;
      for (const fallbackNode of fallbackImageButtons) {
        if (!(fallbackNode instanceof HTMLElement)) continue;
        const chip =
          fallbackNode.closest('button.preview-image-button, [data-test-id="uploaded-file"], [data-test-id="file-preview"]')
          || fallbackNode;
        const directPreviewButton =
          chip.matches('button.preview-image-button')
            ? chip
            : chip.querySelector('button.preview-image-button');
        const imagePreview =
          chip.matches('img[data-test-id="uploaded-img"]')
            ? chip
            : chip.querySelector('img[data-test-id="uploaded-img"]');
        if (!(imagePreview instanceof HTMLImageElement)) continue;
        const imageSrc = normalize(imagePreview.currentSrc || imagePreview.src || imagePreview.getAttribute('src') || '');
        if (!imageSrc || files.some((entry) => normalize(entry.remoteUrl || '') === imageSrc)) continue;
        let fallbackName = normalize(
          directPreviewButton instanceof HTMLElement
            ? (directPreviewButton.getAttribute('aria-label') || directPreviewButton.getAttribute('title') || '')
            : '',
        );
        if (!fallbackName || /show the uploaded image in a lightbox/i.test(fallbackName)) {
          fallbackName = 'uploaded-image-' + (fallbackImageOrdinal + 1);
        }
        const fallbackFileId =
          ${JSON.stringify("gemini-conversation-file:")} +
          ${JSON.stringify(conversationId)} +
          ':' + fallbackImageOrdinal +
          ':' + fallbackName;
        const fallbackFileKey = normalize(imageSrc);
        if (seenFileIds.has(fallbackFileId) || seenFileKeys.has(fallbackFileKey)) continue;
        seenFileIds.add(fallbackFileId);
        seenFileKeys.add(fallbackFileKey);
        let messageIndex;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === 'user') {
            messageIndex = index;
            break;
          }
        }
        files.push({
          id: fallbackFileId,
          name: fallbackName,
          provider: 'gemini',
          source: 'conversation',
          mimeType: 'image/*',
          remoteUrl: imageSrc || undefined,
          metadata: {
            messageIndex,
            kind: 'uploaded-image',
            hasDirectUrl: true,
          },
        });
        fallbackImageOrdinal += 1;
      }
      const canvasSurface = readVisibleCanvasSurface();
      if (canvasSurface && canvasSurface.contentText) {
        const artifactId = ${JSON.stringify("gemini-canvas:")} + ${JSON.stringify(conversationId)};
        if (!seenArtifactIds.has(artifactId)) {
          seenArtifactIds.add(artifactId);
          let lastAssistantMessageIndex;
          for (let index = messages.length - 1; index >= 0; index -= 1) {
            if (messages[index]?.role === 'assistant') {
              lastAssistantMessageIndex = index;
              break;
            }
          }
          artifacts.push({
            id: artifactId,
            title: canvasSurface.title || 'Canvas document',
            kind: 'canvas',
            uri: ${JSON.stringify("gemini://canvas/")} + ${JSON.stringify(conversationId)},
            messageIndex: lastAssistantMessageIndex,
            metadata: {
              contentText: canvasSurface.contentText,
              createdAt: canvasSurface.createdAt || undefined,
              hasShareButton: canvasSurface.hasShareButton,
              hasPrintButton: canvasSurface.hasPrintButton,
              hasCreateButton: canvasSurface.hasCreateButton,
            },
          });
        }
      }
      const deepResearchSurface = readVisibleDeepResearchSurface();
      if (deepResearchSurface && deepResearchSurface.contentText) {
        const artifactId = ${JSON.stringify("gemini-document:")} + ${JSON.stringify(conversationId)};
        if (!seenArtifactIds.has(artifactId)) {
          seenArtifactIds.add(artifactId);
          let lastAssistantMessageIndex;
          for (let index = messages.length - 1; index >= 0; index -= 1) {
            if (messages[index]?.role === 'assistant') {
              lastAssistantMessageIndex = index;
              break;
            }
          }
          artifacts.push({
            id: artifactId,
            title: deepResearchSurface.documentTitle || deepResearchSurface.taskTitle || 'Deep Research document',
            kind: 'document',
            uri: ${JSON.stringify("gemini://document/")} + ${JSON.stringify(conversationId)},
            messageIndex: lastAssistantMessageIndex,
            metadata: {
              documentTitle: deepResearchSurface.documentTitle || undefined,
              taskTitle: deepResearchSurface.taskTitle || undefined,
              contentText: deepResearchSurface.contentText,
              hasExportButton: deepResearchSurface.hasExportButton,
              hasCreateButton: deepResearchSurface.hasCreateButton,
              documentType: 'deep-research',
            },
          });
        }
      }
      if (artifacts.length === 0) {
        const responseNodes = Array.from(root.querySelectorAll('model-response'))
          .filter((entry) => entry instanceof HTMLElement && visible(entry));
        let responseIndex = 0;
        for (const responseNode of responseNodes) {
          if (!(responseNode instanceof HTMLElement)) continue;
          let artifactOrdinal = 0;
          const generatedImages = Array.from(responseNode.querySelectorAll('img.image, img.loaded, img'))
            .filter((entry) => entry instanceof HTMLImageElement && visible(entry));
          for (const image of generatedImages) {
            if (!(image instanceof HTMLImageElement)) continue;
            const src = normalize(image.src || '');
            if (!src || seenArtifactIds.has(src)) continue;
            seenArtifactIds.add(src);
            const container =
              image.closest('image-renderer, image-response, .image-container, .image-button') ||
              image.parentElement ||
              responseNode;
            const width = image.naturalWidth || image.width || null;
            const height = image.naturalHeight || image.height || null;
            artifacts.push({
              id:
                ${JSON.stringify("gemini-artifact:")} +
                ${JSON.stringify(conversationId)} +
                ':fallback:' + responseIndex + ':' + artifactOrdinal,
              title: 'Generated image ' + (artifactOrdinal + 1),
              kind: 'image',
              uri: src || undefined,
              messageIndex: messages.length > 0 ? messages.length - 1 : undefined,
              metadata: {
                width,
                height,
                hasDownloadButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="download-generated-image-button"]'),
                ),
                hasShareButton: Boolean(
                  container instanceof Element &&
                  container.querySelector('button[data-test-id="share-button"]'),
                ),
              },
            });
            artifactOrdinal += 1;
          }
          const generatedMedia = Array.from(responseNode.querySelectorAll('video'))
            .filter((entry) => entry instanceof HTMLVideoElement && visible(entry));
          for (const media of generatedMedia) {
            if (!(media instanceof HTMLVideoElement)) continue;
            const src = normalize(media.currentSrc || media.src || media.getAttribute('src') || '');
            if (!src || seenArtifactIds.has(src)) continue;
            seenArtifactIds.add(src);
            const container =
              media.closest('video-player, response-container, model-response, .response-container') ||
              media.parentElement ||
              responseNode;
            const controls = collectMediaControls(container, responseNode);
            const fileName = extractFileNameFromUri(src);
            artifacts.push({
              id:
                ${JSON.stringify("gemini-artifact:")} +
                ${JSON.stringify(conversationId)} +
                ':fallback:' + responseIndex + ':' + artifactOrdinal,
              title: 'Generated media ' + (artifactOrdinal + 1),
              kind: 'generated',
              uri: src || undefined,
              messageIndex: messages.length > 0 ? messages.length - 1 : undefined,
              metadata: {
                mediaType: controls.mediaType || undefined,
                fileName: fileName || undefined,
                width: media.videoWidth || null,
                height: media.videoHeight || null,
                shareLabel: controls.shareLabel || undefined,
                downloadLabel: controls.downloadLabel || undefined,
                downloadOptions: controls.downloadOptions.length > 0 ? controls.downloadOptions : undefined,
                playLabel: controls.playLabel || undefined,
                muteLabel: controls.muteLabel || undefined,
                hasDownloadButton: Boolean(controls.downloadLabel),
                hasShareButton: Boolean(controls.shareLabel),
              },
            });
            artifactOrdinal += 1;
          }
          responseIndex += 1;
        }
      }
      return JSON.stringify({
        provider: 'gemini',
        conversationId: ${JSON.stringify(conversationId)},
        messages,
        files,
        artifacts,
      });
    })()`,
		returnByValue: true,
	});
	const rawPayload = typeof result?.value === "string" ? result.value : null;
	const payload = rawPayload ? (JSON.parse(rawPayload) as GeminiConversationContextProbe) : null;
	if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
		throw new Error(`Gemini conversation messages not found for ${conversationId}.`);
	}
	const uploadedFiles = await readGeminiVisibleConversationUploadFiles(
		client.Runtime,
		conversationId,
		payload.messages,
	);
	if (uploadedFiles.length > 0) {
		const existing = Array.isArray(payload.files) ? payload.files : [];
		const merged = [...existing];
		const seen = new Set(
			existing.map((entry) => normalizeWhitespace(entry.remoteUrl ?? "") || entry.id),
		);
		for (const file of uploadedFiles) {
			const key = normalizeWhitespace(file.remoteUrl ?? "") || file.id;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(file);
		}
		payload.files = merged;
	}
	payload.files = normalizeGeminiConversationFiles(payload.files);
	payload.artifacts = normalizeGeminiConversationArtifacts(payload.artifacts);
	return payload;
}

async function _openGeminiConversationMenu(
	client: ChromeClient,
	conversationId: string,
	trace: GeminiDeleteTrace,
): Promise<void> {
	await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
	await dismissGeminiPreciseLocationDialog(client.Runtime);
	await ensureGeminiMainMenuOpen(client);
	await client.Runtime.evaluate({
		expression: `(() => {
      const list = document.querySelector('[data-test-id="all-conversations"]');
      if (list instanceof HTMLElement) {
        list.scrollTop = 0;
        return { reset: true };
      }
      return { reset: false };
    })()`,
		returnByValue: true,
	});
	const ready = await waitForGeminiConversationListEntry(client.Runtime, conversationId, {
		timeoutMs: 10_000,
		description: `Gemini conversation row menu ready for ${conversationId}`,
	});
	if (!ready.ok) {
		throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
	}
	const rowInfo = (ready.value ?? {}) as { title?: string; x?: number; y?: number; left?: number };
	const title = normalizeWhitespace(rowInfo.title ?? "");
	const hoverX = Number.isFinite(rowInfo.x) ? Number(rowInfo.x) : 0;
	const hoverY = Number.isFinite(rowInfo.y) ? Number(rowInfo.y) : 0;
	const hoverLeft = Number.isFinite(rowInfo.left) ? Number(rowInfo.left) : 0;
	if (!title || !Number.isFinite(hoverY)) {
		throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: hoverLeft + 10,
		y: hoverY,
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: hoverX,
		y: hoverY,
		button: "none",
	});
	trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "after-hover"));
	const menuButtonReady = await waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const targetLabel = ${JSON.stringify(`More options for ${title}`)};
      const targetY = ${JSON.stringify(hoverY)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            distance: Math.abs((rect.top + rect.height / 2) - targetY),
          };
        });
      return candidates.length > 0 ? { count: candidates.length } : null;
    })()`,
		{
			timeoutMs: 3_000,
			description: `Gemini conversation action button ready for ${conversationId}`,
		},
	);
	if (!menuButtonReady.ok) {
		trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "menu-button-missing"));
		throw new Error("conversation-actions-menu-missing");
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const targetLabel = ${JSON.stringify(`More options for ${title}`)};
      const targetY = ${JSON.stringify(hoverY)};
      const candidates = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel)
        .map((node) => {
          const touchTarget =
            node instanceof HTMLElement ? node.querySelector('.mat-mdc-button-touch-target') : null;
          const rect = (touchTarget instanceof HTMLElement ? touchTarget : node).getBoundingClientRect();
          return {
            distance: Math.abs((rect.top + rect.height / 2) - targetY),
            clicked: node instanceof HTMLElement ? (node.click(), true) : false,
          };
        })
        .sort((left, right) => left.distance - right.distance);
      const match = candidates[0];
      if (!match) return { ok: false, reason: 'conversation-actions-menu-missing' };
      return { ok: true, clicked: match.clicked };
    })()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as { ok?: boolean; reason?: string; clicked?: boolean };
	if (!payload.ok) {
		throw new Error(
			payload.reason || `Gemini conversation row menu not found for ${conversationId}.`,
		);
	}
	if (!payload.clicked) {
		throw new Error(`Gemini conversation row menu not found for ${conversationId}.`);
	}
	trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "after-menu-click"));
}

async function selectGeminiConversationDeleteMenuItem(
	client: ChromeClient,
	trace: GeminiDeleteTrace,
): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const button = document.querySelector('button[data-test-id="delete-button"]');
      const rect = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
      return rect && rect.width > 0 && rect.height > 0
        ? { ready: true }
        : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini conversation delete menu item ready",
		},
	);
	if (!ready.ok) {
		trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "delete-menu-missing"));
		throw new Error("Gemini conversation delete menu did not open.");
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const deleteNode = document.querySelector('button[data-test-id="delete-button"]');
      if (!(deleteNode instanceof HTMLElement)) return { ok: false, reason: 'delete-menu-item-missing' };
      deleteNode.click();
      return { ok: true };
    })()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as { ok?: boolean; reason?: string };
	if (!payload.ok) {
		throw new Error(payload.reason || "Gemini conversation delete menu item not found.");
	}
	trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "after-delete-click"));
}

async function openGeminiConversationRenameDialog(client: ChromeClient): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const button = document.querySelector('button[data-test-id="rename-button"]');
      const rect = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
      return rect && rect.width > 0 && rect.height > 0 ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini conversation rename menu item ready",
		},
	);
	if (!ready.ok) {
		throw new Error("Gemini conversation rename menu did not open.");
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const button = Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((node) => node instanceof HTMLElement &&
          node.getAttribute('data-test-id') === 'rename-button' &&
          node.getBoundingClientRect().width > 0 &&
          node.getBoundingClientRect().height > 0);
      if (!(button instanceof HTMLElement)) return { ok: false };
      button.click();
      return { ok: true };
    })()`,
		returnByValue: true,
	});
	if (result?.value?.ok !== true) {
		throw new Error("Gemini conversation rename menu item not found.");
	}
	const dialogReady = await waitForPredicate(
		client.Runtime,
		`(() => {
      const input = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR)});
      const save = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_SAVE_SELECTOR)});
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      return visible(input) && visible(save) ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini conversation rename dialog ready",
		},
	);
	if (!dialogReady.ok) {
		throw new Error("Gemini conversation rename dialog did not open.");
	}
}

async function renameGeminiConversationOnPage(
	client: ChromeClient,
	conversationId: string,
	newTitle: string,
): Promise<void> {
	const normalizedTitle = normalizeWhitespace(newTitle);
	if (!normalizedTitle) {
		throw new Error("Gemini conversation title cannot be empty.");
	}
	await openGeminiConversationActionsMenuOnConversationPage(client, conversationId);
	await openGeminiConversationRenameDialog(client);
	const renamed = await submitInlineRename(
		client.Runtime,
		{
			inputSelector: GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR,
			value: normalizedTitle,
			closeSelector: '[role="dialog"], mat-dialog-container',
			submitStrategy: "native-then-synthetic",
			entryStrategy: "native-input",
			timeoutMs: 10_000,
		},
		{
			Input: client.Input,
		},
	);
	if (!renamed.ok) {
		throw new Error(
			`Gemini conversation rename save failed: ${renamed.reason ?? "Rename dialog did not submit."}`,
		);
	}
	const dialogClosed = await waitForPredicate(
		client.Runtime,
		`(() => {
      const dialog = document.querySelector('[role="dialog"], mat-dialog-container');
      const input = document.querySelector(${JSON.stringify(GEMINI_CONVERSATION_RENAME_INPUT_SELECTOR)});
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      return !visible(dialog) && !visible(input) ? { closed: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: "Gemini conversation rename dialog dismissed",
		},
	);
	if (!dialogClosed.ok) {
		throw new Error("Gemini conversation rename dialog remained visible after save.");
	}
	await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
	await ensureGeminiMainMenuOpen(client);
	const persisted = await waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .find((node) =>
          node instanceof HTMLAnchorElement &&
          visible(node) &&
          node.href.includes('/app/' + ${JSON.stringify(conversationId)}),
        );
      if (!(anchor instanceof HTMLAnchorElement)) return null;
      const title = normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');
      return title === ${JSON.stringify(normalizedTitle)} ? { title } : null;
    })()`,
		{
			timeoutMs: 15_000,
			description: `Gemini renamed conversation visible in root list for ${conversationId}`,
		},
	);
	if (!persisted.ok) {
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
        const anchor = Array.from(document.querySelectorAll('a[href*="/app/"]'))
          .find((node) =>
            node instanceof HTMLAnchorElement &&
            node.href.includes('/app/' + ${JSON.stringify(conversationId)}),
          );
        if (!(anchor instanceof HTMLAnchorElement)) return null;
        return normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');
      })()`,
			returnByValue: true,
		});
		throw new Error(
			`Gemini conversation rename did not persist. Expected "${normalizedTitle}", got "${String(result?.value ?? "")}".`,
		);
	}
}

async function clickGeminiConversationDeleteConfirmations(
	client: ChromeClient,
	trace: GeminiDeleteTrace,
): Promise<number> {
	const opened = await waitForPredicate(
		client.Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((node) => {
          if (!visible(node)) return false;
          const text = normalize(node.textContent || '');
          const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
            .filter((button) => visible(button))
            .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''));
          return !text.includes('use your precise location') && buttons.includes('delete') && buttons.includes('cancel');
        });
      return dialogs.length > 0 ? { count: dialogs.length } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini conversation delete confirmation dialog ready",
		},
	);
	if (!opened.ok) {
		trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "confirm-dialog-missing"));
		throw new Error("Gemini conversation delete confirmation dialog did not open.");
	}
	trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "confirm-dialog-open"));
	let clicked = 0;
	const clearedPredicate = `(() => {
    const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const active = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
      .filter((node) => {
        if (!visible(node)) return false;
        if (node.classList.contains('mdc-dialog--closing')) return false;
        const text = normalize(node.textContent || '');
        const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
          .filter((button) => visible(button))
          .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''));
        return !text.includes('use your precise location') && buttons.includes('delete') && buttons.includes('cancel');
      });
    return active.length === 0 ? { cleared: true } : null;
  })()`;

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const button = document.querySelector('button[data-test-id="confirm-button"]');
        if (!(button instanceof HTMLElement)) return null;
        const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
        const rect = (touchTarget instanceof HTMLElement ? touchTarget : button).getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
			returnByValue: true,
		});
		const point = (result?.value ?? null) as { x?: number; y?: number } | null;
		if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
			break;
		}
		await client.Input.dispatchMouseEvent({
			type: "mouseMoved",
			x: Number(point.x),
			y: Number(point.y),
			button: "none",
		});
		await client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: Number(point.x),
			y: Number(point.y),
			button: "left",
			clickCount: 1,
		});
		await client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: Number(point.x),
			y: Number(point.y),
			button: "left",
			clickCount: 1,
		});
		clicked += 1;
		const cleared = await waitForPredicate(client.Runtime, clearedPredicate, {
			timeoutMs: 5_000,
			description: "Gemini conversation delete confirmation dismissed",
		});
		if (cleared.ok) {
			trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "after-confirm-click"));
			return clicked;
		}
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const button = document.querySelector('button[data-test-id="confirm-button"]');
      if (!(button instanceof HTMLElement)) return { ok: false };
      button.click();
      return { ok: true };
    })()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as { ok?: boolean };
	if (payload.ok) {
		clicked += 1;
		const cleared = await waitForPredicate(client.Runtime, clearedPredicate, {
			timeoutMs: 5_000,
			description: "Gemini conversation delete confirmation dismissed",
		});
		if (cleared.ok) {
			trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "after-confirm-click"));
			return clicked;
		}
	}
	if (clicked < 1) {
		throw new Error("Gemini conversation delete confirmation button not found.");
	}
	throw new Error(
		"Gemini conversation delete confirmation remained visible after confirm attempts.",
	);
}

async function waitForGeminiConversationRemoved(
	client: ChromeClient,
	conversationId: string,
	timeoutMs: number = 90_000,
	trace: GeminiDeleteTrace,
): Promise<void> {
	const freshAbsenceRequired = 2;
	let consecutiveFreshAbsenceCount = 0;
	const startedAt = Date.now();
	const verifierTrace: Array<Record<string, unknown>> = [];

	const localDisappear = await waitForPredicate(
		client.Runtime,
		`(() => {
      const remaining = Array.from(document.querySelectorAll('a[href*="/app/"]'))
        .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
      return remaining ? null : { removed: true };
    })()`,
		{
			timeoutMs: 8_000,
			description: `Gemini conversation ${conversationId} removed from current page`,
		},
	);
	verifierTrace.push({
		phase: "current-page",
		ok: localDisappear.ok,
		elapsedMs: Date.now() - startedAt,
		attempts: localDisappear.attempts ?? null,
	});

	const deadline = Date.now() + timeoutMs;
	let lastSeen = false;
	let lastReason = "";
	let pass = 0;
	while (Date.now() < deadline) {
		pass += 1;
		try {
			await navigateToGeminiConversationSurface(client, GEMINI_APP_URL);
			await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
		} catch (error) {
			lastReason = error instanceof Error ? error.message : String(error);
			verifierTrace.push({
				phase: "fresh-root-error",
				pass,
				elapsedMs: Date.now() - startedAt,
				reason: lastReason,
			});
			await new Promise((resolve) => setTimeout(resolve, 5_000));
			continue;
		}
		const check = await client.Runtime.evaluate({
			expression: `(() => {
        const remaining = Array.from(document.querySelectorAll('a[href*="/app/"]'))
          .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/app/${conversationId}'));
        return { remaining };
      })()`,
			returnByValue: true,
		});
		lastSeen = Boolean((check.result?.value as { remaining?: boolean } | undefined)?.remaining);
		if (!lastSeen) {
			consecutiveFreshAbsenceCount += 1;
			verifierTrace.push({
				phase: "fresh-root",
				pass,
				elapsedMs: Date.now() - startedAt,
				remaining: false,
				consecutiveFreshAbsenceCount,
			});
			if (consecutiveFreshAbsenceCount >= freshAbsenceRequired) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 5_000));
			continue;
		}
		consecutiveFreshAbsenceCount = 0;
		verifierTrace.push({
			phase: "fresh-root",
			pass,
			elapsedMs: Date.now() - startedAt,
			remaining: true,
			consecutiveFreshAbsenceCount,
		});
		await new Promise((resolve) => setTimeout(resolve, 5_000));
	}
	trace.push(...verifierTrace);
	const traceSummary = summarizeGeminiDeleteTrace(verifierTrace, 4);
	if (lastSeen) {
		throw new Error(
			`Gemini conversation ${conversationId} still appears in the conversation list after delete. trace=${traceSummary}`,
		);
	}
	throw new Error(
		`${lastReason || `Gemini conversation ${conversationId} delete could not be verified.`} trace=${traceSummary}`,
	);
}

async function createGeminiProjectWithClient(
	client: ChromeClient,
	input: {
		name: string;
		instructions?: string;
		modelLabel?: string;
		files?: string[];
		memoryMode?: ProjectMemoryMode;
	},
): Promise<Project | null> {
	if (Array.isArray(input.files) && input.files.length > 0) {
		throw new Error("Gem knowledge upload during Gemini project creation is not supported yet.");
	}
	if (input.modelLabel && input.modelLabel.trim().length > 0) {
		throw new Error("Gemini Gem creation does not support setting a model label yet.");
	}
	if (input.memoryMode) {
		throw new Error("Gemini Gem creation does not support memory mode selection.");
	}

	await navigateToGeminiCreatePage(client);

	const setName = await setInputValue(client.Runtime, {
		selector: GEMINI_GEM_NAME_INPUT_SELECTOR,
		value: input.name,
		timeoutMs: 10_000,
	});
	if (!setName) {
		throw new Error("Gemini Gem name input did not become ready.");
	}

	if (typeof input.instructions === "string" && input.instructions.trim().length > 0) {
		const trimmedInstructions = input.instructions.trim();
		const setDescription = await setInputValue(client.Runtime, {
			selector: GEMINI_GEM_DESCRIPTION_INPUT_SELECTOR,
			value: trimmedInstructions,
			timeoutMs: 5_000,
		});
		if (!setDescription) {
			throw new Error("Gemini Gem description input did not become ready.");
		}
		const setInstructions = await setInputValue(client.Runtime, {
			selector: GEMINI_GEM_INSTRUCTIONS_INPUT_SELECTOR,
			value: trimmedInstructions,
			timeoutMs: 5_000,
		});
		if (!setInstructions) {
			throw new Error("Gemini Gem instructions input did not become ready.");
		}
	}

	const beforeHref = String(
		(
			await client.Runtime.evaluate({
				expression: "location.href",
				returnByValue: true,
			})
		).result?.value ?? "",
	);
	const pressed = await pressGeminiGemSaveButton(client);
	if (!pressed.ok) {
		throw new Error(`Gemini Gem save failed: ${pressed.reason ?? "Save button not clickable."}`);
	}

	const routeChanged = await waitForPredicate(
		client.Runtime,
		`(() => {
      const href = location.href;
      if (!href || href === ${JSON.stringify(beforeHref)}) return false;
      return (/\\/gem\\/([^/?#]+)/i.test(href) || /\\/gems\\/edit\\/([^/?#]+)/i.test(href)) && !/\\/gems\\/create(?:[/?#]|$)/i.test(href);
    })()`,
		{
			timeoutMs: 20_000,
			description: `Gemini Gem route changed for ${input.name}`,
		},
	);
	if (!routeChanged.ok) {
		throw new Error(`Gemini Gem creation could not be verified for "${input.name}".`);
	}

	const { result } = await client.Runtime.evaluate({
		expression: `(() => ({ href: location.href, title: document.title || "" }))()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as { href?: string; title?: string };
	const createdId = normalizeGeminiProjectId(payload.href ?? "");
	if (!createdId) {
		throw new Error(`Gemini Gem creation route resolved without a project id for "${input.name}".`);
	}
	await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const startChat = document.querySelector(${JSON.stringify(GEMINI_GEM_START_CHAT_BUTTON_SELECTOR)});
      return visible(startChat) ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: `Gemini Gem edit surface ready after create for ${input.name}`,
		},
	).catch(() => undefined);
	return {
		id: createdId,
		name: input.name,
		provider: "gemini",
		url: payload.href ? String(payload.href) : resolveGeminiProjectUrl(createdId),
	};
}

async function readGeminiPersistedProjectName(
	client: Pick<ChromeClient, "Page" | "Runtime">,
	projectId: string,
	options?: { expectedName?: string; timeoutMs?: number },
): Promise<string> {
	await navigateToGeminiEditPage(client, projectId, { forceNavigate: true });
	const expectedName = typeof options?.expectedName === "string" ? options.expectedName.trim() : "";
	const predicate = expectedName
		? `(() => {
        const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
        if (!(input instanceof HTMLInputElement)) return null;
        const value = input.value.trim();
        return value === ${JSON.stringify(expectedName)} ? { value } : null;
      })()`
		: `(() => {
        const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
        if (!(input instanceof HTMLInputElement)) return null;
        const value = input.value.trim();
        return value ? { value } : null;
      })()`;
	const ready = await waitForPredicate(client.Runtime, predicate, {
		timeoutMs: options?.timeoutMs ?? 15_000,
		description: expectedName
			? `Gemini Gem name persisted as ${expectedName}`
			: "Gemini Gem name hydrated",
	});
	const value =
		typeof (ready.value as { value?: string } | undefined)?.value === "string"
			? ((ready.value as { value?: string }).value ?? "").trim()
			: "";
	if (!value) {
		throw new Error("Gemini Gem name input did not expose a persisted name.");
	}
	return value;
}

export function resolveGeminiProjectMenuAriaLabel(projectName: string): string {
	return `More options for "${projectName}" Gem`;
}

async function openGeminiProjectActionsMenuOnProjectPage(
	client: ChromeClient,
	projectId: string,
): Promise<void> {
	await navigateToGeminiConversationSurface(client, resolveGeminiProjectUrl(projectId));
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const onRoute = location.pathname === ${JSON.stringify(`/gem/${projectId}`)};
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      return onRoute && button instanceof HTMLElement && visible(button) ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: `Gemini Gem actions button ready for ${projectId}`,
		},
	);
	if (!ready.ok) {
		throw new Error(`Gemini Gem actions button not ready for ${projectId}.`);
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      if (!(button instanceof HTMLElement)) return null;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    })()`,
		returnByValue: true,
	});
	const point = result?.value as { x?: number; y?: number } | null;
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
		throw new Error(`Gemini Gem actions button not clickable for ${projectId}.`);
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: Number(point.x),
		y: Number(point.y),
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
}

async function openGeminiConversationActionsMenuOnConversationPage(
	client: ChromeClient,
	conversationId: string,
): Promise<void> {
	await navigateToGeminiConversationSurface(client, resolveGeminiConversationUrl(conversationId));
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const onRoute = location.pathname === ${JSON.stringify(`/app/${conversationId}`)};
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      return onRoute && button instanceof HTMLElement && visible(button) ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: `Gemini conversation actions button ready for ${conversationId}`,
		},
	);
	if (!ready.ok) {
		throw new Error(`Gemini conversation actions button not ready for ${conversationId}.`);
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const button = document.querySelector('button[data-test-id="conversation-actions-menu-icon-button"]');
      if (!(button instanceof HTMLElement)) return null;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    })()`,
		returnByValue: true,
	});
	const point = result?.value as { x?: number; y?: number } | null;
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
		throw new Error(`Gemini conversation actions button not clickable for ${conversationId}.`);
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: Number(point.x),
		y: Number(point.y),
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: Number(point.x),
		y: Number(point.y),
		button: "left",
		clickCount: 1,
	});
}

async function _openGeminiProjectMenu(
	client: ChromeClient,
	projectId: string,
): Promise<{ projectName: string; menuLabel: string }> {
	const projectName = await readGeminiPersistedProjectName(client, projectId, {
		timeoutMs: 20_000,
	});
	const menuLabel = resolveGeminiProjectMenuAriaLabel(projectName);
	await navigateToGeminiGemsViewPage(client);
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const label = ${JSON.stringify(menuLabel)};
      return Array.from(document.querySelectorAll('button[aria-label],a[aria-label]'))
        .some((node) => String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label)
        ? { ready: true }
        : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: `Gemini Gem row menu ready for ${projectName}`,
		},
	);
	if (!ready.ok) {
		throw new Error(`Gemini Gem row menu not found for "${projectName}".`);
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const projectId = ${JSON.stringify(projectId)};
      const label = ${JSON.stringify(menuLabel)};
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const projectAnchor = anchors.find((node) =>
        node instanceof HTMLAnchorElement &&
        visible(node) &&
        node.href.includes('/gem/' + projectId),
      );
      const row =
        (projectAnchor instanceof HTMLElement
          ? projectAnchor.closest('[role="listitem"], mat-list-item, li, div')
          : null) ??
        null;
      const rowCandidate = row instanceof HTMLElement && visible(row) ? row : null;
      const scopedButtons = rowCandidate
        ? Array.from(rowCandidate.querySelectorAll('button[aria-label],a[aria-label]'))
        : [];
      const target =
        scopedButtons.find((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label,
        ) ??
        Array.from(document.querySelectorAll('button[aria-label],a[aria-label]')).find((node) =>
          node instanceof HTMLElement &&
          visible(node) &&
          String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === label,
        );
      if (!(target instanceof HTMLElement)) return { ok: false, reason: rowCandidate ? 'row-menu-missing' : 'project-row-missing' };
      if (rowCandidate) {
        rowCandidate.scrollIntoView({ block: 'center', inline: 'center' });
      }
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const rowRect = rowCandidate?.getBoundingClientRect();
      const touchTarget = target.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : target;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: 'row-menu-not-clickable' };
      }
      return {
        ok: true,
        rowX: rowRect && rowRect.width > 0 && rowRect.height > 0 ? rowRect.left + Math.min(40, Math.max(12, rowRect.width / 5)) : null,
        rowY: rowRect && rowRect.width > 0 && rowRect.height > 0 ? rowRect.top + rowRect.height / 2 : null,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as {
		ok?: boolean;
		reason?: string;
		x?: number;
		y?: number;
		rowX?: number | null;
		rowY?: number | null;
	};
	if (!payload.ok) {
		throw new Error(payload.reason || `Gemini Gem row menu not found for "${projectName}".`);
	}
	if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
		throw new Error(`Gemini Gem row menu not clickable for "${projectName}".`);
	}
	if (Number.isFinite(payload.rowX) && Number.isFinite(payload.rowY)) {
		await client.Input.dispatchMouseEvent({
			type: "mouseMoved",
			x: Number(payload.rowX),
			y: Number(payload.rowY),
			button: "none",
		});
		await client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: Number(payload.rowX),
			y: Number(payload.rowY),
			button: "left",
			clickCount: 1,
		});
		await client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: Number(payload.rowX),
			y: Number(payload.rowY),
			button: "left",
			clickCount: 1,
		});
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: Number(payload.x),
		y: Number(payload.y),
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: Number(payload.x),
		y: Number(payload.y),
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: Number(payload.x),
		y: Number(payload.y),
		button: "left",
		clickCount: 1,
	});
	return { projectName, menuLabel };
}

async function selectGeminiProjectDeleteMenuItem(client: ChromeClient): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const button =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      return button instanceof HTMLElement && visible(button)
        ? { ready: true }
        : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini Gem delete menu item ready",
		},
	);
	if (!ready.ok) {
		throw new Error("Gemini Gem delete menu did not open.");
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const deleteNode =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      if (!(deleteNode instanceof HTMLElement)) return { ok: false, reason: 'delete-menu-item-missing' };
      deleteNode.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = deleteNode.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : deleteNode;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { ok: false, reason: 'delete-menu-item-not-clickable' };
      return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
		returnByValue: true,
	});
	const payload = (result?.value ?? {}) as {
		ok?: boolean;
		reason?: string;
		x?: number;
		y?: number;
	};
	if (!payload.ok) {
		throw new Error(payload.reason || "Gemini Gem delete menu item not found.");
	}
	const waitForConfirm = async (timeoutMs: number): Promise<boolean> => {
		const ready = await waitForPredicate(
			client.Runtime,
			`(() => {
        const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        const button = document.querySelector('button[data-test-id="confirm-button"]');
        return button instanceof HTMLElement && visible(button) ? { ready: true } : null;
      })()`,
			{
				timeoutMs,
				description: "Gemini delete confirm button ready",
			},
		);
		return ready.ok;
	};
	if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
		await client.Input.dispatchMouseEvent({
			type: "mouseMoved",
			x: Number(payload.x),
			y: Number(payload.y),
			button: "none",
		});
		await client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: Number(payload.x),
			y: Number(payload.y),
			button: "left",
			clickCount: 1,
		});
		await client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: Number(payload.x),
			y: Number(payload.y),
			button: "left",
			clickCount: 1,
		});
		if (await waitForConfirm(1_500)) {
			return;
		}
	}
	const fallbackClick = await client.Runtime.evaluate({
		expression: `(() => {
      const button =
        document.querySelector('button[data-test-id="delete-button"]') ??
        document.querySelector('button[data-test-id="menu-delete-button"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
		returnByValue: true,
	});
	if (fallbackClick.result?.value === true && (await waitForConfirm(2_500))) {
		return;
	}
	throw new Error("Gemini Gem delete menu item did not open the confirmation dialog.");
}

async function pressGeminiGemSaveButton(
	client: Pick<ChromeClient, "Runtime" | "Input">,
): Promise<{ ok?: boolean; reason?: string }> {
	const located = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const exact = new Set(['create', 'update chat', 'update gem', 'save', 'update']);
      const button = Array.from(document.querySelectorAll(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}))
        .find((node) => {
          if (!(node instanceof HTMLElement) || !visible(node)) return false;
          if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') return false;
          const text = normalize(node.textContent || '').toLowerCase();
          const aria = normalize(node.getAttribute('aria-label') || '').toLowerCase();
          return exact.has(text) || exact.has(aria) || aria.includes('save gem updates');
        });
      if (!(button instanceof HTMLElement)) return null;
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = clickTarget.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
		returnByValue: true,
	});
	const point = located.result?.value as { x?: number; y?: number } | undefined;
	if (typeof point?.x === "number" && typeof point?.y === "number") {
		await client.Input.dispatchMouseEvent({
			type: "mouseMoved",
			x: point.x,
			y: point.y,
			button: "none",
		});
		await client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
		await client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: point.x,
			y: point.y,
			button: "left",
			clickCount: 1,
		});
		return { ok: true };
	}
	const fallback = await pressButton(client.Runtime, {
		selector: GEMINI_GEM_CREATE_BUTTON_SELECTOR,
		match: {
			exact: ["Create", "Update Chat", "Update Gem", "Save", "Update"],
		},
		interactionStrategies: ["click", "pointer"],
		timeoutMs: 10_000,
	});
	if (!fallback.ok) {
		return fallback;
	}
	return { ok: true };
}

async function openGeminiKnowledgeUploadMenu(Runtime: ChromeClient["Runtime"]): Promise<void> {
	const pressed = await pressButton(Runtime, {
		selector: GEMINI_GEM_KNOWLEDGE_UPLOAD_TRIGGER_SELECTOR,
		interactionStrategies: ["click", "pointer"],
		timeoutMs: 10_000,
	});
	if (!pressed.ok) {
		throw new Error(
			`Gemini Gem knowledge upload menu did not open: ${pressed.reason ?? "upload trigger not clickable."}`,
		);
	}
	const ready = await waitForPredicate(
		Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const items = Array.from(document.querySelectorAll('button[role="menuitem"], [role="menuitem"]'))
        .filter((node) => visible(node));
      return items.length > 0 ? { ready: true } : null;
    })()`,
		{
			timeoutMs: 10_000,
			description: "Gemini Gem knowledge upload menu ready",
		},
	);
	if (!ready.ok) {
		throw new Error("Gemini Gem knowledge upload menu item did not become ready.");
	}
}

async function clickFirstGeminiKnowledgeMenuRow(
	client: Pick<ChromeClient, "Runtime" | "Input">,
): Promise<boolean> {
	const located = await client.Runtime.evaluate({
		expression: `(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const items = Array.from(document.querySelectorAll('button[role="menuitem"], [role="menuitem"]'))
        .filter((node) => visible(node));
      const first = items[0];
      if (!(first instanceof HTMLElement)) return null;
      first.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = first.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
		returnByValue: true,
	});
	const point = located.result?.value as { x?: number; y?: number } | undefined;
	if (typeof point?.x !== "number" || typeof point?.y !== "number") {
		return false;
	}
	await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: point.x, y: point.y });
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	return true;
}

async function dispatchGeminiKnowledgeFiles(
	client: Pick<ChromeClient, "Page" | "DOM" | "Runtime" | "Input">,
	filePaths: string[],
): Promise<void> {
	const imageOnly = filePaths.length > 0 && filePaths.every(isLikelyImagePath);
	await client.Page.enable();
	await client.DOM.enable();
	await (
		client.Page as unknown as {
			setInterceptFileChooserDialog(params: { enabled: boolean }): Promise<unknown>;
			fileChooserOpened(callback: (params: { backendNodeId?: number }) => void): void;
		}
	).setInterceptFileChooserDialog({ enabled: true });
	try {
		const chooserOpened = new Promise<{ backendNodeId?: number }>((resolve) => {
			(
				client.Page as unknown as {
					fileChooserOpened(callback: (params: { backendNodeId?: number }) => void): void;
				}
			).fileChooserOpened((params) => resolve(params));
		});
		const trustedClick = async (selector: string): Promise<boolean> => {
			const located = await client.Runtime.evaluate({
				expression: `(() => {
          const target = document.querySelector(${JSON.stringify(selector)});
          if (!(target instanceof HTMLElement)) return null;
          const rect = target.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return null;
          target.scrollIntoView({ block: 'center', inline: 'center' });
          const nextRect = target.getBoundingClientRect();
          return {
            x: nextRect.left + nextRect.width / 2,
            y: nextRect.top + nextRect.height / 2,
          };
        })()`,
				returnByValue: true,
			});
			const point = located.result?.value as { x?: number; y?: number } | undefined;
			if (typeof point?.x !== "number" || typeof point?.y !== "number") {
				return false;
			}
			await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: point.x, y: point.y });
			await client.Input.dispatchMouseEvent({
				type: "mousePressed",
				x: point.x,
				y: point.y,
				button: "left",
				clickCount: 1,
			});
			await client.Input.dispatchMouseEvent({
				type: "mouseReleased",
				x: point.x,
				y: point.y,
				button: "left",
				clickCount: 1,
			});
			return true;
		};
		const clickKnowledgeScopedHiddenTrigger = async (selector: string): Promise<boolean> => {
			const located = await client.Runtime.evaluate({
				expression: `(() => {
          const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
          const matchesScope = (node) => {
            let current = node;
            for (let depth = 0; current && depth < 6; depth += 1) {
              const text = normalize(current.textContent || '');
              if (text.includes('Add files for your Gem to reference')) {
                return true;
              }
              current = current.parentElement;
            }
            return false;
          };
          const targets = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
          const target = targets.find((node) => node instanceof HTMLElement && matchesScope(node));
          if (!(target instanceof HTMLElement)) return null;
          target.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = target.getBoundingClientRect();
          return {
            x: rect.left + Math.max(rect.width, 1) / 2,
            y: rect.top + Math.max(rect.height, 1) / 2,
          };
        })()`,
				returnByValue: true,
			});
			const point = located.result?.value as { x?: number; y?: number } | undefined;
			if (typeof point?.x !== "number" || typeof point?.y !== "number") {
				return false;
			}
			await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: point.x, y: point.y });
			await client.Input.dispatchMouseEvent({
				type: "mousePressed",
				x: point.x,
				y: point.y,
				button: "left",
				clickCount: 1,
			});
			await client.Input.dispatchMouseEvent({
				type: "mouseReleased",
				x: point.x,
				y: point.y,
				button: "left",
				clickCount: 1,
			});
			return true;
		};
		const hiddenSelectorOrder = imageOnly
			? [
					GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR,
					'button[data-test-id="hidden-local-image-upload-button"]',
					'button[data-test-id="hidden-local-file-upload-button"]',
				]
			: [
					GEMINI_GEM_KNOWLEDGE_UPLOAD_ITEM_SELECTOR,
					'button[data-test-id="hidden-local-file-upload-button"]',
					'button[data-test-id="hidden-local-image-upload-button"]',
				];
		await client.Runtime.evaluate({
			expression: `(() => {
        const selectors = ${JSON.stringify(hiddenSelectorOrder)};
        for (const selector of selectors) {
          const target = document.querySelector(selector);
          if (!(target instanceof HTMLElement)) continue;
          target.click();
          return { ok: true, selector };
        }
        return { ok: false };
      })()`,
			returnByValue: true,
		});
		let chooserPayload: { backendNodeId?: number } | null = null;
		try {
			await clickFirstGeminiKnowledgeMenuRow(client).catch(() => false);
			chooserPayload = await Promise.race([
				chooserOpened,
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("chooser-timeout")), 3_000),
				),
			]);
		} catch {
			let activated = false;
			for (const selector of hiddenSelectorOrder) {
				const clickedTrusted = await clickKnowledgeScopedHiddenTrigger(selector).catch(() => false);
				if (clickedTrusted) {
					activated = true;
					break;
				}
				const clickedGeneric = await trustedClick(selector).catch(() => false);
				if (clickedGeneric) {
					activated = true;
					break;
				}
				const clicked = await client.Runtime.evaluate({
					expression: `(() => {
            const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
            const matchesScope = (node) => {
              let current = node;
              for (let depth = 0; current && depth < 6; depth += 1) {
                const text = normalize(current.textContent || '');
                if (text.includes('Add files for your Gem to reference')) {
                  return true;
                }
                current = current.parentElement;
              }
              return false;
            };
            const targets = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
            const target = targets.find((node) => node instanceof HTMLElement && matchesScope(node)) ?? document.querySelector(${JSON.stringify(selector)});
            if (!(target instanceof HTMLElement)) return false;
            target.click();
            return true;
          })()`,
					returnByValue: true,
				});
				if (clicked.result?.value === true) {
					activated = true;
					break;
				}
			}
			if (!activated) {
				throw new Error("Gemini Gem knowledge Upload file action did not activate.");
			}
			chooserPayload = await Promise.race([
				chooserOpened,
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Gemini Gem knowledge file chooser did not open.")),
						10_000,
					),
				),
			]);
		}
		if (!chooserPayload || !Number.isFinite(chooserPayload.backendNodeId)) {
			throw new Error("Gemini Gem knowledge file chooser did not expose a backend node.");
		}
		await client.DOM.setFileInputFiles({
			backendNodeId: chooserPayload.backendNodeId,
			files: [...filePaths],
		});
	} finally {
		await (
			client.Page as unknown as {
				setInterceptFileChooserDialog(params: { enabled: boolean }): Promise<unknown>;
			}
		)
			.setInterceptFileChooserDialog({ enabled: false })
			.catch(() => undefined);
	}
}

async function waitForGeminiKnowledgeFilesVisible(
	Runtime: ChromeClient["Runtime"],
	fileNames: string[],
	timeoutMs: number = 30_000,
): Promise<void> {
	const ready = await waitForPredicate(
		Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const names = ${JSON.stringify(fileNames.map((name) => name.toLowerCase()))};
      const body = normalize(document.body?.innerText || '');
      const removeLabels = Array.from(document.querySelectorAll('button[aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      const scopedRemoveLabels = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const hasScopedPreview =
        document.querySelector('uploader-file-preview-container.selected-files-container') !== null ||
        document.querySelector('uploader-file-preview') !== null ||
        document.querySelector('img[data-test-id="image-preview"]') !== null ||
        document.querySelector('div[data-test-id="file-preview"]') !== null;
      return names.every((name) =>
        body.includes(name) ||
        previewNames.includes(name) ||
        removeLabels.includes('remove file ' + name) ||
        scopedRemoveLabels.includes('remove file ' + name) ||
        (hasScopedPreview && scopedRemoveLabels.some((label) => label.startsWith('remove file ')))
      )
        ? { ready: true }
        : null;
    })()`,
		{
			timeoutMs,
			description: `Gemini Gem knowledge files visible: ${fileNames.join(", ")}`,
		},
	);
	if (!ready.ok) {
		throw new Error(`Gemini Gem knowledge upload did not surface files: ${fileNames.join(", ")}`);
	}
}

async function waitForGeminiGemSaved(
	Runtime: ChromeClient["Runtime"],
	timeoutMs: number = 20_000,
): Promise<void> {
	const saved = await waitForPredicate(
		Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const savedBadge = Array.from(document.querySelectorAll('div[role="status"].save-state, div[role="status"], div, span'))
        .some((node) => visible(node) && normalize(node.textContent || '') === 'gem saved');
      if (savedBadge) {
        return { ready: true, state: 'saved-badge' };
      }
      return null;
    })()`,
		{
			timeoutMs,
			description: "Gemini Gem saved",
		},
	);
	if (!saved.ok) {
		throw new Error("Gemini Gem save did not settle.");
	}
}

async function waitForGeminiGemDirty(
	Runtime: ChromeClient["Runtime"],
	timeoutMs: number = 10_000,
): Promise<void> {
	const dirty = await waitForPredicate(
		Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const dirtyBadge = Array.from(document.querySelectorAll('div[role="status"].save-state, div[role="status"], div, span'))
        .some((node) => visible(node) && normalize(node.textContent || '') === 'gem not saved');
      return dirtyBadge ? { ready: true } : null;
    })()`,
		{
			timeoutMs,
			description: "Gemini Gem dirty state visible",
		},
	);
	if (!dirty.ok) {
		throw new Error("Gemini Gem did not enter an unsaved state.");
	}
}

async function waitForGeminiEditSurfaceReady(
	Runtime: ChromeClient["Runtime"],
	projectId: string,
	timeoutMs: number = 20_000,
): Promise<void> {
	const ready = await waitForPredicate(
		Runtime,
		`(() => {
      const onRoute = location.pathname === ${JSON.stringify(`/gems/edit/${projectId}`)};
      const hasName = Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)}));
      const hasSave = Boolean(document.querySelector(${JSON.stringify(GEMINI_GEM_CREATE_BUTTON_SELECTOR)}));
      return onRoute && hasName && hasSave ? { ready: true } : null;
    })()`,
		{
			timeoutMs,
			description: `Gemini Gem edit surface settled for ${projectId}`,
		},
	);
	if (!ready.ok) {
		throw new Error(`Gemini Gem edit surface did not settle for ${projectId}.`);
	}
}

async function scrapeGeminiProjectKnowledgeFiles(
	Runtime: ChromeClient["Runtime"],
): Promise<FileRef[]> {
	const { result } = await Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const rows = Array.from(document.querySelectorAll('button, [role="button"], div, li, span'))
        .filter((node) => visible(node))
        .map((node) => ({
          text: normalize(node.textContent || ''),
          aria: normalize(node.getAttribute?.('aria-label') || ''),
          testId: normalize(node.getAttribute?.('data-test-id') || ''),
        }));
      const blocked = new Set([
        'upload file',
        'add from drive',
        'import code',
        'knowledge',
        'start chat',
        'share',
      ]);
      const items = [];
      const seen = new Set();
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      for (const name of previewNames) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: name,
          name,
          provider: 'gemini',
          source: 'project',
        });
      }
      const removeButtons = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter((label) => /^Remove file\\s+/i.test(label))
        .map((label) => label.replace(/^Remove file\\s+/i, '').trim())
        .filter(Boolean);
      for (const name of removeButtons) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: name,
          name,
          provider: 'gemini',
          source: 'project',
        });
      }
      for (const row of rows) {
        const text = row.text;
        if (!text || text.length < 3 || text.length > 220) continue;
        if (blocked.has(text.toLowerCase())) continue;
        const corpus = (row.text + ' ' + row.aria + ' ' + row.testId).toLowerCase();
        if (corpus.includes('upload file') || corpus.includes('add from drive') || corpus.includes('import code')) continue;
        if (!/[.][a-z0-9]{1,8}$/i.test(text)) continue;
        const lower = text.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        items.push({
          id: text,
          name: text,
          provider: 'gemini',
          source: 'project',
        });
      }
      return items;
    })()`,
		returnByValue: true,
	});
	return Array.isArray(result?.value) ? (result.value as FileRef[]) : [];
}

async function waitForGeminiProjectKnowledgeHydrated(
	Runtime: ChromeClient["Runtime"],
	timeoutMs: number = 8_000,
): Promise<void> {
	await waitForPredicate(
		Runtime,
		`(() => {
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const hasPreviewName = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .some((node) => visible(node) && String(node.getAttribute('title') || node.textContent || '').trim().length > 0);
      const hasRemoveButton = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .some((node) => visible(node) && /^remove file\\s+/i.test(String(node.getAttribute('aria-label') || '').trim()));
      const hasPreviewChip = Array.from(document.querySelectorAll('div[data-test-id="file-preview"], uploader-file-preview-container.selected-files-container, uploader-file-preview'))
        .some((node) => visible(node));
      return hasPreviewName || hasRemoveButton || hasPreviewChip ? { ready: true } : null;
    })()`,
		{
			timeoutMs,
			description: "Gemini Gem knowledge list hydrated",
		},
	).catch(() => undefined);
}

async function clickGeminiKnowledgeRemoveButton(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	fileName: string,
): Promise<boolean> {
	const located = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const targetLabel = ${JSON.stringify(`remove file ${fileName}`.toLowerCase())};
      const visible = (node) => node instanceof Element && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'));
      const button = buttons.find((node) => visible(node) && normalize(node.getAttribute('aria-label') || '') === targetLabel);
      if (!(button instanceof HTMLElement)) {
        return null;
      }
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const touchTarget = button.querySelector('.mat-mdc-button-touch-target');
      const clickTarget = touchTarget instanceof HTMLElement ? touchTarget : button;
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
		returnByValue: true,
	});
	const point = located.result?.value as { x?: number; y?: number } | undefined;
	if (typeof point?.x !== "number" || typeof point?.y !== "number") {
		return false;
	}
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: point.x,
		y: point.y,
		button: "none",
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	});
	return true;
}

async function waitForGeminiKnowledgeFileRemoved(
	Runtime: ChromeClient["Runtime"],
	fileName: string,
	timeoutMs: number = 10_000,
): Promise<void> {
	const removed = await waitForPredicate(
		Runtime,
		`(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const name = ${JSON.stringify(fileName.toLowerCase())};
      const previewNames = Array.from(document.querySelectorAll('[data-test-id="file-name"]'))
        .map((node) => normalize(node.getAttribute('title') || node.textContent || ''))
        .filter(Boolean);
      const removeLabels = Array.from(document.querySelectorAll('button[data-test-id="cancel-button"][aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean);
      const body = normalize(document.body?.innerText || '');
      const hasRemoveButton = removeLabels.includes('remove file ' + name);
      const hasPreviewName = previewNames.includes(name);
      const hasBodyOnly = body.includes(name) && (hasRemoveButton || hasPreviewName);
      return hasRemoveButton || hasPreviewName || hasBodyOnly ? null : { removed: true };
    })()`,
		{
			timeoutMs,
			description: `Gemini Gem knowledge file removed: ${fileName}`,
		},
	);
	if (!removed.ok) {
		throw new Error(`Gemini Gem knowledge file removal did not settle for ${fileName}.`);
	}
}

async function clickGeminiDeleteConfirmations(client: ChromeClient): Promise<number> {
	const opened = await waitForPredicate(
		client.Runtime,
		`(() => {
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node));
      return buttons.length > 0 ? { count: buttons.length } : null;
    })()`,
		{
			timeoutMs: 5_000,
			description: "Gemini delete confirmation dialog ready",
		},
	);
	if (!opened.ok) {
		throw new Error("Gemini delete confirmation dialog did not open.");
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      let clicked = 0;
      const buttons = Array.from(document.querySelectorAll('button[data-test-id="confirm-button"]'))
        .filter((node) => visible(node) && normalize(node.getAttribute('aria-label') || node.textContent || '') === 'delete');
      for (const button of buttons) {
        if (!(button instanceof HTMLElement)) continue;
        button.click();
        clicked += 1;
      }
      return { clicked };
    })()`,
		returnByValue: true,
	});
	const clicked = Number((result?.value as { clicked?: number } | undefined)?.clicked ?? 0);
	if (clicked < 1) {
		throw new Error("Gemini delete confirmation button not found.");
	}
	return clicked;
}

export function createGeminiAdapter(): Pick<
	BrowserProvider,
	| "capabilities"
	| "createProject"
	| "deleteConversation"
	| "deleteProjectFile"
	| "getFeatureSignature"
	| "getUserIdentity"
	| "listProjects"
	| "listConversations"
	| "listProjectFiles"
	| "downloadConversationFile"
	| "materializeConversationArtifact"
	| "readActiveConversationArtifacts"
	| "readConversationContext"
	| "renameConversation"
	| "renameProject"
	| "runPrompt"
	| "selectRemoveProjectItem"
	| "pushProjectRemoveConfirmation"
	| "uploadProjectFiles"
	| "validateConversationUrl"
> {
	return {
		capabilities: {
			projects: true,
			conversations: true,
		},
		async getUserIdentity(
			options?: BrowserProviderListOptions,
		): Promise<ProviderUserIdentity | null> {
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(
					options,
					resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL),
				);
			try {
				return await readGeminiUserIdentity(client);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async getFeatureSignature(options?: BrowserProviderListOptions): Promise<string | null> {
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(
					options,
					resolveGeminiConfiguredUrl(options?.configuredUrl, GEMINI_APP_URL),
				);
			try {
				await assertGeminiExpectedIdentity(client, options);
				return await readGeminiFeatureSignature(client);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, GEMINI_GEMS_VIEW_URL);
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiGemsViewPage(client);
				return await scrapeGeminiProjects(client);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async listConversations(
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<Conversation[]> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			const targetUrl = resolveGeminiConversationRailTargetUrl(options, normalizedProjectId);
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, targetUrl);
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiConversationSurface(client, targetUrl);
				await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
				await ensureGeminiMainMenuOpen(client).catch(() => undefined);
				if (shouldHydrateGeminiConversationHistory(options)) {
					await hydrateGeminiConversationHistory(
						client,
						normalizeGeminiConversationHistoryLimit(options?.historyLimit),
						options?.abortSignal,
					);
				}
				return await scrapeGeminiConversations(client, normalizedProjectId ?? undefined);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async runPrompt(
			input: BrowserProviderPromptInput,
			options?: BrowserProviderListOptions,
		): Promise<BrowserProviderPromptResult> {
			if (input.attachments?.length) {
				throw new Error("Gemini browser prompt execution does not support attachments.");
			}
			const targetUrl = resolveGeminiConfiguredUrl(
				input.targetUrl ?? options?.configuredUrl,
				GEMINI_APP_URL,
			);
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, targetUrl);
			const emitProgress = async (event: BrowserProviderPromptProgressEvent) => {
				await input.onProgress?.(event);
			};
			try {
				await emitProgress({
					phase: "browser_target_attached",
					details: {
						targetId: targetId ?? null,
						host,
						port,
						targetUrl,
					},
				});
				const authorization = options?.providerSessionAuthorization;
				const providerSessionProof = authorization
					? authorization.authority.verify({
							context: {
								...authorization.context,
								browserTargetId: targetId ?? authorization.context.browserTargetId ?? null,
								devtoolsHost: host,
								devtoolsPort: port,
							},
							expectation: authorization.expectation,
							observation: await readGeminiUserIdentity(client),
						})
					: null;
				if (authorization && providerSessionProof) {
					recordProviderSessionProof(authorization, providerSessionProof);
					await emitProgress({
						phase: "provider_auth_preflight",
						details: {
							providerSessionProof,
						},
					});
					authorization.authority.assertProof(providerSessionProof);
				}
				await navigateToGeminiConversationSurface(client, targetUrl);
				await emitProgress({
					phase: "gemini_surface_ready",
					details: {
						targetId: targetId ?? null,
						targetUrl,
					},
				});
				await dismissGeminiPreciseLocationDialog(client.Runtime).catch(() => undefined);
				await selectGeminiWorkbenchCapability(client, input.capabilityId);
				await emitProgress({
					phase: "capability_selected",
					details: {
						capabilityId: input.capabilityId ?? null,
						targetId: targetId ?? null,
					},
				});
				const baseline = await readGeminiPromptState(client.Runtime);
				await emitProgress({
					phase: "composer_ready",
					details: {
						href: baseline.href || null,
						conversationId: baseline.conversationId ?? null,
						targetId: targetId ?? null,
						isGenerating: baseline.isGenerating,
						hasGeneratedMedia: baseline.hasGeneratedMedia,
					},
				});
				await setGeminiPrompt(client, input.prompt);
				await emitProgress({
					phase: "prompt_inserted",
					details: {
						targetId: targetId ?? null,
						promptLength: input.prompt.length,
					},
				});
				const submittedState = await submitGeminiPromptWithFallback(
					client,
					baseline,
					input.prompt,
					emitProgress,
				);
				await emitProgress({
					phase: "submitted_state_observed",
					details: {
						href: submittedState.href || null,
						conversationId: submittedState.conversationId ?? null,
						targetId: targetId ?? null,
						isGenerating: submittedState.isGenerating,
						hasGeneratedMedia: submittedState.hasGeneratedMedia,
					},
				});
				if (input.completionMode === "prompt_submitted") {
					let result: BrowserProviderPromptResult;
					if (
						input.capabilityId === "gemini.media.create_image" ||
						input.capabilityId === "gemini.media.create_music" ||
						input.capabilityId === "gemini.media.create_video"
					) {
						result = await waitForGeminiSubmittedMediaPromptResult(
							client.Runtime,
							baseline,
							submittedState,
							input.prompt,
							input.timeoutMs ?? 300_000,
						);
					} else {
						result = await waitForGeminiSubmittedPromptResult(
							client.Runtime,
							baseline,
							submittedState,
							input.prompt,
							15_000,
						);
					}
					return { ...result, tabTargetId: targetId ?? null };
				}
				const result = await waitForGeminiPromptResponse(
					client.Runtime,
					baseline,
					input.prompt,
					Math.max(30_000, input.timeoutMs ?? 90_000),
				);
				return { ...result, tabTargetId: targetId ?? null };
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async createProject(
			input: {
				name: string;
				instructions?: string;
				modelLabel?: string;
				files?: string[];
				memoryMode?: ProjectMemoryMode;
			},
			options?: BrowserProviderListOptions,
		): Promise<Project | null> {
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, GEMINI_GEM_CREATE_URL);
			try {
				await assertGeminiExpectedIdentity(client, options);
				return await createGeminiProjectWithClient(client, input);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async readConversationContext(
			conversationId: string,
			_projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<ConversationContext> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(
					options,
					resolveGeminiConversationRailTargetUrl(options, _projectId),
				);
			try {
				await assertGeminiExpectedIdentity(client, options);
				return await readGeminiConversationContextWithClient(client, normalizedConversationId, {
					allowNavigation: options?.preserveActiveTab !== true,
				});
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async readActiveConversationArtifacts(
			conversationId: string,
			options?: BrowserProviderListOptions,
		): Promise<ConversationArtifact[]> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			if (!options?.tabTargetId && options?.allowNavigation !== true) {
				throw new Error("Gemini active artifact read requires the submitted tab target id.");
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(
					options,
					options?.allowNavigation === true && options?.preserveActiveTab !== true
						? resolveGeminiConversationUrl(normalizedConversationId)
						: (options?.tabUrl ?? options?.configuredUrl ?? GEMINI_APP_URL),
				);
			try {
				await assertGeminiExpectedIdentity(client, options);
				if (options?.tabTargetId && targetId && targetId !== options.tabTargetId) {
					throw new Error(
						`Gemini active artifact read rebound to target ${targetId} instead of submitted target ${options.tabTargetId}.`,
					);
				}
				const context = await readGeminiConversationContextWithClient(
					client,
					normalizedConversationId,
					{
						allowNavigation:
							options?.allowNavigation === true && options?.preserveActiveTab !== true,
					},
				);
				return normalizeGeminiConversationArtifacts(context.artifacts);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async materializeConversationArtifact(
			conversationId: string,
			artifact: ConversationArtifact,
			destDir: string,
			_projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<FileRef | null> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(
					options,
					resolveGeminiConversationRailTargetUrl(options, _projectId),
				);
			try {
				await assertGeminiExpectedIdentity(client, options);
				if (options?.tabTargetId && targetId && targetId !== options.tabTargetId) {
					throw new Error(
						`Gemini artifact materialization rebound to target ${targetId} instead of submitted target ${options.tabTargetId}.`,
					);
				}
				return await materializeGeminiConversationArtifactWithClient(
					client,
					normalizedConversationId,
					artifact,
					destDir,
					{
						allowNavigation: options?.preserveActiveTab !== true,
						downloadVariantLabel: options?.downloadVariantLabel ?? null,
					},
				);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async downloadConversationFile(
			conversationId: string,
			fileId: string,
			destPath: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiConversationRailTargetUrl(options));
			try {
				await assertGeminiExpectedIdentity(client, options);
				if (options?.tabTargetId && targetId && targetId !== options.tabTargetId) {
					throw new Error(
						`Gemini conversation file download rebound to target ${targetId} instead of submitted target ${options.tabTargetId}.`,
					);
				}
				await downloadGeminiConversationFileWithClient(
					client,
					normalizedConversationId,
					fileId,
					destPath,
					{
						allowNavigation: providerNavigationAllowed(options),
					},
				);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async renameConversation(
			conversationId: string,
			newTitle: string,
			_projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiConversationUrl(normalizedConversationId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await renameGeminiConversationOnPage(client, normalizedConversationId, newTitle);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async deleteConversation(
			conversationId: string,
			_projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiConversationUrl(normalizedConversationId));
			const trace: GeminiDeleteTrace = [];
			try {
				await assertGeminiExpectedIdentity(client, options);
				await openGeminiConversationActionsMenuOnConversationPage(client, normalizedConversationId);
				await selectGeminiConversationDeleteMenuItem(client, trace);
				await clickGeminiConversationDeleteConfirmations(client, trace);
				await waitForGeminiConversationRemoved(client, normalizedConversationId, 90_000, trace);
			} catch (error) {
				trace.push(await collectGeminiDeleteSurfaceState(client.Runtime, "delete-error"));
				const traceSummary = summarizeGeminiDeleteTrace(trace, 5);
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`${message} trace=${traceSummary}`);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async validateConversationUrl(
			conversationId: string,
			_projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedConversationId = normalizeGeminiConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error(`Invalid Gemini conversation id: ${conversationId}`);
			}
			const targetUrl = resolveGeminiConversationUrl(normalizedConversationId);
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, targetUrl);
			try {
				await assertGeminiExpectedIdentity(client, options);
				await validateGeminiConversationUrlWithClient(client, normalizedConversationId);
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async renameProject(
			projectId: string,
			newTitle: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiEditProjectUrl(normalizedProjectId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiEditPage(client, normalizedProjectId);
				const setName = await setInputValue(client.Runtime, {
					selector: GEMINI_GEM_NAME_INPUT_SELECTOR,
					value: newTitle,
					timeoutMs: 10_000,
				});
				if (!setName) {
					throw new Error("Gemini Gem name input did not become ready for rename.");
				}
				await client.Runtime.evaluate({
					expression: `(() => {
            const input = document.querySelector(${JSON.stringify(GEMINI_GEM_NAME_INPUT_SELECTOR)});
            if (!(input instanceof HTMLInputElement)) return false;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          })()`,
					returnByValue: true,
				});
				const pressed = await pressGeminiGemSaveButton(client);
				if (!pressed.ok) {
					throw new Error(
						`Gemini Gem update failed: ${pressed.reason ?? "Update button not clickable."}`,
					);
				}
				const persistedName = await readGeminiPersistedProjectName(client, normalizedProjectId, {
					expectedName: newTitle,
					timeoutMs: 20_000,
				});
				if (persistedName !== newTitle.trim()) {
					throw new Error(
						`Gemini Gem rename did not persist. Expected "${newTitle}", got "${persistedName}".`,
					);
				}
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async uploadProjectFiles(
			projectId: string,
			filePaths: string[],
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			if (filePaths.length === 0) return;
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiEditProjectUrl(normalizedProjectId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiEditPage(client, normalizedProjectId);
				await openGeminiKnowledgeUploadMenu(client.Runtime);
				const fileNames = filePaths.map((filePath) => path.basename(filePath));
				await dispatchGeminiKnowledgeFiles(client, filePaths);
				let knowledgeVisible = false;
				try {
					await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 8_000);
					knowledgeVisible = true;
				} catch {
					await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
						() => undefined,
					);
					const persisted = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
					const persistedNames = persisted.map((item) => item.name.toLowerCase());
					if (fileNames.every((name) => persistedNames.includes(name.toLowerCase()))) {
						knowledgeVisible = true;
					}
				}
				if (!knowledgeVisible) {
					throw new Error(
						`Gemini Gem knowledge upload did not surface files: ${fileNames.join(", ")}`,
					);
				}
				await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
					() => undefined,
				);
				const pressed = await pressGeminiGemSaveButton(client);
				if (!pressed.ok) {
					throw new Error(
						`Gemini Gem knowledge save failed: ${pressed.reason ?? "Save button not clickable."}`,
					);
				}
				await waitForGeminiGemSaved(client.Runtime);
				await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
					() => undefined,
				);
				const persistedAfterSave = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
				const persistedNames = persistedAfterSave.map((item) => item.name.toLowerCase());
				if (!fileNames.every((name) => persistedNames.includes(name.toLowerCase()))) {
					const stillOnEditRoute = await client.Runtime.evaluate({
						expression: `location.pathname === ${JSON.stringify(`/gems/edit/${normalizedProjectId}`)}`,
						returnByValue: true,
					});
					if (stillOnEditRoute.result?.value === true) {
						await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 10_000);
					} else {
						await navigateToGeminiEditPage(client, normalizedProjectId);
						await waitForGeminiKnowledgeFilesVisible(client.Runtime, fileNames, 10_000);
					}
				}
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async listProjectFiles(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<FileRef[]> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiEditProjectUrl(normalizedProjectId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiEditPage(client, normalizedProjectId);
				await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
					() => undefined,
				);
				let files = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
				if (files.length === 0) {
					await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 8_000);
					files = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
				}
				return files;
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async deleteProjectFile(
			projectId: string,
			fileName: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiEditProjectUrl(normalizedProjectId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await navigateToGeminiEditPage(client, normalizedProjectId);
				await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
					() => undefined,
				);
				await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 8_000);
				const existing = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
				const matched = existing.find((item) => item.name.toLowerCase() === fileName.toLowerCase());
				if (!matched) {
					return;
				}
				const clicked = await clickGeminiKnowledgeRemoveButton(client, matched.name);
				if (!clicked) {
					throw new Error(`Gemini Gem knowledge remove button not found for ${matched.name}.`);
				}
				await waitForGeminiKnowledgeFileRemoved(client.Runtime, matched.name, 10_000);
				await waitForGeminiGemDirty(client.Runtime, 10_000);
				const pressed = await pressGeminiGemSaveButton(client);
				if (!pressed.ok) {
					throw new Error(
						`Gemini Gem knowledge delete save failed: ${pressed.reason ?? "Save button not clickable."}`,
					);
				}
				await waitForGeminiGemSaved(client.Runtime);
				await navigateToGeminiEditPage(client, normalizedProjectId, { forceNavigate: true });
				await waitForGeminiEditSurfaceReady(client.Runtime, normalizedProjectId, 15_000).catch(
					() => undefined,
				);
				await waitForGeminiProjectKnowledgeHydrated(client.Runtime, 5_000);
				const persisted = await scrapeGeminiProjectKnowledgeFiles(client.Runtime);
				const stillPresent = persisted.some(
					(item) => item.name.toLowerCase() === matched.name.toLowerCase(),
				);
				if (stillPresent) {
					throw new Error(
						`Gemini Gem knowledge file "${matched.name}" still appears after delete.`,
					);
				}
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
		async selectRemoveProjectItem(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			void options;
			// Gemini keeps delete as one direct-page action chain.
			// The shared CLI still calls select + confirm as two steps, so Gemini
			// keeps the full flow in pushProjectRemoveConfirmation(...).
		},
		async pushProjectRemoveConfirmation(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			const normalizedProjectId = normalizeGeminiProjectId(projectId);
			if (!normalizedProjectId) {
				throw new Error(`Invalid Gemini Gem id: ${projectId}`);
			}
			const { client, targetId, shouldClose, host, port, borrowedFromSession } =
				await connectToGeminiTab(options, resolveGeminiProjectUrl(normalizedProjectId));
			try {
				await assertGeminiExpectedIdentity(client, options);
				await openGeminiProjectActionsMenuOnProjectPage(client, normalizedProjectId);
				await selectGeminiProjectDeleteMenuItem(client);
				await clickGeminiDeleteConfirmations(client);
				await navigateToGeminiGemsViewPage(client, { forceNavigate: true });
				const deleted = await waitForPredicate(
					client.Runtime,
					`(() => {
            const projectId = ${JSON.stringify(normalizedProjectId)};
            return !Array.from(document.querySelectorAll('a[href]'))
              .some((node) => node instanceof HTMLAnchorElement && node.href.includes('/gem/' + projectId))
              ? { deleted: true }
              : null;
          })()`,
					{
						timeoutMs: 15_000,
						description: `Gemini Gem ${normalizedProjectId} removed`,
					},
				);
				if (!deleted.ok) {
					throw new Error(
						`Gemini Gem ${normalizedProjectId} still appears in the Gem manager after delete confirmation.`,
					);
				}
			} finally {
				await closeGeminiTabConnection(
					{ client, targetId, shouldClose, host, port, borrowedFromSession },
					options,
				);
			}
		},
	};
}
