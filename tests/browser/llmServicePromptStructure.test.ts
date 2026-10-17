import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("provider prompt architecture", () => {
	test("keeps exact developer-app mention verification and effect evidence symmetric in shared local and remote lifecycle", async () => {
		const source = await readFile("src/browser/index.ts", "utf8");
		const local = source.slice(
			source.indexOf("export async function runBrowserMode("),
			source.indexOf("async function runRemoteBrowserMode("),
		);
		const remote = source.slice(
			source.indexOf("async function runRemoteBrowserMode("),
			source.indexOf("async function runRemoteGrokBrowserMode("),
		);
		for (const lifecycle of [local, remote]) {
			expect(lifecycle).toContain("await ensureChatgptEcosystemMention(");
			const beforeSendStart = lifecycle.indexOf("beforeSend: async () => {");
			const dispatchStart = lifecycle.indexOf("onPromptDispatched:", beforeSendStart);
			expect(beforeSendStart).toBeGreaterThan(-1);
			expect(dispatchStart).toBeGreaterThan(beforeSendStart);
			const beforeSend = lifecycle.slice(beforeSendStart, dispatchStart);
			expect(beforeSend).toContain("selectedComposerMention ?? options.ecosystemMention");
			expect(beforeSend).toContain("if (ecosystemMention)");
			expect(beforeSend).toMatch(
				/await assertChatgptEcosystemMentionSelected\(\s*client as ChromeClient,\s*ecosystemMention,/,
			);
			expect(beforeSend.indexOf("await assertChatgptEcosystemMentionSelected(")).toBeLessThan(
				beforeSend.indexOf('options.onProviderEffectState?.("unknown")'),
			);
			expect(lifecycle).toContain("await assertChatgptEcosystemMentionSelected(");
			expect(lifecycle).toContain('options.onProviderEffectState?.("unknown")');
			expect(lifecycle).toContain('options.onProviderEffectState?.("effect_observed")');
			expect(lifecycle).toContain("createChatgptToolApprovalHandler(");
		}
	});
	test("keeps the common prompt lifecycle only in the LlmService base module", async () => {
		const [base, chatgpt, gemini, grok, chatgptAdapter] = await Promise.all([
			readFile("src/browser/llmService/llmService.ts", "utf8"),
			readFile("src/browser/llmService/providers/chatgptService.ts", "utf8"),
			readFile("src/browser/llmService/providers/geminiService.ts", "utf8"),
			readFile("src/browser/llmService/providers/grokService.ts", "utf8"),
			readFile("src/browser/providers/chatgptAdapter.ts", "utf8"),
		]);

		expect(base).not.toContain("runPlannedPrompt");
		expect(chatgpt).not.toContain("runBrowserMode");
		expect(chatgpt).not.toContain("serviceUserConfig");
		expect(chatgpt).not.toContain("createProgressLogger");
		for (const providerModule of [chatgpt, gemini, grok]) {
			expect(providerModule).not.toMatch(/async runPrompt\s*\(/);
		}
		const promptStart = chatgptAdapter.indexOf("async runPrompt(");
		const promptEnd = chatgptAdapter.indexOf("async getUserIdentity(", promptStart);
		const promptImplementation = chatgptAdapter.slice(promptStart, promptEnd);
		expect(promptStart).toBeGreaterThan(-1);
		expect(promptEnd).toBeGreaterThan(promptStart);
		expect(promptImplementation).not.toContain("Answer now");
		expect(promptImplementation).not.toContain("createChatgptToolApprovalHandler");
		expect(promptImplementation).not.toContain("pressButton");
	});
});
