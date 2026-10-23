import { z } from "zod";
import { type ChromeControlApi, StockChromeController } from "../controller.js";
import { STOCK_HOST_NAME, stockCommandSchema, stockHandleSchema } from "../protocol.js";

interface ChromeEvent<T extends (...args: never[]) => unknown> {
	addListener(listener: T): void;
}
interface NativePort {
	postMessage(value: unknown): void;
	disconnect(): void;
	onMessage: ChromeEvent<(message: unknown) => void>;
	onDisconnect: ChromeEvent<() => void>;
}
interface ChromeWorkerApi extends ChromeControlApi {
	runtime: { connectNative(name: string): NativePort; lastError?: { message?: string } };
	action: {
		onClicked: ChromeEvent<(tab: { id?: number }) => void>;
		setBadgeText(options: { tabId: number; text: string }): Promise<void>;
		setTitle(options: { tabId: number; title: string }): Promise<void>;
	};
	tabs: ChromeControlApi["tabs"] & {
		onUpdated: ChromeEvent<(tabId: number, change: { url?: string; status?: string }) => void>;
		onRemoved: ChromeEvent<(tabId: number) => void>;
	};
	debugger: ChromeControlApi["debugger"] & {
		onDetach: ChromeEvent<(source: { tabId?: number }) => void>;
	};
}
declare const chrome: ChromeWorkerApi;
const requestSchema = z
	.object({
		kind: z.literal("request"),
		id: z.string().uuid(),
		handle: stockHandleSchema,
		command: stockCommandSchema,
	})
	.strict();
let port: NativePort | undefined;
let controller: StockChromeController | undefined;
let connecting: Promise<void> | undefined;
const sharedTabs = new Set<number>();
const toggling = new Set<number>();
const badge = async (tabId: number, text: string, title: string) => {
	await chrome.action.setBadgeText({ tabId, text }).catch(() => {});
	await chrome.action.setTitle({ tabId, title }).catch(() => {});
};
const revoke = async (tabId: number) => {
	const targetId = await controller?.revoke(tabId);
	sharedTabs.delete(tabId);
	if (targetId) port?.postMessage({ kind: "revoked", targetId });
	await badge(tabId, "", "Share this conversation with AuraCall");
};
function connect(): Promise<void> {
	if (controller) return Promise.resolve();
	if (connecting) return connecting;
	connecting = new Promise<void>((resolve, reject) => {
		const activePort = chrome.runtime.connectNative(STOCK_HOST_NAME);
		port = activePort;
		const timer = setTimeout(() => {
			activePort.disconnect();
			reject(new Error("Native host not ready"));
		}, 5000);
		activePort.onMessage.addListener((raw) => {
			const ready = z
				.object({ kind: z.literal("ready"), sessionId: z.string().uuid() })
				.strict()
				.safeParse(raw);
			if (ready.success && !controller) {
				controller = new StockChromeController(chrome, ready.data.sessionId);
				clearTimeout(timer);
				resolve();
				return;
			}
			const shared = z
				.object({ kind: z.literal("shared"), targetId: z.string() })
				.strict()
				.safeParse(raw);
			if (shared.success) {
				const tabId = [...sharedTabs].find(
					(id) => controller?.getHandle(id)?.targetId === shared.data.targetId,
				);
				if (tabId !== undefined)
					void badge(tabId, "ON", "AuraCall is sharing this conversation. Click to stop.");
				return;
			}
			const parsed = requestSchema.safeParse(raw);
			if (!parsed.success || !controller) {
				activePort.disconnect();
				return;
			}
			const request = parsed.data;
			void controller.execute(request.handle, request.command).then(
				(data) => activePort.postMessage({ kind: "result", id: request.id, success: true, data }),
				() => activePort.postMessage({ kind: "result", id: request.id, success: false }),
			);
		});
		activePort.onDisconnect.addListener(() => {
			void chrome.runtime.lastError;
			clearTimeout(timer);
			const previous = controller;
			controller = undefined;
			port = undefined;
			connecting = undefined;
			void previous?.close();
			for (const tabId of sharedTabs)
				void badge(tabId, "", "Connection ended; click to share again");
			sharedTabs.clear();
			reject(new Error("Native connection ended"));
		});
	});
	return connecting;
}
chrome.action.onClicked.addListener((tab) => {
	if (tab.id === undefined || toggling.has(tab.id)) return;
	const tabId = tab.id;
	toggling.add(tabId);
	void (async () => {
		try {
			if (sharedTabs.has(tabId)) {
				await revoke(tabId);
				return;
			}
			await connect();
			if (!controller || !port) throw new Error("Native host not ready");
			const handle = await controller.share(tabId);
			sharedTabs.add(tabId);
			port.postMessage({ kind: "shared", handle });
			await badge(tabId, "...", "Waiting for the local AuraCall connection to accept this tab.");
		} catch {
			await badge(
				tabId,
				"!",
				"Could not share. Open an existing ChatGPT/Grok conversation and check local setup.",
			);
		} finally {
			toggling.delete(tabId);
		}
	})();
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
	if (sharedTabs.has(tabId) && (change.url !== undefined || change.status === "loading"))
		void revoke(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
	void revoke(tabId);
});
chrome.debugger.onDetach.addListener((source) => {
	if (source.tabId !== undefined) void revoke(source.tabId);
});
