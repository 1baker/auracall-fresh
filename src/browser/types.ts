import type * as BaseTypes from '../../packages/browser-service/src/types.js';
import type { ResolvedUserConfig } from '../config.js';
import type { LibraryFileAttachmentReceipt, LibraryFileSelector } from './libraryFiles.js';
import type { ProviderSessionAuthorization } from './providers/providerSessionAuthority.js';
import type { ChatgptComposerCapabilityReceipt } from './actions/chatgptComposerTool.js';

export type {
  ChromeClient,
  CookieParam,
  BrowserLogger,
  BrowserAttachment,
  DebugPortStrategy,
  BrowserProfileFamily,
  AgentBrowserBuild,
  AgentBrowserRdpConfig,
  RemoteViewDesktopConfig,
} from '../../packages/browser-service/src/types.js';

export type BrowserModelStrategy = 'select' | 'current' | 'ignore';
export type ChatgptComposerMode = 'chat' | 'work';
export type ChatgptToolApprovalPolicy = 'manual' | 'allow-once' | 'always-allow';
export type ThinkingTimeLevel = 'light' | 'standard' | 'extended' | 'heavy';
export type ChatgptDeepResearchPlanAction = 'start' | 'edit';
export type BrowserPassiveObservationState =
  | 'thinking'
  | 'response-incoming'
  | 'response-complete'
  | 'plan-ready'
  | 'research-started'
  | 'provider-error'
  | 'login-required'
  | 'captcha-or-human-verification'
  | 'awaiting-human';

export interface BrowserPassiveObservation {
  state: BrowserPassiveObservationState;
  source: 'provider-adapter' | 'browser-service';
  observedAt: string;
  evidenceRef?: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface BrowserRuntimeEvidence {
  observation: BrowserPassiveObservation;
  runtime?: BrowserRuntimeMetadata | null;
}

type LlmBrowserFields = {
  selectedAgentId?: string | null;
  target?: 'chatgpt' | 'gemini' | 'grok';
  auracallProfileName?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  chatgptUrl?: string | null;
  desiredModel?: string | null;
  chatgptMode?: ChatgptComposerMode;
  chatgptToolApproval?: ChatgptToolApprovalPolicy;
  workModel?: string | null;
  modelStrategy?: BrowserModelStrategy;
  thinkingTime?: ThinkingTimeLevel;
  composerTool?: string | null;
  deepResearchPlanAction?: ChatgptDeepResearchPlanAction;
  providerSessionAuthorization?: ProviderSessionAuthorization;
};

export type BrowserRuntimeMetadata = BaseTypes.BrowserRuntimeMetadata & {
  selectedAgentId?: string | null;
  conversationId?: string;
  observedModel?: string | null;
  composerTool?: string | null;
  composerCapability?: ChatgptComposerCapabilityReceipt;
  thinkingTime?: string;
  chatgptProMode?: string;
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
  chatgptDeepResearchStage?: string;
  chatgptDeepResearchPlanAction?: string;
  chatgptDeepResearchStartMethod?: string | null;
  chatgptDeepResearchStartLabel?: string | null;
  chatgptDeepResearchModifyPlanLabel?: string | null;
  chatgptDeepResearchModifyPlanVisible?: boolean;
  chatgptDeepResearchReviewEvidence?: Record<string, unknown> | null;
};

type BrowserBlockingProfileAction =
  | BaseTypes.BrowserAutomationConfig['blockingProfileAction']
  | 'restart-auracall';

export type BrowserSessionConfig = Omit<BaseTypes.BrowserSessionConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserAutomationConfig = Omit<BaseTypes.BrowserAutomationConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserRunOptions = Omit<BaseTypes.BrowserRunOptions, 'config' | 'runtimeHintCb'> & {
  config?: BrowserAutomationConfig;
  /** Internally provisioned exact target. Never falls back to generic tab selection. */
  tabAffinity?: { host: string; port: number; targetId: string };
  /** Full profile-resolved configuration required to construct durable affinity state. */
  tabAffinityUserConfig?: ResolvedUserConfig;
  /** Exact leased provider traffic authority carried by affinity execution. */
  providerTrafficGovernor?: import('../../packages/browser-service/src/service/providerTrafficGovernor.js').ProviderTrafficGovernor;
  ecosystemMention?: import('./actions/chatgptEcosystemMention.js').ChatgptEcosystemMentionRequest;
  libraryFiles?: LibraryFileSelector[];
  onProviderEffectState?: (state: 'pre_effect' | 'unknown' | 'effect_observed') => void;
  runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
  runtimeEvidenceCb?: (evidence: BrowserRuntimeEvidence) => void | Promise<void>;
};

export type BrowserRunResult = BaseTypes.BrowserRunResult & {
  chromeTargetId?: string | null;
  conversationId?: string;
  observedModel?: string | null;
  composerTool?: string | null;
  composerCapability?: ChatgptComposerCapabilityReceipt;
  thinkingTime?: string;
  chatgptProMode?: string;
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
  chatgptDeepResearchStage?: string;
  chatgptDeepResearchPlanAction?: string;
  chatgptDeepResearchStartMethod?: string | null;
  chatgptDeepResearchStartLabel?: string | null;
  chatgptDeepResearchModifyPlanLabel?: string | null;
  chatgptDeepResearchModifyPlanVisible?: boolean;
  chatgptDeepResearchReviewEvidence?: Record<string, unknown> | null;
  passiveObservations?: BrowserPassiveObservation[];
  libraryFiles?: LibraryFileAttachmentReceipt;
};

export type ResolvedBrowserConfig = BaseTypes.ResolvedBrowserConfig & LlmBrowserFields;
