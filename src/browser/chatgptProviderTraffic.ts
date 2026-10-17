import type { ProviderTrafficWarning } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";

type RuntimeEvaluator = {
	evaluate(input: {
		expression: string;
		returnByValue: boolean;
	}): Promise<{ result?: { value?: unknown } }>;
};

export async function probeChatgptRateLimitWarning(
	context: unknown,
): Promise<ProviderTrafficWarning | null> {
	const response = (
		context as { nativeProviderResponse?: { url?: string; status?: number } } | null
	)?.nativeProviderResponse;
	if (response?.status === 429 && typeof response.url === "string") {
		try {
			const url = new URL(response.url);
			if (
				["https://chatgpt.com", "https://chat.openai.com"].includes(url.origin) &&
				url.pathname.startsWith("/backend-api/")
			) {
				return {
					classification: "rate-limit",
					reason: "Owned ChatGPT backend response returned HTTP 429.",
				};
			}
		} catch {
			/* An invalid or foreign response is not provider evidence. */
		}
		return null;
	}
	const runtime = context as Partial<RuntimeEvaluator> | null;
	if (!runtime?.evaluate) return null;
	const evaluated = await runtime.evaluate({
		expression: `(() => {
      const visible = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],[role="alert"],[aria-live]'))
        .filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
        .map(node => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
        .find(text => /too many requests|making requests too quickly|rate limit/i.test(text));
      if (visible) return visible.slice(0, 240);
      if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null;
      const latest = new Map();
      for (const entry of performance.getEntriesByType('resource')) {
        let url;
        try { url = new URL(entry.name, location.href); } catch { continue; }
        if (url.origin !== location.origin) continue;
        if (!['/backend-api/conversations', '/backend-api/conversation'].some(path => url.pathname === path || url.pathname.startsWith(path + '/'))) continue;
        const previous = latest.get(url.pathname);
        if (!previous || entry.responseEnd >= previous.responseEnd) latest.set(url.pathname, entry);
      }
      return Array.from(latest.values()).some(entry => entry.responseStatus === 429)
        ? 'ChatGPT conversation requests returned HTTP 429.' : null;
    })()`,
		returnByValue: true,
	});
	const reason = typeof evaluated.result?.value === "string" ? evaluated.result.value.trim() : "";
	return reason ? { classification: "rate-limit", reason } : null;
}
