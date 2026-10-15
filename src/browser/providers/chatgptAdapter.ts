import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	connectToChromeTarget,
	openOrReuseChromeTarget,
} from "../../../packages/browser-service/src/chromeLifecycle.js";
import type { BrowserInteractionClass } from "../../../packages/browser-service/src/service/interactionGovernor.js";
import {
	requireBundledServiceBaseUrl,
	requireBundledServiceCompatibleHosts,
	requireBundledServiceRouteTemplate,
	resolveBundledServiceArtifactContentTypeExtensions,
	resolveBundledServiceArtifactDefaultTitle,
	resolveBundledServiceArtifactKindExtensions,
	resolveBundledServiceArtifactNameMimeTypes,
	resolveBundledServiceArtifactPayloadMarkerSet,
	resolveBundledServiceDomSelector,
	resolveBundledServiceDomSelectorSet,
	resolveBundledServiceFeatureDetector,
	resolveBundledServiceFeatureFlagTokens,
	resolveBundledServiceUiLabel,
	resolveBundledServiceUiLabelSet,
	resolveEffectiveServiceUiLabelSet,
} from "../../services/registry.js";
import { transferAttachmentViaDataTransfer } from "../actions/attachmentDataTransfer.js";
import {
	clearComposerAttachments,
	uploadAttachmentFile,
	waitForAttachmentCompletion,
} from "../actions/attachments.js";
import { CHATGPT_RICH_PROMPT_INPUT_SELECTOR } from "../actions/chatgptComposer.js";
import {
	ensureChatgptComposerMode,
	resolveChatgptModelSelectionPlan,
} from "../actions/chatgptComposerMode.js";
import { ensureChatgptComposerTool } from "../actions/chatgptComposerTool.js";
import {
	assertChatgptEcosystemMentionSelected,
	ensureChatgptEcosystemMention,
} from "../actions/chatgptEcosystemMention.js";
import {
	attachChatgptLibraryFiles,
	verifyChatgptLibraryFileAttachments,
} from "../actions/chatgptLibraryFiles.js";
import { ensureChatgptWorkModelSelection } from "../actions/chatgptWorkModelSelection.js";
import { ensureModelSelection, shouldApplyChatgptThinkingTime } from "../actions/modelSelection.js";
import { ensurePromptReady } from "../actions/navigation.js";
import { submitPrompt } from "../actions/promptComposer.js";
import { ensureThinkingTime } from "../actions/thinkingTime.js";
import CDP from "../cdp.js";
import {
	extractChatgptRateLimitSummary,
	isChatgptRateLimitMessage,
} from "../chatgptRateLimitGuard.js";
import { captureBrowserPostmortemSnapshot, persistBrowserPostmortemRecord } from "../domDebug.js";
import { recordDomDriftObservation } from "../domDriftObservations.js";
import type { LibraryFileAttachmentReceipt } from "../libraryFiles.js";
import {
	recordLibraryInventoryCleanupPhase,
	recordLibraryInventoryStage,
} from "../libraryInventoryDiagnostics.js";
import { ChatgptFeatureSchema } from "../llmService/providers/schema.js";
import { OwnedBackendRequestCleanupError } from "../ownedBackendRequestAuthority.js";
import {
	armDownloadCapture,
	closeDialog,
	collectVisibleOverlayInventory,
	DEFAULT_DIALOG_SELECTORS,
	dismissOverlayRoot,
	hoverAndReveal,
	hoverElement,
	navigateAndSettle,
	openAndSelectMenuItem,
	openAndSelectMenuItemFromTriggers,
	openAndSelectRevealedRowMenuItem,
	openMenu,
	openSurface,
	type PressButtonOptions,
	pressButton,
	reloadAndSettle,
	setInputValue,
	submitInlineRename,
	waitForDownloadCapture,
	waitForPredicate,
	waitForSelector,
	withAnchoredActionDiagnostics,
	withBlockingSurfaceRecovery,
	withUiDiagnostics,
} from "../service/ui.js";
import type { BrowserLogger, ChromeClient } from "../types.js";
import { CHATGPT_PROVIDER } from "./chatgpt.js";
import {
	buildChatgptArtifactControlExpectation,
	reconcileChatgptPayloadDownloadControls,
	resolveChatgptArtifactControlCandidate,
} from "./chatgptArtifactControls.js";
import type {
	Conversation,
	ConversationArtifact,
	ConversationContext,
	ConversationSource,
	FileRef,
	Project,
	ProjectMemoryMode,
} from "./domain.js";
import {
	annotateClientMutationContext,
	resolveMutationAudit,
	resolveMutationSource,
	resolveProviderTrafficGovernor,
} from "./mutationAudit.js";
import { providerNavigationAllowed } from "./navigationPolicy.js";
import { assertProviderSessionAuthorization } from "./providerSessionAuthority.js";
import {
	recordBrowserScrapeCandidateCount,
	recordBrowserScrapeCdpCall,
	recordBrowserScrapeDownloadAttempt,
	recordBrowserScrapeDownloadFailure,
	recordBrowserScrapeDownloadSuccess,
	recordBrowserScrapeNote,
	recordBrowserScrapeProviderAction,
	withBrowserScrapePendingOperation,
} from "./scrapeTelemetry.js";
import type {
	BrowserProvider,
	BrowserProviderConversationFileDownloadInput,
	BrowserProviderConversationFileDownloadResult,
	BrowserProviderListOptions,
	BrowserProviderPromptInput,
	BrowserProviderPromptResult,
	BrowserProviderPromptWorkbenchInput,
	BrowserProviderPromptWorkbenchResult,
	ProviderUserIdentity,
} from "./types.js";

const CHATGPT_HOME_URL = requireBundledServiceBaseUrl("chatgpt");
const CHATGPT_LIBRARY_URL = requireBundledServiceRouteTemplate("chatgpt", "library");
const CHATGPT_PLUGINS_URL = new URL("/plugins#settings/Plugins", CHATGPT_HOME_URL).href;
const CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS = resolveBundledServiceDomSelectorSet(
	"chatgpt",
	"project_dialog_roots",
	['[data-testid="modal-new-project-enhanced"]', "dialog[open]", '[role="dialog"]', "dialog"],
);
const CHATGPT_PROJECT_DIALOG_SELECTOR = CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS.join(", ");
const CHATGPT_PROJECT_NAME_INPUT_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_name_input",
	"Project name",
);
const CHATGPT_PROJECT_NAME_INPUT_SELECTOR = [
	'input[name="projectName"]',
	`input[aria-label=${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL)}]`,
	"#project-name",
].join(", ");
const CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_instructions_input",
	"Instructions",
);
const CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR = [
	`textarea[aria-label=${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL)}]`,
	"textarea#instructions",
].join(", ");
const CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_settings_button",
	"Project settings",
);
const CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH = normalizeUiText(
	CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL,
).toLowerCase();
const CHATGPT_PROJECT_TITLE_EDIT_PREFIX = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_title_edit_prefix", "edit the title of"),
).toLowerCase();
const CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_memory_global",
	"Default",
);
const CHATGPT_PROJECT_MEMORY_PROJECT_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_memory_project",
	"Project-only",
);
const CHATGPT_PROJECT_MEMORY_MENU_ITEM_SELECTOR = [
	'[role="menu"] [role="menuitemradio"]',
	'[role="menu"] [role="menuitem"][aria-checked]',
	'[role="menu"] button[aria-checked]',
	'[role="menu"] [aria-checked]',
].join(", ");
const CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_controls_details", "show project details"),
).toLowerCase();
const CHATGPT_PROJECT_TAB_CHATS_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_tab_chats", "chats"),
).toLowerCase();
const CHATGPT_PROJECT_TAB_SOURCES_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_tab_sources", "sources"),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ADD_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_source_add", "add sources"),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_source_add_fallback", "add"),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ACTIONS_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"project_source_actions",
	"Source actions",
);
const CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR = `button[aria-label=${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTIONS_LABEL)}]`;
const CHATGPT_PROJECT_SOURCE_ROW_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"project_source_row",
	'div[class*="group/file-row"]',
);
const CHATGPT_PROJECT_SOURCES_TAB_ID_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"project_sources_tab_id",
	'[role="tab"][id$="-sources"]',
);
const _CHATGPT_PROJECT_UPLOAD_BUTTON_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_upload_button", "upload"),
).toLowerCase();
const CHATGPT_PROJECT_DELETE_BUTTON_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_delete_button", "delete project"),
).toLowerCase();
const CHATGPT_NEW_PROJECT_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "new_project", "new project"),
).toLowerCase();
const CHATGPT_PROJECTS_LABEL = "projects";
const CHATGPT_OPEN_SIDEBAR_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "open_sidebar", "open sidebar"),
).toLowerCase();
const CHATGPT_SIDEBAR_READINESS_DESCRIPTION = "ChatGPT sidebar readiness";
const CHATGPT_CONVERSATION_PROMPT_INPUT_LABEL = resolveBundledServiceUiLabel(
	"chatgpt",
	"conversation_prompt_input",
	"Chat with ChatGPT",
);
const CHATGPT_CONVERSATION_PROMPT_INPUT_SELECTOR = `textarea[aria-label=${JSON.stringify(CHATGPT_CONVERSATION_PROMPT_INPUT_LABEL)}]`;
const CHATGPT_CONVERSATION_RICH_PROMPT_INPUT_SELECTOR = CHATGPT_RICH_PROMPT_INPUT_SELECTOR;
const CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"conversation_turn_section",
	'[data-content-search-unit-key], section[data-testid^="conversation-turn-"]',
);
const CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"message_author_role",
	'[data-message-author-role], [data-content-search-unit-key$=":user"], [data-content-search-unit-key$=":assistant"], [data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]',
);
const CHATGPT_USER_MESSAGE_AUTHOR_ROLE_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"user_message_author_role",
	'[data-message-author-role="user"], [data-content-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":user"]',
);
const CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"assistant_artifact_button",
	'button.behavior-btn, button[aria-label^="Open preview of "], [aria-label^="Download "]:not([aria-label="Download file"])',
);
const CHATGPT_TEXTDOC_MESSAGE_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"textdoc_message",
	'div[id^="textdoc-message-"]',
);
const CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"conversation_options_button",
	'button[data-testid="conversation-options-button"]',
);
const CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
	"chatgpt",
	"delete_conversation_confirm_button",
	'button[data-testid="delete-conversation-confirm-button"]',
);
const CHATGPT_CONVERSATION_OPTIONS_PREFIX = normalizeUiText(
	resolveBundledServiceUiLabel(
		"chatgpt",
		"conversation_options_prefix",
		"open conversation options for",
	),
).toLowerCase();
const CHATGPT_CONVERSATION_ACTION_RENAME_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "conversation_action_rename", "rename"),
).toLowerCase();
const CHATGPT_CONVERSATION_ACTION_DELETE_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "conversation_action_delete", "delete"),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_source_action_remove", "remove"),
).toLowerCase();
const _CHATGPT_DIALOG_CANCEL_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "dialog_cancel", "cancel"),
).toLowerCase();
const CHATGPT_CONVERSATION_DELETE_DIALOG_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "conversation_delete_dialog", "delete chat?"),
).toLowerCase();
const CHATGPT_PROJECT_DELETE_DIALOG_LABEL = normalizeUiText(
	resolveBundledServiceUiLabel("chatgpt", "project_delete_dialog", "delete project?"),
).toLowerCase();
const CHATGPT_DIALOG_DISMISS_LABELS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"dialog_dismiss_buttons",
	["ok", "okay", "got it", "dismiss", "close", "cancel", "done"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"delete_confirmation_buttons",
	["delete", "cancel"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const _CHATGPT_PROJECT_SOURCE_ADD_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"project_source_add_buttons",
	["add sources", "add"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"project_settings_commit_buttons",
	["save", "save changes", "done", "apply"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"project_source_upload_actions",
	["upload", "browse", "upload file"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS = resolveBundledServiceUiLabelSet(
	"chatgpt",
	"project_source_upload_markers",
	["add sources", "drag sources here"],
)
	.map((label) => normalizeUiText(label).toLowerCase())
	.filter(Boolean);
const CHATGPT_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts("chatgpt");
const CHATGPT_CDP_LIST_TIMEOUT_MS = 5_000;
const CHATGPT_LIBRARY_INVENTORY_OPERATION_TIMEOUT_MS = 30_000;
const CHATGPT_LIBRARY_CONNECT_STAGE_TIMEOUT_MS = 15_000;
const CHATGPT_LIBRARY_STAGE_TIMEOUT_MS = 10_000;
const CHATGPT_LIBRARY_DIALOG_STAGE_TIMEOUT_MS = 5_000;
const CHATGPT_CDP_CLOSE_TIMEOUT_MS = 3_000;
const CHATGPT_PROJECT_URL_TEMPLATE = requireBundledServiceRouteTemplate("chatgpt", "project");
const CHATGPT_PROJECT_SOURCES_URL_TEMPLATE = requireBundledServiceRouteTemplate(
	"chatgpt",
	"projectSources",
);
const CHATGPT_CONVERSATION_URL_TEMPLATE = requireBundledServiceRouteTemplate(
	"chatgpt",
	"conversation",
);
const CHATGPT_PROJECT_CONVERSATION_URL_TEMPLATE = requireBundledServiceRouteTemplate(
	"chatgpt",
	"projectConversation",
);
const CHATGPT_CONVERSATION_API_URL_TEMPLATE = requireBundledServiceRouteTemplate(
	"chatgpt",
	"conversationApi",
);
const CHATGPT_FEATURE_DETECTOR = resolveBundledServiceFeatureDetector(
	"chatgpt",
	"chatgpt-feature-probe-v1",
);
const CHATGPT_FEATURE_FLAG_TOKENS = resolveBundledServiceFeatureFlagTokens("chatgpt", {
	web_search: ["search the web", "web search"],
	deep_research: ["deep research"],
	company_knowledge: ["company knowledge"],
	shopping: ["shopping"],
});
const CHATGPT_COMPOSER_MENU_ROOT_SELECTOR = ".composer-home-top-menu, .popover";
const CHATGPT_COMPOSER_MENU_ITEM_SELECTOR = "button, .__menu-item, [data-fill][tabindex]";
const CHATGPT_INLINE_SELECTION_PILL_SELECTOR = "[data-inline-selection-pill]";
const CHATGPT_ARTIFACT_KIND_EXTENSIONS = resolveBundledServiceArtifactKindExtensions("chatgpt", {
	spreadsheet: ["csv", "tsv", "xls", "xlsx", "ods"],
});
const CHATGPT_ARTIFACT_CONTENT_TYPE_EXTENSIONS = resolveBundledServiceArtifactContentTypeExtensions(
	"chatgpt",
	{
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/webp": ".webp",
		"image/gif": ".gif",
		"application/zip": ".zip",
		"application/json": ".json",
		"application/pdf": ".pdf",
		"text/markdown": ".md",
		"text/csv": ".csv",
		"text/tab-separated-values": ".tsv",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
		"application/vnd.ms-excel": ".xls",
		"text/plain": ".txt",
	},
);
const CHATGPT_ARTIFACT_NAME_MIME_TYPES = resolveBundledServiceArtifactNameMimeTypes("chatgpt", {
	".zip": "application/zip",
	".json": "application/json",
	".pdf": "application/pdf",
	".md": "text/markdown",
	".txt": "text/plain",
	".csv": "text/csv",
	".tsv": "text/tab-separated-values",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xls": "application/vnd.ms-excel",
});
const CHATGPT_ARTIFACT_DEFAULT_IMAGE_TITLE = resolveBundledServiceArtifactDefaultTitle(
	"chatgpt",
	"image",
	"Generated image",
);
const CHATGPT_ARTIFACT_DEFAULT_SPREADSHEET_TITLE = resolveBundledServiceArtifactDefaultTitle(
	"chatgpt",
	"spreadsheet",
	"Spreadsheet artifact",
);
const CHATGPT_ARTIFACT_DEFAULT_CANVAS_TITLE = resolveBundledServiceArtifactDefaultTitle(
	"chatgpt",
	"canvas",
	"Canvas artifact",
);
const CHATGPT_ARTIFACT_IMAGE_CONTENT_TYPES = new Set(
	resolveBundledServiceArtifactPayloadMarkerSet("chatgpt", "image_content_types", [
		"image_asset_pointer",
	]).map((value) => value.trim().toLowerCase()),
);
const CHATGPT_ARTIFACT_SPREADSHEET_VISUALIZATION_TYPES = new Set(
	resolveBundledServiceArtifactPayloadMarkerSet("chatgpt", "spreadsheet_visualization_types", [
		"table",
	]).map((value) => value.trim().toLowerCase()),
);
const CHATGPT_PROJECT_SOURCES_INPUT_ATTR = "data-auracall-chatgpt-project-source-input";
const CHATGPT_PROJECT_SETTINGS_DIALOG_ATTR = "data-auracall-chatgpt-project-settings-dialog";
const CHATGPT_PROJECT_SOURCE_ACTION_ATTR = "data-auracall-chatgpt-project-source-action";
const CHATGPT_CONVERSATION_ROW_ATTR = "data-auracall-chatgpt-conversation-row";
const CHATGPT_CONVERSATION_ACTION_ATTR = "data-auracall-chatgpt-conversation-action";
const CHATGPT_DOWNLOAD_BUTTON_ATTR = "data-auracall-chatgpt-download-button";
const CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY = "__auracallChatgptDownloadCapture";
const CHATGPT_ARTIFACT_CAPTURED_FETCH_TIMEOUT_MS = 20_000;
const CHATGPT_ARTIFACT_BROWSER_DOWNLOAD_TIMEOUT_MS = 30_000;
const CHATGPT_VISIBLE_FILES_READ_TIMEOUT_MS = 10_000;
const CHATGPT_VISIBLE_DOWNLOAD_ARTIFACT_PROBES_TIMEOUT_MS = 10_000;
const CHATGPT_CONVERSATION_PAYLOAD_FETCH_TIMEOUT_MS = 9_000;
const CHATGPT_CONVERSATION_PAYLOAD_EVALUATE_TIMEOUT_MS = 10_000;
const CHATGPT_CONVERSATION_PAYLOAD_RESPONSE_BODY_TIMEOUT_MS = 9_000;
const CHATGPT_CONVERSATION_PAYLOAD_FALLBACK_TIMEOUT_MS = 10_000;
const CHATGPT_POST_PAYLOAD_ROUTE_READ_TIMEOUT_MS = 2_000;
const CHATGPT_CONVERSATION_MESSAGES_PAGE_SIZE = 8;
const CHATGPT_CONVERSATION_MESSAGES_PAGE_TIMEOUT_MS = 10_000;
const CHATGPT_CONVERSATION_MESSAGES_MAX_PAGES = 256;
const CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS = 15_000;
const CHATGPT_HOME_LOCATION = new URL(CHATGPT_HOME_URL);

type ChatgptProjectLinkProbe = {
	id: string;
	name: string;
	url?: string | null;
};

type ChatgptConversationLinkProbe = {
	id: string;
	title?: string | null;
	url?: string | null;
	projectId?: string | null;
	updatedAt?: string | null;
	metadata?: Record<string, unknown> | null;
};

type ChatgptAuthSessionProbe = {
	user?: {
		id?: string | null;
		name?: string | null;
		email?: string | null;
	} | null;
	account?: {
		id?: string | null;
		name?: string | null;
		email?: string | null;
		planType?: string | null;
		structure?: string | null;
		organizationId?: string | null;
		isDelinquent?: boolean | null;
	} | null;
};

type ChatgptProjectSourceProbe = {
	rowText?: string | null;
	leafTexts?: string[] | null;
	metadataText?: string | null;
	hrefs?: string[] | null;
	testIds?: string[] | null;
	ariaLabels?: string[] | null;
	providerFileId?: string | null;
	mimeType?: string | null;
	size?: number | null;
};

type ChatgptConversationFileProbe = {
	turnId?: string | null;
	messageId?: string | null;
	tileIndex?: number | null;
	name?: string | null;
	label?: string | null;
	providerFileId?: string | null;
	mimeType?: string | null;
	downloadable?: string | null;
	previewable?: string | null;
};

type ChatgptConversationDownloadButtonProbe = {
	turnId?: string | null;
	messageId?: string | null;
	messageIndex?: number | null;
	buttonIndex?: number | null;
	title?: string | null;
};

type ChatgptLibraryItemProbe = {
	title?: string | null;
	href?: string | null;
	src?: string | null;
	kind?: string | null;
	subtitle?: string | null;
	text?: string | null;
	testId?: string | null;
	ariaLabel?: string | null;
	providerFileId?: string | null;
	libraryFileId?: string | null;
};

type ChatgptLibraryRouteKind =
	| "library_file_detail"
	| "library_artifact_detail"
	| "library_canvas_detail"
	| "conversation_detail"
	| "external_or_inline_asset"
	| "unknown";

type ChatgptConversationRowTagCandidateProbe = {
	inProjectPanel?: boolean | null;
	hasConversationAnchor?: boolean | null;
	buttonCount?: number | null;
	score?: number | null;
	rowText?: string | null;
	buttonLabel?: string | null;
	hasProjectIdMatch?: boolean | null;
};

type ChatgptConversationRowTagDiagnostics = {
	attempts?: number | null;
	expectedConversationId?: string | null;
	expectedProjectId?: string | null;
	totalConversationAnchors?: number | null;
	visibleConversationAnchors?: number | null;
	candidateCount?: number | null;
	scopedCandidateCount?: number | null;
	fallbackUsed?: boolean | null;
	reason?: string | null;
	bestCandidate?: ChatgptConversationRowTagCandidateProbe | null;
};

type ChatgptConversationRowTagEvaluation = {
	ok?: boolean;
	rowSelector?: string;
	actionSelector?: string;
	reason?: string;
	diagnostics?: ChatgptConversationRowTagDiagnostics | null;
};

type ChatgptConversationRowTagAttemptFailure = {
	attemptLabel: string;
	error?: string;
	diagnostics?: ChatgptConversationRowTagDiagnostics | null;
};

type ChatgptBlockingSurfaceKind =
	| "rate-limit"
	| "connection-failed"
	| "transient-error"
	| "retry-affordance";

type ChatgptBlockingSurfaceProbe = {
	text?: string | null;
	ariaLabel?: string | null;
	buttonLabels?: string[] | null;
	role?: string | null;
};

type ChatgptBlockingSurfaceMatch = {
	kind: ChatgptBlockingSurfaceKind;
	summary: string;
	selector?: string | null;
	details?: Record<string, unknown> | null;
};

function isChatgptAccountMirrorHardStop(
	match: ChatgptBlockingSurfaceMatch | null | undefined,
	options?: BrowserProviderListOptions,
): boolean {
	return options?.accountMirrorInventory === true && match?.kind === "rate-limit";
}

export const isChatgptAccountMirrorHardStopForTest = isChatgptAccountMirrorHardStop;

function createChatgptBlockingSurfaceError(
	action: string,
	match: ChatgptBlockingSurfaceMatch,
): Error & { blockingSurface: ChatgptBlockingSurfaceMatch } {
	const error = new Error(`${action}: ${match.summary}`) as Error & {
		blockingSurface: ChatgptBlockingSurfaceMatch;
	};
	error.blockingSurface = match;
	return error;
}

async function assertNoChatgptAccountMirrorHardStop(
	client: ChromeClient,
	options: BrowserProviderListOptions | undefined,
	action: string,
): Promise<void> {
	if (options?.accountMirrorInventory !== true) return;
	const match = await readVisibleChatgptBlockingSurfaceMatchWithClient(client);
	if (match && isChatgptAccountMirrorHardStop(match, options)) {
		throw createChatgptBlockingSurfaceError(action, match);
	}
}

type ChatgptRecoveryDebugContext = {
	enabled: boolean;
	context: string;
	metadata?: Record<string, unknown>;
};

type ChatgptRecoveryActionResult = {
	action:
		| "dismiss-overlay"
		| "close-dialog"
		| "reload-page"
		| "reopen-conversation"
		| "reopen-list";
	outcome: "attempted" | "failed" | "skipped";
	summary: string | null;
};

function summarizeChatgptConversationRowTagFailure(
	conversationId: string,
	failures: ReadonlyArray<ChatgptConversationRowTagAttemptFailure>,
): string {
	if (failures.length === 0) {
		return `ChatGPT conversation row not found for ${conversationId}`;
	}
	const lines = failures
		.map((entry, index) => {
			const diagnostics = entry.diagnostics
				? {
						totalConversationAnchors: entry.diagnostics.totalConversationAnchors ?? null,
						visibleConversationAnchors: entry.diagnostics.visibleConversationAnchors ?? null,
						candidateCount: entry.diagnostics.candidateCount ?? null,
						scopedCandidateCount: entry.diagnostics.scopedCandidateCount ?? null,
						bestCandidate: entry.diagnostics.bestCandidate ?? null,
						fallbackUsed: entry.diagnostics.fallbackUsed ?? null,
						reason: entry.diagnostics.reason ?? null,
					}
				: null;
			return `${index + 1}/${failures.length} ${entry.attemptLabel}: ${entry.error || "failed"}${
				diagnostics ? ` (${JSON.stringify(diagnostics)})` : ""
			}`;
		})
		.join(" | ");
	return `ChatGPT conversation row not found for ${conversationId}: ${lines}`;
}

function summarizeChatgptBlockingSurfaceText(value: string): string {
	const normalized = normalizeUiText(value);
	if (!normalized) {
		return "Unknown ChatGPT blocking surface";
	}
	const sentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
	return sentence.slice(0, 160);
}

export function classifyChatgptBlockingSurfaceProbe(
	probe: ChatgptBlockingSurfaceProbe | null | undefined,
): Pick<ChatgptBlockingSurfaceMatch, "kind" | "summary"> | null {
	if (!probe || typeof probe !== "object") {
		return null;
	}
	const text = normalizeUiText(probe.text);
	const ariaLabel = normalizeUiText(probe.ariaLabel);
	const buttonLabels = (probe.buttonLabels ?? [])
		.map((value) => normalizeFileKey(value))
		.filter(Boolean);
	const combined = [text, ariaLabel, ...buttonLabels].filter(Boolean).join(" ").trim();
	if (!combined) {
		return null;
	}
	if (isChatgptRateLimitMessage(combined)) {
		return {
			kind: "rate-limit",
			summary:
				extractChatgptRateLimitSummary(combined) ?? summarizeChatgptBlockingSurfaceText(combined),
		};
	}
	const retryAffordance = buttonLabels.find((label) =>
		/^(retry|try again|regenerate|regenerate response|continue generating)$/.test(label),
	);
	// Regenerate and Continue generating are also ordinary successful-turn
	// controls. They require independent failure text before recovery may spend
	// another navigation; Retry/Try again remain explicit failure actions.
	const hasFailureText =
		/server connection failed|connection failed|connection lost|network error|failed to connect|unable to connect|something went wrong|an error occurred|message could not be generated|please try again|failed to /i.test(
			[text, ariaLabel].filter(Boolean).join(" "),
		);
	if (retryAffordance && (/^(retry|try again)$/.test(retryAffordance) || hasFailureText)) {
		return {
			kind: "retry-affordance",
			summary: retryAffordance,
		};
	}
	if (
		/server connection failed|connection failed|connection lost|network error|failed to connect|unable to connect/i.test(
			combined,
		)
	) {
		return {
			kind: "connection-failed",
			summary: summarizeChatgptBlockingSurfaceText(combined),
		};
	}
	if (
		/something went wrong|an error occurred|message could not be generated|please try again|failed to /i.test(
			combined,
		)
	) {
		return {
			kind: "transient-error",
			summary: summarizeChatgptBlockingSurfaceText(combined),
		};
	}
	return null;
}

export function isRetryableChatgptTransientMessage(message: string | null | undefined): boolean {
	const match = classifyChatgptBlockingSurfaceProbe({ text: message ?? "" });
	return Boolean(match);
}

function readChatgptConversationRowTagDiagnostics(
	error: unknown,
): ChatgptConversationRowTagDiagnostics | null {
	if (!error || typeof error !== "object") {
		return null;
	}
	const maybe = error as {
		diagnostics?: ChatgptConversationRowTagDiagnostics | null;
		cause?: unknown;
	};
	if (maybe.diagnostics && typeof maybe.diagnostics === "object") {
		return maybe.diagnostics;
	}
	const cause = maybe.cause as
		| { diagnostics?: ChatgptConversationRowTagDiagnostics | null; ok?: boolean }
		| undefined;
	if (cause?.diagnostics && typeof cause.diagnostics === "object") {
		return cause.diagnostics;
	}
	return null;
}

type ChatgptConversationCanvasProbe = {
	textdocId?: string | null;
	title?: string | null;
	contentText?: string | null;
};

type ChatgptImageArtifactProbe = {
	src?: string | null;
	alt?: string | null;
};

type ChatgptVisibleImageArtifactProbe = ChatgptImageArtifactProbe & {
	turnId?: string | null;
	messageId?: string | null;
	messageIndex?: number | null;
	imageIndex?: number | null;
	wrapperId?: string | null;
	title?: string | null;
};

type ChatgptDeleteConfirmationProbe = {
	dialogText?: string | null;
	buttonLabels?: string[] | null;
	hasVisibleConfirmButton?: boolean | null;
};

type ChatgptProjectDeleteConfirmationProbe = {
	dialogText?: string | null;
	buttonLabels?: string[] | null;
};

type ChatgptConversationTitleProbe = {
	matchedConversationId?: string | null;
	matchedProjectId?: string | null;
	matchedTitle?: string | null;
	routeConversationId?: string | null;
	routeProjectId?: string | null;
	documentTitle?: string | null;
	topConversationId?: string | null;
	topTitle?: string | null;
};

type ChatgptRenameEditorProbe = {
	inputName?: string | null;
	value?: string | null;
	active?: boolean | null;
};

type ChatgptConversationPayloadResponse = {
	ok?: boolean | null;
	status?: number | null;
	body?: string | null;
	error?: string | null;
};

const CHATGPT_CONVERSATION_UNAVAILABLE_ERROR_CODE = "chatgpt_conversation_not_found_or_unavailable";

function createChatgptConversationUnavailableError(
	conversationId: string,
	status: number,
): Error & { code: typeof CHATGPT_CONVERSATION_UNAVAILABLE_ERROR_CODE } {
	const metadata = { code: CHATGPT_CONVERSATION_UNAVAILABLE_ERROR_CODE } as const;
	return Object.assign(
		new Error(
			`conversation-not-found-or-unavailable: ChatGPT conversation ${conversationId} exact fallback response returned status ${status}.`,
		),
		metadata,
	);
}

function isChatgptConversationUnavailableError(error: unknown): boolean {
	return isRecord(error) && error.code === CHATGPT_CONVERSATION_UNAVAILABLE_ERROR_CODE;
}

type ChatgptProjectSettingsSnapshot = {
	name: string;
	text: string;
	memoryModeLabel?: string | null;
};

type ChatgptConversationPayload = {
	mapping?: Record<string, ChatgptConversationPayloadNode | null> | null;
};

type ChatgptConversationPayloadShape = "mapping" | "non_mapping" | "missing";
type ChatgptPostPayloadRouteClass =
	| "expected_conversation"
	| "home"
	| "other_chatgpt"
	| "non_chatgpt"
	| "unknown";

function classifyChatgptConversationPayloadShape(
	payload: unknown,
): ChatgptConversationPayloadShape {
	if (!isRecord(payload)) return "missing";
	return isRecord(payload.mapping) ? "mapping" : "non_mapping";
}

export const classifyChatgptConversationPayloadShapeForTest =
	classifyChatgptConversationPayloadShape;

function classifyChatgptPostPayloadRoute(
	value: string | null | undefined,
	conversationId: string,
	projectId?: string | null,
): ChatgptPostPayloadRouteClass {
	if (typeof value !== "string" || !value.trim()) return "unknown";
	try {
		const parsed = new URL(value);
		if (!CHATGPT_COMPATIBLE_HOSTS.includes(parsed.hostname)) return "non_chatgpt";
		const routeConversationId = extractChatgptConversationIdFromUrl(value);
		const expectedProjectId = normalizeChatgptProjectId(projectId ?? undefined);
		const routeProjectId = extractChatgptProjectIdFromUrl(value);
		if (
			routeConversationId === conversationId &&
			(!expectedProjectId || routeProjectId === expectedProjectId)
		) {
			return "expected_conversation";
		}
		if (parsed.pathname === "/" || parsed.pathname === "") return "home";
		return "other_chatgpt";
	} catch {
		return "unknown";
	}
}

export const classifyChatgptPostPayloadRouteForTest = classifyChatgptPostPayloadRoute;

function buildChatgptPostPayloadReadinessFailureStage(
	payload: unknown,
	currentUrl: string | null | undefined,
	conversationId: string,
	projectId?: string | null,
): string {
	const payloadShape = classifyChatgptConversationPayloadShape(payload);
	const routeClass = classifyChatgptPostPayloadRoute(currentUrl, conversationId, projectId);
	return `chatgpt.postPayloadReadiness.failed.predicate_unsatisfied.payload_${payloadShape}.route_${routeClass}.v1`;
}

export const buildChatgptPostPayloadReadinessFailureStageForTest =
	buildChatgptPostPayloadReadinessFailureStage;

type ChatgptConversationPayloadNode = {
	id?: string | null;
	message?: ChatgptConversationPayloadMessage | null;
};

type ChatgptConversationPayloadMessage = {
	id?: string | null;
	author?: {
		role?: string | null;
	} | null;
	content?: {
		content_type?: string | null;
		parts?: unknown[] | null;
		text?: string | null;
	} | null;
	metadata?: Record<string, unknown> | null;
};

type ChatgptConversationMessageProbe = {
	role: "user" | "assistant" | "system";
	text: string;
	messageId?: string;
};

type ChatgptFeatureProbe = {
	detector?: string | null;
	web_search?: boolean | null;
	deep_research?: boolean | null;
	company_knowledge?: boolean | null;
	shopping?: boolean | null;
	composer_tools?: string[] | null;
	apps?: string[] | null;
	composer_mode?: "chat" | "work" | null;
	composer_apps?: ChatgptComposerAppProbe[] | null;
	installed_apps?: ChatgptInstalledAppProbe[] | null;
	linked_apps?: ChatgptLinkedAppProbe[] | null;
	model_controls?: {
		visible?: boolean | null;
		label?: string | null;
		aria_label?: string | null;
		location?: string | null;
		selector?: string | null;
		model_options?: string[] | null;
		depth_options?: string[] | null;
		synthesized_options?: string[] | null;
		selected_model?: string | null;
		selected_depth?: string | null;
	} | null;
};

type ChatgptComposerAppProbe = {
	name?: string | null;
	app_id?: string | null;
	plugin_id?: string | null;
	selection_state?: "selected" | "selectable" | "connect_required" | "unknown" | null;
};

export type ChatgptInstalledAppProbe = {
	plugin_id?: string | null;
	canonical_app_id?: string | null;
	provider_name?: string | null;
	name?: string | null;
	app_ids?: string[] | null;
	status?: string | null;
	enabled?: boolean | null;
	installation_policy?: string | null;
	authentication_policy?: string | null;
	scope?: string | null;
	discoverability?: string | null;
	creator_name?: string | null;
	release_version?: string | null;
	description?: string | null;
};

export type ChatgptLinkedAppProbe = {
	link_id?: string | null;
	connector_id?: string | null;
	name?: string | null;
	auth_status?: string | null;
	connector_status?: string | null;
	visibility?: string | null;
	disable_auto_invocation?: boolean | null;
	actions_count?: number | null;
};

export function normalizeChatgptProjectId(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const match = trimmed.match(
		/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i,
	);
	return match?.[1] ?? null;
}

export function normalizeChatgptConversationId(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const extracted = extractChatgptConversationIdFromUrl(trimmed);
	if (extracted) {
		return extracted;
	}
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
		? trimmed
		: null;
}

type ChromeClientWithFocusPolicy = ChromeClient & { __auracallSuppressFocus?: boolean };

function setClientSuppressFocus(client: ChromeClient, suppressFocus: boolean | undefined): void {
	(client as ChromeClientWithFocusPolicy).__auracallSuppressFocus = Boolean(suppressFocus);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function interpolateChatgptRoute(template: string, params: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => params[key] ?? "");
}

export function resolveChatgptProjectUrl(projectId: string): string {
	return interpolateChatgptRoute(CHATGPT_PROJECT_URL_TEMPLATE, { projectId });
}

export function resolveChatgptProjectSourcesUrl(projectId: string): string {
	return interpolateChatgptRoute(CHATGPT_PROJECT_SOURCES_URL_TEMPLATE, { projectId });
}

function resolveChatgptConversationApiUrl(conversationId: string): string {
	return interpolateChatgptRoute(CHATGPT_CONVERSATION_API_URL_TEMPLATE, { conversationId });
}

async function readVisibleChatgptBlockingSurfaceMatchWithClient(
	client: ChromeClient,
): Promise<ChatgptBlockingSurfaceMatch | null> {
	const overlays = await collectVisibleOverlayInventory(client.Runtime, {
		overlaySelectors: [...Array.from(DEFAULT_DIALOG_SELECTORS), '[role="alert"]', "[aria-live]"],
		limit: 8,
	});
	for (const overlay of overlays) {
		const match = classifyChatgptBlockingSurfaceProbe({
			text: overlay.text,
			ariaLabel: overlay.ariaLabel,
			buttonLabels: overlay.buttonLabels,
			role: overlay.role,
		});
		if (!match) continue;
		return {
			...match,
			selector: overlay.selector,
			details: {
				sourceSelector: overlay.sourceSelector,
				role: overlay.role,
				ariaLabel: overlay.ariaLabel,
			},
		};
	}
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const labels = ['retry', 'try again', 'regenerate', 'regenerate response', 'continue generating'];
      for (const node of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const label = normalize(node.getAttribute('aria-label') || node.textContent || '');
        if (!labels.includes(label)) continue;
        const scope =
          node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}) ||
          node.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
        if (!scope) continue;
        return {
          label,
          text: normalize(scope?.textContent || node.textContent || ''),
        };
      }
      return null;
    })()`,
		returnByValue: true,
	});
	const retryProbe = result?.value as
		| { label?: string | null; text?: string | null }
		| null
		| undefined;
	const retryMatch = classifyChatgptBlockingSurfaceProbe({
		text: retryProbe?.text ?? null,
		buttonLabels: retryProbe?.label ? [retryProbe.label] : [],
	});
	if (retryMatch) {
		return {
			...retryMatch,
			selector: null,
			details: {
				sourceSelector: "button",
				buttonLabel: retryProbe?.label ?? null,
			},
		};
	}
	return null;
}

async function recoverVisibleChatgptBlockingSurfaceWithClient(
	client: ChromeClient,
	match?: ChatgptBlockingSurfaceMatch | null,
	options?: BrowserProviderListOptions,
): Promise<ChatgptRecoveryActionResult | null> {
	const resolved = match ?? (await readVisibleChatgptBlockingSurfaceMatchWithClient(client));
	if (!resolved) {
		return null;
	}
	if (resolved.kind !== "rate-limit") {
		if (
			!providerNavigationAllowed(options) ||
			options?.accountMirrorSingleConversationVisit === true
		) {
			return {
				action: "reload-page",
				outcome: "skipped",
				summary: `${resolved.summary}:navigation-forbidden`,
			};
		}
		try {
			recordBrowserScrapeCdpCall(options, "Page.reload");
			recordBrowserScrapeProviderAction(options, "chatgpt.reloadBlockingSurface");
			await reloadAndSettle(client, {
				ignoreCache: true,
				waitForDocumentReady: false,
				fallbackToLocationReload: true,
				interactionGovernor: options?.interactionGovernor,
				interactionClass: "provider-recovery",
				mutationAudit: resolveMutationAudit(client),
				mutationSource: resolveMutationSource(
					client,
					"provider:chatgpt",
					"recover-blocking-surface-reload",
				),
			});
			return {
				action: "reload-page",
				outcome: "attempted",
				summary: resolved.summary,
			};
		} catch {
			return {
				action: "reload-page",
				outcome: "failed",
				summary: resolved.summary,
			};
		}
	}
	if (resolved.selector) {
		try {
			await dismissOverlayRoot(client.Runtime, resolved.selector, {
				closeButtonMatch: {
					includeAny: [...CHATGPT_DIALOG_DISMISS_LABELS],
				},
				timeoutMs: 3_000,
			}).catch(() => undefined);
			return {
				action: "dismiss-overlay",
				outcome: "attempted",
				summary: resolved.summary,
			};
		} catch {
			return {
				action: "dismiss-overlay",
				outcome: "failed",
				summary: resolved.summary,
			};
		}
	} else {
		try {
			await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS).catch(() => undefined);
			return {
				action: "close-dialog",
				outcome: "attempted",
				summary: resolved.summary,
			};
		} catch {
			return {
				action: "close-dialog",
				outcome: "failed",
				summary: resolved.summary,
			};
		}
	}
}

export async function recoverVisibleChatgptBlockingSurfaceWithClientForTest(
	client: ChromeClient,
	match: ChatgptBlockingSurfaceMatch,
	options?: BrowserProviderListOptions,
): Promise<ChatgptRecoveryActionResult | null> {
	return recoverVisibleChatgptBlockingSurfaceWithClient(client, match, options);
}

async function withChatgptBlockingSurfaceRecovery<T>(
	client: ChromeClient,
	action: string,
	fn: () => Promise<T>,
	options?: {
		pauseMs?: number;
		retries?: number;
		debugContext?: ChatgptRecoveryDebugContext;
		reopen?: () => Promise<ChatgptRecoveryActionResult | null>;
		providerOptions?: BrowserProviderListOptions;
	},
): Promise<T> {
	const debugContext = options?.debugContext;
	let lastRecoveryActions: ChatgptRecoveryActionResult[] = [];
	const persistDebugRecord = async (
		phase: "pre" | "post" | "error" | "final-error",
		match: ChatgptBlockingSurfaceMatch | null,
		extra?: Record<string, unknown>,
	): Promise<void> => {
		if (!debugContext?.enabled) {
			return;
		}
		const snapshot = await captureBrowserPostmortemSnapshot(client.Runtime).catch(() => null);
		await persistBrowserPostmortemRecord({
			context: `${debugContext.context}-${phase}`,
			payload: {
				provider: "chatgpt",
				action,
				phase,
				match: match
					? {
							kind: match.kind,
							summary: match.summary,
							selector: match.selector ?? null,
							details: match.details ?? null,
						}
					: null,
				recovery: lastRecoveryActions.map((entry) => ({
					action: entry.action,
					outcome: entry.outcome,
					summary: entry.summary,
				})),
				snapshot,
				...(debugContext.metadata ?? {}),
				...(extra ?? {}),
			},
		}).catch(() => undefined);
	};
	const runRecoverySequence = async (match: ChatgptBlockingSurfaceMatch): Promise<void> => {
		lastRecoveryActions = [];
		if (
			isChatgptAccountMirrorHardStop(match, options?.providerOptions) ||
			options?.providerOptions?.accountMirrorSingleConversationVisit === true
		) {
			throw createChatgptBlockingSurfaceError(action, match);
		}
		await beforeChatgptBrowserInteraction(options?.providerOptions, "provider-recovery");
		const primary = await recoverVisibleChatgptBlockingSurfaceWithClient(
			client,
			match,
			options?.providerOptions,
		);
		if (primary) {
			lastRecoveryActions.push(primary);
		}
		if (options?.reopen) {
			const reopen = await options.reopen().catch(() => ({
				action: (match.kind === "rate-limit"
					? "reopen-list"
					: "reopen-conversation") as ChatgptRecoveryActionResult["action"],
				outcome: "failed" as const,
				summary: match.summary,
			}));
			if (reopen) {
				lastRecoveryActions.push(reopen);
			}
		}
	};
	try {
		return await withBlockingSurfaceRecovery(fn, {
			label: action,
			pauseMs: options?.pauseMs ?? CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS,
			retries: options?.retries ?? 1,
			inspect: () => readVisibleChatgptBlockingSurfaceMatchWithClient(client),
			dismiss: async (match) => runRecoverySequence(match),
			classifyError: (error) => {
				const directMessage = error instanceof Error ? error.message : String(error);
				const match = classifyChatgptBlockingSurfaceProbe({ text: directMessage });
				return match ? { ...match, selector: null } : null;
			},
			onRecover: ({ match, phase, attempt }) => persistDebugRecord(phase, match, { attempt }),
		});
	} catch (error) {
		const blockingSurface =
			error && typeof error === "object" && "blockingSurface" in error
				? ((error as { blockingSurface?: ChatgptBlockingSurfaceMatch | null }).blockingSurface ??
					null)
				: null;
		await persistDebugRecord("final-error", blockingSurface, {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

function resolveChatgptRecoveryDebugContext(
	options: BrowserProviderListOptions | undefined,
	context: string,
	metadata?: Record<string, unknown>,
): ChatgptRecoveryDebugContext | undefined {
	const enabled =
		options?.browserService?.getConfig().debug === true ||
		process.env.CHATGPT_DEVTOOLS_TRACE === "1";
	if (!enabled) {
		return undefined;
	}
	return {
		enabled: true,
		context,
		metadata,
	};
}

function buildChatgptConversationReopen(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
	options?: BrowserProviderListOptions,
): () => Promise<ChatgptRecoveryActionResult> {
	return async () => {
		if (
			!providerNavigationAllowed(options) ||
			options?.accountMirrorSingleConversationVisit === true
		) {
			return {
				action: "reopen-conversation",
				outcome: "skipped",
				summary: `${conversationId}:navigation-forbidden`,
			};
		}
		try {
			recordBrowserScrapeProviderAction(options, "chatgpt.reopenConversation");
			await navigateToChatgptConversation(client, conversationId, projectId, options);
			return {
				action: "reopen-conversation",
				outcome: "attempted",
				summary: conversationId,
			};
		} catch {
			return {
				action: "reopen-conversation",
				outcome: "failed",
				summary: conversationId,
			};
		}
	};
}

function buildChatgptListReopen(
	client: ChromeClient,
	projectId?: string | null,
): () => Promise<ChatgptRecoveryActionResult> {
	return async () => {
		try {
			await navigateToChatgptUrl(
				client,
				resolveChatgptConversationListUrl(projectId),
				normalizeChatgptProjectId(projectId) ?? undefined,
			);
			return {
				action: "reopen-list",
				outcome: "attempted",
				summary: normalizeChatgptProjectId(projectId) ?? "root",
			};
		} catch {
			return {
				action: "reopen-list",
				outcome: "failed",
				summary: normalizeChatgptProjectId(projectId) ?? "root",
			};
		}
	};
}

function resolvePortFromEnv(): number | null {
	const raw = process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT;
	if (!raw) return null;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
}

async function beforeChatgptBrowserInteraction(
	options: BrowserProviderListOptions | undefined,
	kind: BrowserInteractionClass,
): Promise<void> {
	if (options?.providerTrafficGovernor) {
		// The physical browser seam owns admission for governed traffic. Calling
		// the legacy governor here would reserve and count the same action twice.
		return;
	}
	if (kind === "conversation-read" && options?.useProviderSession && options.providerSession) {
		recordBrowserScrapeProviderAction(options, "chatgpt.skipScopedInteractionGovernor");
		return;
	}
	if (options?.abortSignal) {
		await options.interactionGovernor?.beforeInteraction(kind, options.abortSignal);
		return;
	}
	await options?.interactionGovernor?.beforeInteraction(kind);
}

export const beforeChatgptBrowserInteractionForTest = beforeChatgptBrowserInteraction;

function resolveBrowserTabPolicy(
	options: Pick<BrowserProviderListOptions, "browserService"> | undefined,
): {
	serviceTabLimit?: number;
	blankTabLimit?: number;
	collapseDisposableWindows?: boolean;
	suppressFocus?: boolean;
} {
	const config = options?.browserService?.getConfig?.();
	return {
		serviceTabLimit: config?.serviceTabLimit ?? undefined,
		blankTabLimit: config?.blankTabLimit ?? undefined,
		collapseDisposableWindows: config?.collapseDisposableWindows,
		suppressFocus: config?.hideWindow ?? undefined,
	};
}

function resolveChatgptTargetId(
	target: { targetId?: string | null; id?: string | null } | string | null | undefined,
): string | undefined {
	if (!target) return undefined;
	if (typeof target === "string") return target;
	return target.targetId ?? target.id ?? undefined;
}

function isChatgptUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return CHATGPT_COMPATIBLE_HOSTS.includes(parsed.hostname);
	} catch {
		return false;
	}
}

function normalizeProjectName(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeUiText(value: string | null | undefined): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeFileKey(value: string | null | undefined): string {
	return normalizeUiText(value).toLowerCase();
}

function normalizeChatgptArtifactTitleMatchKey(value: string | null | undefined): string {
	return normalizeUiText(value).toLowerCase().replace(/\s+/g, "");
}

function chatgptArtifactTitleMatches(probeTitle: string, expectedTitle: string): boolean {
	if (!expectedTitle) return true;
	if (probeTitle === expectedTitle) return true;
	const probeKey = normalizeChatgptArtifactTitleMatchKey(probeTitle);
	const expectedKey = normalizeChatgptArtifactTitleMatchKey(expectedTitle);
	if (probeKey === expectedKey) return true;
	const expectedStem = expectedKey.replace(/\.[^.]+$/, "");
	return expectedStem.length > 3 && probeKey.startsWith(expectedStem);
}

function normalizeInstructionComparisonText(value: string | null | undefined): string {
	return String(value ?? "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.trimEnd();
}

function normalizeChatgptConversationTitle(value: string | null | undefined): string {
	return normalizeUiText(value).toLowerCase();
}

function normalizeChatgptDocumentTitle(value: string | null | undefined): string {
	return normalizeUiText(value)
		.replace(/^chatgpt\s*[-:|]\s*/i, "")
		.replace(/\s*[-:|]\s*chatgpt$/i, "")
		.trim()
		.toLowerCase();
}

function normalizeLibraryTitle(value: string | null | undefined): string {
	return decodeLibraryText(normalizeUiText(value))
		.replace(/\b(download|open|preview|copy link|share)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function decodeLibraryText(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function isChatgptLibraryChromeProbe(probe: ChatgptLibraryItemProbe, title: string): boolean {
	const normalizedTitle = normalizeUiText(title).toLowerCase();
	const testId = normalizeUiText(probe.testId).toLowerCase();
	const href = normalizeUiText(probe.href).toLowerCase();
	const ariaLabel = normalizeUiText(probe.ariaLabel).toLowerCase();
	if (!normalizedTitle) return true;
	if (["skip to content", "library", "images", "files", "allimagesfiles"].includes(normalizedTitle))
		return true;
	if (
		testId.includes("sidebar") ||
		testId.includes("profile") ||
		testId.includes("top-controls") ||
		testId.includes("filter") ||
		ariaLabel.includes("profile")
	) {
		return true;
	}
	if (href === "https://chatgpt.com/library" || href === "https://chatgpt.com/library#main") {
		return true;
	}
	return false;
}

function resolveChatgptLibraryIdentity(
	probe: ChatgptLibraryItemProbe,
	title: string,
): { uuid: string; identity: string; source: string } | null {
	const providerFileId = normalizeUiText(probe.providerFileId);
	if (providerFileId) {
		return {
			uuid: stableUuidFromText(`chatgpt-library-provider-file:${providerFileId}`),
			identity: providerFileId,
			source: "provider-file-id",
		};
	}
	const libraryFileId = normalizeUiText(probe.libraryFileId);
	if (libraryFileId) {
		return {
			uuid: stableUuidFromText(`chatgpt-library-file:${libraryFileId}`),
			identity: libraryFileId,
			source: "library-file-id",
		};
	}
	const candidates = [probe.href, probe.src, probe.testId, probe.ariaLabel, probe.text, title]
		.map((value) => normalizeUiText(value))
		.filter(Boolean);
	for (const candidate of candidates) {
		const uuid = extractUuid(candidate);
		if (uuid) {
			return { uuid, identity: candidate, source: "provider-uuid" };
		}
	}
	const identity = [
		normalizeUiText(probe.href),
		normalizeUiText(probe.src),
		normalizeUiText(probe.kind),
		normalizeUiText(probe.subtitle),
		title,
	]
		.filter(Boolean)
		.join("|")
		.toLowerCase();
	if (!identity) return null;
	return {
		uuid: stableUuidFromText(`chatgpt-library:${identity}`),
		identity,
		source: "stable-hash",
	};
}

function extractUuid(value: string | null | undefined): string | null {
	const match = normalizeUiText(value).match(
		/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
	);
	return match?.[0]?.toLowerCase() ?? null;
}

function stableUuidFromText(value: string): string {
	const hex = createHash("sha256").update(value).digest("hex");
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`5${hex.slice(13, 16)}`,
		`${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}`,
		hex.slice(20, 32),
	].join("-");
}

function inferChatgptLibraryArtifactKind(
	probe: ChatgptLibraryItemProbe,
	title: string,
	uri: string | undefined,
): ConversationArtifact["kind"] {
	const haystack = [
		probe.kind,
		probe.subtitle,
		probe.text,
		probe.testId,
		probe.ariaLabel,
		title,
		uri,
	]
		.map((value) => normalizeUiText(value))
		.join(" ")
		.toLowerCase();
	if (/\b(canvas|canmore|textdoc)\b/.test(haystack)) return "canvas";
	if (/\b(spreadsheet|xlsx|xls|csv|ods)\b/.test(haystack)) return "spreadsheet";
	if (/\b(image|png|jpe?g|webp|gif|avif)\b/.test(haystack)) return "image";
	if (/\b(download|file|pdf|docx?|pptx?|zip|sandbox)\b/.test(haystack)) return "download";
	return "document";
}

function classifyChatgptLibraryRouteKind(
	value: string | null | undefined,
): ChatgptLibraryRouteKind {
	const normalized = normalizeUiText(value);
	if (!normalized) return "unknown";
	if (normalized.startsWith("blob:") || normalized.startsWith("data:"))
		return "external_or_inline_asset";
	try {
		const parsed = new URL(normalized);
		const pathname = parsed.pathname.toLowerCase();
		if (pathname.startsWith("/library/files/")) return "library_file_detail";
		if (pathname.startsWith("/library/artifacts/")) return "library_artifact_detail";
		if (pathname.startsWith("/library/canvas/")) return "library_canvas_detail";
		if (pathname.startsWith("/c/")) return "conversation_detail";
		if (
			parsed.hostname &&
			parsed.hostname !== "chatgpt.com" &&
			!parsed.hostname.endsWith(".chatgpt.com")
		) {
			return "external_or_inline_asset";
		}
	} catch {
		return "unknown";
	}
	return "unknown";
}

export function matchesChatgptDeleteConfirmationProbe(
	probe: ChatgptDeleteConfirmationProbe | null | undefined,
	expectedTitle?: string | null,
): boolean {
	if (!probe) {
		return false;
	}
	const text = normalizeUiText(probe.dialogText).toLowerCase();
	if (!text.includes(CHATGPT_CONVERSATION_DELETE_DIALOG_LABEL)) {
		return false;
	}
	const labels = Array.isArray(probe.buttonLabels)
		? probe.buttonLabels.map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean)
		: [];
	if (!CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS.every((label) => labels.includes(label))) {
		return false;
	}
	const expected = normalizeUiText(expectedTitle).toLowerCase();
	if (probe.hasVisibleConfirmButton) {
		return true;
	}
	if (!expected) {
		return true;
	}
	return text.includes(expected);
}

export function matchesChatgptProjectDeleteConfirmationProbe(
	probe: ChatgptProjectDeleteConfirmationProbe | null | undefined,
): boolean {
	if (!probe) {
		return false;
	}
	const text = normalizeUiText(probe.dialogText).toLowerCase();
	if (!text.includes(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)) {
		return false;
	}
	const labels = Array.isArray(probe.buttonLabels)
		? probe.buttonLabels.map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean)
		: [];
	return CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS.every((label) => labels.includes(label));
}

export function matchesChatgptConversationTitleProbe(
	probe: ChatgptConversationTitleProbe | null | undefined,
	expectedConversationId: string,
	expectedTitle: string,
	projectId?: string | null,
	options?: {
		requireTopForRootMatch?: boolean;
	},
): boolean {
	if (!probe) {
		return false;
	}
	const expected = normalizeChatgptConversationTitle(expectedTitle);
	if (!expected) {
		return false;
	}
	const normalizedExpectedConversationId = normalizeChatgptConversationId(expectedConversationId);
	if (!normalizedExpectedConversationId) {
		return false;
	}
	const normalizedExpectedProjectId = normalizeChatgptProjectId(projectId ?? null);
	const matchedConversationId = normalizeChatgptConversationId(probe.matchedConversationId);
	const matchedProjectId = normalizeChatgptProjectId(probe.matchedProjectId ?? null);
	const matchedTitle = normalizeChatgptConversationTitle(probe.matchedTitle);
	const requireTopForRootMatch = Boolean(options?.requireTopForRootMatch);
	const topConversationId = normalizeChatgptConversationId(probe.topConversationId);
	const topTitle = normalizeChatgptConversationTitle(probe.topTitle);
	const rootTopMatches =
		topConversationId === normalizedExpectedConversationId && topTitle === expected;
	if (
		matchedConversationId === normalizedExpectedConversationId &&
		matchedTitle === expected &&
		(!normalizedExpectedProjectId || matchedProjectId === normalizedExpectedProjectId)
	) {
		if (
			requireTopForRootMatch &&
			!normalizedExpectedProjectId &&
			topConversationId &&
			!rootTopMatches
		) {
			return false;
		}
		return true;
	}
	if (normalizedExpectedProjectId) {
		return false;
	}
	const routeConversationId = normalizeChatgptConversationId(probe.routeConversationId);
	const routeProjectId = normalizeChatgptProjectId(probe.routeProjectId ?? null);
	if (routeConversationId !== normalizedExpectedConversationId || routeProjectId) {
		return false;
	}
	if (requireTopForRootMatch && topConversationId && !rootTopMatches) {
		return false;
	}
	return normalizeChatgptDocumentTitle(probe.documentTitle) === expected;
}

export function matchesChatgptRenameEditorProbe(
	probe: ChatgptRenameEditorProbe | null | undefined,
): boolean {
	if (!probe) {
		return false;
	}
	return normalizeUiText(probe.inputName).toLowerCase() === "title-editor";
}

export function matchesChatgptProjectSettingsSnapshot(
	snapshot: ChatgptProjectSettingsSnapshot | null | undefined,
	expected: { name?: string; instructions?: string },
): boolean {
	if (!snapshot) {
		return false;
	}
	if (
		typeof expected.name === "string" &&
		normalizeUiText(snapshot.name) !== normalizeUiText(expected.name)
	) {
		return false;
	}
	if (
		typeof expected.instructions === "string" &&
		normalizeInstructionComparisonText(snapshot.text) !==
			normalizeInstructionComparisonText(expected.instructions)
	) {
		return false;
	}
	return true;
}

export function matchesChatgptImageArtifactProbe(
	probe: ChatgptImageArtifactProbe | null | undefined,
	artifact: Pick<ConversationArtifact, "title" | "uri">,
): boolean {
	if (!probe) {
		return false;
	}
	const src = normalizeUiText(probe.src);
	const alt = normalizeUiText(probe.alt).toLowerCase();
	if (!src) {
		return false;
	}
	const artifactUri = normalizeUiText(artifact.uri);
	if (artifactUri && src === artifactUri) {
		return true;
	}
	const fileId = extractChatgptArtifactFileId(artifact.uri);
	if (fileId && src.includes(`id=${fileId}`)) {
		return true;
	}
	if (fileId) {
		return false;
	}
	const expectedTitle = normalizeUiText(artifact.title).toLowerCase();
	return Boolean(expectedTitle) && alt.includes(expectedTitle);
}

export function normalizeChatgptVisibleImageArtifactProbes(
	probes: ReadonlyArray<ChatgptVisibleImageArtifactProbe>,
): ConversationArtifact[] {
	const artifacts: ConversationArtifact[] = [];
	const seen = new Set<string>();
	for (const probe of probes) {
		const src = normalizeUiText(probe.src);
		if (!src) continue;
		const messageId = normalizeUiText(probe.messageId) || undefined;
		const turnId = normalizeUiText(probe.turnId) || undefined;
		const wrapperId = normalizeUiText(probe.wrapperId) || undefined;
		const imageIndex =
			typeof probe.imageIndex === "number" && Number.isFinite(probe.imageIndex)
				? probe.imageIndex
				: artifacts.length;
		const messageIndex =
			typeof probe.messageIndex === "number" && Number.isFinite(probe.messageIndex)
				? probe.messageIndex
				: undefined;
		const title =
			normalizeUiText(probe.title) ||
			normalizeUiText(probe.alt) ||
			`${CHATGPT_ARTIFACT_DEFAULT_IMAGE_TITLE} ${artifacts.length + 1}`;
		const identity = `${turnId || messageId || `message-${messageIndex ?? "n/a"}`}:${src}`;
		if (seen.has(identity)) continue;
		seen.add(identity);
		artifacts.push({
			id: `image-dom:${encodeURIComponent(turnId || messageId || `message-${messageIndex ?? "n/a"}`)}:${encodeURIComponent(wrapperId || String(imageIndex))}`,
			title,
			kind: "image",
			uri: src,
			messageIndex,
			messageId,
			metadata: {
				extraction: "dom-imagegen-image",
				...(turnId ? { turnId } : {}),
				...(wrapperId ? { wrapperId } : {}),
				...(typeof imageIndex === "number" ? { imageIndex } : {}),
			},
		});
	}
	return artifacts;
}

export function matchesChatgptDownloadButtonProbe(
	probe: ChatgptConversationDownloadButtonProbe | null | undefined,
	artifact: Pick<ConversationArtifact, "title" | "messageId" | "messageIndex" | "metadata">,
): boolean {
	if (!probe) {
		return false;
	}
	const expectedTitle = normalizeUiText(artifact.title).toLowerCase();
	const probeTitle = normalizeUiText(probe.title).toLowerCase();
	if (!probeTitle) {
		return false;
	}
	if (expectedTitle && !chatgptArtifactTitleMatches(probeTitle, expectedTitle)) {
		return false;
	}
	const expectedTurnId =
		artifact.metadata && typeof artifact.metadata.turnId === "string"
			? normalizeUiText(artifact.metadata.turnId)
			: "";
	const expectedMessageId = normalizeUiText(artifact.messageId);
	const expectedMessageIndex =
		typeof artifact.messageIndex === "number" && Number.isFinite(artifact.messageIndex)
			? artifact.messageIndex
			: null;
	const expectedButtonIndex =
		artifact.metadata &&
		typeof artifact.metadata.buttonIndex === "number" &&
		Number.isFinite(artifact.metadata.buttonIndex)
			? artifact.metadata.buttonIndex
			: null;
	const probeTurnId = normalizeUiText(probe.turnId);
	const probeMessageId = normalizeUiText(probe.messageId);
	if (expectedTurnId && probeTurnId !== expectedTurnId) {
		return false;
	}
	if (
		!expectedTurnId &&
		expectedMessageId &&
		probeMessageId !== expectedMessageId &&
		probeTurnId !== expectedMessageId
	) {
		return false;
	}
	if (
		!expectedTurnId &&
		!expectedMessageId &&
		expectedMessageIndex !== null &&
		probe.messageIndex !== expectedMessageIndex
	) {
		return false;
	}
	if (expectedButtonIndex !== null && probe.buttonIndex !== expectedButtonIndex) {
		return false;
	}
	return true;
}

function isRetryableConnectionError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("WebSocket connection closed") ||
		message.includes("WebSocket is not open") ||
		message.includes("ECONNRESET") ||
		isRetryableChatgptTransientMessage(message)
	);
}

export const isRetryableConnectionErrorForTest = isRetryableConnectionError;
export const clickChatgptViewerDownloadButtonWithClientForTest =
	clickChatgptViewerDownloadButtonWithClient;
export const extractChatgptArtifactFileNameFromUriForTest = extractChatgptArtifactFileNameFromUri;

function withChatgptTimeout<T>(
	operation: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timeout: NodeJS.Timeout | null = null;
	return new Promise<T>((resolve, reject) => {
		timeout = setTimeout(() => {
			timeout = null;
			reject(new Error(message));
		}, timeoutMs);
		operation.then(
			(value) => {
				if (timeout) clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				if (timeout) clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

async function waitForChatgptCleanup(
	operation: Promise<unknown>,
	timeoutMs: number,
): Promise<"settled" | "timed-out"> {
	let timeout: NodeJS.Timeout | null = null;
	try {
		return await Promise.race([
			operation.then(
				() => "settled" as const,
				() => "settled" as const,
			),
			new Promise<"timed-out">((resolve) => {
				timeout = setTimeout(() => resolve("timed-out"), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function waitForChatgptOperationWithAbort<T>(
	operation: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (!signal) return operation;
	if (signal.aborted) {
		return Promise.reject(signal.reason ?? new Error("ChatGPT browser operation aborted."));
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(signal.reason ?? new Error("ChatGPT browser operation aborted."));
		};
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}

type ChatgptLibraryInventoryStage =
	| "interaction-governor"
	| "connect"
	| "identity"
	| "dialog-cleanup"
	| "route-readiness"
	| "dom-inventory";

class ChatgptLibraryInventoryStageTimeoutError extends Error {
	readonly code = "chatgpt_library_inventory_stage_timeout";

	constructor(
		readonly stage: ChatgptLibraryInventoryStage,
		readonly timeoutMs: number,
		kind: "stage" | "operation" = "stage",
	) {
		super(
			kind === "stage"
				? `ChatGPT Library inventory stage ${stage} timed out after ${timeoutMs}ms.`
				: `ChatGPT Library inventory operation timed out after ${timeoutMs}ms during stage ${stage}.`,
		);
		this.name = "ChatgptLibraryInventoryStageTimeoutError";
	}
}

async function runChatgptLibraryInventoryOperation<T>(
	options: BrowserProviderListOptions | undefined,
	task: (
		scopedOptions: BrowserProviderListOptions,
		runStage: <R>(
			stage: ChatgptLibraryInventoryStage,
			operation: () => Promise<R>,
			timeoutMs?: number,
		) => Promise<R>,
	) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	const callerSignal = options?.abortSignal;
	let currentStage: ChatgptLibraryInventoryStage = "interaction-governor";
	const forwardCallerAbort = () => {
		if (!controller.signal.aborted) {
			recordLibraryInventoryCleanupPhase(options, "provider-abort-requested");
			controller.abort(callerSignal?.reason ?? new Error("ChatGPT Library inventory aborted."));
		}
	};
	if (callerSignal?.aborted) {
		forwardCallerAbort();
	} else {
		callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
	}
	const operationTimer = setTimeout(() => {
		if (controller.signal.aborted) return;
		recordLibraryInventoryCleanupPhase(options, "provider-abort-requested");
		controller.abort(
			new ChatgptLibraryInventoryStageTimeoutError(
				currentStage,
				CHATGPT_LIBRARY_INVENTORY_OPERATION_TIMEOUT_MS,
				"operation",
			),
		);
	}, CHATGPT_LIBRARY_INVENTORY_OPERATION_TIMEOUT_MS);
	const scopedOptions: BrowserProviderListOptions = {
		...options,
		abortSignal: controller.signal,
	};
	const runStage = async <R>(
		stage: ChatgptLibraryInventoryStage,
		operation: () => Promise<R>,
		timeoutMs = CHATGPT_LIBRARY_STAGE_TIMEOUT_MS,
	): Promise<R> => {
		currentStage = stage;
		recordLibraryInventoryStage(scopedOptions, stage);
		recordBrowserScrapeProviderAction(scopedOptions, `chatgpt.listAccountFiles.${stage}`);
		return withBrowserScrapePendingOperation(
			scopedOptions,
			`chatgpt.library-files.${stage}`,
			async () => {
				controller.signal.throwIfAborted();
				const stageTimer = setTimeout(() => {
					if (controller.signal.aborted) return;
					recordLibraryInventoryCleanupPhase(scopedOptions, "provider-abort-requested");
					controller.abort(new ChatgptLibraryInventoryStageTimeoutError(stage, timeoutMs));
				}, timeoutMs);
				try {
					return await waitForChatgptOperationWithAbort(operation(), controller.signal);
				} finally {
					clearTimeout(stageTimer);
				}
			},
		);
	};

	try {
		return await task(scopedOptions, runStage);
	} finally {
		clearTimeout(operationTimer);
		callerSignal?.removeEventListener("abort", forwardCallerAbort);
	}
}

function listChatgptChromeTargets(
	host: string,
	port: number,
): Promise<Awaited<ReturnType<typeof CDP.List>>> {
	return withChatgptTimeout(
		CDP.List({ host, port }),
		CHATGPT_CDP_LIST_TIMEOUT_MS,
		`Timed out listing ChatGPT Chrome DevTools targets at ${host}:${port}`,
	);
}

export type ChatgptChromeTarget = Awaited<ReturnType<typeof CDP.List>>[number];

function normalizeChatgptFrameUrl(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		const parsed = new URL(trimmed);
		parsed.hash = "";
		return parsed.href;
	} catch {
		return trimmed;
	}
}

function isChatgptDeepResearchTarget(target: ChatgptChromeTarget): boolean {
	if (target.type !== "iframe") return false;
	const corpus = normalizeUiText(`${target.title ?? ""} ${target.url ?? ""}`).toLowerCase();
	return (
		corpus.includes("deep_research") ||
		corpus.includes("deep-research") ||
		corpus.includes("deep research")
	);
}

export function filterChatgptDeepResearchTargets(
	targets: ChatgptChromeTarget[],
	allowedFrameUrls: Set<string>,
	options: { expectedTargetId?: string | null } = {},
): ChatgptChromeTarget[] {
	const expectedTargetId = normalizeUiText(options.expectedTargetId ?? undefined);
	return targets.filter((target) => {
		if (!isChatgptDeepResearchTarget(target)) return false;
		const targetId = resolveChatgptTargetId(target);
		if (expectedTargetId && targetId !== expectedTargetId) return false;
		const normalizedUrl = normalizeChatgptFrameUrl(target.url ?? null);
		return Boolean(normalizedUrl && allowedFrameUrls.has(normalizedUrl));
	});
}

export function extractChatgptProjectIdFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const match =
			parsed.pathname.match(/^\/g\/([^/]+)\/project\/?$/) ??
			parsed.pathname.match(/^\/g\/([^/]+)\/c\/[^/]+\/?$/);
		return normalizeChatgptProjectId(match?.[1]) ?? null;
	} catch {
		return null;
	}
}

export function extractChatgptConversationIdFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9-]+)\/?$/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

export function isChatgptTargetReusableForPreferredUrl(
	targetUrl: string | null | undefined,
	preferredUrl: string | null | undefined,
): boolean {
	const target = String(targetUrl ?? "").trim();
	const preferred = String(preferredUrl ?? "").trim();
	if (!target || !preferred || !isChatgptUrl(target)) {
		return false;
	}
	const preferredConversationId = extractChatgptConversationIdFromUrl(preferred);
	const targetConversationId = extractChatgptConversationIdFromUrl(target);
	if (preferredConversationId) {
		return targetConversationId === preferredConversationId;
	}
	return !targetConversationId;
}

export function isChatgptPromptWorkbenchAtTarget(
	targetUrl: string | null | undefined,
	preferredUrl: string | null | undefined,
): boolean {
	const preferred = String(preferredUrl ?? "").trim();
	const preferredProjectId = extractChatgptProjectIdFromUrl(preferred);
	if (preferredProjectId) {
		return extractChatgptProjectIdFromUrl(String(targetUrl ?? "").trim()) === preferredProjectId;
	}
	return isChatgptTargetReusableForPreferredUrl(targetUrl, preferredUrl);
}

export function findChatgptProjectByName<T extends { id: string; name: string; url?: string }>(
	projects: readonly T[],
	name: string,
): T | null {
	const target = normalizeProjectName(name);
	return projects.find((project) => normalizeProjectName(project.name) === target) ?? null;
}

export function resolveChatgptProjectMemoryLabel(mode: ProjectMemoryMode): string {
	return mode === "project"
		? CHATGPT_PROJECT_MEMORY_PROJECT_LABEL
		: CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL;
}

export function resolveChatgptProjectMemoryLabelCandidates(mode: ProjectMemoryMode): string[] {
	const primary = resolveChatgptProjectMemoryLabel(mode);
	const aliases =
		mode === "project"
			? ["Project only", "Project-only memory", "Project only memory"]
			: ["Default memory"];
	return Array.from(
		new Set([primary, ...aliases].map((label) => normalizeUiText(label)).filter(Boolean)),
	);
}

export function resolveChatgptProjectSettingsCommitLabelsForTest(): string[] {
	return [...CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS];
}

export function resolveChatgptProjectCreateConfirmLabelsForTest(): string[] {
	return resolveChatgptProjectCreateConfirmButtonLabels();
}

export function buildChatgptCreateProjectDialogStateExpressionForTest(): string {
	return buildChatgptCreateProjectDialogStateExpression();
}

export function resolveChatgptProjectSourceUploadActionLabelsForTest(): string[] {
	return [...CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS];
}

export function normalizeChatgptAuthSessionIdentity(
	probe: ChatgptAuthSessionProbe | null | undefined,
): ProviderUserIdentity | null {
	if (!probe || typeof probe !== "object") {
		return null;
	}
	const user = probe.user && typeof probe.user === "object" ? probe.user : null;
	const account = probe.account && typeof probe.account === "object" ? probe.account : null;
	const normalize = (value: string | null | undefined): string | undefined => {
		const trimmed = typeof value === "string" ? value.trim() : "";
		return trimmed.length > 0 ? trimmed : undefined;
	};
	const id = normalize(user?.id) ?? normalize(account?.id);
	const email = normalize(user?.email) ?? normalize(account?.email);
	const name = normalize(user?.name) ?? normalize(account?.name);
	const accountId = normalize(account?.id);
	const accountPlanType = normalize(account?.planType);
	const accountStructure = normalize(account?.structure);
	const organizationId = normalize(account?.organizationId);
	const accountLevel = resolveChatgptAccountLevel(accountPlanType, accountStructure);
	const capabilityProfile = resolveChatgptCapabilityProfile(accountLevel);
	if (
		!id &&
		!email &&
		!name &&
		!accountId &&
		!accountLevel &&
		!accountPlanType &&
		!accountStructure
	) {
		return null;
	}
	return {
		id,
		email,
		name,
		accountId,
		accountLevel,
		accountPlanType,
		accountStructure,
		organizationId,
		capabilityProfile,
		proAccess:
			capabilityProfile === "chatgpt-pro-unlimited"
				? "unlimited-standard-extended"
				: capabilityProfile === "chatgpt-business-restricted"
					? "restricted"
					: undefined,
		deepResearchAccess:
			capabilityProfile === "chatgpt-pro-unlimited"
				? "unlimited"
				: capabilityProfile === "chatgpt-business-restricted"
					? "restricted"
					: undefined,
		source: "auth-session",
	};
}

function resolveChatgptAccountLevel(
	planType: string | undefined,
	structure: string | undefined,
): string | undefined {
	const plan = planType?.trim().toLowerCase();
	const accountStructure = structure?.trim().toLowerCase();
	if (plan === "pro") return "Pro";
	if (plan === "team" || accountStructure === "workspace") return "Business";
	if (plan === "plus") return "Plus";
	if (plan === "free") return "Free";
	if (!plan) return undefined;
	return plan
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function resolveChatgptCapabilityProfile(accountLevel: string | undefined): string | undefined {
	const normalized = accountLevel?.trim().toLowerCase();
	if (normalized === "pro") return "chatgpt-pro-unlimited";
	if (normalized === "business") return "chatgpt-business-restricted";
	return undefined;
}

export function extractChatgptProjectSourceName(
	probe: Pick<ChatgptProjectSourceProbe, "rowText" | "leafTexts"> | null | undefined,
): string | null {
	if (!probe || typeof probe !== "object") return null;
	const rowText = normalizeUiText(probe.rowText);
	const leafTexts = Array.isArray(probe.leafTexts)
		? Array.from(new Set(probe.leafTexts.map((value) => normalizeUiText(value)).filter(Boolean)))
		: [];
	for (const candidate of leafTexts) {
		if (candidate === rowText) continue;
		if (candidate.includes(" · ")) continue;
		if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\b/i.test(candidate)) continue;
		return candidate;
	}
	const beforeMeta = rowText.split(/\s+·\s+/)[0]?.trim() ?? "";
	if (!beforeMeta) return null;
	const stripped = beforeMeta
		.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, "")
		.trim();
	return stripped || beforeMeta || null;
}

export function normalizeChatgptProjectSourceProbes(
	probes: readonly ChatgptProjectSourceProbe[],
): FileRef[] {
	const files: FileRef[] = [];
	const seen = new Set<string>();
	for (const probe of probes) {
		const name = extractChatgptProjectSourceName(probe);
		if (!name) continue;
		const providerFileId = normalizeUiText(probe.providerFileId);
		const hrefs = Array.isArray(probe.hrefs)
			? Array.from(new Set(probe.hrefs.map((value) => normalizeUiText(value)).filter(Boolean)))
			: [];
		const testIds = Array.isArray(probe.testIds)
			? Array.from(
					new Set(probe.testIds.map((value) => normalizeUiText(value)).filter(Boolean)),
				).slice(0, 12)
			: [];
		const ariaLabels = Array.isArray(probe.ariaLabels)
			? Array.from(
					new Set(probe.ariaLabels.map((value) => normalizeUiText(value)).filter(Boolean)),
				).slice(0, 12)
			: [];
		const remoteUrl = providerFileId
			? `chatgpt://file/${encodeURIComponent(providerFileId)}`
			: (hrefs.find((href) => href.includes("/backend-api/files/")) ?? hrefs[0]);
		const key = providerFileId ? `provider:${providerFileId}` : normalizeFileKey(name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const metadataText = normalizeUiText(probe.metadataText);
		const mimeType = normalizeUiText(probe.mimeType);
		const size =
			typeof probe.size === "number" && Number.isFinite(probe.size) ? probe.size : undefined;
		files.push({
			id: providerFileId || name,
			name,
			provider: "chatgpt",
			source: "project",
			...(mimeType ? { mimeType } : {}),
			...(typeof size === "number" ? { size } : {}),
			...(remoteUrl ? { remoteUrl } : {}),
			metadata: {
				...(metadataText ? { label: metadataText } : {}),
				...(providerFileId ? { providerFileId } : {}),
				...(hrefs.length > 0 ? { hrefs } : {}),
				...(testIds.length > 0 ? { testIds } : {}),
				...(ariaLabels.length > 0 ? { ariaLabels } : {}),
				materializationSurface: providerFileId
					? "chatgpt-project-source-provider-file"
					: "chatgpt-project-source-row",
			},
		});
	}
	return files;
}

export function normalizeChatgptConversationFileProbes(
	conversationId: string,
	probes: readonly ChatgptConversationFileProbe[],
): FileRef[] {
	const files: FileRef[] = [];
	const seen = new Set<string>();
	for (const probe of probes) {
		const name = normalizeUiText(probe.name);
		if (!name) continue;
		const turnKey = normalizeUiText(probe.turnId) || normalizeUiText(probe.messageId) || "turn";
		const tileIndex =
			typeof probe.tileIndex === "number" && Number.isFinite(probe.tileIndex)
				? probe.tileIndex
				: files.length;
		const dedupeKey = `${turnKey}:${tileIndex}:${normalizeFileKey(name)}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		const label = normalizeUiText(probe.label);
		const providerFileId = normalizeUiText(probe.providerFileId);
		const mimeType = normalizeUiText(probe.mimeType);
		const downloadable = normalizeUiText(probe.downloadable);
		const previewable = normalizeUiText(probe.previewable);
		files.push({
			id: `${conversationId}:${turnKey}:${tileIndex}:${name}`,
			name,
			provider: "chatgpt",
			source: "conversation",
			...(mimeType ? { mimeType } : {}),
			...(providerFileId
				? { remoteUrl: `chatgpt://file/${encodeURIComponent(providerFileId)}` }
				: {}),
			metadata: {
				...(label ? { label } : {}),
				...(normalizeUiText(probe.turnId) ? { turnId: normalizeUiText(probe.turnId) } : {}),
				...(normalizeUiText(probe.messageId)
					? { messageId: normalizeUiText(probe.messageId) }
					: {}),
				...(providerFileId ? { providerFileId } : {}),
				...(downloadable ? { downloadable } : {}),
				...(previewable ? { previewable } : {}),
				...(providerFileId ? { materializationSurface: "chatgpt-file-tile-default-action" } : {}),
			},
		});
	}
	return files;
}

export function normalizeChatgptLibraryItemProbes(probes: readonly ChatgptLibraryItemProbe[]): {
	files: FileRef[];
	artifacts: ConversationArtifact[];
} {
	const files = new Map<string, FileRef>();
	const artifacts = new Map<string, ConversationArtifact>();
	for (const probe of probes) {
		const title =
			normalizeLibraryTitle(probe.title) ||
			normalizeLibraryTitle(probe.ariaLabel) ||
			normalizeLibraryTitle(probe.text);
		const href = normalizeUiText(probe.href);
		const src = normalizeUiText(probe.src);
		const providerFileId = normalizeUiText(probe.providerFileId);
		const libraryFileId = normalizeUiText(probe.libraryFileId);
		const libraryRouteUrl =
			href ||
			(libraryFileId
				? `https://chatgpt.com/library/files/${encodeURIComponent(libraryFileId)}`
				: "");
		const uri = providerFileId
			? `chatgpt://file/${encodeURIComponent(providerFileId)}`
			: libraryRouteUrl || src || undefined;
		const routeKind = classifyChatgptLibraryRouteKind(libraryRouteUrl || uri);
		const identity = resolveChatgptLibraryIdentity(probe, title);
		if (isChatgptLibraryChromeProbe(probe, title)) continue;
		if (!title || !identity) continue;
		const kind = inferChatgptLibraryArtifactKind(probe, title, uri);
		const metadata = {
			source: "chatgpt-library",
			libraryIdentity: identity.identity,
			libraryIdentitySource: identity.source,
			libraryRouteKind: routeKind,
			...(libraryRouteUrl ? { libraryRouteUrl } : {}),
			...(providerFileId ? { providerFileId } : {}),
			...(providerFileId ? { materializationSurface: "chatgpt-library-file-row-click" } : {}),
			...(libraryFileId ? { libraryFileId } : {}),
			artifactId: `chatgpt-library:${identity.uuid}`,
			artifactKind: kind,
			...(normalizeUiText(probe.subtitle) ? { subtitle: normalizeUiText(probe.subtitle) } : {}),
			...(normalizeUiText(probe.kind) ? { kindLabel: normalizeUiText(probe.kind) } : {}),
			...(normalizeUiText(probe.testId) ? { testId: normalizeUiText(probe.testId) } : {}),
		};
		const file: FileRef = {
			id: identity.uuid,
			name: title,
			provider: "chatgpt",
			source: "account",
			remoteUrl: uri,
			mimeType: inferMimeTypeFromArtifactName(title),
			metadata,
		};
		files.set(file.id, { ...(files.get(file.id) ?? {}), ...file });
		artifacts.set(file.id, {
			id: `chatgpt-library:${file.id}`,
			title,
			kind,
			uri,
			metadata,
		});
	}
	return {
		files: [...files.values()],
		artifacts: [...artifacts.values()],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string") {
			const normalized = value.trim();
			if (normalized) {
				return normalized;
			}
		}
	}
	return null;
}

function listChatgptConversationPayloadNodes(
	payload: ChatgptConversationPayload | null | undefined,
): ChatgptConversationPayloadNode[] {
	if (!payload || !isRecord(payload.mapping)) {
		return [];
	}
	return Object.values(payload.mapping).filter((entry): entry is ChatgptConversationPayloadNode => {
		return isRecord(entry) && isRecord(entry.message);
	});
}

function extractChatgptPayloadMessageTextParts(
	message: ChatgptConversationPayloadMessage | null | undefined,
): string[] {
	if (!message || !isRecord(message.content)) {
		return [];
	}
	const parts: string[] = [];
	const rawParts = Array.isArray(message.content.parts) ? message.content.parts : [];
	for (const part of rawParts) {
		if (typeof part === "string") {
			const normalized = part.trim();
			if (normalized) parts.push(normalized);
			continue;
		}
		if (isRecord(part)) {
			const text = readStringField(part, "text", "content");
			if (text) parts.push(text);
		}
	}
	const fallbackText = typeof message.content.text === "string" ? message.content.text.trim() : "";
	if (fallbackText) {
		parts.push(fallbackText);
	}
	return parts;
}

function extractChatgptPayloadMessageStructuredParts(
	message: ChatgptConversationPayloadMessage | null | undefined,
): Record<string, unknown>[] {
	if (!message || !isRecord(message.content)) {
		return [];
	}
	const parts: Record<string, unknown>[] = [];
	const rawParts = Array.isArray(message.content.parts) ? message.content.parts : [];
	for (const part of rawParts) {
		if (isRecord(part)) {
			parts.push(part);
			continue;
		}
		if (typeof part !== "string") {
			continue;
		}
		try {
			const parsed = JSON.parse(part) as unknown;
			if (isRecord(parsed)) {
				parts.push(parsed);
			}
		} catch {
			// Ignore non-JSON string parts.
		}
	}
	return parts;
}

function readFiniteNumberField(
	record: Record<string, unknown>,
	...keys: string[]
): number | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
	}
	return undefined;
}

function parseChatgptCodeArtifactPreview(
	message: ChatgptConversationPayloadMessage | null | undefined,
): {
	name?: string;
	type?: string;
	content?: string;
} | null {
	if (!message || !isRecord(message.content)) {
		return null;
	}
	const contentType =
		typeof message.content.content_type === "string"
			? message.content.content_type.trim().toLowerCase()
			: "";
	if (contentType !== "code") {
		return null;
	}
	for (const part of extractChatgptPayloadMessageTextParts(message)) {
		try {
			const parsed = JSON.parse(part) as unknown;
			if (!isRecord(parsed)) continue;
			const name = readStringField(parsed, "name") ?? undefined;
			const type = readStringField(parsed, "type") ?? undefined;
			const content = readStringField(parsed, "content") ?? undefined;
			if (name || type || content) {
				return { name, type, content };
			}
		} catch {
			// Ignore non-JSON code previews.
		}
	}
	return null;
}

function inferChatgptDownloadArtifactKind(
	title: string | null | undefined,
	uri: string | null | undefined,
): ConversationArtifact["kind"] {
	const value = `${title ?? ""} ${uri ?? ""}`.toLowerCase();
	for (const [kind, extensions] of Object.entries(CHATGPT_ARTIFACT_KIND_EXTENSIONS)) {
		if (
			extensions.some((extension) => {
				const normalized = String(extension ?? "")
					.trim()
					.replace(/^\./, "")
					.toLowerCase();
				return normalized.length > 0 && new RegExp(`\\.${normalized}\\b`).test(value);
			})
		) {
			return kind as ConversationArtifact["kind"];
		}
	}
	return "download";
}

function stripAsciiControlCharacters(value: string): string {
	return Array.from(value)
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code >= 0x20 && code !== 0x7f;
		})
		.join("");
}

function sanitizeChatgptArtifactFileName(value: string | null | undefined): string {
	const normalized = stripAsciiControlCharacters(String(value ?? ""))
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 ? normalized.slice(0, 160) : "artifact";
}

function ensureChatgptArtifactExtension(name: string, fallbackExt: string): string {
	const trimmed = sanitizeChatgptArtifactFileName(name);
	if (/\.[a-z0-9]{1,8}$/i.test(trimmed)) {
		return trimmed;
	}
	return `${trimmed}${fallbackExt}`;
}

function extractChatgptArtifactFileNameFromUri(uri: string | null | undefined): string {
	const normalized = normalizeUiText(uri);
	if (!normalized) return "";
	const tail = normalized.split("/").pop() ?? "";
	try {
		return normalizeUiText(decodeURIComponent(tail));
	} catch {
		return normalizeUiText(tail);
	}
}

export function serializeChatgptGridRowsToCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
	return rows
		.map((row) =>
			row
				.map((cell) => {
					const normalized = String(cell ?? "")
						.replace(/\r\n/g, "\n")
						.replace(/\r/g, "\n");
					if (/[",\n]/.test(normalized)) {
						return `"${normalized.replace(/"/g, '""')}"`;
					}
					return normalized;
				})
				.join(","),
		)
		.join("\n");
}

function extractChatgptArtifactFileId(uri: string | null | undefined): string | null {
	if (typeof uri !== "string") return null;
	const trimmed = uri.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("chatgpt://file/")) {
		return decodeURIComponent(trimmed.slice("chatgpt://file/".length));
	}
	if (trimmed.startsWith("sediment://")) {
		return decodeURIComponent(trimmed.slice("sediment://".length));
	}
	return null;
}

function contentTypeToExtension(contentType: string | null | undefined): string {
	const normalized = String(contentType ?? "").toLowerCase();
	for (const [token, extension] of Object.entries(CHATGPT_ARTIFACT_CONTENT_TYPE_EXTENSIONS)) {
		if (normalized.includes(token.toLowerCase())) {
			return extension;
		}
	}
	return ".bin";
}

function inferChatgptBinaryContentType(buffer: Buffer, url: string): string | null {
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return "image/jpeg";
	}
	if (
		buffer.length >= 8 &&
		buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return "image/png";
	}
	if (buffer.length >= 6) {
		const signature = buffer.subarray(0, 6).toString("ascii");
		if (signature === "GIF87a" || signature === "GIF89a") {
			return "image/gif";
		}
	}
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
		buffer.subarray(8, 12).toString("ascii") === "WEBP"
	) {
		return "image/webp";
	}
	let pathname = "";
	try {
		pathname = new URL(url).pathname.toLowerCase();
	} catch {
		pathname = url.toLowerCase().split("?", 1)[0] ?? "";
	}
	if (/\.jpe?g$/.test(pathname)) return "image/jpeg";
	if (/\.png$/.test(pathname)) return "image/png";
	if (/\.gif$/.test(pathname)) return "image/gif";
	if (/\.webp$/.test(pathname)) return "image/webp";
	return null;
}

function extractFilenameFromContentDisposition(value: string | null | undefined): string | null {
	const text = String(value ?? "").trim();
	if (!text) return null;
	const utf8Match = text.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
	if (utf8Match?.[1]) {
		try {
			return sanitizeChatgptArtifactFileName(decodeURIComponent(utf8Match[1]));
		} catch {
			return sanitizeChatgptArtifactFileName(utf8Match[1]);
		}
	}
	const plainMatch = text.match(/filename\s*=\s*"?([^";]+)"?/i);
	return plainMatch?.[1] ? sanitizeChatgptArtifactFileName(plainMatch[1]) : null;
}

function extractFilenameFromArtifactUri(uri: string | null | undefined): string | null {
	const value = String(uri ?? "").trim();
	if (!value) return null;
	if (value.startsWith("sandbox:/")) {
		const cleaned = value.replace(/^sandbox:\/*/i, "");
		const parts = cleaned.split("/").filter(Boolean);
		const fileName = parts.at(-1);
		return fileName ? sanitizeChatgptArtifactFileName(decodeURIComponent(fileName)) : null;
	}
	try {
		const parsed = new URL(value);
		const parts = parsed.pathname.split("/").filter(Boolean);
		const fileName = parts.at(-1);
		return fileName ? sanitizeChatgptArtifactFileName(decodeURIComponent(fileName)) : null;
	} catch {
		return null;
	}
}

function inferMimeTypeFromArtifactName(name: string | null | undefined): string | undefined {
	const normalized = String(name ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return undefined;
	for (const [extension, mimeType] of Object.entries(CHATGPT_ARTIFACT_NAME_MIME_TYPES)) {
		if (normalized.endsWith(extension.toLowerCase())) {
			return mimeType;
		}
	}
	return undefined;
}

export function normalizeChatgptConversationDownloadArtifactProbes(
	probes: ReadonlyArray<ChatgptConversationDownloadButtonProbe>,
): ConversationArtifact[] {
	const artifacts: ConversationArtifact[] = [];
	const seen = new Set<string>();
	for (const probe of probes) {
		const title = normalizeUiText(probe.title);
		if (!title) continue;
		const messageId = normalizeUiText(probe.messageId) || undefined;
		const turnId = normalizeUiText(probe.turnId) || undefined;
		const messageIndex =
			typeof probe.messageIndex === "number" && Number.isFinite(probe.messageIndex)
				? probe.messageIndex
				: undefined;
		const buttonIndex =
			typeof probe.buttonIndex === "number" && Number.isFinite(probe.buttonIndex)
				? probe.buttonIndex
				: 0;
		const identity = `${turnId || messageId || `message-${messageIndex ?? "n/a"}`}:${buttonIndex}:${title.toLowerCase()}`;
		if (seen.has(identity)) continue;
		seen.add(identity);
		artifacts.push({
			id: `download-dom:${encodeURIComponent(turnId || messageId || `message-${messageIndex ?? "n/a"}`)}:${buttonIndex}`,
			title,
			kind: inferChatgptDownloadArtifactKind(title, null),
			uri: `chatgpt://download-button/${encodeURIComponent(turnId || messageId || `message-${messageIndex ?? "n/a"}`)}/${buttonIndex}`,
			messageIndex,
			messageId,
			metadata: {
				extraction: "dom-behavior-button",
				...(turnId ? { turnId } : {}),
				...(typeof buttonIndex === "number" ? { buttonIndex } : {}),
			},
		});
	}
	return artifacts;
}

export function mergeChatgptCanvasArtifactContent(
	artifacts: ReadonlyArray<ConversationArtifact>,
	probes: ReadonlyArray<ChatgptConversationCanvasProbe>,
): ConversationArtifact[] {
	const byTextdocId = new Map<string, ChatgptConversationCanvasProbe>();
	const byTitle = new Map<string, ChatgptConversationCanvasProbe>();
	for (const probe of probes) {
		const textdocId = normalizeUiText(probe.textdocId);
		const title = normalizeUiText(probe.title);
		const contentText = typeof probe.contentText === "string" ? probe.contentText.trim() : "";
		if (!contentText) continue;
		if (textdocId) byTextdocId.set(textdocId, probe);
		if (title) byTitle.set(title.toLowerCase(), probe);
	}
	const resolveContentText = (artifact: ConversationArtifact): string => {
		const existingContent =
			artifact.metadata && typeof artifact.metadata.contentText === "string"
				? artifact.metadata.contentText.trim()
				: "";
		if (existingContent) return existingContent;
		const textdocId =
			artifact.metadata && typeof artifact.metadata.textdocId === "string"
				? artifact.metadata.textdocId.trim()
				: "";
		const match =
			(textdocId ? byTextdocId.get(textdocId) : null) ??
			byTitle.get(normalizeUiText(artifact.title).toLowerCase()) ??
			null;
		return typeof match?.contentText === "string" ? match.contentText.trim() : "";
	};
	return artifacts.map((artifact) => {
		if (artifact.kind !== "canvas") return artifact;
		const contentText = resolveContentText(artifact);
		if (!contentText) return artifact;
		return {
			...artifact,
			metadata: {
				...(artifact.metadata ?? {}),
				contentText,
			},
		};
	});
}

export function resolveChatgptCanvasArtifactContentText(
	artifact: ConversationArtifact,
	probes: ReadonlyArray<ChatgptConversationCanvasProbe>,
): string {
	const enriched = mergeChatgptCanvasArtifactContent([artifact], probes)[0];
	return enriched?.metadata && typeof enriched.metadata.contentText === "string"
		? enriched.metadata.contentText.trim()
		: "";
}

export function mergeChatgptConversationArtifacts(
	payloadArtifacts: ReadonlyArray<ConversationArtifact>,
	domArtifacts: ReadonlyArray<ConversationArtifact>,
	options?: { reconcileDownloadControls?: boolean },
): ConversationArtifact[] {
	if (options?.reconcileDownloadControls === true) {
		const combined = [...payloadArtifacts];
		const seenIds = new Set(payloadArtifacts.map((artifact) => artifact.id));
		for (const artifact of domArtifacts) {
			if (!artifact.title || seenIds.has(artifact.id)) continue;
			combined.push(artifact);
			seenIds.add(artifact.id);
		}
		return reconcileChatgptPayloadDownloadControls(combined);
	}
	const merged = [...payloadArtifacts];
	const seenIds = new Set(payloadArtifacts.map((artifact) => artifact.id));
	const seenSemanticKeys = new Set(
		payloadArtifacts.map((artifact) => {
			const indexKey = typeof artifact.messageIndex === "number" ? artifact.messageIndex : "n/a";
			return `${artifact.kind ?? "artifact"}::${normalizeUiText(artifact.title).toLowerCase()}::${indexKey}`;
		}),
	);
	for (const artifact of domArtifacts) {
		if (!artifact.title || seenIds.has(artifact.id)) continue;
		const indexKey = typeof artifact.messageIndex === "number" ? artifact.messageIndex : "n/a";
		const semanticKey = `${artifact.kind ?? "artifact"}::${normalizeUiText(artifact.title).toLowerCase()}::${indexKey}`;
		if (seenSemanticKeys.has(semanticKey)) continue;
		merged.push(artifact);
		seenIds.add(artifact.id);
		seenSemanticKeys.add(semanticKey);
	}
	return merged;
}

function looksLikeChatgptReferenceCandidate(record: Record<string, unknown>): boolean {
	return Boolean(
		readStringField(
			record,
			"id",
			"name",
			"title",
			"url",
			"uri",
			"href",
			"cloud_doc_url",
			"source",
			"type",
		),
	);
}

function collectChatgptReferenceCandidates(
	value: unknown,
	depth = 0,
	out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
	if (depth > 4) {
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			collectChatgptReferenceCandidates(item, depth + 1, out);
		}
		return out;
	}
	if (!isRecord(value)) {
		return out;
	}
	if (looksLikeChatgptReferenceCandidate(value)) {
		out.push(value);
	}
	for (const child of Object.values(value)) {
		collectChatgptReferenceCandidates(child, depth + 1, out);
	}
	return out;
}

function resolveChatgptReferenceUrl(candidate: Record<string, unknown>): string | null {
	const explicitUrl = readStringField(
		candidate,
		"url",
		"uri",
		"href",
		"cloud_doc_url",
		"download_url",
	);
	if (explicitUrl) {
		return explicitUrl;
	}
	const id = readStringField(candidate, "id", "file_id");
	if (id) {
		const type = (readStringField(candidate, "type") ?? "").toLowerCase();
		const source = (readStringField(candidate, "source") ?? "").toLowerCase();
		if (type === "file" || source === "my_files" || source === "file") {
			return `chatgpt://file/${encodeURIComponent(id)}`;
		}
		return `chatgpt://source/${encodeURIComponent(id)}`;
	}
	const name = readStringField(candidate, "name", "title", "label");
	return name ? `chatgpt://source/${encodeURIComponent(name)}` : null;
}

function resolveChatgptReferenceDomain(url: string): string | undefined {
	if (url.startsWith("chatgpt://file/")) {
		return "chatgpt-file";
	}
	if (url.startsWith("chatgpt://source/")) {
		return "chatgpt-source";
	}
	try {
		return new URL(url).hostname || undefined;
	} catch {
		return undefined;
	}
}

export function extractChatgptConversationSourcesFromPayload(
	payload: ChatgptConversationPayload | null | undefined,
	messageIndexById: ReadonlyMap<string, number> = new Map(),
): ConversationSource[] {
	const sources: ConversationSource[] = [];
	const seen = new Set<string>();
	for (const node of listChatgptConversationPayloadNodes(payload)) {
		const message = node.message;
		if (!message) continue;
		const role = readStringField(message.author ?? {}, "role");
		if (role !== "assistant") continue;
		const messageId = readStringField(message, "id") ?? undefined;
		const messageIndex = messageId ? messageIndexById.get(messageId) : undefined;
		const metadata = isRecord(message.metadata) ? message.metadata : null;
		const references = [
			...collectChatgptReferenceCandidates(metadata?.content_references),
			...collectChatgptReferenceCandidates(metadata?.citations),
		];
		for (const reference of references) {
			const url = resolveChatgptReferenceUrl(reference);
			if (!url) continue;
			const key = `${messageId ?? "n/a"}::${url}`;
			if (seen.has(key)) continue;
			seen.add(key);
			sources.push({
				url,
				title: readStringField(reference, "name", "title", "label") ?? undefined,
				domain: resolveChatgptReferenceDomain(url),
				messageIndex,
				sourceGroup: readStringField(reference, "source", "type") ?? undefined,
			});
		}
	}
	return sources;
}

export function extractChatgptConversationArtifactsFromPayload(
	payload: ChatgptConversationPayload | null | undefined,
	messageIndexById: ReadonlyMap<string, number> = new Map(),
): ConversationArtifact[] {
	const artifacts: ConversationArtifact[] = [];
	const seen = new Set<string>();
	const nodes = listChatgptConversationPayloadNodes(payload);
	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index];
		const message = node.message;
		if (!message) continue;
		const messageId = readStringField(message, "id") ?? undefined;
		const messageIndex = messageId ? messageIndexById.get(messageId) : undefined;
		const _role = readStringField(message.author ?? {}, "role");
		for (const part of extractChatgptPayloadMessageTextParts(message)) {
			const matches = part.matchAll(/\[([^\]]+)\]\((sandbox:[^)]+)\)/g);
			for (const match of matches) {
				const title = normalizeUiText(match[1]);
				const uri = normalizeUiText(match[2]);
				if (!title || !uri) continue;
				const id = `${messageId ?? "message"}:download:${uri}`;
				if (seen.has(id)) continue;
				seen.add(id);
				artifacts.push({
					id,
					title,
					kind: inferChatgptDownloadArtifactKind(title, uri),
					uri,
					messageIndex,
					messageId,
				});
			}
		}
		const metadata = isRecord(message.metadata) ? message.metadata : null;
		for (const part of extractChatgptPayloadMessageStructuredParts(message)) {
			const contentType = readStringField(part, "content_type");
			const normalizedContentType = String(contentType ?? "")
				.trim()
				.toLowerCase();
			if (!CHATGPT_ARTIFACT_IMAGE_CONTENT_TYPES.has(normalizedContentType)) {
				continue;
			}
			const assetPointer = readStringField(part, "asset_pointer", "assetPointer");
			const width = readFiniteNumberField(part, "width");
			const height = readFiniteNumberField(part, "height");
			const sizeBytes = readFiniteNumberField(part, "size_bytes", "sizeBytes");
			const partMetadata = isRecord(part.metadata) ? part.metadata : null;
			const artifactId = `${messageId ?? `node-${index}`}:image:${assetPointer ?? seen.size}`;
			if (seen.has(artifactId)) continue;
			seen.add(artifactId);
			artifacts.push({
				id: artifactId,
				title:
					readStringField(metadata ?? {}, "title", "image_gen_title") ??
					readStringField(part, "title", "name") ??
					CHATGPT_ARTIFACT_DEFAULT_IMAGE_TITLE,
				kind: "image",
				uri: assetPointer ?? undefined,
				messageIndex,
				messageId,
				metadata: {
					contentType,
					...(assetPointer ? { assetPointer } : {}),
					...(typeof sizeBytes === "number" ? { sizeBytes } : {}),
					...(typeof width === "number" ? { width } : {}),
					...(typeof height === "number" ? { height } : {}),
					...(partMetadata?.generation ? { generation: partMetadata.generation } : {}),
					...(partMetadata?.dalle ? { dalle: partMetadata.dalle } : {}),
				},
			});
		}
		const visualizations =
			metadata && Array.isArray(metadata.ada_visualizations)
				? metadata.ada_visualizations.filter(isRecord)
				: [];
		for (const visualization of visualizations) {
			const visualizationType = readStringField(visualization, "type");
			const normalizedVisualizationType = String(visualizationType ?? "")
				.trim()
				.toLowerCase();
			if (!CHATGPT_ARTIFACT_SPREADSHEET_VISUALIZATION_TYPES.has(normalizedVisualizationType)) {
				continue;
			}
			const fileId = readStringField(visualization, "file_id", "fileId");
			const artifactId = fileId
				? `spreadsheet:${fileId}`
				: `${messageId ?? `node-${index}`}:spreadsheet`;
			if (seen.has(artifactId)) continue;
			seen.add(artifactId);
			artifacts.push({
				id: artifactId,
				title:
					readStringField(visualization, "title", "name") ??
					readStringField(metadata ?? {}, "title") ??
					CHATGPT_ARTIFACT_DEFAULT_SPREADSHEET_TITLE,
				kind: "spreadsheet",
				uri: fileId ? `chatgpt://file/${encodeURIComponent(fileId)}` : undefined,
				messageIndex,
				messageId,
				metadata: {
					visualizationType,
					...(fileId ? { fileId } : {}),
				},
			});
		}
		const canvas = metadata && isRecord(metadata.canvas) ? metadata.canvas : null;
		if (!canvas) continue;
		const textdocId = readStringField(canvas, "textdoc_id", "id");
		const metadataTitle = metadata ? readStringField(metadata, "title") : null;
		const metadataCommand = metadata ? readStringField(metadata, "command") : null;
		const title =
			readStringField(canvas, "title") ?? metadataTitle ?? CHATGPT_ARTIFACT_DEFAULT_CANVAS_TITLE;
		const artifactId = textdocId ? `canvas:${textdocId}` : `${messageId ?? `node-${index}`}:canvas`;
		if (seen.has(artifactId)) continue;
		seen.add(artifactId);
		const previousCodePreview =
			index > 0 ? parseChatgptCodeArtifactPreview(nodes[index - 1]?.message ?? null) : null;
		artifacts.push({
			id: artifactId,
			title,
			kind: "canvas",
			uri: textdocId ? `chatgpt://canvas/${encodeURIComponent(textdocId)}` : undefined,
			messageIndex,
			messageId,
			metadata: {
				...(textdocId ? { textdocId } : {}),
				...(readStringField(canvas, "textdoc_type")
					? { textdocType: readStringField(canvas, "textdoc_type") }
					: {}),
				...(typeof canvas.version === "number" && Number.isFinite(canvas.version)
					? { version: canvas.version }
					: {}),
				...(readStringField(canvas, "create_source")
					? { createSource: readStringField(canvas, "create_source") }
					: {}),
				...(metadataCommand ? { command: metadataCommand } : {}),
				...(previousCodePreview?.name ? { documentName: previousCodePreview.name } : {}),
				...(previousCodePreview?.type ? { documentType: previousCodePreview.type } : {}),
				...(previousCodePreview?.content ? { contentText: previousCodePreview.content } : {}),
			},
		});
	}
	return artifacts;
}

function buildChatgptConversationPayloadExpression(conversationId: string): string {
	return `(async () => {
	  const controller = new AbortController();
	  const timeout = setTimeout(
	    () => controller.abort(new Error('ChatGPT conversation payload fetch timed out.')),
	    ${CHATGPT_CONVERSATION_PAYLOAD_FETCH_TIMEOUT_MS},
	  );
	  try {
	    const response = await fetch(${JSON.stringify(`/backend-api/conversation/${conversationId}`)}, {
	      credentials: 'include',
	      headers: { accept: 'application/json' },
	      signal: controller.signal,
	    });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : String(error);
      return {
        ok: false,
        status: 0,
	    error: message,
	  };
	} finally {
	  clearTimeout(timeout);
	}
  })()`;
}

type ChatgptRuntimeEvaluationFailureClass =
	| "evaluation_timeout"
	| "execution_context_destroyed"
	| "execution_context_missing"
	| "transport_closed"
	| "protocol_error"
	| "generic_error";

function classifyChatgptRuntimeEvaluationFailure(
	error: unknown,
): ChatgptRuntimeEvaluationFailureClass {
	const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
	const name =
		error instanceof Error ? error.name : typeof record?.name === "string" ? record.name : "";
	const message =
		error instanceof Error
			? error.message
			: typeof record?.message === "string"
				? record.message
				: typeof error === "string"
					? error
					: "";
	const code = typeof record?.code === "string" ? record.code : "";
	const signal = `${name} ${code} ${message}`.toLowerCase();
	if (/timed?\s*out|timeout/.test(signal)) return "evaluation_timeout";
	if (/execution context (?:was )?destroyed|context destroyed/.test(signal)) {
		return "execution_context_destroyed";
	}
	if (/cannot find context|context with specified id|no execution context/.test(signal)) {
		return "execution_context_missing";
	}
	if (
		/websocket.*(?:closed|not open)|target closed|session closed|connection closed|readyState\s*3/.test(
			signal,
		)
	) {
		return "transport_closed";
	}
	if (/protocolerror|protocol error/.test(signal)) return "protocol_error";
	return "generic_error";
}

export const classifyChatgptRuntimeEvaluationFailureForTest =
	classifyChatgptRuntimeEvaluationFailure;

export async function readChatgptConversationPayloadWithClient(
	client: ChromeClient,
	conversationId: string,
	_projectId?: string | null,
	options?: BrowserProviderListOptions,
): Promise<ChatgptConversationPayload | null> {
	const parsePayloadBody = (
		body: string | null | undefined,
		base64Encoded = false,
	): ChatgptConversationPayload | null => {
		if (typeof body !== "string" || !body.trim()) {
			return null;
		}
		try {
			const decoded = base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
			const parsed = JSON.parse(decoded) as unknown;
			return isRecord(parsed) ? (parsed as ChatgptConversationPayload) : null;
		} catch {
			return null;
		}
	};

	const { result } = await withChatgptTimeout(
		client.Runtime.evaluate({
			expression: buildChatgptConversationPayloadExpression(conversationId),
			awaitPromise: true,
			returnByValue: true,
			timeout: CHATGPT_CONVERSATION_PAYLOAD_EVALUATE_TIMEOUT_MS,
		}),
		CHATGPT_CONVERSATION_PAYLOAD_EVALUATE_TIMEOUT_MS,
		`Timed out reading ChatGPT conversation payload for ${conversationId} after ${CHATGPT_CONVERSATION_PAYLOAD_EVALUATE_TIMEOUT_MS}ms.`,
	);
	const value = isRecord(result?.value)
		? (result.value as ChatgptConversationPayloadResponse)
		: null;
	const directPayload = parsePayloadBody(value?.body);
	if (value?.ok && directPayload && isRecord(directPayload.mapping)) {
		return directPayload;
	}
	if (!providerNavigationAllowed(options)) {
		return null;
	}
	if (options?.accountMirrorSingleConversationVisit === true) {
		recordBrowserScrapeProviderAction(options, "chatgpt.skipPayloadRouteFallback.singleVisit");
		return null;
	}

	const targetUrl = resolveChatgptConversationApiUrl(conversationId);
	await client.Network.enable().catch(() => undefined);
	await client.Page.enable().catch(() => undefined);
	// Pacing is outside the response-acquisition window. Starting the fallback
	// timer before the governor releases the physical route reacquisition can
	// exhaust the entire body deadline without issuing the request, while a
	// detached navigation later outlives this read and its client.
	await beforeChatgptBrowserInteraction(options, "renavigation");

	type FallbackBody =
		| { kind: "body"; body: string; base64Encoded: boolean }
		| { kind: "terminal-unavailable"; status: 404 | 410 }
		| null;
	let finishBody: (value: FallbackBody) => void = () => undefined;
	const bodyPromise = new Promise<FallbackBody>((resolve) => {
		let settled = false;
		let exactRequestId: string | null = null;
		let timer: NodeJS.Timeout | null = null;
		let disposeResponseReceived: (() => void) | null = null;
		let disposeLoadingFinished: (() => void) | null = null;
		const finish = (value: FallbackBody) => {
			if (settled) return;
			settled = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			disposeResponseReceived?.();
			disposeLoadingFinished?.();
			disposeResponseReceived = null;
			disposeLoadingFinished = null;
			resolve(value);
		};
		finishBody = finish;
		timer = setTimeout(() => finish(null), CHATGPT_CONVERSATION_PAYLOAD_FALLBACK_TIMEOUT_MS);
		const responseReceivedSubscription: unknown = client.Network.responseReceived((params) => {
			if (settled) return;
			const url = params.response?.url ?? "";
			const status = params.response?.status ?? 0;
			const isExactConversationResponse = url === targetUrl || url.startsWith(`${targetUrl}?`);
			if (!isExactConversationResponse) return;
			if (status === 404 || status === 410) {
				finish({ kind: "terminal-unavailable", status });
				return;
			}
			if (status < 200 || status >= 300) return;
			exactRequestId = params.requestId;
		});
		if (typeof responseReceivedSubscription === "function") {
			disposeResponseReceived = () => responseReceivedSubscription();
		}
		const loadingFinishedSubscription: unknown = client.Network.loadingFinished(async (params) => {
			if (settled || !exactRequestId || params.requestId !== exactRequestId) return;
			const response = await withChatgptTimeout(
				client.Network.getResponseBody({ requestId: params.requestId }),
				CHATGPT_CONVERSATION_PAYLOAD_RESPONSE_BODY_TIMEOUT_MS,
				`Timed out reading ChatGPT fallback conversation payload response body for ${conversationId} after ${CHATGPT_CONVERSATION_PAYLOAD_RESPONSE_BODY_TIMEOUT_MS}ms.`,
			).catch(() => null);
			if (!response?.body) {
				finish(null);
				return;
			}
			finish({
				kind: "body",
				body: response.body,
				base64Encoded: response.base64Encoded ?? false,
			});
		});
		if (typeof loadingFinishedSubscription === "function") {
			disposeLoadingFinished = () => loadingFinishedSubscription();
		}
	});
	// Bind fallback acquisition to the admitted conversation route. Reloading
	// the current document is insufficient because ChatGPT can move the tab to
	// home before the fallback starts. The exact Network response is the payload
	// completion signal, so a pending Page.navigate acknowledgement must not gate
	// this read after responseReceived/loadingFinished deliver the complete body.
	recordBrowserScrapeCdpCall(options, "Page.navigate");
	recordBrowserScrapeProviderAction(options, "chatgpt.navigatePayloadRouteFallback");
	await navigateAndSettle(client, {
		url: resolveChatgptConversationUrl(conversationId, _projectId),
		forceNavigation: true,
		waitForDocumentReady: false,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(
			client,
			"provider:chatgpt",
			"fetch-conversation-api-payload-navigation",
		),
		completionSignal: bodyPromise.then((response) => ({
			ok: response !== null,
			reason: response ? undefined : "Exact conversation payload response not observed.",
		})),
	}).catch(() => {
		finishBody(null);
		return null;
	});
	const response = await bodyPromise;
	if (response?.kind === "terminal-unavailable") {
		throw createChatgptConversationUnavailableError(conversationId, response.status);
	}
	return parsePayloadBody(
		response?.kind === "body" ? response.body : null,
		response?.kind === "body" ? response.base64Encoded : false,
	);
}

function buildChatgptPayloadDirectRetryOptions(
	options?: BrowserProviderListOptions,
): BrowserProviderListOptions {
	return {
		...options,
		allowNavigation: false,
		preserveActiveTab: true,
	};
}

export const buildChatgptPayloadDirectRetryOptionsForTest = buildChatgptPayloadDirectRetryOptions;

export function normalizeChatgptConversationLinkProbes(
	probes: readonly ChatgptConversationLinkProbe[],
): Conversation[] {
	const normalizeTimestamp = (value: string | null | undefined): string | undefined => {
		if (typeof value !== "string" || value.trim().length === 0) return undefined;
		const timestamp = Date.parse(value);
		return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
	};
	const isGenericTitle = (value: string): boolean => {
		const normalized = normalizeUiText(value).toLowerCase();
		return normalized === "chatgpt" || normalized === "new chat";
	};
	const conversations = new Map<string, Conversation>();
	for (const probe of probes) {
		const id = typeof probe.id === "string" ? probe.id.trim() : "";
		if (!id) continue;
		const probeTitle = normalizeUiText(probe.title);
		const title = probeTitle && !isGenericTitle(probeTitle) ? probeTitle : id;
		const normalizedProjectId = normalizeChatgptProjectId(probe.projectId) ?? undefined;
		const url =
			typeof probe.url === "string" && probe.url.trim().length > 0 ? probe.url.trim() : undefined;
		const updatedAt = normalizeTimestamp(probe.updatedAt);
		const metadata =
			probe.metadata && typeof probe.metadata === "object" && !Array.isArray(probe.metadata)
				? probe.metadata
				: undefined;
		const next: Conversation = {
			id,
			title,
			provider: "chatgpt",
			...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
			...(url ? { url } : {}),
			...(updatedAt ? { updatedAt } : {}),
			...(metadata ? { metadata } : {}),
		};
		const previous = conversations.get(id);
		if (!previous) {
			conversations.set(id, next);
			continue;
		}
		const previousTitle = normalizeUiText(previous.title);
		const nextTitle = normalizeUiText(next.title);
		const useNext =
			(!previousTitle || previousTitle === previous.id) && nextTitle.length > 0
				? true
				: isGenericTitle(previousTitle) && nextTitle.length > 0 && !isGenericTitle(nextTitle)
					? true
					: previousTitle.length > 0 &&
							nextTitle.length > 0 &&
							previousTitle !== nextTitle &&
							previousTitle.startsWith(nextTitle)
						? true
						: Boolean(!previous.updatedAt && next.updatedAt) ||
							Boolean(!previous.metadata && next.metadata) ||
							Boolean(!previous.url && next.url) ||
							Boolean(!previous.projectId && next.projectId);
		if (useNext) {
			conversations.set(id, {
				...previous,
				...next,
				...(next.url ? { url: next.url } : previous.url ? { url: previous.url } : {}),
				...(next.projectId
					? { projectId: next.projectId }
					: previous.projectId
						? { projectId: previous.projectId }
						: {}),
				...(next.updatedAt
					? { updatedAt: next.updatedAt }
					: previous.updatedAt
						? { updatedAt: previous.updatedAt }
						: {}),
				...(next.metadata
					? { metadata: next.metadata }
					: previous.metadata
						? { metadata: previous.metadata }
						: {}),
			});
		}
	}
	return Array.from(conversations.values());
}

function buildProjectRouteExpression(projectId?: string): string {
	return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const normalized = rawId.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
    if (!normalized) return null;
    const id = normalized[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && id !== expected) return null;
    return { id, href: location.href, title: document.title };
  })()`;
}

function buildConversationRouteExpression(
	conversationId: string,
	projectId?: string | null,
): string {
	return `(() => {
    const match = location.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
    if (!match) return null;
    const rawProject = String(match[1] || '').trim();
    const rawConversationId = String(match[2] || '').trim();
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    if (rawConversationId !== expectedConversationId) return null;
    const normalizedProjectId = rawProject.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i)?.[1] ?? null;
    if (expectedProjectId && normalizedProjectId !== expectedProjectId) return null;
    return {
      conversationId: rawConversationId,
      projectId: normalizedProjectId,
      href: location.href,
      title: document.title,
    };
  })()`;
}

function buildConversationSurfaceReadyExpression(
	conversationId: string,
	projectId?: string | null,
): string {
	return `(() => {
    const route = (${buildConversationRouteExpression(conversationId, projectId)});
    if (!route) return null;
    const hasTurns = Boolean(
      document.querySelector(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}) ||
      document.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}),
    );
    const hasComposer = Boolean(
      document.querySelector(${JSON.stringify(CHATGPT_CONVERSATION_PROMPT_INPUT_SELECTOR)}) ||
      document.querySelector(${JSON.stringify(CHATGPT_CONVERSATION_RICH_PROMPT_INPUT_SELECTOR)}) ||
      document.querySelector('[data-testid="composer-plus-btn"]'),
    );
    return hasTurns || hasComposer ? route : null;
  })()`;
}

function _buildConversationTitleAppliedExpression(
	conversationId: string,
	expectedTitle: string,
	projectId?: string | null,
	_options?: {
		requireTopInRootList?: boolean;
	},
): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeDocumentTitle = (value) =>
      normalize(value)
        .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
        .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
        .trim();
    const expected = normalize(${JSON.stringify(expectedTitle)});
    if (!expected) return null;
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const normalizeProjectId = (value) => {
      const trimmed = String(value || '').trim();
      const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
      return match ? match[1] : null;
    };
    const parseConversationInfo = (href) => {
      try {
        const parsed = new URL(href, location.origin);
        const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
        if (!match) return null;
        return {
          id: String(match[2] || '').trim(),
          projectId: normalizeProjectId(match[1]),
        };
      } catch {
        return null;
      }
    };
    const findRowButtonLabel = (anchor) => {
      let current = anchor instanceof Element ? anchor : null;
      while (current && current !== document.body) {
        const button = Array.from(current.querySelectorAll('button[aria-label]'))
          .find((node) => {
            if (!(node instanceof HTMLButtonElement)) return false;
            if (!isVisible(node)) return false;
            const label = normalize(node.getAttribute('aria-label') || '');
            return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
          });
        if (button instanceof HTMLButtonElement) {
          const label = normalize(button.getAttribute('aria-label') || '');
          return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX)
            ? label.slice(CHATGPT_CONVERSATION_OPTIONS_PREFIX.length).trim()
            : label;
        }
        current = current.parentElement;
      }
      return '';
    };
    const buildProbe = (anchor) => {
        const href = anchor.getAttribute('href') || '';
        const info = parseConversationInfo(href);
        if (!info) return null;
        if (expectedProjectId && info.projectId !== expectedProjectId) return null;
        const rowLabel = findRowButtonLabel(anchor);
        const title =
          rowLabel ||
          normalize(anchor.getAttribute('aria-label') || '') ||
          normalize(anchor.textContent || '') ||
          normalize(anchor.getAttribute('title') || '') ||
          info.id;
        const rect = anchor.getBoundingClientRect();
        return {
          id: info.id,
          projectId: info.projectId,
          title,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          visible: isVisible(anchor),
        };
    };
    const collectAllAnchors = () =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => buildProbe(anchor))
        .filter(Boolean)
        .filter((probe) => probe.visible)
        .sort((left, right) => left.top - right.top || left.left - right.left);
    const collectProjectPanelAnchors = () =>
      Array.from(document.querySelectorAll('[role="tabpanel"]'))
        .filter((panel) => isVisible(panel))
        .flatMap((panel) => Array.from(panel.querySelectorAll('a[href]')))
        .map((anchor) => buildProbe(anchor))
        .filter(Boolean)
        .filter((probe) => probe.visible)
        .sort((left, right) => left.top - right.top || left.left - right.left);
    const probes =
      expectedProjectId
        ? (() => {
            const scoped = collectProjectPanelAnchors();
            return scoped.length > 0 ? scoped : collectAllAnchors();
          })()
        : collectAllAnchors();
    const matching = probes.find((probe) => probe.id === expectedConversationId && probe.title === expected) || null;
    const route = parseConversationInfo(location.href);
    const top = probes[0] || null;
    if (matching) {
      return {
        matchedConversationId: matching.id,
        matchedProjectId: matching.projectId ?? null,
        matchedTitle: matching.title,
        routeConversationId: route?.id ?? null,
        routeProjectId: route?.projectId ?? null,
        documentTitle: document.title,
        topConversationId: top?.id ?? null,
        topTitle: top?.title ?? null,
      };
    }
    if (
      !expectedProjectId &&
      route &&
      !route.projectId &&
      route.id === expectedConversationId &&
      normalizeDocumentTitle(document.title) === expected
    ) {
      return {
        matchedConversationId: null,
        matchedProjectId: null,
        matchedTitle: null,
        routeConversationId: route.id,
        routeProjectId: route.projectId ?? null,
        documentTitle: document.title,
        topConversationId: top?.id ?? null,
        topTitle: top?.title ?? null,
      };
    }
    return null;
  })()`;
}

function buildConversationRowActionReadyExpression(
	conversationId: string,
	projectId?: string | null,
): string {
	return `(() => {
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeDocumentTitle = (value) =>
      normalize(value)
        .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
        .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
        .trim();
    const normalizeProjectId = (value) => {
      const trimmed = String(value || '').trim();
      const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
      return match ? match[1] : null;
    };
    const parse = (href) => {
      try {
        const parsed = new URL(href, location.origin);
        const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
        if (!match) return null;
        return {
          conversationId: String(match[2] || '').trim(),
          projectId: normalizeProjectId(match[1]),
        };
      } catch {
        return null;
      }
    };
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const current = parse(location.href);
    if (!current || current.conversationId !== expectedConversationId || current.projectId !== expectedProjectId) {
      return null;
    }
    const currentTitle = normalizeDocumentTitle(document.title);
    if (!currentTitle) {
      return null;
    }
    const targetLabel = CHATGPT_CONVERSATION_OPTIONS_PREFIX + currentTitle;
    const count = Array.from(document.querySelectorAll('button[aria-label], button'))
      .filter((node) => node instanceof HTMLButtonElement)
      .filter((node) => isVisible(node))
      .filter((node) => normalize(node.getAttribute('aria-label') || '') === targetLabel)
      .length;
    return count > 0 ? { count, title: currentTitle } : null;
  })()`;
}

function buildConversationDeletedExpression(
	conversationId: string,
	projectId?: string | null,
): string {
	return `(() => {
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const parse = (href) => {
      try {
        const parsed = new URL(href, location.origin);
        const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
        if (!match) return null;
        return {
          projectId: String(match[1] || '').trim().match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i)?.[1] ?? null,
          conversationId: String(match[2] || '').trim(),
        };
      } catch {
        return null;
      }
    };
    const current = parse(location.href);
    if (
      current &&
      current.conversationId === expectedConversationId &&
      (!expectedProjectId || current.projectId === expectedProjectId)
    ) {
      return null;
    }
    const collectAnchors = () => {
      if (!expectedProjectId) {
        return Array.from(document.querySelectorAll('a[href]'));
      }
      const scoped = Array.from(document.querySelectorAll('[role="tabpanel"]'))
        .filter((panel) => isVisible(panel))
        .flatMap((panel) => Array.from(panel.querySelectorAll('a[href]')));
      return scoped.length > 0 ? scoped : Array.from(document.querySelectorAll('a[href]'));
    };
    const remaining = collectAnchors().some((anchor) => {
      const info = parse(anchor.getAttribute('href') || '');
      if (!info || info.conversationId !== expectedConversationId) return false;
      if (expectedProjectId && info.projectId !== expectedProjectId) return false;
      return true;
    });
    return remaining ? null : { ok: true, href: location.href };
  })()`;
}

function buildProjectRouteChangeExpression(initialProjectId?: string | null): string {
	return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const found = rawId.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
    if (!found) return null;
    const normalized = found[1];
    const initial = ${JSON.stringify(initialProjectId ?? null)};
    if (initial && normalized === initial) return null;
    return { id: normalized, href: location.href, title: document.title };
  })()`;
}

function buildProjectSurfaceReadyExpression(projectId?: string | null): string {
	return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll('button,[role="button"],a,[role="tab"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || node.textContent || ''))
      .filter(Boolean);
    const hasProjectControls =
      labels.some((label) => label.startsWith(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)) ||
      labels.includes(CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL) ||
      (labels.includes(CHATGPT_PROJECT_TAB_CHATS_LABEL) && labels.includes(CHATGPT_PROJECT_TAB_SOURCES_LABEL));
    return hasProjectControls ? { id: normalizedId, href: location.href, labels: labels.slice(0, 20) } : null;
  })()`;
}

function buildProjectSettingsReadyExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeLabel = (el) => {
      if (!(el instanceof Element)) return '';
      return normalize(
        el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('name') ||
          '',
      );
    };
    const hasProjectNameField = Array.from(document.querySelectorAll('input, textarea')).some((node) => {
      const label = normalizeLabel(node);
      return (
        label.includes('project name') ||
        label.includes(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL.toLowerCase())}) ||
        /projectname/i.test(node.getAttribute('name') || '')
      );
    });
    const hasProjectInstructionsField = Array.from(document.querySelectorAll('textarea')).some((node) => {
      const label = normalizeLabel(node);
      return (
        label.includes('instructions') ||
        label.includes(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL.toLowerCase())})
      );
    });
    const isSettingsDeleteButton = (button) =>
      normalize(button.textContent || '').includes('delete project') ||
      normalize(button.textContent || '') === CHATGPT_PROJECT_DELETE_BUTTON_LABEL;
    if (hasProjectNameField || hasProjectInstructionsField) {
      return { ok: true };
    }
    const dialogs = Array.from(document.querySelectorAll('dialog, [role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasNameInput = Boolean(dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)}));
      const hasInstructions = Boolean(dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)}));
      const hasTextInput = Boolean(dialog.querySelector('input, textarea'));
      const hasDelete = Array.from(dialog.querySelectorAll('button')).some(isSettingsDeleteButton);
      if (hasNameInput || hasInstructions || hasTextInput || hasDelete || text.includes(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

function buildProjectSourcesReadyExpression(projectId?: string | null): string {
	return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const queryTab = normalize(new URL(location.href).searchParams.get('tab'));
    const sourceTabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const tabLabels = sourceTabs.map((node) => normalize(node.textContent || node.getAttribute('aria-label') || ''));
    const sourceTab = sourceTabs.find((node) => {
      const id = String(node.getAttribute('id') || '');
      const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
      return id.endsWith('-sources') || label === CHATGPT_PROJECT_TAB_SOURCES_LABEL || label === 'sources';
    });
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
    const hasRows = rows.length > 0;
    const hasSourceTablist = document.querySelector('[role="tablist"] [role="tab"]') !== null;
    const hasAnyTab = sourceTabs.length > 0;
    const hasSourcesTab = Boolean(sourceTab) || tabLabels.includes(CHATGPT_PROJECT_TAB_SOURCES_LABEL) || tabLabels.includes('sources');
    const hasSourcesQuery =
      queryTab === ${JSON.stringify(CHATGPT_PROJECT_TAB_SOURCES_LABEL)} || queryTab === 'sources' || queryTab === 'project-sources';
    const isReady = (hasSourceTablist || hasAnyTab) && (hasSourcesQuery || hasSourcesTab || hasRows);
    return isReady ? {
      ok: true,
      id: normalizedId,
      href: location.href,
      hasAnyTab,
      hasRows,
      hasSourcesQuery,
      hasSourcesTab,
    } : null;
  })()`;
}

function buildProjectChatsReadyExpression(projectId?: string | null): string {
	return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const expectedChatsLabel = ${JSON.stringify(CHATGPT_PROJECT_TAB_CHATS_LABEL)};
    const chatTab = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === expectedChatsLabel);
    const chatTabSelected = Boolean(
      chatTab &&
      (chatTab.getAttribute('aria-selected') === 'true' || String(chatTab.getAttribute('data-state') || '').toLowerCase() === 'active')
    );
    const chatPanels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
    const chatPanel = chatPanels.find((panel) => {
      const labelledBy = String(panel.getAttribute('aria-labelledby') || '').toLowerCase();
      if (labelledBy.endsWith('-chats')) return true;
      const text = normalize(panel.textContent || '');
      return (
        Array.from(panel.querySelectorAll('a[href*="/c/"]')).length > 0 ||
        text.length > 0 ||
        text.includes('new chat') ||
        text.includes('search chats') ||
        text.includes('no chats')
      );
    });
    return chatTabSelected || chatPanel
      ? {
          ok: true,
          id: normalizedId,
          href: location.href,
          hasChatPanel: Boolean(chatPanel),
          hasConversationAnchors: Boolean(chatPanel?.querySelector('a[href*="/c/"]')),
        }
      : null;
  })()`;
}

function buildProjectSourcesUploadDialogReadyExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    const globalFileInput =
      Boolean(
        document.querySelector('input[type="file"]') ||
          document.querySelector('input[accept]') ||
          document.querySelector('input[data-testid="file-upload"]'),
      );
    const markerSet = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS)}.map((value) => normalize(value));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasInput = Boolean(
        dialog.querySelector('input[type="file"]') || dialog.querySelector('input[accept]') || dialog.querySelector('input[data-testid="file-upload"]'),
      );
      const uploadActionLabels = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS)}.map((value) => normalize(value));
      const hasUploadAction = Array.from(dialog.querySelectorAll('button,[role="button"],label'))
        .some((node) => {
          const text = normalize(node.textContent || node.getAttribute('aria-label') || '');
          return uploadActionLabels.some((label) => text.includes(label));
        });
      const hasUploadButton = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .some((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === CHATGPT_PROJECT_UPLOAD_BUTTON_LABEL);
      const hasUploadMarker = markerSet.some((marker) =>
        text.includes(marker),
      );
      if ((hasUploadAction || hasUploadButton || hasUploadMarker) && (hasInput || globalFileInput)) {
        return { ok: true };
      }
    }
    if (globalFileInput) {
      return { ok: true };
    }
    return null;
  })()`;
}

function buildProjectSourcesSnapshotExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const extractId = (value, prefix) => {
      const match = String(value || '').match(new RegExp('\\\\b' + prefix + '[A-Za-z0-9_]+\\\\b'));
      return match ? match[0] : '';
    };
    const readReactMetadata = (row) => {
      const nodes = [row, ...Array.from(row.querySelectorAll('*')).slice(0, 80)];
      for (const node of nodes) {
        const reactKey = Object.getOwnPropertyNames(node)
          .find((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        let fiber = reactKey ? node[reactKey] : null;
        for (let depth = 0; fiber && depth < 8; depth += 1) {
          const candidates = [fiber.memoizedProps, fiber.pendingProps].filter(Boolean);
          for (const props of candidates) {
            if (!props || typeof props !== 'object') continue;
            const providerFileId = normalize(props.fileId || props.file_id || props.providerFileId || '');
            const mimeType = normalize(props.mimeType || props.mime_type || '');
            const size = Number(props.size || props.fileSize || props.file_size || 0);
            if (providerFileId || mimeType || Number.isFinite(size) && size > 0) {
              return {
                providerFileId: providerFileId || null,
                mimeType: mimeType || null,
                size: Number.isFinite(size) && size > 0 ? size : null,
              };
            }
          }
          fiber = fiber.return;
        }
      }
      return null;
    };
    const panel = Array.from(document.querySelectorAll('[role="tabpanel"]'))
      .find((node) => String(node.getAttribute('aria-labelledby') || '').endsWith('-sources'));
    const scope = panel || document;
    const rows = Array.from(scope.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
    return rows.map((row) => {
      const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
        .map((node) => normalize(node.textContent || ''))
        .filter(Boolean)
        .slice(0, 24);
      const metadataText = leafTexts.find((text) => text.includes(' · ')) || null;
      const hrefs = Array.from(row.querySelectorAll('a[href]'))
        .map((node) => normalize(node.href || node.getAttribute('href') || ''))
        .filter(Boolean)
        .slice(0, 12);
      const testIds = Array.from(row.querySelectorAll('[data-testid]'))
        .map((node) => normalize(node.getAttribute('data-testid') || ''))
        .filter(Boolean)
        .slice(0, 24);
      const ariaLabels = Array.from(row.querySelectorAll('[aria-label]'))
        .map((node) => normalize(node.getAttribute('aria-label') || ''))
        .filter(Boolean)
        .slice(0, 24);
      const haystack = [
        row.getAttribute('data-testid') || '',
        row.getAttribute('aria-label') || '',
        row.textContent || '',
        ...hrefs,
        ...testIds,
        ...ariaLabels,
      ].join(' ');
      const reactMetadata = readReactMetadata(row);
      const providerFileId = reactMetadata?.providerFileId || extractId(haystack, 'file_') || null;
      return {
        rowText: normalize(row.textContent || ''),
        leafTexts,
        metadataText,
        hrefs,
        testIds,
        ariaLabels,
        providerFileId,
        mimeType: reactMetadata?.mimeType || null,
        size: reactMetadata?.size || null,
      };
    });
  })()`;
}

function buildProjectSourceNamesPresentExpression(fileNames: readonly string[]): string {
	return `(() => {
    const expected = ${JSON.stringify(fileNames)}.map((value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
    if (expected.length === 0) return { ok: true, names: [] };
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    const unique = Array.from(new Set(texts));
    const matches = expected.filter((name) => unique.some((text) => text === name || text.includes(name)));
    return matches.length === expected.length ? { ok: true, matches, names: unique.slice(0, 40) } : null;
  })()`;
}

function buildProjectSourceRemovedExpression(fileName: string): string {
	return `(() => {
    const expected = String(${JSON.stringify(fileName)} || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    return texts.some((text) => text === expected || text.includes(expected)) ? null : { ok: true };
  })()`;
}

export function buildChatgptAuthSessionIdentityExpression(): string {
	return `(async () => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = setTimeout(() => {
      try {
        controller?.abort();
      } catch {}
    }, 8000);
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        headers: { accept: 'application/json' },
        signal: controller?.signal,
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        user: data?.user
          ? {
              id: typeof data.user.id === 'string' ? data.user.id : null,
              name: typeof data.user.name === 'string' ? data.user.name : null,
              email: typeof data.user.email === 'string' ? data.user.email : null,
            }
          : null,
        account: data?.account
          ? {
              id: typeof data.account.id === 'string' ? data.account.id : null,
              name: typeof data.account.name === 'string' ? data.account.name : null,
              email: typeof data.account.email === 'string' ? data.account.email : null,
              planType: typeof data.account.planType === 'string' ? data.account.planType : null,
              structure: typeof data.account.structure === 'string' ? data.account.structure : null,
              organizationId: typeof data.account.organizationId === 'string' ? data.account.organizationId : null,
              isDelinquent: typeof data.account.isDelinquent === 'boolean' ? data.account.isDelinquent : null,
            }
          : null,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })()`;
}

async function waitForChatgptDisposableRootComposer(client: ChromeClient): Promise<void> {
	const ready = await waitForPredicate(
		client.Runtime,
		buildChatgptDisposableRootComposerExpression(),
		{ timeoutMs: 12_000, description: "fresh ChatGPT root composer" },
	);
	if (!ready.ok) {
		throw new Error("Fresh ChatGPT root tab did not expose one visible prompt composer.");
	}
}

export function buildChatgptDisposableRootComposerExpression(): string {
	return `(() => {
      if (location.origin !== 'https://chatgpt.com' || location.pathname !== '/') return false;
      const editor = document.querySelector(
        '#prompt-textarea, textarea[name="prompt-textarea"], form[data-chatgpt-composer] .ProseMirror'
      );
      if (!(editor instanceof HTMLElement)) return false;
      if (editor.matches('.ProseMirror') && !editor.closest('form[data-chatgpt-composer]')) return false;
      const rect = editor.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })()`;
}

function buildChatgptFallbackIdentityExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').trim();
    const bootstrap = document.querySelector('script#client-bootstrap[type="application/json"]');
    if (bootstrap) {
      try {
        const data = JSON.parse(bootstrap.textContent || 'null');
        const session = data?.authStatus === 'logged_in' && data?.session && typeof data.session === 'object'
          ? data.session
          : null;
        const user = session?.user && typeof session.user === 'object' ? session.user : null;
        const account = session?.account && typeof session.account === 'object' ? session.account : null;
        if (user || account) {
          return {
            user: user
              ? {
                  id: typeof user.id === 'string' ? user.id : null,
                  name: typeof user.name === 'string' ? user.name : null,
                  email: typeof user.email === 'string' ? user.email : null,
                }
              : null,
            account: account
              ? {
                  id: typeof account.id === 'string' ? account.id : null,
                  name: typeof account.name === 'string' ? account.name : null,
                  email: typeof account.email === 'string' ? account.email : null,
                  planType: typeof account.planType === 'string' ? account.planType : null,
                  structure: typeof account.structure === 'string' ? account.structure : null,
                  organizationId: typeof account.organizationId === 'string' ? account.organizationId : null,
                }
              : null,
          };
        }
      } catch {}
    }
    const storageKeys = Object.keys(window.localStorage || {});
    const userKey = storageKeys.find((key) => /(?:^|\\/)user-[A-Za-z0-9]+/.test(key)) || '';
    const idMatch = userKey.match(/(user-[A-Za-z0-9]+)/);
    const profileTrigger = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || ''))
      .find((label) => /open profile menu$/i.test(label) && label.toLowerCase() !== 'open profile menu');
    const name = profileTrigger ? profileTrigger.replace(/,?\\s*open profile menu$/i, '').trim() : '';
    return {
      user: {
        id: idMatch ? idMatch[1] : null,
        name: name || null,
        email: null,
      },
      account: null,
    };
  })()`;
}

export const buildChatgptFallbackIdentityExpressionForTest = buildChatgptFallbackIdentityExpression;

function buildProjectDeleteConfirmationExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const deleteDialogLabel = normalize(${JSON.stringify(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)});
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const labels = Array.from(dialog.querySelectorAll('button'))
        .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
        .filter(Boolean);
      if (
        text.includes(deleteDialogLabel) &&
        ${JSON.stringify(CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS)}.every((label) => labels.includes(label))
      ) {
        return { ok: true };
      }
    }
    return null;
	})()`;
}

function buildChatgptUrlRouteExpression(url: string): string {
	const expected = new URL(url);
	return `(() => {
		const expectedOrigin = ${JSON.stringify(expected.origin)};
		const expectedPathname = ${JSON.stringify(expected.pathname)};
		if (location.origin !== expectedOrigin || location.pathname !== expectedPathname) return null;
		return { href: location.href, title: document.title };
	})()`;
}

export const buildChatgptUrlRouteExpressionForTest = buildChatgptUrlRouteExpression;

function recordChatgptTargetSession(
	options: BrowserProviderListOptions | undefined,
	phase: "attach" | "retain" | "reuse",
	targetId: string | undefined,
): void {
	if (!targetId) return;
	const fingerprint = createHash("sha256").update(targetId).digest("hex").slice(0, 12);
	recordBrowserScrapeNote(options, `chatgpt.target.${phase}:${fingerprint}`);
}

export const recordChatgptTargetSessionForTest = recordChatgptTargetSession;

function bindChatgptProviderSessionConnection<
	T extends {
		targetId?: string;
		host: string;
		port: number;
	},
>(options: BrowserProviderListOptions | undefined, connection: T): T {
	const authorization = options?.providerSessionAuthorization;
	if (!authorization || !connection.targetId) return connection;
	authorization.context = {
		...authorization.context,
		browserTargetId: connection.targetId,
		devtoolsHost: connection.host,
		devtoolsPort: connection.port,
	};
	return connection;
}

export const bindChatgptProviderSessionConnectionForTest = bindChatgptProviderSessionConnection;

export async function selectChatgptPromptWorkbenchTargetForTest<
	T extends { targetId?: string | null; id?: string | null },
>(
	candidates: readonly T[],
	preferredTargetId: string | undefined,
	readiness: (candidate: T) => Promise<boolean>,
): Promise<T | undefined> {
	const ordered = preferredTargetId
		? [
				...candidates.filter(
					(candidate) => resolveChatgptTargetId(candidate) === preferredTargetId,
				),
				...candidates.filter(
					(candidate) => resolveChatgptTargetId(candidate) !== preferredTargetId,
				),
			]
		: [...candidates];
	for (const candidate of ordered) {
		if (await readiness(candidate)) return candidate;
	}
	return undefined;
}

async function chatgptTargetHasVisiblePromptWorkbench(
	host: string,
	port: number,
	target: { targetId?: string | null; id?: string | null },
): Promise<boolean> {
	const targetId = resolveChatgptTargetId(target);
	if (!targetId) return false;
	const client = await connectToChromeTarget({ host, port, target: targetId }).catch(() => null);
	if (!client) return false;
	try {
		return await prepareChatgptPromptWorkbenchTargetForTest(client);
	} catch {
		return false;
	} finally {
		await client.close().catch(() => undefined);
	}
}

export async function prepareChatgptPromptWorkbenchTargetForTest(
	client: ChromeClient,
): Promise<boolean> {
	await client.Page.enable();
	await client.Page.bringToFront();
	await client.Runtime.enable();
	const result = await client.Runtime.evaluate({
		expression: `(() => {
		const editor = document.querySelector('#prompt-textarea, textarea[name="prompt-textarea"]');
        if (!(editor instanceof HTMLElement)) return false;
        const rect = editor.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`,
		returnByValue: true,
	});
	return result.result?.value === true;
}

async function connectToChatgptTab(
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
	let failedTargetId: string | undefined;
	const preferredUrl = urlOverride ?? options?.configuredUrl ?? CHATGPT_HOME_URL;
	const forceNewDisposableTab = shouldForceNewChatgptTabConnection(options);
	recordBrowserScrapeProviderAction(options, "chatgpt.connectTab.start");
	if (port) {
		const scopedConnection = readChatgptScopedSession(
			options,
			buildChatgptScopedSessionKey(host, port, preferredUrl),
		);
		if (scopedConnection) {
			recordBrowserScrapeProviderAction(options, "chatgpt.reuseScopedTarget");
			recordChatgptTargetSession(options, "reuse", scopedConnection.targetId);
			return bindChatgptProviderSessionConnection(options, {
				...scopedConnection,
				shouldClose: false,
				usedExisting: true,
				borrowedFromSession: true,
			});
		}
	}
	if (options?.tabTargetId && port) {
		let exactTargetClient: ChromeClient | null = null;
		try {
			recordBrowserScrapeCdpCall(options, "Target.attachToTarget");
			recordBrowserScrapeProviderAction(options, "chatgpt.connectExistingTarget");
			const client = await connectToChromeTarget({
				host,
				port,
				target: options.tabTargetId,
				abortSignal: options.abortSignal,
			});
			exactTargetClient = client;
			await waitForChatgptOperationWithAbort(
				enableChatgptTargetDomains(client, options.tabTargetId, options),
				options.abortSignal,
			);
			await annotateClientMutationContext(client, options, "provider:chatgpt", options.tabTargetId);
			setClientSuppressFocus(client, resolveBrowserTabPolicy(options).suppressFocus);
			await waitForChatgptOperationWithAbort(
				dismissCreateProjectDialogIfOpen(client.Runtime),
				options.abortSignal,
			).catch(() => undefined);
			options.abortSignal?.throwIfAborted();
			const currentUrl = await waitForChatgptOperationWithAbort(
				readChatgptLocationHref(client.Runtime),
				options.abortSignal,
			).catch(() => null);
			options.abortSignal?.throwIfAborted();
			if (!isChatgptTargetReusableForPreferredUrl(currentUrl, preferredUrl)) {
				if (!shouldNavigateExactChatgptTargetForTest(currentUrl, preferredUrl, options)) {
					throw new Error(
						`ChatGPT target ${options.tabTargetId} is on ${currentUrl ?? "(unknown URL)"}, not the expected ${preferredUrl}.`,
					);
				}
				await navigateToChatgptUrl(client, preferredUrl, undefined, options);
			}
			const connection = {
				client,
				targetId: options.tabTargetId,
				shouldClose: false,
				host,
				port,
				usedExisting: true,
			};
			recordChatgptTargetSession(options, "attach", connection.targetId);
			retainChatgptScopedSession(
				options,
				buildChatgptScopedSessionKey(host, port, preferredUrl),
				connection,
			);
			recordChatgptTargetSession(options, "retain", connection.targetId);
			return bindChatgptProviderSessionConnection(options, connection);
		} catch (error) {
			if (exactTargetClient) {
				await withChatgptTimeout(
					exactTargetClient.close(),
					CHATGPT_CDP_CLOSE_TIMEOUT_MS,
					`Timed out closing the rejected ChatGPT CDP client after ${CHATGPT_CDP_CLOSE_TIMEOUT_MS}ms.`,
				).catch(() => undefined);
			}
			if (!providerNavigationAllowed(options) || options.tabTargetId) {
				throw error;
			}
			failedTargetId = options.tabTargetId;
			// Fall back to rescanning below when the previously resolved target id went stale.
		}
	}

	const serviceResolver = options?.browserService as
		| (import("../service/browserService.js").BrowserService & {
				resolveServiceTarget?: (options: {
					serviceId: "chatgpt";
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
	const hasExplicitEndpoint = options?.port !== undefined || options?.host !== undefined;
	if (!hasExplicitEndpoint && serviceResolver?.resolveServiceTarget) {
		const target = await serviceResolver.resolveServiceTarget({
			serviceId: "chatgpt",
			configuredUrl: preferredUrl,
			ensurePort: true,
		});
		host = target.host ?? host;
		port = target.port ?? port;
		resolvedTargetIdFromService = forceNewDisposableTab
			? undefined
			: resolveChatgptTargetId(target.tab);
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
			"Missing DevTools port. Launch a ChatGPT browser session or set AURACALL_BROWSER_PORT.",
		);
	}

	const resolvedPort = port;
	const sessionKey = buildChatgptScopedSessionKey(host, resolvedPort, preferredUrl);
	const scopedConnection = readChatgptScopedSession(options, sessionKey);
	if (scopedConnection) {
		recordBrowserScrapeProviderAction(options, "chatgpt.reuseScopedTarget");
		recordChatgptTargetSession(options, "reuse", scopedConnection.targetId);
		return bindChatgptProviderSessionConnection(options, {
			...scopedConnection,
			shouldClose: false,
			usedExisting: true,
			borrowedFromSession: true,
		});
	}
	const targets = await listChatgptChromeTargets(host, resolvedPort);
	const candidates = forceNewDisposableTab
		? []
		: targets.filter(
				(target) =>
					target.type === "page" &&
					isChatgptUrl(target.url ?? "") &&
					isChatgptTargetReusableForPreferredUrl(target.url ?? "", preferredUrl) &&
					resolveChatgptTargetId(target) !== failedTargetId,
			);
	const serviceResolved = resolvedTargetIdFromService
		? candidates.find((target) => resolveChatgptTargetId(target) === resolvedTargetIdFromService)
		: undefined;
	recordBrowserScrapeCandidateCount(options, "chatgpt.reusableTargets", candidates.length);
	let targetInfo = options?.requirePromptWorkbenchTarget
		? await selectChatgptPromptWorkbenchTargetForTest(
				candidates,
				resolvedTargetIdFromService,
				(candidate) => chatgptTargetHasVisiblePromptWorkbench(host, resolvedPort, candidate),
			)
		: (serviceResolved ?? candidates[0]);
	let shouldClose = false;
	let usedExisting = Boolean(resolveChatgptTargetId(targetInfo));
	const tabPolicy = resolveBrowserTabPolicy(options);

	if (!targetInfo) {
		if (options?.requireExistingTarget) {
			throw new Error(`No existing ChatGPT target matches ${preferredUrl}.`);
		}
		recordBrowserScrapeCdpCall(options, "Target.createTarget");
		recordBrowserScrapeProviderAction(options, "chatgpt.openTarget");
		const opened = await openOrReuseChromeTarget(resolvedPort, preferredUrl, {
			host,
			reusePolicy:
				failedTargetId ||
				forceNewDisposableTab ||
				!extractChatgptConversationIdFromUrl(preferredUrl)
					? "new"
					: "same-origin",
			compatibleHosts: CHATGPT_COMPATIBLE_HOSTS,
			matchingTabLimit: tabPolicy.serviceTabLimit,
			blankTabLimit: tabPolicy.blankTabLimit,
			collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
			cleanupExistingTargets: !forceNewDisposableTab,
			suppressFocus: tabPolicy.suppressFocus,
			mutationAudit: resolveMutationAudit(options),
			providerTrafficGovernor: resolveProviderTrafficGovernor(options),
			providerTrafficAuthorityFactory: options?.providerTrafficAuthorityFactory,
			providerTrafficRequired:
				options?.providerTrafficRequired === true ||
				resolveProviderTrafficGovernor(options) !== undefined,
			mutationSource: resolveMutationSource(options, "provider:chatgpt", "connect-tab"),
		});
		targetInfo = opened.target ?? undefined;
		shouldClose = !opened.reused;
		usedExisting = opened.reused;
	}

	const targetId = resolveChatgptTargetId(targetInfo);
	if (!targetId) {
		throw new Error("No ChatGPT tab found. Launch a ChatGPT browser session and retry.");
	}
	let client = await connectToChromeTarget({ host, port: resolvedPort, target: targetId });
	recordBrowserScrapeProviderAction(options, "chatgpt.connectTab.attached");
	recordBrowserScrapeCdpCall(options, "Target.attachToTarget");
	let resolvedTargetId = targetId;
	try {
		await enableChatgptTargetDomains(client, resolvedTargetId, options);
	} catch (error) {
		await client.close().catch(() => undefined);
		if (!options?.tabTargetId && providerNavigationAllowed(options)) {
			recordBrowserScrapeCdpCall(options, "Target.createTarget");
			recordBrowserScrapeProviderAction(options, "chatgpt.openTargetAfterAttachFailure");
			const opened = await openOrReuseChromeTarget(resolvedPort, preferredUrl, {
				host,
				reusePolicy: "new",
				cleanupExistingTargets: false,
				mutationAudit: resolveMutationAudit(options),
				providerTrafficGovernor: resolveProviderTrafficGovernor(options),
				providerTrafficAuthorityFactory: options?.providerTrafficAuthorityFactory,
				providerTrafficRequired:
					options?.providerTrafficRequired === true ||
					resolveProviderTrafficGovernor(options) !== undefined,
				mutationSource: resolveMutationSource(options, "provider:chatgpt", "recover-attach-target"),
			});
			const freshTargetId = resolveChatgptTargetId(opened.target);
			if (freshTargetId) {
				client = await connectToChromeTarget({ host, port: resolvedPort, target: freshTargetId });
				recordBrowserScrapeCdpCall(options, "Target.attachToTarget");
				resolvedTargetId = freshTargetId;
				await enableChatgptTargetDomains(client, resolvedTargetId, options);
			} else {
				throw error;
			}
		} else {
			throw error;
		}
	}
	await annotateClientMutationContext(client, options, "provider:chatgpt", resolvedTargetId);
	setClientSuppressFocus(client, tabPolicy.suppressFocus);
	await dismissCreateProjectDialogIfOpen(client.Runtime).catch(() => undefined);
	const connection = {
		client,
		targetId: resolvedTargetId,
		shouldClose,
		host,
		port: resolvedPort,
		usedExisting,
	};
	recordChatgptTargetSession(options, "attach", connection.targetId);
	retainChatgptScopedSession(options, sessionKey, connection);
	recordChatgptTargetSession(options, "retain", connection.targetId);
	recordBrowserScrapeProviderAction(options, "chatgpt.connectTab.ready");
	return bindChatgptProviderSessionConnection(options, connection);
}

export function shouldNavigateExactChatgptTargetForTest(
	currentUrl: string | null,
	preferredUrl: string,
	options?: BrowserProviderListOptions,
): boolean {
	return (
		Boolean(options?.tabTargetId) &&
		providerNavigationAllowed(options) &&
		!isChatgptTargetReusableForPreferredUrl(currentUrl, preferredUrl)
	);
}

export async function connectToChatgptPromptWorkbenchForSkills(
	options: BrowserProviderListOptions,
): Promise<{ client: ChromeClient; port: number }> {
	const connection = await connectToChatgptTab(
		{
			...options,
			configuredUrl: CHATGPT_HOME_URL,
			preserveActiveTab: true,
			requirePromptWorkbenchTarget: true,
			tabLifecycle: "retain-new",
		},
		CHATGPT_HOME_URL,
	);
	return { client: connection.client, port: connection.port };
}

type ChatgptTabConnection = Awaited<ReturnType<typeof connectToChatgptTab>>;
type ChatgptScopedTabSessionValue = {
	connection: ChatgptTabConnection;
};

function shouldDisposeChatgptTabConnection(
	connection: Pick<ChatgptTabConnection, "shouldClose" | "targetId">,
	options?: BrowserProviderListOptions,
): boolean {
	if (options?.tabLifecycle !== "dispose-new") return false;
	if (options.preserveActiveTab === true) return false;
	if (options.tabTargetId) return false;
	return Boolean(connection.shouldClose && connection.targetId);
}

async function closeChatgptTabConnection(
	connection: Pick<
		ChatgptTabConnection,
		"client" | "targetId" | "shouldClose" | "host" | "port" | "borrowedFromSession"
	>,
	options?: BrowserProviderListOptions,
): Promise<"settled" | "timed-out"> {
	if (connection.borrowedFromSession) return "settled";
	const retainedSession = options?.providerSession?.value as
		| Partial<ChatgptScopedTabSessionValue>
		| undefined;
	if (options?.useProviderSession && retainedSession?.connection === connection) return "settled";
	let closeFailure: unknown;
	const closeStatus = await waitForChatgptCleanup(
		connection.client.close().catch((error: unknown) => {
			closeFailure = error;
		}),
		CHATGPT_CDP_CLOSE_TIMEOUT_MS,
	);
	if (resolveProviderTrafficGovernor(connection.client)?.admitBackendRequest) {
		if (closeStatus === "timed-out")
			throw new OwnedBackendRequestCleanupError(
				new Error("Owned backend request client cleanup timed out."),
			);
		if (closeFailure) throw closeFailure;
	}
	if (!shouldDisposeChatgptTabConnection(connection, options)) {
		return closeStatus;
	}
	await CDP.Close({
		host: connection.host,
		port: connection.port,
		id: connection.targetId as string,
	}).catch(() => undefined);
	return closeStatus;
}

export const closeChatgptTabConnectionForTest = closeChatgptTabConnection;
export const shouldDisposeChatgptTabConnectionForTest = shouldDisposeChatgptTabConnection;

function bindChatgptAbortCleanup(
	connection: ChatgptTabConnection,
	options?: BrowserProviderListOptions,
): (() => void) & { cleanupStarted: () => boolean; waitForCleanup: () => Promise<void> } {
	const signal = options?.abortSignal;
	let cleanupPromise: Promise<void> | null = null;
	const closeAbortedConnection = () => {
		if (cleanupPromise) return;
		recordLibraryInventoryCleanupPhase(options, "abort-cleanup-started");
		cleanupPromise = closeAbortedChatgptTabConnection(connection, options).then((status) => {
			recordLibraryInventoryCleanupPhase(
				options,
				status === "timed-out" ? "abort-cleanup-timed-out" : "abort-cleanup-settled",
			);
		});
		// The abort listener cannot await; the read path still observes the original promise.
		void cleanupPromise.catch(() => undefined);
	};
	const unbind = (() => {
		if (signal) signal.removeEventListener("abort", closeAbortedConnection);
	}) as (() => void) & { cleanupStarted: () => boolean; waitForCleanup: () => Promise<void> };
	unbind.cleanupStarted = () => cleanupPromise !== null;
	unbind.waitForCleanup = () => cleanupPromise ?? Promise.resolve();
	if (!signal) return unbind;
	signal.addEventListener("abort", closeAbortedConnection, { once: true });
	if (signal.aborted) closeAbortedConnection();
	return unbind;
}

async function closeAbortedChatgptTabConnection(
	connection: ChatgptTabConnection,
	options?: BrowserProviderListOptions,
): Promise<"settled" | "timed-out"> {
	const providerSession = options?.providerSession;
	const retainedConnection = (
		providerSession?.value as Partial<ChatgptScopedTabSessionValue> | null | undefined
	)?.connection;
	if (
		options?.useProviderSession &&
		providerSession?.providerId === "chatgpt" &&
		(connection.borrowedFromSession || retainedConnection === connection)
	) {
		options.providerSession = undefined;
		let closeFailure: unknown;
		let closeFailed = false;
		const status = await waitForChatgptCleanup(
			Promise.resolve()
				.then(() => providerSession.close())
				.catch((error: unknown) => {
					closeFailed = true;
					closeFailure = error;
				}),
			CHATGPT_CDP_CLOSE_TIMEOUT_MS,
		);
		if (options.providerTrafficGovernor?.admitBackendRequest) {
			if (status === "timed-out")
				throw new OwnedBackendRequestCleanupError(
					new Error("Owned backend request retained-session cleanup timed out."),
				);
			if (closeFailed) throw new OwnedBackendRequestCleanupError(closeFailure);
		}
		return status;
	}
	return closeChatgptTabConnection(connection, options);
}

export const bindChatgptAbortCleanupForTest = bindChatgptAbortCleanup;

async function runWithChatgptAbortBoundConnection<T>(
	connection: ChatgptTabConnection,
	options: BrowserProviderListOptions | undefined,
	read: (client: ChromeClient) => Promise<T>,
): Promise<T> {
	const unbindAbortCleanup = bindChatgptAbortCleanup(connection, options);
	let result: { ok: true; value: T } | { ok: false; error: unknown };
	let cleanupFailed = false;
	let cleanupFailure: unknown;
	try {
		options?.abortSignal?.throwIfAborted();
		result = {
			ok: true,
			value: await waitForChatgptOperationWithAbort(read(connection.client), options?.abortSignal),
		};
	} catch (error) {
		result = { ok: false, error };
		recordLibraryInventoryCleanupPhase(options, "read-rejected");
	} finally {
		const cleanupStarted = unbindAbortCleanup.cleanupStarted();
		unbindAbortCleanup();
		try {
			if (cleanupStarted) await unbindAbortCleanup.waitForCleanup();
			else await closeChatgptTabConnection(connection, options);
		} catch (error) {
			cleanupFailed = true;
			cleanupFailure = error;
		}
	}
	if (cleanupFailed) {
		if (!result.ok)
			throw new AggregateError(
				[result.error, cleanupFailure],
				"ChatGPT provider read and cleanup failed.",
			);
		throw cleanupFailure;
	}
	if (!result.ok) throw result.error;
	return result.value;
}

export const runWithChatgptAbortBoundConnectionForTest = runWithChatgptAbortBoundConnection;

function shouldForceNewChatgptTabConnection(options?: BrowserProviderListOptions): boolean {
	if (options?.tabLifecycle !== "dispose-new" && options?.tabLifecycle !== "retain-new") {
		return false;
	}
	if (options.preserveActiveTab === true) return false;
	if (options.tabTargetId) return false;
	return true;
}

export const shouldForceNewChatgptTabConnectionForTest = shouldForceNewChatgptTabConnection;

function buildChatgptScopedSessionKey(host: string, port: number, preferredUrl: string): string {
	return `chatgpt:${host}:${port}:${preferredUrl}`;
}

function readChatgptScopedSession(
	options: BrowserProviderListOptions | undefined,
	key: string,
): ChatgptTabConnection | null {
	const session = options?.providerSession;
	if (!options?.useProviderSession || !session) return null;
	if (session.providerId !== "chatgpt" || session.key !== key) return null;
	const value = session.value as Partial<ChatgptScopedTabSessionValue> | null;
	return value?.connection ?? null;
}

function retainChatgptScopedSession(
	options: BrowserProviderListOptions | undefined,
	key: string,
	connection: ChatgptTabConnection,
): void {
	if (!options?.useProviderSession || options.providerSession) return;
	options.providerSession = {
		providerId: "chatgpt",
		key,
		value: { connection } satisfies ChatgptScopedTabSessionValue,
		close: async () => {
			options.providerSession = undefined;
			await closeChatgptTabConnection(connection, {
				...options,
				useProviderSession: false,
			});
		},
	};
	recordBrowserScrapeProviderAction(options, "chatgpt.retainScopedTarget");
}

async function enableChatgptTargetDomains(
	client: ChromeClient,
	targetId?: string,
	options?: BrowserProviderListOptions,
): Promise<void> {
	recordBrowserScrapeCdpCall(options, "Page.enable");
	recordBrowserScrapeCdpCall(options, "Runtime.enable");
	await withChatgptTimeout(
		Promise.all([client.Page.enable(), client.Runtime.enable()]).then(() => undefined),
		CHATGPT_CDP_LIST_TIMEOUT_MS,
		`Timed out enabling ChatGPT page target${targetId ? ` ${targetId}` : ""}; the Chrome endpoint is alive but the selected page target is unresponsive.`,
	);
}

async function readChatgptLocationHref(Runtime: ChromeClient["Runtime"]): Promise<string | null> {
	const { result } = await Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	return typeof result?.value === "string" && result.value.trim() ? result.value : null;
}

async function readSubmittedChatgptLocation(
	Runtime: ChromeClient["Runtime"],
	targetUrl: string,
	options: { abortSignal?: AbortSignal; timeoutMs?: number | null },
): Promise<string | null> {
	let lastUrl = await readChatgptLocationHref(Runtime).catch(() => null);
	if (lastUrl && extractChatgptConversationIdFromUrl(lastUrl)) return lastUrl;
	if (extractChatgptConversationIdFromUrl(targetUrl)) return lastUrl ?? targetUrl;
	const timeoutMs =
		typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
			? Math.max(0, Math.min(options.timeoutMs, 15_000))
			: 15_000;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		options.abortSignal?.throwIfAborted();
		const observedUrl = await readChatgptLocationHref(Runtime).catch(() => null);
		if (observedUrl) lastUrl = observedUrl;
		if (lastUrl && extractChatgptConversationIdFromUrl(lastUrl)) return lastUrl;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return lastUrl ?? targetUrl;
}

type ChatgptCreateProjectDialogState = {
	present?: boolean;
	projectName?: string | null;
	title?: string | null;
	url?: string | null;
	closeButtonLabels?: string[];
	textSample?: string | null;
};

function buildChatgptCreateProjectDialogStateExpression(): string {
	return `(() => {
    const rootSelectors = ${JSON.stringify(CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS)};
    const nameInputSelector = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)};
    const createProjectLabel = 'create project';
    const projectNameLabel = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL)};
    const settingsLabel = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)};
    const instructionsLabel = ${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL)};
    const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const isCreateProjectDialog = (dialog) => {
      if (!(dialog instanceof Element)) return false;
      if (!isVisible(dialog)) return false;
      const input = dialog.querySelector(nameInputSelector);
      if (input && isVisible(input)) return true;
      const text = normalize(dialog.textContent);
      return text.includes(createProjectLabel) && (
        text.includes(normalize(projectNameLabel)) ||
        text.includes(settingsLabel) ||
        text.includes(normalize(instructionsLabel))
      );
    };
    const roots = rootSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((dialog, index, array) => array.indexOf(dialog) === index);
    const createDialog = roots.find(isCreateProjectDialog);
    if (!createDialog) {
      return { present: false, url: window.location.href, title: document.title };
    }
    const nameInput = createDialog.querySelector(nameInputSelector);
    const projectName = nameInput && 'value' in nameInput ? String(nameInput.value || '') : null;
    const closeButtonLabels = Array.from(createDialog.querySelectorAll('button,[role="button"]'))
      .map((node) => String(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);
    return {
      present: true,
      projectName,
      closeButtonLabels,
      textSample: String(createDialog.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
      url: window.location.href,
      title: document.title,
    };
  })()`;
}

async function readCreateProjectDialogState(
	Runtime: ChromeClient["Runtime"],
): Promise<ChatgptCreateProjectDialogState> {
	const { result } = await Runtime.evaluate({
		expression: buildChatgptCreateProjectDialogStateExpression(),
		returnByValue: true,
	});
	return (result?.value as ChatgptCreateProjectDialogState | undefined) ?? { present: false };
}

async function dismissCreateProjectDialogIfOpen(
	Runtime: ChromeClient["Runtime"],
	options?: { strict?: boolean; source?: string },
): Promise<ChatgptCreateProjectDialogState> {
	const before = await readCreateProjectDialogState(Runtime);
	if (!before.present) {
		return before;
	}
	await Runtime.evaluate({
		expression: `(() => {
      const rootSelectors = ${JSON.stringify(CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS)};
      const nameInputSelector = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const isCreateProjectDialog = (dialog) => {
        if (!(dialog instanceof Element)) return false;
        if (!isVisible(dialog)) return false;
        const input = dialog.querySelector(nameInputSelector);
        if (input && isVisible(input)) return true;
        const text = normalize(dialog.textContent);
        return text.includes('create project') && (
          text.includes(normalize(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL)})) ||
          text.includes(${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)}) ||
          text.includes(normalize(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL)}))
        );
      };
      const dialog = rootSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find(isCreateProjectDialog);
      if (!dialog) return { ok: false, reason: 'dialog-missing' };
      const closeButton = Array.from(dialog.querySelectorAll('button,[role="button"]')).find((node) => {
        const label = normalize(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '');
        return label === 'close' || label.includes('close');
      });
      if (closeButton instanceof HTMLElement) {
        closeButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 }));
        closeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
        closeButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 0 }));
        closeButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
        closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      const escapeInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
      for (const target of [document.activeElement, document.body, document, window]) {
        if (target && typeof target.dispatchEvent === 'function') {
          target.dispatchEvent(new KeyboardEvent('keydown', escapeInit));
          target.dispatchEvent(new KeyboardEvent('keyup', escapeInit));
        }
      }
      return { ok: true, clickedClose: Boolean(closeButton) };
    })()`,
		returnByValue: true,
	});
	await waitForPredicate(
		Runtime,
		`(() => {
      const state = ${buildChatgptCreateProjectDialogStateExpression()};
      return state.present ? null : { ok: true };
    })()`,
		{
			timeoutMs: 1500,
			description: "ChatGPT create-project dialog dismissed",
		},
	).catch(() => undefined);
	const after = await readCreateProjectDialogState(Runtime);
	if (after.present && options?.strict) {
		const name = normalizeUiText(after.projectName);
		const label = options.source ? ` during ${options.source}` : "";
		throw new Error(
			`Stale ChatGPT create-project dialog${label} could not be dismissed` +
				`${name ? ` (project name: ${name})` : ""}.`,
		);
	}
	return after.present ? after : before;
}

async function ensureChatgptSidebarOpen(
	client: ChromeClient,
	openSidebar: () => Promise<{ ok: boolean }> = () =>
		pressButton(client.Runtime, {
			match: { exact: [CHATGPT_OPEN_SIDEBAR_LABEL] },
			requireVisible: true,
			timeoutMs: 2000,
		}),
): Promise<void> {
	let sidebarReady = false;
	try {
		sidebarReady = (
			await waitForPredicate(
				client.Runtime,
				`(() => {
      const sidebarMarkers = [
        ...Array.from(document.querySelectorAll('button,a,[role="button"]'))
          .map((node) => String(node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()),
      ];
      return (
        sidebarMarkers.includes(${JSON.stringify(CHATGPT_NEW_PROJECT_LABEL)}) ||
        sidebarMarkers.includes(${JSON.stringify(CHATGPT_PROJECTS_LABEL)})
      ) ? { ok: true } : null;
    })()`,
				{
					timeoutMs: 800,
					description: CHATGPT_SIDEBAR_READINESS_DESCRIPTION,
				},
			)
		).ok;
	} catch (error) {
		if (!isChatgptSidebarReadinessProbeTimeout(error)) throw error;
	}
	if (sidebarReady) return;
	const opened = await openSidebar();
	if (!opened.ok) {
		return;
	}
	await waitForPredicate(
		client.Runtime,
		`(() => Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .some((node) => {
        const label = String(node.textContent || node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        return label === ${JSON.stringify(CHATGPT_NEW_PROJECT_LABEL)} || label === ${JSON.stringify(CHATGPT_PROJECTS_LABEL)};
      }) || null)()`,
		{ timeoutMs: 3000 },
	);
}

export const ensureChatgptSidebarOpenForTest = ensureChatgptSidebarOpen;

function isChatgptSidebarReadinessProbeTimeout(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const prefix = `Timed out waiting for ${CHATGPT_SIDEBAR_READINESS_DESCRIPTION} after `;
	if (!error.message.startsWith(prefix) || !error.message.endsWith("ms.")) return false;
	return /^\d+$/.test(error.message.slice(prefix.length, -3));
}

async function navigateToChatgptUrl(
	client: ChromeClient,
	url: string,
	projectId?: string,
	options?: BrowserProviderListOptions,
): Promise<void> {
	// ChatGPT may add a display-name suffix to a project route. Preserve that
	// current route when it names the requested project; navigateAndSettle still
	// verifies route and document readiness before declining a physical action.
	let navigationUrl = url;
	if (projectId) {
		const currentUrl = await readChatgptLocationHref(client.Runtime).catch(() => null);
		if (
			currentUrl &&
			isChatgptUrl(currentUrl) &&
			new URL(currentUrl).origin === new URL(url).origin &&
			extractChatgptProjectIdFromUrl(currentUrl) === projectId &&
			/^\/g\/[^/]+\/project\/?$/.test(new URL(currentUrl).pathname)
		) {
			navigationUrl = currentUrl;
		}
	}
	recordBrowserScrapeCdpCall(options, "Page.navigate");
	recordBrowserScrapeProviderAction(options, "chatgpt.navigateUrl");
	const settled = await navigateAndSettle(client, {
		url: navigationUrl,
		routeExpression: projectId
			? buildProjectRouteExpression(projectId)
			: buildChatgptUrlRouteExpression(url),
		routeDescription: projectId ? `chatgpt project ${projectId}` : `chatgpt route ${url}`,
		waitForDocumentReady: true,
		fallbackToLocationAssign: true,
		timeoutMs: 10_000,
		fallbackTimeoutMs: 10_000,
		interactionGovernor: options?.interactionGovernor,
		interactionClass: "renavigation",
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:chatgpt", "navigate-url"),
	});
	await recordChatgptTargetNavigation(settled.mutationPerformed, options);
	assertChatgptNavigationSettledForTest(settled, url, projectId);
}

async function recordChatgptTargetNavigation(
	mutationPerformed: boolean,
	options?: BrowserProviderListOptions,
): Promise<void> {
	if (mutationPerformed) await options?.onTargetNavigation?.();
}

export const recordChatgptTargetNavigationForTest = recordChatgptTargetNavigation;

export function assertChatgptNavigationSettledForTest(
	settled: { ok: boolean; reason?: string },
	url: string,
	projectId?: string,
): void {
	if (settled.ok) return;
	throw new Error(
		settled.reason ||
			(projectId
				? `ChatGPT project ${projectId} did not settle`
				: `ChatGPT route ${url} did not settle`),
	);
}

async function openProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
	const url = resolveChatgptProjectSourcesUrl(projectId);
	const settled = await navigateAndSettle(client, {
		url,
		routeExpression: buildProjectRouteExpression(projectId),
		routeDescription: `chatgpt project ${projectId}`,
		waitForDocumentReady: true,
		fallbackToLocationAssign: true,
		timeoutMs: 10_000,
		fallbackTimeoutMs: 10_000,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:chatgpt", "open-project-sources-tab"),
	});
	if (!settled.ok) {
		throw new Error(
			settled.reason || `ChatGPT project sources route did not settle for ${projectId}`,
		);
	}
	const ready = await waitForPredicate(
		client.Runtime,
		buildProjectSourcesReadyExpression(projectId),
		{
			timeoutMs: 3_000,
			description: `ChatGPT project sources tab ready for ${projectId}`,
		},
	);
	if (ready.ok) return;
	const routeOnlyReady = await waitForPredicate(
		client.Runtime,
		buildProjectRouteExpression(projectId),
		{
			timeoutMs: 2_000,
			description: `ChatGPT project route for ${projectId}`,
		},
	);
	if (routeOnlyReady.ok) {
		return;
	}
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			const opened = await openSurface(client.Runtime, {
				readyExpression: buildProjectSourcesReadyExpression(projectId),
				readyDescription: `ChatGPT project sources ready for ${projectId}`,
				alreadyOpenTimeoutMs: 800,
				readyTimeoutMs: 3_000,
				timeoutMs: 5_000,
				attempts: [
					{
						name: "sources-tab-id",
						trigger: {
							selector: CHATGPT_PROJECT_SOURCES_TAB_ID_SELECTOR,
							interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"],
							requireVisible: true,
							timeoutMs: 3_000,
						},
					},
					{
						name: "sources-tab-label",
						trigger: {
							match: { exact: [CHATGPT_PROJECT_TAB_SOURCES_LABEL] },
							rootSelectors: ['[role="tablist"]'],
							interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"],
							requireVisible: true,
							timeoutMs: 3_000,
						},
					},
				],
			});
			if (!opened.ok) {
				throw new Error(
					`ChatGPT project sources tab did not open (${JSON.stringify({
						reason: opened.reason,
						attempts: opened.attempts,
					})})`,
				);
			}
		},
		{
			label: "chatgpt-open-project-sources",
			candidateSelectors: [
				'[role="tab"]',
				"button",
				'[role="button"]',
				CHATGPT_PROJECT_SOURCE_ROW_SELECTOR,
			],
			context: {
				surface: "chatgpt-project-sources",
				projectId,
			},
		},
	);
}

async function readChatgptProjectSourceFiles(client: ChromeClient): Promise<FileRef[]> {
	const { result } = await client.Runtime.evaluate({
		expression: buildProjectSourcesSnapshotExpression(),
		returnByValue: true,
	});
	const probes = Array.isArray(result?.value) ? (result.value as ChatgptProjectSourceProbe[]) : [];
	return normalizeChatgptProjectSourceProbes(probes);
}

async function readChatgptProjectSourceFilesSettled(
	client: ChromeClient,
	options?: { timeoutMs?: number; pollMs?: number },
): Promise<FileRef[]> {
	const timeoutMs = options?.timeoutMs ?? 5_000;
	const pollMs = options?.pollMs ?? 400;
	const deadline = Date.now() + timeoutMs;
	let last: FileRef[] = [];
	while (Date.now() < deadline) {
		const files = await readChatgptProjectSourceFiles(client);
		if (files.length > 0) {
			return files;
		}
		last = files;
		await sleep(pollMs);
	}
	return last;
}

function isChatgptProjectSourceFileMatch(fileName: string, candidateName: string): boolean {
	const expected = normalizeFileKey(fileName);
	const candidate = normalizeFileKey(candidateName);
	return expected.length > 0 && candidate.length > 0 && expected === candidate;
}

export function findChatgptProjectSourceName(
	files: readonly Pick<FileRef, "name">[],
	fileName: string,
): string | null {
	return files.find((file) => isChatgptProjectSourceFileMatch(fileName, file.name))?.name ?? null;
}

async function assertProjectSourceStillPresent(
	client: ChromeClient,
	projectId: string,
	fileName: string,
): Promise<string | null> {
	let files = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 5_000, pollMs: 500 });
	const matched = findChatgptProjectSourceName(files, fileName);
	if (matched) {
		return matched;
	}
	await reloadProjectSourcesTab(client, projectId);
	files = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 5_000, pollMs: 500 });
	return findChatgptProjectSourceName(files, fileName);
}

async function reloadProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
	await reloadAndSettle(client, {
		ignoreCache: true,
		waitForDocumentReady: false,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:chatgpt", "reload-project-sources-tab"),
	});
	const ready = await waitForPredicate(
		client.Runtime,
		buildProjectSourcesReadyExpression(projectId),
		{
			timeoutMs: 15_000,
			description: `ChatGPT project sources ready after reload for ${projectId}`,
		},
	);
	if (ready.ok) return;
	await openProjectSourcesTab(client, projectId);
}

async function waitForProjectSourcePersistence(
	client: ChromeClient,
	projectId: string,
	fileName: string,
	options: {
		shouldExist: boolean;
		timeoutMs?: number;
		initialDelayMs?: number;
		pollDelayMs?: number;
		fallbackExpression?: string;
	},
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 30_000;
	const initialDelayMs = options.initialDelayMs ?? 1_500;
	const pollDelayMs = options.pollDelayMs ?? 1_500;
	const deadline = Date.now() + timeoutMs;
	await sleep(initialDelayMs);
	while (Date.now() < deadline) {
		await reloadProjectSourcesTab(client, projectId);
		const files = await readChatgptProjectSourceFilesSettled(client, {
			timeoutMs: 8_000,
			pollMs: 500,
		});
		const matched = findChatgptProjectSourceName(files, fileName);
		if ((options.shouldExist && matched) || (!options.shouldExist && !matched)) {
			return;
		}
		if (options.fallbackExpression) {
			const fallback = await waitForPredicate(client.Runtime, options.fallbackExpression, {
				timeoutMs: 2_000,
				description: options.shouldExist
					? `ChatGPT project source fallback persisted for ${projectId}`
					: `ChatGPT project source fallback removed for ${projectId}`,
			});
			if (fallback.ok) {
				return;
			}
		}
		await sleep(pollDelayMs);
	}
	if (options.shouldExist) {
		throw new Error(`ChatGPT project source upload did not persist for ${projectId}`);
	}
	throw new Error(`ChatGPT project source "${fileName}" still appeared after reload`);
}

async function openProjectSourcesUploadDialog(
	client: ChromeClient,
	projectId: string,
): Promise<void> {
	await openProjectSourcesTab(client, projectId);
	const existingDialog = await waitForPredicate(
		client.Runtime,
		buildProjectSourcesUploadDialogReadyExpression(),
		{
			timeoutMs: 1_000,
			description: `ChatGPT project sources upload dialog already ready for ${projectId}`,
		},
	);
	if (existingDialog.ok) return;
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			const attempts: Array<{ name: string; trigger: PressButtonOptions }> = [
				{
					name: "add-sources",
					trigger: {
						match: { exact: [CHATGPT_PROJECT_SOURCE_ADD_LABEL] },
						interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"] as const,
						requireVisible: true,
						timeoutMs: 3_000,
					},
				},
				{
					name: "add-sources",
					trigger: {
						match: {
							includeAny: [
								CHATGPT_PROJECT_SOURCE_ADD_LABEL,
								CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL,
								"upload",
								"drag sources",
								"add source",
								"add sources",
							],
						},
						interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"] as const,
						requireVisible: true,
						timeoutMs: 3_000,
					},
				},
				{
					name: "add-empty-state",
					trigger: {
						match: { exact: [CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL] },
						interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"] as const,
						requireVisible: true,
						timeoutMs: 3_000,
					},
				},
				{
					name: "sources-action-contains-drag-or-upload",
					trigger: {
						match: {
							includeAny: [
								"add sources",
								"drag sources",
								"upload sources",
								"upload file",
								"upload",
							],
						},
						interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"] as const,
						requireVisible: true,
						timeoutMs: 3_000,
					},
				},
				{
					name: "fallback-upload-selector",
					trigger: {
						selector: 'label,button,[role="button"],a,[role="menuitem"]',
						match: { includeAny: ["upload"] },
						interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"] as const,
						requireVisible: true,
						timeoutMs: 2_000,
					},
				},
			];
			let opened = false;
			const attemptLog = [];
			for (const attempt of attempts) {
				const pressed = await pressButton(client.Runtime, attempt.trigger);
				attemptLog.push({
					name: attempt.name,
					triggerOk: pressed.ok,
					triggerReason: pressed.reason,
					matchedLabel: pressed.matchedLabel,
				});
				if (pressed.ok) {
					opened = true;
					break;
				}
			}
			if (!opened) {
				throw new Error(
					`ChatGPT project sources add action did not open (${JSON.stringify(attemptLog)})`,
				);
			}
			const ready = await waitForPredicate(
				client.Runtime,
				buildProjectSourcesUploadDialogReadyExpression(),
				{
					timeoutMs: 5_000,
					description: `ChatGPT project sources upload dialog ready for ${projectId}`,
				},
			);
			if (!ready.ok) {
				throw new Error(
					`ChatGPT project sources upload dialog did not open (${JSON.stringify({ attempts: attemptLog })})`,
				);
			}
		},
		{
			label: "chatgpt-open-project-sources-upload-dialog",
			candidateSelectors: ["button", '[role="button"]', '[role="dialog"]', 'input[type="file"]'],
			context: {
				surface: "chatgpt-project-sources-upload-dialog",
				projectId,
			},
		},
	);
}

async function tagChatgptProjectSourceInput(client: ChromeClient): Promise<string> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCES_INPUT_ATTR)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const uploadMarkers = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS)}.map((value) => normalize(value));
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((dialog) => isVisible(dialog))
        .sort((left, right) => {
          const leftText = normalize(left.textContent || '');
          const rightText = normalize(right.textContent || '');
          const leftScore = Number(uploadMarkers.some((marker) => marker.length > 0 && leftText.includes(marker)));
          const rightScore = Number(uploadMarkers.some((marker) => marker.length > 0 && rightText.includes(marker)));
          return rightScore - leftScore;
        });
      const scopes = dialogs.length > 0 ? dialogs : [document];
      let input = null;
      for (const scope of scopes) {
        input = Array.from(scope.querySelectorAll('input[type="file"]'))
          .find((node) => !['upload-files', 'upload-photos', 'upload-camera'].includes(node.id));
        if (input) {
          break;
        }
      }
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false };
      }
      input.setAttribute(attribute, 'true');
      return { ok: true, selector: 'input[' + attribute + '="true"]' };
    })()`,
		returnByValue: true,
	});
	const info = result?.value as { ok?: boolean; selector?: string } | undefined;
	if (!info?.ok || !info.selector) {
		throw new Error("ChatGPT project sources file input not found");
	}
	return info.selector;
}

async function uploadChatgptProjectSourceFilesWithClient(
	client: ChromeClient,
	projectId: string,
	filePaths: readonly string[],
): Promise<void> {
	if (filePaths.length === 0) return;
	await openProjectSourcesUploadDialog(client, projectId);
	const selector = await tagChatgptProjectSourceInput(client);
	await client.DOM.enable();
	const documentRoot = await client.DOM.getDocument({ depth: 0 });
	const query = await client.DOM.querySelector({
		nodeId: documentRoot.root.nodeId,
		selector,
	});
	if (!query.nodeId) {
		throw new Error("ChatGPT project sources upload input could not be resolved");
	}
	await client.DOM.setFileInputFiles({
		nodeId: query.nodeId,
		files: [...filePaths],
	});
	await client.Runtime.evaluate({
		expression: `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
		returnByValue: true,
	}).catch(() => undefined);
	const expectedNames = filePaths.map((filePath) => path.basename(filePath));
	const uploadReady = await waitForPredicate(
		client.Runtime,
		buildProjectSourceNamesPresentExpression(expectedNames),
		{
			timeoutMs: 12_000,
			description: `ChatGPT project sources appeared for ${projectId}`,
		},
	);
	if (!uploadReady.ok && filePaths.length === 1) {
		await transferAttachmentViaDataTransfer(
			client.Runtime,
			{
				path: filePaths[0],
				displayPath: filePaths[0],
			},
			selector,
		);
	}
	const previewVerified = await waitForPredicate(
		client.Runtime,
		buildProjectSourceNamesPresentExpression(expectedNames),
		{
			timeoutMs: 12_000,
			description: `ChatGPT project source preview ready for ${projectId}`,
		},
	);
	if (!previewVerified.ok) {
		throw new Error(`ChatGPT project source upload preview did not appear for ${projectId}`);
	}
	for (const expectedName of expectedNames) {
		await waitForProjectSourcePersistence(client, projectId, expectedName, {
			shouldExist: true,
			timeoutMs: 30_000,
			initialDelayMs: 4_000,
			pollDelayMs: 2_000,
			fallbackExpression: buildProjectSourceNamesPresentExpression([expectedName]),
		});
	}
}

async function tagChatgptProjectSourceAction(
	client: ChromeClient,
	fileName: string,
): Promise<string> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_ATTR)};
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const rows = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
      const extractName = (row) => {
        const rowText = String(row.textContent || '').replace(/\\s+/g, ' ').trim();
        const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
          .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        for (const candidate of leafTexts) {
          if (candidate === rowText) continue;
          if (candidate.includes(' · ')) continue;
          if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\\b/i.test(candidate)) continue;
          return candidate;
        }
        const beforeMeta = rowText.split(/\\s+·\\s+/)[0]?.trim() ?? '';
        return beforeMeta.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, '').trim() || beforeMeta;
      };
      for (const row of rows) {
        const name = normalize(extractName(row));
        if (!name || name !== expected) continue;
        const button = row.querySelector(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR)});
        if (!(button instanceof HTMLButtonElement)) continue;
        button.setAttribute(attribute, 'true');
        return { ok: true, selector: 'button[' + attribute + '="true"]' };
      }
      return {
        ok: false,
        candidates: rows
          .map((row) => extractName(row))
          .filter(Boolean)
          .slice(0, 10),
      };
    })()`,
		returnByValue: true,
	});
	const info = result?.value as
		| { ok?: boolean; selector?: string; candidates?: string[] }
		| undefined;
	if (!info?.ok || !info.selector) {
		const candidates =
			Array.isArray(info?.candidates) && info.candidates.length > 0
				? ` (${info.candidates.join(", ")})`
				: "";
		throw new Error(
			`ChatGPT project source action button not found for "${fileName}"${candidates}`,
		);
	}
	return info.selector;
}

async function confirmChatgptProjectSourceRemovalIfPresent(
	client: ChromeClient,
	fileName: string,
): Promise<void> {
	await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))) {
        const text = normalize(dialog.textContent || '');
        if (
          !text.includes(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL)}) &&
          !text.includes(${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)})
        ) continue;
        if (expected && text && !text.includes(expected) && !text.includes('source')) continue;
        const button = Array.from(dialog.querySelectorAll('button'))
          .find((node) => {
            const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
            return (
              label === ${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL)} ||
              label === ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)}
            );
          });
        if (button instanceof HTMLButtonElement) {
          button.click();
          return true;
        }
      }
      return false;
    })()`,
		returnByValue: true,
	}).catch(() => undefined);
}

async function openCreateProjectModalWithClient(client: ChromeClient): Promise<void> {
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			await ensureChatgptSidebarOpen(client);
			const alreadyReady = await waitForCreateProjectDialogReady(client, 750);
			if (alreadyReady) return;
			const genericDialogOpen = await waitForSelector(
				client.Runtime,
				CHATGPT_PROJECT_DIALOG_SELECTOR,
				500,
			);
			if (genericDialogOpen) {
				await closeDialog(client.Runtime, CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS).catch(
					() => undefined,
				);
			}
			const pressed = await pressButton(client.Runtime, {
				match: { exact: [CHATGPT_NEW_PROJECT_LABEL] },
				requireVisible: true,
				timeoutMs: 3000,
			});
			if (!pressed.ok) {
				const openedFromProjects = await openCreateProjectModalFromProjectsRow(client);
				if (!openedFromProjects) {
					throw new Error(pressed.reason || "New project button not found");
				}
			}
			const ready = await waitForCreateProjectDialogReady(client, 6000);
			if (!ready) {
				throw new Error("ChatGPT create-project dialog did not become ready");
			}
		},
		{
			label: "chatgpt-open-create-project-modal",
			candidateSelectors: ["button", '[role="button"]', "dialog", '[role="dialog"]'],
		},
	);
}

async function openCreateProjectModalFromProjectsRow(client: ChromeClient): Promise<boolean> {
	const rootSelectors = ["nav", "aside", "#stage-slideover-sidebar"];
	const direct = await pressButton(client.Runtime, {
		match: { exact: [CHATGPT_PROJECTS_LABEL] },
		rootSelectors,
		requireVisible: true,
		timeoutMs: 2000,
	});
	if (direct.ok && (await waitForCreateProjectDialogReady(client, 2000))) {
		return true;
	}

	const tagged = await client.Runtime.evaluate({
		expression: `(() => {
      const rootSelectors = ${JSON.stringify(rootSelectors)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const roots = rootSelectors.map((selector) => document.querySelector(selector)).filter(Boolean);
      const root = roots[0] || document;
      const nodes = Array.from(root.querySelectorAll('button,a,[role="button"],li,div'));
      const row = nodes.find((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === ${JSON.stringify(CHATGPT_PROJECTS_LABEL)});
      if (!(row instanceof HTMLElement)) {
        return { ok: false, reason: 'Projects row not found' };
      }
      row.setAttribute('data-auracall-chatgpt-projects-row', 'true');
      return { ok: true };
    })()`,
		returnByValue: true,
	});
	const tagInfo = tagged.result?.value as { ok?: boolean; reason?: string } | undefined;
	if (!tagInfo?.ok) {
		return false;
	}

	await hoverAndReveal(client.Runtime, client.Input, {
		rowSelector: '[data-auracall-chatgpt-projects-row="true"]',
		rootSelectors,
		timeoutMs: 1500,
	}).catch(() => undefined);

	const revealed = await client.Runtime.evaluate({
		expression: `(() => {
      const row = document.querySelector('[data-auracall-chatgpt-projects-row="true"]');
      if (!row) return { ok: false, reason: 'Projects row missing' };
      const button = Array.from(row.querySelectorAll('button,[role="button"],a'))
        .find((node) => node !== row);
      if (!(button instanceof HTMLElement)) {
        return { ok: false, reason: 'Projects row action not found' };
      }
      button.setAttribute('data-auracall-chatgpt-projects-action', 'true');
      return { ok: true };
    })()`,
		returnByValue: true,
	});
	const revealedInfo = revealed.result?.value as { ok?: boolean; reason?: string } | undefined;
	if (!revealedInfo?.ok) {
		return false;
	}
	const clicked = await pressButton(client.Runtime, {
		selector: '[data-auracall-chatgpt-projects-action="true"]',
		timeoutMs: 2000,
	});
	return clicked.ok && (await waitForCreateProjectDialogReady(client, 3000));
}

async function waitForCreateProjectDialogReady(
	client: ChromeClient,
	timeoutMs: number,
): Promise<boolean> {
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const rootSelectors = ${JSON.stringify(Array.from(CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS))};
      const inputSelector = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)};
      const settingsLabel = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((node, index, array) => array.indexOf(node) === index && isVisible(node));
      return roots.some((root) => {
        const nameInput = root.querySelector(inputSelector);
        if (nameInput && isVisible(nameInput)) {
          return true;
        }
        return Array.from(root.querySelectorAll('button, [role="button"]')).some((button) => {
          if (!isVisible(button)) return false;
          const label = normalize(button.getAttribute('aria-label') || button.textContent || button.getAttribute('title') || '');
          return label.includes(settingsLabel);
        });
      });
    })()`,
		{
			timeoutMs,
			description: "ChatGPT create-project dialog ready",
		},
	);
	return ready.ok;
}

export async function readChatgptUserIdentity(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<ProviderUserIdentity | null> {
	let authSessionProbe: ChatgptAuthSessionProbe | null = null;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
		recordBrowserScrapeProviderAction(options, "chatgpt.readAuthSessionIdentity");
		const authSessionResult = await withBrowserScrapePendingOperation(
			options,
			"provider:chatgpt.readAuthSessionIdentity",
			() =>
				withChatgptTimeout(
					client.Runtime.evaluate({
						expression: buildChatgptAuthSessionIdentityExpression(),
						awaitPromise: true,
						returnByValue: true,
						timeout: 10_000,
					}),
					10_000,
					"Timed out reading ChatGPT auth-session identity after 10000ms.",
				),
		);
		const candidate =
			(authSessionResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null;
		if (normalizeChatgptAuthSessionIdentity(candidate)) {
			authSessionProbe = candidate;
			break;
		}
		if (attempt < 4) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.readFallbackIdentity");
	const fallbackResult = await withBrowserScrapePendingOperation(
		options,
		"provider:chatgpt.readFallbackIdentity",
		() =>
			withChatgptTimeout(
				client.Runtime.evaluate({
					expression: buildChatgptFallbackIdentityExpression(),
					returnByValue: true,
					timeout: 10_000,
				}),
				10_000,
				"Timed out reading ChatGPT fallback identity after 10000ms.",
			),
	);
	const fallbackProbe =
		(fallbackResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null;
	const mergeRecord = <T extends Record<string, unknown>>(
		primary: T | null | undefined,
		fallback: T | null | undefined,
	): T | null => {
		if (!primary && !fallback) return null;
		const keys = new Set([...Object.keys(fallback ?? {}), ...Object.keys(primary ?? {})]);
		return Object.fromEntries(
			[...keys].map((key) => [key, primary?.[key] ?? fallback?.[key] ?? null]),
		) as T;
	};
	return normalizeChatgptAuthSessionIdentity({
		user: mergeRecord(authSessionProbe?.user, fallbackProbe?.user),
		account: mergeRecord(authSessionProbe?.account, fallbackProbe?.account),
	});
}

export const readChatgptUserIdentityWithClientForTest = readChatgptUserIdentity;

async function assertChatgptExpectedIdentity(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<void> {
	if (!options?.providerSessionAuthorization) {
		throw new Error("ChatGPT provider-session authorization context is missing.");
	}
	assertProviderSessionAuthorization(
		options.providerSessionAuthorization,
		await readChatgptUserIdentity(client, options),
		{
			browserTargetId:
				options.tabTargetId ?? options.providerSessionAuthorization.context.browserTargetId ?? null,
			devtoolsHost:
				options.host ?? options.providerSessionAuthorization.context.devtoolsHost ?? null,
			devtoolsPort:
				options.port ?? options.providerSessionAuthorization.context.devtoolsPort ?? null,
		},
	);
}

function buildChatgptFeatureProbeExpression(): string {
	const detector = JSON.stringify(CHATGPT_FEATURE_DETECTOR);
	const flagTokens = JSON.stringify(CHATGPT_FEATURE_FLAG_TOKENS);
	const modelButtonSelectors = JSON.stringify(CHATGPT_PROVIDER.selectors.modelButton);
	return `(async () => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const lower = (value) => normalize(value).toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const addText = (sink, value) => {
      const normalized = lower(value);
      if (normalized) sink.push(normalized);
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const unique = (values) => Array.from(new Set(values.map((value) => normalize(value)).filter(Boolean)));
    const click = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      try {
        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      } catch {}
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      try {
        node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      } catch {}
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
	      if (typeof node.click === 'function') node.click();
	      else node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    };
    const escapeOpenSurfaces = async () => {
      for (let index = 0; index < 3; index += 1) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        await wait(80);
      }
    };
    const readOptionEntries = (root = document) => Array.from(root.querySelectorAll('button, [role="radio"], [role="option"], [role="combobox"], [role="menuitem"], [role="menuitemradio"]'))
      .filter(isVisible)
      .map((node) => ({
        text: normalize(node.textContent || ''),
        aria: normalize(node.getAttribute?.('aria-label') || ''),
        role: normalize(node.getAttribute?.('role') || ''),
        testid: normalize(node.getAttribute?.('data-testid') || ''),
        checked: normalize(node.getAttribute?.('aria-checked') || node.getAttribute?.('data-state') || ''),
      }))
      .filter((entry) => entry.text || entry.aria || entry.testid);
    const classifyModel = (entry) => {
      const text = lower([entry.text, entry.aria, entry.testid].filter(Boolean).join(' '));
      if (text.includes('model switcher') && text.includes('pro')) return 'Pro';
      if (/\\bpro\\b/.test(text)) return 'Pro';
      if (/\\bthinking\\b/.test(text)) return 'Thinking';
      if (/\\binstant\\b/.test(text)) return 'Instant';
      return null;
    };
    const classifyDepth = (entry) => {
      const text = lower([entry.text, entry.aria].filter(Boolean).join(' '));
      if (/\\bstandard\\b/.test(text)) return 'Standard';
      if (/\\bextended\\b/.test(text)) return 'Extended';
      return null;
    };
    const checked = (entry) => entry.checked === 'true' || entry.checked === 'checked' || entry.checked === 'selected';
    const collectModelControlDetails = async (button) => {
      const modelOptions = [];
      const depthOptions = [];
      let selectedModel = null;
      let selectedDepth = null;
      if (!button) {
        return { model_options: modelOptions, depth_options: depthOptions, synthesized_options: [], selected_model: selectedModel, selected_depth: selectedDepth };
      }
      await escapeOpenSurfaces();
      click(button);
      await wait(500);
      const menuEntries = readOptionEntries();
      for (const entry of menuEntries) {
        const model = classifyModel(entry);
        if (model) {
          modelOptions.push(model);
          if (checked(entry)) selectedModel = model;
        }
        const depth = classifyDepth(entry);
        if (depth) {
          depthOptions.push(depth);
          if (checked(entry)) selectedDepth = depth;
        }
      }
      const configureNode = Array.from(document.querySelectorAll('[role="menu"] button, [role="menuitem"], button'))
        .filter(isVisible)
        .find((node) => lower([node.textContent || '', node.getAttribute?.('aria-label') || ''].join(' ')).includes('configure'));
      if (configureNode) {
        click(configureNode);
        await wait(650);
        const dialog = Array.from(document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], div[aria-modal="true"]'))
          .filter(isVisible)
          .at(-1);
        if (dialog) {
          const dialogEntries = readOptionEntries(dialog);
          for (const entry of dialogEntries) {
            const model = classifyModel(entry);
            if (model) {
              modelOptions.push(model);
              if (checked(entry)) selectedModel = model;
            }
            const depth = classifyDepth(entry);
            if (depth) {
              depthOptions.push(depth);
              if (checked(entry)) selectedDepth = depth;
            }
          }
          const depthCombo = Array.from(dialog.querySelectorAll('[role="combobox"], button'))
            .filter(isVisible)
            .find((node) => {
              const text = lower([node.textContent || '', node.getAttribute?.('aria-label') || ''].join(' '));
              return /\\bstandard\\b|\\bextended\\b|thinking time|effort|mode/.test(text);
            });
          if (depthCombo) {
            click(depthCombo);
            await wait(500);
            for (const entry of readOptionEntries()) {
              const depth = classifyDepth(entry);
              if (depth) {
                depthOptions.push(depth);
                if (checked(entry)) selectedDepth = depth;
              }
            }
          }
        }
      }
      await escapeOpenSurfaces();
      const normalizedModels = unique(modelOptions);
      const normalizedDepths = unique(depthOptions);
      const synthesized = [];
      for (const model of normalizedModels) {
        if (model !== 'Thinking' && model !== 'Pro') continue;
        for (const depth of normalizedDepths) {
          synthesized.push(model + ' ' + depth);
        }
      }
	      return {
	        model_options: normalizedModels,
        depth_options: normalizedDepths,
        synthesized_options: unique(synthesized),
        selected_model: selectedModel,
	        selected_depth: selectedDepth,
	      };
	    };
	    const collectComposerAppDetails = async () => {
	      const appMap = new Map();
	      const composerTools = [];
	      const modeButton = Array.from(document.querySelectorAll('button[role="radio"]'))
	        .filter(isVisible)
	        .find((node) => node.getAttribute('aria-checked') === 'true');
	      const composer_mode = lower(modeButton?.textContent || '') === 'work'
	        ? 'work'
	        : (lower(modeButton?.textContent || '') === 'chat' ? 'chat' : null);
	      const readPluginId = (node) => {
	        const href = node?.querySelector?.('a[href*="/plugins/plugin_"]')?.getAttribute?.('href') || '';
	        const match = href.match(/\\/plugins\\/(plugin_[^/?#]+)/i);
	        return match?.[1] || null;
	      };
	      const addApp = (entry) => {
	        const name = normalize(entry?.name || '');
	        if (!name) return;
	        const key = lower(name);
	        const previous = appMap.get(key);
	        const rank = (state) => state === 'selected' ? 4 : state === 'selectable' ? 3 : state === 'connect_required' ? 2 : 1;
	        if (!previous || rank(entry.selection_state) >= rank(previous.selection_state)) {
	          appMap.set(key, {
	            name,
	            app_id: normalize(entry.app_id || '') || previous?.app_id || null,
	            plugin_id: normalize(entry.plugin_id || '') || previous?.plugin_id || null,
	            selection_state: entry.selection_state || previous?.selection_state || 'unknown',
	          });
	        }
	      };
	      const composer = document.querySelector('form[data-type="unified-composer"]') || document.querySelector('#prompt-textarea, textarea[name="prompt-textarea"]')?.closest('form');
	      for (const pill of Array.from(composer?.querySelectorAll(${JSON.stringify(CHATGPT_INLINE_SELECTION_PILL_SELECTOR)}) || []).filter(isVisible)) {
	        const dataId = normalize(pill.getAttribute('data-id') || pill.getAttribute('data-system-hint-type') || '');
	        addApp({
	          name: pill.getAttribute('data-keyword') || pill.textContent || '',
	          app_id: dataId.replace(/^plugin:/i, ''),
	          plugin_id: readPluginId(pill),
	          selection_state: 'selected',
	        });
	      }
	      const trigger = document.querySelector('#composer-plus-btn, button[aria-label*="Add files and more" i]');
	      if (!(trigger instanceof HTMLElement) || !isVisible(trigger)) {
	        return {
	          composer_mode,
	          composer_apps: Array.from(appMap.values()),
	          composer_tools: composerTools,
	          composer_menu_observed: false,
	        };
	      }
	      await escapeOpenSurfaces();
	      click(trigger);
	      await wait(500);
	      const menu = Array.from(document.querySelectorAll(
	        ${JSON.stringify(CHATGPT_COMPOSER_MENU_ROOT_SELECTOR)},
	      )).filter(isVisible).at(-1);
	      if (menu) {
	        const items = Array.from(menu.querySelectorAll(
	          ${JSON.stringify(CHATGPT_COMPOSER_MENU_ITEM_SELECTOR)},
	        )).filter(isVisible);
	        for (const item of items) {
	          const primary = item.querySelector('span.max-w-full, span.truncate');
	          const name = normalize(primary?.textContent || (item.textContent || '').split('\\n')[0] || '');
	          if (name) composerTools.push(name);
	          const icon = item.querySelector('[data-testid="plugin-icon-wrapper"] img, img[src*="/images/ecosystem/apps/"]');
	          if (!icon) continue;
	          const iconSrc = icon.getAttribute('src') || '';
	          const iconMatch = iconSrc.match(/\\/images\\/ecosystem\\/apps\\/([^/]+)\\//i);
	          const text = normalize(item.textContent || '');
	          addApp({
	            name,
	            app_id: iconMatch?.[1] || null,
	            plugin_id: readPluginId(item),
	            selection_state: /(?:^|\\s)connect$/i.test(text) ? 'connect_required' : 'selectable',
	          });
	        }
	      }
	      await escapeOpenSurfaces();
	      return {
	        composer_mode,
	        composer_apps: Array.from(appMap.values()),
	        composer_tools: unique(composerTools),
	        composer_menu_observed: Boolean(menu),
	      };
	    };
	    const detector = ${detector};
	    const flagTokens = ${flagTokens};
	    const modelButtonSelectors = ${modelButtonSelectors};
    const corpus = [];
    addText(corpus, document.body?.innerText || '');
    for (const node of Array.from(document.querySelectorAll('button, [role="button"], a, [aria-label], [title]')).slice(0, 500)) {
      addText(corpus, node.textContent || '');
      addText(corpus, node.getAttribute?.('aria-label') || '');
      addText(corpus, node.getAttribute?.('title') || '');
    }
    for (const key of Object.keys(localStorage).slice(0, 100)) {
      addText(corpus, key);
      try { addText(corpus, localStorage.getItem(key) || ''); } catch {}
    }
    for (const key of Object.keys(sessionStorage).slice(0, 100)) {
      addText(corpus, key);
      try { addText(corpus, sessionStorage.getItem(key) || ''); } catch {}
    }
    for (const script of Array.from(document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')).slice(0, 20)) {
      addText(corpus, (script.textContent || '').slice(0, 40000));
    }
    const haystack = corpus.join('\\n');
	    const flags = {};
    for (const [name, tokens] of Object.entries(flagTokens)) {
      flags[name] = tokens.some((token) => haystack.includes(token));
    }
    const modelButtons = [];
    for (const selector of modelButtonSelectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!isVisible(node) || modelButtons.includes(node)) continue;
        modelButtons.push(node);
      }
    }
    if (modelButtons.length === 0) {
      for (const node of Array.from(document.querySelectorAll('button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"]'))) {
        if (!isVisible(node)) continue;
        const text = lower(node.textContent || '');
        const aria = lower(node.getAttribute?.('aria-label') || '');
        const testid = lower(node.getAttribute?.('data-testid') || '');
        if (text.includes('chatgpt') || text.includes('instant') || text.includes('thinking') || text.includes('pro') || aria.includes('switch model') || testid.includes('model-switcher')) {
          modelButtons.push(node);
        }
      }
	    }
	    const modelButton = modelButtons[0] || null;
	    const composerRoot = modelButton?.closest?.('[data-testid*="composer"], form, [contenteditable="true"], .__composer-pill, [class*="composer"]') || null;
	    const modelControlDetails = await collectModelControlDetails(modelButton);
	    const composerDetails = await collectComposerAppDetails();
	    const model_controls = modelButton
      ? {
          visible: true,
          label: normalize(modelButton.textContent || ''),
          aria_label: normalize(modelButton.getAttribute?.('aria-label') || ''),
          location: composerRoot ? 'prompt_workbench' : 'header_or_unknown',
          selector: modelButton.getAttribute?.('data-testid') === 'model-switcher-dropdown-button'
            ? '[data-testid="model-switcher-dropdown-button"]'
            : (modelButton.matches?.('button.__composer-pill') ? 'button.__composer-pill' : (lower(modelButton.getAttribute?.('aria-label') || '').includes('switch model') ? 'button[aria-label="Switch model"]' : null)),
          ...modelControlDetails,
        }
      : { visible: false };
    return {
      detector,
	      web_search: composerDetails.composer_menu_observed
	        ? composerDetails.composer_tools.some((label) => lower(label) === 'web search')
	        : Boolean(flags.web_search),
	      deep_research: composerDetails.composer_menu_observed
	        ? composerDetails.composer_tools.some((label) => lower(label) === 'deep research')
	        : Boolean(flags.deep_research),
	      company_knowledge: composerDetails.composer_menu_observed
	        ? composerDetails.composer_tools.some((label) => lower(label) === 'company knowledge')
	        : Boolean(flags.company_knowledge),
	      shopping: composerDetails.composer_menu_observed
	        ? composerDetails.composer_tools.some((label) => lower(label) === 'shopping')
	        : Boolean(flags.shopping),
	      composer_tools: composerDetails.composer_tools,
	      apps: composerDetails.composer_apps
	        .filter((entry) => entry.selection_state === 'selected' || entry.selection_state === 'selectable')
	        .map((entry) => lower(entry.name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')),
	      composer_mode: composerDetails.composer_mode,
	      composer_apps: composerDetails.composer_apps,
	      model_controls,
    };
  })()`;
}

export function buildChatgptFeatureProbeExpressionForTest(): string {
	return buildChatgptFeatureProbeExpression();
}

async function readChatgptComposerSurfaceProbe(client: ChromeClient): Promise<{
	composer_mode?: "chat" | "work";
	composer_apps: ChatgptComposerAppProbe[];
	composer_tools: string[];
} | null> {
	const dispatchKey = async (key: string, code: string): Promise<void> => {
		await client.Input.dispatchKeyEvent({ type: "keyDown", key, code });
		await client.Input.dispatchKeyEvent({ type: "keyUp", key, code });
	};
	await dispatchKey("Escape", "Escape").catch(() => undefined);
	const trigger = await client.Runtime.evaluate({
		expression: `(() => {
			const node = document.querySelector(
				'#composer-plus-btn, button[aria-label*="Add files and more" i]'
			);
			if (!(node instanceof HTMLElement)) return null;
			const rect = node.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return null;
			return {
				x: rect.x + rect.width / 2,
				y: rect.y + rect.height / 2,
			};
		})()`,
		returnByValue: true,
	});
	const point = trigger.result?.value as { x?: number; y?: number } | null | undefined;
	if (typeof point?.x !== "number" || typeof point.y !== "number") return null;
	await client.Page.bringToFront().catch(() => undefined);
	await client.Input.dispatchMouseEvent({
		type: "mouseMoved",
		x: point.x,
		y: point.y,
	});
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	const visible = await waitForPredicate(
		client.Runtime,
		`(() => Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_COMPOSER_MENU_ROOT_SELECTOR)})).some((node) => {
			if (!(node instanceof HTMLElement)) return false;
			const rect = node.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0
				&& Boolean(node.querySelector(${JSON.stringify(CHATGPT_COMPOSER_MENU_ITEM_SELECTOR)}));
		}))()`,
		{
			timeoutMs: 5_000,
			pollMs: 100,
		},
	).catch(() => ({ ok: false }));
	if (!visible.ok) return null;
	const result = await client.Runtime.evaluate({
		expression: `(() => {
			const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
			const lower = (value) => normalize(value).toLowerCase();
			const isVisible = (node) => {
				if (!(node instanceof HTMLElement)) return false;
				const rect = node.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			};
			const modeButton = Array.from(document.querySelectorAll('button[role="radio"]'))
				.filter(isVisible)
				.find((node) => node.getAttribute('aria-checked') === 'true');
			const modeText = lower(modeButton?.textContent || '');
			const composer_mode = modeText === 'work' ? 'work' : (modeText === 'chat' ? 'chat' : null);
				const menu = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_COMPOSER_MENU_ROOT_SELECTOR)}))
					.filter((node) => isVisible(node)
						&& Boolean(node.querySelector(${JSON.stringify(CHATGPT_COMPOSER_MENU_ITEM_SELECTOR)})))
					.at(-1);
			const apps = [];
			const tools = [];
			for (const item of Array.from(menu?.querySelectorAll(
				${JSON.stringify(CHATGPT_COMPOSER_MENU_ITEM_SELECTOR)}
			) || []).filter(isVisible)) {
				const primary = item.querySelector('span.max-w-full, span.truncate');
				const name = normalize(primary?.textContent || (item.textContent || '').split('\\n')[0] || '');
				if (!name) continue;
				tools.push(name);
				const icon = item.querySelector(
					'[data-testid="plugin-icon-wrapper"] img, img[src*="/images/ecosystem/apps/"]'
				);
				if (!icon) continue;
				const iconMatch = (icon.getAttribute('src') || '').match(
					/\\/images\\/ecosystem\\/apps\\/([^/]+)\\//i
				);
				const href = item.querySelector('a[href*="/plugins/plugin_"]')?.getAttribute('href') || '';
				const pluginMatch = href.match(/\\/plugins\\/(plugin_[^/?#]+)/i);
					const text = lower(item.textContent || '');
					const connectRequired = Boolean(item.querySelector(
						'[data-suggested-plugin-connect], button[aria-label^="Connect " i]'
					)) || /(?:^|\\s)connect$/.test(text);
				apps.push({
					name,
					app_id: iconMatch?.[1] || null,
					plugin_id: pluginMatch?.[1] || null,
						selection_state: connectRequired ? 'connect_required' : 'selectable',
				});
			}
			const composer = document.querySelector('form[data-type="unified-composer"]') || document.querySelector('#prompt-textarea, textarea[name="prompt-textarea"]')?.closest('form');
			for (const pill of Array.from(composer?.querySelectorAll(
				${JSON.stringify(CHATGPT_INLINE_SELECTION_PILL_SELECTOR)}
			) || []).filter(isVisible)) {
				const dataId = normalize(
					pill.getAttribute('data-id') || pill.getAttribute('data-system-hint-type') || ''
				);
				const name = normalize(pill.getAttribute('data-keyword') || pill.textContent || '');
				const href = pill.querySelector('a[href*="/plugins/plugin_"]')?.getAttribute('href') || '';
				const pluginMatch = href.match(/\\/plugins\\/(plugin_[^/?#]+)/i);
				const existing = apps.find((entry) => lower(entry.name) === lower(name));
				const selected = {
					name,
					app_id: dataId.replace(/^plugin:/i, '') || existing?.app_id || null,
					plugin_id: pluginMatch?.[1] || existing?.plugin_id || null,
					selection_state: 'selected',
				};
				if (existing) Object.assign(existing, selected);
				else if (name) apps.push(selected);
			}
			return {
				composer_mode,
				composer_apps: apps,
				composer_tools: Array.from(new Set(tools)),
			};
		})()`,
		returnByValue: true,
	});
	await dispatchKey("Escape", "Escape").catch(() => undefined);
	const value = result.result?.value as
		| {
				composer_mode?: "chat" | "work" | null;
				composer_apps?: ChatgptComposerAppProbe[] | null;
				composer_tools?: string[] | null;
		  }
		| null
		| undefined;
	if (!value) return null;
	return {
		composer_mode:
			value.composer_mode === "chat" || value.composer_mode === "work"
				? value.composer_mode
				: undefined,
		composer_apps: normalizeChatgptComposerAppProbes(value.composer_apps),
		composer_tools: normalizeUiTextList(value.composer_tools),
	};
}

function normalizeChatgptFeatureSignature(
	probe: ChatgptFeatureProbe | null | undefined,
): string | null {
	if (!probe || typeof probe !== "object") {
		return null;
	}
	const apps = Array.isArray(probe.apps)
		? Array.from(new Set(probe.apps.map((entry) => normalizeUiText(entry)).filter(Boolean))).sort()
		: [];
	const normalized = {
		detector: normalizeUiText(probe.detector) || CHATGPT_FEATURE_DETECTOR,
		web_search: typeof probe.web_search === "boolean" ? probe.web_search : undefined,
		deep_research: typeof probe.deep_research === "boolean" ? probe.deep_research : undefined,
		company_knowledge:
			typeof probe.company_knowledge === "boolean" ? probe.company_knowledge : undefined,
		shopping: typeof probe.shopping === "boolean" ? probe.shopping : undefined,
		composer_tools: normalizeUiTextList(probe.composer_tools),
		apps,
		composer_mode:
			probe.composer_mode === "chat" || probe.composer_mode === "work"
				? probe.composer_mode
				: undefined,
		composer_apps: normalizeChatgptComposerAppProbes(probe.composer_apps),
		installed_apps: normalizeChatgptInstalledAppProbes(probe.installed_apps),
		linked_apps: normalizeChatgptLinkedAppProbes(probe.linked_apps),
		model_controls: normalizeChatgptModelControlProbe(probe.model_controls),
	};
	const hasAnySignal =
		normalized.web_search !== undefined ||
		normalized.deep_research !== undefined ||
		normalized.company_knowledge !== undefined ||
		normalized.shopping !== undefined ||
		normalized.composer_tools.length > 0 ||
		normalized.apps.length > 0 ||
		normalized.composer_mode !== undefined ||
		normalized.composer_apps.length > 0 ||
		normalized.installed_apps.length > 0 ||
		normalized.linked_apps.length > 0 ||
		normalized.model_controls !== undefined;
	if (!hasAnySignal) {
		return null;
	}
	const parsed = ChatgptFeatureSchema.safeParse(normalized);
	return parsed.success ? JSON.stringify(parsed.data) : null;
}

export const normalizeChatgptFeatureSignatureForTest = normalizeChatgptFeatureSignature;

function normalizeChatgptComposerAppProbes(value: unknown): ChatgptComposerAppProbe[] {
	if (!Array.isArray(value)) return [];
	const apps = new Map<string, ChatgptComposerAppProbe>();
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const name = normalizeUiText(entry.name as string | null | undefined);
		if (!name) continue;
		const appId = normalizeUiText(entry.app_id as string | null | undefined);
		const pluginId = normalizeUiText(entry.plugin_id as string | null | undefined);
		const selectionState =
			entry.selection_state === "selected" ||
			entry.selection_state === "selectable" ||
			entry.selection_state === "connect_required" ||
			entry.selection_state === "unknown"
				? entry.selection_state
				: undefined;
		apps.set(name.toLowerCase(), {
			name,
			app_id: appId || undefined,
			plugin_id: pluginId || undefined,
			selection_state: selectionState,
		});
	}
	return [...apps.values()].sort((left, right) =>
		(left.name ?? "").localeCompare(right.name ?? ""),
	);
}

export function normalizeChatgptInstalledAppProbes(value: unknown): ChatgptInstalledAppProbe[] {
	if (!Array.isArray(value)) return [];
	const apps = new Map<string, ChatgptInstalledAppProbe>();
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const pluginId = normalizeUiText((entry.plugin_id ?? entry.id) as string | null | undefined);
		const release = isRecord(entry.release) ? entry.release : null;
		const name = normalizeUiText(
			(release?.display_name ?? entry.name) as string | null | undefined,
		);
		if (!pluginId || !name) continue;
		const appIds = normalizeUiTextList(entry.app_ids ?? release?.app_ids);
		apps.set(pluginId, {
			plugin_id: pluginId,
			canonical_app_id:
				normalizeUiText(entry.canonical_app_id as string | null | undefined) || undefined,
			provider_name: normalizeUiText(entry.name as string | null | undefined) || undefined,
			name,
			app_ids: appIds.length > 0 ? appIds : undefined,
			status: normalizeUiText(entry.status as string | null | undefined) || undefined,
			enabled: typeof entry.enabled === "boolean" ? entry.enabled : undefined,
			installation_policy:
				normalizeUiText(entry.installation_policy as string | null | undefined) || undefined,
			authentication_policy:
				normalizeUiText(entry.authentication_policy as string | null | undefined) || undefined,
			scope: normalizeUiText(entry.scope as string | null | undefined) || undefined,
			discoverability:
				normalizeUiText(entry.discoverability as string | null | undefined) || undefined,
			creator_name: normalizeUiText(entry.creator_name as string | null | undefined) || undefined,
			release_version: normalizeUiText(release?.version as string | null | undefined) || undefined,
			description: normalizeUiText(release?.description as string | null | undefined) || undefined,
		});
	}
	return [...apps.values()].sort((left, right) =>
		(left.name ?? "").localeCompare(right.name ?? ""),
	);
}

export function normalizeChatgptLinkedAppProbes(value: unknown): ChatgptLinkedAppProbe[] {
	if (!Array.isArray(value)) return [];
	const links = new Map<string, ChatgptLinkedAppProbe>();
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const linkId = normalizeUiText((entry.link_id ?? entry.id) as string | null | undefined);
		const connectorId = normalizeUiText(
			(entry.connector_id ?? entry.app_id) as string | null | undefined,
		);
		const name = normalizeUiText((entry.name ?? entry.connector_name) as string | null | undefined);
		if (!linkId || !connectorId || !name) continue;
		links.set(linkId, {
			link_id: linkId,
			connector_id: connectorId,
			name,
			auth_status: normalizeUiText(entry.auth_status as string | null | undefined) || undefined,
			connector_status:
				normalizeUiText(entry.connector_status as string | null | undefined) || undefined,
			visibility: normalizeUiText(entry.visibility as string | null | undefined) || undefined,
			disable_auto_invocation:
				typeof entry.disable_auto_invocation === "boolean"
					? entry.disable_auto_invocation
					: undefined,
			actions_count: Array.isArray(entry.actions)
				? entry.actions.length
				: typeof entry.actions_count === "number"
					? entry.actions_count
					: undefined,
		});
	}
	return [...links.values()].sort((left, right) => {
		const byName = (left.name ?? "").localeCompare(right.name ?? "");
		return byName || (left.link_id ?? "").localeCompare(right.link_id ?? "");
	});
}

export function normalizeChatgptInstalledAppProbesForTest(
	value: unknown,
): ChatgptInstalledAppProbe[] {
	return normalizeChatgptInstalledAppProbes(value);
}

export function normalizeChatgptLinkedAppProbesForTest(value: unknown): ChatgptLinkedAppProbe[] {
	return normalizeChatgptLinkedAppProbes(value);
}

function normalizeChatgptModelControlProbe(
	value: ChatgptFeatureProbe["model_controls"],
): NonNullable<ChatgptFeatureProbe["model_controls"]> | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const visible = typeof value.visible === "boolean" ? value.visible : undefined;
	const label = normalizeUiText(value.label);
	const ariaLabel = normalizeUiText(value.aria_label);
	const location = normalizeUiText(value.location);
	const selector = normalizeUiText(value.selector);
	const modelOptions = normalizeUiTextList(value.model_options);
	const depthOptions = normalizeUiTextList(value.depth_options);
	const synthesizedOptions = normalizeUiTextList(value.synthesized_options);
	const selectedModel = normalizeUiText(value.selected_model);
	const selectedDepth = normalizeUiText(value.selected_depth);
	if (
		visible === undefined &&
		!label &&
		!ariaLabel &&
		!location &&
		!selector &&
		modelOptions.length === 0 &&
		depthOptions.length === 0 &&
		synthesizedOptions.length === 0 &&
		!selectedModel &&
		!selectedDepth
	) {
		return undefined;
	}
	return {
		visible,
		label: label || undefined,
		aria_label: ariaLabel || undefined,
		location: location || undefined,
		selector: selector || undefined,
		model_options: modelOptions.length > 0 ? modelOptions : undefined,
		depth_options: depthOptions.length > 0 ? depthOptions : undefined,
		synthesized_options: synthesizedOptions.length > 0 ? synthesizedOptions : undefined,
		selected_model: selectedModel || undefined,
		selected_depth: selectedDepth || undefined,
	};
}

function normalizeUiTextList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return Array.from(
		new Set(
			value
				.map((entry) => normalizeUiText(typeof entry === "string" ? entry : null))
				.filter(Boolean),
		),
	);
}

async function captureChatgptPluginDiscoveryProbes(
	client: ChromeClient,
): Promise<Pick<ChatgptFeatureProbe, "installed_apps" | "linked_apps">> {
	const endpoints = {
		installed_apps: "/backend-api/ps/plugins/installed",
		linked_apps: "/backend-api/aip/connectors/links/list_accessible",
	} as const;
	await client.Network.enable().catch(() => undefined);
	await client.Page.enable().catch(() => undefined);
	const payloadPromise = new Promise<Record<keyof typeof endpoints, unknown | null>>((resolve) => {
		const requestKinds = new Map<string, keyof typeof endpoints>();
		const payloads: Record<keyof typeof endpoints, unknown | null> = {
			installed_apps: null,
			linked_apps: null,
		};
		let settled = false;
		const finish = () => {
			if (settled || !Object.values(payloads).every((payload) => payload !== null)) return;
			settled = true;
			clearTimeout(timer);
			resolve(payloads);
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(payloads);
		}, 10_000);
		client.Network.responseReceived((params) => {
			if (settled) return;
			const url = params.response?.url ?? "";
			const status = params.response?.status ?? 0;
			if (status < 200 || status >= 300) return;
			for (const [kind, endpoint] of Object.entries(endpoints) as Array<
				[keyof typeof endpoints, string]
			>) {
				if (url.includes(endpoint)) {
					requestKinds.set(params.requestId, kind);
					break;
				}
			}
		});
		client.Network.loadingFinished(async (params) => {
			if (settled) return;
			const kind = requestKinds.get(params.requestId);
			if (!kind) return;
			const response = await client.Network.getResponseBody({ requestId: params.requestId }).catch(
				() => null,
			);
			if (!response?.body) return;
			try {
				const body = response.base64Encoded
					? Buffer.from(response.body, "base64").toString("utf8")
					: response.body;
				payloads[kind] = JSON.parse(body) as unknown;
				finish();
			} catch {
				// Keep waiting for another successful response for the same endpoint.
			}
		});
	});
	await reloadAndSettle(client, {
		ignoreCache: true,
		waitForDocumentReady: false,
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(
			client,
			"provider:chatgpt",
			"discover-installed-plugins-reload",
		),
	}).catch(() => undefined);
	const payloads = await payloadPromise;
	const installedPayload = isRecord(payloads.installed_apps) ? payloads.installed_apps : null;
	const linkedPayload = isRecord(payloads.linked_apps) ? payloads.linked_apps : null;
	return {
		installed_apps: normalizeChatgptInstalledAppProbes(installedPayload?.plugins),
		linked_apps: normalizeChatgptLinkedAppProbes(linkedPayload?.links),
	};
}

async function readChatgptFeatureSignature(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<string | null> {
	const locationResult = await client.Runtime.evaluate({
		expression: "location.href",
		returnByValue: true,
	});
	const locationHref =
		typeof locationResult.result?.value === "string" ? locationResult.result.value : "";
	let pluginDiscovery = locationHref.includes("/plugins")
		? await captureChatgptPluginDiscoveryProbes(client)
		: null;
	const result = await client.Runtime.evaluate({
		expression: buildChatgptFeatureProbeExpression(),
		awaitPromise: true,
		returnByValue: true,
	});
	const probe = (result.result?.value as ChatgptFeatureProbe | null | undefined) ?? null;
	const composerSurface = !locationHref.includes("/plugins")
		? await readChatgptComposerSurfaceProbe(client)
		: null;
	if (probe && composerSurface) {
		probe.composer_mode = composerSurface.composer_mode;
		probe.composer_apps = composerSurface.composer_apps;
		probe.apps = composerSurface.composer_apps
			.filter(
				(entry) => entry.selection_state === "selected" || entry.selection_state === "selectable",
			)
			.map((entry) =>
				normalizeUiText(entry.name)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "_")
					.replace(/^_+|_+$/g, ""),
			)
			.filter(Boolean);
		const composerTools = new Set(
			composerSurface.composer_tools.map((label) => label.toLowerCase()),
		);
		probe.web_search = composerTools.has("web search");
		probe.deep_research = composerTools.has("deep research");
		probe.company_knowledge = composerTools.has("company knowledge");
		probe.shopping = composerTools.has("shopping");
		probe.composer_tools = composerSurface.composer_tools;
	}
	if (!pluginDiscovery && options?.includeInstalledApps === true && locationHref) {
		try {
			await navigateToChatgptUrl(client, CHATGPT_PLUGINS_URL, undefined, options);
			pluginDiscovery = await captureChatgptPluginDiscoveryProbes(client);
		} finally {
			await navigateToChatgptUrl(client, locationHref, undefined, options).catch(() => undefined);
		}
	}
	if (probe && pluginDiscovery) {
		probe.installed_apps = pluginDiscovery.installed_apps ?? [];
		probe.linked_apps = pluginDiscovery.linked_apps ?? [];
	}
	return normalizeChatgptFeatureSignature(probe);
}

async function setCreateProjectFieldsWithClient(
	client: ChromeClient,
	fields: { name?: string; instructions?: string; memoryMode?: ProjectMemoryMode },
): Promise<void> {
	if (fields.name) {
		const ok = await setInputValue(client.Runtime, {
			selector: CHATGPT_PROJECT_NAME_INPUT_SELECTOR,
			rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
			value: fields.name,
			requireVisible: true,
			timeoutMs: 5000,
		});
		if (!ok) {
			throw new Error("ChatGPT project name input not found");
		}
	}
	if (fields.memoryMode) {
		await setCreateProjectMemoryModeWithClient(client, fields.memoryMode);
	}
}

async function setCreateProjectMemoryModeWithClient(
	client: ChromeClient,
	memoryMode: ProjectMemoryMode,
): Promise<void> {
	const targetLabel = resolveChatgptProjectMemoryLabel(memoryMode);
	const targetLabels = resolveChatgptProjectMemoryLabelCandidates(memoryMode);
	const normalizedTargetLabels = targetLabels.map((label) => normalizeUiText(label).toLowerCase());
	const interactionStrategies = ["pointer", "keyboard-space", "keyboard-arrowdown"] as const;
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			const menuAlreadyOpen = await waitForSelector(
				client.Runtime,
				CHATGPT_PROJECT_MEMORY_MENU_ITEM_SELECTOR,
				250,
			);
			if (!menuAlreadyOpen) {
				const opened = await openMenu(client.Runtime, {
					trigger: {
						match: { exact: [CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH] },
						requireVisible: true,
						rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
						interactionStrategies,
					},
					menuSelector: '[role="menu"]',
					expectedItemMatch: { startsWith: normalizedTargetLabels },
					timeoutMs: 3000,
				});
				if (!opened.ok) {
					const detail = JSON.stringify({
						reason: opened.reason,
						interactionStrategies,
						attemptedStrategies: opened.attemptedStrategies,
						rootSelectorUsed: opened.rootSelectorUsed,
					});
					throw new Error(`ChatGPT project settings menu trigger did not open (${detail})`);
				}
			}
			const { result } = await client.Runtime.evaluate({
				expression: `(() => {
          const targets = ${JSON.stringify(normalizedTargetLabels)};
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const isVisible = (node) => {
            if (!(node instanceof Element)) return false;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          };
          const menus = Array.from(document.querySelectorAll('[role="menu"]')).filter(isVisible);
          const items = menus.flatMap((menu) => Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"][aria-checked], button[aria-checked], [aria-checked]')))
            .filter(isVisible);
          const item = items.find((node) => {
            const label = normalize(node.textContent);
            return targets.some((target) => label === target || label.startsWith(target));
          });
          if (!item) {
            return {
              ok: false,
              reason: 'memory-option-missing',
              visibleOptions: items.map((node) => normalize(node.textContent)),
            };
          }
          item.click();
          return { ok: true };
        })()`,
				returnByValue: true,
			});
			const info = result?.value as
				| { ok?: boolean; reason?: string; visibleOptions?: string[] }
				| undefined;
			if (!info?.ok) {
				const visible =
					Array.isArray(info?.visibleOptions) && info.visibleOptions.length > 0
						? ` (${info.visibleOptions.join(", ")})`
						: "";
				throw new Error(`${info?.reason || "memory-option-click-failed"}${visible}`);
			}
			const closed = await waitForPredicate(
				client.Runtime,
				`(() => {
          const button = Array.from(document.querySelectorAll('button'))
            .find((node) => String(node.getAttribute('aria-label') || '') === ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL)});
          if (!button) return null;
          const expanded = String(button.getAttribute('aria-expanded') || '').toLowerCase();
          return expanded === '' || expanded === 'false' ? { ok: true } : null;
        })()`,
				{
					timeoutMs: 3000,
					description: `ChatGPT project settings menu closed after selecting ${targetLabel}`,
				},
			);
			if (!closed.ok) {
				throw new Error(
					`ChatGPT project settings menu did not close after selecting ${targetLabel}`,
				);
			}
		},
		{
			label: "chatgpt-set-create-project-memory-mode",
			candidateSelectors: [
				"button",
				'[role="menuitemradio"]',
				'[role="menuitem"][aria-checked]',
				'[role="menu"]',
			],
			context: {
				triggerLabel: CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL,
				triggerRoots: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
				interactionStrategies: [...interactionStrategies],
			},
		},
	);
}

async function clickCreateProjectConfirmWithClient(client: ChromeClient): Promise<void> {
	const ready = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 5000);
	if (!ready) {
		throw new Error("ChatGPT create-project dialog not found");
	}
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			const createConfirmButtonLabels = resolveChatgptProjectCreateConfirmButtonLabels();
			const pressed = await pressButton(client.Runtime, {
				match: { exact: createConfirmButtonLabels },
				rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
				requireVisible: true,
				interactionStrategies: ["pointer", "click", "keyboard-enter"],
				timeoutMs: 4000,
				logCandidatesOnMiss: true,
			});
			if (pressed.ok) return;
			const { result } = await client.Runtime.evaluate({
				expression: `(() => {
          const rootSelectors = ${JSON.stringify([...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS])};
          const blockedLabels = ${JSON.stringify([...CHATGPT_DIALOG_DISMISS_LABELS, "back", "cancel", "close"])};
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const isVisible = (el) => {
            if (!(el instanceof Element)) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };
          const roots = rootSelectors
            .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
            .filter((node, index, array) => array.indexOf(node) === index && isVisible(node));
          const dialog = roots[0] || document.querySelector('dialog[open]') || document.querySelector('[role="dialog"]');
          if (!dialog) return { ok: false, reason: 'dialog-missing' };
          const buttons = Array.from(dialog.querySelectorAll('button,[role="button"]'))
            .filter((button) => isVisible(button))
            .map((button) => {
              const label = normalize(button.getAttribute('aria-label') || button.textContent || button.getAttribute('title') || '');
              const disabled = Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true');
              const type = normalize(button.getAttribute('type') || '');
              return { button, label, disabled, type };
            });
          const submit =
            buttons.find((entry) => !entry.disabled && entry.type === 'submit' && !blockedLabels.includes(entry.label)) ||
            buttons.find((entry) => !entry.disabled && entry.label.includes('create') && !blockedLabels.includes(entry.label));
          if (!submit) {
            return {
              ok: false,
              reason: 'create-confirm-button-missing',
              labels: buttons.map((entry) => entry.label + (entry.disabled ? ' (disabled)' : '')).filter(Boolean),
            };
          }
          submit.button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 }));
          submit.button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
          submit.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 0 }));
          submit.button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
          submit.button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return {
            ok: true,
            matchedLabel: submit.label || submit.type,
            fallbackKind: submit.type === 'submit' ? 'submit-button' : 'semantic-create-button',
            url: window.location.href,
            title: document.title,
          };
        })()`,
				returnByValue: true,
			});
			const info = result?.value as
				| {
						ok?: boolean;
						reason?: string;
						labels?: string[];
						matchedLabel?: string;
						fallbackKind?: string;
						url?: string;
						title?: string;
				  }
				| undefined;
			if (!info?.ok) {
				const labels =
					Array.isArray(info?.labels) && info.labels.length > 0
						? ` (visible buttons: ${info.labels.join(", ")})`
						: "";
				throw new Error(
					`${info?.reason || pressed.reason || "ChatGPT create project button not found"}${labels}`,
				);
			}
			await recordChatgptCreateProjectConfirmDriftObservation(info);
		},
		{
			label: "chatgpt-click-create-project-confirm",
			candidateSelectors: ["button", '[role="button"]', CHATGPT_PROJECT_DIALOG_SELECTOR],
			context: {
				expectedLabels: resolveChatgptProjectCreateConfirmButtonLabels(),
				dialogRoots: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
			},
		},
	);
}

function resolveChatgptProjectCreateConfirmButtonLabels(): string[] {
	return resolveEffectiveServiceUiLabelSet("chatgpt", "project_create_confirm_buttons", [
		"create project",
		"create",
		"continue",
	])
		.map((label) => normalizeUiText(label).toLowerCase())
		.filter(Boolean);
}

async function recordChatgptCreateProjectConfirmDriftObservation(info: {
	matchedLabel?: string;
	fallbackKind?: string;
	url?: string;
	title?: string;
}): Promise<void> {
	try {
		await recordDomDriftObservation({
			service: "chatgpt",
			surface: "project-create-dialog",
			action: "confirm-create-project",
			expectedLabels: resolveChatgptProjectCreateConfirmButtonLabels(),
			observedLabel: normalizeUiText(info.matchedLabel),
			fallbackKind: normalizeUiText(info.fallbackKind) || "unknown",
			rootSelector: CHATGPT_PROJECT_DIALOG_SELECTOR,
			url: info.url,
			title: info.title,
			metadata: {
				source: "chatgptAdapter.clickCreateProjectConfirmWithClient",
				handling: "successful-configured-label-miss-fallback",
			},
		});
	} catch {
		// Drift observation is operator evidence. It should never make a recovered UI action fail.
	}
}

async function openProjectSettingsPanel(client: ChromeClient, projectId: string): Promise<void> {
	const projectUrl = resolveChatgptProjectUrl(projectId);
	let routeReady: Awaited<ReturnType<typeof waitForPredicate>> | null = null;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await navigateToChatgptUrl(client, projectUrl, projectId);
		routeReady = await waitForPredicate(client.Runtime, buildProjectRouteExpression(projectId), {
			timeoutMs: 15_000,
			description: `ChatGPT project route ready for ${projectId}`,
		});
		if (routeReady.ok) {
			try {
				await withUiDiagnostics(
					client.Runtime,
					async () => {
						const opened = await openSurface(client.Runtime, {
							readyExpression: buildProjectSettingsReadyExpression(),
							readyDescription: "ChatGPT project settings ready",
							alreadyOpenTimeoutMs: 800,
							readyTimeoutMs: 3_000,
							timeoutMs: 5_000,
							attempts: [
								{
									name: "edit-title",
									trigger: {
										match: { startsWith: [CHATGPT_PROJECT_TITLE_EDIT_PREFIX] },
										requireVisible: true,
										timeoutMs: 5_000,
									},
								},
								{
									name: "show-project-details",
									trigger: {
										match: { exact: [CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL] },
										requireVisible: true,
										timeoutMs: 3_000,
									},
								},
								{
									name: "edit-title-retry",
									trigger: {
										match: { startsWith: [CHATGPT_PROJECT_TITLE_EDIT_PREFIX] },
										requireVisible: true,
										timeoutMs: 5_000,
									},
								},
							],
						});
						if (!opened.ok) {
							throw new Error(
								`ChatGPT project settings did not open (${JSON.stringify({
									reason: opened.reason,
									attempts: opened.attempts,
								})})`,
							);
						}
					},
					{
						label: "chatgpt-open-project-settings",
						candidateSelectors: ["button", '[role="button"]', "input", "textarea"],
						context: {
							surface: "chatgpt-project-settings",
							fallbackTriggers: ["edit-title", "show-project-details", "edit-title-retry"],
						},
					},
				);
				return;
			} catch (error) {
				if (attempt === 1) {
					throw error;
				}
			}
		}
		await reloadAndSettle(client, {
			ignoreCache: false,
			waitForDocumentReady: false,
			mutationAudit: resolveMutationAudit(client),
			mutationSource: resolveMutationSource(
				client,
				"provider:chatgpt",
				"project-hydration-retry-reload",
			),
		}).catch(() => undefined);
		await sleep(1_000 + attempt * 750);
	}
	if (!routeReady?.ok) {
		throw new Error(`ChatGPT project surface did not hydrate for ${projectId}`);
	}
}

async function waitForProjectSettingsFields(
	client: ChromeClient,
	required: { name?: boolean; instructions?: boolean },
	timeoutMs: number,
): Promise<boolean> {
	const ready = await waitForPredicate(
		client.Runtime,
		`(() => {
      const requireName = ${JSON.stringify(Boolean(required.name))};
      const requireInstructions = ${JSON.stringify(Boolean(required.instructions))};
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return dialogs.some((dialog) => {
        if (!isVisible(dialog)) return false;
        const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
        const instructions = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (requireName && !(nameInput && isVisible(nameInput))) {
          return false;
        }
        if (requireInstructions && !(instructions && isVisible(instructions))) {
          return false;
        }
        return true;
      }) ? { ok: true } : null;
    })()`,
		{
			timeoutMs,
			description: "ChatGPT project settings fields ready",
		},
	);
	return ready.ok;
}

async function tagProjectSettingsDialog(
	client: ChromeClient,
	required: { name?: boolean; instructions?: boolean },
): Promise<string> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const attr = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_DIALOG_ATTR)};
      const requireName = ${JSON.stringify(Boolean(required.name))};
      const requireInstructions = ${JSON.stringify(Boolean(required.instructions))};
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      for (const node of Array.from(document.querySelectorAll('[' + attr + ']'))) {
        node.removeAttribute(attr);
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((dialog) => isVisible(dialog));
      for (const dialog of dialogs) {
        const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
        const instructions = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (requireName && !(nameInput && isVisible(nameInput))) {
          continue;
        }
        if (requireInstructions && !(instructions && isVisible(instructions))) {
          continue;
        }
        dialog.setAttribute(attr, 'true');
        return { ok: true, selector: '[' + attr + '="true"]' };
      }
      return { ok: false };
    })()`,
		returnByValue: true,
	});
	const info = result?.value as { ok?: boolean; selector?: string } | undefined;
	if (!info?.ok || !info.selector) {
		throw new Error("ChatGPT project settings dialog not found");
	}
	return info.selector;
}

async function applyProjectSettings(
	client: ChromeClient,
	projectId: string,
	fields: { name?: string; instructions?: string },
): Promise<void> {
	await openProjectSettingsPanel(client, projectId);
	const settingsReady = await waitForProjectSettingsFields(
		client,
		{
			name: Boolean(fields.name),
			instructions: fields.instructions !== undefined,
		},
		6_000,
	);
	if (!settingsReady) {
		throw new Error("ChatGPT project settings fields did not hydrate");
	}
	const settingsRootSelector = await tagProjectSettingsDialog(client, {
		name: Boolean(fields.name),
		instructions: fields.instructions !== undefined,
	});
	if (fields.name) {
		const renamed = await setInputValue(client.Runtime, {
			selector: CHATGPT_PROJECT_NAME_INPUT_SELECTOR,
			rootSelectors: [settingsRootSelector],
			value: fields.name,
			requireVisible: true,
			timeoutMs: 5000,
		});
		if (!renamed) {
			throw new Error("ChatGPT project settings name input not found");
		}
	}
	if (fields.instructions !== undefined) {
		const updated = await setInputValue(client.Runtime, {
			selector: CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR,
			rootSelectors: [settingsRootSelector],
			value: fields.instructions,
			requireVisible: true,
			timeoutMs: 5000,
		});
		if (!updated) {
			throw new Error("ChatGPT project instructions textarea not found");
		}
		await waitForPredicate(
			client.Runtime,
			`(() => {
        const root = document.querySelector(${JSON.stringify(settingsRootSelector)});
        if (!(root instanceof Element)) return null;
        const textarea = root.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (!(textarea instanceof HTMLTextAreaElement)) return null;
        return textarea.value === ${JSON.stringify(fields.instructions)} ? { ok: true } : null;
      })()`,
			{
				timeoutMs: 3_000,
				description: "ChatGPT project instructions textarea updated",
			},
		).catch(() => undefined);
		await sleep(600);
	}
	await commitProjectSettingsDialog(client, settingsRootSelector);
}

async function commitProjectSettingsDialog(
	client: ChromeClient,
	settingsRootSelector: string,
): Promise<void> {
	const deadline = Date.now() + 5_000;
	let info:
		| {
				committed?: boolean;
				hasCommitButton?: boolean;
				commitDisabled?: boolean;
				reason?: string;
		  }
		| undefined;
	do {
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const root = document.querySelector(${JSON.stringify(settingsRootSelector)});
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (!root) {
          return { committed: false, reason: 'dialog-missing' };
        }
        const commitLabels = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS)};
        const commitButton = Array.from(root.querySelectorAll('button,[role="button"]')).find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '');
          return commitLabels.includes(label) || label.startsWith('save ');
        });
        if (commitButton instanceof HTMLElement) {
          if (!commitButton.hasAttribute('disabled') && commitButton.getAttribute('aria-disabled') !== 'true') {
            commitButton.click();
            return {
              committed: true,
              label: normalize(commitButton.textContent || commitButton.getAttribute('aria-label') || commitButton.getAttribute('title') || ''),
            };
          }
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          return {
            committed: false,
            hasCommitButton: true,
            commitDisabled: true,
          };
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return { committed: false, hasCommitButton: false, commitDisabled: false };
      })()`,
			returnByValue: true,
		});
		info = result?.value as
			| {
					committed?: boolean;
					hasCommitButton?: boolean;
					commitDisabled?: boolean;
					reason?: string;
			  }
			| undefined;
		if (info?.committed) {
			break;
		}
		await sleep(250);
	} while (Date.now() < deadline);
	if (info?.committed) {
		await waitForPredicate(
			client.Runtime,
			`(() => document.querySelector(${JSON.stringify(settingsRootSelector)}) ? null : { ok: true })()`,
			{
				timeoutMs: 5_000,
				description: "ChatGPT project settings dialog closed after commit",
			},
		).catch(() => undefined);
	}
	await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
}

async function readProjectSettingsSnapshot(
	client: ChromeClient,
): Promise<ChatgptProjectSettingsSnapshot> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const memoryLabels = ${JSON.stringify([
				CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL,
				CHATGPT_PROJECT_MEMORY_PROJECT_LABEL,
			])}.map((value) => normalize(value));
      const dialog = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .find((node) => node.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)}) || node.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)}));
      if (!dialog) return null;
      const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
      const textarea = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
      const selectedMemory = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
          return memoryLabels.includes(label) && node.hasAttribute('disabled');
        });
      return {
        name: nameInput instanceof HTMLInputElement ? nameInput.value || '' : '',
        text: textarea instanceof HTMLTextAreaElement ? textarea.value || '' : '',
        memoryModeLabel: selectedMemory ? normalize(selectedMemory.textContent || selectedMemory.getAttribute('aria-label') || '') : null,
      };
    })()`,
		returnByValue: true,
	});
	const value = result?.value as
		| { name?: string; text?: string; memoryModeLabel?: string | null }
		| null
		| undefined;
	if (!value) {
		throw new Error("ChatGPT project settings dialog is not open");
	}
	return {
		name: value.name ?? "",
		text: value.text ?? "",
		memoryModeLabel: value.memoryModeLabel ?? null,
	};
}

async function waitForProjectSettingsApplied(
	client: ChromeClient,
	projectId: string,
	expected: { name?: string; instructions?: string },
): Promise<void> {
	const deadline = Date.now() + 15_000;
	let lastSnapshot: ChatgptProjectSettingsSnapshot | null = null;
	while (Date.now() < deadline) {
		await openProjectSettingsPanel(client, projectId);
		const snapshot = await readProjectSettingsSnapshot(client);
		lastSnapshot = snapshot;
		await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
		if (matchesChatgptProjectSettingsSnapshot(snapshot, expected)) {
			return;
		}
		await sleep(1_000);
	}
	throw new Error(
		`ChatGPT project settings did not persist (${JSON.stringify({
			expected: {
				name: typeof expected.name === "string" ? normalizeUiText(expected.name) : undefined,
				instructions:
					typeof expected.instructions === "string"
						? normalizeInstructionComparisonText(expected.instructions)
						: undefined,
			},
			actual: lastSnapshot
				? {
						name: normalizeUiText(lastSnapshot.name),
						instructions: normalizeInstructionComparisonText(lastSnapshot.text),
					}
				: null,
		})})`,
	);
}

async function readCurrentProject(client: ChromeClient): Promise<Project | null> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const titleEditPrefix = ${JSON.stringify(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)};
      const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
      if (!match) return null;
      const projectId = match[1];
      const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith(titleEditPrefix));
      const title = (titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || projectId)
        .replace(/\\s+/g, ' ')
        .trim();
      return {
        id: projectId,
        name: title || projectId,
        url: location.href,
      };
    })()`,
		returnByValue: true,
	});
	const value = result?.value as { id?: string; name?: string; url?: string } | null;
	const normalizedId = normalizeChatgptProjectId(value?.id);
	if (!normalizedId) return null;
	return {
		id: normalizedId,
		name: value?.name || normalizedId,
		provider: "chatgpt",
		url: value?.url || resolveChatgptProjectUrl(normalizedId),
	};
}

async function scrapeChatgptProjects(
	client: ChromeClient,
	options: { disableClickFallback?: boolean } = {},
): Promise<Project[]> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const titleEditPrefix = ${JSON.stringify(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)};
      const parseProjectId = (href) => {
        try {
          const url = new URL(href, location.origin);
          const match = url.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/) || url.pathname.match(/^\\/g\\/([^/]+)\\/c\\/[^/]+\\/?$/);
          if (!match) return null;
          const raw = String(match[1] || '').trim();
          const normalized = raw.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
          return normalized ? normalized[1] : null;
        } catch {
          return null;
        }
      };
      const projects = new Map();
      const currentId = parseProjectId(location.href);
      if (currentId) {
        const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
          .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith(titleEditPrefix));
        const currentName = normalize(titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || currentId);
        projects.set(currentId, {
          id: currentId,
          name: currentName || currentId,
          url: location.href,
        });
      }
      for (const row of Array.from(document.querySelectorAll('[data-app-action-sidebar-project-id]'))) {
        const rawId = row.getAttribute('data-app-action-sidebar-project-id') || '';
        const projectId = parseProjectId('/g/' + rawId + '/project');
        if (!projectId || projects.has(projectId)) continue;
        const name = normalize(row.getAttribute('data-app-action-sidebar-project-label') || projectId);
        projects.set(projectId, {
          id: projectId,
          name: name || projectId,
          url: new URL('/g/' + projectId + '/project', location.origin).toString(),
        });
      }
      for (const link of Array.from(document.querySelectorAll('a[href*="/project"]'))) {
        const href = link.getAttribute('href') || '';
        const projectId = parseProjectId(href);
        if (!projectId) continue;
        const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
        const name = normalize(link.textContent || projectId) || projectId;
        if (!projects.has(projectId)) {
          projects.set(projectId, { id: projectId, name, url });
        }
      }
      return Array.from(projects.values());
    })()`,
		returnByValue: true,
	});
	let probes = (result?.value ?? []) as ChatgptProjectLinkProbe[];
	if (probes.length === 0 && options.disableClickFallback !== true) {
		probes = await scrapeChatgptProjectsFromSidebarButtons(client);
	}
	return probes.map((project) => ({
		id: project.id,
		name: project.name,
		provider: "chatgpt",
		url: project.url ?? resolveChatgptProjectUrl(project.id),
	}));
}

async function scrapeChatgptProjectsFromSidebarButtons(
	client: ChromeClient,
): Promise<ChatgptProjectLinkProbe[]> {
	const { result } = await client.Runtime.evaluate({
		expression: `(async () => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const titleEditPrefix = ${JSON.stringify(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const parseProjectId = (href) => {
        try {
          const url = new URL(href, location.origin);
          const match = url.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/) || url.pathname.match(/^\\/g\\/([^/]+)\\/c\\/[^/]+\\/?$/);
          if (!match) return null;
          const raw = String(match[1] || '').trim();
          const normalized = raw.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
          return normalized ? normalized[1] : null;
        } catch {
          return null;
        }
      };
      const dispatchClick = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const base = { bubbles: true, cancelable: true, button: 0, view: window };
        node.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'mouse', buttons: 1 }));
        node.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
        node.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'mouse', buttons: 0 }));
        node.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
        node.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
        return true;
      };
      const findOptionButtons = () =>
        Array.from(document.querySelectorAll('button[aria-label^="Open project options for "]'));
      const projectNames = Array.from(new Set(findOptionButtons()
        .map((button) => normalize(button.getAttribute('aria-label')).replace(/^Open project options for\\s+/i, ''))
        .filter(Boolean)));
      const projects = new Map();
      for (const name of projectNames.slice(0, 50)) {
        const optionButton = findOptionButtons().find((button) =>
          normalize(button.getAttribute('aria-label')) === \`Open project options for \${name}\`
        );
        const rowRoot = optionButton?.closest('[class*="project-unfurl-row"]');
        const target =
          rowRoot?.querySelector('button[aria-label="Open project home"]') ??
          rowRoot?.querySelector('[role="button"][data-sidebar-item="true"]');
        if (!dispatchClick(target)) continue;
        let projectId = null;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          await sleep(100);
          projectId = parseProjectId(location.href);
          if (projectId) break;
        }
        if (!projectId) continue;
        const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
          .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith(titleEditPrefix));
        const currentName = normalize(titleButton?.textContent || name || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || projectId);
        if (!projects.has(projectId)) {
          projects.set(projectId, {
            id: projectId,
            name: currentName || name || projectId,
            url: location.href,
          });
        }
      }
      return Array.from(projects.values());
    })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	return (result?.value ?? []) as ChatgptProjectLinkProbe[];
}

export function resolveChatgptConversationUrl(
	conversationId: string,
	projectId?: string | null,
): string {
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	return normalizedProjectId
		? interpolateChatgptRoute(CHATGPT_PROJECT_CONVERSATION_URL_TEMPLATE, {
				projectId: normalizedProjectId,
				conversationId,
			})
		: interpolateChatgptRoute(CHATGPT_CONVERSATION_URL_TEMPLATE, { conversationId });
}

function resolveChatgptConversationListUrl(projectId?: string | null): string {
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	return normalizedProjectId ? resolveChatgptProjectUrl(normalizedProjectId) : CHATGPT_HOME_URL;
}

async function navigateToChatgptConversation(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
	options?: BrowserProviderListOptions,
): Promise<void> {
	const url = resolveChatgptConversationUrl(conversationId, projectId);
	const settled = await navigateAndSettle(client, {
		url,
		routeExpression: buildConversationRouteExpression(conversationId, projectId),
		routeDescription: projectId
			? `chatgpt project conversation ${conversationId} in ${projectId}`
			: `chatgpt conversation ${conversationId}`,
		readyExpression: buildConversationSurfaceReadyExpression(conversationId, projectId),
		readyDescription: projectId
			? `ChatGPT project conversation ${conversationId} ready`
			: `ChatGPT conversation ${conversationId} ready`,
		waitForDocumentReady: true,
		fallbackToLocationAssign: true,
		timeoutMs: 15_000,
		fallbackTimeoutMs: 10_000,
		interactionGovernor: options?.interactionGovernor,
		interactionClass: "renavigation",
		mutationAudit: resolveMutationAudit(client),
		mutationSource: resolveMutationSource(client, "provider:chatgpt", "navigate-conversation"),
	});
	if (settled.mutationPerformed) {
		recordBrowserScrapeCdpCall(options, "Page.navigate");
		recordBrowserScrapeProviderAction(options, "chatgpt.navigateConversation");
	} else {
		recordBrowserScrapeProviderAction(options, "chatgpt.skipSameRouteNavigation");
	}
	await recordChatgptTargetNavigation(settled.mutationPerformed, options);
	if (!settled.ok) {
		throw new Error(settled.reason || `ChatGPT conversation ${conversationId} did not settle`);
	}
}

async function scrapeChatgptConversations(
	client: ChromeClient,
	projectId?: string | null,
	options?: BrowserProviderListOptions,
	debugContext?: ChatgptRecoveryDebugContext,
): Promise<Conversation[]> {
	return withChatgptBlockingSurfaceRecovery(
		client,
		`scrapeChatgptConversations:${projectId ?? "root"}`,
		async () => {
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const historyLimit = normalizeChatgptConversationHistoryLimit(options?.historyLimit);
			if (normalizedProjectId) {
				await navigateToChatgptUrl(
					client,
					resolveChatgptProjectUrl(normalizedProjectId),
					normalizedProjectId,
				);
				const ready = await waitForPredicate(
					client.Runtime,
					buildProjectChatsReadyExpression(normalizedProjectId),
					{
						timeoutMs: 3_000,
						description: `ChatGPT project chats ready for ${normalizedProjectId}`,
					},
				);
				if (!ready.ok) {
					await withUiDiagnostics(
						client.Runtime,
						async () => {
							const opened = await openSurface(client.Runtime, {
								readyExpression: buildProjectChatsReadyExpression(normalizedProjectId),
								readyDescription: `ChatGPT project chats ready for ${normalizedProjectId}`,
								alreadyOpenTimeoutMs: 800,
								readyTimeoutMs: 3_000,
								timeoutMs: 5_000,
								attempts: [
									{
										name: "chats-tab-label",
										trigger: {
											match: { exact: [CHATGPT_PROJECT_TAB_CHATS_LABEL] },
											rootSelectors: ['[role="tablist"]'],
											interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"],
											requireVisible: true,
											timeoutMs: 3_000,
										},
									},
								],
							});
							if (!opened.ok) {
								throw new Error(
									`ChatGPT project chats tab did not open (${JSON.stringify({
										reason: opened.reason,
										attempts: opened.attempts,
									})})`,
								);
							}
						},
						{
							label: "chatgpt-open-project-chats",
							candidateSelectors: ['[role="tab"]', '[role="tabpanel"]', 'a[href*="/c/"]'],
							context: {
								surface: "chatgpt-project-chats",
								projectId: normalizedProjectId,
							},
						},
					);
				}
			}
			await ensureChatgptSidebarOpen(client);
			const readConversations = async (): Promise<Conversation[]> => {
				const { result } = await client.Runtime.evaluate({
					expression: `(() => {
      const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
      const conversationOptionsPrefix = ${JSON.stringify(CHATGPT_CONVERSATION_OPTIONS_PREFIX)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const normalizeProjectId = (value) => {
        const trimmed = String(value || '').trim();
        const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
        return match ? match[1] : null;
      };
      const parse = (href) => {
        try {
          const parsed = new URL(href, location.origin);
          const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
          if (!match) return null;
          return {
            id: String(match[2] || '').trim(),
            projectId: normalizeProjectId(match[1]),
            url: parsed.toString(),
          };
        } catch {
          return null;
        }
      };
      const normalizeTimestamp = (value) => {
        const text = String(value || '').trim();
        if (!text) return null;
        const timestamp = Date.parse(text);
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
      };
      const readConversationHistoryCache = () => {
        const entries = new Map();
        const addItem = (item, sourceKey) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return;
          const id = normalize(item.id || item.conversation_id || item.conversationId);
          if (!id) return;
          const title = normalize(item.title || item.name);
          const updatedAt =
            normalizeTimestamp(item.update_time) ||
            normalizeTimestamp(item.updated_at) ||
            normalizeTimestamp(item.updatedAt) ||
            normalizeTimestamp(item.create_time) ||
            normalizeTimestamp(item.created_at) ||
            normalizeTimestamp(item.createdAt);
          if (!updatedAt) return;
          const projectId = normalizeProjectId(
            item.conversation_template_id ||
              item.gizmo_id ||
              item.gizmoId ||
              item.project_id ||
              item.projectId ||
              item.gizmo?.gizmo?.id ||
              item.gizmo?.id,
          );
          const previous = entries.get(id);
          if (previous && Date.parse(previous.updatedAt) >= Date.parse(updatedAt)) return;
          entries.set(id, {
            title: title && title !== id ? title : null,
            updatedAt,
            createdAt: normalizeTimestamp(item.create_time || item.created_at || item.createdAt),
            projectId,
            sourceKey,
          });
        };
        const visit = (value, sourceKey, depth = 0) => {
          if (!value || typeof value !== 'object' || depth > 5) return;
          if (Array.isArray(value)) {
            for (const item of value) visit(item, sourceKey, depth + 1);
            return;
          }
          addItem(value, sourceKey);
          const pages = value.pages;
          if (Array.isArray(pages)) {
            for (const page of pages) visit(page, sourceKey, depth + 1);
          }
          const items = value.items;
          if (Array.isArray(items)) {
            for (const item of items) visit(item, sourceKey, depth + 1);
          }
          const innerValue = value.value;
          if (innerValue && typeof innerValue === 'object') {
            visit(innerValue, sourceKey, depth + 1);
          }
        };
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index) || '';
            if (!/conversation-history|snorlax-history/i.test(key)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            visit(parsed, key);
          }
        } catch {
          return entries;
        }
        return entries;
      };
      const conversationHistoryCache = readConversationHistoryCache();
      const probes = new Map();
      const pushProbe = (probe) => {
        if (!probe || !probe.id) return;
        if (expectedProjectId && probe.projectId !== expectedProjectId) return;
        const previous = probes.get(probe.id);
        if (!previous) {
          probes.set(probe.id, probe);
          return;
        }
        const previousTitle = normalize(previous.title);
        const nextTitle = normalize(probe.title);
        const useNext =
          (!previousTitle || previousTitle === previous.id) && nextTitle.length > 0
            ? true
            : Boolean(!previous.updatedAt && probe.updatedAt) ||
                Boolean(!previous.url && probe.url) ||
                Boolean(!previous.projectId && probe.projectId);
        if (useNext) {
          probes.set(probe.id, { ...previous, ...probe });
        }
      };
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const findRowButtonLabel = (anchor) => {
        let current = anchor instanceof Element ? anchor : null;
        while (current && current !== document.body) {
          const button = Array.from(current.querySelectorAll('button[aria-label]'))
            .find((node) => {
              if (!(node instanceof HTMLButtonElement)) return false;
              if (!isVisible(node)) return false;
              const label = normalize(node.getAttribute('aria-label') || '').toLowerCase();
              return label.startsWith(conversationOptionsPrefix);
            });
          if (button instanceof HTMLButtonElement) {
            const label = normalize(button.getAttribute('aria-label') || '').toLowerCase();
            return label.startsWith(conversationOptionsPrefix)
              ? label.slice(conversationOptionsPrefix.length).trim()
              : label;
          }
          current = current.parentElement;
        }
        return '';
      };
      const extractLeafTexts = (root) =>
        Array.from(root.querySelectorAll('div, span, p'))
          .map((node) => normalize(node.textContent || ''))
          .filter(Boolean);
      const findRowTitle = (anchor) => {
        let current = anchor instanceof Element ? anchor : null;
        while (current && current !== document.body) {
          const leafTexts = Array.from(new Set(extractLeafTexts(current)))
            .filter((text) => {
              const lowered = normalize(text).toLowerCase();
              return lowered.length > 0 && !['chatgpt', 'new chat'].includes(lowered);
            })
            .sort((left, right) => left.length - right.length);
          const concreteLeaf = leafTexts[0] || '';
          if (concreteLeaf) {
            return concreteLeaf;
          }
          current = current.parentElement;
        }
        return '';
      };
      const readAnchorProbe = (anchor) => {
        const info = parse(anchor.getAttribute('href') || '');
        if (!info) return null;
        const cached = conversationHistoryCache.get(info.id) || null;
        const rowLabel = findRowButtonLabel(anchor);
        const rowTitle = findRowTitle(anchor);
        const titleCandidate =
          rowTitle ||
          rowLabel ||
          normalize(cached?.title || '') ||
          normalize(anchor.getAttribute('aria-label') || '') ||
          normalize(anchor.textContent || '') ||
          normalize(anchor.getAttribute('title') || '');
        const title =
          titleCandidate && !['chatgpt', 'new chat'].includes(normalize(titleCandidate).toLowerCase())
            ? titleCandidate
            : info.id;
        return {
          ...info,
          title,
          updatedAt: cached?.updatedAt || null,
          metadata: cached
            ? {
                chatgptHistoryCacheSource: cached.sourceKey,
                chatgptHistoryCacheCreatedAt: cached.createdAt || null,
                chatgptHistoryCacheProjectId: cached.projectId || null,
              }
            : null,
        };
      };

      const current = parse(location.href);
      if (current) {
        pushProbe({
          ...current,
          title: normalize(document.title.replace(/^ChatGPT\\s*-\\s*/i, '')) || current.id,
        });
      }

      const projectPanelAnchors = expectedProjectId
        ? Array.from(document.querySelectorAll('[role="tabpanel"]'))
            .flatMap((panel) => Array.from(panel.querySelectorAll('a[href*="/c/"]')))
        : [];
      const anchors = projectPanelAnchors.length > 0
        ? projectPanelAnchors
        : Array.from(document.querySelectorAll('a[href*="/c/"]'));
      for (const anchor of anchors) {
        const probe = readAnchorProbe(anchor);
        if (!probe) continue;
        pushProbe(probe);
      }

        return Array.from(probes.values());
      })()`,
					returnByValue: true,
				});
				const probes = Array.isArray(result?.value)
					? (result.value as ChatgptConversationLinkProbe[])
					: [];
				return normalizeChatgptConversationLinkProbes(probes);
			};

			const deadline = Date.now() + 6_000;
			let last: Conversation[] = [];
			while (Date.now() < deadline) {
				const conversations = await readConversations();
				if (conversations.length > 0) {
					if (options?.includeHistory === true && historyLimit > conversations.length) {
						return await readChatgptConversationHistory(
							client,
							normalizedProjectId,
							historyLimit,
							readConversations,
						);
					}
					return historyLimit > 0 ? conversations.slice(0, historyLimit) : conversations;
				}
				last = conversations;
				await sleep(600);
			}
			return historyLimit > 0 ? last.slice(0, historyLimit) : last;
		},
		{
			debugContext,
			reopen: buildChatgptListReopen(client, projectId),
		},
	);
}

export function normalizeChatgptConversationHistoryLimit(value: number | null | undefined): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.floor(Number(value)));
}

async function readChatgptConversationHistory(
	client: ChromeClient,
	projectId: string | null,
	limit: number,
	readConversations: () => Promise<Conversation[]>,
): Promise<Conversation[]> {
	const maxScrolls = Math.min(160, Math.max(8, Math.ceil(limit / 8) + 12));
	let conversations = await readConversations();
	let stableReads = 0;
	for (
		let attempt = 0;
		attempt < maxScrolls && conversations.length < limit && stableReads < 5;
		attempt += 1
	) {
		const beforeCount = conversations.length;
		const scroll = await scrollChatgptConversationHistoryRail(client, projectId);
		await sleep(650 + Math.floor(Math.random() * 350));
		conversations = await readConversations();
		if (conversations.length > beforeCount) {
			stableReads = 0;
			continue;
		}
		stableReads += scroll.moved || scroll.canScroll ? 1 : 2;
	}
	return conversations.slice(0, limit);
}

async function scrollChatgptConversationHistoryRail(
	client: ChromeClient,
	projectId: string | null,
): Promise<{ moved: boolean; canScroll: boolean; anchorCount: number; reason?: string }> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const expectedProjectId = ${JSON.stringify(projectId)};
      const normalizeProjectId = (value) => {
        const trimmed = String(value || '').trim();
        const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
        return match ? match[1] : null;
      };
      const parse = (href) => {
        try {
          const parsed = new URL(href, location.origin);
          const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
          if (!match) return null;
          return { id: String(match[2] || '').trim(), projectId: normalizeProjectId(match[1]) };
        } catch {
          return null;
        }
      };
      const anchors = Array.from(document.querySelectorAll('a[href*="/c/"]'))
        .filter((anchor) => {
          const info = parse(anchor.getAttribute('href') || '');
          if (!info) return false;
          return expectedProjectId ? info.projectId === expectedProjectId : true;
        });
      if (anchors.length === 0) {
        return { moved: false, canScroll: false, anchorCount: 0, reason: 'no-conversation-anchors' };
      }
      const candidates = new Map();
      const addCandidate = (node) => {
        if (!(node instanceof Element) && node !== document.scrollingElement) return;
        const element = node;
        const scrollHeight = Number(element.scrollHeight || 0);
        const clientHeight = Number(element.clientHeight || 0);
        if (scrollHeight <= clientHeight + 24) return;
        let anchorCount = 0;
        for (const anchor of anchors) {
          if (element === document.scrollingElement || element.contains(anchor)) anchorCount += 1;
        }
        if (anchorCount <= 0) return;
        const room = Math.max(0, scrollHeight - clientHeight - Number(element.scrollTop || 0));
        const score = anchorCount * 100000 + room;
        candidates.set(element, { element, anchorCount, room, score, scrollHeight, clientHeight });
      };
      for (const selector of ['[role="tabpanel"]', 'nav', 'aside', '[role="navigation"]', 'main', 'body']) {
        for (const node of Array.from(document.querySelectorAll(selector))) addCandidate(node);
      }
      addCandidate(document.scrollingElement);
      for (const anchor of anchors) {
        let current = anchor.parentElement;
        while (current && current !== document.body) {
          addCandidate(current);
          current = current.parentElement;
        }
      }
      const best = Array.from(candidates.values()).sort((left, right) => right.score - left.score)[0];
      if (!best) {
        return { moved: false, canScroll: false, anchorCount: anchors.length, reason: 'no-scroll-container' };
      }
      const before = Number(best.element.scrollTop || 0);
      const delta = Math.max(520, Math.floor(best.clientHeight * 0.85));
      best.element.scrollTop = Math.min(best.scrollHeight - best.clientHeight, before + delta);
      best.element.dispatchEvent(new Event('scroll', { bubbles: true }));
      const after = Number(best.element.scrollTop || 0);
      return {
        moved: after > before,
        canScroll: after < best.scrollHeight - best.clientHeight - 4,
        anchorCount: anchors.length,
      };
    })()`,
		returnByValue: true,
	});
	const value = result?.value as
		| { moved?: boolean; canScroll?: boolean; anchorCount?: number; reason?: string }
		| undefined;
	return {
		moved: value?.moved === true,
		canScroll: value?.canScroll === true,
		anchorCount: Number.isFinite(value?.anchorCount) ? Number(value?.anchorCount) : 0,
		reason: typeof value?.reason === "string" ? value.reason : undefined,
	};
}

async function _tagChatgptConversationRow(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
): Promise<{ rowSelector: string; actionSelector: string }> {
	await ensureChatgptSidebarOpen(client);
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	const deadline = Date.now() + 10_000;
	let lastInfo: ChatgptConversationRowTagEvaluation | undefined;
	let attempts = 0;
	while (Date.now() < deadline) {
		attempts += 1;
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const conversationId = ${JSON.stringify(conversationId)};
        const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
        const rowAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ROW_ATTR)};
        const actionAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const normalizeDocumentTitle = (value) =>
          normalize(value)
            .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
            .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
            .trim();
        const normalizeProjectId = (value) => {
          const trimmed = String(value || '').trim();
          const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
          return match ? match[1] : null;
        };
        const parse = (href) => {
          try {
            const parsed = new URL(href, location.origin);
            const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
            if (!match) return null;
            return {
              conversationId: String(match[2] || '').trim(),
              projectId: normalizeProjectId(match[1]),
            };
          } catch {
            return null;
          }
        };
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        for (const node of Array.from(document.querySelectorAll('[' + rowAttr + '], [' + actionAttr + ']'))) {
          node.removeAttribute(rowAttr);
          node.removeAttribute(actionAttr);
        }

        const findRowButton = (anchor) => {
          let current = anchor instanceof Element ? anchor : null;
          while (current && current !== document.body) {
            const button = Array.from(current.querySelectorAll('button[aria-label], button'))
              .find((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = normalize(node.getAttribute('aria-label') || '');
                return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
              });
            if (button instanceof HTMLButtonElement) {
              return { row: current, button };
            }
            current = current.parentElement;
          }
          return null;
        };
        const findRowFromActionButton = (button, expectedTitle) => {
          let current = button instanceof Element ? button.parentElement : null;
          let best = null;
          while (current && current !== document.body) {
            if (isVisible(current)) {
              const text = normalize(current.textContent || '');
              const conversationButtonCount = Array.from(current.querySelectorAll('button[aria-label], button'))
                .filter((node) => {
                  if (!(node instanceof HTMLButtonElement)) return false;
                  if (!isVisible(node)) return false;
                  const label = normalize(node.getAttribute('aria-label') || '');
                  return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
                })
                .length;
              const hasConversationAnchor = Array.from(current.querySelectorAll('a[href*="/c/"]'))
                .some((anchor) => isVisible(anchor));
              if (hasConversationAnchor || conversationButtonCount > 0) {
                const rect = current.getBoundingClientRect();
                const area = rect.width * rect.height;
                const score =
                  (expectedTitle && text.includes(expectedTitle) ? 1_000_000 : 0) +
                  (hasConversationAnchor ? 100_000 : 0) -
                  area;
                if (!best || score > best.score) {
                  best = { row: current, button, score };
                }
              }
            }
            current = current.parentElement;
          }
          return best ? { row: best.row, button: best.button } : null;
        };
        const isInsideVisibleProjectPanel = (anchor) => {
          let current = anchor instanceof Element ? anchor : null;
          while (current && current !== document.body) {
            if (
              current.getAttribute('role') === 'tabpanel' &&
              isVisible(current)
            ) {
              return true;
            }
            current = current.parentElement;
          }
          return false;
        };

        const conversationAnchors = Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map((anchor) => {
            if (!(anchor instanceof HTMLAnchorElement)) return null;
            const info = parse(anchor.getAttribute('href') || '');
            if (!info) return null;
            return { anchor, info };
          })
          .filter(Boolean);
        const totalConversationAnchors = conversationAnchors.length;
        const visibleConversationAnchors = conversationAnchors.filter((entry) => isVisible(entry.anchor)).length;
        const candidates = Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map((anchor) => {
            if (!(anchor instanceof HTMLAnchorElement)) return null;
            const info = parse(anchor.getAttribute('href') || '');
            if (!info || info.conversationId !== conversationId) return null;
            if (expectedProjectId && info.projectId !== expectedProjectId) return null;
            const rowButton = findRowButton(anchor);
            if (!rowButton) return null;
            const rowRect = rowButton.row.getBoundingClientRect();
            const rowConversationButtons = Array.from(rowButton.row.querySelectorAll('button[aria-label], button'))
              .filter((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = normalize(node.getAttribute('aria-label') || '');
                return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
              });
            const rowText = normalize(rowButton.row.textContent || '');
            const buttonLabel = normalize(rowButton.button.getAttribute('aria-label') || '');
            const inProjectPanel = isInsideVisibleProjectPanel(anchor);
            return {
              row: rowButton.row,
              button: rowButton.button,
              inProjectPanel,
              hasConversationAnchor: true,
              rowText: rowText || null,
              buttonLabel: buttonLabel || null,
              buttonCount: rowConversationButtons.length,
              hasProjectIdMatch: expectedProjectId ? info.projectId === expectedProjectId : false,
              score:
                (inProjectPanel ? 10_000 : 0) +
                (info.projectId === expectedProjectId ? 1000 : 0) +
                (anchor.getAttribute('aria-current') === 'page' ? 100 : 0) +
                (isVisible(anchor) ? 10 : 0) -
                Math.round(rowRect.top),
            };
          })
          .filter(Boolean);
        const scopedCandidates =
          expectedProjectId && candidates.some((candidate) => candidate?.inProjectPanel)
            ? candidates.filter((candidate) => candidate?.inProjectPanel)
            : candidates;
        const rankedCandidates = scopedCandidates
          .sort((left, right) => right.score - left.score);
        let best = rankedCandidates[0] || null;
        let fallbackUsed = false;
        if (!best) {
          const currentAnchor = Array.from(document.querySelectorAll('a[aria-current="page"], a[aria-current="true"]'))
            .find((anchor) => {
              const info = parse(anchor.getAttribute('href') || '');
              if (!info) return false;
              if (expectedProjectId && info.projectId !== expectedProjectId) return false;
              return Boolean(findRowButton(anchor));
            });
          if (currentAnchor) {
            const rowButton = findRowButton(currentAnchor);
            if (rowButton) {
              best = {
                row: rowButton.row,
                button: rowButton.button,
                score: 1,
              };
              fallbackUsed = true;
            }
          }
        }
        if (!best) {
          const currentConversation = parse(location.href);
          const currentTitle = normalizeDocumentTitle(document.title);
          if (
            currentConversation &&
            currentConversation.conversationId === conversationId &&
            currentConversation.projectId === expectedProjectId &&
            currentTitle
          ) {
            const matchingButton = Array.from(document.querySelectorAll('button[aria-label], button'))
              .find((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = normalize(node.getAttribute('aria-label') || '');
                return label === CHATGPT_CONVERSATION_OPTIONS_PREFIX + currentTitle;
              });
            if (matchingButton instanceof HTMLButtonElement) {
              const rowButton = findRowFromActionButton(matchingButton, currentTitle);
              if (rowButton) {
                best = {
                  row: rowButton.row,
                  button: rowButton.button,
                  score: 2,
                  hasProjectIdMatch: false,
                };
                fallbackUsed = true;
              }
            }
          }
        }
        if (!best) {
          return {
            ok: false,
            reason: 'No conversation row candidate matched',
            diagnostics: {
              expectedConversationId: conversationId,
              expectedProjectId: expectedProjectId ?? null,
              totalConversationAnchors,
              visibleConversationAnchors,
              candidateCount: candidates.length,
              scopedCandidateCount: scopedCandidates.length,
              fallbackUsed,
              reason: 'No conversation row candidate matched',
              bestCandidate: null,
            },
          };
        }
        best.row.setAttribute(rowAttr, 'true');
        best.button.setAttribute(actionAttr, 'true');
        const rowText = normalize(best.row.textContent || '');
        const buttonLabel = normalize(best.button.getAttribute('aria-label') || '');
        const buttonCount = Array.from(best.row.querySelectorAll('button[aria-label], button'))
          .filter((node) => {
            if (!(node instanceof HTMLButtonElement)) return false;
            if (!isVisible(node)) return false;
            const label = normalize(node.getAttribute('aria-label') || '');
            return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
          })
          .length;
        return {
          ok: true,
          rowSelector: '[' + rowAttr + '="true"]',
          actionSelector: '[' + actionAttr + '="true"]',
          diagnostics: {
            expectedConversationId: conversationId,
            expectedProjectId: expectedProjectId ?? null,
            totalConversationAnchors,
            visibleConversationAnchors,
            candidateCount: candidates.length,
            scopedCandidateCount: scopedCandidates.length,
            fallbackUsed,
            bestCandidate: {
              inProjectPanel: best.inProjectPanel ?? Boolean(
                best.row.closest('[role="tabpanel"]') && best.row.closest('[role="tabpanel"]').offsetParent !== null,
              ),
              hasConversationAnchor: true,
              buttonCount,
              buttonLabel: buttonLabel || null,
              score: best.score,
              rowText: rowText || null,
              hasProjectIdMatch: best.hasProjectIdMatch ?? false,
            },
          },
        };
      })()`,
			returnByValue: true,
		});
		lastInfo = result?.value as ChatgptConversationRowTagEvaluation | undefined;
		if (lastInfo?.ok && lastInfo.rowSelector && lastInfo.actionSelector) {
			return {
				rowSelector: lastInfo.rowSelector,
				actionSelector: lastInfo.actionSelector,
			};
		}
		await sleep(400);
	}
	const failure: Error & { diagnostics?: ChatgptConversationRowTagDiagnostics } = new Error(
		summarizeChatgptConversationRowTagFailure(conversationId, [
			{
				attemptLabel: `attempt-${attempts}`,
				diagnostics: lastInfo?.diagnostics ?? null,
				error: lastInfo?.reason || "not found",
			},
		]),
	) as Error & { diagnostics?: ChatgptConversationRowTagDiagnostics };
	failure.diagnostics = lastInfo?.diagnostics ?? undefined;
	throw failure;
}

async function tagChatgptConversationRowExact(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
): Promise<{ rowSelector: string; actionSelector: string }> {
	await ensureChatgptSidebarOpen(client);
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	const deadline = Date.now() + 8_000;
	while (Date.now() < deadline) {
		const { result } = await client.Runtime.evaluate({
			expression: `(() => {
        const conversationId = ${JSON.stringify(conversationId)};
        const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
        const rowAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ROW_ATTR)};
        const actionAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const normalizeProjectId = (value) => {
          const trimmed = String(value || '').trim();
          const match = trimmed.match(/^((?:g-p-[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))/i);
          return match ? match[1] : null;
        };
        const parse = (href) => {
          try {
            const parsed = new URL(href, location.origin);
            const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
            if (!match) return null;
            return {
              conversationId: String(match[2] || '').trim(),
              projectId: normalizeProjectId(match[1]),
            };
          } catch {
            return null;
          }
        };
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        for (const node of Array.from(document.querySelectorAll('[' + rowAttr + '], [' + actionAttr + ']'))) {
          node.removeAttribute(rowAttr);
          node.removeAttribute(actionAttr);
        }
        const visibleProjectPanels = expectedProjectId
          ? Array.from(document.querySelectorAll('[role="tabpanel"]')).filter((panel) => {
              if (!(panel instanceof HTMLElement)) return false;
              if (!isVisible(panel)) return false;
              return Array.from(panel.querySelectorAll('a[href*="/c/"]')).some((anchor) => {
                if (!(anchor instanceof HTMLAnchorElement)) return false;
                const info = parse(anchor.getAttribute('href') || anchor.href || '');
                return info?.projectId === expectedProjectId;
              });
            })
          : [];
        const anchorPool =
          expectedProjectId && visibleProjectPanels.length > 0
            ? visibleProjectPanels.flatMap((panel) => Array.from(panel.querySelectorAll('a[href*="/c/"]')))
            : Array.from(document.querySelectorAll('a[href*="/c/"]'));
        const anchor = anchorPool
          .find((node) => {
            if (!(node instanceof HTMLAnchorElement)) return false;
            if (!isVisible(node)) return false;
            const info = parse(node.getAttribute('href') || node.href || '');
            if (!info || info.conversationId !== conversationId) return false;
            if (expectedProjectId && info.projectId !== expectedProjectId) return false;
            return true;
          });
        if (!(anchor instanceof HTMLAnchorElement)) {
          return { ok: false, reason: 'Exact conversation anchor not found' };
        }
        let row = anchor.closest('li') || anchor.parentElement;
        let button = row ? row.querySelector('button[data-conversation-options-trigger], button[aria-label], button') : null;
        if (!(button instanceof HTMLButtonElement) || !isVisible(button)) {
          let current = anchor.parentElement;
          while (current && current !== document.body) {
            const candidate = Array.from(current.querySelectorAll('button[data-conversation-options-trigger], button[aria-label], button'))
              .find((node) => node instanceof HTMLButtonElement && isVisible(node));
            if (candidate instanceof HTMLButtonElement) {
              row = current;
              button = candidate;
              break;
            }
            current = current.parentElement;
          }
        }
        if (!(row instanceof Element) || !(button instanceof HTMLButtonElement) || !isVisible(button)) {
          return {
            ok: false,
            reason: 'Exact conversation row action button not found',
            diagnostics: {
              anchorText: normalize(anchor.textContent || ''),
            },
          };
        }
        row.setAttribute(rowAttr, 'true');
        button.setAttribute(actionAttr, 'true');
        return {
          ok: true,
          rowSelector: '[' + rowAttr + '="true"]',
          actionSelector: '[' + actionAttr + '="true"]',
          diagnostics: {
            anchorText: normalize(anchor.textContent || ''),
            buttonLabel: normalize(button.getAttribute('aria-label') || button.textContent || ''),
          },
        };
      })()`,
			returnByValue: true,
		});
		const info = result?.value as
			| { ok: true; rowSelector: string; actionSelector: string }
			| { ok: false; reason?: string }
			| undefined;
		if (info?.ok) {
			return {
				rowSelector: info.rowSelector,
				actionSelector: info.actionSelector,
			};
		}
		await sleep(300);
	}
	throw new Error(`Exact ChatGPT conversation row not found for ${conversationId}`);
}

async function _openChatgptTaggedConversationSidebarMenu(
	client: ChromeClient,
	tagged: { rowSelector: string; actionSelector: string },
	itemLabel: string,
	timeoutMs = 4_000,
): Promise<{
	ok: boolean;
	reason?: string;
	menuSelector?: string;
	diagnostics?: Record<string, unknown>;
}> {
	return withAnchoredActionDiagnostics(
		client.Runtime,
		async () => {
			const opened = await openAndSelectRevealedRowMenuItem(client, {
				rowSelector: tagged.rowSelector,
				triggerSelector: tagged.actionSelector,
				rootSelectors: ["nav", "aside", tagged.rowSelector],
				triggerRootSelectors: [tagged.rowSelector],
				actionMatch: { startsWith: [CHATGPT_CONVERSATION_OPTIONS_PREFIX] },
				menuSelector: '[role="menu"]',
				itemMatch: { exact: [itemLabel] },
				prepareTriggerBeforeOpen: true,
				directTriggerClickFallback: true,
				itemInteractionStrategies: ["pointer"],
				closeMenuAfter: itemLabel !== CHATGPT_CONVERSATION_ACTION_RENAME_LABEL,
				timeoutMs,
			});
			if (!opened.ok) {
				return {
					ok: false,
					reason: opened.reason || "Conversation options menu did not open",
				};
			}
			return {
				ok: true,
				menuSelector: opened.menuSelector || '[role="menu"]',
			};
		},
		{
			rowSelector: tagged.rowSelector,
			triggerSelector: tagged.actionSelector,
			anchorSelector: tagged.actionSelector,
			anchorRootSelectors: [tagged.rowSelector],
			context: { itemLabel },
		},
	);
}

async function openChatgptTaggedConversationRenameEditor(
	client: ChromeClient,
	tagged: { rowSelector: string; actionSelector: string },
	timeoutMs = 12_000,
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
	return withAnchoredActionDiagnostics(
		client.Runtime,
		async () => {
			const renameOpened = await openChatgptTaggedConversationMenuItem(client, tagged, {
				itemLabel: CHATGPT_CONVERSATION_ACTION_RENAME_LABEL,
				itemReadyDescription: "ChatGPT rename menu visible",
				itemReadyReason: "Rename menu item did not appear",
				itemPressedReason: "Rename menu item did not click",
				timeoutMs,
			});
			if (!renameOpened.ok) {
				return renameOpened;
			}

			const renameEditorReady = await waitForPredicate(
				client.Runtime,
				buildChatgptRenameEditorReadyExpression(),
				{
					timeoutMs,
					description: "ChatGPT rename editor ready",
				},
			);
			if (!renameEditorReady.ok) {
				return {
					ok: false,
					reason: "Rename editor did not become ready",
				};
			}

			return { ok: true };
		},
		{
			rowSelector: tagged.rowSelector,
			triggerSelector: tagged.actionSelector,
			editorSelector: 'input[name="title-editor"]',
			anchorSelector: tagged.actionSelector,
			anchorRootSelectors: [tagged.rowSelector],
			context: { phase: "rename-editor" },
			includeOnSuccess: true,
		},
	);
}

async function openChatgptTaggedConversationDeleteConfirmation(
	client: ChromeClient,
	tagged: { rowSelector: string; actionSelector: string },
	expectedTitle?: string | null,
	timeoutMs = 12_000,
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
	return withAnchoredActionDiagnostics(
		client.Runtime,
		async () => {
			const deleteOpened = await openChatgptTaggedConversationMenuItem(client, tagged, {
				itemLabel: CHATGPT_CONVERSATION_ACTION_DELETE_LABEL,
				itemReadyDescription: "ChatGPT delete menu visible",
				itemReadyReason: "Delete menu item did not appear",
				itemPressedReason: "Delete menu item did not click",
				timeoutMs,
			});
			if (!deleteOpened.ok) {
				return deleteOpened;
			}

			const confirmationReady = await waitForChatgptDeleteConfirmationReady(
				client,
				expectedTitle,
				timeoutMs,
			);
			if (!confirmationReady.ok) {
				return {
					ok: false,
					reason: `Delete confirmation did not become ready (${JSON.stringify(confirmationReady.probe ?? null)})`,
				};
			}

			return { ok: true };
		},
		{
			rowSelector: tagged.rowSelector,
			triggerSelector: tagged.actionSelector,
			dialogSelectors: DEFAULT_DIALOG_SELECTORS,
			anchorSelector: tagged.rowSelector,
			anchorRootSelectors: [tagged.rowSelector],
			context: { phase: "delete-confirmation", expectedTitle: expectedTitle ?? null },
			includeOnSuccess: true,
		},
	);
}

async function openChatgptTaggedConversationMenuItem(
	client: ChromeClient,
	tagged: { rowSelector: string; actionSelector: string },
	options: {
		itemLabel: string;
		itemReadyDescription: string;
		itemReadyReason: string;
		itemPressedReason: string;
		timeoutMs: number;
	},
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
	const hovered = await hoverElement(client.Runtime, client.Input, {
		selector: tagged.rowSelector,
		rootSelectors: ["nav", "aside", tagged.rowSelector],
		timeoutMs: options.timeoutMs,
	});
	if (!hovered.ok) {
		return {
			ok: false,
			reason: hovered.reason || "Conversation row did not hover",
		};
	}

	const triggerPressed = await pressButton(client.Runtime, {
		selector: tagged.actionSelector,
		rootSelectors: [tagged.rowSelector],
		interactionStrategies: ["pointer"],
		requireVisible: true,
		timeoutMs: options.timeoutMs,
	});
	if (!triggerPressed.ok) {
		return {
			ok: false,
			reason: triggerPressed.reason || "Conversation options trigger did not open",
		};
	}

	const menuReady = await waitForPredicate(
		client.Runtime,
		`(() => {
      const expected = ${JSON.stringify(options.itemLabel)};
      const items = Array.from(document.querySelectorAll('[role="menuitem"]'))
        .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase())
        .filter(Boolean);
      return items.includes(expected) ? { items } : null;
    })()`,
		{
			timeoutMs: options.timeoutMs,
			description: options.itemReadyDescription,
		},
	);
	if (!menuReady.ok) {
		return {
			ok: false,
			reason: options.itemReadyReason,
		};
	}

	const itemPressed = await pressButton(client.Runtime, {
		match: { exact: [options.itemLabel] },
		rootSelectors: ['[role="menu"]'],
		interactionStrategies: ["pointer"],
		requireVisible: true,
		timeoutMs: options.timeoutMs,
	});
	if (!itemPressed.ok) {
		return {
			ok: false,
			reason: itemPressed.reason || options.itemPressedReason,
		};
	}

	return { ok: true };
}

function buildChatgptRenameEditorReadyExpression(): string {
	return `(() => {
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const input = document.querySelector('input[name="title-editor"]');
    if (input instanceof HTMLInputElement && isVisible(input)) {
      return {
        inputName: input.getAttribute('name') || null,
        value: input.value,
        active: document.activeElement === input,
      };
    }
    return null;
  })()`;
}

function buildChatgptConversationTitleProbeExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const href = String(location.href || '');
    const routeConversationIdMatch = href.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
    const routeProjectIdMatch = href.match(/\\/g\\/([^/]+)\\/(?:project|c\\/)/);
    const links = Array.from(document.querySelectorAll('a[href*="/c/"]'))
      .map((anchor) => {
        const anchorHref = String(anchor.href || '');
        const conversationMatch = anchorHref.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
        const projectMatch = anchorHref.match(/\\/g\\/([^/]+)\\//);
        return {
          href: anchorHref,
          conversationId: conversationMatch ? conversationMatch[1] : null,
          projectId: projectMatch ? projectMatch[1] : null,
          text: normalize(anchor.textContent || ''),
          aria: normalize(anchor.getAttribute('aria-label') || ''),
        };
      })
      .filter((anchor) => anchor.conversationId);
    const topLink = links.find((anchor) => anchor.text || anchor.aria) || null;
    return {
      matchedConversationId: null,
      matchedProjectId: null,
      matchedTitle: null,
      routeConversationId: routeConversationIdMatch ? routeConversationIdMatch[1] : null,
      routeProjectId: routeProjectIdMatch ? routeProjectIdMatch[1] : null,
      documentTitle: document.title,
      topConversationId: topLink ? topLink.conversationId : null,
      topTitle: topLink ? (topLink.text || topLink.aria || null) : null,
    };
  })()`;
}

function buildChatgptDeleteConfirmationProbeExpression(): string {
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const confirmButton = dialog.querySelector(${JSON.stringify(CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR)});
      return {
        dialogText: normalize(dialog.textContent || ''),
        buttonLabels: buttons
          .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
          .filter(Boolean),
        hasVisibleConfirmButton: confirmButton instanceof HTMLButtonElement && isVisible(confirmButton),
      };
    }
    return null;
  })()`;
}

async function readChatgptConversationTitleProbe(
	client: ChromeClient,
	conversationId: string,
): Promise<ChatgptConversationTitleProbe | null> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const probe = ${buildChatgptConversationTitleProbeExpression()};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const conversationId = ${JSON.stringify(conversationId)};
      const links = Array.from(document.querySelectorAll('a[href*="/c/"]'))
        .map((anchor) => {
          const href = String(anchor.href || '');
          const match = href.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
          if (!match || match[1] !== conversationId) return null;
          const projectMatch = href.match(/\\/g\\/([^/]+)\\//);
          return {
            matchedConversationId: match[1],
            matchedProjectId: projectMatch ? projectMatch[1] : null,
            matchedTitle: normalize(anchor.textContent || '') || normalize(anchor.getAttribute('aria-label') || '') || null,
          };
        })
        .filter(Boolean);
      if (links.length > 0) {
        const first = links[0];
        probe.matchedConversationId = first.matchedConversationId;
        probe.matchedProjectId = first.matchedProjectId;
        probe.matchedTitle = first.matchedTitle;
      }
      return probe;
    })()`,
		returnByValue: true,
	});
	return (result?.value as ChatgptConversationTitleProbe | null | undefined) ?? null;
}

async function readChatgptDeleteConfirmationProbe(
	client: ChromeClient,
): Promise<ChatgptDeleteConfirmationProbe | null> {
	const { result } = await client.Runtime.evaluate({
		expression: buildChatgptDeleteConfirmationProbeExpression(),
		returnByValue: true,
	});
	return (result?.value as ChatgptDeleteConfirmationProbe | null | undefined) ?? null;
}

async function waitForChatgptDeleteConfirmationReady(
	client: ChromeClient,
	expectedTitle?: string | null,
	timeoutMs = 5_000,
): Promise<
	| { ok: true; probe: ChatgptDeleteConfirmationProbe }
	| { ok: false; probe: ChatgptDeleteConfirmationProbe | null }
> {
	const deadline = Date.now() + timeoutMs;
	let lastProbe: ChatgptDeleteConfirmationProbe | null = null;
	while (Date.now() < deadline) {
		lastProbe = await readChatgptDeleteConfirmationProbe(client);
		if (lastProbe && matchesChatgptDeleteConfirmationProbe(lastProbe, expectedTitle)) {
			return { ok: true, probe: lastProbe };
		}
		await sleep(200);
	}
	return { ok: false, probe: lastProbe };
}

async function waitForChatgptConversationTitleApplied(
	client: ChromeClient,
	conversationId: string,
	expectedTitle: string,
	projectId?: string | null,
): Promise<void> {
	const titleApplied = async (options?: { requireTopForRootMatch?: boolean }) => {
		const probe = await readChatgptConversationTitleProbe(client, conversationId);
		return {
			ok: matchesChatgptConversationTitleProbe(
				probe,
				conversationId,
				expectedTitle,
				projectId,
				options,
			),
			probe,
		};
	};
	const shortPause = async () => {
		const min = 800;
		const max = 1_500;
		const ms = min + Math.floor(Math.random() * (max - min + 1));
		await new Promise((resolve) => setTimeout(resolve, ms));
	};
	await shortPause();
	let renamed = await titleApplied();
	if (!renamed.ok) {
		await shortPause();
		await ensureChatgptSidebarOpen(client).catch(() => undefined);
		await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
		await ensureChatgptSidebarOpen(client).catch(() => undefined);
		renamed = await titleApplied({ requireTopForRootMatch: !projectId });
	}
	if (!renamed.ok) {
		throw new Error(
			`ChatGPT conversation rename did not persist for ${conversationId} (${JSON.stringify(renamed.probe ?? (await readChatgptConversationTitleProbe(client, conversationId)))})`,
		);
	}
}

async function isChatgptConversationTitleAppliedWithClient(
	client: ChromeClient,
	conversationId: string,
	expectedTitle: string,
	projectId?: string | null,
): Promise<boolean> {
	const probe = await readChatgptConversationTitleProbe(client, conversationId);
	return matchesChatgptConversationTitleProbe(probe, conversationId, expectedTitle, projectId);
}

async function waitForChatgptConversationDeleted(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
): Promise<void> {
	let deleted = await waitForPredicate(
		client.Runtime,
		buildConversationDeletedExpression(conversationId, projectId),
		{
			timeoutMs: 10_000,
			description: `ChatGPT conversation ${conversationId} deleted`,
		},
	);
	if (!deleted.ok) {
		await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
		deleted = await waitForPredicate(
			client.Runtime,
			buildConversationDeletedExpression(conversationId, projectId),
			{
				timeoutMs: 10_000,
				description: `ChatGPT conversation ${conversationId} deleted after list refresh`,
			},
		);
	}
	if (!deleted.ok) {
		throw new Error(`ChatGPT conversation ${conversationId} still appeared after delete`);
	}
}

async function ensureChatgptConversationSurfaceReadyForRead(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
	options?: BrowserProviderListOptions,
): Promise<void> {
	const waitForReady = async (description: string) => {
		return await waitForPredicate(
			client.Runtime,
			buildConversationSurfaceReadyExpression(conversationId, projectId),
			{
				timeoutMs: 10_000,
				description,
				interrupt: () =>
					assertNoChatgptAccountMirrorHardStop(client, options, `${description} wait`),
				interruptPollMs: 1_000,
			},
		);
	};
	if (!providerNavigationAllowed(options)) {
		const ready = await waitForReady(
			`ChatGPT active conversation ${conversationId} surface ready without navigation`,
		);
		if (ready.ok) {
			return;
		}
		throw new Error(
			`ChatGPT active conversation content not found for ${conversationId}; refusing to navigate the active tab.`,
		);
	}
	if (options?.accountMirrorSingleConversationVisit) {
		// Project slugs may differ from the canonical URL after the governed visit.
		// Reuse only a ready surface whose conversation and project both match.
		recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
		const ready = await withChatgptTimeout(
			client.Runtime.evaluate({
				expression: buildConversationSurfaceReadyExpression(conversationId, projectId),
				returnByValue: true,
				timeout: 10_000,
			}),
			10_000,
			`Timed out checking the active ChatGPT conversation ${conversationId} surface.`,
		);
		if (ready.result.value && !ready.exceptionDetails) {
			recordBrowserScrapeProviderAction(options, "chatgpt.skipSameRouteNavigation");
			return;
		}
	}
	await navigateToChatgptConversation(client, conversationId, projectId, options);
}

export const ensureChatgptConversationSurfaceReadyForReadForTest =
	ensureChatgptConversationSurfaceReadyForRead;

type ChatgptDeepResearchFrameProbe = {
	title?: string | null;
	contentText?: string | null;
	completed?: boolean;
	statusLabel?: string | null;
	exportLabels?: string[];
	targetId?: string | null;
	frameUrl?: string | null;
};

function normalizeChatgptDeepResearchReportText(value: string | null | undefined): string {
	return normalizeInstructionComparisonText(value)
		.replace(/\n(?:[0-9]\n){10,}/g, "\n")
		.replace(/\n\s*citations · searches\s*\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function readVisibleChatgptDeepResearchFrameUrlsWithClient(
	client: ChromeClient,
): Promise<Set<string>> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = node.ownerDocument.defaultView.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return Array.from(document.querySelectorAll('iframe'))
        .filter(isVisible)
        .map((node) => normalize(node.src || node.getAttribute('src') || node.getAttribute('title') || ''))
        .filter((value) => /deep[_ -]?research/i.test(value));
    })()`,
		returnByValue: true,
	});
	const values = Array.isArray(result?.value) ? result.value : [];
	return new Set(
		values
			.map((value) => normalizeChatgptFrameUrl(typeof value === "string" ? value : null))
			.filter((value): value is string => Boolean(value)),
	);
}

async function readVisibleChatgptDeepResearchArtifactsFromTargets(
	conversationId: string,
	targetContext?: { host: string; port: number; targetId?: string | null },
	messageIndex?: number,
	allowedFrameUrls: Set<string> = new Set(),
	options?: BrowserProviderListOptions,
): Promise<ConversationArtifact[]> {
	if (!targetContext?.port || allowedFrameUrls.size === 0) {
		return [];
	}
	const deadline = Date.now() + 15_000;
	const probes: ChatgptDeepResearchFrameProbe[] = [];
	while (Date.now() < deadline && probes.length === 0) {
		const targets = await CDP.List({ host: targetContext.host, port: targetContext.port }).catch(
			() => [],
		);
		const candidates = filterChatgptDeepResearchTargets(targets, allowedFrameUrls);
		for (const target of candidates) {
			const targetId = resolveChatgptTargetId(target);
			if (!targetId) continue;
			const frameClient = await connectToChromeTarget({
				host: targetContext.host,
				port: targetContext.port,
				target: targetId,
			}).catch(() => null);
			if (!frameClient) continue;
			try {
				await frameClient.Runtime.enable();
				await annotateClientMutationContext(
					frameClient,
					options,
					"provider:chatgpt:deep-research-frame",
					targetId,
				);
				const { result } = await frameClient.Runtime.evaluate({
					expression: `(() => {
          const normalize = (value) => String(value || '')
            .replace(/\\r\\n/g, '\\n')
            .replace(/\\r/g, '\\n')
            .replace(/[\\t ]+/g, ' ')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
          const isVisible = (node) => {
            if (!(node instanceof Element)) return false;
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const style = node.ownerDocument.defaultView.getComputedStyle(node);
            return style.display !== 'none' && style.visibility !== 'hidden';
          };
          const readableDocuments = [document];
          for (const frame of Array.from(document.querySelectorAll('iframe'))) {
            try {
              const child = frame.contentDocument || frame.contentWindow?.document || null;
              if (child) readableDocuments.push(child);
            } catch {
              // Cross-origin child frames stay opaque here; Chrome exposes OOPIFs as targets separately.
            }
          }
          const probes = readableDocuments.map((doc) => {
            const text = normalize(doc.body?.innerText || '');
            const headings = Array.from(doc.querySelectorAll('h1, h2, [role="heading"]'))
              .map((node) => normalize(node.textContent || node.getAttribute('aria-label') || ''))
              .filter(Boolean);
            const controls = Array.from(doc.querySelectorAll('button, [role="button"], a'))
              .filter(isVisible)
              .map((node) => normalize(node.getAttribute('aria-label') || node.textContent || node.getAttribute('title') || ''))
              .filter(Boolean);
            const statusMatch = text.match(/Research completed[^\\n.]*/i) || text.match(/Research in progress[^\\n.]*/i);
            return {
              title: headings[0] || null,
              contentText: text,
              completed: /research completed/i.test(text),
              statusLabel: statusMatch ? statusMatch[0] : null,
              exportLabels: controls.filter((label) => /export|pdf|docx|download/i.test(label)).slice(0, 20),
            };
          })
            .filter((probe) => probe.contentText && probe.contentText.length > 200 && /\\b(deep research|research completed|research in progress)\\b/i.test(probe.contentText))
            .sort((left, right) => right.contentText.length - left.contentText.length);
          return probes[0] || null;
        })()`,
					returnByValue: true,
				});
				const probe = result?.value as ChatgptDeepResearchFrameProbe | null | undefined;
				if (probe?.contentText && normalizeUiText(probe.contentText).length > 0) {
					probes.push({
						...probe,
						targetId,
						frameUrl: target.url ?? null,
					});
				}
			} finally {
				await frameClient.close().catch(() => undefined);
			}
		}
		if (probes.length === 0) {
			await sleep(500);
		}
	}
	const seen = new Set<string>();
	return probes.flatMap((probe, index): ConversationArtifact[] => {
		const contentText = normalizeChatgptDeepResearchReportText(probe.contentText ?? "");
		if (!contentText || seen.has(contentText)) return [];
		seen.add(contentText);
		const rawTitle = normalizeUiText(probe.title ?? undefined) || "ChatGPT Deep Research report";
		const baseMetadata = {
			artifactKind: "deep-research-report",
			textLength: contentText.length,
			completed: Boolean(probe.completed),
			statusLabel: probe.statusLabel ?? null,
			exportLabels: probe.exportLabels ?? [],
			iframeTargetId: probe.targetId ?? null,
			iframeUrl: probe.frameUrl ?? null,
		};
		const baseUri = `chatgpt://conversation/${conversationId}/deep-research/${index}`;
		return [
			{
				id: `deep-research:${conversationId}:${index}:markdown`,
				title: rawTitle,
				kind: "document",
				uri: `${baseUri}/markdown`,
				messageIndex,
				metadata: {
					...baseMetadata,
					exportVariant: "markdown",
					contentText,
				},
			},
			{
				id: `deep-research:${conversationId}:${index}:docx`,
				title: `${rawTitle} (Word)`,
				kind: "document",
				uri: `${baseUri}/docx`,
				messageIndex,
				metadata: {
					...baseMetadata,
					exportVariant: "docx",
					exportLabel: "Export to Word",
				},
			},
			{
				id: `deep-research:${conversationId}:${index}:pdf`,
				title: `${rawTitle} (PDF)`,
				kind: "document",
				uri: `${baseUri}/pdf`,
				messageIndex,
				metadata: {
					...baseMetadata,
					exportVariant: "pdf",
					exportLabel: "Export to PDF",
				},
			},
		];
	});
}

async function readVisibleChatgptConversationMessagesWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<ChatgptConversationMessageProbe[]> {
	recordBrowserScrapeProviderAction(options, "chatgpt.readConversationMessages");
	const messages: ChatgptConversationMessageProbe[] = [];
	let pageStart = 0;
	for (let pageIndex = 0; pageIndex < CHATGPT_CONVERSATION_MESSAGES_MAX_PAGES; pageIndex += 1) {
		recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
		const { result } = await withChatgptTimeout(
			client.Runtime.evaluate({
				expression: `(() => {
          const normalize = (value) => String(value || '')
            .replace(/\\r\\n/g, '\\n')
            .replace(/\\r/g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
          const roleNodes = Array.from(
            document.querySelectorAll(
              ${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} ${CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR}`)},
            ),
          ).filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
          const fallbackNodes = roleNodes.length > 0
            ? roleNodes
            : Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}))
                .filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
          const pageStart = ${pageStart};
          const pageSize = ${CHATGPT_CONVERSATION_MESSAGES_PAGE_SIZE};
          const pageNodes = fallbackNodes.slice(pageStart, pageStart + pageSize);
          const messages = pageNodes
            .map((node) => {
	              const searchUnitKey =
	                node.getAttribute('data-content-search-unit-key') ||
	                node.getAttribute('data-chatgpt-search-unit-key') ||
	                '';
	              const role = String(
	                node.getAttribute('data-message-author-role') || searchUnitKey.split(':').at(-1) || '',
	              ).trim();
              if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;
              // textContent avoids the forced layout work of innerText. Paging keeps
              // both DOM traversal and by-value CDP serialization interruptible.
              const text = normalize(node.textContent || '');
              if (!text) return null;
	              const messageId = normalize(
	                node.getAttribute('data-message-id') ||
	                node.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/ +/)[0] ||
	                node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)})?.getAttribute('data-turn-id') ||
                '',
              );
              return { role, text, messageId: messageId || null };
            })
            .filter(Boolean);
          const observedThrough = pageStart + pageNodes.length;
          return {
            messages,
            nextOffset: observedThrough < fallbackNodes.length ? observedThrough : null,
            totalMessages: fallbackNodes.length,
          };
        })()`,
				returnByValue: true,
				timeout: CHATGPT_CONVERSATION_MESSAGES_PAGE_TIMEOUT_MS,
			}),
			CHATGPT_CONVERSATION_MESSAGES_PAGE_TIMEOUT_MS,
			`Timed out reading ChatGPT conversation messages page starting at ${pageStart} after ${CHATGPT_CONVERSATION_MESSAGES_PAGE_TIMEOUT_MS}ms.`,
		);
		const value = result?.value as
			| {
					messages?: Array<{ role?: string; text?: string; messageId?: string | null }>;
					nextOffset?: number | null;
					totalMessages?: number;
			  }
			| undefined;
		if (Array.isArray(value?.messages)) {
			messages.push(
				...value.messages
					.filter((message): message is ChatgptConversationMessageProbe => {
						return (
							typeof message?.text === "string" &&
							message.text.trim().length > 0 &&
							(message.role === "user" || message.role === "assistant" || message.role === "system")
						);
					})
					.map((message) => ({
						role: message.role,
						text: message.text,
						messageId:
							typeof message.messageId === "string" && message.messageId.trim()
								? message.messageId.trim()
								: undefined,
					})),
			);
		}
		if (value?.nextOffset === null) return messages;
		if (
			typeof value?.nextOffset !== "number" ||
			!Number.isInteger(value.nextOffset) ||
			value.nextOffset <= pageStart
		) {
			throw new Error(
				`ChatGPT conversation message paging did not advance from offset ${pageStart}.`,
			);
		}
		pageStart = value.nextOffset;
	}
	throw new Error(
		`ChatGPT conversation message paging exceeded ${CHATGPT_CONVERSATION_MESSAGES_MAX_PAGES} pages.`,
	);
}

export const readVisibleChatgptConversationMessagesWithClientForTest =
	readVisibleChatgptConversationMessagesWithClient;

async function readChatgptConversationContextWithClient(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
	targetContext?: { host: string; port: number; targetId?: string | null },
): Promise<ConversationContext> {
	return withChatgptBlockingSurfaceRecovery(
		client,
		`readChatgptConversationContext:${conversationId}`,
		async () => {
			await ensureChatgptConversationSurfaceReadyForRead(
				client,
				conversationId,
				projectId,
				options,
			);
			let payload: ChatgptConversationPayload | null = null;
			try {
				payload = await withBrowserScrapePendingOperation(
					options,
					"provider:chatgpt.readConversationPayload",
					() =>
						readChatgptConversationPayloadWithClient(client, conversationId, projectId, options),
				);
			} catch (error) {
				if (isChatgptConversationUnavailableError(error)) {
					recordBrowserScrapeProviderAction(
						options,
						"chatgpt.readConversationPayload.failed.conversation_unavailable.v1",
					);
					throw error;
				}
				recordBrowserScrapeProviderAction(
					options,
					`chatgpt.readConversationPayload.failed.${classifyChatgptRuntimeEvaluationFailure(error)}.v1`,
				);
			}
			recordBrowserScrapeProviderAction(options, "chatgpt.waitPostPayloadReadiness");
			recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
			let postPayloadReadiness: Awaited<ReturnType<typeof waitForPredicate>>;
			try {
				postPayloadReadiness = await waitForPredicate(
					client.Runtime,
					buildConversationSurfaceReadyExpression(conversationId, projectId),
					{
						timeoutMs: 10_000,
						evaluationTimeoutMs: 10_000,
						description: `ChatGPT conversation ${conversationId} post-payload readiness`,
						interrupt: () =>
							assertNoChatgptAccountMirrorHardStop(
								client,
								options,
								`ChatGPT conversation ${conversationId} payload-sync readiness wait`,
							),
						interruptPollMs: 1_000,
					},
				);
			} catch (error) {
				recordBrowserScrapeProviderAction(
					options,
					`chatgpt.postPayloadReadiness.failed.${classifyChatgptRuntimeEvaluationFailure(error)}.v1`,
				);
				throw error;
			}
			if (!postPayloadReadiness.ok) {
				recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
				const currentUrl = await withChatgptTimeout(
					client.Runtime.evaluate({
						expression: "location.href",
						returnByValue: true,
						timeout: CHATGPT_POST_PAYLOAD_ROUTE_READ_TIMEOUT_MS,
					}),
					CHATGPT_POST_PAYLOAD_ROUTE_READ_TIMEOUT_MS,
					"Timed out classifying the ChatGPT post-payload route.",
				)
					.then(({ result }) => (typeof result?.value === "string" ? result.value : null))
					.catch(() => null);
				recordBrowserScrapeProviderAction(
					options,
					buildChatgptPostPayloadReadinessFailureStage(
						payload,
						currentUrl,
						conversationId,
						projectId,
					),
				);
				throw new Error(
					`ChatGPT conversation ${conversationId} post-payload readiness was not satisfied.`,
				);
			}
			recordBrowserScrapeProviderAction(options, "chatgpt.postPayloadReadiness.succeeded.v1");
			const readMessages = async () => {
				await resolveProviderTrafficGovernor(options)?.checkWarning?.(client.Runtime);
				return readVisibleChatgptConversationMessagesWithClient(client, options);
			};

			let messages = await readMessages();
			if (messages.length === 0) {
				const deadline = Date.now() + 5_000;
				while (Date.now() < deadline && messages.length === 0) {
					await sleep(500);
					messages = await readMessages();
				}
			}
			if (messages.length === 0) {
				await ensureChatgptConversationSurfaceReadyForRead(
					client,
					conversationId,
					projectId,
					options,
				);
				messages = await readMessages();
			}
			if (messages.length === 0) {
				throw new Error(`ChatGPT conversation ${conversationId} messages not found`);
			}
			if (!payload) {
				try {
					payload = await readChatgptConversationPayloadWithClient(
						client,
						conversationId,
						projectId,
						// The first payload read already exhausted the single governed reload
						// fallback for this context read. Retry the direct authenticated fetch
						// after the conversation DOM settles without physically reloading the
						// same route a second time.
						buildChatgptPayloadDirectRetryOptions(options),
					);
				} catch (error) {
					if (isChatgptConversationUnavailableError(error)) {
						recordBrowserScrapeProviderAction(
							options,
							"chatgpt.readConversationPayload.failed.conversation_unavailable.v1",
						);
						throw error;
					}
					recordBrowserScrapeProviderAction(
						options,
						`chatgpt.readConversationPayloadRetry.failed.${classifyChatgptRuntimeEvaluationFailure(error)}.v1`,
					);
				}
			}
			const deepResearchFrameUrls = await readVisibleChatgptDeepResearchFrameUrlsWithClient(
				client,
			).catch(() => new Set<string>());
			const deepResearchArtifacts = await readVisibleChatgptDeepResearchArtifactsFromTargets(
				conversationId,
				targetContext,
				messages.length,
				deepResearchFrameUrls,
				options,
			);
			const normalizedMessages = messages.map(({ role, text }) => ({ role, text }));
			for (const artifact of deepResearchArtifacts) {
				const contentText =
					typeof artifact.metadata?.contentText === "string"
						? artifact.metadata.contentText.trim()
						: "";
				if (!contentText) continue;
				const alreadyPresent = normalizedMessages.some(
					(message) =>
						message.role === "assistant" && message.text.includes(contentText.slice(0, 120)),
				);
				if (!alreadyPresent) {
					normalizedMessages.push({ role: "assistant", text: contentText });
				}
			}
			const messageIndexById = new Map<string, number>();
			messages.forEach((message, index) => {
				const id = normalizeUiText(message.messageId);
				if (id) {
					messageIndexById.set(id, index);
				}
			});
			const files = await readVisibleChatgptConversationFilesWithClient(
				client,
				conversationId,
				options,
			);
			const sources = extractChatgptConversationSourcesFromPayload(payload, messageIndexById);
			const payloadArtifacts = extractChatgptConversationArtifactsFromPayload(
				payload,
				messageIndexById,
			);
			recordBrowserScrapeCandidateCount(
				options,
				"chatgpt.payloadArtifacts",
				payloadArtifacts.length,
			);
			const domDownloadArtifacts = normalizeChatgptConversationDownloadArtifactProbes(
				await readVisibleChatgptDownloadArtifactProbesWithClient(client, options),
			);
			const domImageArtifacts = normalizeChatgptVisibleImageArtifactProbes(
				await readVisibleChatgptImageArtifactProbesWithClient(client, options),
			);
			const canvasProbes = await readVisibleChatgptCanvasProbesWithClient(client, options);
			const artifacts = mergeChatgptCanvasArtifactContent(
				mergeChatgptConversationArtifacts(
					mergeChatgptConversationArtifacts(
						mergeChatgptConversationArtifacts(payloadArtifacts, domDownloadArtifacts, {
							reconcileDownloadControls: true,
						}),
						domImageArtifacts,
					),
					deepResearchArtifacts,
				),
				canvasProbes,
			);
			recordBrowserScrapeCandidateCount(options, "chatgpt.visibleFiles", files.length);
			recordBrowserScrapeCandidateCount(
				options,
				"chatgpt.domDownloadArtifacts",
				domDownloadArtifacts.length,
			);
			recordBrowserScrapeCandidateCount(
				options,
				"chatgpt.domImageArtifacts",
				domImageArtifacts.length,
			);
			recordBrowserScrapeCandidateCount(options, "chatgpt.canvasProbes", canvasProbes.length);
			recordBrowserScrapeCandidateCount(options, "chatgpt.mergedArtifacts", artifacts.length);
			return applyChatgptConversationContextChunk(
				{
					provider: "chatgpt",
					conversationId,
					messages: normalizedMessages,
					files,
					sources,
					artifacts,
				},
				options?.accountMirrorContextChunk,
			);
		},
		{
			debugContext,
			reopen: buildChatgptConversationReopen(client, conversationId, projectId, options),
			providerOptions: options,
		},
	);
}

export const readChatgptConversationContextWithClientForTest =
	readChatgptConversationContextWithClient;

function applyChatgptConversationContextChunk(
	context: ConversationContext,
	chunk: BrowserProviderListOptions["accountMirrorContextChunk"] | null | undefined,
): ConversationContext {
	const startMessageIndex = normalizeNonNegativeInteger(chunk?.startMessageIndex);
	const maxMessages = normalizePositiveInteger(chunk?.maxMessages);
	if (startMessageIndex === null || maxMessages === null) return context;
	const totalMessages = context.messages.length;
	const endMessageIndex = Math.min(totalMessages, startMessageIndex + maxMessages);
	const nextMessageIndex = endMessageIndex < totalMessages ? endMessageIndex : null;
	const includesMessageIndex = (value: { messageIndex?: number } | null | undefined): boolean => {
		if (typeof value?.messageIndex !== "number" || !Number.isFinite(value.messageIndex)) {
			return startMessageIndex === 0;
		}
		return value.messageIndex >= startMessageIndex && value.messageIndex < endMessageIndex;
	};
	return {
		...context,
		messages: context.messages.slice(startMessageIndex, endMessageIndex),
		sources: context.sources?.filter(includesMessageIndex),
		artifacts: context.artifacts?.filter(includesMessageIndex),
		metadata: {
			...(context.metadata ?? {}),
			accountMirrorContextChunk: {
				startMessageIndex,
				endMessageIndex,
				nextMessageIndex,
				maxMessages,
				totalMessages,
				complete: nextMessageIndex === null,
			},
		},
	};
}

function normalizeNonNegativeInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	return Math.floor(value);
}

function normalizePositiveInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
	return Math.floor(value);
}

async function readVisibleChatgptDownloadArtifactProbesWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<ChatgptConversationDownloadButtonProbe[]> {
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.readVisibleDownloadArtifactProbes");
	const { result } = await withBrowserScrapePendingOperation(
		options,
		"provider:chatgpt.readVisibleDownloadArtifactProbes",
		() =>
			withChatgptTimeout(
				client.Runtime.evaluate({
					expression: `(async () => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const artifactTitle = (button) => {
        const ariaLabel = normalize(button.getAttribute('aria-label') || '');
        const previewMatch = ariaLabel.match(/^Open preview of\\s+(.+)$/i);
        const downloadMatch = ariaLabel.match(/^Download\\s+(.+)$/i);
        return normalize(previewMatch?.[1] || downloadMatch?.[1] || button.textContent || ariaLabel || '');
      };
      const collect = () => {
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
            return {
              section,
              messageIndex,
              role: normalize(
                roleNode?.getAttribute('data-message-author-role') ||
	            roleNode?.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
	            roleNode?.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-message-author-role') ||
                section.getAttribute('data-turn') ||
                '',
              ),
              turnId: normalize(section.getAttribute('data-turn-id') || ''),
              messageId: normalize(roleNode?.getAttribute('data-message-id') || section.getAttribute('data-message-id') || ''),
            };
          });
        return roots.flatMap((entry) => {
          const role = entry.role;
          if (role !== 'assistant') return [];
          const buttons = Array.from(entry.section.querySelectorAll(${JSON.stringify(CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR)}))
            .filter((button) => isVisible(button) && !button.closest(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
            .map((button, buttonIndex) => ({
              turnId: entry.turnId || null,
              messageId: entry.messageId || null,
              messageIndex: entry.messageIndex,
              buttonIndex,
              title: artifactTitle(button) || null,
            }))
            .filter((button) => {
              const title = normalize(button.title || '');
              if (!title) return false;
              if (/^(copy|edit|download)$/i.test(title)) return false;
              return true;
            });
          return buttons;
        });
      };
      let probes = collect();
      // Readiness must use the same visibility, title, and textdoc exclusions
      // as collection. An ineligible control must not hide a late-mounted file.
      if (probes.length === 0) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            resolve(undefined);
          };
          const observer = new MutationObserver(() => {
            probes = collect();
            if (probes.length > 0) finish();
          });
          observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
          setTimeout(finish, 5_000);
        });
      }
      return probes;
    })()`,
					awaitPromise: true,
					returnByValue: true,
					timeout: CHATGPT_VISIBLE_DOWNLOAD_ARTIFACT_PROBES_TIMEOUT_MS,
				}),
				CHATGPT_VISIBLE_DOWNLOAD_ARTIFACT_PROBES_TIMEOUT_MS,
				`Timed out reading visible ChatGPT download artifact probes after ${CHATGPT_VISIBLE_DOWNLOAD_ARTIFACT_PROBES_TIMEOUT_MS}ms.`,
			),
	);
	const value = result?.value;
	return Array.isArray(value)
		? value.filter(isRecord).map((item) => ({
				turnId: readStringField(item, "turnId"),
				messageId: readStringField(item, "messageId"),
				messageIndex: readFiniteNumberField(item, "messageIndex"),
				buttonIndex: readFiniteNumberField(item, "buttonIndex"),
				title: readStringField(item, "title"),
			}))
		: [];
}

export const readVisibleChatgptDownloadArtifactProbesWithClientForTest =
	readVisibleChatgptDownloadArtifactProbesWithClient;

async function readVisibleChatgptImageArtifactProbesWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<ChatgptVisibleImageArtifactProbe[]> {
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.readVisibleImageArtifactProbes");
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 4 || rect.height <= 4) return false;
        const style = node.ownerDocument.defaultView.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      };
      const roots = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
        .map((section, messageIndex) => {
          const roleNode = section.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
          return {
            section,
            messageIndex,
            role: normalize(
              roleNode?.getAttribute('data-message-author-role') ||
	          roleNode?.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
	          roleNode?.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
              section.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
              section.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
              section.getAttribute('data-message-author-role') ||
              section.getAttribute('data-turn') ||
              '',
            ),
            turnId: normalize(section.getAttribute('data-turn-id') || ''),
            messageId: normalize(roleNode?.getAttribute('data-message-id') || section.getAttribute('data-message-id') || ''),
          };
        });
      return roots.flatMap((entry) => {
        if (entry.role !== 'assistant') return [];
        const imageRoots = Array.from(entry.section.querySelectorAll('[id^="image-"], [class*="imagegen-image"]'))
          .filter(isVisible);
        const rootImages = imageRoots.flatMap((root, rootIndex) => {
          const wrapperId = normalize(root.getAttribute('id') || '') || \`image-root-\${rootIndex}\`;
          return Array.from(root.querySelectorAll('img')).map((img, imageIndex) => ({
            turnId: entry.turnId || null,
            messageId: entry.messageId || null,
            messageIndex: entry.messageIndex,
            imageIndex,
            wrapperId,
            src: normalize(img.currentSrc || img.getAttribute('src') || ''),
            alt: normalize(img.getAttribute('alt') || ''),
            title: normalize(img.getAttribute('alt') || root.getAttribute('aria-label') || ''),
            visible: isVisible(img),
          }));
        });
        const fallbackImages = Array.from(entry.section.querySelectorAll('img'))
          .map((img, imageIndex) => ({
            turnId: entry.turnId || null,
            messageId: entry.messageId || null,
            messageIndex: entry.messageIndex,
            imageIndex,
            wrapperId: null,
            src: normalize(img.currentSrc || img.getAttribute('src') || ''),
            alt: normalize(img.getAttribute('alt') || ''),
            title: normalize(img.getAttribute('alt') || ''),
            visible: isVisible(img),
          }));
        return [...rootImages, ...fallbackImages]
          .filter((probe) => probe.visible && probe.src && /^(https?:|blob:|data:image\\/)/i.test(probe.src))
          .map(({ visible, ...probe }) => probe);
      });
    })()`,
		returnByValue: true,
	});
	const value = result?.value;
	return Array.isArray(value)
		? value.filter(isRecord).map((item) => ({
				turnId: readStringField(item, "turnId"),
				messageId: readStringField(item, "messageId"),
				messageIndex: readFiniteNumberField(item, "messageIndex"),
				imageIndex: readFiniteNumberField(item, "imageIndex"),
				wrapperId: readStringField(item, "wrapperId"),
				src: readStringField(item, "src"),
				alt: readStringField(item, "alt"),
				title: readStringField(item, "title"),
			}))
		: [];
}

async function readVisibleChatgptCanvasProbesWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<ChatgptConversationCanvasProbe[]> {
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.readVisibleCanvasProbes");
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
      const trimLine = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const toolbarPattern = /^(copy|edit|download|expand|collapse)(\\s+(copy|edit|download|expand|collapse))*$/i;
      return Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
        .map((node) => {
          const textdocId = trimLine((node.getAttribute('id') || '').replace(/^textdoc-message-/, ''));
          const title = trimLine(node.querySelector('span.font-semibold, [class*="font-semibold"]')?.textContent || '');
          const lines = normalize(node.innerText || node.textContent || '')
            .split(/\\n+/)
            .map((line) => trimLine(line))
            .filter(Boolean);
          while (lines.length > 0 && title && lines[0] === title) {
            lines.shift();
          }
          while (lines.length > 0 && toolbarPattern.test(lines[0] || '')) {
            lines.shift();
          }
          return {
            textdocId: textdocId || null,
            title: title || null,
            contentText: lines.join('\\n').trim() || null,
          };
        })
        .filter((item) => item.title || item.textdocId || item.contentText);
    })()`,
		returnByValue: true,
	});
	const value = result?.value;
	return Array.isArray(value)
		? value.filter(isRecord).map((item) => ({
				textdocId: readStringField(item, "textdocId"),
				title: readStringField(item, "title"),
				contentText: readStringField(item, "contentText"),
			}))
		: [];
}

async function readVisibleChatgptConversationFilesWithClient(
	client: ChromeClient,
	conversationId: string,
	options?: BrowserProviderListOptions,
): Promise<FileRef[]> {
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.readVisibleConversationFiles");
	const { result } = await withChatgptTimeout(
		client.Runtime.evaluate({
			expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const extractLabel = (tile, name) => {
        const values = Array.from(tile.querySelectorAll('div, span, p'))
          .map((node) => normalize(node.textContent || ''))
          .filter(Boolean);
        const unique = Array.from(new Set(values));
        return unique.find((value) => value && value !== name && !value.includes(name)) || '';
      };
      const readReactFileTileMetadata = (tile) => {
        const reactKey = Object.getOwnPropertyNames(tile)
          .find((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        let fiber = reactKey ? tile[reactKey] : null;
        for (let depth = 0; fiber && depth < 8; depth += 1) {
          const candidates = [fiber.memoizedProps, fiber.pendingProps].filter(Boolean);
          for (const props of candidates) {
            if (!props || typeof props !== 'object') continue;
            const providerFileId = normalize(props.fileId || props.file_id || '');
            const fileName = normalize(props.file || props.fileName || props.name || '');
            if (!providerFileId && !fileName) continue;
            const capabilities = props.capabilities && typeof props.capabilities === 'object'
              ? props.capabilities
              : {};
            return {
              providerFileId: providerFileId || null,
              fileName: fileName || null,
              mimeType: normalize(props.mimeType || props.mime_type || '') || null,
              downloadable: normalize(capabilities.downloadable || props.downloadable || '') || null,
              previewable: normalize(
                typeof capabilities.previewable === 'string'
                  ? capabilities.previewable
                  : (props.previewable || ''),
              ) || null,
            };
          }
          fiber = fiber.return;
        }
        return null;
      };
      const previewName = (node) => {
        const ariaLabel = normalize(node.getAttribute?.('aria-label') || '');
        return normalize(ariaLabel.match(/^Open preview of\\s+(.+)$/i)?.[1] || '');
      };
      const collect = () => {
        const items = [];
        const nodes = Array.from(
          document.querySelectorAll(
            ${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} ${CHATGPT_USER_MESSAGE_AUTHOR_ROLE_SELECTOR}`)},
          ),
        )
          .filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
        nodes.forEach((node) => {
          const section = node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)});
          const turnId = normalize(section?.getAttribute('data-turn-id') || '');
          const messageId = normalize(node.getAttribute('data-message-id') || '');
          const legacyTiles = Array.from(node.querySelectorAll('[role="group"][aria-label]'))
            .filter((tile) => tile.querySelector('button[aria-label], a[aria-label], button, a'));
          const semanticPreviewControls = Array.from(
            node.querySelectorAll('button[aria-label^="Open preview of "]'),
          ).filter((button) => !legacyTiles.some((tile) => tile.contains(button)));
          const tiles = [...legacyTiles, ...semanticPreviewControls];
          tiles.forEach((tile, tileIndex) => {
            const semanticName = previewName(tile);
            const name = normalize(
              semanticName ||
              previewName(tile.querySelector('button[aria-label^="Open preview of "]')) ||
              tile.getAttribute('aria-label') ||
              tile.querySelector('button[aria-label], a[aria-label]')?.getAttribute('aria-label') ||
              '',
            );
            if (!name) return;
            const reactMetadata = readReactFileTileMetadata(tile);
            items.push({
              turnId: turnId || null,
              messageId: messageId || null,
              tileIndex,
              name: reactMetadata?.fileName || name,
              label: extractLabel(tile, name) || null,
              providerFileId: reactMetadata?.providerFileId || null,
              mimeType: reactMetadata?.mimeType || null,
              downloadable: reactMetadata?.downloadable || null,
              previewable: reactMetadata?.previewable || null,
            });
          });
        });
        return items;
      };
		const hasUserFileControl = () => Array.from(
			document.querySelectorAll(
				${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} ${CHATGPT_USER_MESSAGE_AUTHOR_ROLE_SELECTOR}`)},
			),
		)
			.filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}))
			.some((node) => Boolean(
				node.querySelector('button[aria-label^="Open preview of "], [role="group"][aria-label]'),
			));
		// Conversation-surface readiness is established by the caller. Repeating
		// Message readiness can precede late-mounted upload tiles. Wait without a
		// reload/navigation and collect the full ready surface exactly once.
		if (!hasUserFileControl()) {
			await new Promise((resolve) => {
				let settled = false;
				const finish = () => {
					if (settled) return;
					settled = true;
					observer.disconnect();
					resolve(undefined);
				};
				const observer = new MutationObserver(() => {
					if (hasUserFileControl()) finish();
				});
				observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
				setTimeout(finish, 5_000);
			});
		}
		return collect();
	})()`,
			awaitPromise: true,
			returnByValue: true,
		}),
		CHATGPT_VISIBLE_FILES_READ_TIMEOUT_MS,
		`Timed out reading visible ChatGPT conversation files after ${CHATGPT_VISIBLE_FILES_READ_TIMEOUT_MS}ms.`,
	);
	const rawItems = Array.isArray(result?.value)
		? (result.value as ChatgptConversationFileProbe[])
		: [];
	return normalizeChatgptConversationFileProbes(conversationId, rawItems);
}

export const readVisibleChatgptConversationFilesWithClientForTest =
	readVisibleChatgptConversationFilesWithClient;

async function readChatgptLibraryItemsWithClient(
	client: ChromeClient,
): Promise<{ files: FileRef[]; artifacts: ConversationArtifact[] }> {
	const { result } = await client.Runtime.evaluate({
		expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textTitle = (node) => {
        const labels = [
          node.getAttribute?.('aria-label') || '',
          node.querySelector?.('[data-testid*="title" i], h1, h2, h3, [role="heading"]')?.textContent || '',
          node.querySelector?.('img[alt]')?.getAttribute('alt') || '',
          node.textContent || '',
        ].map(normalize).filter(Boolean);
        const text = labels.find((value) => value.length > 0 && value.length <= 180) || '';
        return text
          .split(/\\b(?:Download|Open|Preview|Copy link|Share)\\b/i)[0]
          .replace(/\\s+/g, ' ')
          .trim();
      };
      const extractId = (value, prefix) => {
        const match = String(value || '').match(new RegExp('\\\\b' + prefix + '[A-Za-z0-9_]+\\\\b'));
        return match ? match[0] : '';
      };
      const readLibraryIds = (node, card) => {
        const haystack = [
          node.getAttribute?.('data-testid') || '',
          node.getAttribute?.('aria-label') || '',
          card.getAttribute?.('data-testid') || '',
          card.getAttribute?.('aria-label') || '',
          ...Array.from(card.querySelectorAll?.('[data-testid], [aria-label]') || [])
            .slice(0, 20)
            .flatMap((child) => [
              child.getAttribute?.('data-testid') || '',
              child.getAttribute?.('aria-label') || '',
            ]),
        ].join(' ');
        return {
          providerFileId: extractId(haystack, 'file_') || null,
          libraryFileId: extractId(haystack, 'libfile_') || null,
        };
      };
      const collect = () => {
        const candidates = [];
        const nodes = Array.from(document.querySelectorAll([
          'a[href]',
          'button',
          '[role="link"]',
          '[role="button"]',
          '[data-testid*="library" i]',
          '[data-testid*="file" i]',
          '[data-testid*="artifact" i]',
          'img[src]',
        ].join(','))).filter(isVisible);
        for (const node of nodes) {
          const card = node.closest?.('tr, [role="row"], article, li, [role="listitem"], [data-testid*="row" i], [data-testid*="card" i], [data-testid*="tile" i], [class*="row" i], [class*="card" i], [class*="tile" i]') || node;
          const href = node.href || node.getAttribute?.('href') || card.querySelector?.('a[href]')?.href || '';
          const image = node.matches?.('img[src]') ? node : card.querySelector?.('img[src]');
          const src = image?.src || '';
          const title = textTitle(card) || textTitle(node);
          const text = normalize(card.textContent || node.textContent || '');
          const testId = normalize(node.getAttribute?.('data-testid') || card.getAttribute?.('data-testid') || '');
          const ariaLabel = normalize(node.getAttribute?.('aria-label') || card.getAttribute?.('aria-label') || '');
          const ids = readLibraryIds(node, card);
          const signal = [href, src, title, text, testId, ariaLabel].join(' ').toLowerCase();
          if (!title && !href && !src) continue;
          if (!/(library|file|artifact|download|sandbox|image|canvas|spreadsheet|\\.pdf|\\.docx?|\\.xlsx?|\\.csv|\\.png|\\.jpe?g|\\.webp|\\.zip)/i.test(signal)) {
            continue;
          }
          candidates.push({
            title: title || null,
            href: href || null,
            src: src || null,
            kind: testId || null,
            subtitle: normalize(card.querySelector?.('time, [datetime], small, [class*="subtitle" i], [class*="description" i]')?.textContent || '') || null,
            text: text || null,
            testId: testId || null,
            ariaLabel: ariaLabel || null,
            providerFileId: ids.providerFileId,
            libraryFileId: ids.libraryFileId,
          });
        }
        const seen = new Set();
        return candidates.filter((item) => {
          const key = [item.providerFileId, item.libraryFileId, item.href, item.src, item.title, item.text].filter(Boolean).join('|').toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const items = collect();
        if (items.length > 0) return items;
        await sleep(250);
      }
      return collect();
    })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	const rawItems = Array.isArray(result?.value) ? (result.value as ChatgptLibraryItemProbe[]) : [];
	return normalizeChatgptLibraryItemProbes(rawItems);
}

async function renameChatgptConversationWithClient(
	client: ChromeClient,
	conversationId: string,
	newTitle: string,
	projectId?: string | null,
): Promise<void> {
	const shortPause = async () => {
		const min = 800;
		const max = 1_500;
		const ms = min + Math.floor(Math.random() * (max - min + 1));
		await new Promise((resolve) => setTimeout(resolve, ms));
	};
	const longPause = async () => {
		const min = 10_000;
		const max = 15_000;
		const ms = min + Math.floor(Math.random() * (max - min + 1));
		await new Promise((resolve) => setTimeout(resolve, ms));
	};
	await navigateToChatgptConversation(client, conversationId, projectId);
	await ensureChatgptSidebarOpen(client);
	if (
		await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)
	) {
		return;
	}
	let tagged: { rowSelector: string; actionSelector: string } | null = null;
	const tagFailures: ChatgptConversationRowTagAttemptFailure[] = [];
	const tryTagConversationRow = async (label: string) => {
		try {
			return await tagChatgptConversationRowExact(client, conversationId, projectId);
		} catch (error) {
			tagFailures.push({
				attemptLabel: label,
				error: error instanceof Error ? error.message : String(error),
				diagnostics: readChatgptConversationRowTagDiagnostics(error),
			});
			return null;
		}
	};
	const tagAttemptPlans: Array<{
		label: string;
		target: "conversation" | "list";
		useLongPause?: boolean;
	}> = [
		{ label: "primary", target: "conversation" },
		{ label: "list-open-1", target: "list" },
		{ label: "list-open-2", target: "list" },
		{ label: "list-refresh", target: "list", useLongPause: true },
	];

	for (const [index, attempt] of tagAttemptPlans.entries()) {
		if (index > 0) {
			if (attempt.useLongPause) {
				await longPause();
			} else {
				await shortPause();
			}
		}
		if (attempt.target === "conversation") {
			await navigateToChatgptConversation(client, conversationId, projectId);
		} else {
			await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
		}
		await ensureChatgptSidebarOpen(client);
		try {
			await waitForPredicate(
				client.Runtime,
				buildConversationRowActionReadyExpression(conversationId, projectId),
				{
					timeoutMs: 4_000,
					description: `ChatGPT conversation row actions ready for ${conversationId}`,
				},
			);
		} catch {
			// Intentional fallback: tagging logic has polling and can proceed without this gate.
		}
		tagged = await tryTagConversationRow(attempt.label);
		if (tagged) {
			break;
		}
	}
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			if (
				await isChatgptConversationTitleAppliedWithClient(
					client,
					conversationId,
					newTitle,
					projectId,
				)
			) {
				return;
			}
			if (!tagged) {
				throw new Error(summarizeChatgptConversationRowTagFailure(conversationId, tagFailures));
			}
			await shortPause();
			const renameEditorOpen = await openChatgptTaggedConversationRenameEditor(client, tagged);
			if (!renameEditorOpen.ok) {
				throw new Error(
					`ChatGPT conversation rename editor did not open for ${conversationId}: ${renameEditorOpen.reason || "direct rename path failed"} (${JSON.stringify(renameEditorOpen.diagnostics ?? null)})`,
				);
			}
			const submitted = tagged
				? await submitInlineRename(
						client.Runtime,
						{
							value: newTitle,
							inputSelector: 'input[name="title-editor"]',
							closeSelector: 'input[name="title-editor"]',
							timeoutMs: 4_000,
							entryStrategy: "native-input",
							submitStrategy: "native-enter",
						},
						{ Input: client.Input },
					)
				: { ok: false as const, reason: "Sidebar row unavailable after rename trigger" };
			if (submitted.ok) {
				await shortPause();
				if (
					await isChatgptConversationTitleAppliedWithClient(
						client,
						conversationId,
						newTitle,
						projectId,
					)
				) {
					return;
				}
				const nativeRetryEditorOpen = await openChatgptTaggedConversationRenameEditor(
					client,
					tagged,
				);
				if (nativeRetryEditorOpen.ok) {
					const nativeRetrySubmitted = await submitInlineRename(
						client.Runtime,
						{
							value: newTitle,
							inputSelector: 'input[name="title-editor"]',
							closeSelector: 'input[name="title-editor"]',
							timeoutMs: 4_000,
							entryStrategy: "native-input",
							submitStrategy: "native-enter",
						},
						{ Input: client.Input },
					);
					if (nativeRetrySubmitted.ok) {
						await shortPause();
						if (
							await isChatgptConversationTitleAppliedWithClient(
								client,
								conversationId,
								newTitle,
								projectId,
							)
						) {
							return;
						}
					}
				}
				return;
			}
			const submittedFromVisibleRenameInput = await submitInlineRename(
				client.Runtime,
				{
					value: newTitle,
					inputSelector: 'input[name="title-editor"]',
					closeSelector: 'input[name="title-editor"]',
					timeoutMs: 5_000,
					entryStrategy: "native-input",
					submitStrategy: "native-enter",
				},
				{ Input: client.Input },
			);
			if (submittedFromVisibleRenameInput.ok) {
				await shortPause();
				if (
					await isChatgptConversationTitleAppliedWithClient(
						client,
						conversationId,
						newTitle,
						projectId,
					)
				) {
					return;
				}
				return;
			}
			if (!submitted.ok) {
				throw new Error(
					submittedFromVisibleRenameInput.reason ||
						submitted.reason ||
						`ChatGPT inline rename failed for ${conversationId}`,
				);
			}
			return;
		},
		{
			label: "chatgpt-rename-conversation",
			candidateSelectors: [
				'[role="menu"]',
				'[role="menuitem"]',
				"button[aria-label]",
				'input[type="text"]',
			],
			context: {
				conversationId,
				projectId: projectId ?? null,
				tagFailures,
			},
		},
	);
	await waitForChatgptConversationTitleApplied(client, conversationId, newTitle, projectId);
}

async function deleteChatgptConversationWithClient(
	client: ChromeClient,
	conversationId: string,
	projectId?: string | null,
): Promise<void> {
	const deleteInteractionStrategies = ["pointer", "keyboard-space", "keyboard-arrowdown"] as const;
	await navigateToChatgptConversation(client, conversationId, projectId);
	const { result } = await client.Runtime.evaluate({
		expression: `(() => document.title.replace(/^ChatGPT\\s*-\\s*/i, '').replace(/\\s+/g, ' ').trim())()`,
		returnByValue: true,
	});
	const expectedTitle =
		normalizeUiText(typeof result?.value === "string" ? result.value : "") || undefined;
	await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
	await ensureChatgptSidebarOpen(client);
	let tagged: { rowSelector: string; actionSelector: string } | null = null;
	try {
		tagged = await tagChatgptConversationRowExact(client, conversationId, projectId);
	} catch {
		await navigateToChatgptConversation(client, conversationId, projectId);
		await ensureChatgptSidebarOpen(client);
		try {
			tagged = await tagChatgptConversationRowExact(client, conversationId, projectId);
		} catch {
			await navigateToChatgptConversation(client, conversationId, projectId);
		}
	}
	await withUiDiagnostics(
		client.Runtime,
		async () => {
			let deleteReady = tagged
				? await openChatgptTaggedConversationDeleteConfirmation(client, tagged, expectedTitle)
				: { ok: false as const, reason: "Sidebar row unavailable" };
			if (!deleteReady.ok) {
				const headerSelection = await openAndSelectMenuItemFromTriggers(client.Runtime, {
					triggers: [
						{
							name: "conversation-header",
							beforeAttempt: async () => {
								await navigateToChatgptConversation(client, conversationId, projectId);
							},
							trigger: {
								selector: CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
								interactionStrategies: deleteInteractionStrategies,
								requireVisible: true,
								timeoutMs: 3_000,
							},
							menuSelector: '[role="menu"]',
							closeMenuAfter: true,
						},
					],
					itemMatch: { exact: [CHATGPT_CONVERSATION_ACTION_DELETE_LABEL] },
					timeoutMs: 4_000,
				});
				deleteReady = headerSelection.ok
					? { ok: true }
					: { ok: false, reason: headerSelection.reason || deleteReady.reason };
			}
			if (!deleteReady.ok) {
				throw new Error(
					`ChatGPT conversation delete menu did not open for ${conversationId}: ${deleteReady.reason || "no matching action surface"}`,
				);
			}
			let confirmationReady = await waitForChatgptDeleteConfirmationReady(
				client,
				expectedTitle,
				5_000,
			);
			if (!confirmationReady.ok) {
				const headerRetry = await openAndSelectMenuItemFromTriggers(client.Runtime, {
					triggers: [
						{
							name: "conversation-header",
							beforeAttempt: async () => {
								await navigateToChatgptConversation(client, conversationId, projectId);
							},
							trigger: {
								selector: CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
								interactionStrategies: deleteInteractionStrategies,
								requireVisible: true,
								timeoutMs: 3_000,
							},
							menuSelector: '[role="menu"]',
							closeMenuAfter: true,
						},
					],
					itemMatch: { exact: [CHATGPT_CONVERSATION_ACTION_DELETE_LABEL] },
					timeoutMs: 4_000,
				});
				if (!headerRetry.ok) {
					throw new Error(
						`ChatGPT conversation delete confirmation did not open for ${conversationId}: ${headerRetry.reason || "header retry failed"}`,
					);
				}
				confirmationReady = await waitForChatgptDeleteConfirmationReady(
					client,
					expectedTitle,
					5_000,
				);
				if (!confirmationReady.ok) {
					throw new Error(
						`ChatGPT delete confirmation did not open for ${conversationId} (${JSON.stringify(confirmationReady.probe ?? null)})`,
					);
				}
			}
			const pressed = await pressButton(client.Runtime, {
				selector: CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR,
				rootSelectors: DEFAULT_DIALOG_SELECTORS,
				requireVisible: true,
				timeoutMs: 3_000,
			});
			if (!pressed.ok) {
				throw new Error(
					pressed.reason || `ChatGPT delete confirm button not found for ${conversationId}`,
				);
			}
		},
		{
			label: "chatgpt-delete-conversation",
			candidateSelectors: [
				`[${CHATGPT_CONVERSATION_ACTION_ATTR}="true"]`,
				CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
				'[role="menu"]',
				'[role="dialog"]',
				CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR,
			],
			context: {
				conversationId,
				projectId: projectId ?? null,
			},
		},
	);
	await waitForChatgptConversationDeleted(client, conversationId, projectId);
}

async function readChatgptTableArtifactRowsWithClient(
	client: ChromeClient,
	title: string,
): Promise<string[][] | null> {
	const expression = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const expected = normalize(${JSON.stringify(title)}).toLowerCase();
    const sections = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}));
    for (const section of sections) {
      const sectionText = normalize(section.textContent).toLowerCase();
      if (!sectionText.includes(expected)) continue;
      const table = section.querySelector('table[role="grid"], table');
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll('tr'))
        .map((row) =>
          Array.from(row.querySelectorAll('th,td')).map((cell) => normalize(cell.textContent)),
        )
        .filter((row) => row.some(Boolean));
      if (rows.length > 0) {
        return rows;
      }
    }
    return null;
  })()`;
	const result = await client.Runtime.evaluate({
		expression,
		returnByValue: true,
	});
	const value = result.result?.value;
	if (!Array.isArray(value)) {
		return null;
	}
	return value
		.filter(Array.isArray)
		.map((row) =>
			row.map((cell) => normalizeUiText(cell)).filter((_cell, index, arr) => index < arr.length),
		)
		.filter((row) => row.length > 0);
}

async function waitForChatgptTableArtifactRowsWithClient(
	client: ChromeClient,
	title: string,
): Promise<boolean> {
	const predicate = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const expected = normalize(${JSON.stringify(title)}).toLowerCase();
    const sections = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}));
    for (const section of sections) {
      const sectionText = normalize(section.textContent).toLowerCase();
      if (!sectionText.includes(expected)) continue;
      const table = section.querySelector('table[role="grid"], table');
      if (!table) continue;
      const rowCount = Array.from(table.querySelectorAll('tr')).filter((row) =>
        Array.from(row.querySelectorAll('th,td')).some((cell) => normalize(cell.textContent).length > 0),
      ).length;
      if (rowCount > 0) {
        return true;
      }
    }
    return false;
  })()`;
	const ready = await waitForPredicate(client.Runtime, predicate, {
		timeoutMs: 10_000,
		description: `ChatGPT table artifact "${title}" ready`,
	});
	return ready.ok;
}

async function readChatgptImageArtifactSrcWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
): Promise<string | null> {
	const expression = `(() => {
    return Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
    }));
  })()`;
	const result = await client.Runtime.evaluate({
		expression,
		returnByValue: true,
	});
	const value = result.result?.value;
	const probes = Array.isArray(value)
		? value.filter(isRecord).map((item) => ({
				src: readStringField(item, "src"),
				alt: readStringField(item, "alt"),
			}))
		: [];
	const match = probes.find((probe) => matchesChatgptImageArtifactProbe(probe, artifact));
	return normalizeUiText(match?.src) || null;
}

async function waitForChatgptImageArtifactWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
): Promise<boolean> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const src = await readChatgptImageArtifactSrcWithClient(client, artifact);
		if (src) {
			return true;
		}
		await sleep(250);
	}
	return false;
}

async function fetchChatgptBinaryWithClient(
	client: ChromeClient,
	url: string,
	options?: BrowserProviderListOptions,
	timeoutMs = CHATGPT_ARTIFACT_CAPTURED_FETCH_TIMEOUT_MS,
): Promise<{ buffer: Buffer; contentType: string | null; contentDisposition: string | null }> {
	const expression = `(async () => {
    const response = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
      };
    }
    const contentType = response.headers.get('content-type');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
      return {
        ok: true,
        contentType,
        contentDisposition: response.headers.get('content-disposition'),
        base64: btoa(binary),
      };
    })()`;
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	recordBrowserScrapeProviderAction(options, "chatgpt.fetchBinary");
	recordBrowserScrapeDownloadAttempt(options);
	try {
		const result = await withChatgptTimeout(
			client.Runtime.evaluate({
				expression,
				awaitPromise: true,
				returnByValue: true,
			}),
			timeoutMs,
			`Timed out fetching ChatGPT artifact binary from captured URL after ${timeoutMs}ms.`,
		);
		const value = isRecord(result.result?.value) ? result.result.value : null;
		if (!value || value.ok !== true || typeof value.base64 !== "string") {
			if (result.exceptionDetails || !value) {
				const loadedResource = await readLoadedChatgptResourceWithClient(
					client,
					url,
					options,
					timeoutMs,
				).catch(() => null);
				if (loadedResource) {
					recordBrowserScrapeDownloadSuccess(options);
					return loadedResource;
				}
			}
			const status = typeof value?.status === "number" ? ` (status ${value.status})` : "";
			throw new Error(`ChatGPT artifact binary fetch failed${status}`);
		}
		recordBrowserScrapeDownloadSuccess(options);
		return {
			buffer: Buffer.from(value.base64, "base64"),
			contentType: typeof value.contentType === "string" ? value.contentType : null,
			contentDisposition:
				typeof value.contentDisposition === "string" ? value.contentDisposition : null,
		};
	} catch (error) {
		recordBrowserScrapeDownloadFailure(options);
		throw error;
	}
}

async function readLoadedChatgptResourceWithClient(
	client: ChromeClient,
	url: string,
	options: BrowserProviderListOptions | undefined,
	timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string | null; contentDisposition: null } | null> {
	const page = client.Page as
		| {
				getResourceTree?: () => Promise<{
					frameTree?: {
						frame?: { id?: string };
						resources?: Array<{ url?: string; mimeType?: string }>;
					};
				}>;
				getResourceContent?: (input: {
					frameId: string;
					url: string;
				}) => Promise<{ content?: string; base64Encoded?: boolean }>;
		  }
		| undefined;
	if (!page?.getResourceTree || !page.getResourceContent) {
		return null;
	}
	recordBrowserScrapeProviderAction(options, "chatgpt.fetchBinaryResourceContent");
	recordBrowserScrapeCdpCall(options, "Page.getResourceTree");
	const tree = await withChatgptTimeout(
		page.getResourceTree(),
		timeoutMs,
		`Timed out reading ChatGPT artifact resource tree after ${timeoutMs}ms.`,
	);
	const frameId = normalizeUiText(tree.frameTree?.frame?.id);
	if (!frameId) {
		return null;
	}
	recordBrowserScrapeCdpCall(options, "Page.getResourceContent");
	const response = await withChatgptTimeout(
		page.getResourceContent({ frameId, url }),
		timeoutMs,
		`Timed out reading ChatGPT artifact resource content after ${timeoutMs}ms.`,
	);
	if (typeof response.content !== "string" || response.content.length === 0) {
		return null;
	}
	const buffer = Buffer.from(response.content, response.base64Encoded ? "base64" : "utf8");
	if (buffer.length === 0) {
		return null;
	}
	const resource = tree.frameTree?.resources?.find((candidate) => candidate.url === url);
	const contentType =
		normalizeUiText(resource?.mimeType) || inferChatgptBinaryContentType(buffer, url);
	return {
		buffer,
		contentType: contentType || null,
		contentDisposition: null,
	};
}

export const fetchChatgptBinaryWithClientForTest = fetchChatgptBinaryWithClient;

function parseChatgptConversationFileRefName(
	conversationId: string,
	fileId: string,
): string | null {
	const prefix = `${conversationId}:`;
	if (!fileId.startsWith(prefix)) return null;
	const rest = fileId.slice(prefix.length);
	const parts = rest.split(":");
	if (parts.length < 3) return null;
	return normalizeUiText(parts.slice(2).join(":")) || null;
}

function resolveChatgptConversationProviderFileId(fileId: string, file?: FileRef): string | null {
	const metadata = file?.metadata && typeof file.metadata === "object" ? file.metadata : null;
	const metadataFileId =
		metadata && typeof metadata.providerFileId === "string"
			? normalizeUiText(metadata.providerFileId)
			: "";
	if (metadataFileId) return metadataFileId;
	const remoteUrl = normalizeUiText(file?.remoteUrl);
	const remoteFileId = extractChatgptArtifactFileId(remoteUrl);
	if (remoteFileId) return remoteFileId;
	const direct = fileId.match(/\bfile_[A-Za-z0-9_]+\b/)?.[0];
	return direct ? normalizeUiText(direct) : null;
}

type ChatgptCapturedFileIdentityDecision = "providerFileIdMatch" | ChatgptFileNameIdentityDecision;

function classifyChatgptCapturedFileIdentityValues(input: {
	capturedUrl: string | null;
	contentDisposition: string | null;
	targetProviderFileId: string | null;
	targetName: string | null;
}): {
	decision: ChatgptCapturedFileIdentityDecision | null;
	failure: string | null;
} {
	const normalize = (value: string | null | undefined): string =>
		typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
	const capturedUrl = normalize(input.capturedUrl);
	if (
		input.targetProviderFileId &&
		/\/backend-api\/files\/download\//.test(capturedUrl) &&
		capturedUrl.includes(encodeURIComponent(input.targetProviderFileId))
	) {
		return { decision: "providerFileIdMatch", failure: null };
	}
	const disposition = normalize(input.contentDisposition);
	const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
	const quoted = disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1];
	const bare = disposition.match(/filename\s*=\s*([^;]+)/i)?.[1];
	const candidate = (encoded ?? quoted ?? bare ?? "").trim().replace(/^['"]|['"]$/g, "");
	let responseName = "";
	if (candidate) {
		try {
			responseName = normalize(decodeURIComponent(candidate));
		} catch {
			responseName = normalize(candidate);
		}
	}
	if (input.targetName && responseName) {
		const normalizeName = (value: string): string => normalize(value).toLowerCase();
		if (normalizeName(responseName) === normalizeName(input.targetName)) {
			return { decision: "exactMatch", failure: null };
		}
		const readExtension = (value: string): string => {
			const index = value.lastIndexOf(".");
			return index >= 0 ? value.slice(index) : "";
		};
		const actualExtension = readExtension(responseName);
		const targetExtension = readExtension(input.targetName);
		if (actualExtension.toLowerCase() !== targetExtension.toLowerCase()) {
			return {
				decision: "extensionMismatch",
				failure: `captured_asset_identity_mismatch: requested=${input.targetName} response=${responseName}`,
			};
		}
		const actualStem = responseName.slice(0, responseName.length - actualExtension.length);
		const targetStem = input.targetName.slice(0, input.targetName.length - targetExtension.length);
		const normalizeCollisionStem = (value: string): string =>
			normalizeName(value.replace(/\s?\(\d+\)$/, ""));
		if (normalizeCollisionStem(actualStem) === normalizeCollisionStem(targetStem)) {
			return { decision: "collisionSuffixMatch", failure: null };
		}
		return {
			decision: "stemMismatch",
			failure: `captured_asset_identity_mismatch: requested=${input.targetName} response=${responseName}`,
		};
	}
	return {
		decision: null,
		failure: `captured_asset_identity_mismatch: requested=${input.targetName ?? input.targetProviderFileId ?? "unknown"} response=${responseName || capturedUrl || "unknown"}`,
	};
}

export const classifyChatgptCapturedFileIdentityValuesForTest =
	classifyChatgptCapturedFileIdentityValues;

function classifyChatgptCapturedFileIdentity(input: {
	captured: Record<string, unknown>;
	targetProviderFileId: string | null;
	targetName: string | null;
}): {
	decision: ChatgptCapturedFileIdentityDecision | null;
	failure: string | null;
} {
	return classifyChatgptCapturedFileIdentityValues({
		capturedUrl: typeof input.captured.url === "string" ? input.captured.url : null,
		contentDisposition:
			typeof input.captured.contentDisposition === "string"
				? input.captured.contentDisposition
				: null,
		targetProviderFileId: input.targetProviderFileId,
		targetName: input.targetName,
	});
}

export function resolveChatgptDownloadUrlFromJson(
	json: unknown,
	baseUrl = "https://chatgpt.com/",
): string | null {
	const record =
		json && typeof json === "object" && !Array.isArray(json)
			? (json as Record<string, unknown>)
			: null;
	const nestedRecords = [record?.data, record?.result].filter(
		(value): value is Record<string, unknown> =>
			Boolean(value) && typeof value === "object" && !Array.isArray(value),
	);
	const candidates: unknown[] = [
		typeof json === "string" ? json : null,
		...[record, ...nestedRecords].flatMap((source) =>
			source
				? [
						source.download_url,
						source.downloadUrl,
						source.signed_url,
						source.signedUrl,
						source.url,
						source.href,
					]
				: [],
		),
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const value = candidate.trim();
		if (!/^(?:https?:\/\/|\/)/i.test(value)) continue;
		try {
			const resolved = new URL(value, baseUrl);
			if (resolved.protocol === "http:" || resolved.protocol === "https:") {
				return resolved.href;
			}
		} catch {
			// Ignore malformed provider response candidates.
		}
	}
	return null;
}

export function summarizeChatgptDownloadJsonShape(json: unknown): Record<string, unknown> {
	const kindOf = (value: unknown): string => {
		if (value === null) return "null";
		if (Array.isArray(value)) return "array";
		return typeof value;
	};
	const summarizeRecord = (value: Record<string, unknown>): Record<string, unknown> => {
		const keys = Object.keys(value)
			.filter((key) => /^[A-Za-z0-9_.-]{1,64}$/.test(key))
			.sort()
			.slice(0, 12);
		return {
			kind: "object",
			keys,
			valueKinds: Object.fromEntries(keys.map((key) => [key, kindOf(value[key])] as const)),
		};
	};
	if (!json || typeof json !== "object" || Array.isArray(json)) {
		return { kind: kindOf(json) };
	}
	const root = summarizeRecord(json as Record<string, unknown>);
	const children = Object.fromEntries(
		Object.keys(json as Record<string, unknown>)
			.filter((key) => /^[A-Za-z0-9_.-]{1,64}$/.test(key))
			.sort()
			.slice(0, 12)
			.flatMap((key) => {
				const value = (json as Record<string, unknown>)[key];
				return value && typeof value === "object" && !Array.isArray(value)
					? [[key, summarizeRecord(value as Record<string, unknown>)] as const]
					: [];
			}),
	);
	return Object.keys(children).length > 0 ? { ...root, children } : root;
}

export function summarizeChatgptDownloadProviderError(
	json: unknown,
): Record<string, string> | null {
	if (!json || typeof json !== "object" || Array.isArray(json)) return null;
	const record = json as Record<string, unknown>;
	const source =
		record.error && typeof record.error === "object" && !Array.isArray(record.error)
			? (record.error as Record<string, unknown>)
			: record;
	const fields: Array<[string, unknown[]]> = [
		["code", [source.code, source.error_code]],
		["type", [source.type, source.error_type]],
		["status", [source.status]],
		["message", [source.message, source.error_message, source.detail]],
	];
	const summary: Record<string, string> = {};
	for (const [targetKey, candidates] of fields) {
		const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
		if (typeof value === "string") {
			summary[targetKey] = value.replace(/\s+/g, " ").trim().slice(0, 160);
		}
	}
	return Object.keys(summary).length > 0 ? summary : null;
}

export function selectChatgptDownloadFailure(current: unknown, candidate: unknown): unknown {
	const score = (value: unknown): number => {
		if (!value) return 0;
		if (typeof value !== "object" || Array.isArray(value)) return 1;
		const record = value as Record<string, unknown>;
		const status = typeof record.status === "number" ? record.status : null;
		let providerText = "";
		try {
			providerText = JSON.stringify(record.providerError ?? "").replace(/[_-]+/g, " ");
		} catch {
			providerText = "";
		}
		const explicitlyUnavailable =
			status === 404 ||
			status === 410 ||
			(/\b(?:file|asset)\b/i.test(providerText) &&
				/\b(?:not found|no longer available|unavailable|deleted|expired|does not exist)\b/i.test(
					providerText,
				));
		if (explicitlyUnavailable) return 100;
		if (status === 408 || status === 425 || status === 429 || (status != null && status >= 500)) {
			return 80;
		}
		if (record.providerError && typeof record.providerError === "object") return 70;
		if (record.responseShape && typeof record.responseShape === "object") return 50;
		if (status != null) return 40;
		return typeof record.reason === "string" ? 20 : 10;
	};
	return score(candidate) > score(current) ? candidate : current;
}

export async function waitForChatgptCaptureProgress(
	promises: readonly Promise<unknown>[],
	remainingMs: number,
	pollMs = 250,
): Promise<void> {
	const boundedWaitMs = Math.max(0, Math.min(pollMs, remainingMs));
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		const boundedWait = new Promise<void>((resolve) => {
			timeout = setTimeout(resolve, boundedWaitMs);
		});
		if (promises.length === 0) {
			await boundedWait;
			return;
		}
		await Promise.race([Promise.allSettled([...promises]).then(() => undefined), boundedWait]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function awaitChatgptDownloadPromiseWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	stage: string,
	onTimeout?: () => void,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(
					() => {
						try {
							onTimeout?.();
						} finally {
							reject(new Error(`chatgpt_download_timeout:${stage}:${timeoutMs}ms`));
						}
					},
					Math.max(0, timeoutMs),
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export function classifyChatgptFileRetrievalFailure(error: unknown): {
	failureKind: "provider_unavailable" | "retrieval_failed";
	retryable: boolean;
} {
	const message = error instanceof Error ? error.message : String(error);
	const diagnostics =
		error &&
		typeof error === "object" &&
		"retrievalDiagnostics" in error &&
		isRecord(error.retrievalDiagnostics)
			? error.retrievalDiagnostics
			: null;
	const structuredStatus = diagnostics?.status;
	const status =
		typeof structuredStatus === "number" && Number.isFinite(structuredStatus)
			? structuredStatus
			: Number.parseInt(message.match(/"status":(\d{3})/)?.[1] ?? "", 10);
	const textFragments: string[] = [message];
	const collectText = (value: unknown, depth: number): void => {
		if (depth > 2 || value == null) return;
		if (typeof value === "string") {
			textFragments.push(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value.slice(0, 8)) collectText(item, depth + 1);
			return;
		}
		if (isRecord(value)) {
			for (const item of Object.values(value).slice(0, 12)) collectText(item, depth + 1);
		}
	};
	collectText(diagnostics?.reason, 0);
	collectText(diagnostics?.providerError, 0);
	const normalizedEvidence = textFragments.join(" ").replace(/[_-]+/g, " ");
	const mentionsFile = /\b(?:file|asset)\b/i.test(normalizedEvidence);
	const mentionsUnavailable =
		/\b(?:not found|no longer available|unavailable|deleted|expired|does not exist)\b/i.test(
			normalizedEvidence,
		);
	const providerUnavailable =
		status === 404 || status === 410 || (mentionsFile && mentionsUnavailable);
	const retryable =
		status === 408 ||
		status === 425 ||
		status === 429 ||
		status >= 500 ||
		/\b(?:rate limit|cooldown|timed out|timeout|temporar(?:y|ily)|try again|connection closed)\b/i.test(
			normalizedEvidence,
		);
	return {
		failureKind: providerUnavailable ? "provider_unavailable" : "retrieval_failed",
		retryable: providerUnavailable ? false : retryable,
	};
}

async function downloadChatgptConversationFileWithClient(
	client: ChromeClient,
	conversationId: string,
	fileId: string,
	destPath: string,
	projectId?: string | null,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
	file?: FileRef,
	surfacePrepared = false,
): Promise<void> {
	const targetProviderFileId = resolveChatgptConversationProviderFileId(fileId, file);
	const targetName =
		normalizeUiText(file?.name) || parseChatgptConversationFileRefName(conversationId, fileId);
	if (!targetProviderFileId && !targetName) {
		throw new Error(
			`ChatGPT conversation file ${fileId} lacks a provider file id or visible file name.`,
		);
	}
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	const destinationDir = path.dirname(destPath);
	await fs.mkdir(destinationDir, { recursive: true });
	const browserDownloadDir = await fs.mkdtemp(
		path.join(destinationDir, ".auracall-chatgpt-file-download-"),
	);
	recordBrowserScrapeDownloadAttempt(options);
	const downloadFromReadySurface = async (): Promise<Record<string, unknown>> => {
		if (!surfacePrepared) {
			await ensureChatgptConversationSurfaceReadyForRead(
				client,
				conversationId,
				normalizedProjectId,
				options,
			);
		}
		recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
		recordBrowserScrapeProviderAction(options, "chatgpt.downloadConversationFile");
		await configureChatgptDownloadBehaviorWithClient(client, browserDownloadDir, options);
		const result = await client.Runtime.evaluate({
			expression: `(async () => {
          const targetProviderFileId = ${JSON.stringify(targetProviderFileId)};
          const targetName = ${JSON.stringify(targetName)};
          const conversationId = ${JSON.stringify(conversationId)};
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const originalFetch = window.__auracallOriginalFileFetch || window.fetch.bind(window);
          window.__auracallOriginalFileFetch = originalFetch;
          const encodeBytes = (bytes) => {
            let binary = '';
            const chunkSize = 0x8000;
            for (let index = 0; index < bytes.length; index += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
            }
            return btoa(binary);
          };
          const endpointKind = (url) => {
            const text = String(url || '');
            if (/\\/backend-api\\/files\\/download\\//.test(text)) return 'files-download';
            if (/\\/backend-api\\/estuary\\/content/.test(text)) return 'estuary-content';
            return 'other';
          };
          const providerErrorShape = ${summarizeChatgptDownloadProviderError.toString()};
          const resolveDownloadUrlFromJson = ${resolveChatgptDownloadUrlFromJson.toString()};
	          const summarizeDownloadJsonShape = ${summarizeChatgptDownloadJsonShape.toString()};
	          const selectDownloadFailure = ${selectChatgptDownloadFailure.toString()};
	          const classifyCapturedFileIdentity = ${classifyChatgptCapturedFileIdentityValues.toString()};
	          const waitForCaptureProgress = ${waitForChatgptCaptureProgress.toString()};
          const awaitDownloadPromiseWithTimeout = ${awaitChatgptDownloadPromiseWithTimeout.toString()};
          const downloadStageTimeoutMs = 10_000;
          const fetchWithTimeout = (url, init, stage) => {
            const controller = new AbortController();
            return awaitDownloadPromiseWithTimeout(
              originalFetch(url, { ...(init || {}), signal: controller.signal }),
              downloadStageTimeoutMs,
              stage,
              () => controller.abort(),
            );
          };
          const readBodyWithTimeout = (response, stage) => awaitDownloadPromiseWithTimeout(
            response.arrayBuffer(),
            downloadStageTimeoutMs,
            stage,
            () => {
              try { response.body?.cancel(); } catch {}
            },
          );
          const captureDownloadResponse = async (response, originalUrl, fileName, mimeType) => {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type');
            const bytes = new Uint8Array(await readBodyWithTimeout(clone, 'initial-body'));
            if (/application\\/json/i.test(contentType || '')) {
              let json = null;
              try {
                const text = new TextDecoder().decode(bytes);
                json = JSON.parse(text);
              } catch {
                json = null;
              }
              const downloadUrl = resolveDownloadUrlFromJson(json, window.location.href);
              if (!downloadUrl) {
                return {
                  ok: false,
                  status: response.status,
                  reason: 'json_missing_download_url',
                  endpointKind: endpointKind(originalUrl),
                  contentType,
                  providerError: providerErrorShape(json),
                  responseShape: summarizeDownloadJsonShape(json),
                };
              }
              const followResponse = await fetchWithTimeout(
                downloadUrl,
                { credentials: 'include' },
                'signed-follow-fetch',
              );
              const followClone = followResponse.clone();
              const followBytes = new Uint8Array(
                await readBodyWithTimeout(followClone, 'signed-follow-body'),
              );
              return {
                ok: followResponse.ok,
                status: followResponse.status,
                url: downloadUrl,
                contentType: followResponse.headers.get('content-type'),
                contentDisposition: followResponse.headers.get('content-disposition'),
                byteLength: followBytes.length,
                base64: encodeBytes(followBytes),
                providerFileId: targetProviderFileId,
                fileName: fileName || targetName || null,
                mimeType: mimeType || null,
              };
            }
            return {
              ok: response.ok,
              status: response.status,
              url: String(originalUrl || ''),
              contentType,
              contentDisposition: response.headers.get('content-disposition'),
              byteLength: bytes.length,
              base64: encodeBytes(bytes),
              providerFileId: targetProviderFileId,
              fileName: fileName || targetName || null,
              mimeType: mimeType || null,
            };
          };
          const tryDirectProviderFileDownload = async (fileName, mimeType) => {
            if (!targetProviderFileId) return { attempted: false };
            const directUrl = '/backend-api/files/download/' + encodeURIComponent(targetProviderFileId) + '?inline=true';
            try {
              const response = await fetchWithTimeout(
                directUrl,
                { credentials: 'include' },
                'direct-fetch',
              );
              const value = await captureDownloadResponse(response, directUrl, fileName, mimeType);
              if (value) return { attempted: true, value };
              return { attempted: true, reason: 'direct_download_json_missing_url', status: response.status };
            } catch (error) {
              return {
                attempted: true,
                reason: error && typeof error === 'object' && 'message' in error ? error.message : String(error),
              };
            }
          };
          const readReactFileTileMetadata = (tile) => {
            const reactKey = Object.getOwnPropertyNames(tile)
              .find((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
            let fiber = reactKey ? tile[reactKey] : null;
            for (let depth = 0; fiber && depth < 8; depth += 1) {
              const candidates = [fiber.memoizedProps, fiber.pendingProps].filter(Boolean);
              for (const props of candidates) {
                if (!props || typeof props !== 'object') continue;
                const providerFileId = normalize(props.fileId || props.file_id || '');
                const fileName = normalize(props.file || props.fileName || props.name || '');
                if (providerFileId || fileName) {
                  return {
                    providerFileId: providerFileId || null,
                    fileName: fileName || null,
                    mimeType: normalize(props.mimeType || props.mime_type || '') || null,
                  };
                }
              }
              fiber = fiber.return;
            }
            return null;
          };
          const fileTiles = () => Array.from(
            document.querySelectorAll(${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} [role="group"][aria-label]`)})
          ).map((tile) => ({ tile, metadata: readReactFileTileMetadata(tile) }));
          const findMatch = () => fileTiles().find(({ tile, metadata }) => {
            const aria = normalize(tile.getAttribute('aria-label'));
            if (targetProviderFileId && metadata?.providerFileId === targetProviderFileId) return true;
            return Boolean(targetName && (aria === targetName || metadata?.fileName === targetName));
          });
          let match = findMatch();
          if (!match) {
            const positions = [0, Math.floor(document.documentElement.scrollHeight * 0.25), Math.floor(document.documentElement.scrollHeight * 0.5), Math.floor(document.documentElement.scrollHeight * 0.75), document.documentElement.scrollHeight];
            for (const position of positions) {
              window.scrollTo({ top: position, behavior: 'instant' });
              await sleep(500);
              match = findMatch();
              if (match) break;
            }
          }
	          if (!match) {
	            const direct = await tryDirectProviderFileDownload(targetName || null, null);
	            if (direct.value?.ok) return { ok: true, ...direct.value, captureTransport: 'direct' };
	            return {
              ok: false,
              reason: direct.value?.reason || direct.reason || 'tile_not_found',
              tileMatched: false,
              fallbackAttempted: direct.attempted === true,
              status: direct.value?.status || direct.status || null,
              endpointKind: direct.value?.endpointKind || null,
              contentType: direct.value?.contentType || null,
              providerError: direct.value?.providerError || null,
              responseShape: direct.value?.responseShape || null,
            };
          }
	          const target = match.tile.querySelector('button[aria-label], button, [role="button"]');
	          if (!target || typeof target.click !== 'function') {
	            return { ok: false, reason: 'tile_button_not_found' };
	          }
	          const isVisible = (node) => {
	            if (!(node instanceof Element)) return false;
	            const rect = node.getBoundingClientRect();
	            if (rect.width <= 0 || rect.height <= 0) return false;
	            const style = node.ownerDocument.defaultView?.getComputedStyle(node);
	            return !style || (style.display !== 'none' && style.visibility !== 'hidden');
	          };
	          const previewName = normalize(match.tile.getAttribute('aria-label')) ||
	            normalize(match.metadata?.fileName || targetName || '');
	          const matchingPreviewSurfaces = () => Array.from(
	            document.querySelectorAll('section[data-testid="screen-threadFlyOut"][aria-label]')
	          ).filter((node) =>
	            isVisible(node) && normalize(node.getAttribute('aria-label')) === previewName
	          );
	          let previewSurfaceCount = 0;
	          let previewDownloadControlCount = 0;
	          let previewScopedDownloadControlTotalCount = 0;
	          let globalDownloadControlCount = 0;
	          let globalVisibleDownloadControlCount = 0;
	          let previewObservationCount = 0;
	          let previewIdentityMatched = false;
	          const previewIdentityPresentBeforeTileClick = previewName
	            ? matchingPreviewSurfaces().length > 0
	            : false;
	          const clickViewerDownload = () => {
	            if (!previewName) return false;
	            previewObservationCount += 1;
	            const globalControls = Array.from(
	              document.querySelectorAll('button[aria-label="Download"]')
	            );
	            globalDownloadControlCount = globalControls.length;
	            globalVisibleDownloadControlCount = globalControls.filter((node) => isVisible(node)).length;
	            const previewSurfaces = matchingPreviewSurfaces();
	            previewSurfaceCount = previewSurfaces.length;
	            previewScopedDownloadControlTotalCount = 0;
	            previewDownloadControlCount = 0;
	            if (previewSurfaces.length !== 1) return false;
	            previewIdentityMatched = true;
	            const previewSurface = previewSurfaces[0];
	            const scopedControls = Array.from(
	              previewSurface.querySelectorAll('button[aria-label="Download"]')
	            );
	            previewScopedDownloadControlTotalCount = scopedControls.length;
	            const controls = scopedControls.filter((node) => isVisible(node));
	            previewDownloadControlCount = controls.length;
	            if (controls.length !== 1) return false;
	            const download = controls[0];
	            if (!download || typeof download.click !== 'function') return false;
	            download.click();
	            return true;
	          };
	          let captured = null;
	          let captureError = null;
	          let capturedNavigationUrl = null;
	          let viewerDownloadClicked = false;
	          const capturePromises = [];
	          const matchesTargetUrl = (url) => {
	            const text = String(url || '');
	            if (/\\/backend-api\\/files\\/[^/]+\\/simple\\b/.test(text)) return false;
	            const isSignedContent = /\\/backend-api\\/estuary\\/content/.test(text);
	            const isProviderFileDownload = /\\/backend-api\\/files\\/download\\//.test(text);
	            if (!isSignedContent && !isProviderFileDownload) return false;
	            if (isSignedContent) return true;
	            return !targetProviderFileId || text.includes(targetProviderFileId);
	          };
	          const recordCaptureCandidate = (candidate, captureTransport) => {
	            const next = { ...candidate, captureTransport };
	            const identity = candidate.ok ? classifyCapturedFileIdentity({
	              capturedUrl: typeof candidate.url === 'string' ? candidate.url : null,
	              contentDisposition: typeof candidate.contentDisposition === 'string'
	                ? candidate.contentDisposition
	                : null,
	              targetProviderFileId,
	              targetName,
	            }) : null;
	            if (candidate.ok && !identity?.failure) {
	              captured = next;
	              return;
	            }
	            captureError = selectDownloadFailure(
	              captureError,
	              identity?.failure
	                ? { ...next, ok: false, reason: identity.failure, identityDecision: identity.decision }
	                : next,
	            );
	          };
	          const originalAnchorClick = HTMLAnchorElement.prototype.click;
	          const originalWindowOpen = window.open;
	          HTMLAnchorElement.prototype.click = function(...args) {
	            const href = this.href || '';
	            if (matchesTargetUrl(href)) {
	              capturedNavigationUrl = href;
	              return;
	            }
	            return originalAnchorClick.apply(this, args);
	          };
	          window.open = function(url, target, features) {
	            if (matchesTargetUrl(url)) {
	              capturedNavigationUrl = String(url || '');
	              return null;
	            }
	            return originalWindowOpen.call(this, url, target, features);
	          };
	          window.fetch = (...args) => {
	            const input = args[0];
	            const url = typeof input === 'string' ? input : input?.url;
            const responsePromise = originalFetch(...args);
            if (matchesTargetUrl(url)) {
	              capturePromises.push(responsePromise.then(async (response) => {
	                if (captured) return;
	                const originalUrl = String(url || '');
	                if (/\\/backend-api\\/files\\/[^/]+\\/simple\\b/.test(originalUrl)) return;
	                const candidate = await captureDownloadResponse(
	                    response,
	                    originalUrl,
	                    match.metadata?.fileName || targetName || null,
	                    match.metadata?.mimeType || null,
	                  );
	                recordCaptureCandidate(candidate, 'fetch');
              }).catch((error) => {
                const failure = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
                captureError = selectDownloadFailure(captureError, failure);
              }));
            }
            return responsePromise;
          };
	          try {
	            target.click();
	            const captureStartedAt = Date.now();
	            const deadline = Date.now() + 20_000;
	            while (!captured && Date.now() < deadline) {
	              await waitForCaptureProgress(capturePromises, deadline - Date.now(), 250);
	              if (captured) break;
	              if (capturedNavigationUrl) {
	                const navigationUrl = capturedNavigationUrl;
	                capturedNavigationUrl = null;
	                try {
	                  const response = await fetchWithTimeout(
	                    navigationUrl,
	                    { credentials: 'include' },
	                    'anchor-fetch',
	                  );
	                  const candidate = await captureDownloadResponse(
	                      response,
	                      navigationUrl,
	                      match.metadata?.fileName || targetName || null,
	                      match.metadata?.mimeType || null,
	                    );
	                  recordCaptureCandidate(candidate, 'anchor');
	                } catch (error) {
	                  const failure = error && typeof error === 'object' && 'message' in error
	                    ? error.message
	                    : String(error);
	                  captureError = selectDownloadFailure(captureError, failure);
	                }
	                if (captured) break;
	              }
	              if (!viewerDownloadClicked && Date.now() - captureStartedAt >= 750) {
	                viewerDownloadClicked = clickViewerDownload();
	              }
	            }
            if (!captured) {
	              const direct = await tryDirectProviderFileDownload(
	                match.metadata?.fileName || targetName || null,
	                match.metadata?.mimeType || null,
	              );
	              if (direct.value?.ok) {
	                recordCaptureCandidate(direct.value, 'direct');
	              } else if (direct.value) {
	                captureError = selectDownloadFailure(captureError, direct.value);
              } else if (direct.attempted && direct.reason) {
                captureError = selectDownloadFailure(captureError, direct.reason);
              }
            }
	          } finally {
	            window.fetch = originalFetch;
	            HTMLAnchorElement.prototype.click = originalAnchorClick;
	            window.open = originalWindowOpen;
	            for (const button of Array.from(document.querySelectorAll('[role="dialog"] button[aria-label="Close"], button[aria-label="Close"]'))) {
	              try { button.click(); } catch {}
	            }
          }
          if (!captured) {
            const captureFailure = captureError && typeof captureError === 'object'
              ? captureError
              : null;
            return {
              ok: false,
              reason: captureFailure?.reason || captureError || 'download_response_not_captured',
              tileMatched: true,
              fallbackAttempted: true,
              status: captureFailure?.status || null,
              endpointKind: captureFailure?.endpointKind || null,
              contentType: captureFailure?.contentType || null,
              captureTransport: captureFailure?.captureTransport || null,
              providerError: captureFailure?.providerError || null,
              responseShape: captureFailure?.responseShape || null,
              viewerDownloadClicked,
              previewIdentityMatched,
	              previewIdentityPresentBeforeTileClick,
              previewSurfaceCount,
	              previewObservationCount,
              previewDownloadControlCount,
	              previewScopedDownloadControlTotalCount,
	              globalDownloadControlCount,
	              globalVisibleDownloadControlCount,
            };
          }
          if (!captured.ok) {
            return {
              ok: false,
              reason: captured.reason || 'download_response_not_ok',
              tileMatched: true,
              fallbackAttempted: false,
              status: captured.status,
              endpointKind: captured.endpointKind || null,
              contentType: captured.contentType || null,
              providerError: captured.providerError || null,
              responseShape: captured.responseShape || null,
            };
          }
          if (!captured.base64 || captured.byteLength <= 0) {
            return {
              ok: false,
              reason: 'download_response_empty',
              tileMatched: true,
              status: captured.status,
              endpointKind: endpointKind(captured.url),
              contentType: captured.contentType || null,
            };
          }
	          return {
	            ok: true,
	            ...captured,
	            viewerDownloadClicked,
	            previewIdentityMatched,
	            previewIdentityPresentBeforeTileClick,
	            previewSurfaceCount,
	            previewObservationCount,
	            previewDownloadControlCount,
	            previewScopedDownloadControlTotalCount,
	            globalDownloadControlCount,
	            globalVisibleDownloadControlCount,
	          };
        })()`,
			awaitPromise: true,
			returnByValue: true,
		});
		let value = isRecord(result.result?.value) ? result.result.value : null;
		if ((!value || value.ok !== true) && value?.viewerDownloadClicked === true) {
			const downloadedPath = await waitForSingleChatgptDownloadedFile(browserDownloadDir, 5_000);
			if (downloadedPath) {
				const downloadedName = path.basename(downloadedPath);
				const nativeIdentityDecision = targetName
					? classifyChatgptFileNameIdentity(downloadedName, targetName)
					: null;
				if (nativeIdentityDecision) {
					recordBrowserScrapeProviderAction(
						options,
						`chatgpt.downloadConversationFile.nativeIdentity.${nativeIdentityDecision}.v1`,
					);
				}
				if (
					nativeIdentityDecision === "extensionMismatch" ||
					nativeIdentityDecision === "stemMismatch"
				) {
					throw new Error(
						`ChatGPT conversation file fetch failed: captured_asset_identity_mismatch: requested=${targetName} response=${downloadedName}`,
					);
				}
				const bytes = await fs.readFile(downloadedPath);
				if (bytes.byteLength > 0) {
					value = {
						ok: true,
						status: 200,
						url: "",
						contentDisposition: targetName
							? `attachment; filename="${targetName.replaceAll('"', "")}"`
							: null,
						byteLength: bytes.byteLength,
						base64: bytes.toString("base64"),
						providerFileId: targetProviderFileId,
						fileName: downloadedName,
						mimeType: file?.mimeType ?? null,
						captureTransport: "browser-download",
						viewerDownloadClicked: true,
						previewIdentityMatched: value?.previewIdentityMatched === true,
						previewSurfaceCount: value?.previewSurfaceCount,
						previewDownloadControlCount: value?.previewDownloadControlCount,
					};
				}
			}
		}
		if (!value || value.ok !== true || typeof value.base64 !== "string") {
			recordBrowserScrapeDownloadFailure(options);
			const diagnostics = {
				reason: typeof value?.reason === "string" ? value.reason : "unknown",
				...(typeof value?.tileMatched === "boolean" ? { tileMatched: value.tileMatched } : {}),
				...(typeof value?.fallbackAttempted === "boolean"
					? { fallbackAttempted: value.fallbackAttempted }
					: {}),
				...(typeof value?.status === "number" ? { status: value.status } : {}),
				...(typeof value?.endpointKind === "string" ? { endpointKind: value.endpointKind } : {}),
				...(typeof value?.contentType === "string" ? { contentType: value.contentType } : {}),
				...(typeof value?.captureTransport === "string"
					? { captureTransport: value.captureTransport }
					: {}),
				...(isRecord(value?.providerError) ? { providerError: value.providerError } : {}),
				...(isRecord(value?.responseShape) ? { responseShape: value.responseShape } : {}),
				...(typeof value?.previewIdentityMatched === "boolean"
					? { previewIdentityMatched: value.previewIdentityMatched }
					: {}),
				...(typeof value?.previewSurfaceCount === "number"
					? { previewSurfaceCount: value.previewSurfaceCount }
					: {}),
				...(typeof value?.previewDownloadControlCount === "number"
					? { previewDownloadControlCount: value.previewDownloadControlCount }
					: {}),
				...(typeof value?.previewIdentityPresentBeforeTileClick === "boolean"
					? {
							previewIdentityPresentBeforeTileClick: value.previewIdentityPresentBeforeTileClick,
						}
					: {}),
				...(typeof value?.previewObservationCount === "number"
					? { previewObservationCount: value.previewObservationCount }
					: {}),
				...(typeof value?.previewScopedDownloadControlTotalCount === "number"
					? {
							previewScopedDownloadControlTotalCount: value.previewScopedDownloadControlTotalCount,
						}
					: {}),
				...(typeof value?.globalDownloadControlCount === "number"
					? { globalDownloadControlCount: value.globalDownloadControlCount }
					: {}),
				...(typeof value?.globalVisibleDownloadControlCount === "number"
					? { globalVisibleDownloadControlCount: value.globalVisibleDownloadControlCount }
					: {}),
			};
			const error = new Error(
				`ChatGPT conversation file fetch failed: ${JSON.stringify(diagnostics)}`,
			) as Error & { retrievalDiagnostics: Record<string, unknown> };
			error.retrievalDiagnostics = diagnostics;
			throw error;
		}
		const capturedIdentity = classifyChatgptCapturedFileIdentity({
			captured: value,
			targetProviderFileId,
			targetName,
		});
		if (capturedIdentity.decision) {
			recordBrowserScrapeProviderAction(
				options,
				`chatgpt.downloadConversationFile.capturedIdentity.${capturedIdentity.decision}.v1`,
			);
		}
		if (capturedIdentity.failure) {
			recordBrowserScrapeDownloadFailure(options);
			throw new Error(`ChatGPT conversation file fetch failed: ${capturedIdentity.failure}`);
		}
		if (
			value.captureTransport === "anchor" ||
			value.captureTransport === "fetch" ||
			value.captureTransport === "direct" ||
			value.captureTransport === "browser-download"
		) {
			recordBrowserScrapeProviderAction(
				options,
				`chatgpt.downloadConversationFile.capture.${value.captureTransport}`,
			);
		}
		if (value.viewerDownloadClicked === true) {
			recordBrowserScrapeProviderAction(options, "chatgpt.downloadConversationFile.viewerDownload");
		}
		if (value.previewIdentityMatched === true) {
			recordBrowserScrapeProviderAction(
				options,
				"chatgpt.downloadConversationFile.preview.exactFlyout",
			);
		}
		return value;
	};
	try {
		const captured = surfacePrepared
			? await downloadFromReadySurface()
			: await withChatgptBlockingSurfaceRecovery(
					client,
					`downloadChatgptConversationFile:${conversationId}:${fileId}`,
					downloadFromReadySurface,
					{
						debugContext,
						reopen: buildChatgptConversationReopen(
							client,
							conversationId,
							normalizedProjectId,
							options,
						),
						providerOptions: options,
					},
				);
		await fs.writeFile(destPath, Buffer.from(captured.base64 as string, "base64"));
		recordBrowserScrapeDownloadSuccess(options);
	} finally {
		await fs.rm(browserDownloadDir, { recursive: true, force: true });
	}
}

async function downloadChatgptConversationFilesWithClient(
	client: ChromeClient,
	conversationId: string,
	items: BrowserProviderConversationFileDownloadInput[],
	projectId?: string | null,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
): Promise<BrowserProviderConversationFileDownloadResult[]> {
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	return await withChatgptBlockingSurfaceRecovery(
		client,
		`downloadChatgptConversationFiles:${conversationId}`,
		async () => {
			await ensureChatgptConversationSurfaceReadyForRead(
				client,
				conversationId,
				normalizedProjectId,
				options,
			);
			const results: BrowserProviderConversationFileDownloadResult[] = [];
			for (const item of items) {
				try {
					await downloadChatgptConversationFileWithClient(
						client,
						conversationId,
						item.file.id,
						item.destPath,
						normalizedProjectId,
						debugContext,
						options,
						item.file,
						true,
					);
					results.push({ fileId: item.file.id, status: "materialized" });
				} catch (error) {
					const failure = classifyChatgptFileRetrievalFailure(error);
					results.push({
						fileId: item.file.id,
						status: "error",
						error: error instanceof Error ? error.message : String(error),
						...failure,
					});
				}
			}
			return results;
		},
		{
			debugContext,
			reopen: buildChatgptConversationReopen(client, conversationId, normalizedProjectId, options),
			providerOptions: options,
		},
	);
}

export const downloadChatgptConversationFilesWithClientForTest =
	downloadChatgptConversationFilesWithClient;

async function downloadChatgptAccountLibraryFileWithClient(
	client: ChromeClient,
	fileId: string,
	destPath: string,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
	file?: FileRef,
): Promise<void> {
	const targetProviderFileId = resolveChatgptConversationProviderFileId(fileId, file);
	const targetName = normalizeUiText(file?.name);
	if (!targetProviderFileId && !targetName) {
		throw new Error(
			`ChatGPT account file ${fileId} lacks a provider file id or visible file name.`,
		);
	}
	const captured = await withChatgptBlockingSurfaceRecovery(
		client,
		`downloadChatgptAccountLibraryFile:${fileId}`,
		async () => {
			await navigateToChatgptUrl(client, CHATGPT_LIBRARY_URL, undefined, options);
			const result = await client.Runtime.evaluate({
				expression: `(async () => {
          const targetProviderFileId = ${JSON.stringify(targetProviderFileId)};
          const targetName = ${JSON.stringify(targetName)};
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const textKey = (value) => normalize(value).toLowerCase().replace(/\\s+/g, '');
          const targetNameKey = textKey(targetName || '');
          const isVisible = (node) => {
            if (!(node instanceof Element)) return false;
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const cssEscape = (value) => window.CSS?.escape
            ? CSS.escape(value)
            : String(value || '').replace(/["\\\\]/g, '\\\\$&');
          const rowContainers = (node) => {
            const containers = [];
            let current = node instanceof Element ? node : null;
            for (let depth = 0; current && depth < 10; depth += 1) {
              containers.push(current);
              current = current.parentElement;
            }
            return containers;
          };
          const meaningfulButtonText = (button) => {
            const text = normalize(button.textContent || button.getAttribute('aria-label') || '');
            if (!text || /^(more actions|open actions|select|download|copy link|share)$/i.test(text)) return '';
            return text;
          };
          const findTitleButtonInRow = (row) => {
            const buttons = Array.from(row.querySelectorAll('button')).filter(isVisible);
            return buttons.find((button) => {
              const text = meaningfulButtonText(button);
              if (!text) return false;
              if (!targetNameKey) return true;
              const candidateKey = textKey(text);
              const targetStem = targetNameKey.replace(/\\.[^.]+$/, '');
              return candidateKey === targetNameKey || (targetStem.length > 3 && candidateKey.includes(targetStem));
            }) || buttons.find((button) => meaningfulButtonText(button)) || null;
          };
          const findByProviderId = () => {
            if (!targetProviderFileId) return null;
            const selector = '[data-testid*="' + cssEscape(targetProviderFileId) + '"], [aria-label*="' + cssEscape(targetProviderFileId) + '"]';
            const anchors = Array.from(document.querySelectorAll(selector)).filter(isVisible);
            for (const anchor of anchors) {
              for (const container of rowContainers(anchor)) {
                const button = findTitleButtonInRow(container);
                if (button) return { row: container, button };
              }
            }
            return null;
          };
          const findByName = () => {
            if (!targetNameKey) return null;
            const roots = Array.from(document.querySelectorAll('[role="row"], tr, li, [data-testid*="row" i], [data-testid*="file" i], [data-testid*="card" i], [data-testid*="tile" i], div'))
              .filter((node) => isVisible(node) && textKey(node.textContent || '').includes(targetNameKey.replace(/\\.[^.]+$/, '')));
            for (const row of roots) {
              const button = findTitleButtonInRow(row);
              if (button) return { row, button };
            }
            return null;
          };
          let match = findByProviderId() || findByName();
          if (!match) {
            const positions = [0, Math.floor(document.documentElement.scrollHeight * 0.25), Math.floor(document.documentElement.scrollHeight * 0.5), Math.floor(document.documentElement.scrollHeight * 0.75), document.documentElement.scrollHeight];
            for (const position of positions) {
              window.scrollTo({ top: position, behavior: 'instant' });
              await sleep(500);
              match = findByProviderId() || findByName();
              if (match) break;
            }
          }
          if (!match) {
            return { ok: false, reason: 'library_row_not_found' };
          }
          const originalFetch = window.__auracallOriginalFileFetch || window.fetch.bind(window);
          window.__auracallOriginalFileFetch = originalFetch;
          let captured = null;
          let captureError = null;
          const capturePromises = [];
          const matchesTargetUrl = (url) => {
            const text = String(url || '');
            if (targetProviderFileId && text.includes(targetProviderFileId)) return true;
            return /\\/backend-api\\/files\\/library\\/files\\//.test(text) ||
              /\\/backend-api\\/files\\/download\\//.test(text) ||
              /\\/backend-api\\/estuary\\/content/.test(text);
          };
          const encodeBytes = (bytes) => {
            let binary = '';
            const chunkSize = 0x8000;
            for (let index = 0; index < bytes.length; index += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
            }
            return btoa(binary);
          };
          const captureDownloadResponse = async (response, originalUrl) => {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type');
            const bytes = new Uint8Array(await clone.arrayBuffer());
            if (/application\\/json/i.test(contentType || '')) {
              let json = null;
              try {
                const text = new TextDecoder().decode(bytes);
                json = JSON.parse(text);
              } catch {
                json = null;
              }
              const downloadUrl = json && typeof json === 'object' && typeof json.download_url === 'string'
                ? json.download_url
                : null;
              if (!downloadUrl) return null;
              const followResponse = await originalFetch(downloadUrl, { credentials: 'include' });
              const followClone = followResponse.clone();
              const followBytes = new Uint8Array(await followClone.arrayBuffer());
              return {
                ok: followResponse.ok,
                status: followResponse.status,
                url: downloadUrl,
                contentType: followResponse.headers.get('content-type'),
                contentDisposition: followResponse.headers.get('content-disposition'),
                byteLength: followBytes.length,
                base64: encodeBytes(followBytes),
                providerFileId: targetProviderFileId,
                fileName: targetName || null,
              };
            }
            return {
              ok: response.ok,
              status: response.status,
              url: String(originalUrl || ''),
              contentType,
              contentDisposition: response.headers.get('content-disposition'),
              byteLength: bytes.length,
              base64: encodeBytes(bytes),
              providerFileId: targetProviderFileId,
              fileName: targetName || null,
            };
          };
          const tryDirectProviderFileDownload = async () => {
            if (!targetProviderFileId) return { attempted: false };
            const directUrl = '/backend-api/files/download/' + encodeURIComponent(targetProviderFileId) + '?inline=true';
            try {
              const response = await originalFetch(directUrl, { credentials: 'include' });
              const value = await captureDownloadResponse(response, directUrl);
              if (value) return { attempted: true, value };
              return { attempted: true, reason: 'direct_download_json_missing_url', status: response.status };
            } catch (error) {
              return {
                attempted: true,
                reason: error && typeof error === 'object' && 'message' in error ? error.message : String(error),
              };
            }
          };
          window.fetch = (...args) => {
            const input = args[0];
            const url = typeof input === 'string' ? input : input?.url;
            const responsePromise = originalFetch(...args);
            if (matchesTargetUrl(url)) {
              capturePromises.push(responsePromise.then(async (response) => {
                if (captured) return;
                const originalUrl = String(url || '');
                captured = await captureDownloadResponse(response, originalUrl);
              }).catch((error) => {
                captureError = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
              }));
            }
            return responsePromise;
          };
          const clickLibraryDownloadAction = async () => {
            const menuItemText = (node) => normalize(node.textContent || node.getAttribute?.('aria-label') || '');
            const visibleMenuItems = () => Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button'))
              .filter(isVisible)
              .filter((node) => /^download$/i.test(menuItemText(node)));
            const directDownload = Array.from(match.row.querySelectorAll('button, [role="menuitem"]'))
              .filter(isVisible)
              .find((node) => /^download$/i.test(menuItemText(node)));
            if (directDownload) {
              directDownload.click();
              return true;
            }
            const rowButtons = Array.from(match.row.querySelectorAll('button')).filter(isVisible);
            const menuButton = rowButtons.find((button) => {
              const label = normalize(button.getAttribute('aria-label') || button.textContent || '');
              return /^(more actions|open actions|actions|options|menu)$/i.test(label);
            }) || rowButtons.find((button) => button !== match.button && normalize(button.textContent || '') === '');
            if (!menuButton || menuButton === match.button) return false;
            menuButton.click();
            const deadline = Date.now() + 3_000;
            while (Date.now() < deadline) {
              const downloadItem = visibleMenuItems()[0];
              if (downloadItem) {
                downloadItem.click();
                return true;
              }
              await sleep(100);
            }
            return false;
          };
          try {
            const direct = await tryDirectProviderFileDownload();
            if (direct.value) {
              captured = direct.value;
            }
            if (!captured) {
              const clickedDownload = await clickLibraryDownloadAction();
              if (!clickedDownload) match.button.click();
              if (direct.attempted && direct.reason) {
                captureError = 'direct_download_failed:' + direct.reason + (direct.status ? ':status_' + direct.status : '');
              }
            }
            const deadline = Date.now() + 20_000;
            while (!captured && Date.now() < deadline) {
              await Promise.allSettled(capturePromises);
              if (captured) break;
              await sleep(250);
            }
          } finally {
            window.fetch = originalFetch;
            for (const button of Array.from(document.querySelectorAll('[role="dialog"] button[aria-label="Close"], button[aria-label="Close"]'))) {
              try { button.click(); } catch {}
            }
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
          if (!captured) {
            return { ok: false, reason: captureError || 'download_response_not_captured' };
          }
          if (!captured.ok) {
            return { ok: false, reason: 'download_response_not_ok', status: captured.status, url: captured.url };
          }
          if (!captured.base64 || captured.byteLength <= 0) {
            return { ok: false, reason: 'download_response_empty', status: captured.status, url: captured.url };
          }
          return { ok: true, ...captured };
        })()`,
				awaitPromise: true,
				returnByValue: true,
			});
			const value = isRecord(result.result?.value) ? result.result.value : null;
			if (!value || value.ok !== true || typeof value.base64 !== "string") {
				const reason = typeof value?.reason === "string" ? value.reason : "unknown";
				const status = typeof value?.status === "number" ? ` (status ${value.status})` : "";
				throw new Error(`ChatGPT account library file fetch failed: ${reason}${status}`);
			}
			return value;
		},
		{
			debugContext,
			reopen: async () => {
				await navigateToChatgptUrl(client, CHATGPT_LIBRARY_URL, undefined, options);
				return {
					action: "reopen-list",
					outcome: "attempted",
					summary: "library",
				};
			},
			providerOptions: options,
		},
	);
	await fs.writeFile(destPath, Buffer.from(captured.base64 as string, "base64"));
}

async function downloadChatgptProjectFileWithClient(
	client: ChromeClient,
	projectId: string,
	fileId: string,
	destPath: string,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
): Promise<void> {
	const targetProviderFileId = normalizeUiText(fileId).match(/\bfile_[A-Za-z0-9_]+\b/)?.[0] ?? null;
	if (!targetProviderFileId) {
		throw new Error("ChatGPT project source lacks a provider file id.");
	}
	const captured = await withChatgptBlockingSurfaceRecovery(
		client,
		`downloadChatgptProjectFile:${projectId}:${targetProviderFileId}`,
		async () => {
			await openProjectSourcesTab(client, projectId);
			const result = await client.Runtime.evaluate({
				expression: `(async () => {
          const targetProviderFileId = ${JSON.stringify(targetProviderFileId)};
          const originalFetch = window.__auracallOriginalFileFetch || window.fetch.bind(window);
          window.__auracallOriginalFileFetch = originalFetch;
          const encodeBytes = (bytes) => {
            let binary = '';
            const chunkSize = 0x8000;
            for (let index = 0; index < bytes.length; index += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
            }
            return btoa(binary);
          };
          const captureDownloadResponse = async (response, originalUrl) => {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type');
            const bytes = new Uint8Array(await clone.arrayBuffer());
            if (/application\\/json/i.test(contentType || '')) {
              let json = null;
              try {
                json = JSON.parse(new TextDecoder().decode(bytes));
              } catch {
                json = null;
              }
              const downloadUrl = json && typeof json === 'object' && typeof json.download_url === 'string'
                ? json.download_url
                : null;
              if (!downloadUrl) return null;
              const followResponse = await originalFetch(downloadUrl, { credentials: 'include' });
              const followClone = followResponse.clone();
              const followBytes = new Uint8Array(await followClone.arrayBuffer());
              return {
                ok: followResponse.ok,
                status: followResponse.status,
                url: downloadUrl,
                contentType: followResponse.headers.get('content-type'),
                contentDisposition: followResponse.headers.get('content-disposition'),
                byteLength: followBytes.length,
                base64: encodeBytes(followBytes),
                providerFileId: targetProviderFileId,
              };
            }
            return {
              ok: response.ok,
              status: response.status,
              url: String(originalUrl || ''),
              contentType,
              contentDisposition: response.headers.get('content-disposition'),
              byteLength: bytes.length,
              base64: encodeBytes(bytes),
              providerFileId: targetProviderFileId,
            };
          };
          const directUrl = '/backend-api/files/download/' + encodeURIComponent(targetProviderFileId) + '?inline=true';
          const response = await originalFetch(directUrl, { credentials: 'include' });
          const captured = await captureDownloadResponse(response, directUrl);
          if (!captured) {
            return { ok: false, reason: 'direct_download_json_missing_url', status: response.status };
          }
          if (!captured.ok) {
            return { ok: false, reason: 'download_response_not_ok', status: captured.status, url: captured.url };
          }
          if (!captured.base64 || captured.byteLength <= 0) {
            return { ok: false, reason: 'download_response_empty', status: captured.status, url: captured.url };
          }
          return { ok: true, ...captured };
        })()`,
				awaitPromise: true,
				returnByValue: true,
			});
			const value = isRecord(result.result?.value) ? result.result.value : null;
			if (!value || value.ok !== true || typeof value.base64 !== "string") {
				const reason = typeof value?.reason === "string" ? value.reason : "unknown";
				const status = typeof value?.status === "number" ? ` (status ${value.status})` : "";
				throw new Error(`ChatGPT project source file fetch failed: ${reason}${status}`);
			}
			return value;
		},
		{
			debugContext,
			reopen: async () => {
				await navigateToChatgptUrl(client, resolveChatgptProjectSourcesUrl(projectId));
				await openProjectSourcesTab(client, projectId);
				return {
					action: "reopen-list",
					outcome: "attempted",
					summary: projectId,
				};
			},
			providerOptions: options,
		},
	);
	await fs.writeFile(destPath, Buffer.from(captured.base64 as string, "base64"));
}

async function configureChatgptDownloadBehaviorWithClient(
	client: ChromeClient,
	downloadPath: string,
	options?: BrowserProviderListOptions,
): Promise<void> {
	const cdpClient = client as unknown as {
		send?: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
	};
	if (typeof cdpClient.send !== "function") {
		return;
	}
	try {
		recordBrowserScrapeCdpCall(options, "Browser.setDownloadBehavior");
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
		recordBrowserScrapeCdpCall(options, "Page.setDownloadBehavior");
		await cdpClient.send("Page.setDownloadBehavior", {
			behavior: "allow",
			downloadPath,
		});
	} catch {
		// Leave downloads unconfigured if the target does not support either method.
	}
}

async function dispatchChatgptArtifactPointerInput(
	client: ChromeClient,
	point: { x: number; y: number },
	options?: BrowserProviderListOptions,
): Promise<void> {
	recordBrowserScrapeCdpCall(options, "Input.dispatchMouseEvent");
	await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: point.x, y: point.y });
	recordBrowserScrapeCdpCall(options, "Input.dispatchMouseEvent");
	await client.Input.dispatchMouseEvent({
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	recordBrowserScrapeCdpCall(options, "Input.dispatchMouseEvent");
	await client.Input.dispatchMouseEvent({
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
}

async function clickTaggedChatgptDownloadControlWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<boolean> {
	recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
	const result = await client.Runtime.evaluate({
		expression: `(() => {
      const target = document.querySelector(${JSON.stringify(`[${CHATGPT_DOWNLOAD_BUTTON_ATTR}="true"]`)});
      if (!(target instanceof HTMLElement)) {
        return { ok: false, reason: 'Download target missing before click' };
      }
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: 'Download target is not visible before click' };
      }
      return {
        ok: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`,
		returnByValue: true,
	});
	const point = isRecord(result.result?.value) ? result.result.value : null;
	if (point?.ok !== true || typeof point.x !== "number" || typeof point.y !== "number") {
		return false;
	}
	await dispatchChatgptArtifactPointerInput(client, { x: point.x, y: point.y }, options);
	return true;
}

export const clickTaggedChatgptDownloadControlWithClientForTest =
	clickTaggedChatgptDownloadControlWithClient;

async function tagChatgptArtifactButtonWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
	options?: {
		spreadsheetCard?: boolean;
	},
): Promise<boolean> {
	const controlExpectation = buildChatgptArtifactControlExpectation(artifact);
	const turnId =
		artifact.metadata && typeof artifact.metadata.turnId === "string"
			? artifact.metadata.turnId.trim()
			: null;
	const spreadsheetCard = Boolean(options?.spreadsheetCard);
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const result = await client.Runtime.evaluate({
			expression: `(() => {
        const attr = ${JSON.stringify(CHATGPT_DOWNLOAD_BUTTON_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const artifactTitle = (node) => {
          const ariaLabel = normalize(node.getAttribute('aria-label') || '');
          const previewMatch = ariaLabel.match(/^Open preview of\\s+(.+)$/i);
          const downloadMatch = ariaLabel.match(/^Download\\s+(.+)$/i);
          return normalize(previewMatch?.[1] || downloadMatch?.[1] || node.textContent || ariaLabel || '').toLowerCase();
        };
        document.querySelectorAll('[' + attr + ']').forEach((node) => node.removeAttribute(attr));
        const expectedTitle = normalize(${JSON.stringify(artifact.title)}).toLowerCase();
        const expectedMessageId = normalize(${JSON.stringify(artifact.messageId ?? null)});
        const expectedTurnId = normalize(${JSON.stringify(turnId)});
        const expectedMessageIndex = ${JSON.stringify(
					typeof artifact.messageIndex === "number" ? artifact.messageIndex : null,
				)};
        const spreadsheetCard = ${JSON.stringify(spreadsheetCard)};
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
            return {
              section,
              messageIndex,
              role: normalize(
                roleNode?.getAttribute('data-message-author-role') ||
	            roleNode?.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
	            roleNode?.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-content-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1) ||
                section.getAttribute('data-message-author-role') ||
                section.getAttribute('data-turn') ||
                '',
              ),
              messageId: normalize(roleNode?.getAttribute('data-message-id') || section.getAttribute('data-message-id') || ''),
              turnId: normalize(section.getAttribute('data-turn-id') || ''),
            };
          })
          .filter((entry) => entry.role === 'assistant');
        const resolveButtons = (root) => {
          if (!spreadsheetCard) {
            const buttons = Array.from(root.section.querySelectorAll(${JSON.stringify(CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR)}))
              .filter((node) => isVisible(node) && !node.closest(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
              .map((node, buttonIndex) => ({
                node,
                turnId: root.turnId,
                messageId: root.messageId,
                messageIndex: root.messageIndex,
                buttonIndex,
                title: artifactTitle(node) || normalize(node.getAttribute('download') || '').toLowerCase(),
                href: '',
              }));
            const anchors = Array.from(root.section.querySelectorAll('a[href]'))
              .filter((node) => isVisible(node) && !node.closest(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
              .map((node) => ({
                node,
                turnId: root.turnId,
                messageId: root.messageId,
                messageIndex: root.messageIndex,
                buttonIndex: null,
                title: normalize(node.textContent || node.getAttribute('aria-label') || node.getAttribute('download') || '').toLowerCase(),
                href: normalize(node instanceof HTMLAnchorElement ? node.href : node.getAttribute('href') || '').toLowerCase(),
              }));
            return [...buttons, ...anchors];
          }
          const cards = Array.from(root.section.querySelectorAll('div.group.my-4'))
            .map((card) => ({
              card,
              text: normalize(card.textContent || '').toLowerCase(),
            }))
            .filter((entry) => entry.text && entry.text.includes(expectedTitle));
          const card =
            cards[0]?.card ||
            (expectedTitle
              ? null
              : Array.from(root.section.querySelectorAll('div.group.my-4'))[0] || null);
          if (!(card instanceof HTMLElement)) {
            return [];
          }
          return Array.from(card.querySelectorAll('button'))
            .filter((button) => isVisible(button))
            .slice(0, 2)
            .map((button, index) => ({
              node: button,
              turnId: root.turnId,
              messageId: root.messageId,
              messageIndex: root.messageIndex,
              buttonIndex: index,
              title: expectedTitle,
              href: '',
            }));
        };
        const scopedRoot =
          (expectedTurnId && roots.find((root) => root.turnId === expectedTurnId)) ||
          (expectedMessageId && roots.find((root) => root.messageId === expectedMessageId || root.turnId === expectedMessageId)) ||
          (typeof expectedMessageIndex === 'number' ? roots.find((root) => root.messageIndex === expectedMessageIndex) : null) ||
          null;
        const candidates = scopedRoot ? resolveButtons(scopedRoot) : roots.flatMap(resolveButtons);
        const resolveCandidate = (${resolveChatgptArtifactControlCandidate.toString()});
        const chosen = resolveCandidate(${JSON.stringify(controlExpectation)}, candidates);
        if (!chosen?.node) {
          return { ok: false };
        }
        chosen.node.setAttribute(attr, 'true');
        return { ok: true };
      })()`,
			returnByValue: true,
		});
		if (isRecord(result.result?.value) && result.result.value.ok === true) {
			return true;
		}
		await sleep(250);
	}
	return false;
}

async function tagChatgptDownloadButtonWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
): Promise<boolean> {
	return await tagChatgptArtifactButtonWithClient(client, artifact);
}

async function tagChatgptSpreadsheetCardDownloadButtonWithClient(
	client: ChromeClient,
	artifact: ConversationArtifact,
): Promise<boolean> {
	return await tagChatgptArtifactButtonWithClient(client, artifact, { spreadsheetCard: true });
}

async function clickChatgptViewerDownloadButtonWithClient(
	client: ChromeClient,
	options?: BrowserProviderListOptions,
): Promise<boolean> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		recordBrowserScrapeCdpCall(options, "Runtime.evaluate");
		const result = await client.Runtime.evaluate({
			expression: `(() => {
        const taggedAttr = ${JSON.stringify(CHATGPT_DOWNLOAD_BUTTON_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = node.ownerDocument.defaultView?.getComputedStyle(node);
          return !style || (style.display !== 'none' && style.visibility !== 'hidden');
        };
        const labelFor = (node) => normalize(
          node.getAttribute('aria-label') ||
          node.getAttribute('title') ||
          node.textContent ||
          '',
        );
        const controls = Array.from(document.querySelectorAll('button, [role="button"], a'))
          .filter((node) => isVisible(node) && node.getAttribute(taggedAttr) !== 'true' &&
            !node.closest?.(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
          .map((node) => ({ node, label: labelFor(node) }));
        const download = controls.find((entry) => /^Download(?: file)?$/i.test(entry.label));
        if (!(download?.node instanceof HTMLElement)) {
          return { ok: false, labels: controls.map((entry) => entry.label).filter(Boolean).slice(0, 20) };
        }
        download.node.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = download.node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return { ok: false };
        return { ok: true, label: download.label, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
			returnByValue: true,
		});
		if (
			isRecord(result.result?.value) &&
			result.result.value.ok === true &&
			typeof result.result.value.x === "number" &&
			typeof result.result.value.y === "number"
		) {
			await dispatchChatgptArtifactPointerInput(
				client,
				{ x: result.result.value.x, y: result.result.value.y },
				options,
			);
			recordBrowserScrapeProviderAction(options, "chatgpt.clickArtifactViewerDownload");
			const matchedLabel = normalizeUiText(
				typeof result.result.value.label === "string" ? result.result.value.label : null,
			);
			recordBrowserScrapeProviderAction(
				options,
				matchedLabel.toLowerCase() === "download file"
					? "chatgpt.clickArtifactViewerDownload.currentFileLabel.v1"
					: "chatgpt.clickArtifactViewerDownload.legacyLabel.v1",
			);
			return true;
		}
		await sleep(250);
	}
	return false;
}

type ChatgptDownloadDirectorySnapshot = ReadonlyMap<string, string>;

function chatgptDownloadStatFingerprint(stat: {
	size: number;
	mtimeMs: number;
	ctimeMs?: number;
	ino?: number;
}): string {
	return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs ?? ""}:${stat.ino ?? ""}`;
}

async function snapshotChatgptDownloadDirectory(destDir: string): Promise<Map<string, string>> {
	const snapshot = new Map<string, string>();
	const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (!entry.isFile() || entry.name.endsWith(".crdownload") || entry.name.endsWith(".tmp")) {
			continue;
		}
		const stat = await fs.stat(path.join(destDir, entry.name)).catch(() => null);
		if (stat) snapshot.set(entry.name, chatgptDownloadStatFingerprint(stat));
	}
	return snapshot;
}

async function waitForFreshChatgptDownloadedFile(
	destDir: string,
	expectedExtension: ".docx" | ".pdf",
	baseline: ChatgptDownloadDirectorySnapshot,
	timeoutMs = 20_000,
	pollIntervalMs = 250,
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	let lastPath: string | null = null;
	let lastSize = -1;
	let stableCount = 0;
	const wrongVariantNames = new Set<string>();
	while (Date.now() < deadline) {
		const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
		const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
		const completed = fileNames.filter(
			(name) => !name.endsWith(".crdownload") && !name.endsWith(".tmp"),
		);
		const fresh: Array<{ name: string; size: number }> = [];
		for (const name of completed) {
			const stat = await fs.stat(path.join(destDir, name)).catch(() => null);
			if (!stat || baseline.get(name) === chatgptDownloadStatFingerprint(stat)) continue;
			if (path.extname(name).toLowerCase() !== expectedExtension) {
				wrongVariantNames.add(name);
				continue;
			}
			fresh.push({ name, size: stat.size });
		}
		if (fresh.length > 1) {
			throw new Error(
				`ChatGPT Deep Research export produced multiple fresh ${expectedExtension} downloads: ${fresh
					.map((entry) => entry.name)
					.sort()
					.join(", ")}.`,
			);
		}
		if (fresh.length === 1) {
			const candidateName = fresh[0]?.name;
			if (!candidateName) continue;
			const candidatePath = path.join(destDir, candidateName);
			const candidateSize = fresh[0]?.size ?? -1;
			if (candidateSize >= 0) {
				if (candidatePath === lastPath && candidateSize === lastSize) {
					stableCount += 1;
				} else {
					lastPath = candidatePath;
					lastSize = candidateSize;
					stableCount = 0;
				}
				if (stableCount >= 1) {
					return candidatePath;
				}
			}
		}
		await sleep(pollIntervalMs);
	}
	if (wrongVariantNames.size > 0) {
		throw new Error(
			`ChatGPT Deep Research export expected fresh ${expectedExtension} but produced only unexpected download variants: ${Array.from(wrongVariantNames).sort().join(", ")}.`,
		);
	}
	return null;
}

async function validateChatgptDeepResearchExportFile(
	downloadedPath: string,
	exportVariant: "docx" | "pdf",
): Promise<{ extension: ".docx" | ".pdf"; mimeType: string }> {
	const expectedExtension = exportVariant === "docx" ? ".docx" : ".pdf";
	const actualExtension = path.extname(downloadedPath).toLowerCase();
	if (actualExtension !== expectedExtension) {
		throw new Error(
			`ChatGPT Deep Research ${exportVariant} export returned ${actualExtension || "no extension"}; expected ${expectedExtension}.`,
		);
	}
	const handle = await fs.open(downloadedPath, "r");
	const header = Buffer.alloc(8);
	let bytesRead = 0;
	try {
		({ bytesRead } = await handle.read(header, 0, header.length, 0));
	} finally {
		await handle.close();
	}
	const bytes = header.subarray(0, bytesRead);
	if (exportVariant === "pdf") {
		if (!bytes.toString("ascii").startsWith("%PDF-")) {
			throw new Error("ChatGPT Deep Research PDF export does not contain PDF bytes.");
		}
		return { extension: ".pdf", mimeType: "application/pdf" };
	}
	const hasZipSignature =
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		((bytes[2] === 0x03 && bytes[3] === 0x04) ||
			(bytes[2] === 0x05 && bytes[3] === 0x06) ||
			(bytes[2] === 0x07 && bytes[3] === 0x08));
	if (!hasZipSignature) {
		throw new Error("ChatGPT Deep Research DOCX export does not contain ZIP/DOCX bytes.");
	}
	return {
		extension: ".docx",
		mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	};
}

export const snapshotChatgptDownloadDirectoryForTest = snapshotChatgptDownloadDirectory;
export async function waitForChatgptExportDownloadForTest(
	destDir: string,
	exportVariant: "docx" | "pdf",
	baseline: ChatgptDownloadDirectorySnapshot,
	timeoutMs: number,
	pollIntervalMs: number,
): Promise<string | null> {
	return await waitForFreshChatgptDownloadedFile(
		destDir,
		exportVariant === "docx" ? ".docx" : ".pdf",
		baseline,
		timeoutMs,
		pollIntervalMs,
	);
}
export const validateChatgptDeepResearchExportFileForTest = validateChatgptDeepResearchExportFile;

async function waitForChatgptDownloadedFile(
	destDir: string,
	baseline: ChatgptDownloadDirectorySnapshot,
	expectedName: string,
	timeoutMs = 20_000,
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	let lastPath: string | null = null;
	let lastFingerprint: string | null = null;
	while (Date.now() < deadline) {
		const current = await snapshotChatgptDownloadDirectory(destDir);
		const fresh = Array.from(current.entries()).filter(
			([name, fingerprint]) => baseline.get(name) !== fingerprint,
		);
		if (fresh.length > 1) {
			throw new Error("chatgpt_artifact_download_ambiguous: multiple fresh browser downloads");
		}
		const candidate = fresh[0];
		if (candidate) {
			const [name, fingerprint] = candidate;
			if (path.extname(expectedName)) {
				const identity = classifyChatgptFileNameIdentity(name, expectedName);
				if (identity !== "exactMatch" && identity !== "collisionSuffixMatch") {
					throw new Error(
						"chatgpt_artifact_download_identity_mismatch: fresh download does not match selected artifact",
					);
				}
			}
			const candidatePath = path.join(destDir, name);
			const stat = await fs.stat(candidatePath).catch(() => null);
			if (stat && stat.size > 0 && candidatePath === lastPath && fingerprint === lastFingerprint) {
				return candidatePath;
			}
			lastPath = candidatePath;
			lastFingerprint = fingerprint;
		} else {
			lastPath = null;
			lastFingerprint = null;
		}
		await sleep(250);
	}
	return null;
}

async function waitForSingleChatgptDownloadedFile(
	destDir: string,
	timeoutMs: number,
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	let lastPath: string | null = null;
	let lastSize = -1;
	let stableCount = 0;
	while (Date.now() < deadline) {
		const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
		const completed = entries
			.filter(
				(entry) =>
					entry.isFile() && !entry.name.endsWith(".crdownload") && !entry.name.endsWith(".tmp"),
			)
			.map((entry) => entry.name);
		if (completed.length > 1) {
			throw new Error("ChatGPT source preview produced multiple browser downloads.");
		}
		const candidateName = completed[0];
		if (candidateName) {
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
				if (stableCount >= 1) return candidatePath;
			}
		}
		await sleep(250);
	}
	return null;
}

type ChatgptFileNameIdentityDecision =
	| "exactMatch"
	| "collisionSuffixMatch"
	| "extensionMismatch"
	| "stemMismatch";

function classifyChatgptFileNameIdentity(
	actualName: string,
	targetName: string,
): ChatgptFileNameIdentityDecision {
	const normalizeName = (value: string): string => normalizeUiText(value).toLowerCase();
	if (normalizeName(actualName) === normalizeName(targetName)) return "exactMatch";
	const actualExtension = path.extname(actualName);
	const targetExtension = path.extname(targetName);
	if (actualExtension.toLowerCase() !== targetExtension.toLowerCase()) return "extensionMismatch";
	const actualStem = actualName.slice(0, actualName.length - actualExtension.length);
	const targetStem = targetName.slice(0, targetName.length - targetExtension.length);
	const normalizeCollisionStem = (value: string): string =>
		normalizeName(value.replace(/\s?\(\d+\)$/, ""));
	return normalizeCollisionStem(actualStem) === normalizeCollisionStem(targetStem)
		? "collisionSuffixMatch"
		: "stemMismatch";
}

async function fileRefFromChatgptDownloadedArtifact(
	artifact: ConversationArtifact,
	downloadedPath: string,
	metadata: Record<string, unknown>,
): Promise<FileRef> {
	const stat = await fs.stat(downloadedPath);
	const name = path.basename(downloadedPath);
	return {
		id: artifact.id,
		name,
		provider: "chatgpt",
		source: "conversation",
		size: stat.size,
		mimeType: inferMimeTypeFromArtifactName(name),
		remoteUrl: artifact.uri,
		localPath: downloadedPath,
		metadata: {
			artifactKind: artifact.kind,
			artifactTitle: artifact.title,
			...metadata,
			...(artifact.metadata ?? {}),
		},
	};
}

async function materializeChatgptDeepResearchExportWithClient(
	artifact: ConversationArtifact,
	destDir: string,
	targetContext?: { host: string; port: number; targetId?: string | null },
	options?: BrowserProviderListOptions,
): Promise<FileRef | null> {
	const exportVariant =
		typeof artifact.metadata?.exportVariant === "string" ? artifact.metadata.exportVariant : null;
	const exportLabel =
		typeof artifact.metadata?.exportLabel === "string" ? artifact.metadata.exportLabel : null;
	if (
		(exportVariant !== "docx" && exportVariant !== "pdf") ||
		!exportLabel ||
		!targetContext?.port
	) {
		return null;
	}
	const expectedFrameUrl = normalizeChatgptFrameUrl(
		typeof artifact.metadata?.iframeUrl === "string" ? artifact.metadata.iframeUrl : null,
	);
	const expectedTargetId = normalizeUiText(
		typeof artifact.metadata?.iframeTargetId === "string"
			? artifact.metadata.iframeTargetId
			: undefined,
	);
	if (!expectedFrameUrl && !expectedTargetId) {
		throw new Error(
			`ChatGPT Deep Research ${exportVariant} export missing iframe identity; refresh the conversation context before exporting.`,
		);
	}
	const expectedExtension = exportVariant === "docx" ? ".docx" : ".pdf";
	const downloadBaseline = await snapshotChatgptDownloadDirectory(destDir);
	const deadline = Date.now() + 15_000;
	let lastClickFailureLabels = "";
	while (Date.now() < deadline) {
		const targets = await CDP.List({ host: targetContext.host, port: targetContext.port }).catch(
			() => [],
		);
		const candidates = expectedFrameUrl
			? filterChatgptDeepResearchTargets(targets, new Set([expectedFrameUrl]), { expectedTargetId })
			: targets.filter(
					(target) =>
						isChatgptDeepResearchTarget(target) &&
						resolveChatgptTargetId(target) === expectedTargetId,
				);
		if (candidates.length === 0) {
			await sleep(500);
			continue;
		}
		for (const target of candidates) {
			const targetId = resolveChatgptTargetId(target);
			if (!targetId) continue;
			const frameClient = await connectToChromeTarget({
				host: targetContext.host,
				port: targetContext.port,
				target: targetId,
			}).catch(() => null);
			if (!frameClient) continue;
			try {
				await frameClient.Runtime.enable();
				await annotateClientMutationContext(
					frameClient,
					options,
					"provider:chatgpt:deep-research-export",
					targetId,
				);
				const clicked = await frameClient.Runtime.evaluate({
					expression: buildChatgptDeepResearchExportControlExpression(exportLabel),
					returnByValue: true,
				});
				const value = clicked.result?.value;
				if (isRecord(value) && value.action === "export-option-clicked") {
					const downloadedPath = await waitForFreshChatgptDownloadedFile(
						destDir,
						expectedExtension,
						downloadBaseline,
						30_000,
					);
					if (!downloadedPath) {
						throw new Error(
							`ChatGPT Deep Research ${exportVariant} export did not produce a fresh ${expectedExtension} download.`,
						);
					}
					const validated = await validateChatgptDeepResearchExportFile(
						downloadedPath,
						exportVariant,
					);
					const stat = await fs.stat(downloadedPath);
					const name = path.basename(downloadedPath);
					return {
						id: artifact.id,
						name,
						provider: "chatgpt",
						source: "conversation",
						size: stat.size,
						mimeType: validated.mimeType,
						remoteUrl: artifact.uri,
						localPath: downloadedPath,
						metadata: {
							artifactKind: artifact.kind,
							artifactTitle: artifact.title,
							materialization: `deep-research-export-${exportVariant}`,
							...(artifact.metadata ?? {}),
						},
					};
				}
				if (isRecord(value) && value.action === "export-menu-opened") {
					lastClickFailureLabels = "";
					break;
				}
				lastClickFailureLabels =
					isRecord(value) && Array.isArray(value.labels)
						? value.labels.slice(0, 10).join(", ")
						: "n/a";
			} finally {
				await frameClient.close().catch(() => undefined);
			}
		}
		await sleep(500);
	}
	if (lastClickFailureLabels) {
		throw new Error(
			`ChatGPT Deep Research ${exportVariant} export option was not clickable (labels: ${lastClickFailureLabels}).`,
		);
	}
	throw new Error(`ChatGPT Deep Research ${exportVariant} export iframe target was not found.`);
}

function buildChatgptDeepResearchExportControlExpression(exportLabel: string): string {
	return `(() => {
    const exportLabel = ${JSON.stringify(exportLabel)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    };
    const documents = [document];
    for (const frame of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const child = frame.contentDocument || frame.contentWindow?.document || null;
        if (child) documents.push(child);
      } catch {
        // Cross-origin child frames stay opaque here.
      }
    }
    const controls = documents
      .flatMap((doc) => Array.from(doc.querySelectorAll('button, [role="button"], [role="menuitem"], a')))
      .filter((node) => documents.length > 1 || isVisible(node));
    const labelFor = (node) => normalize(
      node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || ''
    );
    const option = controls.find(
      (node) => labelFor(node).toLowerCase() === exportLabel.toLowerCase()
    );
    if (option && typeof option.click === 'function') {
      option.click();
      return { action: 'export-option-clicked' };
    }
    const exportButton = controls.find((node) => /^export$/i.test(labelFor(node)));
    if (exportButton && typeof exportButton.click === 'function') {
      exportButton.click();
      return { action: 'export-menu-opened' };
    }
    return {
      action: 'unavailable',
      labels: controls.map((node) => labelFor(node)).filter(Boolean).slice(0, 20),
    };
  })()`;
}

export const buildChatgptDeepResearchExportControlExpressionForTest =
	buildChatgptDeepResearchExportControlExpression;

async function materializeChatgptConversationArtifactWithClient(
	client: ChromeClient,
	conversationId: string,
	artifact: ConversationArtifact,
	destDir: string,
	projectId?: string | null,
	debugContext?: ChatgptRecoveryDebugContext,
	options?: BrowserProviderListOptions,
	targetContext?: { host: string; port: number; targetId?: string | null },
): Promise<FileRef | null> {
	const normalizedProjectId = normalizeChatgptProjectId(projectId);
	return withChatgptBlockingSurfaceRecovery(
		client,
		`materializeChatgptConversationArtifact:${conversationId}:${artifact.id}`,
		async () => {
			await ensureChatgptConversationSurfaceReadyForRead(
				client,
				conversationId,
				normalizedProjectId,
				options,
			);
			if (artifact.kind === "canvas") {
				const contentText = resolveChatgptCanvasArtifactContentText(
					artifact,
					await readVisibleChatgptCanvasProbesWithClient(client, options),
				);
				if (!contentText.trim()) {
					return null;
				}
				const documentName =
					artifact.metadata && typeof artifact.metadata.documentName === "string"
						? artifact.metadata.documentName
						: artifact.title;
				const fileName = ensureChatgptArtifactExtension(documentName, ".txt");
				const destPath = path.join(destDir, fileName);
				await fs.writeFile(
					destPath,
					contentText.endsWith("\n") ? contentText : `${contentText}\n`,
					"utf8",
				);
				const stat = await fs.stat(destPath);
				return {
					id: artifact.id,
					name: fileName,
					provider: "chatgpt",
					source: "conversation",
					size: stat.size,
					mimeType: "text/plain",
					remoteUrl: artifact.uri,
					localPath: destPath,
					metadata: {
						artifactKind: artifact.kind,
						artifactTitle: artifact.title,
						materialization: "canvas-content-text",
						...(artifact.metadata ?? {}),
					},
				};
			}
			if (
				artifact.kind === "document" &&
				(artifact.metadata?.exportVariant === "docx" || artifact.metadata?.exportVariant === "pdf")
			) {
				await configureChatgptDownloadBehaviorWithClient(client, destDir, options);
				return await materializeChatgptDeepResearchExportWithClient(
					artifact,
					destDir,
					targetContext,
					options,
				);
			}
			if (artifact.kind === "document" && typeof artifact.metadata?.contentText === "string") {
				const contentText = normalizeInstructionComparisonText(artifact.metadata.contentText);
				if (!contentText) {
					return null;
				}
				const fileName = ensureChatgptArtifactExtension(artifact.title, ".md");
				const destPath = path.join(destDir, fileName);
				await fs.writeFile(
					destPath,
					contentText.endsWith("\n") ? contentText : `${contentText}\n`,
					"utf8",
				);
				const stat = await fs.stat(destPath);
				return {
					id: artifact.id,
					name: fileName,
					provider: "chatgpt",
					source: "conversation",
					size: stat.size,
					mimeType: "text/markdown",
					remoteUrl: artifact.uri,
					localPath: destPath,
					metadata: {
						artifactKind: artifact.kind,
						artifactTitle: artifact.title,
						materialization: "document-content-text",
						...(artifact.metadata ?? {}),
						contentText: undefined,
					},
				};
			}
			if (
				artifact.kind === "download" ||
				(artifact.kind === "spreadsheet" &&
					typeof artifact.uri === "string" &&
					artifact.uri.trim().toLowerCase().startsWith("sandbox:"))
			) {
				await configureChatgptDownloadBehaviorWithClient(client, destDir, options);
				let tagged = await tagChatgptDownloadButtonWithClient(client, artifact);
				if (
					!tagged &&
					artifact.kind === "spreadsheet" &&
					typeof artifact.uri === "string" &&
					artifact.uri.trim().toLowerCase().startsWith("sandbox:")
				) {
					tagged = await tagChatgptSpreadsheetCardDownloadButtonWithClient(client, artifact);
				}
				if (!tagged) {
					return null;
				}
				const readyButton = await waitForSelector(
					client.Runtime,
					`[${CHATGPT_DOWNLOAD_BUTTON_ATTR}="true"]`,
					10_000,
				);
				if (!readyButton) {
					return null;
				}
				const downloadBaseline = await snapshotChatgptDownloadDirectory(destDir);
				await armDownloadCapture(client.Runtime, { stateKey: CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY });
				recordBrowserScrapeProviderAction(options, "chatgpt.clickArtifactDownload");
				if (!(await clickTaggedChatgptDownloadControlWithClient(client, options))) {
					return null;
				}
				const capture = await waitForDownloadCapture(client.Runtime, {
					stateKey: CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY,
					timeoutMs: 1500,
					pollMs: 100,
				});
				let remoteUrl = normalizeUiText(capture.href);
				let downloadName = normalizeUiText(capture.downloadName);
				if (!remoteUrl && !downloadName) {
					const clickedViewerDownload = await clickChatgptViewerDownloadButtonWithClient(
						client,
						options,
					);
					if (clickedViewerDownload) {
						const viewerCapture = await waitForDownloadCapture(client.Runtime, {
							stateKey: CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY,
							timeoutMs: 3_000,
							pollMs: 100,
						});
						remoteUrl = normalizeUiText(viewerCapture.href);
						downloadName = normalizeUiText(viewerCapture.downloadName);
					}
				}
				recordBrowserScrapeDownloadAttempt(options);
				const downloadedPath = await waitForChatgptDownloadedFile(
					destDir,
					downloadBaseline,
					sanitizeChatgptArtifactFileName(artifact.title),
					CHATGPT_ARTIFACT_BROWSER_DOWNLOAD_TIMEOUT_MS,
				);
				if (downloadedPath) {
					recordBrowserScrapeDownloadSuccess(options);
					return fileRefFromChatgptDownloadedArtifact(artifact, downloadedPath, {
						materialization: "download-button",
						capturedAnchorUrl: remoteUrl || undefined,
						capturedDownloadName: downloadName || undefined,
					});
				}
				if (!remoteUrl) {
					recordBrowserScrapeDownloadFailure(options);
					return null;
				}
				recordBrowserScrapeDownloadFailure(options);
				const { buffer, contentType, contentDisposition } = await fetchChatgptBinaryWithClient(
					client,
					remoteUrl,
					options,
				);
				const fallbackBaseName =
					extractFilenameFromContentDisposition(contentDisposition) ||
					extractFilenameFromArtifactUri(artifact.uri) ||
					downloadName ||
					artifact.title;
				const fileName = ensureChatgptArtifactExtension(
					fallbackBaseName,
					contentTypeToExtension(contentType),
				);
				const destPath = path.join(destDir, fileName);
				await fs.writeFile(destPath, buffer);
				return {
					id: artifact.id,
					name: fileName,
					provider: "chatgpt",
					source: "conversation",
					size: buffer.byteLength,
					mimeType: contentType ?? inferMimeTypeFromArtifactName(fileName),
					remoteUrl,
					localPath: destPath,
					metadata: {
						artifactKind: artifact.kind,
						artifactTitle: artifact.title,
						materialization: "captured-anchor-fetch",
						...(artifact.metadata ?? {}),
					},
				};
			}
			if (
				artifact.kind === "spreadsheet" &&
				typeof artifact.title === "string" &&
				artifact.title.trim()
			) {
				const tableReady = await waitForChatgptTableArtifactRowsWithClient(client, artifact.title);
				if (!tableReady) {
					return null;
				}
				const rows = await readChatgptTableArtifactRowsWithClient(client, artifact.title);
				if (rows && rows.length > 0) {
					const csv = serializeChatgptGridRowsToCsv(rows);
					const fileName = ensureChatgptArtifactExtension(artifact.title, ".csv");
					const destPath = path.join(destDir, fileName);
					await fs.writeFile(destPath, csv.endsWith("\n") ? csv : `${csv}\n`, "utf8");
					const stat = await fs.stat(destPath);
					return {
						id: artifact.id,
						name: fileName,
						provider: "chatgpt",
						source: "conversation",
						size: stat.size,
						mimeType: "text/csv",
						remoteUrl: artifact.uri,
						localPath: destPath,
						metadata: {
							artifactKind: artifact.kind,
							artifactTitle: artifact.title,
							materialization: "inline-grid-csv",
							...(artifact.metadata ?? {}),
						},
					};
				}
				return null;
			}
			if (artifact.kind === "image") {
				const imageReady = await waitForChatgptImageArtifactWithClient(client, artifact);
				if (!imageReady) {
					return null;
				}
				const imageUrl = await readChatgptImageArtifactSrcWithClient(client, artifact);
				if (!imageUrl) {
					return null;
				}
				const { buffer, contentType } = await fetchChatgptBinaryWithClient(
					client,
					imageUrl,
					options,
				);
				const fileName = ensureChatgptArtifactExtension(
					artifact.title,
					contentTypeToExtension(contentType),
				);
				const destPath = path.join(destDir, fileName);
				await fs.writeFile(destPath, buffer);
				return {
					id: artifact.id,
					name: fileName,
					provider: "chatgpt",
					source: "conversation",
					size: buffer.byteLength,
					mimeType: contentType ?? undefined,
					remoteUrl: artifact.uri ?? imageUrl,
					localPath: destPath,
					metadata: {
						artifactKind: artifact.kind,
						artifactTitle: artifact.title,
						materialization: "estuary-image-fetch",
						imageUrl,
						...(artifact.metadata ?? {}),
					},
				};
			}
			return null;
		},
		{
			debugContext,
			reopen: buildChatgptConversationReopen(client, conversationId, normalizedProjectId, options),
			providerOptions: options,
		},
	);
}

export const materializeChatgptConversationArtifactWithClientForTest =
	materializeChatgptConversationArtifactWithClient;

type ChatgptPromptWorkbenchConfig = {
	chatgptMode?: "chat" | "work" | null;
	desiredModel?: string | null;
	inputTimeoutMs?: number | null;
	modelStrategy?: "select" | "current" | "ignore";
	thinkingTime?: "light" | "standard" | "extended" | "heavy" | null;
	workModel?: string | null;
};

async function prepareChatgptPromptWorkbenchInClient(
	client: ChromeClient,
	input: BrowserProviderPromptWorkbenchInput & {
		thinkingTime?: "light" | "standard" | "extended" | "heavy" | null;
	},
	browserConfig: ChatgptPromptWorkbenchConfig | undefined,
	logger: BrowserLogger,
	options?: BrowserProviderListOptions,
): Promise<{
	chatgptMode: "chat" | "work";
	inputTimeoutMs: number;
	modelSelectionKind: BrowserProviderPromptWorkbenchResult["modelSelectionKind"];
	model: string | null;
}> {
	const chatgptMode = input.chatgptMode ?? browserConfig?.chatgptMode ?? "chat";
	const desiredModel = input.desiredModel ?? browserConfig?.desiredModel ?? null;
	const workModel = input.workModel ?? browserConfig?.workModel ?? null;
	const modelStrategy = input.modelStrategy ?? browserConfig?.modelStrategy ?? "select";
	const thinkingTime = input.thinkingTime ?? browserConfig?.thinkingTime ?? null;
	const inputTimeoutMs = input.inputTimeoutMs ?? browserConfig?.inputTimeoutMs ?? 30_000;
	const { Runtime } = client;
	const targetUrl = normalizeUiText(input.targetUrl);
	if (targetUrl) {
		const currentUrl = await readChatgptLocationHref(Runtime).catch(() => null);
		if (!isChatgptPromptWorkbenchAtTarget(currentUrl, targetUrl)) {
			await navigateToChatgptUrl(
				client,
				targetUrl,
				extractChatgptProjectIdFromUrl(targetUrl) ?? undefined,
				options,
			);
			const observedUrl = await readChatgptLocationHref(Runtime).catch(() => null);
			if (!isChatgptPromptWorkbenchAtTarget(observedUrl, targetUrl)) {
				throw new Error(
					`ChatGPT prompt workbench remained on ${observedUrl ?? "(unknown URL)"}, not the requested ${targetUrl}.`,
				);
			}
			logger(`ChatGPT workbench target: ${observedUrl}`);
		}
	}

	await ensureChatgptComposerMode(Runtime, chatgptMode, logger);
	await ensurePromptReady(Runtime, inputTimeoutMs, logger);
	const modelSelectionPlan = resolveChatgptModelSelectionPlan({
		mode: chatgptMode,
		desiredModel,
		workModel,
		strategy: modelStrategy,
	});
	let selectedModel: string | null = null;
	if (modelSelectionPlan.kind === "chat-model") {
		selectedModel = await ensureModelSelection(
			Runtime,
			modelSelectionPlan.model,
			logger,
			modelSelectionPlan.strategy,
		);
	} else if (modelSelectionPlan.kind === "work-model") {
		await ensureChatgptWorkModelSelection(
			Runtime,
			modelSelectionPlan.model,
			logger,
			modelSelectionPlan.strategy,
		);
	} else if (modelSelectionPlan.kind === "work-current") {
		logger("Work model picker: preserving current selection");
	} else {
		logger("Model picker: skipped (strategy=ignore)");
	}
	if (
		chatgptMode === "chat" &&
		thinkingTime &&
		shouldApplyChatgptThinkingTime(
			modelStrategy === "current" ? selectedModel : desiredModel,
			selectedModel,
		)
	) {
		await ensureThinkingTime(Runtime, thinkingTime, logger);
	}
	return {
		chatgptMode,
		inputTimeoutMs,
		modelSelectionKind: modelSelectionPlan.kind,
		model:
			modelSelectionPlan.kind === "chat-model"
				? selectedModel
				: modelSelectionPlan.kind === "work-model"
					? modelSelectionPlan.model
					: null,
	};
}

export function createChatgptAdapter(): Pick<
	BrowserProvider,
	| "capabilities"
	| "getUserIdentity"
	| "getFeatureSignature"
	| "listProjects"
	| "updateProjectInstructions"
	| "getProjectInstructions"
	| "listProjectFiles"
	| "uploadProjectFiles"
	| "downloadProjectFile"
	| "deleteProjectFile"
	| "renameProject"
	| "openCreateProjectModal"
	| "setCreateProjectFields"
	| "clickCreateProjectConfirm"
	| "createProject"
	| "selectRemoveProjectItem"
	| "pushProjectRemoveConfirmation"
	| "listConversations"
	| "readConversationContext"
	| "readActiveConversationArtifacts"
	| "listAccountFiles"
	| "downloadAccountFile"
	| "listConversationFiles"
	| "downloadConversationFile"
	| "downloadConversationFiles"
	| "materializeConversationArtifact"
	| "renameConversation"
	| "deleteConversation"
	| "preparePromptWorkbench"
	| "runPrompt"
> {
	return {
		capabilities: {
			projects: true,
			conversations: true,
			instructions: true,
			files: true,
		},
		async preparePromptWorkbench(
			input: BrowserProviderPromptWorkbenchInput,
			options?: BrowserProviderListOptions,
		): Promise<BrowserProviderPromptWorkbenchResult> {
			await beforeChatgptBrowserInteraction(options, "generic");
			const targetUrl = input.targetUrl ?? options?.configuredUrl ?? CHATGPT_HOME_URL;
			const connection = await connectToChatgptTab(options, targetUrl);
			const browserConfig = options?.browserService?.getConfig() as
				| ChatgptPromptWorkbenchConfig
				| undefined;
			const messages: string[] = [];
			const logger = ((message: string): void => {
				messages.push(message);
				void input.onProgress?.({
					phase: "composer_ready",
					details: { provider: "chatgpt", message },
				});
			}) as BrowserLogger;
			logger.verbose = false;

			return runWithChatgptAbortBoundConnection(connection, options, async (client) => {
				await assertChatgptExpectedIdentity(client, options);
				const prepared = await prepareChatgptPromptWorkbenchInClient(
					client,
					input,
					browserConfig,
					logger,
					options,
				);
				const locationResult = await client.Runtime.evaluate({
					expression: "location.href",
					returnByValue: true,
				});
				return {
					chatgptMode: prepared.chatgptMode,
					modelSelectionKind: prepared.modelSelectionKind,
					model: prepared.model,
					messages,
					url:
						typeof locationResult.result?.value === "string"
							? locationResult.result.value
							: targetUrl,
					tabTargetId: connection.targetId ?? null,
					devtoolsHost: connection.host ?? null,
					devtoolsPort: connection.port ?? null,
				};
			});
		},
		async runPrompt(
			input: BrowserProviderPromptInput,
			options?: BrowserProviderListOptions,
		): Promise<BrowserProviderPromptResult> {
			if (input.completionMode !== "prompt_submitted") {
				throw new Error(
					"ChatGPT llmService prompt execution currently supports completionMode=prompt_submitted only.",
				);
			}
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const targetUrl = input.targetUrl ?? options?.configuredUrl ?? CHATGPT_HOME_URL;
			const connection = await connectToChatgptTab(options, targetUrl);
			const browserConfig = options?.browserService?.getConfig() as
				| (ChatgptPromptWorkbenchConfig & {
						composerTool?: string | null;
				  })
				| undefined;
			const isImageGeneration = input.capabilityId === "chatgpt.media.create_image";
			const composerTool = isImageGeneration
				? "create image"
				: (browserConfig?.composerTool ?? null);
			let composerCapability: BrowserProviderPromptResult["composerCapability"];
			let selectedEcosystemMention = input.ecosystemMention;
			const logger = ((message: string): void => {
				void input.onProgress?.({
					phase: "submit_path_observed",
					details: { provider: "chatgpt", message },
				});
			}) as BrowserLogger;
			logger.verbose = false;

			return runWithChatgptAbortBoundConnection(connection, options, async (client) => {
				await assertChatgptExpectedIdentity(client, options);
				const { DOM, Input, Page, Runtime } = client;
				const prepared = await prepareChatgptPromptWorkbenchInClient(
					client,
					{
						...input,
						modelStrategy: isImageGeneration ? "ignore" : input.modelStrategy,
					},
					browserConfig,
					logger,
					options,
				);
				const { chatgptMode, inputTimeoutMs } = prepared;
				if (composerTool) {
					if (chatgptMode === "work") {
						throw new Error(
							"ChatGPT composer tools currently belong to Chat mode. Request Chat mode or omit --browser-composer-tool for Work.",
						);
					}
					const capabilitySelection = await ensureChatgptComposerTool(client, composerTool, logger);
					composerCapability = capabilitySelection.receipt;
					selectedEcosystemMention =
						capabilitySelection.ecosystemMention ?? selectedEcosystemMention;
					await ensurePromptReady(Runtime, inputTimeoutMs, logger);
				}
				if (input.ecosystemMention) {
					if (chatgptMode === "work") {
						throw new Error(
							"ChatGPT developer-app mentions currently belong to Chat mode. Request Chat mode for app submission.",
						);
					}
					if (composerTool) {
						throw new Error(
							"ChatGPT developer-app mentions cannot be combined with a generic composer tool.",
						);
					}
					await ensureChatgptEcosystemMention(client, input.ecosystemMention);
					selectedEcosystemMention = input.ecosystemMention;
					await ensurePromptReady(Runtime, inputTimeoutMs, logger);
				}
				const attachments = input.attachments ?? [];
				const libraryFiles = input.libraryFiles ?? [];
				let libraryFileReceipt: LibraryFileAttachmentReceipt | undefined;
				const attachmentNames = attachments.map((attachment) => path.basename(attachment.path));
				let attachmentWaitTimedOut = false;
				if (attachments.length > 0) {
					if (!DOM) {
						throw new Error("Chrome DOM domain unavailable while uploading attachments.");
					}
					await clearComposerAttachments(Runtime, 5_000, logger);
					for (const [attachmentIndex, attachment] of attachments.entries()) {
						logger(`Uploading attachment: ${attachment.displayPath}`);
						await uploadAttachmentFile(
							{ runtime: Runtime, dom: DOM, input: Input, page: Page },
							attachment,
							logger,
							{ expectedCount: attachmentIndex + 1 },
						);
					}
					const waitBudget = Math.max(inputTimeoutMs, 45_000) + (attachments.length - 1) * 20_000;
					try {
						await waitForAttachmentCompletion(Runtime, waitBudget, attachmentNames, logger);
						logger("All attachments uploaded");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						if (!/Attachments did not finish uploading before timeout/i.test(message)) {
							throw error;
						}
						attachmentWaitTimedOut = true;
						logger(
							`[browser] Attachment upload timed out after ${Math.round(waitBudget / 1_000)}s; continuing without confirmation.`,
						);
					}
				}
				if (libraryFiles.length > 0) {
					libraryFileReceipt = await attachChatgptLibraryFiles(client, libraryFiles, logger);
					await ensurePromptReady(Runtime, inputTimeoutMs, logger);
				}
				const ecosystemMentionBeforeSend = selectedEcosystemMention;
				await submitPrompt(
					{
						runtime: Runtime,
						input: Input,
						attachmentNames: attachmentWaitTimedOut ? [] : attachmentNames,
						inputTimeoutMs,
						beforeSend: async () => {
							if (libraryFileReceipt) {
								await verifyChatgptLibraryFileAttachments(client, libraryFileReceipt.attached);
							}
							if (ecosystemMentionBeforeSend) {
								await assertChatgptEcosystemMentionSelected(client, ecosystemMentionBeforeSend);
							}
						},
						onPromptDispatched: () => logger("Prompt dispatched"),
					},
					input.prompt,
					logger,
				);
				const url = await readSubmittedChatgptLocation(Runtime, targetUrl, {
					abortSignal: options?.abortSignal,
					timeoutMs: input.timeoutMs,
				});
				return {
					text: "",
					...(libraryFileReceipt ? { libraryFiles: libraryFileReceipt } : {}),
					conversationId: url ? extractChatgptConversationIdFromUrl(url) : null,
					url,
					tabTargetId: connection.targetId ?? null,
					devtoolsHost: connection.host ?? null,
					devtoolsPort: connection.port ?? null,
					composerCapability,
				};
			});
		},
		async getUserIdentity(
			options?: BrowserProviderListOptions,
		): Promise<ProviderUserIdentity | null> {
			await beforeChatgptBrowserInteraction(options, "page-refresh");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			return runWithChatgptAbortBoundConnection(connection, options, async (client) => {
				if (options?.tabLifecycle === "dispose-new") {
					await waitForChatgptDisposableRootComposer(client);
				}
				return readChatgptUserIdentity(client, options);
			});
		},
		async getFeatureSignature(options?: BrowserProviderListOptions): Promise<string | null> {
			await beforeChatgptBrowserInteraction(options, "page-refresh");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			const { client } = connection;
			const originalUrl = await readChatgptLocationHref(client.Runtime).catch(() => null);
			const configuredUrl = normalizeUiText(options?.configuredUrl);
			const shouldNavigate =
				Boolean(configuredUrl) &&
				(options?.tabLifecycle === "dispose-new" || originalUrl !== configuredUrl);
			try {
				if (shouldNavigate) {
					await navigateToChatgptUrl(client, configuredUrl, undefined, options);
				}
				if (options?.tabLifecycle === "dispose-new") {
					await waitForChatgptDisposableRootComposer(client);
				}
				await assertChatgptExpectedIdentity(client, options);
				return await readChatgptFeatureSignature(client, options);
			} finally {
				if (shouldNavigate && options?.preserveActiveTab === true && originalUrl) {
					await navigateToChatgptUrl(client, originalUrl, undefined, options).catch(
						() => undefined,
					);
				}
				await closeChatgptTabConnection(connection, options);
			}
		},
		async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
			const attempt = async (currentOptions?: BrowserProviderListOptions): Promise<Project[]> => {
				await beforeChatgptBrowserInteraction(currentOptions, "page-refresh");
				const connection = await connectToChatgptTab(
					currentOptions,
					currentOptions?.configuredUrl ?? CHATGPT_HOME_URL,
				);
				const { client } = connection;
				try {
					if (currentOptions?.disableProjectClickFallback === true) {
						return await scrapeChatgptProjects(client, { disableClickFallback: true });
					}
					await assertChatgptExpectedIdentity(client, currentOptions);
					await navigateToChatgptUrl(client, CHATGPT_HOME_URL);
					await dismissCreateProjectDialogIfOpen(client.Runtime, {
						strict: true,
						source: "list-projects",
					});
					await ensureChatgptSidebarOpen(client);
					return await scrapeChatgptProjects(client);
				} finally {
					await closeChatgptTabConnection(connection, currentOptions);
				}
			};
			try {
				return await attempt(options);
			} catch (error) {
				if (!isRetryableConnectionError(error)) {
					throw error;
				}
				const retryOptions =
					options && providerNavigationAllowed(options)
						? { ...options, tabTargetId: undefined }
						: options;
				return attempt(retryOptions);
			}
		},
		async listConversations(
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<Conversation[]> {
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-list-conversations",
				{
					projectId: normalizedProjectId ?? null,
				},
			);
			const attempt = async (
				currentOptions?: BrowserProviderListOptions,
			): Promise<Conversation[]> => {
				await beforeChatgptBrowserInteraction(currentOptions, "conversation-read");
				const targetUrl = normalizedProjectId
					? resolveChatgptProjectUrl(normalizedProjectId)
					: (currentOptions?.configuredUrl ?? CHATGPT_HOME_URL);
				const connection = await connectToChatgptTab(currentOptions, targetUrl);
				const { client } = connection;
				try {
					await assertChatgptExpectedIdentity(client, currentOptions);
					await dismissCreateProjectDialogIfOpen(client.Runtime, {
						strict: true,
						source: "list-conversations",
					});
					return await scrapeChatgptConversations(
						client,
						normalizedProjectId,
						currentOptions,
						debugContext,
					);
				} finally {
					await closeChatgptTabConnection(connection, currentOptions);
				}
			};
			try {
				return await attempt(options);
			} catch (error) {
				if (!isRetryableConnectionError(error)) {
					throw error;
				}
				const retryOptions =
					options && providerNavigationAllowed(options)
						? { ...options, tabTargetId: undefined }
						: options;
				return attempt(retryOptions);
			}
		},
		async readConversationContext(
			conversationId: string,
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<ConversationContext> {
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-read-conversation-context",
				{
					conversationId,
					projectId: normalizedProjectId ?? null,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			const { targetId, host, port } = connection;
			return runWithChatgptAbortBoundConnection(connection, options, async (client) => {
				await resolveProviderTrafficGovernor(options)?.checkWarning?.(client.Runtime);
				await assertChatgptExpectedIdentity(client, options);
				await dismissCreateProjectDialogIfOpen(client.Runtime, {
					strict: true,
					source: "read-conversation-context",
				});
				return await readChatgptConversationContextWithClient(
					client,
					conversationId,
					normalizedProjectId,
					debugContext,
					options,
					{ host, port, targetId: targetId ?? null },
				);
			});
		},
		async readActiveConversationArtifacts(
			conversationId: string,
			options?: BrowserProviderListOptions,
		): Promise<ConversationArtifact[]> {
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			const normalizedConversationId = normalizeChatgptConversationId(conversationId);
			if (!normalizedConversationId) {
				throw new Error("ChatGPT active artifact read requires a conversation id.");
			}
			if (!options?.tabTargetId) {
				throw new Error("ChatGPT active artifact read requires the submitted tab target id.");
			}
			const normalizedProjectId = normalizeChatgptProjectId(options.projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-read-active-artifacts",
				{
					conversationId: normalizedConversationId,
					projectId: normalizedProjectId ?? null,
					tabTargetId: options.tabTargetId,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				options.tabUrl ??
					resolveChatgptConversationUrl(normalizedConversationId, normalizedProjectId),
			);
			const { client, targetId, host, port } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await dismissCreateProjectDialogIfOpen(client.Runtime, {
					strict: true,
					source: "read-active-conversation-artifacts",
				});
				if (targetId && targetId !== options.tabTargetId) {
					throw new Error(
						`ChatGPT active artifact read attached to ${targetId}, expected submitted tab ${options.tabTargetId}.`,
					);
				}
				const context = await readChatgptConversationContextWithClient(
					client,
					normalizedConversationId,
					normalizedProjectId,
					debugContext,
					{ ...options, preserveActiveTab: true },
					{ host, port, targetId: targetId ?? null },
				);
				return context.artifacts ?? [];
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async listConversationFiles(
			conversationId: string,
			options?: BrowserProviderListOptions,
		): Promise<FileRef[]> {
			recordBrowserScrapeProviderAction(options, "chatgpt.listConversationFiles.start");
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			recordBrowserScrapeProviderAction(options, "chatgpt.listConversationFiles.afterGovernor");
			const normalizedProjectId = normalizeChatgptProjectId(options?.projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-list-conversation-files",
				{
					conversationId,
					projectId: normalizedProjectId ?? null,
				},
			);
			recordBrowserScrapeProviderAction(options, "chatgpt.listConversationFiles.beforeConnect");
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			recordBrowserScrapeProviderAction(options, "chatgpt.listConversationFiles.connected");
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				recordBrowserScrapeProviderAction(options, "chatgpt.listConversationFiles.readVisible");
				return await withChatgptBlockingSurfaceRecovery(
					client,
					`listChatgptConversationFiles:${conversationId}`,
					async () => {
						await ensureChatgptConversationSurfaceReadyForRead(
							client,
							conversationId,
							normalizedProjectId,
							options,
						);
						return await readVisibleChatgptConversationFilesWithClient(
							client,
							conversationId,
							options,
						);
					},
					{
						debugContext,
						reopen: buildChatgptConversationReopen(
							client,
							conversationId,
							normalizedProjectId,
							options,
						),
						providerOptions: options,
					},
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async downloadConversationFile(
			conversationId: string,
			fileId: string,
			destPath: string,
			options?: BrowserProviderListOptions,
			file?: FileRef,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			const normalizedProjectId = normalizeChatgptProjectId(options?.projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-download-conversation-file",
				{
					conversationId,
					projectId: normalizedProjectId ?? null,
					fileId,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await downloadChatgptConversationFileWithClient(
					client,
					conversationId,
					fileId,
					destPath,
					normalizedProjectId,
					debugContext,
					options,
					file,
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async downloadConversationFiles(
			conversationId: string,
			items: BrowserProviderConversationFileDownloadInput[],
			options?: BrowserProviderListOptions,
		): Promise<BrowserProviderConversationFileDownloadResult[]> {
			if (items.length === 0) return [];
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			const normalizedProjectId = normalizeChatgptProjectId(options?.projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-download-conversation-files",
				{
					conversationId,
					projectId: normalizedProjectId ?? null,
					fileCount: items.length,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				return await downloadChatgptConversationFilesWithClient(
					client,
					conversationId,
					items,
					normalizedProjectId,
					debugContext,
					options,
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async listAccountFiles(options?: BrowserProviderListOptions): Promise<FileRef[]> {
			return runChatgptLibraryInventoryOperation(options, async (scopedOptions, runStage) => {
				await runStage("interaction-governor", () =>
					beforeChatgptBrowserInteraction(scopedOptions, "page-refresh"),
				);
				const connection = await runStage(
					"connect",
					() => connectToChatgptTab(scopedOptions, CHATGPT_LIBRARY_URL),
					CHATGPT_LIBRARY_CONNECT_STAGE_TIMEOUT_MS,
				);
				return runWithChatgptAbortBoundConnection(connection, scopedOptions, async (client) => {
					await runStage("identity", () => assertChatgptExpectedIdentity(client, scopedOptions));
					await runStage(
						"dialog-cleanup",
						() =>
							dismissCreateProjectDialogIfOpen(client.Runtime, {
								strict: true,
								source: "list-account-files",
							}),
						CHATGPT_LIBRARY_DIALOG_STAGE_TIMEOUT_MS,
					);
					await runStage("route-readiness", () =>
						navigateToChatgptUrl(client, CHATGPT_LIBRARY_URL, undefined, scopedOptions),
					);
					const inventory = await runStage("dom-inventory", () =>
						readChatgptLibraryItemsWithClient(client),
					);
					return inventory.files;
				});
			});
		},
		async downloadAccountFile(
			fileId: string,
			destPath: string,
			options?: BrowserProviderListOptions,
			file?: FileRef,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "page-refresh");
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-download-account-library-file",
				{
					fileId,
				},
			);
			const connection = await connectToChatgptTab(options, CHATGPT_LIBRARY_URL);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await dismissCreateProjectDialogIfOpen(client.Runtime, {
					strict: true,
					source: "download-account-file",
				});
				await downloadChatgptAccountLibraryFileWithClient(
					client,
					fileId,
					destPath,
					debugContext,
					options,
					file,
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async materializeConversationArtifact(
			conversationId: string,
			artifact: ConversationArtifact,
			destDir: string,
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<FileRef | null> {
			recordBrowserScrapeProviderAction(options, "chatgpt.materializeArtifact.start");
			await beforeChatgptBrowserInteraction(options, "conversation-read");
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-materialize-artifact",
				{
					conversationId,
					projectId: normalizedProjectId ?? null,
					artifactId: artifact.id,
					artifactKind: artifact.kind,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			recordBrowserScrapeProviderAction(options, "chatgpt.materializeArtifact.connected");
			const { client, targetId, host, port } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				return await materializeChatgptConversationArtifactWithClient(
					client,
					conversationId,
					artifact,
					destDir,
					normalizedProjectId,
					debugContext,
					options,
					{ host, port, targetId: targetId ?? null },
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async renameConversation(
			conversationId: string,
			newTitle: string,
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				if (!normalizedProjectId) {
					await renameChatgptConversationWithClient(
						client,
						conversationId,
						newTitle,
						normalizedProjectId,
					);
					return;
				}
				let lastError: unknown;
				for (let attempt = 0; attempt < 3; attempt += 1) {
					try {
						await renameChatgptConversationWithClient(
							client,
							conversationId,
							newTitle,
							normalizedProjectId,
						);
						return;
					} catch (error) {
						lastError = error;
						if (attempt === 2) {
							break;
						}
						await sleep(2_000 * (attempt + 1));
						await navigateToChatgptConversation(client, conversationId, normalizedProjectId).catch(
							() => undefined,
						);
						await ensureChatgptSidebarOpen(client).catch(() => undefined);
					}
				}
				throw lastError instanceof Error
					? lastError
					: new Error(`ChatGPT conversation rename failed for ${conversationId}`);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async deleteConversation(
			conversationId: string,
			projectId?: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const normalizedProjectId = normalizeChatgptProjectId(projectId);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptConversationUrl(conversationId, normalizedProjectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await deleteChatgptConversationWithClient(client, conversationId, normalizedProjectId);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async openCreateProjectModal(options?: BrowserProviderListOptions): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openCreateProjectModalWithClient(client);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async setCreateProjectFields(
			fields: {
				name?: string;
				instructions?: string;
				modelLabel?: string;
				memoryMode?: ProjectMemoryMode;
			},
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openCreateProjectModalWithClient(client);
				await setCreateProjectFieldsWithClient(client, fields);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async clickCreateProjectConfirm(options?: BrowserProviderListOptions): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await clickCreateProjectConfirmWithClient(client);
			} finally {
				await closeChatgptTabConnection(connection, options);
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
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				options?.configuredUrl ?? CHATGPT_HOME_URL,
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await dismissCreateProjectDialogIfOpen(client.Runtime, {
					strict: true,
					source: "create-project-start",
				});
				await navigateToChatgptUrl(client, options?.configuredUrl ?? CHATGPT_HOME_URL);
				const initialProjects = await scrapeChatgptProjects(client);
				const initialProjectIds = new Set(initialProjects.map((project) => project.id));
				const initialCurrentProject = await readCurrentProject(client);
				await openCreateProjectModalWithClient(client);
				await setCreateProjectFieldsWithClient(client, input);
				await clickCreateProjectConfirmWithClient(client);
				const routeChanged = await waitForPredicate(
					client.Runtime,
					buildProjectRouteChangeExpression(initialCurrentProject?.id ?? null),
					{
						timeoutMs: 12_000,
						description: `ChatGPT project route changed for ${input.name}`,
					},
				);
				const deadline = Date.now() + 12_000;
				let created: Project | null = null;
				if (routeChanged.ok) {
					const routeValue = routeChanged.value as { id?: string; href?: string } | undefined;
					const createdId = normalizeChatgptProjectId(routeValue?.id);
					if (createdId) {
						await waitForPredicate(client.Runtime, buildProjectSurfaceReadyExpression(createdId), {
							timeoutMs: 15_000,
							description: `ChatGPT project surface ready for ${input.name}`,
						});
						try {
							await waitForProjectSettingsApplied(client, createdId, { name: input.name });
						} catch {
							// Settings-snapshot verification can lag right after route change; route change itself is still authoritative here.
						}
						const current = await readCurrentProject(client);
						created = {
							id: createdId,
							name:
								current && normalizeProjectName(current.name) === normalizeProjectName(input.name)
									? current.name
									: input.name,
							provider: "chatgpt",
							url: current?.url ?? routeValue?.href ?? resolveChatgptProjectUrl(createdId),
							memoryMode: input.memoryMode,
						};
					}
				}
				while (Date.now() < deadline) {
					if (created) break;
					const current = await readCurrentProject(client);
					if (
						current &&
						current.id !== initialCurrentProject?.id &&
						normalizeProjectName(current.name) === normalizeProjectName(input.name)
					) {
						created = {
							...current,
							memoryMode: input.memoryMode,
						};
						break;
					}
					const projects = await scrapeChatgptProjects(client);
					const match = findChatgptProjectByName(projects, input.name);
					if (match && !initialProjectIds.has(match.id)) {
						created = {
							...match,
							memoryMode: input.memoryMode,
						};
						break;
					}
					await sleep(400);
				}
				if (!created) {
					throw new Error(`ChatGPT project creation could not be verified for "${input.name}"`);
				}
				if (input.instructions?.trim()) {
					await applyProjectSettings(client, created.id, { instructions: input.instructions });
					await waitForProjectSettingsApplied(client, created.id, {
						instructions: input.instructions,
					});
				}
				if (Array.isArray(input.files) && input.files.length > 0) {
					await uploadChatgptProjectSourceFilesWithClient(client, created.id, input.files);
				}
				return created;
			} catch (error) {
				await dismissCreateProjectDialogIfOpen(client.Runtime, {
					strict: false,
					source: "create-project-error-cleanup",
				}).catch(() => undefined);
				throw error;
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async uploadProjectFiles(
			projectId: string,
			filePaths: string[],
			options?: BrowserProviderListOptions,
		): Promise<void> {
			if (filePaths.length === 0) return;
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptProjectSourcesUrl(projectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await uploadChatgptProjectSourceFilesWithClient(client, projectId, filePaths);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async listProjectFiles(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<FileRef[]> {
			await beforeChatgptBrowserInteraction(options, "renavigation");
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptProjectSourcesUrl(projectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openProjectSourcesTab(client, projectId);
				const initial = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
				if (initial.length > 0) {
					return initial;
				}
				await reloadProjectSourcesTab(client, projectId);
				return await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async downloadProjectFile(
			projectId: string,
			fileId: string,
			destPath: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "renavigation");
			const debugContext = resolveChatgptRecoveryDebugContext(
				options,
				"chatgpt-download-project-file",
				{
					projectId,
					fileId,
				},
			);
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptProjectSourcesUrl(projectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await downloadChatgptProjectFileWithClient(
					client,
					projectId,
					fileId,
					destPath,
					debugContext,
					options,
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async deleteProjectFile(
			projectId: string,
			fileName: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(
				options,
				resolveChatgptProjectSourcesUrl(projectId),
			);
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openProjectSourcesTab(client, projectId);
				const listedFiles = await readChatgptProjectSourceFilesSettled(client);
				const matchedFileName = findChatgptProjectSourceName(listedFiles, fileName);
				let targetFileName = fileName;
				if (!matchedFileName) {
					const refreshedMatch = await assertProjectSourceStillPresent(client, projectId, fileName);
					if (!refreshedMatch) {
						return;
					}
					targetFileName = refreshedMatch;
				} else {
					targetFileName = matchedFileName;
				}
				const deletionFileName = targetFileName;
				const selector = await tagChatgptProjectSourceAction(client, targetFileName);
				await withUiDiagnostics(
					client.Runtime,
					async () => {
						const removed = await openAndSelectMenuItem(client.Runtime, {
							trigger: {
								selector,
								interactionStrategies: ["pointer", "keyboard-space", "keyboard-arrowdown"],
								requireVisible: true,
								timeoutMs: 3_000,
							},
							itemMatch: { exact: [CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL] },
							menuSelector: '[role="menu"]',
							timeoutMs: 4_000,
							closeMenuAfter: true,
						});
						if (!removed) {
							throw new Error(`ChatGPT source actions menu did not remove "${deletionFileName}"`);
						}
					},
					{
						label: "chatgpt-remove-project-source",
						candidateSelectors: [
							CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR,
							'[role="menu"]',
							'[role="menuitem"]',
						],
						context: {
							projectId,
							fileName,
						},
					},
				);
				let removal = await waitForPredicate(
					client.Runtime,
					buildProjectSourceRemovedExpression(targetFileName),
					{
						timeoutMs: 4_000,
						description: `ChatGPT project source removed: ${targetFileName}`,
					},
				);
				if (!removal.ok) {
					await confirmChatgptProjectSourceRemovalIfPresent(client, targetFileName);
					removal = await waitForPredicate(
						client.Runtime,
						buildProjectSourceRemovedExpression(targetFileName),
						{
							timeoutMs: 8_000,
							description: `ChatGPT project source removed after confirmation: ${targetFileName}`,
						},
					);
				}
				if (!removal.ok) {
					throw new Error(
						`ChatGPT project source "${targetFileName}" did not disappear after removal`,
					);
				}
				await waitForProjectSourcePersistence(client, projectId, targetFileName, {
					shouldExist: false,
					timeoutMs: 20_000,
					initialDelayMs: 1_500,
					pollDelayMs: 1_500,
					fallbackExpression: buildProjectSourceRemovedExpression(targetFileName),
				});
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async updateProjectInstructions(
			projectId: string,
			instructions: string,
			options?: BrowserProviderListOptions,
			modelLabel?: string,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			if (typeof modelLabel === "string" && modelLabel.trim().length > 0) {
				throw new Error("ChatGPT project instructions model selection is not supported");
			}
			const connection = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await applyProjectSettings(client, projectId, { instructions });
				await waitForProjectSettingsApplied(client, projectId, { instructions });
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async getProjectInstructions(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<{ text: string; model?: string | null }> {
			await beforeChatgptBrowserInteraction(options, "renavigation");
			const connection = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openProjectSettingsPanel(client, projectId);
				const snapshot = await readProjectSettingsSnapshot(client);
				return { text: snapshot.text, model: null };
			} finally {
				await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS).catch(() => undefined);
				await closeChatgptTabConnection(connection, options);
			}
		},
		async renameProject(
			projectId: string,
			newTitle: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await applyProjectSettings(client, projectId, { name: newTitle });
				await waitForProjectSettingsApplied(client, projectId, { name: newTitle });
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async selectRemoveProjectItem(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				await openProjectSettingsPanel(client, projectId);
				const settingsRootSelector = await tagProjectSettingsDialog(client, {
					name: true,
					instructions: true,
				});
				await withUiDiagnostics(
					client.Runtime,
					async () => {
						const pressed = await pressButton(client.Runtime, {
							match: { exact: [CHATGPT_PROJECT_DELETE_BUTTON_LABEL] },
							rootSelectors: [settingsRootSelector],
							requireVisible: true,
							timeoutMs: 5000,
						});
						if (!pressed.ok) {
							throw new Error(pressed.reason || "ChatGPT delete project button not found");
						}
						const confirmation = await waitForPredicate(
							client.Runtime,
							buildProjectDeleteConfirmationExpression(),
							{
								timeoutMs: 5_000,
								description: "ChatGPT project delete confirmation ready",
							},
						);
						if (!confirmation.ok) {
							throw new Error("ChatGPT delete confirmation did not open");
						}
					},
					{
						label: "chatgpt-select-remove-project-item",
						rootSelectors: [settingsRootSelector],
						candidateSelectors: ["button", '[role="dialog"]'],
						context: {
							projectId,
							settingsRootSelector,
						},
					},
				);
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
		async pushProjectRemoveConfirmation(
			projectId: string,
			options?: BrowserProviderListOptions,
		): Promise<void> {
			await beforeChatgptBrowserInteraction(options, "upload-submit");
			const connection = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
			const { client } = connection;
			try {
				await assertChatgptExpectedIdentity(client, options);
				const pressDeleteConfirmation = async (): Promise<
					{ ok?: boolean; reason?: string } | undefined
				> => {
					const { result } = await client.Runtime.evaluate({
						expression: `(() => {
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const deleteDialogLabel = normalize(${JSON.stringify(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)});
              const deleteButtonLabel = normalize(${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)});
              const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
              for (const dialog of dialogs) {
                const text = normalize(dialog.textContent || '');
                if (!text.includes(deleteDialogLabel)) continue;
                const button = Array.from(dialog.querySelectorAll('button'))
                  .find((node) => normalize(node.getAttribute('aria-label') || node.textContent || '') === deleteButtonLabel);
                if (!button) {
                  return { ok: false, reason: 'delete-button-missing' };
                }
                button.click();
                return { ok: true };
              }
              return { ok: false, reason: 'confirmation-dialog-missing' };
            })()`,
						returnByValue: true,
					});
					return result?.value as { ok?: boolean; reason?: string } | undefined;
				};
				let pressed = await pressDeleteConfirmation();
				if (!pressed?.ok && pressed?.reason === "confirmation-dialog-missing") {
					await openProjectSettingsPanel(client, projectId);
					const settingsRootSelector = await tagProjectSettingsDialog(client, {
						name: true,
						instructions: true,
					});
					const deletePressed = await pressButton(client.Runtime, {
						match: { exact: [CHATGPT_PROJECT_DELETE_BUTTON_LABEL] },
						rootSelectors: [settingsRootSelector],
						requireVisible: true,
						timeoutMs: 5000,
					});
					if (!deletePressed.ok) {
						throw new Error(deletePressed.reason || "ChatGPT delete project button not found");
					}
					const confirmation = await waitForPredicate(
						client.Runtime,
						buildProjectDeleteConfirmationExpression(),
						{
							timeoutMs: 5_000,
							description: "ChatGPT project delete confirmation ready",
						},
					);
					if (!confirmation.ok) {
						throw new Error("confirmation-dialog-missing");
					}
					pressed = await pressDeleteConfirmation();
				}
				if (!pressed?.ok) {
					throw new Error(pressed?.reason || "ChatGPT delete confirmation button not found");
				}
				const leftProject = await waitForPredicate(
					client.Runtime,
					`(() => {
            const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
            return !match || match[1] !== ${JSON.stringify(projectId)} ? { href: location.href } : null;
          })()`,
					{
						timeoutMs: 10_000,
						description: `ChatGPT project ${projectId} deleted`,
					},
				);
				if (leftProject.ok) {
					return;
				}
				await navigateAndSettle(client, {
					url: CHATGPT_HOME_URL,
					timeoutMs: 10_000,
					routeExpression: `(() => {
            try {
              const parsed = new URL(location.href);
              return parsed.origin === ${JSON.stringify(CHATGPT_HOME_LOCATION.origin)} &&
                parsed.pathname === ${JSON.stringify(CHATGPT_HOME_LOCATION.pathname)}
                ? { href: location.href }
                : null;
            } catch {
              return null;
            }
          })()`,
					routeDescription: "ChatGPT home route ready after project delete",
					mutationAudit: resolveMutationAudit(client),
					mutationSource: resolveMutationSource(
						client,
						"provider:chatgpt",
						"post-delete-home-route",
					),
				});
				await ensureChatgptSidebarOpen(client);
				const remainingProjects = await scrapeChatgptProjects(client);
				if (
					remainingProjects.some((project) => normalizeChatgptProjectId(project.id) === projectId)
				) {
					throw new Error("ChatGPT project delete did not leave the deleted project page");
				}
			} finally {
				await closeChatgptTabConnection(connection, options);
			}
		},
	};
}
