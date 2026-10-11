import CDP from "chrome-remote-interface";
import { STOP_BUTTON_SELECTOR } from "./constants.js";

export type ChatgptTabActivity = "active" | "inactive" | "unknown";

/** Read-only, bounded guard for cleanup of externally submitted responses. */
export async function probeChatgptTabActivity(
	endpoint: { host: string; port: number },
	targetId: string,
): Promise<ChatgptTabActivity> {
	let client: Awaited<ReturnType<typeof CDP>> | undefined;
	let expired = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const work = (async (): Promise<ChatgptTabActivity> => {
		try {
			client = await CDP({ host: endpoint.host, port: endpoint.port, target: targetId });
			if (expired) {
				await client.close();
				return "unknown";
			}
			const expression = `(()=>{if(location.hostname!=='chatgpt.com')return 'inactive';if(document.readyState!=='complete')return 'unknown';const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;const buttons=[...document.querySelectorAll('button')].filter(visible);if(visible(document.querySelector(${JSON.stringify(STOP_BUTTON_SELECTOR)}))||buttons.some(e=>/^(Stop|Stop generating|Stop streaming|Cancel response)$/i.test(e.getAttribute('aria-label')||''))||buttons.some(e=>/^(Allow once|Always allow|Allow)$/.test(e.innerText.trim())))return 'active';const editor=document.querySelector('[contenteditable="true"]');return visible(editor)&&editor.getAttribute('aria-disabled')!=='true'?'inactive':'unknown';})()`;
			const result = await client.Runtime.evaluate({ expression, returnByValue: true });
			const value = result.result.value;
			return ["active", "inactive"].includes(value) ? value : "unknown";
		} catch {
			return "unknown";
		}
	})();
	try {
		return await Promise.race([
			work,
			new Promise<ChatgptTabActivity>((resolve) => {
				timer = setTimeout(() => {
					expired = true;
					resolve("unknown");
				}, 5000);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
		if (client) {
			let closeTimer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					client.close().catch(() => {}),
					new Promise<void>((resolve) => {
						closeTimer = setTimeout(resolve, 1000);
					}),
				]);
			} finally {
				if (closeTimer) clearTimeout(closeTimer);
			}
		}
	}
}

export async function requireInactiveChatgptTab(
	endpoint: { host: string; port: number },
	targetId: string,
	probe = probeChatgptTabActivity,
): Promise<void> {
	const activity = await probe(endpoint, targetId);
	if (activity !== "inactive")
		throw new Error(`tab-retirement-deferred: provider-activity-${activity}`);
}
