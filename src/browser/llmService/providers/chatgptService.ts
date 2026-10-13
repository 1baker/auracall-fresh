import { randomUUID } from "node:crypto";
import type { ResolvedUserConfig } from "../../../config.js";
import { runConfiguredChatgptUtilityOperation } from "../../configuredChatgptUtilityAffinity.js";
import { resolveChatgptConversationUrl } from "../../providers/chatgptAdapter.js";
import type { Conversation, Project } from "../../providers/domain.js";
import { getProvider } from "../../providers/index.js";
import { providerNavigationAllowed } from "../../providers/navigationPolicy.js";
import type { BrowserProviderListOptions, ProviderUserIdentity } from "../../providers/types.js";
import {
	type BrowserProcessOwnerAttribution,
	BrowserService,
} from "../../service/browserService.js";
import { LlmService } from "../llmService.js";
import type { IdentityPrompt, LlmServiceAdapter } from "../types.js";

export class ChatgptService extends LlmService {
	private readonly utilityAffinityId: string;
	private readonly runUtilityOperation: typeof runConfiguredChatgptUtilityOperation;

	private constructor(
		userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		browserService: BrowserService,
		options?: {
			identityPrompt?: IdentityPrompt;
			runUtilityOperation?: typeof runConfiguredChatgptUtilityOperation;
			utilityAffinityId?: string;
		},
	) {
		super(userConfig, provider, browserService, options);
		this.runUtilityOperation = options?.runUtilityOperation ?? runConfiguredChatgptUtilityOperation;
		this.utilityAffinityId =
			options?.utilityAffinityId?.trim() || `chatgpt-service-${randomUUID()}`;
	}

	static create(
		userConfig: ResolvedUserConfig,
		options?: {
			identityPrompt?: IdentityPrompt;
			browserProcessOwner?: BrowserProcessOwnerAttribution;
			browserService?: BrowserService;
			runUtilityOperation?: typeof runConfiguredChatgptUtilityOperation;
			utilityAffinityId?: string;
		},
	): ChatgptService {
		const provider = getProvider("chatgpt") as LlmServiceAdapter;
		const browserService =
			options?.browserService ??
			BrowserService.fromConfig(userConfig, "chatgpt", {
				browserProcessOwner: options?.browserProcessOwner,
			});
		return new ChatgptService(userConfig, provider, browserService, options);
	}

	private async runWithUtilityAffinity<TResult>(
		options: BrowserProviderListOptions | undefined,
		run: (exactOptions: BrowserProviderListOptions) => Promise<TResult>,
	): Promise<TResult> {
		if (options?.tabTargetId) {
			const exactOptions = await this.buildListOptions(options, { ensurePort: false });
			try {
				return await run(exactOptions);
			} finally {
				if (options.useProviderSession === true) {
					options.providerSession = exactOptions.providerSession;
				}
			}
		}
		return (await this.runUtilityOperation({
			userConfig: this.getResolvedUserConfig(),
			browserService: this.getBrowserService(),
			utilityId: this.utilityAffinityId,
			options,
			mutability: "read-only",
			buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
			run,
		})) as TResult;
	}

	private async runWithUtilityMutationAffinity<TResult>(
		options: BrowserProviderListOptions | undefined,
		run: (exactOptions: BrowserProviderListOptions) => Promise<TResult>,
	): Promise<TResult> {
		if (options?.tabTargetId) {
			return run(await this.buildListOptions(options, { ensurePort: false }));
		}
		return (await this.runUtilityOperation({
			userConfig: this.getResolvedUserConfig(),
			browserService: this.getBrowserService(),
			utilityId: this.utilityAffinityId,
			options,
			mutability: "provider-mutating",
			buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
			run,
		})) as TResult;
	}

	private usesUtilityAffinity(): boolean {
		return this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity";
	}

	override runUtilityBrowserOperation<TResult>(input: {
		options?: BrowserProviderListOptions;
		mutability: "read-only" | "provider-mutating";
		run: (options: BrowserProviderListOptions) => Promise<TResult>;
	}): Promise<TResult> {
		if (!this.usesUtilityAffinity()) return super.runUtilityBrowserOperation(input);
		return input.mutability === "provider-mutating"
			? this.runWithUtilityMutationAffinity(input.options, input.run)
			: this.runWithUtilityAffinity(input.options, input.run);
	}

	async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
		if (!this.provider.listProjects) {
			return [];
		}
		if (this.usesUtilityAffinity()) {
			return this.runWithUtilityAffinity(
				options,
				(exactOptions) => this.provider.listProjects?.(exactOptions) as Promise<Project[]>,
			);
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		return (await this.withRetry(
			() => this.provider.listProjects?.(listOptions) as Promise<Project[]>,
			{ action: "listProjects" },
		)) as Project[];
	}

	async listConversations(
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<Conversation[]> {
		if (!this.provider.listConversations) {
			return [];
		}
		if (this.usesUtilityAffinity()) {
			return this.runWithUtilityAffinity(
				options,
				(exactOptions) =>
					this.provider.listConversations?.(
						projectId,
						this.scopeConversationListOptions(exactOptions, projectId),
					) as Promise<Conversation[]>,
			);
		}
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options, { ensurePort: true }),
			projectId,
		);
		return (await this.withRetry(
			() => this.provider.listConversations?.(projectId, listOptions) as Promise<Conversation[]>,
			{ action: "listConversations" },
		)) as Conversation[];
	}

	async renameConversation(
		conversationId: string,
		newTitle: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void> {
		if (!this.provider.renameConversation) {
			throw new Error(`Rename is not supported for ${this.providerId}.`);
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			await this.runUtilityOperation({
				userConfig: this.getResolvedUserConfig(),
				browserService: this.getBrowserService(),
				utilityId: this.utilityAffinityId,
				options,
				mutability: "provider-mutating",
				buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
				run: (exactOptions) =>
					this.provider.renameConversation?.(
						conversationId,
						newTitle,
						projectId,
						exactOptions,
					) as Promise<void>,
			});
			return;
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.renameConversation?.(
					conversationId,
					newTitle,
					projectId,
					listOptions,
				) as Promise<void>,
			{ action: "renameConversation" },
		);
	}

	async deleteConversation(
		conversationId: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void> {
		if (!this.provider.deleteConversation) {
			throw new Error(`Delete is not supported for ${this.providerId}.`);
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			await this.runUtilityOperation({
				userConfig: this.getResolvedUserConfig(),
				browserService: this.getBrowserService(),
				utilityId: this.utilityAffinityId,
				options,
				mutability: "provider-mutating",
				buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
				run: (exactOptions) =>
					this.provider.deleteConversation?.(
						conversationId,
						projectId,
						exactOptions,
					) as Promise<void>,
			});
			return;
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.deleteConversation?.(conversationId, projectId, listOptions) as Promise<void>,
			{ action: "deleteConversation" },
		);
	}

	async getUserIdentity(
		options?: BrowserProviderListOptions,
	): Promise<ProviderUserIdentity | null> {
		if (this.usesUtilityAffinity() && this.provider.getUserIdentity) {
			return this.runWithUtilityAffinity(
				options,
				async (exactOptions) => (await this.getProviderSessionProof(exactOptions)).observation,
			);
		}
		return (await this.getProviderSessionProof(options)).observation;
	}

	override renameProject(
		projectId: string,
		newTitle: string,
		options?: Parameters<LlmService["renameProject"]>[2],
	): ReturnType<LlmService["renameProject"]> {
		if (!this.usesUtilityAffinity()) return super.renameProject(projectId, newTitle, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.renameProject(projectId, newTitle, { ...options, listOptions }),
		);
	}

	override cloneProject(
		projectId: string,
		options?: Parameters<LlmService["cloneProject"]>[1],
	): ReturnType<LlmService["cloneProject"]> {
		if (!this.usesUtilityAffinity()) return super.cloneProject(projectId, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.cloneProject(projectId, { ...options, listOptions }),
		);
	}

	override createProject(
		input: Parameters<LlmService["createProject"]>[0],
		options?: Parameters<LlmService["createProject"]>[1],
	): ReturnType<LlmService["createProject"]> {
		if (!this.usesUtilityAffinity()) return super.createProject(input, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.createProject(input, { ...options, listOptions }),
		);
	}

	override updateProjectInstructions(
		projectId: string,
		instructions: string,
		options?: Parameters<LlmService["updateProjectInstructions"]>[2],
	): ReturnType<LlmService["updateProjectInstructions"]> {
		if (!this.usesUtilityAffinity()) {
			return super.updateProjectInstructions(projectId, instructions, options);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.updateProjectInstructions(projectId, instructions, { ...options, listOptions }),
		);
	}

	override getProjectInstructions(
		projectId: string,
		options?: Parameters<LlmService["getProjectInstructions"]>[1],
	): ReturnType<LlmService["getProjectInstructions"]> {
		if (!this.usesUtilityAffinity()) return super.getProjectInstructions(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.getProjectInstructions(projectId, { ...options, listOptions }),
		);
	}

	override ensureValidProjectUrl(
		projectId: string,
		options?: Parameters<LlmService["ensureValidProjectUrl"]>[1],
	): ReturnType<LlmService["ensureValidProjectUrl"]> {
		if (!this.usesUtilityAffinity()) return super.ensureValidProjectUrl(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.ensureValidProjectUrl(projectId, { ...options, listOptions }),
		);
	}

	override ensureValidConversationUrl(
		conversationId: string,
		options?: Parameters<LlmService["ensureValidConversationUrl"]>[1],
	): ReturnType<LlmService["ensureValidConversationUrl"]> {
		if (!this.usesUtilityAffinity()) {
			return super.ensureValidConversationUrl(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.ensureValidConversationUrl(conversationId, { ...options, listOptions }),
		);
	}

	override openProjectMenu(
		projectId: string,
		options?: Parameters<LlmService["openProjectMenu"]>[1],
	): ReturnType<LlmService["openProjectMenu"]> {
		if (!this.usesUtilityAffinity()) return super.openProjectMenu(projectId, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.openProjectMenu(projectId, { ...options, listOptions }),
		);
	}

	override selectRenameProjectItem(
		projectId: string,
		options?: Parameters<LlmService["selectRenameProjectItem"]>[1],
	): ReturnType<LlmService["selectRenameProjectItem"]> {
		if (!this.usesUtilityAffinity()) return super.selectRenameProjectItem(projectId, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.selectRenameProjectItem(projectId, { ...options, listOptions }),
		);
	}

	override selectCloneProjectItem(
		projectId: string,
		options?: Parameters<LlmService["selectCloneProjectItem"]>[1],
	): ReturnType<LlmService["selectCloneProjectItem"]> {
		if (!this.usesUtilityAffinity()) return super.selectCloneProjectItem(projectId, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.selectCloneProjectItem(projectId, { ...options, listOptions }),
		);
	}

	override selectRemoveProjectItem(
		projectId: string,
		options?: Parameters<LlmService["selectRemoveProjectItem"]>[1],
	): ReturnType<LlmService["selectRemoveProjectItem"]> {
		if (!this.usesUtilityAffinity()) return super.selectRemoveProjectItem(projectId, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.selectRemoveProjectItem(projectId, { ...options, listOptions }),
		);
	}

	override pushProjectRemoveConfirmation(
		projectId: string,
		options?: Parameters<LlmService["pushProjectRemoveConfirmation"]>[1],
	): ReturnType<LlmService["pushProjectRemoveConfirmation"]> {
		if (!this.usesUtilityAffinity()) {
			return super.pushProjectRemoveConfirmation(projectId, options);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.pushProjectRemoveConfirmation(projectId, { ...options, listOptions }),
		);
	}

	override openCreateProjectModal(
		options?: Parameters<LlmService["openCreateProjectModal"]>[0],
	): ReturnType<LlmService["openCreateProjectModal"]> {
		if (!this.usesUtilityAffinity()) return super.openCreateProjectModal(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.openCreateProjectModal({ ...options, listOptions }),
		);
	}

	override setCreateProjectFields(
		fields: Parameters<LlmService["setCreateProjectFields"]>[0],
		options?: Parameters<LlmService["setCreateProjectFields"]>[1],
	): ReturnType<LlmService["setCreateProjectFields"]> {
		if (!this.usesUtilityAffinity()) return super.setCreateProjectFields(fields, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.setCreateProjectFields(fields, { ...options, listOptions }),
		);
	}

	override clickCreateProjectNext(
		options?: Parameters<LlmService["clickCreateProjectNext"]>[0],
	): ReturnType<LlmService["clickCreateProjectNext"]> {
		if (!this.usesUtilityAffinity()) return super.clickCreateProjectNext(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickCreateProjectNext({ ...options, listOptions }),
		);
	}

	override clickCreateProjectAttach(
		options?: Parameters<LlmService["clickCreateProjectAttach"]>[0],
	): ReturnType<LlmService["clickCreateProjectAttach"]> {
		if (!this.usesUtilityAffinity()) return super.clickCreateProjectAttach(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickCreateProjectAttach({ ...options, listOptions }),
		);
	}

	override clickCreateProjectUploadFile(
		options?: Parameters<LlmService["clickCreateProjectUploadFile"]>[0],
	): ReturnType<LlmService["clickCreateProjectUploadFile"]> {
		if (!this.usesUtilityAffinity()) return super.clickCreateProjectUploadFile(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickCreateProjectUploadFile({ ...options, listOptions }),
		);
	}

	override uploadCreateProjectFiles(
		paths: string[],
		options?: Parameters<LlmService["uploadCreateProjectFiles"]>[1],
	): ReturnType<LlmService["uploadCreateProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.uploadCreateProjectFiles(paths, options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.uploadCreateProjectFiles(paths, { ...options, listOptions }),
		);
	}

	override clickCreateProjectConfirm(
		options?: Parameters<LlmService["clickCreateProjectConfirm"]>[0],
	): ReturnType<LlmService["clickCreateProjectConfirm"]> {
		if (!this.usesUtilityAffinity()) return super.clickCreateProjectConfirm(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickCreateProjectConfirm({ ...options, listOptions }),
		);
	}

	override toggleProjectSidebar(
		options?: Parameters<LlmService["toggleProjectSidebar"]>[0],
	): ReturnType<LlmService["toggleProjectSidebar"]> {
		if (!this.usesUtilityAffinity()) return super.toggleProjectSidebar(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.toggleProjectSidebar({ ...options, listOptions }),
		);
	}

	override toggleMainSidebar(
		options?: Parameters<LlmService["toggleMainSidebar"]>[0],
	): ReturnType<LlmService["toggleMainSidebar"]> {
		if (!this.usesUtilityAffinity()) return super.toggleMainSidebar(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.toggleMainSidebar({ ...options, listOptions }),
		);
	}

	override clickHistoryItem(
		options?: Parameters<LlmService["clickHistoryItem"]>[0],
	): ReturnType<LlmService["clickHistoryItem"]> {
		if (!this.usesUtilityAffinity()) return super.clickHistoryItem(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickHistoryItem({ ...options, listOptions }),
		);
	}

	override clickHistorySeeAll(
		options?: Parameters<LlmService["clickHistorySeeAll"]>[0],
	): ReturnType<LlmService["clickHistorySeeAll"]> {
		if (!this.usesUtilityAffinity()) return super.clickHistorySeeAll(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickHistorySeeAll({ ...options, listOptions }),
		);
	}

	override clickChatArea(
		options?: Parameters<LlmService["clickChatArea"]>[0],
	): ReturnType<LlmService["clickChatArea"]> {
		if (!this.usesUtilityAffinity()) return super.clickChatArea(options);
		return this.runWithUtilityMutationAffinity(options?.listOptions, (listOptions) =>
			super.clickChatArea({ ...options, listOptions }),
		);
	}

	override listProjectFiles(
		projectId: string,
		options?: Parameters<LlmService["listProjectFiles"]>[1],
	): ReturnType<LlmService["listProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listProjectFiles(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listProjectFiles(projectId, { ...options, listOptions }),
		);
	}

	override uploadProjectFiles(
		projectId: string,
		paths: string[],
		options?: Parameters<LlmService["uploadProjectFiles"]>[2],
	): ReturnType<LlmService["uploadProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.uploadProjectFiles(projectId, paths, options);
		if (!this.provider.uploadProjectFiles) {
			throw new Error(`Project file upload is not supported for ${this.providerId}.`);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, async (listOptions) => {
			await this.provider.uploadProjectFiles?.(projectId, paths, listOptions);
			await this.listProjectFiles(projectId, { listOptions });
		});
	}

	override deleteProjectFile(
		projectId: string,
		fileName: string,
		options?: Parameters<LlmService["deleteProjectFile"]>[2],
	): ReturnType<LlmService["deleteProjectFile"]> {
		if (!this.usesUtilityAffinity()) return super.deleteProjectFile(projectId, fileName, options);
		if (!this.provider.deleteProjectFile) {
			throw new Error(`Project file deletion is not supported for ${this.providerId}.`);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, async (listOptions) => {
			await this.provider.deleteProjectFile?.(projectId, fileName, listOptions);
			await this.listProjectFiles(projectId, { listOptions });
		});
	}

	override materializeProjectFiles(
		projectId: string,
		options?: Parameters<LlmService["materializeProjectFiles"]>[1],
	): ReturnType<LlmService["materializeProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.materializeProjectFiles(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeProjectFiles(projectId, { ...options, listOptions }),
		);
	}

	override listAccountFiles(
		options?: Parameters<LlmService["listAccountFiles"]>[0],
	): ReturnType<LlmService["listAccountFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listAccountFiles(options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listAccountFiles({ ...options, listOptions }),
		);
	}

	override uploadAccountFiles(
		paths: string[],
		options?: Parameters<LlmService["uploadAccountFiles"]>[1],
	): ReturnType<LlmService["uploadAccountFiles"]> {
		if (!this.usesUtilityAffinity()) return super.uploadAccountFiles(paths, options);
		if (!this.provider.uploadAccountFiles) {
			throw new Error(`Account file upload is not supported for ${this.providerId}.`);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, async (listOptions) => {
			await this.provider.uploadAccountFiles?.(paths, listOptions);
			await this.listAccountFiles({ listOptions });
		});
	}

	override deleteAccountFile(
		fileId: string,
		options?: Parameters<LlmService["deleteAccountFile"]>[1],
	): ReturnType<LlmService["deleteAccountFile"]> {
		if (!this.usesUtilityAffinity()) return super.deleteAccountFile(fileId, options);
		if (!this.provider.deleteAccountFile) {
			throw new Error(`Account file deletion is not supported for ${this.providerId}.`);
		}
		return this.runWithUtilityMutationAffinity(options?.listOptions, async (listOptions) => {
			await this.provider.deleteAccountFile?.(fileId, listOptions);
			await this.listAccountFiles({ listOptions });
		});
	}

	override downloadAccountFile(
		fileId: string,
		destPath: string,
		options?: Parameters<LlmService["downloadAccountFile"]>[2],
	): ReturnType<LlmService["downloadAccountFile"]> {
		if (!this.usesUtilityAffinity()) return super.downloadAccountFile(fileId, destPath, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.downloadAccountFile(fileId, destPath, { ...options, listOptions }),
		);
	}

	override materializeAccountFiles(
		options?: Parameters<LlmService["materializeAccountFiles"]>[0],
	): ReturnType<LlmService["materializeAccountFiles"]> {
		if (!this.usesUtilityAffinity()) return super.materializeAccountFiles(options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeAccountFiles({ ...options, listOptions }),
		);
	}

	override listConversationFiles(
		conversationId: string,
		options?: Parameters<LlmService["listConversationFiles"]>[1],
	): ReturnType<LlmService["listConversationFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listConversationFiles(conversationId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listConversationFiles(conversationId, { ...options, listOptions }),
		);
	}

	override materializeConversationArtifacts(
		conversationId: string,
		options?: Parameters<LlmService["materializeConversationArtifacts"]>[1],
	): ReturnType<LlmService["materializeConversationArtifacts"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationArtifacts(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationArtifacts(conversationId, { ...options, listOptions }),
		);
	}

	override materializeConversationArtifact(
		conversationId: string,
		artifact: Parameters<LlmService["materializeConversationArtifact"]>[1],
		destDir: string,
		options?: Parameters<LlmService["materializeConversationArtifact"]>[3],
	): ReturnType<LlmService["materializeConversationArtifact"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationArtifact(conversationId, artifact, destDir, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationArtifact(conversationId, artifact, destDir, {
				...options,
				listOptions,
			}),
		);
	}

	override materializeActiveMediaArtifacts(
		input: Parameters<LlmService["materializeActiveMediaArtifacts"]>[0],
		destDir: string,
		options?: Parameters<LlmService["materializeActiveMediaArtifacts"]>[2],
	): ReturnType<LlmService["materializeActiveMediaArtifacts"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeActiveMediaArtifacts(input, destDir, options);
		}
		return this.runWithUtilityAffinity(options, (listOptions) =>
			super.materializeActiveMediaArtifacts(input, destDir, listOptions),
		);
	}

	override materializeConversationFiles(
		conversationId: string,
		options?: Parameters<LlmService["materializeConversationFiles"]>[1],
	): ReturnType<LlmService["materializeConversationFiles"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationFiles(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationFiles(conversationId, { ...options, listOptions }),
		);
	}

	override getConversationContext(
		conversationId: string,
		options?: Parameters<LlmService["getConversationContext"]>[1],
	): ReturnType<LlmService["getConversationContext"]> {
		if (!this.usesUtilityAffinity() || options?.cacheOnly) {
			return super.getConversationContext(conversationId, options);
		}
		const affinityOptions = options?.listOptions?.tabTargetId
			? options.listOptions
			: {
					...options?.listOptions,
					configuredUrl: resolveChatgptConversationUrl(conversationId, options?.projectId),
					allowNavigation: providerNavigationAllowed(options?.listOptions),
				};
		return this.runWithUtilityAffinity(affinityOptions, (listOptions) =>
			super.getConversationContext(conversationId, { ...options, listOptions }),
		);
	}
}
