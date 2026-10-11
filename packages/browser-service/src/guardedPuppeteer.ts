import puppeteer, { type ConnectOptions, type ConnectionTransport } from 'puppeteer-core';
import WebSocket from 'ws';
import { resolveCdpCommandAdmission, type CdpCommandAdmission } from './guardedCdp.js';

/** Admission lasts through the protocol reply, including flattened session commands. */
export class AdmittedPuppeteerTransport implements ConnectionTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;
  private readonly pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  constructor(private readonly socket: WebSocket, private readonly admission: CdpCommandAdmission) {
    socket.on('message', data => {
      const message = data.toString();
      const reply = JSON.parse(message) as { id?: number };
      if (reply.id !== undefined) { this.pending.get(reply.id)?.resolve(); this.pending.delete(reply.id); }
      this.onmessage?.(message);
    });
    socket.on('error', () => socket.close());
    socket.on('close', () => {
      for (const item of this.pending.values()) item.reject(new Error('Desktop CDP transport closed.'));
      this.pending.clear();
      this.onclose?.();
    });
  }
  send(message: string): void {
    const command = JSON.parse(message) as { id: number; method: string; sessionId?: string };
    void this.admission.run(command.method, () => new Promise<void>((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN) { reject(new Error('Desktop CDP transport closed.')); return; }
      this.pending.set(command.id, { resolve, reject });
      this.socket.send(message, error => { if (error) { this.pending.delete(command.id); reject(error); } });
    })).catch((error: unknown) => {
      this.onmessage?.(JSON.stringify({ id: command.id, sessionId: command.sessionId,
        error: { code: -32000, message: error instanceof Error ? error.message : 'Desktop command refused.' } }));
    });
  }
  close(): void { this.socket.close(); }
}

export async function connectGuardedPuppeteer(options: ConnectOptions) {
  const address = options.browserURL ?? options.browserWSEndpoint;
  if (!address) throw new Error('An explicit browser endpoint is required.');
  const endpoint = new URL(address);
  const port = Number(endpoint.port || (['https:', 'wss:'].includes(endpoint.protocol) ? 443 : 80));
  const admission = await resolveCdpCommandAdmission({ host: endpoint.hostname, port });
  if (!admission) return puppeteer.connect(options);
  let websocket = options.browserWSEndpoint;
  if (!websocket) {
    const response = await fetch(new URL('/json/version', endpoint), { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Desktop CDP discovery failed.');
    websocket = (await response.json() as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl;
  }
  if (!websocket) throw new Error('Desktop CDP endpoint is missing.');
  const target = new URL(websocket);
  const canonical = (host: string) => host === 'localhost' ? '127.0.0.1' : host;
  if (!['ws:', 'wss:'].includes(target.protocol) || canonical(target.hostname) !== canonical(endpoint.hostname) ||
    Number(target.port || (target.protocol === 'wss:' ? 443 : 80)) !== port) {
    throw new Error('Desktop CDP discovery changed endpoint ownership.');
  }
  const socket = new WebSocket(websocket, { handshakeTimeout: 15000 });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const transport = new AdmittedPuppeteerTransport(socket, admission);
  const { browserURL: _url, browserWSEndpoint: _endpoint, transport: _transport, ...rest } = options;
  try { return await puppeteer.connect({ ...rest, transport }); }
  catch (error) { transport.close(); throw error; }
}
