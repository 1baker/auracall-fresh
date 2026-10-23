import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { dirname, isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";
import { stockCommand } from "./commands.js";
import { encodeNativeMessage, NativeMessageDecoder } from "./framing.js";
import { assertStockPrivatePath } from "./privatePath.js";
import {
	extensionPacketSchema,
	type StockChromeHandle,
	stockConversationUrl,
	stockHandleSchema,
} from "./protocol.js";

export interface StockHostOptions {
	extensionId: string;
	extensionOrigin: string;
	connectionFile: string;
	input: Readable;
	output: Writable;
	port?: number;
	requestTimeoutMs?: number;
}

/** Chrome launches this host. It never launches, discovers or reconnects Chrome. */
export async function startStockChromeHost(options: StockHostOptions) {
	if (
		!/^[a-p]{32}$/.test(options.extensionId) ||
		options.extensionOrigin !== `chrome-extension://${options.extensionId}/` ||
		!isAbsolute(options.connectionFile)
	)
		throw new Error("Invalid native host binding");
	const timeoutMs = options.requestTimeoutMs ?? 5000;
	if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000)
		throw new Error("Invalid request timeout");
	const sessionId = randomUUID(),
		token = randomBytes(32).toString("hex");
	const shared = new Map<string, StockChromeHandle>();
	const busy = new Set<string>(),
		uncertain = new Set<string>();
	const pending = new Map<
		string,
		{ target: string; resolve(data: Record<string, unknown>): void; reject(error: Error): void }
	>();
	let closed = false,
		wroteConnection = false;
	const send = (value: unknown) => {
		if (closed || options.output.destroyed) throw new Error("Native connection closed");
		options.output.write(encodeNativeMessage(value));
	};
	const sameToken = (authorization: string | undefined) => {
		const actual = Buffer.from(authorization ?? "");
		const expected = Buffer.from(`Bearer ${token}`);
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	};
	const dispatch = (handle: StockChromeHandle, body: Record<string, unknown>) =>
		new Promise<Record<string, unknown>>((resolve, reject) => {
			const command = stockCommand(body, handle);
			const id = randomUUID();
			const timer = setTimeout(() => {
				if (command.action !== "probe") uncertain.add(handle.targetId);
				pending.delete(id);
				reject(new Error("Native result uncertain; do not resend"));
			}, timeoutMs);
			pending.set(id, {
				target: handle.targetId,
				resolve: (data) => {
					clearTimeout(timer);
					pending.delete(id);
					resolve(data);
				},
				reject: (error) => {
					clearTimeout(timer);
					pending.delete(id);
					reject(error);
				},
			});
			try {
				send({ kind: "request", id, handle, command });
			} catch {
				uncertain.add(handle.targetId);
				pending.get(id)?.reject(new Error("Native write uncertain"));
			}
		});
	const server = createServer(async (req, res) => {
		const reply = (status: number, data?: unknown) => {
			res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
			res.end(
				JSON.stringify(
					status === 200
						? { success: true, data }
						: { success: false, error: "stock_chrome_refused" },
				),
			);
		};
		if (
			closed ||
			req.headers.origin !== undefined ||
			req.headers.host !== new URL(baseUrl).host ||
			!sameToken(req.headers.authorization)
		) {
			reply(401);
			return;
		}
		if (req.method === "GET" && req.url === "/api/service/contracts") {
			reply(200, {
				schemaVersion: "v1",
				contracts: { serviceRequest: { version: "v1", actions: ["probe", "ui_action", "press"] } },
			});
			return;
		}
		if (req.method === "GET" && req.url === "/api/stock-chrome/tabs") {
			reply(200, { sessionId, handles: [...shared.values()] });
			return;
		}
		if (
			req.method !== "POST" ||
			req.url !== "/api/service/request" ||
			req.headers["content-type"] !== "application/json"
		) {
			reply(404);
			return;
		}
		let target: string | undefined;
		try {
			const body = await readBody(req);
			const handle = stockHandleSchema.parse(body.serviceTabHandle);
			const actual = shared.get(handle.targetId);
			if (
				!actual ||
				handle.sessionName !== sessionId ||
				JSON.stringify(handle) !== JSON.stringify(actual) ||
				body.targetId !== handle.targetId ||
				body.browserId !== handle.browserId ||
				body.sessionName !== handle.sessionName ||
				body.runtimeProfile !== handle.profileId ||
				body.repairPolicy !== "reject_only" ||
				body.profileLeasePolicy !== "reject"
			)
				throw new Error("Unshared handle or unsupported policy");
			if (busy.has(handle.targetId) || (body.action !== "probe" && uncertain.has(handle.targetId)))
				throw new Error("Target busy or uncertain");
			target = handle.targetId;
			busy.add(target);
			const data = await dispatch(handle, body);
			if (
				!shared.has(target) ||
				data.ok !== true ||
				data.targetId !== target ||
				data.url !== handle.url
			)
				throw new Error("Native readback differs");
			reply(200, data);
		} catch {
			if (!res.destroyed) reply(409);
		} finally {
			if (target) busy.delete(target);
		}
	});
	server.requestTimeout = 7000;
	server.headersTimeout = 7000;
	let baseUrl = "";
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? 0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing loopback address");
	baseUrl = `http://127.0.0.1:${address.port}`;
	const connection = { version: "auracall-stock-chrome-v1", sessionId, baseUrl, token };
	const close = async () => {
		if (closed) return;
		closed = true;
		shared.clear();
		for (const item of pending.values())
			item.reject(new Error("Native connection ended; no replay"));
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		if (wroteConnection) {
			try {
				if ((await readFile(options.connectionFile, "utf8")) === JSON.stringify(connection))
					await unlink(options.connectionFile);
			} catch {}
		}
	};
	try {
		await mkdir(dirname(options.connectionFile), { recursive: true, mode: 0o700 });
		await assertStockPrivatePath(dirname(options.connectionFile));
		await writeFile(options.connectionFile, JSON.stringify(connection), {
			flag: "wx",
			mode: 0o600,
		});
		wroteConnection = true;
		await assertStockPrivatePath(options.connectionFile);
		send({ kind: "ready", sessionId });
	} catch (error) {
		await close();
		throw error;
	}
	const receive = async () => {
		const decoder = new NativeMessageDecoder();
		try {
			for await (const chunk of options.input) {
				for (const raw of decoder.push(Buffer.from(chunk))) {
					const packet = extensionPacketSchema.parse(raw);
					if (packet.kind === "shared") {
						const handle = packet.handle;
						if (
							handle.sessionName !== sessionId ||
							handle.browserId !== `stock-chrome:${sessionId}` ||
							!handle.targetId.startsWith(`${sessionId}:${handle.tabId}:`) ||
							!stockConversationUrl(handle.url) ||
							[...shared.values()].some((h) => h.tabId === handle.tabId) ||
							shared.size >= 8
						)
							throw new Error("Invalid shared tab");
						shared.set(handle.targetId, handle);
						send({ kind: "shared", targetId: handle.targetId });
					} else if (packet.kind === "revoked") {
						shared.delete(packet.targetId);
						uncertain.delete(packet.targetId);
						for (const item of pending.values())
							if (item.target === packet.targetId) item.reject(new Error("Tab share revoked"));
					} else {
						const item = pending.get(packet.id);
						if (item) {
							if (packet.success && packet.data) item.resolve(packet.data);
							else {
								uncertain.add(item.target);
								item.reject(new Error("Native action not confirmed"));
							}
						}
					}
				}
			}
			decoder.finish();
		} finally {
			await close();
		}
	};
	const done = receive();
	options.output.once("error", () => {
		void close();
	});
	return { baseUrl, sessionId, close, done };
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	const parts: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 196608) throw new Error("Request too large");
		parts.push(Buffer.from(chunk));
	}
	const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
	return body;
}
